import { Command } from 'lucide-react';
import { useShell } from '../state/shell';
import { TabStrip } from './TabBar';
import { ViewControls } from './ViewControls';

/**
 * The 44 px Toolbar (V0 visual): the document tab strip, New note, the
 * layout-aware ViewControls, and the command palette. It is the first panel of
 * the main column, so the tabs start after the Sidebar and shift with its
 * collapsed rail; there is no full-width hard rule between it and the canvas.
 */
export function Toolbar(): JSX.Element {
  const openPalette = useShell((state) => state.setPaletteOpen);

  return (
    <header className="nf-toolbar" data-toolbar="true">
      <div className="nf-toolbar-leading">
        <TabStrip />
      </div>
      <ViewControls />
      <button
        type="button"
        className="nf-toolbar-button nf-palette-button"
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
