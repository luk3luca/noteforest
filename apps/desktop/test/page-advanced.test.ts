import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SETTINGS,
  PAGE_THEME_PRESETS,
  effectivePageTheme,
  mergePageSettings,
  type PageTheme,
} from '@noteforest/layout';
import {
  ADVANCED_LAYOUT_KEYS,
  ADVANCED_TYPOGRAPHY_KEYS,
  EDITABLE_THEME_KEYS,
  MAX_CARD_WIDTH_KEY,
  PAGE_THEME_FIELD_SPECS,
  customThemeOverride,
  formatPageThemeNumber,
  hasThemeFieldOverride,
  isThemeFieldOverridden,
  pageThemeDraftFrom,
  parsePageThemeNumber,
  presetSwitchReplacesAdvancedValues,
  samePageThemeNumber,
  validatePageThemeDrafts,
  withThemeField,
  withoutThemeField,
  withoutThemeFields,
  type PageThemeDraft,
} from '../src/renderer/src/settings/page-advanced';

const COMPACT = DEFAULT_PAGE_SETTINGS.theme;
const COMFORTABLE = PAGE_THEME_PRESETS.comfortable;

function draftFrom(
  theme: PageTheme,
  patch: Partial<Record<keyof PageTheme, string>> = {},
): PageThemeDraft {
  return { ...pageThemeDraftFrom(theme), ...patch } as PageThemeDraft;
}

function validate(draft: PageThemeDraft, childTrunkInset = 12) {
  return validatePageThemeDrafts(draft, { childTrunkInset });
}

describe('advanced Page theme draft parsing and ranges', () => {
  it('formats stored values without trailing zeros and parses strict decimals', () => {
    expect(formatPageThemeNumber(8)).toBe('8');
    expect(formatPageThemeNumber(8.5)).toBe('8.5');
    expect(formatPageThemeNumber(1.25)).toBe('1.25');
    expect(formatPageThemeNumber(11.300000000000001)).toBe('11.3');
    expect(parsePageThemeNumber(' 8.5 ')).toBe(8.5);
    expect(parsePageThemeNumber('.5')).toBe(0.5);
    expect(parsePageThemeNumber('')).toBeNull();
    expect(parsePageThemeNumber('8pt')).toBeNull();
    expect(parsePageThemeNumber('1e2')).toBeNull();
    expect(parsePageThemeNumber('Infinity')).toBeNull();
  });

  it('rejects values just outside every frozen range without clamping', () => {
    for (const key of EDITABLE_THEME_KEYS) {
      const spec = PAGE_THEME_FIELD_SPECS[key];
      const range = spec.unit === '×' ? /Use a multiplier/ : /Use a value/;
      const below = validate(
        draftFrom(COMPACT, { [key]: formatPageThemeNumber(spec.min - spec.step) }),
      );
      expect(below.valid, `${key} below min`).toBe(false);
      expect(below.errors[key], key).toMatch(range);
      expect(below.values).toBeNull();

      const above = validate(
        draftFrom(COMPACT, { [key]: formatPageThemeNumber(spec.max + spec.step) }),
      );
      expect(above.valid, `${key} above max`).toBe(false);
      expect(above.errors[key], key).toMatch(range);
      expect(above.values).toBeNull();
    }
  });

  it('accepts the preset defaults and a full valid advanced draft', () => {
    expect(validate(draftFrom(COMPACT)).valid).toBe(true);
    const wide = validate(
      draftFrom(COMPACT, {
        bodyPt: '12',
        bodyLine: '1.6',
        heading1Pt: '16',
        heading2Pt: '14',
        heading3Pt: '13',
        codePt: '10',
        codeLine: '1.5',
        tablePt: '10',
        tableLine: '1.4',
        labelPt: '11',
        minContentWidth: '180',
        cardPadding: '14',
        cardBorder: '2',
        segmentGap: '6',
        wrapIndent: '22',
        maxWrapIndent: '64',
        maxCardWidth: '360',
      }),
    );
    expect(wide.valid).toBe(true);
    expect(wide.values).toMatchObject({
      bodyPt: 12,
      heading1Pt: 16,
      maxCardWidth: 360,
    });
  });

  it('rejects an empty field and keeps the error instead of resetting to the model default', () => {
    const missing = validate(draftFrom(COMPACT, { bodyPt: '' }));
    expect(missing.valid).toBe(false);
    expect(missing.errors.bodyPt).toBeDefined();
    expect(missing.values).toBeNull();
  });
});

