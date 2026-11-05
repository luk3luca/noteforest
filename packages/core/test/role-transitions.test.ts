import { describe, expect, it } from 'vitest';
import type { CommandSuccess, DocumentCommand } from '../src/commands.js';
import { applyInverse, executeCommand } from '../src/commands.js';
import {
  chapterIdForBlock,
  directChildBranches,
  directChildIds,
  primaryParentBranch,
  subtreeBlockIds,
} from '../src/structure.js';
import type { Branch, Document } from '../src/types.js';
import { validateDocument } from '../src/validation.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
  run,
  textContent,
  tryRun,
} from './helpers.js';

function success(result: ReturnType<typeof executeCommand>): CommandSuccess {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

function expectValid(document: Document): void {
  const report = validateDocument(document);
  if (!report.ok) {
    throw new Error(report.errors.map((issue) => issue.message).join('; '));
  }
}

function structureSnapshot(document: Document): unknown {
  return structuredClone({
    blocks: document.blocks,
    branches: document.branches,
    chapters: document.chapters,
    anchors: document.anchors,
  });
}

function branchRecord(document: Document, branchId: string): Branch {
  const branch = document.branches[branchId];
  if (branch === undefined) throw new Error(`branch "${branchId}" is missing`);
  return branch;
}

/** Sorted branch records for one source port and role. */
function portList(
  document: Document,
  blockId: string,
  role: 'primary' | 'reference',
): Branch[] {
  return Object.values(document.branches)
    .filter(
      (branch) =>
        branch.role === role &&
        branch.source.blockId === blockId &&
        branch.source.anchorId === undefined,
    )
    .sort((left, right) =>
      left.order === right.order ? (left.id < right.id ? -1 : 1) : left.order < right.order ? -1 : 1,
    );
}

function topLevel(document: Document, chapterId: string): string[] {
  return document.chapters.find((chapter) => chapter.id === chapterId)?.topLevelBlockIds ?? [];
}

function createChapter(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  title: string,
): { document: Document; chapterId: string } {
  const result = run(document, { type: 'chapter.create', title }, context);
  const chapterId = result.created.chapterIds[0];
  if (chapterId === undefined) throw new Error('chapter.create did not report its chapter ID');
  return { document: result.document, chapterId };
}

function addTopLevelTo(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  chapterId: string,
  label: string,
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
  const blockId = result.affected.blockIds.find((id) => !(id in document.blocks));
  if (blockId === undefined) throw new Error('block.create did not report its block ID');
  return { document: result.document, blockId };
}

/**
 * Root A → A1 → A11 plus an unrelated root B. The A→A1 and A1→A11 edges are
 * primary; tests add reference edges from B or from within the subtree.
 */
function buildTree() {
  const context = deterministicContext();
  let document = newDocument(context);
  const chapterId = document.chapters[0]?.id ?? '';

  const a = addTopLevel(document, 'A', context);
  document = a.document;
  const b = addTopLevel(document, 'B', context);
  document = b.document;
  const a1 = addChild(document, a.blockId, 'A1', context);
  document = a1.document;
  const a11 = addChild(document, a1.blockId, 'A11', context);
  document = a11.document;

  return {
    context,
    document,
    chapterId,
    a: a.blockId,
    b: b.blockId,
    a1: a1.blockId,
    a11: a11.blockId,
    branchA1: a1.branchId,
    branchA11: a11.branchId,
  };
}

function reference(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  sourceBlockId: string,
  targetBlockId: string,
): { document: Document; branchId: string } {
  const result = run(
    document,
    { type: 'branch.create', sourceBlockId, targetBlockId, role: 'reference' },
    context,
  );
  const branchId = result.created.branchIds[0];
  if (branchId === undefined) throw new Error('branch.create did not report its branch ID');
  return { document: result.document, branchId };
}

function expectRejected(
  document: Document,
  command: DocumentCommand,
  context: ReturnType<typeof deterministicContext>,
  code: string,
  messagePart?: string,
): void {
  const before = structuredClone(document);
  const result = tryRun(document, command, context);
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.code).toBe(code);
  if (messagePart !== undefined) expect(result.message).toContain(messagePart);
  // A rejected role transition must not mutate the caller's document.
  expect(document).toEqual(before);
}

