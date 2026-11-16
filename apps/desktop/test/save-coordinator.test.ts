import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SaveCopyResult,
  SaveFailureCode,
  SaveRequestOptions,
  SaveResult,
} from '../src/shared/api';
import { createSerialQueue } from '../src/renderer/src/lib/serial-queue';
import {
  AUTOSAVE_DELAY_MS,
  CONTENT_COMMIT_DELAY_MS,
  SaveCoordinator,
} from '../src/renderer/src/state/save-coordinator';

type SaveResponse = SaveResult | Promise<SaveResult>;

interface Harness {
  coordinator: SaveCoordinator;
  log: string[];
  saveResponses: SaveResponse[];
  copyResponses: SaveCopyResult[];
  writeOptions: Array<SaveRequestOptions | undefined>;
  revisions: Array<number | undefined>;
  changedCount: () => number;
}

function harness(
  options: {
    editable?: boolean;
    commit?: () => Promise<boolean>;
  } = {},
): Harness {
  const log: string[] = [];
  const saveResponses: SaveResponse[] = [];
  const copyResponses: SaveCopyResult[] = [];
  const writeOptions: Array<SaveRequestOptions | undefined> = [];
  const revisions: Array<number | undefined> = [];
  let changed = 0;
  let editable = options.editable ?? true;

  const coordinator = new SaveCoordinator({
    queue: createSerialQueue(),
    isEditable: () => editable,
    commit: async () => {
      log.push('commit');
      return options.commit === undefined ? true : options.commit();
    },
    write: async (requestOptions) => {
      log.push(requestOptions?.overwriteExternal === true ? 'overwrite' : 'save');
      writeOptions.push(requestOptions);
      const response = saveResponses.shift();
      if (response === undefined) throw new Error('unscripted save');
      return await response;
    },
    saveCopy: async () => {
      log.push('saveCopy');
      const response = copyResponses.shift();
      if (response === undefined) throw new Error('unscripted saveCopy');
      return response;
    },
    applyRevision: (revision) => revisions.push(revision),
    changed: () => {
      changed += 1;
    },
  });

  return {
    coordinator,
    log,
    saveResponses,
    copyResponses,
    writeOptions,
    revisions,
    changedCount: () => changed,
  };
}

function saved(revision: number): SaveResult {
  return { ok: true, changed: true, revision };
}

function failed(code: SaveFailureCode, error: string): SaveResult {
  return { ok: false, changed: false, revision: 1, code, error };
}

const copySuccess: SaveCopyResult = {
  ok: true,
  packagePath: '/tmp/noteforest-test/library/copy',
  library: {
    libraryPath: '/tmp/noteforest-test/library',
    appSupportPath: '/tmp/noteforest-test/app',
    documents: [],
    recent: [],
    warnings: [],
  },
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SaveCoordinator autosave', () => {
  it('commits on the idle debounce and autosaves once after quiet typing', async () => {
    const h = harness();

    h.coordinator.noteTextEdit();
    expect(h.coordinator.saveState).toBe('unsaved');
    expect(h.coordinator.dirty).toBe(true);
    expect(h.coordinator.saveError).toBeNull();
    expect(h.changedCount()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(CONTENT_COMMIT_DELAY_MS - 1);
    expect(h.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.log).toEqual(['commit']);

    h.saveResponses.push(saved(2));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - CONTENT_COMMIT_DELAY_MS);
    expect(h.log).toEqual(['commit', 'commit', 'save']);
    expect(h.coordinator.saveState).toBe('saved');
    expect(h.coordinator.dirty).toBe(false);
    expect(h.revisions).toEqual([2]);
  });

  it('never claims Saved for an edit that lands while the write is in flight', async () => {
    const h = harness();
    let release: (result: SaveResult) => void = () => undefined;
    h.saveResponses.push(
      new Promise<SaveResult>((resolve) => {
        release = resolve;
      }),
    );

    const saving = h.coordinator.saveNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.coordinator.saveState).toBe('saving');

    h.coordinator.noteTextEdit();
    expect(h.coordinator.saveState).toBe('unsaved');
    expect(h.coordinator.dirty).toBe(true);

    release(saved(3));
    await saving;
    expect(h.coordinator.saveState).toBe('unsaved');
    expect(h.coordinator.dirty).toBe(true);
    expect(h.revisions).toEqual([3]);

    h.saveResponses.push(saved(4));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(h.coordinator.saveState).toBe('saved');
    expect(h.coordinator.dirty).toBe(false);
    expect(h.revisions).toEqual([3, 4]);
    expect(h.writeOptions).toEqual([undefined, undefined]);
  });

  it('flushes by committing before every write', async () => {
    const h = harness();
    h.saveResponses.push(saved(5));

    await h.coordinator.saveNow();

    expect(h.log).toEqual(['commit', 'save']);
    expect(h.coordinator.saveState).toBe('saved');
  });
});

