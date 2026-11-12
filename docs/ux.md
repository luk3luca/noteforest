# NoteForest — UX specification v1.5

**Status:** Draft v1.5 — editor layouts and modes (ADR-0007), 7 November 2026  
**Owner:** UX / Product  
**Date:** 7 November 2026  
**Working title:** NoteForest (clearance or rename required before packaging)  
**Stack:** Electron + React + TypeScript (ADR-0001). This document defines UX behavior and avoids Electron-specific behavior where platform neutrality is cheap, but Electron APIs are allowed where they are the decided implementation (for example PDF export).  
**Related:** `AGENTS.md`, `research/landscape.md`, `docs/spec.md` v0.5, `docs/plan.md`, `docs/ux-shell.md`, `docs/adr/0005-anchor-binding-and-identity.md`, `docs/adr/0007-editor-layouts-and-modes.md`

This document defines how NoteForest behaves for a person at a Mac: interaction flows, the keyboard model, states, feedback, edge cases, and accessibility. The stack is decided (Electron, ADR-0001); this document does not make stack, content-model, or file-format decisions; those live in `AGENTS.md`, the spec, and the ADRs.

**Revision note (v1.5).** Adopts ADR-0007: layouts **Continuous | Page** × modes **Edit | Read**. **Continuous + Edit** is the default; **Page Read** is exact and read-only for now; **Page Edit** is planned and visibly disabled; **PDF** exports Page Read. Continuous page-break markers are derived hints from the same paginator, not WYSIWYG; Page/PDF are the exact geometry and always show the full document. Collapse stays an outline/Continuous navigation aid. `⌘2` is Continuous, `⌘3` is Page, `⌘E` toggles Edit/Read; inline code moves to `⌘⇧C` to free `⌘E`. "Reader" is retired as a view name except in historical notes.

**Revision note (v1.4).** The product owner revised the below-stack rendering: direct children stay
to the right while they fit and join the below stack only when they wrap; anchored callouts always
sit below the parent; the below stack uses one shared left trunk with horizontal arms and all arrows
enter from the left, never from the top. This supersedes the "direct-children group below the lane"
wording in the v1.3 callout lane.

**Revision note (v1.3).** Applies the product owner's approved M3 decisions (C1, C8, C9, OD-1–OD-12): anchored children come first (C1/D3), idle anchors and explicit removal (OD-2), role-independent dedupe (OD-3), make-home root rule (OD-7), callout lane (OD-8), dashed reference edges plus chips (OD-9), status-chip health sheet (OD-10), and text-selection projection (OD-12). M3 is editor-first: there is no page view or PDF yet, so M3 chips show the chapter/label and M4 adds page numbers. The paginated Reader/Page collapse wording remains a v1.2/M4 topic; the M3 continuous editor follows spec §7.6.

---

## 0. UX decisions for v1.5

**Locked by the product owner (v1):** layouts Continuous | Page × modes Edit | Read (ADR-0007); Continuous + Edit is the default; Page Read is the exact read-only PDF proof; Page Edit is planned and disabled until implemented; page orientation is document-wide; visual direction is clean, Obsidian-like and minimal with dark mode default; long blocks continue at safe boundaries; layout uses incremental reflow plus a freeze mode; broken anchors fall back to the whole block; external agent integration is API-only. The relevant open questions are marked resolved below.

| # | Decision | Why |
|---|---|---|
| D1 | One window per document; no tab strip and no document library in v1 | A study document is a place, not a tab. Keeps the window chrome simple. |
| D2 | Outline plus two spatial layouts: Continuous and Page, each with Edit/Read. One main surface at a time; no split view in v1. Default Continuous + Edit; Page Read is the exact read-only PDF proof; Page Edit is planned and disabled until implemented; Outline remains the structural editor | Outline is the fastest structural editor; Continuous preserves flow for authoring; Page shows exactly what the PDF will render, without conflating layout and mode. Split view doubles focus and space. |
| D3 | `Return` creates a new block; `Shift+Return` inserts a line break inside the block | The block is the unit of structure. This is the outliner contract that makes authoring fast. |
| D4 | `Tab` / `Shift+Tab` change block structure; list-item indentation uses `⌘]` / `⌘[` | One predictable meaning for Tab in an outliner. The conflict with lists is real; see Q9. |
| D5 | Fixed logical order, adaptive geometry: only sibling order changes. No free positioning, no pins, no nudges | The product owner's model. Structure is stable; the layout adapts to content and page width. |
| D6 | Pages are derived by a paginator, not stored as containers. No New Page, Duplicate Page, Delete Page, Split Page, or Move to Page command | A page is a rendering of the continuous layout at a given page size. Treating pages as containers would make the document and the PDF diverge. |
| D7 | A page break can fall between blocks, and a long block may continue at safe internal boundaries (paragraph, list-item, between code lines, or between table rows). A line, image, code block, formula, or table row is never cut. Continuations get a ghost parent and continuation markers | The tree stays intact; long text flows, while atomic elements remain whole and readable. |
| D8 | Chapters group top-level blocks; a chapter can start on a new page (default on) | The document is organized by topics, not by pages. Chapter starts are a stable, user-meaningful break hint. |
| D9 | An anchor is created together with a branch. Standalone highlights are a separate, non-structural mark. An anchor can outlive its last branch as an **idle** record: the marker is hidden and an explicit **Remove anchor** deletes it (OD-2) | Anchor-only marks add UI and model weight without a user job. Highlight covers "mark this phrase". Idle records preserve identity and re-branching without an orphan warning |
| D10 | v1 exports one PDF from the same paginator, all pages, real text. It is the Page layout in Read mode; no separate linear reader export | The PDF is the exact Page Read rendering; the Continuous layout is an editor layout, not an export. |
| D11 | Collapse/expand is an outline and Continuous navigation aid in v1; it hides primary descendants and anchored callouts with a hidden count (spec §7.6). The Page layout and PDF always show the full document; collapse in Page is a later product decision | Hiding content in Page/PDF would silently change what exports. Spatial folding in Page needs its own export semantics (Q10). |
| D12 | One visible undo stack, with a documented routing rule between text editing and structure | Users should not have to know which stack they are in. |
| D13 | No hover-only action. Every pointer action has a menu item and a keyboard path | Required for accessibility, and it makes the product usable without a mouse. |
| D14 | Page orientation is one document-wide setting; changing it reflows all pages | Mixed orientation would complicate the paginator and the PDF; one orientation keeps the document coherent. |
| D15 | Layout stability uses hybrid incremental reflow, a freeze mode for study, and full reflow on request/after idle | Keeps authoring responsive and reading stable; freeze prevents page breaks moving under the reader. |
| D16 | Visual direction: clean, Obsidian-like, minimal; dark mode default | Content-first, low chrome; dark reduces glare in study sessions. |
| D17 | A broken anchor falls back to the whole block, with a visible marker and a repair flow | A branch is never lost; the fallback keeps the relationship usable while the user repairs it. |
| D18 | The External Agent API is opt-in, local-only, and token-scoped (read-only or read-write). In-app agent chat and autonomy are non-goals for v1 | External tools integrate through a controlled API; the app stays focused on authoring. |
| D19 | Layout and mode are independent: Continuous or Page × Edit or Read. Default Continuous + Edit; Page opens Read; Page Edit is planned and disabled; `⌘2` Continuous, `⌘3` Page, `⌘E` Edit/Read | ADR-0007. The old Reader/Page pair conflated layout with mode; orthogonality keeps authoring and print proof separate. |

---

## 1. Scope, non-goals, and terminology

### 1.1 In scope for v1

- Authoring a study document made of chapters, content blocks, branches, and anchors.
- Document → Chapters → top-level content blocks → descendants.
- Adaptive tree layout with content-driven widths; children go right when there is room, otherwise wrap below the parent with a slight indent.
- One canonical document and one paginator, rendered as Outline, Continuous (Edit/Read), and Page (Read now, Edit planned).
- Derived pagination with page-break markers, manual break hints, continuation markers, ghost parents, and unbreakable-element overflow handling.
- Primary structural branches and reference cross-links, including cross-page references.
- Text, formula, code, and image-region anchors; images; code; shared children.
- Markdown-authoring inside blocks, LaTeX formulas, code blocks, images, lists.
- Real-text PDF export of all pages, generated by the same paginator.
- Multiple documents, each in its own window, with recent documents.
- Search across the current document.
- External Agent API: an opt-in local API with read-only or read-write tokens, for external tools. No in-app chat UI.
- Clean, minimal visual language; dark mode default.
- Flat document files with assets; autosave and manual save.
- Mac only.

### 1.2 Out of scope for v1

- Page containers: creating, duplicating, deleting, splitting, moving, or reordering pages.
- Fixed depth columns, arbitrary block positions, manual pins, nudges, freeform canvas, minimap, free drawing.
- A separate reader/outline PDF export. The Continuous layout is an editor layout, not an export mode.
- Freehand ink, handwritten annotations, highlights drawn on the page. Annotations happen in an external PDF app after export.
- Collaboration, comments, presence, accounts, sync.
- A document library, tab strip, tags, databases, backlink queries, daily notes. Multiple documents open in separate windows with recents.
- Per-page orientation (v1 uses one document-wide orientation at a time).
- In-app agent chat, agent sidebars, and autonomous agents. External integration is through the opt-in local API only.
- Web browsing, URL fetching, external tool execution, and automatic apply by any external agent.
- AI features beyond the external API: flashcards, spaced repetition, automatic document generation.
- iPad and Apple Pencil. The UX must not block them, but v1 does not implement them.
- Freeform whiteboard features: shapes, sticky notes, drawing tools, templates.
- Markdown as the live document format. Markdown is an import/export concern.

### 1.3 Terminology used in this document and in the UI

| Term | Meaning | Notes on UI copy |
|---|---|---|
| **Document** | The file: a sequence of chapters with one title | The product owner calls it a chapter/document; UI says "document" in v1 (Q2) |
| **Chapter** | A named group of top-level blocks; a document has one or more | "Chapter 2"; chapter headings are not blocks |
| **Top-level block** | A content block with no primary parent, inside a chapter | "Top-level"; may be a sentence or a 1–2 word phrase with children |
| **Block** | A content unit: text, formula, code, image | "Block" is the user-facing noun for the thing |
| **Branch** | A directed connection from a block to a child block | "Branch" is the relationship; the target is still a "block" |
| **Primary branch** | The structural branch that determines outline order and layout | UI rarely says "primary"; menu copy says "Branch" (structural) |
| **Reference link** | A cross-link that does not affect position, hierarchy, or pagination | Always "Reference link" in UI, never just "link" (URL links exist) |
| **Anchor** | A span inside a block (text, formula source, code range, image region) that a branch starts from | Tooltip: "Anchor: λ · 1 branch" |
| **Anchored branch** | A branch whose source is an anchor; its child sits below the anchor | "Branch from “λ”" in the inspector |
| **Shared block** | A block with one primary parent and at least one reference link to it | Badge: "Shared"; tooltip: "Also linked from 2 places" |
| **Layout** | `Continuous` or `Page`; it controls how the document is presented, not whether it is editable | UI says "Continuous" / "Page" |
| **Continuous layout** | A screen-optimized vertical scroll with derived page-break markers; supports Edit and Read | "Continuous"; the default authoring surface |
| **Page layout** | The A4-bounded rendering of the same derived pages used by the PDF; Read is exact and read-only now, Edit is planned | "Page"; the product owner calls it the canvas |
| **Mode** | `Edit` or `Read`; independent from layout | UI says "Edit" / "Read" |
| **Page Read** | The exact, read-only Page layout; the visual PDF proof | "Page · Read"; PDF target |
| **Page Edit** | The planned optional Page-layout authoring surface with one active block editor | "Page · Edit"; disabled until implemented |
| **Page** | A pagination result at the current page size; not a container | "Page 2 of 5"; derived |
| **Page break** | A computed boundary between two blocks in reading order | Shown as a derived marker in Continuous/Outline and as an exact page boundary in Page |
| **Manual break hint** | A stored request to start a page before a block | "Manual break"; the paginator honors it when possible |
| **Continuation marker** | A label at a page break when a subtree or a long block continues | "Chapter 1 · Eigenvalues continues on page 2" |
| **Paginator** | The component that computes pages from the continuous layout | Internal; UI says "pagination" |
| **Adaptive width** | Content-driven block width; siblings may differ; a child may wrap below its parent | "Wraps below" in the inspector, if needed |
| **Overflow** | An unbreakable element (line, image, code block, or formula) that cannot fit a page; long text continues at safe boundaries instead | "This element doesn't fit a page"; export blocked |
| **Collapse** | Hide a block's descendants in the outline and Continuous layout | Not applied to Page/PDF in v1 |
| **Focus** | Outline: hoist a subtree. Continuous: dim/zoom. Page: zoom | "Focus"; `Esc` exits |

---

## 2. Personas and top tasks

### 2.1 Personas

#### P1 — The Author (primary)

Luca is a student, at a Mac, typing fast during a lecture or while reading a textbook. He thinks in structure: a topic, then branches that fan right and down, then a branch that starts from one word or one formula term. He does not want to stop typing to arrange blocks with a mouse. He is impatient with dialogs, autosave prompts, and any action that requires the pointer.

- **Goal:** get the structure of a topic out of his head before the explanation moves on.
- **Success:** a chapter with 15–25 blocks and three or four anchored branches in under ten minutes, without leaving the keyboard.
- **Abandon signal:** a modal dialog, a lost keystroke, a layout that jumps while typing, a branch action that takes more than two keystrokes, a page break that silently moves content.

#### P2 — The Studier

Luca returns to the document days later, before an exam. He opens the document in Continuous Read, follows a continuous argument, notices a derived page-break marker, switches to Page Read to check what the PDF will look like, follows an anchored branch from a formula term, then exports all pages and annotates them on an iPad in an external PDF app.

- **Goal:** re-enter a topic quickly and follow the argument the way he originally built it.
- **Success:** understands a region in 10–15 minutes; exports in one action; every page is legible and its text is searchable in the annotation app.
- **Abandon signal:** page breaks that cut a branch without a continuation marker; a PDF that differs from Page Read; an anchor that points at the wrong word.

#### P3 — The Returner

Luca opens a six-month-old document. He half-remembers a term but not where it lives. He searches, jumps to the block and its chapter, reads the breadcrumb, and checks what links into it.

- **Goal:** trust the document. Old branches must still point at the right text, and a lost anchor must be visible and fixable, not silently deleted.
- **Success:** finds the thread in under a minute; every broken anchor is surfaced with a repair action; page numbers may have shifted but the structure and links are intact.
- **Abandon signal:** orphaned branches disappear; page breaks have moved without explanation; there is no way to see why a block is here.

### 2.2 Top tasks

| # | Task | Persona | Frequency | Target | Primary entry point |
|---|---|---|---|---|---|
| T1 | Capture a topic and 5–15 branches in a chapter | P1 | Daily | < 5 min | `⌘N`, type, `Return`, `Tab` |
| T2 | Branch from a word, formula term or code token | P1 | Daily | < 5 s from selection to typing | Select, `⌘⇧Return` |
| T3 | Reorder and reparent structure | P1, P2 | Daily | No dialog, one gesture or key | `Tab` / `⇧Tab`, drag, `⌘⇧↑↓` |
| T4 | Read continuously and check the paginated result | P2 | Weekly | < 10 min | `⌘2` Continuous, `⌘E` Read, `⌘3` Page, `⌥↑↓` |
| T5 | Export all pages as a PDF for external annotation | P2 | Weekly | < 30 s | `⌘⇧E` or `⌘P` |
| T6 | Find a block and understand its chapter and page | P3 | Weekly | < 1 min | `⌘F`, breadcrumbs, `⌘[` / `⌘]` |
| T7 | Recover from a lost anchor, an unbreakable overflow, or a save conflict | P3 | Rare | < 2 min, no data loss | Status chip, element banner, conflict sheet |
| T8 | Start a new chapter and move blocks into it | P1 | Occasional | < 1 min | Chapter menu, drag across chapter divider |
| T9 | Insert a manual break to stabilize pagination | P1, P2 | Occasional | < 15 s | Block menu → **Insert Page Break Before** |

