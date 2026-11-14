# Special text polish — implementation report

**Role:** Implementer / Builder
**Date:** 14 November 2026
**Base:** `main` head `d1bf632` (adds `docs/tasks/special-text-polish.md`)
**Deliverable:** one worktree, one commit, no merge/push

## Summary

### A — Code block chrome

- The language label is the only idle chrome: top-right, `data-code-label`, visible
  whenever a language is set. It may overlap the first line; no gutter or extra top
  padding was added.
- `Copy` moved into the opening-fence row next to the language input. It exists only
  while the node view is in `data-code-state="editing"`; idle and hover no longer
  reveal it. `data-code-action="copy"` is unchanged.
- Removed the opacity/hover CSS and the idle header copy. Page Edit still hides the
  whole fence chrome (same selector), so the copy cannot leak into Page Edit.

### B — Arrow keys stay inside the block

- New pure helper `lib/arrow-boundary.ts`: `ArrowUp`/`ArrowLeft` at block-body start
  and `ArrowDown`/`ArrowRight` at block-body end return `stay`; every other position
  is `native`.
- `BranchKeymap` registers the four plain arrows. Code blocks and tables are atomic
  exceptions (code keeps its `ArrowDown` exit, tables keep their cell keys), the
  formula source textarea is excluded through the focused `INPUT`/`TEXTAREA` guard,
  and a node selection stays native.
- The boundary is read from the **live DOM caret** when it is inside the editor. The
  editor state can lag a native `⌘←`/`⌘→`; consuming the next arrow against the stale
  state trapped the caret. If the DOM caret and editor state are in different blocks,
  the key stays native instead of consuming from the wrong block. `⌘↑/⌘↓`, click and
  the outline remain the block navigation.
- Added `B2` UI coverage: two blocks, end-of-block consumed, start-of-block consumed,
  `⌘←` + `ArrowRight` moves natively, `⌘↓` still navigates.

### C — Tables

- `Insert table…` added to the block context menu. It focuses the block that opened
  the menu (`runtime.focusBlock`) and opens the same `{ kind: 'table-size' }` dialog
  as the palette, so the table lands in the intended block.
- The size dialog keeps no paragraph checkboxes.
- The table toolbar gained `¶ Above` / `¶ Below` (`data-action="paragraph-above"` /
  `"paragraph-below"`, aria labels “Paragraph above/below”). Each inserts one empty
  paragraph before/after the table in the same block body, moves the caret into it,
  and is one transaction/undo. Both stay enabled when a paragraph already exists.
- Unit-tested through a pure `paragraphAroundTableTransaction`; UI-tested end to end
  with one-undo removal and no block jump.

### D — Block context menu

- `Focus block` is now `Edit block` with the same `runtime.focusBlock` behaviour.
- Entries are grouped with separators: **Block** (Edit block, Insert image…, image
  actions, Insert table…, Add child, Add sibling), **Structure** (Split, Merge, Link
  as reference…, Demote/Detach), **Position** (Move to…, Move up/down, Outdent,
  Collapse/Expand), **Anchors/References**, **Delete block…**. No behaviour changed.
- Updated `m3f1` and Read-mode gating tests; added a menu-order/Insert-table UI test.

### E — Formulas

- Inline formula node is a single `inline-block` (`vertical-align: middle`). Its box
  is the formula's full rendered width/height; no fixed size and no scaling. The
  selection outline remains anchor-only (`.nf-formula-anchor.ProseMirror-selectednode`)
  and is therefore one rectangle. Block math is unchanged.
- While the source editor is open, `:has(.nf-formula-node-editing)` hides the
  formula-term and anchor-marker layers in that block, so they cannot cover the
  textarea. The textarea keeps focus; copy restores it after the clipboard fallback.
- The formula `NodeSelection` is excluded from `SelectionToolbar`; it is also hidden
  whenever a source editor is open. The general B/I/link toolbar no longer stacks on
  a formula.
- The source editor has one stable action row: **Branch from term** (disabled until
  a non-empty LaTeX term selection), **Copy formula**, and **Inline/Block**. The row
  is built once, so selecting a term never reflows the block.
  - Copy writes `$…$` for inline and `$$…$$` for block, from the current draft.
  - Inline/Block converts `inlineMath` ↔ `blockMath` with the draft LaTeX in one
    transaction/undo; the new node view reopens the source editor at the target
    position. Inline→block splits the host paragraph only when text surrounds the
    formula and is rejected inside a table cell (inline-only).
