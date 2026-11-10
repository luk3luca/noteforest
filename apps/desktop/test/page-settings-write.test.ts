import { describe, expect, it } from 'vitest';
import { commitThenWritePageSettings } from '../src/renderer/src/settings/page-settings-write';

function recordingWrite(options: {
  commitResult?: boolean;
  flushResult?: { ok: boolean; message?: string };
} = {}): {
  calls: string[];
  commit: (path: string) => Promise<boolean>;
  apply: () => void;
  flush: () => Promise<{ ok: boolean; message?: string }>;
} {
  const calls: string[] = [];
  return {
    calls,
    commit: async (path) => {
      calls.push(`commit:${path}`);
      return options.commitResult ?? true;
    },
    apply: () => {
      calls.push('apply');
    },
    flush: async () => {
      calls.push('flush');
      return options.flushResult ?? { ok: true };
    },
  };
}

describe('Page settings write ordering', () => {
  it('commits Page Edit before writing and flushing', async () => {
    const recorder = recordingWrite();
    const outcome = await commitThenWritePageSettings({
      packagePath: '/doc',
      commit: recorder.commit,
      apply: recorder.apply,
      flush: recorder.flush,
    });
    expect(outcome).toBe('saved');
    expect(recorder.calls).toEqual(['commit:/doc', 'apply', 'flush']);
  });

  it('blocks the geometry/density write when the Page Edit commit fails', async () => {
    const recorder = recordingWrite({ commitResult: false });
    const outcome = await commitThenWritePageSettings({
      packagePath: '/doc',
      commit: recorder.commit,
      apply: recorder.apply,
      flush: recorder.flush,
    });
    expect(outcome).toBe('commit-error');
    expect(recorder.calls).toEqual(['commit:/doc']);
  });

  it('writes without a commit when no document is open', async () => {
    const recorder = recordingWrite();
    const outcome = await commitThenWritePageSettings({
      packagePath: null,
      commit: recorder.commit,
      apply: recorder.apply,
      flush: recorder.flush,
    });
    expect(outcome).toBe('saved');
    expect(recorder.calls).toEqual(['apply', 'flush']);
  });

  it('reports a failed write after the value was applied', async () => {
    const recorder = recordingWrite({ flushResult: { ok: false, message: 'disk full' } });
    const outcome = await commitThenWritePageSettings({
      packagePath: '/doc',
      commit: recorder.commit,
      apply: recorder.apply,
      flush: recorder.flush,
    });
    expect(outcome).toBe('write-error');
    expect(recorder.calls).toEqual(['commit:/doc', 'apply', 'flush']);
  });
});
