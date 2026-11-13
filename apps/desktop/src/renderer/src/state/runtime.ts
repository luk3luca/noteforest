/**
 * Per-document composition root.
 *
 * `DocumentRuntime` wires the collaborators for one open document and keeps
 * the UI-facing API:
 *
 * - `DocumentSession` owns the canonical document/revision, the serial queue,
 *   structural undo/redo, typed command application, and content-commit
 *   bookkeeping;
 * - `EditorProjection` owns the TipTap projection (build/extract/replace,
 *   reconcile, placement rebuild, M3h1 text-history replay);
 * - `SaveCoordinator` owns dirty state, autosave, retry/backoff, and flush;
 * - `DocumentGateway` is the only platform access (no `window.noteforest`
 *   here);
 * - this class owns the view/anchor/selection/health state and the fast DOM
 *   mutation paths.
 *
 * The TipTap document is the editing buffer; it is not stored in Zustand and
 * not mirrored per keystroke. Content is committed to the core store on a short
 * idle debounce; structural commands go through the typed command API
 * immediately and rebuild the editor document.
 */

import type { Editor } from '@tiptap/core';
import type {
  AnchorBinding,
  AnchorRepairCommand,
  Asset,
  AssetAvailability,
  AssetAvailabilityIndex,
  AssetAvailabilityState,
  ContentNode,
  Document,
  DocumentCommand,
  JsonObject,
} from '@noteforest/core';
import {
  anchoredChildBranches,
  planBlockMerge,
  textAnchorSelectorForBinding,
} from '@noteforest/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type {
  ApplyResult,
  LockInfoView,
  OpenDocumentSnapshot,
  RestoreBackupResult,
  SaveCopyResult,
} from '../../../shared/api';
import { buildBlockNode, withBody } from '../lib/adapter';
import {
  contentWithImage,
  contentWithImageAlt,
  contentWithImageAsset,
  defaultImageAlt,
  imageNodeFor,
} from '../lib/image';
import type { BlockCaretLocation, BranchSelectionAnchor } from '../lib/anchor-selection';
import { blockCaretLocation, branchSelectionAnchor } from '../lib/anchor-selection';
import {
  setEditorSelectedAnchor,
  setEditorSelectedBlock,
  type EditorAnchorSelection,
} from '../editor/editor-ui';
import {
  ancestorPath,
  chapterIdOf,
  directChildIds,
  incomingBranch,
  parentIdOf,
  siblingIds,
} from '../lib/tree';
import type { DocumentGateway } from './document-gateway';
import { DocumentSession, type ContentChange } from './document-session';
import { createElectronDocumentGateway } from './electron-document-gateway';
import { EditorProjection, type RebuildOptions } from './editor-projection';
import { SaveCoordinator, type SaveFailure, type SaveState } from './save-coordinator';

export type { SaveState } from './save-coordinator';

export interface RestorePoint {
  scrollTop: number;
  selectedBlockId: string | null;
}

export interface ApplyOutcome {
  ok: boolean;
  message?: string;
  blockId?: string;
  chapterId?: string;
  anchorId?: string;
  branchId?: string;
  /** Content-addressed asset inserted by an image command. */
  assetId?: string;
  /** True when an existing edge was reused instead of creating a new one. */
  duplicate?: boolean;
}

/**
 * A branch block's optional children are `[blockBody, calloutLane?, branchChildren?]`.
 * The fast DOM paths below predate the callout lane and assume `child(1)` is
 * the direct-child group; report a lane so callers rebuild from canonical.
 */
