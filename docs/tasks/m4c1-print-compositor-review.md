# Targeted Sentinel — M4c1 Page print compositor + seam F1–F4

**Role:** Reviewer / Sentinel (independent judgment; no product-code edits)  
**Milestone:** M4c1 print compositor; M4c2 export orchestration follows  
**Base:** `main` at the M4c1 integration (`bc50790` plus this brief commit)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 4 hours

## Why this review

M4c1 is the first Page PDF slice. It adds a print model, a print-only compositor,
a `print.html` entry, and shared page-chrome/edge-label geometry, and it
refactors Page Read to use the shared projection. The full verify is green
(92 files / 904 tests, 32 UI suites / 106 tests, 16 e2e, 14 recovery, 0
pageErrors), but this is the foundation M4c2 (`printToPDF`) will load. Review it
before export orchestration.

This is a targeted M4c1 review, not the full-codebase Sentinel and not an
implementation task.

## Scope

Read:

- `docs/tasks/m4c1-print-compositor.md` — the brief.
- `docs/reports/m4c1-print-compositor.md` — the implementation report.
- `docs/reviews/r2-page-pdf-seam-review.md` — F1–F4 and the print seam rules.
- `docs/tasks/m4c-pdf-plan.md` — M4c1/M4c2/M4c3 split.
- `docs/adr/0002-pdf-pipeline.md`, `docs/adr/0007-editor-layouts-and-modes.md`,
  `docs/adr/0008-personal-page-settings.md`.
- `packages/pdf/src/printModel.ts`, `packages/pdf/test/print-model.test.ts`.
- `packages/layout/src/page-chrome.ts`, `page-settings.ts` (fingerprint),
  `paginator.ts` (shared defects), `document.ts` (title), `index.ts`.
- `apps/desktop/src/renderer/src/page/projection.ts`, `print-model-registry.ts`,
  `PageView.tsx`, `PageEdges.tsx`, `model.ts`, `usePageModel.ts`.
- `apps/desktop/src/renderer/src/print/PrintDocument.tsx`, `print.css`,
  `entry.tsx`, `test-surface.tsx`, `print.html`,
  `apps/desktop/electron.vite.config.ts`, `App.tsx` test bridge.
- `apps/desktop/test/print-parity.test.ts` and
  `tests/ui/m4c1-print-compositor.test.mjs`.

You may read anything else needed for evidence. Do not modify product code,
tests, spec, UX, ADR, or plan.

## Questions

1. **F1 parity.** Is the real `layoutDocument` + `paginate` print parity
   genuine, or does the test restate the same projection? Does the UI test
   compare the mounted Page Read DOM and the print DOM independently enough?
   Is the stub measurement port in `print-parity.test.ts` acceptable seam
   evidence, given the UI test uses real DOM measurement?
2. **F2 completeness.** Does `PrintModel` carry every input the compositor
   needs (theme/CSS, measurements/table columns, document/segments, anchors,
   assets, defects, chrome, labels)? Can `PrintDocument` render Page Read
   without renderer-state reach-in? Is anything missing for M4c2?
3. **F3 chrome/labels.** Are `pageChromeLayout`/`pageChromeContent`/
   `pageEdgeLabelLayout` exact refactors of the old Page positions? Any
   changed Page Read text/position not caught by the UI parity? Is
   `contentBlockTitle` duplicated with the renderer `blockTitle` and can it
   drift?
4. **F4 identity.** Is the settings/manual-break fingerprint and the validation
   re-pagination sound? Can a stale or differently themed layout pass? Is the
   extra paginate pass acceptable, or must the paginator options be carried?
5. **Compositor.** One fixed page per derived page, direct children, no CSS
   re-pagination, no metric changes, print skin colors/borders/shadows only.
   Does `break-before` + `break-after` risk blank pages in `printToPDF`? Is the
   `@page` size correct for A4/A5/Letter and orientation? Any print/margin/box
   drift?
6. **Entry/security.** Is `print.html` a safe local-only surface (CSP, no
   network, assets via `noteforest-asset:`)? Is the `App.tsx` test bridge
   isolated from production user flows? Is the renderer import of
   `@noteforest/pdf` safe/bounded?
7. **Tests/evidence.** Do the tests guard the behavior or restate it? Any
   weakened assertion, fixed sleep, test-only path exposed in production, or
   missing negative case? Is the print-root screenshot adequate visual
   evidence? What can only be verified in M4c2/M4c3?
8. **M4c2 readiness.** What must M4c2 add or fix before `printToPDF` (hidden
   window lifecycle, font/KaTeX/image settle, local asset protocol, print
   options, atomic output, cancellation, failure surfaces)? Distinguish M4c2
   work from M4c1 defects.

## Output

Write `docs/reviews/m4c1-print-compositor-review.md`:

- Verdict: **accept**, **accept with findings**, or **changes requested**.
- Severity-ranked findings (S1 blocking M4c2, S2 should fix before M4c2 or in
  M4c2, S3 follow-up), each with `file:line`, evidence, and the smallest safe
  fix.
- Answers to the eight questions.
- M4c2 recommendation: ready / add / defer.
- Any checklist/DoD update allowed to the Sentinel.
- Worktree path, branch name, head SHA.

No code, test, spec, UX, ADR, or plan changes. No merge, push, or PR.

## Checks

- Targeted unit/UI commands are allowed; the Orchestrator already ran the full
  verify at `9ace62d` (and the final integration at `bc50790`).
- Do not re-run the full `npm run verify`.
- No fixed sleeps, native dialogs, or screen recordings.
- Stop and report if the baseline is inconsistent or a finding needs a product
  decision.
