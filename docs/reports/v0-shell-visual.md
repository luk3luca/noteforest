# V0 visual shell — implementation report

**Role:** Builder / Implementer
**Milestone:** UI rework V0 visual pass (browser-lab port)
**Branch:** `t3/2e58f811`
**Base:** `design/ui-map` head `429cb0f` (the commit containing `docs/tasks/v0-shell-visual.md`)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-2e58f811-9558efb4b5b92f8b`
**Date:** 10 November 2026

---

## 1. Summary

The Electron V0 shell now follows the browser-lab direction while keeping all V0 behavior.

- **TitleBar / Toolbar split.** A new 30 px `TitleBar` holds only the native traffic lights
  (window overlay) and the app name; it has no tabs, no buttons, no Settings gear, and no sidebar
  reveal. A new 44 px `Toolbar` is the first panel of the main column, so the tab strip starts
  after the Sidebar and shifts with the collapsed rail. It contains the tab strip, tab actions
  (close current, New note, overflow), the layout-aware `ViewControls`, and the palette button.
  The merged `TopBar` is deleted.
- **Persistent sidebar.** The Sidebar is a rounded 264 px resizable panel that stays mounted as a
  **48 px rail** when collapsed (expand at the top, Settings at the bottom). The toolbar/tabs
  shift to the rail edge. A narrow window auto-collapses to the rail without overwriting the
  persisted preference; the rail expand is a temporary override there. Width and collapsed state
  persist in the existing session. The header is Search + icon-only New note + collapse; Library
  has an icon-only `+` beside its count; the footer is a container with a Settings button (not a
  full-width button) and room for future items.
- **Floating panel visual line.** Shell background behind the panels, 8 px gaps, 8 px panel radii,
  1 px borders, one quiet level (no shadows/gradients). Sidebar, Toolbar, Canvas, and StatusStrip
  are separate rounded panels; the old full-bleed rules (TopBar bottom border, sidebar footer
  border, section dividers, tab `border-right`, PageToolbar bottom border, StatusStrip border-top)
  are gone.
- **Tabs** are 34 px rounded chips (7 px radius, 4 px gap, active border) without vertical rules;
  activate/close/middle-click/drag/overflow/dirty/lock/recovery are unchanged.
- **StatusStrip** is a floating 24 px bar inset by 8 px with a full 1 px border and 6 px radius;
  it keeps save state, word/block counts, and anchor health only.
- **Continuous note cards** use a new Continuous-only 9 px `noteRadius` token. Page cards, the
  Page sheet, Page Edit prose, and print styles keep the shared 4 px `cardRadius`.
- **PageToolbar** is a softened transparent 38 px bar inside the canvas panel: nav + counter +
  Export only, no bottom rule. Page and PDF layout/content are untouched.

No new dependency, no settings/schema change, no Page/PDF behavior change.

## 2. Files changed

Source:

- `apps/desktop/src/renderer/src/App.tsx` — renders `TitleBar` instead of `TopBar`.
- `apps/desktop/src/renderer/src/shell/TitleBar.tsx` *(new)* — 30 px traffic-light/app-name strip.
- `apps/desktop/src/renderer/src/shell/Toolbar.tsx` *(new)* — 44 px main-column toolbar.
- `apps/desktop/src/renderer/src/shell/TopBar.tsx` *(deleted)* — merged bar removed.
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` — body row (Sidebar panel + main column),
  Toolbar + rounded Canvas panel, collapsible Panel rail, width restore on expand, narrow override.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — rail variant (expand + Settings), icon-only
  header New note, Library count + icon `+`, footer container with the Settings button.
- `apps/desktop/src/renderer/src/shell/TabBar.tsx` — toolbar button class, `data-toolbar-new`,
  comment; tab behavior unchanged.
- `apps/desktop/src/renderer/src/shell/StatusBar.tsx` — comment only.
- `apps/desktop/src/renderer/src/shell/ViewControls.tsx`, `lib/view-zoom.ts` — comments only.
- `apps/desktop/src/renderer/src/page/PageView.tsx` — no change; the softened container is CSS.
- `apps/desktop/src/renderer/src/styles.css` — shell palette/radii, TitleBar/Toolbar, chip tabs,
  floating panels/gaps, rail, sidebar header/footer/library `+`, floating StatusStrip, softened
  PageToolbar, Continuous note radius.
- `apps/desktop/src/renderer/src/lib/design-tokens.ts` — `noteRadius: 9` and `--nf-note-radius`.

Docs:

- `docs/design-tokens-continuous.md` — documents the new `noteRadius` token/variable.
- `docs/reports/v0-shell-visual.md` — this report.

Tests and evidence:

- `apps/desktop/test/design-tokens-css.test.ts` — expects `--nf-note-radius: 9px`, the Continuous
  card radius, and Page cards on the shared `--nf-card-radius`.
