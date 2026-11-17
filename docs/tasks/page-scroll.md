# PG1 — Page as a scroll of pages

**Role:** Builder
**Milestone:** Page reading surface
**Base:** `main` at launch, after the data & recovery batch has merged (same `styles.css`).
**Worktree:** created by the Orchestrator, branch `t3/page-scroll`.
**Timebox:** 6 hours.

## Context

Page is a pager: one page, arrows, `3 of 61`. A manual break is therefore invisible in its cause — you
press it and the change happens outside the viewport, including the blank tail it leaves on the previous
page, which is exactly the information needed to decide where it goes. The design is
`docs/design/page-scroll.md` (approved 17 November 2026), the lab is `docs/design/page-scroll-ui-lab/`.

## Goal

Page becomes one vertical scroll of a single column of touching pages, with a 1 px seam, free scrolling,
and a `N / M` indicator that reads the page under the centre of the viewport; the zoom keeps working
from 50 % to 200 %, with 100 % as fit width.

## In scope

### 1. The scroll surface (`PageView`)

- One column: page width = the viewport width at 100 %. Pages **touch**, separated by a 1 px hairline in
  the page scope's existing rule colour. No gap, no shadow, no card.
- **Free scroll**: `overflow: auto`, no scroll snapping, no per-page paging state.
- The page chrome (header/footer/page number) is unchanged inside each page.
- The A4 margins must keep the header of a page from reading as the footer of the page above; if they do
  not, add breathing room **inside the page**, never a gap between pages.

### 2. Zoom

- `100 %` = fit width (the rest state, and the state the layout opens in).
- Range `50 %`–`200 %`. Below 100 % the paper shrinks with margins on both sides; above it the paper is
  wider than the viewport and a horizontal scrollbar appears.
- The existing toolbar zoom control and its percentage stay; the value persists per document as view
  state does today.

### 3. The indicator

- `N / M` in the toolbar next to the zoom: the page whose box contains the **centre of the viewport**.
- A centre that lands exactly on a seam **keeps the current page** (no flicker while scrolling).
- Clicking it opens a page jump (a small list or a number field); `⌘↑` / `⌘↓` move to the previous/next
  page start.
- Find and the `Breaks` list navigate by scrolling to the page; the block ring is unchanged.

### 4. Mounting

- Mount the pages that can be seen **plus two on each side** (~5 at 100 %), keyed by page index.
- The rest are placeholders of the exact page size so the scrollbar and the indicator stay truthful.
- Measurement is unchanged: it happens in the hidden host and does not depend on what is mounted.
- `Page Edit` keeps its single-block overlay; it must scroll with its page and must not remount on
  scroll.

### 5. Edges

Trunks and arrows stay per page: a trunk stops at the bottom edge and resumes at the top of the next
page. Do **not** draw a continuation across the seam.

### 6. Tests

- Migrate the page-group suites from "one page visible, arrows, `page N of M`" to "scroll position +
  indicator" assertions — same strength, new surface. List every migrated assertion in the report.
- New: the indicator follows the viewport centre and does not flicker across a seam; `⌘↑`/`⌘↓` and the
  jump land on the page start; the page ring and `Page Edit` still work after scrolling; 100 % fits the
  width, 200 % scrolls horizontally, 50 % leaves margins.
- Keep: print parity, the PDF gate, the manual-break navigation, the find ring.
- Budget: opening the 61-page gate and the 27-page 300-block document stays within 10 % of today, and
  scrolling never re-measures.

## Out of scope

- `paginate`, the page model, the page chrome strings, the print compositor, the PDF.
- Continuous, its arrows, its chrome.
- A two-page spread, a thumbnail strip, a book gutter, scroll snapping.
- The zoom ceiling beyond 200 %, any new settings.

## Files

Read: `docs/design/page-scroll.md`, `docs/design/page-scroll-ui-lab/index.html`,
`apps/desktop/src/renderer/src/page/PageView.tsx`, `page/model.ts`, `page/PageEdges.tsx`,
`page/measurement.ts`, the page-group suites in `tests/ui/`.

Expected to touch: `page/PageView.tsx`, the new scroll container, `styles.css` (page scope only), the
toolbar's page controls, the tests, `docs/reports/page-scroll.md`.

## Acceptance criteria

- [ ] Page opens at 100 % with one column, pages touching, a 1 px seam, and no snapping.
- [ ] Scrolling to a seam shows the bottom of one page and the top of the next, and the indicator names
      the page under the centre.
- [ ] `⌘↑`/`⌘↓`, the jump and the `Breaks` list move to page starts; the find's page ring still lands.
- [ ] 200 % scrolls horizontally; 50 % shows margins; the page count and the PDF are unchanged.
- [ ] With 61 pages only the visible window is mounted; the scrollbar length is correct at both ends.
- [ ] Page Edit opens and commits while scrolled, and does not remount on scroll.
- [ ] No regression in print parity, the PDF gate, the manual breaks, the find and the health.

## Tests and evidence

- Targeted: `npx vitest run`, then `node tests/ui/run.mjs --group page --concurrency 2` and
  `--group shell`.
- End of task: `npm run verify:fast`.
- Do not run `npm run verify`.
- Screenshots under `artifacts/page-scroll/`: the seam view, the indicator, 200 %, 50 %, the page after a
  manual break, and a long document mid-scroll.

## Stop and ask

- if virtualization breaks measurement or the print handshake;
- if a page suite asserts something the scroll surface cannot express without weakening it;
- if the page model has to change to know a page's size before mounting;
- if the seam requires a new token or a change outside the page scope.

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, migrated assertions, risks, next
step. One commit; do not merge.
