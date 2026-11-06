import { describe, expect, it } from 'vitest';
import { applyInverse } from '../src/commands.js';
import { directChildIds, primaryParentBranch, subtreeBlockIds } from '../src/structure.js';
import type { Document } from '../src/types.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
  outlineOrder,
  run,
  tryRun,
} from './helpers.js';
import {
  expectCommandSuccess as success,
  expectDocumentValid as expectValid,
} from './command-invariants.js';

function buildTree() {
  const context = deterministicContext();
  let document = newDocument(context);
  const topA = addTopLevel(document, 'Alpha eigenvalue beta', context);
  document = topA.document;
  const topB = addTopLevel(document, 'B', context);
  document = topB.document;
  const topC = addTopLevel(document, 'C', context);
  document = topC.document;
  const childA1 = addChild(document, topA.blockId, 'A1', context);
  document = childA1.document;
  return {
    context,
    document,
    chapterId: document.chapters[0]?.id ?? '',
    a: topA.blockId,
    b: topB.blockId,
    c: topC.blockId,
    a1: childA1.blockId,
    branchA1: childA1.branchId,
  };
}

function primarySnapshot(document: Document): unknown {
  return {
    chapters: structuredClone(document.chapters),
    blocks: structuredClone(document.blocks),
    primary: Object.values(document.branches)
      .filter((branch) => branch.role === 'primary')
      .map((branch) => structuredClone(branch))
      .sort((left, right) => (left.id < right.id ? -1 : 1)),
  };
}

function referenceCommand(sourceBlockId: string, targetBlockId: string, role: 'primary' | 'reference' = 'reference') {
  return {
    type: 'branch.create' as const,
    sourceBlockId,
    targetBlockId,
    role,
  };
}

