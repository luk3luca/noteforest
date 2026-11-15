# S2 — Document health in the sidebar + repair modal

**Role:** Builder
**Milestone:** S2 (after the S1 activity bar)
**Base:** HEAD of `main` (the docs commit that adds this brief)
**Worktree:** provided by the orchestrator harness; work only there
**Timebox:** 6 hours

## Context

The activity bar now hosts Library/Outline and a temporary Health bridge that opens the v1 sheet.
This batch turns Health into a real section of the sidebar and replaces the sheet with a 520 px
repair modal. It also restores the full-width Settings footer in the expanded sidebar (S1
follow-up: the user wants the bottom bar that Settings occupied back when the sidebar is expanded).

Design:
- `docs/design/document-health-sidebar.md` — the S2 surface.
- `docs/design/shell-activity-bar.md` — S1 bar, §3 Settings behaviour (updated).
- `docs/design/document-health-ui-lab/` — the approved lab (single modal chosen).

## Goal

Health is a sidebar section with grouped, expandable issues; clicking an issue opens a 520 px
modal with the context, the choices and one undoable repair; Confirm closes it and the sidebar
updates. The v1 sheet is retired.

## Part A — Settings footer (S1 follow-up)

- **Expanded sidebar**: restore the full-width footer row at the bottom of the sidebar card: a
  1 px `--border-1` divider above it and the Settings button (gear + `Settings` label) exactly as
  before S1. It spans the whole card, not the 48 px bar.
- **Collapsed sidebar**: the 48 px bar keeps its own bottom group (divider + gear icon, no label).
- One Settings button per state, `⌘,` unchanged, focus restore after closing the sheet unchanged.
- The bar's own foot group must not render in the expanded state (no duplicate gear).

## Part B — Health section

### Bar and state

- Promote Health from an action to a **third tab** in the vertical tablist (Library, Outline,
  Health): `role="tab"`, `aria-selected`, roving tabindex and Up/Down/Home/End extended to it;
  `sidebarTab` becomes `'library' | 'outline' | 'health'` and persists in the session.
- **Badge**: needs-repair count (`broken + ambiguous + unlinked mark + structure rows that need
  repair`, i.e. the audit's `counts.needsRepair`) as a small **square counter** (radius 2, tabular
  number), hidden at 0; `aria-label` “3 anchors need repair”. Not a pill.
- Clicking Health while collapsed expands the sidebar on the Health section.

### Sidebar view

- Header: `Health`, summary `3 to fix · 7 issues`, then the existing 28 px search pattern.
- **Sections** (confirmed): `Anchors to fix` (broken, ambiguous, unlinked mark — **open by
  default**), `Unused anchors` (idle, unused anchor), `Structure` (missing target, unreachable
  block, two primary parents, loop, empty chapter), `Hidden` (marker hidden by a collapsed
  ancestor). Empty sections do not render.
- Section row: chevron + name + count (30 px). Error row: quote (truncated) + branch count when
  above 0 (27 px). No per-row action button, no severity pill, no left accent stripe.
- Open sections persist per session; the selected row survives closing the modal.
- Search filters rows across sections and auto-expands matching sections.
- Footer: `Check again`.
- States: all clear (`No issues found` + information counts), no document, Read mode (rows open the
  modal, mutations disabled with one line of why), rejected command (reason in the modal).

### Repair modal (520 px)

- Opened by a row. Header: `Document health` + the issue category, close. Body: severity icon +
  word (`Data risk / Needs repair / Information`), kind, quote, `block · chapter`, reason; matching
  locations (candidate rows, one selected); branches; category-specific actions.
- Footer: `Show in note` · `Close` · the primary action.
- Confirm: Before/After, “one undo entry”, `Back` + `Confirm repair`. `Back` returns to the issue;
  `Esc` follows the same stack (confirm → issue → close); focus returns to the row in the sidebar.
- **Confirm closes the modal**: the command runs, the row leaves the list, an Undo toast appears.
  No “next”.
- `Show in note` closes the modal and reveals the block/term (expand ancestors; in Page go to the
  page) without changing the layout.
- Copy from the design doc §5: `Remove mark`, `Keep branches, remove anchor…`, `Recreate link from
  selection`, `Link to current selection`, `Preview repair` / `Confirm repair`, `Unlinked mark`,
  `Unused anchor`, `Show in note`.

### Entry points

