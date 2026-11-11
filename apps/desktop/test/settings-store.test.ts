import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_SETTINGS,
  DEFAULT_PAGE_SETTINGS,
  PAGE_THEME_PRESETS,
  type AppSettings,
  type PageSettingsOverride,
} from '@noteforest/layout';
import {
  flushSettingsWrites,
  pageDensityPercent,
  pageDensityValue,
  pageOverrideFor,
  resetSettingsForTests,
  useSettingsStore,
  withPageDensityOverride,
  withoutPageDensityOverride,
} from '../src/renderer/src/state/settings';

/** Node tests have no window; install a minimal bridge for write tests. */
function installBridge(overrides: {
  saveSettings?: (settings: AppSettings) => Promise<{ ok: true } | { ok: false; message: string }>;
  saveDocumentSettings?: (
    input: unknown,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  resetSettings?: () => Promise<{ ok: true } | { ok: false; message: string }>;
}): void {
  (globalThis as { window?: unknown }).window = {
    noteforest: {
      saveSettings: overrides.saveSettings ?? (async () => ({ ok: true })),
      saveDocumentSettings: overrides.saveDocumentSettings ?? (async () => ({ ok: true })),
      ...(overrides.resetSettings === undefined
        ? {}
        : { resetSettings: overrides.resetSettings }),
    },
  };
}

function removeBridge(): void {
  delete (globalThis as { window?: unknown }).window;
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  await flushSettingsWrites();
  resetSettingsForTests();
});

afterEach(() => {
  removeBridge();
});

