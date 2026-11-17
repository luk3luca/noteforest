# Spike 1 report — adaptive layout, paginator, and real-text PDF

**Status:** Builder report for Orchestrator + Sentinel review  
**Date:** 3 November 2026  
**Worktree:** `a builder worktree`  
**Branch:** `t3/spike-01-layout-paginator-pdf`  
**Gate-run code commit:** `fc93058` (`test(spike-01): Playwright e2e, PDF verification, and automated gate harness`)  
**Brief:** `docs/spike-01-layout-paginator-pdf.md`  
**Spec:** v0.4 §7, §11, §15.4, §15.13, §4.11 and Appendix A  
**ADRs:** ADR-0001 (Electron), ADR-0002 (`printToPDF`)

## 1. Outcome

The hard gate is met on the automated criteria:

- a pure TypeScript adaptive layout produces content-driven widths, right placement, wrap-below-with-indent, anchored callouts, reference edges, and no overlaps at 300 blocks;
- the paginator derives **53 A4 pages** for F2 and breaks only at paragraph, list-item, blockquote-paragraph, code-line, or table-row boundaries;
- Electron `webContents.printToPDF` produces a **53-page PDF whose page count equals the paginator's**, with selectable text, embedded images, vector borders/arrows, no missing-glyph markers, and page-view geometry within **0.48 mm** of the PDF;
- the atomic-write failure path leaves the previous PDF byte-identical and no temporary file.

The automated acceptance is complete. Visual review of the generated PDF on macOS is the product owner's acceptance; the Builder does not claim that visual judgement.

## 2. Environment and exact commands

| Item | Version |
|---|---|
| Hardware | MacBook Pro, Apple M5, 24 GB RAM, macOS 26.5.2 (25F84) |
| Host Node / npm | Node 22.23.1 / npm 10.9.8 |
| Electron | 45.2.1 |
| Chromium | 156.0.8078.75 |
| Electron Node / V8 | 24.22.1 / 15.6.75.25-electron.0 |
| TypeScript | 5.9.3 (strict) |
| Build | Vite 8.3.5 + electron-vite 6.0.0 |
| UI / math | React 19.3.1, KaTeX 0.19.1 |
| Tests | Vitest 5.1.0, Playwright 1.64.1 |
| PDF verification | pdfjs-dist 6.5.438, @napi-rs/canvas 1.1.0 |

`pnpm` is not installed; this worktree uses **npm workspaces**: `apps/desktop`, `packages/layout`, `packages/pdf`.

```bash
npm install
npm run typecheck
npm test
npm run e2e
npm run spike:gates
npm run spike:gates:summary
node scripts/verify-pdf.mjs fixtures/long-50-pages.json artifacts/spike-01/spike-01-long-50-pages.pdf
node scripts/raster-pdf.mjs artifacts/spike-01/spike-01-long-50-pages.pdf artifacts/spike-01/rasters/F2 150 3,5
```

The host shell sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node. The app's `dev`/`start` scripts unset it; the e2e and gate launchers remove it from the child environment explicitly. This is an environment quirk, not an app requirement.

`npm run spike:gates` builds first, launches the real Electron app, drives every fixture, exports through the app, verifies the PDFs with pdfjs-dist, checks geometry, stability, and the atomic failure path, and writes `artifacts/spike-01/gates.json`. These `spike:*` commands document the historical Spike 1 harness; they are not part of the M2 gate and target the removed demo renderer.

## 3. What was delivered

