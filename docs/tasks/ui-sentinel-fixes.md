# UI Sentinel fixes — overlay command gate, write identity, corrupt settings, test evidence

**Role:** Implementer / Builder
**Milestone:** UI stabilization (post Batches A/B/C/V)
**Base:** `main` at the commit that adds this brief (UI code `a44a257`, review `1a8c1af`)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 4 hours

## Context

The UI post-merge Sentinel (`docs/reviews/ui-post-merge-review.md`) returned **request changes**
with no S1 and three S2 findings reachable from ordinary gestures:

- **F1** — modal overlays do not own the global shortcut/native-menu surface; an open Export sheet
  can export a different document under the original filename (`App.tsx:296`, `:393`, `:404`,
  `:408`; `export-flow.ts:301`, `:322`, `:373`).
- **F2** — a pending document-scoped Page settings write binds to the active tab at flush time;
  switching tabs writes the override to another document, and closing the document can report
  `saved` without a write (`usePageSettingsController.ts:99`, `:367`, `:467`, `:540`).
- **F3** — a corrupt global `settings.json` is backed up but then overwritten by the next ordinary
  setting change while the warning still says corrupt and the footer says Saved
  (`library.ts:1230`, `:1266`, `:1282`; mirror `document-settings.ts:156`).

The Sentinel also found two S3 test-infrastructure issues that must be fixed in the same batch so
the evidence for these regressions is trustworthy:

- **F4** — four suites share `artifacts/ui-batch-a`; `m4d2` deletes it recursively in `before`.
- **F7** — the runner's `FILES` list is hardcoded, `NOTEFOREST_UI_RUNNER` is unused, and a timeout
  reports only `signal SIGKILL`.

The next settings block is blocked until F1–F3 are accepted.

## Goal

One batch that makes every overlay own the command surface, pins Export and Page-settings writes to
the document they started on, refuses implicit writes over a corrupt global settings file until an
explicit Reset, isolates UI evidence directories, hardens the runner, and adds regressions.

## In scope

### 1. Overlay command ownership (F1)

- Add one renderer predicate for the active overlay owner, covering:
  `useShell.dialog !== null` (Settings and the other dialogs), `useShell.paletteOpen`, and
  `useExportUi.status !== 'idle'` (Export sheet open or running). Context menus and the Page Edit
  overlay are not part of this gate.
- While an overlay owns the surface, the global `keydown` handler and the native-menu `dispatch`
  path must ignore every app command: tab switch (`⌘1`…`⌘9`, `Ctrl+Tab`), layout/mode (`⌘2`,
  `⌘3`, `⌘E`), zoom (`⌘+`, `⌘-`, `⌘0`, `⌘⇧F`), palette (`⌘K`), new/close/save/reopen, open,
  export, sidebar, references.
- Overlay-local behavior must keep working: typing in Settings inputs, Escape/Done/close buttons,
  palette arrow/Enter/Escape and row execution, Export sheet buttons and cancel prompt.
- Cover Settings → Export as nested overlays: commands stay blocked while either is open; closing
  Export returns to a still-gated Settings.
- Native menu roles (cut/copy/paste/select-all/quit) are **not** app commands and must keep working.
- A test-only bridge method may dispatch a `MenuCommand` through the exact same path as
  `window.noteforest.onMenu`, so tests prove menu and keyboard parity.

### 2. Export document identity (F1)

- `ExportUiState` records the document it was opened for (`packagePath`, and title if not already
  pinned) at `openExportSheet` time.
- `startExport`, `confirmReplaceExport`/`runExport`, and the Page Edit commit use that pinned
  `packagePath`; never re-read `useShell.getState().activeTab` after the sheet opens. The sheet's
  title, filename, layout, setup and density stay those of the pinned document.
- If the pinned document is no longer open when Export starts, fail with a clear error
  (`document-not-open` or the existing `snapshot-failed` shape) and write no file.
