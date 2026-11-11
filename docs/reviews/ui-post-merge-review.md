# Review — UI Batches A/B/C/V and the UI test runner

- Reviewer: Reviewer / Sentinel (independent)
- Date: 11 November 2026
- Reviewed range: `94d07b3..fc55d40` (`main` head at review start)
- Worktree: `/Users/luca/.t3/worktrees/noteforest/t3-748a3e75-f845418a9e316b3a`
- Branch: `t3/ui-post-merge-sentinel-review`
- Environment: macOS 26.5.2 (25F84), Apple M5 (10 cores), Node 22.23.1, npm 10.9.8; production
  Electron build from `npm run verify`; E2E hidden mode and `force-device-scale-factor=1`.
- Scope: the UI diff (Batches A/B/C/V), `tests/ui/run.mjs`, `package.json`, the 43 UI suites, and
  the review/DoD documents. Out of scope: untouched M2/M3/M4 internals except where the UI diff
  changes their behavior, and all product decisions (tab windowing, Settings centering, fit-width).
- Verdict: **Request changes**

## 1. What this review did

- Read the Batch A/B/C/V briefs and reports, `ui-rework.md`, `ui-settings-contents.md`, the frozen
  settings inventory, `settings-freeze-review.md`, the spec/UX/ADR-0007/ADR-0008, and the review
  checklist/DoD.
- Read the product diff (46 files under `apps/desktop`, ~8.3k insertions) and the runner, then
  reproduced the claimed behavior with the real app and the UI suites.
- Ran `npm run verify` once on the base commit (green, 176.8 s wall).
- Ran one additional full UI-suite pass at concurrency 8 (green, 94.9 s; the UI pass inside
  `verify` was 98.2 s), one temporary failure injection, one timeout injection, and three focused
  reproduction scripts for the findings below. The temporary edits were reverted; `git status` was
  clean before this file was added.
- Viewed the builder screenshots in `/Users/luca/Coding/Personal/noteforest/artifacts/ui-batch-a`,
  `ui-batch-b`, `ui-batch-v`, and `ui-settings-advanced` as **builder evidence**, not as my own
  reproduction.

## 2. Verdict and summary

The UI batches are a substantial, mostly well-tested integration. The shell C header, shrinking
and windowed tabs, icon-only view controls, the instant-save Settings shell, Page setup/margins/
preview/validation/scope/override, the advanced Page fields, the Export sheet states, the palette,
and Batch V's visual rules all work on their intended paths. Page/PDF parity is still green and no
schema, dependency, paginator, or print-compositor change was found.

I cannot accept the work yet because three S2 findings are reachable from ordinary UI gestures:

1. a modal overlay does not own the global shortcut/native-menu surface, so an open Export sheet
   can export a **different document** under the original document's filename;
2. a debounced document-scoped Page settings edit is bound to whichever document is active when it
   flushes, so switching tabs (or closing the document) can write the override to **another
   document** or silently report saved without a write;
3. a corrupt global `settings.json` is backed up but is then **overwritten by the next ordinary
   setting change**, while the warning still says the file is corrupt and the footer says Saved.

The new UI runner itself is mechanically sound: file isolation, exit code, failure output, group
selection, timeout kill, and default concurrency 8 all behaved as designed. Its evidence isolation
is not sound: several suites share and delete the same artifact directory, so screenshots and
evidence can disappear or be overwritten under the default parallel pool.

## 3. Findings

Severity definitions are the review checklist §9.1. No S1 was found.

