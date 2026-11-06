import { describe, expect, it } from 'vitest';
import type { DocumentCommand } from '../src/commands.js';
import { applyInverse, executeCommand } from '../src/commands.js';
import { validateDocument } from '../src/validation.js';
import { parseDocumentJson, stringifyDocument } from '../src/serialize.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  directChildren,
  newDocument,
  outlineOrder,
  primaryParentId,
  run,
  textContent,
  tryRun,
} from './helpers.js';
import {
  expectCommandSuccess as success,
} from './command-invariants.js';

function buildTree() {
  const context = deterministicContext();
  let document = newDocument(context);
  const createdA = addTopLevel(document, 'A', context);
  document = createdA.document;
  const createdB = addTopLevel(document, 'B', context);
  document = createdB.document;
  const childA1 = addChild(document, createdA.blockId, 'A1', context);
  document = childA1.document;
  const childA1a = addChild(document, childA1.blockId, 'A1a', context);
  document = childA1a.document;
  return {
    context,
    document,
    chapterId: document.chapters[0]?.id ?? '',
    a: createdA.blockId,
    b: createdB.blockId,
    a1: childA1.blockId,
    a1a: childA1a.blockId,
    branchA1: childA1.branchId,
    branchA1a: childA1a.branchId,
  };
}

describe('document and chapter commands', () => {
  it('creates a document and reports the new revision and affected IDs', () => {
    const context = deterministicContext();
    const result = executeCommand(null, { type: 'document.create', title: 'Doc' }, { context });
    const created = success(result);
    expect(created.document.title).toBe('Doc');
    expect(created.revision).toBe(0);
    expect(created.affected.documentIds).toEqual([created.document.id]);
    expect(created.affected.chapterIds).toEqual([created.document.chapters[0]?.id]);
    expect(created.created.documentIds).toEqual([created.document.id]);
    expect(created.created.chapterIds).toEqual([created.document.chapters[0]?.id]);
    expect(created.created.blockIds).toEqual([]);
    expect(created.inverse).toBeNull();
  });

  it('renames a document and exposes a working inverse', () => {
    const { document } = buildTree();
    const renamed = run(document, { type: 'document.rename', title: 'New title' });
    expect(renamed.document.title).toBe('New title');
    expect(renamed.revision).toBe(document.revision + 1);
    const restored = applyInverse(renamed);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.document.title).toBe(document.title);
  });

  it('creates, renames, and reorders chapters', () => {
    const { document } = buildTree();
    const created = run(document, { type: 'chapter.create', title: 'Second', atIndex: 1 });
    expect(created.document.chapters).toHaveLength(2);
    const second = created.document.chapters[1];
    expect(second?.title).toBe('Second');

    const renamed = run(created.document, {
      type: 'chapter.rename',
      chapterId: second?.id ?? '',
      title: 'Renamed',
    });
    expect(renamed.document.chapters[1]?.title).toBe('Renamed');

    const reordered = run(renamed.document, {
      type: 'chapter.reorder',
      chapterId: second?.id ?? '',
      toIndex: 0,
    });
    expect(reordered.document.chapters[0]?.id).toBe(second?.id);

    const cleared = run(reordered.document, {
      type: 'chapter.rename',
      chapterId: second?.id ?? '',
      title: null,
    });
    expect(cleared.document.chapters[0]?.title).toBeUndefined();
  });

  it('requires explicit block handling when deleting a chapter', () => {
    const { document, chapterId, a } = buildTree();
    const created = run(document, { type: 'chapter.create', title: 'Second' });
    const second = created.document.chapters[1]?.id ?? '';

    const rejected = tryRun(created.document, {
      type: 'chapter.delete',
      chapterId,
      blockHandling: { kind: 'reject-if-not-empty' },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe('chapter-in-use');

    const moved = run(created.document, {
      type: 'chapter.delete',
      chapterId,
      blockHandling: { kind: 'move-to-chapter', chapterId: second },
    });
    expect(moved.document.chapters).toHaveLength(1);
    expect(moved.document.chapters[0]?.topLevelBlockIds).toEqual(
      expect.arrayContaining([a]),
    );

    const deleted = run(created.document, {
      type: 'chapter.delete',
      chapterId,
      blockHandling: { kind: 'delete-blocks' },
    });
    expect(deleted.document.chapters).toHaveLength(1);
    expect(deleted.document.blocks[a]).toBeUndefined();
  });

  it('refuses to delete the last chapter', () => {
    const { document, chapterId } = buildTree();
    const result = tryRun(document, {
      type: 'chapter.delete',
      chapterId,
      blockHandling: { kind: 'reject-if-not-empty' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('last-chapter');
  });
});

describe('block commands create explicit primary arrow data', () => {
  it('creates top-level and child blocks with primary branches', () => {
    const { document, a, b, a1, branchA1 } = buildTree();
    expect(document.chapters[0]?.topLevelBlockIds).toEqual([a, b]);
    expect(primaryParentId(document, a1)).toBe(a);
    const branch = document.branches[branchA1];
    expect(branch).toMatchObject({
      id: branchA1,
      source: { blockId: a },
      targetBlockId: a1,
      role: 'primary',
    });
    expect(typeof branch?.order).toBe('string');
    expect(validateDocument(document).ok).toBe(true);
  });

  it('reports created block and branch IDs from the command result', () => {
    const { context, document, chapterId } = buildTree();
    const created = run(
      document,
      { type: 'block.create', placement: { kind: 'top-level', chapterId } },
      context,
    );
    const blockId = created.created.blockIds[0];
    expect(blockId).toBeDefined();
    expect(created.document.blocks[blockId ?? '']).toBeDefined();
    expect(created.document.chapters[0]?.topLevelBlockIds).toContain(blockId);
    expect(created.created.branchIds).toEqual([]);

    const child = run(
      created.document,
      {
        type: 'block.create',
        placement: { kind: 'child', parentBlockId: blockId ?? '' },
      },
      context,
    );
    expect(child.created.blockIds).toHaveLength(1);
    expect(child.created.branchIds).toHaveLength(1);
    expect(primaryParentId(child.document, child.created.blockIds[0] ?? '')).toBe(blockId);
  });

  it('creates siblings before and after the reference block', () => {
    const { context, document, a, a1 } = buildTree();
    const before = run(
      document,
      {
        type: 'block.create',
        label: 'A0',
        placement: { kind: 'sibling', siblingBlockId: a1, after: false },
      },
      context,
    );
    const newBefore = before.created.blockIds[0];
    expect(newBefore).toBeDefined();
    expect(before.created.branchIds).toHaveLength(1);
    expect(directChildren(before.document, a)[0]).toBe(newBefore);

    const after = run(
      before.document,
      {
        type: 'block.create',
        label: 'A2',
        placement: { kind: 'sibling', siblingBlockId: a1, after: true },
      },
      context,
    );
    const newAfter = after.created.blockIds[0];
    expect(newAfter).toBeDefined();
    expect(directChildren(after.document, a)).toEqual([newBefore, a1, newAfter]);
  });

  it('edits content and labels, preserving an inverse', () => {
    const { document, a } = buildTree();
    const edited = run(document, {
      type: 'block.editContent',
      blockId: a,
      content: textContent('Edited body'),
    });
    expect(edited.document.blocks[a]?.content).toEqual(textContent('Edited body'));
    const inverseEdit = applyInverse(edited);
    expect(inverseEdit.ok).toBe(true);
    if (inverseEdit.ok) expect(inverseEdit.document.blocks[a]?.content).toEqual(document.blocks[a]?.content);

    const renamed = run(document, { type: 'block.rename', blockId: a, label: null });
    expect(renamed.document.blocks[a]?.label).toBeUndefined();
    const inverseRename = applyInverse(renamed);
    expect(inverseRename.ok).toBe(true);
    if (inverseRename.ok) expect(inverseRename.document.blocks[a]?.label).toBe('A');
  });

  it('rejects duplicate IDs, cycles, and moving under descendants', () => {
    const { context, document, a, a1, chapterId } = buildTree();
    const duplicate = tryRun(document, {
      type: 'block.create',
      blockId: a1,
      placement: { kind: 'top-level', chapterId },
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.code).toBe('duplicate-id');

    const cycle = tryRun(document, {
      type: 'block.move',
      blockId: a,
      to: { kind: 'child', parentBlockId: a1 },
    });
    expect(cycle.ok).toBe(false);
    if (!cycle.ok) expect(cycle.code).toBe('cycle');

    const reparent = tryRun(document, {
      type: 'branch.create',
      sourceBlockId: a1,
      targetBlockId: a,
    });
    expect(reparent.ok).toBe(false);
    if (!reparent.ok) expect(reparent.code).toBe('cycle');

    const self = tryRun(document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: a,
    });
    expect(self.ok).toBe(false);
    if (!self.ok) expect(self.code).toBe('cycle');
    void context;
  });
});

describe('block deletion', () => {
  it('promotes children into the deleted child’s sibling position', () => {
    const { document, a, a1, a1a, branchA1a } = buildTree();
    const deleted = run(document, {
      type: 'block.delete',
      blockId: a1,
      children: 'promote',
    });
    expect(deleted.document.blocks[a1]).toBeUndefined();
    expect(deleted.document.blocks[a1a]).toBeDefined();
    expect(primaryParentId(deleted.document, a1a)).toBe(a);
    expect(deleted.document.branches[branchA1a]?.source.blockId).toBe(a);
    expect(directChildren(deleted.document, a)).toEqual([a1a]);
    expect(outlineOrder(deleted.document)).toEqual([a, a1a, document.chapters[0]?.topLevelBlockIds[1]]);
    expect(validateDocument(deleted.document).ok).toBe(true);
  });

  it('promotes root children to top-level blocks immediately after the root', () => {
    const { document, a, a1, a1a } = buildTree();
    const deleted = run(document, {
      type: 'block.delete',
      blockId: a,
      children: 'promote',
    });
    const topLevel = deleted.document.chapters[0]?.topLevelBlockIds ?? [];
    expect(topLevel[0]).toBe(a1);
    expect(deleted.document.blocks[a]).toBeUndefined();
    expect(primaryParentId(deleted.document, a1)).toBeNull();
    expect(primaryParentId(deleted.document, a1a)).toBe(a1);
    expect(deleted.document.branches[Object.keys(deleted.document.branches)[0] ?? '']?.source.blockId).not.toBe(a);
  });

  it('deletes a whole subtree and all touching branches', () => {
    const { document, a, a1, a1a, branchA1, branchA1a } = buildTree();
    const deleted = run(document, {
      type: 'block.delete',
      blockId: a,
      children: 'delete-subtree',
    });
    expect(deleted.document.blocks[a]).toBeUndefined();
    expect(deleted.document.blocks[a1]).toBeUndefined();
    expect(deleted.document.blocks[a1a]).toBeUndefined();
    expect(deleted.document.branches[branchA1]).toBeUndefined();
    expect(deleted.document.branches[branchA1a]).toBeUndefined();
    expect(deleted.document.chapters[0]?.topLevelBlockIds).not.toContain(a);
    expect(validateDocument(deleted.document).ok).toBe(true);
  });

  it('removes manual break hints that reference a deleted block', () => {
    const { document, a } = buildTree();
    const withHint = structuredClone(document);
    withHint.manualBreakBeforeBlockIds = [a];
    const deleted = run(withHint, { type: 'block.delete', blockId: a, children: 'delete-subtree' });
    expect(deleted.document.manualBreakBeforeBlockIds).toEqual([]);
  });
});

describe('reparent and reorder', () => {
  it('reparents a subtree without changing IDs or content', () => {
    const { document, a, b, a1, a1a, branchA1 } = buildTree();
    const moved = run(document, {
      type: 'block.move',
      blockId: a1,
      to: { kind: 'child', parentBlockId: b },
    });
    expect(moved.document.blocks[a1]?.content).toEqual(document.blocks[a1]?.content);
    expect(moved.document.blocks[a1]?.label).toBe('A1');
    expect(moved.document.blocks[a1a]?.label).toBe('A1a');
    expect(primaryParentId(moved.document, a1)).toBe(b);
    expect(primaryParentId(moved.document, a1a)).toBe(a1);
    expect(moved.document.branches[branchA1]?.source.blockId).toBe(b);
    expect(validateDocument(moved.document).ok).toBe(true);

    const inverse = applyInverse(moved);
    expect(inverse.ok).toBe(true);
    if (inverse.ok) {
      expect(primaryParentId(inverse.document, a1)).toBe(a);
      expect(outlineOrder(inverse.document)).toEqual(outlineOrder(document));
    }
  });

  it('reorders siblings while preserving branch and block identity', () => {
    const { context, document, a } = buildTree();
    const two = addChild(document, a, 'A2', context).document;
    const three = addChild(two, a, 'A3', context).document;
    const before = directChildren(three, a);
    expect(before).toHaveLength(3);
    const target = before[2] ?? '';
    const branchId = Object.values(three.branches).find(
      (branch) => branch.targetBlockId === target,
    )?.id;
    const reordered = run(three, { type: 'branch.reorder', branchId: branchId ?? '', toIndex: 0 });
    expect(directChildren(reordered.document, a)).toEqual([target, before[0], before[1]]);
    expect(reordered.document.branches[branchId ?? '']?.id).toBe(branchId);
    expect(reordered.document.blocks[target]?.content).toEqual(three.blocks[target]?.content);
  });

  it('reorders top-level blocks without changing IDs or content', () => {
    const { document, a, b } = buildTree();
    const moved = run(document, {
      type: 'block.move',
      blockId: b,
      to: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '', atIndex: 0 },
    });
    expect(moved.document.chapters[0]?.topLevelBlockIds.slice(0, 2)).toEqual([b, a]);
    expect(moved.document.blocks[a]?.content).toEqual(document.blocks[a]?.content);
    expect(moved.document.blocks[b]?.content).toEqual(document.blocks[b]?.content);
    expect(primaryParentId(moved.document, b)).toBeNull();
  });

  it('moves a child to top level and a root under a parent', () => {
    const { document, a, a1, branchA1 } = buildTree();
    const toTop = run(document, {
      type: 'block.move',
      blockId: a1,
      to: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '', atIndex: 1 },
    });
    expect(primaryParentId(toTop.document, a1)).toBeNull();
    expect(toTop.document.chapters[0]?.topLevelBlockIds[1]).toBe(a1);
    expect(toTop.affected.branchIds).toContain(branchA1);

    const back = run(toTop.document, {
      type: 'block.move',
      blockId: a1,
      to: { kind: 'child', parentBlockId: a, atIndex: 0 },
    });
    expect(primaryParentId(back.document, a1)).toBe(a);
    expect(outlineOrder(back.document)).toEqual(outlineOrder(document));
  });

  it('reorders a block among its siblings without touching content or IDs', () => {
    const { context, document, b } = buildTree();
    const first = addChild(document, b, 'B1', context);
    const second = addChild(first.document, b, 'B2', context);
    const before = directChildren(second.document, b);
    expect(before).toEqual([first.blockId, second.blockId]);
    const moved = run(second.document, {
      type: 'block.move',
      blockId: second.blockId,
      to: { kind: 'sibling', siblingBlockId: first.blockId, after: false },
    });
    expect(directChildren(moved.document, b)).toEqual([second.blockId, first.blockId]);
    expect(moved.document.blocks[first.blockId]?.content).toEqual(
      second.document.blocks[first.blockId]?.content,
    );
    expect(moved.document.blocks[second.blockId]?.content).toEqual(
      second.document.blocks[second.blockId]?.content,
    );
    expect(primaryParentId(moved.document, first.blockId)).toBe(b);
    expect(primaryParentId(moved.document, second.blockId)).toBe(b);
  });

  it('rejects moving a block before/after its own descendant', () => {
    const { document, a, a1, a1a } = buildTree();
    const result = tryRun(document, {
      type: 'block.move',
      blockId: a,
      to: { kind: 'sibling', siblingBlockId: a1a },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('cycle');
    const sibling = tryRun(document, {
      type: 'block.move',
      blockId: a1,
      to: { kind: 'sibling', siblingBlockId: a1 },
    });
    expect(sibling.ok).toBe(false);
  });
});

describe('primary branch commands', () => {
  it('attaches an existing root as a primary child and promotes it back', () => {
    const { document, a, b } = buildTree();
    const attached = run(document, {
      type: 'branch.create',
      sourceBlockId: a,
      targetBlockId: b,
      atIndex: 1,
    });
    expect(primaryParentId(attached.document, b)).toBe(a);
    expect(attached.document.chapters[0]?.topLevelBlockIds).not.toContain(b);
    expect(outlineOrder(attached.document)).toContain(b);
    const branchId = attached.affected.branchIds[0] ?? '';
    expect(attached.document.branches[branchId]?.targetBlockId).toBe(b);

    const promoted = run(attached.document, {
      type: 'branch.delete',
      branchId,
      targetHandling: { kind: 'promote' },
    });
    expect(primaryParentId(promoted.document, b)).toBeNull();
    expect(promoted.document.blocks[b]).toBeDefined();
    const top = promoted.document.chapters[0]?.topLevelBlockIds ?? [];
    expect(top.indexOf(b)).toBe(top.indexOf(a) + 1);
  });

  it('deletes a primary edge together with its target subtree when asked', () => {
    const { document, a, a1, branchA1 } = buildTree();
    const deleted = run(document, {
      type: 'branch.delete',
      branchId: branchA1,
      targetHandling: { kind: 'delete-subtree' },
    });
    expect(deleted.document.branches[branchA1]).toBeUndefined();
    expect(deleted.document.blocks[a1]).toBeUndefined();
    expect(deleted.document.blocks[a]).toBeDefined();
    expect(validateDocument(deleted.document).ok).toBe(true);
  });

  it('rejects a second primary parent and unsupported reference deletion', () => {
    const { document, a, b, a1 } = buildTree();
    const result = tryRun(document, {
      type: 'branch.create',
      sourceBlockId: b,
      targetBlockId: a1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('invalid-placement');
    void a;
  });

  it('reorders and relabels primary branches', () => {
    const { context, document, a, a1 } = buildTree();
    const second = addChild(document, a, 'A2', context);
    const branchId = Object.values(second.document.branches).find(
      (branch) => branch.targetBlockId === second.blockId,
    )?.id;
    const reordered = run(second.document, {
      type: 'branch.reorder',
      branchId: branchId ?? '',
      toIndex: 0,
    });
    expect(directChildren(reordered.document, a)[0]).toBe(second.blockId);
    const labelled = run(reordered.document, {
      type: 'branch.relabel',
      branchId: branchId ?? '',
      label: 'depends on',
    });
    expect(labelled.document.branches[branchId ?? '']?.label).toBe('depends on');
    const inverse = applyInverse(labelled);
    expect(inverse.ok).toBe(true);
    if (inverse.ok) expect(inverse.document.branches[branchId ?? '']?.label).toBeUndefined();
    void a1;
  });
});

describe('transactions, history, and serialization', () => {
  it('does not mutate the input document', () => {
    const { document, a } = buildTree();
    const before = structuredClone(document);
    success(
      executeCommand(document, {
        type: 'block.editContent',
        blockId: a,
        content: textContent('changed'),
      }),
    );
    expect(document).toEqual(before);
  });

  it('round-trips the command-built tree through canonical JSON', () => {
    const { document } = buildTree();
    const parsed = parseDocumentJson(stringifyDocument(document));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.document).toEqual(document);
      expect(validateDocument(parsed.document).ok).toBe(true);
    }
  });

  it('rejects unknown command types and invalid placements', () => {
    const { document } = buildTree();
    const unknown = executeCommand(document, { type: 'future.command' } as unknown as DocumentCommand);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe('invalid-command');

    // The registry is a plain object; a prototype key must not resolve a handler.
    const prototypeKey = executeCommand(document, {
      type: 'constructor',
    } as unknown as DocumentCommand);
    expect(prototypeKey.ok).toBe(false);
    if (!prototypeKey.ok) expect(prototypeKey.code).toBe('invalid-command');

    const secondCreate = executeCommand(document, { type: 'document.create', title: 'Another' });
    expect(secondCreate.ok).toBe(false);
    if (!secondCreate.ok) expect(secondCreate.code).toBe('invalid-command');

    const placement = tryRun(document, {
      type: 'block.create',
      placement: { kind: 'top-level', chapterId: 'missing' },
    });
    expect(placement.ok).toBe(false);
    if (!placement.ok) expect(placement.code).toBe('not-found');
  });
});
