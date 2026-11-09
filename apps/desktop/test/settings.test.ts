import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@noteforest/layout';
import { readSettings, readSettingsFile, writeSettings } from '../src/main/library';

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
    expect(stored['settingsVersion']).toBe(2);
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
    expect(stored['settingsVersion']).toBe(2);
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
    expect(read.status).toEqual({ state: 'ok' });
    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(2);
    expect(stored['futureTop']).toEqual({ enabled: true });
    expect(stored['page']).toMatchObject({
      futurePage: 'keep',
      setup: { futureSetup: 7, margins: { futureMargin: 3 } },
      theme: { futureTheme: 'keep', preset: 'compact' },
    });
  });

  it('keeps a newer schema version and its unknown fields instead of downgrading', async () => {
    await writeRaw({
      settingsVersion: 3,
      futureTop: true,
      continuous: { future: true },
      page: { theme: { density: 0.95 }, futurePage: 1 },
    });
    const read = await readSettingsFile();
    expect(read.status).toEqual({ state: 'newer', version: 3 });
    await writeSettings(read.settings);
    const stored = await readRaw();
    expect(stored['settingsVersion']).toBe(3);
    expect(stored['futureTop']).toBe(true);
    // A newer schema's "continuous" is an unknown future key, not the removed
    // v1 block, so it survives the write.
    expect(stored['continuous']).toEqual({ future: true });
    expect(stored['page']).toMatchObject({
      theme: { density: 0.95 },
      futurePage: 1,
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
});
