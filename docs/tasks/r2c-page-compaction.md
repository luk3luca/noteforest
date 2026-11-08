# R2c — Page compaction placement engine

**Role:** Implementer / Builder
**Milestone:** refactor/M4 — Page density
**Base:** current `main` after R2b
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** Page/PDF placement only. No edge-style change (R2d), Settings UI, manual breaks, or PDF
compositor.

## Product model (authoritative)

There are **two placement engines**, and that is intentional:

```text
Continuous placement: loose screen flow
  always right, wrap on anchor/overflow, callout lane, no pages

Page placement: finite-space compaction
  same components, same content, same arrows, same links
  fill the row, align columns, indent from the parent, wrap when full,
  paginate afterwards
```

The Page engine is not a tree outline and not a scaled Continuous. It is a **compaction packer**
for the same blocks. The current `beside` policy is only a partial step: direct children go right,
but callouts and other components still stack and the row is not filled.

## Required work

1. **Introduce a Page compaction policy** (`pagePacking: 'compaction'`, keeping `stacked` and
   `beside` as references; compact default becomes `compaction` if the lab accepts it).
   The Page engine must:
   - place the parent card at the current row origin;
   - treat anchored callouts and primary direct children as ordered components;
   - place the first component to the right of the parent, then fill the row with subsequent
     components while they fit;
   - align components in the row (same top y where possible; column alignment for siblings);
   - when the next component does not fit, wrap to the next row below the parent, with one
     `wrapIndent` from the parent/row origin; do not indent every child individually;
   - recurse inside every component: its own callouts/children start to its right and fill their
     own row;
   - keep reference targets where their primary home places them; references never duplicate a
     block. Reference edges are drawn, not layout components;
   - preserve reading order as row-major (left-to-right, then next row), deterministic;
   - handle a component taller than the remaining page by leaving it to the paginator's safe
     boundaries; do not clip or free-position;
   - preserve no-overlap, safe gap, anchor alignment, and group wrapping fallback;
   - allow a component to be a callout or a direct child; the callout lane is not a fixed left-only
     strip if the row has room, but callouts must remain associated with their anchor via an edge.
2. **Finite-space rules.**
   - Width: components are measured at min/max/fixed widths; row packing uses measured widths and
     the page content width. Do not use fixed pixel columns.
   - Height: rows have a natural height; the next row starts after the tallest component in the
     row (plus row gap). Page height is handled by the paginator, not by clipping.
   - If a row cannot place even one component, report a layout defect, never overlap.
   - If a component’s min-content exceeds the available column, fall back to a lower row or stacked
     order; report the rule.
3. **Lab.**
   - Compare on the showcase and `scale-300`:
     - compact `stacked` (R2a);
     - compact `beside` (R2b);
     - compact `compaction`.
   - Report pages, blocks/page, row fill (average components per row), whitespace, overlap,
     defects, max simultaneous columns, arrow-crossing heuristic.
   - Accept `compaction` as default only if it is denser, readable, deterministic, no-overlap, and
     arrows remain followable. If it cannot beat `beside`/`stacked`, stop and report.
4. **Tests/evidence.**
   - Layout unit tests: row filling, wrap at full row, column alignment, callout/child components,
     recursion, no overlap, reading order, determinism, components taller than page, reference
     targets not duplicated.
   - UI: Page Read/Edit at 1440/960 landscape/portrait; row-filled pages; Page Edit overlay geometry;
     no overflow; arrows still follow; Continuous unchanged.
   - Update density lab/screenshots.
   - Gates: check:boundaries, typecheck, targeted vitest, npm test, test:ui, test:recovery:run,
     e2e:critical, one verify:fast.
5. **No scope creep.**
   - Do not change Continuous placement.
   - Do not change typography/compact values.
   - Do not implement edge-style unification, Settings UI, manual-break UI/cleanup, or PDF
     compositor.
   - Do not touch `/Users/luca/Documents` or the showcase.
   - Do not edit spec/UX/plan; report.

## Deliverable

Report `docs/reports/r2c-page-compaction.md`: worktree/branch/base/commit, compaction algorithm,
component order, row/wrap rules, lab table, chosen default, tests/timings, screenshots, risks, not
verified. Do not merge or push. Stop and ask if row-major ordering conflicts with the canonical
reading order, if a reference target would need to become a layout component, or if compaction
cannot be made deterministic/no-overlap.
