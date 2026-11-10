/**
 * Batch A Export sheet: one modal surface for Configure, Overwrite, Progress,
 * Done, Failed, and Cancelled. The folder picker is the only native surface;
 * there is no save dialog. Warnings are never truncated.
 */

import { Dialog, Modal, ModalOverlay } from 'react-aria-components';
import { useMemo, useRef } from 'react';
import type { ExportWarning } from '../../../shared/export';
import { exportFileName, joinExportPath, pdfBaseNameForTitle } from '../../../shared/export';
import {
  cancelActiveExport,
  cancelReplaceExport,
  chooseExportFolder,
  confirmReplaceExport,
  dismissCancelPrompt,
  dismissExportStatus,
  openExportedPdf,
  requestCancelExport,
  retryExport,
  revealExportedPdf,
  setExportAddDate,
  setExportBaseName,
  startExport,
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

const WARNING_GROUPS: Record<ExportWarning['kind'], string> = {
  'blocking-defect': 'Layout defects',
  'page-overflow': 'Page overflow',
  'manual-break': 'Manual breaks',
  anchor: 'Anchors',
  asset: 'Images and assets',
  'layout-warning': 'Layout warnings',
  render: 'Rendering',
  validation: 'Validation',
};

function phaseLabel(phase: string | null): string {
  if (phase === null) return 'Preparing…';
  return PHASE_LABELS[phase] ?? phase;
}

function percent(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

function pageSizeLabel(size: string): string {
  return size === 'Letter' ? 'Letter' : size;
}

function warningLabel(warning: ExportWarning): string {
  if (warning.blockTitle !== undefined) return `${warning.blockTitle}: ${warning.message}`;
  if (warning.pageNumber !== undefined) return `Page ${warning.pageNumber}: ${warning.message}`;
  return warning.message;
}

function WarningList({
  warnings,
  grouped,
}: {
  warnings: readonly ExportWarning[];
  grouped: boolean;
}): JSX.Element | null {
  if (warnings.length === 0) return null;
  if (!grouped) {
    return (
      <ul className="nf-export-warning-list" data-export-warning-details="true">
        {warnings.map((warning, index) => (
          <li key={`${warning.kind}-${warning.code}-${index}`}>{warningLabel(warning)}</li>
        ))}
      </ul>
    );
  }
  const groups = new Map<ExportWarning['kind'], ExportWarning[]>();
  for (const warning of warnings) {
    const list = groups.get(warning.kind) ?? [];
    list.push(warning);
    groups.set(warning.kind, list);
  }
  return (
    <div className="nf-export-warning-groups" data-export-warnings="true">
      {[...groups.entries()].map(([kind, list]) => (
        <details
          key={kind}
          className="nf-export-warning-group"
          data-export-warning-group={kind}
          open
        >
          <summary>
            {WARNING_GROUPS[kind] ?? kind} ({list.length})
          </summary>
          <ul className="nf-export-warning-list">
            {list.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>{warningLabel(warning)}</li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

export function ExportSheet(): JSX.Element | null {
  const status = useExportUi((state) => state.status);
  const folder = useExportUi((state) => state.folder);
  const baseName = useExportUi((state) => state.baseName);
  const addDate = useExportUi((state) => state.addDate);
  const outputPath = useExportUi((state) => state.outputPath);
  const documentTitle = useExportUi((state) => state.documentTitle);
  const layout = useExportUi((state) => state.layout);
  const pageSetup = useExportUi((state) => state.pageSetup);
  const density = useExportUi((state) => state.density);
  const phase = useExportUi((state) => state.phase);
  const progress = useExportUi((state) => state.progress);
  const pageCount = useExportUi((state) => state.pageCount);
  const cancelling = useExportUi((state) => state.cancelling);
  const cancelPrompt = useExportUi((state) => state.cancelPrompt);
  const error = useExportUi((state) => state.error);
  const warnings = useExportUi((state) => state.warnings);
  const overwrite = useExportUi((state) => state.overwrite);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const fileName = useMemo(() => exportFileName(baseName, addDate), [baseName, addDate]);
  const normalizedBase = pdfBaseNameForTitle(baseName);
  const sanitized = normalizedBase !== baseName.trim().replace(/\.pdf$/i, '').trim();
  const destination =
    outputPath ?? (folder === null ? '' : joinExportPath(folder, fileName));
  const value = percent(progress);
  const summary = pageSetup === null
    ? null
    : `${pageSizeLabel(pageSetup.size)} ${
        pageSetup.orientation === 'landscape' ? 'landscape' : 'portrait'
      } · ${pageSetup.margins.top} mm`;
  const densityPercent = density === null ? null : Math.round(density * 100);

  if (status === 'idle') return null;

  const close = (): void => {
    if (status === 'running') {
      requestCancelExport();
      return;
    }
    if (status === 'confirm-overwrite') {
      cancelReplaceExport();
      return;
    }
    dismissExportStatus();
  };

  return (
    <ModalOverlay
      className="nf-overlay nf-export-overlay"
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Modal className="nf-export-modal">
        <Dialog
          className="nf-export-sheet"
          aria-label="Export PDF"
          data-export-sheet="true"
          data-export-status={status}
        >
          <header className="nf-export-head">
            <h2 className="nf-export-title">
              {status === 'running'
                ? 'Exporting PDF…'
                : status === 'done'
                  ? 'PDF exported'
                  : status === 'failed'
                    ? 'Export failed'
                    : status === 'cancelled'
                      ? 'Export cancelled'
                      : status === 'confirm-overwrite'
                        ? 'Replace existing PDF?'
                        : 'Export PDF'}
            </h2>
            <button
              type="button"
              className="nf-icon-button"
              aria-label="Close export sheet"
              data-export-close="true"
              onClick={close}
            >
              ×
            </button>
          </header>

          <div className="nf-export-body">
            {status === 'configure' ? (
              <>
                <section className="nf-export-section">
                  <h3 className="nf-export-section-title">Destination</h3>
                  <div className="nf-export-field">
                    <span className="nf-export-label">Folder</span>
                    <div className="nf-export-folder-row">
                      <code className="nf-export-folder" data-export-folder="true">
                        {folder === null || folder.length === 0 ? 'No folder chosen' : folder}
                      </code>
                      <button
                        type="button"
                        className="nf-button"
                        data-export-choose-folder="true"
                        onClick={() => void chooseExportFolder()}
                      >
                        Choose…
                      </button>
                    </div>
                  </div>
                  <label className="nf-export-field">
                    <span className="nf-export-label">File name</span>
                    <span className="nf-export-filename-row">
                      <input
                        className="nf-input nf-export-filename"
                        value={baseName}
                        placeholder="Untitled"
                        aria-label="File name"
                        data-export-filename="true"
                        onChange={(event) => setExportBaseName(event.target.value)}
                      />
                      <span className="nf-export-suffix" data-export-suffix="true">
                        .pdf
                      </span>
                    </span>
                    {sanitized ? (
                      <span className="nf-export-help" data-export-sanitized="true">
                        Saved as {fileName}
                      </span>
                    ) : null}
                  </label>
                  <label className="nf-export-check">
                    <input
                      type="checkbox"
                      checked={addDate}
                      data-export-add-date="true"
                      onChange={(event) => setExportAddDate(event.target.checked)}
                    />
                    <span>Add date</span>
                    <span className="nf-export-help">— {fileName}</span>
                  </label>
                  <div className="nf-export-destination">
                    <span className="nf-export-label">Destination</span>
                    <code data-export-destination="true">{destination || 'Choose a folder'}</code>
                  </div>
                </section>

                <section className="nf-export-section">
                  <h3 className="nf-export-section-title">What will be exported</h3>
                  <p className="nf-export-summary" data-export-summary="true">
                    {layout === 'continuous'
                      ? 'Page layout will be exported'
                      : `Page layout${documentTitle === null ? '' : ` · ${documentTitle}`}`}
                    {summary === null ? '' : ` · ${summary}`}
                    {densityPercent === null ? '' : ` · ${densityPercent}%`}
                  </p>
                  <p className="nf-export-help">
                    {pageCount === null
                      ? 'Page count is calculated when the export starts · whole document'
                      : `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · whole document`}
                  </p>
                  <p className="nf-export-help" data-export-preflight="true">
                    Preflight runs automatically when you export.
                  </p>
                </section>
              </>
            ) : null}

            {status === 'confirm-overwrite' ? (
              <section className="nf-export-section" data-export-overwrite="true">
                <p className="nf-export-copy">
                  A file already exists at this path. Replacing it cannot be undone.
                </p>
                <code className="nf-export-output" data-export-output-path="true">
                  {outputPath}
                </code>
                <p className="nf-export-help">
                  Cancel returns to Configure with the path intact; the existing file is untouched.
                </p>
              </section>
            ) : null}

            {status === 'running' ? (
              <section className="nf-export-section" data-export-progress={value}>
                <div className="nf-export-progress-head">
                  <span data-export-phase-label="true">{phaseLabel(phase)}</span>
                  <span className="nf-export-percent" data-export-percent="true">
                    {value}%
                  </span>
                </div>
                <div
                  className="nf-export-bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={value}
                  aria-label="Export progress"
                >
                  <span style={{ width: `${value}%` }} />
                </div>
                <code className="nf-export-output" data-export-output-path="true">
                  {outputPath}
                </code>
                {cancelPrompt ? (
                  <div className="nf-export-cancel-prompt" data-export-cancel-prompt="true">
                    <p className="nf-export-copy">Cancel this export? No file will be written.</p>
                    <div className="nf-export-inline-actions">
                      <button
                        type="button"
                        className="nf-button"
                        data-export-keep-exporting="true"
                        onClick={dismissCancelPrompt}
                      >
                        Keep exporting
                      </button>
                      <button
                        type="button"
                        className="nf-button nf-button-danger"
                        data-export-confirm-cancel="true"
                        disabled={cancelling}
                        onClick={() => void cancelActiveExport()}
                      >
                        Cancel export
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {status === 'done' ? (
              <section className="nf-export-section" data-export-done="true">
                <p className="nf-export-copy" data-export-done-pages="true">
                  {pageCount === null
                    ? 'The PDF was written.'
                    : `${pageCount} ${pageCount === 1 ? 'page' : 'pages'} · ${
                        overwrite ? 'replaced' : 'written'
                      }.`}
                </p>
                <code className="nf-export-output" data-export-output-path="true">
                  {outputPath}
                </code>
                <WarningList warnings={warnings} grouped />
              </section>
            ) : null}

            {status === 'failed' ? (
              <section className="nf-export-section" data-export-failed="true">
                <p className="nf-export-copy" data-export-error-message="true">
                  {error?.message ?? 'The PDF export failed.'}
                </p>
                <p className="nf-export-help" data-export-code={error?.code ?? 'internal-error'}>
                  Error: {error?.code ?? 'internal-error'}
                </p>
                <WarningList warnings={error?.details ?? []} grouped={false} />
                <WarningList warnings={warnings} grouped />
              </section>
            ) : null}

            {status === 'cancelled' ? (
              <section className="nf-export-section" data-export-cancelled="true">
                <p className="nf-export-copy">Export cancelled. No file was written.</p>
                <code className="nf-export-output">{outputPath}</code>
              </section>
            ) : null}
          </div>

          <footer className="nf-export-actions">
            {status === 'configure' ? (
              <>
                <button
                  type="button"
                  className="nf-button"
                  data-export-dismiss="true"
                  onClick={dismissExportStatus}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="nf-button nf-button-primary"
                  data-export-start="true"
                  onClick={() => void startExport()}
                >
                  Export
                </button>
              </>
            ) : null}
            {status === 'confirm-overwrite' ? (
              <>
                <button
                  ref={cancelRef}
                  type="button"
                  className="nf-button"
                  data-export-cancel-confirm="true"
                  autoFocus
                  onClick={cancelReplaceExport}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="nf-button nf-button-danger"
                  data-export-replace="true"
                  onClick={confirmReplaceExport}
                >
                  Replace PDF
                </button>
              </>
            ) : null}
            {status === 'running' ? (
              <button
                type="button"
                className="nf-button"
                data-export-cancel="true"
                disabled={cancelling}
                onClick={() => void cancelActiveExport()}
              >
                {cancelling ? 'Cancelling…' : 'Cancel'}
              </button>
            ) : null}
            {status === 'done' ? (
              <>
                <button
                  type="button"
                  className="nf-button"
                  data-export-reveal="true"
                  onClick={() => void revealExportedPdf()}
                >
                  Reveal in Finder
                </button>
                <button
                  type="button"
                  className="nf-button"
                  data-export-open="true"
                  onClick={() => void openExportedPdf()}
                >
                  Open PDF
                </button>
                <button
                  type="button"
                  className="nf-button nf-button-primary"
                  data-export-dismiss="true"
                  onClick={dismissExportStatus}
                >
                  Done
                </button>
              </>
            ) : null}
            {status === 'failed' ? (
              <>
                <button
                  type="button"
                  className="nf-button"
                  data-export-dismiss="true"
                  onClick={dismissExportStatus}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="nf-button nf-button-primary"
                  data-export-retry="true"
                  onClick={retryExport}
                >
                  Retry
                </button>
              </>
            ) : null}
            {status === 'cancelled' ? (
              <>
                <button
                  type="button"
                  className="nf-button"
                  data-export-dismiss="true"
                  onClick={dismissExportStatus}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="nf-button nf-button-primary"
                  data-export-retry="true"
                  onClick={retryExport}
                >
                  Retry
                </button>
              </>
            ) : null}
          </footer>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
