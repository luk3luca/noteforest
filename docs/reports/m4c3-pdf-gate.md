# M4c3 — 50+ page PDF gate + M4c2 S2 entry fixes

**Role:** Implementer / Builder
**Base:** `main` at `911695e` (M4c2 integration `322d132`, M4c2 Sentinel review, M4c3 brief)
**Date:** 9 November 2026
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-e9c9538d-7ea07b043bba15ae`
**Branch:** `t3/m4c3-pdf-gate`
**Head:** the tip of `t3/m4c3-pdf-gate` (SHA in the handback message).

## Summary and scope

M4c3 closes the three M4c2 S2 entry conditions and proves the final Page PDF on
the real hidden-window/printToPDF pipeline:

- **S2-1** — a truly blank produced page now fails the export. Blank is
  classified from the model (no fragments, edges/trunks, or image fragments) and
  from produced-PDF ink (text items, image XObjects, vector paths); an
  image-only page remains valid.
- **S2-2** — a dimensioned image whose bytes disappear after open is detected by
  the print settle, surfaced as a `failed-asset` warning, and re-rendered as the
  app `nf-missing-asset` placeholder. The 28×32 browser broken-image XObject is
  never printed.
- **S2-3** — `pdfjs-dist` is now a runtime dependency of the app, with an
  `asarUnpack` entry for a future packager, and a staged packaged-runtime smoke
  test exports and inspects a real PDF outside the repository's
  `node_modules`.
- A 50+ page A4 gate fixture covers body/headings/lists/quotes, 50+ line code,
  inline/display KaTeX, real/missing/region-anchored images, a table crossing
  pages, anchored callouts, wrapped children/trunks, a broken anchor, and five
  chapters.
- The gate verifies page count, page size/orientation/margins, no blank/cut
  content, text extraction, no replacement glyphs, embedded fonts,
  continuation/ghost markers, semantic trunks, Page Read/PDF label parity at
  1.0 mm, A5/Letter smoke, packaged export, and 300/1,000-block performance.
- Cheap S3 hardening is folded: required `layoutOptions`, summary shape/identity
  validation, sender/package binding, output-path confinement, exclusive temp,
  atomic no-clobber, fsync/stale cleanup, redirect/crash handling, settle
  warnings, model/ink sentinels, hidden-window console errors, the failure
  matrix, and typed render failures.

Out of scope and untouched: Settings/manual-break UI, R3/R4 milestones,
full-codebase refactor, external `export.pdf` API, user-facing export menu/save
dialog, layout/paginator/PageTheme metric changes, merge/push/PR.

## Files changed

New:

- `apps/desktop/test/export-contract.test.ts` — runtime summary guard tests.
- `apps/desktop/test/export-service.test.ts` — snapshot sender/package/timeout
  binding tests.
- `tests/support/m4c3-fixtures.mjs` — gate, dimensioned-asset, packaged-smoke,
  and 300-block fixtures (content-addressed real assets).
- `tests/ui/m4c3-pdf-gate.test.mjs` — 50+ page A4 gate, Page Read parity,
  A5/Letter smoke, S2-2 deleted asset, document-not-open, 300-block timing.
- `tests/ui/m4c3-packaged-export.test.mjs` — staged packaged-runtime export and
  PDF inspection.
- `docs/reports/m4c3-pdf-gate.md` — this report.

Modified (main/shared):

- `apps/desktop/src/shared/export.ts` — `PrintRunPageSummary`,
  `PrintRunModelChecks`, `imagesSettled`/`fontsSettled`/`consoleErrors`/
  `printOverflowPages`, `render-error`, runtime `isPrintRunSummary`, job-view
  settle fields.
- `apps/desktop/src/main/export-preflight.ts` — expected-geometry identity,
  print-time overflow blocking, settle/console/unplaced warnings, model
  segment-coverage error, S2-1 blank classification, image/path ink.
- `apps/desktop/src/main/export-job.ts` — source-package path confinement,
  exclusive temp writer, `link` no-clobber for `overwrite:false`, directory
  fsync, stale-partial cleanup, summary guard, rendered/metrics requirement,
  typed model/render failures.
- `apps/desktop/src/main/export-service.ts` — sender/package snapshot binding,
  injectable snapshot timeout, sender-gated IPC.
- `apps/desktop/src/main/export-window.ts` — summary guard, `will-redirect`
  denial, `render-process-gone` fast failure, console capture, abort
  listener/snapshot release.
- `apps/desktop/src/renderer/src/print/entry.tsx` — per-page model summary,
  model segment sentinels, image settle failure ids + placeholder re-render,
  settle flags, print-overflow detection, typed render errors.
- `apps/desktop/src/renderer/src/App.tsx`, `global.d.ts` — test-only
  `pageModelPages` bridge for representative-page selection.
- `packages/pdf/src/verifyPdf.ts` — text/image/path ink counts and
  `hasOperatorList`.
- `packages/pdf/src/printModel.ts` — `layoutOptions` required (S3-1).
- `packages/pdf/test/print-model.test.ts` — S3-1 test.
- `apps/desktop/test/export-job.test.ts`, `export-preflight.test.ts` — S2-1,
  S3-2, S3-3, S3-8 and settle tests.
- `scripts/lib/pdf.mjs` — matching ink counts for test evidence.
- `apps/desktop/package.json` — `pdfjs-dist` runtime dependency and
  `asarUnpack`.
- `apps/desktop/electron.vite.config.ts` — comment corrected to runtime
  dependency.
- `package.json`, `package-lock.json` — M4c3 UI suites in `test:ui`/`verify`.

## Checks run with real timings

Final `npm run verify:fast` — **exit 0**, **52.0 s** wall:

- architecture boundaries: **160 files / 783 imports / 16 rules**, no
  violations.
- typecheck: all four workspaces pass.
- unit: **97 files / 959 tests**, **2.42 s** (baseline 95/939).
- critical e2e: **16/16 pass**, **43.74 s**, 0 pageErrors.

Targeted suites:

- `node --test tests/ui/m4c3-pdf-gate.test.mjs` — **3/3 pass**, suite
  **11.87 s**, wall **19.28 s**, 0 pageErrors. Gate export **8.6 s**,
  S2-2 **0.74 s**, 300-block **2.36 s**.
- `node --test tests/ui/m4c3-packaged-export.test.mjs` — **1/1 pass**, suite
  **0.78 s**, wall **1.28 s**.
- `node --test tests/ui/m4c1-print-compositor.test.mjs` — **6/6 pass**, suite
  **3.83 s**, wall **11.94 s**.
- `node --test tests/ui/m4c2-pdf-export.test.mjs` — **7/7 pass**, suite
  **5.23 s**, wall **13.39 s**.
- Targeted unit bundle (`export-*`, `print-model`) — **58 tests**, 382 ms;
  final unit run 959 tests.

No fixed sleeps, no native dialogs, no screen recordings. The E2E dialog guard
was asserted empty after the gate and packaged exports.

## S2 closure evidence

### S2-1 — blank page is an export failure

- `PrintRunSummary.pages` carries per-page `fragments`, `edges`, `trunks`,
  `images`, and `empty` (no fragments/edges/trunks/images).
- `validateProducedPdf` fails `blank-page` when the model page is empty or when
  the produced page has no text items, no image XObjects, and no vector paths.
  An image-only page is valid; the cheap text check remains a `textless-page`
  warning.
- Job test: a truly blank produced page fails `validation-failed` with no output
  and no temp file; an image-only page completes with a `textless-page` warning.
- Preflight test: model-empty page fails; image-only page passes; chrome-only
  text does not hide an empty model page.

### S2-2 — dimensioned asset failure

- `settleImages` queries every rendered `img[data-asset-id]`, waits for
  load/error/decode within the bound, and returns failed asset ids.
- `entry.tsx` re-renders the print document with failed ids removed from the
  asset map (a fresh object, so the projection memo invalidates), which renders
  the app `nf-missing-asset` placeholder instead of the browser broken glyph.
- Failed ids merge into `PrintRunSummary.failedAssetIds`; the main process
  surfaces `failed-asset` warnings.
- Real UI test: open a document with a real 640×360 forest asset in a
  dimensioned 560×315 image, wait for the editor image to load, delete
  `assets/<sha256>`, export. Result: job `done`, `failed-asset` warning naming
  the hash, PDF text `Missing image: Forest plot`, **0 image XObjects** (no
  28×32 broken glyph), 57 KB PDF.

### S2-3 — packaged inspector

- `pdfjs-dist` is a dependency of `@noteforest/desktop` (not only a root
  devDependency); `asarUnpack` covers `node_modules/pdfjs-dist/**`.
- The packaged smoke stages `apps/desktop/out`, a minimal `package.json`, and
  `node_modules/pdfjs-dist` in a temp directory **outside the repository**, then
  launches Electron, opens a fixture with a real image/KaTeX/code/table, exports
  through the hidden window, and inspects the produced PDF with
  `pdfjs-dist`. It passes; the staged app has no path to the repository's
  `node_modules`.
- Real asar/notarization/signing remains a Docs/Release step; the
  `asarUnpack` entry and this harness are the closest in-repo proof.

## Gate matrix

| Check | Result | Evidence |
|---|---|---|
| 50+ page A4 fixture, page count = paginator | **Pass** | A4 portrait 20 mm: **61** model pages = **61** PDF pages; PDF 814,586 B; 134,118 extracted chars. `artifacts/m4c3/gate/gate-a4-portrait.pdf`; `gate-evidence.json`. |
| Page size/orientation/margins | **Pass** | Every PDF page within 0.25 mm of 210 × 297 mm; content labels stay inside the 20 mm margins on representative pages. |
| No blank/cut content | **Pass** | No blank page; model segment coverage OK; all **310** block labels extracted; table spans **2** pages; long anchored code branch spans **2** pages; preflight blocks defects/overflow. |
| Text extraction | **Pass** | Body, headings, nested lists, quotes, code, table, labels, callouts, chapter titles, continuation/ghost text; no replacement glyphs (`missingGlyphCount` 0). |
| Fonts embedded | **Pass** | 70 `/Type /Font` objects, 5 `/FontFile2` programs in the gate PDF. |
| Continuation/ghost/trunks | **Pass** | PDF text contains `continues on page` and `continued from page`; representative pages carry 2 trunks (page 1) and 3 edges + 1 trunk (page 38); every page has vector paths. |
| Broken/missing markers | **Pass** | `anchor-warning` for `f2-b196` and `m4c3-broken-parent`; `missing-asset` for `missingForest` and `m4c3-missing-asset`; placeholder text printed. |
| Page Read/PDF parity at 1.0 mm | **Pass** | Representative pages 1, 4, 38, 61: max delta **0.39 mm** (0.39/0.20/0.39/0.31); 6–10 text geometry items per page. |
| A5/Letter smoke | **Pass** | A5 landscape **134** pages (1.00 MB), Letter portrait **61** pages (827 KB), matching sizes and no glyph/blank failures. |
| 300-block performance | **Pass** | **524 ms** wall, 27 pages, measure 48.0 ms, settle 25.5 ms, 442 KB, 0 warnings. Budget target 10 s. |
| 1,000-block measurement (manual probe) | **Pass** | **1,004 ms** wall, 50 pages, measure 115.7 ms, settle 53.4 ms, 1.5 MB, 0 warnings. |
| Packaged export | **Pass** | Staged app outside repo: 2 pages, 931 chars, 1 real image, 0 glyphs, 273 KB; no native dialog. |
| No network/native dialogs | **Pass** | E2E dialog guard empty; hidden window denies navigation/redirect/window-open/permissions; local CSP. |
| Product-owner PDF/rasters | **Provided** | See evidence paths below; subjective visual/Notability check remains the product owner's. |

## Product-owner evidence paths

- Main 61-page A4 PDF:
  `artifacts/m4c3/gate/gate-a4-portrait.pdf`
- A5 landscape (134 pages):
  `artifacts/m4c3/gate/gate-a5-landscape.pdf`
- Letter portrait (61 pages):
  `artifacts/m4c3/gate/gate-letter-portrait.pdf`
- S2-2 deleted-asset placeholder PDF:
  `artifacts/m4c3/gate/deleted-dimensioned-asset.pdf`
- 300-block PDF:
  `artifacts/m4c3/gate/scale-300-a4.pdf`
- 1,000-block probe PDF:
  `artifacts/m4c3/probe-1000/scale-1000.pdf`
- Packaged smoke PDF:
  `artifacts/m4c3/packaged/packaged-export.pdf`
- Rasters (150 dpi):
  `artifacts/m4c3/raster/gate-a4-001.png`,
  `gate-a4-002.png`,
  `gate-parity-001.png`,
  `gate-parity-004.png`,
  `gate-parity-038.png`,
  `gate-parity-061.png`
- Machine evidence:
  `artifacts/m4c3/gate/gate-evidence.json`

The artifacts directory is gitignored; the files are in the worktree above.

## S3 folded/deferred

| Finding | Status | Notes |
|---|---|---|
| S3-1 optional `layoutOptions` | **Folded** | `undefined` is a theme mismatch; test added. |
| S3-2 summary/sender/package binding | **Folded** | `isPrintRunSummary` guard, expected geometry in main, rendered/metrics required, sender/package snapshot binding, sender-gated IPC; tests. |
| S3-3 output path/atomicity | **Folded** | Output inside the document package rejected; exclusive `wx` 0o600 temp; `link` no-clobber for `overwrite:false`; file+directory fsync; stale `.partial` cleanup; tests for path, exclusive temp, race, stale cleanup. |
| S3-4 redirect/crash/listener | **Folded** | `will-redirect` denied; `render-process-gone` fails fast; abort listener removed and snapshot nulled on dispose; no dedicated Electron crash/redirect test. |
| S3-5 settle timeouts | **Folded** | `imagesSettled`/`fontsSettled` and failed ids surface as warnings; job view carries the flags. |
| S3-6 model/raster sentinels | **Folded** | Model page/segment checks, PDF text/image/path ink, hidden-window console errors, real image/math/code/table fixture, failure matrix. The "raster" definition is model + PDF operator ink, not a pixel raster scan. |
| S3-7 test/evidence gaps | **Folded** | Real gate fixture, S2-2 dimensioned deleted asset, document-not-open, output race/source protection, snapshot timeout, render error, reproducible rasters/evidence. |
| S3-8 typed render failure | **Folded** | `render-error` code; unit test. |
| R9 300/1,000 timing | **Measured** | 300-block committed test; 1,000-block manual probe. |

No S3 item is silently deferred.

## Open questions / risks

1. **Image region/point anchor geometry in Page/PDF.** The gate fixture carries
   real image region and point anchors with primary callouts; the branches export
   once and the callout text is in the PDF. The layout `AnchorRecord` exposes the
   whole image box, so the Page/PDF arrow target is the image box rather than
   the exact region/point. The editor keeps precise region geometry; carrying it
   into the page/print anchor model is a follow-up (M4d or a targeted image-anchor
   slice). No product decision is required for this gate, but the product owner
   should confirm the visual expectation.
2. **Packaged asar/signing.** The packaged smoke stages `out` +
   `node_modules/pdfjs-dist` outside the repo. A real asar/notarization build is
   a Docs/Release step; `asarUnpack` is configured for pdfjs-dist.
3. **Output file mode.** The atomic temp is created 0o600 and the final PDF keeps
   that mode (owner-readable). If the product owner wants a group-readable
   0o644 export, add a chmod after the link/rename.
4. **S3-4 crash/redirect tests.** The handlers are code-reviewed and typechecked,
   but a deterministic Electron crash/redirect harness is not in this suite; a
   future hardening slice can add one.
5. **Raster parity definition.** The gate compares Page Read text geometry
   (labels, header, footer) to PDF text items, matching the ADR-0002/Spike 1
   methodology (1.0 mm; observed max 0.39 mm). Raster PNGs are visual evidence,
   not a pixel-diff oracle.
6. **Table/code atomicity evidence.** The gate asserts table/code span multiple
   pages and the model segment coverage is complete; the paginator's
   `assertSegmentsAtomic` unit test covers the committed 50-page base fixture.
   There is no per-row/per-line PDF sentinel beyond the text sentinels.
7. **1,000-block timing.** The committed performance test is 300 blocks; the
   1,000-block probe is manual evidence. If a committed 1,000-block gate is
   wanted, it can reuse the `performance-1000` seed.
8. **Root `pdfjs-dist` devDependency.** It remains for Node scripts/tests; the
   app now also declares it as a runtime dependency. Both use the same pinned
   version.

## Acceptance criteria mapping

- [x] S2-1 true blank page fails; image-only page valid; tests.
- [x] S2-2 dimensioned asset failure warns and prints the app placeholder; real
      deleted-asset UI test; no broken-image glyph.
- [x] S2-3 packaged app can inspect an exported PDF; pdfjs runtime shipped.
- [x] 50+ page A4 fixture covers the content matrix; page count = paginator.
- [x] Page size/orientation/margins match; no blank/cut content.
- [x] Text extraction complete, no replacement glyphs; fonts embedded.
- [x] Continuation/ghost/trunks/broken/missing markers correct.
- [x] Raster/Page Read parity within 1.0 mm on representative pages.
- [x] A5/Letter smoke; 300-block performance measured.
- [x] Packaged-app export works; no network/native dialogs.
- [x] Product-owner PDF/rasters provided for visual/Notability check.
- [x] S3 items folded or explicitly deferred.
- [x] `npm run verify:fast` green with real timings; full verify is the
      Orchestrator's integration step.
- [x] Report maps every criterion and lists risks.
