# Spike 1 — Adaptive layout + paginator + real-text PDF

**Status:** Approved by the product owner (3 November 2026)  
**Owner:** Builder (worktree), reviewed by Orchestrator + Sentinel  
**Timebox:** 5 working days  
**Stack:** Electron + React + TypeScript (ADR-0001), `printToPDF` (ADR-0002)  
**Depends on:** `docs/spec.md` v0.4 §7, §11, §15.4, §15.13; ADR-0001; ADR-0002

## Why this spike

The product's risk is not the editor or the API; it is the page. Three things must be proven together before the team builds the rest:

1. An **adaptive tree layout** with content-driven widths, children placed right or wrapped below with an indent, anchored callouts, and no overlaps.
2. A **paginator** that turns that continuous layout into A4 pages with safe breaks, continuation/ghost markers, and table rows that never split.
3. A **real-text PDF** produced from exactly those pages by Electron `printToPDF`, with page count and geometry matching the page view.

If this spike fails, the product's core promise is at risk. If it passes, the rest is conventional product work.

## Questions the spike must answer

- Can a pure TypeScript layout package produce stable, non-overlapping adaptive geometry for a 300-block document?
- Can the same package expose **break candidates** that let the paginator split a block without re-laying-out or clipping?
- Can a print compositor render already-derived pages at exact A4 size, with real text, formulas, code, images, and tables, and print them with `printToPDF`?
- Do page count, breaks, continuation markers, and block positions match between the page view and the PDF?
- Does `printToPDF` preserve selectable text and vector content in a 50+ page document?
- Which assumptions in the spec are wrong or underspecified? Record them; do not silently change the product.

## In scope

- Minimal Electron + React + TypeScript app, single window, fixture loader.
- `packages/layout`: measurement adapter, adaptive layout, break candidates, paginator, geometry types, fixtures.
- A fixture renderer for a subset of the content model: paragraphs, headings, emphasis/strong, lists, blockquotes, code blocks, inline/display KaTeX, images (local asset), tables, anchor highlights.
- A continuous **reader-like** view with page-break markers.
- A **page view** that renders derived pages.
- A **print compositor** that renders derived pages at exact A4 dimensions and prints with `webContents.printToPDF`.
- Tests: Vitest for layout/pagination geometry; Playwright for the app; PDF text extraction and raster comparison.
- A report with measurements, screenshots, the PDF, and gate results.

## Out of scope

- The real TipTap/ProseMirror editor, CodeMirror, React Flow, outline UI, block commands, keyboard model.
- Persistence beyond loading a fixture JSON; no autosave, no backups, no migration.
- External API, MCP, tokens, audit, locking.
- Anchor creation/repair UI; anchors are fixture data only.
- Multiple documents, search, themes, packaging, Windows/Linux, iPad.
- Final visual design. Use a neutral print theme; the spike is about geometry and PDF, not polish.
- A second PDF pipeline. If `printToPDF` fails, stop and report; do not silently add PDFKit/Typst.

## Deliverables

| ID | Deliverable | Notes |
|---|---|---|
| **D1** | Repo scaffold | pnpm workspace (or npm workspaces if pnpm is unavailable; record the choice). `apps/desktop`, `packages/layout`, `packages/pdf`. Electron main/preload/renderer with `contextIsolation`, no `nodeIntegration`, no remote content. |
| **D2** | Fixture schema + loader | A subset of the spec's illustrative schema; no second permanent model. Load from `fixtures/*.json`. Include the golden fixture from spec Appendix A. |
| **D3** | Measurement adapter | Offscreen DOM measurement at a given width; returns block intrinsic width/height, line boxes, anchor rects, and safe break candidates. Injected into the pure layout package; no DOM in `packages/layout` core. |
| **D4** | Adaptive layout | `layoutDocument(document, measurement, pageSetup) -> continuous layout` with block boxes, anchor attachments, edge routes, and defects. Deterministic. |
| **D5** | Paginator | `paginate(layout, pageSetup, hints) -> derived pages`, each with fragments and continuation records. No clipping; fragments are content-node ranges. |
| **D6** | Page view + reader markers | Page view renders derived pages; reader shows continuous blocks with page-break markers. Both use the same geometry. |
| **D7** | Print compositor + export | Fixed A4 pages, print theme, header/footer, page numbers, continuation/ghost markers, vector arrows, `printToPDF`. Atomic file write. |
| **D8** | Test suite + report | `pnpm test`, `pnpm e2e`, `pnpm pdf` or equivalent; report at `docs/spikes/spike-01-report.md`; PDF artifact and screenshots. |

## Fixtures

All fixtures use the spec schema subset and are checked in. Do not hand-tune expected geometry unless the fixture is a deliberate golden test.

