import { describe, expect, it } from 'vitest';
import {
  blockRect,
  clearGap,
  DEFAULT_LAYOUT_OPTIONS,
  layoutDocument,
  overlaps,
  type AnchorRecord,
  type BlockMeasurement,
  type BranchRecord,
  type ContentBlock,
  type LayoutOptions,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
  type PagePacking,
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
    // A synthetic anchor must resolve in core: each id is one unique, marked
    // text run. The stub measurement supplies the geometry.
    const children = [{ type: 'text', text: blockId } as const];
    for (const anchor of anchors[blockId] ?? []) {
      children.push({
        type: 'text',
        text: ` ${anchor.anchorId} `,
        marks: [{ type: 'anchor', attrs: { anchorIds: [anchor.anchorId] } }],
      } as unknown as (typeof children)[number]);
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
      id: 'synthetic-page-packing',
      title: 'Synthetic page packing',
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
  pagePacking: PagePacking,
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

function assertNoOverlaps(layoutResult: ReturnType<typeof layout>): void {
  const blocks = layoutResult.blocks.filter((block) => block.width > 0 && block.height > 0);
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i]!;
      const b = blocks[j]!;
      expect(overlaps(blockRect(a), blockRect(b)), `${a.blockId} overlaps ${b.blockId}`).toBe(false);
    }
  }
}

function signature(layoutResult: ReturnType<typeof layout>): string[] {
  return layoutResult.blocks.map((block) =>
    [
      block.blockId,
      block.x.toFixed(3),
      block.y.toFixed(3),
      block.width.toFixed(3),
      block.height.toFixed(3),
    ].join(':'),
  );
}

