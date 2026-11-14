/**
 * Formula extensions (special-text editing, area C).
 *
 * The TipTap mathematics library ships `$$…$$` inline and `$$$…$$$` block
 * input rules and the click/dialog editing path. NoteForest replaces both:
 * `$…$` inline (Obsidian guards), `$$…$$` only as a whole paragraph, and a
 * double-click in-place source editor. The KaTeX node view and the atomic
 * `anchorIds` attribute stay.
 */

import { InputRule, type Editor } from '@tiptap/core';
import { BlockMath, InlineMath } from '@tiptap/extension-mathematics';
import type { Node as PMNode, NodeType } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { anchorIdsAttribute } from './anchor-attrs';
import { formulaPasteTransaction } from '../lib/formula-paste';
import { findInlineMathInput, isBlockMathEnterTrigger } from '../lib/formula-input';
import { FormulaNodeView } from './views/formula-node-view';

interface FunctionInputRuleMatch extends Array<string> {
  index: number;
  data?: { latex?: string };
}

function formulaNodeView() {
  // The atom is chrome plus a source textarea; ProseMirror never owns an event
  // inside it. Selection is set explicitly (NodeSelection, then the source
  // editor), so a single click cannot open the dialog path again.
  return ({
    node,
    editor,
    getPos,
  }: {
    node: PMNode;
    editor: Editor;
    getPos: () => number | undefined;
  }) => new FormulaNodeView({ editor, node, getPos });
}

function blockMathInputRule(getType: () => NodeType): InputRule {
  return new InputRule({
    find: /^\$\$([^$]+)\$\$$/,
    handler: ({ state, range, match }) => {
      const latex = match[1];
      if (typeof latex !== 'string') return null;
      const $from = state.doc.resolve(range.from);
      const node = getType().create({ latex });
      const replacement =
        $from.parent.isTextblock &&
        range.from === $from.start() &&
        range.to === $from.end() &&
        $from.depth > 0 &&
        $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), node.type)
          ? { from: $from.before(), to: $from.after() }
          : null;
      if (replacement === null) return null;
      state.tr.replaceWith(replacement.from, replacement.to, node);
      return undefined;
    },
  });
}

/**
 * A pasted exact formula becomes a formula node. Inline formulas replace the
 * selection in the current textblock; a block formula replaces an empty
 * paragraph or lands after the current paragraph with a paragraph below.
 * Anything that is not exactly one `$…$`/`$$…$$` string stays a plain paste.
 */
function insertPastedFormula(view: EditorView, text: string): boolean {
  const tr = formulaPasteTransaction(view.state, text);
  if (tr === null) return false;
  view.dispatch(tr.scrollIntoView());
  return true;
}

export const InlineFormulaNode = InlineMath.extend({
  addAttributes() {
    const parent = (this.parent?.() ?? {}) as Record<string, unknown>;
    return { ...parent, anchorIds: anchorIdsAttribute() };
  },
  addInputRules() {
    return [
      new InputRule({
        find: findInlineMathInput,
        handler: ({ state, range, match }) => {
          const latex = (match as FunctionInputRuleMatch).data?.latex;
          if (typeof latex !== 'string') return null;
          state.tr.replaceWith(range.from, range.to, this.type.create({ latex }));
          return undefined;
        },
      }),
    ];
  },
  addNodeView() {
    return formulaNodeView();
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('formulaPaste'),
        props: {
          handlePaste: (view, event) => {
            if (!view.editable) return false;
            const text = event.clipboardData?.getData('text/plain') ?? '';
            if (text.trim().length === 0) return false;
            // Only take the paste when the formula actually inserts; anything
            // else keeps the default paste path.
            if (!insertPastedFormula(view, text)) return false;
            event.preventDefault();
            return true;
          },
        },
      }),
    ];
  },
}).configure({ katexOptions: { throwOnError: false } });

export const BlockFormulaNode = BlockMath.extend({
  addAttributes() {
    const parent = (this.parent?.() ?? {}) as Record<string, unknown>;
    return { ...parent, anchorIds: anchorIdsAttribute() };
  },
  addInputRules() {
    return [blockMathInputRule(() => this.type)];
  },
  addNodeView() {
    return formulaNodeView();
  },
  // `$$` + Enter creates an empty block formula without going through the
  // input rule (which requires the closing delimiter).
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.editor.isEditable) return false;
        const { selection } = this.editor.state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if ($from.parent.type.name !== 'paragraph') return false;
        if (!isBlockMathEnterTrigger($from.parent.textContent)) return false;
        if ($from.parentOffset !== $from.parent.content.size) return false;
        const node = this.type.create({ latex: '' });
        const from = $from.before();
        const tr = this.editor.state.tr.replaceWith(from, $from.after(), node);
        this.editor.view.dispatch(tr.scrollIntoView());
        this.editor.view.focus();
        return true;
      },
    };
  },
}).configure({ katexOptions: { throwOnError: false } });
