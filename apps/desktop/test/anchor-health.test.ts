import { describe, expect, it } from 'vitest';
import type {
  AnchorCandidate,
  Branch,
  ContentBlock,
  ContentNode,
  Document,
} from '@noteforest/core';
import {
  anchorHealthReason,
  anchorRepairPreview,
  buildAnchorHealthRows,
  filterAnchorHealthRows,
  repairCommandForCandidate,
  summarizeAnchorHealth,
} from '../src/renderer/src/lib/anchor-health';

function paragraph(text: string): ContentNode {
  return { type: 'doc', children: [{ type: 'paragraph', children: [{ type: 'text', text }] }] };
}

function formula(latex: string): ContentNode {
  return {
    type: 'doc',
    children: [{ type: 'paragraph', children: [{ type: 'inlineMath', attrs: { latex } }] }],
  };
}

function code(text: string): ContentNode {
  return {
    type: 'doc',
    children: [
      {
        type: 'codeBlock',
        attrs: { language: 'ts' },
        children: [{ type: 'text', text }],
      },
    ],
  };
}

function block(id: string, content: ContentNode): ContentBlock {
  return { id, content };
}

function branch(
  id: string,
  sourceBlockId: string,
  sourceAnchorId: string,
  targetBlockId: string,
): Branch {
  return {
    id,
    source: { blockId: sourceBlockId, anchorId: sourceAnchorId },
    targetBlockId,
    role: 'primary',
    order: 'a',
  };
}

function fixture(content: ContentNode, assets: Document['assets'] = {}): Document {
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
    chapters: [{ id: 'c1', title: 'Anchors', topLevelBlockIds: ['A'] }],
    blocks: {
      A: block('A', content),
      B: block('B', paragraph('Branch target')),
    },
    anchors: {},
    branches: {},
    assets,
    annotations: [],
  };
}

function imageContent(assetId: string): ContentNode {
  return {
    type: 'doc',
    children: [
      {
        type: 'image',
        attrs: { assetId, alt: 'Eigenvector diagram', anchorIds: ['an-image'] },
      },
    ],
  };
}

function imageAnchorDocument(assetRecords: Document['assets']): Document {
  const document = fixture(imageContent('asset-1'), assetRecords);
  document.anchors['an-image'] = {
    id: 'an-image',
    blockId: 'A',
    kind: 'image',
    selector: {
      kind: 'image',
      assetId: 'asset-1',
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.2 },
      crop: { x: 0, y: 0, width: 1, height: 1 },
      point: false,
      label: 'Eigenvector diagram',
    },
    quote: 'Eigenvector diagram',
  };
  document.branches['branch-image'] = branch('branch-image', 'A', 'an-image', 'B');
  return document;
}

function textCandidate(): AnchorCandidate {
  return {
    score: 0.5,
    occurrence: 2,
    context: { prefix: 'beta ', suffix: ' gamma' },
    range: {
      kind: 'text',
      projectionStart: 18,
      projectionEnd: 28,
      ranges: [{ nodePath: [0, 0], start: 18, end: 28 }],
    },
  };
}

