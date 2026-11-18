import { describe, expect, it } from 'vitest';
import type { ContentNode, NoteDocument } from '../src/index.js';
import {
  createEstimatedMeasurement,
  layoutDocument,
  pageGeometry,
  pageHasBlockingDefect,
  paginate,
} from '../src/index.js';
import { anchorViewFor, assertSegmentsAtomic,
  blockFragments,
  FIXTURE_PAGE_SETUP,
  loadFixture,
  paginateFixture,} from './helpers.js';

function tableRowFragments(pages: ReturnType<typeof paginateFixture>['pages'], layout: ReturnType<typeof paginateFixture>['layout']) {
  const failures: string[] = [];
  for (const block of layout.blocks) {
    for (const segment of block.measurement.segments) {
      if (segment.kind !== 'table-row' && segment.kind !== 'code-line') continue;
      const containing = blockFragments(pages, block.blockId).filter(
        (fragment) => fragment.startSegment <= segment.index && segment.index < fragment.endSegment,
      );
      if (containing.length !== 1) failures.push(`${block.blockId}:${segment.index}:${segment.kind}`);
    }
  }
  return failures;
}

describe('paginator', () => {
  it('produces at least 50 A4 pages for F2 and keeps every segment atomic', () => {
    const { document, layout, pages } = paginateFixture('long-50-pages.json', { setup: FIXTURE_PAGE_SETUP });
    expect(pages.pageCount).toBeGreaterThanOrEqual(50);
    expect(pages.pages.every((page) => page.fragments.length > 0)).toBe(true);
    expect(assertSegmentsAtomic(pages, layout)).toEqual([]);
    expect(tableRowFragments(pages, layout)).toEqual([]);
    expect(pageHasBlockingDefect(pages)).toBe(false);
    expect(layout.defects.map((defect) => defect.code).sort()).toEqual(['broken-anchor', 'missing-asset']);

    const tableBlock = layout.blocks.find((block) =>
      block.measurement.segments.some((segment) => segment.kind === 'table-row'),
    )!;
    expect(tableBlock).toBeDefined();
    expect(blockFragments(pages, tableBlock.blockId).length).toBeGreaterThanOrEqual(2);

    const codeBlock = layout.blocks.find(
      (block) => block.measurement.segments.filter((segment) => segment.kind === 'code-line').length >= 50,
    )!;
    expect(codeBlock).toBeDefined();
    expect(blockFragments(pages, codeBlock.blockId).length).toBeGreaterThanOrEqual(2);

    const incoming = pages.pages.flatMap((page) => page.continuationIn);
    const outgoing = pages.pages.flatMap((page) => page.continuationOut);
    expect(incoming.length).toBeGreaterThan(0);
    expect(incoming.length).toBe(outgoing.length);
    for (const record of incoming) {
      expect(outgoing.some((out) => out.blockId === record.blockId && out.toPage === record.toPage)).toBe(true);
    }

    const again = paginate(layout, document);
    expect(again.pages.map((page) => [page.yStart, page.yEnd].map((value) => value.toFixed(3)))).toEqual(
      pages.pages.map((page) => [page.yStart, page.yEnd].map((value) => value.toFixed(3))),
    );
  });

  it('splits F1 at code lines and honors the manual break before B4', () => {
    const { layout, pages } = paginateFixture('golden-eigenvalues.json', { setup: FIXTURE_PAGE_SETUP, manualBreakBeforeBlockIds: ['b4'] });
    expect(pages.pageCount).toBe(3);
    const b5 = layout.blockById['b5']!;
    const b5Fragments = blockFragments(pages, 'b5');
    expect(b5Fragments.length).toBeGreaterThanOrEqual(2);
    const b5CodeSegments = b5.measurement.segments.filter((segment) => segment.kind === 'code-line');
    expect(b5CodeSegments.length).toBeGreaterThan(10);
    for (const fragment of b5Fragments.filter((candidate) => !candidate.isFirst)) {
      const start = b5.measurement.segments[fragment.startSegment];
      expect(start?.kind).toBe('code-line');
    }
    const b4 = layout.blockById['b4']!;
    const b4Page = pages.pages.find((page) => page.fragments.some((fragment) => fragment.blockId === 'b4'))!;
    expect(b4Page.yStart).toBeCloseTo(b4.y, 6);
    expect(b4Page.fragments.find((fragment) => fragment.blockId === 'b4')!.isFirst).toBe(true);
    expect(pages.manualBreakWarnings).toEqual([]);
    const source = pages.pages.find((page) => page.pageNumber === 1)!;
    const target = pages.pages.find((page) => page.pageNumber === 2)!;
    expect(source.continuationOut.some((record) => record.blockId === 'b5')).toBe(true);
    expect(target.continuationIn.some((record) => record.blockId === 'b5')).toBe(true);
    expect(target.continuationIn[0]!.ghostParent.blockLabel).toBe('Computing eigenvalues');
  });

  it('reports the F6 too-tall row as a blocking defect without splitting it', () => {
    const { layout, pages } = paginateFixture('tables.json', { setup: FIXTURE_PAGE_SETUP });
    const defect = pages.defects.find((candidate) => candidate.code === 'too-tall-row')!;
    expect(defect).toBeDefined();
    expect(defect.blocksExport).toBe(true);
    expect(pageHasBlockingDefect(pages)).toBe(true);
    const giant = layout.blockById['f6-giant']!;
    const row = giant.measurement.segments.find((segment) => segment.kind === 'table-row' && segment.height > 1000)!;
    expect(row).toBeDefined();
    const containing = blockFragments(pages, 'f6-giant').filter(
      (fragment) => fragment.startSegment <= row.index && row.index < fragment.endSegment,
    );
    expect(containing).toHaveLength(1);
    const table = layout.blockById['f6-table']!;
    expect(blockFragments(pages, table.blockId).length).toBeGreaterThanOrEqual(2);
    expect(pages.pages.some((page) => page.overflow)).toBe(true);
    expect(assertSegmentsAtomic(pages, layout)).toEqual([]);
  });

  it('reports F8 defects and blocks export without clipping', () => {
    const { layout, pages } = paginateFixture('defects.json', { setup: FIXTURE_PAGE_SETUP, manualBreakBeforeBlockIds: ['does-not-exist', 'f8-orphan'] });
    const codes = new Set(pages.defects.map((defect) => defect.code));
    expect(codes.has('content-too-wide')).toBe(true);
    expect(codes.has('no-safe-break')).toBe(true);
    expect(codes.has('missing-asset')).toBe(true);
    expect(codes.has('impossible-hint')).toBe(true);
    expect(pageHasBlockingDefect(pages)).toBe(true);
    expect(pages.pages.some((page) => page.overflow)).toBe(true);
    expect(pages.pages.every((page) => page.fragments.length > 0)).toBe(true);
    expect(assertSegmentsAtomic(pages, layout)).toEqual([]);
    const longBlock = layout.blockById['f8-long']!;
    expect(longBlock.height).toBeGreaterThan(layout.geometry.contentHeightPx);
    const longFragment = blockFragments(pages, 'f8-long')[0]!;
    expect(longFragment.endSegment).toBe(longBlock.measurement.segments.length);
  });

  it('keeps broken anchor branches exported once', () => {
    const { layout, pages } = paginateFixture('broken-anchor.json', { setup: FIXTURE_PAGE_SETUP });
    expect(pages.pageCount).toBe(1);
    expect(layout.blocks.filter((block) => block.blockId === 'f9-b2')).toHaveLength(1);
    expect(layout.blocks.filter((block) => block.blockId === 'f9-b3')).toHaveLength(1);
    // Both records are broken in core: f9-a1 misses its quote, f9-a2 is bound
    // twice (duplicate binding). The old rect-count derivation called the
    // second one ambiguous; the index follows the core state.
    expect(layout.defects.map((defect) => defect.code).sort()).toEqual([
      'broken-anchor',
      'broken-anchor',
    ]);
    expect(pageHasBlockingDefect(pages)).toBe(false);
    expect(pages.pages[0]!.fragments.map((fragment) => fragment.blockId)).toContain('f9-b2');
    expect(pages.pages[0]!.fragments.map((fragment) => fragment.blockId)).toContain('f9-b3');
    expect(assertSegmentsAtomic(pages, layout)).toEqual([]);
  });


  it('starts every chapter on a new page at y=0', () => {
    const { document, pages } = paginateFixture('long-50-pages.json', { setup: FIXTURE_PAGE_SETUP });
    const chapterIds = new Set(document.chapters.map((chapter) => chapter.id));
    expect([...chapterIds].every((id) => pages.pages.some((page) => page.chapterId === id))).toBe(true);
    for (const chapter of document.chapters) {
      const chapterPages = pages.pages.filter((page) => page.chapterId === chapter.id);
      expect(chapterPages.length).toBeGreaterThan(0);
      expect(chapterPages[0]!.isChapterStart).toBe(true);
      expect(chapterPages[0]!.yStart).toBe(0);
      for (const page of chapterPages.slice(1)) expect(page.isChapterStart).toBe(false);
    }
  });

  it('paginates A4 landscape with a wider content area', () => {
    const document = loadFixture('landscape-golden.json');
    const setup = {
      size: 'A4' as const,
      orientation: 'landscape' as const,
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
    };
    const layout = layoutDocument(document, createEstimatedMeasurement(document), {}, setup, anchorViewFor(document));
    const pages = paginate(layout, document);
    const geometry = pageGeometry(setup);
    expect(geometry.pageWidthMm).toBe(297);
    expect(geometry.pageHeightMm).toBe(210);
    expect(geometry.contentWidthPx).toBeGreaterThan(geometry.contentHeightPx);
    expect(pages.pageCount).toBeGreaterThan(0);
    expect(pages.pages.every((page) => page.fragments.length > 0)).toBe(true);
    expect(assertSegmentsAtomic(pages, layout)).toEqual([]);
  });
});

