/**
 * Package-confinement tests for the main-process image copy/import paths.
 *
 * M3c3b5 S2-1: a crafted package whose `assets/` entry is a symlink must never
 * make NoteForest read source bytes from, or write imported bytes to, a
 * directory outside the package.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Asset } from '@noteforest/core';
import { createDocumentPackage } from '@noteforest/core/node';
import {
  closeAllStores,
  copyImageAsset,
  importImageBytes,
} from '../src/main/library';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
]);
const ID = createHash('sha256').update(PNG_BYTES).digest('hex');
const RECORD: Asset = {
  id: ID,
  path: `assets/${ID}`,
  mime: 'image/png',
  bytes: PNG_BYTES.byteLength,
};

let root = '';
let library = '';
let support = '';
let previousLibrary: string | undefined;
let previousSupport: string | undefined;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'noteforest-asset-confinement-'));
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

async function addAssetRecord(packagePath: string, record: Asset): Promise<void> {
  const documentPath = path.join(packagePath, 'document.json');
  const document = JSON.parse(await fs.readFile(documentPath, 'utf8')) as {
    assets?: Record<string, Asset>;
  };
  document.assets = { ...(document.assets ?? {}), [record.id]: record };
  await fs.writeFile(documentPath, JSON.stringify(document, null, 2));
}

async function assetIds(packagePath: string): Promise<string[]> {
  const document = JSON.parse(
    await fs.readFile(path.join(packagePath, 'document.json'), 'utf8'),
  ) as { assets?: Record<string, Asset> };
  return Object.keys(document.assets ?? {});
}

async function replaceAssetsWithSymlink(
  packagePath: string,
  targetPath: string,
): Promise<void> {
  await fs.rm(path.join(packagePath, 'assets'), { recursive: true, force: true });
  await fs.symlink(targetPath, path.join(packagePath, 'assets'));
}

describe('copyImageAsset package confinement', () => {
  it('copies verified bytes into a normal destination package', async () => {
    const source = await createPackage('Normal source');
    const target = await createPackage('Normal target');
    await fs.writeFile(path.join(source, 'assets', ID), PNG_BYTES);
    await addAssetRecord(source, RECORD);

    const copied = await copyImageAsset(source, target, ID);
    expect(copied).toMatchObject({
      ok: true,
      asset: { id: ID, mime: 'image/png', bytes: PNG_BYTES.byteLength },
    });
    await expect(fs.readFile(path.join(target, 'assets', ID))).resolves.toEqual(
      Buffer.from(PNG_BYTES),
    );
    await expect(assetIds(target)).resolves.toEqual([]);
  });

  it('rejects a symlinked source assets directory and writes nothing to the destination', async () => {
    const source = await createPackage('Symlinked source');
    const target = await createPackage('Source test target');
    const outside = path.join(root, 'outside-source');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, ID), PNG_BYTES);
    await replaceAssetsWithSymlink(source, outside);
    await addAssetRecord(source, RECORD);

    const copied = await copyImageAsset(source, target, ID);
    expect(copied.ok).toBe(false);
    await expect(fs.readdir(path.join(target, 'assets'))).resolves.toEqual([]);
    await expect(assetIds(target)).resolves.toEqual([]);
    // The source escape target is unchanged; nothing was written through it.
    await expect(fs.readdir(outside)).resolves.toEqual([ID]);
    await expect(fs.readFile(path.join(outside, ID))).resolves.toEqual(
      Buffer.from(PNG_BYTES),
    );
  });

  it('repairs a corrupt existing destination file instead of deduplicating it', async () => {
    const source = await createPackage('Repair test source');
    const target = await createPackage('Corrupt destination');
    await fs.writeFile(path.join(source, 'assets', ID), PNG_BYTES);
    await addAssetRecord(source, RECORD);
    await fs.writeFile(path.join(target, 'assets', ID), new Uint8Array([1, 2, 3, 4]));

    const copied = await copyImageAsset(source, target, ID);
    expect(copied).toMatchObject({ ok: true, asset: { id: ID } });
    await expect(fs.readFile(path.join(target, 'assets', ID))).resolves.toEqual(
      Buffer.from(PNG_BYTES),
    );

    // The repaired bytes now dedupe; a second copy leaves them untouched.
    const again = await copyImageAsset(source, target, ID);
    expect(again.ok).toBe(true);
    await expect(fs.readFile(path.join(target, 'assets', ID))).resolves.toEqual(
      Buffer.from(PNG_BYTES),
    );
  });

  it('rejects a symlinked destination assets directory and writes nothing outside the package', async () => {
    const source = await createPackage('Destination test source');
    const target = await createPackage('Symlinked destination');
    const outside = path.join(root, 'outside-destination');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(source, 'assets', ID), PNG_BYTES);
    await addAssetRecord(source, RECORD);
    await replaceAssetsWithSymlink(target, outside);

    const copied = await copyImageAsset(source, target, ID);
    expect(copied.ok).toBe(false);
    await expect(fs.readdir(outside)).resolves.toEqual([]);
    await expect(assetIds(target)).resolves.toEqual([]);
  });
});

describe('importImageBytes package confinement', () => {
  it('rejects a symlinked destination assets directory', async () => {
    const target = await createPackage('Import destination');
    const outside = path.join(root, 'outside-import');
    await fs.mkdir(outside);
    await replaceAssetsWithSymlink(target, outside);

    const imported = await importImageBytes(target, {
      bytes: PNG_BYTES,
      mime: 'image/png',
      originalName: 'forest.png',
    });
    expect(imported.ok).toBe(false);
    await expect(fs.readdir(outside)).resolves.toEqual([]);
    await expect(assetIds(target)).resolves.toEqual([]);
  });
});
