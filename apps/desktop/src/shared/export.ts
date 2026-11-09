/**
 * M4c2 PDF export contract.
 *
 * Shared by the main process (job + hidden print window), the preload bridge,
 * the app renderer (current-document snapshot), and the hidden `print.html`
 * entry (on-demand measured model). The renderer never writes the PDF file and
 * the main process never owns document state: the snapshot is the only input.
 *
 * The snapshot is the current in-memory document revision and resolved personal
 * page lens, so an export includes unsaved edits and can never fall back to a
 * stale `document.json`.
 */

import type { NoteDocument, PageSettings, PageSetup } from '@noteforest/layout';

/** Typed failure surfaces; a failed export never writes a partial PDF. */
export type ExportFailureCode =
  | 'invalid-input'
  | 'output-exists'
  | 'document-not-open'
  | 'snapshot-failed'
  | 'snapshot-timeout'
  | 'document-mismatch'
  | 'settings-mismatch'
  | 'empty-document'
  | 'model-mismatch'
  | 'model-error'
  | 'preflight-blocked'
  | 'print-failed'
  | 'validation-failed'
  | 'write-failed'
  | 'window-failed'
  | 'cancelled'
  | 'internal-error';

export type ExportJobPhase =
  | 'queued'
  | 'snapshot'
  | 'model'
  | 'print'
  | 'validate'
  | 'write'
  | 'done'
  | 'failed'
  | 'cancelled';

export type ExportJobStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface ExportPdfInput {
  /** Open document package; the renderer supplies the current in-memory revision. */
  packagePath: string;
  /** Absolute output path. The temp file is created in this directory. */
  outputPath: string;
  /** Default false: an existing output file fails before the print starts. */
  overwrite?: boolean;
}

/**
 * Current-document snapshot handed to the hidden print window.
 *
 * `document` is the layout-shaped canonical document (including unsaved edits),
 * `settings` is the resolved personal page lens for that document, and
 * `settingsFingerprint` is the fingerprint of the same resolved run.
 */
export interface ExportSnapshot {
  packagePath: string;
  documentId: string;
  revision: number | null;
  title: string;
  document: NoteDocument;
  settings: PageSettings;
  settingsFingerprint: string;
  /** Renderer-safe display URLs for available assets. */
  assetUrls: Record<string, string>;
  /** Assets already known missing/changed in the open session. */
  failedAssetIds: string[];
}

/** One layout defect or manual-break warning carried across the window boundary. */
export interface PrintRunDefect {
  code: string;
  severity: 'warning' | 'blocking';
  message: string;
  blockId?: string;
  /** Resolved block title for a user-facing preflight message. */
  blockTitle?: string;
  chapterId?: string;
  pageNumber?: number;
}

/**
 * Themed-metric probe measured after the print commit. It proves the hidden
 * window applied the resolved `PageTheme` variables and has the expected type
 * metrics, not only the model fingerprint.
 */
export interface PrintRunMetrics {
  fontSizePx: number;
  lineHeightRatio: number;
  expectedFontSizePx: number;
  expectedLineHeightRatio: number;
  ok: boolean;
}

/**
 * Result of the on-demand measured model + render in the hidden print window.
 * The model never comes from the visible Page surface or from disk.
 */
export interface PrintRunSummary {
  documentId: string;
  revision: number | null;
  title: string;
  fingerprint: string;
  pageCount: number;
  pageSetup: PageSetup;
  pageWidthMm: number;
  pageHeightMm: number;
  blockingDefects: PrintRunDefect[];
  defects: PrintRunDefect[];
  manualBreakWarnings: PrintRunDefect[];
  anchorWarningBlockIds: string[];
  failedAssetIds: string[];
  missingAssetIds: string[];
  overflowPages: number[];
  /** False when preflight blocked the render; the manager never prints then. */
  rendered: boolean;
  /** True when two animation frames actually elapsed before the timeout bound. */
  framesSettled: boolean;
  metrics: PrintRunMetrics | null;
  timings: { measureMs: number; settleMs: number };
}

/** Structured return of `window.__noteforestPrint.build(snapshot)`. */
export type PrintBuildResult =
  | { ok: true; summary: PrintRunSummary }
  | { ok: false; code: ExportFailureCode; message: string };

/** One surfaced preflight/validation warning or error. */
export interface ExportWarning {
  kind:
    | 'blocking-defect'
    | 'page-overflow'
    | 'manual-break'
    | 'anchor'
    | 'asset'
    | 'layout-warning'
    | 'validation';
  code: string;
  message: string;
  blockId?: string;
  blockTitle?: string;
  pageNumber?: number;
}

export interface ExportJobErrorView {
  code: ExportFailureCode;
  message: string;
  details: ExportWarning[];
}

/** Read-only job view returned by `exportPdf` start/status polling. */
export interface ExportJobView {
  id: string;
  packagePath: string;
  outputPath: string;
  overwrite: boolean;
  status: ExportJobStatus;
  phase: ExportJobPhase;
  /** 0..1 progress; monotonic until a terminal state. */
  progress: number;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  documentId: string | null;
  revision: number | null;
  title: string | null;
  fingerprint: string | null;
  pageCount: number | null;
  pageSetup: PageSetup | null;
  pageWidthMm: number | null;
  pageHeightMm: number | null;
  /** False when preflight blocked the render; null before the model exists. */
  rendered: boolean | null;
  /** True when the hidden window observed two animation frames and settled. */
  framesSettled: boolean | null;
  /** Measurement and settle time in the hidden print window (diagnostics). */
  timings: { measureMs: number; settleMs: number } | null;
  warnings: ExportWarning[];
  error: ExportJobErrorView | null;
}

export type ExportPdfStartResult =
  | { ok: true; jobId: string }
  | { ok: false; code: ExportFailureCode; message: string };

/**
 * `printToPDF` options derived from the resolved page setup. Numeric zero
 * margins (inches), never `marginType`; margins are internal page padding.
 */
export interface PrintPdfOptions {
  pageSize: PageSetup['size'];
  landscape: boolean;
  scale: 1;
  printBackground: true;
  preferCSSPageSize: true;
  margins: { top: 0; bottom: 0; left: 0; right: 0 };
  displayHeaderFooter: false;
  generateTaggedPDF: false;
}

/** Main -> renderer request for the current document snapshot. */
export interface ExportSnapshotRequest {
  jobId: string;
  packagePath: string;
}

/** Renderer -> main reply; `error` is a user-facing reason. */
export type ExportSnapshotReply = ExportSnapshot | { error: string } | null;

/** A produced PDF must match the resolved geometry within the ADR tolerance. */
export const PDF_PAGE_SIZE_TOLERANCE_MM = 0.25;
