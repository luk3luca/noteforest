import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  acquireDocumentLock,
  lockPathForPackage,
  type LockHandle,
} from '@noteforest/core/node';
import {
  activeLibraryPath,
  applyCommand,
  chooseDraftLibrary,
  closeAllStores,
  closeDocument,
  createDocument,
  createDraftSession,
  discardAllDraftSessions,
  draftSessionPaths,
  importImageBytes,
  materializeDraftSession,
  openDocument,
  openLibraryPath,
  readSession,
  removeMissingDocument,
  saveDocument,
  scanLibrary,
  trashDocument,
  trashPreflight,
  writeSession,
} from '../src/main/library';
import {
  readDocumentSettingsFile,
  writeDocumentSettingsFile,
} from '../src/main/document-settings';

/**
 * L3 draft sessions and L4 document management at the main-process boundary:
 * in-memory drafts write nothing, materialize once, and trash uses the injected
 * OS move (never a recursive delete) after the confirmation.
 */

let root = '';
let library = '';
let support = '';
let trashRoot = '';
let previousLibrary: string | undefined;
let previousSupport: string | undefined;
const locks: LockHandle[] = [];

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-draft-main-'));
  library = path.join(root, 'Library');
  support = path.join(root, 'support');
  trashRoot = path.join(root, 'Trash');
  await fs.mkdir(library, { recursive: true });
  await fs.mkdir(support, { recursive: true });
  await fs.mkdir(trashRoot, { recursive: true });
  previousLibrary = process.env['NOTEFOREST_LIBRARY'];
  previousSupport = process.env['NOTEFOREST_APP_SUPPORT'];
  process.env['NOTEFOREST_LIBRARY'] = library;
  process.env['NOTEFOREST_APP_SUPPORT'] = support;
});

afterEach(async () => {
  await discardAllDraftSessions();
  await closeAllStores();
  for (const lock of locks) await lock.release().catch(() => undefined);
  locks.length = 0;
  if (previousLibrary === undefined) delete process.env['NOTEFOREST_LIBRARY'];
  else process.env['NOTEFOREST_LIBRARY'] = previousLibrary;
  if (previousSupport === undefined) delete process.env['NOTEFOREST_APP_SUPPORT'];
  else process.env['NOTEFOREST_APP_SUPPORT'] = previousSupport;
  await fs.rm(root, { recursive: true, force: true });
});

async function entries(directory: string): Promise<string[]> {
  return (await fs.readdir(directory)).sort();
}

async function recentPaths(): Promise<string[]> {
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(support, 'recent-documents.json'), 'utf8'),
    ) as { items: Array<{ path: string }> };
    return raw.items.map((item) => item.path);
  } catch {
    return [];
  }
}

async function trashItem(target: string): Promise<void> {
  const destination = path.join(trashRoot, `${path.basename(target)}-${Date.now()}`);
  await fs.rename(target, destination);
}

async function liveLock(target: string): Promise<void> {
  const acquired = await acquireDocumentLock(target, { appSupportDir: support });
  if (!acquired.ok) throw new Error(acquired.message);
  locks.push(acquired.handle);
}

async function writeStaleLock(target: string): Promise<void> {
  const lockPath = lockPathForPackage(target, support);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(
    lockPath,
    JSON.stringify({
      version: 1,
      documentPath: path.resolve(target),
      pid: process.pid,
      host: os.hostname(),
      sessionId: 'stale-session',
      token: 'stale-token',
      acquiredAt: '2020-01-01T00:00:00.000Z',
      heartbeatAt: '2020-01-01T00:00:00.000Z',
    }),
  );
}

async function createPackage(title: string): Promise<string> {
  const created = await createDocument({ title });
  if (!created.ok) throw new Error(created.message);
  return created.snapshot.packagePath;
}

/** Give a second package the source package's document id (a copy). */
async function shareDocumentId(source: string, target: string): Promise<string> {
  const sourceDocument = JSON.parse(
    await fs.readFile(path.join(source, 'document.json'), 'utf8'),
  ) as { id: string };
  const targetPath = path.join(target, 'document.json');
  const targetDocument = JSON.parse(await fs.readFile(targetPath, 'utf8')) as { id: string };
  targetDocument.id = sourceDocument.id;
  await fs.writeFile(targetPath, `${JSON.stringify(targetDocument, null, 2)}\n`);
  return sourceDocument.id;
}

