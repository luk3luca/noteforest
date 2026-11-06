import { describe, expect, it } from 'vitest';
import type { CommandSuccess } from '../src/commands.js';
import { executeCommand } from '../src/commands.js';
import type { Document } from '../src/types.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
  run,
  textContent,
} from './helpers.js';
import type { CoreContext } from '../src/ids.js';
import {
  expectCommandSuccess as success,
  expectDocumentValid as expectValid,
  expectRecordCounts,
  normalizedDocument as stable,
  redoOf,
  undoOf,
} from './command-invariants.js';

/**
 * Whole-document comparison. Revision and document.updatedAt move forward on
 * every command; every other field — block IDs/timestamps/content/unknown
 * fields, branch IDs/source/target/role/order/label/unknown fields, anchors and
 * chapter top-level order — must match exactly.
 */

function chapterBlocks(document: Document, chapterId: string): string[] {
  return document.chapters.find((chapter) => chapter.id === chapterId)?.topLevelBlockIds ?? [];
}

function addTopLevelInChapter(
  document: Document,
  chapterId: string,
  label: string,
  context: CoreContext,
): { document: Document; blockId: string } {
  const result = run(
    document,
    {
      type: 'block.create',
      label,
      content: textContent(label),
      placement: { kind: 'top-level', chapterId },
    },
    context,
  );
  const blockId = result.created.blockIds[0];
  if (blockId === undefined) throw new Error('block.create did not report its block ID');
  return { document: result.document, blockId };
}

function buildFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const chapterA = document.chapters[0]?.id ?? '';

  document = run(
    document,
    { type: 'chapter.create', chapterId: 'chapter-b', title: 'Chapter B' },
    context,
  ).document;
  const chapterB = 'chapter-b';

  const a1 = addTopLevel(document, 'A1', context);
  document = a1.document;
  const a2 = addTopLevel(document, 'A2', context);
  document = a2.document;
  const b1 = addTopLevelInChapter(document, chapterB, 'B1', context);
  document = b1.document;
  const b2 = addTopLevelInChapter(document, chapterB, 'B2', context);
  document = b2.document;

  const c1 = addChild(document, a1.blockId, 'C1', context);
  document = c1.document;
  const c2 = addChild(document, a1.blockId, 'C2', context);
  document = c2.document;
  const c1x = addChild(document, c1.blockId, 'C1x', context);
  document = c1x.document;

  // Identity and forward-compatible data that every inverse must not normalize.
  const parentBlock = document.blocks[a1.blockId];
  const movedBlock = document.blocks[c1.blockId];
  const movedBranch = document.branches[c1.branchId];
  const siblingBranch = document.branches[c2.branchId];
  if (
    parentBlock === undefined ||
    movedBlock === undefined ||
    movedBranch === undefined ||
    siblingBranch === undefined
  ) {
    throw new Error('fixture records are missing');
  }
  parentBlock.label = 'Parent A1';
  parentBlock.extensions = { study: { pinned: true } };
  movedBlock.createdAt = '2026-01-02T03:04:05.000Z';
  movedBlock.updatedAt = '2026-02-03T04:05:06.000Z';
  movedBlock.extensions = { future: 'kept' };
  movedBranch.label = 'depends on';
  movedBranch.extensions = { weight: 2 };
  siblingBranch.label = 'next';
  document.anchors['anchor-c1'] = {
    id: 'anchor-c1',
    blockId: c1.blockId,
    kind: 'text',
    selector: { quote: 'C1', position: 0 },
    quote: 'C1',
    extensions: { future: 'anchor' },
  };
  document.branches['reference-c1'] = {
    id: 'reference-c1',
    source: { blockId: c1.blockId, anchorId: 'anchor-c1' },
    targetBlockId: b1.blockId,
    role: 'reference',
    order: 'r',
    label: 'see also',
    extensions: { crossLink: true },
  };
  document.manualBreakBeforeBlockIds = [c2.blockId];
  expectValid(document);

  return {
    context,
    document,
    chapterA,
    chapterB,
    a1: a1.blockId,
    a2: a2.blockId,
    b1: b1.blockId,
    b2: b2.blockId,
    c1: c1.blockId,
    c2: c2.blockId,
    c1x: c1x.blockId,
    branchC1: c1.branchId,
    branchC2: c2.branchId,
    branchC1x: c1x.branchId,
  };
}

