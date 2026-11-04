/**
 * Session-only undo/redo over document snapshots.
 *
 * The spec requires one user-visible undo stack and exact restoration of
 * content, structure, chapters, and break hints. Snapshot undo is exact and
 * deliberately simple; it is not persisted across launches (spec §5.1).
 *
 * Undo/redo advance the document revision monotonically. They restore the
 * prior content/structure, not the old revision number, so a save after undo
 * can never move the persisted revision backwards.
 */

import type { CommandResult, DocumentCommand, ExecuteCommandOptions } from './commands.js';
import { executeCommand } from './commands.js';
import { createContext } from './ids.js';
import type { CoreContext } from './ids.js';
import type { Document } from './types.js';

interface SnapshotEntry {
  command: DocumentCommand | null;
  document: Document;
}

export class DocumentHistory {
  private current: Document;

  private readonly undoStack: SnapshotEntry[] = [];

  private readonly redoStack: SnapshotEntry[] = [];

  constructor(document: Document) {
    this.current = structuredClone(document);
  }

  get document(): Document {
    return this.current;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  execute(
    command: DocumentCommand,
    options: ExecuteCommandOptions = {},
  ): CommandResult {
    const result = executeCommand(this.current, command, options);
    if (!result.ok) return result;
    this.undoStack.push({ command, document: this.current });
    this.current = result.document;
    this.redoStack.length = 0;
    return result;
  }

  undo(options: ExecuteCommandOptions = {}): CommandResult {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      return { ok: false, code: 'invalid-command', message: 'nothing to undo' };
    }
    this.redoStack.push({ command: entry.command, document: this.current });
    this.current = this.restore(entry.document, options.context);
    return this.snapshotResult(this.current);
  }

  redo(options: ExecuteCommandOptions = {}): CommandResult {
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      return { ok: false, code: 'invalid-command', message: 'nothing to redo' };
    }
    this.undoStack.push({ command: entry.command, document: this.current });
    this.current = this.restore(entry.document, options.context);
    return this.snapshotResult(this.current);
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  replace(document: Document): void {
    this.current = structuredClone(document);
    this.clear();
  }

  private restore(snapshot: Document, contextOverride?: Partial<CoreContext>): Document {
    const context = createContext(contextOverride);
    const restored = structuredClone(snapshot);
    restored.revision = Math.max(this.current.revision, snapshot.revision) + 1;
    restored.updatedAt = context.now();
    return restored;
  }

  private snapshotResult(document: Document): CommandResult {
    return {
      ok: true,
      document,
      revision: document.revision,
      affected: {
        documentIds: [document.id],
        chapterIds: [],
        blockIds: [],
        branchIds: [],
        anchorIds: [],
        assetIds: [],
      },
      created: {
        documentIds: [],
        chapterIds: [],
        blockIds: [],
        branchIds: [],
      },
      inverse: null,
      warnings: [],
    };
  }
}
