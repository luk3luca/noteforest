# V0 visual — port the browser-lab shell to Electron

**Role:** Builder / Implementer  
**Milestone:** UI rework V0 visual pass  
**Base:** `design/ui-map` head at delegation (`71c5c2c` plus this brief's commit)  
**Worktree:** provided by the T3 delegation; do not work in the parent checkout  
**Timebox:** 1 day

## Context

The V0 shell frame is merged into `design/ui-map`. The product owner rejected the V0 visual
direction after seeing it in Electron and approved a browser-lab direction. The current lab at
`docs/design/ui-lab` is the **visual and structural reference**:

- `docs/design/ui-lab/src/Lab.jsx`
- `docs/design/ui-lab/src/lab.css`
- `docs/design/ui-lab/README.md`
- `docs/design/ui-shell-map.md` (revision 10 Nov 2026)
- `docs/design/ui-shell-contents.md` (revision note)

The user wants this direction in Electron **before** the Settings work:

- thin 30 px titlebar for traffic lights + app name;
- 44 px toolbar in the main column, starting after the sidebar; tabs are rounded chips;
- persistent sidebar column; collapsed = 48 px rail with expand at the top and Settings at the
  bottom; the toolbar shifts with it;
- rounded floating panels with 8 px gaps, not full-width hard rules;
- status strip as a floating bar;
- Settings as a button inside the sidebar footer, not the whole footer;
- a `+` in the Library section too.

**Page design remains open.** Do not redesign the Page sheet, Page content, or PDF. Only the shell
frame and the PageToolbar container surface may change.

## Goal

The Electron V0 workspace matches the lab's current shell structure and visual line, with behavior
unchanged and no new settings schema or dependencies.

## In scope

1. **Split the shell bar.**
   - New `TitleBar`: 30 px, native macOS traffic lights, app name, window drag region. No tabs, no
     Settings gear.
   - New `Toolbar`: 44 px, inside the main column, starting after the sidebar. Contains the tab
     strip, New note, `ViewControls`, and palette. No full-width hard rule.
   - Remove the merged `TopBar`; keep the ViewControls behavior layout-aware.
   - Tabs become rounded chips (34 px high, 7 px radius, 4 px gap, active border); no vertical
     border-right rules. Preserve activate/close/middle-click/drag/overflow/dirty/lock/recovery.
2. **Persistent sidebar.**
   - Sidebar is a rounded panel (264 px, 8 px gaps, 1 px border, 8 px radius), full height in the
     body. It is not unmounted when collapsed.
   - Collapsed state = 48 px rail with expand at the top and Settings at the bottom; the toolbar
     shifts to the rail edge. `⌘\` toggles; width/collapsed persist. No titlebar reveal.
   - Header: Search, icon-only New note, collapse. Library section gets a small icon-only `+`
     beside its count. Footer becomes a container with a Settings button (not a full-width button);
     leave room for future items.
3. **Floating panel visual line.**
   - Shell background behind the panels; 8 px gaps; 8 px radii; 1 px borders; one quiet elevation
     level; no gradients, glass, glow, or double borders.
   - Sidebar, Toolbar, Canvas, and StatusStrip are separate rounded panels. Remove full-bleed
     top/right/bottom border lines at their intersections.
   - StatusStrip: floating 24 px bar with inset 8 px, border/radius, no border-top; keep save/counts/
     anchor health.
   - Continuous note card surfaces: 9 px radius if they have a separate class; do not change Page
     cards, Page sheet, or print styles if the class is shared.
   - PageToolbar container: remove the hard full-width bottom rule and align it inside the canvas
     panel. Do not redesign Page or PDF.
4. **Behavior and tests.**
   - Preserve all V0 behavior: tabs, layout/mode/zoom, Settings entry, export, page nav, Page Edit,
     read-only gating, recovery, no document, `⌘\`, width/collapsed persistence.
   - Update the V0 UI suite and any affected tests for the new TitleBar/Toolbar/rail DOM. Do not
     weaken assertions. Add tests for: titlebar vs toolbar separation, tabs starting after sidebar,
     rail expand/settings, footer Settings button (not full footer), library `+`, floating status
     structure.
   - No new dependency, no settings/export schema change, no Page/PDF change.
5. **Evidence.**
   - Screenshots under `artifacts/v0-shell-visual/` (expanded shell, collapsed rail, Page toolbar).

## Out of scope

- Page design, Page sheet/PDF changes, Page content density.
- Settings modal IA/Appearance, Export sheet redesign, command registry/palette overhaul.
- New settings fields/migrations, theme/fonts, manual breaks.
- Spec/UX/ADR/plan/AGENTS edits (report only).
- Main/preload changes unless a blocking window-style issue requires it; stop and ask first.

## Files

Read:
- `AGENTS.md`, `docs/tasks/v0-shell-frame.md`, `docs/reports/v0-shell-frame.md`.
- `docs/design/ui-lab/src/Lab.jsx`, `docs/design/ui-lab/src/lab.css`, `docs/design/ui-lab/README.md`.
- `docs/design/ui-shell-map.md`, `docs/design/ui-shell-contents.md`.
- `apps/desktop/src/renderer/src/App.tsx`, `shell/TopBar.tsx`, `shell/ViewControls.tsx`,
  `shell/TabBar.tsx`, `shell/Workspace.tsx`, `shell/Sidebar.tsx`, `shell/StatusBar.tsx`,
  `page/PageView.tsx`, `styles.css`, `lib/view-zoom.ts`, affected tests.

Expected to touch:
- `App.tsx`, new `shell/TitleBar.tsx`, new `shell/Toolbar.tsx`, `shell/TopBar.tsx` (remove or
  split), `TabBar.tsx`, `Workspace.tsx`, `Sidebar.tsx`, `StatusBar.tsx`, `styles.css`,
  `page/PageView.tsx` (container only), affected unit/UI tests, `package.json` if the suite name
  changes, `docs/reports/v0-shell-visual.md`.

## Acceptance criteria

- [ ] TitleBar is a thin traffic-light/app-name strip; tabs are not in it.
- [ ] Toolbar is in the main column, starts after the sidebar, and shifts with the 48 px rail.
- [ ] Sidebar is a persistent rounded panel; rail has expand + Settings; no titlebar reveal; width/
      collapsed persist; `⌘\` works.
- [ ] Tabs are rounded chips; note cards (Continuous only) are rounded; no full-bleed hard rules at
      sidebar/toolbar/canvas/status intersections.
- [ ] Settings is a button inside the footer container; Library has an icon-only `+`; header New
      note remains icon-only.
- [ ] StatusStrip is a floating bar with save/counts/anchor health only.
- [ ] PageToolbar container is softened; no Page/PDF layout or content change.
- [ ] All V0 behavior and tests preserved; new/updated UI coverage passes; `verify:fast` green.
- [ ] No new dependency/schema; screenshots exist; report maps criteria.

## Tests and evidence

- Targeted during work: `npm run check:boundaries`, `npm run typecheck`, relevant unit tests,
  `node --test tests/ui/v0-shell-frame.test.mjs` plus affected UI suites.
- End of task: `npm run verify:fast` (one run) with timings.
- Integration (Orchestrator only): full `npm run verify`.
- App evidence: `artifacts/v0-shell-visual/` screenshots; no screen recording.
- No native dialogs, no fixed sleeps, no weakened assertions.

## Integration

The Orchestrator reviews, runs the full `npm run verify`, and merges this branch into
`design/ui-map` — **not `main`**. After that, V1 Settings starts from the revised design branch.

## Stop and ask

- The native traffic-light titlebar needs a main-process/window-style change.
- The persistent rail cannot be implemented without breaking the resizable-panel layout.
- A style change would alter Page/PDF output.
- A baseline test fails for an unrelated reason or a product decision is missing.

## Report format

- Summary; files changed; checks with real timings; acceptance pass/fail; worktree/branch/head;
  open questions/risks; next suggested step.
