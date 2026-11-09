# M4c1 — Page PDF print compositor + Page/PDF seam prerequisites

**Role:** Implementer / Builder  
**Base:** `main` at the M4c1 brief (`ac730ce`; Page checkpoint/F5/F6 code at `6147cf3`)  
**Date:** 9 November 2026  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-10563719-a462a37f908563cc`  
**Branch:** `t3/m4c1-page-print-compositor`

## Summary and scope

Built the print-only Page compositor and closed Sentinel findings **F1–F4** from
`docs/reviews/r2-page-pdf-seam-review.md`.

The compositor renders one fixed page container per `DerivedPage` as a direct
child of the print root. It consumes a complete `PrintModel` built from the same
real `layoutDocument` + `paginate` output as Page Read, plus the same static
Page content projection. It never measures, re-paginates, re-routes, or reaches
into renderer state.

Delivered:

- **F1** — real-layout print parity tests (`apps/desktop/test/print-parity.test.ts`)
  and Page Read vs print-model DOM parity on mode A, B2, stacked, Letter
  landscape, broken-anchor and missing-asset fixtures
  (`tests/ui/m4c1-print-compositor.test.mjs`).
- **F2** — `PrintModel` now carries the resolved `PageSettings`/`PageTheme` and
  `pageCssVariables` map, per-block measurements (segments, table columns,
  content height), the canonical document content used by `buildSegments`,
  resolved/broken/ambiguous anchor attachments, failed/missing assets, blocking
  defects, document/chapter titles, shared page chrome, and edge-label layout.
  The previously unused `document` parameter is stored and used for content and
  pagination validation.
- **F3** — pure `pageChromeLayout`, `pageChromeContent`, and
  `pageEdgeLabelLayout` in `packages/layout/src/page-chrome.ts`; Page Read and
  print both consume them. Positions are unchanged.
- **F4** — deterministic `pageSettingsFingerprint`, carried in the model and
  checked against the page-model run; the layout page setup/geometry must equal
  the resolved settings; supplied pages are re-derived with the resolved manual
  breaks and compared. Mismatch throws
  `PrintModelSettingsMismatchError` instead of printing a different page count.
- A print entry point M4c2 can load: `apps/desktop/src/renderer/print.html` +
  `window.__noteforestPrint.render({ model, assets })`, with no export job,
  `printToPDF`, output path, or job state added.

Out of scope and untouched: M4c2 export orchestration, M4c3 50+ page/raster/
Notability gate, Settings/manual-break UI, R3/R4, full-codebase refactor,
spec/UX/ADR/plan edits, layout/paginator/PageTheme metric changes.

## Files changed

New:

- `packages/layout/src/page-chrome.ts` — shared chrome geometry/content and
  edge-label layout.
- `packages/layout/test/page-chrome.test.ts` — exact fraction/offset tests.
- `apps/desktop/src/renderer/src/page/projection.ts` — one static Page content
  projection (segments, page blocking, anchor warnings, chrome) used by Page
  Read and print.
- `apps/desktop/src/renderer/src/page/print-model-registry.ts` — active Page
  model snapshot for the print bridge; input gathering only.
- `apps/desktop/src/renderer/src/print/PrintDocument.tsx` — print compositor.
- `apps/desktop/src/renderer/src/print/print.css` — print skin (colours,
  borders, shadows, fixed-sheet breaks only).
- `apps/desktop/src/renderer/src/print/entry.tsx` — print entry bridge.
- `apps/desktop/src/renderer/src/print/test-surface.tsx` — test-only mount of
  the same component.
- `apps/desktop/src/renderer/print.html` — M4c2-loadable surface.
- `apps/desktop/test/print-parity.test.ts` — F1/F3 real-layout parity and
  A5/Letter/portrait/landscape geometry smoke.
- `tests/ui/m4c1-print-compositor.test.mjs` — Page Read vs print DOM parity.
- `docs/reports/m4c1-print-compositor.md` — this report.

Modified:

- `packages/pdf/src/printModel.ts` — complete print model, settings identity,
  chrome/labels, model fingerprint.
- `packages/pdf/test/print-model.test.ts` — rewritten around the real
  `layoutDocument` + `paginate` pipeline; F2 completeness and F4 mismatch tests.
- `packages/layout/src/document.ts` — shared `contentBlockTitle` for chrome
  continuation labels.
- `packages/layout/src/page-settings.ts` — `pageSettingsFingerprint`.
- `packages/layout/src/paginator.ts` — shared `blockingDefects` and
  `pageBlockingDefects` (same predicate Page Read already used).
- `packages/layout/src/index.ts` — export the new shared modules.
- `apps/desktop/src/renderer/src/page/PageView.tsx` — uses the shared
  projection/chrome; Page geometry and interactions unchanged.
- `apps/desktop/src/renderer/src/page/PageEdges.tsx` — uses the shared label
  layout; optional resolved labels for print.
- `apps/desktop/src/renderer/src/page/model.ts` — model carries document,
  manual-break warnings, and settings fingerprint; re-exports shared helpers.
- `apps/desktop/src/renderer/src/page/usePageModel.ts` — exposes the completed
  run records.
- `apps/desktop/src/renderer/src/App.tsx`, `global.d.ts` — test bridge
  `renderPrint`/`clearPrint`.
- `apps/desktop/src/renderer/src/main.tsx` — loads the print skin so the test
  host uses the same styles.
- `apps/desktop/electron.vite.config.ts` — `print.html` renderer input.
- `package.json` — M4c1 UI suite added to `test:ui` and `verify`.

## Checks run, with real timings

- Targeted unit:
  `npx vitest run packages/pdf/test packages/layout/test apps/desktop/test`
  — **92 files / 904 tests pass**, vitest **2.26 s**.
- New unit suites:
  - `packages/pdf/test/print-model.test.ts` — 9 tests.
  - `packages/layout/test/page-chrome.test.ts` — 4 tests.
  - `apps/desktop/test/print-parity.test.ts` — 12 tests.
- M4c1 UI:
  `node --test tests/ui/m4c1-print-compositor.test.mjs` — **5/5 pass**, 0
  pageErrors, **11.15 s**.
- Regression UI rerun (M4b1, R2g, R2i, R2j):
  - M4b1 page view — 9/9.
  - R2g trunk continuity — 2/2.
  - R2i subtree wrap — 6/6.
  - R2j callout modes — 5/5.
  - M4b1b1 Page Edit overlay — 8/8 (after preserving immediate post-commit
    card content in Page Read).
  - R1b/R2a/R2b/R2d/R2e/R2f/M4b1a2 — all suites pass.
- Final `npm run verify:fast` — **exit 0**, **53.20 s** wall:
  - architecture boundaries: **153 files / 740 imports / 16 rules**, no
    violations;
  - typecheck: all four workspaces pass;
  - unit: **92 files / 904 tests**, **2.41 s**;
  - critical e2e: **16/16 pass**, **44.64 s**, 0 pageErrors.
- No fixed sleeps, no native dialogs, no screen recordings.
- Full `npm run verify` is intentionally left to the Orchestrator.

## F1–F4 closure evidence

### F1 — real-layout parity

- `apps/desktop/test/print-parity.test.ts` runs the real `layoutDocument` +
  `paginate` pipeline for:
  - mode A (A4 landscape 12 mm),
  - mode B2 (A5 portrait 12 mm),
  - explicit stacked (A5 portrait 46 mm, `pagePacking: 'stacked'`),
  - an R2i subtree-wrap case,
  - continuation/cross-page reference pages.
- For every case it builds `buildPrintModel` and compares against the exact
  `projectPageContent` projection Page Read calls:
  - page count, page numbers, fragments and page boxes, continuation
    records;
  - edges, group trunks, routes (deep-equal shared `buildPageEdgeModel`
    records), `pageNumberByBlock`, and defects;
  - chrome positions/text, edge-label records, page-blocking defects;
  - the static segment lists and card HTML built from the print model's own
    document/measurement records.
- `tests/ui/m4c1-print-compositor.test.mjs` compares the mounted Page Read DOM
  with the print DOM page by page: sheet attributes, content box, fragment
  attributes/boxes, card `innerHTML`, edge/trunk SVG structure and paths,
  `← p.N`/`→ p.N` labels, header/footer/ghost/continues text and styles.
- Mode A/B2/stacked, Letter landscape, and broken-anchor/missing-asset
  fixtures are covered. R2i is covered at the model/projection/segment level.

### F2 — print model completeness

`PrintModel` now carries:

- `settings`, `fingerprint`, `cssVariables` (resolved theme, never the
  stylesheet fallback);
- `document` (canonical content used by `buildSegments`) and `revision`;
- `blocks[blockId].measurement` (segments, content height, table columns);
- `anchors` (all attachments with `resolved`/`broken`/`ambiguous` state) and
  per-page `anchorWarnings`;
- `failedAssetIds`, `missingAssetIds`, filtered `assetUrls`;
- `blockingDefects`, all `defects`, and `manualBreakWarnings`;
- per-page `chrome` (shared margin-band positions, document/chapter titles,
  page label, continued-from/continues-on text);
- per-page `edgeLabels` (text, accessible label, left/right/top/maxWidth);
- existing pages/fragments/edges/trunks/geometry.

`PrintDocument` takes only `model` and an optional assets map and calls the
shared projection; it has no renderer-state reach-in. The unused `document`
argument is now stored and used for pagination validation and content.

### F3 — shared chrome and labels

- `pageChromeLayout(geometry)` returns the exact margin fractions previously
  inline in `PageView` (`0.3/0.62` top, `0.3/0.6` bottom, margins left/right).
- `pageEdgeLabelLayout(edges, geometry)` returns the exact offsets previously
  inline in `PageEdges` (`-margin+2`, `max(18, margin−4)`).
- Page Read (`PageView`/`PageEdges`) and print (`PrintModel`/`PrintDocument`)
  consume these functions/records.
- `packages/layout/test/page-chrome.test.ts` asserts the exact fractions and
  offsets; the parity tests assert print chrome/labels deep-equal Page Read
  records; the UI test compares the rendered styles/text.
- All existing Page UI suites are green, so Page Read positions are unchanged.

### F4 — settings/manual-break identity

- `pageSettingsFingerprint(settings)` is deterministic over page setup, theme,
  and `manualBreakBeforeBlockIds`.
- `buildPrintModel` checks the optional page-model fingerprint, the layout
  page setup, and the layout geometry against the resolved settings.
- It re-derives pagination with `paginate(layout, document, { manualBreakBeforeBlockIds })`
  (the same paginator, no second implementation) and compares a full page/
  fragment/continuation signature against supplied pages.
- Mismatch throws `PrintModelSettingsMismatchError` with the resolved
  fingerprint.
- Tests cover a different page setup, different manual breaks, a stale
  page-model fingerprint, and the valid matching fingerprint.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| F1 real `layoutDocument` + `paginate` parity; print vs Page Read/Edit page count, fragments, edges, trunks, routes, page numbers | Pass | `print-parity.test.ts` (12), M4c1 UI (5) |
| F2 print model carries theme/CSS, measurements/table columns, anchors/failed assets, document/segments, chrome; no renderer-state reach-in | Pass | PDF completeness test; `PrintDocument` props; projection |
| F3 shared `pageChromeLayout`/edge-label layout; Page Read positions unchanged; parity test | Pass | `page-chrome.test.ts`; parity/UI tests; Page UI suites |
| F4 resolved settings/manual-break fingerprint; mismatch fails loudly; test | Pass | three mismatch tests; fingerprint field |
| One fixed page container per derived page; no CSS re-pagination; no wrapper drift | Pass | UI structure assertions; root direct `section`s; `print.css` fixed size/breaks only |
| Print metrics equal Page Read; print skin changes colours/borders/shadows only | Pass | UI sheet/content/fragment style + card HTML equality; print.css contains no metric declaration |
| Same static segments, edges/trunks, continuation/ghost, reference chips, broken/missing markers | Pass | UI SVG/card/chrome/label parity + marker fixture |
| A5/Letter/portrait/landscape geometry smoke; page count equals paginator | Pass | 6 setup smoke cases in `print-parity.test.ts`; A5 B2 and Letter UI |
| Targeted tests + one `npm run verify:fast` with real timings | Pass | above |
| Report maps every criterion and lists risks | Pass | this report |

## Page count/geometry/parity evidence

| Fixture | Page setup | Content box (px) | Page Read count | Print count |
|---|---|---:|---:|---:|
| Callout mode A | A4 landscape, 12 mm | 1031.81 × 702.99 | 1 | 1 |
| Callout mode B2 | A5 portrait, 12 mm | 468.66 × 702.99 | 1 | 1 |
| Stacked fallback | A5 portrait, 46 mm | 211.65 × 445.98 | 2 | 2 |
| Letter landscape | Letter landscape, 12 mm | 965.29 × 725.29 | asserted equal | asserted equal |
| Broken anchor + missing asset | A4 landscape, 12 mm | 1031.81 × 702.99 | asserted equal | asserted equal |

The M4c1 UI test asserts, for every page: identical sheet width/height and
margin attributes, identical content box, identical fragment attributes and
card HTML, identical edge/trunk/label records, and identical chrome. The
compositor root has exactly `pageCount` `.nf-print-sheet` children directly
under it (plus the generated `@page` style element; no wrapper).

Evidence artifacts:

- Screenshot: `artifacts/m4c1/ui/print-compositor-a-1440x900.png`.
- M4c1 Page Read counts/geometry cross-checked against the committed R2j UI
  evidence JSONs (`artifacts/r2j/page-callout-modes-*.json`).
- `docs/reports/m4c1-print-compositor.md` (this report).

## Open questions / risks

1. **Theme identity beyond page setup.** F4 detects a different page setup,
   geometry, manual-break set, and stale page-model fingerprint. A caller that
   deliberately pairs a layout measured under a different theme with the same
   page setup *and* a fabricated matching fingerprint cannot be detected without
   recording the resolved `LayoutOptions` on `ContinuousLayout` (F7/F9 token
   inventory territory). The in-app path shares one resolved settings object
   and fingerprint from `computePageModel`, so this is a contract-hardening
   follow-up, not a current seam.
2. **One validation re-pagination.** `buildPrintModel` runs the shared
   `paginate` again to prove manual-break/page identity. It is the same
   paginator, not a second implementation, and it runs once per model build;
   carrying the pagination options on `PaginatedDocument` could remove the
   extra pass later.
3. **M4c2/M4c3 remain the real print gate.** The print DOM is mounted in the
   app window for parity tests; hidden `BrowserWindow`, `printToPDF` options,
   font/image settle, local asset protocol, atomic output, vector/PDF raster
   parity, and the 50+ page gate are M4c2/M4c3.
4. **Print `@page` size.** The compositor emits a fixed `@page` size from the
   resolved geometry and one forced break between fixed sheets. It does not
   fragment content. M4c2 must use `preferCSSPageSize`, scale 1, and zero
   print margins as planned.
5. **No metric changes.** `print.css` adds only colours/borders/shadows and
   fixed-sheet break rules. Font sizes, line heights, padding, card/content
   geometry, and edge metrics stay in the Page styles/theme.
6. **Manual-break semantics F11 unchanged.** This task does not add a
   manual-break UI; mode-A callout semantics remain the documented follow-up.
7. **F5/F10/F11 product decisions** remain outside this task; nothing here
   changes callout topology or anchor association.

## Next suggested step

Orchestrator: run one full `npm run verify` at integration, then hand M4c1 to
a targeted Sentinel check for F1–F4 (and the print seam) before starting M4c2
export orchestration.
