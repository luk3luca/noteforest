# Library & documents — design

**Status:** Draft for product-owner review. No implementation.
**Date:** 13 November 2026.
**Scope:** one active library per window, a Library/Outline sidebar split, deferred document
creation (drafts), and document lifecycle (rename, reveal, move to Trash). Multi-root workspaces,
external documents, search, and backup UI are explicitly future.
**Inputs:** `docs/adr/0008-personal-page-settings.md`, `docs/design/ui-shell-contents.md`,
`docs/design/ui-settings-contents.md`, the R1 data-recovery work, the UI/sidebar fix batch, and the
product-owner review of 13 November 2026.

---

## 0. Terms

| Term | Meaning |
|---|---|
| **Library** | A folder chosen by the user that contains NoteForest document packages as direct subfolders. `~/Documents/NoteForest` is the default. |
| **Document package** | One note: a folder with `document.json` and `assets/`. It is self-contained and can be moved without losing content. |
| **Draft** | A note that exists only in memory: no package folder, no lock, no recent entry. It materializes on the first real modification. |
| **Workspace** | A future set of multiple libraries open together. **Not in this milestone.** |
| **External document** | A package opened from outside every known library. **Not in this milestone**; the model leaves room for it. |

“Library” stays the user-facing term. “Workspace” is reserved for the future multi-root feature.

---

## 1. Goals

1. The user can keep several independent sets of notes (study, work, archive) and switch the active
   library without copying files.
