/**
 * Anchor aggregate: create, repair, attach-to-block, and delete.
 *
 * Anchor records own a visible content binding; commands that change the
 * binding return a structural snapshot inverse because the exact text-node
 * shape is not reproducible from a second command.
 */

import {
  buildBlockAnchorIndex,
  checkAnchorBindingKind,
  codeAnchorSelectorForBinding,
  codeBlockText,
  codeLineRange,
  codePointLength,
  codePointSlice,
  findQuoteOccurrences,
  formulaLatex,
  getNodeAtPath,
  inspectAnchorBinding,
  isKnownAnchorKind,
  mergeAnchorBinding,
  nodePathKey,
  readContentAnchorBinding,
  removeAnchorBinding,
  textAnchorSelectorForBinding,
  validateAnchorSelector,
} from '../anchors.js';
import type { AnchorBinding } from '../anchors.js';
import type { CoreContext } from '../ids.js';
import { compareBranches, findTopLevelPlacement, topLevelAncestorId } from '../structure.js';
import type {
  Anchor,
  AnchorKind,
  Branch,
  BranchRole,
  ContentBlock,
  ContentNode,
  Document,
  JsonObject,
} from '../types.js';
import {
  allIds,
  anchorOrFail,
  appendBranchesToPort,
  assertId,
  blockOrFail,
  canonicalJson,
  chapterOrFail,
  freshId,
  own,
  reject,
  samePort,
  type BranchPort,
  type ChangeSet,
} from './shared.js';
import type {
  AnchorAttachToBlockCommand,
  AnchorCreateCommand,
  AnchorDeleteCommand,
  AnchorRepairCommand,
  DocumentCommand,
} from './types.js';

interface AnchorMirrorFields {
  quote?: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
}

/** Top-level compatibility mirrors derived from the canonical selector. */
function selectorMirrorFields(kind: AnchorKind, selector: JsonObject): AnchorMirrorFields {
  const fields: AnchorMirrorFields = {};
  if (kind === 'text' || kind === 'code') {
    const quote = selector['quote'];
    if (typeof quote === 'string') fields.quote = quote;
    const prefix = selector['prefix'];
    if (typeof prefix === 'string') fields.prefix = prefix;
    const suffix = selector['suffix'];
    if (typeof suffix === 'string') fields.suffix = suffix;
  } else if (kind === 'formula') {
    const latex = selector['latex'];
    if (typeof latex === 'string') fields.quote = latex;
    const prefix = selector['latexPrefix'];
    if (typeof prefix === 'string') fields.prefix = prefix;
    const suffix = selector['latexSuffix'];
    if (typeof suffix === 'string') fields.suffix = suffix;
  } else {
    const label = selector['label'];
    if (typeof label === 'string') fields.quote = label;
  }
  const hint = selector['occurrenceHint'];
  if (typeof hint === 'number') fields.occurrenceHint = hint;
  return fields;
}

/**
 * Validate the selector, then fold optional command mirrors into the record
 * fields. Selector remains canonical: a provided mirror that disagrees is a
 * command error, not a silent rewrite.
 */
