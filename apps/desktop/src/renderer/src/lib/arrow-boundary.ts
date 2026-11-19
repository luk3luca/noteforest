/**
 * What a plain arrow key should do inside a block.
 *
 * Like Backspace, a plain arrow never navigates to a neighbouring block: at the
 * first/last visual line ArrowUp/ArrowDown are swallowed, and at the very end
 * of the flow ArrowRight is swallowed (ArrowLeft at the very start likewise).
 * The caret stays where it is. Block navigation is ⌘↑/⌘↓, a click, or the
 * outline.
 *
 * The vertical boundary is line-aware, not offset-aware: a caret in the middle
 * of the first or last visual line is still at the boundary. The horizontal
 * boundary is read from the selected node's end for an atom selection, so a
 * selected formula at the block end cannot fall through to the next block, and
 * an atom selection is never turned into its source text.
 *
 * Code blocks, tables and the formula source editor keep the native key path:
 * the code block owns its ArrowDown exit, the table owns the cell keys, and the
 * textarea owns every caret key while the source editor is open.
 */

export type ArrowBoundaryKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export type ArrowBoundaryAction = 'native' | 'stay';

export interface ArrowBoundaryContext {
  /** The key being pressed. */
  key: ArrowBoundaryKey;
  /**
   * No text selection is active: a caret, or a selected atom whose end is the
   * block end. A text selection keeps the native key path.
   */
  selectionEmpty: boolean;
  /** Code block or table: the native key path wins. */
  atomic: boolean;
  /** Caret (or selected node end) at the very start of the block body. */
  atBlockStart: boolean;
  /** Caret (or selected node end) at the very end of the block body. */
  atBlockEnd: boolean;
  /**
   * Caret on the first visual line of the block content, read from the live
   * DOM. Defaults to the offset boundary when the geometry is unavailable.
   */
  atFirstLine?: boolean;
  /** Caret on the last visual line of the block content. See `atFirstLine`. */
  atLastLine?: boolean;
}

/**
 * `stay` means consume the key so the caret cannot leave the block; `native`
 * lets the editor/browser move the caret normally.
 */
export function arrowBoundaryAction(context: ArrowBoundaryContext): ArrowBoundaryAction {
  if (!context.selectionEmpty || context.atomic) return 'native';
  if (context.key === 'ArrowUp') {
    return (context.atFirstLine ?? context.atBlockStart) ? 'stay' : 'native';
  }
  if (context.key === 'ArrowDown') {
    return (context.atLastLine ?? context.atBlockEnd) ? 'stay' : 'native';
  }
  const blocked = context.key === 'ArrowLeft' ? context.atBlockStart : context.atBlockEnd;
  return blocked ? 'stay' : 'native';
}

/** A viewport box, the only geometry the block content exposes to the guard. */
export interface VerticalBounds {
  top: number;
  bottom: number;
}

export interface ArrowVisualLine {
  /** The caret box sits on the first visual line of the block content. */
  atFirstLine: boolean;
  /** The caret box sits on the last visual line of the block content. */
  atLastLine: boolean;
}

/** Line fragments of one visual line share a box; separate lines never do. */
const LINE_TOLERANCE = 2;

/**
 * Merge measured line fragments into one band per visual line, top to bottom.
 * A line can arrive as several fragments (two text runs around an inline
 * atom); the bands are what "first/last visual line" means.
 */
export function visualLineBands(rects: readonly VerticalBounds[]): VerticalBounds[] {
  const bands: VerticalBounds[] = [];
  for (const rect of rects) {
    if (rect.bottom - rect.top <= 0) continue;
    const band = bands.find(
      (item) =>
        rect.top < item.bottom - LINE_TOLERANCE && rect.bottom > item.top + LINE_TOLERANCE,
    );
    if (band === undefined) {
      bands.push({ top: rect.top, bottom: rect.bottom });
    } else {
      band.top = Math.min(band.top, rect.top);
      band.bottom = Math.max(band.bottom, rect.bottom);
    }
  }
  return bands.sort((left, right) => left.top - right.top || left.bottom - right.bottom);
}

/**
 * Which visual line of the block content the caret box sits on.
 *
 * The caret's vertical centre is the truth: every column of one line shares the
 * same line box, so a caret in the middle of the line reads as that line. No
 * containing band (an unmeasured block) reports neither boundary, which keeps
 * the offset fallback in charge.
 */
export function visualLineBoundary(
  caret: VerticalBounds,
  bands: readonly VerticalBounds[],
): ArrowVisualLine {
  const center = (caret.top + caret.bottom) / 2;
  const index = bands.findIndex(
    (band) => center >= band.top - LINE_TOLERANCE && center <= band.bottom + LINE_TOLERANCE,
  );
  if (index < 0) return { atFirstLine: false, atLastLine: false };
  return { atFirstLine: index === 0, atLastLine: index === bands.length - 1 };
}