| ID | Deliverable | Result |
|---|---|---|
| D1 | Scaffold | npm workspaces; Electron main/preload/renderer; `contextIsolation`, `sandbox`, no `nodeIntegration`, CSP, local-only content |
| D2 | Fixture schema + loader | Spec-shaped subset; F1–F9 plus a landscape derivative; deterministic generator in `scripts/generate-fixtures.mjs` |
| D3 | Measurement adapter | Offscreen DOM measurement at max/min/fixed widths; segments, line boxes via segment wrappers, anchor rects, table column widths, missing assets |
| D4 | Adaptive layout | `layoutDocument(document, measurement, options)` with content-driven widths, right/wrap placement, callouts, edge routes, defects |
| D5 | Paginator | `paginate(layout, document, hints)`; safe break candidates only; continuation and ghost records; manual hints; blocking defects |
| D6 | Page view + reader markers | Continuous reader with page-break lines; page view from derived pages |
| D7 | Print compositor + export | Fixed A4 pages from derived pages, direct page children, header/footer/page numbers, continuation/ghost markers, vector SVG arrows, `printToPDF`, atomic rename |
| D8 | Tests + report | 14 Vitest tests, 9 Playwright/Electron e2e tests, full gate harness, this report |

The app is a spike shell only: fixture picker, Reader/Page view toggle, defect display, export button, and a test API. It has no editor, persistence, outline UI, themes, packaging, external API, or MCP.

## 4. Architecture and the rules that mattered

### 4.1 One layout engine, injected measurement

`packages/layout` is pure TypeScript. Its core imports no React, DOM, Electron, or editor package. `MeasurementPort` is injected; the renderer implements it with an offscreen DOM host that uses the same block card, segment wrappers, CSS metrics, KaTeX output, and table markup as the screen/print renderers.

The layout pass calls measurement twice per block: once at `max-content` and once at the chosen fixed content width. The adapter returns card width/height, content top, label height, measured segments, safe break candidates, anchor rects, table column widths, and missing assets. Results are cached by block and width for warm layout.

### 4.2 Adaptive layout

- Card content width is `clamp(max-content width, min 160 px, max 420 px)`, clamped again to available page width. Unbreakable content (wide image, long code line, wide table) may use the full available page width before becoming a `content-too-wide` defect.
- A direct child goes to the right when the remaining width can hold its wanted footprint and its min-content width; otherwise it wraps below the parent at `parent.x + 18 px`.
- Anchored callouts are placed below the parent card, left-aligned to the resolved anchor rectangle, stacked in anchor order. Direct children are laid out after the callout subtree so the outline order (anchored first, then direct) is preserved and callouts/direct children cannot overlap.
- Chapters are laid out independently in chapter-local coordinates. Chapter height includes top-level blocks and their subtrees.
- Gaps: sibling 24 px, wrap indent 18 px, callout 20 px, chapter 32 px, segment 8 px. All observed minimum clear gaps were at least 20 px (gate is 16 px).

### 4.3 Break candidates and paginator

The measurement adapter returns one segment per safe unit:

- paragraph;
- heading;
- list item (nested list items are separate segments);
- blockquote paragraph;
- code line;
- table row;
- display formula;
- image.

A segment is atomic. Break candidates are the starts of segments 2..n, expressed as `{ kind, nodePath, y, segmentIndex }` relative to the block content box. The paginator:

1. enumerates block tops, block bottoms, and internal candidates;
2. marks a candidate valid only when every block crossing that Y has a safe internal candidate there;
3. fills each page to the furthest valid candidate within the content height, capped by an honored manual hint;
4. if no valid candidate fits, chooses the next valid candidate beyond the page and marks the page as overflowing with a blocking `no-safe-break` or `too-tall-row` defect instead of cutting;
5. emits fragments as content segment ranges, with `isFirst`/`isLast`, continuation links, ghost parent data, and page-local boxes.

Continuation markers are rendered in the top and bottom margin bands, not as in-flow content, so they do not change page-view/PDF geometry. This is an explicit spike assumption; see findings.

### 4.4 Print compositor

The print model (`packages/pdf`) consumes derived pages only. It adds page numbers, chapter running headers, continuation/ghost markers, and page-local edge routes. It never re-paginates and never measures.

