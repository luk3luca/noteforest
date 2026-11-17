# R2b — Page packing (`stacked` / `beside`)

> **R2i follow-up (9 November 2026).** In portrait the whole root child subtree
> no longer fits beside the root, so the atomic direct-child group wraps below
> the callout stack. The R2b portrait expectations now assert that deterministic
> wrap while the nested child still stays beside its own parent. The landscape
> beside contract below is unchanged.

- **Role:** Implementer / Builder
- **Worktree:** `a builder worktree`
- **Branch:** `t3/r2b-page-packing`
- **Base:** `71fbb40` — `docs: launch R2b page packing`
- **Implementation commit:** `0ca2098` — `feat: page packing stacked and beside`
- **Report commit:** the follow-up docs commit that adds this file; the branch head SHA is in the handback message.
- **Status:** complete; no merge, no push.

## Summary

Page/PDF has a new packing policy, `LayoutOptions.pagePacking: 'stacked' | 'beside'`.
`stacked` is the accepted R2a geometry. In `beside`, anchored callouts stay below the
parent in the left lane while the direct-child group starts at the parent's `y` in the
right column. The lanes are separated by the existing sibling gap at every recursion
depth; a wrapped descendant of the right group is floored at the right-column origin so
it can never wrap back across the safe gap into a callout.

The resolved compact PageTheme now selects `beside`; the comfortable reference preset
stays `stacked`. Continuous does not mount the page layout engine, so it is unaffected.
The page model (`computePageModel`) is the only `layoutDocument` + `paginate` caller in
the app; PageView, Page Edit, DOM measurement, and the shared print model therefore all
consume the same packing decision. No typography/compact value changed.

The lab chose `beside`: on the showcase, compact went from **21 to 20 pages** and
**3.90 to 4.10 blocks/page**; on scale-300 it went from **28 to 27 pages** and
**10.71 to 11.11 blocks/page**. Both corpora had 0 overlapping fragments, 0 blocking
defects, 0 overflow pages, identical capped prose measure (67.4 ch), no callout narrower
than the 160 px readable minimum, and a lower arrow-crossing heuristic than stacked.
A wider `maxCardWidth` (480/560) reaches 18 pages on the showcase but pushes the capped
prose line to 75.7–77.0 ch and scale-300 to 77.0–77.2 ch, above the 70–75 guideline, so
the width lever was not chosen.

No Settings UI, manual-break UI/cleanup, PDF compositor, spec/UX/plan edit, showcase
edit, or `~/Documents` write was done.

## Packing rule

For one block with anchored callouts `A` and direct children `D`:

1. Resolve the parent card `(x, y, w, h)` and the direct-child candidates at
   `rightX = x + w + siblingGap`, with the usual `group-left-origin` fit test.
2. `beside` is active only when the block has at least one callout that will be placed,
   at least one direct child, the whole group fits right, and every callout fits the
   left lane without a new width defect.
3. In `beside`:
   - the direct-child group starts at `y` and `rightX`;
   - anchored callouts start at `y + h + calloutGap` and stack downward in the left lane;
   - the left lane is the parent card's horizontal band `[x, x + w]`, so its right edge
     is one `siblingGap` before `rightX`;
   - the block's `subtreeBottom` is the maximum of the parent, callout, and child
     subtree bottoms.
4. Otherwise the block uses the R2a stacked order: callouts below the parent at the
   anchor x, then the direct-child group below the callout cursor. This is also the path
   when the group wraps below the parent (ADR-0006 unchanged).
5. Recursion applies at every level. A callout's own subtree is limited to the lane's
   right edge; a right-group subtree inherits the page limit and a wrap floor at
   `rightX`. A callout with no sibling direct child behaves exactly like stacked.

### Anchor clamp and fallback

The callout keeps its resolved anchor x while `anchorX + (minContentWidth + card chrome)`
fits the lane. If the anchor is too far right, it clamps left to the parent content edge
and keeps the connector (spec OD-8/AC-52's "where the page width allows" fallback). If
the callout's measured min-content still cannot fit the lane (for example a wide
formula/code callout under a narrow parent), the whole block falls back to `stacked`
rather than clipping the callout or emitting a new width defect. No defect is emitted for
the fallback itself; it is a layout decision, not an error.

