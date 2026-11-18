import { describe, expect, it } from 'vitest';
import {
  isAnchorResolutionView,
  isPrintRunSummary,
  type PrintRunSummary,
} from '../src/shared/export';

/**
 * M4c3 S3-2: the hidden-window summary is validated at runtime. A malformed
 * summary must never reach the preflight/print path where a NaN page box could
 * skip the size check.
 */

const A4 = {
  size: 'A4' as const,
  orientation: 'portrait' as const,
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

function valid(): PrintRunSummary {
  return {
    documentId: 'doc-1',
    revision: 1,
    title: 'Contract',
    fingerprint: 'fingerprint-1',
    pageCount: 1,
    pageSetup: A4,
    pageWidthMm: 210,
    pageHeightMm: 297,
    blockingDefects: [],
    defects: [],
    manualBreakWarnings: [],
    anchorWarningBlockIds: [],
    failedAssetIds: [],
    missingAssetIds: [],
    overflowPages: [],
    pages: [
      { pageNumber: 1, fragments: 1, edges: 0, trunks: 0, images: 0, empty: false },
    ],
    modelChecks: {
      blockCount: 1,
      placedBlockCount: 1,
      unplacedBlockIds: [],
      segmentCount: 1,
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
  };
}

describe('isPrintRunSummary', () => {
  it('accepts a complete summary', () => {
    expect(isPrintRunSummary(valid())).toBe(true);
  });

  it('rejects non-finite geometry, missing metrics, and malformed pages', () => {
    expect(isPrintRunSummary({ ...valid(), pageWidthMm: Number.NaN })).toBe(false);
    expect(isPrintRunSummary({ ...valid(), pageHeightMm: undefined })).toBe(false);
    expect(isPrintRunSummary({ ...valid(), metrics: undefined })).toBe(false);
    expect(isPrintRunSummary({ ...valid(), pages: [{ pageNumber: 1 }] })).toBe(false);
    expect(isPrintRunSummary({ ...valid(), modelChecks: { segmentCoverageOk: true } })).toBe(
      false,
    );
    expect(isPrintRunSummary({ ...valid(), pageSetup: { ...A4, margins: {} } })).toBe(false);
    expect(isPrintRunSummary({ ...valid(), rendered: 'yes' })).toBe(false);
    expect(isPrintRunSummary(null)).toBe(false);
  });
});

describe('isAnchorResolutionView', () => {
  const validView = {
    documentId: 'doc-1',
    revision: 4,
    byBlock: {
      block: [
        {
          anchorId: 'a1',
          state: 'resolved',
          range: { kind: 'text', nodePath: [0, 1] },
        },
        { anchorId: 'a2', state: 'ambiguous', range: null },
        { anchorId: 'a3', state: 'block-missing', range: null },
      ],
    },
  };

  it('accepts the semantic projection', () => {
    expect(isAnchorResolutionView(validView)).toBe(true);
    expect(isAnchorResolutionView({ ...validView, revision: undefined })).toBe(true);
  });

  it('rejects a malformed view instead of rendering stale state', () => {
    expect(isAnchorResolutionView(null)).toBe(false);
    expect(isAnchorResolutionView({})).toBe(false);
    expect(isAnchorResolutionView({ ...validView, documentId: undefined })).toBe(false);
    expect(isAnchorResolutionView({ ...validView, revision: '4' })).toBe(false);
    expect(isAnchorResolutionView({ ...validView, byBlock: [] })).toBe(false);
    expect(
      isAnchorResolutionView({
        ...validView,
        byBlock: { block: [{ anchorId: 'a1', state: 'unknown', range: null }] },
      }),
    ).toBe(false);
    expect(
      isAnchorResolutionView({
        ...validView,
        byBlock: { block: [{ anchorId: 'a1', state: 'resolved', range: { kind: 'other' } }] },
      }),
    ).toBe(false);
    expect(
      isAnchorResolutionView({
        ...validView,
        byBlock: {
          block: [
            { anchorId: 'a1', state: 'resolved', range: { kind: 'text', nodePath: ['0'] } },
          ],
        },
      }),
    ).toBe(false);
  });
});
