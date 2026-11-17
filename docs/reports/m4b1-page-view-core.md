# M4b1 — page view core (shared layout, read-only preview)

**Role:** Implementer / Builder  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m4b1-page-view-core`  
**Base:** `c71f6e9` (`docs: split M4b and launch page view core`)  
**Implementation commit:** `686004c34360398042ece024d799bcb1e2e82fa8`  
**Report/evidence commit:** branch head after this file (multi-chapter test + docs only; product code is
`686004c`)  
**Status:** implementation, tests, screenshots, and final `verify:fast` complete; not merged, not pushed

## Summary

Implemented a read-only A4 page view over the **existing** `packages/layout` engine and paginator,
with one core→layout adapter, one static segment renderer shared by measurement and rendering, a DOM
measurement port at page/print typography, a debounced/cancellable page-model hook, and a basic
per-document reader/page switch.

The page view is the paginator's output, not a second layout:

```text
canonical core Document
  -> page/adapter.ts: pure toLayoutDocument()
  -> page/measurement.ts: hidden DOM host at page typography
  -> packages/layout: layoutDocument() + paginate()
  -> page/PageView.tsx: derived pages, fragments, markers, A4 chrome
```

No PDF, no `packages/pdf` print compositor, no reader page-break markers, no page-view editing, no
image region/point overlays, no lost-anchor polish, no crop/resize, no External API. No new runtime
dependency.

## Architecture

### 1. Core → layout adapter (`page/adapter.ts`)

Pure, no DOM, no mutation:

- copies page setup (A4, orientation, margins), chapter order, top-level order, block keys, anchors,
  primary/reference branches, branch order, assets, manual break hints, revision/title/timestamps;
- preserves unknown content fields through `structuredClone`; unknown root fields are not copied
  because the layout package does not consume them;
- maps all four anchor kinds to layout anchor records. Text/code quotes, formula LaTeX, image label,
  occurrence hint, and a one-line code token hint are preserved;
- exports `PAGE_LAYOUT_OPTIONS` (the production layout defaults) and the CSS variables derived from
  them (`--nf-page-card-padding` 12, `--nf-page-card-border` 1, `--nf-page-segment-gap` 8), so page
  CSS cannot drift from the measured card box;
- exports `corePageGeometry()` for the loading/empty page before a layout model exists.

### 2. Static segment renderer (`page/segments.ts`)

Pure HTML string generation, no React and no DOM reads. The same output is used by the measurement
host and the page surface.

- Segment boundaries are the safe-break contract: paragraph, heading, list item, blockquote
  paragraph, one segment per code line, one per table row, display math, block image.
- Supports the current content model: `mathBlock` **and** editor `blockMath`, `inlineMath`,
  `blockMath`, lists (nested ordered/bulleted), blockquotes, code blocks, tables (header row, fixed
  columns), images with `assetId`, marks (`strong`, `em`, `code`, `strike`, `underline`, `link`,
  `anchor`), KaTeX, and explicit fallback nodes for unknown content.
- Table cells, list items, and blockquote children can contain block content (lists, code, math,
  images, nested tables) without creating a new page segment.
- Text/formula/code/image anchors are emitted as `data-anchor-id` wrappers. The measurement port
  resolves their rects; image regions and formula-term geometry remain best-effort until M4d.
- Missing/unsupported images always render a labeled placeholder and `data-missing-asset`; no
  remote or `data:` URL is ever produced.

### 3. DOM measurement port (`page/measurement.ts`)

- Hidden but layout-participating host: `position:absolute; left:-30000px; visibility:hidden` — never
  `display:none`.
- `prepare(blocks)` preloads/decodes package images, renders every block once to request fonts,
  waits for `document.fonts.ready`, two animation frames, and fonts again before measuring.
- Intrinsic min/max-content measurement and fixed-width measurement share the same card markup and
  page/print typography as the page surface.
- Measures segments (kind, path, y/height, breakable-before), anchor rects and occurrences, table
  column widths, label height, content top, card height, and missing asset ids.
- Caches intrinsic and fixed measurements by block content + mode; `dispose()` removes the host.
- All asset URLs come from the renderer's existing `assetUrlFor()`/`noteforest-asset://` path.

