import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type {
  AssetId,
  AssetInsertInput,
  AssetInsertResult,
  AssetReadResult,
  AssetStore,
} from '../src/assets.js';
import { coreError } from '../src/errors.js';
import type { Asset } from '../src/types.js';

/**
 * Test double for the contract only. It deliberately does not touch the
 * filesystem: the content-addressed implementation belongs to M3c3b.
 */
class MemoryAssetStore implements AssetStore {
  readonly packagePath = '/library/example';

  private readonly files = new Map<AssetId, { asset: Asset; bytes: Uint8Array }>();

  idForBytes(bytes: Uint8Array): AssetId {
    return createHash('sha256').update(bytes).digest('hex');
  }

  pathFor(id: AssetId): string {
    return `assets/${id}`;
  }

  urlFor(id: AssetId): string {
    return `noteforest-asset://${id}`;
  }

  async has(id: AssetId): Promise<boolean> {
    return this.files.has(id);
  }

  async read(id: AssetId): Promise<AssetReadResult> {
    const entry = this.files.get(id);
    if (entry === undefined) {
      return { ok: false, id, reason: 'missing', message: `asset ${id} is missing` };
    }
    return { ok: true, asset: entry.asset, bytes: entry.bytes };
  }

  async insert(input: AssetInsertInput): Promise<AssetInsertResult> {
    if (input.mime.length === 0) {
      return { ok: false, error: coreError('invalid-document', 'asset MIME type is required') };
    }
    const id = this.idForBytes(input.bytes);
    const existing = this.files.get(id);
    if (existing !== undefined) return { ok: true, asset: existing.asset, created: false };

    const asset: Asset = {
      id,
      path: this.pathFor(id),
      mime: input.mime,
      bytes: input.bytes.byteLength,
      ...(input.originalName === undefined ? {} : { originalName: input.originalName }),
      ...(input.width === undefined ? {} : { width: input.width }),
      ...(input.height === undefined ? {} : { height: input.height }),
      ...(input.alt === undefined ? {} : { alt: input.alt }),
    };
    this.files.set(id, { asset, bytes: input.bytes });
    return { ok: true, asset, created: true };
  }
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const OTHER_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]);

describe('AssetStore contract', () => {
  it('addresses assets by content and deduplicates identical bytes', async () => {
    const store = new MemoryAssetStore();
    const id = store.idForBytes(PNG_BYTES);
    expect(id).toMatch(/^[0-9a-f]{64}$/);

    const first = await store.insert({ bytes: PNG_BYTES, mime: 'image/png', originalName: 'a.png' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.created).toBe(true);
    expect(first.asset.id).toBe(id);
    expect(first.asset.bytes).toBe(PNG_BYTES.byteLength);

    const second = await store.insert({ bytes: PNG_BYTES, mime: 'image/png', originalName: 'b.png' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.created).toBe(false);
    expect(second.asset).toEqual(first.asset);
    await expect(store.has(id)).resolves.toBe(true);

    const other = await store.insert({ bytes: OTHER_BYTES, mime: 'image/png' });
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.asset.id).not.toBe(id);
  });

  it('returns bytes for a present asset and a typed missing result otherwise', async () => {
    const store = new MemoryAssetStore();
    const inserted = await store.insert({ bytes: PNG_BYTES, mime: 'image/png' });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    const read = await store.read(inserted.asset.id);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.bytes).toEqual(PNG_BYTES);

    const missing = await store.read('0'.repeat(64));
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason).toBe('missing');
    expect(missing.id).toBe('0'.repeat(64));
    await expect(store.has('0'.repeat(64))).resolves.toBe(false);
  });

  it('resolves package-relative paths and renderer-safe URLs', async () => {
    const store = new MemoryAssetStore();
    const inserted = await store.insert({ bytes: PNG_BYTES, mime: 'image/png' });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;

    const id = inserted.asset.id;
    expect(inserted.asset.path).toBe(`assets/${id}`);
    expect(inserted.asset.path.startsWith('/')).toBe(false);
    expect(inserted.asset.path).not.toContain('..');
    expect(store.pathFor(id)).toBe(inserted.asset.path);

    const url = store.urlFor(id);
    expect(url.startsWith('/')).toBe(false);
    expect(url.startsWith('file:')).toBe(false);
    expect(url).not.toContain('/Users/');
  });

  it('keeps insert failures typed', async () => {
    const store = new MemoryAssetStore();
    const failed = await store.insert({ bytes: PNG_BYTES, mime: '' });
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error.code).toBe('invalid-document');
  });
});
