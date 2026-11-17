# R2a — Page arrows and remove Continuous page chrome

**Role:** Implementer / Builder
**Milestone:** refactor/M4 — Page is the only page surface
**Base:** current `main` after R1b
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** Page Read/Edit arrows and removal of page chrome/page model from Continuous. No packing
(two-column/wider cards), Settings UI, manual-break UI, or PDF compositor.

## Why

Two product-owner blockers remain:

1. Continuous still shows page-break markers/chips and runs a page model. Continuous has **no
   pages**.
2. Page has **no arrows**, so the graph is invisible. Page must show primary/reference edges,
   including cross-page indicators.

## Required work

### 1. Page arrows

- Reuse the existing edge mapper in `packages/pdf/src/printModel.ts` (`buildPrintModel`) or extract
  it into a shared pure module. Do **not** add a second page-edge router.
- Page Read and Page Edit render an SVG edge layer inside each page content box:
  - primary solid, reference dashed/distinct, labels when present;
  - same-page path from source to target, arrowhead at target;
  - anchored branches start at the anchor point when available, otherwise at the source block edge;
  - cross-page `to-edge`/`from-edge` indicators (“→ page N”, “← from page M”), no line through the
    margin;
  - arrows are `aria-hidden` and must not intercept clicks; labels remain accessible where present.
- Use the resolved page settings/geometry from R1b; arrows are page-local and clip to the page
  content box.
- Page Edit overlay remains above the arrows; Page Read unchanged except arrows.

### 2. Remove Continuous page chrome/page model

- Remove `PageBreakMarkers`, `page-markers`, `.nf-page-marker*`, marker tests and visual tests.
- Stop computing a page model in Continuous:
  - PageView owns `usePageModel`/`usePageSettings` or DocumentEditor passes a model only when the
    Page layout is active;
  - no page measurement calls while Continuous is visible;
  - no `data-page-marker`, page numbers, continuation chips, or page-width guides in Continuous.
- Continuous remains a pure continuous editor; Page Read/Edit keeps pages, continuation/ghost
  markers, page numbers, Page Edit overlay.
- DocumentEditor no longer needs a page-model prop for Continuous; PageView can own the model.

### 3. Tests/evidence

- Remove/replace M4b1c marker tests and visual suite.
- Regression: Continuous has no `[data-page-marker]`, no page-model measurement calls, no page
  chrome at 1440/960 and in both Continuous Edit/Read.
- Page arrows: same-page primary/reference, anchor/callout start, cross-page indicators, Page Read
  and Page Edit; no pointer interception.
- Existing Page Read/Edit/image/settings suites green.
- Screenshots: Page Read with arrows at 1440×900 and 960×720, landscape/portrait; a cross-page
  indicator; Continuous without page chrome.
- Gates: check:boundaries, typecheck, targeted vitest, npm test, test:ui, test:recovery:run,
  e2e:critical, one verify:fast.

## Do not

- Do not implement two-column/width packing (R2b), Settings UI, manual-break UI/cleanup, or PDF print
  compositor.
- Do not change page density/theme values.
- Do not touch `~/Documents` or the showcase.
- Do not edit spec/UX/plan; report.
- No new external dependency unless the shared edge module requires a workspace import.

## Deliverable

Report `docs/reports/r2a-page-arrows-cleanup.md`: worktree/branch/base/commit, edge mapper reuse,
page edge rendering, Continuous model removal, tests/timings, screenshots, risks, not verified. Do
not merge or push. Stop and ask if the existing print-edge mapper cannot be reused without a second
router, or if cross-page arrow semantics need a product decision.
