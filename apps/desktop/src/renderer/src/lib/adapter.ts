/**
 * Adapter between the canonical core content shape (`children`) and
 * ProseMirror's JSON shape (`content`).
 *
 * Core blocks hold a ProseMirror-shaped `doc` node with `children`; the editor
 * uses the custom `chapter` / `block` / `blockBody` / `branchChildren` wrapper
 * nodes. The wrapper nodes never leak into the stored content.
 */

import type { ContentNode, Document } from '@noteforest/core';
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

export function contentToPM(node: ContentNode): PMNode {
  const result: PMNode = { type: node.type };
  if (isRecord(node.attrs)) result.attrs = { ...node.attrs };
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) {
    result.marks = node.marks.filter(isRecord).map((mark) => {
      const converted: PMMark = { type: String(mark['type']) };
      if (isRecord(mark['attrs'])) converted.attrs = { ...mark['attrs'] };
      return converted;
    });
  }
  if (Array.isArray(node.children)) result.content = node.children.map(contentToPM);
  return result;
}

export function pmToContent(node: PMNode): ContentNode {
  const result: ContentNode = { type: node.type };
  if (node.attrs !== undefined) result.attrs = { ...node.attrs };
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) {
    result.marks = node.marks.map((mark) => ({
      type: mark.type,
      ...(mark.attrs === undefined ? {} : { attrs: { ...mark.attrs } }),
    }));
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

  const chapters: PMNode[] = [];
  for (const chapter of document.chapters) {
    const blocks = chapter.topLevelBlockIds
      .map((id) => buildBlock(id, 0))
      .filter((node): node is PMNode => node !== null);
    if (blocks.length === 0) continue;
    chapters.push({
      type: 'chapter',
      attrs: { chapterId: chapter.id, title: chapter.title ?? 'Untitled chapter' },
      content: blocks,
    });
  }

  return { type: 'doc', content: chapters.length > 0 ? chapters : [{ type: 'chapter', attrs: { chapterId: document.chapters[0]?.id ?? '', title: 'Untitled chapter' }, content: [{ type: 'branchBlock', attrs: { blockId: '__empty__', depth: 0, topLevel: true }, content: [{ type: 'blockBody', attrs: { blockId: '__empty__', depth: 0, topLevel: true }, content: [{ type: 'paragraph' }] }] }] }] };
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
      if (blockId !== null && blockId !== '__empty__') {
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
