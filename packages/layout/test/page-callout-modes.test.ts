import { describe, expect, it } from 'vitest';
import {
  blockRect,
  buildPageEdgeModel,
  DEFAULT_PAGE_SETTINGS,
  EDGE_STYLE,
  layoutDocument,
  overlaps,
  pageLayoutOptions,
  paginate,
  type AnchorRecord,
  type BlockMeasurement,
  type BranchRecord,
  type ContentBlock,
  type LayoutOptions,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
  type PageSetup,
  type PageTheme,
} from '../src/index.js';

/**
 * R2j Page callout modes A + B2.
 *
 * The page theme always maps to `calloutModes: true` for the beside packing.
 * The synthetic measurement lets the tests state the resolved card budget
 * directly, so each mode is chosen by the same resolved-page-width rule the
 * renderer and PDF use.
 */

const A4_LANDSCAPE: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A4_PORTRAIT_WIDE: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 40, right: 40, bottom: 40, left: 40 },
};
const A5_PORTRAIT_NARROW: PageSetup = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 46, right: 46, bottom: 46, left: 46 },
};
const A5_PORTRAIT: PageSetup = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_LANDSCAPE: PageSetup = {
  size: 'A5',
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
  const chrome = 2 * (DEFAULT_PAGE_SETTINGS.theme.cardPadding + DEFAULT_PAGE_SETTINGS.theme.cardBorder);
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
        DEFAULT_PAGE_SETTINGS.theme.cardPadding + DEFAULT_PAGE_SETTINGS.theme.cardBorder;
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
          DEFAULT_PAGE_SETTINGS.theme.cardPadding +
          DEFAULT_PAGE_SETTINGS.theme.cardBorder,
        maxContentWidth: spec.max,
        minContentWidth: spec.min,
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
      id: 'synthetic-callout-modes',
      title: 'Synthetic callout modes',
      blocks,
      anchors: anchorRecords,
      branches: branchRecords,
      chapters: [{ id: 'ch1', title: 'Chapter', topLevelBlockIds: [root] }],
      assets: {},
    },
    port: stubMeasurement(specs, anchors),
  };
}

function pageOptions(overrides: Partial<PageTheme> = {}): LayoutOptions {
  return pageLayoutOptions({
    ...DEFAULT_PAGE_SETTINGS.theme,
    ...overrides,
  });
}

