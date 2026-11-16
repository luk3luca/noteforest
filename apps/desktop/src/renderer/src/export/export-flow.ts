/**
 * Batch A Export sheet flow.
 *
 * One flow shared by File → Export PDF…, the command palette, the Page header,
 * and Settings:
 *
 *   configure (folder picker + filename + in-sheet overwrite) -> running ->
 *   done / failed / cancelled
 *
 * There is no native save dialog: the folder picker is the only native surface.
 * The job pipeline is unchanged (M4c2): the renderer answers the main-process
 * snapshot request, the hidden print window measures and prints the Page
 * layout, and the write stays atomic. The sheet never re-paginates.
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import type { PageSetup } from '@noteforest/layout';
import type {
  ExportJobErrorView,
  ExportJobPhase,
  ExportJobView,
  ExportPdfStartResult,
  ExportWarning,
} from '../../../shared/export';
import {
  exportFileName,
  joinExportPath,
  pdfBaseNameForTitle,
  pdfFileNameForTitle,
} from '../../../shared/export';
import { getRuntime } from '../state/registry';
import { useShell, type DocumentLayout } from '../state/shell';
import { useSettingsStore } from '../state/settings';
import { commitPageEdit } from '../page/page-edit-state';
import { printPageModelSnapshot } from '../page/print-model-registry';

/** Visible export surface state; never persisted. */
export type ExportUiStatus =
  | 'idle'
  | 'configure'
  | 'confirm-overwrite'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface ExportUiState {
  status: ExportUiStatus;
  /**
   * Document captured when the sheet opened. Every later step (Page Edit
   * commit, preflight, job start) uses this path; a tab switch behind the sheet
   * can never retarget the export.
   */
  packagePath: string | null;
  jobId: string | null;
  outputPath: string | null;
  documentTitle: string | null;
  /** Folder chosen for this sheet; the native picker updates it. */
  folder: string | null;
  /** Filename without the fixed `.pdf` suffix. */
  baseName: string;
  /** Layout at the time the sheet opened; the PDF is always the Page layout. */
  layout: DocumentLayout | null;
  pageSetup: PageSetup | null;
  density: number | null;
  /** True only when this flow started the job with `overwrite: true`. */
  overwrite: boolean;
  /** 0..1 progress mirrored from the job. */
  progress: number;
  phase: ExportJobPhase | null;
  pageCount: number | null;
  pageWidthMm: number | null;
  pageHeightMm: number | null;
  cancelling: boolean;
  /** Esc/close while running asks before cancelling; no native dialog. */
  cancelPrompt: boolean;
  error: ExportJobErrorView | null;
  warnings: ExportWarning[];
}

const IDLE: ExportUiState = {
  status: 'idle',
  packagePath: null,
  jobId: null,
  outputPath: null,
  documentTitle: null,
  folder: null,
  baseName: '',
  layout: null,
  pageSetup: null,
  density: null,
  overwrite: false,
  progress: 0,
  phase: null,
  pageCount: null,
  pageWidthMm: null,
  pageHeightMm: null,
  cancelling: false,
  cancelPrompt: false,
  error: null,
  warnings: [],
};

export const useExportUi = create<ExportUiState>(() => ({ ...IDLE }));

/** Test-only trace of the visible flow, asserted by the UI suites. */
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
  update({ status: 'failed', error, warnings, cancelling: false, cancelPrompt: false, progress: 1 });
  record();
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** The single running export, or null; at most one flow may own the surface. */
let activeRun = 0;
let opening = false;
let starting = false;
let choosingFolder = false;

function flowBusy(): boolean {
  if (opening || starting) return true;
  const status = useExportUi.getState().status;
  return status === 'running' || status === 'confirm-overwrite';
}

function recomputeDestination(): void {
  const state = useExportUi.getState();
  if (state.folder === null) return;
  update({
    outputPath: joinExportPath(state.folder, exportFileName(state.baseName)),
  });
}

/** The element that opened the current sheet, for explicit focus restore. */
let pendingReturnFocus: HTMLElement | null = null;

/** Open the shared export sheet for the active document. */
export function exportActiveDocument(trigger?: HTMLElement | null): void {
  void openExportSheet(trigger ?? null);
}

