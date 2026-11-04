import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BackupManager,
  backupsDirForPackage,
  createDocumentPackage,
} from '@noteforest/core/node';
import {
  closeAllStores,
  openDocument,
  restoreNewestBackup,
  scanLibrary,
} from '../src/main/library';

let root = '';
let library = '';
let support = '';
let previousLibrary: string | undefined;
let previousSupport: string | undefined;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-recovery-'));
  library = path.join(root, 'library');
  support = path.join(root, 'support');
  await fs.mkdir(library, { recursive: true });
  await fs.mkdir(support, { recursive: true });
  previousLibrary = process.env['NOTEFOREST_LIBRARY'];
  previousSupport = process.env['NOTEFOREST_APP_SUPPORT'];
  process.env['NOTEFOREST_LIBRARY'] = library;
  process.env['NOTEFOREST_APP_SUPPORT'] = support;
});

afterEach(async () => {
  await closeAllStores();
  if (previousLibrary === undefined) delete process.env['NOTEFOREST_LIBRARY'];
  else process.env['NOTEFOREST_LIBRARY'] = previousLibrary;
  if (previousSupport === undefined) delete process.env['NOTEFOREST_APP_SUPPORT'];
  else process.env['NOTEFOREST_APP_SUPPORT'] = previousSupport;
  await fs.rm(root, { recursive: true, force: true });
});

async function createValidPackage(title: string): Promise<{ packagePath: string; bytes: Buffer }> {
  const created = await createDocumentPackage(
    library,
    { title, chapterTitle: 'Chapter One' },
    { appSupportDir: support, registerRecent: false, heartbeatIntervalMs: 0 },
  );
  if (!created.ok) throw new Error(created.error.message);
  await created.store.close();
  const packagePath = created.packagePath;
  const bytes = await fs.readFile(path.join(packagePath, 'document.json'));
  return { packagePath, bytes };
}

describe('library recovery statuses', () => {
  it('lists ok, unreadable, newer-schema, and missing packages with reasons', async () => {
    const valid = await createValidPackage('Valid note');

    const brokenPath = path.join(library, 'broken-note');
    await fs.cp(valid.packagePath, brokenPath, { recursive: true });
    const brokenBytes = valid.bytes.subarray(0, Math.floor(valid.bytes.byteLength / 2));
    await fs.writeFile(path.join(brokenPath, 'document.json'), brokenBytes);

    const newerPath = path.join(library, 'newer-note');
    await fs.cp(valid.packagePath, newerPath, { recursive: true });
    const newerDocument = JSON.parse(valid.bytes.toString('utf8')) as {
      schemaVersion: number;
      title: string;
    };
    newerDocument.schemaVersion = 2;
    newerDocument.title = 'From the future';
    await fs.writeFile(
      path.join(newerPath, 'document.json'),
      JSON.stringify(newerDocument, null, 2),
    );

    const missingPath = path.join(library, 'missing-note');
    await fs.mkdir(missingPath, { recursive: true });

    const view = await scanLibrary();
    const byPath = new Map(view.documents.map((document) => [document.packagePath, document]));

    expect(byPath.get(valid.packagePath)).toMatchObject({
      status: 'ok',
      title: 'Valid note',
      documentId: expect.any(String),
      revision: expect.any(Number),
      blockCount: 0,
      chapterCount: 1,
    });
    expect(byPath.get(brokenPath)).toMatchObject({
      status: 'unreadable',
      title: 'broken-note',
      documentId: null,
      reason: expect.stringMatching(/not valid JSON/),
    });
    expect(byPath.get(newerPath)).toMatchObject({
      status: 'newer-schema',
      title: 'From the future',
      reason: expect.stringMatching(/newer than this app supports/),
    });
    expect(byPath.get(missingPath)).toMatchObject({
      status: 'missing',
      title: 'missing-note',
      reason: expect.stringMatching(/document\.json is missing/),
    });
    expect(view.warnings).toEqual([]);
  });

  it('opens damaged packages as recovery views instead of editable snapshots', async () => {
    const valid = await createValidPackage('Valid note');
    const brokenPath = path.join(library, 'broken-note');
    await fs.cp(valid.packagePath, brokenPath, { recursive: true });
    const brokenBytes = Buffer.from('{ "schemaVersion": 1,');
    await fs.writeFile(path.join(brokenPath, 'document.json'), brokenBytes);

    const newerPath = path.join(library, 'newer-note');
    await fs.cp(valid.packagePath, newerPath, { recursive: true });
    const newerDocument = JSON.parse(valid.bytes.toString('utf8')) as {
      schemaVersion: number;
    };
    newerDocument.schemaVersion = 2;
    await fs.writeFile(
      path.join(newerPath, 'document.json'),
      JSON.stringify(newerDocument, null, 2),
    );

    const missingPath = path.join(library, 'missing-note');
    await fs.mkdir(missingPath, { recursive: true });

    await expect(openDocument(brokenPath)).resolves.toMatchObject({
      recovery: true,
      status: 'unreadable',
      packagePath: brokenPath,
      reason: expect.stringMatching(/not valid JSON/),
    });
    await expect(openDocument(newerPath)).resolves.toMatchObject({
      recovery: true,
      status: 'newer-schema',
      reason: expect.stringMatching(/newer than this app supports/),
    });
    await expect(openDocument(missingPath)).resolves.toMatchObject({
      recovery: true,
      status: 'missing',
      reason: expect.stringMatching(/does not exist|missing/),
    });

    expect((await fs.readFile(path.join(brokenPath, 'document.json'))).equals(brokenBytes)).toBe(
      true,
    );
  });
});

