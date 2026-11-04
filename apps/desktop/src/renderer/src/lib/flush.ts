/**
 * Close/quit flush aggregation, kept pure so the blocking rules are unit
 * tested without launching the app.
 *
 * Only document data blocks a close:
 * - an editable document whose commit throws or whose save failed;
 * - a read-only document that somehow has unsaved changes (read-only blocks
 *   editing, so a clean read-only runtime cannot lose data).
 *
 * Session state (open tabs, scroll, active tab) is UI state, not document
 * data. A failed session write is logged and never blocks close/quit.
 */

import type { FlushResult } from '../../../shared/api';
import { flushErrorMessage } from '../../../shared/flush';

export interface FlushDocument {
  title: string;
  status: 'editable' | 'read-only';
  readOnlyReason?: string | undefined;
  dirty: boolean;
  saveState: 'saved' | 'saving' | 'unsaved' | 'error';
  saveError: string | null;
  commitPending(): Promise<void>;
}

export interface FlushDependencies {
  documents: Iterable<FlushDocument>;
  saveSession: () => Promise<void>;
  /** Session failures are logged; injectable so unit tests can observe them. */
  warn?: (message: string, error: unknown) => void;
}

export async function flushDocuments({
  documents,
  saveSession,
  warn = (message, error) => console.warn(message, error),
}: FlushDependencies): Promise<FlushResult> {
  const problems: string[] = [];
  for (const document of documents) {
    if (document.status === 'read-only') {
      if (!document.dirty) continue;
      const reason =
        document.readOnlyReason === undefined ? '' : ` (${document.readOnlyReason})`;
      problems.push(`${document.title}: open read-only${reason} with unsaved changes`);
      continue;
    }
    try {
      await document.commitPending();
      if (document.saveState === 'error') {
        problems.push(`${document.title}: ${document.saveError ?? 'the last save failed'}`);
      }
    } catch (error) {
      problems.push(`${document.title}: ${flushErrorMessage(error)}`);
    }
  }
  if (problems.length > 0) return { status: 'error', error: problems.join('\n') };
  try {
    await saveSession();
  } catch (error) {
    warn('[noteforest] could not save session state; continuing with close/quit', error);
  }
  return { status: 'ok' };
}
