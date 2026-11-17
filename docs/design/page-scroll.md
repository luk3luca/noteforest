# Page as a scroll of pages

**Status:** merged at `5a8dfac` (17 November 2026); the lab is the record, the numbers are in `docs/reports/page-scroll.md`.
**Inputs:** ADR-0007 (layouts Continuous + Page, each with Edit/Read), `docs/design/sidebar.md` (the
surrounding rhythm), the manual-breaks batch (`f096933`), the Settings preview, which already stacks
pages from one page model (`PageSettingsPreview.tsx`).

## 1. The problem

Page is a **pager**: one page, arrows, `3 of 61`. Two consequences:

- a manual break is invisible in its cause: you press it and something changes outside the viewport,
  including the blank space it leaves at the bottom of the previous page — the information you need to
  decide *where* it goes;
- reading a long note means clicking through pages, which is the worst way to read a paginated
  document.

## 2. The change

**Page becomes one vertical scroll of a single column of pages.** Not a carousel, not a grid.

- One page wide, always. Never two side by side — that only works for portrait and turns landscape
  paper into a strip. A single column works for both orientations.
- **Free scroll, no snapping.** You can stop with half a page above and half below; that is the point.
- **Pages touch**, separated by a **1 px rule** (`--border-1`) across the full width. No gap, no card
  shadow: it reads as a printed document. The page number does **not** repeat in the seam; it lives in
  the indicator (§4).
- The page chrome (header, footer, page number) keeps working inside each page; the A4 margins are what
  keep the header of a page from reading as the footer of the one above, and that is checked in the lab.

## 3. Zoom

The page is one column; the zoom decides how much of it you see.

| State | Behaviour |
|---|---|
| **Fit width** (rest) | The page fills the viewport width; vertical scroll only. This is the default and the state the layout opens in. |
| **Zoom in** (> fit) | A reading aid, not a mode: the page becomes wider than the viewport and a horizontal scrollbar appears. Vertical scroll continues across pages. |
| **Zoom out** (< fit) | The page is smaller with margins on both sides; still one column, never two. |

The canvas header keeps the existing zoom control and its percentage. The zoom is a **scale**, not a layout:
the page model, the page count and the PDF are untouched.

## 4. The current page

- **`3 / 61` in the canvas header** (corrected 17 November 2026 — it is a canvas tool, not a tab-bar
  item; the zoom moves with it), next to the zoom. It shows the page that contains the **centre of the**
  viewport** — the same idea as "more than half", without its edge case: with free scroll a page is
  almost never entirely visible, so a majority rule would stay stuck.
- If the centre lands exactly on a seam, the indicator **keeps the current page**: it must not flicker
  while you scroll across a boundary.
- The indicator is a **control, not a label** (corrected 17 November 2026, against a macOS pager): the
  cluster reads

  ```
  [↑] [↓]  [ 3 ] / 61
  ```

  **Up and down arrows** as two plain 22 px icon buttons — no divider between them, the same way the find
  cluster has none — then a **bordered input holding the current page** and the label `/ 61`. Up and down,
  not left and right, because the surface scrolls vertically. The slash matches the app's existing page
  notation; `of` belongs to the find count, not here.
  - Click the input, type a number, `↵` jumps, `Esc` restores the current page.
  - The arrows move to the previous/next page start and are **disabled at the first and last page**.
  - `⌘↑` / `⌘↓` do the same from the keyboard; `PageUp` / `PageDown` keep their ordinary meaning: scroll
    one viewport.
  - **No dialog**: the jump happens in the control that already says where you are.
- Page Edit: the overlay stays where it is and scrolls with its page.

## 5. Find and navigation

- "Go to page N" becomes a **scroll** to that page; the block ring stays exactly as it is.
- The find's current hit scrolls the page into view when the hit is on another page, and only scrolls
  within the page when it is on the current one (no jump for a hit that is already visible).
- Manual breaks: the `Breaks` list navigates the same way.

## 6. Cross-page edges

Trunks and arrows are drawn per page today. With pages touching, the seam is the cut: **a trunk stops at
the bottom edge and resumes at the top of the next page**. No continuation drawn across the rule — the
rule *is* the message, and a line crossing it would suggest a continuity the paper does not have.

## 7. Performance

- 61 pages of measured DOM is too much. **Mount only the pages that can be seen, plus two on each
  side** (~5 at fit width), keyed by page index; the rest are placeholders of the exact page size so the
  scrollbar stays truthful.
- Measurement is unchanged: it happens in the hidden host and does not depend on what is mounted.
- Budget: the 61-page A4 gate and the 300-block case (27 pages) must open in the same time as today
  ±10 %, and scrolling must not re-measure.

## 8. What this is not

- Not a change to `paginate`, the page model, the page chrome, the PDF or the print compositor.
- Not a change to Continuous: it stays the canvas with branch arrows, no page chrome.
- Not a two-page spread, not a thumbnail grid, not a book gutter.

## 9. Resolved decisions (17 November 2026)

1. **Seam:** pages touch, a 1 px hairline in the page scope's existing rule colour (no new token), no
   gap and no number in the seam. The "printed document" reading wins.
2. **Indicator:** in the canvas header next to the zoom, not floating over the paper.
3. **Zoom ceiling:** **200 %**, as today. `100 %` is fit width; below it the page shrinks with margins,
   above it a horizontal scrollbar appears.

## 10. Migration notes (for the brief)

- The page UI suites assume one page visible at a time, arrows and a `page N of M` label: they migrate
  to "scroll position + indicator" assertions, not to weaker ones.
- The page ring, the edit overlay, the break navigation and the print parity tests must stay green.
- `PageView` keeps ownership of the page model; the scroll container is new, the page content is not.
