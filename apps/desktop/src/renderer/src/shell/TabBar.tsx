import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, Lock, Plus, X } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShell, type TabInfo } from '../state/shell';
import { useRuntime } from '../state/registry';
import { closeTab, createNewDocument, openPath, openTabMenu } from '../actions';
import { tabElementId, tabPanelElementId } from '../lib/tab-ids';

/**
 * Batch V tab policy. Active tabs expand (170–220 px), inactive tabs stay
 * compact (96 px, shrinking to an 80 px floor). When even the floor does not
 * fit, the visible window keeps the active tab and as many neighbours as fit;
 * the existing overflow menu lists every open tab. Keep these in sync with
 * `.nf-tab` / `.nf-tab[data-active]` in styles.css.
 */
const TAB_GAP = 4;
const INACTIVE_TAB_FLOOR = 80;
const ACTIVE_TAB_FLOOR = 170;

function visibleTabWindow(
  tabs: TabInfo[],
  activeTab: string | null,
  available: number,
): TabInfo[] {
  if (tabs.length === 0) return tabs;
  if (!Number.isFinite(available)) return tabs;
  const floorWidth = (count: number): number =>
    ACTIVE_TAB_FLOOR + Math.max(0, count - 1) * (INACTIVE_TAB_FLOOR + TAB_GAP);
  if (floorWidth(tabs.length) <= available) return tabs;

  const activeIndex = tabs.findIndex((tab) => tab.packagePath === activeTab);
  let start = activeIndex < 0 ? 0 : activeIndex;
  let end = start;
  const fits = (nextStart: number, nextEnd: number): boolean =>
    floorWidth(nextEnd - nextStart + 1) <= available;
  let preferAfter = true;
  while (true) {
    const canAfter = end + 1 < tabs.length && fits(start, end + 1);
    const canBefore = start - 1 >= 0 && fits(start - 1, end);
    if (preferAfter && canAfter) end += 1;
    else if (!preferAfter && canBefore) start -= 1;
    else if (canAfter) end += 1;
    else if (canBefore) start -= 1;
    else break;
    preferAfter = !preferAfter;
  }
  return tabs.slice(start, end + 1);
}

function tabButtonTitle(tab: TabInfo): string {
  return tab.title;
}

