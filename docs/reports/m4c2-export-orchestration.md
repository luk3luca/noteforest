# M4c2 — PDF export orchestration

**Role:** Implementer / Builder
**Base:** `main` at `4b329d6` (M4c1 print compositor + Sentinel review + M4c2 brief)
**Date:** 9 November 2026
**Worktree:** `a builder worktree`
**Branch:** `t3/m4c2-pdf-export-orchestration`
**Head:** the tip of `t3/m4c2-pdf-export-orchestration` (SHA in the handback message)

## Summary and scope

M4c2 turns the M4c1 print compositor into a real export job. The current
in-memory document revision is snapshotted from the renderer over IPC; a hidden
`BrowserWindow` loads the production `print.html`, measures that snapshot itself
(`createDomPageMeasurement` + `computePageModel`), builds the print model from
the same run, renders the fixed sheets, and resolves only after React commit,
fonts, KaTeX fonts, every image `decode()`, and two animation frames. The main
process prints with Electron `webContents.printToPDF`, validates the produced
PDF (`inspectPdf`: page count, page size, real text, blank pages), writes a temp
file in the output directory, and renames atomically. Failures and cancellation
delete the temp file and never touch the document.

The export does **not** depend on PageView being mounted: the tests export from
the default Continuous surface with no `.nf-page-view` in the document.

Delivered:

- **R1** — required measured-run/settings fingerprint (`PrintModelOptions`
  `pageModelFingerprint`), resolved `LayoutOptions` carried on
  `ContinuousLayout` and compared, document id/revision identity checks, and
  mismatch tests.
- **R2** — on-demand hidden-window model source from the current document
  snapshot (unsaved edits and revision included), render-settled handshake
  (`build()` promise + `data-print-ready`), typed empty/invalid failures.
- Hidden window options, asset protocol on the default session, no network, no
  dialogs, destroy after capture.
- `printToPDF` with resolved page size/orientation, scale 1,
  `printBackground`, `preferCSSPageSize`, no header/footer, numeric zero margins.
- Preflight: blocking defects and overflowing pages refuse the export and name
  the affected blocks; manual-break, anchor, missing/failed asset, blank-page and
  missing-glyph warnings are carried on the job.
- Job id/status/progress/cancellation, explicit output path, explicit overwrite,
  temp -> inspect -> rename, no partial file on failure/cancel.
- Cheap hardening **R3, R4, R6, R7, R8, R9 (cache), R10** — see below.

Out of scope and untouched: M4c3 50+ page/raster/font gate, Settings/manual-break
UI, R3/R4 milestones (large settings refactor), full-codebase refactor, layout/
paginator/PageTheme metric changes, merge/push/PR.

## Files changed

New (main process):

- `apps/desktop/src/shared/export.ts` — export snapshot/job/summary/print-options
  contract shared by main, preload, renderer, and print entry.
- `apps/desktop/src/main/export-job.ts` — cancellable job state machine, atomic
  temp/validate/rename output, typed failure mapping.
- `apps/desktop/src/main/export-preflight.ts` — pure identity/preflight checks,
  `printToPDF` options, produced-PDF validation.
- `apps/desktop/src/main/export-window.ts` — hidden `BrowserWindow` print
  session, snapshot build via `executeJavaScript`, `printToPDF`, destroy.
- `apps/desktop/src/main/export-service.ts` — renderer snapshot request/reply
  plumbing and export IPC registration.

New (renderer / print):

- `apps/desktop/src/renderer/src/export-snapshot.ts` — current-document snapshot
  (unsaved content, revision, resolved settings, asset URLs).
- `apps/desktop/src/renderer/src/page/asset-urls.ts` — shared asset URL/failed
  asset resolution (Page Read + export).

New tests:

- `apps/desktop/test/export-job.test.ts` — 15 job/atomic/failure/cancel tests.
- `apps/desktop/test/export-preflight.test.ts` — 12 preflight/validation tests.
- `apps/desktop/test/export-snapshot.test.ts` — 2 snapshot/asset tests.
- `tests/ui/m4c2-pdf-export.test.mjs` — 7 production-build hidden-window export
  flows (A/B2/stacked/A5/Letter, unsaved edits, overwrite, cancel, preflight,
  missing asset).

Modified:

