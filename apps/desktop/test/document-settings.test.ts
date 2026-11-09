import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  adoptDocumentSettingsEntry,
  findDocumentSettingsEntry,
  migrateSessionOverrides,
  normalizeDocumentSettingsFile,
  serializeDocumentSettingsFile,
  upsertDocumentSettingsEntry,
} from '../src/shared/document-settings';
import {
  documentSettingsPath,
  flushDocumentSettingsWrites,
  migrateLegacySessionOverrides,
  readDocumentSettingsFile,
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

  it('normalizes a stored file and drops invalid entries', () => {
    const read = normalizeDocumentSettingsFile({
      version: 1,
      entries: [
        { documentId: 'a', packagePath: '/a', page: { theme: { density: 0.8 } } },
        { documentId: 'a', packagePath: '/a', page: { theme: { density: 1.2 } } },
        { documentId: null, packagePath: '/b', page: null },
        { packagePath: 42, page: { theme: { density: 0.9 } } },
        'nope',
      ],
    });
    expect(read.found).toBe(true);
    expect(read.entries).toEqual([
      { documentId: 'a', packagePath: '/a', page: { theme: { density: 1.2 } } },
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
});
