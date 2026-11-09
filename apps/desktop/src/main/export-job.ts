/**
 * M4c2 PDF export job (main process).
 *
 * One typed, cancellable job per export:
 *
 *   queued -> snapshot -> model -> print -> validate -> write -> done
 *
 * The document snapshot is the current renderer revision (including unsaved
 * edits). The hidden print window measures and renders that snapshot; the job
 * validates the produced PDF with `inspectPdf`, then writes an exclusive temp
 * file in the output directory and moves it into place only on success
 * (`link` no-clobber for `overwrite:false`, `rename` for overwrite). A failure
 * or cancellation deletes the temp file, never writes the output path, and
 * never touches the document package.
 *
 * The manager is dependency-injected so the state machine, atomicity, and
 * validation are unit-testable without Electron.
 */

import { link, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { PdfInspection } from '@noteforest/pdf/node';
import type {
  ExportFailureCode,
  ExportJobErrorView,
  ExportJobPhase,
  ExportJobView,
  ExportPdfInput,
  ExportPdfStartResult,
  ExportSnapshot,
  ExportWarning,
  PrintPdfOptions,
  PrintRunSummary,
} from '../shared/export.js';
import { isPrintRunSummary } from '../shared/export.js';
import { evaluatePreflight, pdfOptionsFor, validateProducedPdf } from './export-preflight.js';

export class ExportJobError extends Error {
  readonly code: ExportFailureCode;
  readonly details: ExportWarning[];

  constructor(code: ExportFailureCode, message: string, details: ExportWarning[] = []) {
    super(message);
    this.name = 'ExportJobError';
    this.code = code;
    this.details = details;
  }
}

/** Internal control-flow signal; never surfaced as an error code. */
class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled.');
    this.name = 'ExportCancelledError';
  }
}

/** One open hidden-window print run for a job. */
export interface ExportPrinterSession {
  /** Measure the snapshot, preflight-block or render, and settle. */
  measure(): Promise<PrintRunSummary>;
  print(options: PrintPdfOptions): Promise<Uint8Array>;
  cancel(): void;
  dispose(): void;
}

export interface ExportJobDependencies {
  requestSnapshot(
    jobId: string,
    packagePath: string,
    signal: AbortSignal,
  ): Promise<ExportSnapshot>;
  openPrintSession(input: {
    jobId: string;
    snapshot: ExportSnapshot;
    signal: AbortSignal;
  }): Promise<ExportPrinterSession>;
  inspectPdf(bytes: Uint8Array): Promise<PdfInspection>;
  exists?: (path: string) => Promise<boolean>;
  readFile?: (path: string) => Promise<Uint8Array>;
  writeFile?: (path: string, bytes: Uint8Array) => Promise<void>;
  rename?: (from: string, to: string) => Promise<void>;
  /** Atomic no-clobber primitive for `overwrite:false` (default `link`). */
  link?: (from: string, to: string) => Promise<void>;
  /** Best-effort directory fsync after the output is in place. */
  syncDirectory?: (path: string) => Promise<void>;
  removeFile?: (path: string) => Promise<void>;
  createJobId?: () => string;
  now?: () => number;
  /** Completed jobs kept for status polling (default 25). */
  maxCompletedJobs?: number;
}

interface InternalJob {
  view: ExportJobView;
  input: ExportPdfInput;
  controller: AbortController;
  session: ExportPrinterSession | null;
  tempPath: string | null;
}

