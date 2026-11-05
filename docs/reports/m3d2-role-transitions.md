# M3d2 — Make home, move here, demote

**Role:** Builder  
**Date:** 5 November 2026  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-f2162876`  
**Branch:** `t3/f2162876`  
**Feature commit:** `f41e118` (`feat(references): add make home, move here, and demote (M3d2)`)  
**Base:** `main` at `673746e` (M3d1 merged; M3e on hold)

## Summary

The three explicit role transitions are implemented end to end:

- **Core:** new typed commands `branch.makeHome`, `branch.moveHere`, and `branch.demote`. Each is
  one command with one exact `structure.restore` inverse. Promotion preserves the reference branch
  ID; demotion preserves the primary branch ID; `moveHere` retires the old primary branch and undo
  restores it with its original ID, source, role, order key, and chapter slot.
- **Preconditions:** role check, target existence, primary-cycle guard before mutation, OD-7 root
  guard for make home, empty-chapter guard when `moveHere` removes a root slot, and role-independent
  exact-edge dedupe. Legacy duplicate primary/reference pairs are rejected by make home and demote;
  `moveHere` retires the old primary and leaves one edge.
- **UI:** **Make home** and **Move here** on each outgoing reference in the block menu and in the
  **See also** chip context menu; **Demote to reference** on a primary block. Illegal actions are
  disabled with an explanation (root target, primary cycle). After a transition the target block
  is selected and focused; chips, `Shared · N`, outline rows, primary arrows, and reference edges
  update from the same document version.
- **Undo identity:** both sides of a make-home swap, the retired primary of move-here, and the
  demoted primary are restored verbatim; branch IDs, order keys, roles, and chapter arrays are
  asserted before/after undo and redo.

No schema bump, no new dependency, no image/repair/split-merge/page work.

## Files

Core:

- `packages/core/src/commands.ts` — command shapes, helpers, the three cases, snapshot inverse
  registration, and the role-transition restore rule (`branch` identity is ID + target; role/source
  may change when a transition is restored in place).
- `packages/core/test/role-transitions.test.ts` — 13 tests across make home, move here, demote,
  anchored sources, cycle/root/empty-chapter/duplicate guards, and exact undo/redo identity.

Renderer:

- `apps/desktop/src/renderer/src/state/runtime.ts` — `makeHome`, `moveHere`, `demoteBranch`, and
  the shared one-command/one-inverse flow that focuses the target.
- `apps/desktop/src/renderer/src/actions.ts` — reference action entries, chip context menu, block
  menu entries, disabled explanations.
- `apps/desktop/src/renderer/src/editor/bindings.ts` — `openReferenceMenu` binding.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — wire the binding.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — See also chip context menu.

Tests / evidence:

- `tests/ui/m3-reference.test.mjs` — third case covering make home, move here, demote, chip/menu
  state, exact undo/redo, disabled root make-home, and the screenshot.
- `artifacts/m3d2/role-transitions-1440x900.png` — evidence screenshot (not committed; artifacts
  are gitignored).

## Transition table

| Command | Role before → after | Branch ID | Order key | Chapter / root slot | Inverse |
|---|---|---|---|---|---|
| `branch.makeHome` | promoted reference → primary; old primary → reference | Both IDs preserved | Promoted appended at the end of `(source port, primary)`; demoted appended at the end of `(old source port, reference)` | Target already has a primary parent, so no top-level slot appears or disappears. The target’s derived chapter (and its subtree) becomes the new source’s chapter. | Exact snapshot of both branch records, roles, order keys, and any chapter slot. |
| `branch.moveHere` | promoted reference → primary; old primary deleted | Promoted ID preserved; old primary ID retired | Promoted appended at the end of `(source port, primary)` after the old primary is removed | A root target’s slot is removed from its chapter at its exact index; empty chapter rejected before mutation. The target’s derived chapter becomes the source’s chapter. | Exact snapshot restores the retired primary with its original ID/source/order and the target’s exact chapter slot. |
| `branch.demote` | primary → reference | Same ID | Appended at the end of `(source port, reference)` | Target becomes a top-level block immediately after the source block’s top-level ancestor in that chapter; subtree intact; no chapter can become empty. | Exact snapshot restores the primary role, order key, and the removed top-level slot. |

Role-independent dedupe guards:

- `makeHome` rejects when the promoted pair or the demoted old-primary pair would duplicate another
  branch; a legacy primary+reference pair for the same source/target is also rejected.
- `moveHere` ignores the old primary pair because that record is retired in the same command; a
  third duplicate still rejects.
- `demote` rejects when a reference with the same source/target already exists.

## Undo identity evidence

Core (`packages/core/test/role-transitions.test.ts`):

- `branch.makeHome` — after the swap, the promoted and demoted records keep their IDs and sources;
  `structureSnapshot` (blocks, branches, chapters, anchors) deep-equals the pre-command snapshot
  after one `applyInverse`, and redo reproduces the post-command branch records exactly.
- `branch.moveHere` — the retired primary is restored with the exact same record
  (`toEqual(oldPrimaryBefore)`) in one undo; redo removes it again. A repeated undo/redo cycle keeps
  both branch IDs unchanged.
- `branch.demote` — one undo restores the primary role/order and removes the inserted top-level slot;
  redo re-inserts the target after the former root.
- An anchored reference promoted by `makeHome` stays anchored (source `{ blockId, anchorId }`), and
  demoting that anchored primary leaves an anchored reference while the target becomes a root.
- Cycle, root make-home, empty-chapter, wrong-role, and duplicate-pair rejections are asserted
  against an unchanged caller document.

UI (`tests/ui/m3-reference.test.mjs`, third case):

- Saves the promoted/reference/old-primary records before the action and asserts deep equality after
  `⌘Z`; redo matches the recorded post-command records and chapter arrays.
- Move here asserts the old primary branch ID is gone, the promoted ID survives, and undo restores
  both records exactly; redo removes the old primary again.
- Demote asserts the target follows its former top-level source in `chapter.topLevelBlockIds`,
  keeps its child, and undo restores the exact chapter array and primary record.
- Disabled make-home is asserted with `aria-disabled="true"` and a “root” explanation; a
  reference-only block does not offer Demote.

## Tests and timings

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop, core, layout, pdf) |
| `npm test` | 38 files, 445 tests passed, 1.96 s |
| `node --test tests/ui/m3-reference.test.mjs` | 3 tests passed, 16.2 s wall (new case 1.37 s) |
| `npm run test:ui` | 9 files passed; 16 UI cases (15 existing + 1 new) |
| `npm run verify:fast` | pass: 444 unit tests at that run, 21/21 critical e2e, 44.9 s suite |
| Critical e2e count | unchanged at 21 (no e2e changes) |

After `verify:fast`, one anchored-source test and a message-only core cleanup were added; the final
tree was rechecked with `npm run typecheck`, `npm test` (445), and the full `m3-reference` UI file
(3/3). The Orchestrator still runs the full `verify` at integration.

Screenshot: `artifacts/m3d2/role-transitions-1440x900.png` (1440×900, Fit 87%). It shows the target
moved under the new home, the old primary edge as a **See also** chip, the target’s **Referenced by**
chip, `Shared · 1` in the outline, and one target card/row.

## Risks and open questions

- **Chip affordance:** the chip still focuses the other endpoint on left click; role actions are in
  its context menu and in the block menu. A visible chip action button would be more discoverable,
  but it needs a chip-overlay redesign (explicitly out of scope here).
- **Disabled vs hidden:** make-home is shown disabled with an explanation for a root target and for
  a promotion that would cycle, matching the OD-7 wording. “Show only when legal” is applied to the
  role-specific actions (Demote appears only on a primary incoming edge).
- **Restore rule:** role-transition undo relies on the snapshot overwrite rule (branch identity =
  ID + target; role/source may differ). This is command-layer-generated, but a reviewer should keep
  the ID-collision guard in mind for future commands.
- **Legacy duplicates:** make home/demote reject a document that already carries both roles for one
  exact pair; move here resolves it by retiring the old primary. No load-time dedupe was added.
- **Focus after undo:** transitions focus the target; undo restores the previous focus context, not
  necessarily the transition target.

## Next step

M3e repair/health is on hold until the product owner gives the go. When it resumes, it can build on
the same exact-snapshot pattern for broken anchors. Otherwise the next planned slice is M3f
(identity, split/merge, fixtures).
