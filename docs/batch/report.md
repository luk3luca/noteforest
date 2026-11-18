# Report — anchor resolution index

**Builder:** implementation sub-agent. **Branch:** `t3/anchor-resolution-index`.
**Base:** `7f684c0` (docs: anchor resolution brief). **Commit:** one commit on the batch branch.
**Status:** implemented, green on `verify:fast`, `test:perf` and the touched UI suites; review
package produced; **not merged, not pushed**.

## Summary

Anchor resolution is now one index over the core resolver, owned by `DocumentSession`, read by the
renderer and the layout. The layout no longer derives `resolved`/`ambiguous`/`broken` from measured
rect counts or `occurrenceHint`; it consumes the index's `AnchorResolutionView` and only picks
geometry. The renderer reads the same entries (markers, callouts, warnings, find order/block
projections, health), and the export snapshot carries the view into the hidden print window with an
identity/revision guard. The visible Page/PDF changes are exactly plan §6.

A product-owner visual review of the first cut found two callout-lane regressions (ambiguous/broken
cards pushed to the warning point, and the selector-only fallback card at the page content left).
Both are fixed: warning cards keep the measured below lane, and a range with no measured rect uses
the callout indent and trunk inset. A below card also never starts left of the callout lane: the
measured card x is clamped to block left + 38, so the trunk at +24 stays outside the card (the
broken image case). The dot, the state and the copy are unchanged.

No schema change, no anchor-resolution rule change, no new dependency, no ADR change.

## What was implemented

- **Step 0 — baseline evidence.** `npm test` on the untouched baseline (174 files / 1,795 tests,
  8.77 s), the anchored `test:perf` seed added first, the BEFORE measurement on the pre-index code
  (seed-only change), and the BEFORE review screenshots/PDF.
- **Step 1 — core index.** `packages/core/src/anchor-index.ts`: `AnchorIndex`,
  `buildAnchorIndex`, `entry/all/blockIndex/view/update`, `stats`, and the extracted
  `resolveDocumentAnchorsWithIndexes` (no behaviour change). Cache unit is the per-block
  `BlockAnchorIndex`; the key is the block content JSON text; `update` verifies a matching key
  against the content it would reuse, so a stale supplied key forces a rebuild, never a stale reuse.
- **Step 2 — session ownership.** `DocumentSession` owns one index, builds it on load, refreshes it
  on `commitContent`, `acceptStructural`, `acceptUndo`, `acceptRedo`, `reset` and on a disk revision
  (`applyRevision`), always before `bumpVersion`/`notify` (and before `recordFailure` for the
  accepted prefix of a failed commit). New optional `assetAvailability()` port; `blockContentKeys()`;
  `DocumentRuntime.anchorIndex`.
- **Step 3 — estimate port sees M3.** `estimate.ts` reads `anchorIds` on marks and atomic attrs with
  the legacy `anchorId` fallback; an M3 fixture and the image fixture now produce rects.
- **Step 4 — layout consumes the view.** Optional 5th `layoutDocument` parameter with the
  document/revision guard (an anchored document without a view throws); the picker uses the view
  state, unions resolved rects, attaches from the last line, falls back to the block box with an
  `anchorGeometryFallbacks` diagnostic, and skips idle/block-missing. The old derivation, the
  `occurrenceHint` reads, the dead `anchorStates` map, the per-block anchor scan and the linear
  attachment lookup are deleted. The view is threaded through `computePageModel`, the Page hook, the
  print entry, `ExportSnapshot` and both validators.
- **Step 5 — renderer reads the index.** `tree.anchorState`, `BlockViews` (markers, formula/code
  targets, live callout state, warnings), `ImageNodeView`, `adapter.toCallout`, `find` (order and
  block projections), `document-health`, `anchor-health`, `Sidebar`, `actions`. Authoring selectors
  still write `occurrenceHint`; no surface reads it to derive a state.
- **Step 7 — perf and integration.** Cold-build guard and warm-update guard in the core benchmark;
  the anchored `test:perf` scenario; the before/after protocol; `verify:fast`, UI suites.
