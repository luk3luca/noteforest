# M3g6 — active shared lead/trunk

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Scope:** the second-child active-state finding from the product-owner showcase retry. No layout or
canonical change.

## Summary

The horizontal lead from the parent into a shared right trunk used to be part of the **first**
child's edge path. Selecting the second child activated the vertical trunk but left the lead muted,
because the lead belonged to the first arm. The router now puts the parent port and horizontal lead
inside the `RoutedTrunk`; every child edge is only its short arm from the trunk. `EdgeLayer`'s
existing `trunkActive` rule then activates the lead and trunk for **any** selected child in the
group, while the other arms stay muted.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/edge-routing.ts` | Shared right trunk owns `parentPort → laneX` lead and the vertical span; child edges start at `laneX`. Single-child elbows are unchanged. |
| `apps/desktop/test/edge-routing.test.ts` | Trunk starts at the parent port; arms start at the trunk; lead/stem assertions updated. |
| `tests/e2e/m2-editor.test.mjs` | Trunk start is the parent port; the first arm starts at the trunk. |
| `tests/ui/m3-anchor-callout.test.mjs` | New second-child active regression: trunk active, selected edge active, first edge muted. |
| `docs/tasks/m3g6-active-trunk-lead.md` | Scope. |
| `docs/reports/m3g6-active-trunk-lead.md` | This report. |

## Geometry

```text
trunk path = M parentPort L (laneX, parentPort.y)
             M (laneX, min(firstY, parentPort.y)) L (laneX, max(lastY, parentPort.y))
child arm  = M (laneX, childY) L (childLeft - edgeGap, childY)
```

The 10 px horizontal lead and 12 px final stem are unchanged. A first child above the parent center
still connects to the trunk through the vertical span.

## Evidence

Second child selected in the showcase:

- trunk class `nf-edge-trunk nf-edge-active`;
- trunk path starts at `x = parent.right`;
- selected edge `nf-edge-active`;
- first child edge `nf-edge-muted`.

Screenshot:

- `artifacts/m3g6/second-child-active-lead-1440x900.png`

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npx vitest run` (geometry/placement/edge-routing) | 59/59 pass |
| `node --test tests/ui/m3-anchor-callout.test.mjs` | 10/10 pass |
| `npm run e2e:critical` | 21/21 pass |
| `npm run test:ui` | 28/28 pass, 11 files |
| `npm run verify` | pass; unit 492, critical e2e 21/45.3 s, recovery 14, UI 28 |

## Risks

- The trunk path now has two `M` subpaths when the first child is above the parent port. Both are
  straight; the active class paints both. No arc or rounded junction is introduced.
- The below-stack trunk is unchanged.
- Single-child right edges still own the parent port because there is no shared trunk.
