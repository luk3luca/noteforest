import { describe, expect, it } from 'vitest';
import type { AnchorBinding } from '../src/anchors.js';
import { readContentAnchorBinding, resolveAnchor } from '../src/anchors.js';
import type { CommandSuccess } from '../src/commands.js';
import { directChildBranches, primaryParentBranch } from '../src/structure.js';
import type { ContentNode, Document, JsonObject } from '../src/types.js';
import { parseDocumentJson, stringifyDocument } from '../src/serialize.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
  run,
  tryRun,
} from './helpers.js';
import {
  expectDocumentValid as expectValid,
  normalizedDocument as stable,
  undoOf,
  redoOf,
} from './command-invariants.js';

function textSelector(quote: string): JsonObject {
  return { kind: 'text', quote, occurrenceHint: 1 };
}

interface TextLocation {
  nodePath: number[];
  start: number;
  text: string;
}

function findTextNode(content: ContentNode, needle: string): TextLocation {
  let found: TextLocation | null = null;
  const walk = (node: ContentNode, path: number[]): void => {
    if (found !== null) return;
    if (node.type === 'text' && (node.text ?? '').includes(needle)) {
      found = {
        nodePath: [...path],
        start: (node.text ?? '').indexOf(needle),
        text: node.text ?? '',
      };
      return;
    }
    for (const [index, child] of (node.children ?? []).entries()) {
      walk(child, [...path, index]);
    }
  };
  walk(content, []);
  if (found === null) throw new Error(`text "${needle}" is not in the block`);
  return found;
}

function textBinding(content: ContentNode, quote: string): AnchorBinding {
  const location = findTextNode(content, quote);
  return {
    kind: 'text',
    ranges: [
      {
        nodePath: location.nodePath,
        start: location.start,
        end: location.start + quote.length,
      },
    ],
  };
}

function createTextAnchor(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
  anchorId: string,
  quote: string,
): CommandSuccess {
  const block = document.blocks[blockId];
  if (block === undefined) throw new Error(`missing block ${blockId}`);
  return run(
    document,
    {
      type: 'anchor.create',
      anchorId,
      blockId,
      kind: 'text',
      selector: textSelector(quote),
      binding: textBinding(block.content, quote),
    },
    context,
  );
}

function createFormulaAnchor(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
  anchorId: string,
  nodePath: number[],
  latex: string,
): CommandSuccess {
  return run(
    document,
    {
      type: 'anchor.create',
      anchorId,
      blockId,
      kind: 'formula',
      selector: { kind: 'formula', form: 'whole', latex },
      binding: { kind: 'formula', form: 'whole', nodePath },
    },
    context,
  );
}

function createCodeAnchor(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  blockId: string,
  anchorId: string,
  nodePath: number[],
  quote: string,
): CommandSuccess {
  return run(
    document,
    {
      type: 'anchor.create',
      anchorId,
      blockId,
      kind: 'code',
      selector: {
        kind: 'code',
        form: 'whole',
        quote,
        startOffset: 0,
        endOffset: quote.length,
        lineStart: 1,
        lineEnd: 1,
        occurrenceHint: 1,
      },
      binding: {
        kind: 'code',
        nodePath,
        startOffset: 0,
        endOffset: quote.length,
      },
    },
    context,
  );
}

function referenceFromAnchor(
  document: Document,
  context: ReturnType<typeof deterministicContext>,
  sourceBlockId: string,
  anchorId: string,
  targetBlockId: string,
): { document: Document; branchId: string } {
  const result = run(
    document,
    {
      type: 'branch.create',
      sourceBlockId,
      sourceAnchorId: anchorId,
      targetBlockId,
      role: 'reference',
    },
    context,
  );
  const branchId = result.created.branchIds[0];
  if (branchId === undefined) throw new Error('branch.create returned no branch ID');
  return { document: result.document, branchId };
}

function branchIdsAtPort(
  document: Document,
  parentBlockId: string,
  anchorId?: string,
): string[] {
  return Object.values(document.branches)
    .filter(
      (branch) =>
        branch.role === 'primary' &&
        branch.source.blockId === parentBlockId &&
        branch.source.anchorId === anchorId,
    )
    .sort((left, right) =>
      left.order === right.order
        ? left.id < right.id
          ? -1
          : 1
        : left.order < right.order
          ? -1
          : 1,
    )
    .map((branch) => branch.id);
}

