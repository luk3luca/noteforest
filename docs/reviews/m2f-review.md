# M2f re-review — stability fixes

- **Reviewer:** Sentinel (independent re-review)
- **Date:** 4 November 2026
- **Worktree:** `a builder worktree`
- **Branch:** `t3/m2f-sentinel-review`
- **Base:** `81cdb12` (`main`: docs: finalize M2f status and lockfile)
- **Scope:** F1–F8 from `docs/reviews/m2-review.md`, the F12/F13/F15/F19 cleanup, test hygiene, and regressions introduced by M2f. No product code, tests, spec, UX, ADR, or plan changes.
- **Environment:** macOS, Node 22.23.1, npm 10.9.8, Electron 45.2.1, Playwright 1.64.1, display scale forced to 1 by the E2E harness.

## Verdict

**Request changes.** The Builder's headline claims are reproducible: typecheck is clean, 241 unit tests pass in 1.84 s, 23 critical e2e tests pass, 13 recovery tests pass, 1 view-UI test passes, and `npm run verify` exits 0. F1, F3, F5, F6, F7, and F8 are closed, and F12/F15/F19 are materially complete.

Two integration regressions are not covered by the suite and must be fixed before M2 acceptance:

1. **N1 (S2):** undoing the first block of a new chapter is rejected by the new empty-chapter invariant. The failing inverse stays on the structural stack, so repeated `⌘Z` retries the same error and older undo entries become unreachable until reload. This is a normal “New chapter → Undo” flow.
2. **N2 (S2):** close/quit can be permanently blocked by non-document flush problems: a read-only document or an unwritable session file makes the native dialog offer Retry/Cancel, but Retry can never succeed. With an unwritable session file there is no in-app escape (even closing every tab retries the session write); only Force Quit or fixing the directory works.

N2 is documented as a known gap in the phase 2a/2b1 reports; N1 is not documented anywhere. Neither was waived by the task brief or the product owner, and neither has a test. They are S2 by the checklist’s “core flow inaccessible / misleading save state” rule. F2 and F4 are therefore **partial**, not closed.

## Per-finding status

