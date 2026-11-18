/**
 * Adapter between the canonical core content shape (`children`) and
 * ProseMirror's JSON shape (`content`).
 *
 * Core blocks hold a ProseMirror-shaped `doc` node with `children`; the editor
 * uses the custom `chapter` / `block` / `blockBody` / `branchChildren` wrapper
 * nodes. The wrapper nodes never leak into the stored content.
 */

import type {
  AnchorIndex,
  AnchorKind,
  AnchorState,
  AssetAvailabilityIndex,
  Branch,
  ContentNode,
  Document,
} from '@noteforest/core';
import {
  anchoredChildBranches,
  buildAnchorIndex,
  directChildBranches,
  directChildIds,
  normalizeAnchorIds,
} from '@noteforest/core';
import { assetUrlFor } from './asset-url';
import { anchorQuote, anchorState } from './tree';

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read anchor IDs from an `anchorIds` array or the M2 legacy single string. */
function anchorIdsFromAttrs(attrs: unknown): string[] {
  if (!isRecord(attrs)) return [];
  const value = attrs['anchorIds'];
  if (Array.isArray(value)) {
    return normalizeAnchorIds(
      value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
    );
  }
  const legacy = attrs['anchorId'];
  return typeof legacy === 'string' && legacy.length > 0 ? normalizeAnchorIds([legacy]) : [];
}

/**
 * Formula nodes use `mathBlock` in the canonical document (spec §4.4) but
 * TipTap's Mathematics extension names the editor node `blockMath`. The
 * adapter is the single bridge; both spellings are accepted on read.
 */
const EDITOR_NODE_TYPES: Readonly<Record<string, string>> = { mathBlock: 'blockMath' };
const CORE_NODE_TYPES: Readonly<Record<string, string>> = { blockMath: 'mathBlock' };
const ATOMIC_ANCHOR_NODE_TYPES = new Set([
  'mathBlock',
  'blockMath',
  'inlineMath',
  'codeBlock',
  'image',
]);

function editorNodeType(type: string): string {
  return EDITOR_NODE_TYPES[type] ?? type;
}

function coreNodeType(type: string): string {
  return CORE_NODE_TYPES[type] ?? type;
}

/**
 * Atomic anchor bindings are an additive `attrs.anchorIds` array (ADR-0005 §1).
 * Normalize the M2 legacy single string on read and omit an empty array so a
 * node without anchors has no `anchorIds` attribute.
 */
function atomicAnchorAttrs(
  nodeType: string,
  attrs: Record<string, unknown>,
): Record<string, unknown> {
  if (!ATOMIC_ANCHOR_NODE_TYPES.has(nodeType)) return attrs;
  const ids = anchorIdsFromAttrs(attrs);
  const next = { ...attrs };
  delete next['anchorId'];
  delete next['anchorIds'];
  if (ids.length > 0) next['anchorIds'] = ids;
  return next;
}

/**
 * Keep exactly one sorted `anchor` mark per node. Duplicate anchor marks and a
 * legacy `anchorId` are folded into the `anchorIds` array; empty marks vanish.
 */
function normalizeMarks<T extends { type: string; attrs?: Record<string, unknown> }>(
  marks: readonly T[],
): T[] {
  const others: T[] = [];
  const ids: string[] = [];
  for (const mark of marks) {
    if (mark.type === 'anchor') ids.push(...anchorIdsFromAttrs(mark.attrs));
    else others.push(mark);
  }
  const normalized = normalizeAnchorIds(ids);
  if (normalized.length > 0) {
    others.push({ type: 'anchor', attrs: { anchorIds: normalized } } as unknown as T);
  }
  return others;
}

/**
 * Copy/paste rule from ADR-0005 §7: pasted inline/atomic content must never
 * duplicate an anchor ID. The source keeps its anchors; the pasted copy loses
 * the binding. Block-level duplicate-subtree remapping is not part of M3b1.
 */
export function stripAnchorBindings(node: PMNode): PMNode {
  const result: PMNode = { type: node.type };
  const attrs = isRecord(node.attrs) ? { ...node.attrs } : undefined;
  if (attrs !== undefined) {
    delete attrs['anchorIds'];
    delete attrs['anchorId'];
    if (Object.keys(attrs).length > 0) result.attrs = attrs;
  }
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) {
    const marks = normalizeMarks(node.marks).filter((mark) => mark.type !== 'anchor');
    if (marks.length > 0) result.marks = marks;
  }
  if (Array.isArray(node.content)) result.content = node.content.map(stripAnchorBindings);
  return result;
}

