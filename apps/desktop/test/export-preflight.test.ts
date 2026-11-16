import { describe, expect, it } from 'vitest';
import type { NoteDocument, PageSetup } from '@noteforest/layout';
import type {
  ExportSnapshot,
  PrintRunSummary,
} from '../src/shared/export';
import { evaluatePreflight, pdfOptionsFor, validateProducedPdf } from '../src/main/export-preflight';

const A4_LANDSCAPE: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

function snapshot(overrides: Partial<ExportSnapshot> = {}): ExportSnapshot {
  return {
    packagePath: '/library/export-test',
    documentId: 'doc-1',
    revision: 4,
    title: 'Export test',
    document: {} as NoteDocument,
    settings: {
      setup: A4_LANDSCAPE,
      theme: {} as ExportSnapshot['settings']['theme'],
      manualBreakBeforeBlockIds: [],
    },
    settingsFingerprint: 'fingerprint-1',
    assetUrls: {},
    failedAssetIds: [],
    ...overrides,
  };
}

function summary(overrides: Partial<PrintRunSummary> = {}): PrintRunSummary {
  return {
    documentId: 'doc-1',
    revision: 4,
    title: 'Export test',
    fingerprint: 'fingerprint-1',
    pageCount: 2,
    pageSetup: A4_LANDSCAPE,
    pageWidthMm: 297,
    pageHeightMm: 210,
    blockingDefects: [],
    defects: [],
    manualBreakWarnings: [],
    anchorWarningBlockIds: [],
    failedAssetIds: [],
    missingAssetIds: [],
    overflowPages: [],
    pages: [
      { pageNumber: 1, fragments: 1, edges: 0, trunks: 0, images: 0, empty: false },
      { pageNumber: 2, fragments: 1, edges: 0, trunks: 0, images: 0, empty: false },
    ],
    modelChecks: {
      blockCount: 2,
      placedBlockCount: 2,
      unplacedBlockIds: [],
      segmentCount: 2,
      segmentCoverageOk: true,
      segmentCoverageIssues: [],
    },
    rendered: true,
    framesSettled: true,
    imagesSettled: true,
    fontsSettled: true,
    consoleErrors: [],
    printOverflowPages: [],
    metrics: {
      fontSizePx: 12,
      lineHeightRatio: 1.3,
      expectedFontSizePx: 12,
      expectedLineHeightRatio: 1.3,
      ok: true,
    },
    timings: { measureMs: 5, settleMs: 3 },
    ...overrides,
  };
}

