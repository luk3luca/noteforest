/**
 * Find-in-Page offset mapping (F4a, docs/design/highlight.md §6).
 *
 * One pure function answers the only question the Page highlight asks: given a
 * block, its rendered page segments and one engine result (block id + offsets in
 * the block projection), which rendered segments does the match cover, and at
 * which code-point offsets inside their text?
 *
 * It reuses the walk `editor/find-decorations.ts` already performs for
 * Continuous · the canonical block projection (`buildBlockAnchorIndex`):
 *
 * - a **text** result carries block-absolute projection offsets, so core's
 *   `textRangesForProjectionRange` gives the text-node ranges it covers (the
 *   same function the anchor layer uses, and the same projection
 *   `findSearchUnits` walks);
 * - a **code** result is an atomic unit and carries node-relative offsets, so
 *   `findSearchUnits` + `findRanges` rebuild the block's matches in the engine's
 *   own order and the result's `occurrence` index picks the unit. Two code
 *   blocks in one block can match at the same relative offset; the occurrence
 *   index is what keeps them apart.
 *
 * Page has no ProseMirror: a position is a page segment (`data-node-path`, the
 * path the page model already carries) plus a code-point offset into that
 * segment's rendered text. The DOM adapter in `find-highlight.ts` turns the
 * pair into a `Range`; nothing here touches the DOM, the paginator or the
 * measurement.
 *
 * A match that covers more than one segment (two paragraphs of one block, a
 * phrase across a page break, a phrase across two code lines) returns **one
 * range per covered segment**: one occurrence, N ranges, the same shape the
 * Continuous decoration has.
 */

import {
  buildBlockAnchorIndex,
  textRangesForProjectionRange,
  type ContentNode,
} from '@noteforest/core';
import { findRanges, findSearchUnits, type FindResult, type FindSearchUnit } from '../lib/find';
import type { PageRenderSegment } from './segments';

/**
 * The block shape the mapping reads: the canonical content the page projection
 * rendered, keyed by the id the result names. Core's `ContentBlock` assigns to
 * it directly.
 */
export interface PageFindBlock {
  id: string;
  content: ContentNode;
}

/** One paintable range: the segment element plus code-point offsets in it. */
export interface PageTextRange {
  /** `data-node-path` of the rendered segment that owns the text. */
  nodePath: number[];
  /** Code-point offset inside that segment's rendered text, inclusive. */
  start: number;
  /** Code-point offset inside that segment's rendered text, exclusive. */
  end: number;
}

export interface PageFindMapping {
  ranges: PageTextRange[];
  /**
   * True when the result has no page text at all (a formula, a stored quote, a
   * branch label, a chapter title) or when the code block is rendered inside an
   * atomic container (a table cell, a list item and a blockquote emit their own
   * segment, not one segment per code line). The caller records it and paints
   * nothing; it never blocks the batch.
   */
  unmapped: boolean;
}

export interface PageFindMappingInput {
  block: PageFindBlock;
  /** The block's page segments (the Page projection's `segmentsByBlock`). */
  segments: readonly PageRenderSegment[];
  /** The engine result for one occurrence. */
  result: Pick<FindResult, 'field' | 'start' | 'end' | 'occurrence'>;
  /** Query mode the results were produced with; needed to re-walk code units. */
  query: string;
  wholeWord?: boolean;
}

