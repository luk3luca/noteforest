import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activeLibraryPath,
  applyCommand,
  closeAllStores,
  closeDocument,
  createDocument,
  createVaultFolder,
  dirtyDocuments,
  moveVaultEntry,
  readSession,
  refreshLibrary,
  renameVaultFolder,
  saveDocumentSettings,
  scanLibrary,
  trashDocument,
  trashPreflight,
  writeSession,
} from '../src/main/library';
import {
  lockPathForPackage,
  readRecentDocuments,
  writeFileAtomic,
} from '@noteforest/core/node';
import { markdownBackupPaths } from '../src/main/markdown-backup';
import type { SessionState, VaultActionResult } from '../src/shared/api';

let root = '';
let library = '';
let support = '';
let trashRoot = '';
let previousLibrary: string | undefined;
let previousSupport: string | undefined;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-vault-main-'));
  library = path.join(root, 'library');
  support = path.join(root, 'support');
  trashRoot = path.join(root, 'trash');
  await fs.mkdir(library, { recursive: true });
  await fs.mkdir(support, { recursive: true });
  await fs.mkdir(trashRoot, { recursive: true });
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

async function createNote(title: string, close = true): Promise<string> {
  const created = await createDocument({ title });
  if (!created.ok) throw new Error(created.message);
  const packagePath = created.snapshot.packagePath;
  if (close) await closeDocument(packagePath, { save: true });
  return packagePath;
}

