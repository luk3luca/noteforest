import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { Fragment, Slice } from '@tiptap/pm/model';
import { EditorState, NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { toast } from 'sonner';
import { buildEditorDocument, markCrossDocumentImages, stripAnchorBindings, stripUnbackedImages, type PMNode } from '../lib/adapter';
import {
  continuousCssVariables,
  continuousEdgeStyle,
} from '@noteforest/layout';
import { branchSelectionAnchor } from '../lib/anchor-selection';
import { imageFilesFromDataTransfer } from '../lib/image';
import { rememberCopiedImages, scheduleImageClipboardRepair } from '../lib/image-clipboard';
import { insertImagesFromFiles } from '../lib/image-insert';
import {
  ancestorPath,
  chapterIdOf,
  edgePairs,
  linkedAnchorIds,
  parentIdOf,
  referenceEdgePairs,
  subtreeIds,
  visibleBlockIds,
} from '../lib/tree';
import { contentBounds, fitZoom } from '../lib/placement';
import { GEOMETRY } from '../lib/geometry';
import { createEditorExtensions } from './extensions';
import { BranchKeymap } from './keymap';
import { EdgeLayer } from './edges/EdgeLayer';
import { useBlockRects } from './edges/useBlockRects';
import { useBelowStackPlacement } from './useBelowStackPlacement';
import { SelectionToolbar } from './SelectionToolbar';
import { TableToolbar } from './TableToolbar';
import { clearEditorBindings, getDragBlockId, setDragBlockId, setEditorBindings, type EditorBindings } from './bindings';
import {
  clearEditorImageAuthoring,
  setEditorInteractionMode,
  setEditorSelectedBlock,
} from './editor-ui';
import type { DocumentRuntime } from '../state/runtime';
import { clearTextHistory } from '../state/editor-projection';
import { useShell } from '../state/shell';
import { useSettingsStore } from '../state/settings';
import type { InteractionMode } from '../../../shared/view-state';
import {
  createChapter,
  openBlockMenu,
  openChapterMenu,
  openReferenceMenu,
  requestBlockDelete,
} from '../actions';
import { editingEnabledFor, READ_MODE_TITLE } from '../lib/editability';
import { showsChapterCanvas } from '../lib/chapters';
import { getScroll, recordScroll } from '../state/session';
import { useRuntime } from '../state/registry';
import { CanvasHeader } from '../shell/CanvasHeader';
import { recordPerf } from '../lib/perf';
import { tabElementId, tabPanelElementId } from '../lib/tab-ids';
import { PageView } from '../page/PageView';

interface DocumentEditorProps {
  runtime: DocumentRuntime;
  active: boolean;
}

/** Canvas content width in layout pixels, independent of CSS zoom. */
function useCanvasWidth(
  ref: RefObject<HTMLDivElement | null>,
  active: boolean,
  canvasMax: number,
): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!active) return undefined;
    const element = ref.current;
    if (element === null) return undefined;
    // The editor has a wide finite logical canvas: placement uses its full
    // content width, not the current viewport. A deep tree therefore keeps
    // going right and the scroll container reveals it, instead of wrapping at
    // the window edge. The CSS canvas grows to max-content (bounded by the
    // same resolved cap), so a short document still fills the viewport without
    // a permanent horizontal scrollbar.
    const logicalWidth = Math.max(
      0,
      canvasMax - 2 * GEOMETRY.editorPaddingX,
    );
    const update = (): void => setWidth(Math.max(element.clientWidth, logicalWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ref, active, canvasMax]);
  return width;
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

/** Block that owns a document position (paste/drop image targeting). */
function blockIdAtPosition(state: EditorState, position: number): string | null {
  let $position;
  try {
    $position = state.doc.resolve(position);
  } catch {
    return null;
  }
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth);
    if (node.type.name === 'branchBlock') {
      const id = node.attrs['blockId'];
      return typeof id === 'string' ? id : null;
    }
  }
  return null;
}

