# R2d — unify Page/PDF edge style with Continuous

**Role:** Implementer / Builder
**Milestone:** refactor/M4 — Page visual parity
**Base:** current `main` after R2c
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** edge style only. No placement/density changes, Settings UI, manual breaks, or PDF
compositor. This is the last slice before the product-owner checkpoint.

## Why

Page arrows are cubic Bézier curves; Continuous arrows are orthogonal with trunk/arms, near-right
angles, a shared arrowhead, and left entry. Two visual languages for the same graph are not
acceptable. The Page mapper (`buildPageEdges`) may stay, but the **route style** must match
Continuous.

## Required work

1. **One visual language.**
   - Same stroke width/color rules for primary/reference;
   - same arrowhead shape/size/fill rules;
   - same corner radius and minimum stem length;
   - target entry from the left where possible;
   - no cubic Bézier curves unless a case is impossible with orthogonal routing; document any
     exception.
2. **Page routing.**
   - Same-page edges: route from the source fragment right edge (or resolved anchor point) to the
     target fragment left edge using orthogonal segments and rounded corners; avoid crossing card
     interiors; clip to page content.
   - Cross-page indicators: keep `to-edge`/`from-edge` semantics, but use the same stroke/arrowhead
     style; no ink through the margin.
   - Reference edges: dashed/distinct with the same geometry language and labels.
   - Page Edit overlay remains above; no pointer interception.
3. **Reuse, not a second router.**
   - Reuse `edge-routing.ts` constants/helpers where possible, or extract the shared stroke/arrow/
     corner primitives. `buildPageEdges` remains the single page mapper; no duplicate branch logic.
   - PDF print model must consume the same route style, so Page Read/Edit and PDF cannot drift.
4. **Tests/evidence.**
   - Unit: page route contains orthogonal segments, target enters left, no `C` command for standard
     same-page cases, cross-page indicators keep direction/target page.
   - UI: primary/reference arrows in Page Read/Edit, anchor start, cross-page in/out, no pointer
     interception; Continuous unchanged.
   - Screenshots: Page Read with arrows at 1440×900 and 960×720, landscape/portrait.
   - Gates: check:boundaries, typecheck, targeted vitest, npm test, test:ui, test:recovery:run,
     e2e:critical, one verify:fast.
5. **Stop after this slice.**
   - Do not start Settings UI, manual-break UI, packing changes, or M4c.
   - The orchestrator will run the full verify and hand the build to the product owner.

## Do not

- Do not change Page placement/density or Continuous layout.
- Do not touch `/Users/luca/Documents` or the showcase.
- Do not edit spec/UX/plan; report.
- No new external dependency.

## Deliverable

Report `docs/reports/r2d-edge-style.md`: worktree/branch/base/commit, routing rules, shared
primitives, before/after screenshots, tests/timings, risks, not verified. Do not merge or push. Stop
and ask if a page case cannot be routed orthogonally without crossing cards.
