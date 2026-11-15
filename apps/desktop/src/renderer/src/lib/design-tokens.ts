/**
 * Single source of truth for branch-editor geometry (M3g3).
 *
 * Values are semantic, not per-view: the editor CSS, the lane/right-group
 * placement hook, and the SVG edge router all read the same tokens. Do not
 * re-declare these numbers in components or tests; import them from here (or
 * from `geometry.ts`, which re-exports them as `GEOMETRY`).
 *
 * CSS-bound values are also exported as `DESIGN_TOKEN_CSS_VARIABLES` and
 * applied to the document root at boot (`apply-design-tokens.ts`). `styles.css`
 * must consume `var(--nf-*)` for them and never repeat the literal; guard test:
 * `apps/desktop/test/design-tokens-css.test.ts`.
 *
 * Edge stroke, arrowhead, corner, lane, and stem values come from
 * `CONTINUOUS_EDGE_STYLE` in `@noteforest/layout`: the Continuous canvas reads
 * its own style object, never the Page one, so a future Continuous edge setting
 * cannot reach Page Read or the PDF. Keep the non-edge shell values here.
 *
 * `rowIndent` and `trunkInset` are measured from the lane's left edge, which is
 * also the parent card's left edge: the callout/direct row and the shared trunk
 * move together when the lane is wider than a narrow parent.
 */

import {
  CONTINUOUS_EDGE_STYLE,
  DEFAULT_CONTINUOUS_SETTINGS,
} from '@noteforest/layout';

/** CSS-bound values shared by the renderer and the stylesheet. */
export const DESIGN_TOKENS = Object.freeze({
  /** Shared below-stack row left offset from the lane/parent left edge. */
  rowIndent: 26,
  /** Shared below-stack trunk left offset from the parent card left edge. */
  trunkInset: CONTINUOUS_EDGE_STYLE.trunkInset,
  /** Visible gap between the parent card bottom and the below trunk start. */
  trunkGap: CONTINUOUS_EDGE_STYLE.trunkGap,
  /** Minimum straight stem before a fixed arrowhead. */
  stemMin: CONTINUOUS_EDGE_STYLE.stemMin,
  /**
   * Gap between a parent card/lane and the direct-child group. This is the
   * pre-R6 token default; the resolved global Continuous setting overrides it
   * on the Continuous surface. The 24 px budget is `edgeLaneMin` (10) +
   * `stemMin` (12) + `edgeGap` (2), so a shared right trunk leaves the parent
   * with a visible horizontal lead before descending.
   */
  siblingGap: DEFAULT_CONTINUOUS_SETTINGS.spacing.siblingGap,
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
   * `safeGap` is a minimum: after the 24 px group gap the effective gap is
   * larger.
   */
  callout: Object.freeze({
    maxAnchorOffset: 160,
    safeGap: 16,
  }),
  /** Primary elbows are near-right angles, never wide arcs. */
  edgeRadius: CONTINUOUS_EDGE_STYLE.radius,
  /** Space kept between the arrow tip and the child's left edge. */
  edgeGap: CONTINUOUS_EDGE_STYLE.gap,
  /** Fixed arrowhead polygon, independent of path length. */
  edgeArrowLength: CONTINUOUS_EDGE_STYLE.arrowLength,
  edgeArrowHalfWidth: CONTINUOUS_EDGE_STYLE.arrowHalfWidth,
  edgeWidth: CONTINUOUS_EDGE_STYLE.edgeWidth,
  edgeWidthActive: CONTINUOUS_EDGE_STYLE.edgeWidthActive,
  edgeWidthMuted: CONTINUOUS_EDGE_STYLE.edgeWidthMuted,
  /** Shared trunk lane, clamped between these offsets from the parent edge. */
  edgeLaneMin: CONTINUOUS_EDGE_STYLE.laneMin,
  edgeLaneMax: CONTINUOUS_EDGE_STYLE.laneMax,
  edgeMinGap: CONTINUOUS_EDGE_STYLE.minGap,
  /** Block width bounds (cards are content-driven inside them). */
  topLevelMinWidth: 160,
  topLevelMaxWidth: DEFAULT_CONTINUOUS_SETTINGS.widths.topLevelMax,
  childMinWidth: 144,
  childMaxWidth: DEFAULT_CONTINUOUS_SETTINGS.widths.childMax,
  /** Editor canvas. */
  /** Wide finite canvas; placement uses its full logical content width. */
  canvasMaxWidth: DEFAULT_CONTINUOUS_SETTINGS.widths.canvasMax,
  /**
   * Continuous canvas inset (S2.2, `docs/design/card-chrome.md` §3). The card
   * inset must cover the 16 px gutter that holds the drag handle to its left,
   * so the handle is fully visible and clickable at every width: 24 px wide,
   * 20 px medium, 16 px compact. The canvas keeps a small top inset for the
   * fixed header focus rings and an 8 px bottom inset; the header itself uses
   * 6 px lateral padding.
   */
  editorPaddingX: 24,
  editorPaddingTop: 6,
  editorPaddingBottom: 8,
  /** Responsive canvas steps; both are token-bound so CSS never hard-codes them. */
  editorPaddingXMedium: 20,
  editorPaddingTopMedium: 6,
  editorPaddingBottomMedium: 8,
  editorPaddingXCompact: 16,
  editorPaddingTopCompact: 6,
  editorPaddingBottomCompact: 8,
  /** Shell C Page stage: 14 px top, 0 lateral, 8 px bottom. */
  pageStagePaddingX: 0,
  pageStagePaddingTop: 14,
  pageStagePaddingBottom: 8,
  /** Vertical gaps. */
  childRowGap: DEFAULT_CONTINUOUS_SETTINGS.spacing.childRowGap,
  /** Ratified shell value: 28 px between chapters. */
  chapterGap: DEFAULT_CONTINUOUS_SETTINGS.spacing.chapterGap,
  /** Reserved for the M4 page renderer, which may wrap a child below. */
  wrapIndent: 18,
  /** Card chrome. */
  cardPadding: 10,
  /** Shared card/image/Page radius. */
  cardRadius: 4,
  /**
   * Continuous note-card surface radius (V0 visual). Continuous cards are a
   * separate class from Page cards, so Page/print keep the shared 4 px value.
   */
  noteRadius: 9,
  /**
   * Documented below-stack stacking. Keep in sync with the renderer rules and
   * `docs/design-tokens.md`; the guard test reads these through the CSS map.
   */
  zIndex: Object.freeze({
    edge: 0,
    rightGroup: 0,
    calloutLane: 1,
    parentCard: 2,
  }),
});

