import { describe, expect, it } from 'vitest';
import { resolveAnchor } from '../src/anchors.js';
import { applyInverse, executeCommand, type CommandSuccess } from '../src/commands.js';
import type { AnchorBinding } from '../src/anchors.js';
import type { Document, JsonObject } from '../src/types.js';
import { validateDocument } from '../src/validation.js';
import {
  addTopLevel,
  deterministicContext,
  newDocument,
  run,
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

function undoOf(result: CommandSuccess): CommandSuccess {
  expect(result.inverse).not.toBeNull();
  return success(applyInverse(result));
}

function redoOf(undone: CommandSuccess): CommandSuccess {
  expect(undone.inverse).not.toBeNull();
  return success(applyInverse(undone));
}

function expectValid(document: Document): void {
  const report = validateDocument(document);
  if (!report.ok) throw new Error(report.errors.map((issue) => issue.message).join('; '));
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

function branchIdOf(document: Document, anchorId: string): string {
  const branch = Object.values(document.branches).find(
    (candidate) => candidate.source.anchorId === anchorId,
  );
  if (branch === undefined) throw new Error(`anchor "${anchorId}" has no branch`);
  return branch.id;
}

function buildTextFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const source = addTopLevel(document, 'Alpha eigenvalue beta', context);
  document = source.document;
  const target = addTopLevel(document, 'Target block', context);
  document = target.document;
  const created = run(
    document,
    {
      type: 'anchor.create',
      anchorId: 'anchor-1',
      blockId: source.blockId,
      kind: 'text',
      selector: textSelector('eigenvalue'),
      binding: textBinding(6, 16),
    },
    context,
  );
  const branched = run(
    created.document,
    {
      type: 'branch.create',
      sourceBlockId: source.blockId,
      sourceAnchorId: 'anchor-1',
      targetBlockId: target.blockId,
      role: 'primary',
      label: 'derived',
    },
    context,
  );
  return {
    context,
    document: branched.document,
    sourceBlockId: source.blockId,
    targetBlockId: target.blockId,
    branchId: branchIdOf(branched.document, 'anchor-1'),
  };
}

describe('M3e anchor repair identity', () => {
  it('repairs a text anchor without changing anchor, branch, or target identity', () => {
    const fixture = buildTextFixture();
    const before = fixture.document;
    const branchBefore = before.branches[fixture.branchId];
    const targetBefore = before.blocks[fixture.targetBlockId];

    const repaired = run(
      before,
      {
        type: 'anchor.repair',
        anchorId: 'anchor-1',
        selector: textSelector('Alpha'),
        binding: textBinding(0, 5),
      },
      fixture.context,
    );

    expect(repaired.document.anchors['anchor-1']).toMatchObject({
      id: 'anchor-1',
      blockId: fixture.sourceBlockId,
      kind: 'text',
      quote: 'Alpha',
    });
    expect(repaired.document.branches[fixture.branchId]).toEqual(branchBefore);
    expect(repaired.document.blocks[fixture.targetBlockId]).toEqual(targetBefore);
    expect(resolveAnchor(repaired.document, 'anchor-1').state).toBe('resolved');
    expectValid(repaired.document);

    const undone = undoOf(repaired);
    expect(stable(undone.document)).toEqual(stable(before));
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(repaired.document));
  });

  it('repairs a formula-term occurrence without changing anchor, branch, or target identity', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    const source = run(
      document,
      {
        type: 'block.create',
        blockId: 'formula-source',
        content: {
          type: 'doc',
          children: [
            {
              type: 'paragraph',
              children: [
                { type: 'inlineMath', attrs: { latex: '\\lambda + \\lambda' } },
              ],
            },
          ],
        },
        placement: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' },
      },
      context,
    );
    document = source.document;
    const target = addTopLevel(document, 'Formula target', context);
    document = target.document;
    const created = run(
      document,
      {
        type: 'anchor.create',
        anchorId: 'formula-anchor',
        blockId: 'formula-source',
        kind: 'formula',
        selector: {
          kind: 'formula',
          form: 'term',
          latex: '\\lambda',
          latexStart: 0,
          occurrenceHint: 1,
        },
        binding: {
          kind: 'formula',
          form: 'term',
          nodePath: [0, 0],
          latex: '\\lambda',
          occurrence: 1,
        },
      },
      context,
    );
    const branched = run(
      created.document,
      {
        type: 'branch.create',
        sourceBlockId: 'formula-source',
        sourceAnchorId: 'formula-anchor',
        targetBlockId: target.blockId,
        role: 'primary',
      },
      context,
    );
    const before = branched.document;
    const branchId = branchIdOf(before, 'formula-anchor');
    const branchBefore = before.branches[branchId];
    const targetBefore = before.blocks[target.blockId];

    const repaired = run(
      before,
      {
        type: 'anchor.repair',
        anchorId: 'formula-anchor',
        selector: {
          kind: 'formula',
          form: 'term',
          latex: '\\lambda',
          latexStart: 10,
          occurrenceHint: 2,
        },
        binding: {
          kind: 'formula',
          form: 'term',
          nodePath: [0, 0],
          latex: '\\lambda',
          occurrence: 2,
        },
      },
      context,
    );

    const anchor = repaired.document.anchors['formula-anchor'];
    expect(anchor).toMatchObject({
      id: 'formula-anchor',
      blockId: 'formula-source',
      kind: 'formula',
    });
    const selector = anchor?.selector as JsonObject;
    expect(selector['latexStart']).toBe(10);
    expect(selector['occurrenceHint']).toBe(2);
    expect(repaired.document.branches[branchId]).toEqual(branchBefore);
    expect(repaired.document.blocks[target.blockId]).toEqual(targetBefore);
    expectValid(repaired.document);

    const undone = undoOf(repaired);
    expect(stable(undone.document)).toEqual(stable(before));
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(repaired.document));
  });

  it('repairs a code range without changing anchor, branch, or target identity', () => {
    const context = deterministicContext();
    let document = newDocument(context);
    const source = run(
      document,
      {
        type: 'block.create',
        blockId: 'code-source',
        content: {
          type: 'doc',
          children: [
            {
              type: 'codeBlock',
              attrs: { language: 'ts' },
              children: [{ type: 'text', text: 'const x = 1;' }],
            },
          ],
        },
        placement: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' },
      },
      context,
    );
    document = source.document;
    const target = addTopLevel(document, 'Code target', context);
    document = target.document;
    const created = run(
      document,
      {
        type: 'anchor.create',
        anchorId: 'code-anchor',
        blockId: 'code-source',
        kind: 'code',
        selector: {
          kind: 'code',
          quote: 'x = 1',
          form: 'range',
          startOffset: 6,
          endOffset: 11,
          lineStart: 1,
          lineEnd: 1,
          occurrenceHint: 1,
        },
        binding: { kind: 'code', nodePath: [0], startOffset: 6, endOffset: 11 },
      },
      context,
    );
    const branched = run(
      created.document,
      {
        type: 'branch.create',
        sourceBlockId: 'code-source',
        sourceAnchorId: 'code-anchor',
        targetBlockId: target.blockId,
        role: 'primary',
      },
      context,
    );
    const before = branched.document;
    const branchId = branchIdOf(before, 'code-anchor');
    const branchBefore = before.branches[branchId];
    const targetBefore = before.blocks[target.blockId];

    const repaired = run(
      before,
      {
        type: 'anchor.repair',
        anchorId: 'code-anchor',
        selector: {
          kind: 'code',
          quote: 'x',
          form: 'range',
          startOffset: 6,
          endOffset: 7,
          lineStart: 1,
          lineEnd: 1,
          occurrenceHint: 1,
        },
        binding: { kind: 'code', nodePath: [0], startOffset: 6, endOffset: 7 },
      },
      context,
    );

    const anchor = repaired.document.anchors['code-anchor'];
    expect(anchor).toMatchObject({
      id: 'code-anchor',
      blockId: 'code-source',
      kind: 'code',
      quote: 'x',
    });
    expect(repaired.document.branches[branchId]).toEqual(branchBefore);
    expect(repaired.document.blocks[target.blockId]).toEqual(targetBefore);
    expect(resolveAnchor(repaired.document, 'code-anchor').state).toBe('resolved');
    expectValid(repaired.document);

    const undone = undoOf(repaired);
    expect(stable(undone.document)).toEqual(stable(before));
    const redone = redoOf(undone);
    expect(stable(redone.document)).toEqual(stable(repaired.document));
  });
});

