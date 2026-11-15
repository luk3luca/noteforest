# Document health UI lab — sidebar first

Self-contained HTML mock for the Document health surface. Open `index.html` in a
browser; nothing here is application code.

## Direction

Health is a **sidebar view**, and the repair lives in the sidebar itself:

- the sidebar groups issues in **expandable sections** (chevron, name, count);
- an error row is the quote only, indented; selection is a filled row, never a
  left stripe;
- picking an error **widens the sidebar** from 264 to 664 px: the list column
  keeps its width and position, the repair opens in the 400 px to its right;
- the panel closes back to 264, the row stays selected; the canvas gives up the
  400 px only while the detail is open.

No second surface, no duplicated list, no modal sheet. The list is the report.

## What the lab shows

1. **Sidebar** in two states at 264 px (collapsed overview, open sections with a
   selected error); the same structure at 180 px.
2. **Widened sidebar**, state 1 (issue detail) and state 2 (before/after
   confirm) in a 664 px window: 264 list + 400 detail.
3. **Placements**: sidebar widens into one panel (chosen), sidebar + separate
   panel (rejected: two surfaces), sidebar only inline (too tight, with a mock).
4. **Copy and geometry**: severity words, user-facing action labels, 28 px
   controls, 4/8 px radii.

## Decisions recorded

1. The repair panel **is the sidebar**, widened; the modal sheet is retired.
2. The list keeps 264 px and does not move when the detail opens.
3. On success the row leaves the list, the detail closes, the sidebar returns
   to 264, and an Undo toast appears.

## Parked

Reference chips, the lost-anchor capsule and the remaining `999px` capsules are
a separate pass. This lab stops at health.
