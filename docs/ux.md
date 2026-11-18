# NoteForest — UX and interaction

**Version:** v2.0, 18 November 2026 — describes the shipped 0.1.0 behavior.
**Owner:** UX / Product.
**Companion:** `docs/spec.md` (behavior and data model), `docs/design/shortcuts.md` (the full
keyboard catalogue), `docs/design/*` (surface specs).

---

## 0. Decisions

| # | Decision |
|---|---|
| 1 | Layouts **Continuous | Page** × modes **Edit | Read** (ADR-0007). Continuous + Edit is the default. |
| 2 | Page Read is the exact A4/PDF proof and read-only. Page Edit is opt-in, one block overlay, same geometry. |
| 3 | Switching layout preserves the mode; a mode switch is not undoable. |
| 4 | One document per tab, many tabs; one library per window. |
| 5 | The library is a recursive tree of folders, note packages and `.md` guest files. |
| 6 | Return creates a block; Shift+Return inserts a line break. Tab changes block structure; `⌘]`/`⌘[` indent list items. |
| 7 | Fixed logical order, adaptive geometry. Only sibling, top-level and chapter order change. |
| 8 | Pages are derived; there is no New Page, Split Page, or page container. |
| 9 | Anchors are created with a branch. A broken anchor falls back to the whole block and is repairable. |
| 10 | Collapse is an Outline/Continuous navigation aid; Page and PDF always show everything. |
| 11 | One visible undo stack with documented routing between text and structure. |
| 12 | No hover-only action: every pointer action has a menu item and a keyboard path. |
| 13 | One page orientation per document. |
| 14 | Broken or ambiguous anchors never delete a branch. |
| 15 | A `.md` file opens as a flat guest file: no forest, no Page, no PDF. |
| 16 | Manual page breaks are personal settings, not document structure. |
| 17 | Dark mode is the default; the Page paper is light in both themes. |
| 18 | Every application chord is matched through one catalogue, `lib/shortcuts.ts`. |

---

## 1. Scope and terminology

### 1.1 In scope

Authoring rich blocks; branches from blocks and anchors; shared children and reference edges;
Outline, Continuous and Page with Edit/Read; page breaks, manual hints, continuation; PDF export;
library and vault; tabs; find; highlights; document health; settings (Appearance, Page, Continuous,
Export); themes and density; Markdown guest files; release packaging.

### 1.2 Out of scope

iPad and Pencil; ink and page annotations; collaboration and sync; accounts; plugins and scripting;
in-app agent chat and a local API; databases, queries and a global graph; freeform canvas and free
positioning; a Markdown-native note format; auto-import of a forest from Markdown.

### 1.3 Terms

| Term | Meaning |
|---|---|
| **Block** | The unit of content, identity, branching and layout. |
| **Branch** | An arrow from a block or anchor to another block. Primary edges build the tree; reference edges cross-link. |
| **Anchor** | A span, term, token or image region inside a block that a branch starts from. |
| **Callout** | The rendering of an anchored branch: below its parent, or in its right lane on a Page. |
| **Outline** | The structural tree, the fastest editor. |
| **Continuous** | The vertical authoring surface with page-start markers. |
| **Page** | The A4 rendering of derived pages. |
| **Mode** | Edit or Read inside a layout. |
| **Library** | The recursive folder tree the app is bound to. |
| **Guest file** | A `.md` file opened flat. |
| **Health** | The anchor and structure audit surface. |
| **Breaks** | The list of manual page breaks with their derived page numbers. |

---

## 2. Personas and top tasks

**Primary user:** a STEM student who rewrites lecture notes as a structure, studies from it, and
annotates the exported PDF by hand.

**Top tasks, in order:** capture a topic and its first branches; branch from an exact word, term,
token or image region; reorganize without losing children; read the structure spatially; export and
study offline; trust that nothing is lost.

**Keystroke budget:** creating a block is one key (Return), a child one chord, a branch from a
selection one chord. A structural action that needs more than two keystrokes is suspect.

---