- Keep the existing main-process snapshot contract keyed by `packagePath`.

### 3. Page-settings write identity (F2)

- Capture `{ packagePath, documentId, scope }` when a debounced edit is scheduled and when an
  immediate write starts. Store it on the pending write; `writePending`, `applyPending`,
  `runImmediate`, `retry`, and `flushPending` must use the captured target, not the live refs.
- A document-scoped write whose target document is no longer open must not write and must not
  report `saved`: surface a visible "not saved" state (footer/`commitError`), clear the retry
  attempt when the target is gone, and let close/quit proceed.
- Global writes keep the current behavior.
- A scope switch still flushes the pending edit on the layer it was typed on before the layer
  changes.
- Keep `commitThenWritePageSettings` as the commit-before-write ordering guard; extend its outcome
  only if needed for the skipped-target case, with unit tests.

### 4. Corrupt global settings (F3)

- `writeSettings` refuses an implicit write while the current `settings.json` exists but cannot be
  parsed or read: return `{ ok: false, message }`, leave the corrupt bytes and the backup untouched.
  Re-check the file at write time so a file corrupted after bootstrap is also refused.
- Add an explicit reset path (for example `settings:reset` IPC → `library.resetSettings()`),
  exposed through preload/shared API, used only by the Settings "Reset settings" button. It
  atomically replaces the file with product defaults and returns the write result.
- The renderer shows the refusal (footer not `Saved`, warning still visible); after a successful
  Reset it clears the status warning and reports saved. A dismissed warning must not imply a
  successful write.
- Keep the corrupt backup and the existing missing-file/default behavior unchanged.

### 5. UI evidence isolation (F4)

- One screenshot directory per suite; no cross-suite directory is created or deleted:
  `ui-batch-a` stays `artifacts/ui-batch-a`; `m4e1` uses `artifacts/m4e1-settings`;
  `m4d1` uses `artifacts/m4d1-page-density`; `m4d2` uses `artifacts/m4d2-export-ui`.
- `before` hooks clean only their own temp/output/screenshot directories.
- Evidence for all four suites must coexist after a full parallel run.

### 6. Runner hardening (F7)

- Move the suite list and groups to `tests/ui/suites.mjs` (no side effects) and import them in
  `run.mjs`; add a meta-test asserting the list equals `tests/ui/*.test.mjs` exactly.
- Remove the unused `NOTEFOREST_UI_RUNNER` env value.
- A timeout must print an explicit `timed out after N s` reason (and still SIGKILL, fail, and set
  exit code 1). Prefer a small pure formatter with a unit test over a slow process test.
- Keep `--list`, groups, de-duplication, `--fail-fast`, `--verbose`, and the concurrency default.

## Out of scope

- F5 (rendered compact tab status icons), F6 (Settings/Export axe/focus), F8 (copy/state polish),
  F9 (Settings close error visibility), F10 (remaining failure-path coverage) — tracked S3s, not
  this batch.
- Product decisions: tab windowing, Settings centering, fit-width 0.91, density/preset Q-11,
  cross-document margin fallback, default Settings page, per-document Continuous page.
- New settings pages, schema/migration changes, paginator/print-compositor changes, new
  dependencies, visual restyling, or general refactors.
- Weakening or deleting any existing assertion; no fixed sleeps; no native OS dialogs.

## Files

Read:
- `apps/desktop/src/renderer/src/App.tsx`, `actions.ts`, `state/shell.ts`,
  `shell/CommandPalette.tsx`, `shell/SettingsDialog.tsx`, `shell/Dialogs.tsx`.
- `apps/desktop/src/renderer/src/export/export-flow.ts`, `export/ExportSheet.tsx`.
- `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts`,
  `settings/page-settings-write.ts`, `state/settings.ts`.
- `apps/desktop/src/main/library.ts`, `main/document-settings.ts`, `main/index.ts`,
  `src/preload/index.ts`, `src/shared/api.ts`, `src/renderer/src/global.d.ts`.
