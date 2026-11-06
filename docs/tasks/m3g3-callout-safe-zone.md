# M3g3 — Callout safe zone and anchor-offset cap

**Role:** Builder  
**Milestone:** M3 review fixes (third pass)  
**Base:** current `main` (M3g2 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 0.5–1 day

## Context

With a max-width parent and an anchor near the right edge, the callout can start far from the parent
left and end at the child trunk, visually sliding under the direct-children column. The product owner
confirmed a bounded **safe zone** model:

- callout left is capped at `parent.left + maxAnchorOffset` (160 px);
- callout right stops at least `callout.safeGap` (16 px) before the right-group trunk;
- if the safe zone is too narrow for the 240 px minimum, the direct children wrap below **after** the
  callouts instead of overlapping.

Revisit the 160 px cap in the future if needed.

Read:
- `docs/tasks/m3g2-lane-tokens-edges.md`, `docs/design-tokens.md`, `docs/design/m3-anchors-references.md`
  §6.2/§6.2.1; `docs/ux.md` v1.4 §8.5.
- `lib/design-tokens.ts`, `lib/geometry.ts`, `lib/edge-routing.ts`, `lib/child-placement.ts`,
  `editor/views/BlockViews.tsx`, `styles.css`, geometry/placement/UI tests.

## Goal

A callout never starts farther than 160 px from the parent left and never ends closer than 16 px to
the right-group trunk. If that safe zone cannot fit the minimum callout width, the direct children
wrap below after the callouts; the callout never sits under the child column.

## In scope

1. **Tokens**
   - Add `callout.maxAnchorOffset: 160`, `callout.safeGap: 16` (keep `rowIndent 26`,
     `calloutMinWidth 240`, `calloutMaxWidth 480`, `siblingGap 16`).
   - Update `docs/design-tokens.md` with the new values/semantics.
2. **Safe-zone geometry**
   - `rightGroupX = max(parent.right, lane.right) + siblingGap`.
   - `calloutSafeRight = rightGroupX - callout.safeGap`.
   - `calloutLeft = clamp(anchorX + calloutGap, lane.left + rowIndent,
     min(parent.left + maxAnchorOffset, calloutSafeRight - calloutMinWidth))`.
   - `calloutWidth = min(laneWidth - rowIndent, calloutSafeRight - calloutLeft)`.
   - If `calloutSafeRight - (lane.left + rowIndent) < calloutMinWidth`, do not keep the direct group
     right: wrap it below after the callouts, shared left trunk.
   - Callout block and trunk stay indented together; no overflow; no overlap with right group.
3. **Order/z-index**
   - Callout lane before the direct-children group in the below stack; no z overlap; deterministic
     D3 anchored-first order.
4. **Tests/evidence**
   - UI at 1440/960 and a 160 px parent: anchor far right, callout + 2 direct children.
     Assert `callout.left <= parent.left+160`, `callout.right <= rightGroup.left-16` when the group
     is right; if the group wraps, it comes after the callout and shares the trunk.
   - Max-width parent case: no callout under the child column; no rect overlap; DOM order.
   - Existing lane/edge tests updated; screenshot.
   - No new critical e2e; critical stays 21 tests.

## Out of scope

- Unified-flow model, settings UI, changing the 160 px cap (future revisit).
- Image anchors, paste/duplicate UI, page/PDF, schema change, new dependencies.

## Files

Expected to touch:
- `apps/desktop/src/renderer/src/lib/design-tokens.ts`
- `lib/geometry.ts`, `lib/child-placement.ts`, `lib/edge-routing.ts`
- `editor/views/BlockViews.tsx`, `styles.css`
- `apps/desktop/test/geometry.test.ts`, `placement.test.ts`, `edge-routing.test.ts`
- `tests/ui/m3-anchor-callout.test.mjs` or a new UI file
- `docs/design-tokens.md`
- `docs/reports/m3g3-callout-safe-zone.md`

## Acceptance criteria

- [ ] Callout left is capped at 160 px from the parent left.
- [ ] Callout right stops at least 16 px before the right-group trunk; no overlap.
- [ ] If the safe zone cannot fit 240 px, direct children wrap below after the callouts.
- [ ] Max-width parent + far-right anchor never places the callout under the child column.
- [ ] Block/trunk/row indentation stays aligned; no card overflow.
- [ ] UI tests + screenshot; no new critical e2e; no image/paste/page work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted geometry/placement/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end
- Screenshot paths and measured geometry.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if the safe-zone clamp makes the callout narrower than its minimum before the wrap fallback, or
if the right-group/wrap decision oscillates between measure passes.

## Report format

Summary, files, token values, safe-zone geometry, wrap fallback, tests/screenshots/timings, risks.
