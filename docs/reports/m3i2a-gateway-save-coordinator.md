# M3i2a — DocumentGateway and SaveCoordinator boundaries

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-595adc25`  
**Branch:** `t3/m3i2a-document-gateway-save-coordinator`  
**Base:** `35d582f` (docs: start M3i pre-M4 stabilization; M3 acceptance is `60923a0`)  
**Commit:** `78e2731` — `refactor: extract document gateway and save coordinator`  
**Scope:** behavior-preserving runtime boundary slice. No schema, command, revision, undo, editor,
visual, token, dependency, or external API change. No merge or push.

## Summary

`DocumentRuntime` no longer touches `window.noteforest`. Platform calls go through a typed
`DocumentGateway` port with three implementations/wiring points:

- `document-gateway.ts` — the port;
- `electron-document-gateway.ts` — composition-layer adapter over the preload bridge, resolved at
  call time;
- `memory-document-gateway.ts` — in-memory fake that executes real core commands and scripts save
  and recovery results for tests.

Save/autosave/flush/save-failure/retry state moved to `SaveCoordinator`, an explicit
discriminated-union lifecycle. `DocumentRuntime` still owns the canonical document, the serial
queue, undo/redo, content extraction, and editor projection; it exposes the same public save API
(`dirty`, `saveState`, `saveError`, `saveFailure`, `saveNow`, `flush`, `retrySave`, `saveCopy`,
`overwriteExternal`, `reloadFromDisk`, `commitPending`) via delegation/getters.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/state/document-gateway.ts` | new typed port (`takeOverLock`, `apply`, `save`, `saveCopy`, `restoreBackup`, `reloadDocument`) |
| `apps/desktop/src/renderer/src/state/electron-document-gateway.ts` | new preload adapter; `window.noteforest` read at call time |
| `apps/desktop/src/renderer/src/state/memory-document-gateway.ts` | new in-memory fake + call log + scripted results |
| `apps/desktop/src/renderer/src/state/save-coordinator.ts` | new save lifecycle, timers, backoff, recovery actions |
| `apps/desktop/src/renderer/src/state/runtime.ts` | injects gateway/coordinator; removes timers, save fields, direct bridge calls |
| `apps/desktop/src/renderer/src/state/registry.ts` | composition root passes the Electron gateway explicitly |
| `apps/desktop/test/document-gateway.test.ts` | new gateway contract and runtime-injection tests (7) |
| `apps/desktop/test/save-coordinator.test.ts` | new transition/backoff/recovery tests (13) |

Runtime shrinks by ~150 lines net (`+69 / −218` in the diff); no other production file changed.

## Port and coordinator API

### `DocumentGateway`

```ts
interface DocumentGateway {
  takeOverLock(packagePath: string): Promise<TakeOverLockResult>;
  apply(packagePath: string, command: DocumentCommand): Promise<ApplyResult>;
  save(packagePath: string, options?: SaveRequestOptions): Promise<SaveResult>;
  saveCopy(packagePath: string): Promise<SaveCopyResult>;
  restoreBackup(packagePath: string, sourcePath: string): Promise<RestoreBackupResult>;
  reloadDocument(packagePath: string): Promise<ReloadDocumentResult>;
}
```

Results and messages are returned unchanged; no error is translated. `DocumentRuntime` takes the
gateway as an optional fourth constructor argument. The default is the Electron adapter, which keeps
existing tests that stub the bridge working; `registry.ts` injects one explicit adapter as the
composition root. The fake is injected in the new tests and needs no global bridge.

### `SaveCoordinator`

```ts
interface SaveCoordinatorPorts {
  queue: SerialQueue;
  isEditable(): boolean;
  commit(): Promise<boolean>;
  write(options?: SaveRequestOptions): Promise<SaveResult>;
  saveCopy(): Promise<SaveCopyResult>;
  applyRevision(revision: number | undefined): void;
  changed(): void;
}
```

