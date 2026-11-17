# F4a — the find highlight inside Page

**Role:** Builder
**Milestone:** find fidelity
**Base:** `main` at launch, after v1 hardening has merged.
**Worktree:** created by the Orchestrator, branch `t3/find-page`.
**Timebox:** 4 hours.

## Context

Continuous marks every match; Page only rings the block. The design is
`docs/design/highlight.md` §6, the investigation is `docs/design/find-page-highlight.md`, and the decision
it settles is that the page must be **painted**, never re-rendered: wrapping text in spans would change the
measured DOM and could move the pagination.

## Goal

A find query paints its matches inside the Page view — the current one distinctly — without changing the
page geometry, and nothing of it reaches the printed PDF.

## In scope

1. **Tag the rendered page segments** with `data-node-path` (the path the page model already carries). No
   measurement change; assert the segment count and the page count are identical before and after.
2. **The mapping**, one pure function: given a block's projection and a result (block id + absolute
   offsets), return `(element, start, end)` pairs inside the page DOM, using the same projection walk
   `editor/find-decorations.ts` performs for Continuous. Reuse that walk; do not write a second one.
3. **Painting** with the CSS Custom Highlight API: register `nf-find` (every match) and `nf-find-current`
   (the current occurrence). Style both in the page scope: a tinted background for `nf-find`, a stronger
   tint plus an underline for `nf-find-current`.
4. **One occurrence, N ranges.** A match crossing a segment or a page boundary contributes several ranges
   to the same highlight; when it is the current occurrence, all of its ranges go to `nf-find-current`.
5. **Lifecycle**: a query change repaints, closing the find clears both highlights, and the Page scroll
   behaviour stays as it is (PG1 owns it — this batch only paints).
6. **Print**: the print model and the print compositor must not know about find highlights. Assert it: the
   print model carries no highlight node/class, and the exported document has no find styling.

## Out of scope

- The highlighter mark, its tones, the selection bubble, `⌘⇧H` (that is F4b).
- The paginator, the page model, the page chrome, the seam, the zoom, the mount window, Page Edit.
- The find engine: query, ordering, counts, the `ab` toggle, the sidebar.
- Continuous's decoration.

## Files

Read: `docs/design/highlight.md`, `docs/design/find-page-highlight.md`, `page/segments.ts`,
`page/PageView.tsx`, `editor/find-decorations.ts`, `lib/find.ts`, `shell/FindController.tsx`,
`page/model.ts`.

Expected to touch: `page/segments.ts` (the tag), a new mapping module, `page/PageView.tsx` (the paint
lifecycle), `styles.css` (page scope only), the tests, `docs/reports/find-page.md`.

## Acceptance criteria

- [ ] With a query open, every match inside the visible page is painted; the current one is visibly
      stronger and follows `↵`, the arrows, the sidebar row and the `ab` toggle.
- [ ] A match that crosses two segments paints two ranges; when current, both are current.
- [ ] Closing the find clears both highlights; reopening repaints.
- [ ] The page geometry does not move: segment count, page count, and the measured box of a known block are
      identical with the find open and closed.
- [ ] The print model carries no find highlight, and an exported document contains none.
- [ ] No regression in Continuous, the sidebar, the counts, the 100 cap or the ordering.

## Tests and evidence

- Unit: the mapping function against a fixture with a paragraph split across segments, a boundary case and
  a match at the very start of a block.
- UI: in `tests/ui/find-bar.test.mjs` or a new suite, assert the registered highlights and the ranges their
  text covers; assert the geometry is unchanged; assert the print model.
- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group page --concurrency 2`, `--group shell`.
- End of task: `npm run verify:fast`. Do not run `npm run verify`.
- Screenshots under `artifacts/find-page/`: matches painted, the current one, and a boundary case.

## Stop and ask

- if `CSS.highlights` is unavailable in the packaged Electron, or a fallback would have to touch the DOM;
- if tagging the segments changes measurement in any way;
- if a match inside a table cell cannot be mapped — record it and continue, do not block the batch on it.

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, risks, next step. One commit; do not
merge.
