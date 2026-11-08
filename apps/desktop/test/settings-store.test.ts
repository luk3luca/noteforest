import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_PAGE_SETTINGS,
  PAGE_THEME_PRESETS,
} from '@noteforest/layout';
import {
  resetSettingsForTests,
  useSettingsStore,
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