function anchorMirrorFields(
  kind: AnchorKind,
  selector: JsonObject,
  provided: AnchorMirrorFields,
): AnchorMirrorFields {
  if (!isKnownAnchorKind(kind)) {
    reject('invalid-command', `unknown anchor kind "${String(kind)}"`);
  }
  const validation = validateAnchorSelector(selector, kind);
  if (validation.issues.length > 0) {
    reject(
      'invalid-content',
      `invalid ${kind} anchor selector: ${validation.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  }
  const mirrors = selectorMirrorFields(kind, selector);
  for (const key of ['quote', 'prefix', 'suffix'] as const) {
    const value = provided[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') reject('invalid-command', `${key} must be a string`);
    if (mirrors[key] !== undefined && mirrors[key] !== value) {
      reject(
        'invalid-command',
        `${key} does not match selector.${kind === 'formula' ? 'latex' : key}`,
      );
    }
    mirrors[key] = value;
  }
  const hint = provided.occurrenceHint;
  if (hint !== undefined) {
    if (typeof hint !== 'number' || !Number.isInteger(hint) || hint < 1) {
      reject('invalid-command', 'occurrenceHint must be a positive integer');
    }
    if (mirrors.occurrenceHint !== undefined && mirrors.occurrenceHint !== hint) {
      reject('invalid-command', 'occurrenceHint does not match selector.occurrenceHint');
    }
    mirrors.occurrenceHint = hint;
  }
  return mirrors;
}

/**
 * A formula term selector and its binding must describe the same occurrence in
 * the same formula source. The atomic node binding only adds the anchor ID to
 * the node, so validate the substring before any content mutates.
 *
 * Multiple occurrences are valid and deliberately left ambiguous by
 * resolution; the selected occurrence never auto-resolves on its own.
 */
function assertFormulaTermSelection(
  content: ContentNode,
  binding: AnchorBinding,
  selector: JsonObject,
): void {
  if (selector['kind'] !== 'formula' || selector['form'] !== 'term') return;
  if (binding.kind !== 'formula' || binding.form !== 'term') {
    reject('invalid-content', 'a formula term selector requires a formula term binding');
  }
  const term = selector['latex'];
  if (typeof term !== 'string' || term.length === 0) return;
  if (term !== binding.latex) {
    reject('invalid-content', 'formula term selector.latex must match the binding term');
  }
  const hint = selector['occurrenceHint'];
  if (hint !== undefined && hint !== binding.occurrence) {
    reject('invalid-content', 'formula term occurrenceHint must match the binding occurrence');
  }
  if (!Number.isInteger(binding.occurrence) || binding.occurrence < 1) {
    reject('invalid-content', 'formula term occurrence must be a positive integer');
  }
  const node = getNodeAtPath(content, binding.nodePath);
  if (node === null) return;
  if (node.type !== 'mathBlock' && node.type !== 'inlineMath') {
    reject('invalid-content', `a formula term anchor cannot bind a "${node.type}" node`);
  }
  const latex = formulaLatex(node);
  const occurrences = findQuoteOccurrences(latex, term);
  if (occurrences.length === 0) {
    reject('invalid-content', 'formula term is not present in the formula source');
  }
  if (binding.occurrence > occurrences.length) {
    reject('invalid-content', 'formula term occurrence does not exist in the formula source');
  }
  const occurrence = occurrences[binding.occurrence - 1];
  const start = selector['latexStart'];
  if (start !== undefined && start !== occurrence?.start) {
    reject('invalid-content', 'formula term latexStart does not match the selected occurrence');
  }
}

/**
 * A code selector and its atomic binding must describe the same range inside
 * the same code block. The binding only adds the anchor ID to the code node, so
 * validate quote/offsets/line hints before any content mutates.
 *
 * Repeated quotes are valid and deliberately left ambiguous by resolution; the
 * selected occurrence never auto-resolves on its own (spec §8.2).
 */
function assertCodeSelection(
  content: ContentNode,
  binding: AnchorBinding,
  selector: JsonObject,
): void {
  if (selector['kind'] !== 'code') return;
  if (binding.kind !== 'code') {
    reject('invalid-content', 'a code selector requires a code binding');
  }
  const node = getNodeAtPath(content, binding.nodePath);
  if (node === null) return;
  if (node.type !== 'codeBlock') {
    reject('invalid-content', `a code anchor cannot bind a "${node.type}" node`);
  }
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
    reject('invalid-content', 'code binding offsets are invalid for the code block');
  }
  const quote = selector['quote'];
  if (typeof quote !== 'string' || quote.length === 0) return;
  if (quote !== codePointSlice(text, startOffset, endOffset)) {
    reject('invalid-content', 'code selector.quote must match the bound code range');
  }
  const selectorStart = selector['startOffset'];
  const selectorEnd = selector['endOffset'];
  if (selectorStart !== undefined && selectorStart !== startOffset) {
    reject('invalid-content', 'code selector.startOffset must match the binding');
  }
  if (selectorEnd !== undefined && selectorEnd !== endOffset) {
    reject('invalid-content', 'code selector.endOffset must match the binding');
  }
  if (selector['form'] === 'whole' && (startOffset !== 0 || endOffset !== length)) {
    reject('invalid-content', 'a whole code selector must cover the whole code block');
  }
  const occurrences = findQuoteOccurrences(text, quote);
  const occurrence = occurrences.findIndex(
    (candidate) => candidate.start === startOffset && candidate.end === endOffset,
  );
  if (occurrence < 0) {
    reject('invalid-content', 'code selector quote is not present at the bound offsets');
  }
  const hint = selector['occurrenceHint'];
  if (hint !== undefined && hint !== occurrence + 1) {
    reject('invalid-content', 'code selector.occurrenceHint must match the bound occurrence');
  }
  const lines = codeLineRange(text, startOffset, endOffset);
  const lineStart = selector['lineStart'];
  const lineEnd = selector['lineEnd'];
  if (lineStart !== undefined && lineStart !== lines.lineStart) {
    reject('invalid-content', 'code selector.lineStart must match the bound range');
  }
  if (lineEnd !== undefined && lineEnd !== lines.lineEnd) {
    reject('invalid-content', 'code selector.lineEnd must match the bound range');
  }
}

function buildAnchorRecord(
  id: string,
  blockId: string,
  kind: AnchorKind,
  selector: JsonObject,
  mirrors: AnchorMirrorFields,
  createdAt: string,
): Anchor {
  const anchor: Anchor = {
    id,
    blockId,
    kind,
    selector: structuredClone(selector),
    createdAt,
  };
  if (mirrors.quote !== undefined) anchor.quote = mirrors.quote;
  if (mirrors.prefix !== undefined) anchor.prefix = mirrors.prefix;
  if (mirrors.suffix !== undefined) anchor.suffix = mirrors.suffix;
  if (mirrors.occurrenceHint !== undefined) anchor.occurrenceHint = mirrors.occurrenceHint;
  return anchor;
}

/**
 * Apply a binding to content and prove it is one valid contiguous binding of
 * the expected kind before any record is created.
 */
function applyAnchorBinding(
  blockId: string,
  content: ContentNode,
  anchorId: string,
  kind: AnchorKind,
  binding: AnchorBinding,
): ContentNode {
  let merged: ContentNode;
  try {
    merged = mergeAnchorBinding(content, anchorId, binding);
  } catch (error) {
    reject(
      'invalid-content',
      `anchor binding is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const index = buildBlockAnchorIndex(blockId, merged);
  const inspection = inspectAnchorBinding(index, anchorId);
  if (inspection.presence === 'none') {
    reject('invalid-content', 'anchor binding does not create a visible content binding');
  }
  if (inspection.reason !== 'none') {
    reject(
      'invalid-content',
      `anchor binding is not one valid contiguous selection (${inspection.reason})`,
    );
  }
  const kindCheck = checkAnchorBindingKind(inspection, kind);
  if (!kindCheck.ok) {
    reject('invalid-content', `anchor binding does not match kind "${kind}"`);
  }
  return merged;
}

function bindingLocationKey(content: ContentNode, anchorId: string): string | null {
  const binding = readContentAnchorBinding(content, anchorId);
  if (binding === null) return null;
  const text = binding.textRanges
    .map((range) => `${nodePathKey(range.nodePath)}:${range.start}:${range.end}`)
    .sort()
    .join('|');
  const atomic = binding.atomicNodes
    .map((node) => `${nodePathKey(node.nodePath)}:${node.nodeType}`)
    .sort()
    .join('|');
  return `text=${text};atomic=${atomic}`;
}

/**
 * Exact selection identity. Text uses the bound range; atomic anchors also
 * include the kind-specific selection fields, because one atomic node may host
 * several regions/terms/ranges. Non-selection context (prefix/suffix/label) is
 * ignored so a relabelled duplicate still counts as the same selection.
 */
function atomicSelectionKey(kind: AnchorKind, selector: JsonObject): string {
  const fields: readonly string[] =
    kind === 'formula'
      ? ['form', 'latex', 'latexStart', 'occurrenceHint']
      : kind === 'code'
        ? ['form', 'quote', 'startOffset', 'endOffset', 'occurrenceHint']
        : ['assetId', 'rect', 'crop', 'point'];
  const picked: JsonObject = {};
  for (const field of fields) {
    if (selector[field] !== undefined) picked[field] = selector[field];
  }
  return canonicalJson(picked);
}

function anchorSelectionKey(
  content: ContentNode,
  anchorId: string,
  kind: AnchorKind,
  selector: JsonObject,
): string | null {
  const location = bindingLocationKey(content, anchorId);
  if (location === null) return null;
  if (kind === 'text') return `text:${location}`;
  if (kind === 'formula' && selector['form'] === 'whole') {
    return `formula:${location}:whole`;
  }
  return `${kind}:${location}:${atomicSelectionKey(kind, selector)}`;
}

function findAnchorWithSameSelection(
  document: Document,
  content: ContentNode,
  blockId: string,
  anchorId: string,
  kind: AnchorKind,
  selector: JsonObject,
  excludeAnchorId?: string,
): Anchor | undefined {
  const key = anchorSelectionKey(content, anchorId, kind, selector);
  if (key === null) return undefined;
  for (const anchor of Object.values(document.anchors)) {
    if (anchor.id === excludeAnchorId) continue;
    if (anchor.blockId !== blockId || anchor.kind !== kind) continue;
    if (anchorSelectionKey(content, anchor.id, anchor.kind, anchor.selector) === key) {
      return anchor;
    }
  }
  return undefined;
}

interface SelectionAnchorOutcome {
  anchorId: string;
}

/**
 * Reuse an exact anchor for the selection or create one. The selector is
 * derived from the binding when omitted; an explicit selector is validated
 * before any mutation and its mirrors are folded into the record.
 */
export function ensureSelectionAnchor(
  document: Document,
  context: CoreContext,
  changes: ChangeSet,
  block: ContentBlock,
  kind: AnchorKind,
  binding: AnchorBinding,
  selectorInput: JsonObject | undefined,
  requestedAnchorId: string | undefined,
): SelectionAnchorOutcome {
  if (!isKnownAnchorKind(kind)) {
    reject('invalid-command', `unknown anchor kind "${String(kind)}"`);
  }
  const selector =
    selectorInput === undefined
      ? binding.kind === 'code'
        ? codeAnchorSelectorForBinding(block.content, binding)
        : textAnchorSelectorForBinding(block.content, binding)
      : selectorInput;
  if (selector === null) {
    reject(
      'invalid-content',
      binding.kind === 'code'
        ? 'the code selection is not one non-empty range inside one code block'
        : 'the text selection is not one contiguous range inside the block',
    );
  }
  const mirrors = anchorMirrorFields(kind, selector, {});
  assertFormulaTermSelection(block.content, binding, selector);
  assertCodeSelection(block.content, binding, selector);
  const anchorId = requestedAnchorId ?? freshId(document, context);
  assertId(anchorId, 'anchorId');
  if (allIds(document).has(anchorId)) {
    reject('duplicate-id', `ID "${anchorId}" already exists`);
  }

  const content = applyAnchorBinding(block.id, block.content, anchorId, kind, binding);
  const duplicate = findAnchorWithSameSelection(
    document,
    content,
    block.id,
    anchorId,
    kind,
    selector,
  );
  if (duplicate !== undefined) {
    changes.anchor(duplicate.id);
    changes.warn(`reused existing anchor "${duplicate.id}" for the same selection`);
    return { anchorId: duplicate.id };
  }

  const timestamp = context.now();
  block.content = content;
  block.updatedAt = timestamp;
  document.anchors[anchorId] = buildAnchorRecord(
    anchorId,
    block.id,
    kind,
    selector,
    mirrors,
    timestamp,
  );
  changes.block(block.id);
  changes.anchor(anchorId);
  changes.createdAnchor(anchorId);
  return { anchorId };
}

function outgoingAnchorBranches(document: Document, anchorId: string): Branch[] {
  const roleRank = (role: BranchRole): number => (role === 'primary' ? 0 : 1);
  return Object.values(document.branches)
    .filter((branch) => branch.source.anchorId === anchorId)
    .sort((left, right) => {
      const rank = roleRank(left.role) - roleRank(right.role);
      return rank !== 0 ? rank : compareBranches(left, right);
    });
}

/**
 * Merge adjacent text nodes that carry the same marks. Removing an anchor mark
 * from between two text nodes leaves a boundary ProseMirror would immediately
 * coalesce; normalize it here so the canonical document matches the editor
 * revision and a later content commit cannot invalidate the anchor's undo
 * snapshot.
 */
function mergeAdjacentTextChildren(node: ContentNode): void {
  const children = node.children;
  if (!Array.isArray(children)) return;
  const merged: ContentNode[] = [];
  for (const child of children) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      previous.type === 'text' &&
      child.type === 'text' &&
      previous.attrs === undefined &&
      child.attrs === undefined &&
      canonicalJson(previous.marks ?? []) === canonicalJson(child.marks ?? [])
    ) {
      previous.text = `${previous.text ?? ''}${child.text ?? ''}`;
      continue;
    }
    merged.push(child);
    mergeAdjacentTextChildren(child);
  }
  node.children = merged;
}

