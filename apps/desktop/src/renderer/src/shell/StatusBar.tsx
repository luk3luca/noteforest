import { useMemo } from 'react';
import { resolveDocumentAnchors } from '@noteforest/core';
import { TriangleAlert } from 'lucide-react';
import { useRuntime } from '../state/registry';
import { useShell } from '../state/shell';
import {
  adjustActiveZoom,
  currentWordCount,
  fitActiveWidth,
  resetActiveZoom,
  revealDocumentPath,
  toggleFocusBranch,
} from '../actions';

export function StatusBar(): JSX.Element {
  const activeTab = useShell((state) => state.activeTab);
  const activeTabInfo = useShell((state) =>
    state.tabs.find((tab) => tab.packagePath === state.activeTab),
  );
  const { runtime } = useRuntime(activeTab);
  const counts = useMemo(() => currentWordCount(), [runtime?.seq]);
  const anchorHealth = useMemo(() => {
    if (runtime === null) return { broken: 0, ambiguous: 0, total: 0 };
    const resolved = resolveDocumentAnchors(runtime.document).counts;
    return {
      broken: resolved.broken,
      ambiguous: resolved.ambiguous,
      total: resolved.broken + resolved.ambiguous,
    };
  }, [runtime, runtime?.document]);
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
        <span
          className="nf-status-item nf-status-muted"
          data-recovery-status={activeTabInfo?.recovery?.status}
        >
          {activeTabInfo?.recovery === undefined
            ? 'No document open'
            : `Recovery · ${activeTabInfo.recovery.status}`}
        </span>
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
      <span
        className={`nf-status-item nf-status-${state}`}
        title={title}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-save-state={state}
        data-save-failure-code={runtime.saveFailure?.code ?? undefined}
      >
        <span className="nf-status-dot" aria-hidden="true" />
        {label}
        {state === 'error' && runtime.saveError !== null ? (
          <span className="nf-sr-only">: {runtime.saveError}</span>
        ) : null}
      </span>
      <span className="nf-status-item nf-status-secondary">
        {counts.words} {counts.words === 1 ? 'word' : 'words'}
      </span>
      <span className="nf-status-item nf-status-secondary">
        {counts.blocks} {counts.blocks === 1 ? 'block' : 'blocks'}
      </span>
      {anchorHealth.total > 0 ? (
        <button
          type="button"
          className="nf-status-item nf-status-health"
          data-anchor-health-chip="true"
          data-health-broken={anchorHealth.broken}
          data-health-ambiguous={anchorHealth.ambiguous}
          aria-label={`${anchorHealth.total} ${
            anchorHealth.total === 1 ? 'anchor needs' : 'anchors need'
          } repair: ${anchorHealth.broken} broken, ${anchorHealth.ambiguous} ambiguous`}
          title={`${anchorHealth.broken} broken · ${anchorHealth.ambiguous} ambiguous`}
          onClick={() => useShell.getState().openDialog({ kind: 'anchor-health' })}
        >
          <TriangleAlert size={11} strokeWidth={1.5} aria-hidden="true" />
          {anchorHealth.total} {anchorHealth.total === 1 ? 'anchor needs' : 'anchors need'} repair
        </button>
      ) : null}
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
        onClick={() => void revealDocumentPath(runtime.packagePath)}
      >
        {shortPath}
      </button>
      <span className="nf-status-item nf-status-muted">Dark</span>
    </footer>
  );
}
