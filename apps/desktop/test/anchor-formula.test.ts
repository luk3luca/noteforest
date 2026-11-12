import { describe, expect, it } from 'vitest';
import {
  ANCHOR_FORMULA_MAX_CODEPOINTS,
  anchorFormulaRender,
} from '../src/renderer/src/editor/anchor-formula';

/**
 * Formula anchor chip rendering: short valid LaTeX becomes inline KaTeX, while
 * empty, invalid, or over-long sources return the plain fallback. The plain
 * source is always preserved for the chip title.
 */

describe('anchor formula chip', () => {
  it('renders a term and a short whole formula with KaTeX', () => {
    const term = anchorFormulaRender('\\lambda');
    expect(term.html).not.toBeNull();
    expect(term.html).toContain('class="katex"');
    expect(term.plain).toBe('\\lambda');

    const whole = anchorFormulaRender('E = mc^2');
    expect(whole.html).not.toBeNull();
    expect(whole.html).toContain('class="katex"');
    expect(whole.plain).toBe('E = mc^2');
  });

  it('falls back for an invalid formula instead of throwing', () => {
    const invalid = anchorFormulaRender('\\frac{');
    expect(invalid.html).toBeNull();
    expect(invalid.plain).toBe('\\frac{');
  });

  it('falls back for an over-long formula and keeps the full source', () => {
    const long = Array.from({ length: ANCHOR_FORMULA_MAX_CODEPOINTS + 1 })
      .map((_, index) => `a_{${index}}`)
      .join(' + ');
    const result = anchorFormulaRender(long);
    expect(result.html).toBeNull();
    expect(result.plain).toBe(long);
  });

  it('accepts exactly the maximum length and trims surrounding space', () => {
    const exact = 'x'.repeat(ANCHOR_FORMULA_MAX_CODEPOINTS);
    const result = anchorFormulaRender(`  ${exact}  `);
    expect(result.plain).toBe(exact);
    expect(result.html).not.toBeNull();
  });

  it('returns an empty plain fallback for missing or blank input', () => {
    for (const value of [undefined, null, '', '   ']) {
      expect(anchorFormulaRender(value)).toEqual({ html: null, plain: '' });
    }
  });
});
