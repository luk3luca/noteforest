# Review — M3c3b image pipeline and image anchors

- **Reviewer:** Sentinel (independent)
- **Date:** 6 November 2026
- **Commit / branch:** `0ecf744` on `t3/m3c3b-image-pipeline-review`; base `main` after M3c3b2 merge `7c8cdd7` and docs `3fa2218`
- **Environment:** macOS (Darwin), Electron 45.2.1, Chromium bundled with Electron, dark theme, window 1440×900 and 960×800
- **Stack / PDF:** Electron + shared paginator + `printToPDF` (ADR-0001, ADR-0002); the print renderer is M4 and was not in this review
- **Verdict:** **Request changes** — three S2 findings; no S1 found

## Scope reviewed

Image pipeline and image anchors only, as defined by `docs/tasks/m3c3b-sentinel-review.md`:

- `noteforest-asset://` protocol, CSP, `NodeAssetStore`, package confinement, symlink handling;
- image insertion (block menu, command palette, paste, drop), canonical image shape, missing placeholder, save/reload/undo;
- image region/point authoring, normalized geometry, crop/point invariants, sorted `anchorIds`, markers, callouts, branches, resize/zoom;
- asset replacement/missing broken state, health recovery, AC-21 and the image rows of AC-57;
- new tests, gate timings, and M4 prerequisites (especially native-picker dimensions).

Out of scope: M4 page view/PDF rendering, crop editing, full region re-pick repair, asset GC, and the External Agent API.

## Acceptance criteria

| # | Criterion | Evidence | Result |
|---|---|---|---|
| **AC-21** | Image region uses normalized coordinates, survives display resizing, becomes broken when the image asset is replaced; a missing image shows a placeholder. | Core resolver matrix `packages/core/test/anchors.test.ts:856-960`; UI authoring/resize/zoom `tests/ui/m3c3b2-image-anchors.test.mjs:174-420`; replacement/removal `:467-605`; placeholder `apps/desktop/test/image-projection.test.ts`; screenshots `artifacts/m3c3b2/`. | **Partial.** Normalized region/point, display resize, UI `Replace image…`, and placeholder are delivered. A missing or changed asset **file** (record still present) is not surfaced as broken; see S2-1/S2-2. Crop editing remains an agreed follow-up. |
| **AC-37** | A missing asset shows a placeholder, keeps the reference, and does not delete the image node or dependent anchors; PDF export shows the placeholder. | `ImageNodeView.tsx:389-412`; UI missing-record test `tests/ui/m3c3b1-image.test.mjs:169-231`; 960 screenshot `image-anchor-missing-placeholder-960x800.png`. | **Met for the editor placeholder.** Record-missing and file-missing both render the placeholder; branch, target, anchor, and alt text survive. PDF rendering is M4. |
| **AC-54** | Formula, code, and image anchors are detected as resolved, ambiguous, or broken after edits and on load; a broken anchor never deletes its branch or target block. | Image resolver `packages/core/src/anchors.ts:2635-2705`; record-missing UI reload `tests/ui/m3c3b2-image-anchors.test.mjs:590-605`; health rows `apps/desktop/src/renderer/src/lib/anchor-health.ts:208-270`. | **Partial.** Record-missing and asset-changed are broken on load; a missing/unreadable **file** with a present record remains `resolved` (S2-1), and bytes replaced under the same content-addressed name also remain `resolved` (S2-2). |
| **AC-56** | A broken image anchor still exports its branch once with a visible marker. | `packages/core/src/export-plan.ts` marker path; no image case in `fixtures/m3-export-manifest.json`. | **Not verified in M4 terms.** Export-plan logic exists, but there is no image export fixture and the S2-1/S2-2 gap would omit the “image anchor lost” marker in those states. |
| **AC-57** | The anchor fixture matrix covers image display resize, replacement, and missing assets. | Behavior is covered by core/UI tests, but the proposed image fixture (for example `m3-image-regions.json`) is absent; `packages/core/test/fixtures.test.ts:79-126` lists no image fixture. | **Partial.** Behavior is tested; the fixture matrix is not delivered (S3-1). |
| **AC-77** | A broken anchor shows a visible marker, falls back to the whole block, and offers repair. | `BlockViews.tsx:1014-1046, 1296-1323`; UI asset-changed health test `:520-535`; warning button screenshot. | **Met for asset-changed and record-missing.** File-missing images still lack the warning path because resolution stays `resolved` (S2-1). |

