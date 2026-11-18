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

import type {
  AnchorResolutionView,
  CodeFontId,
  NoteDocument,
  PageSettings,
  PageSetup,
} from '@noteforest/layout';

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
  | 'render-error'
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

/** Global settings default destination for the Export sheet (R4). */
export interface ExportDefaults {
  folder: string;
}

/**
 * Resolve the global export default folder: the `export.folder` setting when
 * set, otherwise the OS Documents folder. The main process owns the OS path, so
 * this pure helper never guesses a home directory. It also never creates or
 * substitutes a missing custom folder; the export job reports the write failure
 * and the sheet requires Choose….
 */
export function resolveExportDefaultFolder(
  folder: string | null | undefined,
  documentsFolder: string,
): string {
  return folder ?? documentsFolder;
}

/**
 * Result of the native folder picker (the only native surface in the export
 * flow). The filename and the overwrite decision stay inside the sheet.
 */
export type ChooseExportFolderResult =
  | { canceled: true }
  | { canceled: false; folderPath: string };

/** Existence probe used for the in-sheet replacement confirmation. */
export interface ExportPathStatus {
  exists: boolean;
}

/**
 * Base export filename for a document title (no extension). Path separators,
 * reserved characters, and control characters become spaces; an empty title
 * falls back to `Untitled`. The sheet owns the fixed `.pdf` suffix.
 */
export function pdfBaseNameForTitle(title: string): string {
  const cleaned = title
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const withoutExtension = cleaned.replace(/\.pdf$/i, '').trim();
  return withoutExtension.length > 0 ? withoutExtension : 'Untitled';
}

/** Default export filename for a document title, with one `.pdf` extension. */
export function pdfFileNameForTitle(title: string): string {
  return `${pdfBaseNameForTitle(title)}.pdf`;
}

/**
 * The sheet filename: a sanitized base and exactly one `.pdf`. There is no date
 * suffix and no filename pattern (R4).
 */
export function exportFileName(base: string): string {
  return `${pdfBaseNameForTitle(base)}.pdf`;
}

/** Join a chosen folder and a sheet filename without doubling separators. */
export function joinExportPath(folder: string, fileName: string): string {
  const trimmed = folder.trim().replace(/[\\/]+$/, '');
  if (trimmed.length === 0) return fileName;
  const separator =
    trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/';
  return `${trimmed}${separator}${fileName}`;
}

/**
 * Current-document snapshot handed to the hidden print window.
 *
 * `document` is the layout-shaped canonical document (including unsaved edits),
 * `settings` is the resolved personal page lens for that document,
 * `settingsFingerprint` is the fingerprint of the same resolved run, and
 * `codeFont` is the appearance code font that run was measured with. The code
 * font is part of the print/measure identity: the hidden window must render the
 * same font or fail.
 */
export interface ExportSnapshot {
  packagePath: string;
  documentId: string;
  revision: number | null;
  title: string;
  document: NoteDocument;
  settings: PageSettings;
  settingsFingerprint: string;
  codeFont: CodeFontId;
  /**
   * The session index's anchor projection for exactly this document revision.
   * The hidden print window must render the same semantic states as Page Read;
   * the layout identity guard refuses a mismatched view instead of rendering a
   * stale one.
   */
  anchorView: AnchorResolutionView;
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
 * One derived page's model content, used to classify a produced blank page
 * from the model instead of from extracted text (S2-1). An image-only page has
 * `images > 0` and is valid even though it has no extractable text.
 */
export interface PrintRunPageSummary {
  pageNumber: number;
  fragments: number;
  edges: number;
  trunks: number;
  images: number;
  /** No fragments, no edges/trunks, and no image fragments: a truly empty page. */
  empty: boolean;
}

/**
 * Model sentinels for the produced-PDF gate (S3-6): every canonical block is
 * placed, and every measured segment is covered by exactly one page fragment.
 * A violation is an export error, not a silent gap.
 */
export interface PrintRunModelChecks {
  blockCount: number;
  placedBlockCount: number;
  unplacedBlockIds: string[];
  segmentCount: number;
  segmentCoverageOk: boolean;
  segmentCoverageIssues: string[];
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
  /** Per-page model content for blank classification and image-only pages. */
  pages: PrintRunPageSummary[];
  /** Block/segment coverage sentinels; a false `segmentCoverageOk` blocks. */
  modelChecks: PrintRunModelChecks;
  /** False when preflight blocked the render; the manager never prints then. */
  rendered: boolean;
  /** True when two animation frames actually elapsed before the timeout bound. */
  framesSettled: boolean;
  /** Image settle completed without a timeout (failed ids are reported too). */
  imagesSettled: boolean;
  /** Font settle completed without a timeout. */
  fontsSettled: boolean;
  /** Print-window console errors captured by the main process. */
  consoleErrors: string[];
  /** Pages whose rendered fragments overflow the fixed content box. */
  printOverflowPages: number[];
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
    | 'render'
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
  /** Image/font settle outcomes (false is also surfaced as a warning). */
  imagesSettled: boolean | null;
  fontsSettled: boolean | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => isFiniteNumber(item));
}

function isPageSetup(value: unknown): value is PageSetup {
  if (!isRecord(value)) return false;
  if (value['size'] !== 'A4' && value['size'] !== 'A5' && value['size'] !== 'Letter') {
    return false;
  }
  if (value['orientation'] !== 'portrait' && value['orientation'] !== 'landscape') {
    return false;
  }
  const margins = value['margins'];
  if (!isRecord(margins)) return false;
  return ['top', 'right', 'bottom', 'left'].every((key) => isFiniteNumber(margins[key]));
}

