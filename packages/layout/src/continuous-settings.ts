/**
 * Global Continuous canvas settings (R6).
 *
 * Continuous is the primary authoring surface. These values are personal,
 * global, and only reach the continuous canvas: the Page renderer, measurement
 * host, and PDF print compositor read the Page edge style, Page edge geometry,
 * `PageTheme`, `PageChrome`, and `--paper-*` only. This module is pure (no DOM, Electron, React, or editor imports) and is the single
 * source for the defaults, ranges, clamping, CSS variables, and the resolved
 * Continuous edge style.
 *
 * The defaults equal the pre-R6 `DESIGN_TOKENS`/`CONTINUOUS_EDGE_STYLE`
 * values, so a migrated v4 settings file draws the same canvas.
 */

import {
  CONTINUOUS_EDGE_STYLE,
  type SharedEdgeStyle,
} from './edge-style.js';

export interface ContinuousSpacingSettings {
  /** Vertical gap between chapters. */
  chapterGap: number;
  /** Gap between a parent card/lane and its direct-child group. */
  siblingGap: number;
  /** Vertical gap between stacked child rows. */
  childRowGap: number;
}

export interface ContinuousArrowSettings {
  /** Resting primary/reference stroke width. */
  width: number;
  /** Selected-path stroke width; always at least `width`. */
  activeWidth: number;
  /** Non-path branch stroke width when a selection mutes the tree. */
  mutedWidth: number;
  /** Fixed arrowhead length; half-width is `size / 2`. */
  size: number;
}

export interface ContinuousWidthSettings {
  /** Finite horizontal canvas cap; the canvas scrolls beyond this. */
  canvasMax: number;
  /** Content-driven top-level card cap. */
  topLevelMax: number;
  /** Content-driven child card cap. */
  childMax: number;
}

export interface ContinuousSettings {
  spacing: ContinuousSpacingSettings;
  arrows: ContinuousArrowSettings;
  widths: ContinuousWidthSettings;
}

export const CONTINUOUS_SPACING_MIN = Object.freeze({
  chapterGap: 16,
  siblingGap: 12,
  childRowGap: 8,
});

export const CONTINUOUS_SPACING_MAX = Object.freeze({
  chapterGap: 48,
  siblingGap: 40,
  childRowGap: 32,
});

export const CONTINUOUS_ARROW_MIN = Object.freeze({
  width: 0.75,
  activeWidth: 1.25,
  mutedWidth: 0.5,
  size: 4,
});

export const CONTINUOUS_ARROW_MAX = Object.freeze({
  width: 2.5,
  activeWidth: 3,
  mutedWidth: 2,
  size: 10,
});

export const CONTINUOUS_WIDTH_MIN = Object.freeze({
  canvasMax: 2400,
  topLevelMax: 320,
  childMax: 280,
});

export const CONTINUOUS_WIDTH_MAX = Object.freeze({
  canvasMax: 4800,
  topLevelMax: 640,
  childMax: 560,
});

/** Slider steps; normalization snaps stored values to the same steps. */
export const CONTINUOUS_STEP = Object.freeze({
  spacing: 1,
  arrowWidth: 0.25,
  arrowSize: 1,
  canvasMax: 100,
  cardWidth: 20,
});

/**
 * Minimum Continuous edge corridor: lane lead + final stem + arrow gap.
 *
 * The canvas must leave room for a top-level card, one child card, the
 * sibling gap, and this corridor; otherwise a child could never sit beside its
 * parent without a negative stem. The value is derived from the shared edge
 * contract, never a second literal.
 */
export const CONTINUOUS_MIN_CORRIDOR =
  CONTINUOUS_EDGE_STYLE.laneMin + CONTINUOUS_EDGE_STYLE.stemMin + CONTINUOUS_EDGE_STYLE.gap;

