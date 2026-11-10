import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, Lock, Plus, X } from 'lucide-react';
import { useShell, type TabInfo } from '../state/shell';
import { useRuntime } from '../state/registry';
import { closeTab, createNewDocument, openPath, openTabMenu } from '../actions';
import { tabElementId, tabPanelElementId } from '../lib/tab-ids';

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
 * The TopBar document tab strip: tabs (activate, close, middle-click, drag
 * reorder), new note, and the overflow menu. The active tab title is the
 * document identity; there is no separate app-name/title row.
 */
export function TabStrip(): JSX.Element {
  const tabs = useShell((state) => state.tabs);
  const activeTab = useShell((state) => state.activeTab);
  const activeTabInfo = useShell((state) =>
    state.tabs.find((tab) => tab.packagePath === state.activeTab),
  );
  const reorderTabs = useShell((state) => state.reorderTabs);
  const openContextMenu = useShell((state) => state.openContextMenu);
  const library = useShell((state) => state.library);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
    <div className="nf-tab-strip">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tabs.map((tab) => tab.packagePath)} strategy={horizontalListSortingStrategy}>
          <div
            className="nf-tablist"
            role="tablist"
            aria-label="Open documents"
            onKeyDown={onTablistKeyDown}
          >
            {tabs.map((tab) => (
              <SortableTab key={tab.packagePath} tab={tab} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="nf-tab-actions">
        <button
          type="button"
          className="nf-topbar-button"
          aria-label={`Close ${activeTabInfo?.title ?? 'tab'}`}
          title="Close current tab (⌘W)"
          data-close-active-tab="true"
          disabled={activeTab === null}
          onClick={() => {
            if (activeTab !== null) void closeTab(activeTab);
          }}
        >
          <X size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-topbar-button"
          aria-label="New note"
          title="New note (⌘N)"
          data-topbar-new="true"
          onClick={() => void createNewDocument()}
        >
          <Plus size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="nf-topbar-button"
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
