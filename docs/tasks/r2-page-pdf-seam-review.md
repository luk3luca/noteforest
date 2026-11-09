# Targeted Sentinel — Page/PDF seam after R2i/R2j/R2j1

**Role:** Reviewer / Sentinel (independent judgment; no product-code edits)  
**Milestone:** Page layout closure → M4c PDF readiness  
**Base:** `main` at the R2j1 fix (`39ec17e` plus this brief commit)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 4 hours

## Why this review

Page layout is now at its intended shape: R2i subtree-aware wrap, R2j
callout modes A/B2/stacked, and R2j1 stacked stem reserve are merged and the
full verify is green (881 unit, 31 UI suites/101 tests, 16 e2e, 14 recovery,
0 pageErrors).

M4c PDF will consume the same `DerivedPage` fragments and `PageEdgeModel` as
Page Read/Edit. Before building the print compositor, verify that the Page
layout/edge/token contract is sound and that the PDF seam is ready. This is a
**targeted Page/PDF seam review**, not the later full-codebase Sentinel and not
an implementation task.

## Scope to review

Read the R2i, R2j, and R2j1 reports and diffs, then judge the current tree:

- `docs/reports/r2i-page-subtree-wrap.md`
- `docs/reports/r2j-page-callout-modes.md`
- `docs/reports/r2j1-stacked-stem.md`
- `docs/tasks/page-wrap-callouts-plan.md`
- `docs/tasks/m4c-pdf-plan.md`
- `docs/tasks/post-page-roadmap.md`
- `packages/layout/src/layout.ts`
- `packages/layout/src/page-edges.ts`
- `packages/layout/src/page-settings.ts`
- `packages/layout/src/types.ts`
- `packages/pdf/src/printModel.ts` and `packages/pdf/test/print-model.test.ts`
- `apps/desktop/src/renderer/src/page/PageEdges.tsx` and the Page page-view
  consumers
- New tests: `packages/layout/test/page-callout-modes.test.ts`,
  `page-subtree-wrap.test.ts`, `page-edges.test.ts`, `r2j-lab.test.ts`,
  `tests/ui/r2j-page-callout-modes.test.mjs`, `r2i`/`r2f`/`r2g`/`r2b` suites.
- `docs/design-tokens.md` Page section.

You may read any other file needed for evidence. Do not modify product code,
tests, spec, UX, ADR, or plan.

## Questions to answer

1. **R2i placement correctness.** Is the whole-subtree fit + atomic direct-child
   wrap correct and deterministic? Any overlap, overflow, or placement case
   not covered by the tests (multiple siblings, nested recursion, page breaks,
   callout lane interactions)?
2. **R2j modes.** Are A, B2, and stacked selected from the resolved Page width
   only? Are the two B2 trunks independent, left-entry, cross-page stable, and
   nested-independent? Is the explicit `stacked` legacy path clearly bounded?
   Any oscillating or page-count-unstable choice?
3. **R2j1 stem reserve.** Does it correctly preserve a visible below stem when
   the child cards can reflow? Does the unbreakable fallback hide a defect or
   create an overflow? Does the effective-indent guard keep the legacy
   `maxWrapIndent` oracle intact? Any Continuous regression risk through the
   shared engine?
4. **Edge/trunk model.** Does `PageEdgeTrunk`/`PageEdge` carry everything the
   print compositor needs (semantic placement, group discriminator, stable x,
   page segments, ports, left entry, arrow direction) without a second router?
   Any mismatch between Page Read/Edit DOM and `buildPageEdgeModel`?
5. **Token ownership.** Are all Page values in `PageTheme`/`LayoutOptions`
   Page-only fields, with Continuous tokens untouched? Any hardcoded Page pixel
   or magic number that should be a token? Any cross-import of design values?
6. **PDF seam readiness.** Can M4c1 consume the derived pages and the shared
   edge/trunk model as-is? What is missing or risky before the print
   compositor (fonts/metrics, print skin, page geometry, cross-page trunks,
   markers, A5/Letter, raster parity)? Distinguish required M4c1 work from
   pre-existing Spike 1 gaps.
7. **Tests and evidence.** Do the new tests guard the behavior rather than
   restate it? Any weakened assertion, fixed sleep, hidden viewport dependency,
   or missing negative case? Are the lab and UI page-count/whitespace numbers
   trustworthy? Is the DOM-free estimator limitation acceptable?
8. **Known risks.** Check the R2j report's open questions (explicit stacked
   preset, callout-only parents, ancestor subtree budget excluding the callout
   lane, manual break before a mode-A callout, estimator vs DOM). Decide which
   are acceptable for M4c1 and which need a fix first.

## Output

Write `docs/reviews/r2-page-pdf-seam-review.md`:

- Verdict: **accept**, **accept with findings**, or **changes requested**.
- Severity-ranked findings (S1 blocking before M4c1, S2 should fix soon, S3
  follow-up), each with `file:line`, evidence, and the smallest safe fix.
- Answers to the eight questions, with evidence.
- A short recommendation for M4c1: what is ready, what must be added, and what
  can wait for the full-codebase Sentinel.
- Any updated checklist/DoD line if the review reveals a reusable rule
  (allowed by the Sentinel role).

No code, test, spec, UX, ADR, or plan changes. No merge, push, or PR.

## Checks

- Targeted unit/UI commands are allowed for evidence; the Orchestrator already
  ran the full verify at `39ec17e`.
- Do not run the full `npm run verify` again.
- No fixed sleeps, no native dialogs, no screen recordings.
- If the baseline is inconsistent or a finding needs a product decision, stop
  and report instead of guessing.

## Report format

- Summary and verdict.
- Findings with severity and evidence.
- Scope answers.
- M4c1 recommendation.
- Open questions / risks.
- Worktree path, branch name, head SHA.
