# Copy plan — old → new, by file

**Status:** design package for the copy sweep. No code.
**Date:** 16 November 2026.
**Rules:** `docs/design/copy-audit.md` §2; the four decisions in §5 are confirmed.
**Frame and component spec:** `docs/design/dialogs.md`.
**How to use:** substitute the `New` text verbatim. Nothing here needs a judgement call. A row marked
`DELETE` is removed, not reworded. A row marked `SHORT + DETAILS` splits one string into the short
line plus the Details value (`docs/design/dialogs.md` §3); the Details value is given after `DETAILS:`.

**Legend**

| Tag | Meaning |
|---|---|
| `DELETE` | remove the string and its element |
| `SHORT + DETAILS` | short outcome in place; the technical value moves into a Details disclosure |
| `KEEP` | analysed, no change; the row bundles all the labels of that element so the Builder does not reword neighbours. A `KEEP` row is **not** a substitution — ignore it when patching. |
| `—` | not applicable |

**Normalisation.** Where the source is JSX across several lines, the `Current` cell is the rendered
sentence (line breaks become single spaces). Apostrophes are typographic (`’`) in the new text, as
the code already uses in `Don’t Save`. Sentence case everywhere, including the native menu.

**Banned words (empty allowlist):** paginator, PageTheme, packing, trunk, lane, callout mode,
heartbeat, binding, command layer, schema, JSON, ID, node path, app support.

**Contractions.** New copy uses `couldn’t`, `wasn’t`, `isn’t`, `can’t`, `won’t`. Existing `could not`
strings that are being rewritten adopt the contraction; do not rewrite strings that are otherwise
unchanged only to shorten them.

---

## A. Dialogs

### A.1 `apps/desktop/src/renderer/src/shell/Dialogs.tsx`

| ID | Dialog / element | Current | New |
|---|---|---|---|
| A-01.1 | New library — title | `New Library` | `New library` |
| A-01.2 | New library — description | `Create a folder for a new set of NoteForest notes.` | `Create a folder for a new set of notes.` |
| A-01.3 | New library — primary | `Create Library` | `Create library` |
| A-01.4 | New library — error | `Could not create the library. Check the name and parent folder.` | `Couldn’t create the library. Check the name and the parent folder.` |
| A-02.1 | Trash — description, missing | `The package folder has no document.json. This only forgets the document; no file or folder is deleted.` | `This entry has no note folder. It is removed from the list; no files are deleted.` |
| A-02.2 | Trash — description, folder | `The folder and everything inside it move to the system Trash. You can recover it from the Trash; the library folder itself is never moved.` | `The folder and everything inside it move to the Trash. You can restore them from there.` |
| A-02.3 | Trash — description, Markdown | `The Markdown file moves to the system Trash. You can recover it from the Trash.` | `The file moves to the Trash. You can restore it from there.` |
| A-02.4 | Trash — description, note | `The note folder moves to the system Trash. You can recover it from the Trash.` | `The note moves to the Trash. You can restore it from there.` |
| A-02.5 | Trash — newer version | `This note was written by a newer NoteForest version. Moving it to the Trash is safe, but this app cannot read or recover its contents.` | `This note comes from a newer NoteForest. Trashing it is safe, but this version can’t read it.` |
| A-02.6 | Trash — live lock | `Another NoteForest session is writing this document. Close the other window and try again; the live lock is never broken.` | `Another window is writing this note. Close it there and try again.` |
| A-02.7 | Trash — stale lock | `A stale lock from a previous session will be cleared before the move.` | `A lock from an earlier session is cleared first.` |
| A-02.8 | Trash — path line | `{preflight.packagePath}` (monospace paragraph) | `SHORT + DETAILS` — remove the paragraph; `DETAILS: {preflight.packagePath}` |
| A-02.9 | Trash — primary, missing | `Remove from recents` | `Remove` |
| A-03.1 | New folder — primary | `Create Folder` | `Create folder` |
| A-03.2 | New folder — error | `Could not create the folder. Check the name and try again.` | `Couldn’t create the folder. Check the name and try again.` |
| A-04.1 | Rename folder — error | `Could not rename the folder. Check the name and try again.` | `Couldn’t rename the folder. Check the name and try again.` |
| A-05.1 | Move entry — error | `Could not move the entry. Check the destination and try again.` | `Couldn’t move the entry. Check the destination and try again.` |
| A-06.1 | Markdown close — title | `Close Markdown file?` | `Close file?` |
| A-06.2 | Markdown close — description | `This file has changes that have not been saved yet.` | `This file has unsaved changes.` |
| A-07.1 | Markdown conflict — description | `Another app wrote this Markdown file. Nothing has been overwritten.` | `Another app wrote this file. Nothing has been overwritten.` |
| A-07.2 | Markdown conflict — path line | `{dialog.path}` (second paragraph) | `SHORT + DETAILS` — remove the paragraph; `DETAILS: {dialog.path}` |
| A-07.3 | Markdown conflict — explanation | `Reload replaces the editor with the version on disk. Overwrite writes the editor content and keeps one previous copy in app support (never in your library).` | `Reload discards your edits. Overwrite keeps a backup of the version on disk.` |
| A-08.1 | No document — title | `No document open` | `No note open` |
| A-08.2 | No document — body | `Open a document before using this command.` | `Open a note first.` |
| A-09.1 | Detach — title | `Detach branch?` | `Detach from parent?` |
| A-09.2 | Detach — description | `The block becomes a top-level block in the same chapter. Its content and subtree are kept.` | `The block becomes top-level in its chapter. Its content is kept.` |
| A-09.3 | Detach — body | `“{blockTitle}” will lose its incoming arrow.` | `“{blockTitle}”` |
| A-09.4 | Detach — primary | `Detach` | `Detach from parent` |
| A-10.1 | Rename document / chapter / block | `Rename document`, `Rename chapter`, `Rename block`, `Name`, `Optional label`, `Title` | `KEEP` |
| A-11.1 | Link | `Link`, `Add a link to the selected text.`, `URL`, `Apply` | `KEEP` |
| A-12.1 | Math — description | `KaTeX renders the expression. LaTeX only; no remote content.` | `LaTeX only. Nothing is loaded from the web.` |
| A-12.2 | Math — no document toast | `Open a document before branching from a term.` | `Open a note before branching from a term.` |
| A-12.3 | Math — formula lost toast | `The formula could not be found; close the dialog and try again.` | `The formula isn’t in the note any more. Close the dialog and try again.` |
| A-12.4 | Math — update toast | `The formula could not be updated; check the LaTeX and try again.` | `The formula wasn’t updated. Check the LaTeX and try again.` |
| A-12.5 | Math — inline/display, term hint | `Inline`, `Display`, `Select part of the LaTeX to branch from that term.` | `KEEP` |
| A-13.1 | Table size — description | `Pick the size; the first row is the header. The last size is remembered for this session.` | `Pick a size. The first row is a header.` |
| A-13.2 | Table size — no document toast | `Open a document before inserting a table.` | `Open a note before inserting a table.` |
| A-13.3 | Table size — frame | own overlay, no X | **move onto `Frame`** (480, title, description, header X, footer slots) — `dialogs.md` §1.8 |
| A-14.1 | Close tab — description | `This tab has changes that have not been saved yet.` | `This tab has unsaved changes.` |
| A-14.2 | Close tab — fallback name | `This document` | `This note` |
| A-15.1 | Reload from disk — description | `Unsaved changes in this window will be discarded. The file on disk is not modified.` | `Unsaved changes in this window are discarded. The file on disk is not changed.` |
| A-15.2 | Reload from disk — body | `“{title}” will be reopened from <code>{path}</code>. This cannot be undone.` | `“{title}”` + `SHORT + DETAILS`; `DETAILS: {packagePath}` |
| A-16.1 | Overwrite — description (`lib/save-failure.ts`) | `The file at {packagePath} changed on disk outside NoteForest. Overwriting replaces those external changes with this window’s content; they will be lost. This cannot be undone.` | `This replaces the file on disk; the external changes are lost. Reload instead to keep them.` |
| A-16.2 | Overwrite — body | `“{title}” will replace <code>{packagePath}</code>.` | `“{title}”` + `SHORT + DETAILS`; `DETAILS: {packagePath}` |
| A-16.3 | Overwrite — note | `The external changes will be lost. Reload from disk instead if you want to keep them.` | `DELETE` |
| A-17.1 | Restore backup — description | `Choose a backup to restore as a new copy. The current document and its file are not changed.` | `Restores a copy. The current file is not changed.` |
| A-17.2 | Restore backup — empty note | `NoteForest has no valid backup for this document yet. Save a copy or fix the original folder instead.` | `No backup yet. Save the note as a copy instead.` |
| A-17.3 | Restore backup — trailing note | `The restored copy opens in a new tab. This window’s unsaved changes and the original file are left untouched.` | `DELETE` |
| A-17.4 | Restore backup — title/legend/loading | `Restore backup`, `Backups, newest first`, `Reading backups…`, `No usable backups`, `Restore copy…`, `Cancel` | `KEEP` |
| A-17.5 | Restore backup — success toast (snapshot) | `Restored a backup and opened it.` | `Restored a backup.` |
| A-17.6 | Restore backup — success toast (path) | `Restored a backup to {path}` | `Restored a backup to {path}` (`KEEP`; path is the find-the-file case) |
| A-18.1 | Link as reference — description | `Link an existing block without changing its primary home, outline position, or layout. Reference links may form cycles.` | `The target keeps its place. This adds a reference link.` |
| A-18.2 | Link as reference — trailing note | `The target stays once at its primary home. This only adds a “See also” link here and a “Referenced by” chip there.` | `DELETE` |
| A-18.3 | Link as reference — duplicate toast | `That link already exists; focused the linked block.` | `That link already exists.` |
| A-18.4 | Link as reference — error toast | `Could not link the block.` | `Couldn’t add the link.` |
| A-18.5 | Link as reference — labels | `From`, `Find a block`, `Filter by title or chapter`, `No other block matches that filter.`, `Link` | `KEEP` |
| A-19.1 | Move block — description | `Choose a new primary parent. Cycles and descendant moves are rejected.` | `Choose a new parent. A block can’t move inside itself.` |
| A-20.1 | Delete block — description | `This block has descendants.` / `This block has no descendants.` | `The block and its content are removed.` (one description for both) |
| A-20.2 | Delete block — references line, singular | `This reference link points at this subtree` (or `this block`) ` and will be removed. The source blocks and their content stay.` | `This reference link will be removed with the block. The source blocks stay.` |
| A-20.3 | Delete block — references line, plural | `These reference links point at this subtree` (or `this block`) ` and will be removed. The source blocks and their content stay.` | `These reference links will be removed with the block. The source blocks stay.` |
| A-20.4 | Delete block — labels | `Delete block`, `What about its descendants?`, `Keep descendants as top-level blocks`, `Delete the whole subtree`, `External references`, `Reference`, `Primary`, `Delete` | `KEEP` |
| A-21.1 | Image alt — description | `Describe the image for screen readers, search, and the exported PDF. Leave it empty for a decorative image.` | `Describe the image. Leave it empty if it is decorative.` |
| A-21.2 | Image alt — error toast (×2) | `Could not save the alt text.` | `Couldn’t save the alt text.` |
| A-23.1 | Settings — close button | `aria-label="Close Settings"` | `aria-label="Close"` |
| A-24.1 | Details dialog (new, D25) | — | `Details`, `Copy`, `Close`, toast `Copied`, `aria-label="Technical details"` |
| A-25.1 | `shell/DialogFrame.tsx` — header | no close control; `<Dialog aria-label={title}>` | new close button `aria-label="Close"`, `title="Close (Esc)"`; `<Dialog aria-labelledby>` an id on the `h2` |
| A-25.2 | `shell/DialogFrame.tsx` — description | `nf-dialog-description` paragraph | one line; `KEEP` the element, cap the copy |

