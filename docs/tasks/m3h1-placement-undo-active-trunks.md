# M3h1 — placement undo history and per-group active trunks

**Role:** Implementer / Builder  
**Milestone:** M3h — Sentinel review fixes  
**Base:** current `main` after the M3 Sentinel review integration  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** S2-1 and S3-1 from `docs/reviews/m3-review.md`. No dialog, token, image, or idle-anchor work.

## Context

Read `AGENTS.md`, `docs/plan.md`, `docs/reviews/m3-review.md` (S2-1, S3-1), `docs/design-tokens.md`,
and the M3g5/M3g6 reports. Build in the isolated worktree; do not change spec/UX/ADR/plan.

## S2-1 — view-only placement must not clear text undo history

Current behavior (reproduced by Sentinel): type text in a direct child, resize 1440 → 960 so the
child wraps below, then `⌘Z`. The text edit is not undone; the structural stack is used and an
unrelated block can be removed (9 → 8 blocks). `applyChildPlacement` rebuilds the editor with
`resetHistory: true` (`runtime.ts:1557-1574,1594`).

Required:

- A view-only placement change (right ↔ below after resize/content width change) preserves the
  unified text undo stack.
- `⌘Z` after the reflow undoes the last text edit, not an unrelated structural edit; block count
  stays unchanged.
- The next `⌘Z` still undoes the previous structural edit correctly.
- No canonical placement fields are added; placement remains a view projection.
- Add a regression that fails on the current behavior. Prefer an app-level test that types, resizes,
  presses `⌘Z`, and asserts text + block count; add a runtime/unit test if the history boundary can be
  isolated.

## S3-1 — active trunk only for the selected group

`EdgeLayer` `trunkActive` checks any active child in the parent group without filtering by the
trunk placement. Selecting a callout lights both the below trunk and the right trunk; selecting a
direct child does the same. Required: the right trunk considers only right-placed children, the
below trunk only below-placed children; the unrelated group and its arms stay muted.

Add a UI regression covering:
- select a callout → below trunk active, right trunk muted;
- select a direct child → right trunk active, below trunk muted;
- existing second-right-child active lead behavior stays intact.

## Tests and gates

- `npm run typecheck`
- targeted vitest for runtime/edge routing/placement
- `npm test`
- targeted UI file(s), including the new regressions
- `npm run e2e:critical`
- `npm run verify:fast`

One `npm run verify` is run by the Orchestrator after integration. UI tests use condition-based
waits only; no fixed sleeps, no native-dialog waits.

## Deliverable

Report: worktree path, branch, base, commit, summary, files, tests/timings, screenshots if visual,
risks, and anything not verified. Do not merge or push. Stop and ask if the fix would require
changing canonical undo semantics or the active-path model.
