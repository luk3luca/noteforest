import { describe, expect, it } from 'vitest';
import type { AnchorBinding } from '../src/anchors.js';
import { readContentAnchorBinding } from '../src/anchors.js';
import type { CommandSuccess, DocumentCommand } from '../src/commands.js';
import { executeCommand } from '../src/commands.js';
import { directChildIds, subtreeBlockIds } from '../src/structure.js';
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
  undoOf,
  redoOf,
} from './command-invariants.js';

function expectNoMutation(before: Document, document: Document): void {
  expect(stable(document)).toEqual(stable(before));
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

function textSelector(quote: string, prefix?: string, suffix?: string): JsonObject {
  return {
    kind: 'text',
    quote,
    ...(prefix === undefined ? {} : { prefix }),
    ...(suffix === undefined ? {} : { suffix }),
    occurrenceHint: 1,
  };
}

function textBinding(start: number, end: number, nodePath: number[] = [0, 0]): AnchorBinding {
  return { kind: 'text', ranges: [{ nodePath, start, end }] };
}

function buildFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const topA = addTopLevel(document, 'Alpha eigenvalue beta', context);
  document = topA.document;
  const topB = addTopLevel(document, 'B', context);
  document = topB.document;
  const topC = addTopLevel(document, 'C', context);
  document = topC.document;
  const childA1 = addChild(document, topA.blockId, 'A1', context);
  document = childA1.document;
  const grandA1a = addChild(document, childA1.blockId, 'A1a', context);
  document = grandA1a.document;
  return {
    context,
    document,
    chapterId: document.chapters[0]?.id ?? '',
    a: topA.blockId,
    b: topB.blockId,
    c: topC.blockId,
    a1: childA1.blockId,
    a1a: grandA1a.blockId,
    branchA1: childA1.branchId,
    branchA1a: grandA1a.branchId,
  };
}

function createTextAnchor(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
  anchorId: string,
  start: number,
  end: number,
  quote: string,
  nodePath: number[] = [0, 0],
): CommandSuccess {
  return run(
    document,
    {
      type: 'anchor.create',
      anchorId,
      blockId,
      kind: 'text',
      selector: textSelector(quote, 'Alpha ', ' beta'),
      binding: textBinding(start, end, nodePath),
      quote,
    },
    context,
  );
}

function atomicContent(): ContentNode {
  return {
    type: 'doc',
    children: [
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Intro' }],
      },
      { type: 'mathBlock', attrs: { latex: 'Av = \\lambda v' } },
      { type: 'image', attrs: { assetId: 'sha1', alt: 'diagram' } },
      {
        type: 'codeBlock',
        attrs: { language: 'python' },
        children: [{ type: 'text', text: 'values = eigvals(A)' }],
      },
    ],
  };
}

function buildAtomicFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const created = run(
    document,
    {
      type: 'block.create',
      blockId: 'atomic',
      content: atomicContent(),
      placement: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' },
    },
    context,
  );
  document = created.document;
  const target = addTopLevel(document, 'target', context);
  document = target.document;
  return { context, document, blockId: 'atomic', target: target.blockId, chapterId: document.chapters[0]?.id ?? '' };
}