| ID | Sev | Area | Location | Finding |
|---|---|---|---|---|
| F1 | **S2** | Shell/Export | `apps/desktop/src/renderer/src/App.tsx:296`, `:393`, `:404`, `:408`; `apps/desktop/src/renderer/src/export/export-flow.ts:301`, `:322`, `:373` | Global shortcuts and native-menu commands run while a modal/sheet is open; the Export sheet reads the active tab at Export time, not the document captured when it opened. A tab switch behind the sheet exports the other document under the first document's filename. |
| F2 | **S2** | Settings/scope | `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts:99`, `:367`, `:467`, `:540`; `apps/desktop/src/renderer/src/App.tsx:296` | A pending document-scoped write carries only `layer`; `writePending`/`apply` read the current package path and document id when the debounce/commit resolves. Switching tabs behind Settings writes the override to the newly active document; switching to no document drops the write while the outcome can still be `saved`. |
| F3 | **S2** | Settings/persistence | `apps/desktop/src/main/library.ts:1230`, `:1266`, `:1282` | A corrupt global settings file is backed up on read, but `writeSettings` merges into an empty/fallback raw object and overwrites it on the next ordinary change. The corrupt warning stays visible and the footer says Saved, so the state is both overwritten and misleading. The per-document map already refuses corrupt writes; the global store does not. |
| F4 | **S3** | Test infrastructure | `tests/ui/m4d2-export-ui.test.mjs:29`, `:199`; `tests/ui/ui-batch-a.test.mjs:18`; `tests/ui/m4e1-settings-platform.test.mjs:25`, `:201`; `tests/ui/m4d1-page-density.test.mjs:430` | Four suites share `artifacts/ui-batch-a`; `m4d2` recursively deletes it in `before`, `m4e1` writes the same `settings-no-document.png` as `ui-batch-a`, and `m4d1` writes `settings-page.png` there. Under the default 8-worker pool, evidence can be deleted, overwritten, or attributed to the wrong suite. Assertions do not fail, but evidence is not reproducible. |
| F5 | **S3** | Tab visual coverage | `tests/ui/ui-batch-v.test.mjs:319`, `apps/desktop/test/ui-batch-v-css.test.ts:72` | The 14-tab stress test proves widths, close size, `+`, no scroll, and overflow, but never renders a missing (`!`), locked, or dirty tab at the compact width. The status-icon rule is guarded only by a static CSS declaration check, so a rendering/markup regression could still hide the status while the CSS test stays green. |
| F6 | **S3** | Accessibility/focus | `tests/ui/m2-shell.test.mjs:184`, `apps/desktop/src/renderer/src/export/export-flow.ts:212`, `tests/ui/m4d2-export-ui.test.mjs:484` | Axe covers shell/palette/tree/delete dialog only; Settings and Export are not in the axe pass. Settings focus return is not asserted, and the "one job at a time" path only checks that one sheet remains. `openExportSheet` returns immediately when busy and never focuses the existing sheet, despite the comment. |
| F7 | **S3** | Test runner hardening | `tests/ui/run.mjs:26`, `:189`, `:193` | The 43-file list is hardcoded with no meta-test against `tests/ui/*.test.mjs`; a new suite can silently never run. `NOTEFOREST_UI_RUNNER` is set but unused. A timeout is reported only as `signal SIGKILL`, with no "timed out" message (the gate does fail correctly). |
| F8 | **S3** | Settings copy/state | `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx:159`, `:249`, `:555`; `tests/ui/ui-batch-b.test.mjs:895` | "Newer schema (read-only warning)" is inaccurate: the app writes and preserves the newer version. The footer shows "Saved" on first open with `saveState: idle`; the invalid-margin state repeats per-field and group messages (visible in the Batch B screenshot). These are copy/state polish issues, not data bugs. |
| F9 | **S3** | Settings close | `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx:288` | `requestClose` starts `flushPending()` and closes immediately. A commit/write failure after Done/Escape is only visible if Settings is reopened; the user sees a closed modal with no error. Quit is safe because the app waits on the write queue. |
| F10 | **S3** | Failure-path coverage | `tests/ui/ui-batch-b.test.mjs:353`, `:895`; `tests/ui/ui-settings-advanced.test.mjs:948`; `apps/desktop/test/page-settings-write.test.ts` | The commit-before-write failure contract is unit-tested with injected functions; the real UI tests cover only the success path. A size/orientation change blocked because the current margins would no longer fit has no UI test. The newer-settings and corrupt-document-map warning branches have no UI test. |

### F1 reproduction — Export sheet exports the wrong document

1. Open document A (`SENTINEL-ALPHA`) and document B (`SENTINEL-BETA`), with B active.
2. File → Export PDF…; choose a folder; leave the sheet at Configure.
3. Press `⌘1` (or File → a tab/overflow action). The sheet stays open; the active tab becomes A.
4. Click Export.
5. Observed: `Doc B.pdf` is written and contains `SENTINEL-ALPHA` only; the sheet's title/summary
   still describe B. The job used A's `packagePath` and A's snapshot.

