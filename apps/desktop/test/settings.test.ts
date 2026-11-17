import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@noteforest/layout';
import {
  readSettings,
  readSettingsFile,
  resetSettings,
  writeSettings,
} from '../src/main/library';

let root = '';
let support = '';
let previousSupport: string | undefined;

function settingsFile(): string {
  return path.join(support, 'settings.json');
}

async function writeRaw(value: unknown): Promise<void> {
  await fs.mkdir(support, { recursive: true });
  await fs.writeFile(settingsFile(), JSON.stringify(value), 'utf8');
}

async function readRaw(): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(settingsFile(), 'utf8')) as Record<string, unknown>;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-settings-'));
  support = path.join(root, 'support');
  previousSupport = process.env['NOTEFOREST_APP_SUPPORT'];
  process.env['NOTEFOREST_APP_SUPPORT'] = support;
});

afterEach(async () => {
  if (previousSupport === undefined) delete process.env['NOTEFOREST_APP_SUPPORT'];
  else process.env['NOTEFOREST_APP_SUPPORT'] = previousSupport;
  previousSupport = undefined;
  await fs.rm(root, { recursive: true, force: true });
});

describe('global settings persistence', () => {
  it('falls back to the product defaults when settings.json is missing', async () => {
    const result = await readSettingsFile();
    expect(result.settings).toEqual(DEFAULT_APP_SETTINGS);
    expect(result.status).toEqual({ state: 'defaults' });
    expect(await readSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('writes normalized settings atomically with a schema version', async () => {
    const result = await writeSettings({
      page: {
        setup: {
          size: 'A5',
          orientation: 'portrait',
          margins: { top: 18, right: 10, bottom: 10, left: 10 },
        },
        theme: { preset: 'comfortable', bodyPt: 11 },
        manualBreakBeforeBlockIds: ['b2', 'b2', 3],
      },
      continuous: { zoom: 1.25 },
    });
    expect(result).toEqual({ ok: true });
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['continuous']).toEqual(DEFAULT_APP_SETTINGS.continuous);
    expect(stored).toMatchObject({
      page: {
        setup: {
          size: 'A5',
          orientation: 'portrait',
          margins: { top: 18, right: 10, bottom: 10, left: 10 },
        },
        theme: { preset: 'comfortable', bodyPt: 11 },
        manualBreakBeforeBlockIds: ['b2'],
      },
    });

    const read = await readSettingsFile();
    expect(read.status).toEqual({ state: 'ok' });
    expect(read.settings.page.theme.preset).toBe('comfortable');
    expect(read.settings.continuous).toEqual(DEFAULT_APP_SETTINGS.continuous);
    expect(read.settings.continuous).not.toHaveProperty('zoom');
  });

  it('fills partial settings from defaults and clamps unsafe values', async () => {
    await writeSettings({ page: { theme: { bodyPt: 99 } } });
    const settings = await readSettings();
    expect(settings.page.theme.preset).toBe('compact');
    expect(settings.page.theme.bodyPt).toBe(24);
    expect(settings.page.setup).toEqual(DEFAULT_APP_SETTINGS.page.setup);
  });

  it('writes the R2 chrome settings and loads an old file without them as defaults', async () => {
    // Pre-R2 files have no `page.chrome`; they must load the approved defaults.
    await writeRaw({
      settingsVersion: 2,
      page: {
        setup: { size: 'A4', orientation: 'landscape' },
        theme: { preset: 'compact' },
      },
    });
    const old = await readSettings();
    expect(old.page.chrome).toEqual({
      header: 'document',
      footer: 'chapter',
      pageNumber: true,
    });

    const written = await writeSettings({
      page: {
        chrome: { header: 'chapter', footer: 'none', pageNumber: false },
      },
    });
    expect(written).toEqual({ ok: true });
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['page']).toMatchObject({
      chrome: { header: 'chapter', footer: 'none', pageNumber: false },
    });
    const reread = await readSettings();
    expect(reread.page.chrome).toEqual({
      header: 'chapter',
      footer: 'none',
      pageNumber: false,
    });
  });

  it('migrates a v2 file to schema v3 with the default appearance and keeps its page values (R3)', async () => {
    await writeRaw({
      settingsVersion: 2,
      page: {
        setup: { size: 'A4', orientation: 'landscape' },
        theme: { preset: 'compact', density: 0.9 },
      },
    });
    const read = await readSettingsFile();
    // A v2 file is migrated in memory: pure, no write, no data change.
    expect(read.status).toEqual({ state: 'ok', migrated: true });
    expect(read.settings.page.theme.density).toBe(0.9);
    expect(read.settings.appearance).toEqual({
      theme: 'dark',
      accent: 'blue',
      uiScale: 1,
      uiFont: 'system',
      codeFont: 'jetbrains',
      codeTheme: 'auto',
    });

    expect(await writeSettings(read.settings)).toEqual({ ok: true });
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['appearance']).toEqual({
      theme: 'dark',
      accent: 'blue',
      uiScale: 1,
      uiFont: 'system',
      codeFont: 'jetbrains',
      codeTheme: 'auto',
    });
    expect(stored['page']).toMatchObject({
      setup: { size: 'A4', orientation: 'landscape' },
      theme: { preset: 'compact', density: 0.9 },
    });
  });

  it('writes the appearance namespace and preserves unknown appearance keys (R3)', async () => {
    await writeRaw({
      settingsVersion: 2,
      appearance: { futureAppearance: 'keep' },
    });
    const read = await readSettingsFile();
    await writeSettings({
      ...read.settings,
      appearance: {
        ...read.settings.appearance,
        theme: 'light',
        accent: 'teal',
        uiScale: 1.1,
        uiFont: 'serif',
        codeFont: 'system-mono',
        codeTheme: 'one-light',
      },
    });
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['appearance']).toEqual({
      futureAppearance: 'keep',
      theme: 'light',
      accent: 'teal',
      uiScale: 1.1,
      uiFont: 'serif',
      codeFont: 'system-mono',
      codeTheme: 'one-light',
    });
    const reread = await readSettings();
    expect(reread.appearance).toEqual({
      theme: 'light',
      accent: 'teal',
      uiScale: 1.1,
      uiFont: 'serif',
      codeFont: 'system-mono',
      codeTheme: 'one-light',
    });
  });

  it('normalizes an unknown appearance accent, theme, scale, font, or code theme to the defaults', async () => {
    await writeRaw({
      settingsVersion: 3,
      appearance: {
        theme: 'neon',
        accent: 'ultraviolet',
        uiScale: 1.4,
        uiFont: 'comic',
        codeFont: 'papyrus',
        codeTheme: 'solarized',
      },
    });
    const read = await readSettings();
    expect(read.appearance).toEqual({
      theme: 'dark',
      accent: 'blue',
      uiScale: 1,
      uiFont: 'system',
      codeFont: 'jetbrains',
      codeTheme: 'auto',
    });
  });

  it('B2: a file without codeTheme loads as auto without a schema bump', async () => {
    await writeRaw({
      settingsVersion: 5,
      appearance: {
        theme: 'light',
        accent: 'teal',
        uiScale: 1,
        uiFont: 'system',
        codeFont: 'jetbrains',
      },
    });
    const read = await readSettingsFile();
    expect(read.status).toEqual({ state: 'ok' });
    expect(read.raw['settingsVersion']).toBe(5);
    expect(read.settings.appearance.codeTheme).toBe('auto');

    expect(await writeSettings(read.settings)).toEqual({ ok: true });
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect((stored['appearance'] as Record<string, unknown>)['codeTheme']).toBe('auto');
  });

  it('migrates a v3 file to schema v5 with the R4/R6 namespaces and preserves page/appearance', async () => {
    await writeRaw({
      settingsVersion: 3,
      page: {
        setup: { size: 'A5', orientation: 'portrait' },
        theme: { preset: 'compact', density: 0.85 },
        chrome: { header: 'chapter', footer: 'none', pageNumber: false },
      },
      appearance: {
        theme: 'light',
        accent: 'teal',
        uiScale: 1.1,
        uiFont: 'serif',
        codeFont: 'system-mono',
      },
    });
    const read = await readSettingsFile();
    // The v3 -> v5 migration is pure: the read normalizes both new namespaces
    // in memory and never writes the file.
    expect(read.status).toEqual({ state: 'ok', migrated: true });
    expect(read.settings.export).toEqual({ folder: null });
    expect(read.settings.continuous).toEqual(DEFAULT_APP_SETTINGS.continuous);
    expect(read.settings.page.theme.density).toBe(0.85);
    expect(read.settings.page.chrome).toEqual({
      header: 'chapter',
      footer: 'none',
      pageNumber: false,
    });
    expect(read.settings.appearance.theme).toBe('light');

    expect(await writeSettings(read.settings)).toEqual({ ok: true });
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['continuous']).toEqual(DEFAULT_APP_SETTINGS.continuous);
    expect(stored['export']).toEqual({ folder: null });
    expect(stored['page']).toMatchObject({
      setup: { size: 'A5', orientation: 'portrait' },
      theme: { preset: 'compact', density: 0.85 },
      chrome: { header: 'chapter', footer: 'none', pageNumber: false },
    });
    expect(stored['appearance']).toMatchObject({ theme: 'light', accent: 'teal' });
  });

  it('round-trips a v4 export folder, migrates to v5 continuous defaults, and preserves unknown keys (R4/R6)', async () => {
    await writeRaw({
      settingsVersion: 4,
      export: { folder: '/Users/luca/Exports', futureExport: 'keep' },
      futureTop: { enabled: true },
    });
    const read = await readSettingsFile();
    // v4 -> v5 is a pure in-memory migration: no write on read.
    expect(read.status).toEqual({ state: 'ok', migrated: true });
    expect(read.settings.export).toEqual({ folder: '/Users/luca/Exports' });
    expect(read.settings.continuous).toEqual(DEFAULT_APP_SETTINGS.continuous);

    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['continuous']).toEqual(DEFAULT_APP_SETTINGS.continuous);
    expect(stored['export']).toEqual({
      futureExport: 'keep',
      folder: '/Users/luca/Exports',
    });
    expect(stored['futureTop']).toEqual({ enabled: true });
    expect(await readSettings()).toMatchObject({
      export: { folder: '/Users/luca/Exports' },
    });
  });

  it('normalizes an unknown or empty export folder to the Documents default (R4)', async () => {
    for (const value of [
      { folder: 42 },
      { folder: '   ' },
      { folder: null },
      'not-an-object',
    ]) {
      await writeRaw({ settingsVersion: 4, export: value });
      const read = await readSettings();
      expect(read.export).toEqual({ folder: null });
    }
    await writeSettings({ export: { folder: '  /Users/luca/Exports  ' } });
    expect(await readSettings()).toMatchObject({
      export: { folder: '/Users/luca/Exports' },
    });
  });

  it('preserves an unknown future chrome key while writing the known chrome fields', async () => {
    await writeRaw({
      settingsVersion: 2,
      page: { chrome: { futureChrome: 'keep', header: 'none' } },
    });
    const read = await readSettingsFile();
    expect(read.settings.page.chrome.header).toBe('none');
    await writeSettings({
      ...read.settings,
      page: {
        ...read.settings.page,
        chrome: { ...read.settings.page.chrome, footer: 'document' },
      },
    });
    const stored = await readRaw();
    expect(stored['page']).toMatchObject({
      chrome: { futureChrome: 'keep', header: 'none', footer: 'document', pageNumber: true },
    });
  });

  it('migrates a versionless v1 file, drops the dead continuous block, and keeps page values', async () => {
    await writeRaw({
      page: {
        setup: { size: 'Letter', orientation: 'portrait' },
        theme: { preset: 'comfortable', density: 0.9 },
        manualBreakBeforeBlockIds: ['b1'],
      },
      continuous: { zoom: 4 },
    });
    const read = await readSettingsFile();
    expect(read.status).toEqual({ state: 'ok', migrated: true });
    expect(read.settings.page.setup.size).toBe('Letter');
    expect(read.settings.page.theme.density).toBe(0.9);
    expect(read.settings.continuous).toEqual(DEFAULT_APP_SETTINGS.continuous);
    expect(read.settings.continuous).not.toHaveProperty('zoom');

    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['continuous']).toEqual(DEFAULT_APP_SETTINGS.continuous);
    expect(stored['page']).toMatchObject({
      setup: { size: 'Letter', orientation: 'portrait' },
      theme: { preset: 'comfortable', density: 0.9 },
      manualBreakBeforeBlockIds: ['b1'],
    });
  });

  it('round-trips a v5 continuous namespace and preserves unknown nested keys (R6)', async () => {
    await writeRaw({
      settingsVersion: 5,
      continuous: {
        spacing: { chapterGap: 40, siblingGap: 30, childRowGap: 20, futureSpacing: 'keep' },
        arrows: { width: 2, activeWidth: 1.5, mutedWidth: 1.5, size: 9 },
        widths: { canvasMax: 3600, topLevelMax: 600, childMax: 500 },
        futureContinuous: { keep: true },
      },
    });
    const read = await readSettingsFile();
    expect(read.status).toEqual({ state: 'ok' });
    // Active width is raised to at least the resting width.
    expect(read.settings.continuous).toEqual({
      spacing: { chapterGap: 40, siblingGap: 30, childRowGap: 20 },
      arrows: { width: 2, activeWidth: 2, mutedWidth: 1.5, size: 9 },
      widths: { canvasMax: 3600, topLevelMax: 600, childMax: 500 },
    });

    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['continuous']).toMatchObject({
      futureContinuous: { keep: true },
      spacing: { chapterGap: 40, siblingGap: 30, childRowGap: 20, futureSpacing: 'keep' },
      arrows: { width: 2, activeWidth: 2, mutedWidth: 1.5, size: 9 },
      widths: { canvasMax: 3600, topLevelMax: 600, childMax: 500 },
    });
  });

  it('migrates a v1 legacy continuous zoom into the R6 defaults after the removal step', async () => {
    await writeRaw({
      settingsVersion: 1,
      continuous: { zoom: 2 },
      futureTop: true,
    });
    const read = await readSettingsFile();
    expect(read.status).toEqual({ state: 'ok', migrated: true });
    expect(read.settings.continuous).toEqual(DEFAULT_APP_SETTINGS.continuous);
    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['continuous']).toEqual(DEFAULT_APP_SETTINGS.continuous);
    expect(stored['futureTop']).toBe(true);
  });


  it('preserves unknown top-level and nested fields across a write', async () => {
    await writeRaw({
      settingsVersion: 2,
      futureTop: { enabled: true },
      page: {
        futurePage: 'keep',
        setup: { futureSetup: 7, margins: { top: 14, futureMargin: 3 } },
        theme: { preset: 'compact', futureTheme: 'keep' },
      },
    });
    const read = await readSettingsFile();
    // A v2 file is migrated to v3 in memory (defaults for the new namespace).
    expect(read.status).toEqual({ state: 'ok', migrated: true });
    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['futureTop']).toEqual({ enabled: true });
    expect(stored['page']).toMatchObject({
      futurePage: 'keep',
      setup: { futureSetup: 7, margins: { futureMargin: 3 } },
      theme: { futureTheme: 'keep', preset: 'compact' },
    });
  });

  it('keeps a newer schema version and its unknown fields instead of downgrading', async () => {
    await writeRaw({
      settingsVersion: 6,
      futureTop: true,
      continuous: {
        future: true,
        spacing: { futureSpacing: 3 },
        widths: { futureWidth: 7 },
      },
      page: { theme: { density: 0.95 }, futurePage: 1 },
      appearance: { theme: 'light', futureAppearance: 'keep' },
      export: { futureExport: 'keep' },
    });
    const read = await readSettingsFile();
    expect(read.status).toEqual({ state: 'newer', version: 6 });
    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(6);
    expect(stored['futureTop']).toBe(true);
    // A newer schema's Continuous namespace keeps every unknown key while the
    // known R6 fields are normalized into it.
    expect(stored['continuous']).toMatchObject({
      future: true,
      spacing: { futureSpacing: 3, chapterGap: 28, siblingGap: 24, childRowGap: 16 },
      arrows: { width: 1.25, activeWidth: 1.75, mutedWidth: 1, size: 6 },
      widths: { futureWidth: 7, canvasMax: 3200, topLevelMax: 480, childMax: 420 },
    });
    expect(stored['page']).toMatchObject({
      theme: { density: 0.95 },
      futurePage: 1,
    });
    expect(stored['appearance']).toMatchObject({
      theme: 'light',
      futureAppearance: 'keep',
      accent: 'blue',
    });
    expect(stored['export']).toMatchObject({ futureExport: 'keep', folder: null });
  });

  it('preserves a corrupt file, warns, and never silently overwrites it on read', async () => {
    await fs.mkdir(support, { recursive: true });
    await fs.writeFile(settingsFile(), '{not json', 'utf8');
    const result = await readSettingsFile();
    expect(result.settings).toEqual(DEFAULT_APP_SETTINGS);
    expect(result.status.state).toBe('corrupt');
    expect(result.status.backupPath).toBeTruthy();
    expect(await fs.readFile(result.status.backupPath!, 'utf8')).toBe('{not json');
    // Read must not replace the damaged file; the user still has the evidence.
    expect(await fs.readFile(settingsFile(), 'utf8')).toBe('{not json');
  });

  it('reports a failed write and leaves the previous file intact', async () => {
    await fs.mkdir(support, { recursive: true });
    // A directory in place of the file makes the atomic rename fail.
    await fs.mkdir(settingsFile());
    const result = await writeSettings({ page: { theme: { density: 0.9 } } });
    expect(result.ok).toBe(false);
    expect(await fs.stat(settingsFile()).then((stat) => stat.isDirectory())).toBe(true);
  });

  it('serializes rapid writes so the last queued value wins', async () => {
    const [first, second] = await Promise.all([
      writeSettings({ page: { theme: { density: 0.85 } } }),
      writeSettings({ page: { theme: { density: 1.1 } } }),
    ]);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    const stored = await readRaw();
    expect(stored['page']).toMatchObject({ theme: { density: 1.1 } });
  });

  it('refuses an implicit write over a corrupt settings.json and keeps the bytes and backup (F3)', async () => {
    await fs.mkdir(support, { recursive: true });
    await fs.writeFile(settingsFile(), '{not json', 'utf8');
    // The read creates the one backup; the refused write must not touch it.
    const read = await readSettingsFile();
    expect(read.status.state).toBe('corrupt');
    const backupsBefore = (await fs.readdir(support)).filter((name) =>
      /^settings\.corrupt-.*\.json$/.test(name),
    );
    expect(backupsBefore).toHaveLength(1);

    const refused = await writeSettings({ page: { theme: { density: 0.95 } } });
    expect(refused.ok).toBe(false);
    expect(refused.ok === false ? refused.message : '').toBe('Settings couldn’t be read. Reset them to the defaults.');
    expect(await fs.readFile(settingsFile(), 'utf8')).toBe('{not json');
    const backupsAfter = (await fs.readdir(support)).filter((name) =>
      /^settings\.corrupt-.*\.json$/.test(name),
    );
    expect(backupsAfter).toEqual(backupsBefore);
    expect(await fs.readFile(path.join(support, backupsBefore[0]!), 'utf8')).toBe('{not json');
  });

  it('re-checks the file at write time so a corruption after bootstrap is refused (F3)', async () => {
    expect(await writeSettings({ page: { theme: { density: 0.9 } } })).toEqual({ ok: true });
    await fs.writeFile(settingsFile(), '{half', 'utf8');
    const refused = await writeSettings({ page: { theme: { density: 1.1 } } });
    expect(refused.ok).toBe(false);
    expect(await fs.readFile(settingsFile(), 'utf8')).toBe('{half');
  });

  it('replaces a corrupt file only through the explicit reset and keeps the backup (F3)', async () => {
    await fs.mkdir(support, { recursive: true });
    await fs.writeFile(settingsFile(), '{not json', 'utf8');
    const read = await readSettingsFile();
    expect(read.status.state).toBe('corrupt');

    const reset = await resetSettings();
    expect(reset).toEqual({ ok: true });
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(5);
    expect(stored['page']).toEqual(
      JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS.page)) as unknown,
    );
    // The damaged evidence survives the reset.
    const backups = (await fs.readdir(support)).filter((name) =>
      /^settings\.corrupt-.*\.json$/.test(name),
    );
    expect(backups.length).toBeGreaterThanOrEqual(1);
    expect(await fs.readFile(path.join(support, backups[0]!), 'utf8')).toBe('{not json');

    // The file is valid again, so an ordinary change saves.
    expect(await readSettingsFile().then((result) => result.status)).toEqual({ state: 'ok' });
    expect(await writeSettings({ page: { theme: { density: 1.05 } } })).toEqual({ ok: true });
    expect((await readRaw())['page']).toMatchObject({ theme: { density: 1.05 } });
  });

  it('reports an unreadable file and resets it only on the explicit action (S3-2)', async () => {
    await writeRaw({ page: { theme: { density: 0.8 } } });
    const file = settingsFile();
    await fs.chmod(file, 0o000);
    try {
      const read = await readSettingsFile();
      expect(read.status.state).toBe('unreadable');
      expect(read.status.message).toBeTruthy();
      // The ordinary write is refused while the file cannot be read.
      const refused = await writeSettings({ page: { theme: { density: 0.9 } } });
      expect(refused.ok).toBe(false);
    } finally {
      await fs.chmod(file, 0o600);
    }

    const reset = await resetSettings();
    expect(reset).toEqual({ ok: true });
    expect(await readSettingsFile().then((result) => result.status)).toEqual({ state: 'ok' });
    expect((await readRaw())['page']).toMatchObject({ theme: { density: 1 } });
  });

  it('keeps the warning and file intact when the explicit reset fails (S3-2)', async () => {
    await fs.mkdir(support, { recursive: true });
    // A directory at the settings path is unreadable and cannot be replaced by
    // an atomic rename, so the reset reports failure instead of success.
    await fs.mkdir(settingsFile());
    expect((await readSettingsFile()).status.state).toBe('unreadable');
    const reset = await resetSettings();
    expect(reset.ok).toBe(false);
    if (reset.ok) return;
    expect(reset.message).toBe('Settings weren’t reset.');
    expect((await fs.stat(settingsFile())).isDirectory()).toBe(true);
    expect((await readSettingsFile()).status.state).toBe('unreadable');
  });
});
