# Keyboard shortcuts — inventory, defects and the catalogue

**Status:** audit, 17 November 2026; **implemented in B1** (`d1de7ac`, merged `e48e862`). This file stays as
the record of the audit and the product rules; the shipped list has 34 rows in four groups and is rendered
from `lib/shortcuts.ts`.

**P2 update (17 November 2026):** the three open items in §6 are closed. `Export PDF…` is `⌘P` (`⇧⌘E` is
gone, not aliased), the native `Edit` menu carries `Find…` / `Find Next` / `Find Previous`
(`⌘F` / `⌘G` / `⇧⌘G`, renderer-owned), `⇧Esc` closes the find again as a second chord on `close-find`, and
`⇧⌘[` / `⇧⌘]` now match `KeyboardEvent.code` (`BracketLeft` / `BracketRight`), so they fire on a US
layout. `Chord` gained the optional `code` for exactly this case.
**Why now:** the release is close, the Settings list is the only place a user can discover a shortcut, and
nothing in the repository proves that list still matches a key that works.

## 0. Product rules (17 November 2026)

1. **No bare-Shift chord.** A writing app must never take a key a writer needs. `⇧` plus a printable key
   (`⇧1`, `⇧2`) is out; `⇧` as an *extra* modifier on a `⌘`/`⌃` chord stays (`⇧⌘Z`, `⇧⌘E`, `⇧⌘T`), and
   `⇧Tab` stays as outdent on a selected block because it never types.
2. **Not everything gets a shortcut.** A shortcut is for a verb used often or needed without a menu; the
   menu, the toolbar and the palette cover the rest. K1 adds nothing new: it removes, corrects and records.
3. **Prefer the existing convention.** Where a design convention exists, use it even when another key would
   be prettier. Where none exists (the block tree), invent as little as possible and keep it mnemonic.

## 1. Four copies, no shared truth

| Where | What it declares | Used by |
|---|---|---|
| `renderer/src/App.tsx` `onKeyDown` (window capture) | the real global bindings, matched by hand (`event.key`, `event.metaKey`, `event.code`) | the whole shell |
| `renderer/src/editor/keymap.ts` (+ `tables.ts`, `code-block.ts`, `inline-code.ts`, `formulas.ts`) | TipTap named bindings (`Mod-Shift-k`, `Alt-Enter`, `Mod-Backspace`, …) | Continuous and Page Edit, only while the editor has focus |
| `renderer/src/page/PageView.tsx` `onRootKeyDown` | page-canvas keys (`⌥↑/↓`, `⇧1/⇧2`, `Esc`, `↵`) | the Page scroll region, only while it has focus |
| `main/menu-template.ts` | native menu accelerators (Electron strings) | the macOS menu; several are `registerAccelerator: false` because the renderer owns them |

Promises live in three more places: `shell/SettingsDialog.tsx` `SHORTCUTS` (the list), `renderer/src/actions.ts`
(palette rows and context-menu hints), and the `title=` strings on buttons
(`CanvasHeader`, `ViewControls`, `PagePosition`, `Sidebar`, `TabBar`, `FindBar`, `SelectionToolbar`).
Seven places describe keys; one place per surface actually handles them.

What exists today in tests: `tests/ui/ui-editor-shortcuts.test.mjs` pins **26 rows**, three group names and
four labels. Rename any binding in `App.tsx` and the suite stays green — the list is checked against itself.

## 2. Every binding, as shipped

Key: **C** = the Settings list today (✅ listed, ⚠ listed but wrong or ambiguous, ❌ not listed),
**M** = native menu.

### Shell

