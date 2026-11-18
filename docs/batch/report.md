# Report — test surface extraction

**Builder.** Branch `t3/extract-test-bridge-module` (the prepared worktree; the brief names
`t3/test-surface`). Base: `6abd9b3` (the commit that contains the brief). One commit. Not merged,
not pushed.

## Summary

The inline `window.__noteforestTest` bridge moved out of `App.tsx` into one module, with the same
object and the same lifecycle.

- `apps/desktop/src/renderer/src/test-surface.ts` owns the bridge: `createTestSurface()` returns the
  exact object literal that used to sit in the effect, annotated with
  `NonNullable<Window['__noteforestTest']>` so the compiler checks it against the unchanged
  `global.d.ts` declaration. It also owns the forced-flush override (`FlushTestMode`,
  `flushTestMode`, `currentFlushMode()`), which only exists for `setFlushMode` and the quit handler.
- `App.tsx` keeps one effect: assign `createTestSurface()`, and on unmount `delete
  window.__noteforestTest`. Empty deps, same position in the effect order. The quit handler reads
  the mode through `currentFlushMode()` instead of the moved `let`; same value, same behavior.
- `App.tsx` dropped the imports that only the bridge used (`markdownEditor`, `NodeSelection`,
  `TextSelection`, `closeTab`, `openPath`, `saveActive`, `commandContext`, `commandById`,
  `activeOverlayOwner`, `shortcutsForList`, `printPageModelSnapshot`, `mountPrintTestSurface`,
  `clearPrintTestSurface`, `buildPrintModel`, `perfSnapshot`, `summarize`, `openDetailsDialog`,
  `MenuCommand`). App is 391 lines, down from 821.
- No interface change: `global.d.ts` untouched, no suite touched, no dependency, no schema, no copy,
  no command logic, no export/print flow change.

Equivalence check: the moved object body is byte-identical to the old effect body modulo a
2-space dedent (`diff` of `git show HEAD:...App.tsx` lines 387–797 against the new module's object
body is empty). The only textual change inside the object is none; nothing was edited, reordered or
retyped.

## Files changed

New:

- `apps/desktop/src/renderer/src/test-surface.ts` (457 lines: bridge + flush override)
- `docs/batch/report.md` (this report)

Modified:

- `apps/desktop/src/renderer/src/App.tsx` (`+8 / −438`: the effect, the flush-mode read, imports,
  and the removal of the `FlushTestMode` type and `flushTestMode` variable)

Untouched, as required: `apps/desktop/src/renderer/src/global.d.ts`, `tests/**`,
`apps/desktop/test/**`.

## Checks and timings

| Check | Command | Result | Wall clock |
|---|---|---|---|
| Fast gate | `npm run verify:fast` | pass | 1 m 05.1 s |
| — boundaries | `npm run check:boundaries` | pass | (inside the gate) |
| — typecheck | `npm run typecheck` (4 workspaces) | pass | (inside the gate) |
| — unit | `npm test` (vitest) | 174 files, 1795 tests, all pass | 8.6 s |
| — e2e | `npm run e2e` (critical) | 16/16 subtests pass | 47.2 s (suite) |
| UI suites | `npm run test:ui` (concurrency 4) | **70/70 passed, 0 failed** | 353.4 s (runner), 5 m 54 s wall |

`npm test` was also re-run alone to capture the file/test counts above; it is the same run the gate
executes.

Environment note (no repo change): the prepared worktree had no `node_modules`; `npm ci` installed
the locked tree (471 packages) before the gates. No lockfile or manifest change.

Not run, by the brief: `test:perf`, `test:visual`, `test:recovery`, the full `npm run verify` (the
Orchestrator owns the integration gate).

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | `App.tsx` no longer contains the inline bridge object; the extraction lives in one module | pass — `App.tsx` effect is 5 lines; `test-surface.ts` is the only `window.__noteforestTest =` assignment (`App.tsx:368`) |
| 2 | Bridge interface unchanged: `global.d.ts` untouched, no suite changes | pass — `git status` shows only `App.tsx`, `test-surface.ts`, `docs/batch/report.md`; return type derived from `Window['__noteforestTest']`, `commandState(id)` included |
| 3 | `npm run test:ui` is 70/70 | pass — 70 passed, 0 failed |
| 4 | `npm run verify:fast` green | pass — boundaries, typecheck, 1795 unit tests, 16 e2e |
| 5 | No behavior change: state, actions, print helpers, export helpers, `commandState(id)` | pass — byte-identical object body; typecheck validates the shape; all 70 suites exercise the bridge |
| 6 | One commit; no merge, no push | pass — one commit on the branch, no push |

## Offline verification already done

- The UI suites are the only automated proof of the bridge's runtime behavior; 70/70 pass before and
  after, including the ones that cover `state()`, `structure()`, `applyStructural`,
  `setSettings`/`setPageSettingsOverride`/`resolvedPageSettings`, `commandState`, `renderPrint`/
  `clearPrint`/`pageModelPages`, `exportState`/`exportHistory`, `setFlushMode` and `seed`.
- The critical e2e suite covers the quit flush path and `Forced flush failure (test)`, i.e. the moved
  `flushTestMode` override.

## Risks and notes

1. **Branch name.** The prepared worktree is on `t3/extract-test-bridge-module`; the brief names
   `t3/test-surface`. Not renamed (no merge/push requested). The Orchestrator decides whether to
   rename at integration.
2. **Copy-audit scan list (pre-existing, not worsened).** `apps/desktop/test/copy-cd.test.ts` lists
   `App.tsx` among the files it scans. The moved block carried only developer-facing strings
   (`No active document.`, `The Page model is not ready.`) never shown in the UI, so no UI copy left
   the scan. Adding `test-surface.ts` to that list would be a suite change, which the brief forbids;
   left for the Sentinel/Orchestrator to judge.
3. **Bridge still ships unconditionally** (research `UNK-01`): this batch changes locality, not
   packaging. The global is still installed in every build, exactly as before.
4. **Test-only module state.** `flushTestMode` now lives in `test-surface.ts`; it still resets on a
   renderer reload and is still unreachable except through the test bridge. No app code depends on
   it besides the quit handler's read.
5. **No new unit test.** The change is a pure move of test infrastructure; a unit test of
   `createTestSurface()` would have to mock the whole store/runtime graph, and the brief names
   `verify:fast` plus `test:ui` as the evidence. No test was weakened or added.

## Next step

1. Sentinel: independent review against `docs/review-checklist.md`, starting with
   `test-surface.ts` and the five-line effect in `App.tsx`.
2. Orchestrator: run one full `npm run verify` at integration (UI concurrency 4), then decide the
   branch name at merge.
3. Orchestrator: remove the worktree in the same step as the merge.
