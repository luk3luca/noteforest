# M2b — Editor shell + branch editor (report)

**Date:** 3 November 2026  
**Builder worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-c665c866`  
**Branch:** `t3/m2-editor-shell`  
**Status:** Complete for M2b scope; product-owner visual review and VoiceOver pass are the remaining human gates. Integration and merge belong to the Orchestrator.

## What was built

M2b replaces the Spike 1 fixture demo with a working, touchable NoteForest shell and a continuous branch editor.

- **Electron shell.** `titleBarStyle: 'hiddenInset'`, real macOS traffic lights, opaque Graphite background, 38 px title bar, 36 px custom tab strip, resizable 264 px sidebar (208–360 px), 24 px status bar, native File/Edit/View/Window/Help menu, native text context menu, native dirty state via `setDocumentEdited`, and a native Save / Don’t Save / Cancel prompt on window close/quit.
- **Documents and persistence.** `packages/core/node` stores are owned by the Electron main process; the renderer only receives typed snapshots and commands. Library default `~/Documents/NoteForest`, autosave 800 ms after the last change, atomic save, backups, revision, locks, recent manifest, session restore. Two documents open at once, tab switching, close/reopen, restore of tabs, active tab, scroll and selected block.
- **Tabs.** Dirty dot, hover close, middle-click close, `⌘W`, `⌘1…9`, `⌘⇧[`/`⌘⇧]`, `⌘⇧T`, drag reorder with `@dnd-kit`, overflow menu, `+` new document.
- **Sidebar.** Library list with filter, open indicator, context menu; Topics tree with chapters → top-level blocks → primary children using React Aria `Tree`; keyboard navigation, tree selection ↔ editor selection, inline chapter rename (`F2` / double-click), per-block collapse.
- **Branch editor.** One TipTap 3 ProseMirror document per open document. Custom `chapter` / `branchBlock` / `blockBody` / `branchChildren` wrapper nodes and React node views. Top-level blocks stack; children sit to the right when they fit, otherwise wrap below with an 18 px indent. The DOM order is depth-first reading order. SVG edge overlay is `aria-hidden` and measures with one `ResizeObserver` + rAF.
- **Primary branches.** Add child (`Tab`, `⌘Enter`, gutter `+`), add sibling (`Enter` at end, `⌘⇧Enter`), add top-level, drag/keyboard sibling reorder, `Move to…` reparent, outdent, delete edge (target top-level), delete block with promote/subtree choice. Cycles are rejected by the core command layer. Structural commands use targeted ProseMirror transactions where possible, so the editor does not flicker on ordinary edits.
- **Content.** Headings 1–3, paragraphs, lists, blockquotes, links, lowlight code blocks, KaTeX inline/block math via a LaTeX dialog, tables, images (rendering; asset import is deferred), selection bubble toolbar (bold/italic/code/link/math), command palette block actions.
- **Command palette.** `⌘K` on React Aria `Autocomplete`/`Dialog`; documents, blocks and commands; focus restore; section headings only when the group changes.
- **Visual system.** Graphite tokens, Source Serif 4 editor type, JetBrains Mono code, 1 px hairlines, 3/4/6 px radii, no chrome shadows, no gradients/glows/emoji, dark default; light Parchment tokens are reserved in CSS but the toggle is not shipped.
- **Tests.** Pure unit tests for edge routing, geometry, block tree and the core↔ProseMirror adapter; Playwright Electron e2e for document lifecycle, branches, reparent/reorder/delete, tab lifecycle, scroll/focus restore, axe, 200% zoom, performance and screenshots.

## Architecture notes

1. **Core is canonical.** `DocumentRuntime` holds the canonical `Document` received from the main process. The TipTap document is an editing buffer; content changes are committed with `block.editContent` after a 220 ms idle debounce. Zustand stores tabs/sidebar/palette/expanded/collapsed view state only, never document content per keystroke.
2. **Adapter boundary.** Core content uses `children`; ProseMirror uses `content`. `lib/adapter.ts` translates at the TipTap boundary and wraps each canonical block in `branchBlock`/`blockBody`/`branchChildren`. Unknown root data on a block is preserved on merge.
3. **Spatial tree in DOM flow.** The wrapper node views are CSS flex/flex-wrap, not computed positions. TipTap inserts its own `contentDOM` wrapper below `NodeViewContent`; the layout CSS targets that wrapper (`.nf-block-inner > div`) and makes the React node-view wrappers `display: contents`. This was the key layout finding.
4. **Targeted structural edits.** Add child/sibling, sibling reorder, reparent, detach and delete move the existing ProseMirror node and update parent `childCount` attrs instead of replacing the whole document. A full rebuild remains the fallback and is used for snapshot undo/redo and some chapter operations.
5. **Edges.** `lib/edge-routing.ts` is pure and tested; `EdgeLayer` maps measured card rects to orthogonal rounded paths, with ports ordered per sibling and a bottom trunk/bus for wrapped children. Arrowheads are marker-end only on the child; no path travels backwards.

## Gate matrix

Commands: `npm run typecheck`, `npm test`, `npm run e2e`, `npm run build -w @noteforest/desktop`.

| # | Gate | Evidence | Result |
|---|---|---|---|
| 1 | Create two documents, edit rich blocks, autosave, reopen | `tests/e2e/m2-editor.test.mjs` “creates documents…”; demo contains headings, lists, code, table | Pass |
| 2 | Create a child branch and see a forward arrow ending at the child | e2e checks parent right < path end < child left and end Y ≈ child centre; 3-arrow demo tree | Pass |
| 3 | Reparent, reorder (keyboard + pointer drag), delete/detach keep arrows consistent | e2e Move to…, Alt+↑, pointer drag, Detach from parent; demo tree; core unit suite | Pass |
| 4 | Save, quit, reopen restores content, structure, tabs, active tab, scroll, focus | e2e restore test: same selected block and scroll within 80 px; content/arrow checks | Pass |
| 5 | Two tabs: switch, dirty state, close one, reopen, session restore | e2e `⌘1/⌘2`, `⌘W` closes tab not window, `⌘⇧T`, relaunch | Pass |
| 6 | 300 blocks initial render < 1.5 s | **302–303 ms** (measured from seed call to 300 cards; 360–460 ms across runs including cold start) | Pass |
| 7 | One-edit edge recompute < 8 ms | geometry measure p95 **0.8–3.4 ms**; edge routing p95 **0.4–0.5 ms**; max ≤4.7/0.8 ms across runs | Pass |
| 8 | Full reflow < 50 ms | ordinary structural edits use targeted transactions; measured geometry reflow p95 **≤4.0 ms** (measure + edge). A synthetic full-document rebuild benchmark is recorded separately and is not on the normal edit path. See known gaps for snapshot undo. | Pass for normal edits |
| 9 | Scroll 60 fps at 300 blocks | **104–107 fps** average (9.32–9.60 ms frame) over 90 scroll frames | Pass |
| 10 | 1,000 blocks with collapse reported | 1,000 blocks rendered in **1,290–1,293 ms**; after collapsing one root, 799 cards visible, reflow p95 **2.3–2.6 ms** | Reported |
| 11 | axe: no serious/critical | shell, palette, topic tree, delete dialog: **0 serious/critical** under WCAG 2a/2aa/21a/21aa | Pass |
| 12 | Keyboard-only run | `⌘K`, `⌘N`, `⌘W`, `⌘⇧T`, `⌘1…9`, `⌘\`, tree arrows, tab arrows, dialogs, palette | Pass |
| 13 | 200% zoom | editor yields sidebar, innerWidth 720 = scrollWidth 720, no horizontal overflow; screenshot `zoom-200.png` | Pass |
| 14 | Screenshots at 1440×900 and 1024×768, dark | `artifacts/m2b/empty-1440x900.png`, `shell-1440x900.png`, `palette-1440x900.png`, `selected-path-1440x900.png`, `two-tabs-1440x900.png`, `shell-1024x768.png` | Pass |
| 15 | Anti-slop checklist | neutral surfaces, one accent, 1 px hairlines, 3/4/6 px radii, no gradients/glow/glass/emoji/shadows on chrome or cards; see review notes | Pass (product-owner visual check pending) |
| 16 | Electron smoke | native menu, `setDocumentEdited` asserted true/false in e2e, native text menu registered, close prompt implemented; `⌘⇧W` and native quit prompt are code/manual paths | Pass (manual quit-prompt check pending) |
| 17 | VoiceOver | not automated; `app.setAccessibilitySupportEnabled(true)`, sidebar tree is the canonical accessible structure, edges aria-hidden | Manual gate for product owner |

### Measured numbers (final e2e run)

```
300-block initial render:          302–303 ms
1,000-block initial render:      1,290–1,293 ms
geometry measure p95:              0.8–3.4 ms
edge routing p95:                  0.4–0.5 ms
structural geometry reflow p95:    ≤4.0 ms (measure + edge)
scroll:                            104–107 fps (9.32–9.60 ms/frame)
1,000-block measure p95:           2.3–2.6 ms
1,000-block edge p95:              0.7–0.8 ms
axe serious/critical:              0
```

The raw measurement JSON is `artifacts/m2b/performance.json`.

## Findings

1. **A node named `block` shadows the ProseMirror group named `block`.** ProseMirror resolves content-expression names to node names first; the custom branch node was renamed `branchBlock` so `chapter`’s `branch+` and `blockBody`’s `block+` resolve correctly. This was the cause of invalid editor content and failed typing before the fix.
2. **TipTap’s React node view inserts a contentDOM wrapper under `NodeViewContent`.** Sibling node views are not direct children of the element receiving the `className`. The flex-row layout must target `.nf-block-inner > div`, and the React node-view wrappers need `display: contents` for measured cards to become flex items.
3. **Targeted transactions are necessary for a calm editor.** Replacing the whole ProseMirror document on every structural change re-renders hundreds of React node views; targeted node moves make add/reorder/reparent/delete feel instant.
4. **The tertiary text token needed a contrast correction.** `#7E848C` measures 3.82:1 on `--surface-3`; axe flagged palette hints and group labels. M2b uses `#8B9199` for `--text-tertiary` (4.54:1 on surface-3, 5.8:1 on the sidebar) without changing the rest of the Graphite palette.
5. **Native traffic lights are not captured by Playwright.** Screenshots are web-content screenshots; the real window shows the traffic lights. Product-owner screenshots of the full window should be taken with the OS capture tool if needed.
6. **Collapse is now CSS/attrs-only.** The collapsed subtree remains in the ProseMirror document and is hidden with `display: none`; it disappears from the sidebar, from the edge list and from visible-card counts. This removed a full rebuild from the collapse path.

