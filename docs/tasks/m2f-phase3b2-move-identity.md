# M2f phase 3b2 — Move/branch-create identity and chapter preservation

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F2; `docs/tasks/m2f-stability-fixes.md` phase 3  
**Out of scope:** F3 corrupt packages, keyboard, empty chapters, stale locks, M3/page/PDF

## Problem

Two undo paths still lose identity or placement:

- moving a child to top level and back to child recreates the branch with a **new branch ID**;
- undoing `branch.create` from chapter B under a block in chapter A returns the target to **A**, not B, and leaves B empty.

M3 anchors/reference edges will key on branch IDs; these inverses must preserve identity and original chapter placement before M3.

## Scope

- `block.move` (child→top-level, top-level→child, sibling moves) inverse must preserve:
  - the branch ID linking the target to its original parent,
  - source/target/role/order/label,
  - the original chapter/top-level slot/order,
  - block content/unknown fields.
- `branch.create` inverse must return the target to its **original chapter and top-level order/slot**, not the source chapter; redo re-applies the exact branch (same ID where captured) and placement.
- Redo after undo must reproduce the exact state; repeated undo/redo does not duplicate or lose records.
- Use `structure.restore`/exact inverse or a targeted snapshot; no second user-visible stack. Do not overwrite text in surviving blocks.
- Runtime 3a router reaches these inverses; no router change.
- Do not change delete/detach semantics from 3b1.
- Do not implement F3/empty chapter/stale lock work here.

## Tests

- Unit/core:
  - child→top-level move → undo restores same branch ID/source/target/order and original chapter/top-level slot; redo removes exact branch;
  - top-level→child move → undo returns to original chapter/slot and removes the new branch; redo recreates the same branch ID;
  - move child→top→child across undo/redo cycles preserves branch ID;
  - cross-chapter `branch.create` from B under A → undo returns target to B at its original top-level slot; redo reattaches with same branch ID;
  - text in surviving blocks survives the inverse; unknown fields/anchors preserved.
- E2E:
  - move child to top level, undo → same branch ID/arrow/chapter; redo removes;
  - top-level to child, undo → original chapter/slot; redo reattaches;
  - cross-chapter attach/detach undo returns target to its original chapter/slot;
  - rapid undo/redo one step per press; sidebar/canvas parity.
- Condition waits, no fixed sleeps; critical e2e <60 s. The suite is ~53 s: extend the existing undo test or merge flows; if needed, move a non-critical case to a separate suite without deleting data-safety coverage.

## Acceptance

Move and branch-create undo/redo preserve branch IDs and original chapter/top-level placement; no duplicate/lost records; `npm run typecheck`, `npm test`, `npm run e2e`, `npm run verify:fast` pass. No F3/other work.
