import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '@noteforest/layout';
import { readSettings, writeSettings } from '../src/main/library';

let root = '';
let support = '';
let previousSupport: string | undefined;

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
    expect(await readSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('writes normalized settings atomically and reads them back', async () => {
    await writeSettings({
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
    const stored = JSON.parse(
      await fs.readFile(path.join(support, 'settings.json'), 'utf8'),
    ) as Record<string, unknown>;
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
      continuous: { zoom: 1.25 },
    });

    expect(await readSettings()).toEqual(stored);
  });

  it('fills partial settings from defaults and clamps unsafe values', async () => {
    await writeSettings({ page: { theme: { bodyPt: 99 } } });
    const settings = await readSettings();
    expect(settings.page.theme.preset).toBe('compact');
    expect(settings.page.theme.bodyPt).toBe(24);
    expect(settings.page.setup).toEqual(DEFAULT_APP_SETTINGS.page.setup);
    expect(settings.continuous.zoom).toBe(1);
  });

  it('falls back to defaults for corrupt JSON instead of failing to start', async () => {
    await fs.mkdir(support, { recursive: true });
    await fs.writeFile(path.join(support, 'settings.json'), '{not json', 'utf8');
    expect(await readSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });
});
