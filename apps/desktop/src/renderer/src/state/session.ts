import type { SessionState } from '../../../shared/api';
import { DEFAULT_DOCUMENT_VIEW, normalizeDocumentViewState } from '../../../shared/view-state';
import { isDraftKey } from '../../../shared/drafts';
import { isMarkdownPath } from '../../../shared/markdown';
import { allRuntimes } from './registry';
import { useShell } from './shell';
import { getScroll } from './scroll-store';

export { getScroll, recordScroll } from './scroll-store';

/**
 * Build the shell session. Personal settings overrides are deliberately absent:
 * they live in `document-settings.json` (S2-2), so a tab close or quit cannot
 * lose them. Only navigation/UI state belongs here.
 *
 * Drafts are never persisted: an untouched draft is discarded on quit and a
 * dirty one materializes first, so only real package paths reach the session.
 */
export function buildSession(): SessionState {
  const state = useShell.getState();
  const byPath = new Map(allRuntimes().map((runtime) => [runtime.packagePath, runtime]));
  const tabs = state.tabs.filter(
    (tab) => !tab.missing && !isDraftKey(tab.packagePath),
  );
  const activeTab =
    state.activeTab !== null && tabs.some((tab) => tab.packagePath === state.activeTab)
      ? state.activeTab
      : null;
  return {
    tabs: tabs
      .map((tab) => {
        const runtime = byPath.get(tab.packagePath);
        const view = normalizeDocumentViewState(
          state.viewByDoc[tab.packagePath] ?? DEFAULT_DOCUMENT_VIEW,
        );
        const markdown = isMarkdownPath(tab.packagePath);
        return {
          packagePath: tab.packagePath,
          documentId: runtime?.document.id ?? null,
          scrollTop: getScroll(tab.packagePath),
          selectedBlockId: runtime?.selectedBlockId ?? null,
          collapsed: runtime === undefined ? [] : [...runtime.collapsed],
          layout: markdown ? ('continuous' as const) : view.layout,
          interactionMode: view.interactionMode,
          currentPage: markdown ? 1 : view.currentPage,
          pageZoom: view.pageZoom,
          pageFit: view.pageFit,
          zoom: view.zoom,
        };
      }),
    activeTab,
    sidebarCollapsed: state.sidebarCollapsed,
    sidebarWidth: state.sidebarWidth,
    collapsedTopics: state.collapsedTopics,
    sidebarTab: state.sidebarTab,
    expandedLibraryFolders: [...state.expandedLibraryFolders],
    activeLibrary:
      state.library === null || state.library.libraryPath.length === 0
        ? null
        : state.library.libraryPath,
  };
}
