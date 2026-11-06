/**
 * Reusable command invariants.
 *
 * Commands are pure and every success carries an inverse. These helpers keep
 * the three guarantees in one place so each command suite does not restate
 * them: apply → inverse → deep equal, undo/redo identity (including generated
 * records), and a rejected command leaves the caller's document untouched.
 *
 * `document.revision` and `document.updatedAt` move forward on every command by
 * design; every other field is compared exactly.
 */

import { expect } from 'vitest';
import type { CommandFailure, CommandSuccess, CreatedIds, DocumentCommand } from '../src/commands.js';
import { applyInverse, executeCommand } from '../src/commands.js';
import type { CoreContext } from '../src/ids.js';
import type { Document } from '../src/types.js';
import { validateDocument } from '../src/validation.js';

export interface UndoRedoIdentity {
  applied: CommandSuccess;
  undone: CommandSuccess;
  redone: CommandSuccess;
}

export interface UndoRedoOptions {
  /** Extra undo/redo pairs after the first round trip. Default 3. */
  cycles?: number;
  /**
   * Forward-edit inverses (`block.editContent`, `block.rename`) restore the
   * content/label but stamp a fresh `block.updatedAt`, because undo is itself
   * an edit. Set this only for those commands: everything else, including
   * snapshot restores, must keep record timestamps exact.
   */
  ignoreRecordTimestamps?: boolean;
}

/** Revision and document timestamp are expected to move on every command. */
export function normalizedDocument(document: Document): Document {
  const clone = structuredClone(document);
  clone.revision = 0;
  clone.updatedAt = '1970-01-01T00:00:00.000Z';
  return clone;
}

/**
 * Comparison form for undo/redo. Forward-edit inverses may stamp a new block
 * `updatedAt`; with `ignoreRecordTimestamps` that field is normalized too.
 */
function comparisonDocument(document: Document, options: UndoRedoOptions): Document {
  const clone = normalizedDocument(document);
  if (options.ignoreRecordTimestamps === true) {
    for (const block of Object.values(clone.blocks)) {
      block.updatedAt = '1970-01-01T00:00:00.000Z';
    }
  }
  return clone;
}

export function expectDocumentValid(document: Document): void {
  const report = validateDocument(document);
  if (!report.ok) {
    throw new Error(report.errors.map((issue) => issue.message).join('; '));
  }
}

