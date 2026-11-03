/** Zustand: shell and session state only. Document content lives in runtimes. */

import { create } from 'zustand';
import type { LibraryView } from '../../../shared/api';

export interface TabInfo {
  packagePath: string;
  title: string;
  missing?: boolean;
  error?: string;
  readOnlyReason?: string;
}

export interface MenuEntry {
  id: string;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

export type DialogState =
  | { kind: 'move'; blockId: string }
  | { kind: 'delete-block'; blockId: string }
  | { kind: 'delete-branch'; blockId: string }
  | { kind: 'rename-document' }
  | { kind: 'rename-chapter'; chapterId: string }
  | { kind: 'rename-block'; blockId: string }
  | { kind: 'link'; href: string }
  | { kind: 'math'; mathKind: 'inline' | 'block'; latex: string; pos: number | null }
  | { kind: 'close-tab'; packagePath: string }
  | { kind: 'settings' };

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

interface ShellState {
  ready: boolean;
  library: LibraryView | null;
  tabs: TabInfo[];
  activeTab: string | null;
  recentClosed: TabInfo[];
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  paletteOpen: boolean;
  paletteQuery: string;
  paletteDocumentsOnly: boolean;
  dialog: DialogState | null;
  contextMenu: ContextMenuState | null;
  collapsedTopics: Record<string, string[]>;
  selectedBlockByDoc: Record<string, string | null>;
  setReady: (ready: boolean) => void;
  setLibrary: (library: LibraryView) => void;
  setTabs: (tabs: TabInfo[], activeTab: string | null) => void;
  openTab: (tab: TabInfo, options?: { activate?: boolean }) => void;
  closeTab: (packagePath: string) => void;
  removeTab: (packagePath: string) => void;
  setActiveTab: (packagePath: string) => void;
  reorderTabs: (from: string, to: string) => void;
  pushClosed: (tab: TabInfo) => void;
  popClosed: () => TabInfo | undefined;
  updateTitle: (packagePath: string, title: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setPaletteOpen: (open: boolean, options?: { documentsOnly?: boolean; query?: string }) => void;
  setPaletteQuery: (query: string) => void;
  openDialog: (dialog: DialogState) => void;
  closeDialog: () => void;
  openContextMenu: (x: number, y: number, items: MenuEntry[]) => void;
  closeContextMenu: () => void;
  setCollapsedTopics: (packagePath: string, ids: string[]) => void;
  setSelectedBlock: (packagePath: string, blockId: string | null) => void;
}

const MAX_CLOSED = 20;

export const useShell = create<ShellState>((set, get) => ({
  ready: false,
  library: null,
  tabs: [],
  activeTab: null,
  recentClosed: [],
  sidebarCollapsed: false,
  sidebarWidth: 264,
  paletteOpen: false,
  paletteQuery: '',
  paletteDocumentsOnly: false,
  dialog: null,
  contextMenu: null,
  collapsedTopics: {},
  selectedBlockByDoc: {},

  setReady: (ready) => set({ ready }),
  setLibrary: (library) => set({ library }),

  setTabs: (tabs, activeTab) => set({ tabs, activeTab }),

  openTab: (tab, options = {}) =>
    set((state) => {
      const exists = state.tabs.some((item) => item.packagePath === tab.packagePath);
      const tabs = exists
        ? state.tabs.map((item) => (item.packagePath === tab.packagePath ? { ...item, ...tab } : item))
        : [...state.tabs, tab];
      const activeTab =
        options.activate === false ? state.activeTab : tab.packagePath;
      return { tabs, activeTab, library: state.library };
    }),

  closeTab: (packagePath) =>
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.packagePath === packagePath);
      const tabs = state.tabs.filter((tab) => tab.packagePath !== packagePath);
      let activeTab = state.activeTab;
      if (activeTab === packagePath) {
        activeTab = tabs[Math.min(index, tabs.length - 1)]?.packagePath ?? null;
      }
      return { tabs, activeTab };
    }),

  removeTab: (packagePath) =>
    set((state) => ({
      tabs: state.tabs.filter((tab) => tab.packagePath !== packagePath),
      activeTab:
        state.activeTab === packagePath
          ? state.tabs.find((tab) => tab.packagePath !== packagePath)?.packagePath ?? null
          : state.activeTab,
    })),

  setActiveTab: (packagePath) => set({ activeTab: packagePath }),

  reorderTabs: (from, to) =>
    set((state) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.packagePath === from);
      const toIndex = state.tabs.findIndex((tab) => tab.packagePath === to);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return state;
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      if (moved === undefined) return state;
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    }),

  pushClosed: (tab) =>
    set((state) => ({
      recentClosed: [tab, ...state.recentClosed.filter((item) => item.packagePath !== tab.packagePath)].slice(
        0,
        MAX_CLOSED,
      ),
    })),

  popClosed: () => {
    const [first, ...rest] = get().recentClosed;
    if (first === undefined) return undefined;
    set({ recentClosed: rest });
    return first;
  },

  updateTitle: (packagePath, title) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.packagePath === packagePath ? { ...tab, title } : tab,
      ),
    })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(208, Math.min(360, Math.round(width))) }),

  setPaletteOpen: (open, options = {}) =>
    set({
      paletteOpen: open,
      paletteQuery: options.query ?? '',
      paletteDocumentsOnly: options.documentsOnly ?? false,
    }),
  setPaletteQuery: (query) => set({ paletteQuery: query }),

  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),

  openContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  closeContextMenu: () => set({ contextMenu: null }),

  setCollapsedTopics: (packagePath, ids) =>
    set((state) => ({
      collapsedTopics: { ...state.collapsedTopics, [packagePath]: ids },
    })),

  setSelectedBlock: (packagePath, blockId) =>
    set((state) => ({
      selectedBlockByDoc: { ...state.selectedBlockByDoc, [packagePath]: blockId },
    })),
}));