## Per-area results

| Area | Result | Notes / evidence |
|---|---|---|
| **Asset store & protocol security** | **Request changes** | Hash/dedupe/atomic insert, lexical package confinement, final-file symlink rejection, `nosniff`, and `no-store` are present and tested. Two state-integrity gaps (S2-1/S2-2) and a legacy `src` file-access bypass (S2-3) remain. Handler-level 404/MIME/symlink tests and MIME restriction are missing (S3-2). |
| **Insertion / rendering** | **Pass with minors** | Block menu/palette/paste/drop copy bytes before insert; canonical node has `assetId`/`alt`/optional dimensions and no display path; missing placeholder never deletes content; save/reload tested. Multiple images in one block cannot be replaced or alt-edited from the block menu (S3-3), and cross-document copy/paste keeps an `assetId` without copying the record/bytes (S3-4). |
| **Image anchors** | **Pass** | Region and point authoring, normalized 0–1 geometry, full-crop default, point zero-size invariant, sorted `anchorIds`, multiple regions, cancel/no mutation, one undo, markers/callouts, keyboard activation, 1440/960 resize, zoom, save/reload are covered and passed. Crop editing is a declared follow-up. |
| **Broken state / health** | **Partial** | UI replacement and record removal produce `asset-changed`/`asset-missing`, preserve branch/target/alt, show the health reasons, and offer attach/delete/keep-broken with no relink. File-level loss and byte replacement do not enter the broken state (S2-1/S2-2). |
| **AC-21 / image AC-57** | **Partial** | AC-21 is delivered for the UI replacement path and resize/zoom; the file-integrity cases are not. AC-57 behavior is tested, but the fixture matrix is missing. |
| **Tests / regressions** | **Pass with evidence gaps** | 669 unit, 41 UI, 16 critical e2e, 14 recovery, typecheck and boundaries all pass locally; no skips, fixed sleeps, or native-dialog waits in the new tests. Missing-file/hash/legacy-src scenarios are not automated; clipboard paste and image-specific health action outcomes are not exercised end-to-end. |
| **M4 readiness** | **Blocked on images** | Native-picker images still lack intrinsic width/height; layout currently falls back to 220×120 (`packages/layout/src/estimate.ts:373-377`). M4 image/pagination acceptance needs dimensions and the S2 fixes first. |

## Findings

### S2-1 — A missing asset file is not a broken image anchor

**Severity:** S2 (AC-54/AC-57 unmet for a plausible package-loss state; report overclaims)  
**Location:** `apps/desktop/src/renderer/src/editor/views/ImageNodeView.tsx:167-171`, `packages/core/src/anchors.ts:2652-2654`, `apps/desktop/src/renderer/src/lib/anchor-health.ts:208-270`

**Reproduction**

1. Insert an image through the picker; create a region anchor and branch; save and quit.
2. Keep `document.json` and its `assets.<id>` record, but delete `assets/<id>` from the package.
3. Reopen the document.

**Expected:** the image shows the placeholder and the anchor becomes `asset-missing`/broken, appears in the health sheet, shows the “Lost anchor” warning, and is marked lost in M4/PDF; branch, target, and alt text are kept.

