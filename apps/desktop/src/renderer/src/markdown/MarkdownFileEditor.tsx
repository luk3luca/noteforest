import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { FileText, Redo2, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '../state/shell';
import { useMarkdownEntry, useMarkdownFiles } from '../state/markdown';
import { tabElementId, tabPanelElementId } from '../lib/tab-ids';
import { setEditorInteractionMode } from '../editor/editor-ui';
import { SelectionToolbar } from '../editor/SelectionToolbar';
import { TableToolbar } from '../editor/TableToolbar';
import { createFlatMarkdownExtensions } from './flat-schema';
import { MarkdownFilePathContext, MarkdownImageView } from './MarkdownImageView';
import {
  markFlatMarkdownEditor,
  registerMarkdownEditor,
  unregisterMarkdownEditor,
} from './markdown-editor-registry';
import { scheduleMarkdownAutosave } from './markdown-save';

interface MarkdownFileEditorProps {
  path: string;
  active: boolean;
}

interface HistoryState {
  undo: boolean;
  redo: boolean;
}

/**
 * The flat Markdown guest-file surface.
 *
 * Continuous only, Edit/Read. It reuses the code/formula/table node views, the
 * selection/table toolbars, and the prose CSS, but mounts no forest node, no
 * block/chapter label, no outline tree, no Page/PDF control, and no anchor
 * decoration. M2 adds the debounced autosave + ⌘S path, a read-only
 * frontmatter block, and the read-only/large-file states.
 */
export function MarkdownFileEditor({ path, active }: MarkdownFileEditorProps): JSX.Element {
  const entry = useMarkdownEntry(path);
  const interactionMode = useShell(
    (state) => state.viewByDoc[path]?.interactionMode ?? 'edit',
  );
  const setDirty = useMarkdownFiles((state) => state.setDirty);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [history, setHistory] = useState<HistoryState>({ undo: false, redo: false });
  const extensions = useMemo(
    () => createFlatMarkdownExtensions({ image: MarkdownImageView }),
    [],
  );

  const editor = useEditor(
    {
      extensions,
      content: entry?.content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
      editable: false,
      editorProps: {
        attributes: {
          class: 'nf-prosemirror nf-block-prose',
          spellcheck: 'false',
          'aria-label': 'Markdown file body',
          role: 'textbox',
          'aria-multiline': 'true',
        },
      },
      onUpdate: ({ transaction }) => {
        if (!transaction.docChanged) return;
        setDirty(path, true);
        scheduleMarkdownAutosave(path);
      },
      onCreate: ({ editor }) => {
        // The shared formula node view hides "Branch from term" for this flat
        // editor: a guest file has no blocks, anchors, or branches.
        markFlatMarkdownEditor(editor);
      },
    },
    [path],
  );

  const refreshHistory = useCallback((): void => {
    if (editor === null) return;
    try {
      setHistory({ undo: editor.can().undo(), redo: editor.can().redo() });
    } catch {
      setHistory({ undo: false, redo: false });
    }
  }, [editor]);

  useEffect(() => {
    if (editor === null) return undefined;
    registerMarkdownEditor(path, editor);
    refreshHistory();
    editor.on('transaction', refreshHistory);
    editor.on('update', refreshHistory);
    return () => {
      editor.off('transaction', refreshHistory);
      editor.off('update', refreshHistory);
      unregisterMarkdownEditor(path, editor);
    };
  }, [editor, path, refreshHistory]);

  const readOnly = entry !== null && entry.readOnly;
  const tooLarge = entry !== null && entry.tooLarge;
  const missing = entry !== null && entry.missing;
  const editable =
    entry !== null &&
    entry.error === null &&
    active &&
    interactionMode === 'edit' &&
    !readOnly &&
    !tooLarge &&
    !missing;
  const editDisabledReason =
    entry === null
      ? null
      : entry.error !== null
        ? entry.error
        : readOnly
          ? entry.readOnlyReason ?? 'This file is open read-only.'
          : missing
            ? 'This file is no longer on disk. Copy what you need; saving is off.'
            : tooLarge
              ? entry.readOnlyReason ?? 'This file is too large to edit.'
              : null;

  useEffect(() => {
    if (editor === null) return;
    const scrollTop = scrollRef.current?.scrollTop ?? null;
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
    setEditorInteractionMode(editor, interactionMode);
    editor.view.dom.setAttribute(
      'aria-label',
      interactionMode === 'read' ? 'Markdown file body, read mode' : 'Markdown file body',
    );
    if (interactionMode === 'read') editor.view.dom.setAttribute('aria-readonly', 'true');
    else editor.view.dom.removeAttribute('aria-readonly');
    // A contenteditable toggle can scroll the caret into view; keep the same
    // document position across Edit/Read, like the forest continuous surface.
    if (scrollTop !== null) {
      const restore = (): void => {
        if (scrollRef.current !== null) scrollRef.current.scrollTop = scrollTop;
      };
      restore();
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
      });
    }
  }, [editor, editable, interactionMode]);

  const runHistory = (action: 'undo' | 'redo'): void => {
    if (editor === null || !editable) return;
    if (action === 'undo') editor.commands.undo();
    else editor.commands.redo();
    refreshHistory();
  };

  if (entry === null) {
    return <div className="nf-markdown-missing">This Markdown file is not open.</div>;
  }

  return (
    <div
      className="nf-editor nf-markdown-editor"
      id={tabPanelElementId(path)}
      role="tabpanel"
      aria-labelledby={tabElementId(path)}
      style={active ? undefined : { display: 'none' }}
      data-active={active}
      data-markdown-file="true"
      data-interaction-mode={interactionMode}
    >
      <div className="nf-canvas-header nf-markdown-header" data-markdown-header="true">
        <div className="nf-header-group" role="group" aria-label="History">
          <button
            type="button"
            className="nf-header-button"
            data-markdown-undo="true"
            aria-label="Undo"
            title={editable ? 'Undo (⌘Z)' : 'Undo — available in Edit mode'}
            disabled={!editable || !history.undo}
            onClick={() => runHistory('undo')}
          >
            <Undo2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="nf-header-button"
            data-markdown-redo="true"
            aria-label="Redo"
            title={editable ? 'Redo (⇧⌘Z)' : 'Redo — available in Edit mode'}
            disabled={!editable || !history.redo}
            onClick={() => runHistory('redo')}
          >
            <Redo2 size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
        <span className="nf-header-divider" aria-hidden="true" />
        <span className="nf-markdown-badge" data-markdown-badge="true">
          <FileText size={12} strokeWidth={1.6} aria-hidden="true" />
          Markdown file
        </span>
        <span className="nf-markdown-path" title={entry.path}>
          {entry.path}
        </span>
        <div className="nf-header-spacer" />
        <div
          className="nf-view-controls"
          role="toolbar"
          aria-label="Markdown interaction mode"
          data-markdown-mode-controls="true"
        >
          <div className="nf-view-group" role="group" aria-label="Interaction mode">
            <button
              type="button"
              className="nf-view-segment"
              data-view-interaction="edit"
              data-markdown-mode="edit"
              aria-pressed={interactionMode === 'edit'}
              aria-label="Markdown Edit mode"
              title={
                editDisabledReason === null
                  ? 'Edit this file (⌘E)'
                  : `Can’t edit: ${editDisabledReason}`
              }
              disabled={editDisabledReason !== null}
              onClick={() => useShell.getState().setDocumentInteractionMode(path, 'edit')}
            >
              Edit
            </button>
            <button
              type="button"
              className="nf-view-segment"
              data-view-interaction="read"
              data-markdown-mode="read"
              aria-pressed={interactionMode === 'read'}
              aria-label="Markdown Read mode"
              title="Read this Markdown file (⌘E)"
              disabled={entry.error !== null}
              onClick={() => useShell.getState().setDocumentInteractionMode(path, 'read')}
            >
              Read
            </button>
          </div>
        </div>
      </div>
      {entry.error !== null ? (
        <div className="nf-markdown-error" role="alert" data-markdown-error="true">
          <h2 className="nf-markdown-error-title">Could not open this Markdown file</h2>
          <p className="nf-markdown-error-copy">{entry.error}</p>
          <p className="nf-markdown-error-copy">{entry.path}</p>
        </div>
      ) : entry.tooLarge ? (
        <div className="nf-markdown-error" role="alert" data-markdown-too-large="true">
          <h2 className="nf-markdown-error-title">Markdown file is too large</h2>
          <p className="nf-markdown-error-copy">{entry.readOnlyReason}</p>
          <p className="nf-markdown-error-copy">{entry.path}</p>
        </div>
      ) : (
        <>
          {entry.readOnly || entry.missing ? (
            <div
              className="nf-markdown-banner"
              role="status"
              data-markdown-readonly={entry.readOnly ? 'true' : undefined}
              data-markdown-missing={entry.missing ? 'true' : undefined}
            >
              <strong>{entry.readOnly ? 'Read-only' : 'File missing'}</strong>
              <span>
                {entry.readOnly
                  ? entry.readOnlyReason
                  : 'This file is no longer on disk. Copy anything you still need.'}
              </span>
            </div>
          ) : null}
          <div className="nf-editor-scroll nf-markdown-scroll" ref={scrollRef}>
            <div className="nf-markdown-document">
              <MarkdownFilePathContext.Provider value={path}>
                <EditorContent editor={editor} />
              </MarkdownFilePathContext.Provider>
            </div>
          </div>
        </>
      )}
      {editor === null || !editable || entry.error !== null ? null : (
        <>
          <TableToolbar editor={editor} />
          <SelectionToolbar editor={editor} variant="markdown" />
        </>
      )}
    </div>
  );
}
