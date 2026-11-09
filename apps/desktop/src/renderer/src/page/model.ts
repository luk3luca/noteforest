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
import {
  layoutDocument,
  pageLayoutOptions,
  pageSettingsFingerprint,
  paginate,
} from '@noteforest/layout';
import { pageSetupOf } from './adapter';

export { blockingDefects, pageBlockingDefects, pageSettingsFingerprint } from '@noteforest/layout';

export interface PageModelData {
  /** The layout-shaped document this run measured (content + anchors + assets). */
  document: NoteDocument;
  layout: ContinuousLayout;
  pages: DerivedPage[];
  pageCount: number;
  defects: LayoutDefect[];
  manualBreakWarnings: LayoutDefect[];
  measurementCalls: number;
  empty: boolean;
  /** Fingerprint of the resolved settings that produced this model. */
  settingsFingerprint: string;
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
    document,
    layout,
    pages: paginated.pages,
    pageCount: paginated.pages.length,
    defects: paginated.defects,
    manualBreakWarnings: paginated.manualBreakWarnings,
    measurementCalls: layout.measurementCalls,
    empty: paginated.pages.length === 0,
    settingsFingerprint: pageSettingsFingerprint(settings),
  };
}

/** Clamp a 1-based page number to the current derived page count. */
export function clampPageNumber(current: number, pageCount: number): number {
  if (pageCount <= 0) return 1;
  if (!Number.isFinite(current)) return 1;
  return Math.min(pageCount, Math.max(1, Math.round(current)));
}
