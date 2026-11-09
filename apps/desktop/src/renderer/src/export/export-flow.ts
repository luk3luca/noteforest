/**
 * M4d2 temporary export UI flow.
 *
 * One flow shared by File → Export PDF…, the command palette, and the Page
 * toolbar button:
 *
 *   choose path -> (explicit replace?) -> start job -> poll -> done/failed
 *
 * The engine (M4c2) already owns the hidden-window model, `printToPDF`,
 * atomicity, and cancellation. This module only surfaces that job: the save
 * dialog chooses a path, and the panel/status store mirrors `getExportJob`.
 * It works from Continuous and Page because the job asks the renderer for a
 * snapshot; the Page view does not need to be mounted.
 *
 * The UI is deliberately temporary (product owner, 9 November 2026): the later
 * UI rework decides the final button shape, position, and settings surface.
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import type {
  ChooseExportPathResult,
  ExportJobErrorView,
  ExportJobPhase,
  ExportJobView,
  ExportPdfStartResult,
  ExportWarning,
} from '../../../shared/export';
import { pdfFileNameForTitle } from '../../../shared/export';
import { getRuntime } from '../state/registry';
import { useShell } from '../state/shell';

/** Visible export surface state; never persisted. */
export type ExportUiStatus = 'idle' | 'running' | 'confirm-overwrite' | 'done' | 'failed';

export interface ExportUiState {
  status: ExportUiStatus;
  jobId: string | null;
  outputPath: string | null;
  documentTitle: string | null;
  /** True only when this flow started the job with `overwrite: true`. */
  overwrite: boolean;
  /** 0..1 progress mirrored from the job. */
  progress: number;
  phase: ExportJobPhase | null;
  pageCount: number | null;
  pageWidthMm: number | null;
  pageHeightMm: number | null;
  cancelling: boolean;
  error: ExportJobErrorView | null;
  warnings: ExportWarning[];
}

const IDLE: ExportUiState = {
  status: 'idle',
  jobId: null,
  outputPath: null,
  documentTitle: null,
  overwrite: false,
  progress: 0,
  phase: null,
  pageCount: null,
  pageWidthMm: null,
  pageHeightMm: null,
  cancelling: false,
  error: null,
  warnings: [],
};

export const useExportUi = create<ExportUiState>(() => ({ ...IDLE }));

/** Test-only trace of the visible flow, asserted by tests/ui/m4d2-export-ui. */
export interface ExportFlowStep {
  status: ExportUiStatus;
  phase: ExportJobPhase | null;
  progress: number;
  at: number;
}

const flowHistory: ExportFlowStep[] = [];
const MAX_HISTORY = 200;

export function exportFlowHistory(): ExportFlowStep[] {
  return flowHistory.map((step) => ({ ...step }));
}

function update(patch: Partial<ExportUiState>): void {
  useExportUi.setState(patch);
}

function record(): void {
  const state = useExportUi.getState();
  const last = flowHistory.at(-1);
  if (
    last !== undefined &&
    last.status === state.status &&
    last.phase === state.phase &&
    last.progress === state.progress
  ) {
    return;
  }
  flowHistory.push({
    status: state.status,
    phase: state.phase,
    progress: state.progress,
    at: Date.now(),
  });
  if (flowHistory.length > MAX_HISTORY) flowHistory.splice(0, flowHistory.length - MAX_HISTORY);
}

function setIdle(): void {
  update({ ...IDLE });
  record();
}

function fail(error: ExportJobErrorView, warnings: ExportWarning[] = []): void {
  update({ status: 'failed', error, warnings, cancelling: false, progress: 1 });
  record();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** The single running export, or null; at most one flow may own the surface. */
let activeRun = 0;
let choosingPath = false;
let pendingReplace: { packagePath: string; outputPath: string; title: string } | null = null;

function flowBusy(): boolean {
  if (choosingPath) return true;
  const status = useExportUi.getState().status;
  return status === 'running' || status === 'confirm-overwrite';
}

/**
 * Start the shared export flow for the active document.
 *
 * A missing document is reported without opening a save dialog. A read-only
 * document may still export: the export never mutates the package.
 */
export function exportActiveDocument(): void {
  void startExport();
}

async function startExport(): Promise<void> {
  if (flowBusy()) {
    toast.info('A PDF export is already in progress.');
    return;
  }
  const shell = useShell.getState();
  const runtime = getRuntime(shell.activeTab);
  if (runtime === null) {
    toast.error('Open a document before exporting a PDF.');
    return;
  }
  const title = runtime.title;
  choosingPath = true;
  let choice: ChooseExportPathResult;
  try {
    choice = await window.noteforest.chooseExportPath({
      defaultFileName: pdfFileNameForTitle(title),
    });
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : 'Could not open the save dialog for the PDF export.',
    );
    return;
  } finally {
    choosingPath = false;
  }
  if (choice.canceled) {
    // A cancelled save dialog is not an error and leaves no job or file.
    setIdle();
    return;
  }
  if (choice.exists) {
    // Explicit replacement only: the engine also refuses to clobber for
    // `overwrite: false`, so this prompt can never be skipped silently.
    pendingReplace = {
      packagePath: runtime.packagePath,
      outputPath: choice.outputPath,
      title,
    };
    update({
      ...IDLE,
      status: 'confirm-overwrite',
      outputPath: choice.outputPath,
      documentTitle: title,
    });
    record();
    return;
  }
  await runExport(runtime.packagePath, choice.outputPath, false, title);
}

