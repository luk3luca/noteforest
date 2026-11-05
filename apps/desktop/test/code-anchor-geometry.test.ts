import { describe, expect, it } from 'vitest';
import {
  codeLineMarkerRect,
  codePointToUtf16,
} from '../src/renderer/src/lib/code-anchor-geometry';

describe('code point -> UTF-16 mapping', () => {
  it('counts astral characters as one code point and two UTF-16 units', () => {
    expect(codePointToUtf16('A😀eigvals', 0)).toBe(0);
    expect(codePointToUtf16('A😀eigvals', 1)).toBe(1);
    expect(codePointToUtf16('A😀eigvals', 2)).toBe(3);
    expect(codePointToUtf16('A😀eigvals', 9)).toBe(10);
  });

  it('clamps negative and out-of-range offsets', () => {
    expect(codePointToUtf16('abc', -2)).toBe(0);
    expect(codePointToUtf16('abc', 99)).toBe(3);
  });
});

describe('code line marker geometry', () => {
  it('places the gutter dot just left of the first selected line', () => {
    const marker = codeLineMarkerRect({
      left: 100,
      top: 40,
      width: 60,
      height: 10,
      right: 160,
      bottom: 50,
      x: 100,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect);
    expect(marker).toEqual({ left: 92, top: 42.5, width: 5, height: 5 });
  });
});
