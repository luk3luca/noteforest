# Changelog

## 0.1.2 — 19 November 2026

Third release. macOS (Apple silicon), local unsigned build.

- **Long inline formulas:** a rendered `$…$` formula wider than the card grows the Page card to the
  available content width, never wraps, clips or shrinks the formula, and keeps Page Read/Edit and
  PDF parity. A formula wider than the page keeps the existing `content-too-wide` defect; a fitting
  formula and the 18/32/16 Page gaps are unchanged.
- **Arrow boundary:** plain ArrowUp/ArrowDown stay inside the block at the first/last visual line,
  even mid-word; a selected formula or block atom at the block end no longer moves to the next
  block. `⌘↑`/`⌘↓` still navigate blocks, `⌘←`/`⌘→` stay line start/end.
- **Page selection:** the selection ink inside Page Read/Edit is paper ink with an accent tint in both
  themes; the global selection is untouched.
- **Library:** the Library section header has the 28 px refresh button, wired to the existing
  `refreshLibrary()`; the menu Refresh stays.
- **Verify:** 184 unit files / 1,930 tests, e2e 16, recovery 14, UI 71/71 at concurrency 4.

Known limitations remain in `docs/plan.md`.

## 0.1.1 — 19 November 2026

Second release. macOS (Apple silicon), local unsigned build.

- **Anchors:** one resolution index over the core resolver; Continuous, Page and PDF agree on resolved,
  ambiguous, broken and idle anchors. Below-callout trunks start at +24 and a below card never sits
  left of the +38 lane.
- **Page vertical gaps:** three per-document settings in Page → Advanced — Child gap (18), Top-level
  gap (32), Callout gap (16), each 0–96, fixed under density, applied to Page and PDF. The horizontal
  parent → right-group corridor stays a fixed 18 px.
- **Tables:** cells carry inline marks and formulas through GFM paste and typed conversion (bold,
  italic, strike, inline code, inline math, hard break); Copy as Markdown writes them back. The
  classic selection bubble formats inside a cell; the table management bar is fixed to the bottom
  edge with its 13 management actions.
- **Editing:** typing `#` on a heading shows the marker and changes the level; Backspace lowers it to
  a paragraph. `$` on a selection wraps an inline formula; `$` on a selected formula unwraps it.
- **Paste:** HTML from a rendered Markdown/LaTeX source restores formulas instead of dropping `$`.
- **Verify:** 183 unit files / 1,909 tests, e2e 16, recovery 14, UI 71/71 at concurrency 4.

Known limitations remain in `docs/plan.md`: long inline-formula card width and the arrow-boundary
rule are deferred.

## 0.1.0 — 18 November 2026

First release. macOS (Apple silicon), local unsigned build.

- Documents made of content blocks connected by arrows, with branches anchored to a word, formula term, code
  token or image region; shared children are references.
- Two layouts — **Continuous** (writing canvas) and **Page** (exact A4 pages), each with **Edit** and **Read**
  modes; Page Edit is an opt-in single-block overlay.
- Structured content: rich text, headings, lists, code blocks with syntax colours, tables, images with assets,
  LaTeX, highlights in four tones.
- Find across the note (canvas bar and sidebar), with word-level highlighting in both layouts.
- Page chrome, manual page breaks, density 60–120 %, page size/orientation/margins, four code themes.
- PDF export of the Page layout with real text, preflight, job progress/cancel and produced-PDF checks.
- Recursive vault library: folders, note packages and Markdown guest files, move/trash, recents, document
  health, unused-image cleanup to the OS Trash.
- Command palette, native menus, a single keyboard catalogue, undo/redo across text and structure.

Known limitations are listed in `docs/plan.md` (empty-child card, 1,000-block long frame, mixed-polarity code
chrome, rich-cell move reconciliation, a second undo entry on some Page Edit commits).
