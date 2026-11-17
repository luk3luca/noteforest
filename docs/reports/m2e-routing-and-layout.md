# M2e — Parent-relative layout, routing, zoom and focus (report)

**Date:** 4 November 2026  
**Builder worktree:** `a builder worktree`  
**Branch:** `t3/m2e-parent-relative-routing`  
**Base:** `db2017c` (`main`: docs: approve M2e parent-relative layout and routing lab)  
**Status:** Complete for M2e scope. Integration and merge belong to the Orchestrator.
Product-owner visual judgement and VoiceOver remain human gates.

## What changed

### 1. Parent-relative placement (D23; D22 reverted)

- `lib/columns.ts` and `test/columns.test.ts` are deleted. There is no global
  x per depth and no `--nf-card-col` / `--nf-card-w` custom property.
- A row is still normal CSS flow: `[card][child group]`. The child group has
  `margin-left: 16px`, so its left edge is exactly its **own** parent's right
  edge plus the gap. Cards keep content-driven widths (top-level 160–480 px,
  child 144–420 px).
- `useBlockRects` now reads each card's real `getBoundingClientRect()` once per
  measure pass. There is no column computation and no synthetic x correction.
  It subtracts the editor zoom factor so the SVG router always works in
  unscaled design pixels.
- `lib/placement.ts` exposes `childGroupStart`, `contentBounds`, and `fitZoom`.
  The same definition of parent-relative placement drives Fit width and its
  unit tests.
- Top-level blocks still stack vertically; siblings still stack in their local
  child group; the editor still scrolls horizontally for deep branches.
- The 4-level empty chain is 640 px (160 + 3 × 144 + 3 × 16) and fits at 1440.
  An 8-level empty chain is 1,280 px and overflows at 1440, which is the
  intended horizontal-scroll behavior.

### 2. Swap `+` and collapse

- `+` add-child is at the **center of the right edge** (the branch port),
  outside the text. Its 16 px circle spans the card edge; the fixed arrowhead
  starts just outside it, so the arrowhead stays visible.
- Collapse moved to the **top-right** of the card: chevron on hover/selection,
  collapsed dot + direct child count always visible, `aria-expanded`,
  `⌘.` unchanged. No footer and no height change.
- `+` add-sibling stays at the bottom edge center; the drag handle stays in the
  left gutter.
- None of the controls are in flow; hovering never changes card geometry.

### 3. Arrow routing lab and fix

The lab and decision are committed before the product router change:
`docs/design/edge-routing-lab.html`, `docs/design/edge-routing.md`, and
`scripts/capture-routing-lab.mjs`. It is static and dev-only; it does not ship
in the app build.

The lab renders 12 real card-rectangle cases for V1–V4: one centered child,
above/below with small and large dy, two/three/five children at 16 px gaps, a
first child above the parent center, a close stem, a far child, and a
page-width wrapped reference. Screenshots are `artifacts/m2e/routing-lab-*`.

**Chosen: V4, shared trunk + short branches.** Reasons:

1. One readable vertical trunk and an explicit, testable T-junction.
2. The first child's path is continuous from the parent port; the trunk starts
   on that path, not at a second stub.
3. It scales to 2–5 children without the fan crossings of V2 or the mixed
   visual language of V3.
4. It matches the M2c/M2d product language: one branch group has one spine.

Implementation:

- The arrowhead is an explicit 6 × 6 px polygon (`arrowPoints` /
  `arrowPath`) rendered as a filled `<path>`. There is **no `marker-end`**.
  It cannot scale with a short segment.
- The final segment is horizontal and exactly 12 px at the editor's 16 px gap:
  lane at parent right + 2, tip at child left − 2. The lane moves right (up to
  +14) when a gap is wider. A stem below 12 px is flagged as a defect and drawn
  dashed; the polygon stays fixed.
- The first child owns `parent port → lane → trunk T-junction → child`; the
  trunk is a straight line from that junction to the last child. Other children
  are short horizontal branches from the trunk.
- `EdgeLayer` renders the polygon with the same active/muted/defect state as the
  line. The branch trunk remains a secondary collapse target.
- The wrapped/bottom route is retained for the M4 page renderer with a fixed
  down-pointing arrowhead; the editor does not produce wrapped children.

