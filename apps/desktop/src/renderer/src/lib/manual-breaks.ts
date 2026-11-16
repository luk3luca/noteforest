/**
 * Manual breaks (`docs/design/manual-breaks.md`).
 *
 * A manual break is a **horizontal page cut at a block row's y**, never a
 * property of a branch: everything at or below that y moves to the next page.
 * The paginator already honours `pageSettings.manualBreakBeforeBlockIds`; this
 * module owns the renderer-side rules the engine deliberately leaves out:
 *
 * - **Which blocks may carry a break.** Only the leader of its row — the
 *   leftmost block at that y. A child placed beside its parent (and a mode A
 *   callout, which shares the parent's y) cannot be isolated, so the control is
 *   not offered there (F11). The rule is pure over the page layout, or over the
 *   Continuous measured right/below placement.
 * - **The menu state**: the first block of the note, the first block of a
 *   chapter, a non-leader, and the enabled/checked case, in that precedence.
 * - **Cleanup**: a hint must never outlive its block. The prune is recomputed
 *   from the current document, because the per-document override is not part of
 *   the document history (undo is never replayed into settings).
 * - **The `Breaks` list rows**: page number and broken-hint state from the
 *   current pagination.
 *
 * Nothing here changes the paginator or the stored schema. The global page
 * settings keep an empty break list by contract; only the per-document override
 * is written.
 */

import type { Document } from '@noteforest/core';
import type {
  ContinuousLayout,
  DerivedPage,
  LayoutBlock,
  LayoutDefect,
  PageSettingsOverride,
} from '@noteforest/layout';
import { flattenBlocks } from './tree';

/** One disabled reason per menu state; the same sentences the design approved. */
export const MANUAL_BREAK_NOTE_REASON = 'The note already starts here.';
export const MANUAL_BREAK_CHAPTER_REASON = 'A chapter always starts a new page.';
export const MANUAL_BREAK_ROW_REASON =
  'Only the block that starts a row can begin a page.';

/** The block-menu item. */
export const MANUAL_BREAK_LABEL = 'Start on a new page';

/** The `Breaks` empty state and the broken-hint line. */
export const MANUAL_BREAK_EMPTY =
  'No manual breaks. Start a block on a new page from its menu.';
export const MANUAL_BREAK_BROKEN = 'Can’t be honoured here.';

/** y tolerance when two blocks are treated as sharing a row (paginator scale). */
const ROW_EPSILON = 0.5;

export interface ManualBreakMenuState {
  disabled: boolean;
  checked: boolean;
  /** One-line reason shown under the label when disabled. */
  reason: string | null;
}

/**
 * The leader of each row: a block is a row leader when no other block in the
 * same chapter has (approximately) the same y and a smaller x. Top-level blocks
 * and wrapped (below) children are leaders; a child beside its parent and a
 * mode A callout are not.
 */
export function pageRowLeaderIds(layout: ContinuousLayout): Set<string> {
  const byChapter = new Map<string, LayoutBlock[]>();
  for (const block of layout.blocks) {
    const list = byChapter.get(block.chapterId);
    if (list === undefined) byChapter.set(block.chapterId, [block]);
    else list.push(block);
  }
  const leaders = new Set<string>();
  for (const blocks of byChapter.values()) {
    for (const block of blocks) {
      const behind = blocks.some(
        (candidate) =>
          candidate.blockId !== block.blockId &&
          Math.abs(candidate.y - block.y) <= ROW_EPSILON &&
          candidate.x < block.x - ROW_EPSILON,
      );
      if (!behind) leaders.add(block.blockId);
    }
  }
  return leaders;
}

export interface ContinuousRowInput {
  /** Chapter roots. */
  topLevelIds: ReadonlySet<string>;
  /** Anchored primary children (callouts). */
  calloutIds: ReadonlySet<string>;
  /** Direct primary children the Continuous renderer measured below. */
  belowIds: ReadonlySet<string>;
}

/**
 * Row leaders in Continuous, from the measured right/below placement the editor
 * already owns. A direct child in the right group shares its parent's row, so it
 * is not a leader. Callouts are **never** offered here: the page model can place
 * a callout in the parent's right lane (mode A), which is exactly the F11 case
 * the control must not create. Page layout itself stays exact.
 */
export function continuousRowLeaderIds(input: ContinuousRowInput): Set<string> {
  const leaders = new Set<string>();
  for (const id of input.topLevelIds) leaders.add(id);
  for (const id of input.belowIds) {
    if (input.calloutIds.has(id)) continue;
    leaders.add(id);
  }
  return leaders;
}

/** The first block of the note in reading order, when any block exists. */
export function firstBlockOfDocument(document: Document): string | null {
  for (const chapter of document.chapters) {
    for (const id of chapter.topLevelBlockIds) {
      if (document.blocks[id] !== undefined) return id;
    }
  }
  return null;
}

