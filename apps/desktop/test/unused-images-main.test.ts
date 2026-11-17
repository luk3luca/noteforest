/**
 * DR1b: the byte boundary for unused images.
 *
 * The renderer decides what is unused (plan, backup scan) and removes the
 * record with the guarded command. The main process owns the one destructive
 * filesystem step, and these tests pin the two rules the decision of 17
 * November 2026 names: the file goes to the **OS Trash** (never an unlink), and
 * only the content address inside this package's real `assets/` may move.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringifyDocument, type Asset, type Document } from '@noteforest/core';
import {
  BackupManager,
  backupsDirForPackage,
  createDocumentPackage,
  type TrashItem,
} from '@noteforest/core/node';
import { closeAllStores, assetIdsInBackups, trashUnusedImage } from '../src/main/library';
import { trashUnusedAsset, type UnusedAssetStore } from '../src/main/unused-images';

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22]);
const ID = createHash('sha256').update(BYTES).digest('hex');
const OTHER_ID = createHash('sha256').update(new Uint8Array([1, 2, 3])).digest('hex');

let root = '';
let library = '';
let support = '';
let previousLibrary: string | undefined;
let previousSupport: string | undefined;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-unused-images-'));
  library = path.join(root, 'library');
  support = path.join(root, 'support');
  await fs.mkdir(library, { recursive: true });
  await fs.mkdir(support, { recursive: true });
  await fs.mkdir(path.join(root, 'trash'), { recursive: true });
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

function record(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    path: `assets/${id}`,
    mime: 'image/png',
    bytes: BYTES.byteLength,
    originalName: 'diagram.png',
    ...overrides,
  };
}

async function createPackage(title: string): Promise<string> {
  const created = await createDocumentPackage(
    library,
    { title, chapterTitle: 'Chapter One' },
    { appSupportDir: support, registerRecent: false, heartbeatIntervalMs: 0 },
  );
  if (!created.ok) throw new Error(created.error.message);
  await created.store.close();
  return created.packagePath;
}

async function readDocument(packagePath: string): Promise<Document> {
  return JSON.parse(
    await fs.readFile(path.join(packagePath, 'document.json'), 'utf8'),
  ) as Document;
}

async function writeDocument(packagePath: string, document: Document): Promise<void> {
  await fs.writeFile(
    path.join(packagePath, 'document.json'),
    JSON.stringify(document, null, 2),
    'utf8',
  );
}

/** A package with one spare asset record and its bytes on disk. */
async function packageWithAsset(
  title: string,
  overrides: Partial<Asset> = {},
): Promise<string> {
  const packagePath = await createPackage(title);
  const document = await readDocument(packagePath);
  document.assets = { ...document.assets, [ID]: record(ID, overrides) };
  await writeDocument(packagePath, document);
  await fs.writeFile(path.join(packagePath, 'assets', ID), BYTES);
  return packagePath;
}

/** The real OS Trash, recorded: the file is moved into a sibling folder. */
function recordingTrash(): { trashItem: TrashItem; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    trashItem: async (target) => {
      calls.push(target);
      await fs.rename(target, path.join(root, 'trash', path.basename(target)));
    },
  };
}

function addBlock(
  document: Document,
  blockId: string,
  content: Document['blocks'][string]['content'],
): void {
  document.blocks[blockId] = { id: blockId, content };
  document.chapters[0]?.topLevelBlockIds.push(blockId);
}

