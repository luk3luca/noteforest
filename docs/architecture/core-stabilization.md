# Core stabilization — proposed M3i

**Status:** Proposed; start only after M3 is accepted and before M4.  
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

### Slice 3 — Repository and schema migrations
- `DocumentRepository`/`AssetStore` contracts; Node implementations stay in main/core-node.
- Ordered `schemaVersion` migrations with fixtures for every version; newer document read-only.
- Keep atomic save/backup/recovery semantics.
- Asset store interface now; image implementation in M3c3b.

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
- **Asset pipeline**: `AssetStore` interface; content-addressed implementation with M3c3b.
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
