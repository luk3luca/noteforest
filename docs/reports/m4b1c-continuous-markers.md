# M4b1c — continuous page-break markers

**Role:** Implementer / Builder  
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-8927b71a`  
**Branch:** `t3/m4b1c-continuous-page-break-markers`  
**Base:** `e481d7c` (`docs: launch M4b1c continuous markers`)  
**Implementation commit:** `5730768ad181685b6b951f4f4c32010c4e3a014e`  
**Tests/evidence commit:** `928a064` (Continuous Read marker assertion)  
**Report commit:** branch head after this file (docs only)  
**Status:** implementation, tests, screenshots, and final `verify:fast` complete; not merged, not pushed

## Summary

The Continuous layout now shows derived page-break hints while the user works. There is one page model
per open document, owned by `DocumentEditor` and shared by the Page layout and the marker layer; there
is no second measurement and no second paginator.

```text
canonical core Document (revision)
  -> page/adapter.ts -> page/measurement.ts -> packages/layout layoutDocument() + paginate()
  -> DocumentEditor: usePageModel(runtime, active)   <-- one owner
       |-> PageView (Page Read / future Page Edit)
       |-> PageBreakMarkers (Continuous Edit and Read)
              -> page/page-markers.ts: pure fragment -> marker derivation
              -> useBlockRects: content-coordinate y/left anchors
