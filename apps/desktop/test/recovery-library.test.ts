import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  BackupManager,
  backupsDirForPackage,
  createDocumentPackage,
  lockPathForPackage,
} from '@noteforest/core/node';
import {
  applyCommand,
  closeAllStores,
  openDocument,
  restoreNewestBackup,
  saveDocument,
  scanLibrary,
  takeOverStaleLock,
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
    newerDocument.schemaVersion = 3;
    newerDocument.title = 'From the future';
    await fs.writeFile(
      path.join(newerPath, 'document.json'),
      JSON.stringify(newerDocument, null, 2),
    );

    const missingPath = path.join(library, 'missing-note');
    // Phase 3: a missing package is only a folder that looks like a package
    // (assets/ or a .noteforest marker) with no document.json. An arbitrary
    // folder is a folder, never a MISSING note.
    await fs.mkdir(path.join(missingPath, 'assets'), { recursive: true });
    const plainFolderPath = path.join(library, 'plain-folder');
    await fs.mkdir(plainFolderPath, { recursive: true });

    const view = await scanLibrary();
    const byPath = new Map(view.documents.map((document) => [document.packagePath, document]));
    const folderNames = view.tree.map((node) => `${node.kind}:${node.name}`);

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
      reason: 'This note couldn’t be read.',
      reasonDetails: expect.stringMatching(/not valid JSON/),
    });
    expect(byPath.get(newerPath)).toMatchObject({
      status: 'newer-schema',
      title: 'From the future',
      reason: 'A newer NoteForest wrote this note.',
      reasonDetails: expect.stringMatching(/newer than this app supports/),
    });
    expect(byPath.get(missingPath)).toMatchObject({
      status: 'missing',
      title: 'missing-note',
      reason: 'This note’s file is missing.',
      reasonDetails: expect.stringMatching(/document\.json is missing/),
    });
    expect(byPath.get(plainFolderPath)).toBeUndefined();
    expect(folderNames).toContain('folder:plain-folder');
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
    newerDocument.schemaVersion = 3;
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
      // A core sentence never reaches the row: the short line is the copy, the
      // raw parse reason opens under Details (copy-plan §E).
      reason: 'The file isn’t valid NoteForest data.',
      reasonDetails: expect.stringMatching(/not valid JSON/),
    });
    await expect(openDocument(newerPath)).resolves.toMatchObject({
      recovery: true,
      status: 'newer-schema',
      reason: 'A newer NoteForest wrote the file.',
      reasonDetails: expect.stringMatching(/newer than this app supports/),
    });
    await expect(openDocument(missingPath)).resolves.toMatchObject({
      recovery: true,
      status: 'missing',
      reason: 'The folder or the file is missing.',
    });

    expect((await fs.readFile(path.join(brokenPath, 'document.json'))).equals(brokenBytes)).toBe(
      true,
    );
  });

  it('maps a core command rejection to a short line with the raw reason in details', async () => {
    const valid = await createValidPackage('Mapping note');
    const opened = await openDocument(valid.packagePath);
    if (!('document' in opened)) throw new Error('expected an editable snapshot');
    const chapterId = opened.document.chapters[0]?.id;
    expect(chapterId).toBeDefined();

    const rejected = await applyCommand(valid.packagePath, {
      type: 'chapter.delete',
      chapterId: chapterId as string,
    });
    expect(rejected).toMatchObject({
      ok: false,
      code: 'last-chapter',
      // The core sentence ("a document must keep at least one chapter") never
      // reaches the toast line; it is the Details value.
      message: 'A note needs at least one chapter.',
      details: expect.stringMatching(/at least one chapter/),
    });
  });

  it('refuses a command on a damaged package with the short recovery line', async () => {
    const valid = await createValidPackage('Damaged note');
    const brokenPath = path.join(library, 'damaged-copy');
    await fs.cp(valid.packagePath, brokenPath, { recursive: true });
    await fs.writeFile(path.join(brokenPath, 'document.json'), '{ "schemaVersion": 2,');

    const rejected = await applyCommand(brokenPath, {
      type: 'document.rename',
      title: 'Renamed',
    });
    expect(rejected).toMatchObject({
      ok: false,
      code: 'read-only',
      message: 'The file isn’t valid NoteForest data.',
      details: expect.stringMatching(/not valid JSON/),
    });
  });
});

