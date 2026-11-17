# R2a — Page arrows and Continuous page-chrome removal

- **Role:** Implementer / Builder
- **Worktree:** `a builder worktree`
- **Branch:** `t3/page-arrows-continuous-cleanup`
- **Base:** `0f7be24` — `docs: launch R2a Page arrows and continuous cleanup`
- **Implementation commit:** `6f98b1c` — `feat: page arrows and remove continuous page chrome`
- **Report commit:** the follow-up docs commit that adds this file; the branch head SHA is in the handback message.
- **Status:** complete; no merge, no push.

## Summary

Page Read and Page Edit now render page-local graph arrows, and Continuous is a pure
continuous editor again: no page model, no measurements, no markers, no page numbers,
and no page-width guides.

The arrow layer reuses the one page-edge mapper that already fed the PDF print model.
`packages/pdf/src/printModel.ts` no longer contains its own routing logic; it consumes
`buildPageEdges` from `@noteforest/layout`, and `PageView` consumes the same function.
There is no second page-edge router.

No R2b packing/two-column work, Settings UI, manual-break UI/cleanup, PDF compositor,
density change, showcase edit, or `~/Documents` access was done.

## Edge mapper reuse

New pure module: `packages/layout/src/page-edges.ts`.

```text
ContinuousLayout.edges
  -> buildPageEdges(layout, pages): PageEdge[][]
       same-page -> source right edge / resolved anchor -> target left edge
       primary cross-page -> to-edge on source page + from-edge on target page
       reference cross-page -> from-edge on target page only (print rule)
  -> printModel.buildPrintModel (PrintEdge = PageEdge)
  -> PageView -> PageEdges.tsx (paths + labels)
```

- `PageEdge` carries `branchId`, `role`, `fromBlockId`, `toBlockId`, `from`, `to`,
  `direction`, `targetPage`, the print `label` (`p.N`), the canonical branch/anchor
  `branchLabel`, and `anchorId`.
- `buildPrintModel` now only assembles page metadata and calls `buildPageEdges`; its
  public `PrintEdge` / `PrintEdgeDirection` types are aliases of the shared types.
- `PageView` calls `buildPageEdges(model.layout, model.pages)` once per model/page and
  passes only the current page slice to the SVG. No Page-local routing exists.

## Page edge rendering

`apps/desktop/src/renderer/src/page/PageEdges.tsx`:

- One SVG inside `.nf-page-content`, `aria-hidden="true"`, `focusable="false"`,
  `pointer-events: none`, viewBox equal to the resolved page content box.
- Primary paths are solid with a filled arrowhead; reference paths are dashed with an
  open arrowhead. Both use `vector-effect="non-scaling-stroke"`.
- Same-page paths are cubic curves from the mapper’s source point to target point.
- Anchored branches start at the resolved anchor rectangle (`data-page-edge-anchor-start`),
  otherwise at the source fragment edge.
- Cross-page primary edges draw a straight line to/from the content edge and an HTML chip:
  `→ page N` on the source page, `← from page M` on the target page. Reference cross-page
  edges get the target-side `← from page M` chip only, matching the print mapper.
- Branch/branch-anchor labels are HTML chips outside the aria-hidden SVG, so their text
  stays in the accessibility tree. They are also `pointer-events: none`.
- The SVG paints below the fragment cards (`z-index: 0` vs card `z-index: 1`), so arrows
  show in the gaps and never cover prose. Labels paint above cards (`z-index: 3`) so an
  edge-of-page indicator cannot be hidden. The Page Edit overlay keeps `z-index: 8`.
- Paths and labels are clipped to the page content box; nothing is drawn through the
  margin.

## Continuous page model removal

- Deleted `PageBreakMarkers.tsx`, `page-markers.ts`, `apps/desktop/test/page-markers.test.ts`,
  and the `m4b1c` UI/visual suites.
- Deleted the `.nf-page-markers`, `.nf-page-marker*` CSS block and the `test:visual:m4b1c`
  script. `--nf-page-marker-size` remains a page-theme token used by page badges,
  ghost/continuation chrome, and page notes; it is not Continuous marker CSS.
- `DocumentEditor` no longer imports `usePageModel`, `usePageSettings`, or
  `PageBreakMarkers`, and no longer passes a model to `EditorSurface` or `PageView`.
- `PageView` owns `usePageSettings` and `usePageModel`, so measurement exists only while
  the Page layout is mounted. Switching back to Continuous disposes the model and aborts
  in-flight work.
