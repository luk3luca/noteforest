# MB1 — Manual breaks: the control, the list, the cleanup

**Role:** Builder
**Milestone:** post-sidebar batch 2
**Base:** `main` at launch (the docs commit that adds this brief).
**Worktree:** created by the Orchestrator, branch `t3/manual-breaks`.
**Timebox:** 3 hours.

## Context

The paginator already honours `pageSettings.manualBreakBeforeBlockIds` and already reports an
`impossible-hint` warning when it cannot, but nothing in the product creates a hint, nothing lists them,
and deleting a block leaves a dead id behind. The design is `docs/design/manual-breaks.md` (approved
16 November 2026), the lab is `docs/design/manual-breaks-ui-lab/`, and the sidebar rhythm the list
reuses is `docs/design/sidebar.md`.

## Goal

A block that starts a row can begin a page from its context menu, every stored break is visible and
removable in a `Breaks` sidebar section, an unhonourable break says so instead of disappearing, and a
deleted block takes its hint with it.

## In scope

### 1. The menu item (`actions.ts`, both layouts)

One item, `Start on a new page`, with a check state, in the block context menu — reachable in Continuous
and by right-clicking a block card in Page.

States, in this order of precedence:
- first block of the note → disabled, description `The note already starts here.`
- first block of a chapter → disabled, description `A chapter always starts a new page.`
- block is not the **row leader** → disabled, description
  `Only the block that starts a row can begin a page.`
- otherwise → enabled, checked when the id is in the per-document override, unchecked when it is not.

The row leader is the leftmost block at the block's `y` in the current page model (the parent before its
right-hand children). Compute it in the renderer, not in the paginator.

Toggling writes the **per-document** `manualBreakBeforeBlockIds` override (deduped, sorted by document
order is not required — the paginator does not care about order). Disabled in **Read** like every other
authoring action.

### 2. The `Breaks` section (`Sidebar.tsx`, new `BreaksSection.tsx`)

Fifth activity-bar entry, `Breaks`, using the sidebar system: 28 px header with title and the count in
`--sb-count`, group-owned dividers, plain 28 px navigation rows (**no card**: a break is not a result).

- Row: `Page 4 · <label or first line>` — the page number of the current pagination, then the block
  title via the existing title helper (label, else first line). Two-line row when there is a second line.
- Second line `Starts a page` in `--text-3` is **not** needed on a healthy row; render it only for a
  broken hint: `Can’t be honoured here.` in `--danger`, with the paginator's `impossible-hint` message in
  the row's `title`.
- Click navigates: Page turns to that page, Continuous reveals the block (`navigateToFindResult`-style
  reuse of the existing block navigation, not a new path).
- Remove: a `×` on the row, visible on hover/focus only, same pattern as the library rows; disabled in
  Read. Removing writes the override without that id.
- Empty state, one line: `No manual breaks. Start a block on a new page from its menu.`
- Header count = number of stored hints (broken ones included).
- No reordering, no `Remove all`, no Settings page.

The icon: `SeparatorHorizontal` from the set already in use.

### 3. Cleanup (the settings writer)

A hint must never outlive its block.

- After a structural commit, prune the override to ids that exist in `document.blocks`. Recompute from
  the current document; do **not** hook undo/replay, because the override is not in the document history.
- Split: the original block keeps the hint, the new block never inherits it.
- Merge: the surviving block keeps the hint; the absorbed id loses it.
- A hint whose block still exists but is no longer a row leader is **kept** (design §7): it becomes a
  warning row, not a deletion.
- The global page settings default stays `[]`; nothing writes it (`page-settings.test.ts` already asserts
  it — keep that assertion green).

### 4. Paginator tests

The engine is not changed. Add the three cases that are not covered today:
- a hint on a block placed beside its parent cuts **before the parent** (the row moves);
- a hint on a block at `y = 0` is accepted, creates no page and emits **no** warning;
- a hint on a block of another chapter is ignored without a page start.

## Out of scope

- Any change to `packages/layout` behaviour, `paginate` or the defect codes.
- A Continuous marker, a Settings page, `Remove all`, drag reordering.
- Schema, `settingsVersion`, IPC, Page/PDF rendering, the find engine, the sidebar tokens.
- The `impossible-hint` severity: it stays a warning.

## Files

Read:
- `docs/design/manual-breaks.md`, `docs/design/manual-breaks-ui-lab/index.html`,
  `docs/design/sidebar.md`.
- `packages/layout/src/paginator.ts` (`isValidBreakAt`, the hint loops), `page-settings.ts`
  (`mergePageSettings`, `sanitizeManualBreaks`).
- `apps/desktop/src/renderer/src/actions.ts` (block menu builder), `shell/Sidebar.tsx` (the activity bar
  and the section switch), `state/settings.ts` (the page override writer), `page/model.ts`.

Expected to touch:
- `apps/desktop/src/renderer/src/actions.ts`, `shell/Sidebar.tsx`, new `shell/BreaksSection.tsx`,
  `state/settings.ts`, `styles.css` (the fifth section only)
- `packages/layout/test/pagination.test.ts` (the three cases)
- `apps/desktop/test/` — the prune and the menu-state unit tests
- `tests/ui/manual-breaks.test.mjs` (+ `tests/ui/suites.mjs`)
- `docs/reports/manual-breaks.md`

## Acceptance criteria

- [ ] On a top-level block (not a chapter's first) the menu item is enabled and toggles; the check
      reflects the stored hint after a reload.
- [ ] On a block placed beside its parent, on a mode A callout, on a chapter's first block and on the
      note's first block, the item is disabled with the matching one-line description.
- [ ] Toggling changes the rendered page count in Page when the break actually moves content, and the
      page number in the `Breaks` list follows the live pagination.
- [ ] The `Breaks` section lists every stored hint in document order, navigates on click, removes on `×`,
      shows the count, and shows the one-line empty state.
- [ ] A hint that cannot be honoured keeps its row with `Can’t be honoured here.` and the paginator
      message in the `title`.
- [ ] Deleting a block (and a subtree), splitting and merging leave no hint pointing at a missing id.
- [ ] In Read, the item and the `×` are disabled; navigation still works.
- [ ] No regression: page count, PDF export, warnings, find, health, library.

## Tests and evidence

- Targeted while working: `npx vitest run` for the new unit tests and the paginator cases, then
  `node tests/ui/run.mjs --group shell --concurrency 2`.
- End of task: `npm run verify:fast`.
- Do not run `npm run verify`: the Orchestrator runs the full integration gate.
- Screenshots under `artifacts/manual-breaks/`: the menu enabled/checked, the menu disabled with a
  reason, the `Breaks` section with a healthy row and a broken row, the empty state, the page after a
  break.

## Stop and ask

- if the row-leader rule needs layout data the renderer does not have without a new paginator call;
- if the prune cannot be recomputed from the current document without touching the document history;
- if disabling the item in Read conflicts with the existing Read-mode gate shape;
- if a paginator test contradicts the design's cut model;
- on any schema, settings-version or PDF change.

## Report format

Summary, files changed, checks with real timings, pass/fail per acceptance criterion, open
questions/risks, next step. One commit in the worktree; do not merge.