function removeAnchorContent(
  document: Document,
  anchor: Anchor,
  context: CoreContext,
  changes: ChangeSet,
): ContentBlock {
  const block = blockOrFail(document, anchor.blockId);
  block.content = removeAnchorBinding(block.content, anchor.id);
  mergeAdjacentTextChildren(block.content);
  block.updatedAt = context.now();
  changes.block(block.id);
  delete document.anchors[anchor.id];
  changes.anchor(anchor.id);
  return block;
}

/**
 * Remove an anchor/binding and keep every outgoing branch as a block-sourced
 * branch. Branches are appended after existing direct branches of their role
 * in their previous anchor order. Role-independent duplicate exact
 * source-target edges collapse: the primary edge wins, otherwise the existing
 * block edge wins.
 */
function attachAnchorBranchesToBlock(
  document: Document,
  anchor: Anchor,
  context: CoreContext,
  changes: ChangeSet,
): void {
  const block = blockOrFail(document, anchor.blockId);
  const outgoing = outgoingAnchorBranches(document, anchor.id);
  removeAnchorContent(document, anchor, context, changes);

  const port: BranchPort = { blockId: block.id };
  const claimed = new Map<string, Branch>();
  for (const branch of Object.values(document.branches)) {
    if (!samePort(branch.source, port)) continue;
    const current = claimed.get(branch.targetBlockId);
    if (current === undefined || (current.role !== 'primary' && branch.role === 'primary')) {
      claimed.set(branch.targetBlockId, branch);
    }
  }

  const retained: Record<BranchRole, Branch[]> = { primary: [], reference: [] };
  const deleteBranch = (branch: Branch): void => {
    if (own(document.branches, branch.id) === undefined) return;
    delete document.branches[branch.id];
    changes.branch(branch.id);
    changes.warn(
      `duplicate branch "${branch.id}" from the attached anchor was merged into the block port`,
    );
  };

  for (const branch of outgoing) {
    const existing = claimed.get(branch.targetBlockId);
    if (existing === undefined) {
      claimed.set(branch.targetBlockId, branch);
      retained[branch.role].push(branch);
      continue;
    }
    const candidates = Object.values(document.branches).filter(
      (candidate) =>
        candidate.id !== branch.id &&
        candidate.id !== existing.id &&
        samePort(candidate.source, port) &&
        candidate.targetBlockId === branch.targetBlockId,
    );
    const primary = [existing, ...candidates].find(
      (candidate) => candidate.role === 'primary',
    );
    if (primary !== undefined) {
      // Keep the primary edge; retire every reference duplicate and the
      // incoming reference. A primary incoming cannot coexist with a second
      // primary edge (validation rejects that input).
      for (const candidate of [existing, ...candidates]) {
        if (candidate.role === 'reference') deleteBranch(candidate);
      }
      deleteBranch(branch);
      claimed.set(branch.targetBlockId, primary);
      continue;
    }
    if (branch.role === 'primary') {
      // No primary yet: the incoming primary wins over existing references.
      for (const candidate of [existing, ...candidates]) deleteBranch(candidate);
      claimed.set(branch.targetBlockId, branch);
      retained.primary.push(branch);
      continue;
    }
    // Both reference: keep the existing block branch (or the first retained
    // one), retire the others and the incoming duplicate.
    for (const candidate of candidates) deleteBranch(candidate);
    deleteBranch(branch);
    claimed.set(branch.targetBlockId, existing);
  }

  for (const role of ['primary', 'reference'] as const) {
    const branches = retained[role].filter(
      (branch) => own(document.branches, branch.id) !== undefined,
    );
    if (branches.length === 0) continue;
    appendBranchesToPort(document, port, role, branches, changes);
    for (const branch of branches) changes.block(branch.targetBlockId);
  }
  changes.block(block.id);
}