## Known gaps and deliberate scope cuts

- **Inactive block cards are not read-only.** One ProseMirror document holds all blocks; the active block has the caret and chrome, but inactive blocks remain reachable by click/selection. The single-editor constraint is preserved.
- **Undo/redo after structural deletes.** Core commands return no inverse for destructive deletes; structural undo works for create/move/reorder, but deleting a block or branch is not on the structural undo stack. Text undo uses ProseMirror history.
- **Full-document rebuild fallback.** Snapshot undo/redo and a few chapter operations still rebuild the whole editor document. At 300 blocks this can exceed the 50 ms budget; normal editing and branch operations do not take that path. This is the next performance task.
- **Slash menu** is not shipped (SHOULD in the brief). The command palette and block actions cover block insertion; the empty-block placeholder remains.
- **Image asset import/paste** is deferred. Image nodes render if present; local asset copy and a `noteforest-asset` protocol are not implemented.
- **Light theme** tokens are reserved but there is no theme toggle; dark Graphite is the default and only shipped look.
- **Recent documents** are not a separate sidebar section; the library list is sorted by last update and recent titles are used for missing tabs.
- **Tab close affordance.** The visible close button is `aria-hidden` to keep the `tablist` ARIA contract valid. Keyboard users close with `Delete` on the focused tab, `⌘W`, middle-click, or the tab context menu.
- **VoiceOver pass** and the product owner’s subjective visual check remain human gates.
- **Cross-chapter moves, chapter delete/reorder UI, reference edges, anchors, page view, PDF** are out of M2b by definition.
- **Native `⌘⇧W` / quit prompt** are implemented in the main process but not automated in Playwright (a native dialog cannot be driven reliably); manual smoke is left to the product owner.

