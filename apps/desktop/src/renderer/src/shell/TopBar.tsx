import { Command, PanelLeftOpen } from 'lucide-react';
import { useShell } from '../state/shell';
import { toggleSidebar } from '../actions';
import { TabStrip } from './TabBar';
import { ViewControls } from './ViewControls';

/**
 * The one shell bar (V0): macOS traffic lights, document tabs, new note,
 * layout-aware view controls, and the command palette. Settings lives in the
 * Sidebar footer; no separate title row and no Settings gear here.
 *
 * Empty areas remain the window drag region; tabs and controls are no-drag.
 */
export function TopBar(): JSX.Element {
  const sidebarCollapsed = useShell((state) => state.sidebarCollapsed);
  const openPalette = useShell((state) => state.setPaletteOpen);

  return (
    <header className="nf-topbar" data-topbar="true">
      <div className="nf-topbar-leading">
        {sidebarCollapsed ? (
          <button
            type="button"
            className="nf-topbar-button nf-sidebar-reveal"
            data-sidebar-reveal="true"
            aria-label="Show sidebar"
            aria-expanded={false}
            title="Show sidebar (⌘\\)"
            onClick={toggleSidebar}
          >
            <PanelLeftOpen size={15} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ) : null}
        <TabStrip />
      </div>
      <ViewControls />
      <button
        type="button"
        className="nf-topbar-button nf-palette-button"
        onClick={() => openPalette(true)}
        title="Command palette (⌘K)"
        aria-label="Command palette"
        aria-keyshortcuts="Meta+K"
      >
        <Command size={14} strokeWidth={1.5} aria-hidden="true" />
        <span>K</span>
      </button>
    </header>
  );
}
