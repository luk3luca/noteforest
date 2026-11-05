/**
 * Best-effort formula-term geometry (M3c2b).
 *
 * A formula-term anchor stores a LaTeX substring and, when resolved, a unique
 * occurrence in the live formula source. KaTeX does not expose a source-to-DOM
 * map, so this module maps the resolved term to the rendered `.katex-html`
 * text when the mapping is simple and unambiguous:
 *
 * - plain letters, digits, operators and common symbols map to their rendered
 *   text;
 * - a small LaTeX-command table covers common Greek letters, operators and
 *   functions;
 * - the rendered text must occur exactly once; otherwise geometry is absent.
 *
 * Absence is not an error: the caller keeps the M3c2a formula-rectangle marker
 * and quote chip. Nothing here mutates the formula, the selector, the document,
 * or stores coordinates. All rects are measured from the live KaTeX DOM and
 * recomputed by the view.
 */

export interface FormulaTermRect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Rendered text the term mapped to; useful for debugging and tests. */
  text: string;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TextRange {
  /** UTF-16 offset in the collected rendered text. */
  start: number;
  /** UTF-16 offset in the collected rendered text, exclusive. */
  end: number;
}

/**
 * Common LaTeX commands whose rendered text is one stable symbol (or short
 * function name). Commands with arguments or layout effects are deliberately
 * absent: they fall back to the formula rectangle.
 */
const RENDERED_COMMANDS: Readonly<Record<string, string>> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ϵ',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'ϕ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  forall: '∀',
  exists: '∃',
  sum: '∑',
  prod: '∏',
  int: '∫',
  cdot: '⋅',
  times: '×',
  div: '÷',
  pm: '±',
  mp: '∓',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  approx: '≈',
  equiv: '≡',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  Leftarrow: '⇐',
  leftrightarrow: '↔',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  supset: '⊃',
  cup: '∪',
  cap: '∩',
  mid: '∣',
  langle: '⟨',
  rangle: '⟩',
  cdots: '⋯',
  ldots: '…',
  dots: '…',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  log: 'log',
  ln: 'ln',
  exp: 'exp',
  max: 'max',
  min: 'min',
};

/**
 * ASCII math characters KaTeX renders as a different Unicode glyph. A term
 * containing whitespace is compacted because KaTeX renders math spacing as
 * empty `.mspace` elements rather than text.
 */
const PLAIN_CHARACTERS: Readonly<Record<string, string>> = {
  '-': '−',
  '*': '∗',
  '|': '∣',
};

const PLAIN_TERM = /^[\p{L}\p{N}\s+\-*/=<>()[\].,;:!|]+$/u;

/**
 * Map a resolved LaTeX term substring to the text KaTeX is expected to render,
 * or `null` when the term is too complex for best-effort matching.
 */
export function renderedTermText(term: string): string | null {
  const trimmed = term.trim();
  if (trimmed.length === 0) return null;

  const command = /^\\([A-Za-z]+)$/.exec(trimmed);
  if (command !== null) {
    return RENDERED_COMMANDS[command[1] ?? ''] ?? null;
  }
  if (!PLAIN_TERM.test(trimmed)) return null;

  const compact = trimmed.replace(/\s+/gu, '');
  if (compact.length === 0) return null;
  return [...compact].map((character) => PLAIN_CHARACTERS[character] ?? character).join('');
}

/**
 * Find the single occurrence of `needle` in `haystack`. Two or more
 * occurrences are ambiguous and return `null`; overlapping occurrences count.
 */
export function findUniqueTextRange(haystack: string, needle: string): TextRange | null {
  if (needle.length === 0) return null;
  const first = haystack.indexOf(needle);
  if (first < 0) return null;
  if (haystack.indexOf(needle, first + 1) >= 0) return null;
  return { start: first, end: first + needle.length };
}

interface CollectedText {
  text: string;
  nodes: Array<{ node: Text; start: number; end: number }>;
}

/** Text nodes KaTeX uses only for layout/struts, never for visible glyphs. */
const INVISIBLE_ANCESTORS =
  '.katex-strut, .mspace, .vlist-s, .pstrut, .frac-line, .nulldelimiter, .katex-mathml';

