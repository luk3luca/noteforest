# FR1 — Unique find result ids: implementation report

**Task:** `docs/tasks/find-result-ids.md`
**Builder:** implementation sub-agent
**Branch:** `t3/unique-find-result-ids`
**Date:** 16 November 2026

## Summary

`FindResult.start`/`end` are now **block-absolute** for text matches
(`unit.offset + match.start`), and every result carries `snippetStart`, the
run-relative offset inside the field text the snippet was cut from. The sidebar
snippet splitter reads `snippetStart`, so the emphasis does not drift for a
match deep inside a long block. The id keeps the
`field:owner:start:anchorOrBranch` shape; because text offsets are now absolute,
three runs that each begin with `co` produce three ids instead of collapsing to
one, and the duplicate React key is gone.

## Root cause confirmed

Reproduced on a fixture block with three paragraphs that each start with `co`,
split into three text runs by an atomic barrier (a code block). Before the fix:

```
findInDocument(document, 'co')
  results 4, unique ids 2
  DUP x3  text:A:0:  -> "Come usare questa nota", "Cosa provare", "Contenuto finale"
```

A plain paragraph boundary joins one run (F3), so the collision needs the atomic
barrier the real `show-guide` note has; the brief's "splits runs at each
paragraph" is the observed effect of the note's images/atomic blocks, not a
separate split rule. The UI fixture shows the same ids through the real app:

```
before  wide  [ 'text:guide:0:', 'text:guide:0:', 'text:guide:0:' ]  (3 results, 3 rows)
after   wide  [ 'text:guide:0:', 'text:guide:23:', 'text:guide:36:' ] (3 results, 3 rows)
        narrow [ 'text:guide:0:' ]                                   (1 result, 1 row)
```

The new UI test fails on the pre-fix build at the id assertion
(`actual: ... 'text:guide:0:' x3`), and the unit test fails with
`co: text:A:0: text:A:0: text:A:0: label:A:0:b-label` (2 unique of 4).

## Files changed

- `apps/desktop/src/renderer/src/lib/find.ts` — `FindResult.start`/`end` are
  block-absolute for text; new `FindResult.snippetStart`; all five push sites
  (text/code/formula, stale quote, branch label, chapter title) set it; docs
  updated.
- `apps/desktop/src/renderer/src/lib/find-snippet.ts` — the hint parameter is
  `snippetStart` (renamed, same clamping): it is the field-relative offset, not
  the block-absolute result offset.
- `apps/desktop/src/renderer/src/shell/SearchSection.tsx` — passes
  `result.snippetStart` to `snippetParts`.
- `apps/desktop/src/renderer/src/App.tsx` — the test instrumentation exposes
  `snippetStart` alongside `start`/`end`.
- `apps/desktop/test/find.test.ts` — new `result identity and offsets` suite:
  absolute vs run-relative offsets on three barrier-separated runs, id
  uniqueness for `co`, `come`, `c`, `e`, and the deep-match snippet emphasis.
- `apps/desktop/test/find-surface.test.ts` — fixture includes `snippetStart`.
- `tests/ui/find-bar.test.mjs` — new UI regression `keeps unique result ids
  when a query shrinks inside one block`: types `co` then `come`, asserts the
  per-run ids, the run-relative hints, exactly one `[data-search-row]` with no
  index outside the current set, no `Cosa`/`Contenuto` row left, and no new
  console/page error.

No consumer other than the sidebar reads `FindResult.start` (confirmed by
grep): `find-decorations.ts` re-derives ranges from `findSearchUnits` +
`findRanges` and keys the current hit by `unit.offset`/`occurrence`; it never
reads a `FindResult` and is unchanged. `PageView` reads `id`, `blockId` and
`chapterId`; the toolbar cluster reads only the count/current index;
`navigateToFindResult` reads `blockId`/`chapterId`.

## Checks

| Check | Result |
| --- | --- |
| `npx vitest run apps/desktop/test/find.test.ts apps/desktop/test/find-surface.test.ts` | pass, 49 tests / 2 files (0.3 s) |
| `npm run typecheck` | pass (desktop node + web, core, layout, pdf) |
| `node --test tests/ui/find-bar.test.mjs` | pass, 16/16 (24.9 s) |
| `node tests/ui/run.mjs --group shell --concurrency 2` | pass, 20/20 (198.0 s) |
| `npm run verify:fast` | exit 0: boundaries, typecheck, 157 unit files / 1579 tests, critical e2e 16/16 (46.4 s) |

Pre-fix red evidence: the same unit tests fail (2 unique ids of 4 for `co`) and
the new UI test fails on the duplicate ids.

`npm run verify:fast` is exit 0 (boundaries, typecheck, 157 unit files / 1579
tests, critical e2e 16/16).

## Acceptance criteria

- [x] `findInDocument` returns unique ids for `co`, `come`, `c` and `e` on the
      multi-run fixture (`new Set(ids).size === results.length`).
