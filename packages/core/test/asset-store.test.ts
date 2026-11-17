import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyInverse } from '../src/commands.js';
import { parseDocumentJson, stringifyDocument } from '../src/serialize.js';
import { NodeAssetStore } from '../src/node/assets.js';
import type { Asset } from '../src/types.js';
import {
  blockText,
  deterministicContext,
  makeTempDir,
  newDocument,
  removeDir,
  run,
  textContent,
  tryRun,
} from './helpers.js';

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
]);
const OTHER_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Symlink tests run on macOS and any platform that grants the privilege. Some
 * Windows configurations reject symlink creation without developer mode; the
 * test then returns early instead of asserting a platform capability.
 */
async function createSymlinkOrSkip(target: string, linkPath: string): Promise<boolean> {
  try {
    await fs.symlink(target, linkPath);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES' || code === 'ENOSYS') return false;
    throw error;
  }
}

async function withStore(
  name: string,
  fn: (store: NodeAssetStore, packagePath: string) => Promise<void>,
): Promise<void> {
  const packagePath = await makeTempDir(`noteforest-asset-${name}-`);
  try {
    await fn(new NodeAssetStore({ packagePath }), packagePath);
  } finally {
    await removeDir(packagePath);
  }
}

describe('NodeAssetStore', () => {
  it('addresses bytes by SHA-256 and deduplicates identical content', async () => {
    await withStore('dedupe', async (store) => {
      const id = store.idForBytes(PNG_BYTES);
      expect(id).toBe(sha256(PNG_BYTES));
      expect(id).toMatch(/^[0-9a-f]{64}$/);

      const first = await store.insert({
        bytes: PNG_BYTES,
        mime: 'image/png',
        originalName: 'forest.png',
        width: 640,
        height: 360,
        alt: 'A forest plot',
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.created).toBe(true);
      expect(first.asset).toMatchObject({
        id,
        path: `assets/${id}`,
        mime: 'image/png',
        bytes: PNG_BYTES.byteLength,
        originalName: 'forest.png',
        width: 640,
        height: 360,
        alt: 'A forest plot',
      });

      const second = await store.insert({
        bytes: PNG_BYTES,
        mime: 'image/png',
        originalName: 'renamed.png',
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.created).toBe(false);
      expect(second.asset.id).toBe(id);
      // The first canonical record wins; the duplicate does not rewrite it.
      expect(second.asset.originalName).toBe('forest.png');
      await expect(store.has(id)).resolves.toBe(true);
    });
  });

  it('reads bytes and reports missing assets as a typed result', async () => {
    await withStore('read', async (store) => {
      const inserted = await store.insert({ bytes: PNG_BYTES, mime: 'image/png' });
      expect(inserted.ok).toBe(true);
      if (!inserted.ok) return;

      const read = await store.read(inserted.asset.id);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(Buffer.from(read.bytes)).toEqual(Buffer.from(PNG_BYTES));
      expect(read.asset.id).toBe(inserted.asset.id);
      expect(read.asset.mime).toBe('image/png');

      const missing = await store.read('0'.repeat(64));
      expect(missing.ok).toBe(false);
      if (missing.ok) return;
      expect(missing.reason).toBe('missing');
      expect(missing.id).toBe('0'.repeat(64));
      await expect(store.has('0'.repeat(64))).resolves.toBe(false);
    });
  });

  it('cleans the temporary file and returns a typed failure when the target blocks the rename', async () => {
    await withStore('atomic', async (store, packagePath) => {
      const id = store.idForBytes(PNG_BYTES);
      const assetsDir = path.join(packagePath, 'assets');
      await fs.mkdir(path.join(assetsDir, id), { recursive: true });

      const failed = await store.insert({ bytes: PNG_BYTES, mime: 'image/png' });
      expect(failed.ok).toBe(false);
      if (failed.ok) return;
      expect(failed.error.code).toBe('io-error');
      const entries = await fs.readdir(assetsDir);
      expect(entries).toEqual([id]);
      expect(entries.some((entry) => entry.endsWith('.tmp'))).toBe(false);
    });
  });

  it('never treats an id as a path and rejects traversal outside the package', async () => {
    await withStore('paths', async (store, packagePath) => {
      expect(() => store.pathFor('../outside')).toThrow(/asset id/);
      expect(() => store.urlFor('assets/../../outside')).toThrow(/asset id/);
      expect(store.pathFor('a'.repeat(64))).toBe(`assets/${'a'.repeat(64)}`);
      await expect(store.has('../document.json')).resolves.toBe(false);
      const missing = await store.read('../../etc/passwd');
      expect(missing.ok).toBe(false);
      if (missing.ok) return;
      expect(missing.reason).toBe('missing');

      // A symlink at a valid-looking asset path must not escape the package.
      const outside = path.join(packagePath, '..', `outside-${Date.now()}.bin`);
      await fs.writeFile(outside, PNG_BYTES);
      const id = store.idForBytes(PNG_BYTES);
      try {
        await fs.mkdir(path.join(packagePath, 'assets'), { recursive: true });
        await fs.symlink(outside, path.join(packagePath, 'assets', id));
        await expect(store.has(id)).resolves.toBe(false);
        const linked = await store.read(id);
        expect(linked.ok).toBe(false);
        if (linked.ok) return;
        expect(linked.reason).toBe('unreadable');
      } finally {
        await fs.rm(outside, { force: true });
      }
    });
  });

  it('maps ids to a renderer-safe custom-protocol URL, never a filesystem path', async () => {
    await withStore('url', async (store) => {
      const id = store.idForBytes(PNG_BYTES);
      const url = store.urlFor(id);
      expect(url).toBe(`noteforest-asset://asset/${id}`);
      expect(url.startsWith('/')).toBe(false);
      expect(url.startsWith('file:')).toBe(false);
      expect(url).not.toContain('/Users/');
      expect(url).not.toContain('..');
    });
  });

  it('uses the canonical asset record for metadata when one is available', async () => {
    const packagePath = await makeTempDir('noteforest-asset-record-');
    const record: Asset = {
      id: 'a'.repeat(64),
      path: `assets/${'a'.repeat(64)}`,
      mime: 'image/png',
      width: 10,
      height: 20,
    };
    try {
      const store = new NodeAssetStore({ packagePath, assetRecord: () => record });
      // Create the file the record describes directly; the callback is read-only metadata.
      await fs.mkdir(path.join(packagePath, 'assets'), { recursive: true });
      await fs.writeFile(path.join(packagePath, 'assets', record.id), PNG_BYTES);
      const read = await store.read(record.id);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      expect(read.asset).toEqual(record);
    } finally {
      await removeDir(packagePath);
    }
  });

  it('verifies the content address once per session and re-checks after invalidation', async () => {
    const packagePath = await makeTempDir('noteforest-asset-verify-');
    const id = sha256(PNG_BYTES);
    const record: Asset = {
      id,
      path: `assets/${id}`,
      mime: 'image/png',
      bytes: PNG_BYTES.byteLength,
    };
    try {
      const store = new NodeAssetStore({ packagePath, assetRecord: () => record });
      await fs.mkdir(path.join(packagePath, 'assets'), { recursive: true });
      const filePath = path.join(packagePath, 'assets', id);
      await fs.writeFile(filePath, PNG_BYTES);

      await expect(store.readVerified(id)).resolves.toMatchObject({ ok: true });
      await expect(store.availability(id)).resolves.toMatchObject({ state: 'available' });

      // Replace the bytes under the same content-addressed name. The verified
      // result is cached for this open session, so the next read does not hash.
      const changedBytes = new Uint8Array(PNG_BYTES);
      changedBytes[3] = (changedBytes[3] ?? 0) ^ 0xff;
      await fs.writeFile(filePath, changedBytes);
      await expect(store.readVerified(id)).resolves.toMatchObject({ ok: true });
      await expect(store.availability(id)).resolves.toMatchObject({ state: 'available' });

      // A reload creates a new store; `invalidate` models that re-check here.
      store.invalidate(id);
      const changed = await store.readVerified(id);
      expect(changed.ok).toBe(false);
      if (changed.ok) return;
      expect(changed.reason).toBe('changed');
      expect(changed.id).toBe(id);
      await expect(store.availability(id)).resolves.toMatchObject({
        state: 'asset-changed',
        detail: 'hash-mismatch',
      });
    } finally {
      await removeDir(packagePath);
    }
  });

  it('reports typed availability for a missing record, missing file, and unreadable file', async () => {
    const packagePath = await makeTempDir('noteforest-asset-availability-');
    const id = sha256(PNG_BYTES);
    try {
      const recordless = new NodeAssetStore({ packagePath, assetRecord: () => undefined });
      await expect(recordless.availability(id)).resolves.toMatchObject({
        state: 'asset-missing',
        detail: 'record-missing',
      });

      const missingRecord: Asset = {
        id,
        path: `assets/${id}`,
        mime: 'image/png',
        bytes: PNG_BYTES.byteLength,
      };
      const missingFile = new NodeAssetStore({
        packagePath,
        assetRecord: () => missingRecord,
      });
      await expect(missingFile.availability(id)).resolves.toMatchObject({
        state: 'asset-missing',
        detail: 'file-missing',
      });
      await expect(missingFile.availabilityFor([id])).resolves.toEqual([
        expect.objectContaining({ id, state: 'asset-missing', detail: 'file-missing' }),
      ]);

      await fs.mkdir(path.join(packagePath, 'assets'), { recursive: true });
      await fs.mkdir(path.join(packagePath, 'assets', id));
      missingFile.invalidate(id);
      await expect(missingFile.availability(id)).resolves.toMatchObject({
        state: 'asset-missing',
        detail: 'unreadable',
      });
    } finally {
      await removeDir(packagePath);
    }
  });

  it('confines every operation when the assets directory is a symlink outside the package', async () => {
    const packagePath = await makeTempDir('noteforest-asset-symlink-outside-');
    const outsidePath = await makeTempDir('noteforest-asset-symlink-outside-target-');
    const id = sha256(PNG_BYTES);
    const record: Asset = {
      id,
      path: `assets/${id}`,
      mime: 'image/png',
      bytes: PNG_BYTES.byteLength,
    };
    try {
      await fs.writeFile(path.join(outsidePath, id), PNG_BYTES);
      if (!(await createSymlinkOrSkip(outsidePath, path.join(packagePath, 'assets')))) return;

      const store = new NodeAssetStore({
        packagePath,
        assetRecord: () => record,
      });
      await expect(store.has(id)).resolves.toBe(false);

      const read = await store.read(id);
      expect(read.ok).toBe(false);
      if (read.ok) return;
      expect(read.reason).toBe('unreadable');

      const verified = await store.readVerified(id);
      expect(verified.ok).toBe(false);
      if (verified.ok) return;
      expect(verified.reason).toBe('unreadable');

      await expect(store.availability(id)).resolves.toMatchObject({
        id,
        state: 'asset-missing',
        detail: 'unreadable',
      });

      // The correct bytes are already visible through the symlink; insert must
      // still refuse to dedupe against them or write a new file there.
      const failed = await store.insert({ bytes: PNG_BYTES, mime: 'image/png' });
      expect(failed.ok).toBe(false);
      if (failed.ok) return;
      expect(failed.error.code).toBe('io-error');

      await expect(fs.readdir(outsidePath)).resolves.toEqual([id]);
      await expect(fs.readFile(path.join(outsidePath, id))).resolves.toEqual(Buffer.from(PNG_BYTES));
    } finally {
      await removeDir(packagePath);
      await removeDir(outsidePath);
    }
  });

  it('rejects a symlinked assets directory even when its target is inside the package', async () => {
    const packagePath = await makeTempDir('noteforest-asset-symlink-inside-');
    const id = sha256(PNG_BYTES);
    const record: Asset = {
      id,
      path: `assets/${id}`,
      mime: 'image/png',
      bytes: PNG_BYTES.byteLength,
    };
    try {
      const realAssets = path.join(packagePath, 'real-assets');
      await fs.mkdir(realAssets);
      await fs.writeFile(path.join(realAssets, id), PNG_BYTES);
      if (!(await createSymlinkOrSkip(realAssets, path.join(packagePath, 'assets')))) return;

      const store = new NodeAssetStore({
        packagePath,
        assetRecord: () => record,
      });
      await expect(store.has(id)).resolves.toBe(false);
      await expect(store.read(id)).resolves.toMatchObject({
        ok: false,
        reason: 'unreadable',
      });
      await expect(store.availability(id)).resolves.toMatchObject({
        state: 'asset-missing',
        detail: 'unreadable',
      });

      const failed = await store.insert({ bytes: PNG_BYTES, mime: 'image/png' });
      expect(failed.ok).toBe(false);
      if (failed.ok) return;
      expect(failed.error.code).toBe('io-error');
      await expect(fs.readdir(realAssets)).resolves.toEqual([id]);
    } finally {
      await removeDir(packagePath);
    }
  });

  it('does not serve or write through a symlinked final asset file', async () => {
    const packagePath = await makeTempDir('noteforest-asset-file-symlink-');
    const outsidePath = await makeTempDir('noteforest-asset-file-symlink-target-');
    const id = sha256(PNG_BYTES);
    const record: Asset = {
      id,
      path: `assets/${id}`,
      mime: 'image/png',
      bytes: PNG_BYTES.byteLength,
    };
    try {
      const assetsPath = path.join(packagePath, 'assets');
      await fs.mkdir(assetsPath);
      const outsideFile = path.join(outsidePath, 'bytes');
      await fs.writeFile(outsideFile, PNG_BYTES);
      if (!(await createSymlinkOrSkip(outsideFile, path.join(assetsPath, id)))) return;

      const store = new NodeAssetStore({
        packagePath,
        assetRecord: () => record,
      });
      await expect(store.has(id)).resolves.toBe(false);
      await expect(store.read(id)).resolves.toMatchObject({
        ok: false,
        reason: 'unreadable',
      });
      await expect(store.readVerified(id)).resolves.toMatchObject({
        ok: false,
        reason: 'unreadable',
      });
      await expect(store.availability(id)).resolves.toMatchObject({
        state: 'asset-missing',
        detail: 'unreadable',
      });

      const failed = await store.insert({ bytes: PNG_BYTES, mime: 'image/png' });
      expect(failed.ok).toBe(false);
      if (failed.ok) return;
      expect(failed.error.code).toBe('io-error');
      // The symlink is untouched and the outside file still holds the bytes.
      await expect(
        fs.lstat(path.join(assetsPath, id)).then((stat) => stat.isSymbolicLink()),
      ).resolves.toBe(true);
      await expect(fs.readFile(outsideFile)).resolves.toEqual(Buffer.from(PNG_BYTES));
    } finally {
      await removeDir(packagePath);
      await removeDir(outsidePath);
    }
  });

  it('repairs a corrupt content-addressed file instead of reporting a dedupe', async () => {
    await withStore('corrupt-dedupe', async (store, packagePath) => {
      const id = store.idForBytes(PNG_BYTES);
      const assetsPath = path.join(packagePath, 'assets');
      await fs.mkdir(assetsPath, { recursive: true });
      const filePath = path.join(assetsPath, id);
      await fs.writeFile(filePath, OTHER_BYTES);

      const repaired = await store.insert({
        bytes: PNG_BYTES,
        mime: 'image/png',
        originalName: 'forest.png',
      });
      expect(repaired.ok).toBe(true);
      if (!repaired.ok) return;
      expect(repaired.created).toBe(true);
      expect(repaired.asset.id).toBe(id);
      await expect(fs.readFile(filePath)).resolves.toEqual(Buffer.from(PNG_BYTES));
      await expect(store.readVerified(id)).resolves.toMatchObject({ ok: true });
      await expect(store.availability(id)).resolves.toMatchObject({ state: 'available' });

      const deduped = await store.insert({ bytes: PNG_BYTES, mime: 'image/png' });
      expect(deduped.ok).toBe(true);
      if (!deduped.ok) return;
      expect(deduped.created).toBe(false);
      expect(deduped.asset.id).toBe(id);
      await expect(fs.readFile(filePath)).resolves.toEqual(Buffer.from(PNG_BYTES));
    });
  });
});

describe('asset commands', () => {
  const asset: Asset = {
    id: 'b'.repeat(64),
    path: `assets/${'b'.repeat(64)}`,
    mime: 'image/png',
    bytes: PNG_BYTES.byteLength,
    width: 4,
    height: 3,
    alt: 'diagram',
  };

  it('adds a canonical asset record and removes it through its inverse', () => {
    const context = deterministicContext();
    const document = newDocument(context);
    const added = run(document, { type: 'asset.add', asset }, context);
    expect(added.document.assets[asset.id]).toEqual(asset);
    expect(added.affected.assetIds).toEqual([asset.id]);
    expect(added.inverse).toEqual({ type: 'asset.remove', assetId: asset.id });

    const removed = applyInverse(added);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.document.assets[asset.id]).toBeUndefined();
  });

  it('keeps the first record when identical ids are added twice', () => {
    const context = deterministicContext();
    let document = run(newDocument(context), { type: 'asset.add', asset }, context).document;
    const duplicate = run(
      document,
      {
        type: 'asset.add',
        asset: { ...asset, originalName: 'second.png' },
      },
      context,
    );
    expect(duplicate.document.assets[asset.id]).toEqual(asset);
    expect(duplicate.inverse).toBeNull();
    expect(duplicate.warnings.join(' ')).toContain('already exists');
    document = duplicate.document;
    expect(Object.keys(document.assets)).toEqual([asset.id]);
  });

  it('rejects absolute, traversal, and remote asset paths', () => {
    const context = deterministicContext();
    const document = newDocument(context);
    for (const candidate of [
      '/Users/example/secret.png',
      '../outside.png',
      'assets/../../outside.png',
      'https://example.com/x.png',
      'documents/x.png',
    ]) {
      const rejected = tryRun(
        document,
        { type: 'asset.add', asset: { ...asset, path: candidate } },
        context,
      );
      expect(rejected.ok).toBe(false);
    }
  });

  it('round-trips an image node and its asset through canonical JSON', () => {
    const context = deterministicContext();
    const document = newDocument(context);
    const block = run(
      document,
      {
        type: 'block.create',
        content: textContent('Image block'),
        placement: { kind: 'top-level', chapterId: document.chapters[0]?.id ?? '' },
      },
      context,
    );
    const withAsset = run(block.document, { type: 'asset.add', asset }, context);
    const edited = run(
      withAsset.document,
      {
        type: 'block.editContent',
        blockId: block.affected.blockIds[0] ?? '',
        content: {
          type: 'doc',
          children: [
            {
              type: 'image',
              attrs: {
                assetId: asset.id,
                alt: 'diagram',
                width: 4,
                height: 3,
              },
            },
          ],
        },
      },
      context,
    );

    const serialized = stringifyDocument(edited.document);
    expect(serialized).not.toContain('/Users/');
    const parsed = parseDocumentJson(serialized);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.assets[asset.id]).toEqual(asset);
    const image = parsed.document.blocks[block.affected.blockIds[0] ?? '']?.content.children?.[0];
    expect(image?.type).toBe('image');
    expect(image?.attrs).toEqual({
      assetId: asset.id,
      alt: 'diagram',
      width: 4,
      height: 3,
    });
    expect(blockText(parsed.document.blocks[block.affected.blockIds[0] ?? ''] ?? { content: { type: 'doc' } })).toBe('');
  });
});