```

The marker overlay is absolutely positioned inside `nf-canvas-content`, so it changes no block rect,
no content height and no scroll height. Hidden/collapsed blocks have no measured rect and are skipped;
the full page model, Page Read and the future PDF are untouched.

No Page Edit, PDF, CSS re-pagination, second measurement, collapse change, new dependency, or
spec/UX/ADR/plan edit.

## Page-model ownership

- `DocumentEditor` calls `usePageModel(runtime, active)` once per open document. The model is passed
  to `PageView` as a prop and to `PageBreakMarkers` inside `EditorSurface`.
- `PageView` no longer calls `usePageModel`; it consumes the shared model. Switching
  Continuous ↔ Page therefore mounts/unmounts only renderers, never a measurement owner.
- The hook still uses the 150 ms debounce after the first pass, an `AbortController` per run, and a
  fresh hidden measurement host that is disposed in the same task.
- Recompute key is `(runtime.document.revision, reloadToken)`. View-only notifications (selection,
  focus, collapse, save-state chrome) bump `runtime.version` but not the canonical revision, so they
  do not trigger a full re-measure. A completed model for the current revision is reused when the
  layout changes, a tab becomes active again, or collapse changes.
- Measurement failure keeps the previous derived data but hides markers; in Continuous the failure is
  a visually hidden `role="status"` note and typing/saving continue. Page keeps its existing visible
  error surface, retry button and "Open in continuous editor" path.
- New diagnostics only (`data-*` attributes and `PageModelState` fields): `runs`, `lastRunMs`,
  `lastComputeMs`. They are used by the UI evidence and do not affect product behavior.

The existing M4b1 measurement-error UI test was adapted to the shared ownership: it now waits for the
seeded revision's successful model, forces the *next* revision to fail, and then opens Page.

## Marker derivation

`page/page-markers.ts` is pure and React-free:

- **Page start.** For each derived page, take the first fragment in reading order with
  `isFirst && isPageStart`; one page-start marker per page. Side-by-side blocks that both start the
  page produce one marker, not a duplicate. Page 1 is included because its first block satisfies the
  brief's literal rule; this is a product-visible choice flagged under risks.
- **Continuation.** One chip per block that has any `continuesToPage`; target pages are collected
  across all of that block's fragments, deduplicated and sorted. A block spanning pages 2–7 gets one
  chip reading “Continues on pages 2–7”; two non-contiguous targets read “pages 2, 4”.
- **Dedupe.** A block that starts page N and continues on N+1 gets one page-start marker and one
  continuation chip, as the brief requires. A block spanning several pages never gets more than one
  continuation chip.
- **In-block safe breaks.** These are not moved into the ProseMirror DOM. The block-boundary
  page-start marker (when the block starts a page) plus the continuation chip are the Continuous
  representation; exact in-block geometry stays in Page Read and the future PDF. No pixel parity is
  claimed.
- **Labels.** `pageStartLabel` (`Page N starts here`) and `continuationLabel` (singular/plural/range)
  are shared by the visible chip, `aria-label`, and `title`. Text plus page number, never color
  alone.

## Rendering, visibility and collapse

- Overlay: `position: absolute; inset: 0` inside `.nf-canvas-content`, `z-index: 2`,
  `pointer-events: none` on the layer and markers; only the page-number chip enables pointer events.
  No tab stops are created (no action is attached).
- A page start is a dashed line across the content width with a right-aligned chip. A continuation is
  a left-aligned pill at the block's top edge. Both chips are centered on the block's top edge: half
  in the 16 px row gap and half in the card's blank 10 px top padding, so they cannot cover prose,
  code, formulas or gutter/port/add-child handles. At 1440 and 960 they stay legible.
- Accessibility: page starts are `role="separator"` with `aria-orientation="horizontal"` and an
  `aria-label` that names the page and states the hint is derived; continuations are `role="note"`
  with the same style of label. The visual chip text is `aria-hidden` so VoiceOver reads one clean
  sentence.
- Markers render only in the Continuous layout (`visible`). In Page the marker layer is not mounted;
  the page surface is unchanged.
- Collapse/focus hidden blocks have no measured rect (`useBlockRects` excludes zero-size cards), so
  their hints are skipped. The page model is still computed over the full document; Page Read and
  PDF still contain the hidden block. Collapsing does not increment the model run count.
- If the page model is not ready, no overlay is rendered. If measurement failed, no stale markers
  remain and the quiet status note explains why.

## Performance at 300 blocks (Continuous)

Method: the existing `debugSeed('performance')` 300-block fixture opened in Continuous, window
1440×900, hidden E2E window, one `verify:fast`-built app. The UI test reads the marker layer's
diagnostics. Values vary by a few milliseconds between runs; this is the final full-suite run.

| Metric | Value |
|---|---|
| Seed → markers ready (includes app seed/open/render) | 1.47 s |
| First page-model run (prepare + 2 frames + fonts + layout + paginate) | 463 ms |
| Synchronous layout + paginate (`lastComputeMs`) | 24 ms |
| Measurement calls | 600 (300 blocks × intrinsic + fixed) |
| Derived pages | 32 |
| Rendered markers | 14 |
| Typing 20 characters through a repagination | 564 ms including the test's click/caret setup; all keystrokes arrived |
| Second repagination after a content commit | 58 ms wall / 22 ms synchronous |

The synchronous page-model work is about 20–25 ms; the larger first-run wall time is the asynchronous
font/image/frame settle in `prepare()`, which does not block the editor for its whole duration. Typing
through a repagination stayed usable and no keystroke was lost, so idle scheduling was not needed in
this slice. Revision-keyed reuse keeps view-only changes at zero measurement cost.

## Tests and timings

| Check | Result |
|---|---|
| `npm run check:boundaries` | 140 files, 660 imports, 16 rules, pass |
| `npm run typecheck` | desktop node+web, core, layout, pdf: pass |
| Targeted vitest (`page-markers`, `page-model`) | 9 tests, 109 ms, pass |
| `npm test` | 76 files / 768 tests / 2.34 s, pass |
| `npm run test:ui` | all suites pass; new M4b1c suite 7/7 tests, 6.3 s suite time |
| `npm run test:recovery:run` | 14 tests, 17.9 s, pass |
| `npm run e2e:critical` | 16 tests, 36.5 s suite, pass |
| `npm run verify:fast` (final) | boundary + typecheck + 768 unit + build + 16 critical e2e, exit 0 |
| `node --test tests/visual/m4b1c-continuous-markers.test.mjs` | 1 screenshot flow, 2.2 s, pass |

New tests:

- `apps/desktop/test/page-markers.test.ts` — page-start dedupe for a shared page top, no page start
  when a page begins inside a long block, one continuation chip across many fragments, page-start +
  continuation for the same block, empty model, singular/plural/range labels.
- `tests/ui/m4b1c-continuous-markers.test.mjs` — 4-page manual-break fixture: marker count/page
  numbers match Page Read, marker y equals the anchor card top, separator roles/labels, chips are not
  tab stops, Continuous Read keeps the same markers, Page Read reuses the model (`runs` stays 1) and
  has no marker overlay, return to Continuous does not re-measure; long fixture: one continuation
  chip, page range and first target agree with Page Read, no duplicate for the block; collapse:
  hidden block loses its chip while page count and model runs stay unchanged, Page Read still
  contains the fragment, expand restores the chip; layout neutrality (hide the overlay and compare
  every card rect, content height and scrollHeight); live edit repaginates once without a scroll
  jump; forced measurement failure renders no stale markers, exposes the quiet status and keeps
  typing usable; 300-block page-model and typing measurement.
- `tests/visual/m4b1c-continuous-markers.test.mjs` — 1440×900 and 960×720 screenshots in Edit and
  Read, plus continuation chips at both widths.

Changed test expectation: the M4b1 page-view measurement-error case now waits for the shared model and
triggers a failing revision before opening Page (the model is no longer first created by PageView).

## Screenshots

Local evidence (gitignored, `artifacts/m4b1c/`):

- `continuous-markers-edit-1440x900.png`
- `continuous-markers-read-1440x900.png`
- `continuous-markers-edit-960x720.png`
- `continuous-markers-read-960x720.png`
- `continuous-markers-continuation-1440x900.png`
- `continuous-markers-continuation-960x720.png`

They show the dashed page-start line with a right-aligned “Page N starts here” chip, the left-aligned
continuation pill, and the dark Continuous Edit/Read surfaces at both widths.

## Risks / open questions

- **Page 1 marker.** “Page 1 starts here” is shown because the first block satisfies
  `isFirst && isPageStart`. It is honest but adds one line above the first block. Excluding page 1 is a
  one-line derivation change if the product owner prefers a page-break-only reading.
- **Continuation chip placement is block-level, not break-level.** The chip sits at the block's top
  edge and names every page it continues on; the exact in-block break is Page/PDF only. On a very
  long block the chip is a range (“pages 2–7”), which is a hint rather than a cut position.
- **Page-start anchoring when the anchor block is hidden.** The derivation is pure over the full page
  model; the renderer skips a marker when its anchor block has no rect. If that block is collapsed
  away but another visible block also starts the same page, that page's hint is skipped rather than
  re-anchored. This follows the brief's visible-only rule and avoids a second derivation in the view,
  but it can hide a page hint temporarily.
- **Marker geometry depends on the row gap and card padding.** The 16 px chip sits in the 16 px row
  gap and 10 px card padding. A future token change that makes the row gap smaller than the chip
  height would require a token-aware offset.
- **Deep horizontal layouts.** The line and page chip use the canvas content width. In a document
  wider than the viewport the line covers the visible content width, not the full horizontally
  scrolled extent; the chip remains above the row and does not cover card text, but it is not a
  measured span of the widest subtree.
- **Continuous now pays for the page model everywhere.** An active document in Continuous runs the
  model on content revisions even if Page is never opened. At 300 blocks this is about 0.46 s on the
  first run and 0.06 s per subsequent revision, with 20–25 ms synchronous compute. 1,000-block
  continuous behaviour is not measured.
- **Quiet failure state.** A Continuous measurement failure is only announced through a visually
  hidden status; markers simply disappear. A visible status chip would need a non-shifting surface
  and is not part of this slice.
- **Diagnostics are test-facing.** `data-page-model-*` attributes are harmless but are not part of a
  public contract.

## Not verified

- Product-owner visual judgement, VoiceOver/keyboard-only pass, dark/light perception (the app
  currently has the dark theme; no light-theme surface was exercised).
- 1,000-block continuous marker performance and memory.
- Exact in-block marker geometry in Continuous (deliberately out of scope).
- Page Edit, PDF/`printToPDF`, print compositor and PDF parity.
- Trackpad pinch/zoom with markers, multiple simultaneous continuations in one narrow viewport, and
  markers under freeze mode (freeze is not implemented yet).
- Manual break-hint UI (fixtures use stored `manualBreakBeforeBlockIds` only).

## Next suggested step

Sentinel review against the M4b1c brief, then product-owner visual pass on the marker chips (including
the page-1 decision), then the M4c PDF/print compositor over the same shared page model.
