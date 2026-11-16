import { describe, expect, it } from 'vitest';
import {
  createDocument,
  executeCommand,
  type ContentNode,
  type Document,
  type DocumentCommand,
} from '@noteforest/core';
import type { ApplyResult, SaveFailureCode } from '../src/shared/api';
import type { DocumentGateway } from '../src/renderer/src/state/document-gateway';
import {
  DocumentSession,
  type ContentChange,
} from '../src/renderer/src/state/document-session';
import { createInMemoryDocumentGateway } from '../src/renderer/src/state/memory-document-gateway';

const packagePath = '/tmp/noteforest-test/library/session';

interface SessionHarness {
  session: DocumentSession;
  memory: ReturnType<typeof createInMemoryDocumentGateway>;
  state: {
    editable: boolean;
    commit: () => Promise<boolean>;
    saveError: string | null;
    versions: number;
    notifications: number;
    committed: number;
    structural: number;
    failures: Array<{ code: SaveFailureCode; message: string }>;
    order: string[];
    /** Gateway apply calls already recorded when `commitEditor` ran. */
    callsAtCommit: number;
  };
}

function harness(document: Document): SessionHarness {
  const memory = createInMemoryDocumentGateway({ packagePath, document });
  const state: SessionHarness['state'] = {
    editable: true,
    commit: async () => true,
    saveError: null,
    versions: 0,
    notifications: 0,
    committed: 0,
    structural: 0,
    failures: [],
    order: [],
    callsAtCommit: -1,
  };
  const session = new DocumentSession(document, {
    packagePath: () => packagePath,
    adoptPackagePath: () => undefined,
    gateway: memory.gateway,
    isEditable: () => state.editable,
    commitEditor: () => {
      state.callsAtCommit = memory.calls.length;
      state.order.push('commit');
      return state.commit();
    },
    bumpVersion: () => {
      state.versions += 1;
      state.order.push('version');
    },
    notify: () => {
      state.notifications += 1;
      state.order.push('notify');
    },
    markContentCommitted: () => {
      state.committed += 1;
    },
    noteStructuralChange: () => {
      state.structural += 1;
    },
    recordFailure: (code, message) => {
      state.failures.push({ code, message });
    },
    saveError: () => state.saveError,
  });
  return { session, memory, state };
}

function baseDocument(): Document {
  const created = createDocument({
    title: 'Session test',
    chapterId: 'chapter-one',
    chapterTitle: 'One',
  });
  const first = executeCommand(created, {
    type: 'block.create',
    blockId: 'a',
    placement: { kind: 'top-level', chapterId: 'chapter-one' },
  });
  if (!first.ok) throw new Error(first.message);
  const second = executeCommand(first.document, {
    type: 'block.create',
    blockId: 'b',
    placement: { kind: 'top-level', chapterId: 'chapter-one' },
  });
  if (!second.ok) throw new Error(second.message);
  return second.document;
}

function createCommand(blockId: string): DocumentCommand {
  return {
    type: 'block.create',
    blockId,
    placement: { kind: 'top-level', chapterId: 'chapter-one' },
  };
}

function renameCommand(title: string): DocumentCommand {
  return { type: 'document.rename', title };
}

function paragraph(text: string): ContentNode {
  return {
    type: 'doc',
    children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
  };
}

/** Apply one real command to a document and return the accepted result. */
function applied(document: Document, command: DocumentCommand): ApplyResult {
  const result = executeCommand(document, command);
  if (!result.ok) throw new Error(result.message);
  return {
    ok: true,
    document: result.document,
    revision: result.document.revision,
    created: result.created,
    inverse: result.inverse,
  };
}

function scriptedGateway(results: ApplyResult[]): DocumentGateway {
  const queue = [...results];
  return {
    takeOverLock: async () => {
      throw new Error('not used');
    },
    apply: async () => {
      const next = queue.shift();
      if (next === undefined) throw new Error('scripted gateway exhausted');
      return next;
    },
    save: async () => {
      throw new Error('not used');
    },
    saveCopy: async () => {
      throw new Error('not used');
    },
    restoreBackup: async () => {
      throw new Error('not used');
    },
    reloadDocument: async () => {
      throw new Error('not used');
    },
  };
}

function scriptedSession(
  document: Document,
  gateway: DocumentGateway,
): { session: DocumentSession; versions: () => number; notifications: () => number } {
  let versions = 0;
  let notifications = 0;
  const session = new DocumentSession(document, {
    packagePath: () => packagePath,
    adoptPackagePath: () => undefined,
    gateway,
    isEditable: () => true,
    commitEditor: async () => true,
    bumpVersion: () => {
      versions += 1;
    },
    notify: () => {
      notifications += 1;
    },
    markContentCommitted: () => undefined,
    noteStructuralChange: () => undefined,
    recordFailure: () => undefined,
    saveError: () => null,
  });
  return { session, versions: () => versions, notifications: () => notifications };
}

