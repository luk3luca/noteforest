# UI rework — Batch B implementation report

**Status:** Implemented on `t3/page-settings-batch-b`; ready for Orchestrator review and integration
into `design/ui-map` (not `main`).
**Role:** Implementer / Builder
**Task:** `docs/tasks/ui-batch-b.md`
**Branch:** `t3/page-settings-batch-b`
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-692803a4-2476819d5b85e55e`
**Base:** `786a1c0` (`design/ui-map` head at delegation)
**Date:** 10 November 2026

## Summary

Batch B completes the frozen Page settings surface on the Batch A shell. Page setup now exposes
A4/A5/Letter, portrait/landscape, four labeled millimetre margins, All sides, 0–100 validation, and a
20 mm minimum content area per axis. Invalid values stay visible with an inline `role="alert"` and
`aria-describedby` instead of being silently reset or written. A size/orientation change that would
make the current margins invalid is blocked with an explanation.

The global/document scope is real: switching it never writes, per-field override dots and Use global
actions are present for setup, margins, typography, density, and size/orientation, equal-to-global
values auto-remove the override, and no-document/read-only states are covered. Typography exposes
Compact/Comfortable/Custom and the existing 60–120% density lens (step 5) with reset; advanced
typography, Page font, Page chrome, and manual breaks remain hidden.

Settings has a live preview produced by the same `usePageModel` measurement/layout/paginate pipeline
and the same projection, CSS variables, chrome, fragments, and edge mapper as Page Read. It follows
the active scope and the valid draft, shows an invalid paused state, an initial loading state, and an
updating state after changes. With no document it is a clearly labelled sample page with no invented
page count.

Every Page write that can re-paginate commits an open Page Edit block first. A rejected commit blocks
the write and surfaces the error; the ordering/blocking logic is unit-tested with an injected commit
and the real commit path is exercised for both geometry and density writes in the UI suite.

No settings schema/migration, dependency, Page sheet, paginator, print compositor, or PDF layout was
changed. The existing print/PDF pipeline still consumes the same resolved settings.

## Checkpoint commits

- `288cd24` — `feat(settings): Page setup, scope, live preview, and validation`
- `5ab5ce3` — `test(settings): Page scope overrides, preset/density, and Page/PDF parity`
- `d3d63fe` — `fix(settings): summarize margin errors without duplicating field messages`
- `1afea0b` — `test(ui): settle the Page Read parity screenshot`
- `d6fce85` — `test(ui): wait for the settled Page lens before geometry assertions`
- this report commit — `docs(report): add the Batch B implementation report`

## Files changed

**Implementation**
- `apps/desktop/src/renderer/src/settings/page-setup.ts` (new): strict mm parsing/validation,
  content-area checks, partial override merge/remove/compact helpers.
- `apps/desktop/src/renderer/src/settings/page-settings-write.ts` (new): commit-before-write
  ordering, with the commit and flush functions injected for tests.
- `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts` (new): scope, raw margin
  draft, density draft, debounced instant writes, per-field/group overrides, reset, and Page Edit
  ordering.
- `apps/desktop/src/renderer/src/settings/PageSettingsPreview.tsx` (new): real-model live preview,
  sample/empty/loading/updating/invalid states, scope label.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`: Page setup/margins/typography sections,
  scope/override controls, three-column Page layout, preview integration, footer invalid/commit
  state, export flush through the shared pending-flush path.
- `apps/desktop/src/renderer/src/page/PageView.tsx`: exports the existing `PageSurface` for the
  preview; no behavior change.
- `apps/desktop/src/renderer/src/styles.css`: Page setup/margins/preview styles, selected segmented
  ring, invalid footer, Page-modal width.

**Tests**
- `apps/desktop/test/page-setup.test.ts` (new): parsing/range/content validation, partial override
  math, equal-to-global removal, no input mutation.
- `apps/desktop/test/page-settings-write.test.ts` (new): commit order, failure blocks apply/flush,
  no-document path, write failure result.
- `apps/desktop/test/print-parity.test.ts`: shared geometry/fingerprint/CSS assertions plus the
  Batch B matrix (A4/A5/Letter, portrait/landscape, 12/25 mm margins, density 60/100/120, document
  override).
- `tests/ui/ui-batch-b.test.mjs` (new): 9 tests covering setup/margins/All sides/keyboard steps,
  inline validation/no silent reset, scope/override dots/Use global/equal-to-global, no-document and
  read-only, preset/density/Custom/reset, preview scope/ready/updating/invalid/sample, Page Edit
  commit before geometry and density, and Page Read parity across settings.
- `tests/ui/ui-batch-a.test.mjs`, `tests/ui/m4e1-settings-platform.test.mjs`,
  `tests/ui/m4d1-page-density.test.mjs`: updated scope/reason selectors to the shared Page scope.
- `package.json`: Batch B suite added to `test:ui` and `verify`.