## 3. Principles and invariants

### 3.1 Principles

1. **Authoring speed is the product.** The outline and Continuous Edit must feel like a text editor
   that happens to have a graph underneath.
2. **One document, one paginator, two layouts.** Continuous and Page render the same document; Page
   and PDF share exact geometry. Continuous markers are derived hints, not a second layout.
3. **Fixed logical order, adaptive geometry.** The tree order is stable; widths adapt; children wrap
   below when room runs out. Only sibling order changes.
4. **Pages are a result, not a container.** The user edits content and adds hints; the paginator
   recomputes.
5. **Long blocks flow; atomic elements stay whole.** A line, image, formula, code line or table row
   is never cut.
6. **Spatial memory is preserved by order and by the tree.** A page break is a labelled event with a
   continuation, not a silent cut.
7. **Nothing is lost silently.** A lost anchor falls back with a marker and a repair path; an
   impossible element is an explicit defect, not clipped content.
8. **Structure is explicit.** A line between two blocks means something; parent and reference are
   visually distinct.
9. **The pointer is optional; the keyboard is complete.** Every pointer action has a menu item and
   a keyboard path.
10. **Export is a product surface.** The PDF is what the user studies on; it is previewed and
    tested like a screen.
11. **Layout stability is a feature.** Incremental reflow keeps authoring fast and moves only the
    affected subtree; a page setup change recomputes everything, deterministically.
12. **Mode is not layout.** Reading does not switch renderer; Page Read does not become editable
    just because the user wants to edit there.

### 3.2 Invariants

1. Any pointer action is available from the keyboard alone.
2. Editing text never deletes a branch.
3. A reference edge never changes position, outline order or pagination.
4. Switching layout, mode or view preserves selection, focus, chapter and position; it creates no
   undo entry.
5. Export never clips content; an impossible element blocks export with a fix path.
6. Undo restores blocks, branches, anchors, chapters and manual hints exactly.
7. Pagination is deterministic across Continuous markers, Page Read/Edit and PDF.
8. A block continues only at a safe boundary.
9. Sibling order is the only spatial change a user can make.
10. A `.md` file is never converted into a forest automatically.
11. Page and PDF always show the full document.
12. No destructive action is triggered by a single unmodified click.
13. No meaning is carried by color alone.

---

## 4. Information architecture

### 4.1 Window

- **Top bar (44 px):** tab strip and command palette button. Tabs show the document or file title, a
  dirty dot, and a close control.
- **Sidebar (left):** a 48 px activity rail (Library, Outline, Health) plus a resizable panel with
  tabs. The panel holds the active surface: Library, Outline, Health, Search or Breaks.
- **Canvas header (34 px):** find cluster, page pager, zoom stepper, layout and mode segments.
- **Canvas:** the active layout. Continuous or Page.
- **Status:** save state, document identity, secondary health indicator.

At 1120 px and below the sidebar collapses to its rail so the canvas header keeps a usable find
field at the 960 px window minimum.

### 4.2 Sidebar surfaces

| Surface | Content |
|---|---|
| **Library** | The vault tree: folders, note packages, `.md` guest files, ignored files. New note, new folder, rename, reveal, move, trash. |
| **Outline** | Chapters, top-level blocks, children, anchored children, reference indicators, page starts. |
| **Health** | Broken and ambiguous anchors, structure issues, unused images, with Locate and repair. Always shows counts, including zero. |
| **Search** | Find in the note with chapter groups and per-occurrence snippets; the shared query with the canvas find. |
| **Breaks** | Manual page breaks in document order, their derived page numbers, navigation and removal; a line when a break cannot be honoured. |

One sidebar tab is active at a time; the choice persists per window. The library is app-level and
works in Read mode; the other surfaces follow the active document.

### 4.3 Surfaces

