# ADR-0004 — UI shell and branch editor stack

- **Status:** Accepted
- **Date:** 3 November 2026
- **Decision owner:** Orchestrator (UI details delegated by the product owner)
- **Depends on:** ADR-0001 (Electron), `research/ui-components.md`, `docs/ux-shell.md`
- **Changes:** ADR-0001 listed React Flow for graph interaction; M2 uses a custom SVG edge overlay instead

## Context

M2 is the first touchable slice: an Obsidian-like shell (library sidebar, document tabs, command palette) and a continuous branch editor with primary block-to-block arrows. The product owner explicitly rejected AI-slop UI and asked for real component libraries adapted to the product.

The shell is not a form problem. It is a **tree, focus, keyboard, and overlay** problem. The branch editor is not a freeform canvas: positions are structural, block content is live ProseMirror text, and the sidebar tree is the accessible equivalent of the spatial view.

We need one interaction engine, real DOM text editing, accessible tree navigation, and a calm visual system. We do not need a graph SDK, a canvas SDK, or a full UI framework.

## Decision

### Component base

Use **shadcn/ui with the React Aria base** (`npx shadcn@latest init --base aria`) and **Tailwind CSS v4**.

- shadcn is copy-in source (MIT); we own the components and can restyle them completely.
- React Aria Components (Apache-2.0) provide tree, menu, dialog, tooltip, popover, autocomplete, and focus management.
- One accessibility engine for shell and editor; no Radix/React Aria mix.

Approved dependencies:

| Dependency | Licence | Use |
|---|---|---|
| `react-aria-components` | Apache-2.0 | Tree, Collection, Virtualizer, DnD, focus |
| `react-resizable-panels@4` | MIT | Sidebar/editor split (`Group`/`Panel`/`Separator`) |
| `@dnd-kit/core` + `@dnd-kit/sortable` | MIT | Document tab reorder only |
| `sonner` | MIT | Toasts, restyled flat |
| `zustand` | MIT | Shell/session state (tabs, sidebar, palette, expanded nodes), not document content |
| `lucide-react` | ISC | Curated 16 px / 1.5 px icons |
| TipTap 3 + MIT extensions | MIT | Editor, bubble menu, drag handle, math, table, image, code highlight, placeholder |
| Source Serif 4 + JetBrains Mono woff2 subsets | OFL | Editor and code typography, bundled as assets |
| `shadcn` CLI | dev tool | Copy-in component generator; not shipped |

Rejected: React Flow, tldraw, Excalidraw, react-arborist, cmdk, Radix UI, Base UI, Ark UI, Park UI, Headless UI, Mantine, Chakra, MUI, Origin/coss, Cult UI, Kibo UI, RareUI, BoardUI theme, d3-hierarchy, ELKjs, dagre, perfect-arrows, react-xarrows.

RareUI is **rejected on licence and look**: MIT + Commons Clause + attribution is not OSI-open, and the visual language is frosted/springy/WebGL. BoardUI is **reference only**: its free components are MIT and React Aria-based, but the theme is dashboard/agentic and Pro is paid. Do not copy either theme.

### Shell

- Electron `BrowserWindow` with `titleBarStyle: 'hiddenInset'`, opaque background, real traffic lights, `setDocumentEdited` for the native dirty dot.
- Custom CSS grid + `react-resizable-panels` v4 for the sidebar/editor split.
- Custom tab strip (`role="tablist"`, roving tabindex, dirty dot, close, overflow, drag reorder with dnd-kit). No off-the-shelf tab component.
- Sidebar: custom sections; library list (flat) and React Aria `Tree` for the active document's chapters/blocks.
- Command palette: shadcn `Command` on React Aria Autocomplete inside a dialog; no `cmdk`.
- Menus, context menus, dialogs, tooltips: shadcn React Aria copies. Native Electron text context menu for editable text.
- Icons: lucide, curated; no emoji, no sparkle/bot/wand iconography.

### Branch editor

**CSS flow tree + measured SVG overlay.**

- Blocks are normal DOM flow: top-level blocks stack; a block with children is a flex row (card + children group); the group wraps below with an 18 px indent when it does not fit to the right.
- A custom TipTap `block` node with a block card node view; one ProseMirror document per open document. Do not create one editor per block.
- DOM order is depth-first reading order; the sidebar tree is the canonical accessible structure; edges are `aria-hidden`.
- One `ResizeObserver` + `requestAnimationFrame` measures card rects; a pure router computes orthogonal SVG paths in content coordinates.
- Arrows point **parent → child only**, arrowhead at the child. Right placement: right port → left port, rounded orthogonal elbow. Wrapped below: bottom trunk → bus → child top; no U-turn, no backwards loop.
- 1.25 px neutral edge, 1.75 px accent for the selected root→block path, 35% opacity for the rest. 3:1 minimum contrast. No gradient/glow/animation.
- Reparent in M2 is **menu/keyboard only** (`Move to…`), not free drag. Drag handle reorders siblings only. No free positioning, no minimap, no zoom/pan beyond scroll.
- Collapse hides a subtree and its edges; expansion state is per-document view state, not document content.

### Visual direction: Graphite

