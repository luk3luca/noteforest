import { describe, expect, it } from 'vitest';
import type { AnchorBinding } from '../src/anchors.js';
import { primaryParentBranch } from '../src/structure.js';
import type { Document, JsonObject } from '../src/types.js';
import { validateDocument } from '../src/validation.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
  run,
  tryRun,
} from './helpers.js';
import {
  expectCommandSuccess as success,
  expectDocumentValid as expectValid,
  normalizedDocument as stable,
  undoOf,
} from './command-invariants.js';

function textSelector(quote: string): JsonObject {
  return { kind: 'text', quote, prefix: 'Alpha ', suffix: ' beta', occurrenceHint: 1 };
}

function textBinding(start: number, end: number): AnchorBinding {
  return { kind: 'text', ranges: [{ nodePath: [0, 0], start, end }] };
}

/** Target block IDs of one `(block, anchor)` primary port, in branch order. */
function anchorPortOrder(document: Document, blockId: string, anchorId: string): string[] {
  return Object.values(document.branches)
    .filter(
      (branch) =>
        branch.role === 'primary' &&
        branch.source.blockId === blockId &&
        branch.source.anchorId === anchorId,
    )
    .sort((left, right) => {
      if (left.order !== right.order) return left.order < right.order ? -1 : 1;
      return left.id < right.id ? -1 : 1;
    })
    .map((branch) => branch.targetBlockId);
}

/** Every `duplicate-branch-order` validation warning (one order per port+role). */
function duplicateOrderWarnings(document: Document): string[] {
  return validateDocument(document)
    .warnings.filter((issue) => issue.code === 'duplicate-branch-order')
    .map((issue) => issue.message);
}

function branchOrderFor(document: Document, targetBlockId: string): string | undefined {
  return Object.values(document.branches).find(
    (branch) => branch.role === 'primary' && branch.targetBlockId === targetBlockId,
  )?.order;
}

function buildFixture(): {
  context: ReturnType<typeof deterministicContext>;
  document: Document;
  a: string;
  b: string;
  c: string;
  a1: string;
  anchoredBranchId: string;
} {
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

  const anchor = run(
    document,
    {
      type: 'anchor.create',
      anchorId: 'anchor-1',
      blockId: topA.blockId,
      kind: 'text',
      selector: textSelector('eigenvalue'),
      binding: textBinding(6, 16),
      quote: 'eigenvalue',
    },
    context,
  );
  // B is top-level before the branch: the anchored primary branch takes it out
  // of the chapter slot, which is how an anchored child is created.
  const anchored = run(
    anchor.document,
    {
      type: 'branch.create',
      sourceBlockId: topA.blockId,
      sourceAnchorId: 'anchor-1',
      targetBlockId: topB.blockId,
      role: 'primary',
    },
    context,
  );
  if (anchored.created.branchIds[0] === undefined) {
    throw new Error('fixture anchored branch was not created');
  }
  return {
    context,
    document: anchored.document,
    a: topA.blockId,
    b: topB.blockId,
    c: topC.blockId,
    a1: childA1.blockId,
    anchoredBranchId: anchored.created.branchIds[0],
  };
}

