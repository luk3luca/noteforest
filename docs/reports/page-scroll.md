# PG1 — Page as a scroll of pages — implementation report

**Task:** `docs/tasks/page-scroll.md`
**Design:** `docs/design/page-scroll.md` (17 November 2026), lab `docs/design/page-scroll-ui-lab/`
**Role:** Implementer / Builder
**Worktree:** `a builder worktree`
**Branch:** `t3/608064cc` (the Orchestrator-created worktree branch from `main` at `aa5c7ac`)
**Head:** the single commit on this branch; its SHA is in the handoff message (a report cannot contain the
hash of the commit that introduces it)
**Verdict:** **PASS** for the seven acceptance criteria, with the risks in §6.

---

## 1. Summary

Page is no longer a pager. It is **one vertical scroll of a single column of pages**:

- **Column and seam.** One page wide, pages touching, a 1 px hairline in the existing Page rule colour
  (`--nf-page-rule`) drawn in the 1 px gap the next slot reserves. No gap, no card shadow, no number in
  the seam, no snapping (`scroll-snap-type: none`). The column is as wide as the paper; at 100 % it
  fills the viewport content box, below it the stage adds symmetric margins, above it the stage is
  wider than the viewport and scrolls sideways.
- **Zoom is fit-relative.** `100 %` = fit width (the rest state and the state Page opens in);
  `50 %`–`200 %`; `page` still fits the whole sheet (below 100 % when the sheet is taller than the
  viewport); a stored manual zoom survives and is clamped to 50–200 %. `⌘0` now resets Page to fit
  width at 100 %. The Toolbar percentage shows what the paper actually shows (the Page surface
  publishes it — the Toolbar is a sibling of the canvas and cannot measure the viewport itself).
- **Indicator.** `N / M` in the Toolbar next to the zoom, naming the page under the **centre of the
  viewport**. A centre that lands in the 1 px seam keeps the current page. Clicking it opens a page
  jump (number field on the shared dialog frame); `⌘↑`/`⌘↓` move to the previous/next page start
  (a shell-channel movement, so it keeps working when the jump moved focus to the indicator). The
  pager arrows and the `Page N of M` header badge are gone; the canvas header keeps Export PDF and
  the updating status.
- **Mounting.** Every page owns a slot; only the visible pages **±2** are mounted (keyed by page
  index), the rest are exact-size paper placeholders so the scrollbar and the indicator stay
  truthful. The Page Edit overlay's page is pinned into the window, so scrolling never remounts it.
  Measurement is untouched: it still happens in the hidden host and does not depend on what is
  mounted.
- **Navigation keeps one path.** Find, the `Breaks` list, Health's *Show in note*, `⌘↑`/`⌘↓`, the
  jump, the session restore and a zoom change all write `currentPage`; the surface scrolls to that
  page start and the scroll itself writes back the page under the centre. The write-back is
  idempotent (the re-anchor effect re-reads the centre first), so scrolling never fights the user and
  no external navigation loops.
