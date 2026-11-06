# M3i2b — EditorProjection boundary

**Role:** Implementer / Builder  
**Milestone:** M3i — Core stabilization  
**Base:** current `main` after M3i2a/M3i5a (`343d676`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** runtime-boundary slice. Behavior-preserving refactor only; no UI, schema, command, save,
layout, token, or API changes.

## Context

Read `AGENTS.md`, `docs/architecture/core-stabilization.md`, `docs/reports/m3i2a-gateway-save-coordinator.md`,
and `state/runtime.ts`. The runtime still owns the TipTap projection: build/replace document,
content extraction, focus/caret restore, reconcile, and the M3h1 text-history replay used by
view-only placement changes.

## Required work

1. Extract an `EditorProjection` service/module from `DocumentRuntime` with these responsibilities:
   - build the TipTap document from canonical structure + collapsed/below sets;
   - extract block bodies from the editor buffer;
   - replace the editor document and restore focus/caret;
   - reconcile the editor after structural changes;
   - preserve the M3h1 text-history capture/replay path for placement rebuilds.
2. `DocumentRuntime` composes `EditorProjection` and delegates to it. Keep the existing public
   runtime API and all editor-facing behavior identical.
3. Do **not** move canonical document/undo/structural command semantics in this slice; that is
   `DocumentSession` (M3i2c).
4. Keep the `DocumentGateway`/`SaveCoordinator` boundaries intact.
5. Add focused tests for projection build/extract/replace and history preservation; existing
   `text-history`, `adapter`, `placement`, undo, UI geometry, and e2e tests must remain green.

## Guardrails

- No visual change; no new runtime dependency.
- No change to canonical document/schema/revision/undo/save semantics.
- No direct `window.noteforest` access in the projection.
- Do not touch `Dialogs.tsx` or UI copy.

## Tests and gates

- `npm run typecheck`
- targeted vitest: text history, adapter, placement, undo/history routing
- `npm test`
- targeted UI: callout placement/stacking/undo
- `npm run test:ui`
- `npm run e2e:critical`
- `npm run verify:fast`

The Orchestrator runs one full `npm run verify` after integration. No fixed sleeps or native dialogs.

## Deliverable

Report: worktree path, branch, base, commit, files, projection API, behavior-preservation evidence,
tests/timings, risks, not verified. Do not merge or push. Stop and ask if the extraction would change
editor focus, history, or projection semantics.
