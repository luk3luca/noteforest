# Review — Targeted Page/PDF seam after R2i/R2j/R2j1

- **Reviewer:** Reviewer / Sentinel (independent)
- **Date:** 9 November 2026
- **Reviewed base:** `main` at `7f8b4a6` (R2j1 fix `39ec17e` plus the review brief)
- **Worktree:** `a builder worktree`
- **Branch:** `t3/r2-page-pdf-seam-review`
- **Environment:** macOS 26.5.2 (Darwin 25.5.0, arm64), Node 22.23.1, Electron 45.2.1, production build (`npm run build`)
- **Stack/PDF:** Electron + shared paginator + `printToPDF` (ADR-0001, ADR-0002)
- **Theme/views:** compact Page theme (product default), Page Read at fit-page; A4 landscape 12 mm (mode A), A5 portrait 12 mm (mode B2), A5 portrait 46 mm (stacked)
- **Verdict:** **Accept with findings**

**What is accepted.** R2i, R2j, and R2j1 meet their briefs on the inspected paths: the
subtree-aware wrap is deterministic and atomic, the A/B2/stacked modes are per-parent
and geometry-only, the two B2 trunks are independent, the R2j1 stem is visible, and
Page Read/Edit/PDF share one `PageEdgeModel`. There is **no S1** finding and no evidence
of overlap, overflow, content loss at a page break, or a second router.

**What is not accepted as M4c1 evidence yet.** The print-model seam is structurally
correct (it calls the same `buildPageEdgeModel`) but it is only tested with hand-built
layout/page fixtures, and `PrintModel` does not yet carry the resolved theme, font/metrics
identity, block measurements, anchor/missing-asset diagnostics, or page-chrome geometry.
Those are **S2 M4c1 prerequisites**, not regressions in R2i/R2j/R2j1. The product-owner
Page visual check is still a human gate and is not replaced by this review. Do not start
M4c PDF before that checkpoint.

This verdict accepts the R2i/R2j/R2j1 Page work; it is **not** an approval of M4c1 or of any
open S2 against the M4c1 gate. The checklist's "do not approve with open S2" rule applies to
the task being reviewed: R2i/R2j/R2j1 have no open S2 against their stated acceptance criteria.
F1-F4 must be closed inside M4c1 before its print gate; F5 is a product-owner decision.

## Scope reviewed

Reviewed:

- `packages/layout/src/layout.ts` — R2i subtree budget/wrap, R2j mode plan, R2j1 stem reserve.
- `packages/layout/src/page-edges.ts` — group trunks, B2 discriminator, cross-page segments.
- `packages/layout/src/page-settings.ts` — PageTheme tokens, presets, CSS variables.
- `packages/layout/src/types.ts` — LayoutOptions/LayoutBlock/PageEdge records.
- `packages/pdf/src/printModel.ts` and `packages/pdf/test/print-model.test.ts`.
- `apps/desktop/src/renderer/src/page/PageView.tsx`, `PageEdges.tsx`, `PageBlockEditor.tsx`,
  `measurement.ts`, `model.ts`, `adapter.ts`.
- New unit/UI suites: `page-callout-modes`, `page-subtree-wrap`, `page-edges`,
  `page-settings`, `r2j-lab`, `r2i-lab`, `tests/ui/r2j-page-callout-modes.test.mjs`,
  `tests/ui/r2i-page-subtree-wrap.test.mjs`.
- `docs/design-tokens.md` Page section; the R2i/R2j/R2j1 reports and plans; the current
  Page/PDF roadmap and settings plan.

Not reviewed: the full-codebase Sentinel scope, the unbuilt M4c print compositor/export
orchestration, PDF raster parity, Continuous runtime interaction, 300/1,000-block DOM
performance, and the product-owner visual/Page check. The orchestrator's full `verify`
at `39ec17e` was not re-run (per the brief).

## Acceptance criteria

