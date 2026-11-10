import { Command } from 'lucide-react';
import { useShell } from '../state/shell';
import { TabStrip } from './TabBar';
import { ZoomControls } from './ViewControls';

/**
 * The 44 px Toolbar (shell C): the document tab strip, the layout-aware zoom
 * stepper, and the command palette. Layout/mode moved to the fixed canvas
 * header; the Toolbar no longer carries view segments.
 */
export function Toolbar(): JSX.Element {
  const openPalette = useShell((state) => state.setPaletteOpen);

  return (
    <header className="nf-toolbar" data-toolbar="true">
      <div className="nf-toolbar-leading">
        <TabStrip />
      </div>
      <ZoomControls />
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
