# R2j1 — Stacked below-trunk stem reserve

**Role:** Orchestrator direct fix (product-owner authorized, small Page follow-up)  
**Base:** `main` after R2j (`f127e4f`)  
**Date:** 9 November 2026

## Summary

The stacked Page fallback could place a nearly full-width direct-child card at
the content left. The shared below trunk then sat exactly on the card's left
edge, so the horizontal arm had zero length and the child had no visible
incoming arrow. The card was still connected geometrically, but the connection
was unreadable.

R2j1 reserves the below trunk's left stem when the effective Page indent can
accommodate it:

- `trunkInset + stemMin` (12 + 12 = 24 px) is the minimum group origin;
- the direct-child cards are re-measured at the narrower available width;
- the below trunk stays at least 12 px left of the card edge and the arrowhead
  is visible;
- if an unbreakable card cannot fit at the stem origin, the old shift-to-fit is
  kept and the existing `content-too-wide` defect stays explicit instead of
  hiding an overflow.

The reserve is only applied when the effective indent
`min(maxWrapIndent, max(wrapIndent, childIndent))` is at least 24 px. The
legacy lab oracle with `maxWrapIndent` 12 keeps its documented geometry.

## Files changed

- `packages/layout/src/layout.ts` — `wrapOriginX` minimum stem origin; the
  caller probes every direct child with `fitsAtOffset` before reserving.
- `packages/layout/test/page-callout-modes.test.ts` — two new stacked cases:
  visible stem for a nearly full-width child, and the old shift for an
  unbreakable child.
- `tests/ui/r2j-page-callout-modes.test.mjs` — stacked UI assertions: child
  group keeps the 24 px stem origin and the child edge keeps a 12 px stem.
- `docs/reports/r2j-page-callout-modes.md` — stacked evidence updated.
- `docs/reports/r2j1-stacked-stem.md` — this report.

## Checks run, with real timings

- Targeted unit (5 files):
  `npx vitest run packages/layout/test/page-callout-modes.test.ts packages/layout/test/page-edges.test.ts packages/layout/test/page-settings.test.ts packages/layout/test/r2j-lab.test.ts packages/pdf/test/print-model.test.ts`
  — **5 files / 41 tests pass**, vitest **114 ms**.
- Full unit: `npm test` — **90 files / 881 tests pass**, **2.28 s**.
- Page UI suites: R2a/R2b/R2d/R2e/R2f/R2g/R2i/R2j — **8 suites / 29 tests
  pass**, **15.58 s**.
- Full `npm run verify` — **exit 0**:
  - **90 test files / 881 tests**;
  - **31 UI suites / 101 tests**;
  - **16 critical e2e**, **14 recovery**;
  - **0 pageErrors**, **0 `not ok`**.

## Acceptance

- [x] A nearly full-width stacked child group keeps a visible below-trunk stem
      and an incoming arrow.
- [x] The child card reflows narrower; no overlap, no overflow, no new defect.
- [x] Unbreakable content that cannot fit at the stem origin keeps the old
      shift and its explicit `content-too-wide` defect.
- [x] The legacy `maxWrapIndent` 12 lab oracle is unchanged.
- [x] Page Read/Edit/PDF share the same geometry; Continuous is unaffected
      (full verify green).
- [x] Full verify passes with real timings.

## Evidence

Stacked fixture, A5 portrait with 46 px margins, before → after (content-local):

| Property | Before | After |
|---|---:|---:|
| `cm-child` left | 0 | **24** |
| `cm-child` width | 211.648 | **187.648** |
| `cm-child` height | 67.586 | 67.586 |
| `cm-root:below` trunk x | 0 | **12** |
| Child stem (`to.x − trunk.x`) | 0 | **12** |
| Page count | 2 | 2 |
| Blocking defects | 0 | 0 |

Screenshot: `artifacts/r2j/ui/callout-modes-stacked-1440x900.png`  
Evidence JSON: `artifacts/r2j/page-callout-modes-stacked.json`

The new unit cases assert the same stem rule and the unbreakable fallback at the
layout/page-edge-model level.

## Open questions / risks

1. The reserve depends on the effective indent. A custom Page theme with
   `maxWrapIndent < 24` keeps the old zero-stem geometry; the default compact
   and comfortable themes use 26 px and are fixed.
2. Full-width unbreakable content (wide table/code/image) that cannot fit at
   24 px keeps the old shift and still reports `content-too-wide`; the stem may
   be invisible in that defect state. No new hidden overflow is introduced.
3. The narrower card can be taller on very narrow pages. In the stacked fixture
   the text stays at two lines and the page count stays 2; the lab and UI
   evidence record it.
4. Continuous shares `wrapOriginX` through the engine, but its effective indent
   and 3,120 px canvas do not hit the reserve; full verify is green.
5. No Settings UI exposes the reserved stem; the value is derived from the
   existing `trunkInset`/`stemMin` engine primitives and the Page indent.

## Next step

The Page checkpoint evidence is updated. Decide between the targeted Page/PDF
Sentinel and M4c PDF.
