/**
 * Table commands and conversions (special-text editing, area D).
 *
 * Helpers over the editor state: locate the table at the caret, read the
 * current column alignment, set a whole column's alignment, serialize the
 * table as GFM, and convert typed/pasted GFM into a table node.
 */

import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { gfmFromTableNode, parseGfmTable } from '../lib/gfm-table';
import { gfmInlineFromNode, tableNodeFromGfm } from './table-node';

export type TableAlign = 'left' | 'center' | 'right';

export interface TableLocation {
  node: PMNode;
  pos: number;
  /** Index of the cell that owns the caret inside its row. */
  cellIndex: number;
}

export function tableAtSelection(editor: Editor): TableLocation | null {
  return tableAtSelectionFrom(editor.state);
}

function tableAtSelectionFrom(state: EditorState): TableLocation | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== 'table') continue;
    return {
      node: $from.node(depth),
      pos: $from.before(depth),
      cellIndex: $from.index(depth + 1),
    };
  }
  return null;
}

export function currentCellAlign(editor: Editor): TableAlign | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      const value = node.attrs['align'];
      return value === 'left' || value === 'center' || value === 'right' ? value : null;
    }
  }
  return null;
}

/** Set every cell of the caret's column to one alignment. */
export function setColumnAlign(editor: Editor, align: TableAlign): boolean {
  const table = tableAtSelection(editor);
  if (table === null) return false;
  const { state } = editor;
  const tr = state.tr;
  table.node.forEach((row, rowOffset) => {
    const cell = row.child(table.cellIndex);
    if (cell === null) return;
    let cellPos = table.pos + 1 + rowOffset + 1;
    for (let index = 0; index < table.cellIndex; index += 1) {
      cellPos += row.child(index).nodeSize;
    }
    if (cell.attrs['align'] === align) return;
    tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, align });
  });
  if (tr.doc.eq(state.doc)) return false;
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/** The table at the caret as GFM Markdown, or null outside a table. */
export function tableGfmAtSelection(editor: Editor): string | null {
  const table = tableAtSelection(editor);
  if (table === null) return null;
  return gfmFromTableNode(table.node.toJSON() as Parameters<typeof gfmFromTableNode>[0]);
}

/**
 * The one transaction that inserts an empty paragraph immediately
 * before/after the table at the caret. Pure so the resulting document is
 * unit-tested without a view.
 */
export function paragraphAroundTableTransaction(
  state: EditorState,
  where: 'before' | 'after',
): { tr: Transaction; pos: number } | null {
  const table = tableAtSelectionFrom(state);
  if (table === null) return null;
  const paragraph = state.schema.nodes['paragraph'];
  if (paragraph === undefined) return null;
  const inserted = paragraph.createAndFill();
  if (inserted === null) return null;
  const at = where === 'before' ? table.pos : table.pos + table.node.nodeSize;
  const tr = state.tr.insert(at, inserted);
  const pos = at + 1;
  tr.setSelection(TextSelection.create(tr.doc, pos));
  return { tr, pos };
}

/**
 * Insert one empty paragraph immediately before/after the table, in the same
 * block body, and put the caret in it. One transaction, one undo entry. The
 * action is always enabled inside a table: a block that already has a
 * paragraph simply gets another one.
 */
export function insertParagraphAroundTable(
  editor: Editor,
  where: 'before' | 'after',
): boolean {
  const plan = paragraphAroundTableTransaction(editor.state, where);
  if (plan === null) return false;
  editor.view.dispatch(plan.tr.scrollIntoView());
  editor.view.focus();
  return true;
}

// ---------------------------------------------------------------------------
// Typed conversion and paste
// ---------------------------------------------------------------------------

interface ParagraphRun {
  from: number;
  to: number;
  lines: string[];
}

interface RunOptions {
  /** Stop at the caret paragraph (used by the blank paragraph trigger). */
  backwardsOnly: boolean;
}

/**
 * The contiguous paragraph run directly inside a block body. Returns null when
 * the caret is not on a paragraph that belongs to a `blockBody`, which also
 * excludes code blocks, tables, lists and blockquotes.
 */