describe('anchor.create', () => {
  it('binds text, creates the record, and reports only the new anchor ID', () => {
    const { context, document, a } = buildFixture();
    const before = structuredClone(document);
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');

    expect(created.created.anchorIds).toEqual(['anchor-1']);
    expect(created.affected.anchorIds).toEqual(['anchor-1']);
    expect(created.affected.blockIds).toContain(a);
    expect(created.document.anchors['anchor-1']).toMatchObject({
      id: 'anchor-1',
      blockId: a,
      kind: 'text',
      quote: 'eigenvalue',
      prefix: 'Alpha ',
      suffix: ' beta',
      occurrenceHint: 1,
    });
    expect(created.document.blocks[a]?.updatedAt).not.toBe(document.blocks[a]?.updatedAt);
    expect(textNodes(created.document.blocks[a]?.content ?? { type: 'doc' })).toEqual([
      { text: 'Alpha ', ids: [] },
      { text: 'eigenvalue', ids: ['anchor-1'] },
      { text: ' beta', ids: [] },
    ]);
    expect(readContentAnchorBinding(created.document.blocks[a]?.content ?? { type: 'doc' }, 'anchor-1')).toMatchObject({
      textRanges: [{ nodePath: [0, 1], start: 0, end: 10 }],
    });
    expectValid(created.document);
    expect(before).toEqual(document);
  });

  it('undo removes binding and record exactly; redo restores the same anchor', () => {
    const { context, document, a } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const undone = undoOf(created);
    expect(undone.document.anchors['anchor-1']).toBeUndefined();
    expect(stable(undone.document)).toEqual(stable(document));
    expect(textNodes(undone.document.blocks[a]?.content ?? { type: 'doc' })).toEqual([
      { text: 'Alpha eigenvalue beta', ids: [] },
    ]);
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(created.document));
    expect(redone.document.anchors['anchor-1']).toEqual(created.document.anchors['anchor-1']);
  });

  it('refuses an undo that would overwrite text typed after the anchor command', () => {
    const { context, document, a } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const edited = run(created.document, {
      type: 'block.editContent',
      blockId: a,
      content: textContent('Edited after the anchor'),
    }, context);
    const undone = executeCommand(edited.document, created.inverse as DocumentCommand, { context });
    expect(undone.ok).toBe(false);
    if (!undone.ok) expect(undone.code).toBe('invalid-command');
    expect(edited.document.blocks[a]?.content).toEqual(textContent('Edited after the anchor'));

    const undoneEdit = undoOf(edited);
    const anchoredUndo = success(
      executeCommand(undoneEdit.document, created.inverse as DocumentCommand, { context }),
    );
    expect(stable(anchoredUndo.document)).toEqual(stable(document));
  });

  it('rejects an exact duplicate binding unless reuse is explicit', () => {
    const { context, document, a } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const duplicate = tryRun(
      created.document,
      {
        type: 'anchor.create',
        anchorId: 'anchor-2',
        blockId: a,
        kind: 'text',
        selector: textSelector('eigenvalue'),
        binding: textBinding(0, 10, [0, 1]),
      },
      context,
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe('anchor-exists');

    const reused = run(
      created.document,
      {
        type: 'anchor.create',
        anchorId: 'anchor-2',
        blockId: a,
        kind: 'text',
        selector: textSelector('eigenvalue'),
        binding: textBinding(0, 10, [0, 1]),
        reuseExisting: true,
      },
      deterministicContext(5000),
    );
    expect(reused.created.anchorIds).toEqual([]);
    expect(reused.affected.anchorIds).toEqual(['anchor-1']);
    expect(reused.document.anchors['anchor-2']).toBeUndefined();
    expect(reused.document.blocks[a]?.content).toEqual(created.document.blocks[a]?.content);
    expect(reused.warnings.some((warning) => warning.includes('reused existing anchor'))).toBe(true);
  });

  it('allows overlapping and nested text anchors', () => {
    const { context, document, a } = buildFixture();
    const outer = createTextAnchor(document, context, a, 'anchor-outer', 6, 16, 'eigenvalue');
    const nested = createTextAnchor(outer.document, context, a, 'anchor-inner', 0, 5, 'eigen', [0, 1]);
    expectValid(nested.document);
    const node = textNodes(nested.document.blocks[a]?.content ?? { type: 'doc' });
    expect(node.find((entry) => entry.text === 'eigen')).toEqual({
      text: 'eigen',
      ids: ['anchor-inner', 'anchor-outer'],
    });
    expect(node.find((entry) => entry.text === 'value')).toEqual({
      text: 'value',
      ids: ['anchor-outer'],
    });
    expect(nested.document.anchors['anchor-inner']?.quote).toBe('eigen');
    const undone = undoOf(nested);
    expect(undone.document.anchors['anchor-inner']).toBeUndefined();
    expect(undone.document.anchors['anchor-outer']).toBeDefined();
    expect(stable(undone.document)).toEqual(stable(outer.document));
  });

  it('rejects invalid, non-contiguous, empty, and wrong-kind bindings without mutation', () => {
    const { context, document, a } = buildFixture();
    const before = structuredClone(document);
    const empty = tryRun(document, {
      type: 'anchor.create',
      anchorId: 'bad-empty',
      blockId: a,
      kind: 'text',
      selector: textSelector('x'),
      binding: textBinding(6, 6),
    }, context);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('invalid-content');

    const wrongKind = tryRun(document, {
      type: 'anchor.create',
      anchorId: 'bad-kind',
      blockId: a,
      kind: 'formula',
      selector: { kind: 'formula', form: 'whole', latex: 'x' },
      binding: textBinding(6, 16),
    }, context);
    expect(wrongKind.ok).toBe(false);
    if (!wrongKind.ok) expect(wrongKind.code).toBe('invalid-content');

    const missingNode = tryRun(document, {
      type: 'anchor.create',
      anchorId: 'bad-path',
      blockId: a,
      kind: 'text',
      selector: textSelector('x'),
      binding: textBinding(0, 1, [9, 9]),
    }, context);
    expect(missingNode.ok).toBe(false);

    const badSelector = tryRun(document, {
      type: 'anchor.create',
      anchorId: 'bad-selector',
      blockId: a,
      kind: 'text',
      selector: { kind: 'text', quote: '' },
      binding: textBinding(6, 16),
    }, context);
    expect(badSelector.ok).toBe(false);
    if (!badSelector.ok) expect(badSelector.code).toBe('invalid-content');

    const mirrorMismatch = tryRun(document, {
      type: 'anchor.create',
      anchorId: 'bad-mirror',
      blockId: a,
      kind: 'text',
      selector: textSelector('eigenvalue'),
      binding: textBinding(6, 16),
      quote: 'different',
    }, context);
    expect(mirrorMismatch.ok).toBe(false);
    if (!mirrorMismatch.ok) expect(mirrorMismatch.code).toBe('invalid-command');
    expectNoMutation(before, document);
  });

  it('binds formula, code, and image atomic nodes and allows several image regions on one node', () => {
    const { context, document, blockId } = buildAtomicFixture();
    const formula = run(document, {
      type: 'anchor.create',
      anchorId: 'formula-1',
      blockId,
      kind: 'formula',
      selector: { kind: 'formula', form: 'whole', latex: 'Av = \\lambda v', occurrenceHint: 1 },
      binding: { kind: 'formula', form: 'whole', nodePath: [1] },
    }, context);
    const code = run(formula.document, {
      type: 'anchor.create',
      anchorId: 'code-1',
      blockId,
      kind: 'code',
      selector: {
        kind: 'code',
        quote: 'eigvals',
        prefix: 'values = ',
        suffix: '(',
        occurrenceHint: 1,
        startOffset: 9,
        endOffset: 16,
      },
      binding: { kind: 'code', nodePath: [3], startOffset: 9, endOffset: 16 },
    }, context);
    const image = run(code.document, {
      type: 'anchor.create',
      anchorId: 'image-1',
      blockId,
      kind: 'image',
      selector: {
        kind: 'image',
        assetId: 'sha1',
        rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
        point: false,
        label: 'diagram',
      },
      binding: {
        kind: 'image',
        nodePath: [2],
        assetId: 'sha1',
        rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
        point: false,
      },
    }, context);
    const secondRegion = run(image.document, {
      type: 'anchor.create',
      anchorId: 'image-2',
      blockId,
      kind: 'image',
      selector: {
        kind: 'image',
        assetId: 'sha1',
        rect: { x: 0.6, y: 0.6, width: 0.1, height: 0.1 },
        point: false,
      },
      binding: {
        kind: 'image',
        nodePath: [2],
        assetId: 'sha1',
        rect: { x: 0.6, y: 0.6, width: 0.1, height: 0.1 },
        point: false,
      },
    }, context);
    expect(secondRegion.document.anchors['image-1']).toBeDefined();
    expect(secondRegion.document.anchors['image-2']).toBeDefined();
    expect(readContentAnchorBinding(secondRegion.document.blocks[blockId]?.content ?? { type: 'doc' }, 'image-2')?.atomicNodes).toEqual([
      { nodePath: [2], nodeType: 'image' },
    ]);
    expectValid(secondRegion.document);

    const textInCode = tryRun(formula.document, {
      type: 'anchor.create',
      anchorId: 'text-in-code',
      blockId,
      kind: 'text',
      selector: textSelector('values'),
      binding: textBinding(0, 6, [3, 0]),
    }, context);
    expect(textInCode.ok).toBe(false);
    if (!textInCode.ok) expect(textInCode.code).toBe('invalid-content');

    const duplicateImage = tryRun(image.document, {
      type: 'anchor.create',
      anchorId: 'image-duplicate',
      blockId,
      kind: 'image',
      selector: {
        kind: 'image',
        assetId: 'sha1',
        rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
        point: false,
      },
      binding: {
        kind: 'image',
        nodePath: [2],
        assetId: 'sha1',
        rect: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
        point: false,
      },
    }, context);
    expect(duplicateImage.ok).toBe(false);
    if (!duplicateImage.ok) expect(duplicateImage.code).toBe('anchor-exists');
  });
});

