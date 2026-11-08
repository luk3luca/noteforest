import { describe, expect, it } from 'vitest';
import {
  buildPageEdges,
  type ContinuousLayout,
  type DerivedPage,
  type NoteDocument,
  type PageFragment,
  type PaginatedDocument,
} from '@noteforest/layout';
import { buildPrintModel } from '../src/printModel.js';

const BOUNDS = { width: 1000, height: 700 };

function fragment(blockId: string, x: number, y: number, width = 100, height = 80): PageFragment {
  return {
    blockId,
    chapterId: 'chapter-1',
    role: 'child',
    depth: 1,
    source: { x, y, width, height },
    page: { x, y, width, height },
    startSegment: 0,
    endSegment: 0,
    isFirst: true,
    isLast: true,
    isPageStart: true,
    continuesToPage: null,
    continuedFromPage: null,
  };
}

function page(pageNumber: number, fragments: PageFragment[]): DerivedPage {
  return {
    pageNumber,
    chapterId: 'chapter-1',
    chapterIndex: 0,
    chapterTitle: 'Chapter 1',
    yStart: 0,
    yEnd: BOUNDS.height,
    isChapterStart: pageNumber === 1,
    fragments,
    continuationOut: [],
    continuationIn: [],
    overflow: false,
  };
}

const layout = {
  documentId: 'print-route-fixture',
  title: 'Print route fixture',
  pageSetup: {
    size: 'A4',
    orientation: 'landscape',
    margins: { top: 12, right: 12, bottom: 12, left: 12 },
  },
  geometry: {
    pageWidthMm: 297,
    pageHeightMm: 210,
    pageWidthPx: 1122.52,
    pageHeightPx: 793.7,
    contentWidthPx: BOUNDS.width,
    contentHeightPx: BOUNDS.height,
    marginsPx: { top: 45.35, right: 45.35, bottom: 45.35, left: 45.35 },
  },
  chapters: [
    {
      id: 'chapter-1',
      title: 'Chapter 1',
      index: 0,
      topLevelBlockIds: ['source'],
      height: BOUNDS.height,
    },
  ],
  blocks: [],
  blockById: {},
  anchors: [],
  edges: [
    {
      branchId: 'b-direct',
      role: 'primary' as const,
      fromBlockId: 'source',
      toBlockId: 'middle',
      anchorId: null,
      chapterId: 'chapter-1',
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      crossChapter: false,
    },
    {
      branchId: 'b-later',
      role: 'primary' as const,
      fromBlockId: 'source',
      toBlockId: 'later',
      anchorId: null,
      chapterId: 'chapter-1',
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      crossChapter: false,
    },
    {
      branchId: 'b-cross',
      role: 'primary' as const,
      fromBlockId: 'source',
      toBlockId: 'next-page',
      anchorId: null,
      chapterId: 'chapter-1',
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      crossChapter: false,
    },
  ],
  defects: [],
  measurementCalls: 0,
} as unknown as ContinuousLayout;

const pages = [
  page(1, [
    fragment('source', 0, 0, 140, 80),
    fragment('middle', 156, 0, 150, 100),
    fragment('later', 322, 0, 150, 100),
  ]),
  page(2, [fragment('next-page', 50, 0)]),
];
const paginated = { pages, pageCount: 2, defects: [], manualBreakWarnings: [] } as unknown as PaginatedDocument;
const document = { id: 'print-route-fixture' } as NoteDocument;

describe('print model page routes', () => {
  it('consumes the same shared page routes as Page Read/Edit', () => {
    const model = buildPrintModel(document, layout, paginated);
    const shared = buildPageEdges(layout, pages);
    for (const [index, printPage] of model.pages.entries()) {
      expect(printPage.edges).toEqual(shared[index]);
      for (const edge of printPage.edges) {
        expect(edge.route.points.length).toBeGreaterThanOrEqual(2);
        expect(edge.route.tip).toEqual(edge.route.points.at(-1));
      }
    }
    const later = model.pages[0]!.edges.find((edge) => edge.branchId === 'b-later')!;
    expect(later.route.blocked).toBe(false);
    expect(later.route.entry).toBe('left');
    // Never behind the earlier sibling card.
    const middle = pages[0]!.fragments.find((item) => item.blockId === 'middle')!.page;
    for (let index = 1; index < later.route.points.length; index += 1) {
      const start = later.route.points[index - 1]!;
      const end = later.route.points[index]!;
      const horizontal = Math.abs(start.y - end.y) < 0.001;
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const top = Math.min(start.y, end.y);
      const bottom = Math.max(start.y, end.y);
      const hits = horizontal
        ? top > middle.y + 0.01 &&
          top < middle.y + middle.height - 0.01 &&
          right > middle.x + 0.01 &&
          left < middle.x + middle.width - 0.01
        : left > middle.x + 0.01 &&
          left < middle.x + middle.width - 0.01 &&
          bottom > middle.y + 0.01 &&
          top < middle.y + middle.height - 0.01;
      expect(hits).toBe(false);
    }
    const crossOut = model.pages[0]!.edges.find((edge) => edge.branchId === 'b-cross')!;
    const crossIn = model.pages[1]!.edges.find((edge) => edge.branchId === 'b-cross')!;
    expect(crossOut.direction).toBe('to-edge');
    expect(crossOut.targetPage).toBe(2);
    expect(crossOut.route.points).toEqual([crossOut.from, crossOut.to]);
    expect(crossIn.direction).toBe('from-edge');
    expect(crossIn.targetPage).toBe(1);
    expect(crossIn.route.points).toEqual([crossIn.from, crossIn.to]);
  });
});
