/**
 * Shell appearance contract (R3): theme, accent registry, UI scale/font, and
 * the code font that reaches Page/PDF.
 *
 * This module is the single source for every shell appearance value. The
 * stylesheet never declares an accent color; the renderer applies the registry
 * values as root custom properties (`appearanceCssVariables`). Page and print
 * keep their own fixed light skin: of these values only the code font reaches
 * the paper, and it is part of the print/measure identity.
 *
 * Adding a palette is data: append one `AccentSet` with both theme value sets.
 * Components, the settings schema, and every test except registry coverage stay
 * unchanged.
 */

export type AppearanceTheme = 'dark' | 'light' | 'system';

export type UiScale = 0.9 | 1 | 1.1;

export type UiFontId = 'system' | 'serif';

export type CodeFontId = 'jetbrains' | 'system-mono';

/** Resolved mode after `system` is matched against the OS preference. */
export type ResolvedTheme = 'dark' | 'light';

/**
 * Code themes (B2). The settings schema validates the ids; the colour values
 * live in the renderer registry (`lib/code-themes.ts`), which is the product
 * source for every role, surface, and computed contrast label. Keeping the id
 * list here lets normalization reject an unknown theme without importing the
 * renderer.
 */
export type CodeThemeId = 'monokai' | 'one-light' | 'dark-plus' | 'light-plus';

/** The stored code-theme choice: `auto` follows the app theme. */
export type CodeThemeSetting = 'auto' | CodeThemeId;

/** Accent values for one theme. */
export interface AccentValues {
  /** Primary fill. */
  accent: string;
  /** Ring, focus, active edge; stronger than the fill. */
  strong: string;
  /** Selection/soft fill. */
  soft: string;
  /** Primary fill hover. */
  hover: string;
  /** Text/icon on the accent fill. */
  contrast: string;
}

/**
 * Accent families in the Appearance list. `pastel` is the initial four curated
 * sets; `vivid` is the second four approved on 12 November 2026. The group is
 * display metadata only: `accent` stays a validated id string.
 */
export type AccentGroup = 'pastel' | 'vivid';

export interface AccentSet {
  /** Stored in settings; an unknown id falls back to the default. */
  id: string;
  label: string;
  /** Appearance page group; adding a palette never changes the settings schema. */
  group: AccentGroup;
  dark: AccentValues;
  light: AccentValues;
}

export interface AppearanceSettings {
  theme: AppearanceTheme;
  /** Accent registry id. */
  accent: string;
  uiScale: UiScale;
  uiFont: UiFontId;
  codeFont: CodeFontId;
  /**
   * Code theme for the shell code blocks (B2). App-level, never per document;
   * `auto` resolves to Dark+ in the dark theme and Light+ in light. Page and
   * print keep their own fixed One Light roles.
   */
  codeTheme: CodeThemeSetting;
}

/**
 * The eight approved accents (12 November 2026): four pastel and four vivid.
 * Hover/contrast values complete each set; the contrast test validates
 * text-on-accent >= 4.5:1, the focus/control rings >= 3:1 against the shell
 * surfaces, and text-3 on the soft fill >= 4.5:1.
 */
