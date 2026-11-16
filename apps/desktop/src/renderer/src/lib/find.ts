/**
 * Find-in-note engine (`⌘F`, docs/design/find-bar.md §4).
 *
 * One pure, read-only pass over the canonical document. The scan is linear and
 * there is no index: every query walks the chapters and blocks once, in the
 * document reading order, and reports **one result per occurrence**.
 *
 * Searched fields (the approved list, nothing else):
 *
 * - block text (text nodes of the block body);
 * - code text (code blocks);
 * - LaTeX source, inline and display;
 * - anchor quotes (a match inside an anchor's range is an Anchor result with
 *   its anchor id; a stored quote with no content binding is an Anchor result
 *   on the record);
 * - branch labels (one result per label, on the branch source);
 * - chapter titles (one result per title).
 *
 * Matching is case-insensitive and literal: no regex, no accent folding. The
 * find surface has one **shared** query mode (F3): the query is normalized
 * (whitespace runs collapse to one space, ends are trimmed) and matched with
 * `\s+` between its words, so a line break inside a block matches a single
 * space. An optional whole-word rule bounds the match on both sides. The strict
 * `literalRanges`/`literalRangesUtf16` matchers stay untouched for anchor and
 * formula-term resolution, which must never become whitespace-loose.
 *
 * Offsets are Unicode code points. A text match reports **block-absolute**
 * offsets (`unit.offset + match.start`), so every occurrence in a block has its
 * own id even when separate text runs start with the same word; `snippetStart`
 * keeps the run-relative offset the snippet splitter needs. `occurrence` is the
 * 0-based index among the block's text-node matches and is what the Continuous
 * decoration uses to mark the current hit without a second model→editor
 * projection.
 *
 * The order is the outline order (D3): chapters, the chapter title, its
 * top-level blocks, then each block's children depth-first with anchored
 * children before direct children. `directChildIds` (core) owns that order; the
 * walk here only interleaves chapter titles and branch labels and keeps one
 * `seen` set so a shared child is reported once.
 */

import type { Anchor, Branch, ContentBlock, Document } from '@noteforest/core';
import {
  buildBlockAnchorIndex,
  compareAnchorResolutions,
  inspectAnchorBinding,
  resolveAnchor,
  type BlockAnchorIndex,
  type AnchorOccurrence,
} from '@noteforest/core';

/** The design's occurrence cap; the engine still reports the true total. */
export const FIND_RESULT_LIMIT = 100;

/** One line of context on each side of the match (the sidebar's future snippet). */
export const FIND_SNIPPET_CONTEXT = 40;

export type FindKind = 'text' | 'code' | 'formula' | 'anchor' | 'label' | 'chapter';

/** Which document field produced the match; the sidebar picks the face from it. */
export type FindField = 'text' | 'code' | 'formula' | 'quote' | 'label' | 'chapter';

export interface FindResult {
  /**
   * Stable per occurrence: field + owner + block-absolute offset (+ anchor or
   * branch id). A text match in a different run gets a different absolute
   * offset, so the sidebar list can use the id as a React key.
   */
  id: string;
  kind: FindKind;
  field: FindField;
  /** Block that owns the match; null for a chapter title. */
  blockId: string | null;
  chapterId: string | null;
  anchorId?: string;
  branchId?: string;
  /**
   * Unicode code point offsets. A text match is **block-absolute** (its
   * `unit.offset + match.start` in the block projection); code, formula, quote,
   * label and chapter fields are offsets inside their own field text (the code
   * node, the formula node, the quote/label/title).
   */
  start: number;
  end: number;
  /**
   * The match offset inside the field text the snippet was cut from: the
   * run-relative offset for a text match, the field offset otherwise. The
   * snippet splitter uses it to pick the right occurrence inside `snippet`.
   */
  snippetStart: number;
  /**
   * 0-based index among this block's text-node matches (text, code, and an
   * anchor hit inside either). Fields without a text node use 0.
   */
  occurrence: number;
  /** One-line context around the match; the bar never renders it. */
  snippet: string;
}

export interface FindReport {
  /** At most `limit` results, in document order. */
  results: FindResult[];
  /** Every occurrence in the document, including the truncated tail. */
  total: number;
  truncated: boolean;
}

export const EMPTY_FIND_REPORT: FindReport = { results: [], total: 0, truncated: false };

function collapsed(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Literal, case-insensitive matching
// ---------------------------------------------------------------------------

export interface LiteralRange {
  /** Unicode code point offsets in the original text. */
  start: number;
  end: number;
}

/** True when the string has a surrogate pair (UTF-16 offsets ≠ code points). */
function hasAstral(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) return true;
  }
  return false;
}

