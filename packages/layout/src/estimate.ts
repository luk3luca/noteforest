import { inlineText } from './document.js';
import type {
  BlockMeasurement,
  ContentBlock,
  ContentNode,
  MeasurementMode,
  MeasurementPort,
  MeasuredAnchor,
  MeasuredSegment,
  NoteDocument,
  SegmentKind,
} from './types.js';
import { DEFAULT_LAYOUT_OPTIONS } from './types.js';

/**
 * Deterministic, DOM-free measurement estimator used by unit tests.
 *
 * It is intentionally approximate: the real DOM adapter is the source of
 * truth. The estimator only needs to exercise the adaptive layout and
 * paginator with content-driven widths, segment boundaries, and anchors.
 */

const BODY_FONT = 14;
const BODY_LINE = BODY_FONT * 1.45;
const CODE_FONT = 12;
const CODE_LINE = CODE_FONT * 1.35;
const BODY_CHAR = 7;
const CODE_CHAR = 7.2;
const LABEL_FONT = 17.33;
const LABEL_LINE = LABEL_FONT * 1.2;
const LABEL_GAP = 8;
const TABLE_CELL_PADDING = 12;

function textWidth(text: string, charWidth = BODY_CHAR): number {
  return text.replace(/\s+/g, ' ').trim().length * charWidth;
}

function longestWordWidth(text: string, charWidth = BODY_CHAR): number {
  const words = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return Math.max(1, ...words.map((word) => word.length * charWidth));
}

function inlineNodeWidth(node: ContentNode, charWidth = BODY_CHAR): number {
  if (node.type === 'text') return (node.text ?? '').length * charWidth;
  if (node.type === 'inlineMath') {
    const latex = typeof node.attrs?.['latex'] === 'string' ? node.attrs['latex'] : '';
    return latex.length * charWidth;
  }
  if (node.type === 'image') {
    return typeof node.attrs?.['width'] === 'number' ? node.attrs['width'] : 220;
  }
  if (node.type === 'hardBreak') return 0;
  return (node.children ?? []).reduce((total, child) => total + inlineNodeWidth(child, charWidth), 0);
}

function inlineMinWidth(node: ContentNode, charWidth = BODY_CHAR): number {
  if (node.type === 'text') return longestWordWidth(node.text ?? '', charWidth);
  if (node.type === 'inlineMath') {
    const latex = typeof node.attrs?.['latex'] === 'string' ? node.attrs['latex'] : '';
    return Math.max(12, latex.length * charWidth);
  }
  if (node.type === 'image') {
    // Images are atomic vertically but scalable horizontally: they never force
    // a card wider than maxContentWidth. The page/print renderer keeps aspect
    // ratio with max-width:100%.
    return 0;
  }
  if (node.type === 'hardBreak') return 0;
  return (node.children ?? []).reduce((max, child) => Math.max(max, inlineMinWidth(child, charWidth)), 0);
}

