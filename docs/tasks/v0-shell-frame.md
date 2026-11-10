# V0 — Shell frame (TopBar, Sidebar, Canvas, PageToolbar, StatusStrip)

**Role:** Builder / Implementer  
**Milestone:** UI rework V0  
**Base:** `design/ui-map` head at delegation time (the commit containing this brief)  
**Worktree:** provided by the T3 delegation; do not work in the parent checkout  
**Timebox:** 2 days

## Context

The design phase is accepted: the target shell is three regions + overlays (TopBar, Sidebar,
Canvas, StatusStrip), with the Settings/Export/overlay content slices documented. V0 is the first
real shell: one visible chrome with duplicate controls removed, existing behavior preserved, no
new settings schema. Read:

- `AGENTS.md` — rules and current state.
- `docs/design/ui-shell-map.md` — structure, D-01…D-13.
- `docs/design/ui-shell-contents.md` — TopBar, Sidebar, StatusStrip.
- `docs/design/ui-page-contents.md` — PageToolbar and Page frame (V0 uses only nav/export).
- `docs/design/ui-references.md` — design line; do not copy a library skin.
- `docs/design-tokens-continuous.md`, `docs/design-tokens-page.md` — existing tokens.
- `research/ui-surface-map.md` — current components/commands (as-is).
- `apps/desktop/src/renderer/src/shell/TitleBar.tsx`, `TabBar.tsx`, `Workspace.tsx`,
  `Sidebar.tsx`, `StatusBar.tsx`, `page/PageView.tsx`, `App.tsx`, `state/shell.ts`, `actions.ts`,
  `styles.css`.
- `tests/ui/m2-shell.test.mjs`, `m2-view.test.mjs`, `m4b1-page-view.test.mjs`,
  `m4b1a2-read-mode-gating.test.mjs`, `m4d1-page-density.test.mjs`, `m4d2-export-ui.test.mjs`,
  `m4e1-settings-platform.test.mjs`, `r1b-page-settings.test.mjs` for the harness and assertions.

## Goal

The app shows one **TopBar** (traffic lights + document tabs + new + view controls + palette), one
**Sidebar** (search/new/collapse; library/topics; single Settings entry), the **Canvas**
(Continuous/Page), a contextual **PageToolbar** (page nav + export), and a minimal **StatusStrip**
(save/counts/anchor health). No duplicate layout/mode/zoom/Settings controls; no new settings
schema; existing behavior preserved.

## In scope

1. **Merge TitleBar + TabBar into TopBar.**
   - One bar, 44 px: macOS traffic lights inset; tab strip; `+`; view controls; palette button.
   - The active tab title is the document identity. No separate app-name/title row.
   - Remove the TitleBar Settings gear. Keep the palette button.
   - Keep tab behavior: activate, close, middle-click, drag reorder, overflow, dirty dot, lock,
     recovery, close dialog, keyboard.
   - Add **Rename document…** and **Reveal in Finder** to the tab context menu (the old
     titlebar/document-title button and status path link are removed; the palette commands remain).
   - Empty TopBar areas remain the window drag region; controls/tabs are no-drag.
2. **ViewControls in TopBar (variant A: words).**
   - Layout `Continuous | Page`; mode `Edit | Read`; zoom `− 100% +` + a small menu with Actual /
     Fit width (Continuous) and Actual / Fit page / Fit width (Page).
   - Layout-aware: in Page use `setDocumentPageZoom` / `setDocumentPageFit`; in Continuous use the
     existing Continuous zoom/fit path. Do not change hidden Continuous zoom while in Page.
   - Use the existing keyboard behavior as the reference; extract/share a small layout-aware helper
     so keyboard and TopBar agree. If the menu/palette can reuse it with a small diff, do so;
     otherwise leave the menu/palette parity for V2 and note it.
   - Keep `data-view-layout`, `data-view-interaction` attributes and `aria-pressed`; add page-fit
     test hooks. Labels collapse to icons at narrow widths; no horizontal scroll at 960 px.
   - Remove the duplicate layout/mode/zoom controls from StatusBar.
