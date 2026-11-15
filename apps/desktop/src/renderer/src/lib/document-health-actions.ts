/**
 * Category → action policy for the Document health repair modal (design §4).
 *
 * The table is the single place that decides which fix and which guidance a
 * category offers. The modal renders exactly this plan, so a category can never
 * silently lose its action when the surface changes; `Show in note`/`Close` are
 * the frame's constant footer actions and are not part of the plan.
 */

import type { AnchorKind } from '@noteforest/core';
import type { DocumentHealthCategory } from './document-health';

export type HealthActionId =
  | 'preview-repair'
  | 'relink'
  | 'recreate-link'
  | 'remove-mark'
  | 'attach'
  | 'keep'
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
  keep: { label: 'Keep as is', danger: false },
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
  /** The footer primary action; null when the category has no fix. */
  primary: HealthActionId | null;
  /** Secondary and danger actions in the modal body, in reading order. */
  body: HealthActionId[];
  /** The category's guidance note, when it has one. */
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
        // Re-picking an image region is a follow-up; keep the branch actions.
        return { primary: null, body: ['attach', 'keep', 'delete-anchor'], guidance: null };
      }
      return {
        primary: options.hasCandidates ? 'preview-repair' : 'relink',
        body: [
          ...(options.hasCandidates ? (['relink'] as HealthActionId[]) : []),
          'attach',
          'keep',
          'delete-anchor',
        ],
        guidance: null,
      };
    }
    case 'anchor-block-missing':
      return { primary: null, body: [], guidance: 'missing-block' };
    case 'orphan-reference':
      return {
        primary: 'recreate-link',
        body: ['remove-mark'],
        guidance: 'unlinked-mark',
      };
    case 'idle':
      return { primary: 'add-branch', body: ['remove-anchor'], guidance: null };
    case 'orphan-record':
      return { primary: null, body: ['delete-unused'], guidance: null };
    case 'branch-target-missing':
      return { primary: null, body: ['remove-branch'], guidance: 'missing-target' };
    case 'orphan-block':
      return { primary: 'move-block', body: ['delete-block'], guidance: null };
    case 'duplicate-primary':
    case 'cycle':
      return { primary: null, body: [], guidance: 'no-fix' };
    case 'empty-chapter':
      return { primary: 'add-block', body: ['delete-chapter'], guidance: null };
    case 'hidden':
      // Show in note and Close stay active; nothing is repaired from here.
      return { primary: null, body: [], guidance: null };
    default:
      return { primary: null, body: [], guidance: null };
  }
}
