# R2d — unify Page/PDF edge style with Continuous

- **Role:** Implementer / Builder
- **Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-436a81f9`
- **Branch:** `t3/r2d-orthogonal-page-edge-routing`
- **Base:** `40331bf` — `docs: merge R2c and launch R2d edge router`
- **Implementation commit:** `99a1dc7` — `feat: unify page edge style with orthogonal routing`
- **Report commit:** this commit (the docs commit that adds this file)
- **Status:** complete; no merge, no push.

## Summary

Page Read/Edit and the PDF print model now use the same edge language as Continuous:
orthogonal polylines, rounded right-angle corners, one fixed arrowhead, left target entry, and a
12 px minimum stem. `buildPageEdges` remains the only page mapper; it now attaches a pure
`PageRoute` to every edge, computed by `routePageEdge` in `packages/layout/src/page-routing.ts`.
`PageEdges.tsx` only turns those points into an SVG path with the shared `roundedPath` primitive,
and `packages/pdf/src/printModel.ts` consumes the same routes through `buildPageEdges`; there is no
second router.

The R2c compaction regression is fixed. The R2c straight-chord heuristic on the new endpoints still
reports 17 edges / 255 hits (showcase) and 90 / 1890 (scale-300), proving the ports are unchanged.
The routed-path hidden-segment heuristic is **0 / 0** on both corpora, and every lab variant has 0
blocked routes. Earlier sibling cards are never crossed.

No Settings UI, manual-break UI, packing/typography change, PDF compositor, showcase edit,
`/Users/luca/Documents` write, spec/UX/plan edit, or new external dependency was added.

## One visual language

`packages/layout/src/edge-style.ts` is the shared edge-style module. It owns:

- `EDGE_STYLE`: gap 2, radius 2, stem minimum 12, lane 2–14, fixed arrowhead 6 × 6
  (half-width 3), stroke 1.25 / 1.75 / 1, reference chevron 7 px at 0.46 spread, page clearance
  3, page lane step 4, and the route-search turn penalty;
- `simplifyPath`, `roundedPath` (`M`/`L`/`Q`, never `C`), `arrowPoints`/`arrowPath` for the filled
  primary head, and `openArrowPath`/`openArrowForDirection` for the open reference chevron.

The desktop `design-tokens.ts` re-exports these values into `GEOMETRY`; Continuous
(`edge-routing.ts`), Page (`PageEdges.tsx`), and the print model cannot drift. The reference router
now calls the shared `openArrowPath` as well.

Page primary arrows are filled; reference arrows are dashed/open. Both use
`--nf-edge-width` (1.25 px), the same corner radius, and the same final-stem rule. Page keeps its
paper ink palette (blue primary, amber reference) while Continuous uses the app edge palette; the
shape/width/dash/fill rules are shared.

No page path contains a cubic `C` command. The only page corners are quadratic `Q` rounded
right angles from `roundedPath`.

## Page routing rules

`routePageEdge` is a deterministic rectilinear visibility graph:

1. **Start.** A fragment edge starts at its right-port point. An anchored branch starts at the
   resolved anchor rectangle and has a short hidden horizontal stub to the source card right edge
   at the same y. The visible route then leaves through a source rail 3 px outside the card, plus
   4 px for each additional parallel duplicate edge.
2. **Obstacles.** Every other fragment card box on the page is inflated by 3 px. The route may run
   in the gap between cards but never through a card interior. The source and target raw boxes are
   also obstacles, so a route cannot loop back through them.
3. **Candidate channels.** Grid coordinates are the card edges plus clearance, the source/target
   ports, the source rails, and a 1 px content margin. The graph connects only adjacent horizontal
   or vertical channels, so every produced segment is axis-aligned.
4. **Direction.** The route prefers the shortest path with a turn penalty of 60 px equivalent, so
   it takes a detour only when a card blocks the direct corridor. The first segment leaves the
   source horizontally; the last segment enters the target.
5. **Target entry.** Left entry is preferred. A side is used only when it can fit the full 12 px
   stem inside the content box. If the target is a wrapped row starting 12 px from the content
   left, the left stem would be 11 px, so the router enters from the target top instead of
   shortening the stem. Targets at the content left (x = 0) have no left approach and use the top
   entry (or the right entry when the target is above the source). Top/right/bottom entries use the
   same arrowhead and corner primitives.
6. **Lanes.** Distinct targets from one source share one source rail: the shared segment reads as
   the Continuous trunk. Duplicate edges between the same two fragments get parallel rails
   (`pageLaneStep` 4 px) so they never overdraw exactly.
7. **Cross-page.** `to-edge` and `from-edge` remain straight horizontal indicators from/to the
   content edge with the same stroke and arrowhead. The SVG remains clipped to the page content
   box; no ink is drawn through the margin. Reference edges keep the target-only `from-edge` rule.
8. **Safety net.** If no side has an obstacle-free route, `PageRoute.blocked` is true, the path is
   drawn with the warning dash, and the UI/lab expose `data-page-edge-blocked`. The lab reports
   zero blocked routes on both corpora.

The route function is pure (no DOM/React/measurement) and lives in `packages/layout`, so the Page
renderer and the print model share it.

## Crossing regression evidence

Lab: `node --test tests/visual/r1b-page-density.test.mjs` (the `test:visual:r2c` command builds
first). Page Read at 1440 × 900, A4 landscape, 12 mm margins. The routed metric samples each
orthogonal segment every 2 px against every non-endpoint fragment box (1 px inset), and counts an
edge as crossing when a sample is inside a card. The legacy chord metric is the R2c straight-line
sampler over the same endpoints.

| Corpus | Variant | Pages (current copy) | R2c chord (edges/hits) | R2d routed (edges/hits) | Blocked |
|---|---|---:|---:|---:|---:|
| showcase (83 blocks; R2c recorded 82 / 17 pages) | Comfortable / stacked | 28 | 13 / 93 | **0 / 0** | 0 |
| showcase | Compact / stacked (R2a) | 22 | 14 / 110 | **0 / 0** | 0 |
| showcase | Compact / beside (R2b) | 21 | 11 / 100 | **0 / 0** | 0 |
| showcase | **Compact / compaction (R2c)** | **18** | **17 / 255** | **0 / 0** | **0** |
| scale-300 (300 blocks) | Comfortable / stacked | 39 | 7 / 55 | **0 / 0** | 0 |
| scale-300 | Compact / stacked (R2a) | 28 | 8 / 69 | **0 / 0** | 0 |
| scale-300 | Compact / beside (R2b) | 27 | 0 / 0 | **0 / 0** | 0 |
| scale-300 | **Compact / compaction (R2c)** | **21** | **90 / 1890** | **0 / 0** | **0** |

The external showcase now has 83 blocks and therefore 18 compaction pages on this run; R2c
recorded 82 blocks / 17 pages. The showcase was not modified. The compaction chord metric on the
current copy is still exactly 17 / 255, so the R2c crossing baseline is preserved on the same
endpoints; the routed metric on the new endpoints is 0 / 0. The improvement is therefore the route
shape, not a changed port or a changed packing. The lab asserts `crossingEdges === 0` and
`blockedEdges === 0` for every variant on both corpora. JSON: `artifacts/r2c/density.json`
(regenerated, git-ignored).

An intermediate build had 2 edges / 291 hits (showcase) and 2 / 293 (scale-300): the old 0.5 px
collinearity tolerance in the shared simplifier treated a 0.443 px vertical jog as horizontal and
folded orthogonal routes into diagonals. The tolerance is now 0.01 px, and a regression test pins
the exact showcase geometry. The final lab is 0/0.

## Tests and timings

| Gate | Result |
|---|---|
| `npm run check:boundaries` | pass — 147 files, 701 imports, 16 rules |
| `npm run typecheck` | pass — desktop node/web, core, layout, pdf |
| Targeted vitest (`page-routing`, `page-edges`, `print-model`) | 3 files, 17 tests, 88 ms |
| `npm test` | 85 files, 847 tests, 2.27 s |
| `npm run test:ui` | 27 suites, 85 tests, exit 0; ≈5 m 42 s test time + build |
| `npm run test:recovery:run` | 14 tests, 17.8 s |
| `npm run e2e:critical` | 16 tests, 44.2 s |
| `npm run test:visual:r2c` | 1 suite / 1 test, exit 0; 7 variants × 2 corpora + determinism + screenshots; 26.9 s without build |
| `npm run verify:fast` | exit 0 — boundaries + typecheck + 847 unit + build + 16 e2e |

New coverage:

- `packages/layout/test/page-routing.test.ts` (14 tests): arithmetic/no-`C` path, cardinal
  arrowheads, midpoint, synthetic parent → later sibling around an intervening card, a full packed
  row of four siblings with no crossings, straight horizontal no-obstacle, top fallback at the
  content left, full-top-stem preference on a wrapped 12 px row, anchor start/exit, duplicate
  rails, mapper route data, cross-page straight indicators, target-only reference cross-page, and
  the 0.443 px simplifier regression.
- `packages/pdf/test/print-model.test.ts` (1 test): the print model's `PrintEdge[]` is deep-equal
  to `buildPageEdges` and carries the same route/entry/stem data; cross-page `to-edge`/`from-edge`
  routes stay straight.
- `tests/ui/r2d-page-edge-style.test.mjs` (4 tests): Page Read at 1440 and 960 landscape/portrait;
  orthogonal/no-`C`; left entry with ≥12 px stem; parent → later sibling avoids all earlier cards;
  primary filled/reference dashed/open; same stroke width; anchor start; pointer transparency;
  Page Edit overlay above; Continuous unchanged; cross-page indicators straight and target-page
  aware. Screenshots under `artifacts/r2d/ui/`.
- `tests/visual/r1b-page-density.test.mjs`: routed-path hidden-segment metric, legacy chord metric,
  blocked-edge count, detail logging, and zero-crossing assertions.

## Screenshots

`artifacts/r2d/ui/` (git-ignored, on-demand evidence):

- `page-read-arrows-1440x900-landscape.png` — compaction fixture, Page Read, all six arrows.
- `page-read-arrows-960x720-landscape.png`
- `page-read-arrows-960x720-portrait.png` — the wrapped row takes the top-entry fallback.
- `page-read-arrows-1440x900-portrait.png`
- `page-read-arrows-1440x900-landscape-restored.png`
- `page-edit-overlay-arrows-1440x900.png` — overlay above the arrow layer.
- `page-read-cross-page-1440x900.png` — `← from page 1` on page 2.
- `continuous-arrows-1440x900.png` — Continuous still uses its own orthogonal router.

`artifacts/r2c/` (regenerated by the lab): `page-compaction-1440x900-landscape.png`,
`page-compaction-1440x900-portrait.png`, `page-compaction-960x720-landscape.png`,
`page-compaction-960x720-portrait.png`, and the comparison variants.

## Risks

- **Aesthetic call is still the product owner's.** The router avoids cards and produces
  followable orthogonal routes, but the detours around a packed row can be long. On the showcase,
  parent → later sibling edges run below the row in the 16 px gap and rise at the target. This is
  the intended “around, not behind” shape, not a hidden line.
- **Top/right entry is a documented exception.** Targets at the content left, or a wrapped row
  whose left approach is shorter than 12 px, enter from the top (or right). The design-tokens
  “every target enters from the left” sentence is a Continuous rule; Page needs this exception to
  keep the 12 px stem. The UI test covers the portrait wrapped-row case.
- **Shared source rails overdraw.** Distinct targets from one source share the trunk segment, by
  design. Page paths use opacity 0.88, so a doubly drawn shared segment is slightly darker; no
  duplicate edge is drawn exactly twice because duplicate pairs get separate rails.
- **Route search cost.** The graph is built per edge. On an estimated-measurement scale-300
  layout, `buildPageEdges` took ≈12 ms for 27 pages / 180 edges on the builder machine (10 runs,
  route computation only). This is well below a typing/pan budget, but it is not a full UI perf
  run.
- **Fallback visibility.** A pathological page can still produce `blocked` routes; the warning
  dash is deliberately visible rather than hidden. The lab found none on either corpus.
- **The PDF compositor is still absent.** The print model now carries the shared routes, but real
  `printToPDF`/PDF arrow rendering is M4c, not this slice.
- **Simplifier tolerance change is shared.** Continuous and Page both use `simplifyPath`; the
  epsilon tightened from 0.5 to 0.01. Continuous edge tests and UI suites pass.

## Not verified

- Full `npm run verify` (the brief asked for one `verify:fast`; the individual gates above were run).
- Human visual/VoiceOver judgement of the Page arrows, including the top-entry fallback and the
  shared-trunk detours; this is the product-owner checkpoint.
- Real `printToPDF` output and PDF rendering (M4c).
- The on-demand perf suite; the ≈12 ms route-only bench is not a UI long-task measurement.
- The showcase and `/Users/luca/Documents` were not modified. The lab copied the showcase read-only;
  `fixtures/scale-300.json` is the committed second corpus.
