/**
 * Adapter between the canonical core content shape (`children`) and
 * ProseMirror's JSON shape (`content`).
 *
 * Core blocks hold a ProseMirror-shaped `doc` node with `children`; the editor
 * uses the custom `chapter` / `block` / `blockBody` / `branchChildren` wrapper
 * nodes. The wrapper nodes never leak into the stored content.
 */

import type { ContentNode, Document } from '@noteforest/core';
import { normalizeAnchorIds } from '@noteforest/core';
import { directChildIds } from './tree';

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read anchor IDs from an `anchorIds` array or the M2 legacy single string. */
function anchorIdsFromAttrs(attrs: unknown): string[] {
  if (!isRecord(attrs)) return [];
  const value = attrs['anchorIds'];
  if (Array.isArray(value)) {
    return normalizeAnchorIds(
      value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
    );
  }
  const legacy = attrs['anchorId'];
  return typeof legacy === 'string' && legacy.length > 0 ? normalizeAnchorIds([legacy]) : [];
}

/**
 * Keep exactly one sorted `anchor` mark per node. Duplicate anchor marks and a
 * legacy `anchorId` are folded into the `anchorIds` array; empty marks vanish.
 */
function normalizeMarks<T extends { type: string; attrs?: Record<string, unknown> }>(
  marks: readonly T[],
): T[] {
  const others: T[] = [];
  const ids: string[] = [];
  for (const mark of marks) {
    if (mark.type === 'anchor') ids.push(...anchorIdsFromAttrs(mark.attrs));
    else others.push(mark);
  }
  const normalized = normalizeAnchorIds(ids);
  if (normalized.length > 0) {
    others.push({ type: 'anchor', attrs: { anchorIds: normalized } } as unknown as T);
  }
  return others;
}

/**
 * Copy/paste rule from ADR-0005 §7: pasted inline/atomic content must never
 * duplicate an anchor ID. The source keeps its anchors; the pasted copy loses
 * the binding. Block-level duplicate-subtree remapping is not part of M3b1.
 */
export function stripAnchorBindings(node: PMNode): PMNode {
  const result: PMNode = { type: node.type };
  const attrs = isRecord(node.attrs) ? { ...node.attrs } : undefined;
  if (attrs !== undefined) {
    delete attrs['anchorIds'];
    delete attrs['anchorId'];
    if (Object.keys(attrs).length > 0) result.attrs = attrs;
  }
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) {
    const marks = normalizeMarks(node.marks).filter((mark) => mark.type !== 'anchor');
    if (marks.length > 0) result.marks = marks;
  }
  if (Array.isArray(node.content)) result.content = node.content.map(stripAnchorBindings);
  return result;
}

export function contentToPM(node: ContentNode): PMNode {
  const result: PMNode = { type: node.type };
  if (isRecord(node.attrs)) result.attrs = { ...node.attrs };
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) {
    const marks = node.marks.filter(isRecord).map((mark) => {
      const converted: PMMark = { type: String(mark['type']) };
      if (isRecord(mark['attrs'])) converted.attrs = { ...mark['attrs'] };
      return converted;
    });
    const normalized = normalizeMarks(marks);
    if (normalized.length > 0) result.marks = normalized;
  }
  if (Array.isArray(node.children)) result.content = node.children.map(contentToPM);
  return result;
}

export function pmToContent(node: PMNode): ContentNode {
  const result: ContentNode = { type: node.type };
  if (node.attrs !== undefined) result.attrs = { ...node.attrs };
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) {
    const marks = normalizeMarks(
      node.marks.map((mark) => ({
        type: mark.type,
        ...(mark.attrs === undefined ? {} : { attrs: { ...mark.attrs } }),
      })),
    );
    if (marks.length > 0) result.marks = marks;
  }
  if (Array.isArray(node.content)) result.children = node.content.map(pmToContent);
  return result;
}

/** ProseMirror body nodes for a block, always at least one paragraph. */
export function blockBodyContent(block: ContentNode): PMNode[] {
  const children = Array.isArray(block.children) ? block.children.map(contentToPM) : [];
  return children.length > 0 ? children : [{ type: 'paragraph' }];
}

export function buildBlockNode(
  document: Document,
  id: string,
  depth: number,
  collapsed: ReadonlySet<string>,
  seen: Set<string> = new Set(),
): PMNode | null {
  if (seen.has(id)) return null;
  const block = document.blocks[id];
  if (block === undefined) return null;
  seen.add(id);
  const isCollapsed = collapsed.has(id);
  const childIds = directChildIds(document, id).filter((childId) => document.blocks[childId] !== undefined);
  const content: PMNode[] = [
    {
      type: 'blockBody',
      attrs: {
        blockId: id,
        depth,
        topLevel: depth === 0,
        collapsed: isCollapsed,
        childCount: childIds.length,
      },
      content: blockBodyContent(block.content),
    },
  ];
  const children = childIds
    .map((childId) => buildBlockNode(document, childId, depth + 1, collapsed, seen))
    .filter((node): node is PMNode => node !== null);
  if (children.length > 0) {
    content.push({
      type: 'branchChildren',
      attrs: { parentId: id, depth },
      content: children,
    });
  }
  return {
    type: 'branchBlock',
    attrs: {
      blockId: id,
      depth,
      topLevel: depth === 0,
      collapsed: isCollapsed,
      label: block.label ?? null,
      border: block.border ?? null,
    },
    content,
  };
}

export function buildEditorDocument(
  document: Document,
  collapsed: ReadonlySet<string>,
): PMNode {
  const seen = new Set<string>();
  const buildBlock = (id: string, depth: number): PMNode | null =>
    buildBlockNode(document, id, depth, collapsed, seen);

  // Every chapter is rendered, including a legacy empty one. The `chapter`
  // node accepts `branch*`; an empty chapter is valid ProseMirror content and
  // keeps its title plus the "Add top-level block" row alive after reload.
  const chapters: PMNode[] = document.chapters.map((chapter) => ({
    type: 'chapter',
    attrs: { chapterId: chapter.id, title: chapter.title ?? 'Untitled chapter' },
    content: chapter.topLevelBlockIds
      .map((id) => buildBlock(id, 0))
      .filter((node): node is PMNode => node !== null),
  }));

  // A document always has at least one chapter. The fallback only protects the
  // editor from an invalid, chapter-less in-memory document; it never adds a
  // synthetic block.
  return {
    type: 'doc',
    content:
      chapters.length > 0
        ? chapters
        : [{ type: 'chapter', attrs: { chapterId: '', title: 'Untitled chapter' }, content: [] }],
  };
}

/**
 * Extract each block's canonical content from the editor document. Wrapper
 * nodes (chapter/block/branchChildren) are ignored; only blockBody content is
 * stored.
 */
export function extractBlockContents(editorDocument: PMNode): Map<string, { content: ContentNode; label: string | null }> {
  const result = new Map<string, { content: ContentNode; label: string | null }>();
  const walk = (node: PMNode): void => {
    if (node.type === 'blockBody') {
      const blockId = typeof node.attrs?.['blockId'] === 'string' ? node.attrs['blockId'] : null;
      if (blockId !== null) {
        const children = (node.content ?? []).map(pmToContent);
        result.set(blockId, {
          content: { type: 'doc', children },
          label: null,
        });
      }
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(editorDocument);
  return result;
}

/** Merge edited body into the previous canonical root, preserving unknown root data. */
export function withBody(base: ContentNode, body: ContentNode): ContentNode {
  const next: ContentNode = { ...base, type: 'doc' };
  delete (next as { content?: unknown }).content;
  next.children = body.children ?? [];
  return next;
}
