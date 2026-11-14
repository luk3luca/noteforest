/**
 * Contextual table toolbar (special-text editing, D).
 *
 * Shown only while the caret is inside a table and the surface is editable.
 * Row/column operations, per-column alignment, Copy as Markdown and a
 * read-only source popover. No merge, header toggle or resize.
 */

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Code2,
  Columns3,
  Copy,
  Rows3,
} from 'lucide-react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import { useEffect, useState } from 'react';
import { writeClipboardText } from '../lib/clipboard';
import {
  currentCellAlign,
  insertParagraphAroundTable,
  setColumnAlign,
  tableGfmAtSelection,
  type TableAlign,
} from './table-commands';

interface TableSnapshot {
  align: TableAlign | null;
  gfm: string;
}

function readTable(editor: Editor): TableSnapshot {
  return { align: currentCellAlign(editor), gfm: tableGfmAtSelection(editor) ?? '' };
}

function useTableSnapshot(editor: Editor): TableSnapshot {
  const [snapshot, setSnapshot] = useState<TableSnapshot>(() => readTable(editor));
  useEffect(() => {
    const update = (): void => {
      const next = readTable(editor);
      setSnapshot((previous) =>
        previous.align === next.align && previous.gfm === next.gfm ? previous : next,
      );
    };
    update();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);
  return snapshot;
}

export function TableToolbar({ editor }: { editor: Editor }): JSX.Element {
  const { align, gfm } = useTableSnapshot(editor);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!editor.isActive('table')) setSourceOpen(false);
  }, [editor, gfm]);

  const run = (action: string): void => {
    const chain = editor.chain().focus();
    switch (action) {
      case 'row-above':
        chain.addRowBefore().run();
        break;
      case 'row-below':
        chain.addRowAfter().run();
        break;
      case 'row-delete':
        chain.deleteRow().run();
        break;
      case 'column-left':
        chain.addColumnBefore().run();
        break;
      case 'column-right':
        chain.addColumnAfter().run();
        break;
      case 'column-delete':
        chain.deleteColumn().run();
        break;
      default:
        break;
    }
  };

  const copy = (): void => {
    void writeClipboardText(gfm).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <BubbleMenu
      editor={editor}
      className="nf-table-toolbar"
      data-testid="table-toolbar"
      shouldShow={({ editor: current }) => current.isEditable && current.isActive('table')}
    >
      <div className="nf-table-toolbar-row" role="toolbar" aria-label="Table">
        <button
          type="button"
          className="nf-bubble-button"
          data-action="row-above"
          aria-label="Insert row above"
          title="Insert row above"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run('row-above')}
        >
          <ArrowUpToLine size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-bubble-button"
          data-action="row-below"
          aria-label="Insert row below"
          title="Insert row below"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run('row-below')}
        >
          <ArrowDownToLine size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-bubble-button"
          data-action="row-delete"
          aria-label="Delete row"
          title="Delete row"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run('row-delete')}
        >
          <Rows3 size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <span className="nf-bubble-sep" aria-hidden="true" />
        <button
          type="button"
          className="nf-bubble-button"
          data-action="column-left"
          aria-label="Insert column left"
          title="Insert column left"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run('column-left')}
        >
          <ArrowLeftToLine size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-bubble-button"
          data-action="column-right"
          aria-label="Insert column right"
          title="Insert column right"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run('column-right')}
        >
          <ArrowRightToLine size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-bubble-button"
          data-action="column-delete"
          aria-label="Delete column"
          title="Delete column"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run('column-delete')}
        >
          <Columns3 size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <span className="nf-bubble-sep" aria-hidden="true" />
        <button
          type="button"
          className="nf-bubble-button"
          data-action="align-left"
          aria-label="Align column left"
          title="Align column left"
          aria-pressed={align === 'left'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setColumnAlign(editor, 'left')}
        >
          <AlignLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-bubble-button"
          data-action="align-center"
          aria-label="Align column center"
          title="Align column center"
          aria-pressed={align === 'center'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setColumnAlign(editor, 'center')}
        >
          <AlignCenter size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-bubble-button"
          data-action="align-right"
          aria-label="Align column right"
          title="Align column right"
          aria-pressed={align === 'right'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setColumnAlign(editor, 'right')}
        >
          <AlignRight size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <span className="nf-bubble-sep" aria-hidden="true" />
        <button
          type="button"
          className="nf-bubble-button nf-bubble-wide"
          data-action="paragraph-above"
          aria-label="Paragraph above"
          title="Insert a paragraph above the table"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => insertParagraphAroundTable(editor, 'before')}
        >
          <span aria-hidden="true">¶</span>
          <span>Above</span>
        </button>
        <button
          type="button"
          className="nf-bubble-button nf-bubble-wide"
          data-action="paragraph-below"
          aria-label="Paragraph below"
          title="Insert a paragraph below the table"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => insertParagraphAroundTable(editor, 'after')}
        >
          <span aria-hidden="true">¶</span>
          <span>Below</span>
        </button>
        <span className="nf-bubble-sep" aria-hidden="true" />
        <button
          type="button"
          className="nf-bubble-button nf-bubble-wide"
          data-action="copy-markdown"
          aria-label="Copy table as Markdown"
          title="Copy table as Markdown"
          onMouseDown={(event) => event.preventDefault()}
          onClick={copy}
        >
          <Copy size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{copied ? 'Copied' : 'Markdown'}</span>
        </button>
        <button
          type="button"
          className="nf-bubble-button nf-bubble-wide"
          data-action="toggle-source"
          aria-label="Show table source"
          aria-expanded={sourceOpen}
          aria-pressed={sourceOpen}
          title="Show table source"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setSourceOpen((open) => !open)}
        >
          <Code2 size={14} strokeWidth={1.5} aria-hidden="true" />
          <span>{sourceOpen ? 'Hide source' : 'Source'}</span>
        </button>
      </div>
      {sourceOpen ? (
        <pre className="nf-table-source" data-table-source="true" aria-label="Table source">
          {gfm}
        </pre>
      ) : null}
    </BubbleMenu>
  );
}
