/**
 * Canonical document session.
 *
 * Owns the state that must never diverge between the editor, the save
 * coordinator, and the main-process store:
 *
 * - the canonical `Document` and its monotonic `revision`;
 * - the per-document serial queue that keeps content commits and structural
 *   commands mutually exclusive (so a command's base revision is exact);
 * - the structural undo/redo stacks and `lastHistoryOperation`;
 * - typed command application, inverse acceptance, and the content-commit
 *   bookkeeping (per-block content hashes);
 * - the canonical change hooks the composition root wires to its structure
 *   version and UI notification (S2-4 live health depends on this order).
 *
 * The session deliberately owns no editor, DOM, view state, timers, or save
 * policy: the runtime supplies those through `DocumentSessionPorts`, and the
 * gateway is the only platform access. It never calls `window.noteforest`.
 *
 * Base-revision semantics are unchanged from the runtime implementation this
 * was extracted from: every command runs inside the queue, `execute` commits
 * the editor buffer first, and the canonical document/revision advance only
 * from the gateway result the main process produced for that exact state.
 */

import type { ContentNode, Document, DocumentCommand } from '@noteforest/core';
import type { ApplyResult, SaveFailureCode } from '../../../shared/api';
import { createSerialQueue, type SerialQueue } from '../lib/serial-queue';
import type { DocumentGateway } from './document-gateway';

/** One already-merged block body that differs from canonical content. */
export interface ContentChange {
  readonly blockId: string;
  /** Canonical root content (unknown root data preserved, children replaced). */
  readonly content: ContentNode;
}

/** What the last user-visible operation touched; drives undo/redo routing. */
export type HistoryOperation = 'text' | 'structural';

/**
 * Collaborators the composition root supplies. The session never touches the
 * editor, the save coordinator, or UI state directly.
 */
export interface DocumentSessionPorts {
  /**
   * The document key at call time. A draft starts as `draft:<id>` and becomes a
   * real package path after materialization; the session never caches it.
   */
  packagePath(): string;
  /** Platform port; the only way commands and content commits reach the store. */
  readonly gateway: DocumentGateway;
  /** Adopt a new package path returned by a command/save (draft materialization). */
  adoptPackagePath(next: string): void;
  /** True while the document is writable. */
  isEditable(): boolean;
  /**
   * Commit the editor buffer into canonical content. Runs inside the queue and
   * returns false only after recording the failure with `recordFailure`.
   */
  commitEditor(): Promise<boolean>;
  /** Bump the canonical structure version before the caller rebuilds the editor. */
  bumpVersion(): void;
  /** Notify UI subscribers after a canonical change. */
  notify(): void;
  /** Save lifecycle: canonical content was committed to the core store. */
  markContentCommitted(): void;
  /** Save lifecycle: a structural command changed the canonical document. */
  noteStructuralChange(): void;
  /** Save lifecycle: record one failed command/write with its typed code. */
  recordFailure(code: SaveFailureCode, message: string): void;
  /** Message of the current save failure, or null. */
  saveError(): string | null;
}

export class DocumentSession {
  /** Serializes content commits and every structural command for this document. */
  readonly queue: SerialQueue;

  private document: Document;

  /** Last accepted JSON of each block's canonical content; change detection only. */
  private readonly hashes = new Map<string, string>();

  private readonly undoStack: DocumentCommand[] = [];

  private readonly redoStack: DocumentCommand[] = [];

  private historyOperation: HistoryOperation | null = null;

  constructor(
    document: Document,
    private readonly ports: DocumentSessionPorts,
  ) {
    this.document = document;
    this.queue = createSerialQueue();
    this.recomputeHashes();
  }

  /** Canonical document at the current revision. */
  get canonical(): Document {
    return this.document;
  }

  /** Canonical revision the next command will be applied against. */
  get revision(): number {
    return this.document.revision;
  }

  get lastHistoryOperation(): HistoryOperation | null {
    return this.historyOperation;
  }