function hasCalloutLane(node: ProseNode): boolean {
  return node.childCount > 1 && node.child(1)?.type.name === 'calloutLane';
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

  status: OpenDocumentSnapshot['status'];

  readOnlyReason: string | undefined;

  /** Lock metadata for a read-only stale/live lock open. */
  lock: LockInfoView | undefined;

  /** Bumped for UI consumers after structural/selection/save-state changes. */
  seq = 0;

  /** Bumped only when the canonical structure changes. */
  version = 0;

  selectedBlockId: string | null = null;

  /** Anchor selected from a marker, quote chip, outline row, or block menu. */
  selectedAnchor: EditorAnchorSelection | null = null;
  /** Keep a just-selected anchor through the focus-driven editor sync. */
  private anchorFocusHold = false;
  /**
   * True only after a user action selected a block (canvas pointer/key, outline,
   * palette, marker). The mount-time editor selection is not user intent, so it
   * keeps the resting accent edges instead of muting the whole tree.
   */
  selectionExplicit = false;

  readonly collapsed = new Set<string>();

  /**
   * Anchors whose repair prompt was dismissed with "Keep broken" in this
   * session. View-only: no document mutation, no export effect, marker stays.
   */
  readonly keptBroken = new Set<string>();

  /**
   * Session image-asset availability. View-only: a missing file or SHA-256
   * mismatch marks the image and its anchors broken without changing canonical
   * content. Refreshed at open, reload, and when a command touches an asset.
   */
  private availability: Record<string, AssetAvailabilityState> = {};

  /** Visible recovery message when the editor had to be rebuilt from canonical. */
  repairNotice: string | null = null;

  /** Canonical document/revision, command queue, and structural history. */
  private readonly session: DocumentSession;

  /** TipTap projection: build/extract/replace/reconcile and text-history replay. */
  private readonly projection: EditorProjection;

  private readonly listeners = new Set<() => void>();

  /** Save/autosave/flush lifecycle; the runtime wires it to the session queue. */
  private readonly saves: SaveCoordinator;

  /** Platform port. The default is the Electron composition-layer adapter. */
  private readonly gateway: DocumentGateway;

  private restorePoint: RestorePoint | null;

  private ensuredBlocks = false;

  constructor(
    snapshot: OpenDocumentSnapshot,
    collapsed: Iterable<string>,
    restore: RestorePoint | null,
    gateway: DocumentGateway = createElectronDocumentGateway(),
  ) {
    this.packagePath = snapshot.packagePath;
    this.status = snapshot.status;
    this.readOnlyReason = snapshot.readOnlyReason;
    this.lock = snapshot.lock;
    this.replaceAvailability(snapshot.assetAvailability);
    this.restorePoint = restore;
    this.gateway = gateway;
    this.session = new DocumentSession(snapshot.document, {
      packagePath: this.packagePath,
      gateway: this.gateway,
      isEditable: () => this.editable,
      commitEditor: () => this.commitContentInternal(),
      bumpVersion: () => {
        this.version += 1;
      },
      notify: () => this.notify(),
      markContentCommitted: () => this.saves.markContentCommitted(),
      noteStructuralChange: () => this.saves.noteStructuralChange(),
      recordFailure: (code, message) => this.saves.recordFailure(code, message),
      saveError: () => this.saves.saveError,
    });
    this.projection = new EditorProjection({
      document: () => this.document,
      assetAvailability: () => this.assetAvailability,
      collapsed: () => this.collapsed,
      selectedBlockId: () => this.selectedBlockId,
      reveal: (blockId) => this.expandAncestors(blockId),
      setRepairNotice: (message) => {
        this.repairNotice = message;
      },
    });
    this.saves = new SaveCoordinator({
      queue: this.session.queue,
      isEditable: () => this.editable,
      commit: () => this.commitContentInternal(),
      write: (options) => this.gateway.save(this.packagePath, options),
      saveCopy: () => this.gateway.saveCopy(this.packagePath),
      applyRevision: (revision) => this.session.applyRevision(revision),
      changed: () => this.notify(),
    });
    for (const id of collapsed) this.collapsed.add(id);
  }

  /** Canonical document at the current revision. */
  get document(): Document {
    return this.session.canonical;
  }

  /** Image assets observed missing/changed in this open session. */
  get assetAvailability(): AssetAvailabilityIndex {
    return this.availability;
  }

  private replaceAvailability(entries: readonly AssetAvailability[] | undefined): void {
    const next: Record<string, AssetAvailabilityState> = {};
    for (const entry of entries ?? []) {
      if (entry.state !== 'available') next[entry.id] = entry.state;
    }
    this.availability = next;
  }

  /** Merge availability reported by the command that just changed an asset. */
  private mergeAvailability(
    entries: readonly AssetAvailability[] | undefined,
    document: Document,
  ): void {
    if (entries === undefined || entries.length === 0) {
      // A record removal still has to drop its stale available/missing entry,
      // but an ordinary command keeps the same object for memo stability.
      const stale = Object.keys(this.availability).filter(
        (id) => document.assets[id] === undefined,
      );
      if (stale.length > 0) {
        const next = { ...this.availability };
        for (const id of stale) delete next[id];
        this.availability = next;
      }
      return;
    }
    const next = { ...this.availability };
    for (const entry of entries) {
      if (entry.state === 'available') delete next[entry.id];
      else next[entry.id] = entry.state;
    }
    for (const id of Object.keys(next)) {
      if (document.assets[id] === undefined) delete next[id];
    }
    this.availability = next;
  }

  /** What the last user-visible operation touched; drives undo/redo routing. */
  get lastHistoryOperation(): 'text' | 'structural' | null {
    return this.session.lastHistoryOperation;
  }

  get title(): string {
    return this.document.title;
  }

  get editable(): boolean {
    return this.status === 'editable';
  }

  /** True while canonical content or the editor buffer is ahead of disk. */
  get dirty(): boolean {
    return this.saves.dirty;
  }

  get saveState(): SaveState {
    return this.saves.saveState;
  }

  get saveError(): string | null {
    return this.saves.saveError;
  }

  /** Typed, persistent failure that owns the recovery surface. */
  get saveFailure(): SaveFailure | null {
    return this.saves.saveFailure;
  }

  get canUndoStructural(): boolean {
    return this.session.canUndoStructural;
  }

  get canRedoStructural(): boolean {
    return this.session.canRedoStructural;
  }

  get canUndoText(): boolean {
    return this.editor?.can().undo() ?? false;
  }

  get canRedoText(): boolean {
    return this.editor?.can().redo() ?? false;
  }

  /** The mounted TipTap editor, or null before attach/dispose. */
  get editor(): Editor | null {
    return this.projection.attached;
  }

  /** Record that a text undo/redo was applied through this runtime. */
  markTextHistory(): void {
    this.session.markTextHistory();
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

  /**
   * Legacy repair: give every empty chapter one top-level block. Empty
   * chapters are now valid and render with an "Add top-level block" row; this
   * loop remains for documents written by older builds and must never stop at
   * the first empty chapter.
   */
  async ensureChaptersHaveBlocks(): Promise<void> {
    if (this.ensuredBlocks || !this.editable) return;
    this.ensuredBlocks = true;
    const emptyChapterIds = this.document.chapters
      .filter((chapter) => chapter.topLevelBlockIds.length === 0)
      .map((chapter) => chapter.id);
    if (emptyChapterIds.length === 0) return;
    let created = false;
    for (const chapterId of emptyChapterIds) {
      const outcome = await this.applyStructural({
        type: 'block.create',
        placement: { kind: 'top-level', chapterId },
      });
      if (outcome.ok) created = true;
    }
    if (created) await this.saveNow();
  }

  /**
   * Explicit stale-lock takeover. The main process refuses a live lock, so
   * this only succeeds after the user pressed "Take over lock" in the banner.
   * The runtime keeps its package path, selection, and mounted editor; only
   * the writable state, canonical document, and lock metadata are replaced.
   */
  async takeOverLock(): Promise<{ ok: boolean; message?: string }> {
    if (this.readOnlyReason !== 'stale-lock') {
      return { ok: false, message: 'This document is not waiting on a stale lock.' };
    }
    const result = await this.gateway.takeOverLock(this.packagePath);
    if (!result.ok) return { ok: false, message: result.message };
    if (result.snapshot.status !== 'editable') {
      return { ok: false, message: 'The document reopened read-only; the lock was not taken over.' };
    }
    this.applyReopenedSnapshot(result.snapshot);
    return { ok: true };
  }

  private applyReopenedSnapshot(snapshot: OpenDocumentSnapshot): void {
    this.saves.clearTimers();
    this.status = snapshot.status;
    this.readOnlyReason = snapshot.readOnlyReason;
    this.lock = snapshot.lock;
    this.replaceAvailability(snapshot.assetAvailability);
    this.session.reset(snapshot.document);
    this.validateSelectedAnchor();
    this.version += 1;
    this.saves.reset();
    this.repairNotice = null;
    this.editor?.setEditable(this.editable);
    this.rebuildEditor(this.selectedBlockId, { resetHistory: true });
    this.notify();
  }

  attachEditor(editor: Editor | null): void {
    this.projection.attach(editor);
  }

  noteEditorUpdate(): void {
    if (!this.editable) return;
    this.session.markTextHistory();
    // A failed save stays visible and authoritative; typing does not downgrade
    // the status back to a plain "Unsaved changes".
    this.saves.noteTextEdit();
  }

  /**
   * Schedule an autosave. While a save failure is active, the failure owns the
   * retry schedule (backoff); ordinary edits must not hammer the disk.
   */
  scheduleSave(delay = 800): void {
    this.saves.scheduleSave(delay);
  }

  commitContent(): Promise<void> {
    return this.session.queue.run(async () => {
      await this.commitContentInternal();
    });
  }

  private async commitContentInternal(): Promise<boolean> {
    if (!this.editable || this.saves.isDisposed || this.editor === null) return true;
    // A text selection can span block boundaries; deleting it can remove whole
    // branchBlocks from the ProseMirror buffer. The canonical document is the
    // source of truth, so restore it instead of committing an emptied canvas.
    if (this.reconcileEditor(this.selectedBlockId)) return true;
    const extracted = this.projection.extractBodies();
    const changes: ContentChange[] = [];
    for (const [blockId, value] of extracted) {
      const block = this.document.blocks[blockId];
      if (block === undefined) continue;
      const merged = withBody(block.content, value.content);
      if (this.session.contentChanged(blockId, merged)) {
        changes.push({ blockId, content: merged });
      }
    }
    if (changes.length === 0) return true;
    // The session owns the canonical apply loop: a content commit can change
    // derived anchor state (resolved → broken → resolved), and the session
    // bumps the revision and notifies before the disk save so inline warnings,
    // callouts, and the health chip all update from the same content revision.
    return this.session.commitContent(changes);
  }

  /** Commit and write immediately (⌘S); the SaveCoordinator owns the state. */
  async saveNow(): Promise<void> {
    return this.saves.saveNow();
  }

  /**
   * Deliberate recovery for `external-modification`: write this window's
   * content over the file that changed on disk. The caller must have shown the
   * non-default overwrite confirmation first.
   */
  async overwriteExternal(): Promise<{ ok: boolean; message?: string }> {
    return this.saves.overwriteExternal();
  }

  /** Explicit Retry from the recovery surface: restart the backoff sequence. */
  async retrySave(): Promise<void> {
    return this.saves.retrySave();
  }

  /**
   * Write the current canonical content into a new package via the native
   * dialog. The original file is untouched. A successful copy clears the
   * failure and re-enables autosave, per the recovery contract.
   */
  async saveCopy(): Promise<SaveCopyResult> {
    return this.saves.saveCopy();
  }

  /**
   * Restore one listed backup as a new copy through the main process. The
   * native destination dialog and the package write happen there; this window's
   * canonical document and save failure are deliberately left unchanged.
   */
  async restoreBackup(sourcePath: string): Promise<RestoreBackupResult> {
    return this.session.queue.run(() => this.gateway.restoreBackup(this.packagePath, sourcePath));
  }

  /**
   * Reopen the canonical package from disk. Discards unsaved renderer edits;
   * callers must confirm first. The store lock is released and reacquired in
   * the main process.
   */
  async reloadFromDisk(): Promise<{ ok: boolean; message?: string }> {
    return this.session.queue.run(async () => {
      this.saves.clearTimers();
      const wasEditable = this.editable;
      const result = await this.gateway.reloadDocument(this.packagePath);
      if (!result.ok) return { ok: false, message: result.message };
      this.status = result.snapshot.status;
      this.readOnlyReason = result.snapshot.readOnlyReason;
      this.lock = result.snapshot.lock;
      this.replaceAvailability(result.snapshot.assetAvailability);
      // Reload replaces the canonical document: old structural inverses and
      // text history no longer describe it.
      this.session.reset(result.snapshot.document);
      this.validateSelectedAnchor();
      this.version += 1;
      this.saves.reset();
      // A Recheck can turn a read-only open into an editable one; the mounted
      // editor must gain editability, not only the runtime status. Only touch
      // the editor when the mode actually changed: setEditable emits an update
      // that would schedule an unnecessary save on an ordinary external reload.
      if (this.editable !== wasEditable) this.editor?.setEditable(this.editable);
      this.rebuildEditor(this.selectedBlockId, { resetHistory: true });
      this.reconcileEditor(this.selectedBlockId);
      this.notify();
      return { ok: true };
    });
  }

  /** Commit the editor buffer to the core store without writing to disk. */
  async commitPending(): Promise<void> {
    this.saves.clearPendingCommit();
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
    const result = await this.session.execute(command);
    if (result.ok && result.document !== undefined) {
      this.mergeAvailability(result.assetAvailability, result.document);
    }
    return result;
  }

  private async acceptStructural(
    document: Document,
    inverse: DocumentCommand | null | undefined,
    focusBlockId: string | null,
    options: { rebuild?: boolean } = {},
  ): Promise<void> {
    const focus = this.projection.captureFocusContext();
    // One inverse per user action; any new structural command invalidates
    // structural redo, including the destructive commands whose inverse is
    // still phase 3b work.
    this.session.acceptStructural(document, inverse);
    this.validateSelectedAnchor();
    if (options.rebuild !== false) {
      const target =
        focusBlockId !== null && document.blocks[focusBlockId] !== undefined
          ? focusBlockId
          : this.projection.resolveFocusContext(focus);
      this.rebuildEditor(target, { restore: focus });
    }
    this.notify();
    this.scheduleSave();
  }

  async applyStructural(
    command: DocumentCommand,
    options: { focusBlockId?: string | null; rebuild?: boolean } = {},
  ): Promise<ApplyOutcome> {
    return this.session.queue.run(async () => {
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

  /**
   * Insert one image asset into a block as a single user action.
   *
   * `asset.add` records the canonical metadata first (the bytes were already
   * atomically copied into the package by the main-process asset store), then
   * one `block.editContent` command inserts the image node. The asset record is
   * deliberately not a separate undo entry: undo removes the image, and an
   * unreferenced asset record is harmless until asset GC exists.
   */
  async insertImage(blockId: string, asset: Asset): Promise<ApplyOutcome> {
    if (!this.editable) {
      return { ok: false, message: 'This document is open read-only.' };
    }
    return this.session.queue.run(async () => {
      if (this.document.blocks[blockId] === undefined) {
        return { ok: false, message: 'The block no longer exists.' };
      }
      const added = await this.runCommandInternal({ type: 'asset.add', asset });
      if (!added.ok || added.document === undefined) {
        return { ok: false, message: added.message ?? 'Could not record the image asset.' };
      }
      await this.acceptStructural(added.document, null, blockId, { rebuild: false });

      const block = this.document.blocks[blockId];
      if (block === undefined) return { ok: false, message: 'The block no longer exists.' };
      const alt = asset.alt ?? defaultImageAlt(asset.originalName);
      const image = imageNodeFor({
        assetId: asset.id,
        ...(alt.length === 0 ? {} : { alt }),
        ...(asset.width === undefined ? {} : { width: asset.width }),
        ...(asset.height === undefined ? {} : { height: asset.height }),
      });
      const edited = await this.runCommandInternal({
        type: 'block.editContent',
        blockId,
        content: contentWithImage(block.content, image),
      });
      if (!edited.ok || edited.document === undefined) {
        return { ok: false, message: edited.message ?? 'Could not insert the image.' };
      }
      await this.acceptStructural(edited.document, edited.inverse, blockId);
      this.focusBlock(blockId);
      return { ok: true, blockId, assetId: asset.id };
    });
  }

  /**
   * Record an asset that was already copied into this package by the main
   * process (cross-document clipboard). This is metadata only: the bytes exist
   * before the record, and the caller updates the image node in the same user
   * action. Undo leaves the record behind, exactly like image insert/replace;
   * it is unreferenced until a future explicit GC pass.
   */
  async recordAsset(asset: Asset): Promise<ApplyOutcome> {
    if (!this.editable) {
      return { ok: false, message: 'This document is open read-only.' };
    }
    return this.session.queue.run(async () => {
      const added = await this.runCommandInternal({ type: 'asset.add', asset });
      if (!added.ok || added.document === undefined) {
        return { ok: false, message: added.message ?? 'Could not record the image asset.' };
      }
      await this.acceptStructural(added.document, null, this.selectedBlockId, {
        rebuild: false,
      });
      return { ok: true, assetId: asset.id };
    });
  }

  /**
   * Commit one block body edited in the Page Edit overlay.
   *
   * This is deliberately the ordinary `block.editContent` command: the
   * continuous editor buffer is committed first by the session queue, the page
   * content becomes one structural undo entry, and the hidden continuous
   * editor is rebuilt from canonical. A rejected command leaves canonical
   * content untouched; the overlay decides whether its typed buffer stays open.
   */
  async editBlockContent(blockId: string, content: ContentNode): Promise<ApplyOutcome> {
    if (!this.editable) {
      return { ok: false, message: 'This document is open read-only.' };
    }
    if (this.document.blocks[blockId] === undefined) {
      return { ok: false, message: 'The block no longer exists.' };
    }
    return this.applyStructural(
      { type: 'block.editContent', blockId, content },
      { focusBlockId: blockId },
    );
  }

  /** Edit one image's alt text through the block content command. */
  async setImageAlt(
    blockId: string,
    path: readonly number[],
    alt: string,
  ): Promise<ApplyOutcome> {
    const block = this.document.blocks[blockId];
    if (block === undefined) return { ok: false, message: 'The block no longer exists.' };
    const content = contentWithImageAlt(block.content, path, alt.trim());
    return this.applyStructural(
      { type: 'block.editContent', blockId, content },
      { focusBlockId: blockId },
    );
  }

  /**
   * Replace the asset behind one existing image node.
   *
   * The asset record is added first so the new image renders immediately; the
   * image content edit is the single structural inverse. Alt text survives, and
   * every image anchor keeps its old assetId, so resolution reports
   * `asset-changed` instead of silently reattaching the region to the new bytes.
   */
  async replaceImage(
    blockId: string,
    path: readonly number[],
    asset: Asset,
  ): Promise<ApplyOutcome> {
    if (!this.editable) {
      return { ok: false, message: 'This document is open read-only.' };
    }
    return this.session.queue.run(async () => {
      const added = await this.runCommandInternal({ type: 'asset.add', asset });
      if (!added.ok || added.document === undefined) {
        return { ok: false, message: added.message ?? 'Could not record the image asset.' };
      }
      await this.acceptStructural(added.document, null, blockId, { rebuild: false });

      const block = this.document.blocks[blockId];
      if (block === undefined) return { ok: false, message: 'The block no longer exists.' };
      const edited = await this.runCommandInternal({
        type: 'block.editContent',
        blockId,
        content: contentWithImageAsset(block.content, path, asset),
      });
      if (!edited.ok || edited.document === undefined) {
        return { ok: false, message: edited.message ?? 'Could not replace the image.' };
      }
      await this.acceptStructural(edited.document, edited.inverse, blockId);
      this.focusBlock(blockId);
      return { ok: true, blockId, assetId: asset.id };
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
    return this.session.queue.run(() => this.createBlockNow(command));
  }

  /**
   * Branch from the current editor selection as one user action.
   *
   * The binding was derived from the editor buffer; `runCommandInternal`
   * commits that buffer first, so the canonical content and the adapter's
   * node paths are the same revision before the composite command runs. One
   * structural inverse removes/restores the anchor, block and branch without
   * an optimistic local mark. Formula NodeSelections use the atomic
   * whole-formula binding, a range inside a code block uses the atomic code
   * binding plus its explicit selector, and text carets/ranges keep the text
   * path.
   */
  async branchFromSelection(selection: BranchSelectionAnchor): Promise<ApplyOutcome> {
    const command: DocumentCommand =
      selection.kind === 'formula'
        ? {
            type: 'branch.createFromSelection',
            blockId: selection.blockId,
            kind: 'formula',
            binding: selection.binding,
            selector: selection.selector,
            target: { kind: 'new' },
            role: 'primary',
          }
        : selection.kind === 'code'
          ? {
              type: 'branch.createFromSelection',
              blockId: selection.blockId,
              kind: 'code',
              binding: selection.binding,
              selector: selection.selector,
              target: { kind: 'new' },
              role: 'primary',
            }
          : selection.kind === 'image'
            ? {
                type: 'branch.createFromSelection',
                blockId: selection.blockId,
                kind: 'image',
                binding: selection.binding,
                selector: selection.selector,
                target: { kind: 'new' },
                role: 'primary',
              }
            : {
                type: 'branch.createFromSelection',
                blockId: selection.blockId,
                kind: 'text',
                binding: selection.binding,
                target: { kind: 'new' },
                role: 'primary',
              };
    return this.session.queue.run(async () => {
      const result = await this.runCommandInternal(command);
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not branch from the selection.' };
      }
      const blockId = result.created?.blockIds[0] ?? null;
      const anchorId = result.created?.anchorIds[0];
      await this.acceptStructural(result.document, result.inverse, blockId);
      this.reconcileEditor(blockId);
      return {
        ok: true,
        ...(blockId === null ? {} : { blockId }),
        ...(anchorId === undefined ? {} : { anchorId }),
      };
    });
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

  /** Canonical split caret for the block menu and structural actions. */
  caretLocation(): BlockCaretLocation | null {
    return this.editor === null ? null : blockCaretLocation(this.editor);
  }

  /**
   * Split the block at the current caret. One typed command covers content,
   * anchor migration, branch sources, and placement; one structural inverse
   * restores the pre-split identity. Focus moves to the new block.
   */
  async splitAtCaret(blockId: string): Promise<ApplyOutcome> {
    return this.session.queue.run(async () => {
      const caret = this.caretLocation();
      if (caret === null) {
        return {
          ok: false,
          message: 'Place the caret inside a text block, without a selection, first.',
        };
      }
      if (caret.blockId !== blockId) {
        return { ok: false, message: 'The caret is in a different block.' };
      }
      const result = await this.runCommandInternal({
        type: 'block.split',
        blockId,
        at: { nodePath: caret.nodePath, offset: caret.offset },
      });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not split the block.' };
      }
      const newBlockId = result.created?.blockIds[0] ?? null;
      await this.acceptStructural(result.document, result.inverse, newBlockId);
      this.reconcileEditor(newBlockId);
      if (newBlockId !== null) {
        this.focusBlock(newBlockId);
        this.selectBlock(newBlockId);
      }
      return {
        ok: true,
        ...(newBlockId === null ? {} : { blockId: newBlockId }),
      };
    });
  }

  /**
   * Merge a block into its previous sibling (same parent port) or previous
   * top-level block (same chapter). The core plan is the single legality
   * source; focus lands at the end of the surviving block.
   */
  async mergeBlock(blockId: string): Promise<ApplyOutcome> {
    return this.session.queue.run(async () => {
      const check = planBlockMerge(this.document, blockId);
      if (!check.ok) return { ok: false, message: check.reason };
      const survivorId = check.plan.intoBlockId;
      const result = await this.runCommandInternal({
        type: 'block.merge',
        blockId,
        intoBlockId: survivorId,
      });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not merge the block.' };
      }
      await this.acceptStructural(result.document, result.inverse, survivorId);
      this.reconcileEditor(survivorId);
      this.focusBlock(survivorId, { at: 'end' });
      this.selectBlock(survivorId);
      return { ok: true, blockId: survivorId };
    });
  }

  /**
   * Link an existing block as a **reference** from a block or one of its
   * anchors. Reference edges are associative: the target keeps its primary
   * home, no chapter/top-level/primary branch record changes, and the core
   * command dedupes an exact source-target pair regardless of role. A duplicate
   * focuses the existing edge's target instead of creating a second edge.
   */
  async linkReference(input: {
    sourceBlockId: string;
    sourceAnchorId?: string;
    targetBlockId: string;
  }): Promise<ApplyOutcome> {
    return this.session.queue.run(async () => {
      if (input.sourceBlockId === input.targetBlockId) {
        return { ok: false, message: 'A block cannot link to itself.' };
      }
      const result = await this.runCommandInternal({
        type: 'branch.create',
        sourceBlockId: input.sourceBlockId,
        ...(input.sourceAnchorId === undefined
          ? {}
          : { sourceAnchorId: input.sourceAnchorId }),
        targetBlockId: input.targetBlockId,
        role: 'reference',
      });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not link the block.' };
      }
      const branch = Object.values(result.document.branches).find(
        (candidate) =>
          candidate.targetBlockId === input.targetBlockId &&
          candidate.source.blockId === input.sourceBlockId &&
          candidate.source.anchorId === input.sourceAnchorId,
      );
      const created =
        branch !== undefined && (result.created?.branchIds ?? []).includes(branch.id);
      await this.acceptStructural(result.document, result.inverse, input.targetBlockId);
      this.reconcileEditor(input.targetBlockId);
      this.selectBlock(input.targetBlockId);
      this.focusBlock(input.targetBlockId, { select: true });
      return {
        ok: true,
        ...(branch === undefined ? {} : { branchId: branch.id }),
        duplicate: !created,
      };
    });
  }

  /**
   * Remove one reference edge. The target block, its primary home, anchors and
   * subtree are untouched; a primary branch is never deleted through this path.
   */
  async deleteReference(branchId: string): Promise<ApplyOutcome> {
    return this.session.queue.run(async () => {
      const branch = this.document.branches[branchId];
      if (branch === undefined) {
        return { ok: false, message: 'This reference no longer exists.' };
      }
      if (branch.role !== 'reference') {
        return { ok: false, message: 'Only reference links can be removed here.' };
      }
      const result = await this.runCommandInternal({
        type: 'branch.delete',
        branchId,
      });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not remove the reference.' };
      }
      await this.acceptStructural(result.document, result.inverse, null);
      this.reconcileEditor(this.selectedBlockId);
      return { ok: true, branchId };
    });
  }

  /**
   * Apply one candidate choice. The command keys on the anchor ID only, so the
   * anchor, its outgoing branch IDs, labels, and targets all survive.
   */
  async repairAnchor(
    anchorId: string,
    selector: JsonObject,
    binding: AnchorBinding,
  ): Promise<ApplyOutcome> {
    const outcome = await this.applyStructural({
      type: 'anchor.repair',
      anchorId,
      selector,
      binding,
    });
    if (outcome.ok) this.keptBroken.delete(anchorId);
    return outcome;
  }

  /**
   * Resolve the editor's current selection into the exact `anchor.repair`
   * command without applying it. The sheet previews this command; Confirm
   * applies it through `repairAnchor`, so the core remains the validation
   * authority and the action stays one undo entry.
   */
  async prepareRepairFromSelection(
    anchorId: string,
  ): Promise<
    | { ok: true; command: AnchorRepairCommand }
    | { ok: false; message: string }
  > {
    return this.session.queue.run(async () => {
      if (!this.editable) {
        return { ok: false, message: 'This document is open read-only.' };
      }
      const committed = await this.commitContentInternal();
      if (!committed) {
        return {
          ok: false,
          message: this.saveError ?? 'Could not commit the pending edit.',
        };
      }
      const anchor = this.document.anchors[anchorId];
      if (anchor === undefined) {
        return { ok: false, message: 'This anchor no longer exists.' };
      }
      const editor = this.editor;
      if (editor === null) {
        return { ok: false, message: 'Open the editor before relinking an anchor.' };
      }
      const picked = branchSelectionAnchor(editor);
      if (!picked.ok) return { ok: false, message: picked.message };
      const selection = picked.selection;
      if (selection.blockId !== anchor.blockId) {
        return {
          ok: false,
          message: 'Select the replacement range in the anchor’s own block.',
        };
      }
      if (selection.kind !== anchor.kind) {
        return {
          ok: false,
          message: `Select ${
            anchor.kind === 'text'
              ? 'text'
              : anchor.kind === 'formula'
                ? 'a formula'
                : 'a code range'
          } in the anchor’s block.`,
        };
      }
      let selector: JsonObject;
      if (selection.kind === 'text') {
        const block = this.document.blocks[anchor.blockId];
        const derived =
          block === undefined
            ? null
            : textAnchorSelectorForBinding(block.content, selection.binding);
        if (derived === null) {
          return { ok: false, message: 'Select one continuous text range.' };
        }
        selector = derived;
      } else {
        selector = selection.selector;
      }
      const command: AnchorRepairCommand = {
        type: 'anchor.repair',
        anchorId,
        selector,
        binding: selection.binding,
      };
      return { ok: true, command };
    });
  }

  /**
   * Turn every outgoing branch into a block-sourced branch and remove the
   * anchor + binding. Branch IDs, labels, and targets survive; undo restores the
   * exact anchored sources and order.
   */
  async attachAnchorToBlock(anchorId: string): Promise<ApplyOutcome> {
    const anchor = this.document.anchors[anchorId];
    if (anchor === undefined) {
      return { ok: false, message: 'This anchor no longer exists.' };
    }
    const outcome = await this.applyStructural(
      { type: 'anchor.attachToBlock', anchorId },
      { focusBlockId: anchor.blockId },
    );
    if (outcome.ok) this.keptBroken.delete(anchorId);
    return outcome;
  }

  /**
   * Remove the anchor explicitly. `attach` keeps branches on the block port;
   * `delete` retires the branches and promotes primary targets. The command
   * never deletes a target block or its subtree.
   */
  async deleteAnchor(
    anchorId: string,
    branches: 'attach' | 'delete',
  ): Promise<ApplyOutcome> {
    const anchor = this.document.anchors[anchorId];
    if (anchor === undefined) {
      return { ok: false, message: 'This anchor no longer exists.' };
    }
    const outcome = await this.applyStructural(
      { type: 'anchor.delete', anchorId, branches },
      { focusBlockId: anchor.blockId },
    );
    if (outcome.ok) this.keptBroken.delete(anchorId);
    return outcome;
  }

  /**
   * Remove an idle anchor (OD-2): no outgoing branch, so `anchor.delete` needs
   * no branch policy. The record and its content binding are removed in one
   * undoable structural command; the target blocks are untouched. A live anchor
   * is rejected here so the idle path can never delete a branch or its target.
   */
  async removeIdleAnchor(anchorId: string): Promise<ApplyOutcome> {
    const anchor = this.document.anchors[anchorId];
    if (anchor === undefined) {
      return { ok: false, message: 'This anchor no longer exists.' };
    }
    const hasOutgoing = Object.values(this.document.branches).some(
      (branch) => branch.source.anchorId === anchorId,
    );
    if (hasOutgoing) {
      return {
        ok: false,
        message: 'Only an idle anchor can be removed here. Repair or delete its branches first.',
      };
    }
    const outcome = await this.applyStructural(
      { type: 'anchor.delete', anchorId },
      { focusBlockId: anchor.blockId },
    );
    if (outcome.ok) this.keptBroken.delete(anchorId);
    return outcome;
  }

  /**
   * Remove exactly one branch under an anchor. A primary target becomes a
   * top-level block after its former top-level ancestor; a reference removal
   * leaves the target's home untouched. No target is deleted.
   */
  async deleteAnchorBranch(branchId: string): Promise<ApplyOutcome> {
    return this.session.queue.run(async () => {
      const branch = this.document.branches[branchId];
      if (branch === undefined) {
        return { ok: false, message: 'This branch no longer exists.' };
      }
      if (branch.source.anchorId === undefined) {
        return { ok: false, message: 'This branch is not anchored.' };
      }
      const result = await this.runCommandInternal({
        type: 'branch.delete',
        branchId,
        ...(branch.role === 'primary'
          ? { targetHandling: { kind: 'promote' as const } }
          : {}),
      });
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? 'Could not delete the branch.' };
      }
      await this.acceptStructural(result.document, result.inverse, branch.source.blockId);
      this.reconcileEditor(branch.source.blockId);
      return { ok: true, branchId };
    });
  }

  /** Session-only dismissal. No command, no mutation, no export effect. */
  keepAnchorBroken(anchorId: string): void {
    if (this.keptBroken.has(anchorId)) return;
    this.keptBroken.add(anchorId);
    this.notify();
  }

  /**
   * Make a reference the target's primary home and demote the old primary edge
   * to a reference. Both branch IDs survive; one structural inverse restores
   * the exact roles, order keys, and chapter slots.
   */
  makeHome(branchId: string): Promise<ApplyOutcome> {
    return this.applyRoleTransition(
      branchId,
      { type: 'branch.makeHome', branchId },
      'Could not make this reference the home.',
    );
  }

  /** Promote a reference and retire the target's old primary edge. */
  moveHere(branchId: string): Promise<ApplyOutcome> {
    return this.applyRoleTransition(
      branchId,
      { type: 'branch.moveHere', branchId },
      'Could not move the target here.',
    );
  }

  /** Convert a primary edge to a reference; the target becomes a root. */
  demoteBranch(branchId: string): Promise<ApplyOutcome> {
    return this.applyRoleTransition(
      branchId,
      { type: 'branch.demote', branchId },
      'Could not demote this branch to a reference.',
    );
  }

  /**
   * Shared role-transition flow: one command, one structural inverse, focus on
   * the target block (the block whose primary home changed).
   */
  private applyRoleTransition(
    branchId: string,
    command: DocumentCommand,
    failureMessage: string,
  ): Promise<ApplyOutcome> {
    return this.session.queue.run(async () => {
      const branch = this.document.branches[branchId];
      if (branch === undefined) {
        return { ok: false, message: 'This branch no longer exists.' };
      }
      const targetId = branch.targetBlockId;
      const result = await this.runCommandInternal(command);
      if (!result.ok || result.document === undefined) {
        return { ok: false, message: result.message ?? failureMessage };
      }
      await this.acceptStructural(result.document, result.inverse, targetId);
      this.reconcileEditor(targetId);
      this.selectBlock(targetId);
      this.focusBlock(targetId, { select: true });
      return { ok: true, branchId };
    });
  }

  async addTopLevel(chapterId: string): Promise<ApplyOutcome> {
    return this.createBlock({
      type: 'block.create',
      placement: { kind: 'top-level', chapterId },
    });
  }

  /**
   * Create a chapter and its first top-level block as one user action.
   *
   * Both commands run inside one queue task and the structural stack receives a
   * single inverse, `chapter.delete` with `delete-blocks`, so one ⌘Z removes
   * the new chapter and its block. `chapter.delete` has no structural inverse
   * yet, so this action is not redoable (recorded as a follow-up in the phase
   * 5c report); the alternative, two stack entries, would undo the block first
   * and leave an empty chapter behind.
   */
  async createChapterWithFirstBlock(
    title: string,
    atIndex: number | undefined,
  ): Promise<ApplyOutcome> {
    return this.session.queue.run(async () => {
      const chapterCommand: DocumentCommand = {
        type: 'chapter.create',
        title,
        ...(atIndex === undefined ? {} : { atIndex }),
      };
      const chapterResult = await this.runCommandInternal(chapterCommand);
      if (!chapterResult.ok || chapterResult.document === undefined) {
        return { ok: false, message: chapterResult.message ?? 'Could not create a chapter.' };
      }
      const chapterId = chapterResult.created?.chapterIds[0];
      if (chapterId === undefined) {
        await this.acceptStructural(chapterResult.document, chapterResult.inverse, null);
        return { ok: false, message: 'The chapter was created without an ID.' };
      }
      const blockResult = await this.runCommandInternal({
        type: 'block.create',
        placement: { kind: 'top-level', chapterId },
      });
      if (!blockResult.ok || blockResult.document === undefined) {
        // Keep the created chapter undoable even though its first block failed.
        await this.acceptStructural(chapterResult.document, chapterResult.inverse, null);
        return { ok: false, message: blockResult.message ?? 'Could not add the first block.' };
      }
      const blockId = blockResult.created?.blockIds[0] ?? null;
      await this.acceptStructural(
        blockResult.document,
        { type: 'chapter.delete', chapterId, blockHandling: { kind: 'delete-blocks' } },
        blockId,
      );
      this.reconcileEditor(blockId);
      return {
        ok: true,
        ...(blockId === null ? {} : { blockId }),
        chapterId,
      };
    });
  }

  /**
   * Verify the ProseMirror buffer and the canonical document agree on the set
   * of block IDs. A mismatch is never kept: rebuild from canonical, drop the
   * canvas-only nodes, and surface a quiet recovery notice.
   */
  reconcileEditor(focusBlockId: string | null = null): boolean {
    if (!this.projection.reconcile(focusBlockId)) return false;
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
    const json = buildBlockNode(
      this.document,
      blockId,
      depth,
      this.collapsed,
      undefined,
      undefined,
      undefined,
      this.assetAvailability,
    );
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
      // A callout lane sits between the body and branchChildren; the targeted
      // insertion below assumes `child(1)` is the direct-child group. Rebuild
      // from canonical instead of inserting at the wrong child index.
      if (hasCalloutLane(blockNode)) return false;
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

  /**
   * Apply a measured right/below placement. The projection changes DOM order
   * only (right group vs below stack); canonical structure and revision stay
   * untouched. Text history is position-based, so the rebuild captures the
   * current text events and replays them through a block-relative map instead
   * of clearing them. A resize/measure pass must not steal focus when the
   * editor was idle.
   */
  applyChildPlacement(belowChildIds: ReadonlySet<string>): void {
    this.projection.applyChildPlacement(belowChildIds);
  }

  /**
   * Rebuild the editor buffer from canonical. `restore` keeps the caret in the
   * same block body; `resetHistory` clears a text stack that no longer maps.
   */
  rebuildEditor(
    focusBlockId: string | null = null,
    options: RebuildOptions = {},
  ): void {
    this.projection.rebuild(focusBlockId, options);
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
    this.projection.focusBlock(blockId, options);
  }

  /** Expand collapsed ancestors so a navigation target is visible. */
  expandAncestors(blockId: string): boolean {
    const ancestors = ancestorPath(this.document, blockId)
      .slice(0, -1)
      .filter((id) => this.collapsed.has(id));
    if (ancestors.length === 0) return false;
    const expanded = new Set(ancestors);
    for (const id of expanded) this.collapsed.delete(id);
    const editor = this.editor;
    if (editor !== null) {
      const transaction = editor.state.tr;
      let changed = false;
      editor.state.doc.descendants((node, position) => {
        if (node.type.name !== 'branchBlock') return true;
        const id = node.attrs['blockId'];
        if (typeof id !== 'string' || !expanded.has(id)) return true;
        transaction.setNodeMarkup(position, undefined, { ...node.attrs, collapsed: false });
        const body = node.firstChild;
        if (body?.type.name === 'blockBody') {
          transaction.setNodeMarkup(position + 1, undefined, { ...body.attrs, collapsed: false });
        }
        changed = true;
        return true;
      });
      if (changed) {
        transaction.setMeta('addToHistory', false);
        transaction.setMeta('preventUpdate', true);
        editor.view.dispatch(transaction);
      }
    }
    this.version += 1;
    this.notify();
    return true;
  }

  private anchorBranchesFor(blockId: string, anchorId: string) {
    return anchoredChildBranches(this.document, blockId).filter(
      (branch) =>
        branch.source.anchorId === anchorId &&
        this.document.blocks[branch.targetBlockId] !== undefined,
    );
  }

  private applyAnchorSelection(selection: EditorAnchorSelection): void {
    this.selectedAnchor = selection;
    this.selectionExplicit = true;
    // The same action that selects an anchor also focuses its source or target
    // in the editor. That focus emits a selection sync after this call; the
    // hold keeps the anchor until a real editor interaction clears it (pointer
    // or keyboard) or an explicit selectBlock replaces the selection.
    this.anchorFocusHold = true;
    if (this.editor !== null) setEditorSelectedAnchor(this.editor, selection);
    this.notify();
  }

  /** Drop a view-only anchor selection whose branch no longer exists. */
  private validateSelectedAnchor(): void {
    const selection = this.selectedAnchor;
    if (selection === null) return;
    const branch = this.document.branches[selection.branchId];
    const valid =
      this.document.blocks[selection.blockId] !== undefined &&
      this.document.blocks[selection.targetBlockId] !== undefined &&
      branch !== undefined &&
      branch.targetBlockId === selection.targetBlockId &&
      branch.source.blockId === selection.blockId &&
      branch.source.anchorId === selection.anchorId;
    if (valid) return;
    this.selectedAnchor = null;
    if (this.editor !== null) setEditorSelectedAnchor(this.editor, null);
  }

  clearAnchorSelection(): void {
    this.anchorFocusHold = false;
    if (this.selectedAnchor === null) return;
    this.selectedAnchor = null;
    if (this.editor !== null) setEditorSelectedAnchor(this.editor, null);
    this.notify();
  }

  /** Select one anchored branch; defaults to the anchor's first branch. */
  selectAnchor(
    blockId: string,
    anchorId: string,
    branchId?: string,
  ): EditorAnchorSelection | null {
    const branches = this.anchorBranchesFor(blockId, anchorId);
    if (branches.length === 0) {
      this.clearAnchorSelection();
      return null;
    }
    const branch =
      (branchId === undefined ? undefined : branches.find((item) => item.id === branchId)) ??
      branches[0];
    if (branch === undefined) return null;
    const selection: EditorAnchorSelection = {
      blockId,
      anchorId,
      branchId: branch.id,
      targetBlockId: branch.targetBlockId,
    };
    this.applyAnchorSelection(selection);
    return selection;
  }

  /** Select the anchor's first branch or advance to the next one. */
  cycleAnchor(blockId: string, anchorId: string): EditorAnchorSelection | null {
    const branches = this.anchorBranchesFor(blockId, anchorId);
    if (branches.length === 0) {
      this.clearAnchorSelection();
      return null;
    }
    const current =
      this.selectedAnchor?.blockId === blockId && this.selectedAnchor.anchorId === anchorId
        ? branches.findIndex((branch) => branch.id === this.selectedAnchor?.branchId)
        : -1;
    const branch = branches[(current + 1) % branches.length] ?? branches[0];
    if (branch === undefined) return null;
    const selection: EditorAnchorSelection = {
      blockId,
      anchorId,
      branchId: branch.id,
      targetBlockId: branch.targetBlockId,
    };
    this.applyAnchorSelection(selection);
    return selection;
  }

  /** Marker click: keep the source block selected and cycle its branches. */
  activateAnchor(blockId: string, anchorId: string): EditorAnchorSelection | null {
    if (this.selectedBlockId !== blockId) {
      this.selectedBlockId = blockId;
      if (this.editor !== null) setEditorSelectedBlock(this.editor, blockId, false);
    }
    this.selectionExplicit = true;
    return this.cycleAnchor(blockId, anchorId);
  }

  selectBlock(blockId: string | null): void {
    this.setBlockSelection(blockId, true);
  }

  /** Mark the interaction as a user selection before the sync reports a block. */
  markSelectionExplicit(): void {
    this.selectionExplicit = true;
  }

  private setBlockSelection(blockId: string | null, explicit: boolean): void {
    let changed = false;
    if (this.selectedBlockId !== blockId) {
      this.selectedBlockId = blockId;
      changed = true;
    }
    if (explicit || blockId === null) this.selectionExplicit = explicit && blockId !== null;
    // An explicit block selection always owns the selection. Even the anchor's
    // source or target clears the highlight; the sidebar anchor row restores it
    // by calling selectAnchor right after selectBlock, while a canvas click
    // leaves exactly one block selected.
    this.anchorFocusHold = false;
    if (this.selectedAnchor !== null) {
      this.selectedAnchor = null;
      if (this.editor !== null) setEditorSelectedAnchor(this.editor, null);
      changed = true;
    }
    if (changed) this.notify();
  }

  /**
   * Block selection reported by the ProseMirror focus/selection sync. Unlike an
   * explicit selectBlock, a sync emitted by focusing an anchor's source or
   * target keeps a just-installed anchor selection. A pointer or key in the
   * editor clears the anchor first, so canvas interaction always wins.
   */
  syncEditorBlockSelection(blockId: string | null): void {
    const selection = this.selectedAnchor;
    if (
      this.anchorFocusHold &&
      selection !== null &&
      (blockId === selection.blockId || blockId === selection.targetBlockId)
    ) {
      if (this.selectedBlockId !== blockId) {
        this.selectedBlockId = blockId;
        this.notify();
      }
      return;
    }
    this.setBlockSelection(blockId, false);
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
    return this.session.queue.run(async () => {
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
    return this.session.queue.run(async () => {
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
    const newParentId = parentIdOf(this.document, blockId);
    if (oldParentId !== null) {
      const oldParent = locate(editor.state.doc, oldParentId);
      if (oldParent !== null && hasCalloutLane(oldParent.node)) return false;
    }
    if (newParentId !== null) {
      const newParent = locate(editor.state.doc, newParentId);
      if (newParent !== null && hasCalloutLane(newParent.node)) return false;
    }
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
    return this.session.queue.run(async () => {
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
    // Callout rows live in their own lane, not in `branchChildren`; a sibling
    // reorder across the lane boundary must rebuild from canonical.
    if (source.node.attrs['callout'] === true) return false;
    const transaction = editor.state.tr;
    transaction.delete(source.position, source.position + source.node.nodeSize);
    const target = locate(transaction.doc, targetId);
    if (target === null) return false;
    if (target.node.attrs['callout'] === true) return false;
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
    return this.session.queue.run(async () => {
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
    return this.session.queue.run(async () => {
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
    if (mode === 'promote' && hasCalloutLane(sourceNode)) return false;
    if (oldParentId !== null) {
      const oldParent = locate(editor.state.doc, oldParentId);
      if (oldParent !== null && hasCalloutLane(oldParent.node)) return false;
    }
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
    return this.session.queue.run(async () => {
      const focus = this.projection.captureFocusContext();
      const inverse = this.session.popUndo();
      if (inverse === undefined) return { ok: false, message: 'Nothing to undo.' };
      await this.commitContentInternal();
      const result = await this.session.apply(inverse);
      if (!result.ok || result.document === undefined) {
        // A rejected inverse is not retryable at the top of the stack: leaving
        // it there would repeat the same error forever and hide older history.
        // The error is reported by the caller; the next undo reaches the entry
        // below this one.
        this.notify();
        return { ok: false, message: result.message ?? 'Could not undo.' };
      }
      this.session.acceptUndo(result.document, result.inverse);
      const target = this.projection.resolveFocusContext(focus);
      this.rebuildEditor(target, { restore: focus, resetHistory: true });
      this.reconcileEditor(target);
      this.notify();
      this.scheduleSave();
      return { ok: true };
    });
  }

  async redoStructural(): Promise<ApplyOutcome> {
    return this.session.queue.run(async () => {
      const focus = this.projection.captureFocusContext();
      const command = this.session.popRedo();
      if (command === undefined) return { ok: false, message: 'Nothing to redo.' };
      await this.commitContentInternal();
      const result = await this.session.apply(command);
      if (!result.ok || result.document === undefined) {
        // Same rule as undo: a failed redo is dropped, reported, and never
        // retried forever at the top of the stack.
        this.notify();
        return { ok: false, message: result.message ?? 'Could not redo.' };
      }
      this.session.acceptRedo(result.document, result.inverse);
      const target = this.projection.resolveFocusContext(focus);
      this.rebuildEditor(target, { restore: focus, resetHistory: true });
      this.reconcileEditor(target);
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
      this.session.replaceDocument({ ...original, chapters });
      this.rebuildEditor(null);
    }
    this.session.replaceDocument(original);
    this.rebuildEditor(null);
  }

  dispose(): void {
    this.saves.dispose();
    this.listeners.clear();
    this.projection.attach(null);
  }
}
