# M3g4 — callout stacking and below-trunk gap

**Role:** Implementer / Builder  
**Milestone:** M3 — span anchors and reference edges  
**Base:** current `main` after M3g3 (`773c007`), docs `6f46c8f`  
**Worktree:** fresh worktree from `main`  
**Scope:** two product-owner review findings and their regressions. No image anchors, paste/duplicate
UI, page/PDF, schema, dependency, settings, or new critical e2e.

## Product-owner findings

1. **Anchor child behind the parent's direct children.** A child created from an anchor is painted
   in the background while the parent's direct child is in the foreground; the anchor child must
   never be hidden behind the direct-child column.
2. **Below trunk attached to the parent card.** The shared below trunk appears only ~2 px from the
   parent card and reads as glued to it. Add a small visible gap before the trunk starts.

```text
parent -|->
            |
            |->      // a small gap between the card bottom and the trunk start
```

"Sotto" means **z-order/background**, not vertical placement.

## Required work

### 1. Make the callout lane authoritative above the right group

- The below-stack callout lane must paint above the direct-child group so an anchor child can never
  be hidden by a direct child.
- Keep the parent card above the lane so its bottom add-sibling control and card chrome stay
  clickable. Suggested stacking: parent card `z-index: 2`, callout lane `1`, right group `0`, inside
  the below-stack positioning context.
- Do not mask a real geometric overlap: the existing 16 px safe gap and wrap rule remain the primary
  layout guarantee. The stacking order is a safety net for transient measurement/scroll states.
- Find and fix the root cause if the lane can still overlap the right group. Suspects to check:
  - `CalloutLaneView` returns before installing observers when the parent card is not in the DOM yet;
    the lane then never receives `--nf-lane-width` or `--nf-callout-offset` and can expand past the
    right group. Reproduce this by reloading a saved note repeatedly; the lane width variable is
    missing on many loads. Fix the mount race with a host/lane observer so alignment always runs when
    the card appears.
  - A callout row that exceeds the safe zone (card min-width/flex overflow).
- When the lane width is missing, alignment must recover without a manual resize or a new branch.

### 2. Add a below-trunk gap token

- Add a small semantic token, e.g. `trunkGap: 8`, in `design-tokens.ts`; export it through `GEOMETRY`.
- `routeBelowStackGroup` starts the vertical trunk (and a single-row elbow) at
  `parent.bottom + trunkGap`, not exactly at `parent.bottom`.
- All below rows still share one trunk; arms still enter from the left with a full `stemMin`.
- Keep the gap when the stack contains only wrapped direct children.
- The defect check must use the gapped start, not the raw parent bottom.

### 3. Tests

Unit (`apps/desktop/test/edge-routing.test.ts`):

- trunk start y equals `parent.bottom + GEOMETRY.trunkGap` for multi-row and single-row below stacks;
- direct-only below stacks use the same gap;
- gap token is 8 and the final arm still has a full `stemMin`;
- no regression to trunk x, ordering, or defect detection.

UI (`tests/ui/m3-anchor-callout.test.mjs`):

- update trunk-start assertions to the gapped start;
- add a regression that creates a **direct child first**, then an anchor child from the parent. Assert
  the callout card is hit-testable at its center (`elementFromPoint`) and the callout lane's computed
  z-index is above the direct-child group;
- assert the lane has a finite `--nf-lane-width` (240–480) and every callout row has a non-empty
  `--nf-callout-offset` after the add and after a reopen/reload cycle, so the mount race is covered;
- keep condition-based waits only; no fixed sleeps or native dialogs.

### 4. Docs

- Update `docs/design-tokens.md` with `trunkGap` and the stacking rule.
- Write `docs/reports/m3g4-callout-stacking-trunk-gap.md` with the repro, before/after geometry,
  files, tests, screenshots, and residual risks.

## Acceptance criteria

- [ ] Anchor child is painted above the parent's direct-child group in the repro; it is never hidden.
- [ ] Direct children still stay right when they fit; wrap below after callouts when they do not.
- [ ] Below trunk starts 8 px below the parent card; one shared trunk; left-entry arms with full stems.
- [ ] Lane width and callout offset recover on every reload; no giant full-canvas callout.
- [ ] `npm run typecheck`, targeted vitest, `npm test`, the targeted UI file, and `npm run
      verify:fast` pass.
- [ ] No product code outside the fix, no new dependency, no spec/UX/ADR change.

## Stop and ask

Stop if the fix needs a new layout rule or token value that changes the ratified design package, or
if the mount race cannot be fixed without changing the editor projection.
