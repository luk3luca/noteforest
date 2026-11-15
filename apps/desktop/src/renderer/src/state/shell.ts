/** Zustand: shell and session state only. Document content lives in runtimes. */

import { create } from 'zustand';
import type { LibraryView, RecoveryStatus, SidebarTab, TrashPreflight } from '../../../shared/api';
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_SNAP_WIDTH,
} from '../../../shared/shell';
import type { SettingsPageId } from '../settings/settings-pages';
import type { DocumentHealthFilter } from '../lib/document-health';
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
export {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_SNAP_WIDTH,
} from '../../../shared/shell';

/** Read-only package state shown by the recovery tab. */
export interface RecoveryTabInfo {
  status: RecoveryStatus;
  reason: string;
  details: string[];
  warnings: string[];
}

export interface TabInfo {
  packagePath: string;
  /**
   * Stable tab/editor identity. A draft keys by the canonical document id, so
   * the draft→package swap never remounts it; a normal tab adds its package
   * path, so two copies sharing a document id never collide (F3). It is the
   * package path for recovery/missing tabs.
   */
  tabKey?: string;
  title: string;
  /** `markdown` is a guest `.md` file, not a NoteForest package. */
  kind?: 'note' | 'markdown';
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
  /** Why a palette/context row is disabled (palette shows it; menus use title). */
  reason?: string;
  /** Switcher menu: current library check. */
  checked?: boolean;
  /** Switcher menu: duplicate-basename parent path on a second line. */
  description?: string;
  separator?: boolean;
  onSelect?: () => void;
}

export type DialogState =
  | { kind: 'move'; blockId: string }
  | { kind: 'delete-block'; blockId: string }
  | { kind: 'delete-branch'; blockId: string }
  | { kind: 'link-reference'; blockId: string; anchorId?: string }
  | { kind: 'image-alt'; blockId: string; path: number[]; assetId: string; alt: string }
  | { kind: 'anchor-health'; anchorId?: string; filter?: DocumentHealthFilter }
  | { kind: 'rename-document' }
  | { kind: 'rename-chapter'; chapterId: string }
  | { kind: 'rename-block'; blockId: string }
  | { kind: 'link'; href: string }
  | { kind: 'math'; mathKind: 'inline' | 'block'; latex: string; pos: number | null }
  | { kind: 'table-size' }
  | { kind: 'close-tab'; packagePath: string }
  | { kind: 'markdown-close'; path: string }
  | { kind: 'markdown-conflict'; path: string }
  | { kind: 'reload-from-disk'; packagePath: string }
  | { kind: 'overwrite-external'; packagePath: string }
  | { kind: 'restore-backup'; packagePath: string }
  | { kind: 'trash-document'; packagePath: string; preflight: TrashPreflight }
  | { kind: 'new-library' }
  | { kind: 'new-folder'; parentPath: string }
  | { kind: 'rename-folder'; path: string; name: string }
  | { kind: 'move-vault-entry'; path: string; name: string; entryKind: 'folder' | 'note' | 'markdown' }
  | { kind: 'settings'; page?: SettingsPageId };

