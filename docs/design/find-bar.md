# Find bar (`⌘F`) and the sidebar Search view

**Status:** the bar is implemented and merged at `365ed15` (15 November 2026); the sidebar Search and the Page word highlight are the follow-ups.
**Lab:** `docs/design/find-bar-ui-lab/`.
**Date:** 15 November 2026.

## 1. Model

Two presentations, one engine, one scope: the **open note**.

- **Find bar**: the quick find. `⌘F`, type, see `1 of 4`, move with the arrows, `Esc`. It is the
  VS Code widget minus the toggles: no case-sensitive switch, no whole-word, no regex, no options
  menu, no results panel.
- **Sidebar Search**: the browsing view. The same matches as snippets of the blocks where they
  appear, grouped by chapter. It replaces the Outline while active and returns to it on close.

## 2. Floating bar

- 360 px wide, 40 px high, 10 px from the top-right corner of the surface; it floats over the note
  and never reflows the canvas or re-fits the page.
- Anatomy: `[ query ] [ 1 of 4 ] [ ↑ ] [ ↓ ] [ × ]`. Input 28 px; count tabular; 28 px icon buttons;
  `×` closes. No clear button inside the field (the query is selected on open).
- With no match the count reads **“No results”** and the arrows are disabled.
- The bar is not part of Page or the PDF.
- While open, all matches are highlighted in the note; the current one is stronger and scrolled into
  view when the query changes. The bar keeps the last query per session and selects it on open.

## 3. Sidebar Search view

- A `Search` section in the activity bar. 264 px wide; header `Search`, the count (`1 of 4`), close.
- Input 28 px, full width.
- Results: chapter group (uppercase 9.5), block title (10.5/600), then one row per **occurrence** with
  a two-line snippet around the match (≈ 40 characters before and after), the match emphasised. The
  current occurrence is a filled row. Clicking a snippet jumps; the floating bar is not required.
- The snippet clamps to two lines at 264; code and LaTeX snippets use the mono face. Anchor quotes,
  branch labels and chapter titles use the same snippet shape (for a chapter title the snippet is the
  title itself).
- The count is occurrences. A block with three matches shows three snippets under the block title.
- The view replaces the Outline while active; closing returns to the previous section. It is
  persistent while the user browses, unlike the bar.
- `⌘F` opens the **bar**, not the sidebar view. The two share the query and the result model but not
  their open state (open the Search section from the activity bar).

## 4. Matching

Fields: block text, code text, LaTeX source (inline and block), anchor quotes, branch labels, chapter
titles. Case-insensitive, literal text; no regex, no accent folding, no replace.

- One result per **occurrence**; the count is occurrences. A text match that falls inside an
  anchor's range is reported as an **Anchor** hit with its anchor id; a stored quote that is no
  longer in the content is an Anchor hit on the record. Chapter titles and branch labels are one
  hit each and select their chapter/source.
- Results follow the **document reading order**: chapters, top-level blocks, then children
  depth-first with anchored children before direct children (the outline order), then the next
  sibling. DFS pre-order, never BFS.
- Snippet: one line around the match for the bar's count (no panel), two lines in the sidebar.
- The result cap is 100 occurrences (`100+` in the count, “Refine the search” at the end of the
  sidebar list). The scan itself is linear.

## 5. Navigation

- On a query change the first match becomes current and the view moves to it (VS Code behavior). The
  arrows, `↵`/`⇧↵` and `⌘G`/`⌘⇧G` move next/previous.
- Continuous: scroll to the block, select it, mark all matches and the current one strongly; a
  temporary decoration cleared on close. Collapsed blocks are searchable; jumping expands their
  ancestors.
- Page: go to the page that contains the block and ring the block. The exact-text highlight inside
  the page is a follow-up.
- Read mode: navigation only; no editing chrome. Expanding a collapsed block is a view-state change
  and stays allowed.
- `Esc` closes and restores the selection saved when the bar opened; not the last hit.

## 6. Keyboard and ARIA

- `role="search"`; the input is a combobox with `aria-controls` the results (sidebar view) and
  `aria-activedescendant` the current row; the count is an `aria-live="polite"` region.
- `⌘F` open/focus; `Esc` close and restore; `↑`/`↓` and `↵`/`⇧↵` move; `⌘G`/`⌘⇧G`; `Home`/`End`
  first/last; `Tab` leaves the bar.
- No document: `⌘F` does nothing. Markdown guest files: out of v1.

## 7. States

- No results: “No results”, `0` in the sidebar; the note keeps its selection.
- Many: 100 occurrences cap as above.
- Read: works, no mutation.
- Layout switch while open: the bar stays; the current hit is re-resolved in the new surface.
- Page: the row shows `p. N` in the sidebar; the page keeps its zoom.

## 8. Performance

Debounce 120–150 ms; one linear scan over the document model per query; no index in v1. Target:
300 blocks under 16 ms, 1,000 blocks under 50 ms; no per-keystroke audit, no measurement. The 100
occurrence cap bounds the DOM.

## 9. Out of scope

Replace, regex, filters, accent folding, cross-document/library search, a search palette, saved
searches. The bar searches the open note only.

## 10. Build order and open items

**Confirmed (15 November 2026):** occurrences; cap 100; Markdown excluded; DFS/reading order;
Continuous word highlight plus Page block ring; the bar first, the sidebar Search next. The toggles
and the results panel are **not** in the design.

- **Phase 6**: the floating bar (input, count, arrows, close; highlights; navigation).
- **Next**: the sidebar Search section (the activity bar already lists “Search” as a future section),
  same engine, snippet list.
- Follow-up: the exact-word highlight inside Page (CSS Custom Highlight API, no PDF change).
