# M2f phase 4a — corrupt/missing/newer package recovery

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m2f-phase4a-corrupt-recovery`  
**Base:** `9fffbb8` (`main`: docs: start M2f phase 4a corrupt recovery)  
**Scope:** F3 only — damaged/missing/newer packages in the library, a read-only recovery
surface, and restore-newest-backup as a new copy. No empty chapters (F6), stale-lock consent
(F7), keyboard/focus (F5), undo, M3, page view, or PDF.

## Verdict

A package whose `document.json` is corrupt, missing, or newer than this app now stays in the
library with a visible status and reason instead of disappearing. Opening it creates a
**read-only recovery tab**, never an editable runtime: the tab shows the package path, status,
parse/validation reason, and the rotating backups. **Restore newest valid backup** writes a new
copy through the existing 2b2b restore path, opens that copy, and never writes the original
package. A missing session tab now restores as a recovery tab with Retry/Remove instead of a
toast-only failure.

`npm run verify` passes: 221/221 unit tests in 1.70 s, 26/26 critical e2e tests with a 55.7 s
suite (under the 60 s budget), 6/6 recovery integration tests in 4.6 s, and a production build.
No native OS dialog opens during any recovery action.

## What changed

### Shared contract and main process

- `apps/desktop/src/shared/api.ts`:
  - `LibraryDocumentStatus` = `ok | unreadable | missing | newer-schema`; `RecoveryStatus` is
    the non-ok subset.
  - `DocumentSummary` now carries `status`, optional `reason`, and nullable
    `documentId`/`revision` for damaged rows. Valid rows keep their parsed values.
  - `RecoveryDocumentView` is a read-only inspection result (path, title fallback, status,
    reason, validation details, warnings).
  - `BootstrapResult.recoveries`; `NoteForestApi.restoreNewestBackup`.
- `apps/desktop/src/main/library.ts`:
  - `scanLibrary` reads every direct non-hidden folder. Parse success is `ok`; malformed JSON
    and validation failures are `unreadable`; a newer `schemaVersion` is `newer-schema`; a
    folder without `document.json` is `missing`. Each bad row gets a human reason, the package
    path, and a title fallback (parsed title when available, otherwise the folder name).
  - `openStore` returns `{ recovery }` instead of an error when the core store has no document.
    Recovery-only stores are closed and are never left in the open-store map. `openDocument`
    forwards the recovery view.
  - `recoveryViewFromOpen` uses `openDocumentPackage`'s typed reason/errors and never writes.
  - `recoveryViewForError` gives a session tab outside the library a safe recovery view.
  - `bootstrap` returns `recoveries` for damaged/missing session tabs; they are no longer
    dropped and no longer become toast-only failures.
  - `restoreNewestBackup(packagePath)` lists backups with `listBackups` (which uses
    `inspectRecoveryCandidates`), picks the newest **valid** backup, allocates the unique
    `<library>/<folder> restored <timestamp>` destination, and calls the existing
    `restoreBackup`. Source validation, destination rules, assets, and
    `restoreCandidateToPackage` are shared with 2b2b; there is no second recovery implementation.
  - Save/apply/copy/reload paths reject a recovery package explicitly; other documents are
    unaffected.
- `apps/desktop/src/main/recovery-view.ts` (pure): title fallback, status mapping, and
  validation-issue flattening.
- `apps/desktop/src/main/index.ts`: `app:bootstrap` returns `recoveries`;
  `document:restore-newest-backup` is typed and path-validated through the library layer.
- `apps/desktop/src/preload/index.ts`: exposes `restoreNewestBackup`; no raw write API is added.

### Renderer

- `state/shell.ts`: `TabInfo.recovery` (`status`, `reason`, `details`, `warnings`). Reopening a
  recovery/missing path as a valid document clears stale recovery markers.
- `actions.ts`: `openPath` opens a recovery tab for a recovery result. Library menus label it
  **Open recovery** and do not offer rename for non-ok packages.
- `App.tsx`: bootstrap maps `recoveries` into recovery tabs; the window title follows the tab.
- `shell/RecoverySurface.tsx`: the read-only tab. It loads backups, shows valid and invalid
  rows, and offers **Restore newest valid backup**, **Reveal in Finder**, **Close tab**, plus
  **Retry**/**Remove tab** for missing packages. Restore errors stay inline; a missing session
  tab remains a tab, never only a toast.
- `lib/recovery.ts`: exact status labels/headlines/descriptions (unit-tested).
- `shell/Sidebar.tsx`: damaged rows use a warning icon, status badge, and a visible reason line;
  valid rows keep the existing FileText row. Clicking any row opens the document or recovery.
- `shell/TabBar.tsx`, `shell/StatusBar.tsx`: recovery tabs get a `!` marker and
  `Recovery · <status>` status text; they never show a dirty state.
- `styles.css`: library status/reason rows and the recovery surface.

## Exact UI

Library rows (valid rows are unchanged):

```text
[!] truncated-note                              UNREADABLE
    document.json is not valid JSON