- Status-bar health chip, palette `Document health`, and the block lost-anchor chip all open the
  Health section. When an anchor is known (block chip, status chip), select that row and open its
  modal; otherwise open the section with `Anchors to fix` expanded.

### Retirement

- Remove `DocumentHealthDialog` / `DocumentHealthEmptyDialog`, the `anchor-health` dialog kind, and
  their sheet-specific UI. Keep `lib/document-health.ts`, `lib/anchor-health.ts`, the repair
  commands and the audit.
- The Health section must cover **every v1 action** (design doc §4 table): nothing is dropped, no
  category loses its fix or its guidance.

## Out of scope

- Reference chips, lost-anchor capsule and the remaining `999px` capsules (parked).
- The list + detail modal at 660 (parked).
- The Page fit-sync race (`PageView.tsx:480`) — separate follow-up, do not touch.
- Audit changes, new categories, spec/UX/ADR changes, new shortcuts.

## Files

Read:
- `apps/desktop/src/renderer/src/shell/DocumentHealthDialog.tsx` (v1 sheet to retire)
- `apps/desktop/src/renderer/src/lib/document-health.ts` (audit: categories, counts, labels)
- `apps/desktop/src/renderer/src/lib/anchor-health.ts` (candidates, previews, reasons)
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` (bar, sections, library rows)
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` (width/collapse)
- `apps/desktop/src/renderer/src/state/shell.ts` (`sidebarTab`, dialogs)
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx`, `StatusBar.tsx`, `actions.ts`,
  `editor/views/BlockViews.tsx` (entry points)
- `tests/ui/document-health.test.mjs` (rewrite), `tests/ui/library-surface.test.mjs` /
  `v0-shell-frame.test.mjs` (third tab + footer updates)

Expected to touch:
- `Sidebar.tsx`, `styles.css`, `state/shell.ts`, `state/session.ts` (accept `health`), `Dialogs.tsx`,
  `StatusBar.tsx`, `actions.ts`, `BlockViews.tsx`, new `shell/HealthSection.tsx` (or similar),
  `Frame`/dialog size, tests, `docs/reports/document-health-sidebar.md`.

## Acceptance criteria

- [ ] Expanded sidebar: full-width Settings footer with divider + label; collapsed: 48 px bar with
      divider + gear; never two Settings buttons; icon x stable across collapse.
- [ ] Health is a third tab with a square needs-repair counter (hidden at 0) and an accessible
      label; `sidebarTab: 'health'` persists across reload.
- [ ] Sections render as specified; empty ones hidden; `Anchors to fix` open by default; counts
      match the audit; search filters and expands.
- [ ] Clicking a row opens the 520 modal on that issue with the correct context; candidates select
      and preview; the confirm shows Before/After; `Back`/`Esc` return in the right order.
- [ ] Confirm applies one undoable command, closes the modal, removes the row, shows the Undo
      toast, and keeps the sidebar selection valid.
- [ ] Every v1 category and action is reachable (design doc §4); Read mode disables mutations with
      the reason; no document and all-clear states are correct.
- [ ] Status bar, palette and the block warning chip open the Health section (the block chip also
      selects and opens the issue).
- [ ] The v1 sheet and its dialog kind are gone; no dead code, no duplicated audit.
- [ ] Tests: `npm run verify:fast` green; `npm run test:ui:shell` green; the rewritten
      `document-health` UI suite covers sections, modal, confirm, close, Undo, read-only,
      no-document, badge and entry points. Screenshots in `artifacts/document-health/`.
- [ ] No pageerror; no regression in library/outline/settings/Page flows.

## Tests and evidence

- Targeted: `npm test`, `npm run build && npm run test:ui:shell`, then
  `node --test tests/ui/document-health.test.mjs` (rewritten).
- End of task: `npm run verify:fast`.
- Screenshots: sidebar sections (expanded), modal detail, confirm, read-only, all-clear, badge at
  zero and non-zero.
- No native dialogs in tests, no fixed sleeps, do not weaken assertions.

## Stop and ask

- if the session parser rejects `sidebarTab: 'health'` without a migration;
- if retiring the `anchor-health` dialog kind breaks an entry point that needs a new command;
- if the full-width footer conflicts with the collapsed bar’s measured geometry;
- if a v1 action has no home in the new surface;
- on any spec/UX/ADR change.

## Report format

Summary, files changed, checks with timings, acceptance criteria pass/fail, open questions/risks,
next step. Write `docs/reports/document-health-sidebar.md`, commit once in the worktree, do not
merge, and report the worktree path and the commit hash.
