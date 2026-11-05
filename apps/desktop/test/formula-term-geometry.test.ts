import { describe, expect, it } from 'vitest';
import {
  findUniqueTextRange,
  relativeRect,
  renderedTermText,
} from '../src/renderer/src/lib/formula-term-geometry';

describe('formula term -> rendered text mapping', () => {
  it('maps plain letters, operators and compacted spacing', () => {
    expect(renderedTermText('x')).toBe('x');
    expect(renderedTermText('x + y')).toBe('x+y');
    expect(renderedTermText('x - y')).toBe('x−y');
    expect(renderedTermText('2x')).toBe('2x');
    expect(renderedTermText('λ')).toBe('λ');
  });

  it('maps common LaTeX commands to their rendered symbol', () => {
    expect(renderedTermText('\\lambda')).toBe('λ');
    expect(renderedTermText('\\alpha')).toBe('α');
    expect(renderedTermText('\\Delta')).toBe('Δ');
    expect(renderedTermText('\\cdot')).toBe('⋅');
    expect(renderedTermText('\\leq')).toBe('≤');
    expect(renderedTermText('\\sum')).toBe('∑');
    expect(renderedTermText('\\rightarrow')).toBe('→');
    expect(renderedTermText('\\sin')).toBe('sin');
  });

  it('returns null for unsupported or malformed terms', () => {
    expect(renderedTermText('')).toBeNull();
    expect(renderedTermText('   ')).toBeNull();
    expect(renderedTermText('\\frac{a}{b}')).toBeNull();
    expect(renderedTermText('x^2')).toBeNull();
    expect(renderedTermText('\\unknowncommand')).toBeNull();
    expect(renderedTermText('\\alpha + \\beta')).toBeNull();
  });
});

describe('unique rendered text range', () => {
  it('finds one occurrence', () => {
    expect(findUniqueTextRange('x+y=z', 'x')).toEqual({ start: 0, end: 1 });
    expect(findUniqueTextRange('x+y=z', 'y')).toEqual({ start: 2, end: 3 });
    expect(findUniqueTextRange('x+y=z', '=')).toEqual({ start: 3, end: 4 });
  });

  it('rejects a missing or repeated occurrence', () => {
    expect(findUniqueTextRange('x+y=z', 'q')).toBeNull();
    expect(findUniqueTextRange('x+y=z', '')).toBeNull();
    expect(findUniqueTextRange('x+y+x', 'x')).toBeNull();
    expect(findUniqueTextRange('λ+λ', 'λ')).toBeNull();
  });
});

describe('term rect -> card-relative layout pixels', () => {
  it('translates and unscales a zoomed viewport rect', () => {
    expect(
      relativeRect(
        { left: 110, top: 220, width: 44, height: 11 },
        { left: 100, top: 200, width: 400, height: 300 },
        1.1,
      ),
    ).toEqual({ left: 10 / 1.1, top: 20 / 1.1, width: 40, height: 10 });
  });

  it('treats an invalid scale as 1', () => {
    expect(
      relativeRect(
        { left: 12, top: 22, width: 4, height: 5 },
        { left: 10, top: 20, width: 100, height: 100 },
        Number.NaN,
      ),
    ).toEqual({ left: 2, top: 2, width: 4, height: 5 });
  });
});