describe('anchor repair preview', () => {  it('shows the old and new text context, occurrence, IDs, and target without mutating', () => {
    const document = fixture(paragraph('Alpha eigenvalue beta eigenvalue gamma'));
    document.anchors['an-text'] = {
      id: 'an-text',
      blockId: 'A',
      kind: 'text',
      selector: { kind: 'text', quote: 'eigenvalue', prefix: 'Alpha ', suffix: ' beta', occurrenceHint: 1 },
      quote: 'eigenvalue',
    };
    document.branches['branch-text'] = branch('branch-text', 'A', 'an-text', 'B');

    const before = structuredClone(document);
    const command = repairCommandForCandidate(document, 'an-text', textCandidate());
    expect(command).not.toBeNull();
    const preview = anchorRepairPreview(document, 'an-text', command!);
    expect(preview).not.toBeNull();

    expect(preview?.anchorId).toBe('an-text');
    expect(preview?.blockId).toBe('A');
    expect(preview?.blockTitle).toBe('Alpha eigenvalue beta eigenvalue gamma');
    expect(preview?.chapterTitle).toBe('Anchors');
    expect(preview?.before.quote).toBe('eigenvalue');
    expect(preview?.before.context).toMatch(/Alpha/);
    expect(preview?.before.context).toMatch(/beta/);
    expect(preview?.before.descriptors).toContain('Text quote · occurrence 1');
    expect(preview?.after.quote).toBe('eigenvalue');
    expect(preview?.after.context).toMatch(/beta/);
    expect(preview?.after.context).toMatch(/gamma/);
    expect(preview?.after.descriptors).toContain('Text quote · occurrence 2');
    expect(preview?.after.descriptors).toContain('Text binding · 18–28');
    expect(preview?.branches.map((entry) => entry.id)).toEqual(['branch-text']);
    expect(preview?.branches[0]?.targetBlockId).toBe('B');
    expect(preview?.command).toBe(command);
    expect(document).toEqual(before);
  });

  it('shows the old and new formula term source and occurrence', () => {
    const document = fixture(formula('\\lambda + \\lambda'));
    document.anchors['an-formula'] = {
      id: 'an-formula',
      blockId: 'A',
      kind: 'formula',
      selector: {
        kind: 'formula',
        form: 'term',
        latex: '\\lambda',
        latexStart: 0,
        occurrenceHint: 1,
      },
      quote: '\\lambda',
    };
    document.branches['branch-formula'] = branch('branch-formula', 'A', 'an-formula', 'B');
    const candidate: AnchorCandidate = {
      score: 0.5,
      occurrence: 2,
      context: { prefix: '+ ', suffix: '' },
      range: {
        kind: 'formula',
        nodePath: [0, 0],
        form: 'term',
        latexStart: 10,
        occurrence: 2,
      },
    };

    const command = repairCommandForCandidate(document, 'an-formula', candidate);
    expect(command).not.toBeNull();
    const preview = anchorRepairPreview(document, 'an-formula', command!);
    expect(preview).not.toBeNull();

    expect(preview?.before.quote).toBe('\\lambda');
    expect(preview?.before.descriptors).toContain('Formula term · occurrence 1');
    expect(preview?.before.descriptors).toContain('LaTeX offset 0');
    expect(preview?.after.quote).toBe('\\lambda');
    expect(preview?.after.context).toMatch(/\+/);
    expect(preview?.after.descriptors).toContain('Formula term · occurrence 2');
    expect(preview?.after.descriptors).toContain('LaTeX offset 10');
    expect(preview?.after.descriptors).toContain('Term binding · occurrence 2');
    expect(preview?.branches.map((entry) => entry.id)).toEqual(['branch-formula']);
  });

  it('shows the old and new code source, lines, offsets, and binding', () => {
    const document = fixture(code('eigvals = eigvals(A)'));
    document.anchors['an-code'] = {
      id: 'an-code',
      blockId: 'A',
      kind: 'code',
      selector: {
        kind: 'code',
        quote: 'eigvals',
        form: 'range',
        startOffset: 0,
        endOffset: 7,
        lineStart: 1,
        lineEnd: 1,
        occurrenceHint: 1,
      },
      quote: 'eigvals',
    };
    document.branches['branch-code'] = branch('branch-code', 'A', 'an-code', 'B');
    const candidate: AnchorCandidate = {
      score: 0.5,
      occurrence: 2,
      range: {
        kind: 'code',
        nodePath: [0],
        start: 10,
        end: 17,
        lineStart: 1,
        lineEnd: 1,
      },
    };

    const command = repairCommandForCandidate(document, 'an-code', candidate);
    expect(command).not.toBeNull();
    const preview = anchorRepairPreview(document, 'an-code', command!);
    expect(preview).not.toBeNull();

    expect(preview?.before.quote).toBe('eigvals');
    expect(preview?.before.descriptors).toContain('Code line 1');
    expect(preview?.before.descriptors).toContain('Offsets 0–7');
    expect(preview?.before.descriptors).toContain('Occurrence 1');
    expect(preview?.after.quote).toBe('eigvals');
    expect(preview?.after.descriptors).toContain('Code line 1');
    expect(preview?.after.descriptors).toContain('Offsets 10–17');
    expect(preview?.after.descriptors).toContain('Code binding · offsets 10–17');
    expect(preview?.branches.map((entry) => entry.id)).toEqual(['branch-code']);
  });

  it('rejects a command for a different or missing anchor', () => {
    const document = fixture(paragraph('Alpha eigenvalue beta'));
    document.anchors['an-text'] = {
      id: 'an-text',
      blockId: 'A',
      kind: 'text',
      selector: { kind: 'text', quote: 'eigenvalue' },
      quote: 'eigenvalue',
    };

    expect(
      anchorRepairPreview(document, 'an-text', {
        type: 'anchor.repair',
        anchorId: 'other',
        selector: { kind: 'text', quote: 'alpha' },
        binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 5 }] },
      }),
    ).toBeNull();
    expect(
      anchorRepairPreview(document, 'missing', {
        type: 'anchor.repair',
        anchorId: 'missing',
        selector: { kind: 'text', quote: 'alpha' },
        binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 5 }] },
      }),
    ).toBeNull();
  });
});