**Actual:** the placeholder appears, but the anchor remains `resolved` because `resolveImageBinding` checks only `document.assets[id]`, not the file. The health chip is absent, no “Lost anchor” button is shown, and M4 export would have no lost-anchor marker. I verified this with a UI probe (`health chip count 0`, placeholder shown). This contradicts `docs/reports/m3c3b2-image-anchors.md:95-97` (“missing asset records/files … become `asset-missing`”).

**Direction:** treat an unreadable/missing asset file as part of the document’s asset availability (for example, an asset-availability set in the runtime/health/export layer) and mark the anchor `asset-missing` without deleting anything. Add a UI/core regression test that deletes the file, not only the record.

### S2-2 — Asset bytes replaced under the same content-addressed name are served without hash verification

**Severity:** S2 (AC-21/AC-54 “asset hash changed” is not detected; silent wrong-image region)  
**Location:** `packages/core/src/node/assets.ts:109-155`, `apps/desktop/src/main/library.ts:491-510`, `apps/desktop/src/main/asset-protocol.ts:62-77`, `packages/core/src/anchors.ts:2649-2654`

**Reproduction**

1. Insert an image; create a region anchor; save and quit.
2. Overwrite `assets/<id>` with a different PNG (same filename, same canonical record and id).
3. Reopen the document.

**Expected:** content addressing is verified on read; a SHA-256 mismatch is a broken/unreadable asset (`asset-changed` or `asset-missing`), the anchor is broken, and the branch is kept. This is the spec’s “asset hash changed” orphan-detection case (`docs/spec.md:1353`).

**Actual:** the new bytes render (`naturalWidth` changed from 640 to 420 in my probe), the region marker stays at the same normalized rect, the health chip stays absent (`0`), and the anchor remains `resolved`. The image is silently different content under the same id; M4 would also use stale `width`/`height` metadata.

**Direction:** verify the hash at read/open time (or cache a verified result per open session) and surface a typed `asset-changed`/`unreadable` result; decide the performance policy (per read versus once per open). Add a probe/test that overwrites the file.

### S2-3 — A legacy image `src` bypasses the asset pipeline and can render an arbitrary local file

**Severity:** S2 (security/file-access confinement; canonical-shape bypass; no script or network execution found)  
**Location:** `apps/desktop/src/renderer/src/lib/adapter.ts:165-189`, `apps/desktop/src/renderer/src/editor/views/ImageNodeView.tsx:128-171`, `apps/desktop/src/renderer/src/editor/extensions.ts:37-92`, `apps/desktop/src/renderer/src/index.html:6-7`

**Reproduction:** create a document block with `{ "type": "image", "attrs": { "src": "file:///Users/example/.../fixtures/assets/forest.png", "alt": "local" } }` (no `assetId`). The editor renders the local image (`naturalWidth: 640`) even though no asset record exists and the file is outside the package. The `stripUnbackedImages` guard is applied only to paste (`adapter.ts:134-150`), not to load/projection, and `pmToContent` deliberately keeps a legacy `src` when no `assetId` exists (`adapter.ts:178-189`); the projection test asserts that retention (`apps/desktop/test/image-projection.test.ts:113-120`).

**Expected:** canonical images are asset-backed; a `src`-only image is rejected or rendered as a placeholder, and no arbitrary `file:`/remote/data path reaches `<img>`. The checklist requires file access confinement to the document folder (`docs/review-checklist.md` §2.7).

**Actual:** an untrusted document can display any local image file outside the package. CSP blocks remote `https` image loads, and I found no script execution or network exfiltration path, which is why this is S2 rather than S1; it still violates the confinement requirement and the “no absolute paths / remote content” rule.

**Direction (product/architecture decision required):** choose whether legacy `src` documents are migrated, dropped to a placeholder with alt text, or restricted to `noteforest-asset://asset/<64-hex>`. M2 had no image insertion, so dropping legacy `src` is plausible, but the product owner must confirm. Add validation and a load fixture; do not rely on CSP alone.

### S3-1 — The AC-57 image fixture matrix is missing

