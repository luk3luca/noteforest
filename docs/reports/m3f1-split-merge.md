# M3f1 — Block split/merge with anchor migration and identity

**Role:** Builder  
**Milestone:** M3f1 (first half of M3f)  
**Status:** Implemented; targeted checks, `test:ui`, and the one `verify:fast` gate passed  
**Base:** current `main` (M3e merged)  
**Worktree:** see the Builder handoff (branch `t3/m3f1-block-split-merge`)

## Summary

M3f1 adds the two AC-18 commands and a minimal block-menu path:

- `block.split` at a canonical text caret (node path + Unicode code-point offset), with atomic
  nodes moved whole and a rejection before mutation when the cut is inside an atomic node/table or
  would leave an empty block;
- anchor migration across the cut: before stays, after moves `blockId`, spanning keeps its ID,
  clips to the original side, keeps its branch/target, and stores `split-inside-anchor` in
  `repairFlags` without rewriting the selector quote;
- branch identity migration: branches sourced from moved anchors update `source.blockId`; direct
  children stay with the original; the new block gets the same parent port and order immediately
  after the original, or the chapter slot immediately after a top-level original;
- `block.merge` into the previous sibling (or explicit target) with same-port / same-chapter
  validation, content append, anchor move, reference retarget/dedupe, self-branch drop, incoming
  primary-edge removal, primary-child re-keying, and top-level slot removal;
- exact `structure.restore` inverse for both commands, one undo entry, and exact redo;
- block menu **Split at caret** / **Merge with previous**, enabled only when legal and otherwise
  disabled with the core reason;
- focus moves to the new block after split and the surviving block after merge; the context menu no
  longer steals focus back after an async action.

No schema bump, no new dependency, no paste/duplicate remap, no export manifest, no fixture matrix,
and no performance work (M3f2).

## Files changed

- `packages/core/src/block-ops.ts` (new) — pure split/merge planning, content split, anchor
  classification, and user-facing legality reasons shared by commands and menus.
- `packages/core/src/commands.ts` — `block.split` and `block.merge` command shapes/execution,
  branch dedupe/re-key helpers, snapshot inverse coverage, and anchor/branch restore support for
  identity moves.
- `packages/core/src/types.ts` — optional `Anchor.repairFlags`, no schema change.
- `packages/core/src/anchors.ts` — resolution exposes stored `repairFlags` without changing state.
- `packages/core/src/index.ts` — exports the new pure block-ops module.
- `packages/core/test/split-merge.test.ts` (new) — split/merge identity, anchor, branch, placement,
  rejection, undo/redo, and reload coverage.
- `apps/desktop/src/renderer/src/lib/anchor-selection.ts` — canonical caret → text leaf + code-point
  offset bridge for split.
- `apps/desktop/src/renderer/src/state/runtime.ts` — `splitAtCaret` / `mergeBlock`, caret access,
  focus of the new/surviving block.
- `apps/desktop/src/renderer/src/actions.ts` — block-menu entries and disabled reasons.
- `apps/desktop/src/renderer/src/shell/ContextMenu.tsx` — action-owned focus is not restored to the
  pre-menu control (async split/merge focuses the result).
- `apps/desktop/src/renderer/src/App.tsx`, `global.d.ts` — test-only caret access for the UI test.
- `tests/ui/m3f1-split-merge.test.mjs` (new) — menu split/merge with an anchored block, callout
  migration, one-undo restore, focus assertions, and screenshot.
- `package.json` — new UI suite added to `test:ui` and `verify`.
- `docs/reports/m3f1-split-merge.md` — this report.

## Split behavior

### Content and placement

- The command accepts `{ blockId, at: { nodePath, offset } }`; the target must be a text leaf, the
  offset is Unicode code points, and the split is rejected if any path node is a formula, code
  block, image, horizontal rule, or table (atomic/table content moves whole or is not split).
- Content before the cut stays in the original block; content after the cut moves to a new block
  with a fresh ID. Empty wrapper sides are dropped, and a split that would leave either block empty
  is rejected before mutation.
- A top-level original gets the new block immediately after it in the same chapter. A non-root
  original gets a new primary branch from the same parent port (block or anchor), ordered
  immediately after the original.

### Anchors and branches

- A text anchor whose projection range ends at/before the cut stays with the original.
- A text anchor whose range starts at/after the cut moves to the new block and updates
  `anchor.blockId`; its anchor ID and branch IDs stay.
- A spanning text anchor keeps its ID, keeps the mark on the original side only, removes the binding
  from the new side, does not rewrite `quote`/selector context, keeps its branch target, and stores
  `repairFlags: ["split-inside-anchor"]`. Resolution exposes the flag.
- Formula, code, and image atomic anchors move whole with their node; a split inside the atomic node
  is rejected.
- Branches sourced from moved anchors update `branch.source.blockId`; branches sourced from the
  original block and direct children stay with the original.

## Merge behavior

- Default target is the previous primary sibling in the same parent port; top-level blocks use the
  previous top-level block in the same chapter. An explicit `intoBlockId` is legal only for the same
  parent port or both top-level in the same chapter.
- Cross-anchor and cross-chapter merges are rejected with a reason and no mutation.
- Survivor content appends the merged block's children; the merged block is deleted and its
  top-level slot is removed.
