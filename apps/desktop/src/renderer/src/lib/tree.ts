/**
 * Renderer selectors over the canonical block tree (primary branches).
 *
 * Structural traversal delegates to `@noteforest/core` (`structure.ts`) so the
 * sidebar, editor adapter, and keyboard navigation cannot drift from the
 * command layer. This module keeps only the renderer-facing projections
 * (chapter trees, titles, collapse-aware order, edge descriptors).
 */

import type {
  AnchorState,
  Branch,
  BranchRole,
  ContentBlock,
  ContentNode,
  Document,
} from '@noteforest/core';
import {
  anchoredChildBranches,
  chapterIdForBlock,
  directChildBranches,
  directChildIds,
  primaryParentBranch,
  resolveAnchor,
  sortedBranches,
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

/**
 * Outgoing reference branches from a block or any of its anchors. References
 * are associative: they never contribute outline rows, child groups, or
 * layout input (spec §7.7). Sorted by reference order, then branch ID.
 */
export function outgoingReferenceBranches(document: Document, blockId: string): Branch[] {
  return sortedBranches(
    Object.values(document.branches).filter(
      (branch) =>
        branch.role === 'reference' &&
        branch.source.blockId === blockId &&
        document.blocks[branch.targetBlockId] !== undefined,
    ),
  );
}

/** Incoming reference branches targeting a block; sorted by reference order. */
export function incomingReferenceBranches(document: Document, blockId: string): Branch[] {
  return sortedBranches(
    Object.values(document.branches).filter(
      (branch) =>
        branch.role === 'reference' &&
        branch.targetBlockId === blockId &&
        document.blocks[branch.source.blockId] !== undefined,
    ),
  );
}

export interface ExternalReferenceParent {
  branchId: string;
  sourceBlockId: string;
  sourceTitle: string;
  chapterId: string | null;
  chapterTitle: string;
  role: BranchRole;
  targetBlockId: string;
  targetTitle: string;
  anchorId?: string;
  label?: string;
}

function chapterTitleOfBlock(document: Document, blockId: string): {
  chapterId: string | null;
  chapterTitle: string;
} {
  const chapterId = chapterIdForBlock(document, blockId);
  if (chapterId === null) return { chapterId: null, chapterTitle: 'No chapter' };
  const chapter = document.chapters.find((candidate) => candidate.id === chapterId);
  return {
    chapterId,
    chapterTitle: chapter?.title?.trim() || 'Untitled chapter',
  };
}

/**
 * Reference edges whose source stays outside the deletion but whose target is
 * the deleted block (promote) or any block in its primary subtree
 * (delete-subtree). Primary edges and references sourced inside the deletion
 * are intentionally excluded: the confirmation lists external parents only.
 */
export function externalReferenceParents(
  document: Document,
  blockId: string,
  mode: 'promote' | 'delete-subtree',
): ExternalReferenceParent[] {
  const deleted = new Set(mode === 'delete-subtree' ? subtreeIds(document, blockId) : [blockId]);
  return Object.values(document.branches)
    .filter(
      (branch) =>
        branch.role === 'reference' &&
        deleted.has(branch.targetBlockId) &&
        !deleted.has(branch.source.blockId) &&
        document.blocks[branch.source.blockId] !== undefined,
    )
    .sort((left, right) => {
      const leftChapter = chapterTitleOfBlock(document, left.source.blockId).chapterTitle;
      const rightChapter = chapterTitleOfBlock(document, right.source.blockId).chapterTitle;
      const chapter = leftChapter < rightChapter ? -1 : leftChapter > rightChapter ? 1 : 0;
      if (chapter !== 0) return chapter;
      const leftSource = blockTitle(document.blocks[left.source.blockId]);
      const rightSource = blockTitle(document.blocks[right.source.blockId]);
      const source = leftSource < rightSource ? -1 : leftSource > rightSource ? 1 : 0;
      if (source !== 0) return source;
      const leftTarget = blockTitle(document.blocks[left.targetBlockId]);
      const rightTarget = blockTitle(document.blocks[right.targetBlockId]);
      const target = leftTarget < rightTarget ? -1 : leftTarget > rightTarget ? 1 : 0;
      if (target !== 0) return target;
      const order = left.order < right.order ? -1 : left.order > right.order ? 1 : 0;
      if (order !== 0) return order;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    })
    .map((branch) => {
      const chapter = chapterTitleOfBlock(document, branch.source.blockId);
      return {
        branchId: branch.id,
        sourceBlockId: branch.source.blockId,
        sourceTitle: blockTitle(document.blocks[branch.source.blockId]),
        chapterId: chapter.chapterId,
        chapterTitle: chapter.chapterTitle,
        role: branch.role,
        targetBlockId: branch.targetBlockId,
        targetTitle: blockTitle(document.blocks[branch.targetBlockId]),
        ...(branch.source.anchorId === undefined ? {} : { anchorId: branch.source.anchorId }),
        ...(branch.label === undefined ? {} : { label: branch.label }),
      };
    });
}

/**
 * A block delete needs the confirmation dialog when it has descendants or
 * incoming reference edges from outside the deletion. A leaf block with no
 * external references keeps the fast path (delete with one undo step and no
 * confirmation); a leaf with references must disclose them first (S3-8).
 */
export function deleteNeedsConfirmation(document: Document, blockId: string): boolean {
  if (directChildIds(document, blockId).length > 0) return true;
  return externalReferenceParents(document, blockId, 'promote').length > 0;
}

export interface ReferenceEdgePair {
  id: string;
  sourceId: string;
  targetId: string;
  anchorId?: string;
  label?: string;
}

/**
 * Reference edges for the SVG overlay. The renderer draws one dashed edge per
 * reference branch when both endpoint cards are visible; layout/pagination,
 * the primary edge list, and the outline never read this projection.
 */
export function referenceEdgePairs(document: Document): ReferenceEdgePair[] {
  return sortedBranches(
    Object.values(document.branches).filter(
      (branch) =>
        branch.role === 'reference' &&
        document.blocks[branch.source.blockId] !== undefined &&
        document.blocks[branch.targetBlockId] !== undefined,
    ),
  ).map((branch) => ({
    id: branch.id,
    sourceId: branch.source.blockId,
    targetId: branch.targetBlockId,
    ...(branch.source.anchorId === undefined ? {} : { anchorId: branch.source.anchorId }),
    ...(branch.label === undefined ? {} : { label: branch.label }),
  }));
}

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

export function anchorState(
  document: Document,
  anchorId: string,
  options: Parameters<typeof resolveAnchor>[2] = {},
): AnchorState {
  return resolveAnchor(document, anchorId, options).state;
}

export function anchorIsWarning(state: AnchorState): boolean {
  return state === 'broken' || state === 'ambiguous' || state === 'block-missing';
}

/**
 * Anchors with at least one live outgoing branch, of any role. The anchor
 * record and its text binding survive when every branch is deleted; this set
 * is the renderer's idle test so a stale marker never outlives its branch.
 */
export function linkedAnchorIds(document: Document): Set<string> {
  const ids = new Set<string>();
  for (const branch of Object.values(document.branches)) {
    const anchorId = branch.source.anchorId;
    if (anchorId !== undefined && document.blocks[branch.targetBlockId] !== undefined) {
      ids.add(anchorId);
    }
  }
  return ids;
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
export type EdgePlacement = 'right' | 'below';

export interface EdgePair {
  id: string;
  parentId: string;
  childId: string;
  index: number;
  count: number;
  kind: EdgeKind;
  placement: EdgePlacement;
  anchorId?: string;
}

export function edgePairs(
  document: Document,
  collapsed: ReadonlySet<string>,
  belowChildIds: ReadonlySet<string> = new Set(),
): EdgePair[] {
  const edges: EdgePair[] = [];
  const walk = (parentId: string): void => {
    if (collapsed.has(parentId)) return;
    // Outline order (D3): anchored primary children first, then direct ones.
    // The editor projects the anchored group and any wrapped direct children
    // into the below stack; unanchored children that fit stay right.
    const anchored = anchoredChildBranches(document, parentId);
    const direct = directChildBranches(document, parentId);
    const branches = [...anchored, ...direct];
    for (const [index, branch] of branches.entries()) {
      const anchorId = branch.source.anchorId;
      const kind: EdgeKind = anchorId === undefined ? 'direct' : 'callout';
      edges.push({
        id: branch.id,
        parentId,
        childId: branch.targetBlockId,
        index,
        count: branches.length,
        kind,
        placement:
          kind === 'callout' || belowChildIds.has(branch.targetBlockId) ? 'below' : 'right',
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
