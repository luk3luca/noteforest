/**
 * Document health audit: one pure, read-only pass over the canonical document.
 *
 * The audit is the single source of truth for the health sheet, the status bar,
 * and (later) the activity-bar badge. It reuses the core anchor resolver and the
 * branch graph instead of duplicating either:
 *
 * - anchor state/reason/candidates come from `resolveDocumentAnchors`;
 * - anchor content bindings come from `buildBlockAnchorIndex`;
 * - block reachability is a closure over canonical branches.
 *
 * Nothing here mutates the document and nothing is fixed automatically. Every
 * repair is an explicit typed command applied by the sheet.
 *
 * Classification priority matters for the broken-anchor contract (D5): an
 * anchor with a live branch whose content binding disappeared is **broken**
 * (repair it), not an orphan. Only a branchless record with no content binding
 * is an orphan record, and only an anchor with no branch at all is idle.
 */

import type {
  Anchor,
  AnchorIndex,
  AnchorKind,
  AnchorResolution,
  AssetAvailabilityIndex,
  Branch,
  ContentBlock,
  ContentNode,
  Document,
} from '@noteforest/core';
import {
  buildBlockAnchorIndex,
  codeBlockText,
  contentHasAnchorBinding,
  formulaLatex,
  getNodeAtPath,
  imageAltText,
  resolveDocumentAnchors,
} from '@noteforest/core';
import {
  anchorHealthBlockTitle,
  anchorHealthBranchViews,
  anchorHealthChapterTitle,
  anchorHealthContextFields,
  anchorHealthReason,
  type AnchorHealthBranch,
} from './anchor-health';
import { anchorQuote, ancestorPath, blockPlainText, blockTitle } from './tree';

export type DocumentHealthCategory =
  | 'broken'
  | 'ambiguous'
  | 'anchor-block-missing'
  | 'idle'
  | 'orphan-reference'
  | 'orphan-record'
  | 'branch-target-missing'
  | 'orphan-block'
  | 'duplicate-primary'
  | 'cycle'
  | 'empty-chapter'
  | 'hidden';

export type DocumentHealthFilter =
  | 'all'
  | 'needs-repair'
  | 'broken'
  | 'ambiguous'
  | 'idle'
  | 'orphans'
  | 'structure'
  | 'hidden';

export type DocumentHealthSeverity = 'S1' | 'S2' | 'S3';

/** A canonical anchor binding occurrence, without an anchor record. */
export interface ContentAnchorReference {
  blockId: string;
  nodePath: number[];
  nodeType: string;
  source: 'text-mark' | 'atomic-attr' | 'legacy-attr';
}

export interface DocumentHealthRow {
  /** Stable row identity: category-scoped, never a display label. */
  id: string;
  category: DocumentHealthCategory;
  severity: DocumentHealthSeverity;
  /** S1/S2 rows need repair; S3 rows are information. */
  needsRepair: boolean;
  anchorId?: string;
  /** Source or owning block. Absent for an empty chapter. */
  blockId?: string;
  chapterId?: string;
  branchId?: string;
  targetBlockId?: string;
  kind: AnchorKind | null;
  quote: string;
  prefix: string;
  suffix: string;
  blockTitle: string;
  chapterTitle: string;
  branchCount: number;
  branches: AnchorHealthBranch[];
  reason: string;
  reasonLabel: string;
  resolution?: AnchorResolution;
  occurrences?: ContentAnchorReference[];
  /** True on a hidden row (marker not visible because an ancestor collapsed). */
  collapsed?: boolean;
  /** Extra machine-readable detail (cycle ids, target id, chapter id). */
  detail?: string;
}

