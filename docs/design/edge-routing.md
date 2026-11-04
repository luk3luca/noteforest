# Edge routing design — parent-relative branches (M2e)

**Status:** Decided (4 November 2026)  
**Owner:** Builder  
**Applies to:** `apps/desktop/src/renderer/src/lib/edge-routing.ts` and
`editor/edges/EdgeLayer.tsx`  
**Scope:** primary branch arrows in the M2 editor. Reference edges, page wraps,
and PDF arrows are M3/M4. The wrapped case in the lab is a reference for the M4
page renderer, not a product behavior in M2e.

## Why this lab exists

The M2d router used an SVG `marker` for the arrowhead and placed the shared
trunk in the middle of a 16 px parent → child gap. With a 16 px gap and a 6 px
tip gap, the final horizontal segment was 6 px — shorter than the arrowhead.
The marker then squashed or overlapped the child card. M2e replaces the marker
with a **fixed-size polygon** and reserves a **12 px horizontal stem** before
every arrowhead.

The lab (`docs/design/edge-routing-lab.html`) is static and dev-only. It renders
the same card rectangles and the real branch cases side by side, with each
variant implementing the same contract:

- arrowhead is a fixed 6 × 6 px polygon at the endpoint;
- the final segment into a right-hand child is horizontal and ≥ 12 px;
- the path only moves parent → child (x never decreases);
- the first child's path is continuous from the parent port, and a shared trunk
  starts at that child's T-junction;
- short stems are drawn as dashed defects instead of being hidden.

Card rectangles use the editor metrics: top-level 160–480 px, child 144–420 px,
16 px parent → child gap, 10 px card padding. The cases are deliberately small
fixtures so the path shape is judged, not the note content.

## Cases

| Case | What it stresses |
|---|---|
| One child centered | A straight branch with no vertical segment. |
| One child above / below (dy 12) | A short vertical detour near the parent port. |
| One child far above / below (dy 58–70) | Long vertical run; the final stem must stay horizontal. |
| Two / three children at a 16 px gap | Shared trunk; T-junction; separate stems. |
| Five children at a 16 px gap | Trunk legibility and arrowhead separation. |
| First child above the parent center | The trunk starts above the parent port; the first path must still be continuous. |
| Close parent → child (16 px gap) | The stem is exactly 12 px, the minimum; the arrowhead must not squash. |
| Trunk with a far child | The trunk spans a long distance without bending. |
| Page-width wrap (M4 reference) | Bottom trunk + bus + down arrowheads; not used by the editor. |

Screenshots (1440×900 and 1024×768 for every variant):

- `artifacts/m2e/routing-lab-v1-1440x900.png`, `…-1024x768.png`
- `artifacts/m2e/routing-lab-v2-1440x900.png`, `…-1024x768.png`
- `artifacts/m2e/routing-lab-v3-1440x900.png`, `…-1024x768.png`
- `artifacts/m2e/routing-lab-v4-1440x900.png`, `…-1024x768.png`

`artifacts/` is gitignored; the files are on disk in the builder worktree.
Regenerate with `node scripts/capture-routing-lab.mjs`.

## Variants

### V1 — orthogonal elbow per child

Each child leaves the same parent port, runs to a private lane, then turns at
its own child center. Fixed arrowhead and minimum stem are applied.

- **Pros:** simplest; one-child case is clean; no trunk state.
- **Cons:** with 2+ children the vertical runs stack on top of each other. The
  result looks like a trunk but has no defined T-junction, and the parent stub
  becomes progressively heavier. There is no single path that owns the shared
  vertical.

### V2 — fan / staggered ports

Close children leave from distributed ports on the parent's right edge.

- **Pros:** close children have visibly separate origins; the trunk is avoided.
- **Cons:** ports are only as tall as the parent card. With five children the
  fans cross each other immediately outside the card, and the reading order is
  harder to follow. The arrowhead is fine, but the branch topology is not.

### V3 — soft S for near-aligned cards