### A.2 `apps/desktop/src/renderer/src/export/ExportSheet.tsx`

| ID | Element | Current | New |
|---|---|---|---|
| A-22.1 | Configure — filename note | `The document title is the file name; no date or pattern is added.` | `The file is named after the note.` |
| A-22.2 | Configure — layout summary | `Page layout will be exported` | `Page layout` |
| A-22.3 | Configure — page count, unknown | `Page count is calculated when the export starts · whole document` | `Page count is calculated at export · whole document` |
| A-22.4 | Configure — preflight line | `Preflight runs automatically when you export.` | `DELETE` |
| A-22.5 | Configure — labels | `Destination`, `Folder`, `File name`, `Choose…`, `No folder chosen`, `Choose a folder`, `Untitled`, `Saved as {fileName}`, `.pdf`, `Export` | `KEEP` |
| A-22.6 | Overwrite — copy | `A file already exists at this path. Replacing it cannot be undone.` | `A file already exists there. Replacing it cannot be undone.` |
| A-22.7 | Overwrite — help | `Cancel returns to Configure with the path intact; the existing file is untouched.` | `Cancel keeps the existing file.` |
| A-22.8 | Running — phase labels | `Preparing…`, `Reading the document…`, `Building pages…`, `Printing…`, `Checking the PDF…`, `Writing the file…` | `KEEP` |
| A-22.9 | Running — cancel prompt | `Cancel this export? No file will be written.`, `Keep exporting`, `Cancel export`, `Cancelling…` | `KEEP` |
| A-22.10 | Done — summary | `The PDF was written.` / `{n} page(s) · written.` / `{n} page(s) · replaced.` | `KEEP` |
| A-22.11 | Done — warning row | `{blockTitle}: {warning.message}` and `Page {n}: {warning.message}` | `SHORT + DETAILS` — row is `{blockTitle} · {group label}` or `Page {n} · {group label}`; all messages go to one Details block, newline-joined |
| A-22.12 | Failed — body | `{error.message}` | `SHORT + DETAILS` — short sentence from A-22.14; `DETAILS: {error.message}` |
| A-22.13 | Failed — code line | `Error: {error.code}` | `DELETE` (the code joins Details) |
| A-22.14 | Failed — short sentence by code | — | `invalid-input`, `document-not-open`: `The export didn’t start.` · `output-exists`: `A file already exists there.` · `snapshot-failed`, `snapshot-timeout`: `The note couldn’t be read in time.` · `document-mismatch`, `settings-mismatch`: `The PDF didn’t match the note, so the export stopped.` · `empty-document`: `The note has no pages to export.` · `model-error`, `model-mismatch`: `The pages couldn’t be laid out.` · `render-error`, `print-failed`, `window-failed`: `The PDF couldn’t be printed.` · `preflight-blocked`: `A layout problem would break the PDF.` · `validation-failed`: `The PDF failed its checks.` · `write-failed`: `The file couldn’t be written.` · `cancelled`: `The export was cancelled.` · `internal-error`: `The export stopped unexpectedly.` |
| A-22.15 | Failed — footer/before | `The PDF export failed.`, `Close`, `Retry` | `KEEP` (`The PDF export failed.` is replaced by A-22.12) |
| A-22.16 | Cancelled — copy | `Export cancelled. No file was written.` | `KEEP` |
| A-22.17 | Done — footer/actions | `Reveal in Finder`, `Open PDF`, `Done` | `KEEP` |

### A.3 `apps/desktop/src/renderer/src/shell/TableSizeDialog.tsx`

| ID | Element | Current | New |
|---|---|---|---|
| A-13.1 | See A.1 | — | — |
| A-13.4 | Frame | no header X, own overlay, own action row | move onto `Frame`; keep `Insert {r} × {c}` |
| A-13.5 | Grid labels | `Insert table`, `Table size`, `{r} by {c}`, `{r} × {c}`, `Cancel` | `KEEP` |

---

## B. Settings

### B.1 `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`

| ID | Element | Current | New |
|---|---|---|---|
| B-01.1 | Page — lens help | `Page Read, Page Edit, the Page preview, and PDF use one resolved Page lens. Setup is a personal setting; it never changes the note content.` | `Page, Page Edit, the preview, and PDF share these settings.` |
| B-01.2 | Page — scope, disabled reason | `Open a document to override Page settings.` (title) and `Open a document to override Page settings. Global defaults apply to every document without an override.` (paragraph) | title: `Open a note to override Page settings.` — paragraph: `DELETE` (decision 2) |
| B-01.3 | Page — override dot titles | `This document overrides the global page size` (and the margin/orientation/header/footer/page-number/preset/density variants) | `KEEP` (tooltips, engine-free) |
| B-01.4 | Page — margins help | `0–100 mm per side. The content area must keep at least 20 mm on each axis. {pageContentArea}.` | `Up to 100 mm per side. The content needs at least 20 mm.` — and `DELETE` the computed `{pageContentArea}` clause |
| B-01.5 | Page — chrome help | `Header and footer text come from the document and chapter titles; there is no free text, no page-1 exception, and the page number always sits at the bottom center.` | `The header and footer use the note and chapter titles. The page number stays centered.` |
| B-01.6 | Page — preset warning | `Switching to {preset} replaces the custom typography and layout values in this layer. Custom is the option that keeps the current values.` | `Switch to {preset} and replace the custom values in this layer?` |
| B-01.7 | Page — density, document scope | `Page Read, Page Edit, and PDF use {pct}% for this document (document override). 60–70% is the densest range; 80% and above keeps larger type.` | `This note uses {pct}% for Page and PDF.` |
| B-01.8 | Page — density, global scope | `Global Page density is {pct}%. A document with its own density override keeps that value. 60–70% is the densest range; 80% and above keeps larger type.` | `Density for notes without their own setting.` |
| B-01.9 | Page — density tail | part of B-01.7/B-01.8 | new separate line: `60–70% is densest; 80% and up keeps larger type.` |
| B-01.10 | Page — density topology note | `Density can move a callout between the right lane and below; the tree order stays fixed.` | `DELETE` |
| B-01.11 | Page — advanced hidden note | `Page font, manual breaks, and engine values (packing, callout modes, trunk insets, lane gate) are not available in Settings.` | `DELETE` |
| B-01.12 | General — saving help | `Autosave runs after 800 ms. ⌘S flushes immediately and commits an open Page Edit block first.` | `Saves automatically. ⌘S saves now.` |
| B-01.13 | General — shortcuts help | `A searchable list lives on the Editor page.` | `DELETE` (the button says it) |
| B-01.14 | Page — page description | `The Page lens for this document and the app-wide default.` | `Page settings for this note and the app default.` |
| B-01.15 | Editor — shortcuts help | `A read-only reference of the app shortcuts; it is not a configurable keymap.` | `Shortcuts are fixed.` |
| B-01.16 | Editor — saving help | `Autosave after 800 ms; ⌘S flushes immediately.` | `Saves automatically. ⌘S saves now.` |
| B-01.17 | Data — libraries help | `One active library per window. Recent libraries are global; removing one never deletes files.` | `One library per window. Removing one from the list never deletes files.` |
| B-01.18 | Data — settings-file reset help | `Reset replaces settings.json with the product defaults. The damaged copy above is kept; note content is not affected.` | `Reset replaces these settings with the defaults. The note is not changed.` |
| B-01.19 | Data — migrated line | `Settings were upgraded to the current format. Existing values were kept.` | `Settings were upgraded. Your values are kept.` |
| B-01.20 | Data — status labels | `OK`, `Defaults (no file yet)`, `Corrupt — using defaults`, `Unreadable — using defaults`, `Newer schema (read-only warning)` | `OK`, `Defaults (no file yet)`, `Can’t read — using defaults`, `Can’t read — using defaults`, `From a newer version` |
| B-01.21 | Warning — global, newer | `settings.json was written by a newer NoteForest version (schema {v}). Unknown fields are preserved.` | `These settings come from a newer NoteForest. They are used as they are.` |
| B-01.22 | Warning — global, unreadable | `settings.json could not be read. NoteForest is using the product defaults.` | `These settings couldn’t be read. The defaults are in use.` |
| B-01.23 | Warning — raw message | `{settingsStatus.message}` | `SHORT + DETAILS` — remove the paragraph; `DETAILS: {settingsStatus.message}` |
| B-01.24 | Warning — damaged copy | `A copy of the damaged file is kept at <code>{backupPath}</code>.` (×2: warning and Data) | `KEEP` (path is the find-the-file case) |
| B-01.25 | Warning — document settings | `Per-document settings could not be read. Open documents use the global defaults until you reset or restore the map.` | `Note settings couldn’t be read. The defaults are in use until you reset or restore them.` |
| B-01.26 | Data — document settings help | `Per-document page overrides live in document-settings.json. Resetting or restoring this map never changes note content.` | `Page overrides are stored per document. Resetting them never changes the note.` |
| B-01.27 | Data — reset overrides button | `Reset map` | `Reset overrides` |
| B-01.28 | Data — reset confirm aria | `Confirm reset map` | `Confirm reset overrides` |
| B-01.29 | Data — reset confirm copy | `This removes all per-document page overrides. Note content is not affected.` | `This removes every Page override. The note is not changed.` |
| B-01.30 | Data — restore confirm copy | `Restore the newest valid backup over the current document settings map? The current file is backed up first. Note content is not affected.` | `Restore the newest backup? The current file is saved as a backup first.` |
| B-01.31 | Data — reset/restore labels | `Status`, `Schema version`, `Libraries`, `No recent libraries.`, `Open Library…`, `Restore backup`, `Cancel`, `About`, `Version` | `Status`, `Schema version`, `Libraries`, `No recent libraries.`, `Open library…`, `Restore backup`, `Cancel`, `About`, `Version` |
| B-01.32 | Data — library row | `{name} — active`, `Not found`, `Reveal`, `Remove`, `Switch to another library before removing this one`, `Remove from Recent` | `KEEP` except `Remove from Recent` → `Remove from recents` |
| B-01.33 | Footer status | `Saved`, `Saving…`, `Not saved — check the highlighted values`, `Couldn’t save —`, `Retry`, `Done`, `Unknown error.` | `KEEP` |
| B-01.34 | Editor shortcut rows | `Previous / next page`, `PageUp / PageDown` | `Previous / next page`, `⌥↑ / ⌥↓` (both keys work; the header already shows these) |