export interface DocumentHealthCounts {
  all: number;
  needsRepair: number;
  broken: number;
  ambiguous: number;
  idle: number;
  orphans: number;
  structure: number;
  hidden: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface DocumentHealthReport {
  rows: DocumentHealthRow[];
  counts: DocumentHealthCounts;
  /** Roll-up for the empty state and the muted status-bar indicator. */
  info: {
    idle: number;
    orphans: number;
    structure: number;
    hidden: number;
  };
}

export interface DocumentHealthOptions {
  assetAvailability?: AssetAvailabilityIndex;
  /** View state: a marker whose ancestor is collapsed is listed as hidden. */
  collapsedBlockIds?: ReadonlySet<string>;
  /** The session's one anchor index; absent only in pure unit tests. */
  anchorIndex?: AnchorIndex;
}

interface AnchorResolutionsLookup {
  anchorIds: readonly string[];
  byId: Readonly<Record<string, AnchorResolution>>;
}

function anchorResolutionsFor(
  document: Document,
  options: DocumentHealthOptions,
): AnchorResolutionsLookup {
  if (options.anchorIndex !== undefined) {
    const all = options.anchorIndex.all();
    const byId: Record<string, AnchorResolution> = {};
    for (const resolution of all) byId[resolution.anchorId] = resolution;
    return { anchorIds: all.map((resolution) => resolution.anchorId), byId };
  }
  const resolved = resolveDocumentAnchors(
    document,
    options.assetAvailability === undefined
      ? {}
      : { assetAvailability: options.assetAvailability },
  );
  return { anchorIds: resolved.anchorIds, byId: resolved.byId };
}

export const DOCUMENT_HEALTH_CATEGORY_LABELS: Record<DocumentHealthCategory, string> = {
  broken: 'Lost anchor',
  ambiguous: 'Ambiguous anchor',
  'anchor-block-missing': 'Missing block',
  idle: 'Idle anchor',
  'orphan-reference': 'Unlinked mark',
  'orphan-record': 'Unused anchor',
  'branch-target-missing': 'Missing target',
  'orphan-block': 'Unreachable block',
  'duplicate-primary': 'Duplicate home',
  cycle: 'Cycle',
  'empty-chapter': 'Empty chapter',
  hidden: 'Hidden anchor',
};

export const DOCUMENT_HEALTH_FILTERS: ReadonlyArray<{
  id: DocumentHealthFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'needs-repair', label: 'Needs repair' },
  { id: 'broken', label: 'Broken' },
  { id: 'ambiguous', label: 'Ambiguous' },
  { id: 'idle', label: 'Idle' },
  { id: 'orphans', label: 'Orphans' },
  { id: 'structure', label: 'Structure' },
  { id: 'hidden', label: 'Hidden' },
];

const SEVERITY_BY_CATEGORY: Record<DocumentHealthCategory, DocumentHealthSeverity> = {
  broken: 'S2',
  ambiguous: 'S2',
  'anchor-block-missing': 'S1',
  idle: 'S3',
  'orphan-reference': 'S1',
  'orphan-record': 'S2',
  'branch-target-missing': 'S1',
  'orphan-block': 'S1',
  'duplicate-primary': 'S1',
  cycle: 'S1',
  'empty-chapter': 'S3',
  hidden: 'S3',
};

const CATEGORY_RANK: Record<DocumentHealthCategory, number> = {
  'anchor-block-missing': 0,
  'branch-target-missing': 1,
  'orphan-block': 2,
  'duplicate-primary': 3,
  cycle: 4,
  'orphan-reference': 5,
  broken: 10,
  ambiguous: 11,
  'orphan-record': 12,
  idle: 20,
  'empty-chapter': 21,
  hidden: 22,
};

const STRUCTURE_CATEGORIES: ReadonlySet<DocumentHealthCategory> = new Set([
  'branch-target-missing',
  'orphan-block',
  'duplicate-primary',
  'cycle',
  'empty-chapter',
]);

const ORPHAN_CATEGORIES: ReadonlySet<DocumentHealthCategory> = new Set([
  'orphan-reference',
  'orphan-record',
]);

const MAX_QUOTE = 64;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function truncate(value: string): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_QUOTE ? `${clean.slice(0, MAX_QUOTE - 1)}…` : clean;
}

function severityRank(severity: DocumentHealthSeverity): number {
  return severity === 'S1' ? 0 : severity === 'S2' ? 1 : 2;
}

export function documentHealthNeedsRepair(category: DocumentHealthCategory): boolean {
  return SEVERITY_BY_CATEGORY[category] !== 'S3';
}

export function documentHealthStateLabel(category: DocumentHealthCategory): string {
  return DOCUMENT_HEALTH_CATEGORY_LABELS[category];
}

function chapterTitleFor(document: Document, blockId: string | undefined): string {
  if (blockId === undefined) return 'No chapter';
  return anchorHealthChapterTitle(document, blockId);
}