/**
 * Drop pasted image nodes that are not backed by a package asset. External
 * HTML `<img src="https://…">` and data-URL images never become canonical
 * `src`-only nodes; a copied NoteForest image keeps its `assetId` and survives.
 */
export function stripUnbackedImages(node: PMNode): PMNode | null {
  if (node.type === 'image') {
    const assetId = node.attrs?.['assetId'];
    if (typeof assetId !== 'string' || assetId.length === 0) return null;
  }
  const result: PMNode = { type: node.type };
  if (node.attrs !== undefined) result.attrs = { ...node.attrs };
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) result.marks = node.marks.map((mark) => ({ ...mark }));
  if (Array.isArray(node.content)) {
    result.content = node.content
      .map(stripUnbackedImages)
      .filter((child): child is PMNode => child !== null);
  }
  return result;
}

/**
 * Cross-document paste guard: an image whose `assetId` is not present in the
 * destination document becomes a placeholder that keeps the source id in an
 * editor-only `clipboardAssetId`. The clipboard repair path copies the bytes,
 * records the asset, and then restores `assetId`. Until then the pasted content
 * never carries an asset id that resolves only in another package.
 */
export function markCrossDocumentImages(
  node: PMNode,
  knownAssets: ReadonlySet<string>,
): PMNode {
  const result: PMNode = { type: node.type };
  if (node.attrs !== undefined) {
    const attrs = { ...node.attrs };
    if (node.type === 'image') {
      const assetId = attrs['assetId'];
      if (typeof assetId === 'string' && assetId.length > 0 && !knownAssets.has(assetId)) {
        attrs['clipboardAssetId'] = assetId;
        delete attrs['assetId'];
        delete attrs['src'];
      }
    }
    result.attrs = attrs;
  }
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) result.marks = node.marks.map((mark) => ({ ...mark }));
  if (Array.isArray(node.content)) {
    result.content = node.content.map((child) => markCrossDocumentImages(child, knownAssets));
  }
  return result;
}

export interface ContentProjectionOptions {
  /** Canonical asset ids present in the document; drives missing-image projection. */
  knownAssets?: ReadonlySet<string>;
}

/**
 * Canonical image nodes store `assetId`, not a display path. The editor
 * projection adds `src` (a renderer-safe asset URL) and a view-only `missing`
 * flag; `pmToContent` removes both before canonical content is written back.
 */
function projectedImageAttrs(
  attrs: Record<string, unknown>,
  knownAssets: ReadonlySet<string> | undefined,
): Record<string, unknown> {
  const next = { ...attrs };
  const assetId = next['assetId'];
  // Legacy `src` is never a display source. M2 had no image insertion, so an
  // image with `src` but no `assetId` is unsupported: drop the path, keep alt,
  // and let the node view render the labeled placeholder. `pmToContent` removes
  // the same field on the next commit, so canonical content converges.
  delete next['src'];
  if (typeof assetId === 'string' && assetId.length > 0) {
    next['src'] = assetUrlFor(assetId);
    if (knownAssets !== undefined) next['missing'] = !knownAssets.has(assetId);
  } else {
    next['missing'] = true;
    const clipboard = next['clipboardAssetId'];
    if (typeof clipboard === 'string' && clipboard.length > 0) {
      next['missingReason'] = 'copy-pending';
    } else {
      next['missingReason'] =
        next['unavailable'] === 'cross-document-copy'
          ? 'cross-document-copy'
          : 'unsupported-src';
    }
  }
  return next;
}

/** Strip editor-only image fields; a legacy `src` never survives a commit. */
function canonicalImageAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const next = { ...attrs };
  delete next['missing'];
  delete next['missingLabel'];
  delete next['missingReason'];
  delete next['src'];
  delete next['title'];
  // `clipboardAssetId` is an editor-only pending-copy pointer: never canonical.
  delete next['clipboardAssetId'];
  delete next['clipboardUnavailable'];
  const assetId = next['assetId'];
  const hasAssetId = typeof assetId === 'string' && assetId.length > 0;
  if (assetId === null || assetId === undefined || assetId === '') delete next['assetId'];
  // `unavailable` describes a placeholder. Once the node names a real asset it
  // is stale by definition, so defense-in-depth cleanup drops it even if an
  // editor path forgot to clear it.
  if (hasAssetId || next['unavailable'] === null || next['unavailable'] === undefined) {
    delete next['unavailable'];
  }
  return next;
}

