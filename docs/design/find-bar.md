# Find bar (`⌘F`) and the sidebar Search view

**Status:** the toolbar cluster and the sidebar Search are implemented and merged at `eec39b4` (16 November 2026); find v3 (label-only headings, card rows, one normalized query mode with the shared `ab` toggle, stroked-only activity icons) lands 16 November 2026. The Page word highlight and the copy alignment of the provisional labels are the follow-ups.
**Lab:** `docs/design/find-bar-ui-lab/`.
**Date:** 15 November 2026 (v3 amendment 16 November 2026).

## 1. Model

Two presentations, one engine, one scope: the **open note**.

- **Find bar**: the quick find. `⌘F`, type, see `1 of 4`, move with the arrows, `Esc`. It is the
  VS Code widget minus the case/regex options: one shared `ab` whole-word toggle, no
  case-sensitive switch, no regex, no options menu, no results panel.
- **Sidebar Search**: the browsing view. The same matches as snippets of the blocks where they
  appear, grouped by chapter. It replaces the Outline while active and returns to it on close.
- **One query mode.** Both presentations normalize the query the same way and share the one
  whole-word option (v3, 16 November 2026): a change in either surface changes both counts and both
  highlight ranges.

## 2. Placement and anatomy

- The bar lives **in the surface toolbar**, in the empty centre between undo/redo and the
  Continuous/Page + Edit/Read controls: one 28 px cluster, `[ query ] [ ab ] [ 1 of 4 ] [ ↑ ] [ ↓ ] [ × ]`.
  The toolbar row height does not change; nothing overlays the note or the page.
- Input 28 px; count tabular; 22 px icon buttons inside the cluster; `×` closes. No clear button
  inside the field (the query is selected on open). No card, no shadow.
- The `ab` button is 22 px, 9.5 px underlined text, `aria-pressed`, `title="Match whole words"`.
  It is rendered whenever the bar is open (not only with a non-empty query) so the state is always
  visible; active is `--accent-soft` with `--text-1` ink. It reads and writes the one shared boolean,
  so `⌘F` keeps whatever the sidebar set.
- With no match the count reads **“No results”** and the arrows are disabled.
- The bar is not part of Page or the PDF.
- While open, all matches are highlighted in the note; the current one is stronger and scrolled into
  view when the query changes. The bar keeps the last query and the whole-word mode per session and
  selects the query on open.
- At narrow widths the input shrinks before the layout/mode controls; the toggle, count, arrows and
  close stay.

## 3. Sidebar Search view

- A `Search` section in the activity bar. 264 px wide; header `Search`, the count (`1 of 4`), the
  same `ab` whole-word toggle (`data-search-whole-word`), close.
- Input 28 px, full width.
- Results have three unmistakable levels (**B2's chapter division and indent with B3's card
  outline**, chosen 16 November 2026):
  - **Chapter rule**: uppercase 9.5 px `--text-3`, a 1 px `--border-1` rule above, and the chapter's
    visible occurrence count at the right in `--text-3`, tabular. Not focusable and not a button.
  - **Block label**: only a **real** `document.blocks[blockId].label` becomes a heading; the first
    content line is never promoted to a title, so an unlabelled block shows its occurrence cards
    directly under the chapter rule with the first line only inside the snippet. A chapter-title
    hit keeps the heading `Chapter title` because it names the source, not a block. The heading is a
    plain `div`: not focusable, no hover, no click. Labelled blocks wrap their rows in
    `role="group"` with the heading as `aria-label`; unlabelled blocks add no group.
  - **Occurrence card**: one `<button role="option">` per occurrence, 12 px in from the panel edge,
    two-line snippet, mono variant for code/formula. 1 px `--border-1` outline, `--surface-1`,
    radius 4, `padding: 7px 8px`, 3 px gap between cards. Hover is `--border-2` + `--surface-2`;
    the current card is the `--accent` border plus a 1 px `--accent` ring, `--surface-2` fill, and
    keeps `aria-selected="true"`. The card/hover/current rules live in the shared `.nf-result-row`
    class; `.nf-search-row` adds only the search metrics. Health keeps its current rows for now.
- The snippet clamps to two lines at 264; code and LaTeX snippets use the mono face. Anchor quotes,
  branch labels and chapter titles use the same snippet shape (for a chapter title the snippet is the
  title itself).
- The count is occurrences. A block with three matches shows three cards under the block label.
- The view replaces the Outline while active; closing returns to the previous section. It is
  persistent while the user browses, unlike the bar.
- `⌘F` opens the **bar**, not the sidebar view. The two share the query, the whole-word mode and the
  result model but not their open state (open the Search section from the activity bar).

## 4. Matching

Fields: block text, code text, LaTeX source (inline and block), anchor quotes, branch labels, chapter
titles. Case-insensitive, literal text; no regex, no accent folding, no replace.

- **One normalized query mode (v3).** Every raw query is normalized once at the engine entry: each
  whitespace run collapses to a single space and the ends are trimmed. The input value is never
  rewritten, so the caret and trailing spaces survive; only matching is normalized. `come`, `come `
  and `come  ` therefore produce the same count.
- **Whitespace-loose needle.** The normalized words match with `\s+` between them: `come   qui`
  finds `come qui`, and a line break inside a block (a paragraph boundary or a hard break) matches a
  single space. Match offsets stay offsets into the original text, and the scan, the snippet
  splitter and the Continuous decoration all use the same helper.
- **One whole-word option, both surfaces.** Off by default (substring). On, a match counts only
  when the characters immediately before and after it are not `\p{L}`, `\p{N}` or `_` (Unicode
  property escapes). It applies to every scanned field. The toolbar `ab` and the sidebar `ab` read
  and write the same session boolean; it is never persisted to settings. There is no per-surface
  mode, no case-sensitive switch, no regex, no options menu.
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
- Anchor and formula-term resolution keep the **strict** matcher (verbatim query, no trimming, no
  whitespace-loose matching); the loose mode is the find surface only.

## 5. Navigation

- On a query change the first match becomes current and the view moves to it (VS Code behavior). The
  arrows, `↵`/`⇧↵` and `⌘G`/`⌘⇧G` move next/previous.
- Continuous: scroll to the block, select it, mark all matches and the current one strongly; a
  temporary decoration cleared on close. Collapsed blocks are searchable; jumping expands their
  ancestors.
- Page: the cluster is in the same toolbar; go to the page that contains the block and ring the
  block. The exact-text highlight inside the page is a follow-up.
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
Continuous word highlight plus Page block ring; the bar first, the sidebar Search next. The case and
regex toggles and the results panel are **not** in the design; the one shared `ab` whole-word toggle
was added on 16 November 2026 (v3).

- **Phase 6a**: the toolbar cluster (input, count, arrows, close; highlights; navigation) — merged
  at `eec39b4`.
- **Phase 6b**: the sidebar Search section, same engine, snippet list — merged at `eec39b4`.
- **Find v3**: label-only headings, card rows with the shared `.nf-result-row`, one normalized query
  mode with the shared `ab` toggle, and stroked-only activity icons — this change.
- Follow-up: the exact-word highlight inside Page (CSS Custom Highlight API, no PDF change); the
  copy sweep aligns the provisional sidebar labels and the palette “Search ⌘K” button.
