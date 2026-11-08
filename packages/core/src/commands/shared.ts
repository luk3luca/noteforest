/**
 * Shared command infrastructure: result types, validation helpers, lookups,
 * change reporting, branch ports, and structural record helpers.
 *
 * Aggregate modules import from here; nothing in this module knows about a
 * specific command type beyond the generic `DocumentCommand` inverse return.
 */

import type { ValidationIssue } from '../errors.js';
import {
  isValidOrderKey,
  orderBetween,
  orderKeysAfter,
  orderKeysBetween,
} from '../fractional-order.js';
import type { CoreContext } from '../ids.js';
import { compareBranches, directChildBranches, subtreeBlockIds } from '../structure.js';
import type {
  Anchor,
  Branch,
  BranchRole,
  BranchSource,
  Chapter,
  ContentBlock,
  ContentNode,
  Document,
} from '../types.js';
import type { AffectedIds, CommandErrorCode, CreatedIds } from './types.js';

const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

export class Rejection extends Error {
  readonly code: CommandErrorCode;
  readonly issues?: ValidationIssue[];

  constructor(code: CommandErrorCode, message: string, issues?: ValidationIssue[]) {
    super(message);
    this.name = 'Rejection';
    this.code = code;
    if (issues !== undefined) this.issues = issues;
  }
}

export function reject(code: CommandErrorCode, message: string, issues?: ValidationIssue[]): never {
  throw new Rejection(code, message, issues);
}

export function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export function assertId(value: unknown, what: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    reject('invalid-command', `${what} must be a non-empty string`);
  }
  if (RESERVED_IDS.has(value)) {
    reject('invalid-command', `${what} is a reserved identifier`);
  }
}

export function assertIndex(value: unknown, maximum: number, what: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maximum) {
    reject('invalid-placement', `${what} must be an integer between 0 and ${maximum}`);
  }
}

export function assertContent(value: unknown): asserts value is ContentNode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-content', 'content must be a content node object');
  }
  if (typeof (value as { type?: unknown }).type !== 'string') {
    reject('invalid-content', 'content.type must be a string');
  }
  try {
    JSON.stringify(value);
  } catch {
    reject('invalid-content', 'content must be JSON-serializable');
  }
}

export function chapterOrFail(document: Document, chapterId: string): Chapter {
  const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
  if (chapter === undefined) reject('not-found', `chapter "${chapterId}" does not exist`);
  return chapter;
}

/**
 * Human name for a chapter in a typed rejection. The title is preferred; a
 * legacy untitled chapter is named by ID so the message always identifies the
 * chapter the user must repair.
 */
function chapterDisplayName(chapter: Chapter): string {
  const title = chapter.title?.trim();
  return title !== undefined && title.length > 0 ? `"${title}"` : `"${chapter.id}"`;
}

/**
 * F6 invariant: a chapter always keeps at least one top-level block. Moving,
 * branching, or deleting the last one is rejected unless the same command also
 * handles the chapter (for example `chapter.delete`). Legacy empty chapters
 * remain valid on disk and render; this guard only stops new ones being
 * stranded by an operation.
 */
export function rejectEmptyChapter(
  chapter: Chapter,
  action: 'move' | 'branch' | 'delete',
): never {
  const name = chapterDisplayName(chapter);
  const verb =
    action === 'move'
      ? 'move the last top-level block out of'
      : action === 'branch'
        ? 'branch the last top-level block out of'
        : 'delete the last top-level block of';
  reject(
    'chapter-would-be-empty',
    `Cannot ${verb} chapter ${name}. Add another top-level block or delete the chapter instead.`,
  );
}

export function blockOrFail(document: Document, blockId: string): ContentBlock {
  const block = own(document.blocks, blockId);
  if (block === undefined) reject('not-found', `block "${blockId}" does not exist`);
  return block;
}

export function branchOrFail(document: Document, branchId: string): Branch {
  const branch = own(document.branches, branchId);
  if (branch === undefined) reject('not-found', `branch "${branchId}" does not exist`);
  return branch;
}

