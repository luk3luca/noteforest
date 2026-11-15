import { describe, expect, it } from 'vitest';
import type { DocumentHealthCategory } from '../src/renderer/src/lib/document-health';
import {
  DOCUMENT_HEALTH_CANDIDATE_NOTE,
  DOCUMENT_HEALTH_IMAGE_NOTE,
  DOCUMENT_HEALTH_MOVE_NOTE,
  DOCUMENT_HEALTH_REPAIR_CONFIRM_NOTE,
  HEALTH_ACTIONS,
  documentHealthActionPlan,
  documentHealthBranchCountText,
  documentHealthGuidanceText,
  documentHealthProblemLine,
  documentHealthStateText,
} from '../src/renderer/src/lib/document-health-actions';

/**
 * Design §4/§5 coverage: every v1 category keeps its primary fix, its rare
 * actions, its one-line guidance and its copy. The modal renders this plan, so
 * a missing row here is a missing action in the product. S2.1 moved the
 * secondary actions out of the body into the footer slots and removed
 * `Keep as is`, so the plan has exactly one primary and no body list.
 */

const ALL: DocumentHealthCategory[] = [
  'broken',
  'ambiguous',
  'anchor-block-missing',
  'idle',
  'orphan-reference',
  'orphan-record',
  'branch-target-missing',
  'orphan-block',
  'duplicate-primary',
  'cycle',
  'empty-chapter',
  'hidden',
];

function plan(category: DocumentHealthCategory, kind: 'text' | 'image' = 'text', hasCandidates = true) {
  return documentHealthActionPlan(category, { kind, hasCandidates });
}