2. The sidebar has two surfaces: **Library** (library switcher + documents + file management) and
   **Outline** (the active document's chapters and blocks), instead of stacking both in one scroll.
3. `+` creates a note only when the user actually writes something; untouched “Untitled” folders do
   not accumulate.
4. The user can rename a document, reveal it in Finder, and move it to the OS Trash without leaving
   the app; the library folder itself can never be deleted from the app.
5. Moving a library folder or a document package does not lose per-document settings or silently
   break open tabs and recents.

## 2. Non-goals

- Multiple libraries open at once (VS Code-style multi-root workspace).
- Opening a single package from outside the known libraries (external documents).
- Importing/copying a folder of notes into a library.
- Full-text search across libraries; the existing command palette and local filter stay.
- A library-level settings scope. Page settings stay global + per-document.
- Backup/restore UI (L5, later).
- Changing the document schema, the package format, or the PDF pipeline.

---

## 3. Model

### 3.1 One active library per window

- The window has exactly one **active library**. The Library tab shows its documents.
- Open tabs may belong to different libraries; the active library follows the active tab when a tab
  is activated, but switching the library from the switcher does **not** close or retarget open tabs.
- A draft is bound to the library that was active when it was created. Switching libraries does not
  move an untouched draft; materialization uses the bound library.

### 3.2 Library identity and scanning

- A library is identified by its absolute, normalized path. Use `realpath` for duplicate detection
  (symlinks, case-insensitive macOS volumes), but display the path the user chose.
- A library is a folder of packages: direct subdirectories with `document.json`. Dot entries,
  `assets/`, and unrelated folders are ignored. Invalid packages are listed with their recovery
  status, as today.
- A library root that is itself a document package (`document.json` in the root) is rejected with a
  clear message: open its parent folder or the package as a document (external documents are
  future).
- Nested libraries are rejected with a warning. A library root inside another library's document
  package is invalid.
- Duplicate paths are deduplicated; the same package path can only have one store and one lock
  (already true).

### 3.3 Storage

| Data | Where | Version |
|---|---|---|
| Recent libraries (max 8) | `app-support/libraries.json` | own `version: 1`, no settings bump |
| Active library | `shell-session.json` (`activeLibrary`) | session field, no settings bump |
| Sidebar tab | `shell-session.json` (`sidebarTab: 'library' | 'outline'`) | session field |
| Default library | `~/Documents/NoteForest` when no session/library list exists | constant |
| Recent documents | existing `recent-documents.json` (global, across libraries) | unchanged |
| Per-document overrides | existing `document-settings.json`, **document id first**, path fallback | unchanged |

`libraries.json`:

```json
{
  "version": 1,
  "libraries": [
    { "path": "/Users/luca/Documents/NoteForest", "lastOpenedAt": "2026-11-13T08:00:00.000Z" }
  ]
}
```

- Paths are absolute and normalized; missing paths stay listed so the user can Locate or Remove.
- The active library is a session concern, not a global setting. `settings.json` is not touched by
  this milestone (R4 keeps `settingsVersion: 4` for `export`).
- `NOTEFOREST_LIBRARY` remains the test/app override. When set, it seeds the active library and the
  recent list; the switcher still works unless a future test pin is added.

### 3.4 Library lifecycle

| Action | Behavior |
|---|---|
| **First run** | Create `~/Documents/NoteForest` if no session and no `libraries.json`; add it to recents; active. |
| **Open Folder as Library…** | Native folder picker (directories only). Validate, scan, add/reuse recent, active. No copy. |
| **New Library…** | Small modal: name (default `NoteForest`) + parent folder picker. Creates `<parent>/<name>`; error if it exists; add/active. |
| **Switch** | Click a recent; flush pending saves first; scan; active. Open tabs stay. If a tab belongs to the old library, it stays open and shows the library name in its tooltip. |
| **Missing at launch** | Do **not** recreate. The Library tab shows “Library not found” with **Locate…**, **Remove from Recent**, **Open another…**. The Outline tab still shows open documents/recovery. |
| **Locate…** | Folder picker; if valid, replace the missing path in `libraries.json` and the session; reconcile tabs/recents by `document.id`. |
| **Remove from Recent** | Removes the path from `libraries.json` only; never deletes files. If it was active, switch to the default/first recent, or show the empty library state. |
| **Refresh** | Re-scan the active library (external changes). No file watching in v1. |
| **Reveal** | `shell.showItemInFolder` on the library root. |

The app never recursively deletes a library folder. There is no “Delete library” command.

---

## 4. Sidebar: Library / Outline

### 4.1 Structure

```text
┌──────────────────────────────┐
│ Search                  ⌘K   │  global command palette
│ [ Library ] [ Outline ]      │  tab strip, 28 px
├──────────────────────────────┤
│ NoteForest ▾        4    +   │  library switcher + count + new note
│ Filter documents…            │  local filter (Library only)
│  NoteForest — Showcase       │
│  NoteForest — Stress Test    │
│  …                           │
│                              │
│ Settings                     │  global footer, unchanged
└──────────────────────────────┘
```

- **Tab strip**: `role="tablist"`, two `role="tab"` buttons, `aria-selected`, arrow-key movement.
  Active: `text-1` + 2 px accent underline (or the existing quiet segmented style); inactive:
  `text-3`.
- **Library tab**:
  - Header row: library name + chevron (switcher menu), document count, `+` New note.
  - Local filter input.
  - Document rows: existing icon/title/status/open dot/menu; the selected row surface is the full
    row (batch fix). The row menu adds **Rename**, **Reveal**, **Move to Trash**.
  - Empty state: “No documents yet” + New note; missing library state as above.
- **Outline tab**: the current Topics tree (chapters, blocks, anchors) for the active document. Empty
  state: “Open a document to see its outline.” No document filter in v1; the tree has its own
  collapse state.
- The footer Settings button stays outside the tabs, as today.
- The active tab is persisted in the session; default **Library**. Opening a document does not
  forcibly switch tabs; the last tab wins. The Outline tab remains available and shows the active
  document.

### 4.2 New note placement

Current duplicate: the global header and the Library header both create a note. This design keeps
**one** New note control. Recommendation: **Library header `+`** (contextual, next to the document
list); remove the global header `+`. The header becomes `[collapse][search]`. Open decision; the
alternative is one global `+` visible from both tabs.

### 4.3 Library switcher menu

```text
NoteForest                  ✓
Study notes
Archive
────────────────────────
Open Folder as Library…
New Library…
Refresh
Reveal in Finder
Remove from Recent        (only for non-active libraries)
```

- Recents are ordered by `lastOpenedAt`; the active one has a check.
- Duplicate folder basenames show the parent path as a secondary line.
- “Remove from Recent” is disabled for the active library; switch first.
- The menu is keyboard reachable; the chevron button has `aria-haspopup="menu"`.

---

## 5. Document lifecycle

### 5.1 Draft creation (L3)

- `+` (active library) calls a new `createDraft` path in the main process: a document in memory with
  `document.create` + first empty block. No folder, no lock, no `recent-documents.json` entry.
- The draft tab title is “Untitled”; the tab key is a stable `draft:<id>`; the editor mounts normally.
- The draft is bound to the active library at creation (`libraryPath`).
- The Library tab does **not** list the draft until it materializes; the tab bar shows it.

### 5.2 Materialization

First **real mutation** materializes the package:

- text commit, structural command, rename, asset import, per-document settings change, export.
- Choose a unique package folder from the title (existing `createUniquePackageDir` rules), acquire
  the lock with `breakStale: true` for the just-created path (stale/orphan only; a live lock still
  fails), write `document.json`, register the recent entry, add the document to the active library
  view.
- Update the tab path **without remounting** the editor: keep selection, scroll, undo history,
  runtime identity. The document id is generated at draft creation, so moving from draft to package
  does not change identity or per-document settings keys.
- If the bound library is missing/unmounted, materialization fails with a clear error and offers
  **Choose another library**/Retry; the draft stays in memory.
- If the first save fails, the draft stays a draft with a visible save error; no half package is
  left (create is atomic).
- A draft with no modifications is discarded on tab close and on quit; nothing is written.
- A draft with unsaved text and a quit flushes/materializes before exit (same save-failure policy as
  today).

### 5.3 Rename

- Renames the document **title**, not the package folder. The folder name is stable; tab, recent,
  and per-document settings are unchanged.
- Renaming a folder to match the title is out of scope (path churn, lock, tabs, recents).
- Rename menu entry: existing `document.rename` command; inline dialog with validation.

### 5.4 Move to Trash (delete)

- Entry: Library row menu → **Move to Trash…**; also a document command in the palette later.
- Confirmation names the title and path; primary **Move to Trash**, secondary Cancel.
- Safety:
  - If the table is open, flush it; if the flush fails, block the trash and show the error.
  - Refuse if a **live** lock is held by another session; if the lock is stale/corrupt, allow after
    the normal confirmation.
  - Use Electron `shell.trashItem` (OS Trash), never a recursive delete. Trash failure → error, file
    untouched.
  - Remove the recent entry, the per-document settings entry (by document id first), the session
    tab, and close the store/release the lock.
  - If the document is open in a tab, close the tab after a successful trash; activate the next tab.
- No in-app undo; the OS Trash is the recovery path. A future backup UI (L5) is separate.
- Library removal is **Remove from Recent** only; never trash the library folder.

### 5.5 Open, switch, recents

- Opening a document from the Library tab activates its library (it is already active) and its tab.
- Activating a tab from another library updates the active library to that tab's library (the Library
  tab follows the document).