- Paste rule: a plain-text paste that is exactly one `$…$` or `$$…$$` creates the
  corresponding formula node. Inline replaces the selection in the same textblock;
  block replaces an empty paragraph or lands after the current paragraph with a
  paragraph below. Code blocks, mixed text, and block pastes mid-paragraph stay
  plain. Input rules and the single-click `NodeSelection` are unchanged.

### F — Inline code live preview

- Fixed `inline-code.ts`: `preventDefault()` now runs only on paths that insert
  literally; the typed-pair path returns before it, so the closing backtick reaches
  the input rule. `⇧\`` remains the literal character.
- New decoration plugin shows a `` ` `` widget at both ends of the contiguous
  `code`-mark range while the collapsed caret is inside it; moving out removes the
  widgets and the normal chip remains. The mark is still canonical; no backtick is
  stored. Range detection is a pure helper (`lib/inline-code.ts`) with unit tests.
- The mini-menu code button still applies/removes the mark; entering the chip then
  shows the delimiters.
- UI coverage: typed pair, delimiters in/out, mini-menu mark, literal backtick; the
  old “no backtick in the text” assertion now strips the editor-only widgets.

### G — Selection toolbar link state

- `SelectionToolbar` resets `linkOpen`/`href` on every selection change and on the
  bubble `onHide` (memoised `options`). A new bubble always starts from the buttons.
- UI test: open the link form, click outside, re-select → the buttons, not the form.

## Files

Source:

- `apps/desktop/src/renderer/src/editor/keymap.ts`
- `apps/desktop/src/renderer/src/editor/inline-code.ts`
- `apps/desktop/src/renderer/src/editor/formulas.ts`
- `apps/desktop/src/renderer/src/editor/SelectionToolbar.tsx`
- `apps/desktop/src/renderer/src/editor/TableToolbar.tsx`
- `apps/desktop/src/renderer/src/editor/table-commands.ts`
- `apps/desktop/src/renderer/src/editor/views/code-block-view.ts`
- `apps/desktop/src/renderer/src/editor/views/formula-node-view.ts`
- `apps/desktop/src/renderer/src/actions.ts`
- `apps/desktop/src/renderer/src/styles.css`
- New libs: `lib/arrow-boundary.ts`, `lib/formula-clipboard.ts`, `lib/formula-convert.ts`,
  `lib/formula-paste.ts`, `lib/inline-code.ts`

Tests:

- New unit: `apps/desktop/test/arrow-boundary.test.ts`,
  `formula-clipboard.test.ts`, `formula-transactions.test.ts`,
  `inline-code-range.test.ts`, `table-paragraph-insertion.test.ts`
- UI: `tests/ui/special-text.test.mjs` (A updated, B extended, B2/D3/G/E added,
  D extended), `m3-formula-anchor.test.mjs`, `m3-formula-term.test.mjs`,
  `m3f1-split-merge.test.mjs`, `m4b1a2-read-mode-gating.test.mjs`
- Support: `tests/support/ui-session.mjs` (`selectRange` waits for the enabled term
  action)

Report: this file.

## Checks and timings (real)

- `npm run verify:fast` — **exit 0**, 54.8 s wall.
  - boundaries: 228 files, 1057 imports, 16 rules.
  - typecheck: desktop node/web, core, layout, pdf — clean.
  - unit: 132 files / 1314 tests, 4.81 s.
  - e2e: 16/16, 43.1 s (build included).
- `node --test tests/ui/special-text.test.mjs` — 9/9, 18.6 s.
- `node tests/ui/run.mjs --group anchors --concurrency 3` — 13/13, 52.2 s.
- `node tests/ui/run.mjs --group page --concurrency 3` — 16/16, 73.8 s
  (Read-mode gating, Page Edit overlay, Page view, M4c print/export/PDF gate).
- Targeted unit runs while working (arrow boundary, inline-code range, formula
  clipboard/convert/paste, table paragraph): 53/53 in 0.35 s (first combined run).
- Screenshots in `artifacts/special-text-polish/`:
  `code-idle-1440x900.png`, `code-editing-1440x900.png`,
  `formula-selection-rect-1440x900.png`, `formula-action-row-1440x900.png`,
  `table-paragraph-actions-1440x900.png`, `inline-code-delimiters-1440x900.png`,
  `link-reset-1440x900.png`.

## Acceptance

| Criterion | Status | Evidence |
| --- | --- | --- |
| Code label top-right idle; Copy only editing; no hover copy | PASS | A UI test, `special-text` A; screenshots idle/editing |
| Plain arrows do not leave the block; code/table/formula exceptions; `⌘↑/⌘↓` still navigate | PASS | `arrowBoundaryAction` unit + B2 UI + e2e text-anchor |
| Insert table in the block menu; Paragraph above/below inserts and focuses, one undo, no block jump | PASS | D3 menu/insert test; D paragraph actions + unit transaction test |
| “Edit block” + grouped order; no behaviour regression | PASS | D3 ids/labels; anchors group 13/13; Read-mode gating |
| Formula outline anchor-only, one rectangle (inline-block); source keeps focus; action row Branch/Copy/Inline-Block; copy delimiters; paste; conversion | PASS | E UI metrics/outline/action row/clipboard/convert/undo/paste; formula transaction unit tests |
| Inline code closing backtick; delimiters in/out; mini-menu mark; `⇧\`` literal | PASS | B UI + inline-code range unit tests |
| Link form resets on hide | PASS | G UI test |
| No schema/settings/Page/PDF/showcase change; no fixed sleeps/native dialogs; existing assertions updated, not weakened | PASS | Diff contains no schema/settings/Page/PDF files; no new sleeps; updated assertions cover the same behaviour through the new contract |