describe('renderer personal settings resolution', () => {
  it('starts on the compact defaults with no Continuous settings path', () => {
    const store = useSettingsStore.getState();
    expect(store.app).toEqual(DEFAULT_APP_SETTINGS);
    expect(store.app).not.toHaveProperty('continuous');
    expect(store.resolvedPageSettings('/doc')).toEqual(DEFAULT_PAGE_SETTINGS);
    expect(store.resolvedPageSettings('/doc').theme.preset).toBe('compact');
  });

  it('loads global settings plus durable per-document entries', () => {
    useSettingsStore.getState().initialize({
      settings: { page: { setup: { size: 'Letter' } } },
      documentSettings: [
        {
          documentId: 'doc-a',
          packagePath: '/doc-a',
          page: { setup: { orientation: 'portrait' }, theme: { preset: 'comfortable' } },
        },
        { documentId: null, packagePath: '/doc-b', page: { theme: { density: 0.9 } } },
      ],
    });
    const store = useSettingsStore.getState();
    expect(store.app.page.setup.size).toBe('Letter');
    expect(store.app.page.setup.orientation).toBe('landscape');

    const a = store.resolvedPageSettings('/doc-a', 'doc-a');
    expect(a.setup.size).toBe('Letter');
    expect(a.setup.orientation).toBe('portrait');
    expect(a.theme.preset).toBe('comfortable');

    const b = store.resolvedPageSettings('/doc-b', 'doc-b');
    expect(b.setup.size).toBe('Letter');
    expect(b.theme.preset).toBe('compact');
    expect(b.theme.density).toBe(0.9);
  });

  it('resolves by document id first and follows a renamed/moved path', () => {
    useSettingsStore.getState().initialize({
      settings: {},
      documentSettings: [
        {
          documentId: 'doc-id',
          packagePath: '/old/place',
          page: { setup: { size: 'A5' } },
        },
      ],
    });
    const store = useSettingsStore.getState();
    expect(store.resolvedPageSettings('/new/place', 'doc-id').setup.size).toBe('A5');
    // A different document at the old path must not inherit the override.
    expect(store.resolvedPageSettings('/old/place', 'other-id').setup.size).toBe('A4');
  });

  it('keeps an override partial so later global changes still propagate', () => {
    const store = useSettingsStore.getState();
    store.setPageSettingsOverride('/doc', { setup: { orientation: 'portrait' } }, 'doc-id');
    expect(useSettingsStore.getState().resolvedPageSettings('/doc', 'doc-id').theme).toEqual(
      PAGE_THEME_PRESETS.compact,
    );

    useSettingsStore.getState().updateAppSettings({
      page: { theme: { preset: 'comfortable' } },
    });
    const resolved = useSettingsStore.getState().resolvedPageSettings('/doc', 'doc-id');
    expect(resolved.setup.orientation).toBe('portrait');
    // The global preset change reaches a document that only overrode orientation.
    expect(resolved.theme.preset).toBe('comfortable');
    expect(resolved.theme.bodyPt).toBe(10.5);
  });

  it('normalizes, clears, and scopes overrides per document', () => {
    const store = useSettingsStore.getState();
    const override = store.setPageSettingsOverride(
      '/doc',
      {
        setup: { orientation: 'portrait', margins: { top: 20, right: 'bad' } },
        theme: { bodyPt: 8.5 },
        manualBreakBeforeBlockIds: ['b1', 'b1'],
      },
      'doc-id',
    );
    expect(override).toEqual({
      setup: { orientation: 'portrait', margins: { top: 20 } },
      theme: { bodyPt: 8.5 },
      manualBreakBeforeBlockIds: ['b1'],
    });
    expect(useSettingsStore.getState().resolvedPageSettings('/other').setup.orientation).toBe(
      'landscape',
    );

    useSettingsStore.getState().setPageSettingsOverride('/doc', null, 'doc-id');
    expect(pageOverrideFor(useSettingsStore.getState(), '/doc', 'doc-id')).toBeUndefined();
    expect(useSettingsStore.getState().resolvedPageSettings('/doc', 'doc-id')).toEqual(
      useSettingsStore.getState().app.page,
    );
  });

  it('clamps global settings and ignores a legacy continuous block', () => {
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
    expect(app).not.toHaveProperty('continuous');
  });

  it('adopts a path-only legacy entry when the document id becomes known', () => {
    useSettingsStore.getState().initialize({
      settings: {},
      documentSettings: [
        { documentId: null, packagePath: '/legacy/doc', page: { theme: { density: 0.85 } } },
      ],
    });
    expect(useSettingsStore.getState().resolvedPageSettings('/legacy/doc', 'doc-id').theme.density).toBe(
      0.85,
    );
    useSettingsStore.getState().adoptDocumentSettings('/legacy/doc', 'doc-id');
    const entry = useSettingsStore
      .getState()
      .documentSettings.find((candidate) => candidate.documentId === 'doc-id');
    expect(entry?.packagePath).toBe('/legacy/doc');
    expect(entry?.page).toEqual({ theme: { density: 0.85 } });
  });

  it('updates one global field without resetting the other globals (S2-5)', () => {
    useSettingsStore.getState().setAppSettings({
      page: {
        setup: { size: 'Letter', orientation: 'portrait' },
        theme: { preset: 'comfortable', density: 1.1 },
        manualBreakBeforeBlockIds: ['b1'],
      },
    });
    useSettingsStore.getState().updateAppSettings({ page: { theme: { density: 0.9 } } });
    const app = useSettingsStore.getState().app;
    expect(app.page.setup.size).toBe('Letter');
    expect(app.page.setup.orientation).toBe('portrait');
    expect(app.page.theme.preset).toBe('comfortable');
    expect(app.page.theme.bodyPt).toBe(10.5);
    expect(app.page.theme.density).toBe(0.9);
    expect(app.page.manualBreakBeforeBlockIds).toEqual(['b1']);
  });
});