describe('anchor.repair', () => {
  it('replaces selector and binding while keeping the anchor, branch, and target identities', () => {
    const { context, document, a, b } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const branch = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const branchId = branch.created.branchIds[0] ?? '';
    expect(branchId).not.toBe('');
    const beforeRepair = branch.document;

    const repaired = run(beforeRepair, {
      type: 'anchor.repair',
      anchorId: 'anchor-1',
      selector: textSelector('Alpha', undefined, ' eigenvalue'),
      binding: textBinding(0, 5),
    }, context);
    const anchor = repaired.document.anchors['anchor-1'];
    expect(anchor).toMatchObject({
      id: 'anchor-1',
      blockId: a,
      kind: 'text',
      quote: 'Alpha',
      suffix: ' eigenvalue',
    });
    expect(anchor?.prefix).toBeUndefined();
    expect(repaired.document.branches[branchId]).toEqual(beforeRepair.branches[branchId]);
    expect(repaired.document.blocks[b]?.content).toEqual(beforeRepair.blocks[b]?.content);
    expectValid(repaired.document);

    const undone = undoOf(repaired);
    expect(stable(undone.document)).toEqual(stable(beforeRepair));
    expect(undone.document.branches[branchId]).toEqual(beforeRepair.branches[branchId]);
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(repaired.document));
    expect(redone.document.anchors['anchor-1']).toEqual(repaired.document.anchors['anchor-1']);
  });

  it('rejects a cross-kind repair and a selection owned by another anchor', () => {
    const { context, document, a } = buildFixture();
    const one = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const two = createTextAnchor(one.document, context, a, 'anchor-2', 0, 5, 'Alpha');
    const snapshot = structuredClone(two.document);
    const crossKind = tryRun(two.document, {
      type: 'anchor.repair',
      anchorId: 'anchor-1',
      selector: { kind: 'formula', form: 'whole', latex: 'x' },
      binding: { kind: 'formula', form: 'whole', nodePath: [1] },
    }, context);
    expect(crossKind.ok).toBe(false);
    expect(two.document).toEqual(snapshot);

    const owned = tryRun(two.document, {
      type: 'anchor.repair',
      anchorId: 'anchor-1',
      selector: textSelector('Alpha'),
      binding: textBinding(0, 5, [0, 0]),
    }, context);
    expect(owned.ok).toBe(false);
    if (!owned.ok) expect(owned.code).toBe('anchor-exists');
    expect(two.document).toEqual(snapshot);
  });

  it('repairs inside the anchor block without touching another block', () => {
    const { context, document, a, a1 } = buildFixture();
    const root = createTextAnchor(document, context, a, 'anchor-root', 6, 16, 'eigenvalue');
    const child = createTextAnchor(root.document, context, a1, 'anchor-child', 0, 2, 'A1');
    const rootContent = structuredClone(child.document.blocks[a]?.content);
    const repaired = run(child.document, {
      type: 'anchor.repair',
      anchorId: 'anchor-child',
      selector: textSelector('A'),
      binding: textBinding(0, 1),
    }, context);
    expect(repaired.document.anchors['anchor-child']?.blockId).toBe(a1);
    expect(repaired.document.anchors['anchor-root']?.blockId).toBe(a);
    expect(repaired.document.blocks[a]?.content).toEqual(rootContent);
    expect(repaired.document.blocks[a1]?.content).not.toEqual(child.document.blocks[a1]?.content);
    expectValid(repaired.document);
  });
});

