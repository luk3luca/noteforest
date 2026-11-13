# L1 + L2 — Library surface: sidebar tabs and library roots

**Role:** Implementer / Builder
**Milestone:** Library & documents
**Base:** `main` head at delegation, **after** the UI-shell fix batch is merged (the Orchestrator sets the exact commit; the brief must not be built on the pre-fix sidebar)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 3 days

## Context

The product owner approved the library model in
`docs/design/library-and-documents.md` (confirmed 13 November 2026). Today the app has one fixed
library (`~/Documents/NoteForest`), `isInsideLibrary` rejects everything else, and the sidebar
stacks Library and Topics in one scroll. This task adds the **Library** and **Outline** sidebar
tabs (L1) and the **one-active-library** model with open/switch/recent/missing states (L2). It is the
first of two runs; draft creation and document management are the second run and are **not** in this
brief.

## Goal

One worktree, two ordered commits (L1, L2), one `npm run verify:fast`, targeted UI suites.

## In scope

### Commit L1 — Sidebar tabs

- Add `sidebarTab: 'library' | 'outline'` to `SessionState` (shared API + main session read/write).
  Default `'library'`; missing field in an existing session → default, no migration error.
- Restructure the expanded sidebar:
  - global search stays at the top;
  - a two-tab strip below it: **Library** and **Outline**;
  - `role="tablist"`, two `role="tab"` buttons with `aria-selected` and `aria-controls`, arrow-key
    movement, focus ring; the tab panel is the scroll area;
  - the footer Settings stays outside the tabs.
- **Library tab**: the existing Library section (count, filter, document rows, open/new note) with
  the library name as the header (the switcher menu arrives in L2; L1 shows the active library
  basename read-only). The row/selection/grid work from the fix batch is reused.
- **Outline tab**: the existing Topics tree (chapters, blocks, anchors), collapse state, rename,
  context menus. Empty state: “Open a document to see its outline.”
- Remove the global header **New note `+`**; keep **one** New note in the Library header (LD-02,
  confirmed). Update the Batch A tests that assert the header `+`; keep the Library `+` working.
- Replace the Library/Topics section dividers from the fix batch with the tab boundary; keep the
  footer `border-top` and the sidebar grid/rows.
- Sidebar collapse/expand and the rail stay unchanged; the tabs are only in the expanded panel.
- Persist the active tab in the session; restore on launch. Opening a document does not force a tab
  switch; the last tab wins.
- Tests: tab switch, session restore, Library/Outline panel visibility, Outline empty state, ARIA
  tab behavior, one New note path, global `+` absent, sidebar collapse unchanged, screenshots.

### Commit L2 — Library roots

- Add `app-support/libraries.json` (own `version: 1`, max 8 recents). Pure read/normalize/write in a
  new module; atomic writes; corrupt file → empty list + warning, never document loss. Each entry:
  `{ path, lastOpenedAt }`, absolute/normalized; display name = folder basename; duplicate basenames
  show the parent path as a secondary line.
- Main:
  - `activeLibraryPath()` resolved from the session; first run with no session/list creates and
    activates `~/Documents/NoteForest`; a **missing** stored library is never recreated.
  - `openLibrary` (native directory picker), `createLibrary` (small modal: name + parent picker),
    `switchLibrary`, `removeRecentLibrary` (recents only; never delete files), `locateLibrary`
    (replace a missing path), `refreshLibrary` (rescan), `revealLibrary`.
  - `scanLibrary` takes an explicit root; `LibraryView` exposes the active library path/name and the
    recent libraries; `createDocument` targets the active library.
  - Replace `isInsideLibrary` with `isInsideKnownLibrary` (active + recent libraries). Commands and
    opens outside the known libraries remain rejected in this milestone (external documents later).
  - `libraries.json` recents are updated on open/create/switch; max 8; dedupe by normalized
    `realpath`; the chosen path is displayed.
  - Reject a library root that is itself a package (`document.json` in the root) and nested libraries
    with a clear message.
  - Session `activeLibrary`; on launch use it; missing → missing state, no recreate. The active tab's
    library is not used to silently replace a missing active library.
- Renderer:
  - Library tab header: library name + chevron, count, New note. Switcher menu: current (check),
    recents, **Open Folder as Library…**, **New Library…**, **Refresh**, **Reveal in Finder**,
    **Remove from Recent** (disabled for the active library).
  - Missing state in the Library tab: “Library not found” + path + Locate… / Remove from Recent /
    Open another…; the Outline tab still works for open documents.
  - Empty state: “No documents yet” + New note.
  - Data & About: active library path, recent libraries, Open/Reveal/Remove links. No settings
    schema change.
