import { useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { FlushResult, MenuCommand } from '../../shared/api';
import { TitleBar } from './shell/TitleBar';
import { Workspace } from './shell/Workspace';
import { StatusBar } from './shell/StatusBar';
import { CommandPalette } from './shell/CommandPalette';
import { ContextMenu } from './shell/ContextMenu';
import { Dialogs } from './shell/Dialogs';
import { ExportSheet } from './export/ExportSheet';
import {
  exportFlowHistory,
  useExportUi,
} from './export/export-flow';
import { useShell, findSurfaceActive, type TabInfo } from './state/shell';
import {
  dirtyMarkdownFiles,
  useAnyMarkdownDirty,
  useMarkdownFiles,
} from './state/markdown';
import { isMarkdownPath } from '../../shared/markdown';
import { markdownEditor } from './markdown/markdown-editor-registry';
import { flushMarkdownFiles } from './markdown/markdown-save';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import {
  allRuntimes,
  registerRuntime,
  useAllDirty,
  useRuntime,
} from './state/registry';
import {
  activeDocumentLayout,
  activeEditingEnabled,
  activeRuntime,
  activeTabIsMarkdown,
  adjustActiveLayoutZoom,
  closeFind,
  closeTab,
  findNext,
  findPrevious,
  fitActiveLayout,
  openFind,
  openPath,
  runMenuCommand,
  saveActive,
  setActiveDocumentLayout,
  setActivePageFit,
  syncActiveLibraryForPath,
  toggleActiveInteractionMode,
  toggleFocusBranch,
} from './actions';
import { activeOverlayOwner, overlayOwnsCommands } from './shell/overlay-owner';
import { buildSession } from './state/session';
import {
  flushPendingSettingsEdits,
  flushSettingsWrites,
  useSettingsStore,
} from './state/settings';
import { READ_MODE_TOAST } from './lib/editability';
import { normalizeDocumentViewState } from '../../shared/view-state';
import { flushDocuments } from './lib/flush';
import { commitPageEdit } from './page/page-edit-state';
import { createExportSnapshot } from './export-snapshot';
import { printPageModelSnapshot } from './page/print-model-registry';
import { clearPrintTestSurface, mountPrintTestSurface } from './print/test-surface';
import { buildPrintModel } from '@noteforest/pdf';
import { perfSnapshot, summarize } from './lib/perf';
import { useAppearanceSync } from './shell/useAppearanceSync';

type FlushTestMode = 'normal' | 'error' | 'hang';

/**
 * Batch V toast icons: the app's outline language at 16 px / 1.5 stroke,
 * coloured per type by the toast CSS. Sonner's default filled/bright icons are
 * deliberately replaced; the toast API and its behavior stay unchanged.
 */
const TOAST_ICONS = {
  success: <CircleCheck size={16} strokeWidth={1.5} aria-hidden="true" />,
  info: <Info size={16} strokeWidth={1.5} aria-hidden="true" />,
  warning: <TriangleAlert size={16} strokeWidth={1.5} aria-hidden="true" />,
  error: <CircleX size={16} strokeWidth={1.5} aria-hidden="true" />,
  loading: (
    <LoaderCircle
      size={16}
      strokeWidth={1.5}
      className="nf-toast-loading"
      aria-hidden="true"
    />
  ),
};

/**
 * Commands with a renderer-owned accelerator are deliberately exempt from the
 * menu-command dedupe: repeated presses are intentional. Undo/redo and the
 * command palette have unregistered native accelerators
 * (`registerAccelerator: false` in the main menu), so the renderer keydown is
 * the single delivery path and there is no native/renderer duplicate to drop.
 */
const SINGLE_PATH_COMMANDS = new Set<MenuCommand>([
  'undo',
  'redo',
  'command-palette',
]);

/** Move to the previous/next open tab; a no-op with fewer than two tabs. */
function cycleActiveTab(direction: -1 | 1): void {
  const state = useShell.getState();
  const index = state.tabs.findIndex((tab) => tab.packagePath === state.activeTab);
  if (index < 0 || state.tabs.length < 2) return;
  const next =
    state.tabs[(index + direction + state.tabs.length) % state.tabs.length];
  if (next !== undefined) state.setActiveTab(next.packagePath);
}

/**
 * Native-menu and renderer-shortcut delivery, shared by the two paths.
 *
 * One gate covers both: while a modal surface (Settings/dialog, palette, or the
 * Export sheet) owns the command channel, an app command is ignored. Native
 * menu roles (cut/copy/paste/select-all/quit) are OS responder actions, not
 * `MenuCommand`s, so they stay available.
 */
const lastDispatch = new Map<string, number>();

/**
 * The palette's own toggle is local to the palette: ⌘K closes the surface that
 * owns the channel. Every other command stays blocked behind it.
 */
function isPaletteOwnToggle(command: MenuCommand): boolean {
  return command === 'command-palette' && activeOverlayOwner() === 'palette';
}

function dispatch(command: MenuCommand): void {
  if (overlayOwnsCommands() && !isPaletteOwnToggle(command)) return;
  if (!SINGLE_PATH_COMMANDS.has(command)) {
    const now = performance.now();
    // A missing entry is not "dispatched at time 0": treating it as one
    // silently dropped the first menu command issued inside the first
    // 120 ms after the renderer started (for example Export PDF from an
    // empty library).
    const previous = lastDispatch.get(command);
    if (previous !== undefined && now - previous < 120) return;
    lastDispatch.set(command, now);
  }
  runMenuCommand(command);
}

/** Test-only override, reachable through `window.__noteforestTest`. */
let flushTestMode: FlushTestMode = 'normal';

/**
 * Commit every open document before close/quit. Document problems block and
 * carry a reason for the native Retry/Cancel dialog; session-state failures are
 * logged and never block (see `lib/flush.ts`).
 */
async function flushOpenDocuments(): Promise<FlushResult> {
  const documents = allRuntimes();
  // An open Page Edit overlay is not in the runtime until it commits. Commit it
  // first so closing the window never drops typed text, and block the flush
  // with a reason when the block command is rejected.
  for (const runtime of documents) {
    if (!(await commitPageEdit(runtime.packagePath))) {
      return {
        status: 'error',
        error: 'Could not commit a Page Edit block before quitting.',
      };
    }
  }
  // Never quit with a debounced settings edit or a settings write still in
  // flight: the dialog only reports "saved" after the atomic write, and a quit
  // must keep that promise.
  await flushPendingSettingsEdits();
  const settings = await flushSettingsWrites();
  if (!settings.ok) {
    console.error(settings.message);
  }
  return flushDocuments({
    documents,
    saveSession: () => window.noteforest.saveSession(buildSession()),
  }).then((result) => {
    if (result.status !== 'ok') return result;
    // Markdown guest files live only in the renderer. The main process includes
    // them in the same Save / Don't Save / Cancel prompt and asks for the atomic
    // writes when the user chooses Save.
    const pendingMarkdown = dirtyMarkdownFiles();
    return pendingMarkdown.length === 0 ? result : { ...result, pendingMarkdown };
  });
}

export function App(): JSX.Element {
  const ready = useShell((state) => state.ready);
  const activeTab = useShell((state) => state.activeTab);
  const activeTabInfo = useShell((state) =>
    state.tabs.find((tab) => tab.packagePath === state.activeTab),
  );
  const { runtime } = useRuntime(activeTab);
  const runtimeDirty = useAllDirty();
  const markdownDirty = useAnyMarkdownDirty();
  const dirty = runtimeDirty || markdownDirty;
  // The first ready render restores the session's active library; only a later
  // tab activation makes another known library active (LD-03).
  const libraryFollowReady = useRef(false);
  // One writer for `data-theme`, the accent roles, and the shell fonts.
  const resolvedTheme = useAppearanceSync();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await window.noteforest.bootstrap();
        if (cancelled) return;
        // Load personal settings, their read status, and every durable
        // per-document override before the shell becomes ready or any Page
        // surface mounts.
        useSettingsStore.getState().initialize({
          settings: data.settings,
          settingsStatus: data.settingsStatus,
          documentSettings: data.documentSettings,
          documentSettingsStatus: data.documentSettingsStatus,
          documentSettingsBackup: data.documentSettingsBackup,
        });
        const byPath = new Map(data.openDocuments.map((snapshot) => [snapshot.packagePath, snapshot]));
        const markdownByPath = new Map(
          data.markdownFiles.map((file) => [file.path, file]),
        );
        const recoveryByPath = new Map(
          data.recoveries.map((recovery) => [recovery.packagePath, recovery]),
        );
        const sessionByPath = new Map(data.session.tabs.map((tab) => [tab.packagePath, tab]));
        const tabs: TabInfo[] = [];
        for (const sessionTab of data.session.tabs) {
          // A Markdown guest file is restored from its path, never from a
          // package snapshot, recovery, or recent manifest entry.
          if (isMarkdownPath(sessionTab.packagePath)) {
            const file = markdownByPath.get(sessionTab.packagePath);
            if (file === undefined) continue;
            useMarkdownFiles.getState().openFile(file);
            tabs.push({
              packagePath: file.path,
              tabKey: file.path,
              title: file.title,
              kind: 'markdown',
              ...(file.readOnly ? { readOnlyReason: file.readOnlyReason } : {}),
              ...(file.error !== undefined ? { missing: true } : {}),
            });
            continue;
          }
          const snapshot = byPath.get(sessionTab.packagePath);
          const recovery = recoveryByPath.get(sessionTab.packagePath);
          if (snapshot !== undefined) {
            registerRuntime(snapshot, sessionByPath.get(sessionTab.packagePath), undefined);
            // Rename/move: re-key an id-based override to the opened path.
            useSettingsStore
              .getState()
              .adoptDocumentSettings(snapshot.packagePath, snapshot.document.id);
            tabs.push({
              packagePath: snapshot.packagePath,
              // Two packages can share a document id after a copy; the path
              // keeps the editor/tab keys unique (F3).
              tabKey: `${snapshot.document.id}:${snapshot.packagePath}`,
              title: snapshot.document.title,
              ...(snapshot.status === 'read-only' ? { readOnlyReason: snapshot.readOnlyReason } : {}),
            });
          } else if (recovery !== undefined) {
            tabs.push({
              packagePath: recovery.packagePath,
              tabKey: recovery.packagePath,
              title: recovery.title,
              recovery: {
                status: recovery.status,
                reason: recovery.reason,
                details: recovery.details,
                warnings: recovery.warnings,
              },
            });
          } else {
            const recent = data.library.recent.find((item) => item.packagePath === sessionTab.packagePath);
            const parts = sessionTab.packagePath.split('/');
            tabs.push({
              packagePath: sessionTab.packagePath,
              tabKey: sessionTab.packagePath,
              title: recent?.title ?? parts.at(-1) ?? 'Missing document',
              missing: true,
            });
          }
        }
        const state = useShell.getState();
        state.setLibrary(data.library);
        state.setSidebarCollapsed(data.session.sidebarCollapsed);
        state.setSidebarWidth(data.session.sidebarWidth);
        state.setSidebarTab(data.session.sidebarTab);
        // A restored Search section has no previous section: closing it falls
        // back to the Outline instead of the store's pre-restore default.
        if (data.session.sidebarTab === 'search') {
          useShell.setState({ sidebarTabBeforeSearch: null });
        }
        state.setExpandedLibraryFolders(data.session.expandedLibraryFolders ?? []);
        for (const [packagePath, ids] of Object.entries(data.session.collapsedTopics)) {
          state.setCollapsedTopics(packagePath, ids);
        }
        for (const sessionTab of data.session.tabs) {
          const view = normalizeDocumentViewState(sessionTab);
          const guest = isMarkdownPath(sessionTab.packagePath)
            ? useMarkdownFiles.getState().files[sessionTab.packagePath]
            : undefined;
          state.setDocumentViewState(
            sessionTab.packagePath,
            isMarkdownPath(sessionTab.packagePath)
              ? {
                  ...view,
                  layout: 'continuous',
                  ...(guest?.readOnly === true ? { interactionMode: 'read' as const } : {}),
                }
              : view,
          );
        }
        const active =
          tabs.find((tab) => tab.packagePath === data.session.activeTab)?.packagePath ??
          tabs[0]?.packagePath ??
          null;
        state.setTabs(tabs, active);
        state.setReady(true);
        if (data.library.warnings.length > 0) {
          toast.info(data.library.warnings[0] ?? 'Library warnings');
        }
        if (
          data.settingsStatus.state === 'corrupt' ||
          data.settingsStatus.state === 'unreadable'
        ) {
          toast.warning(
            'Settings could not be read. NoteForest is using defaults; open Settings → Data & About to review the backup and reset.',
          );
        }
        if (
          data.documentSettingsStatus.state === 'corrupt' ||
          data.documentSettingsStatus.state === 'unreadable'
        ) {
          toast.warning(
            'Per-document settings could not be read. Open Settings → Data & About to reset or restore them.',
          );
        }
      } catch (error) {
        if (cancelled) return;
        toast.error(error instanceof Error ? error.message : String(error));
        useShell.getState().setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!libraryFollowReady.current) {
      libraryFollowReady.current = true;
      return;
    }
    if (activeTab === null) return;
    void syncActiveLibraryForPath(activeTab);
  }, [ready, activeTab]);

  useEffect(() => {
    const offMenu = window.noteforest.onMenu((command) => dispatch(command));
    const offFlush = window.noteforest.onRequestFlush(async () => {
      if (flushTestMode === 'hang') {
        return new Promise<FlushResult>(() => undefined);
      }
      if (flushTestMode === 'error') {
        throw new Error('Forced flush failure (test).');
      }
      return flushOpenDocuments();
    });
    const offMarkdownSave = window.noteforest.onRequestMarkdownSave(() =>
      flushMarkdownFiles(),
    );
    return () => {
      offMenu();
      offFlush();
      offMarkdownSave();
    };
  }, []);

  // PDF export (M4c2 R2): the main process never reads the document from disk.
  // It asks for the current in-memory revision, including unsaved edits. A
  // pending Page Edit overlay is committed first, exactly like save/close, so
  // the snapshot cannot silently omit typed text.
  useEffect(() => {
    const offSnapshot = window.noteforest.onExportSnapshotRequest(async (request) => {
      const runtime = allRuntimes().find((item) => item.packagePath === request.packagePath);
      if (runtime === undefined) return null;
      if (!(await commitPageEdit(runtime.packagePath))) {
        return { error: 'Could not commit the Page Edit block before the PDF export.' };
      }
      return createExportSnapshot(runtime);
    });
    return offSnapshot;
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      // A modal surface owns the global shortcut channel (F1). Returning here
      // (without preventDefault) leaves overlay-local behavior untouched:
      // typing, Escape/Done, palette arrows/Enter, and the Export sheet's own
      // buttons never pass through this handler. The palette's own ⌘K toggle is
      // the one app command that belongs to the surface that owns the channel.
      if (overlayOwnsCommands()) {
        const paletteToggle =
          activeOverlayOwner() === 'palette' &&
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === 'k';
        if (!paletteToggle) return;
      }
      // Control+Tab is not a focus-traversal key (plain Tab is), so it can
      // safely cycle documents. This branch must run before the mod check:
      // `ctrlKey` makes `mod` true and used to make it unreachable.
      if (event.ctrlKey && !event.metaKey && event.key === 'Tab') {
        event.preventDefault();
        cycleActiveTab(event.shiftKey ? -1 : 1);
        return;
      }
      const layout = activeDocumentLayout();
      if (
        layout === 'page' &&
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        if (event.code === 'Digit1') {
          event.preventDefault();
          setActivePageFit('page');
          return;
        }
        if (event.code === 'Digit2') {
          event.preventDefault();
          setActivePageFit('width');
          return;
        }
      }
      // Escape closes the find bar and restores the selection the bar saved on
      // open. The bar is not a modal owner (⌘G must keep working while typing),
      // so this lives in the global channel; a dialog above it returned already.
      if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (!useShell.getState().findOpen) return;
        event.preventDefault();
        closeFind();
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      // The Page Edit overlay owns a real local ProseMirror history. Global
      // undo/redo must not intercept it while that editor has focus; the
      // overlay's history handles text undo until the commit creates the one
      // structural entry. Save commits the overlay first so the file never
      // reports a saved state that excludes the typed text.
      const target = event.target;
      const insidePageEdit =
        target instanceof Element && target.closest('[data-page-edit-overlay]') !== null;
      if (insidePageEdit && key === 'z') return;
      if (insidePageEdit && key === 's') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('nf:page-edit-commit'));
        return;
      }
      if (key === ',' && !event.shiftKey && !event.altKey) {
        // ⌘, opens Settings even with zero documents. The native menu owns the
        // same accelerator on macOS; this is the renderer fallback and the path
        // the UI suite can exercise.
        event.preventDefault();
        dispatch('settings');
        return;
      }
      if (key === '2' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setActiveDocumentLayout('continuous');
        return;
      }
      if (key === '3' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setActiveDocumentLayout('page');
        return;
      }
      if (
        event.metaKey &&
        !event.ctrlKey &&
        key === 'e' &&
        !event.shiftKey &&
        !event.altKey
      ) {
        // Command+E only: Control+E is the editor's native end-of-line key and
        // must stay with ProseMirror.
        event.preventDefault();
        toggleActiveInteractionMode();
        return;
      }
      if (key === '=' || key === '+') {
        event.preventDefault();
        adjustActiveLayoutZoom(0.1);
        return;
      }
      if (key === '-') {
        event.preventDefault();
        adjustActiveLayoutZoom(-0.1);
        return;
      }
      if (event.code === 'Digit0') {
        event.preventDefault();
        if (event.shiftKey) fitActiveLayout('fit-width');
        else fitActiveLayout('actual');
        return;
      }
      if (key === 'f' && !event.shiftKey && !event.altKey) {
        // ⌘F: no native menu accelerator owns it (see the custom menu) and
        // Electron has no built-in find UI, so the renderer is the only path.
        event.preventDefault();
        openFind();
        return;
      }
      if (key === 'g' && !event.altKey) {
        // ⌘G / ⇧⌘G move the current find hit. Both presentations of the find
        // surface own that hit; with neither showing there is no search to
        // move through.
        if (!findSurfaceActive(useShell.getState())) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) findPrevious();
        else findNext();
        return;
      }
      if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        toggleFocusBranch();
        return;
      }
      if (key >= '1' && key <= '9') {
        // 2 and 3 are the layout shortcuts (ADR-0007); the remaining digits
        // keep the direct tab shortcuts.
        if (key === '2' || key === '3') return;
        event.preventDefault();
        const state = useShell.getState();
        const tab = state.tabs[Number(key) - 1];
        if (tab !== undefined) state.setActiveTab(tab.packagePath);
        return;
      }
      switch (key) {
        case 'k':
          event.preventDefault();
          dispatch('command-palette');
          break;
        case 'w':
          event.preventDefault();
          if (event.shiftKey) window.close();
          else dispatch('close-tab');
          break;
        case 's':
          event.preventDefault();
          dispatch('save');
          break;
        case 'n':
          event.preventDefault();
          dispatch(event.shiftKey ? 'new-chapter' : 'new-document');
          break;
        case '\\':
          event.preventDefault();
          dispatch('toggle-sidebar');
          break;
        case 't':
          if (event.shiftKey) {
            event.preventDefault();
            dispatch('reopen-tab');
          }
          break;
        case 'l': {
          if (!event.shiftKey) break;
          // The link-reference dialog is a NoteForest block command; a Markdown
          // guest file has no branches or references.
          if (activeTabIsMarkdown()) break;
          // The link-reference dialog is a mutating shell path and follows the
          // same gate as the palette and block menu.
          if (!activeEditingEnabled()) {
            event.preventDefault();
            event.stopPropagation();
            toast.info(READ_MODE_TOAST);
            break;
          }
          const current = activeRuntime();
          const blockId = current?.selectedBlockId ?? null;
          if (blockId === null) break;
          event.preventDefault();
          useShell.getState().openDialog({ kind: 'link-reference', blockId });
          break;
        }
        case '[':
        case ']': {
          if (!event.shiftKey) break;
          event.preventDefault();
          cycleActiveTab(key === ']' ? 1 : -1);
          break;
        }
        case 'z': {
          const element = document.activeElement;
          const isPlainTextInput =
            element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
          if (isPlainTextInput) return;
          event.preventDefault();
          // The renderer is the single delivery path for document history.
          // Do not let ProseMirror's own history keymap also handle the event:
          // in Read (or while the Page layout hides the continuous editor) a
          // blocked undo must not mutate the hidden buffer.
          event.stopPropagation();
          dispatch(event.shiftKey ? 'redo' : 'undo');
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [ready]);

  useEffect(() => {
    void window.noteforest.setWindowState({
      dirty,
      title: runtime?.title ?? activeTabInfo?.title ?? 'NoteForest',
      representedPath:
        runtime === null
          ? activeTabInfo?.kind === 'markdown'
            ? activeTabInfo.packagePath
            : null
          : `${runtime.packagePath}/document.json`,
    });
  }, [dirty, runtime?.title, runtime?.packagePath, activeTabInfo?.title]);

  useEffect(() => {
    if (!ready) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void window.noteforest.saveSession(buildSession());
      }, 600);
    };
    const unsubscribe = useShell.subscribe(schedule);
    const interval = setInterval(() => {
      void window.noteforest.saveSession(buildSession());
    }, 5000);
    schedule();
    return () => {
      unsubscribe();
      clearInterval(interval);
      if (timer !== null) clearTimeout(timer);
    };
  }, [ready]);

  useEffect(() => {
    window.__noteforestTest = {
      state: () => {
        const state = useShell.getState();
        return {
          ready: state.ready,
          tabs: state.tabs.map((tab) => ({
            packagePath: tab.packagePath,
            tabKey: tab.tabKey ?? tab.packagePath,
            title: tab.title,
            kind: tab.kind ?? 'note',
            missing: tab.missing === true,
            recovery: tab.recovery === undefined ? null : tab.recovery.status,
            recoveryReason: tab.recovery?.reason ?? null,
          })),
          activeTab: state.activeTab,
          paletteOpen: state.paletteOpen,
          dialog: state.dialog,
          sidebarCollapsed: state.sidebarCollapsed,
          sidebarWidth: state.sidebarWidth,
          sidebarTab: state.sidebarTab,
          healthSelectedRowId: state.healthSelectedRowId,
          healthOpenSections: [...state.healthOpenSections],
          findOpen: state.findOpen,
          findQuery: state.findQuery,
          findIndex: state.findIndex,
          findTotal: state.findTotal,
          findTruncated: state.findTruncated,
          findResults: state.findResults.map((result) => ({
            id: result.id,
            kind: result.kind,
            field: result.field,
            blockId: result.blockId,
            chapterId: result.chapterId,
            anchorId: result.anchorId ?? null,
            branchId: result.branchId ?? null,
            start: result.start,
            end: result.end,
            occurrence: result.occurrence,
            snippet: result.snippet,
          })),
          markdownFiles: Object.values(useMarkdownFiles.getState().files).map((file) => ({
            path: file.path,
            title: file.title,
            dirty: file.dirty,
            error: file.error,
            readOnly: file.readOnly,
            readOnlyReason: file.readOnlyReason,
            tooLarge: file.tooLarge,
            missing: file.missing,
            saving: file.saving,
            saveError: file.saveError,
            conflict: file.conflict,
            base: file.base,
            lastSavedAt: file.lastSavedAt,
          })),
          library:
            state.library === null
              ? null
              : {
                  path: state.library.libraryPath,
                  name: state.library.libraryName,
                  missing: state.library.missing,
                  libraries: state.library.libraries,
                  recent: state.library.recent.map((item) => ({
                    documentId: item.documentId,
                    title: item.title,
                    packagePath: item.packagePath,
                    missing: item.missing === true,
                  })),
                  documents: state.library.documents.map((document) => ({
                    packagePath: document.packagePath,
                    title: document.title,
                    status: document.status,
                    documentId: document.documentId,
                  })),
                  tree: state.library.tree,
                },
          expandedLibraryFolders: state.expandedLibraryFolders,
          runtimes: allRuntimes().map((item) => ({
            packagePath: item.packagePath,
            documentId: item.document.id,
            draftId: item.draftId,
            draftError: item.draftError,
            title: item.document.title,
            blocks: Object.keys(item.document.blocks).length,
            blockIds: Object.keys(item.document.blocks),
            branches: Object.keys(item.document.branches).length,
            branchIds: Object.keys(item.document.branches),
            assets: Object.keys(item.document.assets).length,
            assetAvailability: item.assetAvailability,
            status: item.status,
            readOnlyReason: item.readOnlyReason ?? null,
            lock: item.lock ?? null,
            saveState: item.saveState,
            saveError: item.saveError,
            saveFailure: item.saveFailure,
            dirty: item.dirty,
            selectedBlockId: item.selectedBlockId,
            selectedAnchor: item.selectedAnchor,
            lastHistoryOperation: item.lastHistoryOperation,
            canUndoText: item.canUndoText,
            canRedoText: item.canRedoText,
            canUndoStructural: item.canUndoStructural,
            canRedoStructural: item.canRedoStructural,
            collapsed: [...item.collapsed],
            revision: item.document.revision,
            orientation: useSettingsStore
              .getState()
              .resolvedPageSettings(item.packagePath, item.document.id).setup.orientation,
            chapters: item.document.chapters.length,
            chapterList: item.document.chapters.map((chapter) => ({
              id: chapter.id,
              title: chapter.title ?? null,
              blocks: chapter.topLevelBlockIds.length,
              blockIds: [...chapter.topLevelBlockIds],
            })),
          })),
        };
      },
      openPath: async (packagePath: string) => openPath(packagePath),
      /** Test-only: activate a tab without the global shortcut path (F2). */
      activateTab: (packagePath: string) => useShell.getState().setActiveTab(packagePath),
      /** Test-only: close one tab without the gated shell command (F1/F2). */
      closePath: async (packagePath: string) =>
        closeTab(packagePath, { force: true, save: false }),
      /** Test-only: dispatch a MenuCommand through the native-menu path. */
      dispatchMenuCommand: (command: MenuCommand) => dispatch(command),
      /** Test-only: which surface currently owns the global command channel. */
      overlayOwner: () => activeOverlayOwner(),
      viewState: () => structuredClone(useShell.getState().viewByDoc),
      /**
       * Test-only visual probe for the tokenized toast. It calls the same
       * public toast helpers the product uses; it adds no toast API.
       */
      showToast: (type, title, description) => {
        const options = description === undefined ? undefined : { description };
        if (type === 'success') toast.success(title, options);
        else if (type === 'info') toast.info(title, options);
        else if (type === 'warning') toast.warning(title, options);
        else toast.error(title, options);
      },
      applyStructural: async (command) => {
        const state = useShell.getState();
        const runtime = allRuntimes().find(
          (item) => item.packagePath === state.activeTab,
        );
        if (runtime === undefined) return { ok: false, message: 'No active document.' };
        return runtime.applyStructural(command);
      },
      structure: () => {
        const state = useShell.getState();
        const runtime = allRuntimes().find(
          (item) => item.packagePath === state.activeTab,
        );
        if (runtime === undefined) return null;
        const document = runtime.document;
        return structuredClone({
          blocks: document.blocks,
          branches: document.branches,
          chapters: document.chapters,
          anchors: document.anchors,
          // Personal page setting, never canonical document data.
          manualBreakBeforeBlockIds: useSettingsStore
            .getState()
            .resolvedPageSettings(runtime.packagePath, runtime.document.id)
            .manualBreakBeforeBlockIds,
        });
      },
      assets: () => {
        const state = useShell.getState();
        const runtime = allRuntimes().find(
          (item) => item.packagePath === state.activeTab,
        );
        return structuredClone(runtime?.document.assets ?? {});
      },
      assetAvailability: () => {
        const state = useShell.getState();
        const runtime = allRuntimes().find(
          (item) => item.packagePath === state.activeTab,
        );
        return structuredClone(runtime?.assetAvailability ?? {});
      },
      caretLocation: () => {
        const state = useShell.getState();
        const runtime = allRuntimes().find(
          (item) => item.packagePath === state.activeTab,
        );
        return runtime?.caretLocation() ?? null;
      },
      flushSession: () => window.noteforest.saveSession(buildSession()),
      /** Test-only: the same save action without the 120 ms menu throttle. */
      saveNow: () => saveActive(),
      /**
       * Test-only: set a real ProseMirror selection in one Markdown guest
       * editor so the platform copy path (⌘C) carries rich nodes.
       */
      markdownSelect: (path, kind) => {
        const editor = markdownEditor(path);
        if (editor === null) return null;
        let match: { from: number; to: number; text: string } | null = null;
        editor.state.doc.descendants((node, pos) => {
          if (match !== null) return false;
          if (node.type.name !== kind) return true;
          if (kind === 'paragraph') {
            const text = node.textBetween(0, node.content.size, '\n', '\n');
            if (!text.includes('A paragraph with')) return true;
            match = { from: pos + 1, to: pos + node.content.size, text };
            return false;
          }
          match = { from: pos, to: pos + node.nodeSize, text: node.textContent.slice(0, 80) };
          return false;
        });
        if (match === null) return null;
        const selected = match as { from: number; to: number; text: string };
        const transaction = editor.state.tr;
        transaction.setSelection(
          kind === 'paragraph'
            ? TextSelection.create(transaction.doc, selected.from, selected.to)
            : NodeSelection.create(transaction.doc, selected.from),
        );
        editor.view.dispatch(transaction);
        editor.view.focus();
        return selected;
      },
      settings: () => {
        const store = useSettingsStore.getState();
        return structuredClone({
          app: store.app,
          pageOverrides: store.pageOverrides,
          documentSettings: store.documentSettings,
          settingsStatus: store.settingsStatus,
          documentSettingsStatus: store.documentSettingsStatus,
          documentSettingsBackup: store.documentSettingsBackup,
          dismissedWarnings: store.dismissedWarnings,
          saveState: store.saveState,
        });
      },
      setSettings: async (input) => {
        useSettingsStore.getState().setAppSettings(input);
        await flushSettingsWrites();
        return structuredClone(useSettingsStore.getState().app);
      },
      setPageSettingsOverride: async (packagePath, override) => {
        const runtime = allRuntimes().find(
          (item) => item.packagePath === packagePath,
        );
        useSettingsStore
          .getState()
          .setPageSettingsOverride(packagePath, override, runtime?.document.id ?? null);
        await flushSettingsWrites();
        return structuredClone(
          useSettingsStore
            .getState()
            .resolvedPageSettings(packagePath, runtime?.document.id ?? null),
        );
      },
      resolvedPageSettings: (packagePath) => {
        const runtime = allRuntimes().find(
          (item) => item.packagePath === packagePath,
        );
        return structuredClone(
          useSettingsStore
            .getState()
            .resolvedPageSettings(packagePath, runtime?.document.id ?? null),
        );
      },
      flushSettings: () => flushSettingsWrites(),
      setFlushMode: (mode: FlushTestMode) => {
        flushTestMode = mode;
      },
      exportState: () => {
        const state = useExportUi.getState();
        return structuredClone({
          status: state.status,
          packagePath: state.packagePath,
          jobId: state.jobId,
          outputPath: state.outputPath,
          documentTitle: state.documentTitle,
          folder: state.folder,
          baseName: state.baseName,
          layout: state.layout,
          pageSetup: state.pageSetup,
          density: state.density,
          overwrite: state.overwrite,
          cancelPrompt: state.cancelPrompt,
          progress: state.progress,
          phase: state.phase,
          pageCount: state.pageCount,
          pageWidthMm: state.pageWidthMm,
          pageHeightMm: state.pageHeightMm,
          cancelling: state.cancelling,
          error: state.error,
          warnings: state.warnings,
        });
      },
      exportHistory: () => structuredClone(exportFlowHistory()),
      renderPrint: () => {
        const state = useShell.getState();
        const runtime = allRuntimes().find((item) => item.packagePath === state.activeTab);
        if (runtime === undefined) return { ok: false, message: 'No active document.' };
        const snapshot = printPageModelSnapshot(runtime.packagePath);
        if (snapshot === null) {
          return { ok: false, message: 'The Page model is not ready.' };
        }
        const model = buildPrintModel(
          snapshot.document,
          snapshot.layout,
          {
            pages: snapshot.pages,
            pageCount: snapshot.pages.length,
            defects: snapshot.defects,
            manualBreakWarnings: snapshot.manualBreakWarnings,
          },
          {
            settings: snapshot.settings,
            pageModelFingerprint: snapshot.settingsFingerprint,
            // The visible Page model measured with the current appearance code
            // font; the print model must agree or fail the identity check.
            codeFont: useSettingsStore.getState().app.appearance.codeFont,
            failedAssetIds: [...snapshot.failedAssetIds],
            assetUrls: snapshot.assetUrls,
          },
        );
        mountPrintTestSurface(model, model.assetUrls);
        return {
          ok: true,
          pageCount: model.pageCount,
          fingerprint: model.fingerprint,
          settingsFingerprint: snapshot.settingsFingerprint,
          pageWidthMm: model.geometry.pageWidthMm,
          pageHeightMm: model.geometry.pageHeightMm,
          contentWidthPx: model.geometry.contentWidthPx,
          contentHeightPx: model.geometry.contentHeightPx,
        };
      },
      clearPrint: () => {
        clearPrintTestSurface();
        return true;
      },
      pageModelPages: () => {
        const state = useShell.getState();
        const runtime = allRuntimes().find((item) => item.packagePath === state.activeTab);
        if (runtime === undefined) return null;
        const snapshot = printPageModelSnapshot(runtime.packagePath);
        if (snapshot === null) return null;
        return snapshot.pages.map((page) => ({
          pageNumber: page.pageNumber,
          blockIds: page.fragments.map((fragment) => fragment.blockId),
          continuationIn: page.continuationIn.length,
          continuationOut: page.continuationOut.length,
          overflow: page.overflow,
        }));
      },
      editorCheck: () => {
        return allRuntimes().map((item) => {
          try {
            item.editor?.state.doc.check();
            return { packagePath: item.packagePath, ok: true };
          } catch (error) {
            return {
              packagePath: item.packagePath,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        });
      },
      editorJson: () => allRuntimes().map((item) => ({ packagePath: item.packagePath, json: item.editor?.getJSON() ?? null })),
      benchmarkReflow: (count = 8) => {
        const runtime = allRuntimes()[0];
        if (runtime === undefined) return [];
        runtime.benchmarkFullReflow(count);
        return perfSnapshot().reflow;
      },
      perf: () => {
        const snapshot = perfSnapshot();
        return {
          measure: summarize(snapshot.measure),
          edge: summarize(snapshot.edge),
          reflow: summarize(snapshot.reflow),
          mount: summarize(snapshot.mount),
          raw: snapshot,
        };
      },
      seed: async (kind) => {
        const result = await window.noteforest.debugSeed(kind);
        registerRuntime(result.snapshot, undefined, undefined);
        const state = useShell.getState();
        state.setLibrary(result.library);
        state.openTab({
          packagePath: result.snapshot.packagePath,
          tabKey: `${result.snapshot.document.id}:${result.snapshot.packagePath}`,
          title: result.snapshot.document.title,
        });
        return result.snapshot.packagePath;
      },
    };
    return () => {
      delete window.__noteforestTest;
    };
  }, []);

  return (
    <div className="nf-app">
      <TitleBar />
      <Workspace />
      <StatusBar />
      <CommandPalette />
      <Dialogs />
      <ContextMenu />
      <ExportSheet />
      <Toaster
        theme={resolvedTheme}
        position="bottom-right"
        closeButton={false}
        icons={TOAST_ICONS}
      />
    </div>
  );
}
