# Review — Targeted M4c2 PDF export orchestration

- **Reviewer:** Reviewer / Sentinel (independent)
- **Date:** 9 November 2026
- **Reviewed base:** `main` at `9859a18` (M4c2 integration `322d132` plus the review brief/docs)
- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-d761e672-9444ebe5517e1f81`
- **Branch:** `t3/review-m4c2-pdf-export-orchestration`
- **Environment:** macOS 26.5.2 (Darwin 25.5.0, arm64), Node 22.23.1, Electron 45.2.1,
  production build (`npm run build`)
- **Stack/PDF:** Electron + shared paginator + `printToPDF` (ADR-0001, ADR-0002)
- **Verdict:** **Accept with findings**

**What is accepted.** M4c2 turns the M4c1 compositor into a real export job. The
renderer supplies the current in-memory document revision over IPC; a hidden
sandboxed `BrowserWindow` loads the production `print.html`, measures that
snapshot with the real `createDomPageMeasurement` + `computePageModel` path,
builds the print model from the same run, renders one fixed sheet per derived
page, and resolves only after React commit, fonts, images, and two frames. The
main process rejects blocking defects and overflowing pages, prints with the
resolved page size/orientation and numeric zero margins, validates page
count/size/text on the produced PDF, and writes a temp file that is renamed only
on success. R1 (required measured-run/theme identity) and R2 (on-demand model
source + settle handshake) are genuinely closed. I reproduced the committed
unit and UI suites and a real production-build export, and I verified a real
image through the hidden window's asset protocol. There is **no S1**.

**What is not accepted as fully closed.** Three S2 findings are **M4c3 entry
conditions**: a truly blank produced page is currently only a warning even
though the DoD says it is an export failure; an image node with declared
dimensions whose bytes fail after open prints a browser broken-image glyph with
no warning; and `pdfjs-dist` is still a root devDependency, so a packaged app
cannot run the produced-PDF inspector. The first two are concrete behavior gaps
in the export/PDF validation, not architecture objections; the third is
packaging. I recommend fixing S2-1/S2-2 as the first M4c3 commits, before the
gate is declared green. The remaining findings are S3 hardening and test/evidence
gaps.

## Scope reviewed

Reviewed:

- `apps/desktop/src/shared/export.ts`.
- `apps/desktop/src/main/export-job.ts`, `export-preflight.ts`, `export-service.ts`,
  `export-window.ts`, `index.ts`, `asset-protocol.ts`.
- `apps/desktop/src/preload/index.ts`, `apps/desktop/src/shared/api.ts`,
  `apps/desktop/src/renderer/src/export-snapshot.ts`, `App.tsx`,
  `page/measurement.ts`, `page/asset-urls.ts`, `page/model.ts`, `page/projection.ts`.
- `apps/desktop/src/renderer/src/print/entry.tsx`, `PrintDocument.tsx`,
  `print.css`, `print.html`.
- `packages/pdf/src/printModel.ts`, `verifyPdf.ts`, `node.ts`;
  `packages/layout/src/types.ts`, `layout.ts`, `page-settings.ts`,
  `paginator.ts`.
- Tests: `apps/desktop/test/export-*.test.ts`, `print-parity.test.ts`,
  `tree.test.ts`, `packages/pdf/test/print-model.test.ts`,
  `tests/ui/m4c2-pdf-export.test.mjs`, `tests/ui/m4c1-print-compositor.test.mjs`,
  the UI harness/fixtures.
- Artifacts: the M4c2 PDFs/evidence in this worktree and the Builder's
  gitignored raster PNGs in its worktree.
- The M4c2 brief/report, the M4c1 review, the M4c plan, ADR-0002, the review
  checklist, and the DoD.

Not reviewed: the full-codebase Sentinel/refactor, Settings/manual-break UI,
the M4c3 50+ page/raster/font/Notability gate, and the unbuilt External Agent
API. The full `npm run verify` was not re-run, per the brief (reported green at
`322d132`).

## Acceptance criteria

| # | Criterion | Evidence | Result |
|---|---|---|---|
| R1 | Required measured-run/theme fingerprint; `ContinuousLayout.layoutOptions` compare; document id/revision; mismatch tests | `packages/pdf/src/printModel.ts:220-287`; `packages/layout/src/types.ts:312-323`; `packages/pdf/test/print-model.test.ts:475-607`; main summary checks `apps/desktop/src/main/export-preflight.ts:34-73` | Pass for production layouts; S3 optional-field bypass |
| R2 | On-demand model independent of Page mount; render-settled handshake; stale/empty fails | `apps/desktop/src/renderer/src/print/entry.tsx:247-357`; `tests/ui/m4c2-pdf-export.test.mjs:159-200` (no `.nf-page-view`); empty/stale unit tests | Pass; S2-2 print-time image failure, S3 bounded settle |
| Hidden window | `show:false`, sandbox, context isolation, no Node/preload, navigation/window-open/permission denial, default-session asset protocol, destroy after capture, no network/dialogs | `apps/desktop/src/main/export-window.ts:74-101`, `:175-198`; `apps/desktop/src/main/index.ts:113-121`, `:552-555`; `print.html` CSP | Pass; S3 `will-redirect`/crash-timeout |
| `printToPDF` | Resolved page size/orientation, `scale:1`, `printBackground`, `preferCSSPageSize`, no header/footer, numeric zero margins | `apps/desktop/src/main/export-preflight.ts:182-193`; `apps/desktop/test/export-preflight.test.ts:65-105`; UI PDF sizes below | Pass |
| Preflight | Blocking defects and page overflow refuse and name blocks; warnings surfaced | `apps/desktop/src/main/export-preflight.ts:76-175`; `tests/ui/m4c2-pdf-export.test.mjs:389-418`; unit tests | Pass for defects/overflow; **S2-2 partial for print-time assets** |
| Job/output | Job id/status/progress/cancellation; explicit output/overwrite; temp/read-back/inspect/rename; no partial on handled failure/cancel | `apps/desktop/src/main/export-job.ts:192-398`; `apps/desktop/test/export-job.test.ts`; UI cancel/overwrite | Pass on handled paths; S3 races/crash cleanup |
| PDF | Page count equals model; page size/orientation within tolerance; real text; no blank page on the fixture; A5/Letter/portrait/landscape | UI suite `assertPageSizes` + evidence; my rerun; raster PNGs | Pass on fixture; **S2-1 blank severity**, S3 text-only validation |
| R3/R4/R6/R7/R8/R9/R10 | Close or explicitly defer | `apps/desktop/src/renderer/src/lib/tree.ts#blockTitle`; `packages/pdf/src/printModel.ts:342-358`; `tests/ui/m4c1-print-compositor.test.mjs:266-312`, `:451-490`; `print.css`; R9 cache + explicit deferral | Pass/deferred as reported |
| Tests/report | Targeted tests with real timings; no fixed sleeps/native dialogs; report maps criteria | My reruns below; report | Pass with S3 evidence gaps |

