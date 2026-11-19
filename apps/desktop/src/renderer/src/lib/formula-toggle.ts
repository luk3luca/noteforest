/**
 * `$` formula wrap/unwrap (v0.1.1, Track A).
 *
 * A non-empty selection inside one textblock becomes one `inlineMath` node
 * whose `latex` is the trimmed selection; leading/trailing whitespace stays
 * text. An `inlineMath` `NodeSelection` unwraps to its LaTeX source. Everything
 * else keeps the literal `$`:
 *
 * - empty caret, empty or all-whitespace selection;
 * - a selection containing an inline formula, or crossing a textblock, a
 *   display formula or an image;
 * - any `NodeSelection` that is not an inline formula (the key is consumed so
 *   a selected atom is never replaced by a literal `$`).
 *
 * Marks inside the wrapped range (including `code` and `anchor`) are not
 * preserved inside the atomic formula. An anchor loses its mark/node binding
 * and resolves by selector, or becomes visibly broken and repairable; the
 * branch itself is never touched by this transaction. Undo restores it.
 *
 * The rules are pure ProseMirror planning so they are unit-tested with an
 * `EditorState` and no view. Each change is one transaction closed against the
 * typing history group, so one undo reverts it.
 */

import { closeHistory } from '@tiptap/pm/history';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  NodeSelection,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';

export const INLINE_FORMULA_NODE = 'inlineMath';

/** True when a node of `typeName` sits inside the range. */
export function nodeInRange(
  state: EditorState,
  from: number,
  to: number,
  typeName: string,
): boolean {
  let found = false;
  state.doc.nodesBetween(from, to, (node: PMNode) => {
    if (node.type.name === typeName) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

interface TrimmedSelection {
  from: number;
  to: number;
  latex: string;
}

/**
 * Trim the selection's text with the document's one-character-per-position
 * rule (every text character and every hard break is one position).
 */
function trimmedSelection(state: EditorState, from: number, to: number): TrimmedSelection | null {
  const text = state.doc.textBetween(from, to, '\n', '\n');
  const latex = text.trim();
  if (latex.length === 0) return null;
  const lead = text.length - text.trimStart().length;
  const trail = text.length - text.trimEnd().length;
  return { from: from + lead, to: to - trail, latex };
}

/**
 * Wrap a non-empty single-textblock selection in one inline formula, or null
 * when the selection is a barrier or empty.
 */
export function wrapSelectionInFormula(state: EditorState): Transaction | null {
  const { selection } = state;
  if (selection.empty) return null;
  if (selection instanceof NodeSelection) return null;
  const { $from, $to, from, to } = selection;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.name === 'codeBlock') return null;
  if ($from.parent !== $to.parent) return null;
  const type = state.schema.nodes[INLINE_FORMULA_NODE];
  if (type === undefined) return null;
  if (nodeInRange(state, from, to, INLINE_FORMULA_NODE)) return null;
  const trimmed = trimmedSelection(state, from, to);
  if (trimmed === null) return null;
  if (!$from.parent.canReplaceWith($from.index(), $to.indexAfter(), type)) return null;
  const transaction = state.tr.replaceWith(
    trimmed.from,
    trimmed.to,
    type.create({ latex: trimmed.latex }),
  );
  transaction.setSelection(NodeSelection.create(transaction.doc, trimmed.from));
  closeHistory(transaction);
  return transaction;
}

/**
 * Unwrap an `inlineMath` `NodeSelection` to its LaTeX text, keeping the node's
 * marks and leaving the caret after the text. An empty formula is removed.
 */
export function unwrapInlineFormula(state: EditorState): Transaction | null {
  const { selection } = state;
  if (!(selection instanceof NodeSelection)) return null;
  if (selection.node.type.name !== INLINE_FORMULA_NODE) return null;
  const node = selection.node;
  const pos = selection.from;
  const latex = typeof node.attrs['latex'] === 'string' ? node.attrs['latex'] : '';
  const transaction = state.tr;
  if (latex.length > 0) {
    transaction.replaceWith(pos, pos + node.nodeSize, state.schema.text(latex, node.marks));
    transaction.setSelection(TextSelection.create(transaction.doc, pos + latex.length));
  } else {
    transaction.delete(pos, pos + node.nodeSize);
    transaction.setSelection(TextSelection.create(transaction.doc, pos));
  }
  closeHistory(transaction);
  return transaction;
}

export type FormulaToggleResult =
  | { kind: 'transaction'; transaction: Transaction }
  | { kind: 'consume' };

/** The transaction for a `$` keydown, `'consume'` for a non-formula atom, or null. */
export function formulaToggleTransaction(state: EditorState): FormulaToggleResult | null {
  const { selection } = state;
  if (selection instanceof NodeSelection) {
    if (selection.node.type.name === INLINE_FORMULA_NODE) {
      const transaction = unwrapInlineFormula(state);
      return transaction === null ? null : { kind: 'transaction', transaction };
    }
    // Block math, an image or a whole block: consume the key, never replace a
    // selected atom with a literal `$`.
    return { kind: 'consume' };
  }
  if (selection.empty) return null;
  const transaction = wrapSelectionInFormula(state);
  return transaction === null ? null : { kind: 'transaction', transaction };
}

export interface EmptyFormulaInsert {
  transaction: Transaction;
  /** Position of the inserted node in the new document. */
  pos: number;
}

/**
 * Insert an empty inline formula at an empty caret. The caller marks it for the
 * existing auto-edit path so the source editor opens immediately.
 */
export function insertEmptyFormula(state: EditorState): EmptyFormulaInsert | null {
  const { selection } = state;
  if (!selection.empty) return null;
  if (selection instanceof NodeSelection) return null;
  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.name === 'codeBlock') return null;
  const type = state.schema.nodes[INLINE_FORMULA_NODE];
  if (type === undefined) return null;
  if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) return null;
  const pos = $from.pos;
  const transaction = state.tr.replaceSelectionWith(type.create({ latex: '' }));
  transaction.setSelection(NodeSelection.create(transaction.doc, pos));
  closeHistory(transaction);
  return { transaction, pos };
}
