/**
 * Per-document session runtime.
 *
 * The canonical document lives here (received from, and sent to, the core
 * store in the main process). The TipTap document is the editing buffer; it is
 * not stored in Zustand and not mirrored per keystroke. Content is committed to
 * the core store on a short idle debounce; structural commands go through the
 * typed command API immediately and rebuild the editor document.
 */

import type { Editor } from '@tiptap/core';
import type { ContentNode, Document, DocumentCommand } from '@noteforest/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { ApplyResult, OpenDocumentSnapshot } from '../../../shared/api';
import { buildBlockNode, buildEditorDocument, extractBlockContents, withBody, type PMNode } from '../lib/adapter';
import { recordPerf } from '../lib/perf';
import { createSerialQueue } from '../lib/serial-queue';
import {
  ancestorPath,
  chapterIdOf,
  directChildIds,
  incomingBranch,
  parentIdOf,
  siblingIds,
} from '../lib/tree';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

export interface RestorePoint {
  scrollTop: number;
  selectedBlockId: string | null;
}

export interface ApplyOutcome {
  ok: boolean;
  message?: string;
  blockId?: string;
  chapterId?: string;
}

function withBlockLevel(node: ProseNode, topLevel: boolean, depth: number): ProseNode {
  const body = node.firstChild;
  if (body === null) {
    return node.type.create({ ...node.attrs, topLevel, depth }, node.content, node.marks);
  }
  const newBody = body.type.create(
    { ...body.attrs, topLevel, depth },
    body.content,
    body.marks,
  );
  return node.type.create(
    { ...node.attrs, topLevel, depth },
    node.content.replaceChild(0, newBody),
    node.marks,
  );
}

export class DocumentRuntime {
  readonly packagePath: string;

  readonly status: OpenDocumentSnapshot['status'];

  readonly readOnlyReason: string | undefined;

  document: Document;

  editor: Editor | null = null;

  dirty = false;

  saveState: SaveState = 'saved';

  saveError: string | null = null;

  /** Bumped for UI consumers after structural/selection/save-state changes. */
  seq = 0;

  /** Bumped only when the canonical structure changes. */
  version = 0;

  selectedBlockId: string | null = null;

  readonly collapsed = new Set<string>();

  lastStructuralAt = 0;

  lastTextAt = 0;

  /** Visible recovery message when the editor had to be rebuilt from canonical. */
  repairNotice: string | null = null;

  private readonly listeners = new Set<() => void>();

  private readonly hashes = new Map<string, string>();

  private readonly undoStack: DocumentCommand[] = [];

  private readonly redoStack: DocumentCommand[] = [];

  /** Serializes content commits and every structural command. */
  private readonly queue = createSerialQueue();

  private contentTimer: ReturnType<typeof setTimeout> | null = null;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private disposed = false;

  private restorePoint: RestorePoint | null;

  private ensuredBlocks = false;

  constructor(
    snapshot: OpenDocumentSnapshot,
    collapsed: Iterable<string>,
    restore: RestorePoint | null,
  ) {
    this.packagePath = snapshot.packagePath;
    this.status = snapshot.status;
    this.readOnlyReason = snapshot.readOnlyReason;
    this.document = snapshot.document;
    this.restorePoint = restore;
    for (const id of collapsed) this.collapsed.add(id);
    this.recomputeHashes();
  }

  get title(): string {
    return this.document.title;
  }

  get editable(): boolean {
    return this.status === 'editable';
  }

