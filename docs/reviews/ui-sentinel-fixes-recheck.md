# Review — UI Sentinel fixes re-check (F1 overlay/export identity, F2 write identity, F3 corrupt settings, F4/F7 evidence)

- Reviewer: Reviewer / Sentinel (independent)
- Date: 11 November 2026
- Reviewed base: `main` at `45c9b21` (fix batch `38daf71` + correction `58a9b6a`, docs/brief
  `45c9b21`); pre-fix head `fd28c3c`
- Worktree: `a builder worktree`
- Branch: `t3/ui-sentinel-fixes-recheck`
- Environment: macOS 26.5.2 (25F84), Apple M5 (10 cores), Node 22.23.1, npm 10.9.8; production
  Electron build from `npm run verify`; E2E hidden mode; default UI pool concurrency 8.
- Verdict: **Accept with findings** — the three S2 findings are closed and the F4/F7 evidence is
  sound; two non-blocking S3 follow-ups remain.

## 1. What this re-check did

- Read `docs/tasks/ui-sentinel-fixes-recheck.md`, `docs/reviews/ui-post-merge-review.md` (F1–F4/F7),
  `docs/tasks/ui-sentinel-fixes.md`, `docs/reports/ui-sentinel-fixes.md`, the review checklist and
  DoD, and the settings/page-settings parts of spec/UX/ADR-0007/ADR-0008.
- Read the fix diff `fd28c3c..45c9b21` (26 files, +2023/−283): product code under
  `apps/desktop/src`, tests under `tests/ui` and `apps/desktop/test`, runner data in
  `tests/ui/suites.mjs`, and the docs/report updates.
- Ran one full `npm run verify` on `45c9b21` and one additional full UI pass at the default pool;
  ran the targeted shell/settings group, the new suite alone, `m4e1` alone, and the five relevant
  unit files.
- Reproduced F1, F2 and F3 independently with scripts written for this review (not the builders'
  tests), using the real app, real native menu-item clicks, real keyboard events, and real files.
  The scripts live under the gitignored `artifacts/recheck/` and can be re-run with
  `node artifacts/recheck/f1-f2-repro.mjs`, `f3-repro.mjs`, `f1-close-window.mjs`, and
  `f3-unreadable.mjs`.
- Temporarily added a UI suite to prove the meta-test fails, then removed it; injected one runner
  timeout; checked `--list` and groups. All temporary edits were reverted.
- Did not change product code, tests, spec/UX/ADR/plan, and did not merge or push.

## 2. Verdict and summary

The fix batch genuinely closes the three S2 findings:

- **F1** — while Settings, another dialog, the palette, or the Export sheet owns the surface, the
  renderer shortcut path and the native-menu dispatch path ignore app commands; Export is pinned to
  the document it opened for. The original repro on the fixed base produced B's content only, under
  B's filename, with B still active after `⌘1`, `Ctrl+Tab` and a native Close Tab click.
- **F2** — debounced and immediate Page settings writes use the identity captured at their start.
  The original cross-document margin repro now lands on the document where it was typed; a closed
  target writes nothing, shows a visible not-saved error, and Retry cannot turn it into Saved; a
  scope switch flushes on the original layer.
- **F3** — a corrupt `settings.json` is refused by ordinary writes and left byte-for-byte intact,
  backup included; the explicit Reset writes schema-2 defaults, keeps the backup, clears the
  warning only on success, and later writes save again.

F4 (evidence isolation) and F7 (runner hardening) are real and verified. No existing assertion was
weakened or removed; no schema, dependency, spec, UX or ADR change was found.

Two S3 follow-ups are reported in §8: the native **Close Window** item is not covered by the
overlay gate, and the corrupt/unreadable settings recovery action is gated to the `corrupt` state
and disappears after Dismiss. Neither is reachable from the original repros, causes data loss, or
produces a wrong-document write; they are contract/recovery edges, not S2 regressions.

## 3. F1 — overlay ownership and export identity