| # | Criterion | Evidence | Result |
|---|---|---|---|
| R2i-1 | P→C1→G1: full subtree fails right, C1 below at `childIndent`, G1 right if it fits | `page-subtree-wrap.test.ts:179-221`; `r2i` UI `:210-245`; lab 54.10→45.09% | Pass |
| R2i-2 | If C1+G1 still does not fit, G1 wraps below C1 | `page-subtree-wrap.test.ts:223-257`; `r2i` UI `:273-311` | Pass |
| R2i-3 | Sibling group atomic; no split row | `page-subtree-wrap.test.ts:259-295`; `r2i` UI `:313-337` | Pass |
| R2i-4 | Recursion at every level; no overlap or overflow | unit + nested UI; lab 0 `layout-overflow`/`content-too-wide` | Pass |
| R2i-5 | Callout lane respected; prior callout placement preserved | `page-subtree-wrap.test.ts:327-389`; R2j supersedes production beside | Pass (legacy oracle) |
| R2i-6 | Page Read/Edit/PDF fragments reflect placement; page count/whitespace measured | unit pagination `:391-415`; R2i/R2j UI Read/Edit equality; print model consumes the same fragments | Pass for Page; PDF export is out of scope |
| R2i-7 | `childIndent` PageTheme token; Continuous untouched | settings/UI custom-indent tests; no Continuous `layoutDocument` consumer | Pass for app; engine-default caveat F7 |
| R2j-1 | Mode A: callouts right, children below at child indent, separate trunks | `page-callout-modes.test.ts:229-323`; R2j UI `:338-477`; screenshot | Pass |
| R2j-2 | Mode B2: callouts inner/right 24/38 first, children outer/left 12/26 lower | `page-callout-modes.test.ts:385-497`; R2j UI `:479-624`; screenshot | Pass |
| R2j-3 | Stacked fallback; B1 not used | `page-callout-modes.test.ts:548-687`; R2j UI `:626-707`; screenshot | Pass |
| R2j-4 | Per-parent deterministic choice from resolved width, not viewport/zoom | unit `:325-335`; UI 1440/960 `:804-853` | Pass (unit assertion weak, F13) |
| R2j-5 | Every arm enters left; no tree `p.N` chips | unit/UI assert `entry: left`, `targetPage: null`, no label | Pass |
| R2j-6 | Trunks cross pages; nested trunks independent | unit `:690-802`; R2j UI 3-page `:709-802`; R2g/R2f suites | Pass |
| R2j-7 | Page Read/Edit/PDF share geometry | Read/Edit DOM equality; print model calls the same builder/records | Pass for the shared geometry; print rendering inputs are M4c1 additions (F2/F3) |
| R2j1-1 | Nearly full-width stacked child keeps a visible stem | `page-callout-modes.test.ts:610-643`; R2j UI `:668-688`; x=24, trunk=12, stem=12 | Pass |
| R2j1-2 | Unbreakable child keeps old shift and explicit defect | `page-callout-modes.test.ts:645-668` | Pass |
| R2j1-3 | Effective-indent guard keeps `maxWrapIndent` 12 oracle | `group-wrap.test.ts:230-234`; `wrapOriginX` `layout.ts:359-366` | Pass |
| R2j1-4 | Page Read/Edit/PDF same geometry; Continuous unaffected | Page suites green; static audit: Continuous does not call `layoutDocument` | Pass for app; latent engine caveat F7 |
| Seam-1 | `PageEdgeTrunk`/`PageEdge` carry what the print compositor needs without a second router | `page-edges.ts:69-117`; `printModel.ts:56`; unit B2 print test | Geometry yes; rendering inputs no (F2-F4) |
| Seam-2 | Token ownership and no hardcoded Page pixels | most tokens in PageTheme/LayoutOptions; remaining literals/shared values | Partial (F7-F9) |
| Seam-3 | Tests/evidence guard behavior, no fixed sleeps | targeted unit/UI; no `waitForTimeout`; rAF waits only | Partial (F1, F12, F13) |

## Findings

Findings F1-F4 are M4c1 prerequisites and should be closed before the M4c1 print gate.
F5 needs the product owner. F6-F12 are follow-ups; none blocks the R2i/R2j/R2j1 work
that is already on `main`.

