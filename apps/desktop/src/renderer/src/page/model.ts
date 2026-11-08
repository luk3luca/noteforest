/**
 * Pure page-model computation: layout + pagination over one measured
 * `NoteDocument`. The React hook owns debounce, cancellation, and DOM
 * measurement; this module stays testable without React or a browser.
 */

import type {
  ContinuousLayout,
  DerivedPage,
  LayoutDefect,
  MeasurementPort,
  NoteDocument,
} from '@noteforest/layout';
import {
  DEFAULT_PAGE_SETTINGS,
  layoutDocument,
  paginate,
} from '@noteforest/layout';
import { PAGE_LAYOUT_OPTIONS } from './adapter';

export interface PageModelData {
  layout: ContinuousLayout;
  pages: DerivedPage[];
  pageCount: number;
  defects: LayoutDefect[];
  measurementCalls: number;
  empty: boolean;
}

export function computePageModel(
  document: NoteDocument,
  port: MeasurementPort,
): PageModelData {
  const layout = layoutDocument(
    document,
    port,
    PAGE_LAYOUT_OPTIONS,
    DEFAULT_PAGE_SETTINGS.setup,
  );
  const paginated = paginate(layout, document, {
    manualBreakBeforeBlockIds: [...DEFAULT_PAGE_SETTINGS.manualBreakBeforeBlockIds],
  });
  return {
    layout,
    pages: paginated.pages,
    pageCount: paginated.pages.length,
    defects: paginated.defects,
    measurementCalls: layout.measurementCalls,
    empty: paginated.pages.length === 0,
  };
}

/** Blocking defects prevent export and get a visible page badge. */
export function blockingDefects(defects: readonly LayoutDefect[]): LayoutDefect[] {
  return defects.filter((defect) => defect.blocksExport);
}

/** Clamp a 1-based page number to the current derived page count. */
export function clampPageNumber(current: number, pageCount: number): number {
  if (pageCount <= 0) return 1;
  if (!Number.isFinite(current)) return 1;
  return Math.min(pageCount, Math.max(1, Math.round(current)));
}
