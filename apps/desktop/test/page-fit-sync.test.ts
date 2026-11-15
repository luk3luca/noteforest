import { describe, expect, it } from 'vitest';
import { fitZoomToSync } from '../src/renderer/src/page/fit-sync';

/**
 * S2.2 Page fit-sync race (regression for `PageView` around the fit → manual
 * zoom sequence). The PageView effect is a passive effect: when ⇧2 (fit width)
 * is followed by ⌘0 (actual, 100%), the pending `width` run must not write its
 * own effective zoom over the newer manual value.
 */
describe('page fit sync', () => {
  it('never writes a fit that a newer manual zoom replaced', () => {
    // The reported sequence: the closure still says `width`, the live store is
    // already `none` at 100%. The stale effective zoom must be dropped.
    expect(
      fitZoomToSync({ pageFit: 'none', pageZoom: 1 }, 'width', 0.82),
    ).toBeNull();
    expect(
      fitZoomToSync({ pageFit: 'page', pageZoom: 1 }, 'width', 0.82),
    ).toBeNull();
  });

  it('writes the effective fit zoom while that fit still owns the surface', () => {
    expect(fitZoomToSync({ pageFit: 'width', pageZoom: 1 }, 'width', 0.82)).toBe(0.82);
    expect(fitZoomToSync({ pageFit: 'page', pageZoom: 1 }, 'page', 0.61)).toBe(0.61);
    // A restored session may have no view entry yet: the default is fit page.
    expect(fitZoomToSync(undefined, 'page', 0.61)).toBe(0.61);
  });

  it('writes nothing when the manual zoom already matches or is manual', () => {
    expect(fitZoomToSync({ pageFit: 'width', pageZoom: 0.82 }, 'width', 0.82)).toBeNull();
    expect(fitZoomToSync({ pageFit: 'width', pageZoom: 0.9 }, 'width', 0.9004)).toBeNull();
    expect(fitZoomToSync({ pageFit: 'none', pageZoom: 1.4 }, 'none', 1)).toBeNull();
  });
});
