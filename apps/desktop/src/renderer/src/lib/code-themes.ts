/**
 * Code theme registry (B2, design: code-themes.md, code-palette.md).
 *
 * One registry is the product source for every shell code theme: the eight
 * syntax roles, the theme's own code surface, and the ink that unhighlighted
 * text uses. The stylesheet is a second rendering of the same data
 * (`html[data-code-theme="…"]` blocks in `styles.css`), and a unit test proves
 * the two agree — no colour is typed in two places.
 *
 * Values are taken verbatim from the themes. Nothing here is recoloured:
 * Monokai and One Light keep the shipped classic palettes (they are the
 * documented product choice), and Dark+/Light+ are the VS Code defaults. A
 * theme brings its own surface, because our note card is tinted (in light,
 * Light+ `number`/`type` fall to 4.24/4.22 on `--note-surface` and pass on the
 * theme's own `#ffffff`).
 *
 * `auto` follows the app theme: dark → Dark+, light → Light+. Page Read/Edit
 * and the print compositor never read this module; the paper keeps its own
 * `--nf-page-code-*` One Light roles.
 */

import type { CodeThemeId, CodeThemeSetting, ResolvedTheme } from '@noteforest/layout';

/** The eight syntax roles every hljs rule maps onto. */
export type CodeRole =
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'type'
  | 'tag'
  | 'meta';

export const CODE_ROLES: readonly CodeRole[] = Object.freeze([
  'keyword',
  'string',
  'number',
  'comment',
  'function',
  'type',
  'tag',
  'meta',
]);

export interface CodeTheme {
  id: CodeThemeId;
  label: string;
  polarity: ResolvedTheme;
  /** The theme's own code background: the point of a theme. */
  surface: string;
  /** The theme's own editor foreground: unhighlighted code text. */
  text: string;
  roles: Readonly<Record<CodeRole, string>>;
}

/**
 * The four themes, in picker order. `dark-plus` and `light-plus` are the
 * defaults per polarity; `monokai` and `one-light` are the shipped classics.
 *
 * `tag`/`meta` follow the same theme: Dark+ uses its keyword blue for both,
 * Light+ has its own tag maroon and meta blue, and the two classics keep the
 * values from `docs/design/code-palette.md`.
 */
export const CODE_THEMES: readonly CodeTheme[] = Object.freeze([
  Object.freeze({
    id: 'dark-plus',
    label: 'Dark+',
    polarity: 'dark',
    surface: '#1e1e1e',
    text: '#d4d4d4',
    roles: Object.freeze({
      keyword: '#569cd6',
      string: '#ce9178',
      number: '#b5cea8',
      comment: '#6a9955',
      function: '#dcdcaa',
      type: '#4ec9b0',
      tag: '#569cd6',
      meta: '#569cd6',
    }),
  }),
  Object.freeze({
    id: 'light-plus',
    label: 'Light+',
    polarity: 'light',
    surface: '#ffffff',
    text: '#000000',
    roles: Object.freeze({
      keyword: '#0000ff',
      string: '#a31515',
      number: '#098658',
      comment: '#008000',
      function: '#795e26',
      type: '#267f99',
      tag: '#800000',
      meta: '#0000ff',
    }),
  }),
  Object.freeze({
    id: 'monokai',
    label: 'Monokai',
    polarity: 'dark',
    surface: '#272822',
    text: '#f8f8f2',
    roles: Object.freeze({
      keyword: '#f92672',
      string: '#e6db74',
      number: '#ae81ff',
      comment: '#75715e',
      function: '#a6e22e',
      type: '#66d9ef',
      tag: '#f92672',
      meta: '#fd971f',
    }),
  }),
  Object.freeze({
    id: 'one-light',
    label: 'One Light',
    polarity: 'light',
    surface: '#fafafa',
    text: '#383a42',
    roles: Object.freeze({
      keyword: '#a626a4',
      string: '#50a14f',
      number: '#986801',
      comment: '#a0a1a7',
      function: '#4078f2',
      type: '#c18401',
      tag: '#e45649',
      meta: '#986801',
    }),
  }),
]);

/** `auto` resolves by the app theme: dark → Dark+, light → Light+. */
export function resolveCodeTheme(
  setting: CodeThemeSetting | null | undefined,
  theme: ResolvedTheme,
): CodeTheme {
  const explicit = CODE_THEMES.find((entry) => entry.id === setting);
  if (explicit !== undefined) return explicit;
  const wanted = theme === 'dark' ? 'dark-plus' : 'light-plus';
  const fallback = CODE_THEMES.find((entry) => entry.id === wanted);
  // The registry always contains both defaults; this is a compile-time guard.
  if (fallback === undefined) throw new Error('code themes: default theme is missing');
  return fallback;
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match?.[1] === undefined) throw new Error(`not a hex colour: ${hex}`);
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

/** WCAG relative luminance of a `#rrggbb` value. */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHex(hex);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** WCAG 2 contrast ratio between two `#rrggbb` values (1–21). */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Every colour of one theme that must be readable on its own surface. */
function themeColours(theme: CodeTheme): readonly (readonly [string, string])[] {
  return [
    ...CODE_ROLES.map((role) => [role, theme.roles[role]] as const),
    ['text', theme.text] as const,
  ];
}

/** The weakest role of a theme and its ratio on that theme's own surface. */
export function worstContrastRole(theme: CodeTheme): { role: string; ratio: number } {
  let worst = { role: 'text', ratio: Number.POSITIVE_INFINITY };
  for (const [role, value] of themeColours(theme)) {
    const ratio = contrastRatio(value, theme.surface);
    if (ratio < worst.ratio) worst = { role, ratio };
  }
  return worst;
}

/** The minimum role contrast of a theme against its own surface. */
export function worstContrast(theme: CodeTheme): number {
  return worstContrastRole(theme).ratio;
}

/**
 * The measured label the picker shows: `AA 4.60` when every role passes the
 * 4.5:1 body-text bar, otherwise the bare worst ratio (`3.03`). Two decimals;
 * never typed by hand.
 */
export function contrastLabel(theme: CodeTheme): string {
  const worst = worstContrast(theme);
  const value = worst.toFixed(2);
  return worst >= 4.5 ? `AA ${value}` : value;
}

/** `Dark+ (dark) · AA 5.00` — the list mixes both polarities, so state it. */
export function codeThemeOptionLabel(theme: CodeTheme): string {
  return `${theme.label} (${theme.polarity}) · ${contrastLabel(theme)}`;
}