Expected: an open modal owns the command surface (no tab switch, layout/mode change, create/close
command, or palette behind it), **or** the Export flow pins the package/title/settings captured at
sheet open and rejects a changed active document with a clear message. A wrong-document export can
overwrite a file with content from another note.

The same un-gated path lets `⌘K`, `⌘W`, `⌘N`, `⌘,`, native menu items, and other global commands run
behind Settings, Export, the palette, and dialogs. This is a single overlay-gating defect with
several manifestations; F1 and F2 are the two user-visible ones.

### F2 reproduction — document-scoped setting written to another document

1. Open documents A and B, with B active.
2. `⌘,` → Settings → This document; type `25` into the top margin (`300 ms` debounce).
3. Immediately press `⌘1` (the input keeps focus; the global handler still switches).
4. Observed in `document-settings.json`: the entry is `documentId: "doc-a"` with
   `setup.margins.top: 25`, although the value was typed while B was active.
5. Code path: if the tab is closed so `packagePath` becomes `null`, `writePending` returns before
   writing (`usePageSettingsController.ts:371`), but `commitThenWritePageSettings` then resolves
   `saved`; the footer can report Saved without a write.

Expected: every pending/immediate write records `{packagePath, documentId, scope}` at the moment
the edit starts; a later tab/document change either flushes to that identity or discards the pending
write with a visible message. A skipped write must never report `saved`.

### F3 reproduction — corrupt settings overwritten by a normal change

1. Put `{not json` in `NOTEFOREST_APP_SUPPORT/settings.json`; launch the app.
2. Open Settings; the corrupt warning and backup path appear.
3. Move the Page density slider once (a normal global change).
4. Observed: `settings.json` is now valid JSON with density `0.95`; the warning is still visible;
   the footer says Saved; the `settings.corrupt-<timestamp>.json` backup exists.

Expected: mirror `saveDocumentSettings`, which refuses an implicit write while the map is corrupt
(`apps/desktop/src/main/document-settings.ts:156`). A corrupt global file should be backed up and
left alone until the user explicitly presses Reset (or equivalent), and the warning/status should
not disagree after a successful write. The backup is a mitigating factor, but the checklist rule is
"corrupt settings are never silently reset and overwritten" (`docs/review-checklist.md:832`).

## 4. Acceptance criteria

Batch A/B/C/V criteria are copied in substance. Evidence is a test, code path, screenshot, or
reproduction. "Builder" screenshots are not my reproduction.

### Batch A

| # | Criterion | Evidence | Result |
|---|---|---|---|
| A1 | C canvas header fixed/edge-to-edge, undo/redo left, icon-only layout/mode right; toolbar only tabs/`+`/overflow/zoom/palette | `ui-batch-a:97`; `v0-shell-frame:136`; builder `expanded-shell/page-header/continuous-header.png`; live UI pass | Pass |
| A2 | No global close; tabs shrink/no scroll; `+` after last; overflow works | `ui-batch-a:217`; `ui-batch-v:319`; `m2-shell:86`; 14-tab stress | Pass |
| A3 | Zoom selector gone; minus/percentage/plus work and stay layout-aware | `ui-batch-a:157-165`; `m2-view:49`; `view-zoom.test.ts`; page zoom parity in `m4b1`/`r1b` | Pass |
| A4 | Library/Topics active rows use 1 px accent ring, not a left stripe | `ui-batch-a:330-355`; `ui-batch-v` CSS guard; builder screenshots | Pass |
| A5 | Settings instant save, status/Retry/Done, no Apply/Cancel/dirty dots; scope/override, no-document/read-only, future-page behavior; Page density not regressed | `ui-batch-a:351`; `ui-batch-b:204`, `:255`, `:992`; `m4e1:168`, `:227`, `:334`, `:364`; **F2/F3** | **Fail** (paths pass; cross-document write and corrupt-write lifecycle fail) |
| A6 | Export sheet all states, no native save dialog, in-sheet overwrite, progress/cancel, done/failed/cancelled, all warnings; PDF output unchanged | `m4d2:218`, `:317`, `:370`, `:409`, `:463`, `:522`, `:578`, `:615`; `m4c1`/`m4c2`/`m4c3`; **F1** | **Fail** (states/PDF pass; document identity fails) |
| A7 | Palette groups/search/empty/keyboard/disabled reason/read mode; no dead entries | `ui-batch-a:584`; `m2-shell:147`; `m4b1a2` native-menu/palette gating | Pass |
| A8 | Page/PDF output and Page/Page Edit behavior unchanged; no schema/dependency; no fake controls | `m4c1`/`m4c2`/`m4c3` green; `package.json` diff has no dependency; settings schema v2/map v1 unchanged; Settings IA has only real pages | Pass |
| A9 | Targeted tests, screenshots, one `verify:fast`, report maps criteria | Batch A report; `npm run verify` green (this review) | Pass |

