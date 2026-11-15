import { describe, expect, it } from 'vitest';
import type {
  DocumentHealthCategory,
  DocumentHealthRow,
} from '../src/renderer/src/lib/document-health';
import {
  DEFAULT_OPEN_HEALTH_SECTIONS,
  documentHealthBadgeLabel,
  documentHealthInfoText,
  documentHealthRowOrder,
  documentHealthSection,
  documentHealthSummaryText,
  firstRepairHealthRowId,
  groupDocumentHealthRows,
  nextDocumentHealthRowId,
  type DocumentHealthSectionId,
} from '../src/renderer/src/lib/document-health-sections';

function row(
  id: string,
  category: DocumentHealthCategory,
  needsRepair = true,
): DocumentHealthRow {
  return {
    id,
    category,
    severity: needsRepair ? 'S2' : 'S3',
    needsRepair,
    kind: null,
    quote: id,
    prefix: '',
    suffix: '',
    blockTitle: 'Block',
    chapterTitle: 'Chapter',
    branchCount: 0,
    branches: [],
    reason: category,
    reasonLabel: category,
  };
}

function groupIds(rows: DocumentHealthRow[]): Array<[DocumentHealthSectionId, string[]]> {
  return groupDocumentHealthRows(rows).map((group) => [
    group.definition.id,
    group.rows.map((entry) => entry.id),
  ]);
}

describe('document health sidebar sections', () => {
  it('maps every audit category to exactly one section', () => {
    const categories: DocumentHealthCategory[] = [
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
    const seen = new Map<DocumentHealthCategory, DocumentHealthSectionId>();
    for (const category of categories) {
      const id = documentHealthSection(category).id;
      expect(seen.has(category), `${category} is mapped twice`).toBe(false);
      seen.set(category, id);
    }
    expect(seen.get('broken')).toBe('anchors');
    expect(seen.get('anchor-block-missing')).toBe('anchors');
    expect(seen.get('orphan-reference')).toBe('anchors');
    expect(seen.get('idle')).toBe('unused');
    expect(seen.get('orphan-record')).toBe('unused');
    expect(seen.get('empty-chapter')).toBe('structure');
    expect(seen.get('hidden')).toBe('hidden');
  });

  it('renders only non-empty sections in the confirmed order', () => {
    const rows = [
      row('h1', 'hidden', false),
      row('s1', 'empty-chapter', false),
      row('a1', 'ambiguous'),
      row('u1', 'idle', false),
      row('a2', 'broken'),
    ];
    expect(documentHealthRowOrder(rows).map((entry) => entry.id)).toEqual([
      'a1',
      'a2',
      'u1',
      's1',
      'h1',
    ]);
    expect(groupIds(rows)).toEqual([
      ['anchors', ['a1', 'a2']],
      ['unused', ['u1']],
      ['structure', ['s1']],
      ['hidden', ['h1']],
    ]);
  });

  it('keeps Anchors to fix as the only default-open section', () => {
    expect([...DEFAULT_OPEN_HEALTH_SECTIONS]).toEqual(['anchors']);
  });

  it('picks the next row, then the previous one, then null', () => {
    const rows = [
      row('a1', 'broken'),
      row('a2', 'ambiguous'),
      row('u1', 'idle', false),
    ];
    expect(nextDocumentHealthRowId(rows, 'a1')).toBe('a2');
    expect(nextDocumentHealthRowId(rows, 'a2')).toBe('u1');
    expect(nextDocumentHealthRowId(rows, 'u1')).toBe('a2');
    expect(nextDocumentHealthRowId(rows, 'missing')).toBeNull();
    expect(firstRepairHealthRowId(rows)).toBe('a1');
    expect(firstRepairHealthRowId([row('u1', 'idle', false)])).toBeNull();
  });

  it('writes the header summary and the badge label', () => {
    expect(documentHealthSummaryText({ needsRepair: 3, all: 7 })).toBe('3 to fix · 7 issues');
    expect(documentHealthSummaryText({ needsRepair: 1, all: 1 })).toBe('1 to fix · 1 issue');
    expect(documentHealthBadgeLabel(3)).toBe('3 anchors need repair');
    expect(documentHealthBadgeLabel(1)).toBe('1 anchor needs repair');
    expect(documentHealthInfoText({ idle: 1, orphans: 2, structure: 0, hidden: 1 })).toBe(
      '1 idle · 2 orphans · 0 structure · 1 hidden',
    );
  });
});
