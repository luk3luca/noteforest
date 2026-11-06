import { describe, expect, it } from 'vitest';
import type {
  AnchorCandidate,
  Branch,
  ContentBlock,
  ContentNode,
  Document,
} from '@noteforest/core';
import {
  anchorRepairPreview,
  repairCommandForCandidate,
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

function fixture(content: ContentNode): Document {
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
    assets: {},
    annotations: [],
  };
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

describe('anchor repair preview', () => {
  it('shows the old and new text context, occurrence, IDs, and target without mutating', () => {
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
