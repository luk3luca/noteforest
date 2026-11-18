# Indent, outdent and drag-to-reparent

**Status:** design proposal, 14 November 2026. Indent/outdent v1 is ready to build; drag is phase 2.
**Related:** `docs/spec.md` §4.5–4.6, `docs/adr/0005-anchor-binding-and-identity.md`,
`docs/design/library-and-documents.md`.

## 1. Why

Outdent exists (`⇧Tab`, Position menu). There is no Indent, so a block can only move up/down or
through the Move dialog. Dragging is not available. The tree is the product, so both are natural
editing operations.

The model does not need free positioning: this is **structural reparenting**, not a canvas. The
core `block.move` command already supports `to: { kind: 'child', parentBlockId, atIndex }` with
cycle and chapter checks. Indent and drag must call the same command, never a second mechanism.

## 2. V1 — Indent and outdent

### Semantics

- **Indent** (`⇥` on a selected block): the block becomes the **last child of its previous primary
  sibling**. Its whole subtree moves with it.
- **Outdent** (`⇧⇥`, already implemented): the block becomes the next sibling **after its parent**
  (or leaves the parent as a top-level block, per the current command).
- If there is no previous sibling, Indent is disabled with a reason. It never guesses another
  parent.
- The previous sibling is the one in **primary** order; reference edges never define placement.
- A top-level block that indents under its previous top-level sibling leaves the chapter's
  top-level list; the chapter must keep at least one top-level block (existing F6 rule).
- The block's own children and reference edges are untouched.

### Anchored incoming edge

Today `block.move` deletes an anchored incoming primary edge and creates a fresh direct edge at the
destination; the anchor is lost. New rule:

- **Same-parent reorder** (Move up/down): keep the existing primary edge, including its anchor,
  and update only the order.
- **Reparent** (Indent, Outdent, drag to another parent): the old anchored primary edge becomes a
  **reference edge** with the same source and anchor (dashed "cite" arrow); the destination gets a
  fresh primary edge. The anchor marker stays visible and clickable. Show a short toast:
  “Kept as reference from «source»”.
- One undo restores both edges exactly.

No silent anchor loss; no prompt. The reference edge is the citation.

### Keyboard and menu

- `⇥` / `⇧⇥` only when a **block is selected and text editing is not active**; inside text, Tab
  keeps its native/table behavior.
- **Known UX gap (product owner, 14 November 2026):** Tab from the text caret traverses focusable
  buttons, so structural Indent only works after clicking the gutter/grabber. This hidden block
  selection is anti-functional; the shortcut audit will propose a caret-friendly alias (for example
  `⌘]`/`⌘[`) and/or a visible block-focus entry. Tab may remain an alias only on a selected block.
- **Future visual state:** editing (caret in text) and block focus (selected for structural actions)
  must be visually distinct. Consider a wavy/dashed accent outline for block focus versus the
  straight editing rectangle; no colour-only cue, no layout shift, no animation. Design with the
  shortcut/block-focus step.
- Position menu gains **Indent** next to Outdent; the command palette gains both.
- Commands are the accessible path; drag is optional.

### Tests

- Indent moves the block and its subtree as the last child of the previous sibling.
- First child/no previous sibling is disabled.
- Top-level indent respects the non-empty chapter rule.
- Same-parent reorder keeps an anchored primary edge and its anchor.
- Indent/outdent of an anchored child creates a reference edge and a fresh primary edge; undo
  restores both.
- Reference edges are untouched; cycle and invalid placements are rejected.
- UI: Tab/Shift+Tab with a selected block; menu states; one undo.

## 3. Phase 2 — Drag

Drag is an affordance over the same `block.move` command.

### Landing zones

- **Between siblings**: a horizontal insertion line above/below a card → sibling move with the
  resolved index.
- **Into a parent**: one child zone at the card's bottom-left trunk origin / `+` port → append as
  last child. One zone, not two: the trunk origin and the `+` are the same operation.
- No free positioning, no arbitrary coordinates, no drop on the page canvas.

### Feedback and safety

- Ghost of the dragged block; target parent highlighted; insertion line for sibling moves.
- Cycle guard from `isLegalMove`; dropping on the dragged subtree is rejected.
- Escape cancels; autoscroll near the viewport edge; pointer and keyboard both work.
- Drop never changes content or anchors except through the anchored-edge rule above.
- Cross-chapter drag: allowed only where `block.move` is legal; the chapter non-empty rule still
  applies. Top-level drag needs a chapter drop zone, which is phase 3 if needed.

### Open decisions for phase 2

1. Child zone: bottom-left trunk origin, the `+`, or both (recommended: one zone at the trunk
   origin, with the `+` as the same hit target).
2. Cross-chapter drag in v2 or after the activity bar.
3. Drag threshold and hover delay (avoid accidental reparenting).

## 4. Out of scope

- Freeform positioning, pins, arbitrary canvas drag.
- Reordering by geometry (the order is logical; geometry follows).
- Multi-block drag in v1; a later extension can call the same command per block.
