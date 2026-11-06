/**
 * Derived anchor-health data for the M3e status chip and sheet.
 *
 * Everything here is pure: it reads the canonical document and returns display
 * rows plus the exact command a candidate choice would run. It never mutates
 * content and never resolves an ambiguous anchor on its own.
 */

import type {
  AnchorBinding,
  AnchorCandidate,
  AnchorKind,
  AnchorResolution,
  AnchorResolutionReason,
  Branch,
  BranchRole,
  Document,
  JsonObject,
} from '@noteforest/core';
import {
  isKnownAnchorKind,
  resolveDocumentAnchors,
  validateAnchorSelector,
} from '@noteforest/core';
import type { AnchorRepairCommand } from '@noteforest/core';
import { anchorQuote, blockTitle, chapterIdOf } from './tree';

export type AnchorHealthFilter = 'all' | 'broken' | 'ambiguous';

export type AnchorHealthState = 'broken' | 'ambiguous';

export interface AnchorHealthBranch {
  id: string;
  role: BranchRole;
  targetBlockId: string;
  targetTitle: string;
  label?: string;
}

export interface AnchorHealthRow {
  anchorId: string;
  blockId: string;
  kind: AnchorKind;
  state: AnchorHealthState;
  reason: AnchorResolutionReason;
  reasonLabel: string;
  quote: string;
  /** Stored context around the quote, without the quote itself. */
  prefix: string;
  suffix: string;
  blockTitle: string;
  chapterTitle: string;
  branchCount: number;
  branches: AnchorHealthBranch[];
  resolution: AnchorResolution;
}

export interface AnchorHealthSummary {
  broken: number;
  ambiguous: number;
  total: number;
}

export interface AnchorCandidateView {
  index: number;
  candidate: AnchorCandidate;
  label: string;
  context: string;
}

/**
 * One side of an `anchor.repair` before/after preview. `quote` is the stored or
 * proposed source, `context` is the stored prefix/suffix window, and
 * `descriptors` names the occurrence/offsets and binding shape.
 */
export interface AnchorRepairPreviewSide {
  quote: string;
  context: string;
  descriptors: string[];
}

/**
 * Read-only preview of one `anchor.repair`. The command is the exact payload
 * that will be applied; the sheet never resolves or rewrites it locally.
 */
export interface AnchorRepairPreview {
  anchorId: string;
  blockId: string;
  blockTitle: string;
  chapterTitle: string;
  kind: AnchorKind;
  before: AnchorRepairPreviewSide;
  after: AnchorRepairPreviewSide;
  branches: AnchorHealthBranch[];
  command: AnchorRepairCommand;
}

const REASON_LABELS: Partial<Record<AnchorResolutionReason, string>> = {
  'exact-binding': 'The exact binding still resolves.',
  'unique-quote': 'A unique quote still resolves.',
  'unique-context': 'Unique surrounding context still resolves.',
  'multiple-candidates': 'More than one location matches. Choose the right one.',
  'candidate-requires-confirmation': 'The match needs an explicit choice.',
  'duplicate-binding': 'The anchor is bound to more than one location.',
  'not-contiguous': 'The anchored range is no longer contiguous.',
  'crosses-barrier': 'The anchored range crosses a block-level element.',
  'empty-binding': 'The anchored range is empty.',
  'kind-mismatch': 'The anchor is bound to a different content kind.',
  'invalid-selector': 'The stored selector is invalid.',
  'quote-missing': 'The stored quote is no longer in the block.',
  'node-missing': 'The formula or code block is no longer in the block.',
  'asset-changed': 'The image asset changed.',
  'crop-changed': 'The image crop changed.',
  'asset-missing': 'The image asset is missing.',
  'unsupported-kind': 'The anchor kind is not supported.',
  'block-missing': 'The anchor block no longer exists.',
  'anchor-missing': 'The anchor record is missing.',
  'no-outgoing-branch': 'The anchor has no outgoing branch.',
};

