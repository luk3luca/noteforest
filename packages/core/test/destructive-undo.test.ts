import { describe, expect, it } from 'vitest';
import type { DocumentCommand } from '../src/commands.js';
import { applyInverse, executeCommand } from '../src/commands.js';
import type { Document } from '../src/types.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
  run,
  textContent,
} from './helpers.js';
import {
  expectCommandSuccess as success,
  expectDocumentValid as expectValid,
  expectUndoRedoIdentity,
  normalizedDocument as stable,
  redoOf,
  undoOf,
} from './command-invariants.js';

/**
 * Whole-document comparison. Revision and document.updatedAt are expected to
 * move forward on undo/redo; every other field, including block timestamps,
 * unknown fields, anchors, reference branches and chapter order, must match.
 */

function exerciseUndoRedo(
  before: Document,
  command: DocumentCommand,
): { afterDelete: Document; afterUndo: Document; afterRedo: Document } {
  const identity = expectUndoRedoIdentity(before, command, deterministicContext(2000));
  return {
    afterDelete: identity.applied.document,
    afterUndo: identity.undone.document,
    afterRedo: identity.redone.document,
  };
}

function buildFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const topA = addTopLevel(document, 'A', context);
  document = topA.document;
  const topB = addTopLevel(document, 'B', context);
  document = topB.document;
  const childA1 = addChild(document, topA.blockId, 'A1', context);
  document = childA1.document;
  const grandchildA1a = addChild(document, childA1.blockId, 'A1a', context);
  document = grandchildA1a.document;
  const childA2 = addChild(document, topA.blockId, 'A2', context);
  document = childA2.document;
  const childB1 = addChild(document, topB.blockId, 'B1', context);
  document = childB1.document;

  // Identity and forward-compatible data that the inverse must not normalize.
  const rootBlock = document.blocks[topA.blockId];
  const childBlock = document.blocks[childA1.blockId];
  const childBranch = document.branches[childA1.branchId];
  if (rootBlock === undefined || childBlock === undefined || childBranch === undefined) {
    throw new Error('fixture records are missing');
  }
  rootBlock.label = 'Root A';
  rootBlock.extensions = { study: { pinned: true } };
  childBlock.createdAt = '2026-01-02T03:04:05.000Z';
  childBlock.updatedAt = '2026-02-03T04:05:06.000Z';
  childBranch.label = 'depends on';
  childBranch.extensions = { weight: 2 };
  document.anchors['anchor-a1'] = {
    id: 'anchor-a1',
    blockId: childA1.blockId,
    kind: 'text',
    selector: { quote: 'A1', position: 0 },
    quote: 'A1',
    extensions: { future: 'kept' },
  };
  document.branches['reference-anchor'] = {
    id: 'reference-anchor',
    source: { blockId: childA1.blockId, anchorId: 'anchor-a1' },
    targetBlockId: topB.blockId,
    role: 'reference',
    order: 'r',
    label: 'see also',
    extensions: { crossLink: true },
  };
  document.manualBreakBeforeBlockIds = [childA1.blockId];
  expectValid(document);

  return {
    context,
    document,
    chapterId: document.chapters[0]?.id ?? '',
    a: topA.blockId,
    b: topB.blockId,
    a1: childA1.blockId,
    a1a: grandchildA1a.blockId,
    a2: childA2.blockId,
    branchA1: childA1.branchId,
    branchA1a: grandchildA1a.branchId,
    branchA2: childA2.branchId,
  };
}

