/**
 * What a plain Backspace should do inside a block.
 *
 * There is deliberately no `delete` outcome: Backspace is never a structural
 * delete and never crosses the block boundary. At the very start of a normal
 * block body the key is swallowed (`stay`), so an empty block stays in the
 * document and a non-empty block is never joined with the previous one. Every
 * other position keeps the native editor keymap, which only edits the current
 * block (including paragraph joins inside it). Structural deletion is
 * ⌘Backspace / Delete on a selected block (see the keymap).
 */
export type BackspaceAction = 'native' | 'stay';

export interface BackspaceContext {
  /** A collapsed caret, not a text or node selection. */
  selectionEmpty: boolean;
  /** Code block, table cell, list item, or blockquote: the native keymap wins. */
  atomic: boolean;
  /** Caret at the very start of the block body. */
  atBlockStart: boolean;
}

export function backspaceAction(context: BackspaceContext): BackspaceAction {
  return context.selectionEmpty && !context.atomic && context.atBlockStart ? 'stay' : 'native';
}
