/**
 * Fit-sync decision for the Page surface (S2.2).
 *
 * Page keeps one manual `pageZoom` beside the fit mode. The `PageView` effect
 * mirrors the effective fit zoom into that manual zoom so a later ⌘+/⌘− starts
 * from what the user sees. That effect is a passive effect, so it can still be
 * pending when a newer fit lands: ⇧2 sets `width` and ⌘0 immediately replaces
 * it with the manual fit (`none` + 100%). A pending effect that only knew
 * `width` must never write its own fit back — the live fit wins.
 *
 * This module is the pure guard, so the rule is unit-testable without a DOM.
 */

import type { PageFit } from '../../../shared/view-state';

export interface FitSyncLiveState {
  pageFit?: PageFit;
  pageZoom?: number;
}

/** Zoom to write, or null when this effect run must not touch the store. */
export function fitZoomToSync(
  live: FitSyncLiveState | undefined,
  closureFit: PageFit,
  effectiveZoom: number,
): number | null {
  // A manual zoom owns the value; there is nothing to mirror.
  if (closureFit === 'none') return null;
  // The effective fit changed after this effect was created (⇧2 → ⌘0). The
  // newer fit is authoritative.
  if ((live?.pageFit ?? 'page') !== closureFit) return null;
  const current = live?.pageZoom ?? 1;
  return Math.abs(current - effectiveZoom) > 0.001 ? effectiveZoom : null;
}
