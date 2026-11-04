import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDocument,
  executeCommand,
  type DocumentCommand,
} from '@noteforest/core';
import type { ApplyResult, OpenDocumentSnapshot, SaveResult } from '../src/shared/api';
import { DocumentRuntime } from '../src/renderer/src/state/runtime';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubBridge(document: OpenDocumentSnapshot['document']): {
  applied: DocumentCommand[];
  saved: () => number;
} {
  let current = document;
  let saveCount = 0;
  const applied: DocumentCommand[] = [];
  vi.stubGlobal('window', {
    noteforest: {
      apply: async (_packagePath: string, command: DocumentCommand): Promise<ApplyResult> => {
        applied.push(command);
        const result = executeCommand(current, command);
        if (!result.ok) return { ok: false, message: result.message, code: result.code };
        current = result.document;
        return {
          ok: true,
          document: current,
          revision: result.revision,
          created: result.created,
          inverse: result.inverse,
        };
      },
      save: async (): Promise<SaveResult> => {
        saveCount += 1;
        return { ok: true, changed: true, revision: current.revision };
      },
    },
  });
  return { applied, saved: () => saveCount };
}

describe('legacy empty chapter repair', () => {
  it('fills every empty chapter, not only the first', async () => {
    const base = createDocument({
      title: 'Legacy',
      chapterId: 'chapter-one',
      chapterTitle: 'One',
    });
    const created = executeCommand(base, {
      type: 'chapter.create',
      chapterId: 'chapter-two',
      title: 'Two',
    });
    if (!created.ok) throw new Error(created.message);

    const bridge = stubBridge(created.document);
    const runtime = new DocumentRuntime(
      {
        packagePath: '/tmp/noteforest-test/library/legacy',
        document: created.document,
        status: 'editable',
        errors: [],
        warnings: [],
      },
      [],
      null,
    );

    await runtime.ensureChaptersHaveBlocks();

    expect(bridge.applied).toHaveLength(2);
    const chapterIds = bridge.applied.map((command) =>
      command.type === 'block.create' && command.placement.kind === 'top-level'
        ? command.placement.chapterId
        : null,
    );
    expect(chapterIds).toEqual(['chapter-one', 'chapter-two']);
    expect(runtime.document.chapters.map((chapter) => chapter.topLevelBlockIds.length)).toEqual([
      1, 1,
    ]);
    expect(bridge.saved()).toBe(1);
    runtime.dispose();
  });

  it('does nothing on a read-only runtime and stays eligible after takeover', async () => {
    const base = createDocument({
      title: 'Legacy',
      chapterId: 'chapter-one',
      chapterTitle: 'One',
    });
    const bridge = stubBridge(base);
    const runtime = new DocumentRuntime(
      {
        packagePath: '/tmp/noteforest-test/library/legacy',
        document: base,
        status: 'read-only',
        readOnlyReason: 'stale-lock',
        errors: [],
        warnings: [],
      },
      [],
      null,
    );

    await runtime.ensureChaptersHaveBlocks();
    expect(bridge.applied).toHaveLength(0);
    expect(runtime.document.chapters[0]?.topLevelBlockIds).toEqual([]);
    runtime.dispose();
  });
});
