/**
 * Typed document commands: the only mutation path.
 *
 * Every command is pure (the input document is not mutated), validates its
 * preconditions, applies to a deep clone, re-validates the resulting document,
 * and returns a typed success or failure. A success carries the new document,
 * the new revision, affected IDs, and (where practical) an inverse command.
 *
 * Structural edits use canonical primary branches (role "primary"), not a
 * second parent pointer. A primary branch may start at a block or at an anchor
 * inside it. Reference and anchored branches have typed commands in M3.
 */

import type { ValidationIssue } from './errors.js';
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
} from './anchors.js';
import type { AnchorBinding } from './anchors.js';
import { createDocument } from './document.js';
import type { CreateDocumentInput } from './document.js';
import { orderBetween, orderKeysBetween, orderKeysAfter, isValidOrderKey } from './fractional-order.js';
import { createContext } from './ids.js';
import type { CoreContext } from './ids.js';
import {
  chapterIdForBlock,
  compareBranches,
  directChildBranches,
  findTopLevelPlacement,
  primaryChildBranches,
  primaryParentBranch,
  subtreeBlockIds,
  topLevelAncestorId,
} from './structure.js';
import type {
  Anchor,
  AnchorKind,
  BlockBorder,
  Branch,
  BranchRole,
  BranchSource,
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
  | 'chapter-would-be-empty'
  | 'invalid-content'
  | 'anchor-exists'
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

/**
 * IDs created by a command. Structural callers must use these instead of
 * inferring the new block from a before/after document diff.
 */
export interface CreatedIds {
  documentIds: string[];
  chapterIds: string[];
  blockIds: string[];
  branchIds: string[];
  anchorIds: string[];
}

export interface CommandSuccess {
  ok: true;
  document: Document;
  revision: number;
  affected: AffectedIds;
  created: CreatedIds;
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
  /**
   * Undo exemption for the inverse of `block.create`: removing a freshly
   * created block may leave its chapter with no top-level block, which is a
   * valid (legacy) state. The command layer sets this only on the inverse it
   * generates for `block.create`; every user-facing delete keeps the F6 guard.
   */
  allowEmptyChapter?: boolean;
}

export interface BlockMoveCommand {
  type: 'block.move';
  blockId: string;
  to: BlockPlacement;
}

export interface AnchorCreateCommand {
  type: 'anchor.create';
  anchorId?: string;
  blockId: string;
  kind: AnchorKind;
  selector: JsonObject;
  binding: AnchorBinding;
  quote?: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
  /**
   * When the same selection is already bound to an existing anchor, return
   * that anchor (`affected.anchorIds`) instead of failing with
   * `anchor-exists`. False by default: callers must opt in.
   */
  reuseExisting?: boolean;
}

export interface AnchorRepairCommand {
  type: 'anchor.repair';
  anchorId: string;
  selector: JsonObject;
  binding: AnchorBinding;
  quote?: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
}

export interface AnchorAttachToBlockCommand {
  type: 'anchor.attachToBlock';
  anchorId: string;
}

export type AnchorBranchHandling = 'attach' | 'delete';

export interface AnchorDeleteCommand {
  type: 'anchor.delete';
  anchorId: string;
  /**
   * Required when the anchor has outgoing branches. `attach` keeps them as
   * block-sourced branches; `delete` retires them and promotes primary targets.
   */
  branches?: AnchorBranchHandling;
}

export interface BranchCreateCommand {
  type: 'branch.create';
  branchId?: string;
  sourceBlockId: string;
  /** Anchor port inside `sourceBlockId`; omitted for a block port. */
  sourceAnchorId?: string;
  targetBlockId: string;
  /** Explicit role. Defaults to primary for the M2 command shape. */
  role?: BranchRole;
  atIndex?: number;
  label?: string;
}

export type BranchFromSelectionTarget =
  | {
      kind: 'new';
      /** Optional explicit block ID; a fresh one is generated by default. */
      blockId?: string;
      content?: ContentNode;
    }
  | { kind: 'existing'; blockId: string };

/**
 * One user action: anchor (new or reused) + target block (new or existing) +
 * branch, with one exact inverse. `selector` is optional for text anchors: the
 * command derives quote/context/occurrence from the binding when omitted.
 */
export interface BranchCreateFromSelectionCommand {
  type: 'branch.createFromSelection';
  /** Block containing the selection. */
  blockId: string;
  kind: AnchorKind;
  binding: AnchorBinding;
  selector?: JsonObject;
  target: BranchFromSelectionTarget;
  /** Defaults to primary; a new target always gets a primary branch. */
  role?: BranchRole;
  atIndex?: number;
  label?: string;
  branchId?: string;
  /** Optional explicit anchor ID when a new anchor is needed. */
  anchorId?: string;
}

export type BranchTargetHandling = { kind: 'promote' } | { kind: 'delete-subtree' };

export interface BranchDeleteCommand {
  type: 'branch.delete';
  branchId: string;
  /** Required for primary branches; must be absent for reference branches. */
  targetHandling?: BranchTargetHandling;
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

/**
 * Promote a reference to the target's primary home and demote the old primary
 * edge to a reference (spec §5.3, design §7.4). Both branch IDs survive; the
 * target's subtree moves under the new parent.
 */
export interface BranchMakeHomeCommand {
  type: 'branch.makeHome';
  branchId: string;
}

/**
 * Promote a reference to primary and retire the target's old primary edge.
 * The target may be a root or already have a primary parent.
 */
export interface BranchMoveHereCommand {
  type: 'branch.moveHere';
  branchId: string;
}

/**
 * Convert a primary edge to a reference. The target becomes a top-level block
 * after the former top-level block of the source block's chapter.
 */
export interface BranchDemoteCommand {
  type: 'branch.demote';
  branchId: string;
}

/**
 * Exact record-level snapshot for structural commands that no ordinary command
 * can reverse with the same identity.
 *
 * `block.delete`, `branch.delete`, `block.move`, `branch.create` and the restore
 * itself remove, repoint or reorder records (IDs, timestamps, labels, branch
 * order, chapter placement) that a second command invocation cannot reproduce.
 * This command restores named records verbatim, removes records the target
 * snapshot no longer contains, and writes exact chapter top-level lists.
 *
 * It is generated by the command layer, never typed by a user. Callers may
 * apply it, but it only touches the records it names; surviving blocks keep
 * any text written after the original command.
 *
 * Destructive delete/detach snapshots keep `redoCommand` so redo re-applies the
 * exact delete. Snapshots without it derive their inverse by diffing the
 * pre/post state, which makes move and branch-create undo/redo exact.
 */
export interface StructureRestoreCommand {
  type: 'structure.restore';
  /** Full block records to restore; their IDs must be free. */
  blocks: ContentBlock[];
  /**
   * Full block records to overwrite in place, used when an anchor command
   * changed the content of a surviving block. Restored verbatim (including
   * `updatedAt`) so repair/attach/delete undo is exact.
   */
  replaceBlocks?: ContentBlock[];
  /**
   * Post-command records for `replaceBlocks`. A mismatch means the block was
   * edited after the command: undo must surface that instead of silently
   * discarding later text.
   */
  expectedReplaceBlocks?: ContentBlock[];
  /** Full branch records to restore or overwrite by ID. */
  branches: Branch[];
  /** Full anchor records to restore. */
  anchors: Anchor[];
  /** Exact top-level membership for every chapter the command changed. */
  chapters: Array<{ chapterId: string; topLevelBlockIds: string[] }>;
  /** Blocks present before the restore that the target snapshot omits. */
  removeBlocks?: string[];
  /** Branches present before the restore that the target snapshot omits. */
  removeBranches?: string[];
  /** Anchors present before the restore that the target snapshot omits. */
  removeAnchors?: string[];
  /** Exact target manual-break list when the command changed it. */
  manualBreakBeforeBlockIds?: string[];
  /** Deterministic redo for destructive deletes; omitted for diffed snapshots. */
  redoCommand?: DocumentCommand;
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
  | AnchorCreateCommand
  | AnchorRepairCommand
  | AnchorAttachToBlockCommand
  | AnchorDeleteCommand
  | BranchCreateCommand
  | BranchCreateFromSelectionCommand
  | BranchDeleteCommand
  | BranchReorderCommand
  | BranchRelabelCommand
  | BranchMakeHomeCommand
  | BranchMoveHereCommand
  | BranchDemoteCommand
  | StructureRestoreCommand;

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
function rejectEmptyChapter(
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

interface BranchPort {
  blockId: string;
  anchorId?: string;
}

function portOf(source: BranchSource): BranchPort {
  return source.anchorId === undefined
    ? { blockId: source.blockId }
    : { blockId: source.blockId, anchorId: source.anchorId };
}

function samePort(left: BranchSource, right: BranchPort): boolean {
  return left.blockId === right.blockId && left.anchorId === right.anchorId;
}

function portBranches(document: Document, port: BranchPort, role: BranchRole): Branch[] {
  return Object.values(document.branches)
    .filter((branch) => branch.role === role && samePort(branch.source, port))
    .sort(compareBranches);
}

function portOrdersAreSane(branches: readonly Branch[]): boolean {
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

function orderKeyForPortIndex(
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

function orderKeysForPortIndex(
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

function orderKeyForPortIndexInList(
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
function appendBranchesToPort(
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
function appendOrderKeyAtPort(
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

function sameExactPair(left: Branch, right: Branch): boolean {
  return (
    left.targetBlockId === right.targetBlockId &&
    samePort(left.source, portOf(right.source))
  );
}

function assertPairIsUnique(
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
function assertPromotableReference(
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

function createPortBranchRecord(
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

interface ExistingBranchCreation {
  sourceBlockId: string;
  sourceAnchorId?: string;
  targetBlockId: string;
  role: BranchRole;
  atIndex?: number;
  label?: string;
  branchId?: string;
}

/**
 * Create a branch to an existing target from a block or anchor port. Shared by
 * `branch.create` and the existing-target half of `branch.createFromSelection`
 * so role rules, cycle checks, dedupe and the chapter-slot guard cannot drift.
 */
function applyExistingBranchCreation(
  document: Document,
  context: CoreContext,
  changes: ChangeSet,
  input: ExistingBranchCreation,
): DocumentCommand | null {
  blockOrFail(document, input.sourceBlockId);
  blockOrFail(document, input.targetBlockId);
  if (input.role !== 'primary' && input.role !== 'reference') {
    reject('invalid-command', 'role must be "primary" or "reference"');
  }
  const port: BranchPort = { blockId: input.sourceBlockId };
  if (input.sourceAnchorId !== undefined) {
    assertId(input.sourceAnchorId, 'sourceAnchorId');
    const anchor = anchorOrFail(document, input.sourceAnchorId);
    if (anchor.blockId !== input.sourceBlockId) {
      reject('invalid-command', 'source anchor belongs to a different block');
    }
    port.anchorId = anchor.id;
  }
  if (input.sourceBlockId === input.targetBlockId) {
    reject('cycle', 'a branch cannot target its source block');
  }
  const duplicate = Object.values(document.branches).find(
    (branch) =>
      branch.targetBlockId === input.targetBlockId && samePort(branch.source, port),
  );
  if (duplicate !== undefined) {
    changes.branch(duplicate.id);
    changes.warn(
      `an edge from this source to the target already exists (branch "${duplicate.id}"); reused it`,
    );
    return null;
  }
  if (input.role === 'primary') {
    if (subtreeBlockIds(document, input.targetBlockId).includes(input.sourceBlockId)) {
      reject('cycle', 'branch would create a primary cycle');
    }
    const existingParent = Object.values(document.branches).find(
      (branch) =>
        branch.role === 'primary' && branch.targetBlockId === input.targetBlockId,
    );
    if (existingParent !== undefined) {
      reject(
        'invalid-placement',
        'target already has a primary parent; use block.move to reparent it',
      );
    }
  }
  if (input.label !== undefined && typeof input.label !== 'string') {
    reject('invalid-command', 'label must be a string');
  }
  let targetPlacement: ReturnType<typeof findTopLevelPlacement> = null;
  if (input.role === 'primary') {
    targetPlacement = findTopLevelPlacement(document, input.targetBlockId);
    if (targetPlacement === null) {
      reject('internal-invariant', 'target root is not assigned to a chapter');
    }
    const chapter = chapterOrFail(document, targetPlacement.chapterId);
    // F6: creating a primary branch reparents the target under the source. If
    // the target is the only top-level block of its chapter, that would strand
    // an empty chapter; the user must add another root or delete the chapter.
    if (chapter.topLevelBlockIds.length === 1) {
      rejectEmptyChapter(chapter, 'branch');
    }
    chapter.topLevelBlockIds.splice(targetPlacement.index, 1);
    changes.chapter(chapter.id);
  }
  const siblings = portBranches(document, port, input.role);
  const index = input.atIndex ?? siblings.length;
  const branch = createPortBranchRecord(
    document,
    context,
    changes,
    port,
    input.targetBlockId,
    input.role,
    orderKeyForPortIndex(document, port, input.role, index, changes),
    input.branchId,
  );
  if (input.label !== undefined) branch.label = input.label;
  changes.block(input.targetBlockId);
  changes.block(input.sourceBlockId);
  if (input.role === 'primary') {
    const sourceChapter = chapterIdForBlock(document, input.sourceBlockId);
    if (sourceChapter !== null) changes.chapter(sourceChapter);
    // `branch.delete promote` would put the target in the *source* chapter.
    // The exact snapshot restores the target's original chapter and slot.
    return null;
  }
  return { type: 'branch.delete', branchId: branch.id };
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
    // A sibling placement next to an anchored child cannot address the anchor
    // port (BlockPlacement has no anchor field). Place the block at the end of
    // the parent block's direct child list instead of rejecting the move.
    return {
      kind: 'child',
      parentBlockId: parentBranch.source.blockId,
      index: primaryDirectChildren(document, parentBranch.source.blockId).length,
    };
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
  return primaryChildBranches(document, parentBlockId);
}

function collectSubtree(document: Document, rootBlockId: string): Set<string> {
  return new Set(subtreeBlockIds(document, rootBlockId));
}

// ---------------------------------------------------------------------------
// Anchor command helpers
// ---------------------------------------------------------------------------

function anchorOrFail(document: Document, anchorId: string): Anchor {
  const anchor = own(document.anchors, anchorId);
  if (anchor === undefined) reject('not-found', `anchor "${anchorId}" does not exist`);
  return anchor;
}

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
function ensureSelectionAnchor(
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

function removeAnchorContent(
  document: Document,
  anchor: Anchor,
  context: CoreContext,
  changes: ChangeSet,
): ContentBlock {
  const block = blockOrFail(document, anchor.blockId);
  block.content = removeAnchorBinding(block.content, anchor.id);
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
    // Moving an anchored child removes the old anchored edge; a fresh direct
    // edge is created at the destination (the snapshot restores the old ID).
    const siblings = directChildBranches(document, incoming.source.blockId);
    const index = siblings.findIndex((branch) => branch.id === incoming.id);
    delete document.branches[incoming.id];
    changes.branch(incoming.id);
    return {
      placement: {
        kind: 'child',
        parentBlockId: incoming.source.blockId,
        index: Math.max(0, index),
      },
      incomingBranch: null,
    };
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
    if (inverse === null) {
      // Destructive deletes cannot express their own inverse from the post-state:
      // capture the changed records before the revision bump so the same stack
      // can restore identity exactly.
      inverse = captureRestoreCommand(document, working, command);
    }
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
    created: changes.createdJSON(),
    inverse,
    warnings: [...changes.warnings(), ...report.warnings.map((issue) => issue.message)],
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
  changes.createdDocument(created.id);
  const chapter = created.chapters[0];
  if (chapter !== undefined) {
    changes.chapter(chapter.id);
    changes.createdChapter(chapter.id);
  }
  return {
    ok: true,
    document: created,
    revision: created.revision,
    affected: changes.toJSON(),
    created: changes.createdJSON(),
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
      changes.createdChapter(chapterId);
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

    case 'anchor.create': {
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

    case 'anchor.repair': {
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

    case 'anchor.attachToBlock': {
      assertId(command.anchorId, 'anchorId');
      const anchor = anchorOrFail(document, command.anchorId);
      attachAnchorBranchesToBlock(document, anchor, context, changes);
      return null;
    }

    case 'anchor.delete': {
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
      changes.createdBlock(blockId);

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
      return {
        type: 'block.delete',
        blockId,
        children: 'delete-subtree',
        allowEmptyChapter: true,
      };
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
      if (command.children !== 'delete-subtree' && command.children !== 'promote') {
        reject('invalid-command', 'children must be "promote" or "delete-subtree"');
      }
      if (
        command.allowEmptyChapter !== undefined &&
        typeof command.allowEmptyChapter !== 'boolean'
      ) {
        reject('invalid-command', 'allowEmptyChapter must be a boolean');
      }
      // A top-level delete must not strand an empty chapter. Promoting children
      // keeps the chapter non-empty, so only a childless promote or a subtree
      // delete of the last root is rejected. Deleting the chapter itself
      // (`chapter.delete`) remains the explicit way to remove the last block.
      // The inverse of `block.create` sets `allowEmptyChapter`, because undoing
      // a creation must restore the pre-create state even when that state was
      // an empty chapter.
      const topLevel = findTopLevelPlacement(document, command.blockId);
      if (topLevel !== null && command.allowEmptyChapter !== true) {
        const chapter = chapterOrFail(document, topLevel.chapterId);
        const promotedCount =
          command.children === 'promote'
            ? allPrimaryChildren(document, command.blockId).length
            : 0;
        if (chapter.topLevelBlockIds.length === 1 && promotedCount === 0) {
          rejectEmptyChapter(chapter, 'delete');
        }
      }
      if (command.children === 'delete-subtree') {
        const subtree = collectSubtree(document, command.blockId);
        removeBlocks(document, subtree, changes);
        return null;
      }
      promoteChildren(document, command.blockId, context, changes);
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

      // F6: a top-level block leaving its chapter must not leave that chapter
      // with zero top-level blocks. Reordering inside the same chapter is still
      // allowed because it cannot empty the chapter.
      const sourceTopLevel = findTopLevelPlacement(document, command.blockId);
      if (sourceTopLevel !== null) {
        const sourceChapter = chapterOrFail(document, sourceTopLevel.chapterId);
        const emptiesSource =
          destination.kind === 'child' || destination.chapterId !== sourceChapter.id;
        if (sourceChapter.topLevelBlockIds.length === 1 && emptiesSource) {
          rejectEmptyChapter(sourceChapter, 'move');
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
      // No hand-written inverse: a move can delete the incoming branch and
      // create a new one with a fresh ID and order key. `captureRestoreCommand`
      // snapshots the exact branch/chapter records so undo preserves identity
      // and redo reproduces the moved state exactly.
      return null;
    }

    case 'branch.create': {
      assertId(command.sourceBlockId, 'sourceBlockId');
      assertId(command.targetBlockId, 'targetBlockId');
      const role = command.role ?? 'primary';
      if (role !== 'primary' && role !== 'reference') {
        reject('invalid-command', 'role must be "primary" or "reference"');
      }
      return applyExistingBranchCreation(document, context, changes, {
        sourceBlockId: command.sourceBlockId,
        ...(command.sourceAnchorId === undefined
          ? {}
          : { sourceAnchorId: command.sourceAnchorId }),
        targetBlockId: command.targetBlockId,
        role,
        ...(command.atIndex === undefined ? {} : { atIndex: command.atIndex }),
        ...(command.label === undefined ? {} : { label: command.label }),
        ...(command.branchId === undefined ? {} : { branchId: command.branchId }),
      });
    }

    case 'branch.createFromSelection': {
      assertId(command.blockId, 'blockId');
      const sourceBlock = blockOrFail(document, command.blockId);
      if (!isKnownAnchorKind(command.kind)) {
        reject('invalid-command', `unknown anchor kind "${String(command.kind)}"`);
      }
      if (
        typeof command.binding !== 'object' ||
        command.binding === null ||
        Array.isArray(command.binding)
      ) {
        reject('invalid-command', 'binding must be an object');
      }
      const role = command.role ?? 'primary';
      if (role !== 'primary' && role !== 'reference') {
        reject('invalid-command', 'role must be "primary" or "reference"');
      }
      if (
        typeof command.target !== 'object' ||
        command.target === null ||
        Array.isArray(command.target)
      ) {
        reject('invalid-command', 'target must be an object');
      }
      if (
        command.selector !== undefined &&
        (typeof command.selector !== 'object' ||
          command.selector === null ||
          Array.isArray(command.selector))
      ) {
        reject('invalid-command', 'selector must be an object');
      }
      if (command.label !== undefined && typeof command.label !== 'string') {
        reject('invalid-command', 'label must be a string');
      }

      const anchor = ensureSelectionAnchor(
        document,
        context,
        changes,
        sourceBlock,
        command.kind,
        command.binding,
        command.selector,
        command.anchorId,
      );

      if (command.target.kind === 'new') {
        if (role !== 'primary') {
          reject('invalid-command', 'a new target always gets a primary branch');
        }
        const targetBlockId = command.target.blockId ?? freshId(document, context);
        assertId(targetBlockId, 'target.blockId');
        if (allIds(document).has(targetBlockId)) {
          reject('duplicate-id', `ID "${targetBlockId}" already exists`);
        }
        if (command.target.content !== undefined) assertContent(command.target.content);
        const timestamp = context.now();
        const targetBlock: ContentBlock = {
          id: targetBlockId,
          content: structuredClone(
            command.target.content ?? { type: 'doc', children: [] },
          ),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        document.blocks[targetBlockId] = targetBlock;
        changes.block(targetBlockId);
        changes.createdBlock(targetBlockId);

        const port: BranchPort = {
          blockId: sourceBlock.id,
          anchorId: anchor.anchorId,
        };
        const siblings = portBranches(document, port, 'primary');
        const index = command.atIndex ?? siblings.length;
        const branch = createPortBranchRecord(
          document,
          context,
          changes,
          port,
          targetBlockId,
          'primary',
          orderKeyForPortIndex(document, port, 'primary', index, changes),
          command.branchId,
        );
        if (command.label !== undefined) branch.label = command.label;
        changes.block(sourceBlock.id);
        const sourceChapter = chapterIdForBlock(document, sourceBlock.id);
        if (sourceChapter !== null) changes.chapter(sourceChapter);
        // The new target never becomes a root, so no chapter slot is created.
        // The snapshot restores the source content and removes the new records.
        return null;
      }

      if (command.target.kind !== 'existing') {
        reject('invalid-command', 'target.kind must be "new" or "existing"');
      }
      assertId(command.target.blockId, 'target.blockId');
      applyExistingBranchCreation(document, context, changes, {
        sourceBlockId: sourceBlock.id,
        sourceAnchorId: anchor.anchorId,
        targetBlockId: command.target.blockId,
        role,
        ...(command.atIndex === undefined ? {} : { atIndex: command.atIndex }),
        ...(command.label === undefined ? {} : { label: command.label }),
        ...(command.branchId === undefined ? {} : { branchId: command.branchId }),
      });
      return null;
    }

    case 'branch.delete': {
      assertId(command.branchId, 'branchId');
      const branch = branchOrFail(document, command.branchId);
      const targetId = branch.targetBlockId;
      blockOrFail(document, targetId);
      if (branch.role === 'reference') {
        if (command.targetHandling !== undefined) {
          reject('invalid-command', 'reference branches do not accept targetHandling');
        }
        delete document.branches[branch.id];
        changes.branch(branch.id);
        return null;
      }
      if (command.targetHandling === undefined) {
        reject(
          'invalid-command',
          'deleting a primary branch requires targetHandling "promote" or "delete-subtree"',
        );
      }
      if (
        typeof command.targetHandling !== 'object' ||
        command.targetHandling === null ||
        Array.isArray(command.targetHandling)
      ) {
        reject('invalid-command', 'targetHandling must be an object');
      }
      const handling = command.targetHandling as { kind?: unknown };
      if (handling.kind !== 'promote' && handling.kind !== 'delete-subtree') {
        reject('invalid-command', 'targetHandling must be "promote" or "delete-subtree"');
      }
      if (handling.kind === 'promote') {
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
      const subtree = collectSubtree(document, targetId);
      delete document.branches[branch.id];
      changes.branch(branch.id);
      removeBlocks(document, subtree, changes);
      return null;
    }

    case 'branch.reorder': {
      assertId(command.branchId, 'branchId');
      const branch = branchOrFail(document, command.branchId);
      const port = portOf(branch.source);
      const siblings = portBranches(document, port, branch.role);
      const portWasUnusable = !portOrdersAreSane(siblings);
      const fromIndex = siblings.findIndex((candidate) => candidate.id === branch.id);
      if (fromIndex < 0) reject('internal-invariant', 'branch is not in its source port');
      assertIndex(command.toIndex, siblings.length - 1, 'sibling index');
      if (command.toIndex === fromIndex) {
        changes.branch(branch.id);
        return { type: 'branch.reorder', branchId: branch.id, toIndex: fromIndex };
      }
      const beforeOrders = new Map(
        portBranches(document, port, branch.role).map((candidate) => [candidate.id, candidate.order]),
      );
      const withoutBranch = siblings.filter((candidate) => candidate.id !== branch.id);
      const order = orderKeyForPortIndexInList(
        document,
        port,
        branch.role,
        withoutBranch,
        command.toIndex,
        changes,
      );
      branch.order = order;
      changes.branch(branch.id);
      const normalizedSibling = portBranches(document, port, branch.role).some(
        (candidate) =>
          candidate.id !== branch.id && beforeOrders.get(candidate.id) !== candidate.order,
      );
      if (normalizedSibling || portWasUnusable) {
        // Repairing an unusable order list re-keyed unrelated siblings; the
        // typed inverse would not restore them. Use the exact snapshot.
        return null;
      }
      return { type: 'branch.reorder', branchId: branch.id, toIndex: fromIndex };
    }

    case 'branch.relabel': {
      assertId(command.branchId, 'branchId');
      const branch = branchOrFail(document, command.branchId);
      if (command.label !== null && typeof command.label !== 'string') {
        reject('invalid-command', 'label must be a string or null');
      }
      const previous = branch.label ?? null;
      if (command.label === null) delete branch.label;
      else branch.label = command.label;
      changes.branch(branch.id);
      return { type: 'branch.relabel', branchId: branch.id, label: previous };
    }

    case 'branch.makeHome': {
      assertId(command.branchId, 'branchId');
      const branch = branchOrFail(document, command.branchId);
      blockOrFail(document, branch.targetBlockId);
      const oldPrimary = primaryParentBranch(document, branch.targetBlockId);
      if (oldPrimary === undefined) {
        // OD-7: a root has no primary parent to demote. Make home would be
        // ambiguous; Move here is the explicit command for this case.
        reject(
          'invalid-placement',
          'make home requires the target to have a primary parent; the target is already a root, use Move here',
        );
      }
      if (sameExactPair(branch, oldPrimary)) {
        // Legacy drift: the same source-target pair exists in both roles.
        // Swapping them would preserve the duplicate, so reject before mutation.
        reject(
          'invalid-placement',
          'the same source and target already has a primary and a reference edge; resolve the duplicate first',
        );
      }
      assertPromotableReference(document, branch, oldPrimary);
      assertPairIsUnique(document, oldPrimary, new Set([branch.id, oldPrimary.id]));

      const targetChapterBefore = chapterIdForBlock(document, branch.targetBlockId);
      const sourceChapterBefore = chapterIdForBlock(document, branch.source.blockId);

      // Promote first: compute the order key while the branch is still a
      // reference, so it is appended at the end of the source's primary list.
      const promotedOrder = appendOrderKeyAtPort(
        document,
        portOf(branch.source),
        'primary',
        changes,
      );
      branch.role = 'primary';
      branch.order = promotedOrder;
      document.branches[branch.id] = branch;
      changes.branch(branch.id);

      const demotedOrder = appendOrderKeyAtPort(
        document,
        portOf(oldPrimary.source),
        'reference',
        changes,
      );
      oldPrimary.role = 'reference';
      oldPrimary.order = demotedOrder;
      document.branches[oldPrimary.id] = oldPrimary;
      changes.branch(oldPrimary.id);

      changes.block(branch.targetBlockId);
      changes.block(branch.source.blockId);
      changes.block(oldPrimary.source.blockId);
      for (const chapterId of [
        targetChapterBefore,
        sourceChapterBefore,
        chapterIdForBlock(document, branch.targetBlockId),
      ]) {
        if (chapterId !== null) changes.chapter(chapterId);
      }
      // Exact snapshot inverse: both branch records, roles, order keys and any
      // chapter-slot change are restored verbatim by `structure.restore`.
      return null;
    }

    case 'branch.moveHere': {
      assertId(command.branchId, 'branchId');
      const branch = branchOrFail(document, command.branchId);
      blockOrFail(document, branch.targetBlockId);
      const oldPrimary = primaryParentBranch(document, branch.targetBlockId);
      assertPromotableReference(document, branch, oldPrimary);

      let rootChapter: Chapter | null = null;
      let rootIndex = -1;
      if (oldPrimary === undefined) {
        // The target is a root: attaching it to the new source removes its
        // chapter slot. Never strand the chapter with zero top-level blocks.
        const placement = findTopLevelPlacement(document, branch.targetBlockId);
        if (placement === null) {
          reject('internal-invariant', 'target root is not assigned to a chapter');
        }
        rootChapter = chapterOrFail(document, placement.chapterId);
        if (rootChapter.topLevelBlockIds.length === 1) {
          rejectEmptyChapter(rootChapter, 'move');
        }
        rootIndex = placement.index;
      }

      const targetChapterBefore = chapterIdForBlock(document, branch.targetBlockId);
      const sourceChapterBefore = chapterIdForBlock(document, branch.source.blockId);

      if (oldPrimary !== undefined) {
        delete document.branches[oldPrimary.id];
        changes.branch(oldPrimary.id);
        changes.block(oldPrimary.source.blockId);
      }
      if (rootChapter !== null) {
        rootChapter.topLevelBlockIds.splice(rootIndex, 1);
        changes.chapter(rootChapter.id);
      }
      // Append after removing the old primary so the promoted branch lands at
      // the end of the source port's primary list, never reusing a stale key.
      branch.role = 'primary';
      branch.order = appendOrderKeyAtPort(document, portOf(branch.source), 'primary', changes);
      document.branches[branch.id] = branch;
      changes.branch(branch.id);
      changes.block(branch.targetBlockId);
      changes.block(branch.source.blockId);
      for (const chapterId of [
        targetChapterBefore,
        sourceChapterBefore,
        chapterIdForBlock(document, branch.targetBlockId),
      ]) {
        if (chapterId !== null) changes.chapter(chapterId);
      }
      // Exact snapshot restores the retired old primary branch with its ID,
      // source, order and the target's original chapter slot.
      return null;
    }

    case 'branch.demote': {
      assertId(command.branchId, 'branchId');
      const branch = branchOrFail(document, command.branchId);
      if (branch.role !== 'primary') {
        reject('invalid-command', 'only a primary branch can be demoted to reference');
      }
      blockOrFail(document, branch.targetBlockId);
      if (findTopLevelPlacement(document, branch.targetBlockId) !== null) {
        reject(
          'internal-invariant',
          'a top-level block already has no primary parent; it cannot be demoted',
        );
      }
      assertPairIsUnique(document, branch, new Set([branch.id]));

      const sourceRoot = topLevelAncestorId(document, branch.source.blockId);
      const placement = findTopLevelPlacement(document, sourceRoot);
      if (placement === null) {
        reject('internal-invariant', 'source block has no chapter assignment');
      }
      const chapter = chapterOrFail(document, placement.chapterId);
      const targetChapterBefore = chapterIdForBlock(document, branch.targetBlockId);

      branch.role = 'reference';
      branch.order = appendOrderKeyAtPort(
        document,
        portOf(branch.source),
        'reference',
        changes,
      );
      document.branches[branch.id] = branch;
      changes.branch(branch.id);

      // The target becomes a root directly after its former top-level
      // ancestor, keeping its subtree intact.
      chapter.topLevelBlockIds.splice(placement.index + 1, 0, branch.targetBlockId);
      changes.chapter(chapter.id);
      changes.block(branch.targetBlockId);
      changes.block(branch.source.blockId);
      changes.block(sourceRoot);
      if (targetChapterBefore !== null) changes.chapter(targetChapterBefore);
      // Exact snapshot restores the primary role, order key and chapter slot.
      return null;
    }

    case 'structure.restore': {
      return restoreRecords(document, command, changes);
    }

    default: {
      const unreachable = command as { type?: unknown };
      return reject('invalid-command', `unknown command type: ${String(unreachable.type)}`);
    }
  }
}

function promoteChildren(
  document: Document,
  blockId: string,
  context: CoreContext,
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
  // The promoted children attach to the deleted block's primary parent,
  // whether that parent edge starts at a block or at an anchor. A formerly
  // anchored child gets a fresh branch record (C9); direct children keep their
  // branch IDs. No target is left unreachable, and the undo snapshot restores
  // the old anchored branches with their original IDs.
  const parentPort = portOf(incoming.source);
  const parentSiblings = portBranches(document, parentPort, 'primary');
  const deletedIndex = parentSiblings.findIndex((branch) => branch.id === incoming.id);
  delete document.branches[incoming.id];
  changes.branch(incoming.id);
  for (const branch of childBranches) delete document.branches[branch.id];
  const insertionIndex = Math.max(0, deletedIndex);
  const orders = orderKeysForPortIndex(
    document,
    parentPort,
    'primary',
    insertionIndex,
    childBranches.length,
    changes,
  );
  for (const [index, branch] of childBranches.entries()) {
    const order = orders[index] ?? orderBetween(null, null);
    if (branch.source.anchorId !== undefined) {
      const promoted = createPortBranchRecord(
        document,
        context,
        changes,
        parentPort,
        branch.targetBlockId,
        'primary',
        order,
        undefined,
        false,
      );
      if (branch.label !== undefined) promoted.label = branch.label;
    } else {
      branch.source =
        parentPort.anchorId === undefined
          ? { blockId: parentPort.blockId }
          : { blockId: parentPort.blockId, anchorId: parentPort.anchorId };
      branch.order = order;
      document.branches[branch.id] = branch;
      changes.branch(branch.id);
    }
    changes.block(branch.targetBlockId);
  }
  changes.block(parentPort.blockId);
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

/** Canonical JSON with sorted keys, used for record comparison. */
function canonicalJson(value: unknown): string {
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

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}

function canonicalBlockState(block: ContentBlock): string {
  const copy = structuredClone(block);
  delete copy.updatedAt;
  return canonicalJson(copy);
}

/**
 * Snapshot that transforms `current` into `target` structurally.
 *
 * Only records that differ are named: blocks missing from `current` are
 * restored, blocks missing from `target` are removed, changed branches are
 * restored verbatim (this is how a move gets its exact order key back), and
 * chapters whose top-level order changed get the exact target list. Surviving
 * block content is never touched, so text typed between a command and its undo
 * or redo survives. Chapter records themselves cannot be added or removed here;
 * callers that need that (chapter.delete) get no snapshot.
 */
function captureStructuralDelta(
  current: Document,
  target: Document,
): StructureRestoreCommand | null {
  const blocks: ContentBlock[] = [];
  const replaceBlocks: ContentBlock[] = [];
  const expectedReplaceBlocks: ContentBlock[] = [];
  for (const [blockId, block] of Object.entries(target.blocks)) {
    const existing = own(current.blocks, blockId);
    if (existing === undefined) blocks.push(structuredClone(block));
    else if (canonicalJson(existing) !== canonicalJson(block)) {
      replaceBlocks.push(structuredClone(block));
      expectedReplaceBlocks.push(structuredClone(existing));
    }
  }
  const removeBlocks = Object.keys(current.blocks).filter(
    (blockId) => own(target.blocks, blockId) === undefined,
  );

  const branches: Branch[] = [];
  for (const [branchId, branch] of Object.entries(target.branches)) {
    const existing = own(current.branches, branchId);
    if (existing === undefined || canonicalJson(existing) !== canonicalJson(branch)) {
      branches.push(structuredClone(branch));
    }
  }
  const removeBranches = Object.keys(current.branches).filter(
    (branchId) => own(target.branches, branchId) === undefined,
  );

  const anchors: Anchor[] = [];
  for (const [anchorId, anchor] of Object.entries(target.anchors)) {
    const existing = own(current.anchors, anchorId);
    if (existing === undefined || canonicalJson(existing) !== canonicalJson(anchor)) {
      anchors.push(structuredClone(anchor));
    }
  }
  const removeAnchors = Object.keys(current.anchors).filter(
    (anchorId) => own(target.anchors, anchorId) === undefined,
  );

  const chapters: Array<{ chapterId: string; topLevelBlockIds: string[] }> = [];
  if (current.chapters.length !== target.chapters.length) return null;
  for (const chapter of target.chapters) {
    const existing = current.chapters.find((candidate) => candidate.id === chapter.id);
    if (existing === undefined) return null;
    if (!sameStringList(existing.topLevelBlockIds, chapter.topLevelBlockIds)) {
      chapters.push({
        chapterId: chapter.id,
        topLevelBlockIds: [...chapter.topLevelBlockIds],
      });
    }
  }

  const breaksChanged = !sameStringList(
    current.manualBreakBeforeBlockIds,
    target.manualBreakBeforeBlockIds,
  );
  if (
    blocks.length === 0 &&
    replaceBlocks.length === 0 &&
    removeBlocks.length === 0 &&
    branches.length === 0 &&
    removeBranches.length === 0 &&
    anchors.length === 0 &&
    removeAnchors.length === 0 &&
    chapters.length === 0 &&
    !breaksChanged
  ) {
    return null;
  }

  const restore: StructureRestoreCommand = {
    type: 'structure.restore',
    blocks,
    branches,
    anchors,
    chapters,
  };
  if (replaceBlocks.length > 0) restore.replaceBlocks = replaceBlocks;
  if (expectedReplaceBlocks.length > 0) restore.expectedReplaceBlocks = expectedReplaceBlocks;
  if (removeBlocks.length > 0) restore.removeBlocks = removeBlocks;
  if (removeBranches.length > 0) restore.removeBranches = removeBranches;
  if (removeAnchors.length > 0) restore.removeAnchors = removeAnchors;
  if (breaksChanged) {
    restore.manualBreakBeforeBlockIds = [...target.manualBreakBeforeBlockIds];
  }
  return restore;
}

/**
 * Build the exact inverse of a structural command by diffing the post-state
 * against the pre-state. Destructive deletes keep their original command as
 * redo; move and branch-create snapshots derive redo from the diff so the
 * branch ID, order key and chapter slot are reproduced exactly.
 */
function captureRestoreCommand(
  before: Document,
  after: Document,
  command: DocumentCommand,
): DocumentCommand | null {
  const destructive = command.type === 'block.delete' || command.type === 'branch.delete';
  const snapshot =
    destructive ||
    command.type === 'block.move' ||
    command.type === 'branch.create' ||
    command.type === 'branch.createFromSelection' ||
    command.type === 'branch.makeHome' ||
    command.type === 'branch.moveHere' ||
    command.type === 'branch.demote' ||
    command.type === 'anchor.create' ||
    command.type === 'anchor.repair' ||
    command.type === 'anchor.attachToBlock' ||
    command.type === 'anchor.delete' ||
    command.type === 'branch.reorder' ||
    command.type === 'structure.restore';
  if (!snapshot) return null;
  const restore = captureStructuralDelta(after, before);
  if (restore === null) return null;
  if (destructive) restore.redoCommand = structuredClone(command);
  return restore;
}

function assertRestoreObject(value: unknown, what: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    reject('invalid-command', `${what} must be an object`);
  }
}

function assertRestoreRedo(command: unknown): asserts command is DocumentCommand {
  assertRestoreObject(command, 'structure.restore.redoCommand');
  const type = command['type'];
  if (type !== 'block.delete' && type !== 'branch.delete') {
    reject(
      'invalid-command',
      'structure.restore.redoCommand must be a block.delete or branch.delete command',
    );
  }
}

function assertRestoreIdList(value: unknown, what: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
    reject('invalid-command', `${what} must be an array of strings`);
  }
  const seen = new Set<string>();
  for (const id of value) {
    assertId(id, what);
    if (seen.has(id)) reject('duplicate-id', `${what} lists "${id}" twice`);
    seen.add(id);
  }
  return value as string[];
}

/**
 * Apply a record-level restore. Records are restored verbatim, except a branch
 * whose ID already exists (promote repoints child branches in place, a move
 * reorders one in place): it is overwritten only when the branch identity
 * (target and role) still matches.
 */
function restoreRecords(
  document: Document,
  command: StructureRestoreCommand,
  changes: ChangeSet,
): DocumentCommand | null {
  if (command.redoCommand !== undefined) assertRestoreRedo(command.redoCommand);
  if (
    !Array.isArray(command.blocks) ||
    (command.replaceBlocks !== undefined && !Array.isArray(command.replaceBlocks)) ||
    (command.expectedReplaceBlocks !== undefined &&
      !Array.isArray(command.expectedReplaceBlocks)) ||
    !Array.isArray(command.branches) ||
    !Array.isArray(command.anchors) ||
    !Array.isArray(command.chapters)
  ) {
    reject('invalid-command', 'structure.restore records must be arrays');
  }

  const replaceBlocks = command.replaceBlocks ?? [];
  const expectedReplaceBlocks = command.expectedReplaceBlocks ?? [];
  const expectedById = new Map<string, ContentBlock>();
  for (const block of expectedReplaceBlocks) {
    assertRestoreObject(block, 'expected replaced block');
    assertId(block.id, 'expected replaced block ID');
    if (expectedById.has(block.id)) {
      reject('duplicate-id', `block "${block.id}" appears twice in the expectation list`);
    }
    expectedById.set(block.id, block);
  }
  for (const block of replaceBlocks) {
    if (expectedById.size > 0 && !expectedById.has(block.id)) {
      reject(
        'invalid-command',
        `replaced block "${block.id}" is missing its post-command expectation`,
      );
    }
  }

  const removeBlocks = assertRestoreIdList(command.removeBlocks, 'structure.restore.removeBlocks');
  const removeBranches = assertRestoreIdList(
    command.removeBranches,
    'structure.restore.removeBranches',
  );
  const removeAnchors = assertRestoreIdList(
    command.removeAnchors,
    'structure.restore.removeAnchors',
  );
  const removeBlockSet = new Set(removeBlocks);
  const removeBranchSet = new Set(removeBranches);
  const removeAnchorSet = new Set(removeAnchors);
  const restoreBranchSet = new Set<string>();

  if (replaceBlocks.length > 0) {
    const seenReplace = new Set<string>();
    for (const block of replaceBlocks) {
      assertRestoreObject(block, 'replaced block');
      assertId(block.id, 'replaced block ID');
      if (seenReplace.has(block.id)) {
        reject('duplicate-id', `block "${block.id}" appears twice in the replacement list`);
      }
      seenReplace.add(block.id);
      if (removeBlockSet.has(block.id)) {
        reject('invalid-command', `block "${block.id}" cannot be replaced and removed at once`);
      }
      if (command.blocks.some((restored) => restored.id === block.id)) {
        reject('invalid-command', `block "${block.id}" cannot be restored and replaced at once`);
      }
    }
  }

  for (const block of command.blocks) {
    assertRestoreObject(block, 'restored block');
    if (removeBlockSet.has(block.id)) {
      reject('invalid-command', `block "${block.id}" cannot be restored and removed at once`);
    }
  }
  for (const branch of command.branches) {
    assertRestoreObject(branch, 'restored branch');
    if (removeBranchSet.has(branch.id)) {
      reject('invalid-command', `branch "${branch.id}" cannot be restored and removed at once`);
    }
    restoreBranchSet.add(branch.id);
  }
  for (const anchor of command.anchors) {
    assertRestoreObject(anchor, 'restored anchor');
    if (removeAnchorSet.has(anchor.id)) {
      reject('invalid-command', `anchor "${anchor.id}" cannot be restored and removed at once`);
    }
  }

  for (const blockId of removeBlocks) {
    blockOrFail(document, blockId);
    for (const branch of Object.values(document.branches)) {
      const touchesBlock =
        branch.source.blockId === blockId || branch.targetBlockId === blockId;
      // A restored branch record may repoint away from the removed block.
      if (
        touchesBlock &&
        !removeBranchSet.has(branch.id) &&
        !restoreBranchSet.has(branch.id)
      ) {
        reject(
          'invalid-command',
          `cannot remove block "${blockId}": branch "${branch.id}" also references it`,
        );
      }
    }
    for (const anchor of Object.values(document.anchors)) {
      if (anchor.blockId === blockId && !removeAnchorSet.has(anchor.id)) {
        reject(
          'invalid-command',
          `cannot remove block "${blockId}": anchor "${anchor.id}" also references it`,
        );
      }
    }
  }
  for (const branchId of removeBranches) branchOrFail(document, branchId);
  for (const anchorId of removeAnchors) {
    if (own(document.anchors, anchorId) === undefined) {
      reject('not-found', `anchor "${anchorId}" does not exist`);
    }
  }

  // Removals come first so a restored record can reuse an ID freed by this
  // same snapshot (move redo removes the branch the undo restored).
  for (const branchId of removeBranches) {
    delete document.branches[branchId];
    changes.branch(branchId);
  }
  for (const anchorId of removeAnchors) {
    delete document.anchors[anchorId];
    changes.anchor(anchorId);
  }
  for (const blockId of removeBlocks) {
    delete document.blocks[blockId];
    changes.block(blockId);
  }

  const usedIds = allIds(document);

  for (const block of replaceBlocks) {
    assertRestoreObject(block, 'replaced block');
    assertId(block.id, 'replaced block ID');
    const currentBlock = own(document.blocks, block.id);
    if (currentBlock === undefined) {
      reject('not-found', `cannot replace block "${block.id}": it does not exist`);
    }
    const expected = expectedById.get(block.id);
    if (expected !== undefined && canonicalBlockState(currentBlock) !== canonicalBlockState(expected)) {
      reject(
        'invalid-command',
        `block "${block.id}" changed after this command; undo the later edit first`,
      );
    }
    assertContent(block.content);
    document.blocks[block.id] = structuredClone(block);
    changes.block(block.id);
  }

  for (const block of command.blocks) {
    assertRestoreObject(block, 'restored block');
    assertId(block.id, 'restored block ID');
    if (usedIds.has(block.id)) {
      reject('duplicate-id', `cannot restore block "${block.id}": the ID is already used`);
    }
    assertContent(block.content);
    usedIds.add(block.id);
    document.blocks[block.id] = structuredClone(block);
    changes.block(block.id);
  }

  for (const branch of command.branches) {
    assertRestoreObject(branch, 'restored branch');
    assertId(branch.id, 'restored branch ID');
    assertRestoreObject(branch.source, 'restored branch source');
    assertId(branch.source.blockId, 'restored branch source block ID');
    assertId(branch.targetBlockId, 'restored branch target block ID');
    if (branch.role !== 'primary' && branch.role !== 'reference') {
      reject('invalid-command', 'restored branch role must be "primary" or "reference"');
    }
    if (typeof branch.order !== 'string' || branch.order.length === 0) {
      reject('invalid-command', 'restored branch order must be a non-empty string');
    }
    if (own(document.blocks, branch.source.blockId) === undefined) {
      reject('not-found', `cannot restore branch "${branch.id}": its source block is missing`);
    }
    if (own(document.blocks, branch.targetBlockId) === undefined) {
      reject('not-found', `cannot restore branch "${branch.id}": its target block is missing`);
    }
    const existing = own(document.branches, branch.id);
    if (existing !== undefined) {
      // The record identity is the branch ID plus its target. Role transitions
      // (`branch.makeHome`, `moveHere`, `demote`) and in-place repoints
      // (`block.move`, `block.delete promote`) overwrite the same record, so
      // the role and source may differ from the restored snapshot.
      if (existing.targetBlockId !== branch.targetBlockId) {
        reject(
          'duplicate-id',
          `cannot restore branch "${branch.id}": a different branch already uses the ID`,
        );
      }
      // `block.delete promote` and `block.move` repoint the same branch record
      // in place; the inverse repoints it back. A matching target identifies
      // that record, so a different source is the repoint itself.
    } else {
      if (usedIds.has(branch.id)) {
        reject('duplicate-id', `cannot restore branch "${branch.id}": the ID is already used`);
      }
      usedIds.add(branch.id);
    }
    document.branches[branch.id] = structuredClone(branch);
    changes.branch(branch.id);
    changes.block(branch.targetBlockId);
  }

  for (const anchor of command.anchors) {
    assertRestoreObject(anchor, 'restored anchor');
    assertId(anchor.id, 'restored anchor ID');
    assertId(anchor.blockId, 'restored anchor block ID');
    if (own(document.blocks, anchor.blockId) === undefined) {
      reject('not-found', `cannot restore anchor "${anchor.id}": its block is missing`);
    }
    const existingAnchor = own(document.anchors, anchor.id);
    if (existingAnchor !== undefined) {
      // Repair restores the same anchor record in place; a different kind or
      // block would be a different identity and is rejected.
      if (existingAnchor.kind !== anchor.kind || existingAnchor.blockId !== anchor.blockId) {
        reject(
          'duplicate-id',
          `cannot restore anchor "${anchor.id}": a different anchor already uses the ID`,
        );
      }
    } else {
      if (usedIds.has(anchor.id)) {
        reject('duplicate-id', `cannot restore anchor "${anchor.id}": the ID is already used`);
      }
      usedIds.add(anchor.id);
    }
    document.anchors[anchor.id] = structuredClone(anchor);
    changes.anchor(anchor.id);
  }

  const seenChapters = new Set<string>();
  for (const entry of command.chapters) {
    assertRestoreObject(entry, 'restored chapter placement');
    assertId(entry.chapterId, 'restored chapter ID');
    if (seenChapters.has(entry.chapterId)) {
      reject('duplicate-id', `chapter "${entry.chapterId}" appears twice in the restore`);
    }
    seenChapters.add(entry.chapterId);
    const chapter = chapterOrFail(document, entry.chapterId);
    if (
      !Array.isArray(entry.topLevelBlockIds) ||
      !entry.topLevelBlockIds.every((id) => typeof id === 'string')
    ) {
      reject('invalid-command', 'restored top-level block IDs must be an array of strings');
    }
    const seenBlocks = new Set<string>();
    for (const blockId of entry.topLevelBlockIds) {
      if (seenBlocks.has(blockId)) {
        reject('duplicate-id', `block "${blockId}" appears twice in the restored chapter`);
      }
      seenBlocks.add(blockId);
      if (own(document.blocks, blockId) === undefined) {
        reject('not-found', `restored top-level block "${blockId}" does not exist`);
      }
    }
    chapter.topLevelBlockIds = [...entry.topLevelBlockIds];
    changes.chapter(chapter.id);
  }

  if (command.manualBreakBeforeBlockIds !== undefined) {
    if (
      !Array.isArray(command.manualBreakBeforeBlockIds) ||
      !command.manualBreakBeforeBlockIds.every((id) => typeof id === 'string')
    ) {
      reject('invalid-command', 'restored manual break IDs must be an array of strings');
    }
    for (const blockId of command.manualBreakBeforeBlockIds) {
      if (own(document.blocks, blockId) === undefined) {
        reject('not-found', `restored manual break block "${blockId}" does not exist`);
      }
    }
    document.manualBreakBeforeBlockIds = [...command.manualBreakBeforeBlockIds];
  }

  return command.redoCommand === undefined ? null : structuredClone(command.redoCommand);
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
