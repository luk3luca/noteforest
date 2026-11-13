# UI shell fixes — edges, settings, sidebar system, selection, lock

**Role:** Implementer / Builder
**Milestone:** UI stabilization after R3 / palette batch
**Base:** the commit that adds this brief on `main`
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 10 hours

## Context

The product-owner review after the palette/Page/anchor batch found eight fixes, then a second review of
the sidebar added five more. This is one complete batch, not a partial fix. The two lock issues have
confirmed root causes: deleted documents left stale lock files on freed folder names, so **New note**
fails on the reused path; and the compressed stale-lock bar has no takeover. The sidebar has a real
geometry bug: the Library row's invisible `…` menu takes 20px, so its selected surface is 204px while
the Topics row is 224px; the header, filter and rows use three different horizontal insets; there is
no section divider; the source block and its anchor can stay selected together; and the Settings icon
moves when the rail collapses.

Continuous edge colors are CSS-only and must stay isolated from Page/PDF (the split already exists in
`edge-style.ts` / `--paper-*`). No schema or settings version changes in this batch.

## Goal

One worktree, five ordered commits, all thirteen fixes, targeted UI suites and one
`npm run verify:fast`.

## In scope

### Commit 1 — Continuous edges: selected color is the resting color

- Make the **resting** Continuous primary edge the same accent color that selection uses today:
  `--edge: var(--accent-strong)` as one derived alias in the `:root` aliases block (near
  `--edge-active`), not a duplicated literal. Remove the per-theme literal `--edge` declarations.
- Keep the current selection semantics: selected path edges use `--edge-active` (same accent) and
  `--nf-edge-width-active` 1.75; every other edge is `--edge-muted` (existing 0.35 opacity). The
  selected card's accent ring remains the block cue. No new glow/animation.
- Add `--edge-reference` per theme with the previous neutral values (dark `#7b858f`, light `#6c7882`)
  and use it for `.nf-edge-reference`, `.nf-edge-reference-arrow` and their base strokes. Reference
  edges keep their dashed, lower-emphasis look; they must not become accent.
- Page/PDF must not change: Page reads `PAGE_EDGE_STYLE` and its own `.nf-page-*` classes, never
  `--edge`. Keep/extend the edge-style isolation test.
- Tests: update `appearance-css-guard` (the `--edge` alias is `var(--accent-strong)`,
  `--edge-reference` is the neutral literal, resting-edge contrast is satisfied by every accent's
  `strong` value against the canvas); update edge-class tests to the active/muted contract; screenshots
  dark/light with no selection and with a top-level selected. A test must prove a selection still
  changes the edge presentation (active width vs muted others).

### Commit 2 — Settings control geometry and Continuous card inset

- One control geometry in Settings:
  - `.nf-segmented` becomes a fixed-width inline grid: `width: 320px; max-width: 100%;
    grid-auto-flow: column; grid-auto-columns: 1fr; height: 28px;` so 2-choice and 3-choice groups
    have equal-width buttons and the same total width; items centered, `min-width: 0`,
    `padding: 0 6px`, `white-space: nowrap`.
  - `.nf-select` uses the same `width: 320px` and `height: 28px` (not the `.nf-input` 100%/30px),
    with `appearance: none`, `padding-right: 30px` and a real `ChevronDown` from `lucide-react`
    inside a `.nf-select-wrap` (absolute, right 9px, 14px, `pointer-events: none`,
    `color: var(--text-3)`). No clipped native arrow. If 320px clips "Document title" at UI scale
    1.15, use the smallest width that fits and apply it to all groups.
  - Controls stay right-aligned in `.nf-settings-control`; "Use global" quiet buttons remain beside
    the group without changing the group width.
- Fix the Continuous card inset: `.nf-block-prose > *:first-child` is the React node-view wrapper, so
  the existing first/last reset never reaches the real heading/paragraph. Add
  `.nf-block-prose > :first-child > :first-child { margin-top: 0; }` and
  `.nf-block-prose > :last-child > :last-child { margin-bottom: 0; }` (scope to the wrapper's first
  and last element; do not zero every nested margin). Top-level and child cards then show the same
  10px content inset above and below; `--nf-card-padding` stays 10.
