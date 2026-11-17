# R2f — Page edge topology alignment

**Role:** Builder / Implementer  
**Milestone:** M4b Page / edge stabilization  
**Base:** `20e2a19` — WIP preservation commit; this base is **not fully verified**  
**Worktree:** assigned by the Orchestrator with `delegate_task` worktree isolation  
**Timebox:** 4 hours

## Context

Page Read/Edit and the PDF print model use `buildPageEdges` + `page-routing`. Continuous uses a separate edge layer that already knows each target's placement group and draws one shared trunk with left entry. The Page mapper infers placement from geometry (mostly `y`), so a right-column sibling that is vertically below another sibling is misclassified as a below-stack child; callouts and indented grandchildren then get top or right entries. The product-owner rule is: **siblings in the same placement group share one trunk; every tree edge enters from the left; callouts and wrapped children below use the below trunk.** Page must use the same semantic placement model as Continuous, not a second topology.

Reference screenshot (local, do not commit):
`/Users/example/.t3/userdata/attachments/7b9d51bf-80d3-4fbe-add5-2af15c69904a-f2febd1c-ca30-47ad-a85b-9f6d9aa02d24.png`

It shows: direct child 1 at the parent's right; a grandchild indented under child 1; two callouts below the parent; direct child 2 in the same right column as child 1 but lower. Child 1 is correct. The grandchild and both callouts currently enter from the top; child 2 currently shares the callout below trunk instead of child 1's right trunk.

Relevant docs:

- `AGENTS.md` — working agreement 12 (Orchestrator delegation) and Page edge rules.
- `docs/design-tokens.md` — edge/trunk vocabulary and Page edge style.
- `docs/tasks/refactor-personal-page-settings.md` — current Page tree model.
- `docs/reports/r2c-page-compaction.md` — marked superseded; do not restore row fill.

## Goal

Page Read/Edit and PDF expose the same semantic edge topology as Continuous: one trunk per `(parent, placement)` group, all tree edges enter the target from the left, sibling right-group children share the right trunk, and below callouts/wrapped children use the below trunk.

## In scope

- Add explicit placement information from the layout: each `LayoutBlock` (or an equivalent deterministic layout record) exposes `placement: 'right' | 'below'` for primary children. Derive it from the actual placement decision (`beside`/`rightX` vs group wrap/`below`), never from the target's `y`.
- Align the placement type/name with Continuous's `EdgePlacement` (`'right' | 'below'`); Page must consume the same semantics. A full extraction of Continuous's DOM router is not required, but the shared type/placement contract must be one definition or a parity-tested alias.
- Refactor `buildPageEdges` to group same-page primary edges by `(page, parentBlockId, placement)` and produce one source trunk per group:
  - `right`: source exits the parent's right edge; all right-group siblings use the same vertical rail; target entry left.
  - `below`: source exits the parent's bottom at one shared below-trunk x; anchored callouts and wrapped direct children of that parent share it; target entry left.
- All tree edges (primary, non-cross-page) must use `entry: 'left'`. No top entry for the grandchild or callouts.
- Remove `directBelowPageRoute` as a top-entry shortcut. The obstacle-aware router may remain as a fallback for obstacles, but it must not change the semantic entry side. Remove `overlapsX ? 'top' : 'left'` for below targets.
- Keep cross-page `to-edge`/`from-edge` indicators, reference dashes, R2d orthogonal style, and obstacle avoidance. Cross-page indicators are not tree entries and keep their current page-edge semantics.
- Page Read and Page Edit must render the same routes. `packages/pdf/src/printModel.ts` must consume the same entry/trunk data; add a print-model assertion if practical.
- Tests:
  - New fixture reproducing the screenshot: parent with child 1 (one grandchild), child 2, and two anchored callouts; child 1 and child 2 in the same right column with child 2 lower.
  - New UI suite `tests/ui/r2f-page-edge-topology.test.mjs`; add it to `test:ui` and `verify` scripts.
  - Unit coverage in `packages/layout/test/page-edges.test.ts` and `page-routing.test.ts` for group/trunk/left-entry behavior.
  - A Continuous/Page parity test for placement and entry semantics (same document, not necessarily same coordinates).
- Report at `docs/reports/r2f-page-edge-topology.md`.

## Out of scope

