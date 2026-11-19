import { describe, expect, it } from 'vitest';
import {
  blockRect,
  DEFAULT_LAYOUT_OPTIONS,
  layoutDocument,
  overlaps,
  paginate,
  type AnchorRecord,
  type BlockMeasurement,
  type BranchRecord,
  type ContentBlock,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
  type PageSetup,
} from '../src/index.js';

import { anchorViewFor } from './helpers.js';
const PACKING_SETUP: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

interface StubSpec {
  max: number;
  min: number;
  height?: number;
}

interface StubAnchor {
  anchorId: string;
  x: number;
  y?: number;
}

function stubMeasurement(
  specs: Record<string, StubSpec>,
  anchors: Record<string, StubAnchor[]>,
): MeasurementPort {
  const chrome = 2 * (DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder);
  return {
    measure(block: ContentBlock, mode: MeasurementMode): BlockMeasurement {
      const spec = specs[block.id] ?? { max: 100, min: 40 };
      const contentWidth =
        mode.kind === 'max-content'
          ? spec.max
          : mode.kind === 'min-content'
            ? spec.min
            : mode.contentWidth;
      const contentHeight = spec.height ?? 40;
      const contentTop =
        DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder;
      return {
        blockId: block.id,
        mode,
        cardWidth: contentWidth + chrome,
        contentWidth,
        contentHeight,
        contentTop,
        labelHeight: 0,
        cardHeight:
          contentTop +
          contentHeight +
          DEFAULT_LAYOUT_OPTIONS.cardPadding +
          DEFAULT_LAYOUT_OPTIONS.cardBorder,
        maxContentWidth: spec.max,
        minContentWidth: spec.min,
        inlineFormulaWidth: 0,
        segments: [
          {
            index: 0,
            kind: 'paragraph',
            nodePath: [0],
            y: 0,
            height: contentHeight,
            breakableBefore: false,
          },
        ],
        anchors: (anchors[block.id] ?? []).map((anchor) => ({
          anchorId: anchor.anchorId,
          x: anchor.x,
          y: anchor.y ?? 0,
          width: 20,
          height: 10,
          occurrence: 0,
        })),
        tableColumns: {},
        missingAssetIds: [],
      };
    },
  };
}

function makeDocument(
  specs: Record<string, StubSpec>,
  edges: Array<{ from: string; to: string; anchorId?: string }>,
  anchors: Record<string, StubAnchor[]> = {},
): { document: NoteDocument; port: MeasurementPort } {
  const blocks: Record<string, ContentBlock> = {};
  for (const blockId of Object.keys(specs)) {
    blocks[blockId] = {
      id: blockId,
      content: {
        type: 'doc',
        children: [{ type: 'paragraph', children: [{ type: 'text', text: blockId }] }],
      },
    };
  }
  const branchRecords: Record<string, BranchRecord> = {};
  edges.forEach((edge, index) => {
    const id = `e${String(index + 1).padStart(2, '0')}`;
    branchRecords[id] = {
      id,
      source: { blockId: edge.from, ...(edge.anchorId ? { anchorId: edge.anchorId } : {}) },
      targetBlockId: edge.to,
      role: 'primary',
      order: id,
    };
  });
  const anchorRecords: Record<string, AnchorRecord> = {};
  for (const [blockId, list] of Object.entries(anchors)) {
    for (const anchor of list) {
      anchorRecords[anchor.anchorId] = { id: anchor.anchorId, blockId, kind: 'text' };
    }
  }
  const root = Object.keys(specs)[0]!;
  return {
    document: {
      schemaVersion: 2,
      id: 'synthetic-subtree-wrap',
      title: 'Synthetic subtree wrap',
      blocks,
      anchors: anchorRecords,
      branches: branchRecords,
      chapters: [{ id: 'ch1', title: 'Chapter', topLevelBlockIds: [root] }],
      assets: {},
    },
    port: stubMeasurement(specs, anchors),
  };
}

function layout(
  document: NoteDocument,
  port: MeasurementPort,
  pagePacking: 'beside' | 'stacked' = 'beside',
) {
  return layoutDocument(
    document,
    port,
    { ...DEFAULT_LAYOUT_OPTIONS, pagePacking },
    PACKING_SETUP,
      anchorViewFor(document),
  );
}

function assertNoOverlaps(result: ReturnType<typeof layout>): void {
  const blocks = result.blocks.filter((block) => block.width > 0 && block.height > 0);
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i]!;
      const b = blocks[j]!;
      expect(overlaps(blockRect(a), blockRect(b)), `${a.blockId} overlaps ${b.blockId}`).toBe(
        false,
      );
    }
  }
}