**Measurement race fixed while implementing the tests.** The old
`useBlockRects` cleanup cancelled the pending rAF but left the stale id in the
ref. A new effect run then skipped scheduling and could miss a TipTap node view
that mounted one commit later. This was visible as a missing third arrow after
rapid `Control+Enter` creation. The cleanup now resets the ref, and one trailing
measure pass (double rAF + 150 ms) catches late node views. The rapid-creation
e2e is green with 3 arrows and one trunk.

### 4. Zoom, Fit width, Focus branch

- Zoom out/in/reset: `⌘-`, `⌘+`, `⌘0`, step 10%, clamp 50–200%. The status bar
  shows `− 100% + Fit Focus`. The menu items send the same commands and do not
  register native accelerators, so browser zoom no longer fights editor zoom.
- Fit width (`⇧⌘0`, status-bar Fit, palette): measures the visible cards,
  sets a zoom that fits the editor viewport plus canvas padding, resets
  horizontal scroll to 0. It works on the whole document or on the focused
  branch, and it is navigation only.
- Focus branch (`⇧⌘F`, status-bar Focus, palette): shows the selected block's
  ancestor chain plus its descendants and hides other top-level/sibling
  branches. It is a DOM view filter; the editor buffer, canonical document,
  revision, and file are untouched. Toggling off restores every branch.
- Zoom and focus are per-document view state in memory. They are not persisted
  across relaunch (M2c only persists scroll and selected block).
- Page-width wrap preview is not built; it stays M4.

### 5. M2c/M2d behavior preserved

Full e2e still covers: desync queue/reconciliation, rapid creation parity,
keyboard model, heading escape, inline chapter edit, contextual add top-level/
chapter, non-destructive Backspace (including tables), landscape default,
collapse dot, drag reorder, reparent/detach, undo/redo, tabs and restore.

## Gate matrix

Commands: `npm run typecheck`, `npm test`, `npm run e2e` (builds first).
Full e2e: **13/13 passed**. Unit: **144 passed in 14 files**.

| # | Gate | Evidence | Result |
|---|---|---|---|
| 1 | Child group starts at parent right + 16 | unit `placement.test.ts`; e2e `places children parent-relative…` asserts child x = parent x + width + 16 | Pass |
| 2 | Different parents may differ in x | e2e: a wide top-level parent's child at its own right edge vs the empty parent's child at 176 | Pass |
| 3 | No depth-column computation/margins remain | `lib/columns.ts`, `columns.test.ts` deleted; e2e asserts every card's `--nf-card-col` is `''` | Pass |
| 4 | 4-level empty chain fits 1440 | e2e x `[0,176,336,496]`, width 160/144/144/144, overflow 0; screenshot `four-level-1440x900.png` | Pass |
| 5 | Deep chain scrolls horizontally | e2e 8 levels x `[0…1136]`, overflow > 0 at 1440; screenshot `deep-branch-scroll-1440x900.png` | Pass |
| 6 | `+` center, collapse top-right, no overlap, no layout shift | e2e bounding boxes: add center = card right center; port at top-right; port above add; no intersection; sibling bottom center; handle left | Pass |
| 7 | Collapse no height, dot + count, aria-expanded | e2e height equal within 0.5 px, no `.nf-block-meta`, dot `2`, aria state, screenshot `controls-1440x900.png` and `collapse-dot-1440x900.png` | Pass |
| 8 | Routing lab + docs before product change | `docs/design/edge-routing-lab.html`, `edge-routing.md`, 8 screenshots; design commit precedes implementation commit | Pass |
| 9 | Fixed arrowhead independent of path length | unit arrow length 6 / width 6 for short and long paths; e2e reads the polygon and asserts 6 × 6, no `marker-end` | Pass |
| 10 | Final segment horizontal and ≥ 12 px | unit cases centered/above/below/far/close; e2e parses the final path segment | Pass |
| 11 | First branch continuous; trunk at T-junction | unit 2/3/5 children and first-above-center; e2e trunk snapshot | Pass |
| 12 | Close/offset arrows legible; defect not silent | unit close stem 12 (not defect) and gap 10 (defect, fixed arrow); lab close/far cases | Pass |
| 13 | Zoom shortcuts and display | e2e 100 → 90 → 100 → 110 → 100 with `⌘-`, `⌘=`, `⌘0`; status label follows | Pass |
| 14 | Fit width on document and branch | e2e at 1024: full document 60%, overflow 0, no edge defects; focused branch fit at 88%, overflow 0; `fit-width-1024x768.png` | Pass |
| 15 | Focus branch ancestor + descendants, reversible, no mutation | e2e root focus 4 visible / 1 top-level / 3 arrows; deep focus 3 visible / 2 arrows and sibling hidden; block IDs unchanged; focus screenshots | Pass |
| 16 | M2c/M2d regressions | full e2e 13/13 (desync, keyboard, heading, chapters, Backspace, tables, landscape, collapse dot, drag, tabs) | Pass |
| 17 | Typecheck + unit | `npm run typecheck`; `npm test` 144 passed (14 files) | Pass |
| 18 | Performance not worse than M2d by > 20% | M2e 300 ms / 1,372 ms vs same-machine M2d 531 ms / 1,393 ms; measure/edge p95 lower | Pass |
| 19 | axe 0 serious/critical | e2e axe at shell (with new view controls), 200% page zoom, palette, tree, delete dialog | Pass |
| 20 | Screenshots under `artifacts/m2e/`; no recording/Notability | files listed below; no screen recording or Notability used | Pass |

