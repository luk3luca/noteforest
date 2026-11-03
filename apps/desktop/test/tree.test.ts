import { describe, expect, it } from 'vitest';
import type { Branch, ContentBlock, Document } from '@noteforest/core';
import {
  ancestorPath,
  blockTitle,
  buildChapterTrees,
  chapterIdOf,
  countWords,
  directChildIds,
  edgePairs,
  flattenBlocks,
  parentIdOf,
  siblingIds,
  visibleBlockIds,
} from '../src/renderer/src/lib/tree';

function paragraph(text: string): ContentBlock['content'] {
  return { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] };
}

function block(id: string, text: string, heading?: string): ContentBlock {
  const children = [
    ...(heading === undefined
      ? []
      : [{ type: 'heading' as const, attrs: { level: 2 }, children: [{ type: 'text' as const, text: heading }] }]),
    ...(paragraph(text).children ?? []),
  ];
  return { id, content: { type: 'doc', children } };
}

function branch(source: string, target: string, order: string): Branch {
  return { id: `${source}-${target}`, source: { blockId: source }, targetBlockId: target, role: 'primary', order };
}

function fixture(): Document {
  const blocks: Record<string, ContentBlock> = {
    A: block('A', 'Alpha body', 'Alpha'),
    B: block('B', 'Beta body', 'Beta'),
    C: block('C', 'Gamma body', 'Gamma'),
    D: block('D', 'Delta body', 'Delta'),
    E: block('E', 'Epsilon body', 'Epsilon'),
    F: block('F', 'Zeta body', 'Zeta'),
  };
  const branches: Record<string, Branch> = {
    ab: branch('A', 'B', 'm'),
    ac: branch('A', 'C', 't'),
    bd: branch('B', 'D', 'm'),
  };
  return {
    schemaVersion: 1,
    id: 'doc',
    title: 'Fixture',
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    revision: 1,
    pageSetup: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    },
    manualBreakBeforeBlockIds: [],
    chapters: [
      { id: 'c1', title: 'One', topLevelBlockIds: ['A', 'E'] },
      { id: 'c2', title: 'Two', topLevelBlockIds: ['F'] },
    ],
    blocks,
    anchors: {},
    branches,
    assets: {},
    annotations: [],
  };
}

describe('block tree', () => {
  it('builds chapters with depth-first block order', () => {
    const tree = buildChapterTrees(fixture());
    expect(tree.map((chapter) => chapter.id)).toEqual(['c1', 'c2']);
    expect(tree[0]?.blocks.map((node) => node.id)).toEqual(['A', 'E']);
    expect(tree[0]?.blocks[0]?.children.map((node) => node.id)).toEqual(['B', 'C']);
    expect(tree[0]?.blocks[0]?.children[0]?.children[0]?.id).toBe('D');
    expect(tree[0]?.blocks[0]?.children[0]?.children[0]?.depth).toBe(2);
  });

  it('flattens in reading order and reports ancestry', () => {
    expect(flattenBlocks(fixture())).toEqual(['A', 'B', 'D', 'C', 'E', 'F']);
    expect(ancestorPath(fixture(), 'D')).toEqual(['A', 'B', 'D']);
    expect(parentIdOf(fixture(), 'D')).toBe('B');
    expect(parentIdOf(fixture(), 'A')).toBeNull();
    expect(siblingIds(fixture(), 'D')).toEqual(['D']);
    expect(siblingIds(fixture(), 'B')).toEqual(['B', 'C']);
    expect(chapterIdOf(fixture(), 'D')).toBe('c1');
    expect(chapterIdOf(fixture(), 'F')).toBe('c2');
  });

  it('honours collapse for reading order and edges', () => {
    expect(visibleBlockIds(fixture(), new Set(['B']))).toEqual(['A', 'B', 'C', 'E', 'F']);
    const edges = edgePairs(fixture(), new Set(['B']));
    expect(edges.map((edge) => `${edge.parentId}->${edge.childId}`)).toEqual([
      'A->B',
      'A->C',
    ]);
  });

  it('produces deterministic sibling port indexes', () => {
    const edges = edgePairs(fixture(), new Set());
    const fromA = edges.filter((edge) => edge.parentId === 'A');
    expect(fromA.map((edge) => edge.index)).toEqual([0, 1]);
    expect(fromA.every((edge) => edge.count === 2)).toBe(true);
    expect(directChildIds(fixture(), 'A')).toEqual(['B', 'C']);
  });

  it('derives readable titles, word counts, and labels', () => {
    const doc = fixture();
    expect(blockTitle(doc.blocks['A'])).toBe('Alpha');
    expect(blockTitle(doc.blocks['missing'])).toBe('Untitled block');
    expect(countWords(doc)).toBe(18);
    doc.blocks['A'] = { ...doc.blocks['A']!, label: 'Custom label' };
    expect(blockTitle(doc.blocks['A'])).toBe('Custom label');
  });
});
