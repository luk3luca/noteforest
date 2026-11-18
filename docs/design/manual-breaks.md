# Manual breaks — the cut, the control, the list

**Status:** design draft, 16 November 2026. No code until the product owner signs §11.
**Inputs:** ADR-0008 (page settings outside `document.json`), F11, the settings inventory
MB-1/MB-3/MG-9/MS-4, `docs/design/sidebar.md` (the row and
header rules the list reuses), `packages/layout/src/paginator.ts`.

## 1. What a break already is

The model is `pageSettings.manualBreakBeforeBlockIds: string[]` — per document, never in
`document.json`. The paginator already consumes it and is not a blank slate:

- a hint is honoured when its `y` is a **candidate break point** and **no block straddles that y**
  unless the block has an internal candidate there (`isValidBreakAt`);
- a hint at `y ≤ 0` (the first row of a page) is accepted and changes nothing;
- a hint that cannot be honoured becomes an `impossible-hint` **warning** defect (severity
  `warning`, `blocksExport: false`), and there is a second warning for a hint that never became a page
  start;
- hints on blocks of another chapter are skipped: a chapter already starts a page.

So the engine is complete, including the failure reporting. What is missing is **the control, the list,
and the cleanup** — plus one semantic rule the engine leaves open (F11).

## 2. The cut, stated plainly

A break is **not** "this block moves to the next page". It is: *a page boundary at the y of this
block's row*. Everything at that y or below moves down.

Consequences, all of them unavoidable and all of them worth stating in the UI:

- the block's **right-hand children** share its y, so they move with it;
- the block's **below children** and every sibling after it move too;
- a block that **shares a row** with another block cannot be isolated: breaking there breaks the row.

