# R2g — Page trunk continuity across pages

**Role:** Builder / Implementer  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-5b0313dc`  
**Branch:** `t3/r2g-page-trunk-continuity`  
**Base:** `de3d910` (`wip/page-edge-topology-base`; R2f merged)  
**Implementation commit:** `c8cf9405bbb2df428a6c0862ed92a65f6f20ed23`  
**Date:** 8 November 2026

## Summary

Primary tree edges now share one **group trunk per `(parentBlockId, placement)`**
across pages instead of one page-local trunk per page plus `→ p.N` / `← p.N`
indicators:

- `PageEdgeTrunk` is a group record with a stable `id` (`<parent>:<placement>`),
  a stable `x`, the parent `port`/`portPage`, and a `segments[]` array. It is no
  longer keyed by page.
- Segments are page-local:
  - **parent page:** from the parent port to the content bottom when a later
    child exists; with no later child, to the last arm on that page;
  - **intermediate pages:** top-to-bottom at the same `x`, including pages with
    no child of that group (pass-through);
  - **last child page:** top to the last child arm; no segment past it.
- A right group emits the horizontal parent lead from the card port to the
  stable rail `x` on the parent page. A below group stays detached with the
  shared `trunkGap` (8 px) at every level, including nested groups.
- Every child gets one left-entering arm from its group trunk, even when the
  parent is on an earlier page. Cross-page tree edges are direction `trunk`,
  have `targetPage: null`, no label, and no horizontal page chip. References
  keep their target-only dashed `from-edge` chip.
- Nested parents open independent trunks: distinct id, x, and segments. A right
  group and a below group of the same parent stay separate.
- `buildPageEdgeModel` returns both `edges` and page-local `trunks`; the Page
  renderer and `buildPrintModel` consume that one model. `buildPageEdges` stays
  as the edges-only compatibility wrapper.
- `PageEdges` draws group trunk segments (including pass-through pages) as a
  separate SVG subpath under the cards; zero-length/obstructed cases keep the
  existing R2d per-edge fallback. `EDGE_STYLE.trunkGap` is now the single token
  value (8 px) used by Continuous, Page, and the print model.
- The R2a/R2d cross-page suites now exercise the product-default compact packing
  and assert trunk continuity plus the reference-only chip. R2f expectations
  were updated for the new group ids and the 8 px below gap. The visual R2a
  wait and R1b visual arm classification follow the new `trunk` direction.

## Files changed

- `packages/layout/src/page-edges.ts` — group trunks, page segments, parent
  lead, `direction: 'trunk'`, `buildPageEdgeModel`, reference preservation.
- `packages/layout/src/edge-style.ts` — shared `trunkGap` token.
- `apps/desktop/src/renderer/src/lib/design-tokens.ts` — consume
  `EDGE_STYLE.trunkGap` instead of a second literal.
- `apps/desktop/src/renderer/src/page/PageEdges.tsx` — page trunk layer and
  trunk/segment data attributes.
- `apps/desktop/src/renderer/src/page/PageView.tsx` — one page-edge model shared
  by the SVG and the page state.
- `packages/pdf/src/printModel.ts` — `PrintPage.trunks` from the same model.
- `packages/layout/test/page-edges.test.ts` — R2g group/segment/pass-through/
  gap/nested/reference/print-model unit coverage; R2f id/gap updates.
- `packages/layout/test/page-routing.test.ts` — cross-page trunk arm and
  above-port lead coverage.
- `packages/pdf/test/print-model.test.ts` — shared `edges` + `trunks` parity.
- `tests/support/page-fixtures.mjs` — `pageTrunkContinuityDocument`.
- `tests/ui/r2g-page-trunk-continuity.test.mjs` — new multi-page UI suite.
- `tests/ui/r2f-page-edge-topology.test.mjs` — group id and below-gap updates.
- `tests/ui/r2a-page-arrows-cleanup.test.mjs` — reference indication retained;
  tree trunks replace primary page chips.
- `tests/ui/r2d-page-edge-style.test.mjs` — trunk arms included in the shared
  style/obstacle checks; reference-only chip.
- `tests/visual/r1b-page-density.test.mjs` — trunk arms count as page arms.
- `tests/visual/r2a-page-arrows.test.mjs` — cross-page wait uses trunk presence.
- `package.json` — `test:ui` and `verify` include the R2g suite.
- `docs/design-tokens.md` — R2f/R2g entry/trunk/indicator vocabulary.
- `docs/reports/r2g-page-trunk-continuity.md` — this report.

## Checks run, with real timings

- Targeted unit:
  `npx vitest run packages/layout/test/page-edges.test.ts packages/layout/test/page-routing.test.ts packages/pdf/test/print-model.test.ts`
  — **24/24 pass**, vitest **105 ms**, about **0.6 s** wall.
- Targeted UI:
  `node --test tests/ui/r2g-page-trunk-continuity.test.mjs tests/ui/r2f-page-edge-topology.test.mjs tests/ui/r2d-page-edge-style.test.mjs tests/ui/r2e-page-tree.test.mjs tests/ui/r2b-page-packing.test.mjs tests/ui/r2a-page-arrows-cleanup.test.mjs`
  — **18/18 pass**, **14.19 s** internal / **14.23 s** wall. R2g suite:
  2/2 pass (about 3.0 s; first read 1.95 s, read/edit parity 1.05 s).
- `npm test` — **86 files / 855 tests pass**, **2.26 s**.
- `npm run verify:fast` — **exit 0**, **51.87 s** wall; critical e2e
  **16/16 pass**, **43.90 s**; typecheck and boundary check included, no
  page errors.
- `npm run test:visual:r2a` — **exit 0**, 1/1 pass, **11.85 s** wall.

Evidence (ignored build artifacts):

- `artifacts/r2g/ui/trunk-continuity-page1-1440x900.png`
- `artifacts/r2g/ui/trunk-continuity-page2-1440x900.png`
- `artifacts/r2g/ui/trunk-continuity-page3-1440x900.png`
- `artifacts/r2g/ui/trunk-continuity-edit-page1-1440x900.png`

No native dialogs, no fixed sleeps in the new suite.

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Each parent group has one trunk id with a stable `x`; nested groups have distinct ids and may have different `x`. | **PASS** — unit asserts `trunk-root:right` across pages 1–3 and `trunk-child-1:below` on pages 1–2 with distinct x; UI asserts the same ids/x. |
| 2 | A group's trunk continues across every page between parent and last child, including pass-through pages. | **PASS** — unit and UI assert page 2 has no root right-group arm but a full top-to-bottom root segment; page 3 receives the same x. |
| 3 | Parent page reaches the bottom when later children exist; last child page ends at the last child arm. | **PASS** — unit asserts parent end = `contentHeightPx`, last segment end = `{trunk.x, arm.y}`; UI asserts both on pages 1 and 3. |
| 4 | Every child arm enters left; no primary tree edge has `to-edge`/`from-edge` or a `p.N` label solely because it crosses a page. | **PASS** — unit/UI assert `entry: 'left'`, `direction: 'trunk'`, `targetPage: null`, no label; UI asserts zero page-edge label chips on all three pages. |
| 5 | Right-group siblings on different pages share the same right trunk; callout and wrapped-child groups share their own below trunk per parent. | **PASS** — page 1 child 1 and page 3 child 2 share `trunk-root:right`; R2f/R2g unit coverage keeps callout + wrapped child on one `root:below` trunk. |
| 6 | Nested trunks do not merge with the parent trunk or with each other. | **PASS** — root `right` and child 1 `below` have different ids, x, and page ranges; no nested segment exists on page 3. |
| 7 | Every below trunk starts with the same 8 px `trunkGap` at all levels. | **PASS** — unit asserts `start.y - parentBottom = EDGE_STYLE.trunkGap` for the R2f wrapped group and the nested R2g trunk; R2f UI asserts 8 px for both root callouts and the nested below trunk. |
| 8 | Page Read/Edit and the PDF print model consume the same group trunk/page segments. | **PASS** — UI read/edit route+trunk snapshot equality for all three pages; print-model test asserts `edges` and `trunks` deep-equal to `buildPageEdgeModel` for every page. |
| 9 | References retain page-edge indicators and dashes; R2d/R2f/R2e/R2b behavior remains. | **PASS** — R2a/R2d assert the reference `from-edge` chip and dashed style while tree edges use trunks; R2d 4/4, R2f 2/2, R2e 4/4, R2b 3/3, R2a 3/3 pass. |
| 10 | Gate: targeted tests + `npm run verify:fast` pass with real timings. | **PASS** — see timings above; `verify:fast` exit 0. |
| 11 | Report maps every acceptance criterion. | **PASS** — this table. |

## Open questions / risks

1. **Fixed trunk x cannot dodge cards.** The product model requires one x, and
   the layout indents children so trunks stay in gutters. The renderer draws
   trunks below the cards, and the existing per-edge R2d fallback still routes
   an arm around an obstacle when it can. A legacy `stacked` override can place
   a right-group trunk x behind a callout card on a later page; product presets
   (`beside`/compact) do not. Group-level obstacle routing would be a separate
   R2 follow-up.
2. **Split parent blocks.** A below port uses the true card bottom (last
   fragment); a right port uses the first fragment's right-edge center. This is
   correct for the tested short parents. A parent that spans pages and owns a
   below group on the last fragment page is covered by the code but not by a
   dedicated multi-page parent fixture.
3. **New edge direction value.** `PageEdgeDirection` now includes `'trunk'`.
   All in-repo consumers handle it; an external consumer with an exhaustive
   switch would need a case. Print model types alias the same union.
4. **Superseded R2a/R2d expectations.** Their cross-page tests previously
   asserted primary `to-edge`/`from-edge` chips. They now use compact packing,
   assert the below trunk/arm and the reference-only chip, and do not weaken the
   R2d style/obstacle checks (trunk arms are included).
5. **Visual r1b density.** The one-line condition now includes `trunk` arms in
   the crossing audit. The full R1b visual suite was not re-run (on-demand
   suite); the R2a visual suite was re-run and passes.
6. **Docs sweep.** `docs/design-tokens.md` now documents R2f/R2g target entry,
   group trunks, the 8 px below gap, and reference-only page indicators. Spec,
   UX, ADRs, `AGENTS.md`, plan, and the R2f report were not edited.

## Next suggested step

Orchestrator: run the one full `npm run verify` at integration and hand the R2g
screenshots plus this report to the product owner for the visual Page check.
M4c PDF remains blocked on that checkpoint; this change only updates the shared
edge data the print model consumes.
