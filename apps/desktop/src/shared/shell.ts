/**
 * Shell geometry shared by the renderer store and the main-process session
 * parser. One source for the sidebar width contract: the renderer clamps live
 * drags and the session loader clamps a persisted width with the same values.
 *
 * `sidebarWidth` is the **content** width, never the rendered card. The card is
 * the activity bar plus the content column (S1); only the bar survives a
 * collapse, so the collapsed card is exactly `ACTIVITY_BAR_WIDTH`.
 */
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 640;
/** Default width and the double-click reset target. */
export const SIDEBAR_SNAP_WIDTH = 264;
/** Leading activity-bar column: 48 in both the expanded and the collapsed card. */
export const ACTIVITY_BAR_WIDTH = 48;

/** Clamp a content width to the contract range. */
export function clampSidebarContentWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_SNAP_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)));
}

/** Rendered sidebar card for one persisted content width. */
export function sidebarPanelWidth(contentWidth: number): number {
  return clampSidebarContentWidth(contentWidth) + ACTIVITY_BAR_WIDTH;
}

/** Persisted content width for one rendered sidebar card width. */
export function sidebarContentWidth(panelWidth: number): number {
  return Math.round(panelWidth) - ACTIVITY_BAR_WIDTH;
}
