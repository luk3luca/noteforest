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

function markedDocument(
  parts: Array<string | { text: string; anchorIds: string[] }>,
): ContentNode {
  return {
    type: 'doc',
    children: [
      {
        type: 'paragraph',
        children: parts.map((part) =>
          typeof part === 'string'
            ? { type: 'text', text: part }
            : {
                type: 'text',
                text: part.text,
                marks: [{ type: 'anchor', attrs: { anchorIds: part.anchorIds } }],
              },
        ),
      },
    ],
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
    packagePath: '/tmp/noteforest-test/library/document-health',
    document,
    status: 'editable',
    errors: [],
    warnings: [],
  };
}

function healthFixture(): Document {
  let document = createDocument({
    title: 'Document health actions',
    chapterId: 'chapter-one',
    chapterTitle: 'One',
  });
  document = apply(document, {
    type: 'block.create',
    blockId: 'source',
    content: markedDocument(['Alpha ', { text: 'beta', anchorIds: ['orphan-reference'] }]),
    placement: { kind: 'top-level', chapterId: 'chapter-one' },
  });
  document = apply(document, {
    type: 'block.create',
    blockId: 'target',
    content: textDocument('Target'),
    placement: { kind: 'top-level', chapterId: 'chapter-one' },
  });
  document = apply(document, {
    type: 'anchor.create',
    anchorId: 'live-anchor',
    blockId: 'source',
    kind: 'text',
    selector: { kind: 'text', quote: 'Alpha' },
    binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 0, end: 5 }] },
  });
  document = apply(document, {
    type: 'chapter.create',
    chapterId: 'empty-chapter',
    title: 'Empty chapter',
  });
  return document;
}

describe('document health runtime actions', () => {
  it('strips only an inert anchor ID, with one exact undo', async () => {
    const document = healthFixture();
    const bridge = stubBridge(document);
    const runtime = new DocumentRuntime(snapshot(document), [], null);
    const before = structuredClone(runtime.document);

    const liveAttempt = await runtime.stripOrphanAnchor('source', 'live-anchor');
    expect(liveAttempt.ok).toBe(false);
    expect(liveAttempt.message).toBe('This anchor already exists. Repair or delete it instead.');
    expect(runtime.document).toEqual(before);
    expect(bridge.current()).toEqual(before);

    const stripped = await runtime.stripOrphanAnchor('source', 'orphan-reference');
    expect(stripped.ok).toBe(true);
    expect(JSON.stringify(runtime.document.blocks['source']?.content)).not.toContain(
      'orphan-reference',
    );
    expect(JSON.stringify(runtime.document.blocks['source']?.content)).toContain('beta');

    const undone = await runtime.undoStructural();
    expect(undone.ok).toBe(true);
    expect(runtime.document.blocks['source']?.content).toEqual(
      before.blocks['source']?.content,
    );

    runtime.dispose();
  });

  it('deletes only an empty chapter and restores it on undo', async () => {
    const document = healthFixture();
    stubBridge(document);
    const runtime = new DocumentRuntime(snapshot(document), [], null);

    const rejected = await runtime.deleteEmptyChapter('chapter-one');
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toBe('This chapter still has blocks. Move or delete them first.');

    const deleted = await runtime.deleteEmptyChapter('empty-chapter');
    expect(deleted.ok).toBe(true);
    expect(runtime.document.chapters.map((chapter) => chapter.id)).toEqual(['chapter-one']);

    const undone = await runtime.undoStructural();
    expect(undone.ok).toBe(true);
    expect(runtime.document.chapters.map((chapter) => chapter.id)).toContain('empty-chapter');
    expect(
      runtime.document.chapters.find((chapter) => chapter.id === 'empty-chapter')
        ?.topLevelBlockIds,
    ).toEqual([]);

    runtime.dispose();
  });
});
