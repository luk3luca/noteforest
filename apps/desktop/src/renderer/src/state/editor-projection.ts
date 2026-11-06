/**
 * TipTap editor projection.
 *
 * The canonical document is the source of truth; the editor buffer is a
 * projection of it. This service owns that projection: it builds the TipTap
 * document from canonical structure plus the view-only collapsed/below
 * placement sets, extracts edited block bodies back out of the buffer, replaces
 * the buffer while restoring the caret, reconciles the buffer after structural
 * changes, and replays the M3h1 text history when a placement rebuild moves
 * whole branch nodes.
 *
 * Canonical content, revisions, structural commands and the undo model stay in
 * `DocumentRuntime`. The projection only reads the canonical document and the
 * runtime-owned view state through its host ports, and it never calls
 * `window.noteforest`.
 */

import type { Editor } from '@tiptap/core';
import type { ContentNode, Document } from '@noteforest/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { closeHistory, redoDepth, undoDepth } from '@tiptap/pm/history';
import { EditorState, NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';
import { buildEditorDocument, extractBlockContents, withBody, type PMNode } from '../lib/adapter';
import { recordPerf } from '../lib/perf';
import { ancestorPath, chapterIdOf, visibleBlockIds } from '../lib/tree';
import {
  captureTextHistory,
  createBlockPositionMapper,
  mapHistorySteps,
} from './text-history';

/** Host state the projection reads; all of it is owned by `DocumentRuntime`. */
export interface EditorProjectionHost {
  /** Canonical document for the current revision. */
  document(): Document;
  /** Collapsed block IDs; view-only state, never canonical. */
  collapsed(): ReadonlySet<string>;
  /** Block selection the runtime last observed, used when the editor has none. */
  selectedBlockId(): string | null;
  /** Expand collapsed ancestors so a navigation target is visible. */
  reveal(blockId: string): void;
  /** Surface the quiet recovery notice when the buffer had to be rebuilt. */
  setRepairNotice(message: string): void;
}

/** One block body extracted from the editor buffer. */
export interface BlockBody {
  content: ContentNode;
  label: string | null;
}

/** The editor state and dispatch the projection drives during a rebuild. */
export interface EditorSurface {
  state(): EditorState;
  dispatch(transaction: Transaction): void;
}

/**
 * Where the caret/selection was before a command changed the canonical
 * document. Block IDs survive the rebuild; positions do not, so the offset is
 * relative to the block body and is restored only when the same block survives.
 */
export interface FocusContext {
  blockId: string | null;
  /** Block → parent → … → root, used to walk up when the block was removed. */
  ancestors: string[];
  chapterId: string | null;
  offset: number;
  nodeSelected: boolean;
}

export interface RebuildOptions {
  restore?: FocusContext;
  resetHistory?: boolean;
}

/** Block-ID comparison between the editor buffer and the canonical document. */
export interface BlockIdAudit {
  /** A branchBlock with no usable blockId (ProseMirror auto-fill). */
  placeholder: boolean;
  /** Editor blocks with no canonical counterpart. */
  extra: string[];
  /** Canonical blocks missing from the editor. */
  missing: string[];
}

function blockIdAtSelection(editor: Editor): string | null {
  const selection = editor.state.selection;
  if (selection instanceof NodeSelection && selection.node.type.name === 'branchBlock') {
    const id = selection.node.attrs['blockId'];
    return typeof id === 'string' ? id : null;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'branchBlock') {
      const id = node.attrs['blockId'];
      return typeof id === 'string' ? id : null;
    }
  }
  return null;
}

interface BlockLocation {
  position: number;
  node: ProseNode;
}

function locateBlock(editor: Editor, blockId: string): BlockLocation | null {
  let found: BlockLocation | null = null;
  editor.state.doc.descendants((node, position) => {
    if (found !== null) return false;
    if (node.type.name === 'branchBlock' && node.attrs['blockId'] === blockId) {
      found = { position, node };
      return false;
    }
    return true;
  });
  return found;
}

function isHistoryState(value: unknown): value is {
  done: unknown;
  undone: unknown;
  prevRanges: unknown;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'done' in value &&
    'undone' in value &&
    'prevRanges' in value
  );
}

function editorSurface(editor: Editor): EditorSurface {
  return {
    state: () => editor.state,
    dispatch: (transaction) => editor.view.dispatch(transaction),
  };
}

/**
 * Compare the block IDs in the editor buffer with the canonical document.
 * A placeholder branchBlock is reported separately: it must never survive, but
 * it is not a canonical/editor difference in either direction.
 */
