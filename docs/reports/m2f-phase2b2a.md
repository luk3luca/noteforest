# M2f phase 2b2a — external-modification recovery

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/453c9f13`  
**Base:** `d61ac27` (`main`: docs: start M2f phase 2b2a external modification)  
**Scope:** external-modification state only. No backup restore (2b2b), corrupt/missing/newer
package recovery (phase 4), undo, keyboard, empty chapters, stale locks, M3, page view, or PDF.

## Verdict

`external-modification` is now a distinct, explicit save-failure state. The banner says the
file changed on disk outside NoteForest and that local changes were not written. It offers
**Overwrite…** in addition to the existing **Retry**, **Save a copy…**, **Reload from disk…**,
and **Reveal in Finder** actions. Overwrite opens a modal that names the package path, states
that the external changes will be lost, focuses **Cancel** by default, and only then saves
through the existing per-document queue with `overwriteExternal: true`.

Permission, disk-full, read-only, lock, backup, invalid-document, not-found, and unknown
failures never render Overwrite. Reload, Save copy, and Reveal are unchanged. After a successful
overwrite the store records the new hash, so the next normal save succeeds with no repeated
false conflict. A failed overwrite keeps the banner and replaces the typed error with the new
one. Close/quit still block through the phase 2a flush contract.

## What changed

### Shared IPC and main process

- `apps/desktop/src/shared/api.ts`: `SaveRequestOptions { overwriteExternal?: boolean }` and
  `NoteForestApi.save(packagePath, options?)`. No second save path.
- `apps/desktop/src/preload/index.ts`: forwards the optional save options unchanged.
- `apps/desktop/src/main/index.ts`: `document:save` passes the options to the library.
- `apps/desktop/src/main/library.ts`:
  - `saveDocument(packagePath, options)` validates the options object and requires
    `overwriteExternal` to be a boolean; anything else fails with `unknown` and
    `Invalid overwrite flag.` before the store is opened.
  - An overwrite of a read-only store fails with `read-only` and never reaches the writer.
  - The flag is forwarded only when it is exactly `true`; the normal save path is unchanged.
  - No raw path write is introduced; the existing store/atomic writer remains the only writer.

### Renderer state machine

- `lib/save-failure.ts`:
  - `canOverwriteExternal(code)` and `saveFailureActions(code)` encode the closed action
    availability. Overwrite is present only for `external-modification`.
  - `overwriteConfirmation(packagePath)` returns the dialog title, path-bearing description,
    confirm label, and `defaultAction: 'cancel'`.
  - The external-modification headline/hint now say the file changed on disk outside
    NoteForest, the changes were not written, and overwrite is one of the explicit choices.
- `state/runtime.ts`:
  - `overwriteExternal()` runs inside the same serial queue as commits, saves, reload, and
    structural commands. It refuses unless the active failure is `external-modification`,
    commits the editor buffer, calls `save(path, { overwriteExternal: true })`, and reuses
    the existing success handling (revision, dirty state, pending-edit check, autosave).
  - On failure it registers the returned typed code/message through `registerSaveFailure`;
    the banner stays and the attempt/backoff sequence continues.
  - Success clears `saveFailure`/`saveError`, sets `saved` when no edit is pending, and
    re-enables normal autosave. The core store updates `lastSaved` to the new hash.
- `shell/SaveFailureBanner.tsx`: renders **Overwrite…** (danger styling) only when
  `canOverwriteExternal(failure.code)` is true; the 2b1 actions and backoff are unchanged.
- `shell/Dialogs.tsx` + `state/shell.ts`: new `overwrite-external` dialog kind. It focuses
  Cancel explicitly on mount instead of relying on dialog focus order.

## Exact dialog behavior

```text
Overwrite file on disk?

The file at /Users/…/library/linear-algebra changed on disk outside NoteForest.
Overwriting replaces those external changes with this window’s content; they will
be lost. This cannot be undone.

“Linear algebra” will replace /Users/…/library/linear-algebra.

The external changes will be lost. Reload from disk instead if you want to keep them.

                                              [Cancel]  [Overwrite]