  get canUndoStructural(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedoStructural(): boolean {
    return this.redoStack.length > 0;
  }

  get restore(): RestorePoint | null {
    const point = this.restorePoint;
    this.restorePoint = null;
    return point;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  notify(): void {
    this.seq += 1;
    for (const listener of this.listeners) listener();
  }

  private setSaveState(state: SaveState, error: string | null = null): void {
    if (this.saveState === state && this.saveError === error) return;
    this.saveState = state;
    this.saveError = error;
    this.notify();
  }

  private recomputeHashes(): void {
    this.hashes.clear();
    for (const [id, block] of Object.entries(this.document.blocks)) {
      this.hashes.set(id, JSON.stringify(block.content));
    }
  }

  /** Create a first block when a chapter is empty so the schema stays valid. */
  async ensureChaptersHaveBlocks(): Promise<void> {
    if (this.ensuredBlocks || !this.editable) return;
    this.ensuredBlocks = true;
    const empty = this.document.chapters.find(
      (chapter) => chapter.topLevelBlockIds.length === 0,
    );
    if (empty === undefined) return;
    const outcome = await this.applyStructural({
      type: 'block.create',
      placement: { kind: 'top-level', chapterId: empty.id },
    });
    if (outcome.ok) await this.saveNow();
  }

  attachEditor(editor: Editor | null): void {
    this.editor = editor;
  }

  noteEditorUpdate(): void {
    if (!this.editable) return;
    this.dirty = true;
    this.lastTextAt = Date.now();
    this.setSaveState('unsaved');
    if (this.contentTimer !== null) clearTimeout(this.contentTimer);
    this.contentTimer = setTimeout(() => {
      this.contentTimer = null;
      void this.commitContent();
    }, 220);
    this.scheduleSave(800);
  }

  scheduleSave(delay = 800): void {
    if (!this.editable) return;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, delay);
  }

  commitContent(): Promise<void> {
    return this.queue.run(() => this.commitContentInternal());
  }

  private async commitContentInternal(): Promise<void> {
    if (!this.editable || this.disposed || this.editor === null) return;
    // A text selection can span block boundaries; deleting it can remove whole
    // branchBlocks from the ProseMirror buffer. The canonical document is the
    // source of truth, so restore it instead of committing an emptied canvas.
    if (this.reconcileEditor(this.selectedBlockId)) return;
    const extracted = extractBlockContents(this.editor.getJSON() as PMNode);
    const changes: Array<{ blockId: string; content: ContentNode }> = [];
    for (const [blockId, value] of extracted) {
      const block = this.document.blocks[blockId];
      if (block === undefined) continue;
      const merged = withBody(block.content, value.content);
      const hash = JSON.stringify(merged);
      if (this.hashes.get(blockId) !== hash) {
        changes.push({ blockId, content: merged });
      }
    }
    if (changes.length === 0) return;
    for (const change of changes) {
      const result = await window.noteforest.apply(this.packagePath, {
        type: 'block.editContent',
        blockId: change.blockId,
        content: change.content,
      });
      if (!result.ok) {
        this.setSaveState('error', result.message ?? 'Could not save the edit.');
        return;
      }
      if (result.document !== undefined) this.document = result.document;
      this.hashes.set(change.blockId, JSON.stringify(change.content));
    }
    this.dirty = true;
    if (this.saveState !== 'error') this.setSaveState('unsaved');
  }

  async saveNow(): Promise<void> {
    return this.queue.run(() => this.saveNowInternal());
  }

  private async saveNowInternal(): Promise<void> {
    if (!this.editable || this.disposed) return;
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.contentTimer !== null) {
      clearTimeout(this.contentTimer);
      this.contentTimer = null;
    }
    await this.commitContentInternal();
    this.setSaveState('saving');
    const result = await window.noteforest.save(this.packagePath);
    if (!result.ok) {
      this.setSaveState('error', result.error ?? 'Save failed.');
      return;
    }
    if (result.revision !== undefined) {
      this.document = { ...this.document, revision: result.revision };
    }
    this.dirty = false;
    this.setSaveState('saved');
    this.notify();
  }

  /** Commit the editor buffer to the core store without writing to disk. */
  async commitPending(): Promise<void> {
    if (this.contentTimer !== null) {
      clearTimeout(this.contentTimer);
      this.contentTimer = null;
    }
    await this.commitContent();
  }

  /** Commit and write immediately (⌘S, close tab, explicit flush). */
  async flush(): Promise<void> {
    await this.saveNow();
  }

  /**
   * Apply one command while the queue holds. Callers must already be inside
   * `queue.run`; committing text first keeps the command's base revision exact.
   */
  private async runCommandInternal(command: DocumentCommand): Promise<ApplyResult> {
    if (!this.editable) {
      return { ok: false, message: 'This document is open read-only.', code: 'read-only' };
    }
    await this.commitContentInternal();
    return window.noteforest.apply(this.packagePath, command);
  }

  private async acceptStructural(
    document: Document,
    inverse: DocumentCommand | null | undefined,
    focusBlockId: string | null,
    options: { rebuild?: boolean } = {},
  ): Promise<void> {
    this.document = document;
    if (inverse !== undefined && inverse !== null) {
      this.undoStack.push(inverse);
      this.redoStack.length = 0;
    }
    this.dirty = true;
    this.lastStructuralAt = Date.now();
    this.version += 1;
    this.setSaveState('unsaved');
    this.recomputeHashes();
    if (options.rebuild !== false) this.rebuildEditor(focusBlockId);
    this.notify();
    this.scheduleSave();
  }

