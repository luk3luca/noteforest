/**
 * Every checked-in Spike fixture must remain a valid canonical document.
 *
 * The fixtures are layout/PDF evidence, but they are also read by M4 tooling.
 * This guards the anchor selector shape and any future schema drift.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveAnchor } from '../src/anchors.js';
import { planBlockMerge, planBlockSplit } from '../src/block-ops.js';
import { parseDocumentJson } from '../src/serialize.js';
import type { ContentNode, Document } from '../src/types.js';

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures',
);

async function fixtureFiles(): Promise<string[]> {
  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort();
}

describe('checked-in fixtures', () => {
  it('contains at least one JSON fixture', async () => {
    expect((await fixtureFiles()).length).toBeGreaterThan(0);
  });

  it('validates every fixture with the canonical parser', async () => {
    for (const file of await fixtureFiles()) {
      const text = await fs.readFile(path.join(fixturesDir, file), 'utf8');
      const result = parseDocumentJson(text);
      if (!result.ok) {
        const issues = result.report?.errors.map((issue) => `${issue.path}: ${issue.message}`);
        throw new Error(`${file} does not validate:\n${issues?.join('\n') ?? result.error.message}`);
      }
      expect(result.ok, file).toBe(true);
    }
  });
});

async function loadFixture(name: string): Promise<Document> {
  const text = await fs.readFile(path.join(fixturesDir, name), 'utf8');
  const result = parseDocumentJson(text);
  if (!result.ok) {
    const issues = result.report?.errors.map((issue) => `${issue.path}: ${issue.message}`);
    throw new Error(`${name} does not validate:\n${issues?.join('\n') ?? result.error.message}`);
  }
  return result.document;
}

function findTextNode(
  content: ContentNode,
  needle: string,
): { nodePath: number[]; text: string } {
  let found: { nodePath: number[]; text: string } | null = null;
  const walk = (node: ContentNode, nodePath: number[]): void => {
    if (found !== null) return;
    if (node.type === 'text' && (node.text ?? '').includes(needle)) {
      found = { nodePath: [...nodePath], text: node.text ?? '' };
      return;
    }
    for (const [index, child] of (node.children ?? []).entries()) {
      walk(child, [...nodePath, index]);
    }
  };
  walk(content, []);
  if (found === null) throw new Error(`text "${needle}" is not in the block`);
  return found;
}

const M3_FIXTURE_MATRIX: Array<{
  file: string;
  covers: string[];
  anchors: Record<string, { state: string; reason: string }>;
}> = [
  {
    file: 'm3-anchor-kinds.json',
    covers: ['text', 'whole formula', 'formula term', 'code range', 'reference', 'broken', 'ambiguous'],
    anchors: {
      'm3k-a-text': { state: 'resolved', reason: 'exact-binding' },
      'm3k-a-formula-whole': { state: 'resolved', reason: 'exact-binding' },
      'm3k-a-formula-term': { state: 'resolved', reason: 'exact-binding' },
      'm3k-a-formula-ambiguous': { state: 'ambiguous', reason: 'multiple-candidates' },
      'm3k-a-code': { state: 'resolved', reason: 'exact-binding' },
      'm3k-a-broken': { state: 'broken', reason: 'quote-missing' },
      'm3k-a-ambiguous': { state: 'ambiguous', reason: 'multiple-candidates' },
    },
  },
  {
    file: 'm3-export-manifest.json',
    covers: ['shared child', 'reference cycle', 'callout', 'broken', 'ambiguous', 'empty chapter'],
    anchors: {
      'm3x-a-callout': { state: 'resolved', reason: 'exact-binding' },
      'm3x-a-broken': { state: 'broken', reason: 'quote-missing' },
      'm3x-a-ambiguous': { state: 'ambiguous', reason: 'multiple-candidates' },
    },
  },
  {
    file: 'm3-split-merge.json',
    covers: ['split', 'merge', 'text'],
    anchors: {
      // No outgoing branch: the binding stays valid and the anchor is idle.
      'm3s-a-before': { state: 'idle', reason: 'no-outgoing-branch' },
      'm3s-a-after': { state: 'resolved', reason: 'exact-binding' },
      'm3s-a-span': { state: 'resolved', reason: 'exact-binding' },
      'm3s-a-merge': { state: 'resolved', reason: 'exact-binding' },
    },
  },
];

describe('M3 fixture matrix', () => {
  it('keeps the new M3 fixtures free of validation warnings', async () => {
    for (const entry of M3_FIXTURE_MATRIX) {
      const text = await fs.readFile(path.join(fixturesDir, entry.file), 'utf8');
      const result = parseDocumentJson(text);
      if (!result.ok) throw new Error(`${entry.file} does not validate`);
      expect(
        result.report.warnings.map((issue) => `${issue.code}: ${issue.message}`),
        entry.file,
      ).toEqual([]);
    }
  });

  it('covers every M3 anchor case with the expected resolution state', async () => {
    const coverage = new Set<string>();
    for (const entry of M3_FIXTURE_MATRIX) {
      const document = await loadFixture(entry.file);
      for (const label of entry.covers) coverage.add(label);
      for (const [anchorId, expected] of Object.entries(entry.anchors)) {
        const resolution = resolveAnchor(document, anchorId);
        expect(
          { state: resolution.state, reason: resolution.reason },
          `${entry.file}:${anchorId}`,
        ).toEqual(expected);
      }
    }
    expect([...coverage].sort()).toEqual([
      'ambiguous',
      'broken',
      'callout',
      'code range',
      'empty chapter',
      'formula term',
      'merge',
      'reference',
      'reference cycle',
      'shared child',
      'split',
      'text',
      'whole formula',
    ]);
  });

  it('plans split and merge anchors from the split/merge fixture', async () => {
    const document = await loadFixture('m3-split-merge.json');
    const block = document.blocks['m3s-split'];
    if (block === undefined) throw new Error('split fixture block is missing');
    const gamma = findTextNode(block.content, 'gamma');
    const split = planBlockSplit(document, 'm3s-split', {
      nodePath: gamma.nodePath,
      offset: gamma.text.indexOf('gamma') + 3,
    });
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.plan.stayAnchorIds).toEqual(['m3s-a-before']);
    expect(split.plan.moveAnchorIds).toEqual(['m3s-a-after']);
    expect(split.plan.spanAnchorIds).toEqual(['m3s-a-span']);

    const merge = planBlockMerge(document, 'm3s-merge-source', 'm3s-merge-target');
    expect(merge).toMatchObject({
      ok: true,
      plan: {
        blockId: 'm3s-merge-source',
        intoBlockId: 'm3s-merge-target',
        mode: 'top-level',
        chapterId: 'm3s-ch1',
      },
    });
  });
});
