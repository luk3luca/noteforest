# M3f1 — Split/merge with anchor migration and identity

**Role:** Builder  
**Milestone:** M3f1 (first half of M3f; M3f2 adds fixtures, export manifest, performance, final gate)  
**Base:** current `main` (M3e merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1.5 days

## Context

M3 has anchors, callouts, code/formula terms, references, and repair. AC-18 still needs
`block.split` and `block.merge` with anchor migration, and the identity rules must survive them.
This slice adds the minimal commands and a small menu path; M3f2 handles the fixture matrix,
exactly-once export manifest, performance, and the final M3 gate.

Read:
- `docs/spec.md` v0.4.5 §5.2 (split/merge), §15.3 AC-18; ADR-0005 §5 (identity), §8; design
  §5.2/§5.3, §12 M3f.
- `packages/core/src/commands.ts`, `anchors.ts`, `structure.ts`; renderer `actions.ts`, `runtime.ts`,
  `BlockViews.tsx`, `styles.css`, tests.

## Goal

A block can split at a text caret and merge with its previous sibling/parent port; anchors, branch
IDs, target IDs, order keys, and chapter slots migrate exactly; one undo restores the previous block
content/structure. Cross-chapter merge is rejected.

## In scope

1. **`block.split`**
   - Split inside a text leaf at a node path/offset; atomic nodes (formula/code/image) move whole;
     reject a split that would separate an atomic node from surrounding text except at a boundary.
   - Original keeps pre-split content; new block gets post-split content with a new block ID.
   - Top-level original: new block top-level immediately after. Non-root: primary branch from the
     same parent port (block or anchor), ordered after the original.
   - Anchors entirely before stay; entirely after move `blockId`; spanning anchor keeps its ID, keeps
     the mark on the original side only, flags `split-inside-anchor` for repair; branch target stays.
   - Branches sourced from moved anchors update `source.blockId`; direct children stay with the
     original. Exact snapshot inverse.
2. **`block.merge`**
   - Minimal same-parent-port (same block or same anchor) or both top-level in the same chapter;
     cross-anchor/cross-chapter rejected.
   - Append content; anchors move to the surviving block and keep IDs; text marks preserved.
   - Reference edges retarget; duplicate exact source-target removed keeping primary/earlier; self-
     branch dropped; merged block's incoming primary edge removed; primary children become children
     of the surviving block; top-level slot removed.
   - Exact snapshot inverse; one undo entry.
3. **UI**
   - Block menu **Split at caret** and **Merge with previous** where legal; disabled with a reason
     otherwise. No new global keybinding.
   - After split/merge, focus the surviving/new block; callouts/markers update.
4. **Identity tests**
   - Core: split/merge text/math/code anchors, spanning anchor, branch ID/source/target/order,
     chapter slot, undo/redo/reload; reject atomic separation/cross-chapter.
   - UI: menu split/merge with an anchored block, undo, screenshot.
   - No new critical e2e; critical stays 21 tests.

## Out of scope

- Paste/duplicate anchor remap (M3f2 or follow-up).
- Fixture matrix, `buildExportPlan`, 1,000-anchor performance (M3f2).
- Image anchors (blocked), page/PDF, schema change, new dependencies.
- Full undo history UI; the existing stack is enough.

## Files

Expected to touch:
- `packages/core/src/commands.ts`, `types.ts` (command shapes), `structure.ts` if needed
- `packages/core/test/*` (new split/merge identity suite)
- `apps/desktop/src/renderer/src/actions.ts`, `state/runtime.ts`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`, `styles.css`
- `tests/ui/m3-split-merge.test.mjs` or an existing UI file
- `docs/reports/m3f1-split-merge.md`

## Acceptance criteria

- [ ] Split inside a text leaf creates a new block with exact placement; atomic nodes move whole;
      invalid atomic separation is rejected before mutation.
- [ ] Anchors after the split move block; a spanning anchor keeps its ID, clips to the original,
      flags repair, and keeps its branch/target.
- [ ] Merge appends content, moves anchors, retargets/dedupes branches, removes the merged block's
      primary edge/slot, and never creates a self-branch; cross-chapter merge is rejected.
- [ ] Undo/redo restores content, block IDs, anchor IDs, branch IDs/sources/orders, and chapter slots
      exactly; one undo entry per action.
- [ ] Block menu split/merge works and is disabled with a reason when illegal.
- [ ] UI test + screenshot; no new critical e2e; no paste/fixture/export work.
- [ ] No fixed sleeps/native dialogs; hidden windows.

## Tests and evidence

- `npm run typecheck`
- Targeted core/UI tests
- `npm run test:ui` and `npm run verify:fast` once at the end (critical unchanged)
- Screenshot path and test name.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if split/merge needs a new command transaction model, if anchor migration cannot preserve
identity, or if the UI needs a product decision (for example a split at an atomic node boundary).

## Report format

Summary, files, split/merge behavior, identity/undo evidence, tests/screenshot/timings, risks,
next step M3f2.
