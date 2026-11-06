# M3c3b1 — image asset pipeline and editor rendering

**Role:** Implementer / Builder  
**Milestone:** M3c3b — deferred image pipeline  
**Base:** current `main` after M3i closure (`034f759` plus docs)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** image insertion, content-addressed asset storage, rendering, missing-asset placeholder.
Image anchors are **M3c3b2**, not this slice.

## Context

Read `AGENTS.md`, `docs/spec.md` §4/§8/§9 (image content, assets, missing image), `docs/ux.md` image
authoring flow, `docs/design/m3-anchors-references.md` image section, `docs/architecture/core-stabilization.md`,
and the `AssetStore` contract from M3i3. The model already anticipates image nodes/assets, but there
is no insertion, asset copy/URL, rendering, or missing placeholder.

## Required work

### 1. Asset store implementation
- Implement `NodeAssetStore` behind the existing `AssetStore` contract in `packages/core/src/node`
  (or the correct Node-only layer): content-addressed by bytes/hash, atomic insert, dedupe by id,
  `has`/`read`/`pathFor`/`urlFor`/`insert`, missing result.
- Store assets inside the document package `assets/` directory; reject path traversal and
  package-external paths. No remote URLs, no telemetry.
- Preserve package save/backup/recovery and the single-writer lock.

### 2. Image node and canonical content
- Use the existing canonical image node shape: `assetId` (content-addressed), optional `alt`, and
  `anchorIds` reserved for M3c3b2. Do not store display pixels or absolute file paths.
- Editor projection maps `assetId` to a local asset URL; loading a missing asset returns the
  placeholder path/metadata instead of throwing.
- The canonical JSON stays portable: the same package opened on another machine resolves assets by
  package-relative id.

### 3. Editor authoring and rendering
- Insert an image from the block menu/`/image` at the start of an empty block, and from paste/drop if
  practical within the slice; use the E2E dialog guard for native file selection in tests.
- Copy the chosen file into the package assets before inserting the node; do not reference the
  external file.
- Render at block width with intrinsic aspect ratio; alt text editable via the block menu/inspector
  if the existing UI supports it.
- Missing asset: visible labeled placeholder, no crash, no silent deletion.
- Do not implement image-region anchors, crop tools, or PDF image rendering here.

### 4. Tests
- Unit: content hash/dedupe, atomic insert, path traversal rejection, missing/read, URL mapping,
  canonical round-trip.
- App/UI: insert image via the test file path, render at width, save/reload, missing asset placeholder,
  and a large-image progress/no-freeze case if practical.
- Recovery/e2e: no native dialog waits; existing suites green.
- Screenshots: image inserted, missing asset placeholder.

## Guardrails

- No new runtime dependency unless strictly required; prefer existing Electron/TipTap APIs.
- No schema/command semantics change outside the image node/asset fields already specified.
- No image anchors or PDF work in this slice.
- Do not add remote asset URLs or network access.

## Gates

`npm run check:boundaries`, `npm run typecheck`, targeted vitest, `npm test`, targeted UI,
`npm run test:ui`, `npm run e2e:critical`, `npm run test:recovery:run`, `npm run verify:fast`.
The Orchestrator runs one full `npm run verify` after integration.

## Deliverable

Report: worktree path, branch, base, commit, files, asset protocol/URL scheme, canonical node shape,
insertion paths, tests/timings, screenshots, risks, not verified. Do not merge or push. Stop and ask
if a custom protocol, schema field, or native dialog behavior needs a product/architecture decision.