### Column constraints and widths

- Left lane: `[parent content left, parent right edge]`. The callout card is measured at
  the lane width and takes its own max-content up to that lane; it clamps left under a
  far-right anchor and never exceeds the lane. Nothing is clipped.
- Right column: `[rightX, contentWidthPx]`, where `rightX = parent right + siblingGap`.
  Direct children keep the existing adaptive width policy.
- Horizontal safe gap: `siblingGap` (16 px in compact) between the callout lane and the
  right group, at every recursion depth. A wrapped descendant of the right group is
  floored at `rightX`; a callout descendant is capped at the parent right edge.
- Vertical: callouts start at `parent bottom + calloutGap`; the right group starts at the
  parent `y`; the block bottom is the maximum of both columns.

No fixed split is used: the parent card width is the measured, content-driven width from
the normal width policy (min/max content, `minContentWidth`, `maxCardWidth`, page content
width), and each callout's card takes its own max-content up to the lane. A short callout
stays narrow and a long one wraps; neither is clipped.

## Wiring

```text
DEFAULT_LAYOUT_OPTIONS.pagePacking = 'stacked'   (pure engine / Continuous-safe default)
PageTheme.pagePacking:
  compact     = 'beside'    (product page/PDF default)
  comfortable = 'stacked'   (pre-R1 reference preset)
pageLayoutOptions(theme) -> LayoutOptions.pagePacking
  -> computePageModel(...) -> layoutDocument(...)
     -> PageView / Page Edit / DOM measurement / shared print model
```

`PageTheme` is the resolved personal page lens from R1b (global `settings.json` +
per-document overrides); `pagePacking` is normalized with the rest of the theme and is in
the page-model fingerprint, so a change re-measures and re-paginates. There is no second
layout path. Continuous does not import `computePageModel` or `pageLayoutOptions` for its
surface and never measures pages, so it is unchanged.

The PDF print adapter (`packages/pdf/src/printModel.ts`) receives the already-laid-out
`ContinuousLayout` and `PaginatedDocument`; it has no independent packing option. A
future print compositor must use the page model, exactly as PageView does.

`docs/design-tokens.md` now lists `pagePacking` under the layout-engine options and marks
that the page lane is distinct from the Continuous callout-projection lane.

## Lab

Command: `npm run test:visual:r1b` (build + `tests/visual/r1b-page-density.test.mjs`).
The showcase is copied read-only into the isolated library and is never modified;
`fixtures/scale-300.json` is the committed second corpus. The lab uses the real DOM page
surface at 1440×900, A4 landscape, 12 mm margins. “Whitespace” is `1 - union(fragment
area) / page content area`, so side-by-side cards are not counted twice. “Arrow
crossings” is the rough straight-line heuristic: same-page edge segments sampled against
fragment boxes excluding the endpoint fragments.

