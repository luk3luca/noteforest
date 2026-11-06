/**
 * Typed command registry and dispatcher.
 *
 * The registry object is exhaustively typed over `DocumentCommand['type']`, so
 * adding a command without a handler is a compile error. Dispatch is one
 * dynamic lookup; every handler receives the same `(document, command,
 * context, changes)` tuple as the former switch cases, preserving ordering,
 * validation, and inverse construction exactly.
 */

import type { CoreContext } from '../ids.js';
import { createContext } from '../ids.js';
import type { Document } from '../types.js';
import { validateDocument } from '../validation.js';
import {
  applyAnchorAttachToBlock,
  applyAnchorCreate,
  applyAnchorDelete,
  applyAnchorRepair,
} from './anchor.js';
import {
  applyBlockCreate,
  applyBlockDelete,
  applyBlockEditContent,
  applyBlockMerge,
  applyBlockMove,
  applyBlockRename,
  applyBlockSplit,
} from './block.js';
import {
  applyBranchCreate,
  applyBranchCreateFromSelection,
  applyBranchDelete,
  applyBranchDemote,
  applyBranchMakeHome,
  applyBranchMoveHere,
  applyBranchRelabel,
  applyBranchReorder,
} from './branch.js';
import {
  applyChapterCreate,
  applyChapterDelete,
  applyChapterRename,
  applyChapterReorder,
} from './chapter.js';
import { applyDocumentCreate, applyDocumentRename, createDocumentCommand } from './document.js';
import { applyStructureRestore, captureRestoreCommand } from './restore.js';
import { ChangeSet, Rejection, reject } from './shared.js';
import type {
  CommandFailure,
  CommandResult,
  CommandSuccess,
  DocumentCommand,
  ExecuteCommandOptions,
} from './types.js';

export type CommandHandler<T extends DocumentCommand['type']> = (
  document: Document,
  command: Extract<DocumentCommand, { type: T }>,
  context: CoreContext,
  changes: ChangeSet,
) => DocumentCommand | null;

type CommandHandlerRegistry = {
  [T in DocumentCommand['type']]: CommandHandler<T>;
};

/**
 * One handler per command type, in the same order as the original switch.
 * `document.create` is a no-op here: `executeCommand` handles creation before
 * the working clone exists.
 */
const COMMAND_HANDLERS: CommandHandlerRegistry = {
  'document.create': applyDocumentCreate,
  'document.rename': applyDocumentRename,
  'chapter.create': applyChapterCreate,
  'chapter.rename': applyChapterRename,
  'chapter.reorder': applyChapterReorder,
  'chapter.delete': applyChapterDelete,
  'anchor.create': applyAnchorCreate,
  'anchor.repair': applyAnchorRepair,
  'anchor.attachToBlock': applyAnchorAttachToBlock,
  'anchor.delete': applyAnchorDelete,
  'block.create': applyBlockCreate,
  'block.editContent': applyBlockEditContent,
  'block.rename': applyBlockRename,
  'block.delete': applyBlockDelete,
  'block.move': applyBlockMove,
  'block.split': applyBlockSplit,
  'block.merge': applyBlockMerge,
  'branch.create': applyBranchCreate,
  'branch.createFromSelection': applyBranchCreateFromSelection,
  'branch.delete': applyBranchDelete,
  'branch.reorder': applyBranchReorder,
  'branch.relabel': applyBranchRelabel,
  'branch.makeHome': applyBranchMakeHome,
  'branch.moveHere': applyBranchMoveHere,
  'branch.demote': applyBranchDemote,
  'structure.restore': applyStructureRestore,
};

type AnyCommandHandler = CommandHandler<DocumentCommand['type']>;

function applyToClone(
  document: Document,
  command: DocumentCommand,
  context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  // TypeScript cannot correlate a union discriminator with its mapped handler
  // signature. The registry above is exhaustive, so this single widening cast
  // at the dispatch boundary is safe.
  const handler = (
    COMMAND_HANDLERS as unknown as Record<string, AnyCommandHandler | undefined>
  )[command.type];
  if (handler === undefined) {
    const unreachable = command as { type?: unknown };
    return reject('invalid-command', `unknown command type: ${String(unreachable.type)}`);
  }
  return handler(document, command, context, changes);
}

export function executeCommand(
  document: Document | null,
  command: DocumentCommand,
  options: ExecuteCommandOptions = {},
): CommandResult {
  const context = createContext(options.context);
  const changes = new ChangeSet();

  if (command.type === 'document.create') {
    if (document !== null) {
      return {
        ok: false,
        code: 'invalid-command',
        message: 'document.create requires an empty target (pass null)',
      };
    }
    return createDocumentCommand(command, context, changes);
  }
  if (document === null) {
    return {
      ok: false,
      code: 'invalid-command',
      message: `${command.type} requires an existing document`,
    };
  }

  if (options.skipInputValidation !== true) {
    const report = validateDocument(document);
    if (!report.ok) {
      return {
        ok: false,
        code: 'invalid-document',
        message: `cannot apply ${command.type}: input document is invalid`,
        issues: report.errors,
      };
    }
  }

  const working = structuredClone(document);
  let inverse: DocumentCommand | null = null;
  try {
    inverse = applyToClone(working, command, context, changes);
    if (inverse === null) {
      // Destructive deletes cannot express their own inverse from the post-state:
      // capture the changed records before the revision bump so the same stack
      // can restore identity exactly.
      inverse = captureRestoreCommand(document, working, command);
    }
  } catch (error) {
    if (error instanceof Rejection) {
      const failure: CommandFailure = {
        ok: false,
        code: error.code,
        message: error.message,
      };
      if (error.issues !== undefined) failure.issues = error.issues;
      return failure;
    }
    return {
      ok: false,
      code: 'internal-invariant',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  working.revision = document.revision + 1;
  working.updatedAt = context.now();

  const report = validateDocument(working);
  if (!report.ok) {
    return {
      ok: false,
      code: 'internal-invariant',
      message: `${command.type} produced an invalid document`,
      issues: report.errors,
    };
  }

  return {
    ok: true,
    document: working,
    revision: working.revision,
    affected: changes.toJSON(),
    created: changes.createdJSON(),
    inverse,
    warnings: [...changes.warnings(), ...report.warnings.map((issue) => issue.message)],
  };
}

/** Apply a command's inverse (logical undo; history uses snapshots for exactness). */
export function applyInverse(
  result: CommandSuccess,
  options: ExecuteCommandOptions = {},
): CommandResult {
  if (result.inverse === null) {
    return { ok: false, code: 'invalid-command', message: 'command has no inverse' };
  }
  return executeCommand(result.document, result.inverse, options);
}
