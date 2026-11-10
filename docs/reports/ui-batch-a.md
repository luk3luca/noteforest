# UI rework — Batch A implementation report

**Status:** Implemented; targeted suites and `verify:fast` green; awaiting Orchestrator integration.
**Role:** Implementer / Builder
**Task:** `docs/tasks/ui-batch-a.md`
**Branch:** `t3/ui-batch-a-shell-settings-export`
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-6429bdab-107d198394ceb769`
**Base:** `4102e06` (`design/ui-map` head at delegation)
**Date:** 10 November 2026

## Summary

Batch A is implemented on the real shell, Settings, Export, and palette components. The shell uses
variant C: one fixed 34 px canvas header inside the rounded canvas panel, undo/redo on the left,
Page navigation/Export after a divider on Page, and icon-only layout/mode on the right. The Toolbar
keeps only tabs, `+`, overflow, zoom, and the palette. Tabs shrink to a 96 px floor without a
horizontal scrollbar; the zoom dropdown and the global close-tab button are gone. Library/Topics
and Settings active rows use a 1 px accent ring.

Settings was rebuilt as an instant-save shell: no Apply/Cancel, no dirty dots, a real
Saved/Saving/Couldn't save + Retry footer, and Done. Global/document scope never writes on switch;
per-field override dots, Use global, and equal-to-global auto-removal are implemented; no-document
and read-only states are covered. Page density and its existing Page/PDF behavior are preserved.

Export is now a 560 px modal sheet with a folder picker (the only native surface), fixed `.pdf`
filename, Add date, destination preview, resolved Page summary, in-sheet overwrite, progress/cancel,
done/failed/cancelled, and grouped untruncated warnings. The existing M4c2 export job/print
pipeline is unchanged; the produced PDF is unchanged.

The palette has Commands/Documents/Blocks, chapter counts/chapter hints, title-only search, an
empty state, arrow/Enter navigation, disabled rows with reasons, forced Escape close, focus restore,
and shared read-mode gating.

No dependency, settings schema/migration, spec/UX/ADR/plan, lab, Page sheet, paginator, print
compositor, or PDF output change was made.

## Checkpoint commits

- `d529ec4` — `feat(ui): shell C canvas header, shrinking tabs, icon-only view controls`
- `de4169a` — `feat(settings): instant-save Settings shell with scope and overrides`
- `35c04a6` — `feat(ui): export sheet and command palette for Batch A`
- `a9bfff1` — `test(ui): keep Batch A screenshot directory across suites`
- `0d462ac` — `fix(export): serialize starts and commit Page Edit before the job`
- `f817593` — `fix(settings): flush the density edit before Export PDF and clarify read-only copy`
- `6d02b10` — `fix(export): show the dated filename helper only when Add date is on`
- `7b5038c` — `fix(settings): flush a debounced edit on close/quit before waiting for writes`
- `757eb65` — `chore(ui): drop the retired density-scope CSS blocks`
- `e0fe024` — `docs(tokens): align the canvas content budget with edge-to-edge padding`
- `be8f9b6` — `fix(ui): restore overlay focus and expose the app-data folder`

## Files changed

**Shell**
- `apps/desktop/src/renderer/src/shell/CanvasHeader.tsx` (new)
- `apps/desktop/src/renderer/src/shell/ViewControls.tsx`
- `apps/desktop/src/renderer/src/shell/Toolbar.tsx`
- `apps/desktop/src/renderer/src/shell/TabBar.tsx`
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx`
- `apps/desktop/src/renderer/src/page/PageView.tsx`
- `apps/desktop/src/renderer/src/lib/design-tokens.ts`
- `apps/desktop/src/renderer/src/lib/geometry.ts`
- `apps/desktop/src/renderer/src/styles.css`
- `docs/design-tokens-continuous.md` (token values + Page stage frame)

**Settings**
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` (new)
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx`
- `apps/desktop/src/renderer/src/state/settings.ts`
- `apps/desktop/src/renderer/src/App.tsx` (quit/close settings flush)
- `apps/desktop/src/shared/api.ts`, `preload`, `main/index.ts` (app-support reveal + folder picker)

