# M3g5 — branch lead-in and nested below-stack placement

**Role:** Implementer / Builder  
**Milestone:** M3 — span anchors and reference edges  
**Base:** current `main` after M3g4 (`40d5ae3`), docs `63aadaf`  
**Worktree:** fresh worktree from `main`  
**Scope:** two product-owner review findings from the showcase retry. No image anchors, paste/duplicate
UI, page/PDF, schema, dependency, settings, or new critical e2e.

## Product-owner findings

1. **Right trunk exits flush from the parent.** The shared right trunk currently leaves the parent
   card with only ~2 px of horizontal lead before descending; it reads as glued to the card. It must
   leave the parent in a visibly longer horizontal segment, then turn down.
2. **A child of an anchor callout overlaps the outer direct child.** In the showcase, `ciao` (a child
   of the `foresta` callout) was painted on top of the parent's direct child `Cosa trovi qui`. This
   is not a z-order problem: the two cards must not occupy the same space at all.

## Required work

### 1. Longer horizontal lead into the shared right trunk

- Increase the parent-to-child-group gap so the standard budget can hold:
  `branchLead (10) + stemMin (12) + edgeGap (2) = 24 px`.
- Keep `stemMin` 12 and `edgeGap` 2; do not shorten the final arrow stem.
- `rightLaneX` already derives the trunk from the measured child left, so the longer gap yields a
  10 px lead without a new router rule. Assert this in the router and UI tests.
- Update the callout safe-zone math so a larger group gap cannot let a callout grow past its own lane
  or lose its 16 px safe gap. `calloutSafeRight` must cap at the lane right.
- Update `--nf-child-gap`, M2 chain geometry expectations, and docs.

### 2. Nested below-stack children

- A parent that is already in a below stack — an anchored callout row or a wrapped direct child —
  must place its own direct children **below**, with the shared row indent, never in a nested right
  group that lands on the enclosing parent's direct-child column.
- Implement this as a placement rule (`forceBelow` / `belowStackParents`), not by z-index. The two
  cards must have non-overlapping rects.
- Keep the rule stable across measure passes: a callout child does not oscillate between right and
  below.
- Cover the showcase case: parent → direct child, parent → callout, callout → nested child. Assert
  the nested child is in the callout's lane, below the callout, and does not intersect the outer
  direct children.

## Tests

Unit:

- `siblingGap`/`childGap` 24; router trunk lead 10 px and full 12 px stem;
- callout safe right capped by the lane, safe-zone/wrap thresholds unchanged;
- `planDirectChildPlacement({ forceBelow: true })` moves lone and multi-child groups below;
- updated M2 chain positions and fit-width expectations.

UI:

- `tests/ui/m3-anchor-callout.test.mjs`: right-trunk lead assertion; new nested-callout placement
  test with non-overlap rects and screenshot;
- `tests/ui/m2-shell.test.mjs`: updated parent-relative chain positions (24 px gap).

## Acceptance criteria

- [ ] Shared right trunk has a visible ~10 px horizontal lead from the parent before descending.
- [ ] Final stem stays at least 12 px; no arrow clipping.
- [ ] Nested child of a callout is below the callout and never overlaps the outer direct column.
- [ ] Callout still stops at least 16 px before the right-group trunk and never exceeds its lane.
- [ ] `npm run typecheck`, targeted vitest, `npm test`, targeted UI files, `npm run test:ui`, and
      `npm run verify` pass.
- [ ] No new dependency; no spec/UX/ADR exception beyond the product-owner gap request.

## Stop and ask

Stop if the longer lead requires changing `stemMin`/`edgeGap`, or if force-below would change a
ratified structure rule rather than a projection rule.
