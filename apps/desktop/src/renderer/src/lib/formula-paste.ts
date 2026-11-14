/**
 * Formula paste transaction (special-text polish, area E).
 *
 * Pure ProseMirror planning so the paste rule is unit-tested without an editor
 * view: a `$…$` string replaces the selection inside a textblock, a `$$…$$`
 * string replaces an empty paragraph or lands after the current paragraph with
 * a paragraph below. Anything else returns null and keeps the plain paste.
 */

import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { parseFormulaPaste } from './formula-clipboard';

export function formulaPasteTransaction(state: EditorState, text: string): Transaction | null {
  const parsed = parseFormulaPaste(text);
  if (parsed === null) return null;
  const { $from, from, to } = state.selection;
  if ($from.parent.type.name === 'codeBlock') return null;
  const type = state.schema.nodes[parsed.kind];
  const paragraphType = state.schema.nodes['paragraph'];
  if (type === undefined || paragraphType === undefined) return null;

  if (parsed.kind === 'inlineMath') {
    if (!$from.parent.isTextblock) return null;
    const $to = state.doc.resolve(to);
    if ($to.parent !== $from.parent) return null;
    if (!$from.parent.canReplaceWith($from.index(), $from.indexAfter(), type)) return null;
    const tr = state.tr.replaceWith(from, to, type.create({ latex: parsed.latex }));
    tr.setSelection(NodeSelection.create(tr.doc, from));
    return tr;
  }

  if (!state.selection.empty) return null;
  if ($from.parent.type.name !== 'paragraph') return null;
  const node = type.create({ latex: parsed.latex });
  if ($from.parent.textContent.length === 0) {
    const start = $from.before();
    const tr = state.tr.replaceWith(start, $from.after(), node);
    tr.setSelection(NodeSelection.create(tr.doc, start));
    return tr;
  }
  if ($from.parentOffset !== $from.parent.content.size) return null;
  const container = $from.node($from.depth - 1);
  const at = $from.after();
  const index = $from.index($from.depth - 1) + 1;
  if (!container.canReplaceWith(index, index, type)) return null;
  const tr = state.tr.insert(at, node);
  const filler = paragraphType.createAndFill();
  if (filler !== null) tr.insert(at + node.nodeSize, filler);
  tr.setSelection(NodeSelection.create(tr.doc, at));
  return tr;
}