| Surface | Purpose |
|---|---|
| **Outline** | Structure editing, navigation, collapse, page starts. |
| **Continuous Edit** | The primary authoring surface: content, branches, anchors, drag. |
| **Continuous Read** | A read-only continuous scroll with page starts. |
| **Page Read** | The exact paginated proof; selection, navigation, zoom, links. |
| **Page Edit** | Opt-in overlay editing one block on the page. |
| **Settings** | Appearance, Page (global and per document), Continuous, Export, Editor shortcuts. |
| **Command palette** | Every command, with the current chord. |
| **Dialogs and sheets** | Export, page setup, table size, confirmations, recovery. |

### 4.4 Layout and mode model

Layout and mode are independent: Continuous | Page × Edit | Read. The switch is in the canvas
header and in the View menu. Page Edit is opt-in and never opens automatically. Entering Read closes
in-place editors and blocks content mutations, including node-view controls.

### 4.5 Selection, focus and navigation

- Clicking a block selects it; clicking text enters the editor.
- The gutter is the explicit block-selection entry.
- Selection is stored by block ID, so it survives reflow, repagination and view switches.
- Focus is visible on blocks, ports, anchors, page controls and toolbar controls.
- Selecting a search result, a see-also link or a Health row reveals the block: ancestors expand,
  the layout switches if needed, the page scrolls.
- Breadcrumbs show chapter and ancestors.

### 4.6 Settings

Settings is a modal with tabs. Page settings are **global defaults with a per-document override**;
the override is bound to the document ID and survives moves. Appearance, Continuous and Export are
global. The Editor tab lists every shortcut, searchable, rendered from the catalogue.

---

## 5. First run and empty states

- First run shows the no-library state, with actions to open an existing library or create one.
- A new note starts with one chapter and one empty top-level block, caret inside. A draft lives in
  memory until the first real edit; closing an untouched draft writes nothing.
- Empty document: the outline shows the empty block with a hint; Continuous shows the same block;
  Page shows one empty page.
- Empty library: a short explanation and a **New note** action, no marketing hero.
- Empty search: a one-line prompt. No results: `No results`.
- Health always shows sections and counts, even at zero.
- Loading: progress where work is measurable; no shimmer placeholders.

---

## 6. Core flows

### F1 — Create, open, save, close

**New note.** The library's **New note** creates a draft in the bound library. The first real
mutation materializes one package and swaps the tab path without remounting.

**Open.** From the library tree, a tab, session restore, or a file drop. A note already open
focuses its tab instead of opening a second copy. A newer schema opens read-only with a banner.

**Save.** Autosave after a short pause, atomically. `⌘S` flushes immediately without a dialog. The
status surface shows saving, saved, or a failure with an action. There is no "Saved" toast.

**Close.** An untouched draft writes nothing. A note with a failed save asks: retry, save a copy, or
close without saving. A `.md` guest file with unsaved edits asks Save / Don't Save / Cancel.

**Missing or moved files.** A missing note or file keeps the tab with its last content and a
banner: the document is no longer at its location, with locate and recovery actions.

### F2 — Add a chapter, top-level, sibling or child

| Action | How |
|---|---|
| New chapter | Chapter menu, command palette, or the outline's chapter control. |
| New top-level block | Block menu → Add top-level block. |
| New sibling | Return in a block, or Block → Add sibling. |
| New child | Add child from the block menu, the branch handle, or the child chord. |

Rules: Return in the middle of text splits; at the end it creates a sibling after the block's
visible subtree. A new child of a collapsed block expands it. A new block inherits nothing. Return
on an empty block outdents it; at top level it deletes the block and focuses the previous one.
Backspace at the very start of a block never merges it into the previous block: structural delete
is explicit. Shift+Return inserts a line break inside the block.

### F3 — Edit content

**Text.** Click or Enter to edit. Markdown input rules convert headings, lists, quotes, emphasis,
inline code and formulas as you type. Esc leaves editing and commits; undo is `⌘Z`.

**Formula.** `$…$` inline and `$$…$$` display, with in-place source editing and a live preview.
Invalid LaTeX keeps the source and shows an inline error; it never discards content.

