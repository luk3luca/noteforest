import { describe, it } from 'vitest';
import type { CommandErrorCode, DocumentCommand } from '../src/commands.js';
import type { CoreContext } from '../src/ids.js';
import type { Document } from '../src/types.js';
import { expectRejectedWithoutMutation, expectUndoRedoIdentity } from './command-invariants.js';
import type { UndoRedoOptions } from './command-invariants.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  newDocument,
  run,
  textContent,
} from './helpers.js';

/**
 * Representative cross-aggregate command matrix for the shared invariants.
 * Per-command edge cases stay in their own suites; this proves each aggregate
 * returns a working inverse and preserves identity across repeated undo/redo.
 */

function addTopLevelInChapter(
  document: Document,
  chapterId: string,
  label: string,
  context: CoreContext,
): { document: Document; blockId: string } {
  const result = run(
    document,
    {
      type: 'block.create',
      label,
      content: textContent(label),
      placement: { kind: 'top-level', chapterId },
    },
    context,
  );
  const blockId = result.created.blockIds[0];
  if (blockId === undefined) throw new Error('block.create did not report its block ID');
  return { document: result.document, blockId };
}

function buildFixture() {
  const context = deterministicContext();
  let document = newDocument(context);
  const chapterOne = document.chapters[0]?.id ?? '';
  document = run(
    document,
    { type: 'chapter.create', chapterId: 'chapter-two', title: 'Chapter Two' },
    context,
  ).document;

  const a = addTopLevel(document, 'Alpha eigenvalue beta', context);
  document = a.document;
  const b = addTopLevel(document, 'B', context);
  document = b.document;
  const c = addTopLevel(document, 'C', context);
  document = c.document;
  const f = addTopLevel(document, 'Hello world', context);
  document = f.document;
  const d = addTopLevelInChapter(document, 'chapter-two', 'D', context);
  document = d.document;
  const e = addTopLevelInChapter(document, 'chapter-two', 'E', context);
  document = e.document;

  const a1 = addChild(document, a.blockId, 'A1', context);
  document = a1.document;
  const a2 = addChild(document, a.blockId, 'A2', context);
  document = a2.document;
  const a11 = addChild(document, a1.blockId, 'A1a', context);
  document = a11.document;

  document = run(
    document,
    {
      type: 'anchor.create',
      anchorId: 'anchor-a',
      blockId: a.blockId,
      kind: 'text',
      selector: {
        kind: 'text',
        quote: 'eigenvalue',
        prefix: 'Alpha ',
        suffix: ' beta',
        occurrenceHint: 1,
      },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 16 }] },
    },
    context,
  ).document;

  document = run(
    document,
    {
      type: 'branch.create',
      branchId: 'branch-ref',
      sourceBlockId: b.blockId,
      targetBlockId: a1.blockId,
      role: 'reference',
    },
    context,
  ).document;
  document = run(
    document,
    {
      type: 'branch.create',
      branchId: 'branch-anchor-ref',
      sourceBlockId: a.blockId,
      sourceAnchorId: 'anchor-a',
      targetBlockId: c.blockId,
      role: 'reference',
    },
    context,
  ).document;

  return {
    context,
    document,
    chapterOne,
    chapterTwo: 'chapter-two',
    a: a.blockId,
    b: b.blockId,
    c: c.blockId,
    d: d.blockId,
    e: e.blockId,
    f: f.blockId,
    a1: a1.blockId,
    a2: a2.blockId,
    a11: a11.blockId,
    branchA1: a1.branchId,
    branchA2: a2.branchId,
    branchA11: a11.branchId,
  };
}

type Fixture = ReturnType<typeof buildFixture>;

interface MatrixCase {
  name: string;
  prepare?: (fixture: Fixture, context: CoreContext) => Document;
  command: (fixture: Fixture) => DocumentCommand;
  options?: UndoRedoOptions;
}