### Batch B

| # | Criterion | Evidence | Result |
|---|---|---|---|
| B1 | Page setup real/instant-saved/scoped/validated; mm/All sides; invalid error without silent reset | `ui-batch-b:675`, `:756`, `:895`; `page-setup.test.ts` | Pass |
| B2 | Scope/override dots, Use global, equal-to-global auto-remove, no write on scope switch, no-document/read-only | `ui-batch-b:204`, `:255`, `:992`; **F2** for a tab/document change during a pending write | **Fail** (intended paths pass; write identity fails) |
| B3 | Preset Compact/Comfortable/Custom + density 60–120; advanced typography hidden (Batch B scope) | `ui-batch-b:479`; `m4d1`; Batch C now exposes advanced fields as its brief requires | Pass |
| B4 | Live preview reflects draft/scope, invalid/loading states | `ui-batch-b:675`, `:756`, `:895`; `PageSettingsPreview` uses `usePageModel` | Pass |
| B5 | Page Edit commits before geometry/density; failure blocks | `ui-batch-b:353`; `page-settings-write.test.ts`; failure path is unit-only (F10) | Pass with coverage caveat |
| B6 | Page Read/Edit/measurement/PDF same settings, parity; no PDF change for same settings | `ui-batch-b:581`; `r1b:203`; `m4c2` advanced/density cases; `m4c1`; `m4c3` | Pass |
| B7 | Tests/screenshots/`verify:fast`; report maps criteria | Batch B report; verify green | Pass |

### Batch C

| # | Criterion | Evidence | Result |
|---|---|---|---|
| C1 | `maxCardWidth` first-class; advanced typography/layout under correct groups; hidden/engine values hidden | `ui-settings-advanced:200`; `PageAdvancedSettings.tsx`; screenshot `max-card-width.png`, `advanced-layout.png` | Pass |
| C2 | Frozen ranges/units, cross-field validation inline, no silent clamp/reset | `ui-settings-advanced:560`; `page-advanced.test.ts`; names in `PAGE_THEME_FIELD_SPECS` match the inventory | Pass |
| C3 | Preset/Custom explicit; advanced values not silently discarded | `ui-settings-advanced:646`; `ui-batch-b:479`; warning/confirm/cancel | Pass |
| C4 | Advanced fields participate in scope/override/Use global/equal-to-global/no-document/read-only | `ui-settings-advanced:701`, `:857`; **F2** for a pending write across a tab change | **Fail** (intended paths pass; write identity fails) |
| C5 | Live preview and Page Read/Edit/PDF parity; no PDF change for same settings | `ui-settings-advanced:348`, `:454`; `print-parity.test.ts`; `m4c2:301` | Pass |
| C6 | Page Edit commit before advanced write; failure blocks | `ui-settings-advanced:948`; unit ordering test; failure path unit-only (F10) | Pass with coverage caveat |
| C7 | Tests/screenshots/`verify:fast`; report maps criteria | Batch C report; verify green | Pass |

### Batch V

