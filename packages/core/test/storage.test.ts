import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DocumentStoreOptions } from '../src/node/store.js';
import {
  DocumentStore,
  createDocumentPackage,
  openDocumentPackage,
} from '../src/node/store.js';
import {
  findNewestValidRecovery,
  inspectRecoveryCandidates,
  restoreCandidateToPackage,
} from '../src/node/recovery.js';
import { lockPathForPackage } from '../src/node/lock.js';
import {
  readRecentDocuments,
  recordRecentDocument,
  removeRecentDocument,
} from '../src/node/recent.js';
import { stringifyDocument } from '../src/serialize.js';
import { validateDocument } from '../src/validation.js';
import type { Document } from '../src/types.js';
import { makeTempDir, removeDir, textContent } from './helpers.js';

let root = '';
let library = '';
let appSupport = '';
let stores: DocumentStore[] = [];

function options(overrides: Partial<DocumentStoreOptions> = {}): DocumentStoreOptions {
  return {
    appSupportDir: appSupport,
    registerRecent: false,
    heartbeatIntervalMs: 0,
    ...overrides,
  };
}

async function createPackage(title = 'Document') {
  const result = await createDocumentPackage(
    library,
    { title, chapterTitle: 'Chapter One' },
    options(),
  );
  if (!result.ok) throw new Error(result.error.message);
  stores.push(result.store);
  return result;
}

function currentDocument(store: DocumentStore): Document {
  const document = store.document;
  if (document === null) throw new Error('store has no document');
  return document;
}

function addTopLevel(store: DocumentStore, label: string): string {
  const before = new Set(Object.keys(currentDocument(store).blocks));
  const chapterId = currentDocument(store).chapters[0]?.id ?? '';
  const result = store.apply({
    type: 'block.create',
    label,
    content: textContent(label),
    placement: { kind: 'top-level', chapterId },
  });
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  const id = result.affected.blockIds.find((blockId) => !before.has(blockId));
  if (id === undefined) throw new Error('block.create did not report a new block');
  return id;
}

function addChild(store: DocumentStore, parentBlockId: string, label: string): string {
  const before = new Set(Object.keys(currentDocument(store).blocks));
  const result = store.apply({
    type: 'block.create',
    label,
    content: textContent(label),
    placement: { kind: 'child', parentBlockId },
  });
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  const id = result.affected.blockIds.find((blockId) => !before.has(blockId));
  if (id === undefined) throw new Error('block.create did not report a new block');
  return id;
}

beforeEach(async () => {
  root = await makeTempDir();
  library = path.join(root, 'library');
  appSupport = path.join(root, 'app-support');
  stores = [];
});

afterEach(async () => {
  for (const store of stores) {
    await store.close().catch(() => undefined);
  }
  await removeDir(root);
});

