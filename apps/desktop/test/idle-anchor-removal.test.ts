import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDocument,
  executeCommand,
  type ContentNode,
  type Document,
  type DocumentCommand,
} from '@noteforest/core';
import type { ApplyResult, OpenDocumentSnapshot } from '../src/shared/api';
import { DocumentRuntime } from '../src/renderer/src/state/runtime';

afterEach(() => {
  vi.unstubAllGlobals();
});

function apply(document: Document, command: DocumentCommand): Document {
  const result = executeCommand(document, command);
  if (!result.ok) throw new Error(result.message);
  return result.document;
}

function textDocument(text: string): ContentNode {
  return {
    type: 'doc',
    children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
  };
}

function idleFixture(): {
  document: Document;
  sourceId: string;
  idleAnchorId: string;
  idleTargetId: string;
  liveAnchorId: string;
  liveTargetId: string;
} {
  const created = createDocument({
    title: 'Idle removal',
    chapterId: 'chapter-one',
    chapterTitle: 'One',
  });
  let document = apply(created, {
    type: 'block.create',
    blockId: 'source',
    content: textDocument('Alpha symmetric beta'),
    placement: { kind: 'top-level', chapterId: 'chapter-one' },
  });
  document = apply(document, {
    type: 'block.create',
    blockId: 'idle-target',
    content: textDocument('Idle target'),
    placement: { kind: 'top-level', chapterId: 'chapter-one' },
  });
  document = apply(document, {
    type: 'block.create',
    blockId: 'live-target',
    content: textDocument('Live target'),
    placement: { kind: 'top-level', chapterId: 'chapter-one' },
  });

  const live = executeCommand(document, {
    type: 'branch.createFromSelection',
    blockId: 'source',
    kind: 'text',
    binding: {
      kind: 'text',
      ranges: [{ nodePath: [0, 0], start: 6, end: 15 }],
    },
    target: { kind: 'existing', blockId: 'live-target' },
    role: 'primary',
  });
  if (!live.ok) throw new Error(live.message);
  document = live.document;
  const liveAnchorId = live.created.anchorIds[0];
  if (liveAnchorId === undefined) throw new Error('live anchor fixture is missing its anchor');

  const idle = executeCommand(document, {
    type: 'branch.createFromSelection',
    blockId: 'source',
    kind: 'text',
    binding: {
      kind: 'text',
      ranges: [{ nodePath: [0, 0], start: 0, end: 5 }],
    },
    target: { kind: 'existing', blockId: 'idle-target' },
    role: 'primary',
  });
  if (!idle.ok) throw new Error(idle.message);
  document = idle.document;
  const idleAnchorId = idle.created.anchorIds[0];
  const idleBranchId = idle.created.branchIds[0];
  if (idleAnchorId === undefined || idleBranchId === undefined) {
    throw new Error('idle anchor fixture did not create an anchor and branch');
  }
  document = apply(document, {
    type: 'branch.delete',
    branchId: idleBranchId,
    targetHandling: { kind: 'promote' },
  });

  return {
    document,
    sourceId: 'source',
    idleAnchorId,
    idleTargetId: 'idle-target',
    liveAnchorId,
    liveTargetId: 'live-target',
  };
}

function stubBridge(document: Document): { current: () => Document } {
  let current = document;
  vi.stubGlobal('window', {
    noteforest: {
      apply: async (_packagePath: string, command: DocumentCommand): Promise<ApplyResult> => {
        const result = executeCommand(current, command);
        if (!result.ok) return { ok: false, message: result.message, code: result.code };
        current = result.document;
        return {
          ok: true,
          document: current,
          revision: result.revision,
          created: result.created,
          inverse: result.inverse,
        };
      },
      save: async () => ({ ok: true, changed: true, revision: current.revision }),
    },
  });
  return { current: () => current };
}

function snapshot(document: Document): OpenDocumentSnapshot {
  return {
    packagePath: '/tmp/noteforest-test/library/idle',
    document,
    status: 'editable',
    errors: [],
    warnings: [],
  };
}

describe('idle anchor removal', () => {
  it('rejects a live anchor and removes an idle record with one exact undo', async () => {
    const { document, sourceId, idleAnchorId, idleTargetId, liveAnchorId } =
      idleFixture();
    const bridge = stubBridge(document);
    const runtime = new DocumentRuntime(snapshot(document), [], null);
    const before = structuredClone(runtime.document);

    const liveAttempt = await runtime.removeIdleAnchor(liveAnchorId);
    expect(liveAttempt.ok).toBe(false);
    expect(runtime.document).toEqual(before);
    expect(bridge.current()).toEqual(before);

    const removed = await runtime.removeIdleAnchor(idleAnchorId);
    expect(removed.ok).toBe(true);
    expect(runtime.document.anchors[idleAnchorId]).toBeUndefined();
    expect(runtime.document.anchors[liveAnchorId]).toBeDefined();
    expect(runtime.document.branches).toEqual(before.branches);
    expect(runtime.document.blocks[idleTargetId]).toBeDefined();
    expect(JSON.stringify(runtime.document.blocks[sourceId]?.content)).not.toContain(
      idleAnchorId,
    );
    expect(JSON.stringify(runtime.document.blocks[sourceId]?.content)).toContain(liveAnchorId);
    expect(runtime.canUndoStructural).toBe(true);

    const undone = await runtime.undoStructural();
    expect(undone.ok).toBe(true);
    expect(runtime.document.anchors).toEqual(before.anchors);
    expect(runtime.document.branches).toEqual(before.branches);
    expect(runtime.document.blocks[sourceId]?.content).toEqual(
      before.blocks[sourceId]?.content,
    );
    expect(runtime.document.blocks[idleTargetId]).toBeDefined();

    runtime.dispose();
  });
});
