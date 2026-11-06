# M3h3 — live anchor health and idle-anchor removal

**Role:** Implementer / Builder  
**Milestone:** M3h — Sentinel review fixes  
**Base:** current `main` after M3h1/M3h2 (`102ff58`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** S2-4 and S3-2 from `docs/reviews/m3-review.md`. No repair-preview/delete-disclosure,
placement/undo, token, image, or spec/UX/ADR/plan changes.

## Context

Read `AGENTS.md`, `docs/plan.md`, `docs/reviews/m3-review.md` (S2-4, S3-2), spec §8.2/§8.3 and
§15, UX health-sheet flows, and the M3e/M3h2 reports. Build in the isolated worktree.

## S2-4 — live broken state after edit/delete/undo

Current behavior (Sentinel repro): delete anchored text, wait for save. The status-bar health chip
shows a broken anchor, but the block warning and callout state stay one revision behind. After undo,
the stale “Lost anchor” warning can remain until an unrelated click forces a render.

Required:

- Deleting anchored text immediately marks the anchor broken in the block/callout/inline marker,
  not only in the status chip.
- Repair remains reachable; the branch and target stay.
- Undo immediately clears the broken state everywhere; redo restores it.
- The derivation must be revision-subscribed (runtime version/content commit), not only a
  render-time `runtime.document` read of a stale node view.
- Cover text anchors at minimum; formula/code share the warning path and should be checked or
  explicitly noted. No silent deletion.

Add an app regression that fails on the current one-revision lag and stale-undo warning.

## S3-2 — idle anchor removal

Spec/UX require an **All anchors** filter that includes idle anchors and a **Remove anchor** action.
Idle anchors currently have no visible removal path.

Required:

- `All anchors` includes idle anchors with a clear non-error status.
- Remove anchor deletes the anchor record and its binding, does not delete the target block, and is
  one undo entry; undo restores the anchor/binding exactly.
- The health sheet stays keyboard reachable and navigable.
- Add unit coverage for the idle projection and an app test for remove + undo; verify a branchless
  anchor can be removed while a live anchor cannot be removed by the idle path.

## Tests and gates

- `npm run typecheck`
- targeted vitest for health projections and anchor commands
- `npm test`
- targeted UI/e2e for the live broken/undo and idle removal flows
- `npm run test:ui`
- `npm run e2e:critical`
- `npm run verify:fast`

One `npm run verify` is run by the Orchestrator after integration. UI tests use condition-based
waits only; no fixed sleeps, no native-dialog waits.

## Deliverable

Report: worktree path, branch, base, commit, summary, files, tests/timings, screenshots of the live
warning/repair and idle-remove states, risks, and anything not verified. Do not merge or push. Stop
and ask if a spec/UX decision is needed for idle status wording or removal semantics.
