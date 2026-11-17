/**
 * Save/autosave/flush coordinator.
 *
 * The runtime keeps the serial queue, the canonical document, and the editor
 * commit; this class owns every save-lifecycle timer and the observable state
 * the UI reads (`dirty`, `saveState`, `saveError`, `saveFailure`).
 *
 * Behavior is unchanged from the runtime implementation it was extracted from:
 * atomic saves are serialized with commands, a failed save pauses autosave and
 * owns the backoff retry, a successful save never claims Saved while an edit
 * landed in flight, and close/quit still flush through the same `saveNow`.
 */

import type {
  SaveCopyResult,
  SaveFailureCode,
  SaveRequestOptions,
  SaveResult,
} from '../../../shared/api';
import {
  nextSaveFailure,
  prepareRetry,
  saveStatusAfterWrite,
  type SaveFailure,
} from '../lib/save-failure';
import type { SerialQueue } from '../lib/serial-queue';

export type { SaveFailure } from '../lib/save-failure';

/** Commit the editor buffer shortly after typing stops. */
export const CONTENT_COMMIT_DELAY_MS = 220;
/** Autosave debounce after any local edit. */
export const AUTOSAVE_DELAY_MS = 800;

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';

/**
 * Explicit save-lifecycle state.
 *
 *   saved ── text/structure/content ──▶ unsaved
 *   unsaved ── write starts ──▶ saving
 *   saving ── write ok, nothing in flight ──▶ saved
 *   saving ── write ok, edit/pending commit ──▶ unsaved
 *   saving ── write fails ──▶ error
 *   unsaved/error ── write starts ──▶ saving
 *   any ── reload / stale-lock takeover ──▶ saved
 *
 * `dirty` belongs to the phase because a write can be in flight while new text
 * arrives; `saving` is the only phase that can be either clean or dirty.
 */
export type SavePhase =
  | { readonly status: 'saved'; readonly dirty: false }
  | { readonly status: 'unsaved'; readonly dirty: true }
  | { readonly status: 'saving'; readonly dirty: boolean; readonly failure: SaveFailure | null }
  | { readonly status: 'error'; readonly dirty: true; readonly failure: SaveFailure };

/**
 * Collaborators the runtime supplies. The coordinator never touches the
 * gateway, the document, or the editor directly.
 */
export interface SaveCoordinatorPorts {
  /** The document's serial queue: writes never overlap commands or commits. */
  queue: SerialQueue;
  /** True while the document is writable. */
  isEditable(): boolean;
  /**
   * Commit the editor buffer into canonical content. Runs inside the queue and
   * returns false only after recording the failure with `recordFailure`.
   */
  commit(): Promise<boolean>;
  /** Write the canonical document; options are forwarded to the gateway. */
  write(options?: SaveRequestOptions): Promise<SaveResult>;
  /** Save a copy through the platform recovery action. */
  saveCopy(): Promise<SaveCopyResult>;
  /** Store the revision returned by a successful write. */
  applyRevision(revision: number | undefined): void;
  /** Notify UI subscribers after an observable save-state change. */
  changed(): void;
}

export class SaveCoordinator {
  private readonly ports: SaveCoordinatorPorts;

  private phase: SavePhase = { status: 'saved', dirty: false };

  private contentTimer: ReturnType<typeof setTimeout> | null = null;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Monotonic count of every local change. A write compares it with its start
   * value so the status never claims Saved for content that arrived while the
   * write was in flight.
   */
  private editEpoch = 0;

  private disposed = false;

  constructor(ports: SaveCoordinatorPorts) {
    this.ports = ports;
  }

  get dirty(): boolean {
    return this.phase.dirty;
  }

  get saveState(): SaveState {
    return this.phase.status;
  }

  get saveFailure(): SaveFailure | null {
    return this.phase.status === 'saving' || this.phase.status === 'error'
      ? this.phase.failure
      : null;
  }

