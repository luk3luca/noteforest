# M3g2 — Callout lane width, right-group push, and tighter edges

**Role:** Builder  
**Milestone:** M3 review fixes (second pass)  
**Base:** current `main` (M3g1 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1 day

## Context

The product owner confirmed the lane model and found two remaining layout issues:

1. The callout block itself is not indented together with the trunk; only the arrow moved.
2. A narrow parent forces the callout to the parent width, and the direct-children group is pushed by the whole anchor/lane length. The lane needs its own min/max width; the right group should move only by the lane's excess beyond the parent.
3. The arrow elbows are too round; use right angles with only a small corner rounding (2–3 px), not wide arcs.

The product-owner-approved model is:

```text
laneWidth = clamp(max(parent.width, natural callout width), callout.minWidth, callout.maxWidth)
rightGroupX = max(parent.right, lane.right) + siblingGap
```

If the right group does not fit the canvas, it wraps below after the callouts into the same left-trunk stack.

Read:
- `docs/design/m3-anchors-references.md` §6.2/§6.2.1/§6.3; `docs/ux.md` v1.4 §8.5.
- `lib/geometry.ts`, `lib/edge-routing.ts`, `editor/views/BlockViews.tsx`, `styles.css`, geometry/tree tests.

## Goal

The callout lane has a bounded independent width; the callout block and its trunk are indented together; the right group moves only by the lane's excess; edges use near-right-angle elbows with a 2–3 px radius. No overlap or unbounded push.

## In scope

1. **Design tokens (single source)**
   - Add a small `lib/design-tokens.ts` (or extend `geometry.ts`) with semantic values:
     `rowIndent: 26`, `trunkInset: 12`, `stemMin: 12`, `siblingGap: 16`, `calloutGap: 16`,
     `calloutMinWidth: 240`, `calloutMaxWidth: 480`, `edgeRadius: 2`, block min/max widths.
   - Use these values from layout/router/CSS-facing code; do not scatter new magic numbers.
2. **Lane/right-group geometry**
   - Lane width independent of parent: `clamp(max(parent.width, calloutNaturalWidth), 240, 480)`.
     Prefer a measured natural callout width; if measurement is unstable, fall back to
     `clamp(parent.width, 240, 480)` and record it.
   - Right group x = `max(parent.right, lane.right) + siblingGap`; only the excess pushes it.
   - Callout/direct row left = `lane.left + rowIndent` (or anchor alignment if farther right);
     the card and its trunk start must be indented together.
   - Callout/direct card width bounded by lane right; no overflow.
   - If right group does not fit, wrap it below after callouts, shared left trunk.
3. **Edges**
   - Set `edgeRadius` to 2 (or 3 max) for primary/right and below elbows; no wide arcs.
   - Trunk start reads cleanly from the parent bottom; no large rounded wedge at the start.
   - Keep fixed 6×6 arrowheads and 12 px final stem.
4. **Tests/evidence**
   - UI at 1440 and 960: narrow parent (160) + callout + 2 direct children; assert lane width
     >=240/<=480, right group at max(parent.right,lane.right)+gap, row/trunk indented together,
     no overflow/overlap, small edge radius.
   - Existing callout/routing tests updated; screenshot.
   - No new critical e2e; critical stays 21 tests.

## Out of scope

- Unified-flow model (all children right) — not chosen.
- Settings UI for tokens; only the single-source module now.
- Image anchors, paste/duplicate UI, page/PDF, schema change, new dependencies.

## Files

Expected to touch:
- `apps/desktop/src/renderer/src/lib/design-tokens.ts` (new or geometry extension)
- `lib/geometry.ts`, `lib/edge-routing.ts`
- `editor/views/BlockViews.tsx`, `styles.css`
- `apps/desktop/test/edge-routing.test.ts`, `tree.test.ts`
- `tests/ui/m3-anchor-callout.test.mjs` or a new UI file
- `docs/reports/m3g2-lane-tokens-edges.md`

## Acceptance criteria

- [ ] Lane width has its own min/max and does not collapse to the parent minimum.
- [ ] Right group moves only by `max(0, lane.right - parent.right)`; no unbounded push.
- [ ] Callout block and trunk are indented together; no block/arrow mismatch.
- [ ] Callout cards never overflow the lane/parent; wrap fallback works.
- [ ] Edge corners are near-right angles with a 2–3 px radius; trunk start looks clean.
- [ ] UI tests + screenshots; no new critical e2e; no image/paste/page work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted geometry/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end (critical unchanged)
- Screenshot paths and measured geometry before/after.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if a measured natural callout width creates a layout loop that cannot be resolved in one
measure→layout pass, or if the right-group push cannot be bounded while keeping a 12 px stem.

## Report format

Summary, files, token values, before/after geometry, edge radius, tests/screenshots/timings, risks.
