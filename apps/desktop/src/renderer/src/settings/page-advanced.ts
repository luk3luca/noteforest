/**
 * Advanced Page theme fields (Batch C).
 *
 * The frozen `PageTheme` already owns these values; this module is the UI side
 * of that model: strict raw-text parsing, frozen ranges, cross-field rules, and
 * partial per-document overrides. Nothing here clamps or rewrites a user value:
 * an invalid draft is reported and the write is blocked, so the model's
 * defensive sanitizer never turns a typed value into a different one.
 *
 * Editing an advanced typography/layout value marks the layer `custom` while
 * keeping the current resolved values (the frozen preset marker). A preset
 * switch would replace those values, so the controller warns first (Q-11).
 */

import type { PageSettingsOverride, PageTheme } from '@noteforest/layout';
import { PAGE_THEME_PRESETS } from '@noteforest/layout';
import { compactOverride } from './page-setup';

/**
 * Every numeric `PageTheme` field in the frozen model.
 *
 * The UI exposes only `EDITABLE_THEME_KEYS`; this list exists so a custom
 * baseline can preserve hidden engine values exactly instead of silently
 * snapping them to the global theme.
 */
export const PAGE_THEME_NUMERIC_KEYS = [
  'density',
  'fontScale',
  'bodyPt',
  'bodyLine',
  'headingScale',
  'heading1Pt',
  'heading2Pt',
  'heading3Pt',
  'codePt',
  'codeLine',
  'tablePt',
  'tableLine',
  'labelPt',
  'chromePt',
  'markerPt',
  'cardPadding',
  'cardBorder',
  'segmentGap',
  'siblingGap',
  'chapterGap',
  'wrapIndent',
  'maxWrapIndent',
  'childIndent',
  'childTrunkInset',
  'calloutTrunkInset',
  'calloutCardIndent',
  'calloutRightGap',
  'calloutModeMinWidth',
  'calloutGap',
  'maxCardWidth',
  'minContentWidth',
] as const satisfies readonly (keyof PageTheme)[];

export type PageThemeNumericKey = (typeof PAGE_THEME_NUMERIC_KEYS)[number];

/** Advanced typography, in the frozen order. */
export const ADVANCED_TYPOGRAPHY_KEYS = [
  'bodyPt',
  'bodyLine',
  'heading1Pt',
  'heading2Pt',
  'heading3Pt',
  'codePt',
  'codeLine',
  'tablePt',
  'tableLine',
  'labelPt',
] as const satisfies readonly PageThemeNumericKey[];

export type AdvancedTypographyKey = (typeof ADVANCED_TYPOGRAPHY_KEYS)[number];

/**
 * Advanced layout, in the frozen order. `maxCardWidth` is first-class.
 *
 * The three vertical Page gaps (child, top-level, callout) are editable Page
 * settings (ADR-0010). Only the horizontal right-group corridor, `childIndent`
 * and the callout lane/trunk fields stay hidden engine values
 * (`PAGE_EDGE_GEOMETRY`); their stored fields remain in the model for settings
 * compatibility but are not exposed here.
 */
export const ADVANCED_LAYOUT_KEYS = [
  'minContentWidth',
  'cardPadding',
  'cardBorder',
  'segmentGap',
  'siblingGap',
  'chapterGap',
  'calloutGap',
  'wrapIndent',
  'maxWrapIndent',
] as const satisfies readonly PageThemeNumericKey[];

export type AdvancedLayoutKey = (typeof ADVANCED_LAYOUT_KEYS)[number];

/** First-class Page card cap (inventory BX-14). */
export const MAX_CARD_WIDTH_KEY = 'maxCardWidth' as const;

/** Everything the Page advanced UI can edit, including the first-class cap. */
export const EDITABLE_THEME_KEYS = [
  ...ADVANCED_TYPOGRAPHY_KEYS,
  ...ADVANCED_LAYOUT_KEYS,
  MAX_CARD_WIDTH_KEY,
] as const;

export type EditableThemeKey = (typeof EDITABLE_THEME_KEYS)[number];

export type PageThemeUnit = 'pt' | 'px' | '×';

export interface PageThemeFieldSpec {
  label: string;
  unit: PageThemeUnit;
  min: number;
  max: number;
  step: number;
}

/**
 * Frozen ranges from `docs/design-tokens-page.md` / the settings inventory.
 *
 * These are the model's stored ranges. The density lens may then floor or band
 * the effective value; the UI never edits the effective value directly.
 */
export const PAGE_THEME_FIELD_SPECS: Readonly<
  Record<EditableThemeKey, PageThemeFieldSpec>