function blockIntrinsicWidths(node: ContentNode, hasAsset: (id: string) => boolean): { natural: number; min: number } {
  switch (node.type) {
    case 'paragraph':
      return {
        natural: inlineNodeWidth(node),
        min: inlineMinWidth(node),
      };
    case 'heading': {
      const level = typeof node.attrs?.['level'] === 'number' ? node.attrs['level'] : 2;
      const factor = level === 1 ? 1.3 : level === 2 ? 1.12 : 1;
      return {
        natural: inlineNodeWidth(node, BODY_CHAR * factor),
        min: inlineMinWidth(node, BODY_CHAR * factor),
      };
    }
    case 'blockquote':
      return (node.children ?? []).reduce(
        (acc, child) => {
          const widths = blockIntrinsicWidths(child, hasAsset);
          return {
            natural: Math.max(acc.natural, widths.natural + 12),
            min: Math.max(acc.min, widths.min + 12),
          };
        },
        { natural: 0, min: 0 },
      );
    case 'bulletList':
    case 'orderedList': {
      let natural = 0;
      let min = 0;
      const walk = (list: ContentNode, depth: number): void => {
        for (const item of list.children ?? []) {
          const indent = depth * 18 + 18;
          for (const child of item.children ?? []) {
            if (child.type === 'bulletList' || child.type === 'orderedList') {
              walk(child, depth + 1);
            } else {
              const widths = blockIntrinsicWidths(child, hasAsset);
              natural = Math.max(natural, widths.natural + indent);
              min = Math.max(min, widths.min + indent);
            }
          }
        }
      };
      walk(node, 0);
      return { natural, min };
    }
    case 'codeBlock': {
      const text = typeof node.attrs?.['text'] === 'string' ? node.attrs['text'] : '';
      const lines = text.split('\n');
      const longest = Math.max(1, ...lines.map((line) => line.length));
      return { natural: longest * CODE_CHAR, min: longest * CODE_CHAR };
    }
    case 'mathBlock': {
      const latex = typeof node.attrs?.['latex'] === 'string' ? node.attrs['latex'] : '';
      return { natural: Math.max(160, latex.length * BODY_CHAR), min: Math.max(80, latex.length * BODY_CHAR) };
    }
    case 'image': {
      const assetId = node.attrs?.['assetId'];
      if (typeof assetId === 'string' && !hasAsset(assetId)) return { natural: 0, min: 0 };
      const width = typeof node.attrs?.['width'] === 'number' ? node.attrs['width'] : 220;
      // The width attr is a preferred width, not a minimum: a page card caps
      // it at maxContentWidth and the image scales down.
      return { natural: width, min: 0 };
    }
    case 'table': {
      const rows = node.children ?? [];
      const columns = Math.max(1, ...rows.map((row) => row.children?.length ?? 0));
      let natural = 0;
      let min = 0;
      for (let column = 0; column < columns; column += 1) {
        let columnNatural = 0;
        let columnMin = 0;
        for (const row of rows) {
          const cell = row.children?.[column];
          if (!cell) continue;
          const text = inlineText(cell);
          columnNatural = Math.max(columnNatural, textWidth(text));
          columnMin = Math.max(columnMin, longestWordWidth(text));
        }
        natural += columnNatural + TABLE_CELL_PADDING;
        min += columnMin + TABLE_CELL_PADDING;
      }
      return { natural, min };
    }
    default:
      return { natural: BODY_CHAR * 20, min: BODY_CHAR * 8 };
  }
}

function contentIntrinsicWidths(content: ContentNode, hasAsset: (id: string) => boolean): { natural: number; min: number } {
  let natural = 0;
  let min = 0;
  for (const child of content.children ?? []) {
    const widths = blockIntrinsicWidths(child, hasAsset);
    natural = Math.max(natural, widths.natural);
    min = Math.max(min, widths.min);
  }
  return { natural, min };
}

function anchorIdsInMarks(node: ContentNode): string[] {
  const ids: string[] = [];
  for (const mark of node.marks ?? []) {
    if (mark.type === 'anchor' && typeof mark.attrs?.['anchorId'] === 'string') {
      ids.push(mark.attrs['anchorId'] as string);
    }
  }
  return ids;
}

function collectInlineAnchors(
  node: ContentNode,
  offset: number,
  out: Array<{ anchorId: string; offset: number; length: number }>,
): number {
  if (node.type === 'text') {
    const text = node.text ?? '';
    for (const anchorId of anchorIdsInMarks(node)) {
      out.push({ anchorId, offset, length: Math.max(1, text.length) });
    }
    return offset + text.length;
  }
  if (node.type === 'inlineMath') {
    const latex = typeof node.attrs?.['latex'] === 'string' ? node.attrs['latex'] : '';
    const anchorId = node.attrs?.['anchorId'];
    if (typeof anchorId === 'string') out.push({ anchorId, offset, length: Math.max(4, latex.length) });
    return offset + Math.max(1, latex.length);
  }
  if (node.type === 'image') {
    const anchorId = node.attrs?.['anchorId'];
    if (typeof anchorId === 'string') out.push({ anchorId, offset, length: 4 });
    return offset + 4;
  }
  let next = offset;
  for (const child of node.children ?? []) next = collectInlineAnchors(child, next, out);
  return next;
}