function layout(
  document: NoteDocument,
  port: MeasurementPort,
  setup: PageSetup = A4_LANDSCAPE,
  themeOverrides: Partial<PageTheme> = {},
) {
  return layoutDocument(document, port, pageOptions(themeOverrides), setup);
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

const THEME = DEFAULT_PAGE_SETTINGS.theme;
const CARD_CHROME = 2 * (THEME.cardPadding + THEME.cardBorder);
const GAP = THEME.siblingGap;
const CHILD_INDENT = THEME.childIndent;

/** Root 218 px, two callouts, two direct children: the canonical A fixture. */
function modeADocument() {
  return makeDocument(
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
    { root: [{ anchorId: 'a1', x: 20 }, { anchorId: 'a2', x: 60 }] },
  );
}

describe('page callout mode A (R2j)', () => {
  it('places multiple callouts in the right lane and direct children below at the child indent', () => {
    const { document, port } = modeADocument();
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const c1 = result.blockById['c1']!;
    const c2 = result.blockById['c2']!;
    const k1 = result.blockById['k1']!;
    const k2 = result.blockById['k2']!;

    // Resolved compact page: the right lane is far wider than the A floor.
    expect(result.geometry.contentWidthPx).toBeGreaterThan(
      root.x + root.width + THEME.calloutRightGap + THEME.calloutModeMinWidth,
    );
    expect(root.width).toBe(200 + CARD_CHROME);

    const laneX = root.x + root.width + THEME.calloutRightGap;
    expect(c1.x).toBe(laneX);
    expect(c2.x).toBe(laneX);
    expect(c1.placement).toBe('right');
    expect(c2.placement).toBe('right');
    // Callouts stack from the parent top; the leader may use the parent's right side.
    expect(c1.y).toBe(root.y);
    expect(c2.y).toBe(c1.subtreeBottom + THEME.calloutGap);

    // The lane decision re-checks the child origin: children move below at the
    // child indent even though their cards would fit to the parent's right.
    expect(k1.x).toBe(root.x + CHILD_INDENT);
    expect(k2.x).toBe(k1.x);
    expect(k1.placement).toBe('below');
    expect(k2.placement).toBe('below');
    expect(k1.y).toBeGreaterThanOrEqual(c2.subtreeBottom + GAP - 0.001);
    expect(k2.y).toBe(k1.subtreeBottom + GAP);

    // Mode A has no B2 group split: callouts are a right group, children a
    // shared below group.
    expect(c1.trunkGroup).toBeUndefined();
    expect(k1.trunkGroup).toBeUndefined();
    assertNoOverlaps(result);
    expect(
      result.blocks.every(
        (block) => block.x + block.width <= result.geometry.contentWidthPx + 0.25,
      ),
    ).toBe(true);
  });

  it('gives callouts their own right trunk and children their own below trunk', () => {
    const { document, port } = modeADocument();
    const result = layout(document, port);
    const pages = paginate(result, document);
    expect(pages.pageCount).toBe(1);
    const model = buildPageEdgeModel(result, pages.pages);
    const edges = model.edges[0]!;
    const edge = (branchId: string) => edges.find((candidate) => candidate.branchId === branchId)!;

    const callout1 = edge('e01');
    const callout2 = edge('e02');
    const child1 = edge('e03');
    const child2 = edge('e04');

    expect(callout1.placement).toBe('right');
    expect(callout2.placement).toBe('right');
    expect(callout1.trunk!.id).toBe('root:right');
    expect(callout2.trunk!.id).toBe('root:right');
    expect(callout1.trunk!.trunkGroup).toBeNull();
    // The right rail sits between the parent's right edge and the callout cards.
    expect(callout1.trunk!.x).toBeGreaterThan(
      result.blockById['root']!.x + result.blockById['root']!.width,
    );
    expect(callout1.trunk!.x).toBeLessThan(result.blockById['c1']!.x);
    // The leader starts at the parent's right side.
    expect(callout1.from.x).toBeCloseTo(
      result.blockById['root']!.x + result.blockById['root']!.width,
      6,
    );

    expect(child1.placement).toBe('below');
    expect(child2.placement).toBe('below');
    expect(child1.trunk!.id).toBe('root:below');
    expect(child2.trunk!.id).toBe('root:below');
    expect(child1.trunk!.trunkGroup).toBeNull();
    expect(child1.trunk!.x).toBeLessThan(result.blockById['k1']!.x);
    expect(child1.from.y).toBeCloseTo(
      result.blockById['root']!.y + result.blockById['root']!.height,
      6,
    );

    for (const candidate of edges) {
      expect(candidate.route.entry).toBe('left');
      expect(candidate.targetPage).toBeNull();
      expect(candidate.label).toBeUndefined();
    }
    expect(callout1.trunk!.id).not.toBe(child1.trunk!.id);
    expect(callout1.trunk!.x).not.toBe(child1.trunk!.x);
  });

  it('is deterministic and independent of a viewport or zoom input', () => {
    const { document, port } = modeADocument();
    const first = layout(document, port);
    const second = layout(document, port);
    expect(JSON.stringify(first.blocks)).toBe(JSON.stringify(second.blocks));
    expect(JSON.stringify(first.edges)).toBe(JSON.stringify(second.edges));
    // Mode choice is a pure function of page width and parent box; no viewport
    // value exists in LayoutOptions.
    expect('viewport' in pageOptions()).toBe(false);
    expect('zoom' in pageOptions()).toBe(false);
  });

  it('keeps nested callout mode groups independent', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 200, min: 100 },
        nc1: { max: 120, min: 60 },
        nc2: { max: 120, min: 60 },
        k1: { max: 200, min: 100 },
        g1: { max: 120, min: 60 },
      },
      [
        { from: 'root', to: 'nc1', anchorId: 'a1' },
        { from: 'root', to: 'k1' },
        { from: 'k1', to: 'nc2', anchorId: 'a2' },
        { from: 'k1', to: 'g1' },
      ],
      {
        root: [{ anchorId: 'a1', x: 20 }],
        k1: [{ anchorId: 'a2', x: 20 }],
      },
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const k1 = result.blockById['k1']!;
    const nc1 = result.blockById['nc1']!;
    const nc2 = result.blockById['nc2']!;
    const g1 = result.blockById['g1']!;

    // Root: callout right, child below. Child: its own callout right, its own
    // child below. No group is merged with another level.
    expect(nc1.x).toBe(root.x + root.width + THEME.calloutRightGap);
    expect(k1.x).toBe(root.x + CHILD_INDENT);
    expect(nc2.x).toBe(k1.x + k1.width + THEME.calloutRightGap);
    expect(g1.x).toBe(k1.x + CHILD_INDENT);
    expect(nc1.placement).toBe('right');
    expect(nc2.placement).toBe('right');
    expect(k1.placement).toBe('below');
    expect(g1.placement).toBe('below');
    assertNoOverlaps(result);

    const pages = paginate(result, document);
    const model = buildPageEdgeModel(result, pages.pages);
    const trunkIds = model.trunks.flat().map((view) => view.trunk.id);
    expect(new Set(trunkIds)).toEqual(
      new Set(['root:right', 'root:below', 'k1:right', 'k1:below']),
    );
  });
});

