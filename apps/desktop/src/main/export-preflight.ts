/**
 * M4c2 PDF export preflight and produced-PDF validation (pure).
 *
 * The hidden print window measures and (when allowed) renders the snapshot; the
 * main process decides whether that run may be printed. Nothing here measures,
 * paginates, or reroutes: it only reads the summary records and the inspected
 * PDF. No silent clipping: a blocking defect or an overflowing page refuses the
 * export and names the affected blocks.
 */

import type { PdfInspection } from '@noteforest/pdf/node';
import type {
  ExportSnapshot,
  ExportWarning,
  PrintPdfOptions,
  PrintRunSummary,
} from '../shared/export.js';
import { PDF_PAGE_SIZE_TOLERANCE_MM } from '../shared/export.js';

export interface PreflightResult {
  errors: ExportWarning[];
  warnings: ExportWarning[];
}

function defectLabel(blockTitle: string | undefined, blockId: string | undefined): string {
  if (blockTitle !== undefined && blockTitle.length > 0) return blockTitle;
  return blockId ?? 'a block';
}

/**
 * Identity of the summary against the snapshot the renderer supplied. A print
 * run for another document/settings/revision is not printed.
 */
export function identityErrors(
  snapshot: ExportSnapshot,
  summary: PrintRunSummary,
): ExportWarning[] {
  const errors: ExportWarning[] = [];
  if (summary.documentId !== snapshot.documentId) {
    errors.push({
      kind: 'layout-warning',
      code: 'document-mismatch',
      message: `The print run measured document ${summary.documentId}, not ${snapshot.documentId}.`,
    });
  }
  if (
    summary.revision !== null &&
    snapshot.revision !== null &&
    summary.revision !== snapshot.revision
  ) {
    errors.push({
      kind: 'layout-warning',
      code: 'document-mismatch',
      message: `The print run measured revision ${summary.revision}, not the exported revision ${snapshot.revision}.`,
    });
  }
  if (summary.fingerprint !== snapshot.settingsFingerprint) {
    errors.push({
      kind: 'layout-warning',
      code: 'settings-mismatch',
      message:
        'The print run used different resolved page settings than the document snapshot; the export was refused.',
    });
  }
  if (summary.rendered && summary.metrics !== null && !summary.metrics.ok) {
    errors.push({
      kind: 'validation',
      code: 'settings-mismatch',
      message: `The print window type metrics do not match the resolved PageTheme (font ${summary.metrics.fontSizePx}px vs expected ${summary.metrics.expectedFontSizePx}px, line ratio ${summary.metrics.lineHeightRatio} vs ${summary.metrics.expectedLineHeightRatio}).`,
    });
  }
  return errors;
}

/** Defects/overflow that must block printing; each names the affected block. */
export function blockingWarnings(summary: PrintRunSummary): ExportWarning[] {
  const warnings: ExportWarning[] = [];
  const coveredPages = new Set<number>();
  for (const defect of summary.blockingDefects) {
    if (defect.pageNumber !== undefined) coveredPages.add(defect.pageNumber);
    warnings.push({
      kind: 'blocking-defect',
      code: 'preflight-blocked',
      message: `Block ${defectLabel(defect.blockTitle, defect.blockId)}: ${defect.message}`,
      ...(defect.blockId === undefined ? {} : { blockId: defect.blockId }),
      ...(defect.blockTitle === undefined ? {} : { blockTitle: defect.blockTitle }),
      ...(defect.pageNumber === undefined ? {} : { pageNumber: defect.pageNumber }),
    });
  }
  for (const pageNumber of summary.overflowPages) {
    if (coveredPages.has(pageNumber)) continue;
    warnings.push({
      kind: 'page-overflow',
      code: 'preflight-blocked',
      message: `Page ${pageNumber} overflows the resolved content area; printing would clip it.`,
      pageNumber,
    });
  }
  return warnings;
}