- `tests/ui/v0-shell-frame.test.mjs` — rewritten V0 visual acceptance suite (5 tests): titlebar/
  toolbar split + tabs after sidebar, persistent rail + expand/Settings + width/collapsed
  persistence + `⌘\`, floating panels/status/note radius, status-only strip + softened PageToolbar,
  layout-aware zoom.
- `tests/ui/m2-shell.test.mjs` — 200 % zoom asserts the 48 px rail; scroll restore uses the real
  canvas end (the shorter floating canvas clamped the old literal).
- `tests/ui/m2-view.test.mjs` — token geometry expects the Continuous 9 px note radius and the
  `--nf-note-radius` variable.
- `tests/visual/m2-screenshots.test.mjs` — 200 % zoom waits for the rail.
- `tests/e2e/m2-editor.test.mjs` — New note selector now targets `.nf-toolbar-button`.

Screenshots (`artifacts/v0-shell-visual/`, generated by the UI suite; `/artifacts/` is ignored):

- `expanded-shell-1440x900.png`
- `collapsed-rail-1440x900.png`
- `page-toolbar-1440x900.png`

## 3. Checks run (real timings)

| Check | Result | Time |
|---|---|---|
| `npm run check:boundaries` | pass — 168 files, 819 imports, 16 rules | 0.40 s |
| `npm run typecheck` | pass (desktop, core, layout, pdf) | 4.92 s |
| `npx vitest run` (all unit) | 103 files / 1025 tests pass | 3.4 s wall (2.72 s tests) |
| `node --test tests/ui/v0-shell-frame.test.mjs` | 5/5 pass | included below |
| `node --test tests/ui/v0-shell-frame.test.mjs tests/ui/m2-shell.test.mjs tests/ui/m2-view.test.mjs` | 11/11 pass | 13.8 s |
| `node --test tests/ui/m4b1-page-view.test.mjs tests/ui/m4b1a2-read-mode-gating.test.mjs tests/ui/m4b1b1-page-edit-overlay.test.mjs` | 19/19 pass | 16.3 s |
| `node --test tests/ui/m4e1-settings-platform.test.mjs tests/ui/m4d1-page-density.test.mjs tests/ui/m4d2-export-ui.test.mjs tests/ui/r1b-page-settings.test.mjs` | 18/18 pass | 19.2 s |
| `node --test tests/ui/m4c1-print-compositor.test.mjs tests/ui/r2j-page-callout-modes.test.mjs` | 11/11 pass | 12.3 s |
| `node --test tests/ui/m4c3-pdf-gate.test.mjs` | 3/3 pass | 19.7 s |
| `node --test tests/ui/m3-anchor-outline.test.mjs tests/ui/m3h3-live-health.test.mjs` | 3/3 pass | 11.3 s |
| `node --test tests/e2e/m2-editor.test.mjs` | 16/16 pass | 44.1 s |
| `node --test tests/visual/m2-screenshots.test.mjs` (on demand) | 5/5 pass | 20.5 s |
| `npm run test:recovery:run` | 14/14 pass | 17.8 s |
| `npm run verify:fast` (one run) | pass: boundaries, typecheck, 1025 unit, build, 16 e2e | **52.8 s wall** |

No pageErrors in the new or affected UI suites. No native dialog is opened by the new tests.
Screen captures are page screenshots only; no screen recording.

## 4. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| TitleBar is a thin traffic-light/app-name strip; tabs are not in it | **Pass** | `.nf-titlebar` is one 30 px direct child of `.nf-app`, text `NoteForest`, zero tablists and zero buttons; `data-sidebar-reveal` is gone |
| Toolbar is in the main column, starts after the sidebar, shifts with the 48 px rail | **Pass** | `.nf-main-column > [data-toolbar]` is one 44 px panel; toolbar left − sidebar right = 8 px; tablist left > sidebar right; after collapse both move left by >100 px and sit 8 px after the rail |
| Sidebar is a persistent rounded panel; rail has expand + Settings; no titlebar reveal; width/collapsed persist; `⌘\` works | **Pass** | Panel stays mounted as a 48 px rail; expand top / Settings bottom (top < bottom and pinned); titlebar has no buttons; drag widens and the width survives relaunch; collapse survives relaunch; `⌘\` collapses and expands; typing still saves while collapsed (editor stays mounted) |
| Tabs are rounded chips; note cards (Continuous only) are rounded; no full-bleed hard rules at intersections | **Pass** | Chip 34 px, 7 px radius, 4 px gap, active 1 px border, no vertical rules; `.nf-block-body` 9 px; `.nf-page-card` still 4 px; panels are inset rounded surfaces with no topbar/status/page-toolbar full-width rules |
| Settings is a button inside the footer container; Library has an icon-only `+`; header New note remains icon-only | **Pass** | Footer has one Settings button narrower than 75 % of the footer plus a spacer; Library `+` is icon-only and opens a note; header New note has empty text and an accessible label |
| StatusStrip is a floating bar with save/counts/anchor health only | **Pass** | 24 px, 6 px radius, 1 px border on all four sides, 8 px insets, 8 px below the canvas; `role=status` save state, words, blocks, health button, zero layout/mode/zoom/focus/path buttons |
| PageToolbar container is softened; no Page/PDF layout or content change | **Pass** | `border-bottom-width: 0`, transparent background, inside `.nf-canvas-panel`; nav/counter/Export unchanged; Page card radius 4 px; print compositor and 61-page PDF gate suites pass |
| All V0 behavior and tests preserved; new/updated UI coverage passes; `verify:fast` green | **Pass** | V0 suite 5/5, m2 11/11, page 19/19, settings/density/export 18/18, print 11/11, PDF 3/3, outline/health 3/3, e2e 16/16, recovery 14/14, visual 5/5; `verify:fast` 52.8 s |
| No new dependency/schema; screenshots exist; report maps criteria | **Pass** | `package.json` unchanged; settings/schema untouched; three screenshots under `artifacts/v0-shell-visual/`; this table |

## 5. Decisions and notes

- **One collapsible Panel, not two layouts.** The resizable Group stays mounted and the sidebar
  Panel is `collapsible` with `collapsedSize={48}`. Collapsing therefore never remounts the
  editor (typing/scroll survive), and the toolbar keeps tracking the sidebar width.
- **Persisted width is the expand source of truth.** react-resizable-panels does not remember an
  expand size when the panel is collapsed before its first layout (relaunch while collapsed).
  Expanding explicitly `resize`s to the persisted `sidebarWidth` (208–360), so a dragged width
  survives quit/relaunch.
- **Narrow window.** At `<820 px` the sidebar auto-collapses to the rail without writing the
  session preference. The rail expand sets a local override so a narrow user can still open it;
  a proper narrow drawer is a V1 decision. The m2 200 % zoom test now asserts the rail (48 px)
  and no horizontal overflow.
- **Continuous note radius is a separate token.** `noteRadius`/`--nf-note-radius` is referenced
  only by `.nf-block-body`; `cardRadius`/`--nf-card-radius` remains the shared image/Page/print
  radius. The design-token guard test and the UI suite both pin the 9 px/4 px split.
- **Status health is plain warning text**, not a bordered pill, matching the lab and the existing
  “no colored status pills” anti-slop guidance. Its data attributes, label, and click path are
  unchanged.
- **Scroll-restore test change.** The floating shell canvas is ~70 px shorter, so the old literal
  `scrollTop = 420` was unreachable (clamped to the real maximum) and the restored focus offset
  then exceeded the 80 px tolerance. The test now scrolls to the real canvas end and selects the
  last card; the numeric restore assertion and tolerance are unchanged in strength.
- **`⌘\` and the menu-command dedupe.** `App.dispatch` drops a repeated menu command inside
  120 ms. The rail test alternates keyboard and button toggles (and a real edit/autosave) instead
  of pressing `⌘\` twice within that window, so it exercises both directions without weakening
  the shortcut assertions or adding fixed sleeps.

## 6. Open questions / risks

- **Native traffic-light vertical position (needs Orchestrator/product approval).** The window is
  `titleBarStyle: 'hiddenInset'` with `trafficLightPosition: { x: 16, y: 14 }`, tuned for the old
  44 px bar. In a 30 px TitleBar the lights still fit but sit ~5 px below the app-name center. The
  centered value would be `y: 9`–`8`. That is a main-process/window-style change, which the brief
  reserves (“stop and ask”), so this branch is renderer-only. Recommend one line in integration:
  `trafficLightPosition: { x: 16, y: 9 }`.
- **Narrow rail expansion** is a temporary override, not a drawer; expanding at very small widths
  can crowd the main column (the shell clips, no page scroll). A narrow drawer is a V1 decision
  already listed in the V0 report.
- The library filter stays inside the Library section (lab has no filter); it keeps the existing
  behavior and is independent of the new `+`.
- `docs/design/ui-shell-map.md` revision text and the shell contents doc already describe this
  direction; only the token doc needed the new row.

## 7. Next suggested step

Orchestrator: run the full `npm run verify`, review the three screenshots, and merge into
`design/ui-map` (not `main`). If the traffic-light offset is accepted, apply the one-line
`trafficLightPosition: { x: 16, y: 9 }` window change and re-capture the expanded-shell screenshot.
Then start V1 Settings on top of this branch.

## 8. Integration

- Orchestrator full `npm run verify` on `design/ui-map`: **exit 0** — 103 unit files / 1025 tests,
  16 e2e, 14 recovery, **39 UI suites / 138 tests**, 0 pageErrors.
- The native traffic-light offset was accepted and applied in integration:
  `trafficLightPosition: { x: 16, y: 9 }` (`779c7fb`), centered in the 30 px titlebar.
- The branch was merged into `design/ui-map` (not `main`); screenshots regenerated under
  `artifacts/v0-shell-visual/`.
- The browser lab was realigned to the merged shell (filter row, Add block, native-like titlebar
  spacing) and committed on the design branch.