describe('DocumentSession command application', () => {
  it('applies a typed command through the gateway and accepts only its result', async () => {
    const document = baseDocument();
    const { session, memory } = harness(document);

    const result = await session.execute(createCommand('c'));

    expect(result.ok).toBe(true);
    expect(result.created?.blockIds).toEqual(['c']);
    expect(result.inverse).toMatchObject({ type: 'block.delete', blockId: 'c' });
    expect(memory.currentDocument().blocks['c']).toBeDefined();
    // The session has not accepted the result yet: canonical state advances
    // only through the explicit acceptance the runtime performs after its view
    // work, so a rejected/rebuilt command can never half-apply.
    expect(session.canonical).toBe(document);
    expect(session.revision).toBe(document.revision);
    expect(session.canUndoStructural).toBe(false);

    session.acceptStructural(result.document, result.inverse);

    expect(session.canonical.blocks['c']).toBeDefined();
    expect(session.revision).toBe(document.revision + 1);
    expect(session.canUndoStructural).toBe(true);
    expect(session.canRedoStructural).toBe(false);
    expect(session.lastHistoryOperation).toBe('structural');
  });

  it('commits the editor buffer before the command reaches the gateway', async () => {
    const document = baseDocument();
    const { session, memory, state } = harness(document);

    await session.execute(renameCommand('Renamed'));

    expect(state.order).toEqual(['commit']);
    expect(state.callsAtCommit).toBe(0);
    expect(memory.calls.map((call) => call.method)).toEqual(['apply']);
    expect(memory.currentDocument().title).toBe('Renamed');
  });

  it('rejects a read-only document without committing or applying', async () => {
    const document = baseDocument();
    const { session, memory, state } = harness(document);
    state.editable = false;

    const result = await session.execute(renameCommand('Renamed'));

    expect(result).toEqual({
      ok: false,
      message: 'This note is open read-only.',
      code: 'read-only',
    });
    expect(state.order).toEqual([]);
    expect(memory.calls).toEqual([]);
  });

  it('reports the save error when the editor buffer cannot be committed', async () => {
    const document = baseDocument();
    const { session, memory, state } = harness(document);
    state.commit = async () => false;
    state.saveError = 'Could not save the edit.';

    const result = await session.execute(renameCommand('Renamed'));

    expect(result).toEqual({
      ok: false,
      message: 'Could not save the edit.',
      code: 'unknown',
    });
    expect(memory.calls).toEqual([]);
  });

  it('falls back to the generic message when a failed commit has no save error', async () => {
    const document = baseDocument();
    const { session, state } = harness(document);
    state.commit = async () => false;

    const result = await session.execute(renameCommand('Renamed'));

    expect(result).toEqual({
      ok: false,
      message: 'Could not commit the pending edit.',
      code: 'unknown',
    });
  });
});