### 2.3 Keystroke budget

| Action | Budget | How |
|---|---|---|
| New sibling block | 1 key | `Return` |
| New child block | 1 key | `⌘Return` |
| New child by indenting | 2 keys | `Return`, `Tab` |
| Branch from the current block | 1 key | `⌘Return` |
| Branch from a word | selection + 1 key | Select with keyboard or mouse, `⌘⇧Return` |
| Switch layout | 1 key | `⌘2` Continuous / `⌘3` Page (`⌘1` Outline) |
| Toggle Edit/Read | 1 key | `⌘E` (Page Edit disabled until implemented) |
| Previous / next page | 1 key | `⌥↑` / `⌥↓` |
| Fit view (Continuous: width; Page: page) | 1 key | `⇧1` |
| Export all pages | 1 key | `⌘P` |
| Export with preview | 1 key | `⌘⇧E` |
| Manual page break before a block | 1 key | `⌘⌥B` |

If any of these needs a dialog, an inspector visit, or a mouse, the design has failed.

### 2.4 Two end-to-end scenarios

**A. Capturing a lecture (P1).** Luca hits `⌘N`, types "Eigenvalues and eigenvectors" as the first top-level block in Chapter 1, presses `Return` for a sibling and `Tab` to make it a child, types the definition, selects "λ" and presses `⌘⇧Return`, types one sentence about the stretch factor, then `Esc`, `⌘Return` on the top-level block for the next branch. He starts Chapter 2 for the algorithm with `⌘⌥C`. He never opens the inspector. The Continuous layout is laying out in the background; derived page-break markers appear where the paginator breaks. He will switch to Page Read later to check the print.

**B. Studying before an exam (P2).** Luca opens the same document, presses `⌘2` for Continuous and `⌘E` for Read, follows chapter 1 to the `det(A − λI)` anchor, reads the expansion in the callout below it, presses `⌘⇧F` to focus that subtree, `Esc`, then `⌘3` to check Page Read: chapter 2 starts on page 2, and a ghost parent with a continuation marker shows where chapter 1's last branch resumes. He presses `⌘⇧E`, exports all pages, and AirDrops the PDF to the iPad for annotation in an external app.

---

## 3. Experience principles and invariants

### 3.1 Principles

1. **Authoring speed is the product.** The outline and Continuous Edit must feel like a text editor that happens to have a graph underneath. Any structural action that takes more than two keystrokes is suspect.
2. **One document, one paginator, two layouts.** Continuous and Page are two renderers of the same canonical document; the Page layout and PDF share exact geometry. Continuous markers are derived hints from the same paginator, not a second layout. There is no second layout to drift.
3. **Fixed logical order, adaptive geometry.** The tree order is stable; widths adapt to content, and children wrap below the parent when horizontal room runs out. Only sibling order changes. No free positioning.
4. **Pages are a result, not a container.** The user never creates, moves, duplicates, or deletes a page. They edit content, add manual break hints, and the paginator recomputes.
5. **Long blocks flow; atomic elements stay whole.** A long block may continue at safe internal boundaries. A line, image, code block, or formula is never cut.
6. **Spatial memory is preserved by order and by the tree.** A branch stays under its parent; a page break is a labeled event with a ghost parent and a continuation marker, not a silent cut.
7. **Nothing is lost silently.** A lost anchor falls back to the whole block, with a visible marker and a repair path. An unbreakable element that cannot fit a page is an explicit overflow, not clipped content.
8. **Structure is explicit.** A line between two blocks means something. The UI distinguishes "this is my parent" from "this is related".
9. **The pointer is optional; the keyboard is complete.** Every flow can be completed without a mouse. Every pointer action has a menu equivalent.
10. **Export is a product surface, not a side effect.** The PDF is what the user studies on; it is the Page Read rendering and must be previewed and tested like a screen.
11. **Layout stability is a feature.** Incremental reflow keeps authoring fast; freeze mode keeps study stable; a full reflow runs on request or after idle.
12. **Mode is not layout.** Reading does not switch to a different renderer, and Page Read does not become editable just because the user wants to edit there. Page Edit is its own planned surface.

### 3.2 Invariants (testable)

1. Any action available with the pointer is available with the keyboard alone.
2. Editing text never deletes a branch. A lost anchor falls back to the whole block, is visibly marked, and can be repaired; it is never silently removed.
3. Adding, removing or editing a reference link never changes any block's position, outline order, or pagination.
4. Switching layouts, modes, or views preserves selection, focus, chapter, and the block's position in the layout; a mode switch creates no undo entry.
5. Export never clips content. Long blocks continue at safe boundaries; an unbreakable element that cannot fit a page blocks export with a fix path.
6. Undo restores the previous structure exactly: blocks, branches, anchors, chapters, manual break hints.
7. Pagination is deterministic: the same document, page setup and manual break hints produce the same pages in Continuous markers, Page Read/Edit, and PDF.
8. A block may continue only at safe internal boundaries; no line, image, code block, or formula is cut.
9. The only spatial change a user can make is sibling order. There is no free positioning, pin, or nudge state.
10. The External Agent API is off by default, local-only, and scoped by a token; it never runs autonomously.
11. A page is never a container: inserting or deleting content changes pagination, not a page object.
12. Page and PDF always show the full document; collapse never removes content from them.
13. No destructive action is triggered by a single unmodified click.
14. No meaning is carried by color alone.

---

## 4. Information architecture

### 4.1 Window model

One document per window. The window has six regions:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Title bar        Document title · edited indicator                    │
├──────────────────────────────────────────────────────────────────────┤
│ Toolbar          [Outline | Continuous | Page]  [Edit | Read]        │
│                                     Page 2 of 5   − +   [Export]     │
├──────────────────────────────────────────────────────────────────────┤
│ Context bar      Pagination/layout status · focus path · selection    │
├───────────────────────────────────────────────────────┬──────────────┤
│                                                       │ Inspector    │
│   Main view: Outline / Continuous / Page              │ (optional)   │
│                                                       │              │
├───────────────────────────────────────────────────────┴──────────────┤
│ Status bar       Save state · pages · blocks · lost anchors · zoom    │
└──────────────────────────────────────────────────────────────────────┘
```

| Region | Contents | Rules |
|---|---|---|
| **Title bar** | Document name, macOS edited dot, standard window controls | Name is editable in place; used as the export filename stem |
| **Toolbar** | Section switcher (Outline, Continuous, Page), Edit/Read toggle, chapter breadcrumb, page indicator with prev/next, zoom, Inspector, Export | Never scrolls; stays visible in all layouts; the page indicator is shown in Continuous and Page |
| **Context bar** | Pagination status, focus path, "3 selected" | Only appears when it has something to say |
| **Main view** | Outline, Continuous, or Page | Exactly one layout/view is active; all render the same document and derived pages |
| **Inspector** | Block, branch, anchors, links, chapter, pagination, document | Optional; never required to complete a flow |
| **Status bar** | Save state, page count, block count, lost-anchor chip, overflow chip, layout/API status, zoom | Warnings are clickable and open the relevant surface |

### 4.2 Outline, Continuous, and Page

| Surface | What it is | Best for | Page breaks | Editing |
|---|---|---|---|---|
| **Outline** | A vertical list of chapters and blocks with page-break markers | Fast structural authoring, keyboard work, long documents | Marker rows between blocks | Full |
| **Continuous** | One continuous vertical layout of the tree, with derived page-break markers drawn across it | Reading a topic in one flow; spatial authoring; following anchored branches | Horizontal markers with page numbers and continuation labels; hints, not exact print geometry | **Edit:** full authoring with continuous reflow. **Read:** read-only, navigation/copy/links preserved |
| **Page** | The same derived pages paginated into A4, exact print geometry | Checking fit, what the PDF will look like, page-level reading | Exact page boundaries and footers | **Read:** exact and read-only now. **Edit:** planned, disabled until implemented |

**Resolved for v1 (ADR-0007).** **Continuous + Edit** is the default spatial authoring surface: page boundaries do not interrupt the flow, and a long branch stays visible. **Continuous + Read** is read-only. **Page Read** is the exact PDF proof: it is the best place to judge fit, but it is not an editing surface. **Page Edit** is planned and visibly disabled until implemented. Outline remains the fastest way to build structure.

Rules:

- The switcher has two independent controls: `Outline | Continuous | Page` (`⌘1` / `⌘2` / `⌘3`) and `Edit | Read` (`⌘E`). `⌘E` applies to Continuous and Page; Outline has no mode, so the Edit/Read control is disabled there.
- Continuous + Edit is the default. Page opens in Read; Page Edit is disabled and announced as unavailable.
- Continuous Read is read-only for content: selection, links, anchors, reference navigation, copy, scroll, zoom, focus and outline navigation remain available.
- Page Read is read-only for content: selection, page navigation, zoom, focus, link/anchor following, copy, Page Setup and Export. Editing happens in Outline or Continuous Edit (and, later, Page Edit).
- The layout and mode are persisted per document for the session.
- Continuous scroll and current page are separate view states; switching preserves both.
- There is no split view in v1 (Q21).
- If the window is too narrow for the inspector, the inspector overlays the main view.
- Continuous markers are derived hints from the same paginator; Page/PDF are exact. The UI must not imply pixel parity.
- Page/PDF show the full document. Collapse is an Outline/Continuous navigation aid and does not affect Page/PDF.

### 4.3 Document, chapters, and top-level blocks

```text
DOCUMENT
  Chapter 1 "Eigenvalues and eigenvectors"
    top-level block A
      child A.1
        child A.1.1
        child A.1.2
      child A.2
    top-level block B
  Chapter 2 "Computing eigenvalues"
    top-level block C
      child C.1
