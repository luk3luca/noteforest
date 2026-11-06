# M3g6 — active shared lead/trunk

**Role:** Implementer / Builder  
**Milestone:** M3 — span anchors and reference edges  
**Base:** current `main` after M3g5  
**Worktree:** fresh worktree from `main`  
**Scope:** one product-owner visual finding. No schema, projection, or layout change.

## Finding

When the **second** direct child is selected, the horizontal lead before the shared right trunk stays
muted; selecting the **first** child colors it because that lead used to be part of the first child's
edge path. The shared lead and trunk must highlight for any selected child in the group.

## Required work

- Move the parent port and horizontal lead from the first child's edge path into the shared
  `RoutedTrunk` path. Child edges become short arms from the trunk.
- Keep `trunkActive` in `EdgeLayer` as the single active-state source: any active child in the group
  activates the whole trunk, including the lead.
- Keep the first and later child arms muted when a different child is selected.
- Update router tests, the M2 trunk e2e assertion, and add a UI regression that selects the second
  child and asserts:
  - the trunk path starts at the parent port;
  - the trunk has `nf-edge-active`;
  - the selected child edge is active and the first child edge is muted.
- No new token; no change to the 10 px lead or 12 px stem.

## Checks

`npm run typecheck`, targeted vitest, `npm test`, `npm run test:ui`, `npm run e2e:critical`,
`npm run verify`.

## Stop and ask

Stop if this requires changing the active-path model or the below-stack trunk.
