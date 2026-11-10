# V0 shell frame — implementation report

**Role:** Builder / Implementer
**Milestone:** UI rework V0
**Branch:** `t3/v0-merged-shell-frame`
**Base:** `design/ui-map` head `f11b293` (the commit containing `docs/tasks/v0-shell-frame.md`)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-11831095-ce349b7b0d7fc12c`
**Date:** 10 November 2026

---

## 1. Summary

V0 replaces the two-row title chrome with one 44 px **TopBar** and removes the duplicated
overflow of controls from the StatusStrip and PageToolbar.

- `TitleBar` is deleted; `TopBar` merges the macOS traffic-light inset, the document tab strip
  (activate, close, middle-click, drag reorder, overflow, dirty dot, lock, recovery), New note,
  the layout-aware `ViewControls`, and the command-palette button. No app-name row and no
  Settings gear in the bar. Empty areas stay the drag region; tabs/controls are no-drag.
- **ViewControls** (variant A, words) is the single home for layout `Continuous | Page`, mode
  `Edit | Read`, and zoom `− 100% + ▾` with Actual size / Fit width (Continuous) and Actual size /
  Fit page / Fit width (Page). Labels collapse to icons below 1180 px.
- A pure, layout-aware helper (`lib/view-zoom.ts` + `actions.ts`) resolves the active zoom target
  and applies menu/keyboard/palette/View-menu commands. Page controls use the existing
  `setDocumentPageZoom` / `setDocumentPageFit` only; the hidden Continuous zoom is never touched
  and vice versa.
- **Sidebar**: header is Search (palette), New note (same command/label/shortcut as the TopBar
  `+`), and a collapse toggle. The footer has exactly one Settings entry (gear + “Settings”); the
  static “Graphite” label is gone. Collapse unmounts the panel and shows a labelled reveal button
  at the left of the TopBar; `⌘\` toggles; width/collapsed persist in the session.
- **StatusStrip** is status-only: save state (`role=status`, `aria-live`, `data-save-state`), word
  and block counts, and the anchor-health button when > 0. Layout/mode/zoom/focus/path/theme
  buttons and the static “Dark” label are removed. Focus branch stays on `⇧⌘F` and in the palette;
  reveal stays in the tab menu/Settings.
- **PageToolbar** keeps page navigation and Export only; page zoom/fit/actual and “Open in
  continuous editor” are removed. The Page fragment Enter/double-click read path is unchanged.
- `Rename document…` and `Reveal in Finder` are reachable from the tab context menu (this was
  already the menu’s contents; V0 keeps it as the only in-chrome document-title affordance now
  that the title row/status path are gone). The palette/native-menu commands still work.

No new dependency, no settings-schema change, no Page/PDF geometry or output change, no
spec/UX/ADR/plan edit.

## 2. Files changed

Source:

- `apps/desktop/src/renderer/src/App.tsx` — renders `TopBar`; keyboard zoom/fit delegates to the
  shared layout-aware helper.
- `apps/desktop/src/renderer/src/actions.ts` — `adjustActiveLayoutZoom`, `resetActiveLayoutZoom`,
  `fitActiveLayout`; palette and native View-menu commands reuse them.
- `apps/desktop/src/renderer/src/lib/view-zoom.ts` *(new)* — pure active-zoom resolver and valid
  menu commands per layout.
- `apps/desktop/src/renderer/src/shell/TopBar.tsx` *(new)* — one bar, reveal button, palette.
- `apps/desktop/src/renderer/src/shell/ViewControls.tsx` *(new)* — layout/mode/zoom controls and
  the zoom menu with `data-page-fit` / `data-zoom-commands` hooks.
- `apps/desktop/src/renderer/src/shell/TitleBar.tsx` *(deleted)*.
- `apps/desktop/src/renderer/src/shell/TabBar.tsx` — exports `TabStrip`; tab strip/actions inside
  the TopBar; overflow wording “New note”.
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` — no tab-strip overlay/padding; sidebar is
  the only panel and collapses by unmounting.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — header row (Search/New note/collapse), one
  Settings entry in the footer, no Library `+` duplicate, no “Graphite”.