- [x] `start`/`end` are block-absolute for text (`[0,2]`, `[23,25]`, `[36,38]`
      on three runs); `snippetStart` is the run-relative offset (`0` each).
- [x] The sidebar emphasis is unchanged at the start of a block and correct for
      a deep match (unit test on a 144-code-point run; existing UI snippets
      still emphasise `eigen`/`come qui`).
- [x] Typing `co` then `come` leaves exactly `results.length` rows, with row
      indexes only inside the current set and no new console/page error.
- [x] Counts, ordering, navigation, whole-word, the Page ring and the
      Continuous decoration are unchanged (`find-bar` 16/16, shell 20/20).

## Risks

- **Duplicate ids remain for multiple code blocks or formulas in one block.**
  `FindSearchUnit.offset` is `0` for code and formula units, so two code blocks
  in one block that both match at the same node-relative offset still produce
  `code:A:1:` twice (same for two inline formulas). This is pre-existing, is
  not the reported text-run bug, and is outside this brief's "keep the id
  shape" instruction; it needs a follow-up (add the unit node path to the id
  suffix or give atomic units a block-absolute base).
- The minimal UI fixture reproduces the duplicate ids, but React 19's
  production reconciliation removed the orphan rows on this fixture; the
  reported orphan DOM rows appeared on the larger real note. The regression
  therefore pins the ids, the run-relative hints and the row/index invariants,
  which are the root cause, not the exact orphan count.
- Duplicate-key warnings are dev-only, so the production UI build cannot emit
  the console error the brief anticipated. The harness still captures console
  errors, and the test asserts none appear (a vacuous guard in production, but
  it fails if any renderer error is introduced).

## Next step

Wire the atomic-unit id suffix (code/formula node identity) as a small
follow-up, then the Sentinel re-check can close the "every id unique" goal
across all fields. No product decision is needed for the reported text-run fix.

## Follow-up FR1b — atomic units (16 November 2026)

**Task:** `docs/tasks/find-result-ids.md`, § "Follow-up (same surface, after
`c9dabd2`)".
**Branch:** `t3/fr1b-unique-find-result-ids`.

### Summary

Code and formula units report `offset: 0`, so two of them in one block that
match at the same node-relative offset agreed on `start` and collapsed to one
id. Those two fields now insert the unit's node path between the owner and the
offset — `${field}:${owner}:${nodePath.join('.')}:${start}:${suffix}` — while
the text shape stays unchanged (`text:A:0:`). The offset, the matching, the
snippets, the Continuous decoration and the sidebar are untouched, and no
consumer parses the id: the sidebar uses it as a React key and compares it for
the current row, `App.tsx` forwards it, and `find-decorations.ts` never reads a
`FindResult`.

### Before / after

Fixture: one block with `code('let co = 1')`, `code('let co = 2')`, then a
paragraph holding two `\cos` inline formulas. Query `co`:

```
before  code ids     [ 'code:A:4:', 'code:A:4:' ]          (2 results, 1 unique)
        formula ids  [ 'formula:A:1:', 'formula:A:1:' ]    (2 results, 1 unique)
after   code ids     [ 'code:A:0:4:', 'code:A:1:4:' ]      (2 results, 2 unique)
        formula ids  [ 'formula:A:2.1:1:', 'formula:A:2.3:1:' ]
```

The pre-fix run fails three tests: `expected 1 to be 2` for the code pair and
the formula pair, and `co: code:A:4: code:A:4: formula:A:1: formula:A:1:`
(2 unique of 4) for the uniqueness fixture.

### Files changed

- `apps/desktop/src/renderer/src/lib/find.ts` — `pushResult` takes an optional
  id `scope`; the new `unitIdScope` supplies `nodePath.join('.') + ':'` for
  code and formula units and `''` for text runs. Offsets, matching and snippets
  unchanged; the doc comments record the new shape.
- `apps/desktop/test/find.test.ts` — new `atomicDocument` fixture, one test for
  two code blocks and one for two inline formulas at the same relative offset
  (exact ids plus distinctness), and the uniqueness test now runs over the
  multi-run **and** the atomic fixture for `co`, `come`, `c`, `e`.

### Checks

| Check | Result |
| --- | --- |
| `npx vitest run apps/desktop/test/find.test.ts apps/desktop/test/find-surface.test.ts` | pass, 51 tests / 2 files (0.4 s) |
| `npm run typecheck` | pass (desktop node + web, core, layout, pdf) |
| `npm run verify:fast` | exit 0: boundaries (271 files, 1316 imports, 16 rules), typecheck, 157 unit files / 1581 tests, critical e2e 16/16 (47.1 s) |

### Risks

- The code and formula id shape changed; nothing parses it, and the text ids
  the original report was about keep their old shape.
- `start`/`end` for atomic units stay node-relative by design (the brief): the
  node path in the id, not the offset, is what makes them unique.
- Node paths are unique for `codeNodes` and `formulaNodes` within a block
  (each node is walked once), and the field prefix keeps the two namespaces
  apart, so the scope cannot itself collide.