function isVisibleText(node: Text): boolean {
  const value = node.nodeValue ?? '';
  if (value.length === 0) return false;
  // KaTeX inserts zero-width and invisible-operator characters in layout
  // spans; they are not part of the visible term text.
  if (/^[\u200b\u2061\ufe0f]+$/u.test(value)) return false;
  const parent = node.parentElement;
  if (parent === null) return false;
  return parent.closest(INVISIBLE_ANCESTORS) === null;
}

/**
 * Collect the visible rendered text of `.katex-html` in DOM order, with the
 * UTF-16 offsets needed to build a DOM Range. Falls back to the whole formula
 * element when a KaTeX fragment is absent (for example an error state).
 */
export function collectRenderedText(root: HTMLElement): CollectedText {
  const scope = root.querySelector<HTMLElement>('.katex-html') ?? root;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const nodes: CollectedText['nodes'] = [];
  let text = '';
  let current = walker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    if (isVisibleText(textNode)) {
      const value = textNode.nodeValue ?? '';
      nodes.push({ node: textNode, start: text.length, end: text.length + value.length });
      text += value;
    }
    current = walker.nextNode();
  }
  return { text, nodes };
}

function textNodeAt(
  collected: CollectedText,
  offset: number,
): { node: Text; offset: number } | null {
  for (const entry of collected.nodes) {
    if (offset >= entry.start && offset <= entry.end) {
      return { node: entry.node, offset: offset - entry.start };
    }
  }
  return null;
}

function unionRect(rects: readonly DOMRect[]): RectLike | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const rect of rects) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Measure a term rectangle in viewport coordinates from the live KaTeX DOM.
 * Returns `null` when the term cannot be mapped uniquely; the caller must use
 * the formula rectangle instead.
 */
export function formulaTermRect(root: HTMLElement, term: string): FormulaTermRect | null {
  const rendered = renderedTermText(term);
  if (rendered === null) return null;
  const rootRect = root.getBoundingClientRect();
  if (rootRect.width <= 0 || rootRect.height <= 0) return null;

  const collected = collectRenderedText(root);
  const range = findUniqueTextRange(collected.text, rendered);
  if (range === null) return null;
  const start = textNodeAt(collected, range.start);
  const end = textNodeAt(collected, range.end);
  if (start === null || end === null) return null;

  const domRange = document.createRange();
  domRange.setStart(start.node, start.offset);
  domRange.setEnd(end.node, end.offset);
  const rect = unionRect([...domRange.getClientRects()]);
  domRange.detach();
  if (rect === null) return null;
  return { ...rect, text: rendered };
}

/**
 * Convert a viewport rect to coordinates inside `base` in layout pixels.
 * The CSS `zoom` scale is passed separately because `getBoundingClientRect`
 * is scaled while absolutely positioned children use layout pixels.
 */
export function relativeRect(rect: RectLike, base: RectLike, scale: number): RectLike {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    left: (rect.left - base.left) / factor,
    top: (rect.top - base.top) / factor,
    width: rect.width / factor,
    height: rect.height / factor,
  };
}

/** Layout-pixel scale of an element under CSS `zoom` (1 when unzoomed). */
export function elementScale(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (element.offsetWidth <= 0 || rect.width <= 0) return 1;
  return rect.width / element.offsetWidth;
}

function elementsFor(root: ParentNode, selector: string, anchorId: string): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(selector)].filter((element) =>
    (element.dataset['anchorIds'] ?? element.dataset['anchorTermIds'] ?? '')
      .split(',')
      .map((value) => value.trim())
      .includes(anchorId),
  );
}

/**
 * Elements that represent one anchor's measured position. A rendered term
 * highlight wins over the atomic formula node; when no term geometry exists,
 * the formula node remains the fallback. Shared by the marker buttons, the
 * callout lane, and the selected-state highlight so all three agree.
 */
export function anchorVisualTargets(root: ParentNode, anchorId: string): HTMLElement[] {
  const terms = elementsFor(root, '[data-anchor-term-ids]', anchorId);
  if (terms.length > 0) return terms;
  return elementsFor(root, '[data-anchor-ids]', anchorId);
}
