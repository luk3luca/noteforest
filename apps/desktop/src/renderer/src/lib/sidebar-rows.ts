/**
 * Sidebar row geometry (`docs/design/sidebar.md` §3 and §5).
 *
 * One row ladder for the four sidebar sections. The CSS owns the heights,
 * radii and type scale as `--sb-*` tokens; the Outline indent is the one value
 * that has to be computed per row, because react-aria's `level` is 1-based and
 * the chapter row is level 0.
 *
 * The depth step is 12 px and it stops after three levels (product-owner
 * decision, 16 November 2026): level 4 and deeper render at the level-3 indent
 * and the chevron carries the rest. The Outline used to step 14 px with no cap,
 * which pushed deep branches out of a 264 px panel.
 */

/** The chapter row's indent: the sidebar's own 6 px lateral inset. */
export const SIDEBAR_ROW_INDENT = 6;

/** Indent added per Outline level. */
export const SIDEBAR_DEPTH_STEP = 12;

/** Levels that add an indent; deeper rows reuse the last one. */
export const SIDEBAR_DEPTH_CAP = 3;

/**
 * `padding-inline-start` for a tree row at react-aria's `level` (1 = the
 * chapter row, 2 = a top-level block, and so on).
 */
export function sidebarDepthIndent(level: number): number {
  const depth = Math.max(0, Math.min(level - 1, SIDEBAR_DEPTH_CAP));
  return SIDEBAR_ROW_INDENT + depth * SIDEBAR_DEPTH_STEP;
}
