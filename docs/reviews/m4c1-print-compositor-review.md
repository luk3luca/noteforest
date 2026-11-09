# Review — Targeted M4c1 Page print compositor + seam F1–F4

- **Reviewer:** Reviewer / Sentinel (independent)
- **Date:** 9 November 2026
- **Reviewed base:** `main` at `8286149` (M4c1 integration `bc50790` plus the review brief)
- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-0ac27256-3526209a824c5712`
- **Branch:** `t3/m4c1-print-compositor-sentinel-review`
- **Environment:** macOS 26.5.2 (Darwin 25.5.0, arm64), Node 22.23.1, Electron 45.2.1,
  production build (`npm run build`)
- **Stack/PDF:** Electron + shared paginator + `printToPDF` (ADR-0001, ADR-0002)
- **Theme/views:** compact Page theme (product default), Page Read; A4 landscape 12 mm (mode A),
  A5 portrait 12 mm (mode B2), A5 portrait 46 mm (stacked), Letter landscape 12 mm
- **Verdict:** **Accept with findings**

**What is accepted.** M4c1 delivers a real print model built from the same
`layoutDocument` + `paginate` output as Page Read, a print-only compositor that renders one fixed
sheet per derived page as a direct child of the print root, shared chrome/edge-label geometry, and a
settings/manual-break identity check. F1–F4 are closed on the inspected paths. There is **no S1**:
the model is read-only, the page count is the paginator's, and the print surface has real text and SVG
edge/compositor geometry. The targeted unit, UI, boundary, typecheck, and production-build checks
reproduce green, and a hidden-window `printToPDF` probe (6 A5 pages, no blank page) confirms the
compositor can be printed by M4c2 without CSS re-pagination.

**What is not accepted as M4c2 evidence.** The print entry renders a supplied model; it does not
produce one, and it exposes only an entry-ready marker, not a render-and-settle marker. The settings
identity is opt-in (`pageModelFingerprint?`), so a caller can pair a differently themed layout with
resolved settings and pass. The document identity (`document.id`/revision vs `layout`) is not checked.
Those are **S2 M4c2 contract items** (R1, R2), not M4c1 acceptance failures; they must be closed as
part of M4c2, before `printToPDF` is considered done.

## Scope reviewed

Reviewed:

- `packages/pdf/src/printModel.ts`, `packages/pdf/test/print-model.test.ts`.
- `packages/layout/src/page-chrome.ts`, `document.ts` (`contentBlockTitle`), `page-settings.ts`
  (`pageSettingsFingerprint`), `paginator.ts` (`blockingDefects`/`pageBlockingDefects`), `index.ts`.
- `apps/desktop/src/renderer/src/page/projection.ts`, `print-model-registry.ts`, `PageView.tsx`,
  `PageEdges.tsx`, `model.ts`, `usePageModel.ts`.
- `apps/desktop/src/renderer/src/print/PrintDocument.tsx`, `print.css`, `entry.tsx`,
  `test-surface.tsx`; `apps/desktop/src/renderer/print.html`.
- `apps/desktop/src/renderer/src/App.tsx` test bridge, `global.d.ts`, `main.tsx`,
  `apps/desktop/electron.vite.config.ts`, `package.json`.
- `apps/desktop/test/print-parity.test.ts`, `packages/layout/test/page-chrome.test.ts`,
  `tests/ui/m4c1-print-compositor.test.mjs`, the M4c1 report and artifacts.
- The diff `6147cf3..9ace62d` (28 files, +3653/−487) and `9ace62d..8286149` (docs only).

Not reviewed: the full-codebase token/Settings refactor, R3/R4, the product-owner Page visual check,
the unbuilt M4c2 export job, PDF font embedding/raster parity, and the 50+ page M4c3 gate. The full
`npm run verify` was not re-run (per the brief; green at `bc50790`).

## Acceptance criteria

| # | Criterion | Evidence | Result |
|---|---|---|---|
| F1 | Real `layoutDocument` + `paginate` parity: page count, page numbers, fragments, edges, trunks, routes, `pageNumberByBlock`, defects | `apps/desktop/test/print-parity.test.ts:302-390` (5 real-pipeline cases); `tests/ui/m4c1-print-compositor.test.mjs:274-334` mounts Page Read and print and compares per page | Pass (stub measurement at model level; real DOM in UI) |
| F2 | `PrintModel` carries resolved settings/theme/CSS, measurements/table columns, document, anchors, assets, defects, chrome; compositor has no renderer reach-in | `printModel.ts:56-135`, `:261-382`; `PrintDocument.tsx:260-299` takes only `model` + assets; `packages/pdf/test/print-model.test.ts:335-410` | Pass |
| F3 | Shared `pageChromeLayout`/`pageEdgeLabelLayout`; Page Read positions unchanged; parity test | `page-chrome.ts:40-50`, `:181-216`; `page-chrome.test.ts:118-132`, `:177-222`; `PageView.tsx:230-292`; `PageEdges.tsx:60-196` | Pass for geometry; content-title drift R3 |
| F4 | Resolved settings/manual-break fingerprint; mismatch fails loudly; test | `printModel.ts:165-222`, `:275-289`; `page-settings.ts:303-311`; `print-model.test.ts:444-505` | Pass as specified; theme/document identity gaps R1/R5 |
| C1 | One fixed page container per derived page; direct root children; no wrapper | `PrintDocument.tsx:278-298`; UI structure assertions `:285-297`; probe root children = `STYLE` + 6 `SECTION` | Pass |
| C2 | No CSS re-pagination; print skin colours/borders/shadows only; no metric changes | `print.css:1-14` static inspection; same `pageCssVariables` map on both surfaces (`PageView.tsx:766`, `PrintDocument.tsx:281`); no computed-style test (R6) | Pass by inspection; R6 evidence gap |
| C3 | Same static segments, edges/trunks, continuation/ghost, reference chips, broken/missing markers | UI page-by-page `innerHTML`, SVG paths, labels, chrome equality (`m4c1...test.mjs:299-312`); marker fixture `:430-475` | Pass |
| C4 | A5/Letter/portrait/landscape geometry smoke; page count equals paginator | `print-parity.test.ts:410-462` (6 setups); Letter UI `:404-428`; A5 probe below | Pass |
| C5 | Targeted tests + one `verify:fast` with real timings; report maps criteria | M4c1 report; my reruns below | Pass |

## Findings

No S1. **R1 and R2 are S2 M4c2 contract items**, not unmet M4c1 criteria. R3–R10 are S3 follow-ups.

| ID | Severity | Area | Location | Evidence | Expected | Actual | Smallest safe fix |
|---|---|---|---|---|---|---|---|
| **R1** | **S2 (M4c2)** | Settings identity is opt-in | `packages/pdf/src/printModel.ts:137-149` (`pageModelFingerprint?`), `:197-222` | A local probe built a compact layout/pages and then called `buildPrintModel(..., { settings: comfortable })` without the fingerprint. No throw; the model carried `--nf-page-body-size: 10.5pt` (comfortable) with compact-measured 60 px blocks. With the fingerprint supplied the same call throws. The M4c2 caller must always pass it. | A print model cannot pair a layout measured under theme X with resolved theme Y; the mismatch fails before rendering. | Different theme passes when the optional fingerprint is omitted; the CSS and the measured geometry can disagree, so PDF text metrics/boxes would not match Page Read. The in-app bridge currently passes it, so this is not a current user bug. | Make `pageModelFingerprint` required in `PrintModelOptions` (the bridge already has it), or record the resolved `LayoutOptions` fingerprint on `ContinuousLayout` and compare it. Document "same measured run" in the M4c2 brief. |
| **R2** | **S2 (M4c2)** | Model source and settle handshake | `apps/desktop/src/renderer/src/print/entry.tsx:37-50`; `apps/desktop/src/renderer/src/page/print-model-registry.ts:34-45`; `apps/desktop/src/renderer/src/page/PageView.tsx:449-487` | `print.html` renders only a supplied `PrintModel`; `entry.tsx:49-50` sets `dataset.printEntry = 'ready'` at module load, before any model render. The snapshot registry is populated only while PageView is mounted; Continuous is the default layout, so an export started from Continuous has no registry snapshot. React `root.render` commits asynchronously; there is no render/fonts/images-settled signal. | M4c2 can obtain a model from the current document (independent of the visible layout) and wait deterministically for the root, fonts, KaTeX, and images. | M4c2 must either export only while Page is mounted (poor UX and stale-window risk) or add an on-demand page-model build; it also has to guess readiness from selectors/rAFs. | Add a `render` promise or `data-print-ready` after commit + `document.fonts.ready` + image decode; add a model bootstrap (run `createDomPageMeasurement` + `computePageModel` in the hidden window, or pass a snapshot over IPC) and a clear "no model" failure surface. |
| **R3** | S3 | Title helper duplicated and already divergent | `packages/layout/src/document.ts:151-166` (`contentBlockTitle`); `apps/desktop/src/renderer/src/lib/tree.ts:342-350` (`blockTitle`); `packages/layout/src/page-chrome.ts:102`; `print/PrintDocument.tsx:181`; `page/PageView.tsx:172` | Probe: a math-only block returns `"\\lambda x"` from `contentBlockTitle` and `"Empty block"` from `blockTitle`. Page Read's `continues on page N` label and the print fragment `aria-label` now use the layout helper, while the sidebar, command palette, and Page Read fragment aria-label still use the renderer helper. | One stable block title for outline, page chrome, print, and accessibility. | The same block is titled differently in different surfaces; Page Read's continuation text changed for image/math/code-only blocks and no test pins that change. | Make `lib/tree.ts#blockTitle` delegate to `contentBlockTitle` (or move the helper to core) and add a non-text-block title test; at minimum, document and test the new fallback. |
| **R4** | S3 | Manual-break warnings from supplied pages can be stale | `packages/pdf/src/printModel.ts:165-195` (`paginationSignature` excludes defects/warnings), `:288` (`derived = paginated ?? expected`), `:338`, `:373-375` | Probe: pages paginated with the default (empty) hint list, model built with settings whose hint list contains `unknown-block`. The signature matches, no throw, and `model.manualBreakWarnings`/`model.defects` are empty. The re-derived `expected` run does produce the warning. | Unhonored or unknown hints are reported in the print model (checklist §6.5/§6.6) even if the hint did not change page geometry. | A warning-only mismatch is silently dropped; the PDF would not report an ignored hint. | After the signature check, take `defects`/`manualBreakWarnings` from `expected` (the validated run), or include them in the signature. Add one negative test. |
| **R5** | S3 | No document identity check | `packages/pdf/src/printModel.ts:268-289`, `:360-364` | Probe: built layout/pages from document A, then called `buildPrintModel(documentB, layoutA, pagesA, { settings })`; no throw, and the model carried document B's `"New A"` text with layout A's boxes. `layout.documentId` and `document.id` exist but are never compared. | A print model cannot mix a document with a layout/pages from another document; the mismatch fails loudly, like settings. | Same ids and page-compatible measurements let mixed content/geometry through silently. | Require `layout.documentId === document.id`; ideally carry `revision` on `ContinuousLayout` (or the snapshot) and compare it too. |
| **R6** | S3 | Metric parity is not automatically guarded; evidence gaps | `tests/ui/m4c1-print-compositor.test.mjs:149-245` (inline styles, attributes, text, `innerHTML` only); `apps/desktop/test/print-parity.test.ts:63-114` (stub measurement) | The UI test would still pass if `print.css` added `font-size`, `line-height`, or padding: it never compares computed styles or rendered boxes. The print-root screenshot (`artifacts/m4c1/ui/print-compositor-a-print-1440x900.png`) shows one mode-A page only. Real-DOM parity has no R2i case and no continuation chrome on a multi-page fixture (stacked is 2 pages; the continuation fixture is model-level with a stub port). | A print-skin metric drift and a real-DOM multi-page continuation fail a test. | Metric parity rests on static inspection of an 86-line skin; the screenshot is visual evidence, not a regression guard. | Add `getComputedStyle` checks for font-size/line-height/padding on card, label, chrome, edge label; add a real-DOM multi-page continuation/R2i fixture before the M4c3 raster gate. |
| **R7** | S3 | Defective pages print UI chrome and clip silently | `apps/desktop/src/renderer/src/print/print.css:21-30` (`overflow: hidden`); `apps/desktop/src/renderer/src/styles.css:4725-4736` (`.nf-page-sheet[data-overflow="1"]` dashed outline) | `PrintSheet` keeps `data-overflow`, so a defective page inherits the Page Read red dashed outline; `overflow: hidden` clips content instead of showing the overflow. `print.css` resets border/shadow but not outline. | A defective page blocks export with a clear preflight error; the print skin does not carry screen-only warning chrome. | A blocked document could print with a red outline and clipped content if M4c2 forgets the preflight (M4c1 does not block). | Reset `outline: none` in the print skin; M4c2 must refuse to print when `model.blockingDefects.length > 0` (or show a blocked state), and test it. |
| **R8** | S3 | Print-page background/break hardening | `apps/desktop/src/renderer/src/styles.css:56-70` (`body { background: var(--canvas); overflow: hidden }`); `apps/desktop/src/renderer/print.html:2` (`data-theme="light"` is inert, no `[data-theme]` rule); `print.css:32-35`, `:76-86` (both `break-before` and `break-after`) | Probe: body computed background `rgb(23,24,26)`, `overflow: hidden`; 6 A5 sheets still printed as exactly 6 pages, white, with text, so there is no reproduced blank page and no clipping. The dark body is covered by the white sheets but would show on an accidental blank/uncovered page. Both break rules are redundant. | A print page is always light; one owned rule maps one fixed sheet to one PDF page. | Correct today; one blank-page edge case would print dark, and the double break rule is an unnecessary fragility surface. | Add `html, body { background: #fff; }` (and consider `overflow: visible`) in `print.css`; keep one break rule (`break-after` with `:last-child { auto }`, or `break-before` on `+`), and assert PDF page count in M4c2. |
| **R9** | S3 | Page Read projection builds every page's segments on every content change | `apps/desktop/src/renderer/src/page/projection.ts:161-197`; `apps/desktop/src/renderer/src/page/PageView.tsx:409-424` | Before M4c1, `PageView` built segments only for the current page's fragments; now `projectPageContent` builds `buildSegments` for every fragment on every page, and its memo depends on `runtime.document`, so any content change re-renders all cards for all pages. | Page Read navigation/render cost stays proportional to the visible page; no full-document card rebuild on a command. | Unmeasured cost at 300/1,000 blocks; likely acceptable for command-frequency edits, but the old bound is gone. | Project lazily per visible page (or memo per page) and keep the shared function; measure in the M4c3 300-block pass. |
| **R10** | S3 (docs/M4c2) | `printToPDF` margin option in ADR-0002 is not Electron's API | `docs/adr/0002-pdf-pipeline.md:55-62`; `docs/tasks/m4c-pdf-plan.md:45-46` | Electron 45's `PrintToPDFOptions.margins` is `{ top, bottom, left, right }` in **inches**; there is no `marginType`. A probe with `margins: { marginType: 'none' }` produced a byte-identical PDF here because CSS `@page { margin: 0 }` won, but the ADR/plan would lead M4c2 to an untyped/ignored option. | M4c2 passes numeric zero margins (or relies on CSS with an explicit assertion) and the ADR/plan match the pinned Electron API. | The documented option shape is wrong for Electron. | M4c2 uses `margins: { top: 0, bottom: 0, left: 0, right: 0 }`; the Orchestrator updates the ADR/plan wording. |

