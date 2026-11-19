import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  blockRect,
  clearGap,
  createEstimatedMeasurement,
  DEFAULT_LAYOUT_OPTIONS,
  layoutDocument,
  overlaps,
  type AnchorRecord,
  type BlockMeasurement,
  type BranchRecord,
  type ContentBlock,
  type ContentNode,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
  type WrapPolicy,
} from '../src/index.js';
import { anchorViewFor, FIXTURES, FIXTURE_PAGE_SETUP} from './helpers.js';

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
  return {
    measure(block: ContentBlock, mode: MeasurementMode): BlockMeasurement {
      const spec = specs[block.id] ?? { max: 100, min: 40 };
      const contentWidth =
        mode.kind === 'max-content'
          ? spec.max
          : mode.kind === 'min-content'
            ? spec.min
            : mode.contentWidth;
      const chrome = 2 * (DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder);
      const contentHeight = spec.height ?? 40;
      const contentTop = DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder;
      return {
        blockId: block.id,
        mode,
        cardWidth: contentWidth + chrome,
        contentWidth,
        contentHeight,
        contentTop,
        labelHeight: 0,
        cardHeight: contentTop + contentHeight + DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder,
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
    // A synthetic anchor must resolve in core: each id is one unique, marked
    // text run. The stub measurement supplies the geometry.
    const children: ContentNode[] = [{ type: 'text', text: blockId }];
    for (const anchor of anchors[blockId] ?? []) {
      children.push({
        type: 'text',
        text: ` ${anchor.anchorId} `,
        marks: [{ type: 'anchor', attrs: { anchorIds: [anchor.anchorId] } }],
      });
    }
    blocks[blockId] = {
      id: blockId,
      content: { type: 'doc', children: [{ type: 'paragraph', children }] },
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
      anchorRecords[anchor.anchorId] = {
        id: anchor.anchorId,
        blockId,
        kind: 'text',
        selector: { kind: 'text', quote: anchor.anchorId },
        quote: anchor.anchorId,
      };
    }
  }
  const root = Object.keys(specs)[0]!;
  return {
    document: {
      schemaVersion: 2,
      id: 'synthetic-layout',
      title: 'Synthetic layout',
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
  wrapPolicy: WrapPolicy,
  maxWrapIndent = DEFAULT_LAYOUT_OPTIONS.maxWrapIndent,
) {
  return layoutDocument(document, port, { wrapPolicy, maxWrapIndent }, FIXTURE_PAGE_SETUP, anchorViewFor(document));
}

describe('group-level left-origin wrap', () => {
  it('defaults to the production group policy with a three-step cap', () => {
    expect(DEFAULT_LAYOUT_OPTIONS.wrapPolicy).toBe('group-left-origin');
    expect(DEFAULT_LAYOUT_OPTIONS.wrapIndent).toBe(18);
    expect(DEFAULT_LAYOUT_OPTIONS.maxWrapIndent).toBe(3 * DEFAULT_LAYOUT_OPTIONS.wrapIndent);
  });

  it('keeps the whole direct-child group right when every own card fits', () => {
    // Root card = 226 px; right content band = 366.5 px. Both children fit.
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        a: { max: 160, min: 100 },
        b: { max: 180, min: 100 },
      },
      [
        { from: 'root', to: 'a' },
        { from: 'root', to: 'b' },
      ],
    );
    const result = layout(document, port, 'group-left-origin');
    const rightX = result.blockById['root']!.x + result.blockById['root']!.width + 24;
    expect(result.blockById['a']!.x).toBe(rightX);
    expect(result.blockById['b']!.x).toBe(rightX);
    expect(result.blockById['a']!.y).toBe(0);
    expect(result.blockById['b']!.y).toBe(result.blockById['a']!.subtreeBottom + 24);
  });

  it('moves every direct child below when one child does not fit', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        a: { max: 160, min: 100 },
        b: { max: 500, min: 100 },
      },
      [
        { from: 'root', to: 'a' },
        { from: 'root', to: 'b' },
      ],
    );
    const root = layout(document, port, 'group-left-origin').blockById['root']!;
    const wrapOrigin = Math.min(root.x + 26, 54);
    const result = layout(document, port, 'group-left-origin');
    const a = result.blockById['a']!;
    const b = result.blockById['b']!;
    expect(a.x).toBe(wrapOrigin);
    expect(b.x).toBe(wrapOrigin);
    expect(a.y).toBe(root.y + root.height + 24);
    expect(b.y).toBe(a.subtreeBottom + 24);
    expect(overlaps(blockRect(a), blockRect(b))).toBe(false);

    // The old per-child policy is the regression oracle: the fitting sibling
    // stays right and only the non-fitting one wraps.
    const oracle = layout(document, port, 'right-first-per-child');
    expect(oracle.blockById['a']!.x).toBe(root.x + root.width + 24);
    expect(oracle.blockById['a']!.y).toBe(0);
    expect(oracle.blockById['b']!.x).toBe(root.x + 18);
    expect(oracle.blockById['b']!.y).toBe(root.y + root.height + 24);

    // The lab-only subtree-aware policy rescues the fitting sibling.
    const subtreeAware = layout(document, port, 'subtree-aware');
    expect(subtreeAware.blockById['a']!.x).toBe(root.x + root.width + 24);
    expect(subtreeAware.blockById['b']!.x).toBe(wrapOrigin);
  });

  it('wraps recursively and indents from each parent', () => {
    const chain = {
      root: { max: 200, min: 100 },
      a: { max: 500, min: 100 },
      b: { max: 500, min: 100 },
      c: { max: 500, min: 100 },
      d: { max: 500, min: 100 },
    };
    const { document, port } = makeDocument(chain, [
      { from: 'root', to: 'a' },
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
    ]);
    const result = layout(document, port, 'group-left-origin');
    expect(result.blockById['a']!.x).toBe(26);
    expect(result.blockById['b']!.x).toBe(52);
    expect(result.blockById['c']!.x).toBe(78);
    // Each wrapped group indents from its own parent; the old global page-left
    // cap no longer applies (product-owner tree rule, 8 November 2026).
    expect(result.blockById['d']!.x).toBe(104);

    // The child corridor is a hard floor: a stored wrap cap below it cannot
    // pull a wrapped group inside the 12 + 14 px artery.
    const capped = layout(document, port, 'group-left-origin', 12);
    expect(capped.blockById['a']!.x).toBe(DEFAULT_LAYOUT_OPTIONS.childIndent);
    expect(capped.blockById['b']!.x).toBe(2 * DEFAULT_LAYOUT_OPTIONS.childIndent);
    expect(capped.blockById['c']!.x).toBe(3 * DEFAULT_LAYOUT_OPTIONS.childIndent);
    expect(capped.blockById['d']!.x).toBe(4 * DEFAULT_LAYOUT_OPTIONS.childIndent);
  });

  it('wraps a child group below a taller ancestor card instead of overlapping it', () => {
    const { document, port } = makeDocument(
      {
        tall: { max: 200, min: 100, height: 1000 },
        rightChild: { max: 160, min: 100 },
        grandChild: { max: 500, min: 100 },
      },
      [
        { from: 'tall', to: 'rightChild' },
        { from: 'rightChild', to: 'grandChild' },
      ],
    );
    const result = layout(document, port, 'group-left-origin');
    const tall = result.blockById['tall']!;
    const rightChild = result.blockById['rightChild']!;
    const grandChild = result.blockById['grandChild']!;
    // R2i: the full rightChild subtree does not fit beside the tall ancestor,
    // so the whole direct-child group wraps below it at the child indent.
    expect(rightChild.x).toBe(tall.x + DEFAULT_LAYOUT_OPTIONS.childIndent);
    expect(rightChild.y).toBe(tall.y + tall.height + DEFAULT_LAYOUT_OPTIONS.siblingGap);
    // From the new origin the grandchild still does not fit beside its parent,
    // so it wraps one more level and never overlaps the taller ancestor.
    expect(grandChild.x).toBe(rightChild.x + DEFAULT_LAYOUT_OPTIONS.childIndent);
    expect(grandChild.y).toBe(
      rightChild.y + rightChild.height + DEFAULT_LAYOUT_OPTIONS.siblingGap,
    );
    expect(overlaps(blockRect(tall), blockRect(rightChild))).toBe(false);
    expect(overlaps(blockRect(tall), blockRect(grandChild))).toBe(false);
    expect(overlaps(blockRect(rightChild), blockRect(grandChild))).toBe(false);

    // The lab per-child policy keeps the old own-card behavior for comparison.
    const subtreeAware = layout(document, port, 'subtree-aware');
    expect(subtreeAware.blockById['rightChild']!.x).toBe(
      tall.x + tall.width + DEFAULT_LAYOUT_OPTIONS.siblingGap,
    );
    expect(overlaps(blockRect(tall), blockRect(subtreeAware.blockById['grandChild']!))).toBe(false);
  });

  it('keeps anchored callouts above the wrapped direct-child group in anchor order', () => {
    const anchors = {
      root: [
        { anchorId: 'a1', x: 60 },
        { anchorId: 'a2', x: 20 },
      ],
    };
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        calloutTwo: { max: 120, min: 60 },
        calloutOne: { max: 120, min: 60 },
        child: { max: 500, min: 100 },
      },
      [
        { from: 'root', to: 'child' },
        { from: 'root', to: 'calloutOne', anchorId: 'a1' },
        { from: 'root', to: 'calloutTwo', anchorId: 'a2' },
      ],
      anchors,
    );
    const result = layout(document, port, 'group-left-origin');
    const calloutOne = result.blockById['calloutOne']!;
    const calloutTwo = result.blockById['calloutTwo']!;
    const child = result.blockById['child']!;
    const root = result.blockById['root']!;
    expect(calloutTwo.y).toBeLessThan(calloutOne.y);
    expect(child.x).toBe(26);
    expect(child.y).toBeGreaterThan(calloutOne.subtreeBottom);
    const laneX = root.x + DEFAULT_LAYOUT_OPTIONS.calloutCardIndent;
    expect(calloutOne.x).toBe(
      Math.max(result.anchors.find((a) => a.anchorId === 'a1')!.rect!.x, laneX),
    );
    expect(calloutTwo.x).toBe(
      Math.max(result.anchors.find((a) => a.anchorId === 'a2')!.rect!.x, laneX),
    );
    for (const block of [calloutTwo, calloutOne, child]) {
      expect(overlaps(blockRect(root), blockRect(block))).toBe(false);
    }
  });

  it('is deterministic and respects sibling and callout gaps', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        a: { max: 500, min: 100 },
        b: { max: 300, min: 100 },
        c: { max: 500, min: 100 },
      },
      [
        { from: 'root', to: 'a' },
        { from: 'root', to: 'b' },
        { from: 'root', to: 'c' },
      ],
    );
    const first = layout(document, port, 'group-left-origin');
    const second = layout(document, port, 'group-left-origin');
    expect(
      second.blocks.map((block) => [block.blockId, block.x, block.y, block.width, block.height]),
    ).toEqual(first.blocks.map((block) => [block.blockId, block.x, block.y, block.width, block.height]));
    for (const id of ['a', 'b', 'c']) {
      expect(clearGap(blockRect(first.blockById['root']!), blockRect(first.blockById[id]!))).toBeGreaterThanOrEqual(
        16,
      );
    }
    expect(first.blockById['b']!.y).toBe(first.blockById['a']!.subtreeBottom + 24);
    expect(first.blockById['c']!.y).toBe(first.blockById['b']!.subtreeBottom + 24);
  });

  it('reproduces the previous wide-fan geometry with the right-first oracle', () => {
    // The oracle must stay compatible with the pre-M4a engine. The image block
    // width changes from 546 to 446 because images are now width-scalable and
    // cap at maxContentWidth; the rest is the committed pre-M4a geometry.
    const document = JSON.parse(
      readFileSync(resolve(FIXTURES, 'wide-fan.json'), 'utf8'),
    ) as NoteDocument;
    const result = layoutDocument(
      document,
      createEstimatedMeasurement(document),
      {
        wrapPolicy: 'right-first-per-child',
      },
      FIXTURE_PAGE_SETUP,
        anchorViewFor(document),
    );
    const expected: Record<string, [number, number, number]> = {
      'f3-parent': [0, 0, 432],
      'f3-c1': [456, 0, 186],
      'f3-c2': [18, 99.1, 292],
      'f3-c3': [18, 198.2, 446],
      'f3-c4': [18, 358.2, 386],
      'f3-c5': [456, 481.5, 186],
      'f3-c6': [18, 753.8, 222],
      'f3-c7': [18, 880.6, 446],
      'f3-c8': [456, 1069.4, 186],
      'f3-c9': [18, 1168.5, 446],
      'f3-c10': [36, 1308.2, 186],
    };
    for (const [blockId, [x, y, width]] of Object.entries(expected)) {
      const block = result.blockById[blockId]!;
      expect(block.x, `${blockId}.x`).toBe(x);
      expect(block.y, `${blockId}.y`).toBeCloseTo(y, 1);
      expect(block.width, `${blockId}.width`).toBe(width);
    }
  });
});
