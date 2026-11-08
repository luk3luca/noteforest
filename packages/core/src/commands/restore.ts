/**
 * Structural record restore: the exact snapshot inverse for commands whose
 * identity (IDs, timestamps, order keys, chapter slots) cannot be reproduced by
 * a second command invocation.
 *
 * `captureRestoreCommand` diffs the pre/post state; `structure.restore` writes
 * the named records verbatim and returns the stored redo command when the
 * snapshot came from a destructive delete.
 */

import type { CoreContext } from '../ids.js';
import type { Anchor, Branch, ContentBlock, Document } from '../types.js';
import type { ChangeSet } from './shared.js';
import {
  allIds,
  assertContent,
  assertId,
  blockOrFail,
  branchOrFail,
  canonicalJson,
  chapterOrFail,
  own,
  reject,
} from './shared.js';
import type { DocumentCommand, StructureRestoreCommand } from './types.js';

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

  if (
    blocks.length === 0 &&
    replaceBlocks.length === 0 &&
    removeBlocks.length === 0 &&
    branches.length === 0 &&
    removeBranches.length === 0 &&
    anchors.length === 0 &&
    removeAnchors.length === 0 &&
    chapters.length === 0
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
  return restore;
}

/**
 * Build the exact inverse of a structural command by diffing the post-state
 * against the pre-state. Destructive deletes keep their original command as
 * redo; move and branch-create snapshots derive redo from the diff so the
 * branch ID, order key and chapter slot are reproduced exactly.
 */
export function captureRestoreCommand(
  before: Document,
  after: Document,
  command: DocumentCommand,
): DocumentCommand | null {
  const destructive = command.type === 'block.delete' || command.type === 'branch.delete';
  const snapshot =
    destructive ||
    command.type === 'block.move' ||
    command.type === 'block.split' ||
    command.type === 'block.merge' ||
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
 * Apply a record-level restore. Records are restored verbatim. A branch whose
 * ID already exists is overwritten in place: the branch ID is the identity and
 * role, source, target, and order may all change on a legitimate repoint
 * (move, make-home, merge) that the snapshot is reversing.
 */
export function restoreRecords(
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
  const restoreAnchorSet = new Set<string>();

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
    restoreAnchorSet.add(anchor.id);
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
      if (
        anchor.blockId === blockId &&
        !removeAnchorSet.has(anchor.id) &&
        !restoreAnchorSet.has(anchor.id)
      ) {
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
      // The branch ID is the identity. Role transitions, moves, and merge
      // retargeting repoint the same record in place; the exact snapshot may
      // legitimately change its source, target, or role on undo/redo.
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
      // Repair restores the same anchor record in place; split/merge undo also
      // moves the same identity between blocks (ID-2), so `blockId` may differ.
      // Kind is the immutable part of the identity.
      if (existingAnchor.kind !== anchor.kind) {
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

  return command.redoCommand === undefined ? null : structuredClone(command.redoCommand);
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export function applyStructureRestore(
  document: Document,
  command: StructureRestoreCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  return restoreRecords(document, command, changes);
}
