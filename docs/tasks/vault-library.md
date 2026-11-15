# Phase 3 — Vault library (folders, guest files, assets, backups)

**Role:** Implementer / Builder
**Phase:** 3 (moved ahead of Document health and the activity bar, 15 November 2026)
**Base:** `main` at delegation
**Worktree:** created by the delegate; one commit; no merge or push
**Design:** `docs/design/vault-library.md` (approved 15 November 2026)
**Timebox:** 3 days

## Why now

The flat library treats every folder without `document.json` as a missing note (`note` shows
`MISSING`), and the root now mixes note packages, `.md` guest files, images and `.md.bak`. Before
Document health or the activity bar, the library needs one clear node model. No legacy files exist:
the test vault can be rewritten; do not build a migration layer.

## Scope (S1–S3 in one commit)

### S1 — scan and node model

- Replace the one-level `repository.list` with a recursive tree:
  - **Folder**: directory without `document.json`, not an asset/backup folder; empty folders kept.
  - **Note**: directory with `document.json` (document id + path).
  - **Markdown guest**: `.md` file (path).
  - **Ignored**: `assets/` inside a note, `*.assets/` siblings, hidden entries, `.md.bak`, backup
    dirs, images and other files; never follow symlinks.
- A folder that is not a package is never reported as `MISSING`. A missing package is a folder that
  looks like a package (contains `assets/` or a `.noteforest` marker) but has no `document.json`.
- Deterministic order: folders first, then notes, then `.md`, case-insensitive name, stable path
  tie-break. Recursive with a depth limit; cache/lazy refresh; no scan per keystroke.
- Additive tree types in `shared/api.ts`; keep existing document/recent fields working. Do not fake
  block/chapter counts for a `.md`.
- Root safety: never descend into `assets/`/`*.assets/`; missing/unreadable folder is a warning,
  not a note.

### S2 — tree/UI

- Sidebar Library becomes a tree: expand/collapse folders, note rows, `.md` rows with a file icon.
- Folder create, rename, reveal, Move to Trash (OS Trash; never the library root).
- Move a note or `.md` between folders (drag/drop or Move dialog); folder move moves descendants.
- Empty folders remain; missing folder uses the existing missing state; `.md` missing uses the
  guest-file missing banner.
- Read mode: navigation only, no mutation. Existing full-row selection/ARIA stays.
- `.md` rows continue to open the Markdown guest view; no forest/Page/PDF.

### S3 — move/trash/reconcile and Markdown backups

- Flush before moving an open note or an ancestor folder; a live lock refuses with a reason.
- Note move: session tab, recent and per-document settings follow via the existing document-id
  reconciliation. `.md` move: session/recent follow by path; no settings entry.
- Folder delete: OS Trash, confirm, never the root; clean recents/session/settings of contained
  notes; no silent deletion.
- External rename/move: reconcile on refresh/open; missing packages remain visible.
- **Markdown backups move to app-support** (remove `<name>.md.bak`):
  - path: `appSupport/backups/markdown/<sha256(absolute path)>/previous.md` + `meta.json`
    (path, savedAt, mtime, size, hash);
  - one previous copy before each atomic save when content changed; no rotation;
  - existing `.md.bak` test files are ignored by the library and may be deleted manually; no
    migration layer.
- Library policy: hide `*.assets/`, `assets/`, images, `.md.bak`, backups and hidden files; show
  only folders, note packages and `.md`.

## Out of scope

- Markdown-native forest, anchors/branches in `.md`, Page/PDF/export for `.md`.
- Copying an image from a `.md` into a note's asset store (follow-up; current copy/paste test covers
  text/table/formula/code).
- Document health, activity bar, find bar, manual breaks, search, tags, sync.
- Schema/settingsVersion/Page/PDF/anchor/layout/showcase changes.
- Legacy migration; the test vault is disposable.

## Files

`packages/core/src/node/repository.ts` (tree/scan), `apps/desktop/src/main/library.ts`,
`apps/desktop/src/shared/api.ts`, `apps/desktop/src/renderer/src/shell/Sidebar.tsx`,
`state/shell.ts`/`session.ts`, new folder/move dialogs, `styles.css`, Markdown save/main path
(`markdown-save.ts`, `main/markdown-file.ts`), tests. Reuse the existing trash/flush/document-id
reconciliation; no duplicate path.

## Tests and evidence

- Unit: recursive scan with nested folders, empty folder, note, `.md`, `*.assets`, `assets/`,
  `.md.bak`, image, hidden, symlink, unreadable, deterministic order. Main: folder CRUD/move/trash,
  note/`.md` move, session/recents/settings follow, live lock, root protection, contained cleanup.
  Markdown: no `.md.bak`; app-support previous backup; library ignores it.
- UI: tree expand/collapse, folder create/rename, drag/move, missing folder, `.md` row, read gating,
  screenshots.
- `npm run verify:fast`; no full verify (Orchestrator at 4). Targeted UI at concurrency ≤ 3.
- Report `docs/reports/vault-library.md`: per-slice summary, files, checks/timings, PASS/FAIL,
  risks, next step. One commit; worktree/branch/head.
