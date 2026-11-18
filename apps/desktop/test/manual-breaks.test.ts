import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Document } from '@noteforest/core';
import type { ContinuousLayout } from '@noteforest/layout';
import {
  createEstimatedMeasurement,
  layoutDocument,
  DEFAULT_PAGE_SETTINGS,
} from '@noteforest/layout';
import {
  continuousRowLeaderIds,
  manualBreakMenuState,
  manualBreakPageNumber,
  manualBreakRows,
  manualBreakWarningsById,
  pageRowLeaderIds,
  pruneManualBreakIds,
  withManualBreakIds,
  MANUAL_BREAK_CHAPTER_REASON,
  MANUAL_BREAK_NOTE_REASON,
  MANUAL_BREAK_ROW_REASON,
} from '../src/renderer/src/lib/manual-breaks';
import {
  pageOverrideFor,
  resetSettingsForTests,
  useSettingsStore,
} from '../src/renderer/src/state/settings';
import { DocumentRuntime } from '../src/renderer/src/state/runtime';
import { createInMemoryDocumentGateway } from '../src/renderer/src/state/memory-document-gateway';

import { anchorViewForDocument } from './layout-view.js';
/**
 * MB1 manual breaks (`docs/design/manual-breaks.md`).
 *
 * Three units under test: the row-leader rule (page layout and the Continuous
 * measured placement), the menu state precedence, and the cleanup that keeps a
 * hint from outliving its block. The paginator itself is not changed; its three
 * new cases live in `packages/layout/test/pagination.test.ts`.
 */

function text(value: string): Document['blocks'][string]['content'] {
  return {
    type: 'doc',
    children: [{ type: 'paragraph', children: [{ type: 'text', text: value }] }],
  };
}

interface DocOptions {
  /** Extra top-level blocks after `a` (which always starts the chapter). */
  extraBlocks?: string[];
  /** `b` is a primary child of `a`. */
  child?: boolean;
  /** `b` is an anchored callout inside `a`. */
  callout?: boolean;
  /** A second chapter with its own first block `z`. */
  secondChapter?: boolean;
}

function makeDocument(options: DocOptions = {}): Document {
  const blocks: Document['blocks'] = {
    a: { id: 'a', label: 'Alpha', content: text('Alpha') },
  };
  if (options.child === true || options.callout === true) {
    blocks['b'] = { id: 'b', label: 'Beta', content: text('Beta') };
  }
  if (options.secondChapter === true) {
    blocks['z'] = { id: 'z', label: 'Zeta', content: text('Zeta') };
  }
  const branches: Document['branches'] = {};
  if (options.child === true || options.callout === true) {
    branches['branch-ab'] = {
      id: 'branch-ab',
      source: {
        blockId: 'a',
        ...(options.callout === true ? { anchorId: 'anchor-alpha' } : {}),
      },
      targetBlockId: 'b',
      role: 'primary',
      order: 'a',
    };
  }
  for (const id of options.extraBlocks ?? []) {
    blocks[id] = { id, label: id.toUpperCase(), content: text(`Block ${id}`) };
  }
  return {
    schemaVersion: 2,
    id: 'manual-breaks-doc',
    title: 'Manual breaks',
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    revision: 1,
    chapters: [
      {
        id: 'chapter-1',
        title: 'One',
        topLevelBlockIds: ['a', ...(options.extraBlocks ?? [])],
      },
      ...(options.secondChapter === true
        ? [{ id: 'chapter-2', title: 'Two', topLevelBlockIds: ['z'] }]
        : []),
    ],    blocks,
    anchors:
      options.callout === true
        ? {
            'anchor-alpha': {
              id: 'anchor-alpha',
              blockId: 'a',
              kind: 'text',
              selector: { kind: 'text', quote: 'Alpha' },
              quote: 'Alpha',
            },
          }
        : {},
    branches,
    assets: {},
  };
}

const PAGE_SETUP = {
  size: 'A4' as const,
  orientation: 'portrait' as const,
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
};

/** A measured page layout with no manual hint: the row-leader oracle. */
function measure(document: Document): ContinuousLayout {
  return layoutDocument(
    document,
    createEstimatedMeasurement(document),
    {},
    PAGE_SETUP,
      anchorViewForDocument(document),
  );
}