/** One delimiter for every node path in the Page pipeline. */
export function nodePathKey(path: readonly number[]): string {
  return path.join('.');
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

interface TextOwnerIndex {
  /** Projection text-node path -> the page segment that renders it. */
  ownerByPath: Map<string, PageRenderSegment>;
  /** Projection text-node path -> code-point offset inside that segment. */
  offsetByPath: Map<string, number>;
}

/**
 * The projection text as each page segment renders it.
 *
 * A page segment's rendered text is the concatenation of the text nodes it
 * contains, in projection order. Hard breaks, inline formulas and inline images
 * render an element with no addressable text (`<br>`, KaTeX, a replaced box), so
 * they contribute no width: the offset the DOM adapter sees is exactly this
 * running total.
 */
function textOwnerIndex(
  index: ReturnType<typeof buildBlockAnchorIndex>,
  segments: readonly PageRenderSegment[],
): TextOwnerIndex {
  const byKey = new Map<string, PageRenderSegment>();
  for (const segment of segments) byKey.set(nodePathKey(segment.nodePath), segment);
  const ownerByPath = new Map<string, PageRenderSegment>();
  const offsetByPath = new Map<string, number>();
  const cursor = new Map<string, number>();

  const ownerOf = (path: readonly number[]): PageRenderSegment | undefined => {
    // Deepest segment first: a list item owns its paragraph text, a table row
    // owns its cells' paragraphs, a paragraph owns its inline text.
    for (let length = path.length; length >= 1; length -= 1) {
      const found = byKey.get(nodePathKey(path.slice(0, length)));
      if (found !== undefined) return found;
    }
    return undefined;
  };

  for (const segment of index.projection.segments) {
    const owner = ownerOf(segment.nodePath);
    if (owner === undefined) continue;
    const key = nodePathKey(segment.nodePath);
    const ownerKey = nodePathKey(owner.nodePath);
    const position = cursor.get(ownerKey) ?? 0;
    ownerByPath.set(key, owner);
    offsetByPath.set(key, position);
    // A hard break renders one `<br>`, which stands for the projection's one
    // newline. Inline formulas and images render a replaced box instead of their
    // latex/alt text, so they contribute nothing.
    const width =
      segment.kind === 'text' || segment.kind === 'hardBreak'
        ? codePointLength(segment.text)
        : 0;
    cursor.set(ownerKey, position + width);
  }
  return { ownerByPath, offsetByPath };
}

/** A text result's block-absolute offsets as page segment ranges. */
function textRanges(
  index: ReturnType<typeof buildBlockAnchorIndex>,
  segments: readonly PageRenderSegment[],
  start: number,
  end: number,
): PageTextRange[] {
  const ranges: PageTextRange[] = [];
  const owners = textOwnerIndex(index, segments);
  for (const range of textRangesForProjectionRange(index.projection, start, end)) {
    const key = nodePathKey(range.nodePath);
    const owner = owners.ownerByPath.get(key);
    const base = owners.offsetByPath.get(key);
    if (owner === undefined || base === undefined) continue;
    ranges.push({
      nodePath: [...owner.nodePath],
      start: base + range.start,
      end: base + range.end,
    });
  }
  return ranges;
}

interface CodeHit {
  unit: FindSearchUnit;
  /** Node-relative code-point offsets, exactly as the engine reports them. */
  start: number;
  end: number;
}

/**
 * Every match of the query over the block's text and code units, in the
 * engine's occurrence order (`find-decorations.ts` numbers them the same way:
 * formulas never advance the index).
 */
function orderedHits(
  index: ReturnType<typeof buildBlockAnchorIndex>,
  query: string,
  wholeWord: boolean,
): CodeHit[] {
  const hits: CodeHit[] = [];
  for (const unit of findSearchUnits(index)) {
    if (unit.kind === 'formula') continue;
    for (const match of findRanges(unit.text, query, wholeWord)) {
      hits.push({ unit, start: match.start, end: match.end });
    }
  }
  return hits;
}

function absoluteOffset(hit: CodeHit, value: number): number {
  // Code and formula units start at their own offset 0; a text run carries the
  // projection offset of its first code point.
  return hit.unit.offset + value;
}

function sameOffsets(hit: CodeHit, start: number, end: number): boolean {
  return absoluteOffset(hit, hit.start) === start && absoluteOffset(hit, hit.end) === end;
}

/** One code line's own segment: `[codeBlockPath, lineIndex]`, one per line. */
function codeLineSegments(
  segments: readonly PageRenderSegment[],
  unitPath: readonly number[],
): Map<number, PageRenderSegment> {
  const lines = new Map<number, PageRenderSegment>();
  const key = nodePathKey(unitPath);
  for (const segment of segments) {
    if (segment.kind !== 'code-line') continue;
    if (segment.nodePath.length !== unitPath.length + 1) continue;
    if (nodePathKey(segment.nodePath.slice(0, -1)) !== key) continue;
    const lineIndex = segment.nodePath[segment.nodePath.length - 1];
    if (lineIndex !== undefined) lines.set(lineIndex, segment);
  }
  return lines;
}

/**
 * A code range split by line. Every page code line is its own segment, so a
 * match that spans a line break is one range per covered line; the newline
 * itself has no glyph and is never painted.
 */
function codeRanges(
  segments: readonly PageRenderSegment[],
  unit: FindSearchUnit,
  start: number,
  end: number,
): PageTextRange[] {
  const lines = codeLineSegments(segments, unit.nodePath);
  const ranges: PageTextRange[] = [];
  let offset = 0;
  for (const [lineIndex, line] of unit.text.split('\n').entries()) {
    const length = codePointLength(line);
    const from = Math.max(start, offset);
    const to = Math.min(end, offset + length);
    const segment = lines.get(lineIndex);
    if (to > from && segment !== undefined) {
      ranges.push({
        nodePath: [...segment.nodePath],
        start: from - offset,
        end: to - offset,
      });
    }
    offset += length + 1;
  }
  return ranges;
}

/**
 * Map one engine result onto the block's rendered page segments.
 *
 * Text results are located by their block-absolute offsets, so a debounced query
 * change can never paint a stale range in the wrong place. Code results are
 * located by the engine's occurrence index (their offsets are node-relative) and
 * verified against the reported offsets; if the index and the offsets disagree,
 * the offsets decide, and a result that matches neither is reported unmapped.
 */
export function mapFindResultToPageRanges(input: PageFindMappingInput): PageFindMapping {
  const { block, segments, result, query } = input;
  const wholeWord = input.wholeWord === true;
  if (result.field !== 'text' && result.field !== 'code') {
    return { ranges: [], unmapped: true };
  }
  const index = buildBlockAnchorIndex(block.id, block.content);
  if (result.field === 'text') {
    const ranges = textRanges(index, segments, result.start, result.end);
    return { ranges, unmapped: ranges.length === 0 };
  }

  const hits = orderedHits(index, query, wholeWord);
  const byOccurrence = hits[result.occurrence];
  const chosen =
    byOccurrence !== undefined &&
    byOccurrence.unit.kind === 'code' &&
    sameOffsets(byOccurrence, result.start, result.end)
      ? byOccurrence
      : hits.find(
          (hit) =>
            hit.unit.kind === 'code' && sameOffsets(hit, result.start, result.end),
        );
  if (chosen === undefined) return { ranges: [], unmapped: true };
  const ranges = codeRanges(segments, chosen.unit, chosen.start, chosen.end);
  return { ranges, unmapped: ranges.length === 0 };
}
