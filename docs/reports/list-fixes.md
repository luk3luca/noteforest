# List markers + paren ordered-list input — implementation report

**Role:** Builder / Implementer
**Phase:** 0b (post-A–F editor fixes)
**Branch:** `t3/list-markers-and-ordered-input-rule`
**Base:** `9be5f20` (`main`)
**Worktree:** `a builder worktree`
**Date:** 14 November 2026

---

## 1. Summary

Two user-visible list defects are fixed without touching the canonical document, the page
renderer, the print compositor, or any settings surface.

- **Bullet/numbered markers were invisible in the Continuous editor.** Tailwind v4 preflight resets
  `ul`/`ol` to `list-style: none`; `.nf-block-prose` only restored margin/padding, so every depth had
  indentation but no glyph. Scoped depth rules restore the markers for the block prose only:
  bullets cycle `disc → circle → square → disc` and ordered lists cycle
  `decimal → lower-alpha → lower-roman → decimal` (depths 1–6; deeper nesting keeps the depth-6
  step so the marker is always visible). `::marker` uses the muted text role `--text-3`; the 20 px
  `padding-left` and the outside marker position are unchanged, so the glyph is painted inside the
  card and nothing moves.
- **`1) ` did not start an ordered list.** TipTap's ordered-list input rule matches only
  `^(\d+)\.\s$`, while the paste/GFM path already accepts `1)`. A small `lists.ts` extension adds a
  `wrappingInputRule` for `^(\d+)\)\s$` with the same shape as the native rule: `start` is the typed
  number (minimum 1), the adjacent-list join predicate is mirrored, and the rule is inert without a
  list schema. `1. ` keeps its StarterKit rule (the two regexes cannot both match), and Enter keeps
  native ordered-list continuation, so a list started at `3)` continues `4.`.

The extension set is shared by Continuous Edit and the Page Edit overlay, so the typed rule works in
both. Page Edit also shows the restored markers because it reuses `.nf-block-prose`; its markers use
`--nf-page-muted` (fixed paper role) instead of the shell theme colour. Page Read and print are
untouched: they render their own explicit `.nf-li-marker` glyphs and never mount block prose.

No schema change, no `settingsVersion` bump, no Page/PDF/export/showcase change, no new dependency.

## 2. Files changed

Source:

- `apps/desktop/src/renderer/src/editor/lists.ts` *(new)* — `PAREN_ORDERED_LIST_INPUT`,
  `parenOrderedListStart` (pure matcher/start), `parenOrderedListRule` (testable rule factory),
  and the `ParenOrderedListInput` extension.
- `apps/desktop/src/renderer/src/editor/extensions.ts` — registers `ParenOrderedListInput` in
  `createEditorExtensions`.
- `apps/desktop/src/renderer/src/styles.css` — scoped `.nf-block-prose` marker depth rules,
  `::marker` muted colour, and the Page Edit overlay marker colour (page muted role).

Tests:

- `apps/desktop/test/list-input-rule.test.ts` *(new)* — runs the real input-rule handler over a real
  `EditorState`: `1)` → start 1, `3)` → start 3, `12)` → start 12, `0)` → start 1, `007)` → 7,
  wraps exactly one `listItem`, removes the typed marker, plus the no-match table (`1. `, `1)`,
  `1)  `, `(1) `, `see 1) `, `a) `, empty) and the single-registration assertion.
- `apps/desktop/test/list-markers.test.ts` *(new)* — CSS guard: the bullet/ordered depth cycles,
  the muted `::marker` colour, the untouched 20 px gutter, and the rule that every `list-style*`
  declaration outside the pre-existing shell resets starts with `.nf-block-prose` (never
  `.nf-page-scope`, `.nf-page-edit-prose`, or `.nf-print`). Also pins the page renderer's
  `.nf-li-marker` glyph contract.
- `apps/desktop/test/ui-suite-list.test.ts` — the new suite joins the evidence-directory owner map.
- `tests/ui/suites.mjs` — `list-fixes.test.mjs` added to `FILES` and the `shell` group.
- `tests/ui/list-fixes.test.mjs` *(new)* — 3 UI tests: depth markers in Continuous Edit/Read in both
  themes, the typed `1)` / `3)` / `1.` / `-` / prose behaviours, and Page Edit + committed Page Read
  markers.

Evidence and docs:

- `artifacts/list-fixes/continuous-lists-dark-1440x900.png`
- `artifacts/list-fixes/continuous-lists-light-1440x900.png`
- `artifacts/list-fixes/continuous-lists-read-1440x900.png`
- `artifacts/list-fixes/continuous-paren-list-1440x900.png`
- `artifacts/list-fixes/page-read-lists-1440x900.png`
- `artifacts/list-fixes/page-read-paren-1440x900.png`
- `docs/reports/list-fixes.md` — this report.

## 3. Behaviour details

**Marker depth.** The cycle counts any list ancestor (`.nf-block-prose :is(ul, ol) …`), so a mixed
`ol` inside `ul` still gets its type's depth-2 marker. Multi-level nesting is real DOM nesting
(`li > ul`), so the selector depth equals the visual depth. The marker is `list-style-position:
outside` by default, painted in the list's existing 20 px left padding; the card has no clipping
container (`overflow` stays `visible`), and no negative offset is introduced.