## Answers to the eight brief questions

### 1. F1 parity

The parity is genuine at the level the seam needs. Every `apps/desktop/test/print-parity.test.ts`
case runs the real `layoutDocument` + `paginate`; the only stub is the `MeasurementPort`, and that is
acceptable because F1 is about the layout→pages→print-model handoff, not about DOM text measurement.
The UI suite uses the real DOM measurement path: it mounts Page Read on a fixture, snapshots each
sheet's attributes, content box, fragment boxes/card `innerHTML`, edge/trunk SVG structure and paths,
labels, and chrome, then mounts the print compositor and compares the same records page by page.
That is independent enough to catch a projection or model mapping error, and the mode/A/B2/stacked/
Letter/marker fixtures cover both callout topologies and diagnostics.

The model-level test also compares print records with the exact `projectPageContent` Page Read calls;
several fragment/edge assertions are necessarily self-referential (both sides consume the same
`paginated.pages`/`buildPageEdgeModel`), but the chrome/label/segment/page-number checks and the F3
fraction assertions are real. The remaining F1 gap is test shape, not evidence quality: no real-DOM
R2i print case, and no real-DOM continuation chrome on a multi-page fixture. Those belong in R6 and
in the M4c3 raster gate.

### 2. F2 completeness

`PrintModel` carries every input the compositor consumes: resolved `PageSettings`/`PageTheme`,
`pageCssVariables`, page setup/geometry, canonical `NoteDocument`, per-block measurements (segments,
table columns, content height), anchors/attachments, failed and missing asset ids, filtered asset
URLs, blocking/non-blocking defects, manual-break warnings, page fragments/edges/trunks, edge labels,
and shared chrome/labels. `PrintDocument` takes only `model` plus an optional asset map; it calls the
same `projectPageContent`/`PageEdges`/`buildSegments` as Page Read, and reads no renderer store,
runtime, or selection state. The unused `document` parameter from the pre-M4c1 model is now the
content record. Good.