describe('document health action plan (design §4)', () => {
  it('plans every category', () => {
    for (const category of ALL) {
      expect(plan(category), `${category} has no plan`).toBeDefined();
    }
  });

  it('keeps the broken and ambiguous footer: candidates, relink, attach, delete', () => {
    expect(plan('broken')).toEqual({
      primary: 'preview-repair',
      secondary: null,
      menu: ['relink', 'attach', 'delete-anchor'],
      guidance: null,
    });
    expect(plan('ambiguous')).toEqual(plan('broken'));
    // No candidate: the fallback becomes the primary, exactly as the design §4 row.
    expect(plan('broken', 'text', false)).toEqual({
      primary: 'relink',
      secondary: null,
      menu: ['attach', 'delete-anchor'],
      guidance: null,
    });
    // Image anchors keep the v1 note: no region re-pick and no relink.
    expect(plan('broken', 'image')).toEqual({
      primary: null,
      secondary: null,
      menu: ['attach', 'delete-anchor'],
      guidance: null,
    });
  });

  it('keeps the unused-anchor and unlinked-mark fixes', () => {
    expect(plan('idle')).toEqual({
      primary: 'add-branch',
      secondary: null,
      menu: ['remove-anchor'],
      guidance: null,
    });
    // The only fix is destructive: it stays in the primary slot, in danger.
    expect(plan('orphan-record')).toEqual({
      primary: 'delete-unused',
      secondary: null,
      menu: [],
      guidance: null,
    });
    expect(plan('orphan-reference')).toEqual({
      primary: 'recreate-link',
      secondary: 'remove-mark',
      menu: [],
      guidance: 'unlinked-mark',
    });
  });

  it('keeps the structure fixes and their guidance', () => {
    expect(plan('empty-chapter')).toEqual({
      primary: 'add-block',
      secondary: null,
      menu: ['delete-chapter'],
      guidance: null,
    });
    expect(plan('orphan-block')).toEqual({
      primary: 'move-block',
      secondary: null,
      menu: ['delete-block'],
      guidance: null,
    });
    expect(plan('branch-target-missing')).toEqual({
      primary: 'remove-branch',
      secondary: null,
      menu: [],
      guidance: 'missing-target',
    });
    expect(plan('anchor-block-missing')).toEqual({
      primary: null,
      secondary: null,
      menu: [],
      guidance: 'missing-block',
    });
    for (const category of ['duplicate-primary', 'cycle'] as const) {
      expect(plan(category)).toEqual({
        primary: null,
        secondary: null,
        menu: [],
        guidance: 'no-fix',
      });
    }
  });

  it('leaves the hidden marker to Show in note, with no repair', () => {
    expect(plan('hidden')).toEqual({
      primary: null,
      secondary: null,
      menu: [],
      guidance: null,
    });
  });

  it('never offers Keep as is and never renders a body action row', () => {
    expect(Object.keys(HEALTH_ACTIONS)).not.toContain('keep');
    for (const category of ALL) {
      const current = plan(category);
      expect(Object.keys(current).sort()).toEqual(['guidance', 'menu', 'primary', 'secondary']);
    }
  });

  it('puts every dangerous action in a footer slot', () => {
    const dangerous = Object.entries(HEALTH_ACTIONS)
      .filter(([, definition]) => definition.danger)
      .map(([id]) => id);
    expect(dangerous.sort()).toEqual([
      'delete-anchor',
      'delete-block',
      'delete-chapter',
      'delete-unused',
      'remove-branch',
    ]);
    for (const category of ALL) {
      const current = plan(category);
      for (const action of [current.primary, current.secondary, ...current.menu]) {
        if (action === null) continue;
        expect(Object.keys(HEALTH_ACTIONS)).toContain(action);
      }
    }
  });

  it('names every action with the design copy', () => {
    expect(HEALTH_ACTIONS['preview-repair'].label).toBe('Preview repair');
    expect(HEALTH_ACTIONS.relink.label).toBe('Link to current selection');
    expect(HEALTH_ACTIONS['recreate-link'].label).toBe('Recreate link from selection');
    expect(HEALTH_ACTIONS['remove-mark'].label).toBe('Remove mark');
    expect(HEALTH_ACTIONS.attach.label).toBe('Keep branches, remove anchor…');
    expect(HEALTH_ACTIONS['delete-anchor'].label).toBe('Delete anchor and branches…');
    expect(HEALTH_ACTIONS['add-branch'].label).toBe('Add a branch…');
    expect(HEALTH_ACTIONS['remove-anchor'].label).toBe('Remove anchor');
    expect(HEALTH_ACTIONS['delete-unused'].label).toBe('Delete unused anchor');
    expect(HEALTH_ACTIONS['remove-branch'].label).toBe('Remove branch…');
    expect(HEALTH_ACTIONS['move-block'].label).toBe('Move to chapter…');
    expect(HEALTH_ACTIONS['delete-block'].label).toBe('Delete block…');
    expect(HEALTH_ACTIONS['add-block'].label).toBe('Add block');
    expect(HEALTH_ACTIONS['delete-chapter'].label).toBe('Delete chapter…');
    for (const [id, definition] of Object.entries(HEALTH_ACTIONS)) {
      expect(definition.label.length, `${id} has a label`).toBeGreaterThan(0);
    }
  });
});