Status: **closed** for the original repro and the re-check criteria, with the `Close Window` edge
noted in §8.

### Original repro on the fixed base

Two real packages (`Repro Alpha`, `Repro Beta`, markers `ALPHA-MARKER-only-alpha` and
`BETA-MARKER-only-beta`) were opened, Beta active. Export was opened with a real click on the native
`File → Export PDF…` menu item (`menu-export-pdf`). Then:

- `⌘1`, `Ctrl+Tab`, `⌘2`, `⌘3`, `⌘K`, and real native **Close Tab**, **Settings…**, **Toggle
  Sidebar**, **New Document** clicks: shell snapshot (active tab, tab list, palette, dialog, layout,
  mode, zoom) unchanged; the sheet stayed at `configure` with `packagePath` = Beta.
- The sheet exported to `Repro Beta.pdf`; PDF text contained `BETA-MARKER-only-beta` and did **not**
  contain `ALPHA-MARKER-only-alpha`. The active tab never became Alpha during the sheet.
- Closing the sheet released the channel: `⌘1` then switched to Alpha.

### Other F1 paths checked

- **Settings**: `⌘1`/`⌘2`/`⌘3`/`⌘E`/`⌘K`/`⌘W`/`⌘N`/`⌘,`/zoom, plus real native Close Tab, New
  Document and Toggle Sidebar, did nothing; the Settings input still typed and saved. Native
  select-all + copy + paste worked in the margin field (clipboard `12` copied, `18` pasted) and the
  native `cut/copy/paste/selectall/quit` role items stayed enabled.
- **Another dialog**: a real Delete block dialog (block menu) also blocked `⌘1` and native Close Tab,
  and stayed open.
- **Palette**: `⌘K` opens/closes the palette (its documented toggle), a row click ran, and
  `⌘1`/native Close Tab did nothing behind it; the in-repo suite additionally covers the
  ArrowDown/Enter row path.
- **Nested Settings → Export**: Settings stays open under the sheet, both surfaces gate commands,
  closing Export returns to a still-gated Settings, and Settings remains usable.
- **Closed pinned document**: closing the pinned document while the sheet is open leaves the sheet
  pinned to it; Export fails with `document-not-open` ("…no longer open…"), and the output directory
  stays empty.
- Code: `activeOverlayOwner()`/`overlayOwnsCommands()` (`shell/overlay-owner.ts`) cover
  `dialog`, `palette` and every non-idle export state; the `keydown` handler and the module-level
  `dispatch()` both consult it (`App.tsx:117`, `:322`). `ExportUiState.packagePath` is captured at
  `openExportSheet` and used by `startExport`, `runExport` and the Page Edit commit
  (`export/export-flow.ts:261`, `:330`, `:385`).

Evidence: `artifacts/recheck/f1-f2.log` (`F1 export identity and command gate`, `F1 closed pinned
document`, `F1 nested Settings->Export`, `F1 Settings/dialog/palette gate` all PASS); PDF
`artifacts/review-recheck-output/identity/Repro Beta.pdf` (53,853 bytes). Covered in-repo by
`tests/ui/ui-overlay-command-gate.test.mjs` (7/7) and `m4e1`/`ui-batch-a`/`ui-batch-b` remaining
green.

## 4. F2 — Page-settings write identity

Status: **closed**.

### Original cross-document repro

Document-scoped top margin `25` was typed on Beta, then the active tab was switched to Alpha during
the 300 ms debounce (through the test bridge, because the F1 gate now blocks the user shortcut; a
system/external tab change is the equivalent path). `document-settings.json` got Beta's entry with
`margins: { top: 25 }` and `documentId: repro-beta`; Alpha had no entry. The footer reported saved.

### Closed target

Top margin `26` was typed on Beta and Beta was closed during the debounce. The footer showed
`error`, "The document closed before this change was saved. Nothing was written.", no entry
contained `26`, Retry kept the error and wrote nothing, and Done was not blocked. This is the
original "skipped write reported as saved" path, now fail-closed.

### Scope switch and immediate write

