# VF — release fixes: the Sentinel's S3s and the owner's visual pass

**Role:** Builder
**Milestone:** release fixes (last code batch before the tag)
**Base:** `main` at launch (Sentinel review merged at `3b22ad2`).
**Worktree:** created by the Orchestrator, branch `t3/vf-release-fixes`.
**Timebox:** 5 hours.

Seven small items from the v1-candidate review (`docs/reviews/v1-candidate-review.md`) and from the product
owner's visual pass. Each one is a claim we make that is not true yet; the batch makes them true. No layout,
pagination, document-format or print-model change.

## 1. S3-1 — Page Edit's commit keys go through the catalogue

`page/PageBlockEditor.tsx` hand-compares `event.key === 'Escape'` and `Enter` + meta/ctrl. That is a second
chord writer; B1's claim (and `ux.md` §9) is that the catalogue is the only one.

- Ask the catalogue. The `page-commit` entry already exists with `Escape` + `⌘⏎`; either split it into two
  ids (so the handler still knows the commit reason: `escape` vs `shortcut`) or pass the reason explicitly.
- A unit test must prove the key set comes from the catalogue: change the catalogue chord in the test and the
  handler follows (or the test asserts the exact chord list, and a source guard fails on a hand-written
  `event.key === 'Escape'` in that file).
- Behaviour unchanged: Escape commits with `escape`, `⌘⏎` with `shortcut`, `⌘S` still commits first.

## 2. S3-2 — Escape inside Page Edit must not also close the find

With the find open and the caret inside the Page Edit overlay, `Esc` commits the overlay **and** closes the
find: `App.tsx` runs the find-close branch before its `insidePageEdit` carve-outs. The overlay owns the key;
the find is a background surface and must not react.

- Move the `insidePageEdit` guard ahead of the find-close branch (the same way undo/save are carved out), so
  an Escape that originates inside `[data-page-edit-overlay]` never reaches the find.
- Test: open the find, open a block in Page Edit, press `Esc` → the overlay commits (one structural entry)
  and the find bar is still open with its query; a second `Esc` (now from the page) closes the find.

## 3. S3-3 — the anchor dot's hover contrast

The new 6 px dot rests at 7.41:1 (`--nf-page-warning-ink`) but its hover fill is
`--nf-page-warning-line` `#e2b766` — **1.88:1** on paper, below the 3:1 rule B2 set for every state.

- Give the hover a fill that clears 3:1 on white while staying visibly different from the rest (darken the
  line token for this use, or add a dedicated `--nf-page-anchor-dot-hover`).
- Unit test: parse the token from `styles.css`, compute the WCAG ratio against `#ffffff`, assert ≥ 3.0.
- Do not change the resting ink or the print (the dot never prints).

## 4. The arrowhead artefact (owner's visual pass)

Page Read and the PDF show a darker band running through the filled arrowhead, which at zoom reads as a
double arrow. Cause: the shaft (`opacity 0.88`) is drawn all the way to the **tip** and the head
(`opacity 0.95`) is translucent, so the shaft shows through the head; the head is also 5 % lighter than the
line.

- End the **rendered primary shaft** at the arrow base (`tip − direction × arrowLength`), so the head covers
  nothing; keep the model's route (and `data-page-edge-route`) intact. The reference chevron keeps its current
  geometry.
- Keep Page/print parity: both render through `PageEdges`; the m4c1 snapshot must still be identical.
- Test: the primary shaft path's last point is the arrow base (distance from the tip equals the arrow length)
  and the head and shaft composite to one colour (no darker band); a screenshot at 200 % of one edge in Page
  Read and the exported PDF.
- Do not change the edge widths, the arrowhead size, the colour tokens or the print palette.

## 5. The Library tree ignores the sidebar indent ladder (owner's visual pass)

`LibraryDocumentRow`/`LibraryFolderItem` use `6 + depth * 14` (folder at depth 1 = 20 px, documents at 34 px)
while the Outline/Health use the shared `sidebarDepthIndent` (level 1 = 6 px, level 2 = 18 px). With the
default root folder, documents lose 16 px and titles truncate.

