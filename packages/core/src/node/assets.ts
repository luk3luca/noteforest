/**
 * Content-addressed asset store (Node implementation).
 *
 * Assets live in `<package>/assets/<sha256-hex>` and are addressed by the
 * lowercase hex SHA-256 of their bytes. Identical bytes therefore share one
 * file, and the document never stores an external filesystem path. Inserts are
 * written to a temporary file in the same directory and atomically renamed, so
 * a reader never observes a partial asset.
 *
 * The store is deliberately package-scoped: an id is never a path, and every
 * read is confined to the package's `assets/` directory. Missing assets are a
 * typed result, never an exception.
 */

import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  AssetAvailability,
  AssetId,
  AssetInsertInput,
  AssetInsertResult,
  AssetReadResult,
  AssetStore,
} from '../assets.js';
import { coreError } from '../errors.js';
import type { Asset } from '../types.js';

const ASSET_ID_PATTERN = /^[0-9a-f]{64}$/;
const ASSETS_DIRECTORY = 'assets';

export interface NodeAssetStoreOptions {
  packagePath: string;
  /**
   * Canonical asset record lookup, if the caller has access to the document.
   * It is metadata only: bytes always come from the package file.
   */
  assetRecord?: (id: AssetId) => Asset | undefined;
}

function isAssetId(value: string): boolean {
  return ASSET_ID_PATTERN.test(value);
}

function assertAssetId(value: string): void {
  if (!isAssetId(value)) {
    throw new Error('asset id must be a 64-character lowercase hex SHA-256');
  }
}

function positiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
}

