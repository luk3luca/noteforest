import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_VIEW,
  type DocumentViewState,
} from '../src/shared/view-state';
import {
  resolveActiveZoom,
  zoomCommandIsValid,
  zoomCommandsForLayout,
} from '../src/renderer/src/lib/view-zoom';

function view(overrides: Partial<DocumentViewState>): DocumentViewState {
  return { ...DEFAULT_DOCUMENT_VIEW, ...overrides };
}

describe('layout-aware zoom target', () => {
  it('reads Continuous zoom only in Continuous and never page zoom', () => {
    expect(
      resolveActiveZoom(
        view({ layout: 'continuous', zoom: 1.3, pageZoom: 0.4, pageFit: 'width' }),
      ),
    ).toEqual({ layout: 'continuous', zoom: 1.3, pageFit: 'page' });
    // Fit page is not a Continuous state; the control still reports a value.
    expect(resolveActiveZoom(null)).toEqual({
      layout: 'continuous',
      zoom: 1,
      pageFit: 'page',
    });
  });

  it('reads page zoom and fit only in Page and never Continuous zoom', () => {
    expect(
      resolveActiveZoom(
        view({ layout: 'page', zoom: 0.7, pageZoom: 1.2, pageFit: 'none' }),
      ),
    ).toEqual({ layout: 'page', zoom: 1.2, pageFit: 'none' });
    expect(
      resolveActiveZoom(view({ layout: 'page', pageZoom: 0.8, pageFit: 'width' })),
    ).toEqual({ layout: 'page', zoom: 0.8, pageFit: 'width' });
  });

  it('offers Fit page only in Page', () => {
    expect(zoomCommandsForLayout('continuous')).toEqual(['actual', 'fit-width']);
    expect(zoomCommandsForLayout('page')).toEqual(['actual', 'fit-page', 'fit-width']);
    expect(zoomCommandIsValid('continuous', 'fit-page')).toBe(false);
    expect(zoomCommandIsValid('page', 'fit-page')).toBe(true);
    expect(zoomCommandIsValid('continuous', 'fit-width')).toBe(true);
    expect(zoomCommandIsValid('page', 'actual')).toBe(true);
  });
});