**Code.** Fenced code with a language, syntax highlighting, line numbers, copy, and three exits.
Auto-closing fences appear idle, on hover and while editing. Tab indents inside code.

**Tables.** An N×M picker inserts a table; a contextual toolbar adds rows and columns; Tab appends a
row. Cells are inline-only; a legacy cell with block content opens in the unreadable state and is
never flattened.

**Images.** Insert from disk; the bytes are copied into the package. The image scales to the card,
keeps its aspect ratio, and shows a placeholder when the asset is missing. Region anchors are
created from the image toolbar.

**Lists.** Return continues a list; Return on an empty item ends it. `⌘]`/`⌘[` indent and outdent a
list item; Tab still moves the block.

### F4 — Branch from a whole block

Select a block and add a child from the block menu, the branch port or the child chord. A new empty
child is created, the parent expands, the branch is drawn and the caret is in the child. A new direct child is placed last
among direct children; anchored children come first. Branch creation always creates a new block; to
connect to an existing block, use F8.

### F5 — Branch from an anchor

1. Select a word, phrase, formula term, code range or image region inside one block.
2. The selection toolbar offers **Branch**, **Highlight**, **Link**.
3. Branch creates the anchor and a child in one step. A text anchor shows a small marker at the end
   of the span; a formula term shows a best-effort marker or the formula edge; code shows a range
   marker; an image region shows a numbered marker.
4. Type in the child. Esc leaves editing.

Rules: an anchor lives inside one block; a multi-block selection is rejected with
"Anchors work within one block." A text selection may span inline math and images; it may not cross
a display-math node, an image, a code block or a table cell. Branching the same span again adds
another branch to the same anchor. Overlapping anchors keep separate IDs. Removing the last branch
leaves the anchor idle: the marker hides and no callout remains; an explicit **Remove anchor**
deletes it. A lost span falls back to the whole block, shows a broken marker, and stays repairable
from Health. The branch is never deleted. Anchored children render as callouts and paginate like any
branch.

### F6 — Reorder, reparent, detach

| Action | Result |
|---|---|
| Move up/down among siblings | The block and its subtree move; order changes. |
| Indent | The block becomes a child of the previous sibling. |
| Outdent | The block becomes a sibling of its former parent; at top level it does nothing and shows a hint. |
| Drag a block before/after another | Reorders among siblings; a drop line shows the target. |
| Link as reference… | Creates a reference edge from the block menu; layout does not change. |
| Move to… | Moves the block under another parent or chapter, with a role choice when the target already has a parent. |
| Anchored reparent | Creating a primary edge from an anchor **demotes** the target to a reference; the child is not duplicated. |
| Detach from parent | The block becomes a top-level block at the top of its chapter. |

Rules: reparenting moves the whole subtree; the layout and pagination re-run. Moving a block into
its own descendant is refused and offers **Link as reference**. Every structural move is one undo
step. Drag reorders vertically only; it does not reparent and there is no horizontal drag.

### F7 — Collapse and expand

Collapse hides primary descendants and anchored callouts in Outline and Continuous, reclaims space
and shows the hidden count. Expand restores them. Collapse is shared by Outline and Continuous,
persisted as view state, and **not undoable**. Page and PDF always show the full document; a
collapse chord in Page says so instead of changing the page. Collapsing a block whose descendant is
selected moves the selection to the collapsed block.

### F8 — Shared children and reference links

A block has one primary parent and any number of reference links. **Link to block** opens a
searchable picker with chapter context and the derived page. A reference edge is dashed and
visually distinct; in lists it appears as a **See also** chip with the target's chapter and page. A
block with references shows `Shared · N`. Reference edges never change order, layout or pagination;
they may form cycles; a duplicate source-target pair is not created, regardless of role. **Make
home** promotes a reference edge to primary and demotes the old primary; it is disabled on a root,
where the UI offers **Move here** or **Add as child**. Deleting a reference link never deletes a
block.

### F9 — Pagination, breaks, continuation, overflow

