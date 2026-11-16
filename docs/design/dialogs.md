# Dialogs — the frame, the inventory, and Details

**Status:** design package for the app-wide copy + dialog sweep. No code in this doc.
**Date:** 16 November 2026.
**Owner:** Planner. The Orchestrator writes the Builder brief from this.
**Inputs:** `docs/design/copy-audit.md` (rules and the four confirmed decisions, §5),
`docs/design/document-health-sidebar.md` (approved modal copy — the reference, not changed here),
`docs/design/find-bar.md` (provisional labels).
**Companion:** `docs/design/copy-plan.md` (the exact old → new string table). This doc references its
row ids (`A-01`, `B-03`, `C-12`, `D-04`); it does not repeat the strings.

## 1. The frame

One frame for every modal dialog. `shell/DialogFrame.tsx` is the only implementation; a dialog that
needs a different geometry is a new variant of the frame, never a second overlay.

### 1.1 Geometry

| Surface | Width | Height |
|---|---|---|
| Frame dialog, default | 480 | content, max 70 vh |
| Frame dialog, records/lists | 560 | content, max 70 vh |
| Settings | 1180 | `min(820, calc(100vh - 132px))` |
| Health repair | 560 | content (frozen, unchanged) |
| Export sheet | 560 | content, max 80 vh |

Rules:

- 480 is the default. 560 is for a dialog whose body is a **list or a record** (delete block
  references, restore backup, link as reference, trash summary, export). A dialog may not be 560
  because its copy is long: long copy is cut, not widened.
- The 640 `wide` modifier and `nf-dialog-modal-wide` are removed. No dialog needs 640.
- Radius 8 (`--radius-overlay`), one 1 px border, one overlay shadow, body scrolls, footer never
  scrolls.
- The overlay keeps the current 48 px inset and top alignment; no vertical centring.

### 1.2 Header

Every dialog has the same header, in this order:

1. **Kicker** (optional): `nf-dialog-kicker`, 9.5 px uppercase, `text-3`. Only when the dialog is
   one instance of a family (the health issue category; the export state). Never decorative.
2. **Title**: `h2`, 14/600, sentence case, ≤ 6 words. It names the thing or asks the question
   (`Delete block`, `Move to Trash?`, `This file changed on disk`).
3. **Close X**: icon button, 28 px, `aria-label="Close"`, `title="Close (Esc)"`, right-aligned.
   **Every header has one**, including Settings, the Export sheet, Document health, and Table size.
   X is the same action as Cancel/Esc; it never confirms and never saves.
   The title is the dialog's accessible name (`aria-labelledby`), so the current `aria-label={title}`
   on `<Dialog>` is replaced by an id reference; no double label.
4. **Description** (optional): one line, `text-2`, 12 px, ≤ 560 px wide. It states the outcome, not
   the reason. Never repeats the title. Never more than one sentence unless the dialog is
   destructive (two short sentences allowed).

### 1.3 Body

- One idea. A field, a list, a record, or one sentence. Two lines maximum at 560.
- The body may be absent (rename/link/show-only dialogs have a field or nothing).
- Order: source/target identity → the decision control → Details.
- No file names, IDs, node paths, engine words, or rationale. The path belongs in Details.
- No paragraph longer than two lines anywhere. If it needs three, delete a sentence or move it to
  Details.
- The body never restates the description or the button labels (the current save prompts do this
  three times).

### 1.4 Footer

Fixed slots, left to right:

```
[ navigation ] … [ secondary ] [ primary ]
```

| Slot | Contents | Notes |
|---|---|---|
| navigation | `Show in note`, `Back` | Never destroys, never confirms. Health only, so far. |
| `…` | a `More` icon menu | Rare or destructive actions that do not fit. Text label `More` for AT. |
| secondary | `Cancel`, `Close`, `Keep…` | Plain button. The safe exit. |
| primary | the recommended action | Filled accent button, rightmost. |

Rules:

- Exactly one primary per dialog, and it is the action the dialog exists for.
- `Cancel` is always the secondary slot, always present on a question, never on a pure status
  dialog (`No note open` has `Close` only).
