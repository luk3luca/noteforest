# M3i3 — Document repository, schema migrations, asset-store contract

**Role:** Implementer / Builder  
**Milestone:** M3i — Core stabilization  
**Base:** current `main` after M3i2a/M3i5a (`343d676`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** persistence boundary and migrations. No UI, runtime projection, command semantics, image
pipeline, or visual changes.

## Context

Read `AGENTS.md`, `docs/architecture/core-stabilization.md`, the persistence/backup code in
`packages/core` and `apps/desktop/src/main`, and `docs/reviews/m3-review.md` S3-3/migration notes.
The document package is versioned, but there is no explicit ordered migration pipeline or repository
contract. Before real user documents and M4/M5, make the persistence boundary explicit without
changing the on-disk format.

## Required work

1. **DocumentRepository contract**
   - Define a typed repository boundary for loading, validating, saving, backup, and listing a
     document package. Keep Node/Electron file-system code in the main/core-node layer; no renderer
     imports.
   - Preserve atomic save, backup-before-write, lock, recovery, external-modification, and
     newer-document behavior exactly.
   - Add an in-memory repository test double if useful; do not change runtime save semantics.

2. **Schema migrations**
   - Add an ordered `migrateDocument`/migration registry that upgrades from every supported
     `schemaVersion` to the current one.
   - For v1 (the current schema) the migration list may be empty, but the framework and tests must
     exist.
   - Fixtures: one document per version; test upgrade, idempotence, unknown newer version
     read-only, and invalid/corrupt input unchanged.
   - Do not bump the schema or change the document format in this slice. Do not invent future
     migrations.

3. **AssetStore contract only**
   - Define the asset-store interface needed by M3c3b: content-addressed asset id, read/insert,
     missing-asset result, path/URL resolution. No image UI, rendering, or asset implementation.
   - Keep it in the appropriate package/layer; no renderer file-system access.

4. Update docs/architecture notes with the repository/migration/asset contracts and what is deferred.

## Guardrails

- No visual, layout, token, command, undo, anchor, or API change.
- No new runtime dependency; no new file format.
- Do not implement the image pipeline; only the contract.
- Preserve every recovery/backup test and the lock protocol.

## Tests and gates

- `npm run typecheck`
- targeted vitest for repository/migrations/asset contract
- `npm test`
- `npm run test:recovery:run`
- `npm run e2e:critical`
- `npm run verify:fast`

The Orchestrator runs one full `npm run verify` after integration. No fixed sleeps or native dialogs.

## Deliverable

Report: worktree path, branch, base, commit, files, repository/migration APIs, fixture matrix,
tests/timings, risks, not verified. Do not merge or push. Stop and ask if the repository boundary
would change the on-disk format, lock, or recovery semantics.
