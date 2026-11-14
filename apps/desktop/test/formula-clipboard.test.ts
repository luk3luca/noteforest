import { describe, expect, it } from 'vitest';
import {
  formulaCopySource,
  formulaKindTarget,
  parseFormulaPaste,
} from '../src/renderer/src/lib/formula-clipboard';

describe('formula copy payload', () => {
  it('adds the delimiters of the current kind', () => {
    expect(formulaCopySource('x^2', 'inlineMath')).toBe('$x^2$');
    expect(formulaCopySource('E=mc^2', 'blockMath')).toBe('$$E=mc^2$$');
    expect(formulaCopySource('', 'inlineMath')).toBe('$$');
    expect(formulaCopySource('', 'blockMath')).toBe('$$$$');
  });
});

describe('formula kind target', () => {
  it('flips only the two formula node types', () => {
    expect(formulaKindTarget('inlineMath')).toBe('blockMath');
    expect(formulaKindTarget('blockMath')).toBe('inlineMath');
    expect(formulaKindTarget('mathBlock')).toBeNull();
    expect(formulaKindTarget('paragraph')).toBeNull();
  });
});

describe('formula paste match', () => {
  it('accepts exactly one inline pair with the input-rule guards', () => {
    expect(parseFormulaPaste('$x^2$')).toEqual({ kind: 'inlineMath', latex: 'x^2' });
    expect(parseFormulaPaste('  $2*2$\n')).toEqual({ kind: 'inlineMath', latex: '2*2' });
    expect(parseFormulaPaste('$100$')).toEqual({ kind: 'inlineMath', latex: '100' });
  });

  it('accepts exactly one block pair and trims the source', () => {
    expect(parseFormulaPaste('$$E=mc^2$$')).toEqual({ kind: 'blockMath', latex: 'E=mc^2' });
    expect(parseFormulaPaste('$$ \\frac{1}{2} $$')).toEqual({
      kind: 'blockMath',
      latex: '\\frac{1}{2}',
    });
  });

  it('rejects spaces at the edge, mixed text, empty and nested delimiters', () => {
    expect(parseFormulaPaste('$ x$')).toBeNull();
    expect(parseFormulaPaste('$x $')).toBeNull();
    expect(parseFormulaPaste('text $x$')).toBeNull();
    expect(parseFormulaPaste('$x$ trailing')).toBeNull();
    expect(parseFormulaPaste('$$$$')).toBeNull();
    expect(parseFormulaPaste('$$ $$')).toBeNull();
    expect(parseFormulaPaste('$$$x$$$')).toBeNull();
    expect(parseFormulaPaste('$x\ny$')).toBeNull();
    expect(parseFormulaPaste('')).toBeNull();
    expect(parseFormulaPaste('plain text')).toBeNull();
  });
});
