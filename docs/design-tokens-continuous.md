# Continuous design tokens

**Status:** Active (R6 global Continuous settings, 13 November 2026)
**Source of truth:** `apps/desktop/src/renderer/src/lib/design-tokens.ts` (`DESIGN_TOKENS`,
`DESIGN_TOKEN_CSS_VARIABLES`), `apps/desktop/src/renderer/src/lib/apply-design-tokens.ts`,
`apps/desktop/src/renderer/src/styles.css`, `apps/desktop/src/shared/view-state.ts`,
`packages/layout/src/continuous-settings.ts` (R6 defaults/clamp/resolution), and the shared
`packages/layout/src/edge-style.ts`.
**Index:** [`design-tokens.md`](design-tokens.md). **Page:** [`design-tokens-page.md`](design-tokens-page.md).

Continuous is the working canvas. It has its own shell tokens and per-document view state; it never
calls `layoutDocument` and never reads `PageTheme`/`PageSettings`. Values that are equal on Page and
Continuous are coincidental unless this document lists them as shared primitives.

## Continuous zoom and view state

| Value | Default | Range | Owner |
|---|---:|---:|---|
| `DocumentViewState.zoom` | 1 | 0.5–2, 0.01 step | Per-document view state |
| `DocumentViewState.pageZoom` | 1 | 0.1–2.5, 0.01 step | Page view state (Page navigation, not a Page design token) |
| `DocumentViewState.layout` | `continuous` | `continuous` / `page` | Per-document view state |
| `DocumentViewState.interactionMode` | `edit` on Continuous, `read` on Page | `edit` / `read` | Per-document view state |

There is no separate `ContinuousSettings.zoom`: the only Continuous zoom is
`DocumentViewState.zoom`, applied by `DocumentEditor`. R6 adds the global `continuous`
namespace (`spacing`, `arrows`, `widths`) for canvas geometry only; zoom is not a Settings
control and there is no global zoom default. Future Continuous view-style or manual-break
fields do not belong in `PageTheme`.

## R6 global Continuous settings

`AppSettings.continuous` (settings.json schema v5) is global-only. The pure source is
`packages/layout/src/continuous-settings.ts`: defaults, ranges, snapping, canvas floor, CSS
variables, and the resolved Continuous edge style.

| Field | Default | Range | Step |
|---|---:|---:|---:|
| `spacing.chapterGap` | 28 | 16–48 | 1 |
| `spacing.siblingGap` | 24 | 12–40 | 1 |
| `spacing.childRowGap` | 16 | 8–32 | 1 |
| `arrows.width` | 1.25 | 0.75–2.5 | 0.25 |
| `arrows.activeWidth` | 1.75 | 1.25–3, ≥ resting | 0.25 |
| `arrows.mutedWidth` | 1 | 0.5–2 | 0.25 |
| `arrows.size` | 6 | 4–10 | 1 |
| `widths.canvasMax` | 3200 | 2400–4800 | 100 |
| `widths.topLevelMax` | 480 | 320–640 | 20 |
| `widths.childMax` | 420 | 280–560 | 20 |

`continuousCanvasFloor` is `topLevelMax + siblingGap + childMax + 16 px edge corridor`; a
smaller canvas cap is raised to that floor. The renderer resolves the values into
`--nf-chapter-gap`, `--nf-child-gap`, `--nf-child-row-gap`, `--nf-canvas-max`,
`--nf-top-level-max-width`, `--nf-child-max-width`, and the three `--nf-edge-width*`
variables, scoped to the Continuous surface (and the Settings preview stage). Arrow
length/half-width and the three stroke widths are resolved by `continuousEdgeStyle` for
the Continuous router. The root `DESIGN_TOKENS` map remains the boot/default fallback, so a
migrated v4 file draws the same canvas.

Page Read/Edit, measurement, and the PDF print compositor never read this namespace: they
read `PAGE_EDGE_STYLE`, `PAGE_EDGE_GEOMETRY`, `PageTheme`, `PageChrome`, and `--paper-*`.
Isolation is guarded by `apps/desktop/test/continuous-settings-isolation.test.ts`.

## Canvas and shell tokens