- The `…` menu is capped at 4 entries, no separators, and never holds the primary.
- Buttons name the action, not the widget: `Move to Trash`, not `OK`; `Reload from disk`, not
  `Yes`.
- Same action, same label everywhere (`Show in note`, `Remove mark`, `Move to chapter…`,
  `Move to Trash…`).
- Order is stable: navigation left; secondary then primary right. A dialog never reorders its
  buttons between states, except the health confirm step (frozen).

### 1.5 Danger

- Danger is **outlined**, never filled: `1 px` danger border, transparent background, danger ink;
  hover fills 12 % danger. The filled `nf-button-danger` is retired.
- A destructive action takes the primary slot but keeps the outlined danger style: the slot says
  "the main thing here", the ink says "this removes something". Both are visible at once.
- Where the destruction is recoverable (Trash), the label names the recoverable result:
  `Move to Trash`. Where it is not (overwrite, delete subtree), the description says what is lost
  in one sentence.
- Danger is never the default focus target. `Cancel` (or the field) receives focus.

### 1.6 Focus and keys

- Open: focus the first field; a destructive dialog with no field focuses `Cancel`; a status dialog
  focuses the dialog container.
- `Esc` = Cancel/Close. `X` = Cancel/Close. `Enter` submits only when the dialog has exactly one
  field and no destructive choice (rename, link, math, alt text, new folder); a dialog with radios,
  a list, or a danger primary requires the button or the menu.
- Focus returns to the trigger on close (the Export sheet and Settings already do this explicitly;
  the frame takes it over).
- Tab order: header X → body controls → footer left to right. The X is reachable but never the
  first stop.

### 1.7 The confirm pattern

The dialog **is** the confirmation when it was opened from a menu or a chip. A second confirm step
inside the dialog is only for an action that destroys a *derived* state the user cannot re-create
from the UI:

| Case | Pattern |
|---|---|
| Delete block with descendants or outside references | one dialog; the descendant radio is the decision; danger primary |
| Move to Trash | one dialog; recoverable; danger primary |
| Overwrite file on disk | one dialog; states the loss; Cancel focused |
| Reload from disk | one dialog; states the loss; danger primary |
| Reset/restore the document-settings map | inline confirm inside Settings (no modal stack) |
| Switch Page preset over custom values | inline confirm inside Settings |
| Reset Continuous settings | inline confirm inside Settings |

The inline Settings confirms keep the health-modal pattern: the question, then
`[secondary] [primary]` inside the warning block, primary first in DOM but rendered right.

### 1.8 Surfaces outside the frame

| Surface | Why not the frame | What it must adopt |
|---|---|---|
| Settings dialog | own layout (nav + pane + rail) | header X, sentence-case title, footer slots (`status` … `Done`), no description |
| Export sheet | its own 6-state sheet | header X, sentence-case title, footer slots, 560, Details in the failed state |
| Document health | frozen copy, its own layout | nothing; it is the reference |
| Table size | currently a hand-rolled overlay | **move onto `Frame`** (480): title, description, X, footer slots |
| Save-failure banner, draft banner, recovery surface, status panel | not modals | the Details component (§3), not the frame |

## 2. Dialog inventory

Every modal, with its final shape. Strings live in `docs/design/copy-plan.md`; the id in the last
column is the row to substitute. `—` means no description. `Cancel` means the secondary slot.

