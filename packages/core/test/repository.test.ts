import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readDocumentLock } from '../src/node/lock.js';
import { documentJsonPath } from '../src/node/paths.js';
import { NodeDocumentRepository } from '../src/node/repository.js';
import type { DocumentStore } from '../src/node/store.js';
import { makeTempDir, removeDir, textContent } from './helpers.js';

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/schema',
);

let root = '';
let library = '';
let support = '';
let repository: NodeDocumentRepository;

function newRepository(): NodeDocumentRepository {
  return new NodeDocumentRepository({
    appSupportDir: () => support,
    defaultStoreOptions: { registerRecent: false, heartbeatIntervalMs: 0 },
  });
}

async function writePackage(name: string, fixtureName: string): Promise<string> {
  const packagePath = path.join(library, name);
  await fs.mkdir(path.join(packagePath, 'assets'), { recursive: true });
  const bytes = await fs.readFile(path.join(fixturesDir, fixtureName));
  await fs.writeFile(documentJsonPath(packagePath), bytes);
  return packagePath;
}

async function fixtureBytes(packagePath: string): Promise<Buffer> {
  return fs.readFile(documentJsonPath(packagePath));
}

function addTopLevel(store: DocumentStore, text: string): void {
  const chapterId = store.document?.chapters[0]?.id ?? '';
  const result = store.apply({
    type: 'block.create',
    content: textContent(text),
    placement: { kind: 'top-level', chapterId },
  });
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
}

beforeEach(async () => {
  root = await makeTempDir();
  library = path.join(root, 'library');
  support = path.join(root, 'app-support');
  await fs.mkdir(library, { recursive: true });
  repository = newRepository();
});

afterEach(async () => {
  await repository.closeAll();
  await removeDir(root);
});

