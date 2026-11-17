# B1 — v1 defects: the Page anchor dot, the print-free page, and the shortcut catalogue

**Builder report.** Two parts, one worktree, one commit. Branch `t3/b1-defects`, based on `main` after
F4a/F4b.

---

## Summary

**Part A (Page).** The `⚠ anchor` text chip on a Page card is now a 6 px status dot in the card's
top-right corner: a real `<button>` with a 24 × 24 hit area, the short accessible name/tooltip
(`Lost anchor. Open document health to repair.` / `Ambiguous anchor. …`), and a click or Enter that opens
Document health on that anchor without selecting or opening the block behind it. Nothing about anchors
reaches the print compositor any more — the dot, the `data-fragment-anchor-warning` flag and the marker
text are gone from the print DOM and from the produced PDF, while every other Page↔print record (boxes,
cards, segments, edges, trunks, chrome, the missing-image placeholder and the defect chip) is unchanged
and still asserted equal. The bare-Shift `⇧1`/`⇧2` fit keys are deleted from `App.tsx` and
`PageView.tsx`, so the Page find field receives `!`, `"`, `@` again; `View → Fit page` (no accelerator,
`menu-fit-page`) and a `Fit page` palette row keep the verb reachable, and `⇧⌘0` still fits the width.

**Part B (keyboard).** One catalogue, `renderer/src/lib/shortcuts.ts`, is now the only place a chord is
written. `App`, `PageView`, `FindBar`, the TipTap keymap, the palette/context-menu hints, the control
tooltips and the native menu accelerators all read it, and the Settings shortcut list is rendered from
`shortcutsForList()`. The ratified subtractions are applied: `⇧1`/`⇧2` (Part A), `⌥↑`/`⌥↓` page
navigation, `⌘1…⌘9` tab digits, `Actual size` → `Reset zoom`, and the `⌘⇧` → `⇧⌘` glyph order. `⌘2`/`⌘3`
still switch the layout, `⇧⌘0` still fits the width, tabs still cycle with `⌃Tab`/`⌃⇧Tab`.

A defect the new test found and this batch fixes: pressing **Enter on the focused dot** used to be
swallowed by the card's own key handler (it selected the block and opened the continuous editor). The
card now ignores key events that originate on a control inside it, so the button activates and opens the
repair.

---

## Evidence — Part A

### The dot

- **UI (`tests/ui/m4c1-print-compositor.test.mjs`, case “prints the page without the anchor dot, Page Read
  keeps it”)**: one `[data-page-anchor-warning]` per warned fragment; `tagName === 'BUTTON'`; the visual
  span is `offsetWidth/offsetHeight === 6`; the button hit area is `≥ 24 × 24`; `position: absolute`; the
  accessible name and `title` are the short sentence; the dot's own text is empty; the page text contains
  neither `anchor` nor `⚠`.
- **Card box**: the card box equals the fragment box (width and height within 0.5 px), and the print
  comparison below proves the fragment box, the card HTML and every `data-fragment-*` attribute are
  identical with and without the dot.
- **Click**: `[data-health-dialog="true"]` opens with `data-health-row="anchor:broken-anchor"`, and
  `selectedBlockId` is unchanged. **Enter** on the focused dot opens the same repair (this is the case
  that exposed the swallowed-Enter defect above).
- **Evidence**: [page-anchor-dot.png](artifacts/b1-defects/page-anchor-dot.png).

### Defect chip + dot on one card

- **UI (same suite, case “keeps the dot and the defect chip on one card without overlap”)**: an A5 page
  with 46 mm margins and an unbreakable code line produces a real blocking `content-too-wide` defect on
  the same fragment that carries the broken anchor. Both markers render
  (`data-fragment-defect="true"`, `data-fragment-anchor-warning="true"`) and the chip's right edge is left
  of the dot's hit box (`defect.right <= dot.left + 0.5`).
- **Evidence**: [page-defect-and-dot.png](artifacts/b1-defects/page-defect-and-dot.png).

### Print and PDF carry nothing

- **Parity (`assertPrintParity`)**: unchanged for sheets, content boxes, edges/trunks, edge labels,
  header, footer, ghost and continues lists. Fragments are compared with a `withoutAnchor()` projection
  that strips only `data-fragment-anchor-warning` and the `anchor` field, and the case then asserts
  explicitly that every print fragment has no dot (`anchor === null`) and no flag. The contract is
  “print equals Page Read on everything except the anchor flag and the dot”.