/**
 * Remove an anchor with all outgoing branches. Primary targets are promoted to
 * top-level blocks after the source block's top-level ancestor, in their old
 * branch order; their subtrees are never deleted.
 */
function deleteAnchorBranches(
  document: Document,
  anchor: Anchor,
  context: CoreContext,
  changes: ChangeSet,
): void {
  const outgoing = outgoingAnchorBranches(document, anchor.id);
  const sourceRoot = topLevelAncestorId(document, anchor.blockId);
  const placement = findTopLevelPlacement(document, sourceRoot);
  if (outgoing.some((branch) => branch.role === 'primary') && placement === null) {
    reject('internal-invariant', 'anchor source block has no chapter assignment');
  }
  let inserted = 0;
  for (const branch of outgoing) {
    delete document.branches[branch.id];
    changes.branch(branch.id);
    changes.block(branch.targetBlockId);
    if (branch.role !== 'primary') continue;
    if (placement === null) continue;
    const chapter = chapterOrFail(document, placement.chapterId);
    chapter.topLevelBlockIds.splice(placement.index + 1 + inserted, 0, branch.targetBlockId);
    inserted += 1;
    changes.chapter(chapter.id);
  }
  removeAnchorContent(document, anchor, context, changes);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function applyAnchorCreate(
  document: Document,
  command: AnchorCreateCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.blockId, 'blockId');
  const block = blockOrFail(document, command.blockId);
  if (!isKnownAnchorKind(command.kind)) {
    reject('invalid-command', `unknown anchor kind "${String(command.kind)}"`);
  }
  if (command.reuseExisting !== undefined && typeof command.reuseExisting !== 'boolean') {
    reject('invalid-command', 'reuseExisting must be a boolean');
  }
  const selector = command.selector;
  const mirrors = anchorMirrorFields(command.kind, selector, {
    ...(command.quote === undefined ? {} : { quote: command.quote }),
    ...(command.prefix === undefined ? {} : { prefix: command.prefix }),
    ...(command.suffix === undefined ? {} : { suffix: command.suffix }),
    ...(command.occurrenceHint === undefined
      ? {}
      : { occurrenceHint: command.occurrenceHint }),
  });
  assertFormulaTermSelection(block.content, command.binding, selector);
  assertCodeSelection(block.content, command.binding, selector);
  const anchorId = command.anchorId ?? freshId(document, context);
  assertId(anchorId, 'anchorId');
  if (allIds(document).has(anchorId)) {
    reject('duplicate-id', `ID "${anchorId}" already exists`);
  }
  const content = applyAnchorBinding(
    block.id,
    block.content,
    anchorId,
    command.kind,
    command.binding,
  );
  const duplicate = findAnchorWithSameSelection(
    document,
    content,
    block.id,
    anchorId,
    command.kind,
    selector,
  );
  if (duplicate !== undefined) {
    if (command.reuseExisting === true) {
      changes.anchor(duplicate.id);
      changes.warn(`reused existing anchor "${duplicate.id}" for the same selection`);
      return null;
    }
    reject(
      'anchor-exists',
      `the selection is already bound to anchor "${duplicate.id}"; reuse it explicitly`,
    );
  }
  const timestamp = context.now();
  block.content = content;
  block.updatedAt = timestamp;
  const anchor = buildAnchorRecord(
    anchorId,
    block.id,
    command.kind,
    selector,
    mirrors,
    timestamp,
  );
  document.anchors[anchorId] = anchor;
  changes.block(block.id);
  changes.anchor(anchorId);
  changes.createdAnchor(anchorId);
  // The binding splits text nodes; only the pre-command block record can
  // restore the exact text-node shape, so the inverse is a snapshot.
  return null;
}

