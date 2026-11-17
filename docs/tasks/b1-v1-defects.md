# B1 — v1 defects: the Page anchor dot, the print-free page, and the shortcut catalogue

**Role:** Builder
**Milestone:** v1 defects (pre-release)
**Base:** `main` at launch (F4a/F4b merged).
**Worktree:** created by the Orchestrator, branch `t3/b1-defects`.
**Timebox:** 10 hours.

Two parts, one worktree, one commit. They are separate defects with separate evidence; do not mix the
changes and do not let one part's tests decide the other.

- **Part A** — Page: the anchor marker stops covering the text, the PDF carries nothing about anchors, and
  `Page` stops swallowing `⇧1`/`⇧2` in text fields.
- **Part B** — the keyboard: one catalogue the handlers ask, the list rendered from it, and the subtractions
  the product owner ratified.

---

# Part A — Page defects

## A0. Context

The anchor warning on a Page card is a full `⚠ anchor` text chip, absolutely positioned at the card's
**bottom-right** (`page/PageView.tsx` `AnchorWarningBadge`, `styles.css` `.nf-page-badge` /
`.nf-page-anchor-badge`). On a one-line card the corner **is** the text line; the chip has
`pointer-events: none`, so its `title` can never open; it is not focusable; and the print compositor renders
the same element, so the chip is in the PDF.

Separately, `App.tsx` handles `⇧1`/`⇧2` in Page **before any target check** and calls `preventDefault()`, so
any non-modal text field in Page cannot receive `!`, `"`, `£`, `%`, `/`, `(` — reproduced: `⌘F`, `a`, `⇧1`,
`b` reads `ab` in Page and `a!b` in Continuous. `PageView` has a duplicate of the same keys with a
contenteditable-only guard.

**Product decisions (17 November 2026):** a 6 px status dot in the card's top-right, with a real tooltip and
a click that opens Document health on that anchor; **nothing about broken anchors appears in the PDF**; and
**no bare-Shift chord** in a writing app, so `⇧1`/`⇧2` are removed, not guarded.

## A1. The dot

Replace `AnchorWarningBadge` in `page/PageView.tsx` with a `<button type="button">`:

- visual: a **6 px circle** in the existing `--nf-page-warning-*` family, the same shape as the sidebar
  activity bar's needs-repair dot (`.nf-activity-dot`); no text, no border;
- position: centred 4 px from the card's top-right corner, inside a **24 × 24 hit area** (the hit box may
  overflow the card by ~5 px into the 18 px gap; the card box itself must not move);
- `aria-label` and `title`: `Lost anchor. Open document health to repair.` or
  `Ambiguous anchor. Open document health to repair.` (state from the first warning);
- click and keyboard (it is a button): `stopPropagation`, then
  `openDocumentHealth({ anchorId: warnings[0].anchorId })`, which opens Health on that anchor's row/modal;
  stop the double-click propagation too, so the card does not open its editor behind the dialog;
- keep `data-page-anchor-warning` on the dot and `data-fragment-anchor-warning` on the fragment.

**Coexistence with the defect badge.** `.nf-page-defect-badge` is a text chip at `top: 2px; right: 2px`. When
the fragment carries `data-fragment-anchor-warning="true"`, shift the defect chip left so the dot owns the
corner (CSS rule on the fragment selector; no measurement change).

## A2. Print carries nothing

Remove `AnchorWarningBadge` and the `data-fragment-anchor-warning` attribute from `print/PrintDocument.tsx`.
Nothing else in the print model changes; the missing-image placeholder, the defect badge and every other
parity stay exactly as they are.

Update `tests/ui/m4c1-print-compositor.test.mjs`: its fragment snapshots compare the anchor field and the
`data-fragment-` attributes, so the contract becomes "print equals Page Read on everything except the anchor
flag and the dot". Update the case title (`prints the page without the anchor dot, Page Read keeps it`) and
add:

- Page Read renders one dot per warned fragment; the dot's box is 6 px inside a ≥ 24 px hit area; its
  accessible name is the short sentence; no `⚠ anchor` text anywhere in the page;
- clicking the dot opens Document health on that anchor's issue (the existing `health-issue` dialog) and the
  Page selection does not change behind it;
