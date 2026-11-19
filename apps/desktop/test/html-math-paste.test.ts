import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import {
  hasOwnMathHtml,
  normalizeForeignMathHtml,
} from '../src/renderer/src/lib/html-math';
import { createEditorExtensions } from '../src/renderer/src/editor/extensions';
import { createFlatMarkdownExtensions } from '../src/renderer/src/markdown/flat-schema';
import { HtmlMathPaste } from '../src/renderer/src/editor/html-math-paste';

const INLINE_MATH_HTML = (tex: string): string =>
  `<span data-type="inline-math" data-latex="${tex}"></span>`;

describe('foreign HTML math normalization', () => {
  it('normalizes a KaTeX container from its TeX annotation', () => {
    const html = [
      '<p>Speed is <span class="katex">',
      '<span class="katex-mathml"><math><semantics>',
      '<mrow><mi>v</mi></mrow>',
      '<annotation encoding="application/x-tex">v = \\frac{d}{t}</annotation>',
      '</semantics></math></span>',
      '<span class="katex-html" aria-hidden="true">v=dt</span>',
      '</span> today.</p>',
    ].join('');
    expect(normalizeForeignMathHtml(html)).toBe(
      `<p>Speed is ${INLINE_MATH_HTML('v = \\frac{d}{t}')} today.</p>`,
    );
  });

  it('normalizes a MathJax mjx-container from its annotation', () => {
    const html =
      '<p><mjx-container class="MathJax" jax="CHTML"><math><semantics><mrow><msup><mi>x</mi><mn>2</mn></msup></mrow>' +
      '<annotation encoding="application/x-tex">x^2</annotation></semantics></math></mjx-container></p>';
    expect(normalizeForeignMathHtml(html)).toBe(`<p>${INLINE_MATH_HTML('x^2')}</p>`);
  });

  it('normalizes a MathJax v2 math/tex script', () => {
    const html =
      '<span class="MathJax"><script type="math/tex">E=mc^2</script></span>';
    expect(normalizeForeignMathHtml(html)).toBe(INLINE_MATH_HTML('E=mc^2'));
  });

  it('normalizes an Obsidian .math span from its text and decodes entities', () => {
    expect(normalizeForeignMathHtml('<span class="math">a&amp;b</span>')).toBe(
      INLINE_MATH_HTML('a&amp;b'),
    );
    expect(
      normalizeForeignMathHtml('<p><span class="math-inline">x &lt; y</span></p>'),
    ).toBe(`<p>${INLINE_MATH_HTML('x &lt; y')}</p>`);
  });

  it('keeps surrounding lists and marks intact', () => {
    const html =
      '<ul><li><strong>Speed <span class="math">v</span></strong></li>' +
      '<li><em>x<sup>2</sup></em> and <span class="math">y</span></li></ul>';
    expect(normalizeForeignMathHtml(html)).toBe(
      `<ul><li><strong>Speed ${INLINE_MATH_HTML('v')}</strong></li>` +
        `<li><em>x<sup>2</sup></em> and ${INLINE_MATH_HTML('y')}</li></ul>`,
    );
  });

  it('normalizes multiple spans on one line', () => {
    const html =
      '<p><span class="math">a</span> plus <span class="math">b</span> equals <span class="math">c</span></p>';
    expect(normalizeForeignMathHtml(html)).toBe(
      `<p>${INLINE_MATH_HTML('a')} plus ${INLINE_MATH_HTML('b')} equals ${INLINE_MATH_HTML('c')}</p>`,
    );
  });

  it('takes the annotation over rendered glyph text', () => {
    const html =
      '<span class="katex-mathml"><math><annotation encoding="application/x-tex">\\pi r^2</annotation></math></span>';
    expect(normalizeForeignMathHtml(html)).toBe(INLINE_MATH_HTML('\\pi r^2'));
  });

  it('leaves NoteForest own inline-math HTML untouched', () => {
    const html = `<p>${INLINE_MATH_HTML('x^2')}</p>`;
    expect(hasOwnMathHtml(html)).toBe(true);
    expect(normalizeForeignMathHtml(html)).toBe(html);
    // The guard covers the whole fragment: no double conversion or nesting
    // even when a foreign container sits beside an own formula.
    const mixed = `<p>${INLINE_MATH_HTML('a')} <span class="math">b</span></p>`;
    expect(normalizeForeignMathHtml(mixed)).toBe(mixed);
  });

  it('leaves a fragment without a math container byte-identical', () => {
    const html = '<p class="mathematics">plain <strong>prose</strong></p>';
    expect(normalizeForeignMathHtml(html)).toBe(html);
    expect(normalizeForeignMathHtml('')).toBe('');
    expect(normalizeForeignMathHtml('plain text')).toBe('plain text');
  });

  it('leaves an empty container alone', () => {
    const html = '<p><span class="math"></span></p>';
    expect(normalizeForeignMathHtml(html)).toBe(html);
  });

  it('does not match a class that merely contains "math"', () => {
    const html = '<span class="mathematics">x</span>';
    expect(normalizeForeignMathHtml(html)).toBe(html);
  });
});

describe('HTML math paste wiring', () => {
  it('is registered in the forest and flat extension sets', () => {
    expect(createEditorExtensions().some((extension) => extension.name === 'htmlMathPaste')).toBe(
      true,
    );
    expect(
      createFlatMarkdownExtensions().some((extension) => extension.name === 'htmlMathPaste'),
    ).toBe(true);
  });

  it('keeps the inline math node in both schemas', () => {
    expect(getSchema(createEditorExtensions()).nodes['inlineMath']).toBeDefined();
    expect(getSchema(createFlatMarkdownExtensions()).nodes['inlineMath']).toBeDefined();
  });

  it('exports the extension with a paste transform', () => {
    expect(HtmlMathPaste.name).toBe('htmlMathPaste');
    const transform = HtmlMathPaste.config.transformPastedHTML as
      | ((html: string) => string)
      | undefined;
    expect(typeof transform).toBe('function');
    expect(transform?.('<span class="math">v</span>')).toBe(INLINE_MATH_HTML('v'));
    expect(transform?.(INLINE_MATH_HTML('x'))).toBe(INLINE_MATH_HTML('x'));
  });
});
