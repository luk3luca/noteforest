/**
 * Anchor resolution index (batch anchor-resolution-index).
 *
 * One index over the core resolver: parity with `resolveAnchor`, the per-block
 * cache, invalidation by content key, asset availability, and the layout
 * projection. No React, DOM, layout or app.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildAnchorIndex } from '../src/anchor-index.js';
import { resolveAnchor } from '../src/anchors.js';
import type { AssetAvailabilityIndex } from '../src/assets.js';
import { parseDocumentJson } from '../src/serialize.js';
import type {
  Anchor,
  Branch,
  ContentBlock,
  ContentMark,
  ContentNode,
  Document,
} from '../src/types.js';

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures',
);

async function loadFixture(name: string): Promise<Document> {
  const text = await fs.readFile(path.join(fixturesDir, name), 'utf8');
  const result = parseDocumentJson(text);
  if (!result.ok) throw new Error(`${name} does not validate`);
  return result.document;
}

async function fixtureNames(): Promise<string[]> {
  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
}

function cloned(document: Document): Document {
  return structuredClone(document);
}

function replaceBranch(document: Document, branchId: string): Document {
  const next = cloned(document);
  const branch = next.branches[branchId];
  if (branch !== undefined) delete next.branches[branchId];
  return next;
}

function addBranch(document: Document, branch: Branch): Document {
  const next = cloned(document);
  next.branches[branch.id] = branch;
  return next;
}

function blockKeysOf(document: Document): Map<string, string> {
  const keys = new Map<string, string>();
  for (const [id, block] of Object.entries(document.blocks)) {
    keys.set(id, JSON.stringify(block.content));
  }
  return keys;
}

function firstAnchorWithBranch(
  document: Document,
): { anchor: Anchor; branch: Branch } | null {
  for (const branch of Object.values(document.branches)) {
    const anchorId = branch.source.anchorId;
    if (anchorId === undefined) continue;
    const anchor = document.anchors[anchorId];
    if (anchor !== undefined) return { anchor, branch };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Generated 1,000-anchor document
// ---------------------------------------------------------------------------

const GENERATED_BLOCKS = 100;
const GENERATED_ANCHORS_PER_BLOCK = 10;

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

function generatedDocument(): Document {
  const blocks: Record<string, ContentBlock> = {};
  const anchors: Record<string, Anchor> = {};
  const branches: Record<string, Branch> = {};
  const blockIds: string[] = [];
  for (let blockIndex = 0; blockIndex < GENERATED_BLOCKS; blockIndex += 1) {
    const blockId = `index-block-${blockIndex}`;
    blockIds.push(blockId);
    const words = [`alpha${blockIndex}`, `beta${blockIndex}`, `gamma${blockIndex}`, `delta${blockIndex}`];
    const textIds = words.map((_, offset) => `index-text-${blockIndex}-${offset}`);
    const codeAnchorId = `index-code-${blockIndex}`;
    blocks[blockId] = {
      id: blockId,
      content: {
        type: 'doc',
        children: [
          paragraph(...words.map((word, offset) => text(`${word} `, [textIds[offset] as string]))),
          paragraph(
            text(`The ${words[0]} is `),
            {
              type: 'inlineMath',
              attrs: {
                latex: `x_{${blockIndex}}^2 + y_{${blockIndex}}`,
                anchorIds: [codeAnchorId],
              },
            },
          ),
          {
            type: 'codeBlock',
            attrs: {
              text: `const total${blockIndex} = sum(matrix, vector);`,
              language: 'typescript',
              anchorIds: [`index-quote-${blockIndex}`],
            },
          },
        ],
      },
    };
    for (let offset = 0; offset < textIds.length; offset += 1) {
      const anchorId = textIds[offset] as string;
      anchors[anchorId] = {
        id: anchorId,
        blockId,
        kind: 'text',
        selector: { kind: 'text', quote: words[offset] as string, occurrenceHint: 1 },
        quote: words[offset] as string,
        occurrenceHint: 1,
      };
      branches[`index-branch-${blockIndex}-${offset}`] = {
        id: `index-branch-${blockIndex}-${offset}`,
        source: { blockId, anchorId },
        targetBlockId: blockIds[Math.max(0, blockIndex - 1)] as string,
        role: 'primary',
        order: `a${offset + 1}`,
      };
    }
    anchors[codeAnchorId] = {
      id: codeAnchorId,
      blockId,
      kind: 'formula',
      selector: { kind: 'formula', form: 'whole', latex: `x_{${blockIndex}}^2 + y_{${blockIndex}}` },
      quote: `x_{${blockIndex}}^2 + y_{${blockIndex}}`,
    };
    branches[`index-branch-formula-${blockIndex}`] = {
      id: `index-branch-formula-${blockIndex}`,
      source: { blockId, anchorId: codeAnchorId },
      targetBlockId: blockIds[Math.max(0, blockIndex - 1)] as string,
      role: 'primary',
      order: 'b1',
    };
    const codeQuoteId = `index-quote-${blockIndex}`;
    anchors[codeQuoteId] = {
      id: codeQuoteId,
      blockId,
      kind: 'code',
      selector: {
        kind: 'code',
        form: 'range',
        quote: 'sum(matrix, vector)',
        prefix: `const total${blockIndex} = `,
        suffix: ';',
        occurrenceHint: 1,
        startOffset: `const total${blockIndex} = `.length,
        endOffset: `const total${blockIndex} = `.length + 19,
        lineStart: 1,
        lineEnd: 1,
      },
      quote: 'sum(matrix, vector)',
      occurrenceHint: 1,
    };
    branches[`index-branch-code-${blockIndex}`] = {
      id: `index-branch-code-${blockIndex}`,
      source: { blockId, anchorId: codeQuoteId },
      targetBlockId: blockIds[Math.max(0, blockIndex - 1)] as string,
      role: 'primary',
      order: 'c1',
    };
    for (let offset = 0; offset < 4; offset += 1) {
      const anchorId = `index-extra-${blockIndex}-${offset}`;
      anchors[anchorId] = {
        id: anchorId,
        blockId,
        kind: 'text',
        selector: { kind: 'text', quote: words[offset % words.length] as string, occurrenceHint: 1 },
        quote: words[offset % words.length] as string,
      };
      branches[`index-branch-extra-${blockIndex}-${offset}`] = {
        id: `index-branch-extra-${blockIndex}-${offset}`,
        source: { blockId, anchorId },
        targetBlockId: blockIds[Math.max(0, blockIndex - 1)] as string,
        role: 'reference',
        order: `d${offset + 1}`,
      };
    }
  }
  return {
    schemaVersion: 2,
    id: 'index-generated',
    title: 'Generated index document',
    createdAt: '2026-11-18T10:00:00.000Z',
    updatedAt: '2026-11-18T10:00:00.000Z',
    revision: 1,
    chapters: [{ id: 'index-chapter', title: 'Index', topLevelBlockIds: blockIds }],
    blocks,
    anchors,
    branches,
    assets: {},
  };
}

// ---------------------------------------------------------------------------

describe('AnchorIndex parity', () => {
  it('deep-equals resolveAnchor for every anchor in every fixture', async () => {
    for (const name of await fixtureNames()) {
      const document = await loadFixture(name);
      const index = buildAnchorIndex(document);
      for (const anchorId of Object.keys(document.anchors)) {
        expect(index.entry(anchorId), `${name}:${anchorId}`).toEqual(
          resolveAnchor(document, anchorId),
        );
      }
    }
  });

  it('deep-equals resolveAnchor for a generated 1,000-anchor document', () => {
    const document = generatedDocument();
    expect(Object.keys(document.anchors)).toHaveLength(1000);
    const index = buildAnchorIndex(document);
    expect(index.all()).toHaveLength(1000);
    for (const anchorId of Object.keys(document.anchors)) {
      expect(index.entry(anchorId), anchorId).toEqual(resolveAnchor(document, anchorId));
    }
  });

  it('keeps the anchor-ID order and groups every anchor by declared block', () => {
    const document = generatedDocument();
    const index = buildAnchorIndex(document);
    expect(index.all().map((resolution) => resolution.anchorId)).toEqual(
      Object.keys(document.anchors).sort(),
    );
    for (const resolution of index.all()) {
      const list = index.view().byBlock[resolution.blockId] ?? [];
      expect(list.some((entry) => entry.anchorId === resolution.anchorId)).toBe(true);
    }
  });
});

describe('AnchorIndex cache', () => {
  it('indexes only the edited block and reuses the rest', async () => {
    const document = await loadFixture('m3-anchor-kinds.json');
    const index = buildAnchorIndex(document, { blockKeys: blockKeysOf(document) });
    const anchorBlockIds = [
      ...new Set(Object.values(document.anchors).map((anchor) => anchor.blockId)),
    ];
    expect(index.stats.blocksIndexed).toBe(anchorBlockIds.length);
    expect(index.stats.blocksReused).toBe(0);

    const editedBlockId = anchorBlockIds[0] as string;
    const next = cloned(document);
    const block = next.blocks[editedBlockId] as ContentBlock;
    block.content = {
      ...block.content,
      children: [...(block.content.children ?? []), paragraph(text(' appended text'))],
    };
    const nextKeys = blockKeysOf(next);
    const updated = index.update(next, {
      blockKeys: nextKeys,
      editedBlockIds: [editedBlockId],
    });
    expect(updated.stats.blocksIndexed).toBe(1);
    expect(updated.stats.blocksReused).toBe(anchorBlockIds.length - 1);

    const fresh = buildAnchorIndex(next, { blockKeys: nextKeys });
    for (const anchorId of Object.keys(next.anchors)) {
      expect(updated.entry(anchorId), anchorId).toEqual(fresh.entry(anchorId));
    }
    for (const blockId of anchorBlockIds) {
      if (blockId === editedBlockId) continue;
      expect(updated.blockIndex(blockId)).toBe(index.blockIndex(blockId));
    }
  });

  it('rebuilds a block whose supplied key is stale and never reuses it silently', async () => {
    const document = await loadFixture('m3-anchor-kinds.json');
    const staleKeys = blockKeysOf(document);
    const index = buildAnchorIndex(document, { blockKeys: staleKeys });

    const changed = cloned(document);
    const block = changed.blocks['m3k-text'] as ContentBlock;
    block.content = {
      ...block.content,
      children: [paragraph(text('unrelated prose only'))],
    };
    const updated = index.update(changed, { blockKeys: staleKeys });
    expect(updated.stats.blocksIndexed).toBeGreaterThanOrEqual(1);
    expect(updated.entry('m3k-a-text')).toEqual(resolveAnchor(changed, 'm3k-a-text'));
    expect(updated.entry('m3k-a-text')?.state).toBe('broken');
  });

  it('starts fresh on another document id', async () => {
    const document = await loadFixture('m3-anchor-kinds.json');
    const index = buildAnchorIndex(document);
    const other = cloned(document);
    other.id = 'another-document';
    other.anchors = {};
    const updated = index.update(other, { blockKeys: new Map() });
    expect(updated.identity.documentId).toBe('another-document');
    expect(updated.all()).toHaveLength(0);
    expect(updated.stats.blocksIndexed).toBe(0);
  });

  it('keeps a lazily built block index available to find', async () => {
    const document = await loadFixture('m3-anchor-kinds.json');
    const index = buildAnchorIndex(document);
    expect(index.blockIndex('m3k-broken')).not.toBeNull();
    expect(index.blockIndex('m3k-broken')).toBe(index.blockIndex('m3k-broken'));
    expect(index.blockIndex('missing-block')).toBeNull();
  });
});

describe('AnchorIndex invalidation', () => {
  it('flips idle and back on a branch change without rebuilding a block', async () => {
    const document = await loadFixture('m3-anchor-kinds.json');
    const found = firstAnchorWithBranch(document);
    expect(found).not.toBeNull();
    if (found === null) return;
    const { anchor, branch } = found;
    const index = buildAnchorIndex(document, { blockKeys: blockKeysOf(document) });
    expect(index.entry(anchor.id)?.state).not.toBe('idle');

    const removed = replaceBranch(document, branch.id);
    const idle = index.update(removed, { blockKeys: blockKeysOf(removed) });
    expect(idle.stats.blocksIndexed).toBe(0);
    expect(idle.entry(anchor.id)?.state).toBe('idle');

    const restored = addBranch(removed, branch);
    const resolved = idle.update(restored, { blockKeys: blockKeysOf(restored) });
    expect(resolved.stats.blocksIndexed).toBe(0);
    expect(resolved.entry(anchor.id)).toEqual(resolveAnchor(restored, anchor.id));
    expect(resolved.entry(anchor.id)?.state).not.toBe('idle');
  });

  it('flips image states on an availability change without rebuilding a block', async () => {
    const document = await loadFixture('m3-image-regions.json');
    const index = buildAnchorIndex(document, { blockKeys: blockKeysOf(document) });
    const anchorId = 'm3i-a-region-a';
    expect(index.entry(anchorId)?.state).toBe('resolved');

    const assetId = '2492f7a53cb3fced6fd50d12d994a18891e56945d3a508a593678b31992c6f04';
    const availability: AssetAvailabilityIndex = { [assetId]: 'asset-changed' };
    const port = (): AssetAvailabilityIndex => availability;
    const updated = index.update(document, { blockKeys: blockKeysOf(document) });
    expect(updated.stats.blocksIndexed).toBe(0);
    expect(updated.entry(anchorId)?.state).toBe('resolved');

    const live = buildAnchorIndex(document, {
      blockKeys: blockKeysOf(document),
      assetAvailabilityPort: port,
    });
    expect(live.entry(anchorId)).toEqual(
      resolveAnchor(document, anchorId, { assetAvailability: availability }),
    );
    expect(live.entry(anchorId)?.state).toBe('broken');
  });

  it('reindexes only the block whose content actually changed', async () => {
    const document = await loadFixture('m3-anchor-kinds.json');
    const index = buildAnchorIndex(document, { blockKeys: blockKeysOf(document) });
    const next = cloned(document);
    const block = next.blocks['m3k-ambiguous'] as ContentBlock;
    block.content = { ...block.content, children: [paragraph(text('repeated'))] };
    const updated = index.update(next, {
      blockKeys: blockKeysOf(next),
      editedBlockIds: ['m3k-ambiguous'],
    });
    expect(updated.stats.blocksIndexed).toBe(1);
  });
});

describe('AnchorIndex view', () => {
  it('carries identity, every state and only the semantic range', async () => {
    const document = await loadFixture('m3-anchor-kinds.json');
    const index = buildAnchorIndex(document);
    const view = index.view();
    expect(view.documentId).toBe(document.id);
    expect(view.revision).toBe(document.revision);

    const states = new Set<string>();
    for (const list of Object.values(view.byBlock)) {
      for (const entry of list) {
        states.add(entry.state);
        expect(Object.keys(entry).sort()).toEqual(['anchorId', 'range', 'state']);
      }
    }
    expect(states.has('resolved')).toBe(true);
    expect(states.has('ambiguous')).toBe(true);
    expect(states.has('broken')).toBe(true);

    const ambiguous = index
      .all()
      .find((resolution) => resolution.state === 'ambiguous');
    expect(ambiguous).toBeDefined();
    const entry = index.view().byBlock[ambiguous?.blockId ?? '']?.find(
      (candidate) => candidate.anchorId === ambiguous?.anchorId,
    );
    expect(entry?.range).toBeNull();

    const resolved = index.all().find((resolution) => resolution.state === 'resolved');
    const resolvedEntry = index.view().byBlock[resolved?.blockId ?? '']?.find(
      (candidate) => candidate.anchorId === resolved?.anchorId,
    );
    expect(resolvedEntry?.range).toEqual(resolved?.resolved?.range);
    expect(index.view()).toBe(view);
  });

  it('includes idle and block-missing anchors under their declared block', async () => {
    const document = cloned(await loadFixture('m3-anchor-kinds.json'));
    const found = firstAnchorWithBranch(document);
    if (found === null) throw new Error('fixture has no anchored branch');
    delete document.branches[found.branch.id];
    document.anchors['missing-block-anchor'] = {
      id: 'missing-block-anchor',
      blockId: 'no-such-block',
      kind: 'text',
      selector: { kind: 'text', quote: 'x' },
    };
    const index = buildAnchorIndex(document);
    const byBlock = index.view().byBlock;
    expect(byBlock[found.anchor.blockId]?.some((entry) => entry.anchorId === found.anchor.id && entry.state === 'idle')).toBe(true);
    expect(byBlock['no-such-block']).toEqual([
      { anchorId: 'missing-block-anchor', state: 'block-missing', range: null },
    ]);
  });
});