export function anchorHealthReason(reason: AnchorResolutionReason): string {
  return REASON_LABELS[reason] ?? 'The anchor cannot be resolved.';
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function selectorString(selector: JsonObject, key: string): string {
  const value = selector[key];
  return typeof value === 'string' ? value : '';
}

function contextFields(anchor: Document['anchors'][string]): {
  prefix: string;
  suffix: string;
} {
  const selector = anchor.selector;
  if (anchor.kind === 'formula') {
    return {
      prefix: selectorString(selector, 'latexPrefix'),
      suffix: selectorString(selector, 'latexSuffix'),
    };
  }
  if (anchor.kind === 'text' || anchor.kind === 'code') {
    return {
      prefix: selectorString(selector, 'prefix'),
      suffix: selectorString(selector, 'suffix'),
    };
  }
  return { prefix: '', suffix: '' };
}

function branchList(
  document: Document,
  anchorId: string,
): AnchorHealthBranch[] {
  const roleRank = (role: BranchRole): number => (role === 'primary' ? 0 : 1);
  return Object.values(document.branches)
    .filter((branch) => branch.source.anchorId === anchorId)
    .sort((left, right) => {
      const role = roleRank(left.role) - roleRank(right.role);
      if (role !== 0) return role;
      const order = compareStrings(left.order, right.order);
      if (order !== 0) return order;
      return compareStrings(left.id, right.id);
    })
    .map((branch: Branch) => ({
      id: branch.id,
      role: branch.role,
      targetBlockId: branch.targetBlockId,
      targetTitle: blockTitle(document.blocks[branch.targetBlockId]),
      ...(branch.label === undefined ? {} : { label: branch.label }),
    }));
}

function chapterTitleOf(document: Document, blockId: string): string {
  const chapterId = chapterIdOf(document, blockId);
  if (chapterId === null) return 'No chapter';
  const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
  return chapter?.title?.trim() || 'Untitled chapter';
}

function healthBlockTitle(
  document: Document,
  blockId: string,
  kind: AnchorKind,
): string {
  const title = blockTitle(document.blocks[blockId]);
  if (title !== 'Empty block') return title;
  if (kind === 'formula') return 'Formula block';
  if (kind === 'code') return 'Code block';
  if (kind === 'image') return 'Image block';
  return title;
}

/**
 * List every broken or ambiguous anchor with its block, chapter, quote,
 * context, reason, and outgoing branches. Idle and resolved anchors are not
 * health warnings and stay out of this list.
 */
export function buildAnchorHealthRows(document: Document): AnchorHealthRow[] {
  const resolutions = resolveDocumentAnchors(document);
  const rows: AnchorHealthRow[] = [];
  for (const anchorId of resolutions.anchorIds) {
    const resolution = resolutions.byId[anchorId];
    const anchor = document.anchors[anchorId];
    if (resolution === undefined || anchor === undefined) continue;
    if (resolution.state !== 'broken' && resolution.state !== 'ambiguous') continue;
    if (!isKnownAnchorKind(anchor.kind)) continue;
    const context = contextFields(anchor);
    const branches = branchList(document, anchorId);
    rows.push({
      anchorId,
      blockId: anchor.blockId,
      kind: anchor.kind,
      state: resolution.state,
      reason: resolution.reason,
      reasonLabel: anchorHealthReason(resolution.reason),
      quote: anchorQuote(document, anchorId),
      prefix: context.prefix,
      suffix: context.suffix,
      blockTitle: healthBlockTitle(document, anchor.blockId, anchor.kind),
      chapterTitle: chapterTitleOf(document, anchor.blockId),
      branchCount: branches.length,
      branches,
      resolution,
    });
  }
  rows.sort(
    (left, right) =>
      compareStrings(left.chapterTitle, right.chapterTitle) ||
      compareStrings(left.blockTitle, right.blockTitle) ||
      compareStrings(left.anchorId, right.anchorId),
  );
  return rows;
}

export function filterAnchorHealthRows(
  rows: readonly AnchorHealthRow[],
  filter: AnchorHealthFilter,
): AnchorHealthRow[] {
  if (filter === 'all') return [...rows];
  return rows.filter((row) => row.state === filter);
}

export function summarizeAnchorHealth(
  rows: readonly AnchorHealthRow[],
): AnchorHealthSummary {
  let broken = 0;
  let ambiguous = 0;
  for (const row of rows) {
    if (row.state === 'broken') broken += 1;
    else if (row.state === 'ambiguous') ambiguous += 1;
  }
  return { broken, ambiguous, total: broken + ambiguous };
}

/** Display a quote with its stored context; empty context stays compact. */
export function anchorContextLine(prefix: string, quote: string, suffix: string): string {
  const text = quote.length === 0 ? 'anchor' : quote;
  const before = prefix.length === 0 ? '' : `…${prefix}`;
  const after = suffix.length === 0 ? '' : `${suffix}…`;
  return `${before}${before.length === 0 ? '' : ' '}“${text}”${
    after.length === 0 ? '' : ` ${after}`
  }`;
}

function candidateLabel(
  document: Document,
  anchorId: string,
  candidate: AnchorCandidate,
  index: number,
): string {
  const anchor = document.anchors[anchorId];
  const quote =
    anchor === undefined ? '' : anchorQuote(document, anchorId) || 'anchor';
  const range = candidate.range;
  if (range.kind === 'formula' && range.form === 'term') {
    return `Match ${index + 1} · term “${quote}” · occurrence ${
      candidate.occurrence ?? range.occurrence ?? 1
    }`;
  }
  if (range.kind === 'formula') return `Match ${index + 1} · whole formula “${quote}”`;
  if (range.kind === 'code') {
    return `Match ${index + 1} · lines ${range.lineStart ?? '?'}–${range.lineEnd ?? '?'} · “${quote}”`;
  }
  const projectionStart = typeof range.projectionStart === 'number' ? range.projectionStart : 0;
  return `Match ${index + 1} · “${quote}” at character ${projectionStart + 1}`;
}

/** Candidate rows for the chooser; context is the stored prefix/suffix window. */
export function anchorCandidateViews(
  document: Document,
  anchorId: string,
  resolution: AnchorResolution,
): AnchorCandidateView[] {
  return resolution.candidates.map((candidate, index) => ({
    index,
    candidate,
    label: candidateLabel(document, anchorId, candidate, index),
    context: anchorContextLine(
      candidate.context?.prefix ?? '',
      anchorQuote(document, anchorId),
      candidate.context?.suffix ?? '',
    ),
  }));
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Convert one resolver candidate into the exact `anchor.repair` command. The
 * anchor and branch IDs are not part of the payload: the command keeps both.
 */
export function repairCommandForCandidate(
  document: Document,
  anchorId: string,
  candidate: AnchorCandidate,
): AnchorRepairCommand | null {
  const anchor = document.anchors[anchorId];
  if (anchor === undefined || !isKnownAnchorKind(anchor.kind)) return null;
  const range = candidate.range;
  const selector = anchor.selector;
  const quote =
    nonEmptyString(selectorString(selector, 'quote')) ??
    nonEmptyString(selectorString(selector, 'latex')) ??
    nonEmptyString(anchor.quote);
  if (quote === null) return null;
  const contextPrefix = candidate.context?.prefix ?? '';
  const contextSuffix = candidate.context?.suffix ?? '';

  if (range.kind === 'text' && anchor.kind === 'text') {
    if (range.ranges.length === 0) return null;
    const textSelector: JsonObject = {
      kind: 'text',
      quote,
      prefix: contextPrefix,
      suffix: contextSuffix,
      occurrenceHint: candidate.occurrence ?? 1,
    };
    const validation = validateAnchorSelector(textSelector, 'text');
    if (validation.issues.length > 0) return null;
    return {
      type: 'anchor.repair',
      anchorId,
      selector: textSelector,
      binding: { kind: 'text', ranges: range.ranges.map((entry) => ({ ...entry })) },
    };
  }

  if (range.kind === 'formula' && anchor.kind === 'formula') {
    if (range.form === 'whole') {
      const wholeSelector: JsonObject = { kind: 'formula', form: 'whole', latex: quote };
      if (validateAnchorSelector(wholeSelector, 'formula').issues.length > 0) return null;
      return {
        type: 'anchor.repair',
        anchorId,
        selector: wholeSelector,
        binding: { kind: 'formula', form: 'whole', nodePath: [...range.nodePath] },
      };
    }
    const occurrence = candidate.occurrence ?? range.occurrence ?? 1;
    const termSelector: JsonObject = {
      kind: 'formula',
      form: 'term',
      latex: quote,
      ...(range.latexStart === undefined ? {} : { latexStart: range.latexStart }),
      ...(contextPrefix.length === 0 ? {} : { latexPrefix: contextPrefix }),
      ...(contextSuffix.length === 0 ? {} : { latexSuffix: contextSuffix }),
      occurrenceHint: occurrence,
    };
    if (validateAnchorSelector(termSelector, 'formula').issues.length > 0) return null;
    return {
      type: 'anchor.repair',
      anchorId,
      selector: termSelector,
      binding: {
        kind: 'formula',
        form: 'term',
        nodePath: [...range.nodePath],
        latex: quote,
        occurrence,
      },
    };
  }

  if (range.kind === 'code' && anchor.kind === 'code') {
    const codeSelector: JsonObject = {
      kind: 'code',
      quote,
      form: 'range',
      startOffset: range.start,
      endOffset: range.end,
      ...(contextPrefix.length === 0 ? {} : { prefix: contextPrefix }),
      ...(contextSuffix.length === 0 ? {} : { suffix: contextSuffix }),
      ...(candidate.occurrence === undefined ? {} : { occurrenceHint: candidate.occurrence }),
      ...(range.lineStart === undefined ? {} : { lineStart: range.lineStart }),
      ...(range.lineEnd === undefined ? {} : { lineEnd: range.lineEnd }),
    };
    if (validateAnchorSelector(codeSelector, 'code').issues.length > 0) return null;
    return {
      type: 'anchor.repair',
      anchorId,
      selector: codeSelector,
      binding: {
        kind: 'code',
        nodePath: [...range.nodePath],
        startOffset: range.start,
        endOffset: range.end,
      },
    };
  }

  return null;
}

function numericSelectorField(selector: JsonObject, key: string): number | undefined {
  const value = selector[key];
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function selectorDescriptors(kind: AnchorKind, selector: JsonObject): string[] {
  const occurrence = numericSelectorField(selector, 'occurrenceHint');
  if (kind === 'formula') {
    if (selector['form'] === 'term') {
      const descriptors = [
        occurrence === undefined ? 'Formula term' : `Formula term · occurrence ${occurrence}`,
      ];
      const latexStart = numericSelectorField(selector, 'latexStart');
      if (latexStart !== undefined) descriptors.push(`LaTeX offset ${latexStart}`);
      return descriptors;
    }
    return ['Whole formula'];
  }
  if (kind === 'code') {
    const descriptors: string[] = [];
    const lineStart = numericSelectorField(selector, 'lineStart');
    const lineEnd = numericSelectorField(selector, 'lineEnd');
    if (lineStart !== undefined && lineEnd !== undefined) {
      descriptors.push(
        lineStart === lineEnd ? `Code line ${lineStart}` : `Code lines ${lineStart}–${lineEnd}`,
      );
    } else {
      descriptors.push('Code range');
    }
    const start = numericSelectorField(selector, 'startOffset');
    const end = numericSelectorField(selector, 'endOffset');
    if (start !== undefined && end !== undefined) descriptors.push(`Offsets ${start}–${end}`);
    if (occurrence !== undefined) descriptors.push(`Occurrence ${occurrence}`);
    return descriptors;
  }
  return [occurrence === undefined ? 'Text quote' : `Text quote · occurrence ${occurrence}`];
}

function bindingDescriptor(binding: AnchorBinding): string {
  switch (binding.kind) {
    case 'text': {
      const ranges = binding.ranges
        .map((range) => `${range.start}–${range.end}`)
        .join(', ');
      return `Text binding · ${ranges.length === 0 ? 'no range' : ranges}`;
    }
    case 'formula':
      return binding.form === 'whole'
        ? 'Whole-formula binding'
        : `Term binding · occurrence ${binding.occurrence}`;
    case 'code':
      return `Code binding · offsets ${binding.startOffset}–${binding.endOffset}`;
    case 'image':
      return 'Image region binding';
  }
}

function repairSide(
  anchor: Document['anchors'][string],
  selector: JsonObject,
  binding?: AnchorBinding,
): AnchorRepairPreviewSide {
  const storedQuote =
    typeof anchor.quote === 'string' && anchor.quote.length > 0 ? anchor.quote : '';
  const quote =
    anchor.kind === 'formula'
      ? nonEmptyString(selectorString(selector, 'latex')) ?? storedQuote
      : nonEmptyString(selectorString(selector, 'quote')) ?? storedQuote;
  const prefix =
    anchor.kind === 'formula'
      ? selectorString(selector, 'latexPrefix')
      : selectorString(selector, 'prefix');
  const suffix =
    anchor.kind === 'formula'
      ? selectorString(selector, 'latexSuffix')
      : selectorString(selector, 'suffix');
  const descriptors = selectorDescriptors(anchor.kind, selector);
  if (binding !== undefined) descriptors.push(bindingDescriptor(binding));
  return {
    quote: quote.length === 0 ? 'anchor' : quote,
    context: anchorContextLine(prefix, quote, suffix),
    descriptors,
  };
}

/**
 * Project one validated `anchor.repair` command into a before/after preview.
 * The anchor and branch IDs are read from the canonical document; the command
 * itself is returned unchanged so Confirm applies exactly what was previewed.
 */
export function anchorRepairPreview(
  document: Document,
  anchorId: string,
  command: AnchorRepairCommand,
): AnchorRepairPreview | null {
  if (command.anchorId !== anchorId) return null;
  const anchor = document.anchors[anchorId];
  if (anchor === undefined || !isKnownAnchorKind(anchor.kind)) return null;
  return {
    anchorId,
    blockId: anchor.blockId,
    blockTitle: healthBlockTitle(document, anchor.blockId, anchor.kind),
    chapterTitle: chapterTitleOf(document, anchor.blockId),
    kind: anchor.kind,
    before: repairSide(anchor, anchor.selector),
    after: repairSide(anchor, command.selector, command.binding),
    branches: branchList(document, anchorId),
    command,
  };
}
