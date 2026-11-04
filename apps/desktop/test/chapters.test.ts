import { describe, expect, it } from 'vitest';
import { chapterInsertIndex } from '../src/renderer/src/lib/chapters';

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