| ID | Status | Evidence (file:line) | Proof / test | Notes |
|---|---|---|---|---|
| **F1** quit after last window | **Closed** | `apps/desktop/src/main/lifecycle.ts:13-17`; `apps/desktop/src/main/index.ts:219-249,435-445` | Independent Playwright repro: close the only window (0 windows observed), then `app.quit()` → process exits in **31 ms**, code 0. E2E `quits after the last window is closed` (`tests/e2e/m2-editor.test.mjs:2305-2329`); 11 lifecycle unit cases. | The old `allowClose` trap is gone; a new window re-arms the guard. |
| **F2** one undo stack | **Partial** | `lib/history-routing.ts:42-54`; `actions.ts:343-391`; `state/runtime.ts:1558-1616`; `App.tsx:170-178`; `packages/core/src/commands.ts:1098,1136-1145,1638-1654` | E2E undo-routing flow (7.14 s) covers text/structural fallback, exact delete/subtree/detach restore, move and branch-create identity, and rapid repeated `⌘Z`/redo. Independent core repro confirmed identical branch IDs/chapter slots for move, attach, delete, detach. | Delete/subtree/detach/move identity is closed. **N1** breaks undo for the first block of a new/empty chapter and leaves the stack stuck. `chapter.delete` remains without an inverse (pre-existing, outside the stated F2 list; residual risk). |
| **F3** corrupt/missing/newer | **Closed** | `main/library.ts:130-204,253-316`; `main/recovery-view.ts`; `shell/RecoverySurface.tsx` | Recovery suite 10/10: truncated JSON, newer schema, missing session tab, backup restore as new copy, empty states, valid documents beside a damaged one. Tests assert the original bytes are unchanged and no editable runtime is created (`tests/recovery/m2f-recovery.test.mjs:163-349`). | Library rows show status/reason/title fallback; recovery tab is read-only; restore is always a new copy. |
| **F4** flush/close/recovery | **Partial** | `shared/api.ts:307-312`; `main/index.ts:100-146,148-217`; `preload/index.ts:63-82`; `App.tsx:63-88`; `runtime.ts:463-483`; `lib/save-failure.ts` | E2E close/quit normal saves, flush timeout, flush error + Cancel, permission failure + backoff + Retry, save copy, reload, external modification reload/overwrite/copy, failed-save quit guard, failed close. | Typed results, error propagation, retry/cancel, and save recovery are closed. **N2**: read-only documents and session-write failures block close/quit forever with a “could not save your changes” dialog. |
| **F5** keyboard trap | **Closed** | `editor/keymap.ts:122-148`; `editor/views/BlockViews.tsx:258-329`; `shell/StatusBar.tsx:66-68`; `shell/TabBar.tsx:48,165`; `App.tsx:203-207` | E2E keyboard test (`m2-editor.test.mjs:993-1197`): Tab exits the contenteditable body to the chapter/card controls; Shift+Tab returns; focus ring; collapse/add-child/block-actions activation; context-menu trap/arrow/Escape/restore; save-state live region; `Ctrl+Tab`/`Ctrl+Shift+Tab`; announced close button. Axe serious/critical remains 0. | Manual VoiceOver pass is still the product owner's gate. |
| **F6** empty chapters | **Closed** (implementation) | `packages/core/src/commands.ts:1132-1145`; `editor/extensions.ts:26-28`; `lib/adapter.ts`; `state/runtime.ts:286-302` | Core `empty-chapters.test.ts` (8 cases), adapter/empty-chapter unit tests, recovery app tests for legacy empty chapter after reload and move/branch/delete rejection. | The invariant itself works. The interaction with undo is **N1**; the F6 fix did not account for `block.create`'s inverse. |
| **F7** stale locks | **Closed** | `main/library.ts:327-397`; `packages/core/src/node/lock.ts:275-303` | Recovery test opens stale lock read-only, asserts token unchanged after Cancel, then takes over explicitly; live-lock refusal unit test. | No auto-break remains in `openStore`. |
| **F8** e2e budget | **Closed with risk** | `package.json`; `tests/support/harness.mjs`; `tests/recovery/m2f-backup-restore.test.mjs` | 23/23 critical, **54.29 s** suite standalone / **56.43 s** in `verify`; zero `waitForTimeout` in the critical suite. The three moved backup tests keep identical assertion counts (26/6/9) and run in `verify`. | The Builder's 48.7 s figure was **not reproduced**; margin in `verify` is 3.6 s. If “budget” means command wall time, `npm run e2e` is 63.8 s including build and misses 60 s. |
| **F12** dead code/duplication | **Partial (S4)** | `apps/desktop/src/main/library.ts:440-448`; absent `packages/pdf/src/atomicFile.ts`, `packages/core/src/history.ts`; `lib/tree.ts:1-35` | Repository search over app/packages/tests finds no remaining `useContentReady`, `EDGE_CONSTANTS`, `recordActiveScroll`, `applyDocumentCommand`, `openBlockActions`, `ConfirmChoice`, `onRequestFocusBlock`, `selectedBlockByDoc`, or shell `removeTab`. Tree selectors import core helpers. `npm ls` shows one KaTeX and one pdfjs. | The reviewed no-op `const current = snapshot(...)` + `...(current === null ? {} : {})` remains in `applyCommand` (same item as the F12 list). No behavior impact. |
| **F13** docs | **Partial (S3)** | `README.md:44-45,78`; `docs/definition-of-done.md:385` | Manual read against M2e/M2f and spec v0.4.4. | README still says destructive delete/detach inverses are “phase 3b gaps” and not undoable; DoD says the critical suite is “currently ~18 s”; README calls the completed Spike 1 brief “current”. See N3. |
| **F15** dependencies | **Closed with risk** | `package.json`; workspace `package.json`s; `npm ls` | The six unused direct deps and `@types/katex` are gone; one KaTeX 0.18.11 copy; one pdfjs 6.5.438 copy; `engines.node >=22`. `npm audit --omit=dev` reports 0 vulnerabilities. | KaTeX 0.18.11 is the version npm deprecates (“accidentally published with breaking changes; use 0.19.0”); see N6. |
| **F19** build/quality gates | **Closed (accepted gaps)** | `docs/reports/m2f-phase5b-cleanup.md:163-172`; build output | Build emits 3,561,774 B JS and the known `MODULE_LEVEL_DIRECTIVE` warnings from bundled deps; lowlight `common` bundle cost, no lint/CI recorded as accepted gaps. | No silent drop; the residual warnings are visible in every build. |

## New findings

### N1 — S2 — Undo of a new chapter’s first block is rejected and poisons the structural stack

**Location:** `packages/core/src/commands.ts:1098` (block.create inverse), `:1136-1145` (F6 delete rejection); `apps/desktop/src/renderer/src/actions.ts:119-151` (New chapter creates chapter + first block); `apps/desktop/src/renderer/src/state/runtime.ts:1558-1567` (failed inverse is pushed back).

**Reproduction (app-level, independent):**

