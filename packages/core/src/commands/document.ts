/**
 * Document aggregate: create and rename.
 *
 * `document.create` runs before the clone/validate pipeline because it has no
 * input document; the registry keeps a no-op entry for the exhaustive union.
 */

import { createDocument } from '../document.js';
import type { CreateDocumentInput } from '../document.js';
import type { CoreContext } from '../ids.js';
import type { Document } from '../types.js';
import { validateDocument } from '../validation.js';
import { Rejection, assertId, reject, type ChangeSet } from './shared.js';
import type {
  CommandFailure,
  CommandResult,
  DocumentCommand,
  DocumentCreateCommand,
  DocumentRenameCommand,
} from './types.js';

/** Creation is handled by `executeCommand` before the working clone exists. */
export function applyDocumentCreate(
  _document: Document,
  _command: DocumentCreateCommand,
  _context: CoreContext,
  _changes: ChangeSet,
): DocumentCommand | null {
  return null;
}

export function applyDocumentRename(
  document: Document,
  command: DocumentRenameCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  if (typeof command.title !== 'string') reject('invalid-command', 'title must be a string');
  const previous = document.title;
  document.title = command.title;
  changes.document(document.id);
  return { type: 'document.rename', title: previous };
}

export function createDocumentCommand(
  command: DocumentCreateCommand,
  context: CoreContext,
  changes: ChangeSet,
): CommandResult {
  const input: CreateDocumentInput = {};
  if (command.title !== undefined) input.title = command.title;
  if (command.id !== undefined) input.id = command.id;
  if (command.chapterId !== undefined) input.chapterId = command.chapterId;
  if (command.chapterTitle !== undefined) input.chapterTitle = command.chapterTitle;
  if (command.annotations !== undefined) input.annotations = command.annotations;
  if (command.extensions !== undefined) input.extensions = command.extensions;
  if (command.id !== undefined) {
    try {
      assertId(command.id, 'document ID');
    } catch (error) {
      return rejectionToFailure(error);
    }
  }
  if (command.chapterId !== undefined) {
    try {
      assertId(command.chapterId, 'chapter ID');
    } catch (error) {
      return rejectionToFailure(error);
    }
  }
  let created: Document;
  try {
    created = createDocument(input, context);
  } catch (error) {
    return {
      ok: false,
      code: 'invalid-command',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const report = validateDocument(created);
  if (!report.ok) {
    return {
      ok: false,
      code: 'internal-invariant',
      message: 'document.create produced an invalid document',
      issues: report.errors,
    };
  }
  changes.document(created.id);
  changes.createdDocument(created.id);
  const chapter = created.chapters[0];
  if (chapter !== undefined) {
    changes.chapter(chapter.id);
    changes.createdChapter(chapter.id);
  }
  return {
    ok: true,
    document: created,
    revision: created.revision,
    affected: changes.toJSON(),
    created: changes.createdJSON(),
    inverse: null,
    warnings: report.warnings.map((issue) => issue.message),
  };
}

function rejectionToFailure(error: unknown): CommandFailure {
  if (error instanceof Rejection) {
    const failure: CommandFailure = { ok: false, code: error.code, message: error.message };
    if (error.issues !== undefined) failure.issues = error.issues;
    return failure;
  }
  return {
    ok: false,
    code: 'internal-invariant',
    message: error instanceof Error ? error.message : String(error),
  };
}