| # | Criterion | Evidence | Result |
|---|---|---|---|
| V1 | One Settings width for every page; viewport-only responsive width | `ui-batch-v:105`; 980 × 580 General/Page/Editor; 900 px viewport rule; builder screenshots | Pass |
| V2 | Toast width/padding/radius/typography/icons match tokens; behavior unchanged | `ui-batch-v:205`; computed styles for success/info/error, 3-visible, no focus steal; screenshots | Pass |
| V3 | Status icons never distort; active expands, inactive compact, status visible, `+` after last, no scroll, overflow works | `ui-batch-v:319`; 14-tab stress; static icon guard `ui-batch-v-css.test.ts:72`; status icons not rendered at compact width (F5) | Pass with evidence caveat |
| V4 | Chapter title 8 px (6 px compact); no Page/PDF change | `ui-batch-v:479`; `design-tokens-continuous.md`; `m4c1`/`m4c3` green | Pass |
| V5 | No behavior/schema/dependency change beyond these visuals; tests/screenshots/`verify:fast` | Diff review; no new dependency; `m4c1`/`m4c3`; Batch V report | Pass |

## 5. Test-infrastructure annex

### 5.1 Runner mechanics

`tests/ui/run.mjs` starts one `node --test` process per file through a worker pool. `--group`
selects `all|core|shell|settings|page|anchors|images`; `selectedFiles` de-duplicates overlap;
`--concurrency` and `NOTEFOREST_UI_CONCURRENCY` override the default
`max(1, min(8, availableParallelism() - 2))`; `--fail-fast`, `--verbose`, `--list`, and
`NOTEFOREST_UI_TIMEOUT_MS` are supported. A failure prints the child TAP output and sets exit code
1; a timeout sends `SIGKILL` and fails the suite.

Verified:

- `--list`: shell 5, settings 5, anchors 13, images 4, page 16, core 10, all 43; FILES has 43
  unique entries; every group entry exists in FILES.
- default concurrency on this 10-core machine: 8; two full runs green (94.9 s and 98.2 s total).
- failure injection: a temporary assertion in `m2-view` produced `FAIL m2-view.test.mjs`, the TAP
  failure text, exit 1; reverted.
- timeout: `NOTEFOREST_UI_TIMEOUT_MS=800 node tests/ui/run.mjs --group shell --concurrency 1
  --fail-fast` produced `FAIL ... signal SIGKILL`, 0.8 s, exit 1; no Electron process related to
  this worktree remained after a second.
- isolation: 42 suites use distinct `artifacts/<name>-temp` roots; the packaged export stages its
  own `mkdtemp` directory. Library and app-support roots are distinct per launch.

The runner does not build; `verify` relies on the build performed by `verify:fast`'s e2e step.
`npm run test:ui` builds explicitly.

### 5.2 Suite → surface/acceptance map

