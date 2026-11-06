# Design tokens — layout, spacing, edges, surfaces

**Status:** Active (M3 review, 6 November 2026)  
**Source of truth:** `apps/desktop/src/renderer/src/lib/design-tokens.ts`  
**Related:** `docs/ux-shell.md`, `docs/design/m3-anchors-references.md` §6.2.1

This is the single reference for layout/spacing values that used to be scattered across components.
Components and the router must read these tokens; do not add new hard-coded 12/16/26 values.

## Layout and spacing

| Token | Value | Used for |
|---|---:|---|
| `rowIndent` | 26 px | Below-stack rows (callouts and wrapped direct children) from the lane left |
| `trunkInset` | 12 px | Below trunk start from the parent card left, inside the card |
| `stemMin` | 12 px | Final horizontal segment before every arrowhead |
| `siblingGap` / `childGap` | 16 px | Gap between sibling cards and between parent and child groups |
| `calloutGap` | 16 px | Anchor → callout offset when the anchor is farther right |
| `edgeGap` | 2 px | Arrow tip gap before the card |
| `edgeRadius` | 2 px | Maximum corner rounding; corners are near-right angles, never wide arcs |
| `calloutMinWidth` | 240 px | Minimum independent callout lane width |
| `calloutMaxWidth` | 480 px | Maximum callout lane width; prevents unbounded push |
| top-level block | 160–480 px | Content-driven min/max |
| child block | 144–420 px | Content-driven min/max |

## Callout lane and right group

```text
laneWidth = clamp(max(parent.width, callout natural width), 240, 480)
rightGroupX = max(parent.right, lane.right) + siblingGap
calloutLeft = clamp(anchorX + calloutGap, lane.left + rowIndent, lane.right - minCalloutWidth)
```

- The lane is a callout projection, not the parent width: a narrow parent can have a wider callout
  lane, up to 480 px.
- The right group moves only by the lane's excess past the parent, never by the whole anchor length.
- If the right group does not fit, it wraps below after the callouts, sharing the left trunk.
- Callout block and trunk are indented together; no arrow-only offset.

## Edges

- Primary/right, below/callout, and reference edges all use the same fixed 6×6 arrowhead.
- Primary and below elbows use `edgeRadius` 2 px; the first-child trunk junction stays sharp.
- Reference edges are dashed with an open chevron and never join the primary V4 trunk.
- No top-entry arrows: every target edge enters from the left.

## Colors, borders, typography

These remain CSS variables in `styles.css` (`--surface-*`, `--border-*`, `--text-*`, `--accent*`,
fonts). They are part of the same design system but are not duplicated in the TS token module yet.

## Future settings

The planned M6 settings UI maps user choices (Compact/Comfortable, colors, borders, indents, gaps) to
token overrides. Settings must not introduce component-local styling; they change the token values.
