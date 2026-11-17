/**
 * Find-in-Page painting (F4a, docs/design/highlight.md §6).
 *
 * The page is measured, so a find match may never wrap text in spans: that would
 * change the measured DOM and could move the pagination. Matches are painted
 * with the CSS Custom Highlight API instead — two registry names over `Range`s
 * that point at text already on the page:
 *
 * - `nf-find`: every match of the query inside the mounted pages;
 * - `nf-find-current`: the current occurrence, all of its ranges (one
 *   occurrence, N ranges), painted on top as a stronger tint plus an underline.
 *
 * The registry is document-global, so exactly one Page surface owns it: a
 * repaint replaces both names, and a clear only happens when the caller is the
 * surface that painted. `NF-` names are page-local: the print compositor builds
 * its own DOM from the print model, never registers a highlight, and its
 * stylesheet scope (`.nf-page-view`) does not match the printed sheets.
 *
 * Cost: one DOM pass for the mounted segments and one block projection per
 * matched block. No model run, no measurement, no layout read.
 */

import type { FindResult } from '../lib/find';
import { mapFindResultToPageRanges, nodePathKey, type PageFindBlock } from './find-page-ranges';
import type { ProjectedPage } from './projection';
import type { PageRenderSegment } from './segments';

export const FIND_HIGHLIGHT_NAME = 'nf-find';
export const FIND_CURRENT_HIGHLIGHT_NAME = 'nf-find-current';

/**
 * Nodes that render no addressable text: a list marker, KaTeX, a replaced
 * image, a missing-asset placeholder, an unsupported node. The offset mapping
 * counts exactly the text nodes this walk keeps, plus one for every `<br>` (the
 * one newline a hard break stands for).
 */
const SKIPPED_TEXT = [
  'img',
  '.nf-li-marker',
  '.nf-math',
  '.nf-inline-image',
  '.nf-figure',
  '.nf-missing-asset',
  '.nf-unknown-node',
].join(', ');

export interface PageFindPaintInput {
  /** The `.nf-page-view` element: the only DOM the ranges may point into. */
  root: HTMLElement | null;
  /** The shared Page projection, one entry per page. */
  pages: readonly ProjectedPage[];
  contentBlocks: Readonly<Record<string, PageFindBlock>>;
  /** The engine's result set (already capped and ordered). */
  results: readonly FindResult[];
  currentId: string | null;
  /** Query mode the results were produced with. */
  query: string;
  wholeWord: boolean;
}

export interface PageFindPaintReport {
  /** False when the runtime has no CSS Custom Highlight API. */
  supported: boolean;
  /** Registered ranges: every match, then the current occurrence. */
  ranges: number;
  currentRanges: number;
  /**
   * Result ids the page DOM cannot address (a code block rendered inside a
   * table cell, a list item or a blockquote). Recorded, never fatal.
   */
  unmapped: string[];
}

