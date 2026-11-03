import { describe, expect, it } from 'vitest';
import {
  clearGap,
  createEstimatedMeasurement,
  blockRect,
  layoutDocument,
  overlaps,
  pageGeometry,
  type LayoutBlock,
  type NoteDocument,
} from '../src/index.js';
import { loadFixture, layoutFixture } from './helpers.js';

function layoutOf(document: NoteDocument) {
  return layoutDocument(document, createEstimatedMeasurement(document));
}

function visibleBlocks(layout: ReturnType<typeof layoutOf>): LayoutBlock[] {
  return layout.blocks.filter((block) => block.width > 0 && block.height > 0);
}

describe('adaptive layout', () => {
  it('lays out the golden fixture with no overlaps and a 16 px clear gap', () => {
    const layout = layoutFixture('golden-eigenvalues.json');
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
    const layout = layoutFixture('golden-eigenvalues.json');
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

  it('places some wide-fan children right and others wrapped below with an indent', () => {
    const layout = layoutFixture('wide-fan.json');
    const parent = layout.blockById['f3-parent']!;
    const children = layout.blocks.filter((block) => block.parentBlockId === 'f3-parent');
    const right = children.filter(
      (child) => child.x >= parent.x + parent.width + 20,
    );
    const wrapped = children.filter((child) => Math.abs(child.x - (parent.x + 18)) <= 1.5);
    expect(right.length).toBeGreaterThan(0);
    expect(wrapped.length).toBeGreaterThan(0);
    expect(new Set(layout.blocks.map((block) => Math.round(block.width))).size).toBeGreaterThanOrEqual(3);
    for (const child of children) {
      expect(child.y).toBeGreaterThanOrEqual(parent.y);
    }
  });

  it('lays out a five-level chain with nested anchored callouts', () => {
    const layout = layoutFixture('deep-chain.json');
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

  it('does not move geometry or page breaks when a reference edge is added', () => {
    const document = loadFixture('shared-child.json');
    const baseline = layoutOf(document);
    const modified = structuredClone(document);
    modified.branches['test-reference'] = {
      id: 'test-reference',
      source: { blockId: 'f5-b4' },
      targetBlockId: 'f5-b1',
      role: 'reference',
      order: 'z1',
    };
    const after = layoutOf(modified);
    for (const block of baseline.blocks) {
      const other = after.blockById[block.blockId]!;
      expect(other.x).toBeCloseTo(block.x, 6);
      expect(other.y).toBeCloseTo(block.y, 6);
    }
    const geometry = (layout: ReturnType<typeof layoutOf>) =>
      layout.chapters.map((chapter) => [chapter.id, chapter.height]);
    expect(geometry(after)).toEqual(geometry(baseline));
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
    const portrait = loadFixture('golden-eigenvalues.json');
    const landscape = loadFixture('landscape-golden.json');
    const portraitGeometry = pageGeometry(portrait.pageSetup);
    const landscapeGeometry = pageGeometry(landscape.pageSetup);
    expect(portraitGeometry.pageWidthMm).toBe(210);
    expect(portraitGeometry.pageHeightMm).toBe(297);
    expect(portraitGeometry.contentWidthPx).toBeCloseTo((210 - 40) * (96 / 25.4), 3);
    expect(landscapeGeometry.pageWidthMm).toBe(297);
    expect(landscapeGeometry.pageHeightMm).toBe(210);
    expect(landscapeGeometry.contentWidthPx).toBeCloseTo((297 - 40) * (96 / 25.4), 3);
  });
});
