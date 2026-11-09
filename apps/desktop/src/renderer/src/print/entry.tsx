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
import type {
  ContentNode,
  LayoutDefect,
  NoteDocument,
  PageSettings,
} from '@noteforest/layout';
import {
  contentBlockTitle,
  effectivePageTheme,
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
  PrintRunModelChecks,
  PrintRunPageSummary,
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

async function settleFonts(): Promise<boolean> {
  if (typeof document === 'undefined' || document.fonts === undefined) return true;
  return Promise.race([
    document.fonts.ready.then(() => true),
    delay(FONT_SETTLE_TIMEOUT_MS).then(() => false),
  ]);
}

interface ImageSettleResult {
  /** Asset ids whose bytes failed to load or decode after the print commit. */
  failedAssetIds: string[];
  /** False when at least one image did not finish within the settle bound. */
  settled: boolean;
}

/**
 * Wait for every rendered image to load and decode (bounded) and report the
 * failures (S2-2). Dimensioned images are skipped by the measurement preload,
 * so this is the only point that sees a post-open delete: `naturalWidth === 0`
 * or a rejected `decode()` is a failed asset, not a browser broken-image glyph.
 */
async function settleImages(scope: ParentNode): Promise<ImageSettleResult> {
  const images = [...scope.querySelectorAll<HTMLImageElement>('img[data-asset-id]')];
  const failed = new Set<string>();
  let settled = true;
  await Promise.all(
    images.map(async (image) => {
      const assetId = image.dataset['assetId'];
      if (!image.complete) {
        const loaded = await new Promise<boolean>((resolveLoad) => {
          let done = false;
          const finish = (value: boolean): void => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            image.removeEventListener('load', onLoad);
            image.removeEventListener('error', onError);
            resolveLoad(value);
          };
          const onLoad = (): void => finish(true);
          const onError = (): void => finish(true);
          const timer = setTimeout(() => finish(false), IMAGE_SETTLE_TIMEOUT_MS);
          image.addEventListener('load', onLoad, { once: true });
          image.addEventListener('error', onError, { once: true });
        });
        if (!loaded) {
          settled = false;
          return;
        }
      }
      if (image.naturalWidth === 0) {
        if (assetId !== undefined && assetId.length > 0) failed.add(assetId);
        return;
      }
      if (typeof image.decode === 'function') {
        try {
          await image.decode();
        } catch {
          if (assetId !== undefined && assetId.length > 0) failed.add(assetId);
        }
      }
    }),
  );
  return { failedAssetIds: [...failed].sort(), settled };
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

function countImageNodes(content: ContentNode | undefined): number {
  if (content === undefined) return 0;
  let count = content.type === 'image' ? 1 : 0;
  for (const child of content.children ?? []) count += countImageNodes(child);
  return count;
}

/**
 * Per-page model content (S2-1). A page is blank only when the model says it
 * has no fragments, no edges/trunks, and no image fragments; an image-only page
 * is valid even though its extracted text may be empty.
 */
function summarizePages(model: PrintModel): PrintRunPageSummary[] {
  return model.pages.map((page) => {
    const fragments = page.fragments.length;
    const edges = page.edges.length;
    const trunks = page.trunks.length;
    const images = page.fragments.reduce(
      (total, fragment) =>
        total + countImageNodes(model.document.blocks[fragment.blockId]?.content),
      0,
    );
    return {
      pageNumber: page.pageNumber,
      fragments,
      edges,
      trunks,
      images,
      empty: fragments === 0 && edges === 0 && trunks === 0 && images === 0,
    };
  });
}

/**
 * Model sentinels (S3-6): every canonical block is placed and every measured
 * segment is covered by exactly one fragment. A gap is an export error; the
 * produced-PDF text check alone would not catch a silently lost segment.
 */
function modelChecks(model: PrintModel): PrintRunModelChecks {
  const fragmentsByBlock = new Map<string, Array<{ startSegment: number; endSegment: number }>>();
  for (const page of model.pages) {
    for (const fragment of page.fragments) {
      const list = fragmentsByBlock.get(fragment.blockId) ?? [];
      list.push({ startSegment: fragment.startSegment, endSegment: fragment.endSegment });
      fragmentsByBlock.set(fragment.blockId, list);
    }
  }
  const unplacedBlockIds = Object.keys(model.document.blocks)
    .filter((blockId) => !fragmentsByBlock.has(blockId))
    .sort();
  const segmentCoverageIssues: string[] = [];
  let segmentCount = 0;
  for (const block of Object.values(model.blocks)) {
    const measured = block.measurement.segments;
    segmentCount += measured.length;
    if (measured.length === 0) continue;
    const fragments = (fragmentsByBlock.get(block.blockId) ?? []).sort(
      (left, right) => left.startSegment - right.startSegment,
    );
    let next = 0;
    for (const fragment of fragments) {
      if (fragment.startSegment !== next) {
        segmentCoverageIssues.push(
          `${block.blockId}: expected segment ${next}, fragment starts at ${fragment.startSegment}`,
        );
        break;
      }
      if (fragment.endSegment <= fragment.startSegment) {
        segmentCoverageIssues.push(`${block.blockId}: fragment has an empty segment range`);
        break;
      }
      next = fragment.endSegment;
    }
    if (next !== measured.length) {
      segmentCoverageIssues.push(
        `${block.blockId}: fragments cover ${next}/${measured.length} segments`,
      );
    }
  }
  return {
    blockCount: Object.keys(model.document.blocks).length,
    placedBlockCount: fragmentsByBlock.size,
    unplacedBlockIds,
    segmentCount,
    segmentCoverageOk: segmentCoverageIssues.length === 0,
    segmentCoverageIssues,
  };
}

/** Pages whose rendered fragments extend past the fixed content box (S3-6). */
function detectPrintOverflow(scope: HTMLElement): number[] {
  const pages: number[] = [];
  for (const content of scope.querySelectorAll<HTMLElement>('[data-print-content]')) {
    const pageNumber = Number(content.dataset['pageContent'] ?? '0');
    let overflow = false;
    for (const fragment of content.querySelectorAll<HTMLElement>('[data-print-fragment]')) {
      if (fragment.offsetTop + fragment.offsetHeight > content.clientHeight + 1) {
        overflow = true;
        break;
      }
    }
    if (overflow) pages.push(pageNumber);
  }
  return pages.sort((left, right) => left - right);
}

function probeMetrics(printRoot: HTMLElement, settings: PageSettings): PrintRunMetrics {
  const style = getComputedStyle(printRoot);
  const fontSizePx = Number.parseFloat(style.fontSize);
  const lineHeightPx = Number.parseFloat(style.lineHeight);
  const lineHeightRatio =
    Number.isFinite(lineHeightPx) && fontSizePx > 0 ? lineHeightPx / fontSizePx : 0;
  // The printed root uses the density lens (M4d1), so the probe must compare
  // against the effective theme, not the raw stored values.
  const effective = effectivePageTheme(settings.theme);
  const expectedFontSizePx = effective.bodyPt * effective.fontScale * EXPECTED_BYTES_PER_PT;
  const expectedLineHeightRatio = effective.bodyLine;
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
  failedAssetIds?: readonly string[];
  imagesSettled?: boolean;
  fontsSettled?: boolean;
  printOverflowPages?: readonly number[];
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
    failedAssetIds: uniqueSorted([...model.failedAssetIds, ...(input.failedAssetIds ?? [])]),
    missingAssetIds: uniqueSorted(model.missingAssetIds),
    overflowPages: model.pages.filter((page) => page.overflow).map((page) => page.pageNumber),
    pages: summarizePages(model),
    modelChecks: modelChecks(model),
    rendered: input.rendered,
    framesSettled: input.framesSettled,
    imagesSettled: input.imagesSettled ?? true,
    fontsSettled: input.fontsSettled ?? true,
    consoleErrors: [],
    printOverflowPages: [...new Set(input.printOverflowPages ?? [])].sort(
      (left, right) => left - right,
    ),
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
  let printRoot: HTMLElement | null = null;
  let imagesSettled = true;
  let fontsSettled = true;
  let framesSettled = false;
  let metrics: PrintRunMetrics | null = null;
  const settleFailedAssetIds = new Set<string>(model.failedAssetIds);
  const renderAssets: Record<string, string> = { ...model.assetUrls };
  const renderPrint = (): HTMLElement | null => {
    // A fresh object each render: `PrintDocument` memoizes the projection on
    // the assets reference, so mutating one map would keep the broken `<img>`.
    const assets = { ...renderAssets };
    flushSync(() => {
      root.render(<PrintDocument model={model} assets={assets} />);
    });
    printRoot = container.querySelector<HTMLElement>('[data-print-root]');
    return printRoot;
  };
  try {
    let rootElement = renderPrint();
    if (rootElement === null) {
      return failed('model-error', 'The print compositor did not commit a print root.');
    }
    // A dimensioned image is skipped by the measurement preload; this settle is
    // the only place a post-open delete is detected (S2-2). Re-render with the
    // failed asset removed so the app placeholder replaces the broken glyph.
    let first = await settleImages(rootElement);
    imagesSettled = imagesSettled && first.settled;
    let newFailures = first.failedAssetIds.filter((assetId) => !settleFailedAssetIds.has(assetId));
    if (newFailures.length > 0) {
      for (const assetId of newFailures) {
        settleFailedAssetIds.add(assetId);
        delete renderAssets[assetId];
      }
      rootElement = renderPrint() ?? rootElement;
      const second = await settleImages(rootElement);
      imagesSettled = imagesSettled && second.settled;
      for (const assetId of second.failedAssetIds) settleFailedAssetIds.add(assetId);
    }
    fontsSettled = await settleFonts();
    // Fonts can change wrapping and load late images; settle once more after them.
    const late = await settleImages(rootElement);
    imagesSettled = imagesSettled && late.settled;
    newFailures = late.failedAssetIds.filter((assetId) => !settleFailedAssetIds.has(assetId));
    if (newFailures.length > 0) {
      for (const assetId of newFailures) {
        settleFailedAssetIds.add(assetId);
        delete renderAssets[assetId];
      }
      rootElement = renderPrint() ?? rootElement;
      const final = await settleImages(rootElement);
      imagesSettled = imagesSettled && final.settled;
      for (const assetId of final.failedAssetIds) settleFailedAssetIds.add(assetId);
      fontsSettled = (await settleFonts()) && fontsSettled;
    }
    framesSettled = await afterFrames(2, FRAME_SETTLE_TIMEOUT_MS);
    fontsSettled = (await settleFonts()) && fontsSettled;
    metrics = probeMetrics(rootElement, snapshot.settings);
  } catch (error) {
    // A React render/settle throw is a typed render failure, not `internal-error`
    // (S3-8); the job still deletes the temp file and never writes the output.
    return failed('render-error', messageOf(error));
  }
  const settleMs = performance.now() - settleStart;
  const printRootElement = printRoot;
  if (printRootElement === null) {
    return failed('model-error', 'The print compositor did not commit a print root.');
  }
  const printOverflowPages = detectPrintOverflow(printRootElement);

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
      failedAssetIds: [...settleFailedAssetIds],
      imagesSettled,
      fontsSettled,
      printOverflowPages,
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
