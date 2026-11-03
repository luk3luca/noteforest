/**
 * Structural helpers over the canonical document. Pure functions only.
 *
 * The block tree is represented by **primary branch** records (docs/spec.md
 * §4.5–4.6). Chapters own the roots; every non-root block has exactly one
 * incoming primary branch. Reference branches are ignored by these helpers.
 */

import type { Branch, BranchSource, Document } from './types.js';

export function isPrimaryBranch(branch: Branch): boolean {
  return branch.role === 'primary' && branch.source.anchorId === undefined;
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
 * Sorted direct primary children of a block: anchored sources are excluded
 * from M2 sibling ordering and kept for forward compatibility.
 */
export function directChildBranches(document: Document, parentBlockId: string): Branch[] {
  return sortedBranches(
    primaryBranches(document).filter(
      (branch) => branch.source.blockId === parentBlockId && branch.source.anchorId === undefined,
    ),
  );
}

export function directChildIds(document: Document, parentBlockId: string): string[] {
  return directChildBranches(document, parentBlockId).map((branch) => branch.targetBlockId);
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

/** Every block ID in the primary subtree rooted at `blockId`, including it. */
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
