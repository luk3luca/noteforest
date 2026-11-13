# L3 + L4 — Document lifecycle: drafts and document management

**Role:** Implementer / Builder
**Milestone:** Library & documents
**Base:** `main` head at delegation, **after** L1+L2 (`docs/tasks/library-surface.md`) is merged; the Orchestrator sets the exact commit
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 4 days

## Context

L1+L2 introduced the Library/Outline sidebar and the one-active-library model. This run closes the
file lifecycle: `+` creates a draft that materializes only on the first real modification (L3), and
documents can be renamed, revealed, and moved to the OS Trash with cleanup (L4). The approved model
and the LD decisions are in `docs/design/library-and-documents.md` (confirmed 13 November 2026).
External documents, multi-root, search, backup UI, R4 and R6 are outside this brief.

## Goal

One worktree, three ordered commits (review hardening, L3, L4), one `npm run verify:fast`,
targeted UI suites.

## In scope

### Commit H — L1+L2 review hardening

Small fixes from the L1+L2 integration review; no new product behavior beyond removing a dead control.

- Strengthen `apps/desktop/test/no-left-accent.test.ts`: the guard currently matches
  `nf-tree|nf-block-card|nf-card|nf-chapter|nf-library-row` and misses `.nf-block-body` (the actual
  Continuous card). Cover `nf-block-body`, `nf-block-inner`, `nf-page-card`/`nf-page-sheet` and the
  callout card; add a UI computed-style assertion on a selected Continuous block and on an anchor
  row (0 left border, full-row ring only). The product owner explicitly rejected left accent bars.
- Add the missing **failed-flush blocks a library switch** test: use the existing save-failure/flush
  test hook or a deterministic temp-package failure; assert the active library did not change and the
  error is surfaced. No fixed sleeps, no native dialog.
- Fix the **moved-recent with no open tab** stale `LibraryView.recent`: when
  `reconcileMovedDocuments` changes the recent-documents manifest, return a fresh
  `scanLibrary(root)` (or an explicit `recentChanged` flag) instead of the pre-reconciliation view;
  add a main/UI test for a moved recent with no open tab.
- Remove the dead disabled **Remove from Recent** menu item from the Library switcher (it is always
  disabled because the menu is anchored to the active library); the Data & About recent-library rows
  keep the real Remove action. Update the switcher test if it asserts the dead item.

### Commit L3 — Draft creation and materialization

- Add a main-process draft session: an in-memory document with `document.create` + first empty block,
  a stable `draftId`, a bound library path, and **no package folder, no lock, no recent entry**.
  `createDraft` returns a snapshot-like view the renderer can mount. The document id is generated at
  draft creation and never changes.
- Renderer: the tab key is `draft:<id>`; the tab title is “Untitled”; the editor mounts with the
  normal runtime/projection. The Library tab does **not** list the draft until materialization; the
  tab bar shows it.
- **First real mutation materializes** the package:
  - text edit (the first keystroke, not only the 800 ms debounced save), structural command, rename,
    asset import, per-document settings change, or export;
  - choose a unique package folder from the current title using the existing rules; acquire the
    lock with `breakStale: true` for the just-created path (stale/corrupt only; a live lock still
    fails); write `document.json` atomically; register the recent; add the document to the active
    library list;
  - swap the tab key/path **without remounting** the editor: selection, scroll, undo history and
    runtime identity survive;
  - no extra structural undo entry for materialization.
- Close/quit:
  - untouched draft → discarded, nothing written, no folder, no recent;
  - dirty draft → materialize/flush before close/quit; a save failure uses the existing save-failure
    policy and blocks a silent close;
  - drafts are not persisted in `shell-session.json`; after a relaunch only materialized documents
    remain.
- Bound library: the draft keeps the library active at creation. Switching libraries does not
  retarget it. If the bound library is missing at materialization, show a clear error and offer
  **Choose another library**/Retry; the draft stays in memory.
- Export from a draft materializes first; asset import materializes before writing the asset;
  per-document settings materialize (or are unavailable until then, but never silently lost).
- Multiple drafts are allowed; each has its own bound library and draft id.
- Tests: `+` writes nothing; first keystroke creates exactly one package; title/rename materializes;
  close/quit untouched writes nothing; dirty close/quit saves; undo/selection/scroll survive the
  path swap; export/asset/settings materialize; missing bound library error; stale lock broken, live
  lock fails; duplicate titles get unique folders; no draft in the session.

### Commit L4 — Rename, reveal, Move to Trash

- **Rename**: the existing document-title command from the Library row menu; the package folder name
  stays stable; no path/tab/recent churn. Inline dialog with validation; read-only/live-lock rules as
  today.
- **Reveal**: existing `revealDocumentPath` from the row menu.
- **Move to Trash**:
  - row menu and a confirmation dialog naming the title and path; primary **Move to Trash**, Cancel
    focused by default;
  - if the document is open, flush pending edits first; a failed flush blocks the trash with the
    save error;
  - refuse when a **live** lock is held by another session; stale/corrupt locks may be broken after
    the explicit confirmation; a newer-schema package gets a stronger warning; a missing package
    offers “Remove from recents” instead;
  - close the store and release the lock **before** the move; call Electron `shell.trashItem` (OS
    Trash), never a recursive delete;
  - on success: remove the recent entry, the per-document settings entry (document id first), the
    session tab, refresh the library list, close the tab and activate the next one; on failure: the
    file is untouched, the error is shown, and the document can be reopened;
  - the library folder itself can never be trashed from the app (LD-12).