function exerciseCycles(before: Document, applied: CommandSuccess, after: Document): void {
  let current = applied;
  expect(stable(current.document)).toEqual(stable(after));
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const undone = undoOf(current);
    expect(stable(undone.document)).toEqual(stable(before));
    expectRecordCounts(undone.document, before);
    expectValid(undone.document);
    current = redoOf(undone);
    expect(stable(current.document)).toEqual(stable(after));
    expectRecordCounts(current.document, after);
    expectValid(current.document);
  }
}

describe('move undo — child to top level', () => {
  it('restores the exact branch record, chapter and order, and redo removes it', () => {
    const fixture = buildFixture();
    const before = fixture.document;
    const branch = before.branches[fixture.branchC1];
    if (branch === undefined) throw new Error('missing branch fixture');

    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: fixture.c1,
          to: { kind: 'top-level', chapterId: fixture.chapterB, atIndex: 1 },
        },
        fixture.context,
      ),
    );
    const afterMove = moved.document;
    expectValid(afterMove);
    expect(afterMove.branches[fixture.branchC1]).toBeUndefined();
    expect(chapterBlocks(afterMove, fixture.chapterB)[1]).toBe(fixture.c1);
    expect(chapterBlocks(afterMove, fixture.chapterA)).not.toContain(fixture.c1);
    // The moved block keeps its own child branch and content.
    expect(afterMove.branches[fixture.branchC1x]?.source.blockId).toBe(fixture.c1);

    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.branches[fixture.branchC1]).toEqual(branch);
    expect(undone.document.branches[fixture.branchC1]).toMatchObject({
      id: fixture.branchC1,
      source: { blockId: fixture.a1 },
      targetBlockId: fixture.c1,
      role: 'primary',
      label: 'depends on',
      extensions: { weight: 2 },
    });
    expect(chapterBlocks(undone.document, fixture.chapterA)).toEqual(
      chapterBlocks(before, fixture.chapterA),
    );
    expect(chapterBlocks(undone.document, fixture.chapterB)).toEqual(
      chapterBlocks(before, fixture.chapterB),
    );
    expect(undone.document.blocks[fixture.c1]?.extensions).toEqual({ future: 'kept' });
    expect(undone.document.anchors['anchor-c1']).toEqual(before.anchors['anchor-c1']);
    expect(undone.document.branches['reference-c1']).toEqual(
      before.branches['reference-c1'],
    );

    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(afterMove));
    expect(redone.document.branches[fixture.branchC1]).toBeUndefined();

    exerciseCycles(before, moved, afterMove);
  });

  it('keeps the original branch ID across repeated child → top-level moves and undos', () => {
    const fixture = buildFixture();
    const before = fixture.document;
    const originalBranch = before.branches[fixture.branchC1];
    if (originalBranch === undefined) throw new Error('missing branch fixture');

    let document = before;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const moved = success(
        run(
          document,
          {
            type: 'block.move',
            blockId: fixture.c1,
            to: { kind: 'top-level', chapterId: fixture.chapterA, atIndex: 0 },
          },
          fixture.context,
        ),
      );
      expect(moved.document.branches[fixture.branchC1]).toBeUndefined();
      const undone = undoOf(moved);
      expect(stable(undone.document)).toEqual(stable(before));
      expect(undone.document.branches[fixture.branchC1]).toEqual(originalBranch);
      document = undone.document;
    }
  });
});

