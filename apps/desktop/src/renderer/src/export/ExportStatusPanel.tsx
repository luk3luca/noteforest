/**
 * M4d2 temporary export status panel.
 *
 * One small, non-modal surface for path choice results: progress + cancel while
 * running, explicit replacement, success path + Reveal in Finder, and typed
 * failures with preflight block names. The final UI rework will replace it.
 */

import {
  cancelActiveExport,
  cancelReplaceExport,
  confirmReplaceExport,
  dismissExportStatus,
  revealExportedPdf,
  useExportUi,
} from './export-flow';

const PHASE_LABELS: Record<string, string> = {
  queued: 'Preparing…',
  snapshot: 'Reading the document…',
  model: 'Building pages…',
  print: 'Printing…',
  validate: 'Checking the PDF…',
  write: 'Writing the file…',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function phaseLabel(phase: string | null): string {
  if (phase === null) return 'Preparing…';
  return PHASE_LABELS[phase] ?? phase;
}

function percent(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

export function ExportStatusPanel(): JSX.Element | null {
  const status = useExportUi((state) => state.status);
  const phase = useExportUi((state) => state.phase);
  const progress = useExportUi((state) => state.progress);
  const outputPath = useExportUi((state) => state.outputPath);
  const pageCount = useExportUi((state) => state.pageCount);
  const cancelling = useExportUi((state) => state.cancelling);
  const error = useExportUi((state) => state.error);
  const warnings = useExportUi((state) => state.warnings);

  if (status === 'idle') return null;
  const value = percent(progress);

  if (status === 'confirm-overwrite') {
    return (
      <section
        className="nf-export-panel"
        role="alertdialog"
        aria-label="Replace existing PDF"
        data-export-status="confirm-overwrite"
      >
        <div className="nf-export-head">
          <span className="nf-export-title">Replace existing PDF?</span>
        </div>
        <p className="nf-export-copy">
          A file already exists at this path. Replacing it cannot be undone.
        </p>
        <span className="nf-export-path">{outputPath}</span>
        <div className="nf-export-actions">
          <button
            type="button"
            className="nf-button nf-button-quiet"
            data-export-cancel-confirm="true"
            onClick={cancelReplaceExport}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nf-button nf-button-primary"
            data-export-replace="true"
            onClick={confirmReplaceExport}
          >
            Replace PDF
          </button>
        </div>
      </section>
    );
  }

  if (status === 'running') {
    return (
      <section
        className="nf-export-panel"
        role="status"
        aria-live="polite"
        data-export-status="running"
        data-export-progress={value}
        data-export-phase={phase ?? ''}
      >
        <div className="nf-export-head">
          <span className="nf-export-title">Exporting PDF…</span>
          <span className="nf-export-percent" data-export-percent="true">
            {value}%
          </span>
        </div>
        <span className="nf-export-copy" data-export-phase-label="true">
          {phaseLabel(phase)}
        </span>
        <div
          className="nf-export-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
        >
          <span style={{ width: `${value}%` }} />
        </div>
        <span className="nf-export-path">{outputPath}</span>
        <div className="nf-export-actions">
          <button
            type="button"
            className="nf-button nf-button-quiet"
            data-export-cancel="true"
            disabled={cancelling}
            onClick={() => void cancelActiveExport()}
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
      </section>
    );
  }

  if (status === 'done') {
    return (
      <section
        className="nf-export-panel nf-export-panel-done"
        role="status"
        aria-live="polite"
        data-export-status="done"
        data-export-progress={100}
      >
        <div className="nf-export-head">
          <span className="nf-export-title">PDF exported</span>
          {pageCount === null ? null : (
            <span className="nf-export-percent">
              {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            </span>
          )}
        </div>
        <span className="nf-export-path" data-export-output-path="true">
          {outputPath}
        </span>
        {warnings.length === 0 ? null : (
          <ul className="nf-export-details" data-export-warnings="true">
            {warnings.slice(0, 6).map((warning, index) => (
              <li key={`${warning.code}-${index}`}>{warning.message}</li>
            ))}
          </ul>
        )}
        <div className="nf-export-actions">
          <button
            type="button"
            className="nf-button nf-button-quiet"
            data-export-dismiss="true"
            onClick={dismissExportStatus}
          >
            Done
          </button>
          <button
            type="button"
            className="nf-button"
            data-export-reveal="true"
            onClick={() => void revealExportedPdf()}
          >
            Reveal in Finder
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="nf-export-panel nf-export-panel-failed"
      role="alert"
      aria-live="assertive"
      data-export-status="failed"
      data-export-code={error?.code ?? 'internal-error'}
    >
      <div className="nf-export-head">
        <span className="nf-export-title">Export failed</span>
        <span className="nf-export-percent">{error?.code ?? 'internal-error'}</span>
      </div>
      <p className="nf-export-copy" data-export-error-message="true">
        {error?.message ?? 'The PDF export failed.'}
      </p>
      {error === null || error.details.length === 0 ? null : (
        <ul className="nf-export-details" data-export-error-details="true">
          {error.details.slice(0, 8).map((detail, index) => (
            <li key={`${detail.code}-${index}`} data-export-detail-kind={detail.kind}>
              {detail.blockTitle === undefined
                ? detail.message
                : `${detail.blockTitle}: ${detail.message}`}
            </li>
          ))}
        </ul>
      )}
      <div className="nf-export-actions">
        <button
          type="button"
          className="nf-button nf-button-quiet"
          data-export-dismiss="true"
          onClick={dismissExportStatus}
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