- Switching flushes pending saves first; a failed flush blocks the switch with the error. Open tabs
  stay across a switch (LD-03); activating a tab from another known library updates the active
  library.
- Opening a recent document from another known library activates that library.
- Move reconciliation: when a library is opened/located, if an open tab or a recent path is missing,
  match a scanned document by `document.id` and update the path; keep legacy path-only entries as
  missing. Per-document overrides are already id-first.
- Keep `NOTEFOREST_LIBRARY` as the test/app seed; switching must still work in an isolated test
  environment with `NOTEFOREST_APP_SUPPORT`.
- Tests: first run/default, open folder with packages, switch, recent order/cap, missing no recreate,
  locate reconciles, remove only recents, root-is-package rejection, nested warning, dedupe, create
  note in the active library, no-library state, active-tab/library interaction, Data links, session
  restore, screenshots.

## Out of scope

- Draft creation / deferred materialization (L3, next run).
- Rename, reveal, Move to Trash / document management (L4, next run).
- External documents outside known libraries; multi-root workspaces.
- Full-text search, backup/restore UI, library-level settings, any `settingsVersion` change.
- Changing the document package format, Page/PDF, or the export flow.

## Files

Read:
- `docs/design/library-and-documents.md` (the approved model and LD decisions).
- `apps/desktop/src/shared/api.ts` (`LibraryView`, `SessionState`, `BootstrapResult`).
- `apps/desktop/src/main/library.ts` (`libraryDir`, `ensureLibrary`, `scanLibrary`,
  `isInsideLibrary`, `createDocument`, session/settings), `main/index.ts`, `main/menu.ts`.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx`, `Workspace.tsx`, `SettingsDialog.tsx`,
  `state/shell.ts`, `state/session.ts`, `actions.ts`, `styles.css`.
- `apps/desktop/src/preload/index.ts`, `shared/api.ts`.
- Tests: `tests/ui/v0-shell-frame.test.mjs`, `ui-batch-a.test.mjs`, `m2-shell.test.mjs`,
  `tests/support/ui-session.mjs`, `apps/desktop/test/*session*`, `*library*`.
- `docs/agents/brief-template.md`.

Expected to touch: the files above, their tests, and `docs/reports/library-surface.md`.

## Acceptance criteria

- [ ] Sidebar has Library/Outline tabs with ARIA and persisted active tab; Outline shows the active
      document and its empty state; Library shows the active library, filter and documents.
- [ ] One New note control (Library header); the global header `+` is gone; the Library `+` creates
      a note in the active library.
- [ ] The user can open a folder as a library, create a new library, switch between recents, and see
      only the active library's documents. Missing libraries are never recreated; Locate/Remove work.
- [ ] Recents persist, max 8, order by last opened, deduped by normalized realpath; a root that is a
      package or a nested library is rejected with a clear message.
- [ ] Switching flushes pending saves; open tabs stay; activating a tab from another known library
      updates the active library; a recent document opens its library.
- [ ] Move reconciliation by document id updates tabs/recents when the document is found; legacy
      path-only entries remain missing.
- [ ] No draft, trash, external-document, multi-root, search, backup or settings-version change.
- [ ] Existing assertions updated, none weakened; no fixed sleeps/native dialogs in tests.

## Tests and evidence

- Targeted while working: session/library unit tests, `node tests/ui/run.mjs --group shell`
  (build first), plus the specific new UI suite.
- End of task: one `npm run verify:fast` (boundaries, typecheck, unit, e2e). Do not run the full
  `npm run verify`; the Orchestrator runs it at integration.
- Screenshots: Library tab with switcher menu/recents/missing state, Outline tab, new-library modal,
  no-library/empty state, Data links.
- No native OS dialog may block a test: use the existing `NOTEFOREST_E2E=1` dialog guard and
  override it explicitly for the folder picker.

## Stop and ask

Stop and report when:

- the sidebar tab restructure needs a change outside the approved design (e.g. a new rail behavior);
- `libraries.json` would need a settings-schema change or a document-schema change;
- a library root outside the known roots would need external-document support (out of scope);
- the active-library/tab rule conflicts with the approved LD-03/LD-08 decisions;
- a live lock/read-only state blocks a library switch in a way the design did not cover;
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to L1 and L2.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with evidence.
- Open questions / risks.
- Next step (L3+L4 document lifecycle).
- Commit in the worktree; do not merge or push.