**Typed rule.** `wrappingInputRule` deletes the matched range and wraps the text block in
`schema.nodes.orderedList` with `getAttributes` reading the start from the same pure matcher the unit
test exercises. `joinPredicate` mirrors the native rule
(`!type || type === '1'`, `childCount + start === typed`), so typing the next number inside a list
joins it instead of nesting a second list. `0)` clamps to 1. Because `find` is anchored with `^`,
only a block-start marker matches; `see 1) here` stays text.

**Page Edit.** The overlay shares `createEditorExtensions`, so the rule and the markers arrive there
for free. Only the marker colour is overridden inside `.nf-page-scope` so a fixed-paper overlay does
not show a theme-dependent glyph colour (dark shell `--text-3` is `#949aa2`, the page muted role is
`#65737c`).

## 4. Acceptance criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Bullet markers visible at depth 1/2/3+; ordered at 1/2/3+; no clipping; dark + light | **PASS** | UI test A asserts `disc/circle/square/disc` and `decimal/lower-alpha/lower-roman` with outside position, 20 px padding, 0 margin, `overflow-x: visible`, and the two `::marker` colours; screenshots `continuous-lists-dark/light-1440x900.png` |
| 2 | `- ` works; `1. ` works; `1) ` starts at 1; Enter continues; `3)` continues 4. | **PASS** | Unit rule test (start values + wrap) and UI test B (`1)` → one decimal `ol` with 2 items after Enter, `3)` keeps `start="3"` with 2 items, `1.` and `-` still convert, prose parentheses stay text); screenshot `continuous-paren-list-1440x900.png` |
| 3 | Markers and input rule do not change Page Read/Edit or PDF output | **PASS** | Page Read still renders explicit `.nf-li-marker` glyphs (`•`, `1.`, `1.`, `1.`) and mounts no `.nf-block-prose`/`ul`/`ol` (UI test A, walked across every derived page); CSS guard proves no `list-style*` declaration leaks into page/print scopes and the `.nf-li-marker` rule is unchanged; `page-segments`/`print-parity` unit tests stay green. Page Edit gets the shared rule on purpose (brief §Scope) and its markers use the page muted role |
| 4 | No schema/settingsVersion/Page/PDF/export/showcase change; no fixed sleeps/native dialogs | **PASS** | Diff touches three renderer files (two changed, one new) + tests; no `sleep`, no dialog path; UI suite green with an empty `pageErrors` array |
| 5 | Existing assertions updated only for the intentional change, none weakened | **PASS** | Only the UI suite list + its owner map changed; no existing assertion was edited or removed |

## 5. Checks run

| Check | Result | Time |
|---|---|---|
| `npx vitest run apps/desktop/test/list-input-rule.test.ts apps/desktop/test/list-markers.test.ts` | 2 files / 9 tests pass | 0.25 s vitest (0.6 s wall) |
| `node --test tests/ui/list-fixes.test.mjs` (3× during work) | 3/3 pass each run | 12.9 s / 12.8 s / 12.9 s |
| `npm run typecheck` | pass (all 4 workspaces) | 5.5 s |
| `npm run check:boundaries` | pass (231 files, 1080 imports, 16 rules) | 0.4 s |
| `npm test` | 136 files / 1352 tests pass | 4.7–5.2 s |
| `npm run verify:fast` | **exit 0** — boundaries + typecheck + 1352 unit tests + critical e2e 16/16 | e2e suite 43.6 s |

Not run, as instructed: the full `npm run verify` (Orchestrator runs it at UI concurrency 4), the
Page UI group, perf, and visual suites. No full-run duplication.

## 6. Risks and open questions

1. **Page Edit markers are new too.** The brief requires markers only inside `.nf-block-prose` and
   the `1)` rule in Page Edit. The overlay reuses `.nf-block-prose`, so lists in the overlay now show
   markers (they were invisible before, like Continuous). Excluding the overlay would leave a typed
   `1)` list with no numbers there. Interpretation: "Page Read/Edit unchanged" means output and
   behaviour, which is unchanged; Page Edit's editor chrome improves for parity with the sheet
   behind it. The report flags this for the Sentinel.
2. **Depth cycle stops repeating after depth 6.** Depths 7+ keep the depth-6 step (`square` /
   `lower-roman`); the marker stays visible but does not resume the cycle. A modular cycle over
   arbitrary depth is not expressible with plain selectors; six levels cover every realistic note.
3. **Wide ordered markers** (`xxviii.`) can extend past the 20 px gutter into the parent's padding at
   deep nesting. Nothing is clipped (no overflow container), but the glyph can approach an ancestor
   marker. The brief pins `padding-left: 20px`, so this was not changed.
4. **Mixed nesting** (`ul` inside `ol`) is handled by counting any list ancestor, but the *cycle
   position* is per depth, not per same-type nesting; that matches the brief's depth wording.
5. **`1)` in Page Edit** creates a list whose numbering is native (`1.`, `2.`), not literal `1)`.
   Same as `1.` today and as GFM numbering; the typed parenthesis is a marker, not content.

## 7. Next step

Sentinel review of the diff + this report, then the Orchestrator's single full `npm run verify` at
UI concurrency 4. Follow-ups if the product owner wants them: a modular marker cycle past depth 6, a
wider gutter for long roman numerals, and the Page Edit marker parity decision above.
