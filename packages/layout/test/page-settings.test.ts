import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_LAYOUT_OPTIONS,
  DEFAULT_PAGE_SETTINGS,
  PAGE_EDGE_GEOMETRY,
  PAGE_EDGE_STYLE,
  effectivePageTheme,
  mmToPx,
  normalizeAppSettings,
  normalizePageDensity,
  normalizePageSettings,
  normalizePageSettingsOverride,
  mergePageSettings,
  PAGE_BODY_PT_FLOOR,
  PAGE_DENSITY_DEFAULT,
  PAGE_DENSITY_MAX,
  PAGE_DENSITY_MIN,
  PAGE_DENSITY_STEP,
  PAGE_MAX_CARD_WIDTH_MAX,
  PAGE_MAX_CARD_WIDTH_MIN,
  PAGE_MIN_CONTENT_WIDTH_FLOOR,
  PAGE_THEME_PRESETS,
  pageCssVariables,
  pageDimensionsMm,
  pageGeometry,
  pageLayoutOptions,
  pageSettingsFingerprint,
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
      siblingGap: 18,
      wrapIndent: 12,
      maxWrapIndent: 36,
      childIndent: 26,
      childTrunkInset: 12,
      calloutTrunkInset: 24,
      calloutCardIndent: 38,
      calloutRightGap: 24,
      calloutModeMinWidth: 240,
      calloutGap: 16,
      maxCardWidth: 420,
      minContentWidth: 160,
      pagePacking: 'beside',
    });
    expect(DEFAULT_APP_SETTINGS.page).toBe(DEFAULT_PAGE_SETTINGS);
    expect(DEFAULT_PAGE_SETTINGS.chrome).toEqual({
      header: 'document',
      footer: 'chapter',
      pageNumber: true,
    });
    expect(DEFAULT_APP_SETTINGS).not.toHaveProperty('continuous');
  });

  it('keeps the comfortable preset density-only with the shared Page topology', () => {
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
      siblingGap: 18,
      wrapIndent: 18,
      maxWrapIndent: 54,
      childIndent: 26,
      childTrunkInset: 12,
      calloutTrunkInset: 24,
      calloutCardIndent: 38,
      calloutRightGap: 24,
      calloutModeMinWidth: 240,
      calloutGap: 16,
      maxCardWidth: 420,
      pagePacking: 'beside',
    });
    // Density only: a preset switch must not change the Page callout topology.
    expect(pageLayoutOptions(PAGE_THEME_PRESETS.comfortable)).toMatchObject({
      pagePacking: 'beside',
      calloutModes: true,
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
    expect(settings.theme.siblingGap).toBe(18);
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

  it('normalizes app settings and ignores a legacy continuous block', () => {
    // S2-6: the dead ContinuousSettings.zoom is gone; a legacy `continuous`
    // object in stored input cannot resurrect a second zoom source.
    const app = normalizeAppSettings({
      page: { setup: { size: 'A5' } },
      continuous: { zoom: 4 },
    } as Parameters<typeof normalizeAppSettings>[0]);
    expect(app.page.setup.size).toBe('A5');
    expect(app).not.toHaveProperty('continuous');
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
    expect(
      normalizePageSettingsOverride({ theme: { pagePacking: 'compaction' } }),
    ).toEqual({ theme: { pagePacking: 'compaction' } });
    expect(normalizePageSettingsOverride({ theme: { pagePacking: 'columns' } })).toBeUndefined();
    expect(
      mergePageSettings(DEFAULT_PAGE_SETTINGS, { theme: { pagePacking: 'stacked' } }).theme
        .pagePacking,
    ).toBe('stacked');
    // A preset switch starts from that preset's packing unless it is overridden.
    expect(normalizePageSettings({ theme: { preset: 'comfortable' } }).theme.pagePacking).toBe(
      'beside',
    );
    expect(
      normalizePageSettings({ theme: { preset: 'comfortable', pagePacking: 'beside' } }).theme
        .pagePacking,
    ).toBe('beside');
    // A compact preset switch selects the tree/column packing unless overridden.
    expect(normalizePageSettings({ theme: { preset: 'compact' } }).theme.pagePacking).toBe(
      'beside',
    );
  });

  it('normalizes the R2j callout-mode tokens through the same theme path', () => {
    expect(
      normalizePageSettingsOverride({
        theme: {
          childTrunkInset: 14,
          calloutTrunkInset: 30,
          calloutCardIndent: 46,
          calloutRightGap: 20,
          calloutModeMinWidth: 300,
        },
      }),
    ).toEqual({
      theme: {
        childTrunkInset: 14,
        calloutTrunkInset: 30,
        calloutCardIndent: 46,
        calloutRightGap: 20,
        calloutModeMinWidth: 300,
      },
    });
    const resolved = normalizePageSettings({
      theme: {
        calloutTrunkInset: 30,
        calloutCardIndent: 20,
        calloutRightGap: 1000,
        calloutModeMinWidth: 1000,
      },
    });
    // The card indent never sits left of its trunk; numeric ranges clamp.
    expect(resolved.theme.calloutCardIndent).toBe(30);
    expect(resolved.theme.calloutRightGap).toBe(96);
    expect(resolved.theme.calloutModeMinWidth).toBe(800);
    // R2 seam review F6: a custom mode A gap never collapses the leader stem.
    expect(
      normalizePageSettings({ theme: { calloutRightGap: 0 } }).theme.calloutRightGap,
    ).toBe(PAGE_EDGE_STYLE.stemMin);
  });

  it('drops empty or invalid overrides', () => {
    expect(normalizePageSettingsOverride(undefined)).toBeUndefined();
    expect(normalizePageSettingsOverride(null)).toBeUndefined();
    expect(normalizePageSettingsOverride({ theme: {} })).toBeUndefined();
    expect(normalizePageSettingsOverride('nope')).toBeUndefined();
  });
});

