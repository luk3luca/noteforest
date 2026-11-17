# Keyboard shortcuts — inventory, defects and the catalogue

**Status:** audit, 17 November 2026. No code changed. Decisions for the product owner are at the end.
**Why now:** the release is close, the Settings list is the only place a user can discover a shortcut, and
nothing in the repository proves that list still matches a key that works.

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
| `⇧⌘E` | Export PDF… | menu only | ✅ | ✅ |
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
| `⌘F` | Find in note (no-op in a Markdown guest file) | App | ✅ | ❌ |
| `⌘G` / `⇧⌘G` | Next / previous match | App | ✅ | ❌ |
| `Esc` | Close the find and restore the selection | App | ❌ | ❌ |
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

Fix, when taken: one owner for `⇧1`/`⇧2`, and it bails on
`input, textarea, select, [contenteditable="true"]`. The global handler is the better owner because it also
works from the canvas header (the pager moves focus into the toolbar), which is why the duplicate should go,
not the global branch.

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
keys now do something else (`⌘⇧[`/`⌘⇧]` cycle tabs). `docs/ux-shell.md` still says plain Backspace merges a
block with the previous one (false since `6727388`) and offers `⌘[`/`⌘]` as an outdent alternative (not
implemented).

### S4-1 — glyph order and wording

The list mixes `⇧⌘F` with `⌘⇧L`/`⌘⇧K`, and writes `⌘⇧Enter` where the bubble writes `⌘⇧Return`. Apple’s order
is `⌃⌥⇧⌘` + key, which the majority of the app already uses (`⇧⌘E`, `⇧⌘N`, `⇧⌘O`, `⇧⌘T`, `⇧⌘W`, `⇧⌘F`).
One order, one spelling of Enter.

## 4. Proposal — one catalogue, and the list rendered from it

A pure module `renderer/src/lib/shortcuts.ts` (importable by `App`, `PageView`, `FindBar`; the menu keeps its
own Electron strings but a unit test asserts each `menu` entry equals the catalogue’s accelerator):

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

- `display(chord)` → `⇧⌘Z` (one order, `⌃⌥⇧⌘` + key).
- `matches(event, id)` → boolean; `App`, `PageView` and `FindBar` stop comparing `event.key` by hand and ask
  the catalogue. This is the part that makes drift impossible, not the list.
- `tipTapKeys(shortcut)` → `['Mod-Shift-k']` for the editor entries, generated from the same data so the
  keymap cannot disagree with the list.
- The Settings pane renders `shortcutsForGroup()`; the palette reads `label` + `display()`; the menu reads
  `menu`.

Tests that make it real:

1. unit — every `scope: 'global'` entry matches its chord and rejects near misses (extra shift, ctrl vs
   meta); no chord appears twice in the same scope; `display()` is stable.
2. unit — the menu template’s accelerators are exactly the catalogue’s `menu` values.
3. unit — `tipTapKeys` round-trips every editor entry.
4. UI — the rendered rows equal the catalogue (`count` and labels), the `⇧1`-in-the-find-field repro is a
   regression test, and a representative subset is pressed end-to-end (save, palette, find, layout, mode,
   sidebar, undo, tab switch).

Size: one batch (K1), roughly 5–6 h. It changes the handler shape in four files plus the list; no document,
layout, pagination or print code.

## 5. The list, proposed

Four groups, ~38 rows, one row per action (two chords joined where a pair is genuinely one verb):

- **Shell** — New note `⌘N`; New chapter `⇧⌘N`; Open note… `⌘O`; Open Markdown… `⇧⌘O`; Save `⌘S`;
  Export PDF… `⇧⌘E`; Close tab `⌘W`; Close window `⇧⌘W`; Reopen closed tab `⇧⌘T`; Previous / next tab
  `⇧⌘[ / ⇧⌘]`; Switch to tab `⌘1…⌘9` (`⌘2`/`⌘3` switch layout); Command palette `⌘K`; Settings `⌘,`;
  Toggle sidebar `⌘\`; Undo / Redo `⌘Z / ⇧⌘Z`.
- **View** — Continuous / Page `⌘2 / ⌘3`; Edit / Read `⌘E`; Zoom in / out `⌘+ / ⌘−`; Reset zoom / Fit width
  `⌘0 / ⇧⌘0`.
- **Editor** — Add child `⌃⏎`; Add sibling `⌥⏎`; Branch from selection `⇧⌘⏎`; Indent / outdent `⇥ / ⇧⇥`;
  Delete block `⌘⌫` (or `⌫` on a selected block); Collapse / expand `⌘.`; Focus branch `⇧⌘F`; Link `⇧⌘K`;
  Link as reference `⇧⌘L`; Previous / next block `⌘↑ / ⌘↓` *(Continuous, caret in a block)*; Move block
  `⌥↑ / ⌥↓` *(Continuous, editor focused)*.
- **Page** — Previous / next page `⌘↑ / ⌘↓` *(works from the header and the pager)*; Previous / next page on
  the canvas `⌥↑ / ⌥↓`; Fit page / fit width `⇧1 / ⇧2`; Open / edit the selected block `↵`; Clear selection
  `Esc`; Commit Page Edit `Esc / ⌘⏎`.
- **Find** — Find in note `⌘F`; Next / previous match `⌘G / ⇧⌘G`; Next / previous in the field `↵ / ⇧↵`;
  First / last match `Home / End`.

Two labels change: `Actual size` → `Reset zoom` (100 % in Continuous, fit width in Page — stated in the row’s
secondary text, not in the key column), and `⌘⇧L`/`⌘⇧K`/`⌘⇧Enter` → `⇧⌘L`/`⇧⌘K`/`⇧⌘⏎`.

## 6. Decisions for the product owner

1. **Fix S2-1 now or in K1?** It is a three-line guard plus a regression test. In K1 it rides the catalogue;
   now it would be a standalone mini-batch, against the one-batch-one-surface rule.
2. **K1 shape:** full catalogue + handlers ask it (recommended, drift becomes impossible), or list-only with
   a test that every listed chord exists somewhere (cheaper, still two copies).
3. **Native menu:** add Edit → Find…/Find Next/Find Previous and View → Continuous/Page/Edit/Read? (All
   renderer-owned accelerators, no behaviour change.)
4. **`⌘0` copy:** `Reset zoom` everywhere (recommended) or keep `Actual size` and accept that Page means fit
   width?
5. **Docs:** rewrite `docs/ux.md` §9 from the new list and fix the two `docs/ux-shell.md` rows in K1?
6. **Scope of the list:** all ~38 rows (recommended — the list is the only discovery surface for tab and page
   keys), or a curated subset with the rest left to the menu and the palette?
