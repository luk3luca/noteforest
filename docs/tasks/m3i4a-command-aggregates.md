# M3i4a — command aggregates and invariant harness

**Role:** Implementer / Builder  
**Milestone:** M3i — Core stabilization  
**Base:** current `main` after M3i2c (`c6b3f6e`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** core command organization and tests only. No behavior, schema, UI, save, layout, or API
change.

## Context

Read `AGENTS.md`, `docs/architecture/core-stabilization.md`, `packages/core/src/commands.ts`, and
the existing command/destructive-undo/move/role-transition tests. `commands.ts` is ~3,850 lines and
mixes block, branch, anchor, chapter, and document commands. Split it by aggregate without changing
the public command contract or semantics.

## Required work

1. Split the command implementation by aggregate:
   - `commands/block.ts`
   - `commands/branch.ts`
   - `commands/anchor.ts`
   - `commands/chapter.ts`
   - `commands/document.ts`
   - shared validation/types/helpers in a separate module;
   - a small registry/dispatcher module that preserves the existing typed `DocumentCommand` entry
     point and result/inverse shape.
2. Keep `packages/core/src/index.ts` and all public exports behavior-compatible. Do not change
   command payloads, inverse payloads, validation messages/codes, ordering, or snapshots.
3. Add a command invariant harness that can assert:
   - apply → inverse → deep equal of the canonical document;
   - undo/redo identity for a representative command matrix;
   - a rejected command leaves the document unchanged;
   - generated IDs/created records are exactly restored.
   Reuse the harness in existing tests where it removes repetition; do not duplicate every command
   test.
4. Keep file boundaries explicit: no RN/Electron/DOM imports in core; no UI copy.
5. Do not add the architecture boundary script here; that is M3i4b.

## Guardrails

- No command semantics, schema, document format, revision, or undo behavior change.
- No new runtime dependency.
- No mass deletion of tests; preserve the existing matrices.
- Keep the core public API stable.

## Tests and gates

- `npm run typecheck`
- `npm test`
- targeted command/undo/identity suites
- `npm run e2e:critical`
- `npm run verify:fast`

The Orchestrator runs one full `npm run verify` after integration.

## Deliverable

Report: worktree path, branch, base, commit, files, aggregate map, registry API, harness coverage,
tests/timings, risks, not verified. Do not merge or push. Stop and ask if a split would change
command ordering, inverse identity, or public exports.
