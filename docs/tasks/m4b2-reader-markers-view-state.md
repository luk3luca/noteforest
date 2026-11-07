# M4b2 — reader page-break markers and full view-state contract

**Role:** Implementer / Builder
**Milestone:** M4 — reader/page + PDF
**Base:** current `main` after M4b1 integration
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** reader page-break markers, shared page model, full AC-33 state, session view state. No PDF,
no page-view editing, no image/anchor polish, no resize.

## Goal

Close M4b: the reader shows derived page-break markers from the same page model as the page view, and
switching reader/page preserves focus, selection, collapse, scroll, current page, and zoom. The page
view remains the exact engine renderer; the reader remains the authoring surface.

Read:

- `docs/tasks/m4-reader-page-pdf.md` (M4b)
- `docs/reports/m4b1-page-view-core.md` (current page model, mode switch, risks)
- `docs/spec.md` §6.3, §6.10, AC-29, AC-31, AC-32, AC-33
- `docs/ux.md` reader/page and view-state sections
- `apps/desktop/src/renderer/src/page/*`, `DocumentEditor.tsx`, `state/shell.ts`,
  `state/session.ts`, `actions.ts`, `editor/edges/useBlockRects.ts`

## Required behavior

1. **One page model for both surfaces.**
   - Lift `usePageModel` to `DocumentEditor` (or an equivalent owner) and pass the same model to the
     reader marker layer and `PageView`. Do not run two measurements for the same revision.
   - The model runs when the document tab is active and the mode is reader or page; it is debounced
     and cancellable as today. Switching modes must not recompute an unchanged revision.
   - The reader must remain usable while measurement runs; a measurement failure shows the page-view
     error but never blocks typing or saving.
2. **Reader page-break markers.**
   - Derive markers from the same `PaginatedDocument` used by the page view.
   - At a block boundary: when a page starts before a block (`fragment.isPageStart` or
     `continuedFromPage`), draw a horizontal break marker above that block with the page number and
     an accessible label ("Page N starts here"). At a block that continues (`continuesToPage`), show
     a "continues on page N" marker below/at the end of the block.
   - Use the existing block-rect overlay/geometry layer (`useBlockRects`, content coordinates), not
     a second layout. The marker line is non-interactive; the page-number chip is focusable/readable.
   - Markers must not shift the reader DOM or change block positions, must not appear in page mode,
     and must remain visible at 1440 and 960 widths. Use text/icon plus the page number, never color
     alone.
   - Internal safe breaks inside a long block: if exact segment placement is not feasible in the
     ProseMirror DOM, place the marker at the block boundary and add a continuation chip with the
     target page; document the limitation. Do not add CSS re-pagination or a second engine. Exact
     in-block markers can be a follow-up in M4c if the print renderer needs them.
   - Page markers are **engine-derived**, not measured from the reader DOM. The reader's screen
     geometry may differ from page geometry; do not claim pixel parity. The page view and PDF remain
     the exact geometry.
3. **AC-33 view-state contract.**
   - Switching reader ↔ page preserves: focused block, selection, collapse set, reader scroll,
     current page, reader zoom, page zoom/fit.
   - If the focused/selected block is hidden by a collapsed ancestor when returning to reader, expand
     the ancestors and reveal the block (`runtime.expandAncestors`/`focusBlock`).
   - Clamp `currentPage` when the page count shrinks; keep the current page when it still exists.
   - Switching modes must not commit a spurious text edit, create an undo entry, or lose keystrokes.
     The hidden reader remains mounted and non-editable in page mode; restore scroll after layout.
   - Single active editor: the page view stays read-only.
4. **Persist view state.**
   - Extend the session `viewState` with `mode`, `currentPage`, `pageZoom`, `pageFit`; keep backward
     compatibility with old sessions (defaults: reader, page 1, zoom 1, fit page).
   - Restore per document on relaunch; a corrupt/missing value falls back safely. The session file
     must remain small and must not include layout geometry.
   - Do not write view state into `document.json`.
5. **Page-view integration.**
   - PageView consumes the shared model; remove its internal duplicate hook. Current page navigation,
     fit/zoom, click-to-select, and "Open in reader" keep working.
   - Clicking a page fragment sets the focused block; switching to reader reveals it.
   - A live reader edit still repaginates the page view without a manual refresh.
6. **Tests and evidence.**
   - UI: reader shows markers for a multi-page fixture; marker page numbers match the page view page
     count; markers absent in page mode; mode round trip preserves focus/selection/scroll/current
     page; collapse+hidden focus reveals on return; session reload restores mode/page/zoom/fit;
     page-count shrink clamps; no undo entry from a mode switch.
   - Unit: view-state serialization/restore/defaults; marker derivation from fragments (pure helper);
     page model ownership/no duplicate computation if measurable.
   - Screenshots: reader markers at 1440×900 and 960×720; page view at the same page; one continuation
     marker.
   - 300-block fixture: report page-model time in reader mode and typing responsiveness; do not add
     virtualization in this slice.
7. **No scope creep.**
   - No PDF/printToPDF, no page-view editing, no reader CSS pagination, no image region/point overlays,
     no lost-anchor polish, no crop/resize, no External API, no new runtime dependency.
   - Do not change spec/UX/ADR/plan/token docs; propose values in the report.

## Gates

- `npm run check:boundaries`
- `npm run typecheck`
- targeted vitest
- `npm test`
- `npm run test:ui`
- `npm run test:recovery:run`
- `npm run e2e:critical`
- one `npm run verify:fast` at the end

## Guardrails

- Do not modify the product-owner showcase.
- Do not add a second layout engine or a PDF-only rule.
- Keep the reader accessible: markers are not the only page indication; the page view and status
  remain available.
- Do not merge or push.

## Deliverable

Report `docs/reports/m4b2-reader-markers-view-state.md`: worktree/branch/base/commit, marker
derivation, view-state schema, what is exact vs advisory, tests/timings, screenshots, risks, not
verified. Stop and ask if AC-33 requires a product decision (e.g., marker behavior for in-block
breaks) or if sharing the page model makes typing unresponsive at 300 blocks.
