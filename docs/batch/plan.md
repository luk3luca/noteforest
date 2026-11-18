# Plan — Application command surface (architecture survey, candidate 1)

**Owner:** Planner. **Date:** 18 November 2026. **Baseline:** shipped 0.1.0, code frozen, no batch in
flight. **Source of the candidate:** `docs/architecture/survey-2026-11.md`, candidate 1.

**Scope.** Application commands only: the commands a user reaches from the native menu, the command
palette, or a global chord. Context menus (block, tab, library, image), dynamic menu content (recent
files, tab list) and macOS standard menu roles are out of scope.

**Method.** Read-only walk of `apps/desktop/src/shared/api.ts`, `main/menu-template.ts`,
`renderer/src/actions.ts`, `renderer/src/App.tsx`, `renderer/src/lib/shortcuts.ts`,
`renderer/src/shell/CommandPalette.tsx`, `renderer/src/lib/editability.ts`, `state/shell.ts`, the
unit tests (`shortcuts.test.ts`, `copy-cd.test.ts`) and the UI suites that pin the surfaces
(`m4b1a2-read-mode-gating`, `ui-editor-shortcuts`, `ui-overlay-command-gate`, `m4b1-page-view`,
`markdown-file-view`). No build or suite was run: the counts and line sizes below are from reading.
Vocabulary: `codebase-design` (module, interface, depth, seam, adapter, leverage, locality).
Domain terms: `docs/spec.md` §2. No ADR is re-litigated; the survey already established that
candidate 1 needs none.

**One correction to the proposal, up front.** The proposal says "native-owned: the renderer ignores
the key". That would delete the path the UI suites press (Playwright key events reach the renderer,
not the macOS menu) and would reintroduce a silent keyboard path. The shipped app already proves
the opposite pattern: eleven renderer-owned items (`⌘Z`, `⇧⌘Z`, `⌘K`, `⌘F`, `⌘G`, `⇧⌘G`, `⇧⌘0`,
`⇧⌘F`, `⌘0`, `⌘+`, `⌘−`) display their accelerator with `registerAccelerator: false` and work
through the renderer. This plan extends that proven pattern to **every** app chord instead of
removing the renderer path, and only then deletes the 120 ms window.

---

## 1. Goal

Give every application command one declaration — label, placement, chord, and availability with a
reason — so the native menu, the command palette, the global key router and the refusal copy derive
from it, and one keypress has exactly one delivery path.

---

## 2. The command inventory

**The four listings today.** `menu-template.ts` (242 lines, 24 app items), the `runMenuCommand`
switch (95 lines, 26 ids), the keydown chain in `App.tsx` (238 lines, 31 of the 33 global app
chords; `⌘O` and `⇧⌘O` are native-only) and `paletteCommands` (219 lines, 24 app rows + 12 block
rows) encode the same commands independently. The 120 ms map and the `SINGLE_PATH_COMMANDS` set are
the reconciliation layer. Availability is re-expressed three times: the palette's `gate` /
`withDocument` closures, the hand-written key branches (`link-reference`, find, page), and the
runners' `blockedByReadMode` / guest checks.

### 2.1 How to read the tables

- **Sites today**: `M` native menu, `P` palette (`n` note context, `g` Markdown guest context),
  `K` global chord, `S` Settings shortcut list, `W` the IPC wire id exists. `—` = not present.
- **Owner today**: `native` = the menu item registers its accelerator; `renderer` = the menu item
  displays it with `registerAccelerator: false` and the app keydown handler owns it; `—` = no chord.
- **Target**: every app chord is `renderer`-owned; the menu displays the chord from the chord
  catalogue and registers no application accelerator (the standard menu roles keep theirs). Menu
  positions are `Section order` and are relative inside a section; the builder may choose different
  gaps as long as the pinned sequence in §6.1 holds.
- **Group** is the subsection heading. It orders the documentation and the inventory; the palette
  itself still renders one `Commands` group.
- Labels are **verbatim** from the shipped surfaces, including ellipses and `Close Window`'s capital
  W. No label changes except the flagged read-mode reason in §3.4.
- `MenuCommand` is the closed IPC contract (26 ids). The manifest covers it exactly and adds the
  palette-only and chord-only commands; the wire ids stay the subset that crosses the bridge.

### 2.2 File group