describe('branch.makeHome', () => {
  it('swaps primary and reference roles while preserving both branch IDs and the target subtree', () => {
    const tree = buildTree();
    const linked = reference(tree.document, tree.context, tree.b, tree.a1);
    const before = structureSnapshot(linked.document);
    const promotedBefore = branchRecord(linked.document, linked.branchId);
    const oldPrimaryBefore = branchRecord(linked.document, tree.branchA1);

    const result = run(
      linked.document,
      { type: 'branch.makeHome', branchId: linked.branchId },
      tree.context,
    );
    expect(result.inverse?.type).toBe('structure.restore');
    expectValid(result.document);

    const promoted = branchRecord(result.document, linked.branchId);
    const demoted = branchRecord(result.document, tree.branchA1);
    expect(promoted).toMatchObject({
      id: promotedBefore.id,
      source: promotedBefore.source,
      targetBlockId: tree.a1,
      role: 'primary',
    });
    expect(demoted).toMatchObject({
      id: oldPrimaryBefore.id,
      source: oldPrimaryBefore.source,
      targetBlockId: tree.a1,
      role: 'reference',
    });
    expect(promoted.order).toBeTruthy();
    expect(demoted.order).toBeTruthy();
    // Promoted at the end of B's primary list, demoted at the end of A's
    // reference list.
    expect(portList(result.document, tree.b, 'primary').at(-1)?.id).toBe(linked.branchId);
    expect(portList(result.document, tree.a, 'reference').at(-1)?.id).toBe(tree.branchA1);

    expect(primaryParentBranch(result.document, tree.a1)?.id).toBe(linked.branchId);
    expect(directChildIds(result.document, tree.a1)).toEqual([tree.a11]);
    expect(subtreeBlockIds(result.document, tree.a1)).toEqual([tree.a1, tree.a11]);
    expect(Object.keys(result.document.branches)).toHaveLength(
      Object.keys(linked.document.branches).length,
    );
    // A1 was never a root, so no chapter slot moves.
    expect(result.document.chapters).toEqual(linked.document.chapters);

    const undone = success(applyInverse(result));
    expect(structureSnapshot(undone.document)).toEqual(before);
    expect(primaryParentBranch(undone.document, tree.a1)?.id).toBe(tree.branchA1);
    expectValid(undone.document);

    const redone = success(applyInverse(undone));
    expect(branchRecord(redone.document, linked.branchId)).toEqual(promoted);
    expect(branchRecord(redone.document, tree.branchA1)).toEqual(demoted);
    expect(redone.document.chapters).toEqual(result.document.chapters);
    expectValid(redone.document);
  });

  it('moves the target and its subtree into the new source chapter without changing top-level slots', () => {
    const tree = buildTree();
    const second = createChapter(tree.document, tree.context, 'Two');
    const c = addTopLevelTo(second.document, tree.context, second.chapterId, 'C');
    const linked = reference(c.document, tree.context, c.blockId, tree.a1);
    const chapterOneTopLevel = topLevel(linked.document, tree.chapterId);
    const chapterTwoTopLevel = topLevel(linked.document, second.chapterId);

    const result = run(
      linked.document,
      { type: 'branch.makeHome', branchId: linked.branchId },
      tree.context,
    );
    expectValid(result.document);
    expect(chapterIdForBlock(result.document, tree.a1)).toBe(second.chapterId);
    expect(chapterIdForBlock(result.document, tree.a11)).toBe(second.chapterId);
    expect(topLevel(result.document, tree.chapterId)).toEqual(chapterOneTopLevel);
    expect(topLevel(result.document, second.chapterId)).toEqual(chapterTwoTopLevel);
    // Top-level membership is unchanged: the target was already a child.
    expect(topLevel(result.document, second.chapterId)).not.toContain(tree.a1);

    const undone = success(applyInverse(result));
    expect(chapterIdForBlock(undone.document, tree.a1)).toBe(tree.chapterId);
    expect(topLevel(undone.document, tree.chapterId)).toEqual(chapterOneTopLevel);
    expect(topLevel(undone.document, second.chapterId)).toEqual(chapterTwoTopLevel);
  });

  it('rejects a root target (OD-7) before mutation', () => {
    const tree = buildTree();
    const linked = reference(tree.document, tree.context, tree.b, tree.a);
    expectRejected(
      linked.document,
      { type: 'branch.makeHome', branchId: linked.branchId },
      tree.context,
      'invalid-placement',
      'already a root',
    );
  });

  it('rejects a promotion that would create a primary cycle before mutation', () => {
    const tree = buildTree();
    // A11 is inside A1's primary subtree, so A11 → A1 (reference) cannot be
    // promoted without making A1 a child of its own descendant.
    const linked = reference(tree.document, tree.context, tree.a11, tree.a1);
    expectRejected(
      linked.document,
      { type: 'branch.makeHome', branchId: linked.branchId },
      tree.context,
      'cycle',
    );
    // The reference remains in place after the rejection.
    expect(branchRecord(linked.document, linked.branchId).role).toBe('reference');
  });
});

