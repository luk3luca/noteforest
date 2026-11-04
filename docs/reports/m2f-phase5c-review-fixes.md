# M2f phase 5c — Sentinel re-review fixes (N1/N2, docs, nits)

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-7192878c`  
**Branch:** `t3/m2f-phase5c-review-fixes`  
**Base:** `e087953` (`main`: docs: start M2f phase 5c re-review fixes)  
**Scope:** N1/N2 S2 regressions plus N3/N5/N6 docs and cleanup. No M3, page view, PDF, or new
product behavior.

## Verdict

N1 and N2 are closed at the command, runtime, app, and test levels. A failed structural undo/redo no
longer pins the stack; New chapter undoes as one user action; a clean read-only document and a
session-state write failure no longer block close/quit, while real document save failures still do.
All gates pass: typecheck, 252/252 unit tests, 23/23 critical e2e, 14/14 recovery, 1/1 view UI,
`npm run verify` exit 0. Critical e2e suite time is **50.66 s standalone / 50.95 s in `verify`**
(budget < 60 s, excluding build).

## 1. N1 — undo of a new chapter's first block

### Core

- `BlockDeleteCommand` gained an explicit, documented `allowEmptyChapter?: boolean`.
- `block.create` returns `{ type: 'block.delete', blockId, children: 'delete-subtree',
  allowEmptyChapter: true }`. The flag is validated (`boolean` only) and is set **only** by the
  command layer when it builds that inverse.
- `block.delete` skips the F6 last-root rejection only when `allowEmptyChapter === true`. Every
  user-facing delete (menu, keyboard, external command) still gets
  `chapter-would-be-empty`, and the existing rejection tests are unchanged.
- Undoing a creation therefore restores the exact pre-create state, including an empty chapter.
  The delete's exact-record inverse keeps `redoCommand` with the flag, so redo restores the same
  block ID.

### Runtime

- `undoStructural`/`redoStructural` no longer push a rejected command back on top of the stack.
  The entry is dropped, the error is returned (and toasted by `report`), `notify()` updates
  `canUndoStructural`/`canRedoStructural`, and the next press reaches older history. Nothing is
  discarded silently: the rejection message is the user-visible report.
- New `DocumentRuntime.createChapterWithFirstBlock(title, atIndex)` runs `chapter.create` and the
  first `block.create` inside one serial-queue task and accepts a **single** inverse:
  `chapter.delete` with `blockHandling: { kind: 'delete-blocks' }`.
  - If the chapter is created but its first block fails, the chapter is still accepted with its own
    `chapter.delete` inverse, so it cannot become un-undoable.
  - If the created block ID is missing, the combined inverse is still accepted; the action reports
    the missing ID.

### App semantics (chosen)

`⌘⇧N` / the sidebar and canvas "add chapter" actions call `createChapterWithFirstBlock`, so **one
`⌘Z` removes the new chapter and its first block**. This is the preferred path from the brief, not
the two-press fallback. `chapter.delete` still has no structural inverse, so the new chapter is not
redoable; the e2e asserts `canRedoStructural === false` after the undo. This is recorded as a
follow-up, not faked.

## 2. N2 — close/quit blocked by non-document failures

The flush aggregation moved to `apps/desktop/src/renderer/src/lib/flush.ts` (`flushDocuments`), a
pure helper over runtime-like records:

- **Clean read-only document:** skipped entirely; read-only blocks editing, so it cannot have
  unsaved document data. Session state is still saved.
- **Dirty read-only document:** blocking problem naming the title, the read-only reason, and
  "unsaved changes".
- **Editable document:** `commitPending()` is awaited; a throw or a `saveState === 'error'` is a
  blocking problem with the title and reason.
- **Session state (`session:save`):** a rejection is logged
  (`[noteforest] could not save session state; continuing with close/quit`) and the flush returns
  `ok`. No "Changes not saved" dialog, no misreport as document changes, no "Quit anyway" that could
  discard documents.
- Real document failures still return `status: 'error'`, so the main process keeps the existing
  Retry/Cancel dialog.

Manual repro (not added to the suite, per the brief): launch with an isolated app-support directory,
`chmod 0555` it, then `app.quit()`. Result: process exits with code 0, the renderer logs the session
`EACCES` warning, and no page error is raised; no Retry/Cancel dialog blocks the quit. The previous
build stayed alive with the Retry/Cancel dialog.

## 3. N3/N5/N6 docs and nits

- `README.md`: destructive delete/subtree-delete/detach inverses are documented as exact and
  undoable; Spike 1 is the completed/historical brief; M2f status, re-review, phase 5c brief, and
  phase 5c report links are current.
- `docs/definition-of-done.md`: budget is now precise — critical-suite `node --test` time < 60 s
  excluding build; 23 tests, 54.3–56.4 s suite, ~64 s `npm run e2e` wall with build; no "~18 s".
- `apps/desktop/src/main/library.ts`: removed the no-op `const current = snapshot(...)` and empty
  spread in `applyCommand`.
- `docs/reports/m2f-phase5b-cleanup.md`: recorded the KaTeX 0.18.11 npm deprecation
  ("accidentally published with breaking changes; use 0.19.0") and that 0.19 is outside TipTap's
  current peer range.

## 4. Tests added or extended

| Suite | Change |
|---|---|
| `packages/core/test/empty-chapters.test.ts` | Create a top-level block in an empty chapter, apply the inverse, assert empty-but-valid and exact redo ID; assert the user delete still rejects and a non-boolean `allowEmptyChapter` is rejected. |
| `apps/desktop/test/undo-stack.test.ts` (new) | Chapter + first block is one undo entry and one `chapter.delete`; a failed undo is dropped while the older entry applies; a failed redo is dropped while the older independent redo applies. |
| `apps/desktop/test/flush.test.ts` (new) | Clean read-only → ok; dirty read-only → problem; commit throw → problem; failed-save state → problem; session reject → ok + warning; multiple problems aggregate. |
| `tests/e2e/m2-editor.test.mjs` (undo-routing extended) | New chapter → one `⌘Z` restores chapter/block counts exactly, no empty-chapter toast, `canUndoStructural` still true, and the next `⌘Z` reaches the older block creation. No new app launch; still 23 critical tests. |
| `tests/recovery/m2f-recovery.test.mjs` | Stale-lock read-only document → `app.quit()` exits within 5 s, package bytes unchanged, stale lock token unchanged. Recovery is now 14 tests. |

No fixed sleeps, no skipped/weakened tests, no native dialogs, no new dependencies.

## 5. Gates and real timings

Measured in this worktree on 4 November 2026, Node 22.23.1 / npm 10.9.8 / Electron 45.2.1.

| Command | Result | Suite/test time | Wall |
|---|---|---:|---:|
| `npm run typecheck` | clean (desktop node/web, core, layout, pdf) | — | **3.65 s** |
| `npm test` | **252/252**, 29 files | **1.84 s** (Vitest) | 2.07 s |
| `npm run e2e` (standalone) | **23/23** | **50.66 s** suite; 58.70 s node incl. hooks | **59.67 s** incl. build |
| `npm run e2e` (inside `verify`) | **23/23** | **50.95 s** suite; 58.97 s node | — |
| `npm run test:recovery` | **14/14** | 19.54 s node (files 9.87 / 5.29 / 6.52 s) | 20.37 s incl. build |
| `npm run test:ui` | **1/1** | 1.35 s suite | 10.10 s incl. build |
| `npm run verify` | **exit 0** | e2e 50.95 s, recovery 19.65 s, UI 1.28 s | **94.52 s** |

The undo-routing e2e is 9.06 s in `verify` (7.14 s at re-review); the new recovery quit test is
0.61 s. The critical suite remains under the 60 s suite-time budget in both standalone and `verify`
runs.

## 6. Residual risks and follow-ups

- **Chapter redo is lost.** `chapter.delete` has no structural inverse and `captureStructuralDelta`
  cannot add/remove chapter records, so undoing a New chapter action is one-way. Follow-up: extend
  the restore command to add/remove chapters (and keep `chapter.create`/`chapter.delete` exact).
  The app does not fake a partial redo.
- **`chapter.delete` generally remains non-redoable.** This is the pre-existing 3b2 gap; N1 does not
  widen it.
- **Session failure is logged only.** The user is not told that tab/scroll state will not be
  restored; losing it is recoverable and must never block document close. If a user-visible notice
  is wanted, it belongs in a later UX pass.
- **`allowEmptyChapter` is an internal command flag.** It is type-validated, but a future External
  Agent API must reject or strip it from client commands; only `block.create`'s inverse may set it.
- **E2E budget margin.** The suite measured 50.66–50.95 s here, but the same harness previously
  measured 54.3–56.4 s and one 66.6 s standalone. Keep the critical suite from growing further.
- **Session-failure repro uses directory permissions (`EACCES`)**, not a full disk; the failure path
  is the same, but a real disk-full condition was not exercised.
- **Native unsaved prompt in production** remains bypassed in E2E by `isE2E → saveAllDirty`; the
  flush-failure Retry/Cancel path is tested. Pre-existing, not changed by 5c.

## 7. Files changed

- `packages/core/src/commands.ts`
- `packages/core/test/empty-chapters.test.ts`
- `apps/desktop/src/renderer/src/state/runtime.ts`
- `apps/desktop/src/renderer/src/actions.ts`
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/lib/flush.ts` (new)
- `apps/desktop/src/main/library.ts`
- `apps/desktop/test/undo-stack.test.ts` (new)
- `apps/desktop/test/flush.test.ts` (new)
- `tests/e2e/m2-editor.test.mjs`
- `tests/recovery/m2f-recovery.test.mjs`
- `README.md`
- `docs/definition-of-done.md`
- `docs/reports/m2f-phase5b-cleanup.md`
- `docs/reports/m2f-phase5c-review-fixes.md` (this report)

## Next step

Sentinel re-review of phase 5c against `docs/reviews/m2f-review.md` N1–N6, then the product-owner
visual/VoiceOver pass and M2 acceptance. M3 and PDF/page remain blocked until M2 is accepted.
