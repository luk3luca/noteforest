# M3c3b1 — image asset pipeline and editor rendering

**Status:** Builder complete in worktree; not merged or pushed.
**Branch:** `t3/m3c3b1-image-pipeline-rendering`
**Base:** `902d185` (`docs: close M3i and start M3c3b1 image pipeline`)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-3c62c688`

## Summary

- Implemented `NodeAssetStore` behind the M3i3 `AssetStore` contract: SHA-256 content ids,
  atomic temp-write + rename inserts, dedupe, package-confined reads, typed missing/unreadable
  results, `assets/<id>` paths, and a renderer-safe URL.
- Added `asset.add` / `asset.remove` as typed, validated, undoable commands. Adding an existing id
  keeps the first canonical record; the inverse removes the record added by the command.
- Added the `noteforest-asset://` protocol in the Electron main process. It resolves only a live
  document's recorded asset id to a regular file inside that package's `assets/` directory; symlinks
  and package-external paths are rejected. No remote URLs or network access.
- Canonical image nodes keep `assetId`, optional `alt`, intrinsic `width`/`height`, and reserved
  `anchorIds`. The editor projection injects `src` and a view-only `missing` flag; `pmToContent`
  strips all display-only fields before canonical content is written.
- Added block-menu and command-palette insertion through the native picker (E2E uses the dialog
  guard/override), paste/drop import, an alt-text dialog, block-width rendering with intrinsic
  aspect, and a labeled missing-asset placeholder.
- Added unit, app-projection, path-safety, UI, save/reload, missing-placeholder, and drop tests plus
  screenshots.

## Asset protocol / URL scheme

- Scheme: `noteforest-asset://asset/<lowercase-hex-sha256>`
- `NodeAssetStore.pathFor(id)` returns the package-relative POSIX path `assets/<id>`.
- `NodeAssetStore.urlFor(id)` returns the scheme URL above. No absolute filesystem path is ever
  sent to the renderer or stored in canonical content.
- The main-process handler maps an id only through `document.assets[id]`, checks the recorded path
  is lexically inside the package `assets/`, requires a regular file (`lstat`, no symlinks), and
  serves the bytes with the recorded MIME type, `nosniff`, and no-store caching.
- A missing record or file is HTTP 404; the editor node view renders the labeled placeholder.

## Canonical node shape

```json
{ "type": "image", "attrs": { "assetId": "sha256-hex", "alt": "Forest plot", "width": 640, "height": 360 } }
```

- `assetId` is required for new images; `alt`, `width`, and `height` are optional.
- `anchorIds` is reserved for M3c3b2 and preserved by the existing atomic-anchor projection.
- `src`, `title`, `missing`, and other display-only fields are never written back.
- The asset record is `document.assets[assetId]` with `id`, package-relative `path`, `mime`,
  `bytes`, and optional `width`/`height`/`alt`/`originalName`.

## Insertion paths

- **Block menu / command palette → Insert image…** opens the native image picker. The main process
  reads the file, validates type/size, copies it into the package assets, and returns the canonical
  asset record; the renderer records it with `asset.add`, then inserts the image through one
  `block.editContent` command. An empty block becomes the image; a non-empty block appends it.
- **Paste / drop** reads the file bytes and intrinsic dimensions in the renderer, sends them through
  `document:import-image-bytes`, and follows the same `asset.add` + `block.editContent` path.
  Dropped images target the block under the pointer.
- **Alt text** is editable from the block menu (`Edit image alt text…`) through a small dialog and
  the same `block.editContent` command; the path and undo behavior stay canonical.
- The `/image` slash menu is not shipped because the M2 shell has no slash menu; the block menu and
  command palette are the available entry points.

## Tests

- `packages/core/test/asset-store.test.ts` — hash/dedupe, bytes/read/missing, atomic cleanup on a
  blocked rename, id-as-path/traversal rejection, symlink rejection, URL mapping, canonical record
  metadata, `asset.add`/inverse, duplicate-record behavior, invalid paths, image/asset JSON
  round-trip. **10/10, 0.13 s.**
- `apps/desktop/test/image-projection.test.ts` — assetId→URL projection, present/missing assets,
  display-field stripping, legacy `src` retention, empty-block insertion, alt editing, MIME/filter
  helpers. **8/8, 0.11 s.**
- `apps/desktop/test/asset-paths.test.ts` — protocol path containment and traversal rejection.
  **2/2, 0.14 s.**
- `tests/ui/m3c3b1-image.test.mjs` — native-picker insertion through the dialog override, empty
  block replacement, block-width/aspect measurements, alt edit, save + relaunch reload, missing
  placeholder, and a synthetic drop import. **2/2, 6.7 s.**
- `npm test`: **60 files / 657 tests pass, 1.98 s.**
- `npm run test:ui`: **38/38 UI tests pass** across 16 files (new image file 2/2, 6.7 s).
- `npm run e2e:critical`: **16/16, 44.7 s.**
- `npm run test:recovery:run`: **14/14, 17.8 s.**
- `npm run check:boundaries`: 125 files, 576 imports, 16 rules, 0 violations.
- `npm run typecheck`: pass for desktop, core, layout, PDF.
- `npm run verify:fast`: pass.

## Screenshots

- `artifacts/m3c3b1/image-inserted-1440x900.png`
- `artifacts/m3c3b1/image-missing-1440x900.png`
- `artifacts/m3c3b1/image-reloaded-1440x900.png`

## Risks

- The asset URL scheme and `asset.add`/`asset.remove` commands are new public surface; Sentinel
  should confirm the protocol choice and command naming before M4 depends on them.
- Undo of an image insert removes the image content but deliberately leaves the asset record (one
  undo entry per user action). Asset garbage collection is deferred; orphan records/files are
  harmless.
- Native-picker images do not record intrinsic `width`/`height` (the main process does not decode
  image headers). The editor renders correct intrinsic aspect via the loaded `<img>`, but M4 layout/
  PDF should measure or decode dimensions before relying on the estimator defaults for picker
  images. Paste/drop images do record dimensions.
- Very large images are copied asynchronously with an indeterminate loading toast; no percentage
  progress or freeze benchmark is included.
- `/image` slash-menu insertion is not available because the slash menu is still a shell gap.
- Real OS drag/drop and native picker interaction remain manual checks; the UI test uses the
  dialog guard override and a synthetic drop event.
- `asset.remove` does not check whether another image still references the asset; it is currently
  used as the inverse of `asset.add` and by tests, not exposed in the UI.
- Save-copy and backup restore already copy the package assets; this slice did not add new recovery
  semantics. A restored document that references a missing asset shows the placeholder.
