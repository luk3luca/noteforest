# M4a — layout lab and group-level left-origin wrap

**Role:** Implementer / Builder  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m4a-group-left-origin-wrap`  
**Base:** `bf3893e` (`docs: merge M3c3b4 and launch M4a`)  
**Implementation commit:** `bab03dc31c2951e2ac79fd525bdd87a0af7fb62d`  
**Report commit:** branch head after this file (docs only)  
**Status:** implementation and lab complete; not merged, not pushed

## Summary

Implemented the ADR-0006 group-level left-origin wrap in `packages/layout` and produced the
deterministic layout lab. The production default is `wrapPolicy: 'group-left-origin'`; the two lab
policies (`right-first-per-child`, `subtree-aware`) are selectable through `LayoutOptions` and are not
the default.

The rule now is:

1. Measure every direct child's own card in the right band with the existing
   max-content/min-content/`minContentWidth` comparison, plus the local horizontal-overflow safety
   check.
2. If every direct child fits, place the whole group to the right exactly as before.
3. If any direct child does not fit, place every direct child below the parent at
   `wrapOriginX = min(parent.x + wrapIndent, pageContentLeft + maxWrapIndent)`; the rule recurses at
   each child's own level.
4. Anchored callouts keep their existing order and anchor alignment and remain above the wrapped
   direct-child group.

`wrapPolicy` and `maxWrapIndent` are plain serializable fields on `LayoutOptions`.
`DEFAULT_LAYOUT_OPTIONS` now has `wrapIndent: 18`, `maxWrapIndent: 54` (three steps), and
`wrapPolicy: 'group-left-origin'`.

### No-overlap guard beyond the literal ADR text

A capped wrap can move a group left under a **taller ancestor card** (for example, a long top-level
block with a short right-hand child whose own child wraps). The x coordinate remains the ADR origin;
the first wrapped child starts below any ancestor card that shares that horizontal band. This guard
does not change any committed fixture metric (verified by the lab); it is covered by a synthetic
unit test (`keeps a capped wrap below a taller ancestor card instead of overlapping it`).

## Policy option

| `wrapPolicy` | Behavior | Status |
|---|---|---|
| `group-left-origin` | Whole group right only if all direct children fit; otherwise all below at the capped origin. | production default |
| `right-first-per-child` | Pre-M4a behavior: each child decides independently; a non-fitting child wraps at `parent.x + wrapIndent`. | regression oracle |
| `subtree-aware` | Lab comparison: fitting children stay right; a non-fitting child wraps at the capped origin. | lab only |

## Lab method

Committed lab module and test:

- `packages/layout/test/layout-lab.ts` computes metrics and branch trees.
- `packages/layout/test/layout-lab.test.ts` runs the comparison.
- Reproduce with:
  `npx vitest run packages/layout/test/layout-lab.test.ts --reporter=verbose`

Fixtures: `scale-300.json`, `deep-chain.json`, `wide-fan.json`. The product-owner showcase at
`~/Documents/NoteForest/note-forest-showcase/document.json` is read-only and included when
present; no copy was added to the repository and the showcase was not modified. The committed test
logs the committed fixtures on every machine and adds the showcase only when that absolute path is
readable.

Definitions:

- **Page count** after `paginate` with the estimator.
- **Max right edge** = max `x + width` over placed cards in chapter-local coordinates.
- **Max content width** = max `block.contentWidth`.
- **Height** = sum of chapter heights.
- **Whitespace** = `1 - sum(block.width * block.height) / sum(pageContentWidth * chapter.height)`
  (rough estimate; includes the empty right area and gaps).
- **Wrap groups** = parents with at least one direct child placed below / parents with direct
  children.
- **Wrap children** = direct child placements below the right band.
- **Max wrap depth** = longest chain of consecutive below-placed direct children.
- **Δpages** = policy page count minus `right-first-per-child` page count for the same document.

## Main comparison (wrapIndent 18, maxWrapIndent 54)

| fixture | policy | pages | Δpages | max right | max content | height | whitespace | wrap groups | wrap children | wrap depth | content-too-wide | layout-overflow |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| scale-300 | right-first-per-child | 41 | 0 | 642.5 | 420.0 | 36780.7 | 46.1% | 90/90 | 168 | 1 | 0 | 0 |
| scale-300 | group-left-origin | 41 | 0 | 642.5 | 420.0 | 36780.7 | 46.1% | 90/90 | 168 | 1 | 0 | 0 |
| scale-300 | subtree-aware | 41 | 0 | 642.5 | 420.0 | 36780.7 | 46.1% | 90/90 | 168 | 1 | 0 | 0 |
| deep-chain | right-first-per-child | 2 | 0 | 642.5 | 399.0 | 1865.6 | 55.5% | 3/4 | 3 | 3 | 0 | 0 |
| deep-chain | group-left-origin | 2 | 0 | 642.5 | 399.0 | 1865.6 | 55.5% | 3/4 | 3 | 3 | 0 | 0 |
| deep-chain | subtree-aware | 2 | 0 | 642.5 | 399.0 | 1865.6 | 55.5% | 3/4 | 3 | 3 | 0 | 0 |
| wide-fan | right-first-per-child | 2 | 0 | 642.0 | 520.0 | 1383.3 | 54.3% | 2/2 | 7 | 2 | 0 | 0 |
| wide-fan | group-left-origin | 2 | 0 | 564.0 | 520.0 | 1482.4 | 57.4% | 2/2 | 10 | 2 | 0 | 0 |
| wide-fan | subtree-aware | 2 | 0 | 642.0 | 520.0 | 1383.3 | 54.3% | 2/2 | 7 | 2 | 0 | 0 |
| showcase | right-first-per-child | 25 | 0 | 971.3 | 945.3 | 49922.8 | 89.0% | 4/10 | 5 | 1 | 2 | 2 |
| showcase | group-left-origin | 25 | 0 | 971.3 | 945.3 | 49922.8 | 89.0% | 4/10 | 5 | 1 | 2 | 2 |
| showcase | subtree-aware | 25 | 0 | 971.3 | 945.3 | 49922.8 | 89.0% | 4/10 | 5 | 1 | 2 | 2 |

Notes:

- **No page-count delta anywhere.** The 300-block fixture remains 41 pages under all three policies.
- `scale-300` has no geometry difference in the aggregate metrics because its wide parent cards leave
  less than `minContentWidth` in the right band; no child can stay right under any policy.
- `wide-fan` is the only compared fixture with a real trade-off: the group rule moves all 10 direct
  children below (7 wrapped + 3 rescued under the oracle), so height grows by 99.1 px and whitespace
  by 3.1 percentage points. Page count is unchanged. This is the intended atomic-group cost, not a
  pathological result.
- `showcase` is neutral at the aggregate level. It has pre-existing defects (18 total: 13
  `broken-anchor`, 2 `content-too-wide`, 2 `layout-overflow`, 1 `missing-asset`), identical under all
  policies; these are fixture data issues, not introduced by M4a.

## `maxWrapIndent` cap validation (2/3/4 steps, `wrapIndent` 18)

| fixture | cap | pages | max right | height | whitespace |
|---|---:|---:|---:|---:|---:|
| scale-300 | 36 | 41 | 642.5 | 36780.7 | 46.1% |
| scale-300 | 54 | 41 | 642.5 | 36780.7 | 46.1% |
| scale-300 | 72 | 41 | 642.5 | 36780.7 | 46.1% |
| deep-chain | 36 | 2 | 642.5 | 1865.6 | 55.5% |
| deep-chain | 54 | 2 | 642.5 | 1865.6 | 55.5% |
| deep-chain | 72 | 2 | 642.5 | 1865.6 | 55.5% |
| wide-fan | 36 | 2 | 564.0 | 1482.4 | 57.4% |
| wide-fan | 54 | 2 | 564.0 | 1482.4 | 57.4% |
| wide-fan | 72 | 2 | 564.0 | 1482.4 | 57.4% |
| showcase | 36 | 25 | 971.3 | 49922.8 | 89.0% |
| showcase | 54 | 25 | 971.3 | 49922.8 | 89.0% |
| showcase | 72 | 25 | 971.3 | 49922.8 | 89.0% |

The cap has no aggregate page/width/height effect on these fixtures. Its visible effect is the
deep-chain deepest wrap: `f4-b5.x = 36 / 54 / 72` for caps 36 / 54 / 72 (unit test
`wraps recursively and caps the cumulative left origin`). The ADR candidate of three steps (54 px) is
recommended: it is visible as a hierarchy indent, keeps 588.5 px of portrait A4 content width
available, and avoids the drift to `x=300` seen in the right-first oracle.

## `wrapIndent` sensitivity (cap = 3 × `wrapIndent`)

| fixture | wrapIndent / cap | pages | max right | height | whitespace |
|---|---|---:|---:|---:|---:|
| scale-300 | 12 / 36 | 41 | 642.5 | 36780.7 | 46.1% |
| scale-300 | 18 / 54 | 41 | 642.5 | 36780.7 | 46.1% |
| scale-300 | 24 / 72 | 41 | 642.5 | 36780.7 | 46.1% |
| deep-chain | 12 / 36 | 2 | 642.5 | 1865.6 | 54.8% |
| deep-chain | 18 / 54 | 2 | 642.5 | 1865.6 | 55.5% |
| deep-chain | 24 / 72 | 2 | 642.5 | 1865.6 | 56.2% |
| wide-fan | 12 / 36 | 2 | 558.0 | 1482.4 | 57.4% |
| wide-fan | 18 / 54 | 2 | 564.0 | 1482.4 | 57.4% |
| wide-fan | 24 / 72 | 2 | 570.0 | 1482.4 | 57.4% |
| showcase | 12 / 36 | 25 | 971.3 | 49922.8 | 89.0% |
| showcase | 18 / 54 | 25 | 971.3 | 49922.8 | 89.0% |
| showcase | 24 / 72 | 25 | 971.3 | 49922.8 | 89.0% |

**Recommendation:** keep `wrapIndent = 18` (current token). 12 saves only 6 px of right edge on the
wide-fan sample; 24 increases whitespace without a page benefit. 18 is the existing design token and
the ADR initial value.

## Deep-branch and wide-fan samples

Deep chain (`deep-chain.json`):

| block | depth | role | right-first x | group-left-origin x | note |
|---|---:|---|---:|---:|---|
| `f4-b1` | 0 | top-level | 0 | 0 | root |
| `f4-b2` | 1 | child | 18 | 18 | group wraps below `b1` |
| `f4-c1` | 2 | callout | 192 | 192 | anchor-aligned, before direct group |
| `f4-c2` | 3 | callout | 359 | 359 | nested, before direct group |
| `f4-b3` | 2 | child | 36 | 36 | below `b2`, after callouts |
| `f4-b4` | 3 | child | 282 | 282 | fits right of `b3` |
| `f4-b5` | 4 | child | 300 | **54** | cap removes the right-edge drift |

Wide fan (`wide-fan.json`, selected children; `x / y`):

| child | right-first | group-left-origin | subtree-aware |
|---|---|---|---|
| `f3-c1` | 456.0 / 0 | 18.0 / 99.1 | 456.0 / 0 |
| `f3-c5` | 456.0 / 481.5 | 18.0 / 580.6 | 456.0 / 481.5 |
| `f3-c8` | 456.0 / 1069.4 | 18.0 / 1168.5 | 456.0 / 1069.4 |
| `f3-c10` | 36.0 / 1308.2 | 36.0 / 1407.3 | 36.0 / 1308.2 |

## Recommendation

- `wrapIndent = 18 px` (unchanged token).
- `maxWrapIndent = 54 px` (3 × 18, three steps).
- Keep `group-left-origin` as the production default.
- Keep `right-first-per-child` as a test oracle only, not a user-facing mode.
- Keep `subtree-aware` as a lab-only comparison.

No fixture shows a net page-count loss. `wide-fan` shows the expected atomic-group height cost
(+99.1 px) with no page increase. This is within the ADR's width-over-length priority. No
pathological page count was observed: 300 blocks still paginate to 41 pages.

## Files changed

- `packages/layout/src/types.ts` — `WrapPolicy`, `maxWrapIndent`, `wrapPolicy`, defaults, resize seam
  comment.
- `packages/layout/src/layout.ts` — shared block-box resolution, group-fit pre-pass, three policies,
  capped wrap origin, ancestor keep-out floor.
- `packages/layout/test/layout.test.ts` — wide-fan expectation changed to the group rule; old
  right-first assertion retained under the oracle.
- `packages/layout/test/group-wrap.test.ts` — new focused unit tests (defaults, all-fit, one
  non-fit, recursive/cap, tall-ancestor keep-out, callout order, determinism, wide-fan oracle
  coordinates).
- `packages/layout/test/layout-lab.ts` — new deterministic lab metrics/helper.
- `packages/layout/test/layout-lab.test.ts` — new lab comparison, cap/wrapIndent sweeps, branch trees.
- `docs/reports/m4a-layout-lab.md` — this report.

No fixture, spec, UX, ADR, plan, token, page/reader/PDF, image, anchor, or resize UI file was changed.
No runtime dependency was added.

## Tests and timings

| Gate | Result |
|---|---|
| `npm run check:boundaries` | pass — 130 files, 606 imports, 16 rules |
| `npm run typecheck` | pass — desktop, core, layout, pdf |
| targeted layout vitest | pass — 28 tests in 4 files, 197 ms |
| `npm test` | pass — 68 files, 717 tests, 2.13 s |
| `npm run test:ui` | pass — 48 tests in 19 suites, 242.67 s including build; no UI assertion depended on the old package-layout geometry |
| `npm run test:recovery:run` | pass — 14 tests, 3 suites, 18.08 s |
| `npm run e2e:critical` | pass — 16 tests, 44.5 s |
| `npm run verify:fast` | pass — boundaries + typecheck + 717 unit tests + 16 e2e, 51.76 s |

Targeted layout files: `layout.test.ts`, `pagination.test.ts`, `group-wrap.test.ts`,
`layout-lab.test.ts`; the lab test logs all metric tables and branch trees. The full suite grew from
704 to 717 tests (+13: 8 group-wrap unit tests and 5 lab tests) with no test deletion.

## Changed expectations

- `packages/layout/test/layout.test.ts` — the wide-fan test was renamed and now expects **all** direct
  children below at the group origin (`x = 18`) when any child does not fit. The previous mixed
  right/wrapped assertion is preserved under `wrapPolicy: 'right-first-per-child'`.
- No page-count expectations changed: the golden fixture still paginates to 3 pages, and all
  pagination tests pass unchanged.
- No fixture data changed.

## Risks

1. **Ancestor keep-out is an implementation guard beyond the literal ADR sentence.** It prevents a
   capped left-origin wrap from overlapping a taller ancestor card. It is no-op on the current
   fixtures but could add vertical height in real documents with tall ancestors and right-hand
   children. The architect/product owner should confirm this is the intended safety behavior.
2. **Estimator-only lab.** Metrics use `createEstimatedMeasurement`, not the DOM measurement adapter.
   Real font metrics, images, and KaTeX can change widths, wrap decisions, and page counts; M4b
   should re-run the lab with real measurement before visual acceptance.
3. **Group atomicity can increase height.** `wide-fan` shows +99.1 px height with no page delta. A
   document with many mixed groups could increase page count; ADR-0006 accepts length as secondary
   to width/readability, but this needs real-document measurement.
4. **Showcase has pre-existing defects.** 13 broken anchors, 2 content-too-wide, 2 layout-overflow,
   and 1 missing asset make it unsuitable for a clean visual gate. It was read-only and not copied.
5. **Optional showcase path.** CI without `~/Documents/NoteForest/note-forest-showcase`
   exercises only the three committed fixtures; the report numbers for the showcase are local.
6. **`right-first-per-child` remains in the production type.** It is not the default, but external
   callers could select it. It exists to keep the regression oracle and should stay test-only by
   convention.
7. **Visual readability is not judged.** The lab measures geometry and page count; the product owner
   still needs screenshots/page-view/PDF review in M4b/M4c.

## Not verified

- Real DOM measurement adapter integration and reader/page-view rendering (M4b).
- Print compositor, PDF text extraction, and PDF page-count parity (M4c).
- Images/anchors in page/PDF and the 1,000-block performance gate (M4d).
- Manual resize UI or `widthHint`/`displayWidth` behavior (future slice; seams only).
- Product-owner visual acceptance and subjective readability.
- CI run without the local showcase path.

## Stop-and-ask check

- **Pathological page count:** none. `scale-300` remains 41 pages with zero `content-too-wide` and
  zero `layout-overflow` defects under all three policies; deep-chain 2, wide-fan 2, showcase 25.
- **Fit-rule conflict with a fixture:** the only conflict was the old `wide-fan` expectation that
  some siblings stay right while others wrap. That is exactly the behavior ADR-0006 replaces; the
  test was updated and the old behavior is retained under the oracle. No fixture requires stopping.
  Not merged or pushed.