function success(result: VaultActionResult): Extract<VaultActionResult, { ok: true }> {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

function emptySession(activeLibrary: string): SessionState {
  return {
    tabs: [],
    activeTab: null,
    sidebarCollapsed: false,
    sidebarWidth: 264,
    collapsedTopics: {},
    sidebarTab: 'library',
    expandedLibraryFolders: [],
    activeLibrary,
  };
}

/**
 * A live lock owned by another session: a valid record with this process's pid
 * (alive) and a current heartbeat, written by a session this process does not
 * hold.
 */
async function writeLiveLock(packagePath: string): Promise<void> {
  const now = new Date().toISOString();
  const record = {
    version: 1,
    documentPath: path.join(packagePath, 'document.json'),
    pid: process.pid,
    host: os.hostname(),
    sessionId: 'vault-live-lock',
    token: 'other-session-token',
    acquiredAt: now,
    heartbeatAt: now,
  };
  await writeFileAtomic(
    lockPathForPackage(packagePath, support),
    `${JSON.stringify(record, null, 2)}\n`,
  );
}

/** A fake OS Trash: the folder/file is moved, never deleted. */
async function trashItem(target: string): Promise<void> {
  const destination = path.join(trashRoot, `${Date.now()}-${path.basename(target)}`);
  await fs.rename(target, destination);
}

describe('vault folders', () => {
  it('creates nested and empty folders and keeps them in the tree', async () => {
    await activeLibraryPath();
    const parent = path.join(library, 'Università');
    await fs.mkdir(parent);

    const nested = success(
      await createVaultFolder({ parentPath: parent, name: 'Analisi' }),
    );
    expect((await fs.stat(path.join(parent, 'Analisi'))).isDirectory()).toBe(true);
    expect(nested.library.tree).toMatchObject([
      {
        kind: 'folder',
        name: 'Università',
        children: [{ kind: 'folder', name: 'Analisi', children: [] }],
      },
    ]);

    // An empty folder survives a fresh scan.
    const rescan = await scanLibrary(undefined, { force: true });
    expect(rescan.tree).toMatchObject([
      { kind: 'folder', name: 'Università', children: [{ name: 'Analisi' }] },
    ]);
  });

  it('rejects invalid names, duplicates, and paths outside the library', async () => {
    await activeLibraryPath();
    const parent = path.join(library, 'note');
    await fs.mkdir(parent);

    await expect(createVaultFolder({ parentPath: parent, name: '  ' })).resolves.toMatchObject({
      ok: false,
      code: 'invalid-name',
    });
    await expect(createVaultFolder({ parentPath: parent, name: '..' })).resolves.toMatchObject({
      ok: false,
      code: 'invalid-name',
    });
    await expect(createVaultFolder({ parentPath: parent, name: 'a/b' })).resolves.toMatchObject({
      ok: false,
      code: 'invalid-name',
    });
    await expect(createVaultFolder({ parentPath: parent, name: '.hidden' })).resolves.toMatchObject({
      ok: false,
      code: 'invalid-name',
    });
    await expect(createVaultFolder({ parentPath: parent, name: 'x.assets' })).resolves.toMatchObject({
      ok: false,
      code: 'invalid-name',
    });
    await expect(createVaultFolder({ parentPath: parent, name: 'notes.md' })).resolves.toMatchObject({
      ok: false,
      code: 'invalid-name',
    });
    await expect(createVaultFolder({ parentPath: root, name: 'outside' })).resolves.toMatchObject({
      ok: false,
      code: 'outside-library',
    });

    success(await createVaultFolder({ parentPath: parent, name: 'Chapters' }));
    await expect(
      createVaultFolder({ parentPath: parent, name: 'Chapters' }),
    ).resolves.toMatchObject({ ok: false, code: 'exists' });
  });

  it('renames a folder, keeps its notes, and remaps session and settings paths', async () => {
    await activeLibraryPath();
    const folder = path.join(library, 'Old name');
    await fs.mkdir(folder);
    const packagePath = await createNote('Moved by rename');
    await fs.rename(packagePath, path.join(folder, 'moved-by-rename'));
    const insidePackage = path.join(folder, 'moved-by-rename');
    const documentId = (await scanLibrary(undefined, { force: true })).documents[0]?.documentId;
    expect(documentId).toBeTruthy();

    await writeSession({
      ...emptySession(library),
      tabs: [
        {
          packagePath: insidePackage,
          documentId: documentId ?? undefined,
          scrollTop: 0,
          selectedBlockId: null,
          collapsed: [],
        },
      ],
      activeTab: insidePackage,
      expandedLibraryFolders: ['Old name'],
    });
    expect(
      await saveDocumentSettings({
        documentId,
        packagePath: insidePackage,
        page: { theme: { preset: 'comfortable' } },
      }),
    ).toMatchObject({ ok: true });

    const renamed = success(await renameVaultFolder(folder, 'New name'));
    const newPackage = path.join(library, 'New name', 'moved-by-rename');
    expect((await fs.stat(path.join(library, 'New name'))).isDirectory()).toBe(true);
    expect(renamed.library.documents.some((row) => row.packagePath === newPackage)).toBe(true);

    const session = await readSession();
    expect(session.tabs[0]?.packagePath).toBe(newPackage);
    expect(session.activeTab).toBe(newPackage);
    expect(session.expandedLibraryFolders).toEqual(['New name']);

    const settings = JSON.parse(
      await fs.readFile(path.join(support, 'document-settings.json'), 'utf8'),
    ) as { entries: Array<{ documentId: string | null; packagePath: string }> };
    expect(settings.entries).toMatchObject([
      { documentId, packagePath: newPackage },
    ]);
  });

  it('refuses to create inside a note package and allows a case-only rename', async () => {
    await activeLibraryPath();
    const packagePath = await createNote('A note');
    await expect(
      createVaultFolder({ parentPath: packagePath, name: 'Inside' }),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-target' });
    expect(await fs.readdir(packagePath)).not.toContain('Inside');

    const folder = path.join(library, 'Personale');
    await fs.mkdir(folder);
    const renamed = await renameVaultFolder(folder, 'personale');
    expect(renamed.ok).toBe(true);
    const entries = await fs.readdir(library);
    expect(entries).toContain('personale');
    expect(entries).not.toContain('Personale');
  });

  it('refuses to rename a note package or the library root', async () => {
    await activeLibraryPath();
    const packagePath = await createNote('A note');
    await expect(renameVaultFolder(packagePath, 'Renamed')).resolves.toMatchObject({
      ok: false,
      code: 'invalid-target',
    });
    await expect(renameVaultFolder(library, 'Renamed')).resolves.toMatchObject({
      ok: false,
      code: 'library-root',
    });
  });
});

describe('vault moves', () => {
  it('moves a note into a folder and follows session, recents, and settings', async () => {
    await activeLibraryPath();
    const target = path.join(library, 'Target');
    await fs.mkdir(target);
    const packagePath = await createNote('Move me');
    const summary = (await scanLibrary(undefined, { force: true })).documents.find(
      (row) => row.packagePath === packagePath,
    );
    expect(summary?.documentId).toBeTruthy();
    await writeSession({
      ...emptySession(library),
      tabs: [
        {
          packagePath,
          documentId: summary?.documentId ?? undefined,
          scrollTop: 0,
          selectedBlockId: null,
          collapsed: [],
        },
      ],
      activeTab: packagePath,
    });
    expect(
      await saveDocumentSettings({
        documentId: summary?.documentId,
        packagePath,
        page: { theme: { preset: 'comfortable' } },
      }),
    ).toMatchObject({ ok: true });

    const moved = success(await moveVaultEntry({ sourcePath: packagePath, targetFolderPath: target }));
    const newPath = path.join(target, path.basename(packagePath));
    expect((await fs.stat(newPath)).isDirectory()).toBe(true);
    await expect(fs.stat(packagePath)).rejects.toThrow();
    expect(moved.moves).toEqual([
      { from: packagePath, to: newPath, kind: 'note', documentId: summary?.documentId },
    ]);
    expect(moved.library.documents.some((row) => row.packagePath === newPath)).toBe(true);

    const session = await readSession();
    expect(session.tabs[0]?.packagePath).toBe(newPath);
    expect(session.activeTab).toBe(newPath);
    const recents = await readRecentDocuments(support);
    expect(recents.manifest.items[0]?.path).toBe(newPath);
    const settings = JSON.parse(
      await fs.readFile(path.join(support, 'document-settings.json'), 'utf8'),
    ) as { entries: Array<{ packagePath: string }> };
    expect(settings.entries[0]?.packagePath).toBe(newPath);
  });

  it('moves a Markdown guest file by path with no settings entry', async () => {
    await activeLibraryPath();
    const target = path.join(library, 'Diario');
    await fs.mkdir(target);
    const file = path.join(library, 'note.md');
    await fs.writeFile(file, '# Note\n');
    await writeSession({
      ...emptySession(library),
      tabs: [
        { packagePath: file, scrollTop: 0, selectedBlockId: null, collapsed: [] },
      ],
      activeTab: file,
    });

    const moved = success(
      await moveVaultEntry({ sourcePath: file, targetFolderPath: target }),
    );
    const newPath = path.join(target, 'note.md');
    expect(await fs.readFile(newPath, 'utf8')).toBe('# Note\n');
    await expect(fs.stat(file)).rejects.toThrow();
    expect(moved.moves).toEqual([
      { from: file, to: newPath, kind: 'markdown', documentId: null },
    ]);
    expect((await readSession()).tabs[0]?.packagePath).toBe(newPath);
    await expect(fs.readFile(path.join(support, 'document-settings.json'), 'utf8')).rejects.toThrow();
    // The library ignores the app-support backup of a `.md` and any `.bak`.
    const backup = markdownBackupPaths(support, newPath);
    expect(backup.previous.startsWith(path.join(support, 'backups', 'markdown'))).toBe(true);
  });

  it('moves a folder with its descendants and reports every note path change', async () => {
    await activeLibraryPath();
    const target = path.join(library, 'Archive');
    await fs.mkdir(target);
    const folder = path.join(library, 'Università');
    await fs.mkdir(path.join(folder, 'Analisi'), { recursive: true });
    const packagePath = await createNote('Nested note');
    await fs.rename(packagePath, path.join(folder, 'Analisi', 'nested-note'));
    await fs.writeFile(path.join(folder, 'diario.md'), '# diario');

    const moved = success(
      await moveVaultEntry({ sourcePath: folder, targetFolderPath: target }),
    );
    const newFolder = path.join(target, 'Università');
    expect((await fs.stat(path.join(newFolder, 'Analisi', 'nested-note'))).isDirectory()).toBe(true);
    expect(await fs.readFile(path.join(newFolder, 'diario.md'), 'utf8')).toBe('# diario');
    const note = moved.moves.find((entry) => entry.kind === 'note');
    expect(note).toMatchObject({
      from: path.join(folder, 'Analisi', 'nested-note'),
      to: path.join(newFolder, 'Analisi', 'nested-note'),
    });
    const markdown = moved.moves.find((entry) => entry.kind === 'markdown');
    expect(markdown).toMatchObject({
      from: path.join(folder, 'diario.md'),
      to: path.join(newFolder, 'diario.md'),
    });
  });

  it('refuses a folder move into itself, an existing destination, and the root', async () => {
    await activeLibraryPath();
    const folder = path.join(library, 'Folder');
    const child = path.join(folder, 'Child');
    await fs.mkdir(child, { recursive: true });
    await expect(
      moveVaultEntry({ sourcePath: folder, targetFolderPath: child }),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-target' });
    await expect(
      moveVaultEntry({ sourcePath: library, targetFolderPath: child }),
    ).resolves.toMatchObject({ ok: false, code: 'library-root' });

    const sibling = path.join(library, 'Other');
    await fs.mkdir(sibling);
    await fs.mkdir(path.join(sibling, 'Child'));
    await expect(
      moveVaultEntry({ sourcePath: child, targetFolderPath: sibling }),
    ).resolves.toMatchObject({ ok: false, code: 'exists' });

    // A note package is never a destination folder.
    const packagePath = await createNote('Not a folder');
    await expect(
      moveVaultEntry({ sourcePath: child, targetFolderPath: packagePath }),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-target' });
  });

  it('refuses a live-locked or unsaved note and changes nothing', async () => {
    await activeLibraryPath();
    const target = path.join(library, 'Target');
    await fs.mkdir(target);

    // Unsaved: the store is open and dirty (a mutation that is not saved).
    const created = await createDocument({ title: 'Unsaved' });
    if (!created.ok) throw new Error(created.message);
    const unsaved = created.snapshot.packagePath;
    const chapterId = created.snapshot.document.chapters[0]?.id;
    expect(chapterId).toBeTruthy();
    expect(
      await applyCommand(unsaved, {
        type: 'block.create',
        placement: { kind: 'top-level', chapterId: chapterId ?? '' },
      }),
    ).toMatchObject({ ok: true });
    expect(dirtyDocuments().some((document) => document.packagePath === unsaved)).toBe(true);
    const moved = await moveVaultEntry({ sourcePath: unsaved, targetFolderPath: target });
    expect(moved).toMatchObject({ ok: false, code: 'unsaved' });
    expect((await fs.stat(unsaved)).isDirectory()).toBe(true);

    // Live lock from another session on a package this process does not hold.
    const locked = path.join(library, 'Locked');
    await fs.mkdir(locked);
    const lockedNote = await createNote('Locked note');
    await fs.rename(lockedNote, path.join(locked, 'locked-note'));
    const lockedPackage = path.join(locked, 'locked-note');
    await writeLiveLock(lockedPackage);
    const refused = await moveVaultEntry({ sourcePath: lockedPackage, targetFolderPath: target });
    expect(refused).toMatchObject({ ok: false, code: 'locked' });
    expect((await fs.stat(lockedPackage)).isDirectory()).toBe(true);
  });
});

describe('vault trash', () => {
  it('moves a plain folder to the OS Trash and cleans contained recents/session/settings', async () => {
    await activeLibraryPath();
    const folder = path.join(library, 'Graduated');
    await fs.mkdir(folder);
    const packagePath = await createNote('Contained note');
    await fs.rename(packagePath, path.join(folder, 'contained-note'));
    const contained = path.join(folder, 'contained-note');
    await fs.writeFile(path.join(folder, 'diario.md'), '# diario');
    const summary = (await scanLibrary(undefined, { force: true })).documents.find(
      (row) => row.packagePath === contained,
    );
    await writeSession({
      ...emptySession(library),
      tabs: [
        {
          packagePath: contained,
          documentId: summary?.documentId ?? undefined,
          scrollTop: 0,
          selectedBlockId: null,
          collapsed: [],
        },
        {
          packagePath: path.join(folder, 'diario.md'),
          scrollTop: 0,
          selectedBlockId: null,
          collapsed: [],
        },
      ],
      activeTab: contained,
      expandedLibraryFolders: ['Graduated'],
    });
    expect(
      await saveDocumentSettings({
        documentId: summary?.documentId,
        packagePath: contained,
        page: { theme: { preset: 'comfortable' } },
      }),
    ).toMatchObject({ ok: true });

    const preflight = await trashPreflight(folder);
    expect(preflight).toMatchObject({
      kind: 'folder',
      canTrash: true,
      contained: { notes: 1, folders: 0, markdown: 1 },
    });
    const result = await trashDocument(folder, trashItem);
    expect(result.ok).toBe(true);
    await expect(fs.stat(folder)).rejects.toThrow();
    expect((await fs.stat(path.join(trashRoot, (await fs.readdir(trashRoot))[0] ?? ''))).isDirectory()).toBe(true);

    const session = await readSession();
    expect(session.tabs).toEqual([]);
    expect(session.activeTab).toBeNull();
    expect(session.expandedLibraryFolders).toEqual([]);
    const recents = await readRecentDocuments(support);
    expect(recents.manifest.items.some((item) => item.path === contained)).toBe(false);
    const settings = JSON.parse(
      await fs.readFile(path.join(support, 'document-settings.json'), 'utf8'),
    ) as { entries: Array<{ packagePath: string }> };
    expect(settings.entries).toEqual([]);
  });

  it('never trashes the library root and refuses a live lock inside a folder', async () => {
    await activeLibraryPath();
    await expect(trashPreflight(library)).resolves.toMatchObject({ canTrash: false });
    const result = await trashDocument(library, trashItem);
    expect(result).toMatchObject({ ok: false, code: 'library-root' });
    expect((await fs.stat(library)).isDirectory()).toBe(true);

    const folder = path.join(library, 'Busy');
    const created = await createNote('Busy note');
    await fs.mkdir(folder);
    await fs.rename(created, path.join(folder, 'busy-note'));
    await writeLiveLock(path.join(folder, 'busy-note'));
    const preflight = await trashPreflight(folder);
    expect(preflight).toMatchObject({ kind: 'folder', canTrash: false, liveLock: true });
    await expect(trashDocument(folder, trashItem)).resolves.toMatchObject({
      ok: false,
      code: 'locked',
    });
    expect((await fs.stat(folder)).isDirectory()).toBe(true);
  });

  it('moves a Markdown guest file to the OS Trash and closes its session tab', async () => {
    await activeLibraryPath();
    const file = path.join(library, 'diario.md');
    await fs.writeFile(file, '# diario');
    await writeSession({
      ...emptySession(library),
      tabs: [{ packagePath: file, scrollTop: 0, selectedBlockId: null, collapsed: [] }],
      activeTab: file,
    });
    const preflight = await trashPreflight(file);
    expect(preflight).toMatchObject({ kind: 'markdown', canTrash: true });
    const result = await trashDocument(file, trashItem);
    expect(result.ok).toBe(true);
    await expect(fs.stat(file)).rejects.toThrow();
    expect((await readSession()).tabs).toEqual([]);
  });
});

describe('external moves', () => {
  it('reconciles an externally moved note on explicit refresh', async () => {
    await activeLibraryPath();
    const packagePath = await createNote('External move');
    const summary = (await scanLibrary(undefined, { force: true })).documents.find(
      (row) => row.packagePath === packagePath,
    );
    expect(summary?.documentId).toBeTruthy();
    await writeSession({
      ...emptySession(library),
      tabs: [
        {
          packagePath,
          documentId: summary?.documentId ?? undefined,
          scrollTop: 0,
          selectedBlockId: null,
          collapsed: [],
        },
      ],
      activeTab: packagePath,
    });

    const target = path.join(library, 'Moved elsewhere');
    await fs.mkdir(target);
    const newPath = path.join(target, path.basename(packagePath));
    await fs.rename(packagePath, newPath);

    const refreshed = await refreshLibrary();
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.reconciledTabs).toEqual([
      { from: packagePath, to: newPath, documentId: summary?.documentId },
    ]);
    expect(refreshed.library.documents.some((row) => row.packagePath === newPath)).toBe(true);
    const session = await readSession();
    expect(session.tabs[0]?.packagePath).toBe(newPath);
    expect(session.activeTab).toBe(newPath);
  });
});

describe('vault scan cache', () => {
  it('serves a cached scan until a mutation or an explicit refresh', async () => {
    await activeLibraryPath();
    const folder = path.join(library, 'Folder');
    await fs.mkdir(folder);
    const first = await scanLibrary();
    expect(first.tree).toMatchObject([{ kind: 'folder', name: 'Folder', children: [] }]);

    // A nested external change keeps the root mtime: the cache answers.
    await fs.writeFile(path.join(folder, 'external.md'), '# external');
    const second = await scanLibrary();
    expect(second.tree).toMatchObject([
      { kind: 'folder', name: 'Folder', children: [] },
    ]);

    // Explicit Refresh forces the filesystem.
    const refreshed = await refreshLibrary();
    expect(refreshed.ok).toBe(true);
    if (!refreshed.ok) return;
    expect(refreshed.library.tree).toMatchObject([
      { kind: 'folder', name: 'Folder', children: [{ kind: 'markdown', name: 'external.md' }] },
    ]);

    // A library mutation invalidates the cache.
    success(await createVaultFolder({ parentPath: folder, name: 'Inside' }));
    const afterMutation = await scanLibrary();
    expect(afterMutation.tree).toMatchObject([
      {
        kind: 'folder',
        name: 'Folder',
        children: [{ kind: 'folder', name: 'Inside' }, { kind: 'markdown' }],
      },
    ]);
  });
});
