# R2j — Page callout modes A + B2

**Role:** Builder / Implementer  
**Worktree:** `a builder worktree`  
**Branch:** `t3/page-callout-modes-a-b2`  
**Base:** `97127cf` (`main`, after R2i)  
**Implementation commit:** `8b7132c0f56daa6f6df84f56b34f03bd3695fd65`  
**Report commit:** this docs commit; final head SHA in the handback  
**Date:** 9 November 2026

## Summary

Page Read/Edit and the PDF print model now choose one callout mode **per
parent** from the placed parent card and the resolved Page right limit:

- **A** — anchored callouts move to the parent card's right lane
  (`calloutRightGap` 24; the lane must be at least `calloutModeMinWidth` 240).
  The callout leader exits the parent's right side. The direct-child group is
  re-origined **below** the parent at `childIndent` 26, after the whole callout
  stack, and keeps its own below trunk.
- **B2** — when the right lane does not fit, callouts go first below the parent
  on the inner/right trunk (`calloutTrunkInset` 24, card `calloutCardIndent` 38)
  and direct children go lower on the outer/left trunk (`childTrunkInset` 12,
  card `childIndent` 26). Both groups are independent and own stable
  `(parent, below, group)` trunks across pages.
- **Stacked fallback** — when neither A nor B2 fits, callouts stay first below
  the parent at their anchor x and children follow below on the one shared
  below trunk. B1 is not implemented. R2j1 reserves the below trunk's 12 px
  left stem when a nearly full-width child group would otherwise shift onto the
  trunk, so the child keeps a visible incoming arrow.

The mode is deterministic and pure: it uses `LayoutOptions`/`PageTheme` values
and the resolved page width only. It never reads a viewport, zoom, or window
size.

`pageLayoutOptions` enables the modes for the `beside` tree packing (the compact
product default). The explicit legacy `stacked` Page packing keeps the
historical below-callout geometry, and `compaction` remains the lab oracle.
Continuous is untouched: `DEFAULT_LAYOUT_OPTIONS.calloutModes` is false and
Continuous never reads the new Page tokens.

### Contract additions

- New Page-only `PageTheme`/`LayoutOptions` tokens: `childTrunkInset` 12,
  `calloutTrunkInset` 24, `calloutCardIndent` 38, `calloutRightGap` 24,
  `calloutModeMinWidth` 240, and the `calloutModes` switch. Custom/normalized
  theme values clamp; the card indent never sits left of its trunk.
- `LayoutBlock.trunkGroup` (`callout`/`child`) + `trunkInset` describe a B2 group
  split. Continuous and stacked groups leave both absent.
- `PageEdgeTrunk.trunkGroup` is exposed by the shared page-edge model; trunk ids
  stay `parent:placement` for shared groups and become
  `parent:placement:group` for B2. Page/PDF consume the same records.
- `PageEdges` exposes `data-page-trunk-group` and
  `data-page-edge-trunk-group` for Read/Edit/print parity checks. No UI chip,
  label, or mode indicator was added.

## Files changed

- `packages/layout/src/layout.ts` — per-parent A/B2/stacked plan, A right lane,
  B2 two-trunk placement, child-origin re-check, B2 group/inset context.
- `packages/layout/src/types.ts` — Page-only options, `LayoutBlock.trunkGroup` /
  `trunkInset`, defaults.
- `packages/layout/src/page-settings.ts` — PageTheme tokens, defaults for both
  presets, custom parsing/clamping, `pageLayoutOptions`, CSS variables.
- `packages/layout/src/page-edges.ts` — B2 group keying (`parent:placement:group`),
  per-group below trunk inset, `PageEdgeTrunk.trunkGroup`.
- `apps/desktop/src/renderer/src/styles.css` — Page token fallbacks.
- `apps/desktop/src/renderer/src/page/PageEdges.tsx` — group/inset data attrs.
- `packages/layout/test/page-callout-modes.test.ts` — new R2j suite (A, B2,
  stacked, nested, per-page trunks, determinism, print-model input, theme
  overrides).
- `packages/layout/test/r2j-lab.test.ts` — DOM-free page count/whitespace lab;
  writes `artifacts/r2j/lab.json` (or `R2J_OUT`).
- `packages/layout/test/page-edges.test.ts` — R2f/R2j topology, B2 two trunks,
  cross-page B2 fixtures.
- `packages/layout/test/page-settings.test.ts` — new token defaults, ranges,
  custom normalization, CSS variables, `pageLayoutOptions`.
- `packages/layout/test/page-subtree-wrap.test.ts` — note that its callout cases
  are the isolated non-mode beside oracle.
- `packages/pdf/test/print-model.test.ts` — B2 groups consumed through the same
  page-edge model.
- `apps/desktop/test/page-edge-parity.test.ts` — Page A callout/child parity
  with Continuous placement names.
- `tests/support/page-fixtures.mjs` — `pageCalloutModesDocument`.
- `tests/ui/r2j-page-callout-modes.test.mjs` — new A/B2/stacked/page-break/
  Read/Edit/viewport suite.
