# M3i5a — UI test harness and fixture cleanup

**Role:** Builder
**Milestone:** M3i — Core stabilization
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-58246bcf`
**Branch:** `t3/m3i5a-ui-test-harness`
**Base:** `35d582f` (`docs: start M3i pre-M4 stabilization`)
**Code commit:** `c97b1ba` — `refactor: share the UI test harness and split callout tests`
**Scope:** test-only cleanup. No product code, spec, UX, ADR, or plan change; no assertion or wait
removed; no test deleted.

## Summary

- **One UI-session module.** `tests/support/ui-session.mjs` owns the Electron launch, isolated
  library, structural-command bridge, demo seed, menu/DOM probes, anchored/direct child creation,
  callout/formula/health waits, and the geometry helpers (path parsing, stem, right angles,
  overlap). Every helper is a named method of `createUiSession({ tempRoot })`; there is no
  module-level app/page state, and a helper throws if used before `launch()`.
- **One fixture module.** `tests/support/fixtures.mjs` owns the `textDoc`/`formulaDoc`/`codeDoc`
  builders, `addTopLevelBlock`/`addAnchor`/`addBranch`, and the former callout `buildFixture`
  (renamed `calloutStackFixture`). Factories are per-call; no shared mutable document.
- **All 13 UI files migrated** to the shared modules. Local helpers were kept where the behavior
  is genuinely file-specific (`focusBlock`, `outlineAnchorSnapshot`, code-selection helpers,
  repair `buildFixture`, callout lane snapshots, etc.).
- **Callout file split by concern, not by assertion:** `m3-anchor-callout-layout`,
  `m3-anchor-callout-stacking`, `m3-anchor-callout-placement-undo`. The 12 tests and every
  assertion are preserved; only setup moved. Each split file now also asserts its own renderer
  page-error list.
- **Repair + live-health share the same fixtures:** document/anchor/branch builders,
  `waitForHealthChip`, `openAnchorHealthFromChip`, `openAnchorHealthFromWarning`.
- **Test count unchanged at 36 UI tests.** `package.json` `test:ui`/`verify` now list the three
  split files instead of the old one.

## Line reduction

| Area | Before | After | Delta |
|---|---:|---:|---:|
| `tests/ui` (13 files) | 7,533 | 6,676 (15 files) | **−857 (−11.4%)** |
| `tests/support` (new modules) | 0 | 510 | +510 |
| `tests/support` total (with `harness.mjs`) | 479 | 989 | +510 |
| **Tests total (`tests/ui` + `tests/support`)** | **8,012** | **7,665** | **−347** |

Per file:

| File | Before | After |
|---|---:|---:|
| `m2-shell` | 448 | 443 |
| `m2-view` | 455 | 443 |
| `m3-anchor-callout` (split) | 1,965 | 1,738 (1,030 + 564 + 144) |
| `m3-anchor-outline` | 454 | 383 |
| `m3-code-anchor` | 380 | 351 |
| `m3-formula-anchor` | 332 | 275 |
| `m3-formula-term-geometry` | 551 | 492 |
| `m3-formula-term` | 326 | 267 |
| `m3-reference` | 974 | 849 |
| `m3-repair` | 699 | 629 |
| `m3f1-split-merge` | 236 | 197 |
| `m3h3-live-health` | 412 | 355 |
| `m3h5-leaf-delete` | 301 | 254 |

The reduction is duplicated setup, not coverage: an assertion-line comparison against `HEAD`
finds every removed assertion still present in a support module or unchanged in the test body
(the only additions are the two extra per-file page-error checks from the split).

## Extracted helpers

`tests/support/ui-session.mjs`:

- `isolated(name)`, `launch(overrides)`, `applyCommand(command)`, `structure()`, `seedDemo()`;
- `openBlockMenu(blockId)` (card right-click) and `openBlockMenuFromGutter(blockId)` (detail-0
  gutter activation, which deliberately does not move the ProseMirror selection — kept separate
  so the difference stays visible);
- `chooseMenuItem(name)`;
- `textMatch(blockId, word)`, `createAnchoredChild(blockId, word)` → `{ blockId, anchorId, branchId }`,
  `createDirectChild(parentId, blockId, text)`;
- `waitForCallouts(parentId, count, options)`, `waitForLaneWidth(parentId, minimum)`;
- `waitForFormulaBinding(blockId, anchorId)`, `openTermDialog(blockId, formulaIndex)`,
  `selectRange(textarea, start, length)`;
- `waitForHealthChip(broken, ambiguous, { timeout })`, `openAnchorHealthFromChip()`,
  `openAnchorHealthFromWarning(anchorId)`;
- exported geometry helpers: `GEOMETRY_STEM_MIN`, `parsePoints`, `lastSegment`, `cornerOffsets`,
  `expectNoArc`, `assertNearRightAngles`, `expectStem`, `assertNoOverlap`.

`tests/support/fixtures.mjs`:

- `textDoc`, `formulaDoc`, `codeDoc`;
- `addTopLevelBlock(ui, blockId, content)`, `addAnchor(ui, { anchorId, blockId, kind, selector,
  binding })`, `addBranch(ui, { branchId?, sourceBlockId, sourceAnchorId, targetBlockId, role })`;
- `calloutStackFixture(ui)` (demo + two anchored callouts + short/long direct children, with the
  same canonical branch-count assertions as before).

## E2E duplicate candidates (deferred to 5b, nothing removed)

No critical e2e test duplicates a `tests/recovery/*` test exactly. The recovery suite covers
corrupt/newer-schema/missing packages, backup restore, stale locks, and empty chapters; the e2e
persistence block overlaps the **desktop unit suites** (`save-failure`, `flush`, `lifecycle`,
`dialog-guard`) and itself. The exact e2e↔e2e / e2e↔unit pairs:

| # | E2E test (`tests/e2e/m2-editor.test.mjs`) | Overlapping e2e test | Authoritative counterpart | Safe 5b action |
|---|---|---|---|---|
| 1 | `keeps the window open on a flush timeout and closes after Retry` (2107) | `surfaces a flush error on quit and keeps the app open until Cancel` (2122) | `apps/desktop/test/flush.test.ts` “blocks when an editable document is in a failed-save state”; `apps/desktop/test/lifecycle.test.ts` “blocks a live window when the flush timed out” / “blocks a live window when the renderer reported an error” | Keep one flush-failure e2e; drop the other |
| 2 | `dismisses a failed-save quit through the E2E dialog guard` (2499) | `surfaces a flush error on quit and keeps the app open until Cancel` (2122) | `apps/desktop/test/dialog-guard.test.ts` “never opens a native message box; defaults to cancel” | Drop: the guard is unit-tested and active for every e2e run |
| 3 | `blocks closing on a failed save and keeps the content until Retry succeeds` (2538) | `surfaces a permission save failure and recovers with Retry` (2169) | `flush.test.ts` “blocks when an editable document is in a failed-save state”; `save-failure.test.ts` “an explicit Retry restarts the sequence without hiding the reason” | Trim to the close-block path or drop; keep one retry e2e |
| 4 | `saves a copy after external modification without touching the external file` (2450) | `saves a copy of the unsaved content and leaves the original untouched` (2227) | `save-failure.test.ts` “offers overwrite only for external modification” | Drop one save-copy e2e (keep the permission copy) |
| 5 | `reloads externally changed content only after confirmation` (2333) | `reloads from disk only after confirmation and discards local changes` (2280) | `save-failure.test.ts` “overwrites through the save IPC after external modification and clears the failure”; `recovery-library.test.ts` damaged-package read-only path | Drop one reload e2e; keep the external-modification reload |
| 6 | `overwrites an external modification only after a Cancel-default confirmation` (2367) | — | `save-failure.test.ts` “names the path and defaults the overwrite confirmation to Cancel” and “overwrites through the save IPC after external modification and clears the failure” | Trim to the post-overwrite no-false-conflict assertion, or drop |
| 7 | `saves pending edits on quit and restores them after relaunch` (2093) | `saves pending edits on close and restores them after relaunch` (2081) | `flush.test.ts` “skips a clean read-only document and still saves the session”; `lifecycle.test.ts` “allows a quit after the close handshake completed” | Low priority: close and quit are distinct lifecycle paths; keep both unless the budget is tight |

Keep as unique e2e paths: `quits after the last window is closed` (2143), `creates a text-anchored
child, undoes once, and reloads with the anchor intact` (2576), and one save-failure/one
external-modification/one reload/one save-copy after the trims above.

The recovery suite’s `m2f-backup-restore` test “lists valid backups newest first and restores one
as a new copy” also uses a permission save failure as a precondition, but the exercised user action
(restore backup) is not duplicated in e2e.

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| `npm test` | 519/519 pass, 48 files, 1.98 s tests |
| `node --test tests/ui/m3h5-leaf-delete.test.mjs` (targeted, after the menu/fixture migration) | 2/2 pass |
| `node --test` on the 10 migrated non-callout UI files (`--test-concurrency=1`) | 18/18 pass |
| `node --test` on the three callout split files | 6/6, 5/5, 1/1 pass (12/12, same as before) |
| `node --test tests/ui/m2-shell.test.mjs` (targeted) | 4/4 pass |
| `npm run test:ui` | pass, 15/15 files (includes build) |
| `node --test --test-concurrency=1 tests/ui/*.test.mjs` (timed, no build) | 36/36 pass, 166.2 s |
| `npm run e2e:critical` | 21/21 pass, 45.9 s suite / 54.2 s process |
| `npm run verify:fast` | pass on rerun: typecheck + 519 unit + 21 critical e2e, 60.8 s real |
| Full `npm run verify` | not run (Orchestrator owns the single integration run) |
| Recovery / perf / visual suites | not run (not in this brief) |

One first `verify:fast` attempt failed one critical e2e subtest (20/21; the tailed output did not
retain the test name) at 59.4 s suite. The immediate `npm run e2e:critical` rerun (21/21, 53.6 s)
and `npm run verify:fast` rerun (pass) were clean; this is the same class of pre-existing e2e flake
noted in `docs/reports/m3h5-leaf-delete.md`, not a deterministic failure introduced by this slice
(no e2e file was touched).

## Risks / not verified

- **No product behavior changed.** Only test support and test setup changed; the app, spec, UX,
  ADR, and plan are untouched.
- **`createAnchoredChild` now returns IDs and asserts them.** The old callout helper returned only
  the created block ID; the shared helper additionally resolves the created branch/anchor from the
  canonical document (an extra read-only probe). This is additive and makes a wrong fixture fail
  loudly; it does not add or remove a wait.
- **`waitForFormulaBinding` uses the multi-formula form for all three formula files.** In the
  whole-formula test there is exactly one formula node, so the condition is equivalent; the shared
  form is the more general one.
- **`waitForCallouts` keeps the formula file’s explicit `polling: 100`.** The callout files keep the
  previous default polling; the option is passed at the call site, so the wait behavior is visible.
- **`openBlockMenu` is now scoped to the active editor**; the previous reference/h5 helper was
  global. There is one active editor in those tests, so the matched element is the same and the
  selector is stricter.
- **Callout split files each assert page errors.** The page-error assertion count for the callout
  concern grew from one to three (one per file); this is stronger, not weaker.
- **Flaky e2e observation** described above; not reproducible on reruns.
- Not verified: full `verify` (orchestrator), recovery suite, visual screenshots review, perf suite,
  manual VoiceOver/visual pass. Screenshot paths are unchanged (`artifacts/m3g1`, `m3g3`, `m3g4`,
  `m3g5`, `m3h1`, `m3h5`) and are written by the migrated tests, but the images were not re-reviewed
  for this test-only slice.
