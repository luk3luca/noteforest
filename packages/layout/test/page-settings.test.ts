import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_CONTINUOUS_SETTINGS,
  DEFAULT_LAYOUT_OPTIONS,
  DEFAULT_PAGE_SETTINGS,
  mmToPx,
  normalizeAppSettings,
  normalizeContinuousSettings,
  normalizeContinuousSettingsOverride,
  normalizePageSettings,
  normalizePageSettingsOverride,
  mergeContinuousSettings,
  mergePageSettings,
  PAGE_THEME_PRESETS,
  pageCssVariables,
  pageDimensionsMm,
  pageGeometry,
  pageLayoutOptions,
  type PageSettings,
} from '../src/index.js';

describe('page settings defaults', () => {
  it('defaults to A4 landscape with 12 mm margins and the compact dense theme', () => {
    expect(DEFAULT_PAGE_SETTINGS.setup).toEqual({
      size: 'A4',
      orientation: 'landscape',
      margins: { top: 12, right: 12, bottom: 12, left: 12 },
    });
    expect(DEFAULT_PAGE_SETTINGS.theme.preset).toBe('compact');
    expect(DEFAULT_PAGE_SETTINGS.manualBreakBeforeBlockIds).toEqual([]);
    expect(DEFAULT_PAGE_SETTINGS.theme).toMatchObject({
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
      cardPadding: 8,
      segmentGap: 4,
      siblingGap: 16,
      wrapIndent: 12,
      maxWrapIndent: 36,
      calloutGap: 12,
      maxCardWidth: 420,
      minContentWidth: 160,
      pagePacking: 'beside',
    });
    expect(DEFAULT_APP_SETTINGS.page).toBe(DEFAULT_PAGE_SETTINGS);
    expect(DEFAULT_APP_SETTINGS.continuous).toBe(DEFAULT_CONTINUOUS_SETTINGS);
    expect(DEFAULT_CONTINUOUS_SETTINGS.zoom).toBe(1);
  });

  it('keeps the comfortable preset at the pre-R1 page density', () => {
    expect(PAGE_THEME_PRESETS.comfortable).toMatchObject({
      preset: 'comfortable',
      bodyPt: 10.5,
      bodyLine: 1.45,
      heading1Pt: 16,
      heading2Pt: 13.5,
      heading3Pt: 12,
      codePt: 8.75,
      codeLine: 1.45,
      tablePt: 9.5,
      tableLine: 1.35,
      cardPadding: 12,
      segmentGap: 8,
      siblingGap: 24,
      wrapIndent: 18,
      maxWrapIndent: 54,
      calloutGap: 20,
      maxCardWidth: 420,
      pagePacking: 'stacked',
    });
  });
});

describe('page dimensions and geometry', () => {
  it('swaps A4, A5, and Letter dimensions for orientation', () => {
    expect(pageDimensionsMm('A4', 'portrait')).toEqual({ widthMm: 210, heightMm: 297 });
    expect(pageDimensionsMm('A4', 'landscape')).toEqual({ widthMm: 297, heightMm: 210 });
    expect(pageDimensionsMm('A5', 'portrait')).toEqual({ widthMm: 148, heightMm: 210 });
    expect(pageDimensionsMm('A5', 'landscape')).toEqual({ widthMm: 210, heightMm: 148 });
    expect(pageDimensionsMm('Letter', 'portrait')).toEqual({ widthMm: 215.9, heightMm: 279.4 });
    expect(pageDimensionsMm('Letter', 'landscape')).toEqual({ widthMm: 279.4, heightMm: 215.9 });
  });

  it('computes pixel geometry from millimetre margins', () => {
    const geometry = pageGeometry({
      size: 'A5',
      orientation: 'portrait',
      margins: { top: 10, right: 8, bottom: 10, left: 8 },
    });
    expect(geometry.pageWidthMm).toBe(148);
    expect(geometry.pageHeightMm).toBe(210);
    expect(geometry.pageWidthPx).toBeCloseTo(mmToPx(148), 6);
    expect(geometry.pageHeightPx).toBeCloseTo(mmToPx(210), 6);
    expect(geometry.contentWidthPx).toBeCloseTo(mmToPx(148 - 16), 6);
    expect(geometry.contentHeightPx).toBeCloseTo(mmToPx(210 - 20), 6);
    expect(geometry.marginsPx.left).toBeCloseTo(mmToPx(8), 6);
  });
});