- **Edges.** Trunks and arrows stay per page (each page's SVG is clipped to its content box): a trunk
  stops at the seam and resumes at the top of the next page. Nothing is drawn across the rule.

The page model, `paginate`, the page chrome strings, the print compositor, the PDF, the Continuous
surface and the settings schema are untouched.

### Harness hardening (the extra item)

- `tests/support/harness.mjs` `waitSaved()` keeps its assertion (every open runtime is `saved`) but
  waits 30 s instead of 10 s, because a loaded machine can spend a long time in a build or a
  parallel suite before the save coordinator writes. The two other document-save completion waits
  with the same shape (`vault-library` autosave, `ui-dialog-frame` external-modification) are raised
  the same way. No assertion was relaxed.
- `markdown-file-view.test.mjs` moved to `SERIAL_FILES`: it owns the OS clipboard for copy-as-rich-text
  and `special-text` writes the same clipboard in the pool. Reproduced on 17 Nov 2026: running both
  concurrently pastes the other suite's formula (`inlineMath` missing) — a correct app failing. It
  now runs after the pool at concurrency 1 (~20 s on the full run).

---

## 2. Files changed

### Renderer — Page surface

- `apps/desktop/src/renderer/src/page/PageView.tsx` — the scroll surface: one slot per page, mounted
  window ±2 over exact-size placeholders, the scroll handler (indicator + window), the idempotent
  re-anchor effect, the fit-relative scale, the seam/placeholder render, the edit page pinned into the
  window, per-page projection/edges/trunks/chrome, the moved focus target and key handling.
- `apps/desktop/src/renderer/src/page/scroll.ts` (**new**) — pure surface geometry: fit-relative
  metrics (`pageSurfaceMetrics`), seam/step, page start offsets, the page under the centre (with the
  seam tie rule), the mounted window, scroll clamping, the 50–200 % clamp.
- `apps/desktop/src/renderer/src/page/page-status.ts` (**new**) — the small external store the Page
  surface publishes `{ pageCount, percent, ready, updating }` to (derived values only; never
  persisted, never in `document.json`, never read by print/PDF).
- `apps/desktop/src/renderer/src/page/use-page-status.ts` (**new**) — `useSyncExternalStore` binding.
- `apps/desktop/src/renderer/src/page/fit-sync.ts` — **removed**. The fit no longer writes a derived
  zoom into the store, so the ⇧2 → ⌘0 race it guarded cannot exist; the percentage in a fit mode is
  computed by `scroll.ts` and published by the surface.

### Renderer — shell

- `apps/desktop/src/renderer/src/shell/Toolbar.tsx` — the page indicator next to the zoom, Page only.
- `apps/desktop/src/renderer/src/shell/PagePosition.tsx` (**new**) — `N / M`, the jump trigger, the
  `– / –` measuring state.
- `apps/desktop/src/renderer/src/shell/PageJumpDialog.tsx` (**new**) — "Go to page" on the shared
  dialog frame (number field, Enter/Go, Cancel), commits an open Page Edit overlay first through the
  one action.
- `apps/desktop/src/renderer/src/shell/CanvasHeader.tsx` — the pager (arrows + `Page N of M` badge)
  removed; the top-level `CanvasPageControls` is now just `{ updating }` (Export PDF and the updating
  status stay).
- `apps/desktop/src/renderer/src/shell/ViewControls.tsx` — the Page percentage reads the published
  fit-relative value; the reset title says 100 %.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — routes the `page-jump` dialog.
- `apps/desktop/src/renderer/src/state/shell.ts` — `DialogState` gains `page-jump`.
- `apps/desktop/src/renderer/src/actions.ts` — `goToActivePage` (commit, then page), `stepActivePage`
  (`⌘↑`/`⌘↓`), `activePagePosition`; `adjustActivePageZoom` steps from the visible percentage and owns
  the manual value; `resetActivePageZoom` is fit width at 100 %.
- `apps/desktop/src/renderer/src/App.tsx` — `⌘↑`/`⌘↓` in the global shell channel for Page (never
  inside a text field or the overlay), so the movement survives a jump that moved focus.
- `apps/desktop/src/shared/view-state.ts` — Page opens at `pageFit: 'width'`; the manual page zoom is
  clamped to 0.5–2 (50–200 %); a stored fit (`page`/`width`/`none`) survives, an unknown value is the
  rest state.
- `apps/desktop/src/renderer/src/styles.css` — page scope only: the stage as one column with the
  measured width and symmetric gutter, the slot/seam/placeholder rules, no page shadow, no snapping,
  `scrollbar-gutter: stable`, the scroll region focus rule, and the `nf-page-position` indicator.

### Tests

- `apps/desktop/test/page-scroll.test.ts` (**new**, 12 tests) — zoom metrics, the seam tie rule, the
  mounted window, page start offsets, the 50–200 % clamp, the Page defaults.
- `apps/desktop/test/page-fit-sync.test.ts` — removed with the mechanism it tested (replaced by the
  zoom-metric tests above).
- `apps/desktop/test/editor-layouts-modes.test.ts`, `apps/desktop/test/view-zoom.test.ts` — the new
  Page default (`width`), the 50–200 % clamp, the legacy-session expectations.
- `tests/ui/page-scroll.test.mjs` (**new**, 7 UI tests) — the seam/free scroll, the seam tie, the
  keys/jump, 100/200/50 %, the 61-page mount window and truthful scrollbar, the Page Edit overlay
  across scrolls, the find ring + the page after a manual break. It writes the six screenshots.
- Migrated suites: `m4b1-page-view`, `m4b1b1-page-edit-overlay`, `r2a-page-arrows-cleanup`,
  `r2b-page-packing`, `r2d-page-edge-style`, `r2g-page-trunk-continuity`, `r2j-page-callout-modes`,
  `m4c1-print-compositor`, `m4c3-pdf-gate`, `find-bar`, `document-health`, `list-fixes`,
  `ui-batch-a`, `v0-shell-frame`, `ui-settings-advanced`, `markdown-file-view`, `vault-library`;
  visual suites `tests/visual/{m4b1-page-view,m4b1b1-page-edit-overlay,r1b-page-density,r2a-page-arrows}`
  (not in the gate).
- `tests/support/ui-session.mjs` — shared Page helpers: `pageView`, `currentPage`, `pageSheet(n)`,
  `currentPageSheet`, `pageScrollState`, `gotoPage(n)` (the product jump + landing wait), and
  `waitCurrentPage(n)`.
- `tests/support/harness.mjs` — `waitSaved` 30 s (see §1).
- `tests/ui/suites.mjs` — `page-scroll.test.mjs` added to the list and the page group;
  `markdown-file-view.test.mjs` in `SERIAL_FILES` (clipboard).

### Docs

- `docs/reports/page-scroll.md` — this report. No spec/UX/ADR/plan change; no new design token (the
  seam reuses `--nf-page-rule`, the geometry is the engine's 1 px, the stage padding is unchanged).

---

## 3. Checks run

| Check | Command | Result |
|---|---|---|
| Boundaries | `npm run check:boundaries` (in `verify:fast`) | PASS — 282 files, 1,371 imports, 16 rules |
| Typecheck | `npm run typecheck` (in `verify:fast`) | PASS — desktop (node + web), core, layout, pdf |
| Unit | `npm test` (in `verify:fast`) | PASS — **162 files / 1,655 tests**, 7.2 s |
| Critical e2e | `npm run e2e` (in `verify:fast`) | PASS — 16/16, 46.6 s |
| **Fast gate** | `npm run verify:fast` | **PASS — exit 0** |
| Page group | `node tests/ui/run.mjs --group page --concurrency 2` | PASS — **19/19**, 159.1 s |
| Shell group | `node tests/ui/run.mjs --group shell` | PASS — **23/23**, 149.8 s (markdown serial) |
| Settings group (extra) | `node tests/ui/run.mjs --group settings` | PASS — 12/12, 58.9 s |
| Images group (extra) | `node tests/ui/run.mjs --group images` | PASS — 5/5, 29.3 s |
| Anchors group (extra) | `node tests/ui/run.mjs --group anchors --concurrency 3` | PASS — 14/14, 70.5 s |

No full `npm run verify` (the Orchestrator owns it). Recovery and the visual suites were not run; the
visual page suites were migrated but are on demand. All UI runs are against the production build
(`npm run build`), hidden windows, no native dialogs.

### Screenshots (artifacts, gitignored)

`artifacts/page-scroll/` at 1440 × 900, written by `tests/ui/page-scroll.test.mjs`:

- `seam-view-1440x900.png` — the bottom of page 2 and the top of page 3 with the 1 px rule between
  them, the footer/header bands reading as paper, `3 / 5` in the Toolbar.
- `indicator-1440x900.png` — the same stop, indicator + `100%` + Zoom in/out in the Toolbar.
- `zoom-200-1440x900.png` — 200 %, the paper twice the viewport with the horizontal scrollbar.
- `zoom-50-1440x900.png` — 50 %, one column centred with symmetric margins.
- `page-after-manual-break-1440x900.png` — the page after a manual break with the blank tail of the
  page above it in view, `2 / 24`.
- `long-document-mid-scroll-1440x900.png` — the 61-page note mid-scroll with placeholders and the
  indicator on the page in view.

### The 1,000-block measurement (no target)

Fixture `seed('performance-1000')` (1,000 blocks → **53 pages**), 1440 × 900, production build,
`artifacts/page-scroll/measure-1000.json`:

| Figure | Value |
|---|---|
| Seed (1,000 blocks in Continuous) | 2,447 ms |
| Page mount: ⌘3 → `data-ready`, updating false | **520 ms** |
| Model run inside it (`data-model-ms`) | 188 ms (compute 115 ms, 2,968 measurement calls) |
| Pages mounted at rest | 3 (of 53) |
| Pages mounted mid-scroll | 6 |
| Page model runs while scrolling | 1 (no re-measure) |
| Scroll: 120 frames × 96 px | **86 fps average, 11.69 ms/frame, p95 33.4 ms** |

The cliff: the p95 frame is one long frame each time the mounted window advances (a new page's
fragments/edges mount while one page unmounts); the average is smooth. If the product wants a strict
60 fps p95 on a 1,000-block note, the next lever is a slightly larger overscan or a deferred/
`content-visibility` paint of the incoming page, not the paginator.

### Opening budget (±10 % of today) — measured against the pre-change build

Both builds were measured in this worktree with the same script (`artifacts/page-scroll/measure-open.mjs`),
the baseline by stashing the change and rebuilding (`artifacts/page-scroll/open-baseline-repeat.json`
vs `open-scroll-repeat.json`):

| Fixture | Today (pager) | PG1 (scroll) | Delta |
|---|---|---|---|
| 300 blocks → 16 pages | 116 ms | 114 ms | −2 % |
| 1,000 blocks → 53 pages | 471 ms | 441 ms | −6 % |
| 61 pages (one block per page) | 48 ms median (65/45/48/47/48) | 48 ms median (65/61/42/47/48) | 0 % |

The 61-page figure is the median of five consecutive Page opens; the model run (16–20 ms) dominates
and mounting three sheets instead of one is inside the noise.

---

## 4. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Page opens at 100 % with one column, pages touching, a 1 px seam, and no snapping | **PASS** | `page-scroll` UI test 1: `data-page-zoom` 100, paper width = viewport content width ±1, seam gap 1 px ±0.5, `::before` height 1 px in `--nf-page-rule`, sheet shadow `none`, `scroll-snap-type: none`; `seam-view`/`indicator` screenshots |
| Scrolling to a seam shows the bottom of one page and the top of the next, and the indicator names the page under the centre | **PASS** | UI test 1 (stop with page 2's bottom and page 3's top in view, indicator `3 / 5` after an arbitrary offset); UI test 2: the exact seam row keeps the current page, ±2 px flips once, and the tie keeps it on the way back (no flicker) |
| `⌘↑`/`⌘↓`, the jump and the `Breaks` list move to page starts; the find's page ring still lands | **PASS** | UI test 3: `⌘↓`/`⌘↑`, the jump and a jump-then-`⌘↓` land with the sheet top at the viewport top (±2 px); UI test 7: find scrolls to page 18 and rings exactly one fragment on that page; `manual-breaks` UI suite green (the row still turns Page to the page) |
| 200 % scrolls horizontally; 50 % shows margins; the page count and the PDF are unchanged | **PASS** | UI test 4: 200 % → scrollWidth > viewport, `scrollLeft` moves, paper = 2× viewport; 50 % → no horizontal scroll, paper = ½ viewport, symmetric margins; `data-page-count` and the page model unchanged; `m4c3-pdf-gate` green (61 pages, parity, raster) |
| With 61 pages only the visible window is mounted; the scrollbar length is correct at both ends | **PASS** | UI test 5: 61 pages, ≤7 mounted, placeholders = count − mounted, scrollHeight = column ±3 px, the end reaches `scrollTop + clientHeight = scrollHeight`, page 1 unmounted mid-note and remounted at the start, `data-model-runs` constant while scrolling |
| Page Edit opens and commits while scrolled, and does not remount on scroll | **PASS** | UI test 6: the overlay node keeps its marker across a 120 px scroll, away-scroll and back (its page is pinned), moves with its page (`top − 120`), scrolling never commits, `⌘↵` after the scroll commits; `m4b1b1` green (jump commits first, geometry unchanged while editing) |
| No regression in print parity, the PDF gate, the manual breaks, the find and the health | **PASS** | `m4c1-print-compositor` 6/6, `m4c3-pdf-gate` 3/3 (50+ page gate), `m4c2`/`m4c3-packaged` green, `manual-breaks` 3/3, `find-bar` 16/16, `document-health` 6/6 |

---

## 5. Migrated assertions

Every page suite that assumed "one page visible at a time, arrows, `Page N of M`" now asserts a
scroll position plus the indicator. Nothing was dropped without a replacement:

### `m4b1-page-view.test.mjs`

1. `activeSheet()` = the first `.nf-page-sheet` → the sheet with `data-page-current="true"`; a new
   `sheetFor(n)` targets one page.
2. Long-document navigation: `[data-page-nav="next"]` click + `data-current-page === 2` → `ui.gotoPage(2)`
   + `ui.waitCurrentPage(2)`; the continued-from chip and ghost list are read on page 2's sheet (a
   multi-page fixture now mounts several sheets).
3. `Alt+ArrowDown/Up` → `Meta+ArrowDown/Up`; the "previous arrow is enabled after page 1" assertion →
   the surface is scrolled (`scrollTop > 0`) and page 2's sheet top is at the viewport top.
4. Chapter test: arrow click → `ui.gotoPage(2)`; `activeSheet()` → `sheetFor(2)`.
5. Image/anchor geometry probes: `data-page-zoom / 100` (the CSS zoom) → `data-page-scale`.
6. Fit-race test: after ⇧2 → ⌘0 the state is `pageFit === 'width'` and the label 100 % (was `'none'`
    and a stored manual 1); after ⌘+ the manual value starts from the visible percentage (1.1, 110 %),
    which is now asserted explicitly.
7. Session test: the arrow click to page 2 → `ui.gotoPage(2)`.

### `m4b1b1-page-edit-overlay.test.mjs`

8. `activeSheet()` → the current sheet.
9. "Page navigation from the toolbar commits the overlay first" → "an explicit page jump commits the
   overlay first" (`ui.gotoPage`), and the return to page 1 goes through the jump; scrolling itself
   never commits (asserted in the new suite).
10. Spanning-block overlay: the arrow click to page 2 → `ui.gotoPage(2)`.
11. The typing guard ("page shortcuts do not steal typing") now sets Fit page (⇧1) *before* typing,
    because the default fit is now `width`; a stolen ⇧2 would still be visible as a flip to `width`.

### `r2a-page-arrows-cleanup.test.mjs`

12. Page-local helpers (`edgeGroup`, `allEdges`, `fragmentBox`, trunk/label queries, the one edge
    layer) are scoped to the current sheet (or the current slot for the overlay); page-2 navigation
    and the last-page walk use the jump.

### `r2d-page-edge-style.test.mjs`

13. The same scoping for `readEdges`, `contentBox`, `fragmentBoxes`, `pointerProbe`, trunks, labels,
    the one edge layer and the overlay; the page-2 and last-page loops use the jump.

### `r2g-page-trunk-continuity.test.mjs`

14. `goToPage` (arrow loop) → `ui.gotoPage`; fragment/trunk/edge/label reads are scoped to the current
    sheet; "Page Edit keeps the one edge layer" is one layer per current page.

### `r2j-page-callout-modes.test.mjs`

15. `gotoPage` (arrow loops) → `ui.gotoPage`; `fragmentBox`/`allFragmentBoxes`/`contentBox`/`anchorBox`/
    `readEdges`/`readTrunks` scoped to the current sheet; `anchorBox` uses `data-page-scale`; the
    overlay is read on the current slot.

### `r2b-page-packing.test.mjs`

16. `anchorBox` used the first `.nf-page-sheet-wrap`'s `data-page-zoom` as a factor → the element's own
    sheet `data-page-scale` and that sheet's content box.

### `m4c1-print-compositor.test.mjs`

17. The local arrow `gotoPage` → `ui.gotoPage`; `readSnapshots` reads the named page's sheet (was
    `.first()`, which is no longer the target once several pages are mounted); the computed-metrics
    sheet is the current sheet.
