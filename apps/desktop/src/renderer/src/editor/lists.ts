/**
 * Parenthesised ordered lists (`1) `, `2) `).
 *
 * TipTap's ordered-list input rule matches only the Markdown `1. ` form. The
 * GFM parse/paste path already accepts `1)` as an ordered-list marker, so a
 * typed `1) ` stayed literal text and Enter could not continue the numbering.
 * This extension adds the missing typed form with the same shape as the native
 * rule: it wraps the text block in the schema's `orderedList`, `start` is the
 * typed number (minimum 1), and a new marker joins an adjacent list when the
 * numbers line up exactly like `2. ` does.
 *
 * The extensions are shared by Continuous Edit and the Page Edit overlay, so
 * the rule works in both; Read never mounts an editable editor. The Markdown
 * file view has its own extension set and is out of scope here.
 */

import { Extension, wrappingInputRule, type InputRule } from '@tiptap/core';
import type { NodeType } from '@tiptap/pm/model';

/**
 * `1)` + a single space at the start of a text block. The `^` anchor mirrors
 * TipTap's `^(\d+)\.\s$`: parentheses inside prose ("see 1) here") never match,
 * and the two rules cannot both match one input.
 */
export const PAREN_ORDERED_LIST_INPUT = /^(\d+)\)\s$/;

/**
 * Ordered-list `start` for the text before the caret, or null when the text is
 * not a paren marker. `0)` and negative-looking input clamp to 1 because an
 * `orderedList` start below 1 is meaningless.
 */
export function parenOrderedListStart(textBefore: string): number | null {
  const match = PAREN_ORDERED_LIST_INPUT.exec(textBefore);
  if (match === null) return null;
  return orderedListStart(match[1]);
}

function orderedListStart(digits: string | undefined): number {
  const typed = Number.parseInt(digits ?? '', 10);
  return Number.isFinite(typed) ? Math.max(1, typed) : 1;
}

/**
 * The input rule itself, separate from the extension so a unit test can run the
 * real handler against a real `EditorState` without a DOM or a mounted editor.
 */
export function parenOrderedListRule(type: NodeType): InputRule {
  return wrappingInputRule({
    find: PAREN_ORDERED_LIST_INPUT,
    type,
    // `match[0]` is the whole marker, so the pure matcher is the single source
    // for the start value (the native rule uses `+match[1]`).
    getAttributes: (match) => ({ start: parenOrderedListStart(match[0]) ?? 1 }),
    // Same join rule as the native `1. ` extension: typing the next number
    // continues the adjacent list instead of starting a second one.
    joinPredicate: (match, node) =>
      (!node.attrs['type'] || node.attrs['type'] === '1') &&
      node.childCount + node.attrs['start'] === (parenOrderedListStart(match[0]) ?? 1),
  });
}

export const ParenOrderedListInput = Extension.create({
  name: 'parenOrderedListInput',

  addInputRules() {
    const orderedList = this.editor.schema.nodes['orderedList'];
    // A schema without lists (a future narrow surface) keeps the rule inert
    // instead of throwing at editor creation.
    if (orderedList === undefined) return [];
    return [parenOrderedListRule(orderedList)];
  },
});
