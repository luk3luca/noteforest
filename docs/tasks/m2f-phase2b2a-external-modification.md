# M2f phase 2b2a — External modification: reload/overwrite

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F4; `docs/tasks/m2f-stability-fixes.md` phase 2  
**Out of scope:** backup restore (2b2b), corrupt/missing/newer package recovery (phase 4), undo, keyboard, empty chapters, stale locks, M3/page/PDF

## Problem

When the file changes on disk while a document is open, saving returns `external-modification`, but the 2b1 banner offers no explicit overwrite path. The user can reload or save a copy, but not deliberately keep local changes over the external file. There is also no clear visual distinction between a permission failure and a concurrent external edit.

## Scope

- Surface `external-modification` as its own banner state with a clear message: the file changed on disk outside NoteForest; local changes were **not** written.
- Actions:
  - **Reload from disk** — existing 2b1 path, explicit confirm, discards local changes.
  - **Overwrite** — explicit confirm naming the file/path and the fact that the external changes will be lost; then save with `overwriteExternal: true`. Never default, never silent.
  - **Save a copy…** — existing 2b1 path; original untouched.
  - **Reveal in Finder** — existing.
- No “Overwrite” for permission/disk-full/read-only failures; only for external modification.
- Overwrite must be serialized through the same per-document queue; on success clear the failure, set saved, re-enable autosave. On failure keep the banner and show the new typed error.
- Preserve the 2b1 banner/actions/backoff and phase 2a flush/close behavior.
- Do not expose backup restore here (2b2b).

## Core/main/renderer

- Reuse the existing `external-modification` result and `overwriteExternal` flag in the core store; do not add a second save path.
- Main save IPC accepts an explicit overwrite flag from the renderer only for this action; validate it is boolean and the document is open/writable. No raw path writes.
- Renderer confirm dialog copy must name the document path and state that disk changes will be replaced. The confirm default is Cancel.
- After overwrite, the next external-modification check uses the new hash; no repeated false conflict.

## Tests

- Unit: banner action availability per failure code (overwrite only for external-modification); overwrite confirm default/cancel; state machine clears on success.
- E2E:
  - open doc, modify `document.json` externally, edit locally, save → external-modification banner;
  - Overwrite → confirm dialog → save succeeds, file contains local content, no banner;
  - Cancel overwrite → file untouched, banner remains;
  - Reload → external content in editor, local changes gone only after confirm;
  - Save a copy → original external file untouched, copy valid;
  - permission failure still has no Overwrite action;
  - close/quit still respects the 2a contract.
- Condition waits, no fixed sleeps; critical e2e <60 s.

## Acceptance

External modification is explicit and recoverable; Overwrite is explicit/confirmed and never default; Reload/Save copy still work; original is never silently overwritten; `npm run typecheck`, `npm test`, `npm run e2e`, `npm run verify:fast` pass.
