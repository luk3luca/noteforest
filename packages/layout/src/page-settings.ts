/**
 * Personal page settings: page size, margins, and the page typography theme.
 *
 * ADR-0008 makes the canonical document a continuous canvas. Page geometry and
 * density are a personal lens applied by the page renderer, measurement host,
 * and PDF export; they are never stored in `document.json`. This module is the
 * single pure source for those values. It has no DOM, Electron, React, or editor
 * imports.
 */

import {
  DEFAULT_APPEARANCE,
  DEFAULT_CODE_FONT,
  normalizeAppearance,
  type AppearanceSettings,
  type CodeFontId,
} from './appearance.js';
import {
  DEFAULT_CONTINUOUS_SETTINGS,
  normalizeContinuousSettings,
  type ContinuousSettings,
} from './continuous-settings.js';
import { PAGE_EDGE_GEOMETRY, PAGE_EDGE_STYLE } from './edge-style.js';
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
  /**
   * Page child gap, px (0–96, default 18). Sets the parent → below-child gap,
   * the child → child stack gap, the next sibling after a previous subtree and
   * the callout-stack → child transition. Vertical only: the horizontal
   * parent → right-group corridor is `PAGE_EDGE_GEOMETRY.siblingGap`. Fixed
   * under density.
   */
  siblingGap: number;
  /**
   * Page top-level gap, px (0–96, default 32). Sets the vertical gap between
   * top-level blocks in a chapter. Fixed under density.
   */
  chapterGap: number;
  wrapIndent: number;
  /**
   * Per-level cap on the wrap indent added from a parent left edge. The cap is
   * applied at every level and does not accumulate across ancestors. It is a
   * fixed origin token (not density-scaled) and never cuts below `childIndent`.
   */
  maxWrapIndent: number;
  /**
   * Legacy stored corridor geometry. The Page edge corridor is fixed by
   * `PAGE_EDGE_GEOMETRY` (childIndent 26, calloutCardIndent 38,
   * calloutRightGap 24, trunk insets 12/24): these fields are kept for settings
   * compatibility and are never density-scaled or read by the engine.
   */
  childIndent: number;
  /** Below-trunk inset for the direct-child group (fixed 12 px). */
  childTrunkInset: number;
  /** Below-trunk inset for the anchored-callout group (fixed 24 px). */
  calloutTrunkInset: number;
  /** Callout card left offset from the parent left (fixed 24 + 14 = 38 px). */
  calloutCardIndent: number;
  /** Gap from the parent right edge to the mode A callout lane (fixed 24 px). */
  calloutRightGap: number;
  /** Minimum free right space that selects callout mode A. */
  calloutModeMinWidth: number;
  /**
   * Page callout gap, px (0–96, default 16). Sets the parent →
   * anchored-callout gap for below placements and the callout → callout stack.
   * In callout mode A the first callout sits in the right lane at the parent's
   * y, so only the callout → callout gap applies there. Fixed under density.
   */
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

export type PageChromeSource = 'none' | 'document' | 'chapter';

/**
 * Running header/footer sources (R2 Page chrome).
 *
 * The header/footer text is generated from the canonical document and chapter
 * titles; there is no free text. `pageNumber` prints `Page N of M` at the
 * bottom center on every page (no page-1 exception).
 */
export interface PageChrome {
  header: PageChromeSource;
  footer: PageChromeSource;
  pageNumber: boolean;
}

export interface PageSettings {
  setup: PageSetup;
  theme: PageTheme;
  chrome: PageChrome;
  /** Personal manual page-break hints; never canonical document content. */
  manualBreakBeforeBlockIds: string[];
}

/**
 * Global export defaults (R4).
 *
 * `folder: null` means the OS Documents folder; a non-empty path is the user's
 * default destination. Export defaults are global only: there is no
 * per-document export namespace. Filenames are always `<title>.pdf`.
 */
export interface ExportSettings {
  folder: string | null;
}

/**
 * Personal app settings. Continuous zoom is intentionally absent: the only
 * Continuous zoom is the per-document `DocumentViewState.zoom` in the shell
 * (S2-6). The R6 `continuous` namespace is global canvas geometry (spacing,
 * arrows, width caps), never per-document. `settingsVersion` is a file
 * concern, not part of this in-memory type.
 */
export interface AppSettings {
  page: PageSettings;
  /** Global shell appearance (R3); never per-document. */
  appearance: AppearanceSettings;
  /** Global PDF export defaults (R4); never per-document. */
  export: ExportSettings;
  /** Global Continuous canvas geometry (R6); never per-document. */
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
  chrome?: Partial<PageChrome>;
  manualBreakBeforeBlockIds?: readonly string[];
}

