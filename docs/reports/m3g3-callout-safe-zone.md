# M3g3 — Callout safe zone and anchor-offset cap

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/576b36a8`  
**Base:** `9e20789` (`main`: docs: start M3g3 callout safe zone)  
**Scope:** callout safe-zone geometry, 160 px anchor-offset cap, and direct-child wrap fallback only. No
unified-flow model, settings UI, image anchors, paste/duplicate UI, page/PDF, schema bump,
dependency, or new critical e2e.

## Summary

The callout row is now placed inside a bounded safe zone. Its left edge is capped at
`parent.left + 160` and its right edge stops at least `16 px` before the direct-child group at
`max(parent.right, lane.right) + siblingGap`. The old `lane.right - childMinWidth` clamp (144 px) is
gone; the minimum reservation is now the 240 px callout minimum.

When the safe zone cannot fit 240 px after the shared 26 px row indent, every direct child wraps
below after the callouts and shares the left trunk. This overrides both the normal measured
right/below budget and the lone-chain D23 rule, because a right child column would otherwise take
the space the callout needs. The wrap decision depends only on the parent width and the bounded lane
width; it never depends on the rendered group position, so it cannot oscillate between measure
passes.

At the 240 px lane floor the usable width after the row indent is 214 px. The clamp falls back to the
shared row origin instead of returning a left edge before the indent; the wrap rule removes the child
column from that lane. This is the documented physical floor, not a silent overlap.

## Design tokens

The new values live in `apps/desktop/src/renderer/src/lib/design-tokens.ts`; `geometry.ts` re-exports
them as `GEOMETRY`. Existing tokens are unchanged.

| Token | Value |
|---|---:|
| `callout.maxAnchorOffset` | 160 px |
| `callout.safeGap` | 16 px |
| `rowIndent` | 26 px (unchanged) |
| `trunkInset` | 12 px (unchanged) |
| `calloutMinWidth` | 240 px (unchanged) |
| `calloutMaxWidth` | 480 px (unchanged) |
| `calloutGap` | 16 px (unchanged) |
| `siblingGap` / `childGap` | 16 px (unchanged) |

`docs/design-tokens.md` now documents the safe-zone formulas, the wrap rule, and the 214 px
usable-width note at the lane floor.

## Safe-zone geometry

`geometry.ts` exposes `calloutRightGroupX`, `calloutSafeRight`, `calloutSafeZoneWidth`,
`calloutNeedsWrap`, and `placeCallout`:

```text
laneWidth        = clamp(max(parent.width, natural callout width), 240, 480)
rightGroupX      = max(parent.right, lane.right) + siblingGap
calloutSafeRight = rightGroupX - callout.safeGap
minimumLeft      = lane.left + rowIndent
safeMaximumLeft  = max(minimumLeft,
                       min(parent.left + callout.maxAnchorOffset,
                           calloutSafeRight - calloutMinWidth))
