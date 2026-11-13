/**
 * Inline code backtick toggle (special-text editing, area B).
 *
 * A plain backtick with a collapsed caret toggles the stored `code` mark for
 * the next input; a second backtick or Escape ends it. A non-empty selection
 * wraps/unwraps it. The backtick never enters the text: `Shift+` inserts the
 * literal character, and inside a code block every backtick is literal.
 *
 * The mark is stored (`schema.marks.code`), never text; Markdown export
 * serializes it later.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

function isFormElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true;
  return target.isContentEditable === false;
}

export const InlineCodeBacktick = Extension.create({
  name: 'inlineCodeBacktick',
  priority: 1100,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('inlineCodeBacktick'),
        props: {
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

            event.preventDefault();
            const { from, to, empty, $from } = state.selection;
            const paragraphText = $from.parent.textContent;
            if (empty) {
              // Fence disambiguation: three backticks only at the paragraph
              // start. While the paragraph is just the partial fence run the
              // key is literal, so the space/Enter rules can open a code block.
              const atCaret = paragraphText.slice(0, $from.parentOffset);
              if (atCaret === paragraphText && /^`{0,2}$/.test(paragraphText)) {
                view.dispatch(state.tr.insertText('`').scrollIntoView());
                return true;
              }
              // A paragraph that starts with one literal backtick and has no
              // other one is an opening code span: let the typed-pair input
              // rule see the closing backtick.
              if (/^`[^`\n]*$/.test(paragraphText)) return false;
            }
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
