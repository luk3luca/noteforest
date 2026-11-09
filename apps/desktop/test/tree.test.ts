import { describe, expect, it } from 'vitest';
import type { Branch, ContentBlock, Document } from '@noteforest/core';
import { contentBlockTitle } from '@noteforest/layout';
import {
  ancestorPath,
  anchorQuote,
  anchorState,
  blockTitle,
  buildChapterTrees,
  chapterIdOf,
  countWords,
  directChildIds,
  edgePairs,
  flattenBlocks,
  linkedAnchorIds,
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
    schemaVersion: 2,
    id: 'doc',
    title: 'Fixture',
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    revision: 1,
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

  it('marks anchored primary edges as callouts before direct edges', () => {
    const document = fixture();
    document.anchors['an1'] = {
      id: 'an1',
      blockId: 'A',
      kind: 'text',
      selector: { quote: 'Alpha body' },
      quote: 'Alpha body',
    };
    document.branches['ac'] = {
      ...document.branches['ac']!,
      source: { blockId: 'A', anchorId: 'an1' },
    };
    const edges = edgePairs(document, new Set());
    const fromA = edges.filter((edge) => edge.parentId === 'A');
    expect(fromA.map((edge) => edge.kind)).toEqual(['callout', 'direct']);
    expect(fromA.map((edge) => edge.placement)).toEqual(['below', 'right']);
    expect(fromA.map((edge) => edge.anchorId)).toEqual(['an1', undefined]);
    expect(fromA.map((edge) => `${edge.parentId}->${edge.childId}`)).toEqual(['A->C', 'A->B']);
    expect(fromA.map((edge) => edge.index)).toEqual([0, 1]);
    expect(fromA.every((edge) => edge.count === 2)).toBe(true);

    const tree = buildChapterTrees(document);
    const children = tree[0]?.blocks[0]?.children ?? [];
    expect(children.map((node) => node.id)).toEqual(['C', 'B']);
    expect(children[0]?.anchorId).toBe('an1');
    expect(children[0]?.branchId).toBe('A-C');
    expect(children[1]?.anchorId).toBeNull();
    expect(anchorQuote(document, 'an1')).toBe('Alpha body');
    expect(anchorState(document, 'an1')).toBe('resolved');
  });

  it('treats an anchor as idle only when it has no live outgoing branch', () => {
    const document = fixture();
    document.anchors['an1'] = {
      id: 'an1',
      blockId: 'A',
      kind: 'text',
      selector: { quote: 'Alpha body' },
      quote: 'Alpha body',
    };
    document.anchors['reference-only'] = {
      id: 'reference-only',
      blockId: 'A',
      kind: 'text',
      selector: { quote: 'Alpha' },
      quote: 'Alpha',
    };
    document.branches['ac'] = {
      ...document.branches['ac']!,
      source: { blockId: 'A', anchorId: 'an1' },
    };
    document.branches['ref'] = {
      ...branch('A', 'E', 'm'),
      id: 'ref',
      source: { blockId: 'A', anchorId: 'reference-only' },
      role: 'reference',
    };
    expect([...linkedAnchorIds(document)].sort()).toEqual(['an1', 'reference-only']);

    // A branch whose target is gone cannot keep a stale marker alive.
    delete document.branches['ac'];
    document.branches['orphan'] = {
      ...branch('A', 'D', 'm'),
      id: 'orphan',
      source: { blockId: 'A', anchorId: 'an1' },
      targetBlockId: 'missing',
    };
    expect([...linkedAnchorIds(document)].sort()).toEqual(['reference-only']);
  });

  it('marks wrapped direct edges as below and keeps outline order', () => {
    const document = fixture();
    document.blocks['D'] = block('D', 'Delta body');
    document.branches['ad'] = branch('A', 'D', 'z');
    const edges = edgePairs(document, new Set(), new Set(['D']));
    const fromA = edges.filter((edge) => edge.parentId === 'A');
    expect(fromA.map((edge) => `${edge.childId}:${edge.placement}`)).toEqual([
      'B:right',
      'C:right',
      'D:below',
    ]);
    expect(fromA.map((edge) => edge.kind)).toEqual(['direct', 'direct', 'direct']);
    expect(fromA.map((edge) => edge.index)).toEqual([0, 1, 2]);
    expect(fromA.every((edge) => edge.count === 3)).toBe(true);
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

  it('delegates non-text block titles to the shared helper (M4c2 R3)', () => {
    // The sidebar, palette, Page chrome, and print must not title one block
    // differently. Every content shape returns the same string as the layout
    // helper; this catches a future copy drifting from `contentBlockTitle`.
    const blocks: ContentBlock[] = [
      {
        id: 'code',
        content: {
          type: 'doc',
          children: [
            {
              type: 'codeBlock',
              attrs: { language: 'ts' },
              children: [{ type: 'text', text: 'const answer = 42;' }],
            },
          ],
        },
      },
      {
        id: 'math',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [{ type: 'inlineMath', attrs: { latex: '\\lambda x' } }],
            },
          ],
        },
      },
      {
        id: 'image',
        content: {
          type: 'doc',
          children: [{ type: 'image', attrs: { assetId: 'asset-1' } }],
        },
      },
      { id: 'empty', content: { type: 'doc', children: [] } },
      {
        id: 'long',
        content: paragraph(
          'A deliberately long block title that must truncate with an ellipsis before it floods the sidebar row',
        ),
      },
    ];
    for (const candidate of blocks) {
      expect(blockTitle(candidate)).toBe(contentBlockTitle(candidate as never));
    }
    expect(blockTitle(blocks[0])).toBe('const answer = 42;');
    expect(blockTitle(blocks[3])).toBe('Empty block');
    expect(blockTitle(blocks[4])!.endsWith('…')).toBe(true);
  });
});