- Typing `27` on the document layer and immediately switching to Global wrote Alpha's document
  override (top `27`) and did not write `27` to the global `settings.json`.
- The immediate path was exercised end-to-end: clicking A5 (size) and switching the tab in the same
  task left the A5 override on Beta and wrote nothing to Alpha. The helper
  `runImmediatePageSettingsWrite` captures its target **before** `flushPending`; the unit test
  "captures before the flush and executes the captured target unchanged" switches the live identity
  inside `flushPending` and asserts the original target executes.
- Code: `writePending`, `applyPending`, `executeImmediate`, `retry` and `flushPending` consume the
  captured `{scope, packagePath, documentId}`; `targetIsGone` is re-checked before/after the Page
  Edit commit, and `commitThenWritePageSettings` maps a refused apply to `target-gone`
  (`settings/page-settings-target.ts`, `settings/page-settings-write.ts`,
  `settings/usePageSettingsController.ts`).

Evidence: `artifacts/recheck/f1-f2.log` (`F2 write identity`, `F2 immediate capture-before-flush`
PASS); unit `page-settings-target.test.ts` + `page-settings-write.test.ts` (part of 53/53 targeted
tests); UI coverage in `ui-overlay-command-gate.test.mjs` (cross-document and closed-target tests).

## 5. F3 — corrupt global settings

Status: **closed** for the corrupt-JSON lifecycle; the read-failure/dismiss recovery edge is S3
(§8).

### Original repro

`settings.json` was set to `{not json` before launch. At launch the warning appeared and one
`settings.corrupt-<timestamp>.json` backup existed. Moving the density slider one step then:

- footer `data-settings-status="error"`, error text matched `/corrupt/`, warning visible;
- `settings.json` was still exactly `{not json`; the backup set and the backup bytes were unchanged.

Clicking **Reset settings** replaced the file with valid schema-2 defaults (density `1`), kept the
backup, cleared the warning only after the successful write, and reported saved. A later slider
change wrote `0.95` and saved. Dismissing the warning kept the footer error and wrote nothing.

Code: `readSettingsRawForWrite` re-reads `settings.json` at write time and returns `{ok:false}` for
read/parse failures (`library.ts:1278-1302`); `writeSettings` returns that refusal;
`resetSettings` is the only replace path and keeps the backup (`library.ts:1352`); the
`settings:reset` IPC/preload/shared API is wired; `useSettingsStore.resetSettingsToDefaults`
clears the warning only on success (`state/settings.ts:375-394`).

Evidence: `artifacts/recheck/f3.log` (`F3 reset lifecycle`, `F3 dismiss` PASS); in-repo
`m4e1-settings-platform` (4/4) and `settings.test.ts`/`settings-store.test.ts` refusal+reset tests.

## 6. F4/F7 status

### F4 — evidence isolation: **closed**

- The four F4-named suites now own distinct screenshot directories; `m4d2`'s `before` deletes only
  `artifacts/m4d2-export-ui`, `m4e1` writes `artifacts/m4e1-settings`, `m4d1` writes
  `artifacts/m4d1-page-density`, `ui-batch-a` keeps `artifacts/ui-batch-a`, and the new suite owns
  `artifacts/ui-overlay-command-gate`.
- Two full runs at the default pool (one inside `verify`, 96.2 s; one explicit, 95.3 s) left the
  same file lists in all five directories: `ui-batch-a` 7 files, `m4e1-settings` 1,
  `m4d1-page-density` 3, `m4d2-export-ui` 6, `ui-overlay-command-gate` 2. No directory disappeared
  or was attributed to another suite. The `settings-no-document.png` collision is gone: both
  `ui-batch-a` and `m4e1-settings` now have their own copy.
- Static check `apps/desktop/test/ui-suite-list.test.ts:45-66` guards the four named directories and
  rejects the `'ui-batch-a'` string in other suites; an `rm(...)` audit over `tests/ui/*.test.mjs`
  shows only per-suite screenshot/temp/output directories.