function paragraphsAround(editor: Editor, pos: number, options: RunOptions): ParagraphRun | null {
  const $pos = editor.state.doc.resolve(pos);
  const paragraph = $pos.parent;
  if (paragraph.type.name !== 'paragraph') return null;
  if ($pos.depth < 2) return null;
  const container = $pos.node($pos.depth - 1);
  if (container.type.name !== 'blockBody') return null;
  const index = $pos.index($pos.depth - 1);
  const paragraphStart = $pos.before();
  let first = index;
  while (first > 0 && container.child(first - 1).type.name === 'paragraph') first -= 1;
  let last = index;
  if (!options.backwardsOnly) {
    while (last + 1 < container.childCount && container.child(last + 1).type.name === 'paragraph') {
      last += 1;
    }
  }
  let from = paragraphStart;
  for (let childIndex = index - 1; childIndex >= first; childIndex -= 1) {
    from -= container.child(childIndex).nodeSize;
  }
  let to = paragraphStart + paragraph.nodeSize;
  for (let childIndex = index + 1; childIndex <= last; childIndex += 1) {
    to += container.child(childIndex).nodeSize;
  }
  const lines: string[] = [];
  for (let childIndex = first; childIndex <= last; childIndex += 1) {
    // Marks and inline math were consumed by the input rules while the line was
    // typed; rebuild the cell source from the inline nodes/marks so Enter or
    // Mod-Enter does not lose bold, italic, code or `$…$`.
    lines.push(gfmInlineFromNode(container.child(childIndex)));
  }
  return { from, to, lines };
}

function insertTableFromRun(
  editor: Editor,
  run: ParagraphRun,
  addParagraphAfter: boolean,
  caretAfterTable = false,
): boolean {
  const data = parseGfmTable(run.lines.join('\n'));
  if (data === null) return false;
  const table = tableNodeFromGfm(editor.state.schema, data);
  if (table === null) return false;
  const { state } = editor;
  const tr = state.tr.replaceWith(run.from, run.to, table);
  if (addParagraphAfter) {
    const paragraph = state.schema.nodes['paragraph'];
    if (paragraph === undefined) return false;
    const inserted = paragraph.createAndFill();
    if (inserted === null) return false;
    const after = run.from + table.nodeSize;
    tr.insert(after, inserted);
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  } else if (caretAfterTable) {
    // The blank trigger paragraph is kept below the table: the caret starts
    // inside it, so the next keystroke lands in the document (F5).
    tr.setSelection(TextSelection.create(tr.doc, run.from + table.nodeSize + 1));
  }
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Enter on a blank paragraph converts the table lines directly above it. The
 * blank paragraph stays, below the new table, and keeps the caret; another data
 * row can therefore be typed by pressing Enter again before the conversion
 * happens.
 */
export function convertTableOnBlankParagraph(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  if (!editor.state.selection.empty) return false;
  if ($from.parent.type.name !== 'paragraph') return false;
  if ($from.parent.textContent.length !== 0) return false;
  if ($from.depth < 2) return false;
  const container = $from.node($from.depth - 1);
  if (container.type.name !== 'blockBody') return false;
  const index = $from.index($from.depth - 1);
  if (index === 0) return false;
  const previous = container.child(index - 1);
  if (previous.type.name !== 'paragraph') return false;
  // Resolve inside the previous paragraph, not between the two blocks, and stop
  // the run at it: the blank trigger paragraph must stay and keep the caret.
  const previousStart = $from.before() - previous.nodeSize;
  const previousRun = paragraphsAround(editor, previousStart + 1, { backwardsOnly: true });
  if (previousRun === null) return false;
  return insertTableFromRun(editor, previousRun, false, true);
}

/**
 * Mod-Enter converts the contiguous paragraph run around the caret and leaves
 * the caret in a blank paragraph below the table. On a blank paragraph after
 * the table it falls back to the blank-paragraph trigger.
 */
export function convertTableAtSelection(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  if ($from.parent.type.name !== 'paragraph') return false;
  const around = paragraphsAround(editor, $from.pos, { backwardsOnly: false });
  if (around !== null && parseGfmTable(around.lines.join('\n')) !== null) {
    return insertTableFromRun(editor, around, true);
  }
  if ($from.parent.textContent.length === 0) return convertTableOnBlankParagraph(editor);
  return false;
}
