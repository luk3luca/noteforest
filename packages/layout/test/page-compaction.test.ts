import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  blockRect,
  clearGap,
  createEstimatedMeasurement,
  DEFAULT_LAYOUT_OPTIONS,
  layoutDocument,
  overlaps,
  paginate,
  type BlockMeasurement,
  type BranchRecord,
  type ContentBlock,
  type ContentNode,
  type LayoutOptions,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
  type PagePacking,
  type PageSetup,
} from '../src/index.js';
import { anchorViewFor, FIXTURES } from './helpers.js';

const PACKING_SETUP: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

const CHROME = 2 * (DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder);
const GAP = DEFAULT_LAYOUT_OPTIONS.siblingGap;

interface StubSpec {
  max: number;
  min: number;
  height?: number;
  segments?: number;
  anchorAt?: number;
  anchorId?: string;
}

interface StubBranch {
  from: string;
  to: string;
  anchorId?: string;
  role?: 'primary' | 'reference';
}

function stubMeasurement(specs: Record<string, StubSpec>): MeasurementPort {
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
      const segmentCount = spec.segments ?? 1;
      const segmentHeight = contentHeight / segmentCount;
      const contentTop = DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder;
      return {
        blockId: block.id,
        mode,
        cardWidth: contentWidth + CHROME,
        contentWidth,
        contentHeight,
        contentTop,
        labelHeight: 0,
        cardHeight: contentTop + contentHeight + DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder,
        maxContentWidth: spec.max,
        minContentWidth: spec.min,
        inlineFormulaWidth: 0,
        segments: Array.from({ length: segmentCount }, (_, index) => ({
          index,
          kind: 'paragraph' as const,
          nodePath: [index],
          y: index * segmentHeight,
          height: segmentHeight,
          breakableBefore: index > 0,
        })),
        anchors:
          spec.anchorId !== undefined && spec.anchorAt !== undefined
            ? [
                {
                  anchorId: spec.anchorId,
                  x: spec.anchorAt,
                  y: 0,
                  width: 24,
                  height: 10,
                  occurrence: 0,
                },
              ]
            : [],
        tableColumns: {},
        missingAssetIds: [],
      };
    },
  };
}

function makeDocument(
  specs: Record<string, StubSpec>,
  branches: StubBranch[],
  options: { topLevel?: string[]; id?: string } = {},
): { document: NoteDocument; port: MeasurementPort } {
  const blocks: Record<string, ContentBlock> = {};
  for (const [blockId, spec] of Object.entries(specs)) {
    // A synthetic anchor must resolve in core: one unique, marked text run.
    const children: ContentNode[] = [{ type: 'text', text: blockId }];
    if (spec.anchorId !== undefined) {
      children.push({
        type: 'text',
        text: ` ${spec.anchorId} `,
        marks: [{ type: 'anchor', attrs: { anchorIds: [spec.anchorId] } }],
      });
    }
    blocks[blockId] = {
      id: blockId,
      content: { type: 'doc', children: [{ type: 'paragraph', children }] },
    };
  }
  const branchRecords: Record<string, BranchRecord> = {};
  branches.forEach((branch, index) => {
    const id = `e${String(index + 1).padStart(2, '0')}`;
    branchRecords[id] = {
      id,
      source: {
        blockId: branch.from,
        ...(branch.anchorId === undefined ? {} : { anchorId: branch.anchorId }),
      },
      targetBlockId: branch.to,
      role: branch.role ?? 'primary',
      order: id,
    };
  });
  const anchorRecords: Record<string, { id: string; blockId: string; kind: 'text'; selector: { kind: 'text'; quote: string }; quote: string }> = {};
  for (const [blockId, spec] of Object.entries(specs)) {
    if (spec.anchorId !== undefined) {
      anchorRecords[spec.anchorId] = {
        id: spec.anchorId,
        blockId,
        kind: 'text',
        selector: { kind: 'text', quote: spec.anchorId },
        quote: spec.anchorId,
      };
    }
  }
  const primaryTargets = new Set(
    branches.filter((branch) => (branch.role ?? 'primary') === 'primary').map((branch) => branch.to),
  );
  const topLevel =
    options.topLevel ??
    Object.keys(specs).filter((blockId) => !primaryTargets.has(blockId));
  return {
    document: {
      schemaVersion: 2,
      id: options.id ?? 'synthetic-page-compaction',
      title: 'Synthetic page compaction',
      blocks,
      anchors: anchorRecords,
      branches: branchRecords,
      chapters: [{ id: 'ch1', title: 'Chapter', topLevelBlockIds: topLevel }],
      assets: {},
    },
    port: stubMeasurement(specs),
  };
}