## Findings

| ID | Severity | Area | Location | Evidence | Expected | Actual | Smallest safe fix |
|---|---|---|---|---|---|---|---|
| **S2-1** | **S2 (M4c3 entry)** | A blank produced page is only a warning | `apps/desktop/src/main/export-preflight.ts:232-239`, `:255`; `apps/desktop/test/export-preflight.test.ts:299-314` | The unit test constructs two pages, page 2 blank, and asserts `blank.ok === true` with a `blank-page` warning. `export-job.ts:353-361` only throws when `!validation.ok`, so the job can finish `done` with a blank page. This contradicts `docs/definition-of-done.md:437-438` and `docs/review-checklist.md:759-760` ("a blank page ... is an export failure"). No UI displays the warning. | A truly blank produced page fails the export (or at least blocks the write); an image-only page is not blank. | A blank sheet can ship with a job status `done`; the only signal is a warning array. | Classify a page as blank from the **model** (`page` has no fragments, no edges/trunks, no image fragments) or a raster ink check, not `text.trim()===''`; make that an error. Keep textless image pages valid. Add a UI/unit failure test. |
| **S2-2** | **S2 (M4c3 entry)** | Print-time image failure is silent for dimensioned images | `apps/desktop/src/renderer/src/page/measurement.ts:81-108`; `apps/desktop/src/renderer/src/print/entry.tsx:124-144`, `:212-213`, `:335-344`; `apps/desktop/src/main/export-preflight.ts:123-136` | `imageAssetIdsToPreload` deliberately skips images with both width/height, so measurement never decodes them and never records a failure. `settleImages` waits for load/error/decode but discards the result; `summarize` only carries `model.failedAssetIds`. **Probe:** a real 640×360 `forest.png` asset opened in the app, then deleted; export of an image node with declared width/height finished `done`, `warnings: []`, and the PDF contained one **28×32** XObject (browser broken-image icon) plus alt text instead of the real image. The committed missing-asset test uses an image **without** dimensions (`tests/ui/m4c2-pdf-export.test.mjs:432-446`), so it passes through a different path. | A failed/missing asset is surfaced on the job and the app placeholder is printed; no browser broken-image glyph and no silent success. | The export succeeds with a broken image and no warning; the asset can be deleted/changed after open and after measurement. | Make `settleImages` return failed asset ids (`naturalWidth === 0` or `decode()` rejection, via `data-asset-id`), merge them into the summary's `failedAssetIds`, render the app `nf-missing-asset` placeholder instead of the broken `<img>`, and add a UI test with a dimensioned asset deleted after open. |
| **S2-3** | **S2 (M4c3 gate)** | `pdfjs-dist` is not a runtime dependency of the app | `package.json:48-51`; `apps/desktop/electron.vite.config.ts:36-38`; `docs/reports/m4c2-export-orchestration.md:314-317` | The PDF inspector is imported from `@noteforest/pdf/node` in `apps/desktop/src/main/export-service.ts:12`, the main bundle externalizes `pdfjs-dist`, and `pdfjs-dist` is a root **devDependency**. The UI suite runs the production `out` build, not a packaged asar; no packaging config exists yet. | The packaged app can inspect the produced PDF, with the pdfjs worker/legacy assets available from the asar (unpacked if needed). | A packaged build would fail the validation step (or fail to load the inspector) unless devDependencies are shipped or the module is bundled/unpacked. | Add `pdfjs-dist` as an app/runtime dependency (or bundle it), configure `asarUnpack` for its worker/legacy asset if required, and add a packaged export smoke test in M4c3. Report risk 2 already names this; it is not an M4c2 code defect because the brief allowed the closest harness. |
| **S3-1** | S3 | Required identity can be bypassed by a hand-built layout | `packages/layout/src/types.ts:312-323`; `packages/pdf/src/printModel.ts:244-251` | `layoutOptions?` and `revision?` are optional; `buildPrintModel` only compares `layoutOptions` when it is defined. A layout constructed without it can pass a fabricated fingerprint + a different theme. The production `layoutDocument` always sets both (`packages/layout/src/layout.ts:282-287`), so no app path currently bypasses this. | The measured-run identity is unbypassable by the public model contract. | A test/hand-built layout can omit the theme identity; the "required" fingerprint alone is not sufficient in that case. | Make `layoutOptions` required on `ContinuousLayout` (update test fixtures) or treat `undefined` as a mismatch in `buildPrintModel`; keep `revision` optional only for legacy documents. |
| **S3-2** | S3 | Main process trusts the hidden-window summary and lacks sender/package binding | `apps/desktop/src/main/export-window.ts:147-157`; `apps/desktop/src/main/export-service.ts:43-55`, `:114`, `:171-177`; `apps/desktop/src/main/export-preflight.ts:220-231` | After `measure()`, only `typeof result.ok === 'boolean'` is checked, then the value is cast to `PrintRunSummary`. A malformed summary with `pageWidthMm: undefined`/`NaN` makes `Math.abs(... - undefined)` false, skipping the page-size check; `rendered: false` and `metrics: null` are not refused. `handleSnapshotReply` does not verify `snapshot.packagePath === input.packagePath` or `event.sender`; the renderer currently resolves the path against open runtimes, and the hidden window has no preload, so this is defense-in-depth, not a current exploit. | The main process validates the summary shape/finite geometry, requires `rendered === true` and non-null metrics for a print, binds the snapshot to the requested document, and only accepts IPC from the app window. | A stale/malformed window result or wrong document could be accepted; a malformed summary can bypass the page-size check. | Add an `isPrintRunSummary` guard (strings, numbers finite, pageSetup, arrays), compute the expected geometry/fingerprint in main from `snapshot.settings`, compare `snapshot.packagePath`, and check `event.sender.id` in the export IPC. |
| **S3-3** | S3 | Output path/atomicity hardening: arbitrary absolute path, symlink temp, exists→rename race, no fsync/stale cleanup | `apps/desktop/src/main/export-job.ts:129-152`, `:266-271`, `:323-332`, `:364-378`, `:450-459` | The API accepts any absolute `outputPath` (including the package's `document.json` with `overwrite: true`); the temp name is `.<basename>.<jobId>.partial` and `writeFile` uses the default flag (follows a symlink; `Math.random` is not a secret); `exists()` then `rename()` is a TOCTOU because `rename(2)` replaces an existing destination; there is no `fsync` of the file/dir and no startup cleanup of a partial left by a crash. | The export cannot clobber the source package; temp creation is exclusive; `overwrite:false` is atomic no-clobber; a crash leaves either the old or the complete new file. | A caller (future API/UI bug or compromised renderer) can write a PDF over arbitrary files; a file created between the final `exists` and `rename` is silently replaced; a symlink in the output directory can redirect the temp write. | Reject `outputPath` equal to/inside `packagePath` and require a user-authorized path (save dialog) for the UI; create the temp with `open(..., 'wx', 0o600)`; for `overwrite:false` use `link(temp, output)` + unlink (atomic no-clobber) or a platform no-replace primitive; `fsync` file+dir before/after rename; clean stale `.partial` files at startup. |
| **S3-4** | S3 | Hidden-window lifecycle: redirects, renderer crash, abort-listener retention | `apps/desktop/src/main/export-window.ts:22-24`, `:93-96`, `:191-198` | Only `will-navigate` is denied, not `will-redirect`; there is no `render-process-gone` handler, so a crashed renderer waits the 180 s measure/print timeout; `openPrintWindowSession` adds an abort listener that is never removed and closes over the session, which holds the full `ExportSnapshot`. The job manager retains up to 25 terminal jobs (`export-job.ts:155-172`, `:497-505`), so completed jobs can retain document snapshots through the signal/session closure. | Redirects are denied; a crashed renderer fails fast; no completed job retains a document/session. | A dev-URL redirect could escape the navigation guard; a crash hangs up to 180 s; up to 25 completed jobs retain snapshots. | Add `will-redirect` denial and `render-process-gone` → `window-failed`/destroy; store/remove the abort listener in `dispose()`, null `input.snapshot` after dispose, and clear `job.controller`/session references on finish. |
| **S3-5** | S3 | Settle timeouts are silent for images/fonts; `framesSettled:false` is only a warning | `apps/desktop/src/renderer/src/print/entry.tsx:63-66`, `:124-144`, `:335-340`; `apps/desktop/src/main/export-preflight.ts:155-162` | `settleImages` has a 5 s race, `settleFonts` a 5 s race, frames 500 ms; only the frames outcome is reported (`frames-not-settled` warning). An image that loads after 5 s, a font fallback, or a decode failure can print without any job warning; a slow 1,000-block export can cross these bounds. | Every bounded settle has a flag/warning (or the export waits/fails) so a partial image/font set is not printed silently. | A partial image/font set can print with no warning; the report's "settle" evidence only asserts the happy path. | Return `imagesSettled`/`fontsSettled` (and failed ids) from `build`, surface warnings/errors, and set a larger export-specific bound or fail on a critical image/font. |
| **S3-6** | S3 | Produced-PDF validation is text-only and chrome-tolerant | `packages/pdf/src/verifyPdf.ts:39-93`; `apps/desktop/src/main/export-preflight.ts:207-255` | `inspectPdf` joins text items and counts only `\uFFFD`; `validateProducedPdf` treats any non-empty page text as non-blank (page numbers/headers count) and labels an image-only page blank. There is no per-block sentinel check, no expected image count, and no raster/ink check. | A page is blank only when the model/raster says so; every block's content is present; images/fonts are checked. | A page whose body content is missing but chrome text is present passes; an image-only page produces a false blank warning; a 50+ page gate needs raster/text sentinels. | Keep this validator as a cheap preflight but add model-fragment/image expectations and the M4c3 raster/text sentinel gate; make a true blank page an error (S2-1). |
| **S3-7** | S3 | Test/evidence gaps for the hidden-window path | `tests/ui/m4c2-pdf-export.test.mjs:420-458`; `docs/reports/m4c2-export-orchestration.md:242-275`; `tests/support/page-fixtures.mjs:35-55` | The committed suite has no real present image, formula, code, table, or 50+ page export fixture; the missing-asset test uses no dimensions; no test covers `document-not-open`, snapshot timeout, a blank-page failure, rename/read-back failure, the output-path races, or hidden-window console errors. The raster PNGs in `artifacts/m4c2/raster/` are manual Builder evidence, not generated by a committed test. | The M4c2/M4c3 suite contains a production hidden-window export with real image/math/code/table content and the failure matrix; raster evidence is reproducible. | A regression in the hidden-window asset/font path could pass the suite with placeholders; the raster evidence is not a regression guard. | Add the M4c3 fixture/assertions (real image/math/code/table, dimensions, 50+ pages, error matrix), capture hidden-window console failures, and commit a reproducible raster/text gate. |
| **S3-8** | S3 | Render/settle exceptions map to `internal-error`, not a typed model failure | `apps/desktop/src/renderer/src/print/entry.tsx:326-344`; `apps/desktop/src/main/export-window.ts:139-157` | The `try`/`catch` around `computePageModel`/`buildPrintModel` ends before `flushSync` and settle; a React render throw or settle exception rejects `build` with a raw error, which `measure()`/the job surfaces as `internal-error`. | A render/settle failure is `model-error` (or a specific typed code), with the same no-file/cleanup behavior. | Diagnostics lose the typed failure; the job still cleans up. | Wrap render/settle in the same error mapping (or add a `render-error` code) and test a thrown render. |

## Answers to the eight brief questions

### 1. Security and IPC

The snapshot request/reply is keyed by a job id, sent only to the main
window's `webContents`, and has a 20 s timeout plus abort handling
(`apps/desktop/src/main/export-service.ts:73-116`). The renderer resolves the
requested `packagePath` by exact match among open runtimes and returns `null`
otherwise, which the service maps to `document-not-open`; that is the
package-vs-open-document validation, but it lives in the renderer, not in the
main process. The main process does **not** compare `snapshot.packagePath` with
the job input, and the IPC handlers do not check `event.sender`; the hidden
window has no preload, so this is defense-in-depth for the current app and a
must-fix for the M5 external API.

`executeJavaScript` payload safety is sound: `jsLiteral` serializes the snapshot
with `JSON.stringify` and escapes U+2028/U+2029
(`apps/desktop/src/main/export-window.ts:34-40`); document strings cannot break
out of the expression. The `__proto__` key in a JSON object literal is a minor
semantic hazard (JSON.parse would preserve it as an own property); the hidden
window is sandboxed with no Node, so it cannot escalate. A huge snapshot is a
performance risk (M4c3), not an injection risk.

Output handling is absolute-path-only and uses a temp in the output directory,
but the path is unrestricted: `overwrite:true` can rename over the document
package, the temp write follows a pre-planted symlink, and `exists()` then
`rename()` is not atomic no-clobber (`apps/desktop/src/main/export-job.ts:129-152`,
`:266-271`, `:364-378`). For the current internal test API the threat requires a
compromised renderer or a local writer; the UI must use a user-authorized save
path and S3-3 hardening before the external API. The document package is never
written by the job itself.

### 2. Hidden window

The window is `show:false`, `contextIsolation:true`, `nodeIntegration:false`,
`sandbox:true`, no preload, `webSecurity:true`, `backgroundThrottling:false`,
`devTools:false`, window-open denied, `will-navigate` denied, permission
requests denied, and the default session inherits the `noteforest-asset:`
protocol (`apps/desktop/src/main/export-window.ts:74-101`;
`apps/desktop/src/main/index.ts:113-121`, `:552-555`). The production
`print.html` has a local CSP with no remote script/font/connect sources and
allows only `noteforest-asset:`/data/blob images. The window is destroyed after
capture, on failure, on cancel, and on the load/measure/print timeout via
`cancel()`; the job's `finally` calls `dispose()`.

Gaps: `will-redirect` is not denied (only `will-navigate`); there is no
`render-process-gone` fast path, so a crashed renderer waits the 180 s timeout;
the abort listener is not removed and retains the session/snapshot (S3-4). No
network or native dialog path exists in the export code; the E2E dialog guard
is installed but the M4c2 suite does not explicitly assert zero dialog calls.
The asset protocol works for real images: my production-build probe exported a
640×360 `forest.png` and the PDF contained one real image XObject (205,530-byte
PDF), with no warnings.

### 3. Model source/settle

The snapshot is the current in-memory runtime (`toLayoutDocument`,
`resolvedPageSettings`, asset URLs, revision), not disk; the Page Edit overlay is
committed first, like save/close (`apps/desktop/src/renderer/src/App.tsx:208-222`,
`export-snapshot.ts:25-43`). The hidden window measures itself with
`createDomPageMeasurement` + `computePageModel` and builds the model from the
same run; it never reads the PageView registry, and the UI suite exports with
`.nf-page-view` absent. `build()` uses `flushSync`, waits for fonts, every
rendered image load/decode, and two frames, then sets `data-print-ready`; the
summary records `rendered`, `framesSettled`, and timings.

Stale/empty/invalid snapshots fail (`invalid-input`, `settings-mismatch`,
`empty-document`, `model-mismatch`, `model-error`), and the model is built from
one run, so there is no partial page set. The narrow gap is print-time asset
failure for dimensioned images (S2-2): measurement intentionally skips their
bytes, and `settleImages` does not report a load/decode failure. The bounded
font/image settles can also degrade silently (S3-5); `framesSettled:false` is
only a warning, so a throttled frame does not block the print (the DOM is
already committed synchronously, so this is a low risk).

### 4. Identity

R1 and R5 are closed on the production path. `pageModelFingerprint` is required
and non-empty; `buildPrintModel` compares it with the resolved fingerprint,
`layout.pageSetup`, `layout.geometry`, and `layout.layoutOptions` when present;
it requires `layout.documentId === document.id` and compares revision when both
exist (`packages/pdf/src/printModel.ts:220-287`). The hidden window passes
`measured.settingsFingerprint` from the same `computePageModel` run; the main
process re-checks the summary fingerprint/documentId/revision and the rendered
theme metrics (`apps/desktop/src/main/export-preflight.ts:34-73`). The tests
cover omitted/empty fingerprint, a different theme even with a fabricated
fingerprint, a stale fingerprint, another document, and an advanced revision.

A fabricated fingerprint still passes only if it matches the resolved settings
and the layout's recorded `layoutOptions`; a real layout prevents a wrong theme.
The remaining bypass is a hand-built layout with `layoutOptions` omitted
(S3-1), and a `rendered:true, metrics:null` summary is not rejected (S3-2).
R1/R5 are closed for the app; R4 (validated-run defects/warnings), R3 (title
helper), R6 (computed print metrics), R7 (outline/overflow refusal), R8 (white
background/one break), R9 (shared segment cache; 300-block timing deferred), and
R10 (numeric margins) are closed or explicitly deferred as reported.

### 5. Preflight/validation

`evaluatePreflight` blocks every `blockingDefects` entry and every overflowing
page, names the block title/id and page, and surfaces manual-break, anchor,
failed/missing asset, layout, and frames warnings
(`apps/desktop/src/main/export-preflight.ts:76-175`). The UI test reproduces a
`preflight-blocked` export with "Tall block" and no output/temp file. The
produced-PDF validation checks page count, every page's width/height/orientation
against the resolved geometry with a 0.25 mm tolerance (ADR allows at least
0.2 mm), overall real text, and per-page text presence; the observed A4/A5/Letter
PDFs are within 0.17 mm and every page has text.

Two gaps: a blank page is a warning, not an error (S2-1), and the check is
text-only, so a page with only page-number/header text passes and an image-only
page is labeled blank (S3-6). Missing `\uFFFD` glyphs are a warning. A valid
export is not spuriously rejected on the inspected paths: the page-size
tolerance covers Chromium's A4/A5 rounding, and the theme metric probe (root
font size 12 px, line ratio 1.3) passed; a comfortable-theme export is not in
the UI matrix, but the same CSS/identity path is used. The biggest false-
rejection risk would be turning `text.trim()===''` into an error without the
model/raster distinction; do not do that.

