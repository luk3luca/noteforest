# Find v3 — search hierarchy, card rows, one shared query mode

**Task:** `docs/tasks/find-v3.md`
**Role:** Builder
**Base:** `main` at `6bfbe81` (after the copy A+B merge)
**Status:** implemented in the worktree, not merged
**Date:** 16 November 2026

## Summary

Three confirmed defects are fixed without changing the find model (one engine, two presentations,
one query/results/current state).

- **Hierarchy (B2 + B3).** The sidebar now has three unmistakable levels: a chapter rule (1 px
  `--border-1`, uppercase 9.5 px `--text-3`, visible occurrence count at the right, tabular,
  non-interactive), an **optional real block label** (`document.blocks[blockId].label` only — the
  first content line is never a title any more), and occurrence **cards** (12 px in from the panel
  edge, 1 px `--border-1`, `--surface-1`, radius 4, `padding: 7px 8px`, 3 px gap; hover
  `--border-2` + `--surface-2`; current `--accent` border + 1 px `--accent` ring + `--surface-2`,
  `aria-selected` unchanged). The card/hover/current rules moved to a shared `.nf-result-row`;
  `.nf-search-row` keeps only the search metrics. Health keeps its current rows. Labelled block
  groups are `role="group"` with the heading as `aria-label`; unlabelled blocks add no group. The
  old `blockTitle()` derivation is gone from this view. A chapter-title hit keeps the
  `Chapter title` heading.
- **One query mode.** `normalizeFindQuery` collapses whitespace runs and trims. `findInDocument`
  normalizes once at entry (blank → no results) and matches the needle words with `\s+`, so
  `come`, `come ` and `come  ` are one query, `come   qui` finds `come qui`, and a paragraph or hard
  break inside a block matches a single space. The input value is never rewritten. The **same**
  matcher and the shared whole-word option reach the snippet splitter and the Continuous
  decoration: text runs, code text, LaTeX, anchor quotes, branch labels and chapter titles all use
  `findRanges`. `literalRanges`/`literalRangesUtf16` stay strict and untouched for anchor and
  formula-term resolution (isolation test included).
- **Whole-word toggle.** `state/shell.ts` owns one session boolean `findWholeWord`
  (default `false`, never persisted) and `setFindWholeWord`. The toolbar renders a 22 px `ab`
  button between the input and the count; the sidebar header renders the same control after the
  count. Both are `aria-pressed`, `title="Match whole words"`, underlined 9.5 px text, active
  `--accent-soft` + `--text-1`. `FindController` adds the option to its one debounced scan, so
  flipping either surface changes both counts. `Esc`, then `⌘F`, keeps both the query and the mode.
- **Activity icons.** The `fill` prop is gone from the activity section `Icon`; Lucide stays
  stroke-only in every state, selected or not. The active state is `surface-2` + `text-1` + the
  1.9 stroke; the `search` tab has no exception. The misleading CSS comment and the unit test title
  are updated, and the live `fill="none"` contract is asserted for all four tabs in the UI suite.

The decoration now maps the engine's code-point offsets back to ProseMirror by node path over the
canonical block body, so a phrase that spans a line break is marked on both lines while the block
occurrence index still equals `FindResult.occurrence`.

## Files changed

Implementation:

- `apps/desktop/src/renderer/src/lib/find.ts` — `normalizeFindQuery`, `findRanges`, text runs in
  `findSearchUnits`, whole-word scan, options object for `findInDocument`; strict matchers documented
  and untouched.
- `apps/desktop/src/renderer/src/lib/find-snippet.ts` — shared matcher + `wholeWord` parameter.
- `apps/desktop/src/renderer/src/editor/find-decorations.ts` — same units/matcher as the engine,
  canonical-body projection, per-text-node mapping, whole-word option.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — passes `findWholeWord` to the plugin.
- `apps/desktop/src/renderer/src/state/shell.ts` — `findWholeWord` + `setFindWholeWord`.
- `apps/desktop/src/renderer/src/shell/FindController.tsx` — normalized-empty check, `wholeWord` in
  the one scan effect.
- `apps/desktop/src/renderer/src/shell/FindBar.tsx` — the `ab` toggle.
- `apps/desktop/src/renderer/src/shell/SearchSection.tsx` — label-only grouping, chapter count,
  group roles, `nf-result-row` cards, `ab` toggle, shared snippet mode.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — removed the activity-icon fill.
- `apps/desktop/src/renderer/src/styles.css` — `.nf-whole-word`, chapter rule/count, `.nf-search-block`
  indent, shared `.nf-result-row` card states, activity-bar comment.

Tests:

- `apps/desktop/test/find.test.ts` — normalization, whitespace-loose + cross-line scan, whole-word
  over all fields, strict-matcher isolation, decoration normalization/whole-word/cross-line, and a
  corrected edit-insertion point inside a real block body.
- `apps/desktop/test/find-surface.test.ts` — shared toggle state, loose/whole-word snippet split.
- `apps/desktop/test/activity-bar.test.ts` — test title and a no-`fill` CSS guard.
- `tests/ui/find-bar.test.mjs` — hierarchy/card case, shared query/toggle case, activity-icon fill
  guard, 5-control cluster, Tab lands on the toggle, whole-word `eigen` count (2: code + label).

Docs:

- `docs/design/find-bar.md` — §1 model, §2 `ab`, §3 hierarchy/cards, §4 normalized/loose/whole-word
  matching and strict-caller isolation, §10 build order.
- `docs/reports/find-v3.md` — this report.

## Checks run (real timings)

