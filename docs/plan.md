# Plan

No batch is committed. The product owner picks the next one from the lists below.

## Candidates

**Small, known fixes** (details in Known issues):

- Page text selection ink in the dark theme (7).
- Library refresh button in the section header (8).
- Mixed-polarity code-theme chrome (3).
- Second structural undo entry on some Page Edit commits (5).

**v2 input, useful:**

- **Page width fill.** A post-placement pass, Page first: place the tree as today, then grow cards
  only into width that is already unused, and never force a wrap. Children and grandchildren first;
  a lone top-level may take the whole sheet, half or three quarters, content-driven; proportions
  follow text amount. It is a pre-pagination phase, so the page count may change; measure the
  showcase and the PDF gate before and after.
- **Page sibling gap setting.** Expose the 18 px Page `siblingGap` in Page → Advanced as a
  per-document override. Today one engine constant drives both the vertical gap between sibling
  cards and the horizontal parent→right-group corridor; decide whether the setting moves both or the
  two are split. The stored `PageTheme.siblingGap` (0–96) already exists but `pageLayoutOptions`
  ignores it. Because it moves the edge corridor and Page/PDF parity, an ADR must settle density
  behavior and the corridor rule before the UI.
- Image crop editor and region re-pick.
- **Formula selection toggle.** With text selected, `$` wraps it in an inline formula; with the
  formula selected, `$` unwraps it back to its LaTeX source, mirroring the backtick code toggle.
  Empty-caret `$…$` typing stays as today; trim the selected source, keep invalid LaTeX visible with
  its inline error, one undo step, and tests for wrap/unwrap plus prose containing `$`.
- **Inline marks and formulas in table cells.** The cell model is already one paragraph of inline
  content: bold/italic/code marks and inline math are representable, and Page/PDF already render
  them. The gap is the surface: the selection toolbar is hidden inside tables (the table owns its
  own toolbar) and the table toolbar has no formatting actions; GFM paste and export treat every
  cell as plain text, so imported/pasted tables flatten marks and `$…$`. Expose the formatting
  actions in the table context, parse and serialize inline marks/math per GFM cell, and keep block
  content refused (VH1). Cover Continuous, Page, PDF and Markdown round-trip.
- Math symbol/template palette.
- Markdown export.
- Drag a block onto another to indent/outdent (today drag only reorders).
- Drag files in the Library tree (today the Move dialog is the only path).
- Find & replace, in the sidebar Search only.
- Library-wide content search (only a name filter exists today).
- Multi-select blocks for bulk indent, move and delete.
- Export range (chapter or page range).
- Performance at 1,000 blocks and in large libraries.

**Deferred:**

- Agent command surface: no server and no tokens, but structured commands (a command file/inbox in
  the library, a CLI, or MCP-over-stdio) so an agent can build a forest itself. Needs an ADR and
  four answers first: operation schema, atomicity, live-lock behavior, delete policy. Nothing is
  built before them.
- iPad + Apple Pencil and in-app ink annotations. The renderer is Electron and there is no sync
  service; the cheap path for study is the existing PDF handoff.

## Known issues

1. **Empty child block has no floor** (deferred by the product owner). An empty child collapses to
   its drag handle and ports, so the block is hard to find. Fix when decided: a minimum card width
   in Continuous, scoped so Page measurement and print never move.
2. **1,000-block scroll p95 33.4 ms.** One long frame when the mount window advances. Acceptable.
3. **Mixed-polarity code-theme chrome.** `Light+` in a dark app leaves the dark fence and copy chip
   around a white code block; the reverse with `Monokai`. Cosmetic. One rule on the fence when the
   code theme's polarity differs from the app theme, or filter the picker by polarity.
4. **A rich-cell package that moves is not reconciled.** The Library shows it as unreadable, but it
   takes the corrupt-row shape, so moving it does not update recents. No file the app produces
   reaches this state.
5. **A Page Edit commit can add a second structural undo entry** when the continuous editor's buffer
   is dirty with a normalization. The honest fix is to fold the normalization into the same entry.
6. **`⇧Esc` inside the Page Edit overlay is inert.** `Esc` and `⌘⏎` commit; `Esc` from the page
   closes the find. Recorded so nobody restores a second chord.
7. **Page text selection is unreadable in the dark theme.** The global `::selection` uses near-white
   `--text-1`, while Page is fixed light paper. Scope selection inside `.nf-page-view` and the Page
   Edit prose to the paper ink and a paper accent tint, in both themes; add a CSS guard test.
8. **No refresh button in the Library header.** `refreshLibrary()` exists and the library menu
   carries Refresh, but the section header has no control. Add the same 28 px icon button used by
   Health, plus a test.
9. **The unified Read reason is clipped in the palette row** (command surface, 18 November 2026).
   The full string is in `data-palette-reason` and in the key/menu toast; the row needs a wrap or a
   tooltip.
10. **A read-only or locked note gets the Read-mode sentence** (D3, command surface). The refusal is
    right, the sentence is wrong; fixing it needs a new reason and approved copy.
11. **Fit page is enabled and inert outside Page** (D6, command surface). Keep or hide it in
    Continuous is a UX call.
12. **Heading markers are permanent.** Typing `# ` converts the block to a heading and consumes the
    marker; afterwards the heading has no editable `#` prefix, so returning to it cannot change the
    level or turn it back into a paragraph. The block type is effectively permanent and the level is
    hidden. Mirror inline code: while the caret is in the heading, show the `#`/`##`/`###` marker and
    let the user add or remove it to change the level or convert to paragraph, with no ambiguous
    in-between state. Keep the heading node as the only stored state (no marker text in the
    document), and cover typing `#`, returning to the heading, add/remove, and Page/PDF parity in the
    UI suite.
13. **A long formula does not trigger the full-width block.** Wide tables (and long code lines) can
    widen a card to the page content box through the unbreakable-content exception; a display formula
    wide enough to need it stays at the readable cap and can overflow or take a `content-too-wide`
    defect. Treat a formula wider than the cap like a wide table: expand the card to the available
    page width, never clip or shrink the formula, and keep Page/PDF parity. Cover a formula wider
    than `maxCardWidth` in the layout and PDF gates.
14. **Plain arrows can leave the block.** Two paths bypass the boundary guard:
    - A selected formula is a `NodeSelection`; `arrowStays` exempts every `NodeSelection` ("code
      blocks and tables own their keys"), so ArrowRight at the block end moves to the next block.
    - ArrowUp/ArrowDown at the first/last visual line are guarded only by document offsets
      (`parentOffset === 0` / `=== content.size`). A caret in the middle of the line is not at the
      paragraph start/end, so the native key leaves the block.
    Plain arrows must stay inside the block; crossing is the explicit `⌘↑`/`⌘↓` (already documented
    as previous/next block in Continuous). Narrow the `NodeSelection` exemption to code blocks and
    tables, compute the horizontal boundary from the selected node's end, and make the vertical guard
    line-aware (compare the caret line with the block content's first/last line). Add UI regressions:
    a formula at the block end, mid-word Up/Down on the first/last line, and `⌘↑`/`⌘↓` still
    navigating.

## Open decisions

- **Manual break on a block the layout cannot honour:** warning (current preflight) or blocking
  error. Future UX; no code blocker.
- **Manual-break feedback in Continuous:** the block-menu item and the `Breaks` section already
  cover it; confirm and close.
- **Code palette:** closed by B2. Dark+ (5.00) and Light+ (4.59) pass per polarity; Monokai and One
  Light stay selectable and labelled.
