# M3c3b3 — image integrity, legacy src policy, protocol hardening

**Status:** Builder complete in worktree; not merged or pushed.
**Branch:** `t3/image-integrity-hardening`
**Base:** `e5c67d9` (`docs: sequence M3c3b3 before M3c3b4`)
**Implementation commit:** `8fc9fd3` (`fix: harden image asset integrity and legacy sources`)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-03faa989`

## Summary

- A present asset record with a **missing/unreadable file** now resolves the image anchor as
  `asset-missing`; a **SHA-256 mismatch** under `assets/<id>` resolves it as `asset-changed`. Both are
  broken anchors in resolution, the health sheet, the inline warning, and the export marker path.
  Branch, target, anchor selector, alt text, and the canonical asset record are never deleted.
- Asset verification is typed and session-scoped: the first successful read of an asset in an open
  document hashes the bytes and caches the result; later `<img>` requests do not re-hash. Reload
  closes/reopens the store and re-verifies in the new session. A changed asset's bytes are never
  served: the protocol returns a typed 404 and the editor renders the placeholder.
- Legacy `src`-only images are unsupported. Projection drops the path, preserves `alt`, and shows a
  labeled placeholder. `pmToContent` removes `src`/`title` on the next commit. The image node view
  derives the display URL only from `assetId`, so `file:`, `data:`, and remote `src` never reach
  `<img>`.
- Native-picker imports decode and store intrinsic `width`/`height` from the image header (PNG, JPEG,
  GIF, WebP, BMP, AVIF) instead of leaving M4 to the 220×120 estimator. Paste/drop also falls back to
  the header reader when renderer dimensions are unavailable.
- Selected/hover image-region outlines use the accent border and numbered marker only; the gray
  `--accent-soft` fill is removed so image pixels are not obscured.
- Added the AC-57 image fixture matrix (`fixtures/m3-image-regions.json`) with two regions on one
  image, two images sharing an asset, display-resize geometry, replacement, missing record, missing
  file, and changed hash. Added protocol handler, MIME, symlink, path, hash-cache, and dimension
  tests.
- Documented the callout alignment rule (left-edge anchor, 160 px cap, remaining lane width, region
  left edge vs point x) and the image availability/legacy-src/protocol policy.

## Integrity and availability API

Package-local core types (`packages/core/src/assets.ts`):

```ts
type AssetAvailabilityState = 'available' | 'asset-missing' | 'asset-changed';
type AssetAvailabilityDetail =
  | 'record-missing' | 'file-missing' | 'unreadable' | 'hash-mismatch' | 'unsupported-mime';

interface AssetAvailability {
  id: AssetId;
  state: AssetAvailabilityState;
  detail?: AssetAvailabilityDetail;
  message?: string;
}

interface AssetReadChanged {
  ok: false;
  id: AssetId;
  reason: 'changed';
  actual: string;   // SHA-256 of the bytes now on disk
  message: string;
}

type AssetAvailabilityIndex = Readonly<Record<string, AssetAvailabilityState>>;
```

`NodeAssetStore` additions:

- `readVerified(id)` — reads and verifies the content address once per open store; a mismatch is
  `{ ok: false, reason: 'changed', actual }`.
- `availability(id)` / `availabilityFor(ids)` — typed availability used by snapshots, the protocol,
  and command results. Results are cached with the verification; `invalidateAvailability` drops the
  decision without forcing a re-hash after a record add/remove.
- `invalidate(id?)` — clears the verification and availability caches for an explicit re-check
  (reload creates a new store, so it re-verifies naturally).

Main/renderer wiring:

- `OpenDocumentSnapshot.assetAvailability` and `ApplyResult.assetAvailability` carry
  `AssetAvailability[]` over IPC. A record with a non-image MIME is reported as
  `asset-missing`/`unsupported-mime`.
- `DocumentRuntime.assetAvailability` is the session index. It is replaced at open, stale-lock
  takeover, and reload; merged after commands that touch assets; and passed to the editor projection,
  health sheet, status bar, sidebar, block menu, and image node view.
- `resolveAnchor`, `resolveBlockAnchors`, `resolveDocumentAnchors`, and `buildExportPlan` accept
  `{ assetAvailability }`. Absent ids keep canonical-record behavior, so existing callers and tests
  are unchanged.
- Projection filters `knownAssets` to available ids, so a missing/changed file immediately projects
  the placeholder without deleting the asset node or its anchors.
- `buildExportPlan(document, { assetAvailability })` emits the existing broken marker with
  `reason: 'asset-missing' | 'asset-changed'` and the branch/target ids; the target is still emitted
  exactly once.

## Protocol hardening

`apps/desktop/src/main/asset-protocol-response.ts` is a pure, Electron-free response builder; the
Electron entry point only registers the scheme and forwards requests.

- Canonical URL only: `noteforest-asset://asset/<64 lowercase hex>`, exact path, no query/hash,
  traversal (`..`, `%2e`) rejected before URL normalization.
