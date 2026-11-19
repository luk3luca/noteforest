/**
 * Heading marker helpers (v0.1.1, Track A).
 *
 * The marker is an editor affordance: a widget that shows `#` × level at the
 * start of the heading that owns the caret. It is never document text. The
 * level rules are pure so the caps and the one-transaction shape are tested
 * without a ProseMirror view:
 *
 * - `#` at the heading start raises H1→H2→H3. A note caps at 3; the fourth
 *   `#` is consumed as a no-op (Q2).
 * - Backspace at the heading start lowers H3→H2→H1→paragraph (Q3).
 * - A guest `.md` follows the flat schema's 1–6.
 */

import { closeHistory } from '@tiptap/pm/history';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';

/** A note heading is 1–3; the flat Markdown guest schema is 1–6. */
export const NOTE_HEADING_MAX_LEVEL = 3;
export const FLAT_HEADING_MAX_LEVEL = 6;

/** The heading level of a node, or 0 when the node is not a heading. */
export function headingLevel(node: PMNode): number {
  if (node.type.name !== 'heading') return 0;
  const value = node.attrs['level'];
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6
    ? value
    : 0;
}

/** `#` × level; the empty string for a non-heading level. */
export function headingMarkerText(level: number): string {
  return level >= 1 && level <= 6 ? '#'.repeat(level) : '';
}

/** The level one `#` raises to, or null at the cap. */
export function raisedHeadingLevel(level: number, maxLevel: number): number | null {
  if (level < 1 || level >= maxLevel) return null;
  return Math.min(level + 1, maxLevel);
}

/** The level one Backspace lowers to; 0 means paragraph. */
export function loweredHeadingLevel(level: number): number | null {
  if (level < 1) return null;
  return level - 1;
}

export interface HeadingMarkerInfo {
  /** Widget position: the start of the heading textblock. */
  pos: number;
  level: number;
  text: string;
}

/** The marker for a collapsed caret inside an editable heading, or null. */
export function headingMarkerAt(
  state: EditorState,
  options: { editable: boolean },
): HeadingMarkerInfo | null {
  if (!options.editable) return null;
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const level = headingLevel($from.parent);
  if (level === 0) return null;
  return { pos: $from.start(), level, text: headingMarkerText(level) };
}

export type HeadingLevelAction = 'raise' | 'lower';

export interface HeadingLevelChange {
  transaction: Transaction;
  /** The resulting heading level; 0 means the node became a paragraph. */
  level: number;
}

/**
 * One transaction for a level change at the heading start, or `'consume'` for
 * the no-op at the note cap, or null when the caret is not at a heading start.
 * `closeHistory` keeps the change out of the preceding typing group, so one
 * undo restores the previous level.
 */
export function headingLevelTransaction(
  state: EditorState,
  action: HeadingLevelAction,
  maxLevel: number,
): HeadingLevelChange | 'consume' | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parentOffset !== 0) return null;
  const level = headingLevel($from.parent);
  if (level === 0) return null;

  const pos = $from.before();
  if (action === 'raise') {
    const next = raisedHeadingLevel(level, maxLevel);
    if (next === null) return 'consume';
    const transaction = state.tr.setNodeMarkup(pos, undefined, {
      ...$from.parent.attrs,
      level: next,
    });
    closeHistory(transaction);
    return { transaction, level: next };
  }

  const next = loweredHeadingLevel(level);
  if (next === null) return null;
  if (next === 0) {
    const paragraph = state.schema.nodes['paragraph'];
    if (paragraph === undefined) return null;
    const transaction = state.tr.setNodeMarkup(pos, paragraph, {});
    closeHistory(transaction);
    return { transaction, level: 0 };
  }
  const transaction = state.tr.setNodeMarkup(pos, undefined, {
    ...$from.parent.attrs,
    level: next,
  });
  closeHistory(transaction);
  return { transaction, level: next };
}