- Canvas `#17181A`, sidebar `#131416`, surface `#1B1D20`/`#202329`, border `#2E3238`.
- Text `#E7E8EA`, secondary `#A6ABB2`, tertiary `#7E848C`.
- Accent `#9BB7D4` (dusty slate blue); soft `#26313C`; edge `#5E6670`; danger `#D98B8B`; success `#8FBF9F`.
- UI: SF Pro/system 13 px; editor: Source Serif 4 17 px/1.65; code: JetBrains Mono 13.5 px/1.55.
- Radius 3 px controls, 4 px blocks, 6 px overlays; no radius > 6 px.
- Hairline borders; no shadows on chrome/cards/tabs; overlays only.
- Motion 120–180 ms, no spring/bounce; reduce to 0 under `prefers-reduced-motion`.
- No gradients, glass/vibrancy, glow, dot grid, purple accent, emoji, hero dashboards, or floating pill navigation.
- Light theme uses the Parchment variant; dark is the default.

### Keyboard corrections

- `⌘B` is bold in the editor; **toggle sidebar is `⌘\`**.
- `⌘K` command palette; `⌘⇧K` insert link (moves TipTap's default).
- `⌘N` new document; `⌘O` open; `⌘S` save; `⌘W` close tab; `⌘⇧W` close window; `⌘⇧T` reopen closed tab.
- `⌘1…9` tabs; `Ctrl+Tab` cycle; `⌘,` settings.
- Block selection: arrows navigate, `Enter` edits, `Cmd+Enter` adds child, `Cmd+Shift+Enter` adds sibling.
- Editing: `Enter` at end creates a sibling; `Tab` creates/reparents a child where legal; `Backspace` at start merges. Document the exact routing in the shell spec.

## Consequences

Positive:

- One accessible interaction engine; the sidebar tree is a real keyboard/screen-reader path.
- Live ProseMirror text stays in normal DOM flow: selection, IME, browser find, and accessibility work.
- No graph/canvas SDK; the SVG router is small, pure, and testable.
- The visual system is neutral and can survive a future page view.

Negative:

- shadcn's React Aria base is young (July 2026); individual wrappers may need replacement with direct React Aria compositions. Keep the tokens and replace one component at a time.
- CSS flex geometry is less precise than the page layout engine; uneven rows are possible. Cap widths, use gaps, and collapse; do not add a layout engine to M2.
- Arrow routing can get busy at 5+ children; ordered ports, a shared trunk, and collapse are the mitigations.
- Live measurement can jank if the observer writes layout state; only edges update immediately, full pass is debounced.
- Adds dependencies; all are permissive and approved above.

## Gates

- `edge-routing.ts` unit tests: right, below, multiple children, endpoint clipping, arrow direction, no backwards path.
- Shell keyboard: tabs, tree, palette, dialogs, focus restore; `Cmd+W` closes a tab, not the window.
- Accessibility: axe + keyboard-only + VoiceOver pass; 200% zoom.
- Visual: screenshots at 1440×900 and 1024×768; dark default; anti-slop checklist from `research/ui-components.md` §6.8.
- Performance: 300 blocks initial render < 1.5 s, one-edit edge recompute < 8 ms, scroll 60 fps; 1,000 blocks with collapse reported.
- Electron smoke: dirty dot in traffic lights, native text context menu, quit-with-unsaved prompt, reopen session.

## Addendum — M2c interaction polish (4 November 2026)

The product owner reviewed M2b and approved these corrections. They refine the M2 shell; they do not change the stack.

1. **Arrow grouping.** A single child keeps a simple elbow. Two or more primary children in the same sibling group use one shared vertical trunk from the parent's right edge, with a short arrow at each child's level. Wrapped children use a bottom trunk and a horizontal bus, then short arrows into the child tops. Arrowhead only at the child; no U-turns.
2. **Shell layout.** The title bar spans the window; the sidebar reaches the full content height on the left; the tab strip lives only in the editor column, to the right of the sidebar.
3. **Editor typography and density.** The editor uses the system UI sans, not Source Serif 4: 15.5 px/1.55 body, 20/18/16 px headings, 10 px block padding, 16 px block gap, 28–40 px editor padding, canvas max ~1,400 px. A future Settings feature (M6) may expose font family/size and a serif option; do not build the picker in M2c.
4. **Keyboard model.** `Enter` and `Shift+Enter` are line breaks inside the block; `Option+Enter` creates a sibling block; `Control+Enter` creates a child block. `Tab` is list/code indent while editing, and “make child” only on a selected block (not while typing). Remove the old Enter-creates-sibling and Meta+Enter shortcuts.
5. **Chapter and top-level authoring.** Chapter titles are inline-editable in the canvas. The canvas end offers “Add top-level block” and “Add chapter”; the sidebar is no longer the only path.
6. **Child/sibling affordances.** The right edge `+` adds a child; a bottom `+` adds a sibling; the left gutter keeps only the drag handle. Every successful creation must show its arrow.
7. **Default page setup.** New documents default to A4 landscape (existing documents keep their orientation); the editor canvas uses the extra width. Page view/PDF consume this default in M4.
8. **Desync fix.** Structural commands are serialized; the created block ID comes from the command result, not a before/after diff; structural editor transactions are excluded from text history; after each structural command the editor is reconciled with the canonical document. A failure must never leave a canvas-only block. Regression: rapid child/sibling creation, sidebar/canvas parity, arrow count, delete works.

## Revisit triggers

- RAC Tree fails at 300–1,000 nodes after collapse/virtualization.
- CSS flow geometry cannot represent a real branch fixture without card overlap or unreadable rows.
- shadcn React Aria wrappers diverge from RAC behavior or block an upgrade.
- A future page view requires the computed layout engine; converge behind the same `BranchGeometry` interface rather than replacing the editor.
