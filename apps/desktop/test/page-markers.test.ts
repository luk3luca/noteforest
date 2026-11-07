import { describe, expect, it } from 'vitest';
import type { DerivedPage, PageFragment } from '@noteforest/layout';
import {
  continuationLabel,
  derivePageBreakMarkers,
  pageStartLabel,
} from '../src/renderer/src/page/page-markers';

function fragment(overrides: Partial<PageFragment> & Pick<PageFragment, 'blockId'>): PageFragment {
  return {
    chapterId: 'chapter-1',
    role: 'top-level',
    depth: 0,
    source: { x: 0, y: 0, width: 200, height: 100 },
    page: { x: 0, y: 0, width: 200, height: 100 },
    startSegment: 0,
    endSegment: 1,
    isFirst: true,
    isLast: true,
    isPageStart: false,
    continuesToPage: null,
    continuedFromPage: null,
    ...overrides,
  };
}

function page(pageNumber: number, fragments: PageFragment[]): DerivedPage {
  return {
    pageNumber,
    chapterId: 'chapter-1',
    chapterIndex: 0,
    chapterTitle: 'Chapter',
    yStart: (pageNumber - 1) * 900,
    yEnd: pageNumber * 900,
    isChapterStart: pageNumber === 1,
    fragments,
    continuationOut: [],
    continuationIn: [],
    overflow: false,
  };
}

describe('continuous page-break marker derivation', () => {
  it('derives one page-start marker per page even when two blocks start the page', () => {
    const markers = derivePageBreakMarkers([
      page(1, [
        fragment({ blockId: 'a', isPageStart: true }),
        fragment({
          blockId: 'b',
          isPageStart: true,
          page: { x: 240, y: 0, width: 200, height: 100 },
        }),
      ]),
      page(2, [
        fragment({
          blockId: 'c',
          isPageStart: true,
          source: { x: 0, y: 900, width: 200, height: 100 },
          page: { x: 0, y: 0, width: 200, height: 100 },
        }),
      ]),
    ]);

    expect(markers.pageStarts).toEqual([
      { kind: 'page-start', blockId: 'a', pageNumber: 1 },
      { kind: 'page-start', blockId: 'c', pageNumber: 2 },
    ]);
    expect(markers.continuations).toEqual([]);
    expect(markers.count).toBe(2);
  });

  it('has no page-start marker when a page begins inside a long block', () => {
    const markers = derivePageBreakMarkers([
      page(1, [
        fragment({ blockId: 'long', isPageStart: true, isLast: false, continuesToPage: 2 }),
      ]),
      page(2, [
        fragment({
          blockId: 'long',
          isFirst: false,
          isPageStart: true,
          continuedFromPage: 1,
          isLast: false,
          continuesToPage: 3,
          startSegment: 1,
          endSegment: 2,
          page: { x: 0, y: 0, width: 200, height: 100 },
        }),
      ]),
      page(3, [
        fragment({
          blockId: 'long',
          isFirst: false,
          continuedFromPage: 2,
          startSegment: 2,
          endSegment: 3,
          page: { x: 0, y: 0, width: 200, height: 100 },
        }),
      ]),
    ]);

    expect(markers.pageStarts).toEqual([
      { kind: 'page-start', blockId: 'long', pageNumber: 1 },
    ]);
    expect(markers.continuations).toEqual([
      { kind: 'continuation', blockId: 'long', pageNumber: 2, pages: [2, 3] },
    ]);
  });

  it('keeps one continuation chip per block across many fragments', () => {
    const markers = derivePageBreakMarkers([
      page(1, [
        fragment({ blockId: 'intro', isPageStart: true }),
        fragment({
          blockId: 'long',
          isLast: false,
          continuesToPage: 2,
          page: { x: 0, y: 500, width: 200, height: 400 },
        }),
      ]),
      page(2, [
        fragment({
          blockId: 'long',
          isFirst: false,
          isLast: false,
          continuedFromPage: 1,
          continuesToPage: 3,
          startSegment: 1,
          endSegment: 2,
          page: { x: 0, y: 0, width: 200, height: 900 },
        }),
      ]),
      page(3, [
        fragment({
          blockId: 'long',
          isFirst: false,
          continuedFromPage: 2,
          startSegment: 2,
          endSegment: 3,
          page: { x: 0, y: 0, width: 200, height: 120 },
        }),
        fragment({
          blockId: 'outro',
          isPageStart: false,
          source: { x: 0, y: 1020, width: 200, height: 80 },
          page: { x: 0, y: 120, width: 200, height: 80 },
        }),
      ]),
    ]);

    expect(markers.continuations).toHaveLength(1);
    expect(markers.continuations[0]).toEqual({
      kind: 'continuation',
      blockId: 'long',
      pageNumber: 2,
      pages: [2, 3],
    });
  });

  it('emits a page-start marker and a continuation chip for the same block', () => {
    const markers = derivePageBreakMarkers([
      page(1, [fragment({ blockId: 'a', isPageStart: true })]),
      page(2, [
        fragment({
          blockId: 'spanning',
          isFirst: true,
          isPageStart: true,
          isLast: false,
          continuesToPage: 3,
          source: { x: 0, y: 900, width: 200, height: 900 },
          page: { x: 0, y: 0, width: 200, height: 900 },
        }),
      ]),
      page(3, [
        fragment({
          blockId: 'spanning',
          isFirst: false,
          continuedFromPage: 2,
          startSegment: 1,
          endSegment: 2,
          page: { x: 0, y: 0, width: 200, height: 100 },
        }),
      ]),
    ]);

    expect(markers.pageStarts).toEqual([
      { kind: 'page-start', blockId: 'a', pageNumber: 1 },
      { kind: 'page-start', blockId: 'spanning', pageNumber: 2 },
    ]);
    expect(markers.continuations).toEqual([
      { kind: 'continuation', blockId: 'spanning', pageNumber: 3, pages: [3] },
    ]);
    expect(markers.count).toBe(3);
  });

  it('derives nothing from an empty page model', () => {
    expect(derivePageBreakMarkers([])).toEqual({
      pageStarts: [],
      continuations: [],
      count: 0,
    });
  });

  it('labels page starts and continuation targets for text, not color alone', () => {
    expect(pageStartLabel(3)).toBe('Page 3 starts here');
    expect(continuationLabel([2])).toBe('Continues on page 2');
    expect(continuationLabel([2, 3])).toBe('Continues on pages 2, 3');
    expect(continuationLabel([2, 3, 4, 5])).toBe('Continues on pages 2–5');
    expect(continuationLabel([2, 4])).toBe('Continues on pages 2, 4');
    expect(continuationLabel([])).toBe('Continues');
  });
});