Pagination is derived. The paginator scans in reading order, breaks between blocks, and continues a
long block only at a paragraph, list item, blockquote paragraph, between code lines, or between
table rows. It never cuts a line, image, formula, code line or table row.

**Page starts.** Continuous and the Outline show page-start markers; Page shows the real boundary;
the pager shows the page. A marker is not a block and is skipped by arrow navigation. The marker
menu offers **Remove manual break**, **Keep this break**, and an explanation of the fit. A manual
marker is solid and labelled; an automatic one is dashed.

**Continuation.** A break inside a subtree or a long block shows a ghost parent at the top of the
next page and "continues on page N" at the bottom of the previous one. The ghost parent is dimmed,
non-editable, names the nearest top-level block or chapter and jumps to it. A continuation is not
an error and never blocks export.

**Overflow.**

| Cause | UI | Recovery |
|---|---|---|
| Element too tall for a page | Warning outline and banner; export blocked | Resize the image, shorten the code or formula, split the text, switch orientation |
| Element too wide for the page | Warning outline and banner; export blocked | Wrap, resize, shorten the line, switch orientation |
| Manual break cannot be honoured | Marker warning and a line in `Breaks` | Remove or move the break |
| Content moved the breaks | `Pages updated` status; pager and markers refresh | Insert a manual break to stabilize |

A page never overflows: the paginator adds pages. An impossible element is a defect, never clipped
or auto-scaled.

### F10 — Switch layouts and modes

The canvas header and the View menu switch Continuous and Page; `⌘2` and `⌘3` are the layout chords
and `⌘E` toggles Edit/Read. An open editor commits first. The mode is preserved across layouts; the
selected block is carried across and scrolled into view. A switch creates no undo entry. If the
block is inside a collapsed ancestor, it expands.

### F11 — Undo and redo

One visible stack. If the last action was typing, the undo is the editor's; if the edited block is
not focused, focus returns to it first. Otherwise the last document command is undone. Typing
coalesces; structural commands never do. The Edit menu names the action ("Undo move block",
"Undo create branch"). Undoable: content, create/delete block, move, indent/outdent, branch, anchor,
reference link, chapters, manual breaks, page setup, title. Not undoable: collapse, layout/mode
switch, page navigation, zoom, focus, save, export. Redo is cleared by a new action. History is
session-only.

### F12 — Export a PDF

One export: all pages, Page Read, from the shared paginator, with real text. Entry points: `⌘P`, the
canvas header, File → Export PDF, the command palette.

1. The export sheet shows the destination (from the Export setting), the read-only `<title>.pdf`
   name, the page count and the page size. **Choose…** changes the destination for this export only.
2. Preflight blocks the export for an impossible element, naming the blocks and offering a fix.
   Warnings cover unhonoured manual breaks, lost anchors, missing assets and formula errors; the
   export proceeds with the paginator's actual breaks and the app's placeholders.
3. Export shows progress and supports cancel. The file is written to a temporary path, inspected,
   then moved into place atomically. A failed export leaves no partial file.
4. Success offers **Open PDF** and **Reveal in Finder**. A failure names the reason and keeps the
   document untouched.

The PDF is light in both themes, has no metadata beyond the title, and is a snapshot: later edits do
not change the file. Annotation happens outside the app with any standard tool.

### F13 — Find and search

`⌘F` opens the find cluster in the canvas header; the same query drives the sidebar Search. Search
covers text, code, LaTeX source, anchor quotes, branch labels and chapter titles; it is
case-insensitive, with a whole-word toggle; no regex in v1. Sidebar results are grouped by chapter
with per-occurrence snippets and counts; the first group is labelled only when it has a name.
`Return` and Shift+Return cycle; the canvas scrolls to the hit, switches layout if needed and
selects the block. Matches are painted inside Continuous and Page without touching the measured
DOM. `Esc` closes the find; `⇧Esc` closes it from anywhere; a collapsed ancestor expands when a hit
is selected.

### F14 — Page setup and manual breaks