async function writeStaleLock(packagePath: string, token = 'dead-token'): Promise<string> {
  const lockPath = lockPathForPackage(packagePath, support);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(
    lockPath,
    `${JSON.stringify(
      {
        version: 1,
        documentPath: packagePath,
        pid: 2_147_483_647,
        host: os.hostname(),
        sessionId: 'dead-session',
        token,
        acquiredAt: '2020-01-01T00:00:00.000Z',
        heartbeatAt: '2020-01-01T00:00:00.000Z',
      },
      null,
      2,
    )}\n`,
  );
  return lockPath;
}

describe('stale lock consent', () => {
  it('leaves a normal unlocked document editable and lock-free', async () => {
    const valid = await createValidPackage('Normal note');
    const opened = await openDocument(valid.packagePath);
    expect('status' in opened && opened.status).toBe('editable');
    if ('status' in opened) {
      expect(opened.readOnlyReason).toBeUndefined();
      expect(opened.lock).toBeUndefined();
    }
    const renamed = await applyCommand(valid.packagePath, {
      type: 'document.rename',
      title: 'Normal note renamed',
    });
    expect(renamed.ok).toBe(true);
  });

  it('opens stale-lock packages read-only with metadata and never breaks them automatically', async () => {
    const valid = await createValidPackage('Stale note');
    const lockPath = await writeStaleLock(valid.packagePath);

    const opened = await openDocument(valid.packagePath);
    expect('status' in opened && opened.status).toBe('read-only');
    if ('status' in opened) {
      expect(opened.readOnlyReason).toBe('stale-lock');
      expect(opened.lock).toMatchObject({
        pid: 2_147_483_647,
        host: os.hostname(),
        sessionId: 'dead-session',
        heartbeatAt: '2020-01-01T00:00:00.000Z',
        corrupt: false,
      });
    }

    const lockAfterOpen = JSON.parse(await fs.readFile(lockPath, 'utf8')) as {
      token?: string;
    };
    expect(lockAfterOpen.token).toBe('dead-token');

    const rejected = await applyCommand(valid.packagePath, {
      type: 'document.rename',
      title: 'Hijack',
    });
    expect(rejected.ok).toBe(false);
  });

  it('takes over only on the explicit action, then saves writable changes', async () => {
    const valid = await createValidPackage('Stale note');
    const lockPath = await writeStaleLock(valid.packagePath);

    await openDocument(valid.packagePath);
    const taken = await takeOverStaleLock(valid.packagePath);
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    expect(taken.snapshot.status).toBe('editable');
    expect(taken.snapshot.lock).toBeUndefined();

    const renamed = await applyCommand(valid.packagePath, {
      type: 'document.rename',
      title: 'Taken over',
    });
    expect(renamed.ok).toBe(true);
    const saved = await saveDocument(valid.packagePath);
    expect(saved.ok).toBe(true);

    const onDisk = JSON.parse(
      await fs.readFile(path.join(valid.packagePath, 'document.json'), 'utf8'),
    ) as { title?: string };
    expect(onDisk.title).toBe('Taken over');

    const lockAfterTakeover = JSON.parse(await fs.readFile(lockPath, 'utf8')) as {
      token?: string;
      pid?: number;
    };
    expect(lockAfterTakeover.token).not.toBe('dead-token');
    expect(lockAfterTakeover.pid).toBe(process.pid);
  });

  it('refuses to take over a live lock and leaves the writer untouched', async () => {
    const created = await createDocumentPackage(
      library,
      { title: 'Live note', chapterTitle: 'Chapter One' },
      { appSupportDir: support, registerRecent: false, heartbeatIntervalMs: 0 },
    );
    if (!created.ok) throw new Error(created.error.message);

    const opened = await openDocument(created.packagePath);
    expect('status' in opened && opened.status).toBe('read-only');
    if ('status' in opened) expect(opened.readOnlyReason).toBe('locked');

    const taken = await takeOverStaleLock(created.packagePath);
    expect(taken.ok).toBe(false);
    if (!taken.ok) {
      expect(taken.code).toBe('locked');
      expect(taken.message).toBe('Another window has this note open.');
    }

    const applied = created.store.apply({ type: 'document.rename', title: 'Still mine' });
    expect(applied.ok).toBe(true);
    await created.store.close();
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
      message: 'Document is outside the known NoteForest libraries.',
    });
    await expect(restoreNewestBackup(outside)).resolves.toMatchObject({
      ok: false,
      code: 'outside-library',
    });
  });
});
