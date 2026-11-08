# R2c — Page compaction placement

- **Role:** Implementer / Builder
- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-546aeb3c`
- **Branch:** `t3/r2c-page-compaction`
- **Base:** `470a3a4` — `docs: merge R2b and launch Page compaction`
- **Implementation commit:** `cc7276d` — `feat: page compaction placement`
- **Report commit:** the follow-up docs commit that adds this file; the branch head SHA is in the handback message.
- **Status:** complete; no merge, no push.

## Summary

Page/PDF has a third packing policy, `LayoutOptions.pagePacking: 'compaction'`.
`stacked` (R2a) and `beside` (R2b) remain the reference policies. The resolved
compact PageTheme now selects `compaction`; comfortable stays `stacked`.

The page engine is a finite-space compaction packer for the same components:

- the parent card starts the row;
- anchored callouts (in anchor order) and primary direct children (in branch
  order) are one ordered component list;
- components fill the row left-to-right at measured widths;
- each component owns a column for its own recursive row, so a subtree can
  never collide with the next sibling;
- the overflow wraps to one indented row below the parent;
- reference targets stay at their primary home and contribute edges only;
- components taller than the page are left to the paginator's safe boundaries.

The lab chose `compaction`: on the showcase, compact went from **20 to 17 pages**
(vs `beside`) and **21 to 17** (vs `stacked`); on scale-300 it went from
**27 to 21 pages** (vs `beside`) and **28 to 21** (vs `stacked`). Both corpora
have 0 overlapping fragments, 0 defects, 0 overflow pages, the same capped prose
measure (67.4 ch), and no callout below the compact readable minimum. The
compaction packer is deterministic on the showcase and on scale-300.

The one regression is the arrow-crossing heuristic, which rose because a
parent → later-sibling edge now passes behind the earlier sibling cards. It is
recorded as the main risk and the reason R2d (Page/PDF edge-style unification)
must land before the final product-owner visual pass. No edge-style work was
done here.

No Continuous placement change, typography/compact value change, Settings UI,
manual-break UI/cleanup, PDF compositor, showcase edit, `/Users/luca/Documents`
write, spec/UX/plan edit, or new external dependency was done. Two-column
top-level packing is still the pending R2b lever and was not implemented; it
needs a product-owner decision.

## Algorithm

### Component order

For a block with anchored primary branches `A` and direct primary branches `D`:

1. `A` first, sorted by resolved anchor position (`y`, then `x`, then branch
   order) — the D3 anchored-first rule.
2. `D` after, in branch order.

A block that is already placed is skipped with the existing
`duplicate-primary` warning. Reference branches are not components: their
targets stay where their primary home puts them, and `buildPageEdges` draws the
reference edge. A reference target is therefore never duplicated by the page
packer.

### Row rules

Let a block card be `(x, y, width, height)` and its ordered components
`C1 … Cn`.

1. The first row starts at `rowX = x + width + siblingGap` and `rowY = y`.
   Components share the parent's top `y`.
2. Each component receives a column `[colX, colX + allocation]`; the next
   component starts at `colX + allocation + siblingGap`.
3. A component's preferred width is its measured card plus its own component
   rows, recursively, bounded by the available column width.
4. A component's readable minimum column is the widest readable min card
   anywhere in its primary subtree plus `maxWrapIndent`, so its own wrapped rows
   still have a readable card. A leaf's minimum is its own readable min card.
5. If every remaining component fits at its preferred width, they all stay in
   the row. Otherwise the packer takes the largest prefix whose readable minimum
   columns fit and distributes the leftover width proportionally to
   `preferred − minimum` (a deterministic flex allocation). The rest wrap.
6. When the next component does not fit, the next row starts below the tallest
   subtree bottom of the current row, plus `siblingGap`, at
   `x + wrapIndent` capped at `columnOriginX + maxWrapIndent`. If the indent
   would leave less than the next component's readable card, the row moves left
   within the column instead of clipping.
7. The row's own components are not indented individually by depth. A component
   with its own components gets a column and recurses; its children start to its
   right on its own row and fill their own row.
8. If the parent card leaves no usable side column (for example a full-width
   unbreakable card), the first component wraps below the parent rather than
   forcing a zero-width column. If the component cannot fit even there, the
   normal `content-too-wide` / `layout-overflow` blocking defect is emitted.
   There is no overlap and no clipping.
9. Rows have a natural height. The packer never limits the row to the page
   height; the paginator owns page breaks. A too-tall component is split at safe
   segment boundaries (or reports `no-safe-break` when none exists).

### Widths

Widths are the existing measured `resolveBlockBox` policy: content-driven,
`minContentWidth` / `maxContentWidth` bounded, with unbreakable content allowed
to use the full page width. The packer allocates columns around those measured
widths; it never creates fixed pixel columns. A short card can leave whitespace
inside its column so the next sibling starts after the whole subtree, not after
the card.

### Columns and no-overlap

A component's subtree is laid out with `rightLimit = colX + allocation`, and
every nested row/wrap stays inside that column (the wrap origin is floored at
the column origin). The next component starts one `siblingGap` after the column.
Rows are stacked below the tallest subtree of the previous row. Therefore:

- horizontal: columns are separated by the safe gap;
- vertical: rows are separated by the safe gap;
- a wrapped descendant cannot enter the next sibling's column or cross back over
  the callout lane.

This is the invariant the layout tests assert pairwise.

### Pagination

The packer produces the same `ContinuousLayout` + `PaginatedDocument` shape as
before. The paginator still breaks only at block tops/bottoms or safe internal
segment boundaries. A page break must clear every column in the row; a valid
break can therefore be later than the shortest column's bottom, which is the
same column-aware pagination cost R2b already documented. No second paginator and
no layout-time clipping were added.

### Reading order

The component list is the canonical D3 order. Inside one row, left-to-right is
that order; a subtree column is contiguous, so a later sibling starts after the
whole earlier subtree. The Page renderer already orders fragments row-major (the
paginator sorts by `page.y`, then `page.x`; accepted in R2b). When a component's
own descendants wrap below it, a later sibling in the row above is physically
read before the wrapped descendant. That is the row-major Page order mandated by
this brief, not a change to the outline/reader order or to the component list.
The outline, reader, and canonical document order are untouched.

## Wiring

```text
DEFAULT_LAYOUT_OPTIONS.pagePacking = 'stacked'  (pure engine / Continuous-safe)
PageTheme.pagePacking:
  compact     = 'compaction'   (product page/PDF default)
  comfortable = 'stacked'      (pre-R1 reference preset)