## Measurements

Final full-suite run (4 November 2026, same machine, after the zoom-scale
change):

```text
300-block initial render:            300 ms
1,000-block initial render:        1,372 ms
1,000 visible cards after collapse:  799
300-block measure p95:               1.0 ms   (edge p95 0.5 ms)
1,000-block measure p95:             2.4 ms   (edge p95 1.3 ms)
Scroll:                              107 fps
Rebuild samples:                     first 5.2 ms, rest 0.1–0.6 ms
Text zoom (editor):                  60% (1,024 fit) / 88% (focused branch)
axe serious/critical:                0
```

Same-machine M2d baseline (worktree `t3-d1ad0c14`, re-run today at 13:25 so the
comparison is not against a historical best run):

```text
300-block initial:                   531 ms
1,000-block initial:               1,393 ms
300-block measure p95:               3.4 ms (columns 0.2, edge 0.4)
1,000-block measure p95:             6.1 ms (edge 6.5)
Scroll:                              110 fps
```

The 300-block render is **43% faster** than M2d; the 1,000-block render is
**1.5% faster**. The measure and edge p95 are lower at both sizes. The 20% gate
is comfortably met. Raw JSON: `artifacts/m2e/performance.json`.

## Before / after

- **Before (M2d):** all blocks at one depth shared a measured column; one wide
  block widened every later depth, and the arrowhead was an SVG marker placed
  only 6 px from the child because the shared trunk sat in the middle of the
  16 px gap.
- **After (M2e):** each child group starts after its own parent, so a wide
  branch stays local. The child gap is unchanged at 16 px, but the lane hugs
  the parent and the arrowhead is an explicit fixed-size polygon at the child.
  Zoom/fit and Focus branch make deep indentation inspectable without an
  unbounded horizontal canvas.

Screenshots in `artifacts/m2e/` (gitignored, on disk in the worktree):

- `four-level-1440x900.png` — 4-level parent-relative chain, no overflow.
- `deep-branch-scroll-1440x900.png` — 8-level chain scrolled right.
- `controls-1440x900.png` — `+` at the right-edge center, collapse dot top-right,
  no footer.
- `collapse-dot-1440x900.png` — collapsed branch with count.
- `chosen-arrows-1440x900.png`, `chosen-arrows-1024x768.png` — V4 arrows and the
  three-child trunk.
- `trunk-3-children-1440x900.png`, `trunk-3-children-1024x768.png`.
- `focus-branch-1440x900.png`, `focus-ancestors-1440x900.png`.
- `fit-width-1024x768.png` — 60% fit, no horizontal scroll.
- `routing-lab-v1…v4-1440x900.png`, `routing-lab-v1…v4-1024x768.png`.
- Existing shell shots: `empty`, `shell`, `palette`, `selected-path`,
  `two-tabs`, `density`, `chapter-inline`, `zoom-200`.

## Known gaps and deliberate scope cuts

- **`+` at the branch port covers the first pixels of the stem while it is
  visible.** This is the requested control position: the circle is centered on
  the branch port, so it hides the 2–8 px part of the stem. The 6 × 6 arrowhead
  starts exactly at the circle's outer edge and the trunk above/below the
  circle stays visible. A future polish could fade the `+` while the pointer is
  over the branch/trunk, but that would change the requested affordance.
- **Focus anchors at activation.** Changing the selection inside the focused
  branch does not retarget the anchor; toggle Focus off/on to retarget. This
  keeps the view stable while editing.
- **Zoom/fit/focus are memory-only.** They are per-document view state and are
  not persisted across relaunch. M2c only persists scroll and selected block.