| Keys | Action | Handled in | C | M |
|---|---|---|---|---|
| `⌘N` | New note | App + menu | ✅ | ✅ |
| `⇧⌘N` | New chapter | App + menu | ✅ | ✅ |
| `⌘O` | Open note… | menu only | ❌ | ✅ |
| `⇧⌘O` | Open Markdown… | menu only (palette shows it) | ❌ | ✅ |
| `⌘S` | Save | App + menu | ✅ | ✅ |
| `⌘P` | Export PDF… | menu + renderer | ✅ | ✅ |
| `⌘W` | Close tab | App + menu | ❌ | ✅ |
| `⇧⌘W` | Close window | App + menu | ❌ | ✅ |
| `⇧⌘T` | Reopen closed tab | App + menu | ❌ | ✅ |
| `⇧⌘[` / `⇧⌘]` | Previous / next tab | App | ❌ | ❌ |
| `⌃Tab` / `⌃⇧Tab` | Cycle tabs | App | ❌ | ❌ |
| `⌘1…⌘9` | Switch to tab N (`⌘2`/`⌘3` reserved) | App | ❌ | ❌ |
| `⌘K` | Command palette | App + menu (renderer-owned) | ✅ | ✅ |
| `⌘,` | Settings | App + menu | ✅ | ✅ |
| `⌘\` | Toggle sidebar | App + menu | ✅ | ✅ |
| `⌘Z` / `⇧⌘Z` | Undo / Redo | App + menu (renderer-owned) | ✅ | ✅ |

### Layout and zoom

| Keys | Action | Handled in | C | M |
|---|---|---|---|---|
| `⌘2` / `⌘3` | Continuous / Page | App | ✅ | ❌ |
| `⌘E` | Edit / Read | App | ✅ | ❌ |
| `⌘+` (`⌘=`) / `⌘−` | Zoom in / out | App + menu | ❌ | ✅ |
| `⌘0` | Reset zoom — 100 % (Page: fit width) | App + menu | ⚠ “Actual size” | ✅ |
| `⇧⌘0` | Fit width | App + menu | ❌ | ✅ |

### Blocks (Continuous, editor focused)

| Keys | Action | Handled in | C | M |
|---|---|---|---|---|
| `⌃⏎` | Add child | keymap (also palette) | ✅ | ❌ |
| `⌥⏎` | Add sibling | keymap (also palette) | ✅ | ❌ |
| `⇧⌘⏎` | Branch from selection (no selection: add child) | keymap | ✅ “⌘⇧Enter” | ❌ |
| `⇥` / `⇧⇥` | Indent / outdent a selected block | keymap (also block menu) | ❌ | ❌ |
| `⌘⌫` | Delete block | keymap | ✅ | ❌ |
| `⌫`/`Del` on a selected block | Delete block | keymap | ❌ | ❌ |
| `⌘.` | Collapse / expand branch | keymap | ✅ | ❌ |
| `⇧⌘F` | Focus branch | App + menu (renderer-owned) | ✅ | ✅ |
| `⇧⌘K` | Link | keymap | ✅ “⌘⇧K” | ❌ |
| `⇧⌘L` | Link as reference | App (also block menu) | ✅ | ❌ |
| `⌘↑` / `⌘↓` | Previous / next block | keymap | ⚠ no scope | ❌ |
| `⌥↑` / `⌥↓` | Move block up / down | keymap (also block menu) | ⚠ no scope | ❌ |

### Page

| Keys | Action | Handled in | C | M |
|---|---|---|---|---|
| `⌘↑` / `⌘↓` | Previous / next page start | App (also the pager tooltips) | ❌ | ❌ |
| `⌥↑` / `⌥↓` | Previous / next page | `PageView` root only | ⚠ listed as the page navigation | ❌ |
| `⇧1` / `⇧2` | Fit page / fit width | App **and** `PageView` (duplicated) | ✅ | ❌ |
| `↵` | Open / edit the selected block | `PageView` root | ❌ | ❌ |
| `Esc` | Clear the block selection | `PageView` root | ❌ | ❌ |
| `Esc` / `⌘⏎` | Commit Page Edit | `PageBlockEditor` | ✅ | ❌ |

### Find

| Keys | Action | Handled in | C | M |
|---|---|---|---|---|
| `⌘F` | Find in note (no-op in a Markdown guest file) | App + menu (renderer-owned) | ✅ | ✅ |
| `⌘G` / `⇧⌘G` | Next / previous match | App + menu (renderer-owned) | ✅ | ✅ |
| `Esc` / `⇧Esc` | Close the find and restore the selection | App | ❌ | ❌ |
| `↵` / `⇧↵` | Next / previous match in the field | `FindBar` input | ❌ | ❌ |
| `↑` / `↓`, `Home` / `End` | Previous / next, first / last match in the field | `FindBar` input | ❌ | ❌ |

Every listed row is a real binding. The list **under-reports**; it does not invent keys — with the two
exceptions below.

## 3. Findings

### S2-1 — Page swallows `!` and `"` in the find field (reproduced)

`App.tsx` handles `⇧1`/`⇧2` in Page **before any target check** and calls `preventDefault()`. Any non-modal
text field inside the Page layout therefore never receives the character.