function listSegments(
  list: ContentNode,
  path: number[],
  depth: number,
  contentWidth: number,
  out: Array<{ kind: SegmentKind; nodePath: number[]; height: number; text: string; indent: number }>,
): void {
  const ordered = list.type === 'orderedList';
  const start = typeof list.attrs?.['start'] === 'number' ? list.attrs['start'] : 1;
  let index = 0;
  for (const [itemIndex, item] of (list.children ?? []).entries()) {
    index += 1;
    const number = ordered ? start + index - 1 : 1;
    const marker = ordered ? `${number}.` : '•';
    const indent = depth * 18 + 18;
    const directTexts: string[] = [];
    const nested: ContentNode[] = [];
    for (const child of item.children ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') nested.push(child);
      else directTexts.push(inlineText(child));
    }
    const text = directTexts.join(' ').trim();
    const available = Math.max(1, contentWidth - indent);
    const lines = Math.max(1, Math.ceil(textWidth(`${marker} ${text}`) / available));
    out.push({
      kind: 'list-item',
      nodePath: [...path, itemIndex],
      height: lines * BODY_LINE,
      text,
      indent,
    });
    for (const [nestedIndex, child] of nested.entries()) {
      listSegments(child, [...path, itemIndex, nestedIndex], depth + 1, contentWidth, out);
    }
  }
}

interface RawSegment {
  kind: SegmentKind;
  nodePath: number[];
  height: number;
  text?: string;
  indent?: number;
  tableKey?: string;
  rowIndex?: number;
  anchorOffsets?: Array<{ anchorId: string; offset: number; length: number }>;
}

function tableSegments(
  table: ContentNode,
  path: number[],
  contentWidth: number,
  out: RawSegment[],
  columnsOut: Record<string, number[]>,
): void {
  const rows = table.children ?? [];
  const columns = Math.max(1, ...rows.map((row) => row.children?.length ?? 0));
  const tableKey = path.join('.');
  const columnWidth = contentWidth / columns;
  columnsOut[tableKey] = Array.from({ length: columns }, () => columnWidth);
  for (const [rowIndex, row] of rows.entries()) {
    let maxLines = 1;
    for (const cell of row.children ?? []) {
      const text = inlineText(cell);
      const lines = Math.max(1, Math.ceil(textWidth(text) / Math.max(1, columnWidth - TABLE_CELL_PADDING)));
      maxLines = Math.max(maxLines, lines);
    }
    out.push({
      kind: 'table-row',
      nodePath: [...path, rowIndex],
      height: maxLines * BODY_LINE + TABLE_CELL_PADDING,
      tableKey,
      rowIndex,
    });
  }
}