The print renderer emits one fixed A4 page container per derived page. **The page containers must be direct children of the print root.** An earlier version wrapped each page in a `<div>` so the page view could show an overflow badge; even with `display: contents`, that wrapper caused a cumulative vertical offset of **0.14 mm per page** (7.12 mm by page 53). Removing the wrapper for print mode reduced the maximum page-view/PDF label delta to **0.48 mm**. The wrapper remains only in screen mode (for the overflow label).

`printToPDF` options used:

```ts
{
  pageSize: 'A4',
  landscape: pageSetup.orientation === 'landscape',
  printBackground: true,
  preferCSSPageSize: true,
  scale: 1,
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  displayHeaderFooter: false,
  generateTaggedPDF: false,
}
```

The page geometry uses page-container millimetres and block/content coordinates in layout pixels. `@page` is declared in points (`widthMm * 72 / 25.4`) with `margin: 0`. The PDF page size is 595 × 842 pt, measured as 209.89 × 297.01 mm; the print page container is 210 × 297 mm. The 0.11 mm width difference is Chromium's point rounding and is within the 1 mm A4 tolerance.

Export writes to a sibling temporary file, validates the PDF (page count, page size, no missing glyphs), then renames. A forced failure after writing the temporary file leaves the previous target byte-identical and no `.tmp-*` file.

## 5. Gate results

All automated gates pass. Human checks are marked separately.

| Gate | Result | Evidence |
|---|---|---|
| **G1 — Build and run** | **PASS** | `npm run typecheck`, `npm test` (14), `npm run e2e` (9), `npm run spike:gates`; F1 loads in reader/page view with no renderer page errors; export runs from the app. `artifacts/f1-reader.jpg`, `artifacts/f1-page-01.jpg` |
| **G2 — Adaptive layout** | **PASS** | F1/F3/F4/F7: no overlaps; min clear gap 20/24/20/20 px; F3 has 4 right-placed and 5 wrapped children, 6 distinct widths; F1 anchors aligned at 0 px (gate ≤2 px); reference probes move nothing; F7 300 blocks. `artifacts/f3-wide-fan.jpg`, `artifacts/f4-deep-chain.jpg` |
| **G3 — Pagination** | **PASS** | F2 = 53 pages ≥50; every measured segment belongs to exactly one fragment; 20 continuation records with matching “continues/continued from” markers; F1 manual hint starts B4 on page 3; every chapter starts at `y=0` on a new page; no blank pages; F6 too-tall row is a blocking defect and is not split. `artifacts/f2-page-03-continuation.jpg`, `artifacts/f2-page-05-table.jpg`, `artifacts/f6-too-tall-row.jpg` |
| **G4 — PDF fidelity (automated)** | **PASS** | F2 53 PDF pages = 53 derived; text for all 225 blocks; 0 missing glyphs; images embedded; 1,917 vector paths; 20 continuation markers; max label geometry delta 0.48 mm (tolerance 1 mm); F1 3/3 pages, 0.36 mm; F7 39/39 pages, 0.47 mm; landscape 3/3 pages, 297.01 × 209.89 mm, 0.36 mm. The PDF artifact is provided for the product owner's visual review on macOS (Preview/Chrome/page view). `artifacts/spike-01-f2-53-pages.pdf`, `artifacts/f2-pdf-page-03-continuation.jpg`, `artifacts/spike-01-gates.json` |
| **G5 — Performance** | **PASS** | F7: cold 17.9 ms, warm median 0.6 ms, p95 1.0 ms, paginate 0.4 ms, export 262 ms. F2: cold 36.8 ms, warm 0.3 ms, p95 0.6 ms, paginate 1.3 ms, export 406 ms. Reader/page scroll: 90 frames, average 8.28 ms/frame, p95 8.60 ms (≈121 fps on a 120 Hz display). Main RSS 304 MB, renderer JS heap 9.5 MB. |
| **G6 — Stability** | **PASS** | F7 add-block: 100% of pre-existing blocks within 2 px, 0 unrelated-chapter moves; delete-block: 0 surviving blocks outside the affected group move >1 px; add/remove reference edge: positions and page breaks identical; reopening F2 gives the same page count and identical geometry hash. |
| **G7 — Defects and errors** | **PASS** | F8 surfaces `content-too-wide` (×2), `no-safe-break`, `missing-asset`, `impossible-hint` (×2); export blocked with a clear message; no partial file. F6 too-tall row blocked. Forced failure leaves the previous PDF hash/mtime unchanged and no temp files. `artifacts/f8-defects.jpg` |
| **G8 — Visual evidence (automated)** | **PASS** | 15 app screenshots and 6 PDF rasters in `artifacts/spike-01`; committed subset in `docs/spikes/artifacts`. Visual PDF review is the product owner's acceptance. |
| **G9 — Report** | **PASS** | This document, `artifacts/spike-01-gates.json`, and the committed evidence. |