- Not a blocker for this finding: older M3 evidence directories `m3g1` and `m3h2` are still written
  by two suites each (`m3-anchor-callout-layout`/`m3-anchor-callout-stacking` and
  `m3-reference`/`m3-repair`) with distinct filenames and no delete. "One directory per suite" is
  true for the F4 set, not globally (S4 nit §8).

Evidence: `artifacts/recheck/f4-before/files.txt` and `f4-after/files.txt` (identical), plus the
two full-run logs.

### F7 — runner hardening: **closed**

- `tests/ui/suites.mjs` is pure data imported by `run.mjs`; `ui-suite-list.test.ts` asserts
  `FILES` equals `tests/ui/*.test.mjs` exactly. Adding a temporary
  `tests/ui/sentinel-temp-meta.test.mjs` made the meta-test fail
  (`expected [...43] to deeply equal [...44]`), the other 5 tests passed; removing it restored
  6/6 green.
- Timeout: `NOTEFOREST_UI_TIMEOUT_MS=800 node tests/ui/run.mjs --group shell --concurrency 1
  --fail-fast` printed `FAIL m2-view.test.mjs (0.8s, timed out after 0.8 s)`, exited 1, and left no
  Electron process tied to this worktree.
- `NOTEFOREST_UI_RUNNER` is gone from `run.mjs` (only docs/tests mention it); `--list` prints
  `shell 6, settings 6, anchors 13, images 4, page 16, all 44, core 11` with de-duplication intact
  (the new suite is in `shell`+`settings` and counted once in `core`; the other groups are unchanged).
- `node tests/ui/run.mjs --group shell,settings` ran 11 files, 11/11 passed in 34.7 s.

## 7. Fix-diff quality

- **Scope**: 26 files, +2023/−283. Product code is limited to the overlay predicate, `App`/export
  flow, page-settings target/write/controller, settings store/dialog, library/index/preload/shared
  API. Tests are the new overlay suite, `m4e1`/`m4d1`/`m4d2` paths, `suites.mjs`/`run.mjs`, and new
  unit files. Docs are the builder report, briefs, plan and AGENTS phase note.
- **No drift**: no `package.json`/lockfile change, no schema or migration change, no
  spec/UX/ADR change, no paginator/print-compositor change. `settingsVersion` stays 2; the reset path
  writes the existing defaults document.
- **No weakened assertions**: the test diff contains only imports/paths moved, the 43→44 list move
  into `suites.mjs`, and additive expectations in `m4e1`; `ui-batch-a` is untouched. The existing
  `page-settings-write` suite gained `target-gone` cases; no expectation was relaxed.
- **No test-only product branches**: the gate reads live stores, not an environment flag. The new
  `window.__noteforestTest` methods (`activateTab`, `closePath`, `dispatchMenuCommand`,
  `overlayOwner`) follow the pre-existing always-installed test bridge and have no product callers;
  `closePath` calls the real `closeTab` with explicit options. `dispatchMenuCommand` uses the exact
  `dispatch()` path shared with `window.noteforest.onMenu`.
- **Immediate-write contract**: `runImmediatePageSettingsWrite` captures before the flush; the
  controller passes `captureTarget`, `flushPending`, and an `execute` that re-checks the target
  before and after the commit. This is the correction the integration review requested and it is
  the right shape.
- One behavior change: Settings no longer closes when it opens Export, so the two modals stack. This
  is required by the F1 nesting criterion and is flagged for the product-owner visual/VoiceOver pass
  (F6).
- Minor cleanup note: `lastDispatch` moved from a component ref to module scope; it is only the
  120 ms duplicate-command guard, so no user-visible effect.

## 8. Findings

Severity definitions are `docs/review-checklist.md` §9.1. No S1 or S2 was found on the in-scope
paths.

