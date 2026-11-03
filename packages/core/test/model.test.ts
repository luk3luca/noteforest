import { describe, expect, it } from 'vitest';
import { createDocument, createContentBlock } from '../src/document.js';
import { emptyContent } from '../src/types.js';
import {
  isLegalMove,
  executeCommand,
} from '../src/commands.js';
import {
  isValidOrderKey,
  orderBetween,
  orderKeysAfter,
  orderKeysBetween,
} from '../src/fractional-order.js';
import {
  directChildIds,
  findTopLevelPlacement,
  primaryParentBranch,
  subtreeBlockIds,
} from '../src/structure.js';
import { parseDocumentJson, stringifyDocument } from '../src/serialize.js';
import { validateDocument } from '../src/validation.js';
import type { Document } from '../src/types.js';
import {
  addChild,
  addTopLevel,
  deterministicContext,
  directChildren,
  newDocument,
  run,
  textContent,
} from './helpers.js';

function documentWithTree() {
  const context = deterministicContext();
  let document = newDocument(context);
  const createdA = addTopLevel(document, 'A', context);
  document = createdA.document;
  const createdB = addTopLevel(document, 'B', context);
  document = createdB.document;
  const child = addChild(document, createdA.blockId, 'A1', context);
  document = child.document;
  return {
    context,
    document,
    chapterId: document.chapters[0]?.id ?? '',
    a: createdA.blockId,
    b: createdB.blockId,
    a1: child.blockId,
    branchA1: child.branchId,
  };
}

describe('document factory', () => {
  it('creates a valid A4 portrait document with one chapter and revision 0', () => {
    const context = deterministicContext();
    const document = createDocument({ title: 'Linear algebra' }, context);
    expect(document.schemaVersion).toBe(1);
    expect(document.title).toBe('Linear algebra');
    expect(document.revision).toBe(0);
    expect(document.createdAt).toBe(document.updatedAt);
    expect(document.pageSetup).toEqual({
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    });
    expect(document.chapters).toHaveLength(1);
    expect(document.chapters[0]?.topLevelBlockIds).toEqual([]);
    expect(document.blocks).toEqual({});
    expect(document.anchors).toEqual({});
    expect(document.branches).toEqual({});
    expect(document.assets).toEqual({});
    expect(document.annotations).toEqual([]);
    expect(validateDocument(document).ok).toBe(true);
  });

  it('generates distinct UUIDs and honours page setup overrides', () => {
    const first = createDocument({ title: 'One' });
    const second = createDocument({ title: 'Two' });
    expect(first.id).not.toBe(second.id);
    expect(first.chapters[0]?.id).not.toBe(second.chapters[0]?.id);

    const landscape = createDocument(
      { pageSetup: { orientation: 'landscape', margins: { top: 10, left: 12 } } },
      deterministicContext(),
    );
    expect(landscape.pageSetup.orientation).toBe('landscape');
    expect(landscape.pageSetup.margins).toEqual({ top: 10, right: 20, bottom: 20, left: 12 });
    expect(validateDocument(landscape).ok).toBe(true);
  });

  it('rejects invalid page margins at creation', () => {
    expect(() => createDocument({ pageSetup: { margins: { top: -1 } } })).toThrow(RangeError);
    expect(() =>
      createDocument({ pageSetup: { margins: { left: 120, right: 120 } } }),
    ).toThrow(RangeError);
  });

  it('creates an empty content block without sharing the default object', () => {
    const first = createContentBlock({ id: 'b1' });
    const second = createContentBlock({ id: 'b2' });
    expect(first.content).toEqual(emptyContent());
    expect(first.content).not.toBe(second.content);
    first.content.children?.push({ type: 'paragraph' });
    expect(second.content.children).toEqual([]);
  });
});

describe('fractional order keys', () => {
  it('appends keys that sort lexicographically and stay valid', () => {
    let previous = orderBetween(null, null);
    const keys = [previous];
    for (let index = 0; index < 300; index += 1) {
      const next = orderBetween(previous, null);
      expect(isValidOrderKey(next)).toBe(true);
      expect(next > previous).toBe(true);
      keys.push(next);
      previous = next;
    }
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('inserts strictly between adjacent keys repeatedly', () => {
    let low = orderBetween(null, null);
    let high = orderBetween(low, null);
    for (let index = 0; index < 100; index += 1) {
      const middle = orderBetween(low, high);
      expect(middle > low).toBe(true);
      expect(middle < high).toBe(true);
      if (index % 2 === 0) low = middle;
      else high = middle;
    }
  });

  it('generates a run of keys strictly inside a gap', () => {
    const keys = orderKeysBetween('a', 'z', 20);
    expect(keys).toHaveLength(20);
    expect(new Set(keys).size).toBe(20);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index] ?? '';
      expect(key > 'a').toBe(true);
      expect(key < 'z').toBe(true);
      if (index > 0) expect(key > (keys[index - 1] ?? '')).toBe(true);
    }
    const appended = orderKeysAfter('m', 10);
    expect(appended[0]).toBeDefined();
    for (let index = 1; index < appended.length; index += 1) {
      expect((appended[index] ?? '') > (appended[index - 1] ?? '')).toBe(true);
    }
  });

  it('rejects an inverted interval', () => {
    expect(() => orderBetween('z', 'a')).toThrow();
    expect(() => orderBetween('m', 'm')).toThrow();
  });
});

