/**
 * Personal page settings: page size, margins, and the page typography theme.
 *
 * ADR-0008 makes the canonical document a continuous canvas. Page geometry and
 * density are a personal lens applied by the page renderer, measurement host,
 * and PDF export; they are never stored in `document.json`. This module is the
 * single pure source for those values. It has no DOM, Electron, React, or editor
 * imports.
 */

import type { LayoutOptions, Orientation, PagePacking } from './types.js';
import { DEFAULT_LAYOUT_OPTIONS } from './types.js';

export type PageSize = 'A4' | 'A5' | 'Letter';

export interface MarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageSetup {
  size: PageSize;
  orientation: Orientation;
  margins: MarginsMm;
}

export interface PageGeometry {
  pageWidthMm: number;
  pageHeightMm: number;
  pageWidthPx: number;
  pageHeightPx: number;
  contentWidthPx: number;
  contentHeightPx: number;
  marginsPx: MarginsMm;
}

export type PageThemePreset = 'compact' | 'comfortable' | 'custom';

/**
 * Page typography and box theme.
 *
 * Font values are in points at 96 dpi CSS; box values are in layout pixels.
 * `fontScale` multiplies every type size, while `headingScale` additionally
 * multiplies the three heading sizes.
 */
export interface PageTheme {
  preset: PageThemePreset;
  fontScale: number;
  bodyPt: number;
  bodyLine: number;
  headingScale: number;
  heading1Pt: number;
  heading2Pt: number;
  heading3Pt: number;
  codePt: number;
  codeLine: number;
  tablePt: number;
  tableLine: number;
  labelPt: number;
  chromePt: number;
  markerPt: number;
  cardPadding: number;
  cardBorder: number;
  segmentGap: number;
  siblingGap: number;
  wrapIndent: number;
  maxWrapIndent: number;
  /**
   * Page-only direct-child indent from the parent left when a whole child group
   * wraps below it. It replaces the old hardcoded trunk-stem indent so Page
   * themes can tune it without touching Continuous.
   */
  childIndent: number;
  /** Below-trunk inset for the direct-child group in callout mode B2. */
  childTrunkInset: number;
  /** Below-trunk inset for the anchored-callout group in callout mode B2. */
  calloutTrunkInset: number;
  /** Callout card left offset from the parent left in callout mode B2. */
  calloutCardIndent: number;
  /** Gap from the parent right edge to the mode A callout lane. */
  calloutRightGap: number;
  /** Minimum free right space that selects callout mode A. */
  calloutModeMinWidth: number;
  calloutGap: number;
  maxCardWidth: number;
  minContentWidth: number;
  /**
   * Page/PDF packing policy. `stacked` is the R2a geometry; `beside` starts the
   * direct-child group at the parent's y while anchored callouts stay below;
   * `compaction` is the legacy row-fill lab oracle and is not a preset.
   * Continuous does not read this field.
   */
  pagePacking: PagePacking;
}

export interface PageSettings {
  setup: PageSetup;
  theme: PageTheme;
  /** Personal manual page-break hints; never canonical document content. */
  manualBreakBeforeBlockIds: string[];
}

/** Continuous layout is page-free; only zoom exists in this foundation slice. */
export interface ContinuousSettings {
  zoom: number;
}

export interface AppSettings {
  page: PageSettings;
  continuous: ContinuousSettings;
}

export interface PageSetupOverride {
  size?: PageSize;
  orientation?: Orientation;
  margins?: Partial<MarginsMm>;
}

export interface PageSettingsOverride {
  setup?: PageSetupOverride;
  theme?: Partial<PageTheme>;
  manualBreakBeforeBlockIds?: readonly string[];
}

export interface ContinuousSettingsOverride {
  zoom?: number;
}

