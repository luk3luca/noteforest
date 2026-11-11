# Builder report — UI Sentinel fixes (overlay command gate, write identity, corrupt settings, test evidence)

- Role: Implementer / Builder
- Date: 11 November 2026
- Base: `main` at `dd22969` (UI Batches A/B/C/V at `a44a257`, review `1a8c1af`)
- Worktree: `/Users/luca/.t3/worktrees/noteforest/t3-19bfe10f-e087c17c96db4ff0`
- Branch: `t3/ui-sentinel-fixes`
- Brief: `docs/tasks/ui-sentinel-fixes.md`; review: `docs/reviews/ui-post-merge-review.md` (F1–F3, F4, F7)
- Heads: first batch `38daf71`; **correction head is this commit** (exact SHA in the handoff message),
  which adds the immediate-write target correction described in §1 “F2 correction”.

## 1. Summary

One batch fixes the three S2 findings reachable from ordinary gestures and the two S3 test-infrastructure
gaps that made their evidence unreliable. No schema, dependency, spec, UX, ADR, paginator, or print
change.

### F1 — overlay command ownership and export identity

- New single predicate `activeOverlayOwner()` / `overlayOwnsCommands()`
  (`apps/desktop/src/renderer/src/shell/overlay-owner.ts`) covering `useShell.dialog !== null`,
  `useShell.paletteOpen`, and `useExportUi.status !== 'idle'` (configure, overwrite, running, and the
  terminal done/failed/cancelled sheet all own the surface).
- The renderer `keydown` handler returns before any app command while a modal owns the surface, and
  the native-menu `dispatch` path (now module-level, shared by `window.noteforest.onMenu`, the
  renderer shortcut path, and a test bridge) ignores every `MenuCommand`. Context menus and the Page
  Edit overlay are untouched. Native roles (cut/copy/paste/select-all/quit) are OS responder actions
  and keep working; the review's reproduction paths (`⌘1`, `Ctrl+Tab`, native close-tab) do nothing.
- One documented exception: while the **palette** owns the surface, `⌘K` is the palette's own toggle
  (open/close contract from Batch A); every other command stays blocked behind it.
- `ExportUiState` now records `packagePath` and `documentTitle` at `openExportSheet`. `startExport`,
  `confirmReplaceExport`/`runExport`, and the Page Edit commit use that pinned path; a pinned document
  that is no longer open fails with `document-not-open` ("…no longer open… no file was written") and
  writes nothing. The main-process snapshot contract is unchanged (keyed by `packagePath`).
- Settings → Export is now a genuine nested surface: Settings stays open under the Export sheet,
  commands stay blocked while either is open, and closing Export returns to a still-gated Settings.
  This is a deliberate small behavior change from Batch A (Settings used to close first), required by
  the F1 nesting criterion.
- Test-only bridges: `dispatchMenuCommand` (exact native-menu delivery path), `overlayOwner`,
  `activateTab`, and `closePath` — all under `window.__noteforestTest`, no product API.

### F2 — Page-settings write identity

- New `PageSettingsWriteTarget { scope, packagePath, documentId }` and pure helpers
  (`settings/page-settings-target.ts`). Every debounced edit captures the target at schedule time;
  every immediate write captures it when the write starts.
- `writePending`, `applyPending`, `runImmediate`/`executeImmediate`, `retry`, and `flushPending` use
  the captured target, never live refs. A document-scoped write whose document is gone is skipped
  (no store write, no flush, no `saved`), clears the retry attempt, and surfaces
  "The document closed before this change was saved. Nothing was written." in the footer; `Retry`
  cannot turn it into `Saved`. Close/quit proceed.
- `commitThenWritePageSettings` keeps its commit-before-write ordering and gains a `targetGone` check
  before and after the commit plus a `target-gone` outcome when `apply` refuses. A scope switch still
  flushes on the layer that was typed on.

#### F2 correction — immediate write target captured before the flush

An integration review found that `runImmediate` captured its target **after** `await flushPending()`.
The flush can await a Page Edit commit and the settings IPC, so a tab/layer change in that window
retargeted an immediate size/orientation/preset/Use-global/reset write to the newly active document —
the same cross-document F2 class this batch fixes. Fixed by extracting
`runImmediatePageSettingsWrite` in `settings/page-settings-target.ts`: it captures the target first,
then flushes, then executes the captured target. `usePageSettingsController.runImmediate` now delegates
to it; `executeImmediate` still re-checks the captured target before and after the commit, so a
document that closes during the flush is still reported as “not saved”.