- **Print host**: `0` nodes match `[data-page-anchor-warning]`, `0` match
  `[data-fragment-anchor-warning]`, no `anchor` text and no `⚠` in `textContent`.
- **Produced PDF**: the real export path (`window.noteforest.exportPdf` + job polling) writes
  [print-markers.pdf](artifacts/b1-defects/print-markers.pdf); `inspectPdfFile` reports one page, real
  text, `anchor` absent and `⚠` absent.
- **Evidence**: [printed-sheet-without-anchor.png](artifacts/b1-defects/printed-sheet-without-anchor.png).

### `⇧1`/`⇧2` removed, fits still reachable

- **Regression UI (`tests/ui/find-bar.test.mjs`, case “accepts shifted digit characters in the field on
  both surfaces (B1)”)**: Continuous `a` `!` `b` reads `a!b`; Page `a` `!` `b` reads `a!b`, `a` `@` `b`
  reads `a@b`, `a` `"` `b` reads `a"b`, and `pageFit` stays `width` throughout.
  **Evidence**: [page-find-shifted-digit.png](artifacts/b1-defects/page-find-shifted-digit.png).
- **Reachability UI (`tests/ui/m4b1-page-view.test.mjs`, case “reaches both fits without a key: the
  palette, and the View menu item”)**: the palette's `Fit page` row has no hint and switches
  `pageFit` to `page`; the `Fit width` row shows `⇧⌘0` and switches back to `width`; the `Reset zoom` row
  reads `Reset zoom` with `⌘0`; `dispatchMenuCommand('fit-page')` reaches `page` too.
- **Native menu UI (`tests/ui/v0-shell-frame.test.mjs`)**: `menu-fit-page` is clicked through the real
  application menu and sets `pageFit === 'page'`; `⇧⌘0` still fits the width.
- **Updated suites**: `m4b1-page-view` (two fit sequences), `m4b1b1-page-edit-overlay` (the typing guard
  now sets Fit page from the menu), `v0-shell-frame` (menu item) — all still assert the same fit result;
  `m4b1-page-view`'s fit-race case keeps its ordering regression with the fit command instead of `⇧2`.

---

## Evidence — Part B

### The module and the unit tests

`apps/desktop/src/renderer/src/lib/shortcuts.ts` (pure: no React, no DOM) exports `display`, `matches`,
`shortcutHint`, `tiptapKeys`, `shortcutsForList` and the `SHORTCUTS` table with the brief's
`Scope`/`Chord`/`Shortcut` shape plus three additive fields a real list needs: `row`/`rowLabel` (two ids
rendered as one row, e.g. `⌘Z / ⇧⌘Z`), `note` (a scope qualifier) and `Chord.glyph` (the list spells
`⌃Tab` while the indent row keeps `⇥`).

`apps/desktop/test/shortcuts.test.ts` (12 tests, all green) proves:

- every chord matches itself;
- near misses are rejected: a flipped Shift, dropped modifiers, and a swapped Command/Control for the
  chords that narrow with `ctrl` (so `⌃E` stays a caret key and `⌃↑` stays word navigation);
- `⌘=` and `⌘+` both zoom in (the plus is the shifted character, not a modifier);
- no chord repeats inside a scope (compared on the declared signature);
- `display()` is stable and every glyph order is `⌃⌥⇧⌘`;
- the native menu's accelerators equal the catalogue's `menu` values **exactly** (19 = 19, no duplicates),
  and `View → Fit page` exists with no accelerator;
- `tiptapKeys()` round-trips every editor entry (`Mod-Shift-Enter`, `Mod-Shift-h`, `Tab`,
  `Mod-Backspace`, …);
- the curated list: group order, `14 / 4 / 12 / 4` rows, each row resolved to real ids, each row's keys
  rebuilt from the catalogue, no `list: false` binding advertised, the exact 34 labels, and no `⇧1`,
  `⇧2`, `⌘1`…`⌘9` or `Actual size`;
- `shortcutHint` answers `⌘S`, `⇧⌘Z`, `Esc / ⌘⏎`, `⇧⌘F` and `undefined` for `fit-page`;
- an unknown id throws (`matches` can never silently answer nothing);
- **the source guard**: no `⌘⇧` literal in any `.ts`/`.tsx`/`.css` file under
  `apps/desktop/src/renderer/src` (the same scan runs in `ui-editor-shortcuts`, so both gates fail).

### The handlers ask it

