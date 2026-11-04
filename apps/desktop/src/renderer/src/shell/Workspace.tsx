import { Panel, Group, Separator } from 'react-resizable-panels';
import { useEffect, useState, type CSSProperties } from 'react';
import { FilePlus2, Search } from 'lucide-react';
import { useShell } from '../state/shell';
import { getRuntime, useRegistry } from '../state/registry';
import { createNewDocument } from '../actions';
import { DocumentEditor } from '../editor/DocumentEditor';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { RecoverySurface } from './RecoverySurface';

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

export function Workspace(): JSX.Element {
  const narrow = useNarrowWindow();
  const sidebarCollapsed = useShell((state) => state.sidebarCollapsed);
  const sidebarWidth = useShell((state) => state.sidebarWidth);
  const setSidebarWidth = useShell((state) => state.setSidebarWidth);
  const tabs = useShell((state) => state.tabs);
  const activeTab = useShell((state) => state.activeTab);
  useRegistry();

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
  const tabsStrip = <TabBar />;

  if (sidebarCollapsed || narrow) {
    return (
      <div className="nf-workspace nf-workspace-collapsed">
        {tabsStrip}
        {editor}
      </div>
    );
  }

  return (
    <div
      className="nf-workspace-shell"
      style={{ '--nf-sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      {/* DOM order is the keyboard focus order: the tab strip comes before the
          sidebar and the editor, while CSS keeps it over the editor column. */}
      {tabsStrip}
      <Group
        orientation="horizontal"
        className="nf-workspace"
        onLayoutChange={() => undefined}
      >
        <Panel
          id="sidebar"
          className="nf-sidebar-panel"
          defaultSize={sidebarWidth}
          minSize={208}
          maxSize={360}
          onResize={(size) => {
            if (size.inPixels > 0) setSidebarWidth(size.inPixels);
          }}
        >
          <Sidebar />
        </Panel>
        <Separator className="nf-separator" aria-label="Resize sidebar" />
        <Panel id="editor" className="nf-editor-panel" minSize={480}>
          {editor}
        </Panel>
      </Group>
    </div>
  );
}