18. The Page/print attribute snapshot excludes `data-page-current` (viewport view state) — the print
    surface legitimately has no current page.

### `m4c3-pdf-gate.test.mjs`

19. "Actual size" wait: the wrap's CSS zoom `=== '100'` → the view's fit-relative percentage 100 with
    `data-page-fit === 'width'` (the gate now runs at fit width, not 1:1 CSS px).
20. The arrow `gotoPage` loops → `ui.gotoPage`.
21. `readPageGeometry` reads the current sheet and divides every box (and width/height) by
    `data-page-scale` before mm conversion — the parity check is now independent of the window size,
    where it used to rely on a 1:1 CSS scale.

### `find-bar.test.mjs`

22. "The page keeps its zoom" reads the view's published percentage (was the first sheet wrap's).
23. The minimum-window header control count 12 → 10 (the two pager arrows are gone) and `[data-page-nav]`
    is removed from the probe.
24. The narrow-window assertion "the input shrank" can no longer hold — with the arrows gone the find
    cluster fits at the app minimum. It is replaced by the structural property that made it true: the
    input is the flexible child (`flex: 1 1 auto`, `min-width: 0`), keeps ≥160 px, never grows, and the
    cluster never exceeds its 360 px cap; nothing is clipped.

### `document-health.test.mjs`

