/**
 * `packages/core` reasons at the boundary (copy-plan §E follow-up).
 *
 * `packages/core` reports what is technically wrong (`block "b1" does not
 * exist`, `document.json is not valid JSON`, `schemaVersion 3 is newer …`).
 * Those sentences are precise for a log and unreadable in a row or a toast, so
 * they never reach a surface verbatim: the boundary that knows a value came
 * from core asks this module for one short line and keeps the raw sentence for
 * `Details` (`docs/design/dialogs.md` §3).
 *
 * The mapping is closed on purpose:
 *
 * - a known command rejection code gets its own line;
 * - an unknown code gets one generic sentence, never the raw text;
 * - the three package states get one line each, for a row and for the recovery
 *   surface (the row is a list line, the surface already has a headline).
 *
 * Pure and renderer-free so the same rule is unit-tested without Electron.
 */

import type { RecoveryStatus } from '../shared/api.js';

/** One mapped reason: a short line plus, when it adds something, the raw text. */
export interface ReasonText {
  message: string;
  /** The core sentence, shown only under `Details`; absent when identical. */
  details?: string;
}

/** The one sentence used when a reason has no sensible short line. */
export const GENERIC_COMMAND_REASON = 'That change isn’t available right now.';

/**
 * Short line for one `CommandErrorCode`. The codes are the closed set in
 * `packages/core/src/commands/types.ts`; anything else falls back to the
 * generic sentence rather than to a technical line.
 */
export function commandRejectionText(code: string | undefined): string {
  switch (code) {
    case 'not-found':
      return 'That item no longer exists.';
    case 'invalid-command':
      return 'That change isn’t available.';
    case 'invalid-document':
      return 'The note can’t accept that change.';
    case 'duplicate-id':
      return 'That already exists.';
    case 'invalid-placement':
      return 'That move isn’t allowed here.';
    case 'cycle':
      return 'That would create a loop.';
    case 'last-chapter':
      return 'A note needs at least one chapter.';
    case 'chapter-in-use':
      return 'This chapter still has blocks.';
    case 'chapter-would-be-empty':
      return 'A chapter needs at least one block.';
    case 'invalid-content':
      return 'That content isn’t supported.';
    case 'anchor-exists':
      return 'That text is already linked.';
    case 'asset-in-use':
      return 'This image is still in use.';
    case 'read-only':
      return 'This note is open read-only.';
    default:
      return GENERIC_COMMAND_REASON;
  }
}

/**
 * One core command rejection: the short line for its code, the raw core
 * sentence in `details`. Only core rejections go through here — a
 * main-process message is already copy and never enters the mapping.
 */
export function commandRejection(code: string | undefined, raw: string): ReasonText {
  const message = commandRejectionText(code);
  return raw.length === 0 || raw === message ? { message } : { message, details: raw };
}

/** The recovery surface's `Reason` row: why this package cannot open. */
export function recoveryReasonText(status: RecoveryStatus): string {
  switch (status) {
    case 'newer-schema':
      return 'A newer NoteForest wrote the file.';
    case 'missing':
      return 'The folder or the file is missing.';
    case 'unreadable':
      return 'The file isn’t valid NoteForest data.';
  }
}

/** The library row's second line: the same state in list-line width. */
export function libraryRowReasonText(
  status: RecoveryStatus,
  kind: 'note' | 'markdown' = 'note',
): string {
  switch (status) {
    case 'newer-schema':
      return 'A newer NoteForest wrote this note.';
    case 'missing':
      return 'This note’s file is missing.';
    case 'unreadable':
      return kind === 'markdown' ? 'This file couldn’t be read.' : 'This note couldn’t be read.';
  }
}