> = Object.freeze({
  bodyPt: { label: 'Body size', unit: 'pt', min: 6, max: 24, step: 0.5 },
  bodyLine: { label: 'Body line height', unit: '×', min: 1, max: 2.5, step: 0.05 },
  heading1Pt: { label: 'H1 size', unit: 'pt', min: 8, max: 40, step: 0.5 },
  heading2Pt: { label: 'H2 size', unit: 'pt', min: 7, max: 32, step: 0.5 },
  heading3Pt: { label: 'H3 size', unit: 'pt', min: 6, max: 28, step: 0.5 },
  codePt: { label: 'Code size', unit: 'pt', min: 5, max: 20, step: 0.5 },
  codeLine: { label: 'Code line height', unit: '×', min: 1, max: 2.5, step: 0.05 },
  tablePt: { label: 'Table size', unit: 'pt', min: 5, max: 20, step: 0.5 },
  tableLine: { label: 'Table line height', unit: '×', min: 1, max: 2.5, step: 0.05 },
  labelPt: { label: 'Block label size', unit: 'pt', min: 5, max: 20, step: 0.5 },
  minContentWidth: {
    label: 'Minimum content width',
    unit: 'px',
    min: 80,
    max: 800,
    step: 1,
  },
  cardPadding: { label: 'Card padding', unit: 'px', min: 0, max: 40, step: 1 },
  cardBorder: { label: 'Card border', unit: 'px', min: 0, max: 8, step: 1 },
  segmentGap: { label: 'Segment gap', unit: 'px', min: 0, max: 32, step: 1 },
  siblingGap: { label: 'Child gap', unit: 'px', min: 0, max: 96, step: 1 },
  chapterGap: { label: 'Top-level gap', unit: 'px', min: 0, max: 96, step: 1 },
  calloutGap: { label: 'Callout gap', unit: 'px', min: 0, max: 96, step: 1 },
  wrapIndent: { label: 'List indent', unit: 'px', min: 0, max: 96, step: 1 },
  maxWrapIndent: { label: 'Max list indent', unit: 'px', min: 0, max: 192, step: 1 },
  maxCardWidth: { label: 'Max card width', unit: 'px', min: 120, max: 2000, step: 1 },
});

export type PageThemeDraft = Record<EditableThemeKey, string>;

export interface PageThemeDraftValidation {
  valid: boolean;
  /** Parsed draft values, only when every field and cross-field rule passes. */
  values: Record<EditableThemeKey, number> | null;
  errors: Partial<Record<EditableThemeKey, string>>;
}

export const THEME_NUMBER_MESSAGE = 'Enter a number.';
export const THEME_LINE_MESSAGE = 'Enter a line-height multiplier.';

/** Format a stored value without trailing zeros. */
export function formatPageThemeNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Parse strict decimal input; empty, exponents, and units are rejected. */
export function parsePageThemeNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function pageThemeDraftFrom(theme: PageTheme): PageThemeDraft {
  const draft = {} as PageThemeDraft;
  for (const key of EDITABLE_THEME_KEYS) {
    draft[key] = formatPageThemeNumber(theme[key]);
  }
  return draft;
}

export function samePageThemeNumber(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9;
}

function rangeMessage(key: EditableThemeKey): string {
  const spec = PAGE_THEME_FIELD_SPECS[key];
  const range = `${formatPageThemeNumber(spec.min)} to ${formatPageThemeNumber(spec.max)}`;
  return spec.unit === '×' ? `Use a multiplier from ${range}.` : `Use a value from ${range} ${spec.unit}.`;
}

/**
 * Validate every editable Page theme draft against the frozen ranges and the
 * model's cross-field rules. No value is clamped or reset.
 */
export function validatePageThemeDrafts(
  draft: PageThemeDraft,
  _context?: { childTrunkInset: number },
): PageThemeDraftValidation {
  const errors: Partial<Record<EditableThemeKey, string>> = {};
  const parsed = {} as Record<EditableThemeKey, number>;

  for (const key of EDITABLE_THEME_KEYS) {
    const spec = PAGE_THEME_FIELD_SPECS[key];
    const value = parsePageThemeNumber(draft[key]);
    if (value === null) {
      errors[key] = spec.unit === '×' ? THEME_LINE_MESSAGE : THEME_NUMBER_MESSAGE;
      continue;
    }
    if (value < spec.min || value > spec.max) {
      errors[key] = rangeMessage(key);
      continue;
    }
    parsed[key] = value;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, values: null, errors };
  }

  // Headings stay above body (H1 +3, H2 +1.5, H3 +1). The density lens applies
  // the same floors; validating the stored pair avoids a silent effective clamp.
  const body = parsed.bodyPt;
  if (parsed.heading1Pt < body + 3) {
    errors.heading1Pt = `H1 must be at least 3 pt above the body size (${formatPageThemeNumber(
      body + 3,
    )} pt or more).`;
  }
  if (parsed.heading2Pt < body + 1.5) {
    errors.heading2Pt = `H2 must be at least 1.5 pt above the body size (${formatPageThemeNumber(
      body + 1.5,
    )} pt or more).`;
  }
  if (parsed.heading3Pt < body + 1) {
    errors.heading3Pt = `H3 must be at least 1 pt above the body size (${formatPageThemeNumber(
      body + 1,
    )} pt or more).`;
  }

  // The cap is applied per level; it cannot be below the wrap indent it caps.
  if (parsed.maxWrapIndent < parsed.wrapIndent) {
    errors.maxWrapIndent = `Max list indent must be at least the list indent (${formatPageThemeNumber(
      parsed.wrapIndent,
    )} px or more).`;
  }

  // `resolveTheme` raises the cap to the content floor; block the pair instead
  // of letting the model change only the cap.
  if (parsed.maxCardWidth < parsed.minContentWidth) {
    errors.maxCardWidth = `Max card width must be at least the minimum content width (${formatPageThemeNumber(
      parsed.minContentWidth,
    )} px or more).`;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, values: null, errors };
  }
  return { valid: true, values: parsed, errors: {} };
}

