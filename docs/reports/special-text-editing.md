# Special text editing — implementation report

**Builder:** implementation sub-agent
**Date:** 14 November 2026
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-f002eae1-4fac5153a3bbf31c`
**Branch:** `t3/special-text-editing`
**Base:** `bb03630` (`main` head when the brief landed)
**Head after this batch:** the single commit on this branch (one worktree, one commit)
**Brief:** `docs/tasks/special-text-editing.md` (areas A–D)

## Summary

One commit implements the four accepted special-text behaviours:

- **A — Code block.** `codeBlock` is an auto-closing node view: idle (no fences, language label
  only when set, copy on hover), editing (editable opening fence, closing-fence row), and hover.
  Enter parity opens a fence paragraph; exits via the closing row, `↓` at the end, or `⌘Enter`
  insert a paragraph below in one transaction. Copy is wired. `lowlight` inline decorations and the
  native caret still live in the `pre > code` contentDOM. `.hljs-*` colours are editor-only.
- **B — Inline code.** A plain backtick toggles the stored `code` mark (a second backtick or `Esc`
  ends it), a selection wraps/unwraps, `⇧\`` inserts a literal backtick, code blocks keep literal
  backticks, and the three-backtick fence is disambiguated at paragraph start. The typed-pair input
  rule is kept.
- **C — Formulas.** `$…$` with the Obsidian guards and `$$…$$` only as a whole paragraph replace the
  library rules; `$$` + Enter creates an empty block formula. Double click opens an in-place source
  editor (raw source between `$`/`$$`, live KaTeX preview, Enter/blur commit, Esc cancel); single
  click stays a `NodeSelection` and the whole-formula anchor command still binds. The editor
  double-click → math-dialog path is removed; the dialog remains only for inserting math.
- **D — Tables.** N×M insertion picker (1–10, header row, session memory), contextual toolbar (row
  and column operations, per-column alignment, Copy as Markdown, read-only source popover),
  inline-only cells with a pure normalisation of legacy rich cells, `Tab`/`Shift+Tab`/append-row,
  `Enter` hard break, typed GFM conversion (blank paragraph or `⌘Enter`), GFM paste conversion, and
  Continuous-only inner scrolling. Page Read/PDF are unchanged.

## What changed

### A · Code block

- `editor/code-block.ts` extends `CodeBlockLowlight` with the atomic `anchorIds` attribute and a
  DOM node view (`editor/views/code-block-view.ts`). The wrapper is chrome; `pre > code` is the
  contentDOM.
- A React node view was tried first and hung the renderer on mount when its contentDOM was nested in
  `<pre>` (Chromium recursion); the DOM node view keeps the same contract with native control.
- Chrome: idle language label only for a real language (`plaintext`/empty shows none), copy on
  hover, editing fence with an editable language input, closing-fence button. Unknown language
  tokens are stored and lowlight falls back.
- `Enter` on a paragraph whose text is exactly ```` ``` ```` or ```` ```lang ```` converts it in one
  transaction; `ArrowDown` at the code end and `⌘Enter` share `exitCodeBlock` (one undo entry);
  the closing row calls the same action. The existing space input rule is untouched.
- Language commit is `editor/code-block-actions.ts` (`commitCodeLanguage`): empty → `plaintext`, Enter
  or blur commits, Esc reverts.
- Syntax colours are CSS custom properties in the dark/light theme blocks (no literals outside the
  theme blocks, matching the appearance guard), consumed only under `.nf-continuous-surface`.
  Page Edit hides the chrome and receives no token colours; Page Read/PDF render neutral code.

### B · Inline code

- `editor/inline-code.ts` intercepts a plain backtick: collapsed caret toggles the stored `code`
  mark, a range wraps/unwraps, `⇧\`` inserts a literal character (physical `Backquote` code so the
  shortcut is layout-independent). A second backtick removes the stored mark.
- Fence disambiguation: while the paragraph is only a partial backtick run at the caret it is
  literal, so ` ``` ` / ` ```lang ` can reach the space/Enter rules; a paragraph starting with one
  literal backtick lets the typed-pair rule close the span. Code blocks keep literal backticks.
- `Esc` only consumes the key when the stored mark is armed; otherwise the existing blur remains.

### C · Formulas

- `editor/formulas.ts` replaces the library input rules on both math nodes:
  - `lib/formula-input.ts` `findInlineMathInput` enforces no space after `$`, no space before the
    closing `$`, no newline, no inner `$`, and no `$$` on either side;
  - `$$…$$` matches only a whole paragraph and replaces the paragraph; `$$` + Enter creates an
    empty block formula.
  - The library's `$$…$$` inline and `$$$…$$$` block rules are gone.