describe('branch.create', () => {
  it('creates an anchored primary branch, removes the root slot, and undoes exactly', () => {
    const { context, document, a, b, chapterId } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const beforeBranch = created.document;
    const branch = run(beforeBranch, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const branchId = branch.created.branchIds[0] ?? '';
    expect(branch.document.branches[branchId]).toMatchObject({
      id: branchId,
      source: { blockId: a, anchorId: 'anchor-1' },
      targetBlockId: b,
      role: 'primary',
    });
    expect(branch.document.chapters.find((chapter) => chapter.id === chapterId)?.topLevelBlockIds).not.toContain(b);
    expect(directChildIds(branch.document, a)[0]).toBe(b);
    expectValid(branch.document);

    const undone = undoOf(branch);
    expect(stable(undone.document)).toEqual(stable(beforeBranch));
    expect(undone.document.branches[branchId]).toBeUndefined();
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(branch.document));
    expect(redone.document.branches[branchId]).toEqual(branch.document.branches[branchId]);
  });

  it('creates reference edges without touching chapters, and allows reference cycles', () => {
    const { context, document, a, b, c } = buildFixture();
    const before = structuredClone(document);
    const forward = run(document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: b,
      role: 'reference',
    }, context);
    const backward = run(forward.document, {
      type: 'branch.create',
      sourceBlockId: b,
      targetBlockId: a,
      role: 'reference',
    }, context);
    expect(backward.document.chapters).toEqual(before.chapters);
    expect(forward.created.branchIds).toHaveLength(1);
    expect(backward.document.branches[forward.created.branchIds[0] ?? '']?.role).toBe('reference');
    expectValid(backward.document);
    void c;

    const undone = undoOf(backward);
    expect(undone.document.branches[backward.created.branchIds[0] ?? '']).toBeUndefined();
    const undoneForward = success(
      executeCommand(undone.document, forward.inverse as DocumentCommand, { context }),
    );
    expect(stable(undoneForward.document)).toEqual(stable(document));
  });

  it('deduplicates an exact source-target edge regardless of role', () => {
    const { context, document, a, b } = buildFixture();
    const reference = run(document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: b,
      role: 'reference',
    }, context);
    const existingId = reference.created.branchIds[0] ?? '';
    const duplicate = run(reference.document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: b,
      role: 'primary',
    }, context);
    expect(duplicate.created.branchIds).toEqual([]);
    expect(duplicate.affected.branchIds).toEqual([existingId]);
    expect(duplicate.inverse).toBeNull();
    expect(Object.keys(duplicate.document.branches).length).toBe(
      Object.keys(reference.document.branches).length,
    );
    expect(duplicate.document.branches[existingId]?.role).toBe('reference');
    expect(duplicate.warnings.some((warning) => warning.includes('reused it'))).toBe(true);
  });

  it('rejects primary cycles, second primary parents, self-branches, and empty chapters', () => {
    const { context, document, a, b, a1, a1a, chapterId } = buildFixture();
    const second = run(document, {
      type: 'chapter.create',
      chapterId: 'chapter-2',
      title: 'Second',
      atIndex: 1,
    }, context);
    const onlyRoot = run(second.document, {
      type: 'block.create',
      blockId: 'chapter-2-root',
      content: textContent('Only root'),
      placement: { kind: 'top-level', chapterId: 'chapter-2' },
    }, context);
    const createdAnchor = createTextAnchor(onlyRoot.document, context, a, 'anchor-1', 6, 16, 'eigenvalue');

    const emptyChapter = tryRun(createdAnchor.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: 'chapter-2-root',
      role: 'primary',
    }, context);
    expect(emptyChapter.ok).toBe(false);
    if (!emptyChapter.ok) expect(emptyChapter.code).toBe('chapter-would-be-empty');

    const secondParent = tryRun(createdAnchor.document, {
      type: 'branch.create',
      sourceBlockId: b,
      targetBlockId: a1,
      role: 'primary',
    }, context);
    expect(secondParent.ok).toBe(false);
    if (!secondParent.ok) expect(secondParent.code).toBe('invalid-placement');

    const self = tryRun(createdAnchor.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: a,
      role: 'reference',
    }, context);
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.code).toBe('cycle');

    const cycle = tryRun(createdAnchor.document, {
      type: 'branch.create',
      sourceBlockId: a1a,
      targetBlockId: a,
      role: 'primary',
    }, context);
    expect(cycle.ok).toBe(false);
    if (!cycle.ok) expect(cycle.code).toBe('cycle');
    void chapterId;
  });

  it('rejects an anchor port from a different block and a missing source anchor', () => {
    const { context, document, a, a1, b } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const wrongBlock = tryRun(created.document, {
      type: 'branch.create',
      sourceBlockId: a1,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'reference',
    }, context);
    expect(wrongBlock.ok).toBe(false);
    if (!wrongBlock.ok) expect(wrongBlock.code).toBe('invalid-command');

    const missing = tryRun(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'missing',
      targetBlockId: b,
      role: 'reference',
    }, context);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('not-found');
  });
});