| ID | Sev | Area | Location | Finding |
|---|---|---|---|---|
| R1 | **S3** | Shell / native menu | `apps/desktop/src/main/menu.ts:75-77`; `apps/desktop/src/renderer/src/App.tsx:117-118`, `:322-330`; `shell/overlay-owner.ts` | The native **Close Window** item (`⌘⇧W`) calls `getWindow()?.close()` directly and never enters `dispatch()`, so it is not covered by the overlay-owner gate. With Settings open, a real native Close Window click closed the window (0 windows) while the pending document-scoped margin edit was still flushed to the captured document (top `31`). The renderer `⌘⇧W` path is gated, but the macOS menu accelerator invokes the native click. Impact is a closed window/sheet, not a wrong-document export or write; no data was lost in the probe. |
| R2 | **S3** | Settings recovery | `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx:892-903`; `apps/desktop/src/renderer/src/state/settings.ts:370-373`; `apps/desktop/src/main/library.ts:1286`, `:1297` | The Reset button renders only for `settingsStatus.state === 'corrupt'`. An `unreadable` file (EACCES probe) shows the warning but no Reset; Dismiss on a corrupt file clears `settingsStatus`, so the warning and the only Reset affordance disappear while every ordinary write stays refused. The refusal text still says “Use Reset settings…”, but the button is gone until restart/reload. Data is safe and the error is visible, so this is recovery affordance, not a data bug. |

### S4 nits (optional)

- The F4 static guard in `apps/desktop/test/ui-suite-list.test.ts:45-66` covers the four named
  suites only; add `ui-overlay-command-gate` to the owners map so the new evidence directory is
  guarded too.
- The literal "one screenshot directory per suite" is applied to the F4 set but not globally:
  `m3g1` is written by `m3-anchor-callout-layout` and `m3-anchor-callout-stacking`, and `m3h2` by
  `m3-reference` and `m3-repair` (distinct filenames, no delete). Generalize the meta-test or split
  those directories if the rule is meant literally.
- The extended F3 test keeps the old name suffix `(S2-5)` although it now covers F3; cosmetic.
- `openExportSheet`'s `flowBusy()` comment still says it focuses the existing sheet while it just
  returns (pre-existing F6 scope).

## 9. Checks run (real timings)

| Check | Result | Real time |
|---|---|---:|
| `npm run verify` on `45c9b21` (exit 0) | boundaries 178/877, typecheck clean, unit 109 files / 1099 tests, e2e 16/16, recovery 14/14, UI 44/44, 0 pageErrors | **175 s wall** |
| unit (`npm test` in verify) | 109 files / 1099 tests | 8.25 s |
| e2e (`npm run e2e` in verify, includes build) | 16/16 | 45.11 s node-test |
| recovery (`npm run test:recovery:run`) | 14/14 | 17.50 s |
| UI run #1 (in verify, default pool 8) | 44/44, 0 pageErrors | 96.2 s |
| UI run #2 (explicit, default pool 8) | 44/44, exit 0 | 95.3 s (96 s wall) |
| `node tests/ui/run.mjs --group shell,settings` | 11 files, 11/11 | 34.7 s (35 s wall) |
| new `ui-overlay-command-gate` alone | 7/7 | 14.2 s |
| `m4e1-settings-platform` alone | 4/4 | 12.1 s |
| targeted vitest (`page-settings-target`, `page-settings-write`, `settings`, `settings-store`, `ui-suite-list`) | 5 files / 53 tests | 261 ms |
| meta-test with a temporary suite | 1 failed / 5 passed, as required; reverted | 86 ms |
| meta-test after revert | 6/6 | 74 ms |
| timeout injection (`800 ms`, 1 worker) | `FAIL … timed out after 0.8 s`, exit 1, no worktree Electron left | 0.8 s |
| independent F1/F2 repro (6 scenarios) | all PASS | 13.58 s |
| independent F3 repro (reset + dismiss) | all PASS | 9.92 s |
| `Close Window` probe | closed window, pending `31` flushed, no data loss | probe run |
| `unreadable` settings probe | state `unreadable`, warning 1, Reset 0, footer error, bytes unchanged | probe run |