For M4c2 the model is serializable (plain records; a probe JSON round-trip into a hidden window
worked) and bounded (`@noteforest/pdf/index.ts` exports only `printModel.js`; the renderer does not
pull `verifyPdf`/Node code; boundary and typecheck are green). What is missing is not model data but
the handoff contract: where the measured run comes from when Page is not mounted (R2), and a
render-settled signal for the hidden window (R2).

### 3. F3 chrome and labels

The extraction is an exact refactor. `pageChromeLayout` reproduces `margins × 0.3/0.62` (top) and
`× 0.3/0.6` (bottom); `pageEdgeLabelLayout` reproduces `right: −margin+2`, `left: −margin+2`,
`maxWidth: max(18, margin−4)`, and the `from`/`to` y anchors. `PageView`/`PageEdges` now consume the
records, and `page-chrome.test.ts` pins the literal fractions/offsets rather than only comparing two
callers. The Builder reports the Page UI regression suites green; I did not rerun them, and I did not
find a moved label or band in the diff.

One text change is outside what the parity test can catch, because both surfaces now share the new
helper: the `continues on page N · <block>` label uses `contentBlockTitle` instead of the renderer's
`blockTitle`. For normal text blocks they are identical; for math/image/code-attribute-only blocks
they diverge today (R3: `"\lambda x"` vs `"Empty block"`). The print fragment `aria-label` also uses
the layout helper while Page Read's uses the renderer helper. The duplication is a real drift risk and
should be collapsed to one source.