### B.2 `apps/desktop/src/renderer/src/settings/AppearanceSettings.tsx`

| ID | Element | Current | New |
|---|---|---|---|
| B-02.1 | Page description | `The app around the document. Page and PDF keep the paper light.` | `The app around the note. Page and PDF keep their paper.` |
| B-02.2 | Theme help | `System follows the macOS appearance. Page and PDF keep the paper light; this changes the app around the document.` | `Follows the macOS appearance. Page and PDF keep their paper.` |
| B-02.3 | Accent help | `Focus rings, selection, the active tab, and primary actions. Curated sets with checked contrast; not Page/PDF.` | `Buttons, selection, and the active tab. Not Page or PDF.` |
| B-02.4 | Type help | `UI text size and UI font change the app chrome only (tabs, sidebar, toolbar, menus, Settings, palette); Page and PDF body size do not change. The code font is the only appearance value that reaches Page code and the exported PDF.` | `Affects the app only, not Page or PDF. Code font applies to code everywhere.` |
| B-02.5 | Preview help | `Theme, accent, and type are visible in the right rail while the controls stay in view. Page and PDF keep the paper light.` | `DELETE` |
| B-02.6 | Labels | `Appearance`, `Theme`, `Dark`, `Light`, `System`, `Accent`, `UI text size`, `Compact`, `Default`, `Large`, `UI font`, `Serif`, `Code font`, `JetBrains Mono`, `System Mono`, `Typography`, `Preview`, `Reset appearance` | `KEEP` |

### B.3 `apps/desktop/src/renderer/src/settings/ContinuousSettings.tsx`

| ID | Element | Current | New |
|---|---|---|---|
| B-03.1 | Page description | `Tune the canvas. These settings are global and apply to every document; Page and PDF do not change.` | `Canvas spacing and arrows. Global; Page and PDF don’t change.` |
| B-03.2 | Spacing help | `Space between chapters, between a card and its children, and between stacked rows.` | `Gaps between chapters, cards, and rows.` |
| B-03.3 | Arrows help | `Resting arrows use the resting width. Active width is kept at least the resting width; the arrowhead is a fixed size and never scales with path length. Reference edges keep their dashed style and resting width.` | `Resting and active arrow widths. The arrowhead is fixed; reference arrows stay dashed.` |
| B-03.4 | Advanced — width formula | `Canvas max is at least the top-level max + child max + sibling gap + the 54 px edge corridor: {n} px at the current values. Below that, the canvas cap is raised automatically.` | `The canvas widens automatically to fit the cards.` |
| B-03.5 | Advanced — internals note | `Cards stay content-driven inside these caps. Routing, trunk, lane, and stem internals are not settings.` | `DELETE` |
| B-03.6 | Preview help | `The sample tree is in the right rail and follows every value on this page.` | `DELETE` |
| B-03.7 | Reset confirm | `Reset every Continuous setting to the defaults? Page and PDF are not affected.` | `Reset every Continuous setting? Page and PDF aren’t affected.` |
| B-03.8 | Reset labels | `Reset settings`, `Cancel`, `Reset Continuous settings`, `Every Continuous setting is at its default.` | `KEEP` |
| B-03.9 | Zoom note | `Zoom is view state, not a setting: use the toolbar, the View menu, or the command palette for the current document.` | `DELETE` |
| B-03.10 | Slider labels | `Spacing`, `Chapter gap`, `Sibling gap`, `Child row gap`, `Arrows`, `Resting width`, `Active width`, `Muted width`, `Arrow size`, `Advanced`, `Canvas max width`, `Top-level max`, `Child max`, `Preview` | `KEEP` |

### B.4 `apps/desktop/src/renderer/src/settings/ExportSettings.tsx`

| ID | Element | Current | New |
|---|---|---|---|
| B-04.1 | Page description | `The PDF is always the Page layout, exported with the resolved page settings.` | `Exports the Page layout with these page settings.` |
| B-04.2 | Folder help, default | `New exports start in {documentsLabel}.` | `New exports go here.` |
| B-04.3 | Folder help, custom | `New exports start in this folder. Choose a folder for one export in the Export sheet without changing this default.` | `New exports go here. You can pick another folder when exporting.` |
| B-04.4 | Missing-folder note | `A missing folder is reported; NoteForest never creates or substitutes a folder silently.` | `DELETE` |
| B-04.5 | Filename help | `The document title is the file name, sanitized for the file system. No date or filename pattern is added. The name can still be edited for a single export in the Export sheet.` | `The file is named after the note. You can rename it when exporting.` |
| B-04.6 | Action help | `Folder and replacement decisions stay in the sheet; there is no native save dialog.` | `DELETE` |
| B-04.7 | Labels | `Export`, `Default folder`, `Folder`, `Choose…`, `New exports go here.`, `Use Documents`, `File name`, `Name`, `Export PDF…`, toast `Could not choose an export folder.` | `KEEP` except the toast → `Couldn’t choose an export folder.` |

### B.5 `apps/desktop/src/renderer/src/settings/PageAdvancedSettings.tsx`

| ID | Element | Current | New |
|---|---|---|---|
| B-05.1 | Advanced typography help | `Stored sizes are in points; line heights are unitless multipliers. The density lens applies once, so a preset-range value keeps its readability floor. Editing one value marks this layer Custom.` | `Sizes in points, line heights as a multiplier. Editing a value makes this layer Custom.` |
| B-05.2 | Advanced layout help | `Layout values are in pixels and are per level, not cumulative. Hidden engine values (packing, callout lane gate, trunk insets) are not exposed. Editing one value marks this layer Custom.` | `Values in pixels, per level. Editing a value makes this layer Custom.` |
| B-05.3 | Max card width help | `120–2000 px. The 240–560 px preset band follows the density lens; a custom cap outside it keeps its own scaling. Page cards and images use the same cap.` | `Card width limit. It follows density; images use the same limit.` |
| B-05.4 | Group titles/labels | `Advanced typography`, `Advanced layout`, `Layout`, `Use global typography`, `Use global layout`, `Max card width`, `Body size`, `Body line height`, `H1 size`, `H2 size`, `H3 size`, `Code size`, `Code line height`, `Table size`, `Table line height`, `Block label size`, `Minimum content width`, `Card padding`, `Card border`, `Segment gap`, `List indent`, `Max list indent` | `KEEP` |

### B.6 Page controllers and validation

