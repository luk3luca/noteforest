# Review — M3c3b re-review: image integrity and asset lifecycle

- **Reviewer:** Sentinel (independent)
- **Date:** 7 November 2026
- **Worktree / branch / base:** `a builder worktree`, `t3/m3c3b-sentinel-re-review`, base `main` / `bf3893e` (`a docs: merge M3c3b4 and launch M4a`)
- **Reviewed commits:** M3c3b3 `8fc9fd3` (`fix: harden image asset integrity and legacy sources`) and M3c3b4 `2c65c4e` (`fix: image UX and asset lifecycle (M3c3b4)`), merged through `e8bd5b5` / `bf3893e`
- **Environment:** macOS (Darwin), Node 22.23.1, Electron 45.2.1, Chromium bundled with Electron, dark theme, window 1440×900; production build via `npm run build`
- **Verdict:** **Request changes** — all seven original findings are closed, but one new **S2** package-confinement finding remains, plus two S3 and two S4 follow-ups.

## Scope reviewed

The re-review covers exactly the merged M3c3b3 and M3c3b4 work:

- asset availability and hash verification for image anchors and image nodes;
- legacy `src` policy and image projection;
- native-picker dimensions;
- per-image actions in multi-image blocks;
- cross-document copy/paste and the placeholder path;
- marker numbering;
- `asset.remove` reference guard, GC planner, and backup retention;
- the `unavailable` image attribute in canonical content.

Out of scope: M4 page/PDF rendering, crop editing, full region re-pick, External Agent API, and real OS picker/VoiceOver checks (product owner).

## Original findings

| # | Original finding | Status | Evidence |
|---|---|---|---|
| **S2-1** | Missing asset file with a present record stayed `resolved`. | **Closed** | `NodeAssetStore.availability` maps a missing file to `asset-missing`/`file-missing` (`packages/core/src/node/assets.ts:160-202`); `assetAvailabilityFor` feeds every record at open (`apps/desktop/src/main/library.ts:129-146`); image binding and fallback break on `asset-missing` (`packages/core/src/anchors.ts:2654-2666`, `2691-2706`); projection filters unavailable ids (`apps/desktop/src/renderer/src/lib/adapter.ts:369-380`). UI test `tests/ui/m3c3b3-image-integrity.test.mjs:169-244` deletes the file, reloads, and asserts `asset-missing`, placeholder, health row, warning, kept branch/target/alt/record. |
| **S2-2** | Asset bytes replaced under the same content-addressed name were served without hash verification. | **Closed for the ratified once-per-open-session policy** | `readVerified` hashes on first read and caches the success in the store session (`packages/core/src/node/assets.ts:125-133`, `208-268`); protocol resolution uses it and never serves changed bytes (`apps/desktop/src/main/library.ts:678-731`); the old session cache is deliberately invalidated only by reload/`invalidate`. UI test overwrites `assets/<id>` and asserts `asset-changed`, no `<img>`, a failing protocol probe, health row, and kept branch/target/alt (`tests/ui/m3c3b3-image-integrity.test.mjs:246-343`). Session-scoped detection is documented as a residual policy (see risks). |
| **S2-3** | A legacy image `src` bypassed the asset pipeline and could render an arbitrary local file. | **Closed** | Projection deletes `src`, marks a no-`assetId` image missing with `missingReason`, and derives display URLs only from `assetId` (`apps/desktop/src/renderer/src/lib/adapter.ts:204-231`); `ImageNodeView` never reads `attrs.src` and uses `assetUrlFor(assetId)` only (`apps/desktop/src/renderer/src/editor/views/ImageNodeView.tsx:131-140`, `437-491`); `pmToContent` removes `src`/`title` (`adapter.ts:233-248`). UI test loads `file:`, `data:`, and remote `src` images, asserts three placeholders, zero `<img>` elements, and zero file/data/remote sources (`tests/ui/m3c3b3-image-integrity.test.mjs:345-412`). |
| **S3-3** | Block-menu image actions always targeted the first image. | **Closed** | `imagesInContent` returns every image with its node path (`apps/desktop/src/renderer/src/lib/image.ts:46-78`); the block menu adds one labelled action group per image (`apps/desktop/src/renderer/src/actions.ts:477-539`, `571-598`); each image node has its own `Image actions…` menu using the clicked `nodePath` (`ImageNodeView.tsx:598-617`). UI test verifies Image 2 replace/alt from the block menu and the inline menu, and that Image 1 is untouched (`tests/ui/m3c3b4-image-lifecycle.test.mjs:155-279`). |
| **S3-4** | Cross-document image paste kept a foreign `assetId` without copying bytes. | **Closed** | Paste marks an unknown asset as an editor-only `clipboardAssetId` with no `assetId` (`apps/desktop/src/renderer/src/lib/adapter.ts:162-192`, `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx:209-223`); `copyImageAsset` verifies source bytes and writes into the destination package (`apps/desktop/src/main/library.ts:573-650`); the repair records the asset before restoring `assetId`, and an unavailable source leaves a labelled placeholder with no id (`apps/desktop/src/renderer/src/lib/image-clipboard.ts:94-149`). UI test verifies same-document dedupe, exact cross-document bytes/record, and the unknown-source placeholder with no `assetId` (`tests/ui/m3c3b4-image-lifecycle.test.mjs:365-475`). A local reload probe additionally confirmed the `unavailable: "cross-document-copy"` placeholder, alt text, and absence of `assetId` survive quit/reopen (see checks). |
| **S4-1** | Visible marker numbers skipped idle anchors (`1, 3, …`). | **Closed** | Markers are numbered after idle/broken/invalid anchors are filtered (`number: markers.length + 1`) and sorted by that sequence (`ImageNodeView.tsx:253-312`). UI test deletes the middle branch and asserts `1, 2` while the idle anchor record remains (`tests/ui/m3c3b4-image-lifecycle.test.mjs:281-363`). |
| **S4-2** | `asset.remove` deleted referenced records; GC/backup references were unfinished. | **Closed for the stated v1 policy** | `asset.remove` rejects with `asset-in-use` when any image node or image anchor names the asset and leaves the document/revision/undo untouched (`packages/core/src/commands/asset.ts:97-132`; `packages/core/src/assets.ts:98-199`); the planner and backup scan are deterministic and test-covered (`packages/core/src/assets.ts:218-271`; `packages/core/src/node/recovery.ts:174-217`). `packages/core/test/asset-gc.test.ts` covers node-only, anchor-only, unreferenced removal, GC retention, backup retention, and invalid backups. A temporary local probe additionally verified a nested table-cell image and a shared/live image + image-anchor combination are found by the guard. Automatic GC scheduling remains a product decision by design. |

