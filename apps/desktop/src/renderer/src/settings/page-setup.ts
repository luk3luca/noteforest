/**
 * Pure Page setup/margins helpers for the Settings page.
 *
 * The frozen settings model already owns clamping and fallbacks. The UI must
 * never rely on those fallbacks for user input: an invalid margin has to block
 * the write and show an inline error instead of silently becoming 12 mm. These
 * helpers therefore validate the raw field text before any store write, and
 * keep per-field overrides partial so a later global change still propagates.
 */

import type {
  MarginsMm,
  Orientation,
  PageSettingsOverride,
  PageSetup,
  PageSize,
} from '@noteforest/layout';
import { pageDimensionsMm } from '@noteforest/layout';

export type MarginKey = keyof MarginsMm;

export const MARGIN_KEYS: readonly MarginKey[] = ['top', 'right', 'bottom', 'left'];

/** UI limits; the layout model clamps to the same band as a defensive fallback. */
export const PAGE_MARGIN_MAX_MM = 100;
export const PAGE_MIN_CONTENT_MM = 20;

export const MARGIN_NUMBER_MESSAGE = 'Enter a margin in millimetres.';
export const MARGIN_RANGE_MESSAGE = 'Use a value from 0 to 100 mm.';

export type MarginDraft = Record<MarginKey, string>;

export interface MarginValidation {
  valid: boolean;
  /** Parsed margins, only when every field is valid. */
  margins: MarginsMm | null;
  fieldErrors: Partial<Record<MarginKey, string>>;
  /** One summary for the group alert; field errors stay specific. */
  groupError: string | null;
}

/** Format a millimetre value for an input without trailing zeros. */
export function formatMm(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function marginDraftFrom(margins: MarginsMm): MarginDraft {
  return {
    top: formatMm(margins.top),
    right: formatMm(margins.right),
    bottom: formatMm(margins.bottom),
    left: formatMm(margins.left),
  };
}

/** Parse strict decimal input; empty, exponents, and units are rejected. */
export function parseMm(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function sameMm(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-9;
}

export function marginDraftsEqual(left: MarginDraft, right: MarginDraft): boolean {
  return MARGIN_KEYS.every((key) => {
    const a = parseMm(left[key]);
    const b = parseMm(right[key]);
    return a !== null && b !== null && sameMm(a, b);
  });
}

/**
 * Validate four raw margin fields against one page geometry.
 *
 * Range errors are per field. Content errors belong to the axis pair and mark
 * both fields so `aria-describedby` reaches the same explanation from any of
 * them. No value is clamped or repaired here.
 */
export function validateMargins(
  draft: MarginDraft,
  size: PageSize,
  orientation: Orientation,
): MarginValidation {
  const fieldErrors: Partial<Record<MarginKey, string>> = {};
  const parsed: Partial<Record<MarginKey, number>> = {};

  for (const key of MARGIN_KEYS) {
    const value = parseMm(draft[key]);
    if (value === null) {
      fieldErrors[key] = MARGIN_NUMBER_MESSAGE;
      continue;
    }
    if (value < 0 || value > PAGE_MARGIN_MAX_MM) {
      fieldErrors[key] = MARGIN_RANGE_MESSAGE;
      continue;
    }
    parsed[key] = value;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      valid: false,
      margins: null,
      fieldErrors,
      groupError: Object.values(fieldErrors).some(
        (message) =>
          message === MARGIN_NUMBER_MESSAGE || message === MARGIN_RANGE_MESSAGE,
      )
        ? 'Enter a number from 0 to 100 mm for each margin.'
        : `Margins must leave at least ${PAGE_MIN_CONTENT_MM} mm of content in each direction.`,
    };
  }

  const margins: MarginsMm = {
    top: parsed.top as number,
    right: parsed.right as number,
    bottom: parsed.bottom as number,
    left: parsed.left as number,
  };
  const { widthMm, heightMm } = pageDimensionsMm(size, orientation);
  const horizontal = margins.left + margins.right;
  const vertical = margins.top + margins.bottom;
  const minWidth = widthMm - PAGE_MIN_CONTENT_MM;
  const minHeight = heightMm - PAGE_MIN_CONTENT_MM;

  if (horizontal > minWidth + 1e-9) {
    fieldErrors.left = `Left and right margins leave less than ${PAGE_MIN_CONTENT_MM} mm of content on a ${formatMm(
      widthMm,
    )} mm page.`;
    fieldErrors.right = fieldErrors.left;
  }
  if (vertical > minHeight + 1e-9) {
    fieldErrors.top = `Top and bottom margins leave less than ${PAGE_MIN_CONTENT_MM} mm of content on a ${formatMm(
      heightMm,
    )} mm page.`;
    fieldErrors.bottom = fieldErrors.top;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      valid: false,
      margins: null,
      fieldErrors,
      groupError: `Margins must leave at least ${PAGE_MIN_CONTENT_MM} mm of content in each direction.`,
    };
  }

  return { valid: true, margins, fieldErrors: {}, groupError: null };
}

