/**
 * Typed document commands: the only mutation path.
 *
 * The implementation is split by aggregate under `./commands/`: block, branch,
 * anchor, chapter, document, shared infrastructure, structural restore, and a
 * typed registry/dispatcher. `executeCommand` and `applyInverse` remain the
 * public entry points and every command shape is re-exported here unchanged.
 *
 * Every command is pure (the input document is not mutated), validates its
 * preconditions, applies to a deep clone, re-validates the resulting document,
 * and returns a typed success or failure. A success carries the new document,
 * the new revision, affected IDs, and (where practical) an inverse command.
 *
 * Structural edits use canonical primary branches (role "primary"), not a
 * second parent pointer. A primary branch may start at a block or at an anchor
 * inside it. Reference and anchored branches have typed commands in M3.
 */

export * from './commands/types.js';
export { applyInverse, executeCommand } from './commands/registry.js';
export { chapterForBlock } from './commands/chapter.js';
export { isLegalMove } from './commands/block.js';