- MIME allowlist is `SUPPORTED_IMAGE_MIMES`; a resolver returning `text/html` is refused even if it
  claims success.
- Missing / changed / unsupported returns `404`, body `Asset not found`, and
  `x-noteforest-asset-error: asset-missing | asset-changed | asset-unsupported`; no image bytes.
- All responses keep `cache-control: no-store`, `x-content-type-options: nosniff`, and a restrictive
  response CSP. Served responses include `content-type` and `content-length`.
- `resolveStoreAsset` checks the record MIME, lexical path and exact content-addressed filename, then
  the real paths of `assets/`, the package root, and the final file. A symlinked `assets/` directory,
  a final-file symlink, a directory at the id, or a lexical traversal is `asset-missing`. The
  lstat/read TOCTOU window is narrowed but not eliminated; this is documented in code.

## Legacy src behavior

- `contentToPM` deletes any incoming `src`; an image without `assetId` gets
  `missing: true`, `missingReason: 'unsupported-src'`, and keeps `alt`.
- `ImageNodeView` never reads `attrs.src` for display. It derives
  `noteforest-asset://asset/<assetId>` from the canonical id and returns the placeholder before any
  `<img>` is rendered when the asset id is absent or unavailable.
- `pmToContent` always strips `src`, `title`, `missing`, `missingReason`, and `missingLabel` from
  image attrs, so a legacy path converges out of canonical content on the next commit.
- The placeholder is labeled “Unsupported image source” with the alt text and a legacy-specific hint;
  no file is read and no `file:`, `data:`, or remote URL reaches `<img>`.

## Native-picker dimensions

`apps/desktop/src/main/image-dimensions.ts` reads intrinsic size from the file header with no new
dependency and no pixel decode: PNG (IHDR), JPEG (SOF markers), GIF (logical screen), WebP
(VP8/VP8L/VP8X), BMP (BITMAPINFOHEADER, including top-down negative height), and AVIF (`ispe`).
Malformed/truncated/zero-sized input returns `null`; the asset is still stored, without invented
dimensions.

`importImageFile` stores the decoded width/height on the asset; `runtime.insertImage` copies them to
the image node. `importImageBytes` uses renderer-measured dimensions when present and falls back to
the header reader otherwise. The existing picker UI test now asserts 640×360 asset and node
dimensions.

## Region outline style

- `.nf-image-region-outline` no longer transitions or paints a background. Hover and selected states
  use only `border-color: var(--accent)`; the numbered marker remains.
- UI test reads the computed style of a selected outline and asserts
  `background-color: rgba(0, 0, 0, 0)`, a visible 1.5 px accent border, and the marker.

## Fixtures and tests

- `fixtures/m3-image-regions.json` (AC-57 matrix): two regions on one image, two images sharing an
  asset, display-resize geometry, replacement (`asset-changed`), missing record (`asset-missing`),
  missing file and changed hash (injected session availability), branches/targets/alt preserved.
  Added to `scripts/generate-fixtures.mjs` and the fixture-matrix test.
- Core tests: fixture matrix and `resolveAnchor` availability cases; `NodeAssetStore` verified read,
  cache, invalidation, record/file/unreadable availability; export markers for missing file/changed
  hash.
- App tests: `asset-protocol.test.ts` (URL parsing, 404/MIME/headers/no bytes, malformed URL,
  resolver exception), `asset-integrity.test.ts` (verified bytes, missing record/file/path, changed
  hash, unsupported MIME, symlinked assets dir, final-file symlink, directory, traversal),
  `image-dimensions.test.ts` (PNG/JPEG/GIF/BMP/WebP, malformed/truncated/empty), projection and
  health availability cases.
