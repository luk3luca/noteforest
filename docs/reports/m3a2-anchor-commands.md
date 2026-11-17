# M3a2 — Anchor commands and anchored/reference branches

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m3a2-anchor-commands`  
**Base:** `155fdac` (`main`: docs: merge M3a1 and start M3a2)  
**Scope:** pure `packages/core` command layer plus anchored traversal. No UI, TipTap, adapter, callout,
outline, repair dialog, make-home/move-here/demote, split/merge, export manifest, layout/pagination,
schema bump, dependency, or e2e.

## Summary

M3a2 adds the typed, pure command surface for anchors, anchored primary branches, and reference
branches. Every mutating command validates before creating records, applies to a clone, re-validates
the result, returns `created` IDs (including `created.anchorIds`), and carries an exact inverse.

Implemented:

- `anchor.create` / `anchor.repair` / `anchor.attachToBlock` / `anchor.delete`;
- extended `branch.create` (anchor port + explicit role + label) and
  `branch.delete` / `branch.reorder` / `branch.relabel` for anchored primary and reference lists;
- role-independent source-target dedupe on create and attach;
- exact `structure.restore` inverses for anchor content/structure changes, including in-place block
  replacement and a guard that refuses to overwrite text typed after the command;
- anchored-primary traversal in `directChildIds`, `subtreeBlockIds`, cycle checks, subtree deletion,
  and block-delete promotion;
- regression coverage for the lifted M2 rejects in `block.move`, `branch.delete`, and
  `branch.reorder`.

## Files

| File | Change |
|---|---|
| `packages/core/src/commands.ts` | New anchor commands, extended branch commands, port/role order helpers, exact restore support (`replaceBlocks`, `expectedReplaceBlocks`), anchored promotion and dedupe. |
| `packages/core/src/structure.ts` | `directChildIds`/`subtreeBlockIds` now follow direct **and** anchored primary branches; anchored children are ordered anchored-first by anchor content order then branch order (D3). |
| `packages/core/src/types.ts` | Doc comment only: branch records now cover anchor and reference edges. |
| `packages/core/test/anchor-commands.test.ts` | New 38-test command matrix, inverse/identity, snapshot, dedupe, cycle, empty-chapter, and traversal suite. |
| `docs/reports/m3a2-anchor-commands.md` | This report. |

No app, fixture, schema, dependency, spec, UX, ADR, or plan file changed.

## Command matrix

| Command | Source / input | Validation | Effect | Inverse |
|---|---|---|---|---|
| `anchor.create` | `blockId`, `kind`, `selector`, `binding`, optional mirrors, optional `anchorId`, `reuseExisting` | block/kind/selector; binding applies to one contiguous valid binding of the right node kind; exact selection reuse is opt-in | Splits text nodes, writes `anchorIds`, creates the record with selector + mirror fields, updates `block.updatedAt`; `created.anchorIds` only for a new anchor | Exact `structure.restore`: removes binding/record and restores the pre-command block record (including text-node shape) |
| `anchor.repair` | `anchorId`, new `selector`, new `binding`, optional mirrors | same block (binding is in the anchor's block), same `kind`, selector/binding valid, selection not owned by another anchor | Removes old binding, applies new binding, replaces selector/mirrors, keeps anchor ID, branch IDs, branch targets | Exact `structure.restore` of block + anchor record |
| `anchor.attachToBlock` | `anchorId` | anchor exists | Removes binding/record; retargets every outgoing branch to `{ blockId }`, appends after existing block-port branches per role in prior anchor order, keeps IDs/labels/targets; role-independent dedupe (primary wins, otherwise existing block edge wins) with a warning | Exact `structure.restore` of block, anchor, branches, orders, and chapter lists |
| `anchor.delete` | `anchorId`, `branches?: 'attach' \| 'delete'` | choice required when outgoing branches exist | `attach` behaves as `attachToBlock`; `delete` removes outgoing branches and promotes anchored primary targets after the source root, never deleting target subtrees, then removes the anchor/binding | Exact `structure.restore` |
| `branch.create` | `sourceBlockId`, optional `sourceAnchorId`, `targetBlockId`, `role` (defaults to primary for the M2 shape), optional `atIndex`/`label`/`branchId` | source/target exist; anchor belongs to source block; no self-branch; primary only: no second primary parent, no primary cycle, root slot removal, empty-chapter guard; role-independent duplicate returns the existing edge with a warning and no new record; order unique in `(port, role)` | Creates a primary/reference branch at the port; primary removes the target from its chapter slot; reference changes no chapter/home | Primary: exact snapshot (restores chapter slot and branch ID); reference: typed `branch.delete` |
| `branch.delete` | `branchId`, `targetHandling?` | reference: no handling; primary: explicit `promote` or `delete-subtree` | Reference deletes only the edge. Primary `promote` makes the target a top-level block after the source root; `delete-subtree` removes the target and all direct **and anchored** primary descendants | Exact snapshot; reference target is untouched |
| `branch.reorder` | `branchId`, `toIndex` | any role and any port; index inside that `(port, role)` list | Updates the fractional order only; reference reorder never moves blocks | Typed `branch.reorder` with the previous index; exact snapshot when the port's order keys were unusable and had to be renormalized |
| `branch.relabel` | `branchId`, `label` | any role/port | Sets/clears the label only | Typed previous label |

`CreatedIds.anchorIds` is populated only by `anchor.create` when it actually creates a record.
`anchor.create` with `reuseExisting: true` returns `created.anchorIds: []` and the existing anchor in
`affected.anchorIds` with a warning.

## Identity and inverse evidence

`packages/core/test/anchor-commands.test.ts` compares whole documents with revision/document
`updatedAt` normalized, so every other field (IDs, block timestamps, labels, order keys, roles,
anchors, chapter slot order) must match exactly.

| Case | Evidence |
|---|---|
| Create undo/redo | `anchor.create` undo restores the original single text node and block `updatedAt`; redo restores the same anchor record and ID. |
| Repair identity | Anchor ID, block, kind, branch ID, branch source, target, and label are unchanged; undo is stable-equal to the pre-repair document, redo stable-equal to the repaired one. |
| Attach identity | Branch IDs, labels, and targets survive; sources become the block port; orders are appended after existing rows; undo restores the anchor, binding, anchored sources, and prior order keys. |
| Attach dedupe | Existing primary wins over a reference duplicate; an incoming primary wins over an existing block reference; the surviving edge keeps its ID; undo restores the retired record. |
| Anchor delete | `attach` preserves all branches; `delete` removes them but keeps every target block/subtree and promotes primary targets in branch order; undo stable-equals the pre-delete document. |
| Anchored branch create/delete | Primary creation removes the root slot and undo restores the exact chapter index and branch ID; reference delete leaves the target and chapters unchanged. |
| Anchored subtree | `branch.delete delete-subtree` removes an anchored target, its direct child, and a grandchild reached through another anchored primary edge; undo restores all records. |
| Order keys | Anchored primary and reference reorders preserve every other key; the inverse restores the original order. Unusable duplicate orders fall back to an exact snapshot instead of a lossy typed inverse. |
| Empty chapter | Primary branch creation that would strand a chapter's last root is rejected with `chapter-would-be-empty`; reference creation is exempt. |
| Reference delete | The target block, its content, its anchors, and chapter membership are byte-identical after deleting only the edge. |
| No partial mutation | Failing duplicate/cycle/ownership/binding commands leave the input document deep-equal to its snapshot. |
| Later text safety | Undo of an anchor command refuses with `invalid-command` if the block body was edited afterwards; after the later text edit is undone (even though `updatedAt` differs), the anchor undo succeeds. |
| Lifted M2 rejects | Anchored children move to top level and under another parent with exact undo; anchored primary branches can be deleted and reordered; an anchored descendant is included in cycle checks. |
| Cross-block repair | Repair interprets the binding in the anchor's own block and never touches another block's content. |

## Traversal

- `primaryChildBranches` is anchored primary children first (anchor content order, then anchor ID,
  then branch order) followed by direct primary children.
- `directChildIds` uses that order; `subtreeBlockIds` therefore follows direct and anchored primary
  branches, including anchored descendants of anchored descendants.
- Cycle checks in `branch.create`, `block.move`, and `isLegalMove` now see anchored descendants.
- `block.delete promote` promotes anchored primary children too; a formerly anchored child receives a
  fresh branch from the deleted block's primary parent (C9), while the undo snapshot restores the old
  anchored branch ID/source/order.
- `block.move` on an anchored child removes the old anchored edge and creates a fresh destination edge;
  the exact snapshot restores the original anchored branch on undo.
- Sibling placement next to an anchored child cannot address the anchor port through the existing
  `BlockPlacement` shape; it falls back to the end of the parent block's direct child list instead of
  rejecting the move.

## Tests and timing

| Check | Result |
|---|---|
| `npm run typecheck` | Pass, all workspaces |
| `npx vitest run packages/core/test/anchor-commands.test.ts` | **38/38** pass, **209 ms** |
| `npx vitest run packages/core/test` | **211/211** pass (11 files), **1.70 s** |
| `npm test` | **348/348** pass (31 files), **1.96 s** |
| `npm run verify` | Not run, per brief; Orchestrator runs it at integration |

The pre-M3a2 baseline was 310/310 unit tests; this slice adds 38 tests and leaves all M2 command,
destructive-undo, move-undo, empty-chapter, serialization, app, layout, and PDF suite tests green.

## Deliberate deviations and residual risks

- **`anchor.create` inverse is an exact snapshot, not the ADR's typed delete.** Applying
  `removeAnchorBinding` cannot reconstruct the pre-create text-node segmentation, so a typed
  `anchor.delete` inverse cannot be identity-exact. The snapshot restores the block record verbatim
  and still removes the binding/record, satisfying the command requirement; `branch.create`
  reference and reorder/relabel remain typed.
- **Anchor undo cannot overwrite later text.** `structure.restore` compares expected post-command
  block state (ignoring `updatedAt`) before `replaceBlocks`. This depends on the caller's undo routing:
  later text edits must be undone first, otherwise the anchor undo fails with a typed error rather
  than silently discarding text.
- **Duplicate `branch.create` is a successful no-op, not an error.** It returns the existing edge in
  `affected.branchIds`, no `created.branchIds`, and a warning, following the design's "focus the
  existing edge" rule. A requested role change still belongs to M3d (`makeHome`/`moveHere`).
- **Role-independent attach dedupe chooses primary first.** When the block already links the same
  target, the surviving primary edge keeps its ID; reference duplicates are retired with a warning.
  The alternative, keeping an existing reference and orphaning a primary target, cannot produce a
  valid document.
- **Sibling placement next to an anchored child is approximate.** `BlockPlacement` has no anchor-port
  field; M3b/M3d should add an anchor-aware placement or command if the UI needs exact sibling
  positioning under an anchor.
- **The M2 validation warning for reference branches remains.** `serialize.test.ts` still asserts the
  `unsupported-m2-feature` warning; removing it is an M3d/fixture-pass cleanup, not part of this
  command slice.
- **No schema bump, no migration, no dependencies.** `schemaVersion` remains 1.

## Next step

M3b (text anchor authoring and callout UI) can consume `anchor.create` + `branch.create` and
`created.anchorIds`; M3d can consume reference creation/deletion/reorder/relabel and the role-transition
commands (`makeHome`/`moveHere`/`demote`) that are intentionally out of this slice.
