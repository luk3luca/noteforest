/**
 * Shell geometry shared by the renderer store and the main-process session
 * parser. One source for the sidebar width contract: the renderer clamps live
 * drags and the session loader clamps a persisted width with the same values.
 */
export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 640;
/** Default width and the double-click reset target. */
export const SIDEBAR_SNAP_WIDTH = 264;