describe('M3e attach, delete branch, and keep broken', () => {
  it('attaches a broken anchor’s branches to the block and undoes exactly', () => {
    const fixture = buildTextFixture();
    const broken = run(
      fixture.document,
      {
        type: 'block.editContent',
        blockId: fixture.sourceBlockId,
        content: {
          type: 'doc',
          children: [
            { type: 'paragraph', children: [{ type: 'text', text: 'Alpha beta' }] },
          ],
        },
      },
      fixture.context,
    );
    expect(resolveAnchor(broken.document, 'anchor-1').state).toBe('broken');
    const beforeAttach = broken.document;
    expect(beforeAttach.blocks[fixture.targetBlockId]).toBeDefined();

    const attached = run(
      beforeAttach,
      { type: 'anchor.attachToBlock', anchorId: 'anchor-1' },
      fixture.context,
    );

    expect(attached.document.anchors['anchor-1']).toBeUndefined();
    expect(attached.document.branches[fixture.branchId]?.source).toEqual({
      blockId: fixture.sourceBlockId,
    });
    expect(attached.document.blocks[fixture.targetBlockId]).toEqual(
      beforeAttach.blocks[fixture.targetBlockId],
    );
    expectValid(attached.document);

    const undone = undoOf(attached);
    expect(stable(undone.document)).toEqual(stable(beforeAttach));
    expect(undone.document.anchors['anchor-1']).toEqual(beforeAttach.anchors['anchor-1']);
    expect(undone.document.branches[fixture.branchId]).toEqual(
      beforeAttach.branches[fixture.branchId],
    );
  });

  it('deletes one anchored branch, keeps the target, and undoes exactly', () => {
    const fixture = buildTextFixture();
    const before = fixture.document;
    const targetBefore = before.blocks[fixture.targetBlockId];

    const deleted = run(
      before,
      {
        type: 'branch.delete',
        branchId: fixture.branchId,
        targetHandling: { kind: 'promote' },
      },
      fixture.context,
    );

    expect(deleted.document.branches[fixture.branchId]).toBeUndefined();
    expect(deleted.document.anchors['anchor-1']).toBeDefined();
    expect(deleted.document.blocks[fixture.targetBlockId]).toEqual(targetBefore);
    expect(resolveAnchor(deleted.document, 'anchor-1').state).toBe('idle');
    expectValid(deleted.document);

    const undone = undoOf(deleted);
    expect(stable(undone.document)).toEqual(stable(before));
    expect(resolveAnchor(undone.document, 'anchor-1').state).toBe('resolved');
  });

  it('keeps a broken anchor with no command, and undoing the edit resolves it again', () => {
    const fixture = buildTextFixture();
    const snapshot = structuredClone(fixture.document);
    const broken = run(
      fixture.document,
      {
        type: 'block.editContent',
        blockId: fixture.sourceBlockId,
        content: {
          type: 'doc',
          children: [
            { type: 'paragraph', children: [{ type: 'text', text: 'Alpha beta' }] },
          ],
        },
      },
      fixture.context,
    );
    const brokenSnapshot = structuredClone(broken.document);
    const resolution = resolveAnchor(broken.document, 'anchor-1');
    expect(resolution.state).toBe('broken');
    expect(resolution.reason).toBe('quote-missing');

    // "Keep broken" is a session dismissal: resolution and the document are
    // untouched, and the branch/target remain visible.
    expect(broken.document).toEqual(brokenSnapshot);
    expect(broken.document.branches[fixture.branchId]).toBeDefined();
    expect(broken.document.blocks[fixture.targetBlockId]).toBeDefined();

    const restored = undoOf(broken);
    expect(restored.document.blocks[fixture.sourceBlockId]?.content).toEqual(
      snapshot.blocks[fixture.sourceBlockId]?.content,
    );
    expect(restored.document.branches[fixture.branchId]).toEqual(
      snapshot.branches[fixture.branchId],
    );
    expect(resolveAnchor(restored.document, 'anchor-1').state).toBe('resolved');
  });
});
