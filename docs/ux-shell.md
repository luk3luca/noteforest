# NoteForest — Desktop shell (M2)

**Status:** Approved direction for the editor-first slice  
**Owner:** Orchestrator + UX  
**Date:** 3 November 2026  
**Scope:** the touchable desktop shell and continuous branch editor, including basic block-level primary branches with visible arrows. No span anchors, reference edges, Page layout, or PDF.

**Revision note (7 November 2026).** ADR-0007 replaces the old "page view preview" assumption: the Page layout is the A4-bounded renderer (Read is exact and read-only now; Edit is planned), the Continuous layout's page-break markers are derived hints, and Page/PDF show the full document. The M2 shell description itself is unchanged; only the later-surface wording is updated.

## Why this comes first

The Spike 1 PDFs proved the paginator and `printToPDF`, but they were fixture documents. They had no real branches, so they could not show the product's arrows; some edge routes looped backwards; and without an editor the product owner could not touch the product and judge it.

The next slice is therefore the **editable shell with the distinguishing feature**: open documents, edit blocks, create block-level branches and see the arrows, switch tabs, save, reopen. Span anchors and reference edges come next; the Page/PDF pass comes after that and is driven by real documents.

## Product principles

1. **A study workspace, not a dashboard.** The document is the center; chrome recedes.
2. **Calm and dense.** Small type for chrome, comfortable type for reading, 1 px borders, no decorative shadows.
3. **Keyboard-first.** Every navigation action has a shortcut; the mouse is optional.
4. **One primary surface.** The editor is the main pane. No split editor, no right inspector in M2.
5. **Obsidian-like, not Obsidian-copy.** Familiar file tree + tabs + editor, but tuned to NoteForest's blocks and topics.
6. **No AI slop.** No gradients, glows, glassmorphism, oversized rounded cards, floating orbs, emoji icons, animated gradient text, or generic "dashboard" KPI blocks.

## Layout

```text
┌────────────────────────────────────────────────────────────────────┐
│  ○ ○ ○   [ Linear algebra ×] [ Algorithms ×] [+]        ⌘K  ⋯     │  tab bar 38 px
├───────────────┬────────────────────────────────────────────────────┤
│  NoteForest   │  Chapter 1 · Eigenvalues                           │
│  ⌘K Search    │                                                    │
│  + New note   │  ┌──────────────────────────┐   ┌───────────────┐  │
│               │  │ Eigenvalues              │──▶│ Eigenvector   │  │
│  LIBRARY      │  │ An eigenvalue is a ...   │   │ A nonzero ... │  │
│  ▾ Documents  │  └──────────────────────────┘   └───────────────┘  │
│    Linear alg.│                 │                                  │
│    Algorithms │                 ▼                                  │
│               │  ┌──────────────────────────┐                      │
│  OUTLINE      │  │ Spectrum                 │                      │
│  ▾ Chapter 1  │  └──────────────────────────┘                      │
│    Eigenvalues│                                                    │
│    Eigenvector│                                                    │
│               │                                                    │
├───────────────┴────────────────────────────────────────────────────┤
│  Saved · 312 words · ~/Notes/linear-algebra.json            Dark  │  status bar 24 px
└────────────────────────────────────────────────────────────────────┘
```

**Dimensions.** The wireframe compresses the two top rows. Final anatomy: 38 px title bar across the window; **sidebar full content height on the left**; **36 px tab strip only in the editor column**, to the right of the sidebar; sidebar 264 px default (180–640, collapsible); splitter 1 px visual / 8 px hit area; editor min 480 px; canvas max ~1,600 px with 28–40 px padding and horizontal scroll when a deep branch exceeds the viewport. The sidebar and editor scroll independently.

### Tab strip (36 px)

- macOS traffic-light inset; the bar is draggable.
- One tab per open document, in open order.
- Dirty indicator: a dot before the title; saved state removes it.
- Close button on hover/focus; middle-click closes; `⌘W` closes the active tab.
- Overflow: horizontal scroll with a subtle fade, not a dropdown; a `+` button opens a recent/new menu.
- Tab reorder by drag; the active tab is visually distinct with the editor background, not a colored pill.
- `⌘1`, `⌘4…9` switch to tab N; `⌘2`/`⌘3` are reserved for Continuous/Page; `⌘⇧[` / `⌘⇧]` previous/next.
- No nested tabs, no split view, no pinned tabs in M2.

### Sidebar (left, 264 px default, resizable 180–640 px)