function assetForInput(id: AssetId, input: AssetInsertInput): Asset {
  const width = positiveInteger(input.width);
  const height = positiveInteger(input.height);
  return {
    id,
    path: `${ASSETS_DIRECTORY}/${id}`,
    mime: input.mime,
    bytes: input.bytes.byteLength,
    ...(input.originalName === undefined ? {} : { originalName: input.originalName }),
    ...(input.alt === undefined ? {} : { alt: input.alt }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
}

export class NodeAssetStore implements AssetStore {
  readonly packagePath: string;

  private readonly assetsDirectory: string;

  private readonly assetRecord: ((id: AssetId) => Asset | undefined) | undefined;

  /** Metadata from inserts in this process; the package file is the truth. */
  private readonly inserted = new Map<AssetId, Asset>();

  /**
   * Assets whose bytes were hashed successfully in this open session. The
   * session is the store lifetime: closing/reopening the document (including a
   * reload after an external change) creates a new store and therefore
   * re-verifies every asset once.
   */
  private readonly verified = new Set<AssetId>();

  /** Last availability result, so opening a snapshot does not re-read files. */
  private readonly availabilityCache = new Map<AssetId, AssetAvailability>();

  constructor(options: NodeAssetStoreOptions) {
    this.packagePath = path.resolve(options.packagePath);
    this.assetsDirectory = path.join(this.packagePath, ASSETS_DIRECTORY);
    this.assetRecord = options.assetRecord;
  }

  idForBytes(bytes: Uint8Array): AssetId {
    return createHash('sha256').update(bytes).digest('hex');
  }

  pathFor(id: AssetId): string {
    assertAssetId(id);
    return `${ASSETS_DIRECTORY}/${id}`;
  }

  urlFor(id: AssetId): string {
    assertAssetId(id);
    return `noteforest-asset://asset/${id}`;
  }

  async has(id: AssetId): Promise<boolean> {
    if (!isAssetId(id)) return false;
    try {
      const stat = await fs.lstat(path.join(this.assetsDirectory, id));
      return stat.isFile();
    } catch {
      return false;
    }
  }

  async read(id: AssetId): Promise<AssetReadResult> {
    return this.readInternal(id, false);
  }

  /**
   * Read bytes and verify the content address once per open session. The first
   * successful read hashes the file; later reads in the same store trust the
   * cached verification. A reload or explicit `invalidate` forces a re-check,
   * so external replacement is detected without hashing on every `<img>` load.
   */
  async readVerified(id: AssetId): Promise<AssetReadResult> {
    return this.readInternal(id, true);
  }

  /** Drop cached verification for one asset, or for every asset. */
  invalidate(id?: AssetId): void {
    if (id === undefined) {
      this.verified.clear();
      this.availabilityCache.clear();
      return;
    }
    this.verified.delete(id);
    this.availabilityCache.delete(id);
  }

  /**
   * Drop the cached availability decision without forcing a re-hash. Used when
   * a command adds/removes the record: the bytes, if already verified, stay
   * trusted for this session.
   */
  invalidateAvailability(id?: AssetId): void {
    if (id === undefined) this.availabilityCache.clear();
    else this.availabilityCache.delete(id);
  }

  /**
   * Typed availability used by the protocol, runtime/health, and export marker
   * path. The record must exist and the bytes must still hash to the id.
   */
  async availability(id: AssetId): Promise<AssetAvailability> {
    const cached = this.availabilityCache.get(id);
    if (cached !== undefined) return cached;
    const result = await this.checkAvailability(id);
    this.availabilityCache.set(id, result);
    return result;
  }

  private async checkAvailability(id: AssetId): Promise<AssetAvailability> {
    const record = this.assetRecord?.(id);
    if (record === undefined) {
      return {
        id,
        state: 'asset-missing',
        detail: 'record-missing',
        message: `asset record ${id} is missing`,
      };
    }
    const read = await this.readVerified(id);
    if (read.ok) return { id, state: 'available' };
    if (read.reason === 'changed') {
      return {
        id,
        state: 'asset-changed',
        detail: 'hash-mismatch',
        message: read.message,
      };
    }
    if (read.reason === 'missing') {
      return {
        id,
        state: 'asset-missing',
        detail: 'file-missing',
        message: read.message,
      };
    }
    return {
      id,
      state: 'asset-missing',
      detail: 'unreadable',
      message: read.message,
    };
  }

  async availabilityFor(ids: readonly AssetId[]): Promise<AssetAvailability[]> {
    return Promise.all(ids.map((id) => this.availability(id)));
  }

  private async readInternal(id: AssetId, verify: boolean): Promise<AssetReadResult> {
    if (!isAssetId(id)) {
      return {
        ok: false,
        id,
        reason: 'missing',
        message: `asset "${id}" is not a content-addressed asset id`,
      };
    }
    const filePath = path.join(this.assetsDirectory, id);
    let bytes: Uint8Array;
    try {
      // A symlink is never a package asset: resolving it could escape the
      // package even when the lexical path is inside assets/.
      const stat = await fs.lstat(filePath);
      if (!stat.isFile()) {
        return {
          ok: false,
          id,
          reason: 'unreadable',
          message: `asset ${id} is not a regular file`,
        };
      }
      bytes = await fs.readFile(filePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return { ok: false, id, reason: 'missing', message: `asset ${id} is missing` };
      }
      return {
        ok: false,
        id,
        reason: 'unreadable',
        message: `could not read asset ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
    if (verify && !this.verified.has(id)) {
      const actual = this.idForBytes(bytes);
      if (actual !== id) {
        return {
          ok: false,
          id,
          reason: 'changed',
          actual,
          message: `asset ${id} bytes hash to ${actual}`,
        };
      }
      this.verified.add(id);
    }
    const record =
      this.assetRecord?.(id) ??
      this.inserted.get(id) ?? {
        id,
        path: this.pathFor(id),
        mime: 'application/octet-stream',
        bytes: bytes.byteLength,
      };
    return { ok: true, asset: record, bytes };
  }

  async insert(input: AssetInsertInput): Promise<AssetInsertResult> {
    if (typeof input.mime !== 'string' || input.mime.length === 0) {
      return {
        ok: false,
        error: coreError('invalid-document', 'asset MIME type is required'),
      };
    }
    if (!(input.bytes instanceof Uint8Array)) {
      return {
        ok: false,
        error: coreError('invalid-document', 'asset bytes must be a Uint8Array'),
      };
    }

    const id = this.idForBytes(input.bytes);
    const target = path.join(this.assetsDirectory, id);
    const existing = await this.has(id);
    if (existing) {
      const asset = this.assetRecord?.(id) ?? this.inserted.get(id) ?? assetForInput(id, input);
      this.inserted.set(id, asset);
      return { ok: true, asset, created: false };
    }

    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    let tempPath: string | undefined;
    try {
      await fs.mkdir(this.assetsDirectory, { recursive: true });
      tempPath = path.join(
        this.assetsDirectory,
        `.${id}.${randomBytes(8).toString('hex')}.tmp`,
      );
      handle = await fs.open(tempPath, 'wx');
      await handle.writeFile(input.bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.rename(tempPath, target);
      tempPath = undefined;
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if (tempPath !== undefined) await fs.rm(tempPath, { force: true }).catch(() => undefined);
      // A concurrent writer may have won the race. Identical bytes mean the
      // asset is already safely present; report the deduplicated record.
      if (await this.has(id)) {
        const asset = this.assetRecord?.(id) ?? this.inserted.get(id) ?? assetForInput(id, input);
        this.inserted.set(id, asset);
        return { ok: true, asset, created: false };
      }
      return {
        ok: false,
        error: coreError(
          'io-error',
          `could not store asset ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { path: target },
        ),
      };
    }

    const asset = this.assetRecord?.(id) ?? assetForInput(id, input);
    this.inserted.set(id, asset);
    // The bytes we just wrote are the id by construction; no second hash read
    // is needed for this session.
    this.verified.add(id);
    this.availabilityCache.set(id, { id, state: 'available' });
    return { ok: true, asset, created: true };
  }
}
