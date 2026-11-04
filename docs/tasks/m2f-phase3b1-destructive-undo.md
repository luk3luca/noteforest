# M2f phase 3b1 — Undo for destructive delete/detach

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F2; `docs/tasks/m2f-stability-fixes.md` phase 3  
**Out of scope:** move/branch-create branch-ID/chapter-preserving inverses (phase 3b2), F3 corrupt packages, keyboard, empty chapters, stale locks, M3/page/PDF

## Problem

`block.delete` (promote or subtree) and `branch.delete` (detach) return no inverse. They cannot be undone from the app; an undo after them falls through to text history. This contradicts the M2 gate and will break M3 anchors once branch identity matters.

## Scope

- Provide a deterministic inverse for:
  - `block.delete` with `promote` children;
  - `block.delete` with `delete-subtree`;
  - `branch.delete` (detach; target becomes top-level).
- The inverse restores the exact pre-delete state:
  - block IDs, content, labels, timestamps, unknown fields;
  - primary branch IDs, source/target, role, order, label;
  - top-level placement and sibling order;
  - chapter assignment;
  - anchors/reference records that were schema-only (no new anchor behavior; preserve records).
- Redo after undo re-applies the exact delete/detach (same IDs/order).
- Use an exact inverse command where practical; a small snapshot ring for destructive commands is acceptable if it preserves identity and is tested. Do not add a second user-visible undo stack.
- The runtime’s phase 3a router must reach these inverses and redo through the same structural stack.
- Do not change move/branch-create inverse semantics in this phase; that is 3b2.

## Tests

- Unit/core:
  - delete block with promote → undo restores exact document/IDs/branch IDs/order/chapter; redo deletes again;
  - delete subtree → same;
  - detach branch → undo restores same branch ID/source/target/role/order/label; redo detaches;
  - unknown fields/anchors preserved through the inverse;
  - repeated undo/redo does not duplicate or lose records.
- E2E:
  - delete block (promote/subtree) → undo → block and arrows return with same IDs; redo removes;
  - detach branch → undo → arrow/relationship returns with same branch ID; redo detaches;
  - rapid undo/redo sequence remains one-step-per-press;
  - no phantom/desync; sidebar/canvas parity.
- Condition waits, no fixed sleeps; critical e2e stays <60 s. If new coverage pushes it over, move a non-critical case to the visual/perf suite or merge flows; do not delete data-safety tests.

## Acceptance

Delete and detach are undoable and redoable with exact identity/order/chapter; the phase 3a router reaches them; `npm run typecheck`, `npm test`, `npm run e2e`, `npm run verify:fast` pass. No 3b2/F3/other work.