A deterministic UI repro is not reliable here (the defect window is exactly a real commit/IPC
round-trip), so the regression is the unit contract in `page-settings-target.test.ts`: “captures before
the flush and executes the captured target unchanged” switches the live identity to another document
inside `flushPending` and asserts the original target is executed. The existing UI F2 tests (tab switch
during the debounce, closed document) still cover the user paths.

### F3 — corrupt global settings

- `writeSettings` now re-reads `settings.json` at write time and refuses an implicit write when the
  file exists but cannot be read or parsed (mirrors `saveDocumentSettings`). The corrupt bytes and the
  existing `settings.corrupt-<timestamp>.json` backup are untouched; the refusal is a real
  `{ ok: false, message }`, so the footer shows “Couldn’t save” and the warning stays visible.
- New explicit path `settings:reset` IPC → `library.resetSettings()` → preload/shared API →
  `useSettingsStore.resetSettingsToDefaults()`, used only by the Settings “Reset settings” button.
  It atomically replaces the file with product defaults, keeps the corrupt backup, clears the warning
  only after the write succeeded, and later ordinary changes save again. Dismissing the warning never
  implies a successful write.

### F4 — evidence isolation

- One screenshot directory per suite: `ui-batch-a` stays `artifacts/ui-batch-a`; `m4e1` →
  `artifacts/m4e1-settings`; `m4d1` → `artifacts/m4d1-page-density` (also folded the old `m4e2`
  screenshot into the same suite directory); `m4d2` → `artifacts/m4d2-export-ui` (its `before` now
  deletes only its own directory). The new regression suite owns
  `artifacts/ui-overlay-command-gate` (nested Settings/Export and target-closed screenshots).

### F7 — runner hardening

- `FILES`/`GROUPS` moved to `tests/ui/suites.mjs` (pure data, no side effects) and imported by
  `run.mjs`. `apps/desktop/test/ui-suite-list.test.ts` asserts the list equals `tests/ui/*.test.mjs`
  exactly, has no duplicates, and every group entry is in the list.
- Removed the unused `NOTEFOREST_UI_RUNNER` env value. Timeouts now print
  `timed out after N s` (pure `formatTimeoutReason`/`formatSuiteResult`, unit-tested) and still kill
  the child, fail the suite, and exit 1. `--list`, groups, de-duplication, `--fail-fast`,
  `--verbose`, and the default concurrency are unchanged.

## 2. Files changed

Product:
- `apps/desktop/src/renderer/src/shell/overlay-owner.ts` (new)
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/export/export-flow.ts`
- `apps/desktop/src/renderer/src/settings/page-settings-target.ts` (new; also owns the corrected
  `runImmediatePageSettingsWrite` capture-before-flush contract)
- `apps/desktop/src/renderer/src/settings/page-settings-write.ts`
- `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts`
- `apps/desktop/src/renderer/src/state/settings.ts`
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx`
- `apps/desktop/src/renderer/src/global.d.ts`
- `apps/desktop/src/main/library.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/shared/api.ts`

Tests and evidence:
- `apps/desktop/test/page-settings-target.test.ts` (new)
- `apps/desktop/test/page-settings-write.test.ts`
- `apps/desktop/test/settings.test.ts`
- `apps/desktop/test/settings-store.test.ts`
- `apps/desktop/test/ui-suite-list.test.ts` (new)
- `tests/ui/suites.mjs` (new)
- `tests/ui/run.mjs`
- `tests/ui/ui-overlay-command-gate.test.mjs` (new)
- `tests/ui/m4e1-settings-platform.test.mjs`
- `tests/ui/m4d1-page-density.test.mjs`
- `tests/ui/m4d2-export-ui.test.mjs`
- `tests/ui/README.md`
- `docs/reports/ui-sentinel-fixes.md` (this report)

No existing assertion was weakened or deleted. Two existing expectations were made stricter/adjusted
to the new required behavior: `ui-batch-a`'s palette `⌘K` close remains valid (palette-local toggle),
and the corrupt-settings `m4e1` test now additionally proves refusal + reset.

