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
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  headingLevel,
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
            // Native Home is a document-scroll command on macOS, so the caret
            // does not move in a contenteditable. Home at a heading still means
            // "start of this heading"; do it in one selection transaction so
            // `Home` + `#` raises the heading and the marker stays truthful.
            if (
              event.key === 'Home' &&
              !event.shiftKey &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey
            ) {
              const caret = liveCaretPos(view) ?? view.state.selection.from;
              const $caret = view.state.doc.resolve(caret);
              if (headingLevel($caret.parent) === 0) return false;
              const start = $caret.start();
              if (view.state.selection.from === start && view.state.selection.empty) {
                return true;
              }
              view.dispatch(
                view.state.tr
                  .setSelection(TextSelection.create(view.state.doc, start))
                  .scrollIntoView(),
              );
              return true;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) return false;
            const action =
              event.key === '#' ? 'raise' : event.key === 'Backspace' ? 'lower' : null;
            if (action === null) return false;
            // A native ⌘← can move the DOM caret before ProseMirror sees the
            // selection change; read the live caret so `#` raises the heading
            // the user is actually in (the `arrowStays` pattern).
            const caret = liveCaretPos(view);
            const result = headingLevelTransaction(view.state, action, maxLevel, caret ?? undefined);
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

/**
 * The DOM caret as a document position, or null when it is not a collapsed
 * caret inside this editor. A non-collapsed DOM selection keeps the caller on
 * the ProseMirror state path: `#` over a range must stay literal typing.
 */
function liveCaretPos(view: {
  dom: HTMLElement;
  posAtDOM: (node: Node, offset: number) => number;
}): number | null {
  const dom = window.getSelection();
  if (dom === null || dom.rangeCount === 0 || dom.anchorNode === null) return null;
  if (!dom.isCollapsed) return null;
  if (!view.dom.contains(dom.anchorNode)) return null;
  try {
    return view.posAtDOM(dom.anchorNode, dom.anchorOffset);
  } catch {
    return null;
  }
}
