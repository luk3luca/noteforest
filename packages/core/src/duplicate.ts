/**
 * Pure duplicate/paste remap for a primary subtree (M3f2).
 *
 * UI paste/duplicate integration is deliberately out of scope. This module is
 * the model-level contract the future paste command will call:
 * - every copied block, anchor, and internal branch gets a fresh ID;
 * - anchor binding marks and atomic node attrs are remapped to the copied
 *   anchor IDs, with legacy `anchorId` normalized to canonical `anchorIds`;
 * - bindings to anchors outside the copied subtree are stripped (they must not
 *   point at the original document's records);
 * - primary branches fully inside the subtree are copied;
 * - reference branches are copied only when both endpoints and their anchor are
 *   inside the subtree; external references are recorded as skipped, not copied;
 * - the incoming primary branch of the duplicated root is not copied; placing
 *   the duplicate is the caller's job.
 *
 * The helper never mutates the document. Applying the returned records is a
 * separate command/placement step.
 */

import {
  ANCHOR_IDS_ATTR,
  LEGACY_ANCHOR_ID_ATTR,
} from './anchors.js';
import type { IdFactory } from './ids.js';
import { defaultIdFactory } from './ids.js';
import { subtreeBlockIds } from './structure.js';
import type {
  Anchor,
  Branch,
  ContentBlock,
  ContentMark,
  ContentNode,
  Document,
  JsonObject,
} from './types.js';

export interface DuplicateSubtreeOptions {
  /** ID source; pass a deterministic factory in tests. */
  newId?: IdFactory;
  /** Copy reference branches whose source and target are both in the subtree. */
  includeInternalReferences?: boolean;
}

export interface DuplicateSubtreePlan {
  sourceRootBlockId: string;
  /** Fresh ID of the duplicated root block. */
  rootBlockId: string;
  /** Source block ID -> copied block ID. */
  blockIdMap: Record<string, string>;
  /** Source anchor ID -> copied anchor ID. */
  anchorIdMap: Record<string, string>;
  /** Source branch ID -> copied branch ID. */
  branchIdMap: Record<string, string>;
  /** Copied block records, keyed by their new IDs. */
  blocks: Record<string, ContentBlock>;
  /** Copied anchor records, keyed by their new IDs. */
  anchors: Record<string, Anchor>;
  /** Copied branch records, keyed by their new IDs. */
  branches: Record<string, Branch>;
  /** External reference branches deliberately left behind. */
  skippedReferenceBranchIds: string[];
  /** Primary branches that could not be copied because they leave the subtree. */
  skippedPrimaryBranchIds: string[];
  /** External anchor IDs stripped from the copied content bindings. */
  strippedAnchorIds: string[];
}

export type DuplicateSubtreeResult =
  | { ok: true; plan: DuplicateSubtreePlan }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectDocumentIds(document: Document): Set<string> {
  const ids = new Set<string>([document.id]);
  for (const chapter of document.chapters) ids.add(chapter.id);
  for (const id of Object.keys(document.blocks)) ids.add(id);
  for (const id of Object.keys(document.anchors)) ids.add(id);
  for (const id of Object.keys(document.branches)) ids.add(id);
  for (const id of Object.keys(document.assets)) ids.add(id);
  return ids;
}

function allocateId(
  newId: IdFactory,
  taken: Set<string>,
): string | null {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const id = newId();
    if (typeof id === 'string' && id.length > 0 && !taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
  return null;
}

function remapAnchorIds(
  ids: readonly string[],
  anchorIdMap: Record<string, string>,
  stripped: Set<string>,
): string[] {
  const mapped = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0) continue;
    const replacement = anchorIdMap[id];
    if (replacement === undefined) stripped.add(id);
    else mapped.add(replacement);
  }
  return [...mapped].sort();
}

function bindingIds(attrs: JsonObject | undefined): string[] {
  if (!isRecord(attrs)) return [];
  const value = attrs[ANCHOR_IDS_ATTR];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  }
  const legacy = attrs[LEGACY_ANCHOR_ID_ATTR];
  return typeof legacy === 'string' && legacy.length > 0 ? [legacy] : [];
}

function hasBinding(attrs: JsonObject | undefined): boolean {
  return (
    isRecord(attrs) &&
    (ANCHOR_IDS_ATTR in attrs || LEGACY_ANCHOR_ID_ATTR in attrs)
  );
}

function remapMark(
  mark: ContentMark,
  anchorIdMap: Record<string, string>,
  stripped: Set<string>,
): ContentMark | null {
  if (mark.type !== 'anchor') return mark;
  const ids = remapAnchorIds(bindingIds(mark.attrs), anchorIdMap, stripped);
  if (ids.length === 0) return null;
  const attrs: JsonObject = { ...(mark.attrs ?? {}) };
  delete attrs[LEGACY_ANCHOR_ID_ATTR];
  attrs[ANCHOR_IDS_ATTR] = ids;
  return { ...mark, attrs };
}

function remapNode(
  node: ContentNode,
  anchorIdMap: Record<string, string>,
  stripped: Set<string>,
): void {
  if (node.type === 'text') {
    if (Array.isArray(node.marks)) {
      const marks: ContentMark[] = [];
      for (const mark of node.marks) {
        const remapped = remapMark(mark, anchorIdMap, stripped);
        if (remapped !== null) marks.push(remapped);
      }
      if (marks.length === 0) delete node.marks;
      else node.marks = marks;
    }
    return;
  }

  if (hasBinding(node.attrs)) {
    const ids = remapAnchorIds(bindingIds(node.attrs), anchorIdMap, stripped);
    const attrs: JsonObject = { ...(node.attrs ?? {}) };
    delete attrs[LEGACY_ANCHOR_ID_ATTR];
    if (ids.length === 0) {
      delete attrs[ANCHOR_IDS_ATTR];
    } else {
      attrs[ANCHOR_IDS_ATTR] = ids;
    }
    if (Object.keys(attrs).length === 0) delete node.attrs;
    else node.attrs = attrs;
  }

  for (const child of node.children ?? []) {
    remapNode(child, anchorIdMap, stripped);
  }
}