describe('pdfOptionsFor', () => {
  it('uses the resolved page setup, scale 1, print backgrounds, and numeric zero margins', () => {
    const options = pdfOptionsFor(summary());
    expect(options).toEqual({
      pageSize: 'A4',
      landscape: true,
      scale: 1,
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      displayHeaderFooter: false,
      generateTaggedPDF: false,
    });
  });

  it('maps every page size and orientation without a marginType', () => {
    const a5 = pdfOptionsFor(
      summary({
        pageSetup: {
          size: 'A5',
          orientation: 'portrait',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
      }),
    );
    expect(a5.pageSize).toBe('A5');
    expect(a5.landscape).toBe(false);
    const letter = pdfOptionsFor(
      summary({
        pageSetup: {
          size: 'Letter',
          orientation: 'landscape',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
      }),
    );
    expect(letter.pageSize).toBe('Letter');
    expect(letter.landscape).toBe(true);
    expect('marginType' in letter).toBe(false);
  });
});

describe('evaluatePreflight', () => {
  it('refuses a blocking defect and names the affected block', () => {
    const result = evaluatePreflight(
      snapshot(),
      summary({
        blockingDefects: [
          {
            code: 'no-safe-break',
            severity: 'blocking',
            message: 'Block tall has no safe break inside the page content height.',
            blockId: 'tall',
            blockTitle: 'A very tall block',
            pageNumber: 2,
          },
        ],
      }),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      kind: 'blocking-defect',
      code: 'preflight-blocked',
      blockId: 'tall',
      blockTitle: 'A very tall block',
    });
    expect(result.errors[0]!.message).toBe('A block doesn’t fit the page.');
  });

  it('refuses an overflowing page', () => {
    const result = evaluatePreflight(snapshot(), summary({ overflowPages: [3] }));
    expect(result.errors).toEqual([
      expect.objectContaining({ kind: 'page-overflow', pageNumber: 3 }),
    ]);
  });

  it('does not duplicate the overflow warning for a page with a blocking defect', () => {
    const result = evaluatePreflight(
      snapshot(),
      summary({
        overflowPages: [2],
        blockingDefects: [
          {
            code: 'no-safe-break',
            severity: 'blocking',
            message: 'Block tall has no safe break inside the page content height.',
            blockId: 'tall',
            blockTitle: 'A very tall block',
            pageNumber: 2,
          },
        ],
      }),
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.kind).toBe('blocking-defect');
  });

  it('surfaces manual-break, anchor, asset, and layout warnings without blocking', () => {
    const result = evaluatePreflight(
      snapshot(),
      summary({
        manualBreakWarnings: [
          {
            code: 'impossible-hint',
            severity: 'warning',
            message: 'Manual break hint names unknown block ghost; it is ignored.',
            blockId: 'ghost',
          },
        ],
        anchorWarningBlockIds: ['broken-child'],
        failedAssetIds: ['failed-image'],
        missingAssetIds: ['missing-image'],
        defects: [
          {
            code: 'broken-anchor',
            severity: 'warning',
            message: 'Anchor a1 is broken.',
            blockId: 'parent',
          },
          {
            code: 'empty-chapter',
            severity: 'warning',
            message: 'Chapter 2 is empty.',
          },
        ],
      }),
    );
    expect(result.errors).toEqual([]);
    const kinds = result.warnings.map((warning) => warning.kind);
    expect(kinds).toContain('manual-break');
    expect(kinds).toContain('anchor');
    expect(kinds.filter((kind) => kind === 'asset')).toHaveLength(2);
    expect(kinds).toContain('layout-warning');
    // broken-anchor is represented once as the anchor warning, not duplicated.
    expect(result.warnings.filter((warning) => warning.code === 'broken-anchor')).toHaveLength(0);
  });

  it('refuses a document/settings/revision mismatch', () => {
    const documentMismatch = evaluatePreflight(
      snapshot(),
      summary({ documentId: 'other-document' }),
    );
    expect(documentMismatch.errors[0]).toMatchObject({ code: 'document-mismatch' });
    const revisionMismatch = evaluatePreflight(snapshot(), summary({ revision: 5 }));
    expect(revisionMismatch.errors[0]).toMatchObject({ code: 'document-mismatch' });
    const settingsMismatch = evaluatePreflight(
      snapshot(),
      summary({ fingerprint: 'other-fingerprint' }),
    );
    expect(settingsMismatch.errors[0]).toMatchObject({ code: 'settings-mismatch' });
  });

  it('refuses a rendered run whose theme metrics do not match', () => {
    const result = evaluatePreflight(
      snapshot(),
      summary({
        metrics: {
          fontSizePx: 14,
          lineHeightRatio: 1.6,
          expectedFontSizePx: 12,
          expectedLineHeightRatio: 1.3,
          ok: false,
        },
      }),
    );
    expect(result.errors[0]).toMatchObject({ code: 'settings-mismatch' });
    expect(result.errors[0]!.message).toBe('The print layout doesn’t match the page settings.');
  });
});

describe('validateProducedPdf', () => {
  const pages = (count: number, widthMm = 297, heightMm = 210) =>
    Array.from({ length: count }, (_, index) => ({
      pageNumber: index + 1,
      widthPt: (widthMm * 72) / 25.4,
      heightPt: (heightMm * 72) / 25.4,
      widthMm,
      heightMm,
      text: `Page ${index + 1} body text`,
      textItemCount: 1,
      imageCount: 0,
      pathCount: 0,
      hasOperatorList: true,
    }));

  const inspection = (overrides: {
    pageCount?: number;
    pages?: ReturnType<typeof pages>;
    text?: string;
    missingGlyphCount?: number;
  } = {}) => {
    const inspected = overrides.pages ?? pages(overrides.pageCount ?? 2);
    const text = overrides.text ?? inspected.map((page) => page.text).join('\n');
    return {
      pageCount: overrides.pageCount ?? inspected.length,
      pages: inspected,
      text,
      textItems: [],
      missingGlyphCount: overrides.missingGlyphCount ?? 0,
    };
  };

  it('accepts the exact page count and resolved geometry (ADR tolerance)', () => {
    const result = validateProducedPdf(inspection(), summary());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    // Chromium's A5 rounding (148.17 × 209.89) is inside the 0.25 mm bound.
    const a5 = validateProducedPdf(
      inspection({ pages: pages(2, 148.17, 209.89) }),
      summary({
        pageSetup: {
          size: 'A5',
          orientation: 'portrait',
          margins: { top: 12, right: 12, bottom: 12, left: 12 },
        },
        pageWidthMm: 148,
        pageHeightMm: 210,
      }),
    );
    expect(a5.ok).toBe(true);
  });

  it('fails on a page-count mismatch', () => {
    const result = validateProducedPdf(inspection({ pageCount: 3, pages: pages(3) }), summary());
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: 'validation-failed' });
    expect(result.errors[0]!.message).toContain('3 pages');
  });

  it('fails on a page-size mismatch', () => {
    const result = validateProducedPdf(
      inspection({ pages: pages(2, 210, 297) }),
      summary(),
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.message).toBe('Page 1 has the wrong size.');
  });

  it('fails a truly blank produced page (S2-1) but accepts an image-only page', () => {
    const noText = validateProducedPdf(inspection({ text: '' }), summary());
    expect(noText.ok).toBe(false);

    const blank = validateProducedPdf(
      inspection({
        pages: [
          { ...pages(1)[0]!, text: 'First page' },
          {
            ...pages(1)[0]!,
            pageNumber: 2,
            text: '',
            textItemCount: 0,
            imageCount: 0,
            pathCount: 0,
          },
        ],
        pageCount: 2,
      }),
      summary(),
    );
    expect(blank.ok).toBe(false);
    expect(blank.errors[0]).toMatchObject({ code: 'blank-page', pageNumber: 2 });

    const imageOnly = validateProducedPdf(
      inspection({
        pages: [
          { ...pages(1)[0]!, text: 'First page' },
          {
            ...pages(1)[0]!,
            pageNumber: 2,
            text: '',
            textItemCount: 0,
            imageCount: 1,
            pathCount: 0,
          },
        ],
        pageCount: 2,
      }),
      summary({
        pages: [
          { pageNumber: 1, fragments: 1, edges: 0, trunks: 0, images: 0, empty: false },
          { pageNumber: 2, fragments: 1, edges: 0, trunks: 0, images: 1, empty: false },
        ],
      }),
    );
    expect(imageOnly.ok).toBe(true);
    expect(imageOnly.warnings[0]).toMatchObject({ code: 'textless-page', pageNumber: 2 });
  });

  it('fails a page the model classifies as empty even when chrome text exists', () => {
    const result = validateProducedPdf(
      inspection({
        pages: [
          { ...pages(1)[0]!, text: 'First page' },
          { ...pages(1)[0]!, pageNumber: 2, text: 'Page 2 of 2' },
        ],
        pageCount: 2,
      }),
      summary({
        pages: [
          { pageNumber: 1, fragments: 1, edges: 0, trunks: 0, images: 0, empty: false },
          { pageNumber: 2, fragments: 0, edges: 0, trunks: 0, images: 0, empty: true },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: 'blank-page', pageNumber: 2 });
    expect(result.errors[0]!.message).toBe('Page 2 came out blank, so the export stopped.');
  });

  it('blocks a model with lost segment coverage (S3-6)', () => {
    const result = evaluatePreflight(
      snapshot(),
      summary({
        modelChecks: {
          blockCount: 2,
          placedBlockCount: 1,
          unplacedBlockIds: ['lost-block'],
          segmentCount: 4,
          segmentCoverageOk: false,
          segmentCoverageIssues: ['block-1: fragments cover 2/4 segments'],
        },
      }),
    );
    expect(result.errors.some((error) => error.code === 'model-error')).toBe(true);
    expect(result.warnings.some((warning) => warning.code === 'unplaced-block')).toBe(true);
  });

  it('surfaces settle timeouts and print-window console errors (S3-5/S3-6)', () => {
    const result = evaluatePreflight(
      snapshot(),
      summary({
        imagesSettled: false,
        fontsSettled: false,
        consoleErrors: ['Uncaught TypeError: boom'],
        printOverflowPages: [2],
      }),
    );
    expect(result.errors.some((error) => error.code === 'preflight-blocked')).toBe(true);
    const codes = result.warnings.map((warning) => warning.code);
    expect(codes).toContain('images-not-settled');
    expect(codes).toContain('fonts-not-settled');
    expect(codes).toContain('console-error');
  });
});