- **Step 6 — review package (produced, not merged).** `tests/support/anchor-review-fixture.mjs` and
  `tests/ui/m5a-anchor-resolution-review.test.mjs`, with before/after screenshots, PDFs, rasterized
  PDF pages and JSON evidence under `artifacts/anchor-review/`.
- **Product-owner fixes (same branch, amended commit).**
  1. An ambiguous/broken anchor keeps a `calloutX` in `AnchorAttachment`: the leftmost measured rect
     for that anchor when it has one, the callout indent otherwise. The callout card uses
     `calloutX` in stacked and beside placement, while the warning point still drives the dot and
     the edge start. The multi-node union-box callout is unchanged.
  2. A resolved range with no measured rect uses the callout lane: card x = block card left +
     `calloutCardIndent` (38), attach/edge x = block card left + `calloutTrunkInset` (24), and the
     callout's below trunk gets `trunkInset = calloutTrunkInset`. The card no longer touches the
     page border. `rect` still records the block content box for the fallback diagnostic; only the
     visible callout geometry moves.
  3. Every attachment used by a below callout now carries `calloutTrunkInset`, not only the zero-rect
     fallback. The stacked and beside placement paths pass it as the callout block's `trunkInset`,
     and a below group whose targets are all callouts keeps the inset even when the card would
     otherwise start closer than the readable stem. Mixed callout/child groups keep the old
     readable-stem clamp so a child arm never collapses.
  4. Every below card starts at or right of the callout lane: `calloutX` is clamped to
     `block x + calloutCardIndent` (38) for resolved and warning anchors, so the trunk at +24 never
     runs behind the card. The broken image was the failing case (measured content left +8.8);
     it now sits at +37.0 from the Page parent left, the same lane as the selector fallback. Dots,
     warning-point edges and card y are unchanged.

  Regression coverage: `packages/layout/test/anchor-view.test.ts` asserts `calloutX`, the callout
  block x, the trunk inset for every attachment and the fallback attach point; the review UI suite
  asserts the measured card lanes, the image/selector shared lane, the selector-only offset and
  `data-page-trunk-x = 24` for the multi-node, formula, image, selector and control callouts from
  the real Page render.

## Files changed

Source:

