/**
 * Code fence language parsing (special-text editing, area A).
 *
 * A paragraph whose text is exactly ```` ``` ```` or ```` ```lang ```` becomes
 * a code block on Enter (the space input rule already exists). The fence text
 * is the only language editor, so this module owns the pure mapping:
 * parse, normalize, and the display rule that hides the label for a plain
 * block.
 */

import { PLAINTEXT_LANGUAGE } from './special-text-constants';

export { PLAINTEXT_LANGUAGE };

/** The language token of a fence paragraph, or null when it is not a fence. */
export function parseCodeFenceParagraph(text: string): string | null {
  const match = /^```([^\s`]*)$/.exec(text);
  if (match === null) return null;
  return match[1] ?? '';
}

/** Store an empty or whitespace-only language as `plaintext`. */
export function normalizeCodeLanguage(value: string | null | undefined): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length === 0 ? PLAINTEXT_LANGUAGE : trimmed;
}

/**
 * Whether the idle header may show a language label. "Set" means a real
 * language: empty values and the plaintext placeholder never render a label.
 */
export function codeLanguageLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === PLAINTEXT_LANGUAGE) return null;
  return trimmed;
}

/** The fence text shown while editing; `plaintext` shows an empty token. */
export function codeFenceLanguageToken(value: unknown): string {
  return codeLanguageLabel(value) ?? '';
}
