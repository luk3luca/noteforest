# M3g1 — Product-owner review fixes: below-stack indentation and idle anchors

**Role:** Builder  
**Milestone:** M3 review fixes  
**Base:** current `main` (M3f2 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 0.5–1 day

## Context

The product-owner pass found two visual/behavioral bugs:

1. The below stack is not visually indented enough. The downward trunk starts at the parent's
   bottom-left **outside** the card, and the callout/direct rows can look aligned with the parent
   instead of stepped in. The trunk must start inside the parent card a few pixels right of its
   bottom-left corner; below rows must be genuinely indented.
2. Deleting the target of an anchor leaves the source word underlined with its dot/marker, with no
   branch/callout left. An idle anchor must not show a marker.

Read:
- `docs/design/m3-anchors-references.md` §6.2/§6.3, §6.2.1; `docs/ux.md` v1.4 §8.5.
- `apps/desktop/src/renderer/src/lib/edge-routing.ts` (`routeBelowStackGroup`), `lib/geometry.ts`,
  `editor/views/BlockViews.tsx` (`CalloutLaneView`, marker layer), `lib/adapter.ts`, `styles.css`.
- `apps/desktop/src/renderer/src/state/runtime.ts` / `packages/core/src/commands.ts` for idle anchors.

## Goal

Below-stack rows are visibly indented and the trunk starts inside the parent card; an anchor with no
outgoing branches shows no underline, dot, marker or callout. Undo restores the marker/branch state.

## In scope

1. **Below-stack geometry**
   - Trunk origin: `x = parent.x + belowTrunkInset` (about 12 px), `y = parent.bottom`; never left of
     the parent card. It must read as coming out of the parent's bottom edge, not its corner.
   - Below rows: minimum indent ~24 px from the parent card left, including callouts whose anchor is
     near the left. Keep anchor alignment when the anchor is farther right; clamp to lane bounds.
   - Callout/direct card width must be bounded by the lane's remaining width; no card may overflow
     past the parent card/lane right edge.
   - Single and multiple rows use the same left trunk with horizontal right arrows; no top entry, no
     line through a card. Update the 1440 and 960 geometry tests.
2. **Idle anchor marker**
   - When an anchor has no outgoing branches, hide the text underline/dot, formula/code marker and
     callout; do not show a stale marker. The anchor record may stay idle per OD-2, but its visual
     must be gone.
   - If the command layer removes the binding, keep the anchor record idle and ensure undo restores
     the binding/marker exactly. Prefer the smallest change that satisfies both undo and no stale
     visual.
   - Deleting a target block, deleting the last branch, and undoing that action must be covered.
3. **Tests/evidence**
   - UI: parent with a callout and a direct/ wrapped child; assert trunk start x is inside the parent
     card, rows are indented, callout right edge does not exceed lane/parent, arrows are right.
   - UI: create a text anchor, delete its target block; assert no underline/dot/marker/callout; undo
     restores; at least text anchor (formula/code if cheap).
   - Screenshots at 1440 and 960.
   - No new critical e2e; critical stays 21 tests.

## Out of scope

- Image anchors (blocked), paste/duplicate UI, chip-overlay polish, page/PDF.
- The generated project note (Orchestrator updates it separately).
- New layout engine, schema, dependencies.

## Files

Expected to touch:
- `apps/desktop/src/renderer/src/lib/edge-routing.ts`, `lib/geometry.ts`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`
- `apps/desktop/src/renderer/src/lib/adapter.ts` / `state/runtime.ts` for idle visual state
- `packages/core/src/commands.ts` only if idle binding removal is needed
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/test/edge-routing.test.ts`, UI tests
- `docs/reports/m3g1-review-fixes.md`

## Acceptance criteria

- [ ] The below trunk starts inside the parent card, a few px right of bottom-left; not behind it.
- [ ] Below rows are visibly indented (>=24 px) and callout cards never overflow the lane/parent.
- [ ] Single/multiple rows keep right-entry arrows and no top-entry/trunk-through-card.
- [ ] An idle anchor shows no underline/dot/marker/callout; undo restores the prior marker/branch.
- [ ] UI tests + screenshots; critical e2e unchanged; no fixed sleeps/native dialogs.
- [ ] No image/paste/page work.

## Tests and evidence

- `npm run typecheck`
- Targeted edge-routing/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end
- Screenshot paths and measured geometry before/after.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if the trunk-inside-parent rule conflicts with the lane width/arrow stem minimum, or if hiding an
idle marker requires deleting canonical data without an exact restore.

## Report format

Summary, files, before/after geometry, idle-anchor behavior/undo, tests/screenshots/timings, risks.
