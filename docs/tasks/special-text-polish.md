# Special text polish — arrows, tables, formulas, inline code

**Role:** Implementer / Builder
**Milestone:** Special text follow-up (product-owner review)
**Base:** `main` head at delegation (includes this brief)
**Worktree:** created by the delegate from that base; do not work in the main checkout
**Timebox:** 1.5 days

## Context

The special-text batch (`f6fcb65`) is merged and the product owner reviewed it. This brief fixes the
issues he found. The current behaviour and the agreed changes are below; do not re-open the design.

## A. Code block chrome

- The language label (`PYTHON`, uppercase kept) stays **top-right, always visible in idle**. It may
  overlap the first code line; that is accepted — no gutter, no extra top padding.
- The **Copy** button is **not** shown idle or on hover. It appears **only in editing**, in the
  opening-fence row next to the language input (or the closing row if that reads better). Remove the
  hover copy and the idle copy.
- Keep `data-code-action="copy"` for the editing copy; update the tests that asserted hover copy in
  idle.

## B. Arrow keys stay inside the block

- Like Backspace, plain arrow keys must not leave the block:
  - `ArrowUp`/`ArrowLeft` at the very start of the block body are consumed;
  - `ArrowDown`/`ArrowRight` at the very end are consumed;
  - the caret does not move to a neighbouring block.
- Exceptions (return false, let the owner handle): inside a code block (`CodeBlockKeys` has the
  explicit exit), inside a table (`TableEditing` owns the cell keys), and while the formula source
  editor is open (the textarea handles its own keys). Do not break the code block's ArrowDown exit.
- Block navigation remains `⌘↑/⌘↓`, click, and the outline. Add a UI test: two blocks, caret at the
  end of the first, ArrowDown/Right → the first block stays selected and the caret stays; `⌘↓` still
  moves to the next block.

## C. Tables

- Add **Insert table…** to the block context menu (same `{ kind: 'table-size' }` dialog as the
  palette).
- Do **not** add paragraph checkboxes to the insert dialog. Instead, the **table toolbar** gets two
  actions: **Paragraph above** and **Paragraph below**. Each inserts one paragraph immediately
  before/after the table in the same block body and puts the caret in it; one undo. They are enabled
  also when a paragraph already exists (adds another).
