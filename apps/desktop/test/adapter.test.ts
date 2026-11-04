import { describe, expect, it } from 'vitest';
import type { Branch, ContentBlock, ContentNode, Document } from '@noteforest/core';
import {
  buildEditorDocument,
  contentToPM,
  extractBlockContents,
  pmToContent,
  withBody,
} from '../src/renderer/src/lib/adapter';

function block(id: string, children: ContentNode[], extra: Partial<ContentBlock> = {}): ContentBlock {
  return { id, content: { type: 'doc', children }, ...extra };
}

function branch(source: string, target: string, order: string): Branch {
  return {
    id: `${source}-${target}`,
    source: { blockId: source },
    targetBlockId: target,
    role: 'primary',
    order,
  };
}

function fixture(): Document {
  return {
    schemaVersion: 1,
    id: 'doc',
    title: 'Adapter',
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    revision: 1,
    pageSetup: {
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    },
    manualBreakBeforeBlockIds: [],
    chapters: [{ id: 'c1', title: 'One', topLevelBlockIds: ['A', 'B'] }],
    blocks: {
      A: block('A', [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Alpha', marks: [{ type: 'bold' }] }],
        },
        { type: 'bulletList', children: [{ type: 'listItem', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'item' }] }] }] },
      ]),
      B: block('B', []),
      C: block('C', [{ type: 'paragraph', children: [{ type: 'text', text: 'Gamma' }] }]),
    },
    anchors: {},
    branches: { ac: branch('A', 'C', 'm') },
    assets: {},
    annotations: [],
  };
}

describe('core <-> ProseMirror adapter', () => {
  it('renames children to content and back without loss', () => {
    const core: ContentNode = {
      type: 'paragraph',
      attrs: { align: 'left' },
      children: [
        { type: 'text', text: 'hello', marks: [{ type: 'bold', attrs: { weight: 700 } }] },
        { type: 'hardBreak' },
      ],
    };
    const pm = contentToPM(core);
    expect(pm.content?.[0]?.text).toBe('hello');
    expect(pm.children).toBeUndefined();
    expect(pm.content?.[0]?.marks?.[0]?.type).toBe('bold');
    const round = pmToContent(pm);
    expect(round).toEqual(core);
  });

  it('builds wrapper nodes with chapter, block, body, and branches', () => {
    const pm = buildEditorDocument(fixture(), new Set());
    expect(pm.type).toBe('doc');
    const chapter = pm.content?.[0];
    expect(chapter?.type).toBe('chapter');
    expect(chapter?.attrs?.['title']).toBe('One');
    const firstBlock = chapter?.content?.[0];
    expect(firstBlock?.type).toBe('branchBlock');
    expect(firstBlock?.content?.[0]?.type).toBe('blockBody');
    expect(firstBlock?.content?.[1]?.type).toBe('branchChildren');
    expect(firstBlock?.content?.[1]?.content?.[0]?.attrs?.['blockId']).toBe('C');
  });

  it('keeps collapsed subtrees in the document but marks them collapsed', () => {
    const pm = buildEditorDocument(fixture(), new Set(['A']));
    const firstBlock = pm.content?.[0]?.content?.[0];
    expect(firstBlock?.attrs?.['collapsed']).toBe(true);
    expect(firstBlock?.content?.[0]?.attrs?.['collapsed']).toBe(true);
    expect(firstBlock?.content?.[1]?.type).toBe('branchChildren');
    const second = pm.content?.[0]?.content?.[1];
    expect(second?.attrs?.['blockId']).toBe('B');
    expect(second?.content?.[0]?.content?.[0]?.type).toBe('paragraph');
  });

  it('extracts canonical block contents and ignores wrappers', () => {
    const pm = buildEditorDocument(fixture(), new Set());
    const extracted = extractBlockContents(pm);
    expect([...extracted.keys()].sort()).toEqual(['A', 'B', 'C']);
    expect(JSON.stringify(extracted.get('A')?.content)).toContain('"children"');
    expect(JSON.stringify(extracted.get('A')?.content)).not.toContain('"content"');
  });

  it('keeps a legacy empty chapter instead of dropping it', () => {
    const document = fixture();
    document.chapters.push({ id: 'c2', title: 'Legacy empty', topLevelBlockIds: [] });

    const pm = buildEditorDocument(document, new Set());
    expect(pm.content).toHaveLength(2);
    expect(pm.content?.[1]).toEqual({
      type: 'chapter',
      attrs: { chapterId: 'c2', title: 'Legacy empty' },
      content: [],
    });
    expect(JSON.stringify(pm)).not.toContain('__empty__');
    expect([...extractBlockContents(pm).keys()].sort()).toEqual(['A', 'B', 'C']);
  });

  it('builds a chapter-less document without a synthetic block', () => {
    const document = fixture();
    document.chapters = [];

    const pm = buildEditorDocument(document, new Set());
    expect(pm.type).toBe('doc');
    expect(pm.content).toHaveLength(1);
    expect(pm.content?.[0]?.type).toBe('chapter');
    expect(pm.content?.[0]?.content).toEqual([]);
    expect(JSON.stringify(pm)).not.toContain('branchBlock');
  });

  it('preserves unknown root data when merging an edited body', () => {
    const base: ContentNode = {
      type: 'doc',
      attrs: { source: 'import' },
      extensions: { keep: true },
      children: [],
    };
    const merged = withBody(base, {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'new' }] }],
    });
    expect(merged.attrs).toEqual({ source: 'import' });
    expect(merged.extensions).toEqual({ keep: true });
    expect(merged.children?.[0]?.type).toBe('paragraph');
    expect((merged as { content?: unknown }).content).toBeUndefined();
  });
});
