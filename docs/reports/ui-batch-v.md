# UI Batch V — visual refinement implementation report

**Status:** Merged into `design/ui-map` after the full verify; `main` fast-forward gate next.
**Role:** Implementer / Builder
**Task:** `docs/tasks/ui-batch-v.md`
**Branch:** `t3/ui-batch-v-visual-refinements`
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-ae1b2f9f-2ba8efa920112d04`
**Base:** `82917fa` (`design/ui-map` head containing the Batch V brief)
**Date:** 11 November 2026

## Summary

Batch V fixes the four product-owner visual/behavioral refinements on the Batch A/B/C shell:

1. **Settings fixed size.** One 980 px desktop modal for General, Page, Continuous, Editor, Export,
   and Data & About, with the 580 px dialog height and a scrolling body. The Page preview remains
   only on Page; every page uses the same 536 px content column, centered when the preview is not
   present. Only the viewport changes the width (≤920 px hides the preview and uses 840 px / 92vw).
2. **Toast tokens.** Width 340 px (mobile full width), padding 12 × 14, `--radius-panel` 8 px,
   `surface-3`/`--border`, the 12/32/0.45 shadow, title 12.5/500, description 11.5/400 in
   `--text-secondary`, and 16 px / 1.5-stroke app icons in the success/warning/danger/accent colors.
   The Sonner default filled/bright icons are replaced through the Toaster `icons` prop. Duration,
   stacking (three visible), actions, dismissal, and focus behavior are unchanged; no toast API
   changed.
3. **Tabs.** The active tab expands (170–220 px); inactive tabs stay compact (96 px, shrinking to an
   80 px floor) with title ellipsis. `!`, lock, dirty dot, and close never shrink (`!` stays a 12 px
   circle). When the floor no longer fits, the visible window keeps the active tab and adjacent
   tabs; the existing tab menu lists every tab. The `+` stays immediately after the last visible
   tab, and the tablist never scrolls horizontally. Drag reorder, middle-click close, dirty/lock/
   recovery states, keyboard Delete/⌘W, and the tab ARIA structure are preserved.
4. **Canvas chapter inset.** `editorPaddingX` 8 px (medium 8, compact 6), the old −2 px optical
   offset removed from the chapter title and title input, and the Continuous token doc updated. The
   cards/edges move with the canvas inset; no Page/PDF output, schema, migration, dependency, lab,
   spec, UX, ADR, plan, or AGENTS edit was made.

## Checkpoint commits

- `3d22693` — `feat(settings): one fixed 980 px width for every Settings page` (V1)
- `9734797` — `feat(ui): align toast surface, typography, and stroke icons` (V2)
- `492d367` — `feat(ui): expand the active tab and window compact inactive tabs` (V3)
- `6ac2d16` — `feat(canvas): inset the Continuous chapter title by 8 px` (V4)
- `86c56eb` — `test(ui): align canvas and fit-zoom expectations with the 8 px inset`
- `51bd1cc` — `style(settings): fold the Batch V note into the Settings shell comment`
- the commit containing this report — `docs(report): add the Batch V implementation report`

The first four are the requested area checkpoints; the last three are the consequence fixes,
comment cleanup, and report.

## Files changed

**Implementation**

- `apps/desktop/src/renderer/src/styles.css`: one Settings width/height/content column and the 920 px
  viewport rule; tokenized toast surface/typography/icons; active/inactive tab policy and
  non-shrinking status icons; removed the chapter-title negative offset.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`: removed the page-dependent
  `nf-settings-modal-page` class; one modal class for every page.
- `apps/desktop/src/renderer/src/shell/TabBar.tsx`: active-tab-priority visible window, measured
  available strip width, overflow-menu fallback; rendered tabs keep the existing DnD/ARIA/close
  structure.
- `apps/desktop/src/renderer/src/App.tsx`: custom Sonner icons (CircleCheck/Info/TriangleAlert/
  CircleX/LoaderCircle at 16 px / 1.5) and a test-only `showToast` bridge for visual evidence.
