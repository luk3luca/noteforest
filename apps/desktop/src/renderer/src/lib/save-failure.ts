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
): SaveFailureTransition {
  const attempt = (previous?.attempt ?? 0) + 1;
  return {
    failure: { code, message, attempt },
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
      return 'This document is open read-only.';
    case 'permission':
      return 'NoteForest cannot write to this folder.';
    case 'disk-full':
      return 'The disk is full.';
    case 'external-modification':
      return 'This file changed on disk outside NoteForest.';
    case 'lock-lost':
      return 'Another copy of NoteForest took over this document.';
    case 'backup-failed':
      return 'The safety backup could not be written.';
    case 'invalid-document':
      return 'The document did not pass validation.';
    case 'not-found':
      return 'The document file is missing.';
    default:
      return 'The document could not be saved.';
  }
}

/** One short, actionable sentence under the headline. */
export function saveFailureHint(code: SaveFailureCode): string {
  switch (code) {
    case 'read-only':
      return 'Reopen the document read-write, or save a copy somewhere else.';
    case 'permission':
      return 'Check the folder permissions and Retry, or save a copy elsewhere.';
    case 'disk-full':
      return 'Free some space and Retry, or save a copy to another disk.';
    case 'external-modification':
      return 'Your changes were not written. Reload from disk, overwrite it with this version, or save a copy.';
    case 'lock-lost':
      return 'Reopen the document to take a fresh lock, or save a copy.';
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

export type SaveFailureAction = 'retry' | 'overwrite' | 'save-copy' | 'reload' | 'reveal';

/**
 * Actions available for one failure. Overwrite is the only code-specific
 * action: it is offered for an external modification and never for a
 * permission, disk-full, read-only, or lock failure.
 */
export function canOverwriteExternal(code: SaveFailureCode): boolean {
  return code === 'external-modification';
}

export function saveFailureActions(code: SaveFailureCode): readonly SaveFailureAction[] {
  if (canOverwriteExternal(code)) {
    return ['retry', 'overwrite', 'save-copy', 'reload', 'reveal'];
  }
  return ['retry', 'save-copy', 'reload', 'reveal'];
}

export interface OverwriteConfirmation {
  title: string;
  /** Names the path and states that the external changes will be lost. */
  description: string;
  path: string;
  confirmLabel: string;
  /** The safe default. Overwrite is never preselected or auto-confirmed. */
  defaultAction: 'cancel';
}

export function overwriteConfirmation(packagePath: string): OverwriteConfirmation {
  return {
    title: 'Overwrite file on disk?',
    description: `The file at ${packagePath} changed on disk outside NoteForest. Overwriting replaces those external changes with this window’s content; they will be lost. This cannot be undone.`,
    path: packagePath,
    confirmLabel: 'Overwrite',
    defaultAction: 'cancel',
  };
}
