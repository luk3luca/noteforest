import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocumentPackage } from '@noteforest/core/node';
import type { RecoveryCandidate } from '@noteforest/core/node';
import {
  backupCandidates,
  restoreDestinationProblem,
  restoreStamp,
  uniqueRestoreDestination,
  usableBackups,
} from '../src/main/backup-restore';
import { closeAllStores, listBackups, restoreBackup } from '../src/main/library';

let root = '';
let library = '';
let support = '';
let previousLibrary: string | undefined;
let previousSupport: string | undefined;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-backup-restore-'));
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

function candidate(overrides: Partial<RecoveryCandidate>): RecoveryCandidate {
  return {
    kind: 'autosave',
    path: '/backups/autosave.json',
    valid: true,
    createdAt: '2026-11-04T10:00:00.000Z',
    bytes: 10,
    revision: 1,
    blockCount: 1,
    title: 'Note',
    ...overrides,
  };
}

describe('backup candidate filtering and metadata', () => {
  it('keeps only backup kinds, maps metadata, and sorts newest first', () => {
    const backups = backupCandidates([
      candidate({ kind: 'canonical', path: '/p/document.json', title: 'Canonical' }),
      candidate({ kind: 'temp', path: '/p/.document.json.1.tmp', title: 'Temp' }),
      candidate({
        kind: 'autosave',
        path: '/b/autosave-1.json',
        createdAt: '2026-11-04T09:00:00.000Z',
        revision: 3,
        blockCount: 4,
        title: 'Autosave note',
      }),
      candidate({
        kind: 'manual',
        path: '/b/manual-1.json',
        createdAt: '2026-11-04T10:00:00.000Z',
        revision: 4,
        blockCount: 5,
        title: 'Manual note',
      }),
      candidate({
        kind: 'daily',
        path: '/b/daily-1.json',
        createdAt: '2026-11-04T11:00:00.000Z',
        valid: false,
        error: { code: 'malformed-json', message: 'invalid JSON' },
      }),
    ]);

    expect(backups.map((backup) => backup.kind)).toEqual(['daily', 'manual', 'autosave']);
    expect(backups[0]).toMatchObject({
      kind: 'daily',
      valid: false,
      error: 'invalid JSON',
      title: 'Note',
    });
    expect(backups[1]).toMatchObject({
      sourcePath: '/b/manual-1.json',
      kind: 'manual',
      createdAt: '2026-11-04T10:00:00.000Z',
      revision: 4,
      blockCount: 5,
      title: 'Manual note',
      valid: true,
    });
    expect(backups[1]?.error).toBeUndefined();
    expect(usableBackups(backups).map((backup) => backup.kind)).toEqual([
      'manual',
      'autosave',
    ]);
  });

  it('uses the parsed revision when a filename revision disagrees', () => {
    const backups = backupCandidates([
      candidate({ kind: 'manual', revision: 7, blockCount: 2, title: 'Parsed' }),
    ]);
    expect(backups[0]).toMatchObject({ revision: 7, blockCount: 2, title: 'Parsed' });
  });
});

describe('restore destination rules', () => {
  it('formats a filesystem-safe timestamp', () => {
    expect(restoreStamp(new Date('2026-11-04T15:30:12.345Z'))).toBe(
      '2026-11-04 15-30-12',
    );
  });

  it('allocates a unique default copy name', async () => {
    const now = new Date('2026-11-04T15:30:12.000Z');
    const first = path.join(library, 'linear-algebra restored 2026-11-04 15-30-12');
    const second = path.join(library, 'linear-algebra restored 2026-11-04 15-30-12 2');
    const taken = new Set([first, second]);
    const destination = await uniqueRestoreDestination(
      library,
      path.join(library, 'linear-algebra'),
      now,
      async (candidatePath) => taken.has(candidatePath),
    );
    expect(destination).toBe(
      path.join(library, 'linear-algebra restored 2026-11-04 15-30-12 3'),
    );
  });

  it('refuses outside, same-package, library-root, and existing destinations', () => {
    const source = path.join(library, 'source');
    const rules = (destination: string, documentExists = false) =>
      restoreDestinationProblem({
        destination,
        libraryDir: library,
        sourcePackagePath: source,
        documentExists,
      });

    expect(rules(path.join(root, 'outside'))).toMatchObject({ code: 'outside-library' });
    expect(rules(path.join(library, 'source'))).toMatchObject({ code: 'same-package' });
    expect(rules(path.join(library, 'source', 'nested'))).toMatchObject({
      code: 'same-package',
    });
    expect(rules(library)).toMatchObject({ code: 'invalid-destination' });
    expect(rules(path.join(library, 'other', 'nested'))).toMatchObject({
      code: 'invalid-destination',
    });
    expect(rules(path.join(library, 'occupied'), true)).toMatchObject({ code: 'exists' });
    expect(rules(path.join(library, 'free'))).toBeNull();
  });
});

