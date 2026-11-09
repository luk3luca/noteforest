# M4c1 — Print compositor + Page/PDF seam prerequisites

**Role:** Builder / Implementer  
**Milestone:** M4c1 (Page PDF print compositor); M4c2 export orchestration and M4c3 full PDF gate are separate  
**Base:** `main` at the Page checkpoint acceptance and F5/F6 fixes (`6147cf3`; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 2 days

## Context

The Page checkpoint is accepted (9 November 2026). The targeted Page/PDF seam
Sentinel (`docs/reviews/r2-page-pdf-seam-review.md`) returned **accept with
findings**, no S1. Its F1–F4 are the prerequisites for this task:

- **F1** — the print model is only tested with hand-built layout/pages; add a
  real `layoutDocument` + `paginate` parity test and a Page Read vs print-model
  comparison.
- **F2** — `PrintModel` does not carry the resolved `PageTheme`/CSS variables,
  block measurements/segments/table columns, anchors/broken/ambiguous, failed
  assets, document content, or page-chrome layout.
- **F3** — page chrome and edge-label positions are magic fractions in
  `PageView`/`PageEdges`; share a `pageChromeLayout`/edge-label layout with the
  print compositor.
- **F4** — no resolved-settings/manual-break fingerprint; a print model can be
  built from a differently paginated document.

F5 (Comfortable density-only) and F6 (mode A gap floor) are already fixed.
F7–F13 are outside this task (full-codebase Sentinel/Settings/docs).

## Goal

Build the print-only Page compositor that renders the exact derived pages from a
real Page model, using the same metrics, fragments, edges, trunks, chrome, and
contents as Page Read. It must not re-paginate or change metrics; the print skin
changes colours/borders/shadows only. Export orchestration (`printToPDF`) stays
M4c2; the full 50+ page PDF/raster gate stays M4c3.

## In scope

### F1 — real-layout parity

- Build the print model from the real `layoutDocument` + `paginate` output, not
  hand-built fixtures, for the R2j A/B2/stacked fixtures and representative
  R2i cases.
- Compare print model vs Page Read/Edit: page count, page numbers, fragments
  (block, page box, segment range, continuation), edges, trunks, routes,
  `pageNumberByBlock`, and defects.
- Add a test that Page Read's fragment/edge/trunk attributes equal the print
  model's records for the same document/settings.
- A hand-built fixture is allowed for narrow unit cases, but it is not the seam
  evidence.

### F2 — print model completeness

Extend `PrintModel` (or add a typed print runtime alongside it) with everything
the compositor needs to render Page Read without reaching into renderer state:

- resolved `PageSettings`/`PageTheme` and the `pageCssVariables` map;
- per-block measurements (segments, table columns, content height) and the
  document content needed by `buildSegments`;
- anchor attachments (resolved/broken/ambiguous), failed/missing assets, and
  blocking defects;
- page-chrome layout data (header/ghost/footer/continues), edge-label layout,
  and document/chapter titles;
- remove or actually use the unused `document` parameter.

Do not duplicate measurements in the compositor; consume the resolved records.

### F3 — shared chrome and labels

- Extract a pure `pageChromeLayout(geometry, page)` (or equivalent shared
  helper) for header/ghost/footer/continues positions, and a shared edge-label
  layout used by `PageEdges` and print.
- Keep Page Read's positions unchanged; add a position parity test.
- No metric change in the print skin.

### F4 — settings identity

- Carry the resolved `PageSettings`, `manualBreakBeforeBlockIds`, and a
  deterministic fingerprint in `PrintModel` (or re-paginate from the resolved
  settings in the builder).
- A model built with different settings/manual breaks must fail loudly, not
  silently render a different page count.
- Add a mismatch test.

### Print compositor

- A print-only renderer that emits one fixed page container per `DerivedPage`,
  direct children of the print root (no wrapper that changes the page size).
- Same static segments/card boxes, PageTheme metrics, arrows/trunks, semantic
  placement, cross-page segments, reference `← p.N` chips, continuation/ghost
  markers, broken-anchor/missing-asset markers, and table/code/formula/image
  rendering as Page Read.
- Print skin: colours/borders/shadows only; no metric/font-size/line-height
  changes.
- No CSS paged-media re-pagination, no second router, no second paginator.
- A render/test entry point that M4c2 can load in a hidden BrowserWindow; do
  not implement the export job yet.
- A5/Letter and portrait/landscape geometry smoke tests (page size, content
  size, page count equality with the paginator); the 50+ page A4 and raster
  gates remain M4c3.

## Out of scope

- M4c2 export orchestration, `printToPDF`, job IDs, atomic output, output path.
- M4c3 50+ page PDF fixture, text extraction, Notability import, raster parity.
- Settings UI, manual-break UI, R3/R4, full-codebase refactor.
- Changing the layout engine, paginator, Page Read/Edit geometry, or PageTheme
  values.
- Spec/UX/ADR/plan edits; merge, push, PR, or parent-checkout edits.

## Files to read

- `docs/tasks/m4c-pdf-plan.md` — M4c1/M4c2/M4c3 split and gates.
- `docs/reviews/r2-page-pdf-seam-review.md` — F1–F4 and the print seam rules.
- `docs/reports/r2i-page-subtree-wrap.md`, `r2j-page-callout-modes.md`,
  `r2j1-stacked-stem.md`.
- `docs/adr/0002-pdf-pipeline.md`, `docs/adr/0007-editor-layouts-and-modes.md`,
  `docs/adr/0008-personal-page-settings.md`.
- `packages/pdf/src/printModel.ts`, `packages/pdf/test/print-model.test.ts`,
  `packages/pdf/src/verifyPdf.ts`.
- `apps/desktop/src/renderer/src/page/PageView.tsx`, `PageEdges.tsx`,
  `segments.ts`, `adapter.ts`, `model.ts`, `measurement.ts`,
  `PageBlockEditor.tsx`.
- `packages/layout/src/page-edges.ts`, `page-settings.ts`, `types.ts`,
  `paginator.ts`.

Expected to touch:

- `packages/pdf/src/printModel.ts` and a new print compositor module/component.
- `packages/pdf/test/` new real-layout parity/mismatch tests.
- `apps/desktop/src/renderer/src/page/` shared chrome/segment extraction and the
  print surface/route.
- A test bridge/fixture for the print DOM if needed.
- `docs/reports/m4c1-print-compositor.md`.

## Acceptance criteria

- [ ] F1: real `layoutDocument` + `paginate` parity test; print model vs Page
      Read/Edit page count, fragments, edges, trunks, routes, page numbers.
- [ ] F2: `PrintModel` (or typed print runtime) carries resolved theme/CSS,
      measurements/table columns, anchors/failed assets, document/segments, and
      chrome; the compositor renders Page Read without renderer-state reach-in.
- [ ] F3: shared `pageChromeLayout`/edge-label layout; Page Read positions
      unchanged; parity test.
- [ ] F4: resolved settings/manual-break fingerprint; mismatch fails loudly;
      test.
- [ ] One fixed page container per derived page; no CSS re-pagination; no
      wrapper drift.
- [ ] Print metrics equal Page Read; print skin changes colors/borders/shadows
      only.
- [ ] Same static segments, edges/trunks, continuation/ghost, reference chips,
      broken/missing markers as Page Read.
- [ ] A5/Letter/portrait/landscape geometry smoke passes; page count equals
      paginator.
- [ ] Targeted tests + one `npm run verify:fast` pass with real timings.
- [ ] Report maps every criterion to pass/fail and lists open risks.

## Tests and evidence

- `npx vitest run packages/pdf/test packages/layout/test` targeted subsets.
- New real-layout print parity and settings-mismatch tests.
- Page Read vs print DOM/attribute parity where feasible; if a hidden-window
  print DOM is not ready in M4c1, use the shared component/model tests and state
  the evidence gap explicitly (M4c2/M4c3 will cover the window/PDF gate).
- `npm run verify:fast` at the end; the Orchestrator runs one full verify.
- No fixed sleeps, no native dialogs, no screen recordings.
- Report at `docs/reports/m4c1-print-compositor.md`.

## Stop and ask

Stop and report if:

- the compositor needs a second router/paginator or a metric change;
- Page Read/Edit/PDF parity requires a layout/PageTheme change;
- F1–F4 cannot be closed without M4c2 export orchestration;
- a product decision is missing (page chrome, markers, print skin);
- the baseline has unrelated failures;
- the change requires spec/UX/ADR or Settings UI work.

## Report format

- Summary and scope.
- Files changed.
- Checks run with real timings.
- F1–F4 closure evidence.
- Acceptance pass/fail.
- Page count/geometry/parity evidence.
- Open questions/risks.
- Worktree path, branch head SHA.