  get canUndoStructural(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedoStructural(): boolean {
    return this.redoStack.length > 0;
  }

  /** Record that a text undo/redo was applied through this session. */
  markTextHistory(): void {
    this.historyOperation = 'text';
  }

  /**
   * Run one typed command inside the queue after committing the editor buffer.
   * Callers must already be inside `queue.run` (or use `queue.run` themselves).
   * This is the base-revision guard: the command reaches the store only after
   * every pending text edit has been committed, so the store applies it to the
   * revision the renderer just produced.
   */
  async execute(command: DocumentCommand): Promise<ApplyResult> {
    if (!this.ports.isEditable()) {
      return { ok: false, message: 'This document is open read-only.', code: 'read-only' };
    }
    const committed = await this.ports.commitEditor();
    if (!committed) {
      return {
        ok: false,
        message: this.ports.saveError() ?? 'Could not commit the pending edit.',
        code: 'unknown',
      };
    }
    return this.apply(command);
  }

  /** Apply one command through the gateway without the editable/commit guards. */
  async apply(command: DocumentCommand): Promise<ApplyResult> {
    const result = await this.ports.gateway.apply(this.ports.packagePath(), command);
    this.adoptResultPath(result.packagePath);
    return result;
  }

  /**
   * Adopt a package path returned by the main process. This is how a draft's
   * first command can materialize the package; the document id, content, and
   * history stay exactly as they are.
   */
  private adoptResultPath(next: string | undefined): void {
    if (typeof next !== 'string' || next.length === 0) return;
    if (next === this.ports.packagePath()) return;
    this.ports.adoptPackagePath(next);
  }

  /**
   * Accept a successful structural result.
   *
   * One inverse per user action: the caller passes the single inverse the core
   * returned for the whole command (composite commands stay one entry). Any new
   * structural command invalidates structural redo, including destructive
   * commands whose inverse is not implemented yet.
   */
  acceptStructural(
    document: Document,
    inverse: DocumentCommand | null | undefined,
  ): void {
    this.document = document;
    if (inverse !== undefined && inverse !== null) {
      this.undoStack.push(inverse);
    }
    this.redoStack.length = 0;
    this.historyOperation = 'structural';
    this.ports.bumpVersion();
    this.ports.noteStructuralChange();
    this.recomputeHashes();
  }

  /**
   * Pop the next structural inverse. A rejected inverse is dropped by the
   * caller (it is not pushed back), so one broken entry can never hide older
   * history.
   */
  popUndo(): DocumentCommand | undefined {
    return this.undoStack.pop();
  }

  /** Pop the next structural redo command. */
  popRedo(): DocumentCommand | undefined {
    return this.redoStack.pop();
  }

  /** Accept a successful undo: the returned inverse becomes the redo entry. */
  acceptUndo(
    document: Document,
    inverse: DocumentCommand | null | undefined,
  ): void {
    this.document = document;
    if (inverse !== undefined && inverse !== null) {
      this.redoStack.push(inverse);
    }
    this.historyOperation = 'structural';
    this.ports.bumpVersion();
    this.ports.noteStructuralChange();
    this.recomputeHashes();
  }

  /** Accept a successful redo: the returned inverse becomes the undo entry. */
  acceptRedo(
    document: Document,
    inverse: DocumentCommand | null | undefined,
  ): void {
    this.document = document;
    if (inverse !== undefined && inverse !== null) {
      this.undoStack.push(inverse);
    }
    this.historyOperation = 'structural';
    this.ports.bumpVersion();
    this.ports.noteStructuralChange();
    this.recomputeHashes();
  }

  /** True when the merged content differs from the last accepted content. */
  contentChanged(blockId: string, content: ContentNode): boolean {
    return this.hashes.get(blockId) !== JSON.stringify(content);
  }

  /**
   * Commit already-merged content changes through the gateway.
   *
   * Each change is one `block.editContent` command; a failure records the typed
   * save failure and stops immediately, leaving earlier changes accepted
   * exactly as the store accepted them. Only a successful pass bumps the
   * canonical version and notifies: a content commit can change derived anchor
   * state (resolved → broken → resolved), and inline warnings, callouts, and the
   * health chip must update from the same content revision before the disk save.
   */
  async commitContent(changes: readonly ContentChange[]): Promise<boolean> {
    if (changes.length === 0) return true;
    let documentChanged = false;
    for (const change of changes) {
      const result = await this.apply({
        type: 'block.editContent',
        blockId: change.blockId,
        content: change.content,
      });
      if (!result.ok) {
        // Keep the two codes a command can report with a real user meaning: a
        // read-only open and a missing destination (a vanished library or a
        // removed "New note here" target). Everything else stays generic.
        const code: SaveFailureCode =
          result.code === 'read-only' || result.code === 'not-found'
            ? result.code
            : 'unknown';
        this.ports.recordFailure(code, result.message ?? 'Could not save the edit.');
        return false;
      }
      if (result.document !== undefined) {
        this.document = result.document;
        documentChanged = true;
      }
      this.hashes.set(change.blockId, JSON.stringify(change.content));
    }
    if (documentChanged) this.ports.bumpVersion();
    this.ports.markContentCommitted();
    if (documentChanged) this.ports.notify();
    return true;
  }

  /** Store the revision a successful disk write reported. */
  applyRevision(revision: number | undefined): void {
    if (revision === undefined) return;
    this.document = { ...this.document, revision };
  }

  /**
   * Reload or stale-lock takeover replaced the canonical document. The old
   * structural inverses and text-history marker no longer describe it; content
   * hashes are rebuilt from the new snapshot.
   */
  reset(document: Document): void {
    this.document = document;
    this.recomputeHashes();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.historyOperation = null;
  }

  /**
   * Diagnostic/test hook only: swap the canonical structure without touching
   * history, hashes, revision, or save bookkeeping. `benchmarkFullReflow`
   * permutes chapter order in place and restores the original document.
   */
  replaceDocument(document: Document): void {
    this.document = document;
  }

  private recomputeHashes(): void {
    this.hashes.clear();
    for (const [id, block] of Object.entries(this.document.blocks)) {
      this.hashes.set(id, JSON.stringify(block.content));
    }
  }
}
