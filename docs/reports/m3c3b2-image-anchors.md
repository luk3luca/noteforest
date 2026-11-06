# M3c3b2 — image region and point anchors

**Status:** Builder complete in worktree; not merged or pushed.
**Branch:** `t3/m3c3b2-image-region-anchors`
**Base:** `5434877` (`docs: start M3c3b2 image anchors`, after M3c3b1 `b13d97c` / merge `6e50141`)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-54a602ea`

## Summary

- Image blocks now offer **Add image region…** and **Add image point…** from the block menu, plus
  compact **Add region** / **Add point** buttons when the image block is selected.
- Dragging over the rendered image opens a draft rectangle with **Branch from region** as the
  focused default and **Cancel**; `⌥`-drag creates a point instead. `Esc` cancels at any point.
  A draft is view state only: it creates no anchor, branch, target, marker, save, or revision until
  the user confirms.
- Confirming calls the existing `branch.createFromSelection` command with `kind: 'image'`, a
  normalized selector, the atomic image binding, a new primary target, and the existing inverted
  structure snapshot. One undo removes the branch, target, anchor, `anchorIds` entry, and marker;
  redo restores the same IDs.
- Resolved regions draw a numbered marker over the image; point anchors use a numbered badge with a
  22 px hit area. Markers are real buttons, reachable by keyboard, and activate/cycle the anchor's
  branch through `runtime.activateAnchor`. Region outlines are visible on hover/selection and are
  clickable.
- The existing callout lane renders image branches unchanged. The quote chip shows the durable
  image label plus `region` or `point`; the existing block warning, health chip, and health sheet
  handle broken image anchors.
- Asset replacement is available through the block menu (**Replace image…**) and reuses the
  existing picker/import path. Resolver state becomes `asset-changed`; missing asset records/files
  render the M3c3b1 placeholder and become `asset-missing`. Branches, targets, alt text, the old
  selector asset ID, and the anchor identity are never deleted.
- The health sheet shows specific image reasons, keeps attach-to-block/delete/keep-broken recovery,
  and hides the text/code relink action. Re-picking a new image region is an explicit follow-up.

## Selector and binding shape

New image anchors store normalized geometry only:

```json
{
  "kind": "image",
  "assetId": "sha256-…",
  "rect": { "x": 0.14, "y": 0.2, "width": 0.32, "height": 0.36 },
  "crop": { "x": 0, "y": 0, "width": 1, "height": 1 },
  "point": false,
  "label": "forest"
}
```

The content binding is `attrs.anchorIds` on the image node:

```json
{ "type": "image", "attrs": { "assetId": "sha256-…", "anchorIds": ["…", "…"] } }
```

- `rect` is 0–1 relative to the image's intrinsic dimensions, rounded to four decimals; every new
  anchor includes the full-image `crop`.
- A point is exactly `{ width: 0, height: 0, point: true }`; a region is non-empty with
  `point: false`. The authoring bridge rejects empty drags, out-of-image values, and mismatched
  point flags before any command runs.
- `anchorIds` stays sorted and deterministic; removing the last branch leaves an idle anchor whose
  marker is hidden (OD-2), never a broken row.

## Authoring flow

1. Select an image block; use **Add image region…** / **Add image point…** from the block menu or the
   image's inline actions.
2. Drag a rectangle (or hold `⌥` while dragging for a point). The draft is projected from client
   pixels to intrinsic normalized geometry; no display pixels reach the document.
3. On release the action bar shows **Branch from region** / **Branch from point** (focused default)
   and **Cancel**. `Enter` confirms the focused action; `Esc` cancels.
4. Confirm runs one `branch.createFromSelection` command. The image keeps one atomic binding, multiple
   regions/points use separate anchor IDs, and each branch gets its own callout row and target.
5. A second region on the same image is allowed. Image markers are numbered in anchor creation
   order; the callout lane keeps the existing D3/core anchor ordering.

## Geometry

- `normalizedPointFromClient` / `normalizedRegionFromClient` map the rendered image box (including
  crop) to intrinsic 0–1 coordinates and clamp to the visible image. Empty drags under 3 px are
  rejected with an inline error and no mutation.
- `displayRectForAnchor` projects the canonical rect back to the visible image for rendering. The
  node view uses percentage positions, so a window resize, zoom change, or image width change
  recomputes the overlay without touching the anchor.
- Verified at 1440×900 and 960×800 (canvas width changes; card width is stable by design) and under
  a zoom change. Region ratios matched the stored selector in all three cases within 0.012.
- Crop is not authored in this slice; every new selector stores the full-image crop. The resolver
  already compares selector crop with the image node. A future crop editor must round-trip a
  canonical image `crop` attribute through the editor schema before crop-change repair is exercised.

## Broken/missing behavior

- **Asset replacement:** `Replace image…` adds the new asset record, then edits the image node's
  `assetId` (preserving `alt`). Image anchors keep their old `assetId`, so each anchor becomes
  `asset-changed`; the branch, target, selector, and `anchorIds` stay.
- **Asset removal / file loss:** the image node still names the asset; a removed record or failed
  file load renders the labeled placeholder. A selector naming that asset becomes `asset-missing`.
- **Health sheet:** image rows show “The image asset changed.” / “The image asset is missing.”,
  preserve the branch list and targets, and keep Attach branches to block, Delete anchor, and Keep
  broken. The text/code Relink action is hidden for image anchors, with an explicit note that
  region re-pick is a follow-up.
- **Persistence:** save/reload preserves rects, point flags, sorted `anchorIds`, markers, callouts,
  branches, targets, alt text, and both broken reasons. Undo/redo restores the exact branch, anchor,
  and target IDs and the normalized geometry; save/reload preserves the replacement/removal broken
  state.
- Asset removal has no dedicated UI action in this slice (the brief allows an app-level command
  path); the E2E test exercises it through the typed `asset.remove` command. Replace has a UI path.
- Full “re-pick a new region” repair remains a documented follow-up. No branch or target is lost in
  the meantime.

## Tests and timings

- `packages/core/test/image-anchor-commands.test.ts` — image branch create with sorted binding,
  new target, exact undo/redo, multiple regions plus exact point, invalid selector rejection.
  Included in the 26-test targeted run below.
- `apps/desktop/test/image-anchor.test.ts` — point/region normalization, crop mapping, clamping,
  empty rejection, selector/binding shape, full-crop default, target lookup.
- `apps/desktop/test/image-projection.test.ts` — added asset replacement preserving alt and
  metadata.
- `apps/desktop/test/anchor-health.test.ts` — added image asset-changed/asset-missing rows with
  branch/target preservation.
- `tests/ui/m3c3b2-image-anchors.test.mjs` — three end-to-end UI flows: two regions plus `⌥`-drag
  point, numbered/keyboard markers, callouts, default action focus, 1440→960 resize, zoom,
  undo/redo exactness, save/reload; Escape and Cancel with unchanged document/revision; replacement,
  removal, placeholder, health reasons, recovery actions, and broken-state reload.
- Targeted vitest: **4 files / 26 tests pass, ~0.13 s.**
- `npm test`: **62 files / 669 tests pass, 1.97 s.**
- `npm run test:ui`: **41/41 UI tests pass across 17 files**; new file **3/3, 18.8 s**.
- `npm run e2e:critical`: **16/16, 44.2 s.**
- `npm run test:recovery:run`: **14/14, 17.5 s.**
- `npm run check:boundaries`: **127 files, 592 imports, 16 rules, 0 violations.**
- `npm run typecheck`: pass for desktop, core, layout, PDF.
- `npm run verify:fast`: pass.

## Screenshots

- `artifacts/m3c3b2/region-markers-callouts-1440x900.png`
- `artifacts/m3c3b2/point-anchor-960x800.png`
- `artifacts/m3c3b2/image-anchor-asset-changed-health-1440x900.png`
- `artifacts/m3c3b2/image-anchor-missing-placeholder-960x800.png`

## Risks / not verified

- Crop editing and crop-change reattachment are not implemented; every new anchor stores the full
  image crop, and the editor schema does not yet preserve a canonical image `crop` attribute through
  edits. This must be resolved before a crop editor ships.
- Region re-pick repair is not implemented; image health offers attach/delete/keep-broken only.
- `asset.remove` and “remove the image bytes” are not exposed in the product UI; removal is exercised
  through the typed command path. Replacement does not garbage-collect the old asset record.
- Replacement preserves the old alt text by design (never delete user text); a user who wants new alt
  text edits it separately.
- Marker numbering follows anchor creation time; callout order remains the existing core anchor-ID
  order for anchors on the same image node. This is deterministic but not spatially sorted.
- Actual native file picker interaction and subjective visual judgement remain product-owner manual
  checks; the E2E picker is overridden through the guard as required.
- No PDF/page-view/crop editor/M4 work was added. No new dependency, schema version bump, or
  text/formula/code behavior change.
