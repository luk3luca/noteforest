/**
 * 1,000-anchor resolution performance (M3f2).
 *
 * This is a unit/perf guard, not a critical e2e. It builds a valid document with
 * 1,000 mixed text/formula/code anchors and an outgoing reference branch for
 * each anchor (so resolution actually runs instead of short-circuiting idle).
 */

import { describe, expect, it } from 'vitest';
import { buildAnchorIndex } from '../src/anchor-index.js';
import { resolveDocumentAnchors } from '../src/anchors.js';
import type {
  Anchor,
  Branch,
  ContentBlock,
  ContentMark,
  ContentNode,
  Document,
} from '../src/types.js';

const TIMESTAMP = '2026-11-06T10:00:00.000Z';
const BLOCK_COUNT = 100;
const ANCHORS_PER_BLOCK = 10;

function mark(anchorIds: string[]): ContentMark {
  return { type: 'anchor', attrs: { anchorIds: [...anchorIds].sort() } };
}

function text(value: string, anchorIds?: string[]): ContentNode {
  const node: ContentNode = { type: 'text', text: value };
  if (anchorIds !== undefined) node.marks = [mark(anchorIds)];
  return node;
}

function paragraph(...children: ContentNode[]): ContentNode {
  return { type: 'paragraph', children };
}

interface GeneratedDocument {
  document: Document;
  anchorIds: string[];
}

function buildDocument(): GeneratedDocument {
  const blocks: Record<string, ContentBlock> = {};
  const anchors: Record<string, Anchor> = {};
  const branches: Record<string, Branch> = {};
  const blockIds: string[] = [];
  const anchorIds: string[] = [];

  for (let blockIndex = 0; blockIndex < BLOCK_COUNT; blockIndex += 1) {
    const blockId = `perf-block-${blockIndex}`;
    blockIds.push(blockId);
    const textIds = [0, 1, 2, 3].map((offset) => `perf-a-text-${blockIndex}-${offset}`);
    const formulaIds = [0, 1, 2].map((offset) => `perf-a-formula-${blockIndex}-${offset}`);
    const codeIds = [0, 1, 2].map((offset) => `perf-a-code-${blockIndex}-${offset}`);
    anchorIds.push(...textIds, ...formulaIds, ...codeIds);

    const words = ['alpha', 'beta', 'gamma', 'delta'];
    const formulaLatex = [
      `a_{${blockIndex}}^2 + b_{${blockIndex}}^2 = c_{${blockIndex}}^2`,
      `x_{${blockIndex}} + y_{${blockIndex}}`,
      `p_{${blockIndex}} q_{${blockIndex}}`,
    ];
    const codeText = [
      `const total${blockIndex} = compute${blockIndex}(matrix, vector);`,
      `return total${blockIndex} + offset${blockIndex};`,
    ].join('\n');
    const codeQuotes = [
      `compute${blockIndex}(matrix, vector)`,
      `matrix, vector`,
      `offset${blockIndex}`,
    ];

    const content: ContentNode = {
      type: 'doc',
      children: [
        paragraph(
          ...words.map((word, offset) => text(`${word} `, [textIds[offset] as string])),
        ),
        paragraph(
          ...formulaLatex.map((latex, offset) => ({
            type: 'inlineMath',
            attrs: { latex, anchorIds: [formulaIds[offset] as string] },
          })),
        ),
        {
          type: 'codeBlock',
          attrs: {
            text: codeText,
            language: 'typescript',
            anchorIds: [...codeIds].sort(),
          },
        },
      ],
    };
    blocks[blockId] = { id: blockId, label: `Block ${blockIndex}`, content, border: 'subtle' };

    for (const [offset, word] of words.entries()) {
      const anchorId = textIds[offset] as string;
      anchors[anchorId] = {
        id: anchorId,
        blockId,
        kind: 'text',
        selector: { kind: 'text', quote: word, occurrenceHint: 1 },
        quote: word,
        occurrenceHint: 1,
      };
    }
    for (const [offset, latex] of formulaLatex.entries()) {
      const anchorId = formulaIds[offset] as string;
      anchors[anchorId] = {
        id: anchorId,
        blockId,
        kind: 'formula',
        selector: { kind: 'formula', form: 'whole', latex },
        quote: latex,
      };
    }
    for (const [offset, quote] of codeQuotes.entries()) {
      const anchorId = codeIds[offset] as string;
      const startOffset = codeText.indexOf(quote);
      const endOffset = startOffset + quote.length;
      anchors[anchorId] = {
        id: anchorId,
        blockId,
        kind: 'code',
        selector: {
          kind: 'code',
          form: 'range',
          quote,
          occurrenceHint: 1,
          startOffset,
          endOffset,
          lineStart: 1,
          lineEnd: offset === 2 ? 2 : 1,
        },
        quote,
        occurrenceHint: 1,
      };
    }
  }

  // One outgoing reference per anchor keeps every anchor non-idle. Reference
  // edges are valid for resolution and do not change the primary structure.
  let branchNumber = 0;
  for (const anchorId of anchorIds) {
    const anchorRecord = anchors[anchorId];
    if (anchorRecord === undefined) continue;
    const sourceIndex = blockIds.indexOf(anchorRecord.blockId);
    const targetBlockId = blockIds[(sourceIndex + 1) % blockIds.length] as string;
    const branchId = `perf-branch-${branchNumber}`;
    branchNumber += 1;
    branches[branchId] = {
      id: branchId,
      source: { blockId: anchorRecord.blockId, anchorId },
      targetBlockId,
      role: 'reference',
      order: 'a1',
    };
  }

  return {
    document: {
      schemaVersion: 2,
      id: 'perf-1000-anchors',
      title: '1,000 anchor performance',
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
      revision: 0,
      chapters: [
        {
          id: 'perf-chapter-1',
          title: 'Performance',
          topLevelBlockIds: blockIds,
        },
      ],
      blocks,
      anchors,
      branches,
      assets: {},
      annotations: [],
    },
    anchorIds,
  };
}

