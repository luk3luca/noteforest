/**
 * Pure helpers over the canonical block tree (primary branches).
 * Used by the sidebar, the editor adapter, and keyboard navigation.
 */

import type { Branch, ContentBlock, ContentNode, Document } from '@noteforest/core';

export interface BlockNode {
  id: string;
  depth: number;
  topLevel: boolean;
  children: BlockNode[];
}

export interface ChapterNode {
  id: string;
  title: string;
  blocks: BlockNode[];
}

function compareBranches(left: Branch, right: Branch): number {
  if (left.order !== right.order) return left.order < right.order ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function directChildBranches(document: Document, parentId: string): Branch[] {
  return Object.values(document.branches)
    .filter(
      (branch) =>
        branch.role === 'primary' &&
        branch.source.blockId === parentId &&
        branch.source.anchorId === undefined,
    )
    .sort(compareBranches);
}

export function directChildIds(document: Document, parentId: string): string[] {
  return directChildBranches(document, parentId).map((branch) => branch.targetBlockId);
}

export function incomingBranch(document: Document, blockId: string): Branch | undefined {
  return Object.values(document.branches).find(
    (branch) => branch.role === 'primary' && branch.targetBlockId === blockId,
  );
}

export function parentIdOf(document: Document, blockId: string): string | null {
  return incomingBranch(document, blockId)?.source.blockId ?? null;
}

function buildBlocks(
  document: Document,
  ids: readonly string[],
  depth: number,
  seen: Set<string>,
): BlockNode[] {
  const nodes: BlockNode[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    if (document.blocks[id] === undefined) continue;
    seen.add(id);
    nodes.push({
      id,
      depth,
      topLevel: depth === 0,
      children: buildBlocks(document, directChildIds(document, id), depth + 1, seen),
    });
  }
  return nodes;
}

export function buildChapterTrees(document: Document): ChapterNode[] {
  const seen = new Set<string>();
  return document.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title ?? 'Untitled chapter',
    blocks: buildBlocks(document, chapter.topLevelBlockIds, 0, seen),
  }));
}

/** Depth-first block order; the canonical reading order. */
export function flattenBlocks(document: Document): string[] {
  const result: string[] = [];
  const walk = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (result.includes(id)) continue;
      result.push(id);
      walk(directChildIds(document, id));
    }
  };
  for (const chapter of document.chapters) walk(chapter.topLevelBlockIds);
  return result;
}

/** Root → … → block (inclusive). */
export function ancestorPath(document: Document, blockId: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let current: string | null = blockId;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    path.unshift(current);
    current = parentIdOf(document, current);
  }
  return path;
}

export function subtreeIds(document: Document, blockId: string): string[] {
  const result: string[] = [];
  const walk = (id: string): void => {
    if (result.includes(id)) return;
    result.push(id);
    for (const child of directChildIds(document, id)) walk(child);
  };
  walk(blockId);
  return result;
}

export function isDescendantOf(document: Document, candidate: string, ancestor: string): boolean {
  return ancestorPath(document, candidate).includes(ancestor);
}

export function siblingIds(document: Document, blockId: string): string[] {
  const parent = parentIdOf(document, blockId);
  if (parent !== null) return directChildIds(document, parent);
  for (const chapter of document.chapters) {
    if (chapter.topLevelBlockIds.includes(blockId)) return [...chapter.topLevelBlockIds];
  }
  return [];
}

export function positionInSiblings(document: Document, blockId: string): number {
  return siblingIds(document, blockId).indexOf(blockId);
}

export function chapterIdOf(document: Document, blockId: string): string | null {
  const path = ancestorPath(document, blockId);
  const root = path[0];
  if (root === undefined) return null;
  return document.chapters.find((chapter) => chapter.topLevelBlockIds.includes(root))?.id ?? null;
}

export function collectText(node: ContentNode, parts: string[] = []): string[] {
  if (typeof node.text === 'string' && node.text.length > 0) parts.push(node.text);
  for (const child of node.children ?? []) collectText(child, parts);
  return parts;
}

export function blockPlainText(block: ContentBlock | undefined): string {
  if (block === undefined) return '';
  return collectText(block.content).join(' ').replace(/\s+/g, ' ').trim();
}

export function blockTitle(block: ContentBlock | undefined): string {
  if (block === undefined) return 'Untitled block';
  if (typeof block.label === 'string' && block.label.trim().length > 0) return block.label.trim();
  const first = block.content.children?.find((node) => {
    const text = collectText(node).join(' ').trim();
    return text.length > 0;
  });
  const text = first === undefined ? blockPlainText(block) : collectText(first).join(' ').replace(/\s+/g, ' ').trim();
  if (text.length === 0) return 'Empty block';
  return text.length > 72 ? `${text.slice(0, 71)}…` : text;
}

export function countWords(document: Document): number {
  let words = 0;
  for (const block of Object.values(document.blocks)) {
    const text = blockPlainText(block);
    if (text.length === 0) continue;
    words += text.split(/\s+/).filter((word) => word.length > 0).length;
  }
  return words;
}

export function blockCount(document: Document): number {
  return Object.keys(document.blocks).length;
}

/** Visible ids honoring per-document collapse state. */
export function visibleBlockIds(
  document: Document,
  collapsed: ReadonlySet<string>,
): string[] {
  const result: string[] = [];
  const walk = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (result.includes(id)) continue;
      result.push(id);
      if (!collapsed.has(id)) walk(directChildIds(document, id));
    }
  };
  for (const chapter of document.chapters) walk(chapter.topLevelBlockIds);
  return result;
}

export function edgePairs(
  document: Document,
  collapsed: ReadonlySet<string>,
): Array<{ id: string; parentId: string; childId: string; index: number; count: number }> {
  const edges: Array<{ id: string; parentId: string; childId: string; index: number; count: number }> = [];
  const walk = (parentId: string): void => {
    if (collapsed.has(parentId)) return;
    const branches = directChildBranches(document, parentId);
    for (const [index, branch] of branches.entries()) {
      edges.push({
        id: branch.id,
        parentId,
        childId: branch.targetBlockId,
        index,
        count: branches.length,
      });
      walk(branch.targetBlockId);
    }
  };
  for (const chapter of document.chapters) {
    for (const rootId of chapter.topLevelBlockIds) {
      if (document.blocks[rootId] !== undefined) walk(rootId);
    }
  }
  return edges;
}