Reproduced on `main` at `a58cc58` with a UI probe: in Page, `⌘F`, type `a`, press `⇧1`, type `b` → the field
reads `ab` (the keydown is `key:"!" code:"Digit1" shift:true defaultPrevented:true`); in Continuous the same
sequence reads `a!b`. The Page find bar cannot search a word containing `!`, `"`, `£`, `%`, `/`, `(` — every
shifted digit on an IT/UK/US layout. `PageView`’s own copy of `⇧1`/`⇧2` returns early for a contenteditable
but not for an input, so the guard exists nowhere.

Per rule 0 above the fix is **deletion, not a guard**: both `⇧1`/`⇧2` branches go (the global one and the
`PageView` one). Fit width is already `⌘0` in Page (100 % is fit width); fit page becomes a View menu item
with no accelerator, so the mode stays reachable without stealing a printable key.

### S2-2 — the Page group names the wrong key

The list says **Previous / next page — `⌥↑` / `⌥↓`**. Shipped is the opposite: `⌘↑`/`⌘↓` are the global page
step (`App.tsx`, advertised in `PagePosition`’s `aria-keyshortcuts` and in both pager tooltips), while
`⌥↑`/`⌥↓` only work while the page scroll region itself has focus — after one click on the toolbar they are
dead. A user who learns page navigation from Settings learns the key that stops working.

The Editor group has the mirror problem: **Focus previous / next block — `⌘↑` / `⌘↓`** is true only in
Continuous with the caret in a block; in Page the same keys change pages. Both rows are correct in their own
surface and wrong as written, because neither states its scope.

### S2-3 — `⌘0` has three names

`View → Actual size`, the palette’s `Actual size`, the Settings row `Actual size`, and the zoom control’s
`Reset zoom to 100%`. In Page, 100 % **is** fit width (`docs/design/page-scroll.md`), so “actual size” is
false exactly where users press it after a jump. One label is needed.

### S2-4 — the list and the bindings cannot drift loudly, only silently

No test connects a row to a handler. The UI suite asserts 26 rows, so a `SHORTCUTS` edit that adds a row
passes trivially and a binding rename passes silently. This is the same class as the settings inventory
before M4e1: the values exist, the source of truth does not.

### S3-1 — duplicated keys

