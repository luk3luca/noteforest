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

export interface AccentSet {
  /** Stored in settings; an unknown id falls back to the default. */
  id: string;
  label: string;
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
}

/**
 * The four approved accents (12 November 2026). Hover/contrast values complete
 * each set; the contrast test validates text-on-accent >= 4.5:1 and the
 * focus/control rings >= 3:1 against the shell surfaces.
 */
export const ACCENTS: readonly AccentSet[] = Object.freeze([
  Object.freeze({
    id: 'blue',
    label: 'Blue',
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
    dark: Object.freeze({
      accent: '#8fc7c0',
      strong: '#a9d9d3',
      soft: '#233432',
      hover: '#a3d5cd',
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
    dark: Object.freeze({
      accent: '#d6b17a',
      strong: '#e6c795',
      soft: '#3a3124',
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
    dark: Object.freeze({
      accent: '#d99aa8',
      strong: '#e7b3bf',
      soft: '#3a2830',
      hover: '#e3aab6',
      contrast: '#101418',
    }),
    light: Object.freeze({
      accent: '#9b3f55',
      strong: '#7d2f43',
      soft: '#f8e4e9',
      hover: '#7d2f43',
      contrast: '#ffffff',
    }),
  }),
]);

export const DEFAULT_ACCENT_ID = 'blue';

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
 * system, jetbrains). Unknown accent ids fall back to the default accent. The
 * result is a complete object; there is no partial appearance state.
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