- the print host contains no `[data-page-anchor-warning]`, no `data-fragment-anchor-warning` and no marker
  text; the produced PDF text contains no marker string;
- everything else in `assertPrintParity` still passes unchanged.

## A3. Remove `⇧1`/`⇧2`

- Delete the branch in `App.tsx` (`layout === 'page' && shiftKey ... Digit1/Digit2`).
- Delete the `⇧1`/`⇧2` branch in `PageView.tsx` `onRootKeyDown` (the `setFit` helper may become unused —
  remove it if so).
- Fit page stays reachable: add `View → Fit page` with **no accelerator** (`fitActiveLayout('fit-page')`,
  the existing command) in `main/menu-template.ts`, and a `Fit page` entry in the palette (no shortcut
  hint, `withDocument`). Fit width keeps `⇧⌘0` and its menu item.
- Regression test: in Page, `⌘F`, type `a`, press `⇧1`, type `b` → the field reads `a!b`; the same in
  Continuous. Also `⇧2`.
- Update the existing suites that press `Shift+1`/`Shift+2` to set the fit (`m4b1-page-view`,
  `m4b1b1-page-edit-overlay`, `v0-shell-frame`): they must reach the same state through the menu command or
  the palette, and still assert the same fit result.

---

# Part B — the shortcut catalogue

## B0. Context and rules

`docs/design/shortcuts.md` is the audit: four declaration sites (`App.tsx`, the TipTap keymap,
`PageView`, `menu-template.ts`), three promise sites (`SettingsDialog.tsx` `SHORTCUTS`, `actions.ts`, the
`title=` strings), no test tying them, two user-facing defects (the `⇧1`/`⇧2` one is Part A; the wrong Page
row is fixed here) and 18 bindings missing from the list.

Rules ratified by the product owner: no bare-Shift chord; not every binding gets a shortcut (this batch adds
none); prefer the standard where one exists. The pass is **subtractive**.

## B1. The module

`apps/desktop/src/renderer/src/lib/shortcuts.ts` (pure, no React, no DOM):

```ts
type Scope = 'global' | 'editor' | 'page' | 'find';
interface Chord { key: string; mod?: boolean; shift?: boolean; alt?: boolean; ctrl?: boolean }
interface Shortcut {
  id: string;
  label: string;
  group: 'Shell' | 'View' | 'Editor' | 'Page';
  scope: Scope;
  chords: Chord[];        // normally one
  menu?: string;          // the Electron accelerator, when the native menu owns it
  list?: boolean;         // false for input-local behaviour we do not advertise
}
```

- `display(chord)` → Apple order `⌃⌥⇧⌘` + key (`⇧⌘Z`, `⌥↑`, `⌃⏎`).
- `matches(event, id)` → boolean, used by `App`, `PageView` and `FindBar` so no handler compares `event.key`
  by hand any more.
