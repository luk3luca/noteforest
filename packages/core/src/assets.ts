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
import type { Asset, Document } from './types.js';

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

/** The file exists under the id but its bytes no longer hash to that id. */
export interface AssetReadChanged {
  ok: false;
  id: AssetId;
  reason: 'changed';
  /** Hash the file content produced now. */
  actual: string;
  message: string;
}

export type AssetReadResult =
  | AssetReadSuccess
  | AssetReadMissing
  | AssetReadUnreadable
  | AssetReadChanged;

/**
 * Session availability of one image asset. This is derived runtime state, not
 * canonical document data: it never enters `document.json` and never changes
 * the asset record, image node, anchor, or branch.
 */
export type AssetAvailabilityState = 'available' | 'asset-missing' | 'asset-changed';

export type AssetAvailabilityDetail =
  | 'record-missing'
  | 'file-missing'
  | 'unreadable'
  | 'hash-mismatch'
  | 'unsupported-mime';

export interface AssetAvailability {
  id: AssetId;
  state: AssetAvailabilityState;
  detail?: AssetAvailabilityDetail;
  /** Short diagnostics label; never a filesystem path. */
  message?: string;
}

/**
 * Lookup used by anchor resolution and export planning. An absent id means the
 * asset has not been observed as unavailable; it is treated as available.
 */
export type AssetAvailabilityIndex = Readonly<Record<string, AssetAvailabilityState>>;

/** Build the compact index from the main-process availability list. */
export function assetAvailabilityIndex(
  entries: readonly AssetAvailability[],
): Record<string, AssetAvailabilityState> {
  const index: Record<string, AssetAvailabilityState> = {};
  for (const entry of entries) {
    if (entry.state !== 'available') index[entry.id] = entry.state;
  }
  return index;
}

/* -------------------------------------------------------------------------- */
/* Reference guard and garbage-collection policy                              */
/* -------------------------------------------------------------------------- */

/**
 * One live reference to an asset. The guard reports every reference instead of
 * only the first so a repair message can name everything the user must remove
 * or replace before the asset record can be deleted.
 */
export type AssetReference =
  | {
      kind: 'image-node';
      blockId: string;
      /** Path from the block content root to the image node. */
      path: number[];
      label: string;
    }
  | {
      kind: 'image-anchor';
      anchorId: string;
      blockId: string;
      label: string;
    };