**Severity:** S3 (evidence gap; behavior is covered by unit/UI tests)  
**Location:** `fixtures/` (no `m3-image-regions.json`), `packages/core/test/fixtures.test.ts:79-126`, design requirement `docs/design/m3-anchors-references.md:1761`

The design proposes `m3-image-regions.json` (names are proposals) covering two regions on one image, two images sharing an asset, display resize, asset replacement, and missing asset. The behavior exists in `packages/core/test/anchors.test.ts:856-960` and the M3c3b2 UI test, but no image fixture is in `fixtures/` and the fixture-matrix test lists no image entry. AC-57 therefore remains partial.

**Direction:** add an image fixture and table-driven cases, or record an explicit product-owner deviation. The formula-term edit fixture (`m3-formula-term-edit.json`) is now present, so the remaining gap is the image fixture.

### S3-2 — Protocol handler and MIME/symlink hardening are not directly tested

**Severity:** S3 (security hardening; no exploit found)  
**Location:** `apps/desktop/src/main/asset-protocol.ts:39-81`, `apps/desktop/test/asset-paths.test.ts:1-32`, `apps/desktop/src/main/library.ts:498`

`asset-paths.test.ts` tests only the lexical helper. There is no handler-level test for 404, content type, `nosniff`, `no-store`, symlink rejection, or traversal. `resolveOpenAsset` accepts any recorded `mime` string, so a crafted document can serve arbitrary MIME bytes through the scheme; current CSP/window-navigation guards prevent navigation, but an image MIME allowlist and a response CSP would be defense in depth. `NodeAssetStore` rejects a symlink at the final asset file, but a symlinked `assets/` directory is not realpath-checked, so a malicious package layout can still resolve outside the package. There is also a TOCTOU window between `lstat` and `readFile`.

**Direction:** serve only `SUPPORTED_IMAGE_MIMES`, add handler tests (404/MIME/headers/symlink/traversal), and decide whether `realpath` confinement is required now. Record the scheme in architecture docs.

### S3-3 — Block-menu image actions target only the first image in a block

**Severity:** S3 (edge case; the content model allows multiple images per block)  
**Location:** `apps/desktop/src/renderer/src/actions.ts:477-482, 571-627`, `apps/desktop/src/renderer/src/editor/views/ImageNodeView.tsx:548-567`

Inserting two images into one block is possible (the insert path appends). `firstImage(block.content)` supplies the path for **Replace image…**, **Edit image alt text…**, and the block-menu region/point actions, so only the first image can be replaced or alt-edited from the menu. The image node's inline Add region/Add point buttons do target the clicked image, but there is no inline replace/alt action.

**Direction:** either add per-image actions/selection, or explicitly constrain one image per block with a clear message. Do not silently act on the first image when the user selected the second.

### S3-4 — Cross-document image copy/paste keeps an asset id but does not copy the asset

**Severity:** S3 (multi-document edge case; the source document is unaffected)  
**Location:** `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx:199-220`, `apps/desktop/src/renderer/src/lib/adapter.ts:134-150`, `apps/desktop/src/renderer/src/editor/extensions.ts:42-45`

The copy/paste path strips anchor bindings and drops unbacked `<img>` nodes, but an image backed by a source `assetId` is kept. Copying an image from one open document and pasting it into another carries the source package's `assetId` with no corresponding `document.assets` record or bytes in the destination. The destination renders the placeholder; the image is not copied into the destination package. This is a code-path finding; I did not build a two-tab clipboard probe for it.

