# M3i — Core stabilization closure

**Status:** Complete (6 November 2026). M3 is accepted; M3i was the pre-M4 architecture pass.

## Result

| Slice | Delivered |
|---|---|
| 1 — tokens | M3h4: CSS geometry from `DESIGN_TOKENS`; 88/28 canonical; guard test |
| 2a — gateway/save | `DocumentGateway`, `SaveCoordinator`; runtime no direct `window.noteforest` |
| 2b — editor | `EditorProjection`; TipTap build/extract/replace/focus/reconcile/history |
| 2c — session | `DocumentSession`; canonical doc/revision, queue, undo/redo, command/inverse, notifications |
| 3 — persistence | `DocumentRepository`, ordered migrations, v1 fixture matrix, `AssetStore` contract |
| 4a — commands | `commands.ts` 3,853 lines → barrel + aggregate modules; typed registry; invariant harness |
| 4b — boundaries | Node boundary checker, 16 rules, zero violations, in `verify:fast` |
| 5a — UI tests | Shared UI session/fixtures; callout split; UI files −857 lines |
| 5b — e2e/coverage | e2e 21 → 16 with coverage matrix; formula-term edit fixture; e2e 36.7 s |

## Metrics

- Unit: **637** (519 at M3 acceptance).
- UI: **36** tests; 15 files.
- Critical e2e: **16** tests, **36.7 s** suite (was 21/45.6 s); every removal has a coverage-matrix
  replacement.
- Recovery: **14**.
- Full `npm run verify`: pass.
- Boundary check: **0** violations (116 files / 535 imports / 16 rules).
- `DocumentRuntime`: 2,531 → 1,932 lines and now a composition root.
- `commands.ts`: 3,853 → 22-line barrel over aggregate modules.
- No visual change; no new runtime dependency; no on-disk format change.

## What stays deferred

- **M3c3b**: image insertion/asset implementation and image anchors. `AssetStore` is only a contract.
- **S3-5**: relink selection UX (selection must be prepared before the modal sheet).
- **S3-6**: replay-failure fallback can still route the next undo to structural history; latent, no
  current UI path.
- **M3i non-goals**: full type/radius/spacing/color scales, settings UI, API/MCP, PDF renderer.

## Evidence

Reports: `m3i2a-*`, `m3i2b-*`, `m3i2c-*`, `m3i3-*`, `m3i4a-*`, `m3i4b-*`, `m3i5a-*`, `m3i5b-*`.
Design rationale: `docs/architecture/core-stabilization.md`. Test ownership:
`docs/architecture/test-coverage-matrix.md`.

## Next

**M3c3b1** image asset implementation + editor image insertion/rendering, then **M3c3b2** image
anchors, then M4. S3-5/S3-6 are tracked for the M3c3b/M4 window.