function chapterBlocks(document: Document, chapterId: string): string[] {
  return document.chapters.find((chapter) => chapter.id === chapterId)?.topLevelBlockIds ?? [];
}

function createdBranchId(result: CommandSuccess): string {
  const branchId = result.created.branchIds[0];
  if (branchId === undefined) throw new Error('command created no branch');
  return branchId;
}

function blockText(block: { content: ContentNode } | undefined): string {
  if (block === undefined) return '';
  const collect = (node: ContentNode): string =>
    node.type === 'text' ? (node.text ?? '') : (node.children ?? []).map(collect).join('');
  return collect(block.content);
}

function buildSplitFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const chapterId = document.chapters[0]?.id ?? '';
  const source = addTopLevel(document, 'Source', context);
  document = source.document;
  const block = document.blocks[source.blockId];
  if (block === undefined) throw new Error('source block is missing');
  block.content = {
    type: 'doc',
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: 'Before middle after' }] },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Formula ' },
          { type: 'inlineMath', attrs: { latex: 'x^2' } },
        ],
      },
      { type: 'codeBlock', attrs: { language: 'ts' }, children: [{ type: 'text', text: 'const x = 1;' }] },
      { type: 'paragraph', children: [{ type: 'text', text: 'Tail paragraph' }] },
    ],
  };
  expectValid(document);

  // Targets stay top-level; reference branches keep them home while still
  // proving that branch sources follow moved anchors.
  for (const name of ['Before target', 'After target', 'Span target', 'Formula target', 'Code target']) {
    const target = addTopLevel(document, name, context);
    document = target.document;
  }
  const targetIds = document.chapters[0]?.topLevelBlockIds.slice(1) ?? [];
  const [beforeTarget, afterTarget, spanTarget, formulaTarget, codeTarget] = targetIds;

  const anchorBefore = createTextAnchor(document, context, source.blockId, 'anchor-before', 'Before');
  document = anchorBefore.document;
  const anchorAfter = createTextAnchor(document, context, source.blockId, 'anchor-after', 'after');
  document = anchorAfter.document;
  const anchorSpan = createTextAnchor(document, context, source.blockId, 'anchor-span', 'middle');
  document = anchorSpan.document;
  const anchorFormula = createFormulaAnchor(
    document,
    context,
    source.blockId,
    'anchor-formula',
    [1, 1],
    'x^2',
  );
  document = anchorFormula.document;
  const anchorCode = createCodeAnchor(
    document,
    context,
    source.blockId,
    'anchor-code',
    [2],
    'const x = 1;',
  );
  document = anchorCode.document;

  const chain: Array<[string, string]> = [
    ['anchor-before', beforeTarget ?? ''],
    ['anchor-after', afterTarget ?? ''],
    ['anchor-span', spanTarget ?? ''],
    ['anchor-formula', formulaTarget ?? ''],
    ['anchor-code', codeTarget ?? ''],
  ];
  const branchIds: Record<string, string> = {};
  for (const [anchorId, targetId] of chain) {
    const linked = referenceFromAnchor(document, context, source.blockId, anchorId, targetId);
    document = linked.document;
    branchIds[anchorId] = linked.branchId;
  }

  const direct = addChild(document, source.blockId, 'Direct child', context);
  document = direct.document;

  return {
    context,
    document,
    chapterId,
    sourceId: source.blockId,
    directId: direct.blockId,
    targetIds: targetIds as string[],
    branchIds,
  };
}

