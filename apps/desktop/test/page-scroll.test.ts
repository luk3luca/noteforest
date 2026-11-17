import { describe, expect, it } from 'vitest';
import {
  PAGE_OVERSCAN,
  PAGE_SEAM_PX,
  PAGE_ZOOM_MAX,
  PAGE_ZOOM_MIN,
  clampPageSurfaceZoom,
  clampScrollTop,
  pageAtCentre,
  pageStartOffset,
  pageStepPx,
  pageSurfaceMetrics,
  visiblePageRange,
} from '../src/renderer/src/page/scroll';
import { clampPageZoom, normalizeDocumentViewState } from '../src/shared/view-state';

/**
 * PG1 pure geometry: one column of touching pages, free scroll, a 1 px seam,
 * and a fit-relative zoom where 100 % is fit width.
 *
 * The old `fitZoomToSync` race (a pending fit write landing over a newer manual
 * zoom) cannot exist any more: the fit no longer writes a derived zoom into the
 * store. The percentage in a fit mode is computed here and published by the
 * surface, so these values are the single source for both the paper and the
 * toolbar.
 */

const A4_LANDSCAPE = { pageWidthPx: 1122.52, pageHeightPx: 793.7 };

function metrics(overrides: Partial<Parameters<typeof pageSurfaceMetrics>[0]> = {}) {
  return pageSurfaceMetrics({
    viewportWidth: 1000,
    viewportHeight: 700,
    ...A4_LANDSCAPE,
    fit: 'width',
    zoom: 1,
    padTop: 14,
    padBottom: 8,
    ...overrides,
  });
}

describe('page surface zoom', () => {
  it('reads 100 % at fit width and fills the viewport exactly', () => {
    const fit = metrics();
    expect(fit.percent).toBe(100);
    expect(fit.scale).toBeCloseTo(1000 / 1122.52, 4);
    expect(fit.gutter).toBe(0);
    expect(1122.52 * fit.scale).toBeCloseTo(1000, 2);
  });

  it('fits the whole sheet below 100 % for the page fit', () => {
    const page = metrics({ fit: 'page' });
    expect(page.percent).toBeLessThan(100);
    expect(793.7 * page.scale).toBeLessThanOrEqual(700 - 14 - 8 + 0.01);
    expect(page.gutter).toBeGreaterThan(0);
  });

  it('keeps the manual zoom in the 50 %–200 % range and centers a small paper', () => {
    expect(metrics({ fit: 'none', zoom: 2 }).percent).toBe(200);
    expect(metrics({ fit: 'none', zoom: 2 }).gutter).toBe(0);
    const half = metrics({ fit: 'none', zoom: 0.5 });
    expect(half.percent).toBe(50);
    expect(half.gutter).toBeCloseTo((1000 - 500) / 2, 2);
    expect(metrics({ fit: 'none', zoom: 9 }).percent).toBe(PAGE_ZOOM_MAX * 100);
    expect(metrics({ fit: 'none', zoom: 0.01 }).percent).toBe(PAGE_ZOOM_MIN * 100);
    expect(clampPageSurfaceZoom(3)).toBe(2);
    expect(clampPageSurfaceZoom(0)).toBe(0.5);
    expect(clampPageZoom(2.5)).toBe(2);
    expect(clampPageZoom(0.1)).toBe(0.5);
  });

  it('opens Page at fit width and keeps a stored fit', () => {
    expect(normalizeDocumentViewState({}).pageFit).toBe('width');
    expect(normalizeDocumentViewState({ pageFit: 'page' }).pageFit).toBe('page');
    expect(normalizeDocumentViewState({ pageFit: 'none' }).pageFit).toBe('none');
    expect(normalizeDocumentViewState({ pageFit: 'front' }).pageFit).toBe('width');
  });

  it('makes the seam part of the column, never a gap in the page', () => {
    const scale = 0.5;
    expect(pageStepPx(scale, 800)).toBe(400 + PAGE_SEAM_PX);
    expect(pageStartOffset(0, 401, 14)).toBe(14);
    expect(pageStartOffset(2, 401, 14)).toBe(14 + 802);
  });
});

