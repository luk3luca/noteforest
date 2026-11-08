# M4c — Page PDF implementation plan

**Status:** planning only; PDF work is blocked by the Page checkpoint and should
follow R2i/R2j so the print compositor targets the final Page geometry.  
**Decision:** ADR-0002 — shared paginator + print-only compositor + Electron
`webContents.printToPDF`; one Page PDF mode.  
**Related:** `docs/tasks/m4-reader-page-pdf.md`,
`docs/tasks/refactor-personal-page-settings.md`, `docs/tasks/page-wrap-callouts-plan.md`.

## 1. Goal

Export the exact derived Page pages as a real-text PDF:

- one fixed page per paginator page;
- no CSS re-pagination;
- selectable text, vector arrows/borders, KaTeX, images, code, tables;
- page count equal to the paginator;
- no cut line/image/formula/code line/table row;
- same Page settings at export time (personal lens);
- atomic PDF output in the packaged app.

## 2. Pipeline

```text
document.json
  -> DOM measurement (page font metrics)
  -> packages/layout: continuous layout + paginator
  -> derived pages + fragments + PageEdgeModel (edges/trunks)
  -> print compositor (fixed page containers, print skin)
  -> hidden BrowserWindow
  -> webContents.printToPDF
  -> atomic PDF file
```

Rules from ADR-0002:

1. The paginator is the only component that decides breaks.
2. The print compositor emits one fixed-size page container per derived page; no
   CSS fragmentation.
3. Page Read, Page Edit, measurement, and PDF share fonts, sizes, line heights,
   page geometry, card boxes, and edge/trunk geometry.
4. The print theme changes colors/borders/shadows only; it may not change metrics.
5. Print page containers are direct children of the print root (Spike 1 finding:
   wrapper caused 0.14 mm cumulative drift per page).
6. `printToPDF` uses fixed page size/orientation, `scale: 1`,
   `printBackground: true`, `preferCSSPageSize: true`, no margins/header/footer;
   margins are internal page padding.
7. Wait for fonts, KaTeX, image decode, and two frames; disable animations;
   deviceScaleFactor 1.
8. Atomic write: temporary file, validate, rename; failed export leaves no
   partial file.
9. Local-only CSP; no network.
10. No reader/map PDF; all content is exported regardless of collapse/focus.

## 3. Current foundation

- `packages/layout`: continuous layout, paginator, page settings, semantic
  PageEdge/PageTrunk model; Page Read/Edit consume it.
- `packages/pdf`: print model foundation and Spike 1 printToPDF orchestration.
- `packages/pdf/src/printModel.ts` already consumes `buildPageEdgeModel`
  (`edges` + `trunks`), so Page Read/Edit and PDF cannot drift on trunk data.
- Spike 1 gate passed for the old layout; it must be re-run on the final Page
  layout with R2g/R2h trunks and R2i/R2j placement.
- Images: content-addressed assets, local protocol, missing placeholders,
  decoded dimensions.
- Page settings: personal global + per-document override, resolved at export.

## 4. Slices

### M4c1 — Print compositor

- Print-only page renderer: one fixed page container per DerivedPage.
- Same static segments, page theme metrics, card boxes, edge/trunk model.
- Headers/footers/page numbers, continuation and ghost-parent markers in margin
  bands (do not displace content).
- Primary/reference arrows, semantic group trunks, cross-page trunk segments,
  reference dashed chips, missing-asset and broken-anchor markers.
- Code/tables/formulas/images: no cut; table breaks only between rows.
- Print theme is a skin; no metric changes.
- Gate: print-model geometry tests; Page Read vs print DOM parity; no overflow.

### M4c2 — Export orchestration

- Main-process hidden BrowserWindow loading the print compositor with resolved
  PageSettings.
- Job ID/status; progress states; cancellation if needed.
- Atomic output and overwrite policy; output path explicit.
- Failure surfaces: font/image decode failure, invalid settings, write error,
  print error; no partial file.
- Packaged-app verification, not only dev server.
- Gate: export job test; atomic failure test; no network; local CSP.

