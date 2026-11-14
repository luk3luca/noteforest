# Phase 5 — vault folders

**Role:** Implementer / Builder
**Phase:** 5 (post-A–F)
**Base:** `main` at delegation
**Worktree:** created by the delegate; one commit per slice; no merge or push
**Timebox:** 2 days per slice

## Product model

The library becomes a **vault**: nested folders that contain note packages (a folder with
`document.json`) and, after phase 2, `.md` guest files. This is navigation/organisation only; the
canonical document format does not change.

```text
NoteForest/
  Università/
    Analisi/
      serie-1/        ← note package
      serie-2/
  Personale/
    diario/
  imported.md       ← Markdown file view (phase 2)
```

Today `repository.list` only scans one level; a folder containing notes is misreported as a broken
package. This phase replaces that with a recursive tree.

## S1 — scan and tree model

- Recursive scan of the library root, depth-limited and lazy where practical.
- A node is a **note** when the folder contains `document.json`; a **folder** otherwise (even if
  empty); a **file** when it is a `.md` file (phase 2) or an unrecognised file (shown read-only or
  ignored per policy).
- Never descend into a note package's `assets/`, backups, or hidden folders; skip dotfiles and
  symlinks (or show them as unsupported, never follow loops).
- Keep the externally visible shape additive: `LibraryView` gains a tree/folders list; existing
  document/recent fields keep working. Do not break the flat-library tests without updating them for
  the intentional tree contract.
- Order: folders first, then notes/files, by name (case-insensitive) unless the product owner asks
  otherwise; stable and deterministic.
- Performance: cache the scan; do not rescan on every render/keystroke; expose a refresh after
  external changes.

## S2 — sidebar tree and folder operations

- Sidebar Library becomes a tree: expand/collapse folders, note rows, `.md` file rows with a file
  icon. Selection and full-row behavior follow the existing shell.
- Create folder, rename folder, reveal in Finder, Move to Trash (OS Trash; never the library root).
- Drag/drop or a Move dialog for notes/files between folders; folder move moves descendants.
- Empty folders persist; a missing folder shows the existing missing state.
- Search/recents/session paths update after moves; recents show the new path.

## S3 — move, lock and reconciliation

- Flush an open note before moving it or its ancestor folder; a live lock blocks the move with a
  reason; stale-lock rules stay.
- Moved note: session tab, recent, and per-document settings must follow. Reuse the existing
  document-id reconciliation; extend it to folder moves and to `.md` paths (path identity).
- Folder delete: OS Trash, confirm, never trash the library root; cleanup recents/session/settings
  for contained notes; no silent deletion.
- External folder rename/move: reconcile on library refresh/open; missing packages stay visible.
- `.md` files: rename/move/trash by path; no document id, no settings entry.

## Out of scope

- Virtual folders, tags, smart folders, cross-library search, sync.
- Markdown-native notes (only the phase-2 file view).
- A second library root or multiple roots in one window.
- Folder-level sharing/permissions.

## Files

`packages/core/src/node/repository.ts` (list/tree), `apps/desktop/src/main/library.ts`,
`apps/desktop/src/shared/api.ts` (tree types), `renderer/src/shell/Sidebar.tsx`,
`state/shell.ts`/`session.ts`, dialogs for rename/move, `styles.css`, tests. Reuse document-id
reconciliation and trash code; do not duplicate.

## Tests

- Unit: recursive scan with note/folder/empty/hidden/assets/backup/symlink fixtures; deterministic
  order; missing/unreadable package.
- Main: create/rename/move/trash folder; note moved into/out of a folder; open tab/session/recents
  updated; per-document settings follow; live lock refuses move; folder trash cleans contained
  recents/session; library root never trashed.
- UI: tree expand/collapse, folder create/rename, drag/move, missing folder, `.md` row, recents path,
  Read-mode gating; screenshots.
- No fixed sleeps/native dialogs; no schema/settingsVersion/Page/PDF/export/showcase change.

## Acceptance

- [ ] Recursive tree with folders/notes/`.md`; no broken-package false positives; assets/hidden
      excluded; deterministic order.
- [ ] Folder CRUD + move + OS Trash; root protected; empty folders.
- [ ] Session/recents/settings follow moves; locks/flush/refusal rules.
- [ ] Existing library/document-lifecycle behavior preserved; assertions updated only for the tree
      contract.
- [ ] No full verify; the Orchestrator runs it at 4.

## Report

- `docs/reports/vault-folders.md`: per-slice summary, files, checks with timings, PASS/FAIL, risks,
  next. One commit per slice; worktree/branch/head.