/** Consumed by the sheet on mount; cleared when the sheet unmounts. */
export function peekExportReturnFocus(): HTMLElement | null {
  return pendingReturnFocus;
}

export function clearExportReturnFocus(): void {
  pendingReturnFocus = null;
}

export function setExportFolder(folder: string): void {
  update({ folder });
  recomputeDestination();
}

export function setExportBaseName(baseName: string): void {
  update({ baseName });
  recomputeDestination();
}

async function openExportSheet(trigger: HTMLElement | null): Promise<void> {
  if (flowBusy()) {
    // Focus the existing modal sheet; never start a second job.
    return;
  }
  const current = useExportUi.getState();
  if (current.status !== 'idle' && current.status !== 'done' && current.status !== 'failed' && current.status !== 'cancelled') {
    return;
  }
  pendingReturnFocus = trigger;
  const shell = useShell.getState();
  const runtime = getRuntime(shell.activeTab);
  if (runtime === null) {
    toast.error('Open a note before exporting a PDF.');
    return;
  }
  opening = true;
  try {
    // A draft materializes before the export sheet pins its document path: the
    // PDF job and its "document not open" guard need a real package.
    const prepared = await runtime.ensureMaterialized();
    if (!prepared.ok) {
      toast.error(prepared.message);
      return;
    }
    if (!(await commitPageEdit(runtime.packagePath))) {
      fail({
        code: 'snapshot-failed',
        message: 'Page Edit wasn’t saved before the export.',
        details: [],
      });
      return;
    }
    const settings = useSettingsStore
      .getState()
      .resolvedPageSettings(runtime.packagePath, runtime.document.id);
    const view = shell.viewByDoc[runtime.packagePath];
    const layout = view?.layout ?? 'continuous';
    const model = printPageModelSnapshot(runtime.packagePath);
    let folder = '';
    try {
      folder = (await window.noteforest.getExportDefaults()).folder;
    } catch {
      folder = '';
    }
    const baseName = pdfBaseNameForTitle(runtime.title);
    update({
      ...IDLE,
      status: 'configure',
      packagePath: runtime.packagePath,
      documentTitle: runtime.title,
      folder,
      baseName,
      layout,
      pageSetup: settings.setup,
      density: settings.theme.density,
      pageCount: model?.pages.length ?? null,
      outputPath:
        folder.length === 0
          ? null
          : joinExportPath(folder, pdfFileNameForTitle(runtime.title)),
    });
    record();
  } finally {
    opening = false;
  }
}

/** Native folder picker; directories only. Never a save dialog. */
export async function chooseExportFolder(): Promise<void> {
  if (choosingFolder) return;
  choosingFolder = true;
  try {
    const state = useExportUi.getState();
    let choice;
    try {
      choice = await window.noteforest.chooseExportFolder({
        defaultPath: state.folder,
      });
    } catch (error) {
      update({
        error: {
          code: 'internal-error',
          message:
            error instanceof Error ? error.message : 'Could not choose an export folder.',
          details: [],
        },
        status: 'failed',
      });
      record();
      return;
    }
    if (choice.canceled) return;
    setExportFolder(choice.folderPath);
  } finally {
    choosingFolder = false;
  }
}

/** Run preflight/existence, then either ask once in-sheet or start the job. */
export async function startExport(): Promise<void> {
  const state = useExportUi.getState();
  if (starting || state.status !== 'configure' || flowBusy()) return;
  starting = true;
  try {
    const folder = state.folder;
    if (folder === null || folder.trim().length === 0) {
      update({
        error: {
          code: 'invalid-input',
          message: 'Choose an export folder first.',
          details: [],
        },
        status: 'failed',
      });
      record();
      return;
    }
    // A Page Edit may have opened after the sheet (or a previous commit may
    // have failed). Commit it now for the pinned document: a failure blocks the
    // job and keeps the overlay's text.
    const packagePath = state.packagePath;
    const runtime = getRuntime(packagePath);
    if (packagePath === null || runtime === null) {
      fail({
        code: 'document-not-open',
        message:
          'The document this export was started for is no longer open. Reopen it and export again; no file was written.',
        details: [],
      });
      return;
    }
    if (!(await commitPageEdit(packagePath))) {
      fail({
        code: 'snapshot-failed',
        message: 'Page Edit wasn’t saved before the export.',
        details: [],
      });
      return;
    }
    const outputPath = joinExportPath(folder, exportFileName(state.baseName));
    let exists = false;
    try {
      exists = (await window.noteforest.exportPathExists(outputPath)).exists;
    } catch {
      exists = false;
    }
    if (exists) {
      update({ ...state, status: 'confirm-overwrite', outputPath });
      record();
      return;
    }
    await runExport(outputPath, false);
  } finally {
    starting = false;
  }
}

