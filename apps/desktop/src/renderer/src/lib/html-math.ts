/**
 * Foreign HTML math normalization (v0.1.1, Track A).
 *
 * Pasting math from a browser (KaTeX, MathJax) or from Obsidian puts a
 * rendered container on the clipboard HTML, not a `$…$` source string. The
 * editor's formula input rule never runs on paste, so without normalization
 * the formulas become glyph soup or literal delimiters. This module rewrites
 * each recognized foreign container to the editor's own inline-math HTML
 * shape (`<span data-type="inline-math" data-latex="…">`), which
 * `InlineFormulaNode.parseHTML` turns into a real node.
 *
 * It is DOM-free on purpose: the rules are unit-tested as strings. The scan is
 * a small tolerant tag walker, not a full HTML parser; it is only asked to
 * find balanced containers the clipboard actually carries.
 *
 * Recognition is strict to avoid over-matching prose: a class must carry the
 * exact token `math`, `math-inline`, `katex` or `katex-mathml`; MathJax adds
 * `mjx-container` and `<script type="math/tex">`; a bare `<math>` element is a
 * container. The TeX annotation wins over rendered glyph text. A snippet that
 * already carries NoteForest's own math node shape is returned untouched, so a
 * note copied into another note stays byte-compatible.
 */

const OWN_MATH_SHAPE = /\bdata-type\s*=\s*["']?(?:inline-math|block-math)\b/i;

const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** The math classes that identify a foreign container. */
const MATH_CLASS_TOKENS: ReadonlySet<string> = new Set([
  'math',
  'math-inline',
  'katex',
  'katex-mathml',
  'mathjax',
]);

interface HtmlTag {
  start: number;
  /** First index after `>`. */
  end: number;
  name: string;
  attrs: string;
  closing: boolean;
  selfClosing: boolean;
}

interface ElementRange {
  /** First index of the closing tag (or the start-tag end for a void node). */
  innerEnd: number;
  /** First index after the closing tag. */
  outerEnd: number;
}

/** The end of a tag starting at `start`, ignoring `>` inside quoted values. */
function tagEnd(html: string, start: number): number {
  let quote = '';
  for (let index = start + 1; index < html.length; index += 1) {
    const character = html[index] ?? '';
    if (quote !== '') {
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '>') return index;
  }
  return -1;
}

/** The next real tag at or after `from`; comments and declarations are skipped. */
function nextTag(html: string, from: number): HtmlTag | null {
  let index = html.indexOf('<', from);
  while (index !== -1) {
    if (html.startsWith('<!--', index)) {
      const close = html.indexOf('-->', index + 4);
      if (close === -1) return null;
      index = html.indexOf('<', close + 3);
      continue;
    }
    if (html.startsWith('<![CDATA[', index)) {
      const close = html.indexOf(']]>', index + 9);
      if (close === -1) return null;
      index = html.indexOf('<', close + 3);
      continue;
    }
    const next = html[index + 1] ?? '';
    if (next === '!' || next === '?') {
      const close = html.indexOf('>', index + 2);
      if (close === -1) return null;
      index = html.indexOf('<', close + 1);
      continue;
    }
    const end = tagEnd(html, index);
    if (end === -1) return null;
    const raw = html.slice(index + 1, end);
    const match = /^(\/?)\s*([a-zA-Z][^\s/>]*)/.exec(raw);
    if (match === null) {
      index = html.indexOf('<', index + 1);
      continue;
    }
    const closing = match[1] === '/';
    const selfClosing = raw.trimEnd().endsWith('/');
    return {
      start: index,
      end: end + 1,
      name: (match[2] ?? '').toLowerCase(),
      attrs: raw.slice(match[0].length),
      closing,
      selfClosing,
    };
  }
  return null;
}

function attribute(tag: HtmlTag, name: string): string | null {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  );
  const match = pattern.exec(tag.attrs);
  if (match === null) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

function classTokens(tag: HtmlTag): string[] {
  const value = attribute(tag, 'class');
  return value === null ? [] : value.toLowerCase().split(/\s+/).filter(Boolean);
}

function isMathContainer(tag: HtmlTag): boolean {
  if (tag.closing) return false;
  if (tag.name === 'mjx-container' || tag.name === 'math') return true;
  if (tag.name === 'script') {
    const type = attribute(tag, 'type');
    return type !== null && type.trim().toLowerCase().startsWith('math/tex');
  }
  return classTokens(tag).some((token) => MATH_CLASS_TOKENS.has(token));
}

/** Find the balanced end of the element opened by `tag`. */
function elementRange(html: string, tag: HtmlTag): ElementRange | null {
  if (tag.selfClosing || VOID_ELEMENTS.has(tag.name)) {
    return { innerEnd: tag.end, outerEnd: tag.end };
  }
  if (tag.name === 'script') {
    // Script content is TeX: scan for the literal close tag, never for `<`.
    const close = html.toLowerCase().indexOf('</script', tag.end);
    if (close === -1) return null;
    const closeEnd = html.indexOf('>', close);
    if (closeEnd === -1) return null;
    return { innerEnd: close, outerEnd: closeEnd + 1 };
  }
  let depth = 1;
  let cursor = tag.end;
  while (cursor < html.length) {
    const next = nextTag(html, cursor);
    if (next === null) return null;
    cursor = next.end;
    if (next.name !== tag.name) continue;
    if (next.closing) {
      depth -= 1;
      if (depth === 0) return { innerEnd: next.start, outerEnd: next.end };
    } else if (!next.selfClosing && !VOID_ELEMENTS.has(next.name)) {
      depth += 1;
    }
  }
  return null;
}

function decodeEntities(value: string): string {
  const named: Readonly<Record<string, string>> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? safeCodePoint(code, whole) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeCodePoint(code, whole) : whole;
    }
    return named[body.toLowerCase()] ?? whole;
  });
}

function safeCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/** Strip tags and comments from a fragment, keeping its text. */
function stripTags(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, '');
}

/** The TeX of the first `application/x-tex` annotation, or null. */
function annotationTex(inner: string): string | null {
  const opener = /<annotation\b([^>]*)>/gi;
  let match = opener.exec(inner);
  while (match !== null) {
    const encoding = /encoding\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[1] ?? '');
    const value = (encoding?.[1] ?? encoding?.[2] ?? encoding?.[3] ?? '').trim().toLowerCase();
    if (value.startsWith('application/x-tex')) {
      const contentStart = opener.lastIndex;
      const close = inner.toLowerCase().indexOf('</annotation', contentStart);
      const content =
        close === -1 ? inner.slice(contentStart) : inner.slice(contentStart, close);
      const tex = decodeEntities(stripTags(content)).trim();
      if (tex.length > 0) return tex;
    }
    match = opener.exec(inner);
  }
  return null;
}

/** TeX for one container: the annotation first, the element text second. */
function containerTex(html: string, tag: HtmlTag, innerEnd: number): string | null {
  const inner = html.slice(tag.end, innerEnd);
  if (tag.name === 'script') {
    const tex = decodeEntities(inner).trim();
    return tex.length > 0 ? tex : null;
  }
  const annotated = annotationTex(inner);
  if (annotated !== null) return annotated;
  const text = decodeEntities(stripTags(inner)).trim();
  return text.length > 0 ? text : null;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMathHtml(tex: string): string {
  return `<span data-type="inline-math" data-latex="${escapeAttribute(tex)}"></span>`;
}

/** Whether the fragment already carries the editor's own math node shape. */
export function hasOwnMathHtml(html: string): boolean {
  return OWN_MATH_SHAPE.test(html);
}

/**
 * Rewrite every foreign math container to the editor's own inline-math shape.
 * A NoteForest-to-NoteForest paste is returned unchanged; a fragment with no
 * math container is returned byte-for-byte.
 */
export function normalizeForeignMathHtml(html: string): string {
  if (html.length === 0 || hasOwnMathHtml(html)) return html;
  let output = '';
  let cursor = 0;
  while (cursor < html.length) {
    const tag = nextTag(html, cursor);
    if (tag === null) {
      output += html.slice(cursor);
      break;
    }
    if (!isMathContainer(tag)) {
      output += html.slice(cursor, tag.end);
      cursor = tag.end;
      continue;
    }
    const range = elementRange(html, tag);
    if (range === null) {
      output += html.slice(cursor, tag.end);
      cursor = tag.end;
      continue;
    }
    const tex = containerTex(html, tag, range.innerEnd);
    if (tex === null) {
      output += html.slice(cursor, tag.end);
      cursor = tag.end;
      continue;
    }
    output += html.slice(cursor, tag.start) + inlineMathHtml(tex);
    cursor = range.outerEnd;
  }
  return output;
}