describe('document package creation and round-trip', () => {
  it('creates the package layout and reopens the same document', async () => {
    const created = await createPackage('Linear Algebra');
    expect(created.packagePath.startsWith(path.join(library, 'linear-algebra'))).toBe(true);
    await expect(fs.access(path.join(created.packagePath, 'document.json'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(created.packagePath, 'assets'))).resolves.toBeUndefined();
    expect(created.document.revision).toBe(0);

    const a = addTopLevel(created.store, 'Eigenvalues');
    const child = addChild(created.store, a, 'Eigenvector');
    const save = await created.store.save();
    expect(save.ok).toBe(true);
    if (save.ok) {
      expect(save.changed).toBe(true);
      expect(save.revision).toBe(created.store.revision);
      expect(save.backupPath).toBeDefined();
    }

    const inMemory = currentDocument(created.store);
    expect(inMemory.blocks[child]?.label).toBe('Eigenvector');
    expect(Object.values(inMemory.branches)[0]?.role).toBe('primary');
    await created.store.close();

    const reopened = await openDocumentPackage(created.packagePath, options({ mode: 'read' }));
    stores.push(reopened.store);
    expect(reopened.status).toBe('read-only');
    expect(reopened.readOnlyReason).toBe('requested');
    expect(reopened.document).toEqual(inMemory);
    expect(validateDocument(reopened.document).ok).toBe(true);
  });

  it('advances revision once per changed save and no-ops an unchanged save', async () => {
    const created = await createPackage('Revision');
    addTopLevel(created.store, 'One');
    const first = await created.store.save();
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.revision).toBe(1);

    const noop = await created.store.save();
    expect(noop.ok).toBe(true);
    if (noop.ok) {
      expect(noop.changed).toBe(false);
      expect(noop.revision).toBe(1);
    }

    addTopLevel(created.store, 'Two');
    const second = await created.store.save();
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.revision).toBe(2);

    const onDisk = JSON.parse(
      await fs.readFile(path.join(created.packagePath, 'document.json'), 'utf8'),
    ) as Document;
    expect(onDisk.revision).toBe(2);
    expect(Object.keys(onDisk.blocks)).toHaveLength(2);
  });

  it('edits primary branches after reopen and persists them', async () => {
    const created = await createPackage('Branch edit');
    const parentA = addTopLevel(created.store, 'A');
    const parentB = addTopLevel(created.store, 'B');
    const child = addChild(created.store, parentA, 'A1');
    expect((await created.store.save()).ok).toBe(true);
    await created.store.close();

    const reopened = await openDocumentPackage(created.packagePath, options());
    stores.push(reopened.store);
    expect(reopened.status).toBe('editable');
    const moved = reopened.store.apply({
      type: 'block.move',
      blockId: child,
      to: { kind: 'child', parentBlockId: parentB },
    });
    expect(moved.ok).toBe(true);
    expect((await reopened.store.save()).ok).toBe(true);
    await reopened.store.close();

    const verified = await openDocumentPackage(created.packagePath, options({ mode: 'read' }));
    stores.push(verified.store);
    const branch = Object.values(verified.document?.branches ?? {}).find(
      (candidate) => candidate.targetBlockId === child,
    );
    expect(branch?.source.blockId).toBe(parentB);
    expect(branch?.role).toBe('primary');
    expect(verified.document?.blocks[child]?.label).toBe('A1');
  });
});

describe('atomic save failure', () => {
  it('keeps the previous file byte-identical and leaves no temp files', async () => {
    let fail = false;
    const hooks = {
      beforeRename: () => {
        if (fail) throw new Error('simulated disk full');
      },
    };
    const created = await createDocumentPackage(
      library,
      { title: 'Atomic' },
      options({ atomicWriteHooks: hooks }),
    );
    if (!created.ok) throw new Error(created.error.message);
    stores.push(created.store);
    addTopLevel(created.store, 'Before');
    const first = await created.store.save();
    expect(first.ok).toBe(true);

    const documentPath = path.join(created.packagePath, 'document.json');
    const previous = await fs.readFile(documentPath);
    addTopLevel(created.store, 'After');
    fail = true;
    const failed = await created.store.save();
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.code).toBe('io-error');
    const afterFailure = await fs.readFile(documentPath);
    expect(afterFailure.equals(previous)).toBe(true);
    const entries = await fs.readdir(created.packagePath);
    expect(entries.filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(created.store.hasUnsavedChanges).toBe(true);

    fail = false;
    const retried = await created.store.save();
    expect(retried.ok).toBe(true);
    if (retried.ok) expect(retried.changed).toBe(true);
  });

  it('keeps edits that land while a save is in flight dirty', async () => {
    let armed = false;
    let release: () => void = () => undefined;
    let reached: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reachedGate = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const hooks = {
      beforeRename: async () => {
        if (!armed) return;
        armed = false;
        reached();
        await gate;
      },
    };
    const created = await createDocumentPackage(
      library,
      { title: 'In flight' },
      options({ atomicWriteHooks: hooks }),
    );
    if (!created.ok) throw new Error(created.error.message);
    stores.push(created.store);
    addTopLevel(created.store, 'Before');

    armed = true;
    const savePromise = created.store.save();
    await reachedGate;
    created.store.apply({ type: 'document.rename', title: 'During save' });
    release();
    const firstSave = await savePromise;
    expect(firstSave.ok).toBe(true);
    expect(created.store.hasUnsavedChanges).toBe(true);

    const secondSave = await created.store.save();
    expect(secondSave.ok).toBe(true);
    const disk = JSON.parse(
      await fs.readFile(path.join(created.packagePath, 'document.json'), 'utf8'),
    ) as Document;
    expect(disk.title).toBe('During save');
  });
});

