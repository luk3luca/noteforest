# Design tokens — layout, spacing, edges, surfaces

**Status:** Active (M3 review, M3g4 callout stacking and trunk gap, 6 November 2026)  
**Source of truth:** `apps/desktop/src/renderer/src/lib/design-tokens.ts`  
**Related:** `docs/ux-shell.md`, `docs/design/m3-anchors-references.md` §6.2.1

This is the single reference for layout/spacing values that used to be scattered across components.
Components and the router must read these tokens; do not add new hard-coded 12/16/26 values.

## Layout and spacing

| Token | Value | Used for |
|---|---:|---|
| `rowIndent` | 26 px | Below-stack rows (callouts and wrapped direct children) from the lane left |
| `trunkInset` | 12 px | Below trunk start from the parent card left, inside the card |
| `trunkGap` | 8 px | Visible gap between the parent card bottom and the below trunk start |
| `stemMin` | 12 px | Final horizontal segment before every arrowhead |
| `siblingGap` / `childGap` | 24 px | Gap between parent card/lane and the direct-child group; the 24 px budget is 10 px horizontal lead + 12 px stem + 2 px arrow gap |
| `calloutGap` | 16 px | Anchor → callout offset when the anchor is farther right |
| `edgeGap` | 2 px | Arrow tip gap before the card |
| `edgeRadius` | 2 px | Maximum corner rounding; corners are near-right angles, never wide arcs |
| `calloutMinWidth` | 240 px | Minimum independent callout lane width |
| `calloutMaxWidth` | 480 px | Maximum callout lane width; prevents unbounded push |
| `callout.maxAnchorOffset` | 160 px | Maximum callout left offset from the parent card left |
| `callout.safeGap` | 16 px | Minimum gap between the callout right edge and the direct-child group |
| top-level block | 160–480 px | Content-driven min/max |
| child block | 144–420 px | Content-driven min/max |

## Callout lane and safe zone

```text
laneWidth = clamp(max(parent.width, callout natural width), 240, 480)
rightGroupX = max(parent.right, lane.right) + siblingGap
calloutSafeRight = rightGroupX - callout.safeGap
calloutLeft = clamp(anchorX + calloutGap, lane.left + rowIndent,
                    min(parent.left + callout.maxAnchorOffset,
                        calloutSafeRight - calloutMinWidth))
calloutWidth = min(laneWidth - rowIndent, calloutSafeRight - calloutLeft)
```

- The lane is a callout projection, not the parent width: a narrow parent can have a wider callout
  lane, up to 480 px.
- The right group moves only by the lane's excess past the parent, never by the whole anchor length.
- The callout never starts farther than `callout.maxAnchorOffset` (160 px) from the parent left and
  never ends closer than `callout.safeGap` (16 px) to the right-group trunk.
- If `calloutSafeRight - (lane.left + rowIndent) < calloutMinWidth`, the safe zone cannot fit the
  240 px minimum: direct children wrap below **after** the callouts, sharing the left trunk, instead
  of sitting beside them. This applies even to a lone direct child; the wrap decision is derived from
  lane width and parent width only, so it cannot oscillate between measure passes.
- At the 240 px lane floor the usable width after the row indent is 214 px. The clamp falls back to
  the row origin rather than returning a left edge before the shared indent; the wrap rule keeps the
  child column out of that lane.
- If the right group does not fit the viewport, it wraps below after the callouts, sharing the left
  trunk.
- Callout block and trunk are indented together; no arrow-only offset and no card overflow.
- **Below-stack descendants stack below too.** A callout row (or a wrapped direct child) that has its
  own direct children places them under the row with the shared `rowIndent`, not in a nested right
  group. A nested right group would occupy the same column as the enclosing parent's direct child,
  producing the overlapping-card defect fixed in M3g5.

## Edges

- The right-group gap is 24 px: 10 px horizontal lead from the parent, 12 px final stem, 2 px arrow
  gap. A shared right trunk therefore leaves the parent horizontally before descending instead of
  running along the card edge.
- The shared right trunk owns the parent port and the horizontal lead; child edges are only the
  short arms. Selecting any child in the group activates the whole lead/trunk, not just the first
  child's arm.
- The below trunk starts `trunkGap` (8 px) below the parent card bottom; it is deliberately detached
  from the card border instead of touching it.
- Primary/right, below/callout, and reference edges all use the same fixed 6×6 arrowhead.
- Primary and below elbows use `edgeRadius` 2 px; the first-child trunk junction stays sharp.
- Reference edges are dashed with an open chevron and never join the primary V4 trunk.
- No top-entry arrows: every target edge enters from the left.

## Stacking

- The parent card stays above its below stack (`z-index: 2`) so its bottom add-sibling control and
  chrome remain clickable.
- The anchored callout lane paints above the direct-child group (`1` vs `0`). The safe zone and wrap
  rule are still the primary layout guarantee; the order is a safety net so an anchor child can
  never be hidden behind a direct child during a transient measure or reflow state.
- `CalloutLaneView` resolves the parent card on every alignment pass and observes the host, so a lane
  that mounts before its card still receives `--nf-lane-width` and `--nf-callout-offset`.

## Colors, borders, typography

These remain CSS variables in `styles.css` (`--surface-*`, `--border-*`, `--text-*`, `--accent*`,
fonts). They are part of the same design system but are not duplicated in the TS token module yet.

## Future settings

The planned M6 settings UI maps user choices (Compact/Comfortable, colors, borders, indents, gaps) to
token overrides. Settings must not introduce component-local styling; they change the token values.
