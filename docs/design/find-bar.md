# Find bar (`⌘F`)

**Status:** design for phase 6; no code. Lab: `docs/design/find-bar-ui-lab/`.
**Date:** 15 November 2026.
**Scope:** the open note. Not the library, not a query language.

## 1. Model

`⌘F` opens a find bar over the current surface. It searches the **open note** and navigates to the
blocks that contain the query; it never edits, replaces or filters. `Esc` closes it and restores the
selection that was active before it opened.

## 2. Placement

- **Recommended: a floating bar** at the top-right of the surface (10 px from the top-right corner
  of the canvas/page viewport), 420 px wide, 40 px high, with the results panel attached below.
  - Continuous: floats over the note; nothing reflows.
  - Page: floats over the surface; the page keeps its zoom. If the window is narrow the bar (and the
    panel while typing) can overlap the page edge; it is temporary and closes with `Esc`.
- **Alternative: a docked strip** under the surface toolbar. It never covers the note, but it takes
  40 px from the surface; Continuous shifts and Page can re-fit. Rejected for v1.

The bar is not part of the page/print output.

## 3. Anatomy

`[ search icon | query | × ]  [ 1 / 12 ]  [ ‹ ] [ › ] [ close ]`

- Input 28 px, placeholder “Find in note”; the query is remembered per session and selected on open.
- Count: current / total, tabular; `0` when there is no match.
- Previous/next: 28 px icon buttons, disabled at `0`; they mirror `⇧↵` / `↵` and `⌘⇧G` / `⌘G`.
- Close: 28 px `X`; `Esc` is equivalent.
- Results panel: 420 px, max 330 px high, grouped by chapter, one row per block; 6 px inset; rows
  36–44 px. A footer line carries the keyboard hints.

## 4. Matching and results

Search fields: block text, code text, LaTeX source (inline and block), anchor quotes, branch labels,
chapter titles. Case-insensitive; no regex, no accent folding in v1.

- **One result per block**, at the first match; the count is blocks, not occurrences. The snippet is
  one line around the first match (the match is emphasised in the panel).
- Rows: type (`Text`, `Code`, `Formula`, `Anchor`, `Label`, `Chapter`), block title, snippet. Group
  header: the chapter title. Chapter-title hits sit in a `Chapters` group at the top.
- Branch-label hits show the label and its target; jumping selects the source block and the branch
  (same as clicking the reference chip).
- Anchor-quote hits jump to the block **and** select the anchor.
- Results cap at 100: the count reads `100+` and the panel ends with “Refine the search to see more”.
  The cap keeps a common word from rendering thousands of rows; the array scan itself is linear.
- The panel is a preview, not the navigation: `↵`/`⇧↵` cycle the hits; clicking a row jumps to it.

## 5. Navigation and highlight

- While typing, the panel fills and the hits in the note are marked (subtle); the bar does **not**
  scroll on every key. `↵`, `⇧↵`, `⌘G`, `⌘⇧G` or a click move to the hit and keep the bar open.
- Continuous: scroll the block into view, select it, mark all matches subtly and the current one
  strongly (a temporary decoration, cleared on close). Collapsed blocks are searchable; jumping
  expands their ancestors (the existing `expandAncestors` used by Health Locate).
- Page: go to the page that contains the block fragment and ring the block; the exact-text
  highlight inside the page is a follow-up. The results row shows `p. N`.
- Read mode: the bar is navigation only; no editing chrome appears. Expanding a collapsed block is a
  view-state change and stays allowed.
- Closing restores the selection saved when the bar opened, not the last hit.

## 6. Keyboard and ARIA

- `role="search"` bar; the input is a combobox with `aria-controls` the results list and
  `aria-activedescendant` the current row; the list is a listbox; rows are options (not tab stops).
  The count is an `aria-live="polite"` region (“3 of 12”).
- `⌘F` open/focus; `Esc` close and restore; `↵` next, `⇧↵` previous; `⌘G`/`⌘⇧G` next/previous;
  `↑`/`↓` move the active row (same as cycling), `Home`/`End` first/last; `Tab` leaves the bar.
- `⌘F` while the bar is open focuses the input and selects the query; it does not reopen a second bar.
- No document: `⌘F` does nothing. Markdown guest files: out of v1 (open).

## 7. States

- **Typing**: spinner only after 150 ms; the panel updates when the debounced query resolves.
- **No matches**: “No matches for “xyz”.” and the count `0`; the note keeps its selection.
- **Many**: 100+ cap as above.
- **Read**: same, no mutations.
- **Long query / special characters**: literal match; no regex interpretation; quotes are part of the
  query.
- **Layout switch**: if the document is in Page and a hit is on a page, the bar stays open; if the
  user switches to Continuous while open, the bar stays and the hit is re-resolved.

## 8. Performance

Debounce 120–150 ms; one linear scan over the document model per query; no index in v1. Target:
300-block document under 16 ms, 1,000 blocks under 50 ms on the dev machine; no per-keystroke audit,
no layout measurement. The 100-result cap bounds the DOM.

## 9. Out of scope

Replace, regex, filters, accent folding, cross-document/library search, a search palette, saved
searches. The bar searches the open note only.

## 10. Open decisions

1. Floating bar (recommended) or docked strip?
2. One result per block (recommended) or per occurrence?
3. No scroll while typing (recommended), or jump to the first hit as you type?
4. Results cap 100 (recommended) or no cap?
5. Markdown guest files excluded in v1 (recommended)?
6. Page: ring the block only in v1 (recommended), or also highlight the exact text?

## 11. Acceptance (for the future brief)

- `⌘F` opens/focuses; `Esc` restores; `↵`/`⇧↵`/`⌘G`/`⌘⇧G` cycle.
- All six fields match, case-insensitively; no regex interpretation.
- Continuous scrolls, selects and highlights; collapsed ancestors expand.
- Page goes to the page, rings the block, shows `p. N`.
- Read mode works; no mutation. No document does nothing.
- 300/1,000-block latency within budget; screenshots Continuous/Page/Read/no-match.
- No schema, settings, Page geometry, PDF or library change.
