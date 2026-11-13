import { describe, expect, it } from 'vitest';
import {
  continuousEdgeStyle,
  DEFAULT_CONTINUOUS_SETTINGS,
  normalizeContinuousSettings,
} from '@noteforest/layout';
import {
  buildContinuousPreview,
  PREVIEW_CARD_WIDTH_FACTOR,
} from '../src/renderer/src/settings/continuous-preview';

describe('Continuous settings preview sample (R6)', () => {
  it('builds one top-level card, two direct children, and one callout', () => {
    const sample = buildContinuousPreview(DEFAULT_CONTINUOUS_SETTINGS);
    expect(sample.root).toEqual({
      x: 8,
      y: 8,
      width: Math.round(480 * PREVIEW_CARD_WIDTH_FACTOR),
      height: 64,
    });
    expect(sample.childOne.x).toBe(
      sample.root.x + sample.root.width + DEFAULT_CONTINUOUS_SETTINGS.spacing.siblingGap,
    );
    expect(sample.childTwo.y - sample.childOne.y).toBe(
      sample.childOne.height + DEFAULT_CONTINUOUS_SETTINGS.spacing.childRowGap,
    );
    expect(sample.callout.x).toBe(34);
    expect(sample.callout.y).toBeGreaterThan(sample.childTwo.y);
    expect(sample.width).toBeLessThanOrEqual(492);
  });

  it('follows spacing and width changes without a real document', () => {
    const changed = normalizeContinuousSettings({
      spacing: { chapterGap: 48, siblingGap: 40, childRowGap: 32 },
      widths: { canvasMax: 4800, topLevelMax: 640, childMax: 560 },
    });
    const base = buildContinuousPreview(DEFAULT_CONTINUOUS_SETTINGS);
    const sample = buildContinuousPreview(changed);
    expect(sample.root.width).toBeGreaterThan(base.root.width);
    expect(sample.childOne.width).toBeGreaterThan(base.childOne.width);
    expect(sample.childOne.x - sample.root.x - sample.root.width).toBe(40);
    expect(sample.childTwo.y - sample.childOne.y - sample.childOne.height).toBe(32);
    // Card widths are the documented preview fraction of the configured caps.
    expect(sample.root.width).toBe(Math.round(640 * PREVIEW_CARD_WIDTH_FACTOR));
    expect(sample.childOne.width).toBe(Math.round(560 * PREVIEW_CARD_WIDTH_FACTOR));
  });

  it('uses the same resolved edge style the canvas uses for the sample', () => {
    const changed = normalizeContinuousSettings({
      arrows: { width: 2, activeWidth: 2.5, mutedWidth: 1.5, size: 10 },
    });
    const style = continuousEdgeStyle(changed);
    expect(style.arrowLength).toBe(10);
    expect(style.arrowHalfWidth).toBe(5);
    expect(style.edgeWidth).toBe(2);
  });
});
