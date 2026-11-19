# Plan

No batch is committed. The product owner picks the next one from the lists below.

## Candidates

**Small, known fixes** (details in Known issues):

- Second structural undo entry on some Page Edit commits (4).

**v2 input, useful:**

- **Page width fill.** A post-placement pass, Page first: place the tree as today, then grow cards
  only into width that is already unused, and never force a wrap. Children and grandchildren first;
  a lone top-level may take the whole sheet, half or three quarters, content-driven; proportions
  follow text amount. It is a pre-pagination phase, so the page count may change; measure the
  showcase and the PDF gate before and after.
- Image crop editor and region re-pick.
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
3. **A rich-cell package that moves is not reconciled.** The Library shows it as unreadable, but it
   takes the corrupt-row shape, so moving it does not update recents. No file the app produces
   reaches this state.
4. **A Page Edit commit can add a second structural undo entry** when the continuous editor's buffer
   is dirty with a normalization. The honest fix is to fold the normalization into the same entry.
5. **`⇧Esc` inside the Page Edit overlay is inert.** `Esc` and `⌘⏎` commit; `Esc` from the page
   closes the find. Recorded so nobody restores a second chord.
6. **A read-only or locked note gets the Read-mode sentence** (D3, command surface). The refusal is
   right, the sentence is wrong; fixing it needs a new reason and approved copy.
7. **Fit page is enabled and inert outside Page** (D6, command surface). Keep or hide it in
   Continuous is a UX call.

## Open decisions

- **Manual break on a block the layout cannot honour:** warning (current preflight) or blocking
  error. Future UX; no code blocker.
- **Manual-break feedback in Continuous:** the block-menu item and the `Breaks` section already
  cover it; confirm and close.
- **Code palette:** closed by B2. Dark+ (5.00) and Light+ (4.59) pass per polarity; Monokai and One
  Light stay selectable and labelled.
