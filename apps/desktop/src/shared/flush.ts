/**
 * Flush-result normalization shared by the preload bridge and the main process.
 *
 * The renderer is untrusted: only an explicit `{ status: 'ok' }` means success.
 * Missing, malformed, or unexpected values become an error, never a silent ok.
 */

import type { FlushResult } from './api.js';

export function flushErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'The editor did not report a reason.';
}

export function normalizeFlushResult(value: unknown): FlushResult {
  if (typeof value !== 'object' || value === null) {
    return { status: 'error', error: 'The editor returned no flush result.' };
  }
  const candidate = value as { status?: unknown; error?: unknown };
  if (candidate.status === 'ok') return { status: 'ok' };
  if (candidate.status === 'error' || candidate.status === 'timeout') {
    return {
      status: candidate.status,
      error:
        typeof candidate.error === 'string' && candidate.error.length > 0
          ? candidate.error
          : 'The editor did not report a reason.',
    };
  }
  return { status: 'error', error: 'The editor returned an invalid flush result.' };
}