- `packages/core/src/anchor-index.ts` (new), `packages/core/src/anchors.ts`, `packages/core/src/index.ts`.
- `packages/layout/src/types.ts`, `layout.ts`, `page-edges.ts`, `estimate.ts`.
- `apps/desktop/src/renderer/src/state/document-session.ts`, `runtime.ts`, `editor-projection.ts`.
- `apps/desktop/src/renderer/src/lib/adapter.ts`, `tree.ts`, `find.ts`, `document-health.ts`,
  `anchor-health.ts`.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`, `ImageNodeView.tsx`,
  `editor/DocumentEditor.tsx`.
- `apps/desktop/src/renderer/src/page/model.ts`, `page/usePageModel.ts`, `page/adapter.ts`.
- `apps/desktop/src/renderer/src/export-snapshot.ts`, `print/entry.tsx`,
  `shell/FindController.tsx`, `shell/useDocumentHealth.ts`, `shell/Sidebar.tsx`, `actions.ts`.
- `apps/desktop/src/shared/export.ts`, `apps/desktop/src/main/export-service.ts`,
  `apps/desktop/src/renderer/src/test-surface.ts` (test-only `anchorStates()` bridge),
  `apps/desktop/src/renderer/src/global.d.ts`.
- `apps/desktop/src/main/library.ts` + `shared/api.ts` + `main/index.ts`: `performance-anchors`
  seed kind (342 blocks, 36 anchors: 30 text + 3 code + 3 formula, each with a primary branch).
- `packages/core/test/anchor-index.test.ts`, `anchor-performance.test.ts` (new guards);
  `packages/layout/test/anchor-view.test.ts`, `anchor-estimate.test.ts`;
  `apps/desktop/test/anchor-index-parity.test.ts`, `layout-view.ts`; extended session, health,
  export-contract, export-snapshot/job/preflight/service, tree and layout fixture tests;
  `tests/perf/m2-performance.test.mjs`; `tests/ui/suites.mjs`.
- `tests/support/anchor-review-fixture.mjs`, `tests/ui/m5a-anchor-resolution-review.test.mjs`.
- `docs/batch/report.md` (this file).

No product file outside the plan's scope was changed. Tests that encoded the old second derivation
were updated to the core state (for example `broken-anchor.json` duplicate binding is `broken`, not
`ambiguous`), and synthetic layout fixtures now give their anchors a real core binding so packing
geometry still tests what it names.

## Checks and timings

Machine: Apple M5, 24 GB RAM, macOS 26.5.2 (build 25F84). Node 22.23.1, npm 10.9.8.
Date: 2026-11-18. Release-style build via `npm run build` for app-level runs.

| Check | Result | Time |
|---|---|---|
| Baseline `npm test` (pre-change) | 174 files / 1,795 tests passed | 8.77 s (9.79 s wall) |
| Final `npm run verify:fast` (boundaries + typecheck + unit + critical e2e) | boundaries 299 files; unit 178 files / 1,833 tests; e2e 16/16 | **62.0 s** |
| Re-run after the callout-lane clamp (`npm run verify:fast`) | boundaries 299/1,469/16; typecheck clean; unit 178 files / 1,833 tests; e2e 16/16 | green (unit 8.65 s, e2e 45.8 s) |
| Review suite after the clamp (`--group anchors`, concurrency 4) | **15/15 passed**; image and selector cards both at +37.0 px from the parent left, all below trunks at 24 | **57.7 s** |
| Final `npm test` (inside verify:fast) | 178 files / 1,833 tests passed | 8.44 s |
| Final `npm run e2e` (inside verify:fast) | 16/16 | 45.8 s |
| `npm run test:perf` final (post-fix) | 2/2 scenarios | 28.5 s |
| Touched UI suites: `node tests/ui/run.mjs --group anchors,page --concurrency 4` | **35/35 passed** (incl. the new review suite) | **164.7 s** |
| `npm run check:boundaries` | clean | — |
| Core benchmark (`NOTEFOREST_PERF_REPORT=1`) | cold index build **5.29 ms**; warm update p95 **4.55 ms**; resolution 7.84/5.10 ms | — |

The full `npm run verify` is deliberately left to the Orchestrator at integration.

## Before / after performance

Same machine, date and build settings. 3 runs each, medians; the app-level seed is
`performance-anchors` (342 blocks, 36 anchors). BEFORE is the pre-index source with only the seed and
the perf scenario added; AFTER is the final source. The unanchored `performance` seed was measured in
the same runs.

### Anchored seed — `artifacts/perf-before/*-s{1,2,3}.json`, `artifacts/perf-after/*-final*.json`

| Metric | BEFORE | AFTER | Delta |
|---|---|---|---|
| Open to interactive | 663 ms | 654 ms | −9 ms |
| Keystroke-to-paint proxy (double rAF) | 102.6 ms | 105.1 ms | +2.5 ms (noise; see risks) |
| `measure` p95 | 3.3 ms | 2.4 ms | −0.9 ms |
| `edge` p95 | 0.4 ms | 0.4 ms | 0 |
| `reflow` p95 | 0 ms | 0 ms | 0 |
| `mount` p95 | 0.1 ms | 0.1 ms | 0 |

Open to interactive is 654 ms against the DoD 300-block budget of < 2 s. The index cold build is
5.29 ms for 1,000 anchors (guard < 100 ms), and a one-block warm update is 4.55 ms p95 (guard
< 16 ms, `blocksIndexed === 1`, `blocksReused === 99`). A post-fix confirmation run measured
653 ms open to interactive, 108.9 ms keystroke proxy, measure p95 2.2 ms, edge p95 0.5 ms and
reflow p95 0 ms — inside the same band.

### Unanchored seed — `artifacts/perf-before/performance-s*.json`,
`artifacts/perf-after/performance-run*.json`

| Metric | BEFORE | AFTER |
|---|---|---|
| Initial render (300) | 501 ms | 497 ms |
| 1,000-block render | 2,335 ms | 2,364 ms |
| `measure` p95 (300 / 1,000) | 1.1 / 3.4 ms | 1.3 / 3.2 ms |
| `edge` p95 (300 / 1,000) | 0.4 / 1.4 ms | 0.4 / 1.4 ms |
| `reflow` p95 | 0 ms | 0 ms |
| Scroll FPS (300) | 117 | 116 |

No DoD budget regresses. The app-level seed has 36 anchors, not 1,000: the 1,000-anchor cold and
warm guards live in the core benchmark, as plan §5.3 specifies.

### Fixtures and hashes

The app seed is generated at runtime with fresh UUIDs, so its bytes are not stable; its composition
is recorded above and in `artifacts/perf-before/performance-anchors.json` /
`artifacts/perf-after/performance-anchors-final*.json`. The checked-in fixtures the index tests read
are unchanged (SHA-256):

```
44b3a67a58a6415d1c00d5ecb7f0f4d1c919386ac2e4e24cfead84d956e04719  fixtures/broken-anchor.json
9d2495f1a4c709356af1fb41a4ca2c7bcc5efa3176ff568bfd09edc5d90324a6  fixtures/deep-chain.json
855f2cd7f0aa3c2cbc6436f5c12e6df9152cf5056ccc21d54b44daa0eb42b1dc  fixtures/defects.json
af9f0b93368b2901b8dda3b6c25c0126f72484be31f76223a297790cbe03ebe5  fixtures/golden-eigenvalues.json
bd50502dc467321116e74ff54a87c258802c6c522b958046e47a9b3fe7cdebc1  fixtures/landscape-golden.json
0b1283fb5cd69637fdd637aebaf79086ef71efff4c7adaeedb28b6c1431e717d  fixtures/long-50-pages.json
b061f73be183e62eb5b6ce2f07fbe8b561fbc0f37f0e3ad0427072667977579a  fixtures/m3-anchor-kinds.json
6659da21e9d4782b29a4df72480a4cc6b08be24ef65c55652a432dddce865b9a  fixtures/m3-export-manifest.json
bdae68726f4b566c3ccdc5b44e7549879b95f1e5b9de28abdaebd5e5b3e78947  fixtures/m3-formula-term-edit.json
1d12c6e3ceb2deb05149380f0b504ad2127f2e3c6d65e3b65582c06d9d7db6e8  fixtures/m3-image-regions.json
656b571f6d563ac65346c2ec006132d4b7c1594d2772d1f0b81650568852441d  fixtures/m3-split-merge.json
d9c7ec83e1dbaea8452a2ad89a2e5fa4532ba7d6f27a9d183e6eee29c356bc51  fixtures/scale-300.json
d1fe42b2a5e95a7392c687428b3d1ff2523d0a9087c3ee11a66a28d5ed324e88  fixtures/shared-child.json
4ff109a802a56972b30e10323dbfb7901bec526cc8e4f617385c681ed0bae1fa  fixtures/tables.json
247e5ac83e8b90e36967136014acb68a8c1c3cdb99e174bc4560dc44629510cd  fixtures/wide-fan.json
2eef7bac17f03bba7faf2af0674bc36c72f9fd14bbe2cb15b5e790cfa8f8dd98  fixtures/assets/chart.png
8a51102ebb76052c4d8970739a1d2cb09a4965abca09eab2f8a073c617ff4912  fixtures/assets/forest.avif
2492f7a53cb3fced6fd50d12d994a18891e56945d3a508a593678b31992c6f04  fixtures/assets/forest.png
f5985b660c895a395dd932ae1e86a249444f0b72bc91b4c98ee7fb60bfd77cc0  fixtures/assets/wide.png
```

The parity test also asserts `JSON.stringify(document)` is unchanged after index build + layout for
every fixture, and no `document.json` file is written by the change.

## Acceptance criteria (plan §12)

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | One anchor-index module in core; no rect-count/`occurrenceHint` state derivation in layout or renderer | **Pass** | `anchor-index.ts`; `layout.ts` picker; grep shows no `occurrenceHint` read in layout/renderer state paths (only selector authoring) |
| 2 | `entry(id)` deep-equals `resolveAnchor` for every fixture and a generated 1,000-anchor document | **Pass** | `packages/core/test/anchor-index.test.ts` |
| 3 | One-block update indexes exactly one block, reuses the rest, equals a fresh build | **Pass** | `anchor-index.test.ts`; core benchmark `blocksIndexed === 1`, `blocksReused === 99` |
| 4 | Branch/availability changes flip states with `blocksIndexed === 0` | **Pass** | `anchor-index.test.ts` cache/invalidation tests; session availability test |
| 5 | Index updated before `bumpVersion`/`notify` on commit, structural, undo, redo, reset; accepted prefix on failure | **Pass** | `apps/desktop/test/document-session.test.ts` (ordering probes), including `applyRevision` |
| 6 | Placed anchor state equals the view entry; defects exactly for non-resolved placed anchors; idle gives no attachment/defect | **Pass** | `anchor-view.test.ts`, `anchor-index-parity.test.ts` |
| 7 | Multi-rect resolved → union + last-line attach; zero-rect resolved → block box + one diagnostic, no state change | **Pass** | `anchor-view.test.ts`; owner follow-up puts the fallback callout card at +`calloutCardIndent` and its trunk/edge at +`calloutTrunkInset` |
| 8 | Page dot ⇔ broken/ambiguous on the review fixture; PDF preflight list matches; Continuous unchanged | **Pass** | `m5a-anchor-resolution-review.test.mjs`: after evidence warns only `review-formula` + `review-image`; preflight list matches; every below callout trunk is at block-left + 24; Continuous screenshot unchanged in copy/geometry |
| 9 | Page and PDF show the same state; mismatched view revision throws | **Pass** | `layout.ts` guard; `export-contract.test.ts`; review suite compares Page dots and PDF preflight |
| 10 | Split/merge and image replacement match core in layout and Health | **Pass** | `anchor-index-parity.test.ts` (`m3-split-merge`, image availability change); health fixture parity |
| 11 | Cold build < 100 ms / 1,000 anchors; warm update p95 < 16 ms; Page/Health reads index zero blocks; app before/after recorded; no DoD regression | **Pass** | core benchmark 5.29 ms / 4.55 ms; health test asserts stats unchanged; perf tables above |
| 12 | `document.json` byte-identical; no schema/version change | **Pass** | parity test; no schema file touched; `schemaVersion` stays 2 |
| 13 | Typecheck, unit, e2e, touched UI suites green | **Pass** | `verify:fast`; UI 35/35; full `verify` left to integration |
| 14 | Owner has seen the review screenshots/PDF for §6.3 and the outcome is recorded | **Pass** | Owner review: union-box callout accepted; ambiguous dot intended; two callout-lane regressions fixed and re-captured |

## Review package

Fixture and suite:

- `tests/support/anchor-review-fixture.mjs` — five cases + control, with real asset bytes.
- `tests/ui/m5a-anchor-resolution-review.test.mjs` — Continuous/Page/PDF comparison; default run is
  the acceptance gate, `ANCHOR_REVIEW_BEFORE=1` captures the pre-index evidence.

Evidence (`artifacts/` is git-ignored, present in this worktree):

| File | What it shows |
|---|---|
| `artifacts/anchor-review/before-continuous.png` | pre-index Continuous |
| `artifacts/anchor-review/before-page-read.png` | pre-index Page Read |
| `artifacts/anchor-review/before-anchor-review.pdf` | pre-index exported PDF |
| `artifacts/anchor-review/before-pdf-001.png`, `before-pdf-002.png` | pre-index PDF pages (120 dpi) |
| `artifacts/anchor-review/before-evidence.json` | before: dots on `review-idle` + `review-selector` |
| `artifacts/anchor-review/after-continuous.png` | post-index Continuous (unchanged) |
| `artifacts/anchor-review/after-page-read.png` | post-index Page Read |
| `artifacts/anchor-review/after-anchor-review.pdf` | post-index exported PDF |
| `artifacts/anchor-review/after-pdf-001.png`, `after-pdf-002.png` | post-index PDF pages (120 dpi) |
| `artifacts/anchor-review/after-evidence.json` | after: states, dots on `review-formula` + `review-image` only, callout card geometry and `calloutTrunks` (all below trunks x = 24) |

The before/after inversion is the plan §6.1 evidence: the old rect-count derivation dotted the idle
and selector-only blocks and resolved the ambiguous formula and changed image; the index dots the
last two and leaves the first two clean. After the product-owner review fixes, the ambiguous/broken
cards are back in the before below lane (Page fragment boxes: formula callout +61.8 px from its
parent's left, image +37.0 px; the warning point is far right) and the selector-only card is at
+37.0 px from its parent's left, i.e. the callout indent, not the page content left. The image
card was +8.8 px before the lane clamp; at +37.0 it matches the selector lane and sits right of the
+24 trunk. Every below
callout trunk now starts at `x + 24` (page-local `data-page-trunk-x = 24` for the multi-node,
formula, image, selector and control cases), instead of the block border. The multi-node union-box
callout is accepted as is. The two plan §6.3 questions are resolved by the owner; the callout lane
and trunk fixes are the recorded outcome.

## Risks and open questions

- **Owner review outcome.** The multi-node union-box callout is accepted and the ambiguous/broken
  dot is intended. The first cut pushed those cards to the warning point and put the selector-only
  card at the page content left; the card lanes and the below trunk inset are fixed (see the
  follow-up section). The branch is ready for the Orchestrator's full verify and merge.
- **Keystroke proxy.** The app-level 102–105 ms is a click-to-first-paint sample on a 342-block seed,
  not the DoD's typing p95; the DoD 50 ms figure was already above budget before this change. The
  comparative medians are flat (+2.5 ms). The core reflow/measure counters and `verify:fast`/UI
  timings show no regression.
- **1,000-anchor app seed is not added.** The anchored seed has 36 anchors so the app budgets stay
  comparable to the existing 300-block scenario; the 1,000-anchor cold/warm budgets are guarded in
  the core benchmark. If the Orchestrator wants an app-level 1,000-anchor number, adding a second
  seeded document is a seed-only change.
- **Save revision refresh.** `applyRevision` now re-runs resolution over the same document to advance
  the view revision (no block rebuild). This is one extra resolution pass per save; it was not
  separately perf-guarded. If the Sentinel objects, the alternative is a dedicated
  `AnchorIndex.withRevision` read, which would be an interface addition.
- **Remaining per-result block builds.** `page/find-page-ranges.ts` still builds a block index per
  find result for Page highlight ranges, and `editor/find-decorations.ts` must read the live editor
  buffer (explicit non-goal). Neither derives state; both are candidates for a later read-through.
- **Test-only resolver fallbacks.** `find`, `document-health`, `anchor-health` and the adapter accept
  an optional index and fall back to the core resolver when a pure test calls them without one.
  Production always passes `runtime.anchorIndex`; the Sentinel may want those fallbacks made
  required once the test call sites are migrated.
- **Print snapshot size.** The view adds every anchor entry (id, state, range) to the IPC snapshot.
  The review fixture is small and the core document has 36 anchors; a 1,000-anchor document would add
  the ranges too. Not measured as a problem here, but the plan's mitigation (`state` + `range.kind`
  only) stays available.
- **`anchorGeometryFallbacks`** is a new `ContinuousLayout` diagnostic array; no UI reads it. It is
  asserted to be empty unless a resolved anchor has no measured rect.

## Next step

1. Orchestrator: hand the review package to the product owner (Continuous / Page Read / PDF) for the
   two §6.3 judgements.
2. Sentinel review against `docs/review-checklist.md`, especially the deleted second derivation and
   the exact defect copy.
3. If accepted, Orchestrator runs the one full `npm run verify` at integration at UI concurrency 4,
   then merges this one commit and removes the worktree.