/**
 * Every literal, case-insensitive occurrence of `query` in `text`.
 *
 * This is the **strict** matcher: the query is used verbatim, with no trimming,
 * no whitespace collapsing and no whole-word rule. Anchor and formula-term
 * resolution call it and must keep that behaviour (F3); the find surface uses
 * `findRanges`.
 *
 * The common case (no surrogate pair, no case fold that changes the length)
 * scans the lowercased string with `indexOf`, where a UTF-16 offset equals a
 * code point offset. The rare case compares code points directly so a reported
 * offset always indexes the original string. A query is never a pattern.
 */
export function literalRanges(text: string, query: string): LiteralRange[] {
  if (query.length === 0 || text.length === 0) return [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  if (!hasAstral(haystack) && haystack.length === text.length) {
    const ranges: LiteralRange[] = [];
    let index = haystack.indexOf(needle);
    while (index >= 0) {
      ranges.push({ start: index, end: index + needle.length });
      index = haystack.indexOf(needle, index + Math.max(1, needle.length));
    }
    return ranges;
  }
  const points = Array.from(text);
  const folded = points.map((point) => point.toLowerCase());
  const target = Array.from(query).map((point) => point.toLowerCase());
  const ranges: LiteralRange[] = [];
  for (let start = 0; start + target.length <= folded.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < target.length; offset += 1) {
      if (folded[start + offset] !== target[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) ranges.push({ start, end: start + target.length });
  }
  return ranges;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integerField(record: Record<string, unknown> | null, key: string): number | null {
  if (record === null) return null;
  const value = record[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * Every literal, case-insensitive occurrence of `query` in `text` as UTF-16
 * offsets. ProseMirror positions are UTF-16 code units, so the Continuous
 * decoration needs this variant; the model offsets use `literalRanges`.
 *
 * Strict like `literalRanges`: callers that need the find surface's normalized,
 * whitespace-loose, whole-word mode use `findRanges`.
 */
export function literalRangesUtf16(text: string, query: string): LiteralRange[] {
  if (query.length === 0 || text.length === 0) return [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const ranges: LiteralRange[] = [];
  let index = haystack.indexOf(needle);
  while (index >= 0) {
    ranges.push({ start: index, end: Math.min(text.length, index + needle.length) });
    index = haystack.indexOf(needle, index + Math.max(1, needle.length));
  }
  return ranges;
}

/**
 * The find surface's one query mode: collapse every whitespace run to a single
 * space and trim. The input value itself is never rewritten; only matching is
 * normalized, so the caret and trailing spaces survive.
 */
export function normalizeFindQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** A whole word may not touch a letter, a number, or an underscore. */
const WORD_CHARACTER = /[\p{L}\p{N}_]/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * UTF-16 index → code point index for the whole string, or null when the two
 * are equal (no surrogate pair, so no conversion is needed).
 */
function codePointIndex(text: string): number[] | null {
  if (!hasAstral(text)) return null;
  const offsets = new Array<number>(text.length + 1);
  let point = 0;
  for (let index = 0; index < text.length; ) {
    offsets[index] = point;
    const code = text.codePointAt(index) ?? 0;
    const width = code > 0xffff ? 2 : 1;
    if (width === 2) offsets[index + 1] = point;
    index += width;
    point += 1;
  }
  offsets[text.length] = point;
  return offsets;
}

/**
 * Every occurrence of a find query in `text` under the shared query mode.
 *
 * The query is normalized (whitespace runs → one space, trimmed) and its words
 * are matched with `\s+` between them, so `come   qui` matches `come qui` and a
 * line break inside a block. With `wholeWord` a match counts only when the
 * characters immediately before and after it are not `\p{L}`, `\p{N}` or `_`.
 * Offsets are code points in the original text; the scan, the snippet splitter
 * and the Continuous decoration all call this function.
 */
export function findRanges(text: string, query: string, wholeWord = false): LiteralRange[] {
  const normalized = normalizeFindQuery(query);
  if (normalized.length === 0 || text.length === 0) return [];
  const pattern = new RegExp(
    normalized.split(' ').map(escapeRegExp).join('\\s+'),
    'giu',
  );
  const offsets = codePointIndex(text);
  const points = offsets === null ? null : Array.from(text);
  const length = points?.length ?? text.length;
  const characterAt = (position: number): string | undefined =>
    points === null ? text[position] : points[position];
  const ranges: LiteralRange[] = [];
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const start = offsets === null ? index : (offsets[index] ?? 0);
    const end =
      offsets === null ? index + match[0].length : (offsets[index + match[0].length] ?? 0);
    if (wholeWord) {
      const before = start > 0 ? characterAt(start - 1) : undefined;
      const after = end < length ? characterAt(end) : undefined;
      if (
        (before !== undefined && WORD_CHARACTER.test(before)) ||
        (after !== undefined && WORD_CHARACTER.test(after))
      ) {
        continue;
      }
    }
    ranges.push({ start, end });
  }
  return ranges;
}

// ---------------------------------------------------------------------------
// Snippets
// ---------------------------------------------------------------------------

/** One line around the match, ≈ 40 code points of context on each side. */
export function findSnippet(
  text: string,
  start: number,
  end: number,
  context = FIND_SNIPPET_CONTEXT,
): string {
  const points = Array.from(text);
  const from = Math.max(0, start - context);
  const to = Math.min(points.length, end + context);
  const body = collapsed(points.slice(from, to).join(''));
  return `${from > 0 ? '…' : ''}${body}${to < points.length ? '…' : ''}`;
}

// ---------------------------------------------------------------------------
// Anchor ranges
// ---------------------------------------------------------------------------

interface AnchorRange {
  anchorId: string;
  field: 'text' | 'code' | 'formula';
  /** Text ranges use projection offsets; atomic ranges use their node text. */
  start: number;
  end: number;
  /** Code and formula ranges are scoped to one node. */
  nodePath?: number[];
}

/** The formula node's code point range that a formula anchor binds. */
function formulaAnchorRange(anchor: Anchor, latex: string): { start: number; end: number } {
  const length = Array.from(latex).length;
  const selector = isRecord(anchor.selector) ? anchor.selector : null;
  if (selector !== null && selector['form'] === 'term' && typeof selector['latex'] === 'string') {
    const term = selector['latex'];
    if (term.length > 0) {
      const width = Array.from(term).length;
      const occurrences = literalRanges(latex, term).filter(
        (occurrence) => occurrence.end - occurrence.start === width,
      );
      const hint = integerField(selector, 'occurrenceHint');
      const index = hint === null ? 0 : Math.max(0, hint - 1);
      const chosen = occurrences[index] ?? occurrences[0];
      if (chosen !== undefined) return chosen;
    }
  }
  return { start: 0, end: length };
}

function compareNodePaths(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function sameNodePath(left: readonly number[], right: readonly number[]): boolean {
  return compareNodePaths(left, right) === 0;
}

function anchorRangeFor(
  anchor: Anchor,
  index: BlockAnchorIndex,
  occurrence: AnchorOccurrence | null,
  textRange: { start: number; end: number } | null,
): AnchorRange | null {
  if (anchor.kind === 'text') {
    if (textRange === null) return null;
    return {
      anchorId: anchor.id,
      field: 'text',
      start: textRange.start,
      end: textRange.end,
    };
  }
  if (occurrence === null) return null;
  if (anchor.kind === 'code' && occurrence.nodeType === 'codeBlock') {
    const unit = index.codeNodes.find((candidate) =>
      sameNodePath(candidate.nodePath, occurrence.nodePath),
    );
    if (unit === undefined) return null;
    const length = Array.from(unit.text).length;
    const selector = isRecord(anchor.selector) ? anchor.selector : null;
    const start = integerField(selector, 'startOffset');
    const end = integerField(selector, 'endOffset');
    if (start !== null && end !== null && start >= 0 && end <= length && start < end) {
      return { anchorId: anchor.id, field: 'code', start, end, nodePath: unit.nodePath };
    }
    return { anchorId: anchor.id, field: 'code', start: 0, end: length, nodePath: unit.nodePath };
  }
  if (
    anchor.kind === 'formula' &&
    (occurrence.nodeType === 'mathBlock' || occurrence.nodeType === 'inlineMath')
  ) {
    const unit = index.formulaNodes.find((candidate) =>
      sameNodePath(candidate.nodePath, occurrence.nodePath),
    );
    if (unit === undefined) return null;
    const range = formulaAnchorRange(anchor, unit.latex);
    return {
      anchorId: anchor.id,
      field: 'formula',
      start: range.start,
      end: range.end,
      nodePath: unit.nodePath,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Searchable units in content order
// ---------------------------------------------------------------------------

export interface FindSearchUnit {
  kind: 'text' | 'code' | 'formula';
  /** Content paths are lexicographic in document order. */
  nodePath: number[];
  text: string;
  /**
   * Projection offset of the unit's first code point. Anchor text ranges are
   * projection offsets, so a text match is compared as `offset + start`; the
   * result reports that same sum as its block-absolute `start`.
   */
  offset: number;
  /** Text runs expose their text/hard-break parts so the decoration can map back. */
  parts?: FindTextPart[];
}

/** One text or hard-break segment inside a text run. */
export interface FindTextPart {
  kind: 'text' | 'hardBreak';
  nodePath: number[];
  /** Code point offsets relative to the owning run's text. */
  start: number;
  end: number;
  text: string;
}

/**
 * Text segments, code blocks and formulas of one block in document order.
 *
 * Adjacent text and hard-break segments form one **text run**, separated only
 * by a projection barrier (a table cell or an atomic block, never by a plain
 * paragraph or hard-break boundary). The projection puts a newline at every
 * paragraph boundary and at every hard break, so a run's text can match a query
 * word sequence across a line break inside the block. Inline math, images and
 * atomic blocks break the run; they are searched as their own units.
 *
 * Display math is a barrier in the projection, so it only appears through
 * `formulaNodes`; inline math appears in both and is kept once, as a formula.
 */
export function findSearchUnits(index: BlockAnchorIndex): FindSearchUnit[] {
  const units: FindSearchUnit[] = [];
  const points = Array.from(index.projection.text);
  let run: FindSearchUnit | null = null;
  let lastEnd = -1;
  for (const segment of index.projection.segments) {
    if (segment.kind !== 'text' && segment.kind !== 'hardBreak') {
      run = null;
      lastEnd = segment.end;
      continue;
    }
    const split =
      run !== null &&
      index.projection.barriers.some(
        (barrier) => barrier.offset >= lastEnd && barrier.offset <= segment.start,
      );
    if (run === null || split) {
      run = {
        kind: 'text',
        nodePath: [...segment.nodePath],
        text: '',
        offset: segment.start,
        parts: [],
      };
      units.push(run);
    } else {
      // The projection writes the paragraph boundary newline between segments.
      run.text += points.slice(lastEnd, segment.start).join('');
    }
    const start = segment.start - run.offset;
    run.parts?.push({
      kind: segment.kind,
      nodePath: [...segment.nodePath],
      start,
      end: start + (segment.end - segment.start),
      text: segment.text,
    });
    run.text += segment.text;
    lastEnd = segment.end;
  }
  for (const node of index.formulaNodes) {
    units.push({ kind: 'formula', nodePath: node.nodePath, text: node.latex, offset: 0 });
  }
  for (const node of index.codeNodes) {
    units.push({ kind: 'code', nodePath: node.nodePath, text: node.text, offset: 0 });
  }
  units.sort((left, right) => compareNodePaths(left.nodePath, right.nodePath));
  return units;
}

/** `inspectAnchorBinding` per block index, cached: ranges and quotes share it. */
const inspections = new WeakMap<
  BlockAnchorIndex,
  Map<string, ReturnType<typeof inspectAnchorBinding>>
>();

function inspectionFor(
  index: BlockAnchorIndex,
  anchorId: string,
): ReturnType<typeof inspectAnchorBinding> {
  let map = inspections.get(index);
  if (map === undefined) {
    map = new Map();
    inspections.set(index, map);
  }
  const existing = map.get(anchorId);
  if (existing !== undefined) return existing;
  const inspection = inspectAnchorBinding(index, anchorId);
  map.set(anchorId, inspection);
  return inspection;
}

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

/**
 * Primary children of every block in outline order (anchored children first,
 * D3). Built from one branch pass with cached anchor resolutions so the scan
 * stays linear: calling `directChildIds` per block would rebuild the branch
 * list every time. `findReadingOrder` proves this equals the canonical helper.
 */
function primaryChildrenIndex(document: Document): Map<string, string[]> {
  const byParent = new Map<string, Branch[]>();
  for (const branch of Object.values(document.branches)) {
    if (branch.role !== 'primary') continue;
    const list = byParent.get(branch.source.blockId) ?? [];
    list.push(branch);
    byParent.set(branch.source.blockId, list);
  }
  const resolutions = new Map<string, ReturnType<typeof resolveAnchor>>();
  const resolutionOf = (anchorId: string): ReturnType<typeof resolveAnchor> => {
    const cached = resolutions.get(anchorId);
    if (cached !== undefined) return cached;
    const resolution = resolveAnchor(document, anchorId);
    resolutions.set(anchorId, resolution);
    return resolution;
  };
  const children = new Map<string, string[]>();
  for (const [parentId, branches] of byParent) {
    const anchored = branches.filter(
      (branch) =>
        branch.source.anchorId !== undefined &&
        document.blocks[branch.targetBlockId] !== undefined,
    );
    const direct = branches.filter(
      (branch) =>
        branch.source.anchorId === undefined &&
        document.blocks[branch.targetBlockId] !== undefined,
    );
    const byAnchor = new Map<string, Branch[]>();
    for (const branch of anchored) {
      const anchorId = branch.source.anchorId;
      if (anchorId === undefined) continue;
      const list = byAnchor.get(anchorId) ?? [];
      list.push(branch);
      byAnchor.set(anchorId, list);
    }
    const ordered: Branch[] = [];
    for (const anchorId of [...byAnchor.keys()].sort((left, right) => {
      const order = compareAnchorResolutions(resolutionOf(left), resolutionOf(right));
      return order !== 0 ? order : left < right ? -1 : left > right ? 1 : 0;
    })) {
      ordered.push(...(byAnchor.get(anchorId) ?? []));
    }
    ordered.push(...direct);
    children.set(
      parentId,
      ordered.map((branch) => branch.targetBlockId),
    );
  }
  return children;
}

/** Branch order inside one source: reference order, then branch id. */
function branchesBySource(document: Document): Map<string, Branch[]> {
  const bySource = new Map<string, Branch[]>();
  for (const branch of Object.values(document.branches)) {
    const list = bySource.get(branch.source.blockId) ?? [];
    list.push(branch);
    bySource.set(branch.source.blockId, list);
  }
  for (const list of bySource.values()) {
    list.sort((left, right) => {
      if (left.order !== right.order) return left.order < right.order ? -1 : 1;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
  }
  return bySource;
}

function anchorsByBlock(document: Document): Map<string, Anchor[]> {
  const byBlock = new Map<string, Anchor[]>();
  for (const anchor of Object.values(document.anchors)) {
    const list = byBlock.get(anchor.blockId) ?? [];
    list.push(anchor);
    byBlock.set(anchor.blockId, list);
  }
  for (const list of byBlock.values()) {
    list.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  }
  return byBlock;
}

/** Stored display quote: the anchor quote first, then the selector fields. */
function storedQuote(anchor: Anchor): string {
  if (typeof anchor.quote === 'string' && anchor.quote.length > 0) return anchor.quote;
  const selector = isRecord(anchor.selector) ? anchor.selector : null;
  if (selector === null) return '';
  for (const key of ['quote', 'latex', 'label']) {
    const value = selector[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

interface ScanState {
  query: string;
  wholeWord: boolean;
  limit: number;
  results: FindResult[];
  total: number;
}

function pushResult(
  state: ScanState,
  result: Omit<FindResult, 'id'>,
): void {
  state.total += 1;
  if (state.results.length >= state.limit) return;
  const owner = result.blockId ?? result.chapterId ?? '';
  const suffix = result.anchorId ?? result.branchId ?? '';
  state.results.push({
    ...result,
    id: `${result.field}:${owner}:${result.start}:${suffix}`,
  });
}

function scanBlock(
  state: ScanState,
  block: ContentBlock,
  chapterId: string | null,
  anchors: readonly Anchor[],
  labels: readonly Branch[],
): void {
  const index = buildBlockAnchorIndex(block.id, block.content);
  const ranges: AnchorRange[] = [];
  for (const anchor of anchors) {
    const inspection = inspectionFor(index, anchor.id);
    const range = anchorRangeFor(
      anchor,
      index,
      inspection.occurrences[0] ?? null,
      inspection.textRange,
    );
    if (range !== null) ranges.push(range);
  }

  let occurrence = 0;
  for (const unit of findSearchUnits(index)) {
    const matches = findRanges(unit.text, state.query, state.wholeWord);
    for (const match of matches) {
      const anchor = ranges.find(
        (range) =>
          range.field === unit.kind &&
          (range.nodePath === undefined || sameNodePath(range.nodePath, unit.nodePath)) &&
          range.start <= match.start + unit.offset &&
          range.end >= match.end + unit.offset,
      );
      // Only text and code have a text node the decoration can mark; an
      // anchor hit inside either still advances the block's occurrence count.
      const textNode = unit.kind === 'text' || unit.kind === 'code';
      pushResult(state, {
        kind: anchor === undefined ? unit.kind : 'anchor',
        field: unit.kind,
        blockId: block.id,
        chapterId,
        ...(anchor === undefined ? {} : { anchorId: anchor.anchorId }),
        // Block-absolute for text (the projection offset makes the id unique
        // across runs); code and formula units start at their own offset 0.
        start: unit.offset + match.start,
        end: unit.offset + match.end,
        snippetStart: match.start,
        occurrence: textNode ? occurrence : 0,
        snippet: findSnippet(unit.text, match.start, match.end),
      });
      if (textNode) occurrence += 1;
    }
  }

  // A stored quote with no content binding is an Anchor result on the record.
  for (const anchor of anchors) {
    const inspection = inspectionFor(index, anchor.id);
    if (inspection.presence !== 'none') continue;
    const quote = storedQuote(anchor);
    if (quote.length === 0) continue;
    for (const match of findRanges(quote, state.query, state.wholeWord)) {
      pushResult(state, {
        kind: 'anchor',
        field: 'quote',
        blockId: block.id,
        chapterId,
        anchorId: anchor.id,
        start: match.start,
        end: match.end,
        snippetStart: match.start,
        occurrence: 0,
        snippet: collapsed(quote),
      });
    }
  }

  // One result per branch label; the source block owns the position.
  for (const branch of labels) {
    const label = branch.label;
    if (typeof label !== 'string' || label.length === 0) continue;
    const first = findRanges(label, state.query, state.wholeWord)[0];
    if (first === undefined) continue;
    pushResult(state, {
      kind: 'label',
      field: 'label',
      blockId: block.id,
      chapterId,
      branchId: branch.id,
      start: first.start,
      end: first.end,
      snippetStart: first.start,
      occurrence: 0,
      snippet: collapsed(label),
    });
  }
}

export interface FindOptions {
  /** Whole-word matching for the find surface; off by default. */
  wholeWord?: boolean;
  /** The occurrence cap; the engine still reports the true total. */
  limit?: number;
}

/**
 * Every occurrence of `query` in the document, in reading order. The query is
 * normalized once at entry; an empty normalized query has no results and the
 * caller's raw input value is never rewritten. Pure: nothing is mutated and the
 * same input always yields the same report.
 */
export function findInDocument(
  document: Document,
  query: string,
  options: FindOptions = {},
): FindReport {
  const normalized = normalizeFindQuery(query);
  if (normalized.length === 0) return EMPTY_FIND_REPORT;
  const state: ScanState = {
    query: normalized,
    wholeWord: options.wholeWord === true,
    limit: options.limit ?? FIND_RESULT_LIMIT,
    results: [],
    total: 0,
  };
  const children = primaryChildrenIndex(document);
  const labels = branchesBySource(document);
  const anchors = anchorsByBlock(document);
  const seen = new Set<string>();

  const visit = (blockId: string, chapterId: string | null): void => {
    if (seen.has(blockId)) return;
    const block = document.blocks[blockId];
    if (block === undefined) return;
    seen.add(blockId);
    scanBlock(state, block, chapterId, anchors.get(blockId) ?? [], labels.get(blockId) ?? []);
    for (const childId of children.get(blockId) ?? []) visit(childId, chapterId);
  };

  for (const chapter of document.chapters) {
    const title = chapter.title ?? '';
    const first =
      title.length === 0 ? undefined : findRanges(title, normalized, state.wholeWord)[0];
    if (first !== undefined) {
      pushResult(state, {
        kind: 'chapter',
        field: 'chapter',
        blockId: null,
        chapterId: chapter.id,
        start: first.start,
        end: first.end,
        snippetStart: first.start,
        occurrence: 0,
        snippet: collapsed(title),
      });
    }
    for (const blockId of chapter.topLevelBlockIds) visit(blockId, chapter.id);
  }

  return {
    results: state.results,
    total: state.total,
    truncated: state.total > state.results.length,
  };
}

/**
 * Canonical reading order used by the engine (chapter roots, then DFS with
 * anchored children first). Exported for the order regression test.
 */
export function findReadingOrder(document: Document): string[] {
  const children = primaryChildrenIndex(document);
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (blockId: string): void => {
    if (seen.has(blockId) || document.blocks[blockId] === undefined) return;
    seen.add(blockId);
    order.push(blockId);
    for (const childId of children.get(blockId) ?? []) visit(childId);
  };
  for (const chapter of document.chapters) {
    for (const blockId of chapter.topLevelBlockIds) visit(blockId);
  }
  return order;
}