describe('DocumentSession structural history', () => {
  it('stores one inverse per user action, including a composite chapter command', async () => {
    const document = baseDocument();
    const { session } = harness(document);

    const chapter = await session.execute({
      type: 'chapter.create',
      chapterId: 'chapter-two',
      title: 'Two',
    });
    expect(chapter.ok).toBe(true);
    session.acceptStructural(chapter.document, chapter.inverse);

    const block = await session.execute({
      type: 'block.create',
      blockId: 'c',
      placement: { kind: 'top-level', chapterId: 'chapter-two' },
    });
    expect(block.ok).toBe(true);
    // The runtime deliberately replaces the pair of inverses with one
    // `chapter.delete` inverse so a single undo removes the whole action.
    session.acceptStructural(block.document, {
      type: 'chapter.delete',
      chapterId: 'chapter-two',
      blockHandling: { kind: 'delete-blocks' },
    });

    expect(session.canUndoStructural).toBe(true);
    expect(session.popUndo()).toMatchObject({
      type: 'chapter.delete',
      chapterId: 'chapter-two',
    });
    expect(session.canUndoStructural).toBe(true);

    expect(session.popUndo()).toMatchObject({ type: 'chapter.delete', chapterId: 'chapter-two' });
    expect(session.canUndoStructural).toBe(false);
  });

  it('clears structural redo when a new structural command is accepted', async () => {
    const document = baseDocument();
    const { session } = harness(document);

    const added = await session.execute(createCommand('c'));
    session.acceptStructural(added.document, added.inverse);
    const inverse = session.popUndo();
    if (inverse === undefined) throw new Error('expected a structural inverse');
    const undone = await session.apply(inverse);
    session.acceptUndo(undone.document, undone.inverse);
    expect(session.canRedoStructural).toBe(true);

    const other = await session.execute(createCommand('d'));
    session.acceptStructural(other.document, other.inverse);

    expect(session.canRedoStructural).toBe(false);
    expect(session.canUndoStructural).toBe(true);
  });

  it('undo and redo move the same inverse between the stacks and the document', async () => {
    const document = baseDocument();
    const { session } = harness(document);
    const added = await session.execute(createCommand('c'));
    session.acceptStructural(added.document, added.inverse);
    const afterAdd = session.canonical;

    const undoCommand = session.popUndo();
    if (undoCommand === undefined) throw new Error('expected a structural inverse');
    expect(undoCommand.type).toBe('block.delete');
    const undone = await session.apply(undoCommand);
    session.acceptUndo(undone.document, undone.inverse);

    expect(session.canonical.blocks['c']).toBeUndefined();
    expect(session.revision).toBe(afterAdd.revision + 1);
    expect(session.canUndoStructural).toBe(false);
    expect(session.canRedoStructural).toBe(true);
    expect(session.lastHistoryOperation).toBe('structural');

    const redoCommand = session.popRedo();
    if (redoCommand === undefined) throw new Error('expected a structural redo command');
    // The inverse of `block.delete` restores the exact structure, not a fresh
    // `block.create`: the redo entry is the core's identity-preserving inverse.
    expect(redoCommand.type).toBe('structure.restore');
    const redone = await session.apply(redoCommand);
    session.acceptRedo(redone.document, redone.inverse);

    expect(session.canonical.blocks['c']).toBeDefined();
    expect(session.revision).toBe(afterAdd.revision + 2);
    expect(session.canUndoStructural).toBe(true);
    expect(session.canRedoStructural).toBe(false);
  });

  it('drops a rejected inverse instead of retrying it at the top of the stack', async () => {
    const document = baseDocument();
    const { session, memory } = harness(document);
    const added = await session.execute(createCommand('c'));
    session.acceptStructural(added.document, added.inverse);
    const older = await session.execute(createCommand('d'));
    session.acceptStructural(older.document, older.inverse);

    memory.queueApply({ ok: false, message: 'simulated undo failure', code: 'unknown' });
    const inverse = session.popUndo() as DocumentCommand;
    const failed = await session.apply(inverse);

    expect(failed.ok).toBe(false);
    expect(session.canUndoStructural).toBe(true);
    expect(session.popUndo()).toMatchObject({ type: 'block.delete', blockId: 'c' });
    expect(session.canUndoStructural).toBe(false);
  });

  it('tracks text history and resets both stacks on reload', () => {
    const document = baseDocument();
    const { session } = harness(document);
    session.markTextHistory();
    expect(session.lastHistoryOperation).toBe('text');

    const replaced = { ...document, revision: document.revision + 5 };
    session.reset(replaced);

    expect(session.canonical).toBe(replaced);
    expect(session.revision).toBe(document.revision + 5);
    expect(session.canUndoStructural).toBe(false);
    expect(session.canRedoStructural).toBe(false);
    expect(session.lastHistoryOperation).toBeNull();
  });
});

