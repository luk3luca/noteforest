/**
 * Static page/print segment renderer.
 *
 * This module is the single content projection used by the hidden measurement
 * host and the read-only page layout. It is pure string generation: no React,
 * no DOM reads, and no layout decisions. Segment boundaries are exactly the safe
 * page-break candidates the paginator consumes:
 *
 * - paragraph / heading / list item / blockquote paragraph;
 * - one segment per code line;
 * - one segment per table row;
 * - display math and block images.
 *
 * A line, image, formula, code line, or table row is always inside one segment,
 * so the paginator can never cut through it.
 */

import katex from 'katex';
import type { AnchorRecord, ContentNode, SegmentKind } from '@noteforest/layout';

/** Intrinsic-only fallback. Fixed table layout always re-measures real columns. */
const FALLBACK_TABLE_COLUMN_WIDTH = 56;

/**
 * The minimal block shape the renderer needs. Core `ContentBlock` (which also
 * allows a `strong` border) and layout `ContentBlock` are both assignable.
 */
export interface PageContentBlock {
  id: string;
  label?: string;
  content: ContentNode;
}

export interface PageRenderSegment {
  index: number;
  kind: SegmentKind;
  nodePath: number[];
  html: string;
  gapBefore: boolean;
  breakableBefore: boolean;
  extraClass: string;
  tableKey?: string;
  rowIndex?: number;
  anchorIds: string[];
}

export interface SegmentOptions {
  /** Asset id -> renderer-safe display URL. Missing ids render a placeholder. */
  assets: Readonly<Record<string, string>>;
  /** Table path key -> measured column widths in px. */
  tableColumns: Readonly<Record<string, number[]>>;
  /** Canonical anchors for this block (code token hints, measurement only). */
  anchors?: readonly AnchorRecord[];
  /** Per-level list indent in px; comes from the shared layout options. */
  listIndent: number;
  /**
   * Whether an image that already carries both `width` and `height` renders a
   * `src`. The measurement host sets this to `false`: those attributes fully
   * determine the measured box, so fetching bytes cannot change it and can
   * race a closing document package. Page rendering leaves it unset.
   */
  requestIntrinsicImages?: boolean;
}

interface InlineResult {
  html: string;
  anchorIds: string[];
}

