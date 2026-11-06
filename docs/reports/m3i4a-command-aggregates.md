# M3i4a — command aggregates and invariant harness

**Date:** 6 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-531e8031`  
**Branch:** `t3/split-command-aggregates`  
**Base:** `51754a6` (docs: merge M3i2c and start M3i4a/M3i4b; code base `c6b3f6e`)  
**Commits:** `9fa2544` — `refactor: split command aggregates and add invariant harness`;
`71fe12f` — `fix: keep unknown command types off the registry prototype`; this report commit.  
**Scope:** core command organization and tests only. No command semantics, schema, document
format, revision, undo behavior, UI, save, layout, API, or dependency change. No merge or push.

## Summary

`packages/core/src/commands.ts` (3,853 lines, one clone/validate pipeline with a 26-case switch) is
now a 22-line public barrel over `packages/core/src/commands/`:

- the command shapes and result contract are in `types.ts`;
- shared validation, lookups, change reporting, branch ports, and record helpers are in `shared.ts`;
- each aggregate (block, branch, anchor, chapter, document) owns its helpers and handlers;
- structural snapshot capture/restore is isolated in `restore.ts`;
- `registry.ts` holds the exhaustively typed handler map, the dispatcher, `executeCommand`, and
  `applyInverse`.

The public entry point and exports are unchanged. The runtime `commands.js` module still exports
exactly `executeCommand`, `applyInverse`, `chapterForBlock`, and `isLegalMove` (verified from the
compiled build); every command payload, inverse payload, validation code/message, ordering,
snapshot, validation pass, revision bump, and warning aggregation is the original code.

## Files

| File | Lines | Change |
|---|---:|---|
| `packages/core/src/commands.ts` | 22 | barrel: types, `executeCommand`, `applyInverse`, `chapterForBlock`, `isLegalMove` |
| `packages/core/src/commands/types.ts` | 430 | new — result types, all 26 command shapes, `DocumentCommand`, options |
| `packages/core/src/commands/shared.ts` | 659 | new — rejection, assertions, lookups, `ChangeSet`, ports/order, record helpers |
| `packages/core/src/commands/block.ts` | 808 | new — placement/detach/promote/split/merge helpers + 7 handlers |
| `packages/core/src/commands/branch.ts` | 609 | new — existing-branch creation helper + 8 handlers |
| `packages/core/src/commands/anchor.ts` | 831 | new — selector/binding helpers + 4 handlers |
| `packages/core/src/commands/chapter.ts` | 147 | new — 4 handlers + `chapterForBlock` |
| `packages/core/src/commands/document.ts` | 114 | new — create no-op + rename handler + `createDocumentCommand` |
| `packages/core/src/commands/restore.ts` | 509 | new — delta/redo capture + record restore + `structure.restore` handler |
| `packages/core/src/commands/registry.ts` | 213 | new — typed registry, dispatcher, `executeCommand`, `applyInverse` |
| `packages/core/test/command-invariants.ts` | 216 | new — reusable apply/inverse/undo/redo/rejection harness |
| `packages/core/test/commands-invariants.test.ts` | 422 | new — 28 identity + 7 rejection cases across all aggregates |
| nine command/undo suites | — | local duplicate helpers replaced by harness imports; matrices unchanged |

No production file outside `packages/core/src/commands.ts` and the new directory changed. No test
case was deleted; the only test edits remove duplicated helper definitions and imports.

## Aggregate map

| Module | Contents |
|---|---|
| `types.ts` | `CommandErrorCode`, `AffectedIds`, `CreatedIds`, `CommandSuccess`, `CommandFailure`, `CommandResult`, all command interfaces, `DocumentCommand`, `ExecuteCommandOptions` |
| `shared.ts` | `Rejection`/`reject`, ID/content assertions, chapter/block/branch/anchor lookups, `allIds`/`freshId`, `ChangeSet`, primary child order keys, branch ports and role order lists, duplicate/promotion guards, branch record creation, `attachAsChild`, `collectSubtree`, `removeBlocks`, `canonicalJson` |
| `block.ts` | placement resolution, subtree detach, exact-branch dedupe/re-key, child promotion, single-block removal; `block.create/editContent/rename/delete/move/split/merge`; `isLegalMove` |
| `branch.ts` | shared existing-target branch creation; `branch.create/createFromSelection/delete/reorder/relabel/makeHome/moveHere/demote` |
| `anchor.ts` | mirror fields, formula-term/code validation, anchor record/binding application, same-selection lookup, selection anchor reuse, outgoing branch attach/delete; `anchor.create/repair/attachToBlock/delete` |
| `chapter.ts` | `chapter.create/rename/reorder/delete`; `chapterForBlock` |
| `document.ts` | `document.rename`; `document.create` pre-clone path (`createDocumentCommand`, `rejectionToFailure`); no-op registry entry |
| `restore.ts` | `captureStructuralDelta`, `captureRestoreCommand`, `restoreRecords`, restore validation; `structure.restore` |
| `registry.ts` | 26-entry handler map, dispatch, `executeCommand`, `applyInverse` |

Cross-aggregate imports are intentional and narrow: `branch.ts` imports `ensureSelectionAnchor`
from `anchor.ts` (one user action = anchor + target + branch), and every aggregate imports only
`shared.ts` plus pure `anchors`/`structure`/`block-ops` helpers.

## Registry API

```ts
export type CommandHandler<T extends DocumentCommand['type']> = (
  document: Document,
  command: Extract<DocumentCommand, { type: T }>,
  context: CoreContext,
  changes: ChangeSet,
) => DocumentCommand | null;

