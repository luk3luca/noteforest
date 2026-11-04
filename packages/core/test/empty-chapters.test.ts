import { describe, expect, it } from 'vitest';
import type { DocumentCommand } from '../src/commands.js';
import { validateDocument } from '../src/validation.js';
import {
  deterministicContext,
  newDocument,
  run,
  textContent,
  tryRun,
} from './helpers.js';

/**
 * Build two chapters with one top-level block each. Chapter 2 ("Second") is
 * the chapter whose last root is used for the rejection cases.
 */
function twoChapterDocument() {
  const context = deterministicContext();
  let document = newDocument(context);
  const firstChapterId = document.chapters[0]?.id ?? '';
  document = run(
    document,
    {
      type: 'block.create',
      blockId: 'A',
      content: textContent('A'),
      placement: { kind: 'top-level', chapterId: firstChapterId },
    },
    context,
  ).document;
  document = run(
    document,
    { type: 'chapter.create', chapterId: 'c2', title: 'Second' },
    context,
  ).document;
  document = run(
    document,
    {
      type: 'block.create',
      blockId: 'B',
      content: textContent('B'),
      placement: { kind: 'top-level', chapterId: 'c2' },
    },
    context,
  ).document;
  return { context, document, firstChapterId, secondChapterId: 'c2' };
}

function expectEmptyChapterRejection(
  result: ReturnType<typeof tryRun>,
  verb: RegExp,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.code).toBe('chapter-would-be-empty');
  expect(result.message).toMatch(verb);
  expect(result.message).toContain('"Second"');
  expect(result.message).toMatch(/Add another top-level block or delete the chapter instead/);
}

describe('empty-chapter invariant (F6)', () => {
  it('rejects moving the last top-level block out of its chapter', () => {
    const { document, firstChapterId } = twoChapterDocument();

    const toAnotherChapter = tryRun(document, {
      type: 'block.move',
      blockId: 'B',
      to: { kind: 'top-level', chapterId: firstChapterId },
    });
    expectEmptyChapterRejection(toAnotherChapter, /Cannot move the last top-level block/);

    const underAnotherChapter = tryRun(document, {
      type: 'block.move',
      blockId: 'B',
      to: { kind: 'child', parentBlockId: 'A' },
    });
    expectEmptyChapterRejection(underAnotherChapter, /Cannot move the last top-level block/);
  });

  it('still allows reordering the last top-level block inside its own chapter', () => {
    const { document } = twoChapterDocument();
    const moved = run(document, {
      type: 'block.move',
      blockId: 'B',
      to: { kind: 'top-level', chapterId: 'c2', atIndex: 0 },
    });
    expect(moved.document.chapters.find((chapter) => chapter.id === 'c2')?.topLevelBlockIds).toEqual([
      'B',
    ]);
  });

  it('allows a move once the chapter has another top-level block', () => {
    const { context, document, firstChapterId } = twoChapterDocument();
    const withAnotherRoot = run(
      document,
      {
        type: 'block.create',
        blockId: 'C',
        content: textContent('C'),
        placement: { kind: 'top-level', chapterId: 'c2' },
      },
      context,
    ).document;

    const moved = run(withAnotherRoot, {
      type: 'block.move',
      blockId: 'B',
      to: { kind: 'top-level', chapterId: firstChapterId },
    });
    expect(moved.document.chapters.find((chapter) => chapter.id === 'c2')?.topLevelBlockIds).toEqual([
      'C',
    ]);
    expect(moved.document.chapters.find((chapter) => chapter.id === firstChapterId)?.topLevelBlockIds).toEqual(
      ['A', 'B'],
    );
  });

  it('rejects branch.create that would move the last top-level block out', () => {
    const { document } = twoChapterDocument();
    expectEmptyChapterRejection(
      tryRun(document, {
        type: 'branch.create',
        sourceBlockId: 'A',
        targetBlockId: 'B',
      }),
      /Cannot branch the last top-level block/,
    );
  });

  it('allows branch.create when the target chapter keeps another top-level block', () => {
    const { context, document } = twoChapterDocument();
    const withAnotherRoot = run(
      document,
      {
        type: 'block.create',
        blockId: 'C',
        content: textContent('C'),
        placement: { kind: 'top-level', chapterId: 'c2' },
      },
      context,
    ).document;

    const attached = run(withAnotherRoot, {
      type: 'branch.create',
      sourceBlockId: 'A',
      targetBlockId: 'B',
    });
    expect(attached.document.chapters.find((chapter) => chapter.id === 'c2')?.topLevelBlockIds).toEqual([
      'C',
    ]);
  });

  it('rejects block.delete of a chapter’s only top-level block', () => {
    const { document } = twoChapterDocument();
    expectEmptyChapterRejection(
      tryRun(document, { type: 'block.delete', blockId: 'B', children: 'delete-subtree' }),
      /Cannot delete the last top-level block/,
    );
    expectEmptyChapterRejection(
      tryRun(document, { type: 'block.delete', blockId: 'B', children: 'promote' }),
      /Cannot delete the last top-level block/,
    );
  });

  it('allows deleting the last root when promote (or explicit chapter delete) keeps the chapter valid', () => {
    const { context, document } = twoChapterDocument();
    const withChild = run(
      document,
      {
        type: 'block.create',
        blockId: 'B1',
        content: textContent('B1'),
        placement: { kind: 'child', parentBlockId: 'B' },
      },
      context,
    ).document;

    const promoted = run(withChild, {
      type: 'block.delete',
      blockId: 'B',
      children: 'promote',
    });
    expect(
      promoted.document.chapters.find((chapter) => chapter.id === 'c2')?.topLevelBlockIds,
    ).toEqual(['B1']);
    expect(validateDocument(promoted.document).ok).toBe(true);

    const deletedChapter = run(document, {
      type: 'chapter.delete',
      chapterId: 'c2',
      blockHandling: { kind: 'delete-blocks' },
    });
    expect(deletedChapter.document.chapters.map((chapter) => chapter.id)).toEqual([
      document.chapters[0]?.id,
    ]);
    expect(deletedChapter.document.blocks['B']).toBeUndefined();
    expect(validateDocument(deletedChapter.document).ok).toBe(true);
  });

  it('names an untitled chapter by ID when it has no title', () => {
    const { context, document } = twoChapterDocument();
    const renamed = run(
      document,
      { type: 'chapter.rename', chapterId: 'c2', title: null } satisfies DocumentCommand,
      context,
    ).document;
    const rejected = tryRun(renamed, {
      type: 'block.delete',
      blockId: 'B',
      children: 'delete-subtree',
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.message).toContain('"c2"');
  });
});