- `apps/desktop/src/renderer/src/shell/StatusBar.tsx` — status-only strip.
- `apps/desktop/src/renderer/src/page/PageView.tsx` — PageToolbar nav + Export only.
- `apps/desktop/src/renderer/src/styles.css` — 44 px TopBar, TopBar/tab/actions/view-control
  styles, sidebar header/footer, removal of titlebar/status-control/page-toolbar-zoom rules,
  responsive icons at 1180 px.

Tests and evidence:

- `apps/desktop/test/view-zoom.test.ts` *(new)* — continuous/page zoom target and menu validity.
- `tests/ui/v0-shell-frame.test.mjs` *(new)* — the V0 acceptance suite (4 tests).
- `tests/ui/m2-view.test.mjs` — zoom/fit now use the TopBar hooks; focus uses `⇧⌘F` and the stored
  `focusBlockId`.
- `tests/ui/m4b1-page-view.test.mjs` — Page zoom/fit through the TopBar; the removed
  “Open in continuous editor” button is replaced by the fragment double-click read path.
- `tests/ui/m4c3-pdf-gate.test.mjs` — Actual size through the TopBar zoom menu.
- `tests/e2e/m2-editor.test.mjs` — rename through the tab context menu; New note selector;
  zoom label hook.
- `tests/visual/m2-screenshots.test.mjs` — same selector updates for the on-demand visual suite.
- `package.json` — `v0-shell-frame` added to `test:ui` and `verify`.
- `docs/reports/v0-shell-frame.md` — this report.

Screenshots (generated by the new suite, outside git as `/artifacts/` is ignored):

- `artifacts/v0-shell/topbar-1440x900.png`
- `artifacts/v0-shell/sidebar-collapsed-1440x900.png`
- `artifacts/v0-shell/page-toolbar-1440x900.png`

## 3. Checks run (real timings)

| Check | Result | Time |
|---|---|---|
| `npm run check:boundaries` | pass — 167 files, 819 imports, 16 rules | 0.52 s |
| `npm run typecheck` | pass (desktop, core, layout, pdf) | 6.30 s |
| `npx vitest run apps/desktop/test/view-zoom.test.ts` | 3/3 pass | 0.50 s |
| `npx vitest run` (all unit) | 103 files / 1025 tests pass | 3.25 s |
| `node --test tests/ui/v0-shell-frame.test.mjs` | 4/4 pass | 11.8 s |
| `node --test tests/ui/m2-shell.test.mjs tests/ui/m2-view.test.mjs` | 6/6 pass | 12.4 s |
| `node --test tests/ui/m4b1-page-view.test.mjs` | 9/9 pass | 15.3 s |
| `node --test tests/ui/m4b1a2-read-mode-gating.test.mjs` | 2/2 pass | 12.7 s |
| `node --test tests/ui/m4b1b1-page-edit-overlay.test.mjs` | 8/8 pass | 16.2 s |
| `node --test tests/ui/m4e1-settings-platform.test.mjs` | 4/4 pass | 11.5 s |
| `node --test tests/ui/m4d1-page-density.test.mjs` | 3/3 pass | 18.5 s |
| `node --test tests/ui/m4d2-export-ui.test.mjs` | 7/7 pass | 16.4 s |
| `node --test tests/ui/r1b-page-settings.test.mjs` | 4/4 pass | 11.3 s |
| `node --test tests/ui/m4c3-pdf-gate.test.mjs` | 3/3 pass | 22.4 s |
| `npm run test:recovery:run` | 14/14 pass | 18.6 s |
| `node --test tests/e2e/m2-editor.test.mjs` | 16/16 pass | 45.4 s |
| `npm run verify:fast` (one run) | pass: boundaries, typecheck, 1025 unit tests, build, 16 e2e | 56.64 s wall |

No pageErrors in the new or affected UI suites. No native dialog was opened by tests; the export
button is asserted, not clicked (its flow is covered by `m4d2`).