describe('document health copy (design §5)', () => {
  it('renames exactly the two approved state words', () => {
    expect(documentHealthStateText('idle')).toBe('Anchor with no branches');
    expect(documentHealthStateText('cycle')).toBe('Loop');
    // Everything else keeps its audit label.
    expect(documentHealthStateText('broken')).toBe('Lost anchor');
    expect(documentHealthStateText('ambiguous')).toBe('Ambiguous anchor');
    expect(documentHealthStateText('anchor-block-missing')).toBe('Missing block');
    expect(documentHealthStateText('orphan-reference')).toBe('Unlinked mark');
    expect(documentHealthStateText('orphan-record')).toBe('Unused anchor');
    expect(documentHealthStateText('branch-target-missing')).toBe('Missing target');
    expect(documentHealthStateText('orphan-block')).toBe('Unreachable block');
    expect(documentHealthStateText('duplicate-primary')).toBe('Duplicate home');
    expect(documentHealthStateText('empty-chapter')).toBe('Empty chapter');
    expect(documentHealthStateText('hidden')).toBe('Hidden anchor');
  });

  it('uses the approved one-sentence problem lines', () => {
    const row = (category: DocumentHealthCategory, kind: 'text' | 'image' | null = 'text') => ({
      category,
      kind,
      reasonLabel: 'audit reason',
    });
    expect(documentHealthProblemLine(row('broken'))).toBe('This text is no longer in the block.');
    expect(documentHealthProblemLine(row('ambiguous'))).toBe('This text appears twice.');
    expect(documentHealthProblemLine(row('orphan-reference'))).toBe(
      'The highlight has no anchor behind it.',
    );
    expect(documentHealthProblemLine(row('anchor-block-missing', null))).toBe(
      'The block that held this anchor was deleted.',
    );
    expect(documentHealthProblemLine(row('idle'))).toBe('Nothing branches from this anchor.');
    expect(documentHealthProblemLine(row('orphan-record'))).toBe(
      'This anchor is not attached to any text.',
    );
    expect(documentHealthProblemLine(row('branch-target-missing', null))).toBe(
      'The branch points to a block that no longer exists.',
    );
    expect(documentHealthProblemLine(row('orphan-block', null))).toBe(
      'No chapter or branch reaches this block.',
    );
    expect(documentHealthProblemLine(row('duplicate-primary', null))).toBe(
      'Two primary branches point here; a block can have only one home.',
    );
    expect(documentHealthProblemLine(row('cycle', null))).toBe(
      'Primary branches form a loop.',
    );
    expect(documentHealthProblemLine(row('empty-chapter', null))).toBe(
      'This chapter has no blocks.',
    );
    expect(documentHealthProblemLine(row('hidden'))).toBe(
      'Its marker is hidden because a parent block is closed.',
    );
    // Image assets keep the audit's one-line reason: the table's text line
    // would be false for a missing or changed file.
    expect(documentHealthProblemLine(row('broken', 'image'))).toBe('audit reason');
  });

  it('keeps the guidance to one line, and only where the fix is outside the modal', () => {
    expect(documentHealthGuidanceText('unlinked-mark')).toBe(
      'Recreate the link from a selection, or remove the mark.',
    );
    expect(documentHealthGuidanceText('missing-block')).toBe(
      'No in-place repair: the block is gone. Remove the branch that points here.',
    );
    expect(documentHealthGuidanceText('missing-target')).toBe(
      'Remove the branch, or restore a backup.',
    );
    expect(documentHealthGuidanceText('no-fix')).toBe(
      'Fix the primary edges with the branch commands, or restore a backup.',
    );
    for (const guidance of ['unlinked-mark', 'missing-block', 'missing-target', 'no-fix'] as const) {
      expect(documentHealthGuidanceText(guidance).split('.').filter((part) => part.trim()).length)
        .toBeLessThanOrEqual(2);
    }
  });

  it('writes the decision and confirm lines without IDs', () => {
    expect(DOCUMENT_HEALTH_CANDIDATE_NOTE).toBe('The branch and its target stay.');
    expect(DOCUMENT_HEALTH_MOVE_NOTE).toBe('The block keeps its content and its children.');
    expect(DOCUMENT_HEALTH_IMAGE_NOTE).toBe('Re-picking an image region is coming later.');
    expect(DOCUMENT_HEALTH_REPAIR_CONFIRM_NOTE).toBe(
      'What changes: the anchor binding. What stays: the branch, its target, the block. One undo entry.',
    );
    for (const line of [
      DOCUMENT_HEALTH_CANDIDATE_NOTE,
      DOCUMENT_HEALTH_MOVE_NOTE,
      DOCUMENT_HEALTH_IMAGE_NOTE,
      DOCUMENT_HEALTH_REPAIR_CONFIRM_NOTE,
    ]) {
      expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    }
  });

  it('writes the branch count with its word', () => {
    expect(documentHealthBranchCountText(1)).toBe('1 branch');
    expect(documentHealthBranchCountText(2)).toBe('2 branches');
  });
});