- UI: `tests/ui/m3c3b3-image-integrity.test.mjs` covers missing file, SHA-256 mismatch (placeholder,
  no `<img>`, protocol probe fails, health/warning, branch/target/alt), legacy `file:`/`data:`/remote
  placeholders with no source reaching `<img>`, and the selected region outline. Added to
  `test:ui` and `verify`.

## Checks and timings

| Check | Result |
|---|---|
| `npm ci --no-audit --no-fund` | clean from lockfile (199 packages) |
| `npm run check:boundaries` | pass: 129 files, 598 imports, 16 rules, 0 violations |
| `npm run typecheck` | pass: desktop node/web, core, layout, pdf |
| Targeted vitest (integrity/protocol/fixtures) | **9 files / 122 tests pass, ~0.2 s**; final targeted reruns pass |
| `npm test` | **65 files / 694 tests pass, 2.03 s** |
| `npm run test:ui` | **45/45 tests pass across 18 UI files**, exit 0 |
| `npm run e2e:critical` | **16/16 pass, 44.5 s total (suite 36.4 s)** |
| `npm run test:recovery:run` | **14/14 pass, ~17.9 s** |
| `npm run verify:fast` | **pass**, exit 0 |
| New-test hygiene | no skips/todos, no fixed sleeps, no native-dialog waits; the picker is the E2E guard override |

One `verify:fast` run hit a timeout in the unrelated undo/redo e2e (`waitSelected` after a structural
undo); the same test and full e2e passed on immediate reruns (16/16), and the final `verify:fast` was
green. No image test was flaky across repeated runs.

## Screenshots

- `artifacts/m3c3b3/image-file-missing-placeholder-1440x900.png`
- `artifacts/m3c3b3/image-file-missing-health-1440x900.png`
- `artifacts/m3c3b3/image-hash-changed-placeholder-1440x900.png`
- `artifacts/m3c3b3/image-hash-changed-health-1440x900.png`
- `artifacts/m3c3b3/legacy-src-placeholder-1440x900.png`
- `artifacts/m3c3b3/image-region-selected-outline-1440x900.png`

## Risks

- Hash verification reads and hashes the full asset once per open session. Very large (near 100 MB)
  images pay that cost at open; dimensions/verification are measured on the fixture PNGs only.
- The availability decision is cached for the session. If an asset file is repaired in place without
  a reload, the editor can stay on the placeholder until the document is reopened (or an explicit
  re-check is added); the protocol itself still refuses missing/mismatched bytes.
- `availability` caches a `record-missing`/`file-missing` decision too; a same-session external
  repair needs a reload. This follows the ratified “once per open session” policy.
- The realpath checks narrow but do not eliminate the lstat/read TOCTOU window.
- `resolveStoreAsset` requires the record path to be exactly `assets/<id>` (the content-addressed
  layout); subdirectory asset paths remain unsupported even though they would be lexically safe.
- The header reader does not interpret EXIF orientation; dimensions are raw pixel dimensions, as M4
  layout expects.
- Old asset records/files remain after replacement; asset GC is intentionally out of scope.
- Region re-pick/crop repair, cross-document image paste, multi-image action routing, and asset GC
  remain M3c3b4/M4 follow-ups.

## Not verified

- Real OS image-picker interaction and manual subjective visual/VoiceOver judgement; the E2E picker
  is overridden through the required guard.
- Real drag/drop from Finder and clipboard image paste beyond the existing synthetic UI coverage.
- M4 page view/PDF image rendering and “image anchor lost” PDF markers; the export-plan marker is
  covered structurally only.
- Very large images, EXIF orientation, animated GIF/AVIF behavior, and permission-denied files
  beyond the code paths exercised by unit tests.
- A combined full `npm run verify` (the Orchestrator owns it); all components were run separately and
  `verify:fast` passed.

## Non-goals respected

No M4/page/PDF work, crop editor, region re-pick, cross-document copy/paste, multi-image action
routing, asset GC, new runtime dependency, or schema bump. The canonical document format and the
`noteforest-asset://asset/<64-hex>` contract are unchanged; availability is runtime state.