export function auditBlockIds(
  editorDocument: ProseNode,
  canonical: ReadonlySet<string>,
): BlockIdAudit {
  const inEditor = new Set<string>();
  let placeholder = false;
  editorDocument.descendants((node) => {
    if (node.type.name === 'branchBlock') {
      const id = node.attrs['blockId'];
      if (typeof id !== 'string' || id.length === 0) {
        placeholder = true;
      } else {
        inEditor.add(id);
      }
    }
    return true;
  });
  const extra = [...inEditor].filter((id) => !canonical.has(id));
  const missing = [...canonical].filter((id) => !inEditor.has(id));
  return { placeholder, extra, missing };
}

/** Extract each block body from a ProseMirror editor document. */
export function extractBlockBodies(editorDocument: ProseNode): Map<string, BlockBody> {
  return extractBlockContents(editorDocument.toJSON() as PMNode);
}

/**
 * Substitute the editor buffer's bodies into the canonical document and build
 * the projection for the given placement. The canonical block set, order and
 * wrappers are authoritative; only body content comes from the buffer.
 */
export function projectWithEditorBodies(
  document: Document,
  collapsed: ReadonlySet<string>,
  belowChildIds: ReadonlySet<string>,
  editorDocument: ProseNode,
): PMNode {
  const extracted = extractBlockContents(editorDocument.toJSON() as PMNode);
  const blocks = { ...document.blocks };
  for (const [id, block] of Object.entries(blocks)) {
    const body = extracted.get(id);
    if (body === undefined) continue;
    blocks[id] = { ...block, content: withBody(block.content, body.content) };
  }
  return buildEditorDocument({ ...document, blocks }, collapsed, belowChildIds);
}

/**
 * Replace the whole editor buffer without touching canonical content or
 * history. `addToHistory: false` keeps the replace out of the undo stack;
 * `preventUpdate` keeps it out of the text-change/autosave path.
 */
export function replaceEditorDocument(surface: EditorSurface, pmDocument: PMNode): void {
  const state = surface.state();
  const documentNode = state.schema.nodeFromJSON(pmDocument);
  const transaction = state.tr.replaceWith(
    0,
    state.doc.content.size,
    documentNode.content,
  );
  transaction.setMeta('addToHistory', false);
  transaction.setMeta('preventUpdate', true);
  surface.dispatch(transaction);
}

/**
 * Reset the text history stacks in place, keeping the document. Structural
 * rebuilds replace arbitrary content, so old positional history steps no
 * longer map to a meaningful document.
 */
export function clearTextHistory(surface: EditorSurface): void {
  const state = surface.state();
  if (undoDepth(state) === 0 && redoDepth(state) === 0) return;
  const plugin = state.plugins.find((candidate) =>
    isHistoryState(candidate.getState(state)),
  );
  const historyKey = plugin?.spec.key;
  if (plugin === undefined || historyKey === undefined) return;
  const fresh = EditorState.create({ doc: state.doc, plugins: state.plugins });
  const empty = plugin.getState(fresh);
  if (!isHistoryState(empty)) return;
  const transaction = state.tr.setMeta(historyKey, { historyState: empty });
  transaction.setMeta('addToHistory', false);
  transaction.setMeta('preventUpdate', true);
  surface.dispatch(transaction);
}

/**
 * Replay the captured text history onto a rebuilt projection.
 *
 * The rebuild starts at the oldest text doc and replays every text event through
 * `blockBody` offsets. Each event is closed into its own history entry,
 * preserving one-undo-per-event semantics. If a step cannot be mapped (only
 * possible for a wrapper-level edit), fall back to the rebuilt projection with
 * an empty text stack instead of corrupting the document.
 */