describe('backup rotation and recovery', () => {
  it('keeps at least ten autosave snapshots and rotates older ones', async () => {
    const created = await createDocumentPackage(
      library,
      { title: 'Backups' },
      options({ backupRetention: { autosaveMax: 10 } }),
    );
    if (!created.ok) throw new Error(created.error.message);
    stores.push(created.store);

    for (let index = 0; index < 15; index += 1) {
      created.store.apply({ type: 'document.rename', title: `Backup ${index}` });
      const saved = await created.store.save();
      expect(saved.ok).toBe(true);
    }

    const backups = await created.store.listBackups();
    const autosaves = backups.filter((backup) => backup.kind === 'autosave');
    expect(autosaves).toHaveLength(10);
    expect(autosaves[0]?.revision).toBeGreaterThan(autosaves[9]?.revision ?? -1);

    const preMigration = await created.store.createBackup('pre-migration');
    expect(preMigration.ok).toBe(true);
    const afterSnapshot = await created.store.listBackups();
    expect(afterSnapshot.some((backup) => backup.kind === 'pre-migration')).toBe(true);
    const stillAutosaves = afterSnapshot.filter((backup) => backup.kind === 'autosave');
    expect(stillAutosaves).toHaveLength(10);
  });

  it('recovers a corrupt canonical file from the newest valid backup without overwriting it', async () => {
    const created = await createPackage('Recoverable');
    await fs.writeFile(path.join(created.packagePath, 'assets', 'asset-1.bin'), 'asset bytes');
    const first = addTopLevel(created.store, 'Alpha');
    addChild(created.store, first, 'Alpha child');
    expect((await created.store.save()).ok).toBe(true);
    addTopLevel(created.store, 'Beta');
    expect((await created.store.save()).ok).toBe(true);
    const beforeCorruption = currentDocument(created.store);
    const documentPath = path.join(created.packagePath, 'document.json');
    await created.store.close();

    const corruptBytes = Buffer.from('{ "schemaVersion": 1, "id": "truncated"', 'utf8');
    await fs.writeFile(documentPath, corruptBytes);

    const opened = await openDocumentPackage(created.packagePath, options());
    stores.push(opened.store);
    expect(opened.status).toBe('read-only');
    expect(opened.readOnlyReason).toBe('corrupt');
    expect(opened.document).toBeNull();
    expect(opened.errors[0]?.code).toBe('malformed-json');
    const blockedSave = await opened.store.save();
    expect(blockedSave.ok).toBe(false);
    if (!blockedSave.ok) expect(blockedSave.error.code).toBe('read-only');

    const candidates = await inspectRecoveryCandidates(created.packagePath, {
      appSupportDir: appSupport,
    });
    expect(candidates[candidates.length - 1]?.kind).toBe('canonical');
    expect(candidates[candidates.length - 1]?.valid).toBe(false);
    expect(candidates.some((candidate) => candidate.kind === 'autosave' && candidate.valid)).toBe(true);

    const recovery = await findNewestValidRecovery(created.packagePath, {
      appSupportDir: appSupport,
    });
    expect(recovery.status).toBe('found');
    if (recovery.status !== 'found') return;
    expect(recovery.candidate.valid).toBe(true);
    expect(recovery.document.blocks[first]?.label).toBe('Alpha');

    const restored = await restoreCandidateToPackage(
      recovery.candidate.path,
      path.join(library, 'recovered'),
      { assetsSourcePackagePath: created.packagePath },
    );
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    await expect(fs.readFile(path.join(restored.targetPackagePath, 'assets', 'asset-1.bin'), 'utf8')).resolves.toBe(
      'asset bytes',
    );
    const restoredOpening = await openDocumentPackage(restored.targetPackagePath, options({ mode: 'read' }));
    stores.push(restoredOpening.store);
    expect(restoredOpening.status).toBe('read-only');
    expect(restoredOpening.document).toEqual(recovery.document);
    expect(Object.keys(restoredOpening.document?.blocks ?? {})).toHaveLength(2);

    // The corrupt canonical file was never overwritten by recovery.
    const stillCorrupt = await fs.readFile(documentPath);
    expect(stillCorrupt.equals(corruptBytes)).toBe(true);
    void beforeCorruption;

    const overwriteBlocked = await restoreCandidateToPackage(
      recovery.candidate.path,
      created.packagePath,
    );
    expect(overwriteBlocked.ok).toBe(false);
    if (!overwriteBlocked.ok) expect(overwriteBlocked.error.code).toBe('recovery-failed');
  });
});

