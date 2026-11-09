# M4c2 — PDF export orchestration

**Role:** Builder / Implementer  
**Milestone:** M4c2 (export job on the M4c1 print compositor); M4c3 full PDF gate follows  
**Base:** `main` after M4c1 and its Sentinel review (`473f633` plus this brief commit; exact SHA in the handoff)  
**Worktree:** assigned by the Orchestrator  
**Timebox:** 2 days

## Context

M4c1 is merged and accepted with findings (no S1). The print compositor can
render one fixed page per derived page from a complete `PrintModel`; a local
hidden-window probe printed 6 A5 pages with real text and no blank page.
M4c2 adds the real export job: model source, hidden window, `printToPDF`,
preflight, validation, atomic output, and failure surfaces.

The M4c1 Sentinel's **R1/R2** are the M4c2 contract items. R3–R10 are cheap
hardening items; R6/R9 may be deferred only with an explicit note.

## Goal

Export the exact Page PDF from the current document/settings through a hidden
BrowserWindow running the production `print.html`, with deterministic page
count/size, real text, no blank page, no network, atomic output, and clear
failure/cancellation states. M4c3 owns the 50+ page/raster/font/Notability gate.

## In scope

### R1 — required measured-run identity

- Make the resolved page-settings fingerprint **required** in
  `PrintModelOptions` (or carry the resolved `LayoutOptions` fingerprint on
  `ContinuousLayout` and compare it). The hidden-window model builder must pass
  it from the same run that measured the layout.
- Check `layout.documentId === document.id`; carry/compare the document revision
  where available (R5).
- Add mismatch tests: missing fingerprint, different theme/settings, different
  document id/revision.

### R2 — model source and settle handshake

- Do **not** depend on the visible PageView registry or on Page being mounted:
  Continuous is the default. Build the page model on demand in the hidden print
  window (recommended), using `createDomPageMeasurement` + `computePageModel`
  with a serialized snapshot of the current document/settings/asset URLs
  obtained over IPC from the renderer (not stale disk state; include unsaved
  changes and the revision). If that is infeasible, document the IPC page-model
  snapshot alternative and why it is safe.
- Add a `render` promise or a `data-print-ready` signal **after** React commit,
  `document.fonts.ready`, KaTeX fonts, every image `decode()`, and two
  animation frames. Keep the existing entry-ready marker only for bundle load.
- A stale/updating/empty model must fail or wait; never print a partial page set.
- If the hidden window measures itself, verify its fonts/metrics against the
  resolved PageTheme; the model's fingerprint must match the settings used.

### Hidden window and print options

- Hidden `BrowserWindow`: `show: false`, `backgroundThrottling: false`,
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
  default session (or register the `noteforest-asset:` scheme on the used
  session); destroy after capture; no native dialogs; no network.
- `printToPDF`: page size matching A4/A5/Letter, `landscape` matching
  orientation, `scale: 1`, `printBackground: true`,
  `preferCSSPageSize: true`, `displayHeaderFooter: false`,
  `generateTaggedPDF: false`, **numeric zero margins**
  `{ top: 0, bottom: 0, left: 0, right: 0 }` (inches). Never `marginType`.
- Print CSS hardening: white `html, body` background, one break rule
  (`break-after` with `:last-child { auto }`, or `break-before` on `+`), reset
  the screen-only overflow outline (R7/R8).

### Preflight

- Refuse export when `model.blockingDefects.length > 0`, naming the affected
  blocks. Surface `manualBreakWarnings`, `page.overflow`, failed/missing assets,
  and empty/stale models as warnings or errors per the plan; never silently
  clip.
- Report the resolved page count and page setup before printing.

### Job, output, atomicity

- Main-process export job: `exportPdf({ packagePath, outputPath, overwrite? })`
  (or the equivalent typed API) -> job id; `getExportJob`/status; progress;
  cancellation. The external API `export.pdf` is M5, not this task.
- Output path explicit; overwrite policy explicit (default fail if the file
  exists unless `overwrite: true`). Create the temp file in the output
  directory, inspect it, and rename only on success; delete the temp on failure
  or cancellation.
- Failure surfaces: `PrintModelSettingsMismatchError`, missing/stale model,
  render error, `printToPDF` error, inspect/validation failure, write error,
  cancellation. A failed export leaves no partial file and does not touch the
  document.
- Validate the produced PDF with `inspectPdf`: page count equals
  `model.pageCount`; every page's width/height matches the resolved geometry
  within the ADR tolerance; no blank page in the fixture; real text present.
- Packaged-app verification (or the closest test harness) for the hidden
  window and output path; no network.

### Cheap hardening

- R3: make the renderer `blockTitle` delegate to `contentBlockTitle` (or move
  the helper to one source) and add a non-text-block title test. If deferred,
  document the copy change.