| ID | Severity | Area | Location | Evidence | Expected | Actual | Smallest safe fix |
|---|---|---|---|---|---|---|---|
| **F1** | **S2** | Print seam test | `packages/pdf/test/print-model.test.ts:48-125`, `:203-270`; `packages/pdf/src/printModel.ts:56`; `tests/ui/r2j-page-callout-modes.test.mjs:804-853` | The only `buildPrintModel` tests use a hand-built `layout` (`blocks: []`, minimal `blockById`) and hand-built `DerivedPage[]`; the UI suite asserts Read/Edit DOM equality but never constructs a print model. `grep buildPrintModel` finds only the PDF unit test. | A test that runs the real `layoutDocument` + `paginate` on the A/B2/stacked fixtures, builds the print model, and compares page count, fragments, edges, trunks, and `pageNumberByBlock` with Page Read. | The shared-builder callback is proven; the seam contract is not. A regression in `buildPrintModel`'s page mapping or the layout→print handoff would not fail a test. | Add a real-layout print parity test and a Page Read vs print-model attribute comparison; use it as the M4c1 gate. |
| **F2** | **S2** | Print model completeness | `packages/pdf/src/printModel.ts:20-45`, `:47-51`; `apps/desktop/src/renderer/src/page/PageView.tsx:516-539`, `:555-564`, `:238-316`; `apps/desktop/src/renderer/src/page/measurement.ts:168-176` | `PrintModel` carries fragments, edges, trunks, continuations, geometry, and defects, but not the resolved `PageTheme`/`pageCssVariables`, block measurements (segments, table columns), anchors/broken/ambiguous state, failed assets, or document content. The `document` argument is unused. PageView needs all of these to render. | A print model/compositor can render the same card/edges/chrome as Page Read from one object plus the document/assets. | The print compositor must reach back into the renderer runtime or duplicate these inputs; a missing theme/metrics map silently falls back to the compact `styles.css` values. | Extend `PrintModel` with the resolved theme/CSS map, per-block measurements, anchors, failed assets, and page-chrome layout (or pass a typed print runtime); remove or use `document`. |
| **F3** | **S2** | Chrome/label geometry | `apps/desktop/src/renderer/src/page/PageView.tsx:248-251`, `:262-264`, `:296-299`; `apps/desktop/src/renderer/src/page/PageEdges.tsx:93-122` | Header/ghost/footer/continues positions are `0.3/0.62/0.3/0.6 × margins`; edge labels use `max(18, margin−4)` and `−margin+2`. These are inside `PageView`, not exported or tokenized, and the print compositor has no shared function. | M4c1's header/footer/ghost/continues and `← p.N`/`→ p.N` chips sit at the same positions within the same tolerances. | Copying the fractions into the print compositor is the only option today; a one-line drift is invisible to every current test. | Export a shared `PageChrome`/`pageChromeLayout(geometry)` and a shared edge-label layout; reuse in print; add a chrome-position parity test. |
| **F4** | **S2** | Settings/manual-break identity | `packages/pdf/src/printModel.ts:47-50`; `packages/layout/src/paginator.ts:100-110`; `packages/layout/src/types.ts:383-387` | `buildPrintModel` accepts any `PaginatedDocument`; it does not carry the resolved `PageSettings`, `manualBreakBeforeBlockIds`, or a fingerprint. Page Read uses `computePageModel` with `pageLayoutOptions(settings.theme)` and the resolved manual breaks (`model.ts:41-54`). | A print model cannot be built from pages paginated with different settings; a mismatch fails the export. | A caller can pass an older/differently paginated model; page count or manual breaks can differ from Page Read with no guard. | Carry the resolved `PageSettings`/fingerprint in `PrintModel`, or have `buildPrintModel` re-paginate with the resolved settings and fail on a revision/settings mismatch. |
| **F5** | **S2 (product decision)** | Preset topology | `packages/layout/src/page-settings.ts:173-205` (`comfortable.pagePacking: 'stacked'`), `:307-309` (`calloutModes = beside`); `packages/layout/test/page-settings.test.ts:65-92` | `pageLayoutOptions(PAGE_THEME_PRESETS.comfortable)` → `pagePacking: 'stacked'`, `calloutModes: false`. The compact product default uses beside A/B2; Comfortable silently reverts to the pre-R1 stacked callout geometry. | If Comfortable is a density-only preset, the callout topology stays A/B2/stacked per parent; if it is intentionally legacy, the choice is explicit and labeled. | A user switching density gets a different branch topology, not just type/spacing. Page Read and PDF agree (so not an M4c1 parity bug), but the future Settings UI would expose a misleading preset. | Product owner confirms. If density-only, set `comfortable.pagePacking: 'beside'` (or decouple `calloutModes` from packing); keep an explicit lab/stacked override for the R2b/R2e oracles. Not an M4c1 blocker. |
| **F6** | S3 | Mode A custom gap | `packages/layout/src/page-settings.ts:446` (clamp 0..96); `packages/layout/src/layout.ts:551-558` (A gate); `packages/layout/src/page-edges.ts:384-392` (right rail) | A local probe (not committed) with `calloutRightGap: 0` produced callout x = parent right = 376, trunk x = 376.5, route stem 0, and a single-point route: the callout card touches the parent and the leader/arrowhead is hidden. | Mode A is only chosen when the gap gives a visible final stem; `calloutRightGap` is clamped to at least `EDGE_STYLE.stemMin` (plus the rail lane) or A falls back. | Default 24 is safe; a user-facing advanced value below ~12 can produce a disconnected/overdrawn callout. | Clamp `calloutRightGap` to a stem-safe minimum or gate A on `calloutRightGap >= EDGE_STYLE.stemMin + EDGE_STYLE.laneMin`; add a negative test. |
| **F7** | S3 | Shared engine default | `packages/layout/src/types.ts:404-409` (“Continuous does not read this field”), `:450` (`childIndent: 26`); `packages/layout/src/layout.ts:359-366`; `packages/layout/test/group-wrap.test.ts:144-148` | `wrapOriginX` reads `childIndent` unconditionally; a default `layoutDocument` chain now places b1 at x=26 and b2 at x=52, not `wrapIndent` 18. The comment says Continuous does not read it; the engine default does. | Either the engine default keeps the Continuous/ADR-0006 origin (`wrapIndent`) and `pageLayoutOptions` supplies 26, or the contract explicitly says the engine default is 26. | A latent behavior change for any future/default `layoutDocument` consumer; no current app Continuous path uses it (static audit), so no user-visible regression today. | Make `DEFAULT_LAYOUT_OPTIONS.childIndent` default to `wrapIndent`, or update the comment/docs and route all Page tests through `pageLayoutOptions`; add a test that distinguishes the two defaults. |
| **F8** | S3 | Token semantics/doc drift | `packages/layout/src/types.ts:400-403`; `packages/layout/src/page-settings.ts:68-69`; `docs/design-tokens.md:106`; `packages/layout/test/group-wrap.test.ts:208-234`; `packages/layout/src/types.ts:458-460` | `maxWrapIndent` is documented as a **cumulative** page-left cap, but `wrapOriginX` applies it **per level**; the chain test reaches 26/52/78/104 with max 54 and says the global cap is gone. `types.ts:459` still says “compaction for compact”, but compact is beside. | Comments, token labels, and the Settings UI describe per-level `maxWrapIndent` (or rename it); `wrapIndent` vs `childIndent` roles are unambiguous. | A Settings UI built on these labels would promise a cap the engine no longer enforces; the fix is small but must land before Settings. | Update the comments/design-token row/UI plan to “per-level maximum”; decide whether `wrapIndent` is still a user-facing Page wrap value or only a list/legacy value. |
| **F9** | S3 | Remaining Page literals/shared design values | `packages/layout/src/layout.ts:149` (`CALLOUT_ROW_INDENT = 26`), `:755`, `:1432` (`144`), `:902`, `:1546` (`16`); `packages/layout/src/page-edges.ts:385-401`, `:570`; `docs/design-tokens.md:74-91` | The legacy beside lane still hardcodes a 26 px row indent, a 144 px readability floor, and 16 px fallback points; Page layout/edges read `EDGE_STYLE.stemMin`/`trunkInset`/`trunkGap`/`laneMin`/`laneMax`, not PageTheme. The page-wrap plan wanted Page-owned `pageStemMin`/`pageTrunkGap`; `PageTheme` has no `stemMin`/`trunkGap`/mode-preference field. | No Page-only literal in `layout.ts`/`page-edges.ts`; Page design values are in `PageTheme`/`LayoutOptions`, with shared edge primitives only as explicitly shared constants. | Default compact/comfortable values are consistent, so no visible defect today; the Settings inventory would expose the gap and the Page print skin cannot tune the stem/trunk independently. | P0 token/doc split before Settings: add Page stem/trunk-gap/row-indent tokens where they are user-visible or document why the shared value is intentional; replace the legacy literals. |
| **F10** | S3 | Mode A vs anchor rule | `packages/layout/src/layout.ts:820-849`; `packages/layout/src/page-edges.ts:384-392`; `apps/desktop/src/renderer/src/page/PageEdges.tsx:209-211`; `docs/review-checklist.md` §4.1/§4.3 before this review's edit | Mode A places anchored callouts at the parent's **top y**, to the right; the primary leader leaves the parent's right port. Before this review the checklist said “an anchored callout starts below its anchor” and “begins at the anchor, not at the block edge”; `data-page-edge-anchor-start` is true even though the route begins at the parent port. | The Page-specific exception is explicit, and the product-owner visual check confirms the anchor/callout association. | The implementation follows the R2j plan; this review adds the checklist exception, but the spec/UX sweep still needs it and the PO visual check is pending. | Keep the checklist/spec exception; confirm the anchor association in the PO visual check. No code change from this review. |
| **F11** | S3 | Manual break before a mode A callout | `packages/layout/src/paginator.ts:166`, `:451-470`; `packages/layout/src/layout.ts:823-826`; R2j report risk 4 | A hint before a mode A callout names the callout y, which equals the parent y: at y>0 it breaks before the **parent**, not only the callout; at y=0 it is silently ignored (no warning). | A manual break either isolates the callout where safe or is reported as unhonorable with the actual semantics. | No data loss and no unsafe split, but the hint cannot express “callout on its own page”; the silent y=0 case is invisible. | Document the semantics; the future manual-break UI should not offer a break before a mode A callout (or should map it to the parent with a notice); add a paginator test for both cases. |
| **F12** | S3 | Lab/evidence quality | `packages/layout/test/r2i-lab.test.ts:123-130`, `packages/layout/test/r2j-lab.test.ts:209-217`, `:317-322`; no DOM perf run | The showcase rows depend on a hard-coded machine path (`~/Documents/...`) and are silently skipped when absent; the R2j lab keeps a `console.error` debug dump behind a condition; the labs write JSON but the R2i lab has no assertions; no DOM page-layout timing at 300/1,000 blocks. | Labs are reproducible or marked optional; no debug output; the 300/1,000 DOM path has a measured budget note. | The synthetic/fixture rows are reproducible; the showcase numbers are machine-local; the labs are evidence generators, not gates; performance is unmeasured for the new recursion. | Commit a showcase fixture or mark the row conditional in the report; remove the debug block; add a perf note (or defer to M4c3's 300-block PDF gate, explicitly). |
| **F13** | S4 | Test/comment nits | `packages/layout/test/page-callout-modes.test.ts:325-335`; `packages/pdf/src/printModel.ts:47-51`; `packages/layout/src/types.ts:458-460` | “No viewport/zoom” only asserts the options object lacks those keys; `document` is unused; `types.ts` still says “compaction for compact”. | Assertions state the geometry invariant; no dead parameters/comments. | Weak/duplicated evidence; harmless. | Reword the unit test toward the UI viewport check; remove/use `document`; correct the comment. |

## Answers to the eight brief questions

### 1. R2i placement correctness

Yes for the tested shapes. `subtreeColumn` uses the same `resolveBlockBox` as placement, adds the
widest child column only when every child subtree fits recursively, and caches by
`(blockId, available)` (`layout.ts:453-506`). The production `group-left-origin` decision is atomic
(`candidates.every`, `layout.ts:706-735`); each wrapped child repeats the rule from its own origin.
The unit and UI fixtures cover P→C1→G1, nested wrap, atomic siblings, the all-fit case, the callout
lane, the stacked callout order, and pagination fragments (`page-subtree-wrap.test.ts:179-415`;
`r2i-page-subtree-wrap.test.mjs:210-430`). The current lab confirms 1-page fixtures with 0
`layout-overflow`/`content-too-wide`.

Gaps: no R2i-specific fixture combines a wrapped group with a **page break** (the R2g/page-edges
suites cover trunks, but not the R2i placement on a break); no duplicate-primary or reference-edge
negative (correct by design, but unasserted); no multiple-failing-sibling case beyond the atomic
case. The callout-lane interaction is covered for the legacy beside oracle; production A/B2 is
covered by R2j. No overlap/overflow case was found. The ancestor budget excludes the callout lane
(brief risk 3), but the lane is bounded by the ancestor's `rightLimit`, so I found no collision;
the cost is possible extra whitespace or a narrower mode, not incorrect geometry.

### 2. R2j modes

A/B2/stacked are chosen per parent from the placed parent box and `context.rightLimit` — the
resolved column limit (the report's “resolved Page width” is loose for nested columns). The
decision is pure: no viewport, zoom, DOM, or measurement side channel (`layout.ts:541-574`). The
A gate requires the lane to fit `calloutModeMinWidth` and every callout card; B2 requires both
nominal stems (`calloutCardIndent − calloutTrunkInset`, `childIndent − childTrunkInset`) to be at
least `EDGE_STYLE.stemMin` and both card columns to be readable; otherwise stacked. The UI repeats
the geometry at 1440 and 960 and keeps the same page count/routes (`r2j...test.mjs:804-853`).

B2 is genuinely two groups: `LayoutBlock.trunkGroup`/`trunkInset`, `PageEdgeTrunk.trunkGroup`, and
ids `parent:below:callout|child` (`layout.ts:841-847`, `999-1004`; `page-edges.ts:457-469`,
`:566-573`). Both arms enter left; the trunk x is stable across pages; nested groups open their own
ids (`page-callout-modes.test.ts:385-497`, `:690-802`; 3-page UI). No tree `p.N` chip is emitted;
primary directions are `same-page`/`trunk` and `targetPage` is null.

The explicit `stacked` path is bounded: `pageLayoutOptions` only enables modes for `beside`; the
`stacked` packing keeps the historical geometry; `compaction` is lab-only (`page-settings.ts:307-311`;
`types.ts:210-229`). The product-visible exception is the **Comfortable preset** (F5): a preset
change silently disables modes. I found no oscillating or page-count-unstable choice; the mode is
decided once before placement and does not feed back into the page width. Mode A's callout is not
below the anchor (F10), by the R2j design; the checklist/spec need the exception.

### 3. R2j1 stem reserve

Yes for the tested case. The reserve origin is `trunkInset + stemMin = 24`; the stacked child in the
A5 46 mm fixture lands at x=24, width 187.648, with the shared below trunk at x=12 and a 12 px stem
(`page-callout-modes.test.ts:610-643`; UI `:668-688`; evidence JSON `page-callout-modes-stacked`).
The unbreakable child keeps the old shift and its explicit `content-too-wide` defect
(`page-callout-modes.test.ts:645-668`). The effective indent gate
`min(maxWrapIndent, max(wrapIndent, childIndent)) >= 24` preserves the legacy `maxWrapIndent` 12
oracle (`group-wrap.test.ts:230-234`; `layout.ts:749-769`), and the narrower card re-measures through
the same width policy. No hidden overflow was found.

Continuous: the app's Continuous renderer does not call `layoutDocument` (static audit; only
`page/model.ts` does), so there is no user-visible Continuous regression on this tree. The shared
engine default **did** change: `wrapOriginX` reads `childIndent` 26 unconditionally, so a default
`layoutDocument` wrap is now 26, not `wrapIndent` 18 (F7). Any future/default engine consumer would
inherit it. Missing negative tests: a custom `maxWrapIndent < 24` (the report's own risk 1), a
`calloutRightGap` below the stem (F6), and the wide-page unbreakable child where `keepStem` is true
but the shift-to-fit origin still reports a defect (the defect is explicit, not hidden, but the
report's “keeps the old shift” wording is broader than the test).

### 4. Edge/trunk model

`PageEdgeTrunk` carries the stable `id`, `parentBlockId`, semantic `placement`, `trunkGroup`, the
parent `port`/`portPage`, the shared `x`, and every page-local `segments[]` entry with `start`,
`end`, and the parent-page `lead` (`page-edges.ts:69-86`, `:457-469`). `PageEdge` carries branch
identity, role, page-local `from`/`to`, `direction`, `targetPage`, `placement`, the `trunk` and
`trunkSegment`, the orthogonal `route`, the canonical `branchLabel`, and `anchorId`
(`page-edges.ts:94-117`). That is enough for the print compositor to draw the same arrows, trunks,
pass-through pages, and cross-page continuity without a second router. `buildPrintModel` calls the
same `buildPageEdgeModel` (`printModel.ts:52-56`), and the B2 print test proves the records alias.

Page Read/Edit DOM consumes the same model (`PageView.tsx:437-442`; `PageEdges.tsx` never
re-routes), and the R2j UI compares Read and Edit fragment/edge snapshots. The one semantic mismatch
to document is that primary anchored edges start at the **group port** (parent right or parent
bottom), not at the anchor rectangle; `data-page-edge-anchor-start` and `anchorId` identify the
branch, but the checklist's “starts at the anchor” language is Continuous-first (F10). The print
model's missing rendering inputs (theme/measurements/chrome) are F2/F3, not an edge-model mismatch.

### 5. Token ownership

The new R2i/R2j values are Page-only fields on `PageTheme` and `LayoutOptions` (child indent, three
B2 insets/indents, right gap, mode floor, packed-policy/`calloutModes`), and `pageLayoutOptions` is
the single mapping (`page-settings.ts:294-318`; `types.ts:404-433`). Continuous tokens are not
imported into PageTheme, and the Page CSS variables come from the same theme. No new Page pixel was
added to `styles.css` except the documented compact fallback (which print must override; F2).

Remaining gaps: `CALLOUT_ROW_INDENT` 26 and the 144/16 legacy beside literals (F9); Page
layout/edges use `EDGE_STYLE.stemMin`/`trunkInset`/`trunkGap`/`laneMin`/`laneMax` and `PageTheme`
has no Page-owned stem/trunk-gap token (F9); `DEFAULT_LAYOUT_OPTIONS.childIndent` makes the engine
default read a Page-only field (F7); `maxWrapIndent` is documented as cumulative but implemented
per-level (F8); `wrapIndent` and `childIndent` overlap for Page wraps, and `wrapIndent` mainly
affects list indentation in `segments.ts`/measurement; the future Settings UI needs that split
before exposing both. The page-chrome fractions and edge-label offsets are Page-only magic numbers
that are not tokens (F3). No cross-import of Page design values into Continuous was found.

### 6. PDF seam readiness

Ready as-is for geometry:

- `DerivedPage`/`PageFragment` page boxes, segment ranges, `isFirst`/`isLast`, continuation
  records, chapter/page metadata, overflow, and page count.
- `PageEdgeModel` edges and trunks, including pass-through pages, B2 groups, cross-page segments,
  routes, arrow direction/entry/stem, and reference `← p.N` records.
- `PageGeometry`, `PageSetup` (A4/A5/Letter, orientation, margins), `EDGE_STYLE`/path helpers, and
  the same `buildPageEdgeModel` call. The Spike 1 printToPDF orchestration, fixed page containers,
  and atomic write are the existing foundation; the Page print compositor itself is not built.

Must be added before M4c1's gate:

1. A real-layout print parity test and a Page Read vs print-model attribute comparison (F1).
2. `PrintModel` rendering inputs: resolved `PageTheme`/`pageCssVariables`, block measurements and
   table columns, anchors/broken/ambiguous, failed assets, document content/segment builder, and
   page-chrome geometry (F2/F3). The print root must apply the resolved CSS variables, not the
   compact `styles.css` fallback, or comfortable/custom metrics silently change.
3. Resolved-settings identity and manual-break carry (F4).
4. Shared chrome/edge-label rendering (F3), print skin that changes colors/borders/shadows only, no
   metric changes, fixed page containers, no CSS re-pagination, font/KaTeX/image settle, local CSP,
   and vector arrows.
5. A5/Letter smoke checks, page count/orientation/margins parity, raster parity at the ADR
   tolerance, and the 50+ page A4 gate. The 300-block performance gate belongs to M4c3; the Page
   layout recursion has no DOM timing evidence yet (F12).

Deferred to M4c3/post-PDF: the full PDF gate, product-owner PDF visual check, Notability import,
A5/Letter full visual gate, `export.pdf` API, and the full-codebase token/settings inventory. None
of these blocks starting the print compositor.

### 7. Tests and evidence

Strong points: the R2i/R2j unit suites use the real layout engine and assert coordinates, trunk ids,
trunk x, entry, stem, page segments, and determinism; the R2j1 unit asserts both the visible stem and
the unbreakable fallback; the UI suites use real DOM measurement, assert no overlap and inside-content,
compare Read/Edit geometry and edge snapshots, and repeat the same fragment/page count at 1440 and
960. There are no fixed sleeps; the only render wait is two `requestAnimationFrame` ticks after a
window resize (`r2j...test.mjs:813-817`), which is a render-settle predicate, not a sleep. No native
dialogs, no screen recordings.

Weak/missing: the print-model test is the main gap (F1) and `PrintModel` is not self-contained (F2);
chrome/label parity has no test (F3); `calloutRightGap` below the stem and `maxWrapIndent < 24` have no
negative case (F6, R2j1 risk); the “no viewport” unit assertion is only a key check (F13); the labs
are evidence generators, not gates, and the showcase row is machine-local (F12); no DOM page-layout
timing at 300/1,000 blocks (F12). The lab numbers are trustworthy for relative before/after deltas
because the estimator is deterministic and the UI cross-checks the same fixtures; they are not a
substitute for the M4c3 PDF/raster gate. The estimator's `minContentWidth` treatment is stricter than
the DOM for text; that is acceptable for the delta lab and is why the UI measurement is the final
placement evidence.

### 8. Known risks from the R2j report

| Risk | Decision |
|---|---|
| Explicit `stacked` preset | For M4c1, acceptable: Page and PDF agree, and the legacy path is documented. But the **Comfortable preset** silently selects it (F5); product owner must confirm whether Comfortable is density-only. Fix before the Settings UI exposes presets. |
| Callout-only parents stay stacked | Accept for M4c1. It is a deliberate A/B2 scope limit (`layout.ts:549`); revisit in Page polish/Settings. No collision or parity risk. |
| Ancestor budget excludes the callout lane | Accept for M4c1. No overlap/overflow found; the lane is bounded by the ancestor `rightLimit`. A mode-aware ancestor budget is a larger follow-up, not a blocker. |
| Manual break before a mode A callout | Accept with documentation (F11). No data loss; at y>0 it breaks before the parent, at y=0 it is a no-op. The future UI should not offer it as “callout on its own page”. |
| Estimator vs DOM | Accept for the lab; the UI is the placement evidence. M4c3 must use the real DOM/PDF gate, not the estimator. |
| Additional: custom `calloutRightGap` | S3 F6; default safe. Clamp/gate before Settings exposes the gap. |
| Additional: shared engine default `childIndent` | S3 F7; no current Continuous app path, but the contract/comments are false. Fix before any future default `layoutDocument` consumer. |

## M4c1 recommendation

**Add** — start from the ready geometry, but add the items below before the M4c1 gate. Do not treat
this as “defer”: the Page geometry, fragments, edges/trunks, routes, continuations, and page setup
are the right contract, and the shared `buildPageEdgeModel` is the correct single source. Start
M4c1 only after the product-owner Page visual/Page checkpoint; then:

1. Add the real-layout print parity test and the Page Read vs print-model attribute test (F1).
2. Extend `PrintModel` with the resolved theme/CSS map, block measurements/segments/table columns,
   anchors/broken/ambiguous, failed assets, document/segment builder, and page-chrome layout; or pass
   a typed print runtime and keep `PrintModel` as the page/edge record (F2/F3).
3. Carry the resolved settings/manual-break fingerprint (F4).
4. Share the chrome and edge-label rendering; the print skin must not change metrics.
5. Keep the print page containers fixed; no re-pagination, no CSS paged-media breaks; wait for fonts,
   KaTeX, and image decode; light output; vector arrows.
6. Run A5/Letter smoke checks, page count/orientation/margins parity, and the raster tolerance; the
   full 50+ page A4 and 300-block perf gates stay in M4c3.

Do **not** start R3/R4 or the full-codebase refactor in this task. The token/doc inventory (F7-F9)
belongs to the full-codebase Sentinel/Settings sequence; the Comfortable preset decision (F5) is the
product owner's.

## Checks run

| Check | Result | Timing |
|---|---|---|
| Targeted unit: `npx vitest run packages/layout/test/page-callout-modes.test.ts packages/layout/test/page-subtree-wrap.test.ts packages/layout/test/page-edges.test.ts packages/layout/test/page-settings.test.ts packages/pdf/test/print-model.test.ts packages/layout/test/r2j-lab.test.ts packages/layout/test/r2i-lab.test.ts` | 7 files / 49 tests pass | 184 ms |
| R2j UI: `node --test tests/ui/r2j-page-callout-modes.test.mjs` | 5/5 pass, 0 pageErrors | 10.27 s suite / 18.42 s wall |
| R2i UI: `node --test tests/ui/r2i-page-subtree-wrap.test.mjs` | 6/6 pass, 0 pageErrors | 2.94 s suite / 11.09 s wall |
| Production build for UI | `npm run build` exit 0 | — |
| Local probe (not committed): real estimated layout, `calloutRightGap: 0` | callout x = parent right = 376; trunk x = 376.5; stem 0; single-point route | — |

No full `npm run verify` was run (orchestrator already ran it at `39ec17e` and the brief forbids a
repeat). No fixed sleeps, native dialogs, or screen recordings. The temporary probe was removed; the
worktree was clean before writing this report.

## What I could not verify

- The full `npm run verify` result; I relied on the orchestrator's green baseline at `39ec17e`.
- The product-owner visual/Page check; it remains a human gate.
- M4c PDF export, the print compositor, A5/Letter PDF output, fonts/KaTeX embedding, raster parity,
  and the 50+ page gate (not built).
- 300/1,000-block DOM page-layout timing; only the DOM-free lab and the small UI fixtures were run.
- Continuous runtime behavior; the static audit found no Continuous `layoutDocument` consumer, and
  the base full verify was green.
- The showcase lab row is machine-local (`~/Documents/NoteForest/...`); it was present in
  this run but is not a committed CI fixture.

## Open questions / risks

1. **Product owner (F5):** Is the Comfortable preset intentionally the legacy stacked topology, or
   should it stay density-only (A/B2)? This must be decided before the Settings UI exposes presets.
2. **Product owner (F10):** Confirm that mode A's parent-right-lane callout, with the leader leaving
   the parent's right port, preserves the anchor association visually.
3. **Product owner (F11):** Confirm that a manual break cannot isolate a mode A callout; the future
   manual-break UI should expose the actual semantics.
4. **Full-codebase Sentinel/Settings (F7-F9):** decide `childIndent` engine default, `maxWrapIndent`
   per-level label, `wrapIndent` vs `childIndent` ownership, Page stem/trunk-gap tokens, and the P0
   design-token/doc split.
5. **M4c1:** fonts/metrics identity, print skin (colors only), page-chrome positions, A5/Letter,
   local protocol images, and raster parity are the remaining implementation risks.

## Checklist update

I added the reusable rules to `docs/review-checklist.md` (Sentinel-owned):

- §4.3: the Page mode A exception for anchored callouts (right lane at the parent top; leader from
  the parent port; anchor mark identifies the branch).
- §4.1: a Page density preset that changes callout topology is a product decision and must be
  labelled, not silent.
- §6.6: the print model must be built from the same real `layoutDocument` + `paginate` output as Page
  Read (a hand-built fixture is not seam evidence), and it must carry the resolved PageTheme/CSS
  variables, measurements, anchor/missing-asset diagnostics, and page-chrome geometry; add a Page
  Read vs print-model parity test.

No product code, test, spec, UX, ADR, or plan was changed. The worktree is clean apart from this
report and the checklist lines.

## Handback

- **Worktree:** `a builder worktree`
- **Branch:** `t3/r2-page-pdf-seam-review`
- **Reviewed head:** `7f8b4a6926d313d5cf14ba7994b60972ec1e5255` (`7f8b4a6`, `main` at the brief)
- **Review commit:** the docs commit containing this report and the checklist lines; see the handback
  message for its SHA. No merge, push, or PR.
