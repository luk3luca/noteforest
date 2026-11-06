/**
 * Branch aggregate: create, create-from-selection, delete, reorder, relabel,
 * and the primary/reference role transitions makeHome, moveHere, and demote.
 */

import type { CoreContext } from '../ids.js';
import { isKnownAnchorKind } from '../anchors.js';
import {
  chapterIdForBlock,
  findTopLevelPlacement,
  primaryParentBranch,
  subtreeBlockIds,
  topLevelAncestorId,
} from '../structure.js';
import type {
  BranchRole,
  Chapter,
  ContentBlock,
  Document,
} from '../types.js';
import { ensureSelectionAnchor } from './anchor.js';
import {
  allIds,
  anchorOrFail,
  appendOrderKeyAtPort,
  assertContent,
  assertId,
  assertIndex,
  assertPairIsUnique,
  assertPromotableReference,
  blockOrFail,
  branchOrFail,
  chapterOrFail,
  collectSubtree,
  createPortBranchRecord,
  freshId,
  orderKeyForPortIndex,
  orderKeyForPortIndexInList,
  portBranches,
  portOf,
  portOrdersAreSane,
  reject,
  rejectEmptyChapter,
  removeBlocks,
  sameExactPair,
  samePort,
  type BranchPort,
  type ChangeSet,
} from './shared.js';
import type {
  BranchCreateCommand,
  BranchCreateFromSelectionCommand,
  BranchDeleteCommand,
  BranchDemoteCommand,
  BranchMakeHomeCommand,
  BranchMoveHereCommand,
  BranchRelabelCommand,
  BranchReorderCommand,
  DocumentCommand,
} from './types.js';

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

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function applyBranchCreate(
  document: Document,
  command: BranchCreateCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBranchCreateFromSelection(
  document: Document,
  command: BranchCreateFromSelectionCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBranchDelete(
  document: Document,
  command: BranchDeleteCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBranchReorder(
  document: Document,
  command: BranchReorderCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBranchRelabel(
  document: Document,
  command: BranchRelabelCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBranchMakeHome(
  document: Document,
  command: BranchMakeHomeCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBranchMoveHere(
  document: Document,
  command: BranchMoveHereCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBranchDemote(
  document: Document,
  command: BranchDemoteCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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
