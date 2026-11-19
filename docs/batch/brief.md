# Batch — v0.1.2 input correctness and small UI fixes

**Roles:** three Builders, one per track, separate worktrees.
**Base:** the commit that contains this brief.
**Contract:** the four entries in `docs/plan.md` — #12 (long inline formula), #13 (arrow boundary),
#7 (Page selection ink), #8 (Library refresh). Read them before touching code.
**Sentinel:** none unless the product owner explicitly approves one.
**Timebox:** one builder session per track; stop after one failed fix attempt and report.

## Goal

Ship v0.1.2: the two deferred input fixes and the two most visible small fixes. Three tracks run in
parallel on disjoint files; the orchestrator integrates once, runs one full `verify`, then cuts
0.1.2 if green.

## Closed scope

- **T1 (#12):** a long inline formula (`$…$`) expands its block card to the available Page content
  width, like the existing `$$`/unbreakable case. No wrap, clip or shrink of the formula; the
  existing `content-too-wide` path applies above the page width. Page/PDF parity.
- **T2 (#13):** plain arrows never cross blocks. A selected formula `NodeSelection` and a mid-line
  Up/Down at the first/last visual line stay inside. `⌘↑`/`⌘↓` remain the crossing shortcut; no new
  chord.
- **T3 (#7 + #8):** Page text selection is readable on the light paper in both themes; the Library
  section header gets the 28 px refresh button (same control language as Health) wired to
  `refreshLibrary()`.
- **Out of scope:** #3 (mixed-polarity code chrome), #5 (Page Edit undo), the v2 feature list, any
  schema or dependency change, any new ADR.
- No Sentinel without explicit approval. No new UI suite file; extend the owning suites.

## Track 1 — long inline formula width (#12)

Behavior:

- Measure the **rendered** inline formula, not the LaTeX source length. If its width exceeds the
  card's readable content width, the block card grows to the available Page content width; the
  paragraph may still break around it, but the formula is never wrapped or clipped.
- A formula that fits keeps the current card width and text flow; the default 18/32/16 Page gaps and
  the edge corridor do not move.
- If the formula is wider than the page content box, keep the existing `content-too-wide` defect
  path; do not invent a new overflow mode.
- Page Read/Edit, Page measurement and PDF use the same resolved width. A table cell is not in scope
  (the cell is one paragraph; do not change the table layout or a row's atomicity).
- Do not change the display-formula path or the default page count for documents without a long
  inline formula.

Likely areas: `packages/layout/src/estimate.ts`, `packages/layout/src/layout.ts`,
`apps/desktop/src/renderer/src/page/measurement.ts`, layout and Page/PDF tests, `m4c1`/Page UI.
Tests: a long inline formula in Page Read and PDF, a fitting formula unchanged, a formula wider than
the page reporting the existing defect, default fixture page counts unchanged.

## Track 2 — arrow boundary (#13)

Behavior:

- A plain ArrowRight on an inline-formula `NodeSelection` at the block end must not move to the next
  block. A `NodeSelection` on a code block or table keeps the native path; other selected atoms are
  never replaced by a literal `$` or a block move.
- ArrowUp/ArrowDown at the first/last **visual line** stay in the block even when the caret is in the
  middle of the line. Read the live DOM caret where the ProseMirror selection lags.
- `⌘↑`/`⌘↓` still move to the previous/next block in Continuous; `⌘←`/`⌘→` stay line start/end.
- No new chord, no change to Paragraph/heading Enter behavior.

Likely areas: `apps/desktop/src/renderer/src/editor/keymap.ts`,
`apps/desktop/src/renderer/src/lib/arrow-boundary.ts`, `apps/desktop/test/arrow-boundary.test.ts`,
`tests/ui/special-text.test.mjs`.
Tests: selected formula at block end, mid-word Up/Down on the first/last line, `⌘↑`/`⌘↓` still
navigating, code block/table arrows unchanged.

## Track 3 — Page selection ink (#7) and Library refresh (#8)

#7:

- Scope the selection colours inside `.nf-page-view` (and Page Edit prose) to the paper ink and a
  paper accent tint in both themes; never touch the global `::selection`.
- Add a CSS guard test for the scoped rule and a screenshot in both themes.

#8:

- Add the 28 px refresh icon button to the Library section header, matching the Health control's
  28 px button; `aria-label` and tooltip; calls the existing `refreshLibrary()`.
- Keep the library menu Refresh and all current behaviour; do not add a second refresh path in the
  tree or the activity bar.
- Test the button presence, accessible name, click behaviour and the existing refresh state; one
  screenshot.

Likely areas: `apps/desktop/src/renderer/src/styles.css`,
`apps/desktop/src/renderer/src/shell/Sidebar.tsx` (or the Library header component),
`tests/ui/library-surface.test.mjs`, the CSS guard suite.
No changes to global selection, library data model or refresh semantics.

## Parallel rules

- Branches/worktrees: T1 `t3/v0.1.2-formula-width`, T2 `t3/v0.1.2-arrow-boundary`, T3
  `t3/v0.1.2-small-ui` (use the branch the harness creates and report its actual name).
- Files are disjoint: T1 owns layout/Page measurement and its tests; T2 owns the editor keymap and
  arrow tests; T3 owns the Page selection CSS, the Library header and their tests. A file outside
  the listed areas is a stop condition.
- Builders run focused unit tests and `npm run typecheck`; they do **not** run `npm run verify:fast`,
  e2e or an Electron UI suite. The orchestrator runs the single serialized UI lane after the merges.
- Merge order: T3, then T2, then T1 (smallest blast radius first). Files disjoint; no rebase onto
  another track. After each merge run `verify:fast`; after all three run the single full `verify`.
- One commit per track. Write `docs/batch/report-formula-width.md`, `report-arrows.md`,
  `report-small-ui.md`; the orchestrator writes the final `report.md`. No merge, push, tag or PR,
  and no edits to `docs/plan.md`, the brief, `tests/ui/suites.mjs`, version files or the lockfile.

## Acceptance

- **T1:** a rendered inline formula wider than the card expands the card to the Page content width in
  Page Read/Edit and PDF; the formula is not wrapped, clipped or shrunk; a fitting formula is
  unchanged; a formula wider than the page reports the existing defect; default page counts and the
  horizontal corridor are unchanged.
- **T2:** plain arrows stay inside the block for a selected formula at the block end and for
  mid-line Up/Down on the first/last line; code block/table native arrows still work; `⌘↑`/`⌘↓`
  navigate blocks; `⌘←`/`⌘→` stay line start/end.
- **T3:** Page selection is readable in both themes with a scoped CSS test; the Library header
  refresh button exists, is 28 px, has an accessible name, calls `refreshLibrary()`, and does not
  duplicate the menu path.
- Focused unit/typecheck green per track; one serialized UI lane; one full `verify` green at
  integration; no new dependency, no document-schema change, no new suite file.

## Stop and report

- A track needs a file outside its area or the tracks collide.
- A fix needs a schema, ADR, dependency or layout-model change beyond the four plan entries.
- A checkpoint stays red after one fix attempt.
- A visible change beyond the brief appears.

## Report

Summary, files, checks with timings, acceptance pass/fail, screenshots/evidence paths, risks, next
step. One commit per track; no merge, push, tag or PR.