/** Replace the existing PDF after the explicit confirmation. */
export function confirmReplaceExport(): void {
  const pending = pendingReplace;
  pendingReplace = null;
  if (pending === null) return;
  void runExport(pending.packagePath, pending.outputPath, true, pending.title);
}

/** Cancel the replacement prompt: the existing file is untouched. */
export function cancelReplaceExport(): void {
  pendingReplace = null;
  setIdle();
  toast.info('Export cancelled.');
}

async function runExport(
  packagePath: string,
  outputPath: string,
  overwrite: boolean,
  documentTitle: string,
): Promise<void> {
  const run = ++activeRun;
  update({
    ...IDLE,
    status: 'running',
    outputPath,
    documentTitle,
    overwrite,
    phase: 'queued',
  });
  record();
  let started: ExportPdfStartResult;
  try {
    started = await window.noteforest.exportPdf({
      packagePath,
      outputPath,
      ...(overwrite ? { overwrite: true } : {}),
    });
  } catch (error) {
    if (run !== activeRun) return;
    fail({
      code: 'internal-error',
      message: error instanceof Error ? error.message : String(error),
      details: [],
    });
    return;
  }
  if (run !== activeRun) return;
  if (!started.ok) {
    fail({ code: started.code, message: started.message, details: [] });
    return;
  }
  update({ jobId: started.jobId });
  await pollExport(started.jobId, run);
}

async function pollExport(jobId: string, run: number): Promise<void> {
  for (;;) {
    if (run !== activeRun) return;
    let job: ExportJobView | null;
    try {
      job = await window.noteforest.getExportJob(jobId);
    } catch (error) {
      if (run !== activeRun) return;
      fail({
        code: 'internal-error',
        message: error instanceof Error ? error.message : String(error),
        details: [],
      });
      return;
    }
    if (run !== activeRun) return;
    if (job === null) {
      fail({
        code: 'internal-error',
        message: 'The export job is no longer available.',
        details: [],
      });
      return;
    }
    if (job.status === 'running') {
      update({
        progress: job.progress,
        phase: job.phase,
        pageCount: job.pageCount,
        pageWidthMm: job.pageWidthMm,
        pageHeightMm: job.pageHeightMm,
        warnings: job.warnings,
        cancelling: useExportUi.getState().cancelling,
      });
      record();
      await wait(120);
      continue;
    }
    if (job.status === 'done') {
      update({
        status: 'done',
        progress: 1,
        phase: 'done',
        pageCount: job.pageCount,
        pageWidthMm: job.pageWidthMm,
        pageHeightMm: job.pageHeightMm,
        warnings: job.warnings,
        cancelling: false,
        error: null,
      });
      record();
      return;
    }
    if (job.status === 'cancelled') {
      setIdle();
      toast.info('Export cancelled.');
      return;
    }
    fail(
      job.error ?? {
        code: 'internal-error',
        message: 'The PDF export failed.',
        details: [],
      },
      job.warnings,
    );
    return;
  }
}

/** Stop the running job; the poll loop reports the terminal cancelled state. */
export async function cancelActiveExport(): Promise<void> {
  const state = useExportUi.getState();
  if (state.status !== 'running' || state.jobId === null || state.cancelling) return;
  update({ cancelling: true });
  record();
  try {
    await window.noteforest.cancelExport(state.jobId);
  } catch {
    // The poll observes the terminal state even when the cancel IPC races the
    // job finishing; it must not turn a completed export into a failure.
    update({ cancelling: false });
    record();
  }
}

/** Hide a terminal success/failure surface. Never hides a running export. */
export function dismissExportStatus(): void {
  const state = useExportUi.getState();
  if (state.status === 'running' || state.status === 'confirm-overwrite') return;
  setIdle();
}

/** Reveal the produced PDF in Finder; only for a finished export. */
export async function revealExportedPdf(): Promise<void> {
  const state = useExportUi.getState();
  if (state.outputPath === null) return;
  const result = await window.noteforest.revealExport(state.outputPath);
  if (!result.ok) toast.error(result.message ?? 'Could not reveal the PDF.');
}
