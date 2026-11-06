/**
 * Pure planning for `block.split` and `block.merge` (M3f1).
 *
 * These helpers validate a split/merge and compute the resulting content and
 * anchor migration without mutating the document. The command layer applies the
 * plan through the typed command set; the renderer uses the same plan to
 * disable a menu action with the exact reason.
 *
 * Split scope is deliberately minimal (spec §5.2, OD-6): a caret inside a text
 * leaf, never inside an atomic node or a table. Formula, code, image, and other
 * block-level nodes move whole to one side.
 */

import {
  buildBlockAnchorIndex,
  codePointLength,
  codePointSlice,
  compareNodePaths,
  inspectAnchorBinding,
  nodePathKey,
} from './anchors.js';
import { compareBranches, findTopLevelPlacement, primaryParentBranch } from './structure.js';
import type { Branch, BranchSource, ContentNode, Document } from './types.js';

export interface BlockSplitPoint {
  /** Path relative to the block content root (`doc`). */
  nodePath: number[];
  /** Unicode code point offset inside the target text leaf. */
  offset: number;
}

export interface BlockSplitPlan {
  blockId: string;
  /** Content that stays in the original block. */
  before: ContentNode;
  /** Content that moves to the new block. */
  after: ContentNode;
  /** Projection offset of the cut, used only for anchor classification. */
  cutOffset: number;
  /** Anchors whose binding is entirely before the cut. */
  stayAnchorIds: string[];
  /** Anchors whose binding is entirely after the cut and changes block. */
  moveAnchorIds: string[];
  /** Anchors that cover the cut, keep their ID and are flagged for repair. */
  spanAnchorIds: string[];
}

export type BlockSplitCheck =
  | { ok: true; plan: BlockSplitPlan }
  | { ok: false; reason: string };

export interface BlockMergePlan {
  blockId: string;
  intoBlockId: string;
  mode: 'port' | 'top-level';
  chapterId?: string;
  port?: { blockId: string; anchorId?: string };
}

export type BlockMergeCheck =
  | { ok: true; plan: BlockMergePlan }
  | { ok: false; reason: string };

const ATOMIC_NODE_TYPES = new Set([
  'mathBlock',
  'blockMath',
  'inlineMath',
  'codeBlock',
  'image',
  'horizontalRule',
]);

const TABLE_NODE_TYPES = new Set(['table', 'tableRow', 'tableCell', 'tableHeader']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPath(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0)
  );
}

function cloneShell(node: ContentNode): ContentNode {
  const shell = structuredClone(node);
  delete shell.children;
  return shell;
}

function cloneNode(node: ContentNode): ContentNode {
  return structuredClone(node);
}

/**
 * Split one node at a path. Returns a null side when that side has no content,
 * so empty wrappers (paragraphs, list items) never survive the cut.
 */
function splitNodeAt(
  node: ContentNode,
  path: readonly number[],
  offset: number,
): [ContentNode | null, ContentNode | null] {
  if (path.length === 0) {
    if (node.type !== 'text') {
      throw new RangeError(`split target must be a text leaf, not "${node.type}"`);
    }
    const text = node.text ?? '';
    const length = codePointLength(text);
    if (offset <= 0) return [null, cloneNode(node)];
    if (offset >= length) return [cloneNode(node), null];
    const left = cloneNode(node);
    const right = cloneNode(node);
    left.text = codePointSlice(text, 0, offset);
    right.text = codePointSlice(text, offset);
    return [left, right];
  }

  const childIndex = path[0];
  const children = node.children ?? [];
  const child = childIndex === undefined ? undefined : children[childIndex];
  if (child === undefined) {
    throw new RangeError(`node path "${nodePathKey(path)}" does not exist`);
  }
  const [leftChild, rightChild] = splitNodeAt(child, path.slice(1), offset);
  const beforeChildren = [
    ...children.slice(0, childIndex).map(cloneNode),
    ...(leftChild === null ? [] : [leftChild]),
  ];
  const afterChildren = [
    ...(rightChild === null ? [] : [rightChild]),
    ...children.slice((childIndex ?? 0) + 1).map(cloneNode),
  ];
  return [
    beforeChildren.length === 0
      ? null
      : { ...cloneShell(node), children: beforeChildren },
    afterChildren.length === 0 ? null : { ...cloneShell(node), children: afterChildren },
  ];
}

