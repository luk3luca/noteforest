import { useCallback, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import type { FlushResult, MenuCommand } from '../../shared/api';
import { TitleBar } from './shell/TitleBar';
import { Workspace } from './shell/Workspace';
import { StatusBar } from './shell/StatusBar';
import { CommandPalette } from './shell/CommandPalette';
import { ContextMenu } from './shell/ContextMenu';
import { Dialogs } from './shell/Dialogs';
import { useShell, type TabInfo } from './state/shell';
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
  adjustActivePageZoom,
  adjustActiveZoom,
  fitActiveWidth,
  openPath,
  resetActivePageZoom,
  resetActiveZoom,
  runMenuCommand,
  setActiveDocumentLayout,
  setActivePageFit,
  toggleActiveInteractionMode,
  toggleFocusBranch,
} from './actions';
import { buildSession } from './state/session';
import { useSettingsStore } from './state/settings';
import { READ_MODE_TOAST } from './lib/editability';
import { normalizeDocumentViewState } from '../../shared/view-state';
import { flushDocuments } from './lib/flush';
import { commitPageEdit } from './page/page-edit-state';
import { createExportSnapshot } from './export-snapshot';
import { printPageModelSnapshot } from './page/print-model-registry';
import { clearPrintTestSurface, mountPrintTestSurface } from './print/test-surface';
import { buildPrintModel } from '@noteforest/pdf';
import { perfSnapshot, summarize } from './lib/perf';

type FlushTestMode = 'normal' | 'error' | 'hang';

/**
 * Undo/redo are deliberately exempt from the menu-command dedupe: repeated
 * presses are intentional. Their native menu accelerators are not registered
 * (`registerAccelerator: false` in the main menu), so the renderer keydown is
 * the single delivery path and there is no native/renderer duplicate to drop.
 */
const HISTORY_COMMANDS = new Set<MenuCommand>(['undo', 'redo']);

/** Move to the previous/next open tab; a no-op with fewer than two tabs. */
function cycleActiveTab(direction: -1 | 1): void {
  const state = useShell.getState();
  const index = state.tabs.findIndex((tab) => tab.packagePath === state.activeTab);
  if (index < 0 || state.tabs.length < 2) return;
  const next =
    state.tabs[(index + direction + state.tabs.length) % state.tabs.length];
  if (next !== undefined) state.setActiveTab(next.packagePath);
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
  return flushDocuments({
    documents,
    saveSession: () => window.noteforest.saveSession(buildSession()),
  });
}