### 4. F4 identity

The fingerprint is deterministic over size, orientation, margins, the whole theme object, and the
manual-break list. `buildPrintModel` checks the optional page-model fingerprint, `layout.pageSetup`,
and `layout.geometry` against the resolved settings, then re-paginates with the resolved manual breaks
and compares a detailed page/fragment/continuation signature. A different page setup, different
manual breaks, and a stale fingerprint all throw `PrintModelSettingsMismatchError`; the tests cover
them. The extra `paginate` pass is acceptable: it is the same paginator, runs once per model build
(not per keystroke), and the M4c2 export path can afford it. Carrying pagination options on
`PaginatedDocument` would only remove a cheap pass; it is not required.

The gaps are the opt-in theme identity (R1: without `pageModelFingerprint`, a differently themed
layout passes; probe above), the unvalidated document identity (R5), and warning-only manual-break
differences (R4). The in-app bridge passes the fingerprint from the same run, so M4c1's user path is
sound; M4c2 must not drop that argument.

### 5. Compositor

One fixed `section` per derived page, direct children of `[data-print-root]` (plus one `<style>` for
`@page`). No CSS paged-media re-pagination: `print.css` has no page-size or fragmentation rule for
content, and `break-*` only maps a fixed sheet to a PDF page. The `@page` size is the oriented
`pageWidthMm × pageHeightMm` (A4 210×297 or 297×210, A5 148×210, Letter 215.9×279.4), with
`margin: 0` and internal sheet margins from `PageGeometry`; the print root applies the resolved
`pageCssVariables` map, and the skin only changes colours/borders/shadows/shadow reset. There is no
metric declaration in `print.css`.

