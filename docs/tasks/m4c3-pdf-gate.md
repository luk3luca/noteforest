# M4c3 — 50+ page PDF gate + M4c2 S2 entry fixes

**Role:** Builder / Implementer  
**Milestone:** M4c3 (final Page PDF gate); M4c2 is merged, M4c3 closes its S2 findings and proves the 50+ page gate  
**Base:** `main` after the M4c2 Sentinel review (`9f46a4d` plus this brief; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 3 days

## Context

M4c1 (print compositor) and M4c2 (export job) are merged and verified. The M4c2
Sentinel returned **accept with findings**, no S1. Three S2 items are M4c3 entry
conditions:

- **S2-1** — a truly blank produced page is only a warning; it must fail the
  export. An image-only page is not blank.
- **S2-2** — a dimensioned image whose bytes disappear/fail after open prints a
  browser broken-image glyph with no warning. It must surface as a warning and
  print the app placeholder.
- **S2-3** — `pdfjs-dist` is a root devDependency and externalized; the packaged
  app must be able to run the produced-PDF inspector.

The R3/R4 S3 findings are hardening/test gaps; fold the cheap ones into this
task or document a deferral. The 50+ page gate is the main deliverable.

## Goal

Prove the final Page PDF on the real compositor/export pipeline:

1. fix S2-1/S2-2/S2-3 first;
2. build a 50+ page A4 fixture covering the content matrix;
3. export it from the production/packaged app through the hidden-window job;
4. verify page count/size/orientation/margins, no blank/cut content, real text,
   fonts, continuation/ghost/trunks, raster/Page Read parity, A5/Letter smoke,
   and the 300-block performance note;
5. provide PDF/rasters for the product-owner visual/Notability check.

The agent provides PDF and raster evidence; the product owner does the
subjective visual and Notability import checks. Do not record the screen.

## Phase 1 — M4c2 S2 fixes (entry conditions)

### S2-1 — blank page is an export failure

- Define blank from the model (page has no fragments, no edges/trunks, no image
  fragments) or a raster ink check; do **not** treat `text.trim() === ''` as
  blank because image-only pages are valid.
- Make a true blank page an error that blocks the write; keep textless
  image-only pages valid.
- Add unit/UI failure tests; update the produced-PDF validation and job result.
- Keep the existing cheap text check as a warning/heuristic, not the final
  blank definition.

### S2-2 — dimensioned asset failure

- `imageAssetIdsToPreload` skips images with declared width/height, so their
  bytes are never decoded and a post-open delete is invisible. Make the print
  settle detect load/decode failure for dimensioned images and return failed
  asset ids.
- Merge those ids into the print summary/model failed assets and job warnings.
- Render the app `nf-missing-asset` placeholder instead of the browser
  broken-image glyph; never print the 28×32 broken-image XObject.
- Add a real UI test: open a document with a real dimensioned image, delete the
  asset after open, export; assert warning + placeholder, no broken glyph, no
  silent `done` with no warning.

### S2-3 — packaged inspector

- Make `pdfjs-dist` a runtime dependency of the app (or bundle it), configure
  `asarUnpack`/worker/legacy assets as required, and prove the packaged app can
  inspect an exported PDF.
- A packaged export smoke test (or the closest asar/packaged harness) is part of
  the gate. Document any packaging step that needs Docs/Release.

## Phase 2 — 50+ page A4 fixture

Create a committed fixture (or generator) with at least 50 A4 pages covering:

- body text, headings, nested lists, blockquotes;
- long code (50+ lines) and inline code;
- inline/display KaTeX including λ, ∑, fractions;
- images at print resolution, missing placeholder, image region/point anchors;
- tables crossing pages only between rows;
- anchored callouts and wrapped children continuing across pages;
- semantic group trunks (right/below/B2) continuing across pages;
- a broken-anchor marker;
- multi-chapter content and page chrome;
- a 300-block performance variant (1,000 usable is a product limit; measure if
  feasible).

A5 and Letter spot checks, portrait/landscape. Keep the full A4 50+ page gate
mandatory; A5/Letter are smoke checks unless a defect appears.

## Phase 3 — gate checks and evidence

- PDF page count equals the paginator/model; page size/orientation/margins
  match the resolved setup; no unexpected blank page; no cut line/image/
  formula/code line/table row.
- Text extraction (`pdfjs-dist`/existing `inspectPdf`; `pdftotext` if
  available) contains all body/label/code/table text; no replacement glyphs;
  font embedding verified (pdfjs font data or `pdffonts` if available).
- Continuation/ghost markers and semantic trunks appear where the paginator
  says; broken-anchor/missing-asset markers are correct.
- Raster parity: Page Read screenshot vs PDF raster at the ADR tolerance
  (1.0 mm) on representative pages; use `scripts/raster-pdf.mjs` or the
  committed equivalent.
- Packaged-app export (not only dev/out): hidden window, fonts, KaTeX, images,
  asset protocol, output path, atomic write.
- 300-block export performance/measurement; document the 300/1,000 budget.
- Notability import and subjective visual check: product owner; provide the
  PDF and rasters.

## Phase 4 — cheap S3 hardening (fold or explicitly defer)

- S3-1: make `layoutOptions` required or treat `undefined` as a mismatch.
- S3-2: validate `PrintRunSummary` shape/finite geometry, `rendered === true`,
  non-null metrics; bind snapshot/window IPC to the requested document/sender.
- S3-3: reject output paths equal to/inside the package; exclusive temp
  creation; atomic no-clobber for `overwrite:false`; fsync/cleanup; source
  package protection.
- S3-4: deny `will-redirect`; handle `render-process-gone`; remove abort
  listeners and snapshot references on dispose/finish.
- S3-5: surface image/font settle timeouts and failed ids as warnings/errors.
- S3-6/S3-7: model/raster sentinels, real image/math/code/table export
  fixtures, hidden-window console errors, failure matrix.
- S3-8: map render/settle exceptions to a typed `model-error`/render code.

If an S3 item is not folded, record it as an explicit follow-up with a reason.

## Out of scope

- Settings UI, manual-break UI, R3/R4 milestones, full-codebase refactor.
- External agent API `export.pdf` (M5); user-facing export menu/save dialog
  (product/UX step; the typed API/test bridge is enough here).
- Changing the layout engine, paginator, PageTheme metrics, Page Read/Edit
  geometry, or the M4c1 composite contract.
- Merge, push, PR, parent-checkout edits.

## Files to read

- `docs/tasks/m4c-pdf-plan.md` — M4c3 gate.
- `docs/reviews/m4c2-export-orchestration-review.md` — S2-1/S2-2/S2-3 and S3.
- `docs/reports/m4c2-export-orchestration.md`, `m4c1-print-compositor.md`.
- `docs/adr/0002-pdf-pipeline.md`, `0007`, `0008`.
- `apps/desktop/src/main/export-preflight.ts`, `export-job.ts`,
  `export-window.ts`, `export-service.ts`, `asset-protocol.ts`.
- `apps/desktop/src/renderer/src/print/entry.tsx`, `PrintDocument.tsx`,
  `print.css`; `page/measurement.ts`, `asset-urls.ts`, `projection.ts`.
- `packages/pdf/src/verifyPdf.ts`, `printModel.ts`, `node.ts`.
- `scripts/raster-pdf.mjs`, `fixtures/scale-300.json`, test support/harness.

Expected to touch:

- S2 fixes in `export-preflight.ts`, `export-job.ts`, `print/entry.tsx`,
  `measurement.ts`, `asset-urls.ts`, `print.css`, `packages/pdf` validation.
- New 50+ page fixture/generator and gate tests/scripts.
- `package.json`/packaging config for `pdfjs-dist`.
- `tests/ui/` M4c3 suite; `docs/reports/m4c3-pdf-gate.md`.

## Acceptance criteria

- [ ] S2-1: true blank page fails export; image-only page valid; tests.
- [ ] S2-2: dimensioned asset failure warns and prints the app placeholder;
      real deleted-asset UI test; no broken-image glyph.
- [ ] S2-3: packaged app can inspect an exported PDF; pdfjs runtime shipped.
- [ ] 50+ page A4 fixture covers the content matrix; page count = paginator.
- [ ] Page size/orientation/margins match; no blank/cut content.
- [ ] Text extraction complete, no replacement glyphs; fonts embedded.
- [ ] Continuation/ghost/trunks/broken/missing markers correct.
- [ ] Raster/Page Read parity within 1.0 mm on representative pages.
- [ ] A5/Letter smoke; 300-block performance measured.
- [ ] Packaged-app export works; no network/native dialogs.
- [ ] Product-owner PDF/rasters provided for visual/Notability check.
- [ ] S3 items folded or explicitly deferred.
- [ ] `npm run verify:fast` green with real timings; Orchestrator full verify.
- [ ] Report maps every criterion and lists risks.

## Tests and evidence

- Unit: S2 blank/asset/summary/settle/source-path/redirect tests.
- UI: packaged/real hidden-window export of the gate fixture; failure matrix;
  no breakage of M4c1/M4c2 suites.
- Artifacts: PDFs, rasters, extraction JSON, font list, performance JSON under
  `artifacts/m4c3/`; product-owner PDF path explicit.
- No fixed sleeps, native dialogs, or screen recordings.

## Stop and ask

Stop and report if:

- S2-2 cannot be fixed without changing image measurement/storage contracts;
- S2-3 requires a packaging/signing decision;
- the 50+ page fixture exposes a layout/paginator defect that needs a product
  decision;
- raster parity needs a new renderer/tool or exceeds the ADR tolerance;
- the packaged-app path needs credentials/entitlements;
- the baseline has unrelated failures.

## Report format

- Summary and scope.
- Files changed.
- Checks/timings.
- S2-1/S2-2/S2-3 closure evidence.
- Gate matrix pass/fail (page count, size, cuts, text, glyphs, fonts,
  continuation/trunks, raster parity, A5/Letter, performance, packaged export).
- Product-owner evidence paths.
- S3 folded/deferred list.
- Open questions/risks.
- Worktree path, branch head SHA.
