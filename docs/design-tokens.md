# Design tokens — layout, spacing, edges, surfaces

**Status:** Active (M3h4 single source + CSS guard, 6 November 2026; R2d shared edge style, 8 November 2026)
**Source of truth:** `apps/desktop/src/renderer/src/lib/design-tokens.ts` for shell/layout values; `packages/layout/src/edge-style.ts` for edge stroke, arrowhead, corner, lane, and stem values.
**Related:** `docs/ux-shell.md`, `docs/design/m3-anchors-references.md` §6.2.1

This is the single reference for layout/spacing values that used to be scattered across components.
Components and the router must read these tokens; do not add new hard-coded 12/16/26 values.

## How the single source works

`DESIGN_TOKENS` is the only numeric source. Every value that CSS needs is also exported as a root
custom property from `DESIGN_TOKEN_CSS_VARIABLES`; `applyDesignTokens()` writes that map to
`document.documentElement` from `main.tsx` before the React root mounts. `styles.css` consumes
`var(--nf-*)` for those values and never repeats the literal.

- Runtime path: `DESIGN_TOKENS` → `DESIGN_TOKEN_CSS_VARIABLES` → `applyDesignTokens()` → `styles.css`.
- Guard: `apps/desktop/test/design-tokens-css.test.ts` imports the TS module, reads `styles.css`, and
  fails on a literal duplicate, a missing `var()`, a token that is not consumed, or a changed
  canonical value. It also checks that `main.tsx` applies the variables before `createRoot`.
- A token change is therefore a visual change with no CSS edit. Do not add a second hand-maintained
  copy “just for now”.

## CSS-bound tokens

These are applied as root variables at boot.

| Token | CSS variable | Value | Used for |
|---|---|---:|---|
| `canvasMaxWidth` | `--nf-canvas-max` | 3200 px | Finite wide canvas; placement uses its 3120 px content budget |
| `editorPaddingX` | `--nf-canvas-pad-x` | 40 px | Canvas horizontal padding |
| `editorPaddingTop` | `--nf-canvas-pad-top` | 40 px | Canvas top padding |
| `editorPaddingBottom` | `--nf-canvas-pad-bottom` | **88 px** | Canvas bottom padding |
| `editorPaddingXMedium` | `--nf-canvas-pad-x-medium` | 32 px | Canvas padding at ≤1100 px |
| `editorPaddingTopMedium` | `--nf-canvas-pad-top-medium` | 32 px | Canvas padding at ≤1100 px |
| `editorPaddingBottomMedium` | `--nf-canvas-pad-bottom-medium` | 72 px | Canvas padding at ≤1100 px |
| `editorPaddingXCompact` | `--nf-canvas-pad-x-compact` | 28 px | Canvas padding at ≤900 px |
| `editorPaddingTopCompact` | `--nf-canvas-pad-top-compact` | 28 px | Canvas padding at ≤900 px |
| `editorPaddingBottomCompact` | `--nf-canvas-pad-bottom-compact` | 64 px | Canvas padding at ≤900 px |
| `chapterGap` | `--nf-chapter-gap` | **28 px** | Gap between chapters |
| `siblingGap` / `childGap` | `--nf-child-gap` | 24 px | Parent card/lane → direct-child group |
| `childRowGap` | `--nf-child-row-gap` | 16 px | Vertical gap between sibling blocks |
| `cardPadding` | `--nf-card-padding` | 10 px | Card padding |
| `cardRadius` | `--nf-card-radius` | 4 px | Card and block-image radius |
| `childMinWidth` | `--nf-child-min-width` | 144 px | Child card minimum |
| `childMaxWidth` | `--nf-child-max-width` | 420 px | Child card maximum |
| `topLevelMinWidth` | `--nf-top-level-min-width` | 160 px | Top-level card minimum |
| `topLevelMaxWidth` | `--nf-top-level-max-width` | 480 px | Top-level card maximum |
| `rowIndent` | `--nf-row-indent` | 26 px | Below-stack rows from the lane left |
| `edgeWidth` | `--nf-edge-width` | 1.25 | Primary/reference edge stroke |
| `edgeWidthActive` | `--nf-edge-width-active` | 1.75 | Selected path stroke |
| `edgeWidthMuted` | `--nf-edge-width-muted` | 1 | Unselected path stroke |
| `zIndex.edge` | `--nf-z-edge` | 0 | Edge layer |
| `zIndex.rightGroup` | `--nf-z-right-group` | 0 | Direct-child group |
| `zIndex.calloutLane` | `--nf-z-lane` | 1 | Callout lane |
| `zIndex.parentCard` | `--nf-z-card` | 2 | Parent card |

Canonical shell values are ratified and guarded: **88 px** bottom canvas padding, **28 px** chapter
gap, **24 px** child gap, and `callout.safeGap` **16 px as a minimum** (the effective gap after the
24 px group gap is larger). The responsive canvas steps are token-bound too, so no canvas padding
literal remains in CSS.

