/**
 * Pure quit-lifecycle decisions for the Electron main process.
 *
 * Kept free of Electron imports so the S1 regression — quit after the last
 * window closed — and the flush/close contract are covered by fast unit tests
 * without launching the app.
 */

import type { FlushResult } from '../shared/api.js';

export type FlushDecision = 'proceed' | 'block';

export function quitCanProceed(allowClose: boolean, hasLiveWindow: boolean): boolean {
  // No live window can show the save prompt or complete a close handshake.
  // Blocking the quit here used to leave the process alive with zero windows.
  return allowClose || !hasLiveWindow;
}

/**
 * Decide whether a close/quit may continue after a flush attempt.
 *
 * `ok` proceeds. `error` and `timeout` block the close so the user gets the
 * Retry/Cancel dialog. With no live window there is nobody to ask, and the
 * quit must still exit (S1).
 */
export function flushDecision(result: FlushResult, hasLiveWindow: boolean): FlushDecision {
  if (!hasLiveWindow) return 'proceed';
  return result.status === 'ok' ? 'proceed' : 'block';
}
