import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  adoptDocumentSettingsEntry,
  documentSettingsRemoval,
  findDocumentSettingsEntry,
  migrateSessionOverrides,
  normalizeDocumentSettingsFile,
  serializeDocumentSettingsFile,
  upsertDocumentSettingsEntry,
} from '../src/shared/document-settings';
import {
  documentSettingsPath,
  findNewestValidDocumentSettingsBackup,
  flushDocumentSettingsWrites,
  listDocumentSettingsBackups,
  migrateLegacySessionOverrides,
  parseDocumentSettingsBackup,
  readDocumentSettingsFile,
  removeDocumentSettingsEntries,
  resetDocumentSettings,
  restoreDocumentSettingsBackup,
  saveDocumentSettings,
  writeDocumentSettingsFile,
} from '../src/main/document-settings';

let root = '';
let support = '';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-doc-settings-'));
  support = path.join(root, 'support');
  await fs.mkdir(support, { recursive: true });
});

afterEach(async () => {
  await flushDocumentSettingsWrites();
  await fs.rm(root, { recursive: true, force: true });
});

describe('document settings identity (S2-2)', () => {
  it('upserts by path, then upgrades to the canonical id and follows a move', () => {
    let entries = upsertDocumentSettingsEntry(
      [],
      { documentId: null, packagePath: '/old/doc' },
      { setup: { size: 'A5' } },
    );
    expect(entries).toEqual([
      {
        documentId: null,
        packagePath: '/old/doc',
        page: { setup: { size: 'A5' } },
      },
    ]);

    entries = adoptDocumentSettingsEntry(entries, {
      documentId: 'doc-id',
      packagePath: '/old/doc',
    });
    expect(entries).toEqual([
      {
        documentId: 'doc-id',
        packagePath: '/old/doc',
        page: { setup: { size: 'A5' } },
      },
    ]);

    entries = adoptDocumentSettingsEntry(entries, {
      documentId: 'doc-id',
      packagePath: '/new/doc',
    });
    expect(findDocumentSettingsEntry(entries, { documentId: 'doc-id', packagePath: '/new/doc' }))
      .toEqual({
        documentId: 'doc-id',
        packagePath: '/new/doc',
        page: { setup: { size: 'A5' } },
      });
    // Id wins over the old path: the same document still resolves its entry.
    expect(
      findDocumentSettingsEntry(entries, { documentId: 'doc-id', packagePath: '/old/doc' })
        ?.packagePath,
    ).toBe('/new/doc');
  });

  it('matches by id before path and never lets a different document inherit a path entry', () => {
    const entries = upsertDocumentSettingsEntry(
      [],
      { documentId: 'doc-a', packagePath: '/package' },
      { theme: { density: 0.85 } },
    );
    expect(
      findDocumentSettingsEntry(entries, { documentId: 'doc-a', packagePath: '/moved' }),
    ).toBeDefined();
    // A replaced package at the same path has a different id: no inheritance.
    expect(
      findDocumentSettingsEntry(entries, { documentId: 'doc-b', packagePath: '/package' }),
    ).toBeUndefined();
    // Path-only legacy entries still resolve by path when no id matches.
    const legacy = upsertDocumentSettingsEntry(
      [],
      { documentId: null, packagePath: '/legacy' },
      { theme: { density: 0.9 } },
    );
    expect(
      findDocumentSettingsEntry(legacy, { documentId: 'new-id', packagePath: '/legacy' }),
    ).toBeDefined();
  });

  it('clears an entry and collapses duplicates', () => {
    const entries = upsertDocumentSettingsEntry(
      [
        { documentId: null, packagePath: '/doc', page: { theme: { density: 0.8 } } },
        { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.9 } } },
      ],
      { documentId: 'doc-id', packagePath: '/doc' },
      { theme: { density: 1.1 } },
    );
    expect(entries).toEqual([
      { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 1.1 } } },
    ]);
    expect(
      upsertDocumentSettingsEntry(entries, { documentId: 'doc-id', packagePath: '/doc' }, null),
    ).toEqual([]);
  });

  it('adopting an unchanged identity returns the same array reference', () => {
    const entries = upsertDocumentSettingsEntry(
      [],
      { documentId: 'doc-id', packagePath: '/doc' },
      { theme: { density: 0.9 } },
    );
    expect(
      adoptDocumentSettingsEntry(entries, { documentId: 'doc-id', packagePath: '/doc' }),
    ).toBe(entries);
  });

  it('re-keys a draft-keyed entry to the package path on materialization', () => {
    const entries = upsertDocumentSettingsEntry(
      [],
      { documentId: 'doc-id', packagePath: 'draft:abc' },
      { chrome: { pageNumber: false } },
    );
    expect(
      adoptDocumentSettingsEntry(entries, {
        documentId: 'doc-id',
        packagePath: '/library/untitled',
      }),
    ).toEqual([
      {
        documentId: 'doc-id',
        packagePath: '/library/untitled',
        page: { chrome: { pageNumber: false } },
      },
    ]);
  });

  it('normalizes a stored file and drops invalid entries', () => {
    const read = normalizeDocumentSettingsFile({
      version: 1,
      entries: [
        { documentId: 'a', packagePath: '/a', page: { theme: { density: 0.8 } } },
        { documentId: 'a', packagePath: '/a', page: { theme: { density: 1.2 } } },
        { documentId: null, packagePath: '/b', page: null },
        { packagePath: 42, page: { theme: { density: 0.9 } } },
        'nope',
        {
          documentId: 'chrome',
          packagePath: '/chrome',
          page: { chrome: { pageNumber: false, header: 'bogus' } },
        },
      ],
    });
    expect(read.found).toBe(true);
    expect(read.entries).toEqual([
      { documentId: 'a', packagePath: '/a', page: { theme: { density: 1.2 } } },
      {
        documentId: 'chrome',
        packagePath: '/chrome',
        page: { chrome: { pageNumber: false } },
      },
    ]);
    expect(JSON.parse(serializeDocumentSettingsFile(read.entries))).toMatchObject({
      version: 1,
      entries: read.entries,
    });
  });

  it('migrates legacy session overrides once, without overwriting newer entries', () => {
    const entries = upsertDocumentSettingsEntry(
      [],
      { documentId: 'known', packagePath: '/known' },
      { theme: { density: 0.8 } },
    );
    const migrated = migrateSessionOverrides(
      entries,
      [
        { packagePath: '/known', pageSettingsOverride: { theme: { density: 1.2 } } },
        { packagePath: '/unknown', pageSettingsOverride: { setup: { size: 'A5' } } },
        { packagePath: '/broken', pageSettingsOverride: 'nope' },
      ],
      new Map([['/known', 'known']]),
    );
    expect(migrated.migrated).toBe(1);
    expect(migrated.entries).toEqual([
      { documentId: 'known', packagePath: '/known', page: { theme: { density: 0.8 } } },
      { documentId: null, packagePath: '/unknown', page: { setup: { size: 'A5' } } },
    ]);
  });
});