describe('destructive undo — block.delete', () => {
  it('restores a promoted top-level block with identical identity, order and chapter', () => {
    const fixture = buildFixture();
    const { afterDelete } = exerciseUndoRedo(fixture.document, {
      type: 'block.delete',
      blockId: fixture.a,
      children: 'promote',
    });

    // The promoted children are top-level in the deleted state; the inverse
    // must put the root back with their original primary branches.
    expect(afterDelete.blocks[fixture.a]).toBeUndefined();
    const restored = undoOf(run(fixture.document, {
      type: 'block.delete',
      blockId: fixture.a,
      children: 'promote',
    }, deterministicContext(3000)));
    const document = restored.document;
    expect(document.chapters[0]?.topLevelBlockIds).toEqual(
      fixture.document.chapters[0]?.topLevelBlockIds,
    );
    expect(document.blocks[fixture.a]?.label).toBe('Root A');
    expect(document.blocks[fixture.a]?.extensions).toEqual({ study: { pinned: true } });
    expect(document.branches[fixture.branchA1]).toMatchObject({
      id: fixture.branchA1,
      source: { blockId: fixture.a },
      targetBlockId: fixture.a1,
      role: 'primary',
      label: 'depends on',
      extensions: { weight: 2 },
    });
    expect(document.branches[fixture.branchA2]?.source.blockId).toBe(fixture.a);
    expect(document.branches[fixture.branchA1a]?.source.blockId).toBe(fixture.a1);
  });

  it('restores a promoted child block and the repointed child branch IDs', () => {
    const fixture = buildFixture();
    const deleted = run(fixture.document, {
      type: 'block.delete',
      blockId: fixture.a1,
      children: 'promote',
    }, deterministicContext(4000));

    // Before the undo, A1a was repointed to A while keeping its branch ID.
    expect(deleted.document.branches[fixture.branchA1a]).toMatchObject({
      source: { blockId: fixture.a },
      targetBlockId: fixture.a1a,
    });

    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(fixture.document));
    expect(undone.document.branches[fixture.branchA1a]).toMatchObject({
      source: { blockId: fixture.a1 },
      targetBlockId: fixture.a1a,
    });
    expect(undone.document.branches[fixture.branchA1]?.source.blockId).toBe(fixture.a);

    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(deleted.document));
  });

  it('restores a deleted subtree including anchors, reference branches and break hints', () => {
    const fixture = buildFixture();
    exerciseUndoRedo(fixture.document, {
      type: 'block.delete',
      blockId: fixture.a,
      children: 'delete-subtree',
    });

    const restored = undoOf(run(fixture.document, {
      type: 'block.delete',
      blockId: fixture.a,
      children: 'delete-subtree',
    }, deterministicContext(5000)));
    expect(restored.document.anchors['anchor-a1']).toEqual(
      fixture.document.anchors['anchor-a1'],
    );
    expect(restored.document.branches['reference-anchor']).toEqual(
      fixture.document.branches['reference-anchor'],
    );
    expect(restored.document.manualBreakBeforeBlockIds).toEqual([fixture.a1]);
  });
});

describe('destructive undo — branch.delete', () => {
  it('restores a detached branch with the same ID, endpoints, order and label', () => {
    const fixture = buildFixture();
    const { afterDelete } = exerciseUndoRedo(fixture.document, {
      type: 'branch.delete',
      branchId: fixture.branchA1,
      targetHandling: { kind: 'promote' },
    });

    // Detach promoted the target into the chapter; redo must do it again.
    const chapter = afterDelete.chapters[0]?.topLevelBlockIds ?? [];
    expect(chapter).toContain(fixture.a1);
    expect(chapter.indexOf(fixture.a1)).toBe(chapter.indexOf(fixture.a) + 1);

    const undone = undoOf(run(fixture.document, {
      type: 'branch.delete',
      branchId: fixture.branchA1,
      targetHandling: { kind: 'promote' },
    }, deterministicContext(6000)));
    expect(undone.document.branches[fixture.branchA1]).toEqual(
      fixture.document.branches[fixture.branchA1],
    );
    expect(undone.document.chapters[0]?.topLevelBlockIds).not.toContain(fixture.a1);
    expect(undone.document.blocks[fixture.a1]).toEqual(fixture.document.blocks[fixture.a1]);
  });

  it('restores a branch and subtree removed by branch.delete delete-subtree', () => {
    const fixture = buildFixture();
    exerciseUndoRedo(fixture.document, {
      type: 'branch.delete',
      branchId: fixture.branchA1,
      targetHandling: { kind: 'delete-subtree' },
    });
  });
});