- `tests/ui/run.mjs`, `tests/ui/README.md`, `tests/support/*`, and the suites named in F4;
  `apps/desktop/test/settings*.test.ts`, `page-settings-write.test.ts`.
- `docs/reviews/ui-post-merge-review.md` F1–F4/F7, `docs/review-checklist.md`,
  `docs/definition-of-done.md`.

Expected to touch:
- The product files above, `tests/ui/suites.mjs` (new), a runner formatter/unit test,
  `tests/ui/ui-overlay-command-gate.test.mjs` (new; or a justified equivalent),
  `tests/ui/m4e1-settings-platform.test.mjs`, `tests/ui/m4d1-page-density.test.mjs`,
  `tests/ui/m4d2-export-ui.test.mjs`, `tests/ui/ui-batch-a.test.mjs` (paths only),
  `apps/desktop/test/ui-suite-list.test.ts` (new), settings/unit tests, and
  `docs/reports/ui-sentinel-fixes.md`.

## Acceptance criteria

- [ ] With Export open for document B, `⌘1`, `Ctrl+Tab`, and a native `close-tab`/tab command do
      not change the active tab; Export writes B's content to B's filename. If B closes, Export
      fails with a clear error and writes nothing.
- [ ] With Settings open, `⌘1`…`⌘9`, `⌘2`/`⌘3`, `⌘K`, `⌘W`, `⌘N`, `⌘,`, zoom keys, and native
      menu app commands do nothing behind it; typing, Escape/Done, palette row execution, and
      native cut/copy/paste/quit keep working.
- [ ] A document-scoped margin/theme/density edit followed by a tab/document change during the
      debounce either lands on the document where it was typed or is discarded with a visible
      "not saved" state; it never lands on another document and never reports `saved` without a
      write.
- [ ] A corrupt global `settings.json` is not overwritten by an ordinary change (bytes unchanged,
      warning and backup intact, footer not `Saved`); the explicit Reset replaces it with defaults,
      clears the warning, and later changes save.
- [ ] The four evidence directories are distinct and coexist after a parallel run; no suite deletes
      another suite's directory.
- [ ] The runner list meta-test fails if a UI suite is added/removed without updating
      `tests/ui/suites.mjs`; a timeout prints an explicit timed-out reason and fails the gate.
- [ ] Regressions: new UI test for F1/F2, extended `m4e1` for F3, unit tests for the corrupt-write
      refusal + reset and the write-target logic, runner meta/formatter tests.
- [ ] `npm run verify` exit 0 with real timings; UI 43+ suites at the default pool, no pageErrors;
      no existing assertion weakened or deleted.

## Tests and evidence

- Targeted while working: the new/changed UI suites by name, `npx vitest run <file>`,
  `npm run typecheck`, `npm run check:boundaries`.
- End of task: one full `npm run verify` (~3 min on this machine), plus two full UI runs at the
  default concurrency to prove evidence isolation.
- Screenshots: only for the new states if useful, in the suite's own directory.
- No native dialogs, no fixed sleeps, no retries.

## Stop and ask

Stop and report instead of inventing a decision when:

- gating a native menu item would break a macOS role (cut/copy/paste/quit) or the quit flush;
- pinning Export requires a main-process contract or shared-type change beyond the named files;
- "Reset settings" semantics are unclear (expected: back up, replace with product defaults);
- a baseline test fails for an unrelated reason;
- the fix would require a schema, dependency, spec, UX, or ADR change.

## Report format

- Summary: what changed and why, mapped to F1/F2/F3/F4/F7.
- Files changed.
- Checks run with real timings and suite counts.
- Acceptance criteria: pass/fail per item, with the test name and evidence.
- Open questions / risks.
- Next suggested step (targeted Sentinel re-check).

Final response mirrors the brief. Commit in the worktree; do not merge or push.
