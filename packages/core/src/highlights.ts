/**
 * Text highlight contract (F4b, docs/design/highlight.md §2–§3).
 *
 * A highlight is an inline text mark with exactly one attribute: a tone id.
 * Four tones, colour names, no semantics: the schema does not decide that
 * green means "done". There is no id, no metadata and no comment text; notes
 * on text are the annotation layer and stay out of v1.
 *
 * Canonical content is open JSON and marks are not whitelisted, so the mark is
 * **additive**: a document with or without highlights keeps the same
 * `schemaVersion`, and this module never rewrites content. It only answers what
 * a tone id is: the renderer, the editor schema, and the selection bubble read
 * the same list, and an unknown id degrades to the default tone instead of
 * crashing a render or dropping the mark.
 */

/** The canonical inline mark name. */
export const HIGHLIGHT_MARK_TYPE = 'highlight';

/**
 * The four tones in presentation order. The order is the bubble's swatch order
 * and the fallback order for an unknown id (the first tone is the default).
 */
export const HIGHLIGHT_TONES = ['blue', 'green', 'amber', 'rose'] as const;

export type HighlightTone = (typeof HIGHLIGHT_TONES)[number];

/** Used for an unknown/missing tone and as the session's first tone. */
export const DEFAULT_HIGHLIGHT_TONE: HighlightTone = 'blue';

export function isHighlightTone(value: unknown): value is HighlightTone {
  return (
    typeof value === 'string' && (HIGHLIGHT_TONES as readonly string[]).includes(value)
  );
}

/**
 * Normalize a stored tone. Unknown values (a future tone, a corrupt file, a
 * missing attribute) become the default; it never throws and never drops the
 * mark, so a highlight is always visible.
 */
export function normalizeHighlightTone(value: unknown): HighlightTone {
  return isHighlightTone(value) ? value : DEFAULT_HIGHLIGHT_TONE;
}
