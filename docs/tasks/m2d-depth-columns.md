# M2d — Depth columns + M2 polish

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Depends on:** M2c merged; `packages/core`; ADR-0004 M2d addendum; `docs/ux-shell.md`; `docs/spec.md` v0.4.3 (D22)  
**Out of scope:** M3 anchors/reference edges, page view, PDF, external API, light theme, font/size settings UI (M6)

## Goal

Make the editor read as a depth-column tree: blocks at the same depth share one x column, the 4-level chain fits at 1440, the canvas scrolls horizontally instead of wrapping, collapse costs no height, Backspace is non-destructive, and add top-level/chapter is contextual. Keep the M2c fixes.

## 1. Depth-column layout (core)

Current layout is parent-relative flex: children start after each parent, so two nodes at the same depth can have different x positions and a deep chain wraps.

**Rule:** within one chapter, every visible block at depth `d` starts at the same x. Column widths are content-driven, not fixed pixels.

Implementation direction (prefer CSS flow + measured column widths; do not switch the editor to absolute positioning unless unavoidable):

1. Measure visible cards per chapter/depth (`ResizeObserver`, rAF, cache by block/content width).
2. Column width:
   - depth 0 (top-level): `max(card widths at depth 0)`, clamp 160–480 px;
   - depth > 0: `max(card widths at that depth)`, clamp 144–420 px;
   - empty blocks use the minimum width, not the maximum;
   - add 16 px gap between depth columns.
3. Column x: `x[0] = 0`; `x[d] = x[d-1] + width[d-1] + 16`.
4. Align each child group to `x[d+1]`:
   - the child group starts after the parent card; add the measured margin/padding needed so its left edge is exactly `x[d+1]`;
   - set the group width to `width[d+1]` so the next depth starts at the expected x;
   - siblings at the same depth stack vertically inside the group, left-aligned;
   - cards may be narrower than their column; they do not stretch.
5. Top-level blocks stack vertically in column 0; columns reset at each chapter; chapter sections are independent.
6. The editor content width = `x[maxDepth] + width[maxDepth] + padding`. If it exceeds the viewport, the editor scrolls horizontally; no wrap. Remove/disable the old `flex-wrap` path for the editor.
7. Arrows are measured from actual card rects; trunks group per parent; selected path unchanged.
8. On content edit/resize: only the affected chapter is re-measured/re-columned; debounce a full pass; no flicker/scroll jump under the caret.

**Target:** the 4-level chain `top → f → ff → fff` with empty blocks fits at a 1440×900 window without horizontal overflow. A 6-level chain overflows and scrolls horizontally with columns intact.

## 2. Collapse on the branch port (no footer)

- Remove the in-flow `.nf-block-meta` footer (height 16 + margin 2) that makes a one-line block with children as tall as two lines.
- Put a real collapse button on the parent's **right branch port**:
  - expanded: subtle chevron, visible on hover/selection;
  - collapsed: a compact dot with the child count, always visible;
  - `aria-expanded`, title, keyboard `⌘.`; the SVG edges stay decorative/aria-hidden.
- Clicking the port/trunk collapses the child column; clicking the dot re-expands.
- The `+` add-child control must not overlap the collapse button; place it on the right edge at a different vertical spot, still outside the text.
- Collapse must not change card height or add a margin. Hidden children/edges are not measured for columns.
- Preserve `⌘.` and the existing collapse state behavior.

## 3. Non-destructive Backspace

- Plain `Backspace` on an empty block must **not delete the block**. It moves the caret to the previous block (or does nothing at the first block); the empty block remains until explicitly deleted.
- Deletion: `⌘Backspace` or `Delete` on a selected block, with promote/subtree confirmation when it has children. Keep the context menu delete.
- Table cells: Backspace never deletes a cell/row; only explicit table commands.
- Keep text undo and structural undo behavior; add tests.

## 4. Contextual add top-level/chapter

- Each chapter ends with a “+ Add top-level block” row; it adds to **that chapter**, not the last one.
- “+ Add chapter” inserts immediately **after the active chapter** (the chapter of the selected block); if no selection, after the last visible chapter.
- Focus the new block/chapter title. Keep sidebar actions working.

## 5. Trunk continuity

- The first child at the parent's vertical center must be a **continuous path** from the parent's right edge to the child's left edge.
- The shared trunk starts at the T-junction on that path and goes down; do not round the corner and then start the first branch, which leaves a gap.
- Unit test: parse the SVG path/points and assert no gap between the parent port, first branch, and trunk; 1/2/5 children.
- Screenshot: 3-child trunk at 1440 and 1024.

## 6. Wrapped-child arrows (page future)

- The editor uses depth columns + horizontal scroll, so it should not wrap. If the page renderer later wraps a child below (M4), the arrow must enter the child's **left** side from the indent gutter, not its top.
- Keep/reserve the router path for below, but do not use it in the editor unless a column cannot be placed.

## 7. Width and typography

- Canvas max ~1,600 px; top-level max 480 px; child min 144 px; gap 16 px; block padding 10 px; editor padding 28–40 px.
- UI sans 15.5 px/1.55; headings 20/18/16; code JetBrains Mono 13.5; M2c font choice stays.
- Do not add a font/size Settings UI; tokens only (M6).

## Tests and gates

- Unit: column x equality across different parents; column widths from max card; 4-level fit; 6-level overflow; column reset per chapter; trunk continuity; Backspace no-delete; add chapter index.
- E2E:
  - 4-level empty chain at 1440: no horizontal overflow, all four x columns correct;
  - 6-level chain: horizontal scroll, columns aligned;
  - collapse: card height unchanged, dot/count, re-expand, no footer;
  - Backspace on empty block: block remains; Cmd+Backspace deletes;
  - add top-level in the selected chapter; add chapter after active;
  - trunk continuous at first child;
  - screenshots 1440×900, 1024×768; 200% zoom.
- `npm run typecheck`, `npm test`, `npm run e2e`; 300-block performance not worse than M2c by >20%.
- axe no serious/critical; no screen recording/Notability.

## Deliverables

- App/core changes.
- Tests + screenshots under `artifacts/m2d/`.
- `docs/reports/m2d-depth-columns.md` with gate table, measurements, before/after, known gaps.
- Worktree path, branch, commits, commands.

## Acceptance

Same-depth blocks are visually in one column in every chapter; the 4-level empty chain fits at 1440; deeper chains scroll horizontally without wrapping; collapse adds no height; Backspace does not delete; add top-level/chapter is contextual; the trunk is continuous; one-line blocks stay one-line.