export function anchorOrFail(document: Document, anchorId: string): Anchor {
  const anchor = own(document.anchors, anchorId);
  if (anchor === undefined) reject('not-found', `anchor "${anchorId}" does not exist`);
  return anchor;
}

export function allIds(document: Document): Set<string> {
  const ids = new Set<string>([document.id]);
  for (const chapter of document.chapters) ids.add(chapter.id);
  for (const id of Object.keys(document.blocks)) ids.add(id);
  for (const id of Object.keys(document.anchors)) ids.add(id);
  for (const id of Object.keys(document.branches)) ids.add(id);
  for (const id of Object.keys(document.assets)) ids.add(id);
  return ids;
}

export function freshId(document: Document, context: CoreContext): string {
  const existing = allIds(document);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const id = context.newId();
    assertId(id, 'generated ID');
    if (!existing.has(id)) return id;
  }
  reject('duplicate-id', 'could not generate a unique ID');
}

export class ChangeSet {
  private readonly documentIds = new Set<string>();
  private readonly chapterIds = new Set<string>();
  private readonly blockIds = new Set<string>();
  private readonly branchIds = new Set<string>();
  private readonly anchorIds = new Set<string>();
  private readonly assetIds = new Set<string>();
  private readonly createdDocumentIds = new Set<string>();
  private readonly createdChapterIds = new Set<string>();
  private readonly createdBlockIds = new Set<string>();
  private readonly createdBranchIds = new Set<string>();
  private readonly createdAnchorIds = new Set<string>();
  private readonly warningMessages: string[] = [];

  document(id: string): void {
    this.documentIds.add(id);
  }
  chapter(id: string): void {
    this.chapterIds.add(id);
  }
  block(id: string): void {
    this.blockIds.add(id);
  }
  branch(id: string): void {
    this.branchIds.add(id);
  }
  anchor(id: string): void {
    this.anchorIds.add(id);
  }
  asset(id: string): void {
    this.assetIds.add(id);
  }
  createdDocument(id: string): void {
    this.createdDocumentIds.add(id);
  }
  createdChapter(id: string): void {
    this.createdChapterIds.add(id);
  }
  createdBlock(id: string): void {
    this.createdBlockIds.add(id);
  }
  createdBranch(id: string): void {
    this.createdBranchIds.add(id);
  }
  createdAnchor(id: string): void {
    this.createdAnchorIds.add(id);
  }
  warn(message: string): void {
    if (!this.warningMessages.includes(message)) this.warningMessages.push(message);
  }
  warnings(): string[] {
    return [...this.warningMessages];
  }

  toJSON(): AffectedIds {
    return {
      documentIds: [...this.documentIds].sort(),
      chapterIds: [...this.chapterIds].sort(),
      blockIds: [...this.blockIds].sort(),
      branchIds: [...this.branchIds].sort(),
      anchorIds: [...this.anchorIds].sort(),
      assetIds: [...this.assetIds].sort(),
    };
  }

  createdJSON(): CreatedIds {
    return {
      documentIds: [...this.createdDocumentIds].sort(),
      chapterIds: [...this.createdChapterIds].sort(),
      blockIds: [...this.createdBlockIds].sort(),
      branchIds: [...this.createdBranchIds].sort(),
      anchorIds: [...this.createdAnchorIds].sort(),
    };
  }
}

export function primaryDirectChildren(document: Document, parentBlockId: string): Branch[] {
  return directChildBranches(document, parentBlockId);
}

/** Order key for insertion at `index` among a parent's direct primary children. */
function orderKeyForIndex(
  document: Document,
  parentBlockId: string,
  index: number,
  changes: ChangeSet,
): string {
  let children = primaryDirectChildren(document, parentBlockId);
  assertIndex(index, children.length, 'child index');
  const previous = index > 0 ? children[index - 1]?.order : undefined;
  const next = index < children.length ? children[index]?.order : undefined;
  const intervalValid =
    (previous === undefined || isValidOrderKey(previous)) &&
    (next === undefined || isValidOrderKey(next)) &&
    (previous === undefined || next === undefined || previous < next);
  if (!intervalValid) {
    renormalizeChildOrders(document, parentBlockId, changes);
    children = primaryDirectChildren(document, parentBlockId);
  }
  const low = index > 0 ? children[index - 1]?.order ?? null : null;
  const high = index < children.length ? children[index]?.order ?? null : null;
  try {
    return orderBetween(low, high);
  } catch {
    renormalizeChildOrders(document, parentBlockId, changes);
    const refreshed = primaryDirectChildren(document, parentBlockId);
    const refreshedLow = index > 0 ? refreshed[index - 1]?.order ?? null : null;
    const refreshedHigh = index < refreshed.length ? refreshed[index]?.order ?? null : null;
    return orderBetween(refreshedLow, refreshedHigh);
  }
}

