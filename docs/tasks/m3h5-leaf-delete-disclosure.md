# M3h5 — leaf delete disclosure for external references

**Role:** Implementer / Builder  
**Milestone:** M3h — Sentinel re-review minors  
**Base:** current `main` after the M3h re-review integration (`362d41d`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** S3-8 only. No token, placement, repair, idle-anchor, image, or API changes.

## Finding

`⌘Backspace` / `Delete` on a leaf block that has incoming external reference edges deletes the
block and those “See also” edges without opening the delete dialog. The disclosure added by M3h2 is
only reached through the block menu/dialog path. The product owner has approved disclosure for this
case.

## Required behavior

- A leaf block with **zero external references** keeps the current fast path: delete with only the
  undo toast, no confirmation.
- A leaf block with **one or more external reference parents** opens the existing delete dialog
  before deleting; the dialog lists the reference parents/edges (source block, chapter, role, target)
  and clearly states they will be removed. The block has no descendants, so the descendant choice
  should not be shown or should be irrelevant.
- Cancel/close mutates nothing and keeps selection/focus sensible.
- Confirm uses the existing core delete and one undo restores the exact graph, including the
  reference edges.
- The same rule applies to the leaf block menu path; do not create a second disclosure component.

## Tests

- App/UI test: leaf with an external reference parent, press `⌘Backspace`, assert the dialog is shown
  with the reference row; cancel leaves the graph unchanged; confirm removes it; undo restores.
- App/UI test: leaf without references still deletes without a dialog (no regression).
- Unit test for the “needs delete confirmation” predicate if it is extracted.
- Keep condition-based waits only; no fixed sleeps or native dialogs.

## Gates

`npm run typecheck`, targeted vitest, `npm test`, targeted UI, `npm run test:ui`, `npm run
e2e:critical`, `npm run verify:fast`. The Orchestrator runs one full `npm run verify` after
integration.

## Deliverable

Report: worktree path, branch, base, commit, summary, files, tests/timings, screenshots of the
disclosure and fast-path leaf delete, risks, and anything not verified. Do not merge or push. Stop
and ask if the existing delete dialog cannot express the leaf-with-references case cleanly.