## 3. Checks run (real timings)

| Check | Result | Real time |
|---|---|---:|
| `npm run check:boundaries` (in verify) | 178 files, 877 imports, 16 rules | pass |
| `npm run typecheck` (in verify) | all workspaces clean | pass |
| `npm test` (in verify on `38daf71`) | 109 files / 1096 tests passed; after the correction 109 files / **1099** tests | 2.68 s |
| `npm run e2e` (in verify) | 16/16 passed | 44.03 s node-test |
| `npm run test:recovery:run` (in verify) | 14/14 passed | 17.46 s |
| UI runner, default pool 8 (in verify) | 44/44 passed, 0 pageErrors | 95.8 s |
| `npm run verify` total (on `38daf71`, before the F2 correction) | **exit 0** | **166.35 s (2:46.35)** |
| UI run #1 at default concurrency (explicit) | 44/44 passed | 95.5 s |
| UI run #2 at default concurrency (explicit) | 44/44 passed | 95.4 s |
| Evidence coexistence after the two runs | `ui-batch-a` 7 files, `m4e1-settings` 1, `m4d1-page-density` 3, `m4d2-export-ui` 6, `ui-overlay-command-gate` 3 | pass |
| New suite `ui-overlay-command-gate` alone | 7/7 passed | 14.9 s |
| `m4e1-settings-platform` alone | 4/4 passed | 12.1 s |
| Timeout injection (`NOTEFOREST_UI_TIMEOUT_MS=800`, `--concurrency 1 --fail-fast`) | `FAIL m2-view.test.mjs (0.8s, timed out after 0.8 s)`, exit 1 | 0.8 s |
| Targeted impacted suites while working (batch A/B, batch V/C, m4d1, m4d2, m2-shell, m4b1a2, m4b1b1, r1b) | all passed | — |
| **Correction:** `npm run typecheck` | clean | — |
| **Correction:** `npx vitest run` page-settings-target/-write, settings, settings-store, ui-suite-list | 5 files / 53 tests | 0.24 s |
| **Correction:** `npm run verify:fast` | exit 0; boundaries 178/877, unit 109 files / **1099** tests, e2e 16/16 | 52.80 s |
| **Correction:** `ui-overlay-command-gate` + `m4e1-settings-platform` | 11/11 tests (7 + 4) | — |
| Full `npm run verify` after the correction | intentionally **not re-run**; integration runs it on this head | — |

## 4. Acceptance criteria

