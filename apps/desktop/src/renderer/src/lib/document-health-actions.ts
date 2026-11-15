/**
 * Health presentation policy (design §3–§5).
 *
 * The audit (`./document-health.ts`) owns the rows and the counts. This module
 * owns what the surface says and where its actions sit: the state word, the
 * one-sentence problem line, the one-line guidance and the footer slots.
 *
 * Every category renders exactly this plan, so a category can never silently
 * lose its action when the surface changes. `Show in note` and `Close` are the
 * frame's constant footer slots and are not part of the plan; the modal body
 * carries no action buttons at all (S2.1 decision 5).
 */

import type { AnchorKind } from '@noteforest/core';
import type { DocumentHealthCategory } from './document-health';

export type HealthActionId =
  | 'preview-repair'
  | 'relink'
  | 'recreate-link'
  | 'remove-mark'
  | 'attach'
  | 'delete-anchor'
  | 'add-branch'
  | 'remove-anchor'
  | 'delete-unused'
  | 'remove-branch'
  | 'move-block'
  | 'delete-block'
  | 'add-block'
  | 'delete-chapter';

export interface HealthActionDefinition {
  label: string;
  /** Danger actions read red with the same quiet button geometry. */
  danger: boolean;
}

export const HEALTH_ACTIONS: Record<HealthActionId, HealthActionDefinition> = {
  'preview-repair': { label: 'Preview repair', danger: false },
  relink: { label: 'Link to current selection', danger: false },
  'recreate-link': { label: 'Recreate link from selection', danger: false },
  'remove-mark': { label: 'Remove mark', danger: false },
  attach: { label: 'Keep branches, remove anchor…', danger: false },
  'delete-anchor': { label: 'Delete anchor and branches…', danger: true },
  'add-branch': { label: 'Add a branch…', danger: false },
  'remove-anchor': { label: 'Remove anchor', danger: false },
  'delete-unused': { label: 'Delete unused anchor', danger: true },
  'remove-branch': { label: 'Remove branch…', danger: true },
  'move-block': { label: 'Move to chapter…', danger: false },
  'delete-block': { label: 'Delete block…', danger: true },
  'add-block': { label: 'Add block', danger: false },
  'delete-chapter': { label: 'Delete chapter…', danger: true },
};

export type DocumentHealthGuidance =
  | 'missing-block'
  | 'missing-target'
  | 'no-fix'
  | 'unlinked-mark';

export interface DocumentHealthActionPlan {
  /** The footer's primary slot; danger-styled when the action is destructive. */
  primary: HealthActionId | null;
  /** A visible footer button between `Show in note` and `Close` (Unlinked mark). */
  secondary: HealthActionId | null;
  /** Rare and destructive actions behind the footer's `…` menu, in reading order. */
  menu: HealthActionId[];
  /** The category's one-line guidance, when the fix is outside this modal. */
  guidance: DocumentHealthGuidance | null;
}

export function documentHealthActionPlan(
  category: DocumentHealthCategory,
  options: { kind: AnchorKind | null; hasCandidates: boolean },
): DocumentHealthActionPlan {
  switch (category) {
    case 'broken':
    case 'ambiguous': {
      if (options.kind === 'image') {
        // Re-picking an image region is a follow-up; the branch actions stay.
        return { primary: null, secondary: null, menu: ['attach', 'delete-anchor'], guidance: null };
      }
      return {
        primary: options.hasCandidates ? 'preview-repair' : 'relink',
        secondary: null,
        menu: [
          ...(options.hasCandidates ? (['relink'] as HealthActionId[]) : []),
          'attach',
          'delete-anchor',
        ],
        guidance: null,
      };
    }
    case 'anchor-block-missing':
      return { primary: null, secondary: null, menu: [], guidance: 'missing-block' };
    case 'orphan-reference':
      return {
        primary: 'recreate-link',
        secondary: 'remove-mark',
        menu: [],
        guidance: 'unlinked-mark',
      };
    case 'idle':
      return { primary: 'add-branch', secondary: null, menu: ['remove-anchor'], guidance: null };
    case 'orphan-record':
      // The only fix is destructive: it stays in the primary slot, in danger.
      return { primary: 'delete-unused', secondary: null, menu: [], guidance: null };
    case 'branch-target-missing':
      return { primary: 'remove-branch', secondary: null, menu: [], guidance: 'missing-target' };
    case 'orphan-block':
      return { primary: 'move-block', secondary: null, menu: ['delete-block'], guidance: null };
    case 'duplicate-primary':
    case 'cycle':
      return { primary: null, secondary: null, menu: [], guidance: 'no-fix' };
    case 'empty-chapter':
      return { primary: 'add-block', secondary: null, menu: ['delete-chapter'], guidance: null };
    case 'hidden':
      // Show in note and Close stay active; nothing is repaired from here.
      return { primary: null, secondary: null, menu: [], guidance: null };
    default:
      return { primary: null, secondary: null, menu: [], guidance: null };
  }
}

