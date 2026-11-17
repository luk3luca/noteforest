# M2f phase 5c — Sentinel re-review fixes (N1/N2, docs, nits)

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m2f-phase5c-review-fixes`  
**Base:** `e087953` (`main`: docs: start M2f phase 5c re-review fixes)  
**Scope:** N1/N2 S2 regressions plus N3/N5/N6 docs and cleanup. No M3, page view, PDF, or new
product behavior.

## Verdict

N1 and N2 are closed at the command, runtime, app, and test levels. A failed structural undo/redo no
longer pins the stack; New chapter undoes as one user action; a clean read-only document and a
session-state write failure no longer block close/quit, while real document save failures still do.
All gates pass: typecheck, 252/252 unit tests, 20/20 critical e2e, 14/14 recovery, 5/5 UI
(view shell 1 + shell/session/a11y/layout 4), `npm run verify` exit 0. Critical e2e suite time is
**52.31 s standalone / 53.76 s in `verify`** (budget < 60 s, excluding build). Three shell/layout/
a11y tests moved from the critical suite to `tests/ui/m2-shell.test.mjs` with every assertion kept,
and E2E windows now run hidden so a test run never steals OS focus.

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
| `tests/e2e/m2-editor.test.mjs` (undo-routing extended) | New chapter → one `⌘Z` restores chapter/block counts exactly, no empty-chapter toast, `canUndoStructural` still true, and the next `⌘Z` reaches the older block creation. No new app launch. The suite is 20 tests after the UI split. |
| `tests/recovery/m2f-recovery.test.mjs` | Stale-lock read-only document → `app.quit()` exits within 5 s, package bytes unchanged, stale lock token unchanged. Recovery is now 14 tests. |

No fixed sleeps, no skipped/weakened tests, no native dialogs, no new dependencies.

## 5. Gates and real timings

Measured in this worktree on 5 November 2026, Node 22.23.1 / npm 10.9.8 / Electron 45.2.1.
E2E windows were hidden (`NOTEFOREST_E2E_HIDDEN=1`); the visual suite opted into a visible window.

| Command | Result | Suite/test time | Wall |
|---|---|---:|---:|
| `npm run typecheck` | clean (desktop node/web, core, layout, pdf) | — | 3.65 s |
| `npm test` | **252/252**, 29 files | **1.91 s** (Vitest) | 2.4 s |
| `npm run e2e` (standalone) | **20/20** | **52.31 s** suite; 60.60 s node incl. hooks | **61 s** incl. build |
| `npm run e2e` (inside `verify`) | **20/20** | **53.76 s** suite | — |
| `npm run test:recovery` | **14/14** | 22.22 s node | 23.6 s incl. build |
| `npm run test:ui` (view) | **1/1** | 9.58 s node | 9.7 s |
| `npm run test:ui` (shell/session/a11y/layout) | **4/4** | 13.27 s node | 13.3 s |
| `npm run verify` | **exit 0** | e2e 53.76 s, recovery 22.22 s, UI 9.58 + 13.27 s | ~99 s |
| `npm run test:perf` (on demand) | **1/1** | 18.36 s node | 26.54 s incl. build |
| `npm run test:visual` (on demand) | **5/5** | 24.20 s node | 24.2 s |

The undo-routing e2e is ~9.9 s; the new recovery quit test is ~0.6 s. The critical suite remains
under the 60 s suite-time budget in both standalone and `verify` runs.

### Orchestrator addendum — test split and hidden E2E windows

- Moved `restores per-tab scroll and focus after relaunch`, `opens the command palette, tree, and
  dialogs accessibly`, and `places children parent-relative and scrolls horizontally for deep
  branches` to `tests/ui/m2-shell.test.mjs` unchanged. Critical e2e went from 23 to 20 tests and
  from 60.2 s back to 52.3 s suite time; coverage stays in `verify`, not `verify:fast`.
- Added hidden E2E mode. `NOTEFOREST_E2E_HIDDEN=1` (default for Playwright) creates the window with
  `show: false`, skips `ready-to-show → show`, hides the macOS dock icon, and the harness skips
  `page.bringToFront()`. The visual suite passes `NOTEFOREST_E2E_HIDDEN=0`; screenshots still need a
  visible surface. A UI test asserts `BrowserWindow.isVisible() === false`.
- Why: a manual run had keyboard focus stolen by the visible test window and text typed into the
  first block, which blocked the lifecycle e2e and inflated it to 21.8 s (suite 70.1 s inside
  `verify`). Hidden mode removes that class of interference; the same suite then measured 52.3 s.

### Sentinel re-review (5 November 2026)

Verdict: **accept with minor**, no open S1/S2. Report: `docs/reviews/m2f-phase5c-review.md`.

- N1, N2, N3, N5, N6 closed with app-level repros.
- S3-1 stale DoD/review-checklist phase headers fixed in the review commit.
- S3-2 first cold-cache e2e run measured 62.8 s suite time; three warm runs 52.18–53.44 s and
  `verify` 52.49 s. Warm budget is met; the cold outlier is recorded for the CI policy decision.
- S4 nits: perf baseline comparability, parent `NOTEFOREST_E2E_HIDDEN=0`, `isVisible` scope, and
  future `allowEmptyChapter` API stripping.
- Perf baseline: after the review, the perf suite ran hidden at 1,017 ms initial / 2,465 ms
  1,000-block, and once visible at 1,019 ms / 2,465 ms. Hidden and visible are comparable, so perf
  stays hidden and the visible exception remains visual-only.
- The harness now honours `NOTEFOREST_E2E_HIDDEN=0` from the parent environment. `isVisible` remains
  the hidden-mode assertion; OS focus and dock visibility are covered by the implementation, not a
  brittle focus assertion.
- Chapter redo and `allowEmptyChapter` API stripping remain recorded follow-ups, not M2 blockers.

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
- **E2E budget margin.** The final hidden-window suite measured 52.3–53.8 s, with 6–7 s of margin.
  The harness previously measured 54.3–56.4 s and one contaminated 70 s run caused by typing into
  the visible test window; hidden mode prevents that interference. Keep the critical suite from
  growing further.
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
- `apps/desktop/src/main/index.ts` (hidden E2E window)
- `apps/desktop/test/undo-stack.test.ts` (new)
- `apps/desktop/test/flush.test.ts` (new)
- `tests/e2e/m2-editor.test.mjs`
- `tests/recovery/m2f-recovery.test.mjs`
- `tests/ui/m2-shell.test.mjs` (new; session/a11y/layout split)
- `tests/support/harness.mjs` (hidden launch, no `bringToFront`)
- `tests/visual/m2-screenshots.test.mjs` (visible-window opt-in)
- `package.json` (`test:ui`/`verify` run both UI files)
- `README.md`
- `docs/definition-of-done.md`
- `docs/reports/m2f-phase5b-cleanup.md`
- `docs/reports/m2f-phase5c-review-fixes.md` (this report)

## Next step

Sentinel re-review is complete (accept with minor). Next: the product-owner visual/VoiceOver pass
and M2 acceptance; then M3. M3 and PDF/page remain blocked until M2 is accepted.