/**
 * Split a block body at a text leaf. The root node itself stays the body root;
 * only its children are redistributed.
 */
export function splitContentAt(
  content: ContentNode,
  at: BlockSplitPoint,
): { before: ContentNode; after: ContentNode } {
  const children = content.children ?? [];
  const topIndex = at.nodePath[0];
  const top = topIndex === undefined ? undefined : children[topIndex];
  if (topIndex === undefined || top === undefined) {
    throw new RangeError(`node path "${nodePathKey(at.nodePath)}" does not exist`);
  }
  const [leftTop, rightTop] = splitNodeAt(top, at.nodePath.slice(1), at.offset);
  const beforeChildren = [
    ...children.slice(0, topIndex).map(cloneNode),
    ...(leftTop === null ? [] : [leftTop]),
  ];
  const afterChildren = [
    ...(rightTop === null ? [] : [rightTop]),
    ...children.slice(topIndex + 1).map(cloneNode),
  ];
  if (beforeChildren.length === 0 || afterChildren.length === 0) {
    throw new RangeError('the split would leave an empty block');
  }
  return {
    before: { ...cloneShell(content), children: beforeChildren },
    after: { ...cloneShell(content), children: afterChildren },
  };
}

function cutProjectionOffset(
  document: Document,
  blockId: string,
  content: ContentNode,
  at: BlockSplitPoint,
): number | null {
  const index = buildBlockAnchorIndex(blockId, content);
  const segment = index.projection.segments.find(
    (candidate) =>
      candidate.kind === 'text' &&
      compareNodePaths(candidate.nodePath, at.nodePath) === 0,
  );
  if (segment === undefined) return null;
  return segment.start + at.offset;
}

function atomicNodeSide(
  occurrences: ReadonlyArray<{ nodePath: number[] }>,
  cutPath: readonly number[],
): 'before' | 'after' | 'mixed' | 'none' {
  if (occurrences.length === 0) return 'none';
  let before = 0;
  let after = 0;
  for (const occurrence of occurrences) {
    if (compareNodePaths(occurrence.nodePath, cutPath) < 0) before += 1;
    else after += 1;
  }
  if (after === 0) return 'before';
  if (before === 0) return 'after';
  return 'mixed';
}

interface AnchorSplitClassification {
  stay: string[];
  move: string[];
  span: string[];
}

function classifyAnchors(
  document: Document,
  blockId: string,
  content: ContentNode,
  cutOffset: number,
  cutPath: readonly number[],
): AnchorSplitClassification {
  const anchors = Object.values(document.anchors).filter(
    (anchor) => anchor.blockId === blockId,
  );
  if (anchors.length === 0) return { stay: [], move: [], span: [] };
  const index = buildBlockAnchorIndex(blockId, content);
  const result: AnchorSplitClassification = { stay: [], move: [], span: [] };
  for (const anchor of anchors) {
    const inspection = inspectAnchorBinding(index, anchor.id);
    if (inspection.presence === 'none') {
      result.stay.push(anchor.id);
      continue;
    }
    if (inspection.presence === 'atomic' || inspection.presence === 'mixed') {
      const side = atomicNodeSide(inspection.occurrences, cutPath);
      if (side === 'after') result.move.push(anchor.id);
      else if (side === 'mixed') result.span.push(anchor.id);
      else result.stay.push(anchor.id);
      continue;
    }
    const range = inspection.textRange;
    if (range === null) {
      result.stay.push(anchor.id);
      continue;
    }
    if (range.end <= cutOffset) result.stay.push(anchor.id);
    else if (range.start >= cutOffset) result.move.push(anchor.id);
    else result.span.push(anchor.id);
  }
  return result;
}