function blockIdAtViewSelection(view: EditorView): string | null {
  const selection = view.state.selection;
  if (selection instanceof NodeSelection && selection.node.type.name === 'branchBlock') {
    const id = selection.node.attrs['blockId'];
    return typeof id === 'string' ? id : null;
  }
  return blockIdAtPosition(view.state, selection.from);
}

/**
 * Document-local notices only (R4). Read-only/stale-lock state is the shell
 * `DocumentStatusPanel`; save failure and the draft materialization failure are
 * shell chrome in `Workspace` so every document-level error shares placement
 * and shape. The repair notice stays here because it describes this editor's
 * content.
 */
function DocumentBanners({ runtime }: { runtime: DocumentRuntime }): JSX.Element {
  return (
    <>
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

function ContinuousEmptyDocument({
  runtime,
  editingEnabled,
}: {
  runtime: DocumentRuntime;
  editingEnabled: boolean;
}): JSX.Element {
  return (
    <div className="nf-empty-state nf-editor-empty" data-continuous-empty="true">
      <div className="nf-empty-inner">
        <p className="nf-empty-copy">This document has no blocks yet.</p>
        <div className="nf-empty-actions">
          <button
            type="button"
            className="nf-button nf-button-primary"
            disabled={!runtime.editable || !editingEnabled}
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

export function DocumentEditor({ runtime, active }: DocumentEditorProps): JSX.Element {
  useRuntime(runtime.packagePath);
  // Continuous has no pages and owns no page model. PageView mounts its own
  // resolved settings/model only while the Page layout is active.
  const layout = useShell(
    (state) => state.viewByDoc[runtime.packagePath]?.layout ?? 'continuous',
  );
  const interactionMode = useShell(
    (state) => state.viewByDoc[runtime.packagePath]?.interactionMode ?? 'edit',
  );
  const focusActive = useShell(
    (state) => (state.viewByDoc[runtime.packagePath]?.focusBlockId ?? null) !== null,
  );
  const editingEnabled = useShell((state) =>
    editingEnabledFor(runtime, state.viewByDoc[runtime.packagePath]),
  );
  // The new-document call to action stays for a pristine, single untitled
  // chapter. A legacy document with named or multiple chapters must keep those
  // chapter cards visible even when every chapter is empty.
  const blockCount = Object.keys(runtime.document.blocks).length;
  const continuousVisible = layout === 'continuous';
  const continuousSettings = useSettingsStore((state) => state.app.continuous);
  const continuousSurfaceStyle = useMemo(
    () => continuousCssVariables(continuousSettings) as CSSProperties,
    [continuousSettings],
  );
  const continuous = showsChapterCanvas(runtime.document.chapters, blockCount) ? (
    <EditorSurface
      runtime={runtime}
      active={active}
      visible={continuousVisible}
      interactionMode={interactionMode}
    />
  ) : (
    <ContinuousEmptyDocument runtime={runtime} editingEnabled={editingEnabled} />
  );

  return (
    <div
      className="nf-editor"
      id={tabPanelElementId(runtime.packagePath)}
      role="tabpanel"
      aria-labelledby={tabElementId(runtime.packagePath)}
      style={active ? undefined : { display: 'none' }}
      data-active={active}
      data-layout={layout}
      data-interaction-mode={interactionMode}
      data-focus-active={focusActive}
    >
      <DocumentBanners runtime={runtime} />
      <div
        className="nf-continuous-surface"
        data-continuous-surface="true"
        style={continuousVisible ? continuousSurfaceStyle : { display: 'none' }}
      >
        {continuous}
      </div>
      {layout === 'page' ? (
        <PageView
          runtime={runtime}
          active={active}
          interactionMode={interactionMode}
        />
      ) : null}
    </div>
  );
}

function EditorSurface({
  runtime,
  active,
  visible,
  interactionMode,
}: DocumentEditorProps & {
  visible: boolean;
  interactionMode: InteractionMode;
}): JSX.Element {
  useRuntime(runtime.packagePath);
  const editingEnabled = useShell((state) =>
    editingEnabledFor(runtime, state.viewByDoc[runtime.packagePath]),
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const restoredRef = useRef(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const interactionModeRef = useRef(interactionMode);
  interactionModeRef.current = interactionMode;
  const continuousSettings = useSettingsStore((state) => state.app.continuous);
  const continuousEdge = useMemo(
    () => continuousEdgeStyle(continuousSettings),
    [continuousSettings],
  );
  /** Whether the editor owned focus when Read mode started. */
  const focusedBeforeRead = useRef(false);
  const previousInteractionMode = useRef(interactionMode);
  const visibleBeforeInteraction = useRef(visible);

  const editor = useEditor(
    {
      extensions: [...createEditorExtensions(), BranchKeymap],
      content: buildEditorDocument(
        runtime.document,
        runtime.collapsed,
        new Set(),
        runtime.assetAvailability,
      ),
      editable: runtime.status === 'editable' && visible && interactionMode === 'edit',
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
        // An image from another document becomes a placeholder until its bytes
        // are copied into this package; it never carries a foreign assetId.
        transformPasted: (slice, view) => {
          const stripped = stripAnchorBindings({
            type: 'doc',
            content: slice.content.toJSON() as PMNode[],
          });
          const backed = stripUnbackedImages(stripped);
          const crossDocument = markCrossDocumentImages(
            backed ?? { type: 'doc' },
            new Set(Object.keys(runtime.document.assets)),
          );
          const fragment = Fragment.fromJSON(
            view.state.schema,
            crossDocument.content ?? [],
          );
          return new Slice(fragment, slice.openStart, slice.openEnd);
        },
        // Image paste/drop copies bytes into the package first; the editable
        // buffer never receives a remote URL or a data: source. Returning true
        // suppresses the default HTML paste before the async import completes.
        handlePaste: (view, event) => {
          // Read mode keeps the surface mounted but must never import or
          // insert content through paste.
          if (!view.editable) return false;
          const files = imageFilesFromDataTransfer(event.clipboardData);
          if (files.length > 0) {
            event.preventDefault();
            void insertImagesFromFiles(runtime, blockIdAtViewSelection(view), files);
            return true;
          }
          // Let ProseMirror insert the canonical slice; the microtask runs
          // after the default paste and imports any cross-document image bytes.
          queueMicrotask(() => scheduleImageClipboardRepair(runtime, editor));
          return false;
        },
        handleDOMEvents: {
          copy: () => {
            // Capture the source package before the clipboard loses context.
            rememberCopiedImages(editor, runtime.packagePath);
            return false;
          },
        },
        handleDrop: (view, event, _slice, moved) => {
          if (!view.editable) return false;
          if (moved) return false;
          const files = imageFilesFromDataTransfer(event.dataTransfer);
          if (files.length === 0) return false;
          event.preventDefault();
          const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const blockId =
            coordinates === null ? null : blockIdAtPosition(view.state, coordinates.pos);
          void insertImagesFromFiles(runtime, blockId, files);
          return true;
        },
      },
      onUpdate: ({ transaction }) => {
        // A hidden surface (page layout) or Read mode must not turn a
        // programmatic rebuild or an editable toggle into a text-history entry.
        // `docChanged` is the real-edit signal: `setEditable` and other
        // non-document transactions must not dirty (or materialize) a draft.
        if (!transaction.docChanged) return;
        if (visibleRef.current && interactionModeRef.current === 'edit') {
          runtime.noteEditorUpdate();
        }
      },
    },
    // The runtime instance is the editor identity. A draft→package path swap
    // must not recreate the TipTap editor (selection, scroll, and text history
    // would be lost); handlers read the current path at call time.
    [runtime],
  );

  useEffect(() => {
    if (editor === null) return undefined;
    const mountedAt = performance.now();
    runtime.attachEditor(editor);
    // A fresh editor can begin with a no-op text-history entry produced by the
    // initial projection. Clear it once the mount transactions settle, before
    // the user can type, so the first undo stays tied to the first real edit.
    let initialHistoryCleared = false;
    const clearInitialHistory = (): void => {
      if (initialHistoryCleared) return;
      initialHistoryCleared = true;
      if (!visibleRef.current) return;
      clearTextHistory(
        {
          state: () => editor.state,
          dispatch: (transaction) => editor.view.dispatch(transaction),
        },
        { force: true },
      );
    };
    editor.on('selectionUpdate', clearInitialHistory);
    const initialHistoryFrame = requestAnimationFrame(clearInitialHistory);
    const initialHistoryTimer = window.setTimeout(clearInitialHistory, 0);
    const syncSelection = (): void => {
      // The page layout keeps the continuous editor mounted for scroll/undo
      // continuity, but a structural command may rebuild its hidden
      // ProseMirror buffer. That must not overwrite the block the user
      // selected on the page.
      if (!visibleRef.current) return;
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
      runtime.syncEditorBlockSelection(blockId);
    };
    const bindings: EditorBindings = {
      runtime,
      openBlockMenu,
      openReferenceMenu,
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
          if (value === undefined || value === null) return;
          if (!value.ok) {
            toast.error(value.message ?? 'The command was rejected.');
            return;
          }
          if (value.notice !== undefined) toast.info(value.notice);
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
    // A real pointer or key in a block's prose is an explicit block interaction
    // and owns the selection: clear the anchor before the selection sync
    // reports the block, so the source/target case cannot keep both selected.
    // Anchor affordances (marker buttons, callout quotes) are outside the prose
    // and keep their cycle behavior.
    const clearAnchorOnInteraction = (event: Event): void => {
      if (event.target instanceof Element && event.target.closest('.nf-block-prose') !== null) {
        runtime.markSelectionExplicit();
        runtime.clearAnchorSelection();
      }
    };
    const editorDom = editor.view.dom;
    editorDom.addEventListener('pointerdown', clearAnchorOnInteraction, true);
    editorDom.addEventListener('keydown', clearAnchorOnInteraction, true);
    syncSelection();
    recordPerf('mount', performance.now() - mountedAt);
    return () => {
      editor.off('selectionUpdate', clearInitialHistory);
      cancelAnimationFrame(initialHistoryFrame);
      window.clearTimeout(initialHistoryTimer);
      editor.off('selectionUpdate', syncSelection);
      editor.off('focus', syncSelection);
      editor.off('blur', syncSelection);
      editorDom.removeEventListener('pointerdown', clearAnchorOnInteraction, true);
      editorDom.removeEventListener('keydown', clearAnchorOnInteraction, true);
      clearEditorBindings(editor);
      runtime.attachEditor(null);
    };
  }, [editor, runtime]);

  // The continuous editor is the authoring surface. Read mode keeps the same
  // ProseMirror state mounted and only flips editability: selection, scroll,
  // links, anchors, copy, focus and outline navigation stay available and no
  // document transaction is created. The page layout hides the whole surface.
  useEffect(() => {
    if (editor === null) return;
    const changed = previousInteractionMode.current !== interactionMode;
    previousInteractionMode.current = interactionMode;
    const wasVisible = visibleBeforeInteraction.current;
    visibleBeforeInteraction.current = visible;
    // A contenteditable toggle can make Chromium scroll the caret back into
    // view. Continuous Read/Edit is the same continuous scroll position, so
    // capture and restore it around the toggle (never for a layout switch;
    // the hidden/show transition owns its own restore).
    const restoreContinuousScroll =
      changed && visible && wasVisible ? scrollRef.current?.scrollTop ?? null : null;
    if (changed && interactionMode === 'read' && visible) {
      // Only a Continuous Edit -> Continuous Read toggle owns focus
      // restoration. A layout switch also changes the mode, but the page
      // layout owns selection there and the return path restores it.
      focusedBeforeRead.current =
        editor.isFocused || editor.view.dom.contains(document.activeElement);
    }
    const editable =
      runtime.status === 'editable' && visible && interactionMode === 'edit';
    // `setEditable` only updates view props; suppress its synthetic update
    // event so a mode switch can never become a text-history operation.
    if (editor.isEditable !== editable) editor.setEditable(editable, false);
    setEditorInteractionMode(editor, interactionMode);
    if (interactionMode === 'read') clearEditorImageAuthoring(editor);
    // A non-editable textbox is exposed as read-only, not as a broken editor.
    editor.view.dom.setAttribute(
      'aria-label',
      interactionMode === 'read' ? 'Document body, read mode' : 'Document body',
    );
    if (interactionMode === 'read') editor.view.dom.setAttribute('aria-readonly', 'true');
    else editor.view.dom.removeAttribute('aria-readonly');
    if (changed && interactionMode === 'edit') {
      // Focus restoration belongs to a Continuous Read/Edit toggle only. A
      // layout return has its own selected-block and scroll restore path.
      const shouldRestoreFocus = focusedBeforeRead.current && wasVisible;
      focusedBeforeRead.current = false;
      const active = document.activeElement;
      // Do not steal focus from a sidebar tree, dialog, or menu the user moved
      // to while reading. The body (or the editor itself) means focus was lost
      // only because the surface stopped being editable.
      if (
        shouldRestoreFocus &&
        (active === null || active === document.body || editor.view.dom.contains(active))
      ) {
        editor.view.focus();
      }
    }
    if (restoreContinuousScroll !== null) {
      const scrollTop = restoreContinuousScroll;
      const restore = (): void => {
        if (scrollRef.current !== null && scrollRef.current.scrollTop !== scrollTop) {
          scrollRef.current.scrollTop = scrollTop;
        }
      };
      restore();
      // Chromium may apply its caret scroll after the editable toggle; repeat
      // once after the next paint so the same continuous position is stable.
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
      });
    }
  }, [editor, runtime.status, visible, interactionMode]);

  const previousVisible = useRef(visible);
  useEffect(() => {
    if (previousVisible.current === visible) return;
    previousVisible.current = visible;
    if (!visible) {
      // The last visible scroll event already recorded the session position.
      // Recording again here would overwrite it with 0: display:none resets
      // the scroll box before this effect runs.
      editor?.commands.blur();
      return;
    }
    const selected = runtime.selectedBlockId;
    const scrollTop = getScroll(runtime.packagePath);
    requestAnimationFrame(() => {
      if (selected !== null && runtime.document.blocks[selected] !== undefined) {
        runtime.focusBlock(selected, { scroll: false });
      }
      // Focus can scroll the hidden-then-shown box; restore after it.
      if (scrollRef.current !== null) scrollRef.current.scrollTop = scrollTop;
    });
    // Only a layout transition should restore; a selection change while the
    // continuous editor is visible keeps the live caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editor, runtime.packagePath]);

  useEffect(() => {
    if (editor === null || restoredRef.current || !visible) return;
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
  }, [editor, runtime, active, visible]);

  // The mount-time editor selection is not a user selection: it must not mute
  // the tree's resting accent edges. Only an explicit action owns the path.
  const selectedId = runtime.selectionExplicit ? runtime.selectedBlockId : null;
  const view = useShell((state) => state.viewByDoc[runtime.packagePath]);
  const zoom = view?.zoom ?? 1;
  const focusBlockId = view?.focusBlockId ?? null;
  const activePath = useMemo(
    () =>
      new Set(selectedId === null ? [] : ancestorPath(runtime.document, selectedId)),
    [runtime.document, selectedId, runtime.version],
  );
  const rects = useBlockRects(contentRef, runtime.version, editor !== null, zoom);
  const canvasWidth = useCanvasWidth(
    contentRef,
    active && visible,
    continuousSettings.widths.canvasMax,
  );
  const belowChildIds = useBelowStackPlacement({
    runtime,
    rects,
    availableWidth: canvasWidth,
    siblingGap: continuousSettings.spacing.siblingGap,
    active: active && visible,
  });
  const edges = useMemo(
    () => edgePairs(runtime.document, runtime.collapsed, belowChildIds),
    [runtime.document, runtime.collapsed, runtime.version, belowChildIds],
  );
  const referenceEdges = useMemo(
    () => referenceEdgePairs(runtime.document),
    [runtime.document, runtime.version],
  );

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

  // Idle anchors (OD-2) keep their canonical binding and record so undo can
  // restore the exact branch, but a branchless anchor must not leave a stale
  // underline, dot, marker button or overlay. This is DOM view state only.
  useLayoutEffect(() => {
    const root = editor?.view.dom;
    if (root === undefined || root === null) return;
    const linked = linkedAnchorIds(runtime.document);
    const update = (element: Element, attribute: string): void => {
      const ids = (element.getAttribute(attribute) ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (ids.length > 0 && ids.every((id) => !linked.has(id))) {
        element.setAttribute('data-anchor-idle', 'true');
      } else {
        element.removeAttribute('data-anchor-idle');
      }
    };
    for (const element of root.querySelectorAll('[data-anchor-ids]')) {
      update(element, 'data-anchor-ids');
    }
    for (const element of root.querySelectorAll('[data-anchor-term-ids]')) {
      update(element, 'data-anchor-term-ids');
    }
    for (const element of root.querySelectorAll('[data-code-anchor-range]')) {
      update(element, 'data-code-anchor-range');
    }
    for (const element of root.querySelectorAll('[data-code-anchor-id]')) {
      update(element, 'data-code-anchor-id');
    }
    for (const element of root.querySelectorAll('[data-anchor-marker-id]')) {
      update(element, 'data-anchor-marker-id');
    }
  }, [editor, runtime.document, runtime.version]);

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
    if (!active || !visible) return undefined;
    const handler = (): void => fitWidth();
    window.addEventListener('nf:fit-width', handler);
    return () => window.removeEventListener('nf:fit-width', handler);
  }, [active, visible, fitWidth]);

  return (
    <>
      {active && visible ? <CanvasHeader /> : null}
      <div
        className="nf-editor-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          if (!active || !visible) return;
          recordScroll(runtime.packagePath, event.currentTarget.scrollTop);
        }}
      >
        <div className="nf-canvas" style={{ zoom }} data-zoom={Math.round(zoom * 100)}>
          <div className="nf-canvas-content" ref={contentRef}>
            <EditorContent editor={editor} />
            <EdgeLayer
              edges={edges}
              referenceEdges={referenceEdges}
              rects={rects}
              activePath={activePath}
              edgeStyle={continuousEdge}
              selectedBlockId={selectedId}
              onEdgeClick={(childId, anchor) => openBlockMenu(childId, anchor)}
              onTrunkClick={(parentId) => {
                void runtime.toggleCollapse(parentId);
              }}
              onReferenceEdgeClick={(targetId) => {
                runtime.focusBlock(targetId, { select: true });
              }}
            />
          </div>
          <div className="nf-canvas-footer" contentEditable={false}>
            <button
              type="button"
              className="nf-canvas-action"
              data-canvas-action="add-chapter"
              disabled={!editingEnabled}
              title={editingEnabled ? 'Add chapter' : READ_MODE_TITLE}
              onClick={() => {
                void createChapter();
              }}
            >
              + Add chapter
            </button>
          </div>
        </div>
      </div>
      {editor === null || interactionMode === 'read' ? null : (
        <>
          <TableToolbar editor={editor} />
          <SelectionToolbar editor={editor} />
        </>
      )}
    </>
  );
}
