import { describe, expect, it } from 'vitest';
import type { AnchorBinding } from '../src/anchors.js';
import {
  codeAnchorSelectorForBinding,
  readContentAnchorBinding,
  resolveAnchor,
} from '../src/anchors.js';
import type { CommandSuccess } from '../src/commands.js';
import { applyInverse } from '../src/commands.js';
import { directChildIds } from '../src/structure.js';
import type { ContentNode, Document, JsonObject } from '../src/types.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
  run,
  textContent,
  tryRun,
} from './helpers.js';
import {
  expectCommandSuccess as success,
  expectDocumentValid as expectValid,
  normalizedDocument as stable,
} from './command-invariants.js';

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

interface FormulaTermInput {
  nodePath: number[];
  latex: string;
  latexStart?: number;
  latexPrefix?: string;
  latexSuffix?: string;
  occurrence?: number;
  occurrenceHint?: number;
}

function formulaTermBinding(input: FormulaTermInput): AnchorBinding {
  return {
    kind: 'formula',
    form: 'term',
    nodePath: input.nodePath,
    latex: input.latex,
    occurrence: input.occurrence ?? 1,
  };
}

function formulaTermSelector(input: FormulaTermInput): JsonObject {
  return {
    kind: 'formula',
    form: 'term',
    latex: input.latex,
    ...(input.latexStart === undefined ? {} : { latexStart: input.latexStart }),
    ...(input.latexPrefix === undefined ? {} : { latexPrefix: input.latexPrefix }),
    ...(input.latexSuffix === undefined ? {} : { latexSuffix: input.latexSuffix }),
    occurrenceHint: input.occurrenceHint ?? input.occurrence ?? 1,
  };
}

