# UI shell fixes — edge default, settings controls, sidebar, stale lock

**Role:** Implementer / Builder
**Milestone:** UI stabilization after R3 / palette batch
**Base:** the commit that adds this brief on `main` (`0bb64ae` plus the brief commit)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 8 hours

## Context

The product-owner review after the palette/Page/anchor batch found eight concrete issues. Two are
recovery bugs: orphaned lock files from deleted documents block **New note**, and the compressed
stale-lock bar has no takeover action. The rest are visual consistency fixes: the resting edge color
should be the current selected-edge color, Settings selects and segmented controls need one
geometry, top-level cards look over-padded, and the sidebar needs a real resize range with a snap
default and a left-anchored collapse control.

The Continuous edge style is CSS-only and must stay isolated from Page/PDF (the split already exists
in `edge-style.ts` / `--paper-*`). No schema or settings version changes in this batch.

## Goal

One worktree, four ordered commits, all eight fixes, one `npm run verify:fast`, targeted UI suites.

## In scope

### Commit 1 — Continuous edges: selected color is the resting color

- Make the **resting** Continuous primary edge the same accent color that selection uses today:
  `--edge: var(--accent-strong)` as one derived alias in the `:root` aliases block (near
  `--edge-active`), not a duplicated literal. Remove the per-theme literal `--edge` declarations.
- Keep the current selection semantics: selected path edges use `--edge-active` (same accent) and
  `--nf-edge-width-active` 1.75; every other edge is `--edge-muted` (existing 0.35 opacity). The
  selected card's accent ring remains the block cue. No new glow/animation.
- Add `--edge-reference` per theme with the previous neutral values (dark `#7b858f`, light `#6c7882`)
  and use it for `.nf-edge-reference`, `.nf-edge-reference-arrow` and their active variants' base
  stroke. Reference edges keep their dashed, lower-emphasis look; they must not become accent.
- Page/PDF must not change: the Page edge renderer reads `PAGE_EDGE_STYLE` and its own
  `.nf-page-*` classes, never `--edge`. Keep the existing edge-style isolation test and extend it if
  needed.
- Tests: update `appearance-css-guard` (the `--edge` alias is `var(--accent-strong)`,
  `--edge-reference` is the neutral literal, resting-edge contrast is satisfied by every accent's
  `strong` value against the canvas); update edge-class tests to the new active/muted contract;
  screenshots dark/light with no selection and with a top-level selected. A test must prove a
  selection still changes the edge presentation (active width vs muted others).

### Commit 2 — Settings control geometry and Continuous card inset

- One control geometry in Settings:
  - `.nf-segmented` becomes a fixed-width inline grid: `width: 320px; max-width: 100%;
    grid-auto-flow: column; grid-auto-columns: 1fr; height: 28px;` so 2-choice and 3-choice groups
    have equal-width buttons and the same total width; items are centered with `min-width: 0` and
    `padding: 0 6px`, `white-space: nowrap`.
  - `.nf-select` uses the same `width: 320px` and `height: 28px` (not the `.nf-input` 100%/30px),
    with `appearance: none`, `padding-right: 30px` and a real `ChevronDown` icon from `lucide-react`
    inside a `.nf-select-wrap` (position absolute, right 9px, 14px, `pointer-events: none`,
    `color: var(--text-3)`). No clipped native arrow. At UI scale 1.15 the label must not clip; if
    320px is too tight for "Document title" at 1.15, use the smallest width that fits and keep all
    groups identical.
  - The controls stay right-aligned in `.nf-settings-control`; "Use global" quiet buttons remain
    beside the group without pushing the group width.
- Fix the Continuous card inset: `.nf-block-prose > *:first-child` is the React node-view wrapper,
  so the existing first/last reset never reaches the real heading/paragraph. Add
  `.nf-block-prose > :first-child > :first-child { margin-top: 0; }` and
  `.nf-block-prose > :last-child > :last-child { margin-bottom: 0; }` (scope to the wrapper's
  first/last element; do not zero every nested margin). Top-level and child cards then show the same
  10px content inset above and below; the card padding token stays `--nf-card-padding` 10.
