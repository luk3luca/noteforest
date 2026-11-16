# F3 — Search hierarchy (label-only), card rows, one shared query mode

**Role:** Builder
**Milestone:** Phase 6 follow-up (find v3)
**Base:** `main` at launch, after the copy A+B merge (`docs/reports/copy-ab.md`); the launch message names the exact commit.
**Worktree:** created by the Orchestrator at launch, branch `t3/find-v3`.
**Timebox:** 3 hours.

## Context

Find v2 (`eec39b4`) ships one engine and two presentations that share `findQuery`, `findResults` and
`findIndex`. Three defects remain, all confirmed by the product owner on 16 November 2026:

1. The sidebar repeats the first content line as a block "title". `groupResults` calls
   `blockTitle()`, which falls back to the first line of the content, so for a block without a label
   the heading is the same sentence as the snippet under it. The heading is a plain `div` that looks
   like the row, and the row is the only click target: three levels, one weight.
2. The query is matched raw: `il` matches `mille` and `filo` with no way to narrow it, and trailing
   spaces change the count (`come`, `come `, `come  ` are three different needles).
3. The activity bar paints the selected icon with `fill: currentColor`
   (`Sidebar.tsx:189`). Lucide is stroke-only, so this does not select a solid variant: it fills the
   enclosed areas of the outline. The magnifier becomes a lollipop; Library/ListTree/Activity become
   blobs.

Docs: `docs/design/find-bar.md` (§2–§4 are the surfaces this task changes), this brief.
Design decisions came from the B1/B2/B3 lab (`docs/design/find-results-ui-lab/`, deleted after the
decision): the product owner chose **B2's chapter division and indent with B3's card outline**.

## Goal

The sidebar result list has three unmistakable levels — chapter rule, optional real block label,
occurrence card — and one shared `ab` toggle normalizes the query and can bound it to whole words,
identically in the toolbar and the sidebar.

## In scope

### 1. Hierarchy (`SearchSection.tsx` + `styles.css`)

- **Chapter**: unchanged label (`chapterLabel`), rendered as a group opener: 1 px `border-top`
  (`--border-1`), uppercase 9.5 px `text-3`, the chapter's occurrence count at the right in
  `text-3`, tabular. The label is not focusable and not a button.
- **Block label**: render the heading **only when the block has a real `label`**. Never derive one
  from the content. `document.blocks[blockId].label` is the source; `blockTitle()` must not be used
  for this heading any more. A chapter-title hit (`blockId === null`) keeps the heading
  `Chapter title`, because it names the source of the hit, not a block.
- **Occurrence row**: keep `<button role="option">`, one per occurrence, two-line snippet, mono
  variant for code/formula. Rows are indented 12 px from the panel edge and are **cards**:
  1 px `--border-1`, `--surface-1`, radius 4, `padding: 7px 8px`, 3 px gap between cards.
  Hover: `--border-2` + `--surface-2`. Current: `--accent` border + a 1 px `--accent` ring
  (`box-shadow: 0 0 0 1px var(--accent)`), `--surface-2` fill, `aria-selected="true"` unchanged.
- Extract the card/hover/current rules into a **shared** `.nf-result-row` class and let
  `.nf-search-row` add only the search-specific metrics (clamp, mono). Health keeps its current
  rows: this task introduces the class, it does not adopt it there.
- Wrap each labelled block's rows in `role="group"` with `aria-label` = the heading, so assistive
  tech gets the same nesting the eye gets. Blocks without a label add no group.
- Keep every existing data attribute used by tests (`data-search-chapter`, `data-search-block`,
  `data-search-block-title`, `data-search-row`, `data-search-current`, `data-search-kind`,
  `data-search-field`). Rows keep `id="nf-search-row-<index>"` and `role="option"`.

### 2. One query mode, both surfaces

- `normalizeFindQuery(raw)` in `lib/find.ts`: collapse every whitespace run to a single space and
  trim. Export it.
- `findInDocument` normalizes its `query` argument once at entry and treats an empty normalized
  query as "no results". **The input value is never rewritten**: the sidebar and the toolbar keep
  what the user typed (caret, trailing spaces); only matching is normalized.