interface SegmentInput {
  kind: SegmentKind;
  nodePath: number[];
  html: string;
  extraClass?: string;
  tableKey?: string;
  rowIndex?: number;
  anchorIds?: string[];
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
  return `"${escapeAttr(value)}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringAttr(attrs: Record<string, unknown> | undefined, key: string): string {
  const value = attrs?.[key];
  return typeof value === 'string' ? value : '';
}

function numberAttr(attrs: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = attrs?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
}

/** Read the canonical atomic `anchorIds` array with the M2 legacy string. */
function anchorIdsOf(node: ContentNode): string[] {
  const attrs = isRecord(node.attrs) ? node.attrs : undefined;
  if (attrs === undefined) return [];
  const ids: string[] = [];
  const raw = attrs['anchorIds'];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string' && entry.length > 0) ids.push(entry);
    }
  }
  const legacy = attrs['anchorId'];
  if (ids.length === 0 && typeof legacy === 'string' && legacy.length > 0) ids.push(legacy);
  return sortedUnique(ids);
}

/** Read anchor IDs from an `anchor` mark (array first, legacy string second). */
function markAnchorIds(mark: { attrs?: Record<string, unknown> }): string[] {
  const attrs = mark.attrs;
  if (attrs === undefined) return [];
  const ids: string[] = [];
  const raw = attrs['anchorIds'];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string' && entry.length > 0) ids.push(entry);
    }
  }
  const legacy = attrs['anchorId'];
  if (ids.length === 0 && typeof legacy === 'string' && legacy.length > 0) ids.push(legacy);
  return sortedUnique(ids);
}

/** Nest one `data-anchor-id` wrapper per anchor so measurement sees each one. */
function wrapAnchors(
  html: string,
  anchorIds: readonly string[],
  tag: 'span' | 'div',
): string {
  let result = html;
  for (const anchorId of anchorIds) {
    result = `<${tag} class="nf-anchor" data-anchor-id=${attr(anchorId)}>${result}</${tag}>`;
  }
  return result;
}

export function katexHtml(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      // Invalid source is kept and shown with the visible error class below;
      // it is never silently dropped from the page or export.
      throwOnError: true,
      output: 'html',
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return `<span class="nf-math-error" title=${attr(latex)}>${escapeHtml(latex)}</span>`;
  }
}

function isSafeHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('#')
  );
}

function applyMarks(text: string, marks: ContentNode['marks']): InlineResult {
  const anchorIds: string[] = [];
  let html = escapeHtml(text).replace(/\n/g, '<br>');
  const list = marks ?? [];

  for (const mark of list) {
    if (mark.type === 'code') html = `<code class="nf-inline-code">${html}</code>`;
    // Canonical content comes from the TipTap projection, whose StarterKit mark
    // names are `bold`/`italic`; the static page/print renderer also keeps the
    // spec's `strong`/`em` spellings for imported or legacy Markdown content.
    else if (mark.type === 'strong' || mark.type === 'bold') html = `<strong>${html}</strong>`;
    else if (mark.type === 'em' || mark.type === 'italic') html = `<em>${html}</em>`;
    else if (mark.type === 'strike') html = `<s>${html}</s>`;
    else if (mark.type === 'underline') html = `<u>${html}</u>`;
    else if (mark.type === 'link' && isRecord(mark.attrs)) {
      const href = stringAttr(mark.attrs, 'href');
      if (href.length > 0 && isSafeHref(href)) {
        html = `<a class="nf-link" href=${attr(href)} rel="noreferrer noopener">${html}</a>`;
      } else {
        const title = href.length > 0 ? ` title=${attr(href)}` : '';
        html = `<span class="nf-link"${title}>${html}</span>`;
      }
    }
  }

  for (const mark of list) {
    if (mark.type !== 'anchor') continue;
    anchorIds.push(...markAnchorIds(mark));
  }
  const unique = sortedUnique(anchorIds);
  html = wrapAnchors(html, unique, 'span');
  return { html, anchorIds: unique };
}

function inlineNodeHtml(node: ContentNode, options: SegmentOptions): InlineResult {
  if (node.type === 'text') {
    return applyMarks(node.text ?? '', node.marks);
  }
  if (node.type === 'inlineMath') {
    const latex = stringAttr(node.attrs, 'latex');
    const anchorIds = anchorIdsOf(node);
    const html = wrapAnchors(
      `<span class="nf-math nf-math-inline">${katexHtml(latex, false)}</span>`,
      anchorIds,
      'span',
    );
    return { html, anchorIds };
  }
  if (node.type === 'image') return imageInlineHtml(node, options);
  if (node.type === 'hardBreak') return { html: '<br>', anchorIds: [] };
  if (node.type === 'mathBlock' || node.type === 'blockMath') {
    // Defensive: a display formula inside an inline container still renders.
    const latex = stringAttr(node.attrs, 'latex');
    const anchorIds = anchorIdsOf(node);
    return {
      html: wrapAnchors(
        `<span class="nf-math-display">${katexHtml(latex, true)}</span>`,
        anchorIds,
        'span',
      ),
      anchorIds,
    };
  }
  if (node.type === 'codeBlock') {
    const text = codeBlockText(node);
    const anchorIds = anchorIdsOf(node);
    return {
      html: wrapAnchors(`<code class="nf-inline-code">${escapeHtml(text)}</code>`, anchorIds, 'span'),
      anchorIds,
    };
  }
  if (node.children !== undefined) {
    const result = inlineNodesHtml(node.children, options);
    return result;
  }
  return {
    html: `<span class="nf-unknown-node" title=${attr(`Unsupported inline node: ${node.type}`)}>[${escapeHtml(
      node.type,
    )}]</span>`,
    anchorIds: [],
  };
}

function inlineNodesHtml(nodes: readonly ContentNode[], options: SegmentOptions): InlineResult {
  let html = '';
  const anchorIds: string[] = [];
  for (const node of nodes) {
    const result = inlineNodeHtml(node, options);
    html += result.html;
    anchorIds.push(...result.anchorIds);
  }
  return { html, anchorIds: sortedUnique(anchorIds) };
}

function assetRecord(attrs: Record<string, unknown> | undefined): {
  assetId: string;
  alt: string;
  width: number | undefined;
  height: number | undefined;
} {
  return {
    assetId: stringAttr(attrs, 'assetId'),
    alt: stringAttr(attrs, 'alt'),
    width: numberAttr(attrs, 'width'),
    height: numberAttr(attrs, 'height'),
  };
}

function missingAssetHtml(assetId: string, alt: string): string {
  const label = alt.trim().length > 0 ? alt : assetId.length > 0 ? assetId : 'unsupported image';
  return `<span class="nf-missing-asset" data-missing-asset=${attr(
    assetId.length > 0 ? assetId : 'unsupported',
  )} role="img" aria-label=${attr(`Missing image: ${label}`)}>Missing image: ${escapeHtml(
    label,
  )}</span>`;
}

function imageHtml(node: ContentNode, options: SegmentOptions): string {
  const { assetId, alt, width, height } = assetRecord(node.attrs);
  const src = assetId.length > 0 ? options.assets[assetId] : undefined;
  if (src === undefined || src.length === 0) return missingAssetHtml(assetId, alt);
  const dimensions =
    (width === undefined ? '' : ` width=${attr(String(Math.round(width)))}`) +
    (height === undefined ? '' : ` height=${attr(String(Math.round(height)))}`);
  const source =
    options.requestIntrinsicImages === false && width !== undefined && height !== undefined
      ? ''
      : ` src=${attr(src)}`;
  return `<img class="nf-image"${source} alt=${attr(alt)}${dimensions} data-asset-id=${attr(
    assetId,
  )} draggable="false" />`;
}

function imageInlineHtml(node: ContentNode, options: SegmentOptions): InlineResult {
  const anchorIds = anchorIdsOf(node);
  return {
    html: `<span class="nf-inline-image">${wrapAnchors(imageHtml(node, options), anchorIds, 'span')}</span>`,
    anchorIds,
  };
}

function paragraphHtml(node: ContentNode, options: SegmentOptions): InlineResult {
  const inline = inlineNodesHtml(node.children ?? [], options);
  return { html: `<p class="nf-p">${inline.html}</p>`, anchorIds: inline.anchorIds };
}

function headingHtml(node: ContentNode, options: SegmentOptions): InlineResult {
  const level = numberAttr(node.attrs, 'level') ?? 2;
  const tag = level <= 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
  const inline = inlineNodesHtml(node.children ?? [], options);
  return {
    html: `<${tag} class="nf-heading nf-heading-${tag}">${inline.html}</${tag}>`,
    anchorIds: inline.anchorIds,
  };
}

/**
 * Render one block-level node inside an atomic container (a table cell, a list
 * item, or a blockquote). These containers never create new page segments, so
 * all of their block content is composed here without losing lists, code,
 * math, images, or nested tables.
 */
function blockInCellHtml(node: ContentNode, options: SegmentOptions): InlineResult {
  if (node.type === 'paragraph') {
    const inline = inlineNodesHtml(node.children ?? [], options);
    return {
      html: `<div class="nf-cell-paragraph">${inline.html}</div>`,
      anchorIds: inline.anchorIds,
    };
  }
  if (node.type === 'heading') {
    return headingHtml(node, options);
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return listHtml(node, 0, options);
  }
  if (node.type === 'blockquote') {
    let html = '';
    const anchorIds: string[] = [];
    for (const child of node.children ?? []) {
      if (child.type === 'paragraph') {
        const inline = inlineNodesHtml(child.children ?? [], options);
        html += `<blockquote class="nf-quote"><p class="nf-p">${inline.html}</p></blockquote>`;
        anchorIds.push(...inline.anchorIds);
        continue;
      }
      const nested = blockInCellHtml(child, options);
      html += `<blockquote class="nf-quote">${nested.html}</blockquote>`;
      anchorIds.push(...nested.anchorIds);
    }
    return { html, anchorIds: sortedUnique(anchorIds) };
  }
  if (node.type === 'codeBlock') {
    const text = codeBlockText(node);
    const lines = text.length > 0 ? text.split('\n') : [''];
    const anchorIds = anchorIdsOf(node);
    let html = '';
    for (const [index, line] of lines.entries()) {
      html += `<div class="nf-code-line">${index === 0 && anchorIds.length > 0
        ? wrapAnchors(escapeHtml(line) || '&nbsp;', anchorIds, 'span')
        : escapeHtml(line) || '&nbsp;'}</div>`;
    }
    return { html, anchorIds };
  }
  if (node.type === 'mathBlock' || node.type === 'blockMath') {
    const anchorIds = anchorIdsOf(node);
    return {
      html: wrapAnchors(
        `<div class="nf-math-display">${katexHtml(stringAttr(node.attrs, 'latex'), true)}</div>`,
        anchorIds,
        'div',
      ),
      anchorIds,
    };
  }
  if (node.type === 'image') {
    const anchorIds = anchorIdsOf(node);
    return {
      html: `<figure class="nf-figure">${wrapAnchors(
        imageHtml(node, options),
        anchorIds,
        'span',
      )}</figure>`,
      anchorIds,
    };
  }
  if (node.type === 'table') {
    return { html: fullTableHtml(node, { ...options, tableColumns: {} }), anchorIds: [] };
  }
  if (node.type === 'horizontalRule') {
    return { html: '<hr class="nf-hr" />', anchorIds: [] };
  }
  return inlineNodesHtml(node.children ?? [], options);
}

function listHtml(
  list: ContentNode,
  depth: number,
  options: SegmentOptions,
): InlineResult {
  const ordered = list.type === 'orderedList';
  const start = numberAttr(list.attrs, 'start') ?? 1;
  let index = start;
  let html = '';
  const anchorIds: string[] = [];
  for (const item of list.children ?? []) {
    const marker = ordered ? `${index}.` : '•';
    index += 1;
    const result = listItemHtml(item, depth, marker, options);
    html += result.html;
    anchorIds.push(...result.anchorIds);
    for (const child of item.children ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        const nested = listHtml(child, depth + 1, options);
        html += nested.html;
        anchorIds.push(...nested.anchorIds);
      }
    }
  }
  return { html, anchorIds: sortedUnique(anchorIds) };
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
      continue;
    }
    const result = blockInCellHtml(child, options);
    paragraphs.push(result.html);
    anchorIds.push(...result.anchorIds);
  }
  const indent = Math.max(0, options.listIndent) * depth;
  return {
    html:
      `<div class="nf-li" data-list-depth=${attr(String(depth))} style="padding-left:${indent}px">` +
      `<span class="nf-li-marker">${escapeHtml(marker)}</span>` +
      `<div class="nf-li-content">${paragraphs.join('')}</div></div>`,
    anchorIds: sortedUnique(anchorIds),
  };
}

function flattenList(
  list: ContentNode,
  path: number[],
  depth: number,
  options: SegmentOptions,
  out: PageRenderSegment[],
): void {
  const ordered = list.type === 'orderedList';
  const start = numberAttr(list.attrs, 'start') ?? 1;
  let index = start;
  for (const [itemIndex, item] of (list.children ?? []).entries()) {
    const marker = ordered ? `${index}.` : '•';
    index += 1;
    const result = listItemHtml(item, depth, marker, options);
    pushSegment(out, {
      kind: 'list-item',
      nodePath: [...path, itemIndex],
      html: result.html,
      anchorIds: result.anchorIds,
    });
    for (const [nestedIndex, child] of (item.children ?? []).entries()) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        flattenList(child, [...path, itemIndex, nestedIndex], depth + 1, options, out);
      }
    }
  }
}

function codeBlockText(node: ContentNode): string {
  const attrText = stringAttr(node.attrs, 'text');
  if (attrText.length > 0) return attrText;
  const collect = (current: ContentNode): string => {
    if (current.type === 'text') return current.text ?? '';
    return (current.children ?? []).map(collect).join('');
  };
  return collect(node);
}

interface CodeTokenHint {
  anchorId: string;
  token: string;
}

function codeTokensFor(block: PageContentBlock, options: SegmentOptions, node: ContentNode): CodeTokenHint[] {
  const ids = new Set(anchorIdsOf(node));
  const hints: CodeTokenHint[] = [];
  for (const anchor of options.anchors ?? []) {
    if (anchor.blockId !== block.id) continue;
    if (anchor.kind !== 'code') continue;
    const token = (anchor.codeToken ?? anchor.quote ?? '').trim();
    if (token.length === 0 || token.includes('\n')) continue;
    // The canonical content may be temporarily ahead of the anchor records
    // during a content commit; still render a token hint when the record exists.
    if (ids.size > 0 && !ids.has(anchor.id)) continue;
    hints.push({ anchorId: anchor.id, token });
  }
  return hints;
}

function highlightCodeLine(
  line: string,
  hints: readonly CodeTokenHint[],
): { html: string; anchorIds: string[] } {
  if (hints.length === 0 || line.length === 0) {
    return { html: escapeHtml(line), anchorIds: [] };
  }
  const ordered = [...hints].sort((left, right) => right.token.length - left.token.length);
  const anchorIds: string[] = [];
  let html = '';
  let cursor = 0;
  while (cursor < line.length) {
    let match: { start: number; token: string; anchorId: string } | null = null;
    for (const hint of ordered) {
      const start = line.indexOf(hint.token, cursor);
      if (start < 0) continue;
      if (
        match === null ||
        start < match.start ||
        (start === match.start && hint.token.length > match.token.length)
      ) {
        match = { start, token: hint.token, anchorId: hint.anchorId };
      }
    }
    if (match === null) {
      html += escapeHtml(line.slice(cursor));
      break;
    }
    html += escapeHtml(line.slice(cursor, match.start));
    html += wrapAnchors(escapeHtml(match.token), [match.anchorId], 'span');
    if (!anchorIds.includes(match.anchorId)) anchorIds.push(match.anchorId);
    cursor = match.start + match.token.length;
  }
  return { html, anchorIds: sortedUnique(anchorIds) };
}

function tableCellHtml(cell: ContentNode, options: SegmentOptions): InlineResult {
  const parts: string[] = [];
  const anchorIds: string[] = [];
  for (const child of cell.children ?? []) {
    const result = blockInCellHtml(child, options);
    parts.push(result.html);
    anchorIds.push(...result.anchorIds);
  }
  return { html: parts.join(''), anchorIds: sortedUnique(anchorIds) };
}

function tableHeaderRow(table: ContentNode, row: ContentNode, rowIndex: number): boolean {
  if (rowIndex !== 0) return false;
  if (table.attrs?.['headerRow'] === true) return true;
  return (row.children ?? []).some((cell) => cell.type === 'tableHeader');
}

function tableRowHtml(
  table: ContentNode,
  row: ContentNode,
  rowIndex: number,
  totalRows: number,
  columns: readonly number[],
  options: SegmentOptions,
): InlineResult {
  const header = tableHeaderRow(table, row, rowIndex);
  const cells = (row.children ?? []).map((cell) => tableCellHtml(cell, options));
  const anchorIds = sortedUnique(cells.flatMap((cell) => cell.anchorIds));
  const width = columns.reduce((sum, column) => sum + column, 0);
  const colgroup = columns
    .map((column) => `<col style="width:${column.toFixed(2)}px" />`)
    .join('');
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
    html: `<table class="nf-table ${extra}" style="width:${width.toFixed(
      2,
    )}px"><colgroup>${colgroup}</colgroup><tbody><tr>${cellHtml}</tr></tbody></table>`,
    anchorIds,
  };
}

