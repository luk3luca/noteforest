import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDocument,
  type Document,
  type DocumentCommand,
} from '@noteforest/core';
import type {
  ApplyResult,
  ReloadDocumentResult,
  RestoreBackupResult,
  SaveCopyResult,
  SaveResult,
  TakeOverLockResult,
} from '../src/shared/api';
import { createElectronDocumentGateway } from '../src/renderer/src/state/electron-document-gateway';
import { createInMemoryDocumentGateway } from '../src/renderer/src/state/memory-document-gateway';
import { DocumentRuntime } from '../src/renderer/src/state/runtime';

afterEach(() => {
  vi.unstubAllGlobals();
});

const packagePath = '/tmp/noteforest-test/library/gateway';

interface RecordedCalls {
  takeOverLock: string[];
  apply: Array<{ packagePath: string; command: DocumentCommand }>;
  save: Array<{ packagePath: string; options: unknown }>;
  saveCopy: string[];
  restoreBackup: Array<{ packagePath: string; sourcePath: string }>;
  reloadDocument: string[];
}

function stubBridge(results: {
  takeOverLock: TakeOverLockResult;
  apply: ApplyResult;
  save: SaveResult;
  saveCopy: SaveCopyResult;
  restoreBackup: RestoreBackupResult;
  reloadDocument: ReloadDocumentResult;
}): RecordedCalls {
  const calls: RecordedCalls = {
    takeOverLock: [],
    apply: [],
    save: [],
    saveCopy: [],
    restoreBackup: [],
    reloadDocument: [],
  };
  vi.stubGlobal('window', {
    noteforest: {
      takeOverLock: async (path: string) => {
        calls.takeOverLock.push(path);
        return results.takeOverLock;
      },
      apply: async (path: string, command: DocumentCommand) => {
        calls.apply.push({ packagePath: path, command });
        return results.apply;
      },
      save: async (path: string, options?: unknown) => {
        calls.save.push({ packagePath: path, options });
        return results.save;
      },
      saveCopy: async (path: string) => {
        calls.saveCopy.push(path);
        return results.saveCopy;
      },
      restoreBackup: async (path: string, sourcePath: string) => {
        calls.restoreBackup.push({ packagePath: path, sourcePath });
        return results.restoreBackup;
      },
      reloadDocument: async (path: string) => {
        calls.reloadDocument.push(path);
        return results.reloadDocument;
      },
    },
  });
  return calls;
}

describe('Electron document gateway', () => {
  it('forwards every platform call with its exact arguments', async () => {
    const command: DocumentCommand = { type: 'document.rename', title: 'Renamed' };
    const takeOver: TakeOverLockResult = { ok: false, message: 'The lock is held.', code: 'locked' };
    const apply: ApplyResult = { ok: false, message: 'Command rejected.', code: 'invalid-command' };
    const save: SaveResult = {
      ok: false,
      changed: false,
      revision: 7,
      code: 'external-modification',
      coreCode: 'external-modification',
      error: 'document changed on disk since it was opened',
    };
    const saveCopy: SaveCopyResult = { ok: false, canceled: true };
    const restore: RestoreBackupResult = {
      ok: false,
      canceled: true,
      code: 'no-backup',
      message: 'No backup is available.',
    };
    const reload: ReloadDocumentResult = { ok: false, message: 'The package is missing.' };
    const calls = stubBridge({
      takeOverLock: takeOver,
      apply,
      save,
      saveCopy,
      restoreBackup: restore,
      reloadDocument: reload,
    });
    const gateway = createElectronDocumentGateway();

    expect(await gateway.takeOverLock(packagePath)).toBe(takeOver);
    expect(await gateway.apply(packagePath, command)).toBe(apply);
    expect(await gateway.save(packagePath)).toBe(save);
    expect(await gateway.save(packagePath, { overwriteExternal: true })).toBe(save);
    expect(await gateway.saveCopy(packagePath)).toBe(saveCopy);
    expect(await gateway.restoreBackup(packagePath, '/backups/one.json')).toBe(restore);
    expect(await gateway.reloadDocument(packagePath)).toBe(reload);

    expect(calls).toEqual({
      takeOverLock: [packagePath],
      apply: [{ packagePath, command }],
      save: [
        { packagePath, options: undefined },
        { packagePath, options: { overwriteExternal: true } },
      ],
      saveCopy: [packagePath],
      restoreBackup: [{ packagePath, sourcePath: '/backups/one.json' }],
      reloadDocument: [packagePath],
    });
  });

  it('resolves the preload bridge at call time, not when it is constructed', async () => {
    const gateway = createElectronDocumentGateway();
    const result: SaveResult = { ok: true, changed: true, revision: 4 };
    vi.stubGlobal('window', {
      noteforest: {
        save: async () => result,
      },
    });
    expect(await gateway.save(packagePath)).toBe(result);
  });
});