describe('document settings cleanup identity (F3)', () => {
  it('removes the exact path and keeps a same-id copy entry', () => {
    const original = {
      documentId: 'shared',
      packagePath: '/library/original',
      page: { chrome: { pageNumber: false } },
    };
    const copy = {
      documentId: 'shared',
      packagePath: '/library/copy',
      page: { chrome: { pageNumber: false } },
    };
    const plan = documentSettingsRemoval([original, copy], {
      documentId: 'shared',
      packagePath: '/library/original',
      sharedIdPaths: ['/library/copy'],
    });
    expect(plan.removed).toEqual([original]);
    expect(plan.entries).toEqual([copy]);
    expect(plan.keptAmbiguous).toEqual([copy]);
  });

  it('uses an unambiguous id to remove one stale moved-path entry', () => {
    const stale = {
      documentId: 'doc-id',
      packagePath: '/library/old-name',
      page: { setup: { size: 'A5' } },
    };
    const plan = documentSettingsRemoval([stale], {
      documentId: 'doc-id',
      packagePath: '/library/new-name',
    });
    expect(plan.removed).toEqual([stale]);
    expect(plan.entries).toEqual([]);
    expect(plan.keptAmbiguous).toEqual([]);
  });
});

describe('document settings file', () => {
  it('writes and reads entries with a version', async () => {
    expect(
      await writeDocumentSettingsFile(support, [
        { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.9 } } },
      ]),
    ).toEqual({ ok: true });
    const stored = JSON.parse(await fs.readFile(documentSettingsPath(support), 'utf8')) as {
      version: number;
    };
    expect(stored.version).toBe(1);
    const read = await readDocumentSettingsFile(support);
    expect(read.status).toEqual({ state: 'ok' });
    expect(read.entries).toEqual([
      { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.9 } } },
    ]);
  });

  it('preserves a corrupt file and refuses to overwrite it implicitly', async () => {
    await fs.writeFile(documentSettingsPath(support), '{broken', 'utf8');
    const read = await readDocumentSettingsFile(support);
    expect(read.status.state).toBe('corrupt');
    expect(read.status.backupPath).toBeTruthy();
    expect(await fs.readFile(read.status.backupPath!, 'utf8')).toBe('{broken');

    const saved = await saveDocumentSettings(support, {
      documentId: 'doc-id',
      packagePath: '/doc',
      page: { theme: { density: 0.8 } },
    });
    expect(saved.ok).toBe(false);
    expect(await fs.readFile(documentSettingsPath(support), 'utf8')).toBe('{broken');
  });

  it('serializes rapid upserts for different documents', async () => {
    const [first, second] = await Promise.all([
      saveDocumentSettings(support, {
        documentId: 'a',
        packagePath: '/a',
        page: { theme: { density: 0.8 } },
      }),
      saveDocumentSettings(support, {
        documentId: 'b',
        packagePath: '/b',
        page: { theme: { density: 1.1 } },
      }),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const read = await readDocumentSettingsFile(support);
    expect(read.entries).toHaveLength(2);
  });

  it('migrates legacy session overrides into a fresh file', async () => {
    const migrated = await migrateLegacySessionOverrides(
      support,
      [{ packagePath: '/doc', pageSettingsOverride: { theme: { density: 0.85 } } }],
      new Map([['/doc', 'doc-id']]),
    );
    expect(migrated.status).toEqual({ state: 'ok' });
    expect(migrated.entries).toEqual([
      { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.85 } } },
    ]);
    const read = await readDocumentSettingsFile(support);
    expect(read.entries).toEqual(migrated.entries);
  });

  it('keeps a same-id copy override when the other copy is removed', async () => {
    await writeDocumentSettingsFile(support, [
      {
        documentId: 'shared',
        packagePath: '/library/copy',
        page: { chrome: { pageNumber: false } },
      },
    ]);
    const removed = await removeDocumentSettingsEntries(
      support,
      { documentId: 'shared', packagePath: '/library/original' },
      { sharedIdPaths: ['/library/copy'] },
    );
    expect(removed).toEqual({
      ok: true,
      removed: [],
      keptAmbiguous: ['/library/copy'],
    });
    expect((await readDocumentSettingsFile(support)).entries).toEqual([
      {
        documentId: 'shared',
        packagePath: '/library/copy',
        page: { chrome: { pageNumber: false } },
      },
    ]);
  });

  it('removes the exact path even when the id is shared', async () => {
    await writeDocumentSettingsFile(support, [
      {
        documentId: 'shared',
        packagePath: '/library/copy',
        page: { chrome: { pageNumber: false } },
      },
      {
        documentId: 'moved',
        packagePath: '/library/original',
        page: { setup: { size: 'A5' } },
      },
    ]);
    const removed = await removeDocumentSettingsEntries(
      support,
      { documentId: 'shared', packagePath: '/library/original' },
      { sharedIdPaths: ['/library/copy'] },
    );
    expect(removed).toEqual({
      ok: true,
      removed: ['/library/original'],
      keptAmbiguous: ['/library/copy'],
    });
    expect((await readDocumentSettingsFile(support)).entries).toEqual([
      {
        documentId: 'shared',
        packagePath: '/library/copy',
        page: { chrome: { pageNumber: false } },
      },
    ]);
  });
});

