# R2h — Attached Page trunks and nested left inset

**Role:** Orchestrator (direct fix, explicitly requested by the product owner)  
**Base:** `95236aa` on `wip/page-edge-topology-base`  
**Date:** 8 November 2026

## Summary

Two visual corrections to the R2g group trunks:

- The below trunk now starts **attached** to the parent card bottom. `trunkGap`
  is 0 in Page and Continuous; the trunk no longer has a vertical padding gap.
- Wrapped Page child groups now indent at least **26 px** from their parent
  (`trunkInset` 12 + `stemMin` 12 + 2). Nested below trunks therefore keep the
  same 12 px left inset as the top level, with a 12 px final left stem, instead
  of collapsing to the card's left border.
- The `PageTheme.wrapIndent` value remains available for normal wrapping, but
  `wrapOriginX` enforces the 26 px floor for Page below groups; custom themes
  still respect `maxWrapIndent`.
- The Page trunk starts at the port/card bottom; the R2g cross-page segments,
  independent nested trunks, left entries, and reference page chips are
  unchanged.

## Files changed

- `packages/layout/src/edge-style.ts` — `trunkGap` 8 → 0, attached comment.
- `packages/layout/src/layout.ts` — wrapped Page child indent floor (26 px).
- `packages/layout/src/page-edges.ts` — attached below-trunk start; comments.
- `docs/design-tokens.md` — attached trunk, 26 px wrapped-child floor.
- Tests: `packages/layout/test/group-wrap.test.ts`,
  `packages/layout/test/layout.test.ts`, `packages/layout/test/page-packing.test.ts`,
  `packages/layout/test/page-edges.test.ts`,
  `apps/desktop/test/design-tokens-css.test.ts`,
  `apps/desktop/test/geometry.test.ts`, `apps/desktop/test/edge-routing.test.ts`,
  `tests/ui/m3-anchor-callout-layout.test.mjs`,
  `tests/ui/r2f-page-edge-topology.test.mjs`,
  `tests/ui/r2g-page-trunk-continuity.test.mjs`.
- `docs/reports/r2g-page-trunk-continuity.md` — post-R2h note.

## Checks

- `npm test` — 86 files / **855 tests pass**, 2.26 s.
- Targeted R2g/R2f/R2e/R2d/R2b/R2a UI — **18/18 pass**.
- Full `npm run verify` — exit 0; **855 unit**, **29 UI suites / 90 tests**,
  **16 e2e**, **14 recovery**, **0 pageErrors**.

## Acceptance

- [x] Below trunks start attached to the card bottom in Page and Continuous.
- [x] Nested Page below trunks keep the 12 px left inset; wrapped children
      indent at least 26 px.
- [x] Top-level and nested trunk behavior is consistent; no layout geometry
      other than the requested indentation floor.
- [x] Cross-page group trunks, nested independence, left entries, and
      reference-only page chips remain.
- [x] Full verify green.

## Risks

- The 26 px floor applies to Page wrapped groups; it can slightly change wrapped
  row positions and page packing. The R2g/Page tree fixtures pass, but the
  product-owner visual checkpoint still decides whether the extra indentation is
  acceptable on real notes.
- `trunkGap` is now 0 globally; historical M3 reports that mention 8 px describe
  the prior behavior.

## Next

Product-owner Page checkpoint on the WIP branch; then merge to `main` if
accepted. M4c remains blocked until that checkpoint.