describe('settings normalization and merge', () => {
  it('fills a partial override from defaults', () => {
    const settings = normalizePageSettings({
      setup: { orientation: 'portrait', margins: { top: 18 } },
      theme: { bodyPt: 10 },
      manualBreakBeforeBlockIds: ['b2', 'b2', '', 7, 'b3'],
    });
    expect(settings.setup).toEqual({
      size: 'A4',
      orientation: 'portrait',
      margins: { top: 18, right: 12, bottom: 12, left: 12 },
    });
    expect(settings.theme.preset).toBe('compact');
    expect(settings.theme.bodyPt).toBe(10);
    expect(settings.theme.siblingGap).toBe(16);
    expect(settings.manualBreakBeforeBlockIds).toEqual(['b2', 'b3']);
  });

  it('switches to a named preset before applying explicit values', () => {
    const settings = normalizePageSettings({
      theme: { preset: 'comfortable', bodyPt: 11 },
    });
    expect(settings.theme.preset).toBe('comfortable');
    expect(settings.theme.bodyPt).toBe(11);
    expect(settings.theme.cardPadding).toBe(12);
    expect(settings.theme.segmentGap).toBe(8);
  });

  it('merges onto an existing base without starting over', () => {
    const base = normalizePageSettings({
      setup: { size: 'Letter', orientation: 'portrait' },
      theme: { preset: 'comfortable', siblingGap: 30 },
      manualBreakBeforeBlockIds: ['b1'],
    });
    const merged = mergePageSettings(base, { theme: { bodyPt: 12 } });
    expect(merged.setup.size).toBe('Letter');
    expect(merged.theme.preset).toBe('comfortable');
    expect(merged.theme.bodyPt).toBe(12);
    expect(merged.theme.siblingGap).toBe(30);
    expect(merged.manualBreakBeforeBlockIds).toEqual(['b1']);
  });

  it('clamps unsafe values and falls back on impossible margins', () => {
    const settings = normalizePageSettings({
      setup: {
        size: 'A4',
        orientation: 'portrait',
        margins: { top: -1, left: 190, right: 190 },
      },
      theme: {
        bodyPt: 100,
        bodyLine: 0,
        wrapIndent: 100,
        maxWrapIndent: 10,
        minContentWidth: 900,
        maxCardWidth: 100,
      },
    });
    expect(settings.setup.margins).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    expect(settings.theme.bodyPt).toBe(24);
    expect(settings.theme.bodyLine).toBe(1);
    expect(settings.theme.wrapIndent).toBe(96);
    expect(settings.theme.maxWrapIndent).toBe(96);
    expect(settings.theme.minContentWidth).toBe(800);
    expect(settings.theme.maxCardWidth).toBeGreaterThanOrEqual(800);
  });

  it('normalizes app and continuous settings', () => {
    expect(normalizeContinuousSettings({ zoom: 99 })).toEqual({ zoom: 4 });
    expect(normalizeContinuousSettings(undefined)).toEqual({ zoom: 1 });
    const app = normalizeAppSettings({ page: { setup: { size: 'A5' } }, continuous: { zoom: 0 } });
    expect(app.page.setup.size).toBe('A5');
    expect(app.continuous.zoom).toBe(0.25);
    expect(mergeContinuousSettings({ zoom: 1 }, { zoom: 1.5 })).toEqual({ zoom: 1.5 });
    expect(mergeContinuousSettings({ zoom: 1.7 }, null)).toEqual({ zoom: 1.7 });
  });

  it('normalizes a per-document override without expanding it into a full settings object', () => {
    const override = normalizePageSettingsOverride({
      setup: { orientation: 'portrait', margins: { top: 18, left: 'bad' } },
      theme: { bodyPt: 9.5, unknown: 1 },
      manualBreakBeforeBlockIds: ['b2', 'b2', 4],
      extra: 'dropped',
    });
    expect(override).toEqual({
      setup: { orientation: 'portrait', margins: { top: 18 } },
      theme: { bodyPt: 9.5 },
      manualBreakBeforeBlockIds: ['b2'],
    });
    // The surviving fields resolve exactly like a full normalization.
    expect(mergePageSettings(DEFAULT_PAGE_SETTINGS, override)).toEqual(
      normalizePageSettings({
        setup: { orientation: 'portrait', margins: { top: 18 } },
        theme: { bodyPt: 9.5 },
        manualBreakBeforeBlockIds: ['b2'],
      }),
    );
  });

  it('keeps preset changes and explicit values in an override', () => {
    const override = normalizePageSettingsOverride({
      theme: { preset: 'comfortable', bodyPt: 11 },
    });
    expect(override).toEqual({ theme: { preset: 'comfortable', bodyPt: 11 } });
    const resolved = mergePageSettings(DEFAULT_PAGE_SETTINGS, override);
    expect(resolved.theme.preset).toBe('comfortable');
    expect(resolved.theme.bodyPt).toBe(11);
    expect(resolved.theme.cardPadding).toBe(12);
  });

  it('normalizes the page packing policy from a theme override', () => {
    expect(
      normalizePageSettingsOverride({ theme: { pagePacking: 'stacked' } }),
    ).toEqual({ theme: { pagePacking: 'stacked' } });
    expect(
      normalizePageSettingsOverride({ theme: { pagePacking: 'beside' } }),
    ).toEqual({ theme: { pagePacking: 'beside' } });
    expect(normalizePageSettingsOverride({ theme: { pagePacking: 'columns' } })).toBeUndefined();
    expect(
      mergePageSettings(DEFAULT_PAGE_SETTINGS, { theme: { pagePacking: 'stacked' } }).theme
        .pagePacking,
    ).toBe('stacked');
    // A preset switch starts from that preset's packing unless it is overridden.
    expect(normalizePageSettings({ theme: { preset: 'comfortable' } }).theme.pagePacking).toBe(
      'stacked',
    );
    expect(
      normalizePageSettings({ theme: { preset: 'comfortable', pagePacking: 'beside' } }).theme
        .pagePacking,
    ).toBe('beside');
  });

  it('drops empty or invalid overrides and normalizes continuous overrides', () => {
    expect(normalizePageSettingsOverride(undefined)).toBeUndefined();
    expect(normalizePageSettingsOverride(null)).toBeUndefined();
    expect(normalizePageSettingsOverride({ theme: {} })).toBeUndefined();
    expect(normalizePageSettingsOverride('nope')).toBeUndefined();
    expect(normalizeContinuousSettingsOverride({ zoom: 2 })).toEqual({ zoom: 2 });
    expect(normalizeContinuousSettingsOverride({ zoom: 99 })).toEqual({ zoom: 4 });
    expect(normalizeContinuousSettingsOverride({ zoom: 'x' })).toBeUndefined();
    expect(normalizeContinuousSettingsOverride(null)).toBeUndefined();
  });
});