| ID | File / element | Current | New |
|---|---|---|---|
| B-06.1 | `settings/page-setup.ts` messages | `Enter a margin in millimetres.`, `Use a value from 0 to 100 mm.`, `Enter a number from 0 to 100 mm for each margin.`, `Margins must leave at least 20 mm of content in each direction.` | `KEEP` |
| B-06.2 | `settings/page-advanced.ts` messages | `Enter a number.`, `Enter a line-height multiplier.`, `Use a value from {min} to {max} {unit}.`, `Use a multiplier from {min} to {max}.` | `KEEP` |
| B-06.3 | `settings/page-advanced.ts` cross-field | `H1 must be at least 3 pt above the body size ({n}).` / H2 / H3 / `Max list indent must be at least the list indent ({n}).` / `Max card width must be at least the minimum content width ({n}).` | `KEEP` |
| B-06.4 | `settings/usePageSettingsController.ts` | `Page Edit could not be committed. Retry after fixing the block.` (×2) | `Page Edit wasn’t saved. Fix the block and retry.` |
| B-06.5 | `settings/usePageSettingsController.ts` | `These margins do not fit.` (fallback) and `{message} Reduce the margins first, then change the page size or orientation.` | `KEEP` |
| B-06.6 | `settings/useContinuousSettingsController.ts` | `Could not save settings.` (fallback) | `Settings weren’t saved.` |

### B.7 Settings previews

| ID | File / element | Current | New |
|---|---|---|---|
| B-07.1 | `settings/PageSettingsPreview.tsx` preview chrome | `Sample page`, `Page geometry preview` | `KEEP` |
| B-07.2 | `settings/PageSettingsPreview.tsx` summary | `Preview paused — fix the highlighted values.`, `Measuring the page layout…`, `Measuring…`, `Preview unavailable` | `KEEP` |
| B-07.3 | `settings/PageSettingsPreview.tsx` error | `Page preview failed: {model.error ?? 'unknown error'}` | `The preview couldn’t be built.` with `{model.error}` in the paragraph's `title` |
| B-07.4 | `settings/ContinuousSettingsPreview.tsx` sample | `Anchored note`, sample card titles | `KEEP` |
| B-07.5 | `settings/AppearanceSettingsPreview.tsx` | no user copy | — |

---

## C. Errors, toasts, banners

### C.1 `apps/desktop/src/renderer/src/lib/editability.ts`

| ID | Current | New |
|---|---|---|
| C-01.1 | `Read mode — switch to Edit to add content` | `Read mode — switch to Edit to make changes` |
| C-01.2 | ` — Read mode` (suffix) | `KEEP` |
| C-01.3 | `Read mode — switch to Continuous Edit to make changes.` | `Read mode — switch to Edit to make changes.` |

Updates `apps/desktop/test/read-mode-gating.test.ts` exact strings.

### C.2 `apps/desktop/src/renderer/src/lib/save-failure.ts`

| ID | Current | New |
|---|---|---|
| C-02.1 | `This document is open read-only.` | `This note is open read-only.` |
| C-02.2 | `NoteForest cannot write to this folder.` | `NoteForest can’t write to this folder.` |
| C-02.3 | `The disk is full.` | `KEEP` |
| C-02.4 | `This file changed on disk outside NoteForest.` | `This file changed on disk.` |
| C-02.5 | `Another copy of NoteForest took over this document.` | `Another NoteForest window took over this note.` |
| C-02.6 | `The safety backup could not be written.` | `The backup couldn’t be written.` |
| C-02.7 | `The document did not pass validation.` | `The note has a problem that stops the save.` |
| C-02.8 | `The document file is missing.` | `The note’s file is missing.` |
| C-02.9 | `The document could not be saved.` | `The note couldn’t be saved.` |
| C-02.10 | `Reopen the document read-write, or save a copy somewhere else.` | `Reopen it read-write, or save a copy.` |
| C-02.11 | `Check the folder permissions and Retry, or save a copy elsewhere.` | `KEEP` |
| C-02.12 | `Free some space and Retry, or save a copy to another disk.` | `KEEP` |
| C-02.13 | `Your changes were not written. Reload from disk, overwrite it with this version, or save a copy.` | `Nothing was written. Reload, overwrite, or save a copy.` |
| C-02.14 | `Reopen the document to take a fresh lock, or save a copy.` | `Reopen it, or save a copy.` |
| C-02.15 | `Retry once the backup location is writable, or save a copy.` | `KEEP` |
| C-02.16 | `Save a copy to rescue the content, then reopen the original.` | `KEEP` |
| C-02.17 | `The file was moved or deleted. Save a copy to recover your edits.` | `KEEP` |
| C-02.18 | `Retry, save a copy somewhere else, or reload the file from disk.` | `KEEP` |
| C-02.19 | `overwriteConfirmation().description` | see A-16.1 |

### C.3 `apps/desktop/src/renderer/src/shell/SaveFailureBanner.tsx`

| ID | Current | New |
|---|---|---|
| C-03.1 | `{saveFailureHint(code)} Autosave is paused.` (one paragraph) | hint alone in the paragraph; a new sibling line `Autosave is paused.` |
| C-03.2 | `{failure.message}` (visible paragraph) | `SHORT + DETAILS` — remove the paragraph; `DETAILS: {failure.message}` |
| C-03.3 | `title={runtime.packagePath}` on the section | `DELETE` (path is in Details) |
| C-03.4 | `Details` summary + `{runtime.packagePath}` | `KEEP` (path joins the failure message with ` · `) |
| C-03.5 | `Could not save a copy.` | `Couldn’t save a copy.` |
| C-03.6 | `Saved a copy and opened it.` | `Saved a copy.` |
| C-03.7 | `Saved a copy to {path}` | `KEEP` |
| C-03.8 | `Could not reveal the document.` | `Couldn’t reveal the note.` |
| C-03.9 | `Retry`, `Retrying…`, `Restore backup…`, `Save a copy…`, `Saving…`, `Reload from disk…`, `Reveal in Finder`, `Revealing…`, `Overwrite…` | `KEEP` |

### C.4 `apps/desktop/src/renderer/src/lib/recovery.ts`

| ID | Current | New |
|---|---|---|
| C-04.1 | `This document was saved by a newer NoteForest.` | `This note comes from a newer NoteForest.` |
| C-04.2 | `This document is missing.` | `This note is missing.` |
| C-04.3 | `This document could not be read.` | `This note couldn’t be read.` |
| C-04.4 | `This version of NoteForest cannot open it. The file stays read-only: it will not be downgraded, edited, or overwritten. Open it in the newer version, or restore an older backup as a new copy.` | `Open it in the newer NoteForest. This version leaves the file unchanged.` |
| C-04.5 | `The folder or its document.json is missing. It may have been moved or deleted. NoteForest has not changed anything on disk.` | `The folder is gone; it may have been moved or deleted. Nothing on disk was changed.` |
| C-04.6 | `The file did not parse into a valid document and has not been changed. Inspect the reason below, or restore a valid backup as a new copy.` | `The file couldn’t be read and was not changed. Restore a backup, or check Details.` |
| C-04.7 | `Newer version`, `Missing`, `Unreadable` | `KEEP` |

### C.5 `apps/desktop/src/renderer/src/shell/StatusBar.tsx`

| ID | Current | New |
|---|---|---|
| C-05.1 | `No document open` | `No note open` |
| C-05.2 | `{n} idle` (health info chip) | `{n} unused` |
| C-05.3 | `{n} orphan(s)`, `{n} structure`, `Document health: …`, `{n} anchor(s) need repair`, `{n} broken · {m} ambiguous` | `KEEP` |
| C-05.4 | `Writing atomically…` | `Saving…` |
| C-05.5 | `File missing`, `Read-only`, `Saving…`, `Save failed`, `External change`, `Unsaved changes`, `Saved`, `Nothing is written; the file is not recreated`, `Large file · not written`, `Save paused · the file changed on disk`, `Not saved to disk yet`, `Saved to disk`, `Markdown file` | `KEEP` |

### C.6 `apps/desktop/src/renderer/src/shell/DraftMaterializeBanner.tsx`

| ID | Current | New |
|---|---|---|
| C-06.1 | `This note is not saved yet` | `KEEP` |
| C-06.2 | `{error.message}` | short message from C-14.13; the path moves to Details only if the banner adopts one (it does not today) |
| C-06.3 | `Choose another library…`, `Retry` | `KEEP` |

### C.7 `apps/desktop/src/renderer/src/shell/RecoverySurface.tsx`

| ID | Current | New |
|---|---|---|
| C-07.1 | `NoteForest has no backup for this document yet. The original folder is unchanged; restore it from another copy or a filesystem backup.` | `No backup yet. Restore the note from another copy.` |
| C-07.2 | `Every backup listed below is invalid. The original folder is unchanged.` | `No usable backup. Nothing on disk was changed.` |
| C-07.3 | `Newest first · restoring always creates a new copy` | `Newest first. Restoring makes a copy.` |
| C-07.4 | `Restore newest valid backup` | `Restore newest backup` |
| C-07.5 | `There is no valid backup to restore.` | `No valid backup to restore.` |
| C-07.6 | `Restore the newest valid backup as a new copy.` | `Restores a copy.` |
| C-07.7 | `Could not restore a backup.` | `Couldn’t restore a backup.` |
| C-07.8 | `Restored the newest backup as a new copy and opened it.` | `Restored the newest backup.` |
| C-07.9 | `Restored the newest backup to {path}` | `KEEP` |
| C-07.10 | `Still unavailable: {tab.recovery.reason}` | `SHORT + DETAILS` — `Still unavailable.`; `DETAILS: {reason}` |
| C-07.11 | `Still unavailable: the document folder is missing.` | `Still unavailable. The folder is missing.` |
| C-07.12 | `The document opened.` | `The note opened.` |
| C-07.13 | `Could not reveal the document.` | `Couldn’t reveal the note.` |
| C-07.14 | `Close this tab. The folder on disk is not deleted.` | `Close this tab. The folder is kept.` |
| C-07.15 | `Read-only recovery`, `Read-only · no overwrite`, `Status`, `Folder`, `Reason`, `Validation details ({n})`, `Warnings ({n})`, `Backups`, `Reading backups…`, `No usable backups`, `Unusable: {error}`, `Restoring…`, `Retry`, `Retrying…`, `Remove tab`, `Reveal in Finder`, `Revealing…`, `Close tab` | `KEEP` |

