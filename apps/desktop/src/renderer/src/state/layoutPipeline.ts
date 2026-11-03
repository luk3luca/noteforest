import {
  layoutDocument,
  paginate,
  type ContinuousLayout,
  type NoteDocument,
  type PaginatedDocument,
} from '@noteforest/layout';
import { buildPrintModel, type PrintModel } from '@noteforest/pdf';
import { createDomMeasurement } from '../content/measurement';
import { buildSegments, type RenderSegment } from '../content/segments';

export interface LayoutMetrics {
  fixtureFile: string;
  blockCount: number;
  chapterCount: number;
  pageCount: number;
  measurementCalls: number;
  measurementCacheEntries: number;
  coldLayoutMs: number;
  warmMedianMs: number;
  warmP95Ms: number;
  paginateMs: number;
  renderDataMs: number;
  totalMs: number;
  heapMB: number | null;
}

export interface LayoutRun {
  layout: ContinuousLayout;
  pages: PaginatedDocument;
  printModel: PrintModel;
  segmentsByBlock: Record<string, RenderSegment[]>;
  metrics: LayoutMetrics;
}

export interface LayoutOnly {
  layout: ContinuousLayout;
  pages: PaginatedDocument;
  coldLayoutMs: number;
  paginateMs: number;
}

function now(): number {
  return performance.now();
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

export function layoutOnly(document: NoteDocument, assets: Record<string, string>): LayoutOnly {
  const adapter = createDomMeasurement(document, assets);
  try {
    const start = now();
    const layout = layoutDocument(document, adapter);
    const coldLayoutMs = now() - start;
    const pageStart = now();
    const pages = paginate(layout, document);
    const paginateMs = now() - pageStart;
    return { layout, pages, coldLayoutMs, paginateMs };
  } finally {
    adapter.measurementHost.remove();
  }
}

export function runLayoutPipeline(
  file: string,
  document: NoteDocument,
  assets: Record<string, string>,
): LayoutRun {
  const started = now();
  const adapter = createDomMeasurement(document, assets);
  try {
    const coldStart = now();
    const layout = layoutDocument(document, adapter);
    const coldLayoutMs = now() - coldStart;

    const warmTimes: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const warmStart = now();
      layoutDocument(document, adapter);
      warmTimes.push(now() - warmStart);
    }

    const pageStart = now();
    const pages = paginate(layout, document);
    const paginateMs = now() - pageStart;

    const renderStart = now();
    const printModel = buildPrintModel(document, layout, pages);
    const segmentsByBlock: Record<string, RenderSegment[]> = {};
    for (const [blockId, block] of Object.entries(document.blocks)) {
      const placed = layout.blockById[blockId];
      if (!placed) continue;
      segmentsByBlock[blockId] = buildSegments(block, {
        document,
        assets,
        tableColumns: placed.measurement.tableColumns,
      });
    }
    const renderDataMs = now() - renderStart;

    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return {
      layout,
      pages,
      printModel,
      segmentsByBlock,
      metrics: {
        fixtureFile: file,
        blockCount: layout.blocks.length,
        chapterCount: layout.chapters.length,
        pageCount: pages.pageCount,
        measurementCalls: layout.measurementCalls,
        measurementCacheEntries: adapter.cacheSize,
        coldLayoutMs,
        warmMedianMs: percentile(warmTimes, 0.5),
        warmP95Ms: percentile(warmTimes, 0.95),
        paginateMs,
        renderDataMs,
        totalMs: now() - started,
        heapMB: heap ? Math.round((heap.usedJSHeapSize / 1024 / 1024) * 10) / 10 : null,
      },
    };
  } finally {
    adapter.measurementHost.remove();
  }
}

export async function prepareFonts(): Promise<void> {
  const families = [
    'KaTeX_AMS',
    'KaTeX_Caligraphic',
    'KaTeX_Fraktur',
    'KaTeX_Main',
    'KaTeX_Math',
    'KaTeX_SansSerif',
    'KaTeX_Script',
    'KaTeX_Size1',
    'KaTeX_Size2',
    'KaTeX_Size3',
    'KaTeX_Size4',
    'KaTeX_Typewriter',
  ];
  await Promise.all(
    families.map((family) => document.fonts.load(`16px "${family}"`).catch(() => [])),
  );
  await document.fonts.ready;
}

export async function prepareAssets(assets: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.values(assets).map(
      (src) =>
        new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => resolve();
          image.src = src;
          if (image.complete) resolve();
        }),
    ),
  );
}
