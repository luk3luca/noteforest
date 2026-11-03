import { Command, Settings } from 'lucide-react';
import { useShell } from '../state/shell';
import { useRuntime } from '../state/registry';
import { activeTab } from '../actions';

export function TitleBar(): JSX.Element {
  const activeTabPath = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTabPath);
  const tab = activeTab();
  const title = runtime?.title ?? tab?.title ?? 'NoteForest';
  const openPalette = useShell((state) => state.setPaletteOpen);
  const openDialog = useShell((state) => state.openDialog);

  return (
    <header className="nf-titlebar">
      <div className="nf-titlebar-left">
        <span className="nf-app-name">NoteForest</span>
        {activeTabPath === null ? null : (
          <>
            <span className="nf-titlebar-separator" aria-hidden="true">
              /
            </span>
            <button
              type="button"
              className="nf-document-title"
              title="Rename document"
              onClick={() => openDialog({ kind: 'rename-document' })}
            >
              {title}
            </button>
          </>
        )}
      </div>
      <div className="nf-titlebar-actions">
        <button
          type="button"
          className="nf-titlebar-button nf-palette-button"
          onClick={() => openPalette(true)}
          title="Command palette"
          aria-label="Command palette"
        >
          <Command size={13} strokeWidth={1.5} aria-hidden="true" />
          <span>K</span>
        </button>
        <button
          type="button"
          className="nf-titlebar-button"
          onClick={() => openDialog({ kind: 'settings' })}
          aria-label="Settings"
          title="Settings (⌘,)"
        >
          <Settings size={15} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