/** Compact is the dense reading preset and the product default. */
const COMPACT_THEME: PageTheme = Object.freeze({
  preset: 'compact',
  fontScale: 1,
  bodyPt: 9,
  bodyLine: 1.3,
  headingScale: 1,
  heading1Pt: 14,
  heading2Pt: 12,
  heading3Pt: 10.5,
  codePt: 8,
  codeLine: 1.3,
  tablePt: 8.5,
  tableLine: 1.25,
  labelPt: 9,
  chromePt: 7.5,
  markerPt: 7,
  cardPadding: 8,
  cardBorder: 1,
  segmentGap: 4,
  siblingGap: 16,
  wrapIndent: 12,
  maxWrapIndent: 36,
  childIndent: 26,
  childTrunkInset: 12,
  calloutTrunkInset: 24,
  calloutCardIndent: 38,
  calloutRightGap: 24,
  calloutModeMinWidth: 240,
  calloutGap: 12,
  maxCardWidth: 420,
  minContentWidth: 160,
  // Product-owner tree model (8 November 2026): direct children share one
  // vertical level column; a child group goes right when it fits, otherwise it
  // wraps below the parent at the group-left origin. Callouts stay below the
  // parent. `compaction` row fill is a legacy density oracle, not a preset.
  pagePacking: 'beside',
});

/**
 * Comfortable preserves the pre-R1 page density (M4b1/M4b1c visual baseline).
 */
const COMFORTABLE_THEME: PageTheme = Object.freeze({
  preset: 'comfortable',
  fontScale: 1,
  bodyPt: 10.5,
  bodyLine: 1.45,
  headingScale: 1,
  heading1Pt: 16,
  heading2Pt: 13.5,
  heading3Pt: 12,
  codePt: 8.75,
  codeLine: 1.45,
  tablePt: 9.5,
  tableLine: 1.35,
  labelPt: 11,
  chromePt: 8,
  markerPt: 7.5,
  cardPadding: 12,
  cardBorder: 1,
  segmentGap: 8,
  siblingGap: 24,
  wrapIndent: 18,
  maxWrapIndent: 54,
  childIndent: 26,
  childTrunkInset: 12,
  calloutTrunkInset: 24,
  calloutCardIndent: 38,
  calloutRightGap: 24,
  calloutModeMinWidth: 240,
  calloutGap: 20,
  maxCardWidth: 420,
  minContentWidth: 160,
  pagePacking: 'stacked',
});

export const PAGE_THEME_PRESETS: Readonly<
  Record<Exclude<PageThemePreset, 'custom'>, PageTheme>
> = Object.freeze({
  compact: COMPACT_THEME,
  comfortable: COMFORTABLE_THEME,
});

export const DEFAULT_PAGE_SETTINGS: Readonly<PageSettings> = Object.freeze({
  setup: Object.freeze({
    size: 'A4',
    orientation: 'landscape',
    margins: Object.freeze({ top: 12, right: 12, bottom: 12, left: 12 }),
  }),
  theme: COMPACT_THEME,
  manualBreakBeforeBlockIds: Object.freeze([]) as unknown as string[],
});

export const DEFAULT_CONTINUOUS_SETTINGS: Readonly<ContinuousSettings> = Object.freeze({
  zoom: 1,
});

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  page: DEFAULT_PAGE_SETTINGS,
  continuous: DEFAULT_CONTINUOUS_SETTINGS,
});

/** Fixed page dimensions in millimetres, before margins. */
export function pageDimensionsMm(
  size: PageSize,
  orientation: Orientation,
): { widthMm: number; heightMm: number } {
  let widthMm: number;
  let heightMm: number;
  switch (size) {
    case 'A5':
      widthMm = 148;
      heightMm = 210;
      break;
    case 'Letter':
      widthMm = 215.9;
      heightMm = 279.4;
      break;
    case 'A4':
    default:
      widthMm = 210;
      heightMm = 297;
      break;
  }
  return orientation === 'portrait'
    ? { widthMm, heightMm }
    : { widthMm: heightMm, heightMm: widthMm };
}

export const PX_PER_MM = 96 / 25.4;
export const MM_PER_PX = 25.4 / 96;

export function pxToMm(px: number): number {
  return px * MM_PER_PX;
}