### C.8 `apps/desktop/src/renderer/src/shell/DocumentStatusPanel.tsx`

| ID | Current | New |
|---|---|---|
| C-08.1 | `another session holds the lock` | `open in another window` |
| C-08.2 | `written by a newer NoteForest version` | `from a newer NoteForest` |
| C-08.3 | `the package could not be read` | `the file couldn’t be read` |
| C-08.4 | `the package is invalid` | `the file is invalid` |
| C-08.5 | `the package is missing` | `the file is missing` |
| C-08.6 | Slim Details paragraph (5 sentences) | `This note opened read-only and your file is not being modified. Close the other NoteForest window; if none is open, quit and reopen NoteForest.` |
| C-08.7 | `This document opened read-only. Your file is not being modified. If another NoteForest window is open, close it. If no other window is open, quit NoteForest completely and reopen: a lock from a previous run becomes stale and offers Take over.` | `This note opened read-only and your file is not being modified. Close the other NoteForest window; if none is open, quit and reopen NoteForest.` |
| C-08.8 | Stale-lock body | `Another NoteForest window left this note open. Take over only if no other window is using it.` |
| C-08.9 | `Lock taken over. This document is now editable.` | `Lock taken over. You can edit now.` |
| C-08.10 | `Could not reopen the document.` | `Couldn’t reopen the note.` |
| C-08.11 | `Still read-only: another NoteForest session holds the lock.` | `Still read-only. Another window has it open.` |
| C-08.12 | `Document reopened. This document is now editable.` | `Reopened. You can edit now.` |
| C-08.13 | `Rechecked the document. It is still read-only.` | `Still read-only.` |
| C-08.14 | `Could not take over the lock.` | `Couldn’t take over the lock.` |
| C-08.15 | `PID`, `Host`, `Session`, `Heartbeat`, `Lock file`, `The lock file is corrupt and its owner cannot be read.` | `KEEP` — inside Details only (`dialogs.md` §3) |
| C-08.16 | `Read-only · stale lock`, `Read-only`, `Take over lock`, `Taking over…`, `Review`, `Cancel`, `Recheck`, `Rechecking…`, `Details`, `Lock details` | `KEEP` |

### C.9 `apps/desktop/src/renderer/src/markdown/markdown-save.ts`

| ID | Current | New |
|---|---|---|
| C-09.1 | `The Markdown editor is not available.` | `The editor isn’t available.` |
| C-09.2 | `Could not reload the Markdown file.` | `Couldn’t reload the file.` |
| C-09.3 | `This Markdown file is no longer on disk. Nothing was written.` | `This file is no longer on disk. Nothing was written.` |
| C-09.4 | `This Markdown file is not open.` / `This Markdown file is open read-only.` | `KEEP` |

### C.10 `apps/desktop/src/renderer/src/export/export-flow.ts`

| ID | Current | New |
|---|---|---|
| C-10.1 | `Open a document before exporting a PDF.` | `Open a note before exporting a PDF.` |
| C-10.2 | `Could not commit the Page Edit block before the PDF export.` (×2) | `Page Edit wasn’t saved before the export.` |
| C-10.3 | `The export job is no longer available.` | `KEEP` |
| C-10.4 | `The PDF export failed.` | `KEEP` (the sheet maps it per A-22.14) |
| C-10.5 | `Could not reveal the PDF.` | `Couldn’t reveal the PDF.` |
| C-10.6 | `Could not open the PDF.` | `Couldn’t open the PDF.` |
| C-10.7 | `Choose an export folder first.` | `KEEP` |

### C.11 `apps/desktop/src/renderer/src/App.tsx`

| ID | Current | New |
|---|---|---|
| C-11.1 | `Library warnings` (fallback) | `Some library folders couldn’t be read.` |
| C-11.2 | `Settings could not be read. NoteForest is using defaults; open Settings → Data & About to review the backup and reset.` | `Settings couldn’t be read. The defaults are in use.` |
| C-11.3 | `Per-document settings could not be read. Open Settings → Data & About to reset or restore them.` | `Note settings couldn’t be read. The defaults are in use.` |

### C.12 `apps/desktop/src/renderer/src/actions.ts`

| ID | Current | New |
|---|---|---|
| C-12.1 | `The command was rejected.` (×2) | `That command isn’t available right now.` |
| C-12.2 | `This document opened read-only. Your file was not modified.` | `This note opened read-only. Your file was not changed.` |
| C-12.3 | `Could not open the Markdown file.` (×2) | `Couldn’t open the file.` |
| C-12.4 | `Could not commit a Page Edit block before switching libraries.` | `Page Edit wasn’t saved, so the library didn’t change.` |
| C-12.5 | `Could not save before switching libraries.` | `The note wasn’t saved, so the library didn’t change.` |
| C-12.6 | `Could not reveal the library.` | `Couldn’t reveal the library.` |
| C-12.7 | `Could not create a chapter.` | `Couldn’t create a chapter.` |
| C-12.8 | `The chapter was created without an ID.` | `The chapter wasn’t created.` |
| C-12.9 | `Could not rename the document.` | `Couldn’t rename the document.` |
| C-12.10 | `Could not commit the Page Edit block.` | `Page Edit wasn’t saved.` |
| C-12.11 | `Save failed.` | `The note wasn’t saved.` |
| C-12.12 | `Could not commit the Page Edit block before closing the tab.` | `Page Edit wasn’t saved, so the tab stayed open.` |
| C-12.13 | `Could not save before closing the tab.` | `The note wasn’t saved, so the tab stayed open.` |
| C-12.14 | `That document is no longer available.` | `That note is no longer available.` |
| C-12.15 | `Could not reveal the Markdown file.` | `Couldn’t reveal the file.` |
| C-12.16 | `Could not reveal the document.` | `Couldn’t reveal the note.` |
| C-12.17 | `This note is still a draft. Close its tab to discard it; nothing has been written.` | `KEEP` |
| C-12.18 | `No recently closed tab.` | `KEEP` |
| C-12.19 | `Open a document before…` variants | none left after A-12.2 / A-13.2 |

### C.13 `apps/desktop/src/renderer/src/state/runtime.ts`

| ID | Current | New |
|---|---|---|
| C-13.1 | `This note is open read-only; it cannot be saved.` | `This note is open read-only. It can’t be saved.` |
| C-13.2 | `Could not commit the pending edit.` (×3) | `The pending edit wasn’t saved.` |
| C-13.3 | `This document is not waiting on a stale lock.` | `This note isn’t waiting on a stale lock.` |
| C-13.4 | `The document reopened read-only; the lock was not taken over.` | `The note reopened read-only. The lock wasn’t taken over.` |
| C-13.5 | `The command was rejected.` | `That command isn’t available right now.` |
| C-13.6 | `This document is open read-only.` (×6) | `This note is open read-only.` |
| C-13.7 | `The block no longer exists.` (×5) | `This block no longer exists.` |
| C-13.8 | `Could not record the image asset.` (×3) | `The image wasn’t added.` |
| C-13.9 | `Could not insert the image.` / `Could not replace the image.` | `The image wasn’t added.` / `The image wasn’t replaced.` |
| C-13.10 | `Could not create the block.` | `The block wasn’t created.` |
| C-13.11 | `Could not branch from the selection.` | `The branch wasn’t created.` |
| C-13.12 | `Place the caret inside a text block, without a selection, first.` | `Place the caret in a text block first.` |
| C-13.13 | `The caret is in a different block.` | `The caret must be in the same block.` |
| C-13.14 | `Could not split the block.` / `Could not merge the block.` | `The block wasn’t split.` / `The block wasn’t merged.` |
| C-13.15 | `A block cannot link to itself.` | `A block can’t link to itself.` |
| C-13.16 | `Could not link the block.` | `Couldn’t add the link.` |
| C-13.17 | `This reference no longer exists.` | `This reference is gone.` |
| C-13.18 | `Only reference links can be removed here.` | `Only a reference link can be removed here.` |
| C-13.19 | `Could not remove the reference.` | `The reference wasn’t removed.` |
| C-13.20 | `This anchor no longer exists.` (×4) | `This anchor is gone.` |
| C-13.21 | `Open the editor before relinking an anchor.` | `Open the editor first.` |
| C-13.22 | `Select the replacement range in the anchor’s own block.` | `Select the new text in the anchor’s block.` |
| C-13.23 | `Select one continuous text range.` (×2) | `Select one continuous range.` |
| C-13.24 | `Only an idle anchor can be removed here. Repair or delete its branches first.` | `This anchor has branches. Remove them first.` |
| C-13.25 | `This branch no longer exists.` (×3) | `This branch is gone.` |
| C-13.26 | `This branch is not anchored.` | `This branch has no anchor.` |
| C-13.27 | `Could not delete the branch.` (×2) | `The branch wasn’t removed.` |
| C-13.28 | `That anchor record exists; use a repair or delete action instead.` | `This anchor already exists. Repair or delete it instead.` |
| C-13.29 | `That block no longer exists.` (×2) | `This block no longer exists.` |
| C-13.30 | `That anchor ID is no longer bound in this block.` | `This anchor isn’t bound in the block any more.` |
| C-13.31 | `That anchor record already exists.` | `This anchor already exists.` |
| C-13.32 | `Open the editor before recreating an anchor.` | `Open the editor first.` |
| C-13.33 | `Select the orphaned range in its own block first.` | `Select the unlinked range in its block first.` |
| C-13.34 | `Could not recreate the anchor. Select the orphaned range itself, or strip the ID first.` | `The anchor wasn’t recreated. Select the unlinked range itself, or remove its link first.` |
| C-13.35 | `Could not make this reference the home.` / `Could not move the target here.` / `Could not demote this branch to a reference.` | `This reference couldn’t become the home.` / `The target wasn’t moved here.` / `The branch wasn’t turned into a reference.` |
| C-13.36 | `Could not create a chapter.` / `The chapter was created without an ID.` / `Could not add the first block.` | `Couldn’t create a chapter.` / `The chapter wasn’t created.` / `The first block wasn’t added.` |
| C-13.37 | `This chapter no longer exists.` | `This chapter is gone.` |
| C-13.38 | `This chapter still has top-level blocks. Move or delete them first.` | `This chapter still has blocks. Move or delete them first.` |
| C-13.39 | `Could not delete the chapter.` | `The chapter wasn’t deleted.` |
| C-13.40 | `Could not move the block.` / `Could not indent the block.` / `Could not outdent the block.` / `Could not reorder the block.` / `Could not delete the block.` | `The block wasn’t moved.` / `The block wasn’t indented.` / `The block wasn’t outdented.` / `The block wasn’t reordered.` / `The block wasn’t deleted.` |
| C-13.41 | `This block has no incoming branch.` | `This block has no parent branch.` |
| C-13.42 | `Could not detach the branch.` | `The block wasn’t detached.` |
| C-13.43 | `Nothing to undo.` / `Nothing to redo.` | `KEEP` |
| C-13.44 | `Could not undo.` / `Could not redo.` | `Undo failed.` / `Redo failed.` |
| C-13.45 | `Kept as reference from “{sourceTitle}”.` (notice) | `Kept as a reference from “{sourceTitle}”.` |
| C-13.46 | `Select the text / a formula / a code range in the anchor’s block.` (glued variantes) | context-aware single sentence: text → `Select the text first.`; formula → `Select the formula first.`; code → `Select the code first.` |

