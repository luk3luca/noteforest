/**
 * Shared geometry constants for the M2 branch editor.
 *
 * Pure: no React, DOM, or measurement types. The same numbers feed the CSS
 * layout and the edge router so the arrows agree with the cards.
 *
 * Placement is parent-relative (D23): a child group starts after its own
 * parent card plus `childGap`; there is no global x per depth. Same-depth
 * blocks under different parents may sit at different x. The editor never
 * wraps to a second row: it scrolls horizontally when a deep branch exceeds
 * the viewport.
 *
 * All numeric values live in `design-tokens.ts`; `GEOMETRY` is the legacy
 * name used by the renderer and tests.
 */

import { DESIGN_TOKENS } from './design-tokens';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GEOMETRY = Object.freeze({
  topLevelMinWidth: DESIGN_TOKENS.topLevelMinWidth,
  topLevelMaxWidth: DESIGN_TOKENS.topLevelMaxWidth,
  childMinWidth: DESIGN_TOKENS.childMinWidth,
  childMaxWidth: DESIGN_TOKENS.childMaxWidth,
  /** Gap between a parent card and its child group (also sibling gap token). */
  childGap: DESIGN_TOKENS.siblingGap,
  canvasMaxWidth: DESIGN_TOKENS.canvasMaxWidth,
  editorPaddingX: DESIGN_TOKENS.editorPaddingX,
  editorPaddingTop: DESIGN_TOKENS.editorPaddingTop,
  editorPaddingBottom: DESIGN_TOKENS.editorPaddingBottom,
  /** Gaps. */
  siblingGap: DESIGN_TOKENS.siblingGap,
  childRowGap: DESIGN_TOKENS.childRowGap,
  chapterGap: DESIGN_TOKENS.chapterGap,
  wrapIndent: DESIGN_TOKENS.wrapIndent,
  /** Card chrome. */
  cardRadius: DESIGN_TOKENS.cardRadius,
  /** Edges. */
  edgeWidth: DESIGN_TOKENS.edgeWidth,
  edgeWidthActive: DESIGN_TOKENS.edgeWidthActive,
  edgeArrowLength: DESIGN_TOKENS.edgeArrowLength,
  edgeArrowHalfWidth: DESIGN_TOKENS.edgeArrowHalfWidth,
  /** Minimum final horizontal segment before the arrowhead. */
  stemMin: DESIGN_TOKENS.stemMin,
  edgeGap: DESIGN_TOKENS.edgeGap,
  edgeRadius: DESIGN_TOKENS.edgeRadius,
  edgeLaneMin: DESIGN_TOKENS.edgeLaneMin,
  edgeLaneMax: DESIGN_TOKENS.edgeLaneMax,
  edgeBusOffset: DESIGN_TOKENS.edgeBusOffset,
  edgePortSpacing: DESIGN_TOKENS.edgePortSpacing,
  edgeMinGap: DESIGN_TOKENS.edgeMinGap,
  /** Horizontal gap from an anchor mark to its callout row. */
  calloutGap: DESIGN_TOKENS.calloutGap,
  /** Bounded independent callout lane width. */
  calloutMinWidth: DESIGN_TOKENS.calloutMinWidth,
  calloutMaxWidth: DESIGN_TOKENS.calloutMaxWidth,
  /** Shared below-stack row left offset from the lane/parent left edge. */
  rowIndent: DESIGN_TOKENS.rowIndent,
  /** Shared below-stack trunk left offset from the parent card left edge. */
  trunkInset: DESIGN_TOKENS.trunkInset,
});

export type EdgePlacement = 'right' | 'below' | 'overlap';

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function rectRight(rect: Pick<Rect, 'x' | 'width'>): number {
  return rect.x + rect.width;
}

export function rectBottom(rect: Pick<Rect, 'y' | 'height'>): number {
  return rect.y + rect.height;
}

export function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function intersects(left: Rect, right: Rect): boolean {
  return !(
    rectRight(left) <= right.x ||
    rectRight(right) <= left.x ||
    rectBottom(left) <= right.y ||
    rectBottom(right) <= left.y
  );
}

/**
 * Classify where the child card ended up relative to its parent.
 * `right` is chosen only when the child starts after the parent's right edge;
 * `below` only when it starts after the parent's bottom edge. Anything else
 * would overlap, which is a layout defect we surface quietly.
 */
export function classifyPlacement(parent: Rect, child: Rect): EdgePlacement {
  if (intersects(parent, child)) return 'overlap';
  if (child.x >= rectRight(parent) - 1) return 'right';
  if (child.y >= rectBottom(parent) - 1) return 'below';
  return 'overlap';
}

/** True when the measured row leaves a usable right-hand column. */
export function fitsToRight(
  parent: Rect,
  child: Rect,
  minimumChildWidth = DESIGN_TOKENS.childMinWidth,
): boolean {
  return (
    classifyPlacement(parent, child) === 'right' &&
    child.width >= minimumChildWidth - 1
  );
}

/**
 * Independent callout lane width (M3g2):
 * `clamp(max(parent.width, natural callout width), 240, 480)`.
 *
 * `naturalCalloutWidth` is optional. The renderer currently uses the stable
 * parent-width fallback allowed by the brief: a rich callout's max-content
 * width cannot be measured without a temporary clone/measure pass that would
 * feed back through the lane's own ResizeObserver. Passing `undefined` records
 * that fallback; passing a measured width simply raises the lane to it.
 */
export function calloutLaneWidth(
  parentWidth: number,
  naturalCalloutWidth?: number | null,
): number {
  const parent = Number.isFinite(parentWidth) && parentWidth > 0 ? parentWidth : 0;
  const measured =
    typeof naturalCalloutWidth === 'number' &&
    Number.isFinite(naturalCalloutWidth) &&
    naturalCalloutWidth > 0
      ? naturalCalloutWidth
      : parent;
  return clamp(
    Math.max(parent, measured),
    DESIGN_TOKENS.calloutMinWidth,
    DESIGN_TOKENS.calloutMaxWidth,
  );
}

/** How far a lane extends past its parent card's right edge. */
export function lanePush(parent: Pick<Rect, 'x' | 'width'>, laneWidth: number): number {
  return Math.max(0, parent.x + laneWidth - rectRight(parent));
}

/**
 * Left edge of the direct-child group: only the lane's excess past the parent
 * pushes it. With no callout lane the group starts one sibling gap after the
 * parent card, preserving the M2/M3 chain rule.
 */
export function rightGroupStart(
  parent: Pick<Rect, 'x' | 'width'>,
  laneWidth: number | undefined,
  gap: number = DESIGN_TOKENS.siblingGap,
): number {
  const laneRight =
    laneWidth === undefined ? rectRight(parent) : Math.max(rectRight(parent), parent.x + laneWidth);
  return laneRight + gap;
}

/** Evenly distributed ports along a vertical edge, excluding the corners. */
export function distributePorts(count: number, top: number, height: number): number[] {
  if (count <= 0) return [];
  const inset = Math.min(10, Math.max(4, height * 0.15));
  const usable = Math.max(0, height - inset * 2);
  return Array.from({ length: count }, (_value, index) => {
    if (count === 1) return top + height / 2;
    return top + inset + (usable * index) / (count - 1);
  });
}