25. "Show in note jumped to page N": b16 is already mounted in the visible window at rest, so its
    presence is not the signal; the test waits for the indicator > 1 and then asserts b16 is on the
    current page's sheet.

### `list-fixes.test.mjs`

26. `goToPage` (arrow clicks, `aria-label="Next page"`) → the jump; list markers are read from the
    named page's sheet while walking pages.

### `ui-batch-a.test.mjs` / `v0-shell-frame.test.mjs`

27. Header page nav + `[data-page-counter]` `Page N of M` → no pager arrows, no header badge, and the
    Toolbar indicator matches `^\d+ / \d+$` (Batch A) / `1 / M` (V0).
28. `v0`: the initial Page fit was asserted `'page'` → `'width'` (the rest state); ⌘0 via the percentage
    control now ends on `pageFit === 'width'` with 100 % (was `'none'`).

### `ui-settings-advanced.test.mjs`

29. The 360 px max-card-width assertion compared a raw *screen* width to 360 and only passed because
    fit-page zoom was below 1. It now divides the card box by `data-page-scale` and compares against
    the cap plus the card's own padding/border, and also asserts the long card fills the cap.

### `markdown-file-view.test.mjs` / `vault-library.test.mjs`

30. Guest files: the old `[data-page-counter]` absence is kept and a `[data-page-position]` absence is
    added (a `.md` guest has no pages at all).