- With no paragraph before/after, the caret stays in the table (the arrow isolation must not jump
  blocks; the table's own keys handle the cells).
- The table toolbar redesign (it is long and moves with the cell) is **out of scope**; keep the
  current BubbleMenu and add the two buttons with labels/aria. Note it as a follow-up.

## D. Block context menu

- Rename **Focus block** to **Edit block** (it puts the caret in the block: `runtime.focusBlock`).
- Regroup/reorder the entries without changing behaviour:
  - **Block**: Edit block, Insert image…, Insert table…, Add child, Add sibling.
  - **Structure**: Split at caret, Merge with previous, Link as reference…, Demote/Detach.
  - **Position**: Move to…, Move up, Move down, Outdent, Collapse/Expand.
  - **Anchors/References**: the existing entries.
  - **Delete block…**.
- Keep separators and danger styling. Update tests that assert menu labels/order.

## E. Formulas

- **Selection outline stays anchor-only** (do not add it to non-anchored formulas). The dashed
  outline remains `.nf-formula-anchor.ProseMirror-selectednode`.
- **One rectangle, no fragmentation**: the inline formula node is currently an inline element, so
  its outline follows line-box fragmentation. Make the inline formula node a single
  `inline-block` (vertical alignment tuned) so the outline is **one rectangle around the formula's
  full rendered box** (its maximum height/width). No fixed pixel height, no scaling; the rectangle
  dimensions come from the formula. Block math already renders one box.
- **Idle-anchor** (a formula with `anchorIds` but no branch) is a real state; the future anchor
  health panel will list broken/hidden/idle anchors. **Out of scope**; do not clean anchors.
- **Caret disappearing**: reproduce with an anchored formula; when the source editor is open, hide
  the formula-term highlight/marker layer and ensure the textarea keeps focus (the current term
  layer/toolbar can overlay it). Suppress the general selection toolbar (B/I/link) for a formula
  `NodeSelection` — the formula action row owns the actions. Test that double click focuses the
  source textarea and typing works.
- **Action row**: while the source editor is open, show one stable row with three commands:
  **Branch from term** (disabled until a non-empty LaTeX term selection), **Copy formula**,
  **Inline/Block**. The row is part of the editor chrome; it must not change the block width when a
  term is selected.
  - **Copy formula** writes the source with delimiters: `$…$` for inline, `$$…$$` for block.
  - **Inline/Block** converts the node type (`inlineMath` ↔ `blockMath`) at the current position,
    one transaction/undo, keeping the latex; re-render and keep the editor open.
  - Paste: a pasted `$…$`/`$$…$$` string becomes the corresponding formula node (paste rule), not
    plain text.
- Do not change the `$…$`/`$$…$$` input rules or the single-click `NodeSelection` contract.

## F. Inline code (Obsidian live preview)

- **Bug**: in `editor/inline-code.ts`, `event.preventDefault()` is called before the early returns;
  when the paragraph is `` `ciao `` the handler returns false (let the typed-pair input rule run)
  but the default was already prevented, so the closing backtick is never inserted. Move
  `preventDefault()` after the early-return checks (or insert the backtick explicitly) so the typed
  pair works.
- **Delimiters at the caret**: add a ProseMirror plugin (decoration widgets) that, when the
  selection is inside a `code` mark range, shows `` ` `` widgets at the start and end of the range;
  when the caret leaves, the widgets disappear (rendered chip); when it returns, they reappear. This
  is the Obsidian live-preview behaviour on the existing mark (the mark stays canonical; no literal
  backticks in the document).
- The mini menu code button applies/removes the mark; entering the chip shows the delimiters, so
  words can be added inside. Remove no test coverage; add tests for: typed pair, caret-in shows
  delimiters, caret-out hides, mini menu mark shows delimiters when entered, `⇧`` literal backtick.
- Keep `⇧`` as the literal backtick. The “two backticks then fill in between” flow is not required:
  entering the chip is the way.

## G. Selection toolbar link state

- `SelectionToolbar` keeps `linkOpen` after the bubble hides. Reset `linkOpen`/`href` when the
  bubble hides or the selection changes, so a new double click starts from the buttons. Add a test:
  open the link form, click outside, re-open the bubble → the buttons, not the link form.

## Out of scope

- Table toolbar redesign (keep the current BubbleMenu; add the two paragraph actions).
- Anchor health panel (broken/hidden/idle anchors).
- Showcase document, settings, Page/PDF, schema, export.
- The history-entry fix and the special-text batch; do not change them.
- Full `npm run verify` (the Orchestrator runs it at UI concurrency 4).

## Files

Read: `apps/desktop/src/renderer/src/editor/keymap.ts`, `editor/views/BlockViews.tsx`,
`editor/DocumentEditor.tsx`, `editor/SelectionToolbar.tsx`, `editor/TableToolbar.tsx`,
`editor/tables.ts`, `editor/table-commands.ts`, `editor/views/formula-node-view.ts`,
`editor/inline-code.ts`, `editor/code-block.ts`, `editor/views/code-block-view.ts`, `actions.ts`,
`styles.css`, the `tests/ui/special-text.test.mjs` suite and the formula/anchor/table suites.

Expected to touch: those modules, their tests, and `docs/reports/special-text-polish.md`.

## Acceptance

- [ ] Code label top-right idle; Copy only while editing; no hover copy; tests updated.
- [ ] Plain arrows do not leave the block (body start/end); code/table/formula exceptions;
      `⌘↑/⌘↓` still navigate.
- [ ] Insert table in the block menu; table toolbar Paragraph above/below inserts and focuses a
      paragraph, one undo; no block jump.
- [ ] Menu “Edit block” + grouped order; no behaviour regressions.
- [ ] Formula outline anchor-only, one rectangle around the full formula (inline-block), block math
      unchanged; source editor keeps focus; action row with Branch/Copy/Inline-Block; copy with
      delimiters; paste creates a formula; inline↔block conversion.
- [ ] Inline code closing backtick works; delimiters appear while the caret is inside and disappear
      outside; mini menu mark shows delimiters when entered; `⇧`` literal.
- [ ] Link form resets on hide.
- [ ] No schema/settings/Page/PDF/showcase change; no fixed sleeps/native dialogs; existing
      assertions updated, none weakened.

## Tests and evidence

- Targeted unit: inline-code keymap/pair, formula copy/convert/paste, table paragraph insertion,
  arrow boundary helper.
- UI: update/extend `tests/ui/special-text.test.mjs`; run the formula/anchor/table/read-mode suites;
  one `npm run verify:fast`.
- Screenshots in `artifacts/special-text-polish/`: code idle/editing, formula selection rectangle
  (tall fraction), action row, table paragraph buttons, inline-code delimiters, link reset.

## Report

- Summary A–G, files, checks with timings, per-criterion pass/fail, risks, next step.
- One commit in the worktree; do not merge or push.