| Suite | Surface / criteria | Tests | Notes |
|---|---|---:|---|
| `m2-shell` | Shell frame, session restore, axe, parent-relative layout | 4 | Axe covers shell/palette/tree/delete dialog only |
| `m2-view` | Zoom/fit/focus, token geometry | 2 | Keyboard zoom; button clicks not asserted |
| `v0-shell-frame` | Titlebar/toolbar/sidebar/panel/status/page-toolbar | 5 | V0 visual contract |
| `m3-anchor-callout-layout` | Anchored callout layout/C trunk | 6 | Anchor family |
| `m3-anchor-callout-stacking` | Callout stacking/undo/reopen | 6 | Anchor family |
| `m3-anchor-callout-placement-undo` | Text undo stack across resize | 1 | Anchor family |
| `m3-anchor-outline` | Outline rows/cycles/hidden callouts | 1 | Anchor family |
| `m3-formula-anchor` | Block formula anchor | 1 | Anchor family |
| `m3-formula-term` | Formula term/ambiguity | 1 | Anchor family |
| `m3-formula-term-geometry` | Term marker/leader | 1 | Anchor family |
| `m3-code-anchor` | Code-range anchor | 1 | Anchor family |
| `m3-reference` | Reference edges/home/move/delete disclosure | 4 | DAG behavior |
| `m3-repair` | Anchor health/repair | 4 | Broken-anchor UX |
| `m3f1-split-merge` | Anchored split/merge | 1 | Anchor family |
| `m3h3-live-health` | Live health/remove idle | 2 | Anchor health |
| `m3h5-leaf-delete` | Leaf-delete disclosure | 2 | Delete UX |
| `m3c3b1-image` | Image insert/persist/placeholder/drop | 2 | Image pipeline |
| `m3c3b2-image-anchors` | Region/point anchors, resize/reload | 3 | Image anchors |
| `m3c3b3-image-integrity` | Missing/hash/legacy/outline | 4 | Image integrity |
| `m3c3b4-image-lifecycle` | Per-image actions/markers/cross-doc paste | 3 | Image lifecycle |
| `m4b1-page-view` | Page Read, navigation, chapters, errors, session | 9 | Page surface |
| `m4b1a2-read-mode-gating` | Read-mode shell/menu/palette/context gating | 2 | Uses fixed `waitForTimeout(120)` waits |
| `m4b1b1-page-edit-overlay` | Page Edit overlay/commit/schema/errors | 8 | Page Edit |
| `r1b-page-settings` | Compact default, A5/Letter override, Page Edit/session | 4 | Page settings |
| `r2a-page-arrows-cleanup` | Page arrows/chrome cleanup | 3 | R2 geometry |
| `r2b-page-packing` | Beside packing/A/B2/stacked | 3 | R2 geometry |
| `r2d-page-edge-style` | Orthogonal routes/cross-page | 4 | R2 geometry |
| `r2e-page-tree` | Tree columns/Page Edit/stacked | 4 | R2 geometry |
| `r2f-page-edge-topology` | Shared trunks/nested | 2 | R2 topology |
| `r2g-page-trunk-continuity` | Trunk continuity/read-edit parity | 2 | R2 topology |
| `r2i-page-subtree-wrap` | Subtree-aware wrap/atomic groups | 6 | R2 wrap |
| `r2j-page-callout-modes` | Mode A/B2/stacked/nested/page edges | 5 | R2 topology |
| `m4c1-print-compositor` | Print model parity/computed metrics | 6 | PDF foundation |
| `m4c2-pdf-export` | Continuous/A5/density/advanced/Letter/overwrite/cancel/preflight/missing asset | 9 | Export pipeline |
| `m4c3-pdf-gate` | 50+ page A4 gate, missing dimensioned asset, 300-block timing | 3 | PDF gate |
| `m4c3-packaged-export` | Staged packaged runtime export/inspect | 1 | Closest asar harness |
| `m4d2-export-ui` | Configure/Page header/cancel/preflight/cancel/overwrite/warnings/no document | 8 | Batch A export sheet |
| `m4d1-page-density` | Real-DOM 60/120, Settings slider/override, every step | 3 | Density lens |
| `m4e1-settings-platform` | No document, durable override, corrupt backup, failed write/retry | 4 | Settings platform |
| `ui-batch-a` | C header/tabs/zoom/ring/Settings shell/palette | 5 | Batch A |
| `ui-batch-b` | Page setup/margins/scope/preview/density/Page Edit/parity/read-only | 9 | Batch B |
| `ui-settings-advanced` | Advanced fields/validation/preset/scope/preview/Page Edit | 8 | Batch C |
| `ui-batch-v` | Settings width/toast/tabs/inset | 4 | Batch V |

### 5.3 Weak, duplicated, missing coverage

**Weak (can pass while the behavior is wrong or only partially evidenced):**

- `m4e1:334` only proves the corrupt backup/warning; it never attempts a normal write, so it
  cannot catch F3. `m4e1:364` proves a failed write does; good.
- `ui-batch-v:319` + `ui-batch-v-css.test.ts:72` prove the status-icon CSS declarations, not a
  rendered missing/locked/dirty compact tab (F5).
- `ui-batch-b:353` and `ui-settings-advanced:948` prove the Page Edit success path; the rejected
  commit blocking a real write is only unit-injected (F10).
- `ui-batch-b:895` proves invalid margins; the "new page size/orientation would invalidate current
  margins" path (`canChangeSetup`) has no UI test.
- `m2-shell:184-236` axe pass excludes Settings and Export; Settings has only a role check, Export
  only a Page-header focus check (F6).
- The footer `Saved / Saving… / Couldn't save` text is only indirectly covered by `saveState`; no
  suite asserts the initial Saved state, the Saving label, or the full error copy.
- `ui-batch-v` tab tests use 2/8/14 tabs; the product-owner risk window of 10–12 is not sampled.

**Duplicated or overlapping (launch/setup overlap, not duplicate assertions):**

