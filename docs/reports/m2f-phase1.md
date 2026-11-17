# M2f phase 1 — quit lifecycle and test infrastructure

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m2f-quit-lifecycle-test-infra`  
**Base:** `8d78529` (`main`: docs: start M2f phase 1)  
**Scope:** F1 (S1 quit) and F8 (test inventory/speed) only. No M3, page view, PDF, undo, save
recovery, corrupt-document recovery, keyboard focus, empty chapters, or stale-lock work.

## Verdict

F1 is fixed and covered by a close-window-then-quit e2e. The critical suite was split and the
fixed sleeps removed: **10 critical e2e tests / 18.2 s test time** (25.6 s node run including
launches/hooks, 25.9 s wall including build), **147 unit tests / 1.3 s**. The previous critical
baseline in this worktree was 13 tests / 103.5 s. The 60 s and 3 s targets are met without deleting
data-safety, desync, arrow, layout, keyboard, or persistence coverage.

## F1 — quit after the last window closes

**Root cause.** `mainWindow.on('closed')` set `allowClose = false`. A later `app.quit()` reached
`before-quit`, which cancelled the quit whenever `allowClose` was false, but only called
`attemptClose` when `mainWindow` was non-null. With the last window gone, no branch could set the
flag again: macOS stayed alive with zero windows.

**Fix.** `apps/desktop/src/main/index.ts`:

- `createMainWindow()` resets `allowClose = false` at the start of a new window lifecycle.
- `closed` no longer resets `allowClose`; it only clears `mainWindow`.
- `before-quit` uses `quitCanProceed(allowClose, hasLiveWindow)` from
  `apps/desktop/src/main/lifecycle.ts`: allow immediately when the close handshake completed or
  when there is no live window; otherwise keep the guard and prompt.
- `attemptClose` is unchanged, so the native save / don't-save / cancel prompt still runs while a
  live window has unsaved changes.

**Tests.**

- `apps/desktop/test/lifecycle.test.ts` (3 cases): allow after the handshake, allow with no live
  window (the S1 regression), still guard a live window.
- `tests/e2e/m2-editor.test.mjs` “quits after the last window is closed”: close the last
  `BrowserWindow`, wait for zero windows, call `app.quit()`, assert the process exits within 5 s.
  Observed ~0.6 s.
- The existing lifecycle e2e still covers dirty/save state, the close-tab prompt, tab restore, and
  relaunch, so the prompt path was not weakened.

## F8 — test inventory and durations

### Before / after

| Suite | Before | After | Target |
|---|---|---|---|
| Unit (`npm test`) | 144 tests / 1.33 s | **147 tests / 1.31 s** (Vitest) / 1.40 s in `verify` | < 3 s ✅ |
| Critical e2e | 13 tests / 103.5 s test / 104.9 s wall (review measured 96.0 s) | **10 tests / 18.2 s test**, 25.6 s node run, 25.9 s wall incl. build | < 60 s ✅ |
| Perf e2e | inside critical (11.3 s) | separate `tests/perf/` 1 test / 12.2 s | on demand |
| Visual e2e | inside critical (12.3 s + inline shots) | separate `tests/visual/` 2 tests / 5.9 s | on demand |
| `verify:fast` | — | typecheck + unit + critical e2e / **31.1 s wall** | — |
| `verify` | — | verify:fast + build / **32.2 s wall** | — |

`node --test` reports 25.6 s for the critical run while the ten test bodies sum to 18.2 s; the
difference is the Electron/Playwright harness overhead around launches and hooks. Both numbers are
well inside the 60 s target.

`waitForTimeout` calls: **76 / 44.5 s before → 0 in the critical suite**. The perf suite keeps three
deliberate sampling windows (1,000 ms after typing, 250/500 ms between collapse/create probes)
because the reported p95 values need samples; it is not in the gate. The visual suite has none.

### Inventory mapping (nothing deleted)

| Old e2e | New location | Note |
|---:|---|---|
| 1 lifecycle/branches/tabs | critical #1 | all assertions; condition waits instead of 120–900 ms sleeps |
| 2 demo arrows + collapse | critical #2 | also absorbs old #9 (controls) and #11 (trunk + Backspace) |
| 3 session scroll/focus | critical #3 | 5.6 s autosave wait replaced by `flushSession()` |
| 4 axe/palette/tree/dialog | critical #4 | axe and verdicts kept; zoom screenshot moved |
| 5 300/1,000 perf | `tests/perf/m2-performance.test.mjs` | same measurements and assertions |
| 6 rapid structural parity | critical #5 | desync regression, unchanged assertions |
| 7 keyboard/heading/chapter | critical #6 | same coverage; palette / focus conditions |
| 8 parent-relative layout | critical #7 | same geometry assertions; screenshots moved |
| 9 controls/height | merged into critical #2 | one fewer app launch |
| 10 zoom/fit/focus | critical #8 | same assertions; screenshots moved |
| 11 trunk + Backspace | merged into critical #2 | one fewer app launch |
| 12 chapters/top-level | critical #9 | same assertions |
| 13 screenshot capture | `tests/visual/m2-screenshots.test.mjs` #1 | 13 screenshots |
| — | visual #2 | reproduces the zoom/four-level/deep-scroll/controls/focus/fit shots removed from #4/#8/#10 |
| — | critical #10 | new close-window-then-quit regression |
| — | unit lifecycle | new pure quit-decision test |

All 20 prior screenshots are produced again, at exact 1440×900 / 1024×768 sizes.

### What changed in the test infrastructure

- `tests/support/harness.mjs` — shared launch/quit, condition waits, geometry snapshots, artifact
  paths, and screenshot helpers.
- **Condition waits instead of sleeps**: `waitLayout` waits for three consecutive animation frames
  with identical card rects (optionally asserting expected block/arrow counts). New waits cover
  edge counts, canonical block counts, editor text, save state, tab count, active tab, zoom label,
  focus, palette open/closed, and native `isDocumentEdited`.
- **Session flush**: `window.__noteforestTest.flushSession()` calls the existing `saveSession(
  buildSession())` path, so the session test writes scroll/focus and quits immediately instead of
  waiting 5.6 s for the 5 s interval.
- **Artifacts**: roots honour `NOTEFOREST_ARTIFACTS` (default `artifacts/`); critical temp data,
  perf report, and visual images use separate subdirectories.
- **Screenshots**: `page.screenshot({ scale: 'css' })` plus a PNG IHDR size assertion replaces the
  macOS-only `sips` resample. Axe is still injected from the app origin because the production CSP
  blocks inline scripts; the CSP was not weakened.
- **Scripts**: `e2e`, `e2e:critical`, `test:perf`, `test:visual`, `verify:fast`, `verify`.
- **Optional unit merge skipped**: `geometry.test.ts` and `chapters.test.ts` remain separate. The
  review called the merge optional, there is no runtime win, and leaving them avoids churn while
  the undo/data-safety phases touch the same modules.

### Run policy (also in `docs/definition-of-done.md` and `README.md`)

- Builder: targeted unit/e2e tests while fixing, then `verify:fast` **once** at handoff.
- Orchestrator: `verify` **once** on integration.
- No repeated full suite after each small fix.
- `test:perf` and `test:visual` are on demand or nightly, never part of either verify gate.

## Gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | pass |
| Unit | `npm test` | 147/147, 1.31–1.40 s |
| Critical e2e | `npm run e2e` | 10/10, 18.2 s test / 25.9 s wall with build |
| Fast gate | `npm run verify:fast` | pass, 31.1 s |
| Full local gate | `npm run verify` | pass, 32.2 s |
| Perf suite | `npm run test:perf` | 1/1, 12.2 s; 300-block 532 ms, 1,000-block 1,206 ms, 799 visible after collapse |
| Visual suite | `npm run test:visual` | 2/2, 5.9 s; 20 screenshots |
| S1 regression | critical #10 | process exits in ~0.6 s after close + quit |

Performance/screenshot artifacts are gitignored under `artifacts/perf/` and `artifacts/m2e/`.
The visual suite captures evidence; it is not a pixel-diff baseline.

## Known gaps / risks

- **F2 dedupe still exists.** The renderer drops a repeated menu command inside 120 ms. The rapid
  undo/redo test alternates commands and keeps one documented `delay(150)` between repeated undo
  presses. Phase 3 should remove the time-based dedupe and delete that gap.
- **Test hook ships unconditionally.** `flushSession` lives on the existing `__noteforestTest`
  bridge, which F10 will gate behind dev/E2E. No production behavior uses it.
- **Visual suite is evidence, not regression.** Screenshots are generated and size-checked, but
  pixel baselines/`maxDiffPixelRatio` remain the DoD 3.6 follow-up, not part of M2f phase 1.
- **Perf sampling waits remain** by design (see above); they are outside the critical gate.
- `e2e:critical` assumes a prior build; `e2e`, `test:perf`, `test:visual`, `verify:fast`, and
  `verify` all build first.
- Only macOS was exercised. `sips` is gone, but this phase did not run the Electron suites on
  Linux or Windows.

## Next phase

Phase 2 (F4 flush/close contract): typed flush result (`ok`/`error`/`timeout`), no close or quit on
timeout without a user decision, real preload rejection forwarding, save-failure recovery actions,
and no “Saved” state while a commit is pending.