export function mmToPx(mm: number): number {
  return mm * PX_PER_MM;
}

/** Page and content-box geometry for one explicit page setup. */
export function pageGeometry(setup: PageSetup): PageGeometry {
  const { widthMm, heightMm } = pageDimensionsMm(setup.size, setup.orientation);
  const pageWidthPx = mmToPx(widthMm);
  const pageHeightPx = mmToPx(heightMm);
  const marginsPx: MarginsMm = {
    top: mmToPx(setup.margins.top),
    right: mmToPx(setup.margins.right),
    bottom: mmToPx(setup.margins.bottom),
    left: mmToPx(setup.margins.left),
  };
  return {
    pageWidthMm: widthMm,
    pageHeightMm: heightMm,
    pageWidthPx,
    pageHeightPx,
    contentWidthPx: pageWidthPx - marginsPx.left - marginsPx.right,
    contentHeightPx: pageHeightPx - marginsPx.top - marginsPx.bottom,
    marginsPx,
  };
}

/** Map a page theme onto the pure layout tuning options. */
export function pageLayoutOptions(theme: PageTheme): LayoutOptions {
  return {
    minContentWidth: theme.minContentWidth,
    maxContentWidth: theme.maxCardWidth,
    siblingGap: theme.siblingGap,
    wrapIndent: theme.wrapIndent,
    maxWrapIndent: theme.maxWrapIndent,
    childIndent: theme.childIndent,
    childTrunkInset: theme.childTrunkInset,
    calloutTrunkInset: theme.calloutTrunkInset,
    calloutCardIndent: theme.calloutCardIndent,
    calloutRightGap: theme.calloutRightGap,
    calloutModeMinWidth: theme.calloutModeMinWidth,
    // R2j callout modes belong to the beside tree packing. The explicit
    // `stacked` policy keeps the historical geometry as its own oracle.
    calloutModes: theme.pagePacking === 'beside',
    wrapPolicy: DEFAULT_LAYOUT_OPTIONS.wrapPolicy,
    pagePacking: theme.pagePacking,
    calloutGap: theme.calloutGap,
    chapterGap: DEFAULT_LAYOUT_OPTIONS.chapterGap,
    cardPadding: theme.cardPadding,
    cardBorder: theme.cardBorder,
    segmentGap: theme.segmentGap,
  };
}

function cssNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

/**
 * CSS custom properties for page typography and box metrics.
 *
 * `styles.css` consumes the variables; it never hardcodes a second copy of the
 * theme. R1b writes this map to the page sheet and measurement host.
 */