- The normalized needle matches with `\s+` between its words, so `come   qui` matches `come qui`
  and a line break inside a block also matches. Match offsets stay offsets into the original text
  (the scan, the snippet splitter and the decorations must all agree).
- Whole-word option: a match counts only when the characters immediately before and after it are
  not `\p{L}`, `\p{N}` or `_` (Unicode property escapes, `u` flag). It applies to every field the
  engine already scans: block text, code, LaTeX source, anchor quotes, branch labels, chapter
  titles.
- Default is substring (whole-word off). No case-sensitive switch, no regex, no options menu.
- The same normalized query **and** the same option reach `lib/find-snippet.ts` and
  `editor/find-decorations.ts`, so the highlighted ranges equal the reported results.

### 3. Shared state

- `state/shell.ts`: `findWholeWord: boolean` (default `false`, session-scoped, survives closing the
  surfaces exactly like `findQuery`) plus `setFindWholeWord`. Do not persist it to settings.
- `FindController.tsx`: the scan effect depends on `findWholeWord` as well; one debounced scan.
- There is no per-surface mode: flipping the control in either surface changes both counts.

### 4. The toggle

- `FindBar.tsx`: a 22 px button between the input and the count, text `ab` (9.5 px, underlined),
  `aria-pressed`, `title="Match whole words"`, `data-find-whole-word`. Rendered whenever the bar is
  open (not only with a non-empty query), so the state is always visible. Active:
  `--accent-soft` background, `--text-1` ink. It must not change the 28 px cluster height.
- `SearchSection.tsx`: the same control in the header after the count, `data-search-whole-word`,
  same `aria-pressed` and the same visual treatment.
- Both read and write the one boolean; `⌘F` therefore keeps whatever the sidebar set.

### 5. Activity bar icons (`Sidebar.tsx`, `styles.css`, `activity-bar.test.ts`)

- Delete the `fill` prop from the section `Icon` (`Sidebar.tsx:189`). Keep
  `strokeWidth={active ? 1.9 : 1.5}`: with the fill gone, the slightly heavier stroke is what
  compensates the weak `surface-2` step in the light theme. **No activity-bar icon is filled in any
  state**, and no per-tab exception: the `search` tab needs no special case.
- Update the `styles.css` comment at `:825-828` ("The active section is a filled icon on surface-2")
  and the test title at `activity-bar.test.ts:122` ("…a filled icon…") so neither records the
  retired decision.
- Guard it live in `tests/ui/find-bar.test.mjs`: every `[data-sidebar-tab] svg` has `fill="none"`,
  for the active and an inactive tab.

### 6. Docs

- `docs/design/find-bar.md`: §2 gains the `ab` control and drops "no whole-word" from the
  no-toggle list; §3 records label-only headings and the card row; §4 records trim/collapse,
  whitespace-loose matching and the whole-word rule.
- `docs/reports/find-v3.md`.

## Out of scope

- The exact-word highlight inside Page (separate follow-up: CSS Custom Highlight API).
- Adopting `.nf-result-row` in Health, Library, the outline or the palette.
- Per-surface modes, filters, case-sensitivity, regex, replace, cross-document search.
- Any change to the 100-occurrence cap, the DFS/reading order, the field list, the `.md` exclusion
  ("Search is available in notes."), or Read-mode behaviour.
- Settings persistence for the toggle.

## Files

Read:
- `apps/desktop/src/renderer/src/shell/SearchSection.tsx` — grouping, headings, rows.
- `apps/desktop/src/renderer/src/shell/FindBar.tsx` — the cluster whose height must not change.
- `apps/desktop/src/renderer/src/shell/FindController.tsx` — the single scan and the navigation.
- `apps/desktop/src/renderer/src/lib/find.ts` — `literalRanges`, `literalRangesUtf16`,
  `findInDocument`, `searchUnits`, the field scan.
- `apps/desktop/src/renderer/src/lib/find-snippet.ts` — splits the snippet at the match.
- `apps/desktop/src/renderer/src/editor/find-decorations.ts` — must match the engine exactly.
- `apps/desktop/src/renderer/src/state/shell.ts` — the shared find state.
- `docs/design/find-bar.md` — the current design text.