## Files changed

- `apps/desktop/package.json`, `apps/desktop/electron.vite.config.ts`
- `apps/desktop/src/main/{index,library,menu}.ts`; `apps/desktop/src/preload/index.ts`; `apps/desktop/src/shared/api.ts`
- `apps/desktop/src/renderer/index.html`; `apps/desktop/src/renderer/src/{main,App,styles}.tsx/css`
- `apps/desktop/src/renderer/src/shell/{TitleBar,TabBar,StatusBar,Workspace,Sidebar,CommandPalette,ContextMenu,Dialogs}.tsx`
- `apps/desktop/src/renderer/src/editor/{DocumentEditor,SelectionToolbar,extensions,keymap,bindings,editor-ui}.ts*` + `editor/views/BlockViews.tsx` + `editor/edges/{EdgeLayer,useBlockRects}.ts*`
- `apps/desktop/src/renderer/src/lib/{adapter,tree,geometry,edge-routing,perf}.ts`
- `apps/desktop/src/renderer/src/state/{shell,runtime,registry,session}.ts`
- `apps/desktop/test/{edge-routing,geometry,tree,adapter}.test.ts`
- `tests/e2e/m2-editor.test.mjs`; root `vitest.config.ts`, `package.json`, `package-lock.json`
- `docs/reports/m2b-editor-shell.md` (this report)
- Removed: Spike 1 renderer (`PrintApp`, `ReaderView`, `PrintPages`, `content/*`, `layoutPipeline`, `testApi`), main fixtures, `tests/e2e/app.test.mjs`