describe('settings write coordinator (S2-5)', () => {
  it('does not report saved before the write resolves', async () => {
    let resolveWrite: ((value: { ok: true }) => void) | null = null;
    installBridge({
      saveSettings: () =>
        new Promise<{ ok: true }>((resolve) => {
          resolveWrite = resolve;
        }),
    });
    useSettingsStore.getState().setAppSettings({ page: { theme: { density: 0.9 } } });
    await tick();
    expect(useSettingsStore.getState().saveState.status).toBe('saving');
    resolveWrite?.({ ok: true });
    const result = await flushSettingsWrites();
    expect(result).toEqual({ ok: true });
    expect(useSettingsStore.getState().saveState.status).toBe('saved');
  });

  it('surfaces a failed write and keeps the in-memory value for retry', async () => {
    installBridge({
      saveSettings: async () => ({ ok: false, message: 'disk full' }),
    });
    useSettingsStore.getState().setAppSettings({ page: { theme: { density: 0.9 } } });
    const result = await flushSettingsWrites();
    expect(result).toEqual({ ok: false, message: 'disk full' });
    expect(useSettingsStore.getState().saveState).toEqual({
      status: 'error',
      message: 'disk full',
    });
    // The optimistic value is still visible; the UI must not claim it is saved.
    expect(useSettingsStore.getState().app.page.theme.density).toBe(0.9);
  });

  it('serializes rapid writes so an older payload cannot land last', async () => {
    const written: number[] = [];
    let releaseFirst: (() => void) | null = null;
    installBridge({
      saveSettings: (settings) => {
        written.push(settings.page.theme.density);
        if (written.length === 1) {
          return new Promise((resolve) => {
            releaseFirst = () => resolve({ ok: true });
          });
        }
        return Promise.resolve({ ok: true });
      },
    });

    useSettingsStore.getState().setAppSettings({ page: { theme: { density: 0.85 } } });
    useSettingsStore.getState().setAppSettings({ page: { theme: { density: 1.1 } } });
    const flushed = flushSettingsWrites();
    await tick();
    expect(written).toEqual([0.85]);
    releaseFirst?.();
    const result = await flushed;
    expect(result.ok).toBe(true);
    expect(written).toEqual([0.85, 1.1]);
    expect(useSettingsStore.getState().saveState.status).toBe('saved');
  });

  it('surfaces a failed per-document override write', async () => {
    installBridge({
      saveDocumentSettings: async () => ({ ok: false, message: 'read-only app support' }),
    });
    useSettingsStore.getState().setPageSettingsOverride(
      '/doc',
      { theme: { density: 0.8 } },
      'doc-id',
    );
    const result = await flushSettingsWrites();
    expect(result).toEqual({ ok: false, message: 'read-only app support' });
    expect(useSettingsStore.getState().saveState.status).toBe('error');
    // The override still applies for this session, so the UI stays usable.
    expect(useSettingsStore.getState().resolvedPageSettings('/doc', 'doc-id').theme.density).toBe(
      0.8,
    );
  });

  it('clears the corrupt warning only after an explicit reset succeeds (F3)', async () => {
    let resetCalls = 0;
    installBridge({
      resetSettings: async () => {
        resetCalls += 1;
        return { ok: true };
      },
    });
    useSettingsStore.setState({ settingsStatus: { state: 'corrupt', message: 'bad json' } });

    const result = await useSettingsStore.getState().resetSettingsToDefaults();
    expect(result).toEqual({ ok: true });
    expect(resetCalls).toBe(1);
    expect(useSettingsStore.getState().settingsStatus).toEqual({ state: 'ok' });
    expect(useSettingsStore.getState().saveState.status).toBe('saved');
    expect(useSettingsStore.getState().app).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('keeps the corrupt warning and the error visible when a reset fails (F3)', async () => {
    installBridge({
      resetSettings: async () => ({
        ok: false,
        message: 'settings.json is corrupt and was not overwritten',
      }),
    });
    useSettingsStore.setState({ settingsStatus: { state: 'corrupt', message: 'bad json' } });

    const result = await useSettingsStore.getState().resetSettingsToDefaults();
    expect(result.ok).toBe(false);
    expect(useSettingsStore.getState().settingsStatus.state).toBe('corrupt');
    expect(useSettingsStore.getState().saveState).toEqual({
      status: 'error',
      message: 'settings.json is corrupt and was not overwritten',
    });
  });

  it('never reports saved for an ordinary write refused over a corrupt file (F3)', async () => {
    installBridge({
      saveSettings: async () => ({
        ok: false,
        message: 'settings.json is corrupt and was not overwritten',
      }),
    });
    useSettingsStore.setState({ settingsStatus: { state: 'corrupt', message: 'bad json' } });

    useSettingsStore.getState().updateAppSettings({ page: { theme: { density: 0.8 } } });
    const result = await flushSettingsWrites();
    expect(result.ok).toBe(false);
    expect(useSettingsStore.getState().settingsStatus.state).toBe('corrupt');
    expect(useSettingsStore.getState().saveState.status).toBe('error');
  });
});

describe('Page density settings (M4d1)', () => {
  it('persists a global density and scopes a document override', () => {
    useSettingsStore.getState().setAppSettings({
      page: { theme: { density: 0.9 } },
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
    expect(pageOverrideFor(useSettingsStore.getState(), '/doc')).toBeUndefined();
  });

  it('keeps a global density change away from a document override', () => {
    useSettingsStore.getState().setPageSettingsOverride('/doc', {
      setup: { orientation: 'portrait' },
      theme: { density: 0.85 },
    });
    useSettingsStore.getState().setAppSettings({
      page: { theme: { density: 1.1 } },
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