### 6. Job and atomicity

The state machine is `queued -> snapshot -> model -> print -> validate -> write
-> done`, with terminal failed/cancelled, monotonic progress, `getExportJob`
cloning, and cancellation via `AbortController` + session destroy
(`apps/desktop/src/main/export-job.ts:192-398`). Overwrite is explicit; the
first existing-file check happens before the snapshot, and the second before
the rename. The temp is in the output directory; after `printToPDF` the job
writes it, reads it back, inspects it, and renames only on success. Handled
failure/cancel paths delete the temp and never touch the output; the unit and UI
tests cover print/validation/write/inspect failure, cancel during snapshot and
print, overwrite, and preflight-blocked.

Residual gaps are the `exists`→`rename` TOCTOU, symlink-following temp write,
arbitrary output path, missing `fsync`/startup stale-partial cleanup (S3-3), no
job-level timeout for a crashed renderer (S3-4), and the cancel-arrives-after-
rename case (a complete PDF and job `done`; the report documents it). I did not
find a code path that leaves a partial output on a handled failure or cancel.
Two concurrent exports to the same path are not queued; with `overwrite:true`
the last rename wins, with `overwrite:false` the re-check usually rejects the
loser, but the race above can let one clobber the other.

### 7. PDF correctness

The UI suite's real PDFs match the resolved model: A4 landscape 297.01 ×
209.89 mm, A5 148.17 × 209.89 / reverse for landscape, Letter 215.90 × 279.40,
stacked 2 pages, mode A 1 page, all with extractable text and 0 replacement
glyphs. The print compositor uses one fixed sheet per derived page, direct
children of the print root, a shared `@page` size and geometry, and one
`break-after` rule with `:last-child { auto }`. `pdfOptionsFor` matches the
pinned Electron API: `pageSize` from the resolved setup, `landscape` from
orientation, `scale:1`, `printBackground:true`, `preferCSSPageSize:true`,
`displayHeaderFooter:false`, `generateTaggedPDF:false`, numeric zero inch
margins, no `marginType`. No blank page was observed on the fixture; the
raster PNGs show white pages, real text/arrows, and a continuation trunk on
stacked page 2.

