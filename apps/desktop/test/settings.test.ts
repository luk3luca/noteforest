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
    expect(stored['settingsVersion']).toBe(3);
    expect(stored['continuous']).toBeUndefined();
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
    expect(read.settings).not.toHaveProperty('continuous');
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
    expect(stored['settingsVersion']).toBe(3);
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
    });

    expect(await writeSettings(read.settings)).toEqual({ ok: true });
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(3);
    expect(stored['appearance']).toEqual({
      theme: 'dark',
      accent: 'blue',
      uiScale: 1,
      uiFont: 'system',
      codeFont: 'jetbrains',
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
      },
    });
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(3);
    expect(stored['appearance']).toEqual({
      futureAppearance: 'keep',
      theme: 'light',
      accent: 'teal',
      uiScale: 1.1,
      uiFont: 'serif',
      codeFont: 'system-mono',
    });
    const reread = await readSettings();
    expect(reread.appearance).toEqual({
      theme: 'light',
      accent: 'teal',
      uiScale: 1.1,
      uiFont: 'serif',
      codeFont: 'system-mono',
    });
  });

  it('normalizes an unknown appearance accent, theme, scale, or font to the defaults', async () => {
    await writeRaw({
      settingsVersion: 3,
      appearance: {
        theme: 'neon',
        accent: 'ultraviolet',
        uiScale: 1.4,
        uiFont: 'comic',
        codeFont: 'papyrus',
      },
    });
    const read = await readSettings();
    expect(read.appearance).toEqual({
      theme: 'dark',
      accent: 'blue',
      uiScale: 1,
      uiFont: 'system',
      codeFont: 'jetbrains',
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
    expect(read.settings).not.toHaveProperty('continuous');

    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(3);
    expect(stored['continuous']).toBeUndefined();
    expect(stored['page']).toMatchObject({
      setup: { size: 'Letter', orientation: 'portrait' },
      theme: { preset: 'comfortable', density: 0.9 },
      manualBreakBeforeBlockIds: ['b1'],
    });
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
    expect(stored['settingsVersion']).toBe(3);
    expect(stored['futureTop']).toEqual({ enabled: true });
    expect(stored['page']).toMatchObject({
      futurePage: 'keep',
      setup: { futureSetup: 7, margins: { futureMargin: 3 } },
      theme: { futureTheme: 'keep', preset: 'compact' },
    });
  });

  it('keeps a newer schema version and its unknown fields instead of downgrading', async () => {
    await writeRaw({
      settingsVersion: 4,
      futureTop: true,
      continuous: { future: true },
      page: { theme: { density: 0.95 }, futurePage: 1 },
      appearance: { theme: 'light', futureAppearance: 'keep' },
    });
    const read = await readSettingsFile();
    expect(read.status).toEqual({ state: 'newer', version: 4 });
    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(4);
    expect(stored['futureTop']).toBe(true);
    // A newer schema's "continuous" is an unknown future key, not the removed
    // v1 block, so it survives the write.
    expect(stored['continuous']).toEqual({ future: true });
    expect(stored['page']).toMatchObject({
      theme: { density: 0.95 },
      futurePage: 1,
    });
    expect(stored['appearance']).toMatchObject({
      theme: 'light',
      futureAppearance: 'keep',
      accent: 'blue',
    });
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
    expect(refused.ok === false ? refused.message : '').toMatch(/corrupt/i);
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
    expect(stored['settingsVersion']).toBe(3);
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
    expect(reset.message).toMatch(/Could not reset settings/);
    expect((await fs.stat(settingsFile())).isDirectory()).toBe(true);
    expect((await readSettingsFile()).status.state).toBe('unreadable');
  });
});