Expected to touch:
- `apps/desktop/src/renderer/src/lib/find.ts`
- `apps/desktop/src/renderer/src/lib/find-snippet.ts`
- `apps/desktop/src/renderer/src/editor/find-decorations.ts`
- `apps/desktop/src/renderer/src/state/shell.ts`
- `apps/desktop/src/renderer/src/shell/FindController.tsx`
- `apps/desktop/src/renderer/src/shell/FindBar.tsx`
- `apps/desktop/src/renderer/src/shell/SearchSection.tsx`
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx`
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/test/find.test.ts`, `apps/desktop/test/find-surface.test.ts`,
  `apps/desktop/test/activity-bar.test.ts`
- `tests/ui/find-bar.test.mjs`
- `docs/design/find-bar.md`, `docs/reports/find-v3.md`

## Acceptance criteria

- [ ] A block without a label shows its occurrence cards directly under the chapter rule: no
      heading, and the first content line appears only inside the snippet.
- [ ] A block labelled `Metodo` shows `Metodo` once as a heading. The heading is not a button, is
      not focusable, has no hover, and clicking it does nothing.
- [ ] Chapter headings are not buttons and are not focusable; clicking one does nothing.
- [ ] Occurrence cards have a 1 px border and a 4 px radius; hover changes border and background;
      the current card has the accent border plus a 1 px ring, keeps `aria-selected="true"`, and
      scrolls into view when the current occurrence moves (existing effect, still working).
- [ ] `come`, `come ` and `come  ` in either input produce the same count. `come   qui` finds
      `come qui`. A document line break inside a block is matched by a single space in the query.
- [ ] Whole-word off: `eigen` finds `eigenvalue` and `eigenvector`. Whole-word on: it finds neither,
      and `il` no longer matches `mille`. Turning it on in the toolbar changes the sidebar count,
      and vice versa; `Esc`, then `⌘F`, keeps the toggle and the query.
- [ ] No activity-bar icon has a fill in any state. The selected tab is `surface-2` + `text-1` +
      the 1.9 stroke; the magnifier reads as a lens outline when active.
- [ ] No regression: `↵`/`⇧↵`, `↑`/`↓`, `Home`/`End`, `⌘G`, `Esc` restore behaviour; the 100 cap
      and "Refine the search"; the `.md` state; Page navigation and the block ring; Read mode.
- [ ] `apps/desktop/src/renderer/src/styles.css` keeps no `999px`/pill radius and no left accent bar
      on the new rows.

## Tests and evidence

- Targeted during work:
  `npx vitest run apps/desktop/test/find.test.ts apps/desktop/test/find-surface.test.ts apps/desktop/test/activity-bar.test.ts`.
- UI (targeted, the smallest group that contains the suite):
  `node tests/ui/run.mjs --group shell --concurrency 2`. `find-bar.test.mjs` must be green, with no
  page errors.
- End of task: `npm run verify:fast`.
- Integration (Orchestrator only): `npm run verify` at UI concurrency 4.
- Evidence: one screenshot of the sidebar with a labelled and an unlabelled block, one of the
  current card, one of the `ab` toggle on/off in the toolbar. No screen recording.
- No native OS dialog may block a test; no fixed sleeps; do not weaken existing assertions.

## Stop and ask

Stop and report instead of inventing a decision when:

- normalizing the query breaks an existing `find.test.ts` expectation that the new rule does not
  explain (for example a test that asserts `' '` or `'  '` as a distinct query);
- whitespace-loose matching changes anchor or formula-term resolution — those callers must keep the
  current strict behaviour, and if that cannot be isolated, stop;
- `.nf-result-row` collides with an existing class or an existing CSS guard test;
- the `ab` control pushes the toolbar cluster or the sidebar header past an existing breakpoint;
- the per-chapter count disagrees with the header count at the 100-occurrence cap;
- a product decision is missing anywhere else in this brief.

## Report format

- Summary: what changed and why.
- Files changed.
- Checks run, with real timings.
- Acceptance criteria: pass/fail per item.
- Open questions / risks.
- Next suggested step.

One commit in the worktree. Do not merge. Do not change spec/UX/ADR/plan.
