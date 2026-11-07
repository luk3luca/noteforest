# M4 — Reader/page + PDF: implementation plan

**Status:** Planning complete; not started.  
**Owner:** Orchestrator.  
**Depends on:** M3 accepted; M3i complete; M3c3b1–M3c3b3 merged; M3c3b4 image UX/lifecycle pending.
**Decision:** ADR-0006 group-level left-origin wrap; ADR-0002 print pipeline.

## Goal

Make the reader the primary continuous authoring view, render the same layout as paginated A4 page
view, and export the paginator's pages as a real-text PDF with no cut lines/images/formulas/code/
table rows. One layout engine, two renderers; pages are derived, not containers.

## Current foundation

- `packages/layout`: pure adaptive layout + paginator + safe break candidates, exercised by Spike 1.
- `packages/pdf`: print compositor + `printToPDF` orchestration foundation from Spike 1.
- Editor shell/reader continuous view exists; page view is not integrated.
- Image pipeline/anchors: content-addressed assets, integrity/availability, protocol, page/print
  work still needed.
- M3i boundaries: `DocumentSession`, `EditorProjection`, `SaveCoordinator`, `DocumentGateway`,
  repository/migrations, command aggregates, boundary check.

## Fixed decisions

1. **Layout policy (ADR-0006):** a child group stays right only if the whole group fits; otherwise
   all direct children move below the parent at `parent.x + wrapIndent`, recursively. Anchored
   callouts first. Cap cumulative wrap indent; same rule in reader/page/PDF.
2. **Pages:** A4 portrait/landscape, document-wide, margins; pages derived by the paginator; no
   structural page containers.
3. **Reader:** continuous scroll + page-break markers; primary editor.
4. **Page view:** paginated WYSIWYG preview of the same pages/breaks.
5. **PDF (ADR-0002):** print-only compositor consumes derived pages; one fixed A4 page per derived
   page; no CSS re-pagination; `printToPDF`; real text/vector arrows.
6. **Images:** use c3b3 asset availability/integrity; print renderer uses the local asset protocol,
   waits for decode, shows missing placeholders and lost-anchor markers.
7. **No reader/map PDF.** One Page PDF mode.

## Slices

### M4a — Layout lab and group-wrap engine

**Status:** merged and verified. Report: `docs/reports/m4a-layout-lab.md`.
- Implement a layout lab with current, group-left-origin, and per-child subtree-aware variants.
- Add subtree measurement and the group-wrap rule from ADR-0006.
- Validate `wrapIndent`/cap tokens on showcase + 300-block fixture; record chosen values.
- Preserve safe breaks, callout order, no-overlap, 16 px clear-space, and anchor alignment
  tolerances.
- Gate: page count/width snapshot report; no visual regression in reader; layout unit tests.

### M4b — Page view and reader integration

Split into **M4b1 page view core** (`docs/tasks/m4b1-page-view-core.md`) and **M4b2 reader
page-break markers + full AC-33 state polish**. M4b1 owns the adapter, measurement, page view and a
basic mode switch; M4b2 owns markers and the full state/selection/scroll contract.
- Page view component rendering the paginator's derived pages; page break markers in reader.
- Fit page/fit width/zoom, page navigation, manual break hints, orientation change.
- Mode switch preserves focus, selection, collapse, reader scroll, current page.
- Same layout/breaks in reader and page view; one active block editor.
- Gate: AC-29, AC-31, AC-33; screenshots at portrait/landscape and 1440/960.

### M4c — Print compositor and PDF export
- Harden the print compositor: fixed pages, typography metrics, headers/page numbers, continuation
  and ghost-parent markers, arrows/borders as vectors.
- Wait for fonts, KaTeX, image decode, two frames; disable animation; printToPDF with fixed A4;
  atomic output; export job/status; local-only CSP.
- Text extraction and page count parity fixtures; 50+ page A4 gate.
- Gate: AC-39–AC-45, AC-60–AC-66; PDF text extraction; page-view/PDF raster tolerance.

### M4d — Images, anchors, performance, visual
- Image assets in page/PDF: protocol, missing placeholder, lost-anchor marker, intrinsic dimensions.
- Callout/edge alignment at 2 px, lost-anchor markers, image region/point anchors in page/PDF.
- 300-block guaranteed/perf and 1,000-block usable with collapse/focus/LOD; page view virtualization
  if needed.
- Product-owner visual/PDF acceptance; annotation downstream use case.
- Gate: AC-43, AC-52, AC-56/AC-57 image rows, AC-62; visual screenshots; packaged build.

## Acceptance map

| Area | ACs |
|---|---|
| Layout/tree | AC-23–AC-33, AC-51–AC-53 |
| Reader/page | AC-29, AC-31, AC-33 |
| PDF | AC-39–AC-45, AC-60–AC-66 |
| Anchors/images | AC-43, AC-52, AC-56–AC-57 |
| Performance | AC-62 |

## Tests and evidence

- Layout: golden fixtures for page count, positions, break candidates, no-overlap, continuation,
  group-wrap variants; 300-block timings; 1,000-block smoke with focus/collapse.
- Reader/page: Playwright UI at 1440/960, portrait/landscape; mode switch state; screenshots.
- PDF: page count parity; `pdfjs-dist` text extraction; no missing glyphs; raster/page-view compare;
  table row atomicity; code line/image/formula non-cut; image/placeholder/lost-anchor markers;
  atomic write and failed-export job.
- Product owner: visual/VoiceOver, PDF on macOS, Notability/import downstream manual.

## Seams for future resize (documented, no UI in M4)

Planned in `docs/tasks/future-manual-resize.md`. M4 should leave these seams without shipping the
feature:

- layout measurement accepts an optional per-block preferred width (always absent in M4);
- image measurement tolerates an optional `displayWidth` (default 1) and still reads intrinsic
  `width`/`height` for aspect ratio and anchor geometry;
- reader and print renderer derive the image box from the same layout node, so a later display width
  needs no print-only rule;
- reserved optional fields are documented in the schema, not implemented.

## Risks / open decisions

- Exact `wrapIndent` cap and whether to reset to page left or fixed band after the cap.
- Group-wrap may increase page count; width/readability is the stated priority.
- Print renderer must share font metrics and asset protocol; a print-only layout or CSP difference is
  forbidden.
- Freeze/reflow semantics and manual break-hint UI need UX confirmation.
- Page view interactive performance at 300/1,000 blocks; virtualization may be required.
- c3b4 image UX/lifecycle (multi-image actions, cross-document paste, asset GC) is pending; it must
  land before M4d image acceptance, but M4a/b can start independently.

## Sequence

1. M3c3b4 image UX/lifecycle (or in parallel with M4a if file ownership is clean).
2. M4a layout lab + group-wrap engine.
3. M4b page view + reader integration.
4. M4c print/PDF.
5. M4d images/anchors/performance/visual.
6. Product-owner acceptance; M5 starts only after M4 is accepted.

## Stop and ask

Stop if the layout lab shows group-wrap causes unacceptable page counts/readability, if the print
renderer needs a second layout engine, or if page-view interaction requires a product decision.