I did **not** verify Page Read vs exported PDF geometry page by page; the M4c1
parity covers Page Read vs the print compositor/model, and the M4c2 hidden window
reuses the same measurement/projection, but the M4c3 raster gate must compare the
actual PDF raster to Page Read at the ADR 1.0 mm tolerance. The print window
inherits the production device scale (the E2E run forces
`force-device-scale-factor=1`) and does not explicitly disable animations; both
are M4c3 visual/Retina checks, not observed defects. The background is white and
the break rule works on the inspected pages.

### 8. M4c3 readiness

The pipeline is a sound base for M4c3, but M4c3 must **add** the gate matrix and
close the S2 items; do not treat M4c2's green UI suite as the PDF gate.

1. **Fix S2-1** (true blank page = export failure, using model fragments/images
   or raster ink; image-only page stays valid) and **S2-2** (print-time asset
   failures, dimensioned images, app placeholder, warning; real image test).
2. **Fix S2-3 packaging**: make `pdfjs-dist` a runtime dependency/unpacked
   worker and add a packaged-app export smoke; the current UI suite is a
   production `out` build, not an asar/app package.
3. **50+ page A4 fixture** from the M4c plan §4: body/headings/lists/quotes,
   long code, inline/display KaTeX, images at print resolution/missing
   placeholder/image-region anchors, tables crossing pages, callouts/wrapped
   children, semantic trunks, a broken-anchor marker, plus A5/Letter smoke.