- Switching the library from the switcher does **not** close tabs from the previous library.
- Recents are global; opening a recent document from another known library activates that library.
- The palette searches the active library's documents and the open tabs; other libraries' recents
  appear in the switcher, not in the document list. Full-text search is future.

### 5.6 Move reconciliation

- Per-document settings are already keyed by `document.id` with a path fallback; moving a library or
  a package keeps the overrides.
- On launch and on library open, if an open tab or a recent path is missing, scan the active library
  for a document with the same `document.id` and update the path. If no id match (legacy entry), keep
  the missing entry and show the recovery/missing state.
- Do not auto-rewrite recents outside the scanned library. A “Locate…” on a missing library runs the
  same reconciliation against the chosen folder.

---

## 6. Settings and Data

- **Data & About** shows the active library path, the recent libraries, and the app-data path; add
  **Open Library…**, **Reveal**, **Remove from Recent** links there. No new settings schema.
- The library switcher is the primary control; Settings is the diagnostic surface.
- **No** library-level Page defaults; global + per-document stays (ADR-0008).
- **No** `settingsVersion` change in this milestone; `libraries.json` and the session are separate
  files. R4 owns `settingsVersion: 4` for `export`; R6 owns the `continuous` namespace decision.

---

## 7. Safety and accessibility