function layout(
  document: NoteDocument,
  port: MeasurementPort,
  pagePacking: PagePacking = 'compaction',
  overrides: Partial<LayoutOptions> = {},
) {
  return layoutDocument(
    document,
    port,
    { ...DEFAULT_LAYOUT_OPTIONS, pagePacking, ...overrides },
    PACKING_SETUP,
      anchorViewFor(document),
  );
}

function assertNoOverlaps(result: ReturnType<typeof layout>): void {
  const byChapter = new Map<string, typeof result.blocks>();
  for (const block of result.blocks) {
    const list = byChapter.get(block.chapterId) ?? [];
    list.push(block);
    byChapter.set(block.chapterId, list);
  }
  for (const blocks of byChapter.values()) {
    const visible = blocks.filter((block) => block.width > 0 && block.height > 0);
    for (let i = 0; i < visible.length; i += 1) {
      for (let j = i + 1; j < visible.length; j += 1) {
        const a = visible[i]!;
        const b = visible[j]!;
        expect(overlaps(blockRect(a), blockRect(b)), `${a.blockId} overlaps ${b.blockId}`).toBe(
          false,
        );
      }
    }
  }
}

function signature(result: ReturnType<typeof layout>): string[] {
  return result.blocks.map((block) =>
    [
      block.blockId,
      block.x.toFixed(3),
      block.y.toFixed(3),
      block.width.toFixed(3),
      block.height.toFixed(3),
      block.subtreeBottom.toFixed(3),
    ].join(':'),
  );
}

function cardWidth(spec: StubSpec): number {
  const wanted = Math.max(
    DEFAULT_LAYOUT_OPTIONS.minContentWidth,
    Math.min(spec.max, DEFAULT_LAYOUT_OPTIONS.maxContentWidth),
  );
  return wanted + CHROME;
}

/** A 186 px card: the compact readable minimum. */
const SMALL = { max: 120, min: 40 };
const SMALL_WIDTH = cardWidth(SMALL);

