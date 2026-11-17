# M3b2c — Left-entry below-stack routing

**Date:** 5 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m3b2c-below-stack-routing`  
**Base:** `2486b9a` (`main`: docs: backlog code block chrome and start remaining M3)  
**Scope:** below-stack projection/placement and routing only. No M3c2 terms, M3c3 code/image, M3d
reference edges, M3e repair, M3f split/merge, page/PDF, schema bump, or new dependency.

## Summary

Direct primary children now stay in the right group while they fit and join the below stack when
they wrap. Anchored callouts always sit below the parent, before wrapped direct children. The below
stack (callouts + wrapped direct rows) shares one left trunk in the parent's gutter, one horizontal
arm per row at the card center Y, and a fixed 6 × 6 right-pointing arrowhead into the row's left
edge. The right group keeps the V4 trunk/bus and left-entry arrows.

The below stack is an editor projection: the canonical document, outline order (D3), revision, and
undo stack are unchanged. Placement is measured from the rendered cards; a lone direct child keeps
the M2 deep-chain horizontal-scroll behaviour (D23 / spec §7.10), while a parent with two or more
direct children wraps the ones that no longer fit.

## Files

| File | Change |
|---|---|
| `apps/desktop/src/renderer/src/lib/adapter.ts` | `PrimaryChildEntry` ordered list with `kind: callout \| direct`; below-stack rows (callouts first, wrapped direct after) in one `calloutLane`; `belowRow`/`rowKind` attrs; `buildEditorDocument(..., belowChildIds)`. |
| `apps/desktop/src/renderer/src/lib/tree.ts` | `EdgePair.placement` (`right \| below`) from the measured placement set; callouts always below. |
| `apps/desktop/src/renderer/src/lib/child-placement.ts` | Pure `planDirectChildPlacement`: full-fit right column, deterministic branch order, lone-chain exception. |
| `apps/desktop/src/renderer/src/lib/geometry.ts` | `belowTrunkGutter`; removed the old callout bus/gutter tokens. |
| `apps/desktop/src/renderer/src/lib/edge-routing.ts` | Replaced top-entry/down-arrow callout routing with `routeBelowStackGroup` (one left trunk, one right arrow per row, 12 px minimum stem); `routeRightChildren` for the V4 group. |
| `apps/desktop/src/renderer/src/editor/edges/EdgeLayer.tsx` | Groups by explicit placement: one below trunk for callouts + wrapped direct children, one V4 right group; exposes `data-trunk-placement`. |
| `apps/desktop/src/renderer/src/editor/useBelowStackPlacement.ts` | New measured placement hook; caches natural widths while a child is below, applies through the runtime. |
| `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` | Canvas-width measurement; placement hook; edge descriptors use the placement set. |
| `apps/desktop/src/renderer/src/state/runtime.ts` | Non-canonical `belowStackChildIds`; `applyChildPlacement` rebuilds the projection with focus restore and clears stale text history. |
| `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` | Callout/direct row classes and data attrs; lane width bounded to the parent card; right-group height reservation. |
| `apps/desktop/src/renderer/src/editor/extensions.ts` | Editor-only `belowRow`/`rowKind` attrs on block and body wrappers. |
| `apps/desktop/src/renderer/src/styles.css` | Left column (card + lane), absolute right group at card right + 16 px, plain wrapped direct rows, collapse override. |
| `apps/desktop/test/adapter.test.ts` | Ordered child list; callouts-before-wrapped-direct lane; direct-only below stack. |
| `apps/desktop/test/tree.test.ts` | Callout/direct below placement and deterministic edge indexes. |
| `apps/desktop/test/edge-routing.test.ts` | Left-entry matrix: single/multiple below rows, callouts only, direct only, mixed, clamped row, broad trunk, right group unchanged, defects. |
| `apps/desktop/test/placement.test.ts` | Only direct, only callouts (always below), mixed, multiple, narrow wrap, lone-chain scroll, exact boundary, deterministic order. |
| `tests/ui/m3-anchor-callout.test.mjs` | Rewritten for 2 callouts + 2 direct at 1440 (right group) and 960 (one direct wraps after callouts); screenshot and geometry assertions; clamp case retained. |
| `tests/ui/m2-view.test.mjs` | Fit-width scenario moved to the minimum supported window (960) after resetting zoom; waits for the measured wrap before measuring overflow. |
| `docs/reports/m3b2c-left-entry-routing.md` | This report. |

No canonical schema, spec, UX, ADR, fixture, or dependency changed. The editor-only wrapper attrs are
projection state and are dropped by `extractBlockContents`.

## Projection and placement rules

- `projectPrimaryChildren` returns one ordered list: all anchored callouts in the shared anchor order
  (start position, anchor ID, then branch order), followed by direct children in branch order. The
  existing `callouts`/`direct` fields remain for callers.
- The adapter splits the direct children by the measured placement set:
  - right group: direct children that fit;
  - below stack: every callout, then the wrapped direct children in branch order.
- Callouts are never moved by placement: they always render below the parent.
- Placement is measured in layout pixels (zoom independent):
  `available = canvasContentWidth - (parent.right + 16)`. With two or more direct children, a child
  stays right when `available >= 144` and its natural card width fits; otherwise it wraps. While a
  child is already below, the hook uses the last width measured in the right group so the decision
  cannot oscillate against the narrower lane.
- A lone direct child keeps the M2 chain behaviour and stays right; the editor scrolls horizontally
  for deep chains (D23/spec §7.10). This preserves accepted M2 parent-relative behaviour and keeps
  the below stack for real sibling wrap, not every deep single-child chain.
- Below-stack order is deterministic and does not change the outline/canonical order.
- The lane is bounded to the parent card width (`--nf-lane-width`), so it cannot overlap the right
  group. The right group is absolutely placed at the card's right edge + 16 px; its height is
  reserved in the flow (`--nf-right-group-height`) so following top-level blocks never overlap it.

## Router geometry

For every parent with below rows:

```text
parentBottom = parent.y + parent.height
minRowLeft   = min(row.card.left)
trunkX       = min(parent.x - 8, minRowLeft - 2 - 12)
trunk        = (trunkX, parentBottom) → (trunkX, last row center Y)
arm(row)     = (trunkX, row center Y) → (row.card.left - 2, row center Y)
arrow        = fixed 6 × 6 polygon at the arm tip, pointing right
stem         = row.card.left - 2 - trunkX >= 12
```

- One row uses a single continuous elbow from the parent bottom-left; two or more rows share one
  trunk and one arm per row. There is no bottom bus and no down arrow.
- The trunk is always left of every row card (and the gutter is 8 px left of the parent card), so it
  never crosses a card. If a row is unusually far left, the trunk moves left with it.
- The right group keeps V4 unchanged: lane at the parent's right edge + 2…14 px, one trunk for two
  or more children, 12 px final stems, fixed right arrowheads, `defect` only when the stem is short.
- Below arms use a sharp junction (radius 0) so rounding cannot consume the 12 px stem.

## Measured evidence

1440 × 900, parent “Take the symmetric matrix…”, 2 callouts + 2 direct children:

- parent card 460 × 94.3 px at content y 276.7; lane 460 × 188.7 px directly below it;
- callout cards 144 px wide, aligned at x 90 and x 291; 2 rows with quote chips and leaders;
- direct children at x 476 (one gap = 16 px), 144 px and 420 px wide, staying right;
- below trunk at x = -8 (8 px left of the parent card), y 371 → 513.75; two right-pointing arms;
- right group has one V4 trunk for the two direct children; no defect.

960 × 900 (minimum supported window), same fixture:

- canvas 670 px; the short direct child stays right; the long direct child wraps after the two
  callouts (3 below rows, one shared trunk);
- the right group and the wrapped child do not overlap; every below arrow enters from the left;
- no down arrows and no vertical line through a card.

Screenshots:

- `artifacts/m3b2c/below-stack-1440x900.png`
- `artifacts/m3b2c/below-stack-960x900.png`

## Tests and evidence

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| `npm test` | 392/392 pass, 33 files, 1.8 s |
| `node --test tests/ui/m3-anchor-callout.test.mjs` | 3/3 pass; suite ~2.0 s, process ~10.1 s |
| `npm run test:ui` | pass: M2 view 1/1, M2 shell 4/4, M3b2c 3/3, M3b2b 1/1, M3c1 1/1 |
| `npm run verify:fast` | pass; typecheck + 392 unit + critical e2e 21/21 |
| Critical e2e suite | 21 tests, 44.9 s (unchanged count; under 60 s) |

The UI suite uses condition-based waits only: no fixed sleeps and no native dialogs. It creates the
fixture through the real structural command path, waits for the measured wrap, then reads card,
lane, trunk, arm, and arrow geometry from the rendered DOM/SVG. The app window stays hidden.

No full `npm run verify` was run, per the brief; the Orchestrator runs it at integration.

## Risks and follow-ups

- **Single-child chain exception.** A lone direct child that exceeds the canvas stays right and the
  editor scrolls horizontally, preserving D23/M2. M4's A4 layout must wrap it from page width; the
  router already supports direct-only below groups, so only the placement rule changes there.
- **Placement rebuild and history.** Applying a changed placement rebuilds the editor projection
  from canonical structure; it restores focus/caret when the editor was focused and clears text
  history because wrapper positions changed. Placement never affects canonical content or the
  structural undo stack. A resize while typing can therefore clear text undo; this is deliberate to
  avoid applying history steps to a differently wrapped document.
- **One extra layout pass.** A resize can produce a measure → wrap → rebuild pass. The UI tests wait
  for the wrapped row before asserting geometry; no fixed sleeps were added.
- **Editor/layout parity.** This is still the M3 CSS/measurement approximation; M4 must consume the
  same anchor order and placement contract from the pure layout engine, not this CSS.
- No M3c2/M3c3/M3d/M3e/M3f work was touched.

## Next step — M3c2

Formula-term anchors: LaTeX substring selection, term selector (substring/occurrence/prefix/suffix),
best-effort rendered term geometry with formula-rectangle fallback, reusing the existing save/callout/
below-stack path. Then M3c3 code/image anchors.
