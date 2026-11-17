# M2f phase 2b2b — backup listing and safe restore

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m2f-restore-backup-surface`  
**Base:** `fcf4110` (`main`: docs: start M2f phase 2b2b backup restore), merged with
`77b864c` (`main`: E2E dialog guard) at `0465ea4`  
**Scope:** backup listing and restore from the save-failure surface only. No phase 4
corrupt/missing/newer package recovery, undo, keyboard, empty chapters, stale locks, M3,
page view, or PDF.

## Verdict

The save-failure banner now offers **Restore backup…** for every save-failure code. It opens a
modal that lists the document’s rotating backups newest first with kind, created timestamp,
revision, block count, and title. Invalid backups are shown disabled with the parse/read reason
when at least one valid backup exists; with no valid backups the modal shows **No usable
backups** and no restore button.

Restoring always writes a **new copy** through the core recovery API
(`restoreCandidateToPackage`): the renderer selects only a listed candidate, the main process
re-validates it against the current listing, opens the native destination dialog with a unique
`<library>/<folder> restored <timestamp>` default, refuses an existing `document.json` or any
destination outside the library’s direct children, and never writes the original package. The
restored copy opens in a new tab; the original tab keeps its save failure until the user retries,
reloads, or overwrites.

The critical suite is **25/25 in 48.2 s** (56.2 s node run including build); unit is
**186/186 in 1.61 s**; `verify:fast` passes in about 56 s. No native OS dialog can open in E2E:
the main-process guard from `77b864c` answers Cancel/canceled and records the call.

## What changed

### Shared IPC and main process

- `apps/desktop/src/shared/api.ts`: `BackupKind`, `BackupCandidateView`, `ListBackupsResult`,
  `RestoreBackupResult`/failure codes, and the two new API methods.
- `apps/desktop/src/main/backup-restore.ts` (new, pure):
  - `backupCandidates()` filters out `temp`/`canonical`, maps core metadata, keeps invalid
    backups with their reason, and sorts newest first (created, then revision).
  - `usableBackups()` is the restorable subset.
  - `uniqueRestoreDestination()` allocates `<folder> restored <timestamp>` with ` 2`, ` 3`, …
    suffixes; `restoreStamp()` is UTC and filesystem-safe on macOS and Windows.
  - `restoreDestinationProblem()` is the closed destination rule set: inside the library,
    direct child only, never the library root, never the source package or its subfolder,
    never an existing `document.json`.
- `apps/desktop/src/main/library.ts`:
  - `listBackups(packagePath)` calls `inspectRecoveryCandidates(..., includeCanonical: false)`
    from `@noteforest/core/node` and maps only backup kinds. Read-only; no second recovery
    implementation.
  - `restoreBackup(packagePath, sourcePath, destination)` re-lists the backups, requires the
    source to be one of the currently valid candidates and inside that package’s backup
    directory, applies the destination rules, checks writability, calls
    `restoreCandidateToPackage(..., { assetsSourcePackagePath })`, then opens the copy and
    refreshes the library.
  - `defaultRestoreDestination(packagePath)` uses `pathExists` for uniqueness.
  - `isInsideLibrary` now shares `isPathInside` with the destination rules.
- `apps/desktop/src/main/index.ts`: `document:list-backups` and `document:restore-backup`.
  The restore handler validates the source **before** opening the native picker, uses the
  unique default, and returns `canceled: true` when the picker is dismissed.
- `apps/desktop/src/preload/index.ts`: exposes `listBackups` and `restoreBackup`; no raw path
  write is added.

### Renderer state machine

- `lib/save-failure.ts`: `restore-backup` is an action for every failure code; Overwrite stays
  `external-modification`-only.
- `shell/SaveFailureBanner.tsx`: **Restore backup…** between Retry and the existing actions.
- `state/shell.ts`: new `restore-backup` dialog kind.
- `shell/Dialogs.tsx`: `RestoreBackupDialog` loads the list on mount, preselects the newest
  valid backup, disables invalid rows with the reason, shows the empty state, keeps the modal
  open on native Cancel or a typed restore failure, and on success registers/opens the new
  copy in a new tab. It uses the same per-document queue through `runtime.restoreBackup()`.
- `state/runtime.ts`: `restoreBackup(sourcePath)` runs in the document’s serial queue and does
  not commit, clear, or replace the current canonical document.
- `lib/backup-restore.ts` (new): kind labels, local timestamp formatting, and the metadata
  line used by the rows.
- `styles.css`: backup list, row, invalid, empty-state, and inline-error styles.

## Exact UI and actions

The banner keeps its 2b1/2b2a shape; the new action is available for every failure:

```text
NoteForest cannot write to this folder.
Check the folder permissions and Retry, or save a copy elsewhere. Autosave is paused.
atomic save failed; previous file kept: EACCES: permission denied, open '…'
/Users/…/library/linear-algebra
[Retry] [Restore backup…] [Save a copy…] [Reload from disk…] [Reveal in Finder]
```

For `external-modification`, **Overwrite…** also appears between **Restore backup…** and
**Save a copy…**. Permission, disk-full, read-only, lock, backup, invalid-document, not-found,
and unknown failures never show Overwrite.

The modal:

```text
Restore backup
Choose a backup to restore as a new copy. The current document and its file are not changed.

