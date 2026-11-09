/**
 * Print compositor entry point (M4c1) and on-demand export model builder (M4c2).
 *
 * The hidden export window loads this page and calls
 * `window.__noteforestPrint.build(snapshot)`. It measures the serialized
 * current-document snapshot itself (`createDomPageMeasurement` +
 * `computePageModel`), builds the print model from that same run, renders the
 * fixed sheets, and resolves only after React commit, fonts, KaTeX fonts,
 * images, and two animation frames. The visible Page surface is never required.
 *
 * The legacy `render({ model })` bridge stays for the M4c1 compositor contract;
 * export orchestration, job IDs, `printToPDF`, and file output live in the main
 * process.
 */

import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import 'katex/dist/katex.min.css';
import '../styles.css';
import './print.css';
import type { LayoutDefect, NoteDocument, PageSettings } from '@noteforest/layout';
import {
  contentBlockTitle,
  pageSettingsFingerprint,
  type DerivedPage,
} from '@noteforest/layout';
import {
  buildPrintModel,
  PrintModelIdentityError,
  type PrintModel,
} from '@noteforest/pdf';
import type {
  ExportFailureCode,
  ExportSnapshot,
  PrintBuildResult,
  PrintRunDefect,
  PrintRunMetrics,
  PrintRunSummary,
} from '../../../shared/export';
import { applyDesignTokens } from '../lib/apply-design-tokens';
import { createDomPageMeasurement } from '../page/measurement';
import { computePageModel, type PageModelData } from '../page/model';
import { PrintDocument } from './PrintDocument';

export interface PrintRenderPayload {
  model: PrintModel;
  /** Optional display URLs; defaults to the model's available asset map. */
  assets?: Record<string, string>;
}

export interface NoteforestPrintBridge {
  /** Resolves once the print bundle has evaluated. */
  entryReady: Promise<boolean>;
  /** Measure + render the current-document snapshot; resolves when settled. */
  build: (snapshot: ExportSnapshot) => Promise<PrintBuildResult>;
  /** M4c1 contract: render a supplied model without measuring. */
  render: (payload: PrintRenderPayload) => void;
  clear: () => void;
}

const IMAGE_SETTLE_TIMEOUT_MS = 5000;
const FONT_SETTLE_TIMEOUT_MS = 5000;
const FRAME_SETTLE_TIMEOUT_MS = 500;
const EXPECTED_BYTES_PER_PT = 96 / 72;

applyDesignTokens();

function printRootContainer(): HTMLElement {
  const element = document.getElementById('print-root');
  if (element === null) throw new Error('missing #print-root');
  return element;
}

const container = printRootContainer();
const root = createRoot(container);

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve after `count` animation frames, or `false` when the window never
 * paints them within `timeoutMs`. Hidden windows still fire frames with
 * `backgroundThrottling: false`; the bound keeps a throttled window from
 * hanging an export forever (the summary records the outcome).
 */
function afterFrames(count: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolveFrames) => {
    let frames = 0;
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveFrames(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const tick = (): void => {
      frames += 1;
      if (frames >= count) {
        finish(true);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function settleFonts(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts !== undefined) {
    await Promise.race([document.fonts.ready.then(() => true), delay(FONT_SETTLE_TIMEOUT_MS)]);
  }
}

/** Wait for every rendered image to load and decode (bounded). */
async function settleImages(scope: ParentNode): Promise<void> {
  const images = [...scope.querySelectorAll<HTMLImageElement>('img')];
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolveLoad) => {
          image.addEventListener('load', () => resolveLoad(), { once: true });
          image.addEventListener('error', () => resolveLoad(), { once: true });
        });
      }
      if (typeof image.decode === 'function') {
        try {
          await image.decode();
        } catch {
          // Missing/corrupt assets already render the model placeholder.
        }
      }
    }),
  );
}

