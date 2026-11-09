# R2i — Page subtree-aware wrap

**Role:** Builder / Implementer  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-b1941714-94384814826713bc`  
**Branch:** `t3/r2i-page-subtree-wrap`  
**Base:** `693ae0e` (`main`, after the Page checkpoint and R2f/R2g/R2h)  
**Implementation commit:** `5e7230ec4be12b480848c6c79b2ef108f240a53f`  
**Report commit:** this docs commit; final head SHA in the handback  
**Date:** 9 November 2026

## Summary

Page now decides the direct-child right/below placement from the **whole primary
subtree**, not only the child card:

- `LayoutBuilder.subtreeColumn(block, available)` returns the card box, a
  preferred column width, and a strict recursive `fits` flag. A block contributes
  `card + siblingGap + widest child column` only when the whole child group fits
  to the right recursively; otherwise it contributes only its own card and the
  children would wrap below it. Results are cached by `(blockId, available)`.
- The production `group-left-origin` fit test now uses `subtreeFitsRight`. If any
  direct-child subtree fails at the parent's right column, **all** direct children
  move below the parent at the Page child indent. From that origin every child
  repeats the same rule recursively: its children try right first and wrap below
  only when they do not fit.
- The `right-first-per-child` and `subtree-aware` lab policies keep their old
  own-card oracles, and the legacy `compaction` policy is untouched.
- `childIndent` is a new PageTheme/LayoutOptions token (26 px for compact,
  comfortable, and custom) used by the wrapped-group origin. It replaces the old
  hardcoded 26 px trunk-stem budget; the effective indent is still capped by
  `maxWrapIndent` and floored by `wrapIndent`. Continuous reads none of this.
- Current callout behavior is preserved exactly: anchored callouts stay below the
  parent; in `beside` they keep the left lane while the direct-child group stays
  right; when the group wraps, the block uses the existing stacked callout order.
  A/B2 callout modes were not implemented.
- The paginator, Page Read/Edit, and the print model consume the resulting
  `LayoutBlock.placement`/`x`/`y` unchanged; the same layout feeds Page and PDF.

The new rule has one deliberate structural consequence: **if a child stays to
the right of its parent, its whole subtree stays to the right**. A grandchild can
only be below its parent when the parent itself is below the grandparent at the
new child indent. The R2f/R2g/R2b fixtures were updated to assert that topology,
and the R2i fixtures cover the three P→C1→G1 cases.

## Files changed

- `packages/layout/src/layout.ts` — recursive subtree budget/fit, cached;
  subtree-aware direct-child decision; `childIndent` wrap origin.
- `packages/layout/src/types.ts` — `LayoutOptions.childIndent` (default 26).
- `packages/layout/src/page-settings.ts` — `PageTheme.childIndent` in compact,
  comfortable, custom parsing, `pageLayoutOptions`, and the CSS variables.
- `apps/desktop/src/renderer/src/styles.css` — `--nf-page-child-indent` fallback.
- `packages/layout/test/page-subtree-wrap.test.ts` — new targeted unit suite
  (three P→C1→G1 shapes, atomic siblings, all-fit guard, callout lane, stacked
  fallback, pagination fragments).
- `packages/layout/test/group-wrap.test.ts` — taller-ancestor case follows the
  recursive wrap; oracle comparison retained.
- `packages/layout/test/page-packing.test.ts` — the former “wrapped descendant of
  the right group” case becomes the atomic subtree wrap it now is.
- `packages/layout/test/page-edges.test.ts` — R2f/R2g topology expectations for
  the new wrapped group and nested right trunk.
- `packages/layout/test/page-settings.test.ts` — `childIndent` defaults, mapping,
  and CSS variable.
- `packages/layout/test/r2i-lab.test.ts` — reproducible DOM-free page-count and
  whitespace lab; writes `artifacts/r2i/lab.json` (or `R2I_OUT`).
- `tests/support/page-fixtures.mjs` — four R2i Page fixtures and the R2g
  great-grandchild that keeps the nested trunk crossing a page.
- `tests/ui/r2i-page-subtree-wrap.test.mjs` — new UI suite: wrap, nested wrap,
  atomic siblings, callout lane, custom `childIndent`, Read/Edit parity,
  screenshots, and evidence JSON.
- `tests/ui/r2b-page-packing.test.mjs` — portrait now asserts the deterministic
  atomic wrap while the nested group stays beside its parent.
- `tests/ui/r2f-page-edge-topology.test.mjs` — wrapped group shares `root:below`
  with callouts; grandchild owns the nested `child1:right` trunk.
- `tests/ui/r2g-page-trunk-continuity.test.mjs` — root/nested below trunks across
  three pages.
- `package.json` — `test:ui` and `verify` include the R2i suite.
- `docs/design-tokens.md` — `childIndent` Page token row; `wrapIndent` row no
  longer claims the hardcoded 26 px rule.
- `docs/reports/r2b-page-packing.md`, `r2f-page-edge-topology.md`,
  `r2g-page-trunk-continuity.md` — short R2i follow-up notes; accepted contracts
  otherwise unchanged.
- `docs/reports/r2i-page-subtree-wrap.md` — this report.

## Checks run, with real timings

- Targeted unit:
  `npx vitest run packages/layout/test/group-wrap.test.ts packages/layout/test/layout.test.ts packages/layout/test/page-packing.test.ts packages/layout/test/page-edges.test.ts packages/layout/test/page-settings.test.ts packages/layout/test/page-subtree-wrap.test.ts`
  — **6 files / 58 tests pass**, vitest **150 ms**.
- Full layout package: `npx vitest run packages/layout/test`
  — **11 files / 103 tests pass**, **262 ms**.
- Full unit suite: `npm test` — **88 files / 863 tests pass**, **2.20 s**.
- `npm run verify:fast` — **exit 0**, **52.30 s** wall (includes boundary check,
  typecheck, 863 unit tests, and critical e2e). Critical e2e: **16/16 pass**,
  **44.12 s**, no page errors.
- New UI suite: `node --test tests/ui/r2i-page-subtree-wrap.test.mjs`
  — **6/6 pass**, suite **2.95 s**, wall **11.10 s**.
- Existing Page suites re-run (all pass):
  R2e 4/4 (11.70 s wall), R2b 3/3 (10.58 s), R2f 2/2 (9.10 s), R2g 2/2 (9.56 s),
  R2d 4/4 (11.33 s), R2a 3/3 (12.36 s), R1b 4/4 (11.24 s),
  M4b1 9/9 (14.72 s), M4b1a2 2/2 (12.59 s), M4b1b1 8/8 (15.38 s).
- Lab: `R2I_OUT=artifacts/r2i/lab-after.json npx vitest run packages/layout/test/r2i-lab.test.ts`
  — **85 ms**; the `before` run used the same lab on stashed base `693ae0e`.

Evidence (ignored artifacts):

- `artifacts/r2i/lab-before.json`, `artifacts/r2i/lab-after.json`
- `artifacts/r2i/page-subtree-wrap.json` (UI, page count + whitespace + boxes)
- `artifacts/r2i/page-subtree-wrap-nested.json`
- `artifacts/r2i/page-subtree-wrap-siblings.json`
- `artifacts/r2i/page-subtree-wrap-callout.json`
- `artifacts/r2i/page-subtree-wrap-indent.json`
- `artifacts/r2i/ui/page-subtree-wrap-1440x900.png`
- `artifacts/r2i/ui/page-subtree-wrap-nested-1440x900.png`
- `artifacts/r2i/ui/page-subtree-wrap-siblings-1440x900.png`
- `artifacts/r2i/ui/page-subtree-wrap-callout-1440x900.png`
- `artifacts/r2i/ui/page-subtree-wrap-edit-1440x900.png`

No fixed sleeps and no native dialogs in the new suite.

## Page count / whitespace before → after

Page product defaults (A4 landscape, 12 mm margins, compact/beside), DOM-free
estimator. Whitespace is `1 − block area / band area`; lower is better. “Before”
is base `693ae0e` with the same fixtures.

| Fixture | Pages | Whitespace | Layout height (px) | Wrapped placement |
|---|---:|---:|---:|---|
| R2i P→C1→G1 | 1 → 1 | 54.10% → **45.09%** | 247.4 → **206.8** | grandchild at x=228 → child at x=26, grandchild right |
| R2i nested | 1 → 1 | 56.85% → **51.68%** | 379.1 → **338.5** | grandchild/great at 228/254 → child 26, grandchild 52, great right |
| R2i siblings | 1 → 1 | 62.45% → **57.34%** | 338.5 → **297.9** | grandchild at 228, leaf right → both children at 26 |
| `scale-300.json` | 39 → 39 | 51.22% → 51.22% | unchanged | no wrapped groups |
| `wide-fan.json` | 2 → 2 | 71.22% → 71.22% | unchanged | one late child at 474 → whole group at 26 (height-neutral) |
| `deep-chain.json` | 3 → 3 | 85.68% → **58.01%** | 1901.9 → **1738.5** | 1 blocking `content-too-wide` → **0 defects** |
| `showcase` (83 blocks) | 26 → 26 | 58.20% → **57.86%** | 14457.1 → **14417.8** | wrapped groups 9 → 7; max right edge 1031.8 → 960 |

UI evidence for the four new fixtures: each is **1 page**; whitespace ratios are
90.56% (P→C1→G1), 86.48% (nested), 88.14% (siblings), 88.03% (callout), and
90.56% (custom indent). These are sparse one-page fixtures on a full A4
landscape sheet, so the absolute ratio is high; the geometry assertions and the
lab delta are the meaningful evidence.

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | P→C1→G1: when the full subtree does not fit right, C1 is below P at `childIndent`, and G1 remains right of C1 if it fits. | **PASS** — unit `page-subtree-wrap` asserts child x=26 and grandchild one sibling gap right; UI asserts the same with DOM measurement; lab records the before/after delta. |
| 2 | If C1+G1 still does not fit at the new origin, G1 wraps below C1. | **PASS** — nested unit asserts child 26 → grandchild 52 → great right; nested UI asserts the same. |
| 3 | Sibling group is atomic: one failing subtree moves all direct children below; no split row. | **PASS** — unit and UI siblings fixtures assert child and leaf share one x; the lab shows the old split (grandchild 228 + leaf right) is gone. |
| 4 | Recursion works at every level; no overlap, no horizontal overflow. | **PASS** — recursive unit + nested UI; every UI fixture asserts no overlap and inside-content; lab reports 0 `layout-overflow` and 0 `content-too-wide` on all R2i cases. |
| 5 | Callout lane width is respected and current callout placement unchanged. | **PASS** — beside unit asserts callout right edge ≤ parent right and the group starts after it; stacked unit and UI assert callouts below the parent, group below the callout stack. No A/B2 change. |
| 6 | Page Read/Edit/PDF fragments reflect the new placement; page count and whitespace measured. | **PASS** — paginator unit asserts fragment `page.x = source.x`; UI asserts Read/Edit fragment geometry equality; page count/whitespace recorded above. PDF consumes the same `PaginatedDocument`/page-edge model; no M4c PDF export was run (out of scope). |
| 7 | `childIndent` is a PageTheme token used by the wrap origin; Continuous untouched. | **PASS** — settings unit covers defaults/presets/custom/CSS variable; UI override to 40 px moves the origin; no Continuous source/token/canvas change; R2e/R2b/R1b Continuous assertions stay green. |
| 8 | Targeted layout/UI tests and `npm run verify:fast` pass with real timings. | **PASS** — timings above; `verify:fast` exit 0. |
| 9 | Report maps every criterion to pass/fail. | **PASS** — this table. |

## Open questions / risks

1. **Accepted topologies changed.** R2f’s “grandchild below a child that stays
   right” and R2g’s “root right trunk” cannot exist under the atomic rule. Their
   fixtures/assertions now cover the wrapped group plus nested right/nested below
   trunks. This is the intended R2i behavior, but it needs the product-owner
   visual Page check.
2. **R2f stem allowance.** A callout card can start at the content edge after a
   group wrap; the router then uses the real available stem (<12 px). The R2f
   helper now allows that only when the card starts within `stemMin` of the
   content left. Entry stays left, the final arm stays horizontal, and no other
   edge is relaxed.
3. **Estimator vs DOM.** The before/after lab uses the deterministic DOM-free
   estimator; the UI evidence covers the four R2i fixtures with real measurement.
   The showcase page count is 26 in the estimator before and after; a real DOM run
   should confirm it during the orchestrator’s full verify.
4. **PDF is a consumer, not re-laid out.** The print model uses the same
   fragments/page-edge model; M4c PDF export/compositor work remains out of scope
   and must be re-run after integration.
5. **No Settings UI.** `childIndent` is resolvable/overridable through the
   PageTheme path, but the Settings form and the full token docs split remain P0 /
   the post-Page roadmap.
6. **Callout right lane (R2j).** If mode A later changes the child origin, the
   subtree fit has to run again after the lane decision. The current order is
   parent → subtree wrap → callout lane, matching the design plan.

## Next suggested step

Orchestrator: run one full `npm run verify` at integration, review the R2i
screenshots and the lab deltas with the product owner, then proceed to R2j
(callout modes A/B2) or M4c PDF once the Page checkpoint is accepted.