function blockTitleFor(document: Document, blockId: string | undefined): string {
  if (blockId === undefined) return '—';
  if (document.blocks[blockId] === undefined) return 'Missing block';
  return blockTitle(document.blocks[blockId]);
}

function reasonFor(category: DocumentHealthCategory, resolution?: AnchorResolution): string {
  switch (category) {
    case 'broken':
    case 'ambiguous':
    case 'idle':
      return resolution === undefined
        ? 'The anchor cannot be resolved.'
        : anchorHealthReason(resolution.reason);
    case 'anchor-block-missing':
      return 'The anchor’s block no longer exists. Its branches cannot be restored in place.';
    case 'orphan-reference':
      return 'Content carries an anchor ID with no anchor record. The mark is inert.';
    case 'orphan-record':
      return 'The anchor record is not bound to any content and has no branches.';
    case 'branch-target-missing':
      return 'The branch target block no longer exists.';
    case 'orphan-block':
      return 'This block is not reachable from any chapter or branch.';
    case 'duplicate-primary':
      return 'More than one primary branch targets this block; the tree has two homes.';
    case 'cycle':
      return 'Primary branches form a cycle, so the tree cannot be laid out until it is fixed.';
    case 'empty-chapter':
      return 'This chapter has no top-level blocks.';
    case 'hidden':
      return 'The anchor marker is hidden because an ancestor block is collapsed.';
    default:
      return 'The document has a health issue.';
  }
}

function reasonKey(category: DocumentHealthCategory, resolution?: AnchorResolution): string {
  if (category === 'broken' || category === 'ambiguous' || category === 'idle') {
    return resolution?.reason ?? category;
  }
  return category;
}

function baseRow(
  document: Document,
  input: {
    id: string;
    category: DocumentHealthCategory;
    anchorId?: string;
    blockId?: string;
    chapterId?: string;
    branchId?: string;
    targetBlockId?: string;
    kind?: AnchorKind | null;
    quote?: string;
    prefix?: string;
    suffix?: string;
    blockTitle?: string;
    chapterTitle?: string;
    branches?: AnchorHealthBranch[];
    reason?: string;
    reasonLabel?: string;
    resolution?: AnchorResolution;
    occurrences?: ContentAnchorReference[];
    collapsed?: boolean;
    detail?: string;
  },
): DocumentHealthRow {
  const severity = SEVERITY_BY_CATEGORY[input.category];
  const branches = input.branches ?? [];
  return {
    id: input.id,
    category: input.category,
    severity,
    needsRepair: documentHealthNeedsRepair(input.category),
    ...(input.anchorId === undefined ? {} : { anchorId: input.anchorId }),
    ...(input.blockId === undefined ? {} : { blockId: input.blockId }),
    ...(input.chapterId === undefined ? {} : { chapterId: input.chapterId }),
    ...(input.branchId === undefined ? {} : { branchId: input.branchId }),
    ...(input.targetBlockId === undefined ? {} : { targetBlockId: input.targetBlockId }),
    kind: input.kind ?? null,
    quote: input.quote ?? '',
    prefix: input.prefix ?? '',
    suffix: input.suffix ?? '',
    blockTitle: input.blockTitle ?? blockTitleFor(document, input.blockId),
    chapterTitle: input.chapterTitle ?? chapterTitleFor(document, input.blockId),
    branchCount: branches.length,
    branches,
    reason: input.reason ?? input.category,
    reasonLabel: input.reasonLabel ?? reasonFor(input.category, input.resolution),
    ...(input.resolution === undefined ? {} : { resolution: input.resolution }),
    ...(input.occurrences === undefined ? {} : { occurrences: input.occurrences }),
    ...(input.collapsed === undefined ? {} : { collapsed: input.collapsed }),
    ...(input.detail === undefined ? {} : { detail: input.detail }),
  };
}

function compareRows(left: DocumentHealthRow, right: DocumentHealthRow): number {
  const severity = severityRank(left.severity) - severityRank(right.severity);
  if (severity !== 0) return severity;
  const category = CATEGORY_RANK[left.category] - CATEGORY_RANK[right.category];
  if (category !== 0) return category;
  return (
    compareStrings(left.chapterTitle, right.chapterTitle) ||
    compareStrings(left.blockTitle, right.blockTitle) ||
    compareStrings(left.quote, right.quote) ||
    compareStrings(left.id, right.id)
  );
}