- `packages/layout/src/types.ts`, `layout.ts` — `ContinuousLayout.revision` and
  `ContinuousLayout.layoutOptions` identity fields (no metric/theme change).
- `packages/pdf/src/printModel.ts` — required fingerprint, `LayoutOptions`
  compare, document id/revision checks, `PrintModelDocumentMismatchError`,
  validated-run defects/warnings (R4).
- `packages/pdf/test/print-model.test.ts` — updated required identity + new
  R1/R4/R5 tests.
- `apps/desktop/src/renderer/src/print/entry.tsx` — on-demand build, settle
  handshake, theme/sheet probe, `data-print-ready`.
- `apps/desktop/src/renderer/src/print/print.css` — print-document white
  background, one break rule, outline reset (R7/R8).
- `apps/desktop/src/renderer/print.html` — `nf-print-document` scope class.
- `apps/desktop/src/main/index.ts` — export service/IPC registration, quit
  disposal.
- `apps/desktop/src/preload/index.ts`, `apps/desktop/src/shared/api.ts`,
  `apps/desktop/src/renderer/src/global.d.ts` — `exportPdf`, `getExportJob`,
  `cancelExport`, `onExportSnapshotRequest`, print bridge types.
- `apps/desktop/src/renderer/src/App.tsx` — snapshot request handler; commits a
  pending Page Edit overlay before snapshotting (same as save/close).
- `apps/desktop/src/renderer/src/lib/tree.ts` — `blockTitle` delegates to
  `contentBlockTitle` (R3).
- `apps/desktop/src/renderer/src/page/projection.ts` — per-projection segment
  cache across pages (R9).
- `apps/desktop/src/renderer/src/page/usePageModel.ts` — uses the shared asset
  URL helper.
- `apps/desktop/electron.vite.config.ts` — main bundle includes
  `@noteforest/pdf`; `pdfjs-dist` stays external for Node inspection.
- `apps/desktop/test/print-parity.test.ts`, `apps/desktop/test/tree.test.ts`,
  `tests/ui/m4c1-print-compositor.test.mjs` — R1/R3/R6/R9 coverage.
- `package.json` — M4c2 UI suite in `test:ui` and `verify`.

## Checks run with real timings

Final `npm run verify:fast` — **exit 0**, **51.73 s** wall:

- architecture boundaries: **160 files / 781 imports / 16 rules**, no
  violations.
- typecheck: all four workspaces pass.
- unit: **95 files / 939 tests**, **2.29 s** (new: 29 export tests; print-model
  and tree additions).
- critical e2e: **16/16 pass**, **43.77 s**, 0 pageErrors.

Targeted suites:

- `node --test tests/ui/m4c2-pdf-export.test.mjs` — **7/7 pass**, suite
  **5.25 s** (13.42 s wall including seven isolated app launches), 0 pageErrors.
- `node --test tests/ui/m4c1-print-compositor.test.mjs` — **6/6 pass**, suite
  **3.84 s** (11.94 s wall); includes the R6 computed-metric test.
- Page regressions: m4b1 page view 9/9 (14.3 s), m4b1a2 read gating 2/2
  (12.5 s), m4b1b1 Page Edit overlay 8/8 (14.9 s), r2j callout modes 5/5
  (11.3 s), r2g trunk continuity 2/2 (9.4 s), r2i subtree wrap 6/6 (11.0 s).
- Targeted unit bundle (`packages/pdf/test`, `print-parity`, `export-*`,
  `tree`) — **64 tests**, 298 ms.

No fixed sleeps, no native dialogs, no screen recordings.

## R1 closure — required measured-run identity

- `PrintModelOptions.pageModelFingerprint` is **required** in the type and
  checked at runtime: a missing/empty fingerprint throws
  `PrintModelSettingsMismatchError` before a page record is emitted. Tests cover
  the JS omission and the empty string.
- `ContinuousLayout` now carries `layoutOptions` (the exact `LayoutOptions` the
  run measured with) and `revision`. `buildPrintModel` compares
  `layout.layoutOptions` with `pageLayoutOptions(settings.theme)`; a layout
  measured under another theme fails even if a caller fabricates a matching
  fingerprint. The M4c1 review's theme probe is now a test.
- `layout.documentId === document.id` and `layout.revision === document.revision`
  (when both exist) are enforced with `PrintModelDocumentMismatchError`. Tests
  cover another document id and an advanced revision.
