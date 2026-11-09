# R2f — Page edge topology alignment

> **R2i follow-up (9 November 2026).** Subtree-aware wrap moves the whole
> direct-child group below the parent when any child subtree does not fit right.
> The R2f fixture now exercises that topology: wrapped children and callouts share
> `root:below`, and the grandchild owns the nested `child1:right` trunk. The edge
> contract described below is unchanged.

**Role:** Builder / Implementer  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-01a2f1de`  
**Branch:** `t3/r2f-page-edge-topology`  
**Base:** `6407dc2` (WIP preservation commit; documented below)  
**Date:** 8 November 2026

## Summary

Page Read/Edit and the PDF print model now use the layout's semantic placement
instead of deriving topology from a target's `y`:

- `LayoutBlock` exposes `placement: 'right' | 'below'`, decided where the block
  is placed (`beside` column vs group wrap/callout row vs compaction row).
- The layout package's `EdgePlacement` is the single type; Continuous's
  `EdgePlacement` in `lib/tree.ts` is now an alias of it.
- `buildPageEdges` groups same-page primary edges by
  `(page, parentBlockId, placement)` and emits one shared `PageEdgeTrunk` per
  group.
  - `right`: parent right port → one vertical rail → left arm per target.
  - `below`: parent bottom at one shared trunk x → left arm per callout or
    wrapped child.
- Every same-page primary tree route is `entry: 'left'`, `direction: 'right'`.
  The old `directBelowPageRoute` top-entry shortcut is removed.
- `routePageEdge` gained `requiredEntry`; tree edges pass `left` through the
  obstacle fallback, which may shorten the stem when the page has no room but
  may not switch the entry side.
- `PageEdge` carries `placement` and `trunk`; `PageEdges.tsx` exposes them as
  data attributes; `buildPrintModel` consumes the same `PageEdge` objects, so
  Page Read/Edit and PDF cannot drift.
- Cross-page `to-edge`/`from-edge` indicators, reference dashes, R2d orthogonal
  routing, and obstacle avoidance are unchanged.

## Why

The previous mapper classified `target.y >= source.bottom` as a below/callout
target. In the screenshot topology, direct child 2 sits below the parent's card
but is still a right-column sibling, so it borrowed the callout below trunk.
Grandchildren and callouts then got top/right entries from the geometric
heuristic. Placement is now a layout fact, not a geometry guess.

## Files changed

- `packages/layout/src/types.ts` — `EdgePlacement`, `LayoutBlock.placement`.
- `packages/layout/src/layout.ts` — placement at every placement decision;
  minimal narrow-lane callout stem floor (see risks).
- `packages/layout/src/edge-style.ts` — shared `trunkInset` token.
- `packages/layout/src/page-edges.ts` — semantic group/trunk mapper.
- `packages/layout/src/page-routing.ts` — `requiredEntry`; removed
  `directBelowPageRoute`; left-entry fallback.
- `packages/layout/test/page-edges.test.ts` — topology/trunk unit coverage.
- `packages/layout/test/page-routing.test.ts` — locked left-entry coverage.
- `packages/layout/test/page-packing.test.ts` — updated stale WIP expectation.
- `apps/desktop/src/renderer/src/lib/tree.ts` — shared `EdgePlacement` alias.
- `apps/desktop/src/renderer/src/lib/design-tokens.ts` — re-export shared
  `trunkInset`.
- `apps/desktop/src/renderer/src/page/PageEdges.tsx` — placement/trunk data
  attributes.
- `apps/desktop/test/page-edge-parity.test.ts` — Continuous/Page parity.
- `packages/pdf/test/print-model.test.ts` — shared trunk assertion.
- `tests/support/page-fixtures.mjs` — screenshot-topology fixture.
- `tests/ui/r2f-page-edge-topology.test.mjs` — new UI suite.
- `package.json` — `test:ui` and `verify` include the new suite.
- `docs/reports/r2f-page-edge-topology.md` — this report.

Evidence: `artifacts/r2f/ui/page-edge-topology-1440x900.png` and
`artifacts/r2f/ui/page-edge-topology-edit-1440x900.png` (ignored build
artifacts). No native dialogs, no fixed sleeps.

## Checks and real timings

Baseline (before the fix):

- `npx vitest run packages/layout/test/page-edges.test.ts packages/layout/test/page-routing.test.ts`
  — 134 ms, 15 pass / 1 fail (callout entry `top`, the target bug).
- `npx vitest run packages/layout` — 265 ms, 86 pass / 2 fail. The second
  failure was a stale WIP `page-packing` callout-x expectation; the WIP base
  already shifted that callout to the shared row indent but did not update the
  test. No unrelated failures were found.

Final:

- `npx vitest run packages/layout/test/page-edges.test.ts packages/layout/test/page-routing.test.ts`
  — 85 ms, 20/20 pass.
- `node --test tests/ui/r2f-page-edge-topology.test.mjs` — 9.1 s, 2/2 pass
  (first cold run 16.1 s, including the Electron binary download).
- `node --test tests/ui/r2d-page-edge-style.test.mjs tests/ui/r2e-page-tree.test.mjs tests/ui/r2b-page-packing.test.mjs`
  — 12.1 s, 11/11 pass.
- `npx vitest run` — 2.35 s, 86 files / 852 tests pass.
- `npm run verify:fast` — 52.3 s wall; critical e2e 36.2 s / 16 tests.
- `npm run test:ui` — exit 0, 29 UI suites / 88 tests pass (build + all suites
  ≈ 5 m 52 s wall).

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Screenshot fixture: child 1 and child 2 are right-group children, share one right trunk, enter left; child 2 does **not** use the callout below trunk. | **PASS** — unit asserts `1:root:right` shared rail; UI asserts placement/trunk/route; child 2 trunk id differs from the callout trunk. |
| 2 | Grandchild is a below/indented target of child 1 and enters left, not top. | **PASS** — unit asserts `1:child1:below`, from child 1 bottom; UI asserts left entry and stem ≥ 12. |
| 3 | Both anchored callouts are below the parent, share one below trunk, enter left. | **PASS** — unit + UI assert `1:root:below`, one `from` port, left entries. |
| 4 | No primary same-page tree edge in the fixture has `entry: 'top'` or `'right'`. | **PASS** — unit loops all 5 primary edges; UI `assertLeftEntry` loops all edges. |
| 5 | One trunk per `(parent, placement)` group; no duplicate sibling trunks; callouts + wrapped children share the below trunk. | **PASS** for semantic groups; unit covers a callout + wrapped child sharing one below trunk. Obstacle fallback is the documented exception (below). |
| 6 | Page Read and Page Edit render the same routes; PDF print model consumes the same entry/trunk data. | **PASS** — UI snapshots routes before/after `Meta+E`; print-model test asserts the shared `PageEdge`/trunk records. |
| 7 | Cross-page indicators, reference dashes, R2d orthogonal style, and obstacle avoidance still pass. | **PASS** — R2d 4/4, R2e 4/4, R2b 3/3, R2a/other Page suites pass in `test:ui`; the later-sibling obstacle case still routes around cards. |
| 8 | Gate: targeted tests + `npm run verify:fast`. | **PASS** — see timings above; `verify:fast` exit 0. |
| 9 | Report maps every acceptance criterion. | **PASS** — this table. |

Continuous/Page parity is covered by `apps/desktop/test/page-edge-parity.test.ts`:
both surfaces use the same `EdgePlacement` type and classify the same branches
as `right`/`below` for one document.

## Open questions / risks

1. **Narrow-lane callout floor (geometry-adjacent).** The R2d fixture root is
   178 px wide; its callout clamps to x = 9. A left entry there can have at
   most a 9 px stem inside the content box, which conflicts with R2d's
   established "left entry ⇒ stem ≥ 12" assertion. The WIP base already shifts
   callouts toward the shared row indent; R2f adds the minimal fallback
   `parent.x + stemMin` (a 3 px shift from 9 to 12 in that case) so the below
   trunk at the parent's left edge keeps a full left stem. No tree column,
   packing decision, page size, or theme changed. If the "no Page layout
   placement/geometry changes" rule is literal, the Orchestrator/Product Owner
   should ratify this 3 px callout floor; the alternative is to weaken R2d's
   stem assertion, which the brief forbids.
2. **WIP baseline staleness.** The base was not fully verified. Its callout row
   indent shifted `page-packing`'s expected callout x; the test was updated to
   the WIP-intended `contentLeft + 26`. This is a baseline consequence, not a
   new topology change.
3. **Obstacle fallback can leave the shared trunk.** The semantic trunk route is
   deterministic and used when clear. If it would cross a card, the per-edge
   R2d obstacle router takes over and keeps the left entry; that edge may not
   follow the group rail. A group-level obstacle-aware trunk router would be a
   larger R2 follow-up. The screenshot/unit fixtures are obstacle-free on the
   trunk path, and compaction-style obstructed rows still avoid cards.
4. **References are not tree edges.** Same-page references keep the generic
   router and may still use its top fallback; the locked-left contract applies
   to primary tree edges. Reference dashes and indicator semantics are
   unchanged.
5. **Docs drift.** `docs/design-tokens.md` still describes the old Page target
   top fallback for wrapped rows and does not mention the semantic trunk group.
   It was out of scope here; a docs sweep should follow the accepted behavior.
6. **Compaction legacy policy.** Placement for the lab-only `compaction` packing
   maps first-row components to `right` and wrapped rows to `below`; no product
   preset uses it, and its UI screenshots are visual-only.

## Next suggested step

Orchestrator: run one full `npm run verify` at integration, then hand the
screenshot and this report to the product owner for the visual Page check.