| ID | File | Purpose |
|---|---|---|
| **F1** | `fixtures/golden-eigenvalues.json` | Spec Appendix A: one chapter, top-level blocks, direct child, anchored child, shared child/reference edge, formula/code anchors, a continuation. |
| **F2** | `fixtures/long-50-pages.json` | 50+ derived pages: paragraphs, headings, nested lists, blockquotes, an 80-line code block, inline and display KaTeX, images, tables crossing pages. The PDF gate fixture. |
| **F3** | `fixtures/wide-fan.json` | One parent with 8–12 children of very different widths; cases where children fit right and cases where they must wrap below with an indent. |
| **F4** | `fixtures/deep-chain.json` | 5 levels of depth; nested anchored callouts; a branch that continues on the next page. |
| **F5** | `fixtures/shared-child.json` | One primary home + two reference edges; a reference cycle; assert one card/one outline entry, reference edges do not move geometry. |
| **F6** | `fixtures/tables.json` | A 30-row table that crosses a page, a header row, and one row taller than the page content height (defect case). |
| **F7** | `fixtures/scale-300.json` | 300 blocks across 3 chapters; performance and stability fixture. Generated by a script, checked in or reproducible. |
| **F8** | `fixtures/defects.json` | A block with no safe break, a too-wide unbreakable image, an impossible manual break hint, a missing asset. Assert warnings/defects, no clipping. |
| **F9** | `fixtures/broken-anchor.json` | Broken/ambiguous anchor marker, branch still exported once. |

## Architecture constraints

These are not suggestions; deviating requires an Orchestrator decision.

1. **One layout engine.** `packages/layout` is pure TypeScript. React, DOM, Electron, and TipTap do not appear in its core. Measurement is injected.
2. **No clipping.** A continuation fragment is a **content-node range** (paragraphs, list items, code lines, table rows), not an `overflow: hidden` slice of a full block. The print compositor must not duplicate hidden text into the PDF text layer.
3. **Break candidates are first-class.** The layout engine returns, per block, a sorted list of safe break candidates: `{ kind: 'paragraph' | 'list-item' | 'blockquote-paragraph' | 'code-line' | 'table-row', nodePath, y }`. The paginator uses only these. A block with no candidate that fits is a defect.
4. **The paginator decides breaks.** CSS print fragmentation is disabled/neutralized: one fixed-size page container per derived page, `@page { size: A4; margin: 0 }`, internal padding for margins. The print renderer never re-paginates.
5. **The print compositor is dumb.** It consumes derived pages and fragments, not the document tree to re-layout. It may format text, but it does not decide positions or breaks.
6. **Determinism.** Same fixture + page setup + hints + font state = same geometry, pages, and PDF page count. No randomness, no time-dependent layout, no animations in print.
7. **No new canonical model.** Fixtures use a subset of the spec schema. If the spec schema is insufficient, write a finding; do not invent a parallel document format.
8. **Page geometry.** A4 portrait 210 × 297 mm, landscape 297 × 210 mm; default 20 mm margins; content area = page minus margins. Use millimetres for print pages and a single fixed conversion from layout px (96 dpi) to mm. No `transform: scale()` on text.
9. **Tables.** Break only between rows. A row and its cells are atomic. A row taller than the page content height is a defect; do not cut.
10. **Electron security.** Renderer sandbox, context isolation, no Node integration, preload bridge exposes only `exportPdf` and fixture loading; CSP blocks remote content; no remote fonts/images.

## Gates

The spike passes only if every hard gate passes. Record exact commands and evidence in the report.

### G1 — Build and run

- Clean checkout: install, typecheck, unit tests, and e2e tests pass with one command each.
- App launches, loads F1, and shows reader + page view without console errors.
- Print export runs from the app, not a separate script.

### G2 — Adaptive layout

- F1, F3, F4, F7 lay out with no overlapping block rectangles.
- Minimum clear gap between visible block bounds is ≥ 16 logical px at 100% zoom.
- Widths vary with content; no fixed per-depth column, no manual pins.
- A child is placed to the right when its footprint fits; otherwise below the parent with a visible indent. The rule is documented and deterministic.
- An anchored callout's left edge is within 2 px of its anchor's left edge and its top is below the anchor; callouts do not overlap blocks or each other.
- Reference edges do not move any block or change pagination.

### G3 — Pagination

- F2 produces at least 50 A4 pages; page count equals the paginator's output.
- No text line, image, formula, code line, or table row is cut. Table breaks occur only between rows.
- Continuation markers appear on the source page and "continued from" + ghost parent on the target page, exactly where the paginator reports continuations.
- A block with no safe break is reported as a defect; the app does not clip or auto-scale.
- Manual break hints are honored where possible; impossible hints produce a warning, not an empty page.
- Each chapter starts on a new page; no unexpected blank pages.
- F6: the too-tall row is a defect; the row is not split.

### G4 — PDF fidelity (the hard gate)