/**
 * Manual break hints (`docs/design/manual-breaks.md`). The engine is not
 * changed: these are the three cut-model facts the control depends on.
 *
 * The fixture is the F11 shape: a short top-level block with a **right**
 * child, then a narrow-but-tall top-level block with its own right child.
 * A right child shares its parent's y, so a hint "before the child" is really
 * "before the parent" and the whole row moves.
 */
function manualBreakDocument(): NoteDocument {
  const paragraph = (value: string): ContentNode => ({
    type: 'doc',
    children: [{ type: 'paragraph', children: [{ type: 'text', text: value }] }],
  });
  const code = (): ContentNode => ({
    type: 'doc',
    children: [
      {
        type: 'codeBlock',
        attrs: {
          language: 'ts',
          text: Array.from({ length: 24 }, (_, index) => `x${index}`).join('\n'),
        },
      },
    ],
  });
  return {
    schemaVersion: 2,
    id: 'manual-breaks',
    title: 'Manual breaks',
    blocks: {
      root: { id: 'root', label: 'Root', content: paragraph('Root') },
      beside: { id: 'beside', label: 'Beside', content: paragraph('Beside') },
      tall: { id: 'tall', label: 'Tall', content: code() },
      'tall-child': { id: 'tall-child', label: 'Child', content: paragraph('Child') },
      tail: { id: 'tail', label: 'Tail', content: paragraph('Tail') },
      second: { id: 'second', label: 'Second', content: paragraph('Second') },
      'second-tall': { id: 'second-tall', label: 'Second tall', content: code() },
      'second-child': {
        id: 'second-child',
        label: 'Second child',
        content: paragraph('Second child'),
      },
    },
    anchors: {},
    branches: {
      'root-beside': {
        id: 'root-beside',
        source: { blockId: 'root' },
        targetBlockId: 'beside',
        role: 'primary',
        order: 'a',
      },
      'tall-child': {
        id: 'tall-child',
        source: { blockId: 'tall' },
        targetBlockId: 'tall-child',
        role: 'primary',
        order: 'a',
      },
      'second-child': {
        id: 'second-child',
        source: { blockId: 'second-tall' },
        targetBlockId: 'second-child',
        role: 'primary',
        order: 'a',
      },
    },
    chapters: [
      { id: 'chapter-1', title: 'One', topLevelBlockIds: ['root', 'tall', 'tail'] },
      { id: 'chapter-2', title: 'Two', topLevelBlockIds: ['second', 'second-tall'] },
    ],
    assets: {},
  } as NoteDocument;
}

