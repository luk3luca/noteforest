import { describe, expect, it } from 'vitest';
import {
  clearGap,
  createEstimatedMeasurement,
  DEFAULT_PAGE_SETTINGS,
  blockRect,
  layoutDocument,
  overlaps,
  pageGeometry,
  paginate,
  type LayoutBlock,
  type LayoutOptions,
  type NoteDocument,
  type PageSetup,
} from '../src/index.js';
import { FIXTURE_PAGE_SETUP, loadFixture, layoutFixture } from './helpers.js';

function layoutOf(
  document: NoteDocument,
  options: Partial<LayoutOptions> = {},
  setup: PageSetup = FIXTURE_PAGE_SETUP,
) {
  return layoutDocument(document, createEstimatedMeasurement(document), options, setup);
}

function visibleBlocks(layout: ReturnType<typeof layoutOf>): LayoutBlock[] {
  return layout.blocks.filter((block) => block.width > 0 && block.height > 0);
}

describe('adaptive layout', () => {
  it('lays out the golden fixture with no overlaps and a 16 px clear gap', () => {
    const layout = layoutFixture('golden-eigenvalues.json', { setup: FIXTURE_PAGE_SETUP });
    const blocks = visibleBlocks(layout);
    for (let i = 0; i < blocks.length; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        const a = blocks[i]!;
        const b = blocks[j]!;
        expect(overlaps(blockRect(a), blockRect(b)), `${a.blockId} overlaps ${b.blockId}`).toBe(false);
        expect(
          clearGap(blockRect(a), blockRect(b)),
          `${a.blockId}/${b.blockId} gap`,
        ).toBeGreaterThanOrEqual(16);
      }
    }
    expect(blocks.map((block) => block.blockId)).toEqual(['b1', 'b3', 'b5', 'b2', 'b4']);
    expect(layout.defects).toEqual([]);
  });

  it('aligns anchored callouts to the anchor left edge and below the anchor', () => {
    const layout = layoutFixture('golden-eigenvalues.json', { setup: FIXTURE_PAGE_SETUP });
    for (const blockId of ['b3', 'b5']) {
      const block = layout.blockById[blockId]!;
      const parent = layout.blockById[block.parentBlockId!]!;
      const anchor = layout.anchors.find(
        (candidate) => candidate.anchorId === block.anchorId && candidate.blockId === parent.blockId,
      )!;
      expect(anchor.state).toBe('resolved');
      expect(anchor.rect).not.toBeNull();
      expect(Math.abs(block.x - anchor.rect!.x)).toBeLessThanOrEqual(2);
      expect(block.y).toBeGreaterThanOrEqual(anchor.rect!.y + anchor.rect!.height);
    }
  });

  it('wraps the whole wide-fan group when one child does not fit', () => {
    const layout = layoutFixture('wide-fan.json', { setup: FIXTURE_PAGE_SETUP });
    const parent = layout.blockById['f3-parent']!;
    const children = layout.blocks.filter((block) => block.parentBlockId === 'f3-parent');
    const wrapOrigin = parent.x + 26;
    for (const child of children) {
      expect(Math.abs(child.x - wrapOrigin), `${child.blockId}.x`).toBeLessThanOrEqual(1.5);
      expect(child.y).toBeGreaterThanOrEqual(parent.y + parent.height);
    }
    const ordered = [...children].sort((a, b) => a.y - b.y);
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]!.y).toBeGreaterThanOrEqual(ordered[index - 1]!.subtreeBottom + 24 - 0.25);
    }
    expect(new Set(layout.blocks.map((block) => Math.round(block.width))).size).toBeGreaterThanOrEqual(3);

    // The old right-first policy remains available as the regression oracle:
    // fitting siblings stay right, non-fitting ones wrap at parent.x + 18.
    const oracle = layoutOf(loadFixture('wide-fan.json'), {
      wrapPolicy: 'right-first-per-child',
    });
    const oracleChildren = oracle.blocks.filter((block) => block.parentBlockId === 'f3-parent');
    expect(
      oracleChildren.some((child) => child.x >= parent.x + parent.width + 20),
      'oracle keeps at least one child right',
    ).toBe(true);
    expect(
      oracleChildren.some((child) => Math.abs(child.x - (parent.x + 18)) <= 1.5),
      'oracle wraps at least one child at parent.x + wrapIndent',
    ).toBe(true);
  });

  it('lays out a five-level chain with nested anchored callouts', () => {
    const layout = layoutFixture('deep-chain.json', { setup: FIXTURE_PAGE_SETUP });
    expect(Math.max(...layout.blocks.map((block) => block.depth))).toBe(4);
    const callouts = layout.blocks.filter((block) => block.role === 'callout');
    expect(callouts.map((block) => block.blockId).sort()).toEqual(['f4-c1', 'f4-c2']);
    for (const callout of callouts) {
      const parent = layout.blockById[callout.parentBlockId!]!;
      const anchor = layout.anchors.find(
        (candidate) => candidate.anchorId === callout.anchorId && candidate.blockId === parent.blockId,
      )!;
      expect(anchor.rect).not.toBeNull();
      expect(Math.abs(callout.x - anchor.rect!.x)).toBeLessThanOrEqual(2);
    }
  });

  it('does not move geometry, pages, continuations, or primary edges when reference edges are added', () => {
    const document = loadFixture('shared-child.json');
    const baseline = layoutOf(document);
    const baselinePages = paginate(baseline, document);
    const modified = structuredClone(document);
    modified.branches['test-reference'] = {
      id: 'test-reference',
      source: { blockId: 'f5-b4' },
      targetBlockId: 'f5-b1',
      role: 'reference',
      order: 'z1',
    };
    // Add the reverse direction too: a reference cycle must not recurse or move
    // any block, page, or continuation.
    modified.branches['test-reference-back'] = {
      id: 'test-reference-back',
      source: { blockId: 'f5-b1' },
      targetBlockId: 'f5-b4',
      role: 'reference',
      order: 'z2',
    };
    const after = layoutOf(modified);
    const afterPages = paginate(after, modified);

    expect(after.chapters).toEqual(baseline.chapters);
    expect(after.blocks).toEqual(baseline.blocks);
    expect(after.blockById).toEqual(baseline.blockById);
    expect(after.anchors).toEqual(baseline.anchors);
    expect(after.defects).toEqual(baseline.defects);
    expect(afterPages).toEqual(baselinePages);

    const primaryEdges = (layout: typeof baseline) =>
      layout.edges
        .filter((edge) => edge.role === 'primary')
        .map((edge) => ({ ...edge }));
    expect(primaryEdges(after)).toEqual(primaryEdges(baseline));

    // Only the reference-edge list differs, and reference edges are derived
    // positions, not layout input.
    const referenceEdges = (layout: typeof baseline) =>
      layout.edges.filter((edge) => edge.role === 'reference').map((edge) => edge.branchId);
    expect(referenceEdges(after)).toEqual([
      ...referenceEdges(baseline),
      'test-reference',
      'test-reference-back',
    ].sort((left, right) => (left < right ? -1 : 1)));
  });

  it('keeps an anchored reference out of the callout lane and out of geometry', () => {
    const document = loadFixture('golden-eigenvalues.json');
    const baseline = layoutOf(document);
    const baselinePages = paginate(baseline, document);
    const modified = structuredClone(document);
    modified.branches['test-anchored-reference'] = {
      id: 'test-anchored-reference',
      source: { blockId: 'b5', anchorId: 'a3' },
      targetBlockId: 'b1',
      role: 'reference',
      order: 'z1',
    };
    const after = layoutOf(modified);
    const afterPages = paginate(after, modified);

    expect(after.blocks).toEqual(baseline.blocks);
    expect(after.chapters).toEqual(baseline.chapters);
    expect(after.anchors).toEqual(baseline.anchors);
    expect(afterPages).toEqual(baselinePages);
    const callouts = (layout: typeof baseline) =>
      layout.blocks.filter((block) => block.role === 'callout').map((block) => block.blockId);
    expect(callouts(after)).toEqual(callouts(baseline));
    expect(after.edges.some((edge) => edge.branchId === 'test-anchored-reference')).toBe(true);
  });

  it('lays out 300 blocks without overlaps and deterministically', () => {
    const document = loadFixture('scale-300.json');
    const first = layoutOf(document);
    const second = layoutOf(document);
    expect(first.blocks).toHaveLength(300);
    expect(first.defects).toEqual([]);
    const byChapter = new Map<string, LayoutBlock[]>();
    for (const block of first.blocks) {
      const list = byChapter.get(block.chapterId) ?? [];
      list.push(block);
      byChapter.set(block.chapterId, list);
    }
    for (const blocks of byChapter.values()) {
      for (let i = 0; i < blocks.length; i += 1) {
        for (let j = i + 1; j < blocks.length; j += 1) {
          const a = blocks[i]!;
          const b = blocks[j]!;
          expect(overlaps(blockRect(a), blockRect(b))).toBe(false);
          expect(clearGap(blockRect(a), blockRect(b))).toBeGreaterThanOrEqual(16);
        }
      }
    }
    expect(
      second.blocks.map((block) => [block.blockId, block.x, block.y, block.width, block.height]),
    ).toEqual(first.blocks.map((block) => [block.blockId, block.x, block.y, block.width, block.height]));
  });

  it('uses A4 portrait and landscape content geometry', () => {
    const portraitGeometry = pageGeometry({
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    });
    const landscapeGeometry = pageGeometry({
      size: 'A4',
      orientation: 'landscape',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    });
    expect(portraitGeometry.pageWidthMm).toBe(210);
    expect(portraitGeometry.pageHeightMm).toBe(297);
    expect(portraitGeometry.contentWidthPx).toBeCloseTo((210 - 40) * (96 / 25.4), 3);
    expect(landscapeGeometry.pageWidthMm).toBe(297);
    expect(landscapeGeometry.pageHeightMm).toBe(210);
    expect(landscapeGeometry.contentWidthPx).toBeCloseTo((297 - 40) * (96 / 25.4), 3);
  });

  it('uses the default A4 landscape geometry when no setup is injected', () => {
    const document = loadFixture('golden-eigenvalues.json');
    const layout = layoutDocument(document, createEstimatedMeasurement(document));
    expect(layout.pageSetup).toEqual(DEFAULT_PAGE_SETTINGS.setup);
    expect(layout.geometry.pageWidthMm).toBe(297);
    expect(layout.geometry.pageHeightMm).toBe(210);
    expect(layout.geometry.contentWidthPx).toBeCloseTo((297 - 24) * (96 / 25.4), 3);
  });
});
