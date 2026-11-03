import type { SessionState } from '../../../shared/api';
import { allRuntimes } from './registry';
import { useShell } from './shell';

const scrollPositions = new Map<string, number>();

export function recordScroll(packagePath: string, scrollTop: number): void {
  scrollPositions.set(packagePath, Math.max(0, Math.round(scrollTop)));
}

export function getScroll(packagePath: string): number {
  return scrollPositions.get(packagePath) ?? 0;
}

export function buildSession(): SessionState {
  const state = useShell.getState();
  const byPath = new Map(allRuntimes().map((runtime) => [runtime.packagePath, runtime]));
  return {
    tabs: state.tabs
      .filter((tab) => !tab.missing)
      .map((tab) => {
        const runtime = byPath.get(tab.packagePath);
        return {
          packagePath: tab.packagePath,
          scrollTop: getScroll(tab.packagePath),
          selectedBlockId: runtime?.selectedBlockId ?? null,
          collapsed: runtime === undefined ? [] : [...runtime.collapsed],
        };
      }),
    activeTab: state.activeTab,
    sidebarCollapsed: state.sidebarCollapsed,
    sidebarWidth: state.sidebarWidth,
    collapsedTopics: state.collapsedTopics,
  };
}
