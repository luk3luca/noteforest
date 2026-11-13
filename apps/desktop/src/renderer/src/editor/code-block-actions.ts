/**
 * Code block actions shared by the node view and the keyboard map (area A).
 *
 * The block is a node: there is no closing fence in the document. The node
 * view draws one, and the three exits (closing fence row, ArrowDown at the end,
 * Mod-Enter) all run through `exitCodeBlock` so they share one transaction and
 * one undo entry.
 */

import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { normalizeCodeLanguage } from '../lib/code-fence';

/** Whether the caret is at the very end of a code block. */
export function caretAtCodeEnd(editor: Editor): boolean {
  const { selection } = editor.state;
  if (!selection.empty) return false;
  const { $from } = selection;
  return $from.parent.type.name === 'codeBlock' && $from.parentOffset === $from.parent.content.size;
}

/** Position of the code block that owns the caret, or null. */
export function codeBlockPos(editor: Editor): number | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'codeBlock') return $from.before(depth);
  }
  return null;
}

/**
 * Leave the code block: move into the next paragraph, or insert one when the
 * next node is not a paragraph. One transaction; the caret starts at the
 * paragraph start.
 */
export function exitCodeBlock(editor: Editor, pos: number): boolean {
  const { state } = editor;
  const node = state.doc.nodeAt(pos);
  if (node === null || node.type.name !== 'codeBlock') return false;
  const after = pos + node.nodeSize;
  const tr = state.tr;
  const next = state.doc.nodeAt(after);
  if (next === null || next.type.name !== 'paragraph') {
    const paragraph = state.schema.nodes['paragraph'];
    if (paragraph === undefined) return false;
    const inserted = paragraph.createAndFill();
    if (inserted === null) return false;
    tr.insert(after, inserted);
  }
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

/**
 * Commit the fence language. Unknown tokens are stored as typed; an empty
 * token means `plaintext`. Re-applying the same language creates no
 * transaction (and no undo entry).
 */
export function commitCodeLanguage(editor: Editor, pos: number, value: string): boolean {
  const { state } = editor;
  const node = state.doc.nodeAt(pos);
  if (node === null || node.type.name !== 'codeBlock') return false;
  const next = normalizeCodeLanguage(value);
  const previous = normalizeCodeLanguage(
    typeof node.attrs['language'] === 'string' ? node.attrs['language'] : null,
  );
  if (next === previous) return false;
  editor.view.dispatch(
    state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: next }),
  );
  return true;
}
