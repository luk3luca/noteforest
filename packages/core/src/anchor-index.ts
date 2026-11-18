/**
 * One anchor-resolution index over the core resolver.
 *
 * The index composes `resolveDocumentAnchorsWithIndexes` and the per-block
 * `BlockAnchorIndex`; it never restates a resolution rule. It caches the block
 * indexes by the canonical JSON text of the block content, re-runs resolution
 * for every anchor on update (state also depends on branches, assets and
 * session availability), and produces the layout-facing projection once per
 * instance.
 *
 * One index describes exactly one document snapshot. `DocumentSession` owns it,
 * `DocumentRuntime` forwards it, and no surface derives anchor state on its
 * own. `update` returns a new instance; `blockIndex` fills the lazy cache on
 * first read, which is the only mutation a read may cause.
 */

import type { AssetAvailabilityIndex } from './assets.js';
import type { Document } from './types.js';
import {
  buildBlockAnchorIndex,
  resolveDocumentAnchorsWithIndexes,
  type AnchorResolution,
  type AnchorResolutionOptions,
  type AnchorResolvedRange,
  type AnchorState,
  type BlockAnchorIndex,
  type DocumentAnchorResolutions,
} from './anchors.js';

export interface AnchorIndexIdentity {
  readonly documentId: string;
  readonly revision?: number;
}

export interface AnchorIndexStats {
  /** Per-block indexes built by the last update. */
  blocksIndexed: number;
  /** Cached per-block indexes reused by the last update. */
  blocksReused: number;
  /** Anchors resolved by the last update. */
  anchorsResolved: number;
}

export interface AnchorViewEntry {
  anchorId: string;
  state: AnchorState;
  /** `resolution.resolved?.range`, never a candidate. */
  range: AnchorResolvedRange | null;
}

export interface AnchorResolutionView {
  documentId: string;
  revision?: number;
  /**
   * Every anchor, including idle and block-missing, under its declared
   * `blockId`; entries are in content order.
   */
  byBlock: Readonly<Record<string, readonly AnchorViewEntry[]>>;
}

export type AnchorIndexUpdate =
  | { blockKeys: ReadonlyMap<string, string>; editedBlockIds?: readonly string[] }
  | { blockKeys?: undefined; editedBlockIds?: undefined };

export interface AnchorIndexBuildOptions extends AnchorResolutionOptions {
  /** Content keys the caller already computed; decides which blocks rebuild. */
  blockKeys?: ReadonlyMap<string, string>;
  /**
   * Live session availability read at build and on every update. The session
   * replaces its availability object, so the index must read through a port
   * rather than capture the current value.
   */
  assetAvailabilityPort?: () => AssetAvailabilityIndex | undefined;
}

export interface AnchorIndex {
  readonly identity: AnchorIndexIdentity;
  readonly stats: AnchorIndexStats;

  entry(anchorId: string): AnchorResolution | null;
  /** Every resolution in anchor-ID order (the resolver's `anchorIds` order). */
  all(): readonly AnchorResolution[];
  /** The cached block index; builds and remembers it on first use. */
  blockIndex(blockId: string): BlockAnchorIndex | null;

  /** The layout-facing projection; built once per index instance. */
  view(): AnchorResolutionView;

  update(document: Document, change?: AnchorIndexUpdate): AnchorIndex;
}

interface IndexState {
  document: Document;
  indexes: Map<string, BlockAnchorIndex>;
  /** Key of the content each cached index actually indexed. */
  keys: Map<string, string>;
  resolutions: DocumentAnchorResolutions;
  stats: AnchorIndexStats;
  view: AnchorResolutionView | null;
  all: readonly AnchorResolution[] | null;
}

function identityOf(document: Document): AnchorIndexIdentity {
  return document.revision === undefined
    ? { documentId: document.id }
    : { documentId: document.id, revision: document.revision };
}

function resolutionOptions(options: AnchorIndexBuildOptions): AnchorResolutionOptions {
  if (options.assetAvailabilityPort !== undefined) {
    const availability = options.assetAvailabilityPort();
    return availability === undefined ? {} : { assetAvailability: availability };
  }
  return options.assetAvailability === undefined
    ? {}
    : { assetAvailability: options.assetAvailability };
}

class AnchorIndexImpl implements AnchorIndex {
  readonly identity: AnchorIndexIdentity;

  private readonly state: IndexState;

  private readonly options: AnchorIndexBuildOptions;

  constructor(
    document: Document,
    options: AnchorIndexBuildOptions,
    indexes: Map<string, BlockAnchorIndex>,
    keys: Map<string, string>,
    resolutions: DocumentAnchorResolutions,
    stats: AnchorIndexStats,
  ) {
    this.options = options;
    this.identity = identityOf(document);
    this.state = {
      document,
      indexes,
      keys,
      resolutions,
      stats,
      view: null,
      all: null,
    };
  }