Page setup lives in Settings → Page. It covers page size (A4, A5, Letter), orientation, margins with
a live preview, theme preset, density (60–120 %) and chrome (header, footer, page number). The settings are a global default with a per-document override;
changing them re-paginates and shows a warning with the affected page count and manual breaks. A
change is undoable.

Manual breaks: **Start on a new page** on a block adds a hint; the marker becomes solid. A hint is
honoured only when the block can start a row; otherwise the app says so and uses the paginator's
break. Hints are pruned when the block disappears. The `Breaks` surface lists them with their
derived page number; hover reveals remove.

### F15 — Chapters

New chapter adds a chapter after the active one with one empty top-level block. The chapter menu
offers **Rename chapter…** and **Add block**. A chapter heading is not a block: no branches, anchors
or children. Every chapter starts at the top of a new page. Chapter order is document order;
reordering, and deleting a chapter with content, are not exposed in v1. An empty chapter can be
deleted from Health. Moving a top-level block to another chapter is a structural move that carries
its subtree.

### F16 — Library and documents

The library is a recursive tree bound to a folder. Rows: folders, note packages, `.md` guest files,
ignored files. Actions: new note, new folder, rename, reveal in Finder, move, move to Trash (the OS
Trash, with flush and live-lock rules), and refresh from the library menu. A note is copied or moved with its assets; a
document ID move is reconciled in tabs, recents and per-document settings. Trashing never targets
the library root. A missing note shows a `not found` banner with locate and remove.

### F17 — Settings and appearance

Settings is a modal, 1180 × 820, with a fixed 320 px rail: General, Appearance, Page, Continuous,
Editor, Export, Data. Changes save instantly; Reset restores the section. Appearance covers
theme (dark, light, system), accent (pastel and vivid groups), UI scale and font, and the code theme
(auto, Dark+, Light+, Monokai, One Light) with its measured worst contrast. The Page tab previews
the actual page model; Continuous previews a live sample; Export sets the default folder; Editor
lists the shortcuts.

---

## 7. Continuous and Page

### 7.1 Shared

Same document, same order, same anchors and edges, same selection and focus, same page breaks.
Continuous shows breaks as markers; Page as boundaries. Page and PDF always show the full document;
collapse is not applied.

### 7.2 Continuous

A 3,200 px wide canvas with horizontal scroll for deep chains. Content-driven widths; a right group
reserves its own height; a child group that does not fit wraps below its parent with an indent.
Anchored callouts follow the parent. Page starts are marker lines with a page label and a menu.
Read mode scrolls and selects but does not edit. The surface has no page geometry.

### 7.3 Page

A single column of pages touching with a 1 px seam, free scroll. The pager shows the current page
over the total (`N / M`) next to the zoom; typing a number jumps, `↵` confirms, `Esc` cancels;
arrows step pages and are disabled at the ends. Zoom is 50–200 %, fit-relative, 100 % = fit width.
Only visible pages ±2 are mounted over exact-size placeholders. Read is exact and read-only; Edit
opens one block overlay over the same geometry, with the page's paper ink and a paper accent tint
for selection.

### 7.4 Drag and reflow

Drag reorders a block before or after another; it never reparents and never moves it to an arbitrary
position. Dragging to empty space snaps back: there is no free positioning. Reparenting uses Indent,
Outdent, Move to…, or a reference link. Reflow is incremental while authoring; a page setup change
recomputes the whole layout.

### 7.5 Context menus

Block menu (Continuous and the gutter): add child/sibling, add top-level, branch, link, indent,
outdent, duplicate, delete, start on a new page, remove anchor, open in the other layout. Page card
menu: page settings and **Open in Continuous**. Menus never contain a hover-only action.

### 7.6 Focus and context

Breadcrumbs show chapter and ancestors. The focused block is visible; the current page follows the
selection. Leaving an editor commits. An overlay owns the command surface while open.

### 7.7 States

Empty, loading, saving, saved, save failed, missing file, read-only, conflict, broken anchor,
missing asset, layout defect, unfittable text. Each has a visible state and an action; none is a
dead end.

---