- Opening a folder is explicit; no automatic scan outside known roots. The library root must be a
  real directory; permission errors surface with the path and Retry.
- No recursive delete; only `shell.trashItem` on one package. The library root is never trashed.
- Live-lock protection on trash; stale locks follow the existing explicit-recovery policy.
- Asset paths stay confined to the package (existing guard).
- Tabs: `tablist`/`tab`/`tabpanel`, labels, `aria-controls`, arrow keys, focus ring; the switcher is
  a menu button; the trash confirmation is an alert dialog with focus on Cancel.
- The library name and path are announced; the missing state is not color-only.
- No native save dialog; the only native surfaces are the folder pickers and the existing export
  folder picker.

---

## 8. Edge cases

| Case | Behavior |
|---|---|
| No library / first run | Create default `~/Documents/NoteForest`; active; one empty state. |
| Active library missing at launch | Missing state; Locate/Remove/Open another; never recreate. |
| Library empty | “No documents yet” + New note; `+` works. |
| Library root is a package | Reject with “This is a document, not a library.” |
| Nested library | Warn and reject; no duplicate scan. |
| Invalid package | List with recovery status; open shows RecoverySurface; never auto-delete. |
| Read-only document | Open/export allowed; rename/trash blocked or confirmation with the read-only reason. |
| Live lock | Trash/rename write paths refused; status panel explains. |
| Stale lock | Trash allowed after confirmation; materialization breaks stale only. |
| Draft bound to a missing library | Materialization error; draft stays; choose another library. |
| Draft + quit without edits | Discarded; no folder. |
| Draft + quit with edits | Materialize/flush before exit; save failures surface. |
| Switch library with open tabs | Tabs stay; active library changes; Library tab shows the new root. |
| Same package in two libraries | One absolute path, one store, one lock; dedupe by realpath. |
| Moved library | Locate reconciles by document id; recents/tabs update; overrides survive. |
| Deleted library folder externally | Missing state; open tabs show recovery; no silent recreate. |
| Duplicate display names | Show parent path as a secondary line. |
| Long paths | Truncate with middle ellipsis; full path in title/aria. |
| External change | Existing stale-save/reload policy; Refresh rescans. |

---

## 9. Slice breakdown

### L1 — Sidebar tabs

**Deliverable:** Library/Outline tabs, session persistence, ARIA, empty states, tests, screenshots.
No data-model change. Replace the Library/Topics dividers from the fix batch with the tab boundary;
keep the row/selection/grid system.

Tests: tab switch, session restore, no document Outline empty state, no library Library empty state,
keyboard/ARIA, sidebar collapse, full `verify:fast`.

### L2 — Library roots

**Deliverable:** `libraries.json`, active library in the session, Open Folder/New Library/Switch/
Recent/Missing/Locate/Remove/Refresh, `isInsideKnownLibrary`, Data page links, tests.

Tests: first run, open folder with packages, switch, recent order/cap, missing library no recreate,
locate reconciles, remove only recents, root-is-package rejection, nested warning, same path dedupe,
create note in active library, no library state, full `verify:fast`.

### L3 — Draft creation

**Deliverable:** `createDraft`, in-memory document, first-mutation materialization, tab path swap
without remount, close/quit discard, export/asset/settings materialize, tests.

Tests: `+` writes nothing; first text/structure creates one package; close/quit untouched writes
nothing; edited draft saved; undo/selection/scroll survive; export materializes; asset materializes;
missing bound library error; stale lock on materialization; live lock fails; full `verify:fast`.

### L4 — Document management