```text
before new chapter:      chapters 1, blocks 7, canUndoStructural false
after ⌘⇧N:               chapters 2, blocks 8, canUndoStructural true
after ⌘Z #1:             chapters 2, blocks 8, canUndoStructural true
                         toast: Cannot delete the last top-level block of chapter "New chapter".
                                Add another top-level block or delete the chapter instead.
after ⌘Z #2:             identical; the same toast; nothing undone
```

**Expected:** `⌘Z` removes the newly created block/chapter (ideally the whole “New chapter” action as one undo entry per spec §5.1), or at least advances the stack so older changes are reachable.

**Actual:** `block.create` returns `{ type: 'block.delete', children: 'delete-subtree' }`; F6 rejects that delete because the new chapter has one top-level block. `undoStructural` pushes the inverse back and returns an error, so every later `⌘Z` retries the same failing entry. Older undo history is unreachable until reload.

**Scope:** the first block created in any empty chapter (new chapter and legacy empty-chapter repair). The app-level repro above is the normal UI path; core-level `applyInverse` returns `chapter-would-be-empty`.

**Direction (not a patch):** make the inverse of `block.create` exempt from the F6 last-root rule, or represent it as a snapshot/restore that can remove the block and, when appropriate, its chapter; and test “create chapter → undo” at the app level. Consider grouping `chapter.create` + first `block.create` into one undo entry.

**Tests missing:** no test creates a chapter and undoes it; `empty-chapters.test.ts` tests only the forward rejections, and the undo-routing e2e starts from a seeded one-chapter document and creates a child (not a top-level block).

### N2 — S2 — Close/quit is permanently blocked by session-write failures and read-only documents

**Location:** `apps/desktop/src/renderer/src/App.tsx:63-88`; `apps/desktop/src/main/index.ts:148-217,133-146`.

**Reproduction A (read-only document):** open a package with a stale lock (the recovery suite’s fixture), confirm the runtime is `read-only`/`stale-lock`, then call `app.quit()`:

```text
quit outcome: still-running after 4005 ms; windows: 1
dialog: title "Changes not saved", message "NoteForest could not save your changes before quitting."
        detail "Linear algebra — eigenvalues: open read-only (stale-lock) ..."
        buttons [Retry, Cancel]
```

**Reproduction B (session write failure):** launch with no documents and no unsaved changes, `chmod 0555` the app-support directory, then close the window:

```text
close outcome: window-still-open after 4008 ms; windows: 1
dialog: "Changes not saved ... Session state: Error invoking remote method 'session:save':
        Error: EACCES: permission denied, open '.../.shell-session.json...tmp' ..."
        buttons [Retry, Cancel]
```

**Expected:** a read-only document with no unsaved content should not block close/quit; a session-state write failure (tabs/scroll) should not block document close, or the dialog should offer a “close without saving session” action. A user must not need Force Quit to close a saved document.

**Actual:** `flushOpenDocuments` pushes every read-only runtime into `problems`, and unconditionally returns `error` if `saveSession` rejects. `attemptClose` blocks on any non-ok result and offers only Retry/Cancel. Retry repeats the same condition. With the session failure there is no in-app escape at all, because `saveSession` is called even when there are zero documents/tabs. The message also misstates the failure as unsaved document changes.

**Tests missing:** no e2e closes/quits with a read-only runtime or an unwritable app-support directory. The close/quit tests use editable documents and writable support.

**Direction:** make the flush result distinguish document-save failures from non-document state (session), skip read-only runtimes that cannot have unsaved content, and provide an explicit safe path to close when only session state cannot be written.

## Test hygiene audit

- **No skipped/quarantined/weakened tests:** `grep` over `tests/` finds no `.skip`, `.todo`, `.only`, `test.skip`, `describe.skip`, or retry configuration. No `node --test` retry flag.
- **No fixed sleeps in gates:** `waitForTimeout` appears only in `tests/perf/m2-performance.test.mjs` (three deliberate sampling windows: 1,000 ms and 250/500 ms) and nowhere in `tests/e2e`, `tests/recovery`, `tests/ui`, or `tests/visual`. All critical waits are conditions (`waitForFunction`, locators, three-frame geometry stability).
- **No native dialog can block a test:** `apps/desktop/src/main/dialog-guard.ts` wraps `showMessageBox`, `showMessageBoxSync`, `showSaveDialog`, and `showOpenDialog` at startup when `NOTEFOREST_E2E=1`, records calls on `globalThis.__nfDialogCalls`, and returns Cancel/canceled immediately. The recovery suite asserts zero calls for its read-only flows; the failed-save quit test asserts the guard recorded the Retry/Cancel dialog and answered Cancel. No test can wait for a human click. Residual: there is no global teardown assertion that an *unexpected* dialog was recorded; a test that does not assert the guard could silently consume one. That is a test-infrastructure nit, not a blocker.
- **Moved coverage is intact:** the three backup tests have identical assertion counts before/after the move (26/6/9) and run under `npm run test:recovery`, which `verify` invokes. The critical suite drops them but does not drop the failed-save quit guard or the core save/undo tests.
- **No data-safety/validation/security/a11y deletion:** `storage.test.ts`, `commands.test.ts`, `serial-queue.test.ts`, `edge-routing.test.ts`, `placement.test.ts`, `adapter.test.ts`, `backspace.test.ts`, `layout.test.ts`, and `pagination.test.ts` remain (the layout/pagination files are byte-identical to the M2e baseline). The only removed tests are the two `DocumentHistory` tests, tied to the deliberately removed `history.ts`; their coverage is replaced by `destructive-undo.test.ts` and `move-undo.test.ts`. Axe still runs in the critical suite and fails serious/critical only; the best-practice report is recorded.

