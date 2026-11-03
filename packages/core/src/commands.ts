/**
 * Typed document commands: the only mutation path.
 *
 * Every command is pure (the input document is not mutated), validates its
 * preconditions, applies to a deep clone, re-validates the resulting document,
 * and returns a typed success or failure. A success carries the new document,
 * the new revision, affected IDs, and (where practical) an inverse command.
 *
 * Structural edits use canonical primary branches (role "primary"), not a
 * second parent pointer. Reference and anchor branches are preserved but have
 * no commands in M2.
 */

import type { ValidationIssue } from './errors.js';
import { createDocument } from './document.js';
import type { CreateDocumentInput } from './document.js';
import { orderBetween, orderKeysBetween, isValidOrderKey } from './fractional-order.js';
import { createContext } from './ids.js';
import type { CoreContext } from './ids.js';
import {
  chapterIdForBlock,
  compareBranches,
  directChildBranches,
  findTopLevelPlacement,
  isDescendantOf,
  subtreeBlockIds,
  topLevelAncestorId,
} from './structure.js';
import type {
  BlockBorder,
  Branch,
  Chapter,
  ContentBlock,
  ContentNode,
  Document,
  JsonObject,
  MarginsMm,
  PageOrientation,
} from './types.js';
import { validateDocument } from './validation.js';

export type CommandErrorCode =
  | 'invalid-command'
  | 'invalid-document'
  | 'not-found'
  | 'duplicate-id'
  | 'invalid-placement'
  | 'cycle'
  | 'last-chapter'
  | 'chapter-in-use'
  | 'invalid-content'
  | 'read-only'
  | 'internal-invariant';

export interface AffectedIds {
  documentIds: string[];
  chapterIds: string[];
  blockIds: string[];
  branchIds: string[];
  anchorIds: string[];
  assetIds: string[];
}

export interface CommandSuccess {
  ok: true;
  document: Document;
  revision: number;
  affected: AffectedIds;
  inverse: DocumentCommand | null;
  warnings: string[];
}

export interface CommandFailure {
  ok: false;
  code: CommandErrorCode;
  message: string;
  issues?: ValidationIssue[];
}

export type CommandResult = CommandSuccess | CommandFailure;

// ---------------------------------------------------------------------------
// Command shapes
// ---------------------------------------------------------------------------

export interface DocumentCreateCommand {
  type: 'document.create';
  title?: string;
  id?: string;
  chapterId?: string;
  chapterTitle?: string;
  pageSetup?: {
    orientation?: PageOrientation;
    margins?: Partial<MarginsMm>;
  };
  annotations?: unknown[];
  extensions?: JsonObject;
}

export interface DocumentRenameCommand {
  type: 'document.rename';
  title: string;
}

export interface ChapterCreateCommand {
  type: 'chapter.create';
  chapterId?: string;
  title?: string;
  atIndex?: number;
}

export interface ChapterRenameCommand {
  type: 'chapter.rename';
  chapterId: string;
  title: string | null;
}

export interface ChapterReorderCommand {
  type: 'chapter.reorder';
  chapterId: string;
  toIndex: number;
}

export type ChapterBlockHandling =
  | { kind: 'reject-if-not-empty' }
  | { kind: 'move-to-chapter'; chapterId: string }
  | { kind: 'delete-blocks' };

export interface ChapterDeleteCommand {
  type: 'chapter.delete';
  chapterId: string;
  blockHandling: ChapterBlockHandling;
}

export type BlockPlacement =
  | { kind: 'top-level'; chapterId: string; atIndex?: number }
  | { kind: 'child'; parentBlockId: string; atIndex?: number }
  | { kind: 'sibling'; siblingBlockId: string; after?: boolean };

export interface BlockCreateCommand {
  type: 'block.create';
  blockId?: string;
  content?: ContentNode;
  label?: string;
  border?: BlockBorder;
  placement: BlockPlacement;
}

export interface BlockEditContentCommand {
  type: 'block.editContent';
  blockId: string;
  content: ContentNode;
}

export interface BlockRenameCommand {
  type: 'block.rename';
  blockId: string;
  label: string | null;
}

export interface BlockDeleteCommand {
  type: 'block.delete';
  blockId: string;
  children: 'promote' | 'delete-subtree';
}

export interface BlockMoveCommand {
  type: 'block.move';
  blockId: string;
  to: BlockPlacement;
}

export interface BranchCreateCommand {
  type: 'branch.create';
  branchId?: string;
  sourceBlockId: string;
  targetBlockId: string;
  atIndex?: number;
}

export type BranchTargetHandling = { kind: 'promote' } | { kind: 'delete-subtree' };

export interface BranchDeleteCommand {
  type: 'branch.delete';
  branchId: string;
  targetHandling: BranchTargetHandling;
}

export interface BranchReorderCommand {
  type: 'branch.reorder';
  branchId: string;
  toIndex: number;
}

export interface BranchRelabelCommand {
  type: 'branch.relabel';
  branchId: string;
  label: string | null;
}

