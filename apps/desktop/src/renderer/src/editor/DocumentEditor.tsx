import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { buildEditorDocument } from '../lib/adapter';
import { ancestorPath, chapterIdOf, edgePairs, parentIdOf, visibleBlockIds } from '../lib/tree';
import { createEditorExtensions } from './extensions';
import { BranchKeymap } from './keymap';
import { EdgeLayer } from './edges/EdgeLayer';
import { useBlockRects } from './edges/useBlockRects';
import { SelectionToolbar } from './SelectionToolbar';
import { clearEditorBindings, getDragBlockId, setDragBlockId, setEditorBindings, type EditorBindings } from './bindings';
import { setEditorSelectedBlock } from './editor-ui';
import type { DocumentRuntime } from '../state/runtime';
import { useShell } from '../state/shell';
import { createChapter, openBlockMenu, openChapterMenu, requestBlockDelete } from '../actions';
import { recordScroll } from '../state/session';
import { useRuntime } from '../state/registry';
import { recordPerf } from '../lib/perf';

interface DocumentEditorProps {
  runtime: DocumentRuntime;
  active: boolean;
}

function blockIdAtSelection(editor: Editor): string | null {
  const selection = editor.state.selection;
  if (selection instanceof NodeSelection && selection.node.type.name === 'branchBlock') {
    const id = selection.node.attrs['blockId'];
    return typeof id === 'string' ? id : null;
  }
  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'branchBlock') {
      const id = node.attrs['blockId'];
      return typeof id === 'string' ? id : null;
    }
  }
  return null;
}

export function DocumentEditor({ runtime, active }: DocumentEditorProps): JSX.Element {
  if (Object.keys(runtime.document.blocks).length === 0) {
    return (
      <div className="nf-empty-state nf-editor-empty" style={active ? undefined : { display: 'none' }}>
        <div className="nf-empty-inner">
          <p className="nf-empty-copy">This document has no blocks yet.</p>
          <div className="nf-empty-actions">
            <button
              type="button"
              className="nf-button nf-button-primary"
              onClick={() => {
                const chapterId = runtime.document.chapters[0]?.id;
                if (chapterId !== undefined) void runtime.addTopLevel(chapterId);
              }}
            >
              Add first block
            </button>
          </div>
        </div>
      </div>
    );
  }
  return <EditorSurface runtime={runtime} active={active} />;
}

