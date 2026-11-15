import { describe, expect, it } from 'vitest';
import type { DocumentHealthCategory } from '../src/renderer/src/lib/document-health';
import {
  HEALTH_ACTIONS,
  documentHealthActionPlan,
} from '../src/renderer/src/lib/document-health-actions';

/**
 * Design §4 coverage: every v1 category keeps its primary fix, its secondary
 * actions and its guidance. The modal renders this plan, so a missing row here
 * is a missing action in the product.
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

  it('keeps the broken and ambiguous fixes: candidates, relink, attach, keep, delete', () => {
    expect(plan('broken')).toEqual({
      primary: 'preview-repair',
      body: ['relink', 'attach', 'keep', 'delete-anchor'],
      guidance: null,
    });
    expect(plan('ambiguous')).toEqual(plan('broken'));
    expect(plan('broken', 'text', false)).toEqual({
      primary: 'relink',
      body: ['attach', 'keep', 'delete-anchor'],
      guidance: null,
    });
    // Image anchors keep the v1 note: no region re-pick and no relink.
    expect(plan('broken', 'image')).toEqual({
      primary: null,
      body: ['attach', 'keep', 'delete-anchor'],
      guidance: null,
    });
  });

  it('keeps the unused-anchor and unlinked-mark fixes', () => {
    expect(plan('idle')).toEqual({
      primary: 'add-branch',
      body: ['remove-anchor'],
      guidance: null,
    });
    expect(plan('orphan-record')).toEqual({
      primary: null,
      body: ['delete-unused'],
      guidance: null,
    });
    expect(plan('orphan-reference')).toEqual({
      primary: 'recreate-link',
      body: ['remove-mark'],
      guidance: 'unlinked-mark',
    });
  });

  it('keeps the structure fixes and their guidance', () => {
    expect(plan('empty-chapter')).toEqual({
      primary: 'add-block',
      body: ['delete-chapter'],
      guidance: null,
    });
    expect(plan('orphan-block')).toEqual({
      primary: 'move-block',
      body: ['delete-block'],
      guidance: null,
    });
    expect(plan('branch-target-missing')).toEqual({
      primary: null,
      body: ['remove-branch'],
      guidance: 'missing-target',
    });
    expect(plan('anchor-block-missing')).toEqual({
      primary: null,
      body: [],
      guidance: 'missing-block',
    });
    for (const category of ['duplicate-primary', 'cycle'] as const) {
      expect(plan(category)).toEqual({ primary: null, body: [], guidance: 'no-fix' });
    }
  });

  it('leaves the hidden marker to Show in note, with no repair', () => {
    expect(plan('hidden')).toEqual({ primary: null, body: [], guidance: null });
  });

  it('names every action with the design copy', () => {
    expect(HEALTH_ACTIONS['preview-repair'].label).toBe('Preview repair');
    expect(HEALTH_ACTIONS.relink.label).toBe('Link to current selection');
    expect(HEALTH_ACTIONS['recreate-link'].label).toBe('Recreate link from selection');
    expect(HEALTH_ACTIONS['remove-mark'].label).toBe('Remove mark');
    expect(HEALTH_ACTIONS.attach.label).toBe('Keep branches, remove anchor…');
    expect(HEALTH_ACTIONS.keep.label).toBe('Keep as is');
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
