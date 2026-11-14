# Editor surfaces and structure — context menus, Page formula, mode parity, indent

**Role:** Implementer / Builder
**Milestone:** Editor surfaces & structure (A+D)
**Base:** `main` head at delegation
**Worktree:** created by the delegate; do not work in the main checkout
**Design:** `docs/design/indent-and-drag.md`; `docs/adr/0007-editor-layouts-and-modes.md`
**Timebox:** 2 days

## Context

The product owner approved one contextual menu model, a readable Page formula editor, mode parity
across Continuous/Page, and Indent/Outdent as deterministic structural commands. Text editing has
Cut/Copy/Paste/Select All but the block context menu currently intercepts text targets; the formula
source closes on right-click. Page Edit constrains the formula panel. Switching Continuous Edit →
Page forces Read. Indent is missing while Outdent exists.

## 1. Context menus

There is **one menu component** with two entry points, chosen by the right-click target:

### Prose text (paragraph, list, quote)

- Prepend the text group: **Cut, Copy, Paste, Select All** (shortcuts shown).
- Then the **complete block menu** as today (Edit block, Insert image…, image actions, Insert
  table…, Add child/sibling, Structure, Position incl. **Indent**, Anchors/References, Delete).
- This is the “put everything in” variant the product owner asked for; a later pass may trim or
  move groups into submenus.

### Card / chrome (padding, header, gutter, trunk, image, formula render, table chrome)

- The block menu **without** the text group.

### Table cell

- Text group + table commands (row/column insert/delete, alignment, Copy as Markdown) as a compact
  group; **no** block structure actions. Insert image/table are invalid in a cell and must not
  appear. (The table toolbar remains.)

### Code block content, code-language input, formula source textarea

- Text group only. No Insert image/table, no structural actions.

### Read mode

- On text: **Copy, Select All** only (no Cut/Paste/insert/structure).
- On card: the block menu gated as today; no mutations.

### Rules and behavior

- Right-click inside any editable text input/textarea/contenteditable opens the text-capable menu,
  not the block menu.
- The menu must **not blur-commit or close the formula source**; the source stays open with its
  value and selection. Opening/closing the menu never mutates the document.
- Right-click must not collapse the selection; text actions apply to the control that was
  right-clicked (restore focus/selection before executing). Cut/Copy disabled when there is no
  selection; Paste only on editable targets.
- Do not show two menus (native + custom). The existing main-process `attachTextContextMenu` remains
  for non-editor inputs (Settings, dialogs); inside the editor the custom menu owns the event. Add
  a UI assertion that only one menu is visible.
- Keyboard: Escape closes and focus returns to the text control; menu items are reachable with the
  existing focus trap.
- The **Indent** entry is added to Position in the same menu builder.

## 2. Page Edit formula editor

- In the Page Edit overlay, the in-place formula source editor must **expand** so all controls are
  usable without horizontal scrolling: the action row (Branch from term, Copy formula, Inline/Block)
  and the preview must be fully visible; no clipped buttons; no horizontal scrollbar.
- It may overflow the block/page bounds as editor chrome (the overlay already is chrome), but it
  must stay anchored to the formula and inside the viewport where possible; flip/position above or
  below as needed.
- Vertical scrolling remains only for a block that genuinely spans pages; the formula panel itself
  must not introduce a scrollbar.
- Esc / ⌘↵ / Done commit once, one undo entry; Read never mounts it.

## 3. Mode parity across layouts

- Switching Continuous ⇄ Page **preserves the interaction mode**. Continuous Edit → Page stays
  Edit; Continuous Read → Page stays Read; Page Edit → Continuous stays Edit.
- A Page Edit switch commits any open Page Edit overlay first (existing rule); a rejected commit
  keeps the overlay and does not switch.
- Page Edit does **not** auto-open an overlay. The selected block stays selected; Enter/click opens
  it, as today.
- Page Read remains exact and read-only; Page Edit remains opt-in per block.
- Session restore keeps the stored mode; no new view state fields.
- Update the relevant view-control defaults and tests; `docs/reviews/settings-inventory` AP-8 will
  be updated by the Orchestrator, not in this task.

## 4. Indent and outdent

Follow `docs/design/indent-and-drag.md`.

- **Indent** (`⇥` on a selected block, Position menu, palette): the block and its subtree become the
  **last child of the previous primary sibling**. Disabled with a reason when there is no previous
  sibling. Top-level indent leaves the chapter's top-level list; the non-empty chapter rule still
  applies.
- **Outdent** (`⇧⇥`) keeps its current destination (after the parent) and gets the same anchor rule.
- The keybinding fires only when a block is selected and text editing is not active; inside text,
  Tab keeps its native/table behavior.
- **Anchor rule**: a same-parent reorder (Move up/down) keeps the anchored primary edge and its
  anchor. A reparent (Indent, Outdent, drag later) converts the old anchored primary edge to a
  **reference edge** with the same source/anchor (dashed cite) and creates a fresh primary edge at
  the destination; toast “Kept as reference from «source»”; one undo restores both. No silent
  anchor loss. Reference edges are untouched.
- Use the existing `block.move` command; do not invent a second move path. Cycle and chapter checks
  stay in core.
- Tests: unit core move/indent/outdent including anchored same-parent reorder vs reparent and undo;
  runtime/menu state; UI Tab/Shift+Tab with a selected block, first-child disabled, one undo.

## Out of scope

- Drag implementation (phase 2 design only; no drag code).
- Table toolbar redesign (F8).
- Code colors / Page syntax highlighting (B).
- Identity/copy-id and R1/R2/R3 (C).
- Document health / activity bar.
- Schema, settingsVersion, Page/PDF layout, export, showcase.
- Full `npm run verify` (the Orchestrator runs it at UI concurrency 4).

## Acceptance

- [ ] Prose right-click shows text group + full block menu; card shows block menu; cell shows text +
      table commands; code/formula inputs show text only; Read shows Copy/Select All.
- [ ] Formula source stays open on right-click; text actions work with selection preserved; one
      menu only; Escape restores focus.
- [ ] Page Edit formula panel expands with all controls visible and no horizontal scroll.
- [ ] Layout switch preserves Edit/Read; Page Edit does not auto-open; session restore works.
- [ ] Indent/outdent deterministic, menu + keybinding + palette; anchored reparent becomes a
      reference edge; same-parent reorder preserves the anchor; undo works.
- [ ] No schema/settingsVersion/Page/PDF/export/showcase change; no fixed sleeps/native dialogs;
      existing assertions updated, none weakened.

## Evidence and report

- Targeted unit/UI; one `npm run verify:fast`; new UI suite for the context menus and the affected
  Page Edit / mode / special-text suites at concurrency ≤ 3.
- Screenshots in `artifacts/editor-surfaces/`: prose menu, card menu, cell menu, formula source menu,
  expanded Page formula panel, Page Edit after mode parity, indent result.
- `docs/reports/editor-surfaces-structure.md`: per-area summary, files, checks with timings,
  PASS/FAIL, risks, next step.
- One commit; report the worktree, branch, and head SHA. Do not merge or push.