/** True when one margin field is explicitly stored on a document override. */
export function marginOverridden(
  override: PageSettingsOverride | undefined,
  key: MarginKey,
): boolean {
  return override?.setup?.margins?.[key] !== undefined;
}

export function hasSetupOverride(override: PageSettingsOverride | undefined): boolean {
  const setup = override?.setup;
  if (setup === undefined) return false;
  return (
    setup.size !== undefined ||
    setup.orientation !== undefined ||
    (setup.margins !== undefined && Object.keys(setup.margins).length > 0)
  );
}

export function hasMarginOverride(override: PageSettingsOverride | undefined): boolean {
  const margins = override?.setup?.margins;
  return margins !== undefined && Object.keys(margins).length > 0;
}

export function hasThemeOverride(override: PageSettingsOverride | undefined): boolean {
  return override?.theme !== undefined && Object.keys(override.theme).length > 0;
}

function cloneOverride(override: PageSettingsOverride | undefined): PageSettingsOverride {
  const next: PageSettingsOverride = { ...(override ?? {}) };
  if (next.setup !== undefined) {
    next.setup = {
      ...next.setup,
      ...(next.setup.margins === undefined
        ? {}
        : { margins: { ...next.setup.margins } }),
    };
  }
  if (next.theme !== undefined) next.theme = { ...next.theme };
  return next;
}

/** Drop empty groups; an empty override means "use the global settings". */
export function compactOverride(
  override: PageSettingsOverride | undefined,
): PageSettingsOverride | undefined {
  if (override === undefined) return undefined;
  const next = cloneOverride(override);
  if (next.setup !== undefined) {
    if (next.setup.margins !== undefined && Object.keys(next.setup.margins).length === 0) {
      delete next.setup.margins;
    }
    if (
      next.setup.size === undefined &&
      next.setup.orientation === undefined &&
      next.setup.margins === undefined
    ) {
      delete next.setup;
    }
  }
  if (next.theme !== undefined && Object.keys(next.theme).length === 0) {
    delete next.theme;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

/** Store/remove one size or orientation override, auto-removing an equal value. */
export function withSetupField(
  override: PageSettingsOverride | undefined,
  field: 'size' | 'orientation',
  value: PageSetup[typeof field],
  globalSetup: PageSetup,
): PageSettingsOverride | undefined {
  const next = cloneOverride(override);
  const setup = { ...(next.setup ?? {}) };
  if (value === globalSetup[field]) {
    if (field === 'size') delete setup.size;
    else delete setup.orientation;
  } else if (field === 'size') {
    setup.size = value as PageSize;
  } else {
    setup.orientation = value as Orientation;
  }
  if (Object.keys(setup).length === 0) delete next.setup;
  else next.setup = setup;
  return compactOverride(next);
}

/**
 * Store all four margins on a document override, dropping each value that is
 * already the global value. An all-equal group therefore removes the override.
 */
export function withMargins(
  override: PageSettingsOverride | undefined,
  margins: MarginsMm,
  globalSetup: PageSetup,
): PageSettingsOverride | undefined {
  const next = cloneOverride(override);
  const setup = { ...(next.setup ?? {}) };
  const stored: Partial<MarginsMm> = { ...(setup.margins ?? {}) };
  for (const key of MARGIN_KEYS) {
    if (sameMm(margins[key], globalSetup.margins[key])) delete stored[key];
    else stored[key] = margins[key];
  }
  if (Object.keys(stored).length === 0) delete setup.margins;
  else setup.margins = stored;
  if (Object.keys(setup).length === 0) delete next.setup;
  else next.setup = setup;
  return compactOverride(next);
}

export function withoutSetup(
  override: PageSettingsOverride | undefined,
): PageSettingsOverride | undefined {
  if (override === undefined) return undefined;
  const { setup: _setup, ...rest } = override;
  return compactOverride(rest);
}

export function withoutTheme(
  override: PageSettingsOverride | undefined,
): PageSettingsOverride | undefined {
  if (override === undefined) return undefined;
  const { theme: _theme, ...rest } = override;
  return compactOverride(rest);
}

export function withoutSetupField(
  override: PageSettingsOverride | undefined,
  field: 'size' | 'orientation',
): PageSettingsOverride | undefined {
  if (override === undefined) return undefined;
  const next = cloneOverride(override);
  if (next.setup !== undefined) {
    if (field === 'size') delete next.setup.size;
    else delete next.setup.orientation;
  }
  return compactOverride(next);
}

export function withoutMargin(
  override: PageSettingsOverride | undefined,
  key: MarginKey,
): PageSettingsOverride | undefined {
  if (override === undefined) return undefined;
  const next = cloneOverride(override);
  if (next.setup?.margins !== undefined) delete next.setup.margins[key];
  return compactOverride(next);
}

export function withoutMargins(
  override: PageSettingsOverride | undefined,
): PageSettingsOverride | undefined {
  if (override === undefined) return undefined;
  const next = cloneOverride(override);
  if (next.setup !== undefined) delete next.setup.margins;
  return compactOverride(next);
}
