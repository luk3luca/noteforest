/**
 * Anchor binding, content projection, and resolution (M3a1).
 *
 * Everything in this module is pure: it reads canonical content and returns
 * derived values. No function mutates the input document, content tree, anchor
 * record, or selector. `lastKnown` is deliberately never read here; it is a
 * repair hint, not a resolution input.
 *
 * Binding shapes follow `docs/adr/0005-anchor-binding-and-identity.md`:
 * - text: one `anchor` mark carrying a sorted `anchorIds` array per text node;
 * - formula/code/image: a sorted `attrs.anchorIds` array on the atomic node;
 * - legacy single `anchorId` strings are read for M2 compatibility only.
 */

import type { AssetAvailabilityIndex } from './assets.js';
import type {
  Anchor,
  AnchorKind,
  ContentBlock,
  ContentMark,
  ContentNode,
  Document,
  JsonObject,
} from './types.js';

export const ANCHOR_MARK_TYPE = 'anchor';
export const ANCHOR_IDS_ATTR = 'anchorIds';
export const LEGACY_ANCHOR_ID_ATTR = 'anchorId';
export const IMAGE_PLACEHOLDER = '\uFFFC';

const ANCHOR_KINDS: readonly AnchorKind[] = ['text', 'formula', 'code', 'image'];
const ATOMIC_ANCHOR_NODE_TYPES = ['mathBlock', 'inlineMath', 'codeBlock', 'image'] as const;
const FORMULA_NODE_TYPES = ['mathBlock', 'inlineMath'] as const;
const BLOCK_PARENT_TYPES = new Set([
  'doc',
  'blockquote',
  'listItem',
  'bulletList',
  'orderedList',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
]);
const TABLE_CELL_TYPES = new Set(['tableCell', 'tableHeader']);
const BLOCK_LEAF_TYPES = new Set([
  'paragraph',
  'heading',
  'mathBlock',
  'codeBlock',
  'image',
  'horizontalRule',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isKnownAnchorKind(value: unknown): value is AnchorKind {
  return typeof value === 'string' && (ANCHOR_KINDS as readonly string[]).includes(value);
}

function isAtomicAnchorNodeType(nodeType: string): boolean {
  return (ATOMIC_ANCHOR_NODE_TYPES as readonly string[]).includes(nodeType);
}

function isFormulaNodeType(nodeType: string): boolean {
  return (FORMULA_NODE_TYPES as readonly string[]).includes(nodeType);
}

/** Valid child nodes with their original indices; malformed children are skipped. */
function childEntries(node: ContentNode): Array<[number, ContentNode]> {
  if (!Array.isArray(node.children)) return [];
  const entries: Array<[number, ContentNode]> = [];
  for (const [index, child] of node.children.entries()) {
    if (isRecord(child) && isString(child.type)) entries.push([index, child as ContentNode]);
  }
  return entries;
}

function textValue(node: ContentNode): string {
  return typeof node.text === 'string' ? node.text : '';
}

// ---------------------------------------------------------------------------
// Selector shapes (spec §4.4, ADR-0005 §2, design §2.4)
// ---------------------------------------------------------------------------

export interface AnchorRect extends JsonObject {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextAnchorSelector extends JsonObject {
  kind: 'text';
  quote: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
}

export interface FormulaWholeAnchorSelector extends JsonObject {
  kind: 'formula';
  form: 'whole';
  latex: string;
}

export interface FormulaTermAnchorSelector extends JsonObject {
  kind: 'formula';
  form: 'term';
  latex: string;
  latexStart?: number;
  occurrenceHint?: number;
  latexPrefix?: string;
  latexSuffix?: string;
}

export type FormulaAnchorSelector = FormulaWholeAnchorSelector | FormulaTermAnchorSelector;

export interface CodeAnchorSelector extends JsonObject {
  kind: 'code';
  quote: string;
  form?: 'whole' | 'range';
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
  /** Unicode code point offset, inclusive. */
  startOffset?: number;
  /** Unicode code point offset, exclusive. */
  endOffset?: number;
  lineStart?: number;
  lineEnd?: number;
}

export interface ImageAnchorSelector extends JsonObject {
  kind: 'image';
  assetId: string;
  rect: AnchorRect;
  crop?: AnchorRect;
  point: boolean;
  label?: string;
}

/** Unknown kinds are preserved by A12 and flagged, never dropped. */
export interface UnknownAnchorSelector extends JsonObject {
  kind: string;
}

export type AnchorSelector =
  | TextAnchorSelector
  | FormulaAnchorSelector
  | CodeAnchorSelector
  | ImageAnchorSelector
  | UnknownAnchorSelector;

export interface AnchorSelectorIssue {
  code: 'invalid-anchor-selector' | 'unsupported-anchor-kind';
  message: string;
}

export interface AnchorSelectorValidation {
  selector: AnchorSelector | null;
  issues: AnchorSelectorIssue[];
}

function issue(
  code: AnchorSelectorIssue['code'],
  message: string,
): AnchorSelectorIssue {
  return { code, message };
}

function validateRectValue(
  value: unknown,
  label: string,
  issues: AnchorSelectorIssue[],
): boolean {
  if (!isRecord(value)) {
    issues.push(issue('invalid-anchor-selector', `${label} must be a normalized rect`));
    return false;
  }
  let ok = true;
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const entry = value[key];
    if (!isFiniteNumber(entry)) {
      issues.push(issue('invalid-anchor-selector', `${label}.${key} must be a finite number`));
      ok = false;
    } else if (entry < 0 || entry > 1) {
      issues.push(issue('invalid-anchor-selector', `${label}.${key} must be within 0–1`));
      ok = false;
    }
  }
  if (!ok) return false;
  const x = value['x'] as number;
  const y = value['y'] as number;
  const width = value['width'] as number;
  const height = value['height'] as number;
  if (x + width > 1 + 1e-9 || y + height > 1 + 1e-9) {
    issues.push(issue('invalid-anchor-selector', `${label} must fit inside 0–1`));
    ok = false;
  }
  return ok;
}

/**
 * Validate a selector independently of its anchor record.
 *
 * Selector problems are warnings in `validateDocument` (A5): the record is
 * preserved, flagged for repair, and never silently rewritten.
 */
export function validateAnchorSelector(
  value: unknown,
  expectedKind?: AnchorKind,
): AnchorSelectorValidation {
  const issues: AnchorSelectorIssue[] = [];
  if (!isRecord(value)) {
    issues.push(issue('invalid-anchor-selector', 'selector must be an object'));
    return { selector: null, issues };
  }
  const kindValue = value['kind'];
  if (!isString(kindValue) || kindValue.length === 0) {
    issues.push(issue('invalid-anchor-selector', 'selector.kind must be a string'));
    return { selector: null, issues };
  }
  if (expectedKind !== undefined && kindValue !== expectedKind) {
    issues.push(
      issue(
        'invalid-anchor-selector',
        `selector.kind "${kindValue}" does not match anchor.kind "${expectedKind}"`,
      ),
    );
  }
  if (!isKnownAnchorKind(kindValue)) {
    issues.push(issue('unsupported-anchor-kind', `unknown anchor selector kind "${kindValue}"`));
    return { selector: value as UnknownAnchorSelector, issues };
  }

  if (kindValue === 'text') {
    const quote = value['quote'];
    if (!isString(quote) || quote.length === 0) {
      issues.push(issue('invalid-anchor-selector', 'text selector.quote must be a non-empty string'));
    }
    for (const key of ['prefix', 'suffix'] as const) {
      if (value[key] !== undefined && !isString(value[key])) {
        issues.push(issue('invalid-anchor-selector', `text selector.${key} must be a string`));
      }
    }
    const hint = value['occurrenceHint'];
    if (hint !== undefined && (!isInteger(hint) || hint < 1)) {
      issues.push(issue('invalid-anchor-selector', 'occurrenceHint must be a positive integer'));
    }
    return { selector: value as TextAnchorSelector, issues };
  }

  if (kindValue === 'formula') {
    const form = value['form'];
    if (form !== 'whole' && form !== 'term') {
      issues.push(issue('invalid-anchor-selector', 'formula selector.form must be "whole" or "term"'));
    }
    const latex = value['latex'];
    if (!isString(latex)) {
      issues.push(issue('invalid-anchor-selector', 'formula selector.latex must be a string'));
    } else if (form === 'term' && latex.length === 0) {
      issues.push(issue('invalid-anchor-selector', 'formula term selector.latex must not be empty'));
    }
    for (const key of ['latexPrefix', 'latexSuffix'] as const) {
      if (value[key] !== undefined && !isString(value[key])) {
        issues.push(issue('invalid-anchor-selector', `formula selector.${key} must be a string`));
      }
    }
    if (value['latexStart'] !== undefined && (!isInteger(value['latexStart']) || value['latexStart'] < 0)) {
      issues.push(issue('invalid-anchor-selector', 'formula selector.latexStart must be a non-negative integer'));
    }
    if (
      value['occurrenceHint'] !== undefined &&
      (!isInteger(value['occurrenceHint']) || value['occurrenceHint'] < 1)
    ) {
      issues.push(issue('invalid-anchor-selector', 'occurrenceHint must be a positive integer'));
    }
    return { selector: value as FormulaAnchorSelector, issues };
  }

  if (kindValue === 'code') {
    const quote = value['quote'];
    if (!isString(quote) || quote.length === 0) {
      issues.push(issue('invalid-anchor-selector', 'code selector.quote must be a non-empty string'));
    }
    if (value['form'] !== undefined && value['form'] !== 'whole' && value['form'] !== 'range') {
      issues.push(issue('invalid-anchor-selector', 'code selector.form must be "whole" or "range"'));
    }
    for (const key of ['prefix', 'suffix'] as const) {
      if (value[key] !== undefined && !isString(value[key])) {
        issues.push(issue('invalid-anchor-selector', `code selector.${key} must be a string`));
      }
    }
    if (
      value['occurrenceHint'] !== undefined &&
      (!isInteger(value['occurrenceHint']) || value['occurrenceHint'] < 1)
    ) {
      issues.push(issue('invalid-anchor-selector', 'occurrenceHint must be a positive integer'));
    }
    const start = value['startOffset'];
    const end = value['endOffset'];
    if (start !== undefined && (!isInteger(start) || start < 0)) {
      issues.push(issue('invalid-anchor-selector', 'code selector.startOffset must be a non-negative integer'));
    }
    if (end !== undefined && (!isInteger(end) || end < 0)) {
      issues.push(issue('invalid-anchor-selector', 'code selector.endOffset must be a non-negative integer'));
    }
    if ((start === undefined) !== (end === undefined)) {
      issues.push(issue('invalid-anchor-selector', 'code offsets must be present together'));
    } else if (isInteger(start) && isInteger(end) && start > end) {
      issues.push(issue('invalid-anchor-selector', 'code startOffset must not exceed endOffset'));
    }
    const lineStart = value['lineStart'];
    const lineEnd = value['lineEnd'];
    if (lineStart !== undefined && (!isInteger(lineStart) || lineStart < 1)) {
      issues.push(issue('invalid-anchor-selector', 'code selector.lineStart must be a positive integer'));
    }
    if (lineEnd !== undefined && (!isInteger(lineEnd) || lineEnd < 1)) {
      issues.push(issue('invalid-anchor-selector', 'code selector.lineEnd must be a positive integer'));
    }
    if ((lineStart === undefined) !== (lineEnd === undefined)) {
      issues.push(issue('invalid-anchor-selector', 'code line hints must be present together'));
    } else if (isInteger(lineStart) && isInteger(lineEnd) && lineStart > lineEnd) {
      issues.push(issue('invalid-anchor-selector', 'code lineStart must not exceed lineEnd'));
    }
    return { selector: value as CodeAnchorSelector, issues };
  }

  // Image selector.
  const assetId = value['assetId'];
  if (!isString(assetId) || assetId.length === 0) {
    issues.push(issue('invalid-anchor-selector', 'image selector.assetId must be a non-empty string'));
  }
  const rectOk = validateRectValue(value['rect'], 'image selector.rect', issues);
  const crop = value['crop'];
  if (crop !== undefined) {
    validateRectValue(crop, 'image selector.crop', issues);
  }
  const point = value['point'];
  if (typeof point !== 'boolean') {
    issues.push(issue('invalid-anchor-selector', 'image selector.point must be a boolean'));
  } else if (rectOk && isRecord(value['rect'])) {
    const width = value['rect']['width'] as number;
    const height = value['rect']['height'] as number;
    const zero = width === 0 && height === 0;
    if (point !== zero) {
      issues.push(
        issue(
          'invalid-anchor-selector',
          'image selector.point must be true exactly when width and height are zero',
        ),
      );
    }
  }
  if (value['label'] !== undefined && !isString(value['label'])) {
    issues.push(issue('invalid-anchor-selector', 'image selector.label must be a string'));
  }
  return { selector: value as ImageAnchorSelector, issues };
}

export interface AnchorMirrorIssue {
  field: 'quote' | 'prefix' | 'suffix' | 'occurrenceHint';
  message: string;
}

/**
 * Compare the canonical selector with the optional top-level compatibility
 * mirrors. On read the selector wins; a disagreement is flagged for repair,
 * never rewritten.
 */
export function anchorSelectorMirrorIssues(anchor: Anchor): AnchorMirrorIssue[] {
  if (!isRecord(anchor.selector)) return [];
  const selector = anchor.selector;
  const kind = anchor.kind;
  const issues: AnchorMirrorIssue[] = [];

  const compare = (
    field: AnchorMirrorIssue['field'],
    selectorValue: unknown,
    mirrorValue: unknown,
    label: string,
  ): void => {
    if (selectorValue === undefined || mirrorValue === undefined) return;
    if (selectorValue !== mirrorValue) {
      issues.push({
        field,
        message: `anchor.${label} does not match selector.${field}`,
      });
    }
  };

  if (kind === 'text' || kind === 'code') {
    compare('quote', selector['quote'], anchor.quote, 'quote');
    compare('prefix', selector['prefix'], anchor.prefix, 'prefix');
    compare('suffix', selector['suffix'], anchor.suffix, 'suffix');
    compare('occurrenceHint', selector['occurrenceHint'], anchor.occurrenceHint, 'occurrenceHint');
  } else if (kind === 'formula') {
    compare('quote', selector['latex'], anchor.quote, 'quote');
    compare('prefix', selector['latexPrefix'], anchor.prefix, 'prefix');
    compare('suffix', selector['latexSuffix'], anchor.suffix, 'suffix');
    compare('occurrenceHint', selector['occurrenceHint'], anchor.occurrenceHint, 'occurrenceHint');
  } else if (kind === 'image') {
    compare('quote', selector['label'], anchor.quote, 'quote');
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Transient binding input union (design §2.3; not stored)
// ---------------------------------------------------------------------------

export interface TextNodeRange extends JsonObject {
  nodePath: number[];
  /** Unicode code point offset, inclusive. */
  start: number;
  /** Unicode code point offset, exclusive. */
  end: number;
}

export type AnchorBinding =
  | { kind: 'text'; ranges: TextNodeRange[] }
  | { kind: 'formula'; form: 'whole'; nodePath: number[] }
  | {
      kind: 'formula';
      form: 'term';
      nodePath: number[];
      latex: string;
      occurrence: number;
    }
  | { kind: 'code'; nodePath: number[]; startOffset: number; endOffset: number }
  | {
      kind: 'image';
      nodePath: number[];
      assetId: string;
      rect: AnchorRect;
      crop?: AnchorRect;
      point: boolean;
    };

// ---------------------------------------------------------------------------
// Code point helpers
// ---------------------------------------------------------------------------

/** Unicode code point length, never UTF-16 code units. */
export function codePointLength(value: string): number {
  let length = 0;
  for (const _ of value) length += 1;
  return length;
}

/** Slice by Unicode code point offsets. */
export function codePointSlice(value: string, start: number, end?: number): string {
  const points = Array.from(value);
  const from = Math.max(0, start);
  const to = end === undefined ? points.length : Math.max(from, end);
  return points.slice(from, to).join('');
}

// ---------------------------------------------------------------------------
// anchorIds binding helpers
// ---------------------------------------------------------------------------

export interface AnchorIdRead {
  ids: string[];
  legacyId?: string;
  usedLegacy: boolean;
  duplicateIds: string[];
  invalidEntries: number;
  legacyConflict: boolean;
  anchorMarkCount: number;
}

interface AttrAnchorIds {
  ids: string[];
  legacyId?: string;
  usedLegacy: boolean;
  duplicateIds: string[];
  invalidEntries: number;
  legacyConflict: boolean;
}

function emptyAttrRead(): AttrAnchorIds {
  return {
    ids: [],
    usedLegacy: false,
    duplicateIds: [],
    invalidEntries: 0,
    legacyConflict: false,
  };
}

function readAttrAnchorIds(attrs: JsonObject | undefined): AttrAnchorIds {
  if (!isRecord(attrs)) return emptyAttrRead();
  const result = emptyAttrRead();
  const legacy = attrs[LEGACY_ANCHOR_ID_ATTR];
  if (isString(legacy) && legacy.length > 0) result.legacyId = legacy;
  else if (legacy !== undefined) result.invalidEntries += 1;

  const value = attrs[ANCHOR_IDS_ATTR];
  if (value !== undefined) {
    if (Array.isArray(value)) {
      const seen = new Set<string>();
      for (const entry of value) {
        if (!isString(entry) || entry.length === 0) {
          result.invalidEntries += 1;
          continue;
        }
        result.ids.push(entry);
        if (seen.has(entry)) result.duplicateIds.push(entry);
        else seen.add(entry);
      }
      result.legacyConflict =
        result.legacyId !== undefined && !result.ids.includes(result.legacyId);
      return result;
    }
    result.invalidEntries += 1;
    if (result.legacyId !== undefined) {
      result.ids = [result.legacyId];
      result.usedLegacy = true;
    }
    return result;
  }

  if (result.legacyId !== undefined) {
    result.ids = [result.legacyId];
    result.usedLegacy = true;
  }
  return result;
}

/**
 * Read the raw binding from a text node, atomic node, or mark.
 *
 * Duplicate entries are reported rather than removed so A3 can flag them.
 */
export function readAnchorIdsRaw(target: ContentNode | ContentMark): AnchorIdRead {
  const empty: AnchorIdRead = {
    ids: [],
    usedLegacy: false,
    duplicateIds: [],
    invalidEntries: 0,
    legacyConflict: false,
    anchorMarkCount: 0,
  };

  if (target.type === 'text') {
    const textNode = target as ContentNode;
    const marks = Array.isArray(textNode.marks)
      ? textNode.marks.filter(
          (mark): mark is ContentMark =>
            isRecord(mark) && isString(mark.type) && mark.type === ANCHOR_MARK_TYPE,
        )
      : [];
    if (marks.length === 0) return empty;
    const aggregate: AnchorIdRead = {
      ids: [],
      usedLegacy: false,
      duplicateIds: [],
      invalidEntries: 0,
      legacyConflict: false,
      anchorMarkCount: marks.length,
    };
    for (const mark of marks) {
      const read = readAttrAnchorIds(mark.attrs);
      aggregate.ids.push(...read.ids);
      aggregate.duplicateIds.push(...read.duplicateIds);
      aggregate.invalidEntries += read.invalidEntries;
      aggregate.usedLegacy = aggregate.usedLegacy || read.usedLegacy;
      aggregate.legacyConflict = aggregate.legacyConflict || read.legacyConflict;
      if (read.legacyId !== undefined) aggregate.legacyId = read.legacyId;
    }
    return aggregate;
  }

  const read = readAttrAnchorIds(target.attrs);
  return {
    ids: read.ids,
    ...(read.legacyId === undefined ? {} : { legacyId: read.legacyId }),
    usedLegacy: read.usedLegacy,
    duplicateIds: read.duplicateIds,
    invalidEntries: read.invalidEntries,
    legacyConflict: read.legacyConflict,
    anchorMarkCount: target.type === ANCHOR_MARK_TYPE ? 1 : 0,
  };
}

/** Sorted and de-duplicated anchor IDs; empty arrays and empty strings removed. */
export function normalizeAnchorIds(anchorIds: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const anchorId of anchorIds) {
    if (typeof anchorId === 'string' && anchorId.length > 0) unique.add(anchorId);
  }
  return [...unique].sort(compareStrings);
}

/** Read the effective binding: `anchorIds` wins over the legacy `anchorId`. */
export function readAnchorIds(target: ContentNode | ContentMark): string[] {
  return normalizeAnchorIds(readAnchorIdsRaw(target).ids);
}

export function hasAnchorId(target: ContentNode | ContentMark, anchorId: string): boolean {
  return readAnchorIds(target).includes(anchorId);
}

function cloneMark(mark: ContentMark): ContentMark {
  return structuredClone(mark);
}

/** Set an `anchorIds` array on an anchor mark. Empty arrays remove the attrs. */
export function withAnchorMarkIds(mark: ContentMark, anchorIds: readonly string[]): ContentMark {
  const next = cloneMark(mark);
  const ids = normalizeAnchorIds(anchorIds);
  if (ids.length === 0) {
    delete next[ANCHOR_IDS_ATTR];
    delete next[LEGACY_ANCHOR_ID_ATTR];
    if (next.attrs !== undefined) {
      delete next.attrs[ANCHOR_IDS_ATTR];
      delete next.attrs[LEGACY_ANCHOR_ID_ATTR];
      if (Object.keys(next.attrs).length === 0) delete next.attrs;
    }
    return next;
  }
  const attrs = next.attrs === undefined ? {} : { ...next.attrs };
  delete attrs[LEGACY_ANCHOR_ID_ATTR];
  attrs[ANCHOR_IDS_ATTR] = ids;
  next.attrs = attrs;
  delete next[ANCHOR_IDS_ATTR];
  delete next[LEGACY_ANCHOR_ID_ATTR];
  return next;
}

/**
 * Set the text-node binding. Exactly one anchor mark is kept; overlapping
 * anchor IDs share that mark's array. Other marks and unknown attrs survive.
 */
export function withTextAnchorIds(node: ContentNode, anchorIds: readonly string[]): ContentNode {
  if (node.type !== 'text') {
    throw new RangeError(`withTextAnchorIds expects a text node, got "${node.type}"`);
  }
  const next = structuredClone(node);
  const ids = normalizeAnchorIds(anchorIds);
  const marks = next.marks === undefined ? [] : next.marks.map(cloneMark);
  const anchorIndices: number[] = [];
  for (const [index, mark] of marks.entries()) {
    if (mark.type === ANCHOR_MARK_TYPE) anchorIndices.push(index);
  }

  if (ids.length === 0) {
    const filtered = marks.filter((mark) => mark.type !== ANCHOR_MARK_TYPE);
    if (filtered.length === 0) delete next.marks;
    else next.marks = filtered;
    return next;
  }

  const keepAt = anchorIndices[0];
  const kept = withAnchorMarkIds(
    keepAt === undefined ? { type: ANCHOR_MARK_TYPE, attrs: {} } : (marks[keepAt] as ContentMark),
    ids,
  );
  const filtered: ContentMark[] = [];
  for (const [index, mark] of marks.entries()) {
    if (mark.type !== ANCHOR_MARK_TYPE) filtered.push(mark);
    else if (index === keepAt) filtered.push(kept);
  }
  if (keepAt === undefined) filtered.push(kept);
  next.marks = filtered;
  return next;
}

/** Set `attrs.anchorIds` on an atomic anchor node; empty removes the attrs. */
export function withAtomicAnchorIds(node: ContentNode, anchorIds: readonly string[]): ContentNode {
  if (!isAtomicAnchorNodeType(node.type)) {
    throw new RangeError(`withAtomicAnchorIds expects an atomic anchor node, got "${node.type}"`);
  }
  const next = structuredClone(node);
  const ids = normalizeAnchorIds(anchorIds);
  if (ids.length === 0) {
    if (next.attrs !== undefined) {
      delete next.attrs[ANCHOR_IDS_ATTR];
      delete next.attrs[LEGACY_ANCHOR_ID_ATTR];
      if (Object.keys(next.attrs).length === 0) delete next.attrs;
    }
    return next;
  }
  const attrs = next.attrs === undefined ? {} : { ...next.attrs };
  delete attrs[LEGACY_ANCHOR_ID_ATTR];
  attrs[ANCHOR_IDS_ATTR] = ids;
  next.attrs = attrs;
  return next;
}

/** Dispatch to the text or atomic binding writer. */
export function withAnchorIds<T extends ContentNode | ContentMark>(
  target: T,
  anchorIds: readonly string[],
): T {
  if (target.type === 'text') {
    return withTextAnchorIds(target, anchorIds) as T;
  }
  if (target.type === ANCHOR_MARK_TYPE) {
    return withAnchorMarkIds(target as ContentMark, anchorIds) as T;
  }
  if (isAtomicAnchorNodeType(target.type)) {
    return withAtomicAnchorIds(target, anchorIds) as T;
  }
  throw new RangeError(`withAnchorIds cannot bind a "${target.type}" node`);
}

export function addAnchorId<T extends ContentNode | ContentMark>(target: T, anchorId: string): T {
  return withAnchorIds(target, [...readAnchorIds(target), anchorId]);
}

export function removeAnchorId<T extends ContentNode | ContentMark>(
  target: T,
  anchorId: string,
): T {
  return withAnchorIds(
    target,
    readAnchorIds(target).filter((id) => id !== anchorId),
  );
}

/** Remove one anchor binding from a whole content tree. Pure. */
export function removeAnchorBinding(content: ContentNode, anchorId: string): ContentNode {
  const next = structuredClone(content);

  const strip = (node: ContentNode): void => {
    if (node.type === 'text') {
      if (node.marks !== undefined) {
        const marks = node.marks
          .map((mark) => {
            if (mark.type !== ANCHOR_MARK_TYPE) return mark;
            const ids = readAnchorIds(mark).filter((id) => id !== anchorId);
            return withAnchorMarkIds(mark, ids);
          })
          .filter((mark) => mark.type !== ANCHOR_MARK_TYPE || readAnchorIds(mark).length > 0);
        if (marks.length === 0) delete node.marks;
        else node.marks = marks;
      }
      return;
    }
    if (isAtomicAnchorNodeType(node.type)) {
      const ids = readAnchorIds(node).filter((id) => id !== anchorId);
      const updated = withAtomicAnchorIds(node, ids);
      if (updated.attrs === undefined) delete node.attrs;
      else node.attrs = updated.attrs;
      return;
    }
    if (node.attrs !== undefined && hasAnchorId(node, anchorId)) {
      // Unknown containers keep unknown attrs, but a stale binding is removed.
      const attrs = { ...node.attrs };
      const ids = readAnchorIds(node).filter((id) => id !== anchorId);
      if (ids.length === 0) {
        delete attrs[ANCHOR_IDS_ATTR];
        delete attrs[LEGACY_ANCHOR_ID_ATTR];
      } else {
        attrs[ANCHOR_IDS_ATTR] = normalizeAnchorIds(ids);
        delete attrs[LEGACY_ANCHOR_ID_ATTR];
      }
      if (Object.keys(attrs).length === 0) delete node.attrs;
      else node.attrs = attrs;
    }
  };

  const walk = (node: ContentNode): void => {
    strip(node);
    for (const [, child] of childEntries(node)) walk(child);
  };
  walk(next);
  return next;
}

// ---------------------------------------------------------------------------
// Node paths and text-node splitting
// ---------------------------------------------------------------------------

export function compareNodePaths(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined) return -1;
    if (rightValue === undefined) return 1;
    if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
  }
  return 0;
}

export function nodePathKey(path: readonly number[]): string {
  return path.join('.');
}

export function getNodeAtPath(content: ContentNode, path: readonly number[]): ContentNode | null {
  let current = content;
  for (const index of path) {
    const children = current.children;
    if (!Array.isArray(children)) return null;
    const next = children[index];
    if (next === undefined) return null;
    current = next;
  }
  return current;
}

/** Replace the node at `path` with the updater result. Pure. */
export function withNodeAtPath(
  content: ContentNode,
  path: readonly number[],
  update: (node: ContentNode) => ContentNode,
): ContentNode {
  const next = structuredClone(content);
  if (path.length === 0) return update(next);
  let parent = next;
  for (let index = 0; index < path.length - 1; index += 1) {
    const childIndex = path[index];
    const children = parent.children;
    const child = childIndex === undefined ? undefined : children?.[childIndex];
    if (child === undefined) {
      throw new RangeError(`node path "${nodePathKey(path)}" does not exist`);
    }
    parent = child;
  }
  const last = path[path.length - 1];
  const children = parent.children;
  const target = last === undefined ? undefined : children?.[last];
  if (target === undefined || last === undefined || children === undefined) {
    throw new RangeError(`node path "${nodePathKey(path)}" does not exist`);
  }
  children[last] = update(target);
  return next;
}

/**
 * Split a text node at a code point offset. Returns null when the offset is at
 * a boundary. Marks and attrs are cloned onto both halves.
 */
export function splitTextNode(
  node: ContentNode,
  offset: number,
): [ContentNode, ContentNode] | null {
  if (node.type !== 'text') {
    throw new RangeError(`splitTextNode expects a text node, got "${node.type}"`);
  }
  const text = textValue(node);
  const length = codePointLength(text);
  if (!Number.isInteger(offset) || offset <= 0 || offset >= length) return null;
  const left = structuredClone(node);
  const right = structuredClone(node);
  left.text = codePointSlice(text, 0, offset);
  right.text = codePointSlice(text, offset);
  return [left, right];
}

/** Split a text node at `path` in place on a cloned tree. Pure. */
export function splitTextNodeAt(
  content: ContentNode,
  path: readonly number[],
  offset: number,
): ContentNode {
  if (path.length === 0) throw new RangeError('cannot split the content root');
  const next = structuredClone(content);
  let parent = next;
  for (let index = 0; index < path.length - 1; index += 1) {
    const childIndex = path[index];
    const child = childIndex === undefined ? undefined : parent.children?.[childIndex];
    if (child === undefined) throw new RangeError(`node path "${nodePathKey(path)}" does not exist`);
    parent = child;
  }
  const last = path[path.length - 1];
  const children = parent.children;
  const target = last === undefined ? undefined : children?.[last];
  if (children === undefined || last === undefined || target === undefined) {
    throw new RangeError(`node path "${nodePathKey(path)}" does not exist`);
  }
  const split = splitTextNode(target, offset);
  if (split === null) return next;
  children.splice(last, 1, split[0], split[1]);
  return next;
}

// ---------------------------------------------------------------------------
// Plain-text projection
// ---------------------------------------------------------------------------

export interface PlainTextSegment extends JsonObject {
  kind: 'text' | 'inlineMath' | 'image' | 'hardBreak';
  nodePath: number[];
  nodeType: string;
  /** Unicode code point offset in the projection. */
  start: number;
  end: number;
  text: string;
}

export interface ProjectionBarrier extends JsonObject {
  /** Unicode code point offset in the projection. */
  offset: number;
  kind: 'block-atomic' | 'table-cell';
  nodePath: number[];
}

export interface PlainTextProjection extends JsonObject {
  text: string;
  length: number;
  segments: PlainTextSegment[];
  barriers: ProjectionBarrier[];
}

interface ProjectionBuilder {
  text: string;
  offset: number;
  segments: PlainTextSegment[];
  barriers: ProjectionBarrier[];
}

function appendProjectionText(
  builder: ProjectionBuilder,
  text: string,
  kind: PlainTextSegment['kind'],
  nodePath: number[],
  nodeType: string,
): void {
  if (typeof text !== 'string' || text.length === 0) return;
  const length = codePointLength(text);
  builder.segments.push({
    kind,
    nodePath: [...nodePath],
    nodeType,
    start: builder.offset,
    end: builder.offset + length,
    text,
  });
  builder.text += text;
  builder.offset += length;
}

function appendProjectionBoundary(builder: ProjectionBuilder): void {
  if (builder.text.length === 0 || builder.text.endsWith('\n')) return;
  builder.text += '\n';
  builder.offset += 1;
}

function addBarrier(
  builder: ProjectionBuilder,
  kind: ProjectionBarrier['kind'],
  nodePath: number[],
): void {
  const previous = builder.barriers[builder.barriers.length - 1];
  if (
    previous !== undefined &&
    previous.offset === builder.offset &&
    previous.kind === kind &&
    nodePathKey(previous.nodePath) === nodePathKey(nodePath)
  ) {
    return;
  }
  builder.barriers.push({ offset: builder.offset, kind, nodePath: [...nodePath] });
}

function projectionForInline(
  node: ContentNode,
  path: number[],
  parentType: string | null,
  builder: ProjectionBuilder,
): void {
  if (node.type === 'text') {
    appendProjectionText(builder, textValue(node), 'text', path, node.type);
    return;
  }
  if (node.type === 'inlineMath') {
    appendProjectionText(builder, formulaLatex(node), 'inlineMath', path, node.type);
    return;
  }
  if (node.type === 'image') {
    appendProjectionText(builder, imageAltText(node), 'image', path, node.type);
    return;
  }
  if (node.type === 'hardBreak') {
    appendProjectionText(builder, '\n', 'hardBreak', path, node.type);
    return;
  }
  if (node.type === 'mathBlock' || node.type === 'codeBlock') {
    appendProjectionBoundary(builder);
    addBarrier(builder, 'block-atomic', path);
    return;
  }
  for (const [index, child] of childEntries(node)) {
    projectionForInline(child, [...path, index], parentType ?? node.type, builder);
  }
}

/** Code block text: `attrs.text` when present, otherwise its text children. */
export function codeBlockText(node: ContentNode): string {
  const attr = isRecord(node.attrs) ? node.attrs['text'] : undefined;
  if (isString(attr)) return attr;
  const collect = (current: ContentNode): string => {
    if (current.type === 'text') return textValue(current);
    return childEntries(current).map(([, child]) => collect(child)).join('');
  };
  return collect(node);
}

export function formulaLatex(node: ContentNode): string {
  const latex = isRecord(node.attrs) ? node.attrs['latex'] : undefined;
  return isString(latex) ? latex : '';
}

export function imageAssetId(node: ContentNode): string | null {
  const assetId = isRecord(node.attrs) ? node.attrs['assetId'] : undefined;
  return isString(assetId) && assetId.length > 0 ? assetId : null;
}

export function imageAltText(node: ContentNode): string {
  const alt = isRecord(node.attrs) ? node.attrs['alt'] : undefined;
  return isString(alt) && alt.length > 0 ? alt : IMAGE_PLACEHOLDER;
}

export function imageCrop(node: ContentNode): AnchorRect | null {
  const crop = isRecord(node.attrs) ? node.attrs['crop'] : undefined;
  if (!isRecord(crop)) return null;
  const x = crop['x'];
  const y = crop['y'];
  const width = crop['width'];
  const height = crop['height'];
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height)) {
    return null;
  }
  return { x, y, width, height };
}

