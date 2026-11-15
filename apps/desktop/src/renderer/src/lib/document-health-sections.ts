/**
 * The Health sidebar report's grouping (S2, S2.1).
 *
 * The audit (`./document-health.ts`) is the single source of truth for rows and
 * counts; this module only decides which section a row belongs to and how the
 * compact list summarizes it. It never mutates the document and never re-runs
 * the audit.
 *
 * Sections group by task, not by the audit's category names (product-owner
 * decision, 15 November 2026). `anchor-block-missing` (Missing block) is an
 * anchor-attention row and lives in Anchors to fix: the design table omitted it,
 * and dropping it would hide a v1 category with guidance but no in-place fix.
 *
 * S2.1 decision 2: the four sections always render, `0` included, so the list
 * never changes shape between documents. A search renders only the matching
 * sections (`visibleDocumentHealthGroups`). Empty groups add no rows, so the
 * row order used for selection and neighbour logic is unchanged.
 */

import type {
  DocumentHealthCategory,
  DocumentHealthRow,
} from './document-health';

export type DocumentHealthSectionId = 'anchors' | 'unused' | 'structure' | 'hidden';

export interface DocumentHealthSectionDefinition {
  id: DocumentHealthSectionId;
  label: string;
  categories: readonly DocumentHealthCategory[];
}

export const DOCUMENT_HEALTH_SECTIONS: readonly DocumentHealthSectionDefinition[] = [
  {
    id: 'anchors',
    label: 'Anchors to fix',
    categories: ['anchor-block-missing', 'broken', 'ambiguous', 'orphan-reference'],
  },
  {
    id: 'unused',
    label: 'Unused anchors',
    categories: ['idle', 'orphan-record'],
  },
  {
    id: 'structure',
    label: 'Structure',
    categories: [
      'branch-target-missing',
      'orphan-block',
      'duplicate-primary',
      'cycle',
      'empty-chapter',
    ],
  },
  {
    id: 'hidden',
    label: 'Hidden',
    categories: ['hidden'],
  },
];

/** Anchors to fix is the only section open on a first visit. */
export const DEFAULT_OPEN_HEALTH_SECTIONS: readonly DocumentHealthSectionId[] = ['anchors'];

export interface DocumentHealthSectionGroup {
  definition: DocumentHealthSectionDefinition;
  rows: DocumentHealthRow[];
}

const SECTION_BY_CATEGORY = new Map<DocumentHealthCategory, DocumentHealthSectionDefinition>();
for (const definition of DOCUMENT_HEALTH_SECTIONS) {
  for (const category of definition.categories) {
    SECTION_BY_CATEGORY.set(category, definition);
  }
}

export function documentHealthSection(
  category: DocumentHealthCategory,
): DocumentHealthSectionDefinition {
  const definition = SECTION_BY_CATEGORY.get(category);
  if (definition !== undefined) return definition;
  // Unreachable for today's audit; a new category must not vanish silently.
  return DOCUMENT_HEALTH_SECTIONS[0] as DocumentHealthSectionDefinition;
}

/**
 * Ordered groups, one per section, empty groups included. The audit already
 * sorts rows by severity, category and title, so grouping preserves that order
 * inside every section.
 */
export function groupDocumentHealthRows(
  rows: readonly DocumentHealthRow[],
): DocumentHealthSectionGroup[] {
  const byId = new Map<DocumentHealthSectionId, DocumentHealthRow[]>();
  for (const row of rows) {
    const definition = documentHealthSection(row.category);
    const list = byId.get(definition.id) ?? [];
    list.push(row);
    byId.set(definition.id, list);
  }
  return DOCUMENT_HEALTH_SECTIONS.map((definition) => ({
    definition,
    rows: byId.get(definition.id) ?? [],
  }));
}

/**
 * What the sidebar renders: all four sections in the report state, only the
 * matching ones while a search is active (S2.1 decision 2).
 */
export function visibleDocumentHealthGroups(
  rows: readonly DocumentHealthRow[],
  searching: boolean,
): DocumentHealthSectionGroup[] {
  const groups = groupDocumentHealthRows(rows);
  return searching ? groups.filter((group) => group.rows.length > 0) : groups;
}

/** Row order as the sidebar renders it, for selection and neighbour logic. */
export function documentHealthRowOrder(
  rows: readonly DocumentHealthRow[],
): DocumentHealthRow[] {
  return groupDocumentHealthRows(rows).flatMap((group) => group.rows);
}

/**
 * The row that follows `rowId` in the sidebar, else the row before it, else
 * null. Used after a repair closes the modal: the repaired row is already gone
 * from `rows`, so the caller passes the previous order with the old row present.
 */
export function nextDocumentHealthRowId(
  rows: readonly DocumentHealthRow[],
  rowId: string,
): string | null {
  const ordered = documentHealthRowOrder(rows);
  const index = ordered.findIndex((row) => row.id === rowId);
  if (index < 0) return null;
  return (ordered[index + 1] ?? ordered[index - 1])?.id ?? null;
}

/** First row that needs repair, in sidebar order (status-chip entry point). */
export function firstRepairHealthRowId(
  rows: readonly DocumentHealthRow[],
): string | null {
  return documentHealthRowOrder(rows).find((row) => row.needsRepair)?.id ?? null;
}

export interface DocumentHealthSummaryText {
  needsRepair: number;
  all: number;
}

export function documentHealthSummaryText(
  counts: DocumentHealthSummaryText,
): string {
  return `${counts.needsRepair} to fix · ${counts.all} ${
    counts.all === 1 ? 'issue' : 'issues'
  }`;
}

/** The badge's accessible name; the visible square only carries the number. */
export function documentHealthBadgeLabel(count: number): string {
  return `${count} ${count === 1 ? 'anchor needs' : 'anchors need'} repair`;
}

/** All-clear line: audit information counts, never repair counts. */
export function documentHealthInfoText(info: {
  idle: number;
  orphans: number;
  structure: number;
  hidden: number;
}): string {
  return [
    `${info.idle} idle`,
    `${info.orphans} ${info.orphans === 1 ? 'orphan' : 'orphans'}`,
    `${info.structure} structure`,
    `${info.hidden} hidden`,
  ].join(' · ');
}
