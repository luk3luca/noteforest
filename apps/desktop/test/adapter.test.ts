import { describe, expect, it } from 'vitest';
import type { Branch, ContentBlock, ContentNode, Document } from '@noteforest/core';
import {
  buildEditorDocument,
  contentToPM,
  extractBlockContents,
  pmToContent,
  projectPrimaryChildren,
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

  it('projects anchored children into a lane before direct children', () => {
    const document = fixture();
    document.blocks['D'] = block('D', [
      { type: 'paragraph', children: [{ type: 'text', text: 'Direct' }] },
    ]);
    document.anchors['an1'] = {
      id: 'an1',
      blockId: 'A',
      kind: 'text',
      selector: { quote: 'Alpha' },
      quote: 'Alpha',
    };
    document.branches['ac'] = {
      ...document.branches['ac']!,
      source: { blockId: 'A', anchorId: 'an1' },
      order: 'a',
    };
    document.branches['ad'] = branch('A', 'D', 'm');

    const projection = projectPrimaryChildren(document, 'A');
    expect(projection.callouts).toEqual([
      {
        branchId: 'A-C',
        blockId: 'C',
        parentId: 'A',
        anchorId: 'an1',
        kind: 'text',
        quote: 'Alpha',
        state: 'resolved',
      },
    ]);
    expect(projection.direct).toEqual([{ branchId: 'A-D', blockId: 'D' }]);
    expect(projection.children.map((entry) => `${entry.kind}:${entry.blockId}`)).toEqual([
      'callout:C',
      'direct:D',
    ]);

    const blockA = buildEditorDocument(document, new Set()).content?.[0]?.content?.[0];
    expect(blockA?.attrs?.['hasCallouts']).toBe(true);
    expect(blockA?.content?.map((node) => node.type)).toEqual([
      'blockBody',
      'calloutLane',
      'branchChildren',
    ]);
    const lane = blockA?.content?.[1];
    expect(lane?.attrs?.['parentId']).toBe('A');
    const callout = lane?.content?.[0];
    expect(callout?.type).toBe('branchBlock');
    expect(callout?.attrs?.['callout']).toBe(true);
    expect(callout?.attrs?.['anchorId']).toBe('an1');
    expect(callout?.attrs?.['anchorKind']).toBe('text');
    expect(callout?.attrs?.['anchorQuote']).toBe('Alpha');
    expect(callout?.attrs?.['anchorState']).toBe('resolved');
    expect(callout?.attrs?.['calloutParentId']).toBe('A');
    expect(callout?.content?.[0]?.attrs?.['callout']).toBe(true);
    expect(callout?.content?.[0]?.attrs?.['calloutParentId']).toBe('A');
    expect(blockA?.content?.[2]?.content?.map((node) => node.attrs?.['blockId'])).toEqual(['D']);
  });

  it('orders callouts before wrapped direct children in one below stack', () => {
    const document = fixture();
    document.blocks['D'] = block('D', [
      { type: 'paragraph', children: [{ type: 'text', text: 'Direct D' }] },
    ]);
    document.blocks['E'] = block('E', [
      { type: 'paragraph', children: [{ type: 'text', text: 'Direct E' }] },
    ]);
    document.anchors['an1'] = {
      id: 'an1',
      blockId: 'A',
      kind: 'text',
      selector: { quote: 'Alpha' },
      quote: 'Alpha',
    };
    document.branches['ac'] = {
      ...document.branches['ac']!,
      source: { blockId: 'A', anchorId: 'an1' },
      order: 'a',
    };
    document.branches['ad'] = branch('A', 'D', 'm');
    document.branches['ae'] = branch('A', 'E', 't');

    const pm = buildEditorDocument(document, new Set(), new Set(['D']));
    const blockA = pm.content?.[0]?.content?.[0];
    expect(blockA?.content?.map((node) => node.type)).toEqual([
      'blockBody',
      'calloutLane',
      'branchChildren',
    ]);
    const lane = blockA?.content?.[1];
    expect(lane?.content?.map((node) => node.attrs?.['blockId'])).toEqual(['C', 'D']);
    const calloutRow = lane?.content?.[0];
    const directRow = lane?.content?.[1];
    expect(calloutRow?.attrs?.['callout']).toBe(true);
    expect(calloutRow?.attrs?.['belowRow']).toBe(true);
    expect(calloutRow?.attrs?.['rowKind']).toBe('callout');
    expect(directRow?.attrs?.['callout']).toBe(false);
    expect(directRow?.attrs?.['belowRow']).toBe(true);
    expect(directRow?.attrs?.['rowKind']).toBe('direct');
    expect(directRow?.attrs?.['anchorId']).toBeNull();
    expect(directRow?.content?.[0]?.attrs?.['callout']).toBeUndefined();
    expect(directRow?.content?.[0]?.attrs?.['belowRow']).toBe(true);
    expect(blockA?.content?.[2]?.content?.map((node) => node.attrs?.['blockId'])).toEqual(['E']);

    // Without callouts a wrapped direct child still creates the below stack,
    // and the remaining direct child stays in the right group.
    const directOnly = fixture();
    delete directOnly.branches['ac'];
    directOnly.blocks['D'] = block('D', []);
    directOnly.blocks['E'] = block('E', []);
    directOnly.branches['ad'] = branch('A', 'D', 'm');
    directOnly.branches['ae'] = branch('A', 'E', 't');
    const onlyDirect = buildEditorDocument(directOnly, new Set(), new Set(['D']));
    const blockA2 = onlyDirect.content?.[0]?.content?.[0];
    expect(blockA2?.attrs?.['hasCallouts']).toBe(true);
    expect(blockA2?.content?.[1]?.type).toBe('calloutLane');
    expect(blockA2?.content?.[1]?.content?.map((node) => node.attrs?.['blockId'])).toEqual(['D']);
    expect(blockA2?.content?.[1]?.content?.[0]?.attrs?.['rowKind']).toBe('direct');
    expect(blockA2?.content?.[2]?.content?.map((node) => node.attrs?.['blockId'])).toEqual(['E']);
  });

  it('keeps a lone direct child in the right group when no placement is given', () => {
    const document = fixture();
    document.blocks['D'] = block('D', []);
    document.branches['ad'] = branch('A', 'D', 't');
    const pm = buildEditorDocument(document, new Set());
    const blockA = pm.content?.[0]?.content?.[0];
    expect(blockA?.attrs?.['hasCallouts']).toBe(false);
    expect(blockA?.content?.map((node) => node.type)).toEqual(['blockBody', 'branchChildren']);
    expect(blockA?.content?.[1]?.content?.map((node) => node.attrs?.['blockId'])).toEqual(['C', 'D']);
  });


  it('orders callouts by anchor position, then branch order, and truncates the quote', () => {
    const document = fixture();
    document.blocks['D'] = block('D', []);
    document.blocks['E'] = block('E', []);
    document.blocks['F'] = block('F', []);
    // Replace the fixture's direct A→C edge with the anchored variants below.
    delete document.branches['ac'];
    document.anchors['late'] = {
      id: 'late',
      blockId: 'A',
      kind: 'text',
      selector: { quote: 'item' },
      quote: 'item',
    };
    document.anchors['early'] = {
      id: 'early',
      blockId: 'A',
      kind: 'text',
      selector: { quote: 'Alpha' },
      quote: 'Alpha',
    };
    document.branches['early-a'] = {
      ...branch('A', 'C', 'b'),
      source: { blockId: 'A', anchorId: 'early' },
    };
    document.branches['early-b'] = {
      ...branch('A', 'F', 'a'),
      source: { blockId: 'A', anchorId: 'early' },
    };
    document.branches['late-a'] = {
      ...branch('A', 'E', 'm'),
      source: { blockId: 'A', anchorId: 'late' },
    };
    document.branches['direct'] = branch('A', 'D', 't');

    const projection = projectPrimaryChildren(document, 'A');
    expect(projection.callouts.map((callout) => callout.anchorId)).toEqual([
      'early',
      'early',
      'late',
    ]);
    expect(projection.callouts.map((callout) => callout.blockId)).toEqual(['F', 'C', 'E']);
    expect(projection.direct.map((item) => item.blockId)).toEqual(['D']);

    document.anchors['long'] = {
      id: 'long',
      blockId: 'A',
      kind: 'text',
      selector: { quote: 'x'.repeat(80) },
      quote: 'x'.repeat(80),
    };
    document.branches['long'] = {
      ...branch('A', 'D', 'z'),
      id: 'long-branch',
      source: { blockId: 'A', anchorId: 'long' },
    };
    const longQuote = projectPrimaryChildren(document, 'A').callouts.at(-1)?.quote ?? '';
    expect(longQuote).toHaveLength(64);
    expect(longQuote.endsWith('…')).toBe(true);
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
