/**
 * Layout-aware zoom resolution (V0 shell frame).
 *
 * Continuous and Page each keep their own zoom in the per-document view state.
 * The TopBar view controls, the keyboard shortcuts, the palette, and the native
 * View menu must all target the active layout's value; this module is the one
 * pure mapping from view state to "what zoom control am I", so they cannot
 * drift into reading `zoom` while Page is visible (or `pageZoom` while
 * Continuous is visible).
 */

import {
  DEFAULT_DOCUMENT_VIEW,
  type DocumentLayout,
  type DocumentViewState,
  type PageFit,
} from '../../../shared/view-state';

export interface ActiveZoomState {
  layout: DocumentLayout;
  /** Manual zoom shown by the control; Page falls back to its own page zoom. */
  zoom: number;
  /** Page fit mode; Continuous always reports `page`. */
  pageFit: PageFit;
}

/** Resolve the zoom target for the active layout from one document view state. */
export function resolveActiveZoom(
  view: DocumentViewState | null | undefined,
): ActiveZoomState {
  const layout = view?.layout ?? DEFAULT_DOCUMENT_VIEW.layout;
  if (layout === 'page') {
    return {
      layout,
      zoom: view?.pageZoom ?? DEFAULT_DOCUMENT_VIEW.pageZoom,
      pageFit: view?.pageFit ?? DEFAULT_DOCUMENT_VIEW.pageFit,
    };
  }
  return {
    layout,
    zoom: view?.zoom ?? DEFAULT_DOCUMENT_VIEW.zoom,
    pageFit: DEFAULT_DOCUMENT_VIEW.pageFit,
  };
}

/** Zoom menu commands valid for one layout; `fit-page` is Page-only. */
export type ZoomCommand = 'actual' | 'fit-width' | 'fit-page';

export function zoomCommandsForLayout(layout: DocumentLayout): ZoomCommand[] {
  return layout === 'page'
    ? ['actual', 'fit-page', 'fit-width']
    : ['actual', 'fit-width'];
}

export function zoomCommandIsValid(
  layout: DocumentLayout,
  command: ZoomCommand,
): boolean {
  return zoomCommandsForLayout(layout).includes(command);
}
