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
  adjustActiveZoom,
  fitActiveWidth,
  openPath,
  resetActiveZoom,
  runMenuCommand,
  toggleFocusBranch,
} from './actions';
import { buildSession } from './state/session';
import { perfSnapshot, summarize } from './lib/perf';

type FlushTestMode = 'normal' | 'error' | 'hang';

/** Test-only override, reachable through `window.__noteforestTest`. */
let flushTestMode: FlushTestMode = 'normal';

function flushErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  return String(error);
}

/**
 * Commit every open document before close/quit.
 *
 * `ok` is returned only when every document committed and no document is
 * read-only or in a failed-save state. Reasons are aggregated with the
 * document title so the native dialog can name what blocked the close.
 */
async function flushOpenDocuments(): Promise<FlushResult> {
  const problems: string[] = [];
  for (const runtime of allRuntimes()) {
    if (runtime.status === 'read-only') {
      const reason =
        runtime.readOnlyReason === undefined ? '' : ` (${runtime.readOnlyReason})`;
      problems.push(`${runtime.title}: open read-only${reason}`);
      continue;
    }
    try {
      await runtime.commitPending();
      if (runtime.saveState === 'error') {
        problems.push(`${runtime.title}: ${runtime.saveError ?? 'the last save failed'}`);
      }
    } catch (error) {
      problems.push(`${runtime.title}: ${flushErrorMessage(error)}`);
    }
  }
  if (problems.length > 0) return { status: 'error', error: problems.join('\n') };
  try {
    await window.noteforest.saveSession(buildSession());
  } catch (error) {
    return { status: 'error', error: `Session state: ${flushErrorMessage(error)}` };
  }
  return { status: 'ok' };
}

export function App(): JSX.Element {
  const ready = useShell((state) => state.ready);
  const activeTab = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTab);
  const dirty = useAllDirty();
  const lastDispatch = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await window.noteforest.bootstrap();
        if (cancelled) return;
        const byPath = new Map(data.openDocuments.map((snapshot) => [snapshot.packagePath, snapshot]));
        const sessionByPath = new Map(data.session.tabs.map((tab) => [tab.packagePath, tab]));
        const tabs: TabInfo[] = [];
        for (const sessionTab of data.session.tabs) {
          const snapshot = byPath.get(sessionTab.packagePath);
          if (snapshot !== undefined) {
            registerRuntime(snapshot, sessionByPath.get(sessionTab.packagePath), undefined);
            tabs.push({
              packagePath: snapshot.packagePath,
              title: snapshot.document.title,
              ...(snapshot.status === 'read-only' ? { readOnlyReason: snapshot.readOnlyReason } : {}),
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
    const now = performance.now();
    const previous = lastDispatch.current.get(command) ?? 0;
    if (now - previous < 120) return;
    lastDispatch.current.set(command, now);
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

  useEffect(() => {
    if (!ready) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) {
        if (event.ctrlKey && event.key === 'Tab') {
          event.preventDefault();
          const state = useShell.getState();
          const index = state.tabs.findIndex((tab) => tab.packagePath === state.activeTab);
          if (index >= 0 && state.tabs.length > 1) {
            const next = state.tabs[(index + (event.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length];
            if (next !== undefined) state.setActiveTab(next.packagePath);
          }
        }
        return;
      }
      const key = event.key.toLowerCase();
      if (key === '=' || key === '+') {
        event.preventDefault();
        adjustActiveZoom(0.1);
        return;
      }
      if (key === '-') {
        event.preventDefault();
        adjustActiveZoom(-0.1);
        return;
      }
      if (event.code === 'Digit0') {
        event.preventDefault();
        if (event.shiftKey) fitActiveWidth();
        else resetActiveZoom();
        return;
      }
      if (key === 'f' && event.shiftKey) {
        event.preventDefault();
        toggleFocusBranch();
        return;
      }
      if (key >= '1' && key <= '9') {
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
        case '[':
        case ']': {
          if (!event.shiftKey) break;
          event.preventDefault();
          const state = useShell.getState();
          const index = state.tabs.findIndex((tab) => tab.packagePath === state.activeTab);
          if (index < 0 || state.tabs.length < 2) break;
          const next = state.tabs[(index + (key === ']' ? 1 : -1) + state.tabs.length) % state.tabs.length];
          if (next !== undefined) state.setActiveTab(next.packagePath);
          break;
        }
        case 'z': {
          const element = document.activeElement;
          const isPlainTextInput =
            element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
          if (isPlainTextInput) return;
          event.preventDefault();
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
      title: runtime?.title ?? 'NoteForest',
      representedPath: runtime === null ? null : `${runtime.packagePath}/document.json`,
    });
  }, [dirty, runtime?.title, runtime?.packagePath]);

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
          tabs: state.tabs.map((tab) => ({ packagePath: tab.packagePath, title: tab.title, missing: tab.missing === true })),
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
            saveState: item.saveState,
            saveError: item.saveError,
            saveFailure: item.saveFailure,
            dirty: item.dirty,
            selectedBlockId: item.selectedBlockId,
            collapsed: [...item.collapsed],
            revision: item.document.revision,
            orientation: item.document.pageSetup.orientation,
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
      flushSession: () => window.noteforest.saveSession(buildSession()),
      setFlushMode: (mode: FlushTestMode) => {
        flushTestMode = mode;
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