async function mapEntries(): Promise<unknown[]> {
  const parsed = JSON.parse(
    await fs.readFile(documentSettingsPath(support), 'utf8'),
  ) as { entries: unknown[] };
  return parsed.entries;
}

async function backupNames(): Promise<string[]> {
  return (await fs.readdir(support))
    .filter((name) => /^document-settings\.backup-.*\.json$/.test(name))
    .sort();
}

async function writeBackup(name: string, value: unknown): Promise<string> {
  const target = path.join(support, name);
  await fs.writeFile(target, JSON.stringify(value), 'utf8');
  return target;
}

describe('document settings recovery (S3-13)', () => {
  it('resets a corrupt map to an empty one, keeps a backup, and re-enables saves', async () => {
    await fs.writeFile(documentSettingsPath(support), '{broken', 'utf8');
    const read = await readDocumentSettingsFile(support);
    expect(read.status.state).toBe('corrupt');

    const reset = await resetDocumentSettings(support);
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.entries).toEqual([]);
    // The current (corrupt) bytes are copied aside; the copy is not restorable.
    expect(reset.backupPath).toBeTruthy();
    expect(await fs.readFile(reset.backupPath!, 'utf8')).toBe('{broken');
    expect(reset.backup).toBeNull();
    expect(await mapEntries()).toEqual([]);
    // The read-time corrupt backup is preserved and the file is valid now.
    const corrupt = (await fs.readdir(support)).filter((name) =>
      /^document-settings\.corrupt-.*\.json$/.test(name),
    );
    expect(corrupt).toHaveLength(1);
    expect(await fs.readFile(path.join(support, corrupt[0]!), 'utf8')).toBe('{broken');
    expect(await readDocumentSettingsFile(support)).toEqual({
      entries: [],
      status: { state: 'ok' },
    });

    // An ordinary override saves again only after the explicit reset.
    expect(
      await saveDocumentSettings(support, {
        documentId: 'doc-id',
        packagePath: '/doc',
        page: { theme: { density: 0.9 } },
      }),
    ).toEqual({ ok: true });
    expect(await mapEntries()).toHaveLength(1);
  });

  it('refuses ordinary saves while the map is unreadable and resets explicitly', async () => {
    await writeDocumentSettingsFile(support, [
      { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.8 } } },
    ]);
    await fs.chmod(documentSettingsPath(support), 0o000);
    try {
      const read = await readDocumentSettingsFile(support);
      expect(read.status.state).toBe('unreadable');
      const refused = await saveDocumentSettings(support, {
        documentId: 'doc-id',
        packagePath: '/doc',
        page: { theme: { density: 1.1 } },
      });
      expect(refused.ok).toBe(false);
    } finally {
      await fs.chmod(documentSettingsPath(support), 0o600);
    }

    const reset = await resetDocumentSettings(support);
    expect(reset.ok).toBe(true);
    expect(await mapEntries()).toEqual([]);
    expect(await readDocumentSettingsFile(support)).toEqual({
      entries: [],
      status: { state: 'ok' },
    });
  });

  it('restores the newest valid backup and backs up the current file first', async () => {
    await writeDocumentSettingsFile(support, [
      { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.85 } } },
    ]);
    const reset = await resetDocumentSettings(support);
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    // A valid map was backed up before the reset, so Restore is available.
    expect(reset.backup).not.toBeNull();
    expect(await mapEntries()).toEqual([]);

    await writeDocumentSettingsFile(support, [
      { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.75 } } },
    ]);
    const restored = await restoreDocumentSettingsBackup(support);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.entries).toEqual([
      { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.85 } } },
    ]);
    expect(await mapEntries()).toEqual(restored.entries);
    // The replaced map (0.75) is preserved as a new backup.
    const names = await backupNames();
    expect(names.length).toBe(2);
    const texts = await Promise.all(
      names.map((name) => fs.readFile(path.join(support, name), 'utf8')),
    );
    expect(texts.some((text) => text.includes('0.75'))).toBe(true);
    expect(await readDocumentSettingsFile(support)).toEqual({
      entries: restored.entries,
      status: { state: 'ok' },
    });
  });

  it('chooses the newest valid backup and skips an invalid newer file', async () => {
    await writeBackup('document-settings.backup-2026-01-01T00-00-00-000Z.json', {
      version: 1,
      entries: [
        { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.7 } } },
      ],
    });
    await writeBackup('document-settings.backup-2026-01-02T00-00-00-000Z.json', {
      entries: 'not-a-list',
    });
    await writeBackup('document-settings.backup-2026-01-03T00-00-00-000Z.json', {
      version: 1,
      entries: [
        { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.95 } } },
      ],
    });

    expect(await listDocumentSettingsBackups(support)).toHaveLength(3);
    const newest = await findNewestValidDocumentSettingsBackup(support);
    expect(newest?.path).toContain('2026-01-03');
    expect(newest?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parseDocumentSettingsBackup('{"entries":"nope"}').ok).toBe(false);
    expect(parseDocumentSettingsBackup('{broken').ok).toBe(false);

    const restored = await restoreDocumentSettingsBackup(support);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.entries).toEqual([
      { documentId: 'doc-id', packagePath: '/doc', page: { theme: { density: 0.95 } } },
    ]);
  });

  it('fails without replacing the map when no valid backup exists', async () => {
    await fs.writeFile(documentSettingsPath(support), '{broken', 'utf8');
    await writeBackup('document-settings.backup-2026-01-02T00-00-00-000Z.json', {
      entries: 'not-a-list',
    });
    expect(await findNewestValidDocumentSettingsBackup(support)).toBeNull();

    const restored = await restoreDocumentSettingsBackup(support);
    expect(restored.ok).toBe(false);
    if (restored.ok) return;
    expect(restored.message).toMatch(/No valid document settings backup/);
    // Nothing was replaced, invalidated, or deleted.
    expect(await fs.readFile(documentSettingsPath(support), 'utf8')).toBe('{broken');
    const names = await backupNames();
    expect(names).toEqual(['document-settings.backup-2026-01-02T00-00-00-000Z.json']);
  });

  it('does not touch a missing map and reports no backup on reset', async () => {
    const reset = await resetDocumentSettings(support);
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.backupPath).toBeUndefined();
    expect(reset.backup).toBeNull();
    expect(await mapEntries()).toEqual([]);
  });
});