This is what F11 found for a mode A callout (it sits in the right lane at the parent's y): a hint
"before the callout" is really "before the parent". The answer is not to teach the engine a branch
break — pages are horizontal — but to **not offer the control where it lies**.

## 3. Which blocks can start a page

A block can carry a break only when it is the **leader of its row**: the leftmost block at its y. In
practice that is every top-level block, and every wrapped (below) child. Everything else is offered
**disabled with a reason**, so the rule is learnable once instead of silently ignored.

| Block | Control | Reason when disabled |
|---|---|---|
| Top-level block, not the first of its chapter | enabled | — |
| Wrapped (below) child, leader of its row | enabled | — |
| Child placed beside its parent (same y) | disabled | `Only the block that starts a row can begin a page.` |
| A callout in mode A | disabled | same reason (it shares the parent's y) |
| First block of a chapter | disabled | `A chapter always starts a new page.` |
| First block of the note | disabled | `The note already starts here.` |
| Block in a hidden/collapsed branch | disabled | `Show this block first.` (optional; only if cheap) |

The row leader is computed from the **current** page model, so the answer can change when density or
width changes. That is acceptable and already handled: a hint that stops being honourable becomes an
`impossible-hint` warning, and the list (§6) shows it.

## 4. The control

One item in the block context menu, in both layouts:

```
Start on a new page        ✓            (checked when this block carries a hint)
```

- Continuous: the block menu (`actions.ts` block items), before the destructive group.
- Page: the same item in the block menu, reachable with a right click on the card.
- Toggling writes the per-document override; one structural undo entry is **not** required (it is a
  setting, not document content), but the toggle must be disabled in **Read** like every other
  authoring action.
- No toolbar button, no palette command in v1: the palette is for document-level actions, and this is
  a block property.

## 5. Where the state is visible

**In Continuous: nowhere new.** R2a removed the page chrome from Continuous on purpose, and a manual
break is an intent about the printed page, not a fact about the canvas. The checked menu item is the
state, and §6 is the map.

*Alternative, if the product owner wants a marker:* a 1 px dashed `--border-2` rule on the top edge of
the block card with `title="Starts a page"`. Rejected here because it re-introduces pagination chrome
into the surface that just lost it, and it is visible only when you are already looking at the block.

**In Page: the page starts**, which is the real feedback. No extra badge on the card.

## 6. The `Breaks` section

A fifth activity-bar entry, `Breaks`, in the sidebar system's one rhythm
(`docs/design/sidebar.md`): 28 px header with the title and the count, group-owned dividers, plain
navigation rows (a break is not a result, so **no card**).

- **Row:** `Page 4 · Eigenvalues` — the page number of the current pagination, then the block's label
  (or its first line, as the outline does). 28 px, hover `surface-1`, click navigates: Page turns to
  that page, Continuous reveals the block. The row is the only target.
- **Second line on a broken hint:** `Can’t be honoured here.` in `--text-3`, with the paginator's
  defect message in the row's `title`. The row stays, nothing is deleted.
- **Remove:** a `×` on the row, hover/focus only, same pattern as the library rows. Disabled in Read.
- **Empty state:** `No manual breaks. Start a block on a new page from its menu.`
- **Count:** the number of stored hints in the header, `--sb-count` like the others.
- **No reordering**: the order is the document's, not the user's. The list is a map, not a stack.
- **Read mode:** the list is visible and navigable, `×` disabled.

The icon: `SeparatorHorizontal` (a broken horizontal rule) — the closest to "page break" in the set in
use; no custom SVG.

## 7. Cleanup, or the list rots

A hint references a block id. When the block disappears the hint must go with it, otherwise the list
shows entries that cannot be found and the export carries dead warnings.

- **Delete block** (including a subtree): drop every id in the removed set.
- **Split / merge block**: the ids that survive keep their hint; the id that disappears loses it. After
  a split, the original block keeps the hint (it is still the row it was); the new block never inherits it.
- **Undo**: the settings write is not part of the document history, so the cleanup must be **recomputed
  from the current document** rather than replayed. Prune after each structural commit: `hint ∈
  document.blocks`.
- A hint whose block still exists but is no longer a row leader is **kept** and warned, never silently
  dropped: the user's intent survives a density change.

## 8. Warnings, not errors

An unhonourable hint stays a `warning` defect: the export proceeds and the sheet lists it. Blocking an
export because the user changed density after setting a break would be hostile, and the engine already
treats it that way. The Breaks list (§6) makes the warning discoverable before the export sheet does.

## 9. Settings

**No Settings page.** MS-4 planned `Page → Breaks`, but the global page settings carry a *default* list
of block ids, and block ids are document-scoped: a global break list would apply to whichever document
happened to contain those ids. That field is a modelling wart.

- The global default stays `[]` **by contract**, and a test asserts it; nothing writes it.
- The per-document override is the only store; it is written by the menu toggle and pruned by §7.
- If a global surface is ever wanted it is "page setup defaults", not "breaks".

## 10. Scope of the batch

- The block-menu item with its enabled/disabled reasons and the Read gate.
- The `Breaks` activity-bar section, its rows, the broken-hint line, remove, empty state, count.
- The prune on delete/split/merge with unit tests over the settings writer.
- A paginator test for the two F11 cases already documented (`y > 0` breaks the parent; `y = 0` is a
  no-op) and for a right-placed child (the hint moves the row).
- Docs: ADR-0008 note that breaks are per document by contract; `docs/design/sidebar.md` gets the fifth
  entry.

Not in scope: a Settings page, a `Remove all` action, drag reordering, a Continuous marker, any change
to the paginator's algorithm, any schema or `settingsVersion` change.

## 11. Resolved decisions (16 November 2026)

1. **Row label:** the block's own label when it has one, otherwise its first line — the Outline rule.
2. **Broken hints keep their row** with `Can’t be honoured here.` The intent survives a density change;
   the paginator's message goes in the row's `title`.
3. **`Breaks` is a fifth activity-bar entry.** A mode switch inside the Outline would hide the list, and
   this is a map of the printed result, not a tree of blocks.
4. **No Continuous marker.** The checked menu item and the list are the state; R2a's decision holds.

**Lab:** `docs/design/manual-breaks-ui-lab/`.
