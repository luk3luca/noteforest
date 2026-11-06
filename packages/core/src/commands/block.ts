/**
 * Block aggregate: create, edit content, rename, delete, move, split, merge.
 *
 * Placement resolution, subtree detachment, child promotion, and the merge
 * record migration live here because only block commands use them.
 */

import { removeAnchorBinding } from '../anchors.js';
import { planBlockMerge, planBlockSplit } from '../block-ops.js';
import { orderBetween } from '../fractional-order.js';
import type { CoreContext } from '../ids.js';
import {
  chapterIdForBlock,
  compareBranches,
  directChildBranches,
  findTopLevelPlacement,
  primaryChildBranches,
  primaryParentBranch,
  subtreeBlockIds,
} from '../structure.js';
import type {
  Branch,
  BranchRole,
  ContentBlock,
  Document,
} from '../types.js';
import {
  allIds,
  anchorOrFail,
  appendBranchesToPort,
  assertContent,
  assertId,
  assertIndex,
  attachAsChild,
  blockOrFail,
  chapterOrFail,
  collectSubtree,
  createPortBranchRecord,
  freshId,
  orderKeyForPortIndexInList,
  orderKeysForPortIndex,
  own,
  portBranches,
  portOf,
  primaryDirectChildren,
  reject,
  rejectEmptyChapter,
  removeBlocks,
  type BranchPort,
  type ChangeSet,
} from './shared.js';
import type {
  BlockCreateCommand,
  BlockDeleteCommand,
  BlockEditContentCommand,
  BlockMergeCommand,
  BlockMoveCommand,
  BlockPlacement,
  BlockRenameCommand,
  BlockSplitCommand,
  DocumentCommand,
} from './types.js';

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

/**
 * Role-independent exact source-target duplicate (OD-3/A8), used after merge
 * retargeting. One edge survives: the primary edge if any, otherwise the
 * earliest by order then branch ID. Deleted records are reported as warnings.
 */
function dedupeExactBranches(
  document: Document,
  candidates: ReadonlySet<string>,
  changes: ChangeSet,
): void {
  if (candidates.size === 0) return;
  const groups = new Map<string, Branch[]>();
  for (const branch of Object.values(document.branches)) {
    const key = `${branch.source.blockId}\u0000${branch.source.anchorId ?? ''}\u0000${branch.targetBlockId}`;
    const group = groups.get(key) ?? [];
    group.push(branch);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (!group.some((branch) => candidates.has(branch.id))) continue;
    const ordered = [...group].sort(compareBranches);
    const primary = ordered.find((branch) => branch.role === 'primary');
    const keeper = primary ?? ordered[0];
    if (keeper === undefined) continue;
    for (const branch of ordered) {
      if (branch.id === keeper.id) continue;
      delete document.branches[branch.id];
      changes.branch(branch.id);
      changes.warn(
        `duplicate branch "${branch.id}" was removed by the merge; kept "${keeper.id}"`,
      );
    }
  }
}

/**
 * Re-key branches whose source moved to the surviving block. They append after
 * the destination port's existing branches, preserving their previous relative
 * order. Applies to primary children and reference edges alike.
 */
