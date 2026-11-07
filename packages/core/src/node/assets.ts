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
 * read is confined to the package's real `assets/` directory. A symlinked
 * `assets/` entry is rejected even when its target happens to be inside the
 * package, and a symlinked final asset file is never served. Missing assets
 * are a typed result, never an exception.
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

type AssetsDirectoryFailureReason = 'missing' | 'unreadable';

interface AssetsDirectoryFailure {
  readonly reason: AssetsDirectoryFailureReason;
  readonly message: string;
}

interface ResolvedAssetsDirectory {
  readonly packageRoot: string;
  readonly assetsRoot: string;
}

type AssetsDirectoryResult =
  | { readonly ok: true; readonly directory: ResolvedAssetsDirectory }
  | { readonly ok: false; readonly failure: AssetsDirectoryFailure };

type ExistingAssetFile =
  | { readonly kind: 'missing' }
  | { readonly kind: 'regular'; readonly bytes: Uint8Array }
  | { readonly kind: 'invalid'; readonly message: string };

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

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Strict containment: `candidate` must be below `root`, not equal to it. */
function isStrictlyInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export class NodeAssetStore implements AssetStore {
  readonly packagePath: string;

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
    const directory = await this.resolveAssetsDirectory(false);
    if (!directory.ok) return false;
    try {
      const stat = await fs.lstat(path.join(directory.directory.assetsRoot, id));
      return stat.isFile() && !stat.isSymbolicLink();
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
   * The directory confinement check is never cached: every read re-resolves
   * the real package and `assets/` roots first.
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
   * path. The record must exist and the bytes must still hash to the id. The
   * package/`assets/` confinement check runs on every call, even when the
   * availability result is cached.
   */
  async availability(id: AssetId): Promise<AssetAvailability> {
    const directory = await this.resolveAssetsDirectory(false);
    const cached = this.availabilityCache.get(id);
    if (!directory.ok) {
      const record = this.assetRecord?.(id);
      if (record === undefined && cached === undefined) {
        return {
          id,
          state: 'asset-missing',
          detail: 'record-missing',
          message: `asset record ${id} is missing`,
        };
      }
      // Do not cache a confinement failure: once the package is repaired, the
      // next snapshot should be able to observe the real files again.
      return {
        id,
        state: 'asset-missing',
        detail: directory.failure.reason === 'missing' ? 'file-missing' : 'unreadable',
        message: directory.failure.message,
      };
    }
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

  /**
   * Resolve the one directory asset files may come from. Both the package root
   * and the `assets/` entry are resolved with `realpath`; the latter must stay
   * strictly inside the former. A symlinked `assets/` entry is rejected even
   * when its target is inside the package, because the package layout no
   * longer matches the recorded `assets/<id>` shape.
   *
   * `create` is only used by `insert`: it creates a missing directory, then
   * re-checks the entry and the real path so a symlink raced in during `mkdir`
   * is never used for a write.
   */
  private async resolveAssetsDirectory(create: boolean): Promise<AssetsDirectoryResult> {
    let packageRoot: string;
    try {
      packageRoot = await fs.realpath(this.packagePath);
    } catch (error) {
      return {
        ok: false,
        failure: {
          reason: isMissingPathError(error) ? 'missing' : 'unreadable',
          message: isMissingPathError(error)
            ? 'the document package is missing'
            : 'the document package is not readable',
        },
      };
    }

    const lexicalAssets = path.join(packageRoot, ASSETS_DIRECTORY);
    let entry: Awaited<ReturnType<typeof fs.lstat>> | null = null;
    try {
      entry = await fs.lstat(lexicalAssets);
    } catch (error) {
      if (!isMissingPathError(error)) {
        return {
          ok: false,
          failure: { reason: 'unreadable', message: 'the assets directory is not readable' },
        };
      }
    }

    if (entry === null) {
      if (!create) {
        return {
          ok: false,
          failure: { reason: 'missing', message: 'the assets directory is missing' },
        };
      }
      try {
        await fs.mkdir(lexicalAssets, { recursive: true });
      } catch {
        return {
          ok: false,
          failure: { reason: 'unreadable', message: 'the assets directory could not be created' },
        };
      }
      try {
        entry = await fs.lstat(lexicalAssets);
      } catch (error) {
        return {
          ok: false,
          failure: {
            reason: isMissingPathError(error) ? 'missing' : 'unreadable',
            message: 'the assets directory is missing',
          },
        };
      }
    }

    if (entry.isSymbolicLink()) {
      return {
        ok: false,
        failure: { reason: 'unreadable', message: 'the assets directory is a symbolic link' },
      };
    }
    if (!entry.isDirectory()) {
      return {
        ok: false,
        failure: { reason: 'unreadable', message: 'the assets path is not a directory' },
      };
    }

    let assetsRoot: string;
    try {
      assetsRoot = await fs.realpath(lexicalAssets);
    } catch {
      return {
        ok: false,
        failure: { reason: 'unreadable', message: 'the assets directory is not readable' },
      };
    }
    if (!isStrictlyInside(packageRoot, assetsRoot)) {
      return {
        ok: false,
        failure: {
          reason: 'unreadable',
          message: 'the assets directory resolves outside the package',
        },
      };
    }
    return { ok: true, directory: { packageRoot, assetsRoot } };
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
    const directory = await this.resolveAssetsDirectory(false);
    if (!directory.ok) {
      return {
        ok: false,
        id,
        reason: directory.failure.reason,
        message: `asset ${id} is unavailable: ${directory.failure.message}`,
      };
    }
    const filePath = path.join(directory.directory.assetsRoot, id);
    let bytes: Uint8Array;
    try {
      // A symlink is never a package asset: resolving it could escape the
      // package even when the lexical path is inside assets/.
      const stat = await fs.lstat(filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
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
        message: `could not read asset ${id}: ${errorMessage(error)}`,
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
    const directory = await this.resolveAssetsDirectory(true);
    if (!directory.ok) {
      return {
        ok: false,
        error: coreError(
          'io-error',
          `could not store asset ${id}: ${directory.failure.message}`,
        ),
      };
    }
    const assetsRoot = directory.directory.assetsRoot;
    const target = path.join(assetsRoot, id);

    const existing = await this.inspectExistingAsset(target, id);
    if (existing.kind === 'invalid') {
      return {
        ok: false,
        error: coreError('io-error', `could not store asset ${id}: ${existing.message}`, {
          path: target,
        }),
      };
    }
    if (existing.kind === 'regular') {
      // S3-2: an existing name is only a deduplication hit when its bytes still
      // hash to the content address. A corrupt file is repaired below.
      if (this.idForBytes(existing.bytes) === id) {
        return this.deduplicated(id, input);
      }
    }

    const written = await this.writeAssetFile(assetsRoot, id, input.bytes);
    if (!written.ok) {
      // A concurrent writer may have won the race. Identical verified bytes
      // mean the asset is already safely present; anything else is a failure.
      const after = await this.inspectExistingAsset(target, id);
      if (after.kind === 'regular' && this.idForBytes(after.bytes) === id) {
        return this.deduplicated(id, input);
      }
      return {
        ok: false,
        error: coreError('io-error', `could not store asset ${id}: ${written.message}`, {
          path: target,
        }),
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

  /**
   * Inspect an existing `assets/<id>` entry without following a symlink. A
   * directory, socket, or symlink at the content address is not a valid asset
   * and must never be written through or reported as a dedupe.
   */
  private async inspectExistingAsset(
    filePath: string,
    id: AssetId,
  ): Promise<ExistingAssetFile> {
    let stat: Awaited<ReturnType<typeof fs.lstat>>;
    try {
      stat = await fs.lstat(filePath);
    } catch (error) {
      if (isMissingPathError(error)) return { kind: 'missing' };
      return {
        kind: 'invalid',
        message: `the asset file could not be inspected: ${errorMessage(error)}`,
      };
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { kind: 'invalid', message: `asset ${id} is not a regular file` };
    }
    try {
      return { kind: 'regular', bytes: await fs.readFile(filePath) };
    } catch (error) {
      return {
        kind: 'invalid',
        message: `the asset file could not be read: ${errorMessage(error)}`,
      };
    }
  }

  /** Write to a temp file in the real assets root, then rename atomically. */
  private async writeAssetFile(
    assetsRoot: string,
    id: AssetId,
    bytes: Uint8Array,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const target = path.join(assetsRoot, id);
    const tempPath = path.join(
      assetsRoot,
      `.${id}.${randomBytes(8).toString('hex')}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      handle = await fs.open(tempPath, 'wx');
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.rename(tempPath, target);
      return { ok: true };
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      return { ok: false, message: errorMessage(error) };
    }
  }

  private deduplicated(id: AssetId, input: AssetInsertInput): AssetInsertResult {
    const asset = this.assetRecord?.(id) ?? this.inserted.get(id) ?? assetForInput(id, input);
    this.inserted.set(id, asset);
    // This path hashed the file's bytes before deciding it was a duplicate.
    this.verified.add(id);
    this.availabilityCache.set(id, { id, state: 'available' });
    return { ok: true, asset, created: false };
  }
}