## 6. Measurements

### 6.1 Layout and pagination

| Fixture | Blocks | Pages | Cold layout | Warm median | Warm p95 | Paginate | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| F1 golden | 5 | 3 | 2.3 ms | 0.0 ms | 0.1 ms | 0.1 ms | B5 continuation; B4 manual hint page 3 |
| F1 landscape | 5 | 3 | 2.1 ms | 0.0 ms | 0.0 ms | 0.0 ms | 297 × 210 mm |
| F2 long | 225 | 53 | 36.8 ms | 0.3 ms | 0.6 ms | 1.3 ms | 50+ page gate fixture |
| F3 wide fan | 11 | 2 | 2.3 ms | 0.0 ms | 0.1 ms | 0.0 ms | 4 right, 5 wrapped, 6 widths |
| F4 deep chain | 7 | 2 | 1.5 ms | 0.0 ms | 0.1 ms | 0.0 ms | 5 levels, 2 nested callouts, 2 continuation markers |
| F5 shared child | 4 | 1 | 0.7 ms | 0.0 ms | 0.0 ms | 0.0 ms | reference cycle; geometry unchanged |
| F6 tables | 4 | 4 | 6.2 ms | 0.0 ms | 0.0 ms | 0.2 ms | too-tall row; export blocked |
| F7 scale-300 | 300 | 39 | 17.9 ms | 0.6 ms | 1.0 ms | 0.4 ms | 3 chapters × 100 blocks |
| F8 defects | 5 | 2 | 2.1 ms | 0.0 ms | 0.0 ms | 0.0 ms | export blocked |
| F9 anchors | 4 | 1 | 0.7 ms | 0.0 ms | 0.0 ms | 0.0 ms | broken + ambiguous warnings |

Cold includes DOM measurement and font/image settling is done before the call. Warm uses the adapter's measurement cache. Times are a single run with 5 warm repetitions; the gate harness records the median and p95. The 300-block cold/warm figures comfortably meet G5.

### 6.2 PDF export

| Fixture | Pages | Time | Size | PDF size | Geometry labels | Max Δ |
|---|---:|---:|---:|---|---:|---:|
| F1 | 3 | 358 ms | 144,455 B | 209.89 × 297.01 mm | 5 | 0.36 mm |
| F1 landscape | 3 | 224 ms | 148,050 B | 297.01 × 209.89 mm | 5 | 0.36 mm |
| F2 | 53 | 406 ms | 686,572 B | 209.89 × 297.01 mm | 225 | 0.48 mm |
| F3 | 2 | 179 ms | 117,238 B | 209.89 × 297.01 mm | — | — |
| F4 | 2 | 180 ms | 125,037 B | 209.89 × 297.01 mm | — | — |
| F5 | 1 | 154 ms | 81,719 B | 209.89 × 297.01 mm | — | — |
| F7 | 39 | 262 ms | 383,453 B | 209.89 × 297.01 mm | 300 | 0.47 mm |
| F9 | 1 | 166 ms | 82,596 B | 209.89 × 297.01 mm | — | — |