describe('move undo — top level to child', () => {
  it('returns the block to its original chapter and slot, then redo reattaches with the same branch ID', () => {
    const fixture = buildFixture();
    const before = fixture.document;
    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: fixture.b2,
          to: { kind: 'child', parentBlockId: fixture.a1, atIndex: 0 },
        },
        fixture.context,
      ),
    );
    const afterMove = moved.document;
    const createdBranchId = Object.keys(afterMove.branches).find(
      (branchId) => before.branches[branchId] === undefined,
    );
    expect(createdBranchId).toBeDefined();
    if (createdBranchId === undefined) throw new Error('move created no branch');
    const createdBranch = afterMove.branches[createdBranchId];
    expect(createdBranch).toMatchObject({
      id: createdBranchId,
      source: { blockId: fixture.a1 },
      targetBlockId: fixture.b2,
      role: 'primary',
    });
    expect(chapterBlocks(afterMove, fixture.chapterB)).not.toContain(fixture.b2);

    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(chapterBlocks(undone.document, fixture.chapterB)[1]).toBe(fixture.b2);
    expect(chapterBlocks(undone.document, fixture.chapterB)).toEqual(
      chapterBlocks(before, fixture.chapterB),
    );
    expect(undone.document.branches[createdBranchId]).toBeUndefined();

    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(afterMove));
    expect(redone.document.branches[createdBranchId]).toEqual(createdBranch);
    expect(chapterBlocks(redone.document, fixture.chapterB)).toEqual(
      chapterBlocks(afterMove, fixture.chapterB),
    );

    exerciseCycles(before, moved, afterMove);
  });
});

describe('move undo — sibling order', () => {
  it('restores the exact branch order key and redo reproduces the moved order', () => {
    const fixture = buildFixture();
    const before = fixture.document;
    const original = before.branches[fixture.branchC2];
    if (original === undefined) throw new Error('missing sibling branch fixture');
    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: fixture.c2,
          to: { kind: 'sibling', siblingBlockId: fixture.c1, after: false },
        },
        fixture.context,
      ),
    );
    const afterMove = moved.document;
    expect(moved.document.branches[fixture.branchC2]?.id).toBe(fixture.branchC2);
    expect(moved.document.branches[fixture.branchC2]?.order).not.toBe(original.order);

    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.branches[fixture.branchC2]).toEqual(original);

    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(afterMove));
    expect(redone.document.branches[fixture.branchC2]).toEqual(
      afterMove.branches[fixture.branchC2],
    );
  });
});

describe('branch.create undo — cross-chapter', () => {
  it('returns the target to its original chapter and slot, then redo reattaches with the same branch ID', () => {
    const fixture = buildFixture();
    const before = fixture.document;
    const attached = success(
      run(
        before,
        {
          type: 'branch.create',
          sourceBlockId: fixture.a1,
          targetBlockId: fixture.b2,
        },
        fixture.context,
      ),
    );
    const afterAttach = attached.document;
    const createdBranchId = Object.keys(afterAttach.branches).find(
      (branchId) => before.branches[branchId] === undefined,
    );
    if (createdBranchId === undefined) throw new Error('branch.create created no branch');
    const createdBranch = afterAttach.branches[createdBranchId];
    expect(createdBranch).toMatchObject({
      id: createdBranchId,
      source: { blockId: fixture.a1 },
      targetBlockId: fixture.b2,
      role: 'primary',
    });
    expect(chapterBlocks(afterAttach, fixture.chapterB)).not.toContain(fixture.b2);

    const undone = undoOf(attached);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(chapterBlocks(undone.document, fixture.chapterB)).toEqual(
      chapterBlocks(before, fixture.chapterB),
    );
    expect(chapterBlocks(undone.document, fixture.chapterB)[1]).toBe(fixture.b2);
    expect(chapterBlocks(undone.document, fixture.chapterA)).toEqual(
      chapterBlocks(before, fixture.chapterA),
    );
    expect(undone.document.branches[createdBranchId]).toBeUndefined();
    expect(undone.document.branches[fixture.branchC1]).toEqual(
      before.branches[fixture.branchC1],
    );

    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(afterAttach));
    expect(redone.document.branches[createdBranchId]).toEqual(createdBranch);
    expect(chapterBlocks(redone.document, fixture.chapterB)).toEqual(
      chapterBlocks(afterAttach, fixture.chapterB),
    );

    exerciseCycles(before, attached, afterAttach);
  });

  it('keeps an explicit branch ID across undo and redo', () => {
    const fixture = buildFixture();
    const attached = success(
      run(
        fixture.document,
        {
          type: 'branch.create',
          branchId: 'branch-explicit',
          sourceBlockId: fixture.a1,
          targetBlockId: fixture.b2,
        },
        fixture.context,
      ),
    );
    expect(attached.document.branches['branch-explicit']).toMatchObject({
      id: 'branch-explicit',
      source: { blockId: fixture.a1 },
      targetBlockId: fixture.b2,
    });
    const afterAttach = stable(attached.document);

    const undone = undoOf(attached);
    expect(undone.document.branches['branch-explicit']).toBeUndefined();
    expect(stable(undone.document)).toEqual(stable(fixture.document));

    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(afterAttach);
    expect(redone.document.branches['branch-explicit']).toEqual(
      attached.document.branches['branch-explicit'],
    );
  });
});

