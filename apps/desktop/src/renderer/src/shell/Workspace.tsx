import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FilePlus2, Search } from 'lucide-react';
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_SNAP_WIDTH,
  useShell,
} from '../state/shell';
import { getRuntime, useRegistry, useRuntime } from '../state/registry';
import { createNewDocument } from '../actions';
import { DocumentEditor } from '../editor/DocumentEditor';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { RecoverySurface } from './RecoverySurface';
import { DocumentStatusPanel } from './DocumentStatusPanel';

function EmptyState(): JSX.Element {
  const openPalette = useShell((state) => state.setPaletteOpen);
  return (
    <div className="nf-empty-state">
      <div className="nf-empty-inner">
        <h1 className="nf-empty-title">NoteForest</h1>
        <p className="nf-empty-copy">No document open.</p>
        <div className="nf-empty-actions">
          <button type="button" className="nf-button nf-button-primary" onClick={() => void createNewDocument()}>
            <FilePlus2 size={14} strokeWidth={1.5} aria-hidden="true" />
            New note
          </button>
          <button type="button" className="nf-button" onClick={() => openPalette(true, { documentsOnly: true })}>
            <Search size={14} strokeWidth={1.5} aria-hidden="true" />
            Open document
          </button>
        </div>
        <p className="nf-empty-hint">⌘N new · ⌘K search · ⌘\ sidebar</p>
      </div>
    </div>
  );
}

function useNarrowWindow(): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 820);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 820px)');
    const onChange = (): void => setNarrow(query.matches);
    query.addEventListener('change', onChange);
    onChange();
    return () => query.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

/** Collapsed sidebar width; the rail is a real column, not a hidden panel. */
const RAIL_WIDTH = 48;
/** A released drag this close to the default settles onto it. */
const SNAP_TOLERANCE = 10;
const SNAP_DELAY_MS = 140;

/**
 * The workspace body (V0 visual): a persistent Sidebar panel and a main column
 * holding the 44 px Toolbar and the rounded Canvas panel.
 *
 * The Sidebar is a collapsible resizable panel that collapses to a 48 px rail.
 * The Group stays mounted, so the editor keeps its state and scroll across a
 * collapse. A narrow window auto-collapses to the rail without overwriting the
 * user's persisted preference; the rail expand is a temporary override there.
 */