A local hidden-window probe (not committed) loaded the production `print.html`, injected a 6-page A5
model, waited for fonts/images/two frames, and called `webContents.printToPDF` with
`pageSize: 'A5'`, `preferCSSPageSize: true`, `printBackground: true`, `scale: 1`, zero margins. The
PDF had **6 pages**, 148.17 × 209.89 mm each (within the ADR 0.2 mm rounding), real text on every page,
and no blank page. Root children were `STYLE` + 6 `SECTION`s, and body `overflow: hidden` did not clip
pagination. The double break rule (`break-before` on `+` and `break-after` in `@media print`) did not
produce a blank page here, but it is redundant; keep one rule and validate page count in M4c2 (R8).

Two print-skin edge cases remain: defective pages inherit the Page Read red dashed outline and are
clipped by `overflow: hidden` (R7), and the page body is dark (`body { background: var(--canvas) }`;
`print.html`'s `data-theme="light"` is inert). The white sheets cover the page, so the probe output is
light, but an accidental blank/uncovered page would be dark (R8).

### 6. Entry and security

`print.html` is a local-only surface: CSP matches the app's `index.html` policy (no remote script,
`connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`), and images may
use `self`, `data:`, `blob:`, and `noteforest-asset:`; fonts are `self`/`data:`. There is no preload,
no Node integration, and the production bundle links its own hashed module/CSS. The probe ran the
entry with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The asset scheme is
registered globally by the main process (`protocol.handle` on the default session), so a hidden
window on the default session will inherit it; a partitioned window would need its own registration
(M4c2).