  async applyStructural(
    command: DocumentCommand,
    options: { focusBlockId?: string | null; rebuild?: boolean } = {},
  ): Promise<ApplyOutcome> {
    return this.queue.run(async () => {
      const result = await this.runCommandInternal(command);
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'The command was rejected.' };
      }
      await this.acceptStructural(
        result.document,
        result.inverse,
        options.focusBlockId ?? this.selectedBlockId,
        options.rebuild === false ? { rebuild: false } : {},
      );
      this.reconcileEditor(options.focusBlockId ?? this.selectedBlockId);
      const blockId = result.created?.blockIds[0];
      const chapterId = result.created?.chapterIds[0];
      return {
        ok: true,
        ...(blockId === undefined ? {} : { blockId }),
        ...(chapterId === undefined ? {} : { chapterId }),
      };
    });
  }

  /** Create one block and return the ID the core command actually created. */
  private async createBlockNow(command: DocumentCommand): Promise<ApplyOutcome> {
    const result = await this.runCommandInternal(command);
    if (!result.ok || result.document === undefined) {
      return { ok: false, message: result.message ?? 'Could not create the block.' };
    }
    const createdId = result.created?.blockIds[0] ?? null;
    if (createdId === null) {
      console.warn('[noteforest] block.create returned no created block ID; rebuilding the editor');
      await this.acceptStructural(result.document, result.inverse, null);
      this.reconcileEditor(null);
      return { ok: true };
    }
    await this.acceptStructural(result.document, result.inverse, createdId, { rebuild: false });
    let inserted = false;
    try {
      inserted = this.insertCreatedBlock(createdId);
    } catch (error) {
      console.warn('[noteforest] targeted block insertion failed', error);
      inserted = false;
    }
    if (!inserted) this.rebuildEditor(createdId);
    this.reconcileEditor(createdId);
    return { ok: true, blockId: createdId };
  }

  private createBlock(command: DocumentCommand): Promise<ApplyOutcome> {
    return this.queue.run(() => this.createBlockNow(command));
  }

  async addChild(parentId: string): Promise<ApplyOutcome> {
    return this.createBlock({
      type: 'block.create',
      placement: { kind: 'child', parentBlockId: parentId },
    });
  }

  async addSibling(blockId: string): Promise<ApplyOutcome> {
    return this.createBlock({
      type: 'block.create',
      placement: { kind: 'sibling', siblingBlockId: blockId, after: true },
    });
  }

  async addTopLevel(chapterId: string): Promise<ApplyOutcome> {
    return this.createBlock({
      type: 'block.create',
      placement: { kind: 'top-level', chapterId },
    });
  }

  /**
   * Verify the ProseMirror buffer and the canonical document agree on the set
   * of block IDs. A mismatch is never kept: rebuild from canonical, drop the
   * canvas-only nodes, and surface a quiet recovery notice.
   */
  reconcileEditor(focusBlockId: string | null = null): boolean {
    const editor = this.editor;
    if (editor === null) return false;
    const canonical = new Set(Object.keys(this.document.blocks));
    const inEditor = new Set<string>();
    let placeholderMismatch = false;
    let otherMismatch = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'branchBlock') {
        const id = node.attrs['blockId'];
        if (typeof id !== 'string' || id.length === 0) {
          // ProseMirror auto-fill can leave a placeholder branchBlock after a
          // targeted delete. It must never survive as a canvas-only block.
          placeholderMismatch = true;
        } else if (id !== '__empty__') {
          inEditor.add(id);
        }
      }
      return true;
    });
    if (canonical.size !== inEditor.size) otherMismatch = true;
    if (!otherMismatch) {
      for (const id of canonical) {
        if (!inEditor.has(id)) {
          otherMismatch = true;
          break;
        }
      }
    }
    if (!otherMismatch) {
      for (const id of inEditor) {
        if (!canonical.has(id)) {
          otherMismatch = true;
          break;
        }
      }
    }
    // Also inspect the rendered canvas for diagnostics. A node view can lag one
    // frame behind the ProseMirror dispatch, so a DOM-only card is not enough to
    // rebuild: rebuilding from canonical would also discard a just-typed,
    // not-yet-committed text edit. The ProseMirror ID set is authoritative.
    if (!otherMismatch && editor.view !== undefined) {
      const domOnly: string[] = [];
      for (const element of editor.view.dom.querySelectorAll('[data-block-card]')) {
        const id = element.getAttribute('data-block-card');
        if (id === null || id.length === 0 || !canonical.has(id)) domOnly.push(id ?? '(empty)');
      }
      if (domOnly.length > 0) {
        console.warn('[noteforest] canvas-only block card observed; waiting for React to remove it', {
          domOnly,
        });
      }
    }
    if (!placeholderMismatch && !otherMismatch) return false;
    const extra = [...inEditor].filter((id) => !canonical.has(id));
    const missing = [...canonical].filter((id) => !inEditor.has(id));
    console.warn('[noteforest] editor/canonical block mismatch; rebuilding', { extra, missing });
    if (otherMismatch) {
      this.repairNotice =
        missing.length > 0
          ? 'The editor was rebuilt from the saved document to restore blocks removed from the canvas.'
          : 'The editor was rebuilt from the saved document to remove an untracked block.';
    }
    this.rebuildEditor(focusBlockId);
    this.notify();
    return true;
  }

  clearRepairNotice(): void {
    if (this.repairNotice === null) return;
    this.repairNotice = null;
    this.notify();
  }

  /** Insert one new branch block without rebuilding the whole editor. */
  private insertCreatedBlock(blockId: string): boolean {
    const editor = this.editor;
    if (editor === null) return false;
    const parent = parentIdOf(this.document, blockId);
    const depth = parent === null ? 0 : ancestorPath(this.document, parent).length;
    const json = buildBlockNode(this.document, blockId, depth, this.collapsed);
    if (json === null) return false;
    let node: ProseNode;
    try {
      node = editor.schema.nodeFromJSON(json);
    } catch {
      return false;
    }
    const transaction = editor.state.tr;
    if (parent === null) {
      const chapter = this.document.chapters.find((candidate) =>
        candidate.topLevelBlockIds.includes(blockId),
      );
      if (chapter === undefined) return false;
      let chapterPosition: number | null = null;
      let chapterNode: ProseNode | null = null;
      editor.state.doc.descendants((candidate, position) => {
        if (candidate.type.name === 'chapter' && candidate.attrs['chapterId'] === chapter.id) {
          chapterPosition = position;
          chapterNode = candidate;
          return false;
        }
        return true;
      });
      if (chapterPosition === null || chapterNode === null) return false;
      const index = chapter.topLevelBlockIds.indexOf(blockId);
      let offset = 0;
      (chapterNode as ProseNode).forEach((child: ProseNode, _offset: number, childIndex: number) => {
        if (childIndex < index) offset += child.nodeSize;
      });
      transaction.insert((chapterPosition as number) + 1 + offset, node);
    } else {
      let parentPosition: number | null = null;
      let parentNode: ProseNode | null = null;
      editor.state.doc.descendants((candidate, position) => {
        if (candidate.type.name === 'branchBlock' && candidate.attrs['blockId'] === parent) {
          parentPosition = position;
          parentNode = candidate;
          return false;
        }
        return true;
      });
      if (parentPosition === null || parentNode === null) return false;
      const blockNode = parentNode as ProseNode;
      const body = blockNode.firstChild;
      if (body === null) return false;
      const children = directChildIds(this.document, parent);
      const index = children.indexOf(blockId);
      const branchChildren = blockNode.childCount > 1 ? blockNode.child(1) : null;
      const parentDepth = depth - 1;
      if (branchChildren !== null) {
        const branchPosition = (parentPosition as number) + 1 + body.nodeSize;
        let offset = 0;
        branchChildren.forEach((child: ProseNode, _offset: number, childIndex: number) => {
          if (childIndex < index) offset += child.nodeSize;
        });
        transaction.insert(branchPosition + 1 + offset, node);
      } else {
        const wrapper = editor.schema.nodes['branchChildren']?.create(
          { parentId: parent, depth: parentDepth },
          node,
        );
        if (wrapper === undefined) return false;
        transaction.insert((parentPosition as number) + 1 + body.nodeSize, wrapper);
      }
      transaction.setNodeMarkup((parentPosition as number) + 1, undefined, {
        ...body.attrs,
        childCount: children.length,
      });
    }
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('preventUpdate', true);
    editor.view.dispatch(transaction);
    this.focusBlock(blockId);
    return true;
  }

  rebuildEditor(focusBlockId: string | null = null): void {
    const editor = this.editor;
    if (editor === null) return;
    const started = performance.now();
    const pmDocument = editor.schema.nodeFromJSON(
      buildEditorDocument(this.document, this.collapsed),
    );
    const transaction = editor.state.tr.replaceWith(
      0,
      editor.state.doc.content.size,
      pmDocument.content,
    );
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('preventUpdate', true);
    editor.view.dispatch(transaction);
    recordPerf('reflow', performance.now() - started);
    if (focusBlockId !== null) this.focusBlock(focusBlockId);
  }

  /**
   * Change the first text block's type inside one block (Text/H1/H2/H3) without
   * touching block identity. Used by the command palette so a heading can
   * always be escaped even when focus is in the palette.
   */
  setBlockType(blockId: string, level: 1 | 2 | 3 | null): boolean {
    const editor = this.editor;
    if (editor === null) return false;
    let blockPosition: number | null = null;
    editor.state.doc.descendants((node, position) => {
      if (blockPosition !== null) return false;
      if (node.type.name === 'branchBlock' && node.attrs['blockId'] === blockId) {
        blockPosition = position;
        return false;
      }
      return true;
    });
    if (blockPosition === null) return false;
    const $body = editor.state.doc.resolve((blockPosition as number) + 2);
    const selection = TextSelection.near($body, 1);
    const chain = editor.chain().focus().setTextSelection(selection.from);
    if (level === null) chain.setParagraph().run();
    else chain.setHeading({ level }).run();
    return true;
  }

  focusBlock(blockId: string, options: { select?: boolean; scroll?: boolean; at?: 'start' | 'end' } = {}): void {
    const editor = this.editor;
    if (editor === null) return;
    let position: number | null = null;
    let bodySize: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (position !== null) return false;
      if (node.type.name === 'branchBlock' && node.attrs['blockId'] === blockId) {
        position = pos;
        const body = node.firstChild;
        bodySize = body !== null && body.type.name === 'blockBody' ? body.nodeSize : node.nodeSize - 2;
        return false;
      }
      return true;
    });
    if (position === null) return;
    const pos = position as number;
    const scroll = options.scroll !== false;
    if (options.select === true) {
      const chain = editor.chain().focus().setNodeSelection(pos);
      if (scroll) chain.scrollIntoView();
      chain.run();
      return;
    }
    const atEnd = options.at === 'end';
    // End of the block's own body, never the end of its last descendant.
    const blockEnd = pos + (bodySize ?? 4) - 1;
    try {
      const chain = editor.chain().focus();
      if (atEnd) {
        const selection = TextSelection.near(editor.state.doc.resolve(blockEnd), -1);
        chain.setTextSelection(selection);
      } else {
        chain.setTextSelection(Math.min(pos + 3, editor.state.doc.content.size));
      }
      if (scroll) chain.scrollIntoView();
      chain.run();
    } catch {
      const chain = editor.chain().focus().setNodeSelection(pos);
      if (scroll) chain.scrollIntoView();
      chain.run();
    }
  }

  selectBlock(blockId: string | null): void {
    if (this.selectedBlockId === blockId) return;
    this.selectedBlockId = blockId;
    this.notify();
  }

  async toggleCollapse(blockId: string): Promise<void> {
    const collapsed = !this.collapsed.has(blockId);
    if (collapsed) this.collapsed.add(blockId);
    else this.collapsed.delete(blockId);
    const editor = this.editor;
    if (editor !== null) {
      const transaction = editor.state.tr;
      editor.state.doc.descendants((node, position) => {
        if (node.type.name !== 'branchBlock' || node.attrs['blockId'] !== blockId) return true;
        transaction.setNodeMarkup(position, undefined, { ...node.attrs, collapsed });
        const body = node.firstChild;
        if (body?.type.name === 'blockBody') {
          transaction.setNodeMarkup(position + 1, undefined, { ...body.attrs, collapsed });
        }
        return false;
      });
      transaction.setMeta('addToHistory', false);
      transaction.setMeta('preventUpdate', true);
      editor.view.dispatch(transaction);
    }
    this.version += 1;
    this.notify();
  }

  setCollapsed(ids: readonly string[]): void {
    this.collapsed.clear();
    for (const id of ids) this.collapsed.add(id);
  }

  async moveBlock(
    blockId: string,
    target: { kind: 'top-level'; chapterId: string } | { kind: 'child'; parentBlockId: string },
  ): Promise<ApplyOutcome> {
    return this.queue.run(async () => {
      const oldParent = parentIdOf(this.document, blockId);
      const result = await this.runCommandInternal({
        type: 'block.move',
        blockId,
        to:
          target.kind === 'child'
            ? { kind: 'child', parentBlockId: target.parentBlockId }
            : { kind: 'top-level', chapterId: target.chapterId },
      });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not move the block.' };
      }
      await this.acceptStructural(result.document, result.inverse, null, { rebuild: false });
      if (!this.moveBlockNodeToNewParent(blockId, oldParent)) {
        this.rebuildEditor(blockId);
      }
      this.reconcileEditor(blockId);
      return { ok: true };
    });
  }

  async outdent(blockId: string): Promise<ApplyOutcome> {
    return this.queue.run(async () => {
      const parent = parentIdOf(this.document, blockId);
      if (parent === null) return { ok: false, message: 'This block is already top-level.' };
      const chapterId = chapterIdOf(this.document, parent);
      if (chapterId === null) return { ok: false, message: 'Block has no chapter.' };
      const result = await this.runCommandInternal({
        type: 'block.move',
        blockId,
        to: { kind: 'sibling', siblingBlockId: parent, after: true },
      });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not outdent the block.' };
      }
      await this.acceptStructural(result.document, result.inverse, null, { rebuild: false });
      if (!this.moveBlockNodeToNewParent(blockId, parent)) {
        this.rebuildEditor(blockId);
      }
      this.reconcileEditor(blockId);
      return { ok: true };
    });
  }

  /** Move one existing branchBlock node to its new parent without rebuilding. */
  private moveBlockNodeToNewParent(blockId: string, oldParentId: string | null): boolean {
    const editor = this.editor;
    if (editor === null) return false;
    const locate = (doc: ProseNode, id: string): { position: number; node: ProseNode } | null => {
      let found: { position: number; node: ProseNode } | null = null;
      doc.descendants((node, position) => {
        if (found !== null) return false;
        if (node.type.name === 'branchBlock' && node.attrs['blockId'] === id) {
          found = { position, node };
          return false;
        }
        return true;
      });
      return found;
    };
    const source = locate(editor.state.doc, blockId);
    if (source === null) return false;
    const transaction = editor.state.tr;
    transaction.delete(source.position, source.position + source.node.nodeSize);

    if (oldParentId !== null) {
      const oldParent = locate(transaction.doc, oldParentId);
      if (oldParent !== null) {
        const body = oldParent.node.firstChild;
        const wrapper = oldParent.node.childCount > 1 ? oldParent.node.child(1) : null;
        if (body !== null && wrapper !== null) {
          if (wrapper.childCount === 0) {
            transaction.delete(
              oldParent.position + 1 + body.nodeSize,
              oldParent.position + 1 + body.nodeSize + wrapper.nodeSize,
            );
          } else {
            transaction.setNodeMarkup(oldParent.position + 1, undefined, {
              ...body.attrs,
              childCount: wrapper.childCount,
            });
          }
        }
      }
    }

    const parentId = parentIdOf(this.document, blockId);
    const movedNode = withBlockLevel(
      source.node,
      parentId === null,
      parentId === null ? 0 : ancestorPath(this.document, parentId).length,
    );
    if (parentId === null) {
      const chapter = this.document.chapters.find((candidate) =>
        candidate.topLevelBlockIds.includes(blockId),
      );
      if (chapter === undefined) return false;
      let chapterPosition: number | null = null;
      let chapterNode: ProseNode | null = null;
      transaction.doc.descendants((node, position) => {
        if (node.type.name === 'chapter' && node.attrs['chapterId'] === chapter.id) {
          chapterPosition = position;
          chapterNode = node;
          return false;
        }
        return true;
      });
      if (chapterPosition === null || chapterNode === null) return false;
      const index = chapter.topLevelBlockIds.indexOf(blockId);
      let offset = 0;
      (chapterNode as ProseNode).forEach((child: ProseNode, _offset: number, childIndex: number) => {
        if (childIndex < index) offset += child.nodeSize;
      });
      transaction.insert((chapterPosition as number) + 1 + offset, movedNode);
    } else {
      const parent = locate(transaction.doc, parentId);
      if (parent === null) return false;
      const body = parent.node.firstChild;
      if (body === null) return false;
      const children = directChildIds(this.document, parentId);
      const index = children.indexOf(blockId);
      const wrapper = parent.node.childCount > 1 ? parent.node.child(1) : null;
      if (wrapper !== null) {
        let offset = 0;
        wrapper.forEach((child: ProseNode, _offset: number, childIndex: number) => {
          if (childIndex < index) offset += child.nodeSize;
        });
        const wrapperPosition = parent.position + 1 + body.nodeSize;
        transaction.insert(wrapperPosition + 1 + offset, movedNode);
      } else {
        const newWrapper = editor.schema.nodes['branchChildren']?.create(
          { parentId, depth: ancestorPath(this.document, parentId).length - 1 },
          movedNode,
        );
        if (newWrapper === undefined) return false;
        transaction.insert(parent.position + 1 + body.nodeSize, newWrapper);
      }
      transaction.setNodeMarkup(parent.position + 1, undefined, {
        ...body.attrs,
        childCount: children.length,
      });
    }
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('preventUpdate', true);
    editor.view.dispatch(transaction);
    this.focusBlock(blockId);
    return true;
  }

  async reorderSibling(blockId: string, direction: -1 | 1): Promise<ApplyOutcome> {
    const siblings = siblingIds(this.document, blockId);
    const index = siblings.indexOf(blockId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
      return { ok: false, message: 'Already at the edge of this branch.' };
    }
    const target = siblings[targetIndex];
    if (target === undefined) return { ok: false, message: 'No sibling to reorder against.' };
    return this.moveSiblingFast(blockId, target, direction > 0);
  }

  async moveBlockBeforeOrAfter(
    sourceId: string,
    targetId: string,
    after: boolean,
  ): Promise<ApplyOutcome> {
    const sourceParent = parentIdOf(this.document, sourceId);
    const targetParent = parentIdOf(this.document, targetId);
    const sourceTop = sourceParent === null ? chapterIdOf(this.document, sourceId) : null;
    const targetTop = targetParent === null ? chapterIdOf(this.document, targetId) : null;
    if (sourceParent !== targetParent || sourceTop !== targetTop) {
      return { ok: false, message: 'Only siblings can be reordered by drag.' };
    }
    return this.moveSiblingFast(sourceId, targetId, after);
  }

  /** Reorder siblings by moving the existing ProseMirror node (no rebuild). */
  private async moveSiblingFast(
    blockId: string,
    targetId: string,
    after: boolean,
  ): Promise<ApplyOutcome> {
    return this.queue.run(async () => {
      const result = await this.runCommandInternal({
        type: 'block.move',
        blockId,
        to: { kind: 'sibling', siblingBlockId: targetId, after },
      });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not reorder the block.' };
      }
      await this.acceptStructural(result.document, result.inverse, null, { rebuild: false });
      if (!this.moveBlockNodeInEditor(blockId, targetId, after)) {
        this.rebuildEditor(blockId);
      }
      this.reconcileEditor(blockId);
      return { ok: true };
    });
  }

  private moveBlockNodeInEditor(blockId: string, targetId: string, after: boolean): boolean {
    const editor = this.editor;
    if (editor === null) return false;
    const locate = (doc: ProseNode, id: string): { position: number; node: ProseNode } | null => {
      let found: { position: number; node: ProseNode } | null = null;
      doc.descendants((node, position) => {
        if (found !== null) return false;
        if (node.type.name === 'branchBlock' && node.attrs['blockId'] === id) {
          found = { position, node };
          return false;
        }
        return true;
      });
      return found;
    };
    const source = locate(editor.state.doc, blockId);
    if (source === null) return false;
    const transaction = editor.state.tr;
    transaction.delete(source.position, source.position + source.node.nodeSize);
    const target = locate(transaction.doc, targetId);
    if (target === null) return false;
    const insertAt = after ? target.position + target.node.nodeSize : target.position;
    transaction.insert(insertAt, source.node);
    transaction.setMeta('addToHistory', false);
    transaction.setMeta('preventUpdate', true);
    editor.view.dispatch(transaction);
    this.focusBlock(blockId);
    return true;
  }

  async deleteBlock(
    blockId: string,
    children: 'promote' | 'delete-subtree',
  ): Promise<ApplyOutcome> {
    return this.queue.run(async () => {
      const oldParent = parentIdOf(this.document, blockId);
      const siblings = siblingIds(this.document, blockId);
      const index = siblings.indexOf(blockId);
      const fallback = siblings[index - 1] ?? siblings[index + 1] ?? oldParent;
      const result = await this.runCommandInternal({ type: 'block.delete', blockId, children });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not delete the block.' };
      }
      await this.acceptStructural(result.document, result.inverse, null, { rebuild: false });
      if (!this.removeBlockNodeInEditor(blockId, oldParent, children)) {
        this.rebuildEditor(fallback);
      } else if (fallback !== null) {
        this.focusBlock(fallback);
      }
      this.reconcileEditor(fallback);
      const chapterId = chapterIdOf(this.document, blockId);
      const chapter = chapterId === null ? undefined : this.document.chapters.find((item) => item.id === chapterId);
      if (chapter !== undefined && chapter.topLevelBlockIds.length === 0) {
        const chapterIdForBlock = chapter.id;
        await this.createBlockNow({
          type: 'block.create',
          placement: { kind: 'top-level', chapterId: chapterIdForBlock },
        });
      }
      return { ok: true };
    });
  }

  async deleteBranch(blockId: string): Promise<ApplyOutcome> {
    return this.queue.run(async () => {
      const branch = incomingBranch(this.document, blockId);
      if (branch === undefined) return { ok: false, message: 'This block has no incoming branch.' };
      const oldParent = branch.source.blockId;
      const result = await this.runCommandInternal({
        type: 'branch.delete',
        branchId: branch.id,
        targetHandling: { kind: 'promote' },
      });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not detach the branch.' };
      }
      await this.acceptStructural(result.document, result.inverse, null, { rebuild: false });
      if (!this.moveBlockNodeToNewParent(blockId, oldParent)) {
        this.rebuildEditor(blockId);
      }
      this.reconcileEditor(blockId);
      return { ok: true };
    });
  }

  private removeBlockNodeInEditor(
    blockId: string,
    oldParentId: string | null,
    mode: 'promote' | 'delete-subtree',
  ): boolean {
    const editor = this.editor;
    if (editor === null) return false;
    const locate = (doc: ProseNode, id: string): { position: number; node: ProseNode } | null => {
      let found: { position: number; node: ProseNode } | null = null;
      doc.descendants((node, position) => {
        if (found !== null) return false;
        if (node.type.name === 'branchBlock' && node.attrs['blockId'] === id) {
          found = { position, node };
          return false;
        }
        return true;
      });
      return found;
    };
    const source = locate(editor.state.doc, blockId);
    if (source === null) return false;
    const sourceNode = source.node;
    const childWrapper = sourceNode.childCount > 1 ? sourceNode.child(1) : null;
    const promoted: ProseNode[] = [];
    if (mode === 'promote' && childWrapper !== null) {
      childWrapper.forEach((child: ProseNode) => promoted.push(child));
    }
    const sourceDepth = typeof sourceNode.attrs['depth'] === 'number' ? sourceNode.attrs['depth'] : 0;
    const transaction = editor.state.tr;
    transaction.delete(source.position, source.position + sourceNode.nodeSize);

    if (oldParentId !== null) {
      const oldParent = locate(transaction.doc, oldParentId);
      if (oldParent !== null) {
        const body = oldParent.node.firstChild;
        const wrapper = oldParent.node.childCount > 1 ? oldParent.node.child(1) : null;
        if (body !== null && wrapper !== null) {
          if (wrapper.childCount === 0) {
            transaction.delete(
              oldParent.position + 1 + body.nodeSize,
              oldParent.position + 1 + body.nodeSize + wrapper.nodeSize,
            );
          } else {
            transaction.setNodeMarkup(oldParent.position + 1, undefined, {
              ...body.attrs,
              childCount: wrapper.childCount,
            });
          }
        }
      }
    }

    if (promoted.length > 0) {
      if (oldParentId === null) {
        const firstChildId = promoted[0]?.attrs['blockId'];
        const chapter = this.document.chapters.find((candidate) =>
          candidate.topLevelBlockIds.includes(String(firstChildId)),
        );
        if (chapter === undefined) return false;
        let chapterPosition: number | null = null;
        let chapterNode: ProseNode | null = null;
        transaction.doc.descendants((node, position) => {
          if (node.type.name === 'chapter' && node.attrs['chapterId'] === chapter.id) {
            chapterPosition = position;
            chapterNode = node;
            return false;
          }
          return true;
        });
        if (chapterPosition === null || chapterNode === null) return false;
        const index = chapter.topLevelBlockIds.indexOf(String(firstChildId));
        let offset = 0;
        (chapterNode as ProseNode).forEach((child: ProseNode, _offset: number, childIndex: number) => {
          if (childIndex < index) offset += child.nodeSize;
        });
        let insertAt = (chapterPosition as number) + 1 + offset;
        for (const child of promoted) {
          const upgraded = withBlockLevel(child, true, 0);
          transaction.insert(insertAt, upgraded);
          insertAt += upgraded.nodeSize;
        }
      } else {
        const parent = locate(transaction.doc, oldParentId);
        if (parent === null) return false;
        const body = parent.node.firstChild;
        if (body === null) return false;
        const wrapper = parent.node.childCount > 1 ? parent.node.child(1) : null;
        const firstChildId = String(promoted[0]?.attrs['blockId']);
        const children = directChildIds(this.document, oldParentId);
        const index = children.indexOf(firstChildId);
        if (wrapper !== null) {
          let offset = 0;
          wrapper.forEach((child: ProseNode, _offset: number, childIndex: number) => {
            if (childIndex < index) offset += child.nodeSize;
          });
          let insertAt = parent.position + 1 + body.nodeSize + 1 + offset;
          for (const child of promoted) {
            const kept = withBlockLevel(child, false, sourceDepth);
            transaction.insert(insertAt, kept);
            insertAt += kept.nodeSize;
          }
        } else {
          const nodes = promoted.map((child) => withBlockLevel(child, false, sourceDepth));
          const newWrapper = editor.schema.nodes['branchChildren']?.create(
            { parentId: oldParentId, depth: Math.max(0, sourceDepth - 1) },
            nodes,
          );
          if (newWrapper === undefined) return false;
          transaction.insert(parent.position + 1 + body.nodeSize, newWrapper);
        }
        transaction.setNodeMarkup(parent.position + 1, undefined, {
          ...body.attrs,
          childCount: children.length,
        });
      }
    }

    transaction.setMeta('addToHistory', false);
    transaction.setMeta('preventUpdate', true);
    editor.view.dispatch(transaction);
    return true;
  }

  async undoStructural(): Promise<ApplyOutcome> {
    return this.queue.run(async () => {
      const inverse = this.undoStack.pop();
      if (inverse === undefined) return { ok: false, message: 'Nothing to undo.' };
      await this.commitContentInternal();
      const result = await window.noteforest.apply(this.packagePath, inverse);
      if (!result.ok || result.document === undefined) {
        this.undoStack.push(inverse);
        return { ok: false, message: result.message ?? 'Could not undo.' };
      }
      this.document = result.document;
      if (result.inverse !== undefined && result.inverse !== null) {
        this.redoStack.push(result.inverse);
      }
      this.dirty = true;
      this.lastStructuralAt = Date.now();
      this.version += 1;
      this.setSaveState('unsaved');
      this.recomputeHashes();
      this.rebuildEditor(this.selectedBlockId);
      this.reconcileEditor(this.selectedBlockId);
      this.notify();
      this.scheduleSave();
      return { ok: true };
    });
  }

  async redoStructural(): Promise<ApplyOutcome> {
    return this.queue.run(async () => {
      const command = this.redoStack.pop();
      if (command === undefined) return { ok: false, message: 'Nothing to redo.' };
      await this.commitContentInternal();
      const result = await window.noteforest.apply(this.packagePath, command);
      if (!result.ok || result.document === undefined) {
        this.redoStack.push(command);
        return { ok: false, message: result.message ?? 'Could not redo.' };
      }
      this.document = result.document;
      if (result.inverse !== undefined && result.inverse !== null) {
        this.undoStack.push(result.inverse);
      }
      this.dirty = true;
      this.lastStructuralAt = Date.now();
      this.version += 1;
      this.setSaveState('unsaved');
      this.recomputeHashes();
      this.rebuildEditor(this.selectedBlockId);
      this.reconcileEditor(this.selectedBlockId);
      this.notify();
      this.scheduleSave();
      return { ok: true };
    });
  }

  /** Test/diagnostic hook: rebuild the editor after a real structural change. */
  benchmarkFullReflow(count = 8): void {
    if (this.editor === null) return;
    const original = this.document;
    for (let index = 0; index < count; index += 1) {
      const chapters = original.chapters.map((chapter, chapterIndex) =>
        chapterIndex === 0
          ? {
              ...chapter,
              topLevelBlockIds:
                index % 2 === 0
                  ? [...chapter.topLevelBlockIds].reverse()
                  : [...chapter.topLevelBlockIds],
            }
          : chapter,
      );
      this.document = { ...original, chapters };
      this.rebuildEditor(null);
    }
    this.document = original;
    this.rebuildEditor(null);
  }

  dispose(): void {
    this.disposed = true;
    if (this.contentTimer !== null) clearTimeout(this.contentTimer);
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.listeners.clear();
    this.editor = null;
  }
}