- Header: app name (small caps or 12 px semibold), workspace/document search (`⌘K` command palette), `+ New note`.
- **Library:** a flat list of documents in the chosen folder, with a search field and a "Recent" section. Each row has a document icon, title, and (on hover) a `⋯` menu: rename, reveal in Finder, close.
- **Outline:** the active document's tree: chapters → top-level blocks → direct children. Expand/collapse with chevrons; indentation 12 px per level; guide lines 1 px and low contrast. Clicking a row focuses the block in the editor.
- M2 tree is read-only except click-to-focus and chapter collapse; block reorder via drag is optional if stable.
- Footer: settings icon, theme indicator, version. No user avatar, no "upgrade" card, no announcement.
- Collapse via `⌘\`; drag the divider to resize; width persists per window. (`⌘B` is bold in the editor.)

### Editor (center)

- A continuous **spatial branch editor**, not a paginated page and not a plain linear list. The Page layout is a later M4 slice.
- **Parent-relative placement:** a child group starts after its parent card plus the gap; it does not use a global x per depth. Same-depth blocks under different parents may sit at different x positions; this keeps a wide block local instead of widening the whole canvas.
- Top-level blocks stack vertically; siblings at the same depth stack vertically in their local group. Depth is shown by the branch structure, not by a global column grid.
- The editor scrolls horizontally when a deep branch exceeds the viewport. The Page layout/PDF applies the A4 width later (M4).
- Geometry: editor canvas max ~1,600 px with 28–40 px padding; top-level block max 30 rem (480 px); child cards 9–26.25 rem (144–420 px); parent-to-child group gap 24 px (10 px branch lead + 12 px stem + 2 px arrow gap); empty blocks use the minimum width, not the maximum.
- Block cards: child cards use `--surface-1` with no default border; top-level blocks are transparent. Focused block gets a quiet inset accent ring; selection is text selection, not a card highlight. Block padding 10 px; radius 4 px.
- Primary arrows are SVG, drawn in an overlay above the cards: from the parent's right branch port to the child's left edge. 1.25 px neutral; the selected root→block path is 1.75 px accent.
- **Arrow routing is designed and tested before being changed:** a routing lab compares orthogonal + fixed arrowhead, fan ports for close children, and a soft S-curve only for near-aligned cards; the chosen variant keeps a fixed-size arrowhead and a minimum horizontal stem so short branches do not squash the arrow.
- One child: a simple orthogonal elbow. Two or more children in one local group: one shared vertical trunk from the parent's branch port, with a short arrow at each child's level. The first child's branch is continuous with the parent port; the trunk starts at the T-junction (no gap). Close children get separated ports or a minimum stem so the arrowhead remains legible.
- Only primary edges exist in M2: one parent per child, no reference edges, no shared children. The tree is acyclic; a cycle is rejected before mutation.
- No free positioning, no pins, no manual x/y. Only sibling order changes; layout is computed and deterministic.
- Only one block editor is active at a time. Clicking a block opens it; `Esc` commits and returns to navigation; inactive cards render read-only.
- Inline formatting toolbar appears on text selection (bold, italic, code, link, math). No permanent toolbar.
- Slash menu `/` for block types is a SHOULD in M2; command palette is the fallback.
- Empty block shows a quiet placeholder ("Type something, or press /").
- **Collapse lives at the top-right of the card**, not in a footer: a subtle chevron on hover/selection; when collapsed, a compact dot with the child count remains. A one-line block stays one line; no in-flow margin is added.
- A 20 px block gutter holds only the six-dot drag handle. A `+` at the **right edge center** adds a child; a `+` at the **bottom edge** adds a sibling. The collapse button is top-right so it does not compete with `+`. Reorder among siblings only; reparent via `Move to…`.
- Chapter titles are inline-editable in the canvas (click, edit, `Enter`/`Esc` commits; sidebar stays in sync).
- Each chapter ends with “+ Add top-level block”; “+ Add chapter” inserts immediately after the active chapter. The sidebar is not the only path.
- **Zoom/fit-width** (`⌘-`, `⌘0`, `⌘+`) and **Focus branch** are navigation aids for deep indentation; they do not change layout or document data. The Page layout's page-width wrap belongs to M4.
- No page-break markers, no page guides, no PDF controls in M2.

### Branch arrows (M2)

- Every primary child gets exactly one arrow from its parent. The arrow starts at the parent's branch port and ends at the child's left edge.
- For two or more children in one sibling group, draw **one** vertical trunk from the parent's branch port and a short arrow from the trunk to each child; do not start a separate line at a different parent port for each child. The first child's branch is continuous with the parent port; the trunk joins at a T-junction with no gap.
- If the Page layout later wraps a child below (M4), the wrapped child's arrow enters its **left** side from the indent gutter, not its top. The editor itself places child groups parent-relative and scrolls horizontally, so it does not wrap.
- Arrows are behind the active editor overlay but above the background; they never capture text selection. They are `aria-hidden` and not tabbable. The branch port that toggles collapse is a real button (`aria-expanded`), not part of the decorative SVG.
- Clicking an arrow selects the edge and shows a small inline action: delete branch (target becomes top-level) or add label (SHOULD).
- Deleting a block with children uses the delete dialog: promote children or delete subtree; both keep arrows consistent.
- Reparenting moves the child and its subtree; the arrow re-routes and the layout reflows. Reordering siblings changes vertical order only.
- If the layout cannot place a child to the right or below without overlap, it is a layout defect shown quietly on the card; do not overlap or clip.
- Reference edges, anchored callouts, and cross-page arrows are M3/M4.

### Status bar (bottom, 24 px)

- Left: save state ("Saved", "Saving…", "Unsaved changes", "Save failed").
- Center/left: word count, block count.
- Right: document path on hover; theme indicator. Clicking the path reveals the file in Finder.

## Interaction model

| Action | Shortcut / behavior |
|---|---|
| Toggle sidebar | `⌘\` (`⌘B` is bold in the editor) |
| Command palette | `⌘K` |
| New document | `⌘N` (opens a new untitled doc in a tab) |
| Open document | `⌘O` or sidebar click |
| Save | `⌘S`; autosave after 800 ms idle |
| Close tab | `⌘W`; prompt if dirty |
| Close window | `⌘⇧W` |
| Reopen closed tab | `⌘⇧T` |
| Switch tab | `⌘1`, `⌘4…9`, `⌘⇧[` / `⌘⇧]` (`⌘2`/`⌘3` are Continuous/Page) |
| New line in block | `Enter` |
| Hard line break | `⇧Enter` |
| New sibling block | `⌥Enter` |
| New child block | `⌃Enter` |
| Make child (selected block only) | `Tab`; in lists/code `Tab` is indent |
| Outdent | `⇧Tab` on a selected block; `⌘[`/`⌘]` alternative |
| Merge with previous | `Backspace` at start of a non-empty block; on an empty block, `Backspace` moves the caret without deleting. Delete only with `⌘Backspace`/`Delete` on a selected block (confirm if it has children). |
| Focus previous/next block | `⌘↑` / `⌘↓` |
| Collapse/expand block | `⌘.` or chevron |
| Select/delete branch | Click the arrow; `Delete` or the inline action; target becomes top-level |
| Insert link | `⌘⇧K` (frees `⌘K` for the palette) |
| Rename document | double-click title in tab/sidebar |
| Delete block | `⌘⌫` with promote/subtree choice if it has children |

Structural commands are application commands, not raw editor behavior. Undo is one visible stack; text edits and structural commands must not fight.

## Document and persistence behavior

- Documents live in a user-chosen folder; each document is a folder with `document.json` + `assets/`.
- The app remembers the last folder, recent documents, open tabs, active tab, scroll and focus per tab.
- Autosave: debounce 800 ms; atomic write (temp + rename); backup rotation; a failed save shows a persistent status-bar error and blocks silent quit.
- On launch: restore the previous session's tabs if the files still exist; otherwise open the library/empty state.
- A missing/corrupt document opens read-only with a clear message; it is never overwritten.

## Visual direction (dark default)

**Direction: Graphite.** Cool near-black, one dusty slate-blue accent, hairline borders, real typography. Detailed rationale and anti-slop checklist: `research/ui-components.md` §6 and ADR-0004.

| Token | Value |
|---|---|
| `--canvas` | `#17181A` |
| `--sidebar` | `#131416` |
| `--surface-1` | `#1B1D20` |
| `--surface-2` | `#202329` |
| `--surface-3` | `#262A30` |
| `--border` | `#2E3238` |
| `--border-strong` | `#3C4148` |
| `--text` | `#E7E8EA` |
| `--text-secondary` | `#A6ABB2` |
| `--text-tertiary` | `#7E848C` |
| `--accent` | `#9BB7D4` |
| `--accent-soft` | `#26313C` |
| `--edge` | `#5E6670` |
| `--edge-active` | `#9BB7D4` |
| `--edge-muted` | `#3A3F46` |
| `--danger` | `#D98B8B` |
| `--success` | `#8FBF9F` |
| `--warning` | `#D6B17A` |