- Tests: rename title only; reveal; trash an open and a closed document; confirm/cancel; flush
  failure; live lock refused; stale lock allowed; newer-schema warning; missing package; cleanup of
  recents/settings/session; next tab; trash failure leaves the file; no recursive delete; library
  remove remains recents-only.

## Out of scope

- Backup/restore UI (L5), external documents, multi-root workspaces, full-text search.
- R4 Export defaults, R6 Continuous settings, `settingsVersion` or document-schema changes.
- Changing the package format, Page/PDF, or the export pipeline.
- Folder rename to match the document title; library deletion.

## Files

Read:
- `docs/design/library-and-documents.md` (approved model and LD decisions).
- `apps/desktop/src/main/library.ts`, `main/index.ts`, `main/menu.ts`, `packages/core/src/node/store.ts`,
  `repository.ts`, `lock.ts`.
- `apps/desktop/src/shared/api.ts`, `preload/index.ts`, `renderer/src/state/runtime.ts`,
  `state/shell.ts`, `state/session.ts`, `actions.ts`, `shell/Sidebar.tsx`, `shell/Dialogs.tsx`,
  `shell/Workspace.tsx`, `export/export-flow.ts`, `main/export-*.ts`.
- Tests: `tests/ui/ui-batch-a.test.mjs`, `ui-document-status.test.mjs`,
  `tests/ui/v0-shell-frame.test.mjs`, `tests/ui/library-surface.test.mjs`,
  `apps/desktop/test/no-left-accent.test.ts`, `apps/desktop/test/library-roots-main.test.ts`,
  `apps/desktop/test/*runtime*`, `*session*`, `*library*`, `*export*`,
  `packages/core/test/storage.test.ts`, `repository.test.ts`.
- `docs/agents/brief-template.md`.

Expected to touch: the files above, their tests, and `docs/reports/document-lifecycle.md`.

## Acceptance criteria

- [ ] The no-left-accent guard covers `.nf-block-body`, block inner, page card/sheet and the callout
      card; a selected Continuous block and an anchor row have 0 left border and only the full-row
      ring.
- [ ] A failed flush blocks a library switch with the error; the active library is unchanged.
- [ ] A moved recent document with no open tab returns a fresh `LibraryView.recent` in the same
      launch; a main/UI test covers it.
- [ ] The dead disabled “Remove from Recent” switcher item is gone; Data & About still removes a
      recent library.
- [ ] `+` shows a draft tab; nothing appears in the library folder, recents, or locks until the first
      real modification.
- [ ] The first edit/command/rename/asset/export/settings change materializes one package in the
      bound library; the tab path changes without remounting; undo, selection and scroll survive.
- [ ] Untouched close/quit writes nothing; dirty close/quit saves; missing bound library blocks with
      a clear choice; stale locks break, live locks fail.
- [ ] Drafts are not persisted in the session; materialized documents are.
- [ ] Rename changes the title only; Reveal works; Move to Trash uses the OS Trash, flushes first,
      refuses a live lock, cleans recents/settings/session/store, closes the tab, and never deletes a
      library folder.
- [ ] No backup UI, external documents, multi-root, search, R4/R6 or schema change.
- [ ] Existing assertions updated, none weakened; no fixed sleeps/native dialogs in tests.

## Tests and evidence

- Targeted while working: core storage/lock, desktop runtime/session/export, the sidebar/library UI
  suite and `ui-batch-a`, `ui-document-status`, `v0-shell-frame` (build first).
- End of task: one `npm run verify:fast` (boundaries, typecheck, unit, e2e). Do not run the full
  `npm run verify`; the Orchestrator runs it at integration.
- Screenshots: draft before/after materialization, tab path swap with the editor state, missing bound
  library error, trash confirmation, trash success/next tab, trash failure, live-lock refusal,
  rename/reveal.
- No native OS dialog may block a test: use the existing `NOTEFOREST_E2E=1` dialog guard; the trash
  path is an OS call, so tests must use a temp package and assert the source path disappears (do not
  depend on Finder/Trash UI).

## Stop and ask

Stop and report when:

- the renderer runtime cannot survive the draft→package path swap without remounting or losing undo;
- the draft needs a package path before materialization for an operation the brief did not list;
- `shell.trashItem` is unavailable or fails in the test environment in a way that needs a product
  decision (never fall back to recursive delete);
- a live lock/read-only state needs a force-break or a spec change;
- the first-keystroke materialization is too slow in the real app (report the measurement);
- a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to H, L3 and L4.
- Files changed.
- Checks with real timings and suite counts.
- Acceptance criteria pass/fail with evidence.
- Open questions / risks.
- Next step (R4 Export defaults).
- Commit in the worktree; do not merge or push.