`packages/layout` and `packages/pdf` were not modified.

## Exact commands run

```bash
npm install
npm run typecheck -w @noteforest/desktop
npm run build -w @noteforest/desktop
npx vitest run apps/desktop/test
node --test tests/e2e/m2-editor.test.mjs
# final verification:
npm run typecheck
npm test
npm run e2e
```

Screenshots were captured through Playwright Electron and downscaled to exactly 1440×900 / 1024×768 with `sips` inside the screenshot test.

## Demo script for the product owner

1. From the worktree: `npm install` (already installed), `npm run build`, then `npm run dev -w @noteforest/desktop` (or `npm start` for the built preview).
2. The app opens with the empty state, or restores the last session. `⌘N` creates a note; `⌘K` opens the palette.
3. Type a block. Press `Tab` to create a child branch; the arrow appears from the parent’s right edge to the child’s left edge. Press `Tab` again on the child to go deeper; when the column is full, the child wraps below with an 18 px indent and a top-entering arrow.
4. Add a sibling with `Enter` at the end of a block or `⌘⇧Enter`. Reorder with the six-dot gutter drag or `⌥↑`/`⌥↓`. Right-click a block → `Move to…` to reparent; right-click a child → `Detach from parent` to make it top-level.
5. Collapse a branch with `⌘.` or the chevron/count control; the subtree and its arrows disappear. Click a deep block: the selected path is accent-coloured, the rest is muted.
6. Create a second note with `⌘N`; switch with `⌘1`/`⌘2`; `⌘W` closes the tab, not the window; `⌘⇧T` reopens it.
7. Select text for the inline toolbar (bold/italic/code/link/math). Insert a table or math from `⌘K`.
8. Quit with `⌘Q`/close: because autosave saved the last idle change, no prompt appears; if you close immediately after typing, the native Save / Don’t Save / Cancel prompt appears. Reopen: tabs, active tab, scroll and selected block are restored.
9. Screenshots are at `artifacts/m2b/`: `shell-1440x900.png`, `palette-1440x900.png`, `selected-path-1440x900.png`, `two-tabs-1440x900.png`, `shell-1024x768.png`, `empty-1440x900.png`, `zoom-200.png`.

## Next suggested step

Product-owner visual review of the screenshots and a VoiceOver/keyboard pass. Then pick the next vertical slice: either targeted structural undo (to remove the full-rebuild fallback and the destructive-delete undo gap) or M3 span anchors/reference edges on the same command layer. PDF/page-view work stays deferred.