`⇧1`/`⇧2` are implemented in `App.tsx` and in `PageView.tsx` with different guards — the source of S2-1.
Menu-owned keys (`⌘N`, `⌘S`, `⌘W`, `⌘O`, `⌘⇧E`, `⌘,`, `⌘\`, zoom, fit width, focus branch) are deliberately
double: the menu shows and dispatches, the renderer also matches so the UI suites can press the key without
the native menu. Undo/redo/palette are `registerAccelerator: false` and documented as renderer-owned. Only
`⇧1`/`⇧2` is accidental duplication.

### S3-2 — the list omits 18 real bindings

`⌘O`, `⇧⌘O`, `⌘W`, `⇧⌘W`, `⇧⌘T`, `⇧⌘[`/`⇧⌘]`, `⌃Tab`/`⌃⇧Tab`, `⌘1…⌘9`, `⌘+`/`⌘−`, `⇧⌘0`, `⇥`/`⇧⇥`,
`⌫` on a selected block, `⌘↑`/`⌘↓` (Page), `↵` and `Esc` (Page), and the five find-field keys. The tab
shortcuts matter most: the list never says that `⌘2`/`⌘3` are reserved, so `⌘3` “not switching to tab 3” is
undiscoverable.

### S3-3 — the native menu has no Find, no layout, no mode

`Edit` has no Find submenu; `View` has neither Continuous/Page nor Edit/Read. All three exist as keys, as
toolbar segments and in the palette — but not where macOS users look first. Adding them costs three items
and no new behaviour (the renderer already owns the accelerators).

### S3-4 — two design docs describe a different app

`docs/ux.md` §9.1–§9.2 is the pre-M2 outline model: `⌘1` Outline (now tab 1), `⌘⇧S` Save As, `⌘⌥C` New
chapter (now `⇧⌘N`), `⌘⌥B` manual break, `⌘⌥L` freeze, `⌘⌥R` reflow, `⌘⌥P` Page Setup, `⌘P` quick export,
`⌘⌥I` inspector, `⌘[`/`⌘]` history, `⌘⇧/` shortcut sheet, `⌘↵` New child (now `⌃⏎`/`⌥⏎`), `⌘⌥↵` top-level,
`⌘⇧↑/↓` move block, `⌘⌥[`/`]` collapse all, `⇧↑/↓` extend selection, `⌘A` select all blocks. Several of those
keys now do something else (`⌘⇧[`/`⌘⇧]` cycle tabs). the old shell doc still says plain Backspace merges a
block with the previous one (false since `6727388`) and offers `⌘[`/`⌘]` as an outdent alternative (not
implemented).

### S4-1 — glyph order and wording

The list mixes `⇧⌘F` with `⌘⇧L`/`⌘⇧K`, and writes `⌘⇧Enter` where the bubble writes `⌘⇧Return`. Apple’s order
is `⌃⌥⇧⌘` + key, which the majority of the app already uses (`⇧⌘E`, `⇧⌘N`, `⇧⌘O`, `⇧⌘T`, `⇧⌘W`, `⇧⌘F`).
One order, one spelling of Enter.

## 4. K1 — the catalogue, and a subtractive pass

K1 runs **after the find fixes** (F4a/F4b). It is one batch: one module, one pass of removals, the list
rebuilt from it. No document, layout, pagination or print code.

### 4.1 The module

`renderer/src/lib/shortcuts.ts` (importable by `App`, `PageView`, `FindBar`; the main-process menu keeps its
Electron strings but a unit test asserts each `menu` entry equals the catalogue’s accelerator):

```ts
type Scope = 'global' | 'editor' | 'page' | 'find';
interface Chord { key: string; mod?: boolean; shift?: boolean; alt?: boolean; ctrl?: boolean }
interface Shortcut {
  id: string;              // 'save', 'find-next', 'page-next'
  label: string;           // 'Save'
  group: 'Shell' | 'View' | 'Editor' | 'Page' | 'Find';
  scope: Scope;
  chords: Chord[];         // normally one
  menu?: string;           // 'CmdOrCtrl+Shift+E' when the native menu owns it
  list?: boolean;          // false for input-local behaviour we do not advertise
}
```

- `display(chord)` → `⇧⌘Z` (Apple order `⌃⌥⇧⌘` + key).
- `matches(event, id)` → the handlers stop comparing `event.key` by hand and ask the catalogue. This is the
  part that makes drift impossible; the rendered list is a consequence, not the goal.
- `tipTapKeys(shortcut)` → `['Mod-Shift-k']` for the editor entries, generated from the same data.

Tests: every chord matches itself and rejects a near miss; no chord repeats inside a scope; the menu
accelerators equal the catalogue; `tipTapKeys` round-trips; the Settings rows equal the catalogue.

### 4.2 The subtractive pass (the only behaviour changes)

| Today | Change | Why |
|---|---|---|
| `⇧1` / `⇧2` fit page / fit width (global **and** `PageView`) | **removed**, both handlers | bare-Shift printable keys; they swallow `!`, `"`, `%`… in the Page find field |
| `⌥↑` / `⌥↓` previous / next page on the Page canvas | **removed** | a second page-navigation pair; `⌘↑`/`⌘↓` already work from the header and the pager |
| `⌘1…⌘9` switch to tab N | **removed** | collides with `⌘2`/`⌘3`: tab 2 and 3 were unreachable and `⌘2` did something else. Tabs keep `⌃Tab`/`⇧⌃Tab` and the strip |
| `Actual size` for `⌘0` | **`Reset zoom`** | 100 % is fit width in Page, so “actual size” was false there |
| `⌘⇧L`, `⌘⇧K`, `⌘⇧Enter` | **`⇧⌘L`, `⇧⌘K`, `⇧⌘⏎`** | one glyph order, Apple’s |

Fit page and fit width move to `View` as menu items **without** accelerators; the zoom stepper and the
palette stay as they are.

### 4.3 What we do not add

Fit-page and fit-width keys, `F3`/`⇧F3`, per-tone highlighter keys (`⇧⌘H` is already one key, no tones),
digits for tabs, a manual-break key, an inspector key (no inspector), a key for every menu item, a key for
every palette entry. If a verb needs a key later, it comes back here with a convention behind it.

### 4.4 The convention audit

| Keys | Convention | Verdict |
|---|---|---|
| `⌘N`, `⌘O`, `⌘S`, `⌘,`, `⌘W`, `⇧⌘W`, `⇧⌘T`, `⌘Z`/`⇧⌘Z`, `⌘F`, `⌘G`/`⇧⌘G`, `⌘+`/`⌘−`/`⌘0` | macOS and browser standard | keep |
| `⌃Tab` / `⇧⌃Tab` | browser and macOS “next tab” | keep |
| `⌃⇧Tab` | the reverse of a standard chord, not a bare Shift | keep |
| `⇧⌘[` / `⇧⌘]` | older browser tab cycling | keep |
| `⌘K` | modern app convention for the palette (Slack, Linear, Notion) | keep |
| `⌘\` | VS Code sidebar | keep |
| `⌘E` | Obsidian’s edit/preview toggle | keep |
| `⌥↑` / `⌥↓` | VS Code “move line up/down”, here “move block” | keep |
| `⌘2` / `⌘3` | ours (VS Code groups, Obsidian panes); reserved over tab digits | keep |
| `⌘.` | ours; weakly collides with the legacy macOS “cancel” | keep, note it |
| `⇧⌘F` | VS Code’s search-in-files; unused here | keep, note it |
| `⌃⏎`, `⌥⏎`, `⇧⌘⏎`, `⌘⌫`, `⇥`/`⇧⇥` | ours; no standard for a block tree | keep |
| `⌘P` | the universal “produce a document” key | **decided in P2**: Export PDF uses it; `⇧⌘E` is gone |

## 5. The list, after the pass

One row per verb, five groups, ~34 rows — closer to today’s 26 than to the 44 the shipped bindings would
need. A row exists because a user may need the key without the menu open, not because a key exists.

- **Shell** — New note `⌘N`; New chapter `⇧⌘N`; Open note… `⌘O`; Save `⌘S`; Export PDF… `⌘P`;
  Close tab `⌘W`; Close window `⇧⌘W`; Reopen closed tab `⇧⌘T`; Next / previous tab `⌃Tab / ⇧⌃Tab`;
  Command palette `⌘K`; Settings `⌘,`; Toggle sidebar `⌘\`; Undo / Redo `⌘Z / ⇧⌘Z`.
- **View** — Continuous / Page `⌘2 / ⌘3`; Edit / Read `⌘E`; Zoom in / out `⌘+ / ⌘−`; Reset zoom `⌘0`.
- **Editor** — Add child `⌃⏎`; Add sibling `⌥⏎`; Branch from selection `⇧⌘⏎`; Indent / outdent `⇥ / ⇧⇥`;
  Delete block `⌘⌫` (or `⌫` on a selected block); Collapse / expand `⌘.`; Focus branch `⇧⌘F`; Link `⇧⌘K`;
  Link as reference `⇧⌘L`; Previous / next block `⌘↑ / ⌘↓` *(Continuous, caret in a block)*; Move block
  `⌥↑ / ⌥↓` *(Continuous, editor focused)*.
- **Page** — Previous / next page `⌘↑ / ⌘↓` *(works from the header and the pager)*; Open / edit the
  selected block `↵`; Clear selection `Esc`; Commit Page Edit `Esc / ⌘⏎`.
- **Find** — Find in note `⌘F`; Next / previous match `⌘G / ⇧⌘G`. The five keys inside the field stay
  undocumented: they are in the field’s own tooltips.

## 6. Decisions

Decided by the product owner (17 November 2026): no bare-Shift chords; not every binding gets a shortcut;
prefer the standard. K1 is scheduled after the find fixes.

Resolved by B1:

1. **Tabs:** `⌘1…⌘9` are gone; tabs cycle with `⌃Tab` / `⌃⇧Tab` and the strip. `⌘2`/`⌘3` keep the layout.
2. **Fit page:** a `View` item with no accelerator, plus a palette row; fit width keeps `⇧⌘0`.
3. **List:** 34 rows in `Shell`, `View`, `Editor`, `Page`; the find-field keys stay in the field's tooltips.

Still open, and deliberately not in B1 — **all three closed by P2 (see the status note at the top)**:

- **Export PDF:** `⌘P` (the universal “produce a document”) in place of `⇧⌘E`, or keep `⇧⌘E`.
- **Menu:** an `Edit → Find… / Find Next / Find Previous` group with the standard accelerators.
- **Recorded deviations from B1:** `⇧Esc` no longer closes the find (only `Esc` does); the two shifted-bracket
  tab bindings (`⌘⇧[` / `⌘⇧]`) are kept as shipped behaviour but `list: false`, because on a US layout the
  shifted key reports `{`/`}` and they never fire — the two discoverable tab pairs are `⌃Tab` / `⌃⇧Tab`.