### 4. Page model (`page/model.ts`, `page/usePageModel.ts`)

- `computePageModel()` is a pure layout+paginate wrapper for tests.
- `usePageModel(runtime, active)` subscribes to the runtime structure version, debounces changes by
  150 ms after the first pass, aborts stale work with `AbortController`, and disposes the measurement
  host per run.
- Exposes `pages`, `layout`, `ready`, `updating`, `defects`, `measurementCalls`, `failedAssetIds`,
  `assetUrls`, `error`, and `reload`.
- A measurement failure shows a page-view error surface/banner; the reader stays mounted and usable.

### 5. Read-only page view (`page/PageView.tsx`)

- One A4 page at a time (portrait 210×297 mm, landscape 297×210 mm) at the document margins.
- Header: document title + chapter. Footer: chapter + `Page N of M`.
- Fragments positioned at `fragment.page.x/y/width/height`; only `startSegment..endSegment` is
  rendered. First/last fragment padding and borders match the measured card box.
- Continuation-out and continuation-in markers live in the margin bands; continuation-in includes the
  ghost parent, anchor quote when available, and block label.
- Blocking defects get a page badge, per-block badge, and a blocking-defect banner. Unresolved layout
  anchors get a warning badge only where the anchor state already exists.
- Images render through the package asset protocol; missing images use the labeled placeholder.
- Controls: previous/next, page indicator, fit page, fit width, actual size, zoom in/out. Fit/zoom are
  navigation only; they change the CSS zoom of the page wrapper, never layout or pagination.
- Keyboard: `⌥↑/⌥↓`, `PageUp/PageDown`, `⇧1` fit page, `⇧2` fit width, `⌘+`/`⌘−`/`⌘0` routed by the
  shell, `Enter` open selected block in reader, `Esc` clear selection.
- Clicking a fragment selects/focuses that block; double-click/Enter or the visible
  **Open in reader** button switches back and reveals it.
- Empty document: a real A4 sheet with header/footer and "Nothing to paginate yet.", never a blank
  infinite surface.
- Loading, error, and empty states are page-shaped; no infinite grid.
- Page view is read-only: no caret, handles, editing, drag, or delete.

### 6. Reader/page mode switch

- `DocumentViewState` gained `mode` (`reader` default), `currentPage`, `pageZoom`, `pageFit`.
- `⌘2` reader and `⌘3` page view; visible **Reader | Page** toggle in the status bar; palette entries
  added. Reader zoom/focus controls are hidden in page mode.
- Reader selection, scroll, focus, and current page survive a round trip. The reader surface stays
  mounted but hidden, is made non-editable, and restores its selected block and scroll position.
  Hidden ProseMirror rebuilds cannot overwrite the page selection; a hidden editable toggle cannot
  create a text-history entry.
- The page model subscribes to the runtime revision, so a structural/content change while the page
  view is open repaginates without a manual refresh. A shrinking page count clamps `currentPage`.

## Page/print typography (proposed values)

These live in `styles.css` under `.nf-page-scope` and are not yet added to `docs/design-tokens.md`
(the brief says propose values, not change token docs):

| Element | Value |
|---|---|
| Body | 10.5 pt / 1.45 |
| Block label | 11 pt / 1.2, 650 weight |
| Heading 1 / 2 / 3 | 16 pt / 13.5 pt / 12 pt |
| Code | 8.75 pt / 1.45 |
| Table | 9.5 pt / 1.35 |
| Header/footer | 8 pt |
| Continuation/ghost marker | 7.5 pt |
| Card padding / border / segment gap | 12 px / 1 px / 8 px from `DEFAULT_LAYOUT_OPTIONS` |
| Page stage padding | 32 px (`editorPaddingXMedium`) |
| Header/ghost/footer/continues positions | 0.30 / 0.62 / 0.30 / 0.60 of the margin band |

The page view uses only existing shell tokens for shared spacing (`--nf-card-radius`,
`--nf-canvas-pad-x-medium`, `--nf-child-gap`, `--nf-card-padding`) and derives card chrome and segment
spacing from `packages/layout`, not from a second literal set.

## Deliberately deferred

