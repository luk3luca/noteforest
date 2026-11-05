/**
 * Renderer selectors over the canonical block tree (primary branches).
 *
 * Structural traversal delegates to `@noteforest/core` (`structure.ts`) so the
 * sidebar, editor adapter, and keyboard navigation cannot drift from the
 * command layer. This module keeps only the renderer-facing projections
 * (chapter trees, titles, collapse-aware order, edge descriptors).
 */

import type { AnchorState, ContentBlock, ContentNode, Document } from '@noteforest/core';
import {
  anchoredChildBranches,
  chapterIdForBlock,
  directChildBranches,
  directChildIds,
  primaryParentBranch,
  resolveAnchor,
  subtreeBlockIds,
} from '@noteforest/core';

export { directChildBranches, directChildIds };

export interface BlockNode {
  id: string;
  depth: number;
  topLevel: boolean;
  /** Incoming primary branch; null for a chapter root. */
  branchId: string | null;
  /** Anchor ID when the incoming primary branch starts at an anchor. */
  anchorId: string | null;
  children: BlockNode[];
}

export interface ChapterNode {
  id: string;
  title: string;
  blocks: BlockNode[];
}

/** Primary incoming branch (anchored sources included for M3 compatibility). */
export const incomingBranch = primaryParentBranch;

export function parentIdOf(document: Document, blockId: string): string | null {
  return primaryParentBranch(document, blockId)?.source.blockId ?? null;
}

export const subtreeIds = subtreeBlockIds;
export const chapterIdOf = chapterIdForBlock;

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
    const incoming = primaryParentBranch(document, id);
    nodes.push({
      id,
      depth,
      topLevel: depth === 0,
      branchId: incoming?.id ?? null,
      anchorId: incoming?.source.anchorId ?? null,
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

export function siblingIds(document: Document, blockId: string): string[] {
  const parent = parentIdOf(document, blockId);
  if (parent !== null) return directChildIds(document, parent);
  for (const chapter of document.chapters) {
    if (chapter.topLevelBlockIds.includes(blockId)) return [...chapter.topLevelBlockIds];
  }
  return [];
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

const MAX_ANCHOR_QUOTE = 64;

function truncated(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_ANCHOR_QUOTE ? `${clean.slice(0, MAX_ANCHOR_QUOTE - 1)}…` : clean;
}

function selectorString(selector: unknown, key: string): string {
  if (typeof selector !== 'object' || selector === null || Array.isArray(selector)) return '';
  const value = (selector as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/** Display quote for an anchor: stored quote first, then the selector fields. */
export function anchorQuote(document: Document, anchorId: string): string {
  const anchor = document.anchors[anchorId];
  if (anchor === undefined) return '';
  const stored = typeof anchor.quote === 'string' ? anchor.quote : '';
  if (stored.length > 0) return truncated(stored);
  for (const key of ['quote', 'latex', 'label']) {
    const value = selectorString(anchor.selector, key);
    if (value.length > 0) return truncated(value);
  }
  return '';
}

export function anchorState(document: Document, anchorId: string): AnchorState {
  return resolveAnchor(document, anchorId).state;
}

export function anchorIsWarning(state: AnchorState): boolean {
  return state === 'broken' || state === 'ambiguous' || state === 'block-missing';
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

export type EdgeKind = 'callout' | 'direct';

export interface EdgePair {
  id: string;
  parentId: string;
  childId: string;
  index: number;
  count: number;
  kind: EdgeKind;
  anchorId?: string;
}

export function edgePairs(
  document: Document,
  collapsed: ReadonlySet<string>,
): EdgePair[] {
  const edges: EdgePair[] = [];
  const walk = (parentId: string): void => {
    if (collapsed.has(parentId)) return;
    // Outline order (D3): anchored primary children first, then direct ones.
    // The editor projects the anchored group into the callout lane.
    const anchored = anchoredChildBranches(document, parentId);
    const direct = directChildBranches(document, parentId);
    const branches = [...anchored, ...direct];
    for (const [index, branch] of branches.entries()) {
      const anchorId = branch.source.anchorId;
      edges.push({
        id: branch.id,
        parentId,
        childId: branch.targetBlockId,
        index,
        count: branches.length,
        kind: anchorId === undefined ? 'direct' : 'callout',
        ...(anchorId === undefined ? {} : { anchorId }),
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