No original finding regressed in the merged code.

## Acceptance criteria status

| Criterion | Status | Evidence |
|---|---|---|
| **AC-21** — normalized image region/point; missing/replaced asset is broken; placeholder. | **Met** for display resize, UI replacement, missing record, missing file, and hash mismatch. | Core resolver matrix `packages/core/test/anchors.test.ts:856-960`; UI `m3c3b2` and `m3c3b3` tests; `fixtures/m3-image-regions.json`; screenshots `artifacts/m3c3b3/`. Crop editing/re-pick remains a declared follow-up. |
| **AC-37** — missing asset shows a placeholder and keeps reference/anchors. | **Met for the editor**; PDF placeholder is M4. | `ImageNodeView.tsx:437-461`; UI file-missing test; assets/anchors/branch/target/alt preserved. |
| **AC-54** — anchors resolve/broken after edits/load; broken anchor does not delete branch/target. | **Met** for record/file/hash states. | `packages/core/src/anchors.ts:2635-2726`; availability passed through runtime/health/export; UI tests. |
| **AC-56** — broken image anchor exports once with a marker. | **Structural evidence present**; PDF rendering is M4. | `buildExportPlan(document, { assetAvailability })` passes availability to anchor resolution (`packages/core/src/export-plan.ts:162-167`); fixture matrix asserts `asset-missing`/`asset-changed` export markers (`packages/core/test/fixtures.test.ts:242-300`). M4 still owns the visible PDF marker. |
| **AC-57** — image fixture matrix. | **Met** | `fixtures/m3-image-regions.json` and the fixture matrix entry (`packages/core/test/fixtures.test.ts:128-147`). |
| **AC-77** — broken anchor warning/fallback/repair. | **Met** for the image states in scope. | `ImageNodeView.tsx:179-210`; `BlockViews.tsx:1014-1046, 1296-1323`; `tests/ui/m3c3b3-image-integrity.test.mjs:204-243, 306-322`. |

## New findings

### S2-1 — `copyImageAsset` and `NodeAssetStore` follow a symlinked `assets/` directory outside the package (read and write escape)

