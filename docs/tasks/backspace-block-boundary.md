# Backspace stops at the block boundary

**Role:** Implementer / Builder
**Milestone:** Editor behavior fix (pre-R6)
**Base:** `main` head at delegation (`ee928f6` plus this brief)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 2 hours

## Context

Plain Backspace currently leaves a block when the caret is at the very start of an empty block: it
moves focus to the previous block (`lib/backspace.ts` → `previous`, `editor/keymap.ts`). A
non-empty block at its very start can also fall through to ProseMirror's native join and cross the
block boundary. The product owner wants Backspace to stay inside its block: no focus move and no
cross-block join. Structural deletion remains `⌘Backspace` / Delete on a selected block.

## Goal

One worktree, one commit, one `npm run verify:fast`.

## In scope

- `apps/desktop/src/renderer/src/lib/backspace.ts`:
  - change the pure contract to `native | stay`;
  - a collapsed caret at the very start of a non-atomic block body returns `stay`, whether the
    body is empty or not;
  - a caret not at the block start returns `native` (normal editing, including joining paragraphs
    inside the same block);
  - atomic contexts (code block, table, list item, blockquote) keep `native`.
  - remove `previous`, `hasPrevious`, and `empty` from the context/outcome if no longer needed.
- `apps/desktop/src/renderer/src/editor/keymap.ts`:
  - `Backspace` returns `true` for `stay` (prevent default, no focus move, no join);
  - remove the previous-block focus branch and the `visibleBlockIds` import if unused;
  - remove `blockBodyIsEmpty` if it becomes unused;
  - keep `⌘Backspace` and Delete as the only structural delete paths.
- Tests:
  - update `apps/desktop/test/backspace.test.ts` to the new contract: start of empty block → stay,
    start of non-empty block → stay, not at start → native, atomic → native, no `previous`;
  - add a UI assertion (use `tests/ui/m2-view.test.mjs` or a small existing editor suite; if a new
    suite is cleaner, add it to `tests/ui/suites.mjs`): two blocks, caret at the very start of the
    second, press Backspace, assert the second block remains active, the first block is unchanged,
    and the caret stays in the second; repeat with the second block empty.
- No schema, Page/PDF, export, library, or settings change.

## Out of scope

- `⌘Backspace` / Delete behavior, block merge/delete commands, heading conversion.
- Backspace inside code blocks/tables/lists/blockquotes (native remains).
- R6 Continuous settings.

## Files

Read:
- `apps/desktop/src/renderer/src/lib/backspace.ts`
- `apps/desktop/src/renderer/src/editor/keymap.ts`
- `apps/desktop/src/renderer/src/editor/bindings.ts`, `DocumentEditor.tsx`
- `apps/desktop/test/backspace.test.ts`, `tests/ui/m2-view.test.mjs`, `tests/ui/suites.mjs`
- `docs/agents/brief-template.md`

Expected to touch: the two source files, their tests, and
`docs/reports/backspace-block-boundary.md`.

## Acceptance criteria

- [ ] At the very start of a non-atomic block (empty or not), Backspace does not move focus to
      another block and does not join with the previous block; the caret stays in the block.
- [ ] Inside the block, Backspace edits normally (text, paragraph joins at non-start positions).
- [ ] Code/table/list/blockquote Backspace remains native.
- [ ] `⌘Backspace`/Delete still delete structurally with confirmation.
- [ ] No schema/Page/PDF/settings change; tests updated, none weakened; no fixed sleeps/dialogs.

## Tests and evidence

- Targeted: `npx vitest run apps/desktop/test/backspace.test.ts` and the chosen UI suite.
- End of task: one `npm run verify:fast`.
- Screenshot/recording: a screenshot of the two-block state is enough; the key behavior is
  asserted by the UI test, not a video.

## Stop and ask

Stop if the fix needs a schema/block-merge change, if native Backspace inside an atomic context must
also be blocked, or if a baseline test fails for an unrelated reason.

## Report format

- Summary, files changed, checks with real timings, per-criterion pass/fail, risks, next step (R6).
- One commit in the worktree; do not merge or push.
