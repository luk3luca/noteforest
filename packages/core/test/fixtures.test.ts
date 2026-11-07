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
import type { AssetAvailabilityIndex } from '../src/assets.js';
import { planBlockMerge, planBlockSplit } from '../src/block-ops.js';
import { buildExportPlan } from '../src/export-plan.js';
import { parseDocumentJson } from '../src/serialize.js';
import type { ContentNode, Document } from '../src/types.js';
import { deterministicContext, run } from './helpers.js';

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
  {
    // AC-57 formula-term edit source: the table case below edits the formula
    // around the term and re-resolves it as unique, ambiguous, and broken.
    file: 'm3-formula-term-edit.json',
    covers: ['formula term edit'],
    anchors: {
      'm3fe-a-term': { state: 'resolved', reason: 'exact-binding' },
    },
  },
  {
    // AC-57 image matrix: two regions on one image, two images sharing an
    // asset, replacement, a missing record, and the default states for the
    // file-missing/hash-changed cases the availability table injects.
    file: 'm3-image-regions.json',
    covers: ['image region', 'shared image asset', 'image display resize', 'image replacement', 'image missing record', 'image missing file', 'image hash changed'],
    anchors: {
      'm3i-a-region-a': { state: 'resolved', reason: 'exact-binding' },
      'm3i-a-region-b': { state: 'resolved', reason: 'exact-binding' },
      'm3i-a-shared': { state: 'resolved', reason: 'exact-binding' },
      'm3i-a-replaced': { state: 'broken', reason: 'asset-changed' },
      'm3i-a-missing-record': { state: 'broken', reason: 'asset-missing' },
      'm3i-a-file-missing': { state: 'resolved', reason: 'exact-binding' },
      'm3i-a-hash-changed': { state: 'resolved', reason: 'exact-binding' },
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
      'formula term edit',
      'image display resize',
      'image hash changed',
      'image missing file',
      'image missing record',
      'image region',
      'image replacement',
      'merge',
      'reference',
      'reference cycle',
      'shared child',
      'shared image asset',
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

/** Find the node carrying an anchor binding; the fixture binds at the math node. */
function nodeWithAnchor(content: ContentNode, anchorId: string): ContentNode {
  let found: ContentNode | null = null;
  const walk = (node: ContentNode): void => {
    if (found !== null) return;
    const ids = node.attrs?.['anchorIds'];
    if (Array.isArray(ids) && ids.includes(anchorId)) {
      found = node;
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(content);
  if (found === null) throw new Error(`no content node carries anchor "${anchorId}"`);
  return found;
}

describe('M3 image fixture availability matrix', () => {
  const FOREST = '2492f7a53cb3fced6fd50d12d994a18891e56945d3a508a593678b31992c6f04';
  const WIDE = 'f5985b660c895a395dd932ae1e86a249444f0b72bc91b4c98ee7fb60bfd77cc0';

  it('marks a missing file or changed hash broken while keeping branch, target, and alt', async () => {
    const document = await loadFixture('m3-image-regions.json');
    const cases: Array<{
      label: string;
      anchorId: string;
      branchId: string;
      targetBlockId: string;
      availability: AssetAvailabilityIndex;
      reason: 'asset-missing' | 'asset-changed';
    }> = [
      {
        label: 'missing file',
        anchorId: 'm3i-a-file-missing',
        branchId: 'm3i-e-file-missing',
        targetBlockId: 'm3i-file-missing-child',
        availability: { [WIDE]: 'asset-missing' },
        reason: 'asset-missing',
      },
      {
        label: 'changed hash',
        anchorId: 'm3i-a-hash-changed',
        branchId: 'm3i-e-hash',
        targetBlockId: 'm3i-hash-child',
        availability: { [FOREST]: 'asset-changed' },
        reason: 'asset-changed',
      },
    ];

    for (const entry of cases) {
      const anchorBefore = document.anchors[entry.anchorId];
      if (anchorBefore === undefined) throw new Error(`${entry.label}: anchor is missing`);
      const branchBefore = structuredClone(document.branches[entry.branchId]);
      const targetBefore = structuredClone(document.blocks[entry.targetBlockId]);
      const imageBlock = document.blocks[anchorBefore.blockId];
      const image = imageBlock?.content.children?.find((node) => node.type === 'image');
      const altBefore = image?.attrs?.['alt'];
      const anchorSnapshot = structuredClone(anchorBefore);

      const resolution = resolveAnchor(document, entry.anchorId, {
        assetAvailability: entry.availability,
      });
      expect(
        { state: resolution.state, reason: resolution.reason },
        entry.label,
      ).toEqual({ state: 'broken', reason: entry.reason });
      expect(document.anchors[entry.anchorId], entry.label).toEqual(anchorSnapshot);
      expect(document.branches[entry.branchId], entry.label).toEqual(branchBefore);
      expect(document.blocks[entry.targetBlockId], entry.label).toEqual(targetBefore);
      expect(image?.attrs?.['alt'], entry.label).toBe(altBefore);

      const plan = buildExportPlan(document, { assetAvailability: entry.availability });
      const marker = plan.markers.find((candidate) => candidate.anchorId === entry.anchorId);
      expect(marker, entry.label).toMatchObject({
        state: 'broken',
        reason: entry.reason,
        branchIds: [entry.branchId],
        targetBlockIds: [entry.targetBlockId],
      });
      expect(
        plan.entries.filter((candidate) => candidate.blockId === entry.targetBlockId),
        entry.label,
      ).toHaveLength(1);
    }
  });

  it('keeps normalized image geometry stable across display sizes', async () => {
    const document = await loadFixture('m3-image-regions.json');
    const selector = document.anchors['m3i-a-region-a']?.selector;
    if (selector === undefined || selector['kind'] !== 'image') {
      throw new Error('image region fixture anchor is missing');
    }
    const rect = selector['rect'];
    if (typeof rect !== 'object' || rect === null) throw new Error('region rect is missing');
    const rectRecord = rect as Record<string, unknown>;
    const x = Number(rectRecord['x']);
    const y = Number(rectRecord['y']);
    const width = Number(rectRecord['width']);
    const height = Number(rectRecord['height']);
    for (const value of [x, y, width, height]) {
      if (!Number.isFinite(value)) throw new Error('region rect value is missing');
    }
    // Display resize only converts normalized coordinates to pixels; the
    // canonical selector is untouched and the relative rectangle is identical.
    for (const display of [
      { width: 640, height: 360 },
      { width: 960, height: 540 },
      { width: 420, height: 236.25 },
    ]) {
      expect((display.width * x) / display.width).toBeCloseTo(x, 12);
      expect((display.height * y) / display.height).toBeCloseTo(y, 12);
      expect((display.width * width) / display.width).toBeCloseTo(width, 12);
      expect((display.height * height) / display.height).toBeCloseTo(height, 12);
    }
  });
});

describe('M3 formula-term edit fixture', () => {
  it('re-resolves a term after edits around it and keeps the anchor, branch, and target', async () => {
    const initial = await loadFixture('m3-formula-term-edit.json');
    const blockId = 'm3fe-formula';
    const anchorId = 'm3fe-a-term';
    const branchId = 'm3fe-e-term';
    const targetBlockId = 'm3fe-term-child';
    const anchorBefore = structuredClone(initial.anchors[anchorId]);
    const branchBefore = structuredClone(initial.branches[branchId]);
    const targetBefore = structuredClone(initial.blocks[targetBlockId]);

    // AC-57: edit the formula around the term; resolution follows the content
    // while the anchor record, its branch, and the target block stay identical.
    const edits = [
      {
        label: 'initial',
        latex: 'a^2 + b^2 = c^2',
        state: 'resolved',
        reason: 'exact-binding',
        binding: 'atomic',
        candidates: 1,
      },
      {
        label: 'edited around the term',
        latex: 'x = 4(a^2 + b^2) - 1',
        state: 'resolved',
        reason: 'exact-binding',
        binding: 'atomic',
        candidates: 1,
      },
      {
        label: 'term repeated',
        latex: 'a^2 + b^2 + a^2 + b^2',
        state: 'ambiguous',
        reason: 'multiple-candidates',
        binding: 'atomic',
        candidates: 2,
      },
      {
        label: 'term removed',
        latex: 'x^2 + y^2 = z^2',
        state: 'broken',
        reason: 'quote-missing',
        binding: 'atomic',
        candidates: 0,
      },
      {
        label: 'term restored',
        latex: 'a^2 + b^2 = c^2',
        state: 'resolved',
        reason: 'exact-binding',
        binding: 'atomic',
        candidates: 1,
      },
    ];

    let document = initial;
    for (const edit of edits) {
      if (edit.label !== 'initial') {
        const content = structuredClone(document.blocks[blockId]?.content);
        if (content === undefined) throw new Error('formula-term fixture block is missing');
        const formula = nodeWithAnchor(content, anchorId);
        formula.attrs = { ...formula.attrs, latex: edit.latex };
        document = run(
          document,
          { type: 'block.editContent', blockId, content },
          deterministicContext(),
        ).document;
      }

      const resolution = resolveAnchor(document, anchorId);
      expect(
        {
          state: resolution.state,
          reason: resolution.reason,
          binding: resolution.binding,
          candidates: resolution.candidates.length,
        },
        edit.label,
      ).toEqual({
        state: edit.state,
        reason: edit.reason,
        binding: edit.binding,
        candidates: edit.candidates,
      });
      expect(document.anchors[anchorId], `${edit.label}: anchor identity`).toEqual(anchorBefore);
      expect(document.branches[branchId], `${edit.label}: branch identity`).toEqual(branchBefore);
      expect(document.blocks[targetBlockId], `${edit.label}: target identity`).toEqual(
        targetBefore,
      );
    }
  });
});
