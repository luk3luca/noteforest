/**
 * Asset-store port for the image pipeline (contract only).
 *
 * Assets are content-addressed: an asset id is the lowercase hex SHA-256 of the
 * stored bytes, so identical bytes share one file and the document never
 * depends on the original file path. The store owns the file layout; the
 * document records only a package-relative path in `Asset.path`.
 *
 * This module is deliberately a contract: no filesystem, image decoding,
 * rendering, or UI. The content-addressed implementation belongs to M3c3b.
 */

import type { CoreError } from './errors.js';
import type { Asset } from './types.js';

/** Lowercase hex SHA-256 of the stored bytes. */
export type AssetId = string;

export interface AssetReadSuccess {
  ok: true;
  asset: Asset;
  bytes: Uint8Array;
}

export interface AssetReadMissing {
  ok: false;
  id: AssetId;
  reason: 'missing';
  message: string;
}

export interface AssetReadUnreadable {
  ok: false;
  id: AssetId;
  reason: 'unreadable';
  message: string;
}

export type AssetReadResult = AssetReadSuccess | AssetReadMissing | AssetReadUnreadable;

export interface AssetInsertInput {
  bytes: Uint8Array;
  /** MIME type recorded on the asset and used for rendering/export. */
  mime: string;
  /** Original filename, metadata only; never a filesystem dependency. */
  originalName?: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface AssetInsertSuccess {
  ok: true;
  /** Canonical record for `document.assets[id]`. */
  asset: Asset;
  /** False when identical bytes already existed (deduplicated). */
  created: boolean;
}

export interface AssetInsertFailure {
  ok: false;
  error: CoreError;
}

export type AssetInsertResult = AssetInsertSuccess | AssetInsertFailure;

/**
 * One document package's asset store.
 *
 * Implementations must keep every read, insert, and path inside
 * `packagePath`; an id is never a path. A missing asset is a typed result, not
 * an exception, so content and anchors survive.
 */
export interface AssetStore {
  /** Package this store belongs to. Assets never resolve outside it. */
  readonly packagePath: string;
  /** Content address for bytes. Implementations must use SHA-256 hex. */
  idForBytes(bytes: Uint8Array): AssetId;
  has(id: AssetId): Promise<boolean>;
  read(id: AssetId): Promise<AssetReadResult>;
  insert(input: AssetInsertInput): Promise<AssetInsertResult>;
  /** Package-relative POSIX path recorded in `Asset.path`. */
  pathFor(id: AssetId): string;
  /** Renderer-safe URL for display/export; never an absolute filesystem path. */
  urlFor(id: AssetId): string;
}
