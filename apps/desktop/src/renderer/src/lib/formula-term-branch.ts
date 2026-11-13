/**
 * Branch from a formula term (special-text editing, area C).
 *
 * The double-click source editor replaces the old math-dialog editing path, so
 * the existing term-anchor flow moves here: selecting a LaTeX substring in the
 * in-place source editor exposes "Branch from term". The modal dialog keeps
 * only its insertion role (`pos === null`).
 */

import type { Editor } from '@tiptap/core';
import { toast } from 'sonner';
import {
  formulaNodeAt,
  formulaTermBinding,
  formulaTermSelector,
  formulaTermSelection,
} from '../lib/anchor-selection';
import type { DocumentRuntime } from '../state/runtime';

export function branchFromFormulaTerm(
  runtime: DocumentRuntime,
  editor: Editor,
  pos: number,
  latex: string,
  selectionStart: number,
  selectionEnd: number,
): boolean {
  const selected = formulaTermSelection(latex, selectionStart, selectionEnd);
  if (selected === null || selected.term.trim().length === 0) return false;
  const location = formulaNodeAt(editor, pos);
  if (location === null) {
    toast.error('The formula could not be found; close the editor and try again.');
    return false;
  }
  if (latex !== location.latex) {
    const inline = editor.state.doc.nodeAt(pos)?.type.name === 'inlineMath';
    const updated = inline
      ? editor.commands.updateInlineMath({ latex, pos })
      : editor.commands.updateBlockMath({ latex, pos });
    if (!updated) {
      toast.error('The formula could not be updated; check the LaTeX and try again.');
      return false;
    }
  }
  const updated = formulaNodeAt(editor, pos) ?? location;
  void runtime
    .branchFromSelection({
      kind: 'formula',
      blockId: updated.blockId,
      binding: formulaTermBinding(updated.nodePath, selected),
      selector: formulaTermSelector(selected),
    })
    .then((outcome) => {
      if (!outcome.ok) {
        toast.error(outcome.message ?? 'Could not branch from the term.');
      }
    });
  return true;
}