export function contentToPM(
  node: ContentNode,
  options: ContentProjectionOptions = {},
): PMNode {
  const result: PMNode = { type: editorNodeType(node.type) };
  const attrs = isRecord(node.attrs) ? { ...node.attrs } : {};
  const projected =
    node.type === 'image' ? projectedImageAttrs(attrs, options.knownAssets) : attrs;
  if (Object.keys(projected).length > 0) {
    result.attrs = atomicAnchorAttrs(node.type, projected);
  }
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) {
    const marks = node.marks.filter(isRecord).map((mark) => {
      const converted: PMMark = { type: String(mark['type']) };
      if (isRecord(mark['attrs'])) converted.attrs = { ...mark['attrs'] };
      return converted;
    });
    const normalized = normalizeMarks(marks);
    if (normalized.length > 0) result.marks = normalized;
  }
  if (Array.isArray(node.children)) {
    // Table cells are inline-only in the editor (special-text editing, D). The
    // loader refuses a document whose cell holds block content (VH1 guard in
    // the main process), so this projection never reshapes a cell: it maps the
    // canonical children one for one.
    result.content = node.children.map((child) => contentToPM(child, options));
  }
  return result;
}

export function pmToContent(node: PMNode): ContentNode {
  const result: ContentNode = { type: coreNodeType(node.type) };
  if (node.attrs !== undefined) {
    const attrs = node.type === 'image' ? canonicalImageAttrs(node.attrs) : node.attrs;
    if (Object.keys(attrs).length > 0) result.attrs = atomicAnchorAttrs(node.type, attrs);
  }
  if (typeof node.text === 'string') result.text = node.text;
  if (Array.isArray(node.marks)) {
    const marks = normalizeMarks(
      node.marks.map((mark) => ({
        type: mark.type,
        ...(mark.attrs === undefined ? {} : { attrs: { ...mark.attrs } }),
      })),
    );
    if (marks.length > 0) result.marks = marks;
  }
  if (Array.isArray(node.content)) result.children = node.content.map(pmToContent);
  return result;
}

/** ProseMirror body nodes for a block, always at least one paragraph. */
export function blockBodyContent(
  block: ContentNode,
  knownAssets?: ReadonlySet<string>,
): PMNode[] {
  const options: ContentProjectionOptions =
    knownAssets === undefined ? {} : { knownAssets };
  const children = Array.isArray(block.children)
    ? block.children.map((child) => contentToPM(child, options))
    : [];
  return children.length > 0 ? children : [{ type: 'paragraph' }];
}

export interface CalloutDescriptor {
  branchId: string;
  blockId: string;
  parentId: string;
  anchorId: string;
  kind: AnchorKind;
  quote: string;
  state: AnchorState;
}

export interface PrimaryChildProjection {
  /** Anchored primary children in outline order (D3). */
  callouts: CalloutDescriptor[];
  /** Direct primary children in branch order. */
  direct: Array<{ branchId: string; blockId: string }>;
  /**
   * One ordered list for the renderer: anchored callouts first (anchor order),
   * then direct children (branch order). `kind` is the only renderer-level
   * distinction; right/below placement is measured separately.
   */
  children: PrimaryChildEntry[];
}

export type PrimaryChildKind = 'callout' | 'direct';

export interface PrimaryChildEntry {
  kind: PrimaryChildKind;
  branchId: string;
  blockId: string;
  anchorId?: string;
  callout?: CalloutDescriptor;
}

function toCallout(
  document: Document,
  parentId: string,
  branch: Branch,
  anchorIndex: AnchorIndex,
): CalloutDescriptor {
  const anchorId = branch.source.anchorId ?? '';
  return {
    branchId: branch.id,
    blockId: branch.targetBlockId,
    parentId,
    anchorId,
    kind: document.anchors[anchorId]?.kind ?? 'text',
    quote: anchorQuote(document, anchorId),
    state: anchorState(anchorIndex, anchorId),
  };
}

/**
 * Asset ids that the projection may render. A record with no availability
 * entry is treated as available; missing/unreadable/changed assets are not.
 */