**Severity:** S2 (file-access confinement; privacy leak through a crafted package)

**Location:** `packages/core/src/node/assets.ts:111-133` (`has`/`read`), `208-268` (`readInternal`), `270-337` (`insert`); `apps/desktop/src/main/library.ts:622-631` (source store in `copyImageAsset`), `641-648` (destination insert). Contrast the protocol resolver, which does resolve real paths: `apps/desktop/src/main/library.ts:705-716`.

**Reproduction**

1. Create a library source package whose `assets` entry is a symlink to an outside directory, with a file named `<sha256-of-bytes>` containing the asset bytes and a canonical `document.assets[<id>]` record.
2. Copy/paste that image into a second document. `copyImageAsset` reads through the symlinked `assets/` directory and returns `ok: true`; the source bytes came from outside the source package.
3. Create a destination package whose `assets` entry is a symlink to an outside directory. `copyImageAsset` writes `assets/<id>` through the symlink; the bytes are created outside the destination package.
4. The same write path is used by `importImageFile` and `importImageBytes`; the same read path is used by any `NodeAssetStore` consumer.

**Expected:** every asset read and write is realpath-confined to the package (or a symlinked `assets/` directory is rejected as `asset-missing` / `io-error`), matching the protocol resolver's containment rule.

**Actual:** `NodeAssetStore` only `lstat`s the final file; it never checks that the `assets/` directory itself resolves inside the package. `insert` calls `fs.mkdir(this.assetsDirectory, { recursive: true })` and `fs.rename(target)` without a realpath check. A crafted package can therefore read asset bytes from, or write user images to, a directory outside the package. On a world-readable target such as `/tmp`, a user's inserted image bytes are written outside the package boundary where another local process can read them. The c3b3 report's statement that a symlinked `assets/` directory is `asset-missing` is true only for `resolveStoreAsset`; the store/import/copy path is not hardened.

**Evidence:** local review probe (temporary, removed after use) built two real packages with `assets` symlinks. `NodeAssetStore.readVerified` returned `{ ok: true }` through the outside directory; `NodeAssetStore.insert` returned `{ ok: true, created: true }` and created the file outside the package; `copyImageAsset` returned `ok: true` for both the symlinked source and the symlinked destination. The probe's symlink/guard cases all passed; only the separate AVIF case failed (S3-1 below).

**Direction:** resolve `realpath(assetsDirectory)` once per store operation and require it to be inside `realpath(packagePath)`; reject a symlinked `assets/` directory (or fail closed as `asset-missing`/`io-error`) for reads and writes. Use the same resolver/containment helper in `copyImageAsset`, `importImageFile`, `importImageBytes`, and `NodeAssetStore.insert/read/readVerified`. Add regression tests for both a symlinked source and a symlinked destination.

### S3-1 — AVIF intrinsic dimensions are not decoded

**Severity:** S3 (supported format; M4 layout/pagination guard)

**Location:** `apps/desktop/src/main/image-dimensions.ts:125-148` (AVIF scanner); dispatch at `:187-194`; import path `apps/desktop/src/main/library.ts:475-493`.

**Reproduction:** `sips -s format avif fixtures/assets/forest.png --out /tmp/forest.avif`, then `readImageDimensions(bytes)` on the generated 640×360 AVIF returns `null`, not `{ width: 640, height: 360 }`. Real AVIF places `ispe` inside `meta`/`iprp`/`ipco`; the scanner only walks top-level ISO BMFF boxes and skips the whole `meta` box.

**Impact:** AVIF is in `SUPPORTED_IMAGE_MIMES` (`apps/desktop/src/shared/images.ts`), so the picker accepts it, but the asset/image node has no intrinsic dimensions. M4 layout would fall back to the 220×120 estimator (`packages/layout/src/estimate.ts:373-377`), which can misplace an image at a page boundary. The c3b3 report claims AVIF support (`docs/reports/m3c3b3-image-integrity.md:119-126`), but `apps/desktop/test/image-dimensions.test.ts:86-104` has no AVIF case.

**Direction:** recurse into `meta`/`iprp`/`ipco` for `ispe`, or remove AVIF from the accepted picker formats until it is decoded; add a real AVIF fixture test.

### S3-2 — Asset deduplication trusts an existing corrupt file under the content address

**Severity:** S3 (corrupt destination/package edge case; placeholder, no data loss)

