/**
 * Exactly-once export manifest tests (M3f2, AC-56 M3 evidence).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildExportPlan } from '../src/export-plan.js';
import { parseDocumentJson } from '../src/serialize.js';
import type { ContentNode, Document } from '../src/types.js';
import { validateDocument } from '../src/validation.js';
import { deterministicContext, run } from './helpers.js';

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures',
);

async function loadFixture(name: string): Promise<Document> {
  const payload = await fs.readFile(path.join(fixturesDir, name), 'utf8');
  const parsed = parseDocumentJson(payload);
  if (!parsed.ok) {
    throw new Error(`${name} does not validate: ${parsed.error.message}`);
  }
  return parsed.document;
}

function textNode(content: ContentNode, needle: string): { nodePath: number[]; text: string } {
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

function primaryBranchIds(document: Document): string[] {
  return Object.values(document.branches)
    .filter((branch) => branch.role === 'primary')
    .map((branch) => branch.id)
    .sort();
}

describe('buildExportPlan exactly-once manifest', () => {
  it('emits every primary block and branch once in D3 outline order', async () => {
    const document = await loadFixture('m3-export-manifest.json');
    const plan = buildExportPlan(document);

    expect(plan.entries.map((entry) => entry.blockId)).toEqual([
      'm3x-root-a',
      'm3x-callout',
      'm3x-root-b',
      'm3x-shared',
      'm3x-broken-host',
      'm3x-broken-child',
      'm3x-ref-parent',
      'm3x-ambiguous-host',
      'm3x-ambiguous-child',
    ]);
    expect(plan.entries).toHaveLength(Object.keys(document.blocks).length);
    expect(new Set(plan.entries.map((entry) => entry.blockId)).size).toBe(plan.entries.length);

    const emittedBranchIds = plan.entries
      .flatMap((entry) => (entry.branchId === null ? [] : [entry.branchId]))
      .sort();
    expect(emittedBranchIds).toEqual(primaryBranchIds(document));
    expect(new Set(emittedBranchIds).size).toBe(emittedBranchIds.length);

    expect(plan.entries[0]).toMatchObject({
      blockId: 'm3x-root-a',
      chapterId: 'm3x-ch1',
      branchId: null,
      anchorId: null,
      callout: false,
      depth: 0,
      index: 0,
    });
    expect(plan.entries[1]).toMatchObject({
      blockId: 'm3x-callout',
      chapterId: 'm3x-ch1',
      branchId: 'm3x-e-callout',
      anchorId: 'm3x-a-callout',
      callout: true,
      depth: 1,
      index: 1,
    });
    expect(plan.counts).toEqual({ chapters: 3, blocks: 9, branches: 4, markers: 2 });
  });

  it('keeps a shared child at its primary home and ignores reference edges', async () => {
    const document = await loadFixture('m3-export-manifest.json');
    const baseline = buildExportPlan(document);

    expect(baseline.entries.filter((entry) => entry.blockId === 'm3x-shared')).toHaveLength(1);
    expect(
      baseline.entries.find((entry) => entry.blockId === 'm3x-shared'),
    ).toMatchObject({ chapterId: 'm3x-ch1', branchId: 'm3x-e-shared', depth: 1 });

    const modified = structuredClone(document);
    modified.branches['extra-reference-a'] = {
      id: 'extra-reference-a',
      source: { blockId: 'm3x-root-a' },
      targetBlockId: 'm3x-ambiguous-child',
      role: 'reference',
      order: 'z1',
    };
    modified.branches['extra-reference-b'] = {
      id: 'extra-reference-b',
      source: { blockId: 'm3x-ambiguous-child', anchorId: 'm3x-a-ambiguous' },
      targetBlockId: 'm3x-root-a',
      role: 'reference',
      order: 'z2',
    };
    const after = buildExportPlan(modified);
    expect(after).toEqual(baseline);

    // Reference-only roots are still emitted through their chapter slot.
    expect(baseline.entries.some((entry) => entry.blockId === 'm3x-ref-parent' && entry.branchId === null)).toBe(true);
  });

  it('adds broken/ambiguous markers without duplicating their target blocks', async () => {
    const document = await loadFixture('m3-export-manifest.json');
    const plan = buildExportPlan(document);

    expect(plan.markers).toEqual([
      {
        anchorId: 'm3x-a-broken',
        blockId: 'm3x-broken-host',
        state: 'broken',
        reason: 'quote-missing',
        branchIds: ['m3x-e-broken'],
        targetBlockIds: ['m3x-broken-child'],
      },
      {
        anchorId: 'm3x-a-ambiguous',
        blockId: 'm3x-ambiguous-host',
        state: 'ambiguous',
        reason: 'multiple-candidates',
        branchIds: ['m3x-e-ambiguous'],
        targetBlockIds: ['m3x-ambiguous-child'],
      },
    ]);
    for (const marker of plan.markers) {
      for (const targetBlockId of marker.targetBlockIds) {
        expect(plan.entries.filter((entry) => entry.blockId === targetBlockId)).toHaveLength(1);
        expect(plan.entries.some((entry) => entry.blockId === targetBlockId)).toBe(true);
      }
    }
    expect(plan.entries).toHaveLength(Object.keys(document.blocks).length);
  });

  it('keeps split/merge identity exactly once in the manifest', async () => {
    const source = await loadFixture('m3-split-merge.json');
    const splitBlock = source.blocks['m3s-split'];
    if (splitBlock === undefined) throw new Error('split fixture block is missing');
    const gamma = textNode(splitBlock.content, 'gamma');
    const context = deterministicContext();

    const split = run(
      source,
      {
        type: 'block.split',
        blockId: 'm3s-split',
        at: { nodePath: gamma.nodePath, offset: 3 },
        newBlockId: 'm3s-split-right',
      },
      context,
    );
    expect(split.document.anchors['m3s-a-after']?.blockId).toBe('m3s-split-right');
    expect(split.document.anchors['m3s-a-span']?.repairFlags).toEqual(['split-inside-anchor']);
    expect(validateDocument(split.document).ok).toBe(true);

    const splitPlan = buildExportPlan(split.document);
    expect(splitPlan.entries.map((entry) => entry.blockId)).toEqual([
      'm3s-split',
      'm3s-span-child',
      'm3s-split-right',
      'm3s-after-child',
      'm3s-merge-target',
      'm3s-merge-source',
      'm3s-merge-child',
    ]);
    expect(splitPlan.entries.filter((entry) => entry.blockId === 'm3s-after-child')).toHaveLength(1);
    expect(
      splitPlan.entries.find((entry) => entry.blockId === 'm3s-after-child'),
    ).toMatchObject({ branchId: 'm3s-e-after', anchorId: 'm3s-a-after', depth: 1 });
    expect(splitPlan.entries.filter((entry) => entry.blockId === 'm3s-span-child')).toHaveLength(1);
    expect(validateDocument(split.document).ok).toBe(true);
    expect(splitPlan.entries).toHaveLength(Object.keys(split.document.blocks).length);

    const merge = run(
      source,
      { type: 'block.merge', blockId: 'm3s-merge-source', intoBlockId: 'm3s-merge-target' },
      context,
    );
    expect(merge.document.blocks['m3s-merge-source']).toBeUndefined();
    expect(merge.document.anchors['m3s-a-merge']?.blockId).toBe('m3s-merge-target');
    expect(validateDocument(merge.document).ok).toBe(true);

    const mergePlan = buildExportPlan(merge.document);
    expect(mergePlan.entries.map((entry) => entry.blockId)).toEqual([
      'm3s-split',
      'm3s-span-child',
      'm3s-after-child',
      'm3s-merge-target',
      'm3s-merge-child',
    ]);
    expect(
      mergePlan.entries.find((entry) => entry.blockId === 'm3s-merge-child'),
    ).toMatchObject({ branchId: 'm3s-e-merge', anchorId: 'm3s-a-merge', depth: 1 });
    expect(mergePlan.entries).toHaveLength(Object.keys(merge.document.blocks).length);
  });

  it('is deterministic across repeated runs and object-key order', async () => {
    const document = await loadFixture('m3-export-manifest.json');
    const first = buildExportPlan(document);
    const second = buildExportPlan(structuredClone(document));
    expect(second).toEqual(first);

    const reversed = structuredClone(document);
    reversed.blocks = Object.fromEntries(Object.entries(reversed.blocks).reverse());
    reversed.anchors = Object.fromEntries(Object.entries(reversed.anchors).reverse());
    reversed.branches = Object.fromEntries(Object.entries(reversed.branches).reverse());
    expect(buildExportPlan(reversed)).toEqual(first);
  });

  it('handles an empty chapter without inventing entries', async () => {
    const document = await loadFixture('m3-export-manifest.json');
    const plan = buildExportPlan(document);
    const emptyChapter = document.chapters.find((chapter) => chapter.id === 'm3x-ch2');
    expect(emptyChapter?.topLevelBlockIds).toEqual([]);
    expect(plan.counts.chapters).toBe(3);
    expect(plan.entries.some((entry) => entry.chapterId === 'm3x-ch2')).toBe(false);
    for (const entry of plan.entries) {
      expect(document.chapters.some((chapter) => chapter.id === entry.chapterId)).toBe(true);
    }
  });
});
