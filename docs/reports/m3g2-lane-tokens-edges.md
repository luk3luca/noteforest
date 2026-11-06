# M3g2 — Callout lane width, right-group push, and tighter edges

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-8aab03c7`  
**Branch:** `t3/m3g2-lane-width-edge-radius`  
**Base:** `f4e4f0c` (`main`: docs: start M3g2 lane width, push, and edge radius)  
**Scope:** lane width/push, callout/trunk indentation, and 2 px edge elbows only. No unified-flow
model, settings UI, image anchors, paste/duplicate UI, page/PDF, schema bump, dependency, or new
critical e2e.

## Summary

The callout lane is now a bounded, independent column: `clamp(parent.width, 240, 480)` on the
stable fallback. The 160 px parent in the new fixture keeps its 160 px card, while its callout lane
is 240 px. The direct-child group starts at `max(parent.right, lane.right) + siblingGap`, so only
the lane's 80 px excess past the narrow parent pushes it; at 960 px the same budget causes the long
direct child to join the below stack after the callout instead of overflowing.

The callout card and the shared below trunk are indented together from the same lane left edge:
trunk `x = lane.left + 12`, callout/direct row left `= lane.left + 26`, arrow tip `2 px` before the
row card, which leaves the fixed 12 px final stem. All primary elbow radii dropped from 6 px to
2 px; a below elbow never rounds away the required 12 px stem, so the minimum-indent row stays a
true right angle.

## Design tokens (single source)

New `apps/desktop/src/renderer/src/lib/design-tokens.ts` is the only place these values are
declared. `geometry.ts` re-exports them as `GEOMETRY`; layout, router, CSS-facing helpers, and tests
import from that module instead of introducing local numbers.

| Token | Value |
|---|---|
| `rowIndent` | 26 px |
| `trunkInset` | 12 px |
| `stemMin` | 12 px |
| `siblingGap` / `childGap` | 16 px |
| `calloutGap` | 16 px |
| `calloutMinWidth` | 240 px |
| `calloutMaxWidth` | 480 px |
| `edgeRadius` | 2 px |
| `edgeGap` | 2 px |
| `edgeArrowLength` × `edgeArrowHalfWidth` | 6 × 3 px (fixed 6 × 6 arrowhead) |
| `topLevelMinWidth` … `topLevelMaxWidth` | 160 … 480 px |
| `childMinWidth` … `childMaxWidth` | 144 … 420 px |

**Natural callout width (recorded fallback).** The lane-width helper accepts an optional measured
natural width, but the renderer uses the fallback
`calloutLaneWidth(parentWidth) = clamp(parentWidth, 240, 480)`. Measuring a rich callout's
max-content width requires a clone/measure pass that feeds back through the lane's own
ResizeObserver; that measurement was not stabilised in this task, so the brief's documented fallback
is used. The lane still never collapses below 240 px, which is the product-owner-visible fix, and
passing a measured width later only raises the lane inside the same clamp.

## Before / after geometry

Fixture: top-level “Narrow” parent (160 px card) + one text-anchored callout + two direct children
(`R`, a long sentence), measured in content coordinates.

| Measurement | Before | After |
|---|---|---|
| Parent card | `160 × 52` at `x 0` | `160 × 52` at `x 0` |
| Lane width | `160` (collapsed to parent) | `240` (independent floor) |
| Lane/content bounds | `x 0 … 160` | `x 0 … 240` |
| Right group left (1440) | `176` (`parent.right + 16`) | `256` (`max(160, 240) + 16`) |
| Callout card left / right | `26 / 102.1` | `26 / 102.1` |
| Below trunk x | — (single callout edge starts at `12`) | `12` |
| Row left − trunk x | `14` | `14` |
| Final horizontal stem | `12` | `12` |
| Edge elbow radius | `6` | `2` |

At 960 px the after-state wraps the long direct child:

| Measurement | Before | After |
|---|---|---|
| Long direct child | right at `x 176`, width `420` | below at `x 26`, width `214`, right `240` |
| Short direct child | right at `x 176` | right at `x 256` |
| Below rows | one callout | callout, then wrapped direct child |
| Shared trunk | callout edge only | one trunk `x 12` from `parent.bottom` through both rows |

The right group is pushed only by `max(0, lane.right - parent.right)` = 80 px, not by the full lane
length. The callout card stays at its natural 76.1 px width; the lane bounds it at `213.5 px`
(`240 - 26`) for longer content.

## Edge routing

- Right/primary elbows use `edgeRadius = 2`; tests parse every `Q` segment and assert each corner
  cut is at most 4 px (2 px token + rounding tolerance).
- `roundedPath` now emits a true `L` corner when the effective radius is zero, instead of a
  degenerate `Q` at the same point.
- The first right edge keeps a sharp T-junction with its trunk; only the parent-side corner is
  rounded.
- A single below row rounds its elbow only by `min(edgeRadius, horizontalRun - stemMin)`. At the
  26 px minimum row indent the run is exactly 12 px, so the elbow stays sharp; with a farther-right
  anchor it rounds by up to 2 px while preserving the 12 px straight stem.
- Arrowheads remain fixed 6 × 6 px, independent of path length; no arc commands are emitted.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/design-tokens.ts` | New single-source token module (values above). |
| `apps/desktop/src/renderer/src/lib/geometry.ts` | `GEOMETRY` now derives from `DESIGN_TOKENS`; added `calloutLaneWidth`, `lanePush`, `rightGroupStart`; renamed `edgeStemMin`/`belowTrunkInset`/`belowRowInset` to `stemMin`/`trunkInset`/`rowIndent`. |
| `apps/desktop/src/renderer/src/lib/edge-routing.ts` | 2 px elbows, zero-radius true corners, below-elbow radius limited by remaining stem, token renames. |
| `apps/desktop/src/renderer/src/lib/child-placement.ts` | Right/below decision reserves `max(parent.right, lane.right) + gap`. |
| `apps/desktop/src/renderer/src/editor/useBelowStackPlacement.ts` | Passes the bounded lane width for parents with live callouts. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Measures the bounded lane, publishes `--nf-lane-width` on the lane host, sets rows at `lane.left + rowIndent`, bounds rows by lane right. |
| `apps/desktop/src/renderer/src/styles.css` | Right group starts after `--nf-lane-width + childGap`; parent card keeps its measured width inside a wider lane; lane measure can exceed the narrow card. |
| `apps/desktop/test/geometry.test.ts` | Token assertions, lane clamp/push formula tests. |
| `apps/desktop/test/edge-routing.test.ts` | Token renames, near-right-corner checks, minimum/flexible below-elbow radius tests. |
| `apps/desktop/test/placement.test.ts` | Lane-aware right/below budget and “only excess pushes” tests. |
| `tests/ui/m3-anchor-callout.test.mjs` | Existing assertions moved to the `max(parent.right, lane.right) + gap` contract; new 160 px-parent test at 1440/960 with trunk/row indentation, no-overflow/overlap and small-radius checks; two M3g2 screenshots. |
| `docs/reports/m3g2-lane-tokens-edges.md` | This report. |