F2 PDF text layer: 3,340 text items, 69,460 extracted characters, 225/225 blocks present, 0 `�`. 20 continuation marker pairs checked. Table text is selectable; the 35-row table spans pages 5–7. The 80-line code block spans 2 pages. Images: the forest plot is embedded on page 29; the missing asset renders a labeled placeholder on page 49. Vector paths: 1,917.

### 6.3 Geometry method and drift

Page-view geometry is read from the DOM after switching to Page view: each page's `getBoundingClientRect`, each fragment, and each fragment label. PDF text-item positions are read with pdfjs-dist, converted from points to millimetres, and compared to the DOM label position on the same page. Labels are used because every fixture block has a label and the PDF text layer exposes them. The comparison excludes text antialiasing; it is a position comparison, not a pixel diff.

- Maximum label delta: **0.48 mm** (F2, 225 labels), within the spike's 1.0 mm tolerance. F1 0.36 mm, F7 0.47 mm, landscape 0.36 mm.
- Page count: exact for F1 (3), F1 landscape (3), F2 (53), F3 (2), F4 (2), F5 (1), F7 (39), F9 (1).
- Page size: PDF 209.89 × 297.01 mm vs A4 210 × 297 mm; landscape 297.01 × 209.89 mm. This is Chromium's 595 × 842 pt rounding.
- Before the print-compositor direct-child fix, the cumulative drift on F2 page 53 was 7.12 mm. It is now 0.48 mm. This is the single most important PDF-pipeline finding.

## 7. What matched, what drifted, and tolerances

| Aspect | Result | Tolerance / note |
|---|---|---|
| Page count | Exact for every exported fixture | 0 |
| Page size/orientation | 209.89 × 297.01 mm portrait; 297.01 × 209.89 mm landscape | 1.5 mm check; 0.11 mm observed |
| Page-view vs PDF label positions | Max 0.48 mm | 1.0 mm |
| Continuation markers | 20/20 F2 pairs; F1/F4 pairs; exact page references | text match |
| Segment atomicity | Every paragraph, list item, blockquote paragraph, code line, table row, formula, and image segment is in exactly one page fragment | 0 failures |
| Table rows | 35-row table pages 5–7; rows never split; too-tall row blocked | atomic |
| Text layer | 225/225 and 300/300 blocks present; 0 missing glyphs | formula text best-effort |
| Images | Embedded on page 29; missing asset placeholder on page 49 | `imageCount` + text |
| Vector content | 1,917 paths on F2; arrows/borders are vector | path count |
| Atomic failure | Target hash and mtime unchanged; no temp files | byte-identical |

The PDF text layer inserts spaces between inline runs and between KaTeX fragments; the verifier normalizes whitespace and matches token order. The `≠` glyph in F1's `v ≠ 0` is visually correct in the raster; the text layer is best-effort for formula layout, as allowed by §11.6. No missing-glyph markers were found.

## 8. Fixtures

| ID | File | Coverage |
|---|---|---|
| F1 | `fixtures/golden-eigenvalues.json` | Appendix A: B1–B5, text/formula/code anchors, direct and anchored children, reference edge, code continuation, manual break before B4 |
| F1L | `fixtures/landscape-golden.json` | Same content in A4 landscape; 3 pages, 297 × 210 mm |
| F2 | `fixtures/long-50-pages.json` | 225 blocks / 53 pages; paragraphs, headings, nested lists, blockquotes, 80-line code, inline/display KaTeX, images, 35-row table crossing pages, anchored continuation, broken anchor, missing asset |
| F3 | `fixtures/wide-fan.json` | 10 children with very different widths; 4 right placements, 5 wrapped, 6 distinct widths |
| F4 | `fixtures/deep-chain.json` | 5 levels, nested anchored callouts, 2 continuation markers |
| F5 | `fixtures/shared-child.json` | One primary home, two reference edges, reference cycle; one card, reference geometry invariant |
| F6 | `fixtures/tables.json` | 35-row table crossing pages, header row, one row 5,305 px tall (blocking defect, not cut) |
| F7 | `fixtures/scale-300.json` | 300 blocks across 3 chapters; 39 pages; stability and performance |
| F8 | `fixtures/defects.json` | No safe break, too-wide image, too-wide code line, missing asset, impossible hints |
| F9 | `fixtures/broken-anchor.json` | Broken and ambiguous anchors; both branches exported once with markers |

