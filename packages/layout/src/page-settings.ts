/**
 * Personal page settings: page size, margins, and the page typography theme.
 *
 * ADR-0008 makes the canonical document a continuous canvas. Page geometry and
 * density are a personal lens applied by the page renderer, measurement host,
 * and PDF export; they are never stored in `document.json`. This module is the
 * single pure source for those values. It has no DOM, Electron, React, or editor
 * imports.
 */

import { EDGE_STYLE } from './edge-style.js';
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
  /**
   * Page-only density multiplier (0.6–1.2, default 1, step 0.05).
   *
   * The stored theme values are the unmodified theme; `effectivePageTheme`
   * applies this lens once for layout, measurement, CSS, and print. Density
   * never changes page setup/margins and is never a CSS zoom.
   */
  density: number;
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

/**
 * Personal app settings. Continuous zoom is intentionally absent: the only
 * Continuous zoom is the per-document `DocumentViewState.zoom` in the shell
 * (S2-6). `settingsVersion` is a file concern, not part of this in-memory type.
 */
export interface AppSettings {
  page: PageSettings;
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

/** Compact is the dense reading preset and the product default. */
const COMPACT_THEME: PageTheme = Object.freeze({
  preset: 'compact',
  density: 1,
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
  density: 1,
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
  // Comfortable is a density/typography preset, not a topology preset.
  // The Page tree, callout modes, and trunks stay shared with compact.
  pagePacking: 'beside',
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


/**
 * Page density lens (M4d1, widened in M4e2).
 *
 * One user-facing slider: 60–120%, step 5, default 100. The value is stored in
 * `PageTheme.density` and applied by `effectivePageTheme`; a stored theme is
 * always the unmodified preset/override, so changing density is reversible.
 * Every value is snapped to the 5% step, so the slider, `settings.json`, and a
 * per-document override share one canonical range.
 */
export const PAGE_DENSITY_MIN = 0.6;
export const PAGE_DENSITY_MAX = 1.2;
export const PAGE_DENSITY_STEP = 0.05;
export const PAGE_DENSITY_DEFAULT = 1;
/**
 * Density type floor: at 60% even a 9 pt body lands here (5.4 would be
 * unreadable). The floor is the anchor of the low-density type curve.
 */
export const PAGE_BODY_PT_FLOOR = 7;
/** Density never takes a card below this content width. */
export const PAGE_MIN_CONTENT_WIDTH_FLOOR = 140;
/** Readable clamp for a density-scaled `maxCardWidth`; the 60% preset lands at 252. */
export const PAGE_MAX_CARD_WIDTH_MIN = 240;
export const PAGE_MAX_CARD_WIDTH_MAX = 560;

/**
 * Clamp and snap a density value to the 60–120% lens.
 *
 * `effectivePageTheme` and every settings merge path use this one function, so
 * a document override, settings.json, or a slider cannot introduce a third
 * range, an off-step value, or a floating-point fingerprint.
 */
export function normalizePageDensity(value: unknown): number {
  const clamped = finiteNumber(value, PAGE_DENSITY_DEFAULT, PAGE_DENSITY_MIN, PAGE_DENSITY_MAX);
  const snapped = Math.round(clamped / PAGE_DENSITY_STEP) * PAGE_DENSITY_STEP;
  return Math.min(PAGE_DENSITY_MAX, Math.max(PAGE_DENSITY_MIN, roundTo(snapped)));
}

function roundTo(value: number): number {
  return Math.round(value * 100) / 100;
}

export const DEFAULT_APP_SETTINGS: Readonly<AppSettings> = Object.freeze({
  page: DEFAULT_PAGE_SETTINGS,
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

/**
 * Deterministic identity of the resolved page settings.
 *
 * The page model and the print model both compute this from the same resolved
 * settings; a stale/mismatched pair fails the export instead of silently
 * rendering a different page count. The theme object carries `density`, so two
 * lenses over the same document never share a fingerprint. The effective theme
 * is part of the identity as well: the density type/spacing floors are model
 * inputs, so a model measured under different floors can never be accepted as
 * current even when the stored settings are identical.
 */
export function pageSettingsFingerprint(settings: PageSettings): string {
  return JSON.stringify([
    settings.setup.size,
    settings.setup.orientation,
    settings.setup.margins,
    settings.theme,
    settings.manualBreakBeforeBlockIds,
    effectivePageTheme(settings.theme),
  ]);
}

/**
 * Readability guard for a scaled `minContentWidth`.
 *
 * The 140 px floor applies to the preset range; a custom value the user set
 * below it keeps scaling instead of jumping up.
 */
function scaledContentWidthFloor(original: number, scaled: number): number {
  return original >= PAGE_MIN_CONTENT_WIDTH_FLOOR
    ? Math.max(PAGE_MIN_CONTENT_WIDTH_FLOOR, scaled)
    : scaled;
}

/**
 * Readability clamp for a scaled `maxCardWidth` (240–560).
 *
 * The band is applied only when the stored cap is inside it, so the default
 * 420 px card becomes 252–504; an explicit custom narrow/wide cap keeps its
 * own scaling instead of being rewritten by the density lens.
 */
function scaledCardWidth(original: number, scaled: number): number {
  let value = scaled;
  if (original >= PAGE_MAX_CARD_WIDTH_MIN) value = Math.max(PAGE_MAX_CARD_WIDTH_MIN, value);
  if (original <= PAGE_MAX_CARD_WIDTH_MAX) value = Math.min(PAGE_MAX_CARD_WIDTH_MAX, value);
  return value;
}

/**
 * Apply the density lens to a stored theme.
 *
 * This is the single effective-theme resolution: layout options, CSS variables,
 * DOM measurement, Page Read/Edit, and the print/export snapshot all consume
 * this function's output.
 *
 * Type curve below 100%: each type size interpolates linearly from its
 * readability floor at 60% to its preset value at 100% (M4e2). At 80% the
 * compact body is exactly 8 pt, at 60% exactly 7 pt, so every step is more
 * compact than the one above it while the floor is reached only at the slider
 * minimum. Above 100% type scales proportionally. Box metrics scale
 * proportionally all the way down, with their own readability floors
 * (`minContentWidth` 140, `maxCardWidth` 240–560). Page setup and margins are
 * not part of the theme.
 *
 * The returned theme carries `density: 1`, so applying the lens twice is
 * idempotent. At 100% the stored theme is returned unchanged.
 */
export function effectivePageTheme(theme: PageTheme): PageTheme {
  const density = normalizePageDensity(theme.density);
  if (density === 1) return theme;

  const scale = (value: number): number => roundTo(value * density);
  // Position inside the low-density band: 0 at 60%, 1 at 100%.
  const lowBand = Math.min(
    1,
    Math.max(0, (density - PAGE_DENSITY_MIN) / (1 - PAGE_DENSITY_MIN)),
  );
  /**
   * Floor-anchored type: a preset value above its floor reaches the floor at
   * 60% and the preset value at 100%. A custom value already below the floor
   * keeps proportional scaling (same policy as `minContentWidth`), so the lens
   * never enlarges a deliberately small custom size.
   */
  const type = (base: number, floor: number): number => {
    if (base < floor || density >= 1) return scale(base);
    return roundTo(floor + (base - floor) * lowBand);
  };
  const bodyFloor = PAGE_BODY_PT_FLOOR;
  const bodyPt = type(theme.bodyPt, bodyFloor);
  // Headings stay above body even when the body hits its floor; code, tables,
  // chrome, and markers keep their own smaller floors.
  const heading1Pt = Math.max(bodyPt + 3, type(theme.heading1Pt, bodyFloor + 3));
  const heading2Pt = Math.max(bodyPt + 1.5, type(theme.heading2Pt, bodyFloor + 1.5));
  const heading3Pt = Math.max(bodyPt + 1, type(theme.heading3Pt, bodyFloor + 1));
  const wrapIndent = scale(theme.wrapIndent);
  const maxWrapIndent = Math.max(wrapIndent, scale(theme.maxWrapIndent));
  const childTrunkInset = scale(theme.childTrunkInset);
  const calloutTrunkInset = scale(theme.calloutTrunkInset);
  // R2j1: a wrapped child group always leaves room for its trunk and left stem.
  const childIndent = Math.max(
    scale(theme.childIndent),
    childTrunkInset + EDGE_STYLE.stemMin + 2,
  );
  const calloutCardIndent = Math.max(scale(theme.calloutCardIndent), calloutTrunkInset);
  const minContentWidth = scaledContentWidthFloor(
    theme.minContentWidth,
    scale(theme.minContentWidth),
  );
  const maxCardWidth = Math.max(
    minContentWidth,
    scaledCardWidth(theme.maxCardWidth, scale(theme.maxCardWidth)),
  );

  return {
    ...theme,
    density: 1,
    bodyPt,
    heading1Pt,
    heading2Pt,
    heading3Pt,
    codePt: type(theme.codePt, 7),
    tablePt: type(theme.tablePt, 7),
    labelPt: type(theme.labelPt, bodyFloor),
    chromePt: type(theme.chromePt, 6),
    markerPt: type(theme.markerPt, 6),
    cardPadding: scale(theme.cardPadding),
    segmentGap: scale(theme.segmentGap),
    siblingGap: scale(theme.siblingGap),
    wrapIndent,
    maxWrapIndent,
    childIndent,
    childTrunkInset,
    calloutTrunkInset,
    calloutCardIndent,
    calloutRightGap: Math.max(EDGE_STYLE.stemMin, scale(theme.calloutRightGap)),
    calloutGap: scale(theme.calloutGap),
    minContentWidth,
    maxCardWidth,
  };
}

/** Map a page theme onto the pure layout tuning options. */
export function pageLayoutOptions(theme: PageTheme): LayoutOptions {
  const effective = effectivePageTheme(theme);
  return {
    minContentWidth: effective.minContentWidth,
    maxContentWidth: effective.maxCardWidth,
    siblingGap: effective.siblingGap,
    wrapIndent: effective.wrapIndent,
    maxWrapIndent: effective.maxWrapIndent,
    childIndent: effective.childIndent,
    childTrunkInset: effective.childTrunkInset,
    calloutTrunkInset: effective.calloutTrunkInset,
    calloutCardIndent: effective.calloutCardIndent,
    calloutRightGap: effective.calloutRightGap,
    calloutModeMinWidth: effective.calloutModeMinWidth,
    // R2j callout modes belong to the beside tree packing. The explicit
    // `stacked` policy keeps the historical geometry as its own oracle.
    calloutModes: effective.pagePacking === 'beside',
    wrapPolicy: DEFAULT_LAYOUT_OPTIONS.wrapPolicy,
    pagePacking: effective.pagePacking,
    calloutGap: effective.calloutGap,
    chapterGap: DEFAULT_LAYOUT_OPTIONS.chapterGap,
    cardPadding: effective.cardPadding,
    cardBorder: effective.cardBorder,
    segmentGap: effective.segmentGap,
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
 * theme. R1b writes this map to the page sheet and measurement host; M4d1
 * applies the density lens here, so Page Read, Page Edit, measurement, and
 * print all receive identical values.
 */
export function pageCssVariables(theme: PageTheme): Record<string, string> {
  const effective = effectivePageTheme(theme);
  const font = effective.fontScale;
  const heading = effective.fontScale * effective.headingScale;
  return {
    '--nf-page-body-size': `${cssNumber(effective.bodyPt * font)}pt`,
    '--nf-page-body-line': cssNumber(effective.bodyLine),
    '--nf-page-label-size': `${cssNumber(effective.labelPt * font)}pt`,
    '--nf-page-heading-1': `${cssNumber(effective.heading1Pt * heading)}pt`,
    '--nf-page-heading-2': `${cssNumber(effective.heading2Pt * heading)}pt`,
    '--nf-page-heading-3': `${cssNumber(effective.heading3Pt * heading)}pt`,
    '--nf-page-code-size': `${cssNumber(effective.codePt * font)}pt`,
    '--nf-page-code-line': cssNumber(effective.codeLine),
    '--nf-page-table-size': `${cssNumber(effective.tablePt * font)}pt`,
    '--nf-page-table-line': cssNumber(effective.tableLine),
    '--nf-page-chrome-size': `${cssNumber(effective.chromePt * font)}pt`,
    '--nf-page-marker-size': `${cssNumber(effective.markerPt * font)}pt`,
    '--nf-page-card-padding': `${cssNumber(effective.cardPadding)}px`,
    '--nf-page-card-border': `${cssNumber(effective.cardBorder)}px`,
    '--nf-page-segment-gap': `${cssNumber(effective.segmentGap)}px`,
    '--nf-page-sibling-gap': `${cssNumber(effective.siblingGap)}px`,
    '--nf-page-wrap-indent': `${cssNumber(effective.wrapIndent)}px`,
    '--nf-page-max-wrap-indent': `${cssNumber(effective.maxWrapIndent)}px`,
    '--nf-page-child-indent': `${cssNumber(effective.childIndent)}px`,
    '--nf-page-child-trunk-inset': `${cssNumber(effective.childTrunkInset)}px`,
    '--nf-page-callout-trunk-inset': `${cssNumber(effective.calloutTrunkInset)}px`,
    '--nf-page-callout-card-indent': `${cssNumber(effective.calloutCardIndent)}px`,
    '--nf-page-callout-right-gap': `${cssNumber(effective.calloutRightGap)}px`,
    '--nf-page-callout-mode-min-width': `${cssNumber(effective.calloutModeMinWidth)}px`,
    '--nf-page-callout-gap': `${cssNumber(effective.calloutGap)}px`,
    '--nf-page-max-card-width': `${cssNumber(effective.maxCardWidth)}px`,
    '--nf-page-min-content-width': `${cssNumber(effective.minContentWidth)}px`,
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
  // Density is a lens over the preset, not a preset value: a preset switch
  // keeps the user's current density unless the override names one.
  const density = normalizePageDensity(
    override['density'] ?? baseTheme?.density ?? presetBase.density ?? PAGE_DENSITY_DEFAULT,
  );
  const wrapIndent = clamp('wrapIndent', 12, 0, 96);
  const maxWrapIndent = Math.max(wrapIndent, clamp('maxWrapIndent', 36, 0, 192));
  const childIndent = clamp('childIndent', 26, 0, 96);
  const childTrunkInset = clamp('childTrunkInset', 12, 0, 96);
  const calloutTrunkInset = clamp('calloutTrunkInset', 24, 0, 96);
  const calloutCardIndent = Math.max(
    calloutTrunkInset,
    clamp('calloutCardIndent', 38, 0, 160),
  );
  // A below-stem minimum keeps mode A's leader visible even for a custom gap;
  // 0 produced a zero-length route at the parent's right edge (R2 seam review F6).
  const calloutRightGap = clamp('calloutRightGap', 24, EDGE_STYLE.stemMin, 96);
  const calloutModeMinWidth = clamp('calloutModeMinWidth', 240, 0, 800);
  const minContentWidth = clamp('minContentWidth', 160, 80, 800);
  const maxCardWidth = Math.max(minContentWidth, clamp('maxCardWidth', 420, 120, 2000));
  const pagePacking = isPagePacking(override['pagePacking'])
    ? override['pagePacking']
    : base?.pagePacking ?? 'stacked';
  return {
    preset,
    density,
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

const PAGE_THEME_NUMERIC_KEYS = [
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

/** Resolve the global app settings with safe defaults. */
export function normalizeAppSettings(input?: {
  page?: PageSettingsOverride | null;
} | null): AppSettings {
  const record = isRecord(input) ? input : {};
  return {
    page: normalizePageSettings(record['page'] as PageSettingsOverride | null | undefined),
  };
}
