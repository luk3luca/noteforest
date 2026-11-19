import { describe, expect, it } from 'vitest';
import {
  blockRect,
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  overlaps,
  pageLayoutOptions,
  PAGE_CALLOUT_GAP_DEFAULT,
  PAGE_CHILD_GAP_DEFAULT,
  PAGE_EDGE_GEOMETRY,
  PAGE_GAP_MAX,
  PAGE_GAP_MIN,
  PAGE_TOP_LEVEL_GAP_DEFAULT,
  type AnchorRecord,
  type BlockMeasurement,
  type BranchRecord,
  type ContentBlock,
  type ContentNode,
  type ContinuousLayout,
  type LayoutOptions,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
  type PageSetup,
  type PageTheme,
} from '../src/index.js';

import { anchorViewFor } from './helpers.js';

/**
 * ADR-0010 Page vertical gaps.
 *
 * Three independent vertical settings (child 18, top-level 32, callout 16) and
 * one fixed horizontal corridor (18). These tests move one axis at a time and
 * assert every other gap and every horizontal coordinate stay put, so a swap
 * between `siblingGap`, `chapterGap`, `calloutGap` and `rightGroupGap` fails.
 */

const A4_LANDSCAPE: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
/** Narrow enough that a wide root pushes its whole child group below. */
const A5_PORTRAIT: PageSetup = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
/** Narrow enough for callout mode B2 at a 420 px root. */
const A4_PORTRAIT_WIDE: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 40, right: 40, bottom: 40, left: 40 },
};

interface StubSpec {
  max: number;
  min: number;
  height?: number;
}

interface StubAnchor {
  anchorId: string;
  x: number;
}