export function pageCssVariables(theme: PageTheme): Record<string, string> {
  const font = theme.fontScale;
  const heading = theme.fontScale * theme.headingScale;
  return {
    '--nf-page-body-size': `${cssNumber(theme.bodyPt * font)}pt`,
    '--nf-page-body-line': cssNumber(theme.bodyLine),
    '--nf-page-label-size': `${cssNumber(theme.labelPt * font)}pt`,
    '--nf-page-heading-1': `${cssNumber(theme.heading1Pt * heading)}pt`,
    '--nf-page-heading-2': `${cssNumber(theme.heading2Pt * heading)}pt`,
    '--nf-page-heading-3': `${cssNumber(theme.heading3Pt * heading)}pt`,
    '--nf-page-code-size': `${cssNumber(theme.codePt * font)}pt`,
    '--nf-page-code-line': cssNumber(theme.codeLine),
    '--nf-page-table-size': `${cssNumber(theme.tablePt * font)}pt`,
    '--nf-page-table-line': cssNumber(theme.tableLine),
    '--nf-page-chrome-size': `${cssNumber(theme.chromePt * font)}pt`,
    '--nf-page-marker-size': `${cssNumber(theme.markerPt * font)}pt`,
    '--nf-page-card-padding': `${cssNumber(theme.cardPadding)}px`,
    '--nf-page-card-border': `${cssNumber(theme.cardBorder)}px`,
    '--nf-page-segment-gap': `${cssNumber(theme.segmentGap)}px`,
    '--nf-page-sibling-gap': `${cssNumber(theme.siblingGap)}px`,
    '--nf-page-wrap-indent': `${cssNumber(theme.wrapIndent)}px`,
    '--nf-page-max-wrap-indent': `${cssNumber(theme.maxWrapIndent)}px`,
    '--nf-page-child-indent': `${cssNumber(theme.childIndent)}px`,
    '--nf-page-child-trunk-inset': `${cssNumber(theme.childTrunkInset)}px`,
    '--nf-page-callout-trunk-inset': `${cssNumber(theme.calloutTrunkInset)}px`,
    '--nf-page-callout-card-indent': `${cssNumber(theme.calloutCardIndent)}px`,
    '--nf-page-callout-right-gap': `${cssNumber(theme.calloutRightGap)}px`,
    '--nf-page-callout-mode-min-width': `${cssNumber(theme.calloutModeMinWidth)}px`,
    '--nf-page-callout-gap': `${cssNumber(theme.calloutGap)}px`,
    '--nf-page-max-card-width': `${cssNumber(theme.maxCardWidth)}px`,
    '--nf-page-min-content-width': `${cssNumber(theme.minContentWidth)}px`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPageSize(value: unknown): value is PageSize {
  return value === 'A4' || value === 'A5' || value === 'Letter';
}

function isOrientation(value: unknown): value is Orientation {
  return value === 'portrait' || value === 'landscape';
}

function isPreset(value: unknown): value is PageThemePreset {
  return value === 'compact' || value === 'comfortable' || value === 'custom';
}

function isPagePacking(value: unknown): value is PagePacking {
  return value === 'stacked' || value === 'beside' || value === 'compaction';
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function sanitizeSetup(input: unknown): PageSetup {
  const defaults = DEFAULT_PAGE_SETTINGS.setup;
  const record = isRecord(input) ? input : {};
  const size = isPageSize(record['size']) ? record['size'] : defaults.size;
  const orientation = isOrientation(record['orientation'])
    ? record['orientation']
    : defaults.orientation;
  const marginsRaw = isRecord(record['margins']) ? record['margins'] : {};
  const margins: MarginsMm = {
    top: finiteNumber(marginsRaw['top'], defaults.margins.top, 0, 100),
    right: finiteNumber(marginsRaw['right'], defaults.margins.right, 0, 100),
    bottom: finiteNumber(marginsRaw['bottom'], defaults.margins.bottom, 0, 100),
    left: finiteNumber(marginsRaw['left'], defaults.margins.left, 0, 100),
  };
  const { widthMm, heightMm } = pageDimensionsMm(size, orientation);
  const horizontal = margins.left + margins.right;
  const vertical = margins.top + margins.bottom;
  // Keep at least 20 mm of content in each axis; impossible margins fall back
  // to the known-good defaults rather than producing a zero-sized page.
  if (horizontal > widthMm - 20 || vertical > heightMm - 20) {
    return { size, orientation, margins: { ...defaults.margins } };
  }
  return { size, orientation, margins };
}

function resolveTheme(
  input: unknown,
  baseTheme?: PageTheme,
): PageTheme {
  const override = isRecord(input) ? input : {};
  const preset = isPreset(override['preset'])
    ? override['preset']
    : baseTheme?.preset ?? 'compact';
  const presetBase: PageTheme =
    preset === 'custom'
      ? baseTheme ?? COMPACT_THEME
      : PAGE_THEME_PRESETS[preset];
  const base = preset === baseTheme?.preset && baseTheme !== undefined ? baseTheme : presetBase;
  const baseFor = (key: keyof PageTheme, fallback: number): number => {
    const value = base[key];
    return typeof value === 'number' ? value : fallback;
  };
  const clamp = (key: keyof PageTheme, fallback: number, min: number, max: number): number =>
    finiteNumber(override[key], baseFor(key, fallback), min, max);

  const fontScale = clamp('fontScale', 1, 0.5, 2);
  const headingScale = clamp('headingScale', 1, 0.5, 2);
  const wrapIndent = clamp('wrapIndent', 12, 0, 96);
  const maxWrapIndent = Math.max(wrapIndent, clamp('maxWrapIndent', 36, 0, 192));
  const childIndent = clamp('childIndent', 26, 0, 96);
  const childTrunkInset = clamp('childTrunkInset', 12, 0, 96);
  const calloutTrunkInset = clamp('calloutTrunkInset', 24, 0, 96);
  const calloutCardIndent = Math.max(
    calloutTrunkInset,
    clamp('calloutCardIndent', 38, 0, 160),
  );
  const calloutRightGap = clamp('calloutRightGap', 24, 0, 96);
  const calloutModeMinWidth = clamp('calloutModeMinWidth', 240, 0, 800);
  const minContentWidth = clamp('minContentWidth', 160, 80, 800);
  const maxCardWidth = Math.max(minContentWidth, clamp('maxCardWidth', 420, 120, 2000));
  const pagePacking = isPagePacking(override['pagePacking'])
    ? override['pagePacking']
    : base?.pagePacking ?? 'stacked';
  return {
    preset,
    fontScale,
    bodyPt: clamp('bodyPt', 9, 6, 24),
    bodyLine: clamp('bodyLine', 1.3, 1, 2.5),
    headingScale,
    heading1Pt: clamp('heading1Pt', 14, 8, 40),
    heading2Pt: clamp('heading2Pt', 12, 7, 32),
    heading3Pt: clamp('heading3Pt', 10.5, 6, 28),
    codePt: clamp('codePt', 8, 5, 20),
    codeLine: clamp('codeLine', 1.3, 1, 2.5),
    tablePt: clamp('tablePt', 8.5, 5, 20),
    tableLine: clamp('tableLine', 1.25, 1, 2.5),
    labelPt: clamp('labelPt', 9, 5, 20),
    chromePt: clamp('chromePt', 7.5, 5, 16),
    markerPt: clamp('markerPt', 7, 5, 16),
    cardPadding: clamp('cardPadding', 8, 0, 40),
    cardBorder: clamp('cardBorder', 1, 0, 8),
    segmentGap: clamp('segmentGap', 4, 0, 32),
    siblingGap: clamp('siblingGap', 16, 0, 96),
    wrapIndent,
    maxWrapIndent,
    childIndent,
    childTrunkInset,
    calloutTrunkInset,
    calloutCardIndent,
    calloutRightGap,
    calloutModeMinWidth,
    calloutGap: clamp('calloutGap', 12, 0, 96),
    maxCardWidth,
    minContentWidth,
    pagePacking,
  };
}

function sanitizeManualBreaks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || seen.has(entry)) continue;
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

/**
 * Merge an override onto a complete base settings object.
 *
 * A preset change starts from that preset's values and then applies explicit
 * overrides; unrelated base values are not carried across presets.
 */
export function mergePageSettings(
  base: PageSettings,
  override?: PageSettingsOverride | null,
): PageSettings {
  const setupInput = {
    ...base.setup,
    ...(isRecord(override?.setup) ? override.setup : {}),
    margins: {
      ...base.setup.margins,
      ...(isRecord(override?.setup?.margins) ? override.setup?.margins : {}),
    },
  };
  const theme = resolveTheme(override?.theme, base.theme);
  const manualBreakBeforeBlockIds =
    override?.manualBreakBeforeBlockIds === undefined
      ? sanitizeManualBreaks(base.manualBreakBeforeBlockIds)
      : sanitizeManualBreaks(override.manualBreakBeforeBlockIds);
  return {
    setup: sanitizeSetup(setupInput),
    theme,
    manualBreakBeforeBlockIds,
  };
}

/** Resolve a partial/unknown settings value against the product defaults. */
export function normalizePageSettings(input?: PageSettingsOverride | null): PageSettings {
  const override = isRecord(input) ? (input as PageSettingsOverride) : undefined;
  return mergePageSettings(DEFAULT_PAGE_SETTINGS, override);
}

export function normalizeContinuousSettings(
  input?: ContinuousSettingsOverride | null,
): ContinuousSettings {
  const record = isRecord(input) ? input : {};
  return { zoom: finiteNumber(record['zoom'], 1, 0.25, 4) };
}

/** Merge a per-document continuous override onto the global continuous settings. */
export function mergeContinuousSettings(
  base: ContinuousSettings,
  override?: ContinuousSettingsOverride | null,
): ContinuousSettings {
  const record = isRecord(override) ? override : {};
  return { zoom: finiteNumber(record['zoom'], base.zoom, 0.25, 4) };
}

const PAGE_THEME_NUMERIC_KEYS = [
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

const MARGIN_KEYS = ['top', 'right', 'bottom', 'left'] as const;

/**
 * Normalize an untrusted per-document override without expanding it into a full
 * settings object.
 *
 * Only fields that were actually present survive, so a later global preset
 * change still affects every field the document did not override. Values are
 * clamped through the same merge path as `normalizePageSettings`; unknown keys
 * and invalid values are dropped.
 */
export function normalizePageSettingsOverride(
  input?: unknown,
): PageSettingsOverride | undefined {
  if (!isRecord(input)) return undefined;
  const resolved = mergePageSettings(
    DEFAULT_PAGE_SETTINGS,
    input as PageSettingsOverride,
  );
  const override: PageSettingsOverride = {};

  const rawSetup = isRecord(input['setup']) ? input['setup'] : null;
  if (rawSetup !== null) {
    const setup: PageSetupOverride = {};
    if (isPageSize(rawSetup['size'])) setup.size = rawSetup['size'];
    if (isOrientation(rawSetup['orientation'])) setup.orientation = rawSetup['orientation'];
    const rawMargins = isRecord(rawSetup['margins']) ? rawSetup['margins'] : null;
    if (rawMargins !== null) {
      const margins: Partial<MarginsMm> = {};
      for (const key of MARGIN_KEYS) {
        const value = rawMargins[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
          margins[key] = resolved.setup.margins[key];
        }
      }
      if (Object.keys(margins).length > 0) setup.margins = margins;
    }
    if (Object.keys(setup).length > 0) override.setup = setup;
  }

  const rawTheme = isRecord(input['theme']) ? input['theme'] : null;
  if (rawTheme !== null) {
    const theme: Partial<PageTheme> = {};
    if (isPreset(rawTheme['preset'])) theme.preset = rawTheme['preset'];
    for (const key of PAGE_THEME_NUMERIC_KEYS) {
      const value = rawTheme[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        (theme as Record<string, number>)[key] = resolved.theme[key];
      }
    }
    if (isPagePacking(rawTheme['pagePacking'])) {
      theme.pagePacking = resolved.theme.pagePacking;
    }
    if (Object.keys(theme).length > 0) override.theme = theme;
  }

  if (Array.isArray(input['manualBreakBeforeBlockIds'])) {
    override.manualBreakBeforeBlockIds = resolved.manualBreakBeforeBlockIds;
  }

  return Object.keys(override).length > 0 ? override : undefined;
}

/** Normalize a per-document continuous override; invalid input means no override. */
export function normalizeContinuousSettingsOverride(
  input?: unknown,
): ContinuousSettingsOverride | undefined {
  if (!isRecord(input)) return undefined;
  const zoom = input['zoom'];
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return undefined;
  return { zoom: normalizeContinuousSettings(input as ContinuousSettingsOverride).zoom };
}

/** Resolve the global app settings with safe defaults. */
export function normalizeAppSettings(input?: {
  page?: PageSettingsOverride | null;
  continuous?: ContinuousSettingsOverride | null;
} | null): AppSettings {
  const record = isRecord(input) ? input : {};
  return {
    page: normalizePageSettings(record['page'] as PageSettingsOverride | null | undefined),
    continuous: normalizeContinuousSettings(
      record['continuous'] as ContinuousSettingsOverride | null | undefined,
    ),
  };
}
