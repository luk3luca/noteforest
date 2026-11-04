/**
 * Pure depth-column math for the M2d branch editor.
 *
 * Within one chapter, every visible block at depth `d` starts at the same
 * `x[d]` (a depth column). A column is as wide as its widest measured card,
 * clamped; the next column starts after the gap. Columns reset at each chapter
 * because the caller computes one `ColumnWidths` per chapter.
 *
 * The DOM keeps normal flow: a block row is `[card][child group]`, the child
 * group starts at `x[d + 1]`, and it does so with
 * `margin-left = width[d] + gap - cardWidth` (see `groupOffset`). That keeps
 * the card's own width content-driven while aligning every group to the shared
 * column origin, without absolute positioning.
 */

import { clamp, GEOMETRY } from './geometry';

/** One visible measured card. Empty cards contribute the readable minimum. */
export interface ColumnCard {
  depth: number;
  width: number;
  /** True for a block with no text/media; it must not stretch the column. */
  empty?: boolean;
}

/** `widths[d]` is the width of the depth-`d` column. */
export type ColumnWidths = readonly number[];

export function columnMinWidth(depth: number): number {
  return depth === 0 ? GEOMETRY.topLevelMinWidth : GEOMETRY.childMinWidth;
}

export function columnMaxWidth(depth: number): number {
  return depth === 0 ? GEOMETRY.topLevelMaxWidth : GEOMETRY.childMaxWidth;
}

export function clampColumnWidth(depth: number, width: number): number {
  if (!Number.isFinite(width) || width <= 0) return columnMinWidth(depth);
  return clamp(width, columnMinWidth(depth), columnMaxWidth(depth));
}

/**
 * Widest measured card per depth, clamped. An empty block contributes the
 * minimum so a blank card never widens a column; a depth with no visible card
 * is simply absent from the array (prefix property of a tree).
 */
export function computeColumnWidths(cards: readonly ColumnCard[]): number[] {
  const widths: number[] = [];
  let deepest = -1;
  for (const card of cards) {
    if (!Number.isInteger(card.depth) || card.depth < 0) continue;
    const candidate = card.empty === true
      ? columnMinWidth(card.depth)
      : clampColumnWidth(card.depth, card.width);
    const current = widths[card.depth];
    widths[card.depth] = current === undefined ? candidate : Math.max(current, candidate);
    deepest = Math.max(deepest, card.depth);
  }
  // Trees are contiguous, but keep the result dense so callers can index
  // safely even before the first full measurement of a rebuild.
  for (let depth = 0; depth <= deepest; depth += 1) {
    if (widths[depth] === undefined) widths[depth] = columnMinWidth(depth);
  }
  return widths;
}

/** Left edge of a depth column, in chapter coordinates. */
export function columnX(
  widths: ColumnWidths,
  depth: number,
  gap = GEOMETRY.columnGap,
): number {
  if (depth <= 0) return 0;
  let x = 0;
  for (let level = 0; level < depth; level += 1) {
    x += (widths[level] ?? 0) + gap;
  }
  return x;
}

/** Total width of the visible columns (deepest column's right edge). */
export function contentWidth(
  widths: ColumnWidths,
  gap = GEOMETRY.columnGap,
): number {
  const deepest = widths.length - 1;
  if (deepest < 0) return 0;
  return columnX(widths, deepest, gap) + (widths[deepest] ?? 0);
}

/**
 * `margin-left` for a child group inside a row whose card starts at the depth
 * column: the group is a flex sibling after the card, so the offset makes its
 * left edge land exactly on the next column while the card keeps its own
 * content-driven width.
 */
export function groupOffset(
  cardWidth: number,
  columnWidth: number,
  gap = GEOMETRY.columnGap,
): number {
  const board = Number.isFinite(cardWidth) ? cardWidth : 0;
  return Math.max(gap, columnWidth + gap - board);
}

/** Left edge of a row's child group, in chapter coordinates. */
export function groupLeft(
  widths: ColumnWidths,
  depth: number,
  cardWidth: number,
  gap = GEOMETRY.columnGap,
): number {
  const columnWidth = widths[depth] ?? 0;
  return columnX(widths, depth, gap) + cardWidth + groupOffset(cardWidth, columnWidth, gap);
}

/** True when the whole column set fits the editor viewport (no h-scroll). */
export function fitsViewport(
  widths: ColumnWidths,
  viewportWidth: number,
  gap = GEOMETRY.columnGap,
  paddingX = GEOMETRY.editorPaddingX,
): boolean {
  return contentWidth(widths, gap) + paddingX * 2 <= viewportWidth;
}

/** All depths in reading order, with their column origin and width. */
export function columnLayout(
  widths: ColumnWidths,
  gap = GEOMETRY.columnGap,
): Array<{ depth: number; x: number; width: number }> {
  return widths.map((width, depth) => ({ depth, width, x: columnX(widths, depth, gap) }));
}
