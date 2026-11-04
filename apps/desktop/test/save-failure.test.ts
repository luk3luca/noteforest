import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@noteforest/core';
import type { OpenDocumentSnapshot, SaveResult } from '../src/shared/api';
import {
  SAVE_BACKOFF_MS,
  nextSaveFailure,
  prepareRetry,
  saveFailureHeadline,
  saveFailureHint,
  saveStatusAfterWrite,
} from '../src/renderer/src/lib/save-failure';
import { saveFailureCode } from '../src/main/save-error';
import {
  isInsideLibrary,
  reloadDocument,
  saveDocument,
  saveDocumentCopy,
} from '../src/main/library';
import { DocumentRuntime } from '../src/renderer/src/state/runtime';

function snapshot(): OpenDocumentSnapshot {
  return {
    packagePath: '/tmp/noteforest-test/library/note',
    document: createDocument({ title: 'Note' }),
    status: 'editable',
    errors: [],
    warnings: [],
  };
}

function stubSave(): { resolve: (result: SaveResult) => void; promise: Promise<SaveResult> } {
  let release: (result: SaveResult) => void = () => undefined;
  const promise = new Promise<SaveResult>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal('window', {
    noteforest: {
      save: () => promise,
      apply: async () => ({ ok: true, document: snapshot().document }),
    },
  });
  return { resolve: release, promise };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('save failure state machine', () => {
  it('preserves the typed code and backs off 2 s / 5 s / 15 s, then stops', () => {
    const first = nextSaveFailure(null, 'permission', 'EACCES: permission denied');
    expect(first.failure).toEqual({
      code: 'permission',
      message: 'EACCES: permission denied',
      attempt: 1,
    });
    expect(first.retryInMs).toBe(SAVE_BACKOFF_MS[0]);

    const second = nextSaveFailure(first.failure, 'permission', 'EACCES: permission denied');
    expect(second.failure.attempt).toBe(2);
    expect(second.retryInMs).toBe(SAVE_BACKOFF_MS[1]);

    const third = nextSaveFailure(second.failure, 'permission', 'EACCES: permission denied');
    expect(third.failure.attempt).toBe(3);
    expect(third.retryInMs).toBe(SAVE_BACKOFF_MS[2]);

    const fourth = nextSaveFailure(third.failure, 'permission', 'EACCES: permission denied');
    expect(fourth.failure.attempt).toBe(4);
    expect(fourth.retryInMs).toBeNull();
  });

  it('an explicit Retry restarts the sequence without hiding the reason', () => {
    const failed = nextSaveFailure(null, 'disk-full', 'ENOSPC: no space left').failure;
    const prepared = prepareRetry(failed);
    expect(prepared).toEqual({ code: 'disk-full', message: 'ENOSPC: no space left', attempt: 0 });
    const retried = nextSaveFailure(prepared, 'disk-full', 'ENOSPC: no space left');
    expect(retried.failure.attempt).toBe(1);
    expect(retried.retryInMs).toBe(SAVE_BACKOFF_MS[0]);
  });

  it('never reports saved while an edit or a commit is still pending', () => {
    expect(saveStatusAfterWrite({ editedDuringSave: true, pendingWork: false })).toBe('unsaved');
    expect(saveStatusAfterWrite({ editedDuringSave: false, pendingWork: true })).toBe('unsaved');
    expect(saveStatusAfterWrite({ editedDuringSave: true, pendingWork: true })).toBe('unsaved');
    expect(saveStatusAfterWrite({ editedDuringSave: false, pendingWork: false })).toBe('saved');
  });

  it('keeps the existing failure visible when a save is retried and fails', () => {
    const runtime = new DocumentRuntime(snapshot(), [], null);
    const stub = stubSave();
    const save = runtime.saveNow();
    stub.resolve({
      ok: false,
      changed: false,
      revision: 0,
      code: 'permission',
      coreCode: 'io-error',
      error: 'EACCES: permission denied',
    });
    return save.then(() => {
      expect(runtime.saveState).toBe('error');
      expect(runtime.saveFailure).toEqual({
        code: 'permission',
        message: 'EACCES: permission denied',
        attempt: 1,
      });
      expect(runtime.saveError).toBe('EACCES: permission denied');
      runtime.dispose();
    });
  });

  it('does not claim Saved when text arrives while the write is in flight', async () => {
    const runtime = new DocumentRuntime(snapshot(), [], null);
    const stub = stubSave();
    const save = runtime.saveNow();
    await vi.waitFor(() => expect(runtime.saveState).toBe('saving'));
    runtime.noteEditorUpdate();
    stub.resolve({ ok: true, changed: true, revision: 2 });
    await save;
    expect(runtime.saveState).toBe('unsaved');
    expect(runtime.dirty).toBe(true);
    runtime.dispose();
  });

  it('says Saved only when nothing is pending', async () => {
    const runtime = new DocumentRuntime(snapshot(), [], null);
    const stub = stubSave();
    const save = runtime.saveNow();
    stub.resolve({ ok: true, changed: true, revision: 2 });
    await save;
    expect(runtime.saveState).toBe('saved');
    expect(runtime.dirty).toBe(false);
    runtime.dispose();
  });
});

describe('save failure copy', () => {
  it('gives every code a distinct headline and hint', () => {
    const codes = [
      'read-only',
      'permission',
      'disk-full',
      'external-modification',
      'lock-lost',
      'backup-failed',
      'invalid-document',
      'not-found',
      'unknown',
    ] as const;
    const headlines = new Set(codes.map(saveFailureHeadline));
    expect(headlines.size).toBe(codes.length);
    for (const code of codes) {
      expect(saveFailureHeadline(code).length).toBeGreaterThan(0);
      expect(saveFailureHint(code).length).toBeGreaterThan(0);
    }
    expect(saveFailureHeadline('permission')).not.toBe(saveFailureHeadline('unknown'));
    expect(saveFailureHeadline('disk-full')).not.toBe(saveFailureHeadline('unknown'));
  });
});

describe('core error to save-failure code', () => {
  it('keeps permission, disk-full and external modification distinct', () => {
    expect(saveFailureCode({ code: 'io-error', message: '', details: { reason: 'permission' } })).toBe(
      'permission',
    );
    expect(saveFailureCode({ code: 'io-error', message: '', details: { reason: 'disk-full' } })).toBe(
      'disk-full',
    );
    expect(saveFailureCode({ code: 'io-error', message: '' })).toBe('unknown');
    expect(saveFailureCode({ code: 'external-modification', message: '' })).toBe(
      'external-modification',
    );
    expect(saveFailureCode({ code: 'read-only', message: '' })).toBe('read-only');
    expect(saveFailureCode({ code: 'lock-lost', message: '' })).toBe('lock-lost');
    expect(saveFailureCode({ code: 'backup-failed', message: '' })).toBe('backup-failed');
    expect(saveFailureCode({ code: 'invalid-document', message: '' })).toBe('invalid-document');
    expect(saveFailureCode({ code: 'not-found', message: '' })).toBe('not-found');
  });
});

describe('library path scope', () => {
  it('accepts only paths inside the configured library', () => {
    const previous = process.env['NOTEFOREST_LIBRARY'];
    process.env['NOTEFOREST_LIBRARY'] = '/tmp/noteforest-scope/library';
    try {
      expect(isInsideLibrary('/tmp/noteforest-scope/library/note')).toBe(true);
      expect(isInsideLibrary('/tmp/noteforest-scope/library')).toBe(true);
      expect(isInsideLibrary('/tmp/noteforest-scope/library-evil/note')).toBe(false);
      expect(isInsideLibrary('/tmp/noteforest-scope')).toBe(false);
      expect(isInsideLibrary('/tmp/noteforest-scope/library/../outside')).toBe(false);
    } finally {
      if (previous === undefined) delete process.env['NOTEFOREST_LIBRARY'];
      else process.env['NOTEFOREST_LIBRARY'] = previous;
    }
  });

  it('rejects missing paths on the recovery IPC helpers', async () => {
    const reload = await reloadDocument(undefined as unknown as string);
    expect(reload).toEqual({ ok: false, message: 'No document path was provided.' });
    const copy = await saveDocumentCopy('', '');
    expect(copy).toEqual({ ok: false, message: 'No document path was provided.' });
    const save = await saveDocument(undefined as unknown as string);
    expect(save.ok).toBe(false);
  });
});
