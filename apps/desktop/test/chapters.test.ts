import { describe, expect, it } from 'vitest';
import { chapterInsertIndex, showsChapterCanvas } from '../src/renderer/src/lib/chapters';

const chapters = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('chapter insert index', () => {
  it('inserts immediately after the active chapter', () => {
    expect(chapterInsertIndex(chapters, 'a')).toBe(1);
    expect(chapterInsertIndex(chapters, 'b')).toBe(2);
    expect(chapterInsertIndex(chapters, 'c')).toBe(3);
  });

  it('appends when there is no selection', () => {
    expect(chapterInsertIndex(chapters, null)).toBe(3);
  });

  it('appends when the active chapter id is stale', () => {
    expect(chapterInsertIndex(chapters, 'gone')).toBe(3);
  });

  it('returns zero for an empty chapter list', () => {
    expect(chapterInsertIndex([], null)).toBe(0);
  });
});

describe('chapter canvas visibility', () => {
  it('shows the canvas whenever the document has blocks', () => {
    expect(showsChapterCanvas([{ id: 'a' }], 1)).toBe(true);
  });

  it('keeps the pristine empty-document call to action for one untitled chapter', () => {
    expect(showsChapterCanvas([{ id: 'a' }], 0)).toBe(false);
  });

  it('renders named legacy empty chapters instead of hiding them', () => {
    expect(showsChapterCanvas([{ id: 'a', title: 'Legacy empty' }], 0)).toBe(true);
  });

  it('renders multiple legacy empty chapters', () => {
    expect(showsChapterCanvas([{ id: 'a' }, { id: 'b' }], 0)).toBe(true);
  });
});
