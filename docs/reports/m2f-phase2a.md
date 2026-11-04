# M2f phase 2a — flush/close contract

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-bb6dd8ec`  
**Branch:** `t3/fix-flush-close-handshake`  
**Base:** `ce42f74` (`main`: docs: start M2f phase 2a flush/close contract)  
**Scope:** F4 flush/close handshake only. No save-failure/external-modification recovery UI (phase
2b), undo, corrupt documents, keyboard, empty chapters, stale locks, M3, page view, or PDF.

## Verdict

A flush timeout or renderer error can no longer close or quit silently. The renderer returns a typed
`{ status: 'ok' | 'error' | 'timeout' }`; `ok` proceeds, while `error`/`timeout` keep the window open
and show a native **Retry / Cancel** dialog with the real reason. The preload forwards a rejected
handler as `{ status: 'error', error }` instead of acknowledging it. The normal close/quit path is
still one action and preserves unsaved content, and the S1 quit-after-last-window fix still holds.

The critical suite is **14/14 in 21.8 s** (28.8 s node run including build), unit **155/155 in
1.37 s**, and `verify:fast` passes. All new waits are conditions; no fixed sleeps were added.

## What changed

### Shared contract

- `apps/desktop/src/shared/api.ts`: `FlushStatus` and `FlushResult`; `onRequestFlush` now returns
  `Promise<FlushResult>`.
- `apps/desktop/src/shared/flush.ts` (new): `normalizeFlushResult` turns a missing, malformed, or
  unknown handler value into `error`; only an explicit `{ status: 'ok' }` is success. Shared by
  preload and main so neither side trusts the other's shape.

### Main process — `apps/desktop/src/main/index.ts`

- `requestRendererFlush` resolves `FlushResult`, not `void`. A timer that expires resolves
  `{ status: 'timeout', error: 'The editor did not confirm the save within N ms.' }`.
- `app:flush-done` accepts the result payload, validates it with `normalizeFlushResult`, and resolves
  the matching waiter. Unknown request IDs are ignored.
- `attemptClose` loops: `ok` continues; `error`/`timeout` calls `showFlushFailure`. **Retry**
  re-requests the flush, **Cancel** keeps the window open and clears `quitting`. The existing
  unsaved-changes prompt for a live dirty window is unchanged.
- Timeout override: `NOTEFOREST_FLUSH_TIMEOUT_MS` (positive integer, test-only). Production default
  stays **2500 ms**.
- S1 guard unchanged: `before-quit` still uses `quitCanProceed(allowClose, hasLiveWindow)`, so a
  quit with no live window proceeds without a prompt.

### Preload — `apps/desktop/src/preload/index.ts`

- Forwards the handler's real result after normalization.
- A rejected handler sends `{ status: 'error', error: <message> }`. The old `.catch(() => undefined)
  .finally(send flush-done)` acknowledgement is gone.
- The bridge is still one channel in, one channel out; no new invoke surface.

### Renderer — `apps/desktop/src/renderer/src/App.tsx`

- `flushOpenDocuments()` awaits every runtime's `commitPending()` and returns `ok` only when all
  commits succeed, no document is read-only, and no document is in a failed-save state. Failures are
  aggregated as `<document title>: <reason>`; the session write is also awaited.
- The test-only `setFlushMode('normal' | 'error' | 'hang')` hook lives on the existing
  `window.__noteforestTest` bridge (same gating level as phase 1).

## Exact dialog behavior

| Situation | Native dialog | Buttons | Result |
|---|---|---|---|
| Flush `ok` and no unsaved changes | none | — | close/quit proceeds |
| Flush `ok` and a live dirty window (production) | existing unsaved-changes prompt: “Save changes to … before closing?” | Save / Don’t Save / Cancel | unchanged behavior; Cancel keeps the window |
| Flush `timeout` while closing | error, title “Changes not saved”, message “… before closing.” | **Retry** (default) / **Cancel** | both keep the window; Retry re-requests the flush |
| Flush `timeout` while quitting | error, title “Changes not saved”, message “… before quitting.” | **Retry** / **Cancel** | Cancel clears the quit; Retry re-requests and quits on `ok` |
| Flush `error` while closing/quit | same dialog; detail starts with the aggregated title/reason | **Retry** / **Cancel** | no silent force close exists in phase 2a |
| No live window (last window already gone) | none | — | quit proceeds (S1) |

The detail always ends with: “The window is still open. Retry the save, or cancel and keep working.”
No “Close without saving” action is offered; an explicit force path is deferred to phase 2b.

## Before / after

| Behavior | Before | After |
|---|---|---|
| Main flush result | resolves `void` on reply or 2.5 s timeout | typed `ok` / `error` / `timeout`; timeout never `ok` |
| Renderer rejection | preload swallowed it and sent `flush-done` | preload sends `{ status: 'error', error }` |
| Renderer commits | `Promise.allSettled`, rejected commits ignored | sequential awaited commits, failures aggregated with title |
| Close/quit on timeout | proceeded silently | window/app stays open with Retry/Cancel |
| Retry | no path | re-requests the flush and closes on `ok` |
| S1 quit after last window | fixed in phase 1 | unchanged and covered by the phase 1 e2e |

## Tests added

| Layer | Test | What it proves |
|---|---|---|
| Unit | `flushDecision` ok / timeout / error / no live window | `ok` proceeds; failures block a live window; no window allows quit |
| Unit | `normalizeFlushResult` | malformed/missing results never become `ok`; reasons survive |
| E2E | saves pending edits on close, relaunch restores them | normal close is one action and flushes unsaved typing |
| E2E | saves pending edits on quit, relaunch restores them | normal quit flushes content and exits |
| E2E | flush timeout → window open + dialog → Retry with `ok` closes | no silent close; dialog copy and Retry path |
| E2E | flush error on quit → app open + reason → Cancel → later quit succeeds | preload forwards the real rejection; Cancel is safe |
| E2E | close last window, then quit | phase 1 S1 regression still passes |

The native dialog is mocked in the main process from Playwright (`dialog.showMessageBox` replaced by
a recorder/resolver). Tests assert the real options main passes: title, message, aggregated detail,
button order, and default/cancel IDs. No screenshot is applicable: the change has no renderer
pixels, and the dialog is a native OS surface.

## Gates

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npm run typecheck` | pass |
| Unit | `npm test` | 155/155, 15 files, 1.37 s |
| Critical e2e | `npm run e2e` | 14/14, 21.8 s test, 28.8 s node run incl. build |
| Fast gate | `npm run verify:fast` | pass |
| No fixed waits | `grep waitForTimeout tests/e2e` | 0 |
| S1 regression | critical “quits after the last window is closed” | 0.6 s to process exit |

