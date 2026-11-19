/**
 * Contextual table toolbar (special-text editing D; editor appearance phase 1).
 *
 * Shown only while the caret is inside a table and the surface is editable.
 * Table management only, 13 actions: row/column operations, per-column
 * alignment, paragraph insertion around the table, Copy as Markdown and a
 * read-only source popover. No merge, header toggle or resize.
 *
 * Formatting is the selection bubble's job (`SelectionToolbar`), so a cell
 * selection never grows this bar. The silhouette is one compact icon row, no
 * taller than a table header row.
 *
 * The bar is anchored to the table bottom edge, not the active cell: the
 * reference rect is a zero-height line at the table bottom, so moving the
 * caret between cells never moves it. It is portaled to the body, outside the
 * horizontal scroll wrapper; page/table scroll may move it. Floating UI
 * shift/flip keep it inside the viewport. The source preview is a separate
 * read-only panel, not part of the bar, so expanding it never grows the
 * silhouette. Commands, labels, roles, and keyboard behavior are unchanged.
 */

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Check,
  Code2,
  Columns3,
  Copy,
  Rows3,
  X,
} from 'lucide-react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/** Stable plugin key: the toolbar owns its bubble and never shares the default. */
const TABLE_TOOLBAR_MENU_KEY = new PluginKey('tableToolbarMenu');
const TABLE_TOOLBAR_OFFSET = 8;
/** Space between the table bottom edge and the management bar. */
const TABLE_TOOLBAR_GAP = 10;
/** First-show height before the menu is attached (one compact icon row). */
const TABLE_TOOLBAR_ESTIMATED_HEIGHT = 32;

function emptyRect(left: number, top: number, width: number): {
  x: number;
  y: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
} {
  return {
    x: left,
    y: top,
    top,
    bottom: top,
    left,
    right: left + width,
    width,
    height: 0,
  };
}

export function TableToolbar({ editor }: { editor: Editor }): JSX.Element {
  const { align, gfm } = useTableSnapshot(editor);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editor.isActive('table')) setSourceOpen(false);
  }, [editor, gfm]);

  const getReferencedVirtualElement = useCallback(() => {
    if (!editor.isActive('table')) return null;
    const { view, state } = editor;
    const at = view.domAtPos(state.selection.from);
    const node = at.node instanceof Element ? at.node : at.node.parentElement;
    const table = node?.closest('table') ?? null;
    if (table === null) return null;
    const bounds = table.getBoundingClientRect();
    const menuHeight = Math.max(
      menuRef.current?.getBoundingClientRect().height ?? 0,
      TABLE_TOOLBAR_ESTIMATED_HEIGHT,
    );
    // A zero-height reference at the table bottom: placement "top" draws the
    // menu above it, i.e. just under the table. The rect depends only on the
    // table, so a caret move between cells cannot move the bar, and the portal
    // keeps it outside the horizontal scroll wrapper.
    const rect = emptyRect(
      bounds.left,
      bounds.bottom + TABLE_TOOLBAR_GAP + menuHeight,
      bounds.width,
    );
    return {
      getBoundingClientRect: () => rect,
      getClientRects: () => [rect],
    };
  }, [editor]);

  const menuOptions = useMemo(
    () => ({
      placement: 'top' as const,
      offset: TABLE_TOOLBAR_OFFSET,
      flip: { padding: 8 },
      shift: { padding: 8 },
    }),
    [],
  );

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
    <>
      <BubbleMenu
        editor={editor}
        ref={menuRef}
        className="nf-table-toolbar"
        data-testid="table-toolbar"
        pluginKey={TABLE_TOOLBAR_MENU_KEY}
        options={menuOptions}
        getReferencedVirtualElement={getReferencedVirtualElement}
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
            className="nf-bubble-button"
            data-action="paragraph-above"
            aria-label="Insert paragraph above the table"
            title="Insert a paragraph above the table"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertParagraphAroundTable(editor, 'before')}
          >
            <span className="nf-table-toolbar-glyph" aria-hidden="true">
              ¶↑
            </span>
          </button>
          <button
            type="button"
            className="nf-bubble-button"
            data-action="paragraph-below"
            aria-label="Insert paragraph below the table"
            title="Insert a paragraph below the table"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertParagraphAroundTable(editor, 'after')}
          >
            <span className="nf-table-toolbar-glyph" aria-hidden="true">
              ¶↓
            </span>
          </button>
          <span className="nf-bubble-sep" aria-hidden="true" />
          <button
            type="button"
            className="nf-bubble-button"
            data-action="copy-markdown"
            aria-label="Copy table as Markdown"
            title="Copy table as Markdown"
            onMouseDown={(event) => event.preventDefault()}
            onClick={copy}
          >
            {copied ? (
              <Check size={14} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Copy size={14} strokeWidth={1.5} aria-hidden="true" />
            )}
            <span className="nf-table-toolbar-feedback" role="status">
              {copied ? 'Copied' : ''}
            </span>
          </button>
          <button
            type="button"
            className="nf-bubble-button"
            data-action="toggle-source"
            aria-label="Show table source"
            aria-expanded={sourceOpen}
            aria-pressed={sourceOpen}
            title="Show table source"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setSourceOpen((open) => !open)}
          >
            <Code2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </BubbleMenu>
      {sourceOpen
        ? createPortal(
            <div
              className="nf-table-source-panel"
              role="dialog"
              aria-label="Table source"
              data-table-source-panel="true"
            >
              <div className="nf-table-source-header">
                <span>Table source</span>
                <button
                  type="button"
                  className="nf-bubble-button"
                  aria-label="Close table source"
                  title="Close table source"
                  onClick={() => setSourceOpen(false)}
                >
                  <X size={14} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <pre
                className="nf-table-source"
                data-table-source="true"
                aria-label="Table source"
              >
                {gfm}
              </pre>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