describe('R2 page chrome settings', () => {
  it('loads old settings and overrides without chrome with the approved defaults', () => {
    // A settings.json / document override written before R2 has no `chrome`.
    const old = normalizePageSettings({
      setup: { size: 'A5' },
      theme: { bodyPt: 10 },
      manualBreakBeforeBlockIds: ['b2'],
    });
    expect(old.chrome).toEqual({ header: 'document', footer: 'chapter', pageNumber: true });
    expect(normalizePageSettingsOverride({ setup: { size: 'A5' } })).toEqual({
      setup: { size: 'A5' },
    });
    expect(mergePageSettings(DEFAULT_PAGE_SETTINGS, { theme: { bodyPt: 10 } }).chrome).toEqual(
      DEFAULT_PAGE_SETTINGS.chrome,
    );
  });

  it('sanitizes an invalid or partial chrome value field by field', () => {
    expect(
      normalizePageSettings({
        chrome: { header: 'none', footer: 'custom', pageNumber: 'yes' },
      }).chrome,
    ).toEqual({ header: 'none', footer: 'chapter', pageNumber: true });
    expect(
      normalizePageSettings({ chrome: { header: 'chapter', footer: 'none', pageNumber: false } })
        .chrome,
    ).toEqual({ header: 'chapter', footer: 'none', pageNumber: false });
    expect(normalizePageSettings({ chrome: null }).chrome).toEqual(DEFAULT_PAGE_SETTINGS.chrome);
  });

  it('keeps only explicitly present chrome fields in a document override', () => {
    expect(
      normalizePageSettingsOverride({ chrome: { footer: 'none', pageNumber: false } }),
    ).toEqual({ chrome: { footer: 'none', pageNumber: false } });
    expect(normalizePageSettingsOverride({ chrome: { header: 'bogus' } })).toBeUndefined();
    expect(normalizePageSettingsOverride({ chrome: {} })).toBeUndefined();
    const resolved = mergePageSettings(DEFAULT_PAGE_SETTINGS, {
      chrome: { footer: 'document' },
    });
    expect(resolved.chrome).toEqual({
      header: 'document',
      footer: 'document',
      pageNumber: true,
    });
  });

  it('includes chrome in the settings fingerprint used by measurement and print', () => {
    const base = normalizePageSettings({});
    const header = normalizePageSettings({ chrome: { header: 'none' } });
    const footer = normalizePageSettings({ chrome: { footer: 'none' } });
    const number = normalizePageSettings({ chrome: { pageNumber: false } });
    const fingerprints = [
      pageSettingsFingerprint(base),
      pageSettingsFingerprint(header),
      pageSettingsFingerprint(footer),
      pageSettingsFingerprint(number),
    ];
    expect(new Set(fingerprints).size).toBe(4);
    // A chrome change does not change page geometry or the effective theme.
    expect(header.setup).toEqual(base.setup);
    expect(header.theme).toEqual(base.theme);
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
      childIndent: theme.childIndent,
      childTrunkInset: theme.childTrunkInset,
      calloutTrunkInset: theme.calloutTrunkInset,
      calloutCardIndent: theme.calloutCardIndent,
      calloutRightGap: theme.calloutRightGap,
      calloutModeMinWidth: theme.calloutModeMinWidth,
      calloutModes: true,
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
    expect(variables['--nf-page-max-card-width']).toBe('420px');
  });

  it('emits only CSS variables the Page presentation layer consumes', () => {
    const variables = pageCssVariables(theme);
    expect(Object.keys(variables).sort()).toEqual(
      [
        '--nf-page-body-line',
        '--nf-page-body-size',
        '--nf-page-card-border',
        '--nf-page-card-padding',
        '--nf-page-chrome-size',
        '--nf-page-code-line',
        '--nf-page-code-size',
        '--nf-page-edge-width',
        '--nf-page-heading-1',
        '--nf-page-heading-2',
        '--nf-page-heading-3',
        '--nf-page-label-size',
        '--nf-page-marker-size',
        '--nf-page-max-card-width',
        '--nf-page-segment-gap',
        '--nf-page-table-line',
        '--nf-page-table-size',
      ].sort(),
    );
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

describe('page density lens (M4d1/M4e2)', () => {
  const compact = PAGE_THEME_PRESETS.compact;
  const at = (density: number) => effectivePageTheme({ ...compact, density });

  it('defaults to 100% and normalizes the 60-120 range to the 5% step', () => {
    expect(DEFAULT_PAGE_SETTINGS.theme.density).toBe(PAGE_DENSITY_DEFAULT);
    expect(normalizePageSettings().theme.density).toBe(1);
    expect(PAGE_DENSITY_MIN).toBe(0.6);
    expect(PAGE_DENSITY_MAX).toBe(1.2);
    expect(PAGE_DENSITY_STEP).toBe(0.05);
    expect(normalizePageSettings({ theme: { density: 0.5 } }).theme.density).toBe(
      PAGE_DENSITY_MIN,
    );
    expect(normalizePageSettings({ theme: { density: 9 } }).theme.density).toBe(PAGE_DENSITY_MAX);
    expect(normalizePageSettings({ theme: { density: 'x' } }).theme.density).toBe(1);
    expect(normalizePageDensity(Number.NaN)).toBe(1);
    // One canonical 5% step for the slider, settings.json, and overrides.
    expect(normalizePageDensity(0.62)).toBe(0.6);
    expect(normalizePageDensity(0.854)).toBe(0.85);
    expect(normalizePageDensity(0.63)).toBe(0.65);
    expect(normalizePageDensity(1.19)).toBe(1.2);
    for (const density of [0.6, 0.65, 0.7, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2]) {
      expect(normalizePageDensity(density)).toBe(density);
    }
  });

  it('keeps every 80-120 value valid and adds the 60-75 steps', () => {
    for (const density of [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2]) {
      const settings = normalizePageSettings({ theme: { density } });
      expect(settings.theme.density).toBe(density);
      expect(at(density).bodyPt).toBeGreaterThanOrEqual(PAGE_BODY_PT_FLOOR);
    }
  });

  it('round-trips a per-document density override without expanding it', () => {
    const override = normalizePageSettingsOverride({ theme: { density: 0.9 } });
    expect(override).toEqual({ theme: { density: 0.9 } });
    const merged = mergePageSettings(DEFAULT_PAGE_SETTINGS, override);
    expect(merged.theme.preset).toBe('compact');
    expect(merged.theme.density).toBe(0.9);
    // Another document keeps the global lens.
    expect(mergePageSettings(DEFAULT_PAGE_SETTINGS, undefined).theme.density).toBe(1);
    expect(normalizePageSettingsOverride({ theme: { density: 'bad' } })).toBeUndefined();
    // The new low end round-trips through the same override path.
    expect(normalizePageSettingsOverride({ theme: { density: 0.6 } })).toEqual({
      theme: { density: 0.6 },
    });
  });

  it('keeps density across a preset switch unless the override names one', () => {
    const base = normalizePageSettings({ theme: { density: 0.9 } });
    const switched = mergePageSettings(base, { theme: { preset: 'comfortable' } });
    expect(switched.theme.preset).toBe('comfortable');
    expect(switched.theme.density).toBe(0.9);
    const explicit = mergePageSettings(base, {
      theme: { preset: 'comfortable', density: 1.1 },
    });
    expect(explicit.theme.density).toBe(1.1);
  });

  it('includes density and the effective lens in the settings fingerprint', () => {
    const low = normalizePageSettings({ theme: { density: 0.6 } });
    const lowAgain = normalizePageSettings({ theme: { density: 0.6 } });
    const normal = normalizePageSettings({ theme: { density: 1 } });
    expect(pageSettingsFingerprint(low)).toBe(pageSettingsFingerprint(lowAgain));
    expect(pageSettingsFingerprint(low)).not.toBe(pageSettingsFingerprint(normal));
    expect(
      pageSettingsFingerprint(normalizePageSettings({ theme: { density: 0.8 } })),
    ).not.toBe(pageSettingsFingerprint(normalizePageSettings({ theme: { density: 0.9 } })));
    // The measured identity carries the resolved floors, not only the stored
    // density: a model measured under a different lens cannot be accepted.
    const parts = JSON.parse(pageSettingsFingerprint(low)) as unknown[];
    expect(parts[3]).toMatchObject({ density: 0.6 });
    expect(parts[4]).toEqual({ header: 'document', footer: 'chapter', pageNumber: true });
    expect(parts[6]).toMatchObject({
      density: 1,
      bodyPt: PAGE_BODY_PT_FLOOR,
      maxCardWidth: 252,
      minContentWidth: PAGE_MIN_CONTENT_WIDTH_FLOOR,
    });
  });

  it('makes 60% strictly more compact than 65/70/80/90/100% in type and boxes', () => {
    const steps = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1];
    const themes = steps.map(at);
    for (let index = 1; index < themes.length; index += 1) {
      const lower = themes[index - 1]!;
      const higher = themes[index]!;
      expect(lower.bodyPt, `body at ${steps[index]}`).toBeLessThan(higher.bodyPt);
      expect(lower.heading1Pt).toBeLessThan(higher.heading1Pt);
      expect(lower.cardPadding).toBeLessThan(higher.cardPadding);
      expect(lower.segmentGap).toBeLessThan(higher.segmentGap);
      expect(lower.maxCardWidth).toBeLessThan(higher.maxCardWidth);
    }
    expect(themes[0]).toMatchObject({
      bodyPt: 7,
      heading1Pt: 10,
      heading2Pt: 8.5,
      heading3Pt: 8,
      codePt: 7,
      tablePt: 7,
      labelPt: 7,
      chromePt: 6,
      markerPt: 6,
      cardPadding: 4.8,
      segmentGap: 2.4,
      siblingGap: 18,
      maxCardWidth: 252,
      minContentWidth: PAGE_MIN_CONTENT_WIDTH_FLOOR,
    });
    expect(themes[4]).toMatchObject({
      bodyPt: 8,
      heading1Pt: 12,
      heading2Pt: 10.25,
      heading3Pt: 9.25,
      codePt: 7.5,
      cardPadding: 6.4,
      maxCardWidth: 336,
    });
    expect(themes[6]).toMatchObject({
      bodyPt: 8.5,
      heading1Pt: 13,
      heading2Pt: 11.13,
      cardPadding: 7.2,
      maxCardWidth: 378,
      minContentWidth: 144,
    });
    expect(themes[8]).toEqual(compact);
  });

  it('scales typography from the 7 pt floor to the preset and keeps headings above body', () => {
    const low = at(0.6);
    expect(low.bodyPt).toBe(PAGE_BODY_PT_FLOOR);
    expect(low.labelPt).toBe(PAGE_BODY_PT_FLOOR);
    expect(low.codePt).toBe(7);
    expect(low.tablePt).toBe(7);
    expect(low.heading3Pt).toBeGreaterThanOrEqual(low.bodyPt);
    expect(low.heading2Pt).toBeGreaterThan(low.bodyPt);
    expect(low.heading1Pt).toBeGreaterThan(low.bodyPt);
    const high = at(1.2);
    expect(high.bodyPt).toBe(10.8);
    expect(high.heading1Pt).toBe(16.8);
    expect(high.heading2Pt).toBe(14.4);
    expect(high.heading3Pt).toBe(12.6);
    for (const density of [0.6, 0.65, 0.7, 0.8, 0.85, 0.9, 1, 1.1, 1.2]) {
      const theme = at(density);
      expect(theme.bodyPt).toBeGreaterThanOrEqual(PAGE_BODY_PT_FLOOR);
      expect(theme.heading1Pt).toBeGreaterThan(theme.bodyPt);
      expect(theme.heading2Pt).toBeGreaterThan(theme.bodyPt);
      expect(theme.heading3Pt).toBeGreaterThanOrEqual(theme.bodyPt);
    }
  });

  it('scales box metrics, indents, and the readable card clamps', () => {
    const low = at(0.6);
    expect(low.cardPadding).toBe(4.8);
    expect(low.segmentGap).toBe(2.4);
    expect(low.siblingGap).toBe(18);
    expect(low.wrapIndent).toBe(12);
    expect(low.maxWrapIndent).toBe(36);
    expect(low.childIndent).toBe(26);
    expect(low.childTrunkInset).toBe(12);
    expect(low.calloutCardIndent).toBe(38);
    expect(low.maxCardWidth).toBe(252);
    expect(low.minContentWidth).toBe(PAGE_MIN_CONTENT_WIDTH_FLOOR);
    const high = at(1.2);
    expect(high.cardPadding).toBe(9.6);
    expect(high.siblingGap).toBe(18);
    expect(high.wrapIndent).toBe(12);
    expect(high.maxCardWidth).toBe(504);
    expect(high.minContentWidth).toBe(192);
    for (const density of [0.6, 0.65, 0.7, 0.8, 0.85, 0.9, 1, 1.1, 1.2]) {
      const theme = at(density);
      expect(theme.minContentWidth).toBeGreaterThanOrEqual(PAGE_MIN_CONTENT_WIDTH_FLOOR);
      expect(theme.maxCardWidth).toBeGreaterThanOrEqual(PAGE_MAX_CARD_WIDTH_MIN);
      expect(theme.maxCardWidth).toBeLessThanOrEqual(
        Math.max(PAGE_MAX_CARD_WIDTH_MAX, theme.minContentWidth),
      );
      // R2j1 keeps the wrapped-child stem origin clear of its trunk.
      expect(theme.childIndent).toBeGreaterThanOrEqual(theme.childTrunkInset + PAGE_EDGE_STYLE.stemMin);
      expect(theme.calloutCardIndent).toBeGreaterThanOrEqual(theme.calloutTrunkInset);
      expect(theme.maxWrapIndent).toBeGreaterThanOrEqual(theme.wrapIndent);
    }
  });

  it('leaves an explicit custom card cap outside the readable band alone', () => {
    // A custom narrow cap keeps scaling instead of jumping up to 240.
    const narrow = effectivePageTheme({
      ...compact,
      density: 0.8,
      maxCardWidth: 200,
      minContentWidth: 120,
    });
    expect(narrow.maxCardWidth).toBe(160);
    expect(narrow.minContentWidth).toBe(96);
    // A custom wide cap keeps scaling instead of being cut to 560.
    const wide = effectivePageTheme({ ...compact, density: 1.2, maxCardWidth: 1000 });
    expect(wide.maxCardWidth).toBe(1200);
    // A cap inside the band is guarded at 240 when it would go below.
    const guarded = effectivePageTheme({ ...compact, density: 0.6, maxCardWidth: 300 });
    expect(guarded.maxCardWidth).toBe(240);
  });

  it('never changes page setup or margins', () => {
    const low = normalizePageSettings({ theme: { density: 0.6 } });
    const high = normalizePageSettings({ theme: { density: 1.2 } });
    expect(low.setup).toEqual(DEFAULT_PAGE_SETTINGS.setup);
    expect(high.setup).toEqual(DEFAULT_PAGE_SETTINGS.setup);
    expect(pageGeometry(low.setup)).toEqual(pageGeometry(high.setup));
  });

  it('is idempotent and feeds layout options and CSS from the effective theme', () => {
    const effective = at(0.9);
    expect(effective.density).toBe(1);
    // Applying the lens twice is the identity.
    expect(effectivePageTheme(effective)).toEqual(effective);
    expect(pageLayoutOptions(at(0.6))).toMatchObject({
      minContentWidth: 140,
      maxContentWidth: 252,
      cardPadding: 4.8,
      segmentGap: 2.4,
      siblingGap: 18,
      wrapIndent: 12,
    });
    const low = pageCssVariables(at(0.6));
    expect(low['--nf-page-body-size']).toBe('7pt');
    expect(low['--nf-page-card-padding']).toBe('4.8px');
    expect(low['--nf-page-max-card-width']).toBe('252px');
    expect(pageCssVariables(at(0.8))['--nf-page-body-size']).toBe('8pt');
    expect(pageCssVariables(at(1.2))['--nf-page-body-size']).toBe('10.8pt');
    // A stored theme at 100% is passed through unchanged.
    expect(pageCssVariables({ ...compact, density: 1 })).toEqual(pageCssVariables(compact));
  });

  it('keeps comfortable readable at both ends of the slider', () => {
    const low = effectivePageTheme({ ...PAGE_THEME_PRESETS.comfortable, density: 0.6 });
    expect(low.bodyPt).toBe(PAGE_BODY_PT_FLOOR);
    expect(low.cardPadding).toBe(7.2);
    expect(low.heading3Pt).toBeGreaterThanOrEqual(low.bodyPt);
    const dense = effectivePageTheme({ ...PAGE_THEME_PRESETS.comfortable, density: 0.8 });
    expect(dense.bodyPt).toBe(8.75);
    expect(dense.cardPadding).toBe(9.6);
    expect(dense.heading3Pt).toBe(10);
    const high = effectivePageTheme({ ...PAGE_THEME_PRESETS.comfortable, density: 1.2 });
    expect(high.bodyPt).toBe(12.6);
    expect(high.cardPadding).toBe(14.4);
    expect(high.maxCardWidth).toBe(504);
  });
});

describe('Page edge corridor (fixed 18 px)', () => {
  const compact = PAGE_THEME_PRESETS.compact;
  const densities = [0.6, 0.7, 1, 1.2] as const;

  it('defines one lead + stem invariant', () => {
    expect(PAGE_EDGE_GEOMETRY.lead).toBe(4);
    expect(PAGE_EDGE_GEOMETRY.stem).toBe(14);
    expect(PAGE_EDGE_GEOMETRY.corridor).toBe(18);
    expect(PAGE_EDGE_GEOMETRY.lead + PAGE_EDGE_GEOMETRY.stem).toBe(
      PAGE_EDGE_GEOMETRY.corridor,
    );
    expect(PAGE_EDGE_GEOMETRY.corridor).toBe(PAGE_EDGE_GEOMETRY.siblingGap);
    expect(PAGE_EDGE_GEOMETRY.childIndent).toBe(
      PAGE_EDGE_GEOMETRY.childTrunkInset + PAGE_EDGE_GEOMETRY.stem,
    );
    expect(PAGE_EDGE_GEOMETRY.calloutCardIndent).toBe(
      PAGE_EDGE_GEOMETRY.calloutTrunkInset + PAGE_EDGE_GEOMETRY.stem,
    );
    // The Page style uses the same stem; the fixed arrowhead and stroke widths
    // stay the current Page contract.
    expect(PAGE_EDGE_STYLE.stemMin).toBe(PAGE_EDGE_GEOMETRY.stem);
    expect(PAGE_EDGE_STYLE.arrowLength).toBe(6);
    expect(PAGE_EDGE_STYLE.arrowHalfWidth).toBe(3);
    expect(PAGE_EDGE_STYLE.edgeWidth).toBe(1.25);
    expect(PAGE_EDGE_STYLE.edgeWidthActive).toBe(1.75);
    expect(PAGE_EDGE_STYLE.edgeWidthMuted).toBe(1);
  });

  it('keeps the same corridor and arrowhead at 60/70/100/120%', () => {
    for (const density of densities) {
      const effective = effectivePageTheme({ ...compact, density });
      expect(effective.siblingGap, `sibling gap at ${density}`).toBe(
        PAGE_EDGE_GEOMETRY.siblingGap,
      );
      expect(effective.childIndent).toBe(PAGE_EDGE_GEOMETRY.childIndent);
      expect(effective.childTrunkInset).toBe(PAGE_EDGE_GEOMETRY.childTrunkInset);
      expect(effective.calloutTrunkInset).toBe(PAGE_EDGE_GEOMETRY.calloutTrunkInset);
      expect(effective.calloutCardIndent).toBe(PAGE_EDGE_GEOMETRY.calloutCardIndent);
      expect(effective.calloutGap).toBe(PAGE_EDGE_GEOMETRY.calloutGap);
      expect(effective.calloutRightGap).toBe(PAGE_EDGE_GEOMETRY.calloutRightGap);
      // Indents and wrap origins are fixed too, so a group cannot be pulled
      // inside the artery by a density-scaled cap.
      expect(effective.wrapIndent).toBe(compact.wrapIndent);
      expect(effective.maxWrapIndent).toBe(compact.maxWrapIndent);
      expect(effective.maxWrapIndent).toBeGreaterThanOrEqual(effective.childIndent);

      const options = pageLayoutOptions({ ...compact, density });
      expect(options.siblingGap).toBe(PAGE_EDGE_GEOMETRY.siblingGap);
      expect(options.childIndent).toBe(PAGE_EDGE_GEOMETRY.childIndent);
      expect(options.childTrunkInset).toBe(PAGE_EDGE_GEOMETRY.childTrunkInset);
      expect(options.calloutTrunkInset).toBe(PAGE_EDGE_GEOMETRY.calloutTrunkInset);
      expect(options.calloutCardIndent).toBe(PAGE_EDGE_GEOMETRY.calloutCardIndent);
      expect(options.calloutGap).toBe(PAGE_EDGE_GEOMETRY.calloutGap);
      expect(options.calloutRightGap).toBe(PAGE_EDGE_GEOMETRY.calloutRightGap);
      // Density still moves type, padding, segment gap, and content width
      // below 100%.
      if (density < 1) {
        expect(effective.cardPadding).toBeLessThan(compact.cardPadding);
        expect(effective.segmentGap).toBeLessThan(compact.segmentGap);
      }
    }
    const high = effectivePageTheme({ ...compact, density: 1.2 });
    expect(high.cardPadding).toBe(9.6);
    expect(high.segmentGap).toBe(4.8);
  });

  it('ignores a legacy stored geometry override at every density', () => {
    const legacy = {
      ...compact,
      siblingGap: 40,
      childIndent: 60,
      calloutCardIndent: 70,
      calloutGap: 30,
      calloutRightGap: 36,
      childTrunkInset: 30,
      calloutTrunkInset: 44,
      maxWrapIndent: 20,
    };
    for (const density of densities) {
      const options = pageLayoutOptions({ ...legacy, density });
      expect(options.siblingGap).toBe(PAGE_EDGE_GEOMETRY.siblingGap);
      expect(options.childIndent).toBe(PAGE_EDGE_GEOMETRY.childIndent);
      expect(options.calloutCardIndent).toBe(PAGE_EDGE_GEOMETRY.calloutCardIndent);
      expect(options.calloutGap).toBe(PAGE_EDGE_GEOMETRY.calloutGap);
      expect(options.calloutRightGap).toBe(PAGE_EDGE_GEOMETRY.calloutRightGap);
      expect(options.childTrunkInset).toBe(PAGE_EDGE_GEOMETRY.childTrunkInset);
      expect(options.calloutTrunkInset).toBe(PAGE_EDGE_GEOMETRY.calloutTrunkInset);
    }
  });
});