function EditorSurface({ runtime, active }: DocumentEditorProps): JSX.Element {
  useRuntime(runtime.packagePath);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);

  const editor = useEditor(
    {
      extensions: [...createEditorExtensions(), BranchKeymap],
      content: buildEditorDocument(runtime.document, runtime.collapsed),
      editable: runtime.status === 'editable',
      editorProps: {
        attributes: {
          class: 'nf-prosemirror',
          spellcheck: 'false',
          'aria-label': 'Document body',
          role: 'textbox',
          'aria-multiline': 'true',
        },
      },
      onUpdate: () => {
        runtime.noteEditorUpdate();
      },
    },
    [runtime.packagePath],
  );

  useEffect(() => {
    if (editor === null) return undefined;
    const mountedAt = performance.now();
    runtime.attachEditor(editor);
    const syncSelection = (): void => {
      const blockId = blockIdAtSelection(editor);
      setEditorSelectedBlock(editor, blockId);
      runtime.selectBlock(blockId);
      if (blockId !== null) {
        useShell.getState().setSelectedBlock(runtime.packagePath, blockId);
      }
    };
    const bindings: EditorBindings = {
      runtime,
      openBlockMenu,
      openChapterMenu,
      openBlockActions: openBlockMenu,
      openLinkDialog: () => {
        const href = String(editor.getAttributes('link')['href'] ?? '');
        useShell.getState().openDialog({ kind: 'link', href });
      },
      focusRelative: (blockId: string, direction: -1 | 1) => {
        const ids = visibleBlockIds(runtime.document, runtime.collapsed);
        const index = ids.indexOf(blockId);
        const target = ids[index + direction];
        if (target !== undefined) runtime.focusBlock(target);
      },
      reorder: (blockId: string, direction: -1 | 1) => {
        void runtime.reorderSibling(blockId, direction).then((outcome) => {
          if (!outcome.ok) toast.error(outcome.message ?? 'Could not reorder the block.');
        });
      },
      canReorder: (sourceId: string, targetId: string) => {
        if (sourceId === targetId) return false;
        const sourceParent = parentIdOf(runtime.document, sourceId);
        const targetParent = parentIdOf(runtime.document, targetId);
        if (sourceParent === null || targetParent === null) {
          return (
            sourceParent === null &&
            targetParent === null &&
            chapterIdOf(runtime.document, sourceId) === chapterIdOf(runtime.document, targetId)
          );
        }
        return sourceParent === targetParent;
      },
      dropOnBlock: (sourceId: string, targetId: string, after: boolean) => {
        void runtime.moveBlockBeforeOrAfter(sourceId, targetId, after).then((outcome) => {
          if (!outcome.ok) toast.error(outcome.message ?? 'Could not move the block.');
        });
      },
      setDragSource: (blockId: string | null) => setDragBlockId(blockId),
      dragSource: () => getDragBlockId(),
      requestDelete: (blockId: string) => requestBlockDelete(runtime, blockId),
      report: (outcome) => {
        void outcome.then((value) => {
          if (value !== undefined && value !== null && !value.ok) {
            toast.error(value.message ?? 'The command was rejected.');
          }
        });
      },
      notify: (message: string, kind?: 'error' | 'info') => {
        if (kind === 'error') toast.error(message);
        else toast.info(message);
      },
    };
    setEditorBindings(editor, bindings);
    editor.on('selectionUpdate', syncSelection);
    editor.on('focus', syncSelection);
    syncSelection();
    recordPerf('mount', performance.now() - mountedAt);
    return () => {
      editor.off('selectionUpdate', syncSelection);
      editor.off('focus', syncSelection);
      clearEditorBindings(editor);
      runtime.attachEditor(null);
    };
  }, [editor, runtime]);

  useEffect(() => {
    if (!active) return undefined;
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ kind: 'inline' | 'block'; latex: string; pos: number }>).detail;
      useShell.getState().openDialog({
        kind: 'math',
        mathKind: detail.kind,
        latex: detail.latex,
        pos: detail.pos,
      });
    };
    window.addEventListener('nf:edit-math', handler);
    return () => window.removeEventListener('nf:edit-math', handler);
  }, [active]);

  useEffect(() => {
    if (editor === null || restoredRef.current) return;
    restoredRef.current = true;
    const point = runtime.restore;
    if (point !== null) {
      requestAnimationFrame(() => {
        if (scrollRef.current !== null) scrollRef.current.scrollTop = point.scrollTop;
        if (point.selectedBlockId !== null) runtime.focusBlock(point.selectedBlockId, { scroll: false });
      });
      return;
    }
    if (!active) return;
    const blockIds = Object.keys(runtime.document.blocks);
    if (blockIds.length !== 1) return;
    const only = runtime.document.blocks[blockIds[0] ?? ''];
    if (only === undefined) return;
    const empty = !JSON.stringify(only.content).includes('"text"');
    if (!empty) return;
    runtime.focusBlock(only.id);
    editor.commands.focus();
  }, [editor, runtime, active]);

  const selectedId = runtime.selectedBlockId;
  const activePath = useMemo(
    () =>
      new Set(selectedId === null ? [] : ancestorPath(runtime.document, selectedId)),
    [runtime.document, selectedId, runtime.version],
  );
  const edges = useMemo(
    () => edgePairs(runtime.document, runtime.collapsed),
    [runtime.document, runtime.collapsed, runtime.version],
  );
  const rects = useBlockRects(contentRef, runtime.version, editor !== null);

  return (
    <div className="nf-editor" style={active ? undefined : { display: 'none' }} data-active={active}>
      {runtime.status !== 'editable' ? (
        <div className="nf-readonly-banner" role="status">
          Read-only document{runtime.readOnlyReason === undefined ? '' : ` · ${runtime.readOnlyReason}`}. Your file
          is not being modified.
        </div>
      ) : null}
      {runtime.repairNotice === null ? null : (
        <div className="nf-repair-banner" role="status">
          <span>{runtime.repairNotice}</span>
          <button type="button" className="nf-repair-dismiss" onClick={() => runtime.clearRepairNotice()}>
            Dismiss
          </button>
        </div>
      )}
      <div
        className="nf-editor-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          if (!active) return;
          recordScroll(runtime.packagePath, event.currentTarget.scrollTop);
        }}
      >
        <div className="nf-canvas">
          <div className="nf-canvas-content" ref={contentRef}>
            <EditorContent editor={editor} />
            <EdgeLayer
              edges={edges}
              rects={rects}
              activePath={activePath}
              onEdgeClick={(childId, anchor) => openBlockMenu(childId, anchor)}
              onTrunkClick={(parentId) => {
                void runtime.toggleCollapse(parentId);
              }}
            />
          </div>
          <div className="nf-canvas-footer" contentEditable={false}>
            <button
              type="button"
              className="nf-canvas-action"
              data-canvas-action="add-chapter"
              onClick={() => {
                void createChapter();
              }}
            >
              + Add chapter
            </button>
          </div>
        </div>
      </div>
      {editor === null ? null : <SelectionToolbar editor={editor} />}
    </div>
  );
}
