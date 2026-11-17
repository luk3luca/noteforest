import { Command } from 'lucide-react';
import { useShell } from '../state/shell';
import { shortcutHint } from '../lib/shortcuts';
import { TabStrip } from './TabBar';

/**
 * The 44 px Toolbar (shell C): the document tab strip and the command palette.
 *
 * It carries no canvas tool. The page position pager and the layout-aware zoom
 * stepper are canvas controls and live in the 34 px fixed canvas header (VH1),
 * next to undo/redo, Export, the find cluster, and the layout/mode segments.
 */
export function Toolbar(): JSX.Element {
  const openPalette = useShell((state) => state.setPaletteOpen);

  return (
    <header className="nf-toolbar" data-toolbar="true">
      <div className="nf-toolbar-leading">
        <TabStrip />
      </div>
      <button
        type="button"
        className="nf-toolbar-button nf-palette-button"
        onClick={() => openPalette(true)}
        title={`Command palette (${shortcutHint('command-palette')})`}
        aria-label="Command palette"
        aria-keyshortcuts="Meta+K"
      >
        <Command size={14} strokeWidth={1.5} aria-hidden="true" />
        <span>K</span>
      </button>
    </header>
  );
}