- **M4b2:** reader page-break markers; full AC-33 selection/scroll/current-page polish; hidden focused
  block reveal; mode persistence across relaunch.
- **M4c:** PDF/`printToPDF`, print compositor, vector arrows/borders, page-view/PDF raster parity,
  table header repetition on continuation pages, reserved marker height, 50+ page gate.
- **M4d:** image region/point overlays in page/PDF, exact formula-term and code-range geometry,
  lost-anchor marker polish, crop/display-width, 300/1,000-block page-view performance and
  virtualization.
- **Out of scope:** page-view editing, thumbnails, manual break-hint UI, orientation-change UI,
  External API.

The reader still uses the M3 DOM/CSS branch layout; the page view and future PDF use
`packages/layout`. Reader/page pixel parity is therefore not delivered by this slice. It is the main
architecture risk for M4b2/M4c and must be decided there, not papered over with CSS re-pagination.

## Tests and timings

| Check | Result |
|---|---|
| `npm run check:boundaries` | 136 files, 639 imports, 16 rules, pass |
| `npm run typecheck` | desktop node+web, core, layout, pdf: pass |
| Targeted vitest (`page-adapter`, `page-segments`, `page-model`, token guard) | 22 tests / 0.13 s, pass |
| `npm test` | 71 files / 729 tests / 2.43 s, pass |
| `npm run test:ui` | 20 suites / 54 tests / ~91 s test time, pass |
| `npm run test:recovery:run` | 14 tests / 17.9 s, pass |
| `npm run e2e:critical` | 16 tests / 36.3 s, pass |
| `npm run verify:fast` (final) | boundary + typecheck + 729 unit + 16 e2e, exit 0 |
| `npm run test:visual:m4b1` | 1 screenshot flow, pass |

New tests:

- `apps/desktop/test/page-adapter.test.ts` — identity/order, no mutation, portrait/landscape
  geometry, all anchor kinds, unknown content preservation.
- `apps/desktop/test/page-segments.test.ts` — segment kinds/order/safe breaks, lists, blockquotes,
  code lines, KaTeX error source, tables/rows, block content inside atomic rows/list items, image
  placeholder, anchor wrappers, sliced HTML.
- `apps/desktop/test/page-model.test.ts` — pure layout+paginate in both orientations, empty document,
  page clamp, blocking-defect filter.
- `tests/ui/m4b1-page-view.test.mjs` — A4 geometry/margins, fragments, read-only, fit/zoom, live
  update, missing and present images, portrait navigation, continuation/ghost markers, chapter-start
  page numbering in a two-chapter document, page-count shrink clamp, empty page, measurement-error
  surface with a usable reader, mode switch preserving selection/scroll/focus, Open in reader.
- `tests/visual/m4b1-page-view.test.mjs` — portrait/landscape screenshots at 1440×900 and 960×720.

Changed expectations:

- `⌘2`/`⌘3` are now reader/page view shortcuts, not tab 2/3. `Control+Tab` and `⌘⇧]` remain tab
  cycling; `⌘1` and `⌘4`–`⌘9` keep direct tab selection. The two existing E2E/visual tab checks were
  updated to `Control+Tab`.
- Page view defaults to fit page, per UX.
- The page card uses the layout engine's 12 px padding, not the editor shell's 10 px; it is page/print
  typography, not editor chrome.
- `mathBlock` (canonical) and `blockMath` (editor node name) are both accepted by the renderer.

## Screenshots

- `artifacts/m4b1/page-landscape-1440x900.png`
- `artifacts/m4b1/page-landscape-960x720.png`
- `artifacts/m4b1/page-portrait-1440x900.png`
- `artifacts/m4b1/page-portrait-960x720.png`
- `artifacts/m4b1/page-portrait-continuation-1440x900.png` (page 2, continuation-in/ghost parent)

The evidence shows A4 landscape/portrait sheets, visible margins, headers/footers, fragments,
continuation-out on page 1 and continuation-in/ghost parent on page 2. `artifacts/` is gitignored
local evidence, as in earlier reports.

## Files changed

New:

