# M2f phase 3a — Unified undo routing

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F2; `docs/tasks/m2f-stability-fixes.md` phase 3  
**Out of scope:** destructive-delete/detach inverses, branch-ID/chapter-preserving move inverses (phase 3b), M3/page/PDF

## Problem

The app has two undo worlds:

- structural undo is chosen only when `lastStructuralAt > lastTextAt`; after any text edit, the structural stack is unreachable even when ProseMirror history is empty;
- the 120 ms menu-command dedupe drops intentional repeated `⌘Z`/redo presses;
- there is no fallback when one history is exhausted.

Phase 3a makes the user experience one predictable undo command with a fallback. Inverses for destructive operations and branch identity are phase 3b.

## Scope

- `undoActive`/`redoActive`:
  - choose the stack based on the last operation (text vs structural) and focus;
  - if the chosen stack cannot undo/redo, fall back to the other;
  - use `editor.can().undo()` / `can().redo()` (or equivalent) rather than time heuristics alone;
  - when a structural undo/redo rebuilds the editor, keep selection/focus stable and ensure text history is invalidated/cleared safely;
  - no infinite loop between stacks; each command attempts at most one fallback.
- Remove the time-based 120 ms dedupe for undo/redo. Keep dedupe only for commands where a native-menu + renderer double delivery is a real duplicate; do not drop repeated user undo/redo.
- `⌘Z`/`⌘⇧Z`, menu Undo/Redo, palette Undo/Redo, and the toolbar share the same routing.
- Document the rule in code/README: text stack first or structural first according to the last operation, fallback when empty; one user-visible stack.
- Do not change the core inverse model in this phase; destructive delete/detach still have no inverse until 3b. The fallback must not pretend they are undoable.

## Tests

- Unit: routing decision (last text vs last structural, structural available, text available, both empty, fallback once).
- E2E/critical:
  - add child → type text → `⌘Z` undoes the text → `⌘Z` again undoes the structural child (fallback);
  - fast repeated `⌘Z`/redo presses are not dropped;
  - text undo with empty history falls back to the structural stack;
  - structural undo with empty history falls back to text;
  - undo/redo via menu and palette behaves the same;
  - no double-undo from a single keypress;
  - normal text editing undo is unchanged.
- Condition waits, no fixed sleeps; critical e2e stays <60 s; no data-safety test removal.

## Acceptance

A user can press undo repeatedly and traverse text and structural history predictably; the 120 ms dedupe no longer drops undo/redo; one keypress never undoes twice; `npm run typecheck`, `npm test`, `npm run e2e`, `npm run verify:fast` pass. No phase 3b/other work.
