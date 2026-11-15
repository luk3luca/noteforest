# S1 — Shell activity bar

**Role:** Builder
**Milestone:** post-phase 4 shell slice (S1; S2 = Document health view)
**Base:** the commit that adds this brief (docs commit on top of `d0e6871`)
**Worktree:** provided by the orchestrator harness; work only there
**Timebox:** 3 hours

## Context

The sidebar header still carries a Library/Outline segmented control. We replace it with a 48 px
vertical activity bar (Library, Outline, Health, Settings), like the approved design, so future
sections do not crowd the header and the collapsed sidebar stays useful. This slice also lands the
Library note/`.md` icon semantics and keeps the Settings divider in both sidebar states. Health is a
bridge to the existing sheet here; the in-sidebar Health view is S2.

Read:
- `docs/design/shell-activity-bar.md` (updated with the 15 November decisions)
- `docs/agents/roles.md` (Builder contract)

## Goal

One 48 px activity bar on the left of the sidebar, present when the sidebar is expanded and when it
is collapsed, with Library/Outline as a vertical tablist, Health as an action that opens the
existing Document health sheet, Settings at the bottom with a divider in both states, and the
Library/Outline segmented control removed.

## In scope

1. **Bar**: 48 px, full height, left edge of the sidebar. Always visible: expanded and collapsed.
   Expanded total = `48 + content`; collapsed = 48.
2. **Sections**: Library and Outline are a vertical `tablist` of 28×28 icon buttons (17 px icons,
   8 px gaps). Active = filled icon + `surface-2` background + `text-1`. **No accent stripe or edge
   indicator.** Tooltips and `aria-label` per button.
3. **Health**: a third icon button between the tablist and Settings that calls the same command as
   the palette entry (dialog kind `anchor-health`, no filter). In S1 it is an **action**, not a tab:
   it must not persist a section and there is no empty Health panel. S2 promotes it to a tab.
4. **Collapse**: chevron at the bar top; `⌘\` unchanged; the bar never hides. Clicking a section
   while collapsed expands the sidebar to that section. `aria-expanded`/`aria-controls` kept.
5. **Settings**: moves from the sidebar footer to the bar bottom, same icon button, `⌘,` unchanged.
   Remove the footer row. **A 1 px `border-1` divider above the Settings group is visible in both
   expanded and collapsed states** (it replaces the footer rule; the user asked for it explicitly).
6. **Remove** the Library/Outline segmented control and the header collapse button. The header keeps
   the search button (`⌘K`) and its 44 px height.
7. **State**: `sidebarTab` stays `'library' | 'outline'` and persists exactly as today; the
   segmented-control keyboard model moves to the bar tablist (Up/Down/Home/End, roving tabindex,
   automatic activation). No new global shortcuts.
8. **Width**: `sidebarWidth` remains the **content** width (180 min / 264 snap / existing max). The
   rendered total is `48 + content` and collapse is 48. A persisted 264 must render a 264 content
   column, never 216. Either place the bar outside the resizable Panel (collapse the Panel to 0) or
   add 48 in rendering while storing the content width — choose the smaller diff and verify with a
   persisted 264.
9. **Library icon semantics**: note = `NotebookText`, `.md` = `FileText`. The `.md` row shows the
   `.md` suffix at the end of the title in `text-3`. Icon color: note `text-2`, `.md` `text-3` —
   never colour alone. `FileWarning` for unreadable stays. Add `data-library-icon="note|markdown"`
   on the icon so tests do not depend on lucide internals.
10. **Tests**: unit + UI updated/added (see below). Screenshots in the worktree `artifacts/`.

## Out of scope

- Document health view, sections, panel, badge, sheet retirement (S2).
- The global pill/reference-label pass (parked by the product owner).
- Find bar, Page/PDF, library behaviour, drag/drop, new shortcuts, spec/UX/ADR changes.

## Files

Read:
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — tabs, header, footer, rail.
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` — resizable panel, collapse, width.
- `apps/desktop/src/renderer/src/state/shell.ts` — `sidebarTab`, `sidebarWidth`, `setSidebarTab`.
- `apps/desktop/src/renderer/src/state/session.ts` — persisted width/tab.
- `apps/desktop/src/renderer/src/styles.css` — tab strip, footer, rail, library rows.
- `tests/ui/v0-shell-frame.test.mjs` — sidebar tabs/box assertions.
- `tests/ui/library-surface.test.mjs` — tab persistence and library rows.
- `tests/ui/vault-library.test.mjs`, `tests/ui/ui-batch-a.test.mjs` — sidebar expectations.

Expected to touch:
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx`
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` (only if the width model requires it)
- `apps/desktop/src/renderer/src/styles.css`
- the tests above
- `docs/reports/activity-bar.md`

## Acceptance criteria

- [ ] Expanded: bar on the left with Library (active), Outline, Health, Settings at the bottom with
      a divider above it; no segmented control in the header; no Settings row in a footer.
- [ ] Collapsed: 48 px bar with the same three icons and Settings, **divider above Settings**,
      chevron to expand. Icon x is identical to the expanded state (assert, no shift).
- [ ] `⌘\` toggles; the canvas loses/gains exactly 48 px; a persisted 264 shows a 264 content column.
- [ ] Pointer and keyboard: Up/Down/Home/End move and activate Library/Outline; focus is visible;
      `aria-selected` and `role=tablist` are correct.
- [ ] Health opens the existing Document health sheet (or its no-document state) and leaves the
      active section unchanged.
- [ ] Library: note and `.md` differ by icon and `.md` suffix, not colour alone.
- [ ] Existing library/outline flows and all current sidebar tests pass; no pageerror.
- [ ] Gate: `npm run verify:fast` green with real timings.

## Tests and evidence

- Targeted during work: `npm test` (relevant unit files) and, after `npm run build`,
  `npm run test:ui:shell`; add the new assertions to the sidebar/library UI file(s).
- End of task: `npm run verify:fast`.
- Evidence: screenshots of expanded (Library), Outline, collapsed rail with the Settings divider,
  and the Library rows (folder, note, `.md`) under `artifacts/activity-bar/`.
- No native OS dialogs in tests; no fixed sleeps; do not weaken existing assertions.

## Stop and ask

Stop and report instead of inventing a decision when:
- the width model cannot preserve the stored content width without a session migration;
- the Health bridge would require changing the command layer or the dialog API;
- a baseline test fails for an unrelated reason;
- the fix needs a spec/UX/ADR change.

## Report format

- Summary: what changed and why.
- Files changed.
- Checks run, with real timings.
- Acceptance criteria: pass/fail per item.
- Open questions / risks.
- Next suggested step.

Write the report to `docs/reports/activity-bar.md`, commit once in the worktree, do not merge, and
report the worktree path and the commit hash.