/** True when one editable theme field is explicitly stored on an override. */
export function isThemeFieldOverridden(
  override: PageSettingsOverride | undefined,
  key: EditableThemeKey,
): boolean {
  return override?.theme?.[key] !== undefined;
}

/** True when any of the given editable fields is explicitly stored. */
export function hasThemeFieldOverride(
  override: PageSettingsOverride | undefined,
  keys: readonly EditableThemeKey[],
): boolean {
  return keys.some((key) => override?.theme?.[key] !== undefined);
}

function replaceTheme(
  override: PageSettingsOverride | undefined,
  theme: Partial<PageTheme>,
): PageSettingsOverride | undefined {
  const next: PageSettingsOverride = { ...(override ?? {}) };
  if (Object.keys(theme).length === 0) delete next.theme;
  else next.theme = theme;
  return compactOverride(next);
}

/**
 * Store one partial theme field, dropping it when it equals the global value.
 * An equal-to-global value is not an override; it must follow later global
 * changes instead of pinning the current number.
 */
export function withThemeField(
  override: PageSettingsOverride | undefined,
  key: EditableThemeKey,
  value: number,
  globalTheme: PageTheme,
): PageSettingsOverride | undefined {
  const theme: Partial<PageTheme> = { ...(override?.theme ?? {}) };
  if (samePageThemeNumber(value, globalTheme[key])) delete theme[key];
  else theme[key] = value;
  return replaceTheme(override, theme);
}

/** Drop one theme field from the override. */
export function withoutThemeField(
  override: PageSettingsOverride | undefined,
  key: EditableThemeKey,
): PageSettingsOverride | undefined {
  return withoutThemeFields(override, [key]);
}

/**
 * Drop a group of theme fields. A `custom` marker that only existed for the
 * removed fields is dropped too; any remaining explicit value keeps it.
 */
export function withoutThemeFields(
  override: PageSettingsOverride | undefined,
  keys: readonly EditableThemeKey[],
): PageSettingsOverride | undefined {
  if (override?.theme === undefined) return override;
  const theme: Partial<PageTheme> = { ...override.theme };
  for (const key of keys) delete theme[key];
  if (theme.preset === 'custom') {
    // The first-class max card width is not a typography preset value: once no
    // advanced typography/layout field remains, the Custom marker is gone.
    const remaining = Object.keys(theme).filter(
      (key) => key !== 'preset' && key !== 'density' && key !== 'maxCardWidth',
    );
    if (remaining.length === 0) delete theme.preset;
  }
  return replaceTheme(override, theme);
}

/**
 * Freeze the current resolved theme into a custom document baseline.
 *
 * Every value that differs from the global theme is stored, including hidden
 * engine values, so the page keeps rendering exactly what the user saw. Values
 * equal to global are omitted and keep following the global layer.
 */
export function customThemeOverride(
  override: PageSettingsOverride | undefined,
  fullTheme: PageTheme,
  globalTheme: PageTheme,
): PageSettingsOverride | undefined {
  const theme: Partial<PageTheme> = {};
  const target = theme as Record<string, unknown>;
  for (const key of PAGE_THEME_NUMERIC_KEYS) {
    if (!samePageThemeNumber(fullTheme[key], globalTheme[key])) {
      target[key] = fullTheme[key];
    }
  }
  if (fullTheme.preset !== globalTheme.preset) theme.preset = fullTheme.preset;
  if (fullTheme.pagePacking !== globalTheme.pagePacking) {
    theme.pagePacking = fullTheme.pagePacking;
  }
  return replaceTheme(override, theme);
}

/**
 * Would switching to a non-custom preset replace explicit advanced values?
 *
 * Global settings store a complete theme, so a non-custom preset can still
 * carry a custom first-class value (for example `maxCardWidth`). The preset
 * baseline comparison catches it without inventing a second settings field.
 */
export function presetSwitchReplacesAdvancedValues(
  scope: 'global' | 'document',
  layerTheme: PageTheme,
  override: PageSettingsOverride | undefined,
): boolean {
  if (scope === 'document') {
    return (
      override?.theme?.preset === 'custom' ||
      hasThemeFieldOverride(override, EDITABLE_THEME_KEYS)
    );
  }
  if (layerTheme.preset === 'custom') return true;
  const baseline = PAGE_THEME_PRESETS[layerTheme.preset];
  return (
    EDITABLE_THEME_KEYS.some(
      (key) => !samePageThemeNumber(layerTheme[key], baseline[key]),
    ) || layerTheme.pagePacking !== baseline.pagePacking
  );
}