`App.tsx` keeps `renderPrint`/`clearPrint` inside the existing `window.__noteforestTest` bridge (the
same object that already exposes `seed`, `openPath`, `applyStructural`); there is no user flow, menu,
or IPC path to it, and it only builds from the active Page snapshot. It is production-bundled like the
rest of the test bridge, which is an existing project pattern, not a new exposure. The renderer import
of `@noteforest/pdf` is bounded: `packages/pdf/src/index.ts` exports only `printModel.js`, and the
boundary/typecheck checks are green.

### 7. Tests and evidence

Strong: the UI suite is a real independent DOM comparison (not the same projection object), it uses
no fixed sleeps, it navigates with the app's own page controls, it asserts zero renderer page errors,
and it covers mode A/B2/stacked, Letter landscape, and broken-anchor/missing-asset markers. The
`page-chrome` unit suite pins literal geometry, so a fraction drift fails. The F4 tests cover four
mismatch shapes. The report's page count/geometry table is consistent with the geometry formula and
the page counts observed in the UI run.

Weak/gaps: the model-level parity test uses a stub measurement port and some comparisons are
self-referential; the UI test compares inline styles/attributes/text/`innerHTML`, not computed styles
or rendered boxes, so a `print.css` metric drift would pass (R6). The print-root screenshot is one
mode-A page — adequate to show the skin and a rendered page, not a regression guard or a multi-page/
continuation visual. Real-DOM R2i and continuation coverage is missing (model-level only). What only
M4c2/M4c3 can verify: the hidden-window lifecycle, the asset protocol/images/fonts/KaTeX in that
window, `printToPDF` page count/no-blank on the actual export path (my probe is a manual sanity check,
not the job), packed fonts, raster parity at the ADR tolerance, text extraction on the 50+ page
fixture, cancellation/atomic output, and the 300-block performance/export budget.