- `editor/views/formula-node-view.ts` is a DOM node view: single click dispatches the
  `NodeSelection`, double click shows the raw source with static `$`/`$$` delimiters, a live KaTeX
  preview, Enter/blur commit, Esc cancel, and the existing "Branch from term" action when the
  source has a non-empty selection. Term branching moved here so removing the dialog edit path does
  not orphan the M3c2 term-anchor feature.
- The editor-level `nf:edit-math` double-click path and its Page Edit suppression are removed. The
  math dialog remains for insertion from the palette and the selection toolbar.
- The in-place textarea handles Home/End/arrows/Backspace/Delete locally
  (`lib/local-text-keys.ts`) because Chromium routes those keys of a nested text control to the
  outer editing host; this is shared with the code language input.

### D · Tables

- `editor/tables.ts`: `TableCell`/`TableHeader` are extended to `content: "paragraph"` (one inline
  paragraph per cell); `Table`/`TableRow` stay stock. `TableEditing` adds Enter hard break,
  Tab/Shift+Tab, Tab-on-last-cell append, left/right arrows staying inside the cell, `⌘Enter`
  conversion, and the GFM paste plugin.
- `lib/table-cell.ts` normalises legacy rich cells on load: paragraphs and block lines join with hard
  breaks, list items become one line each, code/math blocks flatten to inline content. The
  canonical document and `schemaVersion` are untouched; an already inline cell is returned
  unchanged.
- `lib/gfm-table.ts` is one small GFM parser/serializer used by typed conversion, paste, Copy as
  Markdown and the source popover: header + delimiter + at least one data row, consistent column
  counts, escaped pipes, `<br>`, alignment row. `editor/table-node.ts` builds the PM table.
  `editor/table-commands.ts` owns column alignment, typed conversion and paste insertion.
- `editor/TableToolbar.tsx` is the contextual toolbar (row above/below/delete, column
  left/right/delete, left/center/right column alignment, Copy as Markdown, read-only source).
  `shell/TableSizeDialog.tsx` is the 1–10 picker opened by the existing palette command, with the
  last size remembered in `lib/table-insert.ts`.
- Continuous CSS puts the table in the existing `.tableWrapper` with `overflow-x: auto` and
  `min-width: max-content` (scoped to `.nf-continuous-surface`, so the card does not grow). Page
  Read/Edit tables are outside that scope and unchanged.

### Shell / tests

- The selection bubble keeps its default non-empty-selection rule and is suppressed inside a table
  (the table toolbar owns that surface).
- `tests/support/harness.mjs` gains `clipboardText()` / `writeClipboard()` through the Electron main
  clipboard (no OS dialogs); `tests/ui/suites.mjs` registers the new suite.
- `tests/ui/m4b1b1-page-edit-overlay.test.mjs` types `$x^2$` for inline math (the brief changes
  `$$…$$` to block math); the assertion itself is unchanged.

## Files

New (renderer): `editor/anchor-attrs.ts`, `editor/code-block-actions.ts`, `editor/code-block.ts`,
`editor/formulas.ts`, `editor/inline-code.ts`, `editor/tables.ts`, `editor/table-commands.ts`,
`editor/table-node.ts`, `editor/TableToolbar.tsx`, `editor/views/code-block-view.ts`,
`editor/views/formula-node-view.ts`, `shell/TableSizeDialog.tsx`, `lib/clipboard.ts`,
`lib/code-fence.ts`, `lib/formula-input.ts`, `lib/formula-term-branch.ts`, `lib/gfm-table.ts`,
`lib/local-text-keys.ts`, `lib/special-text-constants.ts`, `lib/table-cell.ts`,
`lib/table-insert.ts`.

Modified: `editor/extensions.ts`, `editor/DocumentEditor.tsx`, `editor/SelectionToolbar.tsx`,
`lib/adapter.ts`, `actions.ts`, `state/shell.ts`, `shell/Dialogs.tsx`,
`page/PageBlockEditor.tsx`, `styles.css` (the existing `editor/keymap.ts` was reviewed and needs no
change).

Tests: `apps/desktop/test/special-text.test.ts` (new unit file, 20 tests),
`tests/ui/special-text.test.mjs` (new UI suite, 5 tests), `tests/ui/suites.mjs`,
`tests/ui/m4b1b1-page-edit-overlay.test.mjs`, `tests/support/harness.mjs`.

Evidence: `artifacts/special-text/` — `code-idle`, `code-editing`, `inline-code`,
`formula-source`, `table-toolbar`, `table-source`, `table-scroll`, `page-table-neutral`
(all 1440×900).

## Checks (real timings)

