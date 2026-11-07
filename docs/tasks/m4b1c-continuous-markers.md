# M4b1c — continuous page-break markers

**Role:** Implementer / Builder
**Milestone:** M4b — editor layouts and modes
**Base:** current `main` after M4b1a2
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** derived page-break markers in the Continuous layout. No Page Edit, PDF, collapse changes,
or new paginator.

## Goal

Show where the paginator will break pages while the user works in Continuous Edit/Read. The markers
come from the same page model as Page Read; they are **derived hints**, not a WYSIWYG page. They must
not shift the editor DOM or change block geometry.

Read:

- `docs/adr/0007-editor-layouts-and-modes.md`
- `docs/spec.md` §6.3/§6.4/§6.10, AC-29/AC-33
- `docs/ux.md` Continuous layout and page-break marker sections
- `docs/reports/m4b1-page-view-core.md`, `docs/reports/m4b1a2-read-mode-gating.md`
- `page/usePageModel.ts`, `page/model.ts`, `PageView.tsx`, `DocumentEditor.tsx`,
  `editor/edges/useBlockRects.ts`, `editor/edges/EdgeLayer.tsx`

## Required behavior

1. **One page model.**
   - Lift `usePageModel` to `DocumentEditor` (or an equivalent owner) and pass the same model to
     `PageView` and the continuous marker layer. Do not run two measurements for the same revision.
   - The model runs for the active document in both layouts (Continuous needs markers, Page needs
     pages); switching layouts must not recompute an unchanged revision. Keep the 150 ms debounce and
     cancellation.
   - Measurement failure shows the existing Page error when Page is open; in Continuous it must not
     block typing. Degrade to no markers with a quiet status/aria note, not a crash.
2. **Marker derivation.**
   - From `PaginatedDocument`, derive block-boundary markers:
     - a page-start marker before a block whose fragment starts a page (`fragment.isPageStart` and
       `fragment.isFirst`), labeled with the page number;
     - a continuation chip on a block whose fragment continues (`fragment.continuesToPage`), labeled
       “continues on page N”;
     - no duplicate marker for the same block; a block that starts page N and continues on N+1 has one
       page-start marker and one continuation chip.
   - In-block safe breaks are not moved into the ProseMirror DOM. The block-boundary marker plus the
     continuation chip are the Continuous representation; exact in-block geometry stays in Page
     Read/PDF. Do not claim pixel parity.
   - Collapse: page markers are derived from the full page model. Render a marker only when its block
     is visible in the current Continuous layout; skip hidden blocks. Do not change the page model or
     Page/PDF content for collapse.
3. **Rendering.**
   - Render an overlay inside the same content coordinate system as the block cards/edges
     (`nf-canvas-content`), using `useBlockRects` for y positions. The overlay must be
     `pointer-events: none` except the page-number chip, and must not alter layout height or block
     positions.
   - A dashed horizontal line across the content width, with a readable page-number chip
     (“Page N starts here”) and a continuation chip. Use text/icon plus the page number, never color
     alone.
   - `role="separator"`/`aria-label` or equivalent; chips keyboard-focusable only if they have an
     action (none required). Do not make the whole line a focus stop.
   - Markers appear in Continuous Edit and Read, not in Page. At 960 and 1440 widths they remain
     legible and do not cover block content or handles.
   - If the page model is not ready, render nothing; do not block the editor.
4. **Synchronization.**
   - A live edit repaginates markers after the debounce; markers update in place without scroll jumps.
   - Switching Continuous ↔ Page preserves focus/selection/scroll/current page; the marker layer
     unmounts cleanly.
   - Page markers are not persisted in the document; no view-state schema change is required.
5. **Performance.**
   - Measure the page model while Continuous is open at 300 blocks: report time and whether typing
     remains responsive. If measurement is too expensive, compute markers on idle or cache by
     revision; do not add a second paginator.
6. **Tests.**
   - UI fixture with multiple pages: marker count/page numbers match Page Read; continuation chip
     appears for a long block; no markers in Page; markers absent while collapsed/hidden; marker
     overlay does not change block rects or DOM height; marker labels are accessible; 1440/960
     screenshots.
   - Unit helper for derivation from fragments (page-start/continuation/dedupe) if pure.
   - Run check:boundaries, typecheck, targeted vitest, npm test, test:ui, test:recovery:run,
     e2e:critical, one verify:fast.

## Guardrails

- No Page Edit, PDF, CSS re-pagination, second measurement, new dependency, or collapse changes.
- No spec/UX/ADR/plan edits; report proposals only.
- Do not modify the product-owner showcase.
- Do not merge or push.

## Deliverable

Report `docs/reports/m4b1c-continuous-markers.md`: worktree/branch/base/commit, page-model ownership,
marker derivation, visible/collapsed behavior, performance at 300 blocks, tests/timings, screenshots,
risks, not verified. Stop and ask if derived markers cannot be shown without shifting the editor or
if collapse makes the markers misleading enough to need a product decision.
