/**
 * Code block extension (special-text editing, area A).
 *
 * Extends CodeBlockLowlight (lowlight decorations stay untouched) with:
 * - the atomic `anchorIds` attribute and a node view;
 * - Enter parity for the fence paragraph (the space input rule already exists);
 * - the three exits: closing-fence row (node view), ArrowDown at the code end,
 *   and Mod-Enter.
 *
 * The node view does not change the node's schema: it is still a `codeBlock`
 * with `content: "text*"` and no marks.
 */

import { Extension, type Editor } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { TextSelection } from '@tiptap/pm/state';
import { lowlight } from '../lib/code-highlight';
import { anchorIdsAttribute } from './anchor-attrs';
import {
  caretAtCodeEnd,
  codeBlockPos,
  exitCodeBlock,
} from './code-block-actions';
import { parseCodeFenceParagraph, normalizeCodeLanguage } from '../lib/code-fence';
import { PLAINTEXT_LANGUAGE } from '../lib/special-text-constants';
import { CodeBlockNodeView } from './views/code-block-view';

function isCodeChrome(event: Event): boolean {
  const target = event.target;
  return target instanceof Element && target.closest('[data-code-chrome]') !== null;
}

function mutationTargetsCodeChrome(mutation: { target: Node }): boolean {
  const target = mutation.target;
  const element =
    target.nodeType === Node.ELEMENT_NODE
      ? (target as Element)
      : target.parentElement;
  return element !== null && element.closest('[data-code-chrome]') !== null;
}

export const CodeBlockNode = CodeBlockLowlight.extend({
  addAttributes() {
    const parent = (this.parent?.() ?? {}) as Record<string, unknown>;
    return {
      ...parent,
      anchorIds: anchorIdsAttribute(),
    };
  },
  addNodeView() {
    return ({ node, editor, getPos }) =>
      new CodeBlockNodeView({ editor, node, getPos });
  },
}).configure({
  lowlight,
  defaultLanguage: PLAINTEXT_LANGUAGE,
  HTMLAttributes: { 'data-anchor-kind': 'code' },
});

/**
 * Turn a paragraph whose whole text is a fence into an empty code block with
 * the parsed language. `parseCodeFenceParagraph` only accepts the exact fence
 * shape, so three backticks inside a code block remain literal text.
 */
function fenceParagraphToCodeBlock(editor: Editor): boolean {
  const { selection } = editor.state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if ($from.parent.type.name !== 'paragraph') return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  const languageToken = parseCodeFenceParagraph($from.parent.textContent);
  if (languageToken === null) return false;
  const codeBlockType = editor.state.schema.nodes['codeBlock'];
  if (codeBlockType === undefined) return false;
  const container = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  if (!container.canReplaceWith(index, index + 1, codeBlockType)) return false;
  const node = codeBlockType.create(
    { language: normalizeCodeLanguage(languageToken) },
    null,
  );
  const from = $from.before();
  const tr = editor.state.tr.replaceWith(from, $from.after(), node);
  tr.setSelection(TextSelection.create(tr.doc, from + 1));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

/** ArrowDown/Mod-Enter leave the block from its end (or anywhere for Mod-Enter). */
export const CodeBlockKeys = Extension.create({
  name: 'codeBlockKeys',
  priority: 1100,

  addKeyboardShortcuts() {
    const canEdit = (): boolean => this.editor.isEditable;
    return {
      Enter: () => {
        if (!canEdit()) return false;
        if (this.editor.isActive('codeBlock')) return false;
        return fenceParagraphToCodeBlock(this.editor);
      },

      ArrowDown: () => {
        if (!canEdit()) return false;
        if (!caretAtCodeEnd(this.editor)) return false;
        const pos = codeBlockPos(this.editor);
        if (pos === null) return false;
        return exitCodeBlock(this.editor, pos);
      },

      'Mod-Enter': () => {
        if (!canEdit()) return false;
        const pos = codeBlockPos(this.editor);
        if (pos === null) return false;
        return exitCodeBlock(this.editor, pos);
      },
    };
  },
});