describe('page compaction: rows and columns', () => {
  it('fills one row with a parent and its ordered leaf components', () => {
    const { document, port } = makeDocument(
      {
        root: SMALL,
        c1: SMALL,
        c2: SMALL,
        c3: SMALL,
        c4: SMALL,
      },
      [
        { from: 'root', to: 'c1' },
        { from: 'root', to: 'c2' },
        { from: 'root', to: 'c3' },
        { from: 'root', to: 'c4' },
      ],
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    expect(root.x).toBe(0);
    expect(root.y).toBe(0);
    expect(root.width).toBe(SMALL_WIDTH);
    const children = ['c1', 'c2', 'c3', 'c4'].map((id) => result.blockById[id]!);
    for (const [index, child] of children.entries()) {
      expect(child.x, `${child.blockId} x`).toBeCloseTo(SMALL_WIDTH + GAP + index * (SMALL_WIDTH + GAP), 3);
      expect(child.y, `${child.blockId} shares the row top`).toBe(root.y);
      expect(child.width).toBe(SMALL_WIDTH);
    }
    assertNoOverlaps(result);
  });

  it('wraps the overflow component to one indented row below the tallest row subtree', () => {
    const { document, port } = makeDocument(
      {
        root: SMALL,
        c1: SMALL,
        c2: SMALL,
        c3: SMALL,
        c4: SMALL,
        c5: SMALL,
        c6: SMALL,
      },
      [
        { from: 'root', to: 'c1' },
        { from: 'root', to: 'c2' },
        { from: 'root', to: 'c3' },
        { from: 'root', to: 'c4' },
        { from: 'root', to: 'c5' },
        { from: 'root', to: 'c6' },
      ],
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const rowOne = ['c1', 'c2', 'c3', 'c4'].map((id) => result.blockById[id]!);
    for (const child of rowOne) expect(child.y).toBe(root.y);
    const rowTwo = ['c5', 'c6'].map((id) => result.blockById[id]!);
    const rowTop = Math.max(...rowOne.map((child) => child.subtreeBottom)) + GAP;
    for (const child of rowTwo) {
      expect(child.y, `${child.blockId} wrapped below the row`).toBeCloseTo(rowTop, 3);
    }
    expect(rowTwo[0]!.x, 'the first wrapped component starts at one indent').toBe(
      DEFAULT_LAYOUT_OPTIONS.wrapIndent,
    );
    expect(rowTwo[1]!.x).toBeCloseTo(
      DEFAULT_LAYOUT_OPTIONS.wrapIndent + SMALL_WIDTH + GAP,
      3,
    );
    expect(rowTwo[1]!.y).toBe(rowTwo[0]!.y);
    assertNoOverlaps(result);
  });

  it('reserves a subtree column so a later sibling never collides with recursion', () => {
    const { document, port } = makeDocument(
      {
        root: SMALL,
        child: SMALL,
        grandchild: SMALL,
        sibling: SMALL,
      },
      [
        { from: 'root', to: 'child' },
        { from: 'child', to: 'grandchild' },
        { from: 'root', to: 'sibling' },
      ],
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const child = result.blockById['child']!;
    const grandchild = result.blockById['grandchild']!;
    const sibling = result.blockById['sibling']!;

    expect(child.x).toBe(root.width + GAP);
    expect(grandchild.x).toBe(child.x + child.width + GAP);
    expect(grandchild.y).toBe(child.y);
    // The sibling starts after the whole child subtree, not after the card.
    expect(sibling.x).toBe(grandchild.x + grandchild.width + GAP);
    expect(sibling.y).toBe(root.y);
    expect(clearGap(blockRect(grandchild), blockRect(sibling))).toBeGreaterThanOrEqual(GAP - 0.001);
    assertNoOverlaps(result);
  });

  it('falls back to a lower row when a component cannot fit the right column', () => {
    const { document, port } = makeDocument(
      {
        root: SMALL,
        mid: SMALL,
        wide: { max: 900, min: 500 },
        sibling: SMALL,
      },
      [
        { from: 'root', to: 'mid' },
        { from: 'mid', to: 'wide' },
        { from: 'root', to: 'sibling' },
      ],
    );
    const result = layout(document, port);
    const mid = result.blockById['mid']!;
    const wide = result.blockById['wide']!;
    const sibling = result.blockById['sibling']!;
    expect(sibling.y).toBe(mid.y);
    expect(wide.x).toBeCloseTo(mid.x + DEFAULT_LAYOUT_OPTIONS.wrapIndent, 3);
    expect(wide.y).toBeGreaterThanOrEqual(mid.y + mid.height + DEFAULT_LAYOUT_OPTIONS.siblingGap);
    expect(result.defects.some((defect) => defect.code === 'content-too-wide')).toBe(false);
    assertNoOverlaps(result);
  });

  it('keeps widths content-driven instead of fixed columns', () => {
    const wide = { max: 400, min: 40 };
    const { document, port } = makeDocument(
      { root: SMALL, narrow: SMALL, wide },
      [
        { from: 'root', to: 'narrow' },
        { from: 'root', to: 'wide' },
      ],
    );
    const result = layout(document, port);
    const narrowBlock = result.blockById['narrow']!;
    const wideBlock = result.blockById['wide']!;
    expect(narrowBlock.width).toBe(SMALL_WIDTH);
    expect(wideBlock.width).toBe(cardWidth(wide));
    expect(wideBlock.x).toBe(narrowBlock.x + narrowBlock.width + GAP);
    expect(wideBlock.width).not.toBe(narrowBlock.width);
    assertNoOverlaps(result);
  });
});

describe('page compaction: components and order', () => {
  it('places anchored callouts first and direct children after them in one row', () => {
    const { document, port } = makeDocument(
      {
        root: { ...SMALL, anchorId: 'a1', anchorAt: 60 },
        callout: SMALL,
        child: SMALL,
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
      ],
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const callout = result.blockById['callout']!;
    const child = result.blockById['child']!;

    expect(callout.role).toBe('callout');
    expect(callout.anchorId).toBe('a1');
    expect(child.role).toBe('child');
    expect(callout.x).toBe(root.width + GAP);
    expect(child.x).toBe(callout.x + callout.width + GAP);
    expect(callout.y).toBe(root.y);
    expect(child.y).toBe(root.y);

    const attachment = result.anchors.find((anchor) => anchor.anchorId === 'a1')!;
    expect(attachment.rect).not.toBeNull();
    const edge = result.edges.find((candidate) => candidate.toBlockId === 'callout')!;
    expect(edge.role).toBe('primary');
    expect(edge.from.x).toBeCloseTo(attachment.rect!.x + attachment.rect!.width, 6);
    expect(edge.to.x).toBe(callout.x);
    assertNoOverlaps(result);
  });

  it('keeps row-major placement order equal to the canonical component order', () => {
    const { document, port } = makeDocument(
      {
        root: { ...SMALL, anchorId: 'a1', anchorAt: 20 },
        callout: SMALL,
        child: SMALL,
        grandchild: SMALL,
      },
      [
        { from: 'root', to: 'child' },
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'child', to: 'grandchild' },
      ],
    );
    const result = layout(document, port);
    const positions = ['root', 'callout', 'child', 'grandchild'].map(
      (blockId) => result.blockById[blockId]!,
    );
    const rowMajor = [...positions].sort((a, b) =>
      a.y !== b.y ? a.y - b.y : a.x - b.x,
    );
    expect(rowMajor.map((block) => block.blockId)).toEqual([
      'root',
      'callout',
      'child',
      'grandchild',
    ]);
    expect(result.blockById['root']!.childIds).toEqual(['callout', 'child']);
  });

  it('does not turn reference targets into layout components', () => {
    const { document, port } = makeDocument(
      {
        root: SMALL,
        home: SMALL,
        other: SMALL,
      },
      [
        { from: 'root', to: 'home' },
        { from: 'other', to: 'home', role: 'reference' },
      ],
      { topLevel: ['root', 'other'] },
    );
    const result = layout(document, port);
    const homes = result.blocks.filter((block) => block.blockId === 'home');
    expect(homes).toHaveLength(1);
    const home = homes[0]!;
    expect(home.parentBlockId).toBe('root');
    expect(result.blockById['other']!.childIds).toEqual([]);
    expect(home.x).toBe(result.blockById['root']!.width + GAP);
    const reference = result.edges.find((edge) => edge.toBlockId === 'home' && edge.fromBlockId === 'other');
    expect(reference?.role).toBe('reference');
    assertNoOverlaps(result);
  });

  it('is deterministic for the same document and options', () => {
    const { document, port } = makeDocument(
      {
        root: { ...SMALL, anchorId: 'a1', anchorAt: 30 },
        callout: SMALL,
        c1: SMALL,
        c2: SMALL,
        nested: SMALL,
        nestedChild: SMALL,
      },
      [
        { from: 'root', to: 'c1' },
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'c2' },
        { from: 'c1', to: 'nested' },
        { from: 'nested', to: 'nestedChild' },
      ],
    );
    const first = layout(document, port);
    const second = layout(document, port);
    expect(signature(second)).toEqual(signature(first));
    assertNoOverlaps(first);
  });
});

describe('page compaction: pagination and safety', () => {
  it('leaves a too-tall component to the paginator safe boundaries without clipping', () => {
    const { document, port } = makeDocument(
      {
        root: SMALL,
        tall: { max: 160, min: 40, height: 1200, segments: 12 },
        sibling: SMALL,
      },
      [
        { from: 'root', to: 'tall' },
        { from: 'root', to: 'sibling' },
      ],
    );
    const result = layout(document, port);
    expect(result.blocks.some((block) => block.blockId === 'tall')).toBe(true);
    const pages = paginate(result, document);
    expect(pages.pageCount).toBeGreaterThan(1);
    expect(pages.defects.some((defect) => defect.code === 'no-safe-break')).toBe(false);
    const fragments = pages.pages
      .flatMap((page) => page.fragments.filter((fragment) => fragment.blockId === 'tall'))
      .sort((a, b) => (a.continuedFromPage ?? 0) - (b.continuedFromPage ?? 0));
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments[0]!.startSegment).toBe(0);
    expect(fragments[fragments.length - 1]!.endSegment).toBe(12);
    for (let index = 1; index < fragments.length; index += 1) {
      expect(fragments[index]!.startSegment).toBe(fragments[index - 1]!.endSegment);
    }
  });

  it('wraps below a full-width parent instead of forcing a zero-width column', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 900, min: 800 },
        child: SMALL,
      },
      [{ from: 'root', to: 'child' }],
    );
    const result = layout(document, port);
    const root = result.blockById['root']!;
    const child = result.blockById['child']!;
    // The root card fills the page band; the child must wrap below it rather
    // than start a zero-width column inside the margin.
    expect(child.x).toBe(DEFAULT_LAYOUT_OPTIONS.wrapIndent);
    expect(child.y).toBeGreaterThanOrEqual(root.y + root.height);
    expect(overlaps(blockRect(root), blockRect(child))).toBe(false);
    assertNoOverlaps(result);
  });

  it('keeps top-level blocks stacked (two-column top-level packing is out of scope)', () => {
    const { document, port } = makeDocument(
      { first: SMALL, second: SMALL },
      [],
      { topLevel: ['first', 'second'] },
    );
    const result = layout(document, port);
    const first = result.blockById['first']!;
    const second = result.blockById['second']!;
    expect(first.x).toBe(0);
    expect(second.x).toBe(0);
    expect(second.y).toBeGreaterThanOrEqual(first.subtreeBottom + DEFAULT_LAYOUT_OPTIONS.chapterGap);
    assertNoOverlaps(result);
  });

  it('keeps stacked and beside as reference policies', () => {
    expect(DEFAULT_LAYOUT_OPTIONS.pagePacking).toBe('stacked');
    const { document, port } = makeDocument(
      {
        root: SMALL,
        callout: SMALL,
        child: SMALL,
        grandchild: SMALL,
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
        { from: 'child', to: 'grandchild' },
      ],
    );
    const stacked = layout(document, port, 'stacked');
    const beside = layout(document, port, 'beside');
    const compaction = layout(document, port, 'compaction');
    expect(signature(beside)).not.toEqual(signature(stacked));
    expect(signature(compaction)).not.toEqual(signature(beside));
    expect(compaction.blockById['child']!.y).toBe(compaction.blockById['root']!.y);
    expect(compaction.blockById['callout']!.y).toBe(compaction.blockById['root']!.y);
    assertNoOverlaps(stacked);
    assertNoOverlaps(beside);
    assertNoOverlaps(compaction);
  });
});