export function Workspace(): JSX.Element {
  const narrow = useNarrowWindow();
  const sidebarCollapsed = useShell((state) => state.sidebarCollapsed);
  const sidebarWidth = useShell((state) => state.sidebarWidth);
  const setSidebarWidth = useShell((state) => state.setSidebarWidth);
  const tabs = useShell((state) => state.tabs);
  const activeTab = useShell((state) => state.activeTab);
  const panelRef = usePanelRef();
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWidth = useRef(sidebarWidth);
  const dragging = useRef(false);
  const [narrowExpanded, setNarrowExpanded] = useState(false);
  useRegistry();
  // The status panel belongs to the active document only and lives outside the
  // canvas scroll/zoom surface (R3).
  const { runtime: activeRuntime } = useRuntime(activeTab);

  const rail = sidebarCollapsed || (narrow && !narrowExpanded);

  const clearSnap = useCallback(() => {
    if (snapTimer.current !== null) {
      clearTimeout(snapTimer.current);
      snapTimer.current = null;
    }
  }, []);

  /**
   * After a drag settles, a width within 10 px of the default snaps onto it.
   * The timer is reset on every resize event, so only the release schedules it.
   */
  const scheduleSnap = useCallback(
    (width: number) => {
      clearSnap();
      if (rail) return;
      const distance = Math.abs(width - SIDEBAR_SNAP_WIDTH);
      if (distance <= 0.5 || distance > SNAP_TOLERANCE) return;
      snapTimer.current = setTimeout(() => {
        snapTimer.current = null;
        if (rail || panelRef.current === null) return;
        panelRef.current.resize(SIDEBAR_SNAP_WIDTH);
        setSidebarWidth(SIDEBAR_SNAP_WIDTH);
      }, SNAP_DELAY_MS);
    },
    [clearSnap, panelRef, rail, setSidebarWidth],
  );

  const resetSidebarWidth = useCallback(() => {
    clearSnap();
    if (rail || panelRef.current === null) return;
    panelRef.current.resize(SIDEBAR_SNAP_WIDTH);
    setSidebarWidth(SIDEBAR_SNAP_WIDTH);
  }, [clearSnap, panelRef, rail, setSidebarWidth]);

  useEffect(() => clearSnap, [clearSnap, rail]);

  // The separator is owned by react-resizable-panels; a native capture-phase
  // listener observes the drag without replacing its pointer handlers. A drag
  // never schedules a snap, only a release does.
  useEffect(() => {
    const isSeparator = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('.nf-separator') !== null;
    const onPointerDown = (event: PointerEvent): void => {
      if (!isSeparator(event.target)) return;
      dragging.current = true;
      clearSnap();
    };
    const onPointerUp = (event: PointerEvent): void => {
      if (!dragging.current) return;
      if (!isSeparator(event.target) && event.type === 'pointercancel') return;
      dragging.current = false;
      const width = panelRef.current?.getSize().inPixels ?? lastWidth.current;
      if (width >= SIDEBAR_MIN_WIDTH) {
        lastWidth.current = width;
        setSidebarWidth(width);
      }
      scheduleSnap(width);
    };
    const onDoubleClick = (event: MouseEvent): void => {
      if (!isSeparator(event.target)) return;
      resetSidebarWidth();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);
    window.addEventListener('dblclick', onDoubleClick, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('dblclick', onDoubleClick, true);
    };
  }, [clearSnap, resetSidebarWidth, scheduleSnap, panelRef, setSidebarWidth]);

  // The persisted preference is the source of truth; narrow is a viewport
  // override. Reset the override when the window is wide again.
  useEffect(() => {
    if (!narrow) setNarrowExpanded(false);
  }, [narrow]);

  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return;
    if (rail) {
      if (!panel.isCollapsed()) panel.collapse();
    } else if (panel.isCollapsed()) {
      panel.expand();
      // A panel collapsed before its first layout has no remembered expand
      // size; the persisted width is the source of truth on every expand.
      panel.resize(sidebarWidth);
    }
  }, [rail, panelRef, sidebarWidth]);

  const expandSidebar = useCallback(() => {
    if (narrow) setNarrowExpanded(true);
    if (sidebarCollapsed) useShell.getState().setSidebarCollapsed(false);
    panelRef.current?.expand();
    panelRef.current?.resize(sidebarWidth);
  }, [narrow, panelRef, sidebarCollapsed, sidebarWidth]);

  const editor = (
    <div className="nf-editor-column">
      <div className="nf-editor-area">
        {tabs.length === 0 ? <EmptyState /> : null}
        {tabs.map((tab) => {
          const active = tab.packagePath === activeTab;
          const runtime = getRuntime(tab.packagePath);
          const recovery =
            tab.recovery ??
            (tab.missing === true || runtime === null
              ? {
                  status: 'missing' as const,
                  reason: 'This document could not be opened. It may have moved or been deleted.',
                  details: [],
                  warnings: [],
                }
              : null);
          if (recovery !== null) {
            return active ? (
              <RecoverySurface
                key={tab.packagePath}
                packagePath={tab.packagePath}
                title={tab.title}
                recovery={recovery}
              />
            ) : null;
          }
          if (runtime === null) return null;
          return (
            <DocumentEditor key={tab.packagePath} runtime={runtime} active={active} />
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="nf-workspace-shell" data-rail={rail ? 'true' : 'false'}>
      <Group
        orientation="horizontal"
        className="nf-workspace"
        onLayoutChange={() => undefined}
      >
        <Panel
          id="sidebar"
          className="nf-sidebar-panel"
          defaultSize={sidebarWidth}
          minSize={SIDEBAR_MIN_WIDTH}
          maxSize={SIDEBAR_MAX_WIDTH}
          collapsible
          collapsedSize={RAIL_WIDTH}
          disabled={rail}
          panelRef={panelRef}
          onResize={(size) => {
            // Collapse passes through the rail width; never persist it. During
            // a drag the release handler persists once, so the panel is not
            // re-rendered mid-gesture.
            if (rail) return;
            if (size.inPixels < SIDEBAR_MIN_WIDTH) return;
            lastWidth.current = size.inPixels;
            if (dragging.current) return;
            setSidebarWidth(size.inPixels);
            scheduleSnap(size.inPixels);
          }}
        >
          <Sidebar collapsed={rail} onExpand={expandSidebar} />
        </Panel>
        <Separator
          className="nf-separator"
          aria-label="Resize sidebar"
          title="Drag to resize the sidebar; double-click to reset"
          disableDoubleClick
        />
        <Panel id="main" className="nf-main-panel" minSize={480}>
          <div className="nf-main-column">
            <Toolbar />
            <DocumentStatusPanel runtime={activeRuntime} />
            <div className="nf-canvas-panel" data-canvas-panel="true">
              {editor}
            </div>
          </div>
        </Panel>
      </Group>
    </div>
  );
}
