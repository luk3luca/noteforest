# ADR-0002 — PDF pipeline: shared paginator + Electron `printToPDF`

- **Status:** Accepted (3 November 2026); the 50+ page gate passed.
- **Depends on:** ADR-0001.

## Context

The product needs a **Page PDF** with selectable text, real formulas and code, images, A4 portrait
or landscape, margins, continuation/ghost markers and a deterministic page count. The same pages
must appear on screen and in the PDF.

Two failure modes are unacceptable:

1. **Two paginators.** If CSS paged media decides breaks while the layout engine decides on screen,
   counts and breaks diverge.
2. **Cut content.** Chromium fragmentation can split a line, image, formula, code line or table row
   unless the break is controlled.

## Decision

**The paginator is the only component that decides page breaks. The PDF prints a print-only
renderer that composes the already-derived pages, one fixed-size container per page.**

```text
document JSON
  -> measurement adapter (DOM)
  -> packages/layout: continuous layout + paginator
  -> derived pages
  -> two renderers: interactive screen / print compositor
  -> webContents.printToPDF
```

Rules:

1. **No CSS re-pagination.** One page container per derived page, exactly A4, `@page { size: A4;
   margin: 0 }`, internal padding equal to the margins. No `break-inside`, no automatic
   fragmentation.
2. **Exact geometry.** Fragments are positioned from the paginator's geometry. No transform scale on
   text; screen and print share fonts, sizes, line heights and measure widths.
3. **Print theme is a skin, not a layout.** Colors may differ; typography metrics may not.
4. **Deterministic capture.** Wait for `document.fonts.ready`, image `decode()`, KaTeX fonts and two
   frames; disable animations; `deviceScaleFactor: 1`, `scale: 1`, `printBackground: true`,
   `preferCSSPageSize: true`, explicit size, zero print margins, no header/footer templates.
5. **One export mode.** Page PDF only; all content, independent of collapse.
6. **Atomic output.** Temp file, validate, rename.
7. **Jobs.** Export returns a job; the print runs in a hidden `BrowserWindow`, destroyed after
   capture.
8. **No network.** Local resources only; CSP blocks remote content.

## Alternatives

| Option | Why not |
|---|---|
| CSS paged media as the paginator | Second source of truth for breaks; drift from the page view. |
| Screenshot the page view | No selectable text. |
| Native PDFKit / `NSPrintOperation` | Second renderer over the layout tree; leaves the stack. |
| Typst | Excellent paged media, but a separate layout engine and model. |
| Rust `printpdf` | Custom text layout and pagination; same two-engine problem. |
| CDP `Page.printToPDF` | Same engine; a fallback, not a different architecture. |
| WKWebView / Tauri | Single long page and compositing limits. |

## Spike findings that still bind

- **Print page containers must be direct children of the print root.** A wrapper `<div>` — even with
  `display: contents` — added a cumulative offset of **0.14 mm per page** (7.12 mm by page 53).
  Without it, the maximum page-view/PDF label delta was **0.48 mm** (tolerance 1.0 mm).
- Chromium prints A4 as 595 × 842 pt = **209.89 × 297.01 mm**; page-size checks allow at least
  0.2 mm.
- Continuation markers render in the margin bands so they do not displace content.
- Print-time image/font/KaTeX failures must surface on the job; a dimensioned asset that disappears
  prints the app placeholder and reports an asset warning.

## Consequences

- Screen and PDF share one paginator, one measurement pass and one model.
- Real selectable text and vector arrows come from Chromium.
- A hidden window and memory spikes during large exports are accepted.
- The compositor must stay dumb: it consumes paginator output and never lays out.

## Revisit triggers

- The gate fails structurally (text lost, pages cannot be fixed at A4, formulas break).
- A Chromium major changes print behavior and cannot be pinned.
- Tagged PDF or accessibility arrives: additive ADR, not a pipeline replacement.