The generator is `npm run fixtures`; it is deterministic and writes the PNG assets with `@napi-rs/canvas`.

## 9. Spec/ADR findings and proposed amendments

These are findings for the Orchestrator/Sentinel. The spec, UX, plan, and ADRs were not edited.

1. **ADR-0002 addendum: print pages must be direct children of the print root.** Wrapping each page in a div (even `display: contents`) causes a cumulative vertical offset of 0.14 mm/page (7.12 mm at page 53). Direct children reduce the maximum geometry delta to 0.48 mm. Add this rule and a multi-page geometry regression test to the ADR/implementation notes.
2. **A4 point rounding.** Chromium prints A4 as 595 × 842 pt = 209.89 × 297.01 mm. Gate tolerances should allow at least 0.2 mm; the spike uses 1.0 mm for geometry and 1.5 mm for page size. Do not treat this as a failure.
3. **Continuation markers live in the margin bands.** The spec says “at the top/bottom of the block.” The spike renders them in the top/bottom page margins so they do not displace content and so page view and PDF share geometry. Confirm this interpretation in UX/spec, or reserve marker height in the paginator in M5.
4. **Vertical centering is not implemented.** The spec says a parent is centered on its children’s span where possible. The spike top-aligns parent cards. This does not affect the gates but is a visible layout difference; decide whether to implement centering in M5 or amend §7.3.
5. **Callout/direct-child order.** The spike lays out anchored callouts below the parent card first, then direct children after the callout subtree. This preserves the D3 outline order (anchored first), prevents callout/direct-child overlap, and produces the expected F1/F2/F4 reading order. The spec should state this rule explicitly.
6. **Sibling wrap rule.** A child goes right when the remaining width holds its wanted content width (clamped to the readable maximum) and its min-content width; otherwise it wraps at `parent.x + 18 px`. A single vertical cursor preserves branch order, producing a deterministic staircase in F3. The spec should define “footprint” precisely; the current wording allows group-level or per-child decisions.
7. **Paragraph atomicity.** A single paragraph, list item, blockquote paragraph, code line, table row, formula, or image is an atomic segment. A paragraph taller than the page is a blocking defect, not an intra-paragraph break. This matches the safe-boundary list but makes a 90-sentence paragraph unexportable; confirm this is the intended v1 behavior.
8. **Chapter titles are running headers, not content flow.** Chapter-local coordinates start at the first top-level block; the chapter title is in the page header. This keeps Appendix A’s “B1 starts at the top-left of the chapter content area” true. Confirm for reader UX.
9. **Top-level readable width cap.** The spike caps text content at 420 px (≈111 mm) for readability, so top-level F2 paragraphs leave horizontal space on the right. The spec says widths are content-driven up to the page content width; decide whether to keep the cap or let top-level narratives use the full width.
10. **Export job model.** The spike exports synchronously over IPC and returns after the atomic rename. ADR-0003/ADR-0002 describe a job ID and status polling; that is deferred to M6.
11. **Fonts.** The print theme uses the macOS system sans stack, a monospace stack, and KaTeX fonts. It is deterministic on this machine but not across OSes. Pin and embed fonts for release.
12. **Cross-chapter reference edges.** The spike draws a page-edge indicator for cross-page edges and does not route a long line across pages. No fixture has a cross-chapter reference edge; add one in M4.
13. **Formula-term anchors.** F1’s A2 is a whole inline-formula anchor; formula-term geometry remains best-effort per D5. The fixture does not prove term-level KaTeX geometry.
14. **F1 page count vs Appendix A.** Appendix A sketches B5 starting on page 2. The generated golden fixture starts B5 on page 1 and continues at a code-line boundary; the manual hint puts B4 on page 3. The continuation semantics are the same, but the exact page-start is content-dependent. Either tune the fixture or update the Appendix’s illustrative page sketch.
15. **Table header repetition** is not implemented, as allowed by v1. The F2 table header appears only on page 5.
16. **No collapse, freeze, incremental layout, or LOD.** These are outside the spike brief; the page view renders all derived pages and the layout always does a full pass. M5 must add incremental/freeze behavior and virtualization for the 1,000-block promise.
17. **No 1,000-block measurement.** G5’s optional 1,000-block case was not run. The 300-block gate passes comfortably; a 1,000-block/virtualization task belongs in M5.
18. **CJK/non-Latin glyph test not included.** The PDF exercises Greek (`λ`), summation (`∑`), `≠`, em dash, and arrows. A CJK fixture should be added before release to exercise the fallback font path.
19. **PDF metadata** (title, creator, creation date) is not set in the spike. Add in M6 with the real document title and app version.

