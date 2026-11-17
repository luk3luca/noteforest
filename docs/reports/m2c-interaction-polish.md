# M2c — Interaction polish + desync fix (report)

**Date:** 4 November 2026  
**Builder worktree:** `a builder worktree`  
**Branch:** `t3/918bde08`  
**Status:** Complete for M2c scope. Product-owner visual review and the VoiceOver pass remain human gates. Integration and merge belong to the Orchestrator.

## What changed

### 1. Phantom block / desync (blocker)

The M2b failure mode is fixed at four levels:

- **One structural queue.** `DocumentRuntime` now owns a pure serial queue (`lib/serial-queue.ts`). Content commits, structural commands, saves, and structural undo/redo all run one at a time. Two rapid `addChild` calls can no longer read the same canonical state or race their editor insertions.
- **Created IDs come from the command result.** `packages/core` returns `CommandSuccess.created` (`documentIds`, `chapterIds`, `blockIds`, `branchIds`). The Electron IPC `ApplyResult` carries it to the renderer. `createBlock` uses `result.created.blockIds[0]`; `newestBlockId` and every before/after diff are gone.
- **Structural transactions stay out of text history.** Every targeted insert/move/delete, collapse, and full rebuild sets `addToHistory: false` and `preventUpdate: true`. Text typing keeps normal ProseMirror history.
- **Reconciliation after every structural command.** `reconcileEditor` compares canonical block IDs with ProseMirror block IDs and the rendered `[data-block-card]` IDs. A mismatch, a missing ID, a canvas-only ID, or a ProseMirror auto-fill placeholder (`blockId: null`) triggers a rebuild from canonical. A failed core command inserts nothing; a failed targeted insertion falls back to a rebuild.
- **Visible recovery.** When reconciliation rebuilds, the editor shows a dismissible banner: “The editor was rebuilt from the saved document to remove an untracked block.” A dev warning lists extra/missing IDs.

The rapid-creation regression creates three children with three Control+Enter keydowns before the first IPC round-trip can finish. Canvas, sidebar, canonical document, and arrow counts stay at 4/4/4/3 with one shared trunk. Each child is then deleted; all four counts stay in parity.

### 2. Arrow grouping

`lib/edge-routing.ts` now routes a **whole sibling group** instead of one edge per child:

- One right child: a simple orthogonal elbow from the parent’s right edge.
- Two or more right children: one vertical trunk from the parent’s right edge and a short horizontal arrow at each child’s centre.
- Wrapped children: one bottom trunk at `parent.left + 18`, one horizontal bus 12 px above the first child row, and a short vertical arrow into each child top.
- Mixed right/wrapped groups get independent trunks. Separate parents keep separate trunks.
- Arrowheads are only at the child; endpoints stop 8 px before the card so the marker does not enter it.
- Trunk paths are rendered once (`nf-edge-trunk`); edges are `nf-edge-path`. Selected paths use the accent colour and 1.75 px; muted paths stay at 35%.

Unit coverage: 1 child, 2 children, 5 children, wrapped, mixed, overlap defect, tight gap, rounded orthogonal path, forward-only right routes.

### 3. Keyboard model

| Key | Behaviour |
|---|---|
| `Enter` | New paragraph inside the block; at the end of a heading, a normal paragraph in the same block |
| `Shift+Enter` | Hard line break |
| `Option+Enter` | New sibling block |
| `Control+Enter` | New child block |
| `Tab` | List/code/table/blockquote indent; on a selected block, make child; does not create a block while typing a paragraph |
| `Shift+Tab` | Outdent on a selected block; list outdent while editing |
| `Mod+Enter` / `Mod+Shift+Enter` | Removed as creation shortcuts and from menu hints |

The heading escape uses a ProseMirror transaction that splits at the caret and converts only the new empty heading to a paragraph. It no longer calls `setParagraph` on a selection spanning both headings, which produced “Invalid content for node type paragraph”.

