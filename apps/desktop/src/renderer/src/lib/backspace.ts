/**
 * What a plain Backspace should do inside a block.
 *
 * There is deliberately no `delete` outcome: Backspace is never a structural
 * delete. An empty block stays in the document; at most the caret moves to the
 * previous block. Structural deletion is ⌘Backspace / Delete on a selected
 * block (see the keymap).
 */
export type BackspaceAction = 'native' | 'previous' | 'stay';

export interface BackspaceContext {
  /** A collapsed caret, not a text or node selection. */
  selectionEmpty: boolean;
  /** Code block, table cell, list item, or blockquote: the native keymap wins. */
  atomic: boolean;
  /** Caret at the very start of the block body. */
  atBlockStart: boolean;
  /** The block body has no text. */
  empty: boolean;
  /** A previous visible block exists. */
  hasPrevious: boolean;
}

export function backspaceAction(context: BackspaceContext): BackspaceAction {
  if (!context.selectionEmpty || context.atomic || !context.atBlockStart || !context.empty) {
    return 'native';
  }
  return context.hasPrevious ? 'previous' : 'stay';
}