- Shell: `v0-shell-frame`, `m2-shell`, `m2-view`, `ui-batch-a`, `ui-batch-v` all launch the shell;
  their assertions are distinct (V0 frame, session/axe, zoom, C header/settings/palette, V visuals).
- Settings: `m4e1`, `m4d1`, `r1b`, `ui-batch-b`, `ui-settings-advanced` launch settings; `m4d1` and
  `ui-batch-b` both sample density 60/120 but assert different surfaces (real DOM/page count vs
  preview/override). No duplicated assertion worth removing was found.
- Page edges/callouts: `r2a`–`r2j` share the Page surface but assert distinct geometry/topology;
  the README's consolidation note is honest and this review did not find an assertion duplicate.
- Anchors/images/PDF each have distinct family coverage; no suite is a copy of another.
- **Artifact-name duplicates are real and harmful** (F4), even though the assertions differ:
  `settings-no-document.png` is written by both `ui-batch-a` and `m4e1`; `m4d1` writes
  `settings-page.png` into the same directory; `m4d2` deletes the whole directory.

**Missing (no suite proves the behavior):**

- Modal/sheet/dialog ownership of global shortcuts and native-menu commands (F1/F2).
- Document identity pinning for pending/immediate settings writes, including the no-document drop
  (F2).
- Corrupt global settings write refusal and warning/status reconciliation (F3).
- Real UI failure for Page Edit commit blocking a Page write (F10).
- Size/orientation rejection when the current margins would not fit (F10).
- Newer-settings warning and corrupt document-map warning branches; Reset settings action.
- Tab drag reorder, middle-click close, and keyboard Delete/⌘W preservation in one suite. I
  manually confirmed Delete and middle-click close work; drag reorder is code-preserved but not
  covered.
- Settings/Export axe, focus trap, and focus return (Settings); menu-triggered "focus existing
  export sheet".
- Settings Export-page button flow (opens the sheet, flushes the pending edit).
- A meta-test that `FILES` equals `tests/ui/*.test.mjs`, and a timeout message/cleanup assertion.
- Runner behavior at 1–7 workers (only 8 and a 1-worker failure injection were run here).

## 6. Checks run

| Check | Result | Real time |
|---|---|---:|
| `npm ci` in the review worktree | 199 packages, 0 vulnerabilities | 2 s (warm cache) |
| `npm run check:boundaries` (in verify) | 176 files, 872 imports, 16 rules | pass |
| `npm run typecheck` (in verify) | all workspaces clean | pass |
| `npm test` (in verify) | 107 files / 1075 tests passed | 8.00 s |
| `npm run e2e` (in verify) | 16/16 passed | 45.23 s node-test (suite 37.10 s) |
| `npm run test:recovery:run` | 14/14 passed | 17.43 s |
| `node tests/ui/run.mjs` (in verify) | 43/43 passed, 0 pageErrors | 98.2 s |
| **`npm run verify` total** | **exit 0** | **176.80 s** |
| Full UI runner, second pass at concurrency 8 | 43/43 passed | 94.9 s |
| `node tests/ui/run.mjs --list` | 43 unique files; groups correct | <1 s |
| Temporary failure injection (`m2-view`) | `FAIL`, TAP captured, exit 1; reverted | 8.8 s |
| Timeout injection (`NOTEFOREST_UI_TIMEOUT_MS=800`, 1 worker) | `FAIL ... signal SIGKILL`, exit 1 | 0.8 s |
| F1 wrong-document export repro | reproduced | script run |
| F2 cross-document settings write repro | reproduced | script run |
| F3 corrupt-settings overwrite repro | reproduced | script run |

The baseline is green, with no pageErrors. The 8-worker pool runs in about 95–98 s, matching the
runner README's 96.9 s claim. The unit suite was slower than the brief's 2.7 s because this worktree
had a cold Vitest cache.

## 7. What was not verified

- Product-owner visual and VoiceOver judgement: tab windowing at 10–14 tabs, centered non-Page
  Settings content, toast appearance, and the Continuous fit-width 0.91 trade-off. These are
  product decisions, not Sentinel calls.