export interface ContextMenuState {
  x: number;
  y: number;
  items: MenuEntry[];
  /** Cleanup for the surface that opened the menu (never steals focus). */
  onClose?: () => void;
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
  sidebarTab: SidebarTab;
  paletteOpen: boolean;
  paletteQuery: string;
  paletteDocumentsOnly: boolean;
  dialog: DialogState | null;
  contextMenu: ContextMenuState | null;
  collapsedTopics: Record<string, string[]>;
  viewByDoc: Record<string, DocumentViewState>;
  /** Expanded Library-tree folders, as root-relative paths (phase 3). */
  expandedLibraryFolders: string[];
  setReady: (ready: boolean) => void;
  setLibrary: (library: LibraryView) => void;
  setExpandedLibraryFolders: (paths: string[]) => void;
  setLibraryFolderExpanded: (relativePath: string, expanded: boolean) => void;
  toggleLibraryFolder: (relativePath: string) => void;
  setTabs: (tabs: TabInfo[], activeTab: string | null) => void;
  openTab: (tab: TabInfo, options?: { activate?: boolean }) => void;
  closeTab: (packagePath: string) => void;
  setActiveTab: (packagePath: string) => void;
  reorderTabs: (from: string, to: string) => void;
  /**
   * Move every shell reference from a draft key to the materialized package
   * path (tab, active tab, view state, collapsed topics, closed stack). The
   * editor is keyed by `tabKey`, so this never remounts it.
   */
  rekeyDocument: (from: string, to: string, title?: string) => void;
  pushClosed: (tab: TabInfo) => void;
  popClosed: () => TabInfo | undefined;
  updateTitle: (packagePath: string, title: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setPaletteOpen: (open: boolean, options?: { documentsOnly?: boolean; query?: string }) => void;
  setPaletteQuery: (query: string) => void;
  openDialog: (dialog: DialogState) => void;
  closeDialog: () => void;
  openContextMenu: (x: number, y: number, items: MenuEntry[], options?: { onClose?: () => void }) => void;
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
  sidebarWidth: SIDEBAR_SNAP_WIDTH,
  sidebarTab: 'library',
  paletteOpen: false,
  paletteQuery: '',
  paletteDocumentsOnly: false,
  dialog: null,
  contextMenu: null,
  collapsedTopics: {},
  viewByDoc: {},
  expandedLibraryFolders: [],

  setReady: (ready) => set({ ready }),
  setLibrary: (library) => set({ library }),

  setExpandedLibraryFolders: (paths) =>
    set({ expandedLibraryFolders: [...new Set(paths)] }),
  setLibraryFolderExpanded: (relativePath, expanded) =>
    set((state) => {
      const current = state.expandedLibraryFolders.includes(relativePath);
      if (current === expanded) return state;
      return {
        expandedLibraryFolders: expanded
          ? [...state.expandedLibraryFolders, relativePath]
          : state.expandedLibraryFolders.filter((path) => path !== relativePath),
      };
    }),
  toggleLibraryFolder: (relativePath) =>
    set((state) => ({
      expandedLibraryFolders: state.expandedLibraryFolders.includes(relativePath)
        ? state.expandedLibraryFolders.filter((path) => path !== relativePath)
        : [...state.expandedLibraryFolders, relativePath],
    })),

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

  rekeyDocument: (from, to, title) =>
    set((state) => {
      if (from === to) return state;
      const tabs = state.tabs.map((tab) =>
        tab.packagePath === from
          ? { ...tab, packagePath: to, ...(title === undefined ? {} : { title }) }
          : tab,
      );
      const activeTab = state.activeTab === from ? to : state.activeTab;
      const rekey = <T,>(map: Record<string, T>): Record<string, T> => {
        if (map[from] === undefined) return map;
        const next = { ...map };
        next[to] = next[from] as T;
        delete next[from];
        return next;
      };
      const recentClosed = state.recentClosed.map((tab) =>
        tab.packagePath === from ? { ...tab, packagePath: to } : tab,
      );
      return {
        tabs,
        activeTab,
        viewByDoc: rekey(state.viewByDoc),
        collapsedTopics: rekey(state.collapsedTopics),
        recentClosed,
      };
    }),

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
  setSidebarWidth: (width) =>
    set({
      sidebarWidth: Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)),
      ),
    }),
  setSidebarTab: (tab) => set({ sidebarTab: tab === 'outline' ? 'outline' : 'library' }),

  setPaletteOpen: (open, options = {}) =>
    set({
      paletteOpen: open,
      paletteQuery: options.query ?? '',
      paletteDocumentsOnly: options.documentsOnly ?? false,
    }),
  setPaletteQuery: (query) => set({ paletteQuery: query }),

  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),

  openContextMenu: (x, y, items, options = {}) =>
    set((state) => {
      state.contextMenu?.onClose?.();
      return { contextMenu: { x, y, items, ...(options.onClose === undefined ? {} : { onClose: options.onClose }) } };
    }),
  closeContextMenu: () =>
    set((state) => {
      state.contextMenu?.onClose?.();
      return { contextMenu: null };
    }),

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
      // Layout and interaction mode are independent (ADR-0007): switching
      // Continuous ⇄ Page keeps Edit or Read. Page Edit stays opt-in per block;
      // committing the active overlay is the caller's job before this runs.
      return {
        viewByDoc: {
          ...state.viewByDoc,
          [packagePath]: { ...current, layout },
        },
      };
    }),

  setDocumentInteractionMode: (packagePath, mode) =>
    set((state) => {
      const current = state.viewByDoc[packagePath] ?? DEFAULT_DOCUMENT_VIEW;
      // Page Edit is opt-in per block. The mode itself is independent from the
      // layout: an explicit Edit/Read choice survives Continuous ⇄ Page.
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