/**
 * Collect every anchor ID referenced by content, including bindings with no
 * record. `buildBlockAnchorIndex` is the core reader for text marks and atomic
 * attrs; the cheap pre-check keeps blocks without anchors out of the index.
 */
function contentAnchorReferences(
  document: Document,
  anchorIndex?: AnchorIndex,
): Map<string, ContentAnchorReference[]> {
  const references = new Map<string, ContentAnchorReference[]>();
  for (const blockId of Object.keys(document.blocks).sort(compareStrings)) {
    const block = document.blocks[blockId];
    if (block === undefined || !contentHasAnchorBinding(block.content)) continue;
    const index =
      anchorIndex?.blockIndex(block.id) ?? buildBlockAnchorIndex(block.id, block.content);
    for (const [anchorId, occurrences] of index.occurrences) {
      const list = references.get(anchorId) ?? [];
      for (const occurrence of occurrences) {
        list.push({
          blockId: block.id,
          nodePath: [...occurrence.nodePath],
          nodeType: occurrence.nodeType,
          source: occurrence.source,
        });
      }
      references.set(anchorId, list);
    }
  }
  return references;
}

function occurrenceKind(nodeType: string): AnchorKind | null {
  if (nodeType === 'text') return 'text';
  if (nodeType === 'inlineMath' || nodeType === 'mathBlock') return 'formula';
  if (nodeType === 'codeBlock') return 'code';
  if (nodeType === 'image') return 'image';
  return null;
}

function occurrenceQuote(block: ContentBlock, occurrence: ContentAnchorReference): string {
  const node: ContentNode | null = getNodeAtPath(block.content, occurrence.nodePath);
  if (node === null) return '';
  if (node.type === 'text') return truncate(node.text ?? '');
  if (node.type === 'inlineMath' || node.type === 'mathBlock') {
    return truncate(formulaLatex(node));
  }
  if (node.type === 'codeBlock') {
    return truncate(codeBlockText(node).split('\n')[0] ?? '');
  }
  if (node.type === 'image') return truncate(imageAltText(node));
  return '';
}

function outgoingBranchesByBlock(document: Document): Map<string, Branch[]> {
  const byBlock = new Map<string, Branch[]>();
  for (const branch of Object.values(document.branches)) {
    const list = byBlock.get(branch.source.blockId) ?? [];
    list.push(branch);
    byBlock.set(branch.source.blockId, list);
  }
  return byBlock;
}

function outgoingBranchesByAnchor(document: Document): Map<string, Branch[]> {
  const byAnchor = new Map<string, Branch[]>();
  for (const branch of Object.values(document.branches)) {
    const anchorId = branch.source.anchorId;
    if (anchorId === undefined) continue;
    const list = byAnchor.get(anchorId) ?? [];
    list.push(branch);
    byAnchor.set(anchorId, list);
  }
  return byAnchor;
}

function isHiddenByCollapse(
  document: Document,
  blockId: string,
  collapsed: ReadonlySet<string> | undefined,
): boolean {
  if (collapsed === undefined || collapsed.size === 0) return false;
  return ancestorPath(document, blockId)
    .slice(0, -1)
    .some((id) => collapsed.has(id));
}

/**
 * A block is reachable when it is a chapter root or a branch target whose source
 * is reachable. Both primary and reference edges keep a block reachable: a
 * reference target is visible in the document even without a primary home.
 */
function reachableBlockIds(document: Document): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [];
  for (const chapter of document.chapters) {
    for (const blockId of chapter.topLevelBlockIds) {
      if (document.blocks[blockId] === undefined) continue;
      if (reachable.has(blockId)) continue;
      reachable.add(blockId);
      queue.push(blockId);
    }
  }
  const outgoing = new Map<string, Branch[]>();
  for (const branch of Object.values(document.branches)) {
    const list = outgoing.get(branch.source.blockId) ?? [];
    list.push(branch);
    outgoing.set(branch.source.blockId, list);
  }
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) continue;
    for (const branch of outgoing.get(current) ?? []) {
      const target = branch.targetBlockId;
      if (document.blocks[target] === undefined || reachable.has(target)) continue;
      reachable.add(target);
      queue.push(target);
    }
  }
  return reachable;
}