- The hidden window passes `measured.settingsFingerprint` from the same
  `computePageModel` run that produced the layout/pages. The main process also
  re-checks the returned summary `fingerprint`, `documentId`, and `revision`
  against the snapshot (`settings-mismatch` / `document-mismatch`).

## R2 closure — model source and settle handshake

- The main process asks the renderer for `ExportSnapshot` over IPC
  (`export:request-snapshot` / `export:snapshot`). It contains the current
  layout-shaped document (unsaved edits), canonical revision, resolved
  `PageSettings`, `pageSettingsFingerprint`, and asset URLs. The package on disk
  is never read. The UI test creates a block, confirms the runtime is dirty, and
  finds its text in the exported PDF at the advanced revision.
- The hidden window measures and builds on demand:
  `createDomPageMeasurement` + `computePageModel` + `buildPrintModel`, no
  PageView registry. The M4c2 UI test exports with `.nf-page-view` absent.
- `window.__noteforestPrint.build(snapshot)` resolves after `flushSync` commit,
  `document.fonts.ready` twice, image load/`decode()` twice (bounded), and two
  animation frames. It also sets `data-print-ready` on the body. The job records
  `rendered`, `framesSettled`, and measurement/settle timings; the UI test
  asserts `rendered === true`, `framesSettled === true`, positive timings, and no
  `frames-not-settled` warning.
- Empty documents fail with `empty-document`; malformed/identity-mismatched
  snapshots fail with `invalid-input`/`settings-mismatch`; a summary for another
  document/settings/revision is refused before printing. There is no partial
  page set: the whole model comes from one measured run and page count is
  validated against the produced PDF.
- Theme probe: after render the hidden window measures the print root's computed
  font size and line-height ratio against the resolved `PageTheme` values
  (9 pt -> 12 px, 1.3 line height in the compact theme); a mismatch is a
  `settings-mismatch` preflight error.

## Hidden window, print options, preflight

- Hidden window: `show: false`, `backgroundThrottling: false`,
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, no
  preload, `webSecurity`, default session (inherits `noteforest-asset:`),
  `window.open`/navigation denied, permission requests denied, destroyed after
  capture. It loads only the local production `print.html` (or the dev-server
  equivalent); CSP blocks remote content.
- `printToPDF`: resolved `pageSize` (`A4`/`A5`/`Letter`), `landscape` from the
  orientation, `scale: 1`, `printBackground: true`, `preferCSSPageSize: true`,
  `displayHeaderFooter: false`, `generateTaggedPDF: false`, and numeric zero
  margins `{ top: 0, bottom: 0, left: 0, right: 0 }` (inches, never
  `marginType`). Unit test pins the exact option object.
- The job view carries the resolved `pageCount`/`pageSetup` before the print
  phase (unit test waits in the `print` phase and reads them).
- Preflight (`export-preflight.ts`): refuses `blockingDefects` and
  `page.overflow`, names the block title/id and page; surfaces
  `manualBreakWarnings`, broken/ambiguous anchors, failed/missing assets, other
  non-blocking layout warnings, blank pages, and missing glyphs. It never
  prints a clipped page.

## Job, output, atomicity

- `exportPdf({ packagePath, outputPath, overwrite? })` validates input (absolute
  output path), returns `{ ok, jobId }`, and runs phases
  `queued -> snapshot -> model -> print -> validate -> write -> done` with
  0..1 progress.
- `getExportJob(jobId)` returns the job view (`status`, `phase`, `progress`,
  resolved page count/setup, warnings, error, timings). `cancelExport` aborts a
  running job; the hidden window is destroyed.
- Output policy: fail before printing if the file exists unless
  `overwrite: true`; re-check before rename. The temp file is
  `.<output>.<jobId>.partial` in the output directory. It is written, read
  back, inspected, and renamed only on success; failure/cancel deletes it. The
  document package is never written.
- Failure surfaces: `invalid-input`, `output-exists`, `document-not-open`,
  `snapshot-failed`, `snapshot-timeout`, `document-mismatch`,
  `settings-mismatch`, `empty-document`, `model-mismatch`, `model-error`,
  `preflight-blocked`, `print-failed`, `validation-failed`, `write-failed`,
  `window-failed`, `cancelled`, `internal-error`.