describe('page packing: beside', () => {
  it('keeps callouts below the parent and starts direct children at the parent y', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 200 },
        callout: { max: 120, min: 60 },
        child: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
      ],
      { root: [{ anchorId: 'a1', x: 60 }] },
    );
    const result = layout(document, port, 'beside');
    const root = result.blockById['root']!;
    const callout = result.blockById['callout']!;
    const child = result.blockById['child']!;
    const gap = DEFAULT_LAYOUT_OPTIONS.siblingGap;

    expect(root.width).toBe(
      400 + 2 * (DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder),
    );
    // The anchor is far enough left to keep the aligned callout x.
    expect(callout.x).toBe(root.x + DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder + 60);
    expect(callout.y).toBe(root.y + root.height + DEFAULT_LAYOUT_OPTIONS.calloutGap);
    expect(child.x).toBe(root.x + root.width + gap);
    expect(child.y).toBe(root.y);
    expect(callout.x + callout.width + gap).toBeLessThanOrEqual(child.x + 0.001);
    expect(overlaps(blockRect(callout), blockRect(child))).toBe(false);
    expect(overlaps(blockRect(root), blockRect(child))).toBe(false);
    expect(overlaps(blockRect(root), blockRect(callout))).toBe(false);
    assertNoOverlaps(result);
  });

  it('clamps a far-right anchor to the parent content edge and keeps the connector', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 200 },
        callout: { max: 120, min: 60 },
        child: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
      ],
      { root: [{ anchorId: 'a1', x: 380 }] },
    );
    const result = layout(document, port, 'beside');
    const root = result.blockById['root']!;
    const callout = result.blockById['callout']!;
    const attachment = result.anchors.find((anchor) => anchor.anchorId === 'a1')!;
    const contentLeft =
      root.x + DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder;

    expect(attachment.rect).not.toBeNull();
    expect(attachment.rect!.x).toBe(contentLeft + 380);
    // The clamped callout then takes the shared below-row indent (26 px) so the
    // R2f below trunk has room for a full left stem; its own anchor connector
    // still starts at the resolved anchor.
    expect(callout.x).toBe(contentLeft + 26);
    expect(callout.x + callout.width).toBeLessThanOrEqual(root.x + root.width + 0.001);
    // The primary edge still starts at the resolved anchor, not the clamped card.
    const edge = result.edges.find((candidate) => candidate.branchId === 'e01')!;
    expect(edge.from.x).toBeCloseTo(attachment.rect!.x + attachment.rect!.width, 6);
    expect(overlaps(blockRect(callout), blockRect(root))).toBe(false);
    assertNoOverlaps(result);
  });

  it('falls back to the stacked order when a callout cannot fit the left lane', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 160, min: 160 },
        callout: { max: 420, min: 300 },
        child: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
      ],
      { root: [{ anchorId: 'a1', x: 20 }] },
    );
    const result = layout(document, port, 'beside');
    const root = result.blockById['root']!;
    const callout = result.blockById['callout']!;
    const child = result.blockById['child']!;

    // The callout keeps the full page band, because the block uses stacked
    // order rather than clipping the callout into the narrow parent lane.
    expect(callout.width).toBeGreaterThan(root.width);
    expect(callout.y).toBeGreaterThanOrEqual(root.y + root.height);
    expect(child.y).toBeGreaterThanOrEqual(callout.subtreeBottom + DEFAULT_LAYOUT_OPTIONS.calloutGap);
    expect(child.x).toBe(root.x + root.width + DEFAULT_LAYOUT_OPTIONS.siblingGap);
    assertNoOverlaps(result);
  });

  it('applies beside recursively inside the right column', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 200 },
        rootCallout: { max: 120, min: 60 },
        child: { max: 300, min: 120 },
        childCallout: { max: 120, min: 60 },
        grandChild: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'rootCallout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
        { from: 'child', to: 'childCallout', anchorId: 'a2' },
        { from: 'child', to: 'grandChild' },
      ],
      {
        root: [{ anchorId: 'a1', x: 40 }],
        child: [{ anchorId: 'a2', x: 40 }],
      },
    );
    const result = layout(document, port, 'beside');
    const root = result.blockById['root']!;
    const rootCallout = result.blockById['rootCallout']!;
    const child = result.blockById['child']!;
    const childCallout = result.blockById['childCallout']!;
    const grandChild = result.blockById['grandChild']!;
    const gap = DEFAULT_LAYOUT_OPTIONS.siblingGap;

    expect(child.y).toBe(root.y);
    expect(childCallout.y).toBe(child.y + child.height + DEFAULT_LAYOUT_OPTIONS.calloutGap);
    expect(grandChild.x).toBe(child.x + child.width + gap);
    expect(grandChild.y).toBe(child.y);
    expect(childCallout.x + childCallout.width + gap).toBeLessThanOrEqual(grandChild.x + 0.001);
    expect(rootCallout.x + rootCallout.width + gap).toBeLessThanOrEqual(child.x + 0.001);
    assertNoOverlaps(result);
  });

  it('keeps the ADR-0006 group wrap when the direct-child group does not fit', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 200 },
        callout: { max: 120, min: 60 },
        wideChild: { max: 900, min: 700 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'wideChild' },
      ],
      { root: [{ anchorId: 'a1', x: 40 }] },
    );
    const result = layout(document, port, 'beside');
    const root = result.blockById['root']!;
    const callout = result.blockById['callout']!;
    const child = result.blockById['wideChild']!;
    const wrapX = Math.min(
      root.x + 26,
      DEFAULT_LAYOUT_OPTIONS.maxWrapIndent,
    );

    expect(child.x).toBe(wrapX);
    expect(child.y).toBeGreaterThanOrEqual(callout.subtreeBottom + DEFAULT_LAYOUT_OPTIONS.calloutGap);
    expect(callout.x).toBe(root.x + DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder + 40);
    assertNoOverlaps(result);
  });

  it('wraps the whole direct-child group when a grandchild subtree does not fit right', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 200, height: 40 },
        // Tall enough that a left-origin wrap would collide with it.
        callout: { max: 120, min: 60, height: 600 },
        child: { max: 200, min: 120, height: 40 },
        wrappedGrandChild: { max: 900, min: 100 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
        { from: 'child', to: 'wrappedGrandChild' },
      ],
      { root: [{ anchorId: 'a1', x: 40 }] },
    );
    const result = layout(document, port, 'beside');
    const root = result.blockById['root']!;
    const callout = result.blockById['callout']!;
    const child = result.blockById['child']!;
    const grandChild = result.blockById['wrappedGrandChild']!;
    const indent = DEFAULT_LAYOUT_OPTIONS.childIndent;
    const gap = DEFAULT_LAYOUT_OPTIONS.siblingGap;

    // R2i: the child card fits the right column, but its grandchild subtree
    // does not, so the atomic direct-child group moves below the parent at the
    // child indent. The block then uses the stacked callout order.
    expect(child.x).toBe(root.x + indent);
    expect(child.y).toBeGreaterThanOrEqual(callout.subtreeBottom + DEFAULT_LAYOUT_OPTIONS.calloutGap);
    expect(callout.x).toBe(
      root.x + DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder + 40,
    );
    // From the new origin the grandchild fits beside its parent.
    expect(grandChild.x).toBe(child.x + child.width + gap);
    expect(grandChild.y).toBe(child.y);
    expect(overlaps(blockRect(callout), blockRect(child))).toBe(false);
    expect(overlaps(blockRect(child), blockRect(grandChild))).toBe(false);
    assertNoOverlaps(result);
  });

  it('keeps widths content-driven and never exceeds the callout lane', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 200 },
        narrowCallout: { max: 200, min: 60 },
        child: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'narrowCallout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
      ],
      { root: [{ anchorId: 'a1', x: 40 }] },
    );
    const result = layout(document, port, 'beside');
    const root = result.blockById['root']!;
    const callout = result.blockById['narrowCallout']!;
    const chrome = 2 * (DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder);

    expect(callout.width).toBe(200 + chrome);
    expect(callout.width).toBeLessThan(root.width);
    expect(callout.x + callout.width).toBeLessThanOrEqual(root.x + root.width + 0.001);
  });

  it('is deterministic and keeps every pair overlap-free', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 200 },
        c1: { max: 120, min: 60 },
        c2: { max: 140, min: 60 },
        child: { max: 300, min: 120 },
        nested: { max: 160, min: 80 },
        nestedCallout: { max: 100, min: 60 },
      },
      [
        { from: 'root', to: 'c1', anchorId: 'a1' },
        { from: 'root', to: 'c2', anchorId: 'a2' },
        { from: 'root', to: 'child' },
        { from: 'child', to: 'nestedCallout', anchorId: 'a3' },
        { from: 'child', to: 'nested' },
      ],
      {
        root: [
          { anchorId: 'a1', x: 40 },
          { anchorId: 'a2', x: 120 },
        ],
        child: [{ anchorId: 'a3', x: 40 }],
      },
    );
    const first = layout(document, port, 'beside');
    const second = layout(document, port, 'beside');
    expect(signature(second)).toEqual(signature(first));
    assertNoOverlaps(first);
    const root = first.blockById['root']!;
    for (const calloutId of ['c1', 'c2']) {
      const callout = first.blockById[calloutId]!;
      expect(callout.x + callout.width + DEFAULT_LAYOUT_OPTIONS.siblingGap).toBeLessThanOrEqual(
        first.blockById['child']!.x + 0.001,
      );
      expect(callout.y).toBeGreaterThanOrEqual(root.y + root.height);
    }
  });

  it('leaves stacked as the default and unchanged', () => {
    expect(DEFAULT_LAYOUT_OPTIONS.pagePacking).toBe('stacked');
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 200 },
        callout: { max: 120, min: 60 },
        child: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
      ],
      { root: [{ anchorId: 'a1', x: 40 }] },
    );
    const implicit = layout(document, port, 'stacked');
    const explicit = layoutDocument(document, port, {}, PACKING_SETUP, anchorViewFor(document));
    expect(signature(explicit)).toEqual(signature(implicit));
    const child = implicit.blockById['child']!;
    const callout = implicit.blockById['callout']!;
    expect(child.y).toBeGreaterThanOrEqual(callout.subtreeBottom + DEFAULT_LAYOUT_OPTIONS.calloutGap);
  });

  it('matches the stacked geometry when a block has no callouts or no children', () => {
    const direct = makeDocument(
      {
        root: { max: 400, min: 200 },
        child: { max: 160, min: 80 },
      },
      [{ from: 'root', to: 'child' }],
    );
    expect(signature(layout(direct.document, direct.port, 'beside'))).toEqual(
      signature(layout(direct.document, direct.port, 'stacked')),
    );

    const calloutsOnly = makeDocument(
      {
        root: { max: 400, min: 200 },
        callout: { max: 120, min: 60 },
      },
      [{ from: 'root', to: 'callout', anchorId: 'a1' }],
      { root: [{ anchorId: 'a1', x: 40 }] },
    );
    expect(signature(layout(calloutsOnly.document, calloutsOnly.port, 'beside'))).toEqual(
      signature(layout(calloutsOnly.document, calloutsOnly.port, 'stacked')),
    );
  });

  it('keeps the 16 px horizontal safe gap between the callout lane and the right group', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 420, min: 200 },
        callout: { max: 600, min: 60 },
        child: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'child' },
      ],
      { root: [{ anchorId: 'a1', x: 40 }] },
    );
    const result = layout(document, port, 'beside', {
      // The in-row corridor is horizontal and the callout gap is vertical; both
      // axes keep their old 16/12 px geometry.
      rightGroupGap: 16,
      calloutGap: 12,
    });
    const root = result.blockById['root']!;
    const callout = result.blockById['callout']!;
    const child = result.blockById['child']!;
    expect(child.x).toBe(root.x + root.width + 16);
    expect(clearGap(blockRect(callout), blockRect(child))).toBeGreaterThanOrEqual(16);
    expect(callout.y).toBe(root.y + root.height + 12);
  });

  it('places a duplicate anchored target only once in beside order', () => {
    const { document, port } = makeDocument(
      {
        root: { max: 400, min: 200 },
        callout: { max: 120, min: 60 },
        child: { max: 160, min: 80 },
      },
      [
        { from: 'root', to: 'callout', anchorId: 'a1' },
        { from: 'root', to: 'callout', anchorId: 'a2' },
        { from: 'root', to: 'child' },
      ],
      {
        root: [
          { anchorId: 'a1', x: 20 },
          { anchorId: 'a2', x: 60 },
        ],
      },
    );
    const result = layout(document, port, 'beside');
    expect(result.blocks.filter((block) => block.blockId === 'callout')).toHaveLength(1);
    expect(
      result.defects.some(
        (defect) => defect.code === 'duplicate-primary' && defect.blockId === 'callout',
      ),
    ).toBe(true);
    assertNoOverlaps(result);
  });
});
