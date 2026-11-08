/**
 * DOM measurement port for the page/print renderer.
 *
 * The host is offscreen but fully laid out (`visibility: hidden`, not
 * `display: none`) so `getBoundingClientRect()` reports real page typography.
 * Measurement uses the same static segment markup as the page surface and the
 * same layout options as `packages/layout`; there is no second content path.
 *
 * `prepare()` is the asynchronous half: it decodes images and settles fonts in
 * two animation frames before the synchronous layout pass starts. The pure
 * layout engine stays synchronous, exactly as `MeasurementPort` requires.
 */

import type {
  AnchorRecord,
  BlockMeasurement,
  ContentBlock,
  ContentNode,
  LayoutOptions,
  MeasuredAnchor,
  MeasuredSegment,
  MeasurementMode,
  MeasurementPort,
  NoteDocument,
  PageSettings,
} from '@noteforest/layout';
import { pageLayoutOptions } from '@noteforest/layout';
import { applyPageCssVariables, blockContentKey } from './adapter';
import {
  buildSegments,
  fullTableHtml,
  intrinsicCardHtml,
  measurementCardHtml,
  type PageRenderSegment,
  type SegmentOptions,
} from './segments';

const IMAGE_SETTLE_TIMEOUT_MS = 4000;
const FRAME_SETTLE_TIMEOUT_MS = 150;

interface IntrinsicWidths {
  max: number;
  min: number;
  maxHeight: number;
}

export interface DomPageMeasurement extends MeasurementPort {
  /**
   * Render every block once, decode images, and wait for fonts plus two frames.
   * Safe to call repeatedly; caches are invalidated because the settled font
   * metrics may differ from any previous partial pass.
   */
  prepare(blocks: readonly ContentBlock[], signal?: AbortSignal): Promise<void>;
  dispose(): void;
  readonly failedAssetIds: ReadonlySet<string>;
  readonly cacheSize: number;
  readonly measurementHost: HTMLElement;
}

function abortError(): DOMException {
  return new DOMException('Page measurement was superseded.', 'AbortError');
}

