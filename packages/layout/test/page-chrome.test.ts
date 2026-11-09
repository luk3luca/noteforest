import { describe, expect, it } from 'vitest';
import {
  pageChromeContent,
  pageChromeLayout,
  pageEdgeLabelLayout,
  pageGeometry,
  type DerivedPage,
  type NoteDocument,
  type PageEdge,
  type PageSetup,
} from '../src/index.js';

/**
 * F3: one chrome geometry and one edge-label layout shared by Page Read and
 * print. These values previously lived as magic fractions inside the renderer.
 */

const A4_LANDSCAPE: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};
const A5_STACKED: PageSetup = {
  size: 'A5',
  orientation: 'portrait',
  margins: { top: 46, right: 46, bottom: 46, left: 46 },
};

function edge(overrides: Partial<PageEdge>): PageEdge {
  const from = overrides.from ?? { x: 0, y: 0 };
  const to = overrides.to ?? { x: 10, y: 10 };
  return {
    branchId: 'branch-1',
    role: 'primary',
    fromBlockId: 'a',
    toBlockId: 'b',
    from,
    to,
    direction: 'same-page',
    targetPage: null,
    trunk: null,
    trunkSegment: null,
    route: {
      points: [from, to],
      tip: to,
      direction: 'right',
      entry: 'left',
      stem: 10,
      blocked: false,
    },
    ...overrides,
  };
}

function document(): NoteDocument {
  return {
    schemaVersion: 2,
    id: 'chrome',
    title: 'Chrome fixture',
    blocks: {
      a: {
        id: 'a',
        label: 'Labeled block',
        content: { type: 'doc', children: [] },
      },
      b: {
        id: 'b',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'text', text: 'First unlabeled block text' }],
            },
          ],
        },
      },
    },
    anchors: {},
    branches: {},
    chapters: [{ id: 'chapter-1', title: 'Chapter 1', topLevelBlockIds: ['a', 'b'] }],
    assets: {},
  };
}

function page(): DerivedPage {
  return {
    pageNumber: 2,
    chapterId: 'chapter-1',
    chapterIndex: 0,
    chapterTitle: 'Chapter 1',
    yStart: 100,
    yEnd: 700,
    isChapterStart: false,
    fragments: [],
    continuationOut: [
      { blockId: 'a', fromPage: 2, toPage: 3, startSegment: 0, endSegment: 1 },
    ],
    continuationIn: [
      {
        blockId: 'b',
        fromPage: 1,
        toPage: 2,
        startSegment: 2,
        endSegment: 3,
        ghostParent: {
          parentBlockId: 'a',
          parentLabel: 'Parent label',
          blockLabel: 'Paginator fallback',
          anchorQuote: 'quote',
        },
      },
    ],
    overflow: false,
  };
}

describe('pageChromeLayout', () => {
  it('uses the documented margin fractions for A4 and A5', () => {
    for (const setup of [A4_LANDSCAPE, A5_STACKED]) {
      const geometry = pageGeometry(setup);
      const layout = pageChromeLayout(geometry);
      const margins = geometry.marginsPx;
      expect(layout.left).toBe(margins.left);
      expect(layout.right).toBe(margins.right);
      expect(layout.headerTop).toBeCloseTo(margins.top * 0.3, 10);
      expect(layout.ghostTop).toBeCloseTo(margins.top * 0.62, 10);
      expect(layout.footerBottom).toBeCloseTo(margins.bottom * 0.3, 10);
      expect(layout.continuesBottom).toBeCloseTo(margins.bottom * 0.6, 10);
    }
  });
});

describe('pageChromeContent', () => {
  it('derives the page label, titles, and both continuation lists from the document', () => {
    const content = pageChromeContent({
      document: document(),
      page: page(),
      documentTitle: 'Chrome fixture',
      pageCount: 5,
    });
    expect(content.documentTitle).toBe('Chrome fixture');
    expect(content.chapterTitle).toBe('Chapter 1');
    expect(content.pageLabel).toBe('Page 2 of 5');
    expect(content.continuedFrom).toEqual([
      {
        blockId: 'b',
        fromPage: 1,
        toPage: 2,
        blockLabel: 'Paginator fallback',
        parentLabel: 'Parent label',
        anchorQuote: 'quote',
      },
    ]);
    expect(content.continuesOn).toEqual([
      { blockId: 'a', fromPage: 2, toPage: 3, blockLabel: 'Labeled block' },
    ]);
  });

  it('falls back to the first content text for an unlabeled continuation block', () => {
    const content = pageChromeContent({
      document: document(),
      page: {
        ...page(),
        continuationIn: [],
        continuationOut: [
          { blockId: 'b', fromPage: 2, toPage: 3, startSegment: 0, endSegment: 1 },
        ],
      },
      documentTitle: 'Chrome fixture',
      pageCount: 5,
    });
    expect(content.continuesOn[0]!.blockLabel).toBe('First unlabeled block text');
  });
});

describe('pageEdgeLabelLayout', () => {
  it('places to-edge labels in the right margin and from-edge labels in the left', () => {
    const geometry = pageGeometry(A4_LANDSCAPE);
    const margins = geometry.marginsPx;
    const labels = pageEdgeLabelLayout(
      [
        edge({
          branchId: 'to',
          direction: 'to-edge',
          targetPage: 4,
          from: { x: 900, y: 120 },
          to: { x: 900, y: 120 },
        }),
        edge({
          branchId: 'from',
          direction: 'from-edge',
          targetPage: 2,
          from: { x: 0, y: 80 },
          to: { x: 40, y: 80 },
          role: 'reference',
        }),
        edge({ branchId: 'same', direction: 'same-page' }),
        edge({ branchId: 'missing', direction: 'to-edge', targetPage: null }),
      ],
      geometry,
    );
    expect(labels).toHaveLength(2);
    const to = labels.find((label) => label.edge.branchId === 'to')!;
    expect(to.direction).toBe('to-edge');
    expect(to.text).toBe('→ p.4');
    expect(to.left).toBeNull();
    expect(to.right).toBe(-margins.right + 2);
    expect(to.top).toBe(120);
    expect(to.maxWidth).toBe(Math.max(18, margins.right - 4));
    expect(to.accessibleLabel).toBe('Branch · continues on page 4');

    const from = labels.find((label) => label.edge.branchId === 'from')!;
    expect(from.direction).toBe('from-edge');
    expect(from.text).toBe('← p.2');
    expect(from.left).toBe(-margins.left + 2);
    expect(from.right).toBeNull();
    expect(from.top).toBe(80);
    expect(from.maxWidth).toBe(Math.max(18, margins.left - 4));
    expect(from.accessibleLabel).toBe('Reference · continued from page 2');
  });
});