function stubMeasurement(
  specs: Record<string, StubSpec>,
  anchors: Record<string, StubAnchor[]>,
): MeasurementPort {
  const theme = DEFAULT_PAGE_SETTINGS.theme;
  const chrome = 2 * (theme.cardPadding + theme.cardBorder);
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
      const contentTop = theme.cardPadding + theme.cardBorder;
      return {
        blockId: block.id,
        mode,
        cardWidth: contentWidth + chrome,
        contentWidth,
        contentHeight,
        contentTop,
        labelHeight: 0,
        cardHeight: contentTop + contentHeight + theme.cardPadding + theme.cardBorder,
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
          y: 0,
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
  options: {
    anchors?: Record<string, StubAnchor[]>;
    topLevelBlockIds?: string[];
  } = {},
): { document: NoteDocument; port: MeasurementPort } {
  const anchors = options.anchors ?? {};
  const blocks: Record<string, ContentBlock> = {};
  for (const blockId of Object.keys(specs)) {
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
  const topLevelBlockIds = options.topLevelBlockIds ?? [Object.keys(specs)[0]!];
  return {
    document: {
      schemaVersion: 2,
      id: 'synthetic-page-gaps',
      title: 'Synthetic Page gaps',
      blocks,
      anchors: anchorRecords,
      branches: branchRecords,
      chapters: [{ id: 'ch1', title: 'Chapter', topLevelBlockIds }],
      assets: {},
    },
    port: stubMeasurement(specs, anchors),
  };
}

/**
 * One document exercising all three rhythms: a wide root with two anchored
 * callouts (mode B2) and two direct children below it, plus a second top-level
 * block after the root subtree.
 */
function mixedDocument(topLevel = true) {
  const specs: Record<string, StubSpec> = {
    root: { max: 420, min: 160 },
    c1: { max: 120, min: 60 },
    c2: { max: 120, min: 60 },
    k1: { max: 160, min: 80 },
    k2: { max: 160, min: 80 },
  };
  if (topLevel) specs['top'] = { max: 300, min: 100 };
  return makeDocument(
    specs,
    [
      { from: 'root', to: 'c1', anchorId: 'a1' },
      { from: 'root', to: 'c2', anchorId: 'a2' },
      { from: 'root', to: 'k1' },
      { from: 'root', to: 'k2' },
    ],
    {
      anchors: { root: [{ anchorId: 'a1', x: 20 }, { anchorId: 'a2', x: 60 }] },
      topLevelBlockIds: topLevel ? ['root', 'top'] : ['root'],
    },
  );
}

function optionsWith(overrides: Partial<PageTheme> = {}): LayoutOptions {
  return pageLayoutOptions({ ...DEFAULT_PAGE_SETTINGS.theme, ...overrides });
}

function layout(
  document: NoteDocument,
  port: MeasurementPort,
  setup: PageSetup,
  overrides: Partial<PageTheme> = {},
  optionOverrides: Partial<LayoutOptions> = {},
): ContinuousLayout {
  return layoutDocument(
    document,
    port,
    { ...optionsWith(overrides), ...optionOverrides },
    setup,
    anchorViewFor(document),
  );
}

function assertNoOverlaps(result: ContinuousLayout): void {
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

function positions(result: ContinuousLayout): Record<string, { x: number; y: number }> {
  const map: Record<string, { x: number; y: number }> = {};
  for (const block of result.blocks) map[block.blockId] = { x: block.x, y: block.y };
  return map;
}

function xPositions(result: ContinuousLayout): Record<string, number> {
  const map: Record<string, number> = {};
  for (const block of result.blocks) map[block.blockId] = block.x;
  return map;
}

describe('Page vertical gap defaults (ADR-0010)', () => {
  it('maps the stored 18/32/16 to the three vertical options and 18 to the corridor', () => {
    expect(PAGE_CHILD_GAP_DEFAULT).toBe(18);
    expect(PAGE_TOP_LEVEL_GAP_DEFAULT).toBe(32);
    expect(PAGE_CALLOUT_GAP_DEFAULT).toBe(16);
    expect(PAGE_GAP_MIN).toBe(0);
    expect(PAGE_GAP_MAX).toBe(96);

    const options = optionsWith();
    expect(options.siblingGap).toBe(18);
    expect(options.chapterGap).toBe(32);
    expect(options.calloutGap).toBe(16);
    expect(options.rightGroupGap).toBe(PAGE_EDGE_GEOMETRY.siblingGap);
    expect(options.rightGroupGap).toBe(18);
    // The vertical defaults are not aliases of the corridor constant.
    expect(options.siblingGap).toBe(PAGE_CHILD_GAP_DEFAULT);
  });

  it('applies 18/32/16 to the default Page layout', () => {
    const { document, port } = mixedDocument();
    const result = layout(document, port, A4_PORTRAIT_WIDE);
    const root = result.blockById['root']!;
    const c1 = result.blockById['c1']!;
    const c2 = result.blockById['c2']!;
    const k1 = result.blockById['k1']!;
    const k2 = result.blockById['k2']!;
    const top = result.blockById['top']!;
    const cardBottom = root.y + root.height;

    expect(c1.y - cardBottom).toBeCloseTo(16, 6);
    expect(c2.y - c1.subtreeBottom).toBeCloseTo(16, 6);
    expect(k1.y - c2.subtreeBottom).toBeCloseTo(18, 6);
    expect(k2.y - k1.subtreeBottom).toBeCloseTo(18, 6);
    expect(top.y - root.subtreeBottom).toBeCloseTo(32, 6);
    expect(k1.x).toBeCloseTo(root.x + 26, 6);
    assertNoOverlaps(result);
  });
});

describe('Page child gap moves only the child rhythm', () => {
  it('moves the below-child start and the child stack without moving x or the top-level rhythm', () => {
    // A narrow page forces the whole child group below the wide root.
    const { document, port } = makeDocument(
      {
        root: { max: 420, min: 160 },
        k1: { max: 120, min: 60 },
        k2: { max: 120, min: 60 },
        top: { max: 300, min: 100 },
      },
      [
        { from: 'root', to: 'k1' },
        { from: 'root', to: 'k2' },
      ],
      { topLevelBlockIds: ['root', 'top'] },
    );
    const baseline = layout(document, port, A5_PORTRAIT);
    const baseRoot = baseline.blockById['root']!;
    const baseK1 = baseline.blockById['k1']!;
    const baseK2 = baseline.blockById['k2']!;
    const x0 = xPositions(baseline);

    for (const childGap of [0, 18, 40, 96]) {
      const result = layout(document, port, A5_PORTRAIT, { siblingGap: childGap });
      const root = result.blockById['root']!;
      const k1 = result.blockById['k1']!;
      const k2 = result.blockById['k2']!;
      const top = result.blockById['top']!;

      expect(k1.y - (root.y + root.height), `below child at ${childGap}`).toBeCloseTo(
        childGap,
        6,
      );
      expect(k2.y - k1.subtreeBottom, `child stack at ${childGap}`).toBeCloseTo(childGap, 6);
      // The next top-level block follows the subtree, so its own gap is unchanged.
      expect(top.y - root.subtreeBottom, `top-level gap at ${childGap}`).toBeCloseTo(32, 6);
      // No horizontal coordinate moves.
      expect(xPositions(result)).toEqual(x0);
      expect(result.layoutOptions?.rightGroupGap).toBe(18);
      // The card boxes themselves do not resize.
      expect(k1.width).toBe(baseK1.width);
      expect(k2.width).toBe(baseK2.width);
      expect(root.width).toBe(baseRoot.width);
      assertNoOverlaps(result);
    }
  });
});

describe('Page top-level gap moves only the chapter rhythm', () => {
  it('moves the gap between top-level blocks and no child gap, callout gap or x', () => {
    const { document, port } = mixedDocument();
    const baseline = layout(document, port, A4_PORTRAIT_WIDE);
    const x0 = xPositions(baseline);

    for (const chapterGap of [0, 32, 64, 96]) {
      const result = layout(document, port, A4_PORTRAIT_WIDE, { chapterGap });
      const root = result.blockById['root']!;
      const c1 = result.blockById['c1']!;
      const c2 = result.blockById['c2']!;
      const k1 = result.blockById['k1']!;
      const k2 = result.blockById['k2']!;
      const top = result.blockById['top']!;

      expect(top.y - root.subtreeBottom, `top-level gap at ${chapterGap}`).toBeCloseTo(
        chapterGap,
        6,
      );
      // The child and callout rhythms keep their defaults.
      expect(c1.y - (root.y + root.height)).toBeCloseTo(16, 6);
      expect(c2.y - c1.subtreeBottom).toBeCloseTo(16, 6);
      expect(k1.y - c2.subtreeBottom).toBeCloseTo(18, 6);
      expect(k2.y - k1.subtreeBottom).toBeCloseTo(18, 6);
      expect(xPositions(result)).toEqual(x0);
      assertNoOverlaps(result);
    }
  });
});

describe('Page callout gap moves only the callout rhythm', () => {
  it('moves the parent → B2 callout and the callout stack without moving children or x', () => {
    const { document, port } = mixedDocument();
    const baseline = layout(document, port, A4_PORTRAIT_WIDE);
    const x0 = xPositions(baseline);

    for (const calloutGap of [0, 16, 24, 96]) {
      const result = layout(document, port, A4_PORTRAIT_WIDE, { calloutGap });
      const root = result.blockById['root']!;
      const c1 = result.blockById['c1']!;
      const c2 = result.blockById['c2']!;
      const k1 = result.blockById['k1']!;
      const k2 = result.blockById['k2']!;

      expect(c1.y - (root.y + root.height), `parent → callout at ${calloutGap}`).toBeCloseTo(
        calloutGap,
        6,
      );
      expect(c2.y - c1.subtreeBottom, `callout stack at ${calloutGap}`).toBeCloseTo(calloutGap, 6);
      // The callout-stack → child transition is the child gap, not this one.
      expect(k1.y - c2.subtreeBottom).toBeCloseTo(18, 6);
      expect(k2.y - k1.subtreeBottom).toBeCloseTo(18, 6);
      expect(xPositions(result)).toEqual(x0);
      assertNoOverlaps(result);
    }
  });

  it('keeps the mode A first callout at the parent y and applies only to callout → callout', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        c1: { max: 120, min: 60 },
        c2: { max: 120, min: 60 },
        k1: { max: 200, min: 100 },
        k2: { max: 200, min: 100 },
      },
      [
        { from: 'root', to: 'c1', anchorId: 'a1' },
        { from: 'root', to: 'c2', anchorId: 'a2' },
        { from: 'root', to: 'k1' },
        { from: 'root', to: 'k2' },
      ],
      { anchors: { root: [{ anchorId: 'a1', x: 20 }, { anchorId: 'a2', x: 60 }] } },
    );
    const baseline = layout(document, port, A4_LANDSCAPE);
    const x0 = xPositions(baseline);

    for (const calloutGap of [0, 16, 24, 96]) {
      const result = layout(document, port, A4_LANDSCAPE, { calloutGap });
      const root = result.blockById['root']!;
      const c1 = result.blockById['c1']!;
      const c2 = result.blockById['c2']!;
      const k1 = result.blockById['k1']!;
      const k2 = result.blockById['k2']!;

      expect(c1.y - root.y, `mode A first callout at ${calloutGap}`).toBeCloseTo(0, 6);
      expect(c2.y - c1.subtreeBottom).toBeCloseTo(calloutGap, 6);
      expect(k1.y - c2.subtreeBottom).toBeCloseTo(18, 6);
      expect(k2.y - k1.subtreeBottom).toBeCloseTo(18, 6);
      expect(xPositions(result)).toEqual(x0);
      assertNoOverlaps(result);
    }
  });
});