export function rectsEqual(left: AnchorRect | null, right: AnchorRect | null): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

const FULL_RECT: AnchorRect = { x: 0, y: 0, width: 1, height: 1 };

/** Full-image crop used when the selector or node omits crop. */
export function normalizedCrop(node: ContentNode): AnchorRect {
  return imageCrop(node) ?? FULL_RECT;
}

/**
 * Plain-text projection used by text selectors and fallback quote search.
 *
 * Text contributes its text, inline math its LaTeX, an image its alt text or
 * U+FFFC, and hard breaks/block boundaries newlines. Code and display-math
 * source are excluded from the searchable text; their boundary is a barrier, so
 * a text quote cannot silently span a block-level atomic node.
 */
export function plainTextProjection(content: ContentNode): PlainTextProjection {
  const builder: ProjectionBuilder = { text: '', offset: 0, segments: [], barriers: [] };

  const walk = (node: ContentNode, path: number[], parentType: string | null): void => {
    if (node.type === 'text') {
      appendProjectionText(builder, textValue(node), 'text', path, node.type);
      return;
    }
    if (isFormulaNodeType(node.type) && node.type === 'inlineMath') {
      appendProjectionText(builder, formulaLatex(node), 'inlineMath', path, node.type);
      return;
    }
    if (node.type === 'image') {
      const blockLevel = parentType === null || BLOCK_PARENT_TYPES.has(parentType);
      if (blockLevel) {
        appendProjectionBoundary(builder);
        addBarrier(builder, 'block-atomic', path);
      }
      appendProjectionText(builder, imageAltText(node), 'image', path, node.type);
      return;
    }
    if (node.type === 'hardBreak') {
      appendProjectionText(builder, '\n', 'hardBreak', path, node.type);
      return;
    }
    if (node.type === 'mathBlock' || node.type === 'codeBlock') {
      appendProjectionBoundary(builder);
      addBarrier(builder, 'block-atomic', path);
      return;
    }
    if (node.type === 'horizontalRule') {
      appendProjectionBoundary(builder);
      addBarrier(builder, 'block-atomic', path);
      return;
    }
    if (node.type === 'paragraph' || node.type === 'heading') {
      appendProjectionBoundary(builder);
      for (const [index, child] of childEntries(node)) {
        projectionForInline(child, [...path, index], node.type, builder);
      }
      return;
    }
    if (TABLE_CELL_TYPES.has(node.type)) {
      addBarrier(builder, 'table-cell', path);
    }
    if (BLOCK_LEAF_TYPES.has(node.type)) {
      appendProjectionBoundary(builder);
    }
    for (const [index, child] of childEntries(node)) {
      walk(child, [...path, index], node.type);
    }
  };

  walk(content, [], null);
  return {
    text: builder.text,
    length: builder.offset,
    segments: builder.segments,
    barriers: builder.barriers,
  };
}