- Page/PDF do not change: this is the Continuous DOM only.
- Tests: CSS/UI test for the 320px geometry, equal segments, select height 28, `appearance: none`,
  chevron inside the select box, no clipping; a measurement test for the first heading
  `margin-top: 0` and last paragraph `margin-bottom: 0` in a top-level and a child card, with equal
  card-top-to-content and content-to-card-bottom distances. Screenshots of the Appearance typography
  rows at 100/115 and a top-level/child card pair. Update `ui-appearance-v3`, `ui-batch-b`,
  `ui-settings-advanced`, `ui-batch-v`.

### Commit 3 — Sidebar visual system (one grid)

Make the sidebar one column grid, not three nested insets. The measured current values are
header search left 17 / filter left 27 / row left 23; selected Library 204px vs selected Topics
224px; search 28px / filter 24px / rows 26px; no divider before Topics or the footer.

- One horizontal inset: keep `.nf-sidebar` and `.nf-sidebar-scroll` padding `0 8px 8px`; remove the
  horizontal padding from `.nf-sidebar-section`, `.nf-library-list` and `.nf-tree` so the search,
  filter, rows, section headers and footer all share the same left/right content box (17..253 at the
  default 264 width).
- One row height: `.nf-library-open`, `.nf-tree-row` and `.nf-library-search` are **28px** (not
  26/24); the tree row min-height 28; the row content inset 6px. The section header is 28px. The
  footer Settings button stays 30px.
- `.nf-section-head { min-height: 28px; padding: 2px 6px 4px; }`; label/count/add align to the same
  6px cell inset. The Library add and the Topics add are both 22×22 with a 13px `Plus` icon and the
  same right edge. Keep both add buttons (the Library + is an accepted Batch A path; do not remove
  it).
- `.nf-library-search` becomes full width (`margin: 0 0 6px; padding: 0 6px; height: 28px;
  background: var(--surface-1)`); the top `.nf-sidebar-search` also uses `surface-1` and height 28
  (not `bg-canvas`), so the two search surfaces match. Icons are 13px and sit on the same 6px cell
  inset where the grid allows (the top search follows the collapse button).
- Selection surface: move the Library selected style from `.nf-library-open[data-active="true"]` to
  `.nf-library-row[data-active="true"]` (add `data-active` to the row in `Sidebar.tsx`). The row
  keeps the 20px `…` menu inside it, so the selected surface is the full 224px like a topic row; the
  open button becomes transparent with `color: var(--text-1)`. Both selected surfaces use
  `accent-soft`, a 1px inset `accent` ring and `--radius-control` 3px. The hidden menu no longer
  steals 20px from the selection.
- Section separation: `.nf-library-section { padding-bottom: 12px; }`;
  `.nf-topics-section { border-top: 1px solid var(--border-1); padding-top: 8px; }`;
  `.nf-sidebar-foot { border-top: 1px solid var(--border-1); padding: 6px 8px 8px; }`. This is the
  requested stacco between documents, topics and Settings. Do not make the Settings button
  full-width (Batch A contract: it is a button inside the footer).
- Keep the footer Settings button as a button; its icon must stay in the same place as the rail
  Settings icon. Use a 30px-high button with the same 8px internal inset in both, or adjust the rail
  button to the same 30×30 box (see commit 4).
- Tests: measure that the selected Library row and the selected Topics row have the same width
  (within 0.5px) and both equal the row content width; search/filter/row heights are 28; the search
  and filter left edges are the grid edge; Topics and footer have a `border-top`; the Settings
  button is still narrower than the footer (Batch A). Update `v0-shell-frame`, `ui-batch-a` and the
  sidebar screenshots.

### Commit 4 — Sidebar interactions: collapse, resize/snap, one selection

- Move the collapse control to the **left** of the sidebar header, before the search:
  `[collapse][search][new note]`. In the rail, the expand button keeps the same left inset
  (`.nf-rail-head { justify-content: flex-start; padding: 0 8px; }`, 28×28 button), so collapsing
  does not move it.
- Align the Settings icon across the transition: the rail Settings button becomes 30×30 at the same
  left 8px inset and the rail foot uses `padding: 6px 8px 8px` and `justify-content: flex-start`;
  the expanded Settings button is 30px high with 8px padding. The icon centers must match within
  1px horizontally and vertically; add a test that measures the expanded Settings icon and the rail
  Settings icon, and the expanded/rail collapse-expand icons.
