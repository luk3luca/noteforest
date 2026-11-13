import { describe, expect, it } from 'vitest';
import {
  CONTINUOUS_ARROW_MAX,
  CONTINUOUS_ARROW_MIN,
  CONTINUOUS_EDGE_STYLE,
  CONTINUOUS_MIN_CORRIDOR,
  CONTINUOUS_SPACING_MAX,
  CONTINUOUS_SPACING_MIN,
  CONTINUOUS_WIDTH_MAX,
  CONTINUOUS_WIDTH_MIN,
  continuousCanvasFloor,
  continuousCssVariables,
  continuousEdgeStyle,
  DEFAULT_CONTINUOUS_SETTINGS,
  normalizeContinuousSettings,
} from '../src/index.js';

describe('global Continuous settings (R6)', () => {
  it('defaults equal the pre-R6 canvas tokens', () => {
    expect(DEFAULT_CONTINUOUS_SETTINGS).toEqual({
      spacing: { chapterGap: 28, siblingGap: 24, childRowGap: 16 },
      arrows: { width: 1.25, activeWidth: 1.75, mutedWidth: 1, size: 6 },
      widths: { canvasMax: 3200, topLevelMax: 480, childMax: 420 },
    });
    expect(DEFAULT_CONTINUOUS_SETTINGS.arrows.width).toBe(CONTINUOUS_EDGE_STYLE.edgeWidth);
    expect(DEFAULT_CONTINUOUS_SETTINGS.arrows.activeWidth).toBe(
      CONTINUOUS_EDGE_STYLE.edgeWidthActive,
    );
    expect(DEFAULT_CONTINUOUS_SETTINGS.arrows.mutedWidth).toBe(
      CONTINUOUS_EDGE_STYLE.edgeWidthMuted,
    );
    expect(DEFAULT_CONTINUOUS_SETTINGS.arrows.size).toBe(CONTINUOUS_EDGE_STYLE.arrowLength);
    expect(DEFAULT_CONTINUOUS_SETTINGS.arrows.size / 2).toBe(
      CONTINUOUS_EDGE_STYLE.arrowHalfWidth,
    );
  });

  it('clamps every field to its documented range and snaps to the slider step', () => {
    const normalized = normalizeContinuousSettings({
      spacing: { chapterGap: 4, siblingGap: 99, childRowGap: 12.4 },
      arrows: { width: 99, activeWidth: 0.25, mutedWidth: 0.1, size: 99 },
      widths: { canvasMax: 10, topLevelMax: 100, childMax: 9999 },
    });
    expect(normalized.spacing).toEqual({
      chapterGap: CONTINUOUS_SPACING_MIN.chapterGap,
      siblingGap: CONTINUOUS_SPACING_MAX.siblingGap,
      childRowGap: 12,
    });
    expect(normalized.arrows).toEqual({
      width: CONTINUOUS_ARROW_MAX.width,
      // Active is clamped to its own range and then raised to the resting width.
      activeWidth: CONTINUOUS_ARROW_MAX.width,
      mutedWidth: CONTINUOUS_ARROW_MIN.mutedWidth,
      size: CONTINUOUS_ARROW_MAX.size,
    });
    expect(normalized.widths).toEqual({
      canvasMax: CONTINUOUS_WIDTH_MIN.canvasMax,
      topLevelMax: CONTINUOUS_WIDTH_MIN.topLevelMax,
      childMax: CONTINUOUS_WIDTH_MAX.childMax,
    });
  });

  it('snaps off-step values to the same steps the sliders use', () => {
    const normalized = normalizeContinuousSettings({
      spacing: { chapterGap: 27.6 },
      arrows: { width: 1.37, activeWidth: 1.62, mutedWidth: 0.9, size: 6.4 },
      widths: { canvasMax: 3250, topLevelMax: 489, childMax: 431 },
    });
    expect(normalized.spacing.chapterGap).toBe(28);
    expect(normalized.arrows).toEqual({
      width: 1.25,
      activeWidth: 1.5,
      mutedWidth: 1,
      size: 6,
    });
    expect(normalized.widths).toEqual({
      canvasMax: 3300,
      topLevelMax: 480,
      childMax: 440,
    });
  });

  it('keeps the canvas cap large enough for a top-level card, a child, and the corridor', () => {
    const settings = {
      ...DEFAULT_CONTINUOUS_SETTINGS,
      spacing: { ...DEFAULT_CONTINUOUS_SETTINGS.spacing, siblingGap: 40 },
      widths: { canvasMax: 2400, topLevelMax: 640, childMax: 560 },
    };
    expect(continuousCanvasFloor(settings)).toBe(
      640 + 560 + 40 + CONTINUOUS_MIN_CORRIDOR,
    );
    expect(CONTINUOUS_MIN_CORRIDOR).toBe(16);
    const normalized = normalizeContinuousSettings(settings);
    expect(normalized.widths.canvasMax).toBeGreaterThanOrEqual(
      continuousCanvasFloor(normalized),
    );
  });

  it('falls back to defaults for missing, unknown, or non-numeric fields', () => {
    expect(normalizeContinuousSettings()).toEqual(DEFAULT_CONTINUOUS_SETTINGS);
    expect(
      normalizeContinuousSettings({
        spacing: 'nope',
        arrows: { width: 'wide', futureArrow: 3 },
        widths: { canvasMax: Number.NaN },
        future: true,
      }),
    ).toEqual(DEFAULT_CONTINUOUS_SETTINGS);
  });

  it('publishes Continuous-only CSS variables from resolved values', () => {
    expect(continuousCssVariables(DEFAULT_CONTINUOUS_SETTINGS)).toEqual({
      '--nf-chapter-gap': '28px',
      '--nf-child-gap': '24px',
      '--nf-child-row-gap': '16px',
      '--nf-canvas-max': '3200px',
      '--nf-top-level-max-width': '480px',
      '--nf-child-max-width': '420px',
      '--nf-edge-width': '1.25',
      '--nf-edge-width-active': '1.75',
      '--nf-edge-width-muted': '1',
    });
    const changed = normalizeContinuousSettings({
      spacing: { chapterGap: 40, siblingGap: 30, childRowGap: 20 },
      arrows: { width: 2, activeWidth: 2.5, mutedWidth: 1.5, size: 9 },
      widths: { canvasMax: 4000, topLevelMax: 600, childMax: 500 },
    });
    expect(continuousCssVariables(changed)).toEqual({
      '--nf-chapter-gap': '40px',
      '--nf-child-gap': '30px',
      '--nf-child-row-gap': '20px',
      '--nf-canvas-max': '4000px',
      '--nf-top-level-max-width': '600px',
      '--nf-child-max-width': '500px',
      '--nf-edge-width': '2',
      '--nf-edge-width-active': '2.5',
      '--nf-edge-width-muted': '1.5',
    });
  });

  it('resolves the Continuous edge style without touching the Page contract', () => {
    expect(continuousEdgeStyle(DEFAULT_CONTINUOUS_SETTINGS)).toEqual(CONTINUOUS_EDGE_STYLE);
    const changed = normalizeContinuousSettings({
      arrows: { width: 2, activeWidth: 2.5, mutedWidth: 1.5, size: 9 },
    });
    const style = continuousEdgeStyle(changed);
    expect(style.edgeWidth).toBe(2);
    expect(style.edgeWidthActive).toBe(2.5);
    expect(style.edgeWidthMuted).toBe(1.5);
    expect(style.arrowLength).toBe(9);
    expect(style.arrowHalfWidth).toBe(4.5);
    // Non-user-facing geometry stays the shared canvas contract.
    expect(style.stemMin).toBe(CONTINUOUS_EDGE_STYLE.stemMin);
    expect(style.trunkInset).toBe(CONTINUOUS_EDGE_STYLE.trunkInset);
  });
});
