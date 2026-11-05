# M3d2 — Make home, move here, demote

**Role:** Builder  
**Milestone:** M3d2 (second half of reference edges)  
**Base:** current `main` (M3d1 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1 day

## Context

M3d1 creates and renders reference edges. This slice adds the explicit role transitions:
**Make home** (promote a reference to primary; demote the old primary to reference), **Move here**
(promote a reference; delete the old primary edge), and **Demote** (convert a primary edge to a
reference; the target becomes a root). All preserve branch/target identity and are one undo entry.

Read:
- `docs/spec.md` v0.4.5 §5.3/§7.7/§15.11; ADR-0005 §9; design §7.4, §5.2 (identity), §12 M3d.
- `packages/core/src/commands.ts`, `validation.ts`; `apps/desktop/src/renderer/src/actions.ts`,
  `BlockViews.tsx`, `Sidebar.tsx`, `lib/tree.ts`, `state/runtime.ts`, styles/tests.

## Goal

From a reference chip/menu, the user can make the reference the primary home or move the target here;
from a primary edge/block menu, the user can demote it. The target's block ID, subtree, and branch
IDs stay stable; chapter/root slots and order keys are exact; undo restores the previous structure in
one press.

## In scope

1. **Core commands**
   - `branch.makeHome(branchId)`: reference → primary (same branch ID/source/target); old primary
     → reference (same branch ID); re-key orders at the end of the respective role lists; update
     chapter/root slots; enforce empty-chapter.
   - `branch.moveHere(branchId)`: reference → primary (same ID); delete the old primary edge; remove
     the target's root slot; update chapter; enforce empty-chapter.
   - `branch.demote(branchId)`: primary → reference (same ID); target becomes a root/top-level after
     the former top-level source; re-key reference order; chapter/root rules.
   - Preconditions: correct role; target exists; primary-cycle guard on promotion (new source must
     not be the target or inside the target's primary subtree); `makeHome` on a root is disabled per
     OD-7; empty-chapter invariant; no duplicate exact edge (role-independent dedupe).
   - Exact snapshot inverse for both branch records, orders, roles, chapter slots, and target
     root/top-level placement; one undo entry; IDs preserved across undo/redo.
2. **UI**
   - Reference chips/menu: **Make home**, **Move here**; primary block menu: **Demote to reference**.
   - Show the actions only when legal; disable make-home on a root with an explanation.
   - After a transition, chips/outline/edges update; focus the target.
3. **Tests/evidence**
   - Core: role/ID/order/chapter identity for all three transitions; cycles rejected before mutation;
     root make-home disabled; empty-chapter; duplicate edge; undo/redo exact.
   - UI: reference source/target with chips → make home / move here / demote → outline/chips update;
     undo restores; screenshot.
   - No new critical e2e; critical stays 21 tests.

## Out of scope

- Reference label editing, crossing-avoidance polish, chip-overlay cleanup (later).
- Image anchors (M3c3b, blocked), repair/health (M3e), split/merge (M3f), page/PDF.
- Schema change, new dependencies.

## Files

Expected to touch:
- `packages/core/src/commands.ts`, `types.ts` (command shapes), `validation.ts` if needed
- `packages/core/test/reference-edges.test.ts` or a new role-transition suite
- `apps/desktop/src/renderer/src/actions.ts`, `state/runtime.ts`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`, `shell/Sidebar.tsx`, `lib/tree.ts`
- `apps/desktop/src/renderer/src/styles.css`
- `tests/ui/m3-reference.test.mjs` or a new UI file
- `docs/reports/m3d2-role-transitions.md`

## Acceptance criteria

- [ ] Make home swaps primary/reference with the same branch IDs and target IDs; one undo restores
      the exact prior roles/orders/chapter slots.
- [ ] Move here promotes the reference and removes the old primary edge; target/root/chapter state is
      correct; undo restores the old edge with its original ID/order.
- [ ] Demote turns the primary into a reference and makes the target a root after the former
      top-level source; undo restores the primary role/order/slot.
- [ ] Primary-cycle guard rejects before mutation; make-home on a root is disabled; empty-chapter is
      preserved.
- [ ] Chips/outline/edges update; no second row/card; no layout/pagination change beyond the primary
      structure change.
- [ ] UI test + screenshot; no new critical e2e; no image/repair/split-merge work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted core/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end (critical unchanged)
- Screenshot path and test name.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if a transition needs a chapter deletion/creation not covered by the spec, if exact identity
cannot be preserved with the snapshot contract, or if the UI action would be ambiguous without a
product decision.

## Report format

Summary, files, transition table (role/ID/order/chapter), undo identity evidence, tests/screenshot/
timings, risks, next step M3e.