## Test inventory and real timings

### Inventory before → after

| Suite | Before (`4e54409`) | After (`81cdb12`) | What moved |
|---|---:|---:|---|
| Unit (`npm test`) | 144 tests / 14 files | **241 tests / 27 files** | +97 tests / +13 files: lifecycle, flush, save failure, copy, backup restore, recovery view/library, history routing, destructive undo, move undo, empty chapters, fixtures, dialog guard. |
| Critical e2e (`npm run e2e`) | 13 tests | **23 tests** | Added quit, close, flush timeout/error, save failure/copy/reload, external reload/overwrite/copy, guard, keyboard, undo-routing. Old #9/#11 merged into #2; #5/#10/#13 moved out. |
| Recovery (`npm run test:recovery`) | 0 | **13 tests** | 10 new corrupt/missing/newer/stale-lock/empty-chapter flows + 3 backup-restore tests moved from critical e2e (assertions intact). |
| View UI (`npm run test:ui`) | 0 | **1 test** | Old critical #10 (zoom/fit/focus) moved out. |
| Perf (`npm run test:perf`) | inside critical #5 | **1 test** | 300/1,000-block report; on demand. |
| Visual (`npm run test:visual`) | inside critical #13 | **5 tests** | Old #13 plus the screenshots removed from #4/#8/#10 and the new recovery/save-failure states. |

### Timings (this machine, this worktree)

| Command | Result | Test/suite time | Wall time |
|---|---|---:|---:|
| `npm run typecheck` | clean (desktop node/web, core, layout, pdf) | — | **4.3 s** |
| `npm test` | 241/241, 27 files | **1.84 s** (Vitest) | 3.05 s |
| `npm run e2e` (standalone) | 23/23 | **54.29 s** suite; 62.34 s node incl. hooks | **63.81 s** incl. build |
| `npm run e2e` (inside `verify`) | 23/23 | **56.43 s** suite | — |
| `npm run test:recovery` | 13/13 | **19.15 s** (backup 9.69 s, 4a 5.01 s, 4b 5.81 s) | 20.28 s |
| `npm run test:ui` | 1/1 | **1.19–1.69 s** | 9.2–10.7 s incl. build |
| `npm run test:perf` | 1/1 | 12.84 s | 21.45 s |
| `npm run test:visual` | 5/5 | 20.64 s | 21.39 s |
| `npm run verify` | pass (exit 0) | — | **91.17 s** |
| `npm audit --omit=dev` | 0 vulnerabilities | — | — |

Perf report: 300-block initial **583 ms**, 1,000-block initial **1,262 ms**, **799** visible cards after collapse, measure p95 **3.3 ms**. This is consistent with the M2 target and with the Builder's phase-1 numbers (300/1,000 within run variance).

## Docs consistency (F13)

Aligned: `AGENTS.md` phase line and repo layout; `docs/plan.md` M2f status; `docs/ux-shell.md` parent-relative placement; ADR-0004 body note (M2c/M2d/M2e/D23); M2d “superseded by M2e” banner; DoD/checklist spec v0.4.4 and the M2f re-review phase note; README commands now exist (`npm run dev` is defined and unsets `ELECTRON_RUN_AS_NODE`); Spike commands are `spike:*` and labelled Spike-only.

Remaining drift (S3):
- `README.md:44-45` still says destructive delete/detach inverses “remain phase 3b gaps and are not presented as undoable”. M2f 3b1/3b2 made them exact and undoable; this contradicts the current behavior and the critical test.
- `docs/definition-of-done.md:385` says the critical suite is “currently ~18 s of test time”; it is now 54–56 s (still under 60).
- `README.md:78` calls the completed Spike 1 brief “the current spike brief”.

