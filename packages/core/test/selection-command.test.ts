import { describe, expect, it } from 'vitest';
import type { AnchorBinding } from '../src/anchors.js';
import { readContentAnchorBinding, resolveAnchor } from '../src/anchors.js';
import type { CommandSuccess } from '../src/commands.js';
import { applyInverse, executeCommand } from '../src/commands.js';
import { directChildIds } from '../src/structure.js';
import type { ContentNode, Document, JsonObject } from '../src/types.js';
import { validateDocument } from '../src/validation.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
  run,
  textContent,
  tryRun,
} from './helpers.js';

function success(result: ReturnType<typeof executeCommand>): CommandSuccess {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

function stable(document: Document): Document {
  const clone = structuredClone(document);
  clone.revision = 0;
  clone.updatedAt = '1970-01-01T00:00:00.000Z';
  return clone;
}

function expectValid(document: Document): void {
  const report = validateDocument(document);
  if (!report.ok) {
    throw new Error(report.errors.map((issue) => issue.message).join('; '));
  }
}

function expectNoMutation(before: Document, document: Document): void {
  expect(stable(document)).toEqual(stable(before));
}

function textBinding(start: number, end: number, nodePath: number[] = [0, 0]): AnchorBinding {
  return { kind: 'text', ranges: [{ nodePath, start, end }] };
}

function textNodes(node: ContentNode): Array<{ text: string; ids: string[] }> {
  const result: Array<{ text: string; ids: string[] }> = [];
  const walk = (current: ContentNode): void => {
    if (current.type === 'text') {
      const mark = (current.marks ?? []).find((candidate) => candidate.type === 'anchor');
      const ids = Array.isArray(mark?.attrs?.['anchorIds'])
        ? (mark?.attrs?.['anchorIds'] as string[])
        : [];
      result.push({ text: current.text ?? '', ids });
      return;
    }
    for (const child of current.children ?? []) walk(child);
  };
  walk(node);
  return result;
}

function createSelectionChild(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
  start: number,
  end: number,
  extra: Partial<JsonObject> = {},
): CommandSuccess {
  return run(
    document,
    {
      type: 'branch.createFromSelection',
      blockId,
      kind: 'text',
      binding: textBinding(start, end),
      target: { kind: 'new' },
      ...extra,
    },
    context,
  );
}

function buildFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const topA = addTopLevel(document, 'Alpha eigenvalue beta', context);
  document = topA.document;
  const topB = addTopLevel(document, 'B', context);
  document = topB.document;
  const childA1 = addChild(document, topA.blockId, 'A1', context);
  document = childA1.document;
  return {
    context,
    document,
    chapterId: document.chapters[0]?.id ?? '',
    a: topA.blockId,
    b: topB.blockId,
    a1: childA1.blockId,
  };
}

function formulaBinding(nodePath: number[]): AnchorBinding {
  return { kind: 'formula', form: 'whole', nodePath };
}

function createFormulaChild(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
  nodePath: number[],
  latex: string,
): CommandSuccess {
  return run(
    document,
    {
      type: 'branch.createFromSelection',
      blockId,
      kind: 'formula',
      binding: formulaBinding(nodePath),
      selector: { kind: 'formula', form: 'whole', latex },
      target: { kind: 'new' },
    },
    context,
  );
}

function buildFormulaFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const content = {
    type: 'doc',
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'Before' }] },
      { type: 'mathBlock', attrs: { latex: 'Av = \\lambda v' } },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'After ' },
          { type: 'inlineMath', attrs: { latex: 'x^2' } },
        ],
      },
    ],
  } satisfies ContentNode;
  const created = run(
    document,
    {
      type: 'block.create',
      blockId: 'formula-source',
      content,
      placement: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' },
    },
    context,
  );
  document = created.document;
  return { context, document, blockId: 'formula-source' };
}