4. **Gate assertions**: page count equals paginator; text extraction of every
   sentinel; no `\uFFFD`; no cut text/image/formula/code line/table row;
   continuation/ghost markers and trunks; page size/orientation/margins; no
   blank page (with the image-only rule); Page Read screenshot vs PDF raster at
   the ADR 1.0 mm gate; embedded-font check (`pdffonts`/pdfjs font data);
   Notability import with selectable text; product-owner visual check.
5. **Performance**: 300 blocks < 10 s, 1,000 < 30 s, memory < 1.5 GB; measure
   the renderer snapshot, `executeJavaScript` payload, hidden-window measurement,
   `printToPDF`, and `inspectPdf`; R9's 300-block Page Read projection cost.
6. **Tests/evidence**: real images/math/code/tables in the export suite, hidden-
   window console capture, no fixed sleeps/native dialogs, reproducible raster
   artifacts (the current PNGs are manual Builder evidence), `document-not-open`
   /snapshot-timeout/blank-page/rename/read-back/race cases.
7. **Product surface** (M4c3/Settings sequence): export menu/command + save
   dialog, progress/cancel, blocked/warning states, output-path confinement,
   overwrite confirmation, and the open manual-break F11 semantics decision.
8. **Hardening**: S3-2 summary/sender/package binding, S3-3 no-clobber/exclusive
   temp/fsync/cleanup, S3-4 redirects/crash/listener, S3-5 settle flags, S3-6
   raster/ink, S3-8 typed render failures. These can land in M4c3 unless the
   Orchestrator wants a separate hardening brief.