function defaultJobId(): string {
  return `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function removeIfPresent(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // The temp file was never created or is already gone.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAlreadyExists(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'EEXIST'
  );
}

/** True when `candidate` is `root` itself or inside `root` (lexical). */
function isPathInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Exclusive temp creation (S3-3): `wx` refuses an existing path, `0o600` keeps
 * the temp private, and `sync` flushes the bytes before the rename/link.
 */
async function writeExclusive(path: string, bytes: Uint8Array): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/** Best-effort directory fsync after the output link/rename (S3-3). */
async function syncDirectory(path: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(path, 'r');
    await handle.sync();
  } catch {
    // Some platforms/filesystems do not support opening a directory for fsync.
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

const STALE_PARTIAL_MS = 60 * 60 * 1000;

/**
 * Remove `.name.*.partial` files left by a crashed export (S3-3). Only files
 * older than an hour are removed, so a concurrent running job is untouched.
 */
async function cleanupStalePartials(outputPath: string): Promise<void> {
  const directory = dirname(outputPath);
  const prefix = `.${basename(outputPath)}.`;
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return;
  }
  const now = Date.now();
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.partial')) continue;
    const path = join(directory, name);
    try {
      const info = await stat(path);
      if (now - info.mtimeMs < STALE_PARTIAL_MS) continue;
      await rm(path, { force: true });
    } catch {
      // Best-effort cleanup; a locked/stale entry is retried next export.
    }
  }
}

interface NormalizedInput {
  input: ExportPdfInput;
}

function normalizeInput(value: unknown): NormalizedInput | { error: string } {
  if (!isRecord(value)) return { error: 'The export request is missing.' };
  const packagePath = value['packagePath'];
  const outputPath = value['outputPath'];
  const overwrite = value['overwrite'];
  if (typeof packagePath !== 'string' || packagePath.length === 0) {
    return { error: 'No document package was provided.' };
  }
  if (typeof outputPath !== 'string' || outputPath.length === 0) {
    return { error: 'No output path was provided.' };
  }
  if (!isAbsolute(outputPath)) {
    return { error: 'The output path must be absolute.' };
  }
  if (overwrite !== undefined && typeof overwrite !== 'boolean') {
    return { error: 'The overwrite flag must be a boolean.' };
  }
  const packageRoot = resolve(packagePath);
  const resolvedOutput = resolve(outputPath);
  // Source-package protection (S3-3): the export must never write into the
  // open document package (document.json, assets, backups, or a child path).
  if (isPathInside(packageRoot, resolvedOutput)) {
    return {
      error: 'The output path cannot be the document package or a path inside it.',
    };
  }
  return {
    input: {
      packagePath,
      outputPath: resolvedOutput,
      ...(overwrite === undefined ? {} : { overwrite }),
    },
  };
}

export class PdfExportManager {
  private readonly jobs = new Map<string, InternalJob>();
  private readonly deps: Required<
    Pick<
      ExportJobDependencies,
      | 'requestSnapshot'
      | 'openPrintSession'
      | 'inspectPdf'
      | 'exists'
      | 'readFile'
      | 'writeFile'
      | 'rename'
      | 'link'
      | 'syncDirectory'
      | 'removeFile'
      | 'createJobId'
      | 'now'
      | 'maxCompletedJobs'
    >
  >;

  constructor(dependencies: ExportJobDependencies) {
    this.deps = {
      requestSnapshot: dependencies.requestSnapshot,
      openPrintSession: dependencies.openPrintSession,
      inspectPdf: dependencies.inspectPdf,
      exists: dependencies.exists ?? pathExists,
      readFile:
        dependencies.readFile ?? (async (path) => new Uint8Array(await readFile(path))),
      writeFile: dependencies.writeFile ?? writeExclusive,
      rename: dependencies.rename ?? rename,
      link: dependencies.link ?? link,
      syncDirectory: dependencies.syncDirectory ?? syncDirectory,
      removeFile: dependencies.removeFile ?? removeIfPresent,
      createJobId: dependencies.createJobId ?? defaultJobId,
      now: dependencies.now ?? (() => Date.now()),
      maxCompletedJobs: dependencies.maxCompletedJobs ?? 25,
    };
  }

  /** Start a job and return its id immediately; the run continues in-process. */
  exportPdf(value: unknown): ExportPdfStartResult {
    const normalized = normalizeInput(value);
    if ('error' in normalized) {
      return { ok: false, code: 'invalid-input', message: normalized.error };
    }
    const id = this.deps.createJobId();
    const now = this.deps.now();
    const view: ExportJobView = {
      id,
      packagePath: normalized.input.packagePath,
      outputPath: normalized.input.outputPath,
      overwrite: normalized.input.overwrite === true,
      status: 'running',
      phase: 'queued',
      progress: 0,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      documentId: null,
      revision: null,
      title: null,
      fingerprint: null,
      pageCount: null,
      pageSetup: null,
      pageWidthMm: null,
      pageHeightMm: null,
      rendered: null,
      framesSettled: null,
      imagesSettled: null,
      fontsSettled: null,
      timings: null,
      warnings: [],
      error: null,
    };
    const job: InternalJob = {
      view,
      input: normalized.input,
      controller: new AbortController(),
      session: null,
      tempPath: null,
    };
    this.jobs.set(id, job);
    this.trimCompleted();
    void this.run(job);
    return { ok: true, jobId: id };
  }

  getExportJob(jobId: string): ExportJobView | null {
    const job = this.jobs.get(jobId);
    return job === undefined ? null : structuredClone(job.view);
  }

  /**
   * Request cancellation. The run aborts at the next await boundary, closes the
   * hidden window, and deletes the temp file; the output path is never partial.
   */
  cancelExport(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job === undefined || job.view.status !== 'running') return false;
    job.controller.abort();
    job.session?.cancel();
    return true;
  }

  /** Cancel and close every running job (used on app quit). */
  dispose(): void {
    for (const job of this.jobs.values()) {
      if (job.view.status !== 'running') continue;
      job.controller.abort();
      job.session?.cancel();
    }
  }

  private async run(job: InternalJob): Promise<void> {
    const { view, input } = job;
    try {
      await cleanupStalePartials(input.outputPath);
      if (!job.view.overwrite && (await this.deps.exists(input.outputPath))) {
        throw new ExportJobError(
          'output-exists',
          `The output file already exists: ${input.outputPath}. Pass overwrite to replace it.`,
        );
      }
      this.setPhase(job, 'snapshot', 0.05);
      const snapshot = await this.race(
        job,
        this.deps.requestSnapshot(view.id, input.packagePath, job.controller.signal),
      );
      this.throwIfCancelled(job);
      this.applySnapshot(job, snapshot);

      this.setPhase(job, 'model', 0.15);
      const session = await this.race(
        job,
        this.deps.openPrintSession({
          jobId: view.id,
          snapshot,
          signal: job.controller.signal,
        }),
      );
      job.session = session;
      try {
        const summary = await this.race(job, session.measure());
        this.throwIfCancelled(job);
        if (!isPrintRunSummary(summary)) {
          throw new ExportJobError(
            'window-failed',
            'The hidden print window returned a malformed run summary; the export was refused.',
          );
        }
        this.applySummary(job, summary);
        const preflight = evaluatePreflight(snapshot, summary);
        view.warnings = preflight.warnings;
        this.touch(job);
        const identity = preflight.errors.filter(
          (error) => error.code === 'document-mismatch' || error.code === 'settings-mismatch',
        );
        if (identity.length > 0) {
          throw new ExportJobError(
            identity[0]!.code as ExportFailureCode,
            identity[0]!.message,
            preflight.errors,
          );
        }
        const blocking = preflight.errors.filter(
          (error) => error.code === 'preflight-blocked',
        );
        if (blocking.length > 0) {
          throw new ExportJobError(
            'preflight-blocked',
            `Export blocked: ${blocking.map((error) => error.message).join(' ')}`,
            preflight.errors,
          );
        }
        const typed = preflight.errors.filter(
          (error) => error.code === 'model-error' || error.code === 'render-error',
        );
        if (typed.length > 0) {
          throw new ExportJobError(
            typed[0]!.code as ExportFailureCode,
            typed.map((error) => error.message).join(' '),
            preflight.errors,
          );
        }
        // S3-2: a print needs a rendered page model and its theme-metrics probe.
        if (!summary.rendered) {
          throw new ExportJobError(
            'render-error',
            'The print window did not render the page model; the export was refused.',
          );
        }
        if (summary.metrics === null) {
          throw new ExportJobError(
            'settings-mismatch',
            'The print window did not report its resolved PageTheme metrics; the export was refused.',
          );
        }

        this.setPhase(job, 'print', 0.5);
        const bytes = await this.race(job, session.print(pdfOptionsFor(summary)));
        this.throwIfCancelled(job);

        this.setPhase(job, 'validate', 0.75);
        const tempPath = this.tempPathFor(job);
        job.tempPath = tempPath;
        try {
          await this.deps.writeFile(tempPath, bytes);
        } catch (error) {
          throw new ExportJobError(
            'write-failed',
            `Could not write the temporary PDF: ${messageOf(error)}`,
          );
        }
        this.throwIfCancelled(job);
        let written: Uint8Array;
        try {
          written = await this.deps.readFile(tempPath);
        } catch (error) {
          throw new ExportJobError(
            'write-failed',
            `Could not read back the temporary PDF: ${messageOf(error)}`,
          );
        }
        let inspection: PdfInspection;
        try {
          inspection = await this.deps.inspectPdf(written);
        } catch (error) {
          throw new ExportJobError(
            'validation-failed',
            `Could not inspect the produced PDF: ${messageOf(error)}`,
          );
        }
        this.throwIfCancelled(job);
        const validation = validateProducedPdf(inspection, summary);
        view.warnings = [...view.warnings, ...validation.warnings];
        if (!validation.ok) {
          throw new ExportJobError(
            'validation-failed',
            validation.errors.map((error) => error.message).join(' '),
            [...preflight.errors, ...validation.errors],
          );
        }

        this.setPhase(job, 'write', 0.9);
        this.throwIfCancelled(job);
        try {
          if (job.view.overwrite) {
            await this.deps.rename(tempPath, input.outputPath);
            job.tempPath = null;
          } else {
            // Atomic no-clobber (S3-3): `link` fails with EEXIST instead of
            // replacing a file created after the preflight exists check.
            await this.deps.link(tempPath, input.outputPath);
            // The output is complete; the temp is now a duplicate. Clear the
            // tracked path first so a failed unlink is only a stale-file cleanup.
            job.tempPath = null;
            await this.deps.removeFile(tempPath).catch(() => undefined);
          }
          await this.deps.syncDirectory(dirname(input.outputPath)).catch(() => undefined);
        } catch (error) {
          if (!job.view.overwrite && isAlreadyExists(error)) {
            throw new ExportJobError(
              'output-exists',
              `The output file was created by another process: ${input.outputPath}.`,
            );
          }
          throw new ExportJobError(
            'write-failed',
            `Could not move the PDF into place: ${messageOf(error)}`,
          );
        }
        this.finish(job, 'done', 'done');
      } finally {
        job.session = null;
        session.dispose();
      }
    } catch (error) {
      await this.cleanupTemp(job);
      if (error instanceof ExportCancelledError || job.controller.signal.aborted) {
        this.finish(job, 'cancelled', 'cancelled', {
          code: 'cancelled',
          message: 'Export cancelled.',
          details: view.warnings,
        });
        return;
      }
      const failure = this.toFailure(error);
      this.finish(job, 'failed', 'failed', failure);
    }
  }

  private race<T>(job: InternalJob, promise: Promise<T>): Promise<T> {
    const signal = job.controller.signal;
    return new Promise<T>((resolvePromise, rejectPromise) => {
      if (signal.aborted) {
        rejectPromise(new ExportCancelledError());
        return;
      }
      const onAbort = (): void => rejectPromise(new ExportCancelledError());
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolvePromise(value);
        },
        (error: unknown) => {
          signal.removeEventListener('abort', onAbort);
          rejectPromise(error);
        },
      );
    });
  }

  private throwIfCancelled(job: InternalJob): void {
    if (job.controller.signal.aborted) throw new ExportCancelledError();
  }

  private applySnapshot(job: InternalJob, snapshot: ExportSnapshot): void {
    const view = job.view;
    view.documentId = snapshot.documentId;
    view.revision = snapshot.revision;
    view.title = snapshot.title;
    this.touch(job);
  }

  private applySummary(job: InternalJob, summary: PrintRunSummary): void {
    const view = job.view;
    view.documentId = summary.documentId;
    view.revision = summary.revision;
    view.title = summary.title;
    view.fingerprint = summary.fingerprint;
    view.pageCount = summary.pageCount;
    view.pageSetup = summary.pageSetup;
    view.pageWidthMm = summary.pageWidthMm;
    view.pageHeightMm = summary.pageHeightMm;
    view.rendered = summary.rendered;
    view.framesSettled = summary.framesSettled;
    view.imagesSettled = summary.imagesSettled;
    view.fontsSettled = summary.fontsSettled;
    view.timings = { ...summary.timings };
    this.touch(job);
  }

  private tempPathFor(job: InternalJob): string {
    const output = job.input.outputPath;
    return join(dirname(output), `.${basename(output)}.${job.view.id}.partial`);
  }

  private async cleanupTemp(job: InternalJob): Promise<void> {
    const tempPath = job.tempPath;
    job.tempPath = null;
    if (tempPath !== null) await this.deps.removeFile(tempPath);
  }

  private setPhase(job: InternalJob, phase: ExportJobPhase, progress: number): void {
    job.view.phase = phase;
    job.view.progress = Math.max(job.view.progress, progress);
    this.touch(job);
  }

  private touch(job: InternalJob): void {
    job.view.updatedAt = this.deps.now();
  }

  private finish(
    job: InternalJob,
    status: 'done' | 'failed' | 'cancelled',
    phase: ExportJobPhase,
    error?: ExportJobErrorView,
  ): void {
    const now = this.deps.now();
    job.view.status = status;
    job.view.phase = phase;
    job.view.progress = 1;
    job.view.updatedAt = now;
    job.view.finishedAt = now;
    if (error !== undefined) job.view.error = error;
    this.trimCompleted();
  }

  private toFailure(error: unknown): ExportJobErrorView {
    if (error instanceof ExportJobError) {
      return { code: error.code, message: error.message, details: error.details };
    }
    if (error instanceof Error) {
      return { code: 'internal-error', message: error.message, details: [] };
    }
    return { code: 'internal-error', message: String(error), details: [] };
  }

  private trimCompleted(): void {
    const terminal = [...this.jobs.values()]
      .filter((job) => job.view.status !== 'running')
      .sort((left, right) => left.view.createdAt - right.view.createdAt);
    const excess = terminal.length - this.deps.maxCompletedJobs;
    for (let index = 0; index < excess; index += 1) {
      const job = terminal[index];
      if (job !== undefined) this.jobs.delete(job.view.id);
    }
  }
}
