import type {
  ContinuationIn,
  ContinuationOut,
  ContinuousLayout,
  LayoutDefect,
  NoteDocument,
  PageFragment,
  PageGeometry,
  PageSetup,
  PaginatedDocument,
} from '@noteforest/layout';

export type PrintEdgeDirection = 'same-page' | 'to-edge' | 'from-edge';

export interface PrintEdge {
  branchId: string;
  role: 'primary' | 'reference';
  from: { x: number; y: number };
  to: { x: number; y: number };
  direction: PrintEdgeDirection;
  targetPage: number | null;
  label?: string;
}

export interface PrintPage {
  pageNumber: number;
  chapterId: string;
  yStart: number;
  yEnd: number;
  overflow: boolean;
  chapterTitle: string;
  isChapterStart: boolean;
  fragments: PageFragment[];
  continuationIn: ContinuationIn[];
  continuationOut: ContinuationOut[];
  edges: PrintEdge[];
}

export interface PrintModel {
  documentId: string;
  documentTitle: string;
  pageSetup: PageSetup;
  geometry: PageGeometry;
  pages: PrintPage[];
  pageCount: number;
  pageNumberByBlock: Record<string, number>;
  defects: LayoutDefect[];
}

interface BlockPageLocation {
  page: PrintPage;
  fragment: PageFragment;
}

function fragmentLocations(pages: PrintPage[]): Map<string, BlockPageLocation[]> {
  const map = new Map<string, BlockPageLocation[]>();
  for (const page of pages) {
    for (const fragment of page.fragments) {
      const list = map.get(fragment.blockId) ?? [];
      list.push({ page, fragment });
      map.set(fragment.blockId, list);
    }
  }
  for (const list of map.values()) list.sort((a, b) => a.page.pageNumber - b.page.pageNumber);
  return map;
}

function firstLocation(
  map: Map<string, BlockPageLocation[]>,
  blockId: string,
): BlockPageLocation | undefined {
  return map.get(blockId)?.[0];
}

function locationOnPage(
  map: Map<string, BlockPageLocation[]>,
  blockId: string,
  pageNumber: number,
): BlockPageLocation | undefined {
  return map.get(blockId)?.find((location) => location.page.pageNumber === pageNumber);
}

function fragmentCenter(location: BlockPageLocation, side: 'left' | 'right'): { x: number; y: number } {
  const fragment = location.fragment;
  return {
    x: side === 'left' ? fragment.page.x : fragment.page.x + fragment.page.width,
    y: fragment.page.y + Math.min(fragment.page.height / 2, 60),
  };
}

function edgeLabel(targetPage: number | null): string | undefined {
  return targetPage ? `p.${targetPage}` : undefined;
}

export function buildPrintModel(
  document: NoteDocument,
  layout: ContinuousLayout,
  paginated: PaginatedDocument,
): PrintModel {
  const pages: PrintPage[] = paginated.pages.map((page) => ({
    pageNumber: page.pageNumber,
    chapterId: page.chapterId,
    yStart: page.yStart,
    yEnd: page.yEnd,
    overflow: page.overflow,
    chapterTitle: page.chapterTitle,
    isChapterStart: page.isChapterStart,
    fragments: page.fragments,
    continuationIn: page.continuationIn,
    continuationOut: page.continuationOut,
    edges: [],
  }));
  const locations = fragmentLocations(pages);

  for (const edge of layout.edges) {
    const fromLocation = firstLocation(locations, edge.fromBlockId);
    const toLocation = firstLocation(locations, edge.toBlockId);
    if (!fromLocation || !toLocation) continue;
    const fromPage = fromLocation.page;
    const toPage = toLocation.page;

    if (fromPage.pageNumber === toPage.pageNumber) {
      const page = fromPage;
      const samePageTarget = locationOnPage(locations, edge.toBlockId, page.pageNumber);
      if (!samePageTarget) continue;
      let fromPoint = fragmentCenter({ page, fragment: fromLocation.fragment }, 'right');
      if (edge.anchorId) {
        const anchor = layout.anchors.find(
          (candidate) =>
            candidate.anchorId === edge.anchorId && candidate.blockId === edge.fromBlockId,
        );
        if (anchor?.rect) {
          const pageFragment = locationOnPage(locations, edge.fromBlockId, page.pageNumber);
          const localY = anchor.rect.y - paginated.pages[page.pageNumber - 1]!.yStart;
          if (
            pageFragment &&
            localY >= pageFragment.fragment.page.y - 0.5 &&
            localY <= pageFragment.fragment.page.y + pageFragment.fragment.page.height + 0.5
          ) {
            fromPoint = {
              x: anchor.rect.x + anchor.rect.width,
              y: localY + anchor.rect.height / 2,
            };
          }
        }
      }
      page.edges.push({
        branchId: edge.branchId,
        role: edge.role,
        from: fromPoint,
        to: fragmentCenter(samePageTarget, 'left'),
        direction: 'same-page',
        targetPage: null,
      });
      continue;
    }

    if (edge.role === 'primary') {
      const outPage = fromPage;
      const outLocation = locationOnPage(locations, edge.fromBlockId, outPage.pageNumber);
      if (outLocation) {
        const from = fragmentCenter(outLocation, 'right');
        outPage.edges.push({
          branchId: edge.branchId,
          role: edge.role,
          from,
          to: { x: layout.geometry.contentWidthPx, y: from.y },
          direction: 'to-edge',
          targetPage: toPage.pageNumber,
          label: edgeLabel(toPage.pageNumber),
        });
      }
      const inPage = toPage;
      const inLocation = locationOnPage(locations, edge.toBlockId, inPage.pageNumber);
      if (inLocation) {
        const to = fragmentCenter(inLocation, 'left');
        inPage.edges.push({
          branchId: edge.branchId,
          role: edge.role,
          from: { x: 0, y: to.y },
          to,
          direction: 'from-edge',
          targetPage: fromPage.pageNumber,
          label: edgeLabel(fromPage.pageNumber),
        });
      }
    } else {
      // Reference edges use a page-edge indicator on the target page only.
      const inPage = toPage;
      const inLocation = locationOnPage(locations, edge.toBlockId, inPage.pageNumber);
      if (inLocation) {
        const to = fragmentCenter(inLocation, 'left');
        inPage.edges.push({
          branchId: edge.branchId,
          role: edge.role,
          from: { x: 0, y: to.y },
          to,
          direction: 'from-edge',
          targetPage: fromPage.pageNumber,
          label: edgeLabel(fromPage.pageNumber),
        });
      }
    }
  }

  for (const page of pages) {
    page.edges.sort((a, b) => (a.branchId < b.branchId ? -1 : a.branchId > b.branchId ? 1 : 0));
  }

  const pageNumberByBlock: Record<string, number> = {};
  for (const [blockId, list] of locations) {
    const first = list[0];
    if (first) pageNumberByBlock[blockId] = first.page.pageNumber;
  }


  return {
    documentId: layout.documentId,
    documentTitle: layout.title,
    pageSetup: layout.pageSetup,
    geometry: layout.geometry,
    pages,
    pageCount: pages.length,
    pageNumberByBlock,
    defects: paginated.defects,
  };
}