describe('document repository', () => {
  it('creates, lists, saves, backs up, closes, and reopens a package', async () => {
    const created = await repository.create(library, {
      title: 'Repository doc',
      chapterTitle: 'Chapter One',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(repository.get(created.packagePath)).toBe(created.store);
    addTopLevel(created.store, 'One');
    const saved = await repository.save(created.packagePath);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.changed).toBe(true);
    expect(saved.revision).toBe(created.store.revision);
    expect(saved.backupPath).toBeDefined();

    const listing = await repository.list(library);
    expect(listing.warnings).toEqual([]);
    const row = listing.documents.find((entry) => entry.packagePath === created.packagePath);
    expect(row).toMatchObject({
      status: 'ok',
      title: 'Repository doc',
      revision: saved.revision,
      blockCount: 1,
      chapterCount: 1,
    });

    const automatic = await repository.listBackups(created.packagePath);
    expect(automatic.length).toBeGreaterThan(0);
    expect(automatic.every((candidate) => candidate.kind !== 'canonical')).toBe(true);
    expect(automatic.every((candidate) => candidate.valid)).toBe(true);

    const manual = await repository.backup(created.packagePath, 'manual');
    expect(manual.ok).toBe(true);
    const afterManual = await repository.listBackups(created.packagePath);
    expect(afterManual.some((candidate) => candidate.kind === 'manual' && candidate.valid)).toBe(
      true,
    );

    await repository.close(created.packagePath);
    expect(repository.get(created.packagePath)).toBeNull();

    const reopened = await repository.open(created.packagePath);
    expect(reopened.status).toBe('editable');
    expect(reopened.document?.revision).toBe(saved.revision);
    expect(Object.keys(reopened.document?.blocks ?? {})).toHaveLength(1);
  });

  it('returns the same open store and does not take a second writer lock', async () => {
    const created = await repository.create(library, { title: 'Single writer' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const again = await repository.open(created.packagePath);
    expect(again.store).toBe(created.store);
    expect(again.status).toBe('editable');

    const other = newRepository();
    try {
      const locked = await other.open(created.packagePath);
      expect(locked.status).toBe('read-only');
      expect(locked.readOnlyReason).toBe('locked');
      expect(locked.document).not.toBeNull();
    } finally {
      await other.closeAll();
    }
  });

  it('validates the v1 fixture without a migration and lists it as ok', async () => {
    const packagePath = await writePackage('v1-package', 'v1.json');
    const validation = await repository.validate(packagePath);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.schemaVersion).toBe(1);
    expect(validation.migratedFrom).toBeUndefined();
    expect(validation.warnings).toEqual([]);

    const listing = await repository.list(library);
    const row = listing.documents.find((entry) => entry.packagePath === packagePath);
    expect(row).toMatchObject({
      status: 'ok',
      title: 'Schema v1 fixture',
      documentId: 'fixture-schema-v1',
      revision: 3,
      blockCount: 1,
      chapterCount: 1,
    });
    await expect(readDocumentLock(packagePath, { appSupportDir: support })).resolves.toBeNull();
  });

  it('opens an unknown newer document read-only and never rewrites it', async () => {
    const packagePath = await writePackage('newer-package', 'v2-newer.json');
    const before = await fixtureBytes(packagePath);

    const validation = await repository.validate(packagePath);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe('newer-schema');
    expect(validation.schemaVersion).toBe(2);

    const opened = await repository.open(packagePath);
    expect(opened.status).toBe('read-only');
    expect(opened.readOnlyReason).toBe('newer-schema');
    expect(opened.document).toBeNull();
    expect(repository.get(packagePath)).toBeNull();

    const after = await fixtureBytes(packagePath);
    expect(after.equals(before)).toBe(true);
    await expect(readDocumentLock(packagePath, { appSupportDir: support })).resolves.toBeNull();

    const listing = await repository.list(library);
    const row = listing.documents.find((entry) => entry.packagePath === packagePath);
    expect(row).toMatchObject({
      status: 'newer-schema',
      title: 'Schema v2 (unknown newer)',
      documentId: null,
      revision: null,
    });
  });

  it('leaves corrupt JSON byte-identical and reports it as unreadable', async () => {
    const packagePath = await writePackage('corrupt-package', 'corrupt.json');
    const before = await fixtureBytes(packagePath);

    const validation = await repository.validate(packagePath);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe('malformed-json');
    expect(validation.schemaVersion).toBeNull();

    const opened = await repository.open(packagePath);
    expect(opened.status).toBe('read-only');
    expect(opened.readOnlyReason).toBe('corrupt');
    expect(opened.document).toBeNull();

    const after = await fixtureBytes(packagePath);
    expect(after.equals(before)).toBe(true);
    await expect(readDocumentLock(packagePath, { appSupportDir: support })).resolves.toBeNull();

    const listing = await repository.list(library);
    const row = listing.documents.find((entry) => entry.packagePath === packagePath);
    expect(row).toMatchObject({
      status: 'unreadable',
      title: 'corrupt-package',
      documentId: null,
      revision: null,
    });
    expect(row?.reason).toMatch(/not valid JSON/);
  });

  it('leaves structurally invalid v1 input byte-identical and read-only', async () => {
    const packagePath = await writePackage('invalid-package', 'invalid.json');
    const before = await fixtureBytes(packagePath);

    const validation = await repository.validate(packagePath);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe('invalid-document');
    expect(validation.schemaVersion).toBe(1);
    expect(validation.error.issues?.some((issue) => issue.code === 'unknown-block')).toBe(true);

    const opened = await repository.open(packagePath);
    expect(opened.status).toBe('read-only');
    expect(opened.readOnlyReason).toBe('invalid');
    expect(opened.document).toBeNull();

    const after = await fixtureBytes(packagePath);
    expect(after.equals(before)).toBe(true);

    const listing = await repository.list(library);
    const row = listing.documents.find((entry) => entry.packagePath === packagePath);
    expect(row).toMatchObject({
      status: 'unreadable',
      title: 'Schema invalid fixture',
    });
  });

  it('reports missing packages and skips hidden folders', async () => {
    const emptyPath = path.join(library, 'empty-folder');
    const hiddenPath = path.join(library, '.hidden');
    await fs.mkdir(emptyPath, { recursive: true });
    await fs.mkdir(hiddenPath, { recursive: true });

    const listing = await repository.list(library);
    const byPath = new Map(listing.documents.map((entry) => [entry.packagePath, entry]));
    expect(byPath.get(emptyPath)).toMatchObject({
      status: 'missing',
      title: 'empty-folder',
      documentId: null,
      revision: null,
    });
    expect(byPath.has(hiddenPath)).toBe(false);
  });

  it('detects an external modification and refuses to overwrite it', async () => {
    const created = await repository.create(library, { title: 'External edit' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    addTopLevel(created.store, 'One');
    const saved = await repository.save(created.packagePath);
    expect(saved.ok).toBe(true);

    const documentPath = documentJsonPath(created.packagePath);
    const original = await fs.readFile(documentPath, 'utf8');
    await fs.writeFile(documentPath, `${original.trimEnd()}\n `, 'utf8');

    const blocked = await repository.save(created.packagePath);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe('external-modification');
  });

  it('tracks dirty stores and flushes them through saveAllDirty', async () => {
    const created = await repository.create(library, { title: 'Dirty doc' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    addTopLevel(created.store, 'Unsaved');

    expect(repository.dirty()).toEqual([
      { packagePath: created.packagePath, title: 'Dirty doc' },
    ]);
    await expect(repository.saveAllDirty()).resolves.toEqual([]);
    expect(repository.dirty()).toEqual([]);
  });

  it('saves before closing when requested', async () => {
    const created = await repository.create(library, { title: 'Close flush' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    addTopLevel(created.store, 'Flushed');

    await repository.close(created.packagePath, { save: true });
    const reopened = await repository.open(created.packagePath);
    expect(reopened.document).not.toBeNull();
    expect(Object.keys(reopened.document?.blocks ?? {})).toHaveLength(1);
  });
});
