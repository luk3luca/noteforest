# M2b — Editor shell + branch editor

**Status:** Approved to start after M2a core is available  
**Owner:** Builder (worktree)  
**Depends on:** M2a `packages/core`, ADR-0001, ADR-0004, `docs/ux-shell.md`, `research/ui-components.md`  
**Out of scope:** span anchors, reference edges/shared children, page view, PDF, external API, MCP, collaboration, plugins, iPad

## Goal

Build the first touchable product: an Obsidian-like desktop shell around a continuous branch editor. The product owner must be able to create/open documents, edit blocks, create primary child branches and see correct arrows, switch documents in tabs, save, and reopen.

This is a barebone, but it must include the distinguishing feature: **explicit block-to-block branches with visible arrows**.

## Stack (approved in ADR-0004)

- shadcn/ui with the React Aria base: `npx shadcn@latest init --base aria`; Tailwind CSS v4.
- React Aria Components for Tree, menus, dialogs, tooltips, command palette.
- `react-resizable-panels@4` for the sidebar/editor split.
- Custom tab strip + `@dnd-kit/core`/`sortable` for tab reorder.
- TipTap 3 + custom `block` node, `BlockCard` node view, BubbleMenu, DragHandle, math/table/image/code extensions.
- Sonner toasts, Zustand shell state, lucide icons.
- Source Serif 4 + JetBrains Mono woff2 assets (OFL).
- Custom SVG edge overlay + pure orthogonal router.

Do **not** add React Flow, tldraw, Excalidraw, RareUI, BoardUI theme, cmdk, Radix/Base UI/Mantine/Chakra/MUI. BoardUI is reference only.

## Scope

### 1. Window and shell

- Electron `BrowserWindow` with `titleBarStyle: 'hiddenInset'`, opaque background, real traffic lights, `setDocumentEdited` for native dirty dot.
- 38 px title bar: traffic lights inset, app/document title, `⌘K` button, settings; draggable empty region.
- 36 px tab strip below: custom `role="tablist"`, one tab per open document, dirty dot, close, overflow chevron, drag reorder, `⌘1…9`, `⌘W` close tab, `⌘⇧W` close window, `⌘⇧T` reopen closed.
- Sidebar 264 px default (208–360, resizable via `react-resizable-panels`), two sections:
  - **Library**: flat documents list, search, `+ New note`, recent; click opens; context menu rename/reveal/close.
  - **Topics**: active document tree (chapters → blocks → primary children) using React Aria `Tree`; keyboard, type-ahead, expand/collapse, inline rename, click-to-focus.