Children within 24 px of the parent center join with a short S-curve; all other
children use an orthogonal elbow. The last 12 px are straight, so the arrowhead
points right.

- **Pros:** the near-aligned case reads as a gentle connector rather than a
  kink.
- **Cons:** mixes two visual languages in one branch group. With several
  near-aligned children the curves overlap and their relative order is unclear.
  It also adds a curve-vs-line distinction that carries no meaning in the
  document.

### V4 — shared trunk + short branches (chosen)

One trunk at the parent's branch lane. The first (topmost) child owns the path
`parent port → lane → trunk start → child`; the trunk starts exactly at that
child's T-junction. Every other child is a short horizontal stem from the trunk
to a fixed arrowhead. The lane is placed as close to the parent as needed to
keep 12 px of stem before the tip.

- **Pros:** one readable vertical, one T-junction, separate short arrows, no
  crossing, and the first child's path is continuous. It scales to five or more
  children and matches the product language: a branch group has one spine.
- **Cons:** with the 16 px parent → child gap the lane sits only 2 px outside
  the parent card. That is tight, but the arrowhead and the 12 px stem remain
  legible, and the lane moves right (up to +14 px) when the gap is wider.

## Decision

**V4 is chosen.** Reasons:

1. It preserves the shared-trunk behavior the product owner approved in M2c and
   the M2e brief, while fixing the squashed arrowhead.
2. It is the only variant with an explicit, testable T-junction: the first path
   starts at the parent port, and the trunk starts on that path. No gap, no
   duplicate parent stub.
3. It behaves the same for one, two, three, and five children. V1 and V2 change
   character as the group grows.
4. Its geometry is deterministic and cheap: one lane x, one trunk, one short
   stem per child.

## Geometry contract

All values live in `lib/geometry.ts` and are asserted by
`apps/desktop/test/edge-routing.test.ts`.

| Token | Value | Meaning |
|---|---:|---|
| `edgeTipGap` | 2 px | Space between the arrow tip and the child's left edge. |
| `edgeArrowLength` | 6 px | Fixed polygon length along the branch direction. |
| `edgeArrowHalfWidth` | 3 px | Fixed polygon half-width. |
| `edgeStemMin` | 12 px | Minimum final horizontal segment from the lane to the tip. |
| `edgeLaneMax` | 14 px | Maximum lane offset from the parent's right edge. |
| `edgeLaneMin` | 2 px | Minimum lane offset; the 16 px gap lands here. |

For a right-hand child:

```text
parentRight = parent.x + parent.width
tipX        = child.x - edgeTipGap
laneX       = clamp(tipX - edgeStemMin, parentRight + edgeLaneMin, parentRight + edgeLaneMax)
stem        = tipX - laneX                 // must be >= 12, else defect
```

With the fixed 16 px gap, `tipX - 12 = parentRight + 2`, so the lane is 2 px
outside the parent. The arrowhead is the triangle
`(tipX, y) (tipX − 6, y − 3) (tipX − 6, y + 3)`; it never scales. The line ends
at the tip, but the filled polygon covers the last 6 px, so the visible stem
before the arrow base is `stem − 6`.

For wrapped (M4 reference) children the bus sits 16 px above the first child
row, leaving a 14 px vertical stem to a down-pointing fixed arrowhead. The
editor does not produce wrapped children in M2e.

## Implementation notes

- `routeChildGroup` sorts right-hand children by center y for trunk topology and
  emits one `RoutedEdge` per child plus one trunk. Edges carry an explicit
  `arrow` path; `EdgeLayer` renders it as a filled polygon with the same
  active/muted/defect state as the line.
- No `marker-end` is used anywhere in the editor.
- The first child's path is built by `branchConnectorPath`, which keeps the
  T-junction as an explicit vertex when the parent port and the first child are
  at the same y.
- A group whose stem would be shorter than 12 px is flagged `defect`; the
  dashed warning path stays visible so a layout regression is not silent.
- The lane is independent of tree depth: parent-relative placement means every
  parent gets its own local lane and its own trunk.
