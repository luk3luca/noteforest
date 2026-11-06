# M3i3 — repository, schema migrations, asset-store contract

**Status:** Integrated on 6 November 2026 from the builder completion summary. The builder did not
commit a separate report file; this note records the delivered API and evidence without changing the
implementation.

## Summary

- `DocumentRepository` / `NodeDocumentRepository` is the main-process persistence boundary for open,
  validate, create, save, backup, backup listing, library listing, close, dirty tracking, and flush.
  Existing `DocumentStore` still performs the atomic write and backup; lock, recovery,
  external-modification, and newer-document behavior are unchanged.
- `migrateDocument` / `SCHEMA_MIGRATIONS` is an ordered migration registry wired into
  `parseDocumentJson` before validation. v1 remains the only schema; no format bump or speculative
  migration was added.
- Schema fixtures cover current v1, unknown newer v2, invalid v1, and corrupt JSON. Synthetic registry
  tests cover ordered 1→2→3, unknown-field preservation, idempotence, input cloning, mutation
  protection, and rejection of gaps/duplicates/backwards steps/wrong versions.
- `AssetStore` is a contract only: content-addressed id, has/read/insert, path/URL resolution,
  missing-asset result. No image UI, rendering, implementation, or GC.

## APIs

Repository (`@noteforest/core/node`):

`DocumentRepository`, `NodeDocumentRepository`, `createDocumentRepository`; methods `open`,
`validate`, `create`, `save`, `backup`, `listBackups`, `list`, `get`, `close`, `closeAll`, `dirty`,
`saveAllDirty`.

Migrations (`@noteforest/core`):

`SchemaMigration`, `SCHEMA_MIGRATIONS`, `migrateDocument`, `validateMigrationRegistry`;
`parseDocumentJson` exposes `migratedFrom` / `migrationsApplied`.

Asset contract (`@noteforest/core`):

`AssetId`, `AssetStore`, `AssetReadResult`, `AssetInsertInput`, `AssetInsertResult`; `packagePath`,
`idForBytes`, `has`, `read`, `insert`, `pathFor`, `urlFor`.

## Files

New: `packages/core/src/migrations.ts`, `packages/core/src/assets.ts`,
`packages/core/src/node/repository.ts`, `packages/core/test/migrations.test.ts`,
`packages/core/test/repository.test.ts`, `packages/core/test/asset-contract.test.ts`,
`packages/core/test/fixtures/schema/*`.

Modified: `packages/core/src/serialize.ts`, `packages/core/src/index.ts`,
`packages/core/src/node/index.ts`, `packages/core/src/node/paths.ts`,
`apps/desktop/src/main/library.ts`, `apps/desktop/src/main/recovery-view.ts`,
`docs/architecture/core-stabilization.md`, `packages/core/README.md`.

## Checks (builder)

Typecheck pass; targeted repository/migration/asset tests 24/24; `npm test` 53 files / 563 pass;
recovery 14/14; critical e2e 21/21; `verify:fast` pass. Orchestrator full verify after integration:
575 unit, 36 UI, 21/45.5 s e2e, 14 recovery, exit 0.

## Risks and follow-ups

- The migration registry is empty for v1; the first real migration must bump `schemaVersion`, set the
  step version, and add a fixture.
- `restoreCandidateToPackage` still restores raw source bytes, so an older backup stays on the old
  schema until reopened; preserve this semantic until the first real migration is designed.
- The repository is the only open-store registry; future main-process code must use it rather than
  calling `openDocumentPackage` directly.
- `AssetStore` implementation, URL scheme, missing-asset UI, and GC belong to M3c3b.
- No in-memory repository fake; tests use real temp packages because save is filesystem-bound.
- Windows/Linux filesystem behavior is not exercised; macOS only.
