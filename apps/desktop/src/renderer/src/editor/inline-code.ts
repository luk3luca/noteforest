/**
 * Inline code backtick toggle (special-text editing, area B).
 *
 * A plain backtick with a collapsed caret toggles the stored `code` mark for
 * the next input; a second backtick or Escape ends it. A non-empty selection
 * wraps/unwraps it. The backtick never enters the text: `Shift+` inserts the
 * literal character, and inside a code block every backtick is literal.
 *
 * The mark is stored (`schema.marks.code`), never text; Markdown export
 * serializes it later. While the caret is inside a marked range, live-preview
 * widget backticks show the delimiters at both ends; the document keeps only
 * the mark.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { codeMarkRangeIn } from '../lib/inline-code';

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true;
  return target.isContentEditable === false;
}

function delimiterWidget(): HTMLElement {
  const span = document.createElement('span');
  span.className = 'nf-inline-code-delim';
  span.contentEditable = 'false';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = '`';
  return span;
}

/** Backticks at both ends of the code-mark range that owns the caret. */
function delimiterDecorations(state: EditorState): DecorationSet | null {
  const selection = state.selection;
  if (!selection.empty) return null;
  const code = state.schema.marks['code'];
  if (code === undefined) return null;
  const $from = selection.$from;
  const range = codeMarkRangeIn($from.parent, $from.start(), $from.pos, code);
  if (range === null) return null;
  return DecorationSet.create(state.doc, [
    Decoration.widget(range.from, delimiterWidget, {
      side: -1,
      key: `inline-code-open-${range.from}`,
    }),
    Decoration.widget(range.to, delimiterWidget, {
      side: 1,
      key: `inline-code-close-${range.to}`,
    }),
  ]);
}

export const InlineCodeBacktick = Extension.create({
  name: 'inlineCodeBacktick',
  priority: 1100,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('inlineCodeBacktick'),
        props: {
          decorations: (state) => delimiterDecorations(state),
          handleKeyDown: (view, event) => {
            if (!view.editable) return false;
            if (isFormElement(event.target)) return false;
            // `⇧`` is the literal character on a US layout (the shifted key is
            // `~`); the physical code keeps the shortcut layout-independent.
            if (event.code === 'Backquote' && event.shiftKey) {
              event.preventDefault();
              view.dispatch(view.state.tr.insertText('`').scrollIntoView());
              return true;
            }
            if (event.key !== '`' || event.metaKey || event.ctrlKey || event.altKey) return false;
            const { state } = view;
            const code = state.schema.marks['code'];
            if (code === undefined) return false;
            // Inside a code block the character is literal text.
            if (state.selection.$from.parent.type.name === 'codeBlock') return false;

            const { from, to, empty, $from } = state.selection;
            const paragraphText = $from.parent.textContent;
            if (empty) {
              // Fence disambiguation: three backticks only at the paragraph
              // start. While the paragraph is just the partial fence run the
              // key is literal, so the space/Enter rules can open a code block.
              const atCaret = paragraphText.slice(0, $from.parentOffset);
              if (atCaret === paragraphText && /^`{0,2}$/.test(paragraphText)) {
                event.preventDefault();
                view.dispatch(state.tr.insertText('`').scrollIntoView());
                return true;
              }
              // A paragraph that starts with one literal backtick and has no
              // other one is an opening code span: the typed-pair input rule
              // must receive this closing backtick. Do not prevent the default
              // here, or the browser would swallow the character and the pair
              // could never complete.
              if (/^`[^`\n]*$/.test(paragraphText)) return false;
            }
            event.preventDefault();
            const tr = state.tr;
            if (empty) {
              const marks = state.storedMarks ?? $from.marks();
              const active = marks.some((mark) => mark.type === code);
              const next = active
                ? marks.filter((mark) => mark.type !== code)
                : [code.create(), ...marks];
              tr.setStoredMarks(next);
            } else if (state.doc.rangeHasMark(from, to, code)) {
              tr.removeMark(from, to, code);
            } else {
              tr.addMark(from, to, code.create());
            }
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Only consume Escape while a backtick just armed the stored mark; every
      // other Escape keeps the existing blur/exit behaviour.
      Escape: () => {
        if (!this.editor.isEditable) return false;
        const code = this.editor.state.schema.marks['code'];
        if (code === undefined) return false;
        const stored = this.editor.state.storedMarks;
        if (stored === null || !stored.some((mark) => mark.type === code)) return false;
        this.editor.view.dispatch(
          this.editor.state.tr.setStoredMarks(
            stored.filter((mark) => mark.type !== code),
          ),
        );
        return true;
      },
    };
  },
});
