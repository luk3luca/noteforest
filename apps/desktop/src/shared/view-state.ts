/**
 * Per-document editor view state (ADR-0007).
 *
 * Layout (continuous vs page) and interaction mode (edit vs read) are
 * orthogonal axes. Page is read-only until Page Edit exists, so a page layout
 * always normalizes to read. This module is the single source for defaults and
 * clamping shared by the renderer store, session serialization, and the main
 * process session reader. View state never enters `document.json`.
 */

/** Screen-optimized continuous scroll or the paginated A4 page layout. */
export type DocumentLayout = 'continuous' | 'page';

/** Editable or read-only interaction within the current layout. */
export type InteractionMode = 'edit' | 'read';

/** Page navigation fit mode; `none` uses the manual page zoom. */
export type PageFit = 'page' | 'width' | 'none';

/** Navigation-only view state. Never written to the document. */
export interface DocumentViewState {
  /** 1 = 100%. Continuous surface zoom. */
  zoom: number;
  /** Ancestor-chain/descendant focus anchor; null means show the document. */
  focusBlockId: string | null;
  /** Continuous or page layout. */
  layout: DocumentLayout;
  /** Edit or read interaction within the layout. Page is read-only for now. */
  interactionMode: InteractionMode;
  /** Current derived page, 1-based. Clamped when the page count changes. */
  currentPage: number;
  /** Manual page zoom. 1 = 100%; fit modes override it. */
  pageZoom: number;
  /** Page fit mode; `none` uses `pageZoom`. */
  pageFit: PageFit;
}

export const DEFAULT_DOCUMENT_VIEW: Readonly<DocumentViewState> = Object.freeze({
  zoom: 1,
  focusBlockId: null,
  layout: 'continuous',
  interactionMode: 'edit',
  currentPage: 1,
  pageZoom: 1,
  pageFit: 'page',
});

export function clampContinuousZoom(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_DOCUMENT_VIEW.zoom;
  return Math.round(Math.min(2, Math.max(0.5, number)) * 100) / 100;
}

export function clampPageZoom(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_DOCUMENT_VIEW.pageZoom;
  return Math.round(Math.min(2.5, Math.max(0.1, number)) * 100) / 100;
}

export function clampPageNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(1, Math.round(number))
    : DEFAULT_DOCUMENT_VIEW.currentPage;
}

export function normalizeLayout(value: unknown): DocumentLayout {
  return value === 'page' ? 'page' : 'continuous';
}

export function normalizePageFit(value: unknown): PageFit {
  return value === 'width' || value === 'none' ? value : 'page';
}

/** Page is read-only until Page Edit ships; continuous supports both modes. */
export function normalizeInteractionMode(
  layout: DocumentLayout,
  value: unknown,
): InteractionMode {
  if (layout === 'page') return 'read';
  return value === 'read' ? 'read' : 'edit';
}

/** Loose input accepted from legacy sessions, IPC, and partial view patches. */
export interface DocumentViewStateInput {
  zoom?: unknown;
  focusBlockId?: unknown;
  layout?: unknown;
  interactionMode?: unknown;
  currentPage?: unknown;
  pageZoom?: unknown;
  pageFit?: unknown;
}

/** Merge a partial/legacy view state onto safe defaults and clamp every value. */
export function normalizeDocumentViewState(
  input: DocumentViewStateInput | null | undefined,
): DocumentViewState {
  const layout = normalizeLayout(input?.layout);
  const focusBlockId =
    typeof input?.focusBlockId === 'string' && input.focusBlockId.length > 0
      ? input.focusBlockId
      : null;
  return {
    zoom: clampContinuousZoom(input?.zoom),
    focusBlockId,
    layout,
    interactionMode: normalizeInteractionMode(layout, input?.interactionMode),
    currentPage: clampPageNumber(input?.currentPage),
    pageZoom: clampPageZoom(input?.pageZoom),
    pageFit: normalizePageFit(input?.pageFit),
  };
}