| Criterion | Result | Evidence |
|---|---|---|
| Export open for B: `⌘1`, `Ctrl+Tab`, native close/tab command do not change the active tab; Export writes B’s content to B’s filename. If B closes, Export fails clearly and writes nothing. | Pass | `ui-overlay-command-gate` › “pins Export to the document it opened for…” (asserts pinned `packagePath`, PDF text contains only BETA-MARKER, filename `Overlay Beta.pdf`, no command changes the snapshot) and “fails a pinned export clearly…” (`document-not-open`, empty output directory). |
| With Settings open, tab/layout/mode/palette/new/close/save/reopen/open/export/sidebar commands and zoom keys do nothing; typing, Escape/Done, palette row execution, native cut/copy/paste/quit keep working. | Pass | `ui-overlay-command-gate` › “keeps Settings, shortcut keys, and native menu commands behind Settings” (⌘1/2/3/E/K/W/N/„, zoom, focus, ⌘⇧E, five native menu commands; margin typing saves; Edit role items `cut/copy/paste/selectall` and app-menu `quit` remain enabled) and “gates the command channel behind the palette while its own rows run” (arrow/Enter/row execution, palette-local ⌘K toggle, Escape). |
| A document-scoped margin/theme/density edit followed by a tab/document change during the debounce lands on the typed document or is discarded with a visible “not saved” state; never another document, never `saved` without a write. | Pass | `ui-overlay-command-gate` › “writes a debounced document edit to the document where it was typed” (B override `margins.top: 25`, A has no entry, footer saved) and “…reports a visible not-saved state…” (error footer with the closed-target message, no `26` written anywhere, Retry keeps the error, Done closes). Unit: `page-settings-target.test.ts` (6 target tests + 3 immediate capture-before-flush tests, including the correction), `page-settings-write.test.ts` (+3 skipped-target cases). |
| Corrupt global `settings.json` is not overwritten by an ordinary change (bytes unchanged, warning and backup intact, footer not Saved); explicit Reset replaces it with defaults, clears the warning, later changes save. | Pass | `m4e1-settings-platform` › “backs up a corrupt settings.json and warns in Settings (S2-5)” extended: slider change → status `error` + `/corrupt/`, bytes and backup unchanged, warning visible; Reset → warning detached, footer saved, valid schema-2 defaults, backup kept; next slider change writes `0.95`. Unit: `settings.test.ts` (refusal, corruption after bootstrap, reset + backup) and `settings-store.test.ts` (warning clears only on reset success, refused write never saved). |
| Four evidence directories distinct and coexist after a parallel run; no cross-suite delete. | Pass | `ui-suite-list.test.ts` static guard (one directory per suite, no other suite names `ui-batch-a`); two explicit 44/44 runs at concurrency 8 left all four directories with their own files (see §3). |
| Runner meta-test fails if a suite is added/removed without `suites.mjs`; timeout prints an explicit reason and fails the gate. | Pass | `ui-suite-list.test.ts` compares `FILES` to `tests/ui/*.test.mjs` exactly; timeout injection prints `timed out after 0.8 s` and exits 1; formatter unit tests cover pass/exit/signal/timeout lines. |
| Regressions: new UI test F1/F2, extended `m4e1` F3, unit tests corrupt-write + reset and write-target (including the immediate capture-before-flush contract), runner meta/formatter. | Pass | Files in §2; unit 109 files / 1099 tests after the correction and UI 44/44 above. |
| `npm run verify` exit 0 with real timings; UI 43+ suites at the default pool, no pageErrors; no existing assertion weakened/deleted. | Pass | Final verify exit 0, 166.35 s, 44/44 UI, 0 pageErrors; diff review shows only additions/stricter expectations. |

## 5. Open questions / risks

- **Settings → Export nesting is a behavior change.** Batch A closed Settings before opening the
  Export sheet; F1’s nesting criterion requires Settings to stay open underneath. The new UI test
  proves the gate and the return to Settings; the product-owner visual/VoiceOver pass should confirm
  the stacked modals look right (focus/axe for Settings/Export remains tracked F6, S3).
- **Palette `⌘K` while the palette is open** is treated as the palette’s own close toggle (its
  documented open/close contract). Every other command is blocked behind the palette. If the product
  owner wants `⌘K` inert even on its own surface, it is a one-line predicate change plus the
  `ui-batch-a` expectation.
- **F3 refusal race:** the check and the atomic write are one queued read-then-write, but a file
  corrupted between the read and the rename is outside the check. This mirrors the per-document map
  behavior; no fs lock is introduced (out of scope).
- **Settings closed during a skipped write:** when Settings is already closed, the “not saved” message
  has no surface. That is the tracked F9 (Settings close error visibility), not weakened here.
- **Immediate-write regression is unit-level:** the capture-before-flush defect only appears when a
  tab/layer change lands inside a real commit/IPC round-trip, which a UI test cannot make
  deterministic without adding a test-only delay hook; the extracted helper is unit-tested instead,
  and the existing UI F2 paths still exercise `runImmediate`.
- **UI timing:** one manual run of two Electron suites in parallel (outside the runner) missed a 5 s
  wait in `ui-batch-b` once; every gate run at concurrency 8 (four full runs) was green. No retries or
  sleeps were added.
- `m4d1`’s former `artifacts/m4e2` screenshots now live in `artifacts/m4d1-page-density` (one
  directory per suite); older reports referencing `artifacts/m4e2` are historical.
- Hook order in the CI runner and the 1–7 worker matrix were not re-measured (default pool only, as in
  the brief).

## 6. Next suggested step

Targeted Sentinel re-check of F1–F3 plus the F4/F7 evidence in this worktree: reproduce the original
three findings (Export tab switch, settings cross-document write, corrupt-settings overwrite) and
confirm they now fail closed, then run `npm run verify` once at integration. Do not start the next
settings block until this re-check is accepted.
