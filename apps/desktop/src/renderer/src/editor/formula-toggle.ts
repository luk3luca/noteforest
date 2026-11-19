/**
 * `$` key handler (v0.1.1, Track A).
 *
 * A non-empty selection wraps into an inline formula; an inline-formula
 * `NodeSelection` unwraps to its LaTeX. An empty caret is never intercepted, so
 * the `$…$` input rule and the exact-string formula paste rule keep working
 * exactly as before.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { formulaToggleTransaction } from '../lib/formula-toggle';

export const FormulaDollarToggle = Extension.create({
  name: 'formulaDollarToggle',
  // Ahead of the branch keymap and the table keymap: no `$` binding exists
  // there, but the ordering keeps this handler first if one is added.
  priority: 1100,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('formulaDollarToggle'),
        props: {
          handleKeyDown: (view, event) => {
            if (!view.editable) return false;
            if (event.isComposing) return false;
            if (event.key !== '$' || event.metaKey || event.ctrlKey || event.altKey) {
              return false;
            }
            const result = formulaToggleTransaction(view.state);
            if (result === null) return false;
            if (result.kind === 'consume') return true;
            view.dispatch(result.transaction.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
