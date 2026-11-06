/**
 * Adapter between the canonical core content shape (`children`) and
 * ProseMirror's JSON shape (`content`).
 *
 * Core blocks hold a ProseMirror-shaped `doc` node with `children`; the editor
 * uses the custom `chapter` / `block` / `blockBody` / `branchChildren` wrapper
 * nodes. The wrapper nodes never leak into the stored content.
 */

import type { AnchorKind, AnchorState, Branch, ContentNode, Document } from '@noteforest/core';
import {
  anchoredChildBranches,
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
  if (typeof assetId === 'string' && assetId.length > 0) {
    next['src'] = assetUrlFor(assetId);
    if (knownAssets !== undefined) next['missing'] = !knownAssets.has(assetId);
  }
  return next;
}

/** Strip editor-only image fields; a legacy `src` survives when no assetId exists. */
function canonicalImageAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const next = { ...attrs };
  const assetId = next['assetId'];
  const hasAssetId = typeof assetId === 'string' && assetId.length > 0;
  delete next['missing'];
  delete next['missingLabel'];
  if (hasAssetId) {
    delete next['src'];
    delete next['title'];
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

function toCallout(document: Document, parentId: string, branch: Branch): CalloutDescriptor {
  const anchorId = branch.source.anchorId ?? '';
  return {
    branchId: branch.id,
    blockId: branch.targetBlockId,
    parentId,
    anchorId,
    kind: document.anchors[anchorId]?.kind ?? 'text',
    quote: anchorQuote(document, anchorId),
    state: anchorState(document, anchorId),
  };
}

/**
 * Rendering projection only: the canonical document keeps one ordered primary
 * child list. The callout lane shows anchored primary children first (D3); the
 * normal branch group shows direct primary children.
 */
export function projectPrimaryChildren(
  document: Document,
  parentBlockId: string,
): PrimaryChildProjection {
  const callouts = anchoredChildBranches(document, parentBlockId)
    .filter((branch) => document.blocks[branch.targetBlockId] !== undefined)
    .map((branch) => toCallout(document, parentBlockId, branch));
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
  knownAssets: ReadonlySet<string> = new Set(Object.keys(document.assets)),
): PMNode | null {
  if (seen.has(id)) return null;
  const block = document.blocks[id];
  if (block === undefined) return null;
  seen.add(id);
  const isCollapsed = collapsed.has(id);
  const projection = projectPrimaryChildren(document, id);
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
          knownAssets,
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
        knownAssets,
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
): PMNode {
  const seen = new Set<string>();
  const knownAssets = new Set(Object.keys(document.assets));
  const buildBlock = (id: string, depth: number): PMNode | null =>
    buildBlockNode(document, id, depth, collapsed, seen, undefined, belowChildIds, knownAssets);

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
