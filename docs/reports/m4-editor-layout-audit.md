# M4 editor-layout audit — what to keep, adapt, remove

**Date:** 7 November 2026
**Decision:** ADR-0007 (Continuous/Page layouts × Edit/Read modes)
**Scope:** M4a/M4b1 code, tests, docs; no product code in this audit.

## Keep

| Artifact | Why |
|---|---|
| `page/adapter.ts` | Pure core→layout mapping; layout-agnostic. |
| `page/segments.ts` | Shared static block/segment renderer; the future Page Edit and PDF use it. |
| `page/measurement.ts` | Page/print DOM measurement; one measurement for Page/PDF. |
| `page/model.ts`, `page/usePageModel.ts` | Layout+paginate page model; reuse for Page Read/Edit and later continuous markers. |
| `PageView` A4 renderer, fragments, continuation/ghost markers, zoom/fit/nav | The Page layout Read mode. |
| `PageView` missing-image placeholders, blocking-defect badges | Required for Page/PDF. |
| `⌘2`/`⌘3` layout switching, status-bar toggle mechanics | Keep the mechanics; rename labels. |
| `page` tests and screenshots | Adapt names/assertions, keep coverage. |

## Adapt

| Artifact | Change |
|---|---|
| `DocumentViewState.mode: 'reader' \| 'page'` | Split into `layout: 'continuous' \| 'page'` and `interactionMode: 'edit' \| 'read'`. |
| Default view | `layout: 'continuous'`, `interactionMode: 'edit'`; Page opens in `read` until Page Edit exists. |
| `actions.ts` | `activeDocumentLayout` / `setActiveDocumentLayout`; `activeInteractionMode` / `setActiveInteractionMode` / toggle; `openBlockInContinuous` replaces `openBlockInReader`. |
| `App.tsx` shortcuts | `⌘2` continuous, `⌘3` page, `⌘E` edit/read. Keep `⌘1`/`⌘4–9` tab shortcuts; page fit shortcuts stay in Page. |
| `StatusBar` | Two groups: Continuous/Page and Edit/Read; Page Edit disabled until implemented. Reader zoom controls become continuous zoom controls. |
| `DocumentEditor` | Layout controls which surface is visible; mode controls `editable`. Continuous Read must disable editing but keep navigation/links/copy. |
| `EditorSurface` | Rename `readerVisible`/`visible` to continuous semantics; read mode blurs and disables the editor; preserve scroll/selection. |
| `PageView` | Accept `interactionMode`; implement Read now; Page Edit is a later slice. Rename "Open in reader" to "Open in continuous editor". |
| CSS/data attributes | `nf-reader-surface` → `nf-continuous-surface`; `data-reader-surface` → `data-continuous-surface`; `nf-page-open-reader`/`data-page-open-reader` → `nf-page-open-continuous`/`data-page-open-continuous`; `data-reader-empty` → `data-continuous-empty`. |
| Session state | Persist `layout`, `interactionMode`, `currentPage`, `pageZoom`, `pageFit`, continuous zoom, scroll, focus/selection. Backward-compatible defaults. |
| Tests | Rename user-facing strings and state assertions; add Continuous Read and session round-trip tests. File names may stay historical. |
| Comments/docs strings | "Reader" → "continuous editor"/"Read mode" where it means a layout or mode. Keep "concurrent reader" for file locks and historical notes. |

## Remove / supersede

| Artifact | Action |
|---|---|
| `openBlockInReader` and "Reader view" palette entry | Remove; replace with continuous-editor wording. |
| `DocumentMode` | Remove; replace with the two axes. |
| `mode === 'reader'` / `mode === 'page'` checks | Replace with `layout` checks. |
| `docs/tasks/m4b2-reader-markers-view-state.md` | Already marked superseded/cancelled. Keep as history; do not implement. |
| `docs/tasks/m4b-unified-reader-design.md` | Superseded by ADR-0007 and this audit. Keep as history. |
| "Page view is read-only" as a product rule | Change: Page Read is read-only; Page Edit is planned. Page layout/PDF remain the exact geometry. |
| "Reader is primary, page is preview" (spec D14/A16) | Supersede with ADR-0007: Continuous + Edit is the default; Page is an optional bounded layout, Read for preview, Edit later. |

## Deliberately not in this slice

- Page Edit (single-block editor overlay, commit/reflow, cross-page block).
- Page-break markers in the continuous layout (derived from the paginator).
- PDF print compositor.
- Collapse behavior in Page layout/PDF: Page/PDF show full content; collapse stays continuous/outline.

## Verification after the rename/refactor

- No user-facing "Reader" label remains except "Read mode".
- `layout` and `interactionMode` are independent; switching one preserves the other where valid.
- Continuous Read disables editing but keeps focus, selection, scroll, links, anchors, copy.
- Page Read remains read-only and exact.
- Page Edit is visibly unavailable, not a broken toggle.
- Session round trip restores layout/mode/page/zoom/fit safely.
- Existing Page Read screenshots and geometry are unchanged.
