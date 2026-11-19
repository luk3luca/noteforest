# Track 1 report — long inline formula card width (plan #12, v0.1.2)

**Branch:** `t3/long-inline-formula-card-width` (the harness branch; the brief's intended name is
`t3/v0.1.2-formula-width`).
**Base:** `3ad4017` (v0.1.2 brief on `main`).
**Commit:** the single Track 1 commit on this branch (SHA in the handoff message).
**Scope:** `docs/plan.md` #12 and Track 1 of `docs/batch/brief.md`. No merge, push, tag or PR; no
edit to the brief, `docs/plan.md`, `tests/ui/suites.mjs`, version files or the lockfile.

---

## 1. Summary

A rendered inline formula is now measured as an atomic box instead of being inferred from its LaTeX
source or from CSS `min-content`:

- The Page DOM port measures the widest `.nf-math-inline` on the max-content card (table cells are
  excluded). KaTeX 0.18 splits a formula into several breakable `katex-base` blocks, so plain
  min-content stopped at the widest base (42 px in the probe) while the rendered formula was 795 px;
  that is why the card stayed at `maxContentWidth` and the formula wrapped.
- `BlockMeasurement` gains one additive field, `inlineFormulaWidth` (widest rendered inline formula,
  0 when none). The measured `minContentWidth` includes it, so width fit/defect decisions treat the
  formula as unbreakable everywhere the layout already used the atomic minimum.
- `resolveBlockBox` grows the card to the **available Page content width** when
  `inlineFormulaWidth > maxContentWidth`; a fitting formula keeps the existing card width, and a
  formula wider than that content box keeps the existing `content-too-wide` defect. No new overflow
  mode, no display-formula change, no gap or corridor change.
- The DOM-free estimator now estimates the **rendered glyph count** of an inline formula instead of
  `latex.length × charWidth` (spacing/style commands are zero width, named commands and their
  arguments are counted), so the layout tests exercise a content-driven formula width.

The observable defect was reproduced in Chromium before the fix (A4 landscape, compact theme): the
30-term formula renders 794.6 px wide, the card stayed at 420 px + chrome, and the formula laid out
on two visual lines. After the fix the same card is the full 1,031.8 px page content box and the
formula stays on one line; a 40-term formula (1,086 px) is wider than the page and reports
`content-too-wide`.

## 2. Files changed

Product code:

- `packages/layout/src/types.ts` — additive `BlockMeasurement.inlineFormulaWidth` and the
  `minContentWidth` note that an atomic inline formula is included.
- `packages/layout/src/estimate.ts` — rendered-width inline-formula estimate, widest formula per
  block (tables excluded), and both intrinsic widths updated; `inlineFormulaWidth` on the
  measurement.
- `packages/layout/src/layout.ts` — `resolveBlockBox` grows the card to the available content width
  for a formula above the readable measure; the unbreakable/defect paths are unchanged.
- `apps/desktop/src/renderer/src/page/measurement.ts` — `widestInlineFormulaWidth()` on the
  max-content intrinsic card; it raises the block minimum and is published on both max/min-content
  and fixed measurements.

Tests:

- `packages/layout/test/page-inline-formula.test.ts` (new) — long formula grows to the page width,
  a DOM-shaped stub with under-reported min-content grows from the formula width alone, a fitting
  formula keeps the card and page count, a formula wider than the page reports `content-too-wide`,
  and a table-cell formula never widens the card.
- `apps/desktop/test/print-parity.test.ts` — new plan #12 case: the estimator-built Page model and
  the print model share the full-width card, the one-fragment box and the page count. The pipeline
  helper now accepts a measurement port; stubs report `inlineFormulaWidth`.
- `packages/pdf/test/print-model.test.ts` — stub reports `inlineFormulaWidth` (default 0).
- `packages/layout/test/{anchor-view,group-wrap,page-callout-modes,page-compaction,page-gap,page-packing,page-subtree-wrap}.test.ts`
  — stubs report `inlineFormulaWidth: 0`; assertions unchanged.
- `tests/ui/m4c1-print-compositor.test.mjs` — the existing last case is extended (one case) to add
  a long inline formula block next to the table: Page Read card width and one-line formula, Page
  Edit overlay width and one-line formula, print parity for the same page, and the PDF page count
  and text layer. The table-cell asserts and the table layout are unchanged.

No CSS, gap, corridor, paginator, table, display-formula (`mathBlock`) or `docs/plan.md` change.

## 3. Checks

| Check | Result | Time |
|---|---|---|
| `npx vitest run packages/layout/test/page-inline-formula.test.ts` | green — 5/5 | 0.10 s |
| `npx vitest run packages/layout packages/pdf apps/desktop/test/print-parity.test.ts` | green — 25 files / 263 tests (print-parity 30/30 on its own run) | 0.79 s |
| `npm test` (full unit suite) | green — 184 files / 1,915 tests | 9.12 s |
| `npm run typecheck` (all workspaces) | green | 5.71 s |
| `npm run check:boundaries` | green — 306 files, 1,495 imports, 16 rules | 0.43 s |

