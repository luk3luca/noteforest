# M2f phase 2b1 — save-failure recovery surface

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/85d6216e`  
**Base:** `d8faae1` (`main`: docs: start M2f phase 2b1 save-failure recovery)  
**Scope:** F4 save failure only. No external-modification overwrite/backup (2b2), corrupt/missing/newer
package recovery (phase 4), undo, keyboard, empty chapters, stale locks, M3, page view, or PDF.

## Verdict

A failed save is now a typed, persistent, per-document state with a recovery surface. The core store
classifies permission and disk-full I/O failures; the main process preserves that code, the renderer
keeps the failure visible, and autosave backs off (2 s → 5 s → 15 s → stop) instead of silently
stopping or hammering. **Retry**, **Save a copy…**, **Reload from disk…** (explicit confirm), and
**Reveal in Finder** all work; overwrite is not offered in this phase. The status bar never says
“Saved” while a commit or save is pending or after a failure. Close/quit still block through the
phase 2a flush contract, and the normal save path is unchanged.

The critical suite is **18/18 in 31.4 s** (39.5 s node run including build); unit is **171/171 in
1.39 s**; `verify:fast` passes in about 45 s.

## What changed

### Typed error model (shared + core + main)

- `apps/desktop/src/shared/api.ts`: `SaveFailureCode` (`read-only`, `permission`, `disk-full`,
  `external-modification`, `lock-lost`, `backup-failed`, `invalid-document`, `not-found`,
  `unknown`), discriminated `SaveResult`, and the new `SaveCopyResult`, `ReloadDocumentResult`,
  `RevealResult` contracts.
- `packages/core/src/node/store.ts`: `ioFailureDetails()` classifies `EACCES`/`EPERM`/`EROFS` as
  `permission` and `ENOSPC`/`EDQUOT` as `disk-full`; the reason and raw errno are preserved in
  `CoreError.details` for the pre-save read, backup, and atomic-write failures. Existing core error
  codes and messages are unchanged for other failures.
- `apps/desktop/src/main/save-error.ts` (new): pure `CoreError` → `SaveFailureCode` mapping. No
  generic collapse; the original `coreCode` is returned alongside the renderer code.
- `apps/desktop/src/main/library.ts`: `saveDocument` returns the typed failure; `saveDocumentCopy`,
  `reloadDocument`, and `isInsideLibrary` (exported for validation). Copy, reload, and reveal all
  validate the library scope; invalid/missing paths return typed failures instead of throwing.
- `apps/desktop/src/main/index.ts`: `document:save-copy`, `document:reload`, and a validated
  `document:reveal`.
- `packages/core/src/node/copy.ts` (new): `writeDocumentPackageCopy` writes the **in-memory**
  canonical document (including edits that never reached disk) plus the source `assets/` into a new
  package with the existing atomic writer. It refuses to overwrite an existing `document.json`,
  refuses an invalid document, and never writes the source package.

### Renderer state machine

- `apps/desktop/src/renderer/src/lib/save-failure.ts` (new, pure): `nextSaveFailure` (attempt
  counter + 2 s/5 s/15 s backoff, stop after the 15 s retry), `prepareRetry`, `saveStatusAfterWrite`,
  and per-code headline/hint copy.
- `state/runtime.ts`:
  - `saveFailure: { code, message, attempt } | null` drives the surface; `saveError` is kept for the
    existing flush/close aggregation.
  - Autosave is scheduled normally only while no failure is active; a failure owns the backoff and
    stops after the sequence. Typing during a failure does not downgrade the status or restart
    hammering.
  - `retrySave()`, `saveCopy()`, and `reloadFromDisk()` are serialized through the same per-document
    queue as commits and structural commands.
  - An `editEpoch` check prevents the false “Saved”: edits that arrive during the awaited write leave
    the document `unsaved`, and a pending commit/timer also blocks `saved`.
  - Reload replaces the canonical document, clears the failure/dirty state, recomputes hashes, and
    rebuilds the editor; local changes are discarded only after the dialog confirmation.
- `shell/SaveFailureBanner.tsx` (new): persistent `role="alert"` document banner with the four
  actions; `editor/DocumentEditor.tsx` renders it above the editor.
- `shell/Dialogs.tsx` + `state/shell.ts`: explicit **Reload from disk?** confirmation dialog.
- `shell/StatusBar.tsx`: `data-save-state` and `data-save-failure-code` for tests; “Save failed”
  remains until recovery.
- `actions.ts`: reveal calls now surface validation failures instead of silently ignoring them.

### IPC surface (minimum)

| Channel | Input | Output |
|---|---|---|
| `document:save` | `packagePath` | typed `SaveResult` |
| `document:save-copy` | `packagePath` | native save dialog; `SaveCopyResult` |
| `document:reload` | `packagePath` | `ReloadDocumentResult` |
| `document:reveal` | `packagePath` (validated) | `RevealResult` |

The renderer never chooses the copy destination directly; the native dialog runs in the main
process. There is no second save path for the open document — the copy is written by the core
package writer, and the original is never mutated.

## Exact UI and actions

The banner is per open document, directly under the tab strip, and stays until recovery:

```text
NoteForest cannot write to this folder.
Check the folder permissions and Retry, or save a copy elsewhere. Autosave is paused.
atomic save failed; previous file kept: EACCES: permission denied, open '…'   (mono, diagnostic)
/Users/…/library/linear-algebra                                               (package path)
[Retry] [Save a copy…] [Reload from disk…] [Reveal in Finder]
```

| Action | What it does |
|---|---|
| **Retry** | Restarts the backoff sequence and saves immediately. Success clears the failure, sets `saved`, and re-enables normal autosave. |
| **Save a copy…** | Commits the editor buffer to the canonical store, opens the native Save dialog (default `<library>/<folder> copy`), writes the in-memory document + assets atomically, leaves the original untouched. A copy inside the library opens in a new tab; a copy outside is revealed in Finder. |
| **Reload from disk…** | Opens an explicit confirmation (“Unsaved changes in this window will be discarded…”). On confirm, the store is closed and reopened from disk, the editor is rebuilt, and the failure/dirty state is cleared. Cancel keeps local changes and the failure. |
| **Reveal in Finder** | Validates the library scope, then reveals `document.json`. |
| **Overwrite** | Not rendered in 2b1; external-modification overwrite belongs to 2b2. |

## Backoff

| Failure attempt | Next automatic attempt |
|---:|---|
| 1 | 2 s |
| 2 | 5 s |
| 3 | 15 s |
| 4+ | none — waits for Retry or another recovery action |

Manual Retry resets the attempt sequence (so a failed Retry starts again at 2 s). A successful
Retry/save copy/reload clears the failure state, and subsequent edits resume the normal 800 ms
autosave.

## Before / after

| Behavior | Before | After |
|---|---|---|
| Save failure code | one message string in the status tooltip | typed `code` + preserved core code/message, per document |
| Failure visibility | transient toast / status text | persistent alert banner with actions |
| Autosave after failure | not rescheduled | 2 s/5 s/15 s backoff, then stop until Retry/action |
| Retry | none | retries through the same typed save path |
| Recover content | none | Save a copy writes the in-memory document + assets to a new package |
| Recover state | close/reopen by hand | explicit Reload from disk confirmation |
| Diagnosis | status tooltip | Reveal in Finder with library validation |
| “Saved” while pending/failed | possible after an in-flight edit | `saving`/`unsaved`/`error` only; epoch + pending-work check |
| Typing during failure | reset to “Unsaved changes” and re-scheduled a save every 800 ms | keeps “Save failed”, no autosave hammering |
| Close/quit on failure | blocked by phase 2a flush | unchanged; blocked with the native Retry/Cancel dialog |
| Overwrite on external modification | none | still none (2b2) |

## Tests added

| Layer | Test | What it proves |
|---|---|---|
| Unit | `save-failure.test.ts` — backoff sequence | codes preserved, 2/5/15 s, stop after 4th failure, Retry restarts |
| Unit | `save-failure.test.ts` — false “Saved” | edits during an in-flight write leave `unsaved`; only a clean write reports `saved` |
| Unit | `save-failure.test.ts` — core mapping | permission/disk-full/external/read-only/lock/backup/invalid/not-found stay distinct |
| Unit | `save-failure.test.ts` — library scope | prefix/parent escapes rejected; missing paths rejected by copy/reload/save |
| Unit | `packages/core/test/copy.test.ts` | copy includes assets, source bytes unchanged, overwrite/self-copy/invalid doc refused, empty-assets copy valid |
| Unit | `packages/core/test/copy.test.ts` — errno | `EACCES`/`EROFS` → permission, `ENOSPC`/`EDQUOT` → disk-full, other → io-error |
| E2E | permission save failure → banner → backoff → Retry | save failure is visible, the four actions exist, no Overwrite, attempt 2 happens on backoff, Retry clears and writes the text |
| E2E | Save a copy after a failure | new package opens, contains the unsaved text and every block, original bytes unchanged |
| E2E | Reload confirm/cancel/discard | Cancel keeps local text and the failure; confirm discards it, reads disk unchanged |
| E2E | Close with a failed save | native Retry/Cancel appears, window stays open on Cancel, content persists after Retry + close + relaunch |
| Visual | `tests/visual/m2-screenshots.test.mjs` | 1440×900 and 1024×768 banner screenshots (on demand) |

All waits are conditions (`waitForFunction`, locators); no `waitForTimeout` was added. Data-safety,
flush/close, and normal save tests are untouched.

## Gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | pass |
| Unit | `npm test` | 171/171, 17 files, 1.39 s |
| Critical e2e | `npm run e2e` | 18/18, 31.4 s test, 39.5 s node run incl. build |
| Fast gate | `npm run verify:fast` | pass, ~45 s |
| Build | `npm run build` | pass (existing `use client` dependency warnings unchanged) |
| No fixed waits | `grep -rn waitForTimeout tests/e2e tests/support` | 0 |
| Visual evidence | `node --test --test-name-pattern="save-failure recovery surface" tests/visual/m2-screenshots.test.mjs` | pass, 2.0 s |
| Screenshots | `artifacts/m2e/save-failure-1440x900.png`, `save-failure-1024x768.png` | generated (gitignored) |

New e2e durations: permission failure + Retry **3.50 s**, save copy **2.35 s**, reload **1.61 s**,
failed close **2.33 s**. The existing 14 tests are unchanged and pass.

## Known gaps / risks

- **No Overwrite in 2b1.** An external-modification failure can be recovered with Reload or Save a
  copy, but the original cannot be overwritten from this surface; phase 2b2 owns it together with
  the overwrite/backup flow.
- **Retry cannot fix a permanent permission problem.** The native close/quit Retry still re-runs the
  flush and reports the same failure (phase 2a behavior); the user must Cancel and use the banner.
- **Save copy clears the original’s failure by contract**, then normal autosave resumes. If the
  original folder is still unwritable, the banner returns on the next attempt. The copy itself is
  already safe.
- **The copy keeps the source document ID and revision.** It is a snapshot of the same note, not a
  new note; the library can therefore show two packages with the same `documentId`. This was chosen
  so recovery preserves identity; if the product wants a fresh ID for copies, that is a small
  follow-up in `writeDocumentPackageCopy`.
- **Reveal validation uses `path.resolve`, not `realpath`.** Symlink escapes remain part of F10.
- **Read-only runtimes still show the phase 2a read-only banner**, not the save-failure surface:
  they never attempt a save. Their recovery is still close/reopen; the broader corrupt/read-only
  recovery UI is phase 4.
- **No quit-specific failed-save e2e.** Close and quit share `flushOpenDocuments` and the phase 2a
  quit tests still pass; the close test exercises the failed-save branch.
- Only macOS was exercised in this worktree.

## Next phase

Phase 2b2: external-modification overwrite/backup flow on top of this surface (explicit Overwrite,
backup listing/restore, and the 2b2-specific tests). After that, F2 undo, F3/F6/F7 data safety,
F5/F16 keyboard/cleanup as scheduled in `docs/tasks/m2f-stability-fixes.md`.