export const ACCENTS: readonly AccentSet[] = Object.freeze([
  Object.freeze({
    id: 'blue',
    label: 'Blue',
    group: 'pastel',
    dark: Object.freeze({
      accent: '#9bb7d4',
      strong: '#b9d0e6',
      soft: '#26313c',
      hover: '#a9c3dc',
      contrast: '#101418',
    }),
    light: Object.freeze({
      accent: '#2f5f8a',
      strong: '#1f4a6d',
      soft: '#e2edf6',
      hover: '#264d71',
      contrast: '#ffffff',
    }),
  }),
  Object.freeze({
    id: 'teal',
    label: 'Teal',
    group: 'pastel',
    dark: Object.freeze({
      accent: '#89c0ba',
      strong: '#99d1ca',
      soft: '#233432',
      hover: '#92cac3',
      contrast: '#101418',
    }),
    light: Object.freeze({
      accent: '#1f6f66',
      strong: '#15564f',
      soft: '#e0f1ee',
      hover: '#175c55',
      contrast: '#ffffff',
    }),
  }),
  Object.freeze({
    id: 'amber',
    label: 'Amber',
    group: 'pastel',
    dark: Object.freeze({
      accent: '#d6b17a',
      strong: '#e6c795',
      soft: '#382f22',
      hover: '#e3c48f',
      contrast: '#101418',
    }),
    light: Object.freeze({
      accent: '#8a5a00',
      strong: '#6f4800',
      soft: '#fff2d6',
      hover: '#714900',
      contrast: '#ffffff',
    }),
  }),
  Object.freeze({
    id: 'rose',
    label: 'Rose',
    group: 'pastel',
    dark: Object.freeze({
      accent: '#e5a5b3',
      strong: '#f6b5c3',
      soft: '#3a2830',
      hover: '#efaebc',
      contrast: '#101418',
    }),
    light: Object.freeze({
      accent: '#9b3f55',
      strong: '#7d2f43',
      soft: '#f8e4e9',
      hover: '#873348',
      contrast: '#ffffff',
    }),
  }),
  Object.freeze({
    id: 'violet',
    label: 'Violet',
    group: 'vivid',
    dark: Object.freeze({
      accent: '#BE38F3',
      strong: '#D26BFF',
      soft: '#2A173A',
      hover: '#C94DFF',
      contrast: '#0B0F12',
    }),
    light: Object.freeze({
      accent: '#8B2BB8',
      strong: '#6F1E96',
      soft: '#F3E1FB',
      hover: '#7A25A6',
      contrast: '#FFFFFF',
    }),
  }),
  Object.freeze({
    id: 'magenta',
    label: 'Magenta',
    group: 'vivid',
    dark: Object.freeze({
      accent: '#F43F8E',
      strong: '#FF6BA8',
      soft: '#361524',
      hover: '#FF57A0',
      contrast: '#101418',
    }),
    light: Object.freeze({
      accent: '#B0185C',
      strong: '#8E124A',
      soft: '#FBE0EC',
      hover: '#9F1553',
      contrast: '#FFFFFF',
    }),
  }),
  Object.freeze({
    id: 'cyan',
    label: 'Cyan',
    group: 'vivid',
    dark: Object.freeze({
      accent: '#22D3EE',
      strong: '#67E8F9',
      soft: '#0C242B',
      hover: '#3BDDF3',
      contrast: '#101418',
    }),
    light: Object.freeze({
      accent: '#0E7490',
      strong: '#0B5F77',
      soft: '#DDF5FA',
      hover: '#0C6A84',
      contrast: '#FFFFFF',
    }),
  }),
  Object.freeze({
    id: 'orange',
    label: 'Orange',
    group: 'vivid',
    dark: Object.freeze({
      accent: '#FB923C',
      strong: '#FDBA74',
      soft: '#2C1E12',
      hover: '#FCA55A',
      contrast: '#101418',
    }),
    light: Object.freeze({
      accent: '#C2410C',
      strong: '#9A3412',
      soft: '#FDE8D7',
      hover: '#AD3A0B',
      contrast: '#FFFFFF',
    }),
  }),
]);

export const DEFAULT_ACCENT_ID = 'blue';

/** Appearance groups, in display order. */
export const ACCENT_GROUPS: readonly { id: AccentGroup; label: string }[] = Object.freeze([
  Object.freeze({ id: 'pastel', label: 'Pastel' }),
  Object.freeze({ id: 'vivid', label: 'Vivid' }),
]);

/** The registry entries of one group, in registry order. */
export function accentsInGroup(group: AccentGroup): readonly AccentSet[] {
  return ACCENTS.filter((accent) => accent.group === group);
}

export const THEMES: readonly AppearanceTheme[] = Object.freeze([
  'dark',
  'light',
  'system',
]);

export const UI_SCALES: readonly UiScale[] = Object.freeze([0.9, 1, 1.1]);

export const UI_FONTS: readonly UiFontId[] = Object.freeze(['system', 'serif']);

export const CODE_FONTS: readonly CodeFontId[] = Object.freeze([
  'jetbrains',
  'system-mono',
]);

/** The four registry ids, in picker order (dark, light, classic dark, classic light). */
export const CODE_THEME_IDS: readonly CodeThemeId[] = Object.freeze([
  'dark-plus',
  'light-plus',
  'monokai',
  'one-light',
]);

export const DEFAULT_CODE_THEME: CodeThemeSetting = 'auto';

/**
 * Shell UI font stacks. System fonts only; a bundled UI font would be a
 * dependency decision. Page/PDF never read this value.
 */
export const UI_FONT_STACKS: Readonly<Record<UiFontId, string>> = Object.freeze({
  system:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
  serif: 'ui-serif, "New York", "Iowan Old Style", Palatino, Georgia, serif',
});

/**
 * Code font stacks. Editor code, Page code, and PDF code read `--mono-font`;
 * this is the only appearance value that reaches the paper.
 */
export const CODE_FONT_STACKS: Readonly<Record<CodeFontId, string>> = Object.freeze({
  jetbrains: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  'system-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
});