3. **Sidebar.**
   - Header: Search (opens palette) + New note + collapse toggle; both TopBar `+` and sidebar New
     note remain, same command/label/shortcut.
   - Footer: Settings gear + “Settings” label; remove the static “Graphite” label.
   - Collapse: hidden + reveal. When collapsed, the panel disappears and a labelled reveal button
     appears at the left of TopBar (after traffic lights); `⌘\` toggles. Width/collapsed persist.
   - Keep the resizer (208–360, default 264), library filter/rows, topics tree, row menus, rename,
     collapse, recovery/missing states.
4. **StatusStrip.**
   - Keep save state (dot + label, `role=status`, `aria-live`, `data-save-state`), word count,
     block count, and the anchor-health button when >0.
   - Remove layout/mode/zoom/focus/path/theme buttons and the static “Dark” label. Focus branch
     remains available via `⇧⌘F` and the palette; reveal/path via the tab menu and Settings.
5. **PageToolbar.**
   - Keep page navigation and Export. Remove page zoom/fit/actual (now TopBar) and the
     “Open in continuous editor” button (the Page fragment Enter/read path remains; do not add a new
     command). No Setup/Density yet (V1).
   - Use the existing export flow; do not redesign the export panel.
6. **Preserve behavior.**
   - `⌘\`, `⌘2`/`⌘3`, `⌘E`, `⌘K`, `⌘,`, `⌘N`, `⌘W`, `⇧⌘E`, save, page nav, Page Edit, export,
     read-only gating, recovery, no-document, narrow window.
   - Settings opens from sidebar footer, `⌘,`, palette, and native menu. Help → Keyboard shortcuts
     keeps its current behavior (V2 will point it at Editor > Shortcuts).
   - No new settings/export schema; Appearance/Page Setup/Density popovers/Export sheet are later.
   - No visual token overhaul: use existing tokens/classes; add only the minimal CSS for the new
     bar heights/layout. No new dependency.
7. **Tests.**
   - Add `tests/ui/v0-shell-frame.test.mjs` (harness pattern from `m2-shell`/`m4b1-page-view`):
     - one TopBar; tabs/new/ViewControls/palette; no top-right Settings gear;
     - sidebar single Settings entry, no “Graphite”; collapse/reveal and `⌘\`;
     - StatusStrip has no layout/mode/zoom/focus/path/theme buttons; save/counts/anchor health;
     - layout/mode/zoom from TopBar in Continuous and Page; Page zoom/fit changes Page view state,
       not Continuous `zoom`;
     - PageToolbar has page nav + Export, no zoom/fit/open-in-continuous;
     - tab context menu has Rename/Reveal; no pageErrors.
   - Add the suite to `test:ui` and `verify` in `package.json`.
   - Update affected existing unit/UI tests; do not weaken assertions. Search for
     `nf-statusbar`, `nf-titlebar`, `data-view-layout`, `data-view-interaction`, Graphite, Settings,
     Page toolbar zoom/fit, and the status-bar path/theme.
   - Screenshots under `artifacts/v0-shell/` (TopBar, collapsed sidebar, Page toolbar).

## Out of scope

- Settings modal IA/Appearance, Page Setup/Density popovers, Export sheet redesign.
- Command registry/menu/palette parity overhaul (V2), Help → Editor > Shortcuts.
- New settings fields, `settingsVersion` bump, Appearance, theme/colors/fonts.
- Visual token pass, motion, A/B variants, manual breaks.
- Page sheet/PDF layout, anchors/callouts, Page Edit content behavior.
- Spec/UX/ADR/plan/AGENTS changes (report only).

## Files

Read: the docs above; `shell/TitleBar.tsx`, `TabBar.tsx`, `Workspace.tsx`, `Sidebar.tsx`,
`StatusBar.tsx`, `page/PageView.tsx`, `App.tsx`, `state/shell.ts`, `actions.ts`, `styles.css`,
`shared/view-state.ts`, affected tests.

Expected to touch:
- `apps/desktop/src/renderer/src/App.tsx`
- `shell/TitleBar.tsx` (remove/refactor), `TabBar.tsx`, `Workspace.tsx`, `Sidebar.tsx`,
  `StatusBar.tsx`, new `shell/TopBar.tsx` and `shell/ViewControls.tsx`
- `page/PageView.tsx`
- `state/shell.ts` / `actions.ts` only if the shared zoom/fit helper needs it
- `styles.css`
- `apps/desktop/test/*` affected unit tests
- `tests/ui/v0-shell-frame.test.mjs` and affected `tests/ui/*`
- `package.json` (suite lists)
- `docs/reports/v0-shell-frame.md`

Do not touch main/preload unless a blocking window issue requires it; stop and ask first.

## Acceptance criteria

- [ ] One TopBar: traffic lights, tabs, new, ViewControls, palette; no separate title row; no
      Settings gear in the bar.
- [ ] Sidebar has Search/New/collapse, library/topics, and **one** Settings entry in the footer;
      “Graphite” is gone; collapse hides the panel and reveals it from TopBar; `⌘\` works.
- [ ] StatusStrip contains only save state, word/block counts, and anchor health; no
      layout/mode/zoom/focus/path/theme buttons.
- [ ] TopBar layout/mode/zoom work in both layouts; Page zoom/fit changes Page view state and never
      the hidden Continuous zoom; Continuous zoom/fit still works.
- [ ] PageToolbar has page nav + Export only; no zoom/fit/open-in-continuous.
- [ ] Rename/Reveal remain reachable from the tab context menu; the palette/menu commands still
      work.
- [ ] No document, read-only, recovery, Page Edit, export, narrow window unchanged; no pageErrors.
- [ ] No new dependency; no settings schema change; no Page/PDF change.
- [ ] New UI suite passes; affected suites pass; `npm run verify:fast` passes with real timings.
- [ ] Screenshots exist; report maps each criterion.

## Tests and evidence

- Targeted during work: `npm run check:boundaries`, `npm run typecheck`, relevant unit tests,
  `node --test tests/ui/v0-shell-frame.test.mjs`, affected UI suites.
- End of task: `npm run verify:fast` (one run) with timings.
- Integration (Orchestrator only): `npm run verify`.
- App evidence: `artifacts/v0-shell/` screenshots; no screen recording.
- No native OS dialog may block a test; no fixed sleeps; do not weaken existing assertions.
- Tests must prove the layout-aware Page zoom (not just that a button exists).

## Stop and ask

Stop and report instead of inventing a decision when:

- merging the titlebar/tabs needs a main-process/window-style change beyond CSS/HTML;
- the Page zoom/fit needs a store/schema change beyond the existing `setDocumentPageZoom`/
  `setDocumentPageFit`;
- a baseline test fails for an unrelated reason;
- a native dialog would be needed;
- the change would require a new dependency or alter Page/PDF output;
- a product decision is missing (e.g., tab rename affordance beyond the context menu).

## Report format

- Summary: what changed and why.
- Files changed.
- Checks run, with real timings.
- Acceptance criteria: pass/fail per item.
- Worktree, branch, head SHA.
- Open questions / risks.
- Next suggested step (V1 Settings shell).