State is a discriminated union (`saved`, `unsaved`, `saving` with optional retained failure,
`error` with required failure). Public methods: `noteTextEdit`, `noteStructuralChange`,
`markContentCommitted`, `recordFailure`, `scheduleSave`, `saveNow`, `overwriteExternal`, `retrySave`,
`saveCopy`, `clearPendingCommit`, `clearTimers`, `reset`, `dispose`; getters `dirty`, `saveState`,
`saveError`, `saveFailure`, `isDisposed`.

Preserved timings: content commit 220 ms, autosave 800 ms, retry backoff 2 s / 5 s / 15 s then stop.
The serial queue stays in the runtime, so saves, content commits, and structural commands remain
mutually exclusive.

## Behavior-preservation evidence

- **Atomic save / backup / file format:** no change to `packages/core`, `apps/desktop/src/main`, the
  preload bridge, or the shared IPC contract. Main-process save, backup, lock, and recovery paths
  are untouched.
- **Save failure state:** typed code and message preserved; dirty stays true; autosave pauses while
  a failure owns the retry schedule; `saveError` is the failure message in `error` and `null` while
  retrying; Retry resets the attempt to 0 while keeping the failure visible.
- **Dirty/unsaved:** an edit during an in-flight write still ends in `unsaved`, not `saved`, and
  schedules the next autosave; a content commit during an active failure keeps the failure
  authoritative.
- **External modification:** overwrite remains available only for `external-modification`; a normal
  save never sends `overwriteExternal`; a failed overwrite keeps the new typed failure.
- **Save copy / reload / takeover:** a successful copy clears the failure and re-enables autosave;
  reload leaves the failure intact when the reload itself fails; reload/takeover reset timers,
  dirty, and failure only after the new snapshot is in place.
- **Close/quit flush:** `flush` still delegates to the same serialized `saveNow`; `flushDocuments`
  reads the same getters; e2e close/quit and failed-save guard tests pass.
- **Notifications:** save-state changes still call the runtime notifier, so all UI consumers update
  through the existing `seq` subscription. No new event path.
- Existing tests that deliberately stub `window.noteforest` (save-failure, empty-chapters,
  undo-stack, idle-anchor-removal) pass unchanged.

## Tests and timings

| Gate | Result |
|---|---|
| `npm run typecheck` | pass (desktop node + web, core, layout, pdf) |
| new gateway + coordinator vitest | 20/20 pass; with save-failure/flush: 42/42, 0.45 s |
| `npm test` | 50 files, 539/539 pass, 1.79 s (was 519; +20 new) |
| `npm run e2e:critical` | 21/21 pass, 60.1 s standalone; 21/21 in verify:fast, 45.6 s |
| `npm run test:recovery:run` | 14/14 pass, 18.1 s |
| `npm run verify:fast` | exit 0 after the final commit |

The e2e build is the normal `electron-vite build`; no fixed sleeps or native dialogs were added.
The new tests use fake timers, not wall-clock delays.

## Risks and notes

- `SaveCoordinatorPorts.commit()` must record its failure before returning `false`; the runtime does
  this, and the contract is documented. A future implementation that returns `false` silently would
  leave the phase in `saving`, which is why the adapter contract is explicit.
- The in-memory gateway executes real core commands and is test-only; it is not imported by the
  production runtime or the registry.
- The runtime keeps a default Electron gateway for constructor compatibility; production
  composition passes the adapter explicitly. No runtime code path calls `window` directly.
- Save-state notification counts are unchanged except where notification points collapsed into one
  transition; UI state values and transitions are identical.

## Not verified

- Full `npm run verify` — owned by the Orchestrator after integration.
- UI, visual-regression, and performance suites, plus screenshots/VoiceOver — no UI or token change
  in this slice, so they were not run.
- Repeated e2e runs / flake stress; one green pass per gate.
- No merge, push, or review.
