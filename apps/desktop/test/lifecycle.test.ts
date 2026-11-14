import { describe, expect, it } from 'vitest';
import { flushDecision, quitCanProceed } from '../src/main/lifecycle';
import { normalizeFlushResult, normalizeMarkdownFlushResult } from '../src/shared/flush';

describe('quit lifecycle', () => {
  it('allows a quit after the close handshake completed', () => {
    expect(quitCanProceed(true, true)).toBe(true);
  });

  it('allows a quit when the last window is already gone', () => {
    // S1 regression: `closed` must not leave this false; otherwise the app
    // stays alive with zero windows and can only be force-quit.
    expect(quitCanProceed(false, false)).toBe(true);
  });

  it('keeps guarding a live window that has not allowed the close yet', () => {
    expect(quitCanProceed(false, true)).toBe(false);
  });
});

describe('flush decision', () => {
  it('proceeds when the renderer confirmed the flush', () => {
    expect(flushDecision({ status: 'ok' }, true)).toBe('proceed');
  });

  it('blocks a live window when the flush timed out', () => {
    expect(flushDecision({ status: 'timeout', error: 'no answer' }, true)).toBe('block');
  });

  it('blocks a live window when the renderer reported an error', () => {
    expect(flushDecision({ status: 'error', error: 'disk full' }, true)).toBe('block');
  });

  it('allows quit with no live window even after a failed flush', () => {
    // S1: there is no one to show the retry dialog to, and blocking here
    // would leave the process alive with zero windows.
    expect(flushDecision({ status: 'timeout', error: 'no answer' }, false)).toBe('proceed');
    expect(flushDecision({ status: 'error', error: 'disk full' }, false)).toBe('proceed');
  });
});

describe('flush result normalization', () => {
  it('accepts an explicit ok', () => {
    expect(normalizeFlushResult({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('preserves an error reason', () => {
    expect(normalizeFlushResult({ status: 'error', error: 'Draft: disk full' })).toEqual({
      status: 'error',
      error: 'Draft: disk full',
    });
  });

  it('never turns a malformed or missing result into ok', () => {
    expect(normalizeFlushResult(undefined).status).toBe('error');
    expect(normalizeFlushResult(null).status).toBe('error');
    expect(normalizeFlushResult({}).status).toBe('error');
    expect(normalizeFlushResult({ status: 'done' }).status).toBe('error');
    expect(normalizeFlushResult(true).status).toBe('error');
  });

  it('supplies a reason when the renderer omitted one', () => {
    const result = normalizeFlushResult({ status: 'timeout' });
    expect(result.status).toBe('timeout');
    expect(result.error).toMatch(/reason/);
  });

  it('keeps dirty Markdown guest files in the close/quit prompt', () => {
    expect(
      normalizeFlushResult({
        status: 'ok',
        pendingMarkdown: [
          { path: '/notes/a.md', title: 'a.md' },
          { path: '', title: 'bad.md' },
          { path: '/notes/b.md', title: '' },
          { nope: true },
        ],
      }),
    ).toEqual({
      status: 'ok',
      pendingMarkdown: [{ path: '/notes/a.md', title: 'a.md' }],
    });
    // A guest-file list never turns an error/timeout into a successful flush.
    expect(
      normalizeFlushResult({
        status: 'error',
        error: 'no save',
        pendingMarkdown: [{ path: '/notes/a.md', title: 'a.md' }],
      }),
    ).toEqual({ status: 'error', error: 'no save' });
  });
});

describe('Markdown flush normalization', () => {
  it('accepts only an explicit ok with no failures', () => {
    expect(normalizeMarkdownFlushResult({ ok: true, failures: [] })).toEqual({
      ok: true,
      failures: [],
    });
    expect(normalizeMarkdownFlushResult({ ok: true, failures: ['x.md: conflict'] })).toEqual({
      ok: false,
      failures: ['x.md: conflict'],
    });
    expect(normalizeMarkdownFlushResult({ ok: false, failures: [] }).ok).toBe(false);
    expect(normalizeMarkdownFlushResult(null).failures.length).toBe(1);
  });
});