## 8. Outline

### 8.1 Row anatomy

Disclosure control, a type or block marker, the label or first line, an anchor Indicator, a
reference indicator (`Shared · N`), and a page-start marker where the paginator breaks. Indentation
is capped at three visible levels; deeper rows keep the same indent with a depth hint.

### 8.2 Keyboard model

Up/down move the selection; Return edits the selected row, and inside editing it creates a sibling;
Tab and Shift+Tab indent/outdent; the catalogue's move chords reorder; Left/Right collapse and
expand; `⌘F` finds; typing on a selected row enters the editor.

### 8.3 Selection

Single selection in v1. Selecting a row selects the block in the canvas; selecting a block selects
its row. Selection survives collapse and view switches; collapsing an ancestor of the selection
moves the selection to the ancestor. The arrow path skips page markers.

### 8.4 Drag and drop

Vertical reorder with a drop line. Reparenting uses Indent, Outdent or Move to…; a reference uses
Link as reference. A cycle is refused with a link-as-reference offer.

### 8.5 Chapters, breaks and anchors

Chapter rows group top-level blocks in document order. Page-start markers sit between rows and
carry the same menu as in Continuous. Anchored children appear in anchor order under their block,
with the anchor quote as context. Reference targets are not duplicated; the row shows `Shared · N`.

### 8.6 Focus

Focus moves with the selection, never into a hidden row. Creating a block focuses it. After undo,
focus returns to the affected block.

---

## 9. Keyboard

The complete map, with every binding and its surface, is `docs/design/shortcuts.md`. The rules:

- One catalogue, `lib/shortcuts.ts`, is asked by every surface. A second chord writer is a defect.
- One chord has one meaning on one surface. An overlay owns the command surface while it is open.
- Shortcuts do not fire while typing in text, code or math, except editor-local keys.
- Single-key shortcuts do not conflict with typing or IME; shifted bracket keys match
  `event.code`.
- No bare-Shift shortcuts. Not every action needs one.
- Page Edit commit and cancel keys come from the catalogue, not from the overlay.

| Area | Shipped |
|---|---|
| Layout and mode | `⌘2` Continuous, `⌘3` Page, `⌘E` Edit/Read |
| Find | `⌘F`, `⌘G` / `⇧⌘G`, `⇧Esc` to close, whole-word toggle |
| Export | `⌘P` |
| Editing | `⌘Z`, `⇧⌘Z`, `⌘B`, `⌘I`, `⌘⇧H` highlight |
| Structure | Return, Shift+Return, Tab, Shift+Tab, `⌘]`, `⌘[`, move chords |
| Pages | `⌘↑` / `⌘↓` previous/next page |
| Palette | `⌘K` |

The in-app list (Help → Editor, Settings → Editor → Shortcuts) is searchable and rendered from the
same catalogue.

---

## 10. Visual language and states

### 10.1 Anatomy

A block is a card with a 10 px inset, a label row and a body. Cards use radii 4 and 8, a resting
hairline border, and no left accent bar. Chapters are headings with a rule. Pages are light paper
with a 1 px seam in the Page scroll. The branch port is the only circular control.

### 10.2 Block states

Resting, hover, selected, editing, read-only, broken anchor, missing asset, defect, saving. Hover
does not move the layout. Selection is explicit and does not rely on color alone.

### 10.3 Branches and arrows

Primary edges use the accent; reference edges are dashed and neutral; the selected edge is muted
only when an explicit selection exists. Every state clears 3:1. Page edges are orthogonal,
obstacle-aware, and share one arrowhead size with no shaft through the head. Trunks are per
`(parent, placement)` and continue across pages without a page chip. Cross-page references end at a
page-edge indicator with the target page.

### 10.4 Anchors

A text anchor is a small dot at the end of the span; a formula term is best-effort; code is a range;
an image region is a numbered marker. Broken anchors are a 6 px status dot in the card's top-right
with a 24 px hit area and a tooltip; clicking it opens Health on that anchor. No anchor marker
reaches the print DOM or the PDF.

