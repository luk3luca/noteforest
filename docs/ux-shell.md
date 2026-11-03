# NoteForest — Desktop shell (M2)

**Status:** Approved direction for the editor-first slice  
**Owner:** Orchestrator + UX  
**Date:** 3 November 2026  
**Scope:** the touchable desktop shell and continuous block editor. No page view, no PDF, no branches/anchors yet.

## Why this comes first

The Spike 1 PDFs proved the paginator and `printToPDF`, but they were fixture documents. They had no real branches, so they could not show the product's arrows; some edge routes looped backwards; and without an editor the product owner could not touch the product and judge it.

The next slice is therefore the **editable shell**: open documents, edit blocks, switch tabs, save, reopen. The page/PDF pass comes after this and is driven by real documents.

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
│  + New note   │  ┌──────────────────────────────────────────────┐  │
│               │  │ Eigenvalues                                  │  │
│  LIBRARY      │  │ An eigenvalue is a scalar λ such that ...    │  │
│  ▾ Documents  │  └──────────────────────────────────────────────┘  │
│    Linear alg.│                                                    │
│    Algorithms │  ┌──────────────────────────────────────────────┐  │
│               │  │ Eigenvector                                  │  │
│  OUTLINE      │  │ A nonzero vector v satisfying Av = λv.       │  │
│  ▾ Chapter 1  │  └──────────────────────────────────────────────┘  │
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

- A continuous vertical scroll, not paginated. The page view is M4.
- Content column max-width 720 px, centered; generous side gutters.
- Chapter heading at the top of each chapter, then top-level block cards.
- Block cards: 1 px border, 6 px radius, 12–16 px padding, 8 px vertical gap. The focused block gets a quiet accent border; selection is text selection, not a card highlight.
- Only one block editor is active at a time. Clicking a block opens it; `Esc` commits and returns to navigation.
- Inline formatting toolbar appears on text selection (bold, italic, code, link, math). No permanent toolbar.
- Slash menu `/` for block types is a SHOULD in M2; command palette is the fallback.
- Empty block shows a quiet placeholder ("Type something, or press /").
- Collapse control on a block with children; hidden-count badge.
- No page-break markers, no page guides, no PDF controls in M2.

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
| New block below | `Enter` at end of block |
| New child | `Tab` on a block (reparent under previous sibling) |
| Outdent | `Shift-Tab` |
| Merge with previous | `Backspace` at start of an empty/first block |
| Focus previous/next block | `↑`/`↓` at block boundary or `⌘↑`/`⌘↓` |
| Collapse/expand block | `⌘.` or chevron |
| Rename document | double-click title in tab/sidebar |
| Delete block | `⌘⌫` with confirmation if it has children |

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

- Branches, arrows, anchors, shared children (M3).
- Page view, adaptive spatial layout, page-break markers, PDF export (M4).
- Right inspector, backlinks panel, graph view, tags, plugins.
- Split view, multiple windows, pinned tabs.
- Light theme (can be a follow-up), custom themes, mobile/iPad.
- Collaboration, sync, accounts.

## Acceptance for the shell

- App launches to a restored session or a calm empty state.
- Create a document, add chapters/blocks, edit rich text, autosave, reopen; content is preserved.
- Open two documents in tabs; switch, close, dirty state, per-tab scroll/focus.
- Sidebar library and outline are readable and navigable; `⌘B` collapses.
- Keyboard structural commands work; undo is predictable.
- 300 blocks remain usable.
- Product-owner visual check: calm, Obsidian-like, no AI-slop patterns.
- Screenshots: shell with two tabs, sidebar tree, editor with mixed content, empty state.

## Component source

The concrete component library and copy-in map are decided in `research/ui-components.md` (Scout). The shell must adapt components to these tokens; do not ship a library's default dashboard look.