function toPrintDefect(defect: LayoutDefect, document: NoteDocument): PrintRunDefect {
  const blockId = defect.blockId;
  const blockTitle =
    blockId === undefined ? undefined : contentBlockTitle(document.blocks[blockId]);
  return {
    code: defect.code,
    severity: defect.blocksExport ? 'blocking' : 'warning',
    message: defect.message,
    ...(blockId === undefined ? {} : { blockId }),
    ...(blockTitle === undefined ? {} : { blockTitle }),
    ...(defect.chapterId === undefined ? {} : { chapterId: defect.chapterId }),
    ...(defect.pageNumber === undefined ? {} : { pageNumber: defect.pageNumber }),
  };
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function probeMetrics(printRoot: HTMLElement, settings: PageSettings): PrintRunMetrics {
  const style = getComputedStyle(printRoot);
  const fontSizePx = Number.parseFloat(style.fontSize);
  const lineHeightPx = Number.parseFloat(style.lineHeight);
  const lineHeightRatio =
    Number.isFinite(lineHeightPx) && fontSizePx > 0 ? lineHeightPx / fontSizePx : 0;
  const expectedFontSizePx =
    settings.theme.bodyPt * settings.theme.fontScale * EXPECTED_BYTES_PER_PT;
  const expectedLineHeightRatio = settings.theme.bodyLine;
  const fontOk = Math.abs(fontSizePx - expectedFontSizePx) <= 0.06;
  const lineOk = Math.abs(lineHeightRatio - expectedLineHeightRatio) <= 0.01;
  return {
    fontSizePx,
    lineHeightRatio,
    expectedFontSizePx,
    expectedLineHeightRatio,
    ok: fontOk && lineOk,
  };
}

function summarize(input: {
  model: PrintModel;
  document: NoteDocument;
  rendered: boolean;
  framesSettled: boolean;
  metrics: PrintRunMetrics | null;
  measureMs: number;
  settleMs: number;
}): PrintRunSummary {
  const { model, document } = input;
  const anchorWarningBlockIds = uniqueSorted(
    model.anchors.filter((anchor) => anchor.state !== 'resolved').map((anchor) => anchor.blockId),
  );
  return {
    documentId: model.documentId,
    revision: model.revision ?? null,
    title: model.documentTitle,
    fingerprint: model.fingerprint,
    pageCount: model.pageCount,
    pageSetup: model.pageSetup,
    pageWidthMm: model.geometry.pageWidthMm,
    pageHeightMm: model.geometry.pageHeightMm,
    blockingDefects: model.blockingDefects.map((defect) => toPrintDefect(defect, document)),
    defects: model.defects.map((defect) => toPrintDefect(defect, document)),
    manualBreakWarnings: model.manualBreakWarnings.map((defect) =>
      toPrintDefect(defect, document),
    ),
    anchorWarningBlockIds,
    failedAssetIds: uniqueSorted(model.failedAssetIds),
    missingAssetIds: uniqueSorted(model.missingAssetIds),
    overflowPages: model.pages.filter((page) => page.overflow).map((page) => page.pageNumber),
    rendered: input.rendered,
    framesSettled: input.framesSettled,
    metrics: input.metrics,
    timings: { measureMs: input.measureMs, settleMs: input.settleMs },
  };
}

function isExportSnapshot(value: unknown): value is ExportSnapshot {
  if (value === null || typeof value !== 'object') return false;
  const snapshot = value as Partial<ExportSnapshot>;
  return (
    typeof snapshot.packagePath === 'string' &&
    typeof snapshot.documentId === 'string' &&
    typeof snapshot.settingsFingerprint === 'string' &&
    typeof snapshot.document === 'object' &&
    snapshot.document !== null &&
    typeof snapshot.settings === 'object' &&
    snapshot.settings !== null &&
    typeof snapshot.assetUrls === 'object' &&
    snapshot.assetUrls !== null &&
    Array.isArray(snapshot.failedAssetIds)
  );
}

function failed(
  code: ExportFailureCode,
  message: string,
): { ok: false; code: ExportFailureCode; message: string } {
  return { ok: false, code, message };
}

/**
 * Measure, preflight, render, and settle the current-document snapshot.
 *
 * A blocked model (blocking defects or an overflowing page) is returned as a
 * summary with `rendered: false`; the main process refuses to print it and
 * reports the affected blocks. An empty document is a typed failure.
 */
async function build(snapshot: ExportSnapshot): Promise<PrintBuildResult> {
  if (!isExportSnapshot(snapshot)) {
    return failed('invalid-input', 'The export snapshot is incomplete or malformed.');
  }
  if (snapshot.settingsFingerprint !== pageSettingsFingerprint(snapshot.settings)) {
    return failed(
      'settings-mismatch',
      'The export snapshot settings do not match its settings fingerprint.',
    );
  }

  const measureStart = performance.now();
  const measurement = createDomPageMeasurement(
    snapshot.document,
    snapshot.assetUrls,
    snapshot.settings,
  );
  let measured: PageModelData;
  let model: PrintModel;
  let measuredFailedAssetIds: string[] = [];
  try {
    await measurement.prepare(Object.values(snapshot.document.blocks));
    measuredFailedAssetIds = [...measurement.failedAssetIds];
    measured = computePageModel(snapshot.document, measurement, snapshot.settings);
    model = buildPrintModel(
      snapshot.document,
      measured.layout,
      {
        pages: measured.pages,
        pageCount: measured.pageCount,
        defects: measured.defects,
        manualBreakWarnings: measured.manualBreakWarnings,
      },
      {
        settings: snapshot.settings,
        // Required (M4c2 R1): the fingerprint from this exact measured run.
        pageModelFingerprint: measured.settingsFingerprint,
        failedAssetIds: uniqueSorted([...snapshot.failedAssetIds, ...measuredFailedAssetIds]),
        assetUrls: snapshot.assetUrls,
      },
    );
  } catch (error) {
    const code: ExportFailureCode =
      error instanceof PrintModelIdentityError ? 'model-mismatch' : 'model-error';
    return failed(code, messageOf(error));
  } finally {
    measurement.dispose();
  }
  const measureMs = performance.now() - measureStart;

  if (model.pageCount === 0) {
    return failed('empty-document', 'The document has no page content to export.');
  }

  const blocked =
    model.blockingDefects.length > 0 || model.pages.some((page: DerivedPage) => page.overflow);
  if (blocked) {
    // Never render or print a page set that the paginator marked as clipping.
    return {
      ok: true,
      summary: summarize({
        model,
        document: snapshot.document,
        rendered: false,
        framesSettled: false,
        metrics: null,
        measureMs,
        settleMs: 0,
      }),
    };
  }

  const settleStart = performance.now();
  flushSync(() => {
    root.render(<PrintDocument model={model} assets={model.assetUrls} />);
  });
  const printRoot = container.querySelector<HTMLElement>('[data-print-root]');
  if (printRoot === null) {
    return failed('model-error', 'The print compositor did not commit a print root.');
  }

  await Promise.race([settleImages(printRoot), delay(IMAGE_SETTLE_TIMEOUT_MS)]);
  await settleFonts();
  // Fonts can change wrapping and load late images; settle once more after them.
  await Promise.race([settleImages(printRoot), delay(IMAGE_SETTLE_TIMEOUT_MS)]);
  const framesSettled = await afterFrames(2, FRAME_SETTLE_TIMEOUT_MS);
  await settleFonts();
  const settleMs = performance.now() - settleStart;

  const metrics = probeMetrics(printRoot, snapshot.settings);
  document.body.dataset.printReady = '1';
  return {
    ok: true,
    summary: summarize({
      model,
      document: snapshot.document,
      rendered: true,
      framesSettled,
      metrics,
      measureMs,
      settleMs,
    }),
  };
}

const entryReady = Promise.resolve(true);

window.__noteforestPrint = {
  entryReady,
  build,
  render(payload: PrintRenderPayload): void {
    if (payload?.model === undefined) {
      throw new Error('Print render requires a PrintModel.');
    }
    root.render(<PrintDocument model={payload.model} assets={payload.assets} />);
  },
  clear(): void {
    root.render(null);
    delete document.body.dataset.printReady;
  },
};

// M4c2 waits for this marker (bundle loaded) before calling `build`.
document.body.dataset.printEntry = 'ready';
