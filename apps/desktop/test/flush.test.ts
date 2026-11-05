import { describe, expect, it, vi } from 'vitest';
import { flushDocuments, type FlushDocument } from '../src/renderer/src/lib/flush';

function document(overrides: Partial<FlushDocument> = {}): FlushDocument {
  return {
    title: 'Draft',
    status: 'editable',
    dirty: false,
    saveState: 'saved',
    saveError: null,
    commitPending: async () => undefined,
    ...overrides,
  };
}

describe('close/quit flush aggregation', () => {
  it('skips a clean read-only document and still saves the session', async () => {
    const commit = vi.fn(async () => undefined);
    const saveSession = vi.fn(async () => undefined);
    const result = await flushDocuments({
      documents: [
        document({
          title: 'Linear algebra',
          status: 'read-only',
          readOnlyReason: 'stale-lock',
          commitPending: commit,
        }),
      ],
      saveSession,
    });
    expect(result).toEqual({ status: 'ok' });
    expect(commit).not.toHaveBeenCalled();
    expect(saveSession).toHaveBeenCalledTimes(1);
  });

  it('blocks on a dirty read-only document and names the reason', async () => {
    const saveSession = vi.fn(async () => undefined);
    const result = await flushDocuments({
      documents: [
        document({
          title: 'Linear algebra',
          status: 'read-only',
          readOnlyReason: 'stale-lock',
          dirty: true,
          saveState: 'unsaved',
        }),
      ],
      saveSession,
    });
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.error).toContain('Linear algebra');
    expect(result.error).toContain('read-only (stale-lock)');
    expect(result.error).toContain('unsaved changes');
    expect(saveSession).not.toHaveBeenCalled();
  });

  it('blocks when committing an editable document throws', async () => {
    const result = await flushDocuments({
      documents: [
        document({
          title: 'Draft',
          commitPending: async () => {
            throw new Error('commit failed');
          },
        }),
      ],
      saveSession: async () => undefined,
    });
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.error).toBe('Draft: commit failed');
  });

  it('blocks when an editable document is in a failed-save state', async () => {
    const result = await flushDocuments({
      documents: [
        document({
          title: 'Draft',
          saveState: 'error',
          saveError: 'EACCES: permission denied',
        }),
      ],
      saveSession: async () => undefined,
    });
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.error).toBe('Draft: EACCES: permission denied');
  });

  it('never blocks on a session-state write failure and logs it', async () => {
    const warn = vi.fn();
    const result = await flushDocuments({
      documents: [document()],
      saveSession: async () => {
        throw new Error("Error invoking remote method 'session:save': EACCES");
      },
      warn,
    });
    expect(result).toEqual({ status: 'ok' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/session state/);
    expect(String(warn.mock.calls[0]?.[1])).toMatch(/session:save/);
  });

  it('aggregates every blocking document before failing', async () => {
    const result = await flushDocuments({
      documents: [
        document({
          title: 'First',
          status: 'read-only',
          readOnlyReason: 'live-lock',
          dirty: true,
        }),
        document({
          title: 'Second',
          saveState: 'error',
          saveError: 'disk full',
        }),
      ],
      saveSession: async () => undefined,
    });
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.error).toContain('First: open read-only (live-lock) with unsaved changes');
    expect(result.error).toContain('Second: disk full');
  });
});
