# UI contents — phase 2, slice 4 (Export sheet)

**Status:** First draft. Contents, states, and behavior; not visual design and not code.
**Date:** 10 November 2026.
**Branch:** `design/ui-map`.
**Inputs:** `docs/design/ui-shell-map.md` (D-01…D-13), `docs/design/ui-settings-contents.md`
(slice 3), `research/ui-surface-map.md` (as-is export), `docs/adr/0002-pdf-pipeline.md`,
`docs/reviews/m4c2-export-orchestration-review.md`, `docs/reviews/m4c3*`.
**Scope:** the Export PDF flow: entry, configure, overwrite, progress, cancel, result, errors,
warnings. PDF rendering/layout is unchanged; the export uses the same Page model and print
compositor.

---

## 0. Principles

- **One flow.** File → Export PDF… (`⇧⌘E`), the palette, and the PageToolbar Export button all open
  the same sheet. One export job at a time.
- **No native save dialog.** Folder choice uses the native folder picker; filename, overwrite, and
  options are in the sheet. This removes the current native-dialog + app-panel double prompt.
- **The export is the Page layout.** From Continuous, the sheet says so; the PDF is always the Page
  layout, with the resolved page settings.
- **No silent defaults.** The sheet shows what will be exported (size, orientation, margins,
  density) and where.
- **Warnings are never truncated.** All warnings are shown, grouped and expandable.
- **Text-real PDF.** No re-pagination in the sheet; the job pipeline is unchanged.

---

## 1. Entry and preconditions

| Entry | Behavior |
|---|---|
| File → Export PDF… (`⇧⌘E`) | Opens the sheet for the active document |
| Command palette | Same; searchable as “Export PDF…” |
| PageToolbar Export | Same; only in Page |
| No document | Entry disabled with a reason; `⇧⌘E` does nothing or shows “Open a document to export” |
| Read-only document | Allowed; export does not mutate content |
| Page Edit open | Commit the overlay before the snapshot; if the commit fails, block export and show the error |
| Page model loading/updating | Wait for the model or disable Export with “Preparing pages…” |
| Another export running | Focus the existing sheet; do not start a second job |
| Continuous layout | Allowed; the sheet states “Page layout will be exported” |

---

## 2. Sheet structure

A modal sheet, 560 px wide (full width on narrow windows), max 80vh, centered. Header, scrollable
body, sticky footer. One surface for every state; no separate floating panel.

```text
┌──────────────────────────────────────────────────────────────┐
│ Export PDF                                             [×]   │
├──────────────────────────────────────────────────────────────┤
│ Destination                                                  │
│  ~/Documents/Exports                        [ Choose… ]      │
│  File name  [ Note title.pdf            ]   [ ] Add date     │
│                                                              │
│ What will be exported                                        │
│  Page layout · A4 landscape · 12 mm · 100%                   │
│  12 pages · whole document                                   │
│                                                              │
│ ▸ Metadata                                                   │
│ ▸ Accessibility                                              │
│ ▸ Page range                                                 │
│                                                              │
│ Preflight runs automatically when you export.                │
├──────────────────────────────────────────────────────────────┤
│ Cancel                                              Export   │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Configure state

### 3.1 Destination

| Element | Control | Behavior |
|---|---|---|
| Folder | Read-only path + **Choose…** | Native folder picker (directories only); last used folder, fallback `~/Documents` |
| File name | Text field | Default sanitized `<title>.pdf`; `.pdf` fixed; empty → `Untitled.pdf`; no path separators; inline validation |
| Add date | Checkbox | Off by default; on → `<title> — YYYY-MM-DD.pdf`; the Settings > Export default can change it later |
| Destination preview | Text | Full path; updates with folder/filename |

- The folder picker never confirms overwrite; overwrite is an in-sheet decision (§4).
- The last-used folder is remembered for the session/app; per-document default is a Settings
  decision (S3-11/E-02).

### 3.2 What will be exported

A read-only summary from the resolved settings and the current page model:

- Layout: “Page layout” (even from Continuous).
- Page size/orientation/margins: “A4 landscape · 12 mm”.
- Density: “100%”.
- Page count: from the paginator; “12 pages”.
- Range: “whole document” (v1).
- Maybe document title; no thumbnail in the sheet (the Page view is the preview).

If the page model is stale or updating, show “Updating pages…” and disable Export until stable.

### 3.3 Advanced options

| Group | Control | Status |
|---|---|---|
| **Metadata** | Title (default document title), Subject (empty), Creator (NoteForest) | **Future**; current PDF sets none; needs print-model fields |
| **Accessibility** | Tagged PDF toggle (default off) | **Future**; PDF gate |
| **Page range** | Whole document / selection / current page | **Future**; v1 is whole document |

Future rows appear only when implemented; no disabled “coming soon” controls.

### 3.4 Footer

- **Cancel**: closes, no export.
- **Export**: primary; disabled if filename invalid, the page model is not ready, or a job is
  running. Enter triggers; `⇧⌘E` opens the sheet.
- **Preflight note:** “Preflight runs automatically when you export.” No separate preflight screen.

---

## 4. Overwrite state

When the chosen path exists:

```text
Replace existing PDF?
A file already exists at: ~/Documents/Exports/Note title.pdf
Replacing it cannot be undone.