/** Actual context around a projection range, up to 32 code points per side. */
export function projectionContext(
  projection: PlainTextProjection,
  start: number,
  end: number,
  contextLength = 32,
): { prefix: string; suffix: string } {
  const prefix = codePointSlice(projection.text, Math.max(0, start - contextLength), start);
  const suffix = codePointSlice(projection.text, end, end + contextLength);
  return { prefix, suffix };
}

/** Map a projection range to the text-node ranges the editor can mark. */
export function textRangesForProjectionRange(
  projection: PlainTextProjection,
  start: number,
  end: number,
): TextNodeRange[] {
  const ranges: TextNodeRange[] = [];
  for (const segment of projection.segments) {
    if (segment.kind !== 'text') continue;
    const overlapStart = Math.max(start, segment.start);
    const overlapEnd = Math.min(end, segment.end);
    if (overlapEnd <= overlapStart) continue;
    ranges.push({
      nodePath: [...segment.nodePath],
      start: overlapStart - segment.start,
      end: overlapEnd - segment.start,
    });
  }
  return ranges;
}

// ---------------------------------------------------------------------------
// Content index
// ---------------------------------------------------------------------------

export interface IndexedContentNode {
  node: ContentNode;
  nodePath: number[];
  parentType: string | null;
}

export interface FormulaNodeInfo {
  node: ContentNode;
  nodePath: number[];
  latex: string;
}

