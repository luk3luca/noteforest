# Batch report — v0.1.2 input correctness and small UI fixes

**Status:** shipped 0.1.2 on 19 November 2026. One integration window; the full `verify` is green.
No Sentinel: the product owner did not approve one. The orchestrator reviewed the brief and ran the
gate.

**Commits:** T3 `2353c95`; T2 merge `2ee0393`; T1 merge `29de828`; release commit (version,
changelog, status, this report). The three builder reports are `report-small-ui.md`,
`report-arrows.md` and `report-formula-width.md`.

## What shipped

- **T1 — long inline formula (#12):** the Page measurement publishes the widest rendered inline
  formula; a formula wider than the card grows the card to the available Page content width with no
  wrap, clip or shrink. Page Read/Edit and PDF use the same width; a formula wider than the page
  keeps the existing `content-too-wide` defect. The display-formula path, the 18/32/16 gaps, the
  horizontal corridor and the default page counts are unchanged.
- **T2 — arrow boundary (#13):** plain ArrowUp/ArrowDown stay inside the block on the first/last
  visual line, mid-word included; a selected inline/block formula at the block end does not move to
  the next block. Code blocks and tables keep native arrows. `⌘↑`/`⌘↓` still navigate blocks;
  `⌘←`/`⌘→` stay line start/end.
- **T3 — small UI (#7 + #8):** Page selection ink is scoped to the paper ink + accent tint in both
  themes; the Library section header has the 28 px refresh button wired to `refreshLibrary()`,
  while the menu Refresh stays.
- **Test-only integration adjustments:** the T2 lane relaxed two assertions to match native/desired
  behavior — the visual column can change the character offset on the other line, and an inline
  formula collapses to a caret in the block (the “continue writing” path) while a block formula keeps
  its NodeSelection. No product assertion was weakened.

## Checks

| Check | Result |
|---|---|
| Full `npm run verify` | **green** — 184 unit files / 1,930 tests; boundaries 306 files / 1,495 imports / 16 rules; e2e 16/16; recovery 14/14; UI **71/71** at concurrency 4 (364.6 s) |
| Per-track `verify:fast` | T3 183/1,913, T2 183/1,920, T1 184/1,915; e2e 16/16 each |
| T1 UI lane | `m4c1` 8/8, `m4b1-page-view` 12/12, `m4c3-pdf-gate` 3/3 |
| T2 UI lane | `special-text` 11/11 |
| T3 UI lane | `b2-contrast` 4/4, `library-surface` 8/8, `sidebar-system` 4/4 |

## Acceptance

- T1: a long rendered inline formula grows the Page card in Read/Edit and PDF; a fitting formula,
  the display formula, the gaps/corridor and the default page count are unchanged; an over-page
  formula keeps the existing defect.
- T2: mid-word Up/Down and selected formula arrows stay in the block; code/table native arrows and
  `⌘↑`/`⌘↓`/`⌘←`/`⌘→` are unchanged; no new chord.
- T3: both-theme Page selection CSS guard; the 28 px Library refresh button with accessible name,
  click behavior and the menu path kept.
- No new dependency, no document-schema change, no new UI suite file.
- The product owner's visual, VoiceOver and PDF pass on the installed app remains the release gate.

## Evidence

- `docs/batch/report-formula-width.md`, `docs/batch/report-arrows.md`,
  `docs/batch/report-small-ui.md`.
- T1: `artifacts/m4c1/ui/print-table-cell-*` and the new long-inline-formula Page/PDF case.
- T2: `tests/ui/special-text.test.mjs` B2 (live DOM caret/canonical block, no pixels).
- T3: `artifacts/b2-contrast/page-selection-{dark,light}.png`,
  `artifacts/library-surface/library-refresh-header.png`.

## Remaining known issues

`docs/plan.md` now lists nine: empty-child floor, 1,000-block scroll p95, mixed-polarity code chrome,
rich-cell move reconciliation, the Page Edit second undo entry, `⇧Esc`, the clipped palette reason,
the read-only sentence and Fit page. The small-fix shortlist keeps #3 and #5.