describe('restore newest backup from recovery', () => {
  it('writes a new copy and leaves the damaged original untouched', async () => {
    const valid = await createValidPackage('Valid note');
    const brokenPath = path.join(library, 'broken-note');
    await fs.cp(valid.packagePath, brokenPath, { recursive: true });
    const brokenBytes = Buffer.from('{ "schemaVersion": 1,');
    await fs.writeFile(path.join(brokenPath, 'document.json'), brokenBytes);

    const backups = new BackupManager(backupsDirForPackage(support, brokenPath));
    const older = await backups.create(valid.bytes, {
      kind: 'autosave',
      revision: 3,
      now: new Date('2026-11-04T10:00:00.000Z'),
    });
    await backups.create(Buffer.from('{ "schemaVersion": 1,'), {
      kind: 'autosave',
      revision: 4,
      now: new Date('2026-11-04T11:00:00.000Z'),
    });

    const restored = await restoreNewestBackup(brokenPath);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.packagePath).not.toBe(brokenPath);
    expect(restored.packagePath.startsWith(library)).toBe(true);
    expect(restored.snapshot).toBeDefined();
    expect((await fs.readFile(path.join(restored.packagePath, 'document.json'))).equals(valid.bytes)).toBe(
      true,
    );
    expect((await fs.readFile(path.join(brokenPath, 'document.json'))).equals(brokenBytes)).toBe(
      true,
    );

    const listing = await scanLibrary();
    expect(
      listing.documents.find((document) => document.packagePath === restored.packagePath),
    ).toMatchObject({ status: 'ok', title: 'Valid note' });
    expect(
      listing.documents.find((document) => document.packagePath === brokenPath),
    ).toMatchObject({ status: 'unreadable' });

    const second = await restoreNewestBackup(brokenPath);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.packagePath).not.toBe(restored.packagePath);
    expect((await fs.readFile(path.join(brokenPath, 'document.json'))).equals(brokenBytes)).toBe(
      true,
    );
    expect((await fs.readFile(older.path)).equals(valid.bytes)).toBe(true);
  });

  it('returns an empty result when no valid backup exists', async () => {
    const valid = await createValidPackage('Valid note');
    const brokenPath = path.join(library, 'broken-note');
    await fs.cp(valid.packagePath, brokenPath, { recursive: true });
    await fs.writeFile(path.join(brokenPath, 'document.json'), '{ "schemaVersion": 1,');

    await expect(restoreNewestBackup(brokenPath)).resolves.toMatchObject({
      ok: false,
      code: 'no-backup',
    });

    const backups = new BackupManager(backupsDirForPackage(support, brokenPath));
    await backups.create(Buffer.from('{ "schemaVersion": 1,'), {
      kind: 'autosave',
      revision: 2,
    });
    await expect(restoreNewestBackup(brokenPath)).resolves.toMatchObject({
      ok: false,
      code: 'no-backup',
    });
  });

  it('rejects packages outside the configured library', async () => {
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside, { recursive: true });
    await expect(openDocument(outside)).resolves.toMatchObject({
      ok: false,
      message: 'Document is outside the NoteForest library.',
    });
    await expect(restoreNewestBackup(outside)).resolves.toMatchObject({
      ok: false,
      code: 'outside-library',
    });
  });
});
