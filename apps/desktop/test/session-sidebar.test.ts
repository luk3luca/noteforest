import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSession, writeSession } from '../src/main/library';
import { buildSession } from '../src/renderer/src/state/session';
import { useShell } from '../src/renderer/src/state/shell';

let root = '';
let support = '';
let previousSupport: string | undefined;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-session-tab-'));
  support = path.join(root, 'support');
  await fs.mkdir(support, { recursive: true });
  previousSupport = process.env['NOTEFOREST_APP_SUPPORT'];
  process.env['NOTEFOREST_APP_SUPPORT'] = support;
});

afterEach(async () => {
  if (previousSupport === undefined) delete process.env['NOTEFOREST_APP_SUPPORT'];
  else process.env['NOTEFOREST_APP_SUPPORT'] = previousSupport;
  useShell.setState({ tabs: [], activeTab: null, sidebarTab: 'library' });
  await fs.rm(root, { recursive: true, force: true });
});

function sessionFile(): string {
  return path.join(support, 'shell-session.json');
}

describe('sidebar tab session state', () => {
  it('defaults a legacy session without sidebarTab to Library', async () => {
    await fs.writeFile(
      sessionFile(),
      JSON.stringify({
        tabs: [],
        activeTab: null,
        sidebarCollapsed: false,
        sidebarWidth: 264,
        collapsedTopics: {},
      }),
    );
    expect((await readSession()).sidebarTab).toBe('library');
  });

  it('restores a persisted Outline tab and normalizes unknown values', async () => {
    await writeSession({
      tabs: [],
      activeTab: null,
      sidebarCollapsed: false,
      sidebarWidth: 264,
      collapsedTopics: {},
      sidebarTab: 'outline',
    });
    expect((await readSession()).sidebarTab).toBe('outline');

    await fs.writeFile(
      sessionFile(),
      JSON.stringify({
        tabs: [],
        activeTab: null,
        sidebarCollapsed: false,
        sidebarWidth: 264,
        collapsedTopics: {},
        sidebarTab: 'files',
      }),
    );
    expect((await readSession()).sidebarTab).toBe('library');
  });

  it('persists the Health section as a third sidebar tab', async () => {
    await writeSession({
      tabs: [],
      activeTab: null,
      sidebarCollapsed: false,
      sidebarWidth: 264,
      collapsedTopics: {},
      sidebarTab: 'health',
    });
    expect((await readSession()).sidebarTab).toBe('health');
    // The session reader is tolerant: a legacy value still opens Library.
    await fs.writeFile(
      sessionFile(),
      JSON.stringify({
        tabs: [],
        activeTab: null,
        sidebarCollapsed: false,
        sidebarWidth: 264,
        collapsedTopics: {},
      }),
    );
    expect((await readSession()).sidebarTab).toBe('library');
  });

  it('writes the shell tab into the session without touching document content', () => {
    useShell.setState({ sidebarTab: 'outline' });
    expect(buildSession().sidebarTab).toBe('outline');
    useShell.setState({ sidebarTab: 'health' });
    expect(buildSession().sidebarTab).toBe('health');
    useShell.setState({ sidebarTab: 'library' });
    expect(buildSession().sidebarTab).toBe('library');
  });

  it('accepts Health through the store and rejects unknown tabs', () => {
    useShell.getState().setSidebarTab('health');
    expect(useShell.getState().sidebarTab).toBe('health');
    useShell.getState().setSidebarTab('files' as never);
    expect(useShell.getState().sidebarTab).toBe('library');
  });
});
