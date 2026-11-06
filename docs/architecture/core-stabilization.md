# Core stabilization — proposed M3i

**Status:** In progress. Slice 1 (tokens) delivered as M3h4; slice 2a (DocumentGateway/SaveCoordinator) and slice 5a (test harness) merged on 6 November 2026; slice 3 (repository/migrations/asset contract) delivered as M3i3, pending review. Slices 2b/2c, 4, 5b remain before M4.

**Owner:** Orchestrator.  
**Rule:** no new features, no visual changes, no new runtime dependencies.

## Why

The product works, but too much critical behavior lives in a few files:

| File | Lines |
|---|---:|
| `apps/desktop/src/renderer/src/state/runtime.ts` | ~2,530 |
| `packages/core/src/commands.ts` | ~3,850 |
| `apps/desktop/src/renderer/src/shell/Dialogs.tsx` | ~1,810 |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | ~1,360 |

The M3h1 placement-undo workaround (capture/replay ProseMirror history) shows the cost of mixing
view projection, canonical content, and undo in one runtime. M4 will add page/PDF, M5 will add an
external API, and M6 will add settings; without seams those will increase coupling.

## Stable seams to extract now

These already have behavior, tests, and a known consumer, so extracting them is not speculative:

1. **DocumentSession** — canonical document, revision, command queue, undo/redo, typed commands.
2. **DocumentGateway** — injected port for `window.noteforest`/IPC; Electron, test, and future API
   implementations. `DocumentRuntime` must not call `window` directly.
3. **EditorProjection** — TipTap document build/reconcile, history handoff, focus/caret restore.
4. **SaveCoordinator** — dirty state, autosave, save failure, retry, backup, close/quit flush.
5. **Application services** — anchors, branches, health, placement; pure projections where possible.

Classic patterns: ports & adapters, dependency inversion, repository, command bus, composition root,
discriminated unions/state machines. No DI container, no event sourcing, no microservices.

## M3i slices

### Slice 1 — Token single-source (M3h4)
- Generate CSS variables from `design-tokens.ts` or set root variables from it.
- Canonical shell values: `editorPaddingBottom` 88, `chapterGap` 28.
- Guard test: CSS and TS token values agree; card bounds, canvas, child gap, edge widths, z-index.
- No visual diff.

### Slice 2 — Runtime boundaries
- Extract `DocumentSession`, `DocumentGateway`, `SaveCoordinator`, `EditorProjection`.
- Preserve behavior and public UI calls; the runtime becomes a composition root.
- Add an in-memory gateway for tests.
- Keep canonical revision/baseRevision semantics.

### Slice 3 — Repository and schema migrations (M3i3, delivered)

- `DocumentRepository` is the typed persistence boundary in
  `packages/core/src/node/repository.ts`; `NodeDocumentRepository` implements it. It owns the
  process's open-store registry and exposes open/validate/create/save/backup/listBackups/list/
  close/closeAll/dirty/saveAllDirty. Every write delegates to `DocumentStore`, so atomic save,
  backup-before-write, single-writer lock, recovery, external-modification, and newer-document
  behavior are unchanged. `apps/desktop/src/main/library.ts` is the only consumer; the renderer
  never imports `@noteforest/core/node`.
- `migrateDocument` and `SCHEMA_MIGRATIONS` live in `packages/core/src/migrations.ts`. The registry
  is an ordered, gap-free chain from version 1 to `CURRENT_SCHEMA_VERSION`; `parseDocumentJson`
  runs it before validation and reports `migratedFrom`/`migrationsApplied`. v1 has no migrations.
  Unknown newer documents stay read-only; corrupt or invalid input is never rewritten. Fixtures:
  `packages/core/test/fixtures/schema/{v1,v2-newer,invalid,corrupt}.json`.
- `AssetStore` is a contract only, in `packages/core/src/assets.ts`: content-addressed id
  (lowercase SHA-256 hex), read/insert with a typed missing result, package-relative path, and a
  renderer-safe URL. No image decoding, rendering, or filesystem implementation.
- Deferred: an in-memory repository double (the save path is filesystem-bound; duplicating it would
  create a second, unverified save semantics), the `pre-migration` backup trigger (the first real
  migration will use the existing kind; today the normal backup-before-write already preserves the
  old bytes), asset garbage collection, and the asset URL scheme. Image pipeline work is M3c3b.

### Slice 4 — Command layer and invariants
- Split `commands.ts` by aggregate: block, branch, anchor, chapter, document; registry.
- Invariant harness: apply → inverse → deep equal; undo/redo identity; JSON round-trip; rejected
  command leaves the document untouched.
- Branded IDs (`BlockId`, `AnchorId`, `BranchId`) if the migration is mechanical.
- No command semantics change.

### Slice 5 — Test harness cleanup
- Extract shared UI session/fixture helpers; see `docs/architecture/test-suite-audit.md`.
- Remove duplicated setup and the E2E recovery matrix that is already covered by the recovery suite.
- Keep one test level per behavior; add a coverage matrix.

## Only interfaces now, implementations later

- **External API/MCP**: `ApplicationService` and query contracts; auth/audit middleware comes with M5.
- **Asset pipeline**: `AssetStore` contract delivered in `packages/core/src/assets.ts`; the
  content-addressed implementation and image UI come with M3c3b.
- **Settings/theme**: token registry; UI and full type/radius scales in M6.
- **Page/PDF**: keep `packages/layout` and `packages/pdf` pure; M4 owns the renderer integration.

Do not build these now: API server, MCP adapter, auth/audit runtime, image asset rendering, settings
UI, plugin system, event store, generic event bus, DI container.

## Gate

- All existing tests pass; no skipped/weakened tests.
- No visual diff in screenshots.
- No new runtime dependency.
- No performance regression in layout/edge/reflow.
- Public UI behavior identical; only internal boundaries change.
- One full `npm run verify` after each slice integration and one at M3i closure.

## Ordering

M3 acceptance → M3i (5 slices) → M4. M5 uses the extracted application services; M6 uses the token
registry.
