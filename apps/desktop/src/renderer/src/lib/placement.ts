/**
 * Pure parent-relative placement helpers (D23).
 *
 * The editor lays out blocks in normal CSS flow: a row is `[card][child
 * group]`, and the child group starts after its own parent card plus the gap.
 * There is no global x per depth. These helpers express that rule and compute
 * the content bounds used by Fit width, so both the editor and the tests share
 * one definition of "parent-relative".
 */

import { clamp, GEOMETRY, rectRight, type Rect } from './geometry';

export interface ContentBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Left edge of a child group whose parent card is `parent`. */
export function childGroupStart(
  parent: Pick<Rect, 'x' | 'width'>,
  gap = GEOMETRY.childGap,
): number {
  return rectRight(parent) + gap;
}

/** Union of visible card rects. Hidden cards are not passed in. */
export function contentBounds(rects: Iterable<Rect>): ContentBounds | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const rect of rects) {
    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) continue;
    if (rect.width <= 0 || rect.height <= 0) continue;
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
    count += 1;
  }
  if (count === 0) return null;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

export interface FitOptions {
  paddingX?: number;
  min?: number;
  max?: number;
}

/**
 * Zoom that fits `contentWidth` plus the editor's horizontal padding into
 * `viewportWidth`. Navigation only: the layout and the document are unchanged.
 */
export function fitZoom(
  viewportWidth: number,
  contentWidth: number,
  options: FitOptions = {},
): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 1;
  if (!Number.isFinite(contentWidth) || contentWidth <= 0) return 1;
  const padding = options.paddingX ?? GEOMETRY.editorPaddingX;
  const minimum = options.min ?? 0.5;
  const maximum = options.max ?? 1.5;
  return Math.round(clamp(viewportWidth / (contentWidth + padding * 2), minimum, maximum) * 100) / 100;
}
