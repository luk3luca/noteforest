import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDocument } from '@noteforest/core';
import type { OpenDocumentSnapshot, SaveRequestOptions, SaveResult } from '../src/shared/api';
import {
  SAVE_BACKOFF_MS,
  canOverwriteExternal,
  nextSaveFailure,
  overwriteConfirmation,
  prepareRetry,
  saveFailureActions,
  saveFailureHeadline,
  saveFailureHint,
  saveStatusAfterWrite,
} from '../src/renderer/src/lib/save-failure';
import { saveFailureCode } from '../src/main/save-error';
import {
  isInsideKnownLibrary,
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

/** Queue one save response at a time and record the IPC arguments. */
function stubSaveSequence(): {
  calls: Array<{ packagePath: string; options: unknown }>;
  respond: (result: SaveResult) => void;
  pending: () => number;
} {
  const calls: Array<{ packagePath: string; options: unknown }> = [];
  const resolvers: Array<(result: SaveResult) => void> = [];
  vi.stubGlobal('window', {
    noteforest: {
      save: (packagePath: string, options?: unknown) => {
        calls.push({ packagePath, options });
        return new Promise<SaveResult>((resolve) => {
          resolvers.push(resolve);
        });
      },
      apply: async () => ({ ok: true, document: snapshot().document }),
    },
  });
  return {
    calls,
    respond: (result) => {
      const resolve = resolvers.shift();
      if (resolve === undefined) throw new Error('no pending save');
      resolve(result);
    },
    pending: () => resolvers.length,
  };
}

function externalFailure(): SaveResult {
  return {
    ok: false,
    changed: false,
    revision: 1,
    code: 'external-modification',
    coreCode: 'external-modification',
    error: 'document changed on disk since it was opened',
  };
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

  it('overwrites through the save IPC after external modification and clears the failure', async () => {
    const runtime = new DocumentRuntime(snapshot(), [], null);
    const stub = stubSaveSequence();
    const first = runtime.saveNow();
    await vi.waitFor(() => expect(stub.pending()).toBe(1));
    stub.respond(externalFailure());
    await first;
    expect(runtime.saveFailure?.code).toBe('external-modification');
    expect(runtime.saveState).toBe('error');

    const overwrite = runtime.overwriteExternal();
    await vi.waitFor(() => expect(stub.pending()).toBe(1));
    stub.respond({ ok: true, changed: true, revision: 2 });
    const outcome = await overwrite;

    expect(outcome).toEqual({ ok: true });
    expect(stub.calls).toEqual([
      { packagePath: runtime.packagePath, options: undefined },
      { packagePath: runtime.packagePath, options: { overwriteExternal: true } },
    ]);
    expect(runtime.saveFailure).toBeNull();
    expect(runtime.saveState).toBe('saved');
    expect(runtime.dirty).toBe(false);
    runtime.dispose();
  });

  it('keeps the failure visible with the new typed error when overwrite fails', async () => {
    const runtime = new DocumentRuntime(snapshot(), [], null);
    const stub = stubSaveSequence();
    const first = runtime.saveNow();
    await vi.waitFor(() => expect(stub.pending()).toBe(1));
    stub.respond(externalFailure());
    await first;

    const overwrite = runtime.overwriteExternal();
    await vi.waitFor(() => expect(stub.pending()).toBe(1));
    stub.respond({
      ok: false,
      changed: false,
      revision: 1,
      code: 'permission',
      coreCode: 'io-error',
      error: 'EACCES: permission denied',
    });
    const outcome = await overwrite;

    expect(outcome.ok).toBe(false);
    expect(runtime.saveFailure).toEqual({
      code: 'permission',
      message: 'EACCES: permission denied',
      attempt: 2,
    });
    expect(runtime.saveState).toBe('error');
    runtime.dispose();
  });

  it('refuses to overwrite when the failure is not external modification', async () => {
    const runtime = new DocumentRuntime(snapshot(), [], null);
    const stub = stubSaveSequence();
    const first = runtime.saveNow();
    await vi.waitFor(() => expect(stub.pending()).toBe(1));
    stub.respond({
      ok: false,
      changed: false,
      revision: 1,
      code: 'permission',
      coreCode: 'io-error',
      error: 'EACCES: permission denied',
    });
    await first;

    const outcome = await runtime.overwriteExternal();
    expect(outcome.ok).toBe(false);
    expect(stub.calls).toHaveLength(1);
    expect(runtime.saveFailure?.code).toBe('permission');
    runtime.dispose();
  });
});