| Check | Result | Time |
| --- | --- | --- |
| `npm run typecheck` (all workspaces) | pass | 5.4 s |
| `npm run build` | pass (vite/electron-vite warnings only) | 0.5 s |
| Targeted vitest (`find.test.ts`, `find-surface.test.ts`, `activity-bar.test.ts`) | **3 files / 56 tests pass** | 0.3 s |
| Full unit `npx vitest run` | **155 files / 1551 tests pass** | 10.5 s |
| `node tests/ui/run.mjs --group shell --concurrency 2` | **19/19 suites pass**, 0 page errors | 193.3 s |
| `node --test tests/ui/find-bar.test.mjs` | **14/14 tests pass**, 0 page errors | 22.8 s |
| `npm run verify:fast` (whole gate) | **exit 0**; unit 155/1551, e2e 16/16 | **58.3 s** wall |

`npm run verify` is the Orchestrator's integration run; this worktree ran `verify:fast` plus the
whole shell UI group.

Screenshots (gitignored artifacts): `artifacts/find-v3/sidebar-labelled-unlabelled.png` (chapter
rule + one unlabelled card and one `Metodo` group), `sidebar-current-card.png` (current card with
the accent border and ring), `toggle-on.png` and `toggle-off.png` (toolbar `ab` state with the
sidebar count following).

## Acceptance criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| A block without a label shows its cards directly under the chapter rule: no heading, first line only in the snippet | **pass** | UI hierarchy case: `[data-search-block="plain"]` renders no `[data-search-block-title]`, no `role=group`/`aria-label`; screenshot `sidebar-labelled-unlabelled.png` |
| A block labelled `Metodo` shows `Metodo` once as a heading; not a button, not focusable, no hover, click does nothing | **pass** | UI case: one `[data-search-block-title]` (`Metodo`), `DIV`, no `tabindex`, click keeps `findIndex`; `role=group` + `aria-label="Metodo"` |
| Chapter headings are not buttons/focusable; clicking does nothing | **pass** | UI case: `.nf-search-chapter-head` is a `DIV` with no `tabindex`; label click keeps `findIndex`; 1 px top border checked |
| Cards: 1 px border, 4 px radius; hover border+background; current accent border + 1 px ring, `aria-selected`, scroll-into-view effect kept | **pass** | UI case asserts border/radius/background/border-colour on hover, `box-shadow` ring on the current card, one `aria-selected` current row; the existing scroll effect is untouched and the sidebar suite is green |
| `come`, `come `, `come  ` same count; `come   qui` finds `come qui`; line break matched by one space | **pass** | Engine tests (`find.test.ts`) for counts, paragraph + hard break; UI case fills `come  ` (input keeps the trailing spaces) and `come   qui` (1 result, snippet `come qui`, 2 highlighted lines); screenshot |
| Whole-word off finds `eigenvalue`/`eigenvector`; on rejects them; `il` stops matching `mille`; toolbar ↔ sidebar counts; `Esc`/`⌘F` keeps toggle + query | **pass** | Engine/whole-word field test + UI case (toolbar on → 2 results, sidebar count `1 of 2`, sidebar off → original count, `il` 1 → 0, reopen keeps `il` and pressed toggle) |
| No activity icon filled in any state; selected is surface-2 + text-1 + 1.9 stroke; magnifier reads as a lens | **pass** | `Sidebar.tsx` fill removed; UI guard asserts all four `[data-sidebar-tab] svg` have `fill="none"`, active stroke 1.9, inactive 1.5; CSS guard test |
| No regression: keys, 100 cap/“Refine the search”, `.md`, Page ring, Read mode | **pass** | Existing 12 find-bar UI cases unchanged and green (except the documented 4→5 control count, the Tab target, and the insert point); full unit suite and shell group green |
| No `999px`/pill radius and no left accent bar on the new rows | **pass** | Card radius 4; no left border in any new rule; `no-left-accent`/`card-chrome-css` suites green |

Documented test-expectation changes (all explained by the brief):

1. `find-bar.test.mjs` cluster control count 4 → 5 (one input + four buttons; §4 adds `ab`).
2. `find-bar.test.mjs` “Tab leaves the input” now lands on `nf-whole-word` instead of
   `nf-find-button`, because the toggle is the next control in DOM order.
3. `find.test.ts` “rebuilds on a document edit” inserts inside the real code-block body instead of
   appending a text node at chapter level. The old insertion created an anonymous `branchBlock`
   with `blockId: null`, which is not searchable document content; the new assertion is the same
   “+1 after the edit” on a real edit path.

## Open questions / risks

- **Table cells.** The decoration reconstructs its runs from the editor projection
  (`blockBody.toJSON()` → canonical content). Rich table cells are flattened to the editor's inline
  shape on load (the known F2 latent table-cell limitation); a query that depends on a paragraph
  boundary inside a legacy rich cell could map differently in the decoration than in the engine.
  No current fixture exercises it; the find scan itself is unaffected.
- **Decoration cost.** While a find surface is open, each editor transaction rebuilds the decoration
  by projecting every block body (the same unit/matcher path as the engine). The scan budget still
  passes (300/1,000-block engine tests); no per-keystroke measurement was added, per the brief.
- **Cross-line current mark.** A phrase across a line break is one engine occurrence but two
  decorations; both carry `data-find-current` because they are the same match. The UI case asserts
  this explicitly, but a future Page exact-word highlight must treat it as one range.
- **Copy.** `Chapter title`, `Type to search this note.`, “Refine the search” remain provisional
  from v2; this task does not touch copy beyond the new `ab` label.
- **Whole-word `eigen` = 2 in the UI fixture** (the code token and the `eigen bridge` branch label),
  not 1; the UI assertion records the real count.

## Next suggested step

Targeted Sentinel review of this diff (engine normalization/whole-word isolation, decoration mapping,
sidebar hierarchy/card CSS, activity-icon state), then the Orchestrator's full `npm run verify` at
UI concurrency 4. The Page exact-word highlight remains the separate follow-up.
