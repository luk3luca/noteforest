import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_RECENT_LIBRARIES,
  duplicateLibraryBasenames,
  librariesFilePath,
  readLibraryRoots,
  removeLibraryRecent,
  replaceLibraryRecent,
  upsertLibraryRecent,
  writeLibraryRoots,
  type LibraryRootEntry,
} from '../src/main/library-roots';

let root = '';
let support = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-roots-'));
  support = path.join(root, 'support');
  await fs.mkdir(support, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

function entry(name: string, openedAt: string): LibraryRootEntry {
  return { path: path.join(root, name), lastOpenedAt: openedAt };
}

describe('libraries.json', () => {
  it('reads a missing file as defaults and writes version 1 atomically', async () => {
    const empty = await readLibraryRoots(support);
    expect(empty).toMatchObject({ libraries: [], status: 'defaults', warnings: [] });

    await writeLibraryRoots(support, [entry('Study', '2026-11-13T08:00:00.000Z')]);
    const stored = JSON.parse(await fs.readFile(librariesFilePath(support), 'utf8')) as {
      version: number;
      libraries: LibraryRootEntry[];
    };
    expect(stored.version).toBe(1);
    expect(stored.libraries).toEqual([
      { path: path.join(root, 'Study'), lastOpenedAt: '2026-11-13T08:00:00.000Z' },
    ]);
  });

  it('orders by last opened and caps the list at eight', async () => {
    const entries = Array.from({ length: 10 }, (_, index) =>
      entry(`Library ${index}`, new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString()),
    );
    await writeLibraryRoots(support, entries);
    const read = await readLibraryRoots(support);
    expect(read.libraries).toHaveLength(MAX_RECENT_LIBRARIES);
    expect(read.libraries[0]?.path).toBe(path.join(root, 'Library 9'));
    expect(read.libraries.at(-1)?.path).toBe(path.join(root, 'Library 2'));
  });

  it('upserts, removes, and replaces by normalized path', () => {
    const first = entry('Study', '2026-11-13T08:00:00.000Z');
    const second = entry('Archive', '2026-11-13T09:00:00.000Z');
    let list = upsertLibraryRecent([first], second);
    expect(list.map((item) => item.path)).toEqual([second.path, first.path]);

    list = upsertLibraryRecent(list, { ...first, lastOpenedAt: '2026-11-13T10:00:00.000Z' });
    expect(list.map((item) => item.path)).toEqual([first.path, second.path]);

    list = removeLibraryRecent(list, second.path);
    expect(list.map((item) => item.path)).toEqual([first.path]);

    list = replaceLibraryRecent(
      [first],
      first.path,
      entry('Moved', '2026-11-13T11:00:00.000Z'),
    );
    expect(list.map((item) => item.path)).toEqual([path.join(root, 'Moved')]);
  });

  it('preserves a corrupt file, returns an empty list, and warns', async () => {
    const file = librariesFilePath(support);
    await fs.writeFile(file, '{ not json');
    const read = await readLibraryRoots(support);
    expect(read.libraries).toEqual([]);
    expect(read.status).toBe('corrupt');
    expect(read.warnings.join(' ')).toMatch(/corrupt/);
    expect(read.backupPath).toBeDefined();
    expect(await fs.readFile(read.backupPath ?? '', 'utf8')).toBe('{ not json');
  });

  it('warns about a newer manifest version but keeps readable entries', async () => {
    await fs.writeFile(
      librariesFilePath(support),
      JSON.stringify({
        version: 2,
        libraries: [entry('Study', '2026-11-13T08:00:00.000Z')],
      }),
    );
    const read = await readLibraryRoots(support);
    expect(read.status).toBe('newer');
    expect(read.libraries).toHaveLength(1);
    expect(read.warnings.join(' ')).toMatch(/newer/);
  });

  it('marks duplicate basenames so the UI can show the parent path', () => {
    const a = { path: '/Users/example/Study', lastOpenedAt: '2026-11-13T08:00:00.000Z' };
    const b = { path: '/Users/example/Archive/Study', lastOpenedAt: '2026-11-13T09:00:00.000Z' };
    const duplicates = duplicateLibraryBasenames([a, b, entry('Unique', '2026-11-13T10:00:00.000Z')]);
    expect([...duplicates]).toEqual(['Study']);
  });
});