function validateSplitPath(content: ContentNode, at: BlockSplitPoint): string | null {
  let node: ContentNode = content;
  for (const index of at.nodePath) {
    if (ATOMIC_NODE_TYPES.has(node.type) || TABLE_NODE_TYPES.has(node.type)) {
      return 'a formula, code block, image, or table cannot be split';
    }
    const child = node.children?.[index];
    if (child === undefined) return 'the caret position is not inside this block';
    node = child;
  }
  if (node.type !== 'text') {
    return 'the caret is not inside a text leaf';
  }
  return null;
}

/**
 * Validate a split and compute the exact migration plan.
 *
 * The plan is pure: `document`, block content, anchors, and branches are not
 * touched. A failure reason is user-facing and safe to show in a disabled menu.
 */
export function planBlockSplit(
  document: Document,
  blockId: string,
  at: unknown,
): BlockSplitCheck {
  const block = document.blocks[blockId];
  if (block === undefined) return { ok: false, reason: 'this block no longer exists' };
  if (!isRecord(at)) return { ok: false, reason: 'the caret position is invalid' };
  const pathValue = at['nodePath'];
  const offsetValue = at['offset'];
  if (!isPath(pathValue)) return { ok: false, reason: 'the caret position is invalid' };
  if (
    typeof offsetValue !== 'number' ||
    !Number.isInteger(offsetValue) ||
    offsetValue < 0
  ) {
    return { ok: false, reason: 'the caret offset is invalid' };
  }
  const pathError = validateSplitPath(block.content, {
    nodePath: pathValue,
    offset: offsetValue,
  });
  if (pathError !== null) return { ok: false, reason: pathError };

  const target = pathValue.reduce<ContentNode | undefined>(
    (node, index) => node?.children?.[index],
    block.content,
  );
  if (target === undefined || target.type !== 'text') {
    return { ok: false, reason: 'the caret is not inside a text leaf' };
  }
  const length = codePointLength(target.text ?? '');
  if (offsetValue > length) return { ok: false, reason: 'the caret offset is invalid' };

  let content: { before: ContentNode; after: ContentNode };
  try {
    content = splitContentAt(block.content, {
      nodePath: pathValue,
      offset: offsetValue,
    });
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'the block cannot be split here',
    };
  }

  const cutOffset = cutProjectionOffset(document, blockId, block.content, {
    nodePath: pathValue,
    offset: offsetValue,
  });
  if (cutOffset === null) {
    return { ok: false, reason: 'the caret position cannot be mapped to the block content' };
  }
  const classification = classifyAnchors(
    document,
    blockId,
    block.content,
    cutOffset,
    pathValue,
  );

  if (findTopLevelPlacement(document, blockId) === null) {
    const incoming = primaryParentBranch(document, blockId);
    if (incoming === undefined) {
      return { ok: false, reason: 'this block has no parent branch or chapter slot' };
    }
  }

  return {
    ok: true,
    plan: {
      blockId,
      before: content.before,
      after: content.after,
      cutOffset,
      stayAnchorIds: classification.stay,
      moveAnchorIds: classification.move,
      spanAnchorIds: classification.span,
    },
  };
}

function samePort(left: BranchSource, right: { blockId: string; anchorId?: string }): boolean {
  return left.blockId === right.blockId && left.anchorId === right.anchorId;
}

function portBranches(
  document: Document,
  port: { blockId: string; anchorId?: string },
): Branch[] {
  return Object.values(document.branches)
    .filter((branch) => branch.role === 'primary' && samePort(branch.source, port))
    .sort(compareBranches);
}