/** Replace the existing PDF after the one in-sheet confirmation. */
export function confirmReplaceExport(): void {
  const state = useExportUi.getState();
  if (state.status !== 'confirm-overwrite' || state.outputPath === null) return;
  const outputPath = state.outputPath;
  void runExport(outputPath, true);
}

/** Back to Configure with the path intact; the existing file is untouched. */
export function cancelReplaceExport(): void {
  const state = useExportUi.getState();
  if (state.status !== 'confirm-overwrite') return;
  update({ ...state, status: 'configure', overwrite: false });
  record();
}

async function runExport(outputPath: string, overwrite: boolean): Promise<void> {
  const current = useExportUi.getState();
  const runtime = getRuntime(current.packagePath);
  if (current.packagePath === null || runtime === null) {
    fail({
      code: 'document-not-open',
      message:
        'The document this export was started for is no longer open. Reopen it and export again; no file was written.',
      details: [],
    });
    return;
  }
  const run = ++activeRun;
  update({
    ...current,
    status: 'running',
    outputPath,
    overwrite,
    jobId: null,
    phase: 'queued',
    progress: 0,
    pageCount: null,
    pageWidthMm: null,
    pageHeightMm: null,
    cancelling: false,
    cancelPrompt: false,
    error: null,
    warnings: [],
  });
  record();
  let started: ExportPdfStartResult;
  try {
    started = await window.noteforest.exportPdf({
      packagePath: runtime.packagePath,
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
        cancelPrompt: false,
        error: null,
      });
      record();
      return;
    }
    if (job.status === 'cancelled') {
      update({
        ...useExportUi.getState(),
        status: 'cancelled',
        phase: 'cancelled',
        jobId: null,
        progress: 0,
        cancelling: false,
        cancelPrompt: false,
        error: null,
      });
      record();
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
  update({ cancelling: true, cancelPrompt: false });
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

/** Esc/close while running asks first; no native dialog. */
export function requestCancelExport(): void {
  if (useExportUi.getState().status !== 'running') return;
  update({ cancelPrompt: true });
}

export function dismissCancelPrompt(): void {
  update({ cancelPrompt: false });
}

/** Hide a terminal sheet. A running export is never hidden. */
export function dismissExportStatus(): void {
  const state = useExportUi.getState();
  if (state.status === 'running' || state.status === 'confirm-overwrite') return;
  setIdle();
}

/** Failed/Cancelled → Configure with the same folder and name. */
export function retryExport(): void {
  const state = useExportUi.getState();
  if (state.status !== 'failed' && state.status !== 'cancelled') return;
  update({
    ...state,
    status: 'configure',
    jobId: null,
    progress: 0,
    phase: null,
    cancelling: false,
    cancelPrompt: false,
    error: null,
    warnings: [],
  });
  record();
}

/** Reveal the produced PDF in Finder; only for a finished export. */
export async function revealExportedPdf(): Promise<void> {
  const state = useExportUi.getState();
  if (state.outputPath === null) return;
  const result = await window.noteforest.revealExport(state.outputPath);
  if (!result.ok) toast.error(result.message ?? 'Couldn’t reveal the PDF.');
}

/** Open the produced PDF in the default OS application. */
export async function openExportedPdf(): Promise<void> {
  const state = useExportUi.getState();
  if (state.outputPath === null) return;
  const result = await window.noteforest.openExport(state.outputPath);
  if (!result.ok) toast.error(result.message ?? 'Couldn’t open the PDF.');
}