`DESIGN_TOKENS` is the only numeric source for the shell. Every value that CSS needs is exported as
a root custom property from `DESIGN_TOKEN_CSS_VARIABLES`; `applyDesignTokens()` writes the map to
`document.documentElement` before the React root mounts. `styles.css` consumes `var(--nf-*)` and
never repeats the literal.

| Token | CSS variable | Value | Used for |
|---|---|---:|---|
| `canvasMaxWidth` | `--nf-canvas-max` | 3200 px | Finite wide canvas; placement uses the 3200 px cap minus the lateral inset |
| `editorPaddingX` | `--nf-canvas-pad-x` | **24 px** | Canvas horizontal padding (chapter/card inset; covers the 16 px gutter and drag handle) |
| `editorPaddingTop` | `--nf-canvas-pad-top` | 6 px | Canvas top inset below the fixed header |
| `editorPaddingBottom` | `--nf-canvas-pad-bottom` | **8 px** | Canvas bottom inset (shell C) |
| `editorPaddingXMedium` | `--nf-canvas-pad-x-medium` | **20 px** | Canvas padding at ≤1100 px |
| `editorPaddingTopMedium` | `--nf-canvas-pad-top-medium` | 6 px | Canvas padding at ≤1100 px |
| `editorPaddingBottomMedium` | `--nf-canvas-pad-bottom-medium` | 8 px | Canvas padding at ≤1100 px |
| `editorPaddingXCompact` | `--nf-canvas-pad-x-compact` | **16 px** | Canvas padding at ≤900 px |
| `editorPaddingTopCompact` | `--nf-canvas-pad-top-compact` | 6 px | Canvas padding at ≤900 px |
| `editorPaddingBottomCompact` | `--nf-canvas-pad-bottom-compact` | 8 px | Canvas padding at ≤900 px |
| `pageStagePaddingX` | `--nf-page-stage-pad-x` | 0 px | Page stage lateral padding (frame only; Page sheet unchanged) |
| `pageStagePaddingTop` | `--nf-page-stage-pad-top` | 14 px | Page stage top padding |
| `pageStagePaddingBottom` | `--nf-page-stage-pad-bottom` | 8 px | Page stage bottom padding |
| `chapterGap` | `--nf-chapter-gap` | **28 px** | Continuous chapter gap (R6 default; user may override) |
| `siblingGap` | `--nf-child-gap` | 24 px | Parent card/lane → direct-child group (R6 default) |
| `childRowGap` | `--nf-child-row-gap` | 16 px | Vertical gap between sibling blocks (R6 default) |
| `cardPadding` | `--nf-card-padding` | 10 px | Continuous card padding |
| `cardRadius` | `--nf-card-radius` | 4 px | **Shared** card/block-image radius (Page cards use it too) |
| `noteRadius` | `--nf-note-radius` | 9 px | Continuous note-card surface radius only (Page cards/print keep `cardRadius`) |
| `childMinWidth` | `--nf-child-min-width` | 144 px | Continuous child card minimum |
| `childMaxWidth` | `--nf-child-max-width` | 420 px | Continuous child card maximum (R6 default) |
| `topLevelMinWidth` | `--nf-top-level-min-width` | 160 px | Continuous top-level card minimum |
| `topLevelMaxWidth` | `--nf-top-level-max-width` | 480 px | Continuous top-level card maximum (R6 default) |
| `rowIndent` | `--nf-row-indent` | 26 px | Continuous below-stack rows from the lane left |
| `edgeWidth` | `--nf-edge-width` | 1.25 | Continuous primary/reference edge stroke (R6 default) |
| `edgeWidthActive` | `--nf-edge-width-active` | 1.75 | Continuous selected path stroke (R6 default) |
| `edgeWidthMuted` | `--nf-edge-width-muted` | 1 | Continuous unselected path stroke (R6 default) || `zIndex.edge` | `--nf-z-edge` | 0 | Edge layer |
| `zIndex.rightGroup` | `--nf-z-right-group` | 0 | Direct-child group |
| `zIndex.calloutLane` | `--nf-z-lane` | 1 | Callout lane |
| `zIndex.parentCard` | `--nf-z-card` | 2 | Parent card |