  /** The message shown next to the status. A retained failure is hidden while retrying. */
  get saveError(): string | null {
    return this.phase.status === 'error' ? this.phase.failure.message : null;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * A text edit landed. Marks the document dirty, starts the content debounce
   * and the autosave debounce, and leaves an active failure as the owner of
   * the retry schedule.
   */
  noteTextEdit(): void {
    this.editEpoch += 1;
    if (this.saveFailure === null) {
      this.setPhase({ status: 'unsaved', dirty: true });
    } else {
      this.setPhase(this.withDirty(this.phase));
    }
    this.clearPendingCommit();
    this.contentTimer = setTimeout(() => {
      this.contentTimer = null;
      void this.ports.queue.run(() => this.ports.commit());
    }, CONTENT_COMMIT_DELAY_MS);
    this.scheduleSave(AUTOSAVE_DELAY_MS);
  }

  /**
   * A structural command changed the canonical document. Same visible state as
   * a text edit, but the caller rebuilds the editor and schedules the save at
   * the end of its own queue task.
   */
  noteStructuralChange(): void {
    this.editEpoch += 1;
    if (this.saveFailure === null) {
      this.setPhase({ status: 'unsaved', dirty: true });
    } else {
      this.setPhase(this.withDirty(this.phase));
    }
  }

  /**
   * Content was committed to the core store. The document is dirty, and an
   * existing failure stays authoritative; a content commit never downgrades it
   * to a plain Unsaved state.
   */
  markContentCommitted(): void {
    const failure = this.saveFailure;
    if (failure === null) {
      this.setPhase({ status: 'unsaved', dirty: true });
    } else {
      this.setPhase({ status: 'error', dirty: true, failure });
    }
  }

  /** Record one failed write: typed code/message verbatim, then backoff. */
  recordFailure(code: SaveFailureCode, message: string, details?: string): void {
    const transition = nextSaveFailure(this.saveFailure, code, message, details);
    this.setPhase({ status: 'error', dirty: true, failure: transition.failure });
    // A repeated failure must keep its recovery surface mounted, so notify even
    // when the visible message did not change (the attempt counter did).
    this.ports.changed();
    if (transition.retryInMs !== null) this.scheduleRetry(transition.retryInMs);
  }

  /** Schedule an autosave; paused while a failure owns the retry schedule. */
  scheduleSave(delay = AUTOSAVE_DELAY_MS): void {
    if (!this.ports.isEditable() || this.saveFailure !== null) return;
    this.clearSaveTimer();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.saveNow();
    }, delay);
  }

  /** Commit pending content and write immediately (⌘S, close tab, flush). */
  saveNow(): Promise<void> {
    return this.ports.queue.run(() => this.saveNowLocked());
  }

  /**
   * Explicit recovery for `external-modification`: write this window's content
   * over the file that changed on disk. The caller must have shown the
   * non-default confirmation first.
   */
  overwriteExternal(): Promise<{ ok: boolean; message?: string }> {
    return this.ports.queue.run(async () => {
      if (!this.ports.isEditable()) {
        return { ok: false, message: 'This note is open read-only.' };
      }
      if (this.saveFailure?.code !== 'external-modification') {
        return { ok: false, message: 'There is no external modification to overwrite.' };
      }
      this.clearTimers();
      const epochAtStart = this.editEpoch;
      this.beginWrite();
      const committed = await this.ports.commit();
      if (!committed) {
        return { ok: false, message: this.saveError ?? 'Could not prepare the overwrite.' };
      }
      if (this.disposed) return { ok: false, message: 'The document was closed.' };
      const result = await this.ports.write({ overwriteExternal: true });
      if (this.disposed) return { ok: false, message: 'The document was closed.' };
      if (!result.ok) {
        this.recordFailure(result.code, result.error, result.details);
        return { ok: false, message: result.error };
      }
      this.applyWriteSuccess(result.revision, epochAtStart);
      return { ok: true };
    });
  }

  /** Explicit Retry from the recovery surface: restart the backoff sequence. */
  async retrySave(): Promise<void> {
    if (!this.ports.isEditable()) return;
    this.clearRetryTimer();
    const failure = this.saveFailure;
    if (failure !== null) {
      const prepared = prepareRetry(failure);
      if (prepared !== null) {
        // The failure stays visible while the retry is in flight; retrySave
        // deliberately does not notify before the write starts.
        this.phase =
          this.phase.status === 'saving'
            ? { ...this.phase, failure: prepared }
            : { status: 'error', dirty: true, failure: prepared };
      }
    }
    await this.saveNow();
  }

  /**
   * Write the current canonical content into a new package. A successful copy
   * clears the failure and re-enables autosave, per the recovery contract.
   */
  saveCopy(): Promise<SaveCopyResult> {
    return this.ports.queue.run(async () => {
      this.clearPendingCommit();
      const committed = await this.ports.commit();
      if (!committed) {
        return { ok: false, message: this.saveError ?? 'Could not prepare the copy.' };
      }
      const result = await this.ports.saveCopy();
      if (result.ok) {
        this.clearRetryTimer();
        if (this.dirty) {
          this.setPhase({ status: 'unsaved', dirty: true });
          this.scheduleSave();
        } else {
          this.setPhase({ status: 'saved', dirty: false });
        }
      }
      return result;
    });
  }

  /** Cancel only the content debounce; the caller commits explicitly. */
  clearPendingCommit(): void {
    if (this.contentTimer !== null) {
      clearTimeout(this.contentTimer);
      this.contentTimer = null;
    }
  }

  clearTimers(): void {
    this.clearPendingCommit();
    this.clearSaveTimer();
    this.clearRetryTimer();
  }

  /**
   * Reload or stale-lock takeover replaced the canonical document: drop
   * pending timers, failures, and dirty state. The caller notifies its own
   * subscribers once the new document and editor projection are in place.
   */
  reset(): void {
    this.clearTimers();
    this.phase = { status: 'saved', dirty: false };
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  private async saveNowLocked(): Promise<void> {
    if (!this.ports.isEditable() || this.disposed) return;
    this.clearTimers();
    const epochAtStart = this.editEpoch;
    this.beginWrite();
    const committed = await this.ports.commit();
    if (!committed || this.disposed) return;
    const result = await this.ports.write();
    if (this.disposed) return;
    if (!result.ok) {
      this.recordFailure(result.code, result.error, result.details);
      return;
    }
    this.applyWriteSuccess(result.revision, epochAtStart);
  }

  /** Enter `saving`, keeping a failure visible for the recovery surface. */
  private beginWrite(): void {
    this.setPhase({ status: 'saving', dirty: this.dirty, failure: this.saveFailure });
  }

  private applyWriteSuccess(revision: number | undefined, epochAtStart: number): void {
    this.ports.applyRevision(revision);
    const pending = saveStatusAfterWrite({
      editedDuringSave: this.editEpoch !== epochAtStart,
      pendingWork: this.contentTimer !== null,
    });
    const dirty = pending === 'unsaved';
    this.setPhase(
      dirty ? { status: 'unsaved', dirty: true } : { status: 'saved', dirty: false },
    );
    if (dirty) this.scheduleSave();
    this.ports.changed();
  }

  private scheduleRetry(delay: number): void {
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.saveNow();
    }, delay);
  }

  private clearSaveTimer(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /** Keep the current phase but mark it dirty; a failure never loses its surface. */
  private withDirty(phase: SavePhase): SavePhase {
    return phase.status === 'saved' ? { status: 'unsaved', dirty: true } : { ...phase, dirty: true };
  }

  private setPhase(next: SavePhase): void {
    if (samePhase(this.phase, next)) return;
    this.phase = next;
    this.ports.changed();
  }
}

function failureOf(phase: SavePhase): SaveFailure | null {
  return phase.status === 'saving' || phase.status === 'error' ? phase.failure : null;
}

function samePhase(left: SavePhase, right: SavePhase): boolean {
  if (left.status !== right.status || left.dirty !== right.dirty) return false;
  const leftFailure = failureOf(left);
  const rightFailure = failureOf(right);
  return (
    leftFailure?.code === rightFailure?.code &&
    leftFailure?.message === rightFailure?.message &&
    leftFailure?.attempt === rightFailure?.attempt
  );
}
