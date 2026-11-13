/**
 * Formula input rules (special-text editing, area C).
 *
 * The library convention (`$$…$$` inline, `$$$…$$$` block) is replaced with
 * the Obsidian-compatible one:
 *
 * - `$…$` becomes inline math when the source has no space right after the
 *   opening `$`, no space right before the closing `$`, no newline and no `$`
 *   inside. An opening `$` already preceded by `$` never starts a match, so
 *   `$$…$$` cannot be parsed as an inline pair.
 * - `$$…$$` as the whole paragraph becomes block math. `$$` + Enter creates an
 *   empty block formula.
 *
 * The matching functions are pure so the guards are unit-tested without a
 * ProseMirror view; the extensions pass their results to `InputRule`.
 */

export interface InlineMathMatch {
  /** Match start inside the text block. */
  index: number;
  /** Matched source, including both `$` delimiters. */
  text: string;
  latex: string;
  /** ProseMirror input rules read the payload from `data`. */
  data: { latex: string };
}

const INLINE_MATH_SOURCE = '\\$([^\\s$](?:[^$\\n]*[^\\s$])?)\\$';

/**
 * Find the first `$…$` pair that satisfies the Obsidian guards. Mirrors the
 * shape ProseMirror input rules accept: `{ index, text, data }`.
 */
export function findInlineMathInput(text: string): InlineMathMatch | null {
  const pattern = new RegExp(INLINE_MATH_SOURCE, 'g');
  let match = pattern.exec(text);
  while (match !== null) {
    const index = match.index;
    const before = index > 0 ? text[index - 1] : '';
    const after = text[index + match[0].length] ?? '';
    // No `$$` on either side: the opening must stand alone and the closing
    // must not be the first half of a block delimiter.
    const blocked =
      before === '$' || after === '$' || before === '\\';
    if (!blocked) {
      const latex = match[1] ?? '';
      return { index, text: match[0], latex, data: { latex } };
    }
    pattern.lastIndex = index + 1;
    match = pattern.exec(text);
  }
  return null;
}

/** The LaTeX of a `$$…$$` block paragraph, or null when it is not one. */
export function parseBlockMathParagraph(text: string): string | null {
  const match = /^\$\$([^$\n]+)\$\$$/.exec(text);
  if (match === null) return null;
  const latex = match[1] ?? '';
  return latex.trim().length === 0 ? null : latex;
}

/** Whether a paragraph is exactly `$$`, the empty block-math trigger. */
export function isBlockMathEnterTrigger(text: string): boolean {
  return text === '$$';
}

/**
 * Strip the delimiters the inline source editor may show/wrap around a
 * formula source. Plain LaTeX stays untouched; only a full matching pair is
 * removed.
 */
export function unwrapFormulaSource(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