### Visual suites (on demand)

31. `tests/visual/m4b1-page-view`, `m4b1b1-page-edit-overlay`, `r1b-page-density`, `r2a-page-arrows`:
    arrow navigation → the jump; `data-page-zoom / 100` → `data-page-scale`; the continuation fragment
    is read on the current sheet.

### Unit

32. `editor-layouts-modes`: page zoom clamp 2.5 → 2 and 0.1 → 0.5, default fit `page` → `width`, legacy
    session expectations (`pageZoom: 2`, `pageFit: 'width'`).
33. `view-zoom`: the Continuous control reports the document default `pageFit: 'width'`.
34. `page-fit-sync.test.ts` deleted with `page/fit-sync.ts`; its intent (a pending fit must not win over
    a newer manual zoom) is now impossible and replaced by the zoom-metric tests in `page-scroll.test.ts`.

---

## 6. Risks and known limitations

1. **Two focus stops in Page** — the region root (page-level keys from the header: Escape, `⌥↑`/`⌥↓`,
   Enter) and the scroll region inside it (native arrows/PageUp/PageDown/Home/End). Both are labelled;
   the scroll region has no focus ring, the fragments and controls keep theirs. A VoiceOver pass should
   confirm the reading order and that the extra stop is not noisy.
2. **The indicator is the centre rule, not "the page you named".** At a small zoom several pages fit
   the viewport, so a jump to page 10 can leave the indicator on 11 or 12. That is the design (§4);
   the jump is defined as "the page start at the top of the viewport" and is asserted that way.
