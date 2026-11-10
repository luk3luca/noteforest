import { describe, expect, it } from 'vitest';
import type { PageSetup, PageSettingsOverride } from '@noteforest/layout';
import {
  MARGIN_CONTENT_MESSAGE,
  MARGIN_NUMBER_MESSAGE,
  MARGIN_RANGE_MESSAGE,
  compactOverride,
  formatMm,
  marginDraftFrom,
  parseMm,
  sameMm,
  validateMargins,
  withMargins,
  withSetupField,
  withoutMargin,
  withoutMargins,
  withoutSetup,
  withoutSetupField,
  withoutTheme,
  type MarginDraft,
} from '../src/renderer/src/settings/page-setup';

const A4_LANDSCAPE: PageSetup = {
  size: 'A4',
  orientation: 'landscape',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

const A4_PORTRAIT: PageSetup = { ...A4_LANDSCAPE, orientation: 'portrait' };
const A5_LANDSCAPE: PageSetup = { ...A4_LANDSCAPE, size: 'A5' };
const LETTER_PORTRAIT: PageSetup = {
  size: 'Letter',
  orientation: 'portrait',
  margins: { top: 12, right: 12, bottom: 12, left: 12 },
};

function draft(top = '12', right = '12', bottom = '12', left = '12'): MarginDraft {
  return { top, right, bottom, left };
}

describe('Page setup margin validation', () => {
  it('accepts the default and decimal margins', () => {
    const validation = validateMargins(draft(), 'A4', 'landscape');
    expect(validation.valid).toBe(true);
    expect(validation.margins).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    expect(validation.fieldErrors).toEqual({});
    expect(validation.groupError).toBeNull();

    const decimal = validateMargins(draft('12.5', '100', '0', '100'), 'A4', 'portrait');
    expect(decimal.valid).toBe(false, '100 mm on a 210 mm wide page leaves 10 mm of content');
    expect(decimal.fieldErrors.left).toBeDefined();

    const decimalOk = validateMargins(draft('12.5', '8.25', '0', '20'), 'A4', 'portrait');
    expect(decimalOk.valid).toBe(true);
    expect(decimalOk.margins).toEqual({ top: 12.5, right: 8.25, bottom: 0, left: 20 });
  });

  it('rejects empty, non-numeric, negative, and over-100 values without clamping', () => {
    const empty = validateMargins(draft(''), 'A4', 'landscape');
    expect(empty.valid).toBe(false);
    expect(empty.fieldErrors.top).toBe(MARGIN_NUMBER_MESSAGE);
    expect(empty.margins).toBeNull();

    const text = validateMargins(draft('12mm'), 'A4', 'landscape');
    expect(text.valid).toBe(false);
    expect(text.fieldErrors.top).toBe(MARGIN_NUMBER_MESSAGE);

    const negative = validateMargins(draft('-1'), 'A4', 'landscape');
    expect(negative.valid).toBe(false);
    expect(negative.fieldErrors.top).toBe(MARGIN_RANGE_MESSAGE);

    const tooLarge = validateMargins(draft('101'), 'A4', 'landscape');
    expect(tooLarge.valid).toBe(false);
    expect(tooLarge.fieldErrors.top).toBe(MARGIN_RANGE_MESSAGE);
    expect(tooLarge.margins).toBeNull();
  });

  it('requires 20 mm of content on each axis and marks both fields', () => {
    const vertical = validateMargins(draft('100', '12', '100', '12'), 'A4', 'landscape');
    expect(vertical.valid).toBe(false);
    expect(vertical.fieldErrors.top).toContain('20 mm');
    expect(vertical.fieldErrors.bottom).toBe(vertical.fieldErrors.top);
    expect(vertical.groupError).toBe(MARGIN_CONTENT_MESSAGE);

    const horizontalA5 = validateMargins(draft('12', '100', '12', '100'), 'A5', 'landscape');
    expect(horizontalA5.valid).toBe(false);
    expect(horizontalA5.fieldErrors.left).toContain('20 mm');
    expect(horizontalA5.fieldErrors.right).toBe(horizontalA5.fieldErrors.left);

    // The same values are valid on A4 portrait and Letter portrait.
    for (const setup of [A4_PORTRAIT, LETTER_PORTRAIT]) {
      const ok = validateMargins(draft('100', '12', '100', '12'), setup.size, setup.orientation);
      expect(ok.valid).toBe(true);
    }
  });

  it('parses and formats millimetres deterministically', () => {
    expect(parseMm(' 12 ')).toBe(12);
    expect(parseMm('12.5')).toBe(12.5);
    expect(parseMm('.5')).toBe(0.5);
    expect(parseMm('')).toBeNull();
    expect(parseMm('1e3')).toBeNull();
    expect(parseMm('12mm')).toBeNull();
    expect(formatMm(12)).toBe('12');
    expect(formatMm(12.5)).toBe('12.5');
    expect(formatMm(12.345)).toBe('12.35');
    expect(marginDraftFrom({ top: 12, right: 8.25, bottom: 0, left: 20 })).toEqual({
      top: '12',
      right: '8.25',
      bottom: '0',
      left: '20',
    });
  });
});

describe('Page setup per-document overrides', () => {
  it('drops a field equal to global and keeps the other partial fields', () => {
    const base: PageSettingsOverride = {
      setup: { orientation: 'portrait', margins: { top: 20 } },
      theme: { density: 0.9 },
    };
    const next = withSetupField(base, 'size', 'A4', A4_LANDSCAPE);
    expect(next).toEqual(base, 'an A4 size equal to global is not stored');

    const letter = withSetupField(base, 'size', 'Letter', A4_LANDSCAPE);
    expect(letter).toEqual({
      setup: { size: 'Letter', orientation: 'portrait', margins: { top: 20 } },
      theme: { density: 0.9 },
    });

    const sameOrientation = withSetupField(base, 'orientation', 'landscape', A4_LANDSCAPE);
    expect(sameOrientation).toEqual({
      setup: { margins: { top: 20 } },
      theme: { density: 0.9 },
    });
  });

  it('stores only the margins that differ from global', () => {
    const next = withMargins(
      undefined,
      { top: 20, right: 12, bottom: 12, left: 18 },
      A4_LANDSCAPE,
    );
    expect(next).toEqual({ setup: { margins: { top: 20, left: 18 } } });

    const equal = withMargins(
      { setup: { size: 'A5' }, theme: { density: 1.1 } },
      { top: 12, right: 12, bottom: 12, left: 12 },
      A4_LANDSCAPE,
    );
    expect(equal).toEqual({ setup: { size: 'A5' }, theme: { density: 1.1 } });
  });

  it('removes empty groups and the whole override', () => {
    expect(compactOverride({ setup: { margins: {} }, theme: {} })).toBeUndefined();
    expect(compactOverride({ setup: { size: 'A5' } })).toEqual({ setup: { size: 'A5' } });
    expect(withoutSetup({ setup: { margins: { top: 20 } }, theme: { density: 0.8 } })).toEqual({
      theme: { density: 0.8 },
    });
    expect(withoutTheme({ setup: { size: 'A5' }, theme: { density: 0.8 } })).toEqual({
      setup: { size: 'A5' },
    });
    expect(withoutMargins({ setup: { size: 'A5', margins: { top: 20 } } })).toEqual({
      setup: { size: 'A5' },
    });
    expect(withoutMargin({ setup: { margins: { top: 20, left: 18 } } }, 'top')).toEqual({
      setup: { margins: { left: 18 } },
    });
    expect(withoutSetupField({ setup: { size: 'A5' } }, 'size')).toBeUndefined();
  });

  it('compares millimetres without float drift', () => {
    expect(sameMm(12, 12)).toBe(true);
    expect(sameMm(12.1, 12.1)).toBe(true);
    expect(sameMm(12, 12.01)).toBe(false);
  });

  it('does not mutate the input override', () => {
    const base: PageSettingsOverride = { setup: { margins: { top: 20 } } };
    withMargins(base, { top: 12, right: 12, bottom: 12, left: 12 }, A4_LANDSCAPE);
    withoutMargin(base, 'top');
    expect(base).toEqual({ setup: { margins: { top: 20 } } });
  });

  it('accepts A5 landscape only when the content area fits', () => {
    const valid = validateMargins(draft('30', '30', '30', '30'), 'A5', 'landscape');
    expect(valid.valid).toBe(true);
    expect(valid.margins).toEqual({ top: 30, right: 30, bottom: 30, left: 30 });
    const invalid = validateMargins(draft('80', '80', '80', '80'), A5_LANDSCAPE.size, A5_LANDSCAPE.orientation);
    expect(invalid.valid).toBe(false);
  });
});