## Acceptance

| Criterion | Result | Evidence |
|---|---|---|
| R1 required measured-run/theme fingerprint; document id/revision; mismatch tests | Pass | print-model tests (missing fingerprint, different theme, stale fingerprint, other document, advanced revision); summary identity in main |
| R2 on-demand model independent of Page mount; render-settled; stale/empty fails | Pass | hidden-window UI exports with no Page view; `rendered`/`framesSettled`/timings; empty-document unit test; unsaved-edit PDF text |
| Hidden window options + asset protocol; no network/dialogs | Pass | export-window.ts; UI exports include image placeholder and pass with 0 pageErrors; no dialog calls |
| `printToPDF` numeric zero margins, page size/orientation, scale/background/CSS size, no header/footer | Pass | `pdfOptionsFor` unit test; exact PDF sizes below |
| Preflight blocks `blockingDefects`, names blocks; warnings surfaced | Pass | preflight unit tests; tall-paragraph integration (`preflight-blocked`, "Tall block"); missing-asset warning |
| Job id/status/progress/cancellation; explicit output/overwrite | Pass | export-job unit tests; overwrite integration; cancel integration |
| Atomic temp -> inspect -> rename; failure/cancel leaves no partial file | Pass | unit tests (print/validation/write/inspect failures, cancel mid-print); integration cancel and blocked export leave no file/`.partial` |
| PDF page count equals model, page size matches, real text, no blank page; A5/Letter/portrait/landscape | Pass | 7-case UI suite; PDF evidence below; every page has text |
| R3/R4/R6/R7/R8/R9/R10 closed or explicitly deferred | Pass | R3 delegated title helper + test; R4 validated-run defects + test; R6 computed-style test; R7 outline + refusal; R8 white/scoped background + one break rule; R9 cross-page segment cache + test (300-block timing deferred to M4c3); R10 numeric margins |
| Targeted tests + one `npm run verify:fast` with real timings; no fixed sleeps/dialogs | Pass | above |
| Report maps every criterion and lists risks | Pass | this report |

## PDF page count/size/text evidence

From `tests/ui/m4c2-pdf-export.test.mjs` (production build, hidden Electron
window; `pdfjs-dist` inspection of the produced files). Artifact:
`artifacts/m4c2/export/export-evidence.json`. Raster evidence:
`artifacts/m4c2/raster/mode-a-001.png`,
`artifacts/m4c2/raster/stacked-001.png`, `stacked-002.png`.

| Case | Page setup | Model pages | PDF pages | PDF page size (mm) | Text |
|---|---|---:|---:|---|---|
| Mode A | A4 landscape, 12 mm | 1 | 1 | 297.01 × 209.89 | 614 chars, document/chapter/page label + body |
| Mode B2 | A5 portrait, 12 mm | 1 | 1 | 148.17 × 209.89 | body text, no blank page |
| A5 landscape | A5 landscape, 12 mm | 1 | 1 | 209.89 × 148.17 | body text, no blank page |
| Stacked | A5 portrait, 46 mm, `stacked` | 2 | 2 | 148.17 × 209.89 | both pages text; continuation/trunk visible in raster |
| Letter portrait | Letter portrait, 12 mm | 1 | 1 | 215.90 × 279.40 | body text |
| Letter landscape | Letter landscape, 12 mm | 1 | 1 | 279.40 × 215.90 | body text |
| Unsaved revision | A4 landscape | 1 | 1 | 297.01 × 209.89 | contains the unsaved paragraph phrase |

Every page has extractable text; `missingGlyphCount` is 0. Page sizes are within
0.25 mm (ADR minimum 0.2 mm; observed maximum delta 0.17 mm on A5).

Failure/cancel evidence (same suite):

- Cancelled during the snapshot/print handshake: job `cancelled`, no output
  file, no `.partial` file; the hidden window is destroyed. Unit tests also
  cancel mid-`printToPDF` and while awaiting the snapshot.
- Blocked document: `preflight-blocked`, message names "Tall block", details
  carry `kind: blocking-defect` with block id/title/page; no output and no temp
  file.
- Second export to the same path without `overwrite`: `output-exists`, existing
  PDF byte-for-byte still valid; with `overwrite: true` it succeeds.
- Print/validation/inspection/write failures: unit tests prove no output and no
  temp file remain.

