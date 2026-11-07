# M3c3b4 — image UX and asset lifecycle

**Role:** Implementer / Builder  
**Milestone:** M3c3b  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-f4673acc`  
**Branch:** `t3/image-ux-lifecycle-asset-gc`  
**Base:** `c82f5d9` (`docs: launch M3c3b4 image UX/lifecycle`)  
**Commit:** branch HEAD, `fix: image UX and asset lifecycle (M3c3b4)`  
**Status:** implemented, tested, not merged or pushed

## Summary

Closed the five M3c3b Sentinel follow-ups without changing M4/PDF, crop editing, region
re-pick, the spec, or the ADRs:

1. **Multi-image blocks.** Block-menu and palette image actions act on every image in a
   multi-image block with `Image N (alt)` labels; the image node has its own `Image actions…`
   menu. A two-image UI test proves Replace, alt edit, region authoring, and inline actions use
   the clicked image's `nodePath`, never the first image.
2. **Cross-document copy/paste.** A pasted image whose `assetId` is not in the destination
   package starts as a placeholder with no `assetId`; the repair path copies the verified
   bytes from the source package into the destination package, records the canonical asset, and
   only then writes `assetId`. Unresolvable sources become a labeled placeholder with
   `unavailable: "cross-document-copy"` and no dangling id. Same-document paste keeps the
   existing record and deduplicates.
3. **Marker numbering.** Visible image markers are numbered after idle/broken anchors are
   filtered, so they are always `1..N`; deleting a middle branch no longer produces `1, 3`.
4. **Asset lifecycle.** `asset.remove` now refuses any asset still named by an image node or an
   image anchor (`asset-in-use`, no mutation, no revision bump). A deterministic
   `planAssetGc(document, { retainedAssetIds })` policy and `backupAssetReferences()` scan make
   backup-only references explicit, so a future GC pass can never reclaim an asset a retained
   backup could restore. Automatic GC scheduling remains a product decision (spec §10.8).
5. **Docs/tests.** Coverage matrix updated; new unit and UI tests; four screenshots.

## Clipboard payload and design

**Payload (v1).** The clipboard is the standard ProseMirror HTML/text slice. A NoteForest image
carries `data-asset-id` (the lowercase-hex SHA-256 content address), `alt`, and optional
`width`/`height`. No filesystem path, `data:` URL, or remote URL is ever part of the payload.

**Session sidecar.** The editor `copy` handler records `assetId -> source packagePath` for the
images in the copied selection. This is not canonical data and never leaves the process; it lets
a paste after closing the source tab still copy from the same library package. If the sidecar is
missing, the repair falls back to any open runtime that records the id.

**Paste classification.**

| Case | Behavior |
|---|---|
| Destination already records the id (same document, re-paste, deduped image) | Keep `assetId`; no import, no new record. |
| Destination does not record the id, source bytes readable | Placeholder with editor-only `clipboardAssetId`; main-process `copyImageAsset(source, destination, id)` verifies SHA-256, inserts bytes, renderer records `asset.add`, then the node gets `assetId`. |
| Source unavailable, closed, moved, or bytes missing/changed | Placeholder keeps `alt` (and dimensions), removes every id, and stores `unavailable: "cross-document-copy"`. It is labeled “Image not copied” across reload. |
| Legacy `<img src>` with no `assetId` | Existing behavior: dropped from paste, never a canonical remote/file path. |

`copyImageAsset` is a main-process IPC path (`document:copy-image-asset`). It reads the source
record from the open store or a read-only package validation, reads bytes through
`NodeAssetStore.readVerified`, allows only supported image MIME types, refuses read-only
destinations, and inserts into the destination store. The content address makes deduplication
automatic. The renderer never receives a filesystem path.

The repair is asynchronous but starts from a safe state: the default paste inserts only a
placeholder, so there is no window in which the document contains an `assetId` that resolves
only in another package. A quit between paste and repair leaves the labeled placeholder, never
a broken reference.

## Asset GC policy

**Reference guard (`asset.remove`).** The command rejects with `asset-in-use` when either an
image node in block content or an image anchor selector still names the asset. The message names
the count and the first block/anchor; the document, revision, and undo stack are untouched.
There is no force flag: the user must remove or replace the images first, which is explicit and
undoable.

**Deterministic GC plan.** `planAssetGc(document, { retainedAssetIds })` returns sorted
`reclaimable` ids and `retained` ids with reasons (`live-image`, `live-anchor`,
`retained-backup`). A record is reclaimable only when nothing names it.

**Backup/restore.** Backups contain `document.json` only; assets are shared with the live
package. `backupAssetReferences(packagePath)` reads every retained backup, unions the asset
records and live image/anchor references in those documents, and returns the ids a GC pass must
keep. Restore copies only assets present in the current package, so retaining backup-only ids
prevents a restore from resurrecting a record whose bytes were reclaimed. Invalid/unreadable
backups retain nothing because they cannot be restored.

**What runs automatically.** Nothing. There is no automatic GC in v1 and no UI/API deletion
surface. Image insert/replace and undo intentionally leave an unreferenced record, which is
reclaimable by this policy. When a GC pass runs (after a backup and the §10.8 grace period) is a
product decision; the implementation deliberately stops at the guard + planner + backup scan so
that a future API cannot delete a live or backup-referenced asset.

## Multi-image actions

- `imagesInContent(block.content)` returns every image with its canonical path; `firstImage`
  now delegates to it for legacy callers.
- In a multi-image block every block-menu entry is prefixed with `Image N (alt)`; a separator
  separates image groups. A single-image block keeps the previous labels unchanged.
- Each image node has an `Image actions…` button that opens the same action set for that exact
  `nodePath`: Add region, Add point, Replace image, Edit alt text.
- Clicking an image selects the image node, so ⌘C/⌘X and the menu target that node.

## Marker numbering

The marker order remains deterministic (creation time, then anchor id), but the visible number
is assigned after idle, unresolved, and invalid-region markers are filtered:
`number = markers.length + 1`. Numbers are therefore contiguous `1..N` and stable for the
visible sequence.

## Files changed

**Core**

- `packages/core/src/assets.ts` — `AssetReference`, `imageAssetReferences`,
  `referencedAssetIds`, `planAssetGc`.
- `packages/core/src/commands/asset.ts` — reference guard, `asset-in-use` rejection.
- `packages/core/src/commands/types.ts` — `asset-in-use` error code.
- `packages/core/src/node/recovery.ts` — `backupAssetReferences`.
- `packages/core/test/asset-gc.test.ts` — guard, GC plan, backup retention tests.

**Desktop**

- `apps/desktop/src/main/library.ts` — `copyImageAsset`.
- `apps/desktop/src/main/index.ts` — `document:copy-image-asset` IPC.
- `apps/desktop/src/preload/index.ts`, `apps/desktop/src/shared/api.ts` — typed bridge.
- `apps/desktop/src/renderer/src/lib/image-clipboard.ts` — copy sidecar, placeholder repair.
- `apps/desktop/src/renderer/src/lib/adapter.ts` — cross-document image marking, editor-only
  field stripping, durable placeholder reason.
- `apps/desktop/src/renderer/src/lib/image.ts` — `imagesInContent`, `imageActionLabel`.
- `apps/desktop/src/renderer/src/actions.ts` — per-image block-menu and inline menu entries.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — copy handler and paste repair.
- `apps/desktop/src/renderer/src/editor/extensions.ts` — `clipboardAssetId`/`unavailable`
  image attributes.
- `apps/desktop/src/renderer/src/editor/views/ImageNodeView.tsx` — per-image menu, node
  selection, marker numbering, copy placeholder, click-to-select.
- `apps/desktop/src/renderer/src/state/runtime.ts` — `recordAsset`.
- `apps/desktop/test/image-projection.test.ts` — clipboard marking, placeholder, multi-image
  paths.

**Tests/docs**

- `tests/ui/m3c3b4-image-lifecycle.test.mjs` (new) — multi-image actions, marker numbering,
  same/cross-document paste, unknown-source placeholder.
- `tests/ui/m3c3b2-image-anchors.test.mjs` — replaced the old `asset.remove` expectation with
  the new refusal path; missing-file integrity stays in `m3c3b3`.
- `package.json` — `test:ui`/`verify` include the new UI file.
- `docs/architecture/test-coverage-matrix.md` — image rows and GC gaps.

## Checks and timings

| Check | Result |
|---|---|
| `npm run check:boundaries` | pass: 130 files, 606 imports, 16 rules, 0 violations |
| `npm run typecheck` | pass: desktop node/web, core, layout, pdf |
| `npm test` | **66 files / 704 tests pass, 2.03 s** |
| `npm run test:ui` | **48/48 pass across 19 files**; new `m3c3b4` **3/3, 14.97 s**; `m3c3b2` 3/3 |
| `npm run e2e:critical` | **16/16 pass, 36.0 s suite / 44.1 s total** (standalone) |
| `npm run test:recovery:run` | **14/14 pass, 17.8 s** |
| `npm run verify:fast` | **pass**: boundaries 0 violations, typecheck clean, 704/704 unit, 16/16 e2e |

Targeted development runs: `asset-gc.test.ts` 7/7 (48 ms), `image-projection.test.ts` +
`adapter.test.ts` + `asset-gc.test.ts` 35/35 (142 ms).

## Screenshots

- `artifacts/m3c3b4/multi-image-actions-1440x900.png` — two images in one block, per-image
  `Image actions…` buttons.
- `artifacts/m3c3b4/marker-numbering-1440x900.png` — markers `1, 2` after the middle idle
  anchor is hidden.
- `artifacts/m3c3b4/cross-document-paste-1440x900.png` — image copied into the second document.
- `artifacts/m3c3b4/cross-document-placeholder-1440x900.png` — labeled “Image not copied”
  placeholder with alt text and no assetId.

## Risks and not verified

- **Post-paste repair window.** A cross-document paste shows a short “Copying image…” placeholder
  before the image appears. Quitting in that window keeps the labeled placeholder; it never
  keeps a dangling id. This is intentional and test-covered for the failure path, not for a
  mid-import quit.
- **Closed/moved source.** The sidecar path lets a closed source tab copy from its package; a
  moved or deleted package falls back to the placeholder. Cross-application or post-restart
  clipboard payloads contain only the id, so they also fall back to the placeholder.
- **Clipboard transport.** The payload is ProseMirror HTML plus a process-local sidecar, not a
  custom clipboard MIME. A custom MIME would need platform-by-platform verification on macOS.
- **`unavailable` image attribute.** The labeled cross-document placeholder stores an optional
  `unavailable: "cross-document-copy"` attr on the image node. Unknown image attributes are
  preserved by the content model; this is a view-support marker, not a schema bump. It is
  removed when a later paste repairs the image.
- **Automatic GC scheduling.** Not implemented by design; the guard, planner, and backup scan
  are ready, but when/whether a pass runs (and the grace period) is a product decision.
- **Backup scan cost.** `backupAssetReferences` parses up to 50 backup documents. It has no
  production caller; a future GC scheduler should run it off the save path.
- **Visual/VoiceOver.** Screenshots are provided; subjective visual and VoiceOver judgement
  remains with the product owner. No screen recording was made.
- **M4/PDF, crop editor, full region re-pick, new dependencies.** Not touched, as required.
- **Platforms.** Verified on macOS (Electron 45), the only target in v1.
