import { describe, expect, it } from 'vitest';
import {
  codeAnchorSpans,
  highlightCodeLineHtml,
  isRegisteredCodeLanguage,
} from '../src/renderer/src/lib/code-highlight';

/** Prose text of a tiny HTML fragment (the only entities this module emits). */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function balanced(html: string): boolean {
  const stack: string[] = [];
  for (const match of html.matchAll(/<(\/?)([a-z0-9-]+)[^>]*>/gi)) {
    const closing = match[1] === '/';
    const tag = match[2]?.toLowerCase() ?? '';
    if (!closing) {
      stack.push(tag);
      continue;
    }
    if (stack.pop() !== tag) return false;
  }
  return stack.length === 0;
}

const PYTHON = 'def greeting(name): return "hello"  # greet';

describe('shared code highlighter', () => {
  it('registers the common grammars and treats plaintext as a real language', () => {
    expect(isRegisteredCodeLanguage('python')).toBe(true);
    expect(isRegisteredCodeLanguage('typescript')).toBe(true);
    expect(isRegisteredCodeLanguage('ts')).toBe(true);
    expect(isRegisteredCodeLanguage('plaintext')).toBe(true);
    expect(isRegisteredCodeLanguage('not-a-language')).toBe(false);
  });

  it('highlights one line with the highlighted words and keeps the text', () => {
    const html = highlightCodeLineHtml(PYTHON, 'python', []);
    expect(html).toContain('<span class="hljs-keyword">def</span>');
    expect(html).toContain('hljs-title');
    expect(html).toContain('hljs-string');
    expect(html).toContain('hljs-comment');
    expect(html).not.toContain('<div');
    expect(textOf(html)).toBe(PYTHON);
    expect(balanced(html)).toBe(true);
  });

  it('keeps plaintext neutral and falls back to auto for an unknown language', () => {
    const plain = highlightCodeLineHtml(PYTHON, 'plaintext', []);
    expect(plain).not.toContain('<span');
    expect(textOf(plain)).toBe(PYTHON);
    const auto = highlightCodeLineHtml('const value = 1;', 'not-a-language', []);
    expect(auto).toContain('hljs-');
    expect(textOf(auto)).toBe('const value = 1;');
  });

  it('wraps an anchored token in exactly one span inside the highlight markup', () => {
    const spans = codeAnchorSpans(PYTHON, [{ anchorId: 'a-greeting', token: 'greeting' }]);
    expect(spans).toEqual([{ start: 4, end: 12, anchorId: 'a-greeting' }]);
    const html = highlightCodeLineHtml(PYTHON, 'python', spans);
    expect(html.match(/data-anchor-id="a-greeting"/g)).toHaveLength(1);
    expect(html).toContain('nf-anchor');
    expect(textOf(html)).toBe(PYTHON);
    expect(balanced(html)).toBe(true);
    // The highlight markup is nested inside the anchor wrapper, not split.
    expect(html).toMatch(
      /<span class="nf-anchor" data-anchor-id="a-greeting"><span class="hljs-title function_">greeting<\/span><\/span>/,
    );
  });

  it('keeps one anchor wrapper when the token crosses several highlight spans', () => {
    const line = 'total = sum(matrix, vector);';
    const spans = codeAnchorSpans(line, [{ anchorId: 'a-range', token: 'total = sum' }]);
    expect(spans).toHaveLength(1);
    const html = highlightCodeLineHtml(line, 'typescript', spans);
    expect(html.match(/data-anchor-id="a-range"/g)).toHaveLength(1);
    expect(textOf(html)).toBe(line);
    expect(balanced(html)).toBe(true);
    // The wrapper stays open across the nested class span.
    expect(html).toMatch(
      /^<span class="nf-anchor" data-anchor-id="a-range">total = <span class="hljs-[^"]*">sum<\/span><\/span>/,
    );
  });

  it('matches the longest token at the same start and every occurrence', () => {
    const spans = codeAnchorSpans('value = value + value', [
      { anchorId: 'short', token: 'value' },
      { anchorId: 'long', token: 'value = value' },
    ]);
    expect(spans).toEqual([
      { start: 0, end: 13, anchorId: 'long' },
      { start: 16, end: 21, anchorId: 'short' },
    ]);
  });

  it('drops multiline hints and never drops an anchor when highlighting throws', () => {
    expect(codeAnchorSpans('abc', [{ anchorId: 'a', token: 'a\nb' }])).toEqual([]);
    const spans = codeAnchorSpans(PYTHON, [{ anchorId: 'a-def', token: 'def' }]);
    const html = highlightCodeLineHtml(PYTHON, '', spans);
    expect(html).toContain('data-anchor-id="a-def"');
    expect(textOf(html)).toBe(PYTHON);
  });
});