| Corpus | Variant | Pages | Blocks/page | Whitespace | Capped prose (ch) | Min callout (px) | Narrow callouts | Side-by-side pairs | Arrow crossings (edges/hits) | Overflow | Defects |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| showcase (82 blocks) | Comfortable / stacked | 27 | 3.04 | 67.7% | 58.9 | 202.8 | 0 | 4 | 13 / 93 | 0 | 0 |
| showcase | Compact / stacked (R2a) | 21 | 3.90 | 72.3% | 67.4 | 178.0 | 0 | 4 | 14 / 110 | 0 | 0 |
| showcase | **Compact / beside** | **20** | **4.10** | **71.2%** | **67.4** | **178.0** | **0** | **25** | **11 / 100** | **0** | **0** |
| showcase | Compact / stacked / 560 px | 18 | 4.56 | 64.0% | 75.7 | 178.0 | 0 | 7 | 18 / 133 | 0 | 0 |
| showcase | Compact / beside / 480 px | 18 | 4.56 | 66.6% | 77.0 | 178.0 | 0 | 22 | 12 / 104 | 0 | 0 |
| showcase | Compact / beside / 560 px | 18 | 4.56 | 64.2% | 75.7 | 178.0 | 0 | 12 | 15 / 106 | 0 | 0 |
| scale-300 (300 blocks) | Comfortable / stacked | 39 | 7.69 | 58.7% | 59.0 | 384.3 | 0 | 87 | 7 / 55 | 0 | 0 |
| scale-300 | Compact / stacked (R2a) | 28 | 10.71 | 63.0% | 67.4 | 332.3 | 0 | 87 | 8 / 69 | 0 | 0 |
| scale-300 | **Compact / beside** | **27** | **11.11** | **61.8%** | **67.4** | **192.7** | **0** | **99** | **0 / 0** | **0** | **0** |
| scale-300 | Compact / stacked / 560 px | 27 | 11.11 | 63.7% | 77.2 | 332.3 | 0 | 82 | 11 / 93 | 0 | 0 |
| scale-300 | Compact / beside / 480 px | 27 | 11.11 | 62.6% | 77.0 | 231.6 | 0 | 99 | 0 / 0 | 0 | 0 |
| scale-300 | Compact / beside / 560 px | 27 | 11.11 | 63.9% | 77.2 | 231.6 | 0 | 94 | 4 / 34 | 0 | 0 |

“Narrow callouts” counts callout fragments below the compact readable card minimum
(160 px content + 2 × (8 px padding + 1 px border) = 178 px). Both chosen-default corpora
have zero. Detailed JSON: `artifacts/r2b/density.json`; determinism evidence:
`artifacts/r2b/determinism.json`.

The area whitespace is stricter than the R1b vertical-slack figure: compact stacked is
65.3% vertically covered (34.7% vertical slack, matching R1b’s 34.7%) but only 27.7%
card-area covered, because a card column never fills the page width. The beside/stacked
comparison uses the same area metric for both variants, so the difference is meaningful.
Max column overlap (horizontal intersection of vertically overlapping fragments) was
0 px and the fragment overlap-pair count was 0 in every variant; the JSON carries both
fields for audit.

### Chosen default

`beside` is the compact Page/PDF default. It is denser on both corpora, keeps the same
capped prose measure and callout minimum, has no overlaps/defects/overflow, and the
arrow-crossing heuristic is lower than stacked on both corpora. The 480/560 px width
variants are denser on the showcase but exceed the 70–75 ch readability guideline, so
`maxCardWidth` stays 420. Comfortable stays the stacked reference preset and is not the
product default.

## Tests and timings

| Gate | Result |
|---|---|
| `npm run check:boundaries` | pass — 145 files, 694 imports, 16 rules |
| `npm run typecheck` | pass — desktop node/web, core, layout, pdf |
| Targeted vitest (`page-packing`, `page-settings`) | 2 files, 28 tests, 112 ms |
| `npm test` | 82 files, 817 tests, 2.4 s |
| `npm run test:ui` | 25 suites, 77 tests, exit 0; 318 s including build |
| `npm run test:recovery:run` | 14 tests, exit 0; 17.3 s |
| `npm run e2e:critical` | 16 tests, exit 0; 43.7 s |
| `npm run test:visual:r1b` | 1 suite / 1 test; 6 variants × 2 corpora + determinism + 5 screenshots; exit 0; ≈19 s including build |
| `npm run verify:fast` | exit 0 — boundaries + typecheck + 817 unit + build + 16 e2e (e2e 43.8 s) |

New coverage:

- `packages/layout/test/page-packing.test.ts` (12 tests): beside child y/x, anchor clamp,
  callout/right separation, readable lane width, recursion, group wrap, right-lane wrap
  floor, no overlap, content-driven widths, determinism, stacked default/unchanged,
  no-callout/no-child equivalence, 16 px horizontal safe gap, duplicate anchored target.