describe('DocumentSession content commit', () => {
  it('applies block content, bumps the version, and notifies once', async () => {
    const document = baseDocument();
    const { session, memory, state } = harness(document);
    const content = paragraph('Hello');
    const change: ContentChange = { blockId: 'a', content };

    expect(session.contentChanged('a', content)).toBe(true);
    const committed = await session.commitContent([change]);

    expect(committed).toBe(true);
    expect(memory.calls).toEqual([
      {
        method: 'apply',
        packagePath,
        command: { type: 'block.editContent', blockId: 'a', content },
      },
    ]);
    expect(session.canonical.blocks['a']?.content).toEqual(content);
    expect(session.revision).toBe(document.revision + 1);
    expect(session.contentChanged('a', content)).toBe(false);
    expect(session.contentChanged('a', paragraph('Other'))).toBe(true);
    expect(state.versions).toBe(1);
    expect(state.notifications).toBe(1);
    expect(state.committed).toBe(1);
    expect(state.failures).toEqual([]);
    expect(state.order).toEqual(['version', 'notify']);
  });

  it('records the typed failure and stops without version/notify/commit hooks', async () => {
    const document = baseDocument();
    const { session, memory, state } = harness(document);
    memory.queueApply({ ok: false, message: 'document is read-only', code: 'read-only' });

    const committed = await session.commitContent([
      { blockId: 'a', content: paragraph('Hello') },
    ]);

    expect(committed).toBe(false);
    expect(state.failures).toEqual([
      { code: 'read-only', message: 'document is read-only' },
    ]);
    expect(state.versions).toBe(0);
    expect(state.notifications).toBe(0);
    expect(state.committed).toBe(0);
    expect(session.canonical).toBe(document);
  });

  it('maps every non-read-only failure to the generic save code', async () => {
    const document = baseDocument();
    const { session, memory, state } = harness(document);
    memory.queueApply({ ok: false, code: 'invalid-content' });

    await session.commitContent([{ blockId: 'a', content: paragraph('Hello') }]);

    expect(state.failures).toEqual([
      { code: 'unknown', message: 'Could not save the edit.' },
    ]);
  });

  it('keeps changes the store accepted before a later change failed', async () => {
    const document = baseDocument();
    const accepted = applied(document, {
      type: 'block.editContent',
      blockId: 'a',
      content: paragraph('First'),
    });
    const gateway = scriptedGateway([
      accepted,
      { ok: false, message: 'second change failed', code: 'unknown' },
    ]);
    const { session, versions, notifications } = scriptedSession(document, gateway);

    const committed = await session.commitContent([
      { blockId: 'a', content: paragraph('First') },
      { blockId: 'b', content: paragraph('Second') },
    ]);

    expect(committed).toBe(false);
    expect(session.canonical.blocks['a']?.content).toEqual(paragraph('First'));
    expect(session.contentChanged('a', paragraph('First'))).toBe(false);
    expect(session.contentChanged('b', paragraph('Second'))).toBe(true);
    expect(versions()).toBe(0);
    expect(notifications()).toBe(0);
  });

  it('marks content committed even when the gateway returns no document', async () => {
    const document = baseDocument();
    const gateway = scriptedGateway([{ ok: true }]);
    let committed = 0;
    let versions = 0;
    let notifications = 0;
    const session = new DocumentSession(document, {
      packagePath: () => packagePath,
      adoptPackagePath: () => undefined,
      gateway,
      isEditable: () => true,
      commitEditor: async () => true,
      bumpVersion: () => {
        versions += 1;
      },
      notify: () => {
        notifications += 1;
      },
      markContentCommitted: () => {
        committed += 1;
      },
      noteStructuralChange: () => undefined,
      recordFailure: () => undefined,
      saveError: () => null,
    });

    expect(await session.commitContent([{ blockId: 'a', content: paragraph('Hello') }])).toBe(
      true,
    );
    expect(committed).toBe(1);
    expect(versions).toBe(0);
    expect(notifications).toBe(0);
    expect(session.canonical).toBe(document);
  });

  it('skips the gateway for an empty change set', async () => {
    const document = baseDocument();
    const { session, memory, state } = harness(document);

    expect(await session.commitContent([])).toBe(true);
    expect(memory.calls).toEqual([]);
    expect(state.order).toEqual([]);
  });
});

describe('DocumentSession revision and canonical state', () => {
  it('stores the revision a successful disk write reported', () => {
    const document = baseDocument();
    const { session } = harness(document);

    session.applyRevision(document.revision + 3);

    expect(session.revision).toBe(document.revision + 3);
    expect(session.canonical.blocks).toBe(document.blocks);
    expect(session.canonical.revision).toBe(document.revision + 3);
  });

  it('ignores an undefined write revision', () => {
    const document = baseDocument();
    const { session } = harness(document);

    session.applyRevision(undefined);

    expect(session.canonical).toBe(document);
  });

  it('rebuilds content hashes from the new snapshot on reset', async () => {
    const document = baseDocument();
    const { session } = harness(document);
    const changed = applied(document, {
      type: 'block.editContent',
      blockId: 'a',
      content: paragraph('Edited'),
    });
    session.acceptStructural(changed.document, changed.inverse);
    expect(session.contentChanged('a', paragraph('Edited'))).toBe(false);

    session.reset(document);

    expect(session.contentChanged('a', paragraph('Edited'))).toBe(true);
    expect(session.contentChanged('a', document.blocks['a']?.content)).toBe(false);
  });

  it('swaps the diagnostic benchmark document without touching history', async () => {
    const document = baseDocument();
    const { session } = harness(document);
    const added = await session.execute(createCommand('c'));
    session.acceptStructural(added.document, added.inverse);
    const permuted = { ...session.canonical, chapters: [...session.canonical.chapters].reverse() };

    session.replaceDocument(permuted);

    expect(session.canonical).toBe(permuted);
    expect(session.canUndoStructural).toBe(true);
    expect(session.revision).toBe(added.document?.revision);
  });

  it('needs no window bridge: the gateway is the only platform access', async () => {
    expect((globalThis as { window?: unknown }).window).toBeUndefined();
    const document = baseDocument();
    const { session, memory } = harness(document);

    const result = await session.execute(renameCommand('Renamed'));

    expect(result.ok).toBe(true);
    expect(memory.currentDocument().title).toBe('Renamed');
  });
});