```

| Interaction | Behavior |
|---|---|
| Open | From the banner’s **Overwrite…** button; only present for `external-modification`. |
| Default focus | **Cancel**; Enter cancels. Overwrite is never preselected. |
| Cancel / Escape / outside click | Closes the dialog. The external file is byte-identical and the banner remains. |
| Confirm **Overwrite** | Closes the dialog, commits pending text, then calls the save IPC with `{ overwriteExternal: true }` through the per-document queue. |
| Success | Banner clears, status becomes Saved (or Unsaved if an edit arrived during the write), autosave resumes, next save uses the new hash. |
| Failure | Banner remains; the new typed code/message replaces the old one (for example permission) and the backoff continues. |
| Permission/disk/read-only/etc. | No Overwrite button exists on the banner, so this dialog cannot be opened from those states. |

## Action availability

| Failure code | Retry | Overwrite | Save a copy | Reload | Reveal |
|---|:---:|:---:|:---:|:---:|:---:|
| `external-modification` | yes | **yes** | yes | yes | yes |
| `permission` | yes | no | yes | yes | yes |
| `disk-full` | yes | no | yes | yes | yes |
| `read-only` | yes | no | yes | yes | yes |
| `lock-lost` | yes | no | yes | yes | yes |
| `backup-failed` | yes | no | yes | yes | yes |
| `invalid-document` | yes | no | yes | yes | yes |
| `not-found` | yes | no | yes | yes | yes |
| `unknown` | yes | no | yes | yes | yes |

## Before / after

| Behavior | Before (2b1) | After (2b2a) |
|---|---|---|
| External modification reason | generic “file changed on disk” under the save-failure banner | dedicated headline: changed on disk **outside NoteForest**; local changes not written |
| Keep local changes over the external file | impossible from the UI | **Overwrite…**, explicit modal, Cancel default |
| Overwrite safety | n/a | path named, external loss stated, never default, never silent |
| Overwrite transport | n/a | same per-document queue and save IPC; flag validated in main |
| After overwrite | n/a | new hash recorded; next save succeeds without a false conflict |
| Failed overwrite | n/a | banner stays with the new typed error and backoff |
| Permission/disk/read-only | no Overwrite (correct) | unchanged: no Overwrite |
| Reload / Save copy / Reveal | available | unchanged |
| Close/quit on failure | blocked by phase 2a flush | unchanged; existing close test still passes |

## Tests added

| Layer | Test | What it proves |
|---|---|---|
| Unit | `apps/desktop/test/save-failure.test.ts` — action availability | Overwrite appears only for `external-modification`; the other four actions exist for every code |
| Unit | `apps/desktop/test/save-failure.test.ts` — confirmation | dialog names the path, warns the external changes are lost, confirm label is Overwrite, default is Cancel |
| Unit | `apps/desktop/test/save-failure.test.ts` — overwrite success | `save(path, { overwriteExternal: true })` is called through the queue, failure clears, state is `saved`, dirty is false |
| Unit | `apps/desktop/test/save-failure.test.ts` — overwrite failure | banner keeps the new typed error (permission) and attempt 2 |
| Unit | `apps/desktop/test/save-failure.test.ts` — wrong state | overwrite is refused when the failure is not external modification; no save IPC is sent |
| Unit | `apps/desktop/test/save-failure.test.ts` — main validation | non-boolean/object/array/null overwrite options fail before opening the document |
| Unit | `packages/core/test/storage.test.ts` — forced save baseline | after `overwriteExternal`, the next normal save succeeds; no repeated false conflict |
| E2E | external modification → Cancel → Overwrite | banner is distinct, dialog names path, Cancel leaves bytes untouched, Overwrite writes local content, later save succeeds |
| E2E | external modification → Reload | external content appears, local content is gone, disk is never written |
| E2E | external modification → Save a copy | copy contains local content, original external bytes are untouched |
| E2E | permission failure | still no Overwrite action (existing test updated) |
| E2E | failed close | still blocked by the native Retry/Cancel dialog (existing test unchanged) |
| Visual | `tests/visual/m2-screenshots.test.mjs` | 1440×900 external-modification banner and overwrite confirmation screenshots |

All waits are conditions (`waitForFunction`, locators); `grep -rn waitForTimeout tests/e2e
tests/support tests/visual` returns 0. No data-safety, flush/close, or normal save test was
removed.

## Gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| Unit | `npm test` | 177/177, 17 files, 1.49 s |
| Critical e2e | `npm run e2e` | 21/21, 38.1 s test, 46.2 s node run incl. build |
| Fast gate | `npm run verify:fast` | pass, ~48 s |
| Build | `npm run build` | pass (existing `use client` dependency warnings unchanged) |
| No fixed waits | `grep -rn waitForTimeout tests/e2e tests/support tests/visual` | 0 |
| Visual evidence | `node --test --test-name-pattern="external-modification banner" tests/visual/m2-screenshots.test.mjs` | pass, 2.0 s |
| Screenshots | `artifacts/m2e/external-modification-1440x900.png`, `external-overwrite-confirm-1440x900.png` | generated (gitignored) |

New e2e durations: external reload **1.51 s**, external overwrite **2.55 s**, external save
copy **2.40 s**. The previous 18 tests still pass; the suite remains under the 60 s budget.

## Known gaps / risks

- **Save copy still clears the original failure by contract.** If the original is still
  externally modified, autosave can re-register the same conflict after the copy succeeds. The
  copy itself is safe; the user can then Reload or Overwrite. This is inherited from 2b1.
- **Overwrite does not create a separate “conflict copy”.** The safety backup is the normal
  pre-save backup of the external bytes; there is no user-visible conflict snapshot in 2b2a.
  A richer conflict-copy flow can be added with backup restore in 2b2b if the product wants it.
- **The main process validates the flag type and writability, not “this document currently has
  an external modification”.** Only the renderer’s banner/dialog exposes the action, and the
  store still requires the caller to pass the explicit flag. A hostile renderer could force a
  write; this is the same trust boundary as the existing save IPC and is out of scope here.
- **No separate external-modification close/quit e2e.** Close/quit share
  `flushOpenDocuments`; the existing failed-close test (permission) still proves the phase 2a
  contract, and the external test proves the recovery surface.
- **Reveal still uses `path.resolve`, not `realpath`.** Symlink escape remains F10.
- Only macOS was exercised in this worktree.
- Visual judgement of the two new screenshots remains the product owner’s gate.

## Next phase

Phase 2b2b: backup listing/restore on top of this surface, without changing the external
modification semantics. After that, F2 undo, F3/F6/F7 data safety, F5/F16 keyboard/cleanup as
scheduled in `docs/tasks/m2f-stability-fixes.md`.
