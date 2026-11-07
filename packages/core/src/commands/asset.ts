/**
 * Asset aggregate: canonical asset-record commands.
 *
 * The bytes are content-addressed and written by the platform `AssetStore`;
 * these commands only maintain the `document.assets` metadata map. They are
 * pure and undoable like every other command. Adding an id that already exists
 * keeps the existing record, so two inserts of identical bytes share one asset.
 */

import { imageAssetReferences } from '../assets.js';
import type { CoreContext } from '../ids.js';
import type { Asset, Document } from '../types.js';
import { assertId, canonicalJson, own, reject, type ChangeSet } from './shared.js';
import type {
  AssetAddCommand,
  AssetRemoveCommand,
  DocumentCommand,
} from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A package-relative POSIX path inside `assets/`. Absolute paths, drive
 * letters, remote URLs, and `..` segments are rejected before the record can
 * reach the document; the main process resolves the real file inside the
 * package root.
 */
export function isSafeAssetPath(value: string): boolean {
  if (value.length === 0 || value.startsWith('/') || value.startsWith('\\')) return false;
  if (/^[A-Za-z]:[\\/]/.test(value)) return false;
  if (value.startsWith('http://') || value.startsWith('https://')) return false;
  const segments = value.split(/[\\/]/);
  if (segments.includes('..')) return false;
  return segments[0] === 'assets' && segments.length >= 2;
}

function assertOptionalString(value: unknown, what: string): void {
  if (value !== undefined && typeof value !== 'string') {
    reject('invalid-command', `${what} must be a string`);
  }
}

function assertOptionalCount(value: unknown, what: string): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    reject('invalid-command', `${what} must be a non-negative integer`);
  }
}

function validatedAsset(value: unknown): Asset {
  if (!isRecord(value)) reject('invalid-command', 'asset must be an object');
  const asset = value as unknown as Asset;
  assertId(asset.id, 'asset.id');
  if (typeof asset.path !== 'string' || !isSafeAssetPath(asset.path)) {
    reject(
      'invalid-command',
      'asset.path must be a package-relative path inside assets/',
    );
  }
  if (typeof asset.mime !== 'string' || asset.mime.length === 0) {
    reject('invalid-command', 'asset.mime must be a non-empty string');
  }
  assertOptionalCount(asset.bytes, 'asset.bytes');
  assertOptionalCount(asset.width, 'asset.width');
  assertOptionalCount(asset.height, 'asset.height');
  assertOptionalString(asset.alt, 'asset.alt');
  assertOptionalString(asset.originalName, 'asset.originalName');
  return structuredClone(asset);
}

export function applyAssetAdd(
  document: Document,
  command: AssetAddCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  const asset = validatedAsset(command.asset);
  const existing = own(document.assets, asset.id);
  changes.asset(asset.id);
  if (existing !== undefined) {
    // Content addressing makes this a dedupe, not an error. The first record
    // stays canonical; a later insert may have different metadata (for example
    // a second filename) that must not silently rewrite it.
    if (canonicalJson(existing) !== canonicalJson(asset)) {
      changes.warn(
        `asset "${asset.id}" already exists with different metadata; the existing record was kept`,
      );
    }
    return null;
  }
  document.assets[asset.id] = asset;
  return { type: 'asset.remove', assetId: asset.id };
}

export function applyAssetRemove(
  document: Document,
  command: AssetRemoveCommand,
  _context: CoreContext,
  changes: ChangeSet,
): DocumentCommand | null {
  assertId(command.assetId, 'assetId');
  const existing = own(document.assets, command.assetId);
  if (existing === undefined) reject('not-found', `asset "${command.assetId}" does not exist`);
  // An asset record is metadata for live content and anchors. Removing it while
  // either still names the id would silently turn a present image into the
  // missing placeholder and break every dependent image anchor. The caller must
  // remove or replace those references first; there is no force flag.
  const references = imageAssetReferences(document, command.assetId);
  if (references.length > 0) {
    const nodes = references.filter((reference) => reference.kind === 'image-node').length;
    const anchors = references.length - nodes;
    const parts: string[] = [];
    if (nodes > 0) parts.push(`${nodes} image node${nodes === 1 ? '' : 's'}`);
    if (anchors > 0) parts.push(`${anchors} image anchor${anchors === 1 ? '' : 's'}`);
    const first = references[0];
    const where =
      first === undefined
        ? ''
        : first.kind === 'image-node'
          ? ` (first: block "${first.label}")`
          : ` (first: anchor "${first.label}")`;
    reject(
      'asset-in-use',
      `asset "${command.assetId}" is still referenced by ${parts.join(' and ')}${where}; replace or remove those images first`,
    );
  }
  delete document.assets[command.assetId];
  changes.asset(command.assetId);
  return { type: 'asset.add', asset: structuredClone(existing) };
}