### 10.5 Page starts and continuation

Automatic markers are dashed; manual markers are solid and labelled. Continuation shows a ghost
parent and both labels. The marker names the nearest top-level block or chapter.

### 10.6 Zoom and level of detail

Continuous zoom is per-document view state; Page zoom is 50–200 % fit-relative. At low zoom, labels
and markers simplify; content never becomes unreadable without a way back.

### 10.7 Motion

120–200 ms for state changes; disabled for keyboard edits and reduced motion. No flicker on page
switch, load, save or theme change.

### 10.8 Color and themes

Dark default, light available, system theme. Page paper is light in both. Accents are a validated
registry (pastel and vivid groups); an unknown accent falls back to blue. Contrast: AA for text,
3:1 for meaningful non-text states, measured per polarity. Code themes are verbatim and labelled
with their worst measured contrast; the Page and PDF keep One Light.

---

## 11. Feedback, errors and recovery

### 11.1 Principles

State first, toast second. A persistent condition (save failure, missing file, conflict, broken
anchor) gets a persistent surface with an action. A transient success gets a short toast. An error
says what happened, what was preserved, and what to do; raw details go behind **Details**.

### 11.2 Persistent indicators

| Condition | Surface |
|---|---|
| Saving / saved | Status bar and title dot |
| Save failed | Shell banner with retry and details |
| Draft not yet materialized | Its own banner; never a raw `draft:` id |
| Missing file | Tab banner with locate and remove |
| Read-only | Document status panel |
| Stale lock | Document status panel with an explicit takeover |
| Broken anchors | Count in Health and the status bar |
| Conflict | Dialog with reload, overwrite, cancel |

### 11.3 Errors

| Error | Behavior |
|---|---|
| Corrupt document | Recovery surface, backup offered, original kept |
| Newer schema | Read-only or refused, clear message |
| Missing asset | Placeholder and warning |
| Export failure | Reason, no partial file, document untouched |
| Formula error | Source kept, inline error |
| Image decode failure | Placeholder, local degradation |
| Unreadable table cell | Recovery state, never flattened |

### 11.4 Toasts

Short, sentence case, one action maximum (`Details`, `Open PDF`, `Reveal in Finder`). No toast for
a normal save. A toast never carries the only copy of an error.

### 11.5 Confirmations

Destructive actions confirm with the object named and a count. Cancel is the focused action.
Escape cancels. A confirmation never hides a destructive default behind a single click.

### 11.6 Empty and loading

Empty states explain the next action in one line. Loading shows progress where measurable. A long
operation is cancellable. No skeleton shimmer.

---

## 12. Accessibility

- Every flow completes with the keyboard alone; every pointer action has a menu item.
- Focus is visible on cards, ports, anchors, page controls, toolbar controls and dialogs.
- Controls have labels and roles; screen readers announce block role, selection, branch, anchor,
  page number and page change.
- Contrast: AA for text in both themes; 3:1 for meaningful non-text states in every state, not only
  at rest. No meaning by color alone; non-color cues for edges, selection and errors.
- Hit targets are adequate at every zoom.
- Reduced motion is respected; animation is not required to understand a change.
- The Page layout is light paper in both themes, and its chrome follows the app theme.
- Shortcuts do not conflict with typing or IME; assistive tech receives the same state.

---

## 13. Scale

300 blocks are smooth; 1,000 are usable with virtualization, collapse and focus. The library stays
responsive with many documents and folders. Search is bounded and shows counts before results.
Pagination and page navigation never relayout the whole document.

---

## Appendix A — UI copy conventions

- Sentence case for labels, buttons and titles.
- Verbs first: "Add child", "Remove break", "Open PDF".
- No filler, no exclamation marks, no "successfully".
- An error names the object and the action: "This note could not be saved."
- Numbers in a count: "3 blocks", "2 hidden", "5 pages".
- Banned words in shipped copy: leverage, seamless, powerful, effortless, unlock, supercharge,
  streamline, robust, delight.
