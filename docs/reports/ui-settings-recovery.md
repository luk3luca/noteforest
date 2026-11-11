# Builder report — Settings data recovery (S3-2, S3-13/S3-3, S4)

- Role: Implementer / Builder
- Date: 11 November 2026
- Base: `main` at `b63a78e` (R1), rebased onto `main` at `f5c9f69` (R5)
- Worktree: `/Users/luca/.t3/worktrees/noteforest/t3-a90b1690-bcd4fccd84cce5d8`
- Branch: `t3/settings-data-recovery`
- Rebased head: `ac48cc7` on `f5c9f69`; the branch head adds this rebase note
  (`git log -1 --oneline` in the worktree)
- Brief: `docs/tasks/ui-settings-recovery.md`

## 1. Summary

One batch gives both settings files an explicit, in-app recovery path in Settings → Data & About,
keeps recovery reachable after Dismiss, and closes the S4 test-guard nits.

### S3-2 — global `settings.json` recovery

- **Reset settings** now renders for `unreadable` as well as `corrupt`, from the top banner and from
  Data & About. The main-process `settings:reset` path (defaults, corrupt backup kept) is unchanged.
- **Dismiss** no longer writes `settingsStatus = ok`. It sets a session-only
  `dismissedWarnings.global` flag; the banner hides, the stored status/message/backup stay intact,
  and Data & About always shows the real state and the Reset action. Reopening Settings keeps the
  banner dismissed for the session but the Data page still exposes recovery; a restart re-reads the
  file and shows the banner again.
- A failed reset keeps the warning/status and surfaces the error in the Data page (`role="alert"`)
  and the footer; a successful reset writes defaults, keeps the `.corrupt-<timestamp>.json` copy,
  clears the status, and re-enables ordinary writes.
- `newer` stays a read-only warning with no Reset; unknown fields still survive a normal write.

### S3-13 / S3-3 — `document-settings.json` map recovery

- Data & About now has a **Document settings** section with the real status (`ok` / `defaults` /
  `corrupt` / `unreadable`), message, read-time `.corrupt-*` path, and the newest valid
  `.backup-*` path.
- **Reset map** is offered for `corrupt`/`unreadable` and requires an inline confirmation that names
  the scope exactly: “This removes all per-document page overrides. Note content is not affected.”
  The main process copies the current file to `document-settings.backup-<timestamp>.json`, keeps the
  existing `.corrupt-*` copy, then writes an empty map atomically through the existing serialized
  map queue. Success clears `documentSettings` and `pageOverrides`, sets the status to `ok`, and
  refreshes the Data page.
- **Restore backup** is offered only when a valid backup exists. The main process owns the choice:
  it lists `.backup-<timestamp>.json` newest-first, skips any file that is not JSON with an entry
  list (re-validated with `normalizeDocumentSettingsFile`), copies the current file aside, then
  writes the restored entries atomically. No valid backup or an invalid one fails without replacing
  anything.
- `saveDocumentSettings` still refuses `corrupt`/`unreadable` writes until the user chooses
  Reset/Restore. No note document content is read or written by either action (the UI suite compares
  `document.json` bytes before/after).

### S4 — test-guard nits

- `apps/desktop/test/ui-suite-list.test.ts` now includes `ui-overlay-command-gate` and the new
  `ui-settings-recovery` in the owners map, and the cross-suite check is generalized: no suite may
  name another suite's guarded evidence directory.
- `m3g1` split into `m3-anchor-callout-layout` / `m3-anchor-callout-stacking`; `m3h2` split into
  `m3-reference` / `m3-repair`. All four are guarded as unique owners.
- Removed the stale `(S2-5)` suffix from the two `m4e1-settings-platform` test titles; behavior
  assertions are unchanged.

### Rebase onto `f5c9f69` (R5 — Settings Editor shortcuts/search)