## Updated existing assertions

- `m3-formula-anchor`: the general toolbar is deliberately suppressed for a formula
  `NodeSelection`; the same branch command is exercised through `⌘⇧Enter` (twice),
  keeping the reuse/undo/reload assertions.
- `m3-formula-term`: the stable row means Branch from term is present but disabled
  before a term selection, instead of absent.
- `m3f1` and Read-mode gating: `Focus block` → `Edit block`; Read mode also asserts
  `Insert table…` is disabled.
- `special-text`: idle assert is “no visible copy + hover keeps it hidden”; the
  “no backtick in text” check strips editor-only delimiter widgets.

## Risks and follow-ups

- **Table toolbar silhouette** is unchanged by design (long BubbleMenu that can
  cover a header cell). The new paragraph actions use the same bar; the redesign is
  still the agreed follow-up. Tests click a body cell to avoid the overlay.
- **Conversion and anchors:** Inline→block keeps `anchorIds`, but splitting the host
  paragraph changes node paths; an existing path-based term/whole binding can become
  broken after conversion. The brief did not require anchor-safe conversion; list it
  for the anchor-health follow-up.
- **Clipboard fallback focus:** the non-secure-context fallback creates a temporary
  textarea, which steals DOM focus. Formula copy now suppresses the blur-commit and
  restores the caret; code copy has no blur-commit path. A shared focus-preserving
  clipboard helper is a possible cleanup.
- **Inline-code widgets in Continuous Read:** the decoration is driven by the
  collapsed caret, not editability. Read mode normally has no caret until a click;
  if a caret lands inside a code mark there, the delimiters can appear. Not addressed
  because the brief scoped the live preview to authoring.
- **Arrow isolation and native shortcuts:** the handler now trusts the live DOM caret
  and refuses to consume when the DOM caret is in a different block than the editor
  state. This is deliberate (avoids the `⌘←` stale-state trap) and covered by B2 and
  the e2e text-anchor flow.
- **No full `npm run verify`** was run, per the brief. The Orchestrator should run it
  at UI concurrency 4.
- No schema, settings, Page/PDF, export, showcase, anchor-health or history-fix
  changes were made.

## Next suggested step

1. Orchestrator: one full `npm run verify` at UI concurrency 4; then a targeted
   Sentinel review of this diff/report.
2. Product owner: visual check of the seven screenshots (code idle/editing, formula
   selection rectangle/action row, table paragraph actions, inline-code delimiters,
   link reset).
3. Follow-ups: table toolbar redesign, anchor-safe inline↔block conversion (or an
   explicit warning), and the already-planned anchor-health panel.
