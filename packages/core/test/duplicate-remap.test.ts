/**
 * Duplicate/paste remap tests (M3f2).
 *
 * UI paste integration is out of scope; these tests prove the pure model
 * contract: fresh IDs, remapped binding marks, external references excluded.
 */

import { describe, expect, it } from 'vitest';
import { planDuplicateSubtree } from '../src/duplicate.js';
import type { DuplicateSubtreePlan } from '../src/duplicate.js';
import { sequentialIdFactory } from '../src/ids.js';
import type {
  Anchor,
  Branch,
  ContentBlock,
  ContentNode,
  Document,
  JsonObject,
} from '../src/types.js';
import { defaultPageSetup } from '../src/types.js';
import { validateDocument } from '../src/validation.js';

const TIMESTAMP = '2026-11-06T10:00:00.000Z';

function text(value: string, marks?: JsonObject[]): ContentNode {
  return { type: 'text', text: value, ...(marks === undefined ? {} : { marks }) } as ContentNode;
}

function paragraph(...children: ContentNode[]): ContentNode {
  return { type: 'paragraph', children };
}

function docContent(...children: ContentNode[]): ContentNode {
  return { type: 'doc', children };
}

function anchorMark(attrs: JsonObject): JsonObject {
  return { type: 'anchor', attrs };
}

function block(id: string, content: ContentNode): ContentBlock {
  return { id, content };
}

function anchor(
  id: string,
  blockId: string,
  kind: Anchor['kind'],
  selector: JsonObject,
  extra: JsonObject = {},
): Anchor {
  return { id, blockId, kind, selector, ...extra };
}

function branch(
  id: string,
  source: Branch['source'],
  targetBlockId: string,
  role: Branch['role'],
  order = 'a1',
): Branch {
  return { id, source, targetBlockId, role, order };
}

/**
 * external (top-level)
 *   └─ root (primary)
 *        ├─ child (primary, anchored on a-text-1)
 *        │    └─ grandchild (primary)
 *        └─ reference → external
 * child —reference→ external (external reference, not copied)
 * grandchild —reference→ child (internal reference, copied)
 * root[a-formula] —reference→ external (external reference, not copied)
 */
function sourceDocument(): Document {
  return {
    schemaVersion: 1,
    id: 'duplicate-source',
    title: 'Duplicate source',
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    revision: 0,
    pageSetup: defaultPageSetup(),
    manualBreakBeforeBlockIds: [],
    chapters: [
      {
        id: 'chapter-1',
        title: 'Chapter One',
        topLevelBlockIds: ['external'],
      },
    ],
    blocks: {
      external: block('external', docContent(paragraph(text('external')))),
      root: block(
        'root',
        docContent(
          paragraph(
            text('Root '),
            text('alpha', [
              anchorMark({ anchorIds: ['a-text-2', 'a-text-1'] }),
            ]),
            text(' beta '),
            text('legacy', [anchorMark({ anchorId: 'a-legacy' })]),
            text(' external ', [anchorMark({ anchorId: 'a-external' })]),
            {
              type: 'inlineMath',
              attrs: { latex: 'x + y', anchorIds: ['a-formula'] },
            },
            {
              type: 'codeBlock',
              attrs: { text: 'const value = 1;', anchorIds: ['a-code'] },
            },
          ),
        ),
      ),
      child: block(
        'child',
        docContent(paragraph(text('child', [anchorMark({ anchorIds: ['a-child'] })]))),
      ),
      grandchild: block('grandchild', docContent(paragraph(text('grandchild')))),
    },
    anchors: {
      'a-text-1': anchor('a-text-1', 'root', 'text', { kind: 'text', quote: 'alpha' }),
      'a-text-2': anchor('a-text-2', 'root', 'text', { kind: 'text', quote: 'alpha' }),
      'a-formula': anchor('a-formula', 'root', 'formula', {
        kind: 'formula',
        form: 'whole',
        latex: 'x + y',
      }),
      'a-code': anchor('a-code', 'root', 'code', {
        kind: 'code',
        form: 'range',
        quote: 'value',
        startOffset: 6,
        endOffset: 11,
        lineStart: 1,
        lineEnd: 1,
      }),
      'a-legacy': anchor('a-legacy', 'root', 'text', { kind: 'text', quote: 'legacy' }),
      'a-child': anchor('a-child', 'child', 'text', { kind: 'text', quote: 'child' }),
      'a-external': anchor('a-external', 'external', 'text', {
        kind: 'text',
        quote: 'external',
      }),
    },
    branches: {
      'b-external-root': branch('b-external-root', { blockId: 'external' }, 'root', 'primary'),
      'b-root-child': branch(
        'b-root-child',
        { blockId: 'root', anchorId: 'a-text-1' },
        'child',
        'primary',
      ),
      'b-child-grandchild': branch(
        'b-child-grandchild',
        { blockId: 'child' },
        'grandchild',
        'primary',
      ),
      'b-ref-external': branch('b-ref-external', { blockId: 'child' }, 'external', 'reference'),
      'b-ref-internal': branch(
        'b-ref-internal',
        { blockId: 'grandchild' },
        'child',
        'reference',
      ),
      'b-ref-anchored-external': branch(
        'b-ref-anchored-external',
        { blockId: 'root', anchorId: 'a-formula' },
        'external',
        'reference',
      ),
    },
    assets: {},
    annotations: [],
  };
}