- **UI type:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`; 13 px/1.45; tab labels 12.5 px; sidebar rows 12.5 px/26 px.
- **Editor type:** system UI sans, same as chrome (`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`); 15.5 px/1.55; 66–72 characters per line; headings 20/18/16 px semibold. A future Settings feature (M6) may expose font family/size and a serif option; M2c does not build it.
- **Code:** `"JetBrains Mono", ui-monospace, SF Mono, monospace`; 13.5 px/1.55.
- **Math:** KaTeX; inherit body color; display math centered with 12 px vertical margin.
- **Radius:** 3 px controls, 4 px blocks, 6 px overlays; never > 6 px.
- **Borders:** 1 px hairline; no shadows on chrome, cards, tabs, or sidebar; overlays only (`0 8px 24px rgb(0 0 0 / .35)` popover, `0 24px 64px rgb(0 0 0 / .55)` dialog).
- **Icons:** Lucide, 16 px, 1.5 px stroke; no filled/multicolour icons, no emoji, no sparkle/bot/wand.
- **Motion:** 120 ms hover, 160 ms overlay, 180 ms sidebar; `cubic-bezier(.2,.7,.2,1)`; no spring/bounce; 0 ms under `prefers-reduced-motion`.
- **Focus:** 2 px `--focus-ring`, 1 px offset, inset inside blocks; always visible.
- **Empty state:** one line of secondary text and one action; no illustration, no mascot.

## Anti-slop checklist

- No gradients, glows, mesh backgrounds, glassmorphism, noise overlays.
- No oversized rounded cards or floating "stat" tiles.
- No emoji as UI icons; no colored gradient icon badges.
- No auto-playing carousels, animated counters, or shimmer placeholders.
- No generic "Welcome back, {name}" hero; no KPI dashboard.
- No three-column marketing layout inside the app.
- No drop shadows on every surface; no 24 px radii everywhere.
- No artificial "AI" sparkle icons or chat bubbles in the shell.
- Use one accent color and one type scale; if a component needs a second accent, reconsider.

## Out of scope for M2

- Span anchors on words, formulas, code, or image regions (M3).
- Reference edges, shared children, "see also" (M3).
- Page layout (Read now, Edit later), adaptive page layout, page-break markers, PDF export (M4).
- Right inspector, backlinks panel, graph view, tags, plugins.
- Split view, multiple windows, pinned tabs.
- Light theme (can be a follow-up), custom themes, mobile/iPad.
- Settings UI for font family/size (M6); tokens and defaults are prepared now.
- Collaboration, sync, accounts.

## Acceptance for the shell

- App launches to a restored session or a calm empty state.
- Create a document, add chapters/blocks, edit rich text, autosave, reopen; content is preserved.
- Open two documents in tabs; switch, close, dirty state, per-tab scroll/focus.
- Sidebar library and outline are readable and navigable; `⌘\` collapses.
- Create a child branch from a block; the arrow is visible, starts at the source and ends at the target, and never loops backwards across the source.
- With 2+ children, one shared trunk and a short arrow per child; wrapped children use the bottom bus.
- Rapidly create three children: sidebar, canvas, and arrow count stay in sync; no phantom block; each block is deletable.
- Chapter title is editable inline; “Add top-level block” and “Add chapter” work from the canvas.
- `Enter`/`Shift+Enter` are line breaks; `Option+Enter` sibling; `Control+Enter` child; `Tab` in a list is indent.
- Reparent/reorder updates the arrow and layout; deleting the edge makes the target top-level; a primary cycle is rejected.
- Keyboard structural commands work; undo is predictable.
- 300 blocks remain usable.
- Product-owner visual check: calm, Obsidian-like, no AI-slop patterns.
- Screenshots: shell with two tabs, sidebar tree, branch editor with arrows, mixed content, empty state.

## Component source

Decided in ADR-0004 and `research/ui-components.md`:

- **shadcn/ui with the React Aria base** + Tailwind v4 (copy-in components, not a runtime design system).
- React Aria `Tree` for the sidebar; custom tab strip with `@dnd-kit` for reorder; `react-resizable-panels@4` for the split; shadcn React Aria Command for `⌘K`; Sonner; Zustand; lucide.
- TipTap 3 with a custom `block` node and `BlockCard` node view; one ProseMirror document per open document.
- Custom SVG edge overlay + pure orthogonal router; no React Flow, tldraw, or Excalidraw.
- RareUI is rejected (licence + look); BoardUI is reference only (MIT free components, dashboard theme, Pro paid).

Do not ship a library's default dashboard look. Adapt every component to the Graphite tokens above.
