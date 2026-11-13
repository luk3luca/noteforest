# Special text editing — fences, inline code, formulas, tables

**Role:** Implementer / Builder
**Milestone:** Editor special text (post settings/shell)
**Base:** `main` head at delegation (includes this brief)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 3 days

## Context

The product owner ratified the following behaviour after the `docs/design/special-text-lab.html`
prototype. One worktree, **one commit** for all four areas; the review unit is the diff and the
report.

## A. Code block (Continuous editor only)

- **Auto-close**: the block is a node; there is no closing fence to type. A closing-fence row is an
  affordance that exits the block. Typing ` ``` ` inside the code is literal text.
- **States** (Obsidian-like):
  - **idle** (caret outside): no fences, no header. A muted language label sits top-right **only
    when a language is set**. A copy button appears on hover.
  - **hover**: language label + copy button. **No fences.**
  - **editing** (caret anywhere inside): the opening fence ` ``` ` or ` ```python ` appears at the
    top as **editable text** (no menu, no clickable token), and the closing fence row appears at the
    bottom (button). The idle language label disappears.
- **Opening**: keep the existing space input rule and add **Enter** parity: a paragraph whose text is
  exactly ` ``` ` or ` ```lang ` converts to a code block with `attrs.language = lang` (empty →
  `plaintext`) and the caret inside.
- **Language**: the fence text is the only editor. Enter/blur commits; `Esc` cancels; empty →
  `plaintext`; unknown tokens are stored and lowlight falls back.
- **Exit**: click the closing fence row, `↓` at the end of the code, or `⌘Enter`. Insert a paragraph
  below if the next node is not a paragraph, place the caret at its start, one undo entry.
- **Copy** button copies the code text.
- **Syntax colours**: add `.hljs-*` token styles for dark and light from the app palette. Colours are
  **editor only**: Page Read/Edit and the PDF stay neutral (no chrome, no coloured tokens).
- **Disambiguation**: three backticks only at the start of a paragraph; inside a code block they are
  literal. Inline code is a mark (see B).

Implementation note: the node view must keep the lowlight inline decorations and the ProseMirror
caret working; the fence rows and header are `contentEditable=false` chrome, the code body is the
contentDOM. Use a decoration or an active class for the editing state (the caret is inside the node,
not a `NodeSelection`).

## B. Inline code

- A plain `` ` `` with a collapsed caret toggles the `code` mark for the next input (stored mark); a
  second `` ` `` or `Esc` ends it. With a non-empty selection, `` ` `` wraps/unwraps it.
- No literal auto-pairing: the backticks never enter the text.
- `⇧`` inserts a literal backtick character.
- Inside a code block, `` ` `` is literal.
- The typed-pair input rule stays for pasted text; the toggle is the normal path.
- The mark is not stored as text (future Markdown export serialises it).

## C. Formulas

- **Input rules**: replace the library convention with ours:
  - `$…$` → inline math with Obsidian guards: no space immediately after the opening `$`, no space
    immediately before the closing `$`, no newline, no `$` inside.
  - `$$…$$` at the start of a paragraph (or `$$` + Enter) → block math.
  - The library's `$$…$$` inline and `$$$…$$$` block rules must not fire.
- **Editing**: a **double click** on a formula opens an **inline source editor in place**, not the
  modal dialog: the node view shows the raw `$…$` / `$$…$$` text, `Enter`/blur commits the latex
  attribute, `Esc` cancels, live KaTeX if cheap.
- A **single click stays a `NodeSelection`** (the current anchor workflow). Do not make single click
  open the editor.
- Remove the editor's double-click → math dialog path (keep the dialog only if another surface still
  uses it; Page Edit suppresses the event today).
- Tests: `$2*2$`, `$a_1$`, `$x^2$`, `$100$`; `$5 and $6` stays text; `$$E=mc^2$$` block; backticks
  inside a code block literal; single click selects; double click edits; Esc; the anchor command
  still binds after selecting a formula.

## D. Tables

- **Insert**: an N×M grid picker (1–10) with a header row, plus the existing command. Remember the
  last size for the session.
