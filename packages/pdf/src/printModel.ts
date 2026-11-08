import {
  buildPageEdgeModel,
  type ContinuationIn,
  type ContinuationOut,
  type ContinuousLayout,
  type LayoutDefect,
  type NoteDocument,
  type PageEdge,
  type PageEdgeDirection,
  type PageEdgeTrunkView,
  type PageFragment,
  type PageGeometry,
  type PageSetup,
  type PaginatedDocument,
} from '@noteforest/layout';

export type PrintEdgeDirection = PageEdgeDirection;
export type PrintEdge = PageEdge;

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
  /** Group-trunk segments for this page, including pass-through pages. */
  trunks: PageEdgeTrunkView[];
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

export function buildPrintModel(
  document: NoteDocument,
  layout: ContinuousLayout,
  paginated: PaginatedDocument,
): PrintModel {
  // One edge mapper is shared with the Page renderer (`buildPageEdgeModel`),
  // so the print compositor cannot drift onto a second page-edge router. It
  // consumes the same group trunks and page-local segments, including
  // pass-through pages with no child of a parent group.
  const edgeModel = buildPageEdgeModel(layout, paginated.pages);
  const pages: PrintPage[] = paginated.pages.map((page, index) => ({
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
    edges: edgeModel.edges[index] ?? [],
    trunks: edgeModel.trunks[index] ?? [],
  }));

  const pageNumberByBlock: Record<string, number> = {};
  for (const page of pages) {
    for (const fragment of page.fragments) {
      if (pageNumberByBlock[fragment.blockId] === undefined) {
        pageNumberByBlock[fragment.blockId] = page.pageNumber;
      }
    }
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
