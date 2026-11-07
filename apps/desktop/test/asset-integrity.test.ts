import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Asset, Document } from '@noteforest/core';
import { NodeAssetStore } from '@noteforest/core/node';
import { resolvePackageAssetPath, resolveStoreAsset } from '../src/main/library';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
]);
const ID = createHash('sha256').update(PNG_BYTES).digest('hex');

const temporaryDirectories: string[] = [];

async function tempDir(label: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), `noteforest-${label}-`));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }).catch(() => undefined),
    ),
  );
});

interface Fixture {
  store: {
    packagePath: string;
    assetsPath: string;
    document: Document;
    assets: NodeAssetStore;
  };
  packagePath: string;
  filePath: string;
  record: Asset;
}

async function fixture(
  options: { mime?: string; withRecord?: boolean; writeFile?: boolean } = {},
): Promise<Fixture> {
  const packagePath = await tempDir('asset-integrity');
  const assetsPath = path.join(packagePath, 'assets');
  await fs.mkdir(assetsPath, { recursive: true });
  const record: Asset = {
    id: ID,
    path: `assets/${ID}`,
    mime: options.mime ?? 'image/png',
    bytes: PNG_BYTES.byteLength,
  };
  const document = {
    assets: options.withRecord === false ? {} : { [ID]: record },
  } as unknown as Document;
  const assets = new NodeAssetStore({
    packagePath,
    assetRecord: (id) => document.assets[id],
  });
  const filePath = path.join(assetsPath, ID);
  if (options.writeFile !== false) await fs.writeFile(filePath, PNG_BYTES);
  return {
    store: { packagePath, assetsPath, document, assets },
    packagePath,
    filePath,
    record,
  };
}

describe('verified package asset resolution', () => {
  it('returns verified bytes and the recorded image MIME', async () => {
    const { store } = await fixture();
    const resolved = await resolveStoreAsset(store, ID);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.mime).toBe('image/png');
    expect(Buffer.from(resolved.bytes)).toEqual(Buffer.from(PNG_BYTES));
  });

  it('returns asset-missing for an absent record, absent file, or invalid record path', async () => {
    const noRecord = await fixture({ withRecord: false });
    await expect(resolveStoreAsset(noRecord.store, ID)).resolves.toMatchObject({
      ok: false,
      reason: 'asset-missing',
    });

    const noFile = await fixture({ writeFile: false });
    await expect(resolveStoreAsset(noFile.store, ID)).resolves.toMatchObject({
      ok: false,
      reason: 'asset-missing',
    });

    const traversal = await fixture();
    traversal.record.path = `../../${ID}`;
    await expect(resolveStoreAsset(traversal.store, ID)).resolves.toMatchObject({
      ok: false,
      reason: 'asset-missing',
    });
  });

  it('returns asset-changed and no bytes when the file hash no longer matches the id', async () => {
    const { store, filePath } = await fixture();
    await expect(resolveStoreAsset(store, ID)).resolves.toMatchObject({ ok: true });

    const changedBytes = new Uint8Array(PNG_BYTES);
    changedBytes[3] = (changedBytes[3] ?? 0) ^ 0xff;
    await fs.writeFile(filePath, changedBytes);
    // A reload creates a new store; invalidate models the fresh session here.
    store.assets.invalidate(ID);

    const changed = await resolveStoreAsset(store, ID);
    expect(changed.ok).toBe(false);
    if (changed.ok) return;
    expect(changed.reason).toBe('asset-changed');
    expect('bytes' in changed).toBe(false);
  });

  it('never serves a non-image MIME recorded by a crafted document', async () => {
    const { store } = await fixture({ mime: 'text/html' });
    await expect(resolveStoreAsset(store, ID)).resolves.toMatchObject({
      ok: false,
      reason: 'asset-unsupported',
    });
  });

  it('rejects a symlinked assets directory that escapes the package', async () => {
    const packagePath = await tempDir('asset-symlink-root');
    const outsidePath = await tempDir('asset-symlink-outside');
    await fs.writeFile(path.join(outsidePath, ID), PNG_BYTES);
    await fs.symlink(outsidePath, path.join(packagePath, 'assets'));
    const record: Asset = { id: ID, path: `assets/${ID}`, mime: 'image/png' };
    const document = { assets: { [ID]: record } } as unknown as Document;
    const assets = new NodeAssetStore({
      packagePath,
      assetRecord: (id) => document.assets[id],
    });
    const store = {
      packagePath,
      assetsPath: path.join(packagePath, 'assets'),
      document,
      assets,
    };
    // The lexical helper accepts the record; only the realpath check sees the
    // directory escape, which is why the resolver must do both.
    expect(resolvePackageAssetPath(packagePath, store.assetsPath, record.path)).not.toBeNull();
    await expect(resolveStoreAsset(store, ID)).resolves.toMatchObject({
      ok: false,
      reason: 'asset-missing',
    });
  });

  it('rejects a final-file symlink even when the assets directory is real', async () => {
    const { store } = await fixture({ writeFile: false });
    const outsidePath = path.join(await tempDir('asset-file-outside'), 'bytes');
    await fs.writeFile(outsidePath, PNG_BYTES);
    await fs.symlink(outsidePath, path.join(store.assetsPath, ID));
    await expect(resolveStoreAsset(store, ID)).resolves.toMatchObject({
      ok: false,
      reason: 'asset-missing',
    });
  });

  it('rejects a directory at the content-addressed path', async () => {
    const { store, filePath } = await fixture({ writeFile: false });
    await fs.mkdir(filePath);
    await expect(resolveStoreAsset(store, ID)).resolves.toMatchObject({
      ok: false,
      reason: 'asset-missing',
    });
  });
});