### M4c3 — PDF gate and fixtures

A 50+ page A4 fixture containing:

- body text, headings, nested lists, blockquotes;
- long code (50+ lines), inline code;
- inline/display KaTeX including λ, ∑, fractions;
- images at print resolution, missing placeholder, image region/point anchors;
- tables crossing pages between rows;
- anchored callouts and wrapped children continuing across pages;
- semantic group trunks continuing across pages;
- a broken anchor marker;
- 300-block performance fixture;
- A5 and Letter spot checks.

Pass criteria:

1. PDF page count equals paginator page count.
2. Text extraction with `pdfjs-dist`/`pdftotext` returns all body/label/code/table
   text, no replacement glyphs.
3. No cut text line, image, formula, code line, or table row.
4. Continuation/ghost markers and trunks appear where the paginator says.
5. Page size/orientation/margins match resolved PageSetup; no blank pages.
6. Page Read screenshot and PDF raster agree within a defined tolerance.
7. Packaged app export; Notability import manual check: text selectable.
8. A5/Letter and portrait/landscape checks.

## 5. Settings at export time

- PDF uses the resolved PageSettings: page setup, PageTheme, R2i/R2j layout
  values, manual breaks.
- Settings are personal; same document may export differently on another
  machine. Accepted.
- PDF export does not write settings into `document.json`.
- Settings UI is not a prerequisite; defaults/overrides/API can drive M4c.
- If the settings UI lands later, PDF must consume the same resolver.

## 6. Tests and evidence

- Unit: print model geometry, page count, fragment slices, trunk segments,
  marker positions, atomic write, job states.
- Golden PDF fixtures: 50+ pages, A5/Letter, portrait/landscape, images, tables,
  code, formulas, anchors, trunks.
- `pdfjs-dist` text extraction and glyph checks.
- PDF page count parity with paginator.
- Raster/Page Read comparison at page level; label delta tolerance (ADR-0002:
  1.0 mm gate, Spike 1 observed 0.48 mm).
- Packaged app export; no native dialog blocking tests; output path via test
  bridge.
- Product-owner visual/PDF check on a real branched document; Notability import
  manual.

## 7. Sequence and dependencies

1. Page checkpoint accepted.
2. R2i/R2j final Page layout and callout modes accepted (otherwise PDF geometry
   will be redone).
3. M4c1 print compositor.
4. M4c2 export orchestration.
5. M4c3 gate/fixtures/visual.
6. Product-owner PDF acceptance.

R3 Settings UI can follow PDF, or be done earlier if the product owner wants to
tune Page values interactively before export; it is not required for M4c.

## 8. Out of scope

- Reader/map PDF or “export current view”.
- Tagged/PDF-UA/accessibility metadata (post-v1 additive ADR).
- Annotations, highlighting, or iPad Pencil workflows.
- External agent API `export.pdf` (M5; it can reuse the same job).
- Cloud/network export.
- Changing the paginator or adding a second layout engine.

## 9. Risks

- Chromium print quirks/fonts/KaTeX; pinned Electron version must be re-gated.
- Images and local protocol in the hidden print window.
- Trunk continuity across pages and print clipping; must use the shared PageEdge
  model, not a second router.
- Personal settings mean non-reproducible PDFs across machines (accepted).
- A5/Letter and portrait/landscape may expose geometry assumptions.
- Large exports can spike memory; hidden window lifecycle and job cleanup.
- Page Read/PDF parity if print theme changes metrics; enforce metric parity test.

## 10. Acceptance

- [ ] One fixed print page per derived page; no re-pagination.
- [ ] Page count parity.
- [ ] Real text extraction and vector arrows/trunks.
- [ ] No cut lines/images/formulas/code lines/table rows.
- [ ] Table breaks only between rows.
- [ ] Continuation/ghost markers and semantic trunks match Page Read.
- [ ] PageSetup/Theme/layout settings resolve identically for Page and PDF.
- [ ] Atomic output, job status, packaged-app export.
- [ ] 50+ page A4 gate, A5/Letter checks, product-owner PDF check.
- [ ] Full verify green at integration.