## Router-only tokens

These values never appear in CSS; they feed `geometry.ts` / `edge-routing.ts` / `page-routing.ts`
(SVG coordinates or placement math). Keep them in the shared TS modules so the renderer, the Page
router, and the print model cannot disagree.

Edge tokens (`EDGE_STYLE` in `packages/layout/src/edge-style.ts`) include the visual values below
plus the R2d page-route search values: `pageClearance` 3 px (route/card clearance), `pageLaneStep`
4 px (parallel duplicate edges), and `pageTurnPenalty` 60 px (search cost only, not a visual
value).

| Token | Value | Used for |
|---|---:|---|
| `trunkInset` | 12 px | Below trunk start from the parent card left |
| `trunkGap` | 8 px | Visible gap between the parent card bottom and the below trunk start |
| `stemMin` | 12 px | Final horizontal segment before every arrowhead |
| `calloutGap` | 16 px | Anchor → callout offset when the anchor is farther right |
| `calloutMinWidth` | 240 px | Minimum independent callout lane width |
| `calloutMaxWidth` | 480 px | Maximum callout lane width |
| `callout.maxAnchorOffset` | 160 px | Maximum callout left offset from the parent card left |
| `callout.safeGap` | 16 px minimum | Minimum gap between the callout right edge and the direct-child group |
| `edgeRadius` | 2 px | Maximum corner rounding; corners are near-right angles |
| `edgeGap` | 2 px | Arrow tip gap before the card |
| `edgeArrowLength` | 6 px | Fixed arrowhead length |
| `edgeArrowHalfWidth` | 3 px | Fixed arrowhead half-width |
| `edgeLaneMin` | 2 px | Shared trunk lane minimum offset |
| `edgeLaneMax` | 14 px | Shared trunk lane maximum offset |
| `edgeMinGap` | 4 px | Minimum routed segment gap |
| `wrapIndent` | 18 px | Shell below-stack indent; the layout engine uses the same default independently |

`edgeBusOffset` and `edgePortSpacing` were removed in M3h4: the below-stack router no longer uses
them and nothing else read them. Port distribution remains a router-only helper (`distributePorts`
in `geometry.ts`), not a CSS token.

## Layout-engine options (packages/layout)

These are `LayoutOptions` in `packages/layout/src/types.ts`, not CSS variables. They must not be
duplicated in the shell token module; the reader, page view, and print renderer pass the same values
so one engine produces one geometry.

| Option | Value | Used for |
|---|---:|---|
| `wrapIndent` | 18 px | Per-level left indent when a direct-child group wraps below its parent |
| `maxWrapIndent` | 54 px | Cap on cumulative wrap indent from the page content left (3 × 18) |
| `wrapPolicy` | `group-left-origin` | Production default from ADR-0006; lab oracles are not user-facing |
| `pagePacking` | `stacked` (engine) / `beside` (compact page) | Page/PDF tree columns; `compaction` is a legacy lab oracle |
| `minContentWidth` | 160 px | Readable minimum before a block reports `content-too-wide` |
| `maxContentWidth` | 420 px | Readable text cap; unbreakable content may use more |

`compaction` is a page/PDF-only policy: the parent card starts a row, anchored
callouts and primary direct children fill that row at their measured widths, and
the overflow wraps to one indented row below. Each component owns a column for its
own recursive row; reference targets are never duplicated. `beside` and `stacked`
remain the reference policies. The Continuous callout-projection lane above is a
different surface and is unchanged.

M4a lab evidence (`docs/reports/m4a-layout-lab.md`): no page-count delta on the 300-block,
deep-chain, wide-fan, or showcase fixtures; the only measured trade-off is wide-fan's +99.1 px
height with no page increase. Do not change these values without re-running the lab.

## Runtime-measured variables

These are not design tokens. Components write them per block/lane from live measurements; CSS only
supplies the fallback shape.

- `--nf-lane-width`: bounded callout lane width.
- `--nf-right-group-height`: reserved height of the absolute right group. It is per node, not
  inherited: every nested renderer resets it to `0px`, and a node with its own right group publishes
  a fresh value from `BranchChildrenView`. Without the reset, a callout-only descendant inherited
  the ancestor's reservation and the height compounded on each resize.
- `--nf-callout-offset`, `--nf-callout-dot-left`, `--nf-callout-leader-left`,
  `--nf-callout-leader-width`: live anchor alignment.
- `--nf-sidebar-width`: user-adjusted shell sidebar width.

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
- **Anchor alignment is intentional:** a callout starts under the anchor's left edge (for an image
  region, the region's left edge; for a point, the point x), capped at `maxAnchorOffset` 160 px. Its
  width is the remaining lane width, so anchors farther right produce narrower callouts. A region's
  right edge and width never change the callout x or width directly; only its left edge feeds the
  rule, and the point uses the same x-only rule. This is the chosen rule; it is not a per-anchor
  width setting.
