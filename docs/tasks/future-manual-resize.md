# Future — manual resize: image display width and block width hint

**Status:** Planned, not scheduled. Recorded 7 November 2026 by the product owner.
**Depends on:** M4 accepted (page layout, paginator, page view, PDF). M4 only reserves the seams.
**Non-goal:** free canvas-like resize, manual height, manual position.

Two independent overrides, at two different levels:

```text
block width hint   -> how wide the card is in the layout
image displayWidth -> how wide the image is inside the card
intrinsic w/h      -> the asset's real pixels (measurement, anchors)
```

They must not be conflated. An image can be 50% of a full-width block, and a block can be narrow
while its image stays at 100% of that narrow card.

## 1. Image display width (inside the block)

Today `.nf-image-el` is `width: 100%` of the block content and the node stores intrinsic
`width`/`height`. There is no display width independent of the card.

### Model

- Optional `displayWidth` on the image node: a fraction of the block content width.
- Allowed ladder: `0.25 | 0.5 | 0.75 | 1` (snap, no free pixels in v1).
- Height always derived from the intrinsic aspect ratio; no height override.
- Absent value means `1` (current behavior), so existing documents need no migration.
- `displayWidth` belongs to the image node, not the asset: the same asset can appear at different
  widths in different places.

```json
{ "type": "image", "attrs": { "assetId": "…", "width": 1600, "height": 900, "displayWidth": 0.5 } }
```

### Commands and UI

- `image.setDisplayWidth` with `{ blockId, nodePath, value }`, validation on the ladder, inverse and
  undo/redo through the normal command layer.
- A small control on the selected image (25/50/75/100 + reset), no drag handles in v1.
- Keyboard and screen-reader labels; the control is not a canvas pin.
- Block menu/palette insertion keeps the default; a future setting may choose the insertion default.

### Layout, anchors, PDF

- Does not change block width, sibling placement, wraps, or page count. Only the rendered image box
  inside the card changes.
- Anchors and image regions keep normalized intrinsic coordinates (`0..1` of the intrinsic image),
  so a display resize never moves an anchor. Point and region overlays are positioned in percentages
  of the rendered frame, which is already the case after M3c3b2.
- Reader, page view, and print renderer use the same percentage; no PDF-only resizing.
- Upscaling past intrinsic pixels is allowed up to the card width, but the UI shows a low-resolution
  hint. The study-note use case should not be blocked; print quality is the user's judgement.

### Tests

- Command validation/inverse/undo; save/reload round trip.
- Renderer at 25/50/75/100, portrait/landscape, 1440/960.
- Anchor overlay geometry unchanged across display widths (region + point).
- PDF page count unchanged by a display-width change; image raster and anchor markers correct.

## 2. Block width hint (card in the layout)

Today block width is content-driven and adaptive. The planned override is a **preferred width**, not
a coordinate and not a fixed height.

### Model

- Optional `widthHint` on the content block: a token or a clamped pixel hint.
- Recommended v1 ladder: `narrow | normal | wide | full` mapped to a percentage of the available
  band, with `normal` = today's adaptive behavior (absent value).
- Layout computes `measuredWidth = clamp(preferredWidth, contentMin, pageAvailable)`.
  A hint is a preference, never a promise: narrow pages and unbreakable content may clamp it.
- No manual height: height stays content-driven and paginated. A block taller than the page still
  continues at safe internal boundaries with continuation markers.
- Width belongs to the block's primary home; reference edges never affect layout.

### Commands and UI

- `block.setWidthHint` with `{ blockId, value }`, validation, inverse, undo/redo.
- Horizontal-only handles or a small width menu on the selected block; snap to the ladder.
- No free drag position, no manual pins, no z-order.

### Layout consequences

- A wider block reduces the width available to its children and can change group wrap and page count.
- Resize is an explicit user action, so AC-53 stability allows that subtree to move; other branches
  should stay stable under the hybrid reflow rule.
- Siblings may be pushed below when the group no longer fits; this is expected and must be tested.
- Reader, page view, and PDF share the same hint and the same clamp.
- PDF clamps to the page content width and never clips.

### Tests

- Layout golden fixtures: hint respected when it fits, clamped at min/page width, group wrap and page
  count updated deterministically.
- 300-block fixture: no overlap, no oscillation, stable reflow.
- Command/undo/save/reload; migration for the optional field.
- Reader/page/PDF parity for the same document with hints.

## M4 seam (do this in M4, no UI)

M4 must not ship the resize UI, but it should not hardcode width in a way that forces a rewrite:

- the layout measurement API accepts an optional per-block preferred width (even if always absent);
- the image measurement path reads intrinsic `width`/`height` and tolerates an optional
  `displayWidth` (default 1);
- the print renderer reads image/frame size from the same layout node as the reader, so a future
  display width applies to PDF without a print-only rule;
- the optional fields are documented in the spec/schema as reserved, not implemented.

## Suggested sequence

1. M4 accepted (layout, page view, PDF stable).
2. Image `displayWidth` — small, low risk, no layout impact.
3. Block `widthHint` — after image resize, because it touches measurement, group wrap, and page count.
4. Both behind the same command/undo/test discipline; no free resize.

## Stop and ask

Stop if the product owner wants free width+height resize, canvas positioning, or a width override
that changes the page size/margins. Those conflict with the ratified fixed-order, derived-pages model
and need a new ADR.