describe('1,000-anchor document resolution', () => {
  it('resolves every mixed anchor within the 100 ms budget', () => {
    const { document, anchorIds } = buildDocument();
    expect(anchorIds).toHaveLength(BLOCK_COUNT * ANCHORS_PER_BLOCK);

    const start = performance.now();
    const resolutions = resolveDocumentAnchors(document);
    const elapsed = performance.now() - start;

    expect(Object.keys(resolutions.byId)).toHaveLength(1000);
    expect(resolutions.counts).toEqual({
      resolved: 1000,
      ambiguous: 0,
      broken: 0,
      idle: 0,
      'block-missing': 0,
    });
    expect(elapsed).toBeLessThan(100);
    if (process.env.NOTEFOREST_PERF_REPORT === '1') {
      console.info(`1,000-anchor resolution: first=${elapsed.toFixed(2)} ms`);
    }

    // A second run must be deterministic as well as fast.
    const secondStart = performance.now();
    const second = resolveDocumentAnchors(document);
    const secondElapsed = performance.now() - secondStart;
    expect(second.byId).toEqual(resolutions.byId);
    expect(secondElapsed).toBeLessThan(100);
    if (process.env.NOTEFOREST_PERF_REPORT === '1') {
      console.info(`1,000-anchor resolution: second=${secondElapsed.toFixed(2)} ms`);
    }
  });
});

describe('1,000-anchor index build and warm update', () => {
  it('builds the index within the 100 ms guard', () => {
    const { document } = buildDocument();
    const start = performance.now();
    const index = buildAnchorIndex(document);
    const elapsed = performance.now() - start;
    expect(index.all()).toHaveLength(1000);
    expect(index.stats.blocksIndexed).toBe(BLOCK_COUNT);
    expect(elapsed).toBeLessThan(100);
    if (process.env.NOTEFOREST_PERF_REPORT === '1') {
      console.info(`1,000-anchor index build: ${elapsed.toFixed(2)} ms`);
    }
  });

  it('indexes exactly one block on a warm update, under one frame p95', () => {
    const { document } = buildDocument();
    const index = buildAnchorIndex(document);
    const blockIds = Object.keys(document.blocks);
    const samples: number[] = [];
    let current = index;
    let currentDocument = document;
    for (let run = 0; run < 20; run += 1) {
      const blockId = blockIds[run % blockIds.length] as string;
      const next = structuredClone(currentDocument);
      const block = next.blocks[blockId];
      if (block === undefined) throw new Error('missing block');
      const children = block.content.children ?? [];
      block.content = {
        ...block.content,
        children: [
          ...children.slice(0, -1),
          {
            type: 'paragraph',
            children: [{ type: 'text', text: `warm update ${run}` }],
          },
        ],
      };
      const keys = new Map<string, string>();
      for (const [id, candidate] of Object.entries(next.blocks)) {
        keys.set(id, JSON.stringify(candidate.content));
      }
      const start = performance.now();
      current = current.update(next, { blockKeys: keys, editedBlockIds: [blockId] });
      currentDocument = next;
      samples.push(performance.now() - start);
      expect(current.stats.blocksIndexed).toBe(1);
      expect(current.stats.blocksReused).toBe(BLOCK_COUNT - 1);
    }
    samples.sort((left, right) => left - right);
    const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] as number;
    expect(p95).toBeLessThan(16);
    if (process.env.NOTEFOREST_PERF_REPORT === '1') {
      console.info(`1,000-anchor warm update p95: ${p95.toFixed(2)} ms`);
    }
  });
});