function rawSegments(content: ContentNode, contentWidth: number, hasAsset: (id: string) => boolean): { segments: RawSegment[]; tableColumns: Record<string, number[]> } {
  const segments: RawSegment[] = [];
  const tableColumns: Record<string, number[]> = {};
  for (const [index, node] of (content.children ?? []).entries()) {
    const path = [index];
    switch (node.type) {
      case 'paragraph':
      case 'heading': {
        const factor =
          node.type === 'heading'
            ? (typeof node.attrs?.['level'] === 'number' && node.attrs['level'] === 1
              ? 1.3
              : typeof node.attrs?.['level'] === 'number' && node.attrs['level'] === 2
                ? 1.12
                : 1)
            : 1;
        const text = inlineText(node);
        const lines = Math.max(1, Math.ceil(textWidth(text, BODY_CHAR * factor) / Math.max(1, contentWidth)));
        const anchors: Array<{ anchorId: string; offset: number; length: number }> = [];
        collectInlineAnchors(node, 0, anchors);
        segments.push({
          kind: node.type === 'heading' ? 'heading' : 'paragraph',
          nodePath: path,
          height: lines * BODY_LINE * factor,
          text,
          anchorOffsets: anchors,
        });
        break;
      }
      case 'blockquote': {
        for (const [childIndex, child] of (node.children ?? []).entries()) {
          if (child.type !== 'paragraph') continue;
          const text = inlineText(child);
          const available = Math.max(1, contentWidth - 12);
          const lines = Math.max(1, Math.ceil(textWidth(text) / available));
          const anchors: Array<{ anchorId: string; offset: number; length: number }> = [];
          collectInlineAnchors(child, 0, anchors);
          const segment: RawSegment = {
            kind: 'blockquote-paragraph',
            nodePath: [...path, childIndex],
            height: lines * BODY_LINE,
            text,
            anchorOffsets: anchors,
          };
          segments.push(segment);
        }
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        const listOut: Array<{ kind: SegmentKind; nodePath: number[]; height: number; text: string; indent: number }> = [];
        listSegments(node, path, 0, contentWidth, listOut);
        for (const item of listOut) {
          segments.push({
            kind: 'list-item',
            nodePath: item.nodePath,
            height: item.height,
            text: item.text,
            indent: item.indent,
          });
        }
        break;
      }
      case 'codeBlock': {
        const text = typeof node.attrs?.['text'] === 'string' ? node.attrs['text'] : '';
        const lines = text.length > 0 ? text.split('\n') : [''];
        for (const [lineIndex, line] of lines.entries()) {
          segments.push({
            kind: 'code-line',
            nodePath: [...path, lineIndex],
            height: CODE_LINE,
            text: line,
          });
        }
        break;
      }
      case 'mathBlock': {
        segments.push({
          kind: 'math',
          nodePath: path,
          height: 48,
          text: typeof node.attrs?.['latex'] === 'string' ? node.attrs['latex'] : '',
        });
        break;
      }
      case 'image': {
        const assetId = node.attrs?.['assetId'];
        const missing = typeof assetId === 'string' && !hasAsset(assetId);
        const height = missing ? 80 : typeof node.attrs?.['height'] === 'number' ? node.attrs['height'] : 120;
        segments.push({ kind: 'image', nodePath: path, height });
        break;
      }
      case 'table': {
        tableSegments(node, path, contentWidth, segments, tableColumns);
        break;
      }
      default: {
        segments.push({ kind: 'paragraph', nodePath: path, height: BODY_LINE, text: inlineText(node) });
      }
    }
  }
  return { segments, tableColumns };
}

