# Changelog

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