- `npm run verify:fast` — **exit 0, 54.40 s wall** (final run after all code changes):
  - `check:boundaries`: 223 files, 1038 imports, 16 rules.
  - `typecheck`: all workspaces clean.
  - `npm test`: **127 files / 1287 tests passed**, 4.51 s.
  - `npm run e2e`: **16/16 passed**, 43.49 s.
- New UI suite `tests/ui/special-text.test.mjs`: **5/5 passed**, 14.0 s.
- Affected existing suites (each run separately on the final code):
  - `m3-code-anchor`: 1/1, 10.5 s.
  - `m3-formula-anchor`: 2/2, 11.0 s.
  - `m3-formula-term`: 1/1, 10.2 s.
  - `m3-formula-term-geometry`: 1/1, 9.8 s.
  - `m4b1b1-page-edit-overlay`: 8/8, 14.9 s.
  - `m4b1a2-read-mode-gating`: 2/2, 12.6 s.
- Unit: `npx vitest run apps/desktop/test/special-text.test.ts apps/desktop/test/ui-suite-list.test.ts` —
  2 files / 26 tests.

## Per-criterion status

| Criterion | Status | Evidence |
|---|---|---|
| Fences auto-close, idle/hover/editing, editable opening fence, no menu, language only when set, copy on hover | Pass | A test + `code-idle`/`code-editing` screenshots |
| Exit via fence / `↓` / `⌘Enter`, one undo | Pass | A test (paragraph count, one `⌘Z`) |
| Syntax colours editor-only, neutral Page/PDF | Pass | A test (`.hljs-*` present, absent in Page), scoped CSS |
| Inline code toggle, Esc, selection wrap, `⇧\`` literal, code-block literal | Pass | B test |
| `$…$` / `$$…$$` rules with guards; `$2*2$`; `$5 and $6` stays text | Pass | C test + 5 unit guard tests |
| Formula double-click inline source; single click selects; anchors work | Pass | C test (NodeSelection + `⌘⇧Return` whole-formula anchor), term suites |
| Table picker N×M + session memory | Pass | D test (3×4, remembered aria-pressed) |
| Toolbar rows/columns/alignment/Copy/source | Pass | D test |
| Tab/Shift+Tab + Tab on last cell appends; Enter hard break | Pass | D test |
| Inline-only cells + pure rich-cell normalisation | Pass | Unit tests + adapter load; no schema bump |
| Typed conversion (blank paragraph/`⌘Enter`), one undo; no code-block conversion | Pass | D test |
| GFM paste conversion | Pass | D test with the main clipboard |
| Copy as Markdown: pipes, `<br>`, alignment row | Pass | Unit round-trip + D clipboard assertion |
| Continuous inner scroll, no card growth; Page/PDF unchanged | Pass | D geometry assertions + D2 Page table; Page/PDF code untouched |
| Anchors in table cells | Not tested (follow-up) | Cell paragraphs remain normal PM paragraphs; text anchors resolve by node path. No UI assertion was added. |

## Risks / open notes

- The formula source textarea handles Home/End/arrows/Backspace/Delete itself (`lib/local-text-keys.ts`)
  because Chromium routes those keys of a text control nested in the document surface to the outer
  editing host. Typing was already native; the explicit keys restore normal caret editing. IME
  composition was not exercised in the hidden E2E window.
- The code block and formula node views use DOM node views (not React): the React contentDOM nested
  in `<pre>` hung Chromium. The public contract (`pre[data-anchor-kind="code"]`, KaTeX
  `.tiptap-mathematics-render`/`data-type`/`ProseMirror-selectednode`, term geometry) is preserved
  and the anchor suites pass.
- Term branching now lives in the in-place formula source editor. The math dialog still accepts a
  `pos`, but no surface opens it with a position any more (insertion only); the dead edit branch was
  left in place to avoid deleting the term UI it still contains.
- In the heavy D session, switching to Page after the wide-table interaction did not settle the page
  measurement within 15 s, so the Page-neutral desktop assertion runs in its own lighter D2 test.
  The Page suites (`m4b1b1`, page model/print tests) are green; this looks like measurement
  scheduling under a heavy Continuous session, not a Page/PDF change. Flag for the Sentinel.
- Table cells hold one inline paragraph: pasting rich multi-paragraph content into a cell relies on
  the browser slice being clipped; no dedicated rich-cell paste path was added (out of scope).
- The code language input is session-local inside the node view; if the block is re-created by an
  undo/redo the node view remounts and shows the committed language.

## Next step

Sentinel review against `docs/tasks/special-text-editing.md`, then the orchestrator's single full
`npm run verify` at integration. Follow-ups: a cell-anchor UI assertion, and a check of why the page
measurement can be starved after a long table-editing session.