interface Cycle {
  ids: string[];
  branches: Branch[];
}

function primaryCycles(document: Document): Cycle[] {
  const children = new Map<string, Branch[]>();
  for (const branch of Object.values(document.branches)) {
    if (branch.role !== 'primary') continue;
    if (document.blocks[branch.source.blockId] === undefined) continue;
    if (document.blocks[branch.targetBlockId] === undefined) continue;
    const list = children.get(branch.source.blockId) ?? [];
    list.push(branch);
    children.set(branch.source.blockId, list);
  }
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const stackBranches: Branch[] = [];
  const seen = new Set<string>();
  const cycles: Cycle[] = [];

  const visit = (blockId: string): void => {
    state.set(blockId, 1);
    stack.push(blockId);
    for (const branch of children.get(blockId) ?? []) {
      const target = branch.targetBlockId;
      const targetState = state.get(target) ?? 0;
      if (targetState === 1) {
        const index = stack.indexOf(target);
        const ids = index >= 0 ? stack.slice(index) : [target];
        const branches = [...stackBranches.slice(index), branch];
        const key = [...ids].sort(compareStrings).join('\u0000');
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push({ ids, branches });
        }
        continue;
      }
      if (targetState === 2) continue;
      stackBranches.push(branch);
      visit(target);
      stackBranches.pop();
    }
    stack.pop();
    state.set(blockId, 2);
  };

  for (const blockId of Object.keys(document.blocks).sort(compareStrings)) {
    if ((state.get(blockId) ?? 0) === 0) visit(blockId);
  }
  return cycles;
}

/**
 * Audit one open document. Pure and read-only: the same inputs always produce
 * the same rows, and no command is applied.
 */