- `tiptapKeys(id)` → `['Mod-Shift-k']`-style strings, generated from the same chords; the keymap imports them
  (including the highlighter's `Mod-Shift-h`).
- `shortcutsForList()` → the curated rows the Settings page renders, in group order.
- `shortcutHint(id)` → the display string for a palette row, or `undefined`.

Tests: every chord matches itself and rejects a near miss (extra shift, ctrl vs meta); no chord repeats
inside a scope; `display()` is stable; the menu template's accelerators equal every `menu` value exactly;
`tiptapKeys` round-trips every editor entry.

## B2. The handlers ask it

- `App.tsx`: replace the hand-written global matcher with `matches(event, id)` per command. Keep the
  ordering/guard logic (overlay owner, Page Edit carve-outs, plain-text-input exemptions, find-bar Escape,
  `⌘G` only with a live find surface, the Page find/page-edit focus rules). Behaviour must not change except
  the removals below.
- `PageView.tsx`: the page-local keys (`↵`, `Esc`) ask the catalogue with `scope: 'page'`.
- `FindBar.tsx`: the field keys (`↵`/`⇧↵`, `↑`/`↓`, `Home`/`End`, `Esc`) ask the catalogue with
  `scope: 'find'`; they stay out of the list (`list: false`).
- `editor/keymap.ts` and `editor/highlight-mark.ts`: the TipTap strings come from `tiptapKeys`, not literals.
- `actions.ts`: every palette/context-menu `shortcut` string comes from `shortcutHint(id)`; no hand-typed
  chord literals remain.
- Hardcoded chord glyphs in `title=`/`aria-keyshortcuts` strings (`SelectionToolbar`, `CanvasHeader`,
  `ViewControls`, `PagePosition`, `Sidebar`, `TabBar`, `FindBar`, `Workspace` empty hint) read
  `shortcutHint(id)` where the control has a command, or are corrected to the new order.

## B3. The subtractions (behaviour changes)

| Today | Change | Why |
|---|---|---|
| `⇧1` / `⇧2` fit page / fit width | gone (Part A) | bare-Shift printable keys |
| `⌥↑` / `⌥↓` previous / next page on the Page canvas | removed; `⌘↑`/`⌘↓` is the one page pair | duplicate |
| `⌘1…⌘9` switch to tab N | removed; tabs are `⌃Tab` / `⇧⌃Tab`, the strip and the palette | collides with `⌘2`/`⌘3`, tabs 2–3 unreachable |
| `Actual size` for `⌘0` | `Reset zoom` everywhere (menu, palette, list, control title) | 100 % is fit width in Page |
| `⌘⇧L`, `⌘⇧K`, `⌘⇧H`, `⌘⇧⏎` | `⇧⌘L`, `⇧⌘K`, `⇧⌘H`, `⇧⌘⏎` | Apple order |

Keep `⌘2`/`⌘3` for the layout, `⇧⌘0` for fit width, and every other key as shipped. No new chords.

## B4. The Settings list

`SettingsDialog.tsx` renders the list from `shortcutsForList()` (filter and empty state unchanged; the
filter now matches the catalogue's labels and displays). Groups and rows:

- **Shell** — New note `⌘N`; New chapter `⇧⌘N`; Open note… `⌘O`; Save `⌘S`; Export PDF… `⇧⌘E`; Close tab
  `⌘W`; Reopen closed tab `⇧⌘T`; Next / previous tab `⌃Tab / ⇧⌃Tab`; Command palette `⌘K`; Find in note
  `⌘F`; Next / previous match `⌘G / ⇧⌘G`; Settings `⌘,`; Toggle sidebar `⌘\`; Undo / Redo `⌘Z / ⇧⌘Z`.
- **View** — Continuous / Page `⌘2 / ⌘3`; Edit / Read `⌘E`; Zoom in / out `⌘+ / ⌘−`; Reset zoom `⌘0`.
- **Editor** — Add child `⌃⏎`; Add sibling `⌥⏎`; Branch from selection `⇧⌘⏎`; Indent / outdent `⇥ / ⇧⇥`;
  Delete block `⌘⌫` (or `⌫` on a selected block); Collapse / expand `⌘.`; Focus branch `⇧⌘F`; Link `⇧⌘K`;
  Link as reference `⇧⌘L`; Highlight `⇧⌘H`; Previous / next block `⌘↑ / ⌘↓` *(Continuous, caret in a
  block)*; Move block `⌥↑ / ⌥↓` *(Continuous)*.
- **Page** — Previous / next page `⌘↑ / ⌘↓` *(works from the header and the pager)*; Open / edit the
  selected block `↵`; Clear selection `Esc`; Commit Page Edit `Esc / ⌘⏎`.

The find-field keys, the tab digits (gone) and fit page/width stay out of the list. The footer stays
"Shortcuts are fixed."

Update `tests/ui/ui-editor-shortcuts.test.mjs`: groups, row count, every filtered label set it pins, and the
Help → Editor flow. Add: the list equals the catalogue (count and labels), and a source guard fails if a
`⌘⇧` literal remains anywhere in `apps/desktop/src/renderer/src` (the display order is `⇧⌘`).

## B5. Menu

- `View → Fit page` (Part A), no accelerator.
- No other menu item is added. `Edit → Find` and `⌘P` for Export are **not** in this batch (product
  decision later).

---

## Out of scope

- The highlighter's behaviour, tones or colours (shipped); the find; the paginator, page model, chrome, seam,
  zoom, Page Edit geometry.
- Document health itself (rows, modal, repairs); Continuous's chrome-row anchor chip.
- Settings → Data, `⌘P`, `Edit → Find`, per-tone keys, MS-9 configurable shortcuts.
- Any new shortcut not already shipped.

## Files

Read: `docs/design/shortcuts.md`, `docs/tasks/page-anchor-dot.md` (superseded by this brief),
`page/PageView.tsx`, `print/PrintDocument.tsx`, `styles.css`, `App.tsx`, `editor/keymap.ts`,
`editor/highlight-mark.ts`, `shell/FindBar.tsx`, `shell/SettingsDialog.tsx`, `actions.ts`,
`main/menu-template.ts`, `shell/SelectionToolbar.tsx`, `shell/CanvasHeader.tsx`, `shell/ViewControls.tsx`,
`shell/PagePosition.tsx`, `shell/Sidebar.tsx`, `shell/TabBar.tsx`, `shell/Workspace.tsx`, the suites
`m4c1-print-compositor`, `m4b1-page-view`, `m4b1b1-page-edit-overlay`, `v0-shell-frame`,
`ui-editor-shortcuts`, `find-bar`.

Expected to touch: the files above plus `lib/shortcuts.ts` (new), its unit tests, the report
`docs/reports/b1-defects.md`.

## Acceptance criteria

**Part A**

- [ ] Page Read shows a 6 px dot at the card's top-right for every warned fragment; no text is covered and no
      `⚠ anchor` chip exists.
- [ ] The tooltip opens, the accessible name is the short sentence, and a click (or Enter) opens Document
      health on that anchor without selecting/opening the block behind it.
- [ ] A card with both a defect and an anchor warning shows both, without overlap.
- [ ] The print DOM and the produced PDF contain no anchor marker, no anchor attribute and no marker text;
      every other parity assertion is unchanged.
- [ ] In Page, `⌘F` + `a` + `⇧1` + `b` reads `a!b`; `⇧1`/`⇧2` no longer fit; `View → Fit page` and the
      palette still reach both fits; Page geometry (page count, segments, fragment/card box) is unchanged.

**Part B**

- [ ] One catalogue module; `App`, `PageView`, `FindBar`, the keymap and the palette read it, and no handler
      compares a chord by hand any more.
- [ ] The Settings list is rendered from it; every row is a real binding; groups and rows as above; the
      search filter still works and the empty state is unchanged.
- [ ] Removals: `⌥↑`/`⌥↓` page, `⌘1…⌘9` tabs, `⇧1`/`⇧2`; `⌘2`/`⌘3` still switch the layout; `⇧⌘0` still
      fits the width; tabs still cycle with `⌃Tab` / `⇧⌃Tab`.
- [ ] `⌘0` reads `Reset zoom` in the menu, the palette, the list and the control.
- [ ] No `⌘⇧` literal remains; every displayed chord is `⌃⌥⇧⌘` order.
- [ ] The menu accelerators equal the catalogue exactly; a renamed binding fails a test, not the list.

## Tests and evidence

- Unit: catalogue (chords, near misses, uniqueness, display order, tipTap keys, menu equality, list
  rendering), the anchor dot's component logic if any, the print-free path, the `⇧1`-in-field regression.
- UI: the m4c1 parity case rewritten; the dot (dot box, hit area, tooltip, click → health, no text covered,
  defect + dot); the Settings list; Page find typing `!`; fit via menu/palette; tab cycling.
- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group page --concurrency 2`, `--group shell`,
  `node --test tests/ui/m4c1-print-compositor.test.mjs`, `node tests/ui/ui-editor-shortcuts.test.mjs`.
- End of task: `npm run verify:fast`. Do not run `npm run verify`.
- Screenshots in `artifacts/b1-defects/`: the dot on a card, the card with defect + dot, a printed sheet with
  no marker, the Settings shortcut list, and the Page find field accepting `!`.

## Stop and ask

- if any other suite asserts the `⚠ anchor` text, the print anchor attribute, a tab digit, `⌥↑`/`⌥↓` page
  navigation or `⇧1`/`⇧2` in a way the removals break — record which and do not bend the rule silently;
- if the 24 px hit area cannot fit without moving the card or stealing clicks from a neighbouring card;
- if the catalogue cannot express a binding without changing behaviour (say which);
- if removing `⌘1…⌘9` uncovers a product need (e.g. a test that exists because a user flow depends on it).

## Report format

Summary, **two separate evidence sections (A and B)**, files changed, checks with timings, pass/fail per
criterion, risks, next step. One commit; do not merge.
