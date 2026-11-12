/**
 * Session-only `DocumentStatusPanel` state (R3).
 *
 * Cancel on a stale-lock panel collapses it to the 34 px slim bar for this
 * document; Review reopens it. The map is deliberately not persisted: a restart
 * shows the full panel again, and the tab lock icon still signals read-only.
 */

import { create } from 'zustand';

interface DocumentStatusState {
  /** Package paths whose status panel is collapsed to the slim bar. */
  collapsed: Record<string, boolean>;
  setCollapsed: (packagePath: string, collapsed: boolean) => void;
  reset: () => void;
}

export const useDocumentStatusStore = create<DocumentStatusState>((set) => ({
  collapsed: {},
  setCollapsed: (packagePath, collapsed) =>
    set((state) => {
      if (collapsed === (state.collapsed[packagePath] === true)) return state;
      const next = { ...state.collapsed };
      if (collapsed) next[packagePath] = true;
      else delete next[packagePath];
      return { collapsed: next };
    }),
  reset: () => set({ collapsed: {} }),
}));
