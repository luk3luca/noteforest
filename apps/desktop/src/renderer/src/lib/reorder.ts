/**
 * Pure sibling-reorder checks.
 *
 * A block reorders inside one **port**: the children of the parent block, or
 * the children of one anchor inside it. The outline-order union
 * (`siblingIds`) is a navigation list, not a reorder list: an anchored callout
 * and a direct child of the same parent sit in different order spaces, and a
 * reorder cannot cross between them. Changing parents stays `Move to…`.
 *
 * The Position menu, the Alt+Arrow keybinding, and drag share this rule and the
 * same `block.move` path in core (F1).
 */

import type { Document } from '@noteforest/core';
import {
  chapterIdForBlock,
  primaryParentBranch,
  sortedBranches,
} from '@noteforest/core';

export type ReorderTarget =
  | { ok: true; targetBlockId: string }
  | { ok: false; reason: string };

/**
 * Primary sibling block IDs in one reorder group, sorted by branch order then
 * branch ID: the parent's direct children, one anchor's children, or the
 * chapter's top-level blocks.
 */
export function siblingGroupIds(document: Document, blockId: string): string[] {
  const incoming = primaryParentBranch(document, blockId);
  if (incoming === undefined) {
    for (const chapter of document.chapters) {
      if (chapter.topLevelBlockIds.includes(blockId)) return [...chapter.topLevelBlockIds];
    }
    return [];
  }
  return sortedBranches(
    Object.values(document.branches).filter(
      (branch) =>
        branch.role === 'primary' &&
        branch.source.blockId === incoming.source.blockId &&
        branch.source.anchorId === incoming.source.anchorId,
    ),
  ).map((branch) => branch.targetBlockId);
}

/** The neighbour Move up/down would swap with, or why there is none. */
export function reorderTarget(
  document: Document,
  blockId: string,
  direction: -1 | 1,
): ReorderTarget {
  const siblings = siblingGroupIds(document, blockId);
  const index = siblings.indexOf(blockId);
  if (index < 0) {
    return { ok: false, reason: 'This block is not in the current chapter.' };
  }
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= siblings.length) {
    return {
      ok: false,
      reason:
        direction < 0
          ? 'Already the first block in this group.'
          : 'Already the last block in this group.',
    };
  }
  const target = siblings[targetIndex];
  if (target === undefined) return { ok: false, reason: 'No sibling to reorder against.' };
  return { ok: true, targetBlockId: target };
}

/**
 * Why a drag reorder from `sourceId` to `targetId` is unavailable, or null when
 * the two blocks share one reorder group.
 */
export function reorderPairReason(
  document: Document,
  sourceId: string,
  targetId: string,
): string | null {
  if (sourceId === targetId) return 'A block cannot be reordered against itself.';
  if (document.blocks[sourceId] === undefined || document.blocks[targetId] === undefined) {
    return 'The block is no longer in this document.';
  }
  const source = primaryParentBranch(document, sourceId);
  const target = primaryParentBranch(document, targetId);
  if (source === undefined || target === undefined) {
    if (source !== undefined || target !== undefined) return 'Only siblings can be reordered.';
    return chapterIdForBlock(document, sourceId) === chapterIdForBlock(document, targetId)
      ? null
      : 'Only blocks in the same chapter can be reordered.';
  }
  if (source.source.blockId !== target.source.blockId) return 'Only siblings can be reordered.';
  const sourceAnchor = source.source.anchorId ?? null;
  const targetAnchor = target.source.anchorId ?? null;
  if (sourceAnchor === targetAnchor) return null;
  return sourceAnchor === null
    ? 'A block cannot reorder against an anchored callout; use Move to… instead.'
    : 'A callout reorders among the children of its own anchor; use Move to… instead.';
}

/** True when drag/reorder may move `sourceId` next to `targetId`. */
export function canReorderSibling(
  document: Document,
  sourceId: string,
  targetId: string,
): boolean {
  return reorderPairReason(document, sourceId, targetId) === null;
}