[ Cancel ]                                   [ Replace PDF ]
```

- **Only one overwrite prompt**, in the sheet. The native save dialog is not used.
- Replace continues with the engine's overwrite path; Cancel returns to Configure with the path
  intact.
- The destructive button is explicit; Cancel is focused by default.
- If the path disappears between check and write, the job fails with a clear error; no silent
  overwrite of a different file.

---

## 5. Progress state

```text
Exporting PDF…
Preparing… / Reading the document… / Building pages… / Printing… / Checking the PDF… / Writing…
[██████████████░░░░░░]  62%
~/Documents/Exports/Note title.pdf
[ Cancel ]
```

- Phase label + percent (when available); no fake progress.
- Output path shown.
- **Cancel** cancels the job; partial temp files are removed; the sheet moves to Cancelled.
- The sheet stays open; closing/`Esc` while running offers Cancel.
- No background/minimized export in v1; one job at a time.

---

## 6. Result states

### 6.1 Done

```text
PDF exported
12 pages · ~/Documents/Exports/Note title.pdf

Warnings (2)
▸ Manual break before “Chapter 3” could not be honored
▸ Image asset missing in “Cell diagram”

[ Reveal in Finder ]                    [ Open PDF ]   [ Done ]
```

- Page count from the produced PDF, path, file size optional.
- **All warnings**, grouped and expandable; no 6-item truncation. Each warning names the block
  when available.
- Primary action: **Open PDF** (`shell.openPath`); secondary **Reveal in Finder**; **Done** closes.
- No success toast duplicating the sheet; the sheet is the confirmation.

### 6.2 Failed

```text
Export failed
<human message>
Error: <typed code>
Affected: “Chapter 3”, block “Cell diagram”

Warnings (2)
▸ …