const CASES: MatrixCase[] = [
  {
    name: 'document.rename',
    command: () => ({ type: 'document.rename', title: 'Renamed document' }),
  },
  {
    name: 'chapter.create',
    command: () => ({ type: 'chapter.create', title: 'Chapter Three' }),
  },
  {
    name: 'chapter.rename',
    command: (f) => ({ type: 'chapter.rename', chapterId: f.chapterTwo, title: 'Renamed' }),
  },
  {
    name: 'chapter.reorder',
    command: (f) => ({ type: 'chapter.reorder', chapterId: f.chapterTwo, toIndex: 0 }),
  },
  {
    name: 'chapter.delete',
    prepare: (fixture, context) =>
      run(fixture.document, { type: 'chapter.create', chapterId: 'chapter-empty' }, context)
        .document,
    command: () => ({
      type: 'chapter.delete',
      chapterId: 'chapter-empty',
      blockHandling: { kind: 'reject-if-not-empty' },
    }),
  },
  {
    name: 'block.create (top level)',
    command: (f) => ({
      type: 'block.create',
      label: 'New root',
      content: textContent('New root'),
      placement: { kind: 'top-level', chapterId: f.chapterOne },
    }),
  },
  {
    name: 'block.create (child)',
    command: (f) => ({
      type: 'block.create',
      label: 'New child',
      content: textContent('New child'),
      placement: { kind: 'child', parentBlockId: f.b },
    }),
  },
  {
    name: 'block.editContent',
    command: (f) => ({
      type: 'block.editContent',
      blockId: f.c,
      content: textContent('Edited C'),
    }),
    options: { ignoreRecordTimestamps: true },
  },
  {
    name: 'block.rename',
    command: (f) => ({ type: 'block.rename', blockId: f.c, label: 'Renamed C' }),
    options: { ignoreRecordTimestamps: true },
  },
  {
    name: 'block.delete (promote)',
    command: (f) => ({ type: 'block.delete', blockId: f.a1, children: 'promote' }),
  },
  {
    name: 'block.delete (delete-subtree)',
    command: (f) => ({ type: 'block.delete', blockId: f.a1, children: 'delete-subtree' }),
  },
  {
    name: 'block.move',
    command: (f) => ({
      type: 'block.move',
      blockId: f.a2,
      to: { kind: 'top-level', chapterId: f.chapterTwo, atIndex: 0 },
    }),
  },
  {
    name: 'block.split',
    command: (f) => ({
      type: 'block.split',
      blockId: f.f,
      at: { nodePath: [0, 0], offset: 5 },
    }),
  },
  {
    name: 'block.merge',
    command: (f) => ({ type: 'block.merge', blockId: f.a2, intoBlockId: f.a1 }),
  },
  {
    name: 'branch.create (primary)',
    command: (f) => ({
      type: 'branch.create',
      sourceBlockId: f.b,
      targetBlockId: f.d,
    }),
  },
  {
    name: 'branch.create (reference)',
    command: (f) => ({
      type: 'branch.create',
      sourceBlockId: f.b,
      targetBlockId: f.e,
      role: 'reference',
    }),
  },
  {
    name: 'branch.delete (reference)',
    command: () => ({ type: 'branch.delete', branchId: 'branch-ref' }),
  },
  {
    name: 'branch.delete (primary, promote)',
    command: (f) => ({
      type: 'branch.delete',
      branchId: f.branchA1,
      targetHandling: { kind: 'promote' },
    }),
  },
  {
    name: 'branch.reorder',
    command: (f) => ({ type: 'branch.reorder', branchId: f.branchA2, toIndex: 0 }),
  },
  {
    name: 'branch.relabel',
    command: (f) => ({ type: 'branch.relabel', branchId: f.branchA1, label: 'depends on' }),
  },
  {
    name: 'branch.makeHome',
    command: () => ({ type: 'branch.makeHome', branchId: 'branch-ref' }),
  },
  {
    name: 'branch.moveHere',
    command: () => ({ type: 'branch.moveHere', branchId: 'branch-ref' }),
  },
  {
    name: 'branch.demote',
    command: (f) => ({ type: 'branch.demote', branchId: f.branchA1 }),
  },
  {
    name: 'anchor.create',
    command: (f) => ({
      type: 'anchor.create',
      anchorId: 'anchor-e',
      blockId: f.e,
      kind: 'text',
      selector: { kind: 'text', quote: 'E', occurrenceHint: 1 },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 1 }] },
    }),
  },
  {
    name: 'anchor.repair',
    command: () => ({
      type: 'anchor.repair',
      anchorId: 'anchor-a',
      selector: {
        kind: 'text',
        quote: 'eigenvalue',
        prefix: 'Alpha ',
        suffix: ' beta',
        occurrenceHint: 1,
      },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 1], start: 0, end: 10 }] },
    }),
  },
  {
    name: 'anchor.attachToBlock',
    command: () => ({ type: 'anchor.attachToBlock', anchorId: 'anchor-a' }),
  },
  {
    name: 'anchor.delete (attach branches)',
    command: () => ({ type: 'anchor.delete', anchorId: 'anchor-a', branches: 'attach' }),
  },
  {
    name: 'anchor.delete (delete branches)',
    command: () => ({ type: 'anchor.delete', anchorId: 'anchor-a', branches: 'delete' }),
  },
];

