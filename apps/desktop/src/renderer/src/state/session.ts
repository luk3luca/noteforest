import type { SessionState } from '../../../shared/api';
import { DEFAULT_DOCUMENT_VIEW, normalizeDocumentViewState } from '../../../shared/view-state';
import { allRuntimes } from './registry';
import { useShell } from './shell';

const scrollPositions = new Map<string, number>();

export function recordScroll(packagePath: string, scrollTop: number): void {
  scrollPositions.set(packagePath, Math.max(0, Math.round(scrollTop)));
}

export function getScroll(packagePath: string): number {
  return scrollPositions.get(packagePath) ?? 0;
}

/**
 * Build the shell session. Personal settings overrides are deliberately absent:
 * they live in `document-settings.json` (S2-2), so a tab close or quit cannot
 * lose them. Only navigation/UI state belongs here.
 */
export function buildSession(): SessionState {
  const state = useShell.getState();
  const byPath = new Map(allRuntimes().map((runtime) => [runtime.packagePath, runtime]));
  return {
    tabs: state.tabs
      .filter((tab) => !tab.missing)
      .map((tab) => {
        const runtime = byPath.get(tab.packagePath);
        const view = normalizeDocumentViewState(
          state.viewByDoc[tab.packagePath] ?? DEFAULT_DOCUMENT_VIEW,
        );
        return {
          packagePath: tab.packagePath,
          documentId: runtime?.document.id ?? null,
          scrollTop: getScroll(tab.packagePath),
          selectedBlockId: runtime?.selectedBlockId ?? null,
          collapsed: runtime === undefined ? [] : [...runtime.collapsed],
          layout: view.layout,
          interactionMode: view.interactionMode,
          currentPage: view.currentPage,
          pageZoom: view.pageZoom,
          pageFit: view.pageFit,
          zoom: view.zoom,
        };
      }),
    activeTab: state.activeTab,
    sidebarCollapsed: state.sidebarCollapsed,
    sidebarWidth: state.sidebarWidth,
    collapsedTopics: state.collapsedTopics,
    sidebarTab: state.sidebarTab,
    activeLibrary:
      state.library === null || state.library.libraryPath.length === 0
        ? null
        : state.library.libraryPath,
  };
}
