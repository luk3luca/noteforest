# Schema fixtures

One document per supported schema version, plus the error cases the migration
and repository tests must preserve.

| File | `schemaVersion` | Expected result |
|---|---|---|
| `v1.json` | 1 (legacy) | migrates to v2; removes `pageSetup`, `manualBreakBeforeBlockIds`, and `viewState`; preserves other unknown fields |
| `v2.json` | 2 (current) | parses and validates; no migration applied; idempotent |
| `v3-newer.json` | 3 (unknown newer) | `newer-schema`; read-only; bytes unchanged |
| `invalid.json` | 2 | `invalid-document` (dangling top-level block); read-only; bytes unchanged |
| `corrupt.json` | malformed JSON | `malformed-json`; read-only; bytes unchanged |

The ordered migration framework is also exercised with synthetic registries in
`test/migrations.test.ts`.
