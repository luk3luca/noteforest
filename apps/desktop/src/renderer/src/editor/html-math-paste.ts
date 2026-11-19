/**
 * HTML math paste extension (v0.1.1, Track A).
 *
 * TipTap composes each extension's `transformPastedHTML` into the view's paste
 * pipeline, before ProseMirror parses the clipboard HTML and before
 * `transformPasted` runs on the resulting slice. A foreign KaTeX/MathJax/
 * Obsidian container therefore becomes the editor's own inline-math element
 * and the schema builds a real `inlineMath` node.
 *
 * The string work is in `lib/html-math.ts`; this file is only the wiring.
 * NoteForest's own rich HTML is returned untouched by the normalizer, so a
 * note copied into another note keeps its exact content.
 */

import { Extension } from '@tiptap/core';
import { normalizeForeignMathHtml } from '../lib/html-math';

export const HtmlMathPaste = Extension.create({
  name: 'htmlMathPaste',

  transformPastedHTML(html) {
    return normalizeForeignMathHtml(html);
  },
});