export type DocumentCommand =
  | DocumentCreateCommand
  | DocumentRenameCommand
  | ChapterCreateCommand
  | ChapterRenameCommand
  | ChapterReorderCommand
  | ChapterDeleteCommand
  | BlockCreateCommand
  | BlockEditContentCommand
  | BlockRenameCommand
  | BlockDeleteCommand
  | BlockMoveCommand
  | BranchCreateCommand
  | BranchDeleteCommand
  | BranchReorderCommand
  | BranchRelabelCommand;

export interface ExecuteCommandOptions {
  context?: Partial<CoreContext>;
  /** Skip the initial full validation (only for trusted, just-validated docs). */
  skipInputValidation?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

class Rejection extends Error {
  readonly code: CommandErrorCode;
  readonly issues?: ValidationIssue[];

  constructor(code: CommandErrorCode, message: string, issues?: ValidationIssue[]) {
    super(message);
    this.name = 'Rejection';
    this.code = code;
    if (issues !== undefined) this.issues = issues;
  }
}

function reject(code: CommandErrorCode, message: string, issues?: ValidationIssue[]): never {
  throw new Rejection(code, message, issues);
}

function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

function assertId(value: unknown, what: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
    reject('invalid-command', `${what} must be a non-empty string`);
  }
  if (RESERVED_IDS.has(value)) {
    reject('invalid-command', `${what} is a reserved identifier`);
  }
}

function assertIndex(value: unknown, maximum: number, what: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > maximum) {
    reject('invalid-placement', `${what} must be an integer between 0 and ${maximum}`);
  }
}

function assertContent(value: unknown): asserts value is ContentNode {
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

function chapterOrFail(document: Document, chapterId: string): Chapter {
  const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
  if (chapter === undefined) reject('not-found', `chapter "${chapterId}" does not exist`);
  return chapter;
}

function blockOrFail(document: Document, blockId: string): ContentBlock {
  const block = own(document.blocks, blockId);
  if (block === undefined) reject('not-found', `block "${blockId}" does not exist`);
  return block;
}

function branchOrFail(document: Document, branchId: string): Branch {
  const branch = own(document.branches, branchId);
  if (branch === undefined) reject('not-found', `branch "${branchId}" does not exist`);
  return branch;
}

function allIds(document: Document): Set<string> {
  const ids = new Set<string>([document.id]);
  for (const chapter of document.chapters) ids.add(chapter.id);
  for (const id of Object.keys(document.blocks)) ids.add(id);
  for (const id of Object.keys(document.anchors)) ids.add(id);
  for (const id of Object.keys(document.branches)) ids.add(id);
  for (const id of Object.keys(document.assets)) ids.add(id);
  return ids;
}

function freshId(document: Document, context: CoreContext): string {
  const existing = allIds(document);
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const id = context.newId();
    assertId(id, 'generated ID');
    if (!existing.has(id)) return id;
  }
  reject('duplicate-id', 'could not generate a unique ID');
}

class ChangeSet {
  private readonly documentIds = new Set<string>();
  private readonly chapterIds = new Set<string>();
  private readonly blockIds = new Set<string>();
  private readonly branchIds = new Set<string>();
  private readonly anchorIds = new Set<string>();
  private readonly assetIds = new Set<string>();

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
}

