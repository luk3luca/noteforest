/** Zustand: shell and session state only. Document content lives in runtimes. */

import { create } from 'zustand';
import type { LibraryView, RecoveryStatus } from '../../../shared/api';
import {
  DEFAULT_DOCUMENT_VIEW,
  clampContinuousZoom,
  clampPageNumber,
  clampPageZoom,
  normalizeDocumentViewState,
  normalizePageFit,
  type DocumentLayout,
  type DocumentViewState,
  type InteractionMode,
  type PageFit,
} from '../../../shared/view-state';

export type { DocumentLayout, DocumentViewState, InteractionMode, PageFit };

/** Read-only package state shown by the recovery tab. */
export interface RecoveryTabInfo {
  status: RecoveryStatus;
  reason: string;
  details: string[];
  warnings: string[];
}

export interface TabInfo {
  packagePath: string;
  title: string;
  missing?: boolean;
  error?: string;
  readOnlyReason?: string;
  recovery?: RecoveryTabInfo;
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
  | { kind: 'link-reference'; blockId: string; anchorId?: string }
  | { kind: 'image-alt'; blockId: string; path: number[]; assetId: string; alt: string }
  | { kind: 'anchor-health'; anchorId?: string }
  | { kind: 'rename-document' }
  | { kind: 'rename-chapter'; chapterId: string }
  | { kind: 'rename-block'; blockId: string }
  | { kind: 'link'; href: string }
  | { kind: 'math'; mathKind: 'inline' | 'block'; latex: string; pos: number | null }
  | { kind: 'close-tab'; packagePath: string }
  | { kind: 'reload-from-disk'; packagePath: string }
  | { kind: 'overwrite-external'; packagePath: string }
  | { kind: 'restore-backup'; packagePath: string }
  | { kind: 'settings' };

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuEntry[];
}

/** Navigation-only view state. Never written to the document. */

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
  viewByDoc: Record<string, DocumentViewState>;
  setReady: (ready: boolean) => void;
  setLibrary: (library: LibraryView) => void;
  setTabs: (tabs: TabInfo[], activeTab: string | null) => void;
  openTab: (tab: TabInfo, options?: { activate?: boolean }) => void;
  closeTab: (packagePath: string) => void;
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
  setDocumentViewState: (packagePath: string, view: Partial<DocumentViewState>) => void;
  setDocumentZoom: (packagePath: string, zoom: number) => void;
  setDocumentFocus: (packagePath: string, blockId: string | null) => void;
  setDocumentLayout: (packagePath: string, layout: DocumentLayout) => void;
  setDocumentInteractionMode: (packagePath: string, mode: InteractionMode) => void;
  setDocumentPage: (packagePath: string, page: number) => void;
  setDocumentPageZoom: (packagePath: string, zoom: number) => void;
  setDocumentPageFit: (packagePath: string, fit: PageFit) => void;
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
  viewByDoc: {},

  setReady: (ready) => set({ ready }),
  setLibrary: (library) => set({ library }),

  setTabs: (tabs, activeTab) => set({ tabs, activeTab }),

  openTab: (tab, options = {}) =>
    set((state) => {
      const exists = state.tabs.some((item) => item.packagePath === tab.packagePath);
      const tabs = exists
        ? state.tabs.map((item) => {
            if (item.packagePath !== tab.packagePath) return item;
            const merged = { ...item, ...tab };
            // A recovery/missing tab that reopens as a normal document must not
            // keep stale markers from the previous attempt.
            if (tab.recovery === undefined) delete merged.recovery;
            if (tab.missing !== true) delete merged.missing;
            if (tab.readOnlyReason === undefined) delete merged.readOnlyReason;
            return merged;
          })
        : [...state.tabs, tab];
      const activeTab =
        options.activate === false ? state.activeTab : tab.packagePath;
      const viewByDoc =
        state.viewByDoc[tab.packagePath] === undefined
          ? { ...state.viewByDoc, [tab.packagePath]: DEFAULT_DOCUMENT_VIEW }
          : state.viewByDoc;
      return { tabs, activeTab, library: state.library, viewByDoc };
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

  setDocumentViewState: (packagePath, view) =>
    set((state) => ({
      viewByDoc: {
        ...state.viewByDoc,
        [packagePath]: normalizeDocumentViewState({
          ...(state.viewByDoc[packagePath] ?? DEFAULT_DOCUMENT_VIEW),
          ...view,
        }),
      },
    })),

  setDocumentZoom: (packagePath, zoom) =>
    set((state) => {
      const current = state.viewByDoc[packagePath] ?? DEFAULT_DOCUMENT_VIEW;
      const next = clampContinuousZoom(zoom);
      if (current.zoom === next) return state;
      return {
        viewByDoc: { ...state.viewByDoc, [packagePath]: { ...current, zoom: next } },
      };
    }),

  setDocumentFocus: (packagePath, blockId) =>
    set((state) => {
      const current = state.viewByDoc[packagePath] ?? DEFAULT_DOCUMENT_VIEW;
      if (current.focusBlockId === blockId) return state;
      return {
        viewByDoc: { ...state.viewByDoc, [packagePath]: { ...current, focusBlockId: blockId } },
      };
    }),

  setDocumentLayout: (packagePath, layout) =>
    set((state) => {
      const current = state.viewByDoc[packagePath] ?? DEFAULT_DOCUMENT_VIEW;
      if (current.layout === layout) return state;
      // A layout switch opens Page in Read (no accidental editing); returning
      // to Continuous restores the default Edit mode. Page Edit is explicit.
      const interactionMode: InteractionMode = layout === 'page' ? 'read' : 'edit';
      return {
        viewByDoc: {
          ...state.viewByDoc,
          [packagePath]: { ...current, layout, interactionMode },
        },
      };
    }),

  setDocumentInteractionMode: (packagePath, mode) =>
    set((state) => {
      const current = state.viewByDoc[packagePath] ?? DEFAULT_DOCUMENT_VIEW;
      // Page Edit is opt-in: the user can toggle Edit in the Page layout. Page
      // still opens in Read on a layout switch.
      const next: InteractionMode = mode === 'edit' ? 'edit' : 'read';
      if (current.interactionMode === next) return state;
      return {
        viewByDoc: { ...state.viewByDoc, [packagePath]: { ...current, interactionMode: next } },
      };
    }),

  setDocumentPage: (packagePath, page) =>
    set((state) => {
      const current = state.viewByDoc[packagePath] ?? DEFAULT_DOCUMENT_VIEW;
      const next = clampPageNumber(page);
      if (current.currentPage === next) return state;
      return {
        viewByDoc: { ...state.viewByDoc, [packagePath]: { ...current, currentPage: next } },
      };
    }),

  setDocumentPageZoom: (packagePath, zoom) =>
    set((state) => {
      const current = state.viewByDoc[packagePath] ?? DEFAULT_DOCUMENT_VIEW;
      const next = clampPageZoom(zoom);
      if (current.pageZoom === next) return state;
      return {
        viewByDoc: { ...state.viewByDoc, [packagePath]: { ...current, pageZoom: next } },
      };
    }),

  setDocumentPageFit: (packagePath, fit) =>
    set((state) => {
      const current = state.viewByDoc[packagePath] ?? DEFAULT_DOCUMENT_VIEW;
      const next = normalizePageFit(fit);
      if (current.pageFit === next) return state;
      return { viewByDoc: { ...state.viewByDoc, [packagePath]: { ...current, pageFit: next } } };
    }),
}));
