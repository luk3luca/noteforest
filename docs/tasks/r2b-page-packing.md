# R2b — Page packing: use the horizontal half

**Role:** Implementer / Builder
**Milestone:** refactor/M4 — Page density
**Base:** current `main` after R2a
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** Page/PDF layout packing only. No Settings UI, manual-break UI, or PDF print compositor.

## Why

Compact typography reduced the showcase from 27 to 21 pages, but it is still **3.9 blocks per
page**. The remaining waste is horizontal: a page uses one ~420 px card column on a ~1030 px
content box, while callouts and direct children stack vertically. R2b must make Page use the
horizontal half.

## Required work

1. **Page packing policy in the layout engine (Page/PDF only).**
   - Add a page packing option, e.g. `pagePacking: 'stacked' | 'beside'` to `LayoutOptions`.
     `stacked` is the current R2a behavior. `beside` is the new Page/PDF default candidate.
   - In `beside`:
     - direct children of a block start at the parent's `y` in the right column instead of below
       the anchored callouts;
     - anchored callouts stay below the parent, in the left column;
     - the callout lane is constrained to end before the right child group (safe gap), never
       overlaps it;
     - the group/direct-child rules, group-level left-origin wrap, no-overlap, 16 px safe gap, and
       anchor alignment remain intact;
     - recursion applies at every level;
     - a block with no callouts behaves like the current layout;
     - a block whose direct children do not fit right still wraps the whole group below, as today.
   - Page/PDF use `beside`; Continuous does not use the page layout engine, so it is unaffected.
   - If `beside` cannot be made deterministic/no-overlap, keep `stacked` and report why.

2. **Width / column behavior.**
   - The left callout column and right direct-child column share the page content width. Compute
     their widths from measured min/max content and the safe gap; do not use fixed pixels.
   - Callouts may be narrower than the current lane; never clip their content. If a callout cannot
     fit the left column, fall back to stacking that callout below the left column or the whole
     block to stacked; report the rule.
   - Direct children keep their adaptive widths; the group must not overlap callouts or the parent.
   - No horizontal scrolling inside a page; defects instead of clipping.

3. **Lab.**
   - Compare on the showcase and `scale-300`:
     - compact + stacked (R2a);
     - compact + beside;
     - optionally compact + wider maxCardWidth (480/520/560) to see whether width alone helps.
   - Report page count, blocks/page, whitespace, max column overlap, arrow-crossing count (rough
     heuristic), defects, and a screenshot sample.
   - Choose `beside` as default only if it is denser, readable, deterministic, and no-overlap.
     Otherwise report the numbers and propose the next lever (top-level two-column packing).

4. **Tests/evidence.**
   - Layout unit tests: beside placement y/x, callout/right group separation, recursion, group wrap,
     no overlap, determinism.
   - UI: Page Read/Edit with arrows and side-by-side callouts/children; no overflow; 1440/960
     landscape/portrait; Continuous unchanged; Page Edit overlay.
   - Existing R1b density lab updated/compared; screenshots.
   - Gates: check:boundaries, typecheck, targeted vitest, npm test, test:ui, test:recovery:run,
     e2e:critical, one verify:fast.

## Do not

- Do not implement two-column top-level packing in this slice unless the lab shows `beside` cannot
  help and you stop to ask.
- Do not change typography/compact values.
- Do not implement Settings UI, manual-break UI/cleanup, or PDF print compositor.
- Do not touch `/Users/luca/Documents` or the showcase.
- Do not edit spec/UX/plan; report.

## Deliverable

Report `docs/reports/r2b-page-packing.md`: worktree/branch/base/commit, packing rule, callout/right
column constraints, lab table, chosen default, tests/timings, screenshots, risks, not verified. Do
not merge or push. Stop and ask if beside requires a product reading-order decision or cannot be
made no-overlap/deterministic.