- `tests/ui/r2a-page-arrows-cleanup.test.mjs` — A same-page arrows; cross-page
  fixture now forces B2 and asserts both trunks.
- `tests/ui/r2b-page-packing.test.mjs` — A at 1440/960/portrait, B2 on A5
  portrait, explicit stacked override retained.
- `tests/ui/r2d-page-edge-style.test.mjs` — cross-page B2 trunk arms and the
  reference-only chip.
- `tests/ui/r2e-page-tree.test.mjs` — A callout lane plus child group below.
- `tests/ui/r2f-page-edge-topology.test.mjs` — A right trunk and separate below
  trunk, nested right trunk.
- `tests/ui/r2i-page-subtree-wrap.test.mjs` — callout case updated to R2j A.
- `package.json` — R2j UI suite in `test:ui` and `verify`.
- `docs/design-tokens.md` — Page token rows and the A/B2/stacked rule.
- `docs/reports/r2j-page-callout-modes.md` — this report.

## Checks run, with real timings

- Targeted unit:
  `npx vitest run packages/layout/test/page-callout-modes.test.ts packages/layout/test/page-edges.test.ts packages/layout/test/page-settings.test.ts packages/layout/test/r2j-lab.test.ts packages/pdf/test/print-model.test.ts`
  — **5 files / 39 tests pass**, vitest **112 ms**.
- Full layout package: `npx vitest run packages/layout/test`
  — **13 files / 118 tests pass**, **295 ms**.
- Full unit suite: `npm test` — **90 files / 879 tests pass**, **2.47 s**
  (timed `verify:fast` run).
- `npm run verify:fast` — **exit 0**, **real 53.21 s** wall:
  - boundaries **147 files / 704 imports / 16 rules**, no violation;
  - typecheck all workspaces, clean;
  - unit **879 tests**, **2.47 s**;
  - critical e2e **16/16 pass**, **43.88 s**, no page errors.
- Full UI suite `npm run test:ui` — **31 suites / 101 tests pass**, no failures.
  R2j suite: **5/5 pass**, **3.18 s** suite / **11.35 s** wall.
- Lab: `npx vitest run packages/layout/test/r2j-lab.test.ts` — **103 ms**;
  evidence at `artifacts/r2j/lab.json`.

No fixed sleeps were added. The only waits are explicit page-ready/current-page
predicates and two `requestAnimationFrame` ticks after a window resize. No
native dialogs.

## Page count / whitespace

Lab (DOM-free estimator, product compact/beside). “Before” is the same Page
theme with `calloutModes: false`, i.e. the pre-R2j beside/stacked callout
geometry. Whitespace is `1 − block area / band area`.

| Fixture | Pages before → after | Whitespace before → after | Layout height before → after | Result |
|---|---:|---:|---:|---|
| A, multiple callouts | 1 → 1 | 65.00% → **57.03%** | 559.2 → **455.8** | callouts right, children below |
| B2, no right lane | 2 → **1** | 55.31% → **33.79%** | 936.0 → **650.3** | 1 blocking defect → **0** |
| Stacked fallback | 2 → 2 | 16.98% → 16.98% | 466.2 → 466.2 | one shared below trunk; stem reserve (R2j1) |
| `scale-300.json` | 39 → 39 | 51.22% → **50.44%** | 25016.1 → **24901.7** | 12 callouts move right |
| `wide-fan.json` | 2 → 2 | 71.22% → 71.22% | unchanged | no callouts |
| `deep-chain.json` | 3 → 3 | 58.01% → 59.25% | 1738.5 → **1623.1** | one callout right, one below |
| `showcase` (83 blocks) | 26 → **25** | 57.86% → **55.83%** | 14417.8 → **13783.3** | below callouts 17 → 5 |

UI evidence (real DOM measurement, current page; sparse one-page fixtures have a
high absolute whitespace ratio):

| Evidence | Pages | Whitespace | Key geometry |
|---|---:|---:|---|
| `page-callout-modes-a.json` | 1 | 83.94% | root 0,0; callouts 462,0 / 462,64; child 26,132; nested callout 377,132; grandchild 52,200 |
| `page-callout-modes-b2.json` | 1 | 64.65% | callouts 38,95 / 38,159; child 26,227; nested callout 64,291; grandchild 52,359 |
| `page-callout-modes-stacked.json` | 2 | 30.76% | callouts 27.5/47.4 (anchor x); child 24,305, width 187.6, stem 12 (R2j1) |
| `page-callout-modes-pages.json` | 3 | page 1 84.86% | callout-a 38,95; parent trunks continue |

Screenshots:

