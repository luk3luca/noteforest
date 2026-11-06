/**
 * Single source of truth for branch-editor geometry (M3g3).
 *
 * Values are semantic, not per-view: the editor CSS, the lane/right-group
 * placement hook, and the SVG edge router all read the same tokens. Do not
 * re-declare these numbers in components or tests; import them from here (or
 * from `geometry.ts`, which re-exports them as `GEOMETRY`).
 *
 * `rowIndent` and `trunkInset` are measured from the lane's left edge, which is
 * also the parent card's left edge: the callout/direct row and the shared trunk
 * move together when the lane is wider than a narrow parent.
 */

export const DESIGN_TOKENS = Object.freeze({
  /** Shared below-stack row left offset from the lane/parent left edge. */
  rowIndent: 26,
  /** Shared below-stack trunk left offset from the parent card left edge. */
  trunkInset: 12,
  /** Visible gap between the parent card bottom and the below trunk start. */
  trunkGap: 8,
  /** Minimum straight stem before a fixed arrowhead. */
  stemMin: 12,
  /** Gap between a parent card/lane and the direct-child group. */
  siblingGap: 16,
  /** Gap between an anchor mark and its callout row. */
  calloutGap: 16,
  /** Independent callout lane width bounds. */
  calloutMinWidth: 240,
  calloutMaxWidth: 480,
  /**
   * Callout safe zone (M3g3). The callout never starts farther than
   * `maxAnchorOffset` from the parent card left and never ends closer than
   * `safeGap` to the direct-child group. If the remaining zone cannot fit
   * `calloutMinWidth`, direct children wrap below after the callouts.
   */
  callout: Object.freeze({
    maxAnchorOffset: 160,
    safeGap: 16,
  }),
  /** Primary elbows are near-right angles, never wide arcs. */
  edgeRadius: 2,
  /** Space kept between the arrow tip and the child's left edge. */
  edgeGap: 2,
  /** Fixed arrowhead polygon, independent of path length. */
  edgeArrowLength: 6,
  edgeArrowHalfWidth: 3,
  edgeWidth: 1.25,
  edgeWidthActive: 1.75,
  /** Shared trunk lane, clamped between these offsets from the parent edge. */
  edgeLaneMin: 2,
  edgeLaneMax: 14,
  edgeBusOffset: 16,
  edgePortSpacing: 8,
  edgeMinGap: 4,
  /** Block width bounds (cards are content-driven inside them). */
  topLevelMinWidth: 160,
  topLevelMaxWidth: 480,
  childMinWidth: 144,
  childMaxWidth: 420,
  /** Editor canvas. */
  canvasMaxWidth: 1600,
  editorPaddingX: 40,
  editorPaddingTop: 40,
  editorPaddingBottom: 96,
  /** Vertical gaps. */
  childRowGap: 16,
  chapterGap: 32,
  /** Reserved for the M4 page renderer, which may wrap a child below. */
  wrapIndent: 18,
  /** Card chrome. */
  cardRadius: 4,
});

export type DesignTokens = typeof DESIGN_TOKENS;
