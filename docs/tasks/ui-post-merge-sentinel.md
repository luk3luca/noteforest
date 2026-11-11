# UI post-merge Sentinel — shell, Settings, Page UI, and the UI test runner

**Role:** Reviewer / Sentinel (independent)
**Milestone:** UI rework (Batches A/B/C/V) + test-infrastructure hardening
**Base:** `main` at the commit that adds this brief (UI code at `a44a257`, test runner at `b654893`)
**Worktree:** fresh worktree created by the delegate from that base; never review in the main checkout
**Timebox:** 3 hours

## Context

The UI design phase was merged into `main` as a fast-forward from `94d07b3` to `a44a257`
(Batches A/B/C/V, ~24k inserted lines across product code, tests, and docs). Immediately after,
the UI suite chain was replaced by `tests/ui/run.mjs` (`b654893`): one `node --test` process per
file, a worker pool, surface groups, and `verify` now calls it once.

The merge was green (`npm run verify`, 43/43 UI), but it is large, product-visible, and was never
independently reviewed as a whole. Known risks were recorded by the builders: cross-document page
margin fallback, density/preset interactions, tab windowing at 10–14 tabs, hidden child-indent
inset, centered non-Page Settings content, and the Continuous Fit-width 0.91 consequence of the
8 px inset. Several stale assertions were found during the batch verifies. This review decides
whether the UI and the new test runner are safe to build on.

- `docs/tasks/ui-batch-a.md`, `ui-batch-b.md`, `ui-batch-v.md`, `ui-settings-advanced.md`
- `docs/tasks/ui-rework.md`, `docs/tasks/ui-design-settings.md`
- `docs/reports/ui-batch-a.md`, `ui-batch-b.md`, `ui-batch-c.md`, `ui-batch-v.md`
- `docs/design/ui-settings-contents.md`, `docs/reviews/settings-inventory.md`
- `docs/review-checklist.md`, `docs/definition-of-done.md`
- `docs/spec.md` (settings, Page, read-only, persistence), `docs/ux.md`, `docs/adr/0007-*.md`, `docs/adr/0008-*.md`
- `docs/agents/roles.md` (Sentinel contract)

## Goal

One independent verdict on the merged UI and the new UI test runner: each Batch A/B/C/V acceptance
criterion judged with reproducible evidence, findings ranked S1–S3 with `file:line`, a coverage
annex for the 43 UI suites, and a clear decision on what must be fixed before the next settings
block starts.

## In scope

Review the diff `94d07b3..<base>` in this order:

1. **Settings platform and UI** — instant save, document/global scope, per-document override
   lifetime, no-document state, corrupt/failed-write feedback, read-only behavior, validation,
   preset/reset, and no dead or fake controls. Check the frozen values in
   `docs/reviews/settings-inventory.md` are unchanged (density 60–120 and floor rules, max card
   width, margins, typography, tokens) and that no schema/version drift was introduced.
2. **Page advanced settings and preview** — every Page control reaches Page Read, Page Edit, and
   the PDF path through the same resolved settings; preview/geometry consistency; no duplicate
   fallback or dead literal; Page Edit commit-before-write behavior.
3. **Shell C** — titlebar, toolbar, sidebar/rail, canvas header, status strip, tabs/overflow,
   windowing, `+`, zoom, palette, toasts, export sheet. Keyboard path, focus return, ARIA labels,
   read-mode gating, and native menu/palette parity with the command layer.
4. **Visual batch V** — one Settings width, toast tokens/icons, tab expansion/windowing, 8 px
   Continuous inset; confirm Page/PDF output did not change.
5. **Test runner** (`tests/ui/run.mjs`, `package.json`, `tests/ui/README.md`) — pool isolation
   (distinct library/app-support roots), exit codes, timeout, TAP capture on failure, group
   correctness, duplicate execution, and whether the default concurrency (`min(8, cores − 2)`)
   can hide flakes or cross-suite interference.
6. **Test coverage annex** — a file → surface/acceptance-criterion map for all 43 UI suites; flag
   any test that cannot fail when its behavior is removed, any duplicated assertion (not merely a
   duplicated launch), and any acceptance criterion with no test. Do not delete tests; recommend.

## Out of scope

- Any code, test, spec, UX, ADR, or plan edit. The Sentinel reports; it does not fix.
- New features and future settings pages (Appearance v3, Export defaults, Page chrome, manual
  breaks, Data recovery, Continuous global, Editor/General).
- Re-reviewing untouched M2/M3/M4 code except where the UI diff changed its behavior.
- Product decisions (tab windowing, Settings centering, fit-width); flag them for the product
  owner instead of deciding.
