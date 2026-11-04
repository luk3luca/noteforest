import { useMemo } from 'react';
import { useRuntime } from '../state/registry';
import { useShell } from '../state/shell';
import {
  adjustActiveZoom,
  currentWordCount,
  fitActiveWidth,
  resetActiveZoom,
  toggleFocusBranch,
} from '../actions';

export function StatusBar(): JSX.Element {
  const activeTab = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTab);
  const counts = useMemo(() => currentWordCount(), [runtime?.seq]);
  const zoom = useShell((state) => {
    const path = state.activeTab;
    return path === null ? 1 : state.viewByDoc[path]?.zoom ?? 1;
  });
  const focusActive = useShell((state) => {
    const path = state.activeTab;
    return path !== null && (state.viewByDoc[path]?.focusBlockId ?? null) !== null;
  });

  if (runtime === null) {
    return (
      <footer className="nf-statusbar">
        <span className="nf-status-item nf-status-muted">No document open</span>
        <span className="nf-status-spacer" />
        <span className="nf-status-item nf-status-muted">Dark</span>
      </footer>
    );
  }

  const state = runtime.status === 'read-only' ? 'read-only' : runtime.saveState;
  const label =
    state === 'saved'
      ? 'Saved'
      : state === 'saving'
        ? 'Saving…'
        : state === 'unsaved'
          ? 'Unsaved changes'
          : state === 'error'
            ? 'Save failed'
            : 'Read-only';
  const title = runtime.saveError ?? label;
  const pathParts = runtime.packagePath.split('/');
  const shortPath = pathParts.slice(-2).join('/');

  return (
    <footer className="nf-statusbar">
      <span className={`nf-status-item nf-status-${state}`} title={title}>
        <span className="nf-status-dot" aria-hidden="true" />
        {label}
      </span>
      <span className="nf-status-item nf-status-secondary">
        {counts.words} {counts.words === 1 ? 'word' : 'words'}
      </span>
      <span className="nf-status-item nf-status-secondary">
        {counts.blocks} {counts.blocks === 1 ? 'block' : 'blocks'}
      </span>
      <span className="nf-status-spacer" />
      <div className="nf-status-view" role="group" aria-label="View controls">
        <button
          type="button"
          className="nf-status-button nf-status-glyph"
          aria-label="Zoom out"
          title="Zoom out (⌘−)"
          onClick={() => adjustActiveZoom(-0.1)}
        >
          −
        </button>
        <button
          type="button"
          className="nf-status-button nf-status-zoom"
          aria-label={`Current zoom ${Math.round(zoom * 100)} percent. Reset zoom`}
          title="Reset zoom (⌘0)"
          onClick={resetActiveZoom}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="nf-status-button nf-status-glyph"
          aria-label="Zoom in"
          title="Zoom in (⌘+)"
          onClick={() => adjustActiveZoom(0.1)}
        >
          +
        </button>
        <button
          type="button"
          className="nf-status-button"
          title="Fit width (⇧⌘0)"
          onClick={fitActiveWidth}
        >
          Fit
        </button>
        <button
          type="button"
          className="nf-status-button nf-status-focus"
          aria-pressed={focusActive}
          title="Focus branch (⇧⌘F)"
          onClick={toggleFocusBranch}
        >
          Focus
        </button>
      </div>
      <button
        type="button"
        className="nf-status-item nf-status-path"
        title={runtime.packagePath}
        onClick={() => void window.noteforest.revealDocument(runtime.packagePath)}
      >
        {shortPath}
      </button>
      <span className="nf-status-item nf-status-muted">Dark</span>
    </footer>
  );
}