## Known gaps / risks

- **Read-only document blocks window close.** Per the task brief, a read-only runtime makes the
  flush return `error`, so the Retry/Cancel dialog appears until the tab is closed. Closing the tab
  remains possible. A read-only recovery surface is phase 2b.
- **A persisted save error cannot be fixed by Retry alone.** `Retry` re-commits and reports the same
  error; the recovery actions (reload/overwrite/copy) are phase 2b by scope.
- **No force-close action.** A permanently hung renderer leaves Cancel as the only escape, by
  design; an explicit, clearly labelled force path is a later decision.
- **Session-write failure blocks close.** The session is UI state, not document content; it is
  included in the aggregated result because the flush already awaited it and the error was previously
  swallowed. This is stricter than the brief's document-only minimum.
- **The test hook ships on `__noteforestTest`.** `setFlushMode` is reachable only through the
  existing test bridge; gating that bridge behind dev/E2E is F10, not this phase.
- Only macOS was exercised in this worktree.

## Next phase

Phase 2b (save-failure and external-modification recovery UI): readable failure state with
reload/overwrite/copy/restore-backup actions, read-only/stale-lock recovery surfaces, and a
recoverable path instead of a blocking Retry loop. Undo (F2), corrupt documents (F3), keyboard
(F5/F16), and empty chapters (F6) remain after that.