describe('advanced Page theme cross-field rules', () => {
  it('requires H1/H2/H3 to stay above the body by +3/+1.5/+1 pt', () => {
    const body = draftFrom(COMPACT, {
      bodyPt: '12',
      heading1Pt: '14.5',
      heading2Pt: '13',
      heading3Pt: '12.5',
    });
    const invalid = validate(body);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.heading1Pt).toContain('15 pt');
    expect(invalid.errors.heading2Pt).toContain('13.5 pt');
    expect(invalid.errors.heading3Pt).toContain('13 pt');
    expect(invalid.values).toBeNull();

    const fixed = validate(
      draftFrom(COMPACT, {
        bodyPt: '12',
        heading1Pt: '15',
        heading2Pt: '13.5',
        heading3Pt: '13',
      }),
    );
    expect(fixed.valid).toBe(true);
    expect(fixed.values?.heading3Pt).toBe(13);
  });

  it('requires max list indent to be at least the list indent', () => {
    const invalid = validate(draftFrom(COMPACT, { wrapIndent: '30', maxWrapIndent: '29' }));
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.maxWrapIndent).toContain('30 px');
    expect(invalid.values).toBeNull();

    expect(
      validate(draftFrom(COMPACT, { wrapIndent: '30', maxWrapIndent: '30' })).valid,
    ).toBe(true);
  });

  it('keeps the edge corridor out of the editable advanced fields', () => {
    // siblingGap / childIndent / calloutGap are engine constants now. A stored
    // legacy value is not in the draft and cannot be edited.
    for (const key of ['siblingGap', 'childIndent', 'calloutGap'] as const) {
      expect(EDITABLE_THEME_KEYS).not.toContain(key);
      expect(Object.keys(pageThemeDraftFrom(COMPACT))).not.toContain(key);
    }
  });

  it('requires the max card width to be at least the minimum content width', () => {
    const invalid = validate(
      draftFrom(COMPACT, { minContentWidth: '300', maxCardWidth: '299' }),
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.maxCardWidth).toContain('300 px');
    expect(invalid.values).toBeNull();

    expect(
      validate(draftFrom(COMPACT, { minContentWidth: '300', maxCardWidth: '300' })).valid,
    ).toBe(true);
  });
});

describe('advanced Page theme overrides', () => {
  it('stores partial fields and removes an equal-to-global value', () => {
    const stored = withThemeField(undefined, 'bodyPt', 11, COMPACT);
    expect(stored?.theme?.bodyPt).toBe(11);

    const equal = withThemeField(stored, 'bodyPt', COMPACT.bodyPt, COMPACT);
    expect(equal).toBeUndefined();

    const otherFieldKept = withThemeField(stored, 'cardPadding', 14, COMPACT);
    expect(otherFieldKept?.theme).toEqual({ bodyPt: 11, cardPadding: 14 });
  });

  it('removes one field or a group without touching unrelated overrides', () => {
    const override = {
      setup: { size: 'A5' as const },
      theme: { bodyPt: 11, cardPadding: 14, preset: 'custom' as const },
    };
    const one = withoutThemeField(override, 'bodyPt');
    expect(one?.setup).toEqual({ size: 'A5' });
    expect(one?.theme).toEqual({ cardPadding: 14, preset: 'custom' });

    const typography = withoutThemeFields(override, ADVANCED_TYPOGRAPHY_KEYS);
    expect(typography?.theme).toEqual({ cardPadding: 14, preset: 'custom' });

    // A custom marker that only existed for the removed group is dropped.
    const onlyBody = withoutThemeFields(
      { theme: { bodyPt: 11, preset: 'custom' } },
      ADVANCED_TYPOGRAPHY_KEYS,
    );
    expect(onlyBody).toBeUndefined();

    // The first-class card cap survives but does not keep a typography marker.
    const firstClass = withoutThemeFields(
      { theme: { maxCardWidth: 380, preset: 'custom' } },
      ADVANCED_LAYOUT_KEYS,
    );
    expect(firstClass?.theme).toEqual({ maxCardWidth: 380 });
  });

  it('does not mutate the incoming override or theme', () => {
    const theme = { bodyPt: 11, cardPadding: 14 } as Partial<PageTheme>;
    const override = { theme };
    const snapshot = JSON.stringify(override);
    withThemeField(override, 'bodyPt', 12, COMPACT);
    withoutThemeFields(override, ADVANCED_TYPOGRAPHY_KEYS);
    expect(JSON.stringify(override)).toBe(snapshot);
  });

  it('freezes a custom baseline with hidden values but drops equal-to-global values', () => {
    const global = mergePageSettings(DEFAULT_PAGE_SETTINGS, undefined).theme;
    const full: PageTheme = {
      ...COMFORTABLE,
      bodyPt: 11,
      cardPadding: 14,
      density: 1,
      preset: 'custom',
    };
    const override = customThemeOverride(undefined, full, global);
    expect(override?.theme?.preset).toBe('custom');
    expect(override?.theme?.bodyPt).toBe(11);
    expect(override?.theme?.cardPadding).toBe(14);
    // Comfortable chrome/marker values differ from compact and are preserved.
    expect(override?.theme?.chromePt).toBe(COMFORTABLE.chromePt);
    expect(override?.theme?.markerPt).toBe(COMFORTABLE.markerPt);
    // Equal-to-global values keep following the global layer.
    expect(override?.theme?.density).toBeUndefined();
    expect(override?.theme?.childTrunkInset).toBeUndefined();
    expect(override?.theme?.pagePacking).toBeUndefined();

    const resolved = mergePageSettings(DEFAULT_PAGE_SETTINGS, override);
    expect(resolved.theme.bodyPt).toBe(11);
    expect(resolved.theme.heading1Pt).toBe(COMFORTABLE.heading1Pt);
    expect(resolved.theme.cardPadding).toBe(14);
  });

  it('keeps an existing unrelated override when freezing a custom theme', () => {
    const full: PageTheme = {
      ...COMPACT,
      bodyPt: 11,
      preset: 'custom',
      density: 0.8,
    };
    const override = customThemeOverride(
      { manualBreakBeforeBlockIds: ['b1'], theme: { density: 0.8 } },
      full,
      COMPACT,
    );
    expect(override?.manualBreakBeforeBlockIds).toEqual(['b1']);
    expect(override?.theme?.density).toBe(0.8);
    expect(override?.theme?.bodyPt).toBe(11);
  });

  it('applies the density lens once to stored advanced values', () => {
    const effective = effectivePageTheme({
      ...COMPACT,
      density: 0.8,
      bodyPt: 11,
      cardPadding: 14,
      maxCardWidth: 380,
      minContentWidth: 180,
      wrapIndent: 22,
      maxWrapIndent: 60,
      childIndent: 34,
    });
    expect(effective.bodyPt).toBe(9);
    expect(effective.cardPadding).toBeCloseTo(11.2, 5);
    expect(effective.maxCardWidth).toBe(304);
    expect(effective.minContentWidth).toBe(144);
    expect(effective.wrapIndent).toBe(22);
    expect(effective.maxWrapIndent).toBe(60);
    expect(effective.childIndent).toBe(26);
    expect(effective.density).toBe(1);
  });
});