## 4. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| One TopBar: traffic lights, tabs, new, ViewControls, palette; no separate title row; no Settings gear | **Pass** | `v0-shell-frame` test 1: one 44 px `.nf-topbar`, no `.nf-titlebar`, tablist + view controls + palette + New note; zero Settings buttons in the bar |
| Sidebar Search/New/collapse, library/topics, one Settings footer entry; “Graphite” gone; collapse hides and reveals from TopBar; `⌘\` works | **Pass** | Tests 1–2: single `.nf-sidebar-settings`, chrome text has no “Graphite”, collapse unmounts `.nf-sidebar`, reveal sits after the traffic lights before the tabs, `⌘\` collapses, collapsed state survives flush + relaunch |
| StatusStrip only save/counts/anchor health; no layout/mode/zoom/focus/path/theme | **Pass** | Test 3: `role=status`/`aria-live`/`data-save-state`, word/block counts, zero layout/mode/zoom/focus/path buttons, no “Dark”; health chip appears with one broken anchor and opens Anchor Health |
| TopBar layout/mode/zoom work in both layouts; Page zoom/fit changes Page state and never the hidden Continuous zoom; Continuous zoom/fit still works | **Pass** | Test 4: Continuous `zoom` 1→1.1 with `pageZoom` 1; Page zoom/fit changes `pageZoom`/`pageFit` with `zoom` 1; Continuous round trip keeps `pageZoom` 1; menu hides Fit page in Continuous |
| PageToolbar nav + Export only; no zoom/fit/open-in-continuous | **Pass** | Test 3: `data-page-nav` prev/next, counter, `data-page-export`; zero `[data-page-fit]`, `[data-page-zoom]`, `[data-page-open-continuous]`, zero zoom buttons in the Page surface |
| Rename/Reveal reachable from the tab context menu; palette/menu commands still work | **Pass** | Test 1: tab menu has “Rename document…” (opens the Rename dialog) and “Reveal in Finder”; palette still reaches Settings; e2e renames through the tab menu |
| No document, read-only, recovery, Page Edit, export, narrow window unchanged; no pageErrors | **Pass** | `m4e1` zero-document Settings, `m4b1a2` read-only gating, `m4b1b1` Page Edit, `m4d2` export UI, `m2-shell` 200 % zoom, recovery suite 14/14, `m4c3` PDF gate; zero pageErrors |
| No new dependency; no settings schema change; no Page/PDF change | **Pass** | `package.json` scripts only; settings tests untouched; `m4c3`/print parity pass |
| New UI suite passes; affected suites pass; `verify:fast` passes with real timings | **Pass** | Section 3 |
| Screenshots exist; report maps each criterion | **Pass** | `artifacts/v0-shell/*.png`; this table |

## 5. Decisions and notes

- **Palette/native View-menu parity (small diff taken).** Zoom in/out, Actual size, and Fit width
  now resolve through the same layout-aware helper as the TopBar and keyboard. In Page they act on
  Page view state; previously they always changed Continuous zoom. `Fit page` remains a
  TopBar-menu-only command (no palette/menu entry added, per the “no parity overhaul” non-goal).
- **Page zoom display.** The TopBar shows the stored `pageZoom`; `PageView` already syncs it to the
  effective fit zoom, so fit page/width update the control without a second view-state field.
- **Narrow sidebar.** The TopBar reveal button appears when the user explicitly collapses the
  sidebar. A narrow window auto-hides the panel (existing behavior, no preference overwrite) but
  does not render a dead reveal control; a narrow drawer/rail is V1.
- **Tab close.** The focusable “Close current tab” action stays in the tab actions cluster; the
  per-tab `×` remains the mouse affordance. Putting an exposed button inside `role=tablist` would
  violate the required-children rule; keyboard close stays `⌘W`/Delete/that action.
- **“Graphite”** is removed from the sidebar footer (V0 scope). The Settings > Data & About copy
  still mentions the theme name; Settings content is a V1 redesign item and was not edited.
- **New note copy.** Both visible entries use the accessible label/title “New note”; the palette
  command keeps “New document” until the V2 copy/parity pass.

## 6. Open questions / risks

- Narrow-window sidebar reveal (drawer vs. no control) needs a product decision in V1.
- Sidebar header at the 208 px minimum is tight (Search + New note label + collapse). V1 can switch
  New note to icon-only at small widths or use a container query.
- The TopBar tab strip can still scroll internally when many tabs are open (unchanged); an
  overflow chevron already lists all tabs.
- The palette “New document” / in-app “New note” copy difference is intentional-but-unfinished.

## 7. Next suggested step

V1 Settings shell: give the modal its frame, scope, and Appearance/Page/Continuous/Editor/Export/Data
sections from `docs/design/ui-settings-contents.md`, using the frozen settings inventory. Add the
PageToolbar Setup/Density popovers in the same slice only if the brief keeps them separate from the
Settings modal.