export interface CodeNodeInfo {
  node: ContentNode;
  nodePath: number[];
  text: string;
}

export interface ImageNodeInfo {
  node: ContentNode;
  nodePath: number[];
  assetId: string | null;
  alt: string;
  crop: AnchorRect | null;
  blockLevel: boolean;
}

export interface AnchorOccurrence extends JsonObject {
  anchorId: string;
  nodePath: number[];
  nodeType: string;
  source: 'text-mark' | 'atomic-attr' | 'legacy-attr';
  /** Raw IDs on this binding container, including duplicates. */
  ids: string[];
  duplicateIds: boolean;
  anchorMarkCount: number;
  usedLegacy: boolean;
  legacyConflict: boolean;
}

export interface BlockAnchorIndex {
  blockId: string;
  content: ContentNode;
  projection: PlainTextProjection;
  textNodes: IndexedContentNode[];
  textNodeIndex: Map<string, number>;
  segmentByPath: Map<string, PlainTextSegment>;
  formulaNodes: FormulaNodeInfo[];
  codeNodes: CodeNodeInfo[];
  imageNodes: ImageNodeInfo[];
  occurrences: Map<string, AnchorOccurrence[]>;
  emptyAnchorMarks: Array<{ nodePath: number[] }>;
}

interface IndexBuilder {
  textNodes: IndexedContentNode[];
  formulaNodes: FormulaNodeInfo[];
  codeNodes: CodeNodeInfo[];
  imageNodes: ImageNodeInfo[];
  occurrences: Map<string, AnchorOccurrence[]>;
  emptyAnchorMarks: Array<{ nodePath: number[] }>;
}

function registerOccurrence(
  builder: IndexBuilder,
  anchorId: string,
  occurrence: AnchorOccurrence,
): void {
  const list = builder.occurrences.get(anchorId) ?? [];
  list.push(occurrence);
  builder.occurrences.set(anchorId, list);
}

function collectNodeOccurrence(
  builder: IndexBuilder,
  node: ContentNode,
  path: number[],
): void {
  if (node.type === 'text') {
    const read = readAnchorIdsRaw(node);
    if (read.anchorMarkCount > 0 && read.ids.length === 0) {
      builder.emptyAnchorMarks.push({ nodePath: [...path] });
    }
    const ids = normalizeAnchorIds(read.ids);
    for (const anchorId of ids) {
      registerOccurrence(builder, anchorId, {
        anchorId,
        nodePath: [...path],
        nodeType: node.type,
        source: 'text-mark',
        ids: read.ids,
        duplicateIds: read.duplicateIds.length > 0 || read.anchorMarkCount > 1,
        anchorMarkCount: read.anchorMarkCount,
        usedLegacy: read.usedLegacy,
        legacyConflict: read.legacyConflict,
      });
    }
    return;
  }
  const read = readAnchorIdsRaw(node);
  if (read.ids.length === 0) return;
  const source: AnchorOccurrence['source'] = read.usedLegacy ? 'legacy-attr' : 'atomic-attr';
  for (const anchorId of normalizeAnchorIds(read.ids)) {
    registerOccurrence(builder, anchorId, {
      anchorId,
      nodePath: [...path],
      nodeType: node.type,
      source,
      ids: read.ids,
      duplicateIds: read.duplicateIds.length > 0,
      anchorMarkCount: read.anchorMarkCount,
      usedLegacy: read.usedLegacy,
      legacyConflict: read.legacyConflict,
    });
  }
}

/** Cheap pre-check used by validation to skip blocks with no anchor content. */
export function contentHasAnchorBinding(content: ContentNode): boolean {
  let found = false;
  const walk = (node: ContentNode): void => {
    if (found) return;
    if (node.type === 'text') {
      const marks = Array.isArray(node.marks) ? node.marks : [];
      if (
        marks.some(
          (mark) => isRecord(mark) && isString(mark.type) && mark.type === ANCHOR_MARK_TYPE,
        )
      ) {
        found = true;
        return;
      }
    }
    if (isRecord(node.attrs)) {
      if (ANCHOR_IDS_ATTR in node.attrs || LEGACY_ANCHOR_ID_ATTR in node.attrs) {
        found = true;
        return;
      }
    }
    for (const [, child] of childEntries(node)) walk(child);
  };
  walk(content);
  return found;
}

export function buildBlockAnchorIndex(blockId: string, content: ContentNode): BlockAnchorIndex {
  const builder: IndexBuilder = {
    textNodes: [],
    formulaNodes: [],
    codeNodes: [],
    imageNodes: [],
    occurrences: new Map(),
    emptyAnchorMarks: [],
  };

  const walk = (node: ContentNode, path: number[], parentType: string | null): void => {
    collectNodeOccurrence(builder, node, path);

    if (node.type === 'text' || node.type === 'inlineMath') {
      if (node.type === 'text') {
        builder.textNodes.push({ node, nodePath: [...path], parentType });
      } else {
        builder.formulaNodes.push({ node, nodePath: [...path], latex: formulaLatex(node) });
      }
      return;
    }
    if (node.type === 'mathBlock') {
      builder.formulaNodes.push({ node, nodePath: [...path], latex: formulaLatex(node) });
      return;
    }
    if (node.type === 'codeBlock') {
      builder.codeNodes.push({ node, nodePath: [...path], text: codeBlockText(node) });
      return;
    }
    if (node.type === 'image') {
      const blockLevel = parentType === null || BLOCK_PARENT_TYPES.has(parentType);
      builder.imageNodes.push({
        node,
        nodePath: [...path],
        assetId: imageAssetId(node),
        alt: imageAltText(node),
        crop: imageCrop(node),
        blockLevel,
      });
      return;
    }
    for (const [index, child] of childEntries(node)) {
      walk(child, [...path, index], node.type);
    }
  };

  walk(content, [], null);
  const projection = plainTextProjection(content);
  const textNodeIndex = new Map<string, number>();
  for (const [index, entry] of builder.textNodes.entries()) {
    textNodeIndex.set(nodePathKey(entry.nodePath), index);
  }
  const segmentByPath = new Map<string, PlainTextSegment>();
  for (const segment of projection.segments) {
    if (segment.kind === 'text') {
      segmentByPath.set(nodePathKey(segment.nodePath), segment);
    }
  }
  return {
    blockId,
    content,
    projection,
    textNodes: builder.textNodes,
    textNodeIndex,
    segmentByPath,
    formulaNodes: builder.formulaNodes,
    codeNodes: builder.codeNodes,
    imageNodes: builder.imageNodes,
    occurrences: builder.occurrences,
    emptyAnchorMarks: builder.emptyAnchorMarks,
  };
}

// ---------------------------------------------------------------------------
// Binding inspection (contiguity / duplicates / node kind)
// ---------------------------------------------------------------------------

export interface TextBindingRange extends JsonObject {
  /** Unicode code point offsets in the block projection. */
  start: number;
  end: number;
  ranges: TextNodeRange[];
}

export type BindingInspectionReason =
  | 'none'
  | 'duplicate-binding'
  | 'not-contiguous'
  | 'crosses-barrier'
  | 'mixed-binding'
  | 'empty-binding'
  | 'invalid-binding';

export interface AnchorBindingInspection {
  anchorId: string;
  presence: 'none' | 'text' | 'atomic' | 'mixed';
  occurrences: AnchorOccurrence[];
  duplicate: boolean;
  /** Text-only contiguity; null for atomic and no-binding cases. */
  contiguous: boolean | null;
  textRange: TextBindingRange | null;
  reason: BindingInspectionReason;
  barrier: ProjectionBarrier | null;
  unmarkedGap: TextNodeRange | null;
}

function textNodeOffset(index: BlockAnchorIndex, path: readonly number[]): {
  start: number;
  end: number;
  segment: PlainTextSegment | null;
} {
  const segment = index.segmentByPath.get(nodePathKey(path)) ?? null;
  if (segment !== null) return { start: segment.start, end: segment.end, segment };
  let start = 0;
  for (const candidate of index.projection.segments) {
    if (candidate.kind !== 'text') continue;
    if (compareNodePaths(candidate.nodePath, [...path]) < 0) start = candidate.end;
  }
  return { start, end: start, segment: null };
}

/** Inspect one anchor ID without reading the anchor record or mutating content. */
export function inspectAnchorBinding(
  index: BlockAnchorIndex,
  anchorId: string,
): AnchorBindingInspection {
  const occurrences = [...(index.occurrences.get(anchorId) ?? [])].sort((left, right) =>
    compareNodePaths(left.nodePath, right.nodePath),
  );
  if (occurrences.length === 0) {
    return {
      anchorId,
      presence: 'none',
      occurrences: [],
      duplicate: false,
      contiguous: null,
      textRange: null,
      reason: 'none',
      barrier: null,
      unmarkedGap: null,
    };
  }

  const textOccurrences = occurrences.filter((occurrence) => occurrence.nodeType === 'text');
  const atomicOccurrences = occurrences.filter((occurrence) => occurrence.nodeType !== 'text');
  const presence: AnchorBindingInspection['presence'] =
    textOccurrences.length === 0
      ? 'atomic'
      : atomicOccurrences.length === 0
        ? 'text'
        : 'mixed';

  const duplicateIds = occurrences.some(
    (occurrence) =>
      occurrence.duplicateIds ||
      occurrence.ids.length !== new Set(occurrence.ids).size ||
      occurrence.anchorMarkCount > 1,
  );

  if (presence === 'mixed') {
    return {
      anchorId,
      presence,
      occurrences,
      duplicate: true,
      contiguous: null,
      textRange: null,
      reason: 'mixed-binding',
      barrier: null,
      unmarkedGap: null,
    };
  }

  if (presence === 'atomic') {
    const multiple = atomicOccurrences.length > 1;
    return {
      anchorId,
      presence,
      occurrences,
      duplicate: duplicateIds || multiple,
      contiguous: null,
      textRange: null,
      reason: duplicateIds || multiple ? 'duplicate-binding' : 'none',
      barrier: null,
      unmarkedGap: null,
    };
  }

  const textIndexByPath = index.textNodeIndex;
  const markedIndices = textOccurrences
    .map((occurrence) => textIndexByPath.get(nodePathKey(occurrence.nodePath)))
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);

  if (markedIndices.length !== textOccurrences.length || markedIndices.length === 0) {
    return {
      anchorId,
      presence,
      occurrences,
      duplicate: duplicateIds,
      contiguous: false,
      textRange: null,
      reason: 'invalid-binding',
      barrier: null,
      unmarkedGap: null,
    };
  }

  const firstIndex = markedIndices[0] as number;
  const lastIndex = markedIndices[markedIndices.length - 1] as number;
  const markedPaths = new Set(textOccurrences.map((occurrence) => nodePathKey(occurrence.nodePath)));
  let unmarkedGap: TextNodeRange | null = null;
  for (let position = firstIndex; position <= lastIndex; position += 1) {
    const entry = index.textNodes[position];
    if (entry === undefined) continue;
    if (textValue(entry.node).length === 0) continue;
    if (markedPaths.has(nodePathKey(entry.nodePath))) continue;
    const offset = textNodeOffset(index, entry.nodePath);
    unmarkedGap = { nodePath: [...entry.nodePath], start: offset.start, end: offset.end };
    break;
  }

  const firstNode = index.textNodes[firstIndex];
  const lastNode = index.textNodes[lastIndex];
  const firstOffset =
    firstNode === undefined
      ? { start: 0, end: 0, segment: null }
      : textNodeOffset(index, firstNode.nodePath);
  const lastOffset =
    lastNode === undefined
      ? { start: 0, end: 0, segment: null }
      : textNodeOffset(index, lastNode.nodePath);
  const start = firstOffset.start;
  const end = lastOffset.end;
  const barrier =
    index.projection.barriers.find(
      (candidate) => candidate.offset > start && candidate.offset < end,
    ) ?? null;

  const ranges: TextNodeRange[] = [];
  for (const position of markedIndices) {
    const entry = index.textNodes[position];
    if (entry === undefined) continue;
    const length = codePointLength(textValue(entry.node));
    if (length === 0) continue;
    ranges.push({ nodePath: [...entry.nodePath], start: 0, end: length });
  }

  let reason: BindingInspectionReason = 'none';
  if (duplicateIds) reason = 'duplicate-binding';
  else if (unmarkedGap !== null) reason = 'not-contiguous';
  else if (barrier !== null) reason = 'crosses-barrier';
  else if (start === end) reason = 'empty-binding';

  return {
    anchorId,
    presence,
    occurrences,
    duplicate: duplicateIds,
    contiguous: reason === 'none',
    textRange:
      reason === 'none'
        ? { start, end, ranges }
        : start === end
          ? null
          : { start, end, ranges },
    reason,
    barrier,
    unmarkedGap,
  };
}