describe('Page gap independence and overlap safety', () => {
  const AXES = ['siblingGap', 'chapterGap', 'calloutGap'] as const;

  function measuredGaps(result: ContinuousLayout): {
    childBelow: number;
    childStack: number;
    topLevel: number;
    calloutParent: number;
    calloutStack: number;
  } {
    const root = result.blockById['root']!;
    const c1 = result.blockById['c1']!;
    const c2 = result.blockById['c2']!;
    const k1 = result.blockById['k1']!;
    const k2 = result.blockById['k2']!;
    const top = result.blockById['top']!;
    return {
      calloutParent: c1.y - (root.y + root.height),
      calloutStack: c2.y - c1.subtreeBottom,
      childBelow: k1.y - c2.subtreeBottom,
      childStack: k2.y - k1.subtreeBottom,
      topLevel: top.y - root.subtreeBottom,
    };
  }

  it('moves one axis at min/max while the other two gaps and the corridor stay', () => {
    const { document, port } = mixedDocument();
    const baseline = layout(document, port, A4_PORTRAIT_WIDE);
    const baselineGaps = measuredGaps(baseline);
    const baselineX = xPositions(baseline);
    expect(baselineGaps).toEqual({
      calloutParent: 16,
      calloutStack: 16,
      childBelow: 18,
      childStack: 18,
      topLevel: 32,
    });

    for (const axis of AXES) {
      for (const value of [0, 96]) {
        const result = layout(document, port, A4_PORTRAIT_WIDE, { [axis]: value });
        const gaps = measuredGaps(result);
        const label = `${axis}=${value}`;

        if (axis === 'siblingGap') {
          expect(gaps.childBelow, label).toBeCloseTo(value, 6);
          expect(gaps.childStack, label).toBeCloseTo(value, 6);
          expect(gaps.calloutParent, label).toBeCloseTo(16, 6);
          expect(gaps.calloutStack, label).toBeCloseTo(16, 6);
          expect(gaps.topLevel, label).toBeCloseTo(32, 6);
        } else if (axis === 'chapterGap') {
          expect(gaps.topLevel, label).toBeCloseTo(value, 6);
          expect(gaps.childBelow, label).toBeCloseTo(18, 6);
          expect(gaps.childStack, label).toBeCloseTo(18, 6);
          expect(gaps.calloutParent, label).toBeCloseTo(16, 6);
          expect(gaps.calloutStack, label).toBeCloseTo(16, 6);
        } else {
          expect(gaps.calloutParent, label).toBeCloseTo(value, 6);
          expect(gaps.calloutStack, label).toBeCloseTo(value, 6);
          expect(gaps.childBelow, label).toBeCloseTo(18, 6);
          expect(gaps.childStack, label).toBeCloseTo(18, 6);
          expect(gaps.topLevel, label).toBeCloseTo(32, 6);
        }

        // The corridor never moves with a vertical gap.
        expect(result.layoutOptions?.rightGroupGap, label).toBe(18);
        expect(xPositions(result), label).toEqual(baselineX);
        assertNoOverlaps(result);
      }
    }
  });

  it('stays overlap-free with all three gaps at the maximum', () => {
    const { document, port } = mixedDocument();
    const result = layout(document, port, A4_PORTRAIT_WIDE, {
      siblingGap: 96,
      chapterGap: 96,
      calloutGap: 96,
    });
    const gaps = measuredGaps(result);
    expect(gaps.calloutParent).toBeCloseTo(96, 6);
    expect(gaps.calloutStack).toBeCloseTo(96, 6);
    expect(gaps.childBelow).toBeCloseTo(96, 6);
    expect(gaps.childStack).toBeCloseTo(96, 6);
    expect(gaps.topLevel).toBeCloseTo(96, 6);
    assertNoOverlaps(result);
  });

  it('never scales a gap with density while typography and padding still scale', () => {
    for (const density of [0.6, 1, 1.2]) {
      const options = optionsWith({ density });
      expect(options.siblingGap).toBe(18);
      expect(options.chapterGap).toBe(32);
      expect(options.calloutGap).toBe(16);
      expect(options.rightGroupGap).toBe(18);
      if (density < 1) {
        expect(options.cardPadding).toBeLessThan(DEFAULT_PAGE_SETTINGS.theme.cardPadding);
      }
      if (density > 1) {
        expect(options.cardPadding).toBeGreaterThan(DEFAULT_PAGE_SETTINGS.theme.cardPadding);
      }
    }

    // A non-default set of gaps is unchanged at every density step too.
    for (const density of [0.6, 1, 1.2]) {
      const options = optionsWith({ density, siblingGap: 40, chapterGap: 64, calloutGap: 24 });
      expect(options.siblingGap).toBe(40);
      expect(options.chapterGap).toBe(64);
      expect(options.calloutGap).toBe(24);
    }
  });
});

