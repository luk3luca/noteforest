/**
 * Apply the shell appearance contract (R3, B2).
 *
 * The theme is a data attribute on the root (`html[data-theme]`) and so is the
 * resolved code theme (`html[data-code-theme]`); the accent scale plus UI
 * fonts/scale are root custom properties from the registry. This is the only
 * writer of those values: no component declares a color.
 *
 * `system` resolves against `prefers-color-scheme`; the caller re-applies on a
 * media change. Page and print never read `--ui-*`; only `--mono-font` (the code
 * font) reaches the paper, and the code theme never does.
 */

import {
  appearanceCssVariables,
  normalizeAppearance,
  resolveTheme,
  type AppearanceSettings,
  type ResolvedTheme,
} from '@noteforest/layout';
import { resolveCodeTheme } from './code-themes';

export interface AppearanceTarget {
  style: {
    setProperty(name: string, value: string): void;
  };
  dataset: Record<string, string | undefined>;
}

export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function prefersDarkNow(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia(DARK_MEDIA_QUERY).matches;
}

/**
 * Write one appearance to the root. Returns the resolved theme so callers can
 * mirror it (`color-scheme`, toast theme) without reading it back.
 *
 * The root gets two attributes: `data-theme` (the shell) and `data-code-theme`
 * (the resolved code theme, `auto` included). They are written in one call so
 * the first paint already has the right code palette, and the stylesheet blocks
 * are the only rendering of the registry values.
 */
export function applyAppearance(
  appearance: AppearanceSettings,
  options: { prefersDark: boolean; target?: AppearanceTarget },
): ResolvedTheme {
  const normalized = normalizeAppearance(appearance);
  const resolved = resolveTheme(normalized.theme, options.prefersDark);
  const target = options.target ?? document.documentElement;
  target.dataset['theme'] = resolved;
  target.dataset['codeTheme'] = resolveCodeTheme(normalized.codeTheme, resolved).id;
  for (const [name, value] of Object.entries(
    appearanceCssVariables(normalized, resolved),
  )) {
    target.style.setProperty(name, value);
  }
  return resolved;
}