Canonical shell values are ratified and guarded: **8 px** lateral canvas padding (**6 px** at the
compact step) with **8 px** bottom padding, **28 px** Continuous chapter gap, **24 px** child gap,
and `callout.safeGap` **16 px as a minimum**. The chapter title's old −2 px optical offset is removed,
so its visible block starts at the same inset as the cards. The responsive canvas steps and the Page
stage frame (14 px top, 0 px lateral, 8 px bottom) are token-bound, so no padding literal remains in
CSS.

`wrapIndent` (18 px) is a reserved shell numeric that is not consumed by Continuous CSS today; the
Page engine has its own per-level `wrapIndent` contract in
[`design-tokens-page.md`](design-tokens-page.md#wrap-and-indent-semantics). Do not treat the two
18 px values as one token.

## Router-only Continuous tokens

These values never appear in CSS; they feed `geometry.ts` / `edge-routing.ts` / `page-routing.ts`
(SVG coordinates or placement math). They stay in the shared TS modules so the renderer, the Page
router, and the print model cannot disagree.

| Token | Value | Used for |
|---|---:|---|
| `calloutGap` | 16 px | Anchor → callout offset when the anchor is farther right |
| `calloutMinWidth` | 240 px | Minimum independent callout lane width |
| `calloutMaxWidth` | 480 px | Maximum callout lane width |
| `callout.maxAnchorOffset` | 160 px | Maximum callout left offset from the parent card left |
| `callout.safeGap` | 16 px minimum | Minimum gap between the callout right edge and the direct-child group |

## Continuous-only runtime variables

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

These variables are Continuous-only. Page measurement and Page content styles must not read them.

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

## Shared edge primitives

Continuous, Page Read/Edit, and the PDF print model share one visual language but **not one style
object**. `packages/layout/src/edge-style.ts` owns three frozen-style contracts:

- `CONTINUOUS_EDGE_STYLE` — the only edge style the Continuous canvas reads. It carries the shared
  geometry and stroke values.
- `PAGE_EDGE_STYLE` — the only edge style Page layout, the page router, the Page renderer, and the
  print model read. It adds the Page-only route-search values.
- `EDGE_STYLE` — the shared/base default kept for one release. It is the default argument of the
  path helpers, never a surface style. A Page/print module that read it would let a future
  Continuous edge setting drift the paper; guard:
  `packages/layout/test/edge-style-isolation.test.ts`.

The pure path/arrow algorithms moved to `packages/layout/src/edge-path.ts`
(`roundedPath`, `simplifyPath`, `arrowPoints`, `arrowPath`, `arrowDirectionVector`,
`openArrowPath`, `openArrowForDirection`). Each arrow helper takes the style it must use and
defaults to `EDGE_STYLE`, so existing callers keep their signature. `DESIGN_TOKENS` re-exports the
Continuous values as `GEOMETRY`; do not add a second copy.

R6 resolves `continuousEdgeStyle(settings)` from the global Continuous settings: it overrides
`arrowLength`/`arrowHalfWidth` (one fixed size) and `edgeWidth`/`edgeWidthActive`/`edgeWidthMuted`,
then keeps every other Continuous primitive unchanged. The renderer passes that object to
`EdgeLayer`; the Page surface never sees it.

| Token | Value | Used for |
|---|---:|---|
| `gap` | 2 px | Arrow-tip gap before the card |
| `radius` | 2 px | Maximum corner rounding; corners are near-right angles |
| `stemMin` | 12 px (Continuous) / 14 px (Page corridor) | Final horizontal segment before every arrowhead; the Page value comes from `PAGE_EDGE_GEOMETRY.stem` |
| `laneMin` / `laneMax` | 2 / 14 px | Shared trunk lane offsets from the parent edge |
| `trunkInset` | 12 px | Below trunk start from the parent card left |
| `trunkGap` | 0 px | Below trunk starts attached to the parent card bottom |
| `arrowLength` | 6 px | Fixed arrowhead length |
| `arrowHalfWidth` | 3 px | Fixed arrowhead half-width |
| `edgeWidth` / `edgeWidthActive` / `edgeWidthMuted` | 1.25 / 1.75 / 1 | Path stroke widths |
| `minGap` | 4 px | Minimum routed segment gap |
| `referenceArrowLength` / `referenceArrowSpread` | 7 px / 0.46 | Open reference chevron |

`DESIGN_TOKENS` re-exports the shared values as `edgeRadius`, `edgeGap`, `edgeArrowLength`,
`edgeArrowHalfWidth`, `edgeLaneMin`, `edgeLaneMax`, and `edgeMinGap`; these are aliases of the
`CONTINUOUS_EDGE_STYLE` rows above, not a second source. The Page-only route values
(`pageClearance`, `pageLaneStep`, `pageTurnPenalty`) are `PAGE_EDGE_STYLE` fields documented in
[`design-tokens-page.md`](design-tokens-page.md#page-route-and-shared-edge-values).


Continuous and Page arrows share the fixed arrowhead shape/fill rules and the near-right corner
radius, but each surface owns its stroke width and arrowhead size: Continuous resolves them from
the R6 settings (defaults 1.25/1.75/1 and 6 px), while Page keeps `PAGE_EDGE_STYLE` (1.25/1.75/1
and 6 px). The final stem is surface-owned: Continuous keeps 12 px, Page uses the fixed 14 px
corridor (`PAGE_EDGE_GEOMETRY`). Reference edges are dashed with an open chevron and never join the
primary V4 trunk. Page group trunks add continuity across pages; their attachment rule uses the
same `trunkGap` 0 and the corridor stem, documented in the Page doc.

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
fonts). They are part of the same shell design system but are not duplicated in the TS token module
yet. Page skin colors (`--nf-page-ink` and the related Page color variables) are Page-only and are
not Continuous tokens.

Stored text highlights (`highlight` mark, one `tone`) are a background tint at the ratified
strengths of the live roles: `--nf-highlight-blue` is the accent at 20 %, `green` is `--success` at
20 %, `amber` is `--warning` at 22 %, and `rose` is `--danger` at 18 %, each mixed with
`transparent` so the note surface shows through. The mark's span changes no other property (the text
colour is inherited), so it cannot move text or the canvas. Page and PDF override these variables
with their own fixed light paper tones; see
[`design-tokens-page.md`](design-tokens-page.md#paper-colours-stored-highlights).

Continuous cards use their own surface roles: `--note-surface` (`#1b1d20` dark, `#f2f6f9` light) and
`--note-surface-hover` (`#202329`, `#e9f0f5`). Cards never use `--surface-1`: in light that role is
white and equals the canvas. Top-level and child cards share the same surface.

Resting primary edges derive from the accent: `--edge: var(--accent-strong)` (the same value as
`--edge-active`), so an unselected tree already reads as one accent-colored structure. Selection is
carried by width, not a second color: the selected path uses `--nf-edge-width-active` 1.75, every
other branch uses `--edge-muted` (`#565f68` dark, `#9aa5ad` light, 0.35 opacity); the selected
card's accent ring remains the block cue. Reference edges keep their neutral, lower-emphasis dashed
stroke through `--edge-reference` (`#7b858f` dark, `#6c7882` light) and never become accent unless
the reference itself is selected. Stroke widths (1.25 / 1.75 / 1) and the 6 × 3 arrowhead are
unchanged. Page/PDF edge colors and the Page stroke width are a separate skin; see
[`design-tokens-page.md`](design-tokens-page.md#page-route-and-shared-edge-values).

## Future resize tokens (post-M4, not scheduled)

Planned in `docs/tasks/future-manual-resize.md`; do not add these to `DESIGN_TOKENS` until the slice
is scheduled.

- **Image `displayWidth`**: `0.25 | 0.5 | 0.75 | 1` of the block content width, height auto,
  anchors unchanged. Values are a snap ladder, not free pixels.
- **Block `widthHint`**: `narrow | normal | wide | full` as a preference over the available band;
  `normal` = absent = today's adaptive width. Layout clamps to content minimum and page width.
- No manual height and no manual position tokens: height stays content-driven and paginated, and
  page geometry remains derived. A future free-resize request needs a new ADR.

## Historical note

Before M4e3 this document's content lived in one mixed `design-tokens.md` with the Page values. The
split is behavior preserving. The old planned token-override model is superseded by ADR-0008; future
Settings work targets the Page or Continuous namespace above.
