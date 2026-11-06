# M3i2a — DocumentGateway and SaveCoordinator boundaries

**Role:** Implementer / Builder  
**Milestone:** M3i — Core stabilization  
**Base:** current `main` after M3 acceptance (`60923a0`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** first runtime-boundary slice. Behavior-preserving refactor only; no UI, schema, command,
layout, token, or API changes.

## Context

Read `AGENTS.md`, `docs/architecture/core-stabilization.md`, `docs/reviews/m3h-review.md`, and the
current `apps/desktop/src/renderer/src/state/runtime.ts`. The runtime directly calls
`window.noteforest` for persistence/IPC and mixes save/autosave/flush/error state with document and
editor state. Extract the platform and save boundaries without changing user-visible behavior.

## Required work

1. **DocumentGateway**
   - Define a typed port for the runtime's document-platform calls (apply a command, save/flush,
     and whatever else it directly uses from `window.noteforest`). Keep the Electron/preload
     implementation in the app composition layer; provide an in-memory/fake implementation for tests.
   - Inject the gateway into `DocumentRuntime` (constructor or composition root). No direct
     `window.noteforest` calls from the runtime after this slice.
   - Preserve typed results and error messages exactly.

2. **SaveCoordinator**
   - Move save/autosave/flush/save-failure/retry state into a focused coordinator with an explicit
     state machine or discriminated-union state.
   - Keep the public runtime API used by the UI (`saveState`, `save`, `flush`, retry/copy/reload
     callbacks) behavior-compatible.
   - Preserve atomic save, backup, dirty/unsaved, external modification, and close/quit flush
     semantics. No new persistence behavior.
   - Do not move canonical document/undo/editor projection in this slice; that is a later slice.

3. Keep the runtime as the composition point so the UI does not need a broad rewrite. Remove only
   the extracted responsibilities.

4. Add tests for the gateway contract and save-coordinator transitions; existing save-failure,
   flush, recovery, and e2e tests must remain green.

## Guardrails

- No visual change; no new runtime dependency.
- No change to document schema, command semantics, revision, undo, or save file format.
- Do not touch tests outside the save/gateway boundary unless adapting imports.
- Do not merge the session/editor projection into this slice.

## Tests and gates

- `npm run typecheck`
- targeted vitest for gateway/save coordinator
- `npm test`
- `npm run e2e:critical`
- `npm run test:recovery:run`
- `npm run verify:fast`

The Orchestrator runs one full `npm run verify` after integration. No fixed sleeps or native dialogs.

## Deliverable

Report: worktree path, branch, base, commit, files, new ports/coordinator API, behavior-preservation
evidence, tests/timings, risks, not verified. Do not merge or push. Stop and ask if the extraction
would change save, flush, lock, or recovery semantics.