describe('branch.createFromSelection', () => {
  it('creates the anchor, child block and primary branch as one command', () => {
    const { context, document, chapterId, a, b: topBId, a1: a1Id } = buildFixture();
    const before = structuredClone(document);
    const created = createSelectionChild(document, context, a, 6, 16);

    expect(created.created.blockIds).toHaveLength(1);
    expect(created.created.branchIds).toHaveLength(1);
    expect(created.created.anchorIds).toHaveLength(1);
    const anchorId = created.created.anchorIds[0] as string;
    const blockId = created.created.blockIds[0] as string;
    const branchId = created.created.branchIds[0] as string;

    expect(created.document.anchors[anchorId]).toMatchObject({
      id: anchorId,
      blockId: a,
      kind: 'text',
      quote: 'eigenvalue',
      prefix: 'Alpha ',
      suffix: ' beta',
      occurrenceHint: 1,
    });
    expect(created.document.blocks[blockId]).toMatchObject({
      id: blockId,
      content: { type: 'doc', children: [] },
    });
    expect(created.document.branches[branchId]).toMatchObject({
      id: branchId,
      source: { blockId: a, anchorId },
      targetBlockId: blockId,
      role: 'primary',
    });
    expect(textNodes(created.document.blocks[a]?.content ?? { type: 'doc' })).toEqual([
      { text: 'Alpha ', ids: [] },
      { text: 'eigenvalue', ids: [anchorId] },
      { text: ' beta', ids: [] },
    ]);
    expect(readContentAnchorBinding(created.document.blocks[a]?.content ?? { type: 'doc' }, anchorId)).toMatchObject({
      textRanges: [{ nodePath: [0, 1], start: 0, end: 10 }],
    });
    expect(created.document.chapters[0]?.topLevelBlockIds).toEqual([a, topBId]);
    expect(directChildIds(created.document, a)).toEqual([blockId, a1Id]);
    expect(created.document.chapters[0]?.id).toBe(chapterId);
    expect(created.warnings.some((message) => message.includes('reused existing anchor'))).toBe(false);
    expectValid(created.document);
    expect(before).toEqual(document);
  });

  it('has one exact inverse and redo restores the same IDs', () => {
    const { context, document, a } = buildFixture();
    const created = createSelectionChild(document, context, a, 6, 16);
    const anchorId = created.created.anchorIds[0] as string;
    const blockId = created.created.blockIds[0] as string;
    const branchId = created.created.branchIds[0] as string;

    const undone = success(applyInverse(created));
    expect(stable(undone.document)).toEqual(stable(document));
    expect(undone.document.blocks[blockId]).toBeUndefined();
    expect(undone.document.branches[branchId]).toBeUndefined();
    expect(undone.document.anchors[anchorId]).toBeUndefined();

    const redone = success(applyInverse(undone));
    expect(stable(redone.document)).toEqual(stable(created.document));
    expect(redone.document.blocks[blockId]).toBeDefined();
    expect(redone.document.branches[branchId]?.source.anchorId).toBe(anchorId);
    expect(redone.document.anchors[anchorId]).toBeDefined();
    expectValid(redone.document);
  });

  it('undoes the structural action after text was typed into the new child', () => {
    const { context, document, a } = buildFixture();
    const created = createSelectionChild(document, context, a, 6, 16);
    const blockId = created.created.blockIds[0] as string;
    const edited = run(
      created.document,
      {
        type: 'block.editContent',
        blockId,
        content: textContent('typed after the branch'),
      },
      context,
    );
    const undone = success(applyInverse({ ...created, document: edited.document }));
    expect(undone.document.blocks[blockId]).toBeUndefined();
    expect(stable(undone.document)).toEqual(stable(document));
  });

  it('reuses an exact existing anchor and keeps it on undo', () => {
    const { context, document, a } = buildFixture();
    const anchored = run(
      document,
      {
        type: 'anchor.create',
        anchorId: 'anchor-existing',
        blockId: a,
        kind: 'text',
        selector: { kind: 'text', quote: 'eigenvalue', prefix: 'Alpha ', suffix: ' beta' },
        binding: textBinding(6, 16),
      },
      context,
    );
    const before = structuredClone(anchored.document);
    // anchor.create split the paragraph: "eigenvalue" now lives at [0, 1].
    const created = run(
      anchored.document,
      {
        type: 'branch.createFromSelection',
        blockId: a,
        kind: 'text',
        binding: textBinding(0, 10, [0, 1]),
        target: { kind: 'new' },
      },
      context,
    );

    expect(created.created.anchorIds).toEqual([]);
    expect(created.affected.anchorIds).toContain('anchor-existing');
    expect(Object.keys(created.document.anchors)).toEqual(['anchor-existing']);
    expect(created.document.blocks[a]?.updatedAt).toBe(before.blocks[a]?.updatedAt);
    expect(created.warnings.some((message) => message.includes('reused existing anchor'))).toBe(true);
    const branch = Object.values(created.document.branches).find(
      (candidate) => candidate.id === created.created.branchIds[0],
    );
    expect(branch?.source.anchorId).toBe('anchor-existing');

    const undone = success(applyInverse(created));
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.anchors['anchor-existing']).toBeDefined();
    expect(undone.document.blocks[created.created.blockIds[0] as string]).toBeUndefined();

    const redone = success(applyInverse(undone));
    expect(stable(redone.document)).toEqual(stable(created.document));
    expect(Object.keys(redone.document.anchors)).toEqual(['anchor-existing']);
  });

  it('anchors a whole block formula with the atomic node binding and one exact inverse', () => {
    const { context, document, blockId } = buildFormulaFixture();
    const before = structuredClone(document);
    const latex = 'Av = \\lambda v';
    const created = createFormulaChild(document, context, blockId, [1], latex);
    const anchorId = created.created.anchorIds[0] as string;
    const blockIdCreated = created.created.blockIds[0] as string;
    const branchId = created.created.branchIds[0] as string;

    expect(created.created.anchorIds).toHaveLength(1);
    expect(created.document.anchors[anchorId]).toMatchObject({
      id: anchorId,
      blockId,
      kind: 'formula',
      quote: latex,
      selector: { kind: 'formula', form: 'whole', latex },
    });
    expect(
      readContentAnchorBinding(created.document.blocks[blockId]?.content ?? { type: 'doc' }, anchorId),
    ).toMatchObject({
      textRanges: [],
      atomicNodes: [{ nodePath: [1], nodeType: 'mathBlock' }],
    });
    expect(created.document.branches[branchId]).toMatchObject({
      source: { blockId, anchorId },
      targetBlockId: blockIdCreated,
      role: 'primary',
    });
    expect(resolveAnchor(created.document, anchorId).state).toBe('resolved');
    expectValid(created.document);

    const undone = success(applyInverse(created));
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.anchors[anchorId]).toBeUndefined();
    expect(undone.document.blocks[blockIdCreated]).toBeUndefined();
    expect(undone.document.branches[branchId]).toBeUndefined();

    const redone = success(applyInverse(undone));
    expect(stable(redone.document)).toEqual(stable(created.document));
    expect(redone.document.anchors[anchorId]).toEqual(created.document.anchors[anchorId]);
    expect(redone.document.branches[branchId]?.source.anchorId).toBe(anchorId);
  });

  it('anchors a whole inline formula with the same atomic binding path', () => {
    const { context, document, blockId } = buildFormulaFixture();
    const created = createFormulaChild(document, context, blockId, [2, 1], 'x^2');
    const anchorId = created.created.anchorIds[0] as string;
    expect(created.document.anchors[anchorId]).toMatchObject({
      kind: 'formula',
      quote: 'x^2',
      selector: { kind: 'formula', form: 'whole', latex: 'x^2' },
    });
    expect(
      readContentAnchorBinding(created.document.blocks[blockId]?.content ?? { type: 'doc' }, anchorId),
    ).toMatchObject({
      textRanges: [],
      atomicNodes: [{ nodePath: [2, 1], nodeType: 'inlineMath' }],
    });
    expect(resolveAnchor(created.document, anchorId).state).toBe('resolved');
    expectValid(created.document);
  });

  it('reuses an exact whole-formula anchor and keeps it on undo', () => {
    const { context, document, blockId } = buildFormulaFixture();
    const latex = 'Av = \\lambda v';
    const first = createFormulaChild(document, context, blockId, [1], latex);
    const anchorId = first.created.anchorIds[0] as string;
    const anchored = first.document;
    const second = createFormulaChild(anchored, context, blockId, [1], latex);

    expect(second.created.anchorIds).toEqual([]);
    expect(second.affected.anchorIds).toContain(anchorId);
    expect(Object.keys(second.document.anchors)).toEqual([anchorId]);
    expect(
      Object.values(second.document.branches).filter(
        (branch) => branch.source.anchorId === anchorId,
      ),
    ).toHaveLength(2);
    expect(second.document.blocks[blockId]?.updatedAt).toBe(
      anchored.blocks[blockId]?.updatedAt,
    );

    const undone = success(applyInverse(second));
    expect(stable(undone.document)).toEqual(stable(anchored));
    expect(undone.document.anchors[anchorId]).toBeDefined();
    expect(
      Object.values(undone.document.branches).filter(
        (branch) => branch.source.anchorId === anchorId,
      ),
    ).toHaveLength(1);
  });

  it('uses the plain-text projection for a selection containing inline math', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    const chapterId = document.chapters[0]?.id ?? '';
    const content = {
      type: 'doc',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Let ' },
            { type: 'inlineMath', attrs: { latex: '\\lambda' } },
            { type: 'text', text: ' be' },
          ],
        },
      ],
    } satisfies ContentNode;
    const created = run(
      document,
      {
        type: 'block.create',
        blockId: 'math-source',
        content,
        placement: { kind: 'top-level', chapterId },
      },
      context,
    );
    document = created.document;
    const result = run(
      document,
      {
        type: 'branch.createFromSelection',
        blockId: 'math-source',
        kind: 'text',
        binding: {
          kind: 'text',
          ranges: [
            { nodePath: [0, 0], start: 0, end: 4 },
            { nodePath: [0, 2], start: 0, end: 3 },
          ],
        },
        target: { kind: 'new' },
      },
      context,
    );
    const anchorId = result.created.anchorIds[0] as string;
    expect(result.document.anchors[anchorId]).toMatchObject({
      kind: 'text',
      quote: 'Let \\lambda be',
      occurrenceHint: 1,
    });
    expect(readContentAnchorBinding(result.document.blocks['math-source']?.content ?? { type: 'doc' }, anchorId)).toMatchObject({
      textRanges: [
        { nodePath: [0, 0], start: 0, end: 4 },
        { nodePath: [0, 2], start: 0, end: 3 },
      ],
    });
    expectValid(result.document);
  });

  it('branches from a selection to an existing root and restores its chapter slot on undo', () => {
    const { context, document, a, b } = buildFixture();
    const before = structuredClone(document);
    const created = run(
      document,
      {
        type: 'branch.createFromSelection',
        blockId: a,
        kind: 'text',
        binding: textBinding(6, 16),
        target: { kind: 'existing', blockId: b },
        role: 'primary',
      },
      context,
    );
    expect(created.document.chapters[0]?.topLevelBlockIds).toEqual([a]);
    expect(created.document.branches[created.created.branchIds[0] as string]?.source).toMatchObject({
      blockId: a,
      anchorId: created.created.anchorIds[0],
    });

    const undone = success(applyInverse(created));
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.chapters[0]?.topLevelBlockIds).toEqual([a, b]);
    expectValid(created.document);
  });

  it('rejects an invalid binding or illegal target without a partial mutation', () => {
    const { context, document, a, a1 } = buildFixture();
    const before = structuredClone(document);

    const crossing = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId: a,
        kind: 'text',
        binding: textBinding(0, 100),
        target: { kind: 'new' },
      },
      context,
    );
    expect(crossing.ok).toBe(false);
    if (!crossing.ok) expect(crossing.code).toBe('invalid-content');

    const badSelector = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId: a,
        kind: 'text',
        binding: textBinding(6, 16),
        selector: { kind: 'formula', form: 'whole', latex: 'x' },
        target: { kind: 'new' },
      },
      context,
    );
    expect(badSelector.ok).toBe(false);
    if (!badSelector.ok) expect(badSelector.code).toBe('invalid-content');

    const newReference = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId: a,
        kind: 'text',
        binding: textBinding(6, 16),
        target: { kind: 'new' },
        role: 'reference',
      },
      context,
    );
    expect(newReference.ok).toBe(false);

    const occupied = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId: a,
        kind: 'text',
        binding: textBinding(6, 16),
        target: { kind: 'existing', blockId: a1 },
        role: 'primary',
      },
      context,
    );
    expect(occupied.ok).toBe(false);
    if (!occupied.ok) expect(occupied.code).toBe('invalid-placement');

    const missing = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId: a,
        kind: 'text',
        binding: textBinding(6, 16),
        target: { kind: 'existing', blockId: 'missing' },
        role: 'primary',
      },
      context,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('not-found');

    expectNoMutation(before, document);
  });
});
