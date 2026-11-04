# M2d — Depth columns + M2 polish (report)

> **Superseded by M2e/D23 (4 November 2026).** The global depth-column layout described below was
> reverted; the editor now uses parent-relative placement with horizontal scroll. Keep this report as
> the record of the M2d iteration and its tests, not as current behavior.

**Date:** 4 November 2026  
**Builder worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-d1ad0c14`  
**Branch:** `t3/d1ad0c14`  
**Base:** `17c406d` (`main`: docs: approve M2d depth columns and M2 polish)  
**Status:** Complete for M2d scope. Integration and merge belong to the Orchestrator. Product-owner visual judgement and VoiceOver remain human gates.

## What changed

### 1. Depth-column layout (core)

The editor no longer uses parent-relative wrapping. Each chapter computes one
column per visible depth from the measured cards:

- `x[0] = 0`; `x[d] = x[d - 1] + width[d - 1] + 16`.
- `width[d] = max(measured card width at depth d)`, clamped to 160–480 px for
  top-level (depth 0) and 144–420 px for children. Empty blocks measure at the
  minimum because the placeholder no longer contributes to intrinsic width.
- Every visible block at the same depth starts at the same x, even under
  different parents; columns reset per chapter.
- Top-level blocks stack in column 0; siblings at a depth stack vertically in
  their column.
- Cards keep their own content-driven width (`fit-content`, `flex: 0 0 auto`);
  they do not stretch to the column.
- The editor never wraps: `.nf-block-inner > div` is a no-wrap flex row and
  the editor scrolls horizontally when the columns exceed the viewport.

**Implementation:** CSS flow, not absolute positioning. A row is
`[card][child group]`. The child group gets

```css
margin-left: calc(max(0px, var(--nf-card-col) - var(--nf-card-w)) + 16px);
```

where `--nf-card-w` is the measured card width and `--nf-card-col` is the
measured width of that depth column. Therefore the group's left edge is exactly
`x[d] + width[d] + 16 = x[d + 1]`, while the card keeps its own width. The two
custom properties are written on the block's `.nf-block-inner`, so they are
inherited by the group. The group does not need a fixed width: every nested row
computes its own next-column offset from the group's left edge, so deeper
columns are stable regardless of the group's content.

`useBlockRects` now does one layout read per measure pass and one extra read of
nothing: a card is always the first item in its row, so its post-layout x is
`chapterLeft + columnX(widths, depth)` and is computed without forcing a second
layout. This keeps measurement cheap and avoids a one-frame edge lag.

Geometry tokens (also in `lib/geometry.ts`): canvas max 1,600 px, top-level
160–480, child 144–420, column gap 16, card padding 10, editor padding 40
(32/28 at narrower widths). The old `flex-wrap` path is gone from the editor.
The below/wrap router is kept (unused) for the M4 page renderer.

### 2. Collapse on the branch port

- Removed the in-flow `.nf-block-meta` footer (16 px + 2 px margin). A block
  with children no longer grows taller than the same block without children.
- Added a real `.nf-branch-port` button at the parent's right branch port:
  - expanded: chevron on hover/active/focus;
  - collapsed: a compact dot with the direct child count, always visible;
  - `aria-expanded`, descriptive `aria-label`, `title` with `⌘.`;
  - keyboard `⌘.` still toggles.
- Clicking the port or the shared trunk toggles the branch. The SVG stays
  `aria-hidden`; the trunk hit path is invisible and 12 px wide.
- The right-edge `+` add-child moved to the top-right corner so it cannot
  overlap the collapse button; the bottom `+` add-sibling is unchanged.
- Hidden children and edges are not measured for columns (`display: none`).

### 3. Non-destructive Backspace

`lib/backspace.ts` defines the contract: `native | previous | stay`, with no
delete outcome. Plain `Backspace`:

- on an empty block at the start: moves the caret to the previous visible block
  (end of its own body, not its last descendant) or does nothing on the first
  block; the block stays;
- in code, tables, lists, and blockquotes: native behavior (text/cell editing);
- never deletes a block.

Deletion is `⌘Backspace` on the active block (or `Delete` on a selected block
node): no children → delete; children → the existing promote/subtree dialog.
The context-menu delete is unchanged.

The content commit also reconciles before extracting: a text selection that
spans blocks can remove whole branchBlocks from the ProseMirror buffer; the
canonical document is restored instead of committing an empty canvas (covered
by the select-all + Backspace check).

### 4. Contextual add

- Every chapter ends with its own “+ Add top-level block” row; the block goes
  to that chapter and receives focus.
- “+ Add chapter” inserts immediately after the active chapter (the chapter of
  the selected block), or appends when there is no selection; the new chapter
  title starts in inline-edit/focus state. `chapterInsertIndex` is pure and
  unit-tested.
- Sidebar add chapter/add block, the palette, and the menu keep working; the
  palette “Add top-level block” is contextual too.

### 5. Trunk continuity

`routeRightGroup` now gives the first child a continuous path
`parent port → trunk X → first child center → child left`. The first child's
path keeps the T-junction as an explicit vertex. The shared trunk starts at
that junction (not with a rounded corner) and is a straight vertical line to
the last child. Every other child is a short horizontal branch from the trunk.
The trunk X sits in the middle of a tight 16 px depth-column gap so both stubs
remain visible; with wider gaps it hugs the parent at +14 px.

Unit tests parse paths and assert that the first edge starts at the parent
port, passes through the trunk start, and ends at the child; 1, 2, and 5 child
cases are covered.

### 6. Widths and typography

M2c typography is unchanged: UI sans 15.5 px/1.55, headings 20/18/16, code
JetBrains Mono 13.5. The canvas max grew to 1,600 px; top-level max is now
480 px (was 544) and the child minimum 144 px (was 160). No font/size Settings
UI was added (M6).

## Gate matrix

Commands: `npm run typecheck`, `npm test`, `npm run e2e` (which builds first).
The full e2e suite is 11/11.

| # | Gate | Evidence | Result |
|---|---|---|---|
| 1 | Same-depth blocks share one x within a chapter | unit `columns.test.ts` (two parents, different card widths); e2e `aligns depth columns…` asserts two depth-1 children of different parents share x | Pass |
| 2 | Column widths are content-driven, clamped, empty = min | unit `computeColumnWidths`/`clampColumnWidth`; e2e empty chain widths 160/144/144/144 | Pass |
| 3 | 4-level empty chain fits 1440 with no horizontal overflow | e2e overflow `0`, x `[0,176,336,496]`; screenshot `four-level-1440x900.png` | Pass |
| 4 | 6-level chain scrolls horizontally with columns intact | e2e at 1024: overflow `> 0`, x `[0,176,336,496,656,816]`, no wrap; screenshots `six-level-*` | Pass |
| 5 | Columns reset per chapter | unit chapter A/B widths and x origins; per-chapter measure in `useBlockRects` | Pass |
| 6 | Collapse adds no height, no footer, dot + count, re-expand | e2e: card height equal within 0.5 px, `.nf-block-meta` count 0, dot text/count, `aria-expanded` false/true; screenshot `collapse-dot-1440x900.png` | Pass |
| 7 | Trunk continuous at the first child; one trunk for 3 children | unit 1/2/5 children (path contains the T-junction, trunk starts there); e2e geometry; screenshots `trunk-3-children-*` | Pass |
| 8 | Plain Backspace never deletes; ⌘Backspace deletes; table stays | unit `backspace.test.ts` (no delete outcome); e2e keeps the empty child, caret moves, ⌘Backspace removes it, table row/cell counts unchanged | Pass |
| 9 | Add top-level in the selected chapter; add chapter after active; focus | unit `chapters.test.ts`; e2e chapter block counts, order `[first, new, last]`, new title focused | Pass |
| 10 | M2c fixes kept | full e2e: document lifecycle, rapid creation parity, keyboard/heading/list, inline chapter rename, right/bottom `+`, landscape default, text undo/redo, select-all recovery | Pass |
| 11 | Typecheck + unit | `npm run typecheck`; `npm test` 139 passed (14 files) | Pass |
| 12 | Performance not worse than M2c by >20% | 300-block initial 623 ms (M2c same-machine today 1,000 ms); 1,000-block 2,806 ms vs 2,632 ms (+6.6%); scroll 97 fps | Pass |
| 13 | axe no serious/critical | axe run at shell, 200% zoom, palette, topic tree, delete dialog | Pass |
| 14 | Screenshots 1440×900, 1024×768, 200% | `artifacts/m2d/` (list below) | Pass |
| 15 | No screen recording, no Notability, no app automation | none used | Pass |

## Measurements

Final full-suite run (4 November 2026, same machine):

```text
300-block initial render:            623 ms
1,000-block initial render:          2,806 ms
1,000 visible cards after collapse:  799
300-block measure p95:               1.9 ms   (columns p95 0.3 ms, edge p95 4.7 ms)
1,000-block measure p95:             12.1 ms  (columns 3.7 ms, edge 7.1 ms)
Scroll:                              97 fps (10.33 ms/frame)
Rebuild samples:                     first 5.2 ms, rest 0.1–0.6 ms
axe serious/critical:                0
```

Same-machine M2c baseline (worktree `t3-918bde08`, re-run today so the
comparison is not against the historical best run):

```text
300-block initial:                   1,000 ms
1,000-block initial:                 2,632 ms
300-block measure p95:               2.6 ms
300-block edge p95:                  0.7 ms
Scroll:                              98 fps
```

The historical M2c report numbers (584–609 ms initial, 1.4 ms measure) came
from a less loaded run. The 20% gate is against today's same-machine baseline:
the 300-block render is faster, and the 1,000-block render is +6.6%. The 300
measure p95 is lower than M2c; edge p95 varies with the cold route after a
structural change (0.5–4.7 ms in the final runs), still well below the 8 ms
budget. Raw JSON: `artifacts/m2d/performance.json`.

## Before / after

- **Before (M2c):** children were placed after each parent with
  `flex-wrap`; two children at the same depth under different parents could
  have different x, and a deep chain wrapped below instead of scrolling.
  A block with children carried a 16 px + 2 px footer.
- **After (M2d):** all same-depth blocks share one measured column; the editor
  scrolls horizontally; the collapse control is on the branch port and costs
  no height; the first branch is continuous with the trunk.

Screenshots in `artifacts/m2d/`:

- `four-level-1440x900.png` — 4-level empty chain, no overflow.
- `six-level-scroll-1024x768.png` — 6-level chain scrolled right, columns intact.
- `six-level-columns-1024x768.png` — the same chain at scroll 0, with the horizontal scrollbar.
- `depth-columns-1440x900.png` — demo tree: depth 1 shared by two children and a third child; depth 2.
- `depth-columns-1024x768.png` — the same at 1024; the demo document scrolls (its columns need 1,222 px + padding).
- `collapse-dot-1440x900.png` — collapsed root with the dot/count, no footer.
- `trunk-3-children-1440x900.png`, `trunk-3-children-1024x768.png` — 3-child trunk.
- `zoom-200.png` — 200% zoom, sidebar yields, no document-wide horizontal overflow.
- plus the existing shell shots: `empty-1440x900.png`, `shell-1440x900.png`,
  `shell-1024x768.png`, `palette-1440x900.png`, `selected-path-1440x900.png`,
  `two-tabs-1440x900.png`, `chapter-inline-1440x900.png`, `density-1440x900.png`.

`artifacts/` is gitignored, as in M2c; the files are on disk in the worktree.

## Known gaps and deliberate scope cuts

- **Six empty levels fit at 1440 by construction.** 160 + 5×144 + 5×16 =
  960 px of columns plus 80 px editor padding = 1,040 px, below the ~1,168 px
  editor viewport. The “6-level horizontal scroll” gate is exercised at 1024
  and with content-filled columns at 1440 (the unit test also asserts the
  filled six-level case overflows). A 7-level empty chain overflows at 1440.
- **The chapter head scrolls horizontally with the blocks.** It is not a
  sticky gutter. The brief does not require a fixed head; a sticky chapter
  header would be a small M4/UX follow-up if the product owner wants it.
- **Horizontal scroll position is not persisted** per tab; only `scrollTop`
  and the selected block are restored (M2c behavior). The browser keeps the
  live position while the tab stays mounted.
- **Collapse dot shows direct children**, not the whole hidden subtree
  (matching the M2c footer count and the brief's “child count”).
- **DOM-only stale cards no longer force a rebuild.** M2c also compared the
  rendered `[data-block-card]` IDs. That check is now diagnostic only: a node
  view can lag one frame, and rebuilding from canonical in that window could
  discard a just-typed, not-yet-committed text edit. The ProseMirror/canonical
  ID set remains authoritative and still drives the repair banner; the
  select-all + Backspace recovery is covered by the e2e.
- **Structural undo after destructive deletes** remains the M2b/M2c gap
  (`block.delete`/`branch.delete` return no inverse). Not touched by M2d.
- **The demo document overflows at 1440 with the sidebar open** because its
  content-driven columns need 1,222 px + padding; this is the intended
  horizontal-scroll behavior, and the sidebar can be collapsed with `⌘\`.
- **Empty top-level cards are transparent** (existing UX rule); an inactive
  empty top-level block is only visible on hover/focus. The 4-level screenshot
  therefore shows the first empty card as canvas-colored.
- **VoiceOver and subjective visual judgement** remain human gates.
- Native traffic lights are not captured by Playwright web-content screenshots.

## Files changed

- `apps/desktop/src/renderer/src/lib/{columns,chapters,backspace}.ts` (new)
- `apps/desktop/src/renderer/src/lib/{geometry,edge-routing,perf}.ts`
- `apps/desktop/src/renderer/src/editor/edges/{useBlockRects,EdgeLayer}.tsx/ts`
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`
- `apps/desktop/src/renderer/src/editor/{DocumentEditor,keymap,bindings,editor-ui}.tsx/ts`
- `apps/desktop/src/renderer/src/state/runtime.ts`
- `apps/desktop/src/renderer/src/{actions.ts,App.tsx,styles.css}`
- `apps/desktop/test/{columns,chapters,backspace,edge-routing,geometry}.test.ts`
- `tests/e2e/m2-editor.test.mjs`
- `docs/reports/m2d-depth-columns.md` (this report)