describe('save failure copy', () => {
  it('offers overwrite only for external modification', () => {
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
    for (const code of codes) {
      const expected = code === 'external-modification';
      expect(canOverwriteExternal(code)).toBe(expected);
      expect(saveFailureActions(code).includes('overwrite')).toBe(expected);
      for (const action of ['retry', 'restore-backup', 'save-copy', 'reload', 'reveal'] as const) {
        expect(saveFailureActions(code)).toContain(action);
      }
    }
  });

  it('keeps the path out of the short description and defaults the overwrite confirmation to Cancel', () => {
    const confirm = overwriteConfirmation('/Users/luca/NoteForest/linear-algebra');
    expect(confirm.defaultAction).toBe('cancel');
    expect(confirm.confirmLabel).toBe('Overwrite');
    expect(confirm.confirmLabel).not.toBe(confirm.defaultAction);
    expect(confirm.title).toMatch(/overwrite/i);
    expect(confirm.description).toBe(
      'This replaces the file on disk; the external changes are lost. Reload instead to keep them.',
    );
    expect(confirm.description).not.toContain('/Users/luca/NoteForest/linear-algebra');
    expect(confirm.description).toMatch(/lost/i);
    // The raw path stays on the record for the dialog's Details disclosure.
    expect(confirm.path).toBe('/Users/luca/NoteForest/linear-algebra');
  });

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
  it('accepts only paths inside a known library', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-scope-'));
    const library = path.join(root, 'library');
    const support = path.join(root, 'support');
    await fs.mkdir(library, { recursive: true });
    await fs.mkdir(support, { recursive: true });
    const previousLibrary = process.env['NOTEFOREST_LIBRARY'];
    const previousSupport = process.env['NOTEFOREST_APP_SUPPORT'];
    process.env['NOTEFOREST_LIBRARY'] = library;
    process.env['NOTEFOREST_APP_SUPPORT'] = support;
    try {
      expect(await isInsideKnownLibrary(path.join(library, 'note'))).toBe(true);
      expect(await isInsideKnownLibrary(library)).toBe(true);
      expect(await isInsideKnownLibrary(path.join(root, 'library-evil', 'note'))).toBe(false);
      expect(await isInsideKnownLibrary(root)).toBe(false);
      expect(await isInsideKnownLibrary(path.join(library, '..', 'outside'))).toBe(false);
    } finally {
      if (previousLibrary === undefined) delete process.env['NOTEFOREST_LIBRARY'];
      else process.env['NOTEFOREST_LIBRARY'] = previousLibrary;
      if (previousSupport === undefined) delete process.env['NOTEFOREST_APP_SUPPORT'];
      else process.env['NOTEFOREST_APP_SUPPORT'] = previousSupport;
      await fs.rm(root, { recursive: true, force: true });
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

  it('rejects a non-boolean overwrite flag before opening the document', async () => {
    for (const options of [
      { overwriteExternal: 'yes' },
      'overwrite',
      ['overwrite'],
      null,
    ] as unknown[]) {
      const result = await saveDocument(
        '/tmp/noteforest-invalid/library/note',
        options as SaveRequestOptions,
      );
      expect(result).toMatchObject({
        ok: false,
        code: 'unknown',
        error: 'Invalid overwrite flag.',
      });
    }
  });
});