**Evidence (ignored by git)**
- `artifacts/ui-batch-b/page-settings-default.png`
- `artifacts/ui-batch-b/page-settings-margins.png`
- `artifacts/ui-batch-b/page-settings-invalid-margins.png`
- `artifacts/ui-batch-b/page-settings-document-override.png`
- `artifacts/ui-batch-b/page-settings-typography.png`
- `artifacts/ui-batch-b/page-settings-sample-preview.png`
- `artifacts/ui-batch-b/page-read-a5-margins.png`

## Checks and timings

| Check | Result | Real time |
|---|---|---:|
| `npm run check:boundaries` | 174 files, 862 imports, 16 rules | 0.44 s |
| `npm run typecheck` | all workspaces clean | 4.95 s |
| `npx vitest run` | 105 files / 1051 tests passed | 2.71 s |
| `npm run e2e` (critical, in `verify:fast`) | 16/16 passed | 35.79 s (suite) |
| **`npm run verify:fast`** | **exit 0** | **52.59 s** |
| Targeted `ui-batch-b` | 9/9 | 10.27 s (suite) |
| Targeted `ui-batch-a` | 5/5 | 10.53 s |
| Targeted `m4e1-settings-platform` | 4/4 | 3.27 s |
| Targeted `m4d1-page-density` | 3/3 | 10.53 s |
| Targeted `r1b-page-settings` | 4/4 | 2.88 s |
| Targeted `m4b1-page-view` | 9/9 | 6.19 s |
| Targeted `m4b1b1-page-edit-overlay` | 8/8 | 6.95 s |
| Targeted `m4c1-print-compositor` | 6/6 | 3.77 s |
| Targeted `m4c2-pdf-export` | 8/8 | 6.19 s |
| Targeted `m4c3-pdf-gate` | 3/3 | 12.13 s |
| Targeted `m4d2-export-ui` | 8/8 | 9.87 s |
| Targeted `v0-shell-frame` | 5/5 | 4.76 s |

No assertion was weakened, no fixed sleep was added, and no native dialog was opened. The test dialog
guard remains in force; the Batch B suite does not touch the folder picker.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Page setup (size/orientation/margins) is real, instant-saved, scoped, and validated; margins are labeled with mm/All sides and invalid values show an error without a silent reset | **Pass** |
| Scope/override dots, Use global, equal-to-global auto-remove, no write on scope switch, no-document/read-only are covered | **Pass** |
| Preset Compact/Comfortable/Custom + density 60–120 work; advanced typography is hidden | **Pass** |
| Live preview reflects the draft and active scope, with invalid/loading states | **Pass** |
| Page Edit commits before geometry/density writes; failure blocks the write | **Pass** |
| Page Read/Edit/measurement/PDF use the same settings and stay in parity; no PDF output change for the same settings | **Pass** |
| Tests/screenshots/one `verify:fast` pass; report maps every criterion | **Pass** |

## Notes, choices, and residual risks

- **Density vs preset.** Density remains a lens over the selected preset; changing it does not force
  the Custom label. This is the frozen model's stated behavior ("a preset switch keeps the user's
  current density") and the Q-11 alternative allowed by the brief. Custom is a real action: it
  freezes the current resolved typography into a custom baseline.
- **Invalid size/orientation changes are blocked.** If the current margins would leave less than
  20 mm on an axis under the new page size/orientation, the segment does not write and an inline error
  explains that the margins must be reduced first. This avoids the model's defensive margin fallback
  and any silent reset.
- **Cross-document fallback.** A global size/orientation change can still make another document's
  stored margin override impossible under the new geometry; the existing model sanitizer then falls
  back to default margins for that document. The UI never creates such a value, and the current
  document's layer is blocked before the write. This is the existing defensive merge behavior, not a
  new schema rule.
- **Preview cost.** The preview runs the same model pipeline for the draft while Settings is open;
  Page Read keeps owning the registered print snapshot. The two are the same code path, not a second
  paginator. On very large documents this adds one measurement pass while Settings is open.
- **Rejected-commit evidence.** The failure-blocking contract is unit-tested with injected
  commit/flush functions. The e2e suite proves the real commit path for geometry and density writes.
  A rejected commit keeps the existing Page Edit overlay/error path (M4b1b1); Batch B does not add a
  second overlay, and the settings controller surfaces the commit error in the footer and blocks the
  write.
- **Responsive Page settings.** The Page modal is 980 px wide at ≥920 px with a 258 px preview column;
  below 920 px the preview is hidden and the normal 840 px modal remains.
- **No schema/PDF change.** `settings.json` stays v2 and the per-document map format is unchanged. The
  print compositor and PDF path are untouched; m4c1/m4c2/m4c3 and the print-parity matrix pass.

## Integration

- The full `npm run verify` was intentionally not run by the Builder; the Orchestrator runs it at
  integration. Batch B was checked with one `verify:fast` plus the affected UI/PDF suites.
- Merge into `design/ui-map`, not `main`. No merge, push, or PR was performed by the Builder.
- Batch B leaves Appearance v3, Export defaults, Continuous global, Page chrome, manual breaks, Data
  recovery, External API, library/backup, and light theme as future/empty pages.