describe('Page gap axis split in the legacy packings', () => {
  it('keeps stacked callouts on the callout gap and the child stack on the child gap', () => {
    const { document, port } = mixedDocument(false);
    const baseline = layout(
      document,
      port,
      A4_LANDSCAPE,
      {},
      { pagePacking: 'stacked', calloutModes: false },
    );
    const baseRoot = baseline.blockById['root']!;
    const baseC1 = baseline.blockById['c1']!;
    const baseC2 = baseline.blockById['c2']!;
    const baseK1 = baseline.blockById['k1']!;
    const baseK2 = baseline.blockById['k2']!;
    expect(baseC1.y - (baseRoot.y + baseRoot.height)).toBeCloseTo(16, 6);
    expect(baseC2.y - baseC1.subtreeBottom).toBeCloseTo(16, 6);
    expect(baseK2.y - baseK1.subtreeBottom).toBeCloseTo(18, 6);

    const moved = layout(
      document,
      port,
      A4_LANDSCAPE,
      { siblingGap: 60, calloutGap: 24 },
      { pagePacking: 'stacked', calloutModes: false },
    );
    const root = moved.blockById['root']!;
    const c1 = moved.blockById['c1']!;
    const c2 = moved.blockById['c2']!;
    const k1 = moved.blockById['k1']!;
    const k2 = moved.blockById['k2']!;
    expect(c1.y - (root.y + root.height)).toBeCloseTo(24, 6);
    expect(c2.y - c1.subtreeBottom).toBeCloseTo(24, 6);
    expect(k2.y - k1.subtreeBottom).toBeCloseTo(60, 6);
    // The corridor is horizontal and stays fixed in the legacy path too.
    expect(moved.layoutOptions?.rightGroupGap).toBe(18);
    expect(xPositions(moved)).toEqual(xPositions(baseline));
    assertNoOverlaps(moved);
  });

  it('uses the horizontal corridor for the compaction in-row gap and the child gap for a row top', () => {
    // Small components keep the first row and exercise the in-row gap.
    const row = makeDocument(
      {
        root: { max: 200, min: 100 },
        c1: { max: 80, min: 40 },
        k1: { max: 80, min: 40 },
      },
      [
        { from: 'root', to: 'c1', anchorId: 'a1' },
        { from: 'root', to: 'k1' },
      ],
      { anchors: { root: [{ anchorId: 'a1', x: 20 }] } },
    );
    const narrow = layout(row.document, row.port, A4_LANDSCAPE, {}, { pagePacking: 'compaction' });
    const wide = layout(
      row.document,
      row.port,
      A4_LANDSCAPE,
      {},
      { pagePacking: 'compaction', rightGroupGap: 40 },
    );
    const narrowK1 = narrow.blockById['k1']!;
    const wideK1 = wide.blockById['k1']!;
    const narrowC1 = narrow.blockById['c1']!;
    const wideC1 = wide.blockById['c1']!;
    expect(narrowC1.y).toBeCloseTo(narrow.blockById['root']!.y, 6);
    expect(wideC1.y).toBeCloseTo(wide.blockById['root']!.y, 6);
    // Only the horizontal in-row gap moved: the first row origin and each
    // following item shift by the corridor delta.
    expect(narrowK1.y).toBeCloseTo(wideK1.y, 6);
    expect(wideC1.x - narrowC1.x).toBeCloseTo(40 - 18, 6);
    expect(wideK1.x - narrowK1.x).toBeCloseTo(2 * (40 - 18), 6);

    // A full-width root pushes the components to a second row: the row top is
    // the vertical child gap, never the horizontal corridor.
    const wrapped = makeDocument(
      {
        root: { max: 420, min: 160 },
        c1: { max: 80, min: 40 },
      },
      [{ from: 'root', to: 'c1', anchorId: 'a1' }],
      { anchors: { root: [{ anchorId: 'a1', x: 20 }] } },
    );
    for (const siblingGap of [0, 18, 40, 96]) {
      const result = layout(
        wrapped.document,
        wrapped.port,
        A5_PORTRAIT,
        { siblingGap },
        { pagePacking: 'compaction' },
      );
      const root = result.blockById['root']!;
      const c1 = result.blockById['c1']!;
      expect(c1.y - (root.y + root.height), `row top at ${siblingGap}`).toBeCloseTo(
        siblingGap,
        6,
      );
      // The horizontal corridor is still 18: the row's x is the wrap indent.
      expect(c1.x).toBeCloseTo(12, 6);

      const horizontal = layout(
        wrapped.document,
        wrapped.port,
        A5_PORTRAIT,
        { siblingGap },
        { pagePacking: 'compaction', rightGroupGap: 40 },
      );
      const horizontalC1 = horizontal.blockById['c1']!;
      expect(horizontalC1.y, `row top ignores the corridor at ${siblingGap}`).toBeCloseTo(
        c1.y,
        6,
      );
      expect(horizontalC1.x, `wrapped x ignores the corridor at ${siblingGap}`).toBeCloseTo(
        c1.x,
        6,
      );
      assertNoOverlaps(result);
    }
  });
});