describe('backup restore integration', () => {
  it('lists real backups newest first, restores a copy, and never overwrites', async () => {
    const created = await createDocumentPackage(
      library,
      { title: 'Backup source', chapterTitle: 'Chapter One' },
      { appSupportDir: support, registerRecent: false, heartbeatIntervalMs: 0 },
    );
    if (!created.ok) throw new Error(created.error.message);
    const packagePath = created.packagePath;
    await fs.mkdir(path.join(packagePath, 'assets'), { recursive: true });
    await fs.writeFile(path.join(packagePath, 'assets', 'diagram.bin'), 'asset-bytes');

    for (let index = 1; index <= 3; index += 1) {
      created.store.apply({ type: 'document.rename', title: `Backup ${index}` });
      const saved = await created.store.save();
      expect(saved.ok).toBe(true);
    }
    const originalPath = path.join(packagePath, 'document.json');
    const originalBytes = await fs.readFile(originalPath);

    const listing = await listBackups(packagePath);
    expect(listing.ok).toBe(true);
    if (!listing.ok) return;
    expect(listing.backups.length).toBeGreaterThanOrEqual(3);
    expect(
      listing.backups.every((backup) =>
        ['autosave', 'daily', 'pre-migration', 'manual'].includes(backup.kind),
      ),
    ).toBe(true);
    for (let index = 1; index < listing.backups.length; index += 1) {
      expect(
        (listing.backups[index - 1]?.createdAt ?? '') >= (listing.backups[index]?.createdAt ?? ''),
      ).toBe(true);
    }

    const backup = listing.backups.find((candidateBackup) => candidateBackup.valid);
    expect(backup).toBeDefined();
    if (backup === undefined) return;

    const destination = path.join(library, 'restored copy');
    const restored = await restoreBackup(packagePath, backup.sourcePath, destination);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.packagePath).toBe(destination);
    expect(restored.snapshot).toBeDefined();

    const restoredBytes = await fs.readFile(path.join(destination, 'document.json'));
    const backupBytes = await fs.readFile(backup.sourcePath);
    expect(restoredBytes.equals(backupBytes)).toBe(true);
    const restoredDocument = JSON.parse(restoredBytes.toString('utf8')) as {
      blocks: Record<string, unknown>;
      revision: number;
    };
    expect(restoredDocument.revision).toBe(backup.revision);
    expect(Object.keys(restoredDocument.blocks)).toHaveLength(backup.blockCount);
    await expect(
      fs.readFile(path.join(destination, 'assets', 'diagram.bin'), 'utf8'),
    ).resolves.toBe('asset-bytes');
    expect((await fs.readFile(originalPath)).equals(originalBytes)).toBe(true);

    const again = await restoreBackup(packagePath, backup.sourcePath, destination);
    expect(again).toMatchObject({ ok: false, code: 'exists' });
    expect((await fs.readFile(path.join(destination, 'document.json'))).equals(restoredBytes)).toBe(
      true,
    );

    const arbitrary = await restoreBackup(
      packagePath,
      path.join(support, 'not-a-backup.json'),
      path.join(library, 'arbitrary copy'),
    );
    expect(arbitrary).toMatchObject({ ok: false, code: 'invalid-source' });

    await created.store.close();
  });
});
