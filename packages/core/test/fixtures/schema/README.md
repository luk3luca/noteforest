# Schema fixtures

One document per supported schema version, plus the error cases the migration
and repository tests must preserve.

| File | `schemaVersion` | Expected result |
|---|---|---|
| `v1.json` | 1 (current) | parses and validates; no migration applied; idempotent |
| `v2-newer.json` | 2 (unknown newer) | `newer-schema`; read-only; bytes unchanged |
| `invalid.json` | 1 | `invalid-document` (dangling top-level block); read-only; bytes unchanged |
| `corrupt.json` | malformed JSON | `malformed-json`; read-only; bytes unchanged |

There is no older supported version yet. The ordered migration framework is
exercised with synthetic registries in `test/migrations.test.ts`; do not add
speculative product migrations here.