**Location:** `packages/core/src/node/assets.ts:284-291` (`insert` dedupe path); `apps/desktop/src/main/library.ts:641-648`.

**Reproduction:** Pre-create `assets/<id>` with bytes that do not hash to `<id>` (or leave a corrupt file after an interrupted external edit). Call `copyImageAsset` from a good source, or import the correct bytes. `NodeAssetStore.insert` sees `has(id)`, returns `{ ok: true, created: false }` with the existing record, and does not replace the file. `copyImageAsset` reports success; the renderer records `assetId`; the protocol later verifies the file and returns `asset-changed` 404, so the pasted image remains a broken placeholder.

**Evidence:** a temporary probe wrote wrong bytes at `assets/<id>`, called `insert` with the correct bytes, and confirmed `created: false` and unchanged wrong bytes on disk.

**Direction:** before deduplicating, verify the existing file hash (or maintain a verified set that is invalidated on external modification); replace a mismatched file atomically or return a typed failure instead of `ok: true`.

### S4-1 — Stale `unavailable` remains on a node after replacing a cross-document placeholder

**Severity:** S4 (inert canonical metadata, but misleading)

**Location:** `apps/desktop/src/renderer/src/lib/image.ts:135-149` (`contentWithImageAsset` spreads all attrs); `apps/desktop/src/renderer/src/lib/adapter.ts:233-247` (keeps `unavailable` when `assetId` is present); `ImageNodeView.tsx:198-203` ignores it when `assetId` is present.

**Reproduction:** paste an image whose source is unavailable, then use `Replace image…` on the placeholder. The new node keeps `unavailable: "cross-document-copy"` in canonical content even though it now has an `assetId`. The image renders normally, but the stale reason persists in the document and travels with later copies.

**Direction:** clear `unavailable` (and any `clipboardAssetId`) when an asset id is assigned or an image is replaced; add a round-trip assertion.

### S4-2 — Add-region/add-point stays enabled for a missing/changed asset record

**Severity:** S4 (dead-end menu action)

**Location:** `apps/desktop/src/renderer/src/actions.ts:484-515`.

**Reproduction:** keep the asset record but delete/corrupt the file, then open the image block menu. `canAuthorImage` checks only `runtime.editable && document.assets[assetId] !== undefined`, not `runtime.assetAvailability`; the action is enabled, but `ImageNodeView` is in the placeholder state and renders no draw layer, so the action has no visible effect.

**Direction:** gate authoring on availability (use `knownImageAssets`/`assetAvailability`) and label the disabled action with the reason.

## `unavailable` canonical attribute assessment

The `unavailable` image attribute is **safe relative to canonical content** in the reviewed state:

- it is a plain string, rendered only through `data-nf-unavailable` and read only for an exact `cross-document-copy` comparison (`apps/desktop/src/renderer/src/editor/extensions.ts:82-95`; `ImageNodeView.tsx:198-210`);
- it never reaches `src`, never opens a path, and is preserved by the content model as an unknown field (spec I16) while `pmToContent` strips the editor-only `clipboardAssetId`; a temporary reload probe confirmed it survives save/quit/reopen with the same label and no `assetId`;
- it is not a view-state field such as zoom/page/selection; it is a durable content repair marker for a failed cross-document import.

Residual concerns: it is not listed in the image node attrs in `docs/spec.md` §4.4 (unknown fields are preserved, so this is allowed, but the policy should be recorded), and S4-1 shows it can become stale on replacement. It is inert and cannot execute or load content.

## Checks run