/**
 * The state word: the audit's category as the product names it. Two renames
 * (design §5, S2.1 decision 9); every other category keeps its audit label.
 */
const STATE_TEXT: Record<DocumentHealthCategory, string> = {
  broken: 'Lost anchor',
  ambiguous: 'Ambiguous anchor',
  'anchor-block-missing': 'Missing block',
  idle: 'Anchor with no branches',
  'orphan-reference': 'Unlinked mark',
  'orphan-record': 'Unused anchor',
  'branch-target-missing': 'Missing target',
  'orphan-block': 'Unreachable block',
  'duplicate-primary': 'Duplicate home',
  cycle: 'Loop',
  'empty-chapter': 'Empty chapter',
  hidden: 'Hidden anchor',
};

export function documentHealthStateText(category: DocumentHealthCategory): string {
  return STATE_TEXT[category];
}

/**
 * One sentence that says what is wrong, instead of the audit's technical
 * reason (design §5). Image anchors keep the audit's one-line asset reason:
 * the table's Lost/Ambiguous line speaks about text and the asset row has no
 * separate category.
 */
const PROBLEM_LINES: Record<DocumentHealthCategory, string> = {
  broken: 'This text is no longer in the block.',
  ambiguous: 'This text appears twice.',
  'anchor-block-missing': 'The block that held this anchor was deleted.',
  idle: 'Nothing branches from this anchor.',
  'orphan-reference': 'The highlight has no anchor behind it.',
  'orphan-record': 'This anchor is not attached to any text.',
  'branch-target-missing': 'The branch points to a block that no longer exists.',
  'orphan-block': 'No chapter or branch reaches this block.',
  'duplicate-primary': 'Two primary branches point here; a block can have only one home.',
  cycle: 'Primary branches form a loop.',
  'empty-chapter': 'This chapter has no blocks.',
  hidden: 'Its marker is hidden because a parent block is closed.',
};

export function documentHealthProblemLine(row: {
  category: DocumentHealthCategory;
  kind: AnchorKind | null;
  reasonLabel: string;
}): string {
  if ((row.category === 'broken' || row.category === 'ambiguous') && row.kind === 'image') {
    return row.reasonLabel;
  }
  return PROBLEM_LINES[row.category];
}

/** One line, only where the fix is outside the modal (design §5). */
const GUIDANCE_LINES: Record<DocumentHealthGuidance, string> = {
  'missing-block': 'No in-place repair: the block is gone. Remove the branch that points here.',
  'missing-target': 'Remove the branch, or restore a backup.',
  'no-fix': 'Fix the primary edges with the branch commands, or restore a backup.',
  'unlinked-mark': 'Recreate the link from a selection, or remove the mark.',
};

export function documentHealthGuidanceText(guidance: DocumentHealthGuidance): string {
  return GUIDANCE_LINES[guidance];
}

/** The image follow-up line: one sentence, never a paragraph. */
export const DOCUMENT_HEALTH_IMAGE_NOTE = 'Re-picking an image region is coming later.';

/** The candidate decision line (design lab §3, ambiguous anchor). */
export const DOCUMENT_HEALTH_CANDIDATE_NOTE = 'The branch and its target stay.';

/** The chapter move line (design lab §4, unreachable block). */
export const DOCUMENT_HEALTH_MOVE_NOTE = 'The block keeps its content and its children.';

/** The confirm stage's one line: what changes, what stays, no IDs. */
export const DOCUMENT_HEALTH_REPAIR_CONFIRM_NOTE =
  'What changes: the anchor binding. What stays: the branch, its target, the block. One undo entry.';

/** Sidebar row: the branch count with its word, only when above zero. */
export function documentHealthBranchCountText(count: number): string {
  return `${count} ${count === 1 ? 'branch' : 'branches'}`;
}