function expectPlan(result: ReturnType<typeof planDuplicateSubtree>): DuplicateSubtreePlan {
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}

function applyPlan(document: Document, plan: DuplicateSubtreePlan): Document {
  const next = structuredClone(document);
  for (const [id, value] of Object.entries(plan.blocks)) next.blocks[id] = structuredClone(value);
  for (const [id, value] of Object.entries(plan.anchors)) next.anchors[id] = structuredClone(value);
  for (const [id, value] of Object.entries(plan.branches)) next.branches[id] = structuredClone(value);
  const chapter = next.chapters[0];
  if (chapter === undefined) throw new Error('missing chapter');
  chapter.topLevelBlockIds.push(plan.rootBlockId);
  return next;
}

describe('planDuplicateSubtree', () => {
  it('remaps blocks, anchors, bindings, and internal branches with fresh IDs', () => {
    const document = sourceDocument();
    const plan = expectPlan(
      planDuplicateSubtree(document, 'root', { newId: sequentialIdFactory('dup') }),
    );

    expect(Object.keys(plan.blockIdMap).sort()).toEqual(['child', 'grandchild', 'root']);
    expect(Object.keys(plan.anchorIdMap).sort()).toEqual([
      'a-child',
      'a-code',
      'a-formula',
      'a-legacy',
      'a-text-1',
      'a-text-2',
    ]);
    expect(Object.keys(plan.branchIdMap).sort()).toEqual([
      'b-child-grandchild',
      'b-ref-internal',
      'b-root-child',
    ]);
    expect(plan.rootBlockId).toBe(plan.blockIdMap['root']);
    expect(plan.rootBlockId).not.toBe('root');

    // Incoming primary edge and external references are not copied.
    expect(plan.skippedPrimaryBranchIds).toEqual([]);
    expect(plan.skippedReferenceBranchIds).toEqual([
      'b-ref-anchored-external',
      'b-ref-external',
    ]);
    expect(plan.strippedAnchorIds).toEqual(['a-external']);

    // The copied root has new anchor IDs, canonical anchorIds, and no legacy
    // binding to the external anchor.
    const copiedRoot = plan.blocks[plan.blockIdMap['root'] as string];
    if (copiedRoot === undefined) throw new Error('copied root is missing');
    const serialized = JSON.stringify(copiedRoot);
    for (const oldId of ['a-text-1', 'a-text-2', 'a-formula', 'a-code', 'a-legacy', 'a-external']) {
      expect(serialized).not.toContain(oldId);
    }
    expect(serialized).toContain(plan.anchorIdMap['a-text-1'] as string);
    expect(serialized).toContain(plan.anchorIdMap['a-formula'] as string);
    expect(serialized).toContain(plan.anchorIdMap['a-code'] as string);

    const copiedChild = plan.blocks[plan.blockIdMap['child'] as string];
    expect(JSON.stringify(copiedChild)).toContain(plan.anchorIdMap['a-child'] as string);
    expect(plan.branches[plan.branchIdMap['b-root-child'] as string]).toMatchObject({
      source: {
        blockId: plan.blockIdMap['root'],
        anchorId: plan.anchorIdMap['a-text-1'],
      },
      targetBlockId: plan.blockIdMap['child'],
      role: 'primary',
    });
    expect(plan.branches[plan.branchIdMap['b-ref-internal'] as string]).toMatchObject({
      source: { blockId: plan.blockIdMap['grandchild'] },
      targetBlockId: plan.blockIdMap['child'],
      role: 'reference',
    });

    const known = new Set([
      document.id,
      ...document.chapters.map((chapter) => chapter.id),
      ...Object.keys(document.blocks),
      ...Object.keys(document.anchors),
      ...Object.keys(document.branches),
      ...Object.keys(document.assets),
    ]);
    for (const id of [
      ...Object.keys(plan.blocks),
      ...Object.keys(plan.anchors),
      ...Object.keys(plan.branches),
    ]) {
      expect(known.has(id)).toBe(false);
      known.add(id);
    }
  });

  it('applies cleanly and preserves exactly-once structure', () => {
    const document = sourceDocument();
    const plan = expectPlan(
      planDuplicateSubtree(document, 'root', { newId: sequentialIdFactory('dup') }),
    );
    const applied = applyPlan(document, plan);
    const report = validateDocument(applied);
    if (!report.ok) {
      throw new Error(report.errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    }
    expect(report.ok).toBe(true);
    expect(applied.anchors['a-external']).toBeDefined();
    // The duplicate has no incoming primary edge and is placed by the caller.
    expect(
      Object.values(applied.branches).some(
        (branch) =>
          branch.role === 'primary' &&
          branch.targetBlockId === plan.rootBlockId &&
          branch.source.blockId === 'external',
      ),
    ).toBe(false);
    expect(
      applied.chapters[0]?.topLevelBlockIds.filter((id) => id === plan.rootBlockId),
    ).toHaveLength(1);
  });

  it('can omit internal references while still copying internal primary edges', () => {
    const document = sourceDocument();
    const plan = expectPlan(
      planDuplicateSubtree(document, 'root', {
        newId: sequentialIdFactory('dup'),
        includeInternalReferences: false,
      }),
    );
    expect(plan.skippedReferenceBranchIds).toEqual([
      'b-ref-anchored-external',
      'b-ref-external',
      'b-ref-internal',
    ]);
    expect(Object.values(plan.branches).every((value) => value.role === 'primary')).toBe(true);
    expect(Object.keys(plan.branchIdMap).sort()).toEqual([
      'b-child-grandchild',
      'b-root-child',
    ]);
  });

  it('is deterministic and tolerates ID factories that collide first', () => {
    const first = expectPlan(
      planDuplicateSubtree(sourceDocument(), 'root', { newId: sequentialIdFactory('dup') }),
    );
    const second = expectPlan(
      planDuplicateSubtree(sourceDocument(), 'root', { newId: sequentialIdFactory('dup') }),
    );
    expect(second).toEqual(first);

    const colliding = ['root', 'child', 'a-text-1', 'b-root-child', 'dup-a', 'dup-b', 'dup-c'];
    let cursor = 0;
    const factory = (): string => {
      const value = colliding[cursor] ?? `unique-${cursor}`;
      cursor += 1;
      return value;
    };
    const plan = expectPlan(planDuplicateSubtree(sourceDocument(), 'root', { newId: factory }));
    for (const id of [
      ...Object.keys(plan.blocks),
      ...Object.keys(plan.anchors),
      ...Object.keys(plan.branches),
    ]) {
      expect(id.startsWith('unique-') || id.startsWith('dup-')).toBe(true);
    }
  });

  it('rejects a missing subtree root', () => {
    const result = planDuplicateSubtree(sourceDocument(), 'missing');
    expect(result).toEqual({ ok: false, reason: 'this block no longer exists' });
  });
});
