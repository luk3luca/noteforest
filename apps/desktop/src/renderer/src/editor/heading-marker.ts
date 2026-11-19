/**
 * Heading marker editor affordance (v0.1.1, Track A).
 *
 * Shows `#` × level at the start of the heading that owns an editable caret.
 * It is a `Decoration.widget` with `contenteditable=false` and
 * `aria-hidden=true`: never document content, never in the text projection,
 * never in Read mode (the `isEditable` gate) and never in the PDF text layer.
 *
 * Keys at the heading start: `#` raises a level, Backspace lowers it
 * (H3→H2→H1→paragraph). The fourth `#` at the note cap is consumed as a no-op.
 * One transaction per change, outside the preceding typing history group.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  headingLevelTransaction,
  headingMarkerAt,
  NOTE_HEADING_MAX_LEVEL,
} from '../lib/heading-marker';

export interface HeadingMarkerOptions {
  /** 3 in a note, 6 in the flat Markdown guest schema. */
  maxLevel: number;
}

export const HeadingMarker = Extension.create<HeadingMarkerOptions>({
  name: 'headingMarker',
  // Ahead of the branch keymap so Backspace at a heading start lowers the
  // level before the "never cross the block" rule sees it.
  priority: 1100,

  addOptions() {
    return { maxLevel: NOTE_HEADING_MAX_LEVEL };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const maxLevel = this.options.maxLevel;
    return [
      new Plugin({
        key: new PluginKey('headingMarker'),
        props: {
          decorations: (state) => {
            const marker = headingMarkerAt(state, { editable: editor.isEditable });
            if (marker === null) return null;
            const dom = document.createElement('span');
            dom.className = 'nf-heading-marker';
            dom.setAttribute('contenteditable', 'false');
            dom.setAttribute('aria-hidden', 'true');
            dom.dataset['headingMarker'] = 'true';
            dom.textContent = marker.text;
            return DecorationSet.create(state.doc, [
              Decoration.widget(marker.pos, dom, {
                side: -1,
                marks: [],
                key: `heading-marker-${marker.level}`,
              }),
            ]);
          },
          handleKeyDown: (view, event) => {
            if (!view.editable || event.isComposing) return false;
            if (event.metaKey || event.ctrlKey || event.altKey) return false;
            const action =
              event.key === '#' ? 'raise' : event.key === 'Backspace' ? 'lower' : null;
            if (action === null) return false;
            const result = headingLevelTransaction(view.state, action, maxLevel);
            if (result === null) return false;
            if (result === 'consume') return true;
            view.dispatch(result.transaction.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
