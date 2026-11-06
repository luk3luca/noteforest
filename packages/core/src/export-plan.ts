/**
 * Pure exactly-once export manifest (M3f2, AC-56 M3 evidence).
 *
 * The manifest is structural only: it orders blocks by the ratified D3 outline
 * traversal and records broken/ambiguous anchor markers. It has no page
 * geometry, renderer, or PDF dependency; M4 consumes the same ordering and
 * marker records when it composes pages.
 *
 * Contract:
 * - chapters in document order, top-level blocks in chapter order;
 * - every primary block appears exactly once, at its primary home;
 * - anchored primary children (callouts) come before direct primary children;
 * - reference edges add no entries and do not change the manifest at all;
 * - a broken/ambiguous anchor with at least one outgoing primary branch adds
 *   one marker record, but the target block is still emitted exactly once;
 * - repeated calls on the same canonical document return the same manifest.
 */

import type {
  AnchorResolution,
  AnchorResolutionReason,
  AnchorState,
} from './anchors.js';
import { compareAnchorResolutions, resolveDocumentAnchors } from './anchors.js';
import { compareBranches } from './structure.js';
import type { Branch, Document } from './types.js';

export interface ExportPlanEntry {
  /** Canonical block ID, emitted exactly once. */
  blockId: string;
  /** Chapter that owns the primary root of this block. */
  chapterId: string;
  /** Incoming primary branch; null for a chapter root. */
  branchId: string | null;
  /** Anchor that sources the incoming primary branch; null otherwise. */
  anchorId: string | null;
  /** True only for an anchored primary child (the callout lane). */
  callout: boolean;
  /** Zero-based depth in the primary tree; roots are 0. */
  depth: number;
  /** Zero-based reading index in the manifest. */
  index: number;
}

export interface ExportPlanMarker {
  /** Anchor record ID that produced the marker. */
  anchorId: string;
  /** Block that owns the anchor record. */
  blockId: string;
  /** Only non-resolved states produce export markers. */
  state: Extract<AnchorState, 'broken' | 'ambiguous'>;
  reason: AnchorResolutionReason;
  /** Outgoing primary branches from this anchor, in branch order. */
  branchIds: string[];
  /** Target blocks of those branches, unique and in branch order. */
  targetBlockIds: string[];
  /** Stored repair hints, when present. */
  repairFlags?: string[];
}

export interface ExportPlanCounts {
  chapters: number;
  blocks: number;
  branches: number;
  markers: number;
}

export interface ExportPlan {
  entries: ExportPlanEntry[];
  markers: ExportPlanMarker[];
  counts: ExportPlanCounts;
}

function isMarkerState(state: AnchorState): state is 'broken' | 'ambiguous' {
  return state === 'broken' || state === 'ambiguous';
}

function missingAnchorResolution(anchorId: string): AnchorResolution {
  return {
    anchorId,
    blockId: '',
    state: 'broken',
    reason: 'anchor-missing',
    candidates: [],
    resolved: null,
    binding: 'none',
    orderKey: null,
    issues: [],
  };
}

/**
 * Children of one block in D3 outline order: anchored primary branches first,
 * ordered by anchor resolution order then branch order, then direct primary
 * branches by branch order.
 *
 * The branch lists are pre-indexed once so a large document is not scanned per
 * block. Reference branches are never admitted here.
 */
function primaryChildrenBySource(document: Document): Map<string, Branch[]> {
  const map = new Map<string, Branch[]>();
  for (const branch of Object.values(document.branches)) {
    if (branch.role !== 'primary') continue;
    const list = map.get(branch.source.blockId) ?? [];
    list.push(branch);
    map.set(branch.source.blockId, list);
  }
  return map;
}

