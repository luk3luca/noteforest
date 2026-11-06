# M3h2 — anchor safety flows: repair preview and delete disclosure

**Role:** Implementer / Builder  
**Milestone:** M3h — Sentinel review fixes  
**Base:** current `main` after the M3 Sentinel review integration  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** S2-2 (AC-55) and S2-3 (AC-06) from `docs/reviews/m3-review.md`. No live-state, idle-anchor,
token, image, or placement work.

## Context

Read `AGENTS.md`, `docs/plan.md`, `docs/reviews/m3-review.md` (S2-2, S2-3), spec §8 and §15
(AC-55, AC-06), UX repair/delete flows, and the M3e/M3f reports. Build in the isolated worktree; do
not change spec/UX/ADR/plan.

## S2-2 — AC-55 repair preview and explicit Confirm

Current behavior: selecting a repair candidate and “Relink to current selection” mutate the anchor
immediately. The required flow is:

1. Candidate selection shows a **before/after preview** (old quote/binding → new quote/binding,
   affected anchor and branch IDs, target block).
2. A separate **Confirm** applies the relink; Cancel/close mutates nothing.
3. Confirm is one structural command and one undo entry; anchor ID and branch IDs are preserved.
4. The core command remains the validation authority; do not duplicate resolution logic in the
   dialog.

Update the existing UI test that currently locks in one-click behavior; add a cancel case that
proves no document mutation. Keep the health sheet keyboard reachable.

## S2-3 — AC-06 delete confirmation lists external references

Current behavior: deleting a block/subtree can remove incoming reference edges, but the confirmation
only lists descendants. Required:

- Before delete, compute and display every external reference parent (source block and chapter, role)
  whose edge targets the deleted block or a block in the deleted subtree.
- The confirmation must make clear those reference edges will disappear; primary-parent behavior
  stays as specified.
- Cancel mutates nothing; confirm uses the existing core delete and one undo.
- Add an app test with an external reference parent; assert the dialog lists it and that confirm
  removes it, while cancel leaves the graph unchanged.

## Tests and gates

- `npm run typecheck`
- targeted vitest for repair/delete command plans
- `npm test`
- targeted UI tests
- `npm run e2e:critical` if the delete/repair path is covered there
- `npm run verify:fast`

One `npm run verify` is run by the Orchestrator after integration. UI tests use condition-based
waits only; no fixed sleeps, no native-dialog waits.

## Deliverable

Report: worktree path, branch, base, commit, summary, files, tests/timings, screenshots of the preview
and delete disclosure, risks, and anything not verified. Do not merge or push. Stop and ask if a
product decision is needed for the preview or delete wording.