describe('branch.moveHere', () => {
  it('promotes the reference, retires the old primary edge, and restores its exact identity on undo', () => {
    const tree = buildTree();
    const linked = reference(tree.document, tree.context, tree.b, tree.a1);
    const before = structureSnapshot(linked.document);
    const promotedBefore = branchRecord(linked.document, linked.branchId);
    const oldPrimaryBefore = branchRecord(linked.document, tree.branchA1);

    const result = run(
      linked.document,
      { type: 'branch.moveHere', branchId: linked.branchId },
      tree.context,
    );
    expect(result.inverse?.type).toBe('structure.restore');
    expectValid(result.document);

    const promoted = branchRecord(result.document, linked.branchId);
    expect(promoted).toMatchObject({
      id: promotedBefore.id,
      source: promotedBefore.source,
      targetBlockId: tree.a1,
      role: 'primary',
    });
    expect(result.document.branches[tree.branchA1]).toBeUndefined();
    expect(primaryParentBranch(result.document, tree.a1)?.id).toBe(linked.branchId);
    expect(directChildIds(result.document, tree.a1)).toEqual([tree.a11]);
    expect(Object.keys(result.document.branches)).toHaveLength(
      Object.keys(linked.document.branches).length - 1,
    );
    expect(result.document.chapters).toEqual(linked.document.chapters);

    const undone = success(applyInverse(result));
    expect(structureSnapshot(undone.document)).toEqual(before);
    expect(branchRecord(undone.document, tree.branchA1)).toEqual(oldPrimaryBefore);
    expect(branchRecord(undone.document, linked.branchId)).toEqual(promotedBefore);
    expectValid(undone.document);

    const redone = success(applyInverse(undone));
    expect(redone.document.branches[tree.branchA1]).toBeUndefined();
    expect(branchRecord(redone.document, linked.branchId)).toEqual(promoted);
    expectValid(redone.document);
  });

  it('removes a root target from its chapter slot, restores the exact index on undo, and protects the empty-chapter invariant', () => {
    const tree = buildTree();
    const second = createChapter(tree.document, tree.context, 'Two');
    const c = addTopLevelTo(second.document, tree.context, second.chapterId, 'C');
    const d = addTopLevelTo(c.document, tree.context, second.chapterId, 'D');
    const linked = reference(d.document, tree.context, tree.b, c.blockId);
    expect(topLevel(linked.document, second.chapterId)).toEqual([c.blockId, d.blockId]);

    const result = run(
      linked.document,
      { type: 'branch.moveHere', branchId: linked.branchId },
      tree.context,
    );
    expectValid(result.document);
    expect(primaryParentBranch(result.document, c.blockId)?.id).toBe(linked.branchId);
    expect(topLevel(result.document, second.chapterId)).toEqual([d.blockId]);
    expect(chapterIdForBlock(result.document, c.blockId)).toBe(tree.chapterId);

    const undone = success(applyInverse(result));
    expect(topLevel(undone.document, second.chapterId)).toEqual([c.blockId, d.blockId]);

    const redone = success(applyInverse(undone));
    expect(topLevel(redone.document, second.chapterId)).toEqual([d.blockId]);

    // Move here would strand a chapter whose only root is the target.
    const third = createChapter(tree.document, tree.context, 'Three');
    const e = addTopLevelTo(third.document, tree.context, third.chapterId, 'E');
    const toRoot = reference(e.document, tree.context, tree.b, e.blockId);
    expectRejected(
      toRoot.document,
      { type: 'branch.moveHere', branchId: toRoot.branchId },
      tree.context,
      'chapter-would-be-empty',
    );
    expect(topLevel(toRoot.document, third.chapterId)).toEqual([e.blockId]);
  });

  it('rejects a promotion that would create a primary cycle before mutation', () => {
    const tree = buildTree();
    // A root A with descendant A1. A1 → A is a reference; promoting it would
    // make A a child of its own descendant.
    const linked = reference(tree.document, tree.context, tree.a1, tree.a);
    expectRejected(
      linked.document,
      { type: 'branch.moveHere', branchId: linked.branchId },
      tree.context,
      'cycle',
    );
  });
});