- Continuous Edit/Read has no `[data-page-marker]`, `.nf-page-markers`, `.nf-page-view`,
  `.nf-page-sheet`, `[data-page-indicator]`, `.nf-page-continues-list`, or
  `.nf-page-ghost-list`, and creates no `.nf-measure-host`.
- Page Read/Edit keeps pages, page numbers, continuation/ghost chrome, Page Edit overlay,
  settings, and theme.

## Tests and timings

| Gate | Result |
|---|---|
| `npm run check:boundaries` | pass — 145 files, 694 imports, 16 rules |
| `npm run typecheck` | pass — desktop node/web, core, layout, pdf |
| Targeted vitest (`page-edges`, `page-model`, `page-adapter`) | 3 files, 10 tests, 174 ms |
| `npm test` | 81 files, 804 tests, 2.45 s |
| `npm run test:ui` | 24 suites, 74 tests, exit 0; ≈5 min 20 s including build |
| `npm run test:recovery:run` | 14 tests, 17.5 s |
| `npm run e2e:critical` | 16 tests, 44.3 s |
| `npm run test:visual:r2a` | 1 suite / 1 test, exit 0; 11.1 s including build |
| `npm run verify:fast` | exit 0 — boundaries + typecheck + 804 unit + build + 16 e2e |

New coverage:

- `packages/layout/test/page-edges.test.ts`: same-page primary/anchor/reference mapping,
  exact edge endpoints, anchor start, branch labels, cross-page `to-edge`/`from-edge`
  pairs, `p.N` print labels, target-only cross-page reference, deterministic ordering.
- `tests/ui/r2a-page-arrows-cleanup.test.mjs`:
  - Page Read primary/reference/anchor arrows, dashed reference, aria-hidden SVG,
    labels, pointer transparency, fragment selection, Page Edit overlay above arrows.
  - Cross-page `→ page 2` / `← from page 1` indicators on both pages, content-box
    clipping, reference target-only arrival.
  - Continuous Edit/Read at 1440×900 and 960×720: no `[data-page-marker]`, no page
    chrome, no `.nf-measure-host` after startup, after a canonical edit, after a mode
    switch, or after leaving Page and editing again.
- `tests/visual/r2a-page-arrows.test.mjs`: on-demand screenshot evidence.

Adapted `tests/ui/m4b1-page-view.test.mjs`: the Page measurement-failure test now forces
the font wait to fail before switching to Page, because Continuous no longer warms the
model.

## Screenshots

`artifacts/r2a/` (git-ignored, on-demand evidence):

- `page-read-arrows-1440x900-landscape.png`
- `page-read-arrows-960x720-landscape.png`
- `page-read-arrows-960x720-portrait.png`
- `page-read-arrows-1440x900-portrait.png`
- `page-read-cross-page-out-1440x900.png`
- `page-read-cross-page-in-1440x900.png`
- `continuous-no-page-chrome-1440x900.png`
- `continuous-no-page-chrome-960x720.png`

## Risks

- Multiple cross-page edges leaving the same source page share one lane and overlap
  (for example the direct child and the anchored callout in the fixture). The mapper
  keeps the existing print semantics; per-edge lanes are a visual polish item, not a
  correctness gap.
- Cross-page reference edges only show a target-side `← from page M` chip. That is the
  existing print-model rule; a source-side “see also” chip would be a new product
  decision.
- Edge labels are small chips at the content edge and can overlap the first text line of
  a wide target card. They are pointer-transparent and remain accessible, but visual
  tuning is pending.
- Page now re-measures when the Page layout mounts instead of reusing a Continuous-warmed
  model. This is intentional (Continuous has no pages) and costs one measurement pass on
  each Page entry.
- `--nf-page-marker-size` / `PageTheme.markerPt` keeps its historical name while serving
  page badges and ghost/continuation chrome. Renaming is cosmetic and would touch the
  page-theme API.
- `PageEdges` uses `preserveAspectRatio="none"` with a viewBox equal to the content box;
  the wrapper uses CSS zoom, so geometry stays 1:1 at every zoom level. No distortion was
  observed in the screenshots.
- No PDF compositor consumes the moved mapper yet; the print model remains an adapter
  only.

## Not verified

- Full `npm run verify` (the brief requested one `verify:fast`); unit, UI, recovery,
  critical e2e, and the R2a visual suite were run individually.
- On-demand visual suites `test:visual:m4b1`, `test:visual:m4b1b1`, and
  `test:visual:r1b` were not rerun in this slice.
- Real `printToPDF` output and PDF arrow rendering (M4c work).
- Human visual/VoiceOver judgement of the arrows, labels, and Page Edit stacking.
- The showcase and `~/Documents` were not touched.
