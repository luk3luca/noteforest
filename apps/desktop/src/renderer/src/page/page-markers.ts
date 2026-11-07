/**
 * Continuous page-break marker derivation (M4b1c).
 *
 * Markers are a pure projection of the paginator output used by the Page
 * layout and the future PDF. They are hints: the continuous editor never
 * computes page breaks, never re-paginates with CSS, and never claims pixel
 * parity with the exact page geometry.
 *
 * Derivation rules:
 * - one page-start marker per derived page that begins at a block boundary
 *   (`isFirst && isPageStart`); two side-by-side blocks at the same page top
 *   still produce one marker, anchored to the first block in reading order;
 * - one continuation chip per block that continues (`continuesToPage`), even
 *   when the block spans more than two pages; every target page is kept so the
 *   label is honest;
 * - a block that starts a page and also continues gets both a page-start
 *   marker and a continuation chip (different marker kinds, not a duplicate).
 */

import type { DerivedPage } from '@noteforest/layout';

export interface PageStartMarker {
  kind: 'page-start';
  blockId: string;
  /** 1-based derived page that starts before this block. */
  pageNumber: number;
}

export interface PageContinuationMarker {
  kind: 'continuation';
  blockId: string;
  /** First page this block continues on (1-based). */
  pageNumber: number;
  /** Every page this block continues on, ascending, deduplicated. */
  pages: readonly number[];
}

export type PageBreakMarker = PageStartMarker | PageContinuationMarker;

export interface PageBreakMarkerSet {
  pageStarts: readonly PageStartMarker[];
  continuations: readonly PageContinuationMarker[];
  /** Rendered marker count: page starts plus continuation chips. */
  count: number;
}

export function pageStartLabel(pageNumber: number): string {
  return `Page ${pageNumber} starts here`;
}

export function continuationLabel(pages: readonly number[]): string {
  if (pages.length === 0) return 'Continues';
  if (pages.length === 1) return `Continues on page ${pages[0]}`;
  const first = pages[0] ?? 1;
  const last = pages[pages.length - 1] ?? first;
  const contiguous = pages.every((page, index) => index === 0 || page === (pages[index - 1] ?? 0) + 1);
  if (pages.length > 2 && contiguous) {
    return `Continues on pages ${first}–${last}`;
  }
  return `Continues on pages ${pages.join(', ')}`;
}

export function derivePageBreakMarkers(
  pages: readonly DerivedPage[],
): PageBreakMarkerSet {
  const pageStarts: PageStartMarker[] = [];
  const seenStartPages = new Set<number>();

  for (const page of pages) {
    if (seenStartPages.has(page.pageNumber)) continue;
    // Fragments are sorted in reading order (page.y, page.x, depth, blockId).
    // The first block that actually begins at the page's top edge represents
    // the whole break; a fragment whose top is the page start but that started
    // on an earlier page (in-block continuation) fails `isFirst`.
    const anchor = page.fragments.find(
      (fragment) => fragment.isFirst && fragment.isPageStart,
    );
    if (anchor === undefined) continue;
    seenStartPages.add(page.pageNumber);
    pageStarts.push({
      kind: 'page-start',
      blockId: anchor.blockId,
      pageNumber: page.pageNumber,
    });
  }

  const continuationTargets = new Map<string, number[]>();
  const continuationOrder: string[] = [];
  for (const page of pages) {
    for (const fragment of page.fragments) {
      if (fragment.continuesToPage === null) continue;
      let targets = continuationTargets.get(fragment.blockId);
      if (targets === undefined) {
        targets = [];
        continuationTargets.set(fragment.blockId, targets);
        continuationOrder.push(fragment.blockId);
      }
      if (!targets.includes(fragment.continuesToPage)) {
        targets.push(fragment.continuesToPage);
      }
    }
  }

  const continuations: PageContinuationMarker[] = [];
  for (const blockId of continuationOrder) {
    const targets = continuationTargets.get(blockId) ?? [];
    if (targets.length === 0) continue;
    targets.sort((left, right) => left - right);
    continuations.push({
      kind: 'continuation',
      blockId,
      pageNumber: targets[0] ?? 1,
      pages: [...targets],
    });
  }

  return {
    pageStarts,
    continuations,
    count: pageStarts.length + continuations.length,
  };
}