pageLayoutOptions(theme) -> LayoutOptions.pagePacking
  -> computePageModel(...) -> layoutDocument(...)
     -> PageView / Page Edit / DOM measurement / shared print model
```

`PageTheme` is the resolved personal page lens from R1b (global `settings.json` +
per-document overrides). `pagePacking` is normalized with the rest of the theme
and is part of the page-model fingerprint, so a change re-measures and
re-paginates. Page Read, Page Edit, DOM measurement, and the shared print model
consume the same decision; there is no second layout path. Continuous does not
mount the page layout and does not read `pagePacking`, so it is unchanged.

`docs/design-tokens.md` now names `compaction` as the compact page policy and
keeps `stacked`/`beside` as references.

## Lab

Command: `npm run test:visual:r2c` (build + `tests/visual/r1b-page-density.test.mjs`).
The showcase is copied read-only into the isolated library and is never modified;
`fixtures/scale-300.json` is the committed second corpus. The lab uses the real
DOM page surface at 1440×900, A4 landscape, 12 mm margins. “Whitespace” is
`1 − union(fragment area) / page content area`, so side-by-side cards are not
counted twice. “Row fill” is fragments per page-local row (average). “Max
columns” is the maximum number of fragments intersecting one horizontal
scanline. “Arrow crossings” is the rough straight-line heuristic: same-page edge
segments sampled against fragment boxes, excluding the endpoint fragments.

| Corpus | Variant | Pages | Blocks/page | Row fill | Max columns | Whitespace | Overlap | Defects | Overflow | Capped prose (ch) | Min callout (px) | Narrow callouts | Crossings (edges/hits) |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| showcase (82 blocks) | Comfortable / stacked | 27 | 3.04 | 1.05 | 2 | 67.7% | 0 | 0 | 0 | 58.9 | 202.8 | 0 | 13 / 93 |
| showcase | Compact / stacked (R2a) | 21 | 3.90 | 1.05 | 2 | 72.3% | 0 | 0 | 0 | 67.4 | 178.0 | 0 | 14 / 110 |
| showcase | Compact / beside (R2b) | 20 | 4.10 | 1.12 | 2 | 71.2% | 0 | 0 | 0 | 67.4 | 178.0 | 0 | 11 / 100 |
| showcase | **Compact / compaction** | **17** | **4.82** | **1.53** | **4** | **67.3%** | **0** | **0** | **0** | **67.4** | **178.0** | **0** | **17 / 255** |
| scale-300 (300 blocks) | Comfortable / stacked | 39 | 7.69 | 1.35 | 2 | 58.7% | 0 | 0 | 0 | 59.0 | 384.3 | 0 | 7 / 55 |
| scale-300 | Compact / stacked (R2a) | 28 | 10.71 | 1.35 | 2 | 63.0% | 0 | 0 | 0 | 67.4 | 332.3 | 0 | 8 / 69 |
| scale-300 | Compact / beside (R2b) | 27 | 11.11 | 1.42 | 2 | 61.8% | 0 | 0 | 0 | 67.4 | 192.7 | 0 | 0 / 0 |
| scale-300 | **Compact / compaction** | **21** | **14.29** | **2.46** | **3** | **52.7%** | **0** | **0** | **0** | **67.4** | **263.8** | **0** | **90 / 1890** |

“Narrow callouts” counts callout fragments below the compact readable card
minimum (160 px content + 2 × (8 px padding + 1 px border) = 178 px). The chosen
variant has zero on both corpora. “Defects” is the maximum per-page defect count;
it is zero for the chosen variant. Detailed JSON: `artifacts/r2c/density.json`;
determinism evidence: `artifacts/r2c/determinism.json`.

The R2b width variants are still present for continuity. They reach 18 pages on
the showcase but push the capped prose line to 75.7–77.0 ch and scale-300 to
77.0–77.2 ch, above the 70–75 guideline. Compaction reaches 17 pages at 67.4 ch,
so the width lever is still not needed.

### Chosen default

`compaction` is the compact Page/PDF default. It is denser than both reference
policies on both corpora, keeps the same capped prose measure and callout
minimum, has no overlaps, defects, or overflow, and is deterministic. The lab
asserts `compaction.pages <= beside.pages`, `compaction.pages <= stacked.pages`,
zero narrow callouts, and `cappedLineChars <= 75`.

The condition this slice cannot fully prove is “arrows remain followable”. The
crossing heuristic rose from 11/100 to 17/255 on the showcase and from 0/0 to
90/1890 on scale-300 because a parent → later-sibling edge passes behind the
earlier sibling cards in the same row. Edges paint below cards, so the line is
hidden inside the earlier cards rather than drawn over text; the arrowhead still
lands on the target's left edge. R2d's orthogonal edge router is the planned fix
and is the main follow-up before the product-owner visual/VoiceOver pass. If the
product owner judges the arrows not followable, reverting the compact preset to
`beside` is a one-line theme change plus a lab rerun.

## Tests and timings

| Gate | Result |
|---|---|
| `npm run check:boundaries` | pass — 145 files, 694 imports, 16 rules |
| `npm run typecheck` | pass — desktop node/web, core, layout, pdf |
| Targeted vitest (`page-compaction`, `page-packing`, `page-settings`) | 3 files, 43 tests, 150 ms |
| `npm test` | 83 files, 832 tests, 2.27 s |
| `npm run test:ui` | 26 suites, 81 tests, exit 0; ≈4 min test time + build |
| `npm run test:recovery:run` | 14 tests, 17.8 s |
| `npm run e2e:critical` | 16 tests, 44.1 s |
| `npm run test:visual:r2c` | 1 suite / 1 test; 7 variants × 2 corpora + determinism + 6 screenshots; exit 0; ≈19 s test + build |
| `npm run verify:fast` | exit 0 — boundaries + typecheck + 832 unit + build + 16 e2e |

New coverage:

- `packages/layout/test/page-compaction.test.ts` (15 tests): row filling, wrap
  at the full row, indented wrapped row below the tallest subtree, column
  alignment, callout + child order, callout anchor edge start, recursion in a
  reserved subtree column, content-driven widths (not fixed columns), lower-row
  fallback for a too-narrow column, no-overlap pairwise, row-major order equal to
  the canonical component order, determinism, too-tall component paginated at
  safe boundaries, full-width parent wrap fallback, reference targets not
  duplicated, stacked/beside reference policies, and scale-300/wide-fan
  committed-fixture invariants.
- `tests/ui/r2c-page-compaction.test.mjs` (4 tests):
  - Page Read at 1440×900: compact default is compaction; root + anchored
    callout + three direct children share a row; the child column contains the
    grandchild; all six arrows, anchor start, dashed reference; no overlap or
    overflow; screenshot.
  - 960×720 landscape and A4 portrait: row fill adapts and nothing overflows;
    landscape restores; screenshots.
  - Page Edit: same geometry, overlay sits on the exact child fragment, commit
    keeps the row and the content, no page errors; screenshot. Continuous then
    has no page sheet and keeps its below-parent callout.
  - A stacked override moves the callout back below the root and the child below
    the callout stack; compaction restores.
- `tests/visual/r1b-page-density.test.mjs` (the lab) adds the compaction
  variant, row-fill/max-column metrics, `compaction <= beside/stacked`
  assertions, compaction determinism, and the compaction screenshots.
- `tests/ui/r2b-page-packing.test.mjs` now selects `beside` explicitly in its
  first two tests, because R2c changes the compact default. R2b remains the
  reference-policy suite.

## Screenshots

`artifacts/r2c/` (git-ignored, on-demand evidence):

- `page-compaction-1440x900-landscape.png` — showcase compact/compaction page 1;
  a three-card row plus a callout stack in the parent's column.
- `page-compaction-1440x900-portrait.png` — showcase portrait, narrower rows.
- `page-compaction-960x720-landscape.png`
- `page-compaction-960x720-portrait.png`
- `page-beside-1440x900-landscape.png` — R2b comparison.
- `page-stacked-1440x900-landscape.png` — R2a comparison.

`artifacts/r2c/ui/` (git-ignored, UI-test evidence):

- `page-read-compaction-1440x900-landscape.png`
- `page-read-compaction-960x720-landscape.png`
- `page-read-compaction-960x720-portrait.png`
- `page-edit-compaction-1440x900-landscape.png`
- `page-edit-overlay-compaction-1440x900-landscape.png` — the content overlay on
  the exact child fragment, with the row geometry and arrows visible.

## Risks

- **Arrow crossings are the main risk.** Parent → later-sibling edges pass
  behind earlier sibling cards. The straight-line heuristic rose on both
  corpora (showcase 11/100 → 17/255; scale-300 0/0 → 90/1890). The edges paint
  below cards, so they do not cover text and their arrowheads remain on the
  targets, but the line is visually broken. R2d is required before the final
  visual/VoiceOver pass. This is the one acceptance condition the Builder cannot
  prove without the product owner.
- **Row-major Page order can differ from depth-first outline order** when a
  component's descendants wrap below it while a later sibling stays in the row
  above. The canonical component list and the outline/reader order are
  unchanged; the Page fragment order is row-major, as R2b already accepted. If a
  strict single physical order is required, row filling would have to place the
  later sibling after the wrapped subtree, losing most of the density gain. This
  needs the product owner's confirmation.
- **Top-level blocks are still stacked.** Two-column top-level packing is the
  pending R2b lever and needs a product-owner decision on reading flow; it was
  intentionally not added here. Most of the density gain comes from packing a
  parent's callouts and direct children.
- **Column-aware pagination cost.** A page break must clear every column in the
  row, so a short column can leave whitespace below a taller sibling. The lab's
  page counts already include that cost. A column-aware paginator is a larger
  change and was not attempted.
- **A narrow column can squeeze a subtree.** The packer reserves
  `max(subtree min card) + maxWrapIndent`, so descendants stay readable, but a
  subtree forced into a narrow column wraps more and can look taller than the
  beside reference. The lab's corpora have no `content-too-wide` defect.
- **Reference-target placement is unchanged.** A reference target that is a
  top-level block stays in the chapter's top-level flow; the edge is drawn to it.
  This is the existing print/Page rule, not a new decision.
- **`PageTheme` now names a layout policy.** A future Settings UI should expose
  `pagePacking` as a page-layout choice, not as a font/box value. No Settings UI
  was added.
- **The PDF compositor still does not exist.** “PDF uses compaction” is true at
  the shared page-model input, not proven through `printToPDF` (M4c).

## Not verified

- Full `npm run verify` (the brief requested one `verify:fast`); unit, UI,
  recovery, critical e2e, and the R2c visual lab were run individually.
- Human visual/VoiceOver judgement of the compaction pages and arrows; this is
  the product-owner pass and the R2d follow-up.
- Real `printToPDF` output and PDF page rendering (M4c).
- Two-column top-level packing, manual breaks, Settings UI, and edge-style
  unification (explicit non-goals / later slices).
- The showcase and `/Users/luca/Documents` were not modified. The lab copied the
  showcase read-only into an isolated test library.
