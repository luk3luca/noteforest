import { describe, expect, it } from 'vitest';
import { createDocument, executeCommand, type Document } from '@noteforest/core';
import { indentTarget, outdentTarget } from '../src/renderer/src/lib/indent';

function context() {
  let id = 0;
  return {
    newId: () => `id-${(id += 1)}`,
    now: () => '2026-11-14T00:00:00.000Z',
  };
}

function create(document: Document, blockId: string, text: string, placement: object): Document {
  const result = executeCommand(
    document,
    {
      type: 'block.create',
      blockId,
      content: {
        type: 'doc',
        children: [{ type: 'paragraph', children: [{ type: 'text', text }] }],
      },
      placement: placement as never,
    },
    context(),
  );
  if (!result.ok) throw new Error(result.message);
  return result.document;
}

function fixture(): { document: Document; chapterId: string } {
  const initial = createDocument({ id: 'doc', chapterId: 'chapter-1' });
  const chapterId = initial.chapters[0]?.id ?? 'chapter-1';
  let document = create(initial, 'a', 'A', { kind: 'top-level', chapterId });
  document = create(document, 'b', 'B', { kind: 'top-level', chapterId });
  document = create(document, 'c', 'C', { kind: 'top-level', chapterId });
  document = create(document, 'a1', 'A1', { kind: 'child', parentBlockId: 'a' });
  document = create(document, 'a2', 'A2', { kind: 'child', parentBlockId: 'a' });
  return { document, chapterId };
}

describe('indent and outdent targets', () => {
  it('indents under the previous primary sibling, never guessing another parent', () => {
    const { document } = fixture();
    expect(indentTarget(document, 'a')).toEqual({
      ok: false,
      reason: 'No previous sibling to indent under.',
    });
    expect(indentTarget(document, 'b')).toEqual({ ok: true, parentBlockId: 'a' });
    expect(indentTarget(document, 'c')).toEqual({ ok: true, parentBlockId: 'b' });
  });

  it('uses the primary order of a child branch, not the reference edges', () => {
    const { document } = fixture();
    expect(indentTarget(document, 'a1')).toEqual({
      ok: false,
      reason: 'No previous sibling to indent under.',
    });
    expect(indentTarget(document, 'a2')).toEqual({ ok: true, parentBlockId: 'a1' });
  });

  it('only outdents a block that has a primary parent', () => {
    const { document } = fixture();
    expect(outdentTarget(document, 'a')).toEqual({
      ok: false,
      reason: 'Already a top-level block.',
    });
    expect(outdentTarget(document, 'a1')).toEqual({ ok: true, parentBlockId: 'a' });
  });

  it('returns a disabled result for an unknown block instead of throwing', () => {
    const { document } = fixture();
    expect(indentTarget(document, 'missing').ok).toBe(false);
    expect(outdentTarget(document, 'missing').ok).toBe(false);
  });
});