function primaryDirectChildren(document: Document, parentBlockId: string): Branch[] {
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

function orderKeysForIndex(
  document: Document,
  parentBlockId: string,
  index: number,
  count: number,
  changes: ChangeSet,
): string[] {
  if (count === 0) return [];
  const children = primaryDirectChildren(document, parentBlockId);
  assertIndex(index, children.length, 'child index');
  const low = index > 0 ? children[index - 1]?.order ?? null : null;
  const high = index < children.length ? children[index]?.order ?? null : null;
  try {
    if (
      (low === null || isValidOrderKey(low)) &&
      (high === null || isValidOrderKey(high)) &&
      (low === null || high === null || low < high)
    ) {
      return orderKeysBetween(low, high, count);
    }
  } catch {
    // fall through to renormalization
  }
  renormalizeChildOrders(document, parentBlockId, changes);
  const refreshed = primaryDirectChildren(document, parentBlockId);
  const refreshedLow = index > 0 ? refreshed[index - 1]?.order ?? null : null;
  const refreshedHigh = index < refreshed.length ? refreshed[index]?.order ?? null : null;
  return orderKeysBetween(refreshedLow, refreshedHigh, count);
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

function createBranchRecord(
  document: Document,
  context: CoreContext,
  changes: ChangeSet,
  sourceBlockId: string,
  targetBlockId: string,
  order: string,
  branchId?: string,
): Branch {
  const id = branchId ?? freshId(document, context);
  assertId(id, 'branch ID');
  if (own(document.branches, id) !== undefined) {
    reject('duplicate-id', `branch "${id}" already exists`);
  }
  const branch: Branch = {
    id,
    source: { blockId: sourceBlockId },
    targetBlockId,
    role: 'primary',
    order,
  };
  document.branches[id] = branch;
  changes.branch(id);
  return branch;
}

function attachAsChild(
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

interface ResolvedPlacement {
  kind: 'top-level';
  chapterId: string;
  index: number;
}

interface ResolvedChildPlacement {
  kind: 'child';
  parentBlockId: string;
  index: number;
}

type Placement = ResolvedPlacement | ResolvedChildPlacement;

function resolvePlacement(document: Document, placement: BlockPlacement): Placement {
  if (placement.kind === 'top-level') {
    assertId(placement.chapterId, 'chapterId');
    const chapter = chapterOrFail(document, placement.chapterId);
    const index = placement.atIndex ?? chapter.topLevelBlockIds.length;
    assertIndex(index, chapter.topLevelBlockIds.length, 'top-level index');
    return { kind: 'top-level', chapterId: chapter.id, index };
  }
  if (placement.kind === 'child') {
    assertId(placement.parentBlockId, 'parentBlockId');
    blockOrFail(document, placement.parentBlockId);
    const children = primaryDirectChildren(document, placement.parentBlockId);
    const index = placement.atIndex ?? children.length;
    assertIndex(index, children.length, 'child index');
    return { kind: 'child', parentBlockId: placement.parentBlockId, index };
  }
  assertId(placement.siblingBlockId, 'siblingBlockId');
  blockOrFail(document, placement.siblingBlockId);
  const after = placement.after !== false;
  const topLevel = findTopLevelPlacement(document, placement.siblingBlockId);
  if (topLevel !== null) {
    const chapter = chapterOrFail(document, topLevel.chapterId);
    return {
      kind: 'top-level',
      chapterId: chapter.id,
      index: topLevel.index + (after ? 1 : 0),
    };
  }
  const parentBranch = Object.values(document.branches).find(
    (branch) => branch.role === 'primary' && branch.targetBlockId === placement.siblingBlockId,
  );
  if (parentBranch === undefined) {
    reject('not-found', `block "${placement.siblingBlockId}" has no primary parent`);
  }
  if (parentBranch.source.anchorId !== undefined) {
    reject('invalid-placement', 'cannot create a sibling under an anchored branch in M2');
  }
  const siblings = primaryDirectChildren(document, parentBranch.source.blockId);
  const siblingIndex = siblings.findIndex(
    (branch) => branch.targetBlockId === placement.siblingBlockId,
  );
  if (siblingIndex < 0) {
    reject('invalid-placement', 'sibling is not a direct primary child of its parent');
  }
  return {
    kind: 'child',
    parentBlockId: parentBranch.source.blockId,
    index: siblingIndex + (after ? 1 : 0),
  };
}

function allPrimaryChildren(document: Document, parentBlockId: string): Branch[] {
  return Object.values(document.branches)
    .filter(
      (branch) => branch.role === 'primary' && branch.source.blockId === parentBlockId,
    )
    .sort(compareBranches);
}

function collectSubtree(document: Document, rootBlockId: string): Set<string> {
  const result = new Set<string>();
  const stack = [rootBlockId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || result.has(current)) continue;
    result.add(current);
    for (const branch of allPrimaryChildren(document, current)) {
      stack.push(branch.targetBlockId);
    }
  }
  return result;
}

function removeBlocks(
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

  if (document.manualBreakBeforeBlockIds.some((id) => blockIds.has(id))) {
    document.manualBreakBeforeBlockIds = document.manualBreakBeforeBlockIds.filter(
      (id) => !blockIds.has(id),
    );
  }
}

function detachBlock(
  document: Document,
  blockId: string,
  changes: ChangeSet,
): { placement: Placement; incomingBranch: Branch | null } {
  const topLevel = findTopLevelPlacement(document, blockId);
  if (topLevel !== null) {
    const chapter = chapterOrFail(document, topLevel.chapterId);
    chapter.topLevelBlockIds.splice(topLevel.index, 1);
    return {
      placement: { kind: 'top-level', chapterId: chapter.id, index: topLevel.index },
      incomingBranch: null,
    };
  }
  const incoming = Object.values(document.branches).find(
    (branch) => branch.role === 'primary' && branch.targetBlockId === blockId,
  );
  if (incoming === undefined) {
    reject('internal-invariant', `block "${blockId}" is neither top-level nor a primary child`);
  }
  if (incoming.source.anchorId !== undefined) {
    reject('invalid-placement', 'moving an anchored child is not supported in M2');
  }
  const siblings = primaryDirectChildren(document, incoming.source.blockId);
  const index = siblings.findIndex((branch) => branch.id === incoming.id);
  delete document.branches[incoming.id];
  changes.branch(incoming.id);
  return {
    placement: { kind: 'child', parentBlockId: incoming.source.blockId, index },
    incomingBranch: incoming,
  };
}

function placementCommand(document: Document, blockId: string, placement: Placement): BlockPlacement {
  if (placement.kind === 'top-level') {
    return { kind: 'top-level', chapterId: placement.chapterId, atIndex: placement.index };
  }
  return {
    kind: 'child',
    parentBlockId: placement.parentBlockId,
    atIndex: placement.index,
  };
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

export function executeCommand(
  document: Document | null,
  command: DocumentCommand,
  options: ExecuteCommandOptions = {},
): CommandResult {
  const context = createContext(options.context);
  const changes = new ChangeSet();

  if (command.type === 'document.create') {
    if (document !== null) {
      return {
        ok: false,
        code: 'invalid-command',
        message: 'document.create requires an empty target (pass null)',
      };
    }
    return createDocumentCommand(command, context, changes);
  }
  if (document === null) {
    return {
      ok: false,
      code: 'invalid-command',
      message: `${command.type} requires an existing document`,
    };
  }

  if (options.skipInputValidation !== true) {
    const report = validateDocument(document);
    if (!report.ok) {
      return {
        ok: false,
        code: 'invalid-document',
        message: `cannot apply ${command.type}: input document is invalid`,
        issues: report.errors,
      };
    }
  }

  const working = structuredClone(document);
  let inverse: DocumentCommand | null = null;
  try {
    inverse = applyToClone(working, command, context, changes);
  } catch (error) {
    if (error instanceof Rejection) {
      const failure: CommandFailure = {
        ok: false,
        code: error.code,
        message: error.message,
      };
      if (error.issues !== undefined) failure.issues = error.issues;
      return failure;
    }
    return {
      ok: false,
      code: 'internal-invariant',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  working.revision = document.revision + 1;
  working.updatedAt = context.now();

  const report = validateDocument(working);
  if (!report.ok) {
    return {
      ok: false,
      code: 'internal-invariant',
      message: `${command.type} produced an invalid document`,
      issues: report.errors,
    };
  }

  return {
    ok: true,
    document: working,
    revision: working.revision,
    affected: changes.toJSON(),
    inverse,
    warnings: report.warnings.map((issue) => issue.message),
  };
}

/** Apply a command's inverse (logical undo; history uses snapshots for exactness). */
export function applyInverse(
  result: CommandSuccess,
  options: ExecuteCommandOptions = {},
): CommandResult {
  if (result.inverse === null) {
    return { ok: false, code: 'invalid-command', message: 'command has no inverse' };
  }
  return executeCommand(result.document, result.inverse, options);
}

function createDocumentCommand(
  command: DocumentCreateCommand,
  context: CoreContext,
  changes: ChangeSet,
): CommandResult {
  const input: CreateDocumentInput = {};
  if (command.title !== undefined) input.title = command.title;
  if (command.id !== undefined) input.id = command.id;
  if (command.chapterId !== undefined) input.chapterId = command.chapterId;
  if (command.chapterTitle !== undefined) input.chapterTitle = command.chapterTitle;
  if (command.pageSetup !== undefined) input.pageSetup = command.pageSetup;
  if (command.annotations !== undefined) input.annotations = command.annotations;
  if (command.extensions !== undefined) input.extensions = command.extensions;
  if (command.id !== undefined) {
    try {
      assertId(command.id, 'document ID');
    } catch (error) {
      return rejectionToFailure(error);
    }
  }
  if (command.chapterId !== undefined) {
    try {
      assertId(command.chapterId, 'chapter ID');
    } catch (error) {
      return rejectionToFailure(error);
    }
  }
  let created: Document;
  try {
    created = createDocument(input, context);
  } catch (error) {
    return {
      ok: false,
      code: 'invalid-command',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const report = validateDocument(created);
  if (!report.ok) {
    return {
      ok: false,
      code: 'internal-invariant',
      message: 'document.create produced an invalid document',
      issues: report.errors,
    };
  }
  changes.document(created.id);
  const chapter = created.chapters[0];
  if (chapter !== undefined) changes.chapter(chapter.id);
  return {
    ok: true,
    document: created,
    revision: created.revision,
    affected: changes.toJSON(),
    inverse: null,
    warnings: report.warnings.map((issue) => issue.message),
  };
}

function rejectionToFailure(error: unknown): CommandFailure {
  if (error instanceof Rejection) {
    const failure: CommandFailure = { ok: false, code: error.code, message: error.message };
    if (error.issues !== undefined) failure.issues = error.issues;
    return failure;
  }
  return {
    ok: false,
    code: 'internal-invariant',
    message: error instanceof Error ? error.message : String(error),
  };
}

function applyToClone(
  document: Document,
  command: DocumentCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  switch (command.type) {
    case 'document.create':
      return null;

    case 'document.rename': {
      if (typeof command.title !== 'string') reject('invalid-command', 'title must be a string');
      const previous = document.title;
      document.title = command.title;
      changes.document(document.id);
      return { type: 'document.rename', title: previous };
    }

    case 'chapter.create': {
      const chapterId = command.chapterId ?? freshId(document, context);
      assertId(chapterId, 'chapterId');
      if (allIds(document).has(chapterId)) {
        reject('duplicate-id', `ID "${chapterId}" already exists`);
      }
      if (command.title !== undefined && typeof command.title !== 'string') {
        reject('invalid-command', 'chapter title must be a string');
      }
      const index = command.atIndex ?? document.chapters.length;
      assertIndex(index, document.chapters.length, 'chapter index');
      const chapter: Chapter = { id: chapterId, topLevelBlockIds: [] };
      if (command.title !== undefined) chapter.title = command.title;
      document.chapters.splice(index, 0, chapter);
      changes.chapter(chapterId);
      return {
        type: 'chapter.delete',
        chapterId,
        blockHandling: { kind: 'reject-if-not-empty' },
      };
    }

    case 'chapter.rename': {
      assertId(command.chapterId, 'chapterId');
      const chapter = chapterOrFail(document, command.chapterId);
      if (command.title !== null && typeof command.title !== 'string') {
        reject('invalid-command', 'chapter title must be a string or null');
      }
      const previous = chapter.title ?? null;
      if (command.title === null) delete chapter.title;
      else chapter.title = command.title;
      changes.chapter(chapter.id);
      return { type: 'chapter.rename', chapterId: chapter.id, title: previous };
    }

    case 'chapter.reorder': {
      assertId(command.chapterId, 'chapterId');
      chapterOrFail(document, command.chapterId);
      assertIndex(command.toIndex, document.chapters.length - 1, 'chapter index');
      const fromIndex = document.chapters.findIndex((chapter) => chapter.id === command.chapterId);
      if (fromIndex < 0) reject('not-found', 'chapter does not exist');
      const [chapter] = document.chapters.splice(fromIndex, 1);
      if (chapter === undefined) reject('internal-invariant', 'chapter disappeared');
      document.chapters.splice(command.toIndex, 0, chapter);
      changes.chapter(chapter.id);
      return { type: 'chapter.reorder', chapterId: chapter.id, toIndex: fromIndex };
    }

    case 'chapter.delete': {
      assertId(command.chapterId, 'chapterId');
      const chapter = chapterOrFail(document, command.chapterId);
      if (document.chapters.length <= 1) {
        reject('last-chapter', 'a document must keep at least one chapter');
      }
      const chapterIndex = document.chapters.indexOf(chapter);
      const handling = command.blockHandling;
      if (handling.kind === 'reject-if-not-empty') {
        if (chapter.topLevelBlockIds.length > 0) {
          reject('chapter-in-use', 'chapter still contains top-level blocks');
        }
        document.chapters.splice(chapterIndex, 1);
        changes.chapter(chapter.id);
        return {
          type: 'chapter.create',
          chapterId: chapter.id,
          ...(chapter.title === undefined ? {} : { title: chapter.title }),
          atIndex: chapterIndex,
        };
      }
      if (handling.kind === 'move-to-chapter') {
        assertId(handling.chapterId, 'chapterId');
        if (handling.chapterId === chapter.id) {
          reject('invalid-command', 'cannot move blocks into the chapter being deleted');
        }
        const target = chapterOrFail(document, handling.chapterId);
        target.topLevelBlockIds.push(...chapter.topLevelBlockIds);
        for (const blockId of chapter.topLevelBlockIds) changes.block(blockId);
        changes.chapter(target.id);
        document.chapters.splice(chapterIndex, 1);
        changes.chapter(chapter.id);
        return null;
      }
      for (const blockId of [...chapter.topLevelBlockIds]) {
        const subtree = collectSubtree(document, blockId);
        removeBlocks(document, subtree, changes);
      }
      document.chapters.splice(chapterIndex, 1);
      changes.chapter(chapter.id);
      return null;
    }

    case 'block.create': {
      const blockId = command.blockId ?? freshId(document, context);
      assertId(blockId, 'blockId');
      if (allIds(document).has(blockId)) {
        reject('duplicate-id', `ID "${blockId}" already exists`);
      }
      if (command.content !== undefined) assertContent(command.content);
      if (command.label !== undefined && typeof command.label !== 'string') {
        reject('invalid-command', 'label must be a string');
      }
      const placement = resolvePlacement(document, command.placement);
      const timestamp = context.now();
      const block: ContentBlock = {
        id: blockId,
        content: structuredClone(command.content ?? { type: 'doc', children: [] }),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      if (command.label !== undefined) block.label = command.label;
      if (command.border !== undefined) block.border = command.border;
      document.blocks[blockId] = block;
      changes.block(blockId);

      if (placement.kind === 'top-level') {
        const chapter = chapterOrFail(document, placement.chapterId);
        chapter.topLevelBlockIds.splice(placement.index, 0, blockId);
        changes.chapter(chapter.id);
      } else {
        attachAsChild(
          document,
          context,
          changes,
          placement.parentBlockId,
          blockId,
          placement.index,
        );
        changes.block(placement.parentBlockId);
        const parentChapter = chapterIdForBlock(document, placement.parentBlockId);
        if (parentChapter !== null) changes.chapter(parentChapter);
      }
      return { type: 'block.delete', blockId, children: 'delete-subtree' };
    }

    case 'block.editContent': {
      assertId(command.blockId, 'blockId');
      const block = blockOrFail(document, command.blockId);
      assertContent(command.content);
      const previous = block.content;
      block.content = structuredClone(command.content);
      block.updatedAt = context.now();
      changes.block(block.id);
      return { type: 'block.editContent', blockId: block.id, content: previous };
    }

    case 'block.rename': {
      assertId(command.blockId, 'blockId');
      const block = blockOrFail(document, command.blockId);
      if (command.label !== null && typeof command.label !== 'string') {
        reject('invalid-command', 'label must be a string or null');
      }
      const previous = block.label ?? null;
      if (command.label === null) delete block.label;
      else block.label = command.label;
      block.updatedAt = context.now();
      changes.block(block.id);
      return { type: 'block.rename', blockId: block.id, label: previous };
    }

    case 'block.delete': {
      assertId(command.blockId, 'blockId');
      blockOrFail(document, command.blockId);
      if (command.children === 'delete-subtree') {
        const subtree = collectSubtree(document, command.blockId);
        removeBlocks(document, subtree, changes);
        return null;
      }
      if (command.children !== 'promote') {
        reject('invalid-command', 'children must be "promote" or "delete-subtree"');
      }
      promoteChildren(document, command.blockId, changes);
      removeSingleBlock(document, command.blockId, changes);
      return null;
    }

    case 'block.move': {
      assertId(command.blockId, 'blockId');
      blockOrFail(document, command.blockId);
      const movedSubtree = subtreeBlockIds(document, command.blockId);
      const destination = resolvePlacement(document, command.to);
      if (destination.kind === 'child') {
        if (destination.parentBlockId === command.blockId) {
          reject('cycle', 'a block cannot become its own child');
        }
        if (movedSubtree.includes(destination.parentBlockId)) {
          reject('cycle', 'a block cannot move under its own descendant');
        }
      }
      if (command.to.kind === 'sibling') {
        assertId(command.to.siblingBlockId, 'siblingBlockId');
        if (command.to.siblingBlockId === command.blockId) {
          reject('invalid-placement', 'a block cannot be its own sibling');
        }
        if (movedSubtree.includes(command.to.siblingBlockId)) {
          reject('cycle', 'a block cannot move relative to its own descendant');
        }
      }

      const previousChapter = chapterIdForBlock(document, command.blockId);
      const { placement: previousPlacement, incomingBranch } = detachBlock(
        document,
        command.blockId,
        changes,
      );
      if (previousPlacement.kind === 'top-level') {
        changes.chapter(previousPlacement.chapterId);
      } else {
        changes.block(previousPlacement.parentBlockId);
      }
      if (previousChapter !== null) changes.chapter(previousChapter);

      if (destination.kind === 'top-level') {
        const chapter = chapterOrFail(document, destination.chapterId);
        let index = command.to.kind === 'top-level' ? command.to.atIndex : undefined;
        if (index === undefined) {
          if (command.to.kind === 'sibling') {
            const siblingIndex = chapter.topLevelBlockIds.indexOf(command.to.siblingBlockId);
            if (siblingIndex < 0) {
              reject('invalid-placement', 'sibling is not a top-level block in that chapter');
            }
            index = siblingIndex + (command.to.after !== false ? 1 : 0);
          } else {
            index = chapter.topLevelBlockIds.length;
          }
        }
        assertIndex(index, chapter.topLevelBlockIds.length, 'top-level index');
        chapter.topLevelBlockIds.splice(index, 0, command.blockId);
        changes.chapter(chapter.id);
      } else {
        let index = command.to.kind === 'child' ? command.to.atIndex : undefined;
        const siblings = primaryDirectChildren(document, destination.parentBlockId);
        if (index === undefined) {
          const destinationSpec = command.to;
          if (destinationSpec.kind === 'sibling') {
            const siblingIndex = siblings.findIndex(
              (branch) => branch.targetBlockId === destinationSpec.siblingBlockId,
            );
            if (siblingIndex < 0) {
              reject('invalid-placement', 'sibling is not a direct child of the destination parent');
            }
            index = siblingIndex + (destinationSpec.after !== false ? 1 : 0);
          } else {
            index = siblings.length;
          }
        }
        assertIndex(index, siblings.length, 'child index');
        attachAsChild(
          document,
          context,
          changes,
          destination.parentBlockId,
          command.blockId,
          index,
          incomingBranch ?? undefined,
        );
        changes.block(destination.parentBlockId);
        const destinationChapter = chapterIdForBlock(document, destination.parentBlockId);
        if (destinationChapter !== null) changes.chapter(destinationChapter);
      }
      changes.block(command.blockId);
      return {
        type: 'block.move',
        blockId: command.blockId,
        to: placementCommand(document, command.blockId, previousPlacement),
      };
    }

    case 'branch.create': {
      assertId(command.sourceBlockId, 'sourceBlockId');
      assertId(command.targetBlockId, 'targetBlockId');
      blockOrFail(document, command.sourceBlockId);
      blockOrFail(document, command.targetBlockId);
      if (command.sourceBlockId === command.targetBlockId) {
        reject('cycle', 'a branch cannot target its source block');
      }
      if (subtreeBlockIds(document, command.targetBlockId).includes(command.sourceBlockId)) {
        reject('cycle', 'branch would create a primary cycle');
      }
      const existingParent = Object.values(document.branches).find(
        (branch) =>
          branch.role === 'primary' && branch.targetBlockId === command.targetBlockId,
      );
      if (existingParent !== undefined) {
        reject(
          'invalid-placement',
          'target already has a primary parent; use block.move to reparent it',
        );
      }
      const targetPlacement = findTopLevelPlacement(document, command.targetBlockId);
      if (targetPlacement === null) {
        reject('internal-invariant', 'target root is not assigned to a chapter');
      }
      const chapter = chapterOrFail(document, targetPlacement.chapterId);
      chapter.topLevelBlockIds.splice(targetPlacement.index, 1);
      changes.chapter(chapter.id);
      const children = primaryDirectChildren(document, command.sourceBlockId);
      const index = command.atIndex ?? children.length;
      assertIndex(index, children.length, 'child index');
      const branch = createBranchRecord(
        document,
        context,
        changes,
        command.sourceBlockId,
        command.targetBlockId,
        orderKeyForIndex(document, command.sourceBlockId, index, changes),
        command.branchId,
      );
      changes.block(command.targetBlockId);
      changes.block(command.sourceBlockId);
      const sourceChapter = chapterIdForBlock(document, command.sourceBlockId);
      if (sourceChapter !== null) changes.chapter(sourceChapter);
      return {
        type: 'branch.delete',
        branchId: branch.id,
        targetHandling: { kind: 'promote' },
      };
    }

    case 'branch.delete': {
      assertId(command.branchId, 'branchId');
      const branch = branchOrFail(document, command.branchId);
      if (branch.role !== 'primary') {
        reject('invalid-command', 'only primary branches can be deleted in M2');
      }
      if (branch.source.anchorId !== undefined) {
        reject('invalid-command', 'anchored branches are not supported in M2');
      }
      const targetId = branch.targetBlockId;
      blockOrFail(document, targetId);
      if (command.targetHandling.kind === 'promote') {
        const sourceRoot = topLevelAncestorId(document, branch.source.blockId);
        const placement = findTopLevelPlacement(document, sourceRoot);
        if (placement === null) {
          reject('internal-invariant', 'source block has no chapter assignment');
        }
        const chapter = chapterOrFail(document, placement.chapterId);
        delete document.branches[branch.id];
        changes.branch(branch.id);
        chapter.topLevelBlockIds.splice(placement.index + 1, 0, targetId);
        changes.chapter(chapter.id);
        changes.block(targetId);
        return null;
      }
      if (command.targetHandling.kind !== 'delete-subtree') {
        reject('invalid-command', 'targetHandling must be "promote" or "delete-subtree"');
      }
      const subtree = collectSubtree(document, targetId);
      delete document.branches[branch.id];
      changes.branch(branch.id);
      removeBlocks(document, subtree, changes);
      return null;
    }

    case 'branch.reorder': {
      assertId(command.branchId, 'branchId');
      const branch = branchOrFail(document, command.branchId);
      if (branch.role !== 'primary' || branch.source.anchorId !== undefined) {
        reject('invalid-command', 'only direct primary branches can be reordered in M2');
      }
      const siblings = primaryDirectChildren(document, branch.source.blockId);
      const fromIndex = siblings.findIndex((candidate) => candidate.id === branch.id);
      if (fromIndex < 0) reject('internal-invariant', 'branch is not in its source port');
      assertIndex(command.toIndex, siblings.length - 1, 'sibling index');
      if (command.toIndex === fromIndex) {
        changes.branch(branch.id);
        return { type: 'branch.reorder', branchId: branch.id, toIndex: fromIndex };
      }
      const withoutBranch = siblings.filter((candidate) => candidate.id !== branch.id);
      const order = orderKeyForIndexInList(
        document,
        branch.source.blockId,
        withoutBranch,
        command.toIndex,
        changes,
      );
      branch.order = order;
      changes.branch(branch.id);
      return { type: 'branch.reorder', branchId: branch.id, toIndex: fromIndex };
    }

    case 'branch.relabel': {
      assertId(command.branchId, 'branchId');
      const branch = branchOrFail(document, command.branchId);
      if (branch.role !== 'primary') {
        reject('invalid-command', 'only primary branches are editable in M2');
      }
      if (command.label !== null && typeof command.label !== 'string') {
        reject('invalid-command', 'label must be a string or null');
      }
      const previous = branch.label ?? null;
      if (command.label === null) delete branch.label;
      else branch.label = command.label;
      changes.branch(branch.id);
      return { type: 'branch.relabel', branchId: branch.id, label: previous };
    }

    default: {
      const unreachable = command as { type?: unknown };
      return reject('invalid-command', `unknown command type: ${String(unreachable.type)}`);
    }
  }
}

/**
 * Order key for an insertion at `index` computed against an explicit sibling
 * list (used when the moved item was already removed from consideration).
 */
function orderKeyForIndexInList(
  document: Document,
  parentBlockId: string,
  siblings: readonly Branch[],
  index: number,
  changes: ChangeSet,
): string {
  assertIndex(index, siblings.length, 'sibling index');
  const low = index > 0 ? siblings[index - 1]?.order ?? null : null;
  const high = index < siblings.length ? siblings[index]?.order ?? null : null;
  try {
    if (
      (low === null || isValidOrderKey(low)) &&
      (high === null || isValidOrderKey(high)) &&
      (low === null || high === null || low < high)
    ) {
      return orderBetween(low, high);
    }
  } catch {
    // fall through
  }
  renormalizeChildOrders(document, parentBlockId, changes);
  const siblingIds = new Set(siblings.map((sibling) => sibling.id));
  const refreshed = primaryDirectChildren(document, parentBlockId).filter((branch) =>
    siblingIds.has(branch.id),
  );
  const lowAfter = index > 0 ? refreshed[index - 1]?.order ?? null : null;
  const highAfter = index < refreshed.length ? refreshed[index]?.order ?? null : null;
  return orderBetween(lowAfter, highAfter);
}

function promoteChildren(
  document: Document,
  blockId: string,
  changes: ChangeSet,
): void {
  const childBranches = allPrimaryChildren(document, blockId);
  if (childBranches.length === 0) return;
  const childIds = childBranches.map((branch) => branch.targetBlockId);
  const topLevel = findTopLevelPlacement(document, blockId);
  if (topLevel !== null) {
    const chapter = chapterOrFail(document, topLevel.chapterId);
    chapter.topLevelBlockIds.splice(topLevel.index + 1, 0, ...childIds);
    for (const branch of childBranches) {
      delete document.branches[branch.id];
      changes.branch(branch.id);
    }
    for (const childId of childIds) {
      changes.block(childId);
      changes.chapter(chapter.id);
    }
    return;
  }
  const incoming = Object.values(document.branches).find(
    (branch) => branch.role === 'primary' && branch.targetBlockId === blockId,
  );
  if (incoming === undefined) {
    reject('internal-invariant', 'block to delete has no primary parent');
  }
  const parentId = incoming.source.blockId;
  if (incoming.source.anchorId !== undefined) {
    reject('invalid-command', 'deleting an anchored child is not supported in M2');
  }
  const parentSiblings = primaryDirectChildren(document, parentId);
  const deletedIndex = parentSiblings.findIndex((branch) => branch.id === incoming.id);
  delete document.branches[incoming.id];
  changes.branch(incoming.id);
  for (const branch of childBranches) delete document.branches[branch.id];
  const insertionIndex = Math.max(0, deletedIndex);
  const orders = orderKeysForIndex(document, parentId, insertionIndex, childBranches.length, changes);
  for (const [index, branch] of childBranches.entries()) {
    branch.source = { blockId: parentId };
    branch.order = orders[index] ?? orderBetween(null, null);
    document.branches[branch.id] = branch;
    changes.branch(branch.id);
    changes.block(branch.targetBlockId);
  }
  changes.block(parentId);
}

function removeSingleBlock(document: Document, blockId: string, changes: ChangeSet): void {
  for (const [branchId, branch] of Object.entries(document.branches)) {
    if (branch.source.blockId === blockId || branch.targetBlockId === blockId) {
      delete document.branches[branchId];
      changes.branch(branchId);
    }
  }
  for (const [anchorId, anchor] of Object.entries(document.anchors)) {
    if (anchor.blockId === blockId) {
      delete document.anchors[anchorId];
      changes.anchor(anchorId);
    }
  }
  for (const chapter of document.chapters) {
    const index = chapter.topLevelBlockIds.indexOf(blockId);
    if (index >= 0) {
      chapter.topLevelBlockIds.splice(index, 1);
      changes.chapter(chapter.id);
    }
  }
  document.manualBreakBeforeBlockIds = document.manualBreakBeforeBlockIds.filter(
    (id) => id !== blockId,
  );
  delete document.blocks[blockId];
  changes.block(blockId);
}

/** Utility exported for editor adapters that need chapter membership. */
export function chapterForBlock(document: Document, blockId: string): string | null {
  return chapterIdForBlock(document, blockId);
}

/** Utility exported for callers that want to check a move before applying it. */
export function isLegalMove(document: Document, blockId: string, to: BlockPlacement): boolean {
  const subtree = subtreeBlockIds(document, blockId);
  if (to.kind === 'child') {
    return to.parentBlockId !== blockId && !subtree.includes(to.parentBlockId);
  }
  if (to.kind === 'sibling') {
    return to.siblingBlockId !== blockId && !subtree.includes(to.siblingBlockId);
  }
  return true;
}