```

| Rule | Detail |
|---|---|
| **Document** | The file. It has a title and one or more chapters. |
| **Chapter** | A named group of top-level blocks. It has a title, an order, and a "start on a new page" setting (default on). |
| **Top-level block** | A content block with no primary parent, inside a chapter. It can be a standalone sentence or a 1–2 word phrase with children. |
| **Chapter heading** | A heading, not a content block. It has no branches, anchors, or child blocks. It is editable in the outline and Continuous Edit; Page Read shows the heading read-only (Page Edit, later, may edit it). |
| **Top-level order** | Chapters are ordered; top-level blocks are ordered inside a chapter. The document order is chapter order, then top-level order, then depth-first child order. |
| **Pages** | Derived by the paginator. They are not stored, not named, and not editable as objects. |
| **Page break** | Computed between blocks, or at a safe internal boundary inside a long block. It never falls inside a line, image, code block, formula, or table row. |
| **Safe boundary** | An internal break point in a long block: between paragraphs, list items, or lines. Never inside a line, image, code block, or formula. |
| **Manual break hint** | A stored request to start a page before a block. It is a hint, not a page object. |
| **Continuation** | When a page break falls inside a subtree or a long block, the content continues on the next page with a continuation marker and a ghost parent. |
| **Ghost parent** | A dimmed, non-editable copy of the nearest ancestor at the top of a continuation page, with "continued from page N"; clicking it jumps to the real parent. |
| **Empty chapter** | A chapter always has at least one top-level block. If all content is deleted, the chapter shows one empty block and an empty-state prompt. A document always has at least one chapter. |

Page setup (document-level in v1):

| Setting | Default | Options | Effect |
|---|---|---|---|
| Page size | A4 | A4, Letter | Re-paginates the whole document |
| Orientation | Portrait | Portrait, Landscape | One document-wide orientation at a time; changing it reflows all pages |
| Margins | Normal | Normal, Wide right (≈30% extra, for handwriting/annotation space) | Changes the printable area |
| Chapter start | New page | New page, Continuous | A manual break hint at each chapter heading |
| Page numbers | On | On, Off | Footer, part of every page |
| Running header | Document title | On, Off | Small header outside the content area |

Page setup is document-level. Orientation is one document-wide setting at a time; there is no mixed orientation. Changing page size, orientation, margins, or chapter start reflows all pages. Page numbers may change; manual breaks may become invalid. The change is undoable and is preceded by a warning that names the page count and the number of manual breaks affected.

### 4.4 Adaptive layout and pagination

The layout is a tree, not a grid:

| Rule | Detail |
|---|---|
| **Content-driven widths** | Each block is measured. A short leaf may be narrow; a block with a large subtree may take more horizontal space. Siblings can have different widths. |
| **Flow to the right** | Children are placed one level to the right of their parent when there is enough horizontal room in the page. |
| **Wrap below** | If a child does not fit to the right, it is placed below the parent's level with a slight indent. The next sibling continues from there. |
| **Fill the row** | Siblings share the available width; the row is balanced, not a fixed column pitch. A wide subtree can dominate a row; a narrow leaf can sit beside it. |
| **Only sibling order** | The user can reorder siblings. There is no arbitrary x/y, no pin, no nudge. |
| **Anchored branches** | The child is placed below its anchor. It wraps and paginates like any other branch. |
| **Reference links** | Cross-links do not affect layout or pagination. |
| **Pagination** | The paginator scans the continuous layout in reading order and breaks between blocks, or at a safe internal boundary inside a long block. It never cuts a line, image, code block, formula, or table row. A table breaks only between rows; a row taller than the page is a defect. |
| **Continuation** | If the break is inside a subtree or a long block, a continuation marker is shown at the break and at the resume point, with a ghost parent at the top of the next page. |

A page is a **result** of this process. It has no identity, no content list, and no edit operations. If content changes, the paginator may produce a different number of pages, and page numbers may shift.

**Layout stability.** The layout is not recomputed from scratch on every keystroke:

| Mode | Behavior |
|---|---|
| **Incremental reflow** | An edit reflows the affected subtree and the page breaks below it. The rest of the document keeps its positions. |
| **Freeze mode** (`⌘⌥L`) | Locks layout and pagination for study. Page breaks and block positions stay put while reading. Edits are still allowed, but the layout does not update until **Reflow Now** or unfreeze; a chip shows "Layout frozen · 3 changes pending." Freeze is a per-window view state, not a document change. |
| **Full reflow** | Runs on request (`⌘⌥R`), after a short idle period (target: 1.5 s) when freeze is off, and always after Page Setup. It normalizes all page breaks and continuation markers. |

The model is hybrid: incremental reflow while authoring, full reflow on request or after idle, and freeze for study.

- Incremental reflow is the default while authoring; freeze is for studying or for keeping a page stable while annotating a PDF.
- Page Setup always reflows all pages; if freeze is on, applying Page Setup exits freeze with a notice.
- Freeze never changes the document; it only defers layout updates.
- A frozen layout can be stale; the chip says so, and **Reflow Now** is one click away.

### 4.5 Selection, focus, and navigation

- **Selection** is a set of blocks treated as objects. It can contain one or many blocks. It is what the inspector, deletion, and chapter actions operate on.
- **Focus** is the block the user is editing or last interacted with. Exactly one block has focus. Breadcrumbs follow focus.
- **Chapter context** is the chapter of the focused block. The toolbar breadcrumb starts with the document, then the chapter.
- **Page context** is the current page in Continuous/Page. It is a viewport concept, not a selection concept. It follows the focused block's page if the block is visible.

| Concept | How it is entered | Visual | Notes |
|---|---|---|---|
| No selection | Click empty view / `Esc` twice | Nothing highlighted | Status bar shows document counts |
| Block selected | Click gutter/row in outline; click block in Continuous/Page; `Esc` from editing (Outline/Continuous Edit) | Accent ring, no caret | Single-object mode |
| Editing | `Return` on a selected block, click text, double-click in Continuous Edit (Page Read is read-only) | Caret, editing ring | Text selection inside is native |
| Multi-select | `⇧`-click, `⌘`-click, marquee (Continuous Edit), `⇧↑↓` when not editing | Rings on all, "N selected" | Inspector shows bulk actions; Outline/Continuous Edit can delete, Page Read is inspect/copy only; no group positioning |
| Focused subtree | `⌘⇧F`, or `F` in Continuous/Page | Outline: hoisted; Continuous: dimmed/zoomed; Page: zoomed | `Esc` exits |
| Anchor selected | Click an anchor dot / chip | Anchor span and its branch highlighted | Inspector shows the anchor |
| Branch selected | Click a branch or a branch row in the inspector | Branch and both endpoints highlighted | `⌫` removes per branch rules |
| Page focused | Scroll, `⌥↑↓`, or the page indicator | Toolbar shows "Page N of M" | Page context only |

Navigation rules:

- **Breadcrumbs** show `Document › Chapter › Top-level › … › Current`. Deep chains truncate in the middle, never at the end. Clicking a crumb scrolls to it and selects it.
- **History** records focus and chapter changes (not every keystroke). `⌘[` goes back, `⌘]` forward, up to 50 entries.
- **Page navigation** is `⌥↑` / `⌥↓`, the toolbar prev/next, the page indicator menu, or scrolling. In Continuous it jumps to the previous/next derived page-break marker; in Page it goes to the previous/next exact page; in Outline it jumps to the previous/next page-break marker row.
- Switching layouts or modes preserves selection and focus. Continuous scrolls to the block's layout position; Page scrolls to the page containing it; Outline scrolls to the row.

### 4.6 Inspector

A right-hand panel, collapsed by default, toggled with `⌘⌥I`. On windows narrower than 1,200 pt it overlays the main view.

**M3 note.** M3 does not build this inspector. The M3 anchor health surface is a status chip plus sheet/dialog (OD-10), and reference links use block-menu **See also** / **Referenced by** lists and chips. The sections below are the v1 target, not an M3 deliverable; a later inspector can reuse the same data.

| Section | Shown when | Contents |
|---|---|---|
| **Block** | One block selected | Type, first line, child count, word count, framed toggle, top-level indicator, "starts page" if applicable |
| **Anchors** | Block has anchors | Each anchor: quote, branch count, status (healthy/lost), actions |
| **Branches** | Block has children, or a branch is selected | Outgoing branches with role, label, target, page if cross-page; "Add Child", "Link to Block…" |
| **Referenced by** | Block has reference links | Source blocks with quote and chapter; click to navigate |
| **Chapter** | A block or chapter heading is selected | Chapter title, top-level count, "Start on new page" toggle, **Move to Chapter…** |
| **Pagination** | All layouts; per-block manual-break edits only in Continuous Edit/Outline | Page count, current page, manual break count, **Page Setup…**, **Insert Page Break Before**, **Remove Manual Break** |
| **Selection** | Multiple blocks selected | Count, bulk delete (Continuous Edit/Outline), copy as Markdown; Page Read inspect/copy only; no bulk move |
| **Document** | Nothing selected | Title, chapter count, page count, block count, export presets, lost-anchor count |

Rules:

- The inspector is never the only path to an action. Every inspector action also exists in a menu or a shortcut.
- The inspector does not steal focus when it updates.
- Selecting an anchor in the inspector highlights the span and the branch; this is the repair surface for lost anchors.
- The inspector never shows a "page content" list; pages are not containers.

### 4.7 Screen inventory

| ID | Screen / surface | Purpose | Entry |
|---|---|---|---|
| W1 | Welcome | New, open, sample, recents | App launch with no restored windows |
| W2 | Document — Outline | Structural authoring, chapter and page-break markers | `⌘N`, `⌘O`, `⌘1` |
| W3 | Document — Continuous | Continuous spatial reading/authoring (Edit/Read) | `⌘2` |
| W4 | Document — Page | Exact A4 reading (Read now; Edit planned) | `⌘3` |
| I1 | Inspector | Contextual details and actions | `⌘⌥I`, toolbar |
| A1 | Lost anchors panel | Repair broken anchors | Status chip, inspector section |
| G1 | Page Setup | Size, orientation, margins, chapter start, header/footer | `⌘⌥P`, Page menu |
| G2 | Pagination panel | Manual breaks, page count, overflow | Context bar, inspector |
| S1 | Export sheet | All pages, preview, preflight | `⌘⇧E`, toolbar |
| X1 | External change / save conflict | Protect user work | Detected on file change |
| X2 | Branch role popover | Choose structural vs reference, or move vs link | Drop on an occupied target |
| X3 | Link picker | Choose an existing block for a reference link | `⌘⇧L`, menu |
| X4 | Keyboard shortcuts | Discoverability | Help menu, `⌘⇧/` |
| X5 | Settings | Appearance, editor, export defaults, shortcuts | `⌘,` |
| X6 | Delete confirmation | Large subtrees, chapters | `⌘⇧⌫`, Chapter menu |
| X7 | External Agent API settings | Enable local API, token, read/write scope | Settings → Integrations |

---

## 5. First run, empty states, and the sample document

### 5.1 First run

The first launch opens **W1 Welcome**:

- Product name and one line: "Notes that branch from a word."
- Primary actions: **New Document**, **Open…**, **Open the Sample**.
- A short "Recent" list (empty on first run).
- A checkbox: "Show this window when NoteForest opens with no documents."
- No modal tour, no account, no onboarding wizard.

`⌘N` creates a document with one chapter, one empty top-level block, caret inside, and the placeholder "Start with a topic…". The Continuous and Page layouts show the empty layout and the same prompt.

### 5.2 Empty document — outline

- One chapter heading ("Untitled chapter") and one empty top-level block, focused.
- Placeholder: "Start with a topic…".
- A single ghost hint line: `Return` new block · `Tab` indent · `⌘⇧Return` branch from a word.
- The hint fades after three blocks or 30 seconds. It does not reappear in that document.

### 5.3 Empty document — Continuous and Page

| Case | Message | Actions |
|---|---|---|
| Document has no content | "Nothing to read yet." / "Nothing to paginate yet." | **Add a Top-Level Block** (focuses it, switches to Outline), **Open the Sample** |
| Chapter has no content | "This chapter is empty." | **Add a Top-Level Block**, **Move a Block Here…** |
| Selection is outside the viewport | "“Spectral radius” is in Chapter 1." | **Go to Chapter 1** |

The Page layout never shows a blank infinite grid. It shows a page with an edge, margins, a footer, and an explanation if the document is empty.

### 5.4 Sample document: "Linear algebra — eigenvalues"

The sample is opened from the Welcome window and Help menu. It opens as an editable copy in the default documents folder.

It is deliberately small (11 blocks, 2 chapters, 2 pages) and demonstrates chapters, a chapter-start page break, a text anchor, a formula anchor, a code anchor, an image-region anchor, a shared block, a framed algorithm, and cross-page reference links.

| Chapter | Block | Type | Content (summary) | Parent | Notes |
|---|---|---|---|---|---|
| 1 "Eigenvalues and eigenvectors" | B1 | Text | "Definition: a nonzero vector **v** is an eigenvector of **A** if A v = λ v for some scalar λ, the eigenvalue." | — (top-level) | Text anchor on "λ, the eigenvalue" |
| 1 | B2 | Text | "λ is the stretch factor: A scales v by λ without changing its direction." | B1 | Anchored child of B1 |
| 1 | B3 | Formula | `\det(A - \lambda I) = 0` | — (top-level) | Formula anchor on `\det(A - \lambda I)` |
| 1 | B4 | Formula | `\det(A - \lambda I) = (2-\lambda)^2 - 1 = (\lambda-1)(\lambda-3)` | B3 | Anchored child of B3 |
| 1 | B5 | Text | "Worked example: A = [[2,1],[1,2]] has eigenvalues 1 and 3." | — (top-level) | |
| 1 | B6 | Text | "Spectral radius: the largest \|λ\| bounds how fast A^k grows." | B5 | Shared block: also linked from B8 in chapter 2 |
| 2 "Computing eigenvalues" | B7 | Code | Power iteration in Python (10 lines) | — (top-level) | Framed; code anchor on `A @ v` |
| 2 | B8 | Text | "Convergence: power iteration converges to the dominant eigenvector when \|λ₁\| > \|λ₂\|." | B7 | Anchored child of B7; reference link to B6, label "bound" |
| 2 | B9 | Image | Diagram: two eigenvector arrows at 45° and −45°, lengths 3 and 1 | — (top-level) | Image-region anchor on the long arrow |
| 2 | B10 | Text | "The long arrow is the dominant direction; repeated application stretches any vector toward it." | B9 | Anchored child of B9 |
| 2 | B11 | Text | "Applications: Markov chains, PCA, vibration modes." | — (top-level) | Reference link from B1, label "see also" |

Edges:

- Six top-level blocks: B1, B3, B5 (chapter 1); B7, B9, B11 (chapter 2).
- Four anchored branches: B1→B2, B3→B4, B7→B8, B9→B10.
- One regular child: B5→B6.
- Two reference links: B8→B6 ("bound", cross-chapter/page), B1→B11 ("see also", cross-chapter/page).

Pagination in the sample:

- Page 1: Chapter 1 heading, B1/B2, B3/B4, B5/B6.
- Page 2: Chapter 2 heading (starts on a new page), B7/B8, B9/B10, B11.
- The Continuous layout shows a derived page-break marker before the Chapter 2 heading; the marker is labeled "Page 2 · Chapter 2 starts here". It is a hint from the paginator, not the exact print geometry.
- No continuation marker is needed: the break is at a chapter start, which is a clean boundary. Continuation markers are demonstrated in 10.5.

Coach marks appear once, in the sample:

1. After the Continuous layout opens: "This is the same paginator as Page Read. `⌘2` / `⌘3` switch; `⌘E` reads."
2. After the first block click: "Double-click to edit. Click an anchor dot to follow a branch."
3. After the first selection: "Select a word and press `⌘⇧Return` to branch from it."

Dismissing a coach mark hides it permanently; they never block clicks.

### 5.5 Sample walkthrough (acceptance scenario)

1. Open the sample. It opens in **Continuous + Edit**, scrolled to Chapter 1.
2. Click the anchor dot on the `det(A − λI)` formula in B3. B4 highlights; the anchor health sheet / block menu shows "Branch from det(A − λI)".
3. Press `⌘1`. The outline opens with Chapter 1, B3 and B4 visible; B4 carries the chip `↳ “det(A − λI)”`. Selection is unchanged.
4. Press `⌘2`, then scroll or `⌥↓` to the derived page-break marker. The marker reads "Page 2 · Chapter 2 starts here".
5. Press `⌘3`. Page Read opens on page 2; the chapter heading is at the top, and the footer reads "Page 2 of 2". `⌘E` is disabled with "Page editing is not available yet."
6. Click B8. Its **See also** list shows the reference link "bound → Spectral radius (Chapter 1, page 1)". Clicking it jumps to B6 in Continuous or page 1 in Page Read.
7. Press `⌘2` to return to Continuous Edit, double-click B7, select `A @ v`, press `⌘⇧Return`, type "why normalization matters". A new block appears below the anchor. The Continuous layout reflows; its derived markers update. Press `⌘3` to see the exact Page Read result; if the new block moves to another page, the page indicator updates and the preview shows the new pagination.
8. Press `⌘⇧E`. The preview shows 2 A4 pages. Export all pages.
9. Open the PDF. Text is selectable; page 2 matches Page Read; the anchored branch appears in place below the code block.

If any step requires a mouse, a dialog, or a layout/mode switch to complete, it is a defect. The only exception is the export sheet, which is a deliberate confirmation surface.

---

## 6. Core flows

Flow index:

| ID | Flow | Used by |
|---|---|---|
| F1 | Create, open, save, close | All |
| F2 | Add a chapter, top-level, sibling or child block | P1 |
| F3 | Edit content inline (Markdown, formula, code, image) | P1 |
| F4 | Branch from a whole block | P1 |
| F5 | Branch from an anchor (text, formula, code, image) | P1, P2 |
| F6 | Reorder, reparent, detach, move between chapters | P1, P2 |
| F7 | Collapse and expand (outline and Continuous) | P2 |
| F8 | Shared child and reference links | P1, P2 |
| F9 | Pagination, page breaks, continuation, overflow | P1, P2 |
| F10 | Switch layouts and modes | All |
| F11 | Undo and redo | All |
| F12 | Export all pages as a PDF | P2 |
| F13 | Search and navigate the document | P3 |
| F14 | Page setup and manual break hints | P1, P2 |
| F15 | Manage chapters | P1 |

### F1 — Create, open, save, close

**Create**

1. `⌘N` or Welcome → **New Document**.
2. A new window opens with one chapter and one empty top-level block; caret inside.
3. The document is created in the default documents folder (`~/Documents/NoteForest` by default, configurable), with a generated filename: "Untitled", "Untitled 2", and so on.
4. Autosave starts immediately. The title bar shows "Untitled" and is editable; renaming the title renames the file. A name collision appends a number; the app never overwrites another document.
5. A document in which no block has content is discarded on close.

**Open**

1. `⌘O`, Welcome → **Open…**, recent list, or drag a document onto the app icon or window.
2. If the document is already open, focus that window instead of opening a second copy.
3. A file written by a newer schema opens read-only with a banner; no write is attempted.

**Save**

1. Autosave runs after a short pause (target: 1 s), atomically.
2. `⌘S` flushes immediately. It never opens a dialog.
3. `⌘⇧S` saves a copy to a chosen location and keeps the copy open. `File > Duplicate` creates a copy next to the original.
4. `File > Show in Finder` reveals the document file.
5. The title bar dot and the status bar show the save state; no "Save successful" toast.

**Close**

1. `⌘W` closes the window. Because autosave has already run, there is no save prompt in the normal case.
2. If the last save failed, closing prompts: **Try Again**, **Save As…**, **Close Without Saving**.
3. Reopening restores the window, the last view, the scroll/camera, and the current chapter. Page setup and manual break hints come from the document.

**Rules and edge cases**

- Empty documents are discarded on close and do not appear in recents.
- A missing file keeps the window open with the last content and a banner: "This document is no longer at its location." Actions: **Save As…**, **Locate…**.
- A read-only file opens with a banner; editing is disabled, export is allowed.
- Dragging a document onto an open window opens it in a new window; it never replaces the current document.

### F2 — Add a chapter, top-level, sibling or child block

| Action | Keyboard | Menu | Continuous |
|---|---|---|---|
| New chapter | `⌘⌥C` | Chapter → New Chapter | Chapter menu |
| New top-level block in the current chapter | `⌘⌥Return` | Block → Add Top-Level Block | Block menu |
| New sibling below | `Return` | Block → Add Sibling | Context menu → Add Sibling |
| New child | `⌘Return` | Block → Add Child Block | `⌘Return`, or click the branch handle |

Page Read is read-only: add, edit, and delete commands are disabled there. Page Edit is planned and disabled until implemented. Use Continuous Edit or Outline.

**Steps (outline, sibling)**

1. Caret is in a block, or a block is selected.
2. `Return`.
3. If the caret is in the middle of text, the block splits at the caret; the second half becomes the new sibling. Children stay with the original block.
4. If the caret is at the end, a new empty sibling is created after the current block's entire visible subtree.
5. The new block scrolls into view, is focused, and is ready for typing. No placeholder text is inserted.

**Rules**

- Creating a child of a collapsed block expands it first.
- A new block inherits nothing (plain text). It does not inherit the parent's type or formatting.
- `Return` on an empty block outdents it one level; at top level it deletes the block and focuses the previous block.
- `⌫` at the start of a block merges it into the previous block only if it has no children. If it has children, show a one-line hint.
- `⇧Return` inserts a line break inside the current block; it never creates a block.
- Adding a top-level block to a chapter does not create a page; the paginator recomputes.
- A new chapter starts with one empty top-level block and, by default, a page break before its heading.
- Undo restores the block, its chapter, its order, and its focus.

### F3 — Edit content inline

**Text / Markdown**

1. Click text, press `Return` on a selected block, or double-click in Continuous Edit (Page Read and Continuous Read are read-only).
2. Type. Markdown input rules convert as you type: `# `, `- `, `1. `, `> `, `**bold**`, `*italic*`, `` `code` ``, `$...$`, `$$` at the start of a block, triple backticks at the start of a block.
3. `Esc` leaves editing and commits. It does not cancel; use `⌘Z` to undo.
4. `Return` creates a block (or continues a list); `⇧Return` inserts a line break.