export function App(): JSX.Element {
  const ready = useShell((state) => state.ready);
  const activeTab = useShell((state) => state.activeTab);
  const activeTabInfo = useShell((state) =>
    state.tabs.find((tab) => tab.packagePath === state.activeTab),
  );
  const { runtime } = useRuntime(activeTab);
  const dirty = useAllDirty();
  const lastDispatch = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await window.noteforest.bootstrap();
        if (cancelled) return;
        // Load personal page/continuous settings and every stored per-document
        // override before the shell becomes ready or any Page surface mounts.
        useSettingsStore.getState().initialize(data.settings, data.session.tabs);
        const byPath = new Map(data.openDocuments.map((snapshot) => [snapshot.packagePath, snapshot]));
        const recoveryByPath = new Map(
          data.recoveries.map((recovery) => [recovery.packagePath, recovery]),
        );
        const sessionByPath = new Map(data.session.tabs.map((tab) => [tab.packagePath, tab]));
        const tabs: TabInfo[] = [];
        for (const sessionTab of data.session.tabs) {
          const snapshot = byPath.get(sessionTab.packagePath);
          const recovery = recoveryByPath.get(sessionTab.packagePath);
          if (snapshot !== undefined) {
            registerRuntime(snapshot, sessionByPath.get(sessionTab.packagePath), undefined);
            tabs.push({
              packagePath: snapshot.packagePath,
              title: snapshot.document.title,
              ...(snapshot.status === 'read-only' ? { readOnlyReason: snapshot.readOnlyReason } : {}),
            });
          } else if (recovery !== undefined) {
            tabs.push({
              packagePath: recovery.packagePath,
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
              title: recent?.title ?? parts.at(-1) ?? 'Missing document',
              missing: true,
            });
          }
        }
        const state = useShell.getState();
        state.setLibrary(data.library);
        state.setSidebarCollapsed(data.session.sidebarCollapsed);
        state.setSidebarWidth(data.session.sidebarWidth);
        for (const [packagePath, ids] of Object.entries(data.session.collapsedTopics)) {
          state.setCollapsedTopics(packagePath, ids);
        }
        for (const sessionTab of data.session.tabs) {
          state.setDocumentViewState(
            sessionTab.packagePath,
            normalizeDocumentViewState(sessionTab),
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

  const dispatch = useCallback((command: MenuCommand) => {
    if (!HISTORY_COMMANDS.has(command)) {
      const now = performance.now();
      const previous = lastDispatch.current.get(command) ?? 0;
      if (now - previous < 120) return;
      lastDispatch.current.set(command, now);
    }
    runMenuCommand(command);
  }, []);

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
    return () => {
      offMenu();
      offFlush();
    };
  }, [dispatch]);

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
        if (layout === 'page') adjustActivePageZoom(0.1);
        else adjustActiveZoom(0.1);
        return;
      }
      if (key === '-') {
        event.preventDefault();
        if (layout === 'page') adjustActivePageZoom(-0.1);
        else adjustActiveZoom(-0.1);
        return;
      }
      if (event.code === 'Digit0') {
        event.preventDefault();
        if (layout === 'page') {
          if (event.shiftKey) setActivePageFit('width');
          else resetActivePageZoom();
        } else if (event.shiftKey) {
          fitActiveWidth();
        } else {
          resetActiveZoom();
        }
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
  }, [dispatch, ready]);

  useEffect(() => {
    void window.noteforest.setWindowState({
      dirty,
      title: runtime?.title ?? activeTabInfo?.title ?? 'NoteForest',
      representedPath:
        runtime === null ? null : `${runtime.packagePath}/document.json`,
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
    // Per-document page/continuous overrides live in the session, so a settings
    // change must schedule the same session write as navigation state.
    const unsubscribeSettings = useSettingsStore.subscribe(schedule);
    const interval = setInterval(() => {
      void window.noteforest.saveSession(buildSession());
    }, 5000);
    schedule();
    return () => {
      unsubscribe();
      unsubscribeSettings();
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
            title: tab.title,
            missing: tab.missing === true,
            recovery: tab.recovery === undefined ? null : tab.recovery.status,
            recoveryReason: tab.recovery?.reason ?? null,
          })),
          activeTab: state.activeTab,
          paletteOpen: state.paletteOpen,
          dialog: state.dialog,
          sidebarCollapsed: state.sidebarCollapsed,
          runtimes: allRuntimes().map((item) => ({
            packagePath: item.packagePath,
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
              .resolvedPageSettings(item.packagePath).setup.orientation,
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
      viewState: () => structuredClone(useShell.getState().viewByDoc),
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
            .resolvedPageSettings(runtime.packagePath).manualBreakBeforeBlockIds,
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
      settings: () => {
        const store = useSettingsStore.getState();
        return structuredClone({
          app: store.app,
          pageOverrides: store.pageOverrides,
          continuousOverrides: store.continuousOverrides,
        });
      },
      setSettings: async (input) => {
        const settings = useSettingsStore.getState().setAppSettings(input);
        await window.noteforest.saveSettings(settings);
        return structuredClone(settings);
      },
      setPageSettingsOverride: async (packagePath, override) => {
        useSettingsStore.getState().setPageSettingsOverride(packagePath, override);
        await window.noteforest.saveSession(buildSession());
        return structuredClone(
          useSettingsStore.getState().resolvedPageSettings(packagePath),
        );
      },
      resolvedPageSettings: (packagePath) =>
        structuredClone(
          useSettingsStore.getState().resolvedPageSettings(packagePath),
        ),
      setFlushMode: (mode: FlushTestMode) => {
        flushTestMode = mode;
      },
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
      <Toaster theme="dark" position="bottom-right" closeButton={false} />
    </div>
  );
}