### C.14 `apps/desktop/src/main/library.ts`

| ID | Current | New |
|---|---|---|
| C-14.1 | `That folder does not exist or is not a directory: {resolved}` | `SHORT + DETAILS` — `That folder doesn’t exist.`; `DETAILS: {resolved}` |
| C-14.2 | `The folder is not readable: {resolved}` | `SHORT + DETAILS` — `That folder can’t be opened.`; `DETAILS: {resolved}` |
| C-14.3 | `That folder is inside the library “{name}”. Choose a folder outside it.` | `That folder is inside a library. Choose another parent.` |
| C-14.4 | `“{name}” is already a library inside that folder. Choose a folder that does not contain another library.` | `A library already exists in that folder. Choose another parent.` |
| C-14.5 | `“{name}” is already a library inside that parent. Choose another parent.` | `A library already exists in that parent. Choose another.` |
| C-14.6 | `That folder would be inside the library “{name}”. Choose a parent outside it.` | `That folder is inside a library. Choose another parent.` |
| C-14.7 | `Could not create the library: {error}` | `SHORT + DETAILS` — `Couldn’t create the library.`; `DETAILS: {error}` |
| C-14.8 | `“{resolved}” is not inside the active library ({root}). Choose a folder in this library.` | `SHORT + DETAILS` — `That folder isn’t in this library. Choose a folder inside it.`; `DETAILS: {resolved} · {root}` |
| C-14.9 | `“{reservedSegment}” is reserved for note assets or backups. Choose a normal folder.` | `That folder name is reserved. Choose another name.` |
| C-14.10 | `That folder no longer exists: {resolved}. Choose another folder for this note.` | `SHORT + DETAILS` — `That folder no longer exists. Choose another one.`; `DETAILS: {resolved}` |
| C-14.11 | `The active library was not found: {directory}. Locate it or open another library.` (×2) | `SHORT + DETAILS` — `The library isn’t there any more. Locate it or open another.`; `DETAILS: {directory}` |
| C-14.12 | `Could not create the draft: {block.message}` | `SHORT + DETAILS` — `Couldn’t create the note.`; `DETAILS: {block.message}` |
| C-14.13 | `The library this note was created in is not available: {path}. Reconnect it or choose another library, then retry.` | `SHORT + DETAILS` — `The note’s library is offline.`; `DETAILS: {path}` |
| C-14.14 | `This draft is no longer open. Create a new note and try again.` | `This note isn’t open any more. Create a new one.` |
| C-14.15 | `This draft is no longer open.` | `This note isn’t open any more.` |
| C-14.16 | `The note folder is locked by another NoteForest session. Close the other NoteForest window and try again.` | `Another window has this note open. Close it there and try again.` |
| C-14.17 | `Could not create the first block: {block.message}` | `SHORT + DETAILS` — `The first block wasn’t created.`; `DETAILS: {message}` |
| C-14.18 | `The new document could not be opened.` | `The note couldn’t be opened.` |
| C-14.19 | `This document is open read-only; the image was not copied.` (×3) | `This note is open read-only; the image wasn’t added.` |
| C-14.20 | `Could not read the image: {error}` (×2) | `SHORT + DETAILS` — `The image couldn’t be read.`; `DETAILS: {error}` |
| C-14.21 | `The copied image asset id is malformed.` | `That image can’t be copied.` |
| C-14.22 | `The source document could not be read: {…}` | `SHORT + DETAILS` — `The source note couldn’t be read.`; `DETAILS: {…}` |
| C-14.23 | `There is no document to copy.` | `There is no note to copy.` |
| C-14.24 | `Could not list backups: {error}` | `SHORT + DETAILS` — `Backups couldn’t be listed.`; `DETAILS: {error}` |
| C-14.25 | `Could not inspect the restore location: {error}` | `SHORT + DETAILS` — `That folder can’t be checked.`; `DETAILS: {error}` |
| C-14.26 | `A document already exists at that location. Choose a new folder.` (×2, library + backup-restore) | `A note already exists there. Choose a new folder.` |
| C-14.27 | `The chosen folder is not writable: {error}` | `SHORT + DETAILS` — `That folder isn’t writable.`; `DETAILS: {error}` |
| C-14.28 | `NoteForest has no valid backup for this document.` | `There is no valid backup for this note.` |
| C-14.29 | `Another NoteForest session is writing a note inside this folder. It was not moved.` | `Another window is writing a note in this folder. Nothing was moved.` |
| C-14.30 | `Could not move “{title}” to the Trash: {error}. The folder was not changed.` (×2) | `SHORT + DETAILS` — `Couldn’t move “{title}” to the Trash. Nothing was changed.`; `DETAILS: {error}` |
| C-14.31 | `Another NoteForest session is writing this document. It was not moved.` | `Another window is writing this note. Nothing was moved.` |
| C-14.32 | `Could not release the document lock: {message}. It was not moved.` | `SHORT + DETAILS` — `The note is still locked. Nothing was moved.`; `DETAILS: {message}` |
| C-14.33 | `settings.json could not be read; nothing was written: {error}` | `SHORT + DETAILS` — `Settings couldn’t be read. Nothing was written.`; `DETAILS: {error}` |
| C-14.34 | `settings.json is corrupt and was not overwritten: {error}. Use Reset settings to replace it with the product defaults.` | `SHORT + DETAILS` — `Settings couldn’t be read. Reset them to the defaults.`; `DETAILS: {error}` |
| C-14.35 | `Could not save settings: {error}` | `SHORT + DETAILS` — `Settings weren’t saved.`; `DETAILS: {error}` |
| C-14.36 | `Could not reset settings: {error}` | `SHORT + DETAILS` — `Settings weren’t reset.`; `DETAILS: {error}` |
| C-14.37 | `No library is open. Open a folder as a library first.`, `That folder is not one of the known libraries.`, `Choose a parent folder that exists.`, `A folder named “{name}” already exists there.`, `Enter a library name.`, `The library name cannot contain a path separator.`, `Choose a parent folder.`, `Choose a folder inside the library for this note.`, `Enter a folder name.`, `That folder name is reserved.`, `A folder name cannot start with a dot.`, `A folder name cannot contain “/”, “\\”, or “:”.`, `A folder name cannot be longer than {n} characters.`, `That name is reserved for note assets.`, `That name is reserved for backups.`, `A folder name cannot end with a Markdown extension.`, `The folder was not changed.` | `KEEP` |

### C.15 `apps/desktop/src/main/index.ts` (native dialogs and pickers)

| ID | Current | New |
|---|---|---|
| C-15.1 | `NoteForest could not save your changes before {quitting \| closing}.` | `NoteForest couldn’t save your changes.` |
| C-15.2 | detail: `{reason}\n\nThe window is still open. Retry the save, or cancel and keep working.` | `The window is still open. Retry, or cancel and keep working.\n\n{reason}` (outcome first, technical last) |
| C-15.3 | `Could not save your changes.` (×2) | `Your changes weren’t saved.` |
| C-15.4 | `Save changes to “{title}” before closing?` / `Save changes to {n} documents before closing?` | `Save changes before closing?` with the titles in `detail` (one per line) |
| C-15.5 | `Restore backup as a copy` (native save dialog title), button `Restore copy` | `KEEP` |
| C-15.6 | `Open Markdown`, `Save a copy`, `Insert image`, `Choose export folder`, `Untitled`, `Open` | `KEEP` |
| C-15.7 | `Changes not saved` (dialog title) | `KEEP` |
| C-15.8 | `Choose a folder inside the library for this note.`, `No library path was provided.`, `No folder was chosen.`, `The window is not available.`, `No Markdown file was chosen.`, `That is not a Markdown file.`, `No image selected.` | `KEEP` |

### C.16 `apps/desktop/src/main/export-preflight.ts`

All of these are Details content or warning rows (A-22.11); none may keep an engine word.