export const DEFAULT_APPEARANCE: Readonly<AppearanceSettings> = Object.freeze({
  theme: 'dark',
  accent: DEFAULT_ACCENT_ID,
  uiScale: 1,
  uiFont: 'system',
  codeFont: 'jetbrains',
  codeTheme: DEFAULT_CODE_THEME,
});

export const DEFAULT_CODE_FONT: CodeFontId = 'jetbrains';

export function isAppearanceTheme(value: unknown): value is AppearanceTheme {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function isUiScale(value: unknown): value is UiScale {
  return value === 0.9 || value === 1 || value === 1.1;
}

export function isUiFont(value: unknown): value is UiFontId {
  return value === 'system' || value === 'serif';
}

export function isCodeFont(value: unknown): value is CodeFontId {
  return value === 'jetbrains' || value === 'system-mono';
}

export function isCodeThemeId(value: unknown): value is CodeThemeId {
  return CODE_THEME_IDS.some((id) => id === value);
}

/** `auto` or one registry id; anything else normalizes to `auto`. */
export function isCodeThemeSetting(value: unknown): value is CodeThemeSetting {
  return value === 'auto' || isCodeThemeId(value);
}

/** The registry entry for an id; unknown ids fall back to the default accent. */
export function accentSet(id: string | null | undefined): AccentSet {
  const found = ACCENTS.find((accent) => accent.id === id);
  if (found !== undefined) return found;
  const fallback = ACCENTS.find((accent) => accent.id === DEFAULT_ACCENT_ID);
  // The registry always contains the default; this is a compile-time guard.
  if (fallback === undefined) throw new Error('appearance: blue accent is missing');
  return fallback;
}

/** Resolve `system` against the OS preference; the stored value stays as-is. */
export function resolveTheme(
  theme: AppearanceTheme,
  prefersDark: boolean,
): ResolvedTheme {
  if (theme === 'system') return prefersDark ? 'dark' : 'light';
  return theme;
}

/** The accent values for one resolved theme. */
export function accentValues(
  id: string | null | undefined,
  theme: ResolvedTheme,
): AccentValues {
  return accentSet(id)[theme];
}

export function codeFontStack(id: string | null | undefined): string {
  return CODE_FONT_STACKS[isCodeFont(id) ? id : DEFAULT_CODE_FONT];
}

export function uiFontStack(id: string | null | undefined): string {
  return UI_FONT_STACKS[isUiFont(id) ? id : 'system'];
}

/**
 * Normalize one stored appearance object.
 *
 * Missing or invalid fields become the product defaults (dark, blue, 1,
 * system, jetbrains, auto). Unknown accent ids fall back to the default accent,
 * an unknown code theme falls back to `auto`. The result is a complete object;
 * there is no partial appearance state.
 */
export function normalizeAppearance(input?: unknown): AppearanceSettings {
  const record =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const accent = record['accent'];
  return {
    theme: isAppearanceTheme(record['theme']) ? record['theme'] : DEFAULT_APPEARANCE.theme,
    accent:
      typeof accent === 'string' && ACCENTS.some((entry) => entry.id === accent)
        ? accent
        : DEFAULT_ACCENT_ID,
    uiScale: isUiScale(record['uiScale']) ? record['uiScale'] : DEFAULT_APPEARANCE.uiScale,
    uiFont: isUiFont(record['uiFont']) ? record['uiFont'] : DEFAULT_APPEARANCE.uiFont,
    codeFont: isCodeFont(record['codeFont'])
      ? record['codeFont']
      : DEFAULT_APPEARANCE.codeFont,
    codeTheme: isCodeThemeSetting(record['codeTheme'])
      ? record['codeTheme']
      : DEFAULT_CODE_THEME,
  };
}

/**
 * Root custom properties for one resolved appearance.
 *
 * The renderer writes this map to `document.documentElement`; the stylesheet
 * consumes the roles through `var()`. The values are registry data, so a new
 * palette needs no CSS change.
 */
export function appearanceCssVariables(
  appearance: AppearanceSettings,
  theme: ResolvedTheme,
): Record<string, string> {
  const normalized = normalizeAppearance(appearance);
  const values = accentValues(normalized.accent, theme);
  return {
    '--accent': values.accent,
    '--accent-strong': values.strong,
    '--accent-soft': values.soft,
    '--accent-hover': values.hover,
    '--accent-contrast': values.contrast,
    '--ui-scale': String(normalized.uiScale),
    '--ui-font': uiFontStack(normalized.uiFont),
    '--mono-font': codeFontStack(normalized.codeFont),
  };
}