type CommandHandlerRegistry = {
  [T in DocumentCommand['type']]: CommandHandler<T>;
};

export function executeCommand(
  document: Document | null,
  command: DocumentCommand,
  options?: ExecuteCommandOptions,
): CommandResult;

export function applyInverse(
  result: CommandSuccess,
  options?: ExecuteCommandOptions,
): CommandResult;
```

- The mapped registry type makes a missing handler a compile error; the map order mirrors the old
  switch order.
- Dispatch is one lookup. A single documented `as unknown as Record<...>` widening is used because
  TypeScript cannot correlate a union discriminator with its mapped handler; unknown runtime types
  still return the exact `invalid-command: unknown command type: …` failure. The lookup is an
  own-property check, so `constructor`/`__proto__` cannot resolve a prototype method as a handler.
- `document.create` keeps its special path in `executeCommand` (empty target → no clone); the
  registry entry is a no-op, matching the old switch.
- Handlers receive the same `(document, command, context, changes)` tuple as the old case bodies.
  Statements were extracted verbatim; ID generation, record insertion, `changes.*` reporting, and
  warning order are unchanged.

## Invariant harness

`packages/core/test/command-invariants.ts`:

- `normalizedDocument` — normalizes only `document.revision` and `document.updatedAt` (the two fields
  every command advances by design).
- `expectCommandSuccess`, `undoOf`, `redoOf` — typed success/inverse assertions; undo/redo accept the
  deterministic context so inverse timestamps stay reproducible.
- `expectDocumentValid` — full `validateDocument` gate.
- `expectRecordCounts` — no lost/duplicated blocks, branches, or anchors.
- `expectUndoRedoIdentity` — apply → valid → inverse → deep equal to the pre-state → created
  block/branch/anchor/chapter IDs absent → redo → deep equal to the applied state → created records
  exactly restored → three repeated undo/redo cycles with counts and validity.
- `expectRejectedWithoutMutation` — rejected command returns a typed failure and the caller's
  document is byte-for-byte unchanged.

Forward-edit inverses (`block.editContent`, `block.rename`) deliberately stamp a fresh
`block.updatedAt`; the harness offers `ignoreRecordTimestamps` only for those two matrix entries.
Snapshot restores remain timestamp-exact, and the destructive/move suites still assert full
record-level equality.

`packages/core/test/commands-invariants.test.ts` covers 28 identity cases (document, chapter, all
seven block commands, primary/reference branch creation, both branch deletions, reorder, relabel,
makeHome, moveHere, demote, anchor create/repair/attach/delete) and 7 rejection cases (duplicate ID,
cycle, non-empty chapter, empty-chapter guard, missing target handling, anchor with outgoing
branches, duplicate anchor selection).

The harness replaced duplicated local helpers in `commands.test.ts`, `destructive-undo.test.ts`,
`move-undo.test.ts`, `split-merge.test.ts`, `anchor-commands.test.ts`, `selection-command.test.ts`,
`m3e-repair.test.ts`, `reference-edges.test.ts`, and `role-transitions.test.ts`. Their matrices and
command-specific assertions are untouched.

## Checks and timings

| Check | Result |
|---|---|
| `npm run typecheck` (all workspaces) | pass |
| `npm test` | 56 files / 631 tests / 2.1 s (baseline 55/596/2.16 s) |
| targeted command/undo suites (10 files) | 169 tests / 319 ms |
| `commands-invariants.test.ts` alone | 35 tests / 167 ms |
| `npm run e2e:critical` | 21/21 pass, 54.0 s |
| `npm run verify:fast` | exit 0 — typecheck, 631 tests, build, 21/21 e2e (53.3 s) |
| `npm run build -w @noteforest/core` | pass; compiled `commands.js` runtime exports unchanged |

## Risks

- The dispatcher needs one typed widening cast. Exhaustiveness is enforced by the registry type, so
  a new command type without a handler fails compilation; dispatch itself keeps the old unknown-type
  failure path.
- Future handler bodies must keep statement order: record creation, order-key generation, and
  `ChangeSet` calls are observable through IDs/order and `affected`/`created`.
- `branch.ts → anchor.ts` is the only cross-aggregate command dependency; it exists because
  `branch.createFromSelection` and anchor creation are a single user action with one inverse.
- The harness ignores document revision/updatedAt by definition, and block timestamps only for the
  two forward-edit commands. Snapshot-exactness is still covered by the existing destructive/move
  assertions and the matrix's exact default.
- The worktree needed `npm ci`; no dependency or lockfile change.

## Not verified / deferred

- Full `npm run verify`, recovery, UI, visual, and performance suites — orchestrator integration
  gates.
- Manual visual/VoiceOver checks — not applicable to this slice (no UI change).
- The M3i4b package-boundary script and import restrictions — explicitly out of scope.

## Next suggested step

Run the full `npm run verify` at integration, then start M3i4b (architecture boundary check) on top
of these module boundaries.