function manualBreakRun(hints: string[] = []): {
  layout: ReturnType<typeof layoutDocument>;
  pages: ReturnType<typeof paginate>;
} {
  const document = manualBreakDocument();
  const layout = layoutDocument(
    document,
    createEstimatedMeasurement(document),
    {},
    FIXTURE_PAGE_SETUP,
      anchorViewFor(document),
  );
  return {
    layout,
    pages: paginate(layout, document, { manualBreakBeforeBlockIds: hints }),
  };
}

describe('manual break hints', () => {
  it('cuts before the parent when the hint is on a child placed beside it', () => {
    const base = manualBreakRun();
    const tall = base.layout.blockById['tall']!;
    const child = base.layout.blockById['tall-child']!;
    expect(child.placement).toBe('right');
    expect(child.y).toBeCloseTo(tall.y, 6);
    const basePage = base.pages.pages.find((page) =>
      page.fragments.some((fragment) => fragment.blockId === 'tall'),
    )!;
    expect(basePage.pageNumber).toBe(1);

    const hinted = manualBreakRun(['tall-child']);
    expect(hinted.pages.manualBreakWarnings).toEqual([]);
    // Page 1 now ends at the hinted row: the parent moved with the child.
    const first = hinted.pages.pages[0]!;
    expect(first.fragments.map((fragment) => fragment.blockId).sort()).toEqual([
      'beside',
      'root',
    ]);
    expect(first.fragments.some((fragment) => fragment.blockId === 'tall')).toBe(false);
    const second = hinted.pages.pages[1]!;
    expect(second.yStart).toBeCloseTo(tall.y, 6);
    const fragment = second.fragments.find((candidate) => candidate.blockId === 'tall')!;
    expect(fragment.isFirst).toBe(true);
    expect(hinted.pages.pages.some((page) => page.fragments.some((item) => item.blockId === 'tall-child'))).toBe(true);
  });

  it('accepts a hint at y = 0 without a page or a warning', () => {
    const base = manualBreakRun();
    const hinted = manualBreakRun(['root']);
    expect(hinted.pages.pageCount).toBe(base.pages.pageCount);
    expect(hinted.pages.pages.map((page) => page.yStart)).toEqual(
      base.pages.pages.map((page) => page.yStart),
    );
    expect(hinted.pages.manualBreakWarnings).toEqual([]);
    expect(hinted.pages.defects.some((defect) => defect.code === 'impossible-hint')).toBe(false);
  });

  it('ignores a hint owned by another chapter while paginating this one', () => {
    const hinted = manualBreakRun(['second-child']);
    const baseOnly = manualBreakRun();
    // Chapter 1 is untouched by the foreign hint: no cut, no warning.
    const chapterOne = (pages: ReturnType<typeof paginate>): number[] =>
      pages.pages
        .filter((page) => page.chapterId === 'chapter-1')
        .map((page) => Math.round(page.yStart));
    expect(chapterOne(hinted.pages)).toEqual(chapterOne(baseOnly.pages));
    expect(hinted.pages.manualBreakWarnings).toEqual([]);
    // The hint is honoured inside its own chapter, before the parent whose row
    // the child shares; it never creates a page in chapter 1.
    const secondTall = hinted.layout.blockById['second-tall']!;
    const chapterTwo = hinted.pages.pages.filter((page) => page.chapterId === 'chapter-2');
    expect(chapterTwo[0]!.yStart).toBe(0);
    expect(chapterTwo.some((page) => Math.abs(page.yStart - secondTall.y) < 0.25)).toBe(true);
  });
});
