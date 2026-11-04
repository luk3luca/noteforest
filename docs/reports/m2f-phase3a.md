# M2f phase 3a — Unified undo routing

**Status:** Complete (4 November 2026)  
**Owner:** Builder  
**Source:** `docs/tasks/m2f-phase3a-undo-routing.md`; `docs/reviews/m2-review.md` F2; `docs/tasks/m2f-stability-fixes.md` phase 3  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-4cc6c157`  
**Branch:** `t3/m2f-phase3a-undo-routing`

## What changed

Undo/redo is now one routed user command over two internal stacks (ProseMirror text
history and the runtime structural inverse stack).

### Routing rule

The preferred stack is the one used by the last operation:

- last operation was text (typing or a text undo/redo) → text first;
- last operation was structural (create, move, delete, detach, chapter change, or a
  structural undo/redo) → structural first;
- no previous operation → text when the editor has focus, structural otherwise.

The router checks the actual availability of the preferred stack with
`editor.can().undo()` / `editor.can().redo()` and the runtime stack length. If the
preferred stack is empty, it uses the other stack exactly once. When both are empty it
does nothing. There is no loop and no second attempt after a stack has been selected, so
one keypress can never undo/redo twice.

The decision is a pure function in
`apps/desktop/src/renderer/src/lib/history-routing.ts` and has unit coverage for last
text/structural, both fallbacks, both empty, focus default, redo, and "fallback once".

### Delivery paths

- `⌘Z` / `⇧⌘Z`: renderer keydown → `undoActive` / `redoActive` (unchanged single path).
- Edit menu Undo/Redo: menu items now have stable IDs (`menu-undo`, `menu-redo`) and
  `registerAccelerator: false`; clicking still sends the same command, but the native
  accelerator no longer competes with the renderer keydown.
- Command palette Undo/Redo: same `undoActive` / `redoActive`.
- Settings action: renamed from "Undo last structural change" to "Undo last change" and
  calls the same router.

### Dedupe

The 120 ms menu-command dedupe no longer applies to `undo` and `redo`. Repeated presses
are intentional and must not be dropped. The dedupe remains for the other menu commands,
where the native accelerator + renderer keydown double delivery is real. Undo/redo avoid
that duplicate at the source by not registering their native accelerators.

### Focus and text history around structural undo/redo

- Before a structural change the runtime records the selected block, its ancestor chain,
  chapter, caret offset, and node-selection kind.
- After the rebuild it focuses the same block when it survives, otherwise the nearest
  surviving ancestor, then the chapter's first top-level block, then the first visible
  block. The caret offset (or node selection) is restored when the same block survives.
- A structural undo/redo rebuild resets the ProseMirror text undo/redo stacks, so the
  editor cannot replay a step that no longer maps to the rebuilt document.
- Reloading from disk also clears both structural stacks and the text history.

## Before / after

| Area | Before | After |
| --- | --- | --- |
| Stack choice | Structural only when `lastStructuralAt > lastTextAt`; every text edit made structural undo unreachable | Last operation chooses the preferred stack; `can().undo()/redo()` decides availability |
| Exhausted stack | Silent no-op (structural unreachable; editor history empty) | One fallback to the other stack, then stop |
| Repeated `⌘Z` | Second press inside 120 ms dropped | Repeated presses applied; each press = one step |
| Double delivery | 120 ms dedupe masked native-menu + renderer duplicates | Native accelerator not registered for undo/redo; renderer is the single keyboard path |
| Structural rebuild | Selection mapped arbitrarily; stale text history could undo pre-rebuild steps | Focus block/ancestor fallback; text history reset |
| Command surfaces | Keyboard, menu, palette and settings reach different effective behavior | All call the same router |
| Delete/detach | Not undoable | Still not undoable; explicitly not presented as undoable (phase 3b) |

## Gate table

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass |
| Unit | `npm test` | Pass — 194 tests / 20 files, 1.67 s |
| Critical e2e | `npm run e2e` | Pass — 26 tests, 51.26 s suite (< 60 s) |
| Fast verification | `npm run verify:fast` | Pass — typecheck + unit + e2e, 1:05 wall including build |
| Data-safety tests | — | Kept; no data-safety/desync/arrow/layout/keyboard test removed |
| Native dialogs in e2e | — | Unchanged E2E dialog guard; new test uses only renderer dialogs |

## Tests added

- `apps/desktop/test/history-routing.test.ts` — 8 unit cases for the routing decision.
- `tests/e2e/m2-editor.test.mjs` — one critical test covering:
  - delete (no inverse) followed by undo → structural stack empty, text fallback;
  - one keypress undoes exactly one text event;
  - two rapid undo presses both apply, two rapid redo presses both apply;
  - add child → type → palette undo (text) → menu undo (structural fallback);
  - structural undo focus returns to the parent block, with editor focus restored;
  - structural redo with a real inverse (top-level reorder) via the Edit menu;
  - settings action uses the same text/structural router;
  - deleted block is not resurrected by undo (phase 3b gap stays visible).
- The existing rapid-structural test no longer needs the 150 ms delay before its second
  undo; the dedupe exemption is covered there too.

## Known gaps (phase 3b and later)

- `block.delete` (single or subtree) and `branch.delete` still return `inverse: null`.
  Delete/detach remain non-undoable. As a consequence, undoing a creation (which applies
  `block.delete`) cannot be redone yet: the redo stack is empty. Structural redo is
  tested with a move/reorder, whose inverse exists.
- `block.move` child→top-level→child still loses branch identity; cross-chapter
  `branch.create` undo still restores the target to the source chapter.
- Text typed before a structural step is intentionally cleared when a structural undo or
  redo rebuilds the editor; there is no cross-era text redo.
- Phase 3a does not add keyboard focus work, empty-chapter invariants, stale-lock
  handling, or any M3/page/PDF work.

## Files changed

- `apps/desktop/src/renderer/src/lib/history-routing.ts` (new)
- `apps/desktop/src/renderer/src/state/runtime.ts`
- `apps/desktop/src/renderer/src/actions.ts`
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/main/menu.ts`
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx`
- `apps/desktop/test/history-routing.test.ts` (new)
- `tests/e2e/m2-editor.test.mjs`
- `README.md`
- `docs/reports/m2f-phase3a.md` (this report)

## Next step

Phase 3b: add inverses for destructive block/subtree delete and branch detach, preserve
branch IDs and original chapter placement in move/branch-create inverses, and extend the
undo sequence tests to delete → undo, detach → undo, and branch-ID/chapter-preserving
move undo.