| Check | Result |
|---|---|
| `npm ci --no-audit --no-fund` | clean install from lockfile, 199 packages |
| `npm run build` | pass (existing `use client` bundler warnings only) |
| `npm run typecheck` | pass: desktop node/web, core, layout, pdf |
| `npm run check:boundaries` | pass: 130 files, 606 imports, 16 rules, 0 violations |
| `npx vitest run packages/core/test/asset-gc.test.ts packages/core/test/asset-store.test.ts packages/core/test/anchors.test.ts packages/core/test/fixtures.test.ts apps/desktop/test/asset-protocol.test.ts apps/desktop/test/asset-integrity.test.ts apps/desktop/test/image-dimensions.test.ts apps/desktop/test/image-projection.test.ts apps/desktop/test/anchor-health.test.ts` | **9 files / 126 tests pass, 275 ms** |
| `npm test` | **66 files / 704 tests pass, 2.33 s** |
| `node --test tests/ui/m3c3b3-image-integrity.test.mjs` | **4/4 pass, 25.5 s** |
| `node --test tests/ui/m3c3b4-image-lifecycle.test.mjs` | **3/3 pass, 22.9 s** |
| `npm run e2e:critical` | **16/16 pass, 44.5 s total (suite 36.3 s)** |
| `npm run test:recovery:run` | **14/14 pass, 17.7 s** |
| Temporary core review probe (not committed) | nested table-cell image found at `[0,0,0,1]`; shared live image + image anchor retained; `asset.remove` rejected; symlinked `assets/` read and write escaped the package; corrupt-file dedupe reproduced; real `sips` AVIF returned `null` (S3-1) |
| Temporary UI review probe (not committed) | cross-document `unavailable: "cross-document-copy"` placeholder, alt, and absence of `assetId` survived quit/reopen (1/1); an exploratory undo probe observed that one `⌘Z` after a repaired cross-document paste removes the pasted image and retains the asset record (the probe's stricter placeholder expectation was wrong, so it is not counted as a gate) |

The combined `npm run verify` was not run by the reviewer; the Orchestrator owns that integration run. All components above passed on this worktree.

## What was not verified

- Real OS image picker, Finder drag/drop, and real clipboard image file paste (UI tests use the required dialog guard/synthetic clipboard).
- A live read-only target for `copyImageAsset`; the code checks `target.readOnly` (`apps/desktop/src/main/library.ts:618-620`), but I did not create a lock-conflicted target end to end.
- M4 page view/PDF image rendering, page-break placement, and PDF lost-anchor markers.
- AVIF through the picker/UI (only the pure dimension reader was probed); EXIF orientation; very large, permission-denied, animated GIF/AVIF, and SVG inputs (SVG is not a supported MIME).
- Automatic asset GC scheduling and a restore-after-GC end-to-end; only the planner/backup-scan unit tests exist.
- Subjective visual/VoiceOver judgement; product-owner check remains.

## Residual risks

1. **Session-scoped asset verification (ratified).** A file deleted or replaced while a document is open stays trusted in the availability/verified caches until reload; the protocol can still fail the `<img>` load, but the anchor/health state may lag. Reload is the defined re-check point.
2. **Symlink/TOCTOU.** S2-1 is the blocking confinement gap; the protocol resolver still has a narrow `lstat`/`read` TOCTOU window (documented in code).
3. **Destination stale record.** If the destination already has an asset record but its file is missing/changed, `markCrossDocumentImages` treats the asset as known (`DocumentEditor.tsx:215-218`, `adapter.ts:369-380`) and `scheduleImageClipboardRepair` skips the import. The paste shows a placeholder rather than repairing from the source; no dangling id, but a manual repair/reload is needed.
4. **`asset.add` inverse.** `applyAssetAdd` returns `asset.remove` as its inverse; the new reference guard can reject that inverse if the asset is referenced. Current UI image paths pass `null` inverse, so this is not reachable today; an External Agent API must group asset + content changes into one transaction or exempt the inverse from the guard.
5. **No automatic GC.** The planner/backup scan are ready, but nothing runs them; asset records and bytes accumulate until a product decision defines scheduling, grace period, and restore behavior.
6. **`unavailable` policy drift.** The canonical marker is safe but not in the spec attrs table and can go stale (S4-1).
7. **AVIF dimensions.** S3-1 leaves a supported format on the 220×120 estimator path for M4.

## M4 statement

The original M3c3b S2 findings are closed, so M4 image/text/layout work is no longer blocked by them. The new **S2-1 package escape** must be fixed (or explicitly accepted with a recorded guard) before M4 relies on `copyImageAsset` or any asset write path with untrusted packages. S3-1 (AVIF dimensions) must be fixed before M4/PDF image acceptance for AVIF; the other follow-ups are non-blocking.

## Recommended next step

1. Fix S2-1 by realpath-confining `NodeAssetStore` reads/writes and the `copyImageAsset` source/destination stores; add symlinked-source and symlinked-destination regression tests.
2. Fix S3-1 (AVIF `ispe` nesting) or remove AVIF from the accepted formats; add a real AVIF fixture.
3. Fix S3-2 dedupe verification and the S4 copy/extras; then re-run the image UI/e2e/recovery checks and return for a focused re-review of the confinement change before M4 starts the image/PDF slice.
