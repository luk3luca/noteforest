# M3g5 — branch lead-in and nested below-stack placement

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Scope:** the two product-owner findings from the showcase retry. No image anchors,
paste/duplicate UI, page/PDF, schema, dependency, settings, or new critical e2e.

## Summary

1. **Right trunk exited flush from the parent.** The parent-to-child-group gap was 16 px, which
   left only `16 - edgeGap (2) - stemMin (12) = 2 px` of horizontal lead before the shared right trunk
   descended. The gap is now 24 px:
   `branchLead (10) + stemMin (12) + edgeGap (2) = 24`.
   The trunk leaves the parent with a visible 10 px horizontal segment, then descends. The final
   arrow stem stays at 12 px.
2. **A child of an anchor callout overlapped the outer direct child.** In the showcase, `ciao` was a
   direct child of the `foresta` callout. Its nested right group started at the same x as the outer
   parent's direct-child column, so `ciao` painted over `Cosa trovi qui`. Z-order was only hiding the
   layout defect. A below-stack parent (callout row or wrapped direct child) now forces its own
   direct children **below**, with the shared row indent. The nested card no longer intersects the
   outer direct children, and no z-index masking is needed.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/design-tokens.ts` | `siblingGap` 16 → 24 with the lead/stem/arrow budget documented. |
| `apps/desktop/src/renderer/src/lib/geometry.ts` | `calloutSafeRight` capped by the lane so the larger group gap cannot grow a callout past its column; safe-zone width uses the lane cap. |
| `apps/desktop/src/renderer/src/lib/child-placement.ts` | `forceBelow` for parents already in a below stack. |
| `apps/desktop/src/renderer/src/editor/useBelowStackPlacement.ts` | Computes `belowStackParents` from anchored callout targets plus already-wrapped direct children; passes `forceBelow`. |
| `apps/desktop/src/renderer/src/styles.css` | `--nf-child-gap` 24 px and fallbacks. |
| `apps/desktop/test/geometry.test.ts` | 24 px gap; lane-capped callout safe right. |
| `apps/desktop/test/placement.test.ts` | New chain positions/fit widths; `forceBelow` coverage. |
| `apps/desktop/test/edge-routing.test.ts` | Standard right group at +24; 10 px trunk lead and full 12 px stem assertion. |
| `tests/ui/m3-anchor-callout.test.mjs` | Right-trunk lead assertion; nested-callout placement/no-overlap regression + screenshot; +24 group expectations. |
| `tests/ui/m2-shell.test.mjs` | Parent-relative chain positions updated to the 24 px gap. |
| `tests/ui/m2-view.test.mjs` | Fit fixture extended with a deep chain so horizontal overflow still exists at 960 after adaptive wrapping. |
| `tests/e2e/m2-editor.test.mjs` | Chapter-title focus assertion waits for the focus handoff instead of reading it synchronously (removes a full-suite flake). |
| `docs/design-tokens.md`, `docs/ux-shell.md` | 24 px branch gap and nested below-stack rule. |
| `docs/tasks/m3g5-branch-lead-nested-below.md` | Task scope. |
| `docs/reports/m3g5-branch-lead-nested-below.md` | This report. |

## Right trunk geometry

```text
siblingGap        = 24
edgeGap           = 2
stemMin           = 12
right trunk lead  = 16 - 2 - 12 = 2   before
right trunk lead  = 24 - 2 - 12 = 10  after
```

`rightLaneX` derives the trunk from the measured child left, so the router needs no new special
case. The shared trunk now starts 10 px right of the parent card; the final horizontal arm still has
a full 12 px stem before the fixed arrowhead.

Callout safe-zone math remains bounded: `calloutSafeRight` is the **minimum** of the lane right and
`rightGroupX - callout.safeGap`. Moving the group right therefore cannot let a callout grow past its
own lane; the 16 px callout-to-group clearance is preserved.

## Nested below-stack geometry (showcase)

Before:

- `show-c1` callout card `472 … 792`, `415 … 563`;
- nested `ciao` card `808 … 952`, `415 … 499`;
- outer direct child `show-d2` `808 … 1228`, `322 … 530` → overlap.

After:

- nested `ciao` card `498 … 547`, `563 … 647`;
- callout lane `472 … 792`; outer direct group `816 … 1128`;
- `ciao` is inside `[data-callout-lane="show-c1"]`, starts at the callout bottom and keeps the
  shared 26 px row indent; no intersection with `show-d1`/`show-d2`.

The rule is implemented as a placement projection (`forceBelow`), not a canonical document change.
It is stable: once a block is in `belowStackParents`, its children stay below across measure passes.

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | 492/492 pass, 43 files, 1.78 s |
| `node --test tests/ui/m3-anchor-callout.test.mjs` | 9/9 pass |
| `node --test tests/ui/m2-shell.test.mjs` | 4/4 pass |
| `node --test tests/ui/m2-view.test.mjs` | 1/1 pass |
| `npm run test:ui` | 27/27 pass, 11 files |
| `npm run e2e:critical` | 21/21 pass, suite 45.2 s |
| `npm run verify` | pass; unit 492, critical e2e 21, recovery 14, UI 27 |

Screenshots:

- `artifacts/m3g5/nested-anchor-child-1440x900.png`
- `artifacts/m3g5/showcase-after-1440x900.png`

## Risks and follow-ups

- **Global gap change:** the 24 px parent-to-child gap applies to all right groups, including M2
  single-child chains. M2 shell/placement/view tests were updated; screenshots of the shell should be
  re-checked by the product owner.
- **Below-stack descendants:** all children of a callout/wrapped row now stack below, even when the
  outer parent has no right group. This is the deterministic, overlap-free rule; a future adaptive
  version could use free space to the right if it can prove no collision.
- **Fit test:** the 7-block demo now wraps at 960 instead of overflowing, so the Fit UI test extends
  the deepest chain to create real overflow. Fit behavior itself is unchanged.
- **Nested callouts** now have one regression case; deeper levels are still not separately tested.
- Image anchors remain blocked; paste/duplicate UI and chip-overlay polish remain follow-ups.

## Next step

Product-owner retry on the showcase. On approval, launch the Sentinel M3 review with the updated
brief (`docs/tasks/m3-sentinel-review.md`).