### 8. M4c2 readiness

**Ready** for the compositor/model foundation; M4c2 must **add** the orchestration and close R1/R2
before `printToPDF` is accepted:

1. **Model source.** Add an on-demand page-model build (the hidden window can reuse
   `createDomPageMeasurement` + `computePageModel`, since it already loads the page styles/fonts) or
   pass a snapshot over IPC from a renderer that measured it. Do not rely on the PageView registry:
   it exists only while Page layout is mounted, and Continuous is the default. Block/queue the export
   when the model is stale or `updating`.
2. **Settle handshake.** Extend `entry.tsx`/`print.html` with a post-render ready signal (commit,
   `document.fonts.ready`, KaTeX fonts, every image `decode()`, two animation frames), or return a
   promise from `render`. Keep the existing entry-ready marker for bundle loading only.
3. **Hidden window.** `show: false`, `backgroundThrottling: false`, context isolation/node integration
   off, sandbox on, default session (or register `noteforest-asset:` on the used session), destroy
   after capture; no dialogs.
4. **`printToPDF` options.** Numeric zero margins (`{ top: 0, bottom: 0, left: 0, right: 0 }`), not
   `marginType` (R10); `pageSize` matching the resolved setup, `landscape` matching orientation,
   `printBackground: true`, `preferCSSPageSize: true`, `scale: 1`, no header/footer, no tagged PDF.
5. **Preflight.** Refuse export when `model.blockingDefects.length > 0` (and surface
   `manualBreakWarnings`, failed/missing assets, and `page.overflow`) with the affected block names;
   the PDF is never a silent clipped page (R7).
6. **Atomic output and failure surfaces.** Write a temp file, inspect page count/page size (the
   existing `inspectPdf` can do it), rename only on success, delete on failure; catch
   `PrintModelSettingsMismatchError`, a missing model, a render error, `printToPDF` failure, and a
   write error; no partial file; cancellation destroys the window and leaves the document untouched.
7. **Validation test.** Assert the produced PDF page count equals `model.pageCount` and each page's
   size/orientation equals the resolved geometry, with no blank page; the probe above is the shape of
   that check. Keep the 50+ page/raster/font gates for M4c3.
8. **Hardening.** White print-page background and one break rule (R8); computed-style parity or a
   raster gate (R6); required fingerprint and document-id check (R1/R5); warning carry (R4); one
   title helper (R3). Payload size is fine for normal documents; if a 300-block model is slow to
   serialize, send it over IPC rather than a giant `executeJavaScript` string.

Defer to M4c3: 50+ page A4 gate, text extraction with `pdftotext`/pdfjs, font embedding (`pdffonts`),
raster parity at 1.0 mm tolerance, 300/1,000-block export performance, and the product-owner PDF
visual check. Defer to the Settings/full-codebase sequence: F5 (Comfortable density-only decision,
already fixed on this tree), F10 (mode A anchor association), F11 (manual-break semantics), and the
F7–F9 token inventory. Those are not reopened by this review.

## M4c2 recommendation

**Ready** — start M4c2 export orchestration on this foundation. The print model/compositor is the
right contract and no M4c1 code change blocks it. Treat R1/R2 and the M4c2 add list above as the
M4c2 gate, not as optional polish; R3–R10 can land as follow-ups or be folded into M4c2 cheaply.

Do **not** treat the green M4c1 unit/UI tests as the PDF gate. M4c2's own acceptance must include a
real hidden-window export from the packaged app, exact page count/size, no blank page, no network,
and atomic failure.