- No Page layout placement/geometry changes, no PageTheme/default changes, no canvas-width changes.
- No label, image-card, PageEdit overlay, pagination, PDF renderer, or visual polish changes.
- No spec/UX/ADR changes. Do not edit `AGENTS.md` or `docs/plan.md`; the Orchestrator owns metrics/status.
- No merge, rebase, push, or PR. Do not alter the WIP baseline unless the task requires it.
- Do not restore `compaction` row fill or change the compact `beside` default.

## Files

Read:

- `packages/layout/src/layout.ts` — placement decision; `LayoutBlock` construction.
- `packages/layout/src/types.ts` — `LayoutBlock`, `EdgeLayout`, page/fragment types.
- `packages/layout/src/page-edges.ts` — the Page mapper to refactor.
- `packages/layout/src/page-routing.ts` — router ports/entries; remove top shortcut usage.
- `apps/desktop/src/renderer/src/lib/tree.ts` — Continuous `EdgePlacement`/edge descriptors.
- `apps/desktop/src/renderer/src/lib/edge-routing.ts` — Continuous right/below trunk semantics (read-only reference).
- `packages/pdf/src/printModel.ts` — consumer of `buildPageEdges`.
- `tests/support/page-fixtures.mjs` — fixture helpers.
- `tests/ui/r2d-page-edge-style.test.mjs`, `r2e-page-tree.test.mjs` — existing route/tree coverage.

Expected to touch:

- `packages/layout/src/layout.ts`
- `packages/layout/src/types.ts`
- `packages/layout/src/page-edges.ts`
- `packages/layout/src/page-routing.ts`
- `packages/layout/test/page-edges.test.ts`
- `packages/layout/test/page-routing.test.ts`
- `tests/support/page-fixtures.mjs`
- `tests/ui/r2f-page-edge-topology.test.mjs`
- `tests/ui/r2e-page-tree.test.mjs` only if the new placement field changes an assertion
- `package.json` (new suite path)
- `docs/reports/r2f-page-edge-topology.md`

## Acceptance criteria

- [ ] In the screenshot fixture, child 1 and child 2 are both right-group children; their edges share one right trunk and both enter left. Child 2 does **not** use the callout below trunk.
- [ ] The grandchild (child of child 1) is a below/indented target and enters from the left, not the top.
- [ ] Both anchored callouts are below the parent, share one below trunk, and enter from the left.
- [ ] No primary same-page tree edge in the fixture has `entry: 'top'` or `'right'`.
- [ ] One trunk per `(parent, placement)` group; no duplicate sibling trunks. Callouts and wrapped children of the same parent share the below group trunk; right-group siblings share the right group trunk.
- [ ] Page Read and Page Edit render the same routes; the PDF print model consumes the same semantic entry/trunk data.
- [ ] Cross-page indicators, reference dashes, R2d orthogonal style, and obstacle avoidance still pass.
- [ ] Gate: targeted tests + `npm run verify:fast` pass with real timings.
- [ ] Report maps every acceptance criterion to pass/fail.

## Tests and evidence

- Targeted while working: `npx vitest run packages/layout/test/page-edges.test.ts packages/layout/test/page-routing.test.ts`
- New UI: `node --test tests/ui/r2f-page-edge-topology.test.mjs`
- Existing route/tree suites: `node --test tests/ui/r2d-page-edge-style.test.mjs tests/ui/r2e-page-tree.test.mjs tests/ui/r2b-page-packing.test.mjs`
- End of task: `npm run verify:fast`
- Evidence: screenshot PDF/PNG path under `artifacts/r2f/`; no native dialogs; no fixed sleeps.
- Orchestrator runs one full `npm run verify` after integration.

## Stop and ask

Stop and report instead of inventing a decision when:

- the existing Page layout cannot expose placement without changing placement geometry;
- the Continuous semantics require changing the Continuous layout or its edge output;
- a product decision is missing about callout vs direct-child trunk grouping;
- the WIP baseline has unrelated failing tests;
- the fix would require changing a public command, schema, spec/UX/ADR, or scope.

## Report format

- Summary: what changed and why.
- Files changed.
- Checks run, with real timings.
- Acceptance criteria: pass/fail per item.
- Open questions / risks.
- Next suggested step.
- Worktree path, branch head SHA.

The Orchestrator rejects a report that does not map back to the acceptance criteria.
