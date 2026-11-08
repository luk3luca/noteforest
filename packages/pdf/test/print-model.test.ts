import { describe, expect, it } from 'vitest';
import {
  buildPageEdgeModel,
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
  page(2, [fragment('next-page', 300, 0)]),
];
const paginated = { pages, pageCount: 2, defects: [], manualBreakWarnings: [] } as unknown as PaginatedDocument;
const document = { id: 'print-route-fixture' } as NoteDocument;

describe('print model page routes', () => {
  it('consumes the same shared page routes and group trunks as Page Read/Edit', () => {
    const model = buildPrintModel(document, layout, paginated);
    const shared = buildPageEdgeModel(layout, pages);
    for (const [index, printPage] of model.pages.entries()) {
      expect(printPage.edges).toEqual(shared.edges[index]);
      expect(printPage.trunks).toEqual(shared.trunks[index]);
      for (const edge of printPage.edges) {
        expect(edge.route.points.length).toBeGreaterThanOrEqual(2);
        expect(edge.route.tip).toEqual(edge.route.points.at(-1));
      }
    }
    const later = model.pages[0]!.edges.find((edge) => edge.branchId === 'b-later')!;
    expect(later.route.blocked).toBe(false);
    expect(later.route.entry).toBe('left');
    // The print model consumes the Page/PDF semantic trunk records, not a
    // second topology: both right-group siblings point at one shared trunk.
    const directEdge = model.pages[0]!.edges.find((edge) => edge.branchId === 'b-direct')!;
    expect(directEdge.placement).toBe('right');
    expect(later.placement).toBe('right');
    expect(directEdge.trunk).not.toBeNull();
    expect(later.trunk).not.toBeNull();
    expect(later.trunk!.id).toBe(directEdge.trunk!.id);
    expect(later.trunk!.x).toBe(directEdge.trunk!.x);
    // The parent page keeps the horizontal lead from the card port to the
    // stable trunk x, then continues to the page bottom because `b-cross` has a
    // child on page 2.
    const parentTrunkView = model.pages[0]!.trunks.find(
      (view) => view.trunk.id === later.trunk!.id,
    )!;
    expect(parentTrunkView).toBeDefined();
    expect(parentTrunkView.segment.lead).toEqual({
      from: later.trunk!.port,
      to: { x: later.trunk!.x, y: later.trunk!.port.y },
    });
    expect(parentTrunkView.segment.end.y).toBe(BOUNDS.height);
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
    // A primary cross-page tree edge has no horizontal indicator: the source
    // page owns the trunk segment and the target page owns the left arm.
    const crossOut = model.pages[0]!.edges.find((edge) => edge.branchId === 'b-cross');
    expect(crossOut).toBeUndefined();
    const crossIn = model.pages[1]!.edges.find((edge) => edge.branchId === 'b-cross')!;
    expect(crossIn.direction).toBe('trunk');
    expect(crossIn.targetPage).toBeNull();
    expect(crossIn.label).toBeUndefined();
    expect(crossIn.from).toEqual({ x: crossIn.trunk!.x, y: 0 });
    const targetTrunkView = model.pages[1]!.trunks.find(
      (view) => view.trunk.id === crossIn.trunk!.id,
    )!;
    expect(targetTrunkView.segment.start).toEqual({ x: crossIn.trunk!.x, y: 0 });
    expect(targetTrunkView.segment.end).toEqual({
      x: crossIn.trunk!.x,
      y: crossIn.to.y,
    });
  });
});