`App.tsx`'s global handler is a sequence of `matches(event, id)` checks; no `event.key` comparison
remains. The ordering and every guard are kept: overlay-owned command channel (the palette's own `⌘K`
toggle included), `⌃Tab` before the modifier gate, Escape closing the find only when it is open,
`⌘G` only with a live find surface, the Page `⌘↑`/`⌘↓` pager/text-field exemptions, `⌘E` as Command-only,
the Page Edit carve-outs (local history for undo/redo, `⌘S` commits the overlay), the plain-text-input
exemption for undo/redo, and the Read-mode gate on the link-reference dialog.

`PageView` asks `page-clear-selection` and `page-open-block`; the Page Edit overlay asks
`page-commit` (`Esc` / `⌘⏎`); `FindBar` asks the seven `find-field-*` entries (`list: false`); the TipTap
keymap builds every app binding from `tiptapKeys`, and the palette, the block/tab/library context menus,
`SelectionToolbar`, `CanvasHeader`, `ViewControls`, `PagePosition`, `Sidebar`, `TabBar`, `FindBar` and the
workspace empty hint ask `shortcutHint`. `lib/editor-context-menu.ts` takes Cut/Copy/Paste/Select All
from the catalogue too (they are native responder actions, catalogued with `list: false`).

### The Settings list

`SettingsDialog` renders `shortcutsForList()`. **UI (`tests/ui/ui-editor-shortcuts.test.mjs`, 6 tests):**
the Help → Keyboard shortcuts item opens Settings on Editor; the rendered groups, labels, keys and notes
are compared row by row with the live catalogue through the `__noteforestTest.shortcuts()` bridge (34
rows, `Shell / View / Editor / Page`); `⌘0` reads `Reset zoom`; the Page row is `⌘↑ / ⌘↓`; the block row
carries its `Continuous, caret in a block` note; no `kbd` contains `⌘⇧`, `⇧1`, `⇧2` or a tab digit; the
filter matches labels, keys **and** notes (`focus` → 1 row, `⌘s` → 1, `PAGE` → 3 across View and Page,
`pager` → the note only), the empty state, the clear action and Escape-clears-the-query behaviour are
unchanged. **Evidence**: [settings-shortcuts.png](artifacts/b1-defects/settings-shortcuts.png).

The palette's hints are asserted against the catalogue in the same suite (a new case): `⌘S`, `⌘Z`, `⇧⌘Z`,
`⇧⌘L`, `⌘2`, `⌘3`, `⌘0`, `⇧⌘0`, and `Fit page` with none.

---

## Files changed

**Source**

- `apps/desktop/src/renderer/src/lib/shortcuts.ts` (new) — the catalogue.
- `apps/desktop/src/renderer/src/App.tsx` — catalogue-driven keydown, `⇧1`/`⇧2` and the tab digits gone,
  `shortcuts()` test bridge.
- `apps/desktop/src/renderer/src/page/PageView.tsx` — `AnchorWarningDot`, removed `⇧1`/`⇧2` and `⌥↑`/`⌥↓`,
  page keys from the catalogue, the card ignores keys from its own controls.