  get stats(): AnchorIndexStats {
    return this.state.stats;
  }

  entry(anchorId: string): AnchorResolution | null {
    return this.state.resolutions.byId[anchorId] ?? null;
  }

  all(): readonly AnchorResolution[] {
    if (this.state.all === null) {
      this.state.all = this.state.resolutions.anchorIds.map(
        (anchorId) => this.state.resolutions.byId[anchorId] as AnchorResolution,
      );
    }
    return this.state.all;
  }

  blockIndex(blockId: string): BlockAnchorIndex | null {
    const cached = this.state.indexes.get(blockId);
    if (cached !== undefined) return cached;
    const block = this.state.document.blocks[blockId];
    if (block === undefined) return null;
    const built = buildBlockAnchorIndex(blockId, block.content);
    this.state.indexes.set(blockId, built);
    this.state.keys.set(blockId, JSON.stringify(block.content));
    return built;
  }

  view(): AnchorResolutionView {
    if (this.state.view === null) {
      const byBlock: Record<string, AnchorViewEntry[]> = {};
      for (const [blockId, list] of Object.entries(this.state.resolutions.byBlock)) {
        byBlock[blockId] = list.map((resolution) => ({
          anchorId: resolution.anchorId,
          state: resolution.state,
          range: resolution.resolved?.range ?? null,
        }));
      }
      this.state.view = {
        documentId: this.identity.documentId,
        ...(this.identity.revision === undefined ? {} : { revision: this.identity.revision }),
        byBlock,
      };
    }
    return this.state.view;
  }

  update(document: Document, change?: AnchorIndexUpdate): AnchorIndex {
    const nextOptions: AnchorIndexBuildOptions = {
      ...this.options,
      blockKeys: change?.blockKeys,
    };
    if (document.id !== this.identity.documentId) {
      return buildAnchorIndex(document, nextOptions);
    }
    const edited = new Set(change?.editedBlockIds ?? []);
    const supplied = change?.blockKeys;
    const indexes = new Map<string, BlockAnchorIndex>();
    const keys = new Map<string, string>();
    const wanted = new Set<string>(this.state.indexes.keys());
    for (const anchor of Object.values(document.anchors)) wanted.add(anchor.blockId);
    let blocksIndexed = 0;
    let blocksReused = 0;
    for (const blockId of wanted) {
      const block = document.blocks[blockId];
      if (block === undefined) continue;
      const cached = this.state.indexes.get(blockId);
      const cachedKey = this.state.keys.get(blockId);
      const suppliedKey = supplied?.has(blockId) === true ? supplied.get(blockId) : undefined;
      // A supplied key can only skip work; it never proves freshness. When it
      // matches the key this index actually stored, verify against the content
      // it is about to reuse. Identical content objects skip the re-serialise.
      const verified =
        cached !== undefined &&
        cachedKey !== undefined &&
        suppliedKey === cachedKey &&
        !edited.has(blockId) &&
        (cached.content === block.content || JSON.stringify(block.content) === cachedKey);
      if (verified) {
        indexes.set(blockId, cached);
        keys.set(blockId, cachedKey);
        blocksReused += 1;
      } else {
        indexes.set(blockId, buildBlockAnchorIndex(blockId, block.content));
        keys.set(blockId, JSON.stringify(block.content));
        blocksIndexed += 1;
      }
    }
    const resolutions = resolveDocumentAnchorsWithIndexes(
      document,
      indexes,
      resolutionOptions(nextOptions),
    );
    return new AnchorIndexImpl(document, nextOptions, indexes, keys, resolutions, {
      blocksIndexed,
      blocksReused,
      anchorsResolved: resolutions.anchorIds.length,
    });
  }
}

/**
 * Build the index for one document snapshot.
 *
 * Every block referenced by an anchor record gets a block index now; other
 * blocks are indexed lazily by `blockIndex()` so find and health can read them
 * without a document-wide pass.
 */
export function buildAnchorIndex(
  document: Document,
  options: AnchorIndexBuildOptions = {},
): AnchorIndex {
  const indexes = new Map<string, BlockAnchorIndex>();
  const keys = new Map<string, string>();
  const wanted = new Set<string>();
  for (const anchor of Object.values(document.anchors)) wanted.add(anchor.blockId);
  for (const blockId of wanted) {
    const block = document.blocks[blockId];
    if (block === undefined) continue;
    indexes.set(blockId, buildBlockAnchorIndex(blockId, block.content));
    keys.set(blockId, JSON.stringify(block.content));
  }
  const resolutions = resolveDocumentAnchorsWithIndexes(
    document,
    indexes,
    resolutionOptions(options),
  );
  return new AnchorIndexImpl(document, options, indexes, keys, resolutions, {
    blocksIndexed: indexes.size,
    blocksReused: 0,
    anchorsResolved: resolutions.anchorIds.length,
  });
}