function orderedChildren(
  branches: readonly Branch[],
  resolutions: Record<string, AnchorResolution>,
  missing: Map<string, AnchorResolution>,
): Branch[] {
  const byAnchor = new Map<string, Branch[]>();
  const direct: Branch[] = [];
  for (const branch of branches) {
    const anchorId = branch.source.anchorId;
    if (anchorId === undefined) {
      direct.push(branch);
      continue;
    }
    const list = byAnchor.get(anchorId) ?? [];
    list.push(branch);
    byAnchor.set(anchorId, list);
  }

  const resolve = (anchorId: string): AnchorResolution => {
    const known = resolutions[anchorId];
    if (known !== undefined) return known;
    const cached = missing.get(anchorId);
    if (cached !== undefined) return cached;
    const fallback = missingAnchorResolution(anchorId);
    missing.set(anchorId, fallback);
    return fallback;
  };

  const anchorIds = [...byAnchor.keys()].sort((left, right) => {
    const order = compareAnchorResolutions(resolve(left), resolve(right));
    if (order !== 0) return order;
    return left < right ? -1 : left > right ? 1 : 0;
  });

  const ordered: Branch[] = [];
  for (const anchorId of anchorIds) {
    ordered.push(...[...(byAnchor.get(anchorId) ?? [])].sort(compareBranches));
  }
  ordered.push(...[...direct].sort(compareBranches));
  return ordered;
}

/**
 * Build the exactly-once export manifest.
 *
 * The function is pure: it never mutates the document, anchors, branches, or
 * content. It accepts a canonical (validated) document; malformed documents are
 * still traversed defensively, skipping blocks and branches that cannot be
 * emitted once.
 */
export function buildExportPlan(document: Document): ExportPlan {
  const resolutions = resolveDocumentAnchors(document).byId;
  const childrenBySource = primaryChildrenBySource(document);
  const missing = new Map<string, AnchorResolution>();
  const entries: ExportPlanEntry[] = [];
  const markers: ExportPlanMarker[] = [];
  const markerByAnchor = new Map<string, ExportPlanMarker>();
  const emittedBlocks = new Set<string>();

  const addMarker = (
    anchorId: string,
    hostBlockId: string,
    branch: Branch,
    resolution: AnchorResolution,
  ): void => {
    if (!isMarkerState(resolution.state)) return;
    const existing = markerByAnchor.get(anchorId);
    if (existing !== undefined) {
      existing.branchIds.push(branch.id);
      if (!existing.targetBlockIds.includes(branch.targetBlockId)) {
        existing.targetBlockIds.push(branch.targetBlockId);
      }
      return;
    }
    const marker: ExportPlanMarker = {
      anchorId,
      blockId: hostBlockId,
      state: resolution.state,
      reason: resolution.reason,
      branchIds: [branch.id],
      targetBlockIds: [branch.targetBlockId],
      ...(resolution.repairFlags === undefined
        ? {}
        : { repairFlags: [...resolution.repairFlags] }),
    };
    markerByAnchor.set(anchorId, marker);
    markers.push(marker);
  };

  const visit = (
    blockId: string,
    chapterId: string,
    incoming: { branchId: string | null; anchorId: string | null },
    depth: number,
  ): void => {
    if (emittedBlocks.has(blockId)) return;
    if (document.blocks[blockId] === undefined) return;
    emittedBlocks.add(blockId);
    entries.push({
      blockId,
      chapterId,
      branchId: incoming.branchId,
      anchorId: incoming.anchorId,
      callout: incoming.anchorId !== null,
      depth,
      index: entries.length,
    });

    for (const branch of orderedChildren(
      childrenBySource.get(blockId) ?? [],
      resolutions,
      missing,
    )) {
      const anchorId = branch.source.anchorId;
      if (anchorId !== undefined) {
        const resolution = resolutions[anchorId];
        if (resolution !== undefined) addMarker(anchorId, blockId, branch, resolution);
      }
      visit(
        branch.targetBlockId,
        chapterId,
        { branchId: branch.id, anchorId: anchorId ?? null },
        depth + 1,
      );
    }
  };

  for (const chapter of document.chapters) {
    for (const blockId of chapter.topLevelBlockIds) {
      visit(blockId, chapter.id, { branchId: null, anchorId: null }, 0);
    }
  }

  return {
    entries,
    markers,
    counts: {
      chapters: document.chapters.length,
      blocks: entries.length,
      branches: entries.reduce((count, entry) => count + (entry.branchId === null ? 0 : 1), 0),
      markers: markers.length,
    },
  };
}