/** Non-blocking diagnostics surfaced on the job (never silently dropped). */
export function preflightWarnings(summary: PrintRunSummary): ExportWarning[] {
  const warnings: ExportWarning[] = [];
  for (const warning of summary.manualBreakWarnings) {
    warnings.push({
      kind: 'manual-break',
      code: warning.code,
      message: warning.message,
      ...(warning.blockId === undefined ? {} : { blockId: warning.blockId }),
      ...(warning.blockTitle === undefined ? {} : { blockTitle: warning.blockTitle }),
      ...(warning.pageNumber === undefined ? {} : { pageNumber: warning.pageNumber }),
    });
  }
  for (const blockId of summary.anchorWarningBlockIds) {
    warnings.push({
      kind: 'anchor',
      code: 'anchor-warning',
      message: `Block ${blockId} has a broken or ambiguous anchor; its branch is printed with the fallback marker.`,
      blockId,
    });
  }
  for (const assetId of summary.failedAssetIds) {
    warnings.push({
      kind: 'asset',
      code: 'failed-asset',
      message: `Asset ${assetId} could not be decoded; the PDF shows the placeholder.`,
    });
  }
  for (const assetId of summary.missingAssetIds) {
    warnings.push({
      kind: 'asset',
      code: 'missing-asset',
      message: `Asset ${assetId} is missing from the package; the PDF shows the placeholder.`,
    });
  }
  const covered = new Set([
    ...summary.manualBreakWarnings.map((warning) => `${warning.code}:${warning.blockId ?? ''}`),
  ]);
  for (const defect of summary.defects) {
    if (defect.severity !== 'warning') continue;
    if (covered.has(`${defect.code}:${defect.blockId ?? ''}`)) continue;
    if (defect.code === 'broken-anchor' || defect.code === 'ambiguous-anchor') continue;
    // The asset warnings above already name the asset and the placeholder.
    if (defect.code === 'missing-asset') continue;
    warnings.push({
      kind: 'layout-warning',
      code: defect.code,
      message: defect.message,
      ...(defect.blockId === undefined ? {} : { blockId: defect.blockId }),
      ...(defect.blockTitle === undefined ? {} : { blockTitle: defect.blockTitle }),
      ...(defect.pageNumber === undefined ? {} : { pageNumber: defect.pageNumber }),
    });
  }
  if (summary.rendered && !summary.framesSettled) {
    warnings.push({
      kind: 'layout-warning',
      code: 'frames-not-settled',
      message:
        'The print window did not observe two animation frames before the timeout; the fixed page CSS was still used.',
    });
  }
  return warnings;
}

/** Combined preflight decision for one measured/rendered print run. */
export function evaluatePreflight(
  snapshot: ExportSnapshot,
  summary: PrintRunSummary,
): PreflightResult {
  return {
    errors: [...identityErrors(snapshot, summary), ...blockingWarnings(summary)],
    warnings: preflightWarnings(summary),
  };
}

/**
 * `printToPDF` options for the resolved setup. Numeric zero margins in inches
 * (never `marginType`); margins are the page's internal padding. Scale 1 and
 * `preferCSSPageSize` mean the fixed `@page` size is the PDF page size.
 */
export function pdfOptionsFor(summary: PrintRunSummary): PrintPdfOptions {
  return {
    pageSize: summary.pageSetup.size,
    landscape: summary.pageSetup.orientation === 'landscape',
    scale: 1,
    printBackground: true,
    preferCSSPageSize: true,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    displayHeaderFooter: false,
    generateTaggedPDF: false,
  };
}

export interface PdfValidationResult {
  ok: boolean;
  errors: ExportWarning[];
  warnings: ExportWarning[];
}

/**
 * Validate the produced PDF against the resolved model: page count, every
 * page's size/orientation (ADR 0.2 mm rounding tolerance, 0.25 used), and real
 * text. Blank pages and missing glyphs are reported; the M4c3 raster/text gates
 * own the full typography check.
 */
export function validateProducedPdf(
  inspection: PdfInspection,
  summary: PrintRunSummary,
): PdfValidationResult {
  const errors: ExportWarning[] = [];
  const warnings: ExportWarning[] = [];
  if (inspection.pageCount !== summary.pageCount) {
    errors.push({
      kind: 'validation',
      code: 'validation-failed',
      message: `The produced PDF has ${inspection.pageCount} pages; the paginator derived ${summary.pageCount}.`,
    });
  }
  for (const page of inspection.pages) {
    if (
      Math.abs(page.widthMm - summary.pageWidthMm) > PDF_PAGE_SIZE_TOLERANCE_MM ||
      Math.abs(page.heightMm - summary.pageHeightMm) > PDF_PAGE_SIZE_TOLERANCE_MM
    ) {
      errors.push({
        kind: 'validation',
        code: 'validation-failed',
        message: `PDF page ${page.pageNumber} is ${page.widthMm.toFixed(2)} × ${page.heightMm.toFixed(2)} mm; the resolved page is ${summary.pageWidthMm.toFixed(2)} × ${summary.pageHeightMm.toFixed(2)} mm.`,
        pageNumber: page.pageNumber,
      });
    }
    if (page.text.trim().length === 0) {
      warnings.push({
        kind: 'validation',
        code: 'blank-page',
        message: `PDF page ${page.pageNumber} has no extractable text.`,
        pageNumber: page.pageNumber,
      });
    }
  }
  if (inspection.text.trim().length === 0) {
    errors.push({
      kind: 'validation',
      code: 'validation-failed',
      message: 'The produced PDF has no extractable text.',
    });
  }
  if (inspection.missingGlyphCount > 0) {
    warnings.push({
      kind: 'validation',
      code: 'missing-glyphs',
      message: `The produced PDF contains ${inspection.missingGlyphCount} replacement glyph(s).`,
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}