## Residual risks

- **F2 chapter deletion:** `chapter.delete` still has no structural inverse (3b2 known gap, outside the stated F2 list). Undo after an explicit chapter delete falls through/fails; M3 should not assume every structural command is reversible.
- **Multi-step “New chapter”:** even after N1 is fixed, `createChapter` is two structural stack entries, not one; spec §5.1 prefers one undo entry for a multi-step user action. Grouping is a follow-up.
- **E2E budget:** 54.3–56.4 s is under 60 s, but the same harness has measured 58.7–59.1 s (phase 5a) and one 66.6 s standalone. The 48.7 s claim is optimistic; a slower machine will miss the budget. Keep the critical suite from growing further.
- **Native unsaved prompt:** the production Save/Don't Save/Cancel branch in `attemptClose` is bypassed in E2E by `isE2E` → `saveAllDirty`. The prompt code is inspected but not automated; the flush-failure Retry/Cancel dialog is tested.
- **KaTeX 0.18.11:** npm marks it deprecated (“accidentally published with breaking changes; use 0.19.0”); TipTap's peer range accepts only ^0.16/^0.17/^0.18. Math tests pass, but this should be revisited when the peer range widens; the warning is not recorded in the cleanup report.
- **Recovery scan breadth:** every direct non-hidden folder without `document.json` is listed as `missing`, including unrelated folders in the library; documented as a 4a gap, not a blocker.
- **F10 security notes remain out of scope:** `document:reveal` uses `path.resolve`, not `realpath`; production CSP/debug-hook gating is unchanged. Not part of M2f.
- **Read-only takeover + legacy repair:** after an explicit stale-lock takeover, `ensureChaptersHaveBlocks` is not re-run for legacy empty chapters; they render with the Add row, so no data loss, but the “repair every empty chapter” behavior is load-time only.

## What I did NOT verify

- Manual visual judgement, VoiceOver, keyboard-only human pass, and the product owner's M2e/M2f visual gate.
- The packaged/signed build; Windows/Linux; iPad/Pencil; real 1,000-block typing and memory measurement (the perf suite measures render, not typing).
- Page view, paginator/PDF visuals, `printToPDF`, and the Spike 1 gate re-run.
- The External Agent API/MCP (not implemented).
- The stale Spike harness (`spike:*` scripts) — static inspection only.
- A real disk-full condition; the session-failure repro used directory permissions (`EACCES`), which exercises the same failure path. The stale-lock repro used a real lock file and the real app.
- Full security penetration testing; F10 path/CSP/debug-hook items are code-review notes, not part of M2f.
- Any screen recording or Notability workflow (product-owner only).

## Commands run

```text
npm install                         # 199 packages, 0 vulnerabilities; lockfile unchanged
npm run typecheck                   # clean, 4.29 s
npm test / npx vitest run           # 241/241, 27 files, 1.84 s tests
npm run e2e                         # 23/23, 54.29 s suite / 63.81 s wall
npm run test:recovery               # 13/13, 19.15 s suite
npm run test:ui                     # 1/1, 1.19-1.69 s
npm run test:perf                   # 1/1, 12.84 s suite
npm run test:visual                 # 5/5, 20.64 s suite
npm run verify                      # exit 0, 91.17 s wall
npm audit --omit=dev                # 0 vulnerabilities
```

Independent repros (temporary scripts outside the repository; no product files changed):

- close last window → 0 windows → `app.quit()` → exit 31 ms, code 0 (F1).
- stale-lock read-only document → `app.quit()` → still running after 4 s, Retry/Cancel dialog (N2).
- app-support `chmod 0555`, no documents → close window → still open, session `EACCES` dialog (N2).
- New chapter → `⌘Z` twice → unchanged document, repeated empty-chapter toast, stack still non-empty (N1).
- core inverse repro for move/attach/delete/detach: same branch ID, source, order, and chapter slot; original block/branch/anchor records restored (F2).
- fixture parser: 10/10 fixtures validate; selector-bearing anchors present where anchors exist (F14).

## Remaining product-owner decisions

1. Whether N1/N2 are fixed before M2 acceptance or explicitly waived with a recorded risk and follow-up milestone. The Sentinel verdict is **request changes**.
2. Manual visual/VoiceOver/keyboard pass on the M2f build.
3. Whether the 60 s e2e budget is test time (currently met) or command wall time (currently ~64 s with build); the DoD should state which.
4. Whether `chapter.delete` and multi-step “New chapter” undo should be included in M2 or deferred to M3.
