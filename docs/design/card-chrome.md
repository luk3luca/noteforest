# Card chrome — states and references

**Status:** approved 15 November 2026; implementation pending.
**Scope:** Continuous Edit/Read. Page and PDF have their own renderer and are unchanged.

## 1. Placement rule

Every indicator lives **inside the card's rectangle**. Nothing is absolutely positioned over the
card edge, and nothing floats over another card.

| Card | Top | Bottom |
|---|---|---|
| Anchor callout | quote chip + the anchor's own state | references |
| Top-level block | — | block state + references |

- The **top row** exists only on an anchor callout and carries the anchor identity: the quote chip
  and, next to it, `Ambiguous`/`Lost anchor`. Keeping the state beside its quote is deliberate: the
  state belongs to that quote.
- The **bottom row** is one chrome line inside the card, after the content, present only when there
  is something to show: the block's anchor warnings (anchors inside its content) and the
  `See also`/`Referenced by` chips. Order: state first, then references; the row wraps if needed.
- The state badge on a top-level card is the same warning chip as today, moved from the half-outside
  position (`bottom: -10px`) into the row.
- The reference chips move from below the card (`top: calc(100% + 2px)`) into the row.
- When the row appears the card grows by about 26 px. This is Continuous only; there is no page
  pagination to redo. The previous absolute positioning was layout-neutral; consistency is chosen
  over that invariant.

## 2. Shapes

- Text chips are the app's rounded rectangle: height 20, `border-radius: var(--radius-control)`,
  1 px border, font 10.5. **No 999 px capsule for text.**
- State chip: triangle + word, warning/danger border and text. Quote chip: the existing squared chip
  (radius control), accent quote glyph.
- References: `See also` keeps its dashed border, `Referenced by` the solid one (non-colour cue);
  text `text-2`; clicking still navigates to the target.
- `.nf-image-action`, `.nf-image-draw-hint`, `.nf-page-badge`, `.nf-recovery-pill` and
  `.nf-tree-shared` lose the capsule and use the same radius.
- **Exception:** `.nf-branch-port` stays a circular icon port (no text). Add ports are icon buttons;
  they are not chips.

## 3. Canvas inset

The continuous canvas left padding is the card inset, and the drag handle sits in a 16 px gutter to
its left. The padding must cover the gutter plus a small margin:

- `editorPaddingX` 8 → **24**;
- medium → **20**, compact → **16**.

The chapter title, cards and page-break chrome align to the new inset. The grab handle is fully
visible and clickable at every width.

## 4. Tests

- The bottom row exists only when there is a state or a reference; a plain card has no row.
- The row is inside the card's box (no negative offsets), and a card with references does not overlap
  the next card.
- The callout keeps quote + state at the top and gets its references at the bottom.
- Text chips use the control radius; a CSS guard fails on any new `border-radius: 999px` except the
  branch port.
- The canvas gutter is fully inside the visible area; bounding boxes of the grab handle and the
  canvas edge do not intersect.