[!] missing-note                                MISSING
    document.json is missing from this folder
[!] future-note                                 NEWER VERSION
    document schemaVersion 2 is newer than this app supports (1); open read-only
```

Corrupt/unreadable recovery tab:

```text
READ-ONLY RECOVERY                                  Read-only · no overwrite
This document could not be read.
Linear algebra
The file did not parse into a valid document and has not been changed. Inspect the reason
below, or restore a valid backup as a new copy.

STATUS  Unreadable
FOLDER  /Users/…/library/linear-algebra
REASON  document.json is not valid JSON

Backups                                  Newest first · restoring always creates a new copy
  Linear algebra
  Daily · Nov 4, 2026, 6:34 PM · revision 0 · 7 blocks
  Linear algebra
  Autosave · Nov 4, 2026, 6:34 PM · revision 0 · 7 blocks

[Restore newest valid backup] [Reveal in Finder] [Close tab]
```

Newer schema uses the same layout with the headline **This document was saved by a newer
NoteForest.** and the explanation that the file stays read-only, will not be downgraded, edited,
or overwritten, and should be opened in the newer version. Missing uses **This document is
missing.** and adds **Retry** and **Remove tab**.

| Interaction | Behavior |
|---|---|
| Library row, any non-ok status | Opens a recovery tab; the package is never parsed into an editable runtime. |
| Corrupt/invalid | Reason and validation details; backups listed; restore as a new copy. |
| Newer schema | Read-only explanation; no save/overwrite/downgrade control; backups may be restored as a new copy. |
| Missing session tab | Recovery tab with the missing reason, **Retry**, **Remove tab**, and **Close tab**. |
| Restore newest valid backup | Lists backups, skips invalid ones, allocates a unique sibling folder, restores via the 2b2b path, opens the copy. |
| No valid backup | **No usable backups**; restore disabled; original untouched. |
| Invalid-only backups | Invalid rows remain visible with their reason; **No usable backups**; restore disabled. |
| Retry (missing) | Re-opens the package; still-missing feedback stays inline. |
| Remove tab | Closes the tab. The folder (if any) is never deleted. |
| Close tab | Closes the recovery tab without writing. |
| Session restore | Damaged/missing packages come back as recovery tabs, not dropped tabs. |
| Native dialogs | None for open, retry, close, or restore-newest. E2E asserts the dialog-guard record stays empty. |

## Before / after

| Behavior | Before (M2e/2b2b) | After (4a) |
|---|---|---|
| Corrupt package in the library | Dropped from the scan, only a warning string | Visible row with `unreadable`, reason, path, title fallback |
| Newer schema in the library | Dropped | Visible row with `newer-schema` and explanation |
| Folder without `document.json` | Ignored | Visible `missing` row |
| Opening a damaged package | Toast, no tab | Read-only recovery tab |
| Newer schema | Error toast | Read-only explanation; no downgrade/overwrite path |
| Backup access | Only from a save failure | Also from the recovery tab |
| Restore | Dialog only; required a live runtime | Recovery tab restores newest valid backup as a new copy |
| Missing session package | Generic missing tab, no reason/backup/data path | Recovery tab with status, reason, Retry/Remove |
| Original package | Could not be inspected in-app | Never written; only its rotations/assets are read |
| Valid documents | Normal | Unchanged: parsed status, editing, autosave, save failures |
| E2E dialog guard / 2a/2b save failure | Present | Unchanged and still covered |

## Tests added

| Layer | Test | What it proves |
|---|---|---|
| Unit | `apps/desktop/test/recovery-view.test.ts` | Title fallback, status mapping, validation-detail flattening |
| Unit | `apps/desktop/test/recovery-library.test.ts` | Scan statuses/reasons/title fallbacks; recovery views for corrupt/newer/missing; outside-library rejection; restore-newest skips invalid backups, writes a new copy, original untouched, second restore is another new copy; no-backup result |
| Integration | `tests/recovery/m2f-recovery.test.mjs` — truncated | Library row has reason/status/title fallback; recovery tab is read-only; no runtime; original bytes unchanged; close and no native dialogs |
| Integration | same — newer schema | Visible row; read-only explanation; no save controls; original bytes unchanged; no runtime |
| Integration | same — missing session tab | Bootstrap opens a recovery tab, not a toast; Retry reports still missing; Remove tab closes it; no dialogs |
| Integration | same — restore newest | Invalid newest backup skipped; valid newest restored to a new sibling; restored bytes equal the backup; original damaged bytes unchanged; restored copy opens editable; no dialogs |
| Integration | same — empty states | No backups and invalid-only backups both show **No usable backups**, invalid rows keep their reason, restore disabled |
| Integration | same — valid docs | Valid row keeps its title, opens and saves normally beside a corrupt package; corrupt bytes unchanged |
| Visual | `tests/visual/m2-screenshots.test.mjs` — corrupt-package recovery | `artifacts/m2e/recovery-damaged-1440x900.png` |

All waits are conditions (`waitForFunction`, locators, `waitForSelector`); there are no
`waitForTimeout` or fixed sleeps in the new suites.

## Gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| Unit | `npm test` | 221/221, 24 files, 1.70 s |
| Critical e2e | `npm run e2e` | 26/26, 55.7 s suite (63.7 s node run; the build runs before it) |
| Recovery integration | `npm run test:recovery` | 6/6, 4.6 s suite (12.6 s node run; the build runs before it) |
| Full gate | `npm run verify` | pass, 82.6 s wall |
| Build | `npm run build` | pass (existing dependency `use client` warnings unchanged) |
| No fixed waits | `grep -rn waitForTimeout tests/recovery tests/e2e tests/visual` | 0 |
| Visual evidence | `node --test --test-name-pattern="corrupt-package recovery" tests/visual/m2-screenshots.test.mjs` | 1/1, 1.06 s |

`test:recovery` is in `verify` only; `verify:fast` remains typecheck + unit + critical e2e so the
critical suite stays under its budget. `tests/perf/` and `tests/visual/` remain on demand.

Recovery case durations: truncated **0.42 s**, newer **0.48 s**, missing session **0.40 s**,
restore newest **0.65 s**, empty states **0.57 s**, valid unaffected **1.49 s**.

## Known gaps / risks

- **Crash temp files are inspected by core but not offered as restore sources.** The recovery
  tab reuses the 2b2b rotating-backup list; `temp`/`canonical` candidates remain filtered out.
  Restoring a crash temp is a later decision.
- **The restored copy keeps the source document ID and revision**, the same identity-preserving
  copy contract as Save a copy and 2b2b. Two packages can share a `documentId`.
- **Restoring does not clear or modify the original recovery tab.** The copy opens in a new tab;
  the original damaged package stays visible and untouched for inspection.
- **Remove tab closes the tab, it does not delete the folder.** The library scan will list a
  remaining damaged folder again on the next scan. Destructive folder deletion is out of scope
  and has no consent flow yet.
- **A direct non-hidden folder without `document.json` is treated as a missing package.** In a
  library folder that also contains unrelated folders, those folders appear as `missing`. The
  library is app-owned; a narrower package heuristic can be added if needed.
- **Reveal for a missing folder has no item to select.** The action is present; Finder may show
  the parent or nothing. A dedicated “reveal parent folder” path is a small follow-up.
- **No F6 empty-chapter, F7 stale-lock, F5 keyboard, undo, M3, page view, or PDF work** was
  added. The stale-lock auto-break behavior is unchanged.
- **Only macOS was exercised** in this worktree.
- Visual judgement of the recovery screenshot remains the product owner’s gate.

## Commits

| Commit | Content |
|---|---|
| `5eb7be0` | feat(desktop): surface damaged packages in read-only recovery |
| `694d0f8` | test(recovery): add damaged package integration suite |
| docs commit | this report |

## Next phase

Phase 4b (empty-chapter invariant and explicit stale-lock consent), then phase 5 keyboard/focus
and cleanup. M3 remains blocked until M2f is accepted.