**Expected:** pasting an image copies its bytes into the destination package (the spec's paste rule), or the app clearly refuses the cross-document paste instead of inserting a broken image.

**Direction:** carry the asset bytes in the clipboard payload or re-import them through the destination store; add a cross-document UI test. Same-document copy/paste is fine because the asset record already exists.

### S4-1 — Marker numbers skip idle anchors

**Severity:** S4  
**Location:** `apps/desktop/src/renderer/src/editor/views/ImageNodeView.tsx:251-258`

The marker loop indexes over all ordered anchors and skips anchors with no live branch, so after deleting a branch the visible markers can read 1, 3, … The numbering is deterministic but not a contiguous user-facing sequence. Minor copy/visual issue.

### S4-2 — `asset.remove` does not check references; asset GC remains unfinished

**Severity:** S4 in M3c3b (not exposed in the UI); S3 risk when the M5 API exposes it  
**Location:** `packages/core/src/commands/asset.ts:96-108`, `apps/desktop/src/renderer/src/state/runtime.ts:552-556, 613-617`

`asset.remove` deletes a record even if an image node still references it, and image insert/replace deliberately leave the asset record after undo. The report records GC as a follow-up; before any GC or External Agent API ships, it must not delete a referenced asset, and it must consider backup-only references (backups contain `document.json` only).

### S4-3 — Native-picker image dimensions are absent (M4 prerequisite)

**Severity:** S4 for M3c3b; **M4 guard**  
**Location:** `apps/desktop/src/main/library.ts:422-426` (picker insert has no `width`/`height`), `packages/layout/src/estimate.ts:373-377` (fallback 220×120), `apps/desktop/src/renderer/src/lib/image-insert.ts:158-166` (paste/drop records dimensions)

The editor renders a picker image with the correct intrinsic aspect via the loaded `<img>`, but the canonical asset/node has no dimensions. The layout estimator therefore uses 220×120 for picker images. For portrait or large images this can under/over-estimate the block height, drift from the rendered page, and cause an image to be placed incorrectly at a page boundary in M4/PDF.

**Direction:** decode intrinsic dimensions in the main process (for example `nativeImage.createFromPath(...).getSize()`) before `asset.insert`, or measure the loaded image in the renderer and update the asset/node; do not paginate/export an image until its dimensions are known.

## Checks run

| Check | Result |
|---|---|
| `npm ci --no-audit --no-fund` | clean install from lockfile (199 packages) |
| `npm run build` | pass (existing `use client` bundler warnings only) |
| `npm run typecheck` | pass: desktop node/web, core, layout, pdf |
| `npm run check:boundaries` | pass: 127 files, 592 imports, 16 rules, 0 violations |
| `npm test` | **62 files / 669 tests pass, 2.05 s** |
| `npm run test:ui` | **41/41 tests pass across 17 files** (all files, exit 0); new M3c3b1 2/2, M3c3b2 3/3 |
| `npm run e2e:critical` | **16/16 pass, 36.0 s suite / 44.1 s total** |
| `npm run test:recovery:run` | **14/14 pass, 17.5 s** |
| New-test hygiene | no `skip`/`todo`, no fixed sleeps, no native-dialog waits; picker is overridden through the E2E guard |
| Probes (not committed) | missing asset file → placeholder but `health chip 0`; overwritten bytes → new image rendered, marker retained, `health chip 0`; legacy `file:` src → local image rendered (`naturalWidth 640`) |

The full `npm run verify` was not run as one combined command; its components were run separately above. The Orchestrator still owns one full `npm run verify` at integration.

## Screenshots inspected

- `artifacts/m3c3b1/image-inserted-1440x900.png` — image at block width, correct aspect.
- `artifacts/m3c3b1/image-missing-1440x900.png`, `image-reloaded-1440x900.png` — placeholder/reload.
- `artifacts/m3c3b2/region-markers-callouts-1440x900.png` — two numbered region markers and callouts.
- `artifacts/m3c3b2/point-anchor-960x800.png` — point marker and responsive layout.
- `artifacts/m3c3b2/image-anchor-asset-changed-health-1440x900.png` — asset-changed health row and actions.
- `artifacts/m3c3b2/image-anchor-missing-placeholder-health-1440x900.png` — asset-missing health row; the dialog covers much of the image, but the 960 placeholder screenshot below shows the placeholder clearly.
- `artifacts/m3c3b2/image-anchor-missing-placeholder-960x800.png` — placeholder, alt, and “Lost anchor” buttons visible.

## What I could not verify

- Real OS image picker and real drag/drop from Finder (the UI tests use the dialog guard override and a synthetic drop). Clipboard paste of image files is also not exercised end-to-end. Product-owner manual check remains.
- Image health attach/delete/keep-broken **outcomes**: the image test verifies the buttons and the no-relink note, while the generic action behavior is covered by `tests/ui/m3-repair.test.mjs`; no image-specific end-to-end click-through was run.
- M4 page view/PDF image rendering, page-break behavior, and “image anchor lost” markers.
- Native-picker image dimensions in layout/pagination.
- EXIF orientation, very large (near 100 MB) images, animated GIF/AVIF/BMP behavior, and unreadable/permission-denied files beyond the code path.
- Crop editing and full region re-pick repair (declared follow-ups).
- Asset GC and backup/restore interaction with assets (declared follow-up).
- Protocol handler integration tests (404, MIME, headers, directory symlink, TOCTOU) and the External Agent API (`asset.remove`) path.
- The combined single `npm run verify`; components passed.
- VoiceOver/manual visual judgement and any screen recording; those remain product-owner checks.

## Residual gaps and product decisions

1. **Legacy `src` policy (S2-3).** Drop `src`-only images to a placeholder with alt text, restrict them to `noteforest-asset://asset/<64-hex>`, or migrate them once. M2 had no image insertion, so dropping may be acceptable, but this is a product-owner decision and needs a load migration/fixture.
2. **Asset integrity policy (S2-2).** Hash verification on every read is expensive for large images; once per open/reload is cheaper but must be recorded. Define the user-facing behavior for external asset changes.
3. **Missing-file semantics (S2-1).** Decide whether a present record with a missing/unreadable file is `asset-missing` (recommended) and ensure health/export/M4 markers use the same rule.
4. **Asset GC and backups.** Decide whether backups include assets or whether GC must preserve assets referenced only by backups; otherwise restoring a backup will show placeholders.
5. **Custom protocol.** The `noteforest-asset://` scheme is an implementation detail consistent with the Electron stack; no new product ADR is required for M3c3b, but record the scheme, MIME allowlist, and CSP in architecture docs before M4/print/API rely on it.
6. **Crop editor / region re-pick.** Remains an agreed follow-up; no branch or target is lost in the meantime.
7. **`asset.remove` reference check.** Before the M5 API exposes it, require a reference check or a destructive confirmation naming affected images.

## M4 statement

**M4 must not start the image/page/PDF slice until S2-1, S2-2, and S2-3 are fixed or explicitly accepted by the product owner with recorded guards.** Layout/text M4 work can proceed in parallel only if the orchestrator records that the image rows of M4/PDF remain blocked.

Minimum image guards before M4/PDF image acceptance:

- decode and persist intrinsic dimensions for native-picker images, or measure loaded images before pagination; never rely on the 220×120 estimator fallback;
- verify asset availability/integrity at load and make missing/changed files `asset-missing`/`asset-changed` with the same health/export marker;
- sanitize image sources on load so only package assets reach `<img>`; no absolute paths, remote URLs, or unverified legacy `src`;
- make the print renderer use the same protocol/CSP and wait for image load before `printToPDF`;
- preflight too-tall/too-wide images as M4 defects (AC-63/UX F9), not as clipped content;
- decide asset GC/backup interaction before any GC ships.

## Recommended next step

1. Product owner decides the legacy `src` policy, asset-integrity policy, and missing-file semantics (items 1–3 above).
2. Builder fixes S2-1/S2-2/S2-3 with regression tests, then adds the AC-57 image fixture and protocol handler tests (S3-1/S3-2).
3. Re-run the M3c3b image UI/e2e/recovery checks and return a re-review; then M4 can start with the dimension/print guards above.
