/**
 * Snippet presentation for the sidebar Search list (docs/design/find-bar.md §3).
 *
 * The engine (`lib/find.ts`) owns the match and the one-line context around it:
 * `snippet` is already `…before MATCH after…` with ≈ 40 code points on each
 * side. The sidebar needs that same string split at the match so it can
 * emphasise the hit and let CSS clamp the row to two lines. This module only
 * *locates* the match inside the engine's own text — it never re-scans the
 * document and never decides what matches.
 *
 * The engine reports `snippetStart` (the match offset inside the field text the
 * snippet was cut from) and the snippet starts at `max(0, snippetStart -
 * context)`, so the match sits ≈ `min(snippetStart, context)` code points into
 * the body. Whitespace collapsing can shift that by a few characters; the
 * nearest occurrence wins, which is exact for every single-occurrence snippet
 * and still correct for a repeated word because the hint pins the right one.
 * Text matches carry the run-relative offset here, never the block-absolute
 * `FindResult.start`.
 */

import { FIND_SNIPPET_CONTEXT, findRanges } from './find';

const ELLIPSIS = '…';

export interface SnippetParts {
  /** True when the engine trimmed text before the snippet. */
  lead: boolean;
  before: string;
  /** The emphasised match; empty when it cannot be located in the snippet. */
  match: string;
  after: string;
  /** True when the engine trimmed text after the snippet. */
  trail: boolean;
}

/** The visible snippet body (no ellipses) and the match parts inside it. */
export function snippetParts(
  snippet: string,
  query: string,
  snippetStart: number,
  wholeWord = false,
  context = FIND_SNIPPET_CONTEXT,
): SnippetParts {
  const points = Array.from(snippet);
  const lead = points[0] === ELLIPSIS;
  const trail = points.length > 1 && points[points.length - 1] === ELLIPSIS;
  const from = lead ? 1 : 0;
  const to = trail ? points.length - 1 : points.length;
  const body = points.slice(from, to).join('');
  const plain: SnippetParts = { lead, before: body, match: '', after: '', trail };
  if (query.length === 0 || body.length === 0) return plain;

  // Code-point offsets inside the whole snippet, from the shared find matcher:
  // the same normalized, whitespace-loose query mode as the engine.
  const inside = findRanges(snippet, query, wholeWord).filter(
    (range) => range.start >= from && range.end <= to,
  );
  if (inside.length === 0) return plain;

  const hint = from + Math.min(Math.max(snippetStart, 0), context);
  let chosen = inside[0];
  let distance = Math.abs((chosen?.start ?? 0) - hint);
  for (const range of inside) {
    const candidate = Math.abs(range.start - hint);
    if (candidate < distance) {
      chosen = range;
      distance = candidate;
    }
  }
  if (chosen === undefined) return plain;

  return {
    lead,
    before: points.slice(from, chosen.start).join(''),
    match: points.slice(chosen.start, chosen.end).join(''),
    after: points.slice(chosen.end, to).join(''),
    trail,
  };
}
