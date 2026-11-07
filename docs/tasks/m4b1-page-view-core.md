# M4b1 — page view core (shared layout, read-only preview)

**Role:** Implementer / Builder
**Milestone:** M4 — reader/page + PDF
**Base:** current `main` after M4a integration
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** page model + measurement + read-only page view + basic reader/page mode switch. No PDF,
no reader page-break markers, no editing in page view, no image/anchor polish.

## Goal

Render the paginator's derived pages as a read-only A4 WYSIWYG preview using the same
`packages/layout` engine, the same measurement, and the same page setup as the future PDF. This is
the visual proof for PDF export, not a second layout engine.

Read before starting:

- `docs/spec.md` §6.3 (reader/page), §7.3 (page view), AC-29/AC-31/AC-33
- `docs/tasks/m4-reader-page-pdf.md` (M4b)
- `docs/adr/0002-pdf-pipeline.md`, `docs/adr/0006-page-group-wrap.md`
- `packages/layout/src/{types,layout,paginator,estimate}.ts`
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx`, `state/runtime.ts`, `state/shell.ts`
- Spike reference (read-only, do not copy blindly): `git show 44d8e18:apps/desktop/src/renderer/src/content/segments.ts`,
  `.../content/measurement.ts`, `.../views/PrintPages.tsx`, `.../styles.css`

## Required behavior

1. **Core document → layout document adapter.**
   - Pure function mapping the runtime `Document` to the layout `NoteDocument`: pageSetup (A4,
     orientation, margins), chapters, blocks, anchors, branches, assets, manual break ids.
   - No mutation; unknown fields tolerated. Unit tests for identity of ids/order and for portrait and
     landscape geometry.
2. **Static content renderer for measurement/page view.**
   - Port the spike `segments.ts` into `apps/desktop/src/renderer/src/page/segments.ts`, adapted to
     the current content model: `blockMath` (not `mathBlock`), image `assetId` → display URL via a
     resolver, current marks/attrs, lists, blockquote, code, tables, KaTeX, anchors.
   - Keep it pure HTML/string generation; no React. Unit tests for segment kinds, safe break points,
     table rows, math, image placeholder, and anchor ids.
3. **DOM measurement port.**
   - Port `measurement.ts` into `page/measurement.ts`: hidden but layout-participating host;
     max-content/min-content/fixed modes; segments, anchor rects, table columns, missing assets,
     label height, card height; cache by block + mode; dispose.
   - Use the **page/print typography** CSS, not the editor shell CSS. Wait for `document.fonts.ready`
     and image decode before measuring; two animation frames; no `display:none`.
   - Asset URLs come from the existing `assetUrlFor`/asset protocol; missing assets return
     `missingAssetIds` and render a labeled placeholder, never a remote/data URL.
4. **Page model hook.**
   - `usePageModel(runtime, active)`: debounce document revision changes (~150 ms), compute
     `layoutDocument` + `paginate` with the DOM measurement port, cancel stale async work, expose
     `pages`, `layout`, `ready`, `defects`, `measurementCalls`, `error`.
   - Do not block typing or saves. If measurement fails, show a clear page-view error and keep the
     reader usable.
5. **Read-only page view.**
   - Render `DerivedPage[]` as A4 surfaces with visible margins, page header (document title,
     chapter), footer `Page N of M`, page number and chapter; content box at the document margins.
   - Place each `PageFragment` at `fragment.page.x/y/width/height`; render only
     `startSegment..endSegment`; continuation-out/continuation-in and ghost-parent markers; defect
     badge for blocking defects; anchor warning badge only where already available.
   - Images render through the asset protocol; missing asset is a labeled placeholder. Basic image
     rendering only; region/point anchor overlays and lost-anchor marker polish are M4d.
   - Page controls: previous/next, page indicator, fit page, fit width, actual size, zoom in/out.
     Zoom/fit are navigation only; they must not change layout or pagination. Keyboard accessible.
   - Empty document: a page with margins and a short explanation, never a blank infinite grid.
   - Read-only: no caret/handles; clicking a block selects/focuses it and offers "Open in reader".
6. **Mode switch (basic).**
   - Add `mode: 'reader' | 'page'` to the per-document `DocumentViewState`; default `reader`.
   - `⌘2` reader, `⌘3` page view, plus a visible toggle in the status bar or title bar.
   - Switching must not lose the reader selection/focus/scroll or the current page; clamp current
     page when the page count shrinks. Full AC-33 state preservation and reader page-break markers
     are M4b2, not this slice, but do not regress focus/scroll.
   - A live edit in the reader must appear in the page view without a manual refresh (subscribe to
     the runtime revision). AC-31.
7. **One engine.**
   - Page view and future PDF use the same layout/paginator/measurement and page setup. Do not add
     CSS re-pagination, a print-only layout, or a second measurement path.
8. **No scope creep.**
   - No PDF/printToPDF, no `packages/pdf` print compositor, no reader page-break markers (M4b2), no
     page-view editing, no image region/point overlays, no lost-anchor markers, no crop, no resize,
     no External API.

## Tests and evidence

- Unit: adapter, segments, page-model pure parts, geometry (portrait/landscape), empty page.
- UI (Electron): open page view with a small multi-chapter document; assert page count, margins,
  fragments, page navigation, fit/zoom, ⌘2/⌘3 switch, focus/scroll preservation, live update after a
  reader edit, missing-image placeholder. No native dialogs.
- Screenshots: page view at 1440×900 and 960×720, portrait and landscape; one page with a
  continuation/ghost marker if a fixture provides it.
- Gates: `check:boundaries`, `typecheck`, targeted vitest, `npm test`, `test:ui`, `test:recovery:run`,
  `e2e:critical`, one `verify:fast` at the end.

## Guardrails

- No new runtime dependency (KaTeX, lowlight, TipTap are present).
- Do not change spec/UX/ADR/plan/token docs from this brief; propose values in the report.
- Use the existing design tokens; do not hard-code new spacing literals that duplicate a token.
- Do not modify the product-owner showcase.
- Do not merge or push.

## Deliverable

Report in `docs/reports/m4b1-page-view-core.md`: worktree, branch, base, commit, architecture
(adapter/segments/measurement/page model), page-view behavior, what is deliberately deferred to
M4b2/M4c/M4d, tests/timings, screenshots, changed expectations, risks, not verified. Stop and ask if
the current content model cannot be rendered/measured without a second layout engine, or if the page
view needs a product decision (editing, thumbnails, default mode).
