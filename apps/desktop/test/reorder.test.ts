import { describe, expect, it } from 'vitest';
import { createDocument, executeCommand, type Document } from '@noteforest/core';
import { reorderPairReason, reorderTarget, siblingGroupIds } from '../src/renderer/src/lib/reorder';

/**
 * Reorder is port-scoped (F1): the pre-fix Move up/down used the parent's
 * direct-child list for an anchored callout, so two callouts from one anchor
 * shared an order key instead of swapping.
 */

function context() {
  let id = 0;
  return {
    newId: () => `id-${(id += 1)}`,
    now: () => '2026-11-14T00:00:00.000Z',
  };
}

function run(document: Document, command: object): Document {
  const result = executeCommand(document, command as never, context());
  if (!result.ok) throw new Error(result.message);
  return result.document;
}

function text(value: string) {
  return {
    type: 'doc',
    children: [{ type: 'paragraph', children: [{ type: 'text', text: value }] }],
  };
}

function create(document: Document, blockId: string, value: string, placement: object): Document {
  return run(document, {
    type: 'block.create',
    blockId,
    content: text(value),
    placement,
  });
}

/**
 * Two anchored callouts from `anchor-1` (b, c), two direct children (a1, a2),
 * two top-level blocks in chapter one (a, d), and one top-level block in a
 * second chapter (e).
 */
function fixture(): { document: Document } {
  let document = createDocument({ id: 'doc', chapterId: 'chapter-1' });
  const chapterId = document.chapters[0]?.id ?? 'chapter-1';
  document = create(document, 'a', 'Alpha eigenvalue beta', {
    kind: 'top-level',
    chapterId,
  });
  document = create(document, 'd', 'D', { kind: 'top-level', chapterId });
  document = create(document, 'b', 'B', { kind: 'top-level', chapterId });
  document = create(document, 'c', 'C', { kind: 'top-level', chapterId });
  document = create(document, 'a1', 'A1', { kind: 'child', parentBlockId: 'a' });
  document = create(document, 'a2', 'A2', { kind: 'child', parentBlockId: 'a' });
  document = run(document, {
    type: 'anchor.create',
    anchorId: 'anchor-1',
    blockId: 'a',
    kind: 'text',
    selector: { kind: 'text', quote: 'eigenvalue', prefix: 'Alpha ', suffix: ' beta' },
    binding: { kind: 'text', ranges: [{ nodePath: [0, 0], start: 6, end: 16 }] },
    quote: 'eigenvalue',
  });
  document = run(document, {
    type: 'branch.create',
    sourceBlockId: 'a',
    sourceAnchorId: 'anchor-1',
    targetBlockId: 'b',
    role: 'primary',
  });
  document = run(document, {
    type: 'branch.create',
    sourceBlockId: 'a',
    sourceAnchorId: 'anchor-1',
    targetBlockId: 'c',
    role: 'primary',
  });
  document = run(document, { type: 'chapter.create', chapterId: 'chapter-2', title: 'Two' });
  document = create(document, 'e', 'E', { kind: 'top-level', chapterId: 'chapter-2' });
  return { document };
}

describe('sibling reorder groups', () => {
  it('reorders two same-anchor callouts inside one anchor port', () => {
    const { document } = fixture();
    expect(siblingGroupIds(document, 'b')).toEqual(['b', 'c']);
    expect(reorderTarget(document, 'b', -1)).toEqual({
      ok: false,
      reason: 'Already the first block in this group.',
    });
    expect(reorderTarget(document, 'b', 1)).toEqual({ ok: true, targetBlockId: 'c' });
    expect(reorderTarget(document, 'c', -1)).toEqual({ ok: true, targetBlockId: 'b' });
    expect(reorderTarget(document, 'c', 1)).toEqual({
      ok: false,
      reason: 'Already the last block in this group.',
    });
  });

  it('never mixes an anchor port with the parent’s direct children', () => {
    const { document } = fixture();
    expect(siblingGroupIds(document, 'a1')).toEqual(['a1', 'a2']);
    expect(siblingGroupIds(document, 'a2')).toEqual(['a1', 'a2']);
    expect(reorderTarget(document, 'a1', -1).ok).toBe(false);
    expect(reorderTarget(document, 'a2', -1)).toEqual({ ok: true, targetBlockId: 'a1' });
    // The callouts are not in the direct-child list and vice versa.
    expect(siblingGroupIds(document, 'b')).not.toContain('a1');
    expect(siblingGroupIds(document, 'a2')).not.toContain('b');
  });

  it('reorders top-level blocks inside their chapter only', () => {
    const { document } = fixture();
    expect(siblingGroupIds(document, 'a')).toEqual(['a', 'd']);
    expect(reorderTarget(document, 'a', 1)).toEqual({ ok: true, targetBlockId: 'd' });
    expect(siblingGroupIds(document, 'e')).toEqual(['e']);
    expect(reorderTarget(document, 'e', -1)).toEqual({
      ok: false,
      reason: 'Already the first block in this group.',
    });
  });

  it('explains why a drag cannot cross a port, a parent, or a chapter', () => {
    const { document } = fixture();
    expect(reorderPairReason(document, 'b', 'c')).toBeNull();
    expect(reorderPairReason(document, 'a1', 'a2')).toBeNull();
    expect(reorderPairReason(document, 'a', 'd')).toBeNull();
    expect(reorderPairReason(document, 'b', 'a1')).toMatch(/own anchor/);
    expect(reorderPairReason(document, 'a1', 'b')).toMatch(/anchored callout/);
    expect(reorderPairReason(document, 'b', 'a')).toBe('Only siblings can be reordered.');
    expect(reorderPairReason(document, 'a1', 'd')).toBe('Only siblings can be reordered.');
    expect(reorderPairReason(document, 'a', 'e')).toBe(
      'Only blocks in the same chapter can be reordered.',
    );
    expect(reorderPairReason(document, 'a', 'a')).toBe(
      'A block cannot be reordered against itself.',
    );
    expect(reorderPairReason(document, 'missing', 'a')).toBe(
      'The block is no longer in this document.',
    );
  });

  it('disables Move up/down for an unknown block instead of throwing', () => {
    const { document } = fixture();
    expect(reorderTarget(document, 'missing', 1)).toEqual({
      ok: false,
      reason: 'This block is not in the current chapter.',
    });
  });
});