No spec, UX, ADR, schema, fixture, dependency, or critical e2e change.

## Tests and evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| targeted `vitest` (geometry, edge-routing, placement, tree) | 55/55 pass |
| `npm test` | 480/480 pass, 43 files, 2.01 s (was 474) |
| `node --test tests/ui/m3-anchor-callout.test.mjs` | 6/6 pass; suite 4.55 s, process 12.7 s |
| `npm run test:ui` | 24/24 pass across 11 files (was 23; +1 narrow-lane UI test) |
| `npm run verify:fast` | pass; critical e2e 21/21, suite 45.8 s, process 54.0 s |

UI tests use condition-based waits (`waitLayout`, `waitForFunction`, callout-offset/lane-width
waits); no fixed sleeps, no native dialogs, hidden window. The critical e2e count is unchanged at
21. Per the brief, the full `npm run verify` was not run; the Orchestrator runs it at integration.

Screenshots (gitignored artifacts):

- `artifacts/m3g2/narrow-lane-1440x900.png` — 160 px parent, 240 px lane, both direct children right.
- `artifacts/m3g2/narrow-lane-960x900.png` — same lane, long direct child wrapped after the callout,
  short direct child still right.

## Risks and follow-ups

- **Natural width is a fallback.** The lane uses `clamp(parent.width, 240, 480)`; a long callout is
  wrapped inside the same bounded column instead of widening the lane to its natural text width.
  Adding a stable measure pass would allow content-driven lane widths without a layout loop.
- **Wide parents still set the lane width.** With the fallback, a 460 px parent yields a 460 px lane
  even when its callout is short. The min/max bound and the 2 px edges are correct, but the lane is
  not content-driven above the 240 px floor.
- **Nested callouts** inherit the parent's lane variable until their own layout effect sets it. The
  nested lane overrides it on its own host; no UI test covers a two-level callout chain yet.
- **Sub-pixel lane width** is rounded to an integer before publishing; the placement hook uses the
  measured card width from `useBlockRects` (rounded to 0.5), so threshold decisions can differ by
  at most 0.5 px. The fit checks use a 0.5 px tolerance.
- Image anchors and the M3c3b image pipeline remain blocked; M4/PDF remain blocked until M3 is
  accepted.

## Next step

Sentinel M3 review, then the Orchestrator's integration `npm run verify`. M4/PDF remain blocked until
M3 is accepted.
