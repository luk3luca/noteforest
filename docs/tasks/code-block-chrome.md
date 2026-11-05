# Code block chrome — language, copy, turn into text, fence rails

**Role:** Builder  
**Milestone:** Post-M3 editor UX (not scheduled)  
**Base:** current `main` when scheduled  
**Worktree:** fresh worktree from `main`  
**Timebox:** 0.5–1 day

## Context

Obsidian shows the ` ``` ` fences around a code block when it is selected and lets the user manage the
block from there. NoteForest stores a structured `codeBlock` node, so the fence is not canonical, but
the current UI hides every management affordance: the floating `<>` button is inline code, the block
type menu only offers Text/H1–H3, and "Toggle code block" is buried in the command palette. The
product owner confirmed this is a UX gap, not a design decision.

Read:
- `docs/plan.md` "Backlog — editor UX"; `docs/ux.md` code block flows; `docs/ux-shell.md`.
- `apps/desktop/src/renderer/src/editor/extensions.ts` (CodeBlockLowlight), `SelectionToolbar.tsx`,
  `actions.ts` (block menu/palette), `editor/views/BlockViews.tsx`, `styles.css`.
- `apps/desktop/test`, `tests/ui`.

## Goal

A code block is visibly manageable without exposing raw Markdown as the document source: language,
copy, turn-into-text, delete and optional fence rails are available from the block itself and from
the block menu/palette.

## In scope

1. **Code block header/chrome**
   - Header with language label/picker (lowlight languages), Copy, **Turn into text**, Delete.
   - Visible on hover, focus, or block selection; keyboard reachable; `aria-label`s.
   - `Turn into text` converts the code block node to paragraphs, preserving its text; one undo entry.
   - Delete removes the code block node/block content, not the containing branch unless the block
     itself is deleted; use the existing structural delete for the whole block.
2. **Fence rails (visual affordance)**
   - ` ``` ` rails above/below the code area when focused/selected; decorative, `aria-hidden`, not
     editable; they make the block boundary obvious like Obsidian.
   - No raw Markdown editing; canonical content stays the `codeBlock` node.
3. **Menu/palette parity**
   - Add "Turn into text" / "Delete code block" (and language) to the block actions menu and command
     palette when a code block is active/selected.
   - Keep "Toggle code block" for insertion; make it work from a selected code block without
     trapping the user.
4. **Tests/evidence**
   - UI test: insert a code block, set language, copy (clipboard or button state), turn into text,
     undo, delete; fence rails visible only when focused/selected; keyboard path.
   - No new critical e2e; critical suite stays 21.
   - Screenshot.

## Out of scope

- Markdown fence import/export (separate task).
- Code anchors/token selection (M3c3).
- Line numbers, wrap toggle, minimap, or a full code editor; optional later.
- Schema change or new dependencies.

## Files

Expected to touch:
- `apps/desktop/src/renderer/src/editor/extensions.ts`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`
- `apps/desktop/src/renderer/src/editor/SelectionToolbar.tsx` only if the inline-code button must be
  disambiguated
- `apps/desktop/src/renderer/src/actions.ts` (block menu/palette)
- `apps/desktop/src/renderer/src/state/runtime.ts` if a turn-into-text command/inverse is needed
- `apps/desktop/src/renderer/src/styles.css`
- `tests/ui/m3-code-block.test.mjs` or an existing UI file
- `docs/reports/code-block-chrome.md`

## Acceptance criteria

- [ ] Header exposes language, Copy, Turn into text, Delete; keyboard reachable with focus rings.
- [ ] Turn into text preserves the code text and is one undo entry; undo restores the code block.
- [ ] Fence rails appear on focus/selection only and are decorative.
- [ ] The block menu and command palette offer the same actions; no dead "Toggle code block".
- [ ] UI test + screenshot; critical e2e unchanged; no schema change.
- [ ] No Markdown fence editing in the canonical document.

## Tests and evidence

- `npm run typecheck`, targeted UI test, `npm run test:ui`, `npm run verify:fast`.
- Screenshot path and test name.
- Orchestrator runs the full `verify` at integration.

## Stop and ask

Stop if turn-into-text needs a new core command with a non-exact inverse, or if the fence rails would
conflict with the M3 anchor marker/hit-testing.

## Report format

Summary, files, chrome/actions, undo/identity evidence, UI test/screenshot, timings, risks.