describe('page callout mode B2 (R2j)', () => {
  function b2Document() {
    return makeDocument(
      {
        root: { max: 420, min: 160 },
        c1: { max: 120, min: 60 },
        c2: { max: 120, min: 60 },
        k1: { max: 160, min: 80 },
        k2: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'c1', anchorId: 'a1' },
        { from: 'root', to: 'c2', anchorId: 'a2' },
        { from: 'root', to: 'k1' },
        { from: 'root', to: 'k2' },
      ],
      { root: [{ anchorId: 'a1', x: 20 }, { anchorId: 'a2', x: 60 }] },
    );
  }

  it('uses two independent below trunks: child outer 12/26, callout inner 24/38', () => {
    const { document, port } = b2Document();
    const result = layout(document, port, A4_PORTRAIT_WIDE);
    const root = result.blockById['root']!;
    const c1 = result.blockById['c1']!;
    const c2 = result.blockById['c2']!;
    const k1 = result.blockById['k1']!;
    const k2 = result.blockById['k2']!;

    expect(root.width).toBe(420 + CARD_CHROME);
    expect(result.geometry.contentWidthPx).toBeLessThan(
      root.x + root.width + THEME.calloutRightGap + THEME.calloutModeMinWidth,
    );

    // Callouts first, on the inner/right column.
    expect(c1.x).toBe(root.x + THEME.calloutCardIndent);
    expect(c2.x).toBe(c1.x);
    expect(c1.placement).toBe('below');
    expect(c2.placement).toBe('below');
    expect(c1.trunkGroup).toBe('callout');
    expect(c2.trunkGroup).toBe('callout');
    expect(c1.trunkInset).toBe(THEME.calloutTrunkInset);
    expect(c1.y).toBe(root.y + root.height + THEME.calloutGap);
    expect(c2.y).toBe(c1.subtreeBottom + THEME.calloutGap);

    // Children lower, on the outer/left column.
    const childStart = Math.max(
      root.y + root.height + GAP,
      c2.subtreeBottom + GAP,
    );
    expect(k1.x).toBe(root.x + THEME.childIndent);
    expect(k2.x).toBe(k1.x);
    expect(k1.placement).toBe('below');
    expect(k2.placement).toBe('below');
    expect(k1.trunkGroup).toBe('child');
    expect(k1.trunkInset).toBe(THEME.childTrunkInset);
    expect(k1.y).toBeCloseTo(childStart, 6);
    expect(k2.y).toBe(k1.subtreeBottom + GAP);
    expect(k1.y).toBeGreaterThan(c2.subtreeBottom);
    assertNoOverlaps(result);
    expect(
      result.blocks.every(
        (block) => block.x + block.width <= result.geometry.contentWidthPx + 0.25,
      ),
    ).toBe(true);
    expect(result.defects.filter((defect) => defect.blocksExport)).toEqual([]);
  });

  it('feeds the two below trunks through the Page/PDF edge model', () => {
    const { document, port } = b2Document();
    const result = layout(document, port, A4_PORTRAIT_WIDE);
    const pages = paginate(result, document);
    expect(pages.pageCount).toBe(1);
    const model = buildPageEdgeModel(result, pages.pages);
    const edges = model.edges[0]!;
    const edge = (branchId: string) => edges.find((candidate) => candidate.branchId === branchId)!;
    const root = result.blockById['root']!;

    const callout1 = edge('e01');
    const callout2 = edge('e02');
    const child1 = edge('e03');
    const child2 = edge('e04');

    expect(callout1.trunk!.id).toBe('root:below:callout');
    expect(callout2.trunk!.id).toBe('root:below:callout');
    expect(callout1.trunk!.trunkGroup).toBe('callout');
    expect(callout1.trunk!.placement).toBe('below');
    expect(callout1.trunk!.x).toBeCloseTo(root.x + THEME.calloutTrunkInset, 6);
    expect(callout1.trunk!.port.x).toBeCloseTo(root.x + THEME.calloutTrunkInset, 6);
    expect(callout1.from.y).toBeCloseTo(root.y + root.height, 6);

    expect(child1.trunk!.id).toBe('root:below:child');
    expect(child2.trunk!.id).toBe('root:below:child');
    expect(child1.trunk!.trunkGroup).toBe('child');
    expect(child1.trunk!.x).toBeCloseTo(root.x + THEME.childTrunkInset, 6);
    expect(child1.trunk!.x).toBeLessThan(callout1.trunk!.x);
    expect(callout1.trunk!.x).toBeLessThan(result.blockById['c1']!.x);
    expect(child1.trunk!.x).toBeLessThan(result.blockById['k1']!.x);
    expect(child1.trunk!.id).not.toBe(callout1.trunk!.id);

    // Every arm enters left with a full stem; the split does not create a tree
    // page chip.
    for (const candidate of edges) {
      expect(candidate.route.entry).toBe('left');
      expect(candidate.route.stem).toBeGreaterThanOrEqual(EDGE_STYLE.stemMin - 0.01);
      expect(candidate.label).toBeUndefined();
      expect(candidate.targetPage).toBeNull();
    }
    expect(model.trunks[0]!.map((view) => view.trunk.id).sort()).toEqual([
      'root:below:callout',
      'root:below:child',
    ]);
  });

  it('duplicates deterministic geometry for Page Read/Edit and the print model consumer', () => {
    const { document, port } = b2Document();
    const result = layout(document, port, A4_PORTRAIT_WIDE);
    const pages = paginate(result, document);
    const first = buildPageEdgeModel(result, pages.pages);
    const second = buildPageEdgeModel(result, pages.pages);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // The print model aliases the same page edge/trunk records.
    for (const pageEdges of first.edges) {
      for (const candidate of pageEdges) {
        if (candidate.role !== 'primary') continue;
        expect(candidate.trunk).not.toBeNull();
        expect(candidate.trunkSegment).not.toBeNull();
      }
    }
  });

  it('does not use B2 when the mode A right lane still fits', () => {
    const { document, port } = b2Document();
    const result = layout(document, port, A4_LANDSCAPE);
    expect(result.blockById['c1']!.placement).toBe('right');
    expect(result.blockById['k1']!.placement).toBe('below');
    expect(result.blockById['c1']!.trunkGroup).toBeUndefined();
  });

  it('supports overriding the A lane floor and the B2 offsets through PageTheme', () => {
    const { document, port } = b2Document();
    const wideFloor = layout(document, port, A4_LANDSCAPE, { calloutModeMinWidth: 900 });
    expect(wideFloor.blockById['c1']!.placement).toBe('below');
    expect(wideFloor.blockById['c1']!.x).toBe(
      wideFloor.blockById['root']!.x + THEME.calloutCardIndent,
    );

    const custom = layout(document, port, A4_LANDSCAPE, {
      calloutModeMinWidth: 900,
      childTrunkInset: 14,
      childIndent: 32,
      calloutTrunkInset: 28,
      calloutCardIndent: 44,
    });
    expect(custom.blockById['c1']!.x).toBe(
      custom.blockById['root']!.x + 44,
    );
    expect(custom.blockById['k1']!.x).toBe(custom.blockById['root']!.x + 32);
    expect(custom.blockById['c1']!.trunkInset).toBe(28);
    expect(custom.blockById['k1']!.trunkInset).toBe(14);
  });
});

