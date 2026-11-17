# F4a — the find highlight inside Page

**Role:** Implementer / Builder
**Date:** 17 November 2026
**Brief:** `docs/tasks/find-page.md`
**Design:** `docs/design/highlight.md` §6, `docs/design/find-page-highlight.md`, `docs/design/find-bar.md`,
`docs/design/page-scroll.md`
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-9cca420c-d3a0124312684b08`
**Base:** `a58cc58` (`docs: VH1 merged; the rail breakpoint is 1120 everywhere`)
**Commit:** one worktree commit — `feat(page): paint find matches inside Page with the CSS Custom
Highlight API` (not merged, not pushed; the SHA is HEAD of the branch `t3/find-page`)

## Summary

Find now paints its matches inside the Page view, without touching the measured DOM.

- **Segments carry their path.** `page/segments.ts` emits `data-node-path="3.1"` on every rendered
  segment (the path the page model already has). It is one inert attribute on the existing
  `.nf-seg` wrapper: no extra element, no measurement input, no cache key changed. The measurement
  host, Page Read/Edit, the settings preview and the print compositor all consume the same
  `segmentWrapperHtml`, so they agree byte for byte as before.
- **One mapping module.** `page/find-page-ranges.ts` turns an engine result into
  `(segment path, start, end)` ranges. It reuses the walk Continuous already does: text results are
  the block projection's text-node ranges (`textRangesForProjectionRange`), code results are the
  block's `findSearchUnits`/`findRanges` hits picked by the engine's `occurrence` index. Nothing
  else walks the block, and nothing touches the DOM, the paginator or the measurement.
- **Painting.** `page/find-highlight.ts` builds DOM `Range`s inside the mounted segment elements and
  registers two names with the CSS Custom Highlight API: `nf-find` (every mounted match) and
  `nf-find-current` (the current occurrence, all of its ranges). Styles live in `styles.css`, scoped
  to `.nf-page-view ::highlight(...)`: a tinted background for every match, a stronger tint plus a
  `1.5px` underline for the current one. No wrapper span ever enters the page.
- **Lifecycle in `PageView`.** One layout effect repaints when the result set, the current hit, the
  page projection or the mounted page window changes, and clears when the view is not active. The
  brief's scroll case is a real one: only the visible pages ±2 are mounted, so a scroll, a jump or a
  page-model run repaints — cheaply (one DOM pass for the mounted segments, one projection per
  matched block; no model run, no measurement, no layout read).
- **One occurrence, N ranges.** A match over two paragraphs, over a page break or over two code
  lines returns one range per covered segment, all under the same highlight name; when it is
  current, every one of its ranges is current too.
- **Print is untouched.** The compositor was not modified, registers nothing, and its sheets are
  outside the `.nf-page-view` selector scope. The UI suite asserts the printed DOM has no find
  markup, no registered range points into it, and the print model identity is identical with the
  find open and closed.

## Files changed

New:

- `apps/desktop/src/renderer/src/page/find-page-ranges.ts` — the pure offset → page-range mapping.
- `apps/desktop/src/renderer/src/page/find-highlight.ts` — DOM ranges, the registry, clear/repaint.
- `apps/desktop/src/renderer/src/css-highlights.d.ts` — completes TypeScript's `HighlightRegistry`
  (its DOM lib declares only `forEach`; `set`/`get`/`delete`/`size` were missing).
- `apps/desktop/test/find-page-ranges.test.ts` — 10 mapping cases.
- `apps/desktop/test/find-page.test.ts` — 4 plumbing/CSS/print guards.
- `docs/reports/find-page.md` — this report.

Modified:

- `apps/desktop/src/renderer/src/page/segments.ts` — `data-node-path` in `segmentWrapperHtml`.
- `apps/desktop/src/renderer/src/page/PageView.tsx` — the paint lifecycle effect (`findResults`
  subscription plus the effect; the existing page ring is unchanged).
- `apps/desktop/src/renderer/src/styles.css` — `--nf-page-find-*` paper tokens and the two
  page-scoped `::highlight()` rules (the stale "exact-word highlight is a follow-up" comment on the
  Page find ring is updated).
- `tests/ui/find-bar.test.mjs` — the two new Page paint suites (registry assertions, geometry
  identity, scroll repaint, sidebar row, `ab` toggle, print) and their helpers.

Not touched: the paginator, the page model, page chrome, the seam, zoom, Page Edit geometry, the
find engine (query, ordering, counts, `ab`, sidebar), Continuous's decoration, the print compositor.

## Checks

| Check | Result |
| --- | --- |
| `npm run check:boundaries` | pass — 284 files, 1372 imports, 16 rules |
| `npm run typecheck` | pass (node + web) |
| `npx vitest run` | pass — 165 files / 1683 tests, 7.3 s |
| `node --test tests/e2e/m2-editor.test.mjs` | pass — 16/16, 45.8 s |
| `npm run verify:fast` | pass — exit 0 (boundaries + typecheck + unit + e2e) |
| `node tests/ui/run.mjs --group page --concurrency 2` | pass — 19/19 suites, 160.0 s, 0 pageErrors |
| `node tests/ui/run.mjs --group shell --concurrency 2` | pass — 23/23 suites, 227.2 s |
| `node --test tests/ui/find-bar.test.mjs` | pass — 18/18 tests, 13 s |

Targeted during the work: `npx vitest run apps/desktop/test/find-page*.test.ts` (14 tests, 0.14 s),
`node --test --test-name-pattern="paints" tests/ui/find-bar.test.mjs` (2 tests, ~13 s per launch).

## Acceptance criteria

- [x] **Every match inside the visible page is painted; the current one is visibly stronger and
      follows `↵`, the arrows, the sidebar row and the `ab` toggle.** `nf-find` holds one range per
      mounted text/code occurrence (asserted equal to the mounted paintable result count);
      `nf-find-current` holds exactly the current occurrence's ranges; the screenshots show the
      stronger tint and the underline. `↵`, `ArrowUp`/`ArrowDown`, a sidebar Search row click and the
      `ab` toggle each move the current range to the expected block, and a stored-quote or chapter
      hit registers no current range (no page text), the same rule as Continuous.
- [x] **A match that crosses two segments paints two ranges; when current, both are current.**
      Unit: `come`/`qui` over two paragraphs → two ranges; the hard-break boundary → two ranges in one
      element; a code phrase over two lines → two `code-line` ranges. UI: the Page registers exactly
      two ranges for `come   qui` and both are in `nf-find-current` (`artifacts/find-page/boundary.png`).
- [x] **Closing the find clears both highlights; reopening repaints.** `Esc`/`×` clears the result set,
      the paint effect deletes both names, and reopening (`⌘F`, query kept) repaints the same covers.
- [x] **The page geometry does not move.** `data-page-count`, `data-model-runs`,
      `data-measurement-calls`, `data-mounted-page-count`, the `.nf-seg` count, every
      `data-node-path` of the `alpha` fragment and the measured card box are identical before and
      with the find open (deep equal). Painting reads no layout and registers no model run.
- [x] **The print model carries no find highlight and no export contains one.** The compositor is
      unmodified; the printed DOM has no `nf-find`/`data-find` node, every registered range is inside
      `.nf-page-view` (never the print host), `print.css` has no `::highlight`, the stylesheet's only
      two highlight rules are page-scoped (unit guard), and the print model identity (page count +
      fingerprint) is identical with the find open and closed.
- [x] **No regression in Continuous, the sidebar, the counts, the 100 cap or the ordering.** The whole
      existing `find-bar` suite (18 tests: counts, `1 of 4`, ordering, the `ab` toggle, the sidebar
      tree, dedupe ids, Page ring, Read mode, narrow header) passes unchanged, as do the Page group's
      19 suites.

## Risks and open items

1. **The registry is document-global, so one surface owns it.** `find-highlight.ts` tracks the
   painting root and a clear only happens for its owner; a second mounted Page view (inactive tab)
   never wipes the active paint. If an inactive Page tab is closed while another Page tab paints, the
   active tab repaints on the next result/current/scroll change — self-healing, not silent.
2. **Code text inside an atomic container is reported, not painted.** A code block inside a table
   cell, a list item or a blockquote renders one container segment instead of one per code line, so
   `mapFindResultToPageRanges` returns `unmapped: true` for it and the painter records the result id
   in its `unmapped` report and continues (unit test). Nothing on screen moves; the block ring is
   still there. Text inside table cells, list items and blockquotes *does* map (unit-tested).
3. **The `unmapped` list has no consumer yet.** It is the report the batch promised ("record it and
   continue") and the hook F4b will reuse; no product surface reads it today.
4. **`CSS.highlights` is assumed, then asserted.** Chromium has had the API since 105 and the built
   Electron 45 runtime reports it in the UI suite (`typeof CSS.highlights !== 'undefined'`). There is
   deliberately no DOM fallback: a span wrapper would change the measured DOM, which the brief marks
   as a stop-and-ask. If a future Electron dropped the API, the paint would no-op (reported
   `supported: false`) rather than degrade the layout — a product decision, not a silent one.
5. **Highlight colours are paper-fixed tokens** (`--nf-page-find-bg`, `--nf-page-find-current-bg`,
   `--nf-page-find-current-line`) next to `--nf-page-focus`, not part of the PageTheme density map and
   not in `docs/design-tokens-page.md`; the F4b highlighter tones are a separate palette. The design
   docs still call the Page word highlight a follow-up — a docs-role edit, deliberately not made here.
6. **Print DOM parity keeps the inert tag.** `data-node-path` is emitted by the shared
   `segmentWrapperHtml`, so it also appears in the printed sheets (an attribute, not a highlight).
   Removing it for print would break the existing page↔print card byte-parity assertion for no gain.
7. **Cost.** One repaint is one DOM pass over the mounted segments plus one block projection per
   matched block (≤ 100 results). No measurement and no layout read; the 300-block Page model is
   untouched. Not benchmarked separately — the paint is bounded by the find cap, not by document size.

## Next step

F4b (the persistent highlighter) can reuse `find-page-ranges.ts` unchanged: the mark renders through
`applyMarks` and only needs the same offset → `(segment, start, end)` mapping plus a second, permanent
highlight name. Before that, the orchestrator's single full `npm run verify` integrates this batch,
and a targeted Sentinel should re-check the "one owner" registry rule and the print assertion.