function createFormulaTermChild(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
  input: FormulaTermInput,
): CommandSuccess {
  return run(
    document,
    {
      type: 'branch.createFromSelection',
      blockId,
      kind: 'formula',
      binding: formulaTermBinding(input),
      selector: formulaTermSelector(input),
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

const CODE_TEXT = 'values = eigvals(A)\nprint(eigvals(A))';

interface CodeSelectionInput {
  nodePath: number[];
  startOffset: number;
  endOffset: number;
}

function codeBinding(input: CodeSelectionInput): AnchorBinding {
  return {
    kind: 'code',
    nodePath: input.nodePath,
    startOffset: input.startOffset,
    endOffset: input.endOffset,
  };
}

function codeSelectorFor(document: Document, blockId: string, input: CodeSelectionInput): JsonObject {
  const block = document.blocks[blockId];
  if (block === undefined) throw new Error(`missing code fixture block ${blockId}`);
  const selector = codeAnchorSelectorForBinding(block.content, codeBinding(input));
  if (selector === null) throw new Error('code selection did not produce a selector');
  return selector;
}

function createCodeChild(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
  input: CodeSelectionInput,
  selector: JsonObject = codeSelectorFor(document, blockId, input),
): CommandSuccess {
  return run(
    document,
    {
      type: 'branch.createFromSelection',
      blockId,
      kind: 'code',
      binding: codeBinding(input),
      selector,
      target: { kind: 'new' },
    },
    context,
  );
}

function buildCodeFixture(text = CODE_TEXT) {
  const context = deterministicContext();
  let document = newDocument(context);
  const content = {
    type: 'doc',
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'Code source' }] },
      {
        type: 'codeBlock',
        attrs: { language: 'python' },
        children: [{ type: 'text', text }],
      },
    ],
  } satisfies ContentNode;
  const created = run(
    document,
    {
      type: 'block.create',
      blockId: 'code-source',
      content,
      placement: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' },
    },
    context,
  );
  document = created.document;
  return { context, document, blockId: 'code-source', text };
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

  it('anchors a unique formula term with the atomic binding and one exact inverse', () => {
    const { context, document, blockId } = buildFormulaFixture();
    const before = structuredClone(document);
    const term = '\\lambda';
    const created = createFormulaTermChild(document, context, blockId, {
      nodePath: [1],
      latex: term,
      latexStart: 5,
      latexPrefix: 'Av = ',
      latexSuffix: ' v',
      occurrence: 1,
    });
    const anchorId = created.created.anchorIds[0] as string;
    const childId = created.created.blockIds[0] as string;
    const branchId = created.created.branchIds[0] as string;

    expect(created.document.anchors[anchorId]).toMatchObject({
      id: anchorId,
      blockId,
      kind: 'formula',
      quote: term,
      prefix: 'Av = ',
      suffix: ' v',
      occurrenceHint: 1,
    });
    expect(created.document.anchors[anchorId]?.selector).toEqual({
      kind: 'formula',
      form: 'term',
      latex: term,
      latexStart: 5,
      latexPrefix: 'Av = ',
      latexSuffix: ' v',
      occurrenceHint: 1,
    });
    expect(
      readContentAnchorBinding(created.document.blocks[blockId]?.content ?? { type: 'doc' }, anchorId),
    ).toMatchObject({
      textRanges: [],
      atomicNodes: [{ nodePath: [1], nodeType: 'mathBlock' }],
    });
    const resolution = resolveAnchor(created.document, anchorId);
    expect(resolution.state).toBe('resolved');
    expect(resolution.resolved?.range).toMatchObject({
      kind: 'formula',
      form: 'term',
      nodePath: [1],
      latexStart: 5,
      latexEnd: 12,
      occurrence: 1,
    });
    expect(created.document.branches[branchId]).toMatchObject({
      source: { blockId, anchorId },
      targetBlockId: childId,
      role: 'primary',
    });
    expectValid(created.document);

    const undone = success(applyInverse(created));
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.anchors[anchorId]).toBeUndefined();
    expect(undone.document.blocks[childId]).toBeUndefined();
    expect(undone.document.branches[branchId]).toBeUndefined();

    const redone = success(applyInverse(undone));
    expect(stable(redone.document)).toEqual(stable(created.document));
    expect(redone.document.anchors[anchorId]).toEqual(created.document.anchors[anchorId]);
    expect(redone.document.branches[branchId]?.source.anchorId).toBe(anchorId);
  });

  it('reuses only an exact term and keeps repeated terms ambiguous', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    const chapterId = document.chapters[0]?.id ?? '';
    const term = '\\lambda';
    const created = run(
      document,
      {
        type: 'block.create',
        blockId: 'formula-repeated',
        content: {
          type: 'doc',
          children: [{ type: 'mathBlock', attrs: { latex: '\\lambda + \\lambda' } }],
        },
        placement: { kind: 'top-level', chapterId },
      },
      context,
    );
    document = created.document;
    const blockId = 'formula-repeated';

    const first = createFormulaTermChild(document, context, blockId, {
      nodePath: [0],
      latex: term,
      latexStart: 0,
      latexSuffix: ' + \\lambda',
      occurrence: 1,
    });
    const anchorId = first.created.anchorIds[0] as string;
    const firstResolution = resolveAnchor(first.document, anchorId);
    expect(firstResolution.state).toBe('ambiguous');
    expect(firstResolution.reason).toBe('multiple-candidates');
    expect(firstResolution.candidates).toHaveLength(2);
    expect(firstResolution.resolved).toBeNull();

    // The same selected occurrence reuses the exact anchor; the selector's
    // start/hint are part of the identity.
    const exact = createFormulaTermChild(first.document, context, blockId, {
      nodePath: [0],
      latex: term,
      latexStart: 0,
      latexSuffix: ' + \\lambda',
      occurrence: 1,
    });
    expect(exact.created.anchorIds).toEqual([]);
    expect(exact.affected.anchorIds).toContain(anchorId);
    expect(exact.warnings.some((message) => message.includes('reused existing anchor'))).toBe(true);
    expect(Object.keys(exact.document.anchors)).toEqual([anchorId]);
    expect(
      Object.values(exact.document.branches).filter(
        (branch) => branch.source.anchorId === anchorId,
      ),
    ).toHaveLength(2);
    expect(resolveAnchor(exact.document, anchorId).state).toBe('ambiguous');

    // Selecting the other occurrence is a different term selection and creates
    // its own anchor. It stays ambiguous too: the hint ranks candidates only.
    const second = createFormulaTermChild(exact.document, context, blockId, {
      nodePath: [0],
      latex: term,
      latexStart: 10,
      latexPrefix: '\\lambda + ',
      occurrence: 2,
    });
    const secondAnchorId = second.created.anchorIds[0] as string;
    expect(second.created.anchorIds).toHaveLength(1);
    expect(secondAnchorId).not.toBe(anchorId);
    expect(second.document.anchors[secondAnchorId]?.selector).toMatchObject({
      form: 'term',
      latex: term,
      latexStart: 10,
      occurrenceHint: 2,
    });
    const secondResolution = resolveAnchor(second.document, secondAnchorId);
    expect(secondResolution.state).toBe('ambiguous');
    expect(secondResolution.candidates).toHaveLength(2);
    expect(secondResolution.resolved).toBeNull();

    const undone = success(applyInverse(second));
    expect(Object.keys(undone.document.anchors)).toEqual([anchorId]);
    expect(
      Object.values(undone.document.branches).filter(
        (branch) => branch.source.anchorId === secondAnchorId,
      ),
    ).toHaveLength(0);
    expect(
      Object.values(undone.document.branches).filter(
        (branch) => branch.source.anchorId === anchorId,
      ),
    ).toHaveLength(2);

    const redone = success(applyInverse(undone));
    expect(Object.keys(redone.document.anchors).sort()).toEqual(
      [anchorId, secondAnchorId].sort(),
    );
    expect(redone.document.anchors[secondAnchorId]?.selector).toEqual(
      second.document.anchors[secondAnchorId]?.selector,
    );
  });

  it('rejects a term that does not match its binding or formula source without mutation', () => {
    const { context, document, blockId } = buildFormulaFixture();
    const before = structuredClone(document);
    const base: FormulaTermInput = {
      nodePath: [1],
      latex: '\\lambda',
      latexStart: 5,
      latexPrefix: 'Av = ',
      latexSuffix: ' v',
      occurrence: 1,
    };

    const missing = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId,
        kind: 'formula',
        binding: formulaTermBinding({ ...base, latex: '\\mu' }),
        selector: formulaTermSelector({ ...base, latex: '\\mu', latexStart: 5 }),
        target: { kind: 'new' },
      },
      context,
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('invalid-content');

    const mismatch = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId,
        kind: 'formula',
        binding: formulaTermBinding(base),
        selector: formulaTermSelector({ ...base, latex: '\\mu' }),
        target: { kind: 'new' },
      },
      context,
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.code).toBe('invalid-content');

    const wrongStart = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId,
        kind: 'formula',
        binding: formulaTermBinding(base),
        selector: formulaTermSelector({ ...base, latexStart: 4 }),
        target: { kind: 'new' },
      },
      context,
    );
    expect(wrongStart.ok).toBe(false);
    if (!wrongStart.ok) expect(wrongStart.code).toBe('invalid-content');

    const wrongHint = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId,
        kind: 'formula',
        binding: formulaTermBinding({ ...base, occurrence: 2 }),
        selector: formulaTermSelector({ ...base, occurrenceHint: 1 }),
        target: { kind: 'new' },
      },
      context,
    );
    expect(wrongHint.ok).toBe(false);
    if (!wrongHint.ok) expect(wrongHint.code).toBe('invalid-content');

    expectNoMutation(before, document);
  });

  it('anchors a unique code range with a code selector and one exact inverse', () => {
    const { context, document, blockId, text } = buildCodeFixture(
      'values = eigvals(A)\nprint(values)',
    );
    const before = structuredClone(document);
    const start = text.indexOf('eigvals');
    const end = start + 'eigvals'.length;
    const created = createCodeChild(document, context, blockId, {
      nodePath: [1],
      startOffset: start,
      endOffset: end,
    });
    const anchorId = created.created.anchorIds[0] as string;
    const childId = created.created.blockIds[0] as string;
    const branchId = created.created.branchIds[0] as string;

    expect(created.document.anchors[anchorId]).toMatchObject({
      id: anchorId,
      blockId,
      kind: 'code',
      quote: 'eigvals',
      prefix: 'values = ',
      suffix: '(A)\nprint(values)',
      occurrenceHint: 1,
    });
    expect(created.document.anchors[anchorId]?.selector).toEqual({
      kind: 'code',
      quote: 'eigvals',
      form: 'range',
      prefix: 'values = ',
      suffix: '(A)\nprint(values)',
      occurrenceHint: 1,
      startOffset: start,
      endOffset: end,
      lineStart: 1,
      lineEnd: 1,
    });
    expect(
      readContentAnchorBinding(created.document.blocks[blockId]?.content ?? { type: 'doc' }, anchorId),
    ).toMatchObject({
      textRanges: [],
      atomicNodes: [{ nodePath: [1], nodeType: 'codeBlock' }],
    });
    expect(
      created.document.blocks[blockId]?.content.children?.[1]?.attrs?.['anchorIds'],
    ).toEqual([anchorId]);
    const resolution = resolveAnchor(created.document, anchorId);
    expect(resolution.state).toBe('resolved');
    expect(resolution.reason).toBe('exact-binding');
    expect(resolution.resolved?.range).toMatchObject({
      kind: 'code',
      nodePath: [1],
      start,
      end,
      lineStart: 1,
      lineEnd: 1,
    });
    expect(created.document.branches[branchId]).toMatchObject({
      source: { blockId, anchorId },
      targetBlockId: childId,
      role: 'primary',
    });
    expectValid(created.document);

    const undone = success(applyInverse(created));
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.anchors[anchorId]).toBeUndefined();
    expect(undone.document.blocks[childId]).toBeUndefined();
    expect(undone.document.branches[branchId]).toBeUndefined();

    const redone = success(applyInverse(undone));
    expect(stable(redone.document)).toEqual(stable(created.document));
    expect(redone.document.anchors[anchorId]).toEqual(created.document.anchors[anchorId]);
    expect(redone.document.branches[branchId]?.source.anchorId).toBe(anchorId);
  });

  it('uses form whole and code-point offsets for a whole-code selection', () => {
    const { context, document, blockId, text } = buildCodeFixture('A😀eigvals(A)\nprint(A)');
    const created = createCodeChild(document, context, blockId, {
      nodePath: [1],
      startOffset: 0,
      endOffset: Array.from(text).length,
    });
    const anchorId = created.created.anchorIds[0] as string;
    expect(created.document.anchors[anchorId]?.selector).toMatchObject({
      kind: 'code',
      form: 'whole',
      quote: text,
      startOffset: 0,
      endOffset: Array.from(text).length,
      lineStart: 1,
      lineEnd: 2,
    });
    expect(resolveAnchor(created.document, anchorId).state).toBe('resolved');

    const astralStart = Array.from(text.slice(0, text.indexOf('eigvals'))).length;
    expect(astralStart).toBe(2);
    const range = createCodeChild(created.document, context, blockId, {
      nodePath: [1],
      startOffset: astralStart,
      endOffset: astralStart + 'eigvals'.length,
    });
    const rangeAnchorId = range.created.anchorIds[0] as string;
    expect(range.document.anchors[rangeAnchorId]?.selector).toMatchObject({
      form: 'range',
      quote: 'eigvals',
      startOffset: 2,
      endOffset: 9,
      lineStart: 1,
      lineEnd: 1,
    });
  });

  it('reuses only the exact code selection and keeps repeated quotes ambiguous', () => {
    const { context, document, blockId, text } = buildCodeFixture();
    const firstStart = text.indexOf('eigvals');
    const secondStart = text.indexOf('eigvals', firstStart + 1);
    expect(firstStart).toBe(9);
    expect(secondStart).toBe(26);
    const first = createCodeChild(document, context, blockId, {
      nodePath: [1],
      startOffset: firstStart,
      endOffset: firstStart + 7,
    });
    const anchorId = first.created.anchorIds[0] as string;
    const firstResolution = resolveAnchor(first.document, anchorId);
    expect(firstResolution.state).toBe('ambiguous');
    expect(firstResolution.reason).toBe('multiple-candidates');
    expect(firstResolution.candidates).toHaveLength(2);
    expect(firstResolution.resolved).toBeNull();

    const exact = createCodeChild(first.document, context, blockId, {
      nodePath: [1],
      startOffset: firstStart,
      endOffset: firstStart + 7,
    });
    expect(exact.created.anchorIds).toEqual([]);
    expect(exact.affected.anchorIds).toContain(anchorId);
    expect(exact.warnings.some((message) => message.includes('reused existing anchor'))).toBe(true);
    expect(Object.keys(exact.document.anchors)).toEqual([anchorId]);
    expect(
      Object.values(exact.document.branches).filter(
        (branch) => branch.source.anchorId === anchorId,
      ),
    ).toHaveLength(2);
    expect(resolveAnchor(exact.document, anchorId).state).toBe('ambiguous');

    const second = createCodeChild(exact.document, context, blockId, {
      nodePath: [1],
      startOffset: secondStart,
      endOffset: secondStart + 7,
    });
    const secondAnchorId = second.created.anchorIds[0] as string;
    expect(secondAnchorId).not.toBe(anchorId);
    expect(second.document.anchors[secondAnchorId]?.selector).toMatchObject({
      kind: 'code',
      quote: 'eigvals',
      form: 'range',
      occurrenceHint: 2,
      startOffset: 26,
      endOffset: 33,
      lineStart: 2,
      lineEnd: 2,
    });
    expect(resolveAnchor(second.document, secondAnchorId).state).toBe('ambiguous');

    const undone = success(applyInverse(second));
    expect(Object.keys(undone.document.anchors)).toEqual([anchorId]);
    expect(
      Object.values(undone.document.branches).filter(
        (branch) => branch.source.anchorId === secondAnchorId,
      ),
    ).toHaveLength(0);

    const redone = success(applyInverse(undone));
    expect(redone.document.anchors[secondAnchorId]?.selector).toEqual(
      second.document.anchors[secondAnchorId]?.selector,
    );
  });

  it('rejects a code selector that does not match its binding without mutation', () => {
    const { context, document, blockId } = buildCodeFixture();
    const before = structuredClone(document);
    const start = CODE_TEXT.indexOf('eigvals');
    const base: CodeSelectionInput = {
      nodePath: [1],
      startOffset: start,
      endOffset: start + 7,
    };
    const selector = codeSelectorFor(document, blockId, base);

    const mismatches: JsonObject[] = [
      { ...selector, quote: 'eigval' },
      { ...selector, startOffset: start + 1 },
      { ...selector, endOffset: start + 8 },
      { ...selector, occurrenceHint: 2 },
      { ...selector, lineStart: 2 },
      { ...selector, form: 'whole' },
    ];
    for (const candidate of mismatches) {
      const result = tryRun(
        document,
        {
          type: 'branch.createFromSelection',
          blockId,
          kind: 'code',
          binding: codeBinding(base),
          selector: candidate,
          target: { kind: 'new' },
        },
        context,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('invalid-content');
    }

    const wrongNode = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId,
        kind: 'code',
        binding: codeBinding({ nodePath: [0], startOffset: 1, endOffset: 4 }),
        selector,
        target: { kind: 'new' },
      },
      context,
    );
    expect(wrongNode.ok).toBe(false);
    if (!wrongNode.ok) expect(wrongNode.code).toBe('invalid-content');

    const outOfRange = tryRun(
      document,
      {
        type: 'branch.createFromSelection',
        blockId,
        kind: 'code',
        binding: codeBinding({ nodePath: [1], startOffset: 0, endOffset: 1000 }),
        selector,
        target: { kind: 'new' },
      },
      context,
    );
    expect(outOfRange.ok).toBe(false);
    if (!outOfRange.ok) expect(outOfRange.code).toBe('invalid-content');

    expectNoMutation(before, document);
  });

  it('derives a code selector when the selection command omits it', () => {
    const { context, document, blockId } = buildCodeFixture();
    const created = run(
      document,
      {
        type: 'branch.createFromSelection',
        blockId,
        kind: 'code',
        binding: codeBinding({ nodePath: [1], startOffset: 9, endOffset: 16 }),
        target: { kind: 'new' },
      },
      context,
    );
    const anchorId = created.created.anchorIds[0] as string;
    expect(created.document.anchors[anchorId]?.selector).toMatchObject({
      kind: 'code',
      quote: 'eigvals',
      form: 'range',
      startOffset: 9,
      endOffset: 16,
      occurrenceHint: 1,
    });
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
