# ADR-0007 — Editor layouts and interaction modes

- **Status:** Accepted by the product owner (7 November 2026)
- **Decision owner:** Product owner
- **Supersedes:** D14/A15/A16 and the "Reader vs Page view" pair in `docs/spec.md`
- **Related:** ADR-0002 (PDF), ADR-0006 (group wrap), `docs/ux.md`, M4 plan

## Context

The product used two names for two different axes:

```text
Reader    -> continuous screen surface, authoring
Page view -> paginated A4 preview, read-only
```

That conflates **layout** (continuous vs page-bounded) with **mode** (edit vs read). It also forced a
choice between a screen-optimized editor and a print-exact renderer. The product owner ratified the
Obsidian-like model: an editor with edit/read modes, plus a page-bounded layout that can also be
edited, and a PDF export that matches the page layout.

## Decision

Two independent axes:

|  | **Edit** | **Read** |
|---|---|---|
| **Continuous** | default authoring surface; screen-optimized continuous scroll | read-only continuous reading |
| **Page** | optional A4-bounded authoring; one active block editor | A4 preview; exact PDF proof |
| **PDF export** | — | Page layout, read mode, editor chrome excluded |

### Terms

- **Layout:** `continuous` or `page`.
- **Mode:** `edit` or `read`.
- **Continuous editor:** the continuous layout, in either mode.
- **Page editor:** the page layout, in either mode.
- **PDF export:** the page layout in read mode.
- **Reader:** retired as a view name. Use "Read mode" or "continuous editor". The word remains only
  for historical notes and for concurrent file readers.

### Rules

1. **One canonical document, one segment/safe-break model, one paginator.** All layouts and modes read
   and write the same document; pages are derived, never containers.
2. **Page layout and PDF share one geometry and one measurement.** The page editor is the visual proof
   of the PDF. Page Edit and Page Read differ only in interactivity, not geometry.
3. **The continuous layout does not compute page breaks.** It consumes the paginator's breaks as
   markers/hints. It does not use CSS re-pagination. Page layout is the exact geometry; continuous
   markers are derived hints and must not claim pixel parity.
4. **Default:** Continuous + Edit. Page opens in Read mode. Page + Edit is opt-in and uses one active
   block editor overlay; it is not a free canvas and does not add a second paginator.
5. **Page layout and PDF show the full document content.** Collapse is a continuous/outline
   navigation aid; it must not silently remove content from the page layout or PDF. If collapse in
   Page is added later, it is a separate product decision with explicit export semantics.
6. **One active editor.** Switching layout or mode commits the active edit; switching preserves
   focused block, selection, collapse, continuous scroll, current page, and zoom/fit.
7. **View state is persisted per document:** layout, mode, focus, selection, collapse, scroll, current
   page, zoom/fit. Invalid values fall back safely; view state never writes into `document.json`.
8. **One layout engine for the page layout and PDF.** The continuous layout shares the paginator and
   segment model, but remains a screen-optimized renderer. This is not a second pagination engine.
9. **No infinite-canvas positioning.** Continuous is a continuous document scroll, not a freeform
   canvas. Page is bounded by the document page setup (A4 now; other sizes later). Neither supports
   manual x/y pins.

## Consequences

Positive:

- Clear mental model: layout and mode are orthogonal.
- The page-bounded editor gives an optional WYSIWYG writing surface without turning the continuous
  editor into a print renderer.
- PDF always matches the page layout.
- The continuous editor keeps fast authoring and does not inherit page-boundary friction.
- Page-break markers in the continuous editor are honest hints from the same paginator.

Negative / new work:

- Two editable surfaces: Continuous Edit and Page Edit. Page Edit needs a single-block editor overlay,
  commit/reflow, and handling for blocks that cross a page boundary.
- The page editor currently exists only in Read mode; Page Edit is a new slice.
- Continuous Read mode must disable editing while preserving navigation, links, anchors, and copy.
- The lexicon change touches spec, UX, state, actions, labels, CSS/data attributes, tests, and docs.
- Collapse and export semantics need explicit tests so Page/PDF never lose content.

## Migration / affected M4 work

- **Keep:** `page/adapter.ts`, `page/segments.ts`, `page/measurement.ts`, `page/model.ts`,
  `page/usePageModel.ts`, the A4 renderer, zoom/fit/navigation, missing-image placeholders.
- **Adapt:** `PageView` becomes the Page layout renderer with `interactionMode`; Read is implemented
  now, Edit is a later slice. "Open in reader" becomes "Open in continuous editor".
- **Adapt:** `DocumentMode`/`mode` becomes `layout` + `interactionMode`; actions, status bar, App
  shortcuts, session state, CSS/data attributes and tests are renamed.
- **Remove:** "Reader" as a user-facing view name, `openBlockInReader`, `reader-view` palette entry,
  `nf-reader-surface`, `data-reader-surface`, `data-page-open-reader`.
- **Cancelled:** the M4b2 brief that added markers over the DOM reader. Markers belong to the
  continuous layout after the taxonomy/read-mode adaptation.
- **Later:** Page Edit, continuous page-break markers, PDF print compositor. They are M4b/M4c slices,
  not a separate milestone.

## Revisit triggers

- Page Edit makes the page-boundary editing model unusable for long blocks.
- The continuous layout cannot consume paginator breaks without a second measurement.
- Collapse/export semantics require hiding content in Page/PDF.
- A future page size/orientation change makes continuous and page markers diverge materially.
- The product owner reverses the default (Continuous + Edit) or makes Page Edit primary.
