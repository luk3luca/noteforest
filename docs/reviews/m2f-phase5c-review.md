# M2f phase 5c re-review — N1/N2 fixes and test-infrastructure changes

- **Reviewer:** Sentinel (independent re-review)
- **Date:** 5 November 2026
- **Worktree:** `a builder worktree`
- **Branch:** `t3/sentinel-review-m2f-phase5c`
- **Base:** `e5f37f9` (`main`: merge of M2f phase 5c)
- **Scope:** close N1/N2/N3/N5/N6 from `docs/reviews/m2f-review.md`; audit the phase 5c
  test split, hidden E2E mode, and critical-suite budget; check for regressions in undo identity,
  chapter creation, save/close, focus, session, and recovery. No product code, tests, spec, UX, ADR,
  or plan changes.
- **Environment:** Apple M5, 24 GB, macOS 26.5.2, Node 22.23.1, npm 10.9.8,
  Electron 45.2.1, Playwright 1.64.1. E2E display scale forced to 1; windows hidden by default.

## Verdict

**Accept with minor.** N1 and N2 are closed at the core, runtime, app, and test levels. N3, N5, and
N6 are closed. The test split preserves the moved coverage, hidden E2E mode is real and does not
mask geometry, axe, or screenshot evidence, and the critical suite is 20 tests. All gates pass:
typecheck clean, 252/252 unit tests, 20/20 critical e2e, 14/14 recovery, 5/5 UI, 5/5 visual,
1/1 perf, `npm run verify` exit 0.

Two S3 items remain, neither a product regression:

