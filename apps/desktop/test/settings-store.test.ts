import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_PAGE_SETTINGS,
  PAGE_THEME_PRESETS,
  type PageSettingsOverride,
} from '@noteforest/layout';
import {
  pageDensityPercent,
  pageDensityValue,
  resetSettingsForTests,
  useSettingsStore,
  withPageDensityOverride,
  withoutPageDensityOverride,
} from '../src/renderer/src/state/settings';

beforeEach(() => {
  resetSettingsForTests();
});

describe('renderer personal settings resolution', () => {
  it('starts on the compact product defaults', () => {
    const store = useSettingsStore.getState();
    expect(store.app).toEqual(DEFAULT_APP_SETTINGS);
    expect(store.resolvedPageSettings('/doc')).toEqual(DEFAULT_PAGE_SETTINGS);
    expect(store.resolvedPageSettings('/doc').theme.preset).toBe('compact');
    expect(store.resolvedContinuousSettings('/doc')).toEqual({ zoom: 1 });
  });

  it('loads global settings plus per-document overrides from bootstrap tabs', () => {
    useSettingsStore.getState().initialize(
      { page: { setup: { size: 'Letter' } }, continuous: { zoom: 1.4 } },
      [
        {
          packagePath: '/doc-a',
          scrollTop: 0,
          selectedBlockId: null,
          pageSettingsOverride: { setup: { orientation: 'portrait' }, theme: { preset: 'comfortable' } },
          continuousSettingsOverride: { zoom: 2 },
        },
        {
          packagePath: '/doc-b',
          scrollTop: 0,
          selectedBlockId: null,
        },
      ],
    );
    const store = useSettingsStore.getState();
    expect(store.app.page.setup.size).toBe('Letter');
    expect(store.app.page.setup.orientation).toBe('landscape');

    const a = store.resolvedPageSettings('/doc-a');
    expect(a.setup.size).toBe('Letter');
    expect(a.setup.orientation).toBe('portrait');
    expect(a.theme.preset).toBe('comfortable');
    expect(store.resolvedContinuousSettings('/doc-a')).toEqual({ zoom: 2 });

    const b = store.resolvedPageSettings('/doc-b');
    expect(b.setup.size).toBe('Letter');
    expect(b.setup.orientation).toBe('landscape');
    expect(b.theme.preset).toBe('compact');
    expect(store.resolvedContinuousSettings('/doc-b')).toEqual({ zoom: 1.4 });
  });

  it('keeps an override partial so later global changes still propagate', () => {
    const store = useSettingsStore.getState();
    store.setPageSettingsOverride('/doc', { setup: { orientation: 'portrait' } });
    expect(useSettingsStore.getState().resolvedPageSettings('/doc').theme).toEqual(
      PAGE_THEME_PRESETS.compact,
    );

    useSettingsStore.getState().setAppSettings({
      page: { theme: { preset: 'comfortable' } },
      continuous: { zoom: 1 },
    });
    const resolved = useSettingsStore.getState().resolvedPageSettings('/doc');
    expect(resolved.setup.orientation).toBe('portrait');
    // The global preset change reaches a document that only overrode orientation.
    expect(resolved.theme.preset).toBe('comfortable');
    expect(resolved.theme.bodyPt).toBe(10.5);
  });

  it('normalizes, clears, and scopes overrides per document', () => {
    const store = useSettingsStore.getState();
    const override = store.setPageSettingsOverride('/doc', {
      setup: { orientation: 'portrait', margins: { top: 20, right: 'bad' } },
      theme: { bodyPt: 8.5 },
      manualBreakBeforeBlockIds: ['b1', 'b1'],
    });
    expect(override).toEqual({
      setup: { orientation: 'portrait', margins: { top: 20 } },
      theme: { bodyPt: 8.5 },
      manualBreakBeforeBlockIds: ['b1'],
    });
    expect(useSettingsStore.getState().resolvedPageSettings('/other').setup.orientation).toBe(
      'landscape',
    );

    useSettingsStore.getState().setPageSettingsOverride('/doc', null);
    expect(useSettingsStore.getState().pageOverrides['/doc']).toBeUndefined();
    expect(useSettingsStore.getState().resolvedPageSettings('/doc')).toEqual(
      useSettingsStore.getState().app.page,
    );
  });

  it('clamps global settings and resolves continuous overrides independently', () => {
    useSettingsStore.getState().setAppSettings({
      page: {
        setup: { size: 'A5', orientation: 'portrait' },
        theme: { bodyPt: 100, bodyLine: 0 },
      },
      continuous: { zoom: 99 },
    });
    const app = useSettingsStore.getState().app;
    expect(app.page.setup.size).toBe('A5');
    expect(app.page.theme.bodyPt).toBe(24);
    expect(app.page.theme.bodyLine).toBe(1);
    expect(app.continuous.zoom).toBe(4);

    useSettingsStore.getState().setContinuousSettingsOverride('/doc', { zoom: 0 });
    expect(useSettingsStore.getState().resolvedContinuousSettings('/doc')).toEqual({
      zoom: 0.25,
    });
    useSettingsStore.getState().setContinuousSettingsOverride('/doc', { zoom: 'bad' });
    expect(useSettingsStore.getState().resolvedContinuousSettings('/doc')).toEqual({
      zoom: 4,
    });
  });
});