interface TextSpan {
  node: Text;
  /** Code-point offsets inside the segment's rendered text. */
  start: number;
  end: number;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** UTF-16 offset of one code point offset inside a text node. */
function utf16Offset(text: string, codePointOffset: number): number {
  if (codePointOffset <= 0) return 0;
  let index = 0;
  let count = 0;
  for (const point of text) {
    if (count === codePointOffset) return index;
    index += point.length;
    count += 1;
  }
  return text.length;
}

function textSpans(element: Element): TextSpan[] {
  const spans: TextSpan[] = [];
  let offset = 0;
  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      const length = codePointLength(text.data);
      if (length > 0) {
        spans.push({ node: text, start: offset, end: offset + length });
        offset += length;
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const child = node as Element;
    if (child.localName === 'br') {
      // One `<br>` is the one newline a hard break contributes to the block
      // text; it has no text node, so it only advances the offset.
      offset += 1;
      return;
    }
    if (child.matches(SKIPPED_TEXT)) return;
    for (const next of child.childNodes) visit(next);
  };
  for (const child of element.childNodes) visit(child);
  return spans;
}

function positionAt(
  spans: readonly TextSpan[],
  offset: number,
  end: boolean,
): { node: Text; offset: number } | null {
  for (const span of spans) {
    if (offset <= span.start) return { node: span.node, offset: 0 };
    if (offset < span.end) {
      return { node: span.node, offset: utf16Offset(span.node.data, offset - span.start) };
    }
    if (offset === span.end) {
      // A boundary between two text nodes: an end stays on the left node, a
      // start moves to the right one, so a range never reverses.
      if (!end) continue;
      return { node: span.node, offset: span.node.data.length };
    }
  }
  const last = spans[spans.length - 1];
  return last === undefined ? null : { node: last.node, offset: last.node.data.length };
}

/** One `Range` over the segment's rendered text, or null when it cannot exist. */
function rangeForOffsets(element: Element, start: number, end: number): Range | null {
  if (end <= start) return null;
  const spans = textSpans(element);
  const from = positionAt(spans, start, false);
  const to = positionAt(spans, end, true);
  if (from === null || to === null) return null;
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range.collapsed ? null : range;
}

export function supportsCssHighlights(): boolean {
  return (
    typeof CSS !== 'undefined' &&
    CSS.highlights !== undefined &&
    CSS.highlights !== null &&
    typeof Highlight === 'function' &&
    typeof Range === 'function'
  );
}

/** The Page surface that owns the registry; another surface never clears it. */
let paintedRoot: Element | null = null;

export function clearPageFindHighlights(root?: Element): void {
  if (!supportsCssHighlights()) return;
  if (root !== undefined && paintedRoot !== null && paintedRoot !== root) return;
  paintedRoot = null;
  CSS.highlights.delete(FIND_HIGHLIGHT_NAME);
  CSS.highlights.delete(FIND_CURRENT_HIGHLIGHT_NAME);
}

function register(name: string, ranges: readonly Range[]): void {
  if (ranges.length === 0) {
    CSS.highlights.delete(name);
    return;
  }
  CSS.highlights.set(name, new Highlight(...ranges));
}

/**
 * Paint the current result set into the mounted pages. Idempotent: every call
 * replaces both registry names, so an unmounted page's ranges never survive a
 * scroll, a jump or a page-model run.
 */
export function paintPageFind(input: PageFindPaintInput): PageFindPaintReport {
  const report: PageFindPaintReport = {
    supported: supportsCssHighlights(),
    ranges: 0,
    currentRanges: 0,
    unmapped: [],
  };
  if (!report.supported) return report;
  const root = input.root;
  if (root === null) {
    clearPageFindHighlights();
    return report;
  }
  paintedRoot = root;

  // Every page contributes the same segment list for one block (the projection
  // caches it), so the first occurrence is the whole block.
  const segmentsByBlock = new Map<string, readonly PageRenderSegment[]>();
  for (const page of input.pages) {
    for (const [blockId, segments] of Object.entries(page.segmentsByBlock)) {
      if (!segmentsByBlock.has(blockId)) segmentsByBlock.set(blockId, segments);
    }
  }
  // Only the mounted pages have a DOM; an unmounted page is an exact-size
  // placeholder. Ranges for a block that is not on screen are simply absent.
  //
  // Node paths are per block (`"0"` is the first segment of every card), so the
  // element map is keyed by the fragment's block id first and the path second.
  const mounted = new Set<string>();
  const segmentElements = new Map<string, Map<string, Element>>();
  for (const fragment of root.querySelectorAll<HTMLElement>('[data-fragment-block]')) {
    const blockId = fragment.dataset['fragmentBlock'];
    if (blockId === undefined) continue;
    mounted.add(blockId);
    const byPath = segmentElements.get(blockId) ?? new Map<string, Element>();
    for (const element of fragment.querySelectorAll<HTMLElement>('[data-node-path]')) {
      const key = element.dataset['nodePath'];
      if (key !== undefined && !byPath.has(key)) byPath.set(key, element);
    }
    segmentElements.set(blockId, byPath);
  }

  const all: Range[] = [];
  const current: Range[] = [];
  for (const result of input.results) {
    if (result.blockId === null || !mounted.has(result.blockId)) continue;
    // Only text and code have page text: a chapter title, a branch label or a
    // stored quote is a navigation target, not something to paint.
    if (result.field !== 'text' && result.field !== 'code') continue;
    const block = input.contentBlocks[result.blockId];
    const segments = segmentsByBlock.get(result.blockId);
    if (block === undefined || segments === undefined) continue;
    const mapping = mapFindResultToPageRanges({
      block,
      segments,
      result,
      query: input.query,
      wholeWord: input.wholeWord,
    });
    const ranges: Range[] = [];
    const byPath = segmentElements.get(result.blockId);
    for (const range of mapping.ranges) {
      const element = byPath?.get(nodePathKey(range.nodePath));
      if (element === undefined) continue;
      const domRange = rangeForOffsets(element, range.start, range.end);
      if (domRange !== null) ranges.push(domRange);
    }
    if (ranges.length === 0) {
      report.unmapped.push(result.id);
      continue;
    }
    all.push(...ranges);
    if (result.id === input.currentId) current.push(...ranges);
  }

  // Delete first: the registry is ordered, so re-setting both names keeps the
  // current occurrence painted on top of the resting tint.
  CSS.highlights.delete(FIND_HIGHLIGHT_NAME);
  CSS.highlights.delete(FIND_CURRENT_HIGHLIGHT_NAME);
  register(FIND_HIGHLIGHT_NAME, all);
  register(FIND_CURRENT_HIGHLIGHT_NAME, current);
  report.ranges = all.length;
  report.currentRanges = current.length;
  return report;
}