describe('reference edges', () => {
  it('creates a non-structural edge without touching chapters, blocks, or primary order', () => {
    const { document, context, a, c } = buildTree();
    const before = primarySnapshot(document);
    const beforeOutline = outlineOrder(document);
    const result = run(
      document,
      { ...referenceCommand(a, c), atIndex: 0, label: 'also uses' },
      context,
    );
    const branchId = result.created.branchIds[0];
    expect(typeof branchId).toBe('string');
    const branch = result.document.branches[branchId ?? ''];
    expect(branch).toMatchObject({
      source: { blockId: a },
      targetBlockId: c,
      role: 'reference',
      label: 'also uses',
    });
    expect(branch?.order).toBeTruthy();
    expect(primarySnapshot(result.document)).toEqual(before);
    expect(outlineOrder(result.document)).toEqual(beforeOutline);
    expect(directChildIds(result.document, a)).not.toContain(c);
    expect(primaryParentBranch(result.document, c)).toBeUndefined();
    expect(result.document.chapters[0]?.topLevelBlockIds).toContain(c);
    expectValid(result.document);
  });

  it('reuses an exact source-target edge regardless of role and never creates a second home', () => {
    const { document, context, a, a1, c } = buildTree();
    const edgeCount = Object.keys(document.branches).length;

    // The existing A -> A1 edge is primary; a reference request must reuse it.
    const reusePrimary = run(
      document,
      referenceCommand(a, a1),
      context,
    );
    expect(reusePrimary.created.branchIds).toEqual([]);
    expect(reusePrimary.inverse).toBeNull();
    expect(reusePrimary.warnings.join(' ')).toContain('reused');
    expect(Object.keys(reusePrimary.document.branches)).toHaveLength(edgeCount);

    // A reference A -> C exists; a primary request for the same pair focuses
    // the existing reference instead of silently creating a second edge.
    const reference = run(document, referenceCommand(a, c), context);
    const referenceId = reference.created.branchIds[0];
    const duplicate = run(reference.document, referenceCommand(a, c, 'primary'), context);
    expect(duplicate.created.branchIds).toEqual([]);
    expect(Object.keys(duplicate.document.branches)).toHaveLength(edgeCount + 1);
    expect(duplicate.document.branches[referenceId ?? '']?.role).toBe('reference');
    expect(duplicate.document.chapters[0]?.topLevelBlockIds).toContain(c);
    expectValid(duplicate.document);
  });

  it('allows reference cycles while the primary forest stays acyclic', () => {
    const { document, context, a, b, a1 } = buildTree();
    const outline = outlineOrder(document);
    const aToB = run(document, referenceCommand(a, b), context);
    const bToA = run(aToB.document, referenceCommand(b, a), context);
    expect(bToA.document.branches[aToB.created.branchIds[0] ?? '']?.role).toBe('reference');
    expect(bToA.document.branches[bToA.created.branchIds[0] ?? '']?.role).toBe('reference');
    expect(outlineOrder(bToA.document)).toEqual(outline);
    expectValid(bToA.document);

    // A child may also point back at its ancestor as a reference.
    const a1ToA = run(bToA.document, referenceCommand(a1, a), context);
    expect(a1ToA.document.branches[a1ToA.created.branchIds[0] ?? '']?.role).toBe('reference');
    expectValid(a1ToA.document);

    // Removing one edge of the cycle keeps the other edge and both blocks.
    const deleted = run(
      a1ToA.document,
      { type: 'branch.delete', branchId: aToB.created.branchIds[0] ?? '' },
      context,
    );
    expect(deleted.document.blocks[a]).toBeDefined();
    expect(deleted.document.blocks[b]).toBeDefined();
    expect(deleted.document.branches[aToB.created.branchIds[0] ?? '']).toBeUndefined();
    expect(deleted.document.branches[bToA.created.branchIds[0] ?? '']).toBeDefined();
    expectValid(deleted.document);
  });

  it('deleting a reference removes only the edge, keeps the target, and restores the same identity on undo', () => {
    const { document, context, a, c } = buildTree();
    const created = run(document, referenceCommand(a, c), context);
    const branchId = created.created.branchIds[0] ?? '';
    const targetBefore = structuredClone(created.document.blocks[c]);
    const chapterBefore = structuredClone(created.document.chapters[0]?.topLevelBlockIds);
    const branchBefore = structuredClone(created.document.branches[branchId]);

    const deleted = run(
      created.document,
      { type: 'branch.delete', branchId },
      context,
    );
    expect(deleted.document.branches[branchId]).toBeUndefined();
    expect(deleted.document.blocks[c]).toEqual(targetBefore);
    expect(deleted.document.chapters[0]?.topLevelBlockIds).toEqual(chapterBefore);
    expect(subtreeBlockIds(deleted.document, c)).toEqual([c]);

    const undone = success(applyInverse(deleted));
    expect(undone.document.branches[branchId]).toEqual(branchBefore);
    expect(undone.document.blocks[c]).toEqual(targetBefore);
    expectValid(undone.document);

    const redone = success(applyInverse(undone));
    expect(redone.document.branches[branchId]).toBeUndefined();
    expect(redone.document.blocks[c]).toEqual(targetBefore);
  });

  it('undoes a reference creation and redoes it with the same branch ID and order key', () => {
    const { document, context, a, c } = buildTree();
    const created = run(document, referenceCommand(a, c), context);
    const branchId = created.created.branchIds[0] ?? '';
    const branch = structuredClone(created.document.branches[branchId]);

    const undone = success(applyInverse(created));
    expect(undone.document.branches[branchId]).toBeUndefined();
    expect(primarySnapshot(undone.document)).toEqual(primarySnapshot(document));

    const redone = success(applyInverse(undone));
    expect(redone.document.branches[branchId]).toEqual(branch);
    expectValid(redone.document);
  });

  it('anchored references keep the anchor, never create a callout, and allow per-anchor targets', () => {
    const { document, context, a, c, a1 } = buildTree();
    const anchored = run(
      document,
      {
        type: 'anchor.create',
        anchorId: 'anchor-reference',
        blockId: a,
        kind: 'text',
        selector: { kind: 'text', quote: 'eigenvalue', prefix: 'Alpha ', suffix: ' beta', occurrenceHint: 1 },
        binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 16 }] },
        quote: 'eigenvalue',
      },
      context,
    );
    expect(anchored.document.anchors['anchor-reference']).toBeDefined();
    expect(directChildIds(anchored.document, a)).toEqual([a1]);

    const created = run(
      anchored.document,
      {
        ...referenceCommand(a, a1),
        sourceAnchorId: 'anchor-reference',
      },
      context,
    );
    const branchId = created.created.branchIds[0] ?? '';
    expect(created.document.branches[branchId]?.source).toEqual({
      blockId: a,
      anchorId: 'anchor-reference',
    });
    expect(created.document.branches[branchId]?.role).toBe('reference');
    expect(directChildIds(created.document, a)).toEqual([a1]);
    expect(created.document.anchors['anchor-reference']).toBeDefined();
    expectValid(created.document);

    // Deleting the reference leaves the now-idle anchor record intact (OD-2).
    const deleted = run(created.document, { type: 'branch.delete', branchId }, context);
    expect(deleted.document.anchors['anchor-reference']).toBeDefined();
    expectValid(deleted.document);

    // A different anchor in the same block is a different source port and may
    // target the same block.
    const second = run(
      anchored.document,
      {
        type: 'anchor.create',
        anchorId: 'anchor-two',
        blockId: a,
        kind: 'text',
        selector: { kind: 'text', quote: 'Alpha', suffix: ' eigenvalue beta', occurrenceHint: 1 },
        binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 5 }] },
        quote: 'Alpha',
      },
      context,
    );
    const first = run(
      second.document,
      { ...referenceCommand(a, a1), sourceAnchorId: 'anchor-reference' },
      context,
    );
    const both = run(
      first.document,
      { ...referenceCommand(a, a1), sourceAnchorId: 'anchor-two' },
      context,
    );
    const toA1 = Object.values(both.document.branches).filter(
      (branch) => branch.role === 'reference' && branch.targetBlockId === a1,
    );
    expect(toA1).toHaveLength(2);
    expect(new Set(toA1.map((branch) => branch.source.anchorId))).toEqual(
      new Set(['anchor-reference', 'anchor-two']),
    );
    expectValid(both.document);
  });

  it('rejects a self reference and never mutates the document', () => {
    const { document, context, a } = buildTree();
    const before = structuredClone(document);
    const rejected = tryRun(document, referenceCommand(a, a), context);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe('cycle');
    expect(document).toEqual(before);
  });
});
