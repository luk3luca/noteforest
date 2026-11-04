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
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GEOMETRY = Object.freeze({
  /** Top-level depth-0 cards are 160–480 px wide. */
  topLevelMinWidth: 160,
  topLevelMaxWidth: 480,
  /** Child cards live between 144 and 420 px. */
  childMinWidth: 144,
  childMaxWidth: 420,
  /** Gap between a parent card and its child group (also sibling gap token). */
  childGap: 16,
  /** Editor canvas. */
  canvasMaxWidth: 1600,
  editorPaddingX: 40,
  editorPaddingTop: 40,
  editorPaddingBottom: 96,
  /** Gaps. */
  siblingGap: 24,
  childRowGap: 16,
  chapterGap: 32,
  /** Reserved for the M4 page renderer, which may wrap a child below. */
  wrapIndent: 18,
  /** Card chrome. */
  cardPadding: 10,
  cardRadius: 4,
  /** Edges. */
  edgeWidth: 1.25,
  edgeWidthActive: 1.75,
  /** Fixed arrowhead polygon, independent of path length. */
  edgeArrowLength: 6,
  edgeArrowHalfWidth: 3,
  /** Minimum final horizontal segment before the arrowhead. */
  edgeStemMin: 12,
  /** Space kept between the arrow tip and the child's left edge. */
  edgeGap: 2,
  edgeRadius: 6,
  /** Shared trunk lane, clamped between these offsets from the parent edge. */
  edgeLaneMin: 2,
  edgeLaneMax: 14,
  edgeBusOffset: 16,
  edgePortSpacing: 8,
  edgeMinGap: 4,
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
  minimumChildWidth = GEOMETRY.childMinWidth,
): boolean {
  return (
    classifyPlacement(parent, child) === 'right' &&
    child.width >= minimumChildWidth - 1
  );
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