describe('manual break menu state', () => {
  const document = makeDocument({ extraBlocks: ['c'], child: true });

  it('blocks the first block of the note before anything else', () => {
    expect(
      manualBreakMenuState({
        blockId: 'a',
        document,
        rowLeader: true,
        stored: [],
      }),
    ).toEqual({ disabled: true, checked: false, reason: MANUAL_BREAK_NOTE_REASON });
  });

  it('blocks the first block of a later chapter with the chapter reason', () => {
    const twoChapters = makeDocument({ secondChapter: true });
    expect(
      manualBreakMenuState({
        blockId: 'z',
        document: twoChapters,
        rowLeader: true,
        stored: [],
      }),
    ).toEqual({ disabled: true, checked: false, reason: MANUAL_BREAK_CHAPTER_REASON });
  });

  it('blocks a block that does not start its row with the row reason', () => {
    expect(
      manualBreakMenuState({
        blockId: 'b',
        document,
        rowLeader: false,
        stored: [],
      }),
    ).toEqual({ disabled: true, checked: false, reason: MANUAL_BREAK_ROW_REASON });
  });

  it('enables a row leader and reflects the stored hint', () => {
    expect(
      manualBreakMenuState({ blockId: 'c', document, rowLeader: true, stored: [] }),
    ).toEqual({ disabled: false, checked: false, reason: null });
    expect(
      manualBreakMenuState({
        blockId: 'c',
        document,
        rowLeader: true,
        stored: ['a', 'c'],
      }),
    ).toEqual({ disabled: false, checked: true, reason: null });
  });
});