**M4c3 recommendation: add.** M4c2 is ready as the base; M4c3 should not be a
pure "run the fixtures" task because the gate has real fixes and packaging to
add.

## Checks run

| Check | Result | Timing |
|---|---|---|
| `npx vitest run apps/desktop/test/export-job.test.ts apps/desktop/test/export-preflight.test.ts apps/desktop/test/export-snapshot.test.ts packages/pdf/test/print-model.test.ts apps/desktop/test/print-parity.test.ts` | 5 files / 55 tests pass | 314 ms |
| `npm run build` (production renderer + main + print) | exit 0; `out/renderer/print.html` and `out/main/index.js` emitted | — |
| `node --test tests/ui/m4c2-pdf-export.test.mjs` | 7/7 pass; 0 pageErrors | suite 5.18 s / wall 13.40 s |
| `node --test tests/ui/m4c1-print-compositor.test.mjs` | 6/6 pass | suite 3.80 s / wall 11.89 s |
| M4c2 artifacts (`artifacts/m4c2/export/`) | 8 PDFs + `export-evidence.json`; page counts/sizes/text match the report; no `.partial` | — |
| Builder raster artifacts (`artifacts/m4c2/raster/`, Builder worktree) | 3 PNGs inspected: white A4 page, real text/arrows; stacked pages 1–2 with a continuation trunk; manual, not suite-generated | — |
| Local probe: real image through the hidden window (640×360 `forest.png`) | job `done`, no warnings; PDF 205,530 bytes, page 1 image XObject; asset protocol works | — |
| Local probe: same image deleted after open, image node with width/height | job `done`, `warnings: []`; PDF 61,106 bytes, 28×32 XObject (broken-image icon) + alt text; **S2-2 reproduced** | — |
| `npm run verify` (full) | Not run, per brief; reported green at `322d132` | — |