function measureAt(
  document: NoteDocument,
  block: ContentBlock,
  mode: MeasurementMode,
  contentWidth: number,
  intrinsic: { natural: number; min: number },
): BlockMeasurement {
  const hasAsset = (id: string): boolean => Boolean(document.assets[id]);
  const { segments: raw, tableColumns } = rawSegments(block.content, contentWidth, hasAsset);
  const options = DEFAULT_LAYOUT_OPTIONS;
  const labelHeight = block.label ? LABEL_LINE * Math.max(1, Math.ceil(textWidth(block.label, 9) / Math.max(1, contentWidth))) : 0;
  const contentTop = options.cardPadding + options.cardBorder + (block.label ? labelHeight + LABEL_GAP : 0);
  const segments: MeasuredSegment[] = [];
  const anchors: MeasuredAnchor[] = [];
  let cursor = 0;
  for (const [index, segment] of raw.entries()) {
    const topGap = index === 0 ? 0 : options.segmentGap;
    const y = cursor;
    const height = segment.height + topGap;
    const measured: MeasuredSegment = {
      index,
      kind: segment.kind,
      nodePath: segment.nodePath,
      y,
      height,
      breakableBefore: index > 0,
    };
    if (segment.tableKey) measured.tableKey = segment.tableKey;
    if (segment.rowIndex !== undefined) measured.rowIndex = segment.rowIndex;
    segments.push(measured);
    cursor += height;

    if (segment.anchorOffsets && segment.anchorOffsets.length > 0) {
      const indent = segment.indent ?? 0;
      const available = Math.max(1, contentWidth - indent);
      const charWidth = segment.kind === 'heading' ? BODY_CHAR * 1.12 : BODY_CHAR;
      const charsPerLine = Math.max(1, Math.floor(available / charWidth));
      const contentTopInSegment = y + topGap;
      for (const anchor of segment.anchorOffsets) {
        const line = Math.floor(anchor.offset / charsPerLine);
        const column = anchor.offset % charsPerLine;
        anchors.push({
          anchorId: anchor.anchorId,
          x: indent + column * charWidth,
          y: contentTopInSegment + line * BODY_LINE,
          width: Math.max(charWidth, anchor.length * charWidth),
          height: BODY_LINE,
          occurrence: anchors.filter((candidate) => candidate.anchorId === anchor.anchorId).length,
        });
      }
    }

    const node = block.content.children?.[segment.nodePath[0] ?? -1];
    if (node?.type === 'codeBlock') {
      const anchorId = node.attrs?.['anchorId'];
      if (typeof anchorId === 'string') {
        const token = typeof node.attrs?.['anchorToken'] === 'string' ? node.attrs['anchorToken'] : '';
        const lineText = segment.text ?? '';
        if (!token) {
          anchors.push({
            anchorId,
            x: 0,
            y: y + topGap,
            width: Math.min(120, contentWidth),
            height: CODE_LINE,
            occurrence: 0,
          });
        } else {
          let search = 0;
          while (search <= lineText.length) {
            const found = lineText.indexOf(token, search);
            if (found < 0) break;
            anchors.push({
              anchorId,
              x: found * CODE_CHAR,
              y: y + topGap,
              width: Math.max(CODE_CHAR, token.length * CODE_CHAR),
              height: CODE_LINE,
              occurrence: anchors.filter((candidate) => candidate.anchorId === anchorId).length,
            });
            search = found + Math.max(1, token.length);
          }
        }
      }
    }
    if (node?.type === 'mathBlock') {
      const anchorId = node.attrs?.['anchorId'];
      if (typeof anchorId === 'string') {
        anchors.push({
          anchorId,
          x: Math.max(0, contentWidth / 2 - 20),
          y: y + topGap,
          width: Math.min(40, contentWidth),
          height: Math.max(20, segment.height),
          occurrence: 0,
        });
      }
    }
    if (node?.type === 'image') {
      const anchorId = node.attrs?.['anchorId'];
      if (typeof anchorId === 'string') {
        const width = typeof node.attrs?.['width'] === 'number' ? node.attrs['width'] : 220;
        anchors.push({
          anchorId,
          x: 0,
          y: y + topGap,
          width: Math.min(width, contentWidth),
          height: segment.height,
          occurrence: 0,
        });
      }
    }
  }

  for (const [, list] of groupBy(anchors)) {
    list.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
    list.forEach((anchor, index) => {
      anchor.occurrence = index;
    });
  }

  const missingAssetIds: string[] = [];
  const walkAssets = (node: ContentNode): void => {
    if (node.type === 'image') {
      const assetId = node.attrs?.['assetId'];
      if (typeof assetId === 'string' && !document.assets[assetId]) missingAssetIds.push(assetId);
    }
    for (const child of node.children ?? []) walkAssets(child);
  };
  walkAssets(block.content);

  return {
    blockId: block.id,
    mode,
    cardWidth: contentWidth + 2 * (options.cardPadding + options.cardBorder),
    contentWidth,
    contentHeight: cursor,
    contentTop,
    labelHeight,
    cardHeight: contentTop + cursor + options.cardPadding + options.cardBorder,
    maxContentWidth: intrinsic.natural,
    minContentWidth: intrinsic.min,
    segments,
    anchors,
    tableColumns,
    missingAssetIds,
  };
}

function groupBy<T>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = (item as { anchorId?: string }).anchorId ?? '';
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

export function createEstimatedMeasurement(document: NoteDocument): MeasurementPort {
  return {
    measure(block: ContentBlock, mode: MeasurementMode): BlockMeasurement {
      const intrinsic = (() => {
        const widths = contentIntrinsicWidths(block.content, (id) => Boolean(document.assets[id]));
        const labelWidth = block.label ? textWidth(block.label, 9) : 0;
        const labelMin = block.label ? longestWordWidth(block.label, 9) : 0;
        return {
          natural: Math.max(widths.natural, labelWidth),
          min: Math.max(widths.min, labelMin),
        };
      })();
      let contentWidth: number;
      if (mode.kind === 'max-content') contentWidth = intrinsic.natural;
      else if (mode.kind === 'min-content') contentWidth = intrinsic.min;
      else contentWidth = mode.contentWidth;
      return measureAt(document, block, mode, Math.max(1, contentWidth), intrinsic);
    },
  };
}