**Export and palette**
- `apps/desktop/src/renderer/src/export/ExportSheet.tsx` (new)
- `apps/desktop/src/renderer/src/export/export-flow.ts`
- `apps/desktop/src/renderer/src/export/ExportStatusPanel.tsx` (removed)
- `apps/desktop/src/renderer/src/shell/CommandPalette.tsx`
- `apps/desktop/src/renderer/src/actions.ts`
- `apps/desktop/src/renderer/src/state/shell.ts`
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/menu.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/shared/api.ts`
- `apps/desktop/src/shared/export.ts`

**Tests and artifacts**
- `apps/desktop/test/design-tokens-css.test.ts`, `geometry.test.ts`, `placement.test.ts`,
  `export-ui-filename.test.ts`
- `tests/ui/v0-shell-frame.test.mjs`, `m2-view.test.mjs`, `m4b1-page-view.test.mjs`,
  `m4b1a2-read-mode-gating.test.mjs`, `m4b1b1-page-edit-overlay.test.mjs`,
  `m4c1-print-compositor.test.mjs`, `m4c3-pdf-gate.test.mjs`, `m3-reference.test.mjs`,
  `m3c3b2-image-anchors.test.mjs`, `r2a/r2d/r2j` page tests, `m4d1-page-density.test.mjs`,
  `m4d2-export-ui.test.mjs`, `m4e1-settings-platform.test.mjs`, `ui-batch-a.test.mjs` (new)
- `tests/e2e/m2-editor.test.mjs`, `tests/visual/m2-screenshots.test.mjs`
- `package.json` (new UI suite in `test:ui`/`verify`)
- `artifacts/ui-batch-a/` screenshots (ignored): expanded shell, Continuous/Page header, Settings
  (page, no-document, data), Export (configure, overwrite, done, page done, failed, warnings),
  palette (empty, read-mode)

## Checks and timings

| Check | Result | Real time |
|---|---|---:|
| `npm run check:boundaries` | 170 files, 840 imports, 16 rules | 0.40 s |
| `npm run typecheck` | all workspaces clean | 4.87 s |
| `npx vitest run` (in `verify:fast`) | 103 files / 1027 tests passed | 2.69 s |
| `npm run e2e` (critical, in `verify:fast`) | 16/16 passed | 44.15 s |
| **`npm run verify:fast`** | **exit 0** | **53.23 s** |
| `npm run test:ui` (full Batch A state) | all 40 suites passed | 511.38 s |
| Targeted: `ui-batch-a` | 5/5 | 10.9 s |
| Targeted: `m4b1-page-view` | 9/9 | 6.1 s |
| Targeted: `m4c1-print-compositor` | 6/6 | 3.9 s |
| Targeted: `m4c3-pdf-gate` | 3/3 | 12.3 s |
| Targeted: `m4d1-page-density` | 3/3 | 10.1 s |
| Targeted: `m4d2-export-ui` | 8/8 | 10.0 s |
| Targeted: `v0-shell-frame` | 5/5 | 5.2 s |
| Targeted: `m4e1-settings-platform` | 4/4 | 3.5 s |

No test assertion was weakened, no fixed sleep was added to the new suites, and no native dialog was
opened by an automated test. The existing test dialog guard still fails fast; export tests override
the folder picker and assert that no native save dialog is called.

## Acceptance criteria

| Criterion | Status |
|---|---|
| C canvas header fixed/edge-to-edge, undo/redo left, icon-only layout/mode right; toolbar only tabs/`+`/overflow/zoom/palette | **Pass** |
| No global close; tabs shrink/no scroll; `+` after the last tab; overflow works | **Pass** |
| Zoom selector gone; minus/percentage/plus work and remain layout-aware | **Pass** |
| Library/Topics active rows use the 1 px accent ring, not a left stripe | **Pass** |
| Settings instant save, status/Retry/Done, no Apply/Cancel/dirty dots; scope/override, no-document/read-only, future-page behavior; Page density not regressed | **Pass** |
| Export sheet has all states, no native save dialog, in-sheet overwrite, progress/cancel, done/failed/cancelled, all warnings; PDF output unchanged | **Pass** |
| Palette groups/search/empty/keyboard/disabled reason/read mode; no dead entries | **Pass** |
| Page/PDF output and Page/Page Edit behavior unchanged; no schema/dependency change; no fake controls | **Pass** |
| Targeted tests, screenshots, and one `verify:fast` pass; report maps every criterion | **Pass** |

## Residual risks and notes

- Removing the responsive canvas padding means a window resize no longer changes the Continuous
  canvas element width. The image-anchor resize suite now uses zoom as the real display-resize proof
  and separately checks that the surface survives a narrow window. This is expected with shell C,
  not a product regression.
- The per-tab `×` remains a pointer affordance. It is not focusable because the tab chip wrapper is
  `role="presentation"`; making it focusable breaks the tablist ARIA tree (axe
  `aria-required-children`). Keyboard close is `Delete` on the tablist and `⌘W`, as tested.
- The Page-view scroll-preservation check captures the scroll position after the fixed header has
  mounted and uses a 40 px offset. The old 120 px value was measured before the header settled and
  was clamped; the assertion still requires the same position within 1 px after the round trip.
- The e2e router check now uses the fixed header undo. The old Settings “Undo last change” duplicate
  was removed with the rest of the Settings actions; the palette/header remain the canonical paths.
- Export folder defaults are the main-process session default (`~/Documents` until a folder is
  chosen). Export defaults persistence is explicitly out of Batch A.
- The Settings slider debounce is 240 ms. Closing Settings, Export PDF, and close/quit flush the
  pending edit before waiting on the settings queue; a hard renderer kill inside the debounce
  window is the only residual loss window.
- The Page stage frame changed fit zoom (14/0/8 padding) but the Page sheet, paginator, print
  compositor, and produced PDF are unchanged; m4c1/m4c3/m4d2 verify parity and output.
- Full Batch B (Page setup/margins/preview/validation/preset, Page chrome, manual breaks) remains
  out of scope.

## Next step

The Orchestrator should review the checkpoint commits, run the single full `npm run verify`, and
merge into `design/ui-map` (not `main`). Batch B starts after that integration.
