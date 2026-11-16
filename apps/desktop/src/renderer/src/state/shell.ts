/** Zustand: shell and session state only. Document content lives in runtimes. */

import { create } from 'zustand';
import type { LibraryView, RecoveryStatus, SidebarTab, TrashPreflight } from '../../../shared/api';
import { SIDEBAR_SNAP_WIDTH, clampSidebarContentWidth } from '../../../shared/shell';
import type { SettingsPageId } from '../settings/settings-pages';
import {
  DEFAULT_OPEN_HEALTH_SECTIONS,
  type DocumentHealthSectionId,
} from '../lib/document-health-sections';
import type { FindResult } from '../lib/find';
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
  ACTIVITY_BAR_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_SNAP_WIDTH,
  clampSidebarContentWidth,
  sidebarContentWidth,
  sidebarPanelWidth,
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
  | { kind: 'health-issue'; rowId: string }
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
  | { kind: 'details'; value: string }
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
  /**
   * Section the sidebar showed before Search was activated. Closing the Search
   * view returns there (Outline when Search was restored directly from a
   * session and there is no previous section).
   */
  sidebarTabBeforeSearch: SidebarTab | null;
  paletteOpen: boolean;
  paletteQuery: string;
  paletteDocumentsOnly: boolean;
  dialog: DialogState | null;
  contextMenu: ContextMenuState | null;
  collapsedTopics: Record<string, string[]>;
  viewByDoc: Record<string, DocumentViewState>;
  /** Expanded Library-tree folders, as root-relative paths (phase 3). */
  expandedLibraryFolders: string[];
  /** Health sections open in this session (Anchors to fix by default). */
  healthOpenSections: DocumentHealthSectionId[];
  /** The issue row selected in the Health list; survives closing the modal. */
  healthSelectedRowId: string | null;
  /**
   * Find surface (phase 6). One engine, two presentations: the toolbar cluster
   * (`findOpen`) and the sidebar Search section share `findQuery`, the result
   * set and the current index. `findQuery` survives closing (the session keeps
   * the last query); the results are cleared once no surface shows them.
   */
  findOpen: boolean;
  findQuery: string;
  /**
   * One shared whole-word mode for both find presentations (F3). Session-only:
   * it survives closing the surfaces like `findQuery` and is never persisted to
   * settings.
   */
  findWholeWord: boolean;
  findResults: FindResult[];
  findTotal: number;
  findTruncated: boolean;
  findIndex: number;
  /** Bumped by `openFind` so ⌘F re-focuses and selects the query. */
  findFocusRequest: number;
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
  /** Close the Search view and return to the section it came from. */
  closeSearchSection: () => void;
  setHealthSectionOpen: (section: DocumentHealthSectionId, open: boolean) => void;
  toggleHealthSection: (section: DocumentHealthSectionId) => void;
  setHealthSelectedRowId: (rowId: string | null) => void;
  setPaletteOpen: (open: boolean, options?: { documentsOnly?: boolean; query?: string }) => void;
  setPaletteQuery: (query: string) => void;
  openFind: () => void;
  closeFind: () => void;
  setFindQuery: (query: string) => void;
  setFindWholeWord: (wholeWord: boolean) => void;
  setFindResults: (results: FindResult[], total: number, truncated: boolean) => void;
  setFindIndex: (index: number) => void;
  nextFind: () => void;
  previousFind: () => void;
  firstFind: () => void;
  lastFind: () => void;
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
  sidebarTabBeforeSearch: null,
  paletteOpen: false,
  paletteQuery: '',
  paletteDocumentsOnly: false,
  dialog: null,
  contextMenu: null,
  collapsedTopics: {},
  viewByDoc: {},
  expandedLibraryFolders: [],
  healthOpenSections: [...DEFAULT_OPEN_HEALTH_SECTIONS],
  healthSelectedRowId: null,
  findOpen: false,
  findQuery: '',
  findWholeWord: false,
  findResults: [],
  findTotal: 0,
  findTruncated: false,
  findIndex: -1,
  findFocusRequest: 0,

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
  setSidebarWidth: (width) => set({ sidebarWidth: clampSidebarContentWidth(width) }),
  setSidebarTab: (tab) =>
    set((state) => {
      const next: SidebarTab =
        tab === 'outline' || tab === 'health' || tab === 'search' ? tab : 'library';
      // Opening Search remembers the section to return to; any other section
      // clears the memory so a later Search starts from the current one.
      const before =
        next === 'search'
          ? state.sidebarTab === 'search'
            ? state.sidebarTabBeforeSearch
            : state.sidebarTab
          : null;
      if (next === state.sidebarTab && before === state.sidebarTabBeforeSearch) return state;
      return { sidebarTab: next, sidebarTabBeforeSearch: before };
    }),
  closeSearchSection: () =>
    set((state) => {
      const previous = state.sidebarTabBeforeSearch ?? 'outline';
      const next: SidebarTab = previous === 'search' ? 'outline' : previous;
      return {
        sidebarTab: next,
        sidebarTabBeforeSearch: null,
        // The toolbar cluster may still be open; only the last surface clears
        // the shared result set.
        ...(state.findOpen
          ? {}
          : { findResults: [], findTotal: 0, findTruncated: false, findIndex: -1 }),
      };
    }),

  setHealthSectionOpen: (section, open) =>
    set((state) => {
      const current = state.healthOpenSections.includes(section);
      if (current === open) return state;
      return {
        healthOpenSections: open
          ? [...state.healthOpenSections, section]
          : state.healthOpenSections.filter((id) => id !== section),
      };
    }),
  toggleHealthSection: (section) =>
    set((state) => ({
      healthOpenSections: state.healthOpenSections.includes(section)
        ? state.healthOpenSections.filter((id) => id !== section)
        : [...state.healthOpenSections, section],
    })),
  setHealthSelectedRowId: (rowId) => set({ healthSelectedRowId: rowId }),

  setPaletteOpen: (open, options = {}) =>
    set({
      paletteOpen: open,
      paletteQuery: options.query ?? '',
      paletteDocumentsOnly: options.documentsOnly ?? false,
    }),
  setPaletteQuery: (query) => set({ paletteQuery: query }),

  openFind: () =>
    set((state) => ({
      findOpen: true,
      findFocusRequest: state.findFocusRequest + 1,
    })),
  closeFind: () =>
    set((state) => ({
      findOpen: false,
      // The sidebar Search is the other presentation of the same result set:
      // closing the cluster must not empty the browsing list.
      ...(state.sidebarTab === 'search'
        ? {}
        : { findResults: [], findTotal: 0, findTruncated: false, findIndex: -1 }),
    })),
  setFindQuery: (query) => set({ findQuery: query }),
  setFindWholeWord: (wholeWord) => set({ findWholeWord: wholeWord }),
  setFindResults: (results, total, truncated) =>
    set({
      findResults: results,
      findTotal: total,
      findTruncated: truncated,
      findIndex: results.length === 0 ? -1 : 0,
    }),
  setFindIndex: (index) =>
    set((state) => {
      if (state.findResults.length === 0) return { findIndex: -1 };
      const next = Math.min(Math.max(index, 0), state.findResults.length - 1);
      return next === state.findIndex ? state : { findIndex: next };
    }),
  nextFind: () =>
    set((state) => {
      if (state.findResults.length === 0) return { findIndex: -1 };
      const next = (Math.max(state.findIndex, -1) + 1) % state.findResults.length;
      return { findIndex: next };
    }),
  previousFind: () =>
    set((state) => {
      if (state.findResults.length === 0) return { findIndex: -1 };
      const current = state.findIndex < 0 ? 0 : state.findIndex;
      const next =
        (current - 1 + state.findResults.length) % state.findResults.length;
      return { findIndex: next };
    }),
  firstFind: () =>
    set((state) => ({
      findIndex: state.findResults.length === 0 ? -1 : 0,
    })),
  lastFind: () =>
    set((state) => ({
      findIndex: state.findResults.length === 0 ? -1 : state.findResults.length - 1,
    })),

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

/**
 * True while either presentation of the find surface is showing: the toolbar
 * cluster or the sidebar Search view. Both read the same query and results.
 */
export function findSurfaceActive(state: ShellState): boolean {
  return state.findOpen || state.sidebarTab === 'search';
}

/**
 * The current find hit, or null when nothing matches. The result set is the
 * shared one; the two presentations differ only in whether they render.
 * The object is the one stored in `findResults`, so its identity is stable
 * across unrelated store updates: selecting it never loops React.
 */
export function currentFindResult(state: ShellState): FindResult | null {
  if (state.findIndex < 0) return null;
  return state.findResults[state.findIndex] ?? null;
}

/** Subscribe to the current find hit. */
export function useCurrentFindResult(): FindResult | null {
  return useShell(currentFindResult);
}
