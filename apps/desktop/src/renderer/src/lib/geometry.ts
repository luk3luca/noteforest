/**
 * Shared geometry constants for the M2 branch editor.
 *
 * Pure: no React, DOM, or measurement types. The same numbers feed the CSS
 * layout and the edge router so the arrows agree with the cards.
 *
 * Depth columns (M2d): every visible block at depth d inside one chapter starts
 * at the same x. Column widths are measured per chapter/depth and clamped to
 * the min/max below; the gap between columns is a token, not a per-parent
 * value. The editor never wraps to a second row: it scrolls horizontally.
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
  /** Gap between two depth columns (also the parent card → child column gap). */
  columnGap: 16,
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
  edgeArrowSize: 6,
  /** Space kept between the arrow tip and the child's left edge. */
  edgeGap: 6,
  edgeRadius: 6,
  edgeBusOffset: 12,
  edgePortSpacing: 8,
  edgeMinGap: 4,
  /** Horizontal space used by the collapse port / add-child control. */
  portSize: 18,
});

export type EdgePlacement = 'right' | 'below' | 'overlap';

export function cardMaxWidth(topLevel: boolean): number {
  return topLevel ? GEOMETRY.topLevelMaxWidth : GEOMETRY.childMaxWidth;
}

export function cardMinWidth(topLevel: boolean): number {
  return topLevel ? GEOMETRY.topLevelMinWidth : GEOMETRY.childMinWidth;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function rectRight(rect: Rect): number {
  return rect.x + rect.width;
}

export function rectBottom(rect: Rect): number {
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

/**
 * Deterministic sibling order: branch order first, then branch ID. Mirrors the
 * core comparator; duplicated here so geometry tests stay dependency-free.
 */
export function compareOrder(
  left: { order: string; id: string },
  right: { order: string; id: string },
): number {
  if (left.order !== right.order) return left.order < right.order ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