describe('anchor health idle projection', () => {
  it('lists idle anchors only under All, with a non-error status and zero branches', () => {
    const document = fixture(paragraph('Alpha eigenvalue beta'));
    document.anchors['an-idle'] = {
      id: 'an-idle',
      blockId: 'A',
      kind: 'text',
      selector: { kind: 'text', quote: 'Alpha' },
      quote: 'Alpha',
    };
    document.anchors['an-live'] = {
      id: 'an-live',
      blockId: 'A',
      kind: 'text',
      selector: { kind: 'text', quote: 'eigenvalue' },
      quote: 'eigenvalue',
    };
    document.branches['branch-live'] = branch('branch-live', 'A', 'an-live', 'B');

    const rows = buildAnchorHealthRows(document);
    expect(rows.map((row) => row.anchorId)).toEqual(['an-idle']);
    expect(rows[0]?.state).toBe('idle');
    expect(rows[0]?.branchCount).toBe(0);
    expect(rows[0]?.branches).toEqual([]);
    expect(rows[0]?.reason).toBe('no-outgoing-branch');
    expect(anchorHealthReason('no-outgoing-branch')).toBe('This anchor has no branches.');

    expect(summarizeAnchorHealth(rows)).toEqual({
      broken: 0,
      ambiguous: 0,
      idle: 1,
      total: 0,
    });
    expect(filterAnchorHealthRows(rows, 'all').map((row) => row.anchorId)).toEqual([
      'an-idle',
    ]);
    expect(filterAnchorHealthRows(rows, 'broken')).toEqual([]);
    expect(filterAnchorHealthRows(rows, 'ambiguous')).toEqual([]);
  });

  it('keeps broken rows in the repair filters and idle rows out of them', () => {
    const document = fixture(paragraph('Alpha eigenvalue beta'));
    document.anchors['an-idle'] = {
      id: 'an-idle',
      blockId: 'A',
      kind: 'text',
      selector: { kind: 'text', quote: 'Alpha' },
      quote: 'Alpha',
    };
    document.anchors['an-broken'] = {
      id: 'an-broken',
      blockId: 'A',
      kind: 'text',
      selector: { kind: 'text', quote: 'missingword' },
      quote: 'missingword',
    };
    document.branches['branch-broken'] = branch('branch-broken', 'A', 'an-broken', 'B');

    const rows = buildAnchorHealthRows(document);
    expect(rows.map((row) => `${row.anchorId}:${row.state}`).sort()).toEqual([
      'an-broken:broken',
      'an-idle:idle',
    ]);
    expect(summarizeAnchorHealth(rows)).toMatchObject({
      broken: 1,
      ambiguous: 0,
      idle: 1,
      total: 1,
    });
    expect(filterAnchorHealthRows(rows, 'all')).toHaveLength(2);
    expect(filterAnchorHealthRows(rows, 'broken').map((row) => row.anchorId)).toEqual([
      'an-broken',
    ]);
  });

  it('reports image asset change and missing asset while keeping the branch and target', () => {
    const asset = {
      id: 'asset-1',
      path: 'assets/asset-1',
      mime: 'image/png',
      originalName: 'forest.png',
    };
    const changed = imageAnchorDocument({});
    const changedRows = buildAnchorHealthRows(changed);
    expect(changedRows).toHaveLength(1);
    expect(changedRows[0]).toMatchObject({
      anchorId: 'an-image',
      kind: 'image',
      state: 'broken',
      reason: 'asset-missing',
      branchCount: 1,
    });
    expect(changedRows[0]?.branches[0]?.targetBlockId).toBe('B');
    expect(anchorHealthReason('asset-missing')).toBe('The image asset is missing.');
    expect(anchorHealthReason('asset-changed')).toBe('The image asset changed.');

    const healthy = imageAnchorDocument({ 'asset-1': asset });
    expect(buildAnchorHealthRows(healthy)).toEqual([]);
    healthy.assets['asset-2'] = { ...asset, id: 'asset-2', path: 'assets/asset-2' };
    healthy.blocks['A'] = block('A', imageContent('asset-2'));
    const replacedRows = buildAnchorHealthRows(healthy);
    expect(replacedRows[0]).toMatchObject({
      anchorId: 'an-image',
      state: 'broken',
      reason: 'asset-changed',
      branchCount: 1,
    });
    expect(Object.values(healthy.branches)).toHaveLength(1);
    expect(healthy.blocks['B']).toBeDefined();
  });
});