describe('branch.delete, reorder, and relabel across ports', () => {
  it('deletes only a reference edge, never its target', () => {
    const { context, document, a, b } = buildFixture();
    const before = structuredClone(document);
    const reference = run(document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: b,
      role: 'reference',
    }, context);
    const branchId = reference.created.branchIds[0] ?? '';
    const deleted = run(reference.document, { type: 'branch.delete', branchId }, context);
    expect(deleted.document.branches[branchId]).toBeUndefined();
    expect(deleted.document.blocks[b]).toEqual(before.blocks[b]);
    expect(deleted.document.chapters).toEqual(before.chapters);
    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(reference.document));
    expect(undone.document.branches[branchId]).toEqual(reference.document.branches[branchId]);
  });

  it('promotes an anchored primary target on delete and restores the exact branch on undo', () => {
    const { context, document, a, b, chapterId } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const branch = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const branchId = branch.created.branchIds[0] ?? '';
    const deleted = run(branch.document, {
      type: 'branch.delete',
      branchId,
      targetHandling: { kind: 'promote' },
    }, context);
    expect(deleted.document.blocks[b]).toEqual(branch.document.blocks[b]);
    const topLevel = deleted.document.chapters.find((chapter) => chapter.id === chapterId)?.topLevelBlockIds ?? [];
    expect(topLevel.indexOf(b)).toBe(topLevel.indexOf(a) + 1);
    expect(deleted.document.anchors['anchor-1']).toEqual(branch.document.anchors['anchor-1']);
    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(branch.document));
    expect(undone.document.branches[branchId]).toEqual(branch.document.branches[branchId]);
  });

  it('deletes anchored primary descendants with delete-subtree and restores them exactly', () => {
    const { context, document, a, b } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const branch = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const branchId = branch.created.branchIds[0] ?? '';
    const child = addChild(branch.document, b, 'B1', context);
    const deleted = run(child.document, {
      type: 'branch.delete',
      branchId,
      targetHandling: { kind: 'delete-subtree' },
    }, context);
    expect(deleted.document.blocks[b]).toBeUndefined();
    expect(deleted.document.blocks[child.blockId]).toBeUndefined();
    expect(deleted.document.blocks[a]).toBeDefined();
    expectValid(deleted.document);
    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(child.document));
  });

  it('follows anchored primary descendants when deleting a subtree', () => {
    const { context, document, a, b, c } = buildFixture();
    const rootAnchor = createTextAnchor(document, context, a, 'anchor-root', 6, 16, 'eigenvalue');
    const rootBranch = run(rootAnchor.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-root',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const rootBranchId = rootBranch.created.branchIds[0] ?? '';
    const child = addChild(rootBranch.document, b, 'B1', context);
    const childAnchor = createTextAnchor(child.document, context, child.blockId, 'anchor-child', 0, 2, 'B1');
    const grand = run(childAnchor.document, {
      type: 'branch.create',
      sourceBlockId: child.blockId,
      sourceAnchorId: 'anchor-child',
      targetBlockId: c,
      role: 'primary',
    }, context);
    const before = grand.document;
    const deleted = run(before, {
      type: 'branch.delete',
      branchId: rootBranchId,
      targetHandling: { kind: 'delete-subtree' },
    }, context);
    expect(deleted.document.blocks[b]).toBeUndefined();
    expect(deleted.document.blocks[child.blockId]).toBeUndefined();
    expect(deleted.document.blocks[c]).toBeUndefined();
    expect(deleted.document.anchors['anchor-child']).toBeUndefined();
    expect(deleted.document.blocks[a]).toBeDefined();
    expectValid(deleted.document);
    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(before));
  });

  it('reorders anchored primary and reference lists with exact inverse order keys', () => {
    const { context, document, a, b, c } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const first = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const second = run(first.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: c,
      role: 'primary',
    }, context);
    const firstId = first.created.branchIds[0] ?? '';
    const secondId = second.created.branchIds[0] ?? '';
    const before = second.document;
    const reordered = run(before, { type: 'branch.reorder', branchId: secondId, toIndex: 0 }, context);
    const anchored = Object.values(reordered.document.branches)
      .filter((branch) => branch.source.anchorId === 'anchor-1' && branch.role === 'primary')
      .sort((left, right) => (left.order < right.order ? -1 : left.order > right.order ? 1 : 0));
    expect(anchored.map((branch) => branch.id)).toEqual([secondId, firstId]);
    const undone = undoOf(reordered);
    expect(stable(undone.document)).toEqual(stable(before));
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(reordered.document));
  });

  it('reorders and relabels reference branches without moving blocks', () => {
    const { context, document, a, b, c } = buildFixture();
    const first = run(document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: b,
      role: 'reference',
    }, context);
    const second = run(first.document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: c,
      role: 'reference',
    }, context);
    const firstId = first.created.branchIds[0] ?? '';
    const secondId = second.created.branchIds[0] ?? '';
    const before = second.document;
    const reordered = run(before, { type: 'branch.reorder', branchId: secondId, toIndex: 0 }, context);
    expect(reordered.document.chapters).toEqual(before.chapters);
    const labelled = run(reordered.document, {
      type: 'branch.relabel',
      branchId: secondId,
      label: 'see also',
    }, context);
    expect(labelled.document.branches[secondId]?.label).toBe('see also');
    expect(labelled.document.blocks[b]).toEqual(before.blocks[b]);
    expect(labelled.document.blocks[c]).toEqual(before.blocks[c]);
    const undoneLabel = undoOf(labelled);
    expect(undoneLabel.document.branches[secondId]?.label).toBeUndefined();
    const undoneReorder = success(
      executeCommand(undoneLabel.document, reordered.inverse as DocumentCommand, { context }),
    );
    expect(stable(undoneReorder.document)).toEqual(stable(before));
    void firstId;
  });

  it('falls back to an exact snapshot when reorder must repair unusable order keys', () => {
    const { context, document, a, b, c } = buildFixture();
    const first = run(document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: b,
      role: 'reference',
    }, context);
    const second = run(first.document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: c,
      role: 'reference',
    }, context);
    const legacy = structuredClone(second.document);
    const firstId = first.created.branchIds[0] ?? '';
    const secondId = second.created.branchIds[0] ?? '';
    if (legacy.branches[firstId]) legacy.branches[firstId].order = 'same';
    if (legacy.branches[secondId]) legacy.branches[secondId].order = 'same';
    expectValid(legacy);
    const reordered = run(legacy, { type: 'branch.reorder', branchId: secondId, toIndex: 0 }, context);
    expect(reordered.inverse?.type).toBe('structure.restore');
    const undone = undoOf(reordered);
    expect(stable(undone.document)).toEqual(stable(legacy));
    expect(undone.document.branches[firstId]?.order).toBe('same');
    expect(undone.document.branches[secondId]?.order).toBe('same');
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(reordered.document));
  });

  it('rejects a primary delete without an explicit target handling', () => {
    const { context, document, a, b } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const branch = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const result = tryRun(branch.document, {
      type: 'branch.delete',
      branchId: branch.created.branchIds[0] ?? '',
    }, context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid-command');
  });
});