export function expectCommandSuccess(
  result: ReturnType<typeof executeCommand>,
): CommandSuccess {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

export function undoOf(result: CommandSuccess, context?: CoreContext): CommandSuccess {
  expect(result.inverse).not.toBeNull();
  return expectCommandSuccess(
    applyInverse(result, context === undefined ? {} : { context }),
  );
}

export function redoOf(undone: CommandSuccess, context?: CoreContext): CommandSuccess {
  expect(undone.inverse).not.toBeNull();
  return expectCommandSuccess(
    applyInverse(undone, context === undefined ? {} : { context }),
  );
}

export function expectRecordCounts(document: Document, reference: Document): void {
  expect(Object.keys(document.blocks)).toHaveLength(Object.keys(reference.blocks).length);
  expect(Object.keys(document.branches)).toHaveLength(
    Object.keys(reference.branches).length,
  );
  expect(Object.keys(document.anchors)).toHaveLength(Object.keys(reference.anchors).length);
}

function expectCreatedRecordsAbsent(document: Document, created: CreatedIds): void {
  for (const blockId of created.blockIds) {
    expect(document.blocks[blockId], `created block "${blockId}" survived undo`).toBeUndefined();
  }
  for (const branchId of created.branchIds) {
    expect(document.branches[branchId], `created branch "${branchId}" survived undo`).toBeUndefined();
  }
  for (const anchorId of created.anchorIds) {
    expect(document.anchors[anchorId], `created anchor "${anchorId}" survived undo`).toBeUndefined();
  }
  for (const chapterId of created.chapterIds) {
    expect(
      document.chapters.some((chapter) => chapter.id === chapterId),
      `created chapter "${chapterId}" survived undo`,
    ).toBe(false);
  }
}

function expectCreatedRecordsRestored(
  applied: CommandSuccess,
  redone: Document,
  created: CreatedIds,
): void {
  for (const blockId of created.blockIds) {
    expect(redone.blocks[blockId], `created block "${blockId}" was not restored by redo`).toEqual(
      applied.document.blocks[blockId],
    );
  }
  for (const branchId of created.branchIds) {
    expect(
      redone.branches[branchId],
      `created branch "${branchId}" was not restored by redo`,
    ).toEqual(applied.document.branches[branchId]);
  }
  for (const anchorId of created.anchorIds) {
    expect(
      redone.anchors[anchorId],
      `created anchor "${anchorId}" was not restored by redo`,
    ).toEqual(applied.document.anchors[anchorId]);
  }
  for (const chapterId of created.chapterIds) {
    expect(
      redone.chapters.find((chapter) => chapter.id === chapterId),
      `created chapter "${chapterId}" was not restored by redo`,
    ).toEqual(applied.document.chapters.find((chapter) => chapter.id === chapterId));
  }
}

/**
 * Apply a command, undo it, and redo it, asserting at every step that the
 * canonical document is valid and deep-equal to the expected state.
 *
 * Returns the three states for command-specific assertions. Repeated cycles
 * prove undo/redo neither duplicates nor loses records.
 */
export function expectUndoRedoIdentity(
  document: Document,
  command: DocumentCommand,
  context: CoreContext,
  options: UndoRedoOptions = {},
): UndoRedoIdentity {
  const before = comparisonDocument(document, options);
  const applied = expectCommandSuccess(executeCommand(document, command, { context }));
  expectDocumentValid(applied.document);
  expect(applied.inverse, `${command.type} returned no inverse`).not.toBeNull();

  const undone = undoOf(applied, context);
  expectDocumentValid(undone.document);
  expect(comparisonDocument(undone.document, options)).toEqual(before);
  expectCreatedRecordsAbsent(undone.document, applied.created);

  const redone = redoOf(undone, context);
  expectDocumentValid(redone.document);
  expect(comparisonDocument(redone.document, options)).toEqual(
    comparisonDocument(applied.document, options),
  );
  expectCreatedRecordsRestored(applied, redone.document, applied.created);
  expectRecordCounts(redone.document, applied.document);

  let current = redone;
  const cycles = options.cycles ?? 3;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const undoneAgain = undoOf(current, context);
    expectDocumentValid(undoneAgain.document);
    expect(comparisonDocument(undoneAgain.document, options)).toEqual(before);
    expectRecordCounts(undoneAgain.document, document);
    expectCreatedRecordsAbsent(undoneAgain.document, applied.created);

    current = redoOf(undoneAgain, context);
    expectDocumentValid(current.document);
    expect(comparisonDocument(current.document, options)).toEqual(
      comparisonDocument(applied.document, options),
    );
    expectRecordCounts(current.document, applied.document);
    expectCreatedRecordsRestored(applied, current.document, applied.created);
  }

  return { applied, undone, redone };
}

/**
 * A rejected command must not mutate the caller's document. Returns the typed
 * failure so the caller can assert additional detail.
 */
export function expectRejectedWithoutMutation(
  document: Document,
  command: DocumentCommand,
  context: CoreContext,
  expectedCode?: CommandFailure['code'],
  messagePart?: string,
): CommandFailure {
  const before = structuredClone(document);
  const result = executeCommand(document, command, { context });
  if (result.ok) {
    throw new Error(`expected ${command.type} to be rejected, but it succeeded`);
  }
  if (expectedCode !== undefined) expect(result.code).toBe(expectedCode);
  if (messagePart !== undefined) expect(result.message).toContain(messagePart);
  expect(document).toEqual(before);
  return result;
}