export function knownImageAssets(
  document: Document,
  assetAvailability?: AssetAvailabilityIndex,
): Set<string> {
  const known = new Set<string>();
  for (const id of Object.keys(document.assets)) {
    if (assetAvailability?.[id] === undefined || assetAvailability[id] === 'available') {
      known.add(id);
    }
  }
  return known;
}

/**
 * Rendering projection only: the canonical document keeps one ordered primary
 * child list. The callout lane shows anchored primary children first (D3); the
 * normal branch group shows direct primary children.
 */
export function projectPrimaryChildren(
  document: Document,
  parentBlockId: string,
  assetAvailability?: AssetAvailabilityIndex,
  anchorIndex: AnchorIndex = buildAnchorIndex(document, {
    assetAvailability,
  }),
): PrimaryChildProjection {
  const callouts = anchoredChildBranches(document, parentBlockId)
    .filter((branch) => document.blocks[branch.targetBlockId] !== undefined)
    .map((branch) => toCallout(document, parentBlockId, branch, anchorIndex));
  const direct = directChildBranches(document, parentBlockId)
    .filter((branch) => document.blocks[branch.targetBlockId] !== undefined)
    .map((branch) => ({ branchId: branch.id, blockId: branch.targetBlockId }));
  return {
    callouts,
    direct,
    children: [
      ...callouts.map((callout): PrimaryChildEntry => ({
        kind: 'callout',
        branchId: callout.branchId,
        blockId: callout.blockId,
        anchorId: callout.anchorId,
        callout,
      })),
      ...direct.map((item): PrimaryChildEntry => ({ kind: 'direct', ...item })),
    ],
  };
}

const EMPTY_PLACEMENT: ReadonlySet<string> = new Set();

export interface BelowRow {
  kind: 'callout' | 'direct';
  callout?: CalloutDescriptor;
}

export function buildBlockNode(
  document: Document,
  id: string,
  depth: number,
  collapsed: ReadonlySet<string>,
  seen: Set<string> = new Set(),
  belowRow?: BelowRow,
  belowChildIds: ReadonlySet<string> = EMPTY_PLACEMENT,
  assetAvailability?: AssetAvailabilityIndex,
  knownAssets: ReadonlySet<string> = knownImageAssets(document, assetAvailability),
  anchorIndex: AnchorIndex = buildAnchorIndex(document, { assetAvailability }),
): PMNode | null {
  if (seen.has(id)) return null;
  const block = document.blocks[id];
  if (block === undefined) return null;
  seen.add(id);
  const isCollapsed = collapsed.has(id);
  const projection = projectPrimaryChildren(document, id, assetAvailability, anchorIndex);
  // The branch port's hidden count is every primary child, anchored callouts
  // included, because collapsing hides both groups.
  const childCount = directChildIds(document, id).filter(
    (childId) => document.blocks[childId] !== undefined,
  ).length;
  const callout = belowRow?.kind === 'callout' ? belowRow.callout : undefined;
  const calloutAttrs =
    callout === undefined
      ? {}
      : {
          callout: true,
          anchorId: callout.anchorId,
          anchorKind: callout.kind,
          anchorQuote: callout.quote,
          anchorState: callout.state,
          calloutBranchId: callout.branchId,
          calloutParentId: callout.parentId,
        };
  const rowAttrs = belowRow === undefined ? {} : { belowRow: true, rowKind: belowRow.kind };
  const content: PMNode[] = [
    {
      type: 'blockBody',
      attrs: {
        blockId: id,
        depth,
        topLevel: depth === 0,
        collapsed: isCollapsed,
        childCount,
        ...calloutAttrs,
        ...rowAttrs,
      },
      content: blockBodyContent(block.content, knownAssets),
    },
  ];

  // Below stack order is deterministic: every callout first (anchor start,
  // anchor ID, branch order, already applied by the core selector), then the
  // wrapped direct children in branch order. Both live in one lane so the
  // router can draw one shared left trunk and one arm per row.
  const belowEntries = projection.children.filter(
    (entry) => entry.kind === 'callout' || belowChildIds.has(entry.blockId),
  );
  let laneBuilt = false;
  if (belowEntries.length > 0) {
    const rows = belowEntries
      .map((entry) =>
        buildBlockNode(
          document,
          entry.blockId,
          depth + 1,
          collapsed,
          seen,
          entry.kind === 'callout' && entry.callout !== undefined
            ? { kind: 'callout', callout: entry.callout }
            : { kind: 'direct' },
          belowChildIds,
          assetAvailability,
          knownAssets,
          anchorIndex,
        ),
      )
      .filter((node): node is PMNode => node !== null);
    if (rows.length > 0) {
      laneBuilt = true;
      content.push({
        type: 'calloutLane',
        attrs: { parentId: id, depth },
        content: rows,
      });
    }
  }
  const children = projection.children
    .filter((entry) => entry.kind === 'direct' && !belowChildIds.has(entry.blockId))
    .map((entry) =>
      buildBlockNode(
        document,
        entry.blockId,
        depth + 1,
        collapsed,
        seen,
        undefined,
        belowChildIds,
        assetAvailability,
        knownAssets,
        anchorIndex,
      ),
    )
    .filter((node): node is PMNode => node !== null);
  if (children.length > 0) {
    content.push({
      type: 'branchChildren',
      attrs: { parentId: id, depth },
      content: children,
    });
  }
  return {
    type: 'branchBlock',
    attrs: {
      blockId: id,
      depth,
      topLevel: depth === 0,
      collapsed: isCollapsed,
      label: block.label ?? null,
      border: block.border ?? null,
      callout: callout !== undefined,
      hasCallouts: laneBuilt,
      belowRow: belowRow !== undefined,
      rowKind: belowRow?.kind ?? null,
      anchorId: callout?.anchorId ?? null,
      anchorKind: callout?.kind ?? null,
      anchorQuote: callout?.quote ?? null,
      anchorState: callout?.state ?? null,
      calloutBranchId: callout?.branchId ?? null,
      calloutParentId: callout?.parentId ?? null,
    },
    content,
  };
}