function positiveDimension(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Asset ids whose bytes must be decoded before the synchronous layout pass.
 *
 * An image node with both `width` and `height` renders those attributes into the
 * page markup; the replaced element's aspect ratio then comes from the
 * attributes, so its measured box cannot change when bytes arrive. Only images
 * missing one of the two dimensions (or all of them) need a decode. Nodes
 * without an `assetId` render the placeholder and are never requested.
 *
 * The dimensions are the node attributes that `segments.ts` emits, not the
 * asset record: an asset-only dimension never reaches the HTML, so treating it
 * as measured would depend on an unloaded image's intrinsic size.
 */
export function imageAssetIdsToPreload(
  blocks: readonly ContentBlock[],
  assetUrls: Readonly<Record<string, string>>,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const visit = (node: ContentNode): void => {
    if (node.type === 'image') {
      const attrs = node.attrs;
      const assetId = attrs?.['assetId'];
      if (typeof assetId !== 'string' || assetId.length === 0 || seen.has(assetId)) return;
      if (
        positiveDimension(attrs?.['width']) !== undefined &&
        positiveDimension(attrs?.['height']) !== undefined
      ) {
        return;
      }
      const url = assetUrls[assetId];
      if (typeof url !== 'string' || url.length === 0) return;
      seen.add(assetId);
      ids.push(assetId);
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  for (const block of blocks) visit(block.content);
  return ids;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (isAborted(signal)) throw abortError();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

async function settleFrames(signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);
  await Promise.race([nextFrame().then(() => nextFrame()), delay(FRAME_SETTLE_TIMEOUT_MS)]);
  throwIfAborted(signal);
}

async function settleFonts(): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts !== undefined) {
    await document.fonts.ready;
  }
}

function firstTablePaths(content: ContentNode): Array<{ key: string; node: ContentNode }> {
  const tables: Array<{ key: string; node: ContentNode }> = [];
  const walk = (node: ContentNode, path: number[]): void => {
    if (node.type === 'table') {
      tables.push({ key: path.join('.'), node });
      return;
    }
    for (const [index, child] of (node.children ?? []).entries()) {
      walk(child, [...path, index]);
    }
  };
  for (const [index, node] of (content.children ?? []).entries()) {
    walk(node, [index]);
  }
  return tables;
}

export function createDomPageMeasurement(
  noteDocument: NoteDocument,
  assetUrls: Readonly<Record<string, string>>,
  settings: PageSettings,
): DomPageMeasurement {
  const layoutOptions: LayoutOptions = pageLayoutOptions(settings.theme);
  const chrome = 2 * (layoutOptions.cardPadding + layoutOptions.cardBorder);
  const host = document.createElement('div');
  host.className = 'nf-measure-host nf-page-scope';
  host.setAttribute('aria-hidden', 'true');
  // The measurement host consumes exactly the page theme; no static box metric
  // may leak in from styles.css or the shell.
  applyPageCssVariables(host, settings.theme);
  document.body.appendChild(host);

  const resolvedAssets: Record<string, string> = { ...assetUrls };
  const failedAssetIds = new Set<string>();
  const intrinsicCache = new Map<string, IntrinsicWidths>();
  const fixedCache = new Map<string, BlockMeasurement>();

  const anchorsByBlock = new Map<string, AnchorRecord[]>();
  for (const anchor of Object.values(noteDocument.anchors)) {
    const list = anchorsByBlock.get(anchor.blockId) ?? [];
    list.push(anchor);
    anchorsByBlock.set(anchor.blockId, list);
  }

  function optionsFor(block: ContentBlock, tableColumns: Record<string, number[]>): SegmentOptions {
    return {
      assets: resolvedAssets,
      tableColumns,
      anchors: anchorsByBlock.get(block.id) ?? [],
      listIndent: layoutOptions.wrapIndent,
      // Images with both dimensions measure from their attributes; the host
      // must not request (and possibly 404) bytes it does not need.
      requestIntrinsicImages: false,
    };
  }

  async function preloadImages(
    blocks: readonly ContentBlock[],
    signal: AbortSignal | undefined,
  ): Promise<void> {
    throwIfAborted(signal);
    const assetIds = imageAssetIdsToPreload(blocks, resolvedAssets);
    if (assetIds.length === 0) return;

    const wrapper = document.createElement('div');
    const images: Array<{ element: HTMLImageElement; assetId: string }> = [];
    let resolveAborted: (() => void) | undefined;
    const aborted = new Promise<void>((resolve) => {
      resolveAborted = resolve;
    });
    const onAbort = (): void => {
      // Detach immediately so no measurement markup survives the cancel, and
      // resolve the wait instead of leaving it until the image timeout.
      host.remove();
      resolveAborted?.();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      for (const assetId of assetIds) {
        // Never create or point an <img> after abort: the document that owns
        // the asset may already be closing and its protocol store gone.
        if (isAborted(signal)) {
          host.remove();
          return;
        }
        const url = resolvedAssets[assetId];
        if (url === undefined || url.length === 0) continue;
        const image = document.createElement('img');
        image.dataset['preloadAsset'] = assetId;
        image.alt = '';
        image.src = url;
        wrapper.appendChild(image);
        images.push({ element: image, assetId });
      }
      if (isAborted(signal)) {
        host.remove();
        return;
      }
      host.replaceChildren(wrapper);

      const loaded = Promise.all(
        images.map(async ({ element, assetId }) => {
          if (!element.complete) {
            await new Promise<void>((resolve) => {
              element.addEventListener('load', () => resolve(), { once: true });
              element.addEventListener('error', () => resolve(), { once: true });
            });
          }
          if (element.naturalWidth === 0) {
            failedAssetIds.add(assetId);
            delete resolvedAssets[assetId];
            return;
          }
          try {
            if (typeof element.decode === 'function') await element.decode();
          } catch {
            // The load event fired but decode failed; use the same placeholder.
            failedAssetIds.add(assetId);
            delete resolvedAssets[assetId];
          }
        }),
      );
      await Promise.race([loaded, delay(IMAGE_SETTLE_TIMEOUT_MS), aborted]);
      if (isAborted(signal)) {
        host.remove();
        return;
      }
      host.replaceChildren();
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  }

  function measureIntrinsic(block: ContentBlock): IntrinsicWidths {
    const key = `${block.id}:${blockContentKey(block)}`;
    const cached = intrinsicCache.get(key);
    if (cached) return cached;

    const html = intrinsicCardHtml(block, optionsFor(block, {}));
    host.innerHTML = html;
    const card = host.querySelector<HTMLElement>('.nf-measure-card');
    if (card === null) throw new Error(`Measurement host is missing the card for ${block.id}`);
    card.classList.add('nf-width-max');
    const maxWidth = Math.max(1, card.getBoundingClientRect().width - chrome);
    const maxHeight = card.getBoundingClientRect().height;
    card.classList.remove('nf-width-max');
    card.classList.add('nf-width-min');
    const minWidth = Math.max(1, card.getBoundingClientRect().width - chrome);
    card.classList.remove('nf-width-min');
    const widths = { max: maxWidth, min: minWidth, maxHeight };
    intrinsicCache.set(key, widths);
    return widths;
  }

  function measureTableColumns(
    block: ContentBlock,
    contentWidth: number,
  ): Record<string, number[]> {
    const columns: Record<string, number[]> = {};
    const tables = firstTablePaths(block.content);
    if (tables.length === 0) return columns;
    for (const table of tables) {
      const wrapper = document.createElement('div');
      wrapper.className = 'nf-table-measure-container';
      wrapper.style.width = `${contentWidth}px`;
      wrapper.innerHTML = fullTableHtml(table.node, { ...optionsFor(block, {}), tableColumns: {} });
      host.replaceChildren(wrapper);
      const tableElement = wrapper.querySelector<HTMLTableElement>('table');
      if (tableElement === null) continue;
      const firstRow = tableElement.querySelector<HTMLTableRowElement>('tbody tr');
      if (firstRow === null) {
        const count = Number(tableElement.dataset['columns'] ?? '1');
        columns[table.key] = Array.from(
          { length: Math.max(1, count) },
          () => contentWidth / Math.max(1, count),
        );
        continue;
      }
      const widths = [...firstRow.children].map((cell) => cell.getBoundingClientRect().width);
      const total = widths.reduce((sum, width) => sum + width, 0);
      if (total <= 0) continue;
      const scale = contentWidth / total;
      columns[table.key] = widths.map((width) => width * scale);
    }
    host.replaceChildren();
    return columns;
  }

  function measureFixed(block: ContentBlock, contentWidth: number): BlockMeasurement {
    const intrinsic = measureIntrinsic(block);
    const tableColumns = measureTableColumns(block, contentWidth);
    const segments = buildSegments(block, optionsFor(block, tableColumns));
    const cardWidth = contentWidth + chrome;
    host.innerHTML = measurementCardHtml(block, segments);
    const card = host.querySelector<HTMLElement>('.nf-measure-card');
    const content = host.querySelector<HTMLElement>('.nf-block-content');
    if (card === null || content === null) {
      throw new Error(`Measurement host is missing the card for ${block.id}`);
    }
    card.style.width = `${cardWidth}px`;
    const cardRect = card.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const label = card.querySelector<HTMLElement>('.nf-label');

    const measuredSegments: MeasuredSegment[] = [];
    for (const wrapper of content.querySelectorAll<HTMLElement>('[data-seg]')) {
      const index = Number(wrapper.dataset['seg'] ?? '-1');
      if (index < 0) continue;
      const segment = segments[index];
      if (segment === undefined) continue;
      const rect = wrapper.getBoundingClientRect();
      const measured: MeasuredSegment = {
        index,
        kind: segment.kind,
        nodePath: segment.nodePath,
        y: rect.top - contentRect.top,
        height: rect.height,
        breakableBefore: segment.breakableBefore,
      };
      if (segment.tableKey !== undefined) measured.tableKey = segment.tableKey;
      if (segment.rowIndex !== undefined) measured.rowIndex = segment.rowIndex;
      measuredSegments.push(measured);
    }

    const anchors: MeasuredAnchor[] = [];
    const occurrences = new Map<string, number>();
    for (const element of content.querySelectorAll<HTMLElement>('[data-anchor-id]')) {
      const anchorId = element.dataset['anchorId'];
      if (anchorId === undefined || anchorId.length === 0) continue;
      const rect = element.getBoundingClientRect();
      const occurrence = occurrences.get(anchorId) ?? 0;
      occurrences.set(anchorId, occurrence + 1);
      anchors.push({
        anchorId,
        x: rect.left - contentRect.left,
        y: rect.top - contentRect.top,
        width: rect.width,
        height: rect.height,
        occurrence,
      });
    }

    const missingAssetIds = [
      ...new Set(
        [...content.querySelectorAll<HTMLElement>('[data-missing-asset]')]
          .map((element) => element.dataset['missingAsset'])
          .filter((value): value is string => value !== undefined && value.length > 0),
      ),
    ];

    return {
      blockId: block.id,
      mode: { kind: 'fixed', contentWidth },
      cardWidth: cardRect.width,
      contentWidth: contentRect.width,
      contentHeight: contentRect.height,
      contentTop: contentRect.top - cardRect.top,
      labelHeight: label?.getBoundingClientRect().height ?? 0,
      cardHeight: cardRect.height,
      maxContentWidth: intrinsic.max,
      minContentWidth: intrinsic.min,
      segments: measuredSegments,
      anchors,
      tableColumns,
      missingAssetIds,
    };
  }

  function measure(block: ContentBlock, mode: MeasurementMode): BlockMeasurement {
    if (mode.kind === 'fixed') {
      const key = `${block.id}:${blockContentKey(block)}:fixed:${mode.contentWidth.toFixed(3)}`;
      const cached = fixedCache.get(key);
      if (cached !== undefined) return cached;
      const measured = measureFixed(block, mode.contentWidth);
      fixedCache.set(key, measured);
      return measured;
    }
    const intrinsic = measureIntrinsic(block);
    const width = mode.kind === 'max-content' ? intrinsic.max : intrinsic.min;
    return {
      blockId: block.id,
      mode,
      cardWidth: width + chrome,
      contentWidth: width,
      contentHeight: 0,
      contentTop: layoutOptions.cardPadding + layoutOptions.cardBorder,
      labelHeight: 0,
      cardHeight: intrinsic.maxHeight,
      maxContentWidth: intrinsic.max,
      minContentWidth: intrinsic.min,
      segments: [],
      anchors: [],
      tableColumns: {},
      missingAssetIds: [],
    };
  }

  async function prepare(blocks: readonly ContentBlock[], signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    await preloadImages(blocks, signal);
    throwIfAborted(signal);
    // Render every block once so KaTeX and the UI fonts are requested before
    // the first real measurement. The markup is the same card the layout pass
    // measures; no second intrinsic path is introduced.
    const cards = blocks
      .map((block) => intrinsicCardHtml(block, optionsFor(block, {})))
      .join('');
    host.innerHTML = `<div class="nf-measure-settle">${cards}</div>`;
    host.getBoundingClientRect();
    await settleFonts();
    await settleFrames(signal);
    await settleFonts();
    throwIfAborted(signal);
    host.replaceChildren();
    intrinsicCache.clear();
    fixedCache.clear();
  }

  return {
    prepare,
    measure,
    dispose() {
      intrinsicCache.clear();
      fixedCache.clear();
      host.remove();
    },
    get failedAssetIds() {
      return failedAssetIds;
    },
    get cacheSize() {
      return intrinsicCache.size + fixedCache.size;
    },
    measurementHost: host,
  };
}