- `apps/desktop/src/renderer/src/page/adapter.ts`
- `apps/desktop/src/renderer/src/page/segments.ts`
- `apps/desktop/src/renderer/src/page/measurement.ts`
- `apps/desktop/src/renderer/src/page/model.ts`
- `apps/desktop/src/renderer/src/page/usePageModel.ts`
- `apps/desktop/src/renderer/src/page/PageView.tsx`
- `apps/desktop/test/page-adapter.test.ts`
- `apps/desktop/test/page-segments.test.ts`
- `apps/desktop/test/page-model.test.ts`
- `tests/support/page-fixtures.mjs`
- `tests/ui/m4b1-page-view.test.mjs`
- `tests/visual/m4b1-page-view.test.mjs`

Modified:

- `apps/desktop/src/renderer/src/state/shell.ts` — mode/page/zoom/fit view state.
- `apps/desktop/src/renderer/src/actions.ts` — mode/page/zoom actions, palette entries, open-in-reader.
- `apps/desktop/src/renderer/src/App.tsx` — ⌘2/⌘3 routing, page zoom routing, view-state test hook.
- `apps/desktop/src/renderer/src/shell/StatusBar.tsx` — visible Reader/Page toggle.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — mounted reader + page surface, visibility,
  state preservation, hidden-editor update guards.
- `apps/desktop/src/renderer/src/styles.css` — page/print typography, A4 sheet/fragments/chrome,
  measurement host, page controls.
- `apps/desktop/src/renderer/src/global.d.ts` — `viewState` test hook.
- `package.json` — M4b1 UI suite in `test:ui`/`verify`, `test:visual:m4b1`.
- `tests/e2e/m2-editor.test.mjs`, `tests/visual/m2-screenshots.test.mjs` — tab shortcut changed from
  `⌘2` to `Control+Tab`.

## Risks / open questions

- **Reader/page geometry parity is not achieved.** The page view is the shared paginator; the reader
  still uses the M3 DOM branch layout. M4b2/M4c must decide whether the reader is rebuilt as a
  renderer over the same layout. This is the largest architectural gap.
- **Continuation markers live in margin bands** (ADR-0002 addendum). Many simultaneous continuations
  can stack into the content area. M4c should reserve marker height or cap/roll up the list; this is
  not solved in M4b1.
- **Anchor fidelity is partial by design.** Image anchors resolve to the whole image box, formula-term
  anchors to the whole formula, code range anchors to the token/first line. Region/point overlays and
  exact term/range geometry are M4d.
- **Measurement cost.** `prepare()` renders every block once and measurement is synchronous after
  fonts/images settle. 300 blocks are not timed in page view; 1,000 blocks and virtualization are
  M4d. The page view also renders only the current page, not thumbnails or the full stack.
- **View state is in-memory only.** Mode/current page/page zoom/fit are per-document shell state and
  are not persisted across relaunch yet; full AC-33 persistence is M4b2.
- **Post-open asset loss.** Assets observed missing at open are placeholders; a file that disappears
  after the prepare pass is not re-rendered until the next model run. The protocol still returns 404,
  but M4b1 does not install an `<img onerror>` repair path.
- **Chrome overlays the paper.** Defect/anchor badges and selection rings are page-view chrome over
  the WYSIWYG sheet; the PDF renderer must not inherit screen-only badges. M4c owns the print skin.
- **No PDF evidence.** Page count parity, text extraction, and cut rules are not verified; they are
  M4c gates.

## Not verified

- Product-owner visual judgement, dark/light perception, VoiceOver and keyboard-only pass.
- 300/1,000-block page-view performance and memory.
- PDF page-count parity, text extraction, no-cut rules, image embedding, vector arrows.
- Manual break hints/orientation change UI (no command/UI in M4b1; fixtures cover both orientations).
- Trackpad pinch/pan and Page zoom gestures beyond buttons and keyboard.
- Multiple simultaneous continuation markers in one margin band.
- Page thumbnails (Q19 remains open; page indicator only).
- Full AC-31 "both views visible at once" because v1 shows one surface per document; the shared-model
  subscription is exercised by applying a structural edit while the page view is visible.

## Next suggested step

Sentinel review of M4b1 against the brief, then M4b2 (reader page-break markers + full AC-33 state),
then M4c PDF/print compositor using this same page model, measurement, and typography.
