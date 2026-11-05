import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { buildEditorDocument, stripAnchorBindings, type PMNode } from '../lib/adapter';
import { branchSelectionAnchor } from '../lib/anchor-selection';
import {
  ancestorPath,
  chapterIdOf,
  edgePairs,
  parentIdOf,
  subtreeIds,
  visibleBlockIds,
} from '../lib/tree';
import { contentBounds, fitZoom } from '../lib/placement';
import { GEOMETRY } from '../lib/geometry';
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
import { showsChapterCanvas } from '../lib/chapters';
import { recordScroll } from '../state/session';
import { useRuntime } from '../state/registry';
import { SaveFailureBanner } from '../shell/SaveFailureBanner';
import { StaleLockBanner } from '../shell/StaleLockBanner';
import { recordPerf } from '../lib/perf';
import { tabElementId, tabPanelElementId } from '../lib/tab-ids';

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

function DocumentBanners({ runtime }: { runtime: DocumentRuntime }): JSX.Element {
  return (
    <>
      {runtime.readOnlyReason === 'stale-lock' ? (
        <StaleLockBanner runtime={runtime} />
      ) : runtime.status !== 'editable' ? (
        <div className="nf-readonly-banner" role="status">
          Read-only document{runtime.readOnlyReason === undefined ? '' : ` · ${runtime.readOnlyReason}`}. Your file
          is not being modified.
        </div>
      ) : null}
      <SaveFailureBanner runtime={runtime} />
      {runtime.repairNotice === null ? null : (
        <div className="nf-repair-banner" role="status">
          <span>{runtime.repairNotice}</span>
          <button type="button" className="nf-repair-dismiss" onClick={() => runtime.clearRepairNotice()}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}

export function DocumentEditor({ runtime, active }: DocumentEditorProps): JSX.Element {
  // The new-document call to action stays for a pristine, single untitled
  // chapter. A legacy document with named or multiple chapters must keep those
  // chapter cards visible even when every chapter is empty.
  const blockCount = Object.keys(runtime.document.blocks).length;
  if (!showsChapterCanvas(runtime.document.chapters, blockCount)) {
    return (
      <div
        className="nf-editor"
        id={tabPanelElementId(runtime.packagePath)}
        role="tabpanel"
        aria-labelledby={tabElementId(runtime.packagePath)}
        style={active ? undefined : { display: 'none' }}
        data-active={active}
        data-focus-active="false"
      >
        <DocumentBanners runtime={runtime} />
        <div className="nf-empty-state nf-editor-empty">
          <div className="nf-empty-inner">
            <p className="nf-empty-copy">This document has no blocks yet.</p>
            <div className="nf-empty-actions">
              <button
                type="button"
                className="nf-button nf-button-primary"
                disabled={!runtime.editable}
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
        // ADR-0005 copy/paste rule: the source keeps its anchors, the pasted
        // inline/atomic copy loses the binding instead of duplicating an ID.
        transformPasted: (slice, view) => {
          const stripped = stripAnchorBindings({
            type: 'doc',
            content: slice.content.toJSON() as PMNode[],
          });
          const fragment = Fragment.fromJSON(
            view.state.schema,
            stripped.content ?? [],
          );
          return new Slice(fragment, slice.openStart, slice.openEnd);
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
      const selection = editor.state.selection;
      // Any node selection (a block, a formula) is the selected-but-not-editing
      // state that reveals the anchor marker buttons. The prose owns the caret
      // only for a text selection.
      const nodeSelected = selection instanceof NodeSelection;
      // A block is "editing" while its prose owns the caret. A block/node
      // selection or a blurred editor is the selected-but-not-editing state
      // that reveals the anchor marker buttons.
      setEditorSelectedBlock(editor, blockId, editor.isFocused && !nodeSelected);
      runtime.selectBlock(blockId);
    };
    const bindings: EditorBindings = {
      runtime,
      openBlockMenu,
      openChapterMenu,
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
      branchFromSelection: () => {
        const selection = branchSelectionAnchor(editor);
        if (!selection.ok) {
          if (selection.reason !== 'empty') toast.error(selection.message);
          return;
        }
        void runtime.branchFromSelection(selection.selection).then((outcome) => {
          if (!outcome.ok) {
            toast.error(outcome.message ?? 'Could not branch from the selection.');
          }
        });
      },
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
    editor.on('blur', syncSelection);
    syncSelection();
    recordPerf('mount', performance.now() - mountedAt);
    return () => {
      editor.off('selectionUpdate', syncSelection);
      editor.off('focus', syncSelection);
      editor.off('blur', syncSelection);
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
  const view = useShell((state) => state.viewByDoc[runtime.packagePath]);
  const zoom = view?.zoom ?? 1;
  const focusBlockId = view?.focusBlockId ?? null;
  const activePath = useMemo(
    () =>
      new Set(selectedId === null ? [] : ancestorPath(runtime.document, selectedId)),
    [runtime.document, selectedId, runtime.version],
  );
  const edges = useMemo(
    () => edgePairs(runtime.document, runtime.collapsed),
    [runtime.document, runtime.collapsed, runtime.version],
  );
  const rects = useBlockRects(contentRef, runtime.version, editor !== null, zoom);

  /** Ancestor chain + descendants of the focus anchor; null = whole document. */
  const focusSet = useMemo(() => {
    if (focusBlockId === null || runtime.document.blocks[focusBlockId] === undefined) return null;
    const ids = new Set<string>();
    for (const id of ancestorPath(runtime.document, focusBlockId)) ids.add(id);
    for (const id of subtreeIds(runtime.document, focusBlockId)) ids.add(id);
    return ids;
  }, [focusBlockId, runtime.document, runtime.version]);

  // Focus branch is a DOM view filter, never a document edit. A hidden block
  // cannot have a visible descendant in the focus set (the set is the ancestor
  // chain plus an entire subtree), so hiding its row is safe.
  useEffect(() => {
    const root = contentRef.current;
    if (root === null) return;
    for (const card of root.querySelectorAll<HTMLElement>('[data-block-card]')) {
      const id = card.dataset['blockCard'];
      const node = card.closest<HTMLElement>('.nf-block-node');
      if (node === null) continue;
      node.style.display = focusSet === null || (id !== undefined && focusSet.has(id)) ? '' : 'none';
    }
    for (const chapter of root.querySelectorAll<HTMLElement>('.nf-chapter')) {
      const cards = chapter.querySelectorAll<HTMLElement>('[data-block-card]');
      const visible =
        focusSet === null ||
        [...cards].some((card) => {
          const id = card.dataset['blockCard'];
          return id !== undefined && focusSet.has(id);
        });
      chapter.style.display = visible ? '' : 'none';
    }
  }, [focusSet, runtime.version, editor]);

  useEffect(() => {
    if (focusBlockId !== null && runtime.document.blocks[focusBlockId] === undefined) {
      useShell.getState().setDocumentFocus(runtime.packagePath, null);
    }
  }, [focusBlockId, runtime.document, runtime.packagePath]);

  const fitWidth = useCallback(() => {
    const root = contentRef.current;
    const scroller = scrollRef.current;
    if (root === null || scroller === null) return;
    const rootRect = root.getBoundingClientRect();
    const factor = zoom > 0 ? zoom : 1;
    const cards = [...root.querySelectorAll<HTMLElement>('[data-block-card]')].map((card) => {
      const rect = card.getBoundingClientRect();
      return {
        x: (rect.left - rootRect.left) / factor,
        y: (rect.top - rootRect.top) / factor,
        width: rect.width / factor,
        height: rect.height / factor,
      };
    });
    const bounds = contentBounds(cards);
    if (bounds === null) return;
    // Keep the branch port and the collapse control inside the fitted width.
    const next = fitZoom(scroller.clientWidth, bounds.width + 24, {
      paddingX: GEOMETRY.editorPaddingX,
    });
    useShell.getState().setDocumentZoom(runtime.packagePath, next);
    requestAnimationFrame(() => {
      if (scrollRef.current !== null) scrollRef.current.scrollLeft = 0;
    });
  }, [runtime.packagePath, zoom]);

  useEffect(() => {
    if (!active) return undefined;
    const handler = (): void => fitWidth();
    window.addEventListener('nf:fit-width', handler);
    return () => window.removeEventListener('nf:fit-width', handler);
  }, [active, fitWidth]);

  return (
    <div
      className="nf-editor"
      id={tabPanelElementId(runtime.packagePath)}
      role="tabpanel"
      aria-labelledby={tabElementId(runtime.packagePath)}
      style={active ? undefined : { display: 'none' }}
      data-active={active}
      data-focus-active={focusSet !== null}
    >
      <DocumentBanners runtime={runtime} />
      <div
        className="nf-editor-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          if (!active) return;
          recordScroll(runtime.packagePath, event.currentTarget.scrollTop);
        }}
      >
        <div className="nf-canvas" style={{ zoom }} data-zoom={Math.round(zoom * 100)}>
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
