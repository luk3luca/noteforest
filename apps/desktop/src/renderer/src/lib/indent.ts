/**
 * Pure structural checks for Indent and Outdent.
 *
 * Indent is deterministic: the block (and its subtree) becomes the last child
 * of its **previous primary sibling**. It never guesses another parent, and it
 * is the same rule the Position menu, palette, and ⇥ keybinding share. The
 * actual move goes through `block.move` in core, which keeps the cycle and
 * non-empty-chapter checks.
 */

import type { Document } from '@noteforest/core';
import { parentIdOf, siblingIds } from './tree';

export type IndentCheck =
  | { ok: true; parentBlockId: string }
  | { ok: false; reason: string };

export type OutdentCheck =
  | { ok: true; parentBlockId: string }
  | { ok: false; reason: string };

/** The previous primary sibling, or a reason why Indent is unavailable. */
export function indentTarget(document: Document, blockId: string): IndentCheck {
  const siblings = siblingIds(document, blockId);
  const index = siblings.indexOf(blockId);
  if (index < 0) {
    return { ok: false, reason: 'This block is not in the current chapter.' };
  }
  const previous = siblings[index - 1];
  if (previous === undefined) {
    return {
      ok: false,
      reason: 'No previous sibling to indent under.',
    };
  }
  return { ok: true, parentBlockId: previous };
}

/** Outdent moves a child after its parent; a top-level block cannot outdent. */
export function outdentTarget(document: Document, blockId: string): OutdentCheck {
  const parent = parentIdOf(document, blockId);
  if (parent === null) {
    return { ok: false, reason: 'Already a top-level block.' };
  }
  return { ok: true, parentBlockId: parent };
}
