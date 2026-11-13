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
  resetDocumentSettings?: () => Promise<
    | { ok: true; entries: unknown[]; backupPath?: string; backup: unknown }
    | { ok: false; message: string }
  >;
  restoreDocumentSettingsBackup?: () => Promise<
    | { ok: true; entries: unknown[]; backupPath?: string; backup: unknown }
    | { ok: false; message: string }
  >;
}): void {
  (globalThis as { window?: unknown }).window = {
    noteforest: {
      saveSettings: overrides.saveSettings ?? (async () => ({ ok: true })),
      saveDocumentSettings: overrides.saveDocumentSettings ?? (async () => ({ ok: true })),
      ...(overrides.resetSettings === undefined
        ? {}
        : { resetSettings: overrides.resetSettings }),
      ...(overrides.resetDocumentSettings === undefined
        ? {}
        : { resetDocumentSettings: overrides.resetDocumentSettings }),
      ...(overrides.restoreDocumentSettingsBackup === undefined
        ? {}
        : { restoreDocumentSettingsBackup: overrides.restoreDocumentSettingsBackup }),
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
  it('starts on the compact defaults with the global Continuous defaults', () => {
    const store = useSettingsStore.getState();
    expect(store.app).toEqual(DEFAULT_APP_SETTINGS);
    expect(store.app.continuous).toEqual(DEFAULT_APP_SETTINGS.continuous);
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

  it('patches chrome per field and resolves a document chrome override', () => {
    const store = useSettingsStore.getState();
    store.updateAppSettings({ page: { chrome: { header: 'chapter' } } });
    expect(useSettingsStore.getState().app.page.chrome).toEqual({
      header: 'chapter',
      footer: 'chapter',
      pageNumber: true,
    });
    store.setPageSettingsOverride('/doc', { chrome: { pageNumber: false } }, 'doc-id');
    expect(useSettingsStore.getState().resolvedPageSettings('/doc', 'doc-id').chrome).toEqual({
      header: 'chapter',
      footer: 'chapter',
      pageNumber: false,
    });
    // A later global footer change reaches the document, its own fields stay.
    useSettingsStore.getState().updateAppSettings({ page: { chrome: { footer: 'none' } } });
    expect(useSettingsStore.getState().resolvedPageSettings('/doc', 'doc-id').chrome).toEqual({
      header: 'chapter',
      footer: 'none',
      pageNumber: false,
    });
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

  it('clamps global settings and ignores a legacy continuous zoom', () => {
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
    expect(app.continuous).toEqual(DEFAULT_APP_SETTINGS.continuous);
  });

  it('merges a Continuous patch field by field and clamps it (R6)', () => {
    const store = useSettingsStore.getState();
    store.updateAppSettings({
      continuous: {
        spacing: { chapterGap: 40 },
        arrows: { width: 2.5, activeWidth: 1.25, size: 99 },
        widths: { childMax: 900 },
      },
    });
    const continuous = useSettingsStore.getState().app.continuous;
    expect(continuous.spacing).toEqual({
      chapterGap: 40,
      siblingGap: 24,
      childRowGap: 16,
    });
    // Active width can never be narrower than the resting width, and every
    // value is clamped to the documented ranges.
    expect(continuous.arrows).toEqual({
      width: 2.5,
      activeWidth: 2.5,
      mutedWidth: 1,
      size: 10,
    });
    expect(continuous.widths).toEqual({
      canvasMax: 3200,
      topLevelMax: 480,
      childMax: 560,
    });

    // A later patch keeps the other Continuous values.
    useSettingsStore.getState().updateAppSettings({
      continuous: { spacing: { siblingGap: 30 } },
    });
    expect(useSettingsStore.getState().app.continuous.spacing).toEqual({
      chapterGap: 40,
      siblingGap: 30,
      childRowGap: 16,
    });
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

  it('patches the global export folder and resets it to Documents (R4)', () => {
    const store = useSettingsStore.getState();
    expect(store.app.export).toEqual({ folder: null });
    store.updateAppSettings({ export: { folder: '/Users/luca/Exports' } });
    expect(useSettingsStore.getState().app.export).toEqual({
      folder: '/Users/luca/Exports',
    });
    // A page patch keeps the export default.
    useSettingsStore.getState().updateAppSettings({ page: { theme: { density: 0.9 } } });
    expect(useSettingsStore.getState().app.export).toEqual({
      folder: '/Users/luca/Exports',
    });
    // An explicit null resets to the OS Documents folder.
    useSettingsStore.getState().updateAppSettings({ export: { folder: null } });
    expect(useSettingsStore.getState().app.export).toEqual({ folder: null });
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

describe('settings recovery affordances (S3-2, S3-13)', () => {
  it('dismisses the global banner without clearing the read status', () => {
    useSettingsStore.setState({
      settingsStatus: { state: 'unreadable', message: 'EACCES: permission denied' },
    });
    useSettingsStore.getState().dismissSettingsWarning('global');
    expect(useSettingsStore.getState().dismissedWarnings).toEqual({
      global: true,
      document: false,
    });
    // The real status stays for Data & About and for the refused-write path.
    expect(useSettingsStore.getState().settingsStatus).toEqual({
      state: 'unreadable',
      message: 'EACCES: permission denied',
    });
  });

  it('dismisses the document banner without clearing the map status', () => {
    useSettingsStore.setState({
      documentSettingsStatus: { state: 'corrupt', message: 'bad json' },
    });
    useSettingsStore.getState().dismissSettingsWarning('document');
    expect(useSettingsStore.getState().dismissedWarnings.document).toBe(true);
    expect(useSettingsStore.getState().documentSettingsStatus).toEqual({
      state: 'corrupt',
      message: 'bad json',
    });
  });

  it('re-shows a successful reset status over a dismissed banner', async () => {
    installBridge({ resetSettings: async () => ({ ok: true }) });
    useSettingsStore.setState({
      settingsStatus: { state: 'corrupt', message: 'bad json' },
      dismissedWarnings: { global: true, document: false },
    });
    const result = await useSettingsStore.getState().resetSettingsToDefaults();
    expect(result).toEqual({ ok: true });
    expect(useSettingsStore.getState().settingsStatus).toEqual({ state: 'ok' });
    expect(useSettingsStore.getState().dismissedWarnings.global).toBe(false);
  });

  it('clears the document map and overrides after an explicit reset succeeds', async () => {
    installBridge({
      resetDocumentSettings: async () => ({ ok: true, entries: [], backup: null }),
    });
    useSettingsStore.setState({
      documentSettings: [
        { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.8 } } },
      ],
      pageOverrides: { '/doc': { theme: { density: 0.8 } } },
      documentSettingsStatus: { state: 'corrupt', message: 'bad json' },
      dismissedWarnings: { global: false, document: true },
    });

    const result = await useSettingsStore.getState().resetDocumentSettings();
    expect(result).toEqual({ ok: true });
    const store = useSettingsStore.getState();
    expect(store.documentSettings).toEqual([]);
    expect(store.pageOverrides).toEqual({});
    expect(store.documentSettingsStatus).toEqual({ state: 'ok' });
    expect(store.documentSettingsBackup).toBeNull();
    expect(store.dismissedWarnings.document).toBe(false);
    expect(store.saveState.status).toBe('saved');
    expect(store.resolvedPageSettings('/doc', 'doc-id')).toEqual(store.app.page);
  });

  it('keeps the map and the corrupt status when a reset fails', async () => {
    installBridge({
      resetDocumentSettings: async () => ({
        ok: false,
        message: 'Could not save document settings: EACCES',
      }),
    });
    const entry = {
      documentId: 'doc-id',
      packagePath: '/doc',
      page: { theme: { density: 0.8 } },
    };
    useSettingsStore.setState({
      documentSettings: [entry],
      pageOverrides: { '/doc': { theme: { density: 0.8 } } },
      documentSettingsStatus: { state: 'corrupt', message: 'bad json' },
    });

    const result = await useSettingsStore.getState().resetDocumentSettings();
    expect(result.ok).toBe(false);
    const store = useSettingsStore.getState();
    expect(store.documentSettings).toEqual([entry]);
    expect(store.documentSettingsStatus.state).toBe('corrupt');
    expect(store.saveState).toEqual({
      status: 'error',
      message: 'Could not save document settings: EACCES',
    });
  });

  it('loads a restored backup into entries, page overrides, and the backup view', async () => {
    const backup = { path: '/support/document-settings.backup-2026.json', createdAt: '2026-11-11T10:00:00.000Z' };
    installBridge({
      restoreDocumentSettingsBackup: async () => ({
        ok: true,
        entries: [
          { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.85 } } },
        ],
        backupPath: '/support/document-settings.backup-2026b.json',
        backup,
      }),
    });
    useSettingsStore.setState({
      documentSettingsStatus: { state: 'corrupt', message: 'bad json' },
      dismissedWarnings: { global: false, document: true },
    });

    const result = await useSettingsStore.getState().restoreDocumentSettingsBackup();
    expect(result).toEqual({ ok: true });
    const store = useSettingsStore.getState();
    expect(store.documentSettings).toEqual([
      { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.85 } } },
    ]);
    expect(store.pageOverrides['/doc']).toEqual({ theme: { density: 0.85 } });
    expect(store.documentSettingsStatus).toEqual({ state: 'ok' });
    expect(store.documentSettingsBackup).toEqual(backup);
    expect(store.dismissedWarnings.document).toBe(false);
  });

  it('keeps the corrupt status and current entries when a restore fails', async () => {
    installBridge({
      restoreDocumentSettingsBackup: async () => ({
        ok: false,
        message: 'No valid document settings backup was found.',
      }),
    });
    useSettingsStore.setState({
      documentSettingsStatus: { state: 'corrupt', message: 'bad json' },
      documentSettings: [],
      pageOverrides: {},
    });
    const result = await useSettingsStore.getState().restoreDocumentSettingsBackup();
    expect(result.ok).toBe(false);
    const store = useSettingsStore.getState();
    expect(store.documentSettingsStatus.state).toBe('corrupt');
    expect(store.saveState).toEqual({
      status: 'error',
      message: 'No valid document settings backup was found.',
    });
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