describe('anchor.attachToBlock and anchor.delete', () => {
  it('attaches anchored primary and reference branches to the block, appending after existing rows', () => {
    const { context, document, a, a1, b, c } = buildFixture();
    const existing = addChild(document, a, 'Existing', context);
    const created = createTextAnchor(existing.document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const primary = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const primaryId = primary.created.branchIds[0] ?? '';
    const reference = run(primary.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: c,
      role: 'reference',
      label: 'see also',
    }, context);
    const referenceId = reference.created.branchIds[0] ?? '';
    const beforeAttach = reference.document;
    const attached = run(beforeAttach, { type: 'anchor.attachToBlock', anchorId: 'anchor-1' }, context);
    expect(attached.document.anchors['anchor-1']).toBeUndefined();
    expect(readContentAnchorBinding(attached.document.blocks[a]?.content ?? { type: 'doc' }, 'anchor-1')).toBeNull();
    expect(attached.document.branches[primaryId]).toMatchObject({
      id: primaryId,
      source: { blockId: a },
      targetBlockId: b,
      role: 'primary',
    });
    expect(attached.document.branches[referenceId]).toMatchObject({
      id: referenceId,
      source: { blockId: a },
      targetBlockId: c,
      role: 'reference',
      label: 'see also',
    });
    expect(directChildIds(attached.document, a)).toEqual([a1, existing.blockId, b]);
    expect(attached.document.blocks[b]).toEqual(beforeAttach.blocks[b]);
    expect(attached.document.blocks[c]).toEqual(beforeAttach.blocks[c]);
    expectValid(attached.document);

    const undone = undoOf(attached);
    expect(stable(undone.document)).toEqual(stable(beforeAttach));
    expect(undone.document.anchors['anchor-1']).toEqual(beforeAttach.anchors['anchor-1']);
    expect(undone.document.branches[primaryId]).toEqual(beforeAttach.branches[primaryId]);
    expect(undone.document.branches[referenceId]).toEqual(beforeAttach.branches[referenceId]);
  });

  it('deduplicates role-independently on attach: an existing primary wins over a reference duplicate', () => {
    const { context, document, a, b } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const primary = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const reference = run(primary.document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: b,
      role: 'reference',
    }, context);
    // The reference is deduped at creation, so construct the legacy duplicate
    // explicitly to test attach-time collapse.
    const legacy = structuredClone(reference.document);
    const referenceId = 'legacy-duplicate-reference';
    legacy.branches[referenceId] = {
      id: referenceId,
      source: { blockId: a },
      targetBlockId: b,
      role: 'reference',
      order: 'legacy',
    };
    expectValid(legacy);
    const attached = run(legacy, { type: 'anchor.attachToBlock', anchorId: 'anchor-1' }, context);
    expect(attached.document.branches[referenceId]).toBeUndefined();
    const toB = Object.values(attached.document.branches).filter(
      (branch) => branch.source.blockId === a && branch.targetBlockId === b,
    );
    expect(toB).toHaveLength(1);
    expect(toB[0]?.role).toBe('primary');
    expectValid(attached.document);
  });

  it('keeps the incoming primary when an existing block reference has the same target', () => {
    const { context, document, a, b } = buildFixture();
    const existing = run(document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: b,
      role: 'reference',
    }, context);
    const existingId = existing.created.branchIds[0] ?? '';
    const created = createTextAnchor(existing.document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const primary = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const primaryId = primary.created.branchIds[0] ?? '';
    const attached = run(primary.document, { type: 'anchor.attachToBlock', anchorId: 'anchor-1' }, context);
    expect(attached.document.branches[existingId]).toBeUndefined();
    expect(attached.document.branches[primaryId]?.role).toBe('primary');
    expect(attached.document.branches[primaryId]?.source).toEqual({ blockId: a });
    expect(primary.document.chapters[0]?.topLevelBlockIds).not.toContain(b);
    expectValid(attached.document);
    const undone = undoOf(attached);
    expect(stable(undone.document)).toEqual(stable(primary.document));
    expect(undone.document.branches[existingId]).toEqual(primary.document.branches[existingId]);
    expect(undone.document.branches[primaryId]).toEqual(primary.document.branches[primaryId]);
  });

  it('deletes an anchor with attach and preserves all outgoing branches', () => {
    const { context, document, a, b } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const branch = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const branchId = branch.created.branchIds[0] ?? '';
    const attached = run(branch.document, {
      type: 'anchor.delete',
      anchorId: 'anchor-1',
      branches: 'attach',
    }, context);
    expect(attached.document.anchors['anchor-1']).toBeUndefined();
    expect(attached.document.branches[branchId]?.source).toEqual({ blockId: a });
    expect(directChildIds(attached.document, a)).toContain(b);
    const undone = undoOf(attached);
    expect(stable(undone.document)).toEqual(stable(branch.document));
  });

  it('deletes branches with anchor.delete but never deletes or subtrees the targets', () => {
    const { context, document, a, b, c, chapterId } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const primary = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const reference = run(primary.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: c,
      role: 'reference',
    }, context);
    const child = addChild(reference.document, b, 'B1', context);
    const beforeDelete = child.document;
    const deleted = run(beforeDelete, {
      type: 'anchor.delete',
      anchorId: 'anchor-1',
      branches: 'delete',
    }, context);
    expect(deleted.document.anchors['anchor-1']).toBeUndefined();
    expect(deleted.document.blocks[b]).toBeDefined();
    expect(deleted.document.blocks[child.blockId]).toBeDefined();
    expect(deleted.document.blocks[c]).toBeDefined();
    expect(
      Object.values(deleted.document.branches).some((branch) => branch.source.anchorId === 'anchor-1'),
    ).toBe(false);
    const topLevel = deleted.document.chapters.find((chapter) => chapter.id === chapterId)?.topLevelBlockIds ?? [];
    expect(topLevel.indexOf(b)).toBe(topLevel.indexOf(a) + 1);
    expect(deleted.document.branches[child.branchId]).toBeDefined();
    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(beforeDelete));
  });

  it('promotes several anchored primary targets in branch order on anchor.delete', () => {
    const { context, document, a, b, c, chapterId } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const first = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const second = run(first.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: c,
      role: 'primary',
    }, context);
    const deleted = run(second.document, {
      type: 'anchor.delete',
      anchorId: 'anchor-1',
      branches: 'delete',
    }, context);
    const topLevel = deleted.document.chapters.find((chapter) => chapter.id === chapterId)?.topLevelBlockIds ?? [];
    expect(topLevel.slice(topLevel.indexOf(a) + 1, topLevel.indexOf(a) + 3)).toEqual([b, c]);
    expectValid(deleted.document);
    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(second.document));
  });

  it('requires an explicit branch choice when the anchor has outgoing branches', () => {
    const { context, document, a, b } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const branch = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'reference',
    }, context);
    const result = tryRun(branch.document, {
      type: 'anchor.delete',
      anchorId: 'anchor-1',
    }, context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid-command');
  });

  it('removes an idle anchor without a branch choice', () => {
    const { context, document, a } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const deleted = run(created.document, { type: 'anchor.delete', anchorId: 'anchor-1' }, context);
    expect(deleted.document.anchors['anchor-1']).toBeUndefined();
    expect(
      textNodes(deleted.document.blocks[a]?.content ?? { type: 'doc' })
        .map((entry) => entry.text)
        .join(''),
    ).toBe('Alpha eigenvalue beta');
    // Removing the mark leaves no artificial text-node boundary for a later
    // editor commit to coalesce and invalidate the undo snapshot.
    expect(textNodes(deleted.document.blocks[a]?.content ?? { type: 'doc' })).toHaveLength(1);
    expect(
      textNodes(deleted.document.blocks[a]?.content ?? { type: 'doc' }).every(
        (entry) => entry.ids.length === 0,
      ),
    ).toBe(true);
    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(created.document));
  });
});