- `apps/desktop/src/renderer/src/global.d.ts`: test-only `showToast` type.
- `apps/desktop/src/renderer/src/lib/design-tokens.ts`: `editorPaddingX` 8, medium 8, compact 6.
- `docs/design-tokens-continuous.md`: token rows and canonical shell wording updated for the 8/8/6
  lateral inset.

**Tests**

- `tests/ui/ui-batch-v.test.mjs` (new): 4 tests — Settings General/Page/Editor same 980 × 580
  surface, preview only on Page, centered content column, narrow viewport rule; toast computed
  styles/icons/visibility/no focus steal; 14-tab stress (active 170–220, inactive 80–96 floor,
  close icons 20/12, `+` after the last visible, hidden tabs in the overflow menu, active tab
  brought into view); chapter inset 8/8/6 with screenshots.
- `apps/desktop/test/ui-batch-v-css.test.ts` (new): CSS contract guards for the Settings width,
  tab status non-shrink, active/inactive widths, toast tokens, and the 920 px viewport rule.
- `apps/desktop/test/design-tokens-css.test.ts`: 8/8/6 token values and the removed chapter-title
  negative margin.
- `apps/desktop/test/geometry.test.ts`, `apps/desktop/test/placement.test.ts`: 8/8/6 geometry and
  the resulting Fit-width 0.91 for the 1280 px content case.
- `tests/ui/ui-batch-a.test.mjs`: tab assertions updated to the active-expanded/inactive-floor policy
  (active 170–220, inactive 80–96, active widest, inactive actually shrink); no assertion weakened.
- `tests/ui/m2-view.test.mjs`: canvas padding expectations updated to 8/8 at the default and medium
  steps.
- `package.json`: `ui-batch-v` registered in `test:ui` and `verify`.

**Evidence (ignored by git)**

- `artifacts/ui-batch-v/settings-general.png`
- `artifacts/ui-batch-v/settings-page.png`
- `artifacts/ui-batch-v/settings-editor.png`
- `artifacts/ui-batch-v/toast-success.png`
- `artifacts/ui-batch-v/toast-info.png`
- `artifacts/ui-batch-v/toast-error.png`
- `artifacts/ui-batch-v/tabs-2.png`
- `artifacts/ui-batch-v/tabs-8.png`
- `artifacts/ui-batch-v/tabs-14.png`
- `artifacts/ui-batch-v/canvas-chapter-inset.png`

## Checks and timings

| Check | Result | Real time |
|---|---|---:|
| `npm run check:boundaries` | 176 files, 872 imports, 16 rules | 0.44 s |
| `npm run typecheck` | all workspaces clean | 5.07 s |
| `npx vitest run` | 107 files / 1075 tests passed | 2.67 s |
| **`npm run verify:fast`** | **exit 0** | **53.15 s** |
| `npm run e2e` (critical, inside `verify:fast`) | 16/16 passed | 43.94 s (suite) |
| Targeted `ui-batch-v` | 4/4 | 16.83 s (suite) |
| Targeted `ui-batch-a` | 5/5 | 10.61 s |
| Targeted `ui-batch-b` | 9/9 | 10.27 s |
| Targeted `ui-settings-advanced` (Batch C) | 8/8 | 11.86 s |
| Targeted `m4e1-settings-platform` | 4/4 | 3.56 s |
| Targeted `r1b-page-settings` | 4/4 | 3.04 s |
| Targeted `m4d1-page-density` | 3/3 | 10.32 s |
| Targeted `v0-shell-frame` | 5/5 | 5.23 s |
| Targeted `m2-view` | 2/2 | 1.75 s |
| Targeted `m2-shell` | 4/4 | 3.56 s |
| Targeted `m4b1-page-view` | 9/9 | 6.73 s |
| Targeted `m4b1b1-page-edit-overlay` | 8/8 | 7.59 s |
| Targeted `m4c1-print-compositor` | 6/6 | 4.11 s |
| Targeted `m4c2-pdf-export` | 9/9 | 7.44 s |
| Targeted `m4b1a2-read-mode-gating` | 2/2 | 4.39 s |

No assertion was weakened, no fixed sleep was added, and no native dialog was opened. The test
dialog guard stays in force. Full `npm run verify` was deliberately not run (Orchestrator at
integration, per the brief).

