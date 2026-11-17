import { describe, expect, it } from 'vitest';
import { createDocument, executeCommand, type Document } from '@noteforest/core';
import type { MaterializeDraftResult } from '../src/shared/api';
import { DocumentRuntime } from '../src/renderer/src/state/runtime';
import { createInMemoryDocumentGateway } from '../src/renderer/src/state/memory-document-gateway';

/**
 * Renderer-side draft materialization: only the document key changes. The
 * runtime instance, canonical document, selection, and structural undo history
 * survive; a clean draft never materializes on a plain save.
 */

function draftDocument(): Document {
  const base = createDocument({ title: 'Untitled', chapterId: 'chapter-1' });
  const created = executeCommand(base, {
    type: 'block.create',
    blockId: 'block-1',
    content: {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Draft text' }] }],
    },
    placement: { kind: 'top-level', chapterId: 'chapter-1' },
  });
  if (!created.ok) throw new Error(created.message);
  return created.document;
}

function draftRuntime(
  materializedPath = '/tmp/noteforest-test/library/untitled',
): {
  runtime: DocumentRuntime;
  memory: ReturnType<typeof createInMemoryDocumentGateway>;
  changes: Array<{ from: string; to: string; documentId: string }>;
} {
  const document = draftDocument();
  const memory = createInMemoryDocumentGateway({
    packagePath: 'draft:draft-1',
    document,
    materializedPath,
  });
  const runtime = new DocumentRuntime(
    {
      packagePath: 'draft:draft-1',
      document,
      status: 'editable',
      errors: [],
      warnings: [],
    },
    [],
    null,
    memory.gateway,
  );
  const changes: Array<{ from: string; to: string; documentId: string }> = [];
  runtime.onPackagePathChange = (from, to, documentId) => {
    changes.push({ from, to, documentId });
  };
  return { runtime, memory, changes };
}

describe('draft materialization', () => {
  it('swaps the key only, keeping identity, selection, and structural undo', async () => {
    const { runtime, memory, changes } = draftRuntime();
    const documentId = runtime.document.id;
    runtime.selectBlock('block-1');
    const added = await runtime.addTopLevel('chapter-1');
    expect(added.ok).toBe(true);
    expect(runtime.canUndoStructural).toBe(true);

    const result = await runtime.ensureMaterialized();
    expect(result.ok).toBe(true);
    expect(runtime.packagePath).toBe('/tmp/noteforest-test/library/untitled');
    expect(runtime.isDraft).toBe(false);
    expect(runtime.document.id).toBe(documentId);
    expect(runtime.selectedBlockId).toBe('block-1');
    expect(runtime.canUndoStructural).toBe(true);
    expect(changes).toEqual([
      { from: 'draft:draft-1', to: '/tmp/noteforest-test/library/untitled', documentId },
    ]);
    expect(
      memory.calls.filter((call) => call.method === 'materializeDraft'),
    ).toHaveLength(1);

    // The same runtime still owns its canonical document and undo stack.
    const undone = await runtime.undoStructural();
    expect(undone.ok).toBe(true);
    expect(Object.keys(runtime.document.blocks)).toEqual(['block-1']);
    runtime.dispose();
  });

  it('never writes an untouched draft on a plain save', async () => {
    const { runtime, memory } = draftRuntime();
    await runtime.saveNow();
    expect(memory.calls.some((call) => call.method === 'materializeDraft')).toBe(false);
    expect(runtime.packagePath).toBe('draft:draft-1');
    expect(memory.calls.filter((call) => call.method === 'save')).toHaveLength(1);
    runtime.dispose();
  });

  it('materializes on the first keystroke without waiting for the autosave', async () => {
    const { runtime, memory } = draftRuntime();
    runtime.noteEditorUpdate();
    const result = await runtime.ensureMaterialized();
    expect(result.ok).toBe(true);
    expect(runtime.packagePath).toBe('/tmp/noteforest-test/library/untitled');
    expect(memory.calls.some((call) => call.method === 'materializeDraft')).toBe(true);
    runtime.dispose();
  });

  it('keeps the draft when materialization fails and retries later', async () => {
    const { runtime, memory, changes } = draftRuntime();
    const failure: MaterializeDraftResult = {
      ok: false,
      code: 'library-missing',
      message: 'The library this note was created in is not available.',
    };
    memory.queueMaterializeDraft(failure);
    const failed = await runtime.ensureMaterialized();
    expect(failed.ok).toBe(false);
    expect(runtime.isDraft).toBe(true);
    expect(runtime.draftError).toMatchObject({ code: 'library-missing' });
    expect(changes).toEqual([]);

    const retried = await runtime.ensureMaterialized();
    expect(retried.ok).toBe(true);
    expect(runtime.isDraft).toBe(false);
    expect(runtime.draftError).toBeNull();
    expect(changes).toHaveLength(1);
    runtime.dispose();
  });

  it('clears a failure recorded against the draft once the package exists', async () => {
    const { runtime, memory } = draftRuntime();
    const locked: MaterializeDraftResult = {
      ok: false,
      code: 'locked',
      message: 'Another window has this note open. Close it there and try again.',
    };
    // The first keystroke and the save behind it both hit the live lock.
    memory.queueMaterializeDraft(locked);
    memory.queueMaterializeDraft(locked);
    runtime.noteEditorUpdate();
    await runtime.saveNow();
    expect(runtime.isDraft).toBe(true);
    expect(runtime.saveState).toBe('error');
    expect(runtime.saveFailure?.code).toBe('lock-lost');

    // The lock is gone: the retry materializes the package. The failure taken
    // against the draft target is stale and must not outlive the write.
    const retried = await runtime.ensureMaterialized();
    expect(retried.ok).toBe(true);
    expect(runtime.isDraft).toBe(false);
    expect(runtime.draftError).toBeNull();
    expect(runtime.saveFailure).toBeNull();
    expect(runtime.saveState).toBe('unsaved');

    await runtime.saveNow();
    expect(runtime.saveState).toBe('saved');
    expect(runtime.saveFailure).toBeNull();
    runtime.dispose();
  });

  it('adopts a package path reported by a command (lazy materialization)', async () => {
    const { runtime, memory, changes } = draftRuntime();
    // Model the main-process lazy path: the apply result carries the new path.
    memory.queueApply({
      ok: true,
      document: runtime.document,
      revision: runtime.document.revision,
      packagePath: '/tmp/noteforest-test/library/untitled',
    });
    const outcome = await runtime.applyStructural({ type: 'document.rename', title: 'Named' });
    expect(outcome.ok).toBe(true);
    expect(runtime.packagePath).toBe('/tmp/noteforest-test/library/untitled');
    expect(changes).toHaveLength(1);
    expect(memory.calls.some((call) => call.method === 'materializeDraft')).toBe(false);
    runtime.dispose();
  });
});