/**
 * Page vertical gap settings (ADR-0010).
 *
 * Three independent rhythms: the **child gap** (parent → below-child gap, the
 * child → child stack, the next sibling after a previous subtree and the
 * callout-stack → child transition), the **top-level gap** (between top-level
 * blocks in a chapter) and the **callout gap** (parent → anchored callout for
 * below placements, callout → callout). Each is a personal Page setting (a
 * global default plus a per-document override), fixed under density and
 * consumed by Page Read/Edit, measurement and PDF.
 *
 * The horizontal parent → right-group corridor is not a setting: it stays
 * `PAGE_EDGE_GEOMETRY.siblingGap` (18) and reaches the pure layout as
 * `LayoutOptions.rightGroupGap`. The three vertical defaults are separate
 * constants, never aliases of the corridor even where the numbers coincide.
 */
export const PAGE_CHILD_GAP_DEFAULT = 18;
export const PAGE_TOP_LEVEL_GAP_DEFAULT = 32;
export const PAGE_CALLOUT_GAP_DEFAULT = 16;
/** Shared stored range for the three vertical Page gaps. */
export const PAGE_GAP_MIN = 0;
export const PAGE_GAP_MAX = 96;

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
  siblingGap: PAGE_CHILD_GAP_DEFAULT,
  chapterGap: PAGE_TOP_LEVEL_GAP_DEFAULT,
  wrapIndent: 12,
  maxWrapIndent: 36,
  childIndent: PAGE_EDGE_GEOMETRY.childIndent,
  childTrunkInset: PAGE_EDGE_GEOMETRY.childTrunkInset,
  calloutTrunkInset: PAGE_EDGE_GEOMETRY.calloutTrunkInset,
  calloutCardIndent: PAGE_EDGE_GEOMETRY.calloutCardIndent,
  calloutRightGap: PAGE_EDGE_GEOMETRY.calloutRightGap,
  calloutModeMinWidth: 240,
  calloutGap: PAGE_CALLOUT_GAP_DEFAULT,
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
  siblingGap: PAGE_CHILD_GAP_DEFAULT,
  chapterGap: PAGE_TOP_LEVEL_GAP_DEFAULT,
  wrapIndent: 18,
  maxWrapIndent: 54,
  childIndent: PAGE_EDGE_GEOMETRY.childIndent,
  childTrunkInset: PAGE_EDGE_GEOMETRY.childTrunkInset,
  calloutTrunkInset: PAGE_EDGE_GEOMETRY.calloutTrunkInset,
  calloutCardIndent: PAGE_EDGE_GEOMETRY.calloutCardIndent,
  calloutRightGap: PAGE_EDGE_GEOMETRY.calloutRightGap,
  calloutModeMinWidth: 240,
  calloutGap: PAGE_CALLOUT_GAP_DEFAULT,
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

/** Approved R2 chrome defaults: document title, chapter footer, number on. */
export const DEFAULT_PAGE_CHROME: Readonly<PageChrome> = Object.freeze({
  header: 'document',
  footer: 'chapter',
  pageNumber: true,
});

