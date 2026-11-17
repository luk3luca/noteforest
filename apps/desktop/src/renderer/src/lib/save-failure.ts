/**
 * Save-failure state machine (pure).
 *
 * Kept out of the runtime class so the backoff sequence, the typed code
 * preservation, and the "never claim Saved while work is pending" rule are
 * unit-tested without an editor or Electron.
 */

import type { SaveFailureCode } from '../../../shared/api';

/** 2 s, 5 s, 15 s, then stop automatic retries until Retry/action. */
export const SAVE_BACKOFF_MS: readonly number[] = [2000, 5000, 15000];

export interface SaveFailure {
  code: SaveFailureCode;
  message: string;
  /**
   * Technical line for `Details` (dialogs.md §3): the raw `core` sentence when
   * the short line is a mapped recovery reason. Absent for a plain write error,
   * where the message is already the technical value.
   */
  details?: string;
  /** Consecutive automatic failures since the last explicit Retry. */
  attempt: number;
}

export interface SaveFailureTransition {
  failure: SaveFailure;
  /** Delay before the next automatic attempt, or null when retries stop. */
  retryInMs: number | null;
}

/**
 * Record one failed save. The code/message from the store are preserved
 * verbatim; only the attempt counter and the backoff are derived here.
 */
export function nextSaveFailure(
  previous: SaveFailure | null,
  code: SaveFailureCode,
  message: string,
  details?: string,
): SaveFailureTransition {
  const attempt = (previous?.attempt ?? 0) + 1;
  return {
    failure: { code, message, ...(details === undefined ? {} : { details }), attempt },
    retryInMs: SAVE_BACKOFF_MS[attempt - 1] ?? null,
  };
}

/** An explicit Retry restarts the backoff sequence but keeps the failure visible. */
export function prepareRetry(previous: SaveFailure | null): SaveFailure | null {
  if (previous === null) return null;
  return { ...previous, attempt: 0 };
}

/**
 * What the status may say after a successful write. If anything arrived while
 * the save was in flight, the document is still unsaved — never "Saved".
 */
export function saveStatusAfterWrite(input: {
  editedDuringSave: boolean;
  pendingWork: boolean;
}): 'saved' | 'unsaved' {
  return input.editedDuringSave || input.pendingWork ? 'unsaved' : 'saved';
}

export function saveFailureHeadline(code: SaveFailureCode): string {
  switch (code) {
    case 'read-only':
      return 'This note is open read-only.';
    case 'permission':
      return 'NoteForest can’t write to this folder.';
    case 'disk-full':
      return 'The disk is full.';
    case 'external-modification':
      return 'This file changed on disk.';
    case 'lock-lost':
      return 'Another NoteForest window took over this note.';
    case 'backup-failed':
      return 'The backup couldn’t be written.';
    case 'invalid-document':
      return 'The note has a problem that stops the save.';
    case 'not-found':
      return 'The note’s file is missing.';
    default:
      return 'The note couldn’t be saved.';
  }
}

/** One short, actionable sentence under the headline. */
export function saveFailureHint(code: SaveFailureCode): string {
  switch (code) {
    case 'read-only':
      return 'Reopen it read-write, or save a copy.';
    case 'permission':
      return 'Check the folder permissions and Retry, or save a copy elsewhere.';
    case 'disk-full':
      return 'Free some space and Retry, or save a copy to another disk.';
    case 'external-modification':
      return 'Nothing was written. Reload, overwrite, or save a copy.';
    case 'lock-lost':
      return 'Reopen it, or save a copy.';
    case 'backup-failed':
      return 'Retry once the backup location is writable, or save a copy.';
    case 'invalid-document':
      return 'Save a copy to rescue the content, then reopen the original.';
    case 'not-found':
      return 'The file was moved or deleted. Save a copy to recover your edits.';
    default:
      return 'Retry, save a copy somewhere else, or reload the file from disk.';
  }
}

export type SaveFailureAction =
  | 'retry'
  | 'overwrite'
  | 'restore-backup'
  | 'save-copy'
  | 'reload'
  | 'reveal';

/**
 * Actions available for one failure. Overwrite is the only code-specific
 * action: it is offered for an external modification and never for a
 * permission, disk-full, read-only, or lock failure. Backup restore is offered
 * for every failure because it always writes a new copy.
 */
export function canOverwriteExternal(code: SaveFailureCode): boolean {
  return code === 'external-modification';
}

export function saveFailureActions(code: SaveFailureCode): readonly SaveFailureAction[] {
  if (canOverwriteExternal(code)) {
    return ['retry', 'overwrite', 'restore-backup', 'save-copy', 'reload', 'reveal'];
  }
  return ['retry', 'restore-backup', 'save-copy', 'reload', 'reveal'];
}

export interface OverwriteConfirmation {
  title: string;
  /** States the loss in one sentence; the path lives in Details. */
  description: string;
  path: string;
  confirmLabel: string;
  /** The safe default. Overwrite is never preselected or auto-confirmed. */
  defaultAction: 'cancel';
}

export function overwriteConfirmation(packagePath: string): OverwriteConfirmation {
  return {
    title: 'Overwrite file on disk?',
    description:
      'This replaces the file on disk; the external changes are lost. Reload instead to keep them.',
    path: packagePath,
    confirmLabel: 'Overwrite',
    defaultAction: 'cancel',
  };
}