## Acceptance criteria

| Criterion | Status |
|---|---|
| Settings uses one width for every page; only the viewport changes the responsive width | **Pass** |
| Toast width/padding/radius/typography/icons match the app tokens; behavior unchanged | **Pass** |
| Tab status icons never distort; active expands, inactive compact, status visible, `+` after the last tab, no scroll, overflow works | **Pass** |
| Chapter title starts with an 8 px lateral inset (6 px compact); no Page/PDF change | **Pass** |
| No behavior/schema/dependency change beyond these visuals; tests/screenshots/one `verify:fast` pass | **Pass** |

## Notes, choices, and residual risks

- **Tab windowing is explicit.** When the 80 px floor no longer fits, the strip renders the active
  tab plus as many adjacent tabs as fit. Hidden tabs are already in the existing overflow menu;
  choosing one (or arrowing to it) makes it active and brings it into view. This keeps the active
  tab always visible without a horizontal scrollbar. Rendered tabs keep the same tablist/DnD/
  middle-click/close/dirty/lock/recovery code.
- **Native minimum width.** The Electron window has a 960 px minimum, so the 920 px preview rule and
  the 900 px compact canvas step cannot be reached by resizing the native window. The Batch V UI
  tests drive the layout viewport with `page.setViewportSize` to exercise both; the authortime CSS
  contract is guarded in `ui-batch-v-css.test.ts`.
- **Status icon evidence.** The stress suite verifies the close control at 20 × 20 / 12 px; the
  missing/lock/dirty non-shrink rules (`flex: 0 0 12px`, `flex: none`, `flex: 0 0 5px`) are guarded
  in the CSS suite because creating real missing/locked/recovery tabs is a separate recovery flow.
  Their rendering/state code is unchanged.
- **Continuous placement budget.** The 8 px inset reduces the logical placement budget by 16 px
  (3200 → 3184) and changes Fit-width from 0.92 to 0.91 for the existing 1280 px content fixture.
  This is the requested canvas inset behavior; Page/PDF, the paginator, and the print compositor are
  untouched.
- **Settings content column.** The 536 px column plus 184 px nav and 258 px preview equals the 978 px
  modal content box (980 px border-box). Non-Page pages center the same column; there is no empty
  third column or separator.
- **Toast icons are a Toaster visual prop.** `showToast` exists only on `window.__noteforestTest` for
  computed-style evidence; the product toast calls and their options are unchanged.
- The product-owner visual/VoiceOver pass should confirm the tab window at 10–14 tabs and the
  centered non-Page Settings content column, which are the two visible trade-offs in this batch.

## Worktree, branch, head

- Worktree: `/Users/luca/.t3/worktrees/noteforest/t3-ae1b2f9f-2ba8efa920112d04`
- Branch: `t3/ui-batch-v-visual-refinements`
- Base: `82917fa`
- Head at handback: this report commit on top of `51bd1cc`

## Integration

- Full `npm run verify` on `4df220d`: **exit 0** — 107 unit files / 1075 tests, 16/16 e2e,
  14/14 recovery, 43 UI suites (Batch V included), no failures, 0 pageErrors.
- The full run found one stale Batch A assertion (canvas lateral padding 0 vs the new 8 px inset);
  it was aligned to the intended visual change in `4df220d`, Batch A passed 5/5, and the full
  verify was re-run green.
- Batch V was merged fast-forward into `design/ui-map` (not `main`) from `82917fa` to `4df220d`.
- Screenshots copied to `artifacts/ui-batch-v/` (10 images; ignored by git).
- Product-visible trade-offs for the visual pass: tab windowing at 10–14 tabs (hidden tabs remain
  in the overflow menu; activating one brings it into view), centered non-Page Settings content,
  and the Continuous Fit-width 0.91 consequence of the 8 px inset. Page/PDF are unchanged.
- Next: fast-forward `design/ui-map` to `main` (done at `a44a257`); future work continues on `main`.
  Future settings pages (Appearance v3, Export defaults, Page chrome, manual breaks, Data recovery,
  Continuous global, Editor/General), External API/agent access, and the lazy-new-document lifecycle
  remain out of scope.