export type DesignTokens = typeof DESIGN_TOKENS;

const px = (value: number): string => `${value}px`;
const unitless = (value: number): string => `${value}`;

/**
 * Root custom properties for every CSS-bound token. `applyDesignTokens` writes
 * this map to `document.documentElement` before the renderer mounts; do not add
 * a parallel literal declaration to `styles.css`.
 *
 * Router-only tokens are intentionally absent: they never appear in CSS.
 */
export const DESIGN_TOKEN_CSS_VARIABLES = Object.freeze({
  '--nf-canvas-max': px(DESIGN_TOKENS.canvasMaxWidth),
  '--nf-canvas-pad-x': px(DESIGN_TOKENS.editorPaddingX),
  '--nf-canvas-pad-top': px(DESIGN_TOKENS.editorPaddingTop),
  '--nf-canvas-pad-bottom': px(DESIGN_TOKENS.editorPaddingBottom),
  '--nf-canvas-pad-x-medium': px(DESIGN_TOKENS.editorPaddingXMedium),
  '--nf-canvas-pad-top-medium': px(DESIGN_TOKENS.editorPaddingTopMedium),
  '--nf-canvas-pad-bottom-medium': px(DESIGN_TOKENS.editorPaddingBottomMedium),
  '--nf-canvas-pad-x-compact': px(DESIGN_TOKENS.editorPaddingXCompact),
  '--nf-canvas-pad-top-compact': px(DESIGN_TOKENS.editorPaddingTopCompact),
  '--nf-canvas-pad-bottom-compact': px(DESIGN_TOKENS.editorPaddingBottomCompact),
  '--nf-page-stage-pad-x': px(DESIGN_TOKENS.pageStagePaddingX),
  '--nf-page-stage-pad-top': px(DESIGN_TOKENS.pageStagePaddingTop),
  '--nf-page-stage-pad-bottom': px(DESIGN_TOKENS.pageStagePaddingBottom),
  '--nf-chapter-gap': px(DESIGN_TOKENS.chapterGap),
  '--nf-child-gap': px(DESIGN_TOKENS.siblingGap),
  '--nf-child-row-gap': px(DESIGN_TOKENS.childRowGap),
  '--nf-card-padding': px(DESIGN_TOKENS.cardPadding),
  '--nf-card-radius': px(DESIGN_TOKENS.cardRadius),
  '--nf-note-radius': px(DESIGN_TOKENS.noteRadius),
  '--nf-child-min-width': px(DESIGN_TOKENS.childMinWidth),
  '--nf-child-max-width': px(DESIGN_TOKENS.childMaxWidth),
  '--nf-top-level-min-width': px(DESIGN_TOKENS.topLevelMinWidth),
  '--nf-top-level-max-width': px(DESIGN_TOKENS.topLevelMaxWidth),
  '--nf-row-indent': px(DESIGN_TOKENS.rowIndent),
  '--nf-edge-width': unitless(DESIGN_TOKENS.edgeWidth),
  '--nf-edge-width-active': unitless(DESIGN_TOKENS.edgeWidthActive),
  '--nf-edge-width-muted': unitless(DESIGN_TOKENS.edgeWidthMuted),
  '--nf-z-edge': unitless(DESIGN_TOKENS.zIndex.edge),
  '--nf-z-right-group': unitless(DESIGN_TOKENS.zIndex.rightGroup),
  '--nf-z-lane': unitless(DESIGN_TOKENS.zIndex.calloutLane),
  '--nf-z-card': unitless(DESIGN_TOKENS.zIndex.parentCard),
});

export type DesignTokenCssVariables = typeof DESIGN_TOKEN_CSS_VARIABLES;