/**
 * Plan a duplicate of `rootBlockId` and all of its primary descendants.
 *
 * The result contains only copied records. Chapter slots, placement, and the
 * command/undo envelope are the caller's responsibility.
 */
export function planDuplicateSubtree(
  document: Document,
  rootBlockId: string,
  options: DuplicateSubtreeOptions = {},
): DuplicateSubtreeResult {
  if (document.blocks[rootBlockId] === undefined) {
    return { ok: false, reason: 'this block no longer exists' };
  }
  const newId = options.newId ?? defaultIdFactory;
  const includeInternalReferences = options.includeInternalReferences ?? true;
  const taken = collectDocumentIds(document);

  const subtreeIds = subtreeBlockIds(document, rootBlockId);
  const subtreeSet = new Set(subtreeIds);

  const blockIdMap: Record<string, string> = {};
  const anchorIdMap: Record<string, string> = {};
  const branchIdMap: Record<string, string> = {};

  try {
    for (const sourceId of subtreeIds) {
      const id = allocateId(newId, taken);
      if (id === null) return { ok: false, reason: 'could not generate a unique block ID' };
      blockIdMap[sourceId] = id;
    }

    const anchorSourceIds = Object.keys(document.anchors)
      .filter((anchorId) => subtreeSet.has(document.anchors[anchorId]?.blockId ?? ''))
      .sort();
    for (const sourceId of anchorSourceIds) {
      const id = allocateId(newId, taken);
      if (id === null) return { ok: false, reason: 'could not generate a unique anchor ID' };
      anchorIdMap[sourceId] = id;
    }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'could not generate duplicate IDs',
    };
  }

  const stripped = new Set<string>();
  const blocks: Record<string, ContentBlock> = {};
  for (const sourceId of subtreeIds) {
    const source = document.blocks[sourceId];
    const newBlockId = blockIdMap[sourceId];
    if (source === undefined || newBlockId === undefined) {
      return { ok: false, reason: `source block "${sourceId}" is missing` };
    }
    const block = structuredClone(source);
    block.id = newBlockId;
    remapNode(block.content, anchorIdMap, stripped);
    blocks[newBlockId] = block;
  }

  const anchors: Record<string, Anchor> = {};
  for (const sourceId of Object.keys(anchorIdMap)) {
    const source = document.anchors[sourceId];
    const newAnchorId = anchorIdMap[sourceId];
    if (source === undefined || newAnchorId === undefined) continue;
    const anchor = structuredClone(source);
    anchor.id = newAnchorId;
    anchor.blockId = blockIdMap[source.blockId] ?? source.blockId;
    anchors[newAnchorId] = anchor;
  }

  const branches: Record<string, Branch> = {};
  const skippedReferenceBranchIds: string[] = [];
  const skippedPrimaryBranchIds: string[] = [];
  const sourceBranchIds = Object.keys(document.branches).sort();
  for (const sourceId of sourceBranchIds) {
    const branch = document.branches[sourceId];
    if (branch === undefined) continue;
    const sourceInside = subtreeSet.has(branch.source.blockId);
    const targetInside = subtreeSet.has(branch.targetBlockId);
    if (!sourceInside && !targetInside) continue;
    if (branch.role === 'primary') {
      // The incoming edge of the duplicated root stays with the original.
      if (!sourceInside) continue;
      if (!targetInside) {
        skippedPrimaryBranchIds.push(branch.id);
        continue;
      }
      if (
        branch.source.anchorId !== undefined &&
        anchorIdMap[branch.source.anchorId] === undefined
      ) {
        skippedPrimaryBranchIds.push(branch.id);
        continue;
      }
    } else {
      if (!includeInternalReferences) {
        skippedReferenceBranchIds.push(branch.id);
        continue;
      }
      if (
        !sourceInside ||
        !targetInside ||
        (branch.source.anchorId !== undefined &&
          anchorIdMap[branch.source.anchorId] === undefined)
      ) {
        skippedReferenceBranchIds.push(branch.id);
        continue;
      }
    }

    const newBranchId = allocateId(newId, taken);
    if (newBranchId === null) {
      return { ok: false, reason: 'could not generate a unique branch ID' };
    }
    const copy = structuredClone(branch);
    copy.id = newBranchId;
    copy.source = {
      ...branch.source,
      blockId: blockIdMap[branch.source.blockId] ?? branch.source.blockId,
      ...(branch.source.anchorId === undefined
        ? {}
        : { anchorId: anchorIdMap[branch.source.anchorId] }),
    };
    copy.targetBlockId = blockIdMap[branch.targetBlockId] ?? branch.targetBlockId;
    branches[newBranchId] = copy;
    branchIdMap[branch.id] = newBranchId;
  }

  return {
    ok: true,
    plan: {
      sourceRootBlockId: rootBlockId,
      rootBlockId: blockIdMap[rootBlockId] as string,
      blockIdMap,
      anchorIdMap,
      branchIdMap,
      blocks,
      anchors,
      branches,
      skippedReferenceBranchIds,
      skippedPrimaryBranchIds,
      strippedAnchorIds: [...stripped].sort(),
    },
  };
}