describe('block.move anchored incoming edge', () => {
  it('keeps the anchored primary edge and its anchor on a same-parent reorder', () => {
    const { context, document, a, b, c, anchoredBranchId } = buildFixture();
    // A second callout on the same anchor makes the append a real reorder.
    const second = run(
      document,
      {
        type: 'branch.create',
        sourceBlockId: a,
        sourceAnchorId: 'anchor-1',
        targetBlockId: c,
        role: 'primary',
      },
      context,
    );
    const before = second.document;
    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: b,
          to: { kind: 'child', parentBlockId: a },
        },
        context,
      ),
    );
    const branch = moved.document.branches[anchoredBranchId];
    expect(branch?.role).toBe('primary');
    expect(branch?.source).toEqual({ blockId: a, anchorId: 'anchor-1' });
    expect(branch?.targetBlockId).toBe(b);
    // A `child` placement on the same parent appends inside the anchor port.
    expect(anchorPortOrder(moved.document, a, 'anchor-1')).toEqual([c, b]);
    expect(
      Object.values(moved.document.branches).filter(
        (candidate) => candidate.role === 'reference',
      ),
    ).toHaveLength(0);
    expectValid(moved.document);
    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(before));
  });

  it('reorders two same-anchor primaries inside their anchor port (F1)', () => {
    const { context, document, a, a1, b, c, anchoredBranchId } = buildFixture();
    // A second primary branch from the same anchor: two callouts in one port,
    // orders `m` and `t` (the review's reproduction).
    const second = run(
      document,
      {
        type: 'branch.create',
        sourceBlockId: a,
        sourceAnchorId: 'anchor-1',
        targetBlockId: c,
        role: 'primary',
      },
      context,
    );
    const secondBranchId = second.created.branchIds[0] ?? '';
    const before = second.document;
    expect(anchorPortOrder(before, a, 'anchor-1')).toEqual([b, c]);
    expect(before.branches[anchoredBranchId]?.order).toBe('m');
    expect(before.branches[secondBranchId]?.order).toBe('t');
    const directChildOrder = branchOrderFor(before, a1);
    expect(directChildOrder).toBeDefined();

    // Move up on the second callout: the key is computed inside the anchor
    // port, not against the parent's direct children.
    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: c,
          to: { kind: 'sibling', siblingBlockId: b, after: false },
        },
        context,
      ),
    );
    expect(anchorPortOrder(moved.document, a, 'anchor-1')).toEqual([c, b]);
    expect(moved.document.branches[secondBranchId]?.role).toBe('primary');
    expect(moved.document.branches[secondBranchId]?.source).toEqual({
      blockId: a,
      anchorId: 'anchor-1',
    });
    expect(moved.document.branches[anchoredBranchId]?.source).toEqual({
      blockId: a,
      anchorId: 'anchor-1',
    });
    const movedOrders = [
      moved.document.branches[secondBranchId]?.order,
      moved.document.branches[anchoredBranchId]?.order,
    ];
    expect(movedOrders[0]).not.toBe(movedOrders[1]);
    expect((movedOrders[0] ?? '') < (movedOrders[1] ?? '')).toBe(true);
    // Unique order per port and role: no validation warning.
    expect(duplicateOrderWarnings(moved.document)).toEqual([]);
    // The block's home, its anchor record, and the sibling direct child's own
    // order are untouched.
    expect(moved.document.anchors).toEqual(before.anchors);
    expect(branchOrderFor(moved.document, a1)).toBe(directChildOrder);
    expectValid(moved.document);

    // Move down puts it back in the same port.
    const back = success(
      run(
        moved.document,
        {
          type: 'block.move',
          blockId: c,
          to: { kind: 'sibling', siblingBlockId: b, after: true },
        },
        context,
      ),
    );
    expect(anchorPortOrder(back.document, a, 'anchor-1')).toEqual([b, c]);
    expect(duplicateOrderWarnings(back.document)).toEqual([]);

    // One undo restores the exact pre-move document.
    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.anchors['anchor-1']).toEqual(before.anchors['anchor-1']);
  });

  it('rejects a sibling move across ports instead of writing a foreign order (F1)', () => {
    const { context, document, a, b, a1 } = buildFixture();
    const before = document;
    // b is anchored at anchor-1; a1 is a direct child of the same parent. They
    // share the parent block but not the port.
    const rejected = tryRun(
      before,
      {
        type: 'block.move',
        blockId: b,
        to: { kind: 'sibling', siblingBlockId: a1, after: false },
      },
      context,
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe('invalid-placement');
    // A rejected command changes nothing: the anchored edge keeps its key and
    // the direct child keeps its own.
    expect(stable(before)).toEqual(stable(document));
    expect(anchorPortOrder(before, a, 'anchor-1')).toEqual([b]);

    // The reverse direction (a direct child reordering against the anchored
    // sibling) is rejected by the same rule.
    const reverse = tryRun(
      before,
      {
        type: 'block.move',
        blockId: a1,
        to: { kind: 'sibling', siblingBlockId: b, after: true },
      },
      context,
    );
    expect(reverse.ok).toBe(false);
    if (!reverse.ok) expect(reverse.code).toBe('invalid-placement');
    expect(anchorPortOrder(before, a, 'anchor-1')).toEqual([b]);
  });

  it('re-keys a converted citation into the reference port (F2)', () => {
    const { context, document, a, b, c, anchoredBranchId } = buildFixture();
    // The same anchor already cites c as a reference. Its key is `m`, the same
    // as the primary edge's key, which is legal: order is per port and role.
    const referenced = run(
      document,
      {
        type: 'branch.create',
        sourceBlockId: a,
        sourceAnchorId: 'anchor-1',
        targetBlockId: c,
        role: 'reference',
      },
      context,
    );
    const referenceId = referenced.created.branchIds[0] ?? '';
    const before = referenced.document;
    expect(before.branches[anchoredBranchId]?.order).toBe('m');
    expect(before.branches[referenceId]?.order).toBe('m');
    expect(duplicateOrderWarnings(before)).toEqual([]);

    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: b,
          to: { kind: 'top-level', chapterId: before.chapters[0]?.id ?? '', atIndex: 0 },
        },
        context,
      ),
    );
    const cited = moved.document.branches[anchoredBranchId];
    expect(cited?.role).toBe('reference');
    expect(cited?.source).toEqual({ blockId: a, anchorId: 'anchor-1' });
    expect(cited?.targetBlockId).toBe(b);
    // Appended after the existing reference: no duplicate reference key.
    const citedOrder = cited?.order ?? '';
    const existingOrder = moved.document.branches[referenceId]?.order ?? '';
    expect(citedOrder).not.toBe(existingOrder);
    expect(citedOrder > existingOrder).toBe(true);
    expect(duplicateOrderWarnings(moved.document)).toEqual([]);
    expect(moved.document.anchors['anchor-1']).toEqual(before.anchors['anchor-1']);
    expectValid(moved.document);

    // One undo restores the primary role and its original key exactly.
    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.branches[anchoredBranchId]).toEqual(
      before.branches[anchoredBranchId],
    );
  });

  it('turns the old anchored primary edge into a reference on reparent', () => {
    const { context, document, a, b, c, anchoredBranchId } = buildFixture();
    const before = document;
    const moved = success(
      run(
        before,
        { type: 'block.move', blockId: b, to: { kind: 'child', parentBlockId: c } },
        context,
      ),
    );
    const cited = moved.document.branches[anchoredBranchId];
    expect(cited?.role).toBe('reference');
    expect(cited?.source).toEqual({ blockId: a, anchorId: 'anchor-1' });
    expect(cited?.targetBlockId).toBe(b);
    const incoming = primaryParentBranch(moved.document, b);
    expect(incoming?.source).toEqual({ blockId: c });
    expect(incoming?.id).not.toBe(anchoredBranchId);
    expect(moved.document.anchors['anchor-1']).toBeDefined();
    // The converted citation is re-keyed into the empty reference port, so no
    // order key is duplicated there (F2).
    expect(duplicateOrderWarnings(moved.document)).toEqual([]);
    expectValid(moved.document);
    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.branches[anchoredBranchId]).toEqual(
      before.branches[anchoredBranchId],
    );
  });

  it('converts the anchored edge when a sibling placement leaves the parent', () => {
    const { context, document, a, b, anchoredBranchId } = buildFixture();
    const before = document;
    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: b,
          to: { kind: 'sibling', siblingBlockId: a, after: true },
        },
        context,
      ),
    );
    expect(moved.document.branches[anchoredBranchId]?.role).toBe('reference');
    expect(primaryParentBranch(moved.document, b)).toBeUndefined();
    expect(moved.document.chapters[0]?.topLevelBlockIds).toContain(b);
    expectValid(moved.document);
    expect(stable(undoOf(moved).document)).toEqual(stable(before));
  });

  it('leaves unrelated reference edges untouched', () => {
    const { context, document, a, b, c, anchoredBranchId } = buildFixture();
    const referenced = run(
      document,
      {
        type: 'branch.create',
        sourceBlockId: c,
        targetBlockId: b,
        role: 'reference',
      },
      context,
    );
    const referenceId = referenced.created.branchIds[0] ?? '';
    expect(referenceId.length).toBeGreaterThan(0);
    // A second callout on the same anchor keeps the append a real reorder, so
    // the move has an inverse and the reference record can be compared.
    const added = addTopLevel(referenced.document, 'D', context);
    const secondCallout = run(
      added.document,
      {
        type: 'branch.create',
        sourceBlockId: a,
        sourceAnchorId: 'anchor-1',
        targetBlockId: added.blockId,
        role: 'primary',
      },
      context,
    );
    const before = secondCallout.document;
    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: b,
          to: { kind: 'child', parentBlockId: a },
        },
        context,
      ),
    );
    expect(anchorPortOrder(moved.document, a, 'anchor-1')).toEqual([added.blockId, b]);
    expect(moved.document.branches[referenceId]).toEqual(before.branches[referenceId]);
    expect(moved.document.branches[anchoredBranchId]?.role).toBe('primary');
    expectValid(moved.document);
  });

  it('rejects a reparent that would create a primary cycle and mutates nothing', () => {
    const { context, document, b, anchoredBranchId } = buildFixture();
    const descendant = addChild(document, b, 'B1', context);
    const before = descendant.document;
    const snapshot = stable(before);
    const rejected = tryRun(
      before,
      {
        type: 'block.move',
        blockId: b,
        to: { kind: 'child', parentBlockId: descendant.blockId },
      },
      context,
    );
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe('cycle');
    expect(stable(before)).toEqual(snapshot);
    expect(before.branches[anchoredBranchId]?.role).toBe('primary');
  });

  it('does not detach the anchored edge when the placement is invalid', () => {
    const { context, document, a, b, anchoredBranchId } = buildFixture();
    const rejected = tryRun(
      document,
      {
        type: 'block.move',
        blockId: b,
        to: { kind: 'child', parentBlockId: a, atIndex: 5 },
      },
      context,
    );
    expect(rejected.ok).toBe(false);
    const branch = document.branches[anchoredBranchId];
    expect(branch?.role).toBe('primary');
    expect(branch?.source).toEqual({ blockId: a, anchorId: 'anchor-1' });
    expectValid(document);
  });
});
