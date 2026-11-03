import { useMemo } from 'react';
import { useRuntime } from '../state/registry';
import { useShell } from '../state/shell';
import { currentWordCount } from '../actions';

export function StatusBar(): JSX.Element {
  const activeTab = useShell((state) => state.activeTab);
  const { runtime } = useRuntime(activeTab);
  const counts = useMemo(() => currentWordCount(), [runtime?.seq]);

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