## 10. Limitations and not-done

- Visual review of the PDF on macOS is the product owner's acceptance (see `artifacts/human-checks.md`). The Builder does not mark visual judgement as passed.
- No editor, outline UI, persistence, autosave, external API, MCP, themes, packaging, Windows/Linux, or iPad.
- No 1,000-block run, virtualization, collapse, freeze, or incremental reflow.
- No CJK glyph fixture; formula text extraction is best-effort.
- No cross-chapter reference-edge fixture; no formula-term anchor geometry fixture.
- The 300-block stability probe adds/deletes a top-level block at the end of the last chapter and a mid-list block for delete; it demonstrates chapter isolation and the 95% floor, but it is not a full combinatorial stability suite.

## 11. Artifacts

Committed evidence (small, reviewable):

- `artifacts/spike-01-f2-53-pages.pdf` — the 53-page hard-gate PDF.
- `artifacts/spike-01-f1-golden-eigenvalues.pdf` — F1, 3 pages.
- `artifacts/spike-01-f7-300-blocks.pdf` — F7, 39 pages.
- `artifacts/spike-01-f1-landscape.pdf` — landscape, 297 × 210 mm.
- `artifacts/f1-reader.jpg`, `artifacts/f1-page-01.jpg`, `artifacts/f1-page-02-continuation.jpg`.
- `artifacts/f2-page-03-continuation.jpg`, `artifacts/f2-page-05-table.jpg`.
- `artifacts/f3-wide-fan.jpg`, `artifacts/f4-deep-chain.jpg`, `artifacts/f6-too-tall-row.jpg`, `artifacts/f8-defects.jpg`, `artifacts/f9-anchor-warnings.jpg`.
- `artifacts/f1-pdf-page-01.jpg`, `artifacts/f2-pdf-page-03-continuation.jpg`, `artifacts/f2-pdf-page-05-table.jpg`.
- `artifacts/spike-01-gates.json` — compact gate evidence.
- `artifacts/human-checks.md` — one-line checklist for the human checks.

Full run artifacts (not committed): `artifacts/spike-01/`, including the 15 screenshots, 6 PDF rasters, full `gates.json`, and all exported PDFs.

## 12. Recommendation

**Accept the spike and proceed to M2.** The highest-risk promise — one adaptive layout, one paginator, and a real-text A4 PDF whose page count, breaks, text, and page-view geometry agree — is demonstrated. The product owner should review the generated PDF visually on the Mac (Preview/Chrome or the app page view).

Before M5, record the direct-print-page rule and geometry regression in ADR-0002/implementation notes, and resolve the spec findings above (margin markers, callout/direct-child order, sibling wrap rule, paragraph atomicity, vertical centering, readable-width cap). Add a 1,000-block/virtualization task to M5 and a CJK/font-matrix fixture before release.