describe('anchored traversal and lifted M2 restrictions', () => {
  it('follows direct and anchored primary branches for directChildIds and subtreeBlockIds', () => {
    const { context, document, a, b, a1 } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const anchored = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    expect(directChildIds(anchored.document, a)).toEqual([b, a1]);
    expect(subtreeBlockIds(anchored.document, a)).toContain(b);
    expect(subtreeBlockIds(anchored.document, a)).toContain(a1);
  });

  it('rejects a move or primary branch under an anchored descendant as a cycle', () => {
    const { context, document, a, b } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const anchored = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const child = addChild(anchored.document, b, 'B1', context);
    const move = tryRun(child.document, {
      type: 'block.move',
      blockId: a,
      to: { kind: 'child', parentBlockId: child.blockId },
    }, context);
    expect(move.ok).toBe(false);
    if (!move.ok) expect(move.code).toBe('cycle');

    const branch = tryRun(child.document, {
      type: 'branch.create',
      sourceBlockId: child.blockId,
      targetBlockId: a,
      role: 'primary',
    }, context);
    expect(branch.ok).toBe(false);
    if (!branch.ok) expect(branch.code).toBe('cycle');
  });

  it('moves an anchored child to top level and keeps the cited anchor as a reference', () => {
    const { context, document, a, a1, b, chapterId } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const anchored = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const branchId = anchored.created.branchIds[0] ?? '';
    const beforeMove = anchored.document;
    const moved = run(beforeMove, {
      type: 'block.move',
      blockId: b,
      to: { kind: 'top-level', chapterId, atIndex: 0 },
    }, context);
    // The old anchored primary edge is kept as a reference: the anchor is the
    // citation and is never silently lost on a reparent.
    expect(moved.document.branches[branchId]?.role).toBe('reference');
    expect(moved.document.branches[branchId]?.source).toEqual({
      blockId: a,
      anchorId: 'anchor-1',
    });
    expect(moved.document.chapters.find((chapter) => chapter.id === chapterId)?.topLevelBlockIds[0]).toBe(b);
    expect(
      Object.values(moved.document.branches).some(
        (branch) => branch.role === 'primary' && branch.targetBlockId === b,
      ),
    ).toBe(false);
    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(beforeMove));
    expect(undone.document.branches[branchId]).toEqual(beforeMove.branches[branchId]);
    void a1;
  });

  it('moves an anchored child under another parent with a reference citation and exact undo', () => {
    const { context, document, a, b, c } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const anchored = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const oldBranchId = anchored.created.branchIds[0] ?? '';
    const beforeMove = anchored.document;
    const moved = run(beforeMove, {
      type: 'block.move',
      blockId: b,
      to: { kind: 'child', parentBlockId: c },
    }, context);
    // The anchor survives as a dashed reference with the same source/anchor;
    // the destination owns the fresh primary edge.
    expect(moved.document.branches[oldBranchId]?.role).toBe('reference');
    expect(moved.document.branches[oldBranchId]?.source).toEqual({
      blockId: a,
      anchorId: 'anchor-1',
    });
    const incoming = Object.values(moved.document.branches).find(
      (branch) => branch.role === 'primary' && branch.targetBlockId === b,
    );
    expect(incoming?.source).toEqual({ blockId: c });
    expect(incoming?.id).not.toBe(oldBranchId);
    expectValid(moved.document);
    const undone = undoOf(moved);
    expect(stable(undone.document)).toEqual(stable(beforeMove));
    expect(undone.document.branches[oldBranchId]).toEqual(beforeMove.branches[oldBranchId]);
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(moved.document));
  });

  it('promotes anchored primary children when their parent block is deleted', () => {
    const { context, document, a, b } = buildFixture();
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const anchored = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const oldBranchId = anchored.created.branchIds[0] ?? '';
    const deleted = run(anchored.document, {
      type: 'block.delete',
      blockId: a,
      children: 'promote',
    }, context);
    expect(deleted.document.blocks[b]).toBeDefined();
    expect(deleted.document.blocks[a]).toBeUndefined();
    expect(deleted.document.anchors['anchor-1']).toBeUndefined();
    expect(deleted.document.branches[oldBranchId]).toBeUndefined();
    expect(deleted.document.chapters[0]?.topLevelBlockIds).toContain(b);
    expectValid(deleted.document);
    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(anchored.document));
  });

  it('gives a promoted anchored child a fresh branch from the deleted block parent', () => {
    const { context, document, a1, b } = buildFixture();
    const parent = addChild(document, a1, 'P', context);
    const anchored = createTextAnchor(parent.document, context, parent.blockId, 'anchor-p', 0, 1, 'P');
    const branch = run(anchored.document, {
      type: 'branch.create',
      sourceBlockId: parent.blockId,
      sourceAnchorId: 'anchor-p',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const oldBranchId = branch.created.branchIds[0] ?? '';
    const deleted = run(branch.document, {
      type: 'block.delete',
      blockId: parent.blockId,
      children: 'promote',
    }, context);
    expect(deleted.document.blocks[parent.blockId]).toBeUndefined();
    expect(deleted.document.blocks[b]).toBeDefined();
    expect(deleted.document.branches[oldBranchId]).toBeUndefined();
    const incoming = Object.values(deleted.document.branches).find(
      (candidate) => candidate.role === 'primary' && candidate.targetBlockId === b,
    );
    expect(incoming?.source).toEqual({ blockId: a1 });
    expect(incoming?.id).not.toBe(oldBranchId);
    expectValid(deleted.document);
    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(branch.document));
    expect(undone.document.branches[oldBranchId]).toEqual(branch.document.branches[oldBranchId]);
  });

  it('does not mutate the input document on any failing command', () => {
    const { context, document, a, b } = buildFixture();
    const before = structuredClone(document);
    const created = createTextAnchor(document, context, a, 'anchor-1', 6, 16, 'eigenvalue');
    const branch = run(created.document, {
      type: 'branch.create',
      sourceBlockId: a,
      sourceAnchorId: 'anchor-1',
      targetBlockId: b,
      role: 'primary',
    }, context);
    const snapshot = structuredClone(branch.document);
    const failures: DocumentCommand[] = [
      { type: 'anchor.create', anchorId: 'x', blockId: a, kind: 'text', selector: textSelector('x'), binding: textBinding(0, 0) },
      { type: 'anchor.repair', anchorId: 'missing', selector: textSelector('x'), binding: textBinding(0, 1) },
      { type: 'branch.create', sourceBlockId: a, sourceAnchorId: 'anchor-1', targetBlockId: 'missing', role: 'primary' },
      { type: 'branch.delete', branchId: branch.created.branchIds[0] ?? '' },
    ];
    for (const command of failures) {
      const result = executeCommand(branch.document, command, { context });
      expect(result.ok).toBe(false);
      expect(branch.document).toEqual(snapshot);
    }
    expectNoMutation(before, document);
  });
});
