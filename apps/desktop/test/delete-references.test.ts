import { describe, expect, it } from 'vitest';
import type {
  Branch,
  ContentBlock,
  ContentNode,
  Document,
} from '@noteforest/core';
import { externalReferenceParents } from '../src/renderer/src/lib/tree';

function paragraph(text: string): ContentNode {
  return { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] };
}

function block(id: string, text: string): ContentBlock {
  return { id, content: paragraph(text) };
}

function primary(source: string, target: string, order: string): Branch {
  return { id: `primary-${source}-${target}`, source: { blockId: source }, targetBlockId: target, role: 'primary', order };
}

function reference(id: string, source: string, target: string, order: string): Branch {
  return { id, source: { blockId: source }, targetBlockId: target, role: 'reference', order };
}

function fixture(): Document {
  return {
    schemaVersion: 1,
    id: 'doc',
    title: 'Delete references',
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
      { id: 'c1', title: 'Deletion', topLevelBlockIds: ['A', 'S1'] },
      { id: 'c2', title: 'Sources', topLevelBlockIds: ['S2'] },
    ],
    blocks: {
      A: block('A', 'Delete parent'),
      B: block('B', 'Delete child'),
      C: block('C', 'Delete grandchild'),
      S1: block('S1', 'External source one'),
      S2: block('S2', 'External source two'),
    },
    anchors: {},
    branches: {
      'primary-A-B': primary('A', 'B', 'a'),
      'primary-B-C': primary('B', 'C', 'a'),
      'ref-S1-B': reference('ref-S1-B', 'S1', 'B', 'a'),
      'ref-S2-A': reference('ref-S2-A', 'S2', 'A', 'a'),
      'ref-C-B': reference('ref-C-B', 'C', 'B', 'b'),
    },
    assets: {},
    annotations: [],
  };
}

describe('delete reference disclosure', () => {
  it('lists only external references to the deleted block in promote mode', () => {
    expect(externalReferenceParents(fixture(), 'A', 'promote')).toEqual([
      {
        branchId: 'ref-S2-A',
        sourceBlockId: 'S2',
        sourceTitle: 'External source two',
        chapterId: 'c2',
        chapterTitle: 'Sources',
        role: 'reference',
        targetBlockId: 'A',
        targetTitle: 'Delete parent',
      },
    ]);
  });

  it('lists external references to every subtree block in delete-subtree mode', () => {
    const references = externalReferenceParents(fixture(), 'A', 'delete-subtree');
    expect(references.map((entry) => entry.branchId)).toEqual(['ref-S1-B', 'ref-S2-A']);
    expect(references.map((entry) => entry.targetBlockId)).toEqual(['B', 'A']);
    expect(references[0]).toMatchObject({
      sourceBlockId: 'S1',
      sourceTitle: 'External source one',
      chapterId: 'c1',
      chapterTitle: 'Deletion',
      role: 'reference',
      targetTitle: 'Delete child',
    });
    expect(references.some((entry) => entry.branchId === 'ref-C-B')).toBe(false);
  });

  it('lists every external reference to the deleted block, including from a promoted descendant', () => {
    expect(externalReferenceParents(fixture(), 'B', 'promote').map((entry) => entry.branchId)).toEqual([
      'ref-C-B',
      'ref-S1-B',
    ]);
  });
});