| # | Dialog | W | Title | Description | Body | Footer | Copy |
|---|---|---|---|---|---|---|---|
| D01 | New library | 480 | `New library` | `Create a folder for a new set of notes.` | Name, parent-folder button, chosen path (one line), inline error | `Cancel` … `Create library` | A-01 |
| D02 | Move to Trash | 560 | `Move to Trash?` / `Move folder to Trash?` / `Move file to Trash?` / `Remove from recents?` | one line per kind | name, path (Details), contained counts (folder), newer-version and live-lock lines | `Cancel` … `Move to Trash` (danger) | A-02 |
| D03 | New folder | 480 | `New folder` | `Inside {path}` | Name, inline error | `Cancel` … `Create folder` | A-03 |
| D04 | Rename folder | 480 | `Rename folder` | `{path}` | Name, inline error | `Cancel` … `Rename` | A-04 |
| D05 | Move entry | 480 | `Move “{name}”` | `Choose a folder in this library.` | radio list, empty line, inline error | `Cancel` … `Move` | A-05 |
| D06 | Close file (Markdown) | 480 | `Close file?` | `This file has unsaved changes.` | file name | `Cancel` `Don’t Save` … `Save` | A-06 |
| D07 | External change (Markdown) | 480 | `This file changed on disk` | `Another app wrote this file. Nothing has been overwritten.` | file name, the two outcomes (one line), Details(path) | `Cancel` `Reload` … `Overwrite` (danger) | A-07 |
| D08 | No note open | 480 | `No note open` | — | `Open a note first.` | `Close` | A-08 |
| D09 | Detach from parent | 480 | `Detach from parent?` | `The block becomes top-level in its chapter. Its content is kept.` | `“{block}”` | `Cancel` … `Detach from parent` | A-09 |
| D10 | Rename document / chapter / block | 480 | `Rename document` / `Rename chapter` / `Rename block` | — | Name field | `Cancel` … `Save` | A-10 |
| D11 | Link | 480 | `Link` | `Add a link to the selected text.` | URL field | `Cancel` … `Apply` | A-11 |
| D12 | Insert / Edit math | 480 | `Insert math` / `Edit math` | `LaTeX only. Nothing is loaded from the web.` | LaTeX field, Inline / Display, term hint | `Cancel` `Branch from term` … `Apply` | A-12 |
| D13 | Insert table | 480 | `Insert table` | `Pick a size. The first row is a header.` | 10 × 10 grid, size label | `Cancel` … `Insert {r} × {c}` | A-13 |
| D14 | Close tab | 480 | `Close tab?` | `This tab has unsaved changes.` | note title | `Cancel` `Don’t Save` … `Save` | A-14 |
| D15 | Reload from disk | 480 | `Reload from disk?` | `Unsaved changes in this window are discarded. The file on disk is not changed.` | note title, Details(path) | `Cancel` … `Reload from disk` (danger) | A-15 |
| D16 | Overwrite file on disk | 480 | `Overwrite file on disk?` | `This replaces the file on disk; the external changes are lost. Reload instead to keep them.` | note title, Details(path) | `Cancel` … `Overwrite` (danger) | A-16 |
| D17 | Restore backup | 560 | `Restore backup` | `Restores a copy. The current file is not changed.` | list (newest first), empty state, loading/error, inline error | `Cancel` … `Restore copy…` | A-17 |
| D18 | Link as reference | 560 | `Link as reference` | `The target keeps its place. This adds a reference link.` | source line, filter, list, empty | `Cancel` … `Link` | A-18 |
| D19 | Move block | 480 | `Move to…` | `Choose a new parent. A block can’t move inside itself.` | list (`Top level (chapter)` first) | `Cancel` … `Move` | A-19 |
| D20 | Delete block | 560 | `Delete block` | `The block and its content are removed.` | block title, descendant radios, external-reference list | `Cancel` … `Delete` (danger) | A-20 |
| D21 | Image alt text | 480 | `Image alt text` | `Describe the image. Leave it empty if it is decorative.` | one text input | `Cancel` … `Save` | A-21 |
| D22 | Export PDF | 560 | per state (6) | per state | configure / overwrite / running / done / failed / cancelled | per state | A-22 |
| D23 | Settings | 1180 | `Settings` | — | nav + page + preview rail | `Saved` … `Done` | A-23, §B |
| D24 | Document health | 560 | kicker + category | frozen | frozen | `Show in note` · `…` · `Close` · primary | none |
| D25 | Details | 480 | `Details` | — | one copyable code block | `Copy` … `Close` | A-24 |

Notes per dialog:

