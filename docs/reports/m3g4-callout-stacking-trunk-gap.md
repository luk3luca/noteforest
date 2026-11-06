# M3g4 — callout stacking and below-trunk gap

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Scope:** the two product-owner review findings only. No image anchors, paste/duplicate UI, chip
overlay polish, page/PDF, schema, dependency, settings, or new critical e2e.

## Summary

Two fixes:

1. **Anchor child could be hidden behind the parent's direct child.** The root cause was a mount race
   in `CalloutLaneView`: the lane's layout effect could run while React had mounted the lane in a
   temporary container, before ProseMirror attached it under its `.nf-block-node` host. The effect
   queried `lane.closest('.nf-block-node')`, found `null`, and returned without installing any
   observer. The lane then never received `--nf-lane-width` or `--nf-callout-offset`, so it expanded
   to the full canvas and could slide under the direct-child column. The effect now retries on
   document attachment, resolves the parent card on every alignment pass, and observes the host/lane
   until the card appears. A layered stacking order is the safety net: parent card `2`, callout lane
   `1`, right group `0`.
2. **Below trunk attached to the parent card.** A new `trunkGap` token (8 px) separates the below
   trunk start from the parent card bottom. Single-row elbows, multi-row shared trunks, and
   direct-only below stacks all use the same gap.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/design-tokens.ts` | New `trunkGap: 8` token. |
| `apps/desktop/src/renderer/src/lib/geometry.ts` | Export `GEOMETRY.trunkGap`. |
| `apps/desktop/src/renderer/src/lib/edge-routing.ts` | Below trunk starts at `parent.bottom + trunkGap`; single-row elbows and shared trunks use it; defect check uses the gapped start. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | `CalloutLaneView` attachment retry, per-pass card resolution, host/card/lane observers; alignment survives a late host mount. |
| `apps/desktop/src/renderer/src/styles.css` | Below-stack stacking order: parent card `2`, callout lane `1`, right group `0`; isolated stacking context. |
| `apps/desktop/test/geometry.test.ts` | `trunkGap` token value. |
| `apps/desktop/test/edge-routing.test.ts` | Gapped trunk assertions for single-row, multi-row, and direct-only stacks; explicit token-gap test. |
| `tests/ui/m3-anchor-callout.test.mjs` | Trunk-start assertions use the gap; new direct-child-first + anchor-child regression covering hit-testing, z-order, lane width/offset, and reopen recovery; screenshot. |
| `docs/design-tokens.md` | `trunkGap` and the stacking rule. |
| `docs/reports/m3g4-callout-stacking-trunk-gap.md` | This report. |

## Root cause evidence

Before the fix, a saved note with several callout lanes was reloaded five times. Lanes failed to
receive their alignment state on most loads:

```text
run 1  show-t1 480 / aligned     show-t7 480 / aligned     show-t14 480 / aligned
run 2  show-t1 480 / aligned     show-t7 733 / missing     show-t14 480 / aligned
run 4  show-t1 1078 / missing    show-t7 480 / aligned     show-t14 480 / aligned
run 5  show-t1 1078 / missing    show-t7 733 / missing     show-t14 480 / missing
```

`1078` was the full canvas content width. A passive effect on the same lane confirmed the component
was mounted; a debug marker placed after `lane.closest('.nf-block-node')` was absent, so the layout
effect returned at the host lookup. The lane was mounted in a temporary ReactRenderer container and
attached to the host after the effect had already bailed out. Retrying on attachment fixed it:

```text
run 1..5  show-t1 480 / aligned   show-t7 480 / aligned   show-t14 480 / aligned
```

Hidden-window and visible-window runs both passed five out of five reloads.

## Geometry after the fix

- `trunkX = parent.x + trunkInset (12)`
- `trunkStartY = parent.bottom + trunkGap (8)`
- Multi-row trunk path: `(trunkX, trunkStartY) → (trunkX, lastRowCenter)`
- Single-row path: `(trunkX, trunkStartY) → (trunkX, rowCenter) → (rowLeft - edgeGap, rowCenter)`
- Final arm keeps at least `stemMin` (12 px).

The UI regression creates the direct child first, then the anchor child, and asserts:

- the callout card is hit-testable at its center (`elementFromPoint` returns the callout);
- callout lane z-index is above the right group and below the parent card;
- the lane width variable is finite and 240–480 px;
- every callout row has a measured offset;
- after saving, quitting, and reopening the document, the lane width and offsets recover without a
  resize or a new branch;
- the callout right edge still stops at least 15.5 px before the direct-child group.

Screenshot:

- `artifacts/m3g4/anchor-above-direct-1440x900.png`

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| Targeted vitest (geometry, edge-routing) | 41/41 pass |
| `npm test` | 491/491 pass, 43 files, 1.84 s |
| `node --test tests/ui/m3-anchor-callout.test.mjs` | 8/8 pass |
| `npm run test:ui` | 26/26 pass, 11 files |
| `npm run verify:fast` | pass; critical e2e 21/21, suite 45.9 s |

The first `verify:fast` run hit one unrelated chapter-title focus flake in the M2 editor suite; the
same test passed alone and the full command passed on rerun. No fixed sleeps were added to UI tests;
the reload recovery uses `waitForFunction` conditions.

## Risks and follow-ups

- **Attachment retry:** the lane observes `document.body` until it is attached under a
  `.nf-block-node`. This is a one-time bootstrap; after setup, the attachment observer disconnects.
- **Stacking safety net:** the 16 px safe zone/wrap rule remains the primary layout guarantee. The
  z-order prevents a hidden anchor child if a transient measurement state ever overlaps the two
  columns; it does not replace the safe zone.
- **Trunk gap is fixed:** `trunkGap` is a token, so M6 settings can expose it without touching the
  router.
- **Nested callouts** still have no two-level UI test; the attachment/card observers are per-lane and
  should support them, but this is not newly exercised here.
- Image anchors remain blocked on the image pipeline; paste/duplicate UI and chip-overlay polish are
  still follow-ups.

## Next step

Product-owner retry on the showcase note and the two fixes. On approval, launch the Sentinel M3
review of the accumulated M3 work.