describe('preset/Custom replacement warning', () => {
  it('warns for a global custom theme or a first-class custom cap', () => {
    expect(presetSwitchReplacesAdvancedValues('global', COMPACT, undefined)).toBe(false);
    expect(
      presetSwitchReplacesAdvancedValues('global', { ...COMPACT, preset: 'custom' }, undefined),
    ).toBe(true);
    expect(
      presetSwitchReplacesAdvancedValues('global', { ...COMPACT, maxCardWidth: 360 }, undefined),
    ).toBe(true);
    expect(
      presetSwitchReplacesAdvancedValues(
        'global',
        { ...COMFORTABLE, preset: 'custom' },
        undefined,
      ),
    ).toBe(true);
  });

  it('warns for explicit document advanced values and keeps density-only overrides quiet', () => {
    expect(
      presetSwitchReplacesAdvancedValues('document', COMPACT, { theme: { density: 0.8 } }),
    ).toBe(false);
    expect(
      presetSwitchReplacesAdvancedValues('document', COMPACT, { theme: { bodyPt: 11 } }),
    ).toBe(true);
    expect(
      presetSwitchReplacesAdvancedValues('document', COMPACT, {
        theme: { maxCardWidth: 360 },
      }),
    ).toBe(true);
    expect(
      presetSwitchReplacesAdvancedValues('document', COMPACT, {
        theme: { preset: 'custom' },
      }),
    ).toBe(true);
  });
});

describe('advanced field catalog', () => {
  it('exposes the frozen split and never the hidden engine fields', () => {
    expect(ADVANCED_TYPOGRAPHY_KEYS).toEqual([
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
    ]);
    expect(ADVANCED_LAYOUT_KEYS).toEqual([
      'minContentWidth',
      'cardPadding',
      'cardBorder',
      'segmentGap',
      'wrapIndent',
      'maxWrapIndent',
    ]);
    expect(EDITABLE_THEME_KEYS).toContain(MAX_CARD_WIDTH_KEY);
    for (const hidden of [
      'fontScale',
      'headingScale',
      'chromePt',
      'markerPt',
      'childTrunkInset',
      'calloutTrunkInset',
      'calloutCardIndent',
      'calloutRightGap',
      'calloutModeMinWidth',
      'siblingGap',
      'childIndent',
      'calloutGap',
    ] as const) {
      expect(EDITABLE_THEME_KEYS).not.toContain(hidden);
    }
    expect(hasThemeFieldOverride(undefined, ADVANCED_LAYOUT_KEYS)).toBe(false);
    expect(isThemeFieldOverridden(undefined, 'bodyPt')).toBe(false);
    expect(samePageThemeNumber(1, 1 + 1e-12)).toBe(true);
  });
});
