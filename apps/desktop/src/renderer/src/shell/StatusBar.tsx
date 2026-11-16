import { useMemo } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useRuntime } from '../state/registry';
import { useShell } from '../state/shell';
import { currentWordCount, openDocumentHealth } from '../actions';
import { useMarkdownEntry } from '../state/markdown';
import { isMarkdownPath } from '../../../shared/markdown';
import { useDocumentHealthReport } from './useDocumentHealth';

/**
 * Minimal status strip (V0): status only, no second toolbar.
 *
 * Save state, word/block counts, and Document health live here. Layout, mode,
 * zoom, focus, path, and theme are not repeated: view controls live in the
 * Toolbar, focus is `⇧⌘F`/palette, Reveal in Finder is the tab menu/Settings.
 */
export function StatusBar(): JSX.Element {
  const activeTab = useShell((state) => state.activeTab);
  const activeTabInfo = useShell((state) =>
    state.tabs.find((tab) => tab.packagePath === state.activeTab),
  );
  const { runtime } = useRuntime(activeTab);
  const markdown = useMarkdownEntry(
    activeTab !== null && isMarkdownPath(activeTab) ? activeTab : null,
  );
  const counts = useMemo(() => currentWordCount(), [runtime?.seq]);
  // One audit feeds both indicators. `runtime.version` advances on collapse and
  // content notifications; the collapsed set itself is view state and is read
  // through that notification (it is mutated in place).
  const health = useDocumentHealthReport(runtime);
  const anchorHealth = {
    broken: health?.counts.broken ?? 0,
    ambiguous: health?.counts.ambiguous ?? 0,
    total: (health?.counts.broken ?? 0) + (health?.counts.ambiguous ?? 0),
  };
  const info = health?.info ?? { idle: 0, orphans: 0, structure: 0, hidden: 0 };
  const infoParts: string[] = [];
  if (info.idle > 0) infoParts.push(`${info.idle} unused`);
  if (info.orphans > 0) {
    infoParts.push(`${info.orphans} ${info.orphans === 1 ? 'orphan' : 'orphans'}`);
  }
  if (info.structure > 0) infoParts.push(`${info.structure} structure`);
  const infoLabel = infoParts.join(' · ');
  const infoTotal = info.idle + info.orphans + info.structure;

  if (markdown !== null) {
    const state = markdown.missing
      ? 'error'
      : markdown.readOnly
        ? 'read-only'
        : markdown.saving
          ? 'saving'
          : markdown.saveError !== null
            ? 'error'
            : markdown.conflict
              ? 'unsaved'
              : markdown.dirty
                ? 'unsaved'
                : 'saved';
    const label = markdown.missing
      ? 'File missing'
      : markdown.readOnly
        ? 'Read-only'
        : markdown.saving
          ? 'Saving…'
          : markdown.saveError !== null
            ? 'Save failed'
            : markdown.conflict
              ? 'External change'
              : markdown.dirty
                ? 'Unsaved changes'
                : 'Saved';
    const detail = markdown.missing
      ? 'Nothing is written; the file is not recreated'
      : markdown.readOnly
        ? 'Large file · not written'
        : markdown.saving
          ? 'Saving…'
          : markdown.saveError !== null
            ? markdown.saveError
            : markdown.conflict
              ? 'Save paused · the file changed on disk'
              : markdown.dirty
                ? 'Not saved to disk yet'
                : 'Saved to disk';
    return (
      <footer className="nf-statusbar" data-markdown-status="true">
        <span
          className={`nf-status-item nf-status-${state}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-save-state={state}
          title={detail}
        >
          <span className="nf-status-dot" aria-hidden="true" />
          {label}
        </span>
        <span className="nf-status-item nf-status-secondary">Markdown file</span>
        <span className="nf-status-spacer" />
        <span className="nf-status-item nf-status-secondary" data-markdown-save-detail="true">
          {detail}
        </span>
      </footer>
    );
  }

  if (runtime === null) {
    return (
      <footer className="nf-statusbar">
        <span
          className="nf-status-item nf-status-muted"
          data-recovery-status={activeTabInfo?.recovery?.status}
        >
          {activeTabInfo?.recovery === undefined
            ? 'No note open'
            : `Recovery · ${activeTabInfo.recovery.status}`}
        </span>
        <span className="nf-status-spacer" />
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
      <span className="nf-status-spacer" />
      {infoTotal > 0 ? (
        <button
          type="button"
          className="nf-status-item nf-status-health-info"
          data-health-info-chip="true"
          data-health-idle={info.idle}
          data-health-orphans={info.orphans}
          data-health-structure={info.structure}
          aria-label={`Document health: ${infoLabel}. Open the health section.`}
          title={`${infoLabel} · open document health`}
          onClick={() => openDocumentHealth()}
        >
          {infoLabel}
        </button>
      ) : null}
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
          onClick={() => openDocumentHealth({ openFirstRepair: true })}
        >
          <TriangleAlert size={11} strokeWidth={1.5} aria-hidden="true" />
          {anchorHealth.total} {anchorHealth.total === 1 ? 'anchor needs' : 'anchors need'} repair
        </button>
      ) : null}
    </footer>
  );
}