export const DEFAULT_CONTINUOUS_SETTINGS: Readonly<ContinuousSettings> = Object.freeze({
  spacing: Object.freeze({
    chapterGap: 28,
    siblingGap: 24,
    childRowGap: 16,
  }),
  arrows: Object.freeze({
    width: 1.25,
    activeWidth: 1.75,
    mutedWidth: 1,
    size: 6,
  }),
  widths: Object.freeze({
    canvasMax: 3200,
    topLevelMax: 480,
    childMax: 420,
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  const rounded = Math.round(value / step) * step;
  // Keep quarter-pixel widths free of binary floating-point tails.
  return Math.round(rounded * 100) / 100;
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function snap(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  step: number,
): number {
  return roundTo(clampNumber(value, fallback, min, max), step);
}

/**
 * The smallest canvas cap that can hold the widest supported tree row:
 * top-level card + sibling gap + child card + the edge corridor.
 *
 * `normalizeContinuousSettings` raises a smaller cap to this floor; the
 * Settings Advanced section explains the requirement.
 */
export function continuousCanvasFloor(settings: Pick<ContinuousSettings, 'widths' | 'spacing'>): number {
  return (
    settings.widths.topLevelMax +
    settings.spacing.siblingGap +
    settings.widths.childMax +
    CONTINUOUS_MIN_CORRIDOR
  );
}

/**
 * Resolve untrusted Continuous settings against the product defaults.
 *
 * Every field is clamped to its range and snapped to the same step the slider
 * uses. `activeWidth` is raised to at least `width`, and `canvasMax` is raised
 * to the fitted-row floor. Unknown keys are ignored; the caller (settings file)
 * preserves them on write.
 */
export function normalizeContinuousSettings(input?: unknown): ContinuousSettings {
  const record = isRecord(input) ? input : {};
  const spacing = isRecord(record['spacing']) ? record['spacing'] : {};
  const arrows = isRecord(record['arrows']) ? record['arrows'] : {};
  const widths = isRecord(record['widths']) ? record['widths'] : {};

  const normalizedSpacing: ContinuousSpacingSettings = {
    chapterGap: snap(
      spacing['chapterGap'],
      DEFAULT_CONTINUOUS_SETTINGS.spacing.chapterGap,
      CONTINUOUS_SPACING_MIN.chapterGap,
      CONTINUOUS_SPACING_MAX.chapterGap,
      CONTINUOUS_STEP.spacing,
    ),
    siblingGap: snap(
      spacing['siblingGap'],
      DEFAULT_CONTINUOUS_SETTINGS.spacing.siblingGap,
      CONTINUOUS_SPACING_MIN.siblingGap,
      CONTINUOUS_SPACING_MAX.siblingGap,
      CONTINUOUS_STEP.spacing,
    ),
    childRowGap: snap(
      spacing['childRowGap'],
      DEFAULT_CONTINUOUS_SETTINGS.spacing.childRowGap,
      CONTINUOUS_SPACING_MIN.childRowGap,
      CONTINUOUS_SPACING_MAX.childRowGap,
      CONTINUOUS_STEP.spacing,
    ),
  };

  const width = snap(
    arrows['width'],
    DEFAULT_CONTINUOUS_SETTINGS.arrows.width,
    CONTINUOUS_ARROW_MIN.width,
    CONTINUOUS_ARROW_MAX.width,
    CONTINUOUS_STEP.arrowWidth,
  );
  const normalizedArrows: ContinuousArrowSettings = {
    width,
    activeWidth: Math.max(
      width,
      snap(
        arrows['activeWidth'],
        DEFAULT_CONTINUOUS_SETTINGS.arrows.activeWidth,
        CONTINUOUS_ARROW_MIN.activeWidth,
        CONTINUOUS_ARROW_MAX.activeWidth,
        CONTINUOUS_STEP.arrowWidth,
      ),
    ),
    mutedWidth: snap(
      arrows['mutedWidth'],
      DEFAULT_CONTINUOUS_SETTINGS.arrows.mutedWidth,
      CONTINUOUS_ARROW_MIN.mutedWidth,
      CONTINUOUS_ARROW_MAX.mutedWidth,
      CONTINUOUS_STEP.arrowWidth,
    ),
    size: snap(
      arrows['size'],
      DEFAULT_CONTINUOUS_SETTINGS.arrows.size,
      CONTINUOUS_ARROW_MIN.size,
      CONTINUOUS_ARROW_MAX.size,
      CONTINUOUS_STEP.arrowSize,
    ),
  };

  const normalizedWidths: ContinuousWidthSettings = {
    canvasMax: snap(
      widths['canvasMax'],
      DEFAULT_CONTINUOUS_SETTINGS.widths.canvasMax,
      CONTINUOUS_WIDTH_MIN.canvasMax,
      CONTINUOUS_WIDTH_MAX.canvasMax,
      CONTINUOUS_STEP.canvasMax,
    ),
    topLevelMax: snap(
      widths['topLevelMax'],
      DEFAULT_CONTINUOUS_SETTINGS.widths.topLevelMax,
      CONTINUOUS_WIDTH_MIN.topLevelMax,
      CONTINUOUS_WIDTH_MAX.topLevelMax,
      CONTINUOUS_STEP.cardWidth,
    ),
    childMax: snap(
      widths['childMax'],
      DEFAULT_CONTINUOUS_SETTINGS.widths.childMax,
      CONTINUOUS_WIDTH_MIN.childMax,
      CONTINUOUS_WIDTH_MAX.childMax,
      CONTINUOUS_STEP.cardWidth,
    ),
  };
  normalizedWidths.canvasMax = Math.max(
    normalizedWidths.canvasMax,
    continuousCanvasFloor({ spacing: normalizedSpacing, widths: normalizedWidths }),
  );

  return {
    spacing: normalizedSpacing,
    arrows: normalizedArrows,
    widths: normalizedWidths,
  };
}

function cssPx(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}

function cssNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Continuous-only CSS custom properties.
 *
 * The renderer scopes these to the Continuous surface (and the Settings
 * preview stage), so Page/PDF never inherit a continuous value. The root
 * `DESIGN_TOKENS` fallbacks stay applied at boot for the no-document shell.
 */
export function continuousCssVariables(
  settings: ContinuousSettings,
): Record<string, string> {
  const normalized = normalizeContinuousSettings(settings);
  return {
    '--nf-chapter-gap': cssPx(normalized.spacing.chapterGap),
    '--nf-child-gap': cssPx(normalized.spacing.siblingGap),
    '--nf-child-row-gap': cssPx(normalized.spacing.childRowGap),
    '--nf-canvas-max': cssPx(normalized.widths.canvasMax),
    '--nf-top-level-max-width': cssPx(normalized.widths.topLevelMax),
    '--nf-child-max-width': cssPx(normalized.widths.childMax),
    '--nf-edge-width': cssNumber(normalized.arrows.width),
    '--nf-edge-width-active': cssNumber(normalized.arrows.activeWidth),
    '--nf-edge-width-muted': cssNumber(normalized.arrows.mutedWidth),
  };
}

/**
 * Resolve the Continuous edge style for the router.
 *
 * Non-user-facing geometry (gap, radius, stem, lanes, trunk insets) stays the
 * shared Continuous contract; the user controls the fixed arrowhead size and
 * the three stroke widths. The returned object is never merged into the Page
 * edge style or Page edge geometry.
 */
export function continuousEdgeStyle(settings: ContinuousSettings): SharedEdgeStyle {
  const normalized = normalizeContinuousSettings(settings);
  return {
    ...CONTINUOUS_EDGE_STYLE,
    arrowLength: normalized.arrows.size,
    arrowHalfWidth: normalized.arrows.size / 2,
    edgeWidth: normalized.arrows.width,
    edgeWidthActive: normalized.arrows.activeWidth,
    edgeWidthMuted: normalized.arrows.mutedWidth,
  };
}