describe('destructive undo — record restore safety', () => {
  it('keeps text written in a surviving block between the delete and its undo', () => {
    const fixture = buildFixture();
    const deleted = run(fixture.document, {
      type: 'block.delete',
      blockId: fixture.a,
      children: 'delete-subtree',
    });
    const restore = deleted.inverse;
    expect(restore?.type).toBe('structure.restore');
    if (restore === null) throw new Error('missing inverse');

    const edited = run(deleted.document, {
      type: 'block.editContent',
      blockId: fixture.b,
      content: textContent('Edited after the delete'),
    });
    const undone = success(executeCommand(edited.document, restore));
    expect(undone.document.blocks[fixture.b]?.content).toEqual(
      textContent('Edited after the delete'),
    );
    expect(undone.document.blocks[fixture.a]).toEqual(fixture.document.blocks[fixture.a]);
    expect(undone.document.branches[fixture.branchA1]).toEqual(
      fixture.document.branches[fixture.branchA1],
    );
    expectValid(undone.document);
  });

  it('undoes a later structural creation before restoring the deleted subtree', () => {
    const fixture = buildFixture();
    const deleted = run(fixture.document, {
      type: 'block.delete',
      blockId: fixture.a,
      children: 'delete-subtree',
    });
    const created = run(deleted.document, {
      type: 'block.create',
      label: 'Later block',
      content: textContent('Later block'),
      placement: { kind: 'top-level', chapterId: fixture.chapterId },
    });

    // LIFO: the later creation is undone first, then the delete restore sees a
    // chapter that matches its pre-delete snapshot again.
    const undoneCreation = success(applyInverse(created));
    expect(stable(undoneCreation.document)).toEqual(stable(deleted.document));
    const undoneDelete = success(applyInverse(deleted));
    expect(stable(undoneDelete.document)).toEqual(stable(fixture.document));
    expectValid(undoneDelete.document);
  });

  it('keeps text written in the detached target between the detach and its undo', () => {
    const fixture = buildFixture();
    const detached = run(fixture.document, {
      type: 'branch.delete',
      branchId: fixture.branchA1,
      targetHandling: { kind: 'promote' },
    });
    const restore = detached.inverse;
    expect(restore?.type).toBe('structure.restore');
    if (restore === null) throw new Error('missing inverse');

    const edited = run(detached.document, {
      type: 'block.editContent',
      blockId: fixture.a1,
      content: textContent('Edited after the detach'),
    });
    const undone = success(executeCommand(edited.document, restore));
    expect(undone.document.blocks[fixture.a1]?.content).toEqual(
      textContent('Edited after the detach'),
    );
    expect(undone.document.branches[fixture.branchA1]).toEqual(
      fixture.document.branches[fixture.branchA1],
    );
    expect(undone.document.chapters[0]?.topLevelBlockIds).not.toContain(fixture.a1);
    expectValid(undone.document);
  });

  it('rejects a restore that would duplicate existing records', () => {
    const fixture = buildFixture();
    const deleted = run(fixture.document, {
      type: 'block.delete',
      blockId: fixture.a1,
      children: 'delete-subtree',
    });
    const restore = deleted.inverse;
    expect(restore?.type).toBe('structure.restore');
    if (restore === null) throw new Error('missing inverse');

    const undone = undoOf(deleted);
    const duplicate = executeCommand(undone.document, restore);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe('duplicate-id');
    expect(stable(undone.document)).toEqual(stable(fixture.document));
  });

  it('round-trips the undo of a creation back to the exact created block', () => {
    const fixture = buildFixture();
    const created = run(fixture.document, {
      type: 'block.create',
      label: 'Created',
      content: textContent('Created'),
      placement: { kind: 'child', parentBlockId: fixture.a },
    });
    const createdId = created.created.blockIds[0] ?? '';
    const createdBranchId = created.created.branchIds[0] ?? '';
    expect(created.document.blocks[createdId]?.label).toBe('Created');

    // Undo of a creation applies block.delete delete-subtree; its inverse is
    // the new record restore, so redo returns the same block and branch IDs.
    const undoneCreate = undoOf(created);
    expect(undoneCreate.document.blocks[createdId]).toBeUndefined();
    expect(undoneCreate.document.branches[createdBranchId]).toBeUndefined();

    const redoneCreate = redoOf(undoneCreate);
    expect(stable(redoneCreate.document)).toEqual(stable(created.document));
    expect(redoneCreate.document.blocks[createdId]).toMatchObject({
      id: createdId,
      label: 'Created',
    });
    expect(redoneCreate.document.branches[createdBranchId]).toMatchObject({
      id: createdBranchId,
      source: { blockId: fixture.a },
      targetBlockId: createdId,
    });
  });
});
