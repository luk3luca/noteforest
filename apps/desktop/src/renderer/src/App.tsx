import { useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { FlushResult } from '../../shared/api';
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
import { useShell, type TabInfo } from './state/shell';
import {
  dirtyMarkdownFiles,
  useAnyMarkdownDirty,
  useMarkdownFiles,
} from './state/markdown';
import { isMarkdownPath } from '../../shared/markdown';
import { flushMarkdownFiles } from './markdown/markdown-save';
import {
  allRuntimes,
  registerRuntime,
  useAllDirty,
  useRuntime,
} from './state/registry';
import { syncActiveLibraryForPath } from './actions';
import { runAppCommand } from './commands/run';
import { handleAppKeyDown } from './commands/keys';
import { buildSession } from './state/session';
import {
  flushPendingSettingsEdits,
  flushSettingsWrites,
  useSettingsStore,
} from './state/settings';
import { normalizeDocumentViewState } from '../../shared/view-state';
import { flushDocuments } from './lib/flush';
import { commitPageEdit } from './page/page-edit-state';
import { createExportSnapshot } from './export-snapshot';
import { useAppearanceSync } from './shell/useAppearanceSync';
import { withDetailsOptions } from './lib/toast-details';
import { createTestSurface, currentFlushMode } from './test-surface';

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
        error: 'Page Edit wasn’t saved before quitting.',
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
                ...(recovery.reasonDetails === undefined
                  ? {}
                  : { reasonDetails: recovery.reasonDetails }),
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
          // One short line; the raw warnings are technical and live in Details.
          toast.info(
            'Some library folders couldn’t be read.',
            withDetailsOptions(data.library.warnings.join(' · ')),
          );
        }
        if (
          data.settingsStatus.state === 'corrupt' ||
          data.settingsStatus.state === 'unreadable'
        ) {
          toast.warning(
            'Settings couldn’t be read. The defaults are in use.',
            withDetailsOptions(data.settingsStatus.message),
          );
        }
        if (
          data.documentSettingsStatus.state === 'corrupt' ||
          data.documentSettingsStatus.state === 'unreadable'
        ) {
          toast.warning(
            'Note settings couldn’t be read. The defaults are in use.',
            withDetailsOptions(data.documentSettingsStatus.message),
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
    const offMenu = window.noteforest.onMenu((command) => runAppCommand(command, 'menu'));
    const offFlush = window.noteforest.onRequestFlush(async () => {
      const mode = currentFlushMode();
      if (mode === 'hang') {
        return new Promise<FlushResult>(() => undefined);
      }
      if (mode === 'error') {
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
        return { error: 'Page Edit wasn’t saved before the export.' };
      }
      return createExportSnapshot(runtime);
    });
    return offSnapshot;
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    window.addEventListener('keydown', handleAppKeyDown, true);
    return () => window.removeEventListener('keydown', handleAppKeyDown, true);
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
    window.__noteforestTest = createTestSurface();
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