export interface AnchorBindingKindCheck {
  ok: boolean;
  expectedNodeTypes: readonly string[];
  mismatched: AnchorOccurrence[];
}

export function expectedAnchorNodeTypes(kind: AnchorKind): readonly string[] {
  if (kind === 'text') return ['text'];
  if (kind === 'formula') return ['mathBlock', 'inlineMath'];
  if (kind === 'code') return ['codeBlock'];
  return ['image'];
}

/** A4: the content node kind must match the anchor kind. */
export function checkAnchorBindingKind(
  inspection: AnchorBindingInspection,
  kind: AnchorKind,
): AnchorBindingKindCheck {
  const expected = expectedAnchorNodeTypes(kind);
  const mismatched = inspection.occurrences.filter((occurrence) => {
    if (kind === 'text') {
      return occurrence.nodeType !== 'text' || occurrence.source !== 'text-mark';
    }
    return occurrence.nodeType === 'text' || !expected.includes(occurrence.nodeType);
  });
  return { ok: mismatched.length === 0, expectedNodeTypes: expected, mismatched };
}

// ---------------------------------------------------------------------------
// Content binding read / merge / remove
// ---------------------------------------------------------------------------

export interface ContentAnchorBinding extends JsonObject {
  anchorId: string;
  textRanges: TextNodeRange[];
  atomicNodes: Array<{ nodePath: number[]; nodeType: string }>;
  legacy: boolean;
}

/** Read the binding locations for an anchor ID from content. Pure. */
export function readContentAnchorBinding(
  content: ContentNode,
  anchorId: string,
): ContentAnchorBinding | null {
  const textRanges: TextNodeRange[] = [];
  const atomicNodes: Array<{ nodePath: number[]; nodeType: string }> = [];
  let legacy = false;

  const walk = (node: ContentNode, path: number[]): void => {
    const read = readAnchorIdsRaw(node);
    if (read.ids.includes(anchorId)) {
      legacy = legacy || read.usedLegacy;
      if (node.type === 'text') {
        const length = codePointLength(textValue(node));
        textRanges.push({ nodePath: [...path], start: 0, end: length });
      } else {
        atomicNodes.push({ nodePath: [...path], nodeType: node.type });
      }
    }
    if (node.type === 'codeBlock' || node.type === 'mathBlock') return;
    for (const [index, child] of childEntries(node)) {
      walk(child, [...path, index]);
    }
  };
  walk(content, []);

  if (textRanges.length === 0 && atomicNodes.length === 0) return null;
  return { anchorId, textRanges, atomicNodes, legacy };
}

function bindTextRange(
  content: ContentNode,
  anchorId: string,
  range: TextNodeRange,
): ContentNode {
  const node = getNodeAtPath(content, range.nodePath);
  if (node === null || node.type !== 'text') {
    throw new RangeError(`text binding path "${nodePathKey(range.nodePath)}" is not a text node`);
  }
  const length = codePointLength(textValue(node));
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end > length ||
    range.start >= range.end
  ) {
    throw new RangeError(
      `text binding range ${range.start}–${range.end} is invalid for a ${length}-code-point text node`,
    );
  }

  let current = content;
  let path = [...range.nodePath];
  let start = range.start;
  let end = range.end;
  if (start > 0) {
    current = splitTextNodeAt(current, path, start);
    const parentPath = path.slice(0, -1);
    const last = path[path.length - 1];
    if (last === undefined) throw new RangeError('text binding path is empty');
    path = [...parentPath, last + 1];
    end -= start;
    start = 0;
  }
  const target = getNodeAtPath(current, path);
  if (target === null || target.type !== 'text') {
    throw new RangeError(`text binding path "${nodePathKey(path)}" is not a text node`);
  }
  const targetLength = codePointLength(target.text ?? '');
  if (end < targetLength) {
    current = splitTextNodeAt(current, path, end);
  }
  return withNodeAtPath(current, path, (textNode) => addAnchorId(textNode, anchorId));
}

/**
 * Merge an anchor ID into an existing or new content binding.
 *
 * Text ranges are code point offsets inside text nodes. The helper splits text
 * nodes at selection boundaries, adds the ID to every covered text node, and
 * keeps overlapping anchors in the same sorted mark array.
 */
export function mergeAnchorBinding(
  content: ContentNode,
  anchorId: string,
  binding: AnchorBinding,
): ContentNode {
  if (binding.kind === 'text') {
    if (binding.ranges.length === 0) {
      throw new RangeError('a text anchor needs at least one range');
    }
    const ordered = [...binding.ranges].sort((left, right) => {
      const pathOrder = compareNodePaths(left.nodePath, right.nodePath);
      if (pathOrder !== 0) return pathOrder;
      return left.start - right.start;
    });
    let current = content;
    // Descending order keeps earlier node paths stable when a later node splits.
    for (const range of [...ordered].reverse()) {
      current = bindTextRange(current, anchorId, range);
    }
    return current;
  }

  const node = getNodeAtPath(content, binding.nodePath);
  if (node === null) {
    throw new RangeError(`anchor binding path "${nodePathKey(binding.nodePath)}" does not exist`);
  }
  if (binding.kind === 'formula' && !isFormulaNodeType(node.type)) {
    throw new RangeError(`formula anchor cannot bind a "${node.type}" node`);
  }
  if (binding.kind === 'code' && node.type !== 'codeBlock') {
    throw new RangeError(`code anchor cannot bind a "${node.type}" node`);
  }
  if (binding.kind === 'image' && node.type !== 'image') {
    throw new RangeError(`image anchor cannot bind a "${node.type}" node`);
  }
  return withNodeAtPath(content, binding.nodePath, (target) => addAnchorId(target, anchorId));
}

/**
 * Derive a durable text-anchor selector from a text binding.
 *
 * The binding is truth; the selector is the repair descriptor. The helper
 * applies the binding to a copy with a probe ID, inspects the resulting
 * contiguous run, and reads quote/context/occurrence from the plain-text
 * projection. Returns null when the binding is not one contiguous text run
 * (crosses a barrier, empty, disjoint, or wrong kind) so the caller can reject
 * before mutating the document.
 */
export function textAnchorSelectorForBinding(
  content: ContentNode,
  binding: AnchorBinding,
  contextLength = 32,
): TextAnchorSelector | null {
  if (binding.kind !== 'text') return null;
  let probeId = '__noteforest_text_anchor_probe__';
  let suffix = 0;
  while (readContentAnchorBinding(content, probeId) !== null) {
    suffix += 1;
    probeId = `__noteforest_text_anchor_probe_${suffix}__`;
  }

  let merged: ContentNode;
  try {
    merged = mergeAnchorBinding(content, probeId, binding);
  } catch {
    return null;
  }
  const index = buildBlockAnchorIndex('probe', merged);
  const inspection = inspectAnchorBinding(index, probeId);
  if (inspection.reason !== 'none' || inspection.textRange === null) return null;

  const { start, end } = inspection.textRange;
  const quote = codePointSlice(index.projection.text, start, end);
  if (quote.length === 0) return null;
  const { prefix, suffix: after } = projectionContext(
    index.projection,
    start,
    end,
    contextLength,
  );
  const occurrences = findQuoteOccurrences(index.projection.text, quote);
  const occurrence = occurrences.findIndex(
    (candidate) => candidate.start === start && candidate.end === end,
  );

  return {
    kind: 'text',
    quote,
    ...(prefix.length === 0 ? {} : { prefix }),
    ...(after.length === 0 ? {} : { suffix: after }),
    occurrenceHint: occurrence >= 0 ? occurrence + 1 : 1,
  };
}

/**
 * Derive a durable code-anchor selector from a code binding.
 *
 * The binding is truth for the content change; the selector stores the exact
 * code quote, bounded context, and code-point offsets/line hints. Offset and
 * line values are hints: resolution uses the quote and treats repeated quotes
 * as ambiguous. Returns null when the binding is not one non-empty range
 * inside one code block.
 */
export function codeAnchorSelectorForBinding(
  content: ContentNode,
  binding: AnchorBinding,
  contextLength = 32,
): CodeAnchorSelector | null {
  if (binding.kind !== 'code') return null;
  const node = getNodeAtPath(content, binding.nodePath);
  if (node === null || node.type !== 'codeBlock') return null;
  const text = codeBlockText(node);
  const length = codePointLength(text);
  const { startOffset, endOffset } = binding;
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    endOffset > length ||
    startOffset >= endOffset
  ) {
    return null;
  }
  const quote = codePointSlice(text, startOffset, endOffset);
  if (quote.length === 0) return null;
  const occurrences = findQuoteOccurrences(text, quote);
  const occurrence = occurrences.findIndex(
    (candidate) => candidate.start === startOffset && candidate.end === endOffset,
  );
  if (occurrence < 0) return null;
  const { prefix, suffix } = textContext(text, startOffset, endOffset, contextLength);
  const lines = codeLineRange(text, startOffset, endOffset);
  return {
    kind: 'code',
    quote,
    form: startOffset === 0 && endOffset === length ? 'whole' : 'range',
    ...(prefix.length === 0 ? {} : { prefix }),
    ...(suffix.length === 0 ? {} : { suffix }),
    occurrenceHint: occurrence + 1,
    startOffset,
    endOffset,
    lineStart: lines.lineStart,
    lineEnd: lines.lineEnd,
  };
}

// ---------------------------------------------------------------------------
// Content-order keys
// ---------------------------------------------------------------------------

/** Deterministic, lexicographically sortable key for an anchor start position. */
export function contentOrderKey(
  nodePath: readonly number[],
  offset = 0,
  anchorId = '',
): string {
  const path = nodePath.map((value) => String(value).padStart(8, '0')).join('.');
  const key = `${path}:${String(offset).padStart(8, '0')}`;
  return anchorId.length === 0 ? key : `${key}:${anchorId}`;
}

// ---------------------------------------------------------------------------
// Quote search
// ---------------------------------------------------------------------------

export interface QuoteCandidate extends JsonObject {
  start: number;
  end: number;
  prefix: string;
  suffix: string;
  crossesBarrier: boolean;
}