- **Below-stack descendants stack below too.** A callout row (or a wrapped direct child) that has its
  own direct children places them under the row with the shared `rowIndent`, not in a nested right
  group. A nested right group would occupy the same column as the enclosing parent's direct child,
  producing the overlapping-card defect fixed in M3g5.

## Edges

- **One source, two surfaces (R2d).** Continuous (`edge-routing.ts`), Page Read/Edit
  (`PageEdges.tsx`), and the PDF print model all consume `EDGE_STYLE` and the path helpers in
  `packages/layout/src/edge-style.ts`: `roundedPath` (orthogonal `L`/`Q`, never cubic `C`),
  `arrowPath` (filled 6 × 3 primary polygon), and `openArrowForDirection` (7 px open reference
  chevron). `DESIGN_TOKENS` re-exports those values as `GEOMETRY`; do not add a second copy.
- **Page routing.** `packages/layout/src/page-routing.ts` projects each same-page edge onto an
  obstacle-aware orthogonal polyline. Fragment card boxes are obstacles with 3 px clearance; the
  route leaves the source through a rail just outside its right edge (3 px clearance, +4 px per
  parallel duplicate) and enters the target's left edge with a final stem of at least 12 px.
  Earlier sibling cards are never crossed.
- **Target entry.** Left entry is the default. A side is used only when it can fit the full 12 px
  stem inside the content box; a wrapped page row that starts 12 px from the content left therefore
  takes the target top instead of shortening the stem. Top/right/bottom entry points use the same
  arrowhead and corner primitives. A target on the content left (x = 0) has no left approach; it
  uses the top entry (or right entry when the target is above the source).
- **Lanes.** Distinct targets from one source deliberately share the source rail, so the shared
  segment reads as the Continuous trunk. Duplicate edges between the same two fragments get
  `pageLaneStep` (4 px) parallel rails so they never overdraw exactly.
- **Cross-page indicators** stay straight horizontal `to-edge`/`from-edge` lines from/to the content
  edge, with the same stroke and arrowhead; the SVG clips them to the page content box. Reference
  edges keep their target-only `from-edge` rule.
- **Shared primitives.** Continuous and Page arrows use the same stroke width
  (`--nf-edge-width`, 1.25), fixed arrowhead size/fill rules, near-right corner radius (2 px), and
  minimum stem (12 px).
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
- Stroke widths come from `--nf-edge-width` (1.25), `--nf-edge-width-active` (1.75), and
  `--nf-edge-width-muted` (1); primary and reference edges share the normal width.

## Stacking

The documented below-stack order is token-bound:

- `--nf-z-card` = 2: the parent card stays above its below stack so its bottom add-sibling control
  and chrome remain clickable.
- `--nf-z-lane` = 1: the anchored callout lane paints above the direct-child group. The safe zone
  and wrap rule are still the primary layout guarantee; the order is a safety net so an anchor child
  can never be hidden behind a direct child during a transient measure or reflow state.
- `--nf-z-right-group` = 0: the direct-child group stays behind the lane.
- `--nf-z-edge` = 0: the SVG edge layer sits below the cards.

`CalloutLaneView` resolves the parent card on every alignment pass and observes the host, so a lane
that mounts before its card still receives `--nf-lane-width` and `--nf-callout-offset`.

## Colors, borders, typography

These remain CSS variables in `styles.css` (`--surface-*`, `--border-*`, `--text-*`, `--accent*`,
fonts). They are part of the same design system but are not duplicated in the TS token module yet.

## Shell spacing decisions

Ratified by the product owner on 6 November 2026 and wired in M3h4:

- **`editorPaddingBottom` = 88 px**, matching the rendered CSS (the old unused token said 96).
- **`chapterGap` = 28 px**, matching the rendered CSS (the old unused token said 32).
- `siblingGap` = 24 px and `callout.safeGap` = 16 px minimum are unchanged.
- Do not silently pick a different value in a component; change the token and its guard.

## Future settings

The planned M6 settings UI maps user choices (Compact/Comfortable, colors, borders, indents, gaps) to
token overrides. Settings must not introduce component-local styling; they change the token values.
Because CSS-bound tokens are root variables, an override can be applied at the root without editing
component styles.

## Future resize tokens (post-M4, not scheduled)

Planned in `docs/tasks/future-manual-resize.md`; do not add these to `DESIGN_TOKENS` until the slice
is scheduled.

- **Image `displayWidth`**: `0.25 | 0.5 | 0.75 | 1` of the block content width, height auto,
  anchors unchanged. Values are a snap ladder, not free pixels.
- **Block `widthHint`**: `narrow | normal | wide | full` as a preference over the available band;
  `normal` = absent = today's adaptive width. Layout clamps to content minimum and page width.
- No manual height and no manual position tokens: height stays content-driven and paginated, and
  page geometry remains derived. A future free-resize request needs a new ADR.
