# Copy audit — the app's user-facing text

**Status:** analysis for the copy + dialog sweep. No code.
**Date:** 15 November 2026.
**Scope:** every visible string in the renderer and the main-process messages that surface in
dialogs, toasts and banners. Code comments, log-only lines and test fixtures are out.
**Method:** extracted candidate copy (JSX prose, dialog descriptions, settings help, toast/message
strings) and reviewed it by surface. The extraction found **354 candidate strings**; the densest
surfaces are `main/library.ts` (103), `state/runtime.ts` (44), `main/index.ts` (38),
`shell/Dialogs.tsx` (34), `main/export-preflight.ts` (24), `shell/SettingsDialog.tsx` (19) and the
settings components (15). Health was already simplified in S2.1 and is the reference.

## 1. What is wrong

Seven patterns, all visible to a user:

1. **Engine words.** “packing, callout modes, trunk insets, lane gate”, “paginator”, “PageTheme”,
   “command layer”, “heartbeat”, “binding”.
2. **File and format internals.** `document-settings.json`, `settings.json`, `app support`, node
   paths, anchor/branch IDs, page metrics in mm.
3. **Rationale instead of outcome.** “so a second binding can never appear”, “there is no page-1
   exception”, “never changes note content”, “is refused by the command layer”.
4. **Triple explanations.** A dialog with a description, a body and a note that repeat the same
   consequence (save prompts, restore backup, overwrite).
5. **Formulas in help.** “Canvas max is at least the top-level max + child max + sibling gap + the px
   edge corridor…”, “The content area must keep at least 20 mm on each axis”.
6. **Diagnostics in errors.** “The print window type metrics do not match the resolved PageTheme
   (font 16px vs expected 15.5px, line ratio …)”, “The paginator produced an empty page 3 (no
   fragments, edges, trunks…)”.
7. **Defensive/legal tone.** “Taking over is not allowed while its heartbeat is current”, “This is a
   document, not a library”.

The effect is what the product owner reported: text that is useless, too long, or too detailed, and
that makes every dialog feel like a different app.

## 2. Rules

1. **One idea per sentence.** A dialog body is one sentence; two only for a destructive consequence.
2. **Title, outcome, buttons.** The title says what this is, the body says what happens, the buttons
   say what to do. Never repeat the title in the body.
3. **Ban engine words.** No paginator, PageTheme, packing, trunk, lane, callout mode, heartbeat,
   binding, command layer, schema, JSON, IDs, node paths, app support. File paths only when the user
   must find the file.
4. **Errors: outcome + next step.** Technical detail goes behind a “Details” disclosure or to the
   log, never in the toast.
5. **Help is one line and says the benefit**, not the implementation. If it needs a formula, delete
   it.
6. **No rationale** (“so that…”, “never…”, “because…”) unless it prevents a destructive mistake.
7. **Same action, same label** everywhere: `Show in note`, `Remove mark`, `Move to chapter…`.
8. **Describe the result, not the code**: “Another window is writing this note”, not “the lock is
   live”.
9. **Empty states**: one sentence + one action.
10. **Length**: dialog body ≤ 2 lines at 560 px; settings help ≤ 1 line at the control width; toast
    ≤ 1 line. No paragraph longer than two lines anywhere.
11. **No shout**: sentence case; severity words are words, not codes.
12. **No concatenated grammar**: never build a sentence by gluing a variable with punctuation.

## 3. Worst offenders (excerpts, real strings)