- PDF page count equals the paginator's derived page count.
- `pdftotext` or `pdfjs-dist` extracts all body, label, code, and table text (line-break normalized); no `�` or missing glyphs.
- Body text, code, table text, and labels are selectable/searchable; formulas render visually correctly (formula text extraction is best-effort).
- Images are embedded at print resolution; a missing asset is a labeled placeholder.
- Primary/reference arrows and block borders are vector, not a screenshot.
- Page size, orientation, and margins match `pageSetup`; no unexpected blank page.
- Page-view geometry and PDF page geometry agree: block bounds within 1 mm, same breaks, same continuation positions, same page count. Text antialiasing is excluded.
- Export writes a temporary file and renames on success; a forced failure leaves no partial PDF.
- Notability import: body text can be selected/highlighted/searched; code and formulas are readable. Attach a screenshot.

### G5 — Performance

- F7 (300 blocks): warm layout < 50 ms; edit/remount reflow < 100 ms; 60 fps scrolling in the reader/page view on the reference Mac (or a recorded explanation).
- F2 export: 50+ page PDF < 10 s.
- F7 export: 300-block PDF < 10 s.
- F8 optional 1,000 blocks: report open time, layout time, memory, and whether collapse/LOD is needed. Not a hard gate in the spike.

### G6 — Stability

- F7 add-block: ≥ 95% of pre-existing blocks keep x and y within 2 px; blocks in the affected subtree/sibling group may move; unrelated chapters do not move.
- F7 delete-block: every surviving block outside the affected group moves ≤ 1 px; page breaks may change.
- Reference edge add/remove: zero block movement and zero page-break change.
- Reopening the same fixture with unchanged fonts/page setup produces the same page count and geometry snapshot.

### G7 — Defects and errors

- F8 surfaces actionable defects: content too wide, no safe break, impossible hint, missing asset.
- No silent clipping, auto-scaling, or data loss.
- A failed export shows a clear error and does not leave a partial file.

### G8 — Visual evidence

- Screenshots: reader with page-break markers; page view with a continuation; PDF raster of the same page; Notability import.
- A short screen recording (≤ 30 s) of loading F2, switching to page view, and exporting.
- The PDF artifact is attached to the report (or linked from the repo, not committed if large).

### G9 — Report

`docs/spikes/spike-01-report.md` contains:

- commit, Electron/Chromium/Node versions, hardware;
- gate table with pass/fail and evidence links;
- measurements: layout ms (cold/warm, median/p95), PDF seconds, page count, file size, memory;
- what matched, what drift was observed, and the tolerance used;
- spec/ADR findings and proposed amendments (do not edit the spec yourself);
- recommended next step.

## Implementation sequence (suggested)

1. **Day 1:** scaffold, fixture schema/loader, F1 render, measurement adapter, geometry types.
2. **Day 2:** adaptive layout + F1/F3/F4; overlap/gap/anchor assertions; reader markers.
3. **Day 3:** break candidates + paginator + F2/F6; page view; continuation/ghost markers.
4. **Day 4:** print compositor + `printToPDF`; text extraction; geometry comparison; F2/F7.
5. **Day 5:** performance, stability, defects, Notability, report, cleanup. If the gate is at risk, stop at the checkpoint and report.

This sequence is a suggestion, not a contract. Do not skip the PDF gate to polish UI.

## Measurement method

- Use `performance.now()` around the pure layout call; report cold (first run, fonts loaded) and warm (median/p95 of 20 runs).
- Measure the continuous layout and the paginator separately.
- PDF time is wall-clock from export request to file rename, including hidden-window creation and font/image settling.
- Memory: app RSS after loading F7 and after export; note the peak during export.
- Visual comparison: render the PDF page to PNG (e.g. `pdftoppm -r 150`) and compare block bounds by overlaying the page-view screenshot at the same scale. Report the method and any tolerance.

## Stop conditions

Stop and report immediately if:

- `printToPDF` cannot produce fixed A4 pages or loses text in a way that is structural, not a CSS fix.
- The adaptive rule cannot avoid overlaps at 300 blocks without shrinking text below the print theme.
- The paginator cannot split blocks without clipping or duplicating text.
- The timebox expires. A partial, honest report is better than a silent scope expansion.

Do not add a second PDF pipeline, a new document model, or a full editor to rescue the spike.

## Approved dependencies

Spike-only:

- `electron`, `react`, `react-dom`, `typescript`, `vite`, `electron-vite`, `vitest`, `playwright`.
- `katex` for formulas.
- `pdfjs-dist` and/or system `pdftotext`/`pdftoppm` for extraction/raster comparison. Prefer the system Poppler tools if available; otherwise `pdfjs-dist`.
- Type packages as needed.

Do **not** install TipTap/ProseMirror, CodeMirror, or React Flow for this spike; arrows can be SVG. They are approved for later milestones, not needed here.

Any other dependency requires Orchestrator approval before install.

## Handoff

- Work in a git worktree; report the worktree path and branch.
- Do not merge. The Orchestrator integrates after review.
- Do not edit `docs/spec.md`, `docs/ux.md`, `docs/plan.md`, or the ADRs. Report findings and proposed amendments.
- Commit in small, reviewable steps; tests and fixtures with the code.
- At the end, send the report, the PDF path, screenshots, and a one-paragraph recommendation.