BACKUPS, NEWEST FIRST
( ) Linear algebra
    Autosave · Nov 4, 2026, 4:57 PM · revision 3 · 7 blocks
( ) Linear algebra
    Daily · Nov 4, 2026, 4:57 PM · revision 0 · 7 blocks
( ) Linear algebra
    Autosave · Nov 4, 2026, 4:57 PM · revision 0 · 7 blocks

The restored copy opens in a new tab. This window’s unsaved changes and the original file are
left untouched.

                                                        [Cancel]  [Restore copy…]
```

With an invalid newest backup, the row stays visible, disabled, and explains itself:

```text
(x) Linear algebra
    Autosave · Nov 4, 2026, 5:00 PM · revision 0 · 0 blocks
    Unusable: … malformed JSON …
```

With no valid backups:

```text
Restore backup
Choose a backup to restore as a new copy. The current document and its file are not changed.

No usable backups
NoteForest has no valid backup for this document yet. Save a copy or fix the original folder
instead.

                                                                        [Cancel]
```

The native destination picker is titled **Restore backup as a copy**, its button is
**Restore copy**, and its default is `<library>/<folder> restored YYYY-MM-DD HH-mm-ss`.
Cancelling the picker leaves the modal open and changes nothing.

| Interaction | Behavior |
|---|---|
| Open | Banner **Restore backup…** for any failure code. |
| Load | `document:list-backups`; loading state until the list resolves. |
| Selection | Newest valid backup preselected; invalid rows disabled. |
| Restore | Native destination picker, then `document:restore-backup`. |
| Success | New copy opens in a new tab; library refreshes; original runtime and its failure stay untouched. |
| Native Cancel | Modal stays open; no tab, no write. |
| Modal Cancel / Escape | Closes the modal; no mutation. |
| Existing destination | Typed `exists`; inline error; no write. |
| Outside library / nested / source folder | Typed `outside-library`/`invalid-destination`/`same-package`; no write. |
| Read-only destination | Typed `not-writable`; no write. |
| Backup rotated between list and restore | Typed `invalid-source`; no arbitrary read. |

## Destination rules

| Rule | Result |
|---|---|
| Destination inside `<library>` | allowed |
| Destination is `<library>` itself | `invalid-destination` |
| Destination is a direct child of `<library>` | allowed |
| Destination nested deeper (including another package) | `invalid-destination` |
| Destination is the source package or inside it | `same-package` |
| Destination already has `document.json` | `exists` |
| Destination cannot be created or is not writable | `not-writable` |
| Source not in the current valid backup listing | `invalid-source` |

The direct-child rule keeps the restored copy visible in the library scan and prevents
restoring into another document’s folder.

## Before / after

| Behavior | Before (2b2a) | After (2b2b) |
|---|---|---|
| See available backups | none | modal lists rotating backups newest first |
| Backup metadata | none | kind, created timestamp, revision, block count, title |
| Invalid backup | invisible | disabled row with reason; hidden when none are valid |
| No backups | none | **No usable backups**, no restore button |
| Recover last good snapshot | none | restore as a new copy via core recovery |
| Original package | — | never written; original failure stays until retry/reload/overwrite |
| Destination choice | — | native picker with unique default |
| Existing package | — | refused with typed `exists` |
| Arbitrary source path | — | refused; source re-validated against the listing |
| Restored copy | — | opens in a new tab; assets copied from the original |
| Save failure / close / quit | 2b1/2b2a behavior | unchanged; guarded E2E quit cannot block |

## Tests added

| Layer | Test | What it proves |
|---|---|---|
| Unit | `apps/desktop/test/backup-restore.test.ts` — candidate filtering | only autosave/daily/manual/pre-migration; temp and canonical dropped; invalid kept with reason |
| Unit | `backup-restore.test.ts` — metadata/sort | kind, created, revision, block count, title mapped; newest first; parsed revision wins |
| Unit | `backup-restore.test.ts` — unique name | `<folder> restored <stamp>`, ` 2`, ` 3` when taken |
| Unit | `backup-restore.test.ts` — destination rules | outside, root, nested, source/subfolder, existing document, valid path |
| Unit | `backup-restore.test.ts` — real restore | real backups, assets copied, document bytes equal the selected backup, original untouched, second restore refused, arbitrary source refused |
| Unit | `apps/desktop/test/save-failure.test.ts` — action availability | Restore backup exists for every code; Overwrite remains external-only |
| E2E | lists valid backups newest first and restores one as a new copy | invalid row disabled; manual/autosave/daily metadata; newest-first order; restore content/revision/blocks/assets; original bytes and failure untouched; default destination |
| E2E | shows an empty state when there are no valid backups | no backups and invalid-only both show **No usable backups**, no restore button, Cancel opens no tab |
| E2E | refuses existing, outside-library, and read-only restore destinations | typed inline errors; occupied package unchanged; no outside write; native Cancel keeps the modal |
| E2E | dismisses a failed-save quit through the E2E dialog guard | failed save + quit without a dialog mock completes via Cancel; no native dialog; window stays open |
| Visual | `tests/visual/m2-screenshots.test.mjs` | 1440×900 restore modal screenshot with real backups |

All waits are conditions (`waitForFunction`, locators, `waitUntil`); `grep -rn waitForTimeout
tests/e2e tests/support tests/visual` returns 0. No data-safety, flush/close, or normal save
test was removed.

## Gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| Unit | `npm test` | 186/186, 19 files, 1.61 s |
| Critical e2e | `npm run e2e` | 25/25, 48.2 s test, 56.2 s node run incl. build |
| Fast gate | `npm run verify:fast` | pass, ~56 s |
| Build | `npm run build` | pass (existing `use client` dependency warnings unchanged) |
| No fixed waits | `grep -rn waitForTimeout tests/e2e tests/support tests/visual` | 0 |
| Visual evidence | `node --test --test-name-pattern="save-failure recovery surface" tests/visual/m2-screenshots.test.mjs` | pass, 3.5 s |
| Screenshot | `artifacts/m2e/restore-backup-1440x900.png` | generated (gitignored) |

New e2e durations: restore listing/copy **4.32 s**, empty state **1.66 s**, guarded quit
**1.57 s**, destination refusal **3.58 s**. The previous 21 tests still pass; the suite remains
under the 60 s budget.

## E2E dialog guard

`77b864c` installs `installE2EDialogGuard(dialog)` at main-process startup when
`NOTEFOREST_E2E=1`. It wraps `showMessageBox`, `showMessageBoxSync`, `showSaveDialog`, and
`showOpenDialog`, records each call on `globalThis.__nfDialogCalls`, and returns Cancel or
`{ canceled: true }` immediately. A missing mock can no longer block on a human click.

Per-test overrides still replace the methods after launch (`mockCloseDialogs`,
`mockSaveCopyDialog`, `mockRestoreDialog`). The new regression test calls `app.quit()` with a
failed save and **no** mock, then asserts the guard recorded a `['Retry', 'Cancel']` message box,
answered Cancel, and left the window open and responsive.

## Known gaps / risks

- **The restored copy keeps the source document ID and revision.** This is the same identity-
  preserving copy contract as Save a copy; the library can show two packages with the same
  `documentId`. A fresh ID for copies remains a separate product decision.
- **Restore does not clear the original save failure.** The original is still unwritable or
  conflicted; the copy is safe and open, and the user can Retry/Reload/Overwrite the original.
  This is intentional and asserted by the e2e.
- **Only rotating backups are listed.** Crash temp files and the canonical file are not restore
  sources here; corrupt/missing/newer package recovery remains phase 4.
- **Listing is capped at the newest 50 backups** by the core inspection default. The normal
  retention is 20 autosave + 7 daily + pre-migration + manual, so this is a safety bound rather
  than a practical limit.
- **Destination must be a direct child of the library.** Nested destinations are refused so the
  restored package cannot disappear from the library scan. This is stricter than Save a copy.
- **Assets are copied before the atomic document write.** A failure between the two leaves
  assets in the new folder but never a partial `document.json`; the original package is never
  touched. The core writer owns this order.
- **No phase 4/undo/keyboard/empty-chapter/stale-lock/M3/page/PDF work** was added.
- Only macOS was exercised in this worktree.
- Visual judgement of the new screenshot remains the product owner’s gate.

## Commits

| Commit | Content |
|---|---|
| `17b5bc3` | feat(desktop): add backup restore to the save-failure surface |
| `0465ea4` | merge main (`77b864c` E2E dialog guard) into the phase branch |
| `9961bd2` | test(desktop): cover backup restore and guarded failed-save quit |
| docs commit | this report |

## Next phase

Phase 4 corrupt/missing/newer package recovery (library listing, read-only error tab, package
recovery) is still out of scope here. After that, F2 undo, F3/F6/F7 data safety, F5/F16
keyboard/cleanup as scheduled in `docs/tasks/m2f-stability-fixes.md`.