describe('page callout stacked fallback (R2j)', () => {
  function stackedDocument() {
    return makeDocument(
      {
        root: { max: 420, min: 160 },
        c1: { max: 120, min: 60 },
        c2: { max: 120, min: 60 },
        k1: { max: 160, min: 80 },
        k2: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'c1', anchorId: 'a1' },
        { from: 'root', to: 'c2', anchorId: 'a2' },
        { from: 'root', to: 'k1' },
        { from: 'root', to: 'k2' },
      ],
      { root: [{ anchorId: 'a1', x: 10 }, { anchorId: 'a2', x: 40 }] },
    );
  }

  it('uses the stacked order when neither A nor B2 fits, never a shared B1 row', () => {
    const { document, port } = stackedDocument();
    const result = layout(document, port, A5_PORTRAIT_NARROW);
    const root = result.blockById['root']!;
    const c1 = result.blockById['c1']!;
    const c2 = result.blockById['c2']!;
    const k1 = result.blockById['k1']!;
    const k2 = result.blockById['k2']!;

    // The callout keeps the anchor-aligned stacked x, not the B2 38 px column.
    const contentLeft = root.x + THEME.cardPadding + THEME.cardBorder;
    expect(c1.x).toBe(contentLeft + 10);
    expect(c2.x).toBe(contentLeft + 40);
    expect(c1.x).not.toBe(root.x + THEME.calloutCardIndent);
    expect(c1.placement).toBe('below');
    expect(c2.placement).toBe('below');
    expect(c1.y).toBe(root.y + root.height + THEME.calloutGap);
    expect(c2.y).toBe(c1.subtreeBottom + THEME.calloutGap);

    // No B2 split: one shared below group.
    expect(c1.trunkGroup).toBeUndefined();
    expect(c2.trunkGroup).toBeUndefined();
    expect(k1.trunkGroup).toBeUndefined();
    expect(k2.trunkGroup).toBeUndefined();
    expect(k1.placement).toBe('below');
    expect(k2.placement).toBe('below');
    expect(k1.y).toBeGreaterThanOrEqual(c2.subtreeBottom + GAP - 0.001);
    expect(k2.y).toBe(k1.subtreeBottom + GAP);
    assertNoOverlaps(result);

    const pages = paginate(result, document);
    const model = buildPageEdgeModel(result, pages.pages);
    const belowTrunks = model.trunks[0]!.filter((view) => view.trunk.placement === 'below');
    expect(belowTrunks).toHaveLength(1);
    expect(belowTrunks[0]!.trunk.id).toBe('root:below');
    expect(belowTrunks[0]!.trunk.trunkGroup).toBeNull();
    expect(
      model.trunks[0]!.some((view) => view.trunk.trunkGroup !== null),
    ).toBe(false);
    expect(result.defects.filter((defect) => defect.blocksExport)).toEqual([]);
  });

  it('keeps the stacked fallback deterministic and free of page chips', () => {
    const { document, port } = stackedDocument();
    const first = layout(document, port, A5_PORTRAIT_NARROW);
    const second = layout(document, port, A5_PORTRAIT_NARROW);
    expect(JSON.stringify(first.blocks)).toBe(JSON.stringify(second.blocks));
    const pages = paginate(first, document);
    const model = buildPageEdgeModel(first, pages.pages);
    for (const pageEdges of model.edges) {
      for (const candidate of pageEdges) {
        if (candidate.role !== 'primary') continue;
        expect(candidate.direction === 'same-page' || candidate.direction === 'trunk').toBe(
          true,
        );
        expect(candidate.targetPage).toBeNull();
        expect(candidate.label).toBeUndefined();
      }
    }
  });
});

