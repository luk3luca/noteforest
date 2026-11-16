# FR1 — Unique find result ids (duplicate React keys leave orphan rows)

**Role:** Builder
**Milestone:** find bug fix
**Base:** `main` at launch (the docs commit that adds this brief).
**Worktree:** created by the Orchestrator, branch `t3/find-result-ids`.
**Timebox:** 90 minutes.

## Context

Product-owner report, 16 November 2026: in the sidebar Search, after typing `come` the list keeps
result cards from the intermediate query `co` that contain no match and are not clickable. Reproduced
in the UI harness on a copy of the real note:

- `findTotal` 9, `state.findResults.length` 9, but the DOM has **14** `[data-search-row]` buttons.
- Five of them carry indexes `23, 24, 30, 31, 33` from the previous, larger result set and sit inside
  the `show-guide` block group; the instrumented render says that block has **1** row, so React does
  not own those five nodes.
- Toggling the whole-word control re-renders the section and leaves them in place.

## Root cause

`FindResult.id` is built as `${field}:${owner}:${start}:${suffix}` in `pushResult`, but since F3
`scanBlock` pushes `start: match.start` — an offset **relative to the text run**, not to the block.
F3 splits runs at each paragraph, so three paragraphs that each begin with `co` all report
`start: 0` inside the same block and collapse to the same id:

```
findInDocument(showcase, 'co')
  returned 100, unique ids 97
  DUP x3  text:show-guide:0:  -> show-guide@0-2, show-guide@0-2, show-guide@0-2
```

Three different paragraphs (`Come usare questa nota`, `Cosa provare`, `Contenuto ricco`) share one id.
Those become **duplicate React keys** in `block.rows.map`. Under a shrinking result set React's
reconciliation then leaves orphan DOM nodes behind: exactly the reported symptom. `come` has no
duplicates, which is why the stale nodes are the only trace of the previous query.

## Goal

Every result id is unique for a document and a query, so the list renders exactly the results it has
and a shrinking query leaves no orphan row.

## In scope

1. **`lib/find.ts`**
   - `FindResult.start`/`end` become **block-absolute** (`unit.offset + match.start` /
     `unit.offset + match.end`). The anchor-range comparison already uses `match.start + unit.offset`;
     make the result agree with it.
   - Add `snippetStart: number` — the offset **inside the run/field text** (today's `match.start`) —
     because `snippetParts` uses it as the hint to pick the match inside the engine's own snippet. Thread
     it through `scanBlock`'s push sites (text, code, formula, label, chapter title).
   - Keep the id shape; with absolute offsets it becomes unique. Add a defensive assertion in a test
     rather than in the hot path.
2. **`shell/SearchSection.tsx`**: pass `result.snippetStart` to `snippetParts` (the emphasis must not
   drift for a match deep inside a long block).
3. **Other consumers**: grep `\.start` / `\.end` over `FindResult`. `find-decorations.ts` maps by
   `unit.offset` and `occurrence` and must stay as it is; confirm it does not read `result.start`.
   Anything that does read it must be checked and listed in the report.
4. **Tests**
   - Unit: a block with three paragraphs that each start with `co` yields three results with **three
     distinct ids**, and each `snippetStart` is the run-relative offset.
   - Unit: every id in a full scan is unique (`new Set(ids).size === results.length`) for `co` and
     `come` on a multi-paragraph fixture; keep it fixture-based, not the product owner's file.
   - Unit: `snippetParts` still emphasises the right occurrence when `start` is large (deep match).
   - UI regression, in `tests/ui/find-bar.test.mjs` or a new suite: a document whose block has two
     paragraphs matching `co`; type `co`, then `come`, then assert the number of
     `[data-search-row]` equals `state.findResults.length` and no row carries an index outside the
     result set. Also assert the console/page error list stays empty (React reports duplicate keys as a
     console error, not a page error — capture console errors if the harness supports it).

## Out of scope

- The F3 run splitting and the whitespace-loose matching (a query may still match across a paragraph
  boundary; that is the approved behaviour).
- The count, the JSON/warning reporting, the sidebar design, the decoration offsets.
- Any change to `pageSettings`, schema, IPC, or the print model.

## Files

Read: `apps/desktop/src/renderer/src/lib/find.ts` (`pushResult`, `scanBlock`, the push sites),
`lib/find-snippet.ts`, `shell/SearchSection.tsx`, `editor/find-decorations.ts`.

Expected to touch: `lib/find.ts`, `lib/find-snippet.ts` (only if the signature needs it),
`shell/SearchSection.tsx`, `apps/desktop/test/find.test.ts`, `tests/ui/find-bar.test.mjs` (or a new
suite plus `tests/ui/suites.mjs`), `docs/reports/find-result-ids.md`.

## Acceptance criteria

- [ ] `findInDocument` returns ids that are unique across the whole result list for `co`, `come` and a
      single-letter query on a multi-paragraph fixture.
- [ ] `start`/`end` are block-absolute; `snippetStart` is the run-relative offset.
- [ ] The sidebar emphasis is unchanged for a match at the start of a block and correct for a match deep
      inside a long block.
- [ ] In the UI regression, typing `co` then `come` leaves exactly `results.length` rows, with no index
      outside the current set, and no duplicate-key console error.
- [ ] No regression: counts, ordering, navigation, whole-word, the Page ring, the decoration.

## Tests and evidence

- Targeted: `npx vitest run apps/desktop/test/find.test.ts apps/desktop/test/find-surface.test.ts`, then
  `node tests/ui/run.mjs --group shell --concurrency 2`.
- End of task: `npm run verify:fast`.
- Do not run `npm run verify`.
- Evidence: the failing-then-green UI case named in the report; no screenshots needed.

## Stop and ask

- if making `start` absolute breaks a consumer outside the find surface;
- if the duplicate ids also exist for chapter titles or labels after the change;
- if the harness cannot capture console errors, so the duplicate-key assertion cannot be written.

## Report format

Summary, root cause confirmed, files changed, checks with timings, pass/fail per criterion, risks, next
step. One commit; do not merge.