- **Fit width clamps 50–150%.** A document wider than 150% still scrolls; the
  clamp avoids unreadable text. Fit is conservative at 1024 because it reserves
  the 40 px canvas padding token even though the responsive CSS uses 28–32 px.
- **Page-width wrap is M4.** The below route and bus are retained and tested as
  an M4 reference; the editor never wraps.
- **Editor zoom and browser page zoom are separate.** The View menu now drives
  editor zoom; the existing 200% page-zoom accessibility path still works via
  `webContents.setZoomFactor`.
- **Focus hides chapters with no visible block**, including their chapter head
  and add-row; exiting focus restores them.
- **Chapter head still scrolls horizontally with the blocks** (same as M2d).
- **Structural undo after destructive deletes** remains the M2b/M2c gap.
- **Empty top-level cards remain transparent**, so an inactive empty top-level
  block is only visible on hover/focus.
- **VoiceOver and subjective visual judgement** remain human gates; no screen
  recording or Notability was used.

## Files changed

- `apps/desktop/src/renderer/src/lib/{placement,geometry,edge-routing,perf}.ts`
  (`columns.ts` deleted)
- `apps/desktop/src/renderer/src/editor/edges/{useBlockRects,EdgeLayer}.tsx/ts`
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx`
- `apps/desktop/src/renderer/src/shell/StatusBar.tsx`
- `apps/desktop/src/renderer/src/state/shell.ts`
- `apps/desktop/src/renderer/src/{App.tsx,actions.ts,styles.css}`
- `apps/desktop/src/main/menu.ts`
- `apps/desktop/src/shared/api.ts`
- `apps/desktop/test/{placement,edge-routing,geometry}.test.ts` (`columns.test.ts` deleted)
- `tests/e2e/m2-editor.test.mjs`
- `docs/design/edge-routing.md`, `docs/design/edge-routing-lab.html`
- `scripts/capture-routing-lab.mjs`
- `docs/reports/m2e-routing-and-layout.md` (this report)

`packages/core`, `packages/layout`, and `packages/pdf` were not modified. The
spec, UX shell, and ADR already contain D23 and the M2e addendum; they were not
edited.

## Exact commands run

```bash
npm install
node scripts/capture-routing-lab.mjs
npm run typecheck
npm test
npm run build
npm run e2e
node --test --test-name-pattern="<name>" tests/e2e/m2-editor.test.mjs
# same-machine M2d baseline, in /Users/example/.t3/worktrees/noteforest/t3-d1ad0c14:
npm run build
node --test --test-name-pattern="measures the 300-block" tests/e2e/m2-editor.test.mjs
```

## Demo script for the product owner

1. Open the worktree, `npm install`, `npm run build`, then `npm run start`
   (or `npm run dev -w @noteforest/desktop`).
2. `⌘N`, then `Control+Enter` three times: four empty blocks sit in a
   parent-relative chain at 1440 with no horizontal scrollbar. Add a second,
   wider top-level block with a child: its child starts after that wider card,
   not at the first chain's depth-1 x.
3. Extend the first chain to eight levels: the editor scrolls horizontally;
   the same-depth blocks under the wide parent stay local.
4. Hover a parent with children: the `+` is at the right-edge center; the
   collapse dot/chevron is at the top-right. `⌘.` collapses/expands; the card
   height does not change.
5. `⌘-` / `⌘+` / `⌘0` change and reset the zoom shown in the status bar.
   Click **Fit** at 1024: the document fits, no horizontal scroll, no dashed
   arrow defects.
6. Select a block, click **Focus** (or `⇧⌘F`): only its ancestor chain and
   descendants stay; other top-level/sibling branches disappear. Click again
   to restore. Repeat on a deep block to see the ancestor chain.
7. Open `docs/design/edge-routing-lab.html` in a browser and switch V1–V4 via
   the header links, or run `node scripts/capture-routing-lab.mjs` to
   regenerate the eight lab screenshots.
8. Press `Backspace` on an empty block: the caret moves and the block stays;
   `⌘Backspace` deletes it. The chapter-level add rows and inline chapter title
   edit are unchanged.

## Next suggested step

Product-owner visual review of `artifacts/m2e/` at 1440×900, 1024×768, and the
routing lab variants, then the VoiceOver/keyboard pass. After M2e acceptance,
the next engineering slice is M3 span anchors/reference edges; structural undo
for destructive deletes remains the open M2b/M2c gap.