describe('branch.demote', () => {
  it('converts the primary edge to a reference and makes the target a top-level block after its former root', () => {
    const tree = buildTree();
    const before = structureSnapshot(tree.document);
    const primaryBefore = branchRecord(tree.document, tree.branchA1);
    expect(topLevel(tree.document, tree.chapterId)).toEqual([tree.a, tree.b]);

    const result = run(
      tree.document,
      { type: 'branch.demote', branchId: tree.branchA1 },
      tree.context,
    );
    expect(result.inverse?.type).toBe('structure.restore');
    expectValid(result.document);

    const demoted = branchRecord(result.document, tree.branchA1);
    expect(demoted).toMatchObject({
      id: primaryBefore.id,
      source: primaryBefore.source,
      targetBlockId: tree.a1,
      role: 'reference',
    });
    expect(portList(result.document, tree.a, 'reference').at(-1)?.id).toBe(tree.branchA1);
    expect(primaryParentBranch(result.document, tree.a1)).toBeUndefined();
    expect(directChildIds(result.document, tree.a1)).toEqual([tree.a11]);
    expect(subtreeBlockIds(result.document, tree.a1)).toEqual([tree.a1, tree.a11]);
    expect(topLevel(result.document, tree.chapterId)).toEqual([tree.a, tree.a1, tree.b]);
    expect(Object.keys(result.document.branches)).toHaveLength(
      Object.keys(tree.document.branches).length,
    );

    const undone = success(applyInverse(result));
    expect(structureSnapshot(undone.document)).toEqual(before);
    expect(topLevel(undone.document, tree.chapterId)).toEqual([tree.a, tree.b]);
    expect(branchRecord(undone.document, tree.branchA1)).toEqual(primaryBefore);
    expectValid(undone.document);

    const redone = success(applyInverse(undone));
    expect(branchRecord(redone.document, tree.branchA1)).toEqual(demoted);
    expect(topLevel(redone.document, tree.chapterId)).toEqual([tree.a, tree.a1, tree.b]);
    expectValid(redone.document);
  });

  it('places the target after the source block top-level ancestor when the source is nested', () => {
    const tree = buildTree();
    const result = run(
      tree.document,
      { type: 'branch.demote', branchId: tree.branchA11 },
      tree.context,
    );
    expectValid(result.document);
    expect(primaryParentBranch(result.document, tree.a11)).toBeUndefined();
    // The source A1 is nested under A, so the target lands after A, not A1.
    expect(topLevel(result.document, tree.chapterId)).toEqual([tree.a, tree.a11, tree.b]);
    // A1 keeps its primary home and loses only its child edge.
    expect(primaryParentBranch(result.document, tree.a1)?.id).toBe(tree.branchA1);
    expect(directChildIds(result.document, tree.a1)).toEqual([]);
  });

  it('drops a reference-role call before mutation', () => {
    const tree = buildTree();
    const linked = reference(tree.document, tree.context, tree.b, tree.a1);
    expectRejected(
      linked.document,
      { type: 'branch.demote', branchId: linked.branchId },
      tree.context,
      'invalid-command',
    );
  });
});