describe('validation invariants', () => {
  it('accepts a well-formed document with primary branches', () => {
    const { document } = documentWithTree();
    const report = validateDocument(document);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats.blocks).toBe(3);
    expect(report.stats.branches).toBe(1);
  });

  it('rejects duplicate IDs across entities', () => {
    const { document, a } = documentWithTree();
    const invalid = structuredClone(document);
    const chapter = invalid.chapters[0];
    if (chapter !== undefined) chapter.id = a;
    const report = validateDocument(invalid);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'duplicate-id')).toBe(true);
  });

  it('rejects a dangling primary parent', () => {
    const { document, a } = documentWithTree();
    const invalid = structuredClone(document);
    invalid.branches['dangling'] = {
      id: 'dangling',
      source: { blockId: 'missing-block' },
      targetBlockId: a,
      role: 'primary',
      order: 'a',
    };
    // Remove the top-level slot so the target is meant to be a child.
    const chapter = invalid.chapters[0];
    if (chapter !== undefined) chapter.topLevelBlockIds = chapter.topLevelBlockIds.filter((id) => id !== a);
    const report = validateDocument(invalid);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'dangling-source')).toBe(true);
  });

  it('rejects a dangling primary target', () => {
    const { document, a } = documentWithTree();
    const invalid = structuredClone(document);
    invalid.branches['dangling-target'] = {
      id: 'dangling-target',
      source: { blockId: a },
      targetBlockId: 'missing-target',
      role: 'primary',
      order: 'z',
    };
    const report = validateDocument(invalid);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'dangling-target')).toBe(true);
  });

  it('rejects a primary cycle', () => {
    const { document, a, b } = documentWithTree();
    const invalid = structuredClone(document);
    const chapter = invalid.chapters[0];
    if (chapter !== undefined) chapter.topLevelBlockIds = [];
    delete invalid.branches[Object.keys(invalid.branches)[0] ?? 'missing'];
    invalid.branches['cycle-ab'] = {
      id: 'cycle-ab',
      source: { blockId: a },
      targetBlockId: b,
      role: 'primary',
      order: 'a',
    };
    invalid.branches['cycle-ba'] = {
      id: 'cycle-ba',
      source: { blockId: b },
      targetBlockId: a,
      role: 'primary',
      order: 'a',
    };
    const report = validateDocument(invalid);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'primary-cycle')).toBe(true);
  });

  it('rejects a block that appears in two chapters', () => {
    const { document, a } = documentWithTree();
    const invalid = structuredClone(document);
    invalid.chapters.push({
      id: 'chapter-2',
      title: 'Second',
      topLevelBlockIds: [a],
    });
    const report = validateDocument(invalid);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'block-in-two-chapters')).toBe(true);
  });

  it('rejects two primary parents for one block', () => {
    const { document, a, b, a1 } = documentWithTree();
    const invalid = structuredClone(document);
    invalid.branches['second-parent'] = {
      id: 'second-parent',
      source: { blockId: b },
      targetBlockId: a1,
      role: 'primary',
      order: 'b',
    };
    const report = validateDocument(invalid);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'multiple-primary-parents')).toBe(true);
    void a;
  });

  it('rejects a top-level block that also has a primary parent', () => {
    const { document, a, a1 } = documentWithTree();
    const invalid = structuredClone(document);
    const chapter = invalid.chapters[0];
    if (chapter !== undefined) chapter.topLevelBlockIds.push(a1);
    const report = validateDocument(invalid);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'top-level-block-has-parent')).toBe(true);
    void a;
  });

  it('rejects a root that is not assigned to a chapter', () => {
    const { document, a } = documentWithTree();
    const invalid = structuredClone(document);
    const chapter = invalid.chapters[0];
    if (chapter !== undefined) chapter.topLevelBlockIds = chapter.topLevelBlockIds.filter((id) => id !== a);
    const report = validateDocument(invalid);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'unassigned-block')).toBe(true);
  });

  it('rejects invalid page setup and content', () => {
    const { document, a } = documentWithTree();
    const invalid = structuredClone(document);
    invalid.pageSetup.margins.top = -4;
    const block = invalid.blocks[a];
    if (block !== undefined) {
      (block as unknown as { content: unknown }).content = 'not a node';
    }
    const report = validateDocument(invalid);
    expect(report.ok).toBe(false);
    expect(report.errors.some((issue) => issue.code === 'invalid-page-setup')).toBe(true);
    expect(report.errors.some((issue) => issue.code === 'invalid-content')).toBe(true);
  });

  it('warns on bad manual break hints without failing the document', () => {
    const { document } = documentWithTree();
    const invalid = structuredClone(document);
    invalid.manualBreakBeforeBlockIds = ['missing', 'missing'];
    const report = validateDocument(invalid);
    expect(report.ok).toBe(true);
    expect(report.warnings.filter((issue) => issue.code === 'invalid-break-hint')).toHaveLength(2);
  });
});

