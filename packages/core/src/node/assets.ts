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
    return { ok: true, asset, created: true };
  }
}