- `artifacts/r2j/ui/callout-modes-a-1440x900.png`
- `artifacts/r2j/ui/callout-modes-b2-1440x900.png`
- `artifacts/r2j/ui/callout-modes-stacked-1440x900.png`
- `artifacts/r2j/ui/callout-modes-pages-1440x900.png`
- `artifacts/r2j/ui/callout-modes-edit-960x720.png`

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Mode A: callouts right of the parent, children below at the child indent, no collision, separate trunks. | **PASS** — unit `page-callout-modes` A cases; UI A asserts the right lane x, parent-top y, child indent, below-stack start, `root:right` + `root:below`, no overlap, no defect banner. |
| 2 | Mode B2: callouts first on the inner/right trunk (24/38), children lower on the outer/left trunk (12/26), no collision, separate trunks. | **PASS** — unit B2 cases assert both card columns, both trunk insets, callout-first order, arm stems; UI B2 asserts `root:below:callout`/`root:below:child` and the nested B2 groups. |
| 3 | Stacked fallback when neither A nor B2 fits; B1 not used. | **PASS** — unit/UI stacked cases show the anchor-aligned callout stack and one shared `root:below` trunk, zero B2 group attributes. |
| 4 | Mode choice is per parent, deterministic, and uses resolved Page width, not viewport/zoom. | **PASS** — unit repeats the layout and asserts no viewport/zoom input; UI keeps the same fragment and edge geometry/page count at 1440 and 960. The explicit legacy `stacked` packing is documented below. |
| 5 | Every callout/child arm enters left; no tree `p.N` chips. | **PASS** — unit/UI assert `entry: left`, no labels, `targetPage: null`; the reference-only `← p.1` chip is preserved in R2a/R2d. |
| 6 | Trunks continue across pages; nested trunks stay independent. | **PASS** — unit A/B2 multi-page cases and the UI three-page B2 fixture assert stable x, page segments, last-arm termination, no callout group after its last arm, and distinct nested ids/x. |
| 7 | Page Read/Edit/PDF print model share the same geometry. | **PASS** — UI Read/Edit fragment and edge snapshots are equal; unit `page-callout-modes` and `print-model` assert the print model aliases the same page-edge model/trunk records. |
| 8 | Page count/whitespace recorded; no overlap/overflow. | **PASS** — table above; unit/UI assert no overlap and inside-content; lab reports 0 `content-too-wide` / `layout-overflow` on all after cases. |
| 9 | Targeted tests and `npm run verify:fast` pass with real timings. | **PASS** — timings above; `verify:fast` exit 0, 53.21 s wall. |
| 10 | Report maps every criterion to pass/fail. | **PASS** — this table. |

## Open questions / risks

1. **`stacked` packing is an explicit legacy/lab path.** `pageLayoutOptions`
   enables A/B2 only for `beside`; the product-owner decision (9 November 2026)
   is that **Comfortable is density-only**, so it now also uses `beside`/A/B2.
   Explicit `stacked` remains available for the R2b/R2e oracles and legacy
   comparisons. A density preset must never change callout topology.
2. **Callout-only parents stay stacked.** A/B2 are callout-vs-direct-child
   group modes; a parent with anchored callouts and no direct children keeps the
   current below-anchor behavior. This avoids an unrelated visual change for
   callout-only notes and is covered by the single-child R2f/R2g fixtures.
3. **Ancestor subtree budget does not include the callout lane.** R2i
   `subtreeColumn` still budgets card + child columns; the callout lane is
   resolved inside the parent after placement. A parent can therefore stay in an
   ancestor's right column while its own mode A lane uses the page right limit.
   This preserves R2i topology and produced no overlap/overflow in the lab; a
   mode-aware ancestor budget would be a larger follow-up.
4. **Manual breaks before a mode A callout cannot be honored.** A callout now
   shares the parent's top y, so a break before it is not a safe page boundary
   (the same is true for any block at the parent y). B2/stacked callouts remain
   breakable below the parent. Manual breaks were not changed.
5. **Lab estimator vs DOM.** The before/after table uses the deterministic
   DOM-free estimator; the UI records real fragment geometry. The estimator
   reports `minContentWidth` = theme minimum for text, so very narrow pages are
   stricter than the DOM. The stacked lab case therefore uses a shallow fixture
   to keep the callout/child cards readable.
6. **PDF is a consumer, not re-laid out.** M4c PDF export/compositor work is out
   of scope; the print model test proves it consumes the same edge/trunk
   records. The full 50+ page PDF gate still belongs to M4c.
7. **Deep-chain whitespace** rises 58.01% → 59.25% while its layout height drops
   1738.5 → 1623.1 (one callout moves right, one stays below). This is a
   recorded trade-off, not a defect; no page-count change.
8. **No Settings UI.** The new tokens are resolvable/overridable through
   PageTheme, normalization, and CSS variables, but the Settings form remains
   P0/post-Page work.

## Next suggested step

Orchestrator: run the one full `npm run verify` at integration, review the five
R2j screenshots and the lab deltas with the product owner, then proceed to M4c
PDF once the Page checkpoint is accepted. No merge, push, or PR was performed
from this worktree.

## Integration

- Merged to `main` as `1e89bf0` (base `97127cf`).
- One full `npm run verify` on the integrated tree: **exit 0** — **90 test
  files / 879 tests**, **31 UI suites / 101 tests**, **16 critical e2e**,
  **14 recovery**, **0 pageErrors**.
- Page checkpoint evidence lives on `main` under `artifacts/r2j/`; the
  product-owner visual/Page check is the next gate before M4c PDF.