describe('SaveCoordinator failure, retry, and recovery', () => {
  it('backs off 2 s, 5 s, then 15 s and stops automatic retries', async () => {
    const h = harness();
    h.saveResponses.push(failed('permission', 'EACCES: permission denied'));
    await h.coordinator.saveNow();

    expect(h.coordinator.saveState).toBe('error');
    expect(h.coordinator.saveFailure).toEqual({
      code: 'permission',
      message: 'EACCES: permission denied',
      attempt: 1,
    });
    expect(h.coordinator.saveError).toBe('EACCES: permission denied');
    expect(h.coordinator.dirty).toBe(true);

    let writes = 1;
    for (const delay of [2000, 5000, 15000]) {
      h.saveResponses.push(failed('permission', 'EACCES: permission denied'));
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(h.writeOptions).toHaveLength(writes);
      await vi.advanceTimersByTimeAsync(1);
      writes += 1;
      expect(h.writeOptions).toHaveLength(writes);
    }
    expect(h.coordinator.saveFailure?.attempt).toBe(4);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.writeOptions).toHaveLength(4);
    expect(h.coordinator.saveState).toBe('error');
  });

  it('pauses autosave while a failure owns the retry schedule', async () => {
    const h = harness();
    h.saveResponses.push(failed('disk-full', 'ENOSPC: no space left on device'));
    await h.coordinator.saveNow();
    expect(h.coordinator.saveState).toBe('error');

    h.coordinator.scheduleSave(100);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.writeOptions).toHaveLength(1);
  });

  it('restarts the backoff on explicit Retry while keeping the failure visible', async () => {
    const h = harness();
    h.saveResponses.push(failed('permission', 'EACCES: permission denied'));
    await h.coordinator.saveNow();

    let release: (result: SaveResult) => void = () => undefined;
    h.saveResponses.push(
      new Promise<SaveResult>((resolve) => {
        release = resolve;
      }),
    );
    const retrying = h.coordinator.retrySave();
    await vi.advanceTimersByTimeAsync(0);

    expect(h.coordinator.saveState).toBe('saving');
    expect(h.coordinator.saveFailure?.attempt).toBe(0);
    expect(h.coordinator.saveFailure?.code).toBe('permission');
    expect(h.coordinator.saveError).toBeNull();

    release(saved(6));
    await retrying;
    expect(h.coordinator.saveState).toBe('saved');
    expect(h.coordinator.saveFailure).toBeNull();
    expect(h.coordinator.saveError).toBeNull();
  });

  it('skips the write when the content commit failed and keeps the typed failure', async () => {
    let coordinator: SaveCoordinator | null = null;
    const h = harness({
      commit: async () => {
        coordinator?.recordFailure('read-only', 'This note is open read-only.');
        return false;
      },
    });
    coordinator = h.coordinator;

    await h.coordinator.saveNow();

    expect(h.log).toEqual(['commit']);
    expect(h.writeOptions).toEqual([]);
    expect(h.coordinator.saveState).toBe('error');
    expect(h.coordinator.saveFailure).toEqual({
      code: 'read-only',
      message: 'This note is open read-only.',
      attempt: 1,
    });
    expect(h.coordinator.saveError).toBe('This note is open read-only.');
  });

  it('overwrites an external modification only and clears the failure', async () => {
    const h = harness();
    h.saveResponses.push(failed('external-modification', 'document changed on disk'));
    await h.coordinator.saveNow();
    expect(h.coordinator.saveFailure?.code).toBe('external-modification');

    h.saveResponses.push(saved(2));
    expect(await h.coordinator.overwriteExternal()).toEqual({ ok: true });
    expect(h.writeOptions).toEqual([undefined, { overwriteExternal: true }]);
    expect(h.coordinator.saveFailure).toBeNull();
    expect(h.coordinator.saveState).toBe('saved');
    expect(h.coordinator.dirty).toBe(false);
  });

  it('refuses overwrite when another failure owns the document', async () => {
    const h = harness();
    h.saveResponses.push(failed('permission', 'EACCES: permission denied'));
    await h.coordinator.saveNow();

    const outcome = await h.coordinator.overwriteExternal();

    expect(outcome).toEqual({
      ok: false,
      message: 'There is no external modification to overwrite.',
    });
    expect(h.writeOptions).toHaveLength(1);
    expect(h.coordinator.saveFailure?.code).toBe('permission');
  });

  it('keeps the failure visible with the new typed error when overwrite fails', async () => {
    const h = harness();
    h.saveResponses.push(failed('external-modification', 'document changed on disk'));
    await h.coordinator.saveNow();

    h.saveResponses.push(failed('permission', 'EACCES: permission denied'));
    const outcome = await h.coordinator.overwriteExternal();

    expect(outcome).toEqual({ ok: false, message: 'EACCES: permission denied' });
    expect(h.coordinator.saveState).toBe('error');
    expect(h.coordinator.saveFailure).toEqual({
      code: 'permission',
      message: 'EACCES: permission denied',
      attempt: 2,
    });
  });

  it('clears the failure after a successful copy and re-enables autosave', async () => {
    const h = harness();
    h.saveResponses.push(failed('permission', 'EACCES: permission denied'));
    await h.coordinator.saveNow();

    h.copyResponses.push(copySuccess);
    const result = await h.coordinator.saveCopy();

    expect(result).toBe(copySuccess);
    expect(h.log).toEqual(['commit', 'save', 'commit', 'saveCopy']);
    expect(h.coordinator.saveFailure).toBeNull();
    expect(h.coordinator.saveState).toBe('unsaved');
    expect(h.coordinator.dirty).toBe(true);

    h.saveResponses.push(saved(3));
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(h.coordinator.saveState).toBe('saved');
    expect(h.writeOptions).toHaveLength(2);
  });

  it('drops failures and timers when a reload or takeover replaces the document', async () => {
    const h = harness();
    h.saveResponses.push(failed('permission', 'EACCES: permission denied'));
    await h.coordinator.saveNow();
    h.coordinator.noteTextEdit();

    h.coordinator.reset();

    expect(h.coordinator.saveState).toBe('saved');
    expect(h.coordinator.dirty).toBe(false);
    expect(h.coordinator.saveFailure).toBeNull();
    expect(h.coordinator.saveError).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.log).toEqual(['commit', 'save']);
    expect(h.writeOptions).toHaveLength(1);
  });

  it('cancels every timer on dispose and ignores later saves', async () => {
    const h = harness();
    h.coordinator.noteTextEdit();
    h.coordinator.dispose();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.log).toEqual([]);
    await h.coordinator.saveNow();
    expect(h.log).toEqual([]);
    expect(h.saveResponses).toHaveLength(0);
  });
});