function renormalizeChildOrders(
  document: Document,
  parentBlockId: string,
  changes: ChangeSet,
): void {
  const children = primaryDirectChildren(document, parentBlockId);
  let previous: string | null = null;
  for (const branch of children) {
    const key = orderBetween(previous, null);
    branch.order = key;
    previous = key;
    changes.branch(branch.id);
  }
}

// ---------------------------------------------------------------------------
// Branch ports (block or anchor) and role-specific order lists
// ---------------------------------------------------------------------------

export interface BranchPort {
  blockId: string;
  anchorId?: string;
}

export function portOf(source: BranchSource): BranchPort {
  return source.anchorId === undefined
    ? { blockId: source.blockId }
    : { blockId: source.blockId, anchorId: source.anchorId };
}

export function samePort(left: BranchSource, right: BranchPort): boolean {
  return left.blockId === right.blockId && left.anchorId === right.anchorId;
}

export function portBranches(document: Document, port: BranchPort, role: BranchRole): Branch[] {
  return Object.values(document.branches)
    .filter((branch) => branch.role === role && samePort(branch.source, port))
    .sort(compareBranches);
}

export function portOrdersAreSane(branches: readonly Branch[]): boolean {
  let previous: string | null = null;
  for (const branch of branches) {
    if (!isValidOrderKey(branch.order)) return false;
    if (previous !== null && !(previous < branch.order)) return false;
    previous = branch.order;
  }
  return true;
}

function renormalizePortOrders(
  document: Document,
  port: BranchPort,
  role: BranchRole,
  changes: ChangeSet,
): void {
  const branches = portBranches(document, port, role);
  let previous: string | null = null;
  for (const branch of branches) {
    const key = orderBetween(previous, null);
    branch.order = key;
    previous = key;
    changes.branch(branch.id);
  }
}

export function orderKeyForPortIndex(
  document: Document,
  port: BranchPort,
  role: BranchRole,
  index: number,
  changes: ChangeSet,
): string {
  let branches = portBranches(document, port, role);
  assertIndex(index, branches.length, 'branch index');
  if (!portOrdersAreSane(branches)) {
    renormalizePortOrders(document, port, role, changes);
    branches = portBranches(document, port, role);
  }
  const low = index > 0 ? branches[index - 1]?.order ?? null : null;
  const high = index < branches.length ? branches[index]?.order ?? null : null;
  return orderBetween(low, high);
}

export function orderKeysForPortIndex(
  document: Document,
  port: BranchPort,
  role: BranchRole,
  index: number,
  count: number,
  changes: ChangeSet,
): string[] {
  if (count === 0) return [];
  let branches = portBranches(document, port, role);
  assertIndex(index, branches.length, 'branch index');
  if (!portOrdersAreSane(branches)) {
    renormalizePortOrders(document, port, role, changes);
    branches = portBranches(document, port, role);
  }
  const low = index > 0 ? branches[index - 1]?.order ?? null : null;
  const high = index < branches.length ? branches[index]?.order ?? null : null;
  return orderKeysBetween(low, high, count);
}

