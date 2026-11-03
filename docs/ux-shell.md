# NoteForest — Desktop shell (M2)

**Status:** Approved direction for the editor-first slice  
**Owner:** Orchestrator + UX  
**Date:** 3 November 2026  
**Scope:** the touchable desktop shell and continuous branch editor, including basic block-level primary branches with visible arrows. No span anchors, reference edges, page view, or PDF.

## Why this comes first

The Spike 1 PDFs proved the paginator and `printToPDF`, but they were fixture documents. They had no real branches, so they could not show the product's arrows; some edge routes looped backwards; and without an editor the product owner could not touch the product and judge it.

The next slice is therefore the **editable shell with the distinguishing feature**: open documents, edit blocks, create block-level branches and see the arrows, switch tabs, save, reopen. Span anchors and reference edges come next; the page/PDF pass comes after that and is driven by real documents.

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

### Tab bar (top, 38 px)

- macOS traffic-light inset; the bar is draggable.
- One tab per open document, in open order.
- Dirty indicator: a dot before the title; saved state removes it.
- Close button on hover/focus; middle-click closes; `⌘W` closes the active tab.
- Overflow: horizontal scroll with a subtle fade, not a dropdown; a `+` button opens a recent/new menu.
- Tab reorder by drag; the active tab is visually distinct with the editor background, not a colored pill.
- `⌘1…9` switches to tab N; `⌘⇧[` / `⌘⇧]` previous/next.
- No nested tabs, no split view, no pinned tabs in M2.

### Sidebar (left, 260–320 px, resizable)

- Header: app name (small caps or 12 px semibold), workspace/document search (`⌘K` command palette), `+ New note`.
- **Library:** a flat list of documents in the chosen folder, with a search field and a "Recent" section. Each row has a document icon, title, and (on hover) a `⋯` menu: rename, reveal in Finder, close.
- **Outline:** the active document's tree: chapters → top-level blocks → direct children. Expand/collapse with chevrons; indentation 12 px per level; guide lines 1 px and low contrast. Clicking a row focuses the block in the editor.
- M2 tree is read-only except click-to-focus and chapter collapse; block reorder via drag is optional if stable.
- Footer: settings icon, theme indicator, version. No user avatar, no "upgrade" card, no announcement.
- Collapse via `⌘B`; drag the divider to resize; width persists per window.

### Editor (center)

- A continuous **spatial branch editor**, not a paginated page and not a plain linear list. The page view is M4.
- Top-level blocks stack vertically in chapter order. A child is placed to the right of its parent when there is room; otherwise it wraps below the parent with a slight indent.
- Card widths are content-driven, clamped to a readable max (~420 px) or the available editor width for wide content (code, tables, images).
- Block cards: 1 px border, 6 px radius, 12–16 px padding. The focused block gets a quiet accent border; selection is text selection, not a card highlight.
- Primary arrows are SVG, drawn in an overlay above the cards: from the source block's right/bottom port to the target's left/top port. Solid, 1.25 px, muted; the selected arrow uses the accent color.
- Arrow routing must read forward: a child to the right uses a short horizontal curve; a child wrapped below uses a vertical/diagonal curve from the source bottom, never a loop back across the source card. If a route would cross the source, choose the nearest clear port.
- Only primary edges exist in M2: one parent per child, no reference edges, no shared children. The tree is acyclic; a cycle is rejected before mutation.
- No free positioning, no pins, no manual x/y. Only sibling order changes; layout is automatic and deterministic.
- Only one block editor is active at a time. Clicking a block opens it; `Esc` commits and returns to navigation; inactive cards render read-only.
- Inline formatting toolbar appears on text selection (bold, italic, code, link, math). No permanent toolbar.
- Slash menu `/` for block types is a SHOULD in M2; command palette is the fallback.
- Empty block shows a quiet placeholder ("Type something, or press /").
- Collapse control on a block with children; hidden-count badge hides its subtree and arrows.
- A branch handle on each card starts a new child or a drag-to-reparent. The drop target highlights; an illegal drop is rejected.
- No page-break markers, no page guides, no PDF controls in M2.

### Branch arrows (M2)