const CARD_CHROME = 2 * (DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder);
const GAP = DEFAULT_LAYOUT_OPTIONS.siblingGap;
const INDENT = DEFAULT_LAYOUT_OPTIONS.childIndent;

/**
 * R2j note: the callout cases below keep the non-mode beside oracle
 * (`calloutModes: false`) so the R2i subtree-fit rule stays isolated. The
 * production Page callout modes A/B2/stacked are covered by
 * `page-callout-modes.test.ts`.
 */

describe('page subtree-aware wrap (R2i)', () => {
  it('moves the whole first-child subtree below the parent instead of burning a lower-left column', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        c1: { max: 500, min: 100 },
        g1: { max: 500, min: 100 },
      },
      [
        { from: 'root', to: 'c1' },
        { from: 'c1', to: 'g1' },
      ],
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const c1 = result.blockById['c1']!;
    const g1 = result.blockById['g1']!;

    // The c1 card alone fits beside the root, but its whole subtree does not.
    expect(root.width).toBe(200 + CARD_CHROME);
    expect(c1.width).toBe(420 + CARD_CHROME);
    expect(c1.x).toBe(root.x + INDENT);
    expect(c1.y).toBe(root.y + root.height + GAP);
    expect(c1.placement).toBe('below');
    // At the new origin the grandchild fits beside its parent.
    expect(g1.x).toBe(c1.x + c1.width + GAP);
    expect(g1.y).toBe(c1.y);
    expect(g1.placement).toBe('right');
    assertNoOverlaps(result);
    expect(
      result.blocks.every((block) => block.x + block.width <= result.geometry.contentWidthPx + 0.25),
    ).toBe(true);

    // The pre-R2i per-child oracle keeps c1 right and wraps g1 under it: the
    // exact lower-left placement this rule replaces.
    const oracle = layoutDocument(
      document,
      port,
      { ...DEFAULT_LAYOUT_OPTIONS, pagePacking: 'beside', wrapPolicy: 'right-first-per-child' },
      PACKING_SETUP,
        anchorViewFor(document),
    );
    expect(oracle.blockById['c1']!.x).toBe(root.x + root.width + GAP);
    expect(oracle.blockById['g1']!.x).toBe(root.x + root.width + GAP + 18);
  });

  it('wraps the first child children below it when even the new origin cannot hold them', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        c1: { max: 500, min: 100 },
        g1: { max: 500, min: 100 },
        g2: { max: 500, min: 100 },
      },
      [
        { from: 'root', to: 'c1' },
        { from: 'c1', to: 'g1' },
        { from: 'g1', to: 'g2' },
      ],
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const c1 = result.blockById['c1']!;
    const g1 = result.blockById['g1']!;
    const g2 = result.blockById['g2']!;

    // Level 1: the whole subtree fails at the root right column, so c1 moves
    // below the root at the child indent.
    expect(c1.x).toBe(root.x + INDENT);
    expect(c1.placement).toBe('below');
    // Level 2: c1 + g1 still does not fit at that origin, so g1 indents below
    // c1 instead of claiming a too-narrow right column.
    expect(g1.x).toBe(c1.x + INDENT);
    expect(g1.y).toBe(c1.y + c1.height + GAP);
    expect(g1.placement).toBe('below');
    // Level 3: g2 fits beside g1 at the new origin.
    expect(g2.x).toBe(g1.x + g1.width + GAP);
    expect(g2.y).toBe(g1.y);
    expect(g2.placement).toBe('right');
    assertNoOverlaps(result);
  });

  it('keeps the direct-child group atomic when one subtree fails', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        c1: { max: 500, min: 100 },
        g1: { max: 500, min: 100 },
        c2: { max: 150, min: 80 },
      },
      [
        { from: 'root', to: 'c1' },
        { from: 'root', to: 'c2' },
        { from: 'c1', to: 'g1' },
      ],
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const c1 = result.blockById['c1']!;
    const c2 = result.blockById['c2']!;

    // c2's own card fits beside the root, but one failing subtree moves the
    // whole level column below the parent; siblings never split into a row.
    expect(c1.x).toBe(root.x + INDENT);
    expect(c2.x).toBe(c1.x);
    expect(c1.placement).toBe('below');
    expect(c2.placement).toBe('below');
    expect(c2.y).toBeGreaterThanOrEqual(c1.subtreeBottom + GAP - 0.25);
    assertNoOverlaps(result);

    const oracle = layoutDocument(
      document,
      port,
      { ...DEFAULT_LAYOUT_OPTIONS, pagePacking: 'beside', wrapPolicy: 'right-first-per-child' },
      PACKING_SETUP,
        anchorViewFor(document),
    );
    expect(oracle.blockById['c1']!.x).toBe(root.x + root.width + GAP);
    expect(oracle.blockById['c2']!.x).toBe(root.x + root.width + GAP);
  });

  it('keeps the group right when every subtree fits recursively', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        c1: { max: 300, min: 100 },
        g1: { max: 250, min: 100 },
        c2: { max: 200, min: 100 },
      },
      [
        { from: 'root', to: 'c1' },
        { from: 'root', to: 'c2' },
        { from: 'c1', to: 'g1' },
      ],
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const c1 = result.blockById['c1']!;
    const c2 = result.blockById['c2']!;
    const g1 = result.blockById['g1']!;

    expect(c1.x).toBe(root.x + root.width + GAP);
    expect(c2.x).toBe(c1.x);
    expect(g1.x).toBe(c1.x + c1.width + GAP);
    expect(g1.y).toBe(c1.y);
    expect(c1.placement).toBe('right');
    expect(c2.placement).toBe('right');
    expect(g1.placement).toBe('right');
    assertNoOverlaps(result);
  });

  it('keeps the callout lane while the subtree group stays beside the parent', () => {
    const anchors = { root: [{ anchorId: 'a1', x: 40 }] };
    const { document, port } = makeDocument(
      {
        root: { max: 300, min: 160 },
        callout: { max: 120, min: 60 },
        c1: { max: 300, min: 100 },
        g1: { max: 250, min: 100 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'c1' },
        { from: 'c1', to: 'g1' },
      ],
      anchors,
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const callout = result.blockById['callout']!;
    const c1 = result.blockById['c1']!;
    const g1 = result.blockById['g1']!;

    // The callout lane ends at the parent's right edge; the direct-child group
    // starts one sibling gap later and the full subtree fits it.
    expect(c1.x).toBe(root.x + root.width + GAP);
    expect(g1.x).toBe(c1.x + c1.width + GAP);
    expect(callout.x + callout.width).toBeLessThanOrEqual(root.x + root.width + 0.001);
    expect(callout.y).toBe(root.y + root.height + DEFAULT_LAYOUT_OPTIONS.calloutGap);
    expect(c1.y).toBe(root.y);
    assertNoOverlaps(result);
  });

  it('keeps the current stacked callout order when the group wraps', () => {
    const anchors = { root: [{ anchorId: 'a1', x: 40 }] };
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 160 },
        callout: { max: 120, min: 60 },
        c1: { max: 500, min: 100 },
        g1: { max: 500, min: 100 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'c1' },
        { from: 'c1', to: 'g1' },
      ],
      anchors,
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const callout = result.blockById['callout']!;
    const c1 = result.blockById['c1']!;
    const g1 = result.blockById['g1']!;

    // A wrapped direct-child group keeps the stacked callout order: callouts
    // first below the parent, then the atomic child group.
    expect(callout.y).toBe(root.y + root.height + DEFAULT_LAYOUT_OPTIONS.calloutGap);
    expect(c1.y).toBeGreaterThanOrEqual(callout.subtreeBottom + GAP - 0.25);
    expect(c1.x).toBe(root.x + INDENT);
    expect(g1.x).toBe(c1.x + c1.width + GAP);
    expect(g1.y).toBe(c1.y);
    assertNoOverlaps(result);
  });

  it('feeds the new placement into pagination fragments', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        c1: { max: 500, min: 100 },
        g1: { max: 500, min: 100 },
      },
      [
        { from: 'root', to: 'c1' },
        { from: 'c1', to: 'g1' },
      ],
    );
    const result = layout(document, port);
    const pages = paginate(result, document);
    expect(pages.pageCount).toBe(1);
    const fragment = (blockId: string) =>
      pages.pages[0]!.fragments.find((candidate) => candidate.blockId === blockId)!;
    for (const blockId of ['root', 'c1', 'g1']) {
      expect(fragment(blockId).source.x).toBe(result.blockById[blockId]!.x);
      expect(fragment(blockId).page.x).toBe(result.blockById[blockId]!.x);
    }
    expect(fragment('c1').role).toBe('child');
    expect(fragment('c1').depth).toBe(1);
    expect(fragment('g1').depth).toBe(2);
  });
});
