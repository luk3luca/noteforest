# M2f phase 2b1 — Save-failure recovery UI

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F4; `docs/tasks/m2f-stability-fixes.md` phase 2  
**Out of scope:** external-modification-specific overwrite/backup flow (phase 2b2), corrupt/missing/newer package recovery (phase 4), undo, keyboard, empty chapters, stale locks, M3/page/PDF

## Problem

A failed save currently shows a transient/status-bar error with no recovery action. The user can be left with an unsavable document and no way to retry, save a copy, or reload from disk. Autosave is not rescheduled after a failure.

## Scope

### Error model

- Make the save failure visible as a typed state with:
  - `code` (e.g. `read-only`, `permission`, `disk-full`, `external-modification`, `unknown`),
  - human message,
  - document path/title.
- Do not collapse all failures into “Save failed”; preserve the code/message from the core/store.
- The status bar must not show “Saved” while a commit or save is pending or failed.

### Recovery UI

- A persistent banner or document-level dialog (not a transient toast) when a save fails.
- Actions:
  - **Retry** — retry the same save; if it succeeds, clear the error and resume autosave.
  - **Save a copy…** — native Save dialog, write a new package; keep the original untouched; open or reveal the copy after success.
  - **Reload from disk** — discard unsaved renderer changes after an explicit confirmation; reload the canonical document; never silently overwrite.
  - **Reveal in Finder** — for diagnosis.
  - **Overwrite** — only for the external-modification case and only after explicit confirmation; if phase 2b2 owns that, hide/disable it in 2b1 or route to 2b2.
- No silent close/quit with a failed save; phase 2a’s flush/close contract remains.
- On failure, autosave must not hammer: backoff (e.g. 2 s, 5 s, 15 s, capped) and stop after a persistent error until Retry or a user action.
- On a successful Retry/Save copy/Reload, clear the error state and re-enable autosave.

### Core/main support

- Use the existing core store save result and error codes; do not invent a second persistence path.
- Add the minimum IPC needed for save-copy/reload/reveal; validate paths and keep the library scope.
- `save a copy` must create a valid package (document + assets) and not mutate the original.
- Reload must reopen the canonical document and release/reacquire the store state safely.

### Tests

- Unit: save-failure state machine; autosave backoff; “Saved” never set while pending/failed.
- E2E:
  - forced read-only/permission save failure → persistent recovery surface with Retry/Save copy/Reload;
  - Retry success clears the error and saves;
  - Save copy writes a new package and leaves the original unchanged;
  - Reload discards local changes only after confirmation and restores disk content;
  - close/quit still blocks on a failed save (phase 2a regression);
  - normal save path unchanged.
- Keep the critical suite <60 s; condition waits, no fixed sleeps.
- Do not remove data-safety tests.

## Acceptance

A failed save is visible, recoverable, and never silently loses or overwrites content. Retry, Save copy, and Reload work; autosave backs off; close/quit still respects the typed flush contract. `npm run typecheck`, `npm test`, `npm run e2e`, `npm run verify:fast` pass. No phase 2b2/undo/other work.
