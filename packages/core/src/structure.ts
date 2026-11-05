/**
 * Structural helpers over the canonical document. Pure functions only.
 *
 * The block tree is represented by **primary branch** records (docs/spec.md
 * §4.5–4.6). Chapters own the roots; every non-root block has exactly one
 * incoming primary branch. A primary branch may start at a block or at an
 * anchor inside it. Reference branches are ignored by these helpers.
 */

import { compareAnchorResolutions, resolveAnchor } from './anchors.js';
import type { Branch, BranchSource, Document } from './types.js';

export function isPrimaryBranch(branch: Branch): boolean {
  return branch.role === 'primary';
}

export function compareBranches(left: Branch, right: Branch): number {
  if (left.order !== right.order) return left.order < right.order ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function sortedBranches(branches: readonly Branch[]): Branch[] {
  return [...branches].sort(compareBranches);
}

/** All primary branches, including anchored edges (M3 data kept on load). */
export function primaryBranches(document: Document): Branch[] {
  return Object.values(document.branches).filter((branch) => branch.role === 'primary');
}

/** Primary incoming edge for a block, if any. Assumes a valid document. */
export function primaryParentBranch(document: Document, blockId: string): Branch | undefined {
  return primaryBranches(document).find((branch) => branch.targetBlockId === blockId);
}

/**
 * Sorted direct primary children of a block: only branches whose source is the
 * block itself. Anchored primary children belong to an anchor port and are
 * listed by {@link primaryChildBranches}.
 */
export function directChildBranches(document: Document, parentBlockId: string): Branch[] {
  return sortedBranches(
    primaryBranches(document).filter(
      (branch) => branch.source.blockId === parentBlockId && branch.source.anchorId === undefined,
    ),
  );
}

/**
 * Anchored primary branches of a block grouped by anchor, in deterministic
 * order: anchor content order (resolved position, then anchor ID), then branch
 * order inside each anchor (D3).
 */
export function anchoredChildBranches(document: Document, parentBlockId: string): Branch[] {
  const byAnchor = new Map<string, Branch[]>();
  for (const branch of primaryBranches(document)) {
    if (branch.source.blockId !== parentBlockId) continue;
    const anchorId = branch.source.anchorId;
    if (anchorId === undefined) continue;
    const list = byAnchor.get(anchorId) ?? [];
    list.push(branch);
    byAnchor.set(anchorId, list);
  }
  const anchorIds = [...byAnchor.keys()].sort((left, right) => {
    const order = compareAnchorResolutions(
      resolveAnchor(document, left),
      resolveAnchor(document, right),
    );
    if (order !== 0) return order;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const result: Branch[] = [];
  for (const anchorId of anchorIds) {
    result.push(...sortedBranches(byAnchor.get(anchorId) ?? []));
  }
  return result;
}

/**
 * Every primary child of a block in outline order: anchored primary children
 * first, then direct primary children (D3). Used by traversal, cycle checks,
 * subtree deletion, and outline consumers.
 */
export function primaryChildBranches(document: Document, parentBlockId: string): Branch[] {
  return [
    ...anchoredChildBranches(document, parentBlockId),
    ...directChildBranches(document, parentBlockId),
  ];
}

/** Primary child block IDs in outline order (anchored first, then direct). */
export function directChildIds(document: Document, parentBlockId: string): string[] {
  return primaryChildBranches(document, parentBlockId).map((branch) => branch.targetBlockId);
}

export interface TopLevelPlacement {
  chapterId: string;
  chapterIndex: number;
  index: number;
}

export function findTopLevelPlacement(
  document: Document,
  blockId: string,
): TopLevelPlacement | null {
  for (const [chapterIndex, chapter] of document.chapters.entries()) {
    const index = chapter.topLevelBlockIds.indexOf(blockId);
    if (index >= 0) return { chapterId: chapter.id, chapterIndex, index };
  }
  return null;
}

/** Root block of a block, following primary parents. Assumes a valid document. */
export function topLevelAncestorId(document: Document, blockId: string): string {
  const seen = new Set<string>();
  let current = blockId;
  for (;;) {
    if (seen.has(current)) return blockId;
    seen.add(current);
    const parent = primaryParentBranch(document, current);
    if (parent === undefined) return current;
    current = parent.source.blockId;
  }
}

export function chapterIdForBlock(document: Document, blockId: string): string | null {
  const root = topLevelAncestorId(document, blockId);
  return findTopLevelPlacement(document, root)?.chapterId ?? null;
}

/**
 * Every block ID in the primary subtree rooted at `blockId`, including it.
 * Follows direct **and anchored** primary branches: an anchored child is never
 * unreachable to delete, move, or cycle detection.
 */
export function subtreeBlockIds(document: Document, blockId: string): string[] {
  const result: string[] = [];
  const stack = [blockId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    result.push(current);
    const children = directChildIds(document, current);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) stack.push(child);
    }
  }
  return result;
}

export function isDescendantOf(
  document: Document,
  ancestorBlockId: string,
  candidateBlockId: string,
): boolean {
  return subtreeBlockIds(document, ancestorBlockId).includes(candidateBlockId);
}

export function branchSourceKey(source: BranchSource, role: Branch['role']): string {
  return `${role}\u0000${source.blockId}\u0000${source.anchorId ?? ''}`;
}

/** Convenience for callers that need a branch map entry. */
export function getBranch(document: Document, branchId: string): Branch | undefined {
  return document.branches[branchId];
}