export function auditDocumentHealth(
  document: Document,
  options: DocumentHealthOptions = {},
): DocumentHealthReport {
  const resolutions = anchorResolutionsFor(document, options);
  const references = contentAnchorReferences(document, options.anchorIndex);
  const branchesByAnchor = outgoingBranchesByAnchor(document);
  const branchesByBlock = outgoingBranchesByBlock(document);
  const rows: DocumentHealthRow[] = [];

  const anchorRow = (
    anchor: Anchor,
    resolution: AnchorResolution,
    category: DocumentHealthCategory,
    extra: Partial<Parameters<typeof baseRow>[1]> = {},
  ): DocumentHealthRow => {
    const context = anchorHealthContextFields(anchor);
    const branches = anchorHealthBranchViews(
      document,
      branchesByAnchor.get(anchor.id) ?? [],
    );
    return baseRow(document, {
      id: `anchor:${anchor.id}`,
      category,
      anchorId: anchor.id,
      blockId: anchor.blockId,
      kind: anchor.kind,
      quote: anchorQuote(document, anchor.id),
      prefix: context.prefix,
      suffix: context.suffix,
      blockTitle: anchorHealthBlockTitle(document, anchor.blockId, anchor.kind),
      chapterTitle: chapterTitleFor(document, anchor.blockId),
      branches,
      reason: reasonKey(category, resolution),
      reasonLabel: reasonFor(category, resolution),
      resolution,
      ...extra,
    });
  };

  // ---------------------------------------------------------------------
  // Anchors. Priority: missing block, live states, then idle/orphan cleanup.
  // ---------------------------------------------------------------------
  for (const anchorId of resolutions.anchorIds) {
    const anchor = document.anchors[anchorId];
    const resolution = resolutions.byId[anchorId];
    if (anchor === undefined || resolution === undefined) continue;
    const liveBranches = branchesByAnchor.get(anchorId) ?? [];
    const anchorReferences = references.get(anchorId) ?? [];

    if (resolution.state === 'block-missing') {
      rows.push(
        anchorRow(anchor, resolution, 'anchor-block-missing', {
          blockTitle: 'Missing block',
          chapterTitle: 'No chapter',
        }),
      );
      continue;
    }
    if (liveBranches.length > 0) {
      if (resolution.state === 'broken') {
        rows.push(anchorRow(anchor, resolution, 'broken'));
      } else if (resolution.state === 'ambiguous') {
        rows.push(anchorRow(anchor, resolution, 'ambiguous'));
      } else if (
        resolution.state === 'resolved' &&
        isHiddenByCollapse(document, anchor.blockId, options.collapsedBlockIds)
      ) {
        rows.push(anchorRow(anchor, resolution, 'hidden', { collapsed: true }));
      }
      continue;
    }
    if (anchorReferences.length === 0) {
      rows.push(anchorRow(anchor, resolution, 'orphan-record'));
    } else {
      rows.push(anchorRow(anchor, resolution, 'idle'));
    }
  }

  // ---------------------------------------------------------------------
  // Orphan references: content IDs with no record, grouped per block.
  // ---------------------------------------------------------------------
  const orphanGroups = new Map<string, ContentAnchorReference[]>();
  for (const [anchorId, list] of references) {
    if (document.anchors[anchorId] !== undefined) continue;
    for (const reference of list) {
      const key = `${anchorId}\u0000${reference.blockId}`;
      const group = orphanGroups.get(key) ?? [];
      group.push(reference);
      orphanGroups.set(key, group);
    }
  }
  for (const [key, occurrences] of [...orphanGroups.entries()].sort(([left], [right]) =>
    compareStrings(left, right),
  )) {
    const [anchorId, blockId] = key.split('\u0000');
    if (anchorId === undefined || blockId === undefined) continue;
    const block = document.blocks[blockId];
    if (block === undefined) continue;
    const first = occurrences[0];
    const orphanBranches = branchesByAnchor.get(anchorId) ?? [];
    rows.push(
      baseRow(document, {
        id: `orphan-reference:${anchorId}:${blockId}`,
        category: 'orphan-reference',
        anchorId,
        blockId,
        kind: first === undefined ? null : occurrenceKind(first.nodeType),
        quote: first === undefined ? '' : occurrenceQuote(block, first),
        branches: anchorHealthBranchViews(document, orphanBranches),
        occurrences,
        detail: anchorId,
      }),
    );
  }

  // ---------------------------------------------------------------------
  // Structure: missing target, unreachable block, duplicate home, cycle,
  // empty chapter. The command layer refuses several of these states, so the
  // audit is defensive: it still names them instead of trusting the validator.
  // ---------------------------------------------------------------------
  for (const branch of Object.values(document.branches).sort((left, right) =>
    compareStrings(left.id, right.id),
  )) {
    if (document.blocks[branch.targetBlockId] !== undefined) continue;
    const view = anchorHealthBranchViews(document, [branch]).map((entry) => ({
      ...entry,
      targetTitle: 'Missing block',
    }));
    rows.push(
      baseRow(document, {
        id: `branch:${branch.id}`,
        category: 'branch-target-missing',
        blockId:
          document.blocks[branch.source.blockId] === undefined
            ? undefined
            : branch.source.blockId,
        branchId: branch.id,
        targetBlockId: branch.targetBlockId,
        branches: view,
        detail: branch.targetBlockId,
      }),
    );
  }

  const reachable = reachableBlockIds(document);
  for (const blockId of Object.keys(document.blocks).sort(compareStrings)) {
    if (reachable.has(blockId)) continue;
    rows.push(
      baseRow(document, {
        id: `block:${blockId}`,
        category: 'orphan-block',
        blockId,
        quote: truncate(blockPlainText(document.blocks[blockId])),
        branches: anchorHealthBranchViews(
          document,
          branchesByBlock.get(blockId) ?? [],
        ),
      }),
    );
  }

  const primaryByTarget = new Map<string, Branch[]>();
  for (const branch of Object.values(document.branches)) {
    if (branch.role !== 'primary') continue;
    if (document.blocks[branch.targetBlockId] === undefined) continue;
    const list = primaryByTarget.get(branch.targetBlockId) ?? [];
    list.push(branch);
    primaryByTarget.set(branch.targetBlockId, list);
  }
  for (const [targetBlockId, list] of [...primaryByTarget.entries()].sort(
    ([left], [right]) => compareStrings(left, right),
  )) {
    if (list.length < 2) continue;
    rows.push(
      baseRow(document, {
        id: `duplicate-primary:${targetBlockId}`,
        category: 'duplicate-primary',
        blockId: targetBlockId,
        targetBlockId,
        quote: blockTitleFor(document, targetBlockId),
        branches: anchorHealthBranchViews(document, list),
        detail: list.map((branch) => branch.id).sort(compareStrings).join(', '),
      }),
    );
  }

  for (const cycle of primaryCycles(document)) {
    const first = cycle.ids[0];
    if (first === undefined) continue;
    rows.push(
      baseRow(document, {
        id: `cycle:${[...cycle.ids].sort(compareStrings).join('+')}`,
        category: 'cycle',
        blockId: first,
        quote: cycle.ids.map((id) => blockTitleFor(document, id)).join(' → '),
        branches: anchorHealthBranchViews(document, cycle.branches),
        detail: [...cycle.ids, first].join(' → '),
      }),
    );
  }

  for (const chapter of document.chapters) {
    if (chapter.topLevelBlockIds.length > 0) continue;
    rows.push(
      baseRow(document, {
        id: `chapter:${chapter.id}`,
        category: 'empty-chapter',
        chapterId: chapter.id,
        chapterTitle: chapter.title?.trim() || 'Untitled chapter',
        blockTitle: 'No top-level blocks',
        detail: chapter.id,
      }),
    );
  }

  rows.sort(compareRows);

  const countBy = (
    predicate: (row: DocumentHealthRow) => boolean,
  ): number => rows.filter(predicate).length;

  const counts: DocumentHealthCounts = {
    all: rows.length,
    needsRepair: countBy((row) => row.needsRepair),
    broken: countBy((row) => row.category === 'broken'),
    ambiguous: countBy((row) => row.category === 'ambiguous'),
    idle: countBy((row) => row.category === 'idle'),
    orphans: countBy((row) => ORPHAN_CATEGORIES.has(row.category)),
    structure: countBy((row) => STRUCTURE_CATEGORIES.has(row.category)),
    hidden: countBy((row) => row.category === 'hidden'),
    s1: countBy((row) => row.severity === 'S1'),
    s2: countBy((row) => row.severity === 'S2'),
    s3: countBy((row) => row.severity === 'S3'),
  };

  return {
    rows,
    counts,
    info: {
      idle: counts.idle,
      orphans: counts.orphans,
      structure: counts.structure,
      hidden: counts.hidden,
    },
  };
}