export function buildEditorDocument(
  document: Document,
  collapsed: ReadonlySet<string>,
  belowChildIds: ReadonlySet<string> = EMPTY_PLACEMENT,
  assetAvailability?: AssetAvailabilityIndex,
  anchorIndex: AnchorIndex = buildAnchorIndex(document, { assetAvailability }),
): PMNode {
  const seen = new Set<string>();
  const knownAssets = knownImageAssets(document, assetAvailability);
  const buildBlock = (id: string, depth: number): PMNode | null =>
    buildBlockNode(
      document,
      id,
      depth,
      collapsed,
      seen,
      undefined,
      belowChildIds,
      assetAvailability,
      knownAssets,
      anchorIndex,
    );

  // Every chapter is rendered, including a legacy empty one. The `chapter`
  // node accepts `branch*`; an empty chapter is valid ProseMirror content and
  // keeps its title plus the "Add top-level block" row alive after reload.
  const chapters: PMNode[] = document.chapters.map((chapter) => ({
    type: 'chapter',
    attrs: { chapterId: chapter.id, title: chapter.title ?? 'Untitled chapter' },
    content: chapter.topLevelBlockIds
      .map((id) => buildBlock(id, 0))
      .filter((node): node is PMNode => node !== null),
  }));

  // A document always has at least one chapter. The fallback only protects the
  // editor from an invalid, chapter-less in-memory document; it never adds a
  // synthetic block.
  return {
    type: 'doc',
    content:
      chapters.length > 0
        ? chapters
        : [{ type: 'chapter', attrs: { chapterId: '', title: 'Untitled chapter' }, content: [] }],
  };
}

/**
 * Extract each block's canonical content from the editor document. Wrapper
 * nodes (chapter/block/branchChildren) are ignored; only blockBody content is
 * stored.
 */
export function extractBlockContents(editorDocument: PMNode): Map<string, { content: ContentNode; label: string | null }> {
  const result = new Map<string, { content: ContentNode; label: string | null }>();
  const walk = (node: PMNode): void => {
    if (node.type === 'blockBody') {
      const blockId = typeof node.attrs?.['blockId'] === 'string' ? node.attrs['blockId'] : null;
      if (blockId !== null) {
        const children = (node.content ?? []).map(pmToContent);
        result.set(blockId, {
          content: { type: 'doc', children },
          label: null,
        });
      }
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(editorDocument);
  return result;
}

/** Merge edited body into the previous canonical root, preserving unknown root data. */
export function withBody(base: ContentNode, body: ContentNode): ContentNode {
  const next: ContentNode = { ...base, type: 'doc' };
  delete (next as { content?: unknown }).content;
  next.children = body.children ?? [];
  return next;
}