function appendMovedSourceBranches(
  document: Document,
  movedBranchIds: ReadonlySet<string>,
  changes: ChangeSet,
): void {
  const groups = new Map<string, { port: BranchPort; role: BranchRole; branches: Branch[] }>();
  for (const branchId of movedBranchIds) {
    const branch = own(document.branches, branchId);
    if (branch === undefined) continue;
    const port = portOf(branch.source);
    const key = `${branch.role}\u0000${port.blockId}\u0000${port.anchorId ?? ''}`;
    const group = groups.get(key) ?? { port, role: branch.role, branches: [] };
    group.branches.push(branch);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.branches.sort(compareBranches);
    appendBranchesToPort(document, group.port, group.role, group.branches, changes);
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

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export function applyBlockCreate(
  document: Document,
  command: BlockCreateCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBlockEditContent(
  document: Document,
  command: BlockEditContentCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.blockId, 'blockId');
  const block = blockOrFail(document, command.blockId);
  assertContent(command.content);
  const previous = block.content;
  block.content = structuredClone(command.content);
  block.updatedAt = context.now();
  changes.block(block.id);
  return { type: 'block.editContent', blockId: block.id, content: previous };
}

export function applyBlockRename(
  document: Document,
  command: BlockRenameCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBlockDelete(
  document: Document,
  command: BlockDeleteCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBlockMove(
  document: Document,
  command: BlockMoveCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
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

export function applyBlockSplit(
  document: Document,
  command: BlockSplitCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.blockId, 'blockId');
  const splitBlock = blockOrFail(document, command.blockId);
  const check = planBlockSplit(document, splitBlock.id, command.at);
  if (!check.ok) reject('invalid-content', check.reason);
  const plan = check.plan;
  if (command.newBlockId !== undefined) assertId(command.newBlockId, 'newBlockId');
  const newBlockId = command.newBlockId ?? freshId(document, context);
  if (allIds(document).has(newBlockId)) {
    reject('duplicate-id', `ID "${newBlockId}" already exists`);
  }

  const topLevel = findTopLevelPlacement(document, splitBlock.id);
  const incoming =
    topLevel === null ? primaryParentBranch(document, splitBlock.id) : undefined;
  if (topLevel === null && incoming === undefined) {
    reject('internal-invariant', 'split block has no parent port or chapter slot');
  }

  const stay = new Set(plan.stayAnchorIds);
  const moved = new Set(plan.moveAnchorIds);
  const spanning = new Set(plan.spanAnchorIds);
  let before = plan.before;
  let after = plan.after;
  for (const anchorId of stay) after = removeAnchorBinding(after, anchorId);
  for (const anchorId of moved) before = removeAnchorBinding(before, anchorId);
  for (const anchorId of spanning) after = removeAnchorBinding(after, anchorId);

  const timestamp = context.now();
  splitBlock.content = before;
  splitBlock.updatedAt = timestamp;
  const newBlock: ContentBlock = {
    id: newBlockId,
    content: after,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  document.blocks[newBlockId] = newBlock;
  changes.block(splitBlock.id);
  changes.block(newBlockId);
  changes.createdBlock(newBlockId);

  for (const anchorId of moved) {
    const anchor = anchorOrFail(document, anchorId);
    anchor.blockId = newBlockId;
    changes.anchor(anchor.id);
  }
  for (const anchorId of spanning) {
    const anchor = anchorOrFail(document, anchorId);
    const flags = Array.isArray(anchor.repairFlags)
      ? anchor.repairFlags.filter((flag): flag is string => typeof flag === 'string')
      : [];
    anchor.repairFlags = [...new Set([...flags, 'split-inside-anchor'])].sort();
    changes.anchor(anchor.id);
    changes.warn(
      `anchor "${anchor.id}" spans the split; kept its ID and flagged it for repair`,
    );
  }
  for (const branch of Object.values(document.branches)) {
    const anchorId = branch.source.anchorId;
    if (anchorId === undefined || !moved.has(anchorId)) continue;
    branch.source = { ...branch.source, blockId: newBlockId };
    changes.branch(branch.id);
    changes.block(newBlockId);
  }

  if (topLevel !== null) {
    const chapter = chapterOrFail(document, topLevel.chapterId);
    chapter.topLevelBlockIds.splice(topLevel.index + 1, 0, newBlockId);
    changes.chapter(chapter.id);
  } else if (incoming !== undefined) {
    const port = portOf(incoming.source);
    const siblings = portBranches(document, port, 'primary');
    const index = siblings.findIndex((branch) => branch.id === incoming.id);
    const order = orderKeyForPortIndexInList(
      document,
      port,
      'primary',
      siblings,
      Math.max(0, index + 1),
      changes,
    );
    createPortBranchRecord(
      document,
      context,
      changes,
      port,
      newBlockId,
      'primary',
      order,
    );
    changes.block(incoming.source.blockId);
  }

  // Content split, IDs, anchors, branches, and slots are all repointed; only
  // an exact snapshot can restore the pre-split record identity.
  return null;
}

export function applyBlockMerge(
  document: Document,
  command: BlockMergeCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.blockId, 'blockId');
  blockOrFail(document, command.blockId);
  if (command.intoBlockId !== undefined) assertId(command.intoBlockId, 'intoBlockId');
  const check = planBlockMerge(document, command.blockId, command.intoBlockId);
  if (!check.ok) reject('invalid-placement', check.reason);
  const plan = check.plan;
  const merged = blockOrFail(document, plan.blockId);
  const survivor = blockOrFail(document, plan.intoBlockId);
  const timestamp = context.now();

  const content = structuredClone(survivor.content);
  content.children = [
    ...(content.children ?? []).map((child) => structuredClone(child)),
    ...(merged.content.children ?? []).map((child) => structuredClone(child)),
  ];
  survivor.content = content;
  survivor.updatedAt = timestamp;
  changes.block(survivor.id);
  changes.block(merged.id);

  for (const anchor of Object.values(document.anchors)) {
    if (anchor.blockId !== merged.id) continue;
    anchor.blockId = survivor.id;
    changes.anchor(anchor.id);
  }

  const incoming = primaryParentBranch(document, merged.id);
  if (incoming !== undefined) {
    delete document.branches[incoming.id];
    changes.branch(incoming.id);
    changes.block(incoming.source.blockId);
  }

  const retargeted = new Set<string>();
  const movedSource = new Set<string>();
  for (const branch of Object.values(document.branches)) {
    if (branch.targetBlockId === merged.id) {
      // The merged block's own primary edge was removed above; only
      // reference edges pointing at it can be retargeted.
      if (branch.role === 'reference') {
        branch.targetBlockId = survivor.id;
        retargeted.add(branch.id);
        changes.branch(branch.id);
        changes.block(survivor.id);
      }
    }
    if (branch.source.blockId === merged.id) {
      branch.source = { ...branch.source, blockId: survivor.id };
      movedSource.add(branch.id);
      retargeted.add(branch.id);
      changes.branch(branch.id);
      changes.block(survivor.id);
    }
  }

  for (const branchId of [...retargeted]) {
    const branch = own(document.branches, branchId);
    if (branch === undefined) continue;
    if (branch.source.blockId === branch.targetBlockId) {
      delete document.branches[branchId];
      changes.branch(branchId);
      retargeted.delete(branchId);
      movedSource.delete(branchId);
      changes.warn(`self-branch "${branchId}" was dropped by the merge`);
    }
  }

  dedupeExactBranches(document, retargeted, changes);
  appendMovedSourceBranches(document, movedSource, changes);

  for (const chapter of document.chapters) {
    const index = chapter.topLevelBlockIds.indexOf(merged.id);
    if (index < 0) continue;
    chapter.topLevelBlockIds.splice(index, 1);
    changes.chapter(chapter.id);
  }
  if (document.manualBreakBeforeBlockIds.includes(merged.id)) {
    document.manualBreakBeforeBlockIds = document.manualBreakBeforeBlockIds.filter(
      (blockId) => blockId !== merged.id,
    );
  }
  delete document.blocks[merged.id];
  changes.block(merged.id);

  // Delete/repoint/re-key plus content append: undo must restore both
  // blocks and every migrated record in one exact snapshot.
  return null;
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