`main` moved to `f5c9f69` while this branch was open. The rebase produced three textual conflicts;
all were resolved by keeping both batches, and the auto-merged files were checked by reading the
result:

- `tests/ui/suites.mjs` — the `settings` group had one slot each for `ui-editor-shortcuts` (R5) and
  `ui-settings-recovery` (R1). Kept both, in `FILES` order, before `ui-overlay-command-gate`.
  `FILES` is now 46 suites; `all` 46, `settings` 8, `core` 13 (shell 6 + settings 8 − the shared
  overlay suite).
- `apps/desktop/test/ui-suite-list.test.ts` — kept R5's `ui-editor-shortcuts` owner entry together
  with `ui-overlay-command-gate`, `ui-settings-recovery`, and the four split m3 owners, under the
  generalized cross-suite guard.
- `tests/ui/README.md` — the Settings overlap row now lists and describes both
  `ui-editor-shortcuts` (R5) and `ui-settings-recovery`; the evidence-directory paragraph already
  carried both new directories.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` — auto-merged. Verified both features
  survive: R5's `initialPage`/`SettingsPageId`, shortcut search, empty state and Escape-clears-query
  behavior, plus this batch's `dismissedWarnings` banner gating, Data & About statuses and
  Reset map / Restore backup recovery.
- `apps/desktop/src/shared/api.ts` — auto-merged. R5's `settings-shortcuts` `MenuCommand` and this
  batch's `documentSettingsBackup`/recovery API coexist.
- No other R5 touch point (`menu.ts`, `actions.ts`, `settings-pages.ts`, `Dialogs.tsx`,
  `state/shell.ts`, `styles.css`) conflicts with this batch.

Post-rebase targeted checks: typecheck clean, `ui-suite-list` 6/6, `ui-editor-shortcuts` 4/4 +
`ui-settings-recovery` 6/6, settings group 8/8. The full `npm run verify` below was run on the
pre-rebase tree (45 suites); the Orchestrator runs the integration verify on `main` after merge.

## 2. Recovery semantics (decisions inside the brief)

- **“The” backup** is the newest `.backup-<timestamp>.json` that parses as JSON with an `entries`
  list and normalizes. `.corrupt-*` read-time copies are evidence, never restore sources.
- **Retention**: side-copies are never deleted by reset/restore. A reset of a corrupt map creates a
  `.backup-*` copy of the corrupt bytes too (it is preserved but skipped as invalid); a reset/restore
  of a valid map creates a restorable `.backup-*`.
- **Reset confirmation** is inline (no native dialog); Restore also asks for confirmation because it
  replaces the current map (design doc §11 “backup + confirm”).
- **Backup is best effort before an explicit reset**: a missing file needs no copy; a corrupt file
  is readable and is copied; an `unreadable` file cannot be copied by definition, so the explicit
  reset proceeds (the file is replaced atomically) rather than making the recovery path dead. The
  current bytes are only lost when the OS refused to read them in the first place.
- No schema/migration/`settingsVersion` change. `BootstrapResult` carries one additive
  `documentSettingsBackup` field; the map file format is unchanged.

## 3. Files changed

Product code:

- `apps/desktop/src/shared/api.ts` — `DocumentSettingsBackupView`,
  `DocumentSettingsRecoveryResult`, `BootstrapResult.documentSettingsBackup`, and the two
  `NoteForestApi` recovery methods.
- `apps/desktop/src/main/document-settings.ts` — backup listing/validation, newest-valid choice,
  reset, restore; shared side-copy naming.
- `apps/desktop/src/main/library.ts` — `resetDocumentSettingsMap` / `restoreDocumentSettingsMap`,
  bootstrap backup scan.
- `apps/desktop/src/main/index.ts` — `document-settings:reset` / `document-settings:restore` IPC and
  bootstrap field.
- `apps/desktop/src/preload/index.ts` — bridge methods.
- `apps/desktop/src/renderer/src/state/settings.ts` — `dismissedWarnings`, `documentSettingsBackup`,
  `resetDocumentSettings`, `restoreDocumentSettingsBackup`; reset/restore update the store only after
  the main process confirms the write.
- `apps/desktop/src/renderer/src/shell/SettingsDialog.tsx` — banner-only dismissal, Reset for
  corrupt/unreadable, Data & About statuses/messages/backup paths, Reset map + Restore backup with
  inline confirmation and errors.
- `apps/desktop/src/renderer/src/App.tsx` — pass the backup view into the store, expose it on the
  test bridge, point the startup toasts at Data & About.

Tests:

- `apps/desktop/test/document-settings.test.ts` — reset (corrupt), unreadable refusal + reset,
  restore with current-file backup, newest-valid/invalid skipping, invalid backup refusal without
  replacement, missing-map reset.
- `apps/desktop/test/settings-store.test.ts` — dismiss keeps the status, reset success/failure,
  document reset/restore success/failure and in-memory clearing.
- `apps/desktop/test/settings.test.ts` — unreadable global reset and failed reset keep the status.
- `apps/desktop/test/ui-suite-list.test.ts` — new owners map and generalized guard.
- `tests/ui/ui-settings-recovery.test.mjs` (new, 6 tests, registered in `tests/ui/suites.mjs`).
- `tests/ui/m3-anchor-callout-layout.test.mjs`, `m3-anchor-callout-stacking.test.mjs`,
  `m3-reference.test.mjs`, `m3-repair.test.mjs` — unique evidence directories.
- `tests/ui/m4e1-settings-platform.test.mjs` — removed the stale `(S2-5)` suffixes.
- `tests/ui/README.md` — evidence-directory rule and settings overlap row.
- `docs/reports/ui-settings-recovery.md` — this report.

## 4. Checks run (real timings, this machine)

Pre-rebase full gate (on the R1 branch before R5 landed; not re-run after the rebase, per the
Orchestrator's instruction):

| Check | Result | Real time |
|---|---|---:|
| `npm run verify` (exit 0, pre-rebase tree) | boundaries 178 files / 877 imports / 16 rules; typecheck clean; unit 109 files / **1114** tests; e2e **16/16**; recovery **14/14**; UI **45/45**; 0 pageErrors | **2:47.90 wall** |
| ├ boundaries | `npm run check:boundaries` | 0.4 s |
| ├ unit (`vitest`) | 109 files / 1114 tests | 2.82 s |
| ├ e2e | `tests/e2e/m2-editor.test.mjs`, 16/16 | 44.0 s |
| ├ recovery | 14/14 | 17.5 s |
| └ UI suites | 45/45 at the default pool (8), new suite included | 97.2 s |

Post-rebase targeted checks (R1 on `f5c9f69`, both batches merged):

| Check | Result | Real time |
|---|---|---:|
| `npm run typecheck` | clean (all four workspaces) | ~8 s |
| `npx vitest run apps/desktop/test/ui-suite-list.test.ts` | 6/6 | 0.08 s |
| `node --test ui-editor-shortcuts ui-settings-recovery` | **10/10** (4 + 6), no pageErrors | 20.9 s |
| `node tests/ui/run.mjs --group settings` | **8/8** (both new suites included) | 22.8 s |
| `node tests/ui/run.mjs --list` | `all 46, settings 8, shell 6, anchors 13, images 4, page 16, core 13` | < 1 s |

The rebased UI count is 46 (R5's `ui-editor-shortcuts` + this batch's `ui-settings-recovery`); the
settings group grew 6 → 7 → 8. Unit tests moved 1099 → 1114 (15 new assertions across the four unit
files). The pre-rebase full verify timing is consistent with the previous ~3 min baseline.

## 5. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Corrupt **or unreadable** global `settings.json`: Data & About shows status and Reset; Dismiss hides only the banner; reopening Settings still shows status and Reset; failed Reset keeps warning and surfaces error; successful Reset writes defaults, keeps backup, clears status | **Pass** | unit: `settings.test.ts` unreadable/failed reset, `settings-store.test.ts` dismissal/reset; UI: `ui-settings-recovery` tests 1–3 (corrupt, unreadable, failed reset) |
| Corrupt or unreadable `document-settings.json`: Data & About shows status and warning; Reset requires confirmation, backs up current file, writes empty map atomically, clears overrides in memory/on disk, leaves note content untouched | **Pass** | unit: `document-settings.test.ts` reset/refusal; UI test 4 and 6; note `document.json` bytes compared |
| Restore backup only when a valid backup exists; backs up current file, restores validated entries, refreshes store; invalid backup fails without replacing | **Pass** | unit: newest-valid skipping, invalid refusal, current-file backup; UI test 5 (restore) and test 4 (no Restore button without a valid backup) |
| Save remains refused while the map is corrupt/unreadable until an explicit recovery action | **Pass** | existing refusal + new unreadable refusal; UI test 4 asserts the failed ordinary override leaves `{broken` on disk |
| S4: guard includes `ui-overlay-command-gate`, every evidence directory has one owner, four suites use unique directories, stale `(S2-5)` titles gone | **Pass** | `ui-suite-list.test.ts`; `suites.mjs`; m3/m4e1 diffs |
| No schema/dependency change; no assertion weakened; no native dialog; no fixed sleep | **Pass** | no version/schema edits, no packages added; test titles only renamed; inline confirm; tests use condition waits only |
| `npm run verify` exit 0 with real timings; UI suites at the default pool, no pageErrors | **Pass (pre-rebase full gate; post-rebase targeted)** | section 4: pre-rebase 45/45 full verify; post-rebase typecheck + suite-list + 10/10 new-suite + settings 8/8; `ui-settings-recovery` after-hook asserts `h.pageErrors` empty |

## 6. Risks / open questions

- **Unreadable-map backup limitation**: an `unreadable` file cannot be copied (reading it is what
  failed). Reset still proceeds by explicit confirmation; the old bytes are gone only if the OS
  already refused to read them. A corrupt (parse-failure) map is always backed up before reset.
  If the product owner wants “no reset without a copy even for unreadable”, that needs a permission
  recovery step (chmod) and is a separate decision.
- **Restore keeps the restored backup as a candidate**, so Restore remains offered after a restore
  and can be used again; it is not one-shot. This is deliberate (the source is evidence) but a future
  retention policy (R7/M6) may prune them.
- **Backup files accumulate** on repeated reset/restore; no retention is implemented, per brief
  (library folder/backup retention is out of scope).
- **Reset map on a valid map** is not offered (only `corrupt`/`unreadable`), matching the design table;
  Restore is the way to roll back from a backup while the map is valid.
- The global “successful reset keeps the backup” guarantee relies on the read-time `.corrupt-*` copy
  for corrupt files; unreadable files have no copy by definition (same limitation as above).
- Dismissal is intentionally not persisted: a restart re-shows the banner. Data & About remains the
  durable, always-visible recovery surface.

## 8. Integration

- Rebased onto `f5c9f69` (R5) and merged fast-forward into `main` at `4a87ae8`.
- Full `npm run verify` on `main` at `4a87ae8`: **exit 0, 170.47 s** — 109 unit files / 1114 tests,
  16/16 e2e, 14/14 recovery, **46/46 UI** at the default pool, 0 pageErrors.
- No separate Sentinel review was run for this batch; a targeted review can be folded into the next
  settings checkpoint.
- Next settings task: R2 Page chrome.

## 7. Next suggested step

Targeted Sentinel review of this batch against the brief (S3-2, S3-13/S3-3, S4), including a manual
pass on the Data & About recovery section and one restart with a corrupt global file. If accepted,
the next Wave 1 settings task can start (Appearance v3 or the next listed page), with S3-1 Close
Window still separate.