describe('anchored role transitions', () => {
  it('keeps the anchor port through makeHome and demote, restoring the exact anchored records', () => {
    const tree = buildTree();
    const anchored = run(
      tree.document,
      {
        type: 'anchor.create',
        anchorId: 'anchor-a',
        blockId: tree.a,
        kind: 'text',
        selector: { kind: 'text', quote: 'A', occurrenceHint: 1 },
        binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 1 }] },
        quote: 'A',
      },
      tree.context,
    );
    expectValid(anchored.document);
    const linked = run(
      anchored.document,
      {
        type: 'branch.create',
        sourceBlockId: tree.a,
        sourceAnchorId: 'anchor-a',
        targetBlockId: tree.a1,
        role: 'reference',
      },
      tree.context,
    );
    const anchoredBranchId = linked.created.branchIds[0];
    if (anchoredBranchId === undefined) throw new Error('anchored reference was not created');
    const oldPrimaryBefore = branchRecord(linked.document, tree.branchA1);
    const anchoredBefore = branchRecord(linked.document, anchoredBranchId);
    const before = structureSnapshot(linked.document);

    const promoted = run(
      linked.document,
      { type: 'branch.makeHome', branchId: anchoredBranchId },
      tree.context,
    );
    expectValid(promoted.document);
    expect(branchRecord(promoted.document, anchoredBranchId)).toMatchObject({
      role: 'primary',
      source: { blockId: tree.a, anchorId: 'anchor-a' },
      targetBlockId: tree.a1,
    });
    expect(branchRecord(promoted.document, tree.branchA1).role).toBe('reference');
    expect(primaryParentBranch(promoted.document, tree.a1)?.source).toEqual({
      blockId: tree.a,
      anchorId: 'anchor-a',
    });
    expect(directChildBranches(promoted.document, tree.a)).toHaveLength(0);

    const undone = success(applyInverse(promoted));
    expect(structureSnapshot(undone.document)).toEqual(before);
    expect(branchRecord(undone.document, anchoredBranchId)).toEqual(anchoredBefore);
    expect(branchRecord(undone.document, tree.branchA1)).toEqual(oldPrimaryBefore);

    const redone = success(applyInverse(undone));
    expect(branchRecord(redone.document, anchoredBranchId).role).toBe('primary');

    // Demote the anchored primary: the target becomes a root and the edge
    // remains an anchored reference.
    const demoted = run(
      redone.document,
      { type: 'branch.demote', branchId: anchoredBranchId },
      tree.context,
    );
    expectValid(demoted.document);
    expect(branchRecord(demoted.document, anchoredBranchId)).toMatchObject({
      role: 'reference',
      source: { blockId: tree.a, anchorId: 'anchor-a' },
      targetBlockId: tree.a1,
    });
    expect(primaryParentBranch(demoted.document, tree.a1)).toBeUndefined();
    expect(topLevel(demoted.document, tree.chapterId)).toEqual([tree.a, tree.a1, tree.b]);

    const demoteUndone = success(applyInverse(demoted));
    expect(branchRecord(demoteUndone.document, anchoredBranchId).role).toBe('primary');
    expect(topLevel(demoteUndone.document, tree.chapterId)).toEqual([tree.a, tree.b]);
  });
});

describe('role transition dedupe and identity guards', () => {
  it('rejects transitions that would keep two edges for the same source-target pair', () => {
    const tree = buildTree();
    const infected = structuredClone(tree.document);
    const oldPrimary = primaryParentBranch(infected, tree.a1);
    if (oldPrimary === undefined) throw new Error('fixture is missing A → A1');
    // Legacy drift allowed by the load validator (A8 is a warning): both roles
    // describe the same A → A1 pair.
    infected.branches['duplicate-reference'] = {
      id: 'duplicate-reference',
      source: { blockId: tree.a },
      targetBlockId: tree.a1,
      role: 'reference',
      order: 'z',
      label: 'legacy duplicate',
    };
    expectValid(infected);

    expectRejected(
      infected,
      { type: 'branch.demote', branchId: oldPrimary.id },
      tree.context,
      'invalid-placement',
    );
    expectRejected(
      infected,
      { type: 'branch.makeHome', branchId: 'duplicate-reference' },
      tree.context,
      'invalid-placement',
    );

    // Move here explicitly promotes the chosen edge and retires the old
    // primary, leaving exactly one primary edge for the pair.
    const moved = run(
      infected,
      { type: 'branch.moveHere', branchId: 'duplicate-reference' },
      tree.context,
    );
    expectValid(moved.document);
    expect(moved.document.branches[oldPrimary.id]).toBeUndefined();
    expect(
      Object.values(moved.document.branches).filter(
        (branch) => branch.targetBlockId === tree.a1,
      ),
    ).toHaveLength(1);
    expect(moved.document.branches['duplicate-reference']?.role).toBe('primary');
  });

  it('preserves branch, block, and chapter identity across undo then redo for moveHere', () => {
    const tree = buildTree();
    const linked = reference(tree.document, tree.context, tree.b, tree.a1);
    const allBefore = structureSnapshot(linked.document);

    const moved = run(
      linked.document,
      { type: 'branch.moveHere', branchId: linked.branchId },
      tree.context,
    );
    const allAfter = structureSnapshot(moved.document);

    const undone = success(applyInverse(moved));
    expect(structureSnapshot(undone.document)).toEqual(allBefore);
    const redone = success(applyInverse(undone));
    expect(structureSnapshot(redone.document)).toEqual(allAfter);

    // Repeating undo/redo does not regenerate any ID.
    const undoneAgain = success(applyInverse(redone));
    expect(structureSnapshot(undoneAgain.document)).toEqual(allBefore);
    expect(undoneAgain.document.branches[tree.branchA1]?.id).toBe(tree.branchA1);
    expect(undoneAgain.document.branches[linked.branchId]?.id).toBe(linked.branchId);
  });
});