- `tests/ui/r2b-page-packing.test.mjs` (3 tests):
  - Page Read at 1440×900: default beside, direct child at the parent y, callouts below
    and left of the right group, anchor alignment/clamp, no overlap/overflow, all six
    arrows, anchored starts, dashed reference.
  - 960×720 and A4 portrait: root-level beside survives, nested beside falls back
    deterministically when the column is too narrow, then restores in landscape.
  - Stacked override moves the child below the callout stack; beside restores; Page Edit
    keeps the side geometry, arrows, overlay position, commit, and Continuous keeps its
    below-parent callout with no page sheet.
- `tests/visual/r1b-page-density.test.mjs`: updated R1b lab with stacked/beside/width
  variants, union-area whitespace, overlap/column checks, min callout width, arrow
  crossing heuristic, determinism, and beside screenshots.

Adapted test: `tests/ui/r2a-page-arrows-cleanup.test.mjs` keeps its cross-page mapper
scenario on a `pagePacking: 'stacked'` override, because R2a's accepted evidence asserts
both the direct child and the callout cross to page 2. The same-page R2a suite runs on
the new beside default and stays green.

## Screenshots

`artifacts/r2b/` (git-ignored, on-demand evidence):

- `page-beside-1440x900-landscape.png`
- `page-beside-1440x900-portrait.png`
- `page-beside-960x720-landscape.png`
- `page-beside-960x720-portrait.png`
- `page-stacked-1440x900-landscape.png`

The 1440×900 landscape shot shows a parent with its direct child at the same `y` on the
right and its anchored callout below on the left, plus the “Local-first” card’s `→ page 2`
cross-page indicator. The portrait shot shows the same beside grammar on the taller page.
The 960×720 shots are fit-to-page evidence of geometry, not full-size readability proof.

## Risks

- The left lane is the parent card band, not the wider callout-projection lane described
  for the Continuous surface in `docs/design-tokens.md`. A narrow parent therefore gives
  its callout a narrow lane. The lab’s corpora never produce a callout below the readable
  minimum, but a future narrow-parent-heavy document could; the fallback is the readable
  stacked order, and a wider callout-projection lane would be a product/layout follow-up.
- `AC-52` (callout left within 2 px of the anchor) is preserved only while the preferred
  minimum width fits the lane. Anchors on the right half of a wide parent clamp to the
  parent content left, which is the spec OD-8 fallback (“where the page width allows”).
  This is intentional for beside; it should be confirmed in the product-owner visual pass.
- A right-group descendant that wraps is floored at the right-column origin instead of
  the page-wide `maxWrapIndent` cap. This is required to keep it out of the callout lane;
  it is the only geometry deviation introduced inside a beside block.
- Pagination is still chapter-global: a page break must clear both columns. A valid break
  can be later than the shorter column’s bottom, so some page bottoms carry more
  whitespace than a stacked page. The lab’s 20/27 pages already include that cost; a
  column-aware paginator is a larger change and was not attempted.
- `PageTheme` now carries a non-typographic packing policy. It is normalized and
  fingerprinted like the rest of the page lens, but a future Settings UI should expose it
  as a layout choice, not as a font/box value.
- The comfortable reference preset remains stacked on purpose. If the product wants
  beside for every preset, that is a one-line theme change plus a lab rerun.
- The PDF print compositor still does not exist; the adapter only receives the layout.
  “PDF uses beside” is true at the page-model input, not proven through `printToPDF`.
- The arrow-crossing metric is a straight-line heuristic over cards; PageEdges draws
  cubic curves. It is a comparison signal, not a visual proof.

## Not verified

- Full `npm run verify` (the brief requested one `verify:fast`); unit, UI, recovery,
  critical e2e, and the R1b/R2b visual lab were run individually.
- Real `printToPDF` output and PDF page rendering (M4c). No PDF export entry point exists
  in the current app.
- Human visual/VoiceOver judgement of the beside pages (product-owner pass).
- The showcase and `~/Documents` were not modified. The lab copied the showcase
  read-only into an isolated test library.