function SortableTab({ tab }: { tab: TabInfo }): JSX.Element {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.packagePath,
  });
  const active = useShell((state) => state.activeTab) === tab.packagePath;
  const setActive = useShell((state) => state.setActiveTab);
  const { runtime } = useRuntime(tab.packagePath);
  const dirty = tab.missing !== true && runtime !== null && runtime.saveState !== 'saved';
  const readOnly = tab.readOnlyReason !== undefined || runtime?.status === 'read-only';

  return (
    <div
      ref={setNodeRef}
      role="presentation"
      className="nf-tab"
      data-active={active}
      data-dragging={isDragging}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onAuxClick={(event) => {
        if (event.button === 1) {
          event.preventDefault();
          void closeTab(tab.packagePath);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openTabMenu(tab.packagePath, { x: event.clientX, y: event.clientY });
      }}
    >
      <button
        type="button"
        role="tab"
        id={tabElementId(tab.packagePath)}
        aria-selected={active}
        aria-controls={tabPanelElementId(tab.packagePath)}
        tabIndex={active ? 0 : -1}
        className="nf-tab-label"
        title={tabButtonTitle(tab)}
        onClick={() => setActive(tab.packagePath)}
        onDoubleClick={() => setActive(tab.packagePath)}
        {...listeners}
      >
        {tab.missing === true || tab.recovery !== undefined ? (
          <span
            className="nf-tab-missing"
            aria-label={tab.recovery === undefined ? 'Missing document' : 'Recovery required'}
          >
            !
          </span>
        ) : null}
        {readOnly ? <Lock size={11} strokeWidth={1.5} className="nf-tab-lock" aria-hidden="true" /> : null}
        {dirty ? <span className="nf-tab-dot" aria-label="Unsaved changes" /> : null}
        <span className="nf-tab-title">{tab.title}</span>
      </button>
      <button
        type="button"
        className="nf-tab-close"
        // The chip wrapper is role=presentation, so a focusable descendant
        // would invalidate the tablist ARIA tree. Keyboard close is the tablist
        // Delete handler plus ⌘W; the chip button stays a pointer affordance.
        aria-hidden="true"
        tabIndex={-1}
        title={`Close ${tab.title} (⌘W)`}
        onClick={(event) => {
          event.stopPropagation();
          void closeTab(tab.packagePath);
        }}
      >
        <X size={12} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The Toolbar document tab strip: tabs (activate, close, middle-click, drag
 * reorder), new note, and the overflow menu. The active tab title is the
 * document identity; the app name lives in the separate 30 px TitleBar.
 */
export function TabStrip(): JSX.Element {
  const tabs = useShell((state) => state.tabs);
  const activeTab = useShell((state) => state.activeTab);
  const reorderTabs = useShell((state) => state.reorderTabs);
  const openContextMenu = useShell((state) => state.openContextMenu);
  const library = useShell((state) => state.library);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const stripRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(Number.POSITIVE_INFINITY);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (strip === null) return undefined;
    const measure = (): void => {
      const actionsWidth = actionsRef.current?.getBoundingClientRect().width ?? 0;
      const next = Math.max(0, strip.clientWidth - actionsWidth - TAB_GAP);
      setAvailableWidth((current) => (Math.abs(current - next) < 0.5 ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    if (actionsRef.current !== null) observer.observe(actionsRef.current);
    return () => observer.disconnect();
  }, []);

  const visibleTabs = useMemo(
    () => visibleTabWindow(tabs, activeTab, availableWidth),
    [tabs, activeTab, availableWidth],
  );

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    reorderTabs(String(active.id), String(over.id));
  };

  const openOverflow = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    openContextMenu(rect.left - 120, rect.bottom + 4, [
      { id: 'new', label: 'New note', shortcut: '⌘N', onSelect: () => void createNewDocument() },
      ...(tabs.length === 0
        ? []
        : [{ id: 'sep', label: '', separator: true } as const]),
      ...tabs.map((tab) => ({
        id: `tab-${tab.packagePath}`,
        label: tab.title,
        onSelect: () => useShell.getState().setActiveTab(tab.packagePath),
      })),
      ...(library?.documents.length ?? 0) > 0
        ? [{ id: 'sep-2', label: '', separator: true } as const]
        : [],
      ...(library?.documents ?? []).slice(0, 8).map((document) => ({
        id: `open-${document.packagePath}`,
        label: `Open · ${document.title}`,
        onSelect: () => void openPath(document.packagePath),
      })),
    ]);
  };

  const onTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const state = useShell.getState();
    const index = state.tabs.findIndex((tab) => tab.packagePath === state.activeTab);
    if (index < 0) return;
    const focusAt = (next: number): void => {
      const tab = state.tabs[next];
      if (tab === undefined) return;
      state.setActiveTab(tab.packagePath);
      requestAnimationFrame(() => {
        document.getElementById(tabElementId(tab.packagePath))?.focus();
      });
    };
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusAt((index + 1) % state.tabs.length);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusAt((index - 1 + state.tabs.length) % state.tabs.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusAt(state.tabs.length - 1);
    } else if (event.key === 'Delete') {
      event.preventDefault();
      const current = state.activeTab;
      if (current !== null) void closeTab(current);
    }
  };

  return (
    <div className="nf-tab-strip" ref={stripRef}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={visibleTabs.map((tab) => tab.packagePath)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            className="nf-tablist"
            role="tablist"
            aria-label="Open documents"
            onKeyDown={onTablistKeyDown}
          >
            {visibleTabs.map((tab) => (
              <SortableTab key={tab.packagePath} tab={tab} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="nf-tab-actions" ref={actionsRef}>
        <button
          type="button"
          className="nf-toolbar-button"
          aria-label="New note"
          title="New note (⌘N)"
          data-toolbar-new="true"
          onClick={() => void createNewDocument()}
        >
          <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-toolbar-button"
          aria-label="All open tabs"
          title="All tabs"
          onClick={openOverflow}
        >
          <ChevronDown size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
