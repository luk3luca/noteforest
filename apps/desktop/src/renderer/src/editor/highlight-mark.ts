/**
 * Highlight mark (F4b, docs/design/highlight.md §2–§5).
 *
 * The mark is a stored inline range with one attribute, `tone`. Because it is
 * a real ProseMirror mark we get, for free: range mapping across edits, undo,
 * copy/paste (a highlight copied into another block keeps its tone) and
 * deletion (deleting the marked text deletes the mark).
 *
 * It renders as a span carrying `data-highlight-tone`, which is the single
 * class hook Continuous, Page, the Page Edit overlay and the PDF read. It is
 * a content mark, never a transient paint: the find (F4a) keeps using
 * `CSS.highlights` and its own decoration.
 */

import { Mark, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import {
  DEFAULT_HIGHLIGHT_TONE,
  HIGHLIGHT_MARK_TYPE,
  normalizeHighlightTone,
  type HighlightTone,
} from '@noteforest/core';
import { highlightToggleAction, lastHighlightTone } from '../lib/highlight';

export const HighlightMark = Mark.create({
  name: HIGHLIGHT_MARK_TYPE,
  /**
   * A highlight is a fixed range: typing at its right edge must not silently
   * extend it. The mark survives a split, like an anchor.
   */
  inclusive: false,
  keepOnSplit: true,
  addAttributes() {
    return {
      tone: {
        default: DEFAULT_HIGHLIGHT_TONE,
        parseHTML: (element: HTMLElement) =>
          normalizeHighlightTone(element.getAttribute('data-highlight-tone')),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-highlight-tone': normalizeHighlightTone(attributes['tone']),
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-highlight-tone]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'nf-highlight' }),
      0,
    ];
  },
});

/**
 * True when every text node of the selection carries a highlight with `tone`.
 * A caret, an empty range and a selection with unmarked text are all `false`,
 * so `⌘⇧H` only ever removes a highlight the user has actually selected.
 */
export function selectionHasUniformTone(editor: Editor, tone: HighlightTone): boolean {
  const type = editor.schema.marks[HIGHLIGHT_MARK_TYPE];
  if (type === undefined) return false;
  const { from, to } = editor.state.selection;
  if (from === to) return false;
  let sawText = false;
  let uniform = true;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    sawText = true;
    const mark = node.marks.find((candidate) => candidate.type === type);
    if (mark === undefined || normalizeHighlightTone(mark.attrs['tone']) !== tone) {
      uniform = false;
    }
  });
  return sawText && uniform;
}

/** The mark attrs the bubble reads for one tone id. */
export function highlightAttrs(tone: HighlightTone): { tone: HighlightTone } {
  return { tone: normalizeHighlightTone(tone) };
}

/**
 * `⌘⇧H`: apply the session's last tone to the selection, or remove it when the
 * whole selection already carries that tone. Returns false (never consumes the
 * key) without a text selection or in Read mode.
 */
export function toggleLastHighlight(editor: Editor): boolean {
  if (!editor.isEditable) return false;
  const selection = editor.state.selection;
  if (selection.empty) return false;
  const tone = lastHighlightTone();
  if (highlightToggleAction(selectionHasUniformTone(editor, tone)) === 'remove') {
    return editor.chain().focus().unsetMark(HIGHLIGHT_MARK_TYPE).run();
  }
  return editor.chain().focus().setMark(HIGHLIGHT_MARK_TYPE, highlightAttrs(tone)).run();
}