describe('structural snapshot safety', () => {
  it('keeps text written in a surviving block after a move', () => {
    const fixture = buildFixture();
    const moved = success(
      run(
        fixture.document,
        {
          type: 'block.move',
          blockId: fixture.c1,
          to: { kind: 'top-level', chapterId: fixture.chapterB },
        },
        fixture.context,
      ),
    );
    const restore = moved.inverse;
    expect(restore?.type).toBe('structure.restore');
    if (restore === null) throw new Error('missing inverse');

    const edited = success(
      run(
        moved.document,
        {
          type: 'block.editContent',
          blockId: fixture.a2,
          content: textContent('Edited after the move'),
        },
        fixture.context,
      ),
    );
    const undone = success(executeCommand(edited.document, restore));
    expect(undone.document.blocks[fixture.a2]?.content).toEqual(
      textContent('Edited after the move'),
    );
    expect(undone.document.branches[fixture.branchC1]).toEqual(
      fixture.document.branches[fixture.branchC1],
    );
    expect(undone.document.anchors['anchor-c1']).toEqual(
      fixture.document.anchors['anchor-c1'],
    );
    expectValid(undone.document);
  });

  it('keeps text written in the attached target after a cross-chapter branch.create', () => {
    const fixture = buildFixture();
    const attached = success(
      run(
        fixture.document,
        { type: 'branch.create', sourceBlockId: fixture.a1, targetBlockId: fixture.b2 },
        fixture.context,
      ),
    );
    const restore = attached.inverse;
    expect(restore?.type).toBe('structure.restore');
    if (restore === null) throw new Error('missing inverse');

    const edited = success(
      run(
        attached.document,
        {
          type: 'block.editContent',
          blockId: fixture.b2,
          content: textContent('Edited after the attach'),
        },
        fixture.context,
      ),
    );
    const undone = success(executeCommand(edited.document, restore));
    expect(undone.document.blocks[fixture.b2]?.content).toEqual(
      textContent('Edited after the attach'),
    );
    expect(chapterBlocks(undone.document, fixture.chapterB)).toEqual(
      chapterBlocks(fixture.document, fixture.chapterB),
    );
    expect(undone.document.branches[fixture.branchC1]).toEqual(
      fixture.document.branches[fixture.branchC1],
    );
    expectValid(undone.document);
  });

  it('does not duplicate or lose records after an undo of a redo of a move', () => {
    const fixture = buildFixture();
    const before = fixture.document;
    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: fixture.c2,
          to: { kind: 'top-level', chapterId: fixture.chapterB, atIndex: 2 },
        },
        fixture.context,
      ),
    );
    const undone = undoOf(moved);
    const redone = redoOf(undone);
    const undoneAgain = undoOf(redone);
    expect(stable(undoneAgain.document)).toEqual(stable(before));
    expectRecordCounts(undoneAgain.document, before);
    expectValid(undoneAgain.document);
    expect(Object.values(undoneAgain.document.branches)).toHaveLength(
      Object.values(before.branches).length,
    );
    expect(chapterBlocks(undoneAgain.document, fixture.chapterA)).toEqual(
      chapterBlocks(before, fixture.chapterA),
    );
  });
});