- R4: take `defects`/`manualBreakWarnings` from the validated `expected`
  pagination, or include them in the signature; add a warning-only mismatch
  test.
- R6: add a computed-style check for the print skin (font-size/line-height/
  padding on card, chrome, edge labels) or a raster gate; do not rely only on
  inline attributes. If deferred, it must be in M4c3.
- R9: keep Page Read projection cost bounded (lazy/per-page memo) or measure
  the 300-block path in M4c3. Do not regress Page Read.
- R10: numeric zero margins; the ADR/plan already updated.

## Out of scope

- M4c3 50+ page A4 fixture, `pdftotext`/pdfjs text extraction, font embedding
  checks, raster parity, Notability import, 300/1,000-block export performance.
- Settings UI, manual-break UI, R3/R4 (the milestones), full-codebase refactor,
  spec/UX/ADR changes.
- Changing the layout engine, paginator, PageTheme metrics, Page Read/Edit
  geometry, or the print compositor's page model.
- Merge, push, PR, or parent-checkout edits.

## Files to read

- `docs/tasks/m4c-pdf-plan.md` — M4c2 scope and gates.
- `docs/reviews/m4c1-print-compositor-review.md` — R1/R2 + add list.
- `docs/reports/m4c1-print-compositor.md`.
- `docs/adr/0002-pdf-pipeline.md` (numeric margins), `docs/adr/0007-...`,
  `docs/adr/0008-...`.
- `packages/pdf/src/printModel.ts`, `verifyPdf.ts`, `node.ts`.
- `apps/desktop/src/renderer/print.html`, `src/print/entry.tsx`,
  `src/page/model.ts`, `measurement.ts`, `usePageModel.ts`,
  `print-model-registry.ts`.
- `apps/desktop/src/main/index.ts`, `apps/desktop/src/preload`,
  `apps/desktop/src/renderer/src/App.tsx` test bridge.
- `tests/ui` harness and `NOTEFOREST_E2E` dialog guard.

Expected to touch:

- `packages/pdf/src/printModel.ts` (R1/R4/R5) and tests.
- `apps/desktop/src/renderer/src/print/entry.tsx` (model bootstrap, ready
  signal) and `print.css` (R7/R8).
- `apps/desktop/src/main/` export job/hidden window/IPC; `preload`/shared API.
- `apps/desktop/src/renderer/src/App.tsx` test bridge; a test-only export
  surface if needed.
- `apps/desktop/test/` export/job/atomic tests; `tests/ui/` M4c2 suite.
- `package.json` if a new suite; `docs/reports/m4c2-export-orchestration.md`.

## Acceptance criteria

- [ ] R1: required measured-run/theme fingerprint; document id/revision check;
      mismatch tests.
- [ ] R2: on-demand model build independent of Page mount; render-settled
      handshake; stale/empty model fails or waits.
- [ ] Hidden window options + asset protocol; no network/dialogs.
- [ ] `printToPDF` numeric zero margins, correct page size/orientation,
      scale/printBackground/preferCSSPageSize; no header/footer.
- [ ] Preflight blocks `blockingDefects` and names blocks; warnings surfaced.
- [ ] Job id/status/progress/cancellation; explicit output path/overwrite.
- [ ] Atomic temp -> inspect -> rename; failure/cancel leaves no partial file.
- [ ] Produced PDF page count equals model, page size matches, real text, no
      blank page on the fixture; A5/Letter/portrait/landscape smoke.
- [ ] R3/R4/R6/R7/R8/R9/R10 closed or explicitly deferred with a note.
- [ ] Targeted tests + one `npm run verify:fast` with real timings; no fixed
      sleeps/native dialogs.
- [ ] Report maps every criterion and lists risks.

## Tests and evidence

- Unit: fingerprint/document mismatch, warning carry, job state machine,
  atomic write/failure/cancel, PDF inspection validation.
- Hidden-window export from the production build (or test harness) for A/B2/
  stacked, A5/Letter/portrait/landscape; page count/size/text.
- Preflight blocking-defect test; no partial file on failure.
- R6 computed-style or raster parity check; R9 page-projection timing note.
- `npm run verify:fast` at the end; Orchestrator runs one full verify.
- Report at `docs/reports/m4c2-export-orchestration.md`.

## Stop and ask

Stop and report if:

- the hidden window cannot measure/build the model reliably (fonts/assets);
- R1/R2 require a layout/PageTheme contract change;
- the export job needs a product decision (output path/overwrite/job UX);
- the compositor needs a second router/paginator or metric change;
- the packaged-app path needs a signed build/entitlement decision;
- the baseline has unrelated failures.

## Report format

- Summary and scope.
- Files changed.
- Checks run with real timings.
- R1/R2 and add-list closure evidence.
- Acceptance pass/fail.
- PDF page count/size/text evidence and failure surfaces.
- Open questions/risks.
- Worktree path, branch head SHA.
