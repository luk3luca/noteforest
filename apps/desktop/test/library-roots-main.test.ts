import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeAllStores } from '../src/main/library';
import {
  activeLibraryPath,
  createDocument,
  createLibraryRoot,
  isInsideKnownLibrary,
  locateLibraryRoot,
  openLibraryPath,
  readSession,
  removeRecentLibraryRoot,
  scanLibrary,
  switchLibraryRoot,
  writeSession,
} from '../src/main/library';
import { readLibraryRoots, writeLibraryRoots } from '../src/main/library-roots';

let root = '';
let libraryA = '';
let support = '';
let previousLibrary: string | undefined;
let previousSupport: string | undefined;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-library-main-'));
  libraryA = path.join(root, 'Library A');
  support = path.join(root, 'support');
  await fs.mkdir(support, { recursive: true });
  previousLibrary = process.env['NOTEFOREST_LIBRARY'];
  previousSupport = process.env['NOTEFOREST_APP_SUPPORT'];
  process.env['NOTEFOREST_LIBRARY'] = libraryA;
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

describe('active library roots', () => {
  it('creates and records the seed library on first run', async () => {
    expect(await activeLibraryPath()).toBe(path.resolve(libraryA));
    expect((await fs.stat(libraryA)).isDirectory()).toBe(true);

    const roots = await readLibraryRoots(support);
    expect(roots.libraries.map((entry) => entry.path)).toEqual([path.resolve(libraryA)]);

    const view = await scanLibrary();
    expect(view).toMatchObject({
      libraryPath: path.resolve(libraryA),
      libraryName: 'Library A',
      missing: false,
      documents: [],
    });
    expect(view.libraries).toHaveLength(1);
    expect(view.libraries[0]).toMatchObject({ active: true, missing: false });
    expect(await isInsideKnownLibrary(path.join(libraryA, 'note', 'document.json'))).toBe(true);
    expect(await isInsideKnownLibrary(path.join(root, 'elsewhere'))).toBe(false);
  });

  it('opens, creates in, switches, and removes recents without deleting files', async () => {
    await activeLibraryPath();
    const libraryB = path.join(root, 'Library B');
    await fs.mkdir(libraryB, { recursive: true });

    const opened = await openLibraryPath(libraryB);
    expect(opened.ok).toBe(true);
    expect((await activeLibraryPath())).toBe(path.resolve(libraryB));

    const created = await createDocument({ title: 'B note' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.snapshot.packagePath.startsWith(path.resolve(libraryB))).toBe(true);
    expect(created.library.documents).toHaveLength(1);

    const switched = await switchLibraryRoot(libraryA);
    expect(switched.ok).toBe(true);
    expect((await activeLibraryPath())).toBe(path.resolve(libraryA));

    const removedB = await removeRecentLibraryRoot(libraryB);
    expect(removedB.ok).toBe(true);
    expect((await readLibraryRoots(support)).libraries.map((entry) => entry.path)).toEqual([
      path.resolve(libraryA),
    ]);
    expect((await fs.stat(libraryB)).isDirectory()).toBe(true);

    const removedActive = await removeRecentLibraryRoot(libraryA);
    expect(removedActive.ok).toBe(true);
    expect((await activeLibraryPath())).toBeNull();
    const empty = await scanLibrary();
    expect(empty).toMatchObject({ libraryPath: '', documents: [], libraries: [] });
    expect((await fs.stat(libraryA)).isDirectory()).toBe(true);
    const createWithoutLibrary = await createDocument({ title: 'Nowhere' });
    expect(createWithoutLibrary.ok).toBe(false);
  });

  it('never recreates a stored missing library', async () => {
    const missing = path.join(root, 'Missing library');
    await writeLibraryRoots(support, [
      { path: missing, lastOpenedAt: '2026-11-13T08:00:00.000Z' },
    ]);
    await writeSession({
      tabs: [],
      activeTab: null,
      sidebarCollapsed: false,
      sidebarWidth: 264,
      collapsedTopics: {},
      sidebarTab: 'library',
      activeLibrary: missing,
    });

    expect(await activeLibraryPath()).toBe(path.resolve(missing));
    const view = await scanLibrary();
    expect(view.missing).toBe(true);
    expect(view.documents).toEqual([]);
    await expect(fs.stat(missing)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('locates a moved library and reconciles an open tab by document id', async () => {
    await activeLibraryPath();
    const created = await createDocument({ title: 'Moved note' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const documentId = created.snapshot.document.id;
    const oldPath = created.snapshot.packagePath;
    await closeAllStores();

    const movedRoot = path.join(root, 'Library A moved');
    await fs.rename(libraryA, movedRoot);
    const movedPath = path.join(movedRoot, path.basename(oldPath));
    await writeSession({
      tabs: [
        {
          packagePath: oldPath,
          documentId,
          scrollTop: 0,
          selectedBlockId: null,
          collapsed: [],
        },
      ],
      activeTab: oldPath,
      sidebarCollapsed: false,
      sidebarWidth: 264,
      collapsedTopics: {},
      sidebarTab: 'outline',
      activeLibrary: libraryA,
    });

    const located = await locateLibraryRoot(libraryA, movedRoot);
    expect(located.ok).toBe(true);
    if (!located.ok) return;
    expect(located.library.libraryPath).toBe(path.resolve(movedRoot));
    expect(located.reconciledTabs).toEqual([
      { from: oldPath, to: movedPath, documentId },
    ]);
    expect((await activeLibraryPath())).toBe(path.resolve(movedRoot));
    const session = await readSession();
    expect(session.tabs[0]?.packagePath).toBe(movedPath);
    expect(session.activeLibrary).toBe(path.resolve(movedRoot));
  });

  it('rejects a package root and a nested library, but creates a sibling library', async () => {
    await activeLibraryPath();
    const packageRoot = path.join(root, 'package');
    await fs.mkdir(packageRoot, { recursive: true });
    await fs.writeFile(path.join(packageRoot, 'document.json'), '{}');
    const packageResult = await openLibraryPath(packageRoot);
    expect(packageResult.ok).toBe(false);
    if (!packageResult.ok) expect(packageResult.message).toMatch(/document, not a library/);

    const nested = path.join(libraryA, 'nested');
    await fs.mkdir(nested, { recursive: true });
    const nestedResult = await openLibraryPath(nested);
    expect(nestedResult.ok).toBe(false);
    if (!nestedResult.ok) expect(nestedResult.message).toMatch(/inside the library/);

    const nestedCreate = await createLibraryRoot({ name: 'Nested', parentPath: libraryA });
    expect(nestedCreate.ok).toBe(false);

    const sibling = await createLibraryRoot({ name: 'Sibling', parentPath: root });
    expect(sibling.ok).toBe(true);
    expect((await fs.stat(path.join(root, 'Sibling'))).isDirectory()).toBe(true);
  });

  it('dedupes recents by realpath and keeps the path the user chose', async () => {
    await activeLibraryPath();
    const link = path.join(root, 'Library A link');
    await fs.symlink(libraryA, link, 'dir');

    const opened = await openLibraryPath(link);
    expect(opened.ok).toBe(true);
    const roots = await readLibraryRoots(support);
    expect(roots.libraries).toHaveLength(1);
    expect(roots.libraries[0]?.path).toBe(path.resolve(link));
    expect(await activeLibraryPath()).toBe(path.resolve(link));
  });
});