The review worktree had no local `node_modules`; I linked the parent checkout's
install at the same commit (`9859a18`) for the targeted runs. The build/UI ran
this worktree's `apps/desktop` source and `out`; no source was modified. No
fixed sleeps, native dialogs, or screen recordings were used. The probe scripts
are uncommitted temp files; the worktree's product code and tests are untouched.

## What I could not verify

- The full `npm run verify` at `322d132`; I relied on the reported baseline and
  reproduced the targeted M4c2/M4c1 suites.
- The packaged/asar app, notarization, and `pdfjs-dist` worker unpacking
  (S2-3); no packaging config exists in this slice.
- The 50+ page A4 gate, Page Read/PDF raster parity at 1.0 mm, font embedding
  (`pdffonts`), and Notability import; these are M4c3.
- A production Retina/device-scale export without `force-device-scale-factor=1`;
  the E2E harness forces 1.
- Real KaTeX/code/table/image-region exports in the committed suite; my real-
  image probe covers only a present image.
- 300/1,000-block export timings and memory; R9's 300-block Page Read projection
  remains deferred as reported.
- The product-owner PDF visual check and the F11 manual-break semantics
  decision; both are human/product gates.

## Open questions / risks

1. **Blank definition (S2-1).** A text-only blank check cannot distinguish a
   legitimately image-only page from a truly blank sheet. The fix needs the
   model/raster distinction; that is a technical decision, not a product-scope
   change. Do not simply turn `text.trim()===''` into an error.
