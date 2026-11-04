# M2f phase 2a — Flush/close contract

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F4; `docs/tasks/m2f-stability-fixes.md` phase 2  
**Out of scope:** save-failure/external-modification recovery UI (phase 2b), undo, corrupt docs, keyboard, empty chapters, stale locks, M3/page/PDF

## Problem

Close/quit can report success without proof:

- `requestRendererFlush` resolves on a 2.5 s timeout and `attemptClose` treats it as acknowledged.
- The preload wrapper catches a rejected renderer handler and still sends `flush-done`.
- `onRequestFlush` uses `Promise.allSettled` and ignores rejected commits.
- Result: the last edits can be lost, or the window closes while the renderer is hung.

## Scope

### Main process

- Define a typed flush result: `{ status: 'ok' | 'error' | 'timeout'; error?: string }`.
- `requestRendererFlush` must resolve with the typed result, not a bare void; a timeout is `timeout`, never `ok`.
- `attemptClose`/quit:
  - `ok` → proceed with the existing close/quit handshake.
  - `error`/`timeout` → do **not** close. Show a native message box with the reason and actions:
    - **Retry** (re-request flush; keep the window open),
    - **Cancel** (keep the window open).
    - Do not offer a silent force-close in the normal path; if a force path is needed for a hung renderer, it must be explicit and audited in the dialog copy.
  - Preserve the unsaved-changes prompt for a live dirty window.
- Do not weaken the S1 quit fix: after the last window closes, quit still exits; the flush guard applies only while a live window exists.
- Keep the 2.5 s timeout configurable for tests (env or injected option); production default unchanged.

### Preload

- Forward the real renderer handler result to main.
- On handler rejection, send `{ status: 'error', error: message }`, never `ok`.
- Do not swallow errors in `.catch`.
- Keep the bridge narrow; no new arbitrary IPC.

### Renderer

- `onRequestFlush` must commit content and return `{ status: 'ok' }` only when every open document's commit/save flush succeeded.
- Use `Promise.all`/explicit error aggregation; a rejected commit produces `error`, not silently ignored.
- If a document is read-only or failed, return `error` with the document title/reason; do not pretend success.
- Keep the test-only flush hooks gated as in phase 1; no production debug surface expansion.

### Tests

- Unit: `flushDecision(result, hasLiveWindow)` or equivalent; `ok` proceeds, `timeout`/`error` blocks; no live window still allows quit.
- E2E:
  - normal close/quit still saves and closes;
  - forced flush timeout → window stays open, native dialog path is invoked (mock/dialog hook), retry with `ok` closes;
  - forced flush error → window stays open, error reason surfaced;
  - close the last window then quit still exits (phase 1 regression);
  - no unsaved content is lost in the normal path.
- Keep the critical e2e suite under 60 s; use condition waits, no fixed sleeps.

## Acceptance

- A timeout or renderer error never closes/quits silently.
- The preload forwards the real result; no swallowed rejection.
- Normal close/quit path remains one click and preserves unsaved content.
- S1 quit-after-last-window remains fixed.
- `npm run typecheck`, `npm test`, `npm run e2e`, `npm run verify:fast` pass.
- Report before/after and the exact dialog behavior; no phase 2b work.