function previousTopLevelBlock(
  document: Document,
  blockId: string,
): { chapterId: string; intoBlockId: string } | string {
  const placement = findTopLevelPlacement(document, blockId);
  if (placement === null) return 'this block is not a top-level block';
  const chapter = document.chapters.find((candidate) => candidate.id === placement.chapterId);
  if (chapter === undefined) return 'the chapter for this block no longer exists';
  const index = chapter.topLevelBlockIds.indexOf(blockId);
  if (index <= 0) return 'this is the first top-level block in its chapter';
  const intoBlockId = chapter.topLevelBlockIds[index - 1];
  if (intoBlockId === undefined) return 'there is no previous top-level block in this chapter';
  return { chapterId: chapter.id, intoBlockId };
}

/**
 * Validate a merge and resolve its default target (the previous sibling in the
 * same primary port, or the previous top-level block in the same chapter).
 *
 * Cross-port, cross-anchor, and cross-chapter merges are rejected in M3
 * (spec §5.2, OD-11). No record is mutated here.
 */
export function planBlockMerge(
  document: Document,
  blockId: string,
  intoBlockId?: string,
): BlockMergeCheck {
  const block = document.blocks[blockId];
  if (block === undefined) return { ok: false, reason: 'this block no longer exists' };
  const incoming = primaryParentBranch(document, blockId);

  if (incoming !== undefined) {
    const port = {
      blockId: incoming.source.blockId,
      ...(incoming.source.anchorId === undefined
        ? {}
        : { anchorId: incoming.source.anchorId }),
    };
    let targetId: string;
    if (intoBlockId === undefined) {
      const siblings = portBranches(document, port);
      const index = siblings.findIndex((branch) => branch.id === incoming.id);
      if (index <= 0) {
        return { ok: false, reason: 'this is the first child of its parent port' };
      }
      const previous = siblings[index - 1];
      if (previous === undefined) {
        return { ok: false, reason: 'there is no previous sibling in this parent port' };
      }
      targetId = previous.targetBlockId;
    } else {
      if (intoBlockId === blockId) {
        return { ok: false, reason: 'a block cannot merge into itself' };
      }
      const target = document.blocks[intoBlockId];
      if (target === undefined) return { ok: false, reason: 'the target block no longer exists' };
      const targetIncoming = primaryParentBranch(document, intoBlockId);
      if (targetIncoming === undefined) {
        return {
          ok: false,
          reason: 'both blocks must share the same parent port or both be top-level in the same chapter',
        };
      }
      if (
        targetIncoming.source.blockId !== port.blockId ||
        targetIncoming.source.anchorId !== port.anchorId
      ) {
        const reason =
          incoming.source.anchorId !== undefined ||
          targetIncoming.source.anchorId !== undefined
            ? 'cross-anchor merge is rejected in M3'
            : 'both blocks must share the same parent port';
        return { ok: false, reason };
      }
      targetId = intoBlockId;
    }
    return {
      ok: true,
      plan: { blockId, intoBlockId: targetId, mode: 'port', port },
    };
  }

  if (intoBlockId === undefined) {
    const previous = previousTopLevelBlock(document, blockId);
    if (typeof previous === 'string') return { ok: false, reason: previous };
    return {
      ok: true,
      plan: {
        blockId,
        intoBlockId: previous.intoBlockId,
        mode: 'top-level',
        chapterId: previous.chapterId,
      },
    };
  }

  if (intoBlockId === blockId) {
    return { ok: false, reason: 'a block cannot merge into itself' };
  }
  const target = document.blocks[intoBlockId];
  if (target === undefined) return { ok: false, reason: 'the target block no longer exists' };
  const sourcePlacement = findTopLevelPlacement(document, blockId);
  const targetPlacement = findTopLevelPlacement(document, intoBlockId);
  if (sourcePlacement === null || targetPlacement === null) {
    return {
      ok: false,
      reason: 'both blocks must share the same parent port or both be top-level in the same chapter',
    };
  }
  if (sourcePlacement.chapterId !== targetPlacement.chapterId) {
    return { ok: false, reason: 'cross-chapter merge is rejected in M3' };
  }
  return {
    ok: true,
    plan: {
      blockId,
      intoBlockId,
      mode: 'top-level',
      chapterId: sourcePlacement.chapterId,
    },
  };
}