describe('trashUnusedImage', () => {
  it('moves an unreferenced asset file to the Trash and leaves the record', async () => {
    const packagePath = await packageWithAsset('Unused');
    const { trashItem, calls } = recordingTrash();

    const result = await trashUnusedImage(packagePath, ID, trashItem);

    expect(result).toEqual({ ok: true, trashed: true });
    const assetsRoot = await fs.realpath(path.join(packagePath, 'assets'));
    expect(calls).toEqual([path.join(assetsRoot, ID)]);
    await expect(fs.readFile(path.join(root, 'trash', ID))).resolves.toEqual(
      Buffer.from(BYTES),
    );
    await expect(fs.stat(path.join(packagePath, 'assets', ID))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    // Main moves bytes only; the record removal is the renderer's guarded
    // `asset.remove`, which is what keeps undo/save bookkeeping in one place.
    await expect(readDocument(packagePath)).resolves.toMatchObject({
      assets: { [ID]: { id: ID } },
    });
  });

  it('refuses an asset an image node still names', async () => {
    const packagePath = await packageWithAsset('Node');
    const document = await readDocument(packagePath);
    addBlock(document, 'image-block', {
      type: 'doc',
      children: [{ type: 'image', attrs: { assetId: ID, alt: 'diagram' } }],
    });
    await writeDocument(packagePath, document);
    const { trashItem, calls } = recordingTrash();

    const result = await trashUnusedImage(packagePath, ID, trashItem);

    expect(result).toMatchObject({ ok: false, code: 'asset-in-use' });
    expect(calls).toEqual([]);
    await expect(fs.stat(path.join(packagePath, 'assets', ID))).resolves.toBeDefined();
  });

  it('refuses an asset an image anchor still names', async () => {
    const packagePath = await packageWithAsset('Anchor');
    const document = await readDocument(packagePath);
    addBlock(document, 'text-block', {
      type: 'doc',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'A note' }] }],
    });
    document.anchors['anchor-1'] = {
      id: 'anchor-1',
      blockId: 'text-block',
      kind: 'image',
      selector: {
        kind: 'image',
        assetId: ID,
        rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        point: false,
      },
      quote: 'region',
    };
    await writeDocument(packagePath, document);
    const { trashItem, calls } = recordingTrash();

    const result = await trashUnusedImage(packagePath, ID, trashItem);

    expect(result).toMatchObject({ ok: false, code: 'asset-in-use' });
    expect(calls).toEqual([]);
  });

  it('refuses a record path that is not the content address', async () => {
    const packagePath = await packageWithAsset('Crafted path', {
      path: `assets/${OTHER_ID}`,
    });
    // The other file exists too, so only the address check can refuse.
    await fs.writeFile(path.join(packagePath, 'assets', OTHER_ID), new Uint8Array([9]));
    const { trashItem, calls } = recordingTrash();

    const result = await trashUnusedImage(packagePath, ID, trashItem);

    expect(result).toMatchObject({ ok: false, code: 'outside-assets' });
    expect(calls).toEqual([]);
    await expect(fs.stat(path.join(packagePath, 'assets', ID))).resolves.toBeDefined();
  });

  it('refuses a symlinked asset file instead of following it', async () => {
    const packagePath = await createPackage('Symlink');
    const document = await readDocument(packagePath);
    document.assets = { ...document.assets, [ID]: record(ID) };
    await writeDocument(packagePath, document);
    const outside = path.join(root, 'outside.png');
    await fs.writeFile(outside, BYTES);
    await fs.symlink(outside, path.join(packagePath, 'assets', ID));
    const { trashItem, calls } = recordingTrash();

    const result = await trashUnusedImage(packagePath, ID, trashItem);

    expect(result).toMatchObject({ ok: false, code: 'outside-assets' });
    expect(calls).toEqual([]);
    await expect(fs.readFile(outside)).resolves.toEqual(Buffer.from(BYTES));
  });

  it('treats a missing file as nothing to move, so the dead record can go', async () => {
    const packagePath = await packageWithAsset('Missing bytes');
    await fs.rm(path.join(packagePath, 'assets', ID));
    const { trashItem, calls } = recordingTrash();

    const result = await trashUnusedImage(packagePath, ID, trashItem);

    expect(result).toEqual({ ok: true, trashed: false });
    expect(calls).toEqual([]);
  });

  it('reports a Trash refusal and leaves the file in the package', async () => {
    const packagePath = await packageWithAsset('Refused');
    const trashItem: TrashItem = async () => {
      throw new Error('The Trash is not available');
    };

    const result = await trashUnusedImage(packagePath, ID, trashItem);

    expect(result).toMatchObject({ ok: false, code: 'trash-failed' });
    if (!result.ok) expect(result.details).toMatch(/not available/);
    await expect(fs.stat(path.join(packagePath, 'assets', ID))).resolves.toBeDefined();
  });

  it('refuses an id without a record and an id that is not a content address', async () => {
    const packagePath = await packageWithAsset('Unknown');
    const { trashItem } = recordingTrash();

    await expect(
      trashUnusedImage(packagePath, OTHER_ID, trashItem),
    ).resolves.toMatchObject({ ok: false, code: 'not-found' });
    await expect(
      trashUnusedImage(packagePath, 'not-an-id', trashItem),
    ).resolves.toMatchObject({ ok: false, code: 'not-found' });
  });
});

describe('trashUnusedAsset store guards', () => {
  const document = (): Document =>
    ({
      schemaVersion: 2,
      id: 'store-guards',
      title: 'Store guards',
      createdAt: '2026-11-17T10:00:00.000Z',
      updatedAt: '2026-11-17T10:00:00.000Z',
      revision: 1,
      chapters: [],
      blocks: {},
      anchors: {},
      branches: {},
      assets: { [ID]: record(ID) },
      annotations: [],
    }) as Document;

  const store = (extra: Partial<UnusedAssetStore> = {}): UnusedAssetStore => ({
    packagePath: '/package',
    assetsPath: '/package/assets',
    document: document(),
    ...extra,
  });

  it('never runs the trash for a read-only open', async () => {
    let calls = 0;
    const result = await trashUnusedAsset(store({ readOnly: true }), ID, async () => {
      calls += 1;
    });
    expect(result).toMatchObject({ ok: false, code: 'read-only' });
    expect(calls).toBe(0);
  });

  it('refuses a package that has no open document', async () => {
    let calls = 0;
    const result = await trashUnusedAsset(store({ document: null }), ID, async () => {
      calls += 1;
    });
    expect(result).toMatchObject({ ok: false, code: 'not-open' });
    expect(calls).toBe(0);
  });
});

describe('assetIdsInBackups', () => {
  it('returns the ids a valid backup names, and nothing from an invalid one', async () => {
    const packagePath = await packageWithAsset('Backed up');
    const document = await readDocument(packagePath);
    const backedUp: Document = {
      ...document,
      assets: {
        ...document.assets,
        [OTHER_ID]: record(OTHER_ID, { originalName: 'old.png' }),
      },
      blocks: {},
    };
    const manager = new BackupManager(backupsDirForPackage(support, packagePath));
    await manager.create(stringifyDocument(backedUp), {
      kind: 'manual',
      revision: document.revision,
      now: new Date('2026-11-17T10:00:00.000Z'),
    });
    await manager.create('{ not json', { kind: 'manual', revision: 0 });

    const result = await assetIdsInBackups(packagePath);

    expect(result).toEqual({ ok: true, assetIds: [ID, OTHER_ID].sort() });
  });

  it('returns an empty list for a note without backups', async () => {
    const packagePath = await packageWithAsset('No backups');
    await expect(assetIdsInBackups(packagePath)).resolves.toEqual({
      ok: true,
      assetIds: [],
    });
  });
});