describe('M3f1 block.split', () => {
  it('splits a top-level text leaf and migrates text, formula, code, branch, and chapter identity', () => {
    const fixture = buildSplitFixture();
    const before = fixture.document;
    const block = before.blocks[fixture.sourceId];
    if (block === undefined) throw new Error('missing source block');
    const middle = findTextNode(block.content, 'middle');
    const beforeBranchRecords = Object.fromEntries(
      Object.entries(fixture.branchIds).map(([anchorId, branchId]) => [
        anchorId,
        structuredClone(before.branches[branchId]),
      ]),
    );
    const directBranch = directChildBranches(before, fixture.sourceId)[0];
    if (directBranch === undefined) throw new Error('direct child branch is missing');

    const split = run(
      before,
      {
        type: 'block.split',
        blockId: fixture.sourceId,
        at: { nodePath: middle.nodePath, offset: 3 },
      },
      fixture.context,
    );
    const newBlockId = split.created.blockIds[0];
    expect(typeof newBlockId).toBe('string');
    if (newBlockId === undefined) return;
    expect(split.created.branchIds).toEqual([]);
    expect(split.inverse?.type).toBe('structure.restore');

    const original = split.document.blocks[fixture.sourceId];
    const created = split.document.blocks[newBlockId];
    expect(original?.content).toBeDefined();
    expect(created?.content).toBeDefined();
    expect(original?.updatedAt).not.toBe(before.blocks[fixture.sourceId]?.updatedAt);
    expect(chapterBlocks(split.document, fixture.chapterId).slice(0, 2)).toEqual([
      fixture.sourceId,
      newBlockId,
    ]);

    const originalText = blockText(original);
    const createdText = blockText(created);
    expect(originalText).toContain('Before');
    expect(originalText).toContain('mid');
    expect(originalText).not.toContain('dle');
    expect(originalText).not.toContain('after');
    expect(createdText).toContain('dle after');
    expect(createdText).toContain('Formula');
    expect(createdText).toContain('const x = 1;');
    expect(createdText).toContain('Tail paragraph');

    expect(split.document.anchors['anchor-before']?.blockId).toBe(fixture.sourceId);
    expect(split.document.anchors['anchor-after']?.blockId).toBe(newBlockId);
    expect(split.document.anchors['anchor-span']?.blockId).toBe(fixture.sourceId);
    expect(split.document.anchors['anchor-formula']?.blockId).toBe(newBlockId);
    expect(split.document.anchors['anchor-code']?.blockId).toBe(newBlockId);
    expect(split.document.anchors['anchor-span']?.repairFlags).toEqual([
      'split-inside-anchor',
    ]);
    expect(split.document.anchors['anchor-span']?.quote).toBe('middle');

    const spanBinding = readContentAnchorBinding(original?.content ?? { type: 'doc' }, 'anchor-span');
    const afterSpanBinding = readContentAnchorBinding(
      created?.content ?? { type: 'doc' },
      'anchor-span',
    );
    expect(spanBinding).not.toBeNull();
    expect(afterSpanBinding).toBeNull();
    expect(resolveAnchor(split.document, 'anchor-span')).toMatchObject({
      state: 'resolved',
      repairFlags: ['split-inside-anchor'],
    });

    for (const [anchorId, branchId] of Object.entries(fixture.branchIds)) {
      const branch = split.document.branches[branchId];
      const beforeBranch = beforeBranchRecords[anchorId];
      expect(branch?.id).toBe(branchId);
      expect(branch?.targetBlockId).toBe(beforeBranch?.targetBlockId);
      expect(branch?.order).toBe(beforeBranch?.order);
      const moved =
        anchorId === 'anchor-after' ||
        anchorId === 'anchor-formula' ||
        anchorId === 'anchor-code';
      expect(branch?.source).toEqual({
        blockId: moved ? newBlockId : fixture.sourceId,
        anchorId,
      });
    }

    expect(split.document.branches[directBranch.id]).toEqual(before.branches[directBranch.id]);
    expect(primaryParentBranch(split.document, fixture.directId)?.source.blockId).toBe(
      fixture.sourceId,
    );
    expectValid(split.document);

    const undone = undoOf(split);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.blocks[newBlockId]).toBeUndefined();
    expect(undone.document.anchors['anchor-span']?.repairFlags).toBeUndefined();
    expectValid(undone.document);

    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(split.document));
    expect(redone.document.blocks[newBlockId]?.createdAt).toBe(created?.createdAt);
    expect(redone.document.anchors['anchor-span']?.repairFlags).toEqual([
      'split-inside-anchor',
    ]);
    expectValid(redone.document);

    const reloaded = parseDocumentJson(stringifyDocument(redone.document));
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(stable(reloaded.document)).toEqual(stable(redone.document));
      expect(resolveAnchor(reloaded.document, 'anchor-span').repairFlags).toEqual([
        'split-inside-anchor',
      ]);
    }
  });

  it('splits a child from the same anchor port and keeps direct children with the original', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    const parent = addTopLevel(document, 'Parent anchor text', context);
    document = parent.document;
    const anchored = createTextAnchor(document, context, parent.blockId, 'anchor-parent', 'anchor');
    document = anchored.document;
    const firstChild = addTopLevel(document, 'Child alpha beta', context);
    document = firstChild.document;
    const secondChild = addTopLevel(document, 'Second child', context);
    document = secondChild.document;
    const branchFirst = run(
      document,
      {
        type: 'branch.create',
        sourceBlockId: parent.blockId,
        sourceAnchorId: 'anchor-parent',
        targetBlockId: firstChild.blockId,
        role: 'primary',
      },
      context,
    );
    document = branchFirst.document;
    const branchFirstId = branchFirst.created.branchIds[0];
    const branchSecond = run(
      document,
      {
        type: 'branch.create',
        sourceBlockId: parent.blockId,
        sourceAnchorId: 'anchor-parent',
        targetBlockId: secondChild.blockId,
        role: 'primary',
      },
      context,
    );
    document = branchSecond.document;
    const branchSecondId = branchSecond.created.branchIds[0];
    const grandchild = addChild(document, firstChild.blockId, 'Grandchild', context);
    document = grandchild.document;
    const before = document;

    const targetBlock = before.blocks[firstChild.blockId];
    if (targetBlock === undefined || branchFirstId === undefined) throw new Error('fixture missing');
    const beta = findTextNode(targetBlock.content, 'beta');
    const split = run(
      before,
      {
        type: 'block.split',
        blockId: firstChild.blockId,
        at: { nodePath: beta.nodePath, offset: 2 },
      },
      context,
    );
    const newBlockId = split.created.blockIds[0];
    expect(typeof newBlockId).toBe('string');
    const newBranchId = split.created.branchIds[0];
    expect(typeof newBranchId).toBe('string');
    if (newBlockId === undefined || newBranchId === undefined) return;

    expect(split.document.chapters[0]?.topLevelBlockIds).not.toContain(newBlockId);
    const newBranch = split.document.branches[newBranchId];
    expect(newBranch).toMatchObject({
      source: { blockId: parent.blockId, anchorId: 'anchor-parent' },
      targetBlockId: newBlockId,
      role: 'primary',
    });
    expect(
      branchIdsAtPort(split.document, parent.blockId, 'anchor-parent').map(
        (branchId) => split.document.branches[branchId]?.targetBlockId,
      ),
    ).toEqual([firstChild.blockId, newBlockId, secondChild.blockId]);
    expect(newBranch?.order).toBeDefined();
    expect((newBranch?.order ?? '') > (split.document.branches[branchFirstId]?.order ?? '')).toBe(
      true,
    );
    expect((newBranch?.order ?? '') < (split.document.branches[branchSecondId ?? '']?.order ?? '')).toBe(
      true,
    );
    expect(primaryParentBranch(split.document, grandchild.blockId)?.source.blockId).toBe(
      firstChild.blockId,
    );
    expectValid(split.document);

    const undone = undoOf(split);
    expect(stable(undone.document)).toEqual(stable(before));
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(split.document));
    expect(redone.document.branches[newBranchId]?.source).toEqual({
      blockId: parent.blockId,
      anchorId: 'anchor-parent',
    });
  });

  it('rejects an atomic-node or empty-side split before mutation', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    const block = addTopLevel(document, 'Text', context);
    document = block.document;
    document = run(
      document,
      {
        type: 'block.editContent',
        blockId: block.blockId,
        content: {
          type: 'doc',
          children: [
            { type: 'paragraph', children: [{ type: 'text', text: 'Only text' }] },
            { type: 'codeBlock', children: [{ type: 'text', text: 'const x = 1;' }] },
          ],
        },
      },
      context,
    ).document;
    const before = document;

    const insideCode = tryRun(
      before,
      {
        type: 'block.split',
        blockId: block.blockId,
        at: { nodePath: [1, 0], offset: 3 },
      },
      context,
    );
    expect(insideCode.ok).toBe(false);
    if (!insideCode.ok) expect(insideCode.code).toBe('invalid-content');

    const atStart = tryRun(
      before,
      {
        type: 'block.split',
        blockId: block.blockId,
        at: { nodePath: [0, 0], offset: 0 },
      },
      context,
    );
    expect(atStart.ok).toBe(false);

    const atEndOfLastContent = tryRun(
      before,
      {
        type: 'block.split',
        blockId: block.blockId,
        at: { nodePath: [1, 0], offset: 0 },
      },
      context,
    );
    expect(atEndOfLastContent.ok).toBe(false);
    expect(stable(before)).toEqual(stable(document));
  });
});

function buildMergeFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const chapterId = document.chapters[0]?.id ?? '';
  const parent = addTopLevel(document, 'Parent', context);
  document = parent.document;
  const survivor = addChild(document, parent.blockId, 'Alpha anchor', context);
  document = survivor.document;
  const merged = addChild(document, parent.blockId, 'Beta anchor', context);
  document = merged.document;
  const survivorChild = addChild(document, survivor.blockId, 'Survivor child', context);
  document = survivorChild.document;
  const mergedChild = addChild(document, merged.blockId, 'Merged child', context);
  document = mergedChild.document;

  const target = addTopLevel(document, 'Reference target', context);
  document = target.document;
  const sourceZ = addTopLevel(document, 'Source Z', context);
  document = sourceZ.document;

  const survivorAnchor = createTextAnchor(
    document,
    context,
    survivor.blockId,
    'anchor-survivor',
    'anchor',
  );
  document = survivorAnchor.document;
  const mergedAnchor = createTextAnchor(
    document,
    context,
    merged.blockId,
    'anchor-merged',
    'anchor',
  );
  document = mergedAnchor.document;
  const mergedBranch = referenceFromAnchor(
    document,
    context,
    merged.blockId,
    'anchor-merged',
    target.blockId,
  );
  document = mergedBranch.document;
  const survivorReference = run(
    document,
    {
      type: 'branch.create',
      sourceBlockId: survivor.blockId,
      targetBlockId: target.blockId,
      role: 'reference',
    },
    context,
  );
  document = survivorReference.document;
  const survivorReferenceId = createdBranchId(survivorReference);
  const mergedDuplicateReference = run(
    document,
    {
      type: 'branch.create',
      sourceBlockId: merged.blockId,
      targetBlockId: target.blockId,
      role: 'reference',
    },
    context,
  );
  document = mergedDuplicateReference.document;
  const duplicateReferenceId = createdBranchId(mergedDuplicateReference);
  const selfReference = run(
    document,
    {
      type: 'branch.create',
      sourceBlockId: merged.blockId,
      targetBlockId: survivor.blockId,
      role: 'reference',
    },
    context,
  );
  document = selfReference.document;
  const selfReferenceId = createdBranchId(selfReference);
  const incomingReference = run(
    document,
    {
      type: 'branch.create',
      sourceBlockId: sourceZ.blockId,
      targetBlockId: merged.blockId,
      role: 'reference',
    },
    context,
  );
  document = incomingReference.document;
  const incomingReferenceId = createdBranchId(incomingReference);

  return {
    context,
    document,
    chapterId,
    parentId: parent.blockId,
    survivorId: survivor.blockId,
    mergedId: merged.blockId,
    survivorChildId: survivorChild.blockId,
    mergedChildId: mergedChild.blockId,
    survivorBranchId: survivor.branchId,
    mergedBranchId: merged.branchId,
    survivorChildBranchId: survivorChild.branchId,
    mergedChildBranchId: mergedChild.branchId,
    targetId: target.blockId,
    sourceZId: sourceZ.blockId,
    survivorReferenceId,
    duplicateReferenceId,
    selfReferenceId,
    incomingReferenceId,
    anchorMergedBranchId: mergedBranch.branchId,
  };
}