function fallbackColumns(rows: readonly ContentNode[]): number[] {
  const count = Math.max(1, ...rows.map((row) => row.children?.length ?? 0));
  return Array.from({ length: count }, () => FALLBACK_TABLE_COLUMN_WIDTH);
}

function pushSegment(out: PageRenderSegment[], input: SegmentInput): void {
  const index = out.length;
  const segment: PageRenderSegment = {
    index,
    kind: input.kind,
    nodePath: input.nodePath,
    html: input.html,
    gapBefore: index > 0,
    breakableBefore: index > 0,
    extraClass: input.extraClass ?? '',
    anchorIds: input.anchorIds ?? [],
  };
  if (input.tableKey !== undefined) segment.tableKey = input.tableKey;
  if (input.rowIndex !== undefined) segment.rowIndex = input.rowIndex;
  out.push(segment);
}

/**
 * Build every segment for one block. The array order is document order and the
 * paginator's segment indices; never reorder or merge entries without updating
 * the paginator's safe-break contract.
 */
export function buildSegments(block: PageContentBlock, options: SegmentOptions): PageRenderSegment[] {
  const segments: PageRenderSegment[] = [];
  const content = block.content;
  for (const [index, node] of (content.children ?? []).entries()) {
    const path = [index];
    switch (node.type) {
      case 'paragraph': {
        const result = paragraphHtml(node, options);
        pushSegment(segments, {
          kind: 'paragraph',
          nodePath: path,
          html: result.html,
          anchorIds: result.anchorIds,
        });
        break;
      }
      case 'heading': {
        const result = headingHtml(node, options);
        pushSegment(segments, {
          kind: 'heading',
          nodePath: path,
          html: result.html,
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
          if (child.type === 'paragraph') {
            const result = paragraphHtml(child, options);
            pushSegment(segments, {
              kind: 'blockquote-paragraph',
              nodePath: [...path, childIndex],
              html: `<blockquote class="nf-quote">${result.html}</blockquote>`,
              anchorIds: result.anchorIds,
            });
            continue;
          }
          const result = blockInCellHtml(child, options);
          pushSegment(segments, {
            kind: 'blockquote-paragraph',
            nodePath: [...path, childIndex],
            html: `<blockquote class="nf-quote">${result.html}</blockquote>`,
            anchorIds: result.anchorIds,
          });
        }
        break;
      }
      case 'codeBlock': {
        const text = codeBlockText(node);
        const lines = text.length > 0 ? text.split('\n') : [''];
        const hints = codeTokensFor(block, options, node);
        const hintedIds = new Set(hints.map((hint) => hint.anchorId));
        const wholeCodeIds = anchorIdsOf(node).filter((id) => !hintedIds.has(id));
        for (const [lineIndex, line] of lines.entries()) {
          const highlighted = highlightCodeLine(line, hints);
          let html = highlighted.html;
          let anchorIds = highlighted.anchorIds;
          if (lineIndex === 0 && wholeCodeIds.length > 0) {
            html = wrapAnchors(html || '&nbsp;', wholeCodeIds, 'span');
            anchorIds = sortedUnique([...anchorIds, ...wholeCodeIds]);
          }
          pushSegment(segments, {
            kind: 'code-line',
            nodePath: [...path, lineIndex],
            html: `<div class="nf-code-line" data-line=${attr(
              String(lineIndex + 1),
            )}>${html || '&nbsp;'}</div>`,
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
      case 'mathBlock':
      case 'blockMath': {
        const latex = stringAttr(node.attrs, 'latex');
        const anchorIds = anchorIdsOf(node);
        pushSegment(segments, {
          kind: 'math',
          nodePath: path,
          html: wrapAnchors(
            `<div class="nf-math-display">${katexHtml(latex, true)}</div>`,
            anchorIds,
            'div',
          ),
          anchorIds,
        });
        break;
      }
      case 'image': {
        const anchorIds = anchorIdsOf(node);
        pushSegment(segments, {
          kind: 'image',
          nodePath: path,
          html: `<figure class="nf-figure">${wrapAnchors(
            imageHtml(node, options),
            anchorIds,
            'span',
          )}</figure>`,
          anchorIds,
        });
        break;
      }
      case 'table': {
        const rows = node.children ?? [];
        const tableKey = path.join('.');
        const columns = options.tableColumns[tableKey] ?? fallbackColumns(rows);
        for (const [rowIndex, row] of rows.entries()) {
          const result = tableRowHtml(node, row, rowIndex, rows.length, columns, options);
          pushSegment(segments, {
            kind: 'table-row',
            nodePath: [...path, rowIndex],
            html: result.html,
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
        break;
      }
      case 'horizontalRule': {
        pushSegment(segments, {
          kind: 'paragraph',
          nodePath: path,
          html: '<hr class="nf-hr" />',
        });
        break;
      }
      default: {
        const inline = inlineNodesHtml(node.children ?? [], options);
        pushSegment(segments, {
          kind: 'paragraph',
          nodePath: path,
          html: `<p class="nf-p nf-unknown-node" data-unknown-node=${attr(
            node.type,
          )}>${inline.html || `[Unsupported content: ${escapeHtml(node.type)}]`}</p>`,
          anchorIds: inline.anchorIds,
        });
      }
    }
  }
  return segments;
}

export function segmentWrapperHtml(segment: PageRenderSegment): string {
  const classes = [
    'nf-seg',
    `nf-seg-${segment.kind}`,
    segment.gapBefore ? '' : 'nf-gap-none',
    segment.extraClass,
  ]
    .filter(Boolean)
    .join(' ');
  const table =
    segment.tableKey === undefined
      ? ''
      : ` data-table-key=${attr(segment.tableKey)}${
          segment.rowIndex === undefined ? '' : ` data-table-row=${attr(String(segment.rowIndex))}`
        }`;
  return `<div class="${classes}" data-seg=${attr(String(segment.index))}${table}>${segment.html}</div>`;
}

export function segmentsHtml(
  segments: readonly PageRenderSegment[],
  start = 0,
  end = segments.length,
): string {
  return segments
    .slice(start, end)
    .map((segment) => segmentWrapperHtml(segment))
    .join('');
}

export function labelHtml(block: PageContentBlock): string {
  const label = typeof block.label === 'string' ? block.label.trim() : '';
  return label.length > 0 ? `<div class="nf-label">${escapeHtml(label)}</div>` : '';
}

export function contentWrapperHtml(
  segments: readonly PageRenderSegment[],
  start = 0,
  end = segments.length,
): string {
  return `<div class="nf-block-content">${segmentsHtml(segments, start, end)}</div>`;
}

/** The measurement host and the page card use exactly this markup. */
export function measurementCardHtml(block: PageContentBlock, segments: readonly PageRenderSegment[]): string {
  return `<div class="nf-page-card nf-measure-card">${labelHtml(block)}${contentWrapperHtml(segments)}</div>`;
}

function intrinsicNodeHtml(
  node: ContentNode,
  index: number,
  segments: readonly PageRenderSegment[],
  options: SegmentOptions,
): string {
  if (node.type === 'table') {
    return `<div class="nf-intrinsic-node">${fullTableHtml(node, {
      ...options,
      tableColumns: {},
    })}</div>`;
  }
  const nodeSegments = segments.filter((segment) => segment.nodePath[0] === index);
  return `<div class="nf-intrinsic-node">${nodeSegments
    .map(
      (segment) =>
        `<div class="nf-seg nf-seg-${segment.kind} nf-gap-none${
          segment.extraClass.length > 0 ? ` ${segment.extraClass}` : ''
        }">${segment.html}</div>`,
    )
    .join('')}</div>`;
}

/**
 * Intrinsic-width card. Tables use auto layout; every other node keeps the
 * segment markup so min/max-content width is measured from the real content.
 */
export function intrinsicCardHtml(block: PageContentBlock, options: SegmentOptions): string {
  const segments = buildSegments(block, { ...options, tableColumns: {} });
  const parts = (block.content.children ?? []).map((node, index) =>
    intrinsicNodeHtml(node, index, segments, options),
  );
  return `<div class="nf-page-card nf-measure-card nf-intrinsic-card">${labelHtml(
    block,
  )}<div class="nf-block-content" data-nf-content>${parts.join('')}</div></div>`;
}

/** Auto-layout table used only by intrinsic width measurement. */
export function fullTableHtml(table: ContentNode, options: SegmentOptions): string {
  const rows = table.children ?? [];
  const columns = Math.max(1, ...rows.map((row) => row.children?.length ?? 0));
  return `<table class="nf-table nf-table-auto" data-columns=${attr(String(columns))}><tbody>${rows
    .map(
      (row) =>
        `<tr>${(row.children ?? [])
          .map((cell) => `<td class="nf-td">${tableCellHtml(cell, options).html}</td>`)
          .join('')}</tr>`,
    )
    .join('')}</tbody></table>`;
}
