# Vault library — folders, guest files, assets and backups

**Status:** approved direction (15 November 2026). First implementation slice is phase 3.
**Scope:** make the library a recursive vault of folders, note packages and Markdown guest files,
with a clear policy for assets and backups. No Markdown-native notes, no tags, no sync.
**Related:** `docs/design/library-and-documents.md`, `docs/design/markdown-file-view.md`,
`docs/plan.md`. **No legacy files exist**: the test vault can be rewritten; no migration layer.

## 1. Problem

The library is still flat: every folder is treated as a note package, so an empty folder or an
image folder shows as `MISSING`; `.md` guest files, images and `.md.bak` share the root with note
packages. As soon as the vault has folders, assets and backups, the flat model becomes noise.

The user also wants Markdown assets to stop “wandering” next to the root. The answer is a clear
ownership boundary, not a second note format.

## 2. Node model

```text
Library root/
  Università/                 ← folder
    Analisi/
      serie-1/                ← note package (document.json + assets/)
      serie-2/
  Personale/                  ← folder
  diario.md                   ← Markdown guest file
  diario.assets/              ← hidden asset folder for diario.md
  markdown-test.md
  markdown-test.assets/
```

| Node | Detection | Identity |
|---|---|---|
| **Folder** | directory without `document.json`, not an asset/backup folder | path |
| **Note** | directory with `document.json` | document id + path |
| **Markdown guest file** | `.md` file | path |
| **Asset folder** | `assets/` inside a note, or `*.assets/` sibling of a `.md` | not a node |
| **Backup / image / other file** | `.md.bak`, images, `.noteforest/`, hidden files | not a node |

A folder may be empty and still appear. A missing package is only a folder that **looks like a
package** (contains `assets/` or a `.noteforest` marker) but has no `document.json`; an arbitrary
folder is a folder.

## 3. Scan rules

- Recursive from the library root; deterministic depth-first order: folders first, then notes,
  then `.md` files, by case-insensitive name; stable tie-break by path.
- Skip hidden entries (`.` prefix), `assets/` inside a note, `*.assets/` siblings, `.md.bak`,
  backup directories, and symlinks (never follow).
- Do not descend into a note package's `assets/` or into `*.assets/`.
- Depth limit for pathological trees; lazy/cached scan; refresh on library open and explicit
  refresh, not per keystroke.
- Empty folder: kept. Unreadable folder: warning, still a folder. Missing root: existing missing
  state.
- File names are not normalized; case-insensitive ordering, case-sensitive paths on macOS.

## 4. Asset policy

### Note packages

Images are canonical assets inside the package:

```text
serie-1/
  document.json
  assets/<content-hash>
```

The app owns them; copy/paste between notes copies bytes into the destination `assets/`.

### Markdown guest files

A `.md` is an external file: the app **does not own or move its images**. It resolves relative
paths against the `.md` folder and never fetches remote images.

Convention for files the app creates or test files:

```text
diario.md
diario.assets/
  image.png
```

```md
![alt](diario.assets/image.png)
```

`*.assets/` is hidden from the library tree and ignored by the scan. An external `.md` that uses
`images/` or same-folder images still works; the convention is recommended, not enforced.

### Copy/paste into a note

- text/table/formula/code: already rich nodes;
- image: copy the bytes into the destination note's `assets/` and create the canonical image node.
  This is a follow-up (M2 excluded images); never paste a raw file path into a note.

## 5. Backup policy

**No `.bak` in the vault.** The M2 `<name>.md.bak` next to the file is removed. Backups live in
app-support, like note backups:

```text
~/Library/Application Support/NoteForest/backups/markdown/<sha256(path)>/
  previous.md
  meta.json          path, savedAt, mtime, size, hash
```

- One previous copy, written before each atomic save when the content changed; overwritten.
- No rotating history in v1; a future “File recovery” can add N snapshots.
- Path identity: moving/renaming a `.md` leaves the old backup directory; a cleanup pass removes
  orphan backup dirs older than a documented window. Restore UI is future.
- Existing `.md.bak` test files: no migration; the library ignores them and they can be removed
  manually (no real user data).

## 6. UI

- Sidebar Library becomes a tree: folders expand/collapse, notes, `.md` files with a file icon.
- Create folder, rename, reveal, Move to Trash (OS Trash; never the library root); move a note or
  `.md` between folders (drag/drop or Move dialog).
- Empty folders persist; missing folder shows the existing missing state; `.md` missing uses the
  guest-file missing banner.
- No document tabs change; the activity bar is phase 5.
- Read mode: tree navigation only; no structural mutation.

## 7. Move, lock and reconciliation

- Flush before moving an open note or an ancestor folder; a live lock refuses the move with a
  reason; stale-lock rules unchanged.
- Note move: session tab, recent, per-document settings follow via the existing document-id
  reconciliation.
- `.md` move: session tab/recent follow by path; no document settings entry; backup directory is
  path-keyed and stays orphaned until cleanup.
- Folder delete: OS Trash, confirm, never the root; clean recents/session/settings of contained
  notes; no silent deletion.
- External rename/move: reconcile on library refresh/open; missing packages remain visible.
- A folder that is not a package is never reported as a missing note.

## 8. Tests

- Unit scan: nested folders, empty folder, note, `.md`, `*.assets`, `assets/`, `.md.bak`, image,
  hidden file, symlink, unreadable folder, deterministic order, depth.
- Main: create/rename/move/trash folder; move note into/out of a folder; move `.md`; open tab,
  session, recents, per-document settings follow; live lock refuses; root protected; contained
  cleanup.
- Markdown: no `.md.bak` is created; app-support previous backup exists; save/restore path; library
  ignores the backup.
- UI: tree expand/collapse, folder CRUD, drag/move, missing folder, `.md` row, read gating,
  screenshots.
- No fixed sleeps/native dialogs; no schema/settingsVersion/Page/PDF/export/showcase change.

## 9. Slices

- **S1 — scan/model**: recursive node model, ignore policy, asset/backup policy, tests.
- **S2 — tree/UI**: sidebar tree, folder CRUD, `.md` rows, empty/missing states.
- **S3 — move/trash/reconcile**: folder move, note/`.md` move, flush/lock, recents/session/settings,
  app-support Markdown backup move (remove `.md.bak`).

## 10. Decisions

1. Folder order: folders first, then notes, then `.md`, case-insensitive (recommended).
2. Empty folders: kept and visible (recommended).
3. Asset folder convention: `*.assets/` hidden; `assets/` only inside note packages.
4. Ignore images/backups/other files; no “Files” section in v1.
5. Markdown backups: app-support, one previous copy, no `.bak` in the vault.
6. No legacy migration; test vault files can be rewritten/deleted.
7. Copy image from `.md` to note: copy bytes into the destination note assets (follow-up).
