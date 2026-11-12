/**
 * Formula anchor chip rendering (Continuous callout).
 *
 * The callout chip shows a formula anchor's LaTeX inline with the existing
 * KaTeX dependency. Rendering is deliberately conservative: an empty, very
 * long, or invalid source never reaches KaTeX and the caller falls back to the
 * Σ glyph plus the plain quote. The chip lives in a card head, so a formula may
 * never widen or break the card.
 *
 * The plain LaTeX is always returned: the button keeps it in `title` so the
 * full source stays available after a visual truncation or fallback.
 */

import katex from 'katex';

/**
 * Maximum source length rendered inline. A whole formula longer than this is
 * treated like an error: the chip shows the plain quote and the title keeps the
 * full source. The limit is in code points, not UTF-16 units.
 */
export const ANCHOR_FORMULA_MAX_CODEPOINTS = 96;

export interface AnchorFormulaRender {
  /** KaTeX HTML for the inline chip, or null when the caller must fall back. */
  html: string | null;
  /** Trimmed raw LaTeX, always present for the title/ARIA text. */
  plain: string;
}

/** Render a formula chip, or return the safe fallback marker. */
export function anchorFormulaRender(
  latex: string | null | undefined,
): AnchorFormulaRender {
  const plain = typeof latex === 'string' ? latex.trim() : '';
  if (plain.length === 0) return { html: null, plain };
  if (Array.from(plain).length > ANCHOR_FORMULA_MAX_CODEPOINTS) {
    return { html: null, plain };
  }
  try {
    return {
      html: katex.renderToString(plain, {
        displayMode: false,
        // Invalid source is a fallback, never a red error inside the chip.
        throwOnError: true,
        output: 'html',
        strict: 'ignore',
        trust: false,
      }),
      plain,
    };
  } catch {
    return { html: null, plain };
  }
}