describe('manual break row leaders', () => {
  it('keeps the parent and drops the child placed beside it', () => {
    const document = makeDocument({ child: true });
    const layout = measure(document);
    const child = layout.blockById['b']!;
    const parent = layout.blockById['a']!;
    // The fixture is the F11 shape: the child shares the parent's y.
    expect(child.placement).toBe('right');
    expect(child.y).toBeCloseTo(parent.y, 6);
    const leaders = pageRowLeaderIds(layout);
    expect(leaders.has('a')).toBe(true);
    expect(leaders.has('b')).toBe(false);
  });

  it('keeps a wrapped (below) child as a row leader', () => {
    const document = makeDocument({ child: true });
    const layout = measure(document);
    const child = layout.blockById['b']!;
    if (child.placement === 'right') {
      // Force the below shape the way the layout does: move the child down.
      child.y = layout.blockById['a']!.y + layout.blockById['a']!.height;
      child.x = layout.blockById['a']!.x;
    }
    const leaders = pageRowLeaderIds(layout);
    expect(leaders.has('b')).toBe(true);
  });

  it('drops a mode A callout that sits in the parent right lane (F11)', () => {
    const document = makeDocument({ callout: true });
    // Mode A needs a direct child group as well as the callout.
    document.blocks['c'] = { id: 'c', label: 'Gamma', content: text('Gamma') };
    document.branches['branch-ac'] = {
      id: 'branch-ac',
      source: { blockId: 'a' },
      targetBlockId: 'c',
      role: 'primary',
      order: 'b',
    };
    const layout = layoutDocument(
      document,
      createEstimatedMeasurement(document),
      { calloutModes: true, pagePacking: 'beside' },
      {
        size: 'A4',
        orientation: 'landscape',
        margins: { top: 10, right: 10, bottom: 10, left: 10 },
      },
        anchorViewForDocument(document),
    );
    const callout = layout.blockById['b']!;
    const parent = layout.blockById['a']!;
    // The layout reports the callout in the parent's right lane, on its y.
    expect(callout.placement).toBe('right');
    expect(callout.y).toBeCloseTo(parent.y, 6);
    expect(callout.x).toBeGreaterThan(parent.x);
    const leaders = pageRowLeaderIds(layout);
    expect(leaders.has('a')).toBe(true);
    expect(leaders.has('b')).toBe(false);
  });

  it('never offers the item on a callout in Continuous (F11)', () => {
    const document = makeDocument({ callout: true });
    const leaders = continuousRowLeaderIds({
      topLevelIds: new Set(['a']),
      calloutIds: new Set(['b']),
      belowIds: new Set(['b']),
    });
    expect([...leaders]).toEqual(['a']);
    expect(leaders.has('b')).toBe(false);
  });

  it('offers a measured-below direct child and every top-level block', () => {
    const leaders = continuousRowLeaderIds({
      topLevelIds: new Set(['a', 'c']),
      calloutIds: new Set(['callout']),
      belowIds: new Set(['b', 'callout']),
    });
    expect([...leaders].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('manual break cleanup', () => {
  it('drops missing ids, keeps an existing non-leader, and dedupes', () => {
    expect(
      pruneManualBreakIds(['a', 'gone', 'a', '', 'c'], new Set(['a', 'b', 'c'])),
    ).toEqual(['a', 'c']);
  });

  it('is a no-op for a clean list', () => {
    const ids = ['a', 'b'];
    expect(pruneManualBreakIds(ids, new Set(['a', 'b', 'c']))).toEqual(ids);
  });

  it('writes the list without keeping an empty override behind', () => {
    expect(withManualBreakIds(undefined, ['a'])).toEqual({
      manualBreakBeforeBlockIds: ['a'],
    });
    expect(
      withManualBreakIds({ manualBreakBeforeBlockIds: ['a'], setup: { size: 'A5' } }, ['b']),
    ).toEqual({ setup: { size: 'A5' }, manualBreakBeforeBlockIds: ['b'] });
    // Removing the last hint drops the field; unrelated settings survive.
    expect(withManualBreakIds({ manualBreakBeforeBlockIds: ['a'] }, [])).toBeUndefined();
    expect(
      withManualBreakIds({ manualBreakBeforeBlockIds: ['a'], setup: { size: 'A5' } }, []),
    ).toEqual({ setup: { size: 'A5' } });
  });
});

describe('manual break rows', () => {
  const document = makeDocument({ extraBlocks: ['c'], child: true });
  const titleOf = (blockId: string): string => document.blocks[blockId]?.label ?? blockId;
  const pages = [
    {
      pageNumber: 1,
      fragments: [
        { blockId: 'a' },
        { blockId: 'b' },
        { blockId: 'c' },
      ],
    },
  ] as unknown as Parameters<typeof manualBreakRows>[0]['pages'];

  it('lists stored hints in document order with their page', () => {
    const rows = manualBreakRows({
      document,
      ids: ['c', 'a'],
      pages,
      warnings: [],
      rowLeaders: new Set(['a', 'c']),
      titleOf,
    });
    expect(rows.map((row) => row.blockId)).toEqual(['a', 'c']);
    expect(rows.map((row) => row.pageNumber)).toEqual([1, 1]);
    expect(rows.every((row) => row.broken === false)).toBe(true);
  });

  it('marks a paginator refusal and keeps the message for the row title', () => {
    const rows = manualBreakRows({
      document,
      ids: ['a', 'c'],
      pages,
      warnings: [
        {
          code: 'impossible-hint',
          severity: 'warning',
          message: 'Manual break hint before block c cannot be honored.',
          blockId: 'c',
          blocksExport: false,
        },
      ],
      rowLeaders: new Set(['a', 'c']),
      titleOf,
    });
    const broken = rows.find((row) => row.blockId === 'c')!;
    expect(broken.broken).toBe(true);
    expect(broken.message).toBe('Manual break hint before block c cannot be honored.');
    expect(rows.find((row) => row.blockId === 'a')!.broken).toBe(false);
  });

  it('keeps a hint whose block stopped leading its row and explains why', () => {
    const rows = manualBreakRows({
      document,
      ids: ['b'],
      pages,
      warnings: [],
      rowLeaders: new Set(['a']),
      titleOf,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.broken).toBe(true);
    expect(rows[0]!.message).toBe(MANUAL_BREAK_ROW_REASON);
    expect(rows[0]!.pageNumber).toBe(1);
  });

  it('ignores a missing block and non-hint warnings', () => {
    expect(
      manualBreakRows({
        document,
        ids: ['gone'],
        pages,
        warnings: [],
        rowLeaders: new Set(),
        titleOf,
      }),
    ).toEqual([]);
    const warnings = manualBreakWarningsById([
      {
        code: 'no-safe-break',
        severity: 'blocking',
        message: 'ignored',
        blocksExport: true,
      },
    ]);
    expect(warnings.size).toBe(0);
  });

  it('reads the page of the first fragment of a block', () => {
    const twoPages = [
      { pageNumber: 1, fragments: [{ blockId: 'a' }] },
      { pageNumber: 2, fragments: [{ blockId: 'c' }] },
    ] as unknown as Parameters<typeof manualBreakRows>[0]['pages'];
    expect(manualBreakPageNumber(twoPages, 'c')).toBe(2);
    expect(manualBreakPageNumber(twoPages, 'missing')).toBeNull();
  });
});

/**
 * The prune is a renderer write, not a document edit: the override is outside
 * `document.json` and outside the undo stack, so it is recomputed from the
 * current document after each structural commit.
 */
describe('manual break override cleanup on structural commits', () => {
  const packagePath = '/tmp/noteforest-manual-breaks/doc';

  function runtimeFor(document: Document): DocumentRuntime {
    const memory = createInMemoryDocumentGateway({ packagePath, document });
    return new DocumentRuntime(
      { packagePath, document, status: 'editable', errors: [], warnings: [] },
      [],
      null,
      memory.gateway,
    );
  }

  function storedIds(documentId: string | null): string[] | undefined {
    return pageOverrideFor(useSettingsStore.getState(), packagePath, documentId)
      ?.manualBreakBeforeBlockIds as string[] | undefined;
  }

  beforeEach(() => {
    resetSettingsForTests();
    useSettingsStore.getState().initialize({ settings: {}, documentSettings: [] });
  });

  afterEach(() => {
    resetSettingsForTests();
  });

  it('drops the hint of a deleted subtree and keeps the parent hint', async () => {
    const document = makeDocument({ child: true });
    // A grandchild makes the delete a real subtree removal.
    document.blocks['bb'] = {
      id: 'bb',
      label: 'Beta child',
      content: text('Beta child'),
    };
    document.branches['branch-bb'] = {
      id: 'branch-bb',
      source: { blockId: 'b' },
      targetBlockId: 'bb',
      role: 'primary',
      order: 'a',
    };
    const runtime = runtimeFor(document);
    const documentId = runtime.document.id;
    useSettingsStore.getState().setPageSettingsOverride(
      packagePath,
      { manualBreakBeforeBlockIds: ['a', 'b', 'bb'] },
      documentId,
    );

    const deleted = await runtime.applyStructural({
      type: 'block.delete',
      blockId: 'b',
      children: 'delete-subtree',
    });
    expect(deleted.ok).toBe(true);
    expect(runtime.document.blocks['b']).toBeUndefined();
    expect(runtime.document.blocks['bb']).toBeUndefined();
    expect(storedIds(documentId)).toEqual(['a']);
    runtime.dispose();
  });

  it('keeps the hint on the original block after a split', async () => {
    const document = makeDocument({ extraBlocks: ['c'] });
    document.blocks['a']!.content = text('AlphaBeta');
    const runtime = runtimeFor(document);
    const documentId = runtime.document.id;
    useSettingsStore
      .getState()
      .setPageSettingsOverride(packagePath, { manualBreakBeforeBlockIds: ['a'] }, documentId);

    const split = await runtime.applyStructural({
      type: 'block.split',
      blockId: 'a',
      at: { nodePath: [0, 0], offset: 5 },
      newBlockId: 'a2',
    });
    expect(split.ok).toBe(true);
    expect(runtime.document.blocks['a2']).toBeDefined();
    expect(storedIds(documentId)).toEqual(['a']);
    runtime.dispose();
  });

  it('keeps the surviving hint and drops the absorbed one after a merge', async () => {
    const document = makeDocument({ extraBlocks: ['c'] });
    document.blocks['a']!.content = text('Alpha');
    document.blocks['c']!.content = text('Gamma');
    const runtime = runtimeFor(document);
    const documentId = runtime.document.id;
    useSettingsStore.getState().setPageSettingsOverride(
      packagePath,
      { manualBreakBeforeBlockIds: ['a', 'c'] },
      documentId,
    );

    const merged = await runtime.applyStructural({
      type: 'block.merge',
      blockId: 'c',
      intoBlockId: 'a',
    });
    expect(merged.ok).toBe(true);
    expect(runtime.document.blocks['c']).toBeUndefined();
    expect(storedIds(documentId)).toEqual(['a']);
    runtime.dispose();
  });

  it('keeps a hint whose block exists but no longer leads a row', async () => {
    const runtime = runtimeFor(makeDocument({ child: true }));
    const documentId = runtime.document.id;
    useSettingsStore
      .getState()
      .setPageSettingsOverride(packagePath, { manualBreakBeforeBlockIds: ['b'] }, documentId);

    // Renaming changes the document but not which blocks exist.
    const renamed = await runtime.applyStructural({
      type: 'block.rename',
      blockId: 'b',
      label: 'Renamed child',
    });
    expect(renamed.ok).toBe(true);
    expect(storedIds(documentId)).toEqual(['b']);
    runtime.dispose();
  });

  it('repairs a stale id from a document written by an older build', async () => {
    const runtime = runtimeFor(makeDocument({ extraBlocks: ['c'] }));
    const documentId = runtime.document.id;
    useSettingsStore
      .getState()
      .setPageSettingsOverride(
        packagePath,
        { manualBreakBeforeBlockIds: ['missing', 'c'] },
        documentId,
      );
    runtime.pruneManualBreaks();
    expect(storedIds(documentId)).toEqual(['c']);
    runtime.dispose();
  });

  it('never writes the global page-settings default', () => {
    expect(useSettingsStore.getState().app.page.manualBreakBeforeBlockIds).toEqual([]);
    expect(DEFAULT_PAGE_SETTINGS.manualBreakBeforeBlockIds).toEqual([]);
  });
});
