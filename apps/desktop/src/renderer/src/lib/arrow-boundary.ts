/**
 * What a plain arrow key should do inside a block.
 *
 * Like Backspace, a plain arrow never navigates to a neighbouring block: at the
 * very start of the block body ArrowUp/ArrowLeft are swallowed, and at the very
 * end ArrowDown/ArrowRight are swallowed. The caret stays where it is. Block
 * navigation is ⌘↑/⌘↓, a click, or the outline.
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
  /** A collapsed caret, not a text or node selection. */
  selectionEmpty: boolean;
  /** Code block or table: the native key path wins. */
  atomic: boolean;
  /** Caret at the very start of the block body. */
  atBlockStart: boolean;
  /** Caret at the very end of the block body. */
  atBlockEnd: boolean;
}

/**
 * `stay` means consume the key so the caret cannot leave the block; `native`
 * lets the editor/browser move the caret normally.
 */
export function arrowBoundaryAction(context: ArrowBoundaryContext): ArrowBoundaryAction {
  if (!context.selectionEmpty || context.atomic) return 'native';
  const outward = context.key === 'ArrowUp' || context.key === 'ArrowLeft';
  const blocked = outward ? context.atBlockStart : context.atBlockEnd;
  return blocked ? 'stay' : 'native';
}