2. **Missing/failed asset semantics (S2-2).** The plan allows a missing asset to
   export with a placeholder. The dimensioned-image path currently prints a
   browser broken-image glyph with no warning; decide whether the export should
   block or warn (the existing policy is warn + placeholder). I recommend warn +
   app placeholder, not block, so a damaged figure does not make the whole PDF
   impossible.
3. **Page Edit commit on export.** The snapshot handler commits a pending Page
   Edit overlay first, adding one structural undo entry (report risk 5). This is
   consistent with save/close, but it is a user-visible side effect of export;
   the product owner should confirm it is intended when the export UI lands.
4. **Output path/overwrite UI.** The M4c2 API has no user-facing export entry;
   M4c3 needs a save dialog, overwrite confirmation, progress/cancel, and
   warning presentation. The internal `outputPath` must not be able to target
   the document package (S3-3).
5. **F11 manual-break semantics.** Still an open product-owner decision before a
   mode-A callout UI; no M4c2 code blocker, but M4c3's fixture should not encode
   an unratified interpretation.
6. **Packaging (S2-3).** Shipping `pdfjs-dist` as a devDependency is a real
   packaged-app failure risk; the M4c3 gate is the right place to fix and prove
   it, but do not defer it past the packaged smoke.
7. **No user-facing export entry / warnings.** The job API is test-only; the
   report openly defers the menu/command/save dialog. M4c3 should not call the
   feature product-ready until the user can export and see blocked/warning
   states.
8. **Retina/device scale and animation disabling.** The plan mentions
   `deviceScaleFactor 1` and disabling animations; the hidden window does not
   set either explicitly. The PDF is vector and the inspected pages are fine;
   M4c3 should verify a Retina/real-display export and raster parity.

## Checklist/DoD update

I added reusable rules to `docs/review-checklist.md` (§6.6) and
`docs/definition-of-done.md` (§3.7):

- a produced blank page is an export failure, classified from the model
  (fragments/edges/images) or raster ink, not from text absence; an image-only
  page is not blank;
- print-time image/font/KaTeX decode failures are surfaced on the job, and a
  dimensioned asset that disappears/fails after measurement prints the app
  placeholder, not a browser broken-image glyph;
- the main process validates the hidden-window summary shape/finite geometry,
  binds the snapshot to the requested package/sender, and does not trust a cast;
- the packaged app ships the PDF inspector (`pdfjs-dist`) and its worker as
  runtime dependencies (unpacked if needed), and the export gate runs from the
  packaged app;
- the export suite includes a real present image and a dimensioned missing/
  failed image, not only a no-dimension placeholder fixture.

No product code, test, spec, UX, ADR, or plan was changed. No merge, push, or PR.

## Handback

- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-d761e672-9444ebe5517e1f81`
- **Branch:** `t3/review-m4c2-pdf-export-orchestration`
- **Reviewed head:** `9859a188cd935a549648c0770b157ebb7993c091` (`9859a18`)
- **Review commit:** the docs commit containing this report and the
  checklist/DoD lines; the SHA is in the handback message. No merge, push, or
  PR.