- A signed/notarized packaged app. `m4c3-packaged-export` stages the built `out/` with
  `pdfjs-dist`; it is the closest harness, not a real asar/notarized build.
- The real macOS folder picker. Tests mock `showOpenDialog`; the dialog guard only proves no save
  dialog and no unmocked decision dialog.
- The 1–7 worker matrix (the builder reports green; this review ran 8 and a 1-worker failure case).
- Cross-document margin fallback: a global size/orientation change can invalidate another
  document's stored margin override and the model then falls back to default margins. The builder
  reports this as a known residual; I did not reproduce the cross-document case.
- Drag-reorder of tabs (code preserved; no suite). Delete/middle-click close were reproduced
  manually with the real app.
- Tab overflow menu with more tabs than fit vertically (no scroll; edge case).
- The product-owner PDF visual/Notability check remains open from the earlier gates.

## 8. Nits (S4, non-blocking)

- `tests/ui/run.mjs:189` sets `NOTEFOREST_UI_RUNNER` but no suite reads it.
- `m2-shell` copies `axe.min.js` into the shared `apps/desktop/out/renderer` build while other
  suites run in parallel; harmless but not immutable.
- Several UI suites opt into a visible window (`m3c3b*`, `m4d2` Page header). The DoD says the
  visual suite is the only visible-window exception; under the parallel pool a visible window can
  steal focus. No failure was observed.
- `m4b1a2` uses fixed `waitForTimeout(120)` waits; pre-existing, but the suite was touched by the
  Batch A read-mode work.
- The tab overflow context menu has no max-height/scroll; a very large tab set could put entries
  below the viewport.
- "Newer schema (read-only warning)" copy (F8).

## 9. Open questions for the product owner

1. Is tab windowing acceptable at 10–14 tabs (active + neighbours visible, the rest only in the
   overflow menu)? Hidden tabs' status icons are not visible until the tab is activated.
2. Is the 980 px Settings width and the centered non-Page content column the desired visual result,
   including at the 960 px native minimum where the three-column Page layout is tighter than 980?
3. Is the Continuous fit-width change from 0.92 to 0.91 after the 8 px inset acceptable? It is the
   expected consequence of the requested inset, but it is user-visible.
4. Density remains a lens over the selected preset; changing density does not force Custom
   (Q-11). Confirm this is the intended behavior.
5. When a global page size/orientation change makes another document's stored margin override
   impossible, should the app block the global change with a preflight, warn, or keep the existing
   fallback? This is a product decision; the current code falls back silently for that document.
6. Should "This document" be the Settings default page, or General? The current build opens Page.
7. Is the per-document Continuous page (view zoom) intended to stay despite the master plan's
   "remove the per-document Continuous settings page" working decision? The page now edits view
   state only, not `settings.json`.
8. The product-owner visual/VoiceOver pass is still required for Batch V and the new Settings
   surfaces.

## 10. Recommended next step

1. Fix F1/F2 with one overlay-command gate: while any modal, sheet, palette, or dialog is open,
   global shortcuts and native-menu commands must not switch tabs/layout/mode, create/close
   documents, or run commands behind it. Pin the Export sheet's package/title/settings to the
   document captured when it opened and validate before start.
2. Pin pending/immediate Page settings writes to `{packagePath, documentId, scope}` captured at the
   start; discard or flush on identity change and never return `saved` for a skipped write. Add
   regressions for a tab switch during the margin debounce and during Export Configure.
3. Make the global settings store refuse implicit writes while the file is corrupt, mirroring
   `saveDocumentSettings`; require the explicit Reset action, and clear/reconcile the warning after
   a successful reset. Add a UI regression.
4. Fix the test-evidence isolation: unique screenshot directories per suite, no recursive delete of
   another suite's artifact directory, and a meta-test that the runner's `FILES` covers
   `tests/ui/*.test.mjs`.
5. Add the S3 evidence: rendered compact status icons, Settings/Export axe and focus, real Page
   Edit commit rejection, size/orientation margin rejection, newer/document-map warning branches,
   and the Settings Export flow.
6. Re-run one full `npm run verify`, then a targeted Sentinel re-check of F1–F3; the product-owner
   visual/VoiceOver pass can run in parallel, and the next settings block should not start until
   the S2 fixes are accepted.
