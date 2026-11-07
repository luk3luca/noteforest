# M4b2b — Page view arrows and study density

**Role:** Implementer / Builder
**Milestone:** M4b — editor layouts
**Base:** current `main` after M4b2a
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** Page Read/Edit only. Add graph arrows and make the A4 page dense enough for study. No
Continuous page chrome, no PDF, no free canvas.

## Product feedback (authoritative)

The product owner rejects the current Page view:

- it has **no arrows**, so the graph is invisible; arrows are fundamental;
- the page is mostly empty: **20 mm margins, 10.5 pt body, large card chrome**, 2–4 blocks per page;
- it must hold much more content and be usable for following a study flow;
- continuous has no pages; all page chrome belongs here only.

## Required work

### 1. Page arrows (primary + reference)

- Render edges on the Page surface for Page Read and Page Edit:
  - primary: solid arrow;
  - reference: dashed/distinct arrow with label when present;
  - anchored callouts: start at the anchor point when available, otherwise at the parent block
    edge; end at the callout block;
  - use the shared `ContinuousLayout.edges`/`anchors` and the derived page fragments; do not add a
    second layout engine.
- Same-page edges: route from source to target with an orthogonal/curved path, arrowhead at target,
  clipped to the page content box. Avoid crossing through card text where possible; route around
  card bounds.
- Cross-page edges: draw a page-edge indicator on the source page (“→ page N”) and a “← from page M”
  indicator on the target page; do not draw a line through the margin. No backwards loops.
- Edges must be visible in Page Read and Page Edit; the edit overlay sits above them. They must not
  intercept clicks except optional edge selection (not required in this slice).
- Accessible: arrows are `aria-hidden`; the edge label text is available in the page DOM/ARIA where
  labels exist. Do not rely on color alone (dash pattern + label).

### 2. Study density

Create a compact **page-specific** metric set, separate from the Continuous screen layout. Do not
change Continuous metrics or the content model. Target: substantially more blocks/text per A4 page
while keeping body text readable (≥9 pt, line length reasonable).

Starting candidates (tune with a lab on the showcase):

| Metric | Current | Candidate |
|---|---:|---:|
| Page margins | 20 mm | **12 mm** |
| Body | 10.5 pt / 1.45 | **9 pt / 1.3** |
| Headings | 16/13/11 pt | **14/12/10.5 pt** |
| Code | 8.75 pt | **8 pt / 1.3** |
| Table | 9.5 pt | **8.5 pt / 1.25** |
| Header/footer | 8 pt | **7 pt** |
| Card padding | 12 px | **8 px** |
| Segment gap | 8 px | **4 px** |
| Sibling/wrap/callout gaps | 24/18/20 | **16/12/12** |
| Page card max width | 420 px | **380–420 px, choose from lab** |

- Page metrics must be shared by the Page measurement host, Page Read, Page Edit and the future
  PDF. Continuous remains unchanged.
- Reduce block/card chrome and vertical gaps; do not clip content. Tables still break only between
  rows, no line/image/formula/code/table-row cut.
- Run a density lab on the showcase and, if useful, `scale-300`:
  - current vs compact: page count, blocks/page, content height used, whitespace, max line length,
    overflow/defects;
  - choose the compact values that maximize study density without making text unreadable;
  - report the chosen values and the resulting showcase page count. Do not use a two-column layout
    in this slice; if compact is still too sparse, report it as a follow-up proposal.
- If 12 mm margins + 9 pt still produces >20 pages for the showcase, report the numbers and propose
  the next lever (wider cards, two-column top-level packing, or smaller cards) instead of silently
  choosing a more aggressive cut.

### 3. Preserve

- Page Read remains read-only; Page Edit overlay, commit/reflow, session state, continuation/ghost
  markers, images/placeholders, page navigation, fit/zoom.
- No Continuous page markers/chrome (M4b2a removes them).
- No PDF/print compositor.

## Tests and evidence

- UI: arrows visible on a multi-block page (primary solid, reference dashed); cross-page indicator;
  Page Read and Page Edit; no arrows in Continuous; density measurements (`data-page-*`), page count
  before/after; no page errors.
- Unit/lab: page metric calculation and page count on showcase; edge endpoint mapping for same-page
  and cross-page cases.
- Screenshots: Page Read with arrows and compact density at 1440×900 and 960×720, portrait and
  landscape; a page with a continuation/ghost marker; Page Edit overlay with arrows behind.
- Gates: check:boundaries, typecheck, targeted vitest, npm test, test:ui, test:recovery:run,
  e2e:critical, one verify:fast.

## Guardrails

- Do not add a second paginator, CSS re-pagination, or a Continuous page model.
- Do not change the document content model or the showcase.
- Do not edit spec/UX/ADR/plan; report chosen token values and page counts.
- No new dependency.
- Do not merge or push.

## Deliverable

Report `docs/reports/m4b2b-page-arrows-density.md`: worktree/branch/base/commit, arrow routing rules,
density table/lab, chosen values, showcase page count before/after, tests/timings, screenshots,
risks, not verified. Stop and ask if the density target requires a product decision (two-column page
or a smaller font than 9 pt) or if an edge case cannot be routed without a second layout.