[ Close ]                                            [ Retry ]
```

- Human message first; typed code in details.
- Preflight failures name affected blocks; no generic “export failed” only.
- **Retry** returns to Configure with the same path/options; **Close** dismisses.
- The produced partial file is removed; the existing target file is untouched.

### 6.3 Cancelled

“Export cancelled. No file was written.” + **Retry** / **Close**.

---

## 7. Warnings and preflight

- Preflight runs automatically on Export; blocking issues fail before writing.
- Warning sources: manual breaks, anchors, assets, frames, images, fonts, console.
- All warnings are shown in the result; no truncation.
- Warnings are grouped by source and expandable; block names/titles when available.
- A warning does not silently downgrade the PDF; the produced file is validated (page count, size,
  text) as today.
- Future: clicking a warning focuses the block in the editor; not in this slice.

---

## 8. Behavior and data

- Export always uses the resolved Page settings (global + per-document override) and the same print
  model as Page Read; no separate export preview re-paginates.
- From Continuous, the sheet says “Page layout will be exported”; from Page, the current page
  settings are shown.
- Read-only documents may export; Page Edit is unavailable.
- Page Edit open: commit first; failure blocks export.
- The export job is serialized; no concurrent exports.
- The sheet does not change document content; options are not persisted unless they become Settings
  defaults (future `export` namespace).
- File writes remain atomic: temp → inspect → rename; cancel/failure cleanup.

---

## 9. Settings > Export (cross-link)

| Setting | Store | Status |
|---|---|---|
| Default folder | `export.folder` (future) | **DES**; sheet remembers last used for now |
| Filename/date default | `export.filenamePattern` (future) | **DES** |
| Metadata defaults | `export.metadata` (future) | **DES** |
| Tagged PDF default | `export.tagged` (future) | **DES**; PDF gate |
| Page range default | `export.range` (future) | **DES**; v1 whole document |

The sheet reads these defaults when they exist; today it uses the document title and the last-used
folder.

---

## 10. Errors, edge cases, and safeguards

| Case | Behavior |
|---|---|
| Filename empty/only spaces | Normalize to `Untitled.pdf`; show the normalized name |
| Filename with `/` or `:` | Sanitize; show the sanitized name |
| Existing file | In-sheet overwrite confirm; one prompt |
| File disappears between check and write | Fail with a clear error; do not overwrite a different file |
| No write permission | Fail with the OS message; Retry after choosing another folder |
| Page model updating | Wait/disable with “Updating pages…” |
| Preflight blocking defect | Fail before writing; name the block; Retry |
| Font/image asset failure | Fail or warn per the existing print policy; no silent substitution |
| Cancel during print/write | Cancel job; remove temp; no partial final file |
| App quit during export | Existing job lifecycle handles cancel/cleanup; no new behavior |
| Very large export | Progress phases; Cancel; no modal size change |

---

## 11. Accessibility and keyboard

- `role=dialog`, `aria-modal=true`, labelled “Export PDF”; focus trap; Escape closes/cancels with
  the state rules.
- Folder/name fields labelled; errors `aria-describedby`; overwrite destructive button explicit.
- Progress: `role=progressbar` with min/max/now; live region for phase changes.
- Result: `role=status`/`role=alert`; warnings are a list with expandable groups.
- Keyboard: `⇧⌘E` opens; Enter exports; Escape cancels/closes; focus returns to the trigger.
- No native save dialog; the folder picker is the only native surface.

---

## 12. Responsive

| Width | Behavior |
|---|---|
| ≥600 px | Sheet 560 px centered |
| <600 px | Full-width sheet; fields stack; footer sticky |
| Height <600 px | Body scrolls; header/footer stay |

---

## 13. Open choices

| ID | Choice | Options | Proposal |
|---|---|---|---|
| E-01 | Surface | Modal sheet; non-modal panel | Modal sheet for configure/progress/result |
| E-02 | Default folder | Last used; Documents; Downloads; per document | Last used for the session; fallback `~/Documents` |
| E-03 | Filename/date | `<title>.pdf`; `<title> — date.pdf` | `<title>.pdf`; Add date off by default |
| E-04 | Metadata | None; title/subject/creator | Title = document title, creator = NoteForest; future |
| E-05 | Tagged PDF | Now; later | Later; PDF gate |
| E-06 | Page range | Whole document; current page; selection | Whole document in v1 |
| E-07 | Done actions | Open PDF; Reveal; both | Open PDF primary, Reveal secondary |
| E-08 | Preflight display | Pre-export summary; result only | Result only; blocking failures before writing |
| E-09 | Overwrite | In-sheet; native dialog | In-sheet only; one prompt |
| E-10 | Cancel cleanup | Keep temp; remove temp | Remove temp; no partial final file |
| E-11 | Concurrent exports | One; multiple | One at a time |
| E-12 | Export from Continuous | Allow; require Page first | Allow; sheet states Page layout |
| E-13 | Warnings | Truncate; show all | Show all, grouped/expandable |
| E-14 | Settings defaults | Now; later | Later; `export` namespace decision |

---

## 14. Next slice

**Overlays and keyboard:** done in `docs/design/ui-overlays-keyboard.md` (palette, dialogs, context
menus, toasts, shortcut table, responsive rules, state matrix). Next: the A/B lab (TopBar words vs
symbols, Page Setup entry) and the settings placement matrix.