## Checks run

| Check | Result | Timing |
|---|---|---|
| `npx vitest run packages/pdf/test packages/layout/test/page-chrome.test.ts apps/desktop/test/print-parity.test.ts` | 3 files / 25 tests pass | 164 ms |
| `node --test tests/ui/m4c1-print-compositor.test.mjs` (after `npm run build`) | 5/5 pass, 0 pageErrors | 10.16 s suite / 18.27 s wall |
| `npm run build` (production renderer) | exit 0; `out/renderer/print.html` emitted | — |
| `npm run check:boundaries` | 153 files / 740 imports / 16 rules, no violations | — |
| `npm run typecheck` | all workspaces pass | — |
| Local probes (not committed, removed): title helper, theme/document identity, manual-break warning, hidden-window `printToPDF` | Probes reproduced R1/R3/R4/R5; 6-page A5 PDF, 148.17 × 209.89 mm, real text, no blank page | — |

No full `npm run verify` was run (per the brief; the Orchestrator's baseline at `bc50790` is green).
No fixed sleeps, native dialogs, or screen recordings. The worktree was clean apart from the review
report and the checklist/DoD lines before the review commit.

## What I could not verify

- The full `npm run verify` at `bc50790`; I relied on the reported green baseline and reproduced the
  targeted M4c1 suites.
- The product-owner Page/PDF visual check; it remains a human gate.
- The M4c2 hidden-window job (asset protocol with real images, font/KaTeX settle in the actual job,
  cancellation, atomic write, packaged-app path) and the M4c3 50+ page/raster gate.
- R2i real-DOM print parity and real-DOM continuation chrome; only the model/projection/segment level
  exists today.
- 300/1,000-block Page Read projection/DOM timing after the all-pages projection change (R9).

Confidence: high on the model/compositor paths and the targeted suites I ran; medium on the full
50+ page print behavior and the packaged-app export, which M4c2/M4c3 own.

## Open questions / risks

1. **M4c2 model source (R2)**: decide whether the hidden window measures the page model itself or a
   visible renderer hands it over. This is the main architectural choice left before `printToPDF`.
2. **Theme identity (R1)**: should `pageModelFingerprint` become required, or should
   `ContinuousLayout` carry the resolved `LayoutOptions` fingerprint? Either closes the gap; the
   Orchestrator should choose before M4c2 starts.
3. **Product owner (unchanged)**: F5 Comfortable topology is already density-only on this tree; F10
   mode-A anchor association and F11 manual-break semantics still need the product-owner
   visual/decision pass, but they do not block M4c1 or M4c2.
4. **R3 title helper**: the Page footer now shows a better title than the sidebar for math/image-only
   blocks. Unifying changes renderer copy; it is a small UX decision, not a layout decision.
5. **R8 blank-page risk is verified only at 6 A5 pages**. M4c2 must keep the produced-PDF page-count
   assertion; M4c3's 50+ page A4 gate covers the larger matrix.

## Checklist/DoD update

I added the reusable rules to `docs/review-checklist.md` (§6.6) and `docs/definition-of-done.md`
(§1.12/§3.7):

- the print model must be tied to the exact measured run (resolved settings fingerprint including
  theme, and document identity); a mismatch fails before rendering;
- print metric parity must be asserted by computed style or raster comparison, not only inline
  attributes/snapshot HTML;
- the export job must validate the produced PDF page count and page size against the paginator and
  write atomically; a blank page or count/size mismatch is an export failure.

No product code, test, spec, UX, or ADR was changed.

## Handback

- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-0ac27256-3526209a824c5712`
- **Branch:** `t3/m4c1-print-compositor-sentinel-review`
- **Reviewed head:** `8286149a8d2c2dd62ad19e49e0e1a3c0461eb449` (`8286149`)
- **Review commit:** the docs commit containing this report and the checklist/DoD lines; see the
  handback message for its SHA. No merge, push, or PR.
