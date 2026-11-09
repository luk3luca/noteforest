# R2j — Page callout modes A + B2

**Role:** Builder / Implementer  
**Milestone:** Page tree layout (Page/PDF only)  
**Base:** current `main` after R2i; exact SHA in the handoff  
**Worktree:** assigned by the Orchestrator with `delegate_task` worktree isolation  
**Timebox:** 2 days

## Context

R2i changed Page direct-child placement to use the whole subtree and wrap the
atomic child group at `childIndent` (26 px). Callouts still use the current
left/below behavior. The product owner has chosen two callout modes:

- **A** when there is enough right-side space: callouts to the right of the cell,
  direct children below at the child indent.
- **B2** when there is no right-side space: two independent below trunks:
  - outer/left trunk for direct children;
  - inner/right, double-offset trunk for callouts;
  - callouts first below the parent, direct children lower.
- If neither A nor B2 fits, use the current **stacked** placement (callouts
  first, children below). B1 (one shared below trunk) is dropped.

Continuous is untouched.

## Goal

Page Read/Edit and PDF place callouts in A, B2, or stacked fallback per parent,
with independent trunks, no card collisions, left-entry arms, and no horizontal
`p.N` chips for tree edges.

## In scope

- Add PageTheme/LayoutOptions tokens (Page-only):
  - `childIndent` 26 (already R2i);
  - child trunk inset 12, child card indent 26;
  - callout trunk inset 24, callout card indent 38;
  - callout right gap 24, `calloutModeMinWidth` 240;
  - callout/card offsets available to custom/normalization.
- Implement per-parent mode selection after the subtree-aware child wrap:
  1. place parent;
  2. compute child wrap with R2i;
  3. measure free right space; choose A if a callout stack fits;
  4. otherwise choose B2 when its two trunks/cards fit without collision;
  5. otherwise stacked fallback.
- Mode A:
  - callouts to the right of the parent, stacked;
  - callout leader may exit through the parent card's right side;
  - direct children start below the parent at the child indent, with their own
    trunk;
  - no collision with the callout stack.
- Mode B2:
  - two below trunks, outer/left child at 12, inner/right callout at 24;
  - child cards at 26, callout cards at 38;
  - callouts first below the parent, children lower;
  - separate trunks; each group enters left; no collision.
- Stacked fallback:
  - callouts first below parent, then children; one below trunk as today.
- All modes:
  - group trunks continue across pages with R2g semantics;
  - nested groups remain independent;
  - Page Read/Edit and PDF consume the same geometry/model;
  - deterministic per-parent choice, independent of viewport/zoom;
  - no tree `to-edge`/`from-edge`/`p.N` chips.
- Add fixtures and tests:
  - A with right space, multiple callouts;
  - B2 with no right space, multiple callouts and multiple children;
  - stacked fallback when B2 does not fit;
  - nested child group/callouts;
  - page break across each mode;
  - Page Read/Edit/PDF print model;
  - page count/whitespace and no overlap.
- Report at `docs/reports/r2j-page-callout-modes.md`.

## Out of scope

- Continuous layout/tokens/canvas.
- Settings UI, manual breaks, M4c PDF compositor/export.
- Spec/UX/ADR changes.
- Full design-token/docs split (P0); only Page token additions.
- Compaction legacy row fill.
- Merge, push, PR, parent-checkout edits.

## Files

Read:

- `packages/layout/src/layout.ts` — R2i subtree fit/child wrap, callout placement.
- `packages/layout/src/page-settings.ts` — PageTheme/presets/custom.
- `packages/layout/src/types.ts` — LayoutOptions/LayoutBlock.
- `packages/layout/src/page-edges.ts` — PageEdge/trunk groups.
- `tests/support/page-fixtures.mjs`, R2i/R2f/R2g UI suites.
- `docs/tasks/page-wrap-callouts-plan.md` — A/B2 design and decisions.
- `docs/tasks/post-page-roadmap.md`.

Expected to touch:

- `packages/layout/src/layout.ts`
- `packages/layout/src/page-settings.ts`
- `packages/layout/src/types.ts` if needed
- `packages/layout/src/page-edges.ts` only if the group model needs a token/flag
- `packages/layout/test/` new R2j tests plus existing Page suites
- `tests/support/page-fixtures.mjs`
- `tests/ui/r2j-page-callout-modes.test.mjs`
- `package.json`
- `docs/reports/r2j-page-callout-modes.md`

## Acceptance criteria

- [ ] Mode A: callouts right of parent, children below at child indent, no
      collision, callouts/children have separate trunks.
- [ ] Mode B2: callouts first on inner/right trunk (24/38), children lower on
      outer/left trunk (12/26), no collision, separate trunks.
- [ ] Stacked fallback when neither A nor B2 fits; B1 not used.
- [ ] Mode choice is per parent, deterministic, and uses resolved Page width,
      not viewport/zoom.
- [ ] Every callout/child arm enters left; no tree `p.N` chips.
- [ ] Trunks continue across pages; nested trunks stay independent.
- [ ] Page Read/Edit/PDF print model share the same geometry.
- [ ] Page count/whitespace recorded; no overlap/overflow.
- [ ] Targeted tests and `npm run verify:fast` pass with real timings.
- [ ] Report maps every criterion to pass/fail.

## Tests and evidence

- Unit: mode choice, A geometry, B2 two trunks/offsets, stacked fallback,
  collision cases, nested/page-break.
- UI: R2j suite Page Read/Edit, **no callout mode chip** beyond existing
  reference indicators, screenshots.
- Existing R2i/R2e/R2f/R2g/R2b/R2d suites.
- End: `npm run verify:fast`; Orchestrator full `verify`.
- Evidence under `artifacts/r2j/`; no fixed sleeps/native dialogs.

## Stop and ask

Stop and report if:

- mode A/B2 requires a product decision not covered here;
- the callout leader in A needs to cross content in an unacceptable way;
- mode selection oscillates or changes page count unpredictably;
- R2i topology must change;
- the change requires Continuous/spec/ADR/M4c work;
- the baseline has unrelated failures.

## Report format

- Summary, files, checks/timings.
- Acceptance pass/fail.
- Page count/whitespace and screenshots.
- Open questions/risks.
- Worktree path, branch head SHA.