export function orderKeyForPortIndexInList(
  document: Document,
  port: BranchPort,
  role: BranchRole,
  siblings: readonly Branch[],
  index: number,
  changes: ChangeSet,
): string {
  assertIndex(index, siblings.length, 'branch index');
  const low = index > 0 ? siblings[index - 1]?.order ?? null : null;
  const high = index < siblings.length ? siblings[index]?.order ?? null : null;
  if (
    (low === null || isValidOrderKey(low)) &&
    (high === null || isValidOrderKey(high)) &&
    (low === null || high === null || low < high)
  ) {
    return orderBetween(low, high);
  }
  renormalizePortOrders(document, port, role, changes);
  const refreshed = portBranches(document, port, role).filter((branch) =>
    siblings.some((sibling) => sibling.id === branch.id),
  );
  const refreshedLow = index > 0 ? refreshed[index - 1]?.order ?? null : null;
  const refreshedHigh = index < refreshed.length ? refreshed[index]?.order ?? null : null;
  return orderBetween(refreshedLow, refreshedHigh);
}

/** Append branches at the end of a (port, role) list, preserving their order. */
export function appendBranchesToPort(
  document: Document,
  port: BranchPort,
  role: BranchRole,
  branches: readonly Branch[],
  changes: ChangeSet,
): void {
  if (branches.length === 0) return;
  let existing = portBranches(document, port, role);
  if (!portOrdersAreSane(existing)) {
    renormalizePortOrders(document, port, role, changes);
    existing = portBranches(document, port, role);
  }
  const last = existing.length > 0 ? existing[existing.length - 1]?.order ?? null : null;
  const keys = orderKeysAfter(last, branches.length);
  for (const [index, branch] of branches.entries()) {
    const order = keys[index];
    if (order === undefined) reject('internal-invariant', 'could not generate branch order');
    branch.source = port.anchorId === undefined
      ? { blockId: port.blockId }
      : { blockId: port.blockId, anchorId: port.anchorId };
    branch.order = order;
    document.branches[branch.id] = branch;
    changes.branch(branch.id);
  }
}

/**
 * Order key that appends one branch to the end of a `(port, role)` list. The
 * branch being re-roled is not yet in that list, so callers must compute the
 * key before changing its role.
 */
export function appendOrderKeyAtPort(
  document: Document,
  port: BranchPort,
  role: BranchRole,
  changes: ChangeSet,
): string {
  let existing = portBranches(document, port, role);
  if (!portOrdersAreSane(existing)) {
    renormalizePortOrders(document, port, role, changes);
    existing = portBranches(document, port, role);
  }
  const last = existing.length > 0 ? existing[existing.length - 1]?.order ?? null : null;
  const key = orderKeysAfter(last, 1)[0];
  if (key === undefined) reject('internal-invariant', 'could not generate branch order');
  return key;
}

/**
 * Role-independent exact edge duplicate (OD-3/A8). The transitions must not
 * create a second record for the same source port and target; a legacy
 * document may still carry such a pair because A8 is a load warning.
 */
function duplicatePairBranch(
  document: Document,
  branch: Branch,
  ignore: ReadonlySet<string>,
): Branch | undefined {
  return Object.values(document.branches).find(
    (candidate) =>
      candidate.id !== branch.id &&
      !ignore.has(candidate.id) &&
      candidate.targetBlockId === branch.targetBlockId &&
      samePort(candidate.source, portOf(branch.source)),
  );
}

export function sameExactPair(left: Branch, right: Branch): boolean {
  return (
    left.targetBlockId === right.targetBlockId &&
    samePort(left.source, portOf(right.source))
  );
}

export function assertPairIsUnique(
  document: Document,
  branch: Branch,
  ignore: ReadonlySet<string>,
): void {
  const duplicate = duplicatePairBranch(document, branch, ignore);
  if (duplicate !== undefined) {
    reject(
      'invalid-placement',
      `an edge from this source to the target already exists (branch "${duplicate.id}"); changing roles would keep a duplicate edge`,
    );
  }
}

/**
 * Guard shared by both promotions: the new primary source must not sit inside
 * the target's primary subtree, or the primary graph would contain a cycle.
 */
function assertPromotionAcyclic(document: Document, branch: Branch): void {
  if (subtreeBlockIds(document, branch.targetBlockId).includes(branch.source.blockId)) {
    reject(
      'cycle',
      'promoting this reference would create a primary cycle: the source is inside the target’s primary subtree',
    );
  }
}

/**
 * Preconditions for makeHome/moveHere. The caller must already know the
 * target's old primary edge, if any. Nothing is mutated here.
 */