describe('Page density settings (M4d1)', () => {
  it('persists a global density and scopes a document override', () => {
    useSettingsStore.getState().setAppSettings({
      page: { theme: { density: 0.9 } },
      continuous: { zoom: 1 },
    });
    expect(useSettingsStore.getState().app.page.theme.density).toBe(0.9);
    expect(useSettingsStore.getState().resolvedPageSettings('/doc').theme.density).toBe(0.9);

    useSettingsStore.getState().setPageSettingsOverride('/doc', {
      theme: { density: 1.15 },
    });
    expect(useSettingsStore.getState().resolvedPageSettings('/doc').theme.density).toBe(1.15);
    expect(useSettingsStore.getState().resolvedPageSettings('/other').theme.density).toBe(0.9);

    useSettingsStore.getState().setPageSettingsOverride('/doc', null);
    expect(useSettingsStore.getState().resolvedPageSettings('/doc').theme.density).toBe(0.9);
  });

  it('normalizes a density override through the shared range', () => {
    const store = useSettingsStore.getState();
    expect(store.setPageSettingsOverride('/doc', { theme: { density: 0.1 } })).toEqual({
      theme: { density: 0.6 },
    });
    expect(store.setPageSettingsOverride('/doc', { theme: { density: 99 } })).toEqual({
      theme: { density: 1.2 },
    });
    expect(store.setPageSettingsOverride('/doc', { theme: { density: 'bad' } })).toBeUndefined();
    expect(useSettingsStore.getState().pageOverrides['/doc']).toBeUndefined();
  });

  it('keeps a global density change away from a document override', () => {
    useSettingsStore.getState().setPageSettingsOverride('/doc', {
      setup: { orientation: 'portrait' },
      theme: { density: 0.85 },
    });
    useSettingsStore.getState().setAppSettings({
      page: { theme: { density: 1.1 } },
      continuous: { zoom: 1 },
    });
    const resolved = useSettingsStore.getState().resolvedPageSettings('/doc');
    expect(resolved.theme.density).toBe(0.85);
    expect(resolved.setup.orientation).toBe('portrait');
    expect(useSettingsStore.getState().resolvedPageSettings('/other').theme.density).toBe(1.1);
  });

  it('builds and drops a density-only document override', () => {
    expect(pageDensityPercent(0.85)).toBe(85);
    expect(pageDensityPercent(0.6)).toBe(60);
    expect(pageDensityValue(85)).toBe(0.85);
    expect(pageDensityValue(60)).toBe(0.6);
    expect(pageDensityValue(999)).toBe(1.2);
    expect(pageDensityValue(1)).toBe(0.6);

    expect(withPageDensityOverride(undefined, 0.85)).toEqual({ theme: { density: 0.85 } });
    const base: PageSettingsOverride = {
      setup: { orientation: 'portrait' },
      theme: { preset: 'comfortable' },
    };
    expect(withPageDensityOverride(base, 1.2)).toEqual({
      setup: { orientation: 'portrait' },
      theme: { preset: 'comfortable', density: 1.2 },
    });
    expect(
      withoutPageDensityOverride({
        setup: { orientation: 'portrait' },
        theme: { preset: 'comfortable', density: 0.9 },
      }),
    ).toEqual({ setup: { orientation: 'portrait' }, theme: { preset: 'comfortable' } });
    expect(withoutPageDensityOverride({ theme: { density: 0.9 } })).toBeUndefined();
    expect(withoutPageDensityOverride({ theme: { preset: 'compact' } })).toEqual({
      theme: { preset: 'compact' },
    });
    expect(withoutPageDensityOverride(undefined)).toBeUndefined();
  });
});
