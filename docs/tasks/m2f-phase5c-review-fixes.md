# M2f phase 5c — Sentinel re-review fixes (N1/N2, docs, nits)

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2f-review.md` N1–N6  
**Out of scope:** M3, page view, PDF, new product behavior beyond N1/N2

## Goal

Close the two S2 regressions found by the M2f Sentinel re-review, plus the small docs and cleanup findings, without growing the critical e2e suite past its budget.

## N1 — Undo of a new chapter's first block is rejected and poisons the stack

**Evidence:** `packages/core/src/commands.ts:1098` (`block.create` inverse), `:1136-1145` (empty-chapter reject); `apps/desktop/src/renderer/src/actions.ts:119-151` (`createChapter`); `apps/desktop/src/renderer/src/state/runtime.ts:1558-1567` (failed inverse re-pushed).

Required:

1. **Core:** the inverse of `block.create` must be allowed to remove the block even when it is the last top-level block of a chapter. Add an explicit, documented field (for example `allowEmptyChapter: true`) to `block.delete`, set it only on the inverse produced by `block.create`, validate the type, and keep the F6 guard for every user-facing delete. Undoing a creation restores the pre-create state; a legacy empty chapter is valid and renders with its Add row.
2. **Runtime:** a failed structural undo/redo must not stay permanently at the top of the stack. Pop it, report the error, and let the next `⌘Z` reach older entries. Do not silently discard it without a message.
3. **App:** `createChapter` (`⌘⇧N`) is one user action and should undo as one entry per spec §5.1. Preferred: run `chapter.create` + first `block.create` inside one runtime queue task and push a single inverse (for example `chapter.delete` with delete-blocks), so one `⌘Z` removes the new chapter and its block. Fallback if the one-entry path would risk undo identity: two presses (block first, then chapter), with no stuck entry and no repeated error toast. Document the chosen semantics in the report.
4. **Tests:**
   - core unit: create a top-level block in an empty chapter, apply its inverse, assert the chapter is empty but valid, and redo restores the exact block ID;
   - app-level: New chapter → `⌘Z` (one or two presses per chosen semantics) restores chapter/block counts and leaves older history reachable; no repeated "Cannot delete the last top-level block" toast, `canUndoStructural` does not stay stuck on a failing entry;
   - extend the existing undo-routing e2e rather than adding a new app launch, keeping the critical suite under budget.

**Redo note:** chapter-create/delete redo is a pre-existing gap (`captureStructuralDelta` cannot add/remove chapters). If the chosen N1 path loses redo for the new chapter, record it as an explicit follow-up; do not fake it.

## N2 — Close/quit blocked forever by non-document failures

**Evidence:** `apps/desktop/src/renderer/src/App.tsx:63-88`; `apps/desktop/src/main/index.ts:148-217`.

Required:

1. **Read-only runtimes:** skip them in the flush only when they have no unsaved changes (read-only blocks editing, so a clean read-only document cannot lose data). A read-only runtime that is dirty stays a blocking problem with its reason.
2. **Session state:** a `saveSession` failure (tabs/scroll/active tab) must not block close/quit. Log it and proceed. Session state is not document data; losing it is recoverable. Do not show the "Changes not saved" dialog for it and do not misreport it as document changes.
3. **Real document save failures stay blocking** with Retry/Cancel. Do not add a "Quit anyway" that can discard document changes.
4. **Tests:**
   - unit-test the pure flush aggregation (extract a helper if useful): clean read-only → no problem; dirty read-only → problem; commit throw / save error → problem; session rejection → non-blocking;
   - app-level recovery test: stale-lock read-only document, quit/close, process exits without a native dialog and without writing the package. If an unwritable-session e2e would be flaky, unit-test the non-blocking path and record the manual repro; do not add `chmod` timing tests to the critical suite.

## N3/N5/N6 — Docs and nits

- `README.md`: destructive delete/detach inverses are now undoable (remove the "phase 3b gaps" sentence); Spike 1 is complete, not "the current spike brief"; keep M2f report links current.
- `docs/definition-of-done.md`: state the e2e budget precisely — **`npm run e2e` critical suite (node --test suite time) < 60 s, excluding build** — and use the re-review numbers (23 tests, 54.3–56.4 s suite; `npm run e2e` wall ~64 s with build). No "currently ~18 s".
- `apps/desktop/src/main/library.ts:440-448`: remove the no-op `const current = snapshot(...)` and the empty spread.
- Record KaTeX 0.18.11's npm deprecation ("accidentally published with breaking changes; use 0.19.0"; 0.19 is outside TipTap's current peer range) in `docs/reports/m2f-phase5b-cleanup.md` known gaps; revisit when the peer range widens.

## Tests and gates

- `npm run typecheck`, `npm test`, `npm run e2e`, `npm run test:recovery`, `npm run test:ui`, `npm run verify` all pass.
- Critical e2e stays **< 60 s suite time**; new integration coverage goes to recovery/UI or extends an existing critical test by < 2 s. Record standalone and in-verify durations.
- No new native dialogs, no fixed sleeps, no skipped/weakened tests, no deleted data-safety coverage.
- Report `docs/reports/m2f-phase5c-review-fixes.md`: N1 semantics, N2 behavior, tests, real timings, residual risks (chapter redo, session failure logging).

## Acceptance

N1 no longer rejects or poisons undo; N2 no longer blocks close/quit for read-only-clean or session-only failures while real document failures still block; docs/nits fixed; all gates pass; critical e2e suite < 60 s. No M3/PDF/page work.