export function assertPromotableReference(
  document: Document,
  branch: Branch,
  oldPrimary: Branch | undefined,
): void {
  if (branch.role !== 'reference') {
    reject('invalid-command', 'only a reference branch can be promoted to primary');
  }
  blockOrFail(document, branch.targetBlockId);
  assertPromotionAcyclic(document, branch);
  const ignore = new Set<string>([branch.id]);
  if (oldPrimary !== undefined) ignore.add(oldPrimary.id);
  assertPairIsUnique(document, branch, ignore);
}

function createBranchRecord(
  document: Document,
  context: CoreContext,
  changes: ChangeSet,
  sourceBlockId: string,
  targetBlockId: string,
  order: string,
  branchId?: string,
): Branch {
  return createPortBranchRecord(
    document,
    context,
    changes,
    { blockId: sourceBlockId },
    targetBlockId,
    'primary',
    order,
    branchId,
  );
}

export function createPortBranchRecord(
  document: Document,
  context: CoreContext,
  changes: ChangeSet,
  port: BranchPort,
  targetBlockId: string,
  role: BranchRole,
  order: string,
  branchId?: string,
  markCreated = true,
): Branch {
  const id = branchId ?? freshId(document, context);
  assertId(id, 'branch ID');
  if (own(document.branches, id) !== undefined) {
    reject('duplicate-id', `branch "${id}" already exists`);
  }
  const branch: Branch = {
    id,
    source: port.anchorId === undefined
      ? { blockId: port.blockId }
      : { blockId: port.blockId, anchorId: port.anchorId },
    targetBlockId,
    role,
    order,
  };
  document.branches[id] = branch;
  changes.branch(id);
  if (markCreated) changes.createdBranch(id);
  return branch;
}

export function attachAsChild(
  document: Document,
  context: CoreContext,
  changes: ChangeSet,
  sourceBlockId: string,
  targetBlockId: string,
  index: number,
  existingBranch?: Branch,
): Branch {
  const order = orderKeyForIndex(document, sourceBlockId, index, changes);
  if (existingBranch !== undefined) {
    existingBranch.source = { blockId: sourceBlockId };
    existingBranch.order = order;
    document.branches[existingBranch.id] = existingBranch;
    changes.branch(existingBranch.id);
    return existingBranch;
  }
  return createBranchRecord(document, context, changes, sourceBlockId, targetBlockId, order);
}

export function collectSubtree(document: Document, rootBlockId: string): Set<string> {
  return new Set(subtreeBlockIds(document, rootBlockId));
}

export function removeBlocks(
  document: Document,
  blockIds: ReadonlySet<string>,
  changes: ChangeSet,
): void {
  const removedAnchors = new Set<string>();
  for (const [anchorId, anchor] of Object.entries(document.anchors)) {
    if (blockIds.has(anchor.blockId)) {
      removedAnchors.add(anchorId);
      changes.anchor(anchorId);
    }
  }

  for (const [branchId, branch] of Object.entries(document.branches)) {
    const touchesRemovedBlock =
      blockIds.has(branch.source.blockId) || blockIds.has(branch.targetBlockId);
    const sourcedFromRemovedAnchor =
      branch.source.anchorId !== undefined && removedAnchors.has(branch.source.anchorId);
    if (touchesRemovedBlock || sourcedFromRemovedAnchor) {
      delete document.branches[branchId];
      changes.branch(branchId);
    }
  }

  for (const anchorId of removedAnchors) {
    delete document.anchors[anchorId];
  }

  for (const blockId of blockIds) {
    delete document.blocks[blockId];
    changes.block(blockId);
    for (let chapterIndex = 0; chapterIndex < document.chapters.length; chapterIndex += 1) {
      const chapter = document.chapters[chapterIndex];
      if (chapter === undefined) continue;
      if (chapter.topLevelBlockIds.includes(blockId)) {
        chapter.topLevelBlockIds = chapter.topLevelBlockIds.filter((id) => id !== blockId);
        changes.chapter(chapter.id);
      }
    }
  }
}

/** Canonical JSON with sorted keys, used for record comparison. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