## R3–R10 closure

- **R3** — closed. `apps/desktop/src/renderer/src/lib/tree.ts#blockTitle`
  delegates to `contentBlockTitle`. `apps/desktop/test/tree.test.ts` asserts
  equality for code, formula-only, image-only, empty, and truncated text blocks;
  no renderer copy remains.
- **R4** — closed. `buildPrintModel` uses the validated `paginate` run for
  pages, defects, and manual-break warnings (a supplied page list is only a
  signature check). Test: stale supplied pages with empty warnings still report
  the `impossible-hint` warning.
- **R6** — closed. The M4c1 UI suite now compares `getComputedStyle` values
  (font size, line height, letter spacing, padding, margins) on `.nf-page-card`,
  `.nf-label`, `.nf-page-header`, `.nf-page-footer`, and a cross-page
  `.nf-page-edge-label` between Page Read and the print compositor. Border
  widths are excluded by design: the print skin may change borders/colours.
- **R7** — closed. Print sheets reset `outline: none`; the export refuses
  blocking defects and page overflow before rendering, so the screen-only
  warning outline and silent clipping cannot reach a PDF.
- **R8** — closed. `html.nf-print-document`/body are white with `overflow:
  visible` (scoped so the app window keeps its dark canvas); one break rule
  (`break-after: page` in print media with `:last-child { auto }`); PDF page
  count equals the model and no page is blank.
- **R9** — partly closed, measured deferral. `projectPageContent` now shares one
  segment list per block across continuation pages (test asserts the same array
  across pages); a block continuing over pages is not rebuilt per page. The
  cost of projecting every page's cards on every content change at 300/1,000
  blocks remains unmeasured and is deferred to the M4c3 performance pass with an
  explicit note (no Page Read behavior change, no metric change).
- **R10** — closed. Numeric zero inch margins, never `marginType`; pinned by
  `pdfOptionsFor` tests and the ADR/plan wording already updated.

## Open questions / risks

1. **Snapshot payload size.** The current document is embedded in an
   `executeJavaScript` call. Normal documents are fine (the M4c2 UI suite
   measured and printed in ~0.3–0.8 s per export); a 300+ block payload should
   be measured in M4c3 and moved to an IPC fetch if serialization becomes
   visible. This is not a correctness gap.
2. **pdfjs in the main bundle.** `inspectPdf` uses `pdfjs-dist` and is
   externalized so its worker resolves from `node_modules`. The packaged app
   must ship it (and unpack if required); that is packaging (M4c3/Docs/Release),
   not a signing decision for this task.
3. **Metric probe scope.** The hidden window proves the applied theme font size
   and line-height ratio, the resolved fingerprint, and the fixed sheet size. It
   does not raster-compare glyph positions; the M4c3 raster/text gate owns that.
4. **Cancel vs. rename race.** Cancellation before the atomic rename leaves no
   file. A cancel arriving after the rename has completed finds a complete PDF
   and the job is `done`; `cancelExport` only accepts a running job. There is no
   code path that leaves a partial output.
5. **Page Edit overlay.** The snapshot handler commits a pending Page Edit
   overlay first (same as save/close), so typed text is included; that adds one
   structural undo entry, as a user save would.
6. **No user-facing export entry.** This slice exposes the typed main-process
   API and preload bridge used by tests; a menu/command + save dialog is the
   product/UX step (M4c3 or the Settings sequence). No product decision is
   encoded here.
7. **Print background / raster.** White print-document background is enforced by
   CSS and visible in the raster artifacts; the formal 1.0 mm page-view/raster
   comparison and Notability import remain M4c3/product-owner gates.
8. **Blocked documents.** The API returns a typed preflight error; there is no
   user dialog yet (the brief explicitly keeps export UI out of scope). No
   silent clipping occurs.
9. **Default session assumption.** The hidden window uses the default session so
   it inherits the global `noteforest-asset:` protocol. A future partitioned
   session would need its own registration (documented in the M4c1 review too).

## Next suggested step

Orchestrator: run one full `npm run verify` on the integrated tree (the new UI
suite is part of `verify`), then hand M4c2 to a targeted Sentinel check for R1/R2
and the export job. M4c3 owns the 50+ page A4 / raster / font-embedding /
Notability gate and the 300-block export performance measurement.