- Collapse sidebar `⌘\` (`⌘B` is bold in the editor). Sidebar width persists.
- Command palette `⌘K`: shadcn React Aria Command inside a dialog; documents, blocks, commands; focus restore.
- Native macOS menu: File/Edit/View/Window/Help; Close Tab on `⌘W`, Close Window on `⌘⇧W`, Settings `⌘,`, native text context menu.
- Status bar 24 px: save state, word count, block count, document path (click reveals in Finder).

### 2. Documents and persistence

- Use `packages/core` for document types, commands, validation, atomic save, backups, revision, lock, recent manifest.
- Open/create documents in a library folder (default `~/Documents/NoteForest`, user can choose later).
- Autosave 800 ms debounce; `⌘S` flushes; status bar reflects Saved/Saving/Unsaved/Save failed.
- Restore open tabs, active tab, per-tab scroll/focus on launch; missing files show a quiet row with Remove/Retry.
- Close tab prompts if dirty and autosave has not flushed. Quit/close window uses native Save / Don't Save / Cancel.
- One active editor per document. No two live editors on the same document.

### 3. Branch editor

- One TipTap 3 ProseMirror document per open document; custom `block` node with `blockId`; one node per content block.
- Recursive DOM-flow rendering: top-level blocks stack in a single column; a block with children is a flex row (card + children group); children group wraps below with 18 px indent when it does not fit.
- Geometry: top-level max 34 rem (544 px); child cards 160–420 px; editor canvas max ~1,100 px with 40–56 px padding; sibling gap 24 px; block padding 12 px; radius 4 px.
- `BlockCard`: child surface `--surface-1`, no default border; top-level transparent; hover `--surface-2`; selected inset 1 px accent ring; editing caret; one active editor.
- 20 px block gutter: six-dot drag handle (sibling reorder only) and `+` add child; appears on hover/selection.
- Edges: SVG overlay inside the content wrapper, `aria-hidden`, behind cards; one `ResizeObserver` + rAF; content coordinates; pure orthogonal router.
  - Right child: parent right port → child left port, 6 px rounded elbow.
  - Wrapped child: bottom trunk at parent.left + 18 px → bus 12 px above first child row → child top centre.
  - Multiple right children: ordered ports, short shared trunk when ports get closer than 8 px.
  - Arrowhead only at the child; 1.25 px `--edge`; selected root→block path 1.75 px accent; other edges dim.
  - No backwards U-turns; if a route would cross the source, choose the nearest clear port or flag a layout defect.
- Selection: `selectedBlockId` + `editingBlockId`; ProseMirror `NodeSelection` drives selected state; sidebar sync both ways.
- Collapse: chevron + plain child count; hides subtree and edges; state per document view state, not document content.
- Structural commands:
  - `Enter` at end of block creates a sibling; `Tab` creates a primary child (where legal); `Shift-Tab` outdents; `Backspace` at start merges; `Cmd+Enter` add child; `Cmd+Shift+Enter` add sibling.
  - Reparent via `Move to…` menu/keyboard only; no free drag-to-reparent in M2.
  - Delete primary edge: target becomes top-level; delete block with promote/subtree choice.
  - Cycle/two-primary-parent attempts rejected with a clear message.
- Reference edges, anchors, page markers, PDF controls: not present.

### 4. Content

- TipTap schema: paragraph, heading 1–3, bullet/ordered list, list item, blockquote, code block (lowlight), inline/display math (KaTeX), image (local asset), table, hard break, link.
- Inline toolbar on selection: bold, italic, code, link (`⌘⇧K`), math.
- Slash menu SHOULD: paragraph, heading, list, code, math, image, table. No AI commands.
- Empty block placeholder only when focused.
- Images: local assets only; no remote URLs. Paste image copies into the document assets folder (if M2a supports it; otherwise defer).

### 5. Visual system

Use the Graphite tokens and typography from `docs/ux-shell.md` and ADR-0004. No default shadcn/BoardUI look. Required:

- Dark default; light tokens may be defined but a full theme toggle is optional.
- No gradients, glass/vibrancy, glow, dot grid, emoji, hero dashboards, floating pill nav, shadows on chrome/cards/tabs.
- 1 px hairline borders; radius 3/4/6 only.
- Lucide 16 px, 1.5 px stroke; no sparkle/bot/wand icons.
- Motion 120–180 ms; no spring/bounce; respect `prefers-reduced-motion`.
- Focus 2 px accent ring, 1 px offset; always visible.
- Screenshots at 1440×900 and 1024×768, dark; empty state, two tabs, branch tree, selected path, command palette.

## Tests and gates

- **Unit:** `edge-routing.ts` (right, below, multi-child, endpoint clipping, marker direction, no backwards path); geometry (top-level stack, right-fit, wrap, indent, deterministic order).
- **Component:** tab strip keyboard/close/reorder; tree expand/rename/selection; palette focus restore; block selection vs editing; structural commands; undo.
- **E2E:** create document → add chapter/blocks → create child branch → arrow appears → reparent/reorder → save → quit/reopen → content, arrows, tabs, scroll/focus restored.
- **Two documents:** open two docs in tabs; switch; dirty states; close one; session restore.
- **Performance:** 300 blocks / depth 4; initial render < 1.5 s; one-edit edge recompute < 8 ms; full reflow < 50 ms; scroll 60 fps. Report 1,000 blocks with collapse (not a hard gate).
- **Accessibility:** axe on shell/tree/palette/dialog; keyboard-only run; VoiceOver manual pass; 200% zoom.
- **Electron smoke:** `⌘K`, `⌘W` closes tab not window, `⌘⇧W` closes window, `⌘\` sidebar, `⌘1…9`, native text context menu, dirty dot, quit-with-unsaved prompt.
- **Visual:** anti-slop checklist in `research/ui-components.md` §6.8; product-owner review.

## Deliverables

- App shell + editor implementation under `apps/desktop/src/renderer` (module layout in `research/ui-components.md` §5.4).
- Shared pure `edge-routing.ts` and `geometry.ts` with unit tests.
- E2E tests and screenshots.
- `docs/reports/m2b-editor-shell.md` with what was built, gate table, measurements, known gaps, findings.
- Worktree path, branch, commits, commands.

## Non-negotiable

- Use `packages/core` for document mutations; no second store of document content.
- Zustand only for UI/session state; never mirror ProseMirror content on every keystroke.
- DOM order = depth-first reading order; sidebar tree is the accessible structure; edges `aria-hidden`.
- No free positioning, no pins, no page view, no PDF, no anchors/reference edges.
- No screen recording, no Notability, no manual app automation.
- Do not edit spec/UX/ADRs/plan. Report findings.
- No subagents; work in the worktree; commit in small steps; do not merge.

## Acceptance

The product owner can launch the app, create two documents, edit rich blocks, create a child branch and see a forward arrow, reparent/reorder, delete a branch, switch tabs, save, quit, and reopen with content/structure restored. It looks calm and Obsidian-like, not like a component demo.