- Every primary child gets exactly one arrow from its parent. The arrow starts at the parent card's right edge (or bottom edge when the child wraps) and ends at the child's left edge (or top edge).
- Arrows are behind the active editor overlay but above the background; they never capture text selection.
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
| Toggle sidebar | `⌘B` |
| Command palette | `⌘K` |
| New document | `⌘T` (opens a new untitled doc in a tab) |
| Open document | `⌘O` or sidebar click |
| Save | `⌘S`; autosave after 800 ms idle |
| Close tab | `⌘W`; prompt if dirty |
| Switch tab | `⌘1…9`, `⌘⇧[` / `⌘⇧]` |
| New block below | `Enter` at end of block (sibling) |
| New child branch | `Tab` on a block, or drag from its branch handle to empty space |
| Reparent | Drag a block onto a legal parent, or `Tab` on the block under the previous sibling |
| Outdent | `Shift-Tab` (target becomes a sibling of its parent) |
| Merge with previous | `Backspace` at start of an empty/first block |
| Focus previous/next block | `⌘↑` / `⌘↓` |
| Collapse/expand block | `⌘.` or chevron |
| Select/delete branch | Click the arrow; `Delete` or the inline action; target becomes top-level |
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

**Mood:** a quiet desk at night. Near-black, low contrast, one restrained accent, excellent type.

| Token | Value |
|---|---|
| `--bg` | `#1b1b1b` |
| `--bg-sidebar` | `#171717` |
| `--bg-elevated` | `#202020` |
| `--border` | `#2b2b2b` |
| `--border-strong` | `#3a3a3a` |
| `--text` | `#d7d7d7` |
| `--text-muted` | `#8b8b8b` |
| `--text-faint` | `#666666` |
| `--accent` | `#9ec5a8` (muted forest green) |
| `--accent-strong` | `#bfe0c7` |
| `--danger` | `#d98b8b` |
| `--selection` | `rgba(158, 197, 168, 0.22)` |

- **UI type:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui`; 13 px/1.4; tab labels 12.5 px; sidebar rows 13 px.
- **Editor type:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui`; 16 px/1.65; max 68–72 characters per line; headings 22/18/16 px semibold.
- **Code:** `"SF Mono", ui-monospace, Menlo, monospace`; 13 px/1.55.
- **Math:** KaTeX; inherit body color; display math centered with 12 px vertical margin.
- **Radius:** 6 px for cards/inputs; 4 px for small controls; never pill-shaped except tags.
- **Borders:** 1 px; no card shadows. Menus/popovers may use one soft shadow.
- **Icons:** Lucide, 16 px, 1.5 px stroke; no colored emoji.
- **Motion:** 120–160 ms ease-out for sidebar/tabs/menus; no bounce, no spring, no shimmer.
- **Focus:** 1 px accent border/ring, not a glow.
- **Empty state:** plain text and one primary action; no illustration, no mascot.

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
- Page view, adaptive page layout, page-break markers, PDF export (M4).
- Right inspector, backlinks panel, graph view, tags, plugins.
- Split view, multiple windows, pinned tabs.
- Light theme (can be a follow-up), custom themes, mobile/iPad.
- Collaboration, sync, accounts.

## Acceptance for the shell

- App launches to a restored session or a calm empty state.
- Create a document, add chapters/blocks, edit rich text, autosave, reopen; content is preserved.
- Open two documents in tabs; switch, close, dirty state, per-tab scroll/focus.
- Sidebar library and outline are readable and navigable; `⌘B` collapses.
- Create a child branch from a block; the arrow is visible, starts at the source and ends at the target, and never loops backwards across the source.
- Reparent/reorder updates the arrow and layout; deleting the edge makes the target top-level; a primary cycle is rejected.
- Keyboard structural commands work; undo is predictable.
- 300 blocks remain usable.
- Product-owner visual check: calm, Obsidian-like, no AI-slop patterns.
- Screenshots: shell with two tabs, sidebar tree, branch editor with arrows, mixed content, empty state.

## Component source

The concrete component library and copy-in map are decided in `research/ui-components.md` (Scout). The shell must adapt components to these tokens; do not ship a library's default dashboard look.