- Merging or pushing. No PR.

## Files to read

- `apps/desktop/src/renderer/src/shell/*` — Settings, tabs, sidebar, status, titlebar, palette,
  canvas header, view controls, workspace.
- `apps/desktop/src/renderer/src/settings/*`, `state/settings.ts`,
  `settings/usePageSettingsController.ts`, `settings/page-settings-write.ts`,
  `settings/page-setup.ts`, `settings/page-advanced.ts`.
- `apps/desktop/src/renderer/src/export/*`, `page/PageView.tsx`, `lib/view-zoom.ts`,
  `lib/geometry.ts`, `lib/design-tokens.ts`, `styles.css`, `App.tsx`, `actions.ts`.
- `apps/desktop/src/main/index.ts`, `menu.ts`, `src/preload/index.ts`, `src/shared/api.ts`,
  `src/shared/export.ts`.
- `tests/ui/run.mjs`, `tests/ui/README.md`, `package.json`, `tests/support/*`, and the batch UI
  suites plus `m4e1-settings-platform`, `m4d1-page-density`, `r1b-page-settings`, `m4b1*`,
  `m4c1`–`m4c3`, `m4d2`.
- Batch reports and screenshots in the main checkout: `artifacts/ui-batch-a/`,
  `artifacts/ui-batch-b/`, `artifacts/ui-batch-v/`, `artifacts/ui-settings-advanced/`.

## Expected to touch

- `docs/reviews/ui-post-merge-review.md` (the deliverable).
- `docs/review-checklist.md` and `docs/definition-of-done.md` only if the review genuinely changes
  them (state what and why). Do not touch anything else.

## Acceptance criteria (for the review)

- [ ] Every acceptance criterion of Batches A, B, C, and V has pass/fail status with evidence
      (code path, test name, screenshot, or reproduced behavior); no criterion is left "not checked"
      without a reason.
- [ ] Settings: one write path, correct scope/persistence, no-document and read-only states,
      corrupt/failed-write handling, and no fake or dead control.
- [ ] Frozen settings values and schema version are unchanged; no new migration or fallback drift.
- [ ] Page advanced controls reach Page Read/Edit and PDF through the same resolved settings;
      preview and Page agree on the measured result.
- [ ] Shell behaviors (tabs, palette, export, zoom, read-mode gating, ARIA/focus) match the brief;
      tab windowing does not lose access to any tab.
- [ ] Continuous inset changes only Continuous; Page/PDF output is unchanged.
- [ ] Test runner: verified isolation, exit code, timeout, failure output, and group selection; a
      failing suite is proven to fail the gate (inject a temporary local-only failure or inspect
      the code path, then revert it).
- [ ] Coverage annex maps all 43 suites to surfaces/ACs and lists weak, duplicated, or missing
      coverage with file:line evidence.
- [ ] `npm run verify` run once on the base commit; real timings recorded; no failure or pageError.
- [ ] Report verdict is one of accept / accept with findings / request changes, with S1–S3
      findings and residual risks, and states what still needs the product owner.

## Tests and evidence

- `npm run verify` once (expected ~3 min on this machine: 107 unit files / 1075 tests, 16 e2e,
  14 recovery, 43 UI suites at `concurrency=8`).
- Targeted UI groups as needed: `node tests/ui/run.mjs --group shell|settings|page`.
- Reproduce findings, do not infer them. For a product-visible issue, capture a screenshot in the
  review worktree; do not record the screen.
- No native OS dialogs. No retries, no fixed sleeps, no weakened assertions.

## Stop and ask

Stop and report instead of inventing a decision when:

- a batch brief or acceptance criterion is missing or contradictory;
- the expected behavior is a product decision (tab windowing, Settings centering, fit-width);
- the baseline `verify` fails for an unrelated reason;
- a finding would need a schema or public-command change to fix;
- evidence cannot be produced without a human (subjective visual/VoiceOver judgement).

## Report format

Write `docs/reviews/ui-post-merge-review.md` with:

- Reviewer, date, reviewed base/range, worktree/branch, environment, verdict.
- What is accepted, what is not, and why (short prose, no marketing).
- Findings S1–S3 with `file:line`, reproduction, and expected behavior.
- Acceptance-criteria table with evidence per item.
- Test-infrastructure annex: runner mechanics, coverage map, weak/duplicate/missing coverage.
- Checks run with real timings; what was not verified.
- Open questions for the product owner.
- Recommended next step (fix list vs proceed).

Final response mirrors the brief: summary, files changed (review doc only), checks run with
timings, findings count by severity, open questions/risks, next step.
