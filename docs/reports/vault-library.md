# Vault library — phase 3 (S1–S3) implementation report

**Task:** `docs/tasks/vault-library.md`, slices **S1 (scan/node model)**, **S2 (tree/UI)**,
**S3 (move/trash/reconcile + Markdown backups)** in one commit
**Design:** `docs/design/vault-library.md` (approved 15 November 2026)
**Related design:** `docs/design/markdown-file-view.md`
**Role:** Implementer / Builder
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-9d8294c4-84ac95d1cf9024c3`
**Branch:** `t3/vault-library-s1-s3`
**Base:** `071fc93` (`main` head at delegation; the brief and design are in this base)
**Head:** the single commit on this branch; its SHA is reported in the handoff message (a report
cannot contain the hash of the commit that introduces it)
**Verdict:** **PASS** for S1–S3 acceptance, with the risks below.

---

## 1. Summary

### S1 — scan and node model

- A new recursive scanner (`packages/core/src/node/vault.ts`, exposed as
  `NodeDocumentRepository.scanVault`) builds the library tree in one read-only pass. Nodes are
  **folder**, **note** (a directory with `document.json`), and **Markdown guest file** (`.md`,
  `.markdown`, `.mdown`, `.mkd`).
- A directory without `document.json` is a **folder**, never `MISSING`, and empty folders are kept.
  A missing package exists only when the folder **looks like a package** (`assets/` or a
  `.noteforest` marker) but has no `document.json`; it stays a visible note row with the existing
  missing state so cleanup/recovery still work.
- Ignored: hidden entries (`.` prefix), `assets/` and `*.assets/` (never descended into), `.md.bak`
  and other `*.bak`/backup names, `backups/`, images and every other file, and **symlinks (never
  followed)**. Unreadable folders are a warning and stay folders.
- Deterministic order: folders, then notes, then Markdown; a case-insensitive name compare with a
  case-sensitive path tie-break inside each kind. `maxDepth` (default 8) and `maxEntries`
  (default 4000) bound a pathological tree; a folder at the depth limit is shown uncollapsed with a
  warning instead of disappearing.
- `shared/api.ts` gains **additive** `LibraryTreeNode` types and `LibraryView.tree`; the flat
  `documents`/`recent` fields keep working (notes + `.md`, recursive). A Markdown row never carries a
  block/chapter count. `LibraryDocumentKind` still drives the UI.
- The recursive scan is **cached per library root** and invalidated by every mutating library
  operation, by an explicit Refresh (`force`), by a root mtime change, and by scope changes (library
  or app-support switch). The renderer's own scan request is always forced, so a rename never shows
  a stale title. The sidebar filter is client-side; no scan happens per keystroke.

### S2 — tree/UI

- The sidebar Library is a `role="tree"` of nested `role="treeitem"` rows: expandable folder rows
  (chevron + folder icon), note rows (file icon, missing/unreadable badge preserved), and `.md` rows
  (accent file icon, `data-library-kind="markdown"`). Indentation is per level; the chevron rotates
  when expanded; the full-row button and the hidden `…` action keep the existing row contract.
- Expansion state persists in the shell session (`expandedLibraryFolders`, root-relative), is
  re-keyed by folder rename/move, and is cleaned when a folder is trashed. A filtered search keeps
  matching folders and force-expands them.
- Folder actions: **New folder…** (header button, folder menu, library switcher), **Rename folder…**,
  **Move to folder…**, **Reveal in Finder**, **Move to Trash…**. Note and `.md` rows gain a
  **Move to folder…** dialog entry. The Move dialog lists the library root plus every destination
  folder except the entry itself, its descendants, and its current parent; it is a real radio group
  (keyboard-reachable and testable, no drag/drop dependency).
- Empty, missing-library, no-library, empty-filter, and unreadable-folder states are rendered; a
  missing package keeps its status label/reason; the `.md` row opens the Markdown guest view (asserted
  in the UI suite: no block cards, chapters, page counter, Page/PDF/export controls, no runtime).
- **Read mode keeps the tree navigation-only** for vault mutations: the header New folder button and
  the folder menu's New/Rename/Move/Trash entries are disabled with the shared `Read mode —` reason,
  and the note/Markdown Move entries are gated the same way. Opening documents, expanding folders and
  Reveal stay available. (Existing app-level actions such as New note, New library and note Move to
  Trash are unchanged.)

### S3 — move/trash/reconcile and Markdown backups

- Externally visible operations live in the main process: `createVaultFolder`, `renameVaultFolder`,
  `moveVaultEntry`, the extended `trashPreflight`/`trashDocument`, and `revealVaultEntry`. Every
  operation validates library membership, name rules (no separators, no leading dot, no `assets`/
  `*.assets`/backup name, no Markdown extension, ≤ 120 chars), refuses a library root, an existing
  destination, a note package as a destination folder, and a folder moved inside itself.
- The renderer **flushes** open notes (committing a Page Edit first) and dirty Markdown files, flushes
  pending settings writes, then closes the affected tabs before a move/rename/trash; the main process
  re-checks `hasUnsavedChanges` and live locks and refuses with `unsaved`/`locked` without changing
  anything. Refusals reopen the closed tabs.
- Reconciliation follows the existing document-id path: a note move/rename remaps session tabs
  (including `activeTab`), recent-document entries and durable per-document settings paths, and
  returns the from→to moves so the renderer reopens the tabs at their new paths. A `.md` move follows
  by path (session tab only; no settings entry). A folder move/rename applies the same prefix remap
  to descendants and to expanded-folder paths.
- Explicit **Refresh** now also reconciles externally moved packages by document id and returns
  `reconciledTabs`, so a Finder move/rename is picked up without touching the file.
- **Markdown backups moved to app support**: `<appSupport>/backups/markdown/<sha256(canonical
  path)>/previous.md` plus `meta.json` (`path`, `savedAt`, `mtime`, `size`, `hash`, `version: 1`).
  One previous copy, written before the atomic save only when the content changed, overwritten on the
  next change, no rotation. **No `<name>.md.bak` is created any more**; the library ignores existing
  `.md.bak` files (and they may be deleted manually). The conflict dialog copy says "one previous copy
  in app support (never in your library)".

No document schema, `settingsVersion`, Page/PDF/export, layout, showcase, or document-content rule
changed. No migration/back-compat layer was built. No user library folder was deleted or rewritten by
this task; tests use temp vaults and the OS Trash.

---

## 2. Files changed

### Core

- `packages/core/src/node/vault.ts` — new recursive scan, node/row types, ignore policy, ordering,
  limits, warnings.
- `packages/core/src/node/repository.ts` — `scanVault` on the repository interface and implementation.
- `packages/core/src/node/index.ts` — export the vault module.
- `packages/core/src/markdown.ts` — new pure Markdown naming rules (extension list, file name,
  title), one source for core and the desktop shared contract.
- `packages/core/src/index.ts` — export the Markdown naming module.
- `packages/core/test/vault-scan.test.ts` — new scan tests.

### Main / shared / bridge

- `apps/desktop/src/shared/api.ts` — additive `LibraryTreeNode` types, `LibraryView.tree`,
  `VaultEntryKind`/`VaultActionResult`/moves, `CreateVaultFolderInput`/`MoveVaultEntryInput`,
  `TrashPreflight.kind`/`contained`, `SessionState.expandedLibraryFolders`, new API methods
  (`revealVaultEntry`, `createVaultFolder`, `renameVaultFolder`, `moveVaultEntry`), Refresh now
  returns a library action with reconciled tabs, Markdown save/backup docs updated.
- `apps/desktop/src/shared/markdown.ts` — re-exports the core naming rules; keeps the size cap,
  fingerprint, and image classification.
- `apps/desktop/src/main/library.ts` — recursive scan wiring + cache, tree/document mapping, session
  expanded folders, `refreshLibrary` (force + reconcile), vault folder/move operations, folder and
  Markdown trash, contained cleanup, path remap for session/recents/settings.
- `apps/desktop/src/main/document-settings.ts` — `remapDocumentSettingsPaths` (queued read-modify-write
  after a move/rename).
- `apps/desktop/src/main/markdown-file.ts` — app-support backup before the atomic save; injectable
  app-support/save time; no `.md.bak`.
- `apps/desktop/src/main/markdown-backup.ts` — new backup path/meta/write/read module.
- `apps/desktop/src/main/index.ts` — `library:scan` forced, `library:refresh` reconciling,
  `vault:create-folder`, `vault:rename-folder`, `vault:move`, `vault:reveal`; Markdown save receives
  the app-support root.
- `apps/desktop/src/preload/index.ts` — the new bridge methods/types.

### Renderer

- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — recursive Library tree (folders/notes/`.md`),
  expansion, filtered tree, folder menu, header New folder, open/missing states.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — New folder, Rename folder, Move entry dialogs;
  folder/Markdown trash copy with contained counts; Markdown conflict copy.
- `apps/desktop/src/renderer/src/actions.ts` — vault actions (create/rename/move/trash/reveal),
  flush-and-close-before-change, reopen on refusal, tab remap, folder menu, Read-mode gating,
  note/`.md` "Move to folder…" entries, reconciling Refresh.
- `apps/desktop/src/renderer/src/state/shell.ts` — expanded folder state and the three new dialogs.
- `apps/desktop/src/renderer/src/state/session.ts` — persist `expandedLibraryFolders`.
- `apps/desktop/src/renderer/src/state/memory-document-gateway.ts` — empty tree for the in-memory
  library view.
- `apps/desktop/src/renderer/src/App.tsx` — restore expanded folders; test probe exposes the tree and
  expansion state.
- `apps/desktop/src/renderer/src/styles.css` — tree rows, folder chevron/indent, move-target list.

### Tests / evidence

- `apps/desktop/test/vault-main.test.ts` — new main-process tests (folders, rename/move guards,
  session/recents/settings follow, live lock/unsaved refusal, folder/Markdown trash with contained
  cleanup, external move reconciliation, scan cache).
- `apps/desktop/test/markdown-save.test.ts` — rewritten for the app-support previous copy: path/meta,
  overwrite, no `.md.bak`, conflict/no-op/large-file write no backup.
- `apps/desktop/test/recovery-library.test.ts` — updated to the phase-3 node model: an empty folder is
  a folder, and a package-like folder without `document.json` keeps the missing row.
- `tests/ui/vault-library.test.mjs` — new UI suite (tree/`.md` guest view/expansion persistence,
  folder create/rename/move with tab follow, Read-mode gating, folder trash).
- `tests/ui/markdown-file-view.test.mjs` — asserts the app-support previous copy + `meta.json` and that
  no `.md.bak` exists.
- `tests/ui/suites.mjs` — registers `vault-library.test.mjs` (FILES, shell group) and runs it serially
  after the pool (real OS Trash).
- `artifacts/vault-library/*.png` — screenshots (disposable, gitignored).

---

## 3. Checks run

| Check | Command | Result |
|---|---|---|
| Boundaries | `npm run check:boundaries` | PASS — 250 files, 1,202 imports, 16 rules |
| Typecheck | `npm run typecheck` | PASS — desktop, core, layout, pdf |
| Unit (all) | `npm test` | PASS — **145 files / 1,441 tests**, 5.95 s |
| Vault scan unit | `npx vitest run packages/core/test/vault-scan.test.ts` | PASS — 11 tests, 0.19 s |
| Vault main unit | `npx vitest run apps/desktop/test/vault-main.test.ts` | PASS — 15 tests, 1.24 s |
| Markdown save unit | `npx vitest run apps/desktop/test/markdown-save.test.ts` | PASS — 9 tests, 0.22 s |
| Critical e2e | `npm run e2e` (via `verify:fast`) | PASS — 16/16, suite ~35 s, total 43.5 s |
| **Fast gate** | `npm run verify:fast` | **PASS** — 56.5 s wall (final run) |
| Vault UI | `node --test tests/ui/vault-library.test.mjs` | PASS — 3/3 tests, 11.1 s |
| Markdown UI | `node --test tests/ui/markdown-file-view.test.mjs` | PASS — 5/5 tests, 17.6 s |
| Library + shell UI | `node --test --test-concurrency=2` on `library-surface` + `v0-shell-frame` | PASS — 15/15, 18.2 s |
| Batch A + Read gate UI | `node --test --test-concurrency=2` on `ui-batch-a` + `m4b1a2-read-mode-gating` | PASS — 9/9, 20.5 s |
| Lifecycle UI (serial) | `node --test tests/ui/document-lifecycle.test.mjs` | PASS — 9/9, 17.4 s |
| Shell/settings UI (3 workers) | `m2-shell` + `ui-batch-v` + `settings-shell-layout` | PASS — 12/12, 15.1 s |
| Status/editor/overlay UI (3 workers) | `ui-document-status` + `editor-surfaces` + `ui-overlay-command-gate` | PASS — 18/18, 16.7 s |

No full `npm run verify` was run; the Orchestrator owns the integration run. Targeted UI ran at
concurrency ≤ 3. No fixed sleeps and no native dialogs were used; the trash flow uses the real OS
Trash on temp-vault fixtures.

### Evidence (screenshots)

Visible-window runs at 1440 × 900; paths are repo-relative and gitignored:

- `artifacts/vault-library/library-tree.png` — the recursive tree after a relaunch: folders first
  (`Archive`, `Personale`, `Università` → `Analisi` → `Serie uno`), the root note, and the `diario.md`
  row with the accent file icon; the `.md` guest view is open (Markdown badge, no Page/PDF chrome).
  Ignored `diario.md.bak`, `diario.assets/`, `photo.png`, and `.hidden.md` are absent.
- `artifacts/vault-library/library-tree-before-move.png` — note row and folder rows with the aligned
  icon column, active-row ring, and the `…` row action.
- `artifacts/vault-library/move-dialog.png` — “Move “Nota in radice”” with the destination radio list
  (library root, folders with indentation, the current parent excluded).
- `artifacts/vault-library/library-tree-after-move.png` — the note inside `Rinominata` (expanded) and
  its tab still open; the folder was created and renamed in the same flow.
- `artifacts/vault-library/library-read-gating.png` — Read mode: New folder disabled with the shared
  reason, folder menu entries disabled.
- `artifacts/vault-library/folder-trash-dialog.png` — “Move folder to Trash?” naming the folder, its
  path, and the contained counts (`1 note, 0 Markdown files, and 1 folder inside`).
- `artifacts/vault-library/library-after-folder-trash.png` — the folder gone, its tab closed, the
  library rescanned.
- Backups: the UI suite asserts `previous.md` + `meta.json` under
  `<support>/backups/markdown/<sha256>/` and that no `<name>.md.bak` exists; the files are disposable
  test artifacts under `artifacts/vault-library-temp/`.

---

## 4. Acceptance criteria

### S1 — scan and node model

| Criterion | Status | Evidence |
|---|---|---|
| Recursive tree: folders, note packages, `.md`; folder without `document.json` is a folder, never `MISSING` | **PASS** | `vault.ts`; core + main tests (`never treats an arbitrary folder as a missing note`) |
| Missing package only when the folder looks like one (`assets/` or `.noteforest`) | **PASS** | `looksLikePackage`; core test `keeps a package-like folder as a missing note row`; recovery-library test |
| Empty folders persist | **PASS** | core + main + UI (`Personale` visible, expanded with no children) |
| Ignore `assets/`, `*.assets/`, hidden entries, `.md.bak`, backup dirs, images and other files | **PASS** | core ignore test; UI fixture asserts none is a row; unit ignores `.md.bak` |
| Never follow symlinks | **PASS** | core test (directory and file symlink skipped) |
| Deterministic order (folders/notes/`.md`, case-insensitive, path tie-break) | **PASS** | comparator + scan test; UI DOM order assertion |
| Depth limit, cached/lazy refresh, no scan per keystroke | **PASS** | `maxDepth`/`maxEntries` tests; cache test; sidebar filter is client-side |
| Additive tree types in `shared/api.ts`; document/recent fields still work; no fake `.md` counts | **PASS** | `LibraryView.tree` added, `documents`/`recent` unchanged; Markdown rows `blockCount`/`chapterCount` 0 |
| Root safety: no descent into assets; unreadable folder is a warning | **PASS** | core tests (assets never descended, unreadable folder warning) |

### S2 — tree/UI

| Criterion | Status | Evidence |
|---|---|---|
| Library tree with expand/collapse, note rows, `.md` rows with a file icon | **PASS** | UI suite; `library-tree.png` |
| Folder create, rename, reveal, Move to Trash (OS Trash, never the library root) | **PASS** | UI create/rename/trash; `.nf-library-folder-row` menu includes Reveal; main refuses the root; main trash tests |
| Move a note or `.md` between folders; folder move carries descendants | **PASS** | UI note move (dialog + tab follow); main folder/markdown move tests |
| Empty folders remain; missing package uses the existing missing state; `.md` missing uses the guest banner | **PASS** | empty folder UI; missing package row/label UI + main; `.md` missing banner is the existing M2 path (open file deleted → banner) |
| Read mode: navigation only, no mutation | **PASS** | UI gating test + `library-read-gating.png` |
| Existing full-row selection/ARIA stays | **PASS** | `library-surface`, `ui-batch-a`, `v0-shell-frame`, `document-lifecycle` green; tree rows keep `data-active` ring + `…` |
| `.md` rows open the Markdown guest view; no forest/Page/PDF | **PASS** | UI asserts no block cards/chapters/page/export and no runtime |

### S3 — move/trash/reconcile and Markdown backups

| Criterion | Status | Evidence |
|---|---|---|
| Flush before moving an open note/ancestor folder; live lock refuses | **PASS** | renderer flush-and-close + main `unsaved`/`locked` guards; main tests; UI note move |
| Note move follows session/recents/settings via document-id reconciliation | **PASS** | main test asserts session tab, active tab, recents, settings path; UI asserts the tab follows |
| `.md` move follows by path; no settings entry | **PASS** | main test asserts session tab and no settings file |
| Folder delete: OS Trash, confirm, never root; clean recents/session/settings of contained notes; no silent deletion | **PASS** | main folder-trash test (recents/session/settings cleaned, folder in the fake trash); root refusal test; UI real-Trash flow |
| External rename/move reconciles on refresh/open; missing packages stay visible | **PASS** | `refreshLibrary` reconciliation test (tab path follows); missing row tests |
| Markdown backups in app support (path/meta, one copy, before atomic save when changed, no rotation); no `<name>.md.bak` | **PASS** | markdown-save unit (path/meta/overwrite/no-op/conflict), UI (no `.bak`, `meta.json`, second save replaces) |
| Existing `.md.bak` files ignored by the library; no migration layer | **PASS** | core ignore test; UI fixture contains one and it is not a row |

---

## 5. Risks and known limitations

1. **Read-mode gating scope.** Vault mutations are blocked while a note is open in Read mode, per the
   design's “tree navigation only”. Existing app-level actions that were never Read-gated (New note,
   New library, note Move to Trash, note rename) keep their previous behavior. If the product wants
   all library actions gated or none, that is one follow-up decision, not a hidden change here.
2. **Move is a dialog, not drag-and-drop.** It satisfies the brief's “drag/drop or Move dialog”, is
   keyboard reachable, and avoids a drag gesture that the current tree does not model. Drag/drop can
   be added later as a second path to the same action.
3. **The move/rename flow closes and reopens affected tabs.** Undo history and scroll position of a
   moved note are not preserved across the move (the file and document id are). This is the simplest
   correct path with the current path-keyed runtime and avoids two editors on one package.
4. **A folder move/rename with an open note whose Page Edit overlay is active** is blocked unless the
   overlay commits; the renderer commits it first and refuses the move if it cannot.
5. **Scan cache behaviour.** A nested external change (a file added inside a folder) is not visible
   until Refresh, by design (refresh on open and explicit refresh). Root-level external changes bump
   the root mtime and invalidate the cache immediately. The cache holds only the last scanned root.
6. **Depth/entry limits.** Trees deeper than 8 folder levels or with more than 4,000 entries are
   truncated with a visible library warning; the folders at the limit stay visible and uncollapsed.
   Both bounds are constants, not settings.
7. **Backup identity is the canonical absolute path.** Moving/renaming a `.md` leaves the old backup
   directory behind (documented in `markdown-backup.ts`); a cleanup pass/restore UI is future work.
   No rotation exists in v1.
8. **Folder trash uses the real OS Trash in tests.** `document-lifecycle` already did this; the new
   suite is registered as serial for the same reason. Test items are temp-vault fixtures only.
9. **A package-like folder without `document.json` is still a “note” row**, not a folder, so it cannot
   be renamed/moved as a folder. That preserves the existing missing-package recovery/cleanup menu;
   the folder itself can still be moved with Finder.
10. **Tree keyboard model.** Every row and folder toggle is a native button reachable with Tab; there
    is no roving arrow-key tree navigation (the same model as the previous flat Library list). The
    outline tree keeps its React Aria keyboard model.
11. **Reveal in Finder for a folder is implemented and listed in the menu but not click-tested**
    (clicking would open Finder on the test machine); the bridge validates library membership and uses
    `shell.showItemInFolder`.

## 6. Open questions

- Should Read mode also gate app-level library actions (New note, New library, note Move to Trash), or
  should vault mutations stop being gated for consistency? The current split follows the design text
  and preserves existing behavior.
- Manual-break semantics and Document health are untouched; no product decision was needed here.

## 7. Next step

Targeted **phase-3 Sentinel review** of this branch (scan/model, tree/UI, move/trash/reconcile,
Markdown backups), then integration. Document health is phase 4 and remains unstarted.
