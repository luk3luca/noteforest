# M4b2a — remove page chrome from Continuous

**Role:** Implementer / Builder
**Milestone:** M4b — editor layouts
**Base:** current `main` after M4b1c1
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** remove page-break markers/page chrome from Continuous. No Page arrows or density work in
this slice; those are separate follow-ups.

## Product direction (overrides the previous marker slice)

The product owner has rejected page-break markers in Continuous:

> Continuous has no concept of pages. Dashed “Page N starts here” lines and “continues on page N”
> chips are useless there and were never requested. Pages belong to Page view and PDF.

Therefore:

- Continuous must be a pure continuous editor: no page markers, no dashed page lines, no “continues
  on page” chips, no page numbers in the flow.
- The page model must not run for Continuous; it runs only for the Page layout (Read/Edit).
- Page Read/Edit keep pages, continuation markers, and page numbers.

## Required work

1. Remove `PageBreakMarkers`/`page-markers` from the Continuous renderer and styles; remove the
   marker tests/screenshots that asserted them. Do not leave dead CSS or dead data attributes.
2. Stop running `usePageModel` in Continuous. PageView owns/uses the page model again (or
   DocumentEditor passes it only when layout is page). Do not compute a 300-block page model while
   the user is in Continuous.
3. Remove page-width guides/markers from Continuous if they are part of the same overlay. The
   continuous layout keeps its canvas/edge/block chrome; no page chrome.
4. Keep Page Read and Page Edit behavior, geometry, continuation markers, page numbers, arrows
   placeholders, and tests unchanged. Page Read/Edit still use the shared page model.
5. Update tests:
   - delete/replace M4b1c marker assertions;
   - add a regression that Continuous has no `[data-page-marker]`, no page-model measurement calls,
     and no page chrome at 1440/960;
   - keep the image/preload, Page Read/Edit suites green.
6. Do not edit spec/UX/ADR/plan; the orchestrator updates them (continuous markers removed, pages are
   Page/PDF only).

## Gates

- `npm run check:boundaries`
- `npm run typecheck`
- targeted vitest
- `npm test`
- `npm run test:ui`
- `npm run test:recovery:run`
- `npm run e2e:critical`
- one `npm run verify:fast` at the end

## Deliverable

Report `docs/reports/m4b2a-remove-continuous-page-chrome.md`: worktree/branch/base/commit, removed
files/tests/styles, where the page model runs now, proof Continuous has no page chrome and no page
model cost, tests/timings, risks, not verified. Do not merge or push. Stop and ask if any page chrome
is intentionally shared with the continuous canvas.
