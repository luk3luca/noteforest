/**
 * Highlighter session state and the `⇧⌘H` decision (F4b).
 *
 * The last used tone is session state, not a setting: it lives in renderer
 * module scope, survives tab switches and documents, and is gone on reload.
 * Nothing here is persisted with the document or with `settings.json`.
 */

import {
  DEFAULT_HIGHLIGHT_TONE,
  normalizeHighlightTone,
  type HighlightTone,
} from '@noteforest/core';

let lastTone: HighlightTone = DEFAULT_HIGHLIGHT_TONE;

/** The tone `⇧⌘H` applies (and toggles) right now. */
export function lastHighlightTone(): HighlightTone {
  return lastTone;
}

/** Remember one applied tone as the session's last tone. */
export function rememberHighlightTone(value: unknown): HighlightTone {
  lastTone = normalizeHighlightTone(value);
  return lastTone;
}

/** Test-only: start the session from the default again. */
export function resetHighlightSession(): void {
  lastTone = DEFAULT_HIGHLIGHT_TONE;
}

/** Sentence-case colour names for the swatches; no semantic wording. */
export const HIGHLIGHT_TONE_LABELS: Record<HighlightTone, string> = {
  blue: 'Blue',
  green: 'Green',
  amber: 'Amber',
  rose: 'Rose',
};

export type HighlightToggleAction = 'apply' | 'remove';

/**
 * What `⇧⌘H` does for the current selection. The selection is uniformly the
 * last tone → remove; every other case (no highlight, another tone, mixed
 * tones) applies it. Pure so the rule is pinned without an editor.
 */
export function highlightToggleAction(uniformLastTone: boolean): HighlightToggleAction {
  return uniformLastTone ? 'remove' : 'apply';
}