describe('page compaction: committed fixtures', () => {
  const compactOptions: LayoutOptions = {
    ...DEFAULT_LAYOUT_OPTIONS,
    pagePacking: 'compaction',
    minContentWidth: 160,
    maxContentWidth: 420,
    siblingGap: 16,
    // The compaction row mixes axes: the in-row gap is horizontal, the row top
    // is vertical, so the oracle pins both to its historical 16 px.
    rightGroupGap: 16,
    wrapIndent: 12,
    maxWrapIndent: 36,
    calloutGap: 12,
    cardPadding: 8,
    cardBorder: 1,
    segmentGap: 4,
  };

  function loadFixture(name: string): NoteDocument {
    return JSON.parse(readFileSync(resolve(FIXTURES, name), 'utf8')) as NoteDocument;
  }

  it('keeps scale-300 deterministic and overlap-free', () => {
    const document = loadFixture('scale-300.json');
    const first = layoutDocument(
      document,
      createEstimatedMeasurement(document),
      compactOptions,
      PACKING_SETUP,
        anchorViewFor(document),
    );
    const second = layoutDocument(
      document,
      createEstimatedMeasurement(document),
      compactOptions,
      PACKING_SETUP,
        anchorViewFor(document),
    );
    expect(signature(second)).toEqual(signature(first));
    assertNoOverlaps(first);
    expect(first.blocks).toHaveLength(300);
    expect(first.defects).toEqual([]);
    const pages = paginate(first, document);
    expect(pages.pageCount).toBeGreaterThan(0);
    expect(pages.defects.filter((defect) => defect.blocksExport)).toEqual([]);
  });

  it('packs a wide fan into more shared rows than beside', () => {
    const document = loadFixture('wide-fan.json');
    const compaction = layoutDocument(
      document,
      createEstimatedMeasurement(document),
      compactOptions,
      PACKING_SETUP,
        anchorViewFor(document),
    );
    const beside = layoutDocument(
      document,
      createEstimatedMeasurement(document),
      { ...compactOptions, pagePacking: 'beside' },
      PACKING_SETUP,
        anchorViewFor(document),
    );
    assertNoOverlaps(compaction);
    assertNoOverlaps(beside);
    expect(compaction.blocks.filter((block) => block.role === 'child').length).toBe(10);
    const parent = compaction.blockById['f3-parent']!;
    const sharedRow = (layoutResult: typeof compaction) =>
      layoutResult.blocks.filter(
        (block) =>
          block.role === 'child' &&
          Math.abs(block.y - (layoutResult.blockById['f3-parent']?.y ?? -1)) < 0.5,
      ).length;
    expect(sharedRow(compaction)).toBeGreaterThan(sharedRow(beside));
    expect(sharedRow(compaction)).toBeGreaterThanOrEqual(2);
    expect(parent).toBeDefined();
  });
});