- Page/PDF do not change: this is the Continuous DOM only; the paginator uses estimates.
- Tests: a UI/unit CSS test for the 320px geometry, equal segment widths, select height 28,
  `appearance: none`, chevron inside the select box, and no clipping; a measurement test for the
  first heading `margin-top: 0` and last paragraph `margin-bottom: 0` inside a top-level and a child
  card, with equal card-top-to-content and content-to-card-bottom distances. Screenshots of the
  Appearance typography rows and a top-level/child card pair. Update `ui-appearance-v3`,
  `ui-batch-b`, `ui-settings-advanced`, `ui-batch-v` and the shell screenshots as needed.

### Commit 3 — Sidebar: real resize range, snap default, left toggle

- Export `SIDEBAR_MIN_WIDTH = 180`, `SIDEBAR_MAX_WIDTH = 640`,
  `SIDEBAR_SNAP_WIDTH = 264` from `state/shell.ts`; use them in the store clamp, the `Panel`
  `minSize`/`maxSize`, and the resize guard (replace the 208/360 literals).
- Magnetic snap: while resizing, persist the clamped width. After the drag settles for ~140 ms, if
  the width is within 10px of `SIDEBAR_SNAP_WIDTH`, call `panel.resize(264)` and persist 264. A
  double-click on the separator resets to 264 immediately. The separator keeps
  `aria-label="Resize sidebar"` and gets a `title` that says drag to resize, double-click to reset.
  The `⌘\` toggle and narrow-window auto-collapse behavior stay.
- Move the collapse control to the **left** of the sidebar header, before the search field:
  expanded header order is `[collapse][search][new note]`. In the rail, the expand button keeps the
  same 8px left inset as the expanded collapse button (`justify-content: flex-start; padding: 0 8px`
  on the rail head), so collapsing does not shift the control horizontally.
- Tests: drag beyond the old 360 limit (e.g. to 560) and back; snap at 264; double-click reset;
  collapse button x matches the rail expand button x within 1px; `⌘\` still works; persisted width
  survives a restart. Update `v0-shell-frame` and any shell screenshot.
- Keep the sidebar visually unchanged otherwise; no new settings.

### Commit 4 — Stale lock recovery: creation and the status panel

Root causes confirmed on the product-owner machine:

- `createDocumentPackage` picks the first free folder name, then acquires a lock keyed by that
  absolute path. A deleted package left a stale lock (`untitled-2`, `untitled-3`, …); reusing the
  freed name hits the stale lock and **New note** fails with the raw core message.
- The stale-lock panel collapses to a 34px bar with only **Review**, so a user who dismissed the
  panel cannot take over from the compressed state.

Fixes:

- `packages/core/src/node/store.ts`: when `createDocumentPackage` acquires the lock for the
  directory it has just created, pass `breakStale: true` (only stale/corrupt locks are removed; a
  live lock still fails). Add a comment that a lock for a just-created unique path is orphaned by
  definition. Map a remaining live-lock failure in `apps/desktop/src/main/library.ts`
  (`createDocument`) to a user-facing message: the note folder is locked by another session, close
  the other NoteForest window and try again. Never surface the raw lock path/message in the toast.
- `DocumentStatusPanel`:
  - lift `takeOver` above the collapsed branch and pass it to the stale-lock `SlimBar`; the
    compressed stale bar shows **Take over lock** (primary) and **Review** (quiet). A click takes
    over without expanding first; the full panel keeps the same two actions plus Cancel.
  - generic read-only (`locked`, `newer-schema`, …) shows lock metadata (PID/host/session/heartbeat
    when available) in Details, plus a **Recheck** action only for `readOnlyReason === 'locked'`
    that calls `runtime.reloadFromDisk()`, disables while busy, and toasts if it is still read-only.
    Copy: if no other NoteForest window is open, quit NoteForest completely and reopen; a lock from
    the previous run becomes stale and offers Take over. Do not add a force-break of a live lock.
- Tests:
  - core: a stale lock on a deleted package path does not block `createDocumentPackage` when the
    name is reused, and the new store is editable; a live lock still fails; the existing
    `requires explicit stale-lock recovery` test stays green.
  - UI: compressed stale bar exposes Take over and clicking it makes the document editable; generic
    read-only exposes Recheck, stays read-only with a live lock, and becomes editable after the lock
    file is removed; lock metadata is present. No native dialogs.
- Update `tests/ui/ui-document-status.test.mjs` screenshots for both bars.

## Out of scope

- Force-breaking a live lock, pruning old lock files on startup, changing the 5-minute stale TTL, or
  changing the single-writer contract/spec.
- Page/PDF edge colors, Page/PDF typography, tagged PDF/page range, `settingsVersion`, R4/R6.
- Free color picker, per-document appearance, new Settings pages.
- Sidebar content redesign, library/backup work, or moving the new-note button.

## Files

Read:
- `packages/core/src/node/store.ts`, `lock.ts`, `packages/core/test/storage.test.ts`.
- `apps/desktop/src/main/library.ts`, `apps/desktop/src/shared/api.ts`.
- `apps/desktop/src/renderer/src/styles.css`, `state/shell.ts`, `shell/Workspace.tsx`,
  `shell/Sidebar.tsx`, `shell/DocumentStatusPanel.tsx`, `settings/AppearanceSettings.tsx`,
  `shell/SettingsDialog.tsx`, `editor/edges/EdgeLayer.tsx`, `editor/views/BlockViews.tsx`.
- `packages/layout/src/edge-style.ts` (Page isolation reference only).
- Tests: `apps/desktop/test/appearance-css-guard.test.ts`, `apps/desktop/test/*edge*`,
  `tests/ui/v0-shell-frame.test.mjs`, `ui-appearance-v3`, `ui-batch-a`, `ui-batch-b`,
  `ui-batch-v`, `ui-settings-advanced`, `ui-document-status`.
- `AGENTS.md`, `docs/design/color-system.md`, `docs/design-tokens-continuous.md`,
  `docs/agents/brief-template.md`.

Expected to touch: the files above, their tests, the Continuous token doc's `--edge` row, and
`docs/reports/ui-shell-fixes.md`.

## Acceptance criteria

- [ ] With no selection, Continuous primary edges use the accent-strong color; a top-level selection
      still stands out (active width + muted other branches); reference edges keep the neutral
      dashed look; Page/PDF output is byte-identical for the same document (isolation test).
- [ ] All Settings segmented groups use one 320px (or the documented minimum) geometry with
      equal-width buttons; both selects use one 28px height and width, `appearance: none`, and a
      chevron fully inside the control in dark and light, at UI scale 100 and 115.
- [ ] Top-level and child Continuous cards have the same content inset (10px above and below after
      the first/last margin reset); no extra heading margin at the top or paragraph margin at the
      bottom.
- [ ] Sidebar resizes between 180 and 640, snaps/locks at 264 within 10px, resets on separator
      double-click, persists, and the collapse/expand control stays at the same left x (≤1px).
- [ ] New note succeeds when a deleted document left a stale lock on the reused folder name; a live
      lock still fails with a user-facing message.
- [ ] The compressed stale-lock bar takes over in one click; generic read-only has lock details and
      a Recheck that recovers after the other lock disappears; no force-break of a live lock.
- [ ] Existing assertions updated to the intended behavior, none weakened; no fixed sleeps/native
      dialogs; no schema/settings-version change.

## Tests and evidence

- Targeted while working: core storage/repository, appearance CSS guard, edge tests,
  `node tests/ui/run.mjs --group shell,settings,anchors` (build first).
- End of task: one `npm run verify:fast` (boundaries, typecheck, unit, e2e).
- Screenshots: `artifacts/v0-shell-visual/` edges dark/light idle + selected; Appearance typography
  at 100/115; top-level/child card inset; sidebar at 180/264/560; stale/generic status bars. Use each
  suite's own `artifacts/<suite>` directory.
- No native OS dialog may block a test; no fixed sleeps; do not weaken existing assertions.

## Stop and ask

Stop and report when:

- the 320px control width cannot fit the Settings pane at UI scale 115 without clipping a label;
- the edge alias needs a Page/PDF change or a new token outside the Continuous CSS;
- the card-inset fix changes the paginator/Page output or an unrelated baseline;
- a live lock would need a force-break or a spec change;
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to the four commits.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with evidence.
- Open questions / risks (especially any live-lock case that still needs the user to quit/reopen).
- Next suggested step (R4 Export defaults).
- Commit in the worktree; do not merge or push.