export function replayTextHistory(
  surface: EditorSurface,
  project: (editorDocument: ProseNode) => PMNode,
  expected: PMNode,
): void {
  let replay: ReturnType<typeof captureTextHistory> | null = null;
  try {
    replay = captureTextHistory(surface.state());
  } catch (error) {
    console.warn(
      '[noteforest] could not capture the text history for a placement rebuild',
      error,
    );
  }
  if (replay !== null && replay.events.length > 0) {
    try {
      replaceEditorDocument(surface, project(replay.baseline));
      clearTextHistory(surface);
      for (const event of replay.events) {
        const mapping = createBlockPositionMapper(event.before, surface.state().doc);
        const steps = mapHistorySteps(event.steps, mapping);
        const transaction = surface.state().tr;
        for (const step of steps) {
          if (transaction.maybeStep(step).failed !== null) {
            throw new Error('Text history replay step did not apply.');
          }
        }
        transaction.setMeta('addToHistory', true);
        transaction.setMeta('preventUpdate', true);
        closeHistory(transaction);
        surface.dispatch(transaction);
      }
      // StarterKit's TrailingNode appends a top-level paragraph after every
      // dispatch; it is not part of the projection. Compare the chapter
      // content only so that filler never causes a false mismatch.
      const expectedNode = surface.state().schema.nodeFromJSON(expected);
      const expectedChapters = expectedNode.content.content;
      const actualChapters = surface.state().doc.content.content.filter(
        (node) => node.type.name === 'chapter',
      );
      const reachedExpected =
        actualChapters.length === expectedChapters.length &&
        actualChapters.every((node, index) => {
          const expectedChapter = expectedChapters[index];
          return expectedChapter !== undefined && node.eq(expectedChapter);
        });
      if (!reachedExpected) {
        throw new Error('Text history replay did not reach the expected projection.');
      }
    } catch (error) {
      console.warn(
        '[noteforest] text history replay failed; the placement rebuild cleared it',
        error,
      );
      replaceEditorDocument(surface, expected);
      clearTextHistory(surface);
    }
  } else {
    replaceEditorDocument(surface, expected);
    clearTextHistory(surface);
  }
}

export class EditorProjection {
  private editor: Editor | null = null;

  /**
   * Direct children the renderer wraps into the below stack. Non-canonical:
   * measured from the canvas, rebuilt into the editor projection only.
   */
  private belowStackChildIds: ReadonlySet<string> = new Set();

  constructor(private readonly host: EditorProjectionHost) {}

  attach(editor: Editor | null): void {
    this.editor = editor;
  }

  /** The mounted editor, or null before attach/dispose. */
  get attached(): Editor | null {
    return this.editor;
  }

  /** Build the TipTap document from canonical structure and view state. */
  build(): PMNode {
    return buildEditorDocument(
      this.host.document(),
      this.host.collapsed(),
      this.belowStackChildIds,
    );
  }

  /**
   * Extract the block bodies from the current editor buffer. Returns an empty
   * map when no editor is mounted, which matches the old runtime guard.
   */
  extractBodies(): Map<string, BlockBody> {
    const editor = this.editor;
    if (editor === null) return new Map();
    return extractBlockBodies(editor.state.doc);
  }

  /** Project the current editor bodies through the canonical document and placement. */
  private projectWithBodies(editorDocument: ProseNode): PMNode {
    return projectWithEditorBodies(
      this.host.document(),
      this.host.collapsed(),
      this.belowStackChildIds,
      editorDocument,
    );
  }

  /** Snapshot the block and caret before a structural change replaces the doc. */
  captureFocusContext(): FocusContext {
    const editor = this.editor;
    // The ProseMirror selection is authoritative while the editor is alive; a
    // runtime selection can lag one selection-sync tick behind a click.
    const blockId =
      (editor === null ? null : blockIdAtSelection(editor)) ?? this.host.selectedBlockId();
    if (blockId === null) {
      return { blockId: null, ancestors: [], chapterId: null, offset: 0, nodeSelected: false };
    }
    const document = this.host.document();
    const ancestors = ancestorPath(document, blockId).reverse();
    const chapterId = chapterIdOf(document, blockId);
    let offset = 0;
    let nodeSelected = false;
    if (editor !== null) {
      const located = locateBlock(editor, blockId);
      if (located !== null) {
        const selection = editor.state.selection;
        if (
          selection instanceof NodeSelection &&
          selection.node.type.name === 'branchBlock' &&
          selection.node.attrs['blockId'] === blockId
        ) {
          nodeSelected = true;
        } else {
          const bodyStart = located.position + 2;
          const maximum = Math.max(0, located.node.nodeSize - 4);
          offset = Math.min(Math.max(selection.from - bodyStart, 0), maximum);
        }
      }
    }
    return { blockId, ancestors, chapterId, offset, nodeSelected };
  }

  /**
   * Prefer the same block after a rebuild, then its nearest surviving ancestor,
   * then the chapter's first block, then the first visible block. A removed
   * block never leaves the editor without a valid selection.
   */
  resolveFocusContext(context: FocusContext): string | null {
    const document = this.host.document();
    const exists = (id: string): boolean => document.blocks[id] !== undefined;
    if (context.blockId !== null && exists(context.blockId)) return context.blockId;
    for (const ancestor of context.ancestors) {
      if (ancestor !== context.blockId && exists(ancestor)) return ancestor;
    }
    if (context.chapterId !== null) {
      const chapter = document.chapters.find((item) => item.id === context.chapterId);
      const topLevel = chapter?.topLevelBlockIds.find((id) => exists(id));
      if (topLevel !== undefined) return topLevel;
    }
    const visible = visibleBlockIds(document, this.host.collapsed());
    return visible[0] ?? Object.keys(document.blocks)[0] ?? null;
  }

