/**
 * M4c2 PDF export preflight and produced-PDF validation (pure).
 *
 * The hidden print window measures and (when allowed) renders the snapshot; the
 * main process decides whether that run may be printed. Nothing here measures,
 * paginates, or reroutes: it only reads the summary records and the inspected
 * PDF. No silent clipping: a blocking defect or an overflowing page refuses the
 * export and names the affected blocks.
 */

import { pageGeometry } from '@noteforest/layout';
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
  // S3-2: the main process computes the expected geometry itself. A summary
  // with NaN/undefined or a different page box cannot skip the size check.
  const expected = pageGeometry(snapshot.settings.setup);
  if (
    !Number.isFinite(summary.pageWidthMm) ||
    !Number.isFinite(summary.pageHeightMm) ||
    Math.abs(summary.pageWidthMm - expected.pageWidthMm) > 0.01 ||
    Math.abs(summary.pageHeightMm - expected.pageHeightMm) > 0.01
  ) {
    errors.push({
      kind: 'validation',
      code: 'settings-mismatch',
      message: `The print run reports a ${summary.pageWidthMm} × ${summary.pageHeightMm} mm page; the resolved setup is ${expected.pageWidthMm.toFixed(2)} × ${expected.pageHeightMm.toFixed(2)} mm.`,
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
  // S3-6: the rendered fragments must also fit the fixed content box. A
  // print-time asset placeholder/settle change cannot silently clip a page.
  for (const pageNumber of summary.printOverflowPages) {
    if (coveredPages.has(pageNumber)) continue;
    warnings.push({
      kind: 'page-overflow',
      code: 'preflight-blocked',
      message: `Page ${pageNumber} overflows after rendering; printing would clip it.`,
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
  // S3-5: a bounded settle that timed out is a visible warning, never a
  // silently partial image/font set.
  if (summary.rendered && !summary.imagesSettled) {
    warnings.push({
      kind: 'asset',
      code: 'images-not-settled',
      message:
        'The print window did not finish loading every image before the settle timeout; some images may print late or as placeholders.',
    });
  }
  if (summary.rendered && !summary.fontsSettled) {
    warnings.push({
      kind: 'render',
      code: 'fonts-not-settled',
      message:
        'The print window did not finish loading every font before the settle timeout; a font fallback may appear in the PDF.',
    });
  }
  for (const message of summary.consoleErrors) {
    warnings.push({
      kind: 'render',
      code: 'console-error',
      message: `The print window logged an error: ${message}`,
    });
  }
  for (const blockId of summary.modelChecks.unplacedBlockIds) {
    warnings.push({
      kind: 'validation',
      code: 'unplaced-block',
      message: `Block ${blockId} is in the document but was not placed on any derived page.`,
      blockId,
    });
  }
  return warnings;
}

/** Combined preflight decision for one measured/rendered print run. */
export function evaluatePreflight(
  snapshot: ExportSnapshot,
  summary: PrintRunSummary,
): PreflightResult {
  const errors = [...identityErrors(snapshot, summary), ...blockingWarnings(summary)];
  // S3-6: a measured segment that no fragment covers is a lost-content bug,
  // not a warning. The produced PDF text check cannot see a silently dropped
  // segment, so the model sentinel blocks the write.
  if (summary.rendered && !summary.modelChecks.segmentCoverageOk) {
    errors.push({
      kind: 'validation',
      code: 'model-error',
      message: `The measured page model lost or duplicated content: ${summary.modelChecks.segmentCoverageIssues.join('; ')}`,
    });
  }
  return {
    errors,
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
 * page's size/orientation (ADR 0.2 mm rounding tolerance, 0.25 used), real
 * text, and the S2-1 blank-page rule.
 *
 * A page is blank only when the **model** says it has no fragments, no
 * edges/trunks, and no image fragments, or when the produced page has no text
 * items, no image XObjects, and no vector paths. An image-only page is valid
 * even though it has no extractable text; the cheap text check stays a warning.
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
  const modelPages = new Map(summary.pages.map((page) => [page.pageNumber, page]));
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
    const modelPage = modelPages.get(page.pageNumber);
    if (modelPage !== undefined && modelPage.empty) {
      errors.push({
        kind: 'validation',
        code: 'blank-page',
        message: `The paginator produced an empty page ${page.pageNumber} (no fragments, edges, trunks, or images); a blank page is an export failure.`,
        pageNumber: page.pageNumber,
      });
      continue;
    }
    const hasInk =
      page.textItemCount > 0 ||
      !page.hasOperatorList ||
      page.imageCount > 0 ||
      page.pathCount > 0;
    if (!hasInk) {
      errors.push({
        kind: 'validation',
        code: 'blank-page',
        message: `PDF page ${page.pageNumber} is blank (no text, image, or vector content); a blank page is an export failure.`,
        pageNumber: page.pageNumber,
      });
      continue;
    }
    if (page.text.trim().length === 0) {
      // Image-only pages are valid; this is the retained cheap heuristic.
      warnings.push({
        kind: 'validation',
        code: 'textless-page',
        message: `PDF page ${page.pageNumber} has no extractable text; the model page has ${modelPage?.images ?? 0} image fragment(s).`,
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