- Use the shared ladder for the library too: folder depth 1 = 6, documents depth 2 = 18. Deeper folders keep
  a 12 px step (the vault can nest deeper than the Outline's 3-level cap); add an uncapped variant in
  `lib/sidebar-rows.ts` rather than a second formula in the component.
- Test: measured `padding-inline-start` for a folder row and a document row, and equality with the Outline at
  the same level; a depth-5 folder is further right than depth 4.
- No other geometry change; the row height and the 17..253 grid stay.

## 6. Page Edit → Continuous (owner's decision: A + B)

Today only Page **Read** jumps to Continuous (double-click/`↵`); in Page **Edit** both edit on the page, and
there is no direct jump.

- **A**: the Page card menu gains one navigation item, `Open in Continuous` → `openBlockInContinuous(blockId)`.
  The rest of that menu (page settings only) stays.
- **B**: `⌘2` (and the Continuous segment, one verb) carries the **selected block**: when switching Page →
  Continuous with a block selected, select it, switch, focus and scroll to it. No selection → current
  behaviour. The layout switch still commits a pending Page Edit first.
- Page Read keeps single-click selection and double-click/`↵` → Continuous; Page Edit keeps double-click/`↵`
  → the overlay.
- Tests: the menu item switches and focuses; `⌘2` from Page Edit and Page Read focuses the selected block;
  no selection keeps the current scroll/focus behaviour; the segment and the key do the same thing.

## 7. S4-2 — the stale-lock takeover and the rich-cell guard (only if trivial)

`takeOverStaleLock` (`main/library.ts`) opens a package without the rich-cell guard that `openStore` runs
before `repository.open`. Unreachable without an external writer, but the same judgement should refuse there
too. If it is a one-line reuse of the core predicate before the open, do it and test it; if it needs a
restructure, record it and move on.

## Out of scope

- Any change to the paginator, the page model, the print model, the document schema or settings schema.
- The known issues (empty child floor, 1,000-block frame, mixed-polarity chrome, rich-cell move
  reconciliation).
- Release mechanics (icon, electron-builder, version) — the Orchestrator's next block.
- New shortcuts, new settings, new UI beyond the one card-menu item.

## Files

Read: `docs/reviews/v1-candidate-review.md` (the findings and reproductions), `page/PageBlockEditor.tsx`,
`App.tsx`, `styles.css` (page warning tokens, edge classes), `page/PageEdges.tsx`,
`packages/layout/src/edge-path.ts`, `shell/Sidebar.tsx` (library rows), `lib/sidebar-rows.ts`,
`actions.ts` (`openPageCardMenu`, `openBlockInContinuous`, `setActiveDocumentLayout`), `lib/shortcuts.ts`,
`main/library.ts` (stale-lock takeover).

Expected to touch: those files, their unit/UI tests, and the report `docs/reports/vf-release-fixes.md`.

## Acceptance criteria

- [ ] Page Edit commit keys come from the catalogue; a unit/source guard proves it; behaviour unchanged.
- [ ] `Esc` inside Page Edit commits only; the find stays open; `Esc` from the page still closes it.
- [ ] The anchor dot's hover clears 3:1 on paper (computed), resting unchanged.
- [ ] The primary arrowhead shows no darker band; Page and print identical; widths/size/colours unchanged.
- [ ] Library folder 6 px / document 18 px, equal to the Outline at the same level; deep folders keep stepping.
- [ ] The Page card menu has `Open in Continuous`; `⌘2` from Page carries the selected block; the segment
      does the same; no selection → unchanged.
- [ ] No page count, card box, print model, schema or settings change.

## Tests and evidence

- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group page --concurrency 2`, `--group shell`,
  `node --test tests/ui/m4c1-print-compositor.test.mjs tests/ui/m4b1b1-page-edit-overlay.test.mjs
  tests/ui/find-bar.test.mjs`.
- End of task: `npm run verify:fast`. Do not run `npm run verify`.
- Screenshots in `artifacts/vf-release-fixes/`: the arrow at 200 % in Page Read and in the exported PDF, the
  Library rows before/after, the Page card menu, the `⌘2` jump (Page → Continuous on the selected block), and
  the anchor dot hover.

## Stop and ask

- if ending the shaft at the base changes the print snapshot beyond the path itself (say where);
- if `⌘2` carrying the block conflicts with the pending Page Edit commit (the commit must win, and a rejected
  commit must keep both the overlay and the layout);
- if the uncapped library ladder would break the depth cap guard the sidebar tests assert.

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, the arrow before/after evidence, risks,
next step. One commit; do not merge.
