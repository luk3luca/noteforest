/**
 * Page-local edge mapping shared by the Page renderer and the PDF print model.
 *
 * This is the single router for page arrows: the continuous layout already
 * decides which blocks are related, and this module only projects those edges
 * onto the paginator's derived pages. It never re-layouts, re-paginates, or
 * consults view state.
 *
 * Rules (unchanged from the Spike 1 print model):
 * - same-page edges run from the source fragment's right edge (or the resolved
 *   anchor rectangle) to the target fragment's left edge;
 * - cross-page primary edges get a `to-edge` indicator on the source page and a
 *   `from-edge` indicator on the target page;
 * - cross-page reference edges only get a `from-edge` indicator on the target
 *   page, because the print model never draws a line through a page margin.
 */

import type {
  ContinuousLayout,
  DerivedPage,
  PageFragment,
} from './types.js';

export type PageEdgeDirection = 'same-page' | 'to-edge' | 'from-edge';

export interface PageEdgePoint {
  x: number;
  y: number;
}

export interface PageEdge {
  branchId: string;
  role: 'primary' | 'reference';
  fromBlockId: string;
  toBlockId: string;
  from: PageEdgePoint;
  to: PageEdgePoint;
  direction: PageEdgeDirection;
  /** The page on the other side of a cross-page indicator (1-based). */
  targetPage: number | null;
  /** Short print label (`p.N`) used by the PDF compositor. */
  label?: string;
  /** Canonical branch label or anchor quote, when one is present. */
  branchLabel?: string;
  anchorId?: string;
}

interface BlockPageLocation {
  page: DerivedPage;
  fragment: PageFragment;
}

function fragmentLocations(pages: readonly DerivedPage[]): Map<string, BlockPageLocation[]> {
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

function fragmentCenter(
  location: BlockPageLocation,
  side: 'left' | 'right',
): PageEdgePoint {
  const fragment = location.fragment;
  return {
    x: side === 'left' ? fragment.page.x : fragment.page.x + fragment.page.width,
    y: fragment.page.y + Math.min(fragment.page.height / 2, 60),
  };
}

function edgeLabel(targetPage: number | null): string | undefined {
  return targetPage ? `p.${targetPage}` : undefined;
}

function edgePages(pages: readonly DerivedPage[]): PageEdge[][] {
  return pages.map(() => []);
}

function edgesForPage(result: PageEdge[][], page: DerivedPage): PageEdge[] {
  return result[page.pageNumber - 1] ?? [];
}

/**
 * Project every branch onto the derived page list.
 *
 * The returned array is aligned with `pages` (index = pageNumber - 1); each
 * page list is stable-sorted by branch id so the DOM stays deterministic.
 */
export function buildPageEdges(
  layout: ContinuousLayout,
  pages: readonly DerivedPage[],
): PageEdge[][] {
  const result = edgePages(pages);
  const locations = fragmentLocations(pages);

  for (const edge of layout.edges) {
    const fromLocation = firstLocation(locations, edge.fromBlockId);
    const toLocation = firstLocation(locations, edge.toBlockId);
    if (!fromLocation || !toLocation) continue;
    const fromPage = fromLocation.page;
    const toPage = toLocation.page;
    const base = {
      branchId: edge.branchId,
      role: edge.role,
      fromBlockId: edge.fromBlockId,
      toBlockId: edge.toBlockId,
      ...(edge.label === undefined ? {} : { branchLabel: edge.label }),
      ...(edge.anchorId === null ? {} : { anchorId: edge.anchorId }),
    };

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
          const localY = anchor.rect.y - page.yStart;
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
      edgesForPage(result, page).push({
        ...base,
        from: fromPoint,
        to: fragmentCenter(samePageTarget, 'left'),
        direction: 'same-page',
        targetPage: null,
      });
      continue;
    }

    if (edge.role === 'primary') {
      const outLocation = locationOnPage(locations, edge.fromBlockId, fromPage.pageNumber);
      if (outLocation) {
        const from = fragmentCenter(outLocation, 'right');
        edgesForPage(result, fromPage).push({
          ...base,
          from,
          to: { x: layout.geometry.contentWidthPx, y: from.y },
          direction: 'to-edge',
          targetPage: toPage.pageNumber,
          label: edgeLabel(toPage.pageNumber),
        });
      }
      const inLocation = locationOnPage(locations, edge.toBlockId, toPage.pageNumber);
      if (inLocation) {
        const to = fragmentCenter(inLocation, 'left');
        edgesForPage(result, toPage).push({
          ...base,
          from: { x: 0, y: to.y },
          to,
          direction: 'from-edge',
          targetPage: fromPage.pageNumber,
          label: edgeLabel(fromPage.pageNumber),
        });
      }
      continue;
    }

    // Reference edges use a page-edge indicator on the target page only.
    const inLocation = locationOnPage(locations, edge.toBlockId, toPage.pageNumber);
    if (inLocation) {
      const to = fragmentCenter(inLocation, 'left');
      edgesForPage(result, toPage).push({
        ...base,
        from: { x: 0, y: to.y },
        to,
        direction: 'from-edge',
        targetPage: fromPage.pageNumber,
        label: edgeLabel(fromPage.pageNumber),
      });
    }
  }

  for (const pageEdges of result) {
    pageEdges.sort((a, b) => (a.branchId < b.branchId ? -1 : a.branchId > b.branchId ? 1 : 0));
  }
  return result;
}
