/**
 * Continuous page-break marker overlay (M4b1c).
 *
 * Renders the derived paginator breaks over the continuous editor without
 * touching its DOM flow or block geometry: the layer is absolutely positioned
 * inside `.nf-canvas-content` in the same content coordinate system as the
 * block cards, and every marker is derived from the shared page model owned by
 * `DocumentEditor`.
 *
 * This is a hint layer, not a WYSIWYG page. In-block safe breaks stay in the
 * Page layout/PDF; the continuation chip only says which page the block
 * continues on.
 */

import type { DerivedPage } from '@noteforest/layout';
import type { Rect } from '../lib/geometry';
import {
  continuationLabel,
  derivePageBreakMarkers,
  pageStartLabel,
} from './page-markers';

export interface PageBreakMarkersProps {
  pages: readonly DerivedPage[];
  rects: ReadonlyMap<string, Rect>;
  ready: boolean;
  error: string | null;
  updating: boolean;
  measurementCalls: number;
  runs: number;
  lastRunMs: number | null;
  lastComputeMs: number | null;
}

const DERIVED_HINT =
  'Derived from the page layout — Page Read and PDF are the exact geometry.';

export function PageBreakMarkers({
  pages,
  rects,
  ready,
  error,
  updating,
  measurementCalls,
  runs,
  lastRunMs,
  lastComputeMs,
}: PageBreakMarkersProps): JSX.Element | null {
  if (error !== null) {
    // Continuous degradation: no markers, no layout shift, and a quiet status
    // for assistive technology. Page Read owns the visible error surface.
    return (
      <div className="nf-page-markers-status nf-sr-only" role="status" aria-live="polite">
        Page-break markers are unavailable: {error}
      </div>
    );
  }
  if (!ready) return null;

  const derived = derivePageBreakMarkers(pages);
  // Collapse, focus mode, and a just-mounted layout can leave a block without
  // a measured rect. The full page model is untouched; only the hint for that
  // hidden block is skipped.
  const pageStarts = derived.pageStarts.filter((marker) => rects.has(marker.blockId));
  const continuations = derived.continuations.filter((marker) =>
    rects.has(marker.blockId),
  );
  const markerCount = pageStarts.length + continuations.length;
  const pageNumbers = pageStarts.map((marker) => marker.pageNumber).join(',');

  return (
    <div
      className="nf-page-markers"
      data-page-markers="true"
      data-page-marker-count={markerCount}
      data-page-marker-starts={pageStarts.length}
      data-page-marker-continuations={continuations.length}
      data-page-marker-pages={pageNumbers}
      data-page-count={pages.length}
      data-page-model-ready="true"
      data-page-model-updating={updating ? 'true' : 'false'}
      data-page-model-calls={measurementCalls}
      data-page-model-runs={runs}
      data-page-model-ms={lastRunMs === null ? undefined : Math.round(lastRunMs)}
      data-page-model-compute-ms={
        lastComputeMs === null ? undefined : Math.round(lastComputeMs)
      }
      role="group"
      aria-label="Derived page-break markers"
    >
      {pageStarts.map((marker) => {
        const rect = rects.get(marker.blockId);
        if (rect === undefined) return null;
        const label = pageStartLabel(marker.pageNumber);
        return (
          <div
            key={`start-${marker.pageNumber}`}
            className="nf-page-marker nf-page-marker-start"
            data-page-marker="start"
            data-page-marker-block={marker.blockId}
            data-page-marker-page={marker.pageNumber}
            style={{ top: rect.y }}
            role="separator"
            aria-orientation="horizontal"
            aria-label={`${label}. ${DERIVED_HINT}`}
          >
            <span className="nf-page-marker-line" aria-hidden="true" />
            <span
              className="nf-page-marker-chip nf-page-marker-chip-start"
              aria-hidden="true"
              title={`${label}. ${DERIVED_HINT}`}
            >
              Page {marker.pageNumber} starts here
            </span>
          </div>
        );
      })}
      {continuations.map((marker) => {
        const rect = rects.get(marker.blockId);
        if (rect === undefined) return null;
        const label = continuationLabel(marker.pages);
        return (
          <div
            key={`continues-${marker.blockId}`}
            className="nf-page-marker nf-page-marker-continues"
            data-page-marker="continuation"
            data-page-marker-block={marker.blockId}
            data-page-marker-page={marker.pageNumber}
            data-page-marker-pages={marker.pages.join(',')}
            style={{ top: rect.y, left: rect.x }}
            role="note"
            aria-label={`${label}. ${DERIVED_HINT}`}
          >
            <span className="nf-page-marker-chip" aria-hidden="true">
              <span className="nf-page-marker-glyph">↳</span>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