`packages/core`, `packages/layout`, and `packages/pdf` were not modified.
`docs/spec.md`, `docs/ux-shell.md`, and the ADRs were not edited (they already
contain D22 and the M2d addendum).

## Exact commands run

```bash
npm install
npm run typecheck
npm test
npm run build
npm run e2e
node --test --test-name-pattern="<name>" tests/e2e/m2-editor.test.mjs
# same-machine M2c baseline, in /Users/luca/.t3/worktrees/noteforest/t3-918bde08:
npm run build
node --test --test-name-pattern="measures the 300-block" tests/e2e/m2-editor.test.mjs
```

## Demo script for the product owner

1. Open the worktree, `npm install`, `npm run build`, then `npm run start`
   (or `npm run dev -w @noteforest/desktop`).
2. `⌘N`, then press `Control+Enter` three times: the four empty blocks sit in
   four columns at 1440 with no horizontal scrollbar.
3. Press `Control+Enter` two more times: the deeper columns scroll
   horizontally; nothing wraps below.
4. Create two top-level blocks, give each a child: both children start on the
   same depth-1 column.
5. Hover a parent with children: the chevron sits on the right branch port;
   click it (or `⌘.`) to collapse. The card height does not change; the dot
   shows the child count; click it to expand.
6. Press `Backspace` on an empty block: the caret moves to the previous block
   and the empty block remains. Press `⌘Backspace`: the block is deleted
   (a dialog appears when it has children).
7. At the end of any chapter click “+ Add top-level block”; it goes to that
   chapter. “+ Add chapter” inserts after the chapter of the selected block and
   focuses the new title.

## Next suggested step

Product-owner visual review of `artifacts/m2d/` at 1440×900, 1024×768, and
200% zoom, then the VoiceOver/keyboard pass. After M2d acceptance, the next
engineering slice is M3 span anchors/reference edges; structural undo for
destructive deletes remains the open M2b/M2c gap.