describe('M3f1 block.merge', () => {
  it('merges children, moves anchors, retargets/dedupes edges, drops self-branches, and undoes exactly', () => {
    const fixture = buildMergeFixture();
    const before = fixture.document;
    const mergedBefore = before.blocks[fixture.mergedId];
    const survivorBefore = before.blocks[fixture.survivorId];
    const mergedAnchorBefore = before.anchors['anchor-merged'];
    if (
      mergedBefore === undefined ||
      survivorBefore === undefined ||
      mergedAnchorBefore === undefined
    ) {
      throw new Error('merge fixture blocks are missing');
    }

    const merged = run(
      before,
      { type: 'block.merge', blockId: fixture.mergedId },
      fixture.context,
    );
    expect(merged.inverse?.type).toBe('structure.restore');
    expect(merged.document.blocks[fixture.mergedId]).toBeUndefined();

    const survivorAfter = merged.document.blocks[fixture.survivorId];
    expect(survivorAfter?.content.children?.length).toBe(
      (survivorBefore.content.children?.length ?? 0) +
        (mergedBefore.content.children?.length ?? 0),
    );
    expect(blockText(survivorAfter)).toContain('Alpha anchor');
    expect(blockText(survivorAfter)).toContain('Beta anchor');

    expect(merged.document.anchors['anchor-merged']).toMatchObject({
      ...mergedAnchorBefore,
      blockId: fixture.survivorId,
    });
    expect(merged.document.anchors['anchor-survivor']?.blockId).toBe(fixture.survivorId);
    expect(
      readContentAnchorBinding(survivorAfter?.content ?? { type: 'doc' }, 'anchor-merged'),
    ).not.toBeNull();

    // The merged block's own incoming primary edge is retired, never retargeted.
    expect(merged.document.branches[fixture.mergedBranchId]).toBeUndefined();
    expect(primaryParentBranch(merged.document, fixture.survivorId)?.id).toBe(
      fixture.survivorBranchId,
    );

    // Its primary children become children of the survivor, after existing
    // children, keeping branch IDs.
    expect(merged.document.branches[fixture.mergedChildBranchId]).toMatchObject({
      id: fixture.mergedChildBranchId,
      source: { blockId: fixture.survivorId },
      targetBlockId: fixture.mergedChildId,
      role: 'primary',
    });
    expect(
      branchIdsAtPort(merged.document, fixture.survivorId).map(
        (branchId) => merged.document.branches[branchId]?.targetBlockId,
      ),
    ).toEqual([fixture.survivorChildId, fixture.mergedChildId]);

    // Exact duplicate reference A -> target collapses to the earlier edge;
    // the retargeted duplicate is removed.
    expect(merged.document.branches[fixture.survivorReferenceId]).toBeDefined();
    expect(merged.document.branches[fixture.duplicateReferenceId]).toBeUndefined();
    const targetEdges = Object.values(merged.document.branches).filter(
      (branch) =>
        branch.source.blockId === fixture.survivorId &&
        branch.source.anchorId === undefined &&
        branch.targetBlockId === fixture.targetId,
    );
    expect(targetEdges).toHaveLength(1);
    expect(targetEdges[0]?.id).toBe(fixture.survivorReferenceId);
    expect(merged.document.branches[fixture.anchorMergedBranchId]).toMatchObject({
      source: { blockId: fixture.survivorId, anchorId: 'anchor-merged' },
      targetBlockId: fixture.targetId,
    });

    // A source-target that becomes the survivor itself is a self-branch and is
    // dropped, never created as S -> S.
    expect(merged.document.branches[fixture.selfReferenceId]).toBeUndefined();
    expect(
      Object.values(merged.document.branches).some(
        (branch) => branch.source.blockId === branch.targetBlockId,
      ),
    ).toBe(false);
    expect(merged.document.branches[fixture.incomingReferenceId]).toMatchObject({
      source: { blockId: fixture.sourceZId },
      targetBlockId: fixture.survivorId,
      role: 'reference',
    });
    expect(merged.document.chapters[0]?.topLevelBlockIds).toEqual(
      before.chapters[0]?.topLevelBlockIds,
    );
    expectValid(merged.document);

    const undone = undoOf(merged);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(undone.document.blocks[fixture.mergedId]?.content).toEqual(mergedBefore.content);
    expect(undone.document.branches[fixture.mergedChildBranchId]).toEqual(
      before.branches[fixture.mergedChildBranchId],
    );
    expect(undone.document.branches[fixture.incomingReferenceId]).toEqual(
      before.branches[fixture.incomingReferenceId],
    );
    expect(undone.document.anchors['anchor-merged']).toEqual(mergedAnchorBefore);
    expectValid(undone.document);

    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(merged.document));
    expect(redone.document.branches[fixture.duplicateReferenceId]).toBeUndefined();
    expect(redone.document.branches[fixture.mergedChildBranchId]?.source.blockId).toBe(
      fixture.survivorId,
    );
  });

  it('merges top-level blocks in one chapter and removes the merged slot', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    const chapterId = document.chapters[0]?.id ?? '';
    const first = addTopLevel(document, 'First alpha', context);
    document = first.document;
    const second = addTopLevel(document, 'Second beta', context);
    document = second.document;
    document = createTextAnchor(document, context, second.blockId, 'anchor-top', 'Second').document;
    const target = addTopLevel(document, 'Top target', context);
    document = target.document;
    const edge = referenceFromAnchor(
      document,
      context,
      second.blockId,
      'anchor-top',
      target.blockId,
    );
    document = edge.document;
    const before = document;

    const merged = run(
      document,
      { type: 'block.merge', blockId: second.blockId, intoBlockId: first.blockId },
      context,
    );
    expect(chapterBlocks(merged.document, chapterId)).toEqual(
      chapterBlocks(before, chapterId).filter((id) => id !== second.blockId),
    );
    expect(merged.document.blocks[second.blockId]).toBeUndefined();
    expect(merged.document.anchors['anchor-top']?.blockId).toBe(first.blockId);
    expect(merged.document.branches[edge.branchId]).toMatchObject({
      source: { blockId: first.blockId, anchorId: 'anchor-top' },
      targetBlockId: target.blockId,
    });
    expectValid(merged.document);

    const undone = undoOf(merged);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(chapterBlocks(undone.document, chapterId)).toEqual(
      chapterBlocks(before, chapterId),
    );
    expect(redoOf(undone).document.blocks[second.blockId]).toBeUndefined();
  });

  it('rejects cross-chapter, cross-anchor, and first-sibling merges without mutation', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    document = run(
      document,
      { type: 'chapter.create', chapterId: 'chapter-two', title: 'Two' },
      context,
    ).document;
    const chapterTwo = 'chapter-two';
    const one = addTopLevel(document, 'One', context);
    document = one.document;
    const two = addTopLevel(document, 'Two', context);
    document = two.document;
    // Move Two to chapter two so the merge is genuinely cross-chapter.
    document = run(
      document,
      {
        type: 'block.move',
        blockId: two.blockId,
        to: { kind: 'top-level', chapterId: chapterTwo, atIndex: 0 },
      },
      context,
    ).document;
    const crossChapterBefore = document;
    const crossChapter = tryRun(
      crossChapterBefore,
      { type: 'block.merge', blockId: two.blockId, intoBlockId: one.blockId },
      context,
    );
    expect(crossChapter.ok).toBe(false);
    if (!crossChapter.ok) {
      expect(crossChapter.code).toBe('invalid-placement');
      expect(crossChapter.message).toContain('cross-chapter');
    }
    expect(stable(crossChapterBefore)).toEqual(stable(document));

    // Two anchored children under different anchors cannot merge into each other.
    let anchoredDocument = newDocument(context);
    const parent = addTopLevel(anchoredDocument, 'Parent one two', context);
    anchoredDocument = parent.document;
    anchoredDocument = createTextAnchor(
      anchoredDocument,
      context,
      parent.blockId,
      'anchor-one',
      'one',
    ).document;
    anchoredDocument = createTextAnchor(
      anchoredDocument,
      context,
      parent.blockId,
      'anchor-two',
      'two',
    ).document;
    const childOne = addTopLevel(anchoredDocument, 'Child one', context);
    anchoredDocument = childOne.document;
    const childTwo = addTopLevel(anchoredDocument, 'Child two', context);
    anchoredDocument = childTwo.document;
    anchoredDocument = run(
      anchoredDocument,
      {
        type: 'branch.create',
        sourceBlockId: parent.blockId,
        sourceAnchorId: 'anchor-one',
        targetBlockId: childOne.blockId,
        role: 'primary',
      },
      context,
    ).document;
    anchoredDocument = run(
      anchoredDocument,
      {
        type: 'branch.create',
        sourceBlockId: parent.blockId,
        sourceAnchorId: 'anchor-two',
        targetBlockId: childTwo.blockId,
        role: 'primary',
      },
      context,
    ).document;
    const crossAnchorBefore = anchoredDocument;
    const crossAnchor = tryRun(
      crossAnchorBefore,
      { type: 'block.merge', blockId: childTwo.blockId, intoBlockId: childOne.blockId },
      context,
    );
    expect(crossAnchor.ok).toBe(false);
    if (!crossAnchor.ok) expect(crossAnchor.message).toContain('cross-anchor');
    expect(stable(crossAnchorBefore)).toEqual(stable(anchoredDocument));

    // The first sibling has no previous target and the menu plan says why.
    const firstSibling = tryRun(
      crossAnchorBefore,
      { type: 'block.merge', blockId: childOne.blockId },
      context,
    );
    expect(firstSibling.ok).toBe(false);
    expect(stable(crossAnchorBefore)).toEqual(stable(anchoredDocument));
  });
});
