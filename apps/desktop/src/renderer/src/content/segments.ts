import katex from 'katex';
import type {
  ContentBlock,
  ContentNode,
  NoteDocument,
  SegmentKind,
} from '@noteforest/layout';

export const SEGMENT_GAP_PX = 8;

export interface RenderSegment {
  index: number;
  kind: SegmentKind;
  nodePath: number[];
  html: string;
  gapBefore: boolean;
  extraClass: string;
  tableKey?: string;
  rowIndex?: number;
  anchorIds: string[];
}

export interface SegmentOptions {
  document: NoteDocument;
  assets: Record<string, string>;
  tableColumns: Record<string, number[]>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function attr(value: string): string {
  return escapeAttr(value);
}

export function katexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: 'html',
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return `<span class="nf-math-error" title="${attr(latex)}">${escapeHtml(latex)}</span>`;
  }
}

interface InlineResult {
  html: string;
  anchorIds: string[];
}

function inlineNodeHtml(node: ContentNode, options: SegmentOptions): InlineResult {
  if (node.type === 'text') {
    let html = escapeHtml(node.text ?? '').replace(/\n/g, '<br>');
    const anchorIds: string[] = [];
    const marks = node.marks ?? [];
    if (marks.some((mark) => mark.type === 'code')) html = `<code class="nf-inline-code">${html}</code>`;
    if (marks.some((mark) => mark.type === 'strong')) html = `<strong>${html}</strong>`;
    if (marks.some((mark) => mark.type === 'em')) html = `<em>${html}</em>`;
    for (const mark of marks) {
      if (mark.type !== 'anchor') continue;
      const anchorId = mark.attrs?.['anchorId'];
      if (typeof anchorId !== 'string') continue;
      anchorIds.push(anchorId);
      html = `<span class="nf-anchor" data-anchor-id="${attr(anchorId)}">${html}</span>`;
    }
    return { html, anchorIds };
  }
  if (node.type === 'inlineMath') {
    const latex = typeof node.attrs?.['latex'] === 'string' ? node.attrs['latex'] : '';
    const anchorId = node.attrs?.['anchorId'];
    const anchorIds = typeof anchorId === 'string' ? [anchorId] : [];
    const anchorAttr = typeof anchorId === 'string' ? ` data-anchor-id="${attr(anchorId)}"` : '';
    return {
      html: `<span class="nf-math nf-math-inline"${anchorAttr}>${katexHtml(latex, false)}</span>`,
      anchorIds,
    };
  }
  if (node.type === 'hardBreak') return { html: '<br>', anchorIds: [] };
  if (node.type === 'image') {
    const anchorId = node.attrs?.['anchorId'];
    const anchorAttr = typeof anchorId === 'string' ? ` data-anchor-id="${attr(anchorId)}"` : '';
    return {
      html: `<span class="nf-inline-image"${anchorAttr}>${imageHtml(node, options)}</span>`,
      anchorIds: typeof anchorId === 'string' ? [anchorId] : [],
    };
  }
  let html = '';
  const anchorIds: string[] = [];
  for (const child of node.children ?? []) {
    const result = inlineNodeHtml(child, options);
    html += result.html;
    anchorIds.push(...result.anchorIds);
  }
  return { html, anchorIds };
}

function inlineNodesHtml(nodes: ContentNode[], options: SegmentOptions): InlineResult {
  let html = '';
  const anchorIds: string[] = [];
  for (const node of nodes) {
    const result = inlineNodeHtml(node, options);
    html += result.html;
    anchorIds.push(...result.anchorIds);
  }
  return { html, anchorIds };
}

function imageHtml(node: ContentNode, options: SegmentOptions): string {
  const assetId = node.attrs?.['assetId'];
  const alt = typeof node.attrs?.['alt'] === 'string' ? node.attrs['alt'] : '';
  const width = typeof node.attrs?.['width'] === 'number' ? node.attrs['width'] : 220;
  const height = typeof node.attrs?.['height'] === 'number' ? node.attrs['height'] : 120;
  const src = typeof assetId === 'string' ? options.assets[assetId] : undefined;
  if (!src) {
    return `<span class="nf-missing-asset" data-missing-asset="${attr(String(assetId ?? 'unknown'))}">Missing asset: ${escapeHtml(alt || String(assetId ?? 'unknown'))}</span>`;
  }
  return `<img class="nf-image" src="${attr(src)}" width="${Math.round(width)}" height="${Math.round(height)}" alt="${attr(alt)}" data-asset-id="${attr(String(assetId))}" />`;
}