- Resize: export `SIDEBAR_MIN_WIDTH = 180`, `SIDEBAR_MAX_WIDTH = 640`,
  `SIDEBAR_SNAP_WIDTH = 264` from `state/shell.ts`; use them in the store clamp, the `Panel`
  `minSize`/`maxSize`, and the resize guard (replace 208/360 literals). Persist the clamped width.
  After the drag settles for ~140 ms, if the width is within 10px of 264, snap to 264
  (`panel.resize(264)`) and persist 264. Separator double-click resets to 264 immediately. The
  separator keeps `aria-label="Resize sidebar"` and gets a title: drag to resize, double-click to
  reset. `⌘\` and narrow-window auto-collapse stay.
- One selection: `selectBlock` must always clear `selectedAnchor` (and the editor anchor highlight)
  when an explicit block is selected, including the anchor's source or target. The sidebar anchor row
  still calls `selectBlock` then `selectAnchor`, so its own row/anchor state stays; a later canvas
  click clears the anchor. Update the comment in `runtime.ts` and the selection tests. The reproduced
  bug is: select an anchor row in the sidebar, then click the source/top-level card in the canvas;
  both the block row and the anchor row stay purple.
- Tests: sidebar width 180..640; drag to 560 persists; release near 264 snaps to 264; double-click
  resets; collapse/expand icon x/y within 1px; Settings icon x/y within 1px; after selecting an anchor
  row, clicking its source block leaves exactly one selected row and no `data-anchor-selected`.
  Update `v0-shell-frame` and any shell screenshot.

### Commit 5 — Stale lock recovery: creation and the status panel

Root causes confirmed on the product-owner machine:

- `createDocumentPackage` picks the first free folder name, then acquires a lock keyed by that
  absolute path. Deleted packages left stale locks (`untitled-2`, `untitled-3`, …); reusing the freed
  name hits the stale lock and **New note** fails with the raw core message.
- The stale-lock panel collapses to a 34px bar with only **Review**, so a dismissed panel has no
  takeover; the generic read-only bar has no retry either.

Fixes:

- `packages/core/src/node/store.ts`: in `createDocumentPackage`, acquire the lock with
  `breakStale: true` (the directory was just created by this call; only stale/corrupt locks are
  removed, a live lock still fails). Comment why. Map a remaining live-lock failure in
  `apps/desktop/src/main/library.ts` (`createDocument`) to a user-facing message: the note folder is
  locked by another session; close the other NoteForest window and try again. Never show the raw lock
  path/message in the toast.
- `DocumentStatusPanel`: lift `takeOver` above the collapsed branch and pass it to the stale-lock
  `SlimBar`; the compressed stale bar shows **Take over lock** (primary) and **Review** (quiet).
  Generic read-only (`locked`, `newer-schema`, …) shows lock metadata (PID/host/session/heartbeat)
  in Details, plus a **Recheck** only for `readOnlyReason === 'locked'` that calls
  `runtime.reloadFromDisk()`, disables while busy, and toasts if still read-only. Copy: if no other
  NoteForest window is open, quit NoteForest completely and reopen; a lock from the previous run
  becomes stale and offers Take over. Do not force-break a live lock.
- Tests: core stale lock on a deleted/reused path does not block `createDocumentPackage` and the new
  store is editable; a live lock still fails. UI: compressed stale bar takes over in one click and
  becomes editable; generic read-only exposes Recheck, stays read-only with a live lock, becomes
  editable after the lock file is removed; metadata present. No native dialogs, no fixed sleeps.
  Update `tests/ui/ui-document-status.test.mjs`.

## Out of scope

- Force-breaking a live lock, pruning old lock files at startup, changing the 5-minute stale TTL, or
  changing the single-writer contract/spec.
- Removing the Library `+` or changing its Batch A behavior; making Settings a full-width row.
- Page/PDF edge colors or typography, tagged PDF/page range, `settingsVersion`, R4/R6.
- Free color picker, per-document appearance, new Settings pages, library/backup/search work.
- Redesigning the topic tree semantics or the empty-block fixture data.

## Files

Read:
- `packages/core/src/node/store.ts`, `lock.ts`, `packages/core/test/storage.test.ts`.
- `apps/desktop/src/main/library.ts`, `apps/desktop/src/shared/api.ts`.
- `apps/desktop/src/renderer/src/styles.css`, `state/shell.ts`, `state/runtime.ts`,
  `shell/Workspace.tsx`, `shell/Sidebar.tsx`, `shell/DocumentStatusPanel.tsx`,
  `settings/AppearanceSettings.tsx`, `shell/SettingsDialog.tsx`,
  `editor/edges/EdgeLayer.tsx`, `editor/views/BlockViews.tsx`.
- `packages/layout/src/edge-style.ts` (Page isolation reference only).
- Tests: `apps/desktop/test/appearance-css-guard.test.ts`, `apps/desktop/test/*edge*`,
  `tests/ui/v0-shell-frame.test.mjs`, `ui-appearance-v3`, `ui-batch-a`, `ui-batch-b`,
  `ui-batch-v`, `ui-settings-advanced`, `ui-document-status`.
- `AGENTS.md`, `docs/design/color-system.md`, `docs/design-tokens-continuous.md`.

Expected to touch: the files above, their tests, the Continuous token doc's `--edge` row, and
`docs/reports/ui-shell-fixes.md`.

## Acceptance criteria

- [ ] With no selection, Continuous primary edges use the accent-strong color; a top-level selection
      still stands out (active width + muted other branches); reference edges keep the neutral dashed
      look; Page/PDF output is unchanged (isolation test).
- [ ] All Settings segmented groups use one 320px (or documented minimum) geometry with equal-width
      buttons; both selects use one 28px height/width, `appearance: none`, and a chevron fully inside
      the control in dark/light at UI scale 100 and 115.
- [ ] Top-level and child Continuous cards have the same 10px content inset after the first/last
      margin reset; no extra heading margin at the top or paragraph margin at the bottom.
- [ ] Sidebar uses one grid: search, filter, section headers, rows and footer share the content
      inset; search/filter/rows are 28px; selected Library and Topics rows are the same width; both
      selection surfaces use the same fill/ring/radius; Topics and footer have a divider; the
      Settings button stays narrower than the footer.
- [ ] Sidebar resizes 180..640, snaps/locks at 264 within 10px, resets on separator double-click,
      persists; collapse/expand and Settings icons keep their positions within 1px.
- [ ] Selecting an anchor row then its source/top-level block leaves exactly one selection; the
      anchor highlight clears.
- [ ] New note succeeds when a deleted document left a stale lock on the reused folder name; a live
      lock still fails with a user-facing message.
- [ ] The compressed stale-lock bar takes over in one click; generic read-only has lock details and
      a Recheck that recovers after the lock disappears; no force-break of a live lock.
- [ ] Existing assertions updated to the intended behavior, none weakened; no fixed sleeps/native
      dialogs; no schema/settings-version change.

## Tests and evidence

- Targeted while working: core storage/repository, appearance CSS guard, edge tests,
  `node tests/ui/run.mjs --group shell,settings,anchors` (build first).
- End of task: one `npm run verify:fast` (boundaries, typecheck, unit, e2e). Do not run the full
  `npm run verify`; the Orchestrator runs it at integration.
- Screenshots: `artifacts/v0-shell-visual/` edges dark/light idle + selected; Appearance typography
  at 100/115; top-level/child card inset; sidebar expanded at 180/264/560 with Library+Topics
  selected and dividers; collapsed rail Settings/expand alignment; stale/generic status bars.
- No native OS dialog may block a test; no fixed sleeps; do not weaken existing assertions.

## Stop and ask

Stop and report when:

- the 320px control width cannot fit the Settings pane at UI scale 115 without clipping a label;
- the edge alias needs a Page/PDF change or a new token outside the Continuous CSS;
- the card-inset fix changes the paginator/Page output or an unrelated baseline;
- the sidebar grid requires removing an accepted Batch A affordance (e.g. the Library +);
- the 224px row width cannot be achieved without a layout hack (e.g. the `…` menu);
- a live lock would need a force-break or a spec change;
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to the five commits.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with evidence.
- Open questions / risks (especially any live-lock case that still needs the user to quit/reopen).
- Next suggested step (R4 Export defaults).
- Commit in the worktree; do not merge or push.