- **D02** is one component with four titles. The title and the primary label must agree
  (`Remove from recents?` → `Remove`; every Trash variant → `Move to Trash`).
- **D06/D14** are the same question for a guest file and a note; the description is identical, the
  body is the name only. `Don’t Save` is outlined danger, `Save` is primary.
- **D10** has no description: three fields would be three dialogs otherwise. `Rename block` keeps
  the placeholder `Optional label`.
- **D13** adopts the frame; its 10 × 10 grid stays, its own overlay and header go.
- **D17** keeps the radio list; the `Unusable: …` reason stays inline (choosing a backup needs the
  reason), the raw listing error moves to Details.
- **D20** keeps the reference list; it is the only 560 dialog with a list inside a body that also
  has a radio group.
- **D22** states are: configure, confirm-overwrite, running, done, failed, cancelled. Titles:
  `Export PDF`, `Replace existing PDF?`, `Exporting PDF…`, `PDF exported`, `Export failed`,
  `Export cancelled`.
- **D24** is unchanged by this sweep. Its header X, kicker, footer slots and three-block body are
  the source the frame generalises.
- **D25** exists only for a toast that has no persistent surface: one technical line, `Copy`, `Close`.

## 3. Details

The single place for a technical line. Confirmed decision: the short outcome stays in the
dialog/toast/banner, the technical line opens in a small disclosure and is copyable.

### 3.1 Anatomy

```
Details ⌄                     ← summary, 11.5 px, text-3, chevron
  ┌───────────────────────┐
  │ /Users/…/document.json │   ← code block, mono 11 px, text-2
  └───────────────────────┘
  Copy                        ← quiet text button, right-aligned
```

- Summary label is always `Details` (not `Technical details`, not `Show more`).
- Body: **one line of technical text** — a path, an error string, a code. No prose, no second
  paragraph, no stack trace. It wraps to two lines maximum and is horizontally clipped with the
  full value in `title`.
- `user-select: text` and a `Copy` button. `Copy` copies the value verbatim and toasts `Copied`.
- No telemetry, no “send report”, no external link.

### 3.2 Content rules

- Only information the user cannot re-derive: absolute path, OS error text, produced/expected page
  count, the raw reason a command was rejected.
- Never an engine word from the banned list; if the raw message contains one, it is rewritten
  before it reaches Details (the raw string may still be logged).
- Not for reassurance, not for the next step, not for anything already said once.

### 3.3 Interaction and ARIA

- Native `<details>`/`<summary>`; `summary` is the accessible name, so no extra `aria-expanded`
  plumbing and no button role.
- Closed by default; state is not persisted; opening it does not move focus.
- `Copy` is reachable by Tab only when open; it is not inside the summary.
- The code block has `role="group"` and `aria-label="Technical details"` so a screen reader can
  leave the disclosure predictably.
- In a toast, Details is not a disclosure (a toast is one line). The toast carries one optional
  `Details` action that opens D25.

### 3.4 Hosts

| Host | Placement | Today |
|---|---|---|
| Dialog | last element of the body, above the footer | new (D07, D15, D16, D17) |
| Banner / status panel | after the body copy, before the actions | Save-failure banner, Document status panel |
| Recovery surface | already `Validation details` / `Warnings`; the `Reason` row stays because it explains why the file cannot open | RecoverySurface |
| Toast | no disclosure; optional `Details` action → D25 | new |

Only one Details per surface. If a surface has two technical values, join them with ` · `.

### 3.5 Data path

Failure envelopes gain an optional `details?: string`:

```ts
interface SomeFailure {
  ok: false;
  message: string;    // short outcome, safe for a dialog title line
  details?: string;   // technical line, shown only in Details
}
```

Envelopes to extend (additive, no schema version bump — these are IPC types):
`LibraryActionFailure`, `VaultActionFailure`, `DocumentSettingsRecoveryFailure`,
`CreateDocumentFailure`, `OpenDocumentFailure`, `TakeOverLockResult` failure, `ApplyResult`
(`code` already exists), `SaveCopyFailure`, `ReloadDocumentFailure`, `RestoreBackupFailure`,
`RevealResult`, `ImportImageFailure`, `TrashDocumentResult` failure, the draft-materialize failure,
`MarkdownSaveFailure`. `ExportJobErrorView` already carries `details: ExportWarning[]`.