calloutLeft      = clamp(anchorX + calloutGap, minimumLeft, safeMaximumLeft)
calloutWidth     = min(laneWidth - rowIndent, calloutSafeRight - calloutLeft)
```

The renderer passes the measured parent card width and lane-local anchor offset into `placeCallout`.
`--nf-callout-offset` is the rounded left edge; the dot and dotted leader keep their existing
relative geometry. Rows never move before the shared indent or past the safe right.

## Wrap fallback

`planDirectChildPlacement` accepts `calloutSafeWidth`. Before the single-child shortcut, it returns
every direct child in the below group when:

```text
calloutSafeRight - (lane.left + rowIndent) < calloutMinWidth
```

`useBelowStackPlacement` computes the lane width with the same integer rounding the renderer
publishes, so the decision and the rendered lane cannot disagree by a sub-pixel. The below stack is
assembled by the adapter in deterministic D3 order: anchored callouts first, then wrapped direct
children in branch order, all in one lane and one shared left trunk.

## Measured UI geometry

Fixtures are created through the existing structural test API; all coordinates are content-local
layout pixels measured at 100% zoom.

### 160 px parent (safe zone under 240 px)

Parent `160 × 52`, lane `240` (`--nf-lane-width: 240px`), anchor “Narrow”.

| Measurement | 1440 | 960 |
|---|---:|---:|
| Parent card | `0 … 160` | `0 … 160` |
| Lane | `0 … 240` | `0 … 240` |
| Callout row offset | `26 px` | `26 px` |
| Callout card | `26 … 102.13` | `26 … 102.13` |
| Direct row 1 (`R`) | `26 … 55.86` | `26 … 55.86` |
| Direct row 2 (long) | `26 … 240` | `26 … 240` |
| Right group | empty (wrapped) | empty (wrapped) |
| Shared below trunk | `x 12`, parent bottom → last row center | same |
| Callout offset cap | `<= 160` | `<= 160` |

Both direct children wrap below the callout at both widths, in DOM order callout → direct `R` →
direct long. The long direct row fills the lane at `214 px`; the callout card keeps its natural
`76.13 px` width.

### 404 px parent, far-right anchor (right group stays right)

Parent `403.74 × 52`, lane `404` (`--nf-lane-width: 404px`), anchor “omega” at content `x 339.60`
inside the parent card.

| Measurement | 1440 | 960 |
|---|---:|---:|
| Parent card | `0 … 403.74` | `0 … 403.74` |
| Lane | `0 … 404` | `0 … 404` |
| Anchor mark left | `339.60` | `339.60` |
| Callout offset | `160 px` (clamped) | `160 px` (clamped) |
| Callout card | `160 … 233.91` | `160 … 233.91` |
| Right group left | `420` = `max(403.74, 404) + 16` | — (wrapped) |
| Right group cards | two `420` wide rows | empty (wrapped) |
| Callout right safe limit | `404` = group left − 16 | lane right `404` |
| Below stack | only the callout | callout → direct A → direct B |
| Shared below trunk | — (single row) | `x 12`, parent bottom → last row center |

At 1440 the callout right edge (`233.91`) is far left of the `404` safe limit because the card is
content-driven; the important invariant is that it can never pass `404` even with long content. At
960 both long direct children no longer fit the viewport budget and wrap below after the callout.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/design-tokens.ts` | Added frozen `callout.maxAnchorOffset` (160) and `callout.safeGap` (16); M3g3 header. |
| `apps/desktop/src/renderer/src/lib/geometry.ts` | Added `calloutRightGroupX`, `calloutSafeRight`, `calloutSafeZoneWidth`, `calloutNeedsWrap`, `placeCallout`; exported the new token group. |
| `apps/desktop/src/renderer/src/lib/child-placement.ts` | Added `calloutSafeWidth`; safe-zone wrap runs before the lone-child rule. |
| `apps/desktop/src/renderer/src/editor/useBelowStackPlacement.ts` | Computes the rounded lane width and safe-zone width for every parent with direct children; passes both into the planner. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | `CalloutLaneView` uses `placeCallout` instead of the old 144 px clamp; publishes clamped state. |
| `apps/desktop/test/geometry.test.ts` | Token assertions and six safe-zone/clamp/wrap unit tests. |
| `apps/desktop/test/placement.test.ts` | Safe-zone wrap, lone-child override, and normal-budget boundary tests. |
| `apps/desktop/test/edge-routing.test.ts` | Far-right capped callout routing with a full stem and no backwards path. |
| `tests/ui/m3-anchor-callout.test.mjs` | Narrow 160 px fixture now asserts the wrap fallback at 1440/960; new 404 px far-right fixture asserts the 160 px cap, the 16 px right-group clearance, DOM order, shared trunk, and no overlap. New hidden-window screenshots. |
| `tests/ui/m3-formula-term-geometry.test.mjs` | Far-right centered formula terms now assert the shared 160 px cap instead of unbounded row following. |
| `docs/design-tokens.md` | New token rows, safe-zone formulas, wrap rule, and lane-floor note. |
| `docs/reports/m3g3-callout-safe-zone.md` | This report. |

No spec, UX, ADR, schema, fixture, dependency, or critical e2e change.

## Tests and evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| targeted `vitest` (geometry, placement, edge-routing) | 57/57 pass, 0.08 s |
| `npm test` | 490/490 pass, 43 files, 1.77 s (was 480) |
| `node --test tests/ui/m3-anchor-callout.test.mjs` | 7/7 pass, 13.3 s |
| `npm run test:ui` | 25/25 pass across 11 files; per-suite 9.3–15.6 s, about 2 minutes total |
| `npm run verify:fast` | pass; critical e2e 21/21, suite 45.4 s, process 53.5 s |

UI tests use condition-based waits (`waitForCallouts`, `waitForBelowRowCount`,
`waitForRightGroupCount`, `waitLayout`, callout-offset/lane-width waits); no fixed sleeps, no native
dialogs, hidden window. The critical e2e count is unchanged at 21. Per the brief, the full
`npm run verify` was not run; the Orchestrator runs it at integration.

Screenshots (gitignored artifacts):

- `artifacts/m3g3/narrow-safe-zone-1440x900.png` — 160 px parent, 240 px lane, callout then both
  wrapped direct rows, one shared trunk.
- `artifacts/m3g3/narrow-safe-zone-960x900.png` — same wrap at 960.
- `artifacts/m3g3/wide-safe-zone-1440x900.png` — 404 px parent, far-right anchor capped at 160,
  callout clear of the right group.
- `artifacts/m3g3/wide-safe-zone-960x900.png` — both long direct children wrapped after the callout.

## Risks and follow-ups

- **Lane floor vs callout minimum.** A 240 px lane leaves 214 px after the 26 px row indent, so a
  callout at the floor is physically narrower than the 240 px token. The wrap rule keeps the child
  column away, but a future “true 240 px callout” requires raising the lane floor to 266 px or
  reducing the row indent. The brief's stop-and-ask condition was handled by using the row origin
  fallback and documenting the 214 px floor, not by changing the 160 cap or lane tokens.
- **Far-right formula terms no longer move the row past 160 px.** The term glyph highlight and
  leader stay on the term, but the callout row is capped. The M3c2b UI test now asserts the cap
  explicitly; a future settings override that changes the 160 px cap must update that test.
- **Callout cards remain content-driven.** The safe zone bounds the row, not a forced width; a short
  callout can end well before the 16 px limit. This is intentional and matches the existing card
  model.
- **Nested callouts** still inherit the parent's lane variable until their own layout effect sets it;
  no UI test covers a two-level callout chain in this task.
- **Image anchors and M3c3b remain blocked**; M4/PDF remain blocked until M3 is accepted.

## Next step

Sentinel M3 review, then the Orchestrator's integration `npm run verify`. M4/PDF remain blocked until
M3 is accepted.