**Formula**

1. Click a formula, or type `$$` and a space at the start of a text block.
2. The block switches to a formula editor: LaTeX source in monospace with a live preview above it.
3. `Return` commits; `⇧Return` adds a line; `Esc` commits and leaves.
4. Invalid LaTeX shows the source with an inline error and a warning marker. The source is never discarded.
5. The inspector offers "Render with fallback" if the default renderer cannot handle the formula.

**Code**

1. Click a code block, or type triple backticks and a space at the start of a text block.
2. Editing is in a code surface with line numbers, syntax highlighting and a language picker.
3. `Tab` inserts indentation inside code; `⇧Tab` outdents.
4. `Return` inserts a newline inside the code block; `⌘Return` creates a child block.
5. `Esc` leaves editing and commits.

**Image**

1. Paste an image, drop an image file, or use `/image` at the start of a block.
2. The image is copied into the document's assets; the external file is not referenced.
3. The block shows the image at block width; the inspector exposes alt text.
4. Very large images show progress while copying; the editor stays responsive.
5. If the image is taller than a page, it is an unbreakable overflow (F9); it is never silently shrunk or clipped.

**Lists inside a block**

- `Return` in a list item continues the list.
- `Return` on an empty list item ends the list and creates a new sibling block.
- `⌘]` / `⌘[` indent/outdent a list item.
- `Tab` / `⇧Tab` still move the block. A first-run hint explains this once: "Tab moves the block; ⌘] nests the list item."

**Block type menu**

- `/` at the start of an empty block opens: Text, Formula, Code, Image.
- The block gutter type icon opens the same menu.
- Switching type preserves text where possible.

### F4 — Branch from a whole block

**Outline**

