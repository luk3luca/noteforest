# M2f phase 4b — Empty-chapter invariant + explicit stale-lock consent

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F6/F7; `docs/tasks/m2f-stability-fixes.md` phase 4  
**Out of scope:** keyboard/focus (F5), cleanup, M3/page/PDF

## F6 — Empty chapters

**Problem:** moving the last top-level block out of a chapter leaves an empty chapter that the editor adapter skips, so the canonical document and canvas diverge; after reload the chapter is stranded. `ensureChaptersHaveBlocks` only fills the first empty chapter.

**Decision:** enforce one invariant, **reject moving the last top-level block out of a chapter** (`block.move` to another parent/chapter and `branch.create` that reparents a top-level block). The user must delete the chapter explicitly or add another top-level block first. Do not auto-create content or silently delete the chapter.

Required:

- Core command validation rejects any move/branch-create that would leave the source chapter with zero top-level blocks; typed error naming the chapter.
- `block.delete` of the last top-level block? Deleting a chapter's only block is allowed only with explicit chapter handling; do not leave an empty chapter silently. Either require chapter deletion or auto-create a placeholder? Choose and document; prefer explicit chapter delete/reject.
- Legacy/empty chapters render as a valid chapter with its title and an “Add top-level block” row; adapter must not drop them. No invalid ProseMirror `branch+`.
- `ensureChaptersHaveBlocks` handles every empty chapter, not just the first, for legacy documents.
- Tests: move last block out rejected; branch.create last block rejected; reload with legacy empty chapter renders; add top-level recovers; valid docs unaffected.

## F7 — Stale lock consent

**Problem:** opening a package with a stale lock auto-calls `breakStaleLock: true`; a delayed heartbeat can be stolen, allowing two writers.

Required:

- Do not auto-break. Open read-only with a `stale-lock` status/reason and a clear banner/action **Take over lock**.
- Take over is explicit; only then call the core stale-lock recovery and reopen writable. Cancel keeps read-only.
- The lock metadata (PID/host/session/heartbeat) is shown or available.
- Other read-only states (corrupt/newer) unchanged.
- Tests: stale lock → read-only banner; cancel stays read-only; take over succeeds and writes; normal lock/open unchanged; no silent break.

## Tests / gates

- Add cases to `tests/recovery/` and `npm run test:recovery`; keep critical e2e <60 s (currently ~55.7 s). Do not add new native dialogs.
- `npm run typecheck`, `npm test`, `npm run e2e`, `npm run test:recovery`, `npm run verify` pass.
- Report exact error copy, takeover flow, before/after, known gaps.

## Acceptance

No operation can silently strand an empty chapter; legacy empty chapters render and can be recovered; stale locks never auto-break and require explicit takeover; typecheck/tests pass. No F5/cleanup/M3/page/PDF.