| ID | Current | New |
|---|---|---|
| C-16.1 | `The print run measured document {id}, not {id}.` | `The PDF was built from a different note.` |
| C-16.2 | `The print run measured revision {r}, not the exported revision {r}.` | `The PDF was built from an older version of the note.` |
| C-16.3 | `The print window type metrics do not match the resolved PageTheme (font …, line ratio …).` | `The print layout doesn’t match the page settings.` |
| C-16.4 | `The print run reports a {w} × {h} mm page; the resolved setup is {w} × {h} mm.` | `The PDF page size doesn’t match the page settings.` |
| C-16.5 | `Block {label}: {defect.message}` | `A block doesn’t fit the page.` |
| C-16.6 | `Page {n} overflows the resolved content area; printing would clip it.` | `Page {n} is too tall and would be cut.` |
| C-16.7 | `Page {n} overflows after rendering; printing would clip it.` | `Page {n} is too tall and would be cut.` |
| C-16.8 | `Block {id} has a broken or ambiguous anchor; its branch is printed with the fallback marker.` | `A broken anchor prints with a marker.` |
| C-16.9 | `Asset {id} could not be decoded; the PDF shows the placeholder.` | `An image couldn’t be read; the PDF shows a placeholder.` |
| C-16.10 | `Asset {id} is missing from the package; the PDF shows the placeholder.` | `An image is missing; the PDF shows a placeholder.` |
| C-16.11 | `The print window logged an error: {message}` | `The print step reported an error.` |
| C-16.12 | `Block {id} is in the document but was not placed on any derived page.` | `A block is missing from the pages.` |
| C-16.13 | `The measured page model lost or duplicated content: {…}` | `The pages lost or duplicated content.` |
| C-16.14 | `The produced PDF has {n} pages; the paginator derived {m}.` | `The PDF has {n} pages; the layout has {m}.` |
| C-16.15 | `PDF page {n} is {w} × {h} mm; the resolved page is {w} × {h} mm.` | `Page {n} has the wrong size.` |
| C-16.16 | `The paginator produced an empty page {n} (no fragments, edges, trunks, or images); a blank page is an export failure.` | `Page {n} came out blank, so the export stopped.` |
| C-16.17 | `PDF page {n} is blank (no text, image, or vector content); a blank page is an export failure.` | `Page {n} came out blank, so the export stopped.` |
| C-16.18 | `PDF page {n} has no extractable text; the model page has {m} image fragment(s).` | `Page {n} has no selectable text.` |
| C-16.19 | `The produced PDF has no extractable text.` | `The PDF has no selectable text.` |
| C-16.20 | `The produced PDF contains {n} replacement glyph(s).` | `The PDF has {n} missing characters.` |

Keep `defectLabel` ids and codes out of the message: the block title (or `Block`) is enough; the id
moves to Details.

### C.17 `apps/desktop/src/main/markdown-file.ts`

| ID | Current | New |
|---|---|---|
| C-17.1 | `Could not open the Markdown file: {error}` | `SHORT + DETAILS` — `Couldn’t open the file.`; `DETAILS: {error}` |
| C-17.2 | `Could not read the Markdown file: {error}` (×2) | `SHORT + DETAILS` — `Couldn’t read the file.`; `DETAILS: {error}` |
| C-17.3 | `Could not write the Markdown file: {error}` (×2) | `SHORT + DETAILS` — `Couldn’t save the file.`; `DETAILS: {error}` |
| C-17.4 | `Could not save the Markdown file: {error}` | `SHORT + DETAILS` — `Couldn’t save the file.`; `DETAILS: {error}` |
| C-17.5 | `The Markdown file is not open.`, `Reopen the Markdown file to load its images.`, `Only local image files are supported.`, `Images outside this file’s folder are not loaded.`, `Symbolic links are not loaded.`, `Image file not found.`, `Image file is too large.` | `KEEP` |

### C.18 `apps/desktop/src/main/backup-restore.ts`

| ID | Current | New |
|---|---|---|
| C-18.1 | `Choose a new folder; a restored copy cannot replace the current document.` | `Choose a new folder. A restore never replaces the current note.` |
| C-18.2 | `A document already exists at that location. Choose a new folder.` | `A note already exists there. Choose a new folder.` |
| C-18.3 | `Choose a destination inside the NoteForest library.`, `Choose a folder for the restored copy, not the library root.`, `Choose a folder directly inside the NoteForest library.` | `KEEP` |

### C.19 `apps/desktop/src/main/document-settings.ts` and `markdown-backup.ts`

| ID | Current | New |
|---|---|---|
| C-19.1 | `Could not save document settings: {error}` | `SHORT + DETAILS` — `Note settings weren’t saved.`; `DETAILS: {error}` |
| C-19.2 | `The backup is not valid JSON: {error}` | `SHORT + DETAILS` — `That backup can’t be read.`; `DETAILS: {error}` |
| C-19.3 | `The backup has no document settings entry list.` | `That backup has no settings.` |
| C-19.4 | `No valid document settings backup was found.` | `No valid backup was found.` |
| C-19.5 | `Could not read the backup: {error}` | `SHORT + DETAILS` — `The backup couldn’t be read.`; `DETAILS: {error}` |
| C-19.6 | `Could not write the Markdown backup: {error}` (`markdown-backup.ts`) | `SHORT + DETAILS` — `The backup couldn’t be written.`; `DETAILS: {error}` |

### C.20 `apps/desktop/src/renderer/src/markdown/MarkdownFileEditor.tsx` and `MarkdownImageView.tsx`

| ID | Element | Current | New |
|---|---|---|---|
| C-20.1 | Edit-disabled reason, read-only | `This Markdown file is open read-only.` | `This file is open read-only.` |
| C-20.2 | Edit-disabled reason, missing | `This Markdown file is no longer on disk. Copy what you need; saving is unavailable.` | `This file is no longer on disk. Copy what you need; saving is off.` |
| C-20.3 | Edit-disabled reason, too large | `This Markdown file is too large to edit.` | `This file is too large to edit.` |
| C-20.4 | Mode button title | `Edit this Markdown file (⌘E)` | `Edit this file (⌘E)` |
| C-20.5 | Mode disabled title | `Edit unavailable: {reason}` | `Can’t edit: {reason}` |
| C-20.6 | Missing banner | `This file is no longer on disk. NoteForest will not recreate it; copy anything you still need.` | `This file is no longer on disk. Copy anything you still need.` |
| C-20.7 | Undo/redo titles | `Undo (⌘Z)`, `Redo (⇧⌘Z)`, `Undo — available in Edit mode`, `Redo — available in Edit mode` | `KEEP` |
| C-20.8 | Badge/aria | `Markdown file`, `Markdown Edit mode`, `Markdown Read mode`, `Markdown file body`, `Markdown file body, read mode` | `KEEP` |
| C-20.9 | Image placeholder reasons | `Image file is missing.`, `Image file not found.`, `Image file is too large.` | `KEEP` |

---

## D. Editor labels, menus, palette, tooltips

### D.1 `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`

| ID | Element | Current | New |
|---|---|---|---|
| D-01.1 | Block anchor-warning tooltip | `{anchorHealthReason(reason)} Open document health to repair; the branch and target stay.` | `Open document health to repair.` (the technical reason is dropped; the health modal owns the problem line) |
| D-01.2 | Same, aria | `Ambiguous anchor. Open document health to repair.` / `Lost anchor. Open document health to repair.` | `KEEP` |
| D-01.3 | Chapter | `Chapter`, `Untitled chapter`, `Edit chapter title`, `Chapter title`, `No top-level blocks yet.`, `Add a top-level block to this chapter`, `Add top-level block` | `KEEP` |
| D-01.4 | Block chrome | `Block actions and reorder`, `Add child`, `Add child block`, `Add sibling`, `Add sibling block`, `See also`, `Referenced by`, `Lost anchor`, `Ambiguous anchor`, `Anchored branch` | `KEEP` |
| D-01.5 | Anchor chip titles | `Formula anchor: “…”`, `Code anchor: “…”`, `Image region anchor: “…”`, `Image point anchor: “…”`, `Anchor: “…”` | `KEEP` |
| D-01.6 | Branch port | `Expand branch, {n} child blocks hidden`, `Collapse branch, {n} child blocks` | `KEEP` |
| D-01.7 | Marker | `Anchor: “{quote}”, {n} branch(es)` | `KEEP` |

### D.2 `apps/desktop/src/renderer/src/actions.ts` (menus)

| ID | Element | Current | New |
|---|---|---|---|
| D-02.1 | Split item label | `Split at caret — {check.reason}` | `Split at caret` (drop the glue), disabled; a fixed description `Place the caret in a text block.` |
| D-02.2 | Merge item label | `Merge with next block — {check.reason}` | `Merge with next block`; disabled description `The next block must be in the same chapter.` |
| D-02.3 | Detach item | `Detach from parent` | `KEEP` (matches A-09.1) |
| D-02.4 | Block menu labels | `Edit block`, `Insert image…`, `Insert table…`, `Add child block`, `Add sibling block`, `Link as reference…`, `Demote to reference`, `Move to…`, `Move up`, `Move down`, `Indent`, `Outdent`, `Expand branch`, `Collapse branch`, `Delete block…` | `KEEP` |
| D-02.5 | Chapter menu | `Rename chapter…`, `Add block` | `KEEP` |
| D-02.6 | Reference menus | `See also: {title}`, `Referenced by: {context}`, `Remove reference to {target}`, `Remove reference from {source}` | `KEEP` (two different commands, two labels) |
| D-02.7 | Library/vault menus | `New note here`, `New folder…`, `Rename folder…`, `Move to folder…`, `Reveal in Finder`, `Move to Trash…`, `Open`, `Open recovery`, `Remove from recents`, `Rename document…`, `Close tab`, `Discard draft`, `Reveal in Finder — not saved yet` | `KEEP` |
| D-02.8 | Palette commands | `New note`, `New chapter`, `Save`, `Export PDF…`, `Close tab`, `Toggle sidebar`, `Zoom in`, `Zoom out`, `Actual size`, `Fit width`, `Switch to Continuous`, `Switch to Page`, `Switch to Read mode`, `Focus branch`, `Rename document…`, `Reveal document in Finder`, `Add top-level block`, `Add child block`, `Add sibling block`, `Link as reference…`, `Indent block`, `Outdent block`, `Document health`, `Block type: …`, `Undo`, `Redo`, `Settings…`, `Insert table`, `Insert image…`, `Insert math…`, `Toggle code block` | `KEEP` |
| D-02.9 | Read-mode disabled reason | `{label} — Read mode` | `KEEP` |