describe('schema and corruption safety', () => {
  it('opens a newer schema read-only and never writes it', async () => {
    const created = await createPackage('Future');
    addTopLevel(created.store, 'Block');
    expect((await created.store.save()).ok).toBe(true);
    await created.store.close();

    const documentPath = path.join(created.packagePath, 'document.json');
    const raw = JSON.parse(await fs.readFile(documentPath, 'utf8')) as Record<string, unknown>;
    raw['schemaVersion'] = 3;
    const futureBytes = Buffer.from(`${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    await fs.writeFile(documentPath, futureBytes);

    const opened = await openDocumentPackage(created.packagePath, options());
    stores.push(opened.store);
    expect(opened.status).toBe('read-only');
    expect(opened.readOnlyReason).toBe('newer-schema');
    expect(opened.document).toBeNull();
    expect(opened.errors[0]?.code).toBe('newer-schema');
    const save = await opened.store.save();
    expect(save.ok).toBe(false);
    if (!save.ok) expect(save.error.code).toBe('read-only');
    expect((await fs.readFile(documentPath)).equals(futureBytes)).toBe(true);
  });

  it('keeps unknown fields and nodes across save and reopen', async () => {
    const created = await createPackage('Unknown');
    const blockId = addTopLevel(created.store, 'Known');
    expect((await created.store.save()).ok).toBe(true);
    await created.store.close();

    const documentPath = path.join(created.packagePath, 'document.json');
    const raw = JSON.parse(await fs.readFile(documentPath, 'utf8')) as Document;
    raw['futureTop'] = { keep: true };
    const block = raw.blocks[blockId];
    if (block === undefined) throw new Error('missing block');
    block['futureBlock'] = 'keep-block';
    block.content.children?.push({
      type: 'futureNode',
      attrs: { answer: 42 },
      children: [{ type: 'futureLeaf', text: 'kept' }],
    });
    await fs.writeFile(documentPath, stringifyDocument(raw));

    const opened = await openDocumentPackage(created.packagePath, options());
    stores.push(opened.store);
    expect(opened.status).toBe('editable');
    expect(opened.document?.['futureTop']).toEqual({ keep: true });
    expect(opened.document?.blocks[blockId]?.['futureBlock']).toBe('keep-block');

    opened.store.apply({ type: 'document.rename', title: 'Unknown renamed' });
    expect((await opened.store.save()).ok).toBe(true);
    await opened.store.close();

    const reopened = await openDocumentPackage(created.packagePath, options({ mode: 'read' }));
    stores.push(reopened.store);
    expect(reopened.document?.['futureTop']).toEqual({ keep: true });
    expect(reopened.document?.blocks[blockId]?.['futureBlock']).toBe('keep-block');
    const nodes = reopened.document?.blocks[blockId]?.content.children ?? [];
    expect(nodes[nodes.length - 1]?.type).toBe('futureNode');
  });
});

describe('single-writer lock', () => {
  it('allows concurrent readers but only one writer, releasing on close', async () => {
    const created = await createPackage('Locked');
    const lockPath = lockPathForPackage(created.packagePath, appSupport);
    await expect(fs.access(lockPath)).resolves.toBeUndefined();

    const second = await openDocumentPackage(created.packagePath, options());
    stores.push(second.store);
    expect(second.status).toBe('read-only');
    expect(second.readOnlyReason).toBe('locked');
    expect(second.document).not.toBeNull();
    const rejectedApply = second.store.apply({ type: 'document.rename', title: 'Hijack' });
    expect(rejectedApply.ok).toBe(false);
    if (!rejectedApply.ok) expect(rejectedApply.code).toBe('read-only');
    const rejectedSave = await second.store.save();
    expect(rejectedSave.ok).toBe(false);

    const readers = await Promise.all(
      [0, 1, 2].map(() => openDocumentPackage(created.packagePath, options({ mode: 'read' }))),
    );
    for (const reader of readers) {
      stores.push(reader.store);
      expect(reader.status).toBe('read-only');
      expect(reader.readOnlyReason).toBe('requested');
      expect(reader.document).not.toBeNull();
    }

    await created.store.close();
    await expect(fs.access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const reopened = await openDocumentPackage(created.packagePath, options());
    stores.push(reopened.store);
    expect(reopened.status).toBe('editable');
  });

  it('requires explicit stale-lock recovery', async () => {
    const created = await createPackage('Stale');
    await created.store.close();
    const lockPath = lockPathForPackage(created.packagePath, appSupport);
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      `${JSON.stringify(
        {
          version: 1,
          documentPath: created.packagePath,
          pid: 2_147_483_647,
          host: os.hostname(),
          sessionId: 'dead-session',
          token: 'dead-token',
          acquiredAt: '2020-01-01T00:00:00.000Z',
          heartbeatAt: '2020-01-01T00:00:00.000Z',
        },
        null,
        2,
      )}\n`,
    );

    const blocked = await openDocumentPackage(created.packagePath, options());
    stores.push(blocked.store);
    expect(blocked.status).toBe('read-only');
    expect(blocked.readOnlyReason).toBe('stale-lock');
    expect(blocked.errors[0]?.code).toBe('stale-lock');
    expect(blocked.store.lockInfo?.corrupt).toBe(false);
    expect(blocked.store.lockInfo?.record).toMatchObject({
      pid: 2_147_483_647,
      host: os.hostname(),
      sessionId: 'dead-session',
    });

    const recovered = await openDocumentPackage(
      created.packagePath,
      options({ breakStaleLock: true }),
    );
    stores.push(recovered.store);
    expect(recovered.status).toBe('editable');
    await recovered.store.close();
    await expect(fs.access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('creates over a freed folder name with a stale lock and stays editable', async () => {
    const created = await createPackage('Reused Name');
    const freedPath = created.packagePath;
    await created.store.close();
    const lockPath = lockPathForPackage(freedPath, appSupport);
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      `${JSON.stringify(
        {
          version: 1,
          documentPath: freedPath,
          pid: 2_147_483_647,
          host: os.hostname(),
          sessionId: 'deleted-package-session',
          token: 'stale-token',
          acquiredAt: '2020-01-01T00:00:00.000Z',
          heartbeatAt: '2020-01-01T00:00:00.000Z',
        },
        null,
        2,
      )}\n`,
    );
    // The package was deleted but its lock survived; the name is free again.
    await fs.rm(freedPath, { recursive: true, force: true });

    const reused = await createDocumentPackage(
      library,
      { title: 'Reused Name' },
      options(),
    );
    expect(reused.ok).toBe(true);
    if (!reused.ok) return;
    stores.push(reused.store);
    expect(reused.packagePath).toBe(freedPath);
    expect(reused.store.readOnly).toBe(false);

    // The new store owns a live lock and accepts an edit and a save.
    const renamed = reused.store.apply({ type: 'document.rename', title: 'Reused and edited' });
    expect(renamed.ok).toBe(true);
    expect((await reused.store.save()).ok).toBe(true);
    const record = JSON.parse(await fs.readFile(lockPath, 'utf8')) as {
      token: string;
      documentPath: string;
    };
    expect(record.token).not.toBe('stale-token');
    expect(record.documentPath).toBe(freedPath);
  });

  it('still refuses to create over a live lock on a freed folder name', async () => {
    const created = await createPackage('Live Name');
    const freedPath = created.packagePath;
    await created.store.close();
    const lockPath = lockPathForPackage(freedPath, appSupport);
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.writeFile(
      lockPath,
      `${JSON.stringify(
        {
          version: 1,
          documentPath: freedPath,
          pid: process.pid,
          host: os.hostname(),
          sessionId: 'live-session',
          token: 'live-token',
          acquiredAt: new Date().toISOString(),
          heartbeatAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
    await fs.rm(freedPath, { recursive: true, force: true });

    const blocked = await createDocumentPackage(
      library,
      { title: 'Live Name' },
      options(),
    );
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe('document-locked');
    // The failed creation removes the folder it made and leaves the lock alone.
    await expect(fs.access(freedPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((JSON.parse(await fs.readFile(lockPath, 'utf8')) as { token: string }).token).toBe(
      'live-token',
    );
  });
});

describe('external modification detection', () => {
  it('refuses to overwrite externally changed bytes unless forced', async () => {
    const created = await createPackage('External');
    addTopLevel(created.store, 'Local');
    expect((await created.store.save()).ok).toBe(true);

    const external = currentDocument(created.store);
    const externalCopy = structuredClone(external);
    externalCopy.title = 'External title';
    const documentPath = path.join(created.packagePath, 'document.json');
    const externalBytes = Buffer.from(stringifyDocument(externalCopy), 'utf8');
    await fs.writeFile(documentPath, externalBytes);

    created.store.apply({ type: 'document.rename', title: 'Local title' });
    const conflict = await created.store.save();
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe('external-modification');
    expect((await fs.readFile(documentPath)).equals(externalBytes)).toBe(true);

    const forced = await created.store.save({ overwriteExternal: true });
    expect(forced.ok).toBe(true);
    const disk = JSON.parse(await fs.readFile(documentPath, 'utf8')) as Document;
    expect(disk.title).toBe('Local title');

    // The forced write becomes the new baseline: the next normal save must not
    // report the same external modification again.
    created.store.apply({ type: 'document.rename', title: 'After overwrite' });
    const next = await created.store.save();
    expect(next.ok).toBe(true);
    const nextDisk = JSON.parse(await fs.readFile(documentPath, 'utf8')) as Document;
    expect(nextDisk.title).toBe('After overwrite');
  });
});

describe('recent documents manifest', () => {
  it('records, deduplicates, limits, and recovers from corruption', async () => {
    const created = await createDocumentPackage(
      library,
      { title: 'Recent One' },
      options({ registerRecent: true, recentLimit: 2 }),
    );
    if (!created.ok) throw new Error(created.error.message);
    stores.push(created.store);

    const second = await createDocumentPackage(
      library,
      { title: 'Recent Two' },
      options({ registerRecent: true, recentLimit: 2 }),
    );
    if (!second.ok) throw new Error(second.error.message);
    stores.push(second.store);

    let recent = await readRecentDocuments(appSupport);
    expect(recent.manifest.items).toHaveLength(2);
    expect(recent.manifest.items[0]?.path).toBe(second.packagePath);

    await recordRecentDocument(
      { documentId: created.document.id, title: 'Recent One', path: created.packagePath },
      { appSupportDir: appSupport, limit: 2 },
    );
    recent = await readRecentDocuments(appSupport);
    expect(recent.manifest.items).toHaveLength(2);
    expect(recent.manifest.items[0]?.path).toBe(created.packagePath);
    expect(new Set(recent.manifest.items.map((item) => item.path)).size).toBe(2);

    await removeRecentDocument(second.packagePath, appSupport);
    recent = await readRecentDocuments(appSupport);
    expect(recent.manifest.items).toHaveLength(1);

    const manifestPath = path.join(appSupport, 'recent-documents.json');
    await fs.writeFile(manifestPath, '{ broken');
    recent = await readRecentDocuments(appSupport);
    expect(recent.manifest.items).toEqual([]);
    expect(recent.warnings[0]).toContain('corrupt');
  });
});

describe('300-block performance', () => {
  it('saves and reloads 300 blocks with reported timings', async () => {
    const created = await createPackage('Large document');
    const chapterId = currentDocument(created.store).chapters[0]?.id ?? '';
    let firstBlockId = '';
    for (let index = 0; index < 300; index += 1) {
      const result = created.store.apply({
        type: 'block.create',
        label: `Block ${index}`,
        content: textContent(`Paragraph body for block ${index} with a little more text.`),
        placement: { kind: 'top-level', chapterId, atIndex: index },
      });
      if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
      if (index === 0) {
        const id = result.affected.blockIds.find((blockId) => blockId in result.document.blocks);
        firstBlockId = id ?? '';
      }
    }
    for (let index = 0; index < 20; index += 1) {
      const result = created.store.apply({
        type: 'block.create',
        label: `Child ${index}`,
        content: textContent(`Child body ${index}`),
        placement: { kind: 'child', parentBlockId: firstBlockId },
      });
      if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    }
    expect(Object.keys(currentDocument(created.store).blocks)).toHaveLength(320);

    const saveStarted = performance.now();
    const save = await created.store.save();
    const saveMs = performance.now() - saveStarted;
    expect(save.ok).toBe(true);

    await created.store.close();
    const coldStarted = performance.now();
    const cold = await openDocumentPackage(created.packagePath, options({ mode: 'read' }));
    const coldMs = performance.now() - coldStarted;
    stores.push(cold.store);
    expect(cold.status).toBe('read-only');
    expect(Object.keys(cold.document?.blocks ?? {})).toHaveLength(320);

    const warmStarted = performance.now();
    const warm = await openDocumentPackage(created.packagePath, options({ mode: 'read' }));
    const warmMs = performance.now() - warmStarted;
    stores.push(warm.store);

    // eslint-disable-next-line no-console
    console.log(
      `[core perf] 320 blocks: save ${saveMs.toFixed(1)} ms, cold load ${coldMs.toFixed(1)} ms, warm load ${warmMs.toFixed(1)} ms`,
    );
    expect(saveMs).toBeLessThan(5000);
    expect(coldMs).toBeLessThan(5000);
    expect(warmMs).toBeLessThan(5000);
  });
});

describe('typed failures', () => {
  it('rejects a missing package without creating files', async () => {
    const missing = path.join(root, 'nope');
    const opened = await openDocumentPackage(missing, options());
    stores.push(opened.store);
    expect(opened.status).toBe('read-only');
    expect(opened.readOnlyReason).toBe('missing');
    expect(opened.document).toBeNull();
    expect(opened.errors[0]?.code).toBe('not-found');
    await expect(fs.access(missing)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects mutations and saves after close', async () => {
    const created = await createPackage('Closed');
    await created.store.close();
    expect(created.store.closed).toBe(true);
    const mutation = created.store.apply({ type: 'document.rename', title: 'Nope' });
    expect(mutation.ok).toBe(false);
    if (!mutation.ok) expect(mutation.code).toBe('read-only');
    const saved = await created.store.save();
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.error.code).toBe('read-only');
  });

  it('rejects an invalid document without overwriting it', async () => {
    const created = await createPackage('Invalid');
    await created.store.close();
    const documentPath = path.join(created.packagePath, 'document.json');
    const raw = JSON.parse(await fs.readFile(documentPath, 'utf8')) as Document;
    raw.blocks['b-missing'] = {
      id: 'b-missing',
      content: { type: 'doc', children: [] },
    };
    delete raw.blocks['b-missing'];
    const chapter = raw.chapters[0];
    if (chapter !== undefined) chapter.topLevelBlockIds.push('missing-block');
    const invalidBytes = Buffer.from(stringifyDocument(raw), 'utf8');
    await fs.writeFile(documentPath, invalidBytes);

    const opened = await openDocumentPackage(created.packagePath, options());
    stores.push(opened.store);
    expect(opened.status).toBe('read-only');
    expect(opened.readOnlyReason).toBe('invalid');
    expect(opened.document).toBeNull();
    expect(opened.errors[0]?.code).toBe('invalid-document');
    expect(opened.errors[0]?.issues?.length).toBeGreaterThan(0);
    expect((await fs.readFile(documentPath)).equals(invalidBytes)).toBe(true);
  });
});