export function documentHealthRowMatchesFilter(
  row: DocumentHealthRow,
  filter: DocumentHealthFilter,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'needs-repair':
      return row.needsRepair;
    case 'broken':
      return row.category === 'broken';
    case 'ambiguous':
      return row.category === 'ambiguous';
    case 'idle':
      return row.category === 'idle';
    case 'orphans':
      return ORPHAN_CATEGORIES.has(row.category);
    case 'structure':
      return STRUCTURE_CATEGORIES.has(row.category);
    case 'hidden':
      return row.category === 'hidden';
    default:
      return true;
  }
}

export function documentHealthFilterCount(
  counts: DocumentHealthCounts,
  filter: DocumentHealthFilter,
): number {
  switch (filter) {
    case 'all':
      return counts.all;
    case 'needs-repair':
      return counts.needsRepair;
    case 'broken':
      return counts.broken;
    case 'ambiguous':
      return counts.ambiguous;
    case 'idle':
      return counts.idle;
    case 'orphans':
      return counts.orphans;
    case 'structure':
      return counts.structure;
    case 'hidden':
      return counts.hidden;
    default:
      return 0;
  }
}

function rowSearchText(row: DocumentHealthRow): string {
  const parts = [
    DOCUMENT_HEALTH_CATEGORY_LABELS[row.category],
    row.blockTitle,
    row.chapterTitle,
    row.quote,
    row.reasonLabel,
    row.kind ?? 'structure',
    row.anchorId ?? '',
    row.blockId ?? '',
    row.chapterId ?? '',
    row.branchId ?? '',
    row.targetBlockId ?? '',
    ...row.branches.map((branch) => branch.targetTitle),
  ];
  return parts.join('\n').toLowerCase();
}

/**
 * Apply one filter and the search query. Search matches block title, chapter,
 * quote/term, kind, reason, and IDs; empty query keeps every filtered row.
 */
export function filterDocumentHealthRows(
  rows: readonly DocumentHealthRow[],
  filter: DocumentHealthFilter,
  query = '',
): DocumentHealthRow[] {
  const needle = query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      documentHealthRowMatchesFilter(row, filter) &&
      (needle.length === 0 || rowSearchText(row).includes(needle)),
  );
}