### D.3 `apps/desktop/src/main/menu.ts` (native menu)

| ID | Current | New |
|---|---|---|
| D-03.1 | `New Document` | `New note` |
| D-03.2 | `Open Document…` | `Open note…` |
| D-03.3 | `New Chapter` | `New chapter` |
| D-03.4 | `Close Tab` | `Close tab` |
| D-03.5 | `Reopen Closed Tab` | `Reopen closed tab` |
| D-03.6 | `Command Palette…` | `Command palette…` |
| D-03.7 | `Toggle Sidebar` | `Toggle sidebar` |
| D-03.8 | `Fit Width` | `Fit width` |
| D-03.9 | `Focus Branch` | `Focus branch` |
| D-03.10 | `Actual Size` | `Actual size` |
| D-03.11 | `Zoom In` / `Zoom Out` | `Zoom in` / `Zoom out` |
| D-03.12 | `Open Markdown…`, `Save`, `Export PDF…`, `Close Window`, `Undo`, `Redo`, `Keyboard shortcuts`, `Settings…`, `Edit`/`View`/`Window`/`File`/`Help` | `KEEP` |

### D.4 `apps/desktop/src/renderer/src/shell/CommandPalette.tsx`

| ID | Current | New |
|---|---|---|
| D-04.1 | Empty state | `No commands or documents match.` | `KEEP` (the palette lists entries, notes and Markdown files; “documents” is the right noun here) |
| D-04.2 | Placeholder/labels | `Search or run a command…`, `Search or run a command`, `Clear search`, `Results`, `Command palette`, `move`, `open`, `close`, group labels `Commands`/`Documents`/`Blocks` | `KEEP` |
| D-04.3 | Document hint | `Markdown file` / `{n} chapter(s)` | `KEEP` |

### D.5 `apps/desktop/src/renderer/src/shell/CanvasHeader.tsx`

| ID | Current | New |
|---|---|---|
| D-05.1 | Export title | `Export this document to PDF (⇧⌘E)` | `Export to PDF (⇧⌘E)` |
| D-05.2 | Page nav titles | `Previous page (⌥↑)`, `Next page (⌥↓)`, `Previous page`, `Next page` | `KEEP` |
| D-05.3 | Undo/redo | `Undo (⌘Z)`, `Redo (⇧⌘Z)`, `Nothing to undo`, `Nothing to redo`, `Undo — {READ_MODE_TITLE}`, `Redo — {READ_MODE_TITLE}` | `KEEP` |
| D-05.4 | Counter/status | `Page {n} of {m}`, `Updating…`, `Export PDF` | `KEEP` |

### D.6 `apps/desktop/src/renderer/src/shell/ViewControls.tsx` and `Toolbar.tsx`

| ID | Current | New |
|---|---|---|
| D-06.1 | Disabled view reason | `Open a document to change the view` (×2) | `Open a note to change the view` |
| D-06.2 | Tooltips | `Continuous layout (⌘2)`, `Page layout (⌘3)`, `Edit mode (⌘E)`, `Page Edit mode (⌘E)`, `Read mode (⌘E)`, `Page Read — exact preview (⌘E)` | `KEEP` |
| D-06.3 | Zoom | `Current zoom {n} percent. Reset to actual size`, `Reset zoom to actual size (⌘0)`, `Zoom out (⌘−)`, `Zoom in (⌘+)`, `Zoom in`, `Zoom out`, `Zoom` | `KEEP` |
| D-06.4 | Palette button | `Command palette (⌘K)`, `Command palette` | `KEEP` |

### D.7 `apps/desktop/src/renderer/src/shell/Sidebar.tsx`

| ID | Current | New |
|---|---|---|
| D-07.1 | Outline, no document | `Open a document to see its outline.` | `Open a note to see its outline.` |
| D-07.2 | Outline, unavailable | `Document unavailable.` | `Note unavailable.` |
| D-07.3 | Library missing actions | `Remove from Recent` | `Remove from recents` |
| D-07.4 | Library actions | `Open Folder as Library…` (×2) | `Open folder as library…` |
| D-07.5 | Library actions | `New Library…` (×2) | `New library…` |
| D-07.6 | Library actions | `Open Library…` (Settings only) | `Open library…` |
| D-07.7 | Row reason fallback | `The package could not be read.` | `This note couldn’t be read.` |
| D-07.8 | Tabs/labels | `Library`, `Outline`, `Health`, `Search`, `Explore sidebar`/`Collapse sidebar`, `Settings`, `Settings (⌘,)`, `Loading library…`, `No library open`, `Library not found`, `Locate…`, `Open another…`, `Filter library`, `No notes yet. Use + to create one.`, `No matching entries.`, `This folder is empty.`, `Open a library before creating a folder`, `New folder`, `Open a library before creating a note`, `New note (⌘N)`, `A Markdown file has no outline.`, `No blocks yet.`, `Add block`, `Add chapter`, `Document topics`, `Collapse chapter`, `Expand chapter`, `Collapse`, `Expand`, `Ambiguous anchor`, `Lost anchor`, `Anchor: “…”`, `{n} branches from “…”`, `{n} anchors`, `Shared · {n}`, `Shared: referenced by {n} block(s)`, `One anchor cannot be resolved`, `Actions for {title}` | `KEEP` |

Note: `Search` in the sidebar header is the palette button today. The find surface v2 (`docs/design/find-bar.md`)
makes `Search` the sidebar view; the provisional `No results` / `1 of 4` / `100+` / `Refine the search`
labels are **not** changed here. Alignment: v2 must keep `No results` and `1 of 4` exactly, and its
empty state must be one sentence plus one action (copy-audit rule 9).

---

## E. Not covered by this plan

| Surface | Why | Where it is tracked |
|---|---|---|
| Document health sidebar + repair modal | approved, frozen, the reference copy | `docs/design/document-health-sidebar.md` §5 |
| Find bar v2 (toolbar bar, sidebar Search, `100+`, snippets) | built in parallel; labels provisional | `docs/design/find-bar.md` §7 |
| Markdown guest-file body (frontmatter label, read-only reasons, image placeholders) | copy covered in §C.20 except the frontmatter label (`Frontmatter`, `YAML frontmatter, preserved verbatim and read-only`) which is kept | follow-up only if v2 changes the frontmatter surface |
| PDF/page chrome (page number, header/footer strings, continuation markers) | Page chrome copy is already typed and settings-driven | follow-up with the PDF visual check |
| Print compositor errors (`print/entry.tsx`) | renderer print surface, not user-facing in a window | log-only |
| Core command reasons surfaced outside menus (`packages/core`) | the menu glue is removed (D-02.1/2); other callers show the raw reason | follow-up: map at the boundary like `runtime.ts` |
| `lib/library-rows.ts`, `lib/find.ts` labels | counts only | with find v2 |
| `Document health` counts in the status bar (`orphans`, `structure`, `unused`) | labels kept, `idle` renamed only | C-05.2 |

## F. Open decisions (recommendation given, not invented)

1. **Contractions.** This plan adopts `couldn’t`/`wasn’t`/`isn’t` everywhere the string is already
   being rewritten. Recommendation: accept; it halves several error lines without changing meaning.
2. **Trash path.** Moving the absolute path into Details (A-02.8) removes the one line that proves
   *which* folder is about to go. Recommendation: keep it in Details; the name and the contained
   counts already identify it.
3. **Toast Details.** `dialogs.md` §6.1 resolves the toast cap against the Details decision with a
   one-click Details dialog. Recommendation: accept; an inline disclosure in a 3 s toast is
   unusable.
4. **Failed export short line.** A-22.14 maps the 18 export codes to 12 sentences. Recommendation: accept the
   grouping; it is the only way to keep the body at one line while the code joins Details.
5. **`Restore copy…` / `Save a copy…` / `Overwrite…` / `Restore backup…`.** Each opens a native
   picker or a confirm, so the ellipsis is correct and stays. `Restore newest backup` performs
   immediately, so it has none (C-07.4).

## G. Coverage

- **Dialogs:** 21 Frame dialogs + Export sheet + Table size + Settings + the new Details dialog,
  fully specified (title, description, body, actions, and every inline error and toast).
- **Settings:** 5 files + 2 controllers + 2 validation modules; every help/description/warning line
  either listed or explicitly kept.
- **Errors:** 19 main-process and renderer modules; every string that interpolates an error, a path,
  or an id is split into `SHORT + DETAILS`.
- **Editor:** block views, block/chapter/reference/vault menus, palette, both headers, view controls,
  sidebar; label-only surfaces are marked `KEEP` so the Builder does not hunt for changes.
- **Rows:** 451 table rows; 91 `KEEP` bundles (no change), 16 deletions, 41 splits into
  `SHORT + DETAILS`, and the rest are exact substitutions. Three rows change a surface rather than a
  string (A-13.3 table-size frame, A-25.1–2 frame header, B-07.3 preview error) and are called out
  inline.