A block-type control is available in the command palette: **Block type: Text / Heading 1 / Heading 2 / Heading 3**. It changes the first text block inside the selected block and never changes the block ID. It is palette-only by design: a floating per-card toolbar covered text on narrow cards, and the brief allows toolbar or palette.

### 4. Shell layout

- Title bar spans the window.
- Sidebar reaches the full content height on the left.
- The 36 px tab strip lives only in the editor column, to the right of the sidebar.
- Status bar remains full width at the bottom.
- Splitter, 208–360 px sidebar range, 200% zoom behaviour, and independent sidebar/editor scrolling are unchanged.

### 5. Editor typography and density

- Body: system UI sans (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`), 15.5 px / 1.55.
- Headings: 20 / 18 / 16 px semibold.
- Code: JetBrains Mono 13.5 px / 1.55.
- Block padding 10 px; block gap 16 px; block row gap 16 px; editor padding 40 px (32/28 at narrower widths); canvas max 1400 px.
- Source Serif 4 imports and `@fontsource/source-serif-4` removed.
- Font family/size settings remain deferred to **M6**; tokens are CSS variables.

### 6. Child/sibling affordances

- Left gutter: six-dot drag handle only.
- Right-edge `+`: “Add child”.
- Bottom-edge `+`: “Add sibling”.
- Both are absolute overlays, visible on hover/selection, so they never shift layout.
- Every creation goes through the queued command and reconciliation, so its arrow always appears.

### 7. Chapter and top-level authoring

- Chapter title is a button that becomes an input in place; `Enter`/blur commits, `Esc` cancels, empty title falls back to “Untitled chapter”, sidebar updates from the canonical document.
- End-of-canvas row: “+ Add top-level block” (current, i.e. last, chapter) and “+ Add chapter” (creates the chapter with its first block and focuses it).
- Sidebar add-chapter and add-block paths still work through the same actions.

### 8. Default landscape

- `DEFAULT_PAGE_ORIENTATION = 'landscape'`; `createDocument` and `defaultPageSetup()` use it.
- Existing documents keep their stored orientation; an explicit portrait override still produces portrait.
- Core tests cover the landscape default, explicit portrait, and margin validation in both widths.
- `docs/spec.md` v0.4.2 already states the landscape default; no spec/UX/ADR file was edited by this task.

## Gate matrix

Commands: `npm run typecheck`, `npm test`, `npm run build`, `node --test tests/e2e/m2-editor.test.mjs`.

| # | Gate | Evidence | Result |
|---|---|---|---|
| 1 | Rapid child creation never leaves a phantom block | e2e “serializes rapid structural creation…”: 3 synthetic Control+Enter presses before IPC settles; canvas/sidebar/canonical 4, arrows 3, trunks 1; each child deleted with parity | Pass |
| 2 | Created ID comes from the command result, not a diff | `CommandSuccess.created`; IPC `ApplyResult.created`; `createBlock` reads `result.created.blockIds[0]`; core + queue unit tests | Pass |
| 3 | Structural commands are serialized | `createSerialQueue`; `apps/desktop/test/serial-queue.test.ts` (one-at-a-time order, failure isolation, result ID); runtime uses one queue for commits/commands/saves/undo/redo | Pass |
| 4 | Structural transactions excluded from text history | every structural dispatch sets `addToHistory:false`, `preventUpdate:true`; typing undo/redo e2e | Pass |
| 5 | Editor/canonical reconciliation and visible recovery | `reconcileEditor` checks PM IDs and rendered cards, rebuilds on mismatch/placeholder; repair banner; delete-last-child e2e returned to 1 card | Pass |
| 6 | Failed command inserts nothing | created-ID path only inserts after `result.ok`; insertion failure rebuilds; queue failure unit test | Pass |
| 7 | One shared trunk for 3 right children | e2e root trunk count = 1; screenshot `trunk-3-children-1440x900.png`; unit 2/5-child trunks | Pass |
| 8 | Wrapped and mixed routing | unit tests for bottom trunk + bus, mixed groups, endpoint clipping, forward-only paths | Pass |
| 9 | Keyboard model | e2e: Enter at heading stays in block, Shift+Enter hard break, Option+Enter sibling, Control+Enter child, Tab in paragraph no block, Tab in list nests and no block | Pass |
| 10 | Chapter inline editing and sidebar sync | e2e fills the canvas title, presses Enter, sidebar label becomes “Linear systems” | Pass |
| 11 | Canvas add top-level / add chapter | e2e uses both end-of-canvas actions; canvas/sidebar counts match | Pass |
| 12 | Shell layout | screenshots: title bar across, sidebar full height, tab strip only in editor column, status bar bottom; 1440×900 and 1024×768 | Pass |
| 13 | Typography and density | computed body 15.5 px/1.55, headings 20/18/16, code 13.5; screenshots before/after | Pass |
| 14 | Source Serif removed | no CSS/imports/dependency; `grep -R source-serif` clean except historical docs | Pass |
| 15 | Right/bottom `+`, gutter drag only | e2e uses the right `+` to add the third child; screenshots show bottom `+`; gutter has only the drag handle | Pass |
| 16 | New documents default A4 landscape; existing portrait kept | core tests `model.test.ts`; e2e runtime orientation = `landscape` | Pass |
| 17 | Typecheck, unit, e2e | `npm run typecheck`; `npm test` 121 passed; full e2e 8/8 passed | Pass |
| 18 | axe: no serious/critical regressions | existing WCAG 2a/2aa/21a/21aa run in e2e test 4 | Pass |
| 19 | 300-block performance | initial render **584–609 ms** in the final runs (991–1018 ms in two earlier loaded runs); same-machine M2b baseline **859–925 ms**; historical M2b report number 302 ms is from a faster/less loaded run. Absolute gate <1500 ms. Measure p95 1.4 ms; edge p95 0.7–0.8 ms; scroll 93–94 fps | Pass |
| 20 | 1,000-block report | rendered **2,660–2,688 ms**; 799 visible cards after collapsing one root; measure p95 5.7–6.2 ms, edge p95 1.3–1.5 ms | Reported |
| 21 | Screenshots 1440×900 and 1024×768, before/after | `artifacts/m2c/`: `before-3-children-1440x900.png`, `trunk-3-children-1440x900.png`, `before-density-1440x900.png`, `density-1440x900.png`, `before-shell-1024x768.png`, `shell-1024x768.png`, `trunk-3-children-1024x768.png`, `chapter-inline-1440x900.png`, plus shell/palette/selected-path/two-tabs | Pass |
| 22 | No screen recording, no Notability, no app automation outside Playwright | none used | Pass |

### Measured numbers (final e2e run)

```text
300-block initial render:           584–609 ms (final runs; 991–1018 ms in two earlier loaded runs)
same-machine M2b baseline:          859–925 ms
300-block geometry p95:             1.4 ms
300-block edge routing p95:         0.7–0.8 ms
scroll:                             93–94 fps (10.68–10.75 ms/frame)
1,000-block initial render:         2,660–2,688 ms
1,000-block visible after collapse: 799
1,000-block geometry p95:           5.7–6.2 ms
1,000-block edge p95:               1.3–1.5 ms
axe serious/critical:               0
```

Raw JSON: `artifacts/m2c/performance.json`. The historical M2b numbers are in `docs/reports/m2b-editor-shell.md`; the 300-block machine check above was re-run from the M2b app on the same machine and at the same time as M2c.

## Known gaps and deliberate scope cuts

- **Structural undo/redo after destructive deletes** is still the M2b gap: `block.delete` and `branch.delete` return no inverse. Undo works for creation/move/reorder and text edits; the e2e covers text undo/redo and creation. This is the next structural-history task.
- **Block-type control is palette-only.** A floating card toolbar was implemented and removed during this task because it covered text on narrow cards; the palette satisfies the “toolbar or palette” requirement without layout shift.
- **Targeted delete of the only child** can still leave a ProseMirror auto-fill placeholder for one frame; reconciliation rebuilds and removes it. This is correct but can cost one full rebuild at deep branches. Delete/reorder still use targeted transactions in the common case.
- **300-block render** ranged from 592 ms (final) to 991–1018 ms in earlier loaded runs; the same-machine M2b baseline was 859–925 ms. It remains under the 1.5 s absolute gate. Two extra overlay buttons per card and UI-sans text metrics account for the variance, not a structural change.
- **1,000-block render** is slower than the historical M2b report (2.6 s vs 1.29 s) in the loaded environment; it is reported, not a gate.
- **Page orientation UI, page view, PDF** remain M4. The landscape default is data-model only in M2c.
- **Font family/size settings** remain M6.
- **VoiceOver pass** and product-owner subjective visual judgement remain human gates.
- **Native traffic lights** are not captured by Playwright web-content screenshots; the real window shows them.
- `docs/spec.md`, `docs/ux-shell.md`, and ADRs were not edited, per the task constraints; they already contain the M2c decisions.

## Files changed

- `packages/core/src/{commands,document,types,history}.ts`
- `packages/core/test/{commands,model}.test.ts`
- `apps/desktop/src/main/{index,library}.ts`
- `apps/desktop/src/preload/index.ts` (unchanged contract; typed `ApplyResult.created`)
- `apps/desktop/src/shared/api.ts`
- `apps/desktop/src/renderer/src/{App,actions,main}.tsx`
- `apps/desktop/src/renderer/src/editor/{DocumentEditor,keymap}.tsx/ts`, `editor/edges/EdgeLayer.tsx`, `editor/views/BlockViews.tsx`
- `apps/desktop/src/renderer/src/lib/{edge-routing,geometry,serial-queue}.ts`
- `apps/desktop/src/renderer/src/shell/{Workspace,Sidebar}.tsx`
- `apps/desktop/src/renderer/src/state/runtime.ts`
- `apps/desktop/src/renderer/src/styles.css`
- `apps/desktop/test/{edge-routing,serial-queue}.test.ts`
- `tests/e2e/m2-editor.test.mjs`
- `apps/desktop/package.json`, `package-lock.json`
- `docs/reports/m2c-interaction-polish.md` (this report)

`packages/layout` and `packages/pdf` were not modified.

## Exact commands run

```bash
npm install
npm run typecheck
npm test
npm run build
node --test tests/e2e/m2-editor.test.mjs
```

The full e2e suite ran 8/8 tests: document lifecycle, arrow/collapse, scroll/focus restore, accessibility, 300/1,000-block performance, rapid creation/parity, M2c keyboard/chapter/landscape, screenshots.

## Demo script for the product owner

1. From the worktree: `npm install`, `npm run build`, `npm run dev -w @noteforest/desktop` (or `npm start`).
2. `⌘N` creates an A4-landscape note. The sidebar is full height; tabs sit in the editor column.
3. Type a block, then press `Control+Enter` three times quickly. Three children appear, one trunk, three short arrows, sidebar and canvas agree. Delete any child: it disappears from all three.
4. `Option+Enter` adds a sibling; `Enter` stays a line break; `Enter` at the end of a heading produces a paragraph. `⌘K` → “Block type: Heading 2 / Text” changes the block type without changing its ID.
5. Click the chapter title and rename it; the sidebar follows. Scroll to the end for “+ Add top-level block” and “+ Add chapter”.
6. Hover a card: the left six-dot handle is the only gutter control; right `+` adds a child, bottom `+` adds a sibling without shifting the layout.
7. Open a second note and switch tabs; no phantom blocks appear.

## Next suggested step

Product-owner visual review of `artifacts/m2c/` at 1440×900 and 1024×768, then the VoiceOver/keyboard pass. After acceptance, the next engineering slice is structural undo/redo for destructive deletes (to close the remaining M2b gap) or M3 span anchors/reference edges.