1. the DoD and review-checklist **phase headers** still described phase 5b as the current gate with
   N1/N2 open (fixed in this review's phase-note update);
2. the first cold-cache critical e2e run measured **62.83 s** suite time, over the 60 s budget;
   three subsequent runs measured 52.18–53.44 s and `verify` measured 52.49 s. The warm budget is
   met; cold-run margin is thin and should be watched.

No open S1/S2. Product-owner visual/VoiceOver acceptance is still pending.

## Per-finding status

| ID | Status | Evidence (file:line) | Proof / test | Notes |
|---|---|---|---|---|
| **N1** undo of a new chapter's first block | **Closed** | `packages/core/src/commands.ts:176-185` (typed flag), `:1105-1110` (create inverse sets it), `:1144-1167` (type validation; guard remains for user deletes); `apps/desktop/src/renderer/src/state/runtime.ts:762-803` (one queue task, one inverse), `:1611-1656` (failed undo/redo popped and not re-pushed); `apps/desktop/src/renderer/src/actions.ts:119-143` | Core: `packages/core/test/empty-chapters.test.ts:217-296`. Runtime: `apps/desktop/test/undo-stack.test.ts:79-212`. App: `tests/e2e/m2-editor.test.mjs:1682-1759` (one undo, exact canonical restore, no toast, older history reachable, no redo). Independent app repro: 1 chapter/8 blocks → New chapter 2/9 → one `⌘Z` 1/8, `canUndoStructural` true, `canRedoStructural` false, zero empty-chapter toasts → next `⌘Z` 1/7. Independent empty-chapter repro: add first block to an empty chapter → `⌘Z` leaves the empty chapter valid, `⌘R` restores the same block ID. | The inverse is generated only by `block.create`; no UI path sets `allowEmptyChapter`. Focus after undo is valid (editor focused, original block selected). |
| **N2** close/quit blocked by non-document failures | **Closed** | `apps/desktop/src/renderer/src/lib/flush.ts:34-63` (pure aggregation); `apps/desktop/src/renderer/src/App.tsx:57-62`; `apps/desktop/src/main/index.ts:135-218` (Retry/Cancel only for document failures) | Unit: `apps/desktop/test/flush.test.ts:16-127` (clean read-only skip, dirty read-only block, commit throw, save error, session reject warn+ok, aggregate). Recovery: `tests/recovery/m2f-recovery.test.mjs:513-545` (stale-lock read-only quit, no dialog, package bytes and lock token unchanged). E2E keeps the failed-save guard: `tests/e2e/m2-editor.test.mjs:2482-2519` and `:2521-2557`. Independent repro: read-only stale-lock doc → quit exits code 0 in **102 ms**, zero dialogs, document bytes unchanged. Unwritable support dir with no documents → quit exits code 0 in **3,066 ms**, zero dialogs, renderer logs `could not save session state … session:save … EACCES`. | Dirty read-only still blocks with title/reason/unsaved-changes. Real document failures still block. No "Quit anyway". Session state loss is logged only, as designed. |
| **N3** README/DoD consistency | **Closed** (specified items) | `README.md:44-45` (destructive/subtree/detach exact and undoable), `:81` (Spike 1 historical); `docs/definition-of-done.md:386-394` (budget is suite time <60 s excluding build; 20 tests; 52.3/53.8 s) | Manual read against the code and the phase 5c report; `grep` finds no "phase 3b gaps", "~18 s", or "current spike brief". | One leftover drift: the DoD/checklist **phase headers** still said phase 5b request changes with N1/N2 open. Fixed in this review's phase-note update; see S3-1. |
| **N5** `library.ts` no-op | **Closed** | `apps/desktop/src/main/library.ts:427-448` | `applyCommand` now returns the result directly; `grep` finds no remaining `current === null ? {}` no-op in that function. | No behavior change. |
| **N6** KaTeX deprecation | **Closed** | `docs/reports/m2f-phase5b-cleanup.md:170-173` | `npm install` prints the 0.18.11 deprecation; `npm ls katex` shows one 0.18.11 copy under `@tiptap/extension-mathematics` and one direct. | Recorded as a known gap; 0.19 is outside TipTap's current peer range. |

The original **F2** and **F4** partial findings are closed by N1 and N2; no other F2/F4 gap changed in
phase 5c.

## New findings

### S3-1 — DoD and review-checklist phase headers were stale

**Location:** `docs/definition-of-done.md:13-19`; `docs/review-checklist.md:8-10` (before this
review's edit).

**Expected:** after phase 5c, the current-gate note reflects “implemented, re-review pending” or the
review verdict, not “phase 5b request changes; open S2 N1/N2”.

**Actual:** both documents still said the phase 5b re-review was the current gate with N1/N2 open,
while `README.md`, `AGENTS.md`, and `docs/plan.md` correctly said phase 5c was implemented and
pending re-review.

**Direction:** update the two phase notes after the verdict. This is a documentation-only S3; it is
fixed in this review commit. No product behavior change.

### S3-2 — Cold-cache critical e2e run exceeds the 60 s suite budget

**Location:** `tests/e2e/m2-editor.test.mjs`; `package.json:20`; DoD `:391-394`.

**Reproduction:** first `npm run e2e` after `npm install`, with no other test process running:
20/20 pass, **62.83 s** suite time, 71.13 s node time, 73.08 s wall including build. Later runs:
**52.18 s** suite/61.70 s wall (`npm run e2e`), **53.44 s** suite/61.80 s wall (direct
`node --test`), and **52.49 s** suite in `npm run verify`. The builder's 52.31/53.76 s figures are
reproducible warm.

**Expected:** critical `node --test` suite time <60 s excluding build.

**Actual:** warm runs meet the budget with 6–8 s margin; the first cold run misses it by 2.8 s. The
likely cause is first-launch OS/Electron caches, not a phase 5c behavior change. The previous
re-review also observed 54.3–56.4 s and one 66.6 s run, so this is a known-thin margin rather than a
new regression.

**Direction:** treat the budget as warm-state for M2 acceptance or add a cold-run tolerance/warm-up
on CI; do not add more tests to the critical suite. The three moved tests are already out; keep it
that way.

### S4 observations (not blockers)

- **Hidden-mode perf numbers are not comparable to visible baselines.** The perf suite inherits the
  hidden default: 300-block initial render **1,017 ms** (threshold 1,500 ms), 1,000-block **2,347 ms**,
  799 visible cards after collapse, measure p95 5.5 ms. The previous re-review measured 583/1,262 ms
  with visible windows. Geometry, axe, and screenshots are unaffected (see below), but perf trends
  should name the hidden/visible mode.
- **The harness ignores a parent `NOTEFOREST_E2E_HIDDEN=0`.** `tests/support/harness.mjs:61-71`
  defaults `hidden` to true unless a suite passes an override; running `NOTEFOREST_E2E_HIDDEN=0
  npm run e2e` still launches hidden. The visual suite opts in explicitly
  (`tests/visual/m2-screenshots.test.mjs:20-23`), so the documented behavior is true for the suites,
  but the env var is not a general switch.
- **The hidden-window test asserts visibility, not focus or dock state.**
  `tests/ui/m2-shell.test.mjs:39-45` checks `BrowserWindow.isVisible() === false`; it does not assert
  `isFocused()` or dock visibility. The assertion is real and the window cannot take OS keyboard
  focus while hidden, but the test name is broader than the assertion.
- **`allowEmptyChapter` is still a public command field.** It is type-validated and the current UI
  never sets it, but a future External Agent API must strip or reject it from client commands; only
  `block.create`'s inverse may set it. This is recorded in the Builder report and remains a residual
  risk.

## Hidden E2E mode audit

- **Implementation:** `apps/desktop/src/main/index.ts:51` (`NOTEFOREST_E2E_HIDDEN` default,
  `!== '0'`), `:224` (`app.dock.hide()` on macOS), `:243-245` (skip `show()` when hidden); the
  window already uses `show: false` at `:234`. Harness: `tests/support/harness.mjs:61-71` sets the
  env and skips `page.bringToFront()`. Visual opts into a visible window at
  `tests/visual/m2-screenshots.test.mjs:20-23`.
- **Does hidden mode mask rendering/layout/axe failures?** No evidence of masking. The moved
  parent-relative layout test still runs hidden and asserts exact geometry (`x = 0, 176, 336, 496,
  656, 816, 976, 1136`, minimum widths, parent-right + 16), so the layout engine computes real
  boxes. The axe pass runs hidden and reports zero serious/critical violations. The visual suite
  runs visible and produced non-blank PNGs (e.g. `artifacts/m2e/shell-1440x900.png`, 104 KB, visually
  inspected); the critical/UI suites take no screenshots.
- **Is the `isVisible` assertion real?** Yes: it calls Electron's
  `BrowserWindow.getAllWindows()[0]?.isVisible()` and asserts `false`; it would fail if `show()` ran
  unconditionally. It does not prove the dock is hidden, but `app.dock.hide()` is a direct call.
- **Perf under hidden mode:** see S4 observation. The suite still passes its thresholds, but numbers
  are not directly comparable to the previous visible-window report.
- **No fixed sleeps added:** `waitForTimeout` remains only in the pre-existing perf sampling windows
  (`tests/perf/m2-performance.test.mjs`). The new recovery quit test uses `waitUntil` polling. No
  `.skip`, `.todo`, `.only`, retry configuration, or native-dialog wait path was added.

## Test-inventory deltas

| Suite | Before phase 5c | After phase 5c | Delta |
|---|---:|---:|---|
| Unit (`npm test`) | 241 tests / 27 files | **252 / 29** | +11 tests / +2 files: `undo-stack.test.ts` (3), `flush.test.ts` (6), `empty-chapters.test.ts` (+2) |
| Critical e2e (`npm run e2e`) | 23 | **20** | 3 tests moved to `tests/ui/m2-shell.test.mjs`; undo-routing extended in place by ~80 lines |
| Recovery (`npm run test:recovery`) | 13 | **14** | +1 stale-lock read-only quit flow |
| View/shell UI (`npm run test:ui`) | 1 | **5** | +4: hidden-window check, session restore, a11y/axe, parent-relative layout |
| Perf (`npm run test:perf`) | 1 | 1 | unchanged, on demand |
| Visual (`npm run test:visual`) | 5 | 5 | unchanged, on demand, visible window |

**Three moved tests, before/after comparison:** bodies are byte-identical (the layout test differs
only by the enclosing suite's closing brace). Assertion counts are unchanged:

| Moved test | Lines old → new | `assert.` old → new |
|---|---|---|
| restores per-tab scroll and focus after relaunch | 57 → 57 | 2 → 2 |
| opens the command palette, tree, and dialogs accessibly | 97 → 97 | 3 → 3 |
| places children parent-relative and scrolls horizontally | 105 → 106 | 18 → 18 |

`package.json:25` runs both UI files under `test:ui`; `:28` runs them again in `verify` (not
`verify:fast`). No critical coverage was deleted or weakened. The only critical-suite growth is the
N1 chapter-undo block inside the existing undo-routing test; it adds no app launch.

## Real timings (this worktree, this machine)

| Command | Result | Suite/test time | Wall |
|---|---|---:|---:|
| `npm run typecheck` | clean (desktop node/web, core, layout, pdf) | — | **7.39 s** |
| `npm test` | 252/252, 29 files | **2.30 s** (tests) | 3.83 s |
| `npm run e2e` — first cold run | 20/20 | **62.83 s** suite; 71.13 s node | 73.08 s incl. build |
| `npm run e2e` — warm run | 20/20 | **52.18 s** suite; 60.48 s node | 61.70 s incl. build |
| `node --test tests/e2e/m2-editor.test.mjs` — warm | 20/20 | **53.44 s** suite; 61.75 s node | 61.80 s (no build) |
| `npm run verify` | exit 0 | e2e **52.49 s** suite; recovery 21.67 s node; UI 9.77 + 12.90 s node | **115.25 s** |
| `npm run test:recovery` | 14/14 | **21.49 s** node | 23.01 s incl. build |
| `npm run test:ui` | 5/5 (view 1, shell 4) | **1.40 s** view + **4.71 s** shell; 22.59 s node | 23.80 s incl. build |
| `npm run test:perf` | 1/1 | **18.27 s** test; 26.48 s node | 27.98 s incl. build |
| `npm run test:visual` | 5/5 | **16.19 s** suite; 24.41 s node | 25.70 s incl. build |
| `npm audit --omit=dev` | 0 vulnerabilities | — | — |

Perf report (`artifacts/perf/performance.json`, hidden windows): 300-block initial **1,017 ms**,
1,000-block initial **2,347 ms**, **799** visible cards after collapse, 1,000-block measure p95
**5.5 ms**, edge p95 **3.3 ms**, scroll **98 fps**. The 1,500 ms initial-render assertion passes, but
the visible-baseline comparison is weaker than before (see S4).

## Commands run

```text
npm install
npm run typecheck
npm test
npm run e2e                      # first cold run, then warm runs
node --test tests/e2e/m2-editor.test.mjs
npm run test:recovery
npm run test:ui
npm run test:perf
npm run test:visual
npm run verify
npm audit --omit=dev
```

Independent app-level repros (temporary scripts outside the repository; no product files changed):

- **N1 New chapter:** `⌘⇧N` → one `⌘Z` restores the exact chapter/block counts, no empty-chapter
  toast, `canUndoStructural` true, `canRedoStructural` false; the next `⌘Z` reaches the older
  top-level block creation. Focus after undo is valid.
- **N1 empty legacy chapter:** add the first block to an empty chapter, `⌘Z` leaves the chapter empty
  but valid and does not toast, `⇧⌘Z` restores the same block ID.
- **N2 read-only:** stale-lock package opens `read-only` / `stale-lock`, `dirty === false`;
  `app.quit()` exits code 0 in 102 ms with zero dialogs and unchanged document bytes.
- **N2 session failure:** isolated support directory `chmod 0555`, no documents; `app.quit()` exits
  code 0 in 3,066 ms with zero dialogs; renderer logs the `session:save` `EACCES` warning.
- **Visible screenshots:** `npm run test:visual` runs with `NOTEFOREST_E2E_HIDDEN=0`; the shell PNG
  is non-blank and shows the real editor.

## Residual risks

- **Chapter redo is lost.** `chapter.delete` has no structural inverse; undoing a New chapter action
  is one-way. The app reports `canRedoStructural === false` instead of faking a partial redo. This is
  recorded as a follow-up in the Builder report and remains the main N1 semantic limitation.
- **`chapter.delete` generally remains non-redoable.** Pre-existing 3b2 gap; N1 does not widen it.
- **Session failure is logged only.** The user is not told tab/scroll state will not be restored;
  losing it is recoverable, and it must never block document close. A later UX pass may add a notice.
- **`allowEmptyChapter` is an internal flag in a public command type.** Future External Agent API
  work must reject or strip it from client commands.
- **Cold-run e2e margin.** Warm runs are 52.2–53.4 s; the first cold run was 62.8 s. Keep the
  critical suite from growing and consider a warm-up/tolerance in CI.
- **Hidden-mode perf comparability.** The perf suite inherits hidden windows; its numbers are not
  directly comparable to earlier visible-window baselines.
- **Native unsaved prompt in production** remains bypassed in E2E by `isE2E → saveAllDirty`; the
  flush-failure Retry/Cancel path is tested.
- **N2b used `EACCES`, not a full disk or a hanging session write.** A hang would still hit the
  main-process flush timeout; rejection is the tested and fixed path.

## What I did NOT verify

- Manual visual judgement, VoiceOver, and the product owner's keyboard-only/visual acceptance.
- The packaged/signed build; Windows/Linux; iPad/Pencil.
- Page view, paginator/PDF visuals, `printToPDF`, and the Spike 1 gate re-run.
- The External Agent API/MCP (not implemented).
- A real disk-full condition or a session write that hangs rather than rejects.
- The macOS menu-accelerator path for New chapter under hidden mode (the renderer keydown path and
  the sidebar/canvas buttons were exercised).
- Full security penetration testing; F10 path/CSP/debug-hook notes remain out of scope.
- Any screen recording or Notability workflow (product-owner only).

## Product-owner decisions

1. Accept M2f phase 5c with the Sentinel verdict **accept with minor**.
2. Whether the cold-cache 62.8 s e2e run needs a CI warm-up/tolerance before M2 acceptance, or
   whether the warm-state budget is sufficient.
3. Whether to action the hidden-mode perf baseline note now or defer it with M4 performance work.
4. Manual visual/VoiceOver/keyboard acceptance on the M2f build.
