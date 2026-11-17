/**
 * Page as a scroll of pages (PG1).
 *
 * Pure geometry for the one-column surface: the page scale the user sees, the
 * seam, where a page starts in the scroll content, which page owns the centre
 * of the viewport, and which pages must be mounted. No React, no DOM reads:
 * `PageView` measures the viewport and the toolbars render the result.
 *
 * The percentage is fit-relative, not a raw CSS factor: 100 % is "the page is
 * as wide as the viewport" and is the rest state. Below 100 % the paper shrinks
 * with margins on both sides; above it the paper is wider than the viewport and
 * the surface scrolls horizontally. The page model, the page count, the page
 * chrome and the PDF never see this value.
 */

import type { PageFit } from '../../../shared/view-state';

/** Pages touch; a 1 px rule in `--nf-page-rule` is the only separation. */
export const PAGE_SEAM_PX = 1;

/** Reading window: the pages that fit plus this many on each side. */
export const PAGE_OVERSCAN = 2;

export const PAGE_ZOOM_MIN = 0.5;
export const PAGE_ZOOM_MAX = 2;

/** Manual page zoom in the ratified 50 %–200 % range, rounded to 1 %. */
export function clampPageSurfaceZoom(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.round(Math.min(PAGE_ZOOM_MAX, Math.max(PAGE_ZOOM_MIN, number)) * 100) / 100;
}

export interface PageSurfaceMetrics {
  /** CSS scale of the sheet (layout px → screen px). */
  scale: number;
  /** Fit-relative percentage shown by the zoom control and the sheet. */
  percent: number;
  /** Equal margins when the paper is narrower than the viewport. */
  gutter: number;
}

export interface PageSurfaceInput {
  /** Viewport content box (excludes the reserved scrollbar gutter). */
  viewportWidth: number;
  viewportHeight: number;
  pageWidthPx: number;
  pageHeightPx: number;
  fit: PageFit;
  /** Manual zoom, only read when `fit` is `none`. */
  zoom: number;
  padTop: number;
  padBottom: number;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * One resolved scale for the whole column.
 *
 * `width` is the rest state and always reads 100 %. `page` fits the whole
 * sheet in the viewport and therefore reads less than 100 % whenever the paper
 * is taller than the viewport. `none` is the manual zoom, which is a
 * fit-relative percentage too.
 */
export function pageSurfaceMetrics(input: PageSurfaceInput): PageSurfaceMetrics {
  const { viewportWidth, viewportHeight, pageWidthPx, pageHeightPx } = input;
  const fitWidthScale =
    viewportWidth > 0 && pageWidthPx > 0 ? viewportWidth / pageWidthPx : 1;
  let scale = fitWidthScale;
  let percent = 100;
  if (input.fit === 'page') {
    const byHeight =
      viewportHeight > 0 && pageHeightPx > 0
        ? Math.max(0, viewportHeight - input.padTop - input.padBottom) / pageHeightPx
        : fitWidthScale;
    scale = Math.min(fitWidthScale, byHeight);
    percent = fitWidthScale > 0 ? Math.round((scale / fitWidthScale) * 100) : 100;
  } else if (input.fit === 'none') {
    percent = Math.round(clampPageSurfaceZoom(input.zoom) * 100);
    scale = fitWidthScale * (percent / 100);
  }
  const paperWidth = pageWidthPx * scale;
  return {
    scale: round(scale, 5),
    percent,
    gutter: round(Math.max(0, (viewportWidth - paperWidth) / 2), 2),
  };
}

/** Distance from one page start to the next: the sheet plus the seam. */
export function pageStepPx(scale: number, pageHeightPx: number): number {
  return pageHeightPx * scale + PAGE_SEAM_PX;
}

/** Scroll offset that puts the page start at the top of the viewport. */
export function pageStartOffset(index: number, stepPx: number, padTop: number): number {
  return padTop + Math.max(0, index) * stepPx;
}

export interface PageCentreInput {
  scrollTop: number;
  viewportHeight: number;
  stepPx: number;
  pageCount: number;
  padTop: number;
  /** The page the indicator currently shows; a seam tie keeps it. */
  current: number;
}

/**
 * The page whose box contains the centre of the viewport (1-based).
 *
 * A centre that lands on the seam keeps the current page when the current page
 * is one of the two neighbours: scrolling across a boundary never flickers
 * between the two pages that share it. Beyond the last page (a short column at
 * a small zoom) the indicator stays on the last page.
 */
export function pageAtCentre(input: PageCentreInput): number {
  const { pageCount, stepPx } = input;
  if (pageCount <= 0) return 1;
  if (!Number.isFinite(stepPx) || stepPx <= 0) return Math.min(pageCount, Math.max(1, Math.round(input.current)));
  const centre = input.scrollTop + Math.max(0, input.viewportHeight) / 2 - input.padTop;
  if (centre <= 0) return 1;
  const index = Math.floor(centre / stepPx);
  if (index >= pageCount) return pageCount;
  const within = centre - index * stepPx;
  const page = index + 1;
  // The page body is `step - seam` tall; the last pixel row is the rule.
  if (within < stepPx - PAGE_SEAM_PX) return page;
  const next = Math.min(pageCount, page + 1);
  const current = Math.min(pageCount, Math.max(1, Math.round(input.current)));
  return current === page || current === next ? current : next;
}

/** Page numbers to mount (0-based range) for the current scroll position. */
export function visiblePageRange(input: {
  scrollTop: number;
  viewportHeight: number;
  stepPx: number;
  pageCount: number;
  padTop: number;
  overscan?: number;
}): { first: number; last: number } {
  const { pageCount, stepPx } = input;
  if (pageCount <= 0) return { first: 0, last: -1 };
  const overscan = input.overscan ?? PAGE_OVERSCAN;
  if (!Number.isFinite(stepPx) || stepPx <= 0 || input.viewportHeight <= 0) {
    return { first: 0, last: Math.min(pageCount - 1, overscan) };
  }
  const top = input.scrollTop - input.padTop;
  const firstVisible = Math.floor(top / stepPx);
  const lastVisible = Math.floor((top + input.viewportHeight) / stepPx);
  const first = Math.max(0, Math.min(pageCount - 1, firstVisible - overscan));
  const last = Math.max(0, Math.min(pageCount - 1, lastVisible + overscan));
  return last < first ? { first, last: first } : { first, last };
}

/** Clamp one programmatic scroll target to the real scroll range. */
export function clampScrollTop(
  target: number,
  scrollHeight: number,
  viewportHeight: number,
): number {
  const max = Math.max(0, scrollHeight - viewportHeight);
  if (!Number.isFinite(target)) return 0;
  return Math.min(max, Math.max(0, target));
}
