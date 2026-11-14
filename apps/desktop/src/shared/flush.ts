/**
 * Flush-result normalization shared by the preload bridge and the main process.
 *
 * The renderer is untrusted: only an explicit `{ status: 'ok' }` means success.
 * Missing, malformed, or unexpected values become an error, never a silent ok.
 */

import type { FlushResult, MarkdownFlushResult, MarkdownPendingFile } from './api.js';

export function flushErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'The editor did not report a reason.';
}

function pendingMarkdown(value: unknown): MarkdownPendingFile[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const files: MarkdownPendingFile[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const candidate = item as { path?: unknown; title?: unknown };
    if (typeof candidate.path !== 'string' || candidate.path.length === 0) continue;
    if (typeof candidate.title !== 'string' || candidate.title.length === 0) continue;
    files.push({ path: candidate.path, title: candidate.title });
  }
  return files;
}

export function normalizeFlushResult(value: unknown): FlushResult {
  if (typeof value !== 'object' || value === null) {
    return { status: 'error', error: 'The editor returned no flush result.' };
  }
  const candidate = value as { status?: unknown; error?: unknown; pendingMarkdown?: unknown };
  if (candidate.status === 'ok') {
    const pending = pendingMarkdown(candidate.pendingMarkdown);
    return pending === undefined || pending.length === 0
      ? { status: 'ok' }
      : { status: 'ok', pendingMarkdown: pending };
  }
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

/** Only a boolean `ok` with a string failure list is a valid guest-file flush. */
export function normalizeMarkdownFlushResult(value: unknown): MarkdownFlushResult {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, failures: ['The editor returned no Markdown save result.'] };
  }
  const candidate = value as { ok?: unknown; failures?: unknown };
  const failures = Array.isArray(candidate.failures)
    ? candidate.failures.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
  if (candidate.ok === true && failures.length === 0) return { ok: true, failures: [] };
  return {
    ok: false,
    failures:
      failures.length === 0
        ? ['The editor did not report a reason.']
        : failures,
  };
}