describe('theme maps', () => {
  const theme = PAGE_THEME_PRESETS.compact;

  it('maps a theme to layout options without a second tuning path', () => {
    expect(pageLayoutOptions(theme)).toEqual({
      minContentWidth: theme.minContentWidth,
      maxContentWidth: theme.maxCardWidth,
      siblingGap: theme.siblingGap,
      wrapIndent: theme.wrapIndent,
      maxWrapIndent: theme.maxWrapIndent,
      wrapPolicy: DEFAULT_LAYOUT_OPTIONS.wrapPolicy,
      pagePacking: theme.pagePacking,
      calloutGap: theme.calloutGap,
      chapterGap: DEFAULT_LAYOUT_OPTIONS.chapterGap,
      cardPadding: theme.cardPadding,
      cardBorder: theme.cardBorder,
      segmentGap: theme.segmentGap,
    });
  });

  it('maps typography and box values to CSS variables', () => {
    const variables = pageCssVariables(theme);
    expect(variables['--nf-page-body-size']).toBe('9pt');
    expect(variables['--nf-page-body-line']).toBe('1.3');
    expect(variables['--nf-page-heading-1']).toBe('14pt');
    expect(variables['--nf-page-heading-2']).toBe('12pt');
    expect(variables['--nf-page-heading-3']).toBe('10.5pt');
    expect(variables['--nf-page-code-size']).toBe('8pt');
    expect(variables['--nf-page-table-size']).toBe('8.5pt');
    expect(variables['--nf-page-card-padding']).toBe('8px');
    expect(variables['--nf-page-card-border']).toBe('1px');
    expect(variables['--nf-page-segment-gap']).toBe('4px');
    expect(variables['--nf-page-sibling-gap']).toBe('16px');
    expect(variables['--nf-page-wrap-indent']).toBe('12px');
    expect(variables['--nf-page-max-wrap-indent']).toBe('36px');
    expect(variables['--nf-page-callout-gap']).toBe('12px');
    expect(variables['--nf-page-max-card-width']).toBe('420px');
    expect(variables['--nf-page-min-content-width']).toBe('160px');
  });

  it('applies font and heading scales', () => {
    const scaled: PageSettings['theme'] = {
      ...theme,
      fontScale: 1.1,
      headingScale: 1.2,
    };
    const variables = pageCssVariables(scaled);
    expect(variables['--nf-page-body-size']).toBe('9.9pt');
    expect(variables['--nf-page-heading-1']).toBe('18.48pt');
  });
});
