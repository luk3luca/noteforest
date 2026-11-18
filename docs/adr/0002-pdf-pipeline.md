# ADR-0002 — PDF pipeline: shared paginator + Electron `printToPDF`

- **Status:** Accepted; the 50+ page gate runs in Spike 1
- **Date:** 3 November 2026
- **Decision owner:** Orchestrator, ratified by the product owner
- **Depends on:** ADR-0001 (Electron stack)
- **Related:** spec §7.5 (paginator), §11 (PDF export), §15.13 (AC-60), the Spike 1 print gate

## Context

The product needs a **Page PDF** with selectable text, real formulas and code, embedded images, A4 portrait/landscape, document margins, continuation/ghost markers, and deterministic page count. The same pages must appear in the reader, the page view, and the PDF. The PDF is used in a standard PDF annotation app; a screenshot or a separate linear render is not acceptable.

Two failure modes are unacceptable:

1. **Two paginators.** If CSS paged media decides breaks in the PDF while the layout engine decides them on screen, page counts and breaks diverge.
2. **Cut content.** Chromium's fragmentation can split a line, image, formula, code line, or table row at a page boundary unless the break is controlled.

Scout's review (`research/native-stacks.md` §8.3) found Electron `printToPDF` the best v1 path: real vector text, KaTeX HTML, and the same Chromium engine as the screen. It still needs a gate: a 50+ page A4 spike with text extraction and visual comparison.

## Decision

**The paginator is the only component that decides page breaks. The PDF is printed from a print-only renderer that composes already-derived pages, one fixed-size page per derived page. Electron `webContents.printToPDF` prints that renderer.**

Pipeline:

```text
document JSON
  -> measurement adapter (DOM, hidden or offscreen)
  -> packages/layout: continuous layout + paginator
  -> derived pages: [{ pageNumber, fragments: [{ blockId, slice, x, y, width, height }] }]
  -> two renderers:
       reader/page view (interactive, screen theme)
       print compositor (fixed A4 pages, print theme)
  -> webContents.printToPDF
  -> PDF file (real text)
```

Rules:

1. **No CSS re-pagination.** The print compositor emits one page container per derived page, each exactly A4 (210 × 297 mm or 297 × 210 mm). It uses `@page { size: A4; margin: 0 }` and internal page padding equal to `pageSetup.margins`. It does not rely on `break-inside`, automatic fragmentation, or browser page breaks to decide where content goes.
2. **Exact geometry.** Block fragments are positioned from the paginator's geometry, converted from layout px at 100% to CSS mm (or a single fixed scale). No `transform: scale()` on text; no zoom that changes font metrics. Screen and print share the same font files, font sizes, line heights, and measure widths.
3. **Print theme is a skin, not a layout.** Colors, borders, and shadows may differ; typography metrics may not. Page view and PDF must use the same metrics.
4. **Deterministic capture.** Before printing: wait for `document.fonts.ready`, image `decode()`, KaTeX fonts, and two animation frames; disable animations/transitions; set `deviceScaleFactor: 1`; use `scale: 1`; `printBackground: true`; `preferCSSPageSize: true`; explicit page size and zero print margins; no header/footer templates (the print compositor draws page numbers and running headers itself).
5. **One export mode.** Page PDF only. No reader PDF, map page, or "export visible only" in v1. Export includes all content, independent of collapse state.
6. **Atomic output.** Write to a temporary file, validate it, then rename. A failed export leaves no partial PDF.
7. **Jobs.** Export returns a job ID; the actual print runs in the main process on a hidden `BrowserWindow`. Small exports normally finish before the first status poll. The window is destroyed after capture.
8. **No network.** The print renderer loads only local app resources; CSP blocks remote content.

`printToPDF` options (Electron):

```ts
{
  pageSize: 'A4',
  landscape: pageSetup.orientation === 'landscape',
  printBackground: true,
  preferCSSPageSize: true,
  scale: 1,
  margins: { top: 0, bottom: 0, left: 0, right: 0 }, // inches; margins are internal page padding
  displayHeaderFooter: false,
  generateTaggedPDF: false,        // tagged PDF is post-v1
}
```

Electron's `PrintToPDFOptions.margins` takes numeric inches, not a `marginType` enum. Exact option names are verified in Spike 1 against the pinned Electron version; a mismatch is a spike finding, not a silent deviation.

## Why not the alternatives