describe('page callout modes across pages (R2j)', () => {
  function tallDocument(): ReturnType<typeof makeDocument> {
    return makeDocument(
      {
        root: { max: 200, min: 100 },
        c1: { max: 120, min: 60, height: 300 },
        c2: { max: 120, min: 60, height: 300 },
        k1: { max: 200, min: 100, height: 200 },
        k2: { max: 200, min: 100, height: 200 },
      },
      [
        { from: 'root', to: 'c1', anchorId: 'a1' },
        { from: 'root', to: 'c2', anchorId: 'a2' },
        { from: 'root', to: 'k1' },
        { from: 'root', to: 'k2' },
      ],
      { root: [{ anchorId: 'a1', x: 20 }, { anchorId: 'a2', x: 60 }] },
    );
  }

  it('continues both mode A group trunks across pages without tree chips', () => {
    const { document, port } = tallDocument();
    const result = layout(document, port, A5_LANDSCAPE);
    const pages = paginate(result, document);
    expect(pages.pageCount).toBeGreaterThanOrEqual(2);
    const model = buildPageEdgeModel(result, pages.pages);
    const edgePages = model.edges;
    const calloutArm = edgePages
      .flat()
      .find((candidate) => candidate.branchId === 'e01')!;
    const childArm = edgePages
      .flat()
      .find((candidate) => candidate.branchId === 'e03')!;

    expect(calloutArm.trunk!.id).toBe('root:right');
    expect(childArm.trunk!.id).toBe('root:below');

    // The right trunk continues to the last callout arm; the below trunk to
    // the last child arm. Both keep one x across page segments.
    const calloutTrunk = calloutArm.trunk!;
    const childTrunk = childArm.trunk!;
    expect(calloutTrunk.segments.length).toBeGreaterThanOrEqual(2);
    expect(childTrunk.segments.length).toBeGreaterThanOrEqual(2);
    for (const segment of [...calloutTrunk.segments, ...childTrunk.segments]) {
      expect(segment.start.x).toBe(segment.end.x);
    }
    expect(calloutTrunk.segments[0]!.end.y).toBeCloseTo(result.geometry.contentHeightPx, 6);
    expect(childTrunk.segments[0]!.end.y).toBeCloseTo(result.geometry.contentHeightPx, 6);

    for (const pageEdges of edgePages) {
      for (const candidate of pageEdges) {
        if (candidate.role !== 'primary') continue;
        expect(candidate.direction === 'same-page' || candidate.direction === 'trunk').toBe(
          true,
        );
        expect(candidate.targetPage).toBeNull();
        expect(candidate.label).toBeUndefined();
      }
    }
  });

  it('continues two B2 below trunks across pages and keeps nested groups independent', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 420, min: 160 },
        c1: { max: 120, min: 60, height: 260 },
        c2: { max: 120, min: 60, height: 600 },
        k1: { max: 160, min: 80, height: 220 },
        k2: { max: 200, min: 100, height: 220 },
        nc: { max: 120, min: 60, height: 120 },
        ng: { max: 160, min: 80, height: 120 },
      },
      [
        { from: 'root', to: 'c1', anchorId: 'a1' },
        { from: 'root', to: 'c2', anchorId: 'a3' },
        { from: 'root', to: 'k1' },
        { from: 'root', to: 'k2' },
        { from: 'k1', to: 'nc', anchorId: 'a2' },
        { from: 'k1', to: 'ng' },
      ],
      {
        root: [
          { anchorId: 'a1', x: 20 },
          { anchorId: 'a3', x: 40 },
        ],
        k1: [{ anchorId: 'a2', x: 20 }],
      },
    );
    const result = layout(document, port, A5_PORTRAIT);
    const pages = paginate(result, document);
    expect(pages.pageCount).toBeGreaterThanOrEqual(2);
    const model = buildPageEdgeModel(result, pages.pages);
    const flat = model.edges.flat();
    const calloutArm = flat.find((candidate) => candidate.branchId === 'e01')!;
    const childArm = flat.find((candidate) => candidate.branchId === 'e03')!;
    const nestedCallout = flat.find((candidate) => candidate.branchId === 'e05')!;

    expect(calloutArm.trunk!.id).toBe('root:below:callout');
    expect(childArm.trunk!.id).toBe('root:below:child');
    expect(nestedCallout.trunk!.id).toBe('k1:right');
    expect(nestedCallout.trunk!.id).not.toBe(calloutArm.trunk!.id);
    expect(nestedCallout.trunk!.id).not.toBe(childArm.trunk!.id);
    expect(calloutArm.trunk!.segments.length).toBeGreaterThanOrEqual(2);
    expect(childArm.trunk!.segments.length).toBeGreaterThanOrEqual(2);
    // The two trunks stay distinct on every page that carries both.
    for (const pageTrunks of model.trunks) {
      const b2 = pageTrunks.filter((view) => view.trunk.trunkGroup !== null);
      if (b2.length === 2) {
        expect(b2[0]!.trunk.id).not.toBe(b2[1]!.trunk.id);
        expect(b2[0]!.trunk.x).not.toBe(b2[1]!.trunk.x);
      }
    }
  });
});