export interface AssetGcPlan {
  /** Asset records that no live reference and no retained backup name. */
  reclaimable: AssetId[];
  /** Asset records kept, with every reason that keeps them. */
  retained: Array<{
    id: AssetId;
    reasons: Array<'live-image' | 'live-anchor' | 'retained-backup'>;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function imageAssetIdOf(content: { type?: unknown; attrs?: unknown }): string {
  if (content.type !== 'image' || !isRecord(content.attrs)) return '';
  const value = content.attrs['assetId'];
  return typeof value === 'string' ? value : '';
}

function collectNodeReferences(
  document: Document,
  assetId: AssetId,
): AssetReference[] {
  const references: AssetReference[] = [];
  const walk = (
    blockId: string,
    node: Document['blocks'][string]['content'],
    path: number[],
    label: string,
  ): void => {
    if (imageAssetIdOf(node) === assetId) {
      references.push({ kind: 'image-node', blockId, path: [...path], label });
    }
    for (const [index, child] of (node.children ?? []).entries()) {
      walk(blockId, child, [...path, index], label);
    }
  };
  for (const blockId of Object.keys(document.blocks).sort()) {
    const block = document.blocks[blockId];
    if (block === undefined) continue;
    walk(blockId, block.content, [], block.label ?? blockId);
  }
  return references;
}

function collectAnchorReferences(
  document: Document,
  assetId: AssetId,
): AssetReference[] {
  const references: AssetReference[] = [];
  for (const anchorId of Object.keys(document.anchors).sort()) {
    const anchor = document.anchors[anchorId];
    if (anchor === undefined || anchor.kind !== 'image' || !isRecord(anchor.selector)) {
      continue;
    }
    if (anchor.selector['assetId'] !== assetId) continue;
    const quote = typeof anchor.quote === 'string' ? anchor.quote.trim() : '';
    references.push({
      kind: 'image-anchor',
      anchorId,
      blockId: anchor.blockId,
      label: quote.length > 0 ? quote : anchorId,
    });
  }
  return references;
}

/**
 * Every live reference to one asset: image nodes in block content and image
 * anchors whose selector names the asset. A record with no reference is
 * removable; a referenced record is never deleted silently.
 */
export function imageAssetReferences(
  document: Document,
  assetId: AssetId,
): AssetReference[] {
  return [
    ...collectNodeReferences(document, assetId),
    ...collectAnchorReferences(document, assetId),
  ];
}

/** Every asset id that the live document references. */
export function referencedAssetIds(document: Document): Set<AssetId> {
  const ids = new Set<AssetId>();
  const walk = (node: Document['blocks'][string]['content']): void => {
    const id = imageAssetIdOf(node);
    if (id.length > 0) ids.add(id);
    for (const child of node.children ?? []) walk(child);
  };
  for (const block of Object.values(document.blocks)) walk(block.content);
  for (const anchor of Object.values(document.anchors)) {
    if (anchor.kind !== 'image' || !isRecord(anchor.selector)) continue;
    const id = anchor.selector['assetId'];
    if (typeof id === 'string' && id.length > 0) ids.add(id);
  }
  return ids;
}

/**
 * Deterministic asset-GC policy (no IO).
 *
 * An asset record is reclaimable only when nothing names it: no image node, no
 * image anchor, and no retained backup document. Backup references are supplied
 * by the caller (`retainedAssetIds`) because reading backups belongs to the Node
 * layer; backups contain `document.json` only, so this is the only way to keep
 * restore from resurrecting a record whose bytes were reclaimed.
 *
 * This function plans only asset *records*. It never deletes bytes, and it is
 * not run automatically: spec §10.8 requires an explicit pass after a backup
 * and a grace period.
 */
export function planAssetGc(
  document: Document,
  options: { retainedAssetIds?: Iterable<AssetId> } = {},
): AssetGcPlan {
  const backedUp = new Set<AssetId>();
  for (const id of options.retainedAssetIds ?? []) {
    if (typeof id === 'string' && id.length > 0) backedUp.add(id);
  }
  const reasons = new Map<AssetId, Set<'live-image' | 'live-anchor' | 'retained-backup'>>();
  const note = (id: AssetId, reason: 'live-image' | 'live-anchor' | 'retained-backup'): void => {
    const set = reasons.get(id) ?? new Set();
    set.add(reason);
    reasons.set(id, set);
  };
  const walk = (node: Document['blocks'][string]['content']): void => {
    const id = imageAssetIdOf(node);
    if (id.length > 0) note(id, 'live-image');
    for (const child of node.children ?? []) walk(child);
  };
  for (const block of Object.values(document.blocks)) walk(block.content);
  for (const anchor of Object.values(document.anchors)) {
    if (anchor.kind !== 'image' || !isRecord(anchor.selector)) continue;
    const id = anchor.selector['assetId'];
    if (typeof id === 'string' && id.length > 0) note(id, 'live-anchor');
  }
  for (const id of backedUp) note(id, 'retained-backup');

  const reclaimable: AssetId[] = [];
  const retained: AssetGcPlan['retained'] = [];
  for (const id of Object.keys(document.assets).sort()) {
    const set = reasons.get(id);
    if (set === undefined) reclaimable.push(id);
    else {
      retained.push({
        id,
        reasons: [...set].sort() as Array<'live-image' | 'live-anchor' | 'retained-backup'>,
      });
    }
  }
  return { reclaimable, retained };
}

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
