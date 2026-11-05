# M3a2 — Anchor commands and branch extension

**Role:** Builder  
**Milestone:** M3a2 (second half of M3a)  
**Base:** current `main` (M3a1 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1–1.5 days

## Context

M3a1 made anchors parseable, bindable, and resolvable in the pure core. This slice adds the command
surface a UI will call: create/repair/attach/delete an anchor, and create/delete/reorder/relabel
anchored and reference branches with exact inverses. No UI.

Read:
- `docs/spec.md` v0.4.5 §4.4, §4.6, §5.2–§5.4, §7.4, §15.3.
- `docs/adr/0005-anchor-binding-and-identity.md` — binding, resolution, identity, A1–A12.
- `docs/design/m3-anchors-references.md` §4 (commands), §5 (identity), §12 M3a.
- `packages/core/src/anchors.ts` (M3a1 API), `commands.ts`, `types.ts`, `structure.ts`, tests.

## Goal

A typed, pure command layer creates and edits anchors and anchored/reference branches, validates
before mutating, and returns an exact inverse for one undo entry.

## In scope

1. **Anchor commands**
   - `anchor.create`: anchorId/blockId/kind/selector/binding/quote/context; insert the binding into
     content (split text nodes), create the record, update `block.updatedAt`; reject an existing
     exact binding (`anchor-exists`) or reuse it only if explicitly allowed; inverse removes both.
   - `anchor.repair`: same block only; replace selector + binding, keep anchor ID and every branch
     ID/target; exact snapshot inverse.
   - `anchor.attachToBlock`: remove the anchor/binding, retarget every outgoing branch to
     `{ blockId }`, append to the block port's role list after existing branches, keep branch
     IDs/labels/targets, dedupe role-independently; exact snapshot inverse.
   - `anchor.delete`: `branches: 'attach' | 'delete'`; attach behaves as above; delete removes all
     outgoing branches then the anchor/binding; anchored primary branches promote their targets
     (never delete subtree); exact snapshot inverse.
2. **Branch commands**
   - `branch.create`: accept `source.anchorId` and explicit `role`; validate source port, anchor
     ownership, target, self-branch, primary uniqueness/cycle, root removal, empty-chapter
     invariant, role-independent dedupe, order uniqueness.
   - `branch.delete`: reference deletes only the edge, never the target; primary requires explicit
     `promote` or `delete-subtree`; follow direct **and anchored** primary descendants for subtree
     deletion; exact snapshot for multi-record changes.
   - `branch.reorder` and `branch.relabel`: any port and role, including anchored primary and
     reference lists; inverse restores order/label.
   - `CreatedIds.anchorIds` is added; composite/reuse cases return only newly created anchor IDs.
3. **Traversal correctness**
   - `subtreeBlockIds`/`directChildIds`/cycle checks must follow direct and anchored primary
     branches. An anchored child must never be left unreachable by delete/move/snapshot, and a
     move/primary edge under an anchored descendant must be rejected as a cycle.
   - Remove the M2 rejects for anchored branches in `block.move`, `branch.delete`, `branch.reorder`.
4. **Tests**
   - Core unit tests for each command: preconditions, created IDs, exact inverse, branch/anchor/block
     identity, order keys, dedupe, cycles, empty-chapter, reference delete not deleting target,
     anchored subtree delete, attach/repair snapshots, no partial mutation on failure.
   - Regression tests for lifted M2 restrictions.
   - No UI/e2e.

## Out of scope

- UI, TipTap mark, adapter, callout lane, outline, repair dialog, health sheet.
- `branch.makeHome`/`moveHere`/`demote` (M3d).
- `branch.createFromSelection` composite (M3b).
- `block.split`/`block.merge` (M3f), export manifest (M3f).
- Reference rendering; layout/pagination changes.
- Schema bump or new dependencies.

## Files

Read:
- `packages/core/src/anchors.ts`, `commands.ts`, `types.ts`, `structure.ts`, `validation.ts`
- `packages/core/test/anchors.test.ts`, `commands.test.ts`, `destructive-undo.test.ts`, `move-undo.test.ts`

Expected to touch:
- `packages/core/src/commands.ts`
- `packages/core/src/types.ts` (`CreatedIds.anchorIds`, command shapes)
- `packages/core/src/structure.ts` (anchored primary traversal)
- `packages/core/src/anchors.ts` (only helpers the commands need)
- `packages/core/test/anchor-commands.test.ts` (new) and/or existing command tests
- `docs/reports/m3a2-anchor-commands.md`

## Acceptance criteria

- [ ] `anchor.create/repair/attachToBlock/delete` validate before mutating and return exact inverses.
- [ ] Repair keeps the anchor ID and all branch IDs/targets; attach/delete preserve branch IDs and
      target blocks; undo restores the anchored source/order exactly.
- [ ] `branch.create` works from a block or anchor port with explicit role; primary and reference
      rules are enforced; role-independent dedupe is applied.
- [ ] Reference branch delete never deletes the target; primary delete requires explicit handling.
- [ ] Direct and anchored primary traversal is used by subtree/cycle/delete paths; no unreachable
      target or created cycle.
- [ ] `CreatedIds.anchorIds` is populated only for new anchors.
- [ ] M2 command behavior stays green; no UI/editor changes.
- [ ] Unit tests run inside the unit budget.

## Tests and evidence

- `npm run typecheck`
- `npx vitest run packages/core/test/anchor-commands.test.ts` (and touched suites)
- `npm test` (target <3 s)
- Do not run the full `npm run verify`; the Orchestrator runs it at integration.
- Report command matrix, inverse/identity cases, test counts, and residual risks.

## Stop and ask

Stop if a command needs a product decision not in spec/ADR (for example make-home root handling,
cross-chapter merge), or if exact identity cannot be preserved with the existing snapshot contract.

## Report format

Summary, files, command matrix, identity/inverse evidence, tests/timings, residual risks, next step
(M3b UI or M3d reference edges).