describe('in-memory document gateway', () => {
  it('applies real typed commands and reports the created revision', async () => {
    const document = createDocument({
      title: 'Note',
      chapterId: 'chapter-one',
      chapterTitle: 'One',
    });
    const memory = createInMemoryDocumentGateway({
      packagePath,
      document,
    });

    const applied = await memory.gateway.apply(packagePath, {
      type: 'document.rename',
      title: 'Renamed',
    });

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.document?.title).toBe('Renamed');
    expect(applied.revision).toBe(document.revision + 1);
    expect(memory.currentDocument().title).toBe('Renamed');
    expect(memory.currentDocument().revision).toBe(document.revision + 1);
  });

  it('preserves typed command failures instead of inventing a result', async () => {
    const memory = createInMemoryDocumentGateway({
      packagePath,
      document: createDocument({ title: 'Note' }),
    });

    const applied = await memory.gateway.apply(packagePath, {
      type: 'chapter.rename',
      chapterId: 'missing-chapter',
      title: 'Missing',
    });

    expect(applied.ok).toBe(false);
    expect(applied.code).toBe('not-found');
    expect(applied.message).toBeTruthy();
    expect(memory.calls).toEqual([
      {
        method: 'apply',
        packagePath,
        command: { type: 'chapter.rename', chapterId: 'missing-chapter', title: 'Missing' },
      },
    ]);
  });

  it('records save flags and returns scripted failures verbatim', async () => {
    const memory = createInMemoryDocumentGateway({
      packagePath,
      document: createDocument({ title: 'Note' }),
    });
    const failure: SaveResult = {
      ok: false,
      changed: false,
      revision: 3,
      code: 'permission',
      coreCode: 'io-error',
      error: 'EACCES: permission denied',
    };
    memory.queueSave(failure);

    expect(await memory.gateway.save(packagePath, { overwriteExternal: true })).toBe(failure);
    expect(memory.calls).toEqual([
      { method: 'save', packagePath, options: { overwriteExternal: true } },
    ]);
    expect(await memory.gateway.save(packagePath)).toEqual({
      ok: true,
      changed: false,
      revision: memory.currentDocument().revision,
    });
  });

  it('serves reload and stale-lock takeover from the in-memory snapshot', async () => {
    const document = createDocument({ title: 'Note' });
    const memory = createInMemoryDocumentGateway({
      packagePath,
      document,
      status: 'read-only',
      readOnlyReason: 'stale-lock',
    });

    const reloaded = await memory.gateway.reloadDocument(packagePath);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.snapshot.status).toBe('read-only');
      expect(reloaded.snapshot.readOnlyReason).toBe('stale-lock');
      expect(reloaded.snapshot.document).toBe(document);
    }

    const takenOver = await memory.gateway.takeOverLock(packagePath);
    expect(takenOver.ok).toBe(true);
    if (takenOver.ok) expect(takenOver.snapshot.status).toBe('editable');
    expect(memory.currentStatus()).toBe('editable');
  });
});

describe('DocumentRuntime gateway injection', () => {
  function snapshot(document: Document) {
    return {
      packagePath,
      document,
      status: 'editable' as const,
      errors: [],
      warnings: [],
    };
  }

  it('saves and applies through an injected gateway without a global bridge', async () => {
    const document = createDocument({
      title: 'Note',
      chapterId: 'chapter-one',
      chapterTitle: 'One',
    });
    const memory = createInMemoryDocumentGateway({ packagePath, document });
    const runtime = new DocumentRuntime(snapshot(document), [], null, memory.gateway);

    expect((globalThis as { window?: unknown }).window).toBeUndefined();
    await runtime.saveNow();
    expect(runtime.saveState).toBe('saved');
    expect(runtime.dirty).toBe(false);

    expect(await runtime.applyStructural({ type: 'document.rename', title: 'Renamed' })).toEqual({
      ok: true,
    });
    expect(runtime.saveState).toBe('unsaved');
    await runtime.flush();

    expect(memory.calls.map((call) => call.method)).toEqual(['save', 'apply', 'save']);
    expect(memory.currentDocument().title).toBe('Renamed');
    expect(runtime.document.title).toBe('Renamed');
    expect(runtime.saveState).toBe('saved');
    runtime.dispose();
  });
});
