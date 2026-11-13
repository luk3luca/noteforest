/**
 * Table extension set (special-text editing, area D).
 *
 * - Cells are inline-only: exactly one paragraph of inline content. Legacy
 *   rich cells are flattened by the adapter on load (`normalizeTableCellChildren`)
 *   without a schema version bump.
 * - Keyboard: Tab/Shift+Tab move cells, Tab on the last cell appends a row,
 *   Enter is a hard break, arrows stay inside the cell.
 * - Typed GFM table conversion on a blank paragraph or Mod-Enter, and GFM
 *   table paste conversion (one undo for the typed path).
 * - The table wrapper is overflow-scrolled by CSS; page/PDF are untouched.
 */

import { Extension, type Editor } from '@tiptap/core';
import {
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { parseGfmTable } from '../lib/gfm-table';
import {
  convertTableAtSelection,
  convertTableOnBlankParagraph,
} from './table-commands';
import { tableNodeFromGfm } from './table-node';

/** One paragraph of inline content only. */
export const InlineTableCell = TableCell.extend({ content: 'paragraph' });
export const InlineTableHeader = TableHeader.extend({ content: 'paragraph' });

export const TableExtensions = [
  Table.configure({ resizable: false }),
  TableRow,
  InlineTableCell,
  InlineTableHeader,
];

function insideTable(state: Editor['state']): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'table') return true;
  }
  return false;
}

function insertPastedTable(view: EditorView, text: string): boolean {
  const data = parseGfmTable(text);
  if (data === null) return false;
  if (view.state.selection.$from.parent.type.name === 'codeBlock') return false;
  if (insideTable(view.state)) return false;
  const table = tableNodeFromGfm(view.state.schema, data);
  if (table === null) return false;
  const { state } = view;
  const { $from } = state.selection;
  const tr = state.tr;
  let after: number;
  if ($from.parent.type.name === 'paragraph' && $from.parent.textContent.length === 0) {
    const start = $from.before();
    tr.replaceWith(start, $from.after(), table);
    after = start + table.nodeSize;
  } else {
    const at = $from.after();
    tr.insert(at, table);
    const paragraph = state.schema.nodes['paragraph'];
    const filler = paragraph?.createAndFill();
    if (filler !== null && filler !== undefined) tr.insert(at + table.nodeSize, filler);
    after = at + table.nodeSize;
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
  view.dispatch(tr.scrollIntoView());
  return true;
}

export const TableEditing = Extension.create({
  name: 'tableEditing',
  priority: 1100,

  addKeyboardShortcuts() {
    const canEdit = (): boolean => this.editor.isEditable;
    const inTable = (): boolean => this.editor.isActive('table');

    return {
      // Cells are one inline paragraph: Enter is a hard break, never a new
      // block. Typed GFM conversion only applies to a blank block paragraph.
      Enter: () => {
        if (!canEdit()) return false;
        if (inTable()) {
          if (!this.editor.state.selection.empty) return false;
          return this.editor.commands.setHardBreak();
        }
        if (this.editor.isActive('codeBlock')) return false;
        if (this.editor.isActive('listItem') || this.editor.isActive('blockquote')) return false;
        return convertTableOnBlankParagraph(this.editor);
      },

      Tab: () => {
        if (!canEdit() || !inTable()) return false;
        if (this.editor.can().goToNextCell()) return this.editor.commands.goToNextCell();
        return this.editor.chain().addRowAfter().goToNextCell().run();
      },

      'Shift-Tab': () => {
        if (!canEdit() || !inTable()) return false;
        return this.editor.commands.goToPreviousCell();
      },

      ArrowLeft: () => {
        if (!canEdit() || !inTable()) return false;
        const { selection } = this.editor.state;
        if (!selection.empty) return false;
        return selection.$from.parentOffset === 0;
      },

      ArrowRight: () => {
        if (!canEdit() || !inTable()) return false;
        const { selection } = this.editor.state;
        if (!selection.empty) return false;
        return selection.$from.parentOffset === selection.$from.parent.content.size;
      },

      'Mod-Enter': () => {
        if (!canEdit()) return false;
        if (this.editor.isActive('codeBlock')) return false;
        return convertTableAtSelection(this.editor);
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('gfmTablePaste'),
        props: {
          handlePaste: (view, event) => {
            if (!view.editable) return false;
            const text = event.clipboardData?.getData('text/plain') ?? '';
            if (text.trim().length === 0) return false;
            event.preventDefault();
            return insertPastedTable(view, text);
          },
        },
      }),
    ];
  },
});
