import { describe, expect, it } from 'vitest';
import type { AnchorBinding } from '../src/anchors.js';
import { primaryParentBranch } from '../src/structure.js';
import type { Document, JsonObject } from '../src/types.js';
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
    const { context, document, a, b, anchoredBranchId } = buildFixture();
    const before = document;
    const moved = success(
      run(
        before,
        {
          type: 'block.move',
          blockId: b,
          to: { kind: 'child', parentBlockId: a, atIndex: 0 },
        },
        context,
      ),
    );
    const branch = moved.document.branches[anchoredBranchId];
    expect(branch?.role).toBe('primary');
    expect(branch?.source).toEqual({ blockId: a, anchorId: 'anchor-1' });
    expect(branch?.targetBlockId).toBe(b);
    expect(
      Object.values(moved.document.branches).filter(
        (candidate) => candidate.role === 'reference',
      ),
    ).toHaveLength(0);
    expectValid(moved.document);
    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(before));
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
    const before = referenced.document;
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