**Deliverable:** rename title, reveal, Move to Trash with confirmation, cleanup (recent, settings,
session, store/lock), live-lock refusal, tests.

Tests: rename title only; reveal; trash open/closed doc; flush failure blocks; live lock refused;
stale lock allowed; trashed package removed from list/recent/settings; tab closes to next; trash
failure leaves the file; library remove only recents; full `verify:fast`.

### L5 — Backup/restore (future)

Last 10 package backups, restore as copy, status. Not in this milestone.

Dependencies: **L1 → L2 → L3 → L4**. L2 before L3 (the active library is the draft target); L1 before
L2 (the Library tab is the switcher surface). L5 after L4.

---

## 10. Acceptance criteria

- [ ] The user can open a folder of NoteForest packages as a library, switch back and forth, and see
      only the active library's documents; recents persist; a missing library is never recreated.
- [ ] The sidebar has Library and Outline tabs; the active tab persists; Outline shows the active
      document; Library shows the switcher, count, filter, documents and file actions.
- [ ] `+` creates a draft and writes nothing until the first real modification; close/quit untouched
      writes nothing; edited drafts save; the tab path changes without losing editor state.
- [ ] Rename changes the title only; Move to Trash uses the OS Trash, refuses a live lock, flushes
      first, and cleans recent/settings/session; the library folder cannot be deleted in-app.
- [ ] Moving a library or package preserves per-document settings by document id; tabs/recents
      reconcile when the document is found.
- [ ] No document schema, settings version, PDF pipeline, or Page/PDF behavior changes.
- [ ] Tests: no fixed sleeps, no native dialogs in tests, no weakened assertions; one `verify:fast`
      per slice and one full `verify` at integration.

---

## 11. Open decisions

| ID | Decision | Options | Recommendation |
|---|---|---|---|
| LD-01 | Tab labels | Library/Outline; Files/Topics | **Library/Outline** |
| LD-02 | New note placement | Library header only; global header only; both | **Library header only**; remove the duplicate |
| LD-03 | Library switch with open tabs | Keep tabs; close tabs after flush | **Keep tabs**, show the library in the tooltip |
| LD-04 | Delete semantics | OS Trash; permanent delete | **OS Trash** |
| LD-05 | External documents | v1; later | **Later**, after L4 |
| LD-06 | Multi-root workspace | v1; later | **Later** |
| LD-07 | Recents scope | Global; per library | **Global**, shown in the switcher |
| LD-08 | Default library setting | Last active only; explicit default | **Last active only** for v1; Settings later if needed |
| LD-09 | Library display name | Folder basename; stored name | **Folder basename**; parent path on duplicates |
| LD-10 | Draft + library switch | Retarget; keep bound | **Keep bound** to the creation library |
| LD-11 | L5 backup UI | Now; later | **Later** |
| LD-12 | “Delete library” | Never; remove from recents | **Remove from recents only** |

---

## 12. Risks

- **Tab/recents path churn** on move: mitigated by document-id reconciliation; legacy path-only
  entries still need a Locate/manual path.
- **Draft materialization identity**: the tab key and document id must stay stable across the path
  swap; the editor must not remount. This is the riskiest implementation point.
- **Library roots on removable volumes**: missing state, no recreate; flush failures surface.
- **Trash on non-macOS**: Electron `shell.trashItem` is supported on macOS/Windows; Linux behavior
  may fall back to an error. The app is Mac-first; show the OS error, never a recursive delete.
- **Duplicate/realpath**: case-insensitive macOS volumes and symlinks; normalize for identity, display
  the chosen path.
- **Scope creep**: external documents, search, backup, and multi-root are deliberately outside; do
  not fold them into L1–L4.

---

## 13. Evidence

- Screenshots: Library tab with switcher/menu/recents/missing state, Outline tab, draft before/after
  materialization, trash confirmation/result, moved library Locate, Data page links.
- Tests: unit for `libraries.json`, active library, draft materialization, cleanup; UI for tabs,
  switcher, missing state, draft, trash.
- No manual-only acceptance; the product owner reviews the visual states.