`--list` counts: `shell 6, settings 6, anchors 13, images 4, page 16, all 44, core 11`. The
shell/settings/all growth by one is the new suite; de-duplication and the other groups are
unchanged.

## 10. What was not verified

- **Pre-fix red runs.** I did not rebuild `fd28c3c` and run the new tests against the old code. The
  red-green claim rests on the old code paths documented in the original review (active-tab read at
  export time, live refs at flush time, `readRawSettingsForWrite` fallback) and on the fixed
  behavior reproduced here.
- **A real commit/IPC round-trip closing the target during an immediate write.** The immediate
  capture contract is proven by the unit test and by a same-task tab switch in the real app; the
  exact multi-tick window needs an injected delay, which the builder deliberately did not add.
- **A corrupt file that becomes corrupt after bootstrap**: the unit test proves the refusal, but the
  renderer does not re-surface the corrupt warning (related to R2); no UI test exercises it.
- **Real macOS folder picker**: tests override `dialog.showOpenDialog`; the dialog guard proves no
  save dialog.
- **Notarized/packaged app**: out of scope; `m4c3-packaged-export` is the closest harness.
- **VoiceOver/visual judgement** of the stacked Settings → Export modals (F6), and the remaining
  F5/F6/F8/F9/F10 items, are out of scope for this re-check.
- **The 1–7 worker pool matrix**: only the default pool 8 and a 1-worker timeout were run.
- **Quit with an in-flight export** and **native Close Window with an in-flight export**: the quit
  role is enabled and the flush path is unchanged; the close-window probe covered a pending
  settings edit, not a running export.

## 11. Residual risks

- R1 (`Close Window`) is the only native-menu path I found outside the gate. It is deliberate,
  low-frequency, and flushes pending writes, but it contradicts a literal "every app command" gate.
- R2 (recovery affordance) means a user who dismisses the corrupt warning, or whose file is
  unreadable, must restart/reload to get the Reset button back. Writes stay refused and the footer
  stays in error in the meantime, so data is not at risk.
- The global settings write still has the acknowledged check-then-rename race if the file is
  corrupted between `readSettingsRawForWrite` and the rename; no fs lock was added (out of scope).
  The per-document map has the same shape.
- The F4 evidence guard is a static string check, not a behavioral test; the two full runs are the
  stronger evidence.
- Timing remains the main test-infrastructure risk: one builder manual parallel run missed a wait
  (reported, not reproduced); all four gate runs here (verify, explicit run, group, single suites)
  were green with no retries.
- The `window.__noteforestTest` bridge is always installed, including production builds; the new
  methods add shell actions but no product branch. This is the pre-existing test-surface pattern,
  not a new leak.

## 12. Open product-owner questions

1. **Close Window behind a modal**: should `⌘⇧W` / File → Close Window remain available (an OS-level
   close, like Quit), or should it be gated with the other app commands? The probe shows it closes
   the window while Settings/Export are open and flushes pending settings correctly.
2. **Recovery after Dismiss / unreadable**: should the corrupt warning and Reset stay available
   until a successful reset, and should `unreadable` expose Reset too? (R2)
3. **Stacked Settings → Export**: confirm the visual/focus/VoiceOver result of Settings staying open
   under the Export sheet (F6, already tracked).
4. **Palette `⌘K` exception**: the palette's own `⌘K` close toggle is the one app command allowed on
   its own surface; confirm this is the intended contract (it is documented and covered).

## 13. Recommended next step

1. **Accept the fix batch.** No S1/S2 remains; F1–F3 are closed and F4/F7 are evidenced. The next
   settings block is no longer blocked by this re-check.
2. File R1/R2 as small S3 follow-ups (gate or explicitly document Close Window; keep/reinstate the
   Reset affordance for `corrupt`/`unreadable`), and add the new suite to the F4 static owners map.
3. Run the product-owner visual/VoiceOver pass for the nested Settings → Export surface before or in
   parallel with the next settings block.
4. Keep the F5/F6/F8/F9/F10 items as tracked S3s; do not fold them into this batch retroactively.