export const DEFAULT_PAGE_SETTINGS: Readonly<PageSettings> = Object.freeze({
  setup: Object.freeze({
    size: 'A4',
    orientation: 'landscape',
    margins: Object.freeze({ top: 12, right: 12, bottom: 12, left: 12 }),
  }),
  theme: COMPACT_THEME,
  chrome: DEFAULT_PAGE_CHROME,
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
  appearance: DEFAULT_APPEARANCE,
  export: Object.freeze({ folder: null }) as ExportSettings,
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
 *
 * The code font is the one appearance value that reaches Page/PDF: it changes
 * code metrics, so it joins the identity. A measured run under JetBrains Mono
 * can never be printed with System Mono (R3).
 */
export function pageSettingsFingerprint(
  settings: PageSettings,
  codeFont: CodeFontId = DEFAULT_CODE_FONT,
): string {
  return JSON.stringify([
    settings.setup.size,
    settings.setup.orientation,
    settings.setup.margins,
    settings.theme,
    settings.chrome,
    settings.manualBreakBeforeBlockIds,
    effectivePageTheme(settings.theme),
    codeFont,
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
 * The horizontal edge corridor is an engine invariant (`PAGE_EDGE_GEOMETRY`):
 * the child/callout indents, callout right gap and the trunk insets are always
 * resolved to the fixed corridor, so 60/70/100/120% draw the same arrows. The
 * three vertical gaps (child, top-level, callout) are Page settings: they are
 * clamped to 0–96 with their defaults and never multiplied by density.
 * `PageTheme` keeps the remaining corridor fields for settings compatibility;
 * they are ignored by the engine. Density still scales typography, card
 * padding, segment gap, and content/card widths; wrap indents, the vertical
 * gaps and the corridor stay fixed.
 *
 * The returned theme carries `density: 1`, so applying the lens twice is
 * idempotent.
 */
export function effectivePageTheme(theme: PageTheme): PageTheme {
  const density = normalizePageDensity(theme.density);
  const corridor = {
    childIndent: PAGE_EDGE_GEOMETRY.childIndent,
    childTrunkInset: PAGE_EDGE_GEOMETRY.childTrunkInset,
    calloutTrunkInset: PAGE_EDGE_GEOMETRY.calloutTrunkInset,
    calloutCardIndent: PAGE_EDGE_GEOMETRY.calloutCardIndent,
    calloutRightGap: PAGE_EDGE_GEOMETRY.calloutRightGap,
  } satisfies Partial<PageTheme>;
  // The three vertical gaps are settings, not corridor constants, and density
  // never scales them: a non-finite stored value falls back to its default and
  // an out-of-range one is clamped to 0–96.
  const verticalGaps = {
    siblingGap: finiteNumber(theme.siblingGap, PAGE_CHILD_GAP_DEFAULT, PAGE_GAP_MIN, PAGE_GAP_MAX),
    chapterGap: finiteNumber(
      theme.chapterGap,
      PAGE_TOP_LEVEL_GAP_DEFAULT,
      PAGE_GAP_MIN,
      PAGE_GAP_MAX,
    ),
    calloutGap: finiteNumber(
      theme.calloutGap,
      PAGE_CALLOUT_GAP_DEFAULT,
      PAGE_GAP_MIN,
      PAGE_GAP_MAX,
    ),
  } satisfies Partial<PageTheme>;
  if (density === 1) return { ...theme, ...corridor, ...verticalGaps };

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
  // Wrap indents are Page origin tokens, not type/box metrics: like the edge
  // corridor they stay fixed so density never changes the nested-list geometry.
  const wrapIndent = roundTo(theme.wrapIndent);
  const maxWrapIndent = Math.max(wrapIndent, roundTo(theme.maxWrapIndent));
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
    wrapIndent,
    maxWrapIndent,
    ...corridor,
    ...verticalGaps,
    minContentWidth,
    maxCardWidth,
  };
}

/**
 * Map a page theme onto the pure layout tuning options.
 *
 * The three vertical gaps are the resolved Page settings; the horizontal
 * parent → right-group corridor is the fixed `PAGE_EDGE_GEOMETRY.siblingGap`
 * (18) mapped to its own option, so no vertical setting can move an arrow.
 */
export function pageLayoutOptions(theme: PageTheme): LayoutOptions {
  const effective = effectivePageTheme(theme);
  return {
    minContentWidth: effective.minContentWidth,
    maxContentWidth: effective.maxCardWidth,
    siblingGap: effective.siblingGap,
    // The horizontal corridor is a Page engine constant, not a theme lever: a
    // stored legacy value can never move an arrow (PAGE_EDGE_GEOMETRY).
    rightGroupGap: PAGE_EDGE_GEOMETRY.siblingGap,
    wrapIndent: effective.wrapIndent,
    maxWrapIndent: effective.maxWrapIndent,
    childIndent: PAGE_EDGE_GEOMETRY.childIndent,
    childTrunkInset: PAGE_EDGE_GEOMETRY.childTrunkInset,
    calloutTrunkInset: PAGE_EDGE_GEOMETRY.calloutTrunkInset,
    calloutCardIndent: PAGE_EDGE_GEOMETRY.calloutCardIndent,
    calloutRightGap: PAGE_EDGE_GEOMETRY.calloutRightGap,
    calloutModeMinWidth: effective.calloutModeMinWidth,
    // R2j callout modes belong to the beside tree packing. The explicit
    // `stacked` policy keeps the historical geometry as its own oracle.
    calloutModes: effective.pagePacking === 'beside',
    wrapPolicy: DEFAULT_LAYOUT_OPTIONS.wrapPolicy,
    pagePacking: effective.pagePacking,
    calloutGap: effective.calloutGap,
    chapterGap: effective.chapterGap,
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
 * CSS custom properties for the Page presentation layer.
 *
 * Only values that `styles.css` actually consumes are emitted. Typography and
 * card text metrics drive the Page DOM; `--nf-page-max-card-width` is the Page
 * measurement host width/cap, so measurement never reads the Continuous
 * `--nf-child-max-width` token. Placement geometry (indents, trunks, callout
 * gaps) stays on `PageTheme`/`LayoutOptions` and is written inline by the Page
 * renderer, not through CSS variables.
 *
 * Page Read/Edit, measurement, and print all apply this same map; there is no
 * static CSS fallback, so the map and the stylesheet cannot drift.
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
    '--nf-page-max-card-width': `${cssNumber(effective.maxCardWidth)}px`,
    // Page arrows read the Page edge style only. The Continuous canvas keeps
    // `--nf-edge-width`, so a Continuous edge setting cannot change the paper.
    '--nf-page-edge-width': cssNumber(PAGE_EDGE_STYLE.edgeWidth),
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

function isPageChromeSource(value: unknown): value is PageChromeSource {
  return value === 'none' || value === 'document' || value === 'chapter';
}

/**
 * Sanitize one chrome layer.
 *
 * Unknown sources and non-boolean `pageNumber` values fall back to `base`, so an
 * old settings file without `chrome` and a corrupt partial override both load
 * the approved defaults instead of failing.
 */
function sanitizeChrome(input: unknown, base: PageChrome): PageChrome {
  const record = isRecord(input) ? input : {};
  return {
    header: isPageChromeSource(record['header']) ? record['header'] : base.header,
    footer: isPageChromeSource(record['footer']) ? record['footer'] : base.footer,
    pageNumber:
      typeof record['pageNumber'] === 'boolean' ? record['pageNumber'] : base.pageNumber,
  };
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
  // The corridor fields are sanitized for settings compatibility, but
  // `effectivePageTheme`/`pageLayoutOptions` always resolve the fixed
  // PAGE_EDGE_GEOMETRY values; a legacy override cannot move an arrow.
  const calloutCardIndent = Math.max(
    calloutTrunkInset,
    clamp('calloutCardIndent', 38, 0, 160),
  );
  // A below-stem minimum keeps mode A's leader visible even for a custom gap;
  // 0 produced a zero-length route at the parent's right edge (R2 seam review F6).
  const calloutRightGap = clamp('calloutRightGap', 24, PAGE_EDGE_STYLE.stemMin, 96);
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
    siblingGap: clamp('siblingGap', PAGE_CHILD_GAP_DEFAULT, PAGE_GAP_MIN, PAGE_GAP_MAX),
    chapterGap: clamp('chapterGap', PAGE_TOP_LEVEL_GAP_DEFAULT, PAGE_GAP_MIN, PAGE_GAP_MAX),
    wrapIndent,
    maxWrapIndent,
    childIndent,
    childTrunkInset,
    calloutTrunkInset,
    calloutCardIndent,
    calloutRightGap,
    calloutModeMinWidth,
    calloutGap: clamp('calloutGap', PAGE_CALLOUT_GAP_DEFAULT, PAGE_GAP_MIN, PAGE_GAP_MAX),
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
  const chrome = sanitizeChrome(override?.chrome, base.chrome);
  const manualBreakBeforeBlockIds =
    override?.manualBreakBeforeBlockIds === undefined
      ? sanitizeManualBreaks(base.manualBreakBeforeBlockIds)
      : sanitizeManualBreaks(override.manualBreakBeforeBlockIds);
  return {
    setup: sanitizeSetup(setupInput),
    theme,
    chrome,
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

  const rawChrome = isRecord(input['chrome']) ? input['chrome'] : null;
  if (rawChrome !== null) {
    const chrome: Partial<PageChrome> = {};
    if (isPageChromeSource(rawChrome['header'])) chrome.header = resolved.chrome.header;
    if (isPageChromeSource(rawChrome['footer'])) chrome.footer = resolved.chrome.footer;
    if (typeof rawChrome['pageNumber'] === 'boolean') {
      chrome.pageNumber = resolved.chrome.pageNumber;
    }
    if (Object.keys(chrome).length > 0) override.chrome = chrome;
  }

  return Object.keys(override).length > 0 ? override : undefined;
}

/**
 * Normalize one export namespace.
 *
 * `null`, a missing block, an unknown value, an empty string, and a non-string
 * all mean "use the OS Documents folder". A non-empty string is kept trimmed;
 * the main process resolves the actual folder and reports a missing one, so an
 * export never creates or substitutes a destination silently.
 */
export function normalizeExportSettings(input?: unknown): ExportSettings {
  const record = isRecord(input) ? input : {};
  const raw = record['folder'];
  const folder = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null;
  return { folder };
}

/** Resolve the global app settings with safe defaults. */
export function normalizeAppSettings(input?: {
  page?: PageSettingsOverride | null;
  appearance?: unknown;
  export?: unknown;
  continuous?: unknown;
} | null): AppSettings {
  const record = isRecord(input) ? input : {};
  return {
    page: normalizePageSettings(record['page'] as PageSettingsOverride | null | undefined),
    appearance: normalizeAppearance(record['appearance']),
    export: normalizeExportSettings(record['export']),
    continuous: normalizeContinuousSettings(record['continuous']),
  };
}