/** The first block of the chapter that owns `blockId`, if it is top-level. */
export function firstBlockOfChapter(document: Document, blockId: string): string | null {
  for (const chapter of document.chapters) {
    if (chapter.topLevelBlockIds.includes(blockId)) {
      return chapter.topLevelBlockIds.find((id) => document.blocks[id] !== undefined) ?? null;
    }
  }
  return null;
}

/**
 * Menu state in precedence order: note start, chapter start, not a row leader,
 * enabled. `stored` is the resolved per-document list (the paginator input), so
 * the check always reflects what the page actually consumes.
 */
export function manualBreakMenuState(input: {
  blockId: string;
  document: Document;
  rowLeader: boolean;
  stored: readonly string[];
}): ManualBreakMenuState {
  const checked = input.stored.includes(input.blockId);
  if (firstBlockOfDocument(input.document) === input.blockId) {
    return { disabled: true, checked, reason: MANUAL_BREAK_NOTE_REASON };
  }
  if (firstBlockOfChapter(input.document, input.blockId) === input.blockId) {
    return { disabled: true, checked, reason: MANUAL_BREAK_CHAPTER_REASON };
  }
  if (!input.rowLeader) {
    return { disabled: true, checked, reason: MANUAL_BREAK_ROW_REASON };
  }
  return { disabled: false, checked, reason: null };
}

/**
 * The per-document override after writing one break list. An empty list is
 * dropped (the global default is `[]` by contract), and an override left with
 * no fields is removed entirely, mirroring `withoutPageDensityOverride`.
 */
export function withManualBreakIds(
  override: PageSettingsOverride | undefined,
  ids: readonly string[],
): PageSettingsOverride | undefined {
  const { manualBreakBeforeBlockIds: _breaks, ...rest } = override ?? {};
  if (ids.length === 0) {
    return Object.keys(rest).length === 0 ? undefined : rest;
  }
  return { ...rest, manualBreakBeforeBlockIds: [...ids] };
}

/**
 * Drop every hint whose block is no longer in the document, deduplicated like
 * `sanitizeManualBreaks`. A hint whose block still exists but is no longer a row
 * leader is kept: the intent survives a density change and the list warns.
 */
export function pruneManualBreakIds(
  ids: readonly string[],
  blockIds: ReadonlySet<string>,
): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' || id.length === 0) continue;
    if (seen.has(id) || !blockIds.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

/** The derived page that contains the first fragment of one block. */
export function manualBreakPageNumber(
  pages: readonly DerivedPage[],
  blockId: string,
): number | null {
  for (const page of pages) {
    if (page.fragments.some((fragment) => fragment.blockId === blockId)) {
      return page.pageNumber;
    }
  }
  return null;
}

/** Every `impossible-hint` warning keyed by its block id (first wins). */
export function manualBreakWarningsById(
  warnings: readonly LayoutDefect[],
): Map<string, LayoutDefect> {
  const byBlock = new Map<string, LayoutDefect>();
  for (const warning of warnings) {
    if (warning.code !== 'impossible-hint') continue;
    if (warning.blockId === undefined) continue;
    if (!byBlock.has(warning.blockId)) byBlock.set(warning.blockId, warning);
  }
  return byBlock;
}

export interface ManualBreakRow {
  blockId: string;
  /** Block label, else its first line (the Outline/`blockTitle` rule). */
  title: string;
  /** Page in the current pagination; null while the model is not ready. */
  pageNumber: number | null;
  broken: boolean;
  /** Paginator message, else the non-leader reason; null on a healthy hint. */
  message: string | null;
}

/**
 * One row per stored hint in **document order** (not array order: the list is a
 * map, not a stack). A hint is broken when the paginator reported it impossible
 * or when its block is no longer a row leader; both keep their row.
 */
export function manualBreakRows(input: {
  document: Document;
  ids: readonly string[];
  pages: readonly DerivedPage[];
  warnings: readonly LayoutDefect[];
  rowLeaders: ReadonlySet<string>;
  titleOf: (blockId: string) => string;
}): ManualBreakRow[] {
  const rank = new Map<string, number>();
  for (const [index, id] of flattenBlocks(input.document).entries()) rank.set(id, index);
  const warnings = manualBreakWarningsById(input.warnings);
  const rows: ManualBreakRow[] = [];
  for (const id of input.ids) {
    if (input.document.blocks[id] === undefined) continue;
    const warning = warnings.get(id) ?? null;
    const leader = input.rowLeaders.has(id);
    rows.push({
      blockId: id,
      title: input.titleOf(id),
      pageNumber: manualBreakPageNumber(input.pages, id),
      broken: warning !== null || !leader,
      message: warning?.message ?? (leader ? null : MANUAL_BREAK_ROW_REASON),
    });
  }
  return rows.sort(
    (left, right) =>
      (rank.get(left.blockId) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(right.blockId) ?? Number.MAX_SAFE_INTEGER),
  );
}