Rule: where a message today interpolates `errorMessage(error)`, `err.message`, or a path, the
message loses the interpolation and the same value goes to `details`. The renderer never composes a
technical sentence.

## 4. Copy boundary

- This doc fixes the **shape**: what each surface says and where.
- `docs/design/copy-plan.md` fixes the **strings**: every changed line, with its file and row id.
- Banned words (confirmed): paginator, PageTheme, packing, trunk, lane, callout mode, heartbeat,
  binding, command layer, schema, JSON, ID, node path, app support.
- Allowed technical words *inside Details only*: PID, host, session, lock, `document.json`,
  `settings.json`, mm, pt, px.
- Vocabulary: **note** = what the user writes (drafts, open content); **document** = only in
  `Document health`, `Document settings`, `Rename document`, and the file-name sentence;
  **entry** = a library row that may be a folder, a note, or a Markdown file.

## 5. Tests to update

| Test | Change |
|---|---|
| `apps/desktop/test/read-mode-gating.test.ts` | the three `READ_MODE_*` exact strings (C-01) |
| `apps/desktop/test/save-failure.test.ts` | add an assertion for the new `overwriteConfirmation.description` and `confirmLabel` (C-02) |
| new `apps/desktop/test/dialog-copy.test.ts` | banned-word guard over the copy-bearing modules (audit §6): `lib/save-failure.ts`, `lib/recovery.ts`, `lib/editability.ts`, `export/export-flow.ts`, `shell/StatusBar.tsx`, `shell/DialogFrame.tsx`, the `exportShortMessage` map. Empty allowlist. Fails on a banned token inside a string literal. |
| new `tests/ui/ui-dialog-frame.test.mjs` (+ `tests/ui/suites.mjs` + `ui-suite-list.test.ts`) | for each Frame dialog: exactly one `h2`, a header X with `aria-label="Close"`, description height ≤ one line, footer order, `Cancel` focused on the danger dialogs (D02, D15, D16), 480 or 560 width |
| `tests/ui/v0-shell-frame.test.mjs` | the rename dialog still asserts `Rename document`; add the X close and the `Cancel` focus assertions |
| `tests/ui/markdown-file-view.test.mjs` | keep `/changed on disk/`; add the new body line and the Details path |
| `tests/ui/document-lifecycle.test.mjs` | trash titles/descriptions and the `Remove` label for the missing variant |
| `tests/ui/ui-editor-shortcuts.test.mjs` | unaffected (row labels unchanged; only the page-navigation value changes) |
| Screenshots | one per Frame dialog state (480/560), the four Settings pages, the Export failed state, the save-failure banner with Details open |

No test may assert a whole paragraph; assert the short line and the presence of the Details summary.
A copy change without a matching assertion is a review finding.

## 6. Open questions

1. **Toast and Details.** `copy-audit.md` §5 says the technical line goes to `Details`; §2 rule 10
   caps a toast at one line. This doc resolves it as: toast = outcome, optional `Details` action
   opens D25. Confirm that a one-click dialog is acceptable instead of an inline disclosure.
   Recommendation: yes; an inline disclosure inside a 3-second toast is unreadable.
2. **`…` menu in Frame dialogs.** Health has one; no other dialog needs one today. The frame ships
   the slot but no dialog uses it. Recommendation: keep the slot in the spec, do not ship dead UI
   until a dialog needs it.
3. **Menu case.** The native menu is Title Case (`New Document`, `Fit Width`). Rule 11 says sentence
   case. Recommendation: sentence case everywhere, including the macOS menu, for one voice.
4. **`document` vs `note`.** Settled by `ui-shell-contents.md` S1-10 (note in the UI, document for
   file/library concepts) plus the frozen health copy that keeps `Document health`. This doc follows
   that split; if the product owner wants one noun, it is a separate sweep.