- **Toolbar** when the caret is in a table: insert row above/below, delete row, insert column
  left/right, delete column, alignment per column (left/center/right), **Copy as Markdown**, **Show
  source** (read-only popover). No merge, no header toggle, no drag-resize.
- **Cells inline-only**: a cell holds one paragraph of inline content only (text, marks, inline math,
  hard breaks). Normalise existing rich cells on load: paragraphs joined with hard breaks, list items
  to one line each. No document `schemaVersion` bump; a pure normalisation.
- **Keyboard**: `Tab`/`Shift+Tab` move between cells; `Tab` on the last cell appends a row; `Enter`
  inserts a hard break; arrows stay inside the cell.
- **Typing Markdown**: consecutive paragraphs forming a GFM table (header + delimiter + at least one
  data row) convert to a table on a **blank paragraph** or **`⌘Enter`**, one undo. Inconsistent
  column counts or a missing delimiter stay text. No conversion inside a code block.
- **Paste**: a GFM table paste converts to a table (same parser).
- **Copy as Markdown**: the table only; escape `|` as `\|`, hard breaks as `<br>`, alignment row for
  aligned columns.
- **Width in Continuous**: the card keeps its max width; the table sits in an `overflow-x: auto`
  wrapper with `min-width: max-content` and a thin scrollbar. No card growth, no layout change.
  Page/PDF unchanged (they fit/scale columns).
- **Anchors in cells**: the existing text-anchor contract must keep working; if the cell geometry is
  a problem, note it as a follow-up, do not block.

## Out of scope

- Page/PDF layout, pagination, print model, PageTheme, PageChrome; no document `schemaVersion` bump.
- Settings, Continuous canvas geometry, sidebar, export defaults.
- Markdown import/export beyond the table parser; whole-block "copy as Markdown".
- Merged cells, column resize, table captions, headerless tables (GFM requires a header row).

## Files

Read: `apps/desktop/src/renderer/src/editor/extensions.ts`, `keymap.ts`, `DocumentEditor.tsx`,
`SelectionToolbar.tsx`, `lib/backspace.ts`, `page/PageBlockEditor.tsx`, `packages/core/src/*`,
`apps/desktop/src/renderer/src/styles.css`, the existing table/formula/code UI tests, and
`docs/design/special-text-lab.html`.

Expected to touch: the extensions/node views, keymap, styles, tests, and
`docs/reports/special-text-editing.md`.

## Acceptance criteria

- [ ] Fences: auto-close, idle/hover/editing states, editable opening fence, no menu, language only
      when set, copy on hover, exit via fence/↓/⌘Enter, one undo; Page/PDF neutral.
- [ ] Syntax colours in the editor, neutral in Page/PDF.
- [ ] Inline code toggle, Esc, selection wrap, `⇧`` literal, code-block literal.
- [ ] `$…$` and `$$…$$` input rules with guards; `$2*2$` renders; `$5 and $6` stays text.
- [ ] Formula double-click inline source; single click still selects; anchors still work.
- [ ] Table insert N×M, toolbar, Tab/Shift+Tab + append row, Enter hard break, inline-only cells,
      typed conversion (blank line/⌘Enter), paste conversion, Copy as Markdown, read-only source,
      Continuous inner scroll, Page/PDF unchanged.
- [ ] No schema/version, settings, Page/PDF, or export change; no fixed sleeps or native dialogs;
      existing assertions updated, none weakened.

## Tests and evidence

- Unit: input rules, table parser/serializer, cell normalisation, language parsing.
- UI: a new `special-text` suite (register in `tests/ui/suites.mjs`) covering A–D, plus the affected
  existing suites. One `npm run verify:fast`.
- Screenshots in `artifacts/special-text/`: code block idle/hover/editing with syntax colours;
  inline code; formula source; table toolbar/scroll/copy; Page/PDF neutral code.

## Stop and ask

Stop if the code node view breaks lowlight or the caret, if inline-only cells need a non-pure
migration, if the formula double-click conflicts with the anchor selection, if the table conversion
needs a general Markdown parser, or if a baseline test fails for an unrelated reason.

## Report format

- Summary mapped to A–D, files, checks with real timings, per-criterion pass/fail, risks, next step.
- One commit in the worktree; do not merge or push.