export function findQuoteOccurrences(haystack: string, needle: string): Array<{ start: number; end: number }> {
  if (needle.length === 0) return [];
  const hay = Array.from(haystack);
  const pin = Array.from(needle);
  if (pin.length > hay.length) return [];
  const result: Array<{ start: number; end: number }> = [];
  for (let start = 0; start <= hay.length - pin.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < pin.length; offset += 1) {
      if (hay[start + offset] !== pin[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) result.push({ start, end: start + pin.length });
  }
  return result;
}

export function findProjectionQuoteCandidates(
  projection: PlainTextProjection,
  quote: string,
  contextLength = 32,
): QuoteCandidate[] {
  return findQuoteOccurrences(projection.text, quote).map((occurrence) => {
    const { prefix, suffix } = projectionContext(
      projection,
      occurrence.start,
      occurrence.end,
      contextLength,
    );
    return {
      ...occurrence,
      prefix,
      suffix,
      crossesBarrier: projection.barriers.some(
        (barrier) => barrier.offset > occurrence.start && barrier.offset < occurrence.end,
      ),
    };
  });
}

function contextMatches(
  candidate: { prefix?: string; suffix?: string },
  selector: { prefix?: string; suffix?: string },
): boolean {
  if (selector.prefix === undefined || selector.suffix === undefined) return false;
  return candidate.prefix === selector.prefix && candidate.suffix === selector.suffix;
}

function textContext(
  text: string,
  start: number,
  end: number,
  contextLength = 32,
): { prefix: string; suffix: string } {
  return {
    prefix: codePointSlice(text, Math.max(0, start - contextLength), start),
    suffix: codePointSlice(text, end, end + contextLength),
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type AnchorState = 'resolved' | 'ambiguous' | 'broken' | 'idle' | 'block-missing';

export type AnchorResolutionReason =
  | 'exact-binding'
  | 'unique-quote'
  | 'unique-context'
  | 'multiple-candidates'
  | 'candidate-requires-confirmation'
  | 'duplicate-binding'
  | 'not-contiguous'
  | 'crosses-barrier'
  | 'empty-binding'
  | 'kind-mismatch'
  | 'invalid-selector'
  | 'quote-missing'
  | 'node-missing'
  | 'asset-changed'
  | 'crop-changed'
  | 'asset-missing'
  | 'unsupported-kind'
  | 'block-missing'
  | 'anchor-missing'
  | 'no-outgoing-branch';

export type AnchorResolutionIssueCode =
  | 'invalid-selector'
  | 'selector-mismatch'
  | 'legacy-conflict'
  | 'kind-mismatch'
  | 'duplicate-binding'
  | 'not-contiguous'
  | 'crosses-barrier'
  | 'empty-binding'
  | 'unsupported-kind';

export interface AnchorResolutionIssue extends JsonObject {
  code: AnchorResolutionIssueCode;
  message: string;
  path?: string;
}

export interface AnchorCandidateContext extends JsonObject {
  prefix?: string;
  suffix?: string;
}

export interface TextResolvedRange extends JsonObject {
  kind: 'text';
  /** Unicode code point offsets in the block projection. */
  projectionStart: number;
  projectionEnd: number;
  ranges: TextNodeRange[];
}

export interface FormulaResolvedRange extends JsonObject {
  kind: 'formula';
  nodePath: number[];
  form: 'whole' | 'term';
  latexStart?: number;
  latexEnd?: number;
  occurrence?: number;
}

export interface CodeResolvedRange extends JsonObject {
  kind: 'code';
  nodePath: number[];
  /** Unicode code point offsets in the code text. */
  start: number;
  end: number;
  lineStart?: number;
  lineEnd?: number;
}

export interface ImageResolvedRange extends JsonObject {
  kind: 'image';
  nodePath: number[];
  assetId: string;
  rect: AnchorRect;
  crop?: AnchorRect;
  point: boolean;
}

export type AnchorResolvedRange =
  | TextResolvedRange
  | FormulaResolvedRange
  | CodeResolvedRange
  | ImageResolvedRange;

export interface AnchorCandidate extends JsonObject {
  range: AnchorResolvedRange;
  /** UI ranking score only; never used to auto-resolve. */
  score: number;
  context?: AnchorCandidateContext;
  occurrence?: number;
}

export interface AnchorResolution extends JsonObject {
  anchorId: string;
  blockId: string;
  state: AnchorState;
  reason: AnchorResolutionReason;
  candidates: AnchorCandidate[];
  resolved: AnchorCandidate | null;
  binding: 'none' | 'text' | 'atomic' | 'mixed';
  orderKey: string | null;
  issues: AnchorResolutionIssue[];
  /** Stored repair hints (`split-inside-anchor`, …), sorted. */
  repairFlags?: string[];
}

function emptyResolution(
  anchorId: string,
  blockId: string,
  state: AnchorState,
  reason: AnchorResolutionReason,
): AnchorResolution {
  return {
    anchorId,
    blockId,
    state,
    reason,
    candidates: [],
    resolved: null,
    binding: 'none',
    orderKey: null,
    issues: [],
  };
}

function selectorRecord(anchor: Anchor): Record<string, unknown> | null {
  return isRecord(anchor.selector) ? anchor.selector : null;
}

function selectorText(
  selector: Record<string, unknown> | null,
  key: string,
  mirror: string | undefined,
): string | undefined {
  if (selector !== null) {
    const value = selector[key];
    if (typeof value === 'string') return value;
    if (value !== undefined) return undefined;
  }
  return mirror;
}

function selectorNumber(
  selector: Record<string, unknown> | null,
  key: string,
  mirror: number | undefined,
): number | undefined {
  if (selector !== null) {
    const value = selector[key];
    if (typeof value === 'number') return value;
    if (value !== undefined) return undefined;
  }
  return mirror;
}

function scoreCandidate(
  candidate: AnchorCandidate,
  selector: Record<string, unknown> | null,
  occurrence: number | undefined,
): number {
  let score = 0;
  const context = candidate.context;
  if (context !== undefined && selector !== null) {
    if (
      contextMatches(context, {
        prefix: typeof selector['prefix'] === 'string' ? selector['prefix'] : undefined,
        suffix: typeof selector['suffix'] === 'string' ? selector['suffix'] : undefined,
      })
    ) {
      score += 4;
    }
    if (
      contextMatches(context, {
        prefix: typeof selector['latexPrefix'] === 'string' ? selector['latexPrefix'] : undefined,
        suffix: typeof selector['latexSuffix'] === 'string' ? selector['latexSuffix'] : undefined,
      })
    ) {
      score += 4;
    }
  }
  const hint = selectorNumber(selector, 'occurrenceHint', undefined);
  if (hint !== undefined && occurrence !== undefined && hint === occurrence) score += 2;
  return score;
}

function candidateStart(candidate: AnchorCandidate): number {
  const range = candidate.range;
  if (range.kind === 'text') return range.projectionStart;
  if (range.kind === 'formula') return range.latexStart ?? 0;
  if (range.kind === 'code') return range.start;
  return 0;
}

function compareCandidates(left: AnchorCandidate, right: AnchorCandidate): number {
  if (left.score !== right.score) return right.score - left.score;
  const startOrder = candidateStart(left) - candidateStart(right);
  if (startOrder !== 0) return startOrder;
  const leftPath =
    left.range.kind === 'text'
      ? (left.range.ranges[0]?.nodePath ?? [])
      : left.range.nodePath;
  const rightPath =
    right.range.kind === 'text'
      ? (right.range.ranges[0]?.nodePath ?? [])
      : right.range.nodePath;
  return compareNodePaths(leftPath, rightPath);
}

function resolvedOrderKey(anchorId: string, candidate: AnchorCandidate | null): string | null {
  if (candidate === null) return null;
  const range = candidate.range;
  if (range.kind === 'text') {
    return contentOrderKey(
      range.ranges[0]?.nodePath ?? [],
      range.ranges[0]?.start ?? 0,
      anchorId,
    );
  }
  return contentOrderKey(range.nodePath, 0, anchorId);
}

interface ResolutionOutcome {
  state: AnchorState;
  reason: AnchorResolutionReason;
  candidates: AnchorCandidate[];
  resolved: AnchorCandidate | null;
}

function outcomeFromMatches(
  candidates: AnchorCandidate[],
  resolvedReason: AnchorResolutionReason,
): ResolutionOutcome {
  const sorted = [...candidates].sort(compareCandidates);
  if (sorted.length === 0) {
    return { state: 'broken', reason: 'quote-missing', candidates: [], resolved: null };
  }
  if (sorted.length === 1) {
    return { state: 'resolved', reason: resolvedReason, candidates: sorted, resolved: sorted[0] ?? null };
  }
  return { state: 'ambiguous', reason: 'multiple-candidates', candidates: sorted, resolved: null };
}

function lineNumberAt(text: string, offset: number): number {
  let line = 1;
  const points = Array.from(text);
  const limit = Math.max(0, Math.min(offset, points.length));
  for (let index = 0; index < limit; index += 1) {
    if (points[index] === '\n') line += 1;
  }
  return line;
}

/** 1-based line range covered by a code range. Offsets are code points. */
export function codeLineRange(
  text: string,
  start: number,
  end: number,
): { lineStart: number; lineEnd: number } {
  const lineStart = lineNumberAt(text, start);
  const lineEnd = lineNumberAt(text, Math.max(start, end - 1));
  return { lineStart, lineEnd };
}

function formulaMatches(
  index: BlockAnchorIndex,
  query: string,
  restrictPath?: readonly number[],
): Array<{ candidate: AnchorCandidate; occurrence: number }> {
  const matches: Array<{ candidate: AnchorCandidate; occurrence: number }> = [];
  const nodes =
    restrictPath === undefined
      ? index.formulaNodes
      : index.formulaNodes.filter(
          (node) => nodePathKey(node.nodePath) === nodePathKey(restrictPath),
        );
  for (const node of nodes) {
    const occurrences = findQuoteOccurrences(node.latex, query);
    for (const [position, occurrence] of occurrences.entries()) {
      const context = textContext(node.latex, occurrence.start, occurrence.end);
      matches.push({
        candidate: {
          range: {
            kind: 'formula',
            nodePath: [...node.nodePath],
            form: 'term',
            latexStart: occurrence.start,
            latexEnd: occurrence.end,
            occurrence: position + 1,
          },
          score: 0,
          context,
          occurrence: position + 1,
        },
        occurrence: position + 1,
      });
    }
  }
  return matches;
}

function formulaWholeMatches(
  index: BlockAnchorIndex,
  latex: string,
  restrictPath?: readonly number[],
): AnchorCandidate[] {
  const nodes =
    restrictPath === undefined
      ? index.formulaNodes
      : index.formulaNodes.filter(
          (node) => nodePathKey(node.nodePath) === nodePathKey(restrictPath),
        );
  const candidates: AnchorCandidate[] = [];
  for (const node of nodes) {
    if (node.latex !== latex) continue;
    candidates.push({
      range: { kind: 'formula', nodePath: [...node.nodePath], form: 'whole' },
      score: 0,
    });
  }
  return candidates;
}

function codeMatches(
  index: BlockAnchorIndex,
  quote: string,
  restrictPath?: readonly number[],
): AnchorCandidate[] {
  const nodes =
    restrictPath === undefined
      ? index.codeNodes
      : index.codeNodes.filter((node) => nodePathKey(node.nodePath) === nodePathKey(restrictPath));
  const candidates: AnchorCandidate[] = [];
  for (const node of nodes) {
    const occurrences = findQuoteOccurrences(node.text, quote);
    for (const [position, occurrence] of occurrences.entries()) {
      const context = textContext(node.text, occurrence.start, occurrence.end);
      const lines = codeLineRange(node.text, occurrence.start, occurrence.end);
      candidates.push({
        range: {
          kind: 'code',
          nodePath: [...node.nodePath],
          start: occurrence.start,
          end: occurrence.end,
          lineStart: lines.lineStart,
          lineEnd: lines.lineEnd,
        },
        score: 0,
        context,
        occurrence: position + 1,
      });
    }
  }
  return candidates;
}

function imageCandidates(index: BlockAnchorIndex, assetId: string): AnchorCandidate[] {
  return index.imageNodes
    .filter((node) => node.assetId === assetId)
    .map((node) => ({
      range: {
        kind: 'image',
        nodePath: [...node.nodePath],
        assetId,
        rect: { x: 0, y: 0, width: 1, height: 1 },
        point: false,
      },
      score: 0,
    }));
}

function boundFormulaNode(
  index: BlockAnchorIndex,
  inspection: AnchorBindingInspection,
): FormulaNodeInfo | null {
  const occurrence = inspection.occurrences[0];
  if (occurrence === undefined) return null;
  return (
    index.formulaNodes.find(
      (node) => nodePathKey(node.nodePath) === nodePathKey(occurrence.nodePath),
    ) ?? null
  );
}

function boundCodeNode(
  index: BlockAnchorIndex,
  inspection: AnchorBindingInspection,
): CodeNodeInfo | null {
  const occurrence = inspection.occurrences[0];
  if (occurrence === undefined) return null;
  return (
    index.codeNodes.find((node) => nodePathKey(node.nodePath) === nodePathKey(occurrence.nodePath)) ??
    null
  );
}

function boundImageNode(
  index: BlockAnchorIndex,
  inspection: AnchorBindingInspection,
): ImageNodeInfo | null {
  const occurrence = inspection.occurrences[0];
  if (occurrence === undefined) return null;
  return (
    index.imageNodes.find(
      (node) => nodePathKey(node.nodePath) === nodePathKey(occurrence.nodePath),
    ) ?? null
  );
}

function resolveTextFallback(
  anchor: Anchor,
  index: BlockAnchorIndex,
  selector: Record<string, unknown> | null,
  issues: AnchorResolutionIssue[],
): ResolutionOutcome {
  const quote = selectorText(selector, 'quote', anchor.quote);
  if (quote === undefined || quote.length === 0) {
    issues.push({ code: 'invalid-selector', message: 'text anchor has no selector quote' });
    return { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null };
  }
  const prefix = selectorText(selector, 'prefix', anchor.prefix);
  const suffix = selectorText(selector, 'suffix', anchor.suffix);
  const occurrences = findProjectionQuoteCandidates(index.projection, quote).filter(
    (candidate) => !candidate.crossesBarrier,
  );
  const candidates: AnchorCandidate[] = occurrences.map((occurrence) => ({
    range: {
      kind: 'text',
      projectionStart: occurrence.start,
      projectionEnd: occurrence.end,
      ranges: textRangesForProjectionRange(index.projection, occurrence.start, occurrence.end),
    },
    score: 0,
    context: { prefix: occurrence.prefix, suffix: occurrence.suffix },
    occurrence:
      occurrences.findIndex(
        (candidate) => candidate.start === occurrence.start && candidate.end === occurrence.end,
      ) + 1,
  }));
  for (const candidate of candidates) {
    candidate.score = scoreCandidate(
      candidate,
      selector === null ? null : { ...selector, prefix, suffix },
      candidate.occurrence,
    );
  }
  const sorted = [...candidates].sort(compareCandidates);
  if (sorted.length === 0) {
    return { state: 'broken', reason: 'quote-missing', candidates: [], resolved: null };
  }
  if (sorted.length === 1) {
    return { state: 'resolved', reason: 'unique-quote', candidates: sorted, resolved: sorted[0] ?? null };
  }
  const contextual = sorted.filter((candidate) =>
    contextMatches(candidate.context ?? {}, {
      prefix,
      suffix,
    }),
  );
  if (contextual.length === 1) {
    return {
      state: 'resolved',
      reason: 'unique-context',
      candidates: sorted,
      resolved: contextual[0] ?? null,
    };
  }
  return {
    state: 'ambiguous',
    reason: 'multiple-candidates',
    candidates: sorted,
    resolved: null,
  };
}

function resolveTextBinding(
  anchor: Anchor,
  index: BlockAnchorIndex,
  inspection: AnchorBindingInspection,
  selector: Record<string, unknown> | null,
): ResolutionOutcome {
  if (inspection.textRange === null) {
    return { state: 'broken', reason: 'empty-binding', candidates: [], resolved: null };
  }
  const range = inspection.textRange;
  const context = projectionContext(index.projection, range.start, range.end);
  const candidate: AnchorCandidate = {
    range: {
      kind: 'text',
      projectionStart: range.start,
      projectionEnd: range.end,
      ranges: range.ranges,
    },
    score: 0,
    context,
  };
  candidate.score = scoreCandidate(candidate, selector, 1);
  return {
    state: 'resolved',
    reason: 'exact-binding',
    candidates: [candidate],
    resolved: candidate,
  };
}

function resolveFormulaBinding(
  index: BlockAnchorIndex,
  inspection: AnchorBindingInspection,
  anchor: Anchor,
  selector: Record<string, unknown> | null,
  issues: AnchorResolutionIssue[],
): ResolutionOutcome {
  const node = boundFormulaNode(index, inspection);
  if (node === null) {
    return { state: 'broken', reason: 'node-missing', candidates: [], resolved: null };
  }
  const form = selector?.['form'];
  if (form !== undefined && form !== 'whole' && form !== 'term') {
    issues.push({ code: 'invalid-selector', message: 'formula selector.form is invalid' });
    return { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null };
  }
  if (form === 'term') {
    const latex = selectorText(selector, 'latex', anchor.quote);
    if (latex === undefined || latex.length === 0) {
      issues.push({ code: 'invalid-selector', message: 'formula term anchor has no latex term' });
      return { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null };
    }
    const matches = formulaMatches(index, latex, node.nodePath);
    if (matches.length === 0) {
      return { state: 'broken', reason: 'quote-missing', candidates: [], resolved: null };
    }
    const candidates = matches.map((match) => match.candidate);
    for (const candidate of candidates) {
      candidate.score = scoreCandidate(candidate, selector, candidate.occurrence);
    }
    const sorted = [...candidates].sort(compareCandidates);
    if (sorted.length === 1) {
      return {
        state: 'resolved',
        reason: 'exact-binding',
        candidates: sorted,
        resolved: sorted[0] ?? null,
      };
    }
    return {
      state: 'ambiguous',
      reason: 'multiple-candidates',
      candidates: sorted,
      resolved: null,
    };
  }

  // M2-compatible formula records without `form` resolve as a whole formula.
  const candidate: AnchorCandidate = {
    range: { kind: 'formula', nodePath: [...node.nodePath], form: 'whole' },
    score: 1000,
  };
  return {
    state: 'resolved',
    reason: 'exact-binding',
    candidates: [candidate],
    resolved: candidate,
  };
}

function resolveFormulaFallback(
  index: BlockAnchorIndex,
  anchor: Anchor,
  selector: Record<string, unknown> | null,
  issues: AnchorResolutionIssue[],
): ResolutionOutcome {
  const form = selector?.['form'];
  if (form !== undefined && form !== 'whole' && form !== 'term') {
    issues.push({ code: 'invalid-selector', message: 'formula selector.form is invalid' });
    return { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null };
  }
  const latex = selectorText(selector, 'latex', anchor.quote);
  if (latex === undefined || (form === 'term' && latex.length === 0)) {
    issues.push({ code: 'invalid-selector', message: 'formula anchor has no latex selector' });
    return { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null };
  }
  if (form === 'whole' || form === undefined) {
    const candidates = formulaWholeMatches(index, latex);
    for (const candidate of candidates) candidate.score = 1000;
    return outcomeFromMatches(candidates, 'unique-quote');
  }
  const matches = formulaMatches(index, latex);
  const candidates = matches.map((match) => match.candidate);
  for (const candidate of candidates) {
    candidate.score = scoreCandidate(candidate, selector, candidate.occurrence);
  }
  return outcomeFromMatches(candidates, 'unique-quote');
}

function resolveCodeBinding(
  index: BlockAnchorIndex,
  inspection: AnchorBindingInspection,
  anchor: Anchor,
  selector: Record<string, unknown> | null,
  issues: AnchorResolutionIssue[],
): ResolutionOutcome {
  const node = boundCodeNode(index, inspection);
  if (node === null) {
    return { state: 'broken', reason: 'node-missing', candidates: [], resolved: null };
  }
  const quote = selectorText(selector, 'quote', anchor.quote);
  if (quote === undefined || quote.length === 0) {
    issues.push({ code: 'invalid-selector', message: 'code anchor has no selector quote' });
    return { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null };
  }
  const candidates = codeMatches(index, quote, node.nodePath);
  for (const candidate of candidates) {
    candidate.score = scoreCandidate(candidate, selector, candidate.occurrence);
  }
  if (candidates.length === 0) {
    return { state: 'broken', reason: 'quote-missing', candidates: [], resolved: null };
  }
  const sorted = [...candidates].sort(compareCandidates);
  if (sorted.length === 1) {
    return {
      state: 'resolved',
      reason: 'exact-binding',
      candidates: sorted,
      resolved: sorted[0] ?? null,
    };
  }
  // Multiple quote occurrences stay ambiguous even when the offset/context hint
  // points at one of them; hints rank candidates only (spec §8.2).
  return {
    state: 'ambiguous',
    reason: 'multiple-candidates',
    candidates: sorted,
    resolved: null,
  };
}

function resolveCodeFallback(
  index: BlockAnchorIndex,
  anchor: Anchor,
  selector: Record<string, unknown> | null,
  issues: AnchorResolutionIssue[],
): ResolutionOutcome {
  const quote = selectorText(selector, 'quote', anchor.quote);
  if (quote === undefined || quote.length === 0) {
    issues.push({ code: 'invalid-selector', message: 'code anchor has no selector quote' });
    return { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null };
  }
  const candidates = codeMatches(index, quote);
  for (const candidate of candidates) {
    candidate.score = scoreCandidate(candidate, selector, candidate.occurrence);
  }
  const sorted = [...candidates].sort(compareCandidates);
  if (sorted.length === 0) {
    return { state: 'broken', reason: 'quote-missing', candidates: [], resolved: null };
  }
  if (sorted.length === 1) {
    return {
      state: 'resolved',
      reason: 'unique-quote',
      candidates: sorted,
      resolved: sorted[0] ?? null,
    };
  }
  return {
    state: 'ambiguous',
    reason: 'multiple-candidates',
    candidates: sorted,
    resolved: null,
  };
}

function imageSelector(anchor: Anchor): ImageAnchorSelector | null {
  const validation = validateAnchorSelector(anchor.selector, 'image');
  if (validation.selector === null || validation.selector.kind !== 'image') return null;
  if (validation.issues.length > 0) return null;
  return validation.selector as ImageAnchorSelector;
}

function resolveImageBinding(
  document: Document,
  index: BlockAnchorIndex,
  inspection: AnchorBindingInspection,
  selector: ImageAnchorSelector,
  issues: AnchorResolutionIssue[],
  assetAvailability: AssetAvailabilityIndex | undefined,
): ResolutionOutcome {
  const node = boundImageNode(index, inspection);
  if (node === null) {
    return { state: 'broken', reason: 'node-missing', candidates: [], resolved: null };
  }
  if (node.assetId === null) {
    issues.push({ code: 'invalid-selector', message: 'image node has no asset id' });
    return { state: 'broken', reason: 'asset-missing', candidates: [], resolved: null };
  }
  if (node.assetId !== selector.assetId) {
    return { state: 'broken', reason: 'asset-changed', candidates: [], resolved: null };
  }
  // File integrity is session state supplied by the runtime. A missing file or
  // a hash mismatch is a broken anchor even though the canonical record exists;
  // the branch, target, and alt text are never removed.
  const unavailable = assetAvailability?.[selector.assetId];
  if (unavailable === 'asset-changed') {
    return { state: 'broken', reason: 'asset-changed', candidates: [], resolved: null };
  }
  if (unavailable === 'asset-missing') {
    return { state: 'broken', reason: 'asset-missing', candidates: [], resolved: null };
  }
  if (document.assets[selector.assetId] === undefined) {
    return { state: 'broken', reason: 'asset-missing', candidates: [], resolved: null };
  }
  const expectedCrop = selector.crop ?? FULL_RECT;
  const actualCrop = node.crop ?? FULL_RECT;
  if (!rectsEqual(expectedCrop, actualCrop)) {
    return { state: 'broken', reason: 'crop-changed', candidates: [], resolved: null };
  }
  const candidate: AnchorCandidate = {
    range: {
      kind: 'image',
      nodePath: [...node.nodePath],
      assetId: selector.assetId,
      rect: selector.rect,
      ...(selector.crop === undefined ? {} : { crop: selector.crop }),
      point: selector.point,
    },
    score: 1000,
  };
  return {
    state: 'resolved',
    reason: 'exact-binding',
    candidates: [candidate],
    resolved: candidate,
  };
}

function resolveImageFallback(
  document: Document,
  index: BlockAnchorIndex,
  selector: ImageAnchorSelector,
  assetAvailability: AssetAvailabilityIndex | undefined,
): ResolutionOutcome {
  const unavailable = assetAvailability?.[selector.assetId];
  if (unavailable === 'asset-changed') {
    return { state: 'broken', reason: 'asset-changed', candidates: [], resolved: null };
  }
  if (unavailable === 'asset-missing') {
    return { state: 'broken', reason: 'asset-missing', candidates: [], resolved: null };
  }
  if (document.assets[selector.assetId] === undefined) {
    return { state: 'broken', reason: 'asset-missing', candidates: [], resolved: null };
  }
  const candidates = imageCandidates(index, selector.assetId).map((candidate) => ({
    ...candidate,
    range: {
      ...candidate.range,
      assetId: selector.assetId,
      rect: selector.rect,
      ...(selector.crop === undefined ? {} : { crop: selector.crop }),
      point: selector.point,
    },
  }));
  if (candidates.length === 0) {
    return { state: 'broken', reason: 'node-missing', candidates: [], resolved: null };
  }
  return {
    state: 'ambiguous',
    reason: 'candidate-requires-confirmation',
    candidates,
    resolved: null,
  };
}

function resolutionIssues(
  anchor: Anchor,
  inspection: AnchorBindingInspection,
  selectorValidationIssues: AnchorSelectorIssue[],
): AnchorResolutionIssue[] {
  const issues: AnchorResolutionIssue[] = [];
  for (const selectorIssue of selectorValidationIssues) {
    issues.push({
      code: selectorIssue.code === 'unsupported-anchor-kind' ? 'unsupported-kind' : 'invalid-selector',
      message: selectorIssue.message,
    });
  }
  for (const mirrorIssue of anchorSelectorMirrorIssues(anchor)) {
    issues.push({ code: 'selector-mismatch', message: mirrorIssue.message });
  }
  if (inspection.occurrences.some((occurrence) => occurrence.legacyConflict)) {
    issues.push({
      code: 'legacy-conflict',
      message: 'anchorIds wins but does not include the legacy anchorId',
    });
  }
  return issues;
}

function applyOutcome(
  anchor: Anchor,
  binding: AnchorResolution['binding'],
  outcome: ResolutionOutcome,
  issues: AnchorResolutionIssue[],
): AnchorResolution {
  const unique = new Map<string, AnchorResolutionIssue>();
  for (const issue of issues) {
    unique.set(`${issue.code}\u0000${issue.message}`, issue);
  }
  return {
    anchorId: anchor.id,
    blockId: anchor.blockId,
    state: outcome.state,
    reason: outcome.reason,
    candidates: outcome.candidates,
    resolved: outcome.resolved,
    binding,
    orderKey: resolvedOrderKey(anchor.id, outcome.resolved),
    issues: [...unique.values()],
  };
}

export interface AnchorResolutionOptions {
  /**
   * Session asset availability, keyed by asset id. Only image assets not
   * confirmed available are listed. Absent ids keep canonical-record behavior.
   */
  assetAvailability?: AssetAvailabilityIndex;
}

function resolveAnchorWithIndex(
  document: Document,
  anchor: Anchor,
  index: BlockAnchorIndex,
  options: AnchorResolutionOptions = {},
): AnchorResolution {
  const kind = anchor.kind;
  if (!isKnownAnchorKind(kind)) {
    return {
      anchorId: anchor.id,
      blockId: anchor.blockId,
      state: 'broken',
      reason: 'unsupported-kind',
      candidates: [],
      resolved: null,
      binding: 'none',
      orderKey: null,
      issues: [{ code: 'unsupported-kind', message: `unknown anchor kind "${String(kind)}"` }],
    };
  }

  const selectorValidation = validateAnchorSelector(anchor.selector, kind);
  const selector = selectorRecord(anchor);
  const inspection = inspectAnchorBinding(index, anchor.id);
  const issues = resolutionIssues(anchor, inspection, selectorValidation.issues);

  if (inspection.presence !== 'none') {
    const kindCheck = checkAnchorBindingKind(inspection, kind);
    if (!kindCheck.ok) {
      return applyOutcome(
        anchor,
        inspection.presence,
        { state: 'broken', reason: 'kind-mismatch', candidates: [], resolved: null },
        [
          ...issues,
          {
            code: 'kind-mismatch',
            message: `anchor "${anchor.id}" is bound to the wrong content node kind`,
          },
        ],
      );
    }
    if (inspection.reason === 'duplicate-binding' || inspection.reason === 'mixed-binding') {
      return applyOutcome(
        anchor,
        inspection.presence,
        { state: 'broken', reason: 'duplicate-binding', candidates: [], resolved: null },
        issues,
      );
    }
    if (inspection.reason === 'not-contiguous') {
      return applyOutcome(
        anchor,
        inspection.presence,
        { state: 'broken', reason: 'not-contiguous', candidates: [], resolved: null },
        issues,
      );
    }
    if (inspection.reason === 'crosses-barrier') {
      return applyOutcome(
        anchor,
        inspection.presence,
        { state: 'broken', reason: 'crosses-barrier', candidates: [], resolved: null },
        issues,
      );
    }
    if (inspection.reason === 'empty-binding' || inspection.reason === 'invalid-binding') {
      return applyOutcome(
        anchor,
        inspection.presence,
        {
          state: 'broken',
          reason: inspection.reason === 'empty-binding' ? 'empty-binding' : 'invalid-selector',
          candidates: [],
          resolved: null,
        },
        issues,
      );
    }

    if (kind === 'text') {
      return applyOutcome(
        anchor,
        inspection.presence,
        resolveTextBinding(anchor, index, inspection, selector),
        issues,
      );
    }
    if (kind === 'formula') {
      return applyOutcome(
        anchor,
        inspection.presence,
        resolveFormulaBinding(index, inspection, anchor, selector, issues),
        issues,
      );
    }
    if (kind === 'code') {
      return applyOutcome(
        anchor,
        inspection.presence,
        resolveCodeBinding(index, inspection, anchor, selector, issues),
        issues,
      );
    }
    const image = imageSelector(anchor);
    if (image === null) {
      return applyOutcome(
        anchor,
        inspection.presence,
        { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null },
        issues,
      );
    }
    return applyOutcome(
      anchor,
      inspection.presence,
      resolveImageBinding(
        document,
        index,
        inspection,
        image,
        issues,
        options.assetAvailability,
      ),
      issues,
    );
  }

  const selectorKind = selector?.['kind'];
  if (isString(selectorKind) && selectorKind !== kind) {
    issues.push({
      code: 'invalid-selector',
      message: `selector.kind "${selectorKind}" does not match anchor.kind "${kind}"`,
    });
    return applyOutcome(
      anchor,
      'none',
      { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null },
      issues,
    );
  }

  if (kind === 'text') {
    return applyOutcome(
      anchor,
      'none',
      resolveTextFallback(anchor, index, selector, issues),
      issues,
    );
  }
  if (kind === 'formula') {
    return applyOutcome(
      anchor,
      'none',
      resolveFormulaFallback(index, anchor, selector, issues),
      issues,
    );
  }
  if (kind === 'code') {
    return applyOutcome(
      anchor,
      'none',
      resolveCodeFallback(index, anchor, selector, issues),
      issues,
    );
  }
  const image = imageSelector(anchor);
  if (image === null) {
    return applyOutcome(
      anchor,
      'none',
      { state: 'broken', reason: 'invalid-selector', candidates: [], resolved: null },
      issues,
    );
  }
  return applyOutcome(
    anchor,
    'none',
    resolveImageFallback(document, index, image, options.assetAvailability),
    issues,
  );
}

function hasOutgoingBranch(document: Document, anchorId: string): boolean {
  return Object.values(document.branches).some(
    (branch) => branch.source.anchorId === anchorId,
  );
}

function outgoingAnchorIds(document: Document): Set<string> {
  const ids = new Set<string>();
  for (const branch of Object.values(document.branches)) {
    if (branch.source.anchorId !== undefined) ids.add(branch.source.anchorId);
  }
  return ids;
}

/**
 * Resolve one anchor.
 *
 * - `block-missing` wins over every other state.
 * - `idle` wins when the anchor has no outgoing branch: the marker is hidden
 *   and the anchor is not listed in health until a branch exists.
 * - exact binding or a unique fallback is required to resolve; everything else
 *   is ambiguous or broken. `lastKnown` is never read.
 */
export function resolveAnchor(
  document: Document,
  anchorOrId: Anchor | string,
  options: AnchorResolutionOptions = {},
): AnchorResolution {
  const anchor =
    typeof anchorOrId === 'string' ? document.anchors[anchorOrId] : anchorOrId;
  if (anchor === undefined) {
    return emptyResolution(
      typeof anchorOrId === 'string' ? anchorOrId : '',
      '',
      'broken',
      'anchor-missing',
    );
  }
  const block = document.blocks[anchor.blockId];
  if (block === undefined) {
    return withRepairFlags(
      anchor,
      emptyResolution(anchor.id, anchor.blockId, 'block-missing', 'block-missing'),
    );
  }
  if (!hasOutgoingBranch(document, anchor.id)) {
    return withRepairFlags(
      anchor,
      emptyResolution(anchor.id, anchor.blockId, 'idle', 'no-outgoing-branch'),
    );
  }
  const index = buildBlockAnchorIndex(anchor.blockId, block.content);
  return withRepairFlags(anchor, resolveAnchorWithIndex(document, anchor, index, options));
}

/** Attach stored repair hints to a resolution without changing its state. */
function withRepairFlags(anchor: Anchor, resolution: AnchorResolution): AnchorResolution {
  const flags = Array.isArray(anchor.repairFlags)
    ? anchor.repairFlags.filter((flag): flag is string => typeof flag === 'string' && flag.length > 0)
    : [];
  if (flags.length === 0) return resolution;
  return { ...resolution, repairFlags: [...new Set(flags)].sort() };
}

function stateRank(state: AnchorState): number {
  if (state === 'resolved') return 0;
  if (state === 'ambiguous') return 1;
  if (state === 'broken') return 2;
  if (state === 'idle') return 3;
  return 4;
}

export function compareAnchorResolutions(
  left: AnchorResolution,
  right: AnchorResolution,
): number {
  if (left.orderKey !== null && right.orderKey !== null) {
    const order = compareStrings(left.orderKey, right.orderKey);
    if (order !== 0) return order;
  } else if (left.orderKey !== null) {
    return -1;
  } else if (right.orderKey !== null) {
    return 1;
  }
  const rank = stateRank(left.state) - stateRank(right.state);
  if (rank !== 0) return rank;
  return compareStrings(left.anchorId, right.anchorId);
}

/** Resolve every anchor belonging to one block, in content order. */
export function resolveBlockAnchors(
  document: Document,
  blockId: string,
  options: AnchorResolutionOptions = {},
): AnchorResolution[] {
  const block = document.blocks[blockId];
  if (block === undefined) return [];
  const anchors = Object.values(document.anchors).filter(
    (anchor) => anchor.blockId === blockId,
  );
  if (anchors.length === 0) return [];
  const index = buildBlockAnchorIndex(blockId, block.content);
  const outgoing = outgoingAnchorIds(document);
  return anchors
    .map((anchor) => {
      if (!outgoing.has(anchor.id)) {
        return withRepairFlags(
          anchor,
          emptyResolution(anchor.id, anchor.blockId, 'idle', 'no-outgoing-branch'),
        );
      }
      return withRepairFlags(anchor, resolveAnchorWithIndex(document, anchor, index, options));
    })
    .sort(compareAnchorResolutions);
}

export interface DocumentAnchorResolutions extends JsonObject {
  byId: Record<string, AnchorResolution>;
  byBlock: Record<string, AnchorResolution[]>;
  anchorIds: string[];
  counts: Record<AnchorState, number>;
}

/**
 * Resolve every anchor against already-built block indexes.
 *
 * The caller owns the block indexes (the session's `AnchorIndex` keeps them
 * across revisions). This function owns the resolution contract itself —
 * `block-missing` → `idle` → binding/fallback precedence, repair flags,
 * grouping and ordering — so no index implementation can restate it.
 */
export function resolveDocumentAnchorsWithIndexes(
  document: Document,
  indexes: ReadonlyMap<string, BlockAnchorIndex>,
  options: AnchorResolutionOptions = {},
): DocumentAnchorResolutions {
  const byId: Record<string, AnchorResolution> = {};
  const byBlock: Record<string, AnchorResolution[]> = {};
  const counts: Record<AnchorState, number> = {
    resolved: 0,
    ambiguous: 0,
    broken: 0,
    idle: 0,
    'block-missing': 0,
  };
  const outgoing = outgoingAnchorIds(document);
  const anchorIds = Object.keys(document.anchors).sort(compareStrings);
  for (const anchorId of anchorIds) {
    const anchor = document.anchors[anchorId];
    if (anchor === undefined) continue;
    let resolution: AnchorResolution;
    const index = indexes.get(anchor.blockId);
    if (index === undefined) {
      resolution = withRepairFlags(
        anchor,
        emptyResolution(anchor.id, anchor.blockId, 'block-missing', 'block-missing'),
      );
    } else if (!outgoing.has(anchor.id)) {
      resolution = withRepairFlags(
        anchor,
        emptyResolution(anchor.id, anchor.blockId, 'idle', 'no-outgoing-branch'),
      );
    } else {
      resolution = withRepairFlags(anchor, resolveAnchorWithIndex(document, anchor, index, options));
    }
    byId[anchorId] = resolution;
    const list = byBlock[anchor.blockId] ?? [];
    list.push(resolution);
    byBlock[anchor.blockId] = list;
    counts[resolution.state] += 1;
  }
  for (const list of Object.values(byBlock)) list.sort(compareAnchorResolutions);
  return { byId, byBlock, anchorIds, counts };
}

/**
 * Resolve every anchor in the document. Each block index is built once, so
 * document load stays linear in content size plus anchors.
 */
export function resolveDocumentAnchors(
  document: Document,
  options: AnchorResolutionOptions = {},
): DocumentAnchorResolutions {
  const indexes = new Map<string, BlockAnchorIndex>();
  const anchorBlockIds = new Set(
    Object.values(document.anchors).map((anchor) => anchor.blockId),
  );
  for (const [blockId, block] of Object.entries(document.blocks)) {
    if (!anchorBlockIds.has(blockId)) continue;
    indexes.set(blockId, buildBlockAnchorIndex(blockId, block.content));
  }
  return resolveDocumentAnchorsWithIndexes(document, indexes, options);
}

/** Content block helper used by callers that already hold the block. */
export function buildBlockIndexFor(block: ContentBlock): BlockAnchorIndex {
  return buildBlockAnchorIndex(block.id, block.content);
}
