/**
 * Inline ↔ block formula conversion (special-text polish, area E).
 *
 * One transaction replaces the node type, keeps the LaTeX (including an
 * unsaved draft from the source textarea) and keeps the source editor open:
 * ProseMirror creates a new node view for the new type, so `markFormulaAutoEdit`
 * records where that view should reopen its textarea once it is attached.
 */

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { formulaKindTarget, type FormulaKind } from './formula-clipboard';

export interface FormulaConversion {
  ok: boolean;
  /** Position of the converted node view. */
  pos: number | null;
}

export interface FormulaKindPlan {
  tr: Transaction;
  /** Position the converted node occupies in the new document. */
  pos: number;
}

const pendingAutoEdit = new WeakMap<Editor, number>();

export function markFormulaAutoEdit(editor: Editor, pos: number): void {
  pendingAutoEdit.set(editor, pos);
}

/** Consume the pending marker for `pos`; a different position leaves it. */
export function consumeFormulaAutoEdit(editor: Editor, pos: number): boolean {
  if (pendingAutoEdit.get(editor) !== pos) return false;
  pendingAutoEdit.delete(editor);
  return true;
}

/**
 * The one transaction that flips an inline formula to a block or back. Pure so
 * the transaction shape and resulting document are unit-tested without a view.
 */
export function formulaKindTransaction(
  state: EditorState,
  pos: number,
  target: FormulaKind,
  latex: string,
): FormulaKindPlan | null {
  const node = state.doc.nodeAt(pos);
  if (node === null) return null;
  if (node.type.name === target) return null;
  if (formulaKindTarget(node.type.name) !== target) return null;
  const type = state.schema.nodes[target];
  const paragraphType = state.schema.nodes['paragraph'];
  if (type === undefined || paragraphType === undefined) return null;
  const attrs = { ...node.attrs, latex };
  const $pos = state.doc.resolve(pos);

  if (target === 'blockMath') {
    // Inline → block: the formula only becomes a block inside a block body. A
    // table cell keeps its inline-only paragraph, so it stays untouched.
    const paragraph = $pos.parent;
    if (paragraph.type.name !== 'paragraph' || $pos.depth < 1) return null;
    if ($pos.node($pos.depth - 1).type.name !== 'blockBody') return null;
    const paragraphStart = $pos.before();
    const paragraphEnd = paragraphStart + paragraph.nodeSize;
    const before = paragraph.content.cut(0, $pos.parentOffset);
    const after = paragraph.content.cut($pos.parentOffset + node.nodeSize);
    const beforeParagraph: PMNode | null =
      before.size > 0 ? paragraphType.create(null, before) : null;
    const afterParagraph: PMNode | null =
      after.size > 0 ? paragraphType.create(null, after) : null;
    const block = type.create(attrs);
    const replacement = [
      ...(beforeParagraph === null ? [] : [beforeParagraph]),
      block,
      ...(afterParagraph === null ? [] : [afterParagraph]),
    ];
    const tr = state.tr.replaceWith(paragraphStart, paragraphEnd, replacement);
    const newPos = paragraphStart + (beforeParagraph?.nodeSize ?? 0);
    tr.setSelection(NodeSelection.create(tr.doc, newPos));
    return { tr, pos: newPos };
  }

  // Block → inline: wrap the atom in a paragraph, which every block parent
  // accepts. The formula keeps its exact LaTeX and attrs.
  const inline = type.create(attrs);
  const paragraph = paragraphType.create(null, inline);
  const tr = state.tr.replaceWith(pos, pos + node.nodeSize, paragraph);
  const newPos = pos + 1;
  tr.setSelection(NodeSelection.create(tr.doc, newPos));
  return { tr, pos: newPos };
}

/**
 * Convert the formula at `pos` to `target` in one transaction. `latex` is the
 * current source (the node attribute or an unsaved textarea draft). Returns the
 * new node position on success.
 */
export function convertFormulaKind(
  editor: Editor,
  pos: number,
  target: FormulaKind,
  latex: string,
): FormulaConversion {
  const plan = formulaKindTransaction(editor.state, pos, target, latex);
  if (plan === null) return { ok: false, pos: null };
  markFormulaAutoEdit(editor, plan.pos);
  editor.view.dispatch(plan.tr.scrollIntoView());
  return { ok: true, pos: plan.pos };
}