describe('page under the viewport centre', () => {
  const input = {
    stepPx: 401,
    pageCount: 10,
    padTop: 14,
    viewportHeight: 400,
  };

  it('names the page whose box contains the centre', () => {
    // scrollTop 0: centre 200 (inside page 1's 400 px body).
    expect(pageAtCentre({ ...input, scrollTop: 0, current: 1 })).toBe(1);
    // Page 2 starts at 14 + 401; its centre row is enough to name it.
    expect(pageAtCentre({ ...input, scrollTop: 415, current: 1 })).toBe(2);
    expect(pageAtCentre({ ...input, scrollTop: 815, current: 2 })).toBe(3);
  });

  it('keeps the current page when the centre lands on the seam', () => {
    // Page 1 body ends at 14 + 400; the seam is the 1 px row after it. A centre
    // in the middle of page 1 needs a 0-height viewport: use an exact tie.
    const tieDown = { ...input, viewportHeight: 772 };
    // centre = scrollTop + 386; page 1 body ends at 414 → centre 414 at scroll 28.
    expect(pageAtCentre({ ...tieDown, scrollTop: 28, current: 1 })).toBe(1);
    expect(pageAtCentre({ ...tieDown, scrollTop: 28, current: 2 })).toBe(2);
    // One pixel later the centre is on page 2's first row.
    expect(pageAtCentre({ ...tieDown, scrollTop: 29, current: 1 })).toBe(2);
    // One pixel earlier the centre is still inside page 1.
    expect(pageAtCentre({ ...tieDown, scrollTop: 27, current: 2 })).toBe(1);
  });

  it('stays on the last page past the end of a short column', () => {
    expect(pageAtCentre({ ...input, scrollTop: 9000, current: 9 })).toBe(10);
    expect(pageAtCentre({ ...input, pageCount: 0, scrollTop: 0, current: 1 })).toBe(1);
  });
});

describe('mounted page window', () => {
  const base = {
    stepPx: 401,
    pageCount: 61,
    padTop: 14,
    viewportHeight: 400,
  };

  it('mounts the visible pages plus two on each side', () => {
    const top = visiblePageRange({ ...base, scrollTop: 0 });
    expect(top.first).toBe(0);
    expect(top.last).toBe(PAGE_OVERSCAN);
    // scrollTop 8020 → pages 20 and 21 are visible → 17..22 mounted.
    const middle = visiblePageRange({ ...base, scrollTop: 401 * 20 });
    expect(middle.first).toBe(17);
    expect(middle.last).toBe(22);
  });

  it('clamps at both ends of the document', () => {
    // scrollTop 24060 → pages 60 and 61 visible → 57..60 mounted.
    const last = visiblePageRange({ ...base, scrollTop: 401 * 60 });
    expect(last.last).toBe(60);
    expect(last.first).toBe(57);
    const empty = visiblePageRange({ ...base, pageCount: 0, scrollTop: 0 });
    expect(empty.last).toBeLessThan(empty.first);
  });

  it('mounts a first window before the viewport is measured', () => {
    const pending = visiblePageRange({ ...base, viewportHeight: 0, scrollTop: 0 });
    expect(pending.first).toBe(0);
    expect(pending.last).toBe(PAGE_OVERSCAN);
  });
});

describe('programmatic page starts', () => {
  it('clamps to the real scroll range', () => {
    expect(clampScrollTop(-10, 5000, 400)).toBe(0);
    expect(clampScrollTop(9999, 5000, 400)).toBe(4600);
    expect(clampScrollTop(401, 5000, 400)).toBe(401);
    expect(clampScrollTop(Number.NaN, 5000, 400)).toBe(0);
  });
});