describe('command invariants — representative matrix', () => {
  it.each(CASES)('$name round-trips identity', (entry) => {
    const fixture = buildFixture();
    const document =
      entry.prepare === undefined ? fixture.document : entry.prepare(fixture, fixture.context);
    expectUndoRedoIdentity(document, entry.command(fixture), fixture.context, entry.options ?? {});
  });
});

interface RejectionCase {
  name: string;
  code: CommandErrorCode;
  messagePart?: string;
  prepare?: (fixture: Fixture, context: CoreContext) => Document;
  command: (fixture: Fixture) => DocumentCommand;
}

const REJECTIONS: RejectionCase[] = [
  {
    name: 'block.create duplicate ID',
    code: 'duplicate-id',
    command: (f) => ({
      type: 'block.create',
      blockId: f.a,
      placement: { kind: 'top-level', chapterId: f.chapterOne },
    }),
  },
  {
    name: 'block.move under a descendant',
    code: 'cycle',
    command: (f) => ({
      type: 'block.move',
      blockId: f.a,
      to: { kind: 'child', parentBlockId: f.a1 },
    }),
  },
  {
    name: 'chapter.delete while non-empty',
    code: 'chapter-in-use',
    command: (f) => ({
      type: 'chapter.delete',
      chapterId: f.chapterOne,
      blockHandling: { kind: 'reject-if-not-empty' },
    }),
  },
  {
    name: 'block.delete the last top-level block of a chapter',
    code: 'chapter-would-be-empty',
    prepare: (fixture, context) =>
      run(
        fixture.document,
        { type: 'block.delete', blockId: fixture.d, children: 'delete-subtree' },
        context,
      ).document,
    command: (f) => ({ type: 'block.delete', blockId: f.e, children: 'delete-subtree' }),
  },
  {
    name: 'branch.delete a primary edge without target handling',
    code: 'invalid-command',
    command: (f) => ({ type: 'branch.delete', branchId: f.branchA1 }),
  },
  {
    name: 'anchor.delete with outgoing branches and no handling',
    code: 'invalid-command',
    command: () => ({ type: 'anchor.delete', anchorId: 'anchor-a' }),
  },
  {
    name: 'anchor.create an already-bound selection',
    code: 'anchor-exists',
    command: (f) => ({
      type: 'anchor.create',
      anchorId: 'anchor-a-copy',
      blockId: f.a,
      kind: 'text',
      selector: {
        kind: 'text',
        quote: 'eigenvalue',
        prefix: 'Alpha ',
        suffix: ' beta',
        occurrenceHint: 1,
      },
      binding: { kind: 'text', ranges: [{ nodePath: [0, 1], start: 0, end: 10 }] },
    }),
  },
];

describe('command invariants — rejected commands', () => {
  it.each(REJECTIONS)('$name leaves the document untouched', (entry) => {
    const fixture = buildFixture();
    const document =
      entry.prepare === undefined ? fixture.document : entry.prepare(fixture, fixture.context);
    expectRejectedWithoutMutation(
      document,
      entry.command(fixture),
      fixture.context,
      entry.code,
      entry.messagePart,
    );
  });
});