| Surface | Today | Why | Proposal |
|---|---|---|---|
| Dialogs · Markdown conflict | “Reload replaces the editor with the version on disk. Overwrite writes the editor content and keeps one previous copy in app support (never in your library).” | Implementation + a parenthesis | “Reload discards your edits. Overwrite keeps a backup of the version on disk.” |
| Dialogs · link reference | “Link an existing block without changing its primary home, outline position, or layout. Reference links may form cycles.” | Model explanation | “The target keeps its place. This adds a reference link.” |
| Settings · Page | “Page font, manual breaks, and engine values (packing, callout modes, trunk insets, lane gate) are not available in Settings.” | Enumerates internals | Delete. |
| Settings · Continuous | “Canvas max is at least the top-level max + child max + sibling gap + the px edge corridor: px at the current values. Below that, the canvas cap is raised automatically.” | Formula | “The canvas widens automatically to fit the cards.” |
| Settings · Appearance | “UI text size and UI font change the app chrome only (tabs, sidebar, toolbar, menus, Settings, palette); Page and PDF body size do not change. The code font is the only appearance value that reaches Page code and the exported PDF.” | Three clauses | “Affects the app only, not Page or PDF. Code font applies to code everywhere.” |
| Settings · Page | “Per-document page overrides live in document-settings.json. Resetting or restoring this map never changes note content.” | File name + map | “Page settings are stored per document. Resetting them never changes the note.” |
| Settings · Page chrome | “Header and footer text come from the document and chapter titles; there is no free text, no page-1 exception, and the page number always sits at the bottom center.” | Rationale | “The header and footer use the document and chapter titles. The page number stays centered.” |
| Settings · Continuous preview | “Sample tree: one top-level note, two direct children, and one callout. Card widths follow the caps; spacing and arrows match the canvas exactly.” | Describes the mock | Delete, or “Preview”. |
| Settings · Export | “The document title is the file name, sanitized for the file system. No date or filename pattern is added. The name can still be edited for a single export in the Export sheet.” | Three sentences | “The file is named after the note. You can rename it when exporting.” |
| Settings · Export folder | “New exports start in <folder>. Choose a folder for one export in the Export sheet without changing this default.” | Long | “New exports go here. You can pick another folder when exporting.” |
| Settings · Density | “Global Page density is 100%. A document with its own density override keeps that value. 60–70% is the densest range; 80% and above keeps larger type.” | Three facts | “Density for new documents. 60–70% is the densest; 80% and up keeps larger type.” |
| Settings · Card width | “120–2000 px. The 240–560 px preset band follows the density lens; a custom cap outside it keeps its own scaling. Page cards and images use the same cap.” | Engine | “Card width limit. It follows density; images use the same limit.” |
| Settings · Margins | “0–100 mm per side. The content area must keep at least 20 mm on each axis.” | Formula-ish | “Up to 100 mm. The content needs at least 20 mm.” |
| Error · export | “The print window type metrics do not match the resolved PageTheme (font 16px vs expected 15.5px, line ratio …).” | Diagnostics | “The PDF couldn’t be prepared. Try again.” + Details |
| Error · export | “The paginator produced an empty page 3 (no fragments, edges, trunks, or images); a blank page is an export failure.” | Internals | “Page 3 came out blank, so the export was stopped.” + Details |
| Error · library | “The library this note was created in is not available: <path>. Reconnect it or choose another library, then retry.” | Path + instruction chain | “The note’s library is offline. Reconnect it or choose another library.” |
| Error · lock | “The lock is live: another NoteForest session is writing this document. Taking over is not allowed while its heartbeat is current.” | Internals | “Another window is writing this note. Close it there to edit here.” |
| Recovery | “NoteForest has no backup for this document yet. The original folder is unchanged; restore it from another copy or a filesystem backup.” | Two sentences | “No backup yet. Restore the note from another copy.” |
| Recovery · settings | “settings.json is corrupt and was not overwritten: <error>. Use Reset settings to replace it with the product defaults.” | File + rationale | “Settings couldn’t be read. Reset them to the defaults.” + Details |
| Error · trash | “Could not move “X” to the Trash: <error>. The folder was not changed.” | Error glued in | “Couldn’t move “X” to the Trash. Nothing was changed.” + Details |
| Editor · anchor selection | “Select text / a formula / a code range in the anchor’s block.” | Three variants glued | “Select the text first.” (context-aware) |
| Editor · reason | “The anchor is bound to a different content kind.” | Internal | “The content changed too much.” |

## 4. Surfaces and batch order

| # | Surface | Volume | Risk | Batch |
|---|---|---|---|---|
| 1 | Dialogs (titles, descriptions, notes, buttons) | 34 strings, 20 dialogs | High, most visible | **A** with the modal frame (`dialogs.md`) |
| 2 | Settings help and notes | 34 strings | High, dense | **B** |
| 3 | Errors, toasts, banners, recovery (main + renderer) | ~200 message strings | Medium, trust | **C**, with a “Details” disclosure |
| 4 | Editor labels, menus, tooltips, empty states | ~60 strings | Medium | **D** |
| 5 | Command palette and library empty states | ~20 strings | Low | **D** |

Batches A and B can ship together (design + copy). C needs the Details pattern first (a small
component). D is the tail.

## 5. Decisions (confirmed 16 November 2026)

- **Technical details behind “Details”**: the short outcome stays in the dialog/toast; the technical
  line opens in a small `Details` disclosure and is copyable. No telemetry.
- **Settings stops explaining what it does not contain**: those lines are deleted; a disabled
  control says why in one line.
- **Tone**: concise and neutral, no first person, product words (`anchor`, `branch`, `note`, `page`,
  `block`, `chapter`) kept, engine words banned.
- **Length caps**: dialog body ≤ 2 lines at 560 px, help ≤ 1 line, toast ≤ 1 line, no paragraph over
  two lines.

## 6. Tests

- The sweep updates the strings in the existing UI suites; a dialog body or help line that changes
  gets a matching assertion.
- A lightweight guard scans the copy modules for the banned words (paginator, PageTheme, packing,
  trunk, lane, callout mode, heartbeat, binding, command layer, schema, node path) and fails the
  build; the allowlist is empty by design.
- Screenshots for the main dialogs and the Settings pages after the sweep.