const ANCHOR_VIEW_STATES = new Set([
  'resolved',
  'ambiguous',
  'broken',
  'idle',
  'block-missing',
]);

const ANCHOR_VIEW_KINDS = new Set(['text', 'formula', 'code', 'image']);

/**
 * Runtime guard for the anchor projection carried by the export snapshot. It
 * accepts the semantic data only: identity, per-block entries and the optional
 * resolved range. A malformed view is refused before the print window measures.
 */
export function isAnchorResolutionView(value: unknown): value is AnchorResolutionView {
  if (!isRecord(value)) return false;
  if (typeof value['documentId'] !== 'string') return false;
  if (value['revision'] !== undefined && !isFiniteNumber(value['revision'])) return false;
  const byBlock = value['byBlock'];
  if (!isRecord(byBlock)) return false;
  for (const list of Object.values(byBlock)) {
    if (!Array.isArray(list)) return false;
    for (const entry of list) {
      if (!isRecord(entry) || typeof entry['anchorId'] !== 'string') return false;
      if (typeof entry['state'] !== 'string' || !ANCHOR_VIEW_STATES.has(entry['state'])) {
        return false;
      }
      const range = entry['range'];
      if (range === null) continue;
      if (!isRecord(range)) return false;
      if (typeof range['kind'] !== 'string' || !ANCHOR_VIEW_KINDS.has(range['kind'])) {
        return false;
      }
      const nodePath = range['nodePath'];
      if (
        nodePath !== undefined &&
        (!Array.isArray(nodePath) || !nodePath.every((part) => Number.isInteger(part)))
      ) {
        return false;
      }
    }
  }
  return true;
}

function isPrintRunDefect(value: unknown): value is PrintRunDefect {
  if (!isRecord(value)) return false;
  if (typeof value['code'] !== 'string' || typeof value['message'] !== 'string') return false;
  if (value['severity'] !== 'warning' && value['severity'] !== 'blocking') return false;
  for (const key of ['blockId', 'blockTitle', 'chapterId'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  }
  if (value['pageNumber'] !== undefined && !isFiniteNumber(value['pageNumber'])) return false;
  return true;
}

function isPrintRunPageSummary(value: unknown): value is PrintRunPageSummary {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value['pageNumber']) &&
    isFiniteNumber(value['fragments']) &&
    isFiniteNumber(value['edges']) &&
    isFiniteNumber(value['trunks']) &&
    isFiniteNumber(value['images']) &&
    typeof value['empty'] === 'boolean'
  );
}

function isPrintRunModelChecks(value: unknown): value is PrintRunModelChecks {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value['blockCount']) &&
    Number.isInteger(value['placedBlockCount']) &&
    isStringArray(value['unplacedBlockIds']) &&
    Number.isInteger(value['segmentCount']) &&
    typeof value['segmentCoverageOk'] === 'boolean' &&
    isStringArray(value['segmentCoverageIssues'])
  );
}

function isPrintRunMetrics(value: unknown): value is PrintRunMetrics {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value['fontSizePx']) &&
    isFiniteNumber(value['lineHeightRatio']) &&
    isFiniteNumber(value['expectedFontSizePx']) &&
    isFiniteNumber(value['expectedLineHeightRatio']) &&
    typeof value['ok'] === 'boolean'
  );
}

/**
 * Runtime guard for the hidden-window summary (S3-2). The main process never
 * casts the IPC/`executeJavaScript` result: a malformed summary (missing
 * geometry, NaN, a missing metrics record) is refused before it can skip the
 * page-size check or the render requirement.
 */
export function isPrintRunSummary(value: unknown): value is PrintRunSummary {
  if (!isRecord(value)) return false;
  if (
    typeof value['documentId'] !== 'string' ||
    typeof value['title'] !== 'string' ||
    typeof value['fingerprint'] !== 'string'
  ) {
    return false;
  }
  if (value['revision'] !== null && !isFiniteNumber(value['revision'])) return false;
  if (!Number.isInteger(value['pageCount']) || (value['pageCount'] as number) < 0) return false;
  if (!isPageSetup(value['pageSetup'])) return false;
  if (!isFiniteNumber(value['pageWidthMm']) || !isFiniteNumber(value['pageHeightMm'])) {
    return false;
  }
  if (!Array.isArray(value['blockingDefects']) || !value['blockingDefects'].every(isPrintRunDefect)) {
    return false;
  }
  if (!Array.isArray(value['defects']) || !value['defects'].every(isPrintRunDefect)) return false;
  if (
    !Array.isArray(value['manualBreakWarnings']) ||
    !value['manualBreakWarnings'].every(isPrintRunDefect)
  ) {
    return false;
  }
  if (
    !isStringArray(value['anchorWarningBlockIds']) ||
    !isStringArray(value['failedAssetIds']) ||
    !isStringArray(value['missingAssetIds']) ||
    !isNumberArray(value['overflowPages']) ||
    !isNumberArray(value['printOverflowPages']) ||
    !isStringArray(value['consoleErrors'])
  ) {
    return false;
  }
  if (!Array.isArray(value['pages']) || !value['pages'].every(isPrintRunPageSummary)) {
    return false;
  }
  if (!isPrintRunModelChecks(value['modelChecks'])) return false;
  if (typeof value['rendered'] !== 'boolean' || typeof value['framesSettled'] !== 'boolean') {
    return false;
  }
  if (typeof value['imagesSettled'] !== 'boolean' || typeof value['fontsSettled'] !== 'boolean') {
    return false;
  }
  if (value['metrics'] !== null && !isPrintRunMetrics(value['metrics'])) return false;
  const timings = value['timings'];
  if (!isRecord(timings)) return false;
  return isFiniteNumber(timings['measureMs']) && isFiniteNumber(timings['settleMs']);
}