- Anchors from the merged block move to the survivor and keep their IDs and content marks.
- Reference edges targeting the merged block retarget to the survivor. Branches sourced from the
  merged block retarget to the survivor, keeping an anchor source's anchor ID. Exact duplicate
  source-target pairs collapse role-independently: primary wins, otherwise the earlier order then
  branch ID, with a warning. Self-branches are dropped with a warning.
- The merged block's incoming primary edge is removed, and its primary children re-key after the
  survivor's existing children with their branch IDs preserved.

## Identity and undo evidence

`packages/core/test/split-merge.test.ts` adds six core cases:

- top-level split with text anchors before/after/spanning plus formula and code anchors, five
  reference branches, a direct child, chapter slot, branch IDs/targets/orders, `split-inside-anchor`,
  clipped binding, undo/redo exactness, and save/reload flags;
- child split from an anchored parent port, new sibling branch order between the original and the
  next anchored child, and direct children staying with the original;
- atomic/empty-side split rejection with an unchanged document;
- child merge with appended content, anchor mark/identity move, removed incoming primary edge,
  primary-child re-keying, reference retarget/dedupe, self-branch drop, incoming reference retarget,
  and exact undo/redo;
- top-level merge with the chapter slot removed and restored;
- cross-chapter, cross-anchor, and first-sibling merge rejections without mutation.

Both commands return a `structure.restore` inverse through the existing exact-snapshot path. Undo
restores block IDs, content and timestamps, anchor IDs/block IDs/repair flags, branch IDs/source/
target/role/order, chapter slots, and manual-break references. Redo reproduces the post-command
snapshot. One `applyInverse` / one `Meta+z` restores the whole action.

Restore support was extended narrowly so the same anchor identity may move `blockId` and the same
branch identity may repoint source/target during split/merge undo; the ID remains immutable and
kind mismatch still rejects a different anchor.

## UI

- The block menu shows **Split at caret** and **Merge with previous**.
- When illegal, the entry is disabled and names the reason, for example
  `Split at caret — the caret is in a different block` or
  `Merge with previous — this is the first top-level block in its chapter`.
- Split focuses the new block; merge focuses the surviving block at the end.
- Callouts/markers update with the canonical rebuild: an anchor after the cut moves its callout lane
  to the new block; merging moves it back to the survivor.
- No new global keybinding.

UI test: `tests/ui/m3f1-split-merge.test.mjs` creates a text block and an anchored primary child,
checks the disabled split reason with the caret elsewhere, splits at the caret through the menu,
asserts block/chapter/anchor/branch identity, the callout lane move, focus, screenshot, merges back
through the menu, and restores the split state with one `Meta+z`.

Screenshot: `artifacts/m3f1/split-merge-1440x900.png` (1440×900), split state with the original
`Alpha` block and the new `anchor omega` block whose callout lane owns the `omega` branch.

## Tests and evidence

Commands run in the M3f1 worktree:

- `npm run typecheck` — pass (desktop node/web, core, layout, pdf).
- `npx vitest run packages/core/test/split-merge.test.ts` — 6/6 pass (about 140 ms).
- `npm test` — 40 files, 457 tests, 1.86 s (was 451; +6 M3f1 core tests).
- `node --test tests/ui/m3f1-split-merge.test.mjs` — 1/1 pass (about 1.6 s test body).
- `npm run test:ui` — all 11 UI files pass, including the new M3f1 file.
- `npm run verify:fast` — pass; critical e2e stays at 21 tests.

No fixed sleeps and no native dialogs were added; UI tests launch hidden and use condition waits.
No new critical e2e was added.

## Risks and open questions

- **Split scope is deliberately minimal:** text leaves only; atomic nodes move whole; tables are not
  split. A product decision to split inside a table or a code block needs a separate UX/spec
  decision.
- **Spanning anchors are flagged, not auto-repaired.** The mark is clipped to the original side and
  `split-inside-anchor` is stored; the M3e health surface currently lists broken/ambiguous states,
  so a later UI pass may choose to surface resolved-but-flagged anchors as “needs repair”. The
  selector quote is intentionally not rewritten.
- **Broken anchors without a content binding stay with the original.** Movement is based on the
  content binding; a binding-less anchor cannot be assigned to a side without a unique fallback,
  so it is not guessed.
- **Merge appends block children without a separator.** Two paragraphs remain two paragraphs. If the
  product wants a visual/textual join, that is a follow-up UX decision.
- **Reference dedupe compares order keys across different source ports.** The specified rule is
  “earlier by order then ID”; the implementation is deterministic, and primary wins when roles
  differ.
- **Restore is more permissive for branch target/anchor block repoints.** This is required for exact
  split/merge undo and relies on globally unique, never-reused IDs; full validation still runs after
  every restore.
- The context-menu fix is general: after any menu action, focus is owned by the action rather than
  restored to the pre-menu control. Menus that do not move focus may leave focus on the page body
  instead of the opener; this is preferable to stealing focus from an async command result.

## Next step

**M3f2** — paste/duplicate anchor remap, the M3 fixture matrix and fixture-validity test,
`buildExportPlan` exactly-once manifest with broken markers and reference neutrality, 1,000-anchor
resolution performance, and the final M3 gate. The Orchestrator runs the full `verify` at
integration.