function paragraphHtml(node: ContentNode, options: SegmentOptions, className = 'nf-p'): InlineResult {
  const inline = inlineNodesHtml(node.children ?? [], options);
  return { html: `<p class="${className}">${inline.html}</p>`, anchorIds: inline.anchorIds };
}

function headingHtml(node: ContentNode, options: SegmentOptions): InlineResult {
  const level = typeof node.attrs?.['level'] === 'number' ? node.attrs['level'] : 2;
  const tag = level <= 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
  const inline = inlineNodesHtml(node.children ?? [], options);
  return {
    html: `<${tag} class="nf-heading nf-heading-${tag}">${inline.html}</${tag}>`,
    anchorIds: inline.anchorIds,
  };
}

function listItemHtml(
  node: ContentNode,
  depth: number,
  marker: string,
  options: SegmentOptions,
): InlineResult {
  const paragraphs: string[] = [];
  const anchorIds: string[] = [];
  for (const child of node.children ?? []) {
    if (child.type === 'bulletList' || child.type === 'orderedList') continue;
    if (child.type === 'paragraph') {
      const inline = inlineNodesHtml(child.children ?? [], options);
      paragraphs.push(`<div class="nf-li-paragraph">${inline.html}</div>`);
      anchorIds.push(...inline.anchorIds);
    } else {
      const result = inlineNodeHtml(child, options);
      paragraphs.push(result.html);
      anchorIds.push(...result.anchorIds);
    }
  }
  const indent = depth * 18;
  return {
    html: `<div class="nf-li" style="padding-left:${indent}px"><span class="nf-li-marker">${escapeHtml(marker)}</span><div class="nf-li-content">${paragraphs.join('')}</div></div>`,
    anchorIds,
  };
}

function flattenList(
  list: ContentNode,
  path: number[],
  depth: number,
  options: SegmentOptions,
  out: RenderSegment[],
): void {
  const ordered = list.type === 'orderedList';
  const start = typeof list.attrs?.['start'] === 'number' ? list.attrs['start'] : 1;
  let index = start;
  for (const [itemIndex, item] of (list.children ?? []).entries()) {
    const marker = ordered ? `${index}.` : '•';
    index += 1;
    const result = listItemHtml(item, depth, marker, options);
    out.push({
      index: out.length,
      kind: 'list-item',
      nodePath: [...path, itemIndex],
      html: result.html,
      gapBefore: out.length > 0,
      extraClass: '',
      anchorIds: result.anchorIds,
    });
    for (const [nestedIndex, child] of (item.children ?? []).entries()) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        flattenList(child, [...path, itemIndex, nestedIndex], depth + 1, options, out);
      }
    }
  }
}

function codeTokensHtml(line: string, anchorId: string, token: string): { html: string; anchors: string[] } {
  if (!token) return { html: escapeHtml(line), anchors: [] };
  const anchors: string[] = [];
  let html = '';
  let cursor = 0;
  while (cursor <= line.length) {
    const found = line.indexOf(token, cursor);
    if (found < 0) break;
    html += escapeHtml(line.slice(cursor, found));
    html += `<span class="nf-anchor" data-anchor-id="${attr(anchorId)}">${escapeHtml(token)}</span>`;
    anchors.push(anchorId);
    cursor = found + token.length;
  }
  html += escapeHtml(line.slice(cursor));
  return { html, anchors };
}

function tableCellHtml(cell: ContentNode, options: SegmentOptions): InlineResult {
  const parts: string[] = [];
  const anchorIds: string[] = [];
  for (const child of cell.children ?? []) {
    if (child.type === 'paragraph') {
      const inline = inlineNodesHtml(child.children ?? [], options);
      parts.push(`<div class="nf-cell-paragraph">${inline.html}</div>`);
      anchorIds.push(...inline.anchorIds);
    } else {
      const result = inlineNodeHtml(child, options);
      parts.push(result.html);
      anchorIds.push(...result.anchorIds);
    }
  }
  return { html: parts.join(''), anchorIds };
}