| Option | Why not |
|---|---|
| **CSS paged media as the paginator** | Creates a second source of truth for breaks; page counts and continuation markers drift from the page view. Unacceptable for a WYSIWYG page product. |
| **Screenshot the page view** | No selectable text; fails the core annotation use case. |
| **Native PDFKit / `NSPrintOperation`** | Strong native text/PDF, but requires a second renderer over the layout tree and moves the app off the chosen stack. A fallback only if Chromium print fails the gate. |
| **Typst** | Excellent paged media and math, but a separate layout engine and document model; it cannot reproduce the interactive adaptive tree without a second layout implementation. Suitable for a future document-only export, not v1 Page PDF. |
| **Rust `printpdf` / `oxidize-pdf`** | Low-level text layout and pagination would be custom; same two-engine problem. |
| **Chromium CDP `Page.printToPDF`** | Equivalent engine; a fallback if Electron's wrapper misbehaves, not a different architecture. |
| **WKWebView `createPDF` / Tauri** | WKWebView tends to produce a single long page and has compositing limits; the research flagged it as a trap. |

## Consequences

Positive:

- Screen and PDF share one paginator, one measurement pass, and one content model.
- Real selectable text and vector arrows/borders come from Chromium, not a custom PDF writer.
- Continuation and ghost markers are rendered by the same code as the page view.

Negative:

- A hidden `BrowserWindow` is required for export; memory spikes during large exports.
- Chromium print CSS has quirks (fonts, images, `@page`, scale). The spike must prove them for A4 and formulas.
- The print compositor is a second **renderer** (not a second layout engine); it must stay dumb and consume the paginator output.
- Pinned Chromium versions matter for deterministic output; upgrades re-run the gate.

## Gate (must pass before PDF commitment)

Run the Spike 1 PDF gate on a 50+ page A4 fixture containing:

- body text, headings, nested lists, blockquotes;
- a long code block (50+ lines) and inline code;
- inline and display KaTeX formulas, including `λ`, `∑`, fractions, and a formula term anchor;
- images at print resolution and a missing-asset placeholder;
- tables, including a table that crosses a page boundary between rows;
- an anchored branch that continues on the next page, with ghost parent markers;
- a broken anchor marker;
- a 300-block performance fixture.

Pass criteria:

1. PDF page count equals the paginator's derived page count.
2. `pdftotext` (or `pdfjs-dist`) extracts all body, label, code, and table text, normalized for line breaks; no `�`.
3. No cut text line, image, formula, table row, or code line. Table breaks occur only between rows.
4. Continuation/ghost markers appear exactly where the paginator reports continuations.
5. Page size, orientation, and margins match `pageSetup`; no unexpected blank page.
6. Page-view screenshot and PDF raster agree within the print-theme tolerance (layout, breaks, block positions).
7. External annotation app import (manual, optional): body text is selectable/highlightable/searchable; formulas and code are readable. The app has no integration with any annotation app.
8. Export from the packaged app, not only the dev server.

If any criterion fails, PDF commitment pauses and the Orchestrator writes a fallback ADR (CDP print or native compositor). The app does not silently switch pipelines.

## Addendum — Spike 1 findings (3 November 2026)

Spike 1 confirmed the pipeline and produced one non-obvious rule:

- **Print page containers must be direct children of the print root.** Wrapping each page in a `<div>` — even with `display: contents` — introduced a cumulative vertical offset of **0.14 mm per page** (7.12 mm by page 53 on the F2 fixture). Removing the wrapper in print mode reduced the maximum page-view/PDF label delta to **0.48 mm**.
- The wrapper is allowed only in screen mode (for the overflow badge). The print DOM and the screen DOM must not share a wrapper structure that changes page flow.
- A multi-page geometry regression test is required: at least 50 pages, with page-view/PDF label positions compared page by page. The spike's tolerance was 1.0 mm; observed maximum 0.48 mm.
- Chromium prints A4 as 595 × 842 pt = **209.89 × 297.01 mm**. This 0.11 mm rounding is expected; page-size checks should allow at least 0.2 mm.
- Continuation markers were rendered in the top/bottom margin bands so they do not displace content; this kept page-view and PDF geometry aligned. The spec/UX should confirm this interpretation or reserve marker height in the paginator.

These findings tighten the implementation, not the decision: `printToPDF` remains the pipeline.

## Revisit triggers

- The gate fails for a structural reason (text lost, pages cannot be fixed at A4, formula rendering breaks).
- Electron's print behavior changes across a major upgrade and cannot be pinned.
- A future iPad app needs an independent PDF path (then a separate ADR, sharing the paginator output if practical).
- Tagged/PDF-UA or accessibility requirements arrive; that is an additive ADR, not a pipeline replacement.