- `apps/desktop/src/renderer/src/print/PrintDocument.tsx` — no anchor marker.
- `apps/desktop/src/renderer/src/print/print.css` — dropped the anchor badge skin.
- `apps/desktop/src/renderer/src/styles.css` — the dot, its hit area, the defect-chip shift and the
  `nf-shortcut-note` style; the anchor badge rule removed.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` — list from the catalogue, filter over
  labels/keys/notes.
- `apps/desktop/src/renderer/src/shell/FindBar.tsx` — field keys and tooltips from the catalogue.
- `apps/desktop/src/renderer/src/shell/{CanvasHeader,ViewControls,PagePosition,Sidebar,Toolbar,TabBar,Workspace}.tsx`
  — chord glyphs from `shortcutHint`.
- `apps/desktop/src/renderer/src/editor/keymap.ts` — TipTap keys from `tiptapKeys`.
- `apps/desktop/src/renderer/src/editor/{SelectionToolbar,highlight-mark}.ts(x)` and
  `src/renderer/src/lib/highlight.ts` — `⇧⌘` order, hints from the catalogue.
- `apps/desktop/src/renderer/src/lib/editor-context-menu.ts` — native text hints from the catalogue.
- `apps/desktop/src/renderer/src/actions.ts` — every `shortcut` from `shortcutHint`, `Reset zoom`,
  `Fit page` palette row, `fit-page` menu command.
- `apps/desktop/src/renderer/src/global.d.ts` — `shortcuts` on the test bridge.
- `apps/desktop/src/shared/api.ts` — `fit-page` in `MenuCommand`.
- `apps/desktop/src/main/menu-template.ts` — `View → Fit page` (no accelerator), `Reset zoom`.

**Tests**

- `apps/desktop/test/shortcuts.test.ts` (new).
- `apps/desktop/test/copy-cd.test.ts`, `apps/desktop/test/dialog-copy.test.ts` — menu labels
  (`Reset zoom`, `Fit page`, `menu-fit-page`) and the removed shortcut rows.
- `tests/ui/m4c1-print-compositor.test.mjs` — parity contract + the dot, the defect coexistence, the
  print host and the produced PDF.
- `tests/ui/find-bar.test.mjs` — the shifted-character regression.
- `tests/ui/m4b1-page-view.test.mjs`, `tests/ui/m4b1b1-page-edit-overlay.test.mjs`,
  `tests/ui/v0-shell-frame.test.mjs` — fits through the menu/palette.
- `tests/ui/ui-editor-shortcuts.test.mjs` — the catalogue-backed list, the palette hints, the glyph guard.
- `tests/ui/{library-surface,v0-shell-frame,ui-overlay-command-gate}.test.mjs`,
  `tests/e2e/m2-editor.test.mjs`, `tests/visual/m2-screenshots.test.mjs` — tab digits and gated commands
  moved to supported paths.

---

## Checks

| Check | Result | Time |
|---|---|---|
| `npx vitest run` (168 files) | 1717 passed | 7.4 s |
| `node tests/ui/run.mjs --group page --concurrency 2` (20 suites) | 20/20 on the final four runs (see the note below) | 182 s |
| `node tests/ui/run.mjs --group shell --concurrency 2` (23 suites) | 23/23 on every run | 229 s |
| `node tests/ui/run.mjs --group settings --concurrency 2` (12 suites) | 12/12 | 109.0 s |
| `node tests/ui/run.mjs --group anchors --concurrency 2` (14 suites) | 14/14 | 102.7 s |
| `node tests/ui/run.mjs --group images --concurrency 2` (5 suites) | 5/5 | 50.0 s |
| `node --test tests/ui/m4c1-print-compositor.test.mjs` | 7/7 | 16.1 s |
| `node --test tests/ui/ui-editor-shortcuts.test.mjs` | 6/6 | 12.1 s |
| `node --test tests/ui/page-scroll.test.mjs` | 8/8, five consecutive standalone runs | 16.8 s each |
| `node --test tests/ui/m4b1b1-page-edit-overlay.test.mjs` | 10/10, three standalone runs | 18.5 s each |
| `npm run verify:fast` | exit 0 (boundaries 288 files, typecheck, 1717 unit, e2e 16/16) | 45.8 s (e2e) |

**Intermittents observed, recorded.** Two pool runs at `--concurrency 2` failed one suite each
(`m4b1b1-page-edit-overlay` once, `page-scroll` twice) while both pass standalone repeatedly (10/10 × 3
and 8/8 × 5) and the four following pool runs were 20/20. The `m4b1b1` failure was a silently lost
keystroke in its reload case — that case typed with raw `page.keyboard.type` instead of the suite's
`typeInOverlay` helper, which asserts the text landed; it now uses the helper, so a lost keystroke fails
loudly instead of looking like a dropped commit. The `page-scroll` failures produced no reproducible
assertion; the machine's load average was ~2.5–3 during the runs and the repo's own gate parameter is
`--concurrency 4` on an idle 10-core machine. No assertion in either suite touches a chord this batch
changed.

`npm run verify` was **not** run (brief).

---

## Acceptance criteria

**Part A**

| Criterion | Verdict |
|---|---|
| 6 px dot top-right for every warned fragment; no text covered; no `⚠ anchor` chip | pass |
| Tooltip opens, accessible name is the short sentence, click/Enter opens Health on that anchor without selecting/opening the block | pass |
| A card with a defect **and** an anchor warning shows both without overlap | pass |
| Print DOM and produced PDF carry no anchor marker/attribute/text; every other parity assertion unchanged | pass |
| Page `⌘F` + `a` + `⇧1` + `b` reads `a!b` (also `⌘F` in Continuous); `⇧1`/`⇧2` no longer fit; `View → Fit page` + palette reach both fits; page geometry unchanged | pass |

**Part B**

| Criterion | Verdict |
|---|---|
| One catalogue; `App`, `PageView`, `FindBar`, the keymap, the palette read it; no hand-written chord comparison | pass |
| Settings list rendered from it; every row a real binding; groups/rows as specified; filter and empty state unchanged | pass |
| Removals: `⌥↑`/`⌥↓` page, `⌘1…⌘9`, `⇧1`/`⇧2`; `⌘2`/`⌘3` still switch the layout; `⇧⌘0` still fits the width; `⌃Tab`/`⌃⇧Tab` cycle tabs | pass |
| `⌘0` reads `Reset zoom` in menu, palette, list and control | pass |
| No `⌘⇧` literal remains; every displayed chord is `⌃⌥⇧⌘` | pass |
| Menu accelerators equal the catalogue exactly; a renamed binding fails a unit test | pass |

---

## Deviations, recorded (not silent)

1. **`⌃⇧Tab` instead of the brief's `⇧⌃Tab`.** B4 writes `⇧⌃Tab`; the stated rule and the acceptance
   criterion are “Apple order `⌃⌥⇧⌘`”, which puts `⌃` before `⇧`. The list, the display helper and the
   guard all use `⌃⇧Tab`. One glyph, one rule.
2. **`⏎` everywhere.** The brief writes `↵` for the Page open key and `⏎` for `⌃⏎`; it is the same key,
   so the catalogue has one glyph.
3. **`⌘⇧[` / `⌘⇧]` are catalogued but still dead on a US layout.** They were already unreachable
   (`event.key` is `{`/`}` with Shift on macOS), and the catalogue reproduces the shipped matcher exactly
   instead of repairing it. Removing them would have been a behaviour change too, so the audit's “keep”
   stands.
4. **`⇧Esc` no longer closes the find.** Chords are strict about Shift; the shipped matcher ignored it for
   Escape. No path or test relied on `⇧Esc`.
5. **Two suites used `⌘1` as a tab switch** (`tests/ui/library-surface`, `tests/ui/v0-shell-frame`,
   `tests/e2e/m2-editor`, plus the gated-command assertions in `tests/ui/ui-overlay-command-gate`). The
   removal is ratified, so they now use the tab strip or `⌃Tab`, and the gate assertions use `⌘2`/`⌘W`.
   No product need for the digits surfaced: the strip, `⌃Tab` and the palette cover it.
6. **A product defect fixed on the way:** Enter on the focused dot was consumed by the card's key
   handler. Fixed with one guard (`event.target !== event.currentTarget`) so any control inside a card
   owns its keys.
7. **Not converted, on purpose:** the `Saves automatically. ⌘S saves now.` prose (pinned A/B copy), the
   Markdown guest-file titles and the Page Edit hint (`Esc or ⌘⏎ commits`) are already in Apple order and
   are not in the brief's conversion list; the copy guard pins the first three verbatim.
8. **The glyph guard lives in the unit test** (runs in `verify:fast`) and again in `ui-editor-shortcuts`
   as the brief asks; both scan the same tree with the same rule.

---

## Risks

- **The `⇧⌘[`/`⇧⌘]` pair** is documented as “kept” but cannot fire on the primary layout. A future slice
  should either fix the matcher by code or drop the pair; nothing depends on it today.
- **`⌘+` matching** accepts both `+` and `=` and ignores Shift for that chord. It is tested, but it is
  the one chord whose modifier rule is a character rule.
- **Fit page has no key at all.** Keyboard users must use the menu or the palette. That is the product
  decision; the palette row is the fast path.
- **The defect + dot case** needs a narrow page (A5, 46 mm margins) and an unbreakable code line to force a
  blocking defect. It is a real layout defect, not a mocked attribute, but it is the one case that depends
  on measurement rather than on a fixture flag.
- **Pool intermittents** (recorded above): `m4b1b1` now fails loudly instead of silently when a keystroke
  is lost; `page-scroll` failed twice in a loaded pool and never standalone. Watch them on the orchestrator's
  full run at the documented concurrency.
- **`docs/design/shortcuts.md`** still describes the audit (four declaration sites, the pre-B1 list). It is
  a design document, not a product input for this brief; the catalogue's header comment carries the
  conventions. A docs pass should point §1/§5 at `lib/shortcuts.ts`.

## Next step

Product-owner visual/VoiceOver pass over the dot (hover, focus ring, 6 px at 60 % density) and over the
`⌃`/`⇧`/`⌘` glyph rendering in the Settings list; then the Sentinel review of this diff, then merge.
