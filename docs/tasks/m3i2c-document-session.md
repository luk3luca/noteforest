# M3i2c — DocumentSession boundary

**Role:** Implementer / Builder  
**Milestone:** M3i — Core stabilization  
**Base:** current `main` after M3i2b/M3i3 (`44caff4` / `5f7383b`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** final runtime-boundary slice. Behavior-preserving refactor only; no UI, schema, save,
layout, token, or API changes.

## Context

Read `AGENTS.md`, `docs/architecture/core-stabilization.md`, the M3i2a/M3i2b reports, and
`state/runtime.ts` (now ~1,980 lines). The runtime still owns canonical document/revision, the serial
queue, structural undo/redo, command application/inverse acceptance, and the mix of document state
with editor/save/anchor services. Extract the canonical session boundary.

## Required work

1. Extract a `DocumentSession` that owns:
   - canonical `Document` and revision;
   - the per-document serial queue;
   - structural undo/redo stacks and `lastHistoryOperation`;
   - typed command execution/apply/inverse acceptance and base-revision semantics;
   - the content-commit/version notification hooks that belong to canonical state.
2. `DocumentRuntime` becomes the composition root: it wires `DocumentSession`, `EditorProjection`,
   `SaveCoordinator`, `DocumentGateway`, and the view/anchor services. Keep the public runtime API
   unchanged for UI callers.
3. Keep anchor/branch/health/selection services and editor-specific behavior in the runtime unless a
   small pure projection clearly belongs to the session; do not move UI copy.
4. Preserve:
   - M3h1 placement text-history behavior;
   - structural undo/redo identity and one-undo-per-action;
   - content commit/revision notifications (S2-4 live health);
   - save/autosave/flush/lock/recovery semantics.
5. Add focused session tests for command/inverse/undo/redo/revision; existing unit, UI, recovery, and
   e2e suites must remain green.

## Guardrails

- No visual change; no new runtime dependency.
- No change to document schema, command semantics, undo order, save format, or IPC.
- No direct `window.noteforest` access in the session; use the existing gateway/composition.
- Do not merge M3i4 command-layer work into this slice.

## Tests and gates

- `npm run typecheck`
- targeted vitest: commands, undo/redo, text history, save coordinator, projection
- `npm test`
- `npm run test:ui`
- `npm run e2e:critical`
- `npm run test:recovery:run`
- `npm run verify:fast`

The Orchestrator runs one full `npm run verify` after integration. No fixed sleeps or native dialogs.

## Deliverable

Report: worktree path, branch, base, commit, files, session API, behavior-preservation evidence,
tests/timings, risks, not verified. Do not merge or push. Stop and ask if extraction would change
undo/redo, revision, save, or recovery semantics.
