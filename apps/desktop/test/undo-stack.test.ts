import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDocument,
  executeCommand,
  type Document,
  type DocumentCommand,
} from '@noteforest/core';
import type { ApplyResult, OpenDocumentSnapshot, SaveResult } from '../src/shared/api';
import { DocumentRuntime } from '../src/renderer/src/state/runtime';

afterEach(() => {
  vi.unstubAllGlobals();
});

interface StubOptions {
  /** Fail the next command that matches; the counter is consumed once. */
  failWhen?: (command: DocumentCommand) => boolean;
}

function stubBridge(document: Document, options: StubOptions = {}): {
  applied: DocumentCommand[];
  current: () => Document;
} {
  let current = document;
  const applied: DocumentCommand[] = [];
  vi.stubGlobal('window', {
    noteforest: {
      apply: async (_packagePath: string, command: DocumentCommand): Promise<ApplyResult> => {
        applied.push(command);
        if (options.failWhen?.(command) === true) {
          return { ok: false, message: 'simulated command failure', code: 'unknown' };
        }
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
      save: async (): Promise<SaveResult> => ({
        ok: true,
        changed: true,
        revision: current.revision,
      }),
    },
  });
  return { applied, current: () => current };
}

function snapshot(document: Document): OpenDocumentSnapshot {
  return {
    packagePath: '/tmp/noteforest-test/library/undo',
    document,
    status: 'editable',
    errors: [],
    warnings: [],
  };
}

function baseDocument(): { document: Document; firstBlockId: string } {
  const created = createDocument({
    title: 'Undo test',
    chapterId: 'chapter-one',
    chapterTitle: 'One',
  });
  const first = executeCommand(created, {
    type: 'block.create',
    blockId: 'first',
    placement: { kind: 'top-level', chapterId: 'chapter-one' },
  });
  if (!first.ok) throw new Error(first.message);
  return { document: first.document, firstBlockId: 'first' };
}

describe('chapter creation undo', () => {
  it('creates a chapter and its first block as one undo entry', async () => {
    const { document, firstBlockId } = baseDocument();
    const bridge = stubBridge(document);
    const runtime = new DocumentRuntime(snapshot(document), [], null);

    const created = await runtime.createChapterWithFirstBlock('New chapter', 1);
    expect(created.ok).toBe(true);
    expect(created.chapterId).toBeDefined();
    expect(runtime.document.chapters).toHaveLength(2);
    expect(Object.keys(runtime.document.blocks)).toHaveLength(2);
    expect(runtime.canUndoStructural).toBe(true);

    const undone = await runtime.undoStructural();
    expect(undone).toEqual({ ok: true });
    expect(runtime.document.chapters).toHaveLength(1);
    expect(Object.keys(runtime.document.blocks)).toHaveLength(1);
    expect(runtime.document.chapters[0]?.topLevelBlockIds).toEqual([firstBlockId]);
    expect(runtime.canUndoStructural).toBe(false);
    // `chapter.delete` has no structural inverse yet: the new chapter is not
    // redoable. This is the recorded follow-up, not a silent half-redo.
    expect(runtime.canRedoStructural).toBe(false);
    expect(bridge.applied.map((command) => command.type)).toEqual([
      'chapter.create',
      'block.create',
      'chapter.delete',
    ]);
    const deleteCommand = bridge.applied.at(-1);
    expect(deleteCommand).toMatchObject({
      type: 'chapter.delete',
      blockHandling: { kind: 'delete-blocks' },
    });
    runtime.dispose();
  });

  it('drops a failed structural undo so older history is reachable', async () => {
    const { document } = baseDocument();
    const bridge = stubBridge(document, {
      failWhen: (command) => command.type === 'chapter.delete',
    });
    const runtime = new DocumentRuntime(snapshot(document), [], null);

    // Older entry: a user-created top-level block.
    const added = await runtime.addTopLevel('chapter-one');
    expect(added.ok).toBe(true);
    expect(Object.keys(runtime.document.blocks)).toHaveLength(2);

    // Newest entry: chapter + first block, one inverse.
    const created = await runtime.createChapterWithFirstBlock('New chapter', 1);
    expect(created.ok).toBe(true);
    expect(runtime.document.chapters).toHaveLength(2);

    const failed = await runtime.undoStructural();
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/simulated command failure/);
    expect(runtime.canUndoStructural).toBe(true);
    expect(runtime.document.chapters).toHaveLength(2);

    const older = await runtime.undoStructural();
    expect(older.ok).toBe(true);
    expect(runtime.canUndoStructural).toBe(false);
    // The failed chapter undo left the new chapter (and its block) in place;
    // the older entry removed only the block it had created.
    expect(Object.keys(runtime.document.blocks)).toHaveLength(2);
    expect(runtime.document.blocks[added.blockId ?? '']).toBeUndefined();
    expect(runtime.document.chapters).toHaveLength(2);

    const exhausted = await runtime.undoStructural();
    expect(exhausted.ok).toBe(false);
    expect(exhausted.message).toBe('Nothing to undo.');
    expect(bridge.applied.at(-2)?.type).toBe('chapter.delete');
    expect(bridge.applied.at(-1)?.type).toBe('block.delete');
    runtime.dispose();
  });

  it('drops a failed structural redo so older redo entries are reachable', async () => {
    const { document } = baseDocument();
    const secondChapter = executeCommand(document, {
      type: 'chapter.create',
      chapterId: 'chapter-two',
      title: 'Two',
    });
    if (!secondChapter.ok) throw new Error(secondChapter.message);
    const secondBase = executeCommand(secondChapter.document, {
      type: 'block.create',
      blockId: 'second-base',
      placement: { kind: 'top-level', chapterId: 'chapter-two' },
    });
    if (!secondBase.ok) throw new Error(secondBase.message);

    let failures = 1;
    const bridge = stubBridge(secondBase.document, {
      failWhen: (command) => {
        if (command.type !== 'structure.restore' || failures === 0) return false;
        failures -= 1;
        return true;
      },
    });
    const runtime = new DocumentRuntime(snapshot(secondBase.document), [], null);

    // Two independent additions in two chapters, so the older redo does not
    // depend on the failed one.
    const first = await runtime.addTopLevel('chapter-one');
    const second = await runtime.addTopLevel('chapter-two');
    expect(first.ok && second.ok).toBe(true);
    expect(Object.keys(runtime.document.blocks)).toHaveLength(4);

    expect((await runtime.undoStructural()).ok).toBe(true);
    expect((await runtime.undoStructural()).ok).toBe(true);
    expect(runtime.canRedoStructural).toBe(true);
    expect(Object.keys(runtime.document.blocks)).toHaveLength(2);

    const failed = await runtime.redoStructural();
    expect(failed.ok).toBe(false);
    expect(failed.message).toMatch(/simulated command failure/);
    expect(runtime.canRedoStructural).toBe(true);
    expect(Object.keys(runtime.document.blocks)).toHaveLength(2);

    const older = await runtime.redoStructural();
    expect(older.ok).toBe(true);
    expect(runtime.canRedoStructural).toBe(false);
    expect(Object.keys(runtime.document.blocks)).toHaveLength(3);
    expect(
      runtime.document.chapters.find((chapter) => chapter.id === 'chapter-two')
        ?.topLevelBlockIds,
    ).toHaveLength(2);

    const exhausted = await runtime.redoStructural();
    expect(exhausted.ok).toBe(false);
    expect(exhausted.message).toBe('Nothing to redo.');
    expect(bridge.applied.at(-2)?.type).toBe('structure.restore');
    expect(bridge.applied.at(-1)?.type).toBe('structure.restore');
    runtime.dispose();
  });
});
