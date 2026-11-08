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
  PageSettings,
} from '@noteforest/layout';
import { layoutDocument, pageLayoutOptions, paginate } from '@noteforest/layout';
import { pageSetupOf } from './adapter';

export interface PageModelData {
  layout: ContinuousLayout;
  pages: DerivedPage[];
  pageCount: number;
  defects: LayoutDefect[];
  measurementCalls: number;
  empty: boolean;
}

/**
 * Fingerprint the resolved settings so the hook can recompute exactly when a
 * page setup/theme/manual-break change makes the old model stale.
 */
export function pageSettingsFingerprint(settings: PageSettings): string {
  return JSON.stringify([
    settings.setup.size,
    settings.setup.orientation,
    settings.setup.margins,
    settings.theme,
    settings.manualBreakBeforeBlockIds,
  ]);
}

export function computePageModel(
  document: NoteDocument,
  port: MeasurementPort,
  settings: PageSettings,
): PageModelData {
  const layout = layoutDocument(
    document,
    port,
    pageLayoutOptions(settings.theme),
    pageSetupOf(settings),
  );
  const paginated = paginate(layout, document, {
    manualBreakBeforeBlockIds: [...settings.manualBreakBeforeBlockIds],
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