  private restoreFocus(blockId: string, context: FocusContext): void {
    const editor = this.editor;
    if (editor === null) return;
    const located = locateBlock(editor, blockId);
    if (located === null) return;
    if (context.nodeSelected) {
      editor.chain().focus().setNodeSelection(located.position).scrollIntoView().run();
      return;
    }
    const bodyStart = located.position + 2;
    const bodyEnd = Math.max(bodyStart, located.position + located.node.nodeSize - 2);
    const position = Math.min(Math.max(bodyStart + context.offset, bodyStart), bodyEnd);
    try {
      const selection = TextSelection.near(editor.state.doc.resolve(position), 1);
      editor.chain().focus().setTextSelection(selection.from).scrollIntoView().run();
    } catch {
      this.focusBlock(blockId);
    }
  }

  private restoreFocusFor(focusBlockId: string | null, options: RebuildOptions): void {
    if (focusBlockId === null) return;
    if (options.restore !== undefined && options.restore.blockId === focusBlockId) {
      this.restoreFocus(focusBlockId, options.restore);
    } else {
      this.focusBlock(focusBlockId);
    }
  }

  /**
   * Apply a measured right/below placement. The projection changes DOM order
   * only (right group vs below stack); canonical structure and revision stay
   * untouched. Text history is position-based, so the rebuild captures the
   * current text events and replays them through a block-relative map instead
   * of clearing them. A resize/measure pass must not steal focus when the
   * editor was idle.
   */
  applyChildPlacement(belowChildIds: ReadonlySet<string>): void {
    const same =
      belowChildIds.size === this.belowStackChildIds.size &&
      [...belowChildIds].every((id) => this.belowStackChildIds.has(id));
    if (same) return;
    this.belowStackChildIds = new Set(belowChildIds);
    const editor = this.editor;
    if (editor === null) return;
    const wasFocused = editor.isFocused;
    const focus = this.captureFocusContext();
    this.rebuildPreservingTextHistory(wasFocused ? focus.blockId : null, {
      ...(wasFocused ? { restore: focus } : {}),
    });
  }

  private rebuildPreservingTextHistory(
    focusBlockId: string | null,
    options: RebuildOptions = {},
  ): void {
    const editor = this.editor;
    if (editor === null) return;
    const started = performance.now();
    const expected = this.projectWithBodies(editor.state.doc);
    replayTextHistory(
      editorSurface(editor),
      (editorDocument) => this.projectWithBodies(editorDocument),
      expected,
    );
    recordPerf('reflow', performance.now() - started);
    this.restoreFocusFor(focusBlockId, options);
  }

  /** Replace the whole buffer from canonical; optional focus and history reset. */
  rebuild(focusBlockId: string | null = null, options: RebuildOptions = {}): void {
    const editor = this.editor;
    if (editor === null) return;
    const started = performance.now();
    const surface = editorSurface(editor);
    replaceEditorDocument(surface, this.build());
    if (options.resetHistory === true) clearTextHistory(surface);
    recordPerf('reflow', performance.now() - started);
    this.restoreFocusFor(focusBlockId, options);
  }

  /**
   * Verify the ProseMirror buffer and the canonical document agree on the set
   * of block IDs. A mismatch is never kept: rebuild from canonical, drop the
   * canvas-only nodes, and report the quiet recovery notice to the host.
   */
  reconcile(focusBlockId: string | null = null): boolean {
    const editor = this.editor;
    if (editor === null) return false;
    const canonical = new Set(Object.keys(this.host.document().blocks));
    const audit = auditBlockIds(editor.state.doc, canonical);
    const otherMismatch = audit.extra.length > 0 || audit.missing.length > 0;
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
    if (!audit.placeholder && !otherMismatch) return false;
    console.warn('[noteforest] editor/canonical block mismatch; rebuilding', {
      extra: audit.extra,
      missing: audit.missing,
    });
    if (otherMismatch) {
      this.host.setRepairNotice(
        audit.missing.length > 0
          ? 'The editor was rebuilt from the saved document to restore blocks removed from the canvas.'
          : 'The editor was rebuilt from the saved document to remove an untracked block.',
      );
    }
    this.rebuild(focusBlockId);
    return true;
  }

  focusBlock(
    blockId: string,
    options: { select?: boolean; scroll?: boolean; at?: 'start' | 'end' } = {},
  ): void {
    // Navigation always reveals the target: a collapsed ancestor is view
    // state, never a reason to focus an invisible block.
    this.host.reveal(blockId);
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
}