1. Select a block.
2. `⌘Return` (or the row's `+` → **Add Child**).
3. A new empty child is created, the parent expands, the branch is drawn, the caret is in the child.
4. Type.

**Continuous Edit**

1. Select a block.
2. `⌘Return`, the right-edge **branch handle**, or the context menu → **Add Child**.
3. A new empty child is created below its siblings (or in the next adaptive position). The Continuous layout reflows.
4. If the new block causes a block-level overflow, the overflow banner appears.
5. Page Read is the exact preview; switch to it to see the new pagination.

**Rules**

- The new direct child is placed last among the parent's direct (unanchored) children. Anchored primary children are emitted before direct children (D3).
- The branch handle is a click target. Dragging it onto another block reparents that block; dragging it to empty space does nothing (no free positioning).
- Branch creation always creates a new block. To connect to an existing block, use F8.
- Undo removes the branch and the new block in one step if the block is still empty; if content was typed, typing is undone first.

### F5 — Branch from an anchor

**Text anchor**

1. Select a word or phrase inside one block.
2. A floating selection toolbar appears: **Branch**, **Highlight**, **Link**, **More**.
3. Press `⌘⇧Return` or click **Branch**.
4. The selection becomes an anchor: a dotted underline with a small dot. A new child is created below the anchor, the branch is drawn, and the caret is in the child.
5. Type. `Esc` leaves editing and selects the new block.

**Formula anchor**

1. Open the formula editor.
2. Select a substring of the LaTeX source, or the whole formula.
3. `⌘⇧Return`.
4. The child is created. The rendered formula shows a best-effort marker on the term; if it cannot be mapped, the branch dot sits at the formula edge and the anchor chip shows the source text. The branch is never lost because the marker is approximate.

**Code anchor**

1. In the code block, select a token or range.
2. `⌘⇧Return`.
3. The range is highlighted with a gutter dot; the child is created.

**Image region anchor**

1. Select an image block. Its toolbar shows **Add Region**.
2. Drag a rectangle over the image (or `⌥`-drag on the image).
3. On release, choose **Branch from region** (default) or **Cancel**. A region only exists as the source of a branch.
4. The region gets a numbered marker; the child is created below the image.

**Rules**

- Anchors are created in Outline or Continuous Edit. Page Read is read-only: clicking an anchor dot follows its branch, but does not create one. Page Edit is planned and will use the same anchor rules.
- An anchor must be inside one block. A multi-block selection disables **Branch** with "Anchors work within one block." A text selection containing inline math or images is allowed: the quote uses a plain-text projection (text + LaTeX source + image alt/placeholder), and the mark binding remains truth (OD-12). A selection that crosses a block-level atomic node (display math, image, code block) or a table-cell boundary is rejected.
- If nothing is selected, `⌘⇧Return` branches from the whole block.
- Anchors are unique per span. Branching the same span again creates another branch from the same anchor, not a second anchor. Overlapping anchors are allowed; each has its own ID.
- Removing the last branch from an anchor leaves the anchor record **idle**: the marker is hidden, no callout remains, and it is not listed as broken. An explicit **Remove anchor** command deletes the idle record and its binding (undoable) (OD-2).
- If an anchor span is lost (text edited away, formula replaced, image replaced, crop changed), the branch falls back to the whole block, shows a broken/ambiguous marker, and stays repairable through the anchor health sheet. The child is never deleted.
- Anchored children are placed in a **callout lane** below the parent card. Direct children stay to the right while they fit; when they wrap, they join the same below stack after the callouts. Below-stack rows share one left trunk; every arrow enters its target from the left, never from the top. "Below the anchor" means below the anchor's block card, not inside the card under the span. Pixel alignment is best-effort in M3; M4 gates it at 2 px (AC-52).
- Anchored children are emitted **before** direct children in the outline and callout lane (D3). They wrap and paginate like any branch. If a callout crosses a page boundary, atomic children move whole and long text children continue at a safe boundary, with a ghost parent and continuation marker.
- The anchor marker is reachable from the block menu and the anchor health sheet; no core anchor action is mouse-only (D13).
- Highlight (`⌘⇧H`) is a text mark with no structural meaning.

### F6 — Reorder, reparent, detach, move between chapters

**Outline**

| Action | Keyboard | Result |
|---|---|---|
| Move up/down among siblings | `⌘⇧↑` / `⌘⇧↓` | Block and subtree move; order changes |
| Indent (make child of previous sibling) | `Tab` | Primary parent changes; subtree moves |
| Outdent | `⇧Tab` | Becomes a sibling of its former parent; at top level, does nothing (hint) |
| Drag to reorder | Drag the gutter handle | Drop line between blocks |
| Drag to reparent | Drag onto the middle of a block | Block becomes the last child; auto-expand after 600 ms |
| Drag to reference | `⌥`-drag onto a block | Reference link, no reparenting |
| Drag across a chapter divider | Drag a top-level block across the divider | Moves the block and subtree to that chapter |
| Detach | Block menu → **Detach** | Becomes a top-level block at the top of the current chapter |

**Continuous Edit**

| Action | Result |
|---|---|
| Drag a block vertically | Reorders it among its siblings; a drop line shows the target |
| `⇧`-drop on a block | Reparents the dragged block (and subtree) under the target |
| `⌥`-drop on a block | Reference link from the dragged block to the target; layout does not change |
| Drag from the branch handle to a block | Makes the target a child of the source; role popover if the target already has a parent |
| `⌥`-drag from the branch handle to a block | Reference link from source to target |
| Drag to empty space | Nothing; snaps back. No free positioning. |

Page Read is read-only: it accepts selection, page navigation, zoom and focus, but no drag, reparent, or reorder. Use Continuous Edit or Outline to change structure. Page Edit is planned and disabled until implemented.

**Rules**

- Reparenting moves the whole subtree. The layout and pagination re-run.
- A structural branch cannot create a cycle. Dropping a block into its own descendant is refused; the message offers **Link as Reference**.
- Dropping from a branch handle onto a block that already has a parent shows the role popover: **Link as Reference** (default), **Move Here**, **Cancel**.
- A body drag with `⇧` always moves the dragged block; it cannot create a second parent.
- Moving a top-level block to another chapter is a chapter-order change; the chapter headings and pagination update.
- Every structural move is one undo step, including the subtree and the chapter change.
- Reordering is vertical only. There is no horizontal drag; horizontal position is adaptive layout, not user-positioned.

### F7 — Collapse and expand (outline and Continuous)

- Collapse is an outline and Continuous navigation aid. Collapsing a block hides its primary descendants **and its anchored callouts** with the rest of the subtree; the hidden count includes them (spec §7.6). Expanding restores them.
- The Page layout and PDF always show the full document. Collapse in Page is a later product decision; `⌘⇧[` / `⌘⇧]` in Page Read show "Collapse is available in the outline and Continuous layout." They do not change the Page layout or export.
- Outline: disclosure triangle, `⌘⇧[`, or context menu. A collapsed block shows "4 hidden".
- `⌘⇧]` expands one level; `⌥`-click expands the subtree; `⌘⌥[` / `⌘⌥]` collapse/expand all.
- Collapsing a block whose descendant is selected moves the selection to the collapsed block.
- Collapse is presentation state, persisted as view state, **not undoable**; the outline and Continuous layout share it.
- Why: hiding a subtree in Page/PDF would silently change what exports. Page/PDF stay complete; Continuous keeps authoring compact.

### F8 — Shared child and reference links

A block has exactly one primary parent. It may have any number of reference links.

**Create a reference link**

1. Select a source block (or an anchor).
2. `⌘⇧L`, or context menu → **Link to Block…**.
3. A searchable picker lists blocks with chapter context and the derived Page Read page when available. Type to filter; `↑↓`; `Return`.
4. A dashed edge is drawn when both endpoints are visible; otherwise the source shows a **See also** chip with the chapter and label. M3 has no Page layout, so no page number yet; M4 adds the derived page (OD-9).
5. The link is listed in the source's **See also** list and the target's **Referenced by** list (block menu / chips in M3; the inspector is a later surface).

**Alternative gestures**

- Outline: `⌥`-drag a block onto another.
- Continuous Edit: `⌥`-drag a block body, or `⌥`-drag from a branch handle.
- Continuous Edit: `⌥`-drop from an anchor drag creates a reference link from the anchor.
- Page Read: read-only; click a "See also" chip or a reference edge to follow it. Link creation happens in the editor or Outline. Page Edit is planned.

**Rules**

- Reference links never change outline order, chapter, layout, or pagination. This is an invariant.
- Reference links may create cycles. No error.
- A duplicate link (same source and target, **regardless of role**) is not created; the existing edge is selected and pulsed. If a primary edge already exists, **Link as Reference** focuses it instead of creating a second edge (OD-3).
- A second primary parent is impossible. The role popover offers **Link as Reference** (default) or **Move Here**.
- **Make home** is available on an existing reference edge and requires the target to have a primary parent. If the target is already a root, **Make home** is disabled; use **Move here** or **Add as child** (OD-7).
- Deleting a reference link never deletes a block.
- In the outline, reference links are not child rows; the target shows "Shared · N", and the block menu / **See also** list shows sources.
- Cross-page references are chips ("See also") plus list rows, not long lines across pages. In M3 the chip shows the chapter/label; M4 adds the page number.
- Anchored reference links are allowed; they are dashed from the anchor dot and never create a callout.

### F9 — Pagination, page breaks, continuation, overflow

Pagination is derived. There is no page container, page split, or page management.

**How pagination works**

1. The layout is continuous: chapters, top-level blocks, children, anchored callouts.
2. The paginator scans the layout in reading order and breaks between blocks, or at a safe internal boundary inside a long block, when the next content would cross the printable page bottom.
3. It never cuts a line, image, code block, or formula. A long text block may continue; an atomic element moves whole to the next page.
4. If the break falls inside a subtree or a long block, a continuation marker and a ghost parent label the break and the resume point.
5. A manual break hint ("Insert Page Break Before") asks the paginator to start a page before a block. It is honored when possible.
6. A chapter "start on new page" setting is a manual break hint at the chapter heading.
7. Page numbers and page count are results. They can change when content or page setup changes.

**Page-break markers**

| Place | Visual | Interaction |
|---|---|---|
| Outline | A marker row between blocks: `Page 2 · Chapter 2 starts here`; dashed for automatic, solid + "Manual" for manual | Click for menu: **Remove Manual Break**, **Keep This Break** (convert auto to manual), **Why This Break?** |
| Continuous | A horizontal line across the layout with a page label; dashed/solid. It is a derived hint, not exact print geometry | Same menu; the line is not a block and does not interrupt the tree |
| Page | The exact page boundary itself; footer "Page 2 of 5" | Page navigation; no marker row |

Rules:

- A manual break marker is solid and labeled "Manual". An automatic marker is dashed and labeled "Automatic".
- Clicking an automatic marker offers **Keep This Break**, which inserts a manual hint before the next block so future edits do not move the break.
- Clicking a manual marker offers **Remove Manual Break**; the paginator recomputes.
- Page-break markers are not blocks and are skipped by arrow-key navigation.
- The marker of the current page is highlighted in the outline and Continuous when Page Read is on that page.
- Continuous markers are derived from the same paginator as Page/PDF. They are hints and must not be presented as a pixel-accurate preview.

**Continuation markers**

A continuation marker appears when a break falls inside a subtree or a long block, not at a chapter or top-level boundary:

- Bottom of the page / at the marker: `↳ “Eigenvalues and eigenvectors” continues on page 2`.
- Top of the next page / at the resume block: a **ghost parent** (dimmed, non-editable ancestor) plus `Continued from page 1`.
- The ghost parent shows the nearest top-level block or chapter heading; clicking it jumps to the real parent.
- The marker names the nearest top-level block or chapter, whichever is clearer; if both, use the chapter and the top-level block.
- A long text block continues at a safe boundary (paragraph/list item/line). A line, image, code block, or formula is never cut.
- In Continuous, the marker sits on the derived page-break line and the ghost parent at the top of the next page; in Page Read, both are in the exact page flow; in the outline, the marker row carries the continuation label.
- A continuation marker is not an error and does not block export.

**Overflow**

A page never overflows: the paginator adds pages. A block overflows only when it has no safe break point, or an atomic element is too tall or too wide.

| Type | Cause | UI | Recovery |
|---|---|---|---|
| **Unbreakable element too tall** | A single line, image, code block, or formula is taller than the printable height | Warning outline; banner "This element is taller than a page"; export blocked | Resize the image, shorten the code/formula, split the text around the element, or switch to landscape |
| **Element too wide** | A code line, table, or image cannot wrap within the page width | Warning outline; banner "This element is wider than the page"; export blocked | Wrap the code/table, resize the image, shorten the line, or switch to landscape |
| **Manual break invalid** | A manual break before a block whose unbreakable element still overflows | The break marker is shown with a warning; the element overflows | Remove the break, fix the element, or move the break |
| **Pagination changed** | Content edits moved page breaks | Status chip "Pages updated"; page numbers in the Continuous/Outline update | Insert manual breaks to stabilize, if needed |

Rules:

- A long text block continues at a safe boundary (paragraph/list item/line); the app never cuts a line, image, code block, or formula.
- Splitting content into multiple blocks is a user edit (cut/paste), undoable as normal editing.
- A block that overflows is shown in a warning state; it is not clipped, and export is blocked until it fits.
- A manual break is a hint, not a guarantee. If it cannot be honored, the app says so; it does not silently ignore it.
- Page numbers may change as content changes. The document is the source of truth; page numbers are a view of the current pagination.

### F10 — Switch layouts and modes

1. `⌘1` Outline, `⌘2` Continuous, `⌘3` Page.
2. `⌘E` toggles Edit/Read inside the active layout. In Page, `⌘E` is disabled with "Page editing is not available yet." until Page Edit ships.
3. If an editor is open, the edit is committed first. A layout/mode switch creates no undo entry.
4. Selection, focus, breadcrumbs, chapter, focus mode, and layout freeze carry over.
5. Continuous scrolls to the block's layout position; Page scrolls to the block's page; Outline scrolls to the row.
6. If a block is hidden by a collapsed ancestor in the outline/Continuous layout, expand it. Page does not need expansion because it always shows the full document. If the block is in another chapter, scroll to that chapter.
7. With no selection, each surface restores its last focus or the top of the document.

The layout/mode switch is not undoable and does not create history entries.

### F11 — Undo and redo

There is one visible undo stack. Text typing may be handled by the active editor, but the user experiences one sequence.

**Routing rule**

- If the last action was typing, `⌘Z` undoes the typing; if the edited block is not focused, focus returns to it first.
- Otherwise `⌘Z` undoes the last document command (create, move, delete, branch, link, chapter, manual break, page setup).
- Typing coalesces into natural groups; structural commands never coalesce.
- After undo, the affected blocks are revealed in the current layout; selection moves to the affected block.
- The Edit menu shows the action name: "Undo Move Block", "Undo Create Branch", "Undo Create Chapter", "Undo Manual Break".

**What is undoable**

| Action | Undoable | Notes |
|---|---|---|
| Typing and formatting | Yes | Editor history, routed as above |
| Create / delete block | Yes | Includes subtree, branches, anchors |
| Move / indent / outdent / reparent | Yes | One step per move |
| Create / delete branch | Yes | Includes the empty child created with the branch |
| Create / delete anchor | Yes | Anchor removal is tied to its last branch |
| Create / delete reference link | Yes | |
| Create / delete/rename/reorder chapter | Yes | Chapter order and contents |
| Move block between chapters | Yes | Chapter assignment restored |
| Insert / remove manual page break | Yes | Pagination recomputed |
| Page setup change | Yes | Pagination recomputed |
| Collapse / expand (outline and Continuous) | No | Presentation state |
| Layout/mode switch, page navigation, zoom, pan, focus | No | Navigation |
| Save, export | No | Not document mutations |
| Document title | Yes | |

Redo is cleared by any new action. Undo history is per window session; it is not persisted across launches.

### F12 — Export all pages as a PDF

v1 has one export: all pages, generated by the same paginator as the Page layout, with real text. It is the Page layout in Read mode; there is no separate reader/outline export.

**Entry points:** `⌘⇧E` (sheet), `⌘P` (quick export with last settings), toolbar **Export**, File → Export.

**Step 1 — Preview.** The sheet shows page thumbnails, the page count, and the page size/orientation/margins from Page Setup. The preview is Page Read, not a different layout.

**Step 2 — Preflight.**

- **Unbreakable overflow (N)**: blocking. The PDF cannot be produced without clipping, so **Export** is disabled. Actions: **Review Element**, **Page Setup…** (landscape), **Cancel**.
- **Manual breaks that cannot be honored (N)**: warning; the PDF will still export with the paginator's actual breaks. The list names the blocks.
- **Lost anchors (N)**: warning; exported as a note attached to the block, without a span marker.
- **Missing assets (N)**: warning; labeled placeholder.
- **Formula render errors (N)**: warning; source text with a warning marker.

**Step 3 — Export.** A progress sheet with Cancel. The file is written to a temporary location and moved into place atomically; a failed export leaves no partial file. All pages are rendered.

**Step 4 — Success.** A toast with **Open PDF** and **Show in Finder**. Filename `<Title>.pdf`.

**Rules**

- The PDF follows document order: chapters, top-level blocks, children, anchored callouts. It uses the same page breaks, continuation markers, ghost parents, page numbers and header as Page Read.
- The PDF is light, regardless of the app's dark appearance (Q16).
- Text is real and selectable. If the PDF has no text layer, the export has failed.
- Page/PDF include the full document; the Continuous collapse state is not exported.
- Export is a snapshot; later edits do not change the file.
- The document title, chapter titles and page count are in the PDF metadata; page numbers are in the footer.
- **Handwriting workflow:** choose A4, portrait, and the **Wide right** margin in Page Setup for handwriting space. Import the standard PDF into an external annotation app. The app does not write ink back into the document.

### F13 — Search and navigate

1. `⌘F` opens a find bar at the top of the current surface.
2. Search covers block text, code, LaTeX source, anchor quotes, branch labels and chapter titles. Case-insensitive; no regex in v1.
3. Results are grouped by chapter and block with a breadcrumb and a snippet. `Return` / `⇧Return` cycle; the surface scrolls to the hit, switches layout/mode if needed, and selects the block.
4. Collapsed content is searchable; selecting a hit expands its ancestors in the outline.
5. `Esc` closes the find bar and restores the previous selection.
6. `⌘G` / `⌘⇧G` repeat next/previous.

Search is a navigation tool, not a query language. A document-wide search palette is out of scope.

### F14 — Page setup and manual break hints

**Page Setup** (`⌘⌥P` or Page → Page Setup…):

1. Choose size (A4, Letter), one document-wide orientation (portrait or landscape), margins (Normal, Wide right), and chapter start (new page, continuous).
2. Choose page numbers and running header on/off.
3. The sheet shows a live preview of page 1 and a warning: "Changing the page geometry will re-paginate all 5 pages. 2 manual breaks may be affected."
4. **Apply**. The paginator recomputes. The action is undoable. If an element overflows, the overflow banner appears and export is blocked until it fits.

**Manual break hints**

- **Insert Page Break Before** on a block (or `⌘⌥B`): adds a manual break hint. The marker becomes solid and labeled "Manual". If the block is a chapter's first block, it may duplicate the chapter-start hint; the app shows one marker.
- **Remove Manual Break** on a manual marker: removes the hint and re-paginates.
- **Keep This Break** on an automatic marker: inserts a manual hint before the next block, stabilizing the current break.
- **Why This Break?** explains the fit: "B7 is 420 pt tall; only 310 pt remain on page 1."
- Manual breaks are document settings, not page objects. They are listed in the Pagination panel with block names and can be removed there.
- A manual break is a hint. If it cannot be honored, the marker shows a warning; it is not silently ignored.

**Rules**

- Page setup is document-level. Orientation is one document-wide setting at a time; there is no mixed orientation.
- Pages are derived; there is no page create, duplicate, delete, split, move, or reorder command.
- A document always has at least one chapter; deleting the last chapter replaces it with a new empty chapter.
- A chapter always has at least one top-level block. If all content is deleted, the chapter shows one empty block and the empty state offers **Add a Top-Level Block**.

### F15 — Manage chapters

- **New Chapter** (`⌘⌥C`): adds a chapter after the current one, with one empty top-level block and a "start on new page" hint. Focus goes to the chapter title; `Return` commits the title and moves the caret to the first top-level block.
- **Rename**: click the chapter heading in the outline or Continuous Edit; type; `Return`. Page Read shows the heading read-only; Page Edit (later) may edit it.
- **Reorder**: drag the chapter heading in the outline, or Chapter → Move Up/Down. Chapter order is document order.
- **Delete**: Chapter menu → Delete Chapter. If it has content, confirm with block count; undoable. Deleting the last chapter leaves a new empty chapter.
- **Start on new page**: a toggle in the chapter inspector or Chapter menu; it is a manual break hint at the heading. Default on.
- **Move blocks between chapters**: drag a top-level block across a chapter divider in the outline, or **Move to Chapter…** on a top-level block. The block and subtree move; pagination updates.
- **Chapter heading is not a block**: no branches, anchors, or child blocks. It can be styled as a heading in the PDF.
- **Breadcrumbs** include the chapter: `Document › Chapter 2 › B7 › B8`.

---

## 7. Continuous and Page interaction models

### 7.1 Shared model

Continuous and Page render the same canonical document and derived pages. They share:

- Selection and focus.
- Chapter and block order.
- Page-break positions from the paginator. Continuous shows them as derived markers; Page shows them as exact page boundaries.
- Layout freeze state (per window).
- The same anchors, branches, and reference links.
- The same full document content; collapse is not applied to Page/PDF.

They differ in presentation and mode:

| | Continuous | Page |
|---|---|---|
| Layout | Continuous vertical | A4 page by page |
| Page breaks | Derived markers across the layout (hints, not exact print geometry) | Exact page boundaries |
| Page numbers | In the marker labels and footer | In the footer |
| Modes | **Edit** (default): full authoring with continuous reflow. **Read:** read-only; navigation, links, anchors, copy, zoom, focus preserved | **Read:** exact and read-only now. **Edit:** planned, disabled until implemented |
| Best for | Flow, authoring, long branches | Fit, print proof, WYSIWYG check |

Page Read is the PDF target: it shows exactly what the PDF will render. Page Edit, when implemented, will share the same geometry and differ only in interactivity. Continuous markers come from the same paginator but are not a pixel-accurate preview.

Page/PDF always show the full document. Collapse is an outline/Continuous navigation aid; it never hides content from Page or PDF.

### 7.2 Continuous

| Input | Result | Feedback |
|---|---|---|
| Two-finger scroll / wheel | Scroll the continuous layout | Direct |
| Pinch / `⌘`+scroll | Zoom | Live |
| `Space`+drag, middle-drag | Pan the viewport | Hand cursor |
| `⌘+` / `⌘−` | Zoom in/out | Step |
| `⌘0` | 100% | |
| `⇧1` | Fit width | 200 ms ease |
| `⌥↑` / `⌥↓` | Jump to previous/next derived page-break marker | Marker highlights; page indicator updates |
| `⌘E` | Toggle Edit/Read | Status shows Edit or Read; no undo entry |
| Click a ghost parent | Jump to the real parent | Scrolls; selects the parent |
| Click a block | Select | Ring |
| `⇧`-click | Add/remove from selection | Ring |
| Drag empty space (Edit) | Marquee | Live rectangle |
| Drag a block vertically (Edit) | Reorder among siblings | Drop line; reflow on drop |
| Drag onto a block (`⇧`, Edit) | Reparent | Child outline |
| Drag onto a block (`⌥`, Edit) | Reference link | Dashed outline |
| Drag from branch handle to block (Edit) | Make target a child | Target highlight |
| Click branch handle (Edit) | Add a child | New block, caret |
| Double-click block (Edit) | Edit in place | Editor overlay; continuous reflow |
| Right-click | Context menu | 7.5 |
| `Return` (Edit) | Edit selected block | |
| `⌘Return` (Edit) | Add child | |
| `⌘⇧↑` / `⌘⇧↓` (Edit) | Move block/subtree among siblings | Reflow |
| `Tab` / `⇧Tab` (Edit) | Indent/outdent selected block (not editing) | Reflow |
| `⌫` (Edit) | Delete selection | Confirm large |
| `F` / `⌘⇧F` | Focus: dim outside subtree, zoom to it | Breadcrumb; `Esc` exits |
| Arrows | Move selection to nearest block in direction | Ring |
| `⇧`+arrow | Add nearest block in direction | Ring |
| `Esc` | Leave editing → exit focus → clear selection | Progressive |

Continuous rules:

- Continuous Edit is the default authoring surface in v1 (ADR-0007). Continuous Read is the same layout, read-only for content.
- Page-break markers are lines, not gaps; the layout does not stop at a page. They are derived hints from the paginator, not exact print geometry.
- A continuation page starts with a ghost parent immediately after the derived page-break marker; it is dimmed and not editable.
- Editing in Continuous Edit reflows continuously. Markers move live if content changes; a small "Pages updated" chip appears if the page count changes.
- Continuous Read disables editing chrome (caret, selection toolbar, mutating gutter controls, drag handles, image authoring) but keeps selection, links, anchors, reference navigation, copy, scroll, zoom, focus, and outline navigation.
- Focus dims everything outside the focused subtree and its ancestor path, and zooms to fit it. Clicking a dimmed block exits focus and selects it.
- Page navigation jumps to derived markers, not to a page container.

### 7.3 Page

| Input | Result | Feedback |
|---|---|---|
| Two-finger scroll / wheel | Previous/next page at fit; pan when zoomed | Direct |
| Pinch / `⌘`+scroll | Zoom | Live |
| `Space`+drag | Pan | Hand cursor |
| `⌘+` / `⌘−` / `⌘0` | Zoom / 100% | |
| `⇧1` | Fit page | 200 ms |
| `⇧2` | Fit width | 200 ms |
| `⌥↑` / `⌥↓` | Previous/next page | Page indicator |
| `⌘E` | Disabled in Page Read until Page Edit ships | Title: "Page editing is not available yet." |
| Click a ghost parent | Jump to the real parent | Scrolls to its page; selects it |
| Click block | Select for inspection | Ring |
| Click a reference chip / anchor | Follow the link or branch | Jumps to the target; selection updates |
| Double-click block | Open in Continuous Edit | Switches to Continuous; selection preserved |
| `Return` | Open selected block in Continuous Edit | Switches to Continuous; selection preserved |
| `F` / `⌘⇧F` | Zoom to subtree | Breadcrumb; `Esc` returns |
| `Esc` | Exit focus → clear selection | |

Page rules:

- **Page Read is read-only for content.** It accepts selection, page navigation, zoom, focus, link following, Page Setup and Export; it does not accept text editing, structural edits, drag, or delete. New Chapter and manual-break commands are disabled in Page Read.
- **Page Edit is planned and disabled.** The Edit control is visibly unavailable with a clear reason, not a broken toggle. When implemented, Page Edit will use one active block editor overlay and the same geometry as Page Read.
- Double-click or `Return` is a bridge to Continuous Edit: it switches to Continuous in Edit mode and focuses the same block. It never opens an editor on Page Read.
- A long text block may continue at a safe boundary; a line, image, code block, or formula is always whole. If an atomic element cannot fit, it is an unbreakable overflow (F9).
- A continuation page starts with a ghost parent above the resumed content; it is dimmed and not editable.
- Page Read is the exact WYSIWYG check and the PDF target: what is on the page is what the PDF renders. It is not a separate layout.
- After an edit in Continuous Edit or Outline, Page Read shows the new pagination when you switch to it. Page numbers and the footer update.
- Page Read shows the full document regardless of the Continuous collapse state.
- Focus zooms to the selected subtree within the page; it does not dim the rest (the page is the context).
- Page navigation is page by page; `⌥↑/↓` and the page indicator.

### 7.4 Drag and reflow in Continuous Edit

- Dragging a block vertically reorders it among siblings; the block lifts, a drop line shows the insertion, and the layout reflows on drop.
- Dragging onto a block with `⇧` reparents; a cycle is refused with "Would create a loop. Hold ⌥ to link instead."
- Dragging from a branch handle onto a block makes the target a child; if the target already has a parent, the role popover appears.
- Dragging to empty space does nothing; the block snaps back. No free positioning, no pins, no nudges.
- After a drop, Continuous Edit reflows. Page Read is read-only and shows the result when you switch to it; if an element overflows, the banner appears. Page Edit is planned.
- `Esc` during a drag cancels and restores the original order.
- Group drag is not supported; multi-selection is for actions, not positioning.
- Page Read accepts no drag. Use Continuous Edit or Outline for structural changes.

### 7.5 Context menus

| Target | Items |
|---|---|
| Block (Continuous Edit/Outline) | Edit, Add Child, Add Sibling, Branch from Selection (while editing), Insert Page Break Before, Remove Manual Break (if manual), Link to Block…, Move Under…, Move to Chapter…, Framed, Copy as Markdown, Delete |
| Block (Continuous Read, read-only) | Follow Links, Copy as Markdown, Focus |
| Block (Page Read, read-only) | Open in Continuous Editor, Copy as Markdown |
| Top-level block (Continuous Edit/Outline) | Add Top-Level Block Below, Move to Chapter…, Detach (if child), Insert Page Break Before, Delete |
| Anchor (Continuous Edit/Outline) | Follow Branch, Select Branch, Reattach… (if lost), Copy Anchor Text, Remove Anchor (with confirmation) |
| Anchor (Continuous Read/Page Read, read-only) | Follow Branch, Copy Anchor Text |
| Branch (Continuous Edit/Outline) | Select, Edit Label, Change to Reference / Change to Structural, Delete Branch |
| Branch (Continuous Read/Page Read, read-only) | Select, Follow to Target |
| Empty space (Continuous) | Add Top-Level Block (Edit), Paste (Edit), Select All, Fit Width, Focus, Page Setup… |
| Empty space (Page) | Page Setup…, Fit Page, Fit Width, Export…, Select All on Page |
| Page-break marker (Continuous/Outline) | Remove Manual Break (if manual), Keep This Break, Why This Break? |
| Page-break marker (Page Read, read-only) | Why This Break?, Open in Continuous Editor |
| Chapter heading (Continuous Edit/Outline) | Rename, New Chapter After, Move Up/Down, Start on New Page, Delete Chapter |
| Chapter heading (Page Read, read-only) | Open in Continuous Editor |

In Continuous Read and Page Read, editing items are disabled; their menus show navigation, copy, Page Setup and Export only. Page Edit is planned and, when implemented, will share Page Read geometry with editing enabled.

Menu items are the accessible version of every gesture. Anything in a context menu must also be in the menu bar.

### 7.6 Focus, breadcrumbs, page context

- **Continuous focus** (`F` / `⌘⇧F`): dims outside the focused subtree and zooms to fit it. `Esc` exits. Available in Edit and Read.
- **Page focus**: zooms to the selected subtree within the page; no dimming. `Esc` returns to fit page.
- **Outline focus**: hoists the subtree. `Esc` exits.
- Breadcrumbs: `Document › Chapter › Top-level › … › Current`. Clicking scrolls and selects.
- Page context: the page indicator follows the focused block if visible; otherwise it follows the viewport center. In Continuous, the page is derived from the scroll position/marker; in Page, it is the visible exact page.
- Page numbers are a view of the current pagination, not stable identifiers. Use block links, chapters, and breadcrumbs for navigation.

### 7.7 States

| State | Trigger | Behavior |
|---|---|---|
| Empty | No blocks | Empty message with **Add a Top-Level Block** |
| Continuous Edit | Default | Full layout, derived markers, authoring |
| Continuous Read | `⌘E` | Full layout, derived markers; editing disabled; navigation/links/copy preserved |
| Page Read | Page layout | Exact pages, footer, no marker rows; read-only; PDF target |
| Page Edit unavailable | `⌘E` in Page | Disabled with "Page editing is not available yet." |
| Focused | `F` | Continuous dims/zooms; Page zooms |
| Layout frozen | `⌘⌥L` | Page breaks/positions held; edits marked pending; **Reflow Now** |
| Unbreakable overflow | Element cannot fit a page | Warning outline + banner; export blocked |
| Manual break invalid | Hint cannot be honored | Marker warning; export warning |
| Read-only file | Newer schema / locked file | Banner; editing disabled; export enabled |
| Exporting | Export in progress | View stays interactive; export sheet owns progress |

---

## 8. Outline interaction model

### 8.1 Row anatomy

```text
[chapter heading: Chapter 2 · 3 top-level blocks]      (not a block)
[page-break marker: Page 2 · automatic]                (not a block)
[disclosure] [drag handle] [type icon]  Content…       [anchor chips] [shared] [hidden count]
```

- **Chapter heading** appears before its top-level blocks. It is editable (title) and has a menu, but is not a block.
- **Page-break marker** appears where the paginator breaks. Automatic markers are dashed; manual markers are solid and labeled "Manual". It is not a block.
- **Disclosure** appears only when the block has children.
- **Drag handle** appears on hover/selection.
- **Type icon** opens the block-type menu.
- **Chips** after content: anchor count, `Shared · N`, `4 hidden`, `Framed`, `Top-level`, `Lost anchor`, `Overflows`.
- Anchored children show a leading chip: `↳ “det(A − λI)”`.

### 8.2 Keyboard model

| Key | Action | Context |
|---|---|---|
| `Return` | New sibling below (splits at caret) | Editing or block selected |
| `⇧Return` | Line break inside the block | Editing |
| `⌘Return` | New child, focused | Any |
| `⌘⌥Return` | New top-level block in the current chapter | Any |
| `⌘⌥C` | New chapter after current | Any |
| `⌘⌥B` | Insert/remove manual page break before the selected block | Any |
| `Tab` | Indent block (make child of previous sibling) | Editing, not in code |
| `⇧Tab` | Outdent block | Editing, not in code |
| `⌘]` / `⌘[` | Indent/outdent list item | Inside a list |
| `⌘⇧↑` / `⌘⇧↓` | Move block/subtree among siblings | Block selected or editing |
| `↑` / `↓` | Move caret between blocks at first/last line | Editing |
| `←` at start | Go to parent block, caret at end | Editing |
| `→` at end | Go to first child, caret at start | Editing, expanded |
| `⇧↑` / `⇧↓` | Extend block selection | Not editing |
| `⌘A` | Select all blocks | Not editing |
| `Esc` | Leave editing → exit focus → clear selection | |
| `⌫` at start | Merge with previous block (only if no children) | Editing |
| `⌘⇧⌫` | Delete selected block(s) | Not editing |
| `⌘⇧[` / `⌘⇧]` | Collapse / expand | Outline and Continuous |
| `⌘⌥[` / `⌘⌥]` | Collapse all / expand all | Outline and Continuous |
| `⌘⇧F` | Focus selected subtree (hoist) | Any |
| `⌘⇧L` | Link to an existing block | Any |
| `⌘⇧Return` | Branch from selection (anchor + branch), or from the block | Any |
| `⌥↑` / `⌥↓` | Previous/next page-break marker | Any |

Rules:

- `Return` on an empty block outdents; at top level it deletes the block and focuses the previous one.
- `⌫` at the start of a block with children does not merge; it shows a hint. This prevents a subtree from being silently absorbed.
- Arrow-left at start / arrow-right at end are proposed navigation aids (Q4). They never fire mid-text.
- `⌘A` selects all blocks only when not editing. While editing, it selects the block's text; press `Esc` first.
- Structural keys never fire while the IME is composing text.
- Chapter headings and page-break markers are skipped by arrow-key navigation; their menus are in the toolbar/context menu.

### 8.3 Selection

- Clicking the gutter selects the block; clicking the text edits it.
- `⇧`-click selects a contiguous range; `⌘`-click toggles.
- `⇧↑` / `⇧↓` extend by visible block, skipping hidden descendants.
- The selection follows document order; a collapsed block counts as one row; headings and markers are not rows.
- The inspector shows bulk actions. Status bar shows "N selected".
- Deleting a multi-selection removes every selected block and its subtree, one undo step.

### 8.4 Drag and drop

| Drop zone | Result | Indicator |
|---|---|---|
| Top 25% of a row | Insert before, as a sibling | Line above |
| Bottom 25% of a row | Insert after, as a sibling | Line below |
| Middle 50% | Make last child | Outline around target |
| Middle + `⌥` | Reference link | Dashed outline |
| Onto a collapsed block | Expand after 600 ms | Disclosure animates |
| Onto a descendant | Forbidden (cycle); offer link | Forbidden cursor |
| Across a chapter divider | Move top-level block/subtree to that chapter | Divider highlights |
| Onto a page-break marker | No special page move; reorder only; pagination recomputes | Marker does not accept a drop |

- Dragged row ghost: first line; multi-selection shows "3 blocks".
- Auto-scroll near edges.
- `Esc` cancels and restores.
- Dropping a reference link does not change order; target gets "Shared".
- Only top-level blocks can cross a chapter divider. A child is refused with "Only a top-level block can move between chapters."

### 8.5 Chapters, page breaks, anchors

- Chapter heading shows title and top-level count; menu: Rename, New Chapter After, Move Up/Down, Start on New Page, Delete Chapter.
- Page-break marker shows `Page N` and "automatic" or "Manual"; continuation label if inside a subtree. Menu: Remove Manual Break, Keep This Break, Why This Break?
- The marker of the current page is highlighted.
- Anchored children appear **before** direct (unanchored) children, in anchor order (start position, then anchor ID), then branch order within one anchor (D3). Same indentation as children, prefixed by `↳ “quote”`. A thin left rule groups siblings sharing an anchor.
- Reference links are not child rows; the target shows `Shared · N`; the block menu / **See also** list shows sources with chapter/label (page number in M4).
- Lost anchor child row shows `Lost anchor` + **Reattach**; the branch stays attached to the whole block until repaired.
- An idle anchor (no branches) has no row and no callout; the source block shows no anchor chip. The anchor health sheet's **All anchors** filter offers **Remove anchor** (OD-2).
- The outline always shows the full tree.

### 8.6 Focus in the outline

`⌘⇧F` hoists the focused block: only that block and its descendants, with a breadcrumb and **Exit Focus**. `Esc` exits. The breadcrumb includes the chapter and, if useful, the current page.

---

## 9. Keyboard shortcut map (macOS)

Legend: `⌘` Command · `⇧` Shift · `⌥` Option · `⌃` Control · `↵` Return · `⌫` Delete · `⎋` Escape · `↑↓←→` arrows.

All shortcuts appear in the menu bar or the shortcuts sheet and are remappable. Shortcuts respect system combinations.

### 9.1 Global and document

| Shortcut | Action |
|---|---|
| `⌘N` | New document |
| `⌘O` | Open… |
| `⌘S` | Save now |
| `⌘⇧S` | Save As… |
| `⌘W` | Close window |
| `⌘Z` | Undo |
| `⌘⇧Z` | Redo |
| `⌘F` | Find in document |
| `⌘G` / `⌘⇧G` | Next / previous match |
| `⌘1` | Outline |
| `⌘2` | Continuous layout |
| `⌘3` | Page layout |
| `⌘E` | Toggle Edit/Read in Continuous; disabled in Outline and in Page until Page Edit ships |
| `⌘[` / `⌘]` | Back / forward in focus history |
| `⌥↑` / `⌥↓` | Previous / next page |
| `⌘⌥C` | New chapter |
| `⌘⌥B` | Insert/remove manual page break before block |
| `⌘⌥L` | Freeze / unfreeze layout |
| `⌘⌥R` | Reflow now |
| `⌘⌥P` | Page Setup… |
| `⌘⇧E` | Export… |
| `⌘P` | Quick export (all pages, last settings) |
| `⌘⌥I` | Show/hide inspector |
| `⌃Tab` / `⌃⇧Tab` | Leave / enter the main view (keyboard-trap escape) |
| `⌘,` | Settings |
| `⌘⇧/` | Keyboard shortcuts sheet |
| `⎋` | Leave editing → exit focus → clear selection |
| `⌃⌘F` | Toggle full screen (system) |

### 9.2 Outline authoring

| Shortcut | Action |
|---|---|
| `↵` | New sibling below (split at caret) |
| `⇧↵` | Line break inside the block |
| `⌘↵` | New child (branch from block) |
| `⌘⌥↵` | New top-level block in the current chapter |
| `⌘⌥C` | New chapter |
| `⌘⌥B` | Manual page break before block |
| `Tab` / `⇧Tab` | Indent / outdent block |
| `⌘]` / `⌘[` | Indent / outdent list item |
| `⌘⇧↑` / `⌘⇧↓` | Move block and subtree up/down |
| `⌘⇧[` / `⌘⇧]` | Collapse / expand block |
| `⌘⌥[` / `⌘⌥]` | Collapse all / expand all |
| `⌘⇧F` | Focus on selected subtree |
| `⇧↑` / `⇧↓` | Extend block selection (not editing) |
| `⌘A` | Select all blocks (not editing) |
| `⌘⇧⌫` | Delete selected block(s) |
| `⌘⇧L` | Link to an existing block (reference) |

### 9.3 Editing and branches

| Shortcut | Action |
|---|---|
| `⌘B` / `⌘I` | Bold / italic |
| `⌘⇧X` | Strikethrough |
| `⌘⇧C` | Inline code |
| `⌘K` | Add/edit web link |
| `⌘⇧H` | Highlight (non-structural) |
| `⌘⇧↵` | Anchor + branch from selection; if none, from the block |
| `/` at block start | Block type menu |
| `$$` + `Space` | Convert to formula block |
| Triple backticks + `Space` | Convert to code block |
| `⌘⇧L` | Link to an existing block |
| `Tab` | Indent block; in code, insert indentation; lists use `⌘]` / `⌘[` |

### 9.4 Continuous and Page

**Shared navigation (Continuous and Page; Page Read is read-only; Page Edit planned)**

| Shortcut | Action |
|---|---|
| `⌘2` / `⌘3` | Continuous / Page |
| `⌘E` | Edit/Read in Continuous; disabled in Page until Page Edit ships |
| `Space`+drag / middle-drag | Pan the viewport |
| `⌘+` / `⌘−` | Zoom in / out |
| `⌘0` | Reset zoom to 100% |
| `⇧1` | Fit view: fit width in Continuous, fit page in Page |
| `⇧2` | Fit width (Page only; no-op in Continuous) |
| `⌥↑` / `⌥↓` | Previous / next page (Continuous: derived marker; Page: exact page) |
| `F` / `⌘⇧F` | Focus: Continuous dims/zooms; Page zooms |
| `↑↓←→` | Move selection to nearest block |
| `⇧`+arrow | Add nearest block to selection |
| `⎋` | Leave editing (Continuous Edit) → exit focus → clear selection |

**Continuous authoring (Edit mode, no editor open)**

| Shortcut | Action |
|---|---|
| `↵` | Edit selected block |
| `⌘↵` | Add child |
| `⌘⇧↑` / `⌘⇧↓` | Move block/subtree among siblings |
| `Tab` / `⇧Tab` | Indent/outdent selected block |
| `⌘⇧[` / `⌘⇧]` | Collapse / expand focused block |
| `⌘⌥[` / `⌘⌥]` | Collapse all / expand all |
| `⌫` | Delete selection |
| `⇧`-drop | Reparent onto a block |
| `⌥`-drop | Reference link to a block |

**Page Read (read-only)**

Page Read has no editing shortcuts. `Return` or double-click opens the selected block in Continuous Edit; add, edit, delete, indent, and drag commands are disabled. Page Edit is planned and will reuse the Continuous authoring shortcuts with one active block editor.

### 9.5 Shortcut rules

- **Single-key shortcuts** (`F`, `⇧1`, `⇧2`, arrows) work in Continuous with no editor open and in Page (Read-only now). They can be disabled in Settings.
- **Page Read is read-only.** Content and structure commands are disabled in Page Read, including New Chapter, New Block, Insert/Remove Manual Break, Delete, indent/outdent, and drag/drop. `Return` or double-click opens the block in Continuous Edit. Undo/redo remain global; the preview updates. Page Edit is planned and disabled until implemented.
- **`⌘E` is mode, not inline code.** Inline code is `⌘⇧C` so Edit/Read has one unambiguous global meaning.
- **`Tab` is the only structural key that changes meaning inside code blocks.**
- **`Esc` never cancels editing.** It commits and leaves. `⌘Z` is the way back.
- **`⌘P`** is quick export, not system print. Native printing is out of scope; the user prints the exported PDF.
- **`⌥↑` / `⌥↓`** are page navigation in all layouts and modes; disabled while editing in a text field.
- **Freeze/Reflow are view-state commands.** `⌘⌥L` freezes layout and pagination; `⌘⌥R` reflows now. They are not undoable and do not change the document.
- **No page-management commands or shortcuts.** There is no New Page, Duplicate Page, Delete Page, Split Page, or Move to Page. Pages are derived.
- **No pin/nudge shortcuts.** There is no free positioning.
- **`⌃`** is used only for the system full-screen toggle and `⌃Tab` to leave the main view.
- **Menu bar parity:** every shortcut is a menu item, and every menu item has a shortcut or a documented reason not to.

---

## 10. Visual language and states

This section defines behavior and hierarchy, not final visual design.

**Visual direction.** Clean, Obsidian-like, minimal: content-first, low chrome, one accent color, generous whitespace, no decorative panels or gradients. **Dark mode is the default**; light mode is available. The PDF is light in v1 (Q16).

### 10.1 Block, chapter, and page anatomy

| Part | Behavior |
|---|---|
| **Document** | The window; one title; a sequence of chapters |
| **Chapter** | A heading row in the outline; a large heading in Continuous/Page; a page break may start before it |
| **Top-level block** | A content block with no parent; a "Top-level" chip in the outline; the first block of a section |
| **Page** | A rendered sheet with an edge, margins, footer, and page number; not a container |
| **Page-break marker** | A line in Continuous/Outline with a page label; dashed auto, solid manual; derived hint, not exact print geometry |
| **Continuation marker** | A label at a break and at the resume point |
| **Ghost parent** | A dimmed, non-editable ancestor at the top of a continuation page; click jumps to the real parent |
| **Surface** | A block is a readable card in Continuous/Page; a row in the outline; the print renderer in the PDF |
| **Anchor dots** | 8 pt visual, 24 × 24 pt hit area |
| **Branch handle** | Right-edge handle in Outline/Continuous Edit; click adds a child, drag to a block reparents. Hidden in Continuous Read and Page Read. Page Edit is planned |
| **Chips** | Child count, shared, framed, top-level, lost anchor, overflow |

### 10.2 Block states

| State | Trigger | Behavioral treatment | Interaction |
|---|---|---|---|
| **Default** | Not hovered/selected | Quiet surface; no handles | Editable on click/double-click in Outline/Continuous Edit; Continuous Read and Page Read select only |
| **Hover** | Pointer over | Handles/chips fade in in Outline/Continuous Edit; read modes show chips only; no layout shift | Click selects/edits in Outline/Continuous Edit; read modes select |
| **Selected** | Click gutter/block | Accent ring; handles in Outline/Continuous Edit; inspector updates | Drag reorder/delete/edit in Continuous Edit/Outline; Page Read inspects |
| **Focused** | Last interacted | Ring + breadcrumb | Keyboard actions target it |
| **Editing** | Click text / `Return` / double-click in Outline/Continuous Edit | Caret; editing ring; Continuous reflows; Read modes are read-only | Text keys; `Esc` commits |
| **Continued** | Block continues on the next page | Ghost parent at the top of the next page; continuation marker | Click ghost parent to jump; read-only marker |
| **Multi-selected** | Shift/Cmd click, marquee | Rings; "N selected" | Delete, copy; no group move |
| **Collapsed** | Outline or Continuous | Descendants hidden; "N hidden"; Page/PDF remain full | Expand |
| **Top-level** | No primary parent | "Top-level" chip | Chapter actions |
| **Shared** | Reference links | "Shared · N"; dashed edge when both endpoints are visible; otherwise a "See also" chip (page number in M4) | Click → links |
| **Framed** | Inspector/menu | Heavier border; algorithms/definitions | Toggle |
| **Lost anchor** | Anchor text edited away | Amber dashed segment; "Lost anchor" chip; branch falls back to the whole block; child stays | Relink, attach to block, delete branch, keep broken |
| **Invalid formula** | LaTeX error | Source visible; warning chip | Fix; export warning |
| **Missing asset** | Asset absent | Placeholder with filename | Relink |
| **Search hit** | Find result | Highlight; current hit stronger | `Return` cycles |
| **Drop target** | During drag | Line/rounded outline/dashed/forbidden | Release |
| **Unbreakable overflow** | Line/image/code/formula too tall/wide | Warning outline; banner; export blocked | Resize/shorten element, landscape |
| **Preview (Page Read)** | Page Read | No caret, no handles; selection ring only | Inspect, follow links; **Open in Continuous Editor** to edit. Page Edit is planned |
| **Read-only file** | Newer schema/locked | No caret; banner | Export only |

### 10.3 Branches and arrows

| Branch | Visual | Layout effect | Interaction |
|---|---|---|---|
| **Structural** | Solid 1.5 pt, filled arrowhead | Parent/child; adaptive layout | Click; `⌫` removes with rules |
| **Anchored structural** | Solid, starts at anchor dot, enters the below stack from the left | Child below anchor, before wrapped direct children; wraps/paginates | Click; highlights span |
| **Reference, both endpoints visible** | Dashed 1.25 pt, open arrowhead | None | Click; label |
| **Reference, not both visible** | "See also" chip + list row | None | Click jumps |
| **Anchored reference** | Dashed from anchor dot; no callout | None | Same |
| **Lost-anchor** | Dashed amber segment + `?` | Child stays below the edge | Relink, attach to block, delete branch, keep broken |
| **Drag preview** | Low-opacity arrow | None until drop | Drop |
| **Hover highlight** | Source/target/span strengthen | None | Hover never reflows |

Rules:

- Structural vs reference is encoded by dash pattern and arrowhead, not color.
- Anchored vs block-origin is encoded by where the line starts.
- Branch routing updates after a reflow/pagination, not on every pointer move.
- Cross-page references are never long lines across pages; they are chips. In M3, a dashed edge is drawn only when both endpoints are visible; M3 chips show the chapter/label, and M4 adds the page number (OD-9).

### 10.4 Anchors

- Anchor: subtle dotted underline + dot; quieter than a highlight.
- Hover: dot grows; tooltip `Anchor: “λ” · 2 branches`.
- Click: selects the first branch; click again cycles.
- Formula anchors are best-effort markers; the branch dot at the formula edge keeps the branch reachable.
- Image anchors are numbered circles at the region corner.
- Lost anchor: amber segment and a "Lost anchor" chip. The branch falls back to the whole block so it stays usable; the anchor health sheet shows the stored quote and reattach candidates (OD-10).
- Idle anchor: marker hidden; no callout; no warning. The anchor health sheet's **All anchors** filter offers **Remove anchor** (OD-2).
- Anchor health is a status chip plus sheet/dialog in M3, not a permanent right inspector (OD-10). The sheet lists broken/ambiguous anchors by default; no modal on load.

### 10.5 Adaptive layout, page breaks, continuation — examples

**Adaptive widths.** The row is filled with content-driven widths; siblings can differ.

```text
Page width (A4, inside margins)
┌──────────────────────────────────────────────────────────────┐
│ Top-level: "The characteristic polynomial"                   │
│                                                              │
│  ┌─────────────────────────────┐   ┌──────────────────────┐  │
│  │ det(A − λI) = 0             │   │ Why it works         │  │
│  │  ┌──────────────┐           │   │ (narrow leaf)        │  │
│  │  │ Expansion    │           │   └──────────────────────┘  │
│  │  └──────────────┘           │                             │
│  └─────────────────────────────┘                             │
│    ↳ "Roots" wrapped below because the row is full           │
│       ┌──────────────┐                                       │
│       │ λ = 1, λ = 3 │                                       │
│       └──────────────┘                                       │
└──────────────────────────────────────────────────────────────┘
```

- The wide block with the subtree takes more horizontal space; the narrow leaf sits beside it.
- "Roots" does not fit to the right, so it wraps below the parent with a slight indent.
- No fixed columns: the widths come from the content, and the row is balanced.

**Page break inside a subtree → continuation marker.**

```text
Continuous (Edit or Read)
  Chapter 1 · Eigenvalues
    Definition
      Stretch factor
      Examples
──────────────── Page 2 ────────────────
  GHOST: Definition (dimmed)   ← click jumps to the real parent
  “Continued from page 1”
      Counterexample
    Characteristic polynomial
      Expansion
```

- The break is between “Examples” and “Counterexample”, both children of “Definition”. No block is cut.
- “Definition” continues on page 2; the marker names the top-level block that owns the subtree.
- The ghost parent at the top of page 2 restores the context; it is dimmed and not editable.
- “Characteristic polynomial” is the next top-level block; it follows the continued subtree.

**Long block continues at a safe boundary.**

```text
Page 1
┌────────────────────────────────┐
│ Definition of the determinant  │
│ Paragraph 1 ...................│
│ Paragraph 2 ...................│
│ Paragraph 3 (starts on page 1, │
│   continues below) ............│
└────────────────────────────────┘
──────────────── Page 2 ────────────────
  GHOST: Definition of the determinant
  “Continued from page 1”
│ Paragraph 3 (continued) .......│
│ Paragraph 4 ...................│
└────────────────────────────────┘
```

- The break is between paragraphs, a safe internal boundary. No line is cut.
- The block keeps its identity; the second page starts with a ghost parent and a continuation marker.
- Images, code blocks, formulas, and single lines are atomic: if one cannot fit, it moves whole to the next page.

**Unbreakable element overflow.**

```text
Page 2
┌──────────────────────────────┐
│ [tall image / code block     │
│  or single formula           │
│  ...  does not fit]          │  ← warning outline; export blocked
└──────────────────────────────┘
```

- The paginator cannot cut a line, image, code block, or formula.
- The element is shown whole in a warning state; the user resizes the image, shortens the code/formula, or switches to landscape.
- The app never clips or cuts an atomic element.

### 10.6 Page-break markers and continuation markers

| Marker | Where | Visual | Action |
|---|---|---|---|
| Automatic break | Continuous, Outline | Dashed line/row; `Page 2 · automatic`; derived hint | Keep This Break, Why This Break? |
| Manual break | Continuous, Outline | Solid line/row; `Page 2 · Manual` | Remove Manual Break, Why? |
| Chapter start | Continuous, Outline | Solid line/row; `Page 2 · Chapter 2 starts here` | Remove via chapter setting |
| Continuation | Continuous, Outline, Page | `↳ Chapter 1 continues on page 2`; `Continued from page 1` | None (informational) |
| Ghost parent | Continuous, Page | Dimmed ancestor at the top of the continuation page | Click to jump to the real parent |
| Unbreakable overflow | Continuous, Page | Warning outline; banner | Fix element (resize/shorten/landscape) |

- Markers do not interrupt the tree; they are annotations on the layout.
- Manual markers are the only way to stabilize a break; automatic markers can move.
- Continuous markers are derived hints from the same paginator as Page/PDF; they are not WYSIWYG. Page Read and PDF are the exact geometry.
- Page numbers in markers are derived and update with pagination.

### 10.7 Zoom and level of detail

| Zoom | Name | Rendering | Chrome |
|---|---|---|---|
| 25–39% | Overview | First line/type label; images as thumbnails | No handles; page number |
| 40–124% | Comfort | Full content | Handles on hover |
| 125–200% | Detail | Full content, larger type; anchor dots/handles prominent | All handles |

Rules:

- ±3% hysteresis; LOD never changes data or export.
- Continuous default is fit width; Page default is fit page.
- Text below 40% is not editable; double-click zooms to Comfort, then edits (Continuous Edit only).
- Selection rings and lost-anchor/overflow markers remain visible at any zoom.

### 10.8 Motion

| Event | Motion | Reduced motion |
|---|---|---|
| Reflow after structural change | 120–180 ms ease-out | Instant |
| Freeze / Reflow Now | No reflow while frozen; Reflow Now 150 ms | Instant |
| Continuous scroll / Page scroll / pan / zoom | Direct | Direct |
| Fit width / fit page | 200 ms ease | Instant |
| Focus zoom | 200 ms ease | Instant |
| Layout/mode switch | 120 ms crossfade | Instant |
| Page-break marker update | Instant, no animation | Instant |
| Toast | 150 ms slide/fade | Instant |
| Typing, selection, save | No animation | No animation |
| Opening large document | Skeleton after 300 ms | Same, no shimmer |

Motion is never the only signal.

### 10.9 Color, contrast, themes

- One accent for selection/focus; structural vs reference never color-coded.
- Warnings use icon + label + pattern; amber/red are reinforcement.
- Unbreakable overflow uses a warning edge + banner + label.
- Text contrast ≥ 4.5:1; UI boundaries/focus ≥ 3:1.
- Dark mode default; light mode available. PDF light in v1 (Q16).
- Highlights are light tints, legible in grayscale.
- Print stylesheet uses the same hierarchy: headings, code, formulas, images, alt text.

---

## 11. Feedback, errors, and recovery

### 11.1 Principles

- Immediate feedback (50–100 ms for hover/selection).
- Quiet success; save state in the status bar; export toast.
- Specific errors ("This block is 420 pt tall; a page holds 600 pt").
- Recoverable: destructive actions undoable/confirmed; failed save never discards.
- Non-blocking: toasts for reversible; modals for ambiguous/irreversible (save conflict, cycle, large delete, overflow).

### 11.2 Persistent state indicators

| State | Where | Treatment |
|---|---|---|
| Saved | Status bar | Check + "Saved"; time on hover |
| Saving | Status bar/title | Spinner |
| Save failed | Status bar + banner | Red dot; **Retry** / **Save As…** |
| Read-only | Banner | "Read-only: newer version." |
| Lost anchors | Status bar chip | "2 lost anchors" |
| Unbreakable overflow | Element warning + status chip | "1 element doesn't fit a page" |
| Layout frozen | Status chip | "Layout frozen · 3 changes pending"; **Reflow Now** |
| External API | Status bar | "API off" / "API on · read-only" / "API on · read-write" |
| Pagination updated | Status chip | "Pages updated"; transient |
| Exporting | Export sheet | Progress + Cancel |
| Large document | Status chip / banner | "Performance mode" |
| Network | No sync or telemetry | No account; the External Agent API is loopback only. External clients may use their own network. |

### 11.3 Error and edge-case table

| Situation | Message | Recovery | Data safety |
|---|---|---|---|
| **Lost anchor** | "Anchor lost — the text “λ, the eigenvalue” was edited or removed. The branch is attached to the whole block." | **Relink to selection…**, **Attach to Block**, **Delete Branch**, **Keep Broken** | Branch/child kept; fallback to block |
| **Ambiguous anchor** | "This anchor matches 3 places in the block." | Choose a candidate with context; **Keep Broken**; cancel keeps ambiguous | No guessing |
| **Idle anchor (no branches)** | No error. "This anchor has no branches." (shown only under **All anchors**) | **Remove anchor** | Undoable; no target deleted (OD-2) |
| **Structural cycle** | "That would put “Power iteration” inside its own subtree." | **Link as Reference**, **Cancel** | Nothing changes |
| **Second structural parent** | "“Spectral radius” already has a parent in the outline." | **Link as Reference** (default), **Move Here**, **Cancel** | Non-destructive default |
| **Duplicate link** | "This link already exists." | **Show Branch** | None |
| **Missing asset** | "Image not found: eigenvector-diagram.png." | **Relink…**, **Remove Image**, **Export Anyway** | Block/branch kept |
| **Unbreakable element too tall** | "This image is taller than a page. A page holds 600 pt; the image is 820 pt." | Resize the image, shorten the code/formula, split the surrounding text, landscape | Nothing clipped; export blocked |
| **Element too wide** | "This code line is wider than the page." | Wrap code/table, resize image, shorten the line, landscape | Nothing clipped; export blocked |
| **Manual break invalid** | "The manual break before B7 cannot be honored because B7 is taller than a page." | Remove break, fix block, move break | Break not silently ignored |
| **Pagination changed** | "Pages updated: 4 pages instead of 5." | Insert manual breaks to stabilize | Content unchanged |
| **Chapter delete with content** | "Delete Chapter 2 and its 7 blocks?" | **Delete Chapter**, **Cancel** | Undoable |
| **Save conflict / external edit** | "This document changed on disk while you were editing." | **Compare…**, **Keep Mine**, **Reload from Disk**, **Save As…** | Backup before choice |
| **Disk full / permission** | "Couldn't save: the disk is full." | **Save As…**, **Retry** | Editing continues |
| **Newer schema** | "This document was created with a newer version of NoteForest." | **Open Read-Only**, **Cancel** | No write |
| **Corrupt document** | "This document couldn't be opened." | **Restore from Backup…**, **Cancel** | Backups kept |
| **Export failure** | "Export failed: a font could not be embedded." | **Try Again**, **Show Details**, **Copy Diagnostics** | No partial file |
| **Export blocked by overflow** | "Export is blocked until B7 fits a page." | **Review Block**, **Page Setup…**, **Cancel** | No clipped PDF |
| **Formula error** | "Formula error: unexpected token at position 12." | Edit source; **Render with Fallback** | Source kept |
| **Large delete** | "Delete 14 blocks, including 3 with branches?" | **Delete**, **Cancel** | One undo |
| **Large document** | "1,240 blocks on 42 pages. Some effects are reduced." | **Learn More**, **Don't Show Again** | No data change |

### 11.4 Toasts

- One at a time, bottom center, max 6 s.
- Reversible actions include **Undo** (same as `⌘Z`; only while it is the most recent action).
- Never stack.
- Never for save success, layout/mode switch, selection.
- Errors use banners/sheets/chips, not toasts.

### 11.5 Confirmation policy

| Action | Confirmation |
|---|---|
| Delete one block without children | No; undo toast |
| Delete a subtree with > 10 descendants | Yes, counts |
| Delete a multi-selection | Yes if > 3 blocks or > 10 descendants |
| Remove an anchor with branches | Yes; choose attach branches to block or delete them; target blocks are never deleted |
| Remove an idle anchor | No; undo toast (OD-2) |
| Delete a reference link | No; undo toast; target unchanged |
| Delete a chapter with content | Yes, chapter and block count |
| Page setup that re-paginates | Yes if page count or manual breaks may change |
| Insert/remove manual break | No; undoable |
| Overwrite on save conflict | Yes; default **Save As…** |
| Export with warnings | No; issues listed; **Export Anyway** |
| Export with unbreakable overflow | Blocked; no override |

### 11.6 Empty and loading states

| Surface | Empty | Loading |
|---|---|---|
| Outline | One chapter + one empty top-level block | Skeleton only if > 300 ms |
| Continuous | "Nothing to read yet." + **Add a Top-Level Block** | Faint layout skeleton |
| Page | "Nothing to paginate yet." | Page skeleton |
| Empty chapter | "This chapter is empty." + **Add a Top-Level Block** | Instant |
| Find | "No matches for “…”" | Inline spinner |
| Inspector | "Select a block to see details" | Instant |
| Lost anchors | "All anchors are healthy." | Instant |
| Export preview | "Nothing to export yet." | Thumbnail skeleton |
| Recents | "No recent documents." | Instant |

---

## 12. Accessibility

### 12.1 Commitments

1. **The outline is the accessible document.** Every object/action in Continuous/Page has a keyboard-reachable equivalent in the outline, inspector, or menu.
2. **Keyboard-only is a first-class path.** All flows in section 6 are keyboard-completable.
3. **No hover-only actions.**
4. **No drag-only actions.** Reparenting has Move Under…/indent/outdent; chapter moves have Move to Chapter…; breaks have Insert/Remove Manual Break.
5. **No color-only meaning.**

### 12.2 Focus model

- One focus ring at a time; always visible for keyboard users.
- Tab order: toolbar → main view → inspector → status bar.
- Outline: single Tab stop; arrows move; `Tab`/`⇧Tab` change structure; `⌃Tab` leaves.
- Continuous: single Tab stop; `Tab` enters at the focused block; arrows move spatially; `Return` edits in Edit mode; `Esc` steps out; `⌃Tab` leaves. In Read mode `Return` opens the focused block's links/actions, not an editor.
- Page: single Tab stop; `Tab` enters at the focused block; arrows move; `Return` or double-click opens the block in Continuous Edit; `Esc` steps out; `⌃Tab` leaves. Page Edit is planned.
- Page navigation `⌥↑/↓`; announced as "Page 2 of 5".
- Focus restored after layout/mode switches, undo, dialogs, export.
- Dialogs trap focus and return it.

### 12.3 Screen readers

- **Outline:** nested list with explicit levels; chapter headings and page-break markers announced as separators ("Page 2, automatic; Chapter 2 starts here"). Blocks announce type, first line, level, children, collapsed, shared, anchors, lost anchor, overflow.
- **Continuous:** a continuous document in outline order; derived page-break markers announced as "Page 2 starts here; Chapter 1 continues." Not read as a spatial canvas. Edit and Read are announced.
- **Page:** a sequence of page sections; each announces page number, chapter, top-level count, overflow. Blocks read in order; visual positions not read. Page Read is read-only; activating a block opens it in Continuous Edit. Page Edit is planned.
- **Branches:** "Branch from “λ, the eigenvalue” to “λ is the stretch factor”."
- **Anchors:** "Anchor: λ, 1 branch"; lost as "Lost anchor: λ, attached to the whole block, needs reattachment".
- **Continuation and ghost parent:** "Chapter 1 continues on page 2; ghost parent: Definition, continued from page 1."
- **Live regions:** save failure, export done, lost-anchor count, unbreakable overflow, layout frozen, pagination updated, "Moved 3 blocks." Not typing/incidental selection.
- **Formulas/code** expose text; formulas expose LaTeX on demand.
- **Images** require alt text; a branch source cannot be decorative.

### 12.4 Keyboard-only paths

| Task | Path |
|---|---|
| Create a document and three blocks | `⌘N`, type, `↵`, type, `↵`, type |
| Branch from a word | From Outline or Continuous Edit: select block, `↵`, move caret, `⇧⌥→`, `⌘⇧↵` |
| Reparent a block | From Outline or Continuous Edit: select, `Tab` / `⇧Tab`, or Block → Move Under… |
| Create a reference link | From Outline or Continuous Edit: select source, `⌘⇧L`, filter, `↵` |
| Create a chapter | From Outline or Continuous Edit: `⌘⌥C`, type the title, `↵` to move to the first block |
| Insert a manual break | From Outline or Continuous Edit: select block, `⌘⌥B` |
| Go to next page | `⌥↓` |
| Reattach a lost anchor | From Continuous Edit or Outline: `⌘⌥I` / status chip, choose anchor, **Reattach…**, pick, `↵` |
| Export | `⌘P` (quick export), or `⌘⇧E`, review the preview, **Export** |

### 12.5 Motion, contrast, display

- Reduce Motion: no reflow animation, no zoom easing, no pulses, instant view crossfade.
- Reduce Transparency / Increase Contrast: solid surfaces, stronger borders.
- UI scale (90/100/110/125%) independent of page zoom.
- Hit targets 24 × 24 pt Mac; 44 × 44 pt future touch; anchor/handle hit areas larger.
- Content text size setting; no text as image.

### 12.6 Shortcuts and assistive tech

- All shortcuts remappable; conflicts explained.
- Single-key Continuous/Page shortcuts can be disabled.
- Voice Control labels for icon-only controls (branch handle, anchor dot, page arrows, collapse).
- External API status is announced with its scope; settings are keyboard reachable.
- Shortcuts sheet searchable.

---

## 13. Scale and performance UX

The practical limit is block size and pagination, not canvas node count.

| Document size | Behavior |
|---|---|
| 1–5 pages, 1–50 blocks | Full fidelity |
| 5–15 pages (typical), 50–300 blocks | Full fidelity; render current viewport/page + neighbors |
| 15–40 pages, 300–800 blocks | Virtualize off-screen blocks/pages; shorten reflow animations |
| 40–50 pages, 800–1,000 blocks | Performance mode notice; animations off; simplified page thumbnails |
| > 50 pages / > 1,000 blocks | No hard cap, no performance promise; recommend splitting into documents |

Rules:

- Continuous renders the visible continuous region plus a buffer; Page renders the current page plus neighbors.
- Incremental reflow runs on committed changes; freeze mode defers layout and pagination; full reflow runs on request or after 1.5 s idle. A reflow never blocks typing. If it takes > 100 ms, the status bar shows activity and the layout catches up.
- Export renders every page; progress per page.
- Page-break markers, continuation labels, and ghost parents update after pagination.
- The status bar shows page and block counts.

---

## 14. Future iPad and touch

- No hover-only interactions; handles and anchors need touch-visible states.
- No modifier-only actions; `⇧`/`⌥` drops become explicit choices on long-press/drag.
- 44 × 44 pt targets; large invisible hit areas for anchors/handles.
- Long-press = context menu.
- Continuous: continuous scroll/swipe; Page: page swipe/pinch; page navigation by swipe. Read modes are the default for touch study; Edit mode is available with the on-screen keyboard.
- Text editing works with the on-screen keyboard.
- Pencil is for ink annotations in a later phase; the document model must not assume ink in a block.
- The page PDF is the iPad bridge for v1; external annotation apps handle ink.

---

## 15. Open UX questions

| # | Question | Why it matters | Current proposal / next step |
|---|---|---|---|
| Q1 | **Resolved by ADR-0007:** which spatial layout is primary? | Reader preserved flow; Page showed fit. | **Continuous + Edit is the default authoring surface. Continuous Read is read-only. Page Read is the exact read-only PDF proof. Page Edit is planned/optional.** |
| Q2 | Is "chapter" or "document" the right user-facing noun? | The product owner says chapter; the file is a document | Use document in v1; revisit naming |
| Q3 | How should adaptive widths be chosen? | Content-driven widths can make rows unbalanced; a large subtree may dominate | Measure content, cap extreme widths, balance rows; test with real notes |
| Q4 | When should a child wrap below the parent instead of going right? | The wrap rule defines the visual rhythm and page count | Wrap when the child + margin does not fit; keep a slight indent; test |
| Q5 | Where should the paginator break to avoid orphan headings? | A chapter/top-level heading alone at the bottom is bad | Keep heading with first child; avoid single-line orphans; test |
| Q6 | What exactly does a continuation marker and ghost parent say? | They must be clear without being noisy | Bottom: “continues on page N”; top: ghost parent + “continued from page N”; test |
| Q7 | How stable should manual breaks be? | Users may want the PDF page count stable; content edits move automatic breaks | Manual hints persist; show when invalid; no auto-stabilization |
| Q8 | **Resolved policy:** What if a long block or an atomic element is too tall/wide? | Long text should flow; lines, images, code and formulas must stay readable. | **Long text continues at safe boundaries; an unbreakable element overflows with a fix path (resize/shorten/landscape).** Boundary rules to validate with real notes. |
| Q9 | Does `Tab` moving the block (instead of indenting a list item) feel right? | Lists are common; the wrong behavior is hit constantly | Rule + hint; measure |
| Q10 | Should Continuous/Page support collapse/fold? | Hiding content would change pagination and exports | **Continuous/outline:** collapse hides primary descendants and anchored callouts with a hidden count (spec §7.6). **Page/PDF:** always full document; collapse in Page is a later product decision with explicit export semantics. |
| Q11 | Should cross-page reference links be lines or chips? | Lines across pages may be noisy; chips hide context | Chips + **See also** list; M3 shows chapter/label, M4 adds the derived page (OD-9); test |
| Q12 | Is formula-term anchoring by LaTeX source acceptable? | Users think in rendered formulas | Source + best-effort marker; test |
| Q13 | **Resolved:** Is page orientation document-level or per page? | Mixed orientation would complicate the paginator and the PDF. | **One document-wide orientation at a time; changing it reflows all pages. No per-page orientation.** |
| Q14 | Should a chapter always start on a new page? | It aids structure but can waste space | Default on; toggle per chapter; test |
| Q15 | Should page numbers be stable identifiers? | They change with content; users may cite them | Treat as derived; manual breaks stabilize; use block links |
| Q16 | Should dark mode produce a dark PDF? | Some study at night; annotation apps assume white | Light only v1; evaluate |
| Q17 | Is the sample the right onboarding, or templates? | Sample teaches the differentiator | Sample first; templates later |
| Q18 | Should Continuous allow free text/shape annotations? | Top scope-creep request; different product | No; annotations happen in the external PDF app |
| Q19 | Do we need page thumbnails? | Many pages need quick navigation; Continuous markers may be enough | Page indicator v1; thumbnails if asked |
| Q20 | Should Continuous show page gaps? | A continuous layout with derived markers vs a slight gap at page breaks | Markers only in v1; test readability; markers are hints, not exact print geometry |
| Q21 | Do we need a split view (Outline + Continuous, or Continuous + Page)? | The surface model is already a lot; split view doubles space and focus | No split in v1; revisit after real use |
| Q22 | Should Page Edit ship, and how should it handle a block that crosses a page boundary? | Page Edit is optional in ADR-0007; long blocks already continue at safe boundaries | **Planned/optional:** one active block editor overlay, same geometry as Page Read, no second paginator. Defer until continuous markers and PDF are stable; do not make Page Edit primary. |

---

## 16. External Agent API (UX surface)

V1 has **no in-app agent chat, sidebar, conversation, proposals, or autonomous agent**. External tools integrate through an opt-in local API. The only in-app UI is Settings and a status indicator.

### 16.1 Settings

Settings → Integrations → **External Agent API** (screen X7):

| Control | Behavior |
|---|---|
| **Enable local API** | Off by default. The API listens on loopback only; the sheet shows the endpoint and a **Copy** action. |
| **Token** | **Generate**, copy, **Rotate**, **Revoke**. The token is shown once, stored in the Keychain, and never written to the document, export, or logs. |
| **Scope** | **Read-only** (default) or **Read-write**. Read-only can read document structure and content; read-write can create, edit, move, and delete blocks, branches, anchors, chapters, and page-break hints. Read-write requires an explicit confirmation that an external tool will be able to change the document. |
| **Revoke token** | Turns the API off immediately and rejects new requests. |

- The external client owns its own chat/proposal UI. The app does not show prompts, messages, or diffs.
- If the document is read-only (newer schema or locked), the API is read-only regardless of token scope.
- API writes use the normal document command path and are undoable in the app.
- No background autonomy, web access, URL fetching, or external tool execution.

### 16.2 Status indicator

- The status bar shows one of: `API off`, `API on · read-only`, `API on · read-write`.
- The read-write state uses a warning accent; it is visible but never modal.
- Clicking the indicator opens External Agent API settings.
- The tooltip shows the loopback endpoint and the last request time; it never shows the token.
- No shortcut is assigned. Settings is `⌘,`; there is no agent-panel shortcut.

---

## Appendix A — UI copy conventions

- **Branch** is a relationship; **block** is a thing. Never "node", "edge", "card" in user-facing copy.
- **Page** is a derived sheet, not a container. Never "page object" in UI.
- **Top-level block** is the first block of a chapter section; never "root" in UI.
- **Reference link** is two words; "link" alone means a web link.
- **Lost anchor** in copy; "broken anchor" is internal jargon.
- **Manual break** and **continuation** are the page-model terms. No "split page".
- Inline actions use verbs: **Add child**, **Link to block…**, **Export anyway**, **Keep mine**, **Reload from disk**. Menu items use title case: **Add Child**, **Move Under…**.
- Errors name the object and the next action: "This image is taller than a page. Resize it or switch to landscape."
- Avoid "Oops", "Something went wrong", "Are you sure?" without a consequence.
- The title bar says "Untitled" until renamed; the export filename falls back to "Untitled".
- Page numbers are 1-based: "Page 1 of 3".

## Appendix B — Usability test script (first round)

Five tasks, 30 minutes, think-aloud, one moderator. Measure completion, time, and mouse reach.

| # | Task | What we are testing |
|---|---|---|
| 1 | "Capture this topic and give it five branches in a chapter." | Return/Tab, chapter start, first-run hints |
| 2 | "Branch from the λ in this definition and explain it." | Anchor discoverability, `⌘⇧Return`, selection toolbar |
| 3 | "Move this branch under that one, then undo it." | Reparent grammar, drag vs keys, undo |
| 4 | "Find the page break; make it stable; explain what continues on the next page." | Continuous markers, manual break, continuation comprehension |
| 5 | "Export a PDF you would annotate on your iPad." | Paginator/Page Read match, all pages, A4/margins, text layer |

Observe: do participants try to drag blocks to arbitrary positions? Do they expect pages to be containers? Do they understand a continuation marker? Do they press `Tab` in a list and get surprised? Do they expect a separate reader PDF? Do they look for Page Edit and understand that it is not available yet?

---

*End of v1.5. This document follows the Document → Chapters → top-level blocks model, the adaptive layout, derived pagination, and the Continuous/Page layouts with Edit/Read modes in `AGENTS.md` and ADR-0007.*