function sessionTab(packagePath: string, documentId: string) {
  return {
    packagePath,
    documentId,
    scrollTop: 0,
    selectedBlockId: null,
    collapsed: [],
  };
}

describe('draft sessions', () => {
  it('creates an in-memory draft with no folder, lock, or recent entry', async () => {
    await activeLibraryPath();
    const result = await createDraftSession();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { draft } = result;
    expect(draft.snapshot.packagePath).toBe(`draft:${draft.draftId}`);
    expect(draft.snapshot.status).toBe('editable');
    expect(draft.libraryPath).toBe(path.resolve(library));
    expect(Object.keys(draft.snapshot.document.blocks)).toHaveLength(1);
    expect(draft.snapshot.document.id.length).toBeGreaterThan(0);

    expect(await entries(library)).toEqual([]);
    expect(await recentPaths()).toEqual([]);
    await expect(fs.stat(path.join(support, 'locks'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    // The session may exist (first-run active library), but it never contains
    // a draft tab.
    expect((await readSession()).tabs).toEqual([]);

    // A plain save of an untouched draft writes nothing.
    const saved = await saveDocument(draft.snapshot.packagePath);
    expect(saved).toMatchObject({ ok: true, changed: false });
    expect(await entries(library)).toEqual([]);
  });

  it('materializes exactly once on the first command and keeps the document id', async () => {
    await activeLibraryPath();
    const created = await createDraftSession();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const draftKey = created.draft.snapshot.packagePath;
    const documentId = created.draft.snapshot.document.id;

    const blockId = Object.keys(created.draft.snapshot.document.blocks)[0] ?? '';
    const applied = await applyCommand(draftKey, {
      type: 'block.editContent',
      blockId,
      content: {
        type: 'doc',
        children: [{ type: 'paragraph', children: [{ type: 'text', text: 'First keystroke' }] }],
      },
    });
    expect(applied.ok).toBe(true);
    expect(typeof applied.packagePath).toBe('string');
    const packagePath = applied.packagePath ?? '';
    expect(await entries(library)).toEqual([path.basename(packagePath)]);
    expect(await recentPaths()).toEqual([packagePath]);

    const materialized = await materializeDraftSession(draftKey);
    expect(materialized.ok).toBe(true);
    if (materialized.ok) expect(materialized.packagePath).toBe(packagePath);
    expect(await entries(library)).toHaveLength(1);

    // A late command that still uses the draft key routes to the package.
    const again = await applyCommand(draftKey, {
      type: 'document.rename',
      title: 'Renamed later',
    });
    expect(again.ok).toBe(true);
    expect(again.packagePath).toBe(packagePath);
    expect(await entries(library)).toHaveLength(1);
    expect(await recentPaths()).toEqual([packagePath]);
    // The rename is in memory until a save; the file keeps the materialized
    // content and title, and the document id is already stable on disk.
    expect(JSON.parse(await fs.readFile(path.join(packagePath, 'document.json'), 'utf8')).id).toBe(
      documentId,
    );
    const saved = await saveDocument(packagePath);
    expect(saved.ok).toBe(true);
    const stored = JSON.parse(
      await fs.readFile(path.join(packagePath, 'document.json'), 'utf8'),
    ) as { title: string };
    expect(stored.title).toBe('Renamed later');
  });

  it('keeps an untouched draft when its library is missing, then materializes after a rebind', async () => {
    const firstLibrary = (await activeLibraryPath()) ?? '';
    const created = await createDraftSession();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const draftKey = created.draft.snapshot.packagePath;

    const missing = path.join(root, 'Gone library');
    await fs.rename(firstLibrary, missing);
    await fs.rm(missing, { recursive: true, force: true });
    const failed = await materializeDraftSession(draftKey);
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.code).toBe('library-missing');
    expect(draftSessionPaths()).toHaveLength(1);

    const otherLibrary = path.join(root, 'Other library');
    await fs.mkdir(otherLibrary, { recursive: true });
    const rebound = await chooseDraftLibrary(draftKey, otherLibrary);
    expect(rebound.ok).toBe(true);
    const retried = await materializeDraftSession(draftKey);
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.packagePath.startsWith(path.resolve(otherLibrary))).toBe(true);
  });

  it('breaks a stale lock, fails on a live lock, and still creates unique folders', async () => {
    await activeLibraryPath();
    // First draft takes "untitled"; a stale lock from a deleted package must not
    // block it.
    await writeStaleLock(path.join(library, 'untitled'));
    const first = await createDraftSession();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstMaterialized = await materializeDraftSession(first.draft.snapshot.packagePath);
    expect(firstMaterialized.ok).toBe(true);
    expect(
      await fs.readFile(lockPathForPackage(path.join(library, 'untitled'), support), 'utf8'),
    ).not.toContain('stale-token');

    // A live lock on the next free folder fails without opening a package.
    await liveLock(path.join(library, 'untitled-2'));
    const second = await createDraftSession();
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const blocked = await materializeDraftSession(second.draft.snapshot.packagePath);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe('locked');
    await expect(fs.stat(path.join(library, 'untitled-2'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    // The first draft is materialized but its record stays for late draft-key
    // routing; the blocked draft is still in memory and can retry.
    expect(draftSessionPaths().filter((entry) => entry.packagePath === null)).toHaveLength(1);

    // Release the simulated other session before the duplicate-title check.
    for (const lock of locks) await lock.release().catch(() => undefined);
    locks.length = 0;

    // Two clean drafts with the same title get distinct folders.
    const third = await createDraftSession();
    const fourth = await createDraftSession();
    expect(third.ok && fourth.ok).toBe(true);
    if (!third.ok || !fourth.ok) return;
    const a = await materializeDraftSession(third.draft.snapshot.packagePath);
    const b = await materializeDraftSession(fourth.draft.snapshot.packagePath);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.packagePath).not.toBe(b.packagePath);
  });

  it('discards a draft on close without writing', async () => {
    await activeLibraryPath();
    const created = await createDraftSession();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await closeDocument(created.draft.snapshot.packagePath, { save: false });
    expect(await entries(library)).toEqual([]);
    expect(await recentPaths()).toEqual([]);
    expect(draftSessionPaths()).toEqual([]);
  });

  it('keeps a draft bound to its creation library after a library switch', async () => {
    const libraryA = await activeLibraryPath();
    const created = await createDraftSession();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const draftKey = created.draft.snapshot.packagePath;

    const libraryB = path.join(root, 'Library B');
    await fs.mkdir(libraryB, { recursive: true });
    const opened = await openLibraryPath(libraryB);
    expect(opened.ok).toBe(true);
    expect(await activeLibraryPath()).toBe(path.resolve(libraryB));

    const materialized = await materializeDraftSession(draftKey);
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;
    expect(materialized.packagePath.startsWith(path.resolve(libraryA ?? ''))).toBe(true);
    const view = await scanLibrary(libraryA ?? undefined);
    expect(
      view.documents.some((document) => document.packagePath === materialized.packagePath),
    ).toBe(true);
    expect(await entries(libraryB)).toEqual([]);
  });

  it('materializes a draft before an image asset is written', async () => {
    await activeLibraryPath();
    const created = await createDraftSession();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const draftKey = created.draft.snapshot.packagePath;
    // 1×1 PNG, small enough to import without decoding concerns.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const imported = await importImageBytes(draftKey, {
      bytes: new Uint8Array(png),
      mime: 'image/png',
      originalName: 'pixel.png',
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const folders = await entries(library);
    expect(folders).toHaveLength(1);
    const packagePath = path.join(library, folders[0] ?? '');
    expect(await recentPaths()).toEqual([packagePath]);
    await expect(
      fs.stat(path.join(packagePath, 'assets', imported.asset.id)),
    ).resolves.toBeDefined();
    const materialized = await materializeDraftSession(draftKey);
    expect(materialized.ok).toBe(true);
    if (materialized.ok) expect(materialized.packagePath).toBe(packagePath);
  });
});

describe('Move to Trash', () => {
  it('moves one package to the injected OS Trash and cleans every reference', async () => {
    await activeLibraryPath();
    const packagePath = await createPackage('Trash me');
    const snapshot = await openDocument(packagePath);
    if ('ok' in snapshot || 'recovery' in snapshot) throw new Error('package did not open');
    const documentId = snapshot.document.id;

    await writeDocumentSettingsFile(support, [
      {
        documentId,
        packagePath,
        page: { setup: { orientation: 'landscape' } },
      },
    ]);
    await writeSession({
      tabs: [
        {
          packagePath,
          documentId,
          scrollTop: 0,
          selectedBlockId: null,
          collapsed: [],
        },
      ],
      activeTab: packagePath,
      sidebarCollapsed: false,
      sidebarWidth: 264,
      collapsedTopics: {},
      sidebarTab: 'library',
      activeLibrary: library,
    });
    await closeAllStores();

    const preflight = await trashPreflight(packagePath);
    expect(preflight).toMatchObject({
      status: 'ok',
      documentId,
      liveLock: false,
      canTrash: true,
      open: false,
    });

    const trashed: string[] = [];
    const result = await trashDocument(packagePath, async (target) => {
      trashed.push(target);
      await trashItem(target);
    });
    expect(result.ok).toBe(true);
    expect(trashed).toEqual([packagePath]);
    await expect(fs.stat(packagePath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await fs.stat(library)).isDirectory()).toBe(true);

    expect(await recentPaths()).toEqual([]);
    expect((await readDocumentSettingsFile(support)).entries).toEqual([]);
    const session = await readSession();
    expect(session.tabs).toEqual([]);
    expect(session.activeTab).toBeNull();
    const view = await scanLibrary();
    expect(view.documents).toEqual([]);
  });

  it('trashing one copy keeps the other copy override and session tab', async () => {
    await activeLibraryPath();
    const original = await createPackage('Original copy');
    const copy = await createPackage('Second copy');
    const sharedId = await shareDocumentId(original, copy);
    await closeAllStores();
    await writeDocumentSettingsFile(support, [
      {
        documentId: sharedId,
        packagePath: copy,
        page: { chrome: { pageNumber: false } },
      },
    ]);
    await writeSession({
      tabs: [sessionTab(original, sharedId), sessionTab(copy, sharedId)],
      activeTab: copy,
      sidebarCollapsed: false,
      sidebarWidth: 264,
      collapsedTopics: {},
      sidebarTab: 'library',
      activeLibrary: library,
    });

    const result = await trashDocument(original, trashItem);
    expect(result.ok).toBe(true);
    expect((await readDocumentSettingsFile(support)).entries).toEqual([
      {
        documentId: sharedId,
        packagePath: copy,
        page: { chrome: { pageNumber: false } },
      },
    ]);
    const session = await readSession();
    expect(session.tabs.map((tab) => tab.packagePath)).toEqual([copy]);
    expect(session.activeTab).toBe(copy);
    const view = await scanLibrary();
    expect(view.documents.map((document) => document.packagePath)).toEqual([copy]);
  });

  it('never reconciles a missing tab to one of two duplicate-id copies', async () => {
    await activeLibraryPath();
    const first = await createPackage('First duplicate');
    const second = await createPackage('Second duplicate');
    const sharedId = await shareDocumentId(first, second);
    await closeAllStores();
    const missing = path.join(library, 'moved-away');
    await writeSession({
      tabs: [sessionTab(missing, sharedId)],
      activeTab: missing,
      sidebarCollapsed: false,
      sidebarWidth: 264,
      collapsedTopics: {},
      sidebarTab: 'library',
      activeLibrary: library,
    });

    const opened = await openLibraryPath(library);
    expect(opened.ok).toBe(true);
    if (opened.ok) expect(opened.reconciledTabs ?? []).toEqual([]);
    const session = await readSession();
    expect(session.tabs[0]?.packagePath).toBe(missing);
  });

  it('refuses a live lock and leaves the package untouched', async () => {    await activeLibraryPath();
    const packagePath = await createPackage('Busy note');
    await closeAllStores();
    await liveLock(packagePath);

    const preflight = await trashPreflight(packagePath);
    expect(preflight).toMatchObject({ liveLock: true, canTrash: false });
    expect(preflight.reason).toMatch(/another NoteForest session/i);

    let called = false;
    const result = await trashDocument(packagePath, async () => {
      called = true;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('locked');
    expect(called).toBe(false);
    expect((await fs.stat(packagePath)).isDirectory()).toBe(true);
  });

  it('allows a stale lock after the explicit confirmation and clears it', async () => {
    await activeLibraryPath();
    const packagePath = await createPackage('Stale lock note');
    await closeAllStores();
    await writeStaleLock(packagePath);

    const preflight = await trashPreflight(packagePath);
    expect(preflight).toMatchObject({ liveLock: false, canTrash: true });
    expect(preflight.lock?.sessionId).toBe('stale-session');
    const result = await trashDocument(packagePath, trashItem);
    expect(result.ok).toBe(true);
    await expect(fs.stat(packagePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.stat(lockPathForPackage(packagePath, support))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('reports a newer-schema package so the dialog can warn', async () => {
    await activeLibraryPath();
    const packagePath = await createPackage('Future note');
    await closeAllStores();
    const jsonPath = path.join(packagePath, 'document.json');
    const onDisk = JSON.parse(await fs.readFile(jsonPath, 'utf8')) as {
      schemaVersion: number;
    };
    onDisk.schemaVersion = 999;
    await fs.writeFile(jsonPath, `${JSON.stringify(onDisk, null, 2)}\n`);

    const preflight = await trashPreflight(packagePath);
    expect(preflight).toMatchObject({
      status: 'newer-schema',
      canTrash: true,
      title: 'Future note',
    });
    const result = await trashDocument(packagePath, trashItem);
    expect(result.ok).toBe(true);
  });

  it('leaves the file untouched when the OS move fails', async () => {
    await activeLibraryPath();
    const packagePath = await createPackage('Survivor');
    await closeAllStores();
    const result = await trashDocument(packagePath, async () => {
      throw new Error('os trash unavailable');
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('trash-failed');
      expect(result.message).toMatch(/os trash unavailable/);
    }
    expect((await fs.stat(packagePath)).isDirectory()).toBe(true);
    expect(await recentPaths()).toEqual([packagePath]);
  });

  it('never trashes the library root itself', async () => {
    await activeLibraryPath();
    const preflight = await trashPreflight(library);
    expect(preflight.canTrash).toBe(false);
    expect(preflight.reason).toMatch(/library folder/i);
    let called = false;
    const result = await trashDocument(library, async () => {
      called = true;
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('library-root');
    expect(called).toBe(false);
    expect((await fs.stat(library)).isDirectory()).toBe(true);
  });

  it('refuses to trash a document with unsaved store changes', async () => {
    await activeLibraryPath();
    const packagePath = await createPackage('Dirty note');
    const opened = await openDocument(packagePath);
    if ('ok' in opened || 'recovery' in opened) throw new Error('package did not open');
    const blockId = Object.keys(opened.document.blocks)[0] ?? '';
    const applied = await applyCommand(packagePath, {
      type: 'block.editContent',
      blockId,
      content: {
        type: 'doc',
        children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Unsaved' }] }],
      },
    });
    expect(applied.ok).toBe(true);

    const result = await trashDocument(packagePath, trashItem);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unsaved');
    expect((await fs.stat(packagePath)).isDirectory()).toBe(true);
  });

  it('removes a missing package from recents without deleting its folder', async () => {
    await activeLibraryPath();
    const packagePath = await createPackage('Half gone');
    await closeAllStores();
    await fs.rm(path.join(packagePath, 'document.json'));

    const preflight = await trashPreflight(packagePath);
    expect(preflight).toMatchObject({ status: 'missing', canTrash: false });
    const trashResult = await trashDocument(packagePath, async () => undefined);
    expect(trashResult.ok).toBe(false);
    if (!trashResult.ok) expect(trashResult.code).toBe('not-found');

    const removed = await removeMissingDocument(packagePath);
    expect(removed.ok).toBe(true);
    expect(await recentPaths()).toEqual([]);
    expect((await fs.stat(packagePath)).isDirectory()).toBe(true);
  });
});