3. **100 % is no longer 1:1 CSS pixels.** Any workflow that assumed the old "actual size" is now fit
   width. The page model, the page count and the PDF are unaffected; a 1:1 view is reachable by zooming
   in to the ratio of the page width to the viewport.
4. **Legacy sessions keep `pageFit: 'page'`.** A session saved before PG1 with the old default fit-page
   opens fit-page (a smaller paper with margins), not 100 %, until the next reset. New sessions and
   documents open at fit width. Migrating every stored `page` to `width` would also throw away an
   explicit ⇧1 choice, so the stored value is kept.
5. **Session writes while reading.** Crossing a page boundary writes `currentPage` to the session
   (debounced by the existing session writer). That is the same view-state write the pager did per
   click; on a long read it is more frequent. No document write, no page-model run.
6. **`scrollbar-gutter: stable` reserves the scrollbar.** On a platform with classic scrollbars the
   paper is narrower than the window by the scrollbar width (it still fills the content box), and the
   right margin at < 100 % is wider by that width. Overlay scrollbars (macOS default) are unaffected.
   The alternative (no gutter) makes fit width depend on whether the scrollbar is showing and can
   oscillate.
7. **1,000-block scroll p95 33.4 ms.** One long frame per mounted-window advance; the average is
   86 fps. Acceptable for v1, but the next lever is described in §3 if the product wants a strict p95.
8. **`markdown-file-view` is serial now** — a full verify costs ~20 s more, and the suite list has one
   more serial entry whose reason is the shared OS clipboard, not app slowness.
9. **The visual suites were migrated but not run** in this batch (on demand by policy); the screenshot
   evidence comes from the UI suite.
10. **Trunk continuity is per page by construction.** Each page clips its own SVG, so nothing crosses
    the seam; a future design that wants a visible continuation across the rule would need a new
    decision, not a code tweak.

## 7. Open questions

- Product owner visual pass on the seam weight (`--nf-page-rule` hairline at 100 % and at 200 %), the
  placeholder paper while scrolling fast, and the indicator's placement next to the zoom.
- Should the page jump also offer a small recent-pages list, or is the number field enough for v1?
- Should the Toolbar indicator show the page count while the model is measuring as `– / –` (current) or
  keep the previous count?

## 8. Next step

Targeted Sentinel review of this branch (the scroll surface, the indicator/centre rule, the mounting
window and the migrated assertions), then the product-owner visual/VoiceOver pass over the seam, the
indicator and the zoom states, then integration on `main` and the M4c/PDF product-owner check.