export function applyAnchorRepair(
  document: Document,
  command: AnchorRepairCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.anchorId, 'anchorId');
  const anchor = anchorOrFail(document, command.anchorId);
  const block = blockOrFail(document, anchor.blockId);
  if (!isKnownAnchorKind(anchor.kind)) {
    reject('invalid-content', `anchor "${anchor.id}" has an unknown kind`);
  }
  const selector = command.selector;
  const mirrors = anchorMirrorFields(anchor.kind, selector, {
    ...(command.quote === undefined ? {} : { quote: command.quote }),
    ...(command.prefix === undefined ? {} : { prefix: command.prefix }),
    ...(command.suffix === undefined ? {} : { suffix: command.suffix }),
    ...(command.occurrenceHint === undefined
      ? {}
      : { occurrenceHint: command.occurrenceHint }),
  });
  assertCodeSelection(block.content, command.binding, selector);
  const cleared = removeAnchorBinding(block.content, anchor.id);
  const content = applyAnchorBinding(
    block.id,
    cleared,
    anchor.id,
    anchor.kind,
    command.binding,
  );
  const duplicate = findAnchorWithSameSelection(
    document,
    content,
    block.id,
    anchor.id,
    anchor.kind,
    selector,
    anchor.id,
  );
  if (duplicate !== undefined) {
    reject('anchor-exists', `the selection is already bound to anchor "${duplicate.id}"`);
  }
  anchor.selector = structuredClone(selector);
  for (const key of ['quote', 'prefix', 'suffix', 'occurrenceHint'] as const) {
    delete anchor[key];
  }
  if (mirrors.quote !== undefined) anchor.quote = mirrors.quote;
  if (mirrors.prefix !== undefined) anchor.prefix = mirrors.prefix;
  if (mirrors.suffix !== undefined) anchor.suffix = mirrors.suffix;
  if (mirrors.occurrenceHint !== undefined) anchor.occurrenceHint = mirrors.occurrenceHint;
  block.content = content;
  block.updatedAt = context.now();
  changes.block(block.id);
  changes.anchor(anchor.id);
  return null;
}

export function applyAnchorAttachToBlock(
  document: Document,
  command: AnchorAttachToBlockCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.anchorId, 'anchorId');
  const anchor = anchorOrFail(document, command.anchorId);
  attachAnchorBranchesToBlock(document, anchor, context, changes);
  return null;
}

export function applyAnchorDelete(
  document: Document,
  command: AnchorDeleteCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.anchorId, 'anchorId');
  const anchor = anchorOrFail(document, command.anchorId);
  if (
    command.branches !== undefined &&
    command.branches !== 'attach' &&
    command.branches !== 'delete'
  ) {
    reject('invalid-command', 'branches must be "attach" or "delete"');
  }
  const hasOutgoing = Object.values(document.branches).some(
    (branch) => branch.source.anchorId === anchor.id,
  );
  if (hasOutgoing && command.branches === undefined) {
    reject(
      'invalid-command',
      'anchor.delete requires branches: "attach" or "delete" when the anchor has outgoing branches',
    );
  }
  if (command.branches === 'attach') {
    attachAnchorBranchesToBlock(document, anchor, context, changes);
  } else {
    deleteAnchorBranches(document, anchor, context, changes);
  }
  return null;
}