function tableRowHtml(
  table: ContentNode,
  row: ContentNode,
  rowIndex: number,
  totalRows: number,
  columns: number[],
  options: SegmentOptions,
): InlineResult {
  const header = table.attrs?.['headerRow'] === true && rowIndex === 0;
  const cells = (row.children ?? []).map((cell) => tableCellHtml(cell, options));
  const anchorIds = cells.flatMap((cell) => cell.anchorIds);
  const width = columns.reduce((sum, column) => sum + column, 0);
  const colgroup = columns.map((column) => `<col style="width:${column.toFixed(2)}px" />`).join('');
  const cellHtml = cells
    .map((cell, index) => {
      const classes = [
        'nf-td',
        header ? 'nf-td-header' : '',
        index === 0 ? 'nf-td-first' : '',
        index === cells.length - 1 ? 'nf-td-last' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<td class="${classes}">${cell.html}</td>`;
    })
    .join('');
  const extra = [
    rowIndex === 0 ? 'nf-table-first' : '',
    rowIndex === totalRows - 1 ? 'nf-table-last' : '',
    header ? 'nf-table-row-header' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return {
    html: `<table class="nf-table ${extra}" style="width:${width.toFixed(2)}px"><colgroup>${colgroup}</colgroup><tbody><tr>${cellHtml}</tr></tbody></table>`,
    anchorIds,
  };
}

export function buildSegments(block: ContentBlock, options: SegmentOptions): RenderSegment[] {
  const segments: RenderSegment[] = [];
  const content = block.content;
  for (const [index, node] of (content.children ?? []).entries()) {
    const path = [index];
    switch (node.type) {
      case 'paragraph': {
        const result = paragraphHtml(node, options);
        segments.push({
          index: segments.length,
          kind: 'paragraph',
          nodePath: path,
          html: result.html,
          gapBefore: segments.length > 0,
          extraClass: '',
          anchorIds: result.anchorIds,
        });
        break;
      }
      case 'heading': {
        const result = headingHtml(node, options);
        segments.push({
          index: segments.length,
          kind: 'heading',
          nodePath: path,
          html: result.html,
          gapBefore: segments.length > 0,
          extraClass: '',
          anchorIds: result.anchorIds,
        });
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        flattenList(node, path, 0, options, segments);
        break;
      }
      case 'blockquote': {
        for (const [childIndex, child] of (node.children ?? []).entries()) {
          if (child.type !== 'paragraph') continue;
          const result = paragraphHtml(child, options, 'nf-p');
          segments.push({
            index: segments.length,
            kind: 'blockquote-paragraph',
            nodePath: [...path, childIndex],
            html: `<blockquote class="nf-quote">${result.html}</blockquote>`,
            gapBefore: segments.length > 0,
            extraClass: '',
            anchorIds: result.anchorIds,
          });
        }
        break;
      }
      case 'codeBlock': {
        const text = typeof node.attrs?.['text'] === 'string' ? node.attrs['text'] : '';
        const lines = text.length > 0 ? text.split('\n') : [''];
        const anchorId = node.attrs?.['anchorId'];
        const token = typeof node.attrs?.['anchorToken'] === 'string' ? node.attrs['anchorToken'] : '';
        for (const [lineIndex, line] of lines.entries()) {
          let html: string;
          let anchorIds: string[] = [];
          if (typeof anchorId === 'string' && token) {
            const result = codeTokensHtml(line, anchorId, token);
            html = result.html;
            anchorIds = result.anchors;
          } else {
            html = escapeHtml(line);
          }
          segments.push({
            index: segments.length,
            kind: 'code-line',
            nodePath: [...path, lineIndex],
            html: `<div class="nf-code-line" data-line="${lineIndex + 1}">${html || '&nbsp;'}</div>`,
            gapBefore: segments.length > 0 && lineIndex === 0,
            extraClass: [
              lineIndex === 0 ? 'nf-code-first' : '',
              lineIndex === lines.length - 1 ? 'nf-code-last' : '',
            ]
              .filter(Boolean)
              .join(' '),
            anchorIds,
          });
        }
        break;
      }
      case 'mathBlock': {
        const latex = typeof node.attrs?.['latex'] === 'string' ? node.attrs['latex'] : '';
        const anchorId = node.attrs?.['anchorId'];
        const anchorAttr = typeof anchorId === 'string' ? ` data-anchor-id="${attr(anchorId)}"` : '';
        segments.push({
          index: segments.length,
          kind: 'math',
          nodePath: path,
          html: `<div class="nf-math-display"${anchorAttr}>${katexHtml(latex, true)}</div>`,
          gapBefore: segments.length > 0,
          extraClass: '',
          anchorIds: typeof anchorId === 'string' ? [anchorId] : [],
        });
        break;
      }
      case 'image': {
        const anchorId = node.attrs?.['anchorId'];
        const anchorAttr = typeof anchorId === 'string' ? ` data-anchor-id="${attr(anchorId)}"` : '';
        segments.push({
          index: segments.length,
          kind: 'image',
          nodePath: path,
          html: `<figure class="nf-figure"${anchorAttr}>${imageHtml(node, options)}</figure>`,
          gapBefore: segments.length > 0,
          extraClass: '',
          anchorIds: typeof anchorId === 'string' ? [anchorId] : [],
        });
        break;
      }
      case 'table': {
        const rows = node.children ?? [];
        const tableKey = path.join('.');
        const columns = options.tableColumns[tableKey];
        if (!columns || columns.length === 0) {
          // Fallback used only by intrinsic measurement passes. Render one
          // auto-layout table row per segment; fixed layout will re-measure.
          const columnsCount = Math.max(1, ...rows.map((row) => row.children?.length ?? 0));
          const fallback = Array.from({ length: columnsCount }, () => 56);
          for (const [rowIndex, row] of rows.entries()) {
            const result = tableRowHtml(node, row, rowIndex, rows.length, fallback, options);
            segments.push({
              index: segments.length,
              kind: 'table-row',
              nodePath: [...path, rowIndex],
              html: result.html,
              gapBefore: segments.length > 0 && rowIndex === 0,
              extraClass: [
                rowIndex === 0 ? 'nf-table-first' : '',
                rowIndex === rows.length - 1 ? 'nf-table-last' : '',
              ]
                .filter(Boolean)
                .join(' '),
              tableKey,
              rowIndex,
              anchorIds: result.anchorIds,
            });
          }
        } else {
          for (const [rowIndex, row] of rows.entries()) {
            const result = tableRowHtml(node, row, rowIndex, rows.length, columns, options);
            segments.push({
              index: segments.length,
              kind: 'table-row',
              nodePath: [...path, rowIndex],
              html: result.html,
              gapBefore: segments.length > 0 && rowIndex === 0,
              extraClass: [
                rowIndex === 0 ? 'nf-table-first' : '',
                rowIndex === rows.length - 1 ? 'nf-table-last' : '',
              ]
                .filter(Boolean)
                .join(' '),
              tableKey,
              rowIndex,
              anchorIds: result.anchorIds,
            });
          }
        }
        break;
      }
      default: {
        const result = inlineNodesHtml(node.children ?? [], options);
        segments.push({
          index: segments.length,
          kind: 'paragraph',
          nodePath: path,
          html: `<p class="nf-p">${result.html}</p>`,
          gapBefore: segments.length > 0,
          extraClass: '',
          anchorIds: result.anchorIds,
        });
      }
    }
  }
  return segments;
}

export function segmentWrapperHtml(segment: RenderSegment): string {
  const classes = [
    'nf-seg',
    `nf-seg-${segment.kind}`,
    segment.gapBefore ? '' : 'nf-gap-none',
    segment.extraClass,
  ]
    .filter(Boolean)
    .join(' ');
  return `<div class="${classes}" data-seg="${segment.index}">${segment.html}</div>`;
}

export function segmentsHtml(segments: RenderSegment[], start = 0, end = segments.length): string {
  return segments
    .slice(start, end)
    .map((segment) => segmentWrapperHtml(segment))
    .join('');
}

export function labelHtml(block: ContentBlock): string {
  return block.label ? `<div class="nf-label">${escapeHtml(block.label)}</div>` : '';
}

export function contentWrapperHtml(block: ContentBlock, segments: RenderSegment[], start = 0, end = segments.length): string {
  return `<div class="nf-block-content">${segmentsHtml(segments, start, end)}</div>`;
}

/**
 * The measurement host and the screen/print card use the same markup. This
 * function is the single source of truth for the measured card.
 */
export function measurementCardHtml(block: ContentBlock, segments: RenderSegment[]): string {
  return `<div class="nf-card nf-measure-card">${labelHtml(block)}${contentWrapperHtml(block, segments)}</div>`;
}

export function fullTableHtml(table: ContentNode, options: SegmentOptions): string {
  const rows = table.children ?? [];
  const columns = Math.max(1, ...rows.map((row) => row.children?.length ?? 0));
  return `<table class="nf-table nf-table-auto" data-columns="${columns}"><tbody>${rows
    .map(
      (row) =>
        `<tr>${(row.children ?? [])
          .map((cell) => `<td class="nf-td">${tableCellHtml(cell, options).html}</td>`)
          .join('')}</tr>`,
    )
    .join('')}</tbody></table>`;
}
