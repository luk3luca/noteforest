/**
 * Edge-style contract: one shared numeric language, two surface styles.
 *
 * Continuous and Page/PDF speak the same visual language: the same fixed
 * arrowhead shape rules, the same corner radius, the same minimum stem, and the
 * same orthogonal polyline with rounded corners. This module owns the numbers;
 * the pure path/arrow algorithms live in `edge-path.ts`.
 *
 * Ownership (R6 preparation):
 * - `CONTINUOUS_EDGE_STYLE` is the only style the Continuous renderer reads.
 * - `PAGE_EDGE_STYLE` is the only style Page layout/routing/render/print read.
 * - `EDGE_STYLE` is the shared/base default kept for one release. It is the
 *   default argument of the path helpers, never a surface style: a Page or
 *   print module that reads it would let a future Continuous override drift the
 *   paper. Guard: `packages/layout/test/edge-style-isolation.test.ts`.
 *
 * `page*` entries are route-search values consumed by the Page router only;
 * they never change card placement.
 */

export interface EdgePoint {
  x: number;
  y: number;
}

export type EdgeArrowDirection = 'right' | 'left' | 'down' | 'up';

/**
 * Edge geometry and stroke tokens both surfaces share.
 *
 * Equal values today are a visual contract, not a shared settings namespace:
 * each surface owns its own copy so a future Continuous edge setting cannot
 * change Page Read, Page Edit, or the PDF.
 */
export interface SharedEdgeStyle {
  /** Space kept between the arrow tip and the child's left edge. */
  gap: number;
  /** Near-right-angle corner radius. */
  radius: number;
  /** Minimum final straight run before a fixed arrowhead. */
  stemMin: number;
  /** Shared trunk lane, clamped between these offsets from the parent edge. */
  laneMin: number;
  laneMax: number;
  /** Below-trunk inset from the parent card's left edge. */
  trunkInset: number;
  /** Visible gap between the parent card bottom and a below-trunk start. */
  trunkGap: number;
  /** Fixed arrowhead polygon, independent of path length. */
  arrowLength: number;
  arrowHalfWidth: number;
  edgeWidth: number;
  edgeWidthActive: number;
  edgeWidthMuted: number;
  /** Minimum routed segment gap. */
  minGap: number;
  /** Reference edges use an open chevron one px larger than the primary head. */
  referenceArrowLength: number;
  referenceArrowSpread: number;
}

/** Page-only route-search values on top of the shared edge contract. */
export interface PageEdgeStyle extends SharedEdgeStyle {
  /**
   * Clearance kept between a Page route and a fragment card. The route may run
   * in the sibling gap; it never enters the card box.
   */
  pageClearance: number;
  /** Horizontal lane separation for parallel duplicate page edges. */
  pageLaneStep: number;
  /** Cost of a right-angle turn, in px, for the page route search. */
  pageTurnPenalty: number;
}

/**
 * Page corridor constants (12 November 2026).
 *
 * One invariant for the Page tree: the parent card's right edge to the child
 * card's left edge is exactly 18 px, split as a 4 px lead (the trunk lane) and
 * the 14 px final stem before the fixed 6 x 6 arrowhead. The same 14 px stem is
 * north of every below port: child 12 + 14 = 26, callout 24 + 14 = 38.
 *
 * These are engine constants, not density-scaled settings: the corridor must
 * stay identical at 60/70/100/120% so a density change never moves an arrow.
 * `PageTheme` keeps the matching stored fields for settings compatibility, but
 * `effectivePageTheme`/`pageLayoutOptions` always resolve these values.
 */
export interface PageEdgeGeometry {
  /** Horizontal lead from the parent port to the corridor trunk. */
  lead: number;
  /** Final straight run before the arrowhead. */
  stem: number;
  /** lead + stem: parent card right edge to child card left edge. */
  corridor: number;
  /** Vertical gap between a sibling card bottom and the next card. */
  siblingGap: number;
  /** Wrapped child origin: child trunk inset + stem. */
  childIndent: number;
  /** Callout card origin in mode B2: callout trunk inset + stem. */
  calloutCardIndent: number;
  /** Vertical gap between stacked callout cards. */
  calloutGap: number;
  /** Parent right edge to the mode A callout lane. */
  calloutRightGap: number;
  /** Below-trunk inset for the direct-child group. */
  childTrunkInset: number;
  /** Below-trunk inset for the anchored-callout group. */
  calloutTrunkInset: number;
}

export const PAGE_EDGE_GEOMETRY: PageEdgeGeometry = Object.freeze({
  lead: 4,
  stem: 14,
  corridor: 18,
  siblingGap: 18,
  childIndent: 26,
  calloutCardIndent: 38,
  calloutGap: 16,
  calloutRightGap: 24,
  childTrunkInset: 12,
  calloutTrunkInset: 24,
});

/**
 * Shared/base default (one release). Used as the default argument of the path
 * helpers so existing callers keep their signature; no surface renderer reads it.
 */
export const EDGE_STYLE: PageEdgeStyle = Object.freeze({
  gap: 2,
  radius: 2,
  stemMin: 12,
  laneMin: 2,
  laneMax: 14,
  trunkInset: 12,
  trunkGap: 0,
  arrowLength: 6,
  arrowHalfWidth: 3,
  edgeWidth: 1.25,
  edgeWidthActive: 1.75,
  edgeWidthMuted: 1,
  minGap: 4,
  referenceArrowLength: 7,
  referenceArrowSpread: 0.46,
  pageClearance: 3,
  pageLaneStep: 4,
  pageTurnPenalty: 60,
});

/**
 * The Continuous canvas' edge style.
 *
 * Not frozen: R6 resolves Continuous edge settings into this namespace, and the
 * isolation test temporarily overrides the values to prove Page/PDF output
 * cannot observe them. Production code treats it as read-only.
 */
export const CONTINUOUS_EDGE_STYLE: SharedEdgeStyle = {
  gap: 2,
  radius: 2,
  stemMin: 12,
  laneMin: 2,
  laneMax: 14,
  trunkInset: 12,
  trunkGap: 0,
  arrowLength: 6,
  arrowHalfWidth: 3,
  edgeWidth: 1.25,
  edgeWidthActive: 1.75,
  edgeWidthMuted: 1,
  minGap: 4,
  referenceArrowLength: 7,
  referenceArrowSpread: 0.46,
};

/**
 * The Page Read/Edit and PDF edge style. The only style Page layout, the page
 * router, the Page renderer, and the print model may read.
 *
 * The Page stem is 14 px (the Page corridor in `PAGE_EDGE_GEOMETRY`), while the
 * Continuous canvas keeps its own 12 px stem. Stroke widths and the fixed
 * 6 x 6 arrowhead stay the shared Page contract.
 */
export const PAGE_EDGE_STYLE: PageEdgeStyle = Object.freeze({
  gap: 2,
  radius: 2,
  stemMin: PAGE_EDGE_GEOMETRY.stem,
  laneMin: 2,
  laneMax: 14,
  trunkInset: 12,
  trunkGap: 0,
  arrowLength: 6,
  arrowHalfWidth: 3,
  edgeWidth: 1.25,
  edgeWidthActive: 1.75,
  edgeWidthMuted: 1,
  minGap: 4,
  referenceArrowLength: 7,
  referenceArrowSpread: 0.46,
  pageClearance: 3,
  pageLaneStep: 4,
  pageTurnPenalty: 60,
});