describe('unknown data preservation', () => {
  it('preserves unknown fields and unknown content nodes across a JSON round-trip', () => {
    const { document, a } = documentWithTree();
    const decorated = structuredClone(document) as Document & Record<string, unknown>;
    decorated['futureTopLevel'] = { enabled: true };
    decorated.pageSetup['futurePage'] = 'x';
    const chapter = decorated.chapters[0];
    if (chapter === undefined) throw new Error('missing chapter');
    chapter['futureChapter'] = 7;
    const block = decorated.blocks[a];
    if (block === undefined) throw new Error('missing block');
    block['futureBlock'] = { nested: ['a', 1] };
    block.content.children = [
      ...(block.content.children ?? []),
      {
        type: 'futureNode',
        attrs: { answer: 42 },
        children: [{ type: 'futureLeaf', text: 'future text' }],
      },
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            text: 'styled',
            marks: [{ type: 'futureMark', attrs: { tone: 'warm' } }],
          },
        ],
      },
    ];

    const json = stringifyDocument(decorated);
    const parsed = parseDocumentJson(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document).toEqual(decorated);
    expect(parsed.document['futureTopLevel']).toEqual({ enabled: true });
    const parsedBlock = parsed.document.blocks[a];
    expect(parsedBlock?.content.children?.[1]).toEqual({
      type: 'futureNode',
      attrs: { answer: 42 },
      children: [{ type: 'futureLeaf', text: 'future text' }],
    });
    const second = parseDocumentJson(stringifyDocument(parsed.document));
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.document).toEqual(parsed.document);
  });

  it('preserves unknown fields when a command mutates the document', () => {
    const { document, a } = documentWithTree();
    const decorated = structuredClone(document);
    decorated['futureTopLevel'] = 'keep me';
    const block = decorated.blocks[a];
    if (block !== undefined) block['futureBlockField'] = [1, 2, 3];
    const renamed = run(decorated, { type: 'document.rename', title: 'Renamed' });
    expect(renamed.document['futureTopLevel']).toBe('keep me');
    expect(renamed.document.blocks[a]?.['futureBlockField']).toEqual([1, 2, 3]);
  });
});

describe('structure helpers', () => {
  it('reports placements, parents, and subtrees', () => {
    const { document, a, b, a1 } = documentWithTree();
    expect(findTopLevelPlacement(document, a)?.chapterId).toBe(document.chapters[0]?.id);
    expect(findTopLevelPlacement(document, a1)).toBeNull();
    expect(primaryParentBranch(document, a1)?.source.blockId).toBe(a);
    expect(primaryParentBranch(document, a)).toBeUndefined();
    expect(directChildIds(document, a)).toEqual([a1]);
    expect(directChildren(document, a)).toEqual([a1]);
    expect(subtreeBlockIds(document, a).sort()).toEqual([a, a1].sort());
    expect(subtreeBlockIds(document, b)).toEqual([b]);
  });

  it('checks legal moves without mutating', () => {
    const { document, a, a1, b } = documentWithTree();
    expect(isLegalMove(document, a, { kind: 'child', parentBlockId: a1 })).toBe(false);
    expect(isLegalMove(document, a, { kind: 'child', parentBlockId: b })).toBe(true);
    expect(isLegalMove(document, a, { kind: 'sibling', siblingBlockId: a1 })).toBe(false);
    expect(isLegalMove(document, a, { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' })).toBe(true);
    expect(executeCommand(document, { type: 'document.rename', title: 'x' }).ok).toBe(true);
    expect(document.title).toBe('Test document');
  });
});