| id | wire | sites today | labels today (menu / palette) | target label (menu / palette) | shortcutId · chord | owner today → target | menu target |
|---|---|---|---|---|---|---|---|
| `new-document` | `new-document` | M File, P n, K, S `New note` | `New note` / `New note` | same | `new-note` · `⌘N` | native → renderer | File 10 |
| `open-document` | `open-document` | M File, K, S `Open note…` | `Open note…` / — (the palette's Documents group covers opening by title) | same | `open-note` · `⌘O` | native → renderer | File 20 |
| `open-markdown` | `open-markdown` | M File, P n+g, K (native only: no renderer branch), S not listed | `Open Markdown…` / `Open Markdown…` | same | `open-markdown` · `⇧⌘O` | native → renderer | File 30 |
| `save` | `save` | M File, P n (not g), K, S `Save` | `Save` / `Save` | same | `save` · `⌘S` | native → renderer | File 50 |
| `close-tab` | `close-tab` | M File, P n+g, K, S `Close tab` | `Close tab` / `Close tab` | same | `close-tab` · `⌘W` | native → renderer | File 70 |
| `close-window` | `close-window` | M File (click closes the window directly, no IPC), K (calls `window.close()`), S not listed | `Close Window` / — | same | `close-window` · `⇧⌘W` | native → renderer (window action) | File 90 |
| `reopen-tab` | `reopen-tab` | M File, K, S `Reopen closed tab` | `Reopen closed tab` / — | same | `reopen-tab` · `⇧⌘T` | native → renderer | File 80 |
| `new-chapter` | `new-chapter` | M File, P n, K, S `New chapter` | `New chapter` / `New chapter` | same | `new-chapter` · `⇧⌘N` | native → renderer | File 40 |
| `add-block` | `add-block` | P n, W (no production sender; the read-mode UI test sends it), no M/K/S | — / `Add top-level block` | — / same | — | — | — |
| `export-pdf` | `export-pdf` | M File (`menu-export-pdf`), P n (not g), K, S `Export PDF…` | `Export PDF…` / `Export PDF…` | same | `export-pdf` · `⌘P` | native → renderer | File 60 |
| `rename-document` | — | P n only | — / `Rename document…` | — / same | — | — | — |
| `reveal` | — | P n `Reveal document in Finder`, P g `Reveal Markdown file in Finder` | — / contextual | — / contextual (same two strings) | — | — | — |

### 2.3 Edit group

| id | wire | sites today | labels today (menu / palette) | target label (menu / palette) | shortcutId · chord | owner today → target | menu target |
|---|---|---|---|---|---|---|---|
| `undo` | `undo` | M Edit (`menu-undo`), P n, K, S `Undo / Redo` | `Undo` / `Undo` | same | `undo` · `⌘Z` | renderer → renderer | Edit 10 |
| `redo` | `redo` | M Edit (`menu-redo`), P n, K, S `Undo / Redo` | `Redo` / `Redo` | same | `redo` · `⇧⌘Z` | renderer → renderer | Edit 20 |
| `find-open` | `find-open` | M Edit (`menu-find`), K, S `Find in note`, no P | `Find…` / — | same | `find` · `⌘F` | renderer → renderer | Edit 40 |
| `find-next` | `find-next` | M Edit (`menu-find-next`), K, S `Next / previous match`, no P | `Find Next` / — | same | `find-next` · `⌘G` | renderer → renderer | Edit 50 |
| `find-previous` | `find-previous` | M Edit (`menu-find-previous`), K, S `Next / previous match`, no P | `Find Previous` / — | same | `find-previous` · `⇧⌘G` | renderer → renderer | Edit 60 |
| `link-reference` | — | P n, K (hand-gated in the keydown chain), S `Link as reference`, no M | — / `Link as reference…` | — / same | `link-reference` · `⇧⌘L` | renderer → renderer | — |

### 2.4 View group

| id | wire | sites today | labels today (menu / palette) | target label (menu / palette) | shortcutId · chord | owner today → target | menu target |
|---|---|---|---|---|---|---|---|
| `command-palette` | `command-palette` | M View, K, S `Command palette`, no P (it is the surface) | `Command palette…` / — | same | `command-palette` · `⌘K` | renderer → renderer | View 10 |
| `toggle-sidebar` | `toggle-sidebar` | M View, P n+g, K, S `Toggle sidebar` | `Toggle sidebar` / `Toggle sidebar` | same | `toggle-sidebar` · `⌘\` | native → renderer | View 20 |
| `zoom-in` | `zoom-in` | M View, P n, K, S `Zoom in / out` | `Zoom in` / `Zoom in` | same | `zoom-in` · `⌘+` | renderer → renderer | View 80 |
| `zoom-out` | `zoom-out` | M View, P n, K, S `Zoom in / out` | `Zoom out` / `Zoom out` | same | `zoom-out` · `⌘−` | renderer → renderer | View 90 |
| `zoom-reset` | `zoom-reset` | M View, P n, K, S `Reset zoom` | `Reset zoom` / `Reset zoom` | same | `reset-zoom` · `⌘0` | renderer → renderer | View 70 |
| `fit-width` | `fit-width` | M View, P n, K, S not listed | `Fit width` / `Fit width` | same | `fit-width` · `⇧⌘0` | renderer → renderer | View 40 |
| `fit-page` | `fit-page` | M View (`menu-fit-page`, no accelerator), P n, S not listed | `Fit page` / `Fit page` | same | `fit-page` · no chord | — | View 50 |
| `focus-branch` | `focus-branch` | M View, P n, K, S `Focus branch` | `Focus branch` / `Focus branch` | same | `focus-branch` · `⇧⌘F` | renderer → renderer | View 60 |
| `continuous-layout` | — | P n, K, S `Continuous / Page`, no M | — / `Switch to Continuous` | — / same | `continuous-layout` · `⌘2` | renderer → renderer | — |
| `page-layout` | — | P n, K, S `Continuous / Page`, no M | — / `Switch to Page` | — / same | `page-layout` · `⌘3` | renderer → renderer | — |
| `toggle-interaction-mode` | — | P n+g, K, S `Edit / Read`, no M | — / `Switch to Read mode` / `Switch to Edit mode` | — / same contextual pair | `toggle-mode` · `⌘E` | renderer → renderer | — |
| `anchor-health` | — | P n only | — / `Document health` | — / same | — | — | — |

### 2.5 Navigate group

| id | wire | sites today | target label | shortcutId · chord | owner today → target | menu |
|---|---|---|---|---|---|---|
| `tab-next` | — | K, S `Next / previous tab` | `Next tab` (catalogue) | `tab-next` · `⌃Tab` | renderer → renderer | — |
| `tab-previous` | — | K, S `Next / previous tab` | `Previous tab` | `tab-previous` · `⌃⇧Tab` | renderer → renderer | — |
| `tab-next-bracket` | — | K, S not listed | `Next tab` | `tab-next-bracket` · `⇧⌘]` (physical `BracketRight`) | renderer → renderer | — |
| `tab-previous-bracket` | — | K, S not listed | `Previous tab` | `tab-previous-bracket` · `⇧⌘[` (physical `BracketLeft`) | renderer → renderer | — |
| `close-find` | — | K, S not listed | `Close find` | `close-find` · `Esc` / `⇧Esc` | renderer → renderer | — |
| `page-previous` | — | K, S `Previous / next page` | `Previous page` | `page-previous` · `⌘↑` | renderer → renderer | — |
| `page-next` | — | K, S `Previous / next page` | `Next page` | `page-next` · `⌘↓` | renderer → renderer | — |

### 2.6 App group

| id | wire | sites today | target label | shortcutId · chord | owner today → target | menu |
|---|---|---|---|---|---|---|
| `settings` | `settings` | M App (mac only), P n+g, K, S `Settings` | `Settings…` / `Settings…` | `settings` · `⌘,` | native → renderer | App (mac only) |
| `settings-shortcuts` | `settings-shortcuts` | M Help (`menu-keyboard-shortcuts`), no P/K/S | `Keyboard shortcuts` / — | — | — | Help |
| `flush` | `flush` | W only; nothing sends it (wire-reserved) | no label (no surface) | — | — | — |

### 2.7 Block commands kept outside the manifest (unchanged in this batch)

These are palette rows and/or context-menu rows whose chords, if any, are editor-local, so they do
not meet the "menu, wire id, or global chord" criterion. They keep their shipped behavior; the only
change is that their palette gate reads the same authoring decision and reason constants (§3.2).

| palette id | label | chord site | availability today |
|---|---|---|---|
| `add-child` | `Add child block` | `⌃⏎` editor scope (TipTap) | palette gate; context menu suffix |
| `add-sibling` | `Add sibling block` | `⌥⏎` editor scope | palette gate; context menu suffix |
| `indent-block` | `Indent block` | `Tab` editor scope | palette gate + `indentTarget` |
| `outdent-block` | `Outdent block` | `⇧Tab` editor scope | palette gate + `outdentTarget` |
| `block-text` | `Block type: Text` | — | palette gate |
| `block-h1` | `Block type: Heading 1` | — | palette gate |
| `block-h2` | `Block type: Heading 2` | — | palette gate |
| `block-h3` | `Block type: Heading 3` | — | palette gate |
| `insert-table` | `Insert table` | — | palette gate |
| `insert-image` | `Insert image…` | — | palette gate |
| `insert-math` | `Insert math…` | — | palette gate |
| `insert-code` | `Toggle code block` | — | palette gate |

`link-reference` looks like a block command but is in the manifest because it owns the global
`⇧⌘L`; that is the rule, not an exception: **a palette-only block command joins the manifest the day
it grows a global chord or a menu item.**

### 2.8 The wire set is closed

`MenuCommand` becomes a runtime tuple plus a derived type in `api.ts`: the same 26 strings, same
order, one source. `MENU_COMMANDS` is the contract's runtime inventory; the manifest's `wire` field
must name one of its members. Adding a wire id is a contract change; adding a non-wire command is
not. Two wire ids have no production sender today (`add-block`, `flush`): `add-block` is driven by
the read-mode UI suite through the test bridge, `flush` is reserved. They stay (removing them is an
IPC change with no user benefit) and are marked "wire-only" in the inventory.

---

## 3. Availability

### 3.1 The context (built once per delivery)

```ts
interface CommandContext {
  /** `note` requires an open document runtime; a recovery or missing tab is `none`. */
  document: 'none' | 'note' | 'guest';
  layout: 'continuous' | 'page';
  mode: 'edit' | 'read';
  /** The shipped editingEnabledFor(): Continuous + Edit on a writable note. */
  canAuthor: boolean;
  hasSelection: boolean;
  /** The find bar is open (Escape closes it). */
  findBarOpen: boolean;
  /** The find bar or the Search sidebar owns a result set (⌘G / ⇧⌘G step it). */
  findActive: boolean;
  tabCount: number;
}
```

`canAuthor` is computed by the existing renderer predicate, not re-derived in the manifest: the
context builder is the only place that knows stores, and the manifest stays a pure function of its
input. `canUndo` / `canRedo` are deliberately **not** in the context: no shipped command is disabled
by empty history (the palette keeps Undo/Redo enabled and the runner routes text vs structural
history). Adding such a rule is a product decision, not part of this batch.

`findBarOpen` and `findActive` are two fields because they are two shipped rules: `Esc` closes the
bar only when the bar is open, while `⌘G`/`⇧⌘G` step the current hit when the bar **or the Search
sidebar** is active (`findSurfaceActive`). Collapsing them would make `Esc` steal the key while only
the sidebar search is open.

### 3.2 The decision (one per command per context)

```ts
type Availability =
  | { kind: 'enabled' }
  | { kind: 'disabled'; reason: string }  // offered, inert, the reason is shown/reported
  | { kind: 'hidden' };                   // not offered here: no row, no key consumption, no message
```

Reason constants (verbatim shipped copy, one home):

| key | string | shipped on |
|---|---|---|
| `NO_DOCUMENT` | `Open a document first` | note palette, every document command |
| `READ_MODE` | `Read mode — switch to Continuous Edit to run this command` | note palette (the toast today says a shorter sentence; see §3.4) |
| `GUEST_EXPORT` | `Markdown files have no Page or PDF export.` | File → Export PDF / `⌘P` on a guest |
| `NO_SELECTION` | `Select a block first.` | the palette's indent/outdent gate |
| `EXPORT_NO_NOTE` | `Open a note before exporting a PDF.` | `⌘P` / File → Export PDF with no note |

Every command's predicate composes in a fixed order: **document kind → no document → authoring →
selection → command-specific**. That order is the single rule; a predicate never re-checks a
condition an earlier step already answered.

### 3.3 The matrix

Columns: `N` no document · `NE` note Continuous Edit · `NR` note Continuous Read · `PE` note Page
Edit · `PR` note Page Read · `G` guest file. `E` = enabled, `D(x)` = disabled with reason x,
`H` = hidden. Conditions in the last column are the only exceptions to the per-column value.

| id | N | NE | NR | PE | PR | G | condition / notes |
|---|---|---|---|---|---|---|---|
| `new-document` | E | E | E | E | E | E | main reports a missing library |
| `open-document` | E | E | E | E | E | E | opens the palette in documents-only mode |
| `open-markdown` | E | E | E | E | E | E | native picker |
| `save` | D(NO_DOCUMENT) | E | E | E | E | E | Page Edit commits first; read-only runner reports |
| `close-tab` | E | E | E | E | E | E | inert with no tab |
| `close-window` | E | E | E | E | E | E | not overlay-gated (window action) |
| `reopen-tab` | E | E | E | E | E | E | runner says `No recently closed tab.` |
| `new-chapter` | D(NO_DOCUMENT) | E | D(READ_MODE) | D(READ_MODE) | D(READ_MODE) | H | |
| `add-block` | D(NO_DOCUMENT) | E | D(READ_MODE) | D(READ_MODE) | D(READ_MODE) | H | |
| `export-pdf` | D(EXPORT_NO_NOTE) | E | E | E | E | D(GUEST_EXPORT) | guest palette omits the row (curation) |
| `rename-document` | D(NO_DOCUMENT) | E | E | E | E | H | |
| `reveal` | D(NO_DOCUMENT) | E | E | E | E | E | label depends on the document kind |
| `undo` | D(NO_DOCUMENT) | E | D(READ_MODE) | D(READ_MODE) | D(READ_MODE) | E | guest history is renderer-local |
| `redo` | D(NO_DOCUMENT) | E | D(READ_MODE) | D(READ_MODE) | D(READ_MODE) | E | |
| `find-open` | H | E | E | E | E | H | |
| `find-next` | H | E if `findActive` else H | same | same | same | H | |
| `find-previous` | H | E if `findActive` else H | same | same | same | H | |
| `link-reference` | D(NO_DOCUMENT) | E if `hasSelection` else D(NO_SELECTION) | D(READ_MODE) | D(READ_MODE) | D(READ_MODE) | H | |
| `command-palette` | E | E | E | E | E | E | overlay gate applies, not availability |
| `toggle-sidebar` | E | E | E | E | E | E | |
| `zoom-in` | D(NO_DOCUMENT) | E | E | E | E | H | |
| `zoom-out` | D(NO_DOCUMENT) | E | E | E | E | H | |
| `zoom-reset` | D(NO_DOCUMENT) | E | E | E | E | H | 100 % in both layouts |
| `fit-width` | D(NO_DOCUMENT) | E | E | E | E | H | |
| `fit-page` | D(NO_DOCUMENT) | E | E | E | E | H | inert in Continuous (shipped; see §11 D6) |
| `focus-branch` | D(NO_DOCUMENT) | E | E | E | E | H | navigation only |
| `continuous-layout` | D(NO_DOCUMENT) | E | E | E | E | H | preserves the mode |
| `page-layout` | D(NO_DOCUMENT) | E | E | E | E | H | preserves the mode |
| `toggle-interaction-mode` | D(NO_DOCUMENT) | E | E | E | E | E | |
| `anchor-health` | E | E | E | E | E | H | read-only audit; opens the sidebar |
| `tab-next` | E if `tabCount ≥ 2` else H | same | same | same | same | same | |
| `tab-previous` | E if `tabCount ≥ 2` else H | same | same | same | same | same | |
| `tab-next-bracket` | E if `tabCount ≥ 2` else H | same | same | same | same | same | |
| `tab-previous-bracket` | E if `tabCount ≥ 2` else H | same | same | same | same | same | |
| `close-find` | E if `findBarOpen` else H | same | same | same | same | same | not `findActive` |
| `page-previous` | H | H | H | E | E | H | `layout === 'page'` |
| `page-next` | H | H | H | E | E | H | `layout === 'page'` |
| `settings` | E | E | E | E | E | E | |
| `settings-shortcuts` | E | E | E | E | E | E | menu only |
| `flush` | E | E | E | E | E | E | wire only |

Two edge cases the matrix settles: (a) a guest tab with the Search sidebar open counts as
`findActive`, but the guest column is `H` for the find commands — the shipped `⌘F` already no-ops on
a guest, so stepping a note result set under a guest tab is not offered; (b) a note opened read-only
is `canAuthor: false`, so it gets `READ_MODE` (the shipped wrong sentence, see the note below).

A note on read-only (locked) notes: a note can be open read-only, and `canAuthor` is then false, so
the current reason would read `READ_MODE` even when the user is in Continuous Edit. That is a shipped
copy defect (the same wrong sentence already appears in the palette today). Fixing it needs a new
reason and owner-approved copy, so it is out of scope here and recorded in §11 (D3).

### 3.4 What the surfaces disagree on today, and the single rule

| Situation | Palette today | Key today | Menu today | Target |
|---|---|---|---|---|
| No document | row disabled, `Open a document first` | silent (runner returns) | silent | `D(NO_DOCUMENT)`: row + one toast with the same sentence |
| Read mode | row disabled, long sentence | toast, short sentence | toast, short sentence | `D(READ_MODE)`: one sentence everywhere |
| Guest file | curated six rows | silent except Export (toast) | silent except Export (toast) | `H` (not offered) except the commands whose guest cell is `E` in §3.3 (file commands, Save, Undo/Redo, toggle mode, reveal, close/reopen, sidebar, settings, palette, tab cycle); Export `D(GUEST_EXPORT)` |
| No selection (`link-reference`) | row enabled, inert | silent | n/a | `D(NO_SELECTION)` |
| Find inactive (`⌘G`, `Esc`) | no row | key passes through | silent | `H`, key not consumed |
| Tab cycle with <2 tabs | no row | key consumed, no-op | n/a | `H`, key not consumed |
| Page-only (`⌘↑/↓`) | no row | key passes through | n/a | `H`, key not consumed |
| Fit page in Continuous | row enabled, inert | n/a | item enabled, inert | unchanged (`E`, inert) |
| Modal open | palette is the owner | gated | gated, except `close-window` | dispatcher gate, same exceptions |

**The one rule.** The decision is computed once from one context. A surface only chooses how to show
it: the palette renders a disabled row with the reason (or omits a hidden row), the key and the menu
report one info toast with the same reason, and a hidden command is silent everywhere and does not
consume its chord. A successful command reports its own outcome exactly as the runner does today.

**Visible changes to approve** (copy is reused; no new sentence is invented):

1. `READ_MODE`: the palette keeps its precise sentence; the key/menu toast changes from
   `Read mode — switch to Edit to make changes.` to `Read mode — switch to Continuous Edit to run
   this command`. Recommendation: accept, because Page Edit does not enable these commands.
   Alternative (if the owner prefers the old toast): unify on the old sentence and accept a less
   precise palette reason. Owner: product owner.
2. `EXPORT_NO_NOTE`: the palette row's reason changes from `Open a document first` to the export
   sentence already shown by `⌘P`.
3. `NO_SELECTION`: `link-reference` becomes a disabled row (was enabled/inert) and `⇧⌘L` consumes
   the chord and reports the reason (was a silent pass-through; the menu has no such item).
4. No document: `save`, `new-chapter`, `add-block`, `undo`, `redo`, zoom, fit, focus, layout and mode
   commands now report `Open a document first` from the key (and from the menu where the command has
   an item) — they were silent. The palette already showed it.

### 3.5 Key consumption

- A chord that resolves to `enabled` or `disabled` belongs to the command: the router
  `preventDefault()` + `stopPropagation()` and runs it (or reports the refusal once).
- A chord that resolves to `hidden` does not belong to the command here: the router returns without
  consuming, so the local surface (find field, Page canvas, dialog, editor) sees the key. This is
  what keeps `Esc`, `⌘↑`/`⌘↓`, `⌃Tab` and `⌘G` honest outside their context.
- Auto-repeat: `event.repeat` is suppressed for every command except the ones marked `repeat:
  'allow'` — `undo`, `redo`, `zoom-in`, `zoom-out`. The old time window conflated duplicate delivery
  with auto-repeat; with one delivery path only the boolean remains, and keeping a hold-to-undo and a
  hold-to-zoom behavior is the shipped intent.
- Event-target guards stay in the router, not the manifest, because they describe the event, not the
  app state: the Page Edit overlay (`⌘Z`/`⇧⌘Z`/`⌘S`/`Esc` belong to the overlay's own editor), text
  inputs for undo/redo, the pager field and other inputs for page arrows.
- Overlay gate: while Settings, the palette, or the Export sheet owns the channel, every app command
  is ignored except the palette's own `⌘K` toggle and `close-window`. `close-window` is a window
  action and stays outside the gate, as shipped.
- Unknown ids (a stale main/renderer pair) are ignored by the dispatcher; it never throws and shows
  nothing. The runner map is exhaustive at build time, so this is a runtime-only safety net.

---

## 4. Module boundaries and files

### 4.1 The shape, in codebase-design terms

- **Module:** the command manifest. Small **interface** (`availabilityFor(id, ctx)`,
  `command(id)`), large **implementation** (40 records × six contexts, five reason strings, menu
  placement, shortcut links). **Deep**, not a pass-through: callers never learn the matrix.
- **Seam:** `shared/commands.ts`, between the two processes. It is a **real seam**, not a
  hypothetical one: two processes and four adapters already exist (main's menu, the renderer's
  palette, key router and runner map).
- **Second seam:** the runner map, inside the renderer. Behavior stays out of shared; the manifest
  carries no `run`. The map is exhaustive over the id union, so a new command fails the build until
  it has a behavior.
- **Adapters:** the native menu template, the palette adapter, the key router, the runner map. The
  menu's placement is a command fact and lives in the manifest because both processes must agree on
  it; the palette's row selection and order (including the guest subset) stay in the palette adapter,
  which is one process's curation. Labels, availability and chords always come from the manifest.
- **Leverage:** a new command is one record + one runner; four surfaces update by derivation. A
  rule change (Read mode, guest, no document) is one edit.
- **Locality:** reasons, chord links, menu placement and availability live once. The palette, the
  menu and the keys stop re-encoding them.
- **Deletion test:** delete the manifest and the four listings return, plus three copies of the
  availability rules (palette gate, menu switch, keydown chain). It concentrates; it earns its keep.
- **Deliberately not merged:** the chord catalogue (it serves non-command surfaces: editor keymap,
  find field, Page canvas, tooltips) and the Settings list (its rows pair commands and carry scope
  notes). One adapter means a hypothetical seam; forcing them into the command module would widen
  the interface with no second consumer.

### 4.2 Files

**New**

- `apps/desktop/src/shared/shortcuts.ts` — the chord catalogue, moved from
  `renderer/src/lib/shortcuts.ts` unchanged in behavior. Gains small accessors used by main and the
  router: `shortcutFor(id)`, `menuAccelerator(id)`, `shortcutScope(id)`, `hasChord(id)`.
- `apps/desktop/src/shared/commands.ts` — `AppCommandId`, `CommandContext`, `Availability`,
  `AppCommand`, the reason constants, `APP_COMMANDS`, `commandById`, `availabilityFor`,
  `appCommandIds`. `label` is required for a command with a menu or palette surface and may be
  omitted for a wire-only command. Imports only `type MenuCommand` and the chord catalogue; no
  React, no store, no Electron.
- `apps/desktop/src/renderer/src/commands/context.ts` — the only store reader; builds
  `CommandContext` from the shell, the registry and `findSurfaceActive`; reuses
  `activeEditingEnabled()`.
- `apps/desktop/src/renderer/src/commands/run.ts` — `runAppCommand(id, surface)`: unknown id guard,
  overlay gate, one context, one availability, surface refusal policy, runner call.
- `apps/desktop/src/renderer/src/commands/runners.ts` — `Record<AppCommandId, () => void>`, thin
  calls into the shipped action functions; no availability logic.
- `apps/desktop/src/renderer/src/commands/keys.ts` — `handleAppKeyDown(event)`: match from the
  manifest × catalogue, event-target guards, repeat policy, consume policy.
- `apps/desktop/src/renderer/src/commands/palette.ts` — `paletteCommands()`: the note order and the
  guest order, app rows from the manifest, block rows from the block list, one gate helper.
- `apps/desktop/src/renderer/src/commands/block-commands.ts` — the 12 block entries moved out of
  `actions.ts`, with their requirement (`document` / `author`) and no new copy.
- `apps/desktop/test/commands.test.ts` — manifest, placement, parity, reachability.
- `apps/desktop/test/command-availability.test.ts` — the matrix, conditions, reasons.
- `apps/desktop/test/command-surfaces.test.ts` — refusal policy, key consumption, repeat, runner
  coverage, overlay exceptions.
- `apps/desktop/test/menu-template.test.ts` — the derived menu: labels, separators, order, pinned
  ids, accelerators, no registered app accelerator. (May be folded into `shortcuts.test.ts`; keep it
  separate if the file grows past comfort.)
- `tests/ui/command-surface.test.mjs` — end-to-end parity for no document, Read, guest, one
  keypress = one command, hidden chords, overlay.

**Modified**

- `apps/desktop/src/shared/api.ts` — `MENU_COMMANDS` tuple + derived `MenuCommand`; the 26 same
  strings. No other IPC change.
- `apps/desktop/src/main/menu-template.ts` — roles stay literal; app items derive from the manifest;
  accelerators from the catalogue; `registerAccelerator: false` on every derived item (the final
  state; step 4 keeps the shipped values until step 7); the one window-action branch for
  `close-window`; the eight pinned item ids.
- `apps/desktop/src/renderer/src/App.tsx` — delete `dispatch`, `SINGLE_PATH_COMMANDS`,
  `lastDispatch`, the 120 ms map and the whole keydown chain; `onMenu` and the test bridge call
  `runAppCommand`; one `handleAppKeyDown` listener; add `commandState(id)` to the test bridge.
- `apps/desktop/src/renderer/src/actions.ts` — delete `paletteCommands()` and `runMenuCommand()`;
  keep every action function; move the block list; import the shared reason in `blockedByReadMode`.
- `apps/desktop/src/renderer/src/shell/CommandPalette.tsx` — import path only.
- `apps/desktop/src/renderer/src/lib/editability.ts` — `READ_MODE_TOAST` becomes the shared
  `READ_MODE` reason (the title and suffix stay local).
- `apps/desktop/src/renderer/src/export/export-flow.ts` — the no-note guard imports
  `EXPORT_NO_NOTE`.
- `apps/desktop/src/renderer/src/global.d.ts` — `commandState(id)` in the test bridge type.
- the 15 remaining renderer files that import `lib/shortcuts` (App and actions are listed above; the
  two unit tests are updated in §6.2) — mechanical path update to `shared/shortcuts`.
- `apps/desktop/test/shortcuts.test.ts` — import path; the menu assertions read the derived
  template; the ownership assertion; the global-chord → command coverage (with the four `text-*`
  role exceptions).
- `apps/desktop/test/copy-cd.test.ts` — the copy lists for `editability.ts` and `export-flow.ts`
  follow the moved strings; no sentence changes except the approved `READ_MODE` unification.
- `apps/desktop/test/page-edit-commit-keys.test.ts` — import path.
- `tests/ui/m4b1a2-read-mode-gating.test.mjs` — must pass; change only if the exact toast text is
  asserted (today it matches `/Read mode/`). The menu-refusal parity assertion belongs in the new
  suite.
- `tests/ui/ui-editor-shortcuts.test.mjs` — must pass unchanged; the palette hints and the Settings
  rows are pinned there.
- `tests/ui/ui-overlay-command-gate.test.mjs` — must pass unchanged.
- `tests/ui/m4b1-page-view.test.mjs`, `tests/ui/v0-shell-frame.test.mjs` — must pass unchanged; they
  pin `cmd-fit-page`, `cmd-fit-width`, `cmd-zoom-reset` and `menu-fit-page`.

**Removed**

- `apps/desktop/src/renderer/src/lib/shortcuts.ts` (moved).
- `paletteCommands`, `runMenuCommand`, `dispatch`, `SINGLE_PATH_COMMANDS`, `lastDispatch`, the
  keydown chain. The four-copy structure is gone; the manifest + adapters replace it.

**Dependency rule**

`shared/commands.ts` ← `shared/shortcuts.ts`; main ← shared; renderer ← shared. Never shared ←
renderer or shared ← main. The manifest may name `MenuCommand` as a type; it must not import a
runner, a store, React, Electron, or the menu template.

---

## 5. Migration in ordered steps (each leaves the suite green)

**Step 1 — Move the chord catalogue to shared.**
Move the file, update the importers (17 renderer files and 2 unit tests), export the accessors,
extend the glyph source guard to `shared/` (it currently scans `renderer/src` only). No behavior.
Green: typecheck + unit + the key-pressing UI suites.

**Step 2 — Make the wire set a runtime list.**
`api.ts`: `MENU_COMMANDS` tuple, `MenuCommand` derived, same 26 strings and order. Add a unit test
that the list is unique and unchanged. No behavior. Green.

**Step 3 — Add the manifest, its tests, and no consumers.**
`shared/commands.ts` with the 40 records, the context type, the five reasons, the helpers and the
lookup. Unit tests: wire parity both ways, unique ids, every command reachable from at least one
surface, every label non-empty, every `shortcutId` resolves, every chord unique, the full matrix.
Green: nothing calls it yet, so the diff is reviewable in isolation.

**Step 4 — Derive the native menu.**
`menu-template.ts` keeps the role scaffolding and spreads each manifest section/block, reading
`menuLabel`, `shortcutId → menuAccelerator`, and sending `wire`. Preserve the eight pinned item ids
and the exact labels/separators/order. Keep today's `registerAccelerator` values through a local
`RENDERER_OWNED` set of the 11 shipped ids (the set is deleted in step 7). Green: `copy-cd` and
`shortcuts.test.ts` pass unchanged; no behavior.

**Step 5 — Add the dispatcher and runners; route the menu.**
`context.ts`, `run.ts`, `runners.ts`; `onMenu` and `dispatchMenuCommand` call
`runAppCommand(id, 'menu')`; `runMenuCommand`'s switch becomes the runner map. The refusal policy
lands: `disabled` → one info toast; `hidden` → silence; the overlay gate is unchanged. Green: the
Read-mode menu tests still see a Read toast (now the unified sentence); no-document menu refusals
start reporting (flagged in §3.4).

**Step 6 — Derive the key router.**
`keys.ts` iterates the manifest commands that own a global chord (resolved from the catalogue),
keeps the event-target guards and the overlay gate, adds the missing `⌘O` / `⇧⌘O` routes, and
replaces the chain in `App.tsx`. Keep the 120 ms dedupe **only** for the commands the native menu
still registers, as a temporary shim. Green: every key-driven UI suite; the Page Edit suite proves
the overlay guards still run first.

**Step 7 — One owner per chord.**
Flip every derived menu item to `registerAccelerator: false`; delete the dedupe, the single-path set
and the temporary shim; add the `event.repeat` policy. Green: a unit test asserts no labelled menu
item registers an accelerator; a UI test asserts one `⌘N` adds one tab and one `⌘W` removes one.

**Step 8 — Derive the palette.**
`palette.ts` builds the note and guest lists from the manifest membership + the adapter's shipped
order, splices the block entries, uses one gate helper for the block list, and calls
`runAppCommand(id, 'palette')`. Delete `paletteCommands()`. Green: the palette UI tests, including
the pinned `cmd-*` ids and the guest six.

**Step 9 — Cleanup and evidence.**
Delete the dead App code and the two action listings; update the test bridge type; add the parity UI
suite; take the two screenshots (§6.4); run `verify:fast`. The orchestrator updates
`docs/design/shortcuts.md` (the module table, the S3-1 "deliberately double" note, the `menu`
comment) after integration.

Each step is a commit-sized unit; steps 1–3 are no-behavior, step 4 is no-behavior, steps 5–8 each
add one adapter, step 7 is the only ownership flip. If the batch must split, the natural seam is
**A = 1–7** (menu + dispatcher + keys + one owner) and **B = 8–9** (palette + cleanup); the plan's
acceptance criteria cover both.

---

## 6. Tests

### 6.1 Unit

- **Manifest parity.** The wire subset of the manifest equals `MENU_COMMANDS` both directions; ids
  are unique; every command has at least one surface (`menu`, palette membership, a global chord,
  or a wire id); every command's `shortcutId` exists; no two commands share a `shortcutId`; every
  `menu` placement has a label and a wire id.
- **Placement.** The derived menu reproduces the shipped sequences exactly:
  - File: `New note, Open note…, Open Markdown…, New chapter, ─, Save, Export PDF…, ─, Close tab,
    Reopen closed tab, Close Window`;
  - Edit: `Undo, Redo, ─, Find…, Find Next, Find Previous, ─, roles`;
  - View: `Command palette…, Toggle sidebar, ─, roles, ─, Fit width, Fit page, Focus branch,
    Reset zoom, Zoom in, Zoom out, ─, fullscreen`;
  - Help: `Keyboard shortcuts`; App (mac): `Settings…`;
  - ids exactly `menu-export-pdf, menu-undo, menu-redo, menu-find, menu-find-next,
    menu-find-previous, menu-fit-page, menu-keyboard-shortcuts`, in document order.
- **Ownership.** Every labelled menu item that carries an accelerator has `registerAccelerator:
  false`; no literal `CmdOrCtrl` string remains in the menu template (the catalogue is the only
  chord writer); every displayed accelerator equals `menuAccelerator(command.shortcutId)`.
- **The matrix.** A table-driven test over the 40 commands × six contexts (plus `hasSelection`,
  `findBarOpen`, `findActive`, `tabCount`) equals §3.3; reason strings equal the constants; no
  adapter contains a reason literal.
- **Global-chord coverage.** Every `global`-scope catalogue id with a chord maps to exactly one
  manifest command, except `text-cut`, `text-copy`, `text-paste`, `text-select-all` (native roles,
  documented outside the command surface). This is the guard that a new global chord cannot bypass
  the manifest.
- **Refusal policy.** `disabled` → palette inline, key/menu one toast; `hidden` → no row, no
  consume; `enabled` → run once. The router: enabled/disabled consume, hidden does not; repeat
  suppressed except for the four allowed commands.
- **Runner coverage.** `Object.keys(RUNNERS)` equals the manifest ids (the type already enforces it;
  the runtime test catches a cast).
- **Menu/palette/key parity, at the data level.** For each command and context, the three surfaces
  read the same decision object; the palette adapter's row state equals `availabilityFor`.
- **Palette inventory.** The note list has the shipped command ids, labels and order; the guest list
  is exactly the six shipped command rows; the block entries keep their ids and gate.

### 6.2 Existing unit tests to update

- `shortcuts.test.ts`: import path; the menu assertions now read the derived template; replace the
  per-item `registerAccelerator` expectations with the one rule (no labelled app item registers);
  keep every chord/list/display assertion.
- `copy-cd.test.ts`: the `APPLIED_COPY` module lists for `editability.ts` and `export-flow.ts`
  follow the moved strings; all other copy assertions must pass unchanged.
- `page-edit-commit-keys.test.ts`: import path only.

### 6.3 UI

- **New `command-surface.test.mjs`.**
  1. *No document.* Launch empty; `⌘K` shows Save / New chapter disabled with
     `Open a document first` and Export disabled with `Open a note before exporting a PDF.`;
     `File → New chapter` and `⇧⌘N` each show `Open a document first` once and change nothing;
     `New note` still creates one tab.
  2. *Read.* `⌘E` to Read; the palette New chapter row's reason equals the toast from `⇧⌘N` and
     from the menu click; the document revision is unchanged.
  3. *Guest.* Open a `.md`; the palette has exactly the six command rows; `⌘S` saves; `⌘P` and the
     menu show `Markdown files have no Page or PDF export.`; no forest command is offered.
  4. *One keypress, one command.* One `⌘N` adds exactly one tab; one `⌘W` closes exactly one; one
     menu click runs once. (Proves the 120 ms window is gone and no native duplicate exists.)
  5. *Hidden chords.* With no find open, `Esc` closes an open dialog (not consumed by close-find);
     with find open, `Esc` closes the bar; in Continuous, `⌘↑` reaches the editor (block navigation)
     rather than the page; `⌃Tab` with one tab does not switch anything.
  6. *Overlay.* Reuse the shipped assertions: menu commands and keys behind Settings/Export are
     ignored; the palette's own `⌘K` toggles; `close-window` remains the exception (unit-tested).
- **Existing suites.** `m4b1a2-read-mode-gating` (menu/key/palette refusals), `ui-editor-shortcuts`
  (palette hints and Settings rows), `ui-overlay-command-gate` (gate), `m4b1-page-view` (fit ids),
  `v0-shell-frame` (`menu-fit-page`), `markdown-file-view` (guest File → Open Markdown…) must pass
  with their current expectations except for the approved Read-mode sentence.

### 6.4 Evidence

Unit test output for the four new files and the three updated ones; the affected UI suites; two
screenshots — the Read-mode palette row with the unified reason, and the refusal toast after the
menu click; the menu template dump showing every app item with `registerAccelerator: false`; the
`npm run verify:fast` result. The full `verify` is the orchestrator's integration gate.

---

## 7. Non-goals

- No new commands, no removed commands, no chord changes, no menu re-organization, no label changes
  beyond §3.4.
- No dynamic native menu items (enable/disable per state). The native menu stays static; the
  dispatcher reports the refusal.
- No migration of block/tab/library/image context menus. Only `link-reference` crosses over, because
  it owns a global chord.
- No palette redesign: the note order and the guest six rows stay as shipped; block commands stay
  out of the manifest.
- No Settings-list redesign: labels, pairs and scope notes stay in the chord catalogue.
- No `canUndo`/`canRedo` disablement and no history-aware menu.
- No fix for the read-only/locked-document reason (shipped defect, recorded in §11 D3).
- No change to `DocumentCommand`, the document schema, the IPC payloads, session state or PDF.
- No Windows/Linux work; the app menu's Settings item stays mac-only.
- No ADR (the survey found none needed; this batch changes no ratified model).

---

## 8. Rejected alternatives

- **Registry in `packages/core`.** App chrome (chords, menu labels, refusals) would leak into the
  document model and pull Electron/menu concerns into a published package. Rejected.
- **Registry in `main`.** The renderer cannot import across the process seam; the path duplicates
  would stay. Rejected.
- **Registry in the renderer only.** Main cannot derive the menu; the accelerator strings stay
  duplicated. Rejected.
- **Run handlers in the shared manifest.** The handlers need stores, IPC, dialogs and toasts; shared
  would become renderer-coupled and untestable in main. Manifest = data + pure decision, runners =
  renderer behavior. Rejected.
- **Merge the chord catalogue into the command manifest.** Chords serve non-command surfaces
  (editor keymap, find field, Page canvas, tooltips); a merged module would need a row/surface
  concept for every entry. Rejected.
- **Derive the Settings list from the manifest.** Its rows pair commands (`Undo / Redo`,
  `Zoom in / out`) and carry scope notes; that row model belongs to the catalogue. Rejected; the
  link is the `shortcutId`, guarded by tests.
- **Keep the 120 ms throttle.** A time window is a proxy for "is this a duplicate delivery"; with one
  path it silently drops legitimate commands and hides double execution. Rejected — except as the
  fallback for native-owned commands if the owner keeps native registration (§11 D1).
- **Native-owned chords + renderer ignores the key.** Breaks the UI suites' key path and removes the
  renderer fallback; also contradicts the design doc's reason for the double. Rejected.
- **Keep native accelerators and the throttle.** This is the shipped state; it is the fallback, not
  the goal. Rejected as the target.
- **A `Command` class with `execute` / `canExecute` / `label`.** A class adds no leverage over a
  record plus a pure function; the interface is smaller without it. Rejected.
- **A reason-code indirection (decision returns a code, surfaces map copy).** One extra mapping table
  for five strings; the string itself is the interface here. Rejected.

---

## 9. Risks and stop conditions

**Risks**

1. **One-owner flip.** With no native registration, app shortcuts depend on the renderer being
   mounted. The eleven already-renderer-owned chords prove the mechanism on macOS; the window's
   flush/close flow stays in main, and menu clicks still work. Manual check in the built app: every
   chord in §2, with a menu open and after refocusing the window.
2. **Hold behavior.** Replacing the throttle with `event.repeat` changes hold-to-save/hold-to-zoom.
   The manifest's `repeat` field keeps history and zoom repeatable; the owner reviews.
3. **Menu derivation.** A wrong section/block order or a dropped role is caught by the pinned label/
   order/id tests; the one deliberate special case is `close-window`.
4. **New refusals.** Four visible changes (§3.4) are user-facing; the owner approves before build.
5. **Catalogue move.** 17 renderer imports + 2 test imports; typecheck and the key UI suites catch a miss.
6. **Guest palette curation.** Membership (manifest) and order (adapter) are two facts; the test
   pins the exact six rows and their order.
7. **Page Edit guards.** If the router runs before the overlay guard, `⌘Z` inside the overlay breaks.
   The Page Edit suite is the gate; add a focused case if it is not covered.
8. **Palette memo deps.** The palette is modal, so only runtime updates occur while open; `seq`
   covers selection changes. If a new context field can change while open, add it to the deps.
9. **The manifest grows into a god module.** Stop if it imports renderer code, gains run handlers, or
   absorbs the block commands without a second surface. It is data + decision only.

**Stop conditions**

- A command's true availability needs a reason with no shipped copy, or the owner has not approved a
  §3.4 change → stop and ask.
- The derived menu cannot reproduce the pinned structure without per-item special cases beyond
  `close-window` and the mac-only Settings item → stop; the menu ids are pinned by tests.
- The one-owner flip breaks a non-Playwright path or any UI suite double-runs a command → stop and
  report the duplicate source; do not paper over it with a new time window.
- The palette/block boundary forces a product-visible row change (beyond §3.4) → ask.
- The code contradicts the spec (for example a command the spec allows in Read is gated) → stop.

---

## 10. Acceptance criteria

1. **Wire contract unchanged.** The IPC runtime list contains exactly the 26 shipped ids, unchanged,
   unique; the manifest covers each exactly once; a test fails if either side gains or loses an id.
2. **One declaration per command.** Every application command appears once with a label (or a
   contextual label) where a menu or palette renders it, a group, an explicit menu placement or
   "no menu", a palette membership, a `shortcutId` or an explicit "no chord", and an availability
   predicate; the manifest test enumerates all 40 and no orphan surface.
3. **Menu parity.** The native menu built from the manifest reproduces the shipped labels,
   separators, order, the eight pinned item ids and every accelerator; those expectations pass
   unchanged. The only updated menu expectation is the ownership assertion in step 7 (formerly
   native items now carry `registerAccelerator: false`).
4. **One owner per chord.** No menu item for an application command registers its accelerator; every
   displayed accelerator equals the catalogue's; no two commands share a chord; the router maps every
   global chord to exactly one command (four documented role exceptions).
5. **The matrix.** Every command × context in §3.3 yields the stated decision; the same disabled
   state yields the same reason on the palette row, the key and the menu.
6. **Surface policy.** `hidden` = not offered, not consumed, silent; `disabled` = offered, consumed,
   one report; `enabled` = runs exactly once. All three are tested through the dispatcher.
7. **Extensibility.** A new command needs one record and one runner; missing a runner fails the
   build; missing a surface or a chord link fails a test.
8. **Throttle gone.** No time-based dedupe remains; one `⌘N` adds one tab, one `⌘W` removes one, one
   menu click runs once; the single-path exception set is deleted.
9. **Palette inventory unchanged.** The note list keeps its command ids, labels and order; the guest
   list is exactly six command rows; the block entries and their gate are unchanged.
10. **Settings unchanged.** The shortcut list renders the same rows, labels and keys from the
    catalogue; the menu accelerators equal it.
11. **Gate and overlay behavior unchanged.** Menu commands and keys behind Settings/Export/palette are
    ignored except the palette's `⌘K` and `close-window`; Page Edit's local keys still win; the
    shipped UI suites pass.
12. **Copy.** No user-visible copy changes except the four approved items in §3.4; every unchanged
    label is byte-identical to the shipped string.
13. **No new surfaces.** No new dependency, no IPC or schema change, no change to `DocumentCommand`,
    session state or PDF.
14. **Evidence.** Typecheck + unit + the affected UI suites pass; two screenshots (the unified Read
    palette row, the refusal toast); the menu dump shows `registerAccelerator: false` on every app
    item.

---

## 11. Handoff: decisions the orchestrator must take

| # | Decision | Recommendation | Owner |
|---|---|---|---|
| D1 | Accelerator ownership: all-renderer + delete the throttle, or keep native ownership + the throttle for the 11 native items | all-renderer (the proven 11-item pattern; keeps the tested key path) | orchestrator, with the product owner's acceptance |
| D2 | Unify the Read-mode refusal on the palette's precise sentence (the toast changes) | accept | product owner |
| D3 | Read-only/locked notes currently get the Read-mode reason; fix now with new copy, or defer | defer; record the defect | product owner |
| D4 | `link-reference` without a selection becomes a disabled row, and `⇧⌘L` consumes the chord and toasts (was enabled/inert/silent) | accept | product owner |
| D5 | Keep `flush` as a wire-reserved id, or remove it from the contract | keep | orchestrator |
| D6 | Fit page outside Page: keep enabled + inert (shipped) or hide it | keep; hiding needs a UX call | product owner |
| D7 | One batch or two (A = steps 1–7, B = 8–9) | one batch with two checkpoints (`verify:fast` after step 4 and after step 9) | orchestrator |
| D8 | Rename the internal id `anchor-health` → `document-health` | no; no user value, changes the palette DOM id | orchestrator |
| D9 | Update `docs/design/shortcuts.md` (§1 module table, §3 S3-1 "deliberately double", §4.1 `menu` comment) | yes, after integration | orchestrator |

**Open questions for the product owner.** Only D1–D4/D6 need a product voice; D1 is the one that
changes how the menu is wired, D2–D4 are the visible copy/row changes, D6 is a shipped inert row.
Everything else is mechanical and the defaults above keep the shipped behavior.

**What this plan deliberately does not decide.** No priority, no batch size beyond D7, no new
command, no palette expansion, no Read-mode semantics (the spec already defines them), no ADR.