Not run by the builder, per the brief: `npm run verify:fast`, e2e, and any Electron UI suite. The
Page Read/Edit/PDF render proof is in the extended `m4c1` case and is pending the orchestrator's
single serialized UI lane.

## 4. T1 acceptance

| Criterion | Result | Evidence |
|---|---|---|
| A rendered inline formula wider than the card grows the card to the Page content width in Page Read | **PASS (unit policy)**; real render pending the UI lane | `page-inline-formula` case 1 and the DOM-shaped stub case; `print-parity` plan #12 case asserts `width = geometry.contentWidthPx`; `m4c1` asserts fragment width = `[data-page-content]` width |
| Same in Page Edit | **PENDING (UI lane)** | `m4c1` opens the overlay on the block (edit interaction mode, double-click) and asserts overlay width = fragment width and a one-line formula; Page Edit derives its box from the same fragment (`PageBlockEditor` width = `fragment.page.width`), so the model cannot drift |
| Same in PDF | **PASS (print model)**; real PDF pending the UI lane | `print-parity` asserts the `PrintBlock` measurement and the one-fragment box; `m4c1` asserts print parity for the page and the exported PDF page count/text |
| The formula is never wrapped, clipped or shrunk | **PASS (policy + DOM probe)**; one-line assert pending the UI lane | Card content ≥ rendered formula while it fits the page; `m4c1` asserts every `.katex-base` shares one top in Page Read, Page Edit and the print host (a wrapped formula has several) |
| A fitting formula keeps the current card width and text flow | **PASS** | `page-inline-formula` "keeps the standard card"; exact card width equals the text-only block and stays at the 420 px measure |
| A formula wider than the page reports the existing defect | **PASS** | `page-inline-formula` case 4: the card stops at the page, the defect is `content-too-wide`, `blocksExport: true`, and its message carries the measured formula width |
| Default page counts unchanged | **PASS** | Full unit suite green (fixtures and exact page-count asserts unchanged); the fitting formula keeps the text-only page count; the DOM min change only raises blocks with an inline formula and never the normal card branch |
| The 18/32/16 Page gaps and the horizontal corridor do not move | **PASS** | No gap/corridor constant or CSS touched; `page-gap`, `r?` gap and callout suites green |
| No table layout change | **PASS** | Table-cell formulas are excluded from `inlineFormulaWidth`; table tests and the `m4c1` table asserts unchanged |
| No display-formula change | **PASS** | `mathBlock` estimates and `content-too-wide` path untouched |

## 5. Evidence

- Unit: `packages/layout/test/page-inline-formula.test.ts` (five cases, including the DOM-shaped
  under-reported min-content regression), `apps/desktop/test/print-parity.test.ts`
  ("plan #12 long inline formula"), `packages/pdf/test/print-model.test.ts`.
- UI case: `tests/ui/m4c1-print-compositor.test.mjs`, last case. On the green UI lane it writes
  `artifacts/m4c1/ui/print-table-cell-page-1440x900.png`,
  `artifacts/m4c1/ui/print-table-cell-print-1440x900.png` and
  `artifacts/m4c1/ui/print-table-cell.pdf` (the Page Read and print screenshots include the long
  formula card; the screenshot path names are the pre-existing ones).
- DOM probe (throwaway, not committed): Chromium at compact 9 pt measured the 30-term formula at
  794.6 px on a max-content card, 42.4 px at CSS min-content, two base lines in a 420 px card; the
  40-term formula at 1,086.3 px versus a 1,031.8 px page content box.

## 6. Risks and open questions

- **Additive measurement field.** `BlockMeasurement.inlineFormulaWidth` is required, so every
  measurement port must report it (the estimator and the DOM port do; test stubs report 0). It adds
  no paginator, geometry, schema or settings field. The orchestrator may want the Sentinel to check
  whether this counts as a "layout-model change" for ADR purposes; the brief listed the layout files
  as the work area, so no ADR was written.
- **Narrow lanes.** A formula wider than a side column now raises the block minimum, so the existing
  fit tests move the group below instead of placing it in a lane where the formula would wrap. That
  is the intended "never wrap" behavior but it can change Page topology for a formula-bearing child
  in a narrow lane. Existing unit fixtures and page counts are unchanged; the UI lane is the real
  check.
- **Estimator calibration.** The estimate counts rendered symbols; KaTeX adds binary-operator
  spacing, so a 30-term sum is estimated at 560 px and measured at 795 px (compact). The estimator is
  only the DOM-free test oracle; tests assert the premise (width vs the 420/643 px bounds), not the
  exact pixel value.
- **UI lane.** This branch could not pick a formula that is long for the DOM yet short for the
  estimator; the `m4c1` case uses the DOM bounds (read `--nf-page-max-card-width`), so it does not
  depend on the estimator.
- **Page Edit width** is inherited from the fragment, not re-measured; the UI case asserts it
  explicitly. If Page Edit ever gets its own measurement, that assertion will catch a drift.

## 7. Next step

The orchestrator merges after T3 and T2 (T1 is last), then runs the single serialized UI lane (which
exercises the extended `m4c1` case and writes the screenshots/PDF) and one full `verify`; the
product owner checks the screenshots and the PDF. The branch worktree can be removed with the merge.
