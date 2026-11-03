import {
  DEFAULT_LAYOUT_OPTIONS,
  type BlockMeasurement,
  type ContentBlock,
  type ContentNode,
  type MeasuredAnchor,
  type MeasuredSegment,
  type MeasurementMode,
  type MeasurementPort,
  type NoteDocument,
} from '@noteforest/layout';
import {
  buildSegments,
  fullTableHtml,
  labelHtml,
  measurementCardHtml,
  type RenderSegment,
} from './segments';

const CHROME = 2 * (DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder);

interface IntrinsicWidths {
  max: number;
  min: number;
  maxHeight: number;
}

export interface DomMeasurementAdapter extends MeasurementPort {
  readonly cacheSize: number;
  readonly measurementHost: HTMLElement;
}

function intrinsicCardHtml(
  block: ContentBlock,
  segments: RenderSegment[],
  options: { document: NoteDocument; assets: Record<string, string> },
): string {
  const byNode = new Map<number, RenderSegment[]>();
  for (const segment of segments) {
    const key = segment.nodePath[0] ?? 0;
    const list = byNode.get(key) ?? [];
    list.push(segment);
    byNode.set(key, list);
  }
  const parts: string[] = [];
  for (const [index, node] of (block.content.children ?? []).entries()) {
    if (node.type === 'table') {
      parts.push(`<div class="nf-intrinsic-node">${fullTableHtml(node, { ...options, tableColumns: {} })}</div>`);
      continue;
    }
    const nodeSegments = byNode.get(index) ?? [];
    parts.push(
      `<div class="nf-intrinsic-node">${nodeSegments
        .map(
          (segment) =>
            `<div class="nf-seg nf-seg-${segment.kind} nf-gap-none${segment.extraClass ? ` ${segment.extraClass}` : ''}">${segment.html}</div>`,
        )
        .join('')}</div>`,
    );
  }
  return `<div class="nf-card nf-measure-card nf-intrinsic-card">${labelHtml(block)}<div class="nf-block-content" data-nf-content>${parts.join('')}</div></div>`;
}

function firstTablePaths(content: ContentNode): Array<{ key: string; node: ContentNode }> {
  const result: Array<{ key: string; node: ContentNode }> = [];
  for (const [index, node] of (content.children ?? []).entries()) {
    if (node.type === 'table') result.push({ key: String(index), node });
  }
  return result;
}

export function createDomMeasurement(
  noteDocument: NoteDocument,
  assets: Record<string, string>,
): DomMeasurementAdapter {
  const host = document.createElement('div');
  host.className = 'nf-measure-host';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);

  const fixedCache = new Map<string, BlockMeasurement>();
  const intrinsicCache = new Map<string, IntrinsicWidths>();
  let cacheSize = 0;

  const options = { document: noteDocument, assets };

  function measureIntrinsic(block: ContentBlock): IntrinsicWidths {
    const cached = intrinsicCache.get(block.id);
    if (cached) return cached;
    const segments = buildSegments(block, { ...options, tableColumns: {} });
    const html = intrinsicCardHtml(block, segments, options);

    host.innerHTML = html;
    const card = host.querySelector<HTMLElement>('.nf-measure-card');
    const content = host.querySelector<HTMLElement>('[data-nf-content]');
    if (!card || !content) throw new Error(`Measurement host missing card for ${block.id}`);
    card.classList.add('nf-width-max');
    const max = content.getBoundingClientRect().width;
    const maxHeight = card.getBoundingClientRect().height;
    card.classList.remove('nf-width-max');
    card.classList.add('nf-width-min');
    const min = content.getBoundingClientRect().width;
    card.classList.remove('nf-width-min');
    const result = { max: Math.max(1, max), min: Math.max(1, min), maxHeight };
    intrinsicCache.set(block.id, result);
    return result;
  }

  function measureTableColumns(block: ContentBlock, contentWidth: number): Record<string, number[]> {
    const columns: Record<string, number[]> = {};
    const tables = firstTablePaths(block.content);
    if (tables.length === 0) return columns;
    for (const table of tables) {
      const wrapper = document.createElement('div');
      wrapper.className = 'nf-table-measure-container';
      wrapper.style.width = `${contentWidth}px`;
      wrapper.innerHTML = fullTableHtml(table.node, { ...options, tableColumns: {} });
      host.replaceChildren(wrapper);
      const tableEl = wrapper.querySelector<HTMLTableElement>('table');
      if (!tableEl) continue;
      const firstRow = tableEl.querySelector<HTMLTableRowElement>('tbody tr');
      if (!firstRow) {
        const count = Number(tableEl.dataset['columns'] ?? '1');
        columns[table.key] = Array.from({ length: count }, () => contentWidth / count);
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
    const segments = buildSegments(block, { ...options, tableColumns });
    const cardWidth = contentWidth + CHROME;
    host.innerHTML = measurementCardHtml(block, segments);
    const card = host.querySelector<HTMLElement>('.nf-measure-card');
    const content = host.querySelector<HTMLElement>('.nf-block-content');
    if (!card || !content) throw new Error(`Measurement host missing card for ${block.id}`);
    card.style.width = `${cardWidth}px`;
    const cardRect = card.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const label = card.querySelector<HTMLElement>('.nf-label');

    const measuredSegments: MeasuredSegment[] = [];
    const wrappers = [...content.querySelectorAll<HTMLElement>('[data-seg]')];
    for (const wrapper of wrappers) {
      const index = Number(wrapper.dataset['seg'] ?? '-1');
      if (index < 0) continue;
      const segment = segments[index];
      if (!segment) continue;
      const rect = wrapper.getBoundingClientRect();
      measuredSegments.push({
        index,
        kind: segment.kind,
        nodePath: segment.nodePath,
        y: rect.top - contentRect.top,
        height: rect.height,
        breakableBefore: index > 0,
        tableKey: segment.tableKey,
        rowIndex: segment.rowIndex,
      });
    }

    const anchors: MeasuredAnchor[] = [];
    const occurrences = new Map<string, number>();
    for (const element of content.querySelectorAll<HTMLElement>('[data-anchor-id]')) {
      const anchorId = element.dataset['anchorId'];
      if (!anchorId) continue;
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
          .filter((value): value is string => Boolean(value)),
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
      const key = `fixed:${block.id}:${mode.contentWidth.toFixed(3)}`;
      const cached = fixedCache.get(key);
      if (cached) return cached;
      const measured = measureFixed(block, mode.contentWidth);
      fixedCache.set(key, measured);
      cacheSize += 1;
      return measured;
    }
    const intrinsic = measureIntrinsic(block);
    const width = mode.kind === 'max-content' ? intrinsic.max : intrinsic.min;
    return {
      blockId: block.id,
      mode,
      cardWidth: width + CHROME,
      contentWidth: width,
      contentHeight: 0,
      contentTop: DEFAULT_LAYOUT_OPTIONS.cardPadding + DEFAULT_LAYOUT_OPTIONS.cardBorder,
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

  return {
    measure,
    get cacheSize() {
      return cacheSize;
    },
    measurementHost: host,
  };
}
