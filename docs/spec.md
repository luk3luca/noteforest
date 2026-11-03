# NoteForest — Product, Data Model, and Behavior Specification

**Version:** v0.4.1 (approved for Spike 1)  
**Date:** 3 November 2026  
**Owner:** Planner / Architect  
**Status:** Approved for Spike 1. v0.4.1 clarifies PDF acceptance: a correct standard PDF reviewed on the Mac is sufficient; no app-specific import is a gate. The product owner ratified the v1 stack, PDF pipeline, External Agent API defaults, and table pagination on 3 November 2026. Implementation beyond Spike 1 still requires milestone approval.  
**Working title:** NoteForest (an existing NoteForest study app exists; public-release clearance or a rename is required before packaging)

This document defines the product behavior, conceptual data model, invariants, and acceptance criteria for the first prototype. **The v1 stack is decided:** Electron + React + TypeScript, with TipTap/ProseMirror, CodeMirror 6, KaTeX, and React Flow (ADR-0001). PDF export uses the shared paginator and Electron `printToPDF` (ADR-0002). The External Agent API defaults are decided in ADR-0003. The fixed requirements remain A4 pagination, real selectable text, no cut line/image/formula/code line/table row, external API, and local files. The canonical content representation is structured JSON with Markdown import/export, as recorded in `AGENTS.md`. This document does not define visual design or the final keyboard map; those belong in `docs/ux.md`.

**Normative language.** **MUST** means required for the v1 prototype to be accepted. **SHOULD** means expected unless explicitly deferred with a recorded decision. **MAY** means optional. Assumptions are labelled **A1**, **A2**, and so on. Decisions that still need approval are labelled **D1**, **D2**, and so on. Open questions are labelled **Q1**, **Q2**, and so on.

**Relationship to the research.** `research/landscape.md` is an input, not a decision record. Its infinite-canvas and reader-PDF recommendations are superseded by the product owner's page-based model. The current product decisions are in `AGENTS.md`; where this document conflicts with them, `AGENTS.md` wins.

---

## Contents

1. [Vision, target user, goals, and non-goals](#1-vision-target-user-goals-and-non-goals)
2. [Glossary](#2-glossary)
3. [Core use cases and user stories](#3-core-use-cases-and-user-stories)
4. [Conceptual data model](#4-conceptual-data-model)
5. [Operations](#5-operations)
6. [Views and interaction model](#6-views-and-interaction-model)
7. [Adaptive layout and pagination](#7-adaptive-layout-and-pagination)
8. [Anchor lifecycle](#8-anchor-lifecycle)
9. [Content model](#9-content-model)
10. [Persistence](#10-persistence)
11. [PDF export](#11-pdf-export)
12. [External Agent API](#12-external-agent-api)
13. [Edge cases](#13-edge-cases)
14. [Performance and scale](#14-performance-and-scale)
15. [Acceptance criteria for the v1 prototype](#15-acceptance-criteria-for-the-v1-prototype)
16. [Decisions and remaining questions](#16-decisions-and-remaining-questions)
17. [Risks](#17-risks)
- [Appendix A. Worked example](#appendix-a-worked-example)
- [Appendix B. Change log](#appendix-b-change-log)

---

## 1. Vision, target user, goals, and non-goals

### 1.1 Vision

NoteForest is a Mac-first study tool for people who think in structures. A learner writes a topic, expands it to the right and down, and attaches a branch to the exact word, formula term, code token, or image region that caused the thought. The same structure is an outline for fast authoring and a **continuous reader/page layout** for spatial review.

The product is not a general whiteboard and not a general knowledge base. It is personal-first: one learner's own documents, local files, no team accounts. Its wedge is narrow and specific: **a page-based study document in which a span of content visibly grows a branch, the layout stays predictable, and the page exports as a real-text PDF.**

### 1.2 Target user

**Primary user.** A university-level STEM student who:

- rewrites lecture notes by hand into a structure that starts with a topic on the left and expands right/down with arrows;
- uses formulas, code, lists, and images as normal note content;
- studies from the structure, not only from linear text;
- annotates exported PDFs by hand on an iPad;
- works on a Mac and expects keyboard-first authoring;
- wants local files, no cloud lock-in, and no telemetry.

**Secondary user.** A researcher or engineer who studies structured material and wants a visual map of definitions, derivations, examples, and references.

**Not the target user.** A team running a collaborative whiteboard; a PKM user who wants databases, supertags, queries, and a global graph; a user who wants freehand drawing or freeform canvas layout as the primary medium.

### 1.3 Jobs to be done

- **Capture quickly.** Get a lecture topic and its first branches into the document without fighting the editor.
- **Attach precisely.** Branch from a word, a formula term, a code token or line, or an image region, so the branch explains exactly what it came from.
- **Reorganize safely.** Move a block, change its home, or share it between topics without duplicating content or losing children.
- **Read spatially.** See the structure on A4 pages: top-level blocks stacked, adaptive children to the right or wrapped below, anchored branches under their anchors.
- **Read linearly.** Follow the same document as an outline when reviewing or writing, with page breaks visible.
- **Review page breaks.** See where the paginator will break pages and add a manual break hint when a break lands badly.
- **Study offline.** Export the pages as a real-text PDF, open them on an iPad, and annotate by hand.
- **Trust the document.** Edits, crashes, and migrations must not silently destroy content, branches, or anchors.

### 1.4 Product principles

1. **One document, multiple lenses.** Outline, reader, and page views are views over the same model. None owns a private copy of the structure.
2. **One home, many references.** Every non-root block has exactly one primary parent that determines its outline position and layout home. Extra parents are reference branches, not a second layout authority.
3. **Anchors are first-class.** A branch can point at a span, not only at a whole block. Anchors must survive normal editing or fail visibly with a repair path.
4. **Authoring is keyboard-first; reading is adaptive.** The outline must be fast enough to replace a hand-written outline. The reader/page views must be readable without becoming a drawing tool.
5. **Fixed logical order, adaptive geometry.** Only sibling order changes. Widths are content-driven; a node with a large subtree can take more horizontal space, while a leaf sibling can be narrow. If there is not enough horizontal room, a child wraps below the parent level with a slight indent. There are no fixed depth columns, pins, free drag, or arbitrary coordinates.
6. **Pages are derived.** A4 portrait or landscape with margins. A paginator computes page breaks from the continuous layout; pages are not stored containers. Break between blocks first; a long block may continue at safe internal boundaries (paragraph or list item) with a continuation marker. Never cut a line, image, formula, or code line.
7. **Never silently lose work.** A broken anchor, a pagination defect, a missing asset, or a failed save must be surfaced, not swallowed.
8. **Real text, page PDF.** PDF export uses the same paginator and reproduces the pages with a selectable text layer, not a screenshot and not a separate linear reader PDF in v1.
9. **Local-first and portable.** The canonical document is a local, documented, versioned package. Export must not be the only way to recover the content.

### 1.5 Goals for v1

- **G1.** Create and edit content blocks with rich text, lists, code, inline and display math, and images.
- **G2.** Create branches from a whole block or from an anchor inside it.
- **G3.** Support text, formula, code, and image anchors with a visible broken-anchor and repair path.
- **G4.** Provide an outline, a continuous reader view, and a paginated page view over the same document, with synchronized content, selection, page-break markers, collapse state, and undo.
- **G5.** Enforce one primary incoming branch per block, a primary forest that is acyclic, and reference branches that may form cycles.
- **G6.** Lay out each chapter with an adaptive tree: top-level blocks stack vertically, children go right or wrap below the parent with a slight indent, anchored branches sit below their anchors, and no blocks overlap. Only sibling order changes.
- **G7.** Save and load a versioned document package atomically, with backups and crash recovery.
- **G8.** Export the paginator's A4 pages as a real-text PDF in portrait or landscape, with safe block continuations, no cut lines/images/code lines, and continuation/ghost-parent markers.
- **G9.** Remain responsive at 300 blocks and usable at 1,000 blocks with layout virtualization, collapse, and level-of-detail strategies; no 60 fps claim at 1,000 unless measured.
- **G10.** Provide multiple documents in a user-chosen folder, document/library search, and a clean minimal UI with dark mode as the default.
- **G11.** Provide a local-only **External Agent API** backed by the typed command API: token auth, read/write scopes, audit logging, undo/redo, dry-run proposals, and PDF export. No in-app chat panel in v1.

### 1.6 Non-goals for v1

- **N1.** A general whiteboard with freehand drawing, shapes, templates, and connectors between arbitrary shapes.
- **N2.** A full PKM system with typed objects, supertags, queries, databases, or a global graph view.
- **N3.** Real-time collaboration, multi-device sync, CRDTs, or user accounts.
- **N4.** An iPad app, Apple Pencil handwriting, or ink annotations. The model must not block them, but v1 does not build them.
- **N5.** A study/annotation layer (highlights, ink, notes, frames, arrows drawn on the page). The schema reserves room; the UI does not implement it.
- **N6.** Block references, transclusion, or aliases that render a second editable copy of a block.
- **N7.** Markdown as a live, externally editable vault with full round-trip fidelity; Markdown is import/export.
- **N8.** Web, Windows, or Linux clients.
- **N9.** AI features that run without the user; background summarization, autonomous editing, or proactive suggestions.
- **N10.** A plugin system, scripting, or embedded HTML/JavaScript in notes.
- **N11.** An infinite canvas, free positioning, manual pins, fixed pixel columns, or arbitrary drag-to-place layout.
- **N12.** A separate linear reader PDF, a spatial map export, or a page-container document format in v1. The reader view is an editor view, not an export; pages are derived.
- **N13.** An in-app agent panel/chat in v1. Agents interact through the local External Agent API instead.
- **N14.** Storing user note documents in git. Git is for code and project docs only; notes are standard files in a user-chosen folder.
- **N15.** Agent background autonomy, web access from the app, shell/filesystem access, or auto-apply of destructive changes in v1.

### 1.7 Success criteria for the prototype

- **S1.** A user can build a 100-block study document across pages in one session without a structural bug, a lost branch, or an ambiguous undo.
- **S2.** Text anchors survive ordinary edits before, inside, and after the anchored span; destructive edits produce a visible broken-anchor state, never a silent deletion.
- **S3.** A paginated PDF exported from a 300-block document opens correctly in a standard PDF viewer, has selectable body text, matches the paginator's page order and orientation, and never cuts a line, image, formula, or code line; long blocks continue at safe boundaries with markers.
- **S4.** The reader and page views render and navigate 300 blocks smoothly on the reference Mac; 1,000 blocks is usable with layout virtualization, focus/collapse, and LOD. No 60 fps claim is made for 1,000 blocks.
- **S5.** Crash, malformed-file, missing-asset, page-break, and continuation tests do not destroy the last good document and never silently clip content.

### 1.8 Assumptions

| ID | Assumption | Consequence if wrong |
|---|---|---|
| **A1** | Single user, local document, no collaboration in v1. | Undo, persistence, and conflict handling need a larger design. |
| **A2** | Mac first; iPad and Pencil are a later phase. | The model must stay platform-neutral; no DOM-specific anchor geometry. |
| **A3** | Multiple documents live in a user-chosen folder; one document package per window, with a recent/library list. | Persistence and window management need a library model. |
| **A4** | Reading direction is left-to-right; the continuous layout grows right and down from the chapter's top-left origin. | RTL and vertical layouts need a separate layout mode. |
| **A5** | Typical documents have 50–300 blocks and roughly 1–50 derived pages; the supported ceiling is about 1,000 blocks. | Performance strategy and validation limits change. |
| **A6** | PDF pages are A4 portrait or landscape, produced by the paginator; no separate reader PDF in v1. | PDF layout and page-navigation design change. |
| **A7** | Annotations are a separate study layer, out of scope for v1. | The schema and export need a full annotation design. |
| **A8** | Canonical content is structured JSON/ProseMirror JSON with Markdown import/export (decided in AGENTS.md). | Anchor binding and Markdown export behavior change. |
| **A9** | The v1 stack is **decided**: Electron + React + TypeScript with TipTap/ProseMirror, CodeMirror 6, KaTeX, React Flow, and Electron `printToPDF` (ADR-0001, ADR-0002). | A stack change requires a benchmark-backed ADR; the spec remains platform-neutral where possible. |
| **A10** | UI copy is English; content is Unicode. | Localization and font coverage need explicit work. |
| **A11** | Block widths are content-driven and adaptive within a page width; there is no manual resize, pin, fixed pixel column, or free position. | A resize/free-layout model would be needed. |
| **A12** | The local document is the source of truth; exports are derived. | A sync or cloud-first model changes persistence and conflict rules. |
| **A13** | Pages are derived by the paginator; optional manual page-break hints are document settings. There is no stored page container in v1. | A page-container/auto-layout model needs a different schema. |
| **A14** | A document may contain multiple chapters; the v1 UI MAY expose one chapter at a time. | Chapter navigation and multi-chapter editing need a UI design. |
| **A15** | Reader view and page view share one layout engine and differ only in rendering/pagination chrome. | Two layout engines would risk divergence and duplicate bugs. |
| **A16** | The reader is the primary authoring surface in v1; the page view is a preview of the same layout and paginator. The choice is closed (D14). | UX and keyboard design would need a revision if page view becomes primary. |
| **A17** | Note documents are standard files in a user-chosen folder; git is used only for code and project docs. | Note versioning/sync needs a different design. |
| **A18** | Visual direction is clean, Obsidian-like, minimal, with dark mode as the default and a light theme available. | Visual design and theme tokens need revision. |
| **A19** | The app exposes a local-only External Agent API; there is no in-app agent panel or background autonomy in v1. | API, auth, and UI scope change. |
| **A20** | Long blocks may continue at safe internal boundaries; page breaks never cut a line, image, formula, code line, or table row. A table row is atomic. | Pagination and block-continuation markers need a different model. |

### 1.9 Adaptive layout and derived pages at a glance

- A **document** contains one or more **chapters**. A chapter contains an ordered list of **top-level content blocks**; every top-level block is itself a content block, sometimes a standalone sentence, sometimes a 1–2 word phrase with children.
- Chapters group only top-level blocks. **Pages are not a structural level.** The paginator derives A4 pages from the continuous layout, constrained by page size, orientation, and margins.
- The logical order is fixed. Only sibling order changes. Geometry is adaptive: widths are content-driven, siblings can have different widths, and a node with a large subtree may take more horizontal space.
- Children go right when there is enough horizontal room. If not, a child wraps below the parent level with a slight indent. There is no fixed pixel column per depth.
- Example (logical order):

  ```text
  CHAPTER
  top1 -> lower1.1 -> lower1.1.1
                    -> lower1.1.2
         -> lower1.2

  top2 -> lower2.1
  ```

- **Anchored branches** remain: the child is placed below its anchor and may wrap or continue on the next page at safe boundaries. It is never cut through a line, image, formula, code line, or table row.
- **Pages** are continuous in reading order but still pages. The paginator prefers breaks between blocks; a long block may continue at a safe internal boundary with a continuation marker.
- **Views:** a **reader view** (continuous vertical scroll with page-break markers) is the primary authoring surface in v1; a **page view** (paginated WYSIWYG) renders the same layout as a preview. The outline is the same tree in list form. "Canvas" means the page/paginated view, not a freeform canvas.
- **PDF export** uses the same paginator, with real text, A4 portrait/landscape, and no separate reader PDF in v1.

### 1.10 V1 scope and vertical slices

V1 includes all core features discussed, delivered in end-to-end vertical slices:

- **Slice 0 — Foundation:** document/chapter/block model, structured content, typed command API, persistence, undo/redo, tests.
- **Slice 1 — Authoring:** outline, editor, text/formula/image anchors, branches, shared children, search.
- **Slice 2 — Layout:** adaptive tree, paginator, reader view, page preview, page-break hints, freeze/full-reflow modes.
- **Slice 3 — Export:** Page PDF with real text, continuation markers, text-layer verification.
- **Slice 4 — Library and visual:** multiple documents, document/library search, dark mode default, minimal Obsidian-like UI.
- **Slice 5 — External Agent API:** typed command API exposure, local HTTP JSON + MCP adapter, token auth/read-write scopes, audit log, dry-run/proposals, undo/redo, tests. No in-app chat panel.

Each slice ends with automated tests and a manual/visual check. No core feature is cut from v1; a slice may be descoped only with explicit product-owner approval. The sequence is a delivery order, not a permission to ship a half-feature. The in-app agent panel/chat is parked; external agents use the API instead.


---

## 2. Glossary

| Term | Definition |
|---|---|
| **Block** | The unit of identity, content, branching, and layout. A block has a stable ID and a rich-text body. |
| **Content block** | Same as block; used when the content aspect matters. |
| **Anchor** | A stable selector for a span, term, token, line, point, or region inside one block. |
| **Anchor mark** | The inline binding of an anchor inside the content representation. It carries the anchor ID so the anchor moves with the text. |
| **Branch** | A directed edge from a source block or anchor to a target block. |
| **Primary branch** | The single structural incoming branch of a non-root block. It determines the block's home and outline position. |
| **Reference branch** | A non-structural branch used for cross-links, shared children, and "see also" relationships. It may form cycles. |
| **Source** | The from-side of a branch: a whole block or an anchor in a block. |
| **Target** | The to-side of a branch: the block being pointed at. |
| **Parent / child** | If a branch goes from A to B, A is the parent (source) and B is the child (target). |
| **Root** | A block with no incoming primary branch. A root is a top-level block in a chapter. |
| **Top-level block** | A root content block listed directly in a chapter. It may be a sentence or a short phrase with children. |
| **Primary forest** | The set of primary trees rooted at the chapter's top-level blocks. |
| **Home** | The position of a block in the primary forest, determined by its primary parent. |
| **Chapter** | A group of ordered top-level blocks. A document has one or more chapters. |
| **Page** | An A4 portrait or landscape frame produced by the paginator. Pages are derived, not stored. |
| **Page break** | A boundary between two derived pages, computed by the paginator or requested by an optional manual hint. |
| **Continuation** | A block or lower-level block that continues on the next page because it crossed a page boundary. It is marked on both pages and is never a second copy. |
| **Ghost parent** | A compact, non-editable repeat of the parent context at the top of the next page when a lower-level block continues, so the reader knows where the continuation belongs. |
| **Block continuation** | A single block whose content is split by the paginator at a safe internal boundary (paragraph or list item), with continuation markers. It is one block, not two. |
| **Adaptive layout** | A continuous tree layout with content-driven widths. Children go right when there is room, otherwise below the parent with a slight indent. |
| **Pagination** | The process that slices the continuous layout into A4 pages without cutting a line, image, formula, or code line. |
| **Incremental reflow** | Default layout mode: only the dirty subtree and affected siblings are recomputed; existing positions stay stable. |
| **Freeze mode** | A read-only study mode that freezes the layout and pagination snapshot; no automatic reflow while reading. |
| **Full reflow** | A request or idle-triggered recomputation of the entire layout and pagination; page breaks may change. |
| **Reader view** | A continuous vertical rendering of the layout with page-break markers. |
| **Page view** | A paginated WYSIWYG rendering of the same layout. |
| **Shared child** | A block with one primary parent and zero or more reference parents. It appears once; it is referenced from multiple places. |
| **Outline order** | The depth-first order produced by traversing chapters, top-level blocks, and ordered children. It is the canonical reading order. |
| **Callout** | The reader/page rendering of an anchored branch, placed below its anchor and connected to it. |
| **Collapse** | A view state that hides a block's descendants without deleting them. |
| **Document package** | The folder or bundle containing `document.json`, assets, and metadata. |
| **Asset** | An image or other binary file referenced by content, stored by content hash inside the package. |
| **View state** | Non-canonical UI state: last mode, current page, zoom, selection, collapsed blocks. It may be discarded without losing document content. |
| **Study layer** | The future annotation layer (highlights, ink, notes). It is separate from content and is not implemented in v1. |
| **Broken anchor** | An anchor whose binding can no longer be resolved to a span in its block. The branch is preserved and surfaced for repair. |
| **Alias / transclusion** | A second read-only rendering of a block's content in another place. Out of scope for v1. |
| **Fractional order** | A lexicographically sortable string used to order siblings without renumbering the whole list. |
| **Schema version** | An integer identifying the document format, used to run forward migrations. |
| **Page PDF** | A PDF that reproduces the paginator's pages with a selectable text layer. |
| **Pagination defect** | A block or subtree that cannot satisfy the page width/height or a manual break hint under the current pagination. The app warns; it never clips, auto-scales, or cuts a line/image/formula/code line. |

---

## 3. Core use cases and user stories

### US-01 — Capture a topic and expand it

As a student, I create a top-level block for a lecture topic and add children to the right as I would on paper.

**Done when:** I can create a top-level block, add children, type rich content, and see the structure in outline, reader, and page views without choosing a free layout.

### US-02 — Branch from a word or phrase

As a student, I select a word or phrase inside a block and create a branch from it. The new block is attached to that exact span, not to the whole block.

**Done when:** the anchor is visible in the source text, the new block becomes the anchor's primary child, and editing the surrounding text does not detach it.

### US-03 — Branch from a formula term

As a student, I select a term in a formula and branch to an explanation of that term.

**Done when:** the formula is recorded as the anchor's context, the term is stored as the quote, the branch is visually associated with the formula, and an invalid formula does not destroy the note.

### US-04 — Branch from code

As a student, I select a token or line range in a code block and branch to an explanation or example.

**Done when:** the code range is highlighted, edits outside the range preserve the anchor, and edits that remove the quoted code produce a visible broken-anchor state.

### US-05 — Branch from an image region

As a student, I draw a region or place a point on an image and branch to an explanation.

**Done when:** the region is stored relative to the image's intrinsic size, the branch survives display resizing, and replacing the image invalidates the anchor visibly.

### US-06 — Share a child between two topics

As a student, I want the same definition to appear under two topics without duplicating the block.

**Done when:** the block has one primary home and one or more reference parents; it appears once in the outline and once in the continuous layout; the second parent shows a "see also" link and a reference arrow.

### US-07 — Review in the outline

As a student, I switch to the outline to read the argument linearly, collapse subtrees, and edit quickly with the keyboard.

**Done when:** the outline follows the same primary structure as the reader/page views, derived page breaks are visible, anchored branches appear as clearly marked callouts, and reference links are available without duplicating content.

### US-08 — Study in the reader and page views

As a student, I switch to the reader view for a continuous scroll with page-break markers, or to the page view for a paginated WYSIWYG page.

**Done when:** top-level blocks stack vertically, direct children go right or wrap below with a slight indent, anchored children sit below their anchors, reference edges are visually distinct, page navigation changes only the viewed page, and no drag can move a block to an arbitrary position or pin it.

### US-09 — Reorganize without losing children

As a student, I move a block to a new parent, reorder siblings, or make a referenced block's other parent its home.

**Done when:** the block's subtree, anchors, and outgoing branches move with it; the old parent loses the primary edge; the derived pagination updates; undo restores the previous structure.

### US-10 — Recover a broken anchor

As a student, I delete text that contained an anchor. The branch remains, marked as broken, and I can relink it to a new selection.

**Done when:** the branch and its target content are still present, the broken state is visible in the block and in the anchor health panel, and repair keeps the anchor and branch IDs.

### US-11 — Export a page PDF

As a student, I export the paginator's pages as an A4 PDF with real text, then annotate it by hand on my iPad.

**Done when:** each derived page maps to one PDF page in the same portrait/landscape orientation, every block appears exactly once, no line/image/formula/code line is cut, long blocks continue at safe boundaries with markers, anchored branches are below their anchors or marked as continuations, formulas and code are readable, and body text can be selected and searched.

### US-12 — Recover from a crash

As a student, the app crashes while I am editing. When I reopen the document, I can recover the last autosave or backup.

**Done when:** the app offers a recovery path, the last good document is intact, and no partial file overwrites it.

### US-13 — Find a block

As a student, I search for a term and jump to the block that contains it, even if it is on another derived page or inside a collapsed subtree.

**Done when:** search finds text, code, LaTeX source, and labels; selecting a result reveals the block in all views; the chapter, page, and path are visible.

### US-14 — Review page breaks

As a student, I read the continuous layout in the reader view and see where the paginator will break pages. I add a manual break hint when a break lands badly.

**Done when:** page-break markers are visible in the reader, the page view and PDF use the same breaks, I can request a break before a block, and no line/image/formula/code line is cut; long blocks continue at safe boundaries with markers.

### US-15 — Work across multiple documents

As a student, I keep several note documents in a folder I choose, switch between them from a recent/library list, and search across them.

**Done when:** multiple documents open independently, each is a single JSON file plus assets, and search results show the document, chapter, and page path.

### US-16 — Use an external agent

As a power user, I enable the local External Agent API and let an external tool read the current document, propose or apply edits, and export a PDF within token scopes.

**Done when:** the API is off by default, requires a token, logs every call, supports read/write scopes and destructive confirmation, and shares undo/redo with the UI.

---

## 4. Conceptual data model

### 4.1 Overview

The document is a set of chapters, blocks, anchors, branches, and assets. Branches are first-class records. The primary branches form a forest; reference branches form a general directed graph on top of it. Pages are derived by the paginator and are not stored entities.

| Entity | Cardinality and purpose |
|---|---|
| **Document** | Owns page setup, chapters, blocks, anchors, branches, assets, and reserved annotations. |
| **Chapter** | An ordered group of top-level blocks. A document has one or more chapters. |
| **ContentBlock** | Has zero or more anchors; has zero or one incoming primary branch; has zero or more incoming reference branches; has zero or more outgoing branches. |
| **Anchor** | Belongs to exactly one block and is the source of zero or more branches. |
| **Branch** | Has exactly one source (block or anchor), exactly one target block, and a role of primary or reference. |
| **Asset** | Referenced by image content; stored once per content hash. |
| **Derived page** | A paginator output. Not stored; computed from the continuous layout and page setup. |

The model has two layers:

- **Document semantics:** page setup, optional page-break hints, chapters, top-level block order, blocks, anchors, branches, assets, schema version. This is canonical and must survive save/load.
- **View state:** mode, current page, zoom, selection, collapsed blocks, outline scroll. This is non-canonical and may be discarded.

### 4.2 Document

| Field | Type | Required | Meaning |
|---|---|---|---|
| `schemaVersion` | integer | yes | Document format version. Starts at 1. |
| `id` | string | yes | Stable document ID. |
| `title` | string | yes | User-visible title. May be empty; display as "Untitled". |
| `createdAt` | timestamp | yes | ISO 8601 UTC. |
| `updatedAt` | timestamp | yes | ISO 8601 UTC; updated on save. |
| `revision` | integer | yes | Monotonic document revision, starts at 0 and increments once per committed transaction. Used by `baseRevision` for optimistic concurrency; not content. |
| `pageSetup` | object | yes | A4 page size, orientation, and margins. |
| `manualBreakBeforeBlockIds` | ordered list of block IDs | no | Optional page-break hints. The paginator starts a new page before these blocks when possible. |
| `chapters` | ordered list of Chapter | yes | Every chapter, in reading order. |
| `blocks` | map: block ID → ContentBlock | yes | All blocks, keyed by ID. |
| `anchors` | map: anchor ID → Anchor | yes | All anchors, keyed by ID. |
| `branches` | map: branch ID → Branch | yes | All branches, keyed by ID. |
| `viewState` | object | no | Non-canonical UI state. May be missing or stale. |
| `assets` | map: asset ID → Asset | yes | Content-addressed assets referenced by content. May be empty. |
| `annotations` | collection | yes | Reserved for the future study layer; empty in v1. |
| `extensions` | object | no | Unknown fields preserved for forward compatibility. |

**Page setup.** `pageSetup` has `size` fixed to `"A4"` in v1, `orientation` (`"portrait"` or `"landscape"`), and `margins` in millimetres (`top`, `right`, `bottom`, `left`). The default is A4 portrait with 20 mm margins on all sides. Page size, orientation, and margins are document settings; pages themselves are derived.

**Chapter.** A chapter has `id`, optional `title`, and an ordered `topLevelBlockIds` list. Each listed block is a root content block and starts a top-level tree. A chapter MAY have multiple top-level blocks. Every block belongs to the chapter of its top-level ancestor; a block cannot appear in two chapters. The model supports multiple chapters; the v1 UI MAY expose one chapter at a time (A14).

**Pages are not stored.** There is no `pages` array and no page entry in the canonical document. The paginator computes page breaks from the continuous layout, the page setup, and optional manual break hints. A continuation marker is derived; it is not a second block or a page assignment.

The document MUST NOT contain a second canonical copy of block content, branch structure, chapter order, or page layout outside these fields.

### 4.3 ContentBlock

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Stable block ID. Opaque; never reused. |
| `label` | string | no | Optional short label for the outline, page card header, and PDF. If absent, derive from the first text line or content type. |
| `content` | structured rich-text body | yes | The block's content in the canonical structured JSON representation. May be empty. |
| `border` | `"none" \| "subtle" \| "strong"` | no | Optional visual border. Absence means the document default. |
| `createdAt` | timestamp | no | Optional; useful for diagnostics and future sync. |
| `updatedAt` | timestamp | no | Optional; useful for diagnostics and future sync. |
| `extensions` | object | no | Unknown fields preserved. |

A block is the unit of identity, branching, and layout. Its body MAY contain multiple paragraphs, headings, lists, code blocks, display math, images, and tables. The content tree determines how it renders; there is no exclusive block "type" enum. A code-only, formula-only, or image-only block is simply a block whose body contains that node kind. This is the decided granularity (D2, closed): a rich body, not a single content node. Single-node blocks are not the v1 model.

Content MUST be able to carry inline anchor marks (or the equivalent binding under the chosen content representation). An anchor mark is part of the block's content, not a decoration stored only in the UI.

### 4.4 Anchor

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Stable anchor ID. Also the ID carried by the inline mark or node binding. |
| `blockId` | string | yes | The block that contains the anchor. Exactly one. |
| `kind` | `"text" \| "formula" \| "code" \| "image"` | yes | Anchor kind. Determines the selector. |
| `selector` | object | yes | Kind-specific selector, described below. |
| `quote` | string | conditional | The exact selected text, LaTeX substring, code text, or image region label. Required for text, formula, and code; optional for image. |
| `prefix` | string | no | Context before the selection. Used for fallback resolution. |
| `suffix` | string | no | Context after the selection. Used for fallback resolution. |
| `occurrenceHint` | integer | no | 1-based occurrence hint when the quote appears multiple times. |
| `lastKnown` | object | no | Last resolved position or geometry. A repair hint, never the source of truth. |
| `createdAt` | timestamp | no | Optional. |
| `extensions` | object | no | Unknown fields preserved. |

**Anchor kinds and selectors**

| Kind | Primary binding | Fallback selector | Geometry |
|---|---|---|---|
| **Text** | Inline mark with `anchorId` in the content tree. | `quote` + `prefix` + `suffix` + `occurrenceHint`. | Union rectangle of the marked range; attach at the right edge of the last line. |
| **Formula** | Formula node ID for a whole formula; for a term, a LaTeX substring selector. | `latex` + `occurrenceHint` + optional LaTeX prefix/suffix. | The formula node's rectangle for a whole formula; best-effort term rectangle; otherwise the formula rectangle with the term shown in the marker. |
| **Code** | Code node ID plus offsets. | `quote` + `prefix` + `suffix` + `occurrenceHint`; offsets are a hint. | Rectangle of the token or line range; otherwise the code block. |
| **Image** | Image node ID plus asset ID and normalized rectangle. | `assetId` + `rect` normalized to the image's intrinsic size. | The normalized region scaled to the displayed image; point anchors use a zero-size region with a visible marker. |

Offsets in code anchors MUST be defined in a platform-neutral unit (Unicode code points), not in a platform's native string index. Offsets are a hint; the quote and context are the durable fallback. Image rectangles MUST be normalized to 0–1 relative to the image's intrinsic dimensions, never stored in display pixels.

Anchor IDs are immutable identities. Repairing an anchor changes its selector and binding, not its ID. An anchor MUST NOT span more than one block in v1; a selection that crosses blocks is rejected with a clear message.

### 4.5 Branch

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Stable branch ID. |
| `source` | object | yes | `{ blockId }` for a block source, or `{ blockId, anchorId }` for an anchored source. |
| `targetBlockId` | string | yes | The target block. |
| `role` | `"primary" \| "reference"` | yes | Structural or cross-link. |
| `order` | string | yes | Fractional order string, unique within the source port and role. |
| `label` | string | no | Optional short edge label, shown on the page and in see-also lists. |
| `createdAt` | timestamp | no | Optional. |
| `extensions` | object | no | Unknown fields preserved. |

**Branch rules**

- A branch is an assertion or relationship, not a content embed. Transclusion is out of scope (N6).
- A **primary** branch is structural. A non-root block MUST have exactly one incoming primary branch. The primary subgraph MUST be acyclic.
- A **reference** branch is associative. A block MAY have zero or more incoming reference branches. Reference branches MAY form cycles.
- A branch MUST NOT target its own source block.
- A branch MUST NOT duplicate another branch with the same exact source and target. Different anchors in the same block are different sources and may target the same block.
- A branch whose source is an anchor MUST reference an anchor that belongs to the source block.
- A source **port** is either the block itself or a specific anchor. Each port has its own ordered list of outgoing branches. `order` is unique within `(port, role)`; primary order drives layout and outline, reference order drives see-also lists. Primary and reference orders do not collide.
- A branch target MUST exist. A branch pointing at a missing block is a load error, not a silently ignored edge.
- Deleting a primary branch makes the target a root; it does not delete the target or its subtree.
- Reference branches MUST NOT affect outline order, adaptive layout, or pagination.

### 4.6 Primary forest, chapter assignment, and outline order

The primary branches form a forest:

- Every block is either a **root** (no incoming primary branch) or has exactly one primary parent.
- The primary forest MUST be acyclic. Attempting to create a primary cycle is rejected before any mutation.
- Reference branches are ignored by the forest traversal.

**Chapter assignment invariants:**

- Every root MUST appear exactly once in exactly one chapter's `topLevelBlockIds`.
- Every non-root block belongs to the chapter of its top-level ancestor.
- A block MUST NOT appear in two chapters.
- Chapters are ordered; top-level block IDs within a chapter are ordered. These orders define reading order.
- There is no page assignment in the document; page breaks are derived.

**Outline order.** The outline is a depth-first traversal of the primary forest, grouped by chapter:

1. Start a chapter.
2. Emit its top-level blocks in `topLevelBlockIds` order.
3. For each top-level block, emit the block.
4. Emit its anchored primary children, ordered by the anchor's position in the block content (start position, then anchor ID), and within one anchor by branch order.
5. Emit its direct primary children, ordered by branch order.
6. Do not recurse through reference branches.
7. Insert a page-break marker wherever the paginator places one; the marker is derived, not a structural node.

Anchored-first is **closed (D3)**. It keeps a branch caused by a word close to the block that contains the word. The rule is deterministic and shared by outline, reader view, page view, and PDF; it is not re-evaluated per view.

**Page and block labels.** Derived pages are numbered in reading order (`1`, `2`, …). Blocks receive an optional hierarchical label derived from top-level order and depth (`1`, `1.1`, `1.1.1`) for navigation and diagnostics. Labels are generated, not stored. They are not a substitute for derived page numbers in the PDF.

**Shared children.** A shared child appears once in the outline and once in the continuous layout. Reference contexts show a "See also" link with the derived page when available; they do not repeat the content and do not add a second outline entry.

**Default (closed, D4).** Creating a branch to a block that already has a primary home creates a **reference edge** by default. A top-level block has no primary parent, so branching to it adds it as a **primary child** (it loses its top-level slot) unless the user explicitly chooses "reference only." "Make home" and "move here" are explicit commands; they change the primary parent without duplicating the block. The confirmation shows the affected reference parents.

### 4.7 Page setup, derived pages, and view state

**Page setup.**

- Page size is A4: 210 × 297 mm portrait, 297 × 210 mm landscape.
- `pageSetup.orientation` is document-wide in v1: portrait or landscape. Mixed orientation is not supported in v1.
- Margins come from `pageSetup`; default 20 mm on all sides. The content area is the page minus margins.
- Page size, orientation, margins, and optional `manualBreakBeforeBlockIds` are document settings.
- Pages are not stored. The paginator produces page breaks from the continuous layout and page setup.

**Derived pages and continuation.**

- A derived page is a slice of the continuous layout. It is numbered in reading order.
- The paginator prefers page breaks between blocks. If a block is too tall for the remaining space, it may continue at a safe internal boundary: paragraph, list item, blockquote paragraph, between code lines, or **between table rows**. It MUST NOT cut a text line, image, formula, code line, or table row.
- A block that continues across pages is a **block continuation**: the previous page shows "continues on page N", the next page shows "continued from page M" plus a compact ghost parent, and the block exists once. Safe boundaries are paragraph, list item, blockquote paragraph, between code lines, or between table rows; a line, image, formula, code line, or table row is never cut.
- A table row is atomic. A table may continue across pages only **between rows**, never inside a row or cell. A single row taller than the page content height is a pagination defect; the user splits the row content or changes page setup. Repeating a header row on continuation pages is a UX detail, not required in v1.
- A lower-level block that continues on the next page also shows a ghost parent at the top of the next page so its context is not lost.
- A block with no children may still be followed by a page break; the paginator prefers breaks between top-level blocks or between sibling subtrees.
- Manual break hints are best-effort requests to start a new page before a block. They are not page containers and do not move blocks to a fixed page.
- Changing page orientation re-runs layout and pagination. It may change page count; it never changes the logical tree or sibling order.

**View state** includes at least:

- last mode (`outline`, `reader`, or `page`);
- current derived page (for page view);
- reader scroll position and page zoom;
- outline scroll position;
- focused block ID;
- collapsed block IDs;
- optional multi-selection on the page (for reorder commands only).

View state is non-canonical. Stale references to deleted blocks/pages are dropped on load. Collapse is view state, not document semantics: collapsing a block hides descendants without changing the primary forest, and the same collapse state is shared by all views.

### 4.8 Assets

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Content-addressed ID (for example, a SHA-256 hash). |
| `path` | string | yes | Relative path inside the package, never absolute. |
| `mime` | string | yes | Media type. |
| `bytes` | integer | no | File size. |
| `width` | integer | no | Intrinsic width for images. |
| `height` | integer | no | Intrinsic height for images. |
| `alt` | string | no | Alt text. |
| `originalName` | string | no | Original filename, metadata only. |
| `extensions` | object | no | Unknown fields preserved. |

Assets are content-addressed and deduplicated. Identical bytes share one asset. Assets MUST be copied into the package on import; the document MUST NOT depend on the original file's path. Remote URLs are not canonical. Missing assets are a visible load warning and a placeholder, not a reason to delete content or anchors.

### 4.9 Annotations (future)

The top-level `annotations` collection is reserved. It is empty in v1, and the UI does not expose it. The intended shape, to keep the model extensible:

- stable annotation ID;
- type: highlight, ink, note, arrow, or frame;
- target: block, anchor, image region, or study-page region;
- geometry and style in a platform-neutral form;
- author and timestamps (for future multi-user or multi-device use);
- layer or visibility flag;
- optional opaque platform payload plus a rendered fallback.

Annotations MUST NOT alter block content, branches, or layout. They are a separate study layer and will be toggleable in the UI and in PDF export. The loader MUST preserve unknown annotation data even if the v1 UI ignores it. Ink is not designed in v1; the model only reserves room.

### 4.10 Invariants

| ID | Invariant | On load violation |
|---|---|---|
| **I1** | IDs of blocks, anchors, and branches are globally unique within the document. | Fatal recovery; do not overwrite. |
| **I2** | Every branch source and target exists; every anchored source belongs to its source block. | Fatal recovery or quarantine of the branch; never silent drop. |
| **I3** | A block has at most one incoming primary branch. | Fatal recovery; user chooses the primary. |
| **I4** | The primary subgraph is acyclic. | Fatal recovery; user breaks the cycle explicitly. |
| **I5** | Every block is a root or has exactly one primary parent. | Fatal recovery; unreachable blocks are listed. |
| **I6** | Every root appears exactly once in exactly one chapter's top-level list; every block belongs to the chapter of its top-level ancestor and appears in only one chapter. | Fatal recovery; list the offending blocks/chapters. |
| **I7** | Branch order is unique within a source port and role; top-level block order is unique within a chapter; manual break hints reference existing blocks and are unique. | Warning; tie-break by ID; normalize on save. |
| **I8** | No self-branch; no duplicate exact source-target branch. | Reject on creation; on load, drop the duplicate with a warning. |
| **I9** | Every anchor belongs to an existing block and its kind matches its selector. | Broken anchor or fatal recovery; branch preserved. |
| **I10** | A text anchor mark ID appears at most once in the document content. | Broken anchor; repair required. |
| **I11** | Asset paths are relative and point inside the package, or the asset is marked missing. | Warning; placeholder. |
| **I12** | Removing all reference branches leaves a valid primary forest. | Should be true by construction; validate. |
| **I13** | Page setup has A4 size, a valid orientation, and finite non-negative margins that leave a positive content area. | Fatal recovery or safe default repair with confirmation. |
| **I14** | No block stores an x/y position, page container, pin, or free-layout override. | Ignore unknown layout fields with a warning; do not resurrect free positioning. |
| **I15** | View state may be stale; stale references are harmless. | Drop stale entries silently. |
| **I16** | Unknown fields and unknown content nodes are preserved on save. | Warning; preserve. |
| **I17** | `schemaVersion` is an integer and never decreases. | Newer file opens read-only; no downgrade. |
| **I18** | Pagination breaks between blocks first and may continue a block only at a safe internal boundary; it never cuts a line, image, formula, code line, or table row. A table row is atomic. A continuation/ghost parent is derived, not stored as a second block. | Fatal pagination defect; fix before export. |

### 4.11 Illustrative schema

This example is illustrative, not a wire-format freeze. It uses the approved structured JSON content model. Field names may change before the schema is frozen. Content is abbreviated.

```json
{
  "schemaVersion": 1,
  "id": "0192f0c4-7a1e-7c3b-9d2a-1f6b8c9d0e11",
  "title": "Linear algebra — eigenvalues",
  "createdAt": "2026-11-03T10:00:00Z",
  "updatedAt": "2026-11-03T10:04:12Z",
  "revision": 42,
  "pageSetup": {
    "size": "A4",
    "orientation": "portrait",
    "margins": { "top": 20, "right": 20, "bottom": 20, "left": 20 }
  },
  "manualBreakBeforeBlockIds": ["b4"],
  "blocks": {
    "b1": {
      "id": "b1",
      "label": "Eigenvalues",
      "content": {
        "type": "doc",
        "children": [
          {
            "type": "paragraph",
            "children": [
              { "type": "text", "text": "An " },
              {
                "type": "text",
                "text": "eigenvalue",
                "marks": [{ "type": "anchor", "anchorId": "a1" }]
              },
              { "type": "text", "text": " is a scalar λ such that Av = λv." }
            ]
          }
        ]
      },
      "border": "subtle"
    },
    {
      "id": "b2",
      "label": "Eigenvector",
      "content": { "type": "doc", "children": [] }
    },
    {
      "id": "b3",
      "label": "Eigenvalue equation",
      "content": { "type": "doc", "children": [] }
    },
    {
      "id": "b4",
      "label": "Cayley–Hamilton",
      "content": { "type": "doc", "children": [] }
    }
  },
  "anchors": {
    "a1": {
      "id": "a1",
      "blockId": "b1",
      "kind": "text",
      "quote": "eigenvalue",
      "prefix": "An ",
      "suffix": " is",
      "occurrenceHint": 1
    }
  },
  "branches": {
    "e1": {
      "id": "e1",
      "source": { "blockId": "b1" },
      "targetBlockId": "b2",
      "role": "primary",
      "order": "a1"
    },
    "e2": {
      "id": "e2",
      "source": { "blockId": "b1", "anchorId": "a1" },
      "targetBlockId": "b3",
      "role": "primary",
      "order": "a1"
    },
    "e3": {
      "id": "e3",
      "source": { "blockId": "b4" },
      "targetBlockId": "b3",
      "role": "reference",
      "order": "a1",
      "label": "also uses"
    }
  },
  "chapters": [
    {
      "id": "ch1",
      "title": "Eigenvalues",
      "topLevelBlockIds": ["b1", "b4"]
    }
  ],
  "viewState": {
    "mode": "reader",
    "currentChapterId": "ch1",
    "currentPage": 1,
    "zoom": 1,
    "collapsed": []
  },
  "assets": {},
  "annotations": []
}
```

### 4.12 Shared-child validation

The product requires DAG semantics: a block can have more than one parent. The model resolves this with one primary home and zero or more reference parents.

**Scenario.** Block `b3` ("Eigenvalue equation") is the target of a primary branch from `b1` and a reference branch from `b4` ("Cayley–Hamilton").

**Required behavior:**

- `b3` exists once. There is one block, one content body, one set of anchors, and one subtree.
- `b3` appears once in the outline, under `b1`, at the position determined by the anchored branch from `b1`.
- `b4` shows a "See also" link to `b3` with its derived page when available; it does not repeat the content and does not create a second outline entry.
- The page/reader views show two incoming edges to `b3`: the primary edge visually stronger, the reference edge dashed or otherwise distinct.
- Deleting the reference branch from `b4` leaves `b3` under `b1` unchanged.
- "Make home" from `b4` swaps the roles: `b4` becomes the primary parent, `b1` becomes a reference parent, and `b3` moves under `b4` in outline and layout (including a pagination change if it crosses a page boundary). "Move here" instead makes `b4` primary and deletes the old `b1` edge.
- Deleting the primary branch from `b1` makes `b3` a root; the reference from `b4` remains, and `b3` is inserted after the former top-level block in the chapter's top-level order.
- A block with two incoming reference branches and no primary is a root; references do not create a home.

**Verdict.** This satisfies "shared content without duplication" and keeps layout deterministic. It does not give two equal-status structural parents. If the product owner requires two equal parents that both affect placement, the layout model needs a different rule and the document needs a product decision (D4); the proposed one-home rule is the recommended interpretation.

**Shared-child lifecycle.** A block's primary parent MAY change; the document always has exactly one primary incoming edge. The required behavior is:

| Event | Required behavior |
|---|---|
| **Primary parent block deleted, promote children** | The shared child becomes a root and a top-level block immediately after the former top-level block; existing reference parents remain; the child and its subtree are unchanged; it appears once at the new top-level position. |
| **Primary parent block deleted as part of delete-subtree** | The child and its subtree are deleted only after confirmation that lists external reference parents; those incoming reference edges are removed with the deletion. No dangling edges. |
| **Primary branch deleted, parent remains** | The child becomes a root and a top-level block after the former top-level block; reference parents remain; target content and anchors are unchanged. |
| **"Make home" from a reference parent** | The chosen reference becomes primary; the old primary becomes a reference; the child moves once under the new home, with derived pagination updating. Both relationships are preserved. |
| **"Move here" from a reference parent** | The chosen reference becomes primary; the old primary edge is deleted; the child moves once, with derived pagination updating; the old parent loses the link. |
| **Primary parent is reparented** | The shared child moves with the parent's subtree; its own primary incoming edge is unchanged. Pagination is recomputed. |
| **Outline display for a multi-parent block** | The block appears once, at its primary home. Reference contexts show "See also" and "Referenced by" links with derived page numbers when available. The breadcrumb follows the primary path; a separate list shows reference parents. No duplicate rows or cards. |
| **Collapse** | Collapsing an ancestor of the primary home hides the shared child; reference links from visible blocks still resolve and can reveal/expand it. No duplicate is created. |
| **Shared child deleted** | All incoming primary and reference edges are removed; if external reference parents exist, the confirmation lists them. |

This lifecycle is covered by acceptance criterion AC-58.

### 4.13 Platform neutrality

The canonical model MUST remain usable by a future iPad or native companion without rewriting document data:

- No DOM nodes, screen coordinates, CSS selectors, or rendered pixel positions in canonical data.
- Anchors use stable IDs, quote/context fallbacks, normalized image rectangles, and defined offset units.
- Assets use relative package paths, not absolute filesystem paths.
- Time values are ISO 8601 UTC; IDs are opaque strings.
- Content is JSON-compatible data; raw HTML and scripts are never executed.
- Chapter/top-level order is stored as ordered IDs, not as device-specific coordinates or stored page containers. Layout and pagination are recomputed from canonical structure and page setup.

---

## 5. Operations

### 5.1 Command model and undo

- Every structural change is a command with a human-readable label and an inverse: create block, create branch, delete block, reparent, reorder, add/remove page-break hint, collapse, repair anchor, and so on.
- Text editing uses the active editor's local history. Structural commands use the application command stack.
- The user sees one undo stack. When the last action was typing and the active editor has local history, undo routes to the editor; otherwise it routes to the application stack. The routing rule must be documented in UX and tested at boundaries (typing, then branching, then undo).
- A command validates its preconditions before mutating. On failure, nothing changes and the user gets a reason.
- Undo restores content, structure, anchors, chapter/top-level order, break hints, selection, and focus. Redo is cleared by a new command.
- Undo history is session-only in v1; it is not persisted across launches.
- Autosave does not create undo entries.
- Multi-step user actions (for example, "create anchored child" = create anchor + create block + create branch) are one undoable command.
- Commands are identical in outline, reader, and page views. A command available in one view must be reachable in the others through the keyboard, menu, or command palette.

### 5.2 Block operations

| Operation | Preconditions | Effect | Undo |
|---|---|---|---|
| **Create top-level block** | A chapter exists. | Create a block and append it to the chapter's `topLevelBlockIds`, focus it for editing. | Remove block and top-level entry. |
| **Create child** | A source block or anchor exists. | Create a block, create a primary branch from the source block, order after the last direct child. Pagination is recomputed. | Remove branch and block. |
| **Create sibling** | A reference block exists. | Create a block with the same primary parent, ordered after the reference block. If the reference is top-level, create a new top-level block after it in the chapter. | Remove branch and block, restore top-level order. |
| **Create anchored child** | A valid single-block selection exists. | Create an anchor bound to the selection, create a block, create a primary branch from the anchor. The child is placed below the anchor; the paginator may continue it on the next page. | Remove branch, anchor, and block; restore selection. |
| **Edit content** | Block exists. | Update content; re-resolve anchors in that block; re-measure; re-layout and re-paginate. | Editor-local undo; structural splits/merges are commands. |
| **Rename label** | Block exists. | Set or clear the optional label. | Restore previous label. |
| **Delete block** | Block exists. | Remove the block, its anchors, its outgoing branches, and its incoming branches. Choose "promote children" or "delete subtree." See below. | Restore all removed records and top-level entries. |
| **Split block** | Caret is inside a block. | Move content after the caret into a new block; create a primary branch from the same parent, ordered after the original; move affected anchors. Pagination is recomputed. | Re-merge and restore IDs/anchors. |
| **Merge block** | A previous sibling exists. | Append the block's content to the previous sibling, remap children/anchors/branches, delete the block. | Restore both blocks and all mappings. |
| **Duplicate subtree** | Block exists. | Copy the block and its primary descendants with new IDs; remap internal branches and anchors; do not copy external references. Insert after the source. | Remove the duplicated subtree. |
| **Paste** | Clipboard has content. | Paste text/rich content into the active block; paste an image as an asset; paste copied blocks as a duplicated subtree. | Editor-local or command undo. |

**Delete block.** Default is **promote children**, because it is the least destructive:

- Every primary child of the deleted block is reattached to the deleted block's primary parent, in the deleted block's sibling position and order. If the deleted block was a top-level block, its children become top-level blocks immediately after the deleted block in the chapter's top-level order.
- The deleted block's outgoing branches and incoming branches are removed. Reference edges pointing at the deleted block are removed.
- The deleted block's anchors are removed. Branches sourced from those anchors are removed, because the containing block no longer exists.
- If the block has external reference parents, the confirmation names them and their derived pages.
- **Delete subtree** is explicit and destructive: it deletes the block and all primary descendants, removes all branches touching them, and lists any external reference edges that will be removed. Undo restores everything.

**Split block.** Splitting preserves the author's structure:

- Content before the caret stays in the original block; content after the caret moves to the new block.
- If the original block is top-level, the new block becomes a top-level block immediately after it in the chapter. Otherwise, the new block gets a primary branch from the same primary parent, ordered immediately after the original. Pagination is recomputed.
- Anchors entirely before the split stay with the original. Anchors entirely after the split move to the new block and update `blockId`. An anchor spanning the split point is clipped to the original side and marked for repair; it is never silently discarded.
- Branches sourced from moved anchors move with them. Branches sourced from the original block stay with the original. Direct children of the original stay with the original.
- Undo restores the original content, IDs, anchors, and branches.

**Merge block.** Merging is a command, not raw text concatenation:

- Append the merged block's content to the previous sibling.
- The merged block's primary children become children of the surviving block, ordered after its existing children.
- Anchors move to the surviving block and update `blockId`.
- Branches targeting the merged block are retargeted to the surviving block; duplicate exact source-target branches are removed with a warning.
- Branches sourced from the merged block are retargeted to the surviving block; duplicates are removed with a warning.
- The merged block is deleted. Undo restores all records and mappings.

### 5.3 Branch operations

| Operation | Preconditions | Effect |
|---|---|---|
| **Branch to new block** | A source block or anchor exists. | Create a block and a primary branch from the source. This is the default for "expand here." |
| **Branch to existing block** | A source exists and the target exists. | Apply the default rule below, or show the explicit choice. |
| **Delete branch** | Branch exists. | Primary: target becomes a root and a top-level block after the source block's top-level ancestor; subtree intact. Reference: remove only the edge. |
| **Make home** | A reference branch exists. | Promote the reference to primary; demote the old primary edge to reference. The target moves under the new parent; pagination is recomputed. Preserves both relationships. |
| **Move here** | A reference branch or target exists. | Make the chosen edge primary and delete the old primary edge. The target moves under the new parent; pagination is recomputed; the old parent loses the link. |
| **Promote to primary** | Target is a root or its primary can be demoted. | Same as "make home" when a primary exists; when the target is a root, promote it and make it a top-level block in the current chapter. |
| **Demote primary to reference** | A primary branch exists. | Convert the edge to reference; target becomes a root and a top-level block. Keeps the link. |
| **Reorder sibling** | Two siblings share a source port. | Update fractional order; no other structural change. |
| **Reorder top-level block** | Two top-level blocks share a chapter. | Update top-level order; no other structural change. |
| **Relabel branch** | Branch exists. | Set or clear the optional label. |

**Default rule for branching to an existing block:**

- If the target is a **top-level root** and the user chooses "add as child," the new branch becomes primary and the target is removed from the chapter's top-level list. The default for a root is "add as child," with "link as reference" available.
- If the target already has a **primary home**, the new branch is a **reference** by default. The target stays where it is. The user can explicitly choose "move here" or, later, "make home." Pagination is recomputed; a branch that crosses a page boundary gets a continuation marker.
- If the target is the source block or an ancestor of the source, a primary branch would create a cycle and is rejected. A reference branch is allowed unless it is a self-branch.
- If an exact source-target branch already exists, focus the existing branch instead of creating a duplicate.

### 5.4 Anchor operations

- **Create anchor.** The selection must be inside one block. The kind is inferred from the content: text range, formula term or whole formula, code token/line range, image point/region. The anchor gets a new ID and an inline binding. Creating a branch from a selection creates the anchor and the branch as one undoable command.
- **Create branch from anchor.** Same rules as branching to a new or existing block, with the anchor as the source port. A new block becomes the anchor's primary child, ordered after existing children of that anchor and placed below the anchor in the continuous layout. The paginator may continue it on the next page at a safe boundary; it never cuts a line, image, formula, or code line.
- **Re-anchor / repair.** Choose a new selection in the same block, or choose a candidate found by quote search. Update the selector and binding; keep the anchor ID and all branch IDs. Repair is undoable.
- **Attach branches to block.** Remove the anchor but keep its branches by changing their source to the block. This is the safe fallback when the user wants to keep the relationship but not the span.
- **Delete anchor.** Requires a choice: attach branches to the block, or delete the branches. The second is destructive and confirmed. Deleting an anchor never deletes the target block.
- **Broken anchor.** Never delete automatically. The branch remains; the anchor appears in the anchor health panel; the reader/page/PDF falls back to the whole block as the visual origin, shows a warning marker, and offers a repair dialog. The user can relink, attach to block, or delete.
- **Multi-block selection.** Rejected in v1 with a message. A future version may create multiple anchors or a block-range anchor.

### 5.5 Structure and ordering operations

| Operation | Trigger (default) | Effect |
|---|---|---|
| **Reparent** | Tab in the outline, or "Move under…" | Selected block becomes the last child of the previous sibling. Rejects if the new parent is the block itself or a descendant. Removes the old primary edge, creates a new one, updates top-level order if needed. Subtree, anchors, and outgoing branches move. Pagination is recomputed. |
| **Outdent** | Shift-Tab | Selected block becomes a sibling immediately after its primary parent. If the parent is a top-level block, the block becomes a top-level block after the parent; otherwise it becomes a child of the grandparent, ordered after the parent. |
| **Move up/down** | Keyboard or drag in outline/reader | Reorder among siblings or top-level blocks; update fractional order only. |
| **Make root** | Menu/command | Remove the primary incoming edge; make the block a top-level block after the former top-level block in the chapter. Subtree intact. |
| **Make home / move here** | Reference edge action | See §5.3. |
| **Drag in outline** | Drag row | Reorder or reparent with a drop indicator. Dropping into a descendant is rejected. |
| **Drag in reader/page view** | Drag card | Reorders the block among its siblings or top-level blocks with a drop indicator. It never sets an arbitrary x/y, never pins, and never free-drags. |
| **Add page-break hint** | Command on a block or page-break marker | Request a page break before the block. The paginator honors it where possible; it is a hint, not a page container. |
| **Remove page-break hint** | Command on the hint | Remove the request; pagination is recomputed. |
| **Change page orientation** | Document/page setup | Switch A4 portrait ↔ landscape. Recompute layout and pagination; page count may change. |
| **Change margins** | Document/page setup | Update A4 margins. Recompute layout and pagination. |

### 5.6 View operations

- **Switch mode.** Outline ↔ reader ↔ page view, preserving focused block, selection, collapse state, reader scroll, and current page.
- **Split view (SHOULD).** Show outline and reader/page side by side over the same document. The same one-editor rule applies.
- **Collapse / expand.** Collapse hides primary descendants and their callouts; expand restores them. Collapse subtree and expand all are commands. State is shared by all views.
- **Page navigation.** Previous/next page, page thumbnails/sidebar, go to page, go to chapter. Changing page is view state and never changes document data.
- **Zoom / pan / fit.** Fit page, fit width, actual size, zoom in/out. Pan/zoom are navigation only and never change block positions.
- **Page break hints.** Add or remove a break before a block; the reader shows the marker and the page view/PDF honor the hint where possible.
- **Page setup.** Change orientation and margins; recompute layout and pagination.
- **Freeze study mode.** Freeze the current layout and pagination snapshot; reading is enabled, editing is disabled. Exiting freeze returns to incremental reflow or offers a full reflow.
- **Full reflow.** Recompute the entire layout and pagination on request, or automatically after a short idle in editable mode. The UI shows a brief "layout updated" indicator if page breaks move.
- **Focus subtree (SHOULD).** Dim or hide unrelated blocks for study; do not delete or restructure.
- **Navigate.** Follow a branch to its target (and derived page), follow a backlink, go back/forward in navigation history, jump to an anchor, jump to a search result.
- **Search.** Find text, code, LaTeX source, and labels; show the chapter/page path; reveal the block in all views.

### 5.7 Persistence, export, and future operations

- **Save / autosave.** Atomic save of the document package; see §10.
- **Save As / open / recent.** The document package is the unit; a document library is not required in v1 (A3).
- **Recover.** Offer the last autosave or backup after a crash; never overwrite the last good file with a partial one.
- **Export PDF.** Page PDF: one PDF page per derived page, A4 portrait/landscape, produced by the paginator; see §11.
- **Export Markdown.** Post-v1 (D9): outline order, page breaks as comments/separators, anchors as footnotes/callouts, references as links; lossy for page layout and exact anchors.
- **Export JSON Canvas.** Post-v1: a read-only map interchange, not the document format; no anchors; references become edges. It does not restore free positioning.
- **Import Markdown / JSON Canvas.** Post-v1: lossy; imported content gets new IDs; anchors are not reconstructed from plain Markdown.
- **Share package.** A zip or folder copy of the document package, with assets. Not a cloud feature.

---

## 6. Views and interaction model

### 6.1 Shared principles

- **One document, multiple lenses.** Outline, reader, and page views read the same model and issue the same commands. None owns a private ordering, copy, or layout state that can diverge.
- **One focused block.** There is one focused block across the app. The reader/page views may have a multi-selection for reorder commands, but one block is the focus for editing, navigation, and the outline.
- **One active editor.** At most one block editor is live at a time. This avoids duplicate editors on the same content, reduces memory, and makes undo/focus predictable.
- **Read-only by default.** Blocks render as content until the user edits. The views do not mount an editor for every block.
- **Keyboard-first.** Every core authoring operation is reachable without a mouse. Exact keybindings belong to UX; the required commands are listed in §6.7.
- **No color-only meaning.** Primary vs reference, resolved vs broken anchor, and selected vs focused states must also differ by shape, line style, icon, or label.
- **Context preservation.** Switching views, changing page, collapsing, or zooming must not change content or structure.

### 6.2 Outline view

The outline is the fast authoring surface and the canonical reading order.

**Structure and rendering**

- Blocks are rows in a vertical, indented list. Each row shows a collapse control, the block content (rendered), an optional label, anchor markers, and reference links. Page breaks and continuation markers appear as separators.
- Direct primary children are indented one level under their parent.
- Anchored primary children appear as indented callouts immediately after the parent block, before direct children (closed, D3). The callout shows the anchor quote and the branch label, and is visually distinct from a direct child.
- Reference edges appear as "See also" / "Referenced by" chips with page numbers; they do not create indented rows and do not repeat content.
- A collapsed row shows a count of hidden descendants.
- Broken anchors show a warning marker on the block and in the callout; the branch target remains visible.
- A page-break marker shows the derived page number and any continuation; it is not a stored page container.

**Authoring**

- Clicking a block or pressing Enter on a focused row opens the active editor inline.
- Enter creates a sibling; Tab reparents under the previous sibling; Shift-Tab outdents; Backspace at the start merges with the previous block. These are application commands, not raw editor behavior.
- A dedicated command creates an anchored child from the current selection.
- Drag reorders or reparents with a drop indicator; an invalid drop is rejected before mutation. Dragging never sets a free position.
- Collapse/expand, page break, branch/link, and page navigation commands are available from the keyboard and context menu.

**Performance**

- The outline virtualizes offscreen rows. The active editor is always mounted; other rows are lightweight renderings.
- Scrolling 1,000 rows SHOULD remain smooth; the focused row and its editor must never be unmounted unexpectedly.

### 6.3 Reader and page views

The reader and page views render the same continuous layout. "Canvas" means the paginated page view; it is **not an infinite canvas**.

**Shared rendering**

- The layout engine computes one continuous tree geometry per chapter: content-driven widths, children to the right when there is room, otherwise wrapped below the parent with a slight indent, anchored branches below their anchors.
- Blocks are cards whose width follows the measured content within page-width constraints; heights are measured from content.
- Primary edges are solid arrows; reference edges are dashed or otherwise distinct and labeled when they have a label.
- Cross-page edges use continuation markers at the page boundary. A block is never cut through a line, image, formula, or code line; it may continue at a safe boundary.
- Collapsed cards show a hidden-descendant badge. Broken anchors show a warning marker.
- At low zoom, cards use a simplified level of detail (label and first line) and editing is disabled; at normal zoom, full content renders.

**Reader view**

- A continuous vertical scroll of the chapter layout. Page-break markers show where the paginator will break and which page number follows.
- Page width and margins are shown as guides; content outside the guide is not clipped, but it will be paginated.
- This is the **primary authoring surface in v1 (D14 closed)** because it avoids page-boundary friction while keeping page breaks visible.
- Adding or editing a block updates the continuous layout and the page-break markers immediately (after the layout debounce).

**Page view**

- A paginated WYSIWYG rendering of the same layout: one A4 page at a time, with visible margins, page number, and page navigation.
- Page content is a slice of the continuous layout produced by the paginator. Pages are not stored; changing content re-paginates.
- Continuation markers appear at the bottom of the source page and the top of the target page.
- Page controls: previous/next, page thumbnails, page number, orientation, margins, fit page, fit width, actual size, zoom.
- The page view is the visual proof for PDF export; it must show the same breaks and continuations as the PDF.

**Freeze study mode**

- Freeze takes a snapshot of the current continuous layout and pagination.
- While frozen, scrolling, zooming, following references, and reading are enabled; editing and structural commands are disabled.
- Nothing moves, even if a background measurement completes. The freeze badge is visible.
- Exiting freeze returns to normal editing and offers "Keep current layout" (incremental) or "Full reflow."

**Primary surface (closed)**

The reader is the primary authoring surface in v1; the page view is the preview/verification surface (D14 closed).

- **Reader-primary:** fast continuous authoring; page view is a preview/verification surface.
- **Page view:** still a first-class renderer and the visual proof for PDF export; it is not a second layout engine.
- **Either way:** one layout engine and one paginator. Do not build two independent layout implementations. If the product later moves to page-primary authoring, that is a UX change, not a layout-engine change, and requires an ADR only if it changes the pagination model.

**Interaction**

- Click selects and focuses a block. Double-click or Enter opens the inline editor. Only one editor is active.
- Scroll/pan and pinch/zoom are navigation only. They never change block positions.
- Drag a card to reorder it among its siblings or top-level blocks. A drop indicator shows the legal slot; the block snaps into the adaptive layout. There is no free x/y drag and no pin.
- Drag from a block's branch handle to another card to open the branch-to-existing choice; drag from an anchor highlight to create an anchored child. Dropping outside a legal slot cancels.
- Select an edge to highlight it; Delete removes the branch (primary deletion makes the target a top-level block, with confirmation if it has a large subtree).
- Clicking a reference edge navigates to the target's derived page and highlights the source; a back command returns.
- Marquee/shift multi-select supports reorder, delete, and collapse as a group. Multi-select does not allow editing more than one block.
- A focus mode dims unrelated blocks for study; it is a view state, not a document change.

**Page boundaries**

- The paginator is authoritative. It breaks between blocks, never through a block.
- A continuation is a rendering state, not a second block. The source page shows "continues on page N"; the target page shows "continued from page M".
- A block taller than the page content area may continue at a safe internal boundary; if no safe boundary exists (for example a single line, image, formula, code line, or table row that is taller than the page), it is a pagination defect: the user must split the block or change page setup. The app does not cut or clip it.
- A table may continue across pages only between rows. A row and its cells are never split; a table header is not repeated automatically in v1.

### 6.4 Synchronization between views

- Content edits, structure changes, anchors, pagination, collapse state, and undo are reflected in all views immediately.
- Selecting a block in any view updates the focused block in the others and reveals its chapter/derived page. If the block is hidden by a collapsed ancestor, the other view expands ancestors; this changes only view state.
- Switching modes preserves the focused block, the current page, reader scroll, and the page selection where possible.
- The outline order and adaptive layout derive from the same primary branches, top-level order, and sibling orders. There is no independent manual position.
- Pagination is derived, not document data. Collapse state is shared. There are no pins.
- If a block is deleted or becomes unreachable while focused, focus moves to the nearest surviving sibling, then parent, then top-level block.
- The app MUST prevent two live editors on the same block. Switching views while editing commits or cancels the edit according to the UX rule; it never leaves a stale editor.

### 6.5 Navigation and context

- A breadcrumb shows chapter, derived page, and the primary path from the top-level block to the focused block.
- A separate "Referenced by" list shows reference parents and reference children with derived page numbers, without conflating them with the primary path.
- Back/forward navigation history covers branch following, backlink jumps, anchor jumps, and search results.
- Following a branch selects the target and highlights the source edge/anchor; back returns to the source.
- Following a broken anchor opens the anchor health panel with repair actions.
- Search results show the block label, a snippet, the document, and the chapter/page path; selecting a result reveals the block in all views.

### 6.6 Editing model

- The active editor edits exactly one block. It supports rich text, lists, code, inline/display math, images, and Markdown-like input shortcuts.
- Committing an edit updates content immediately in the model, re-resolves anchors in that block, re-measures the block, re-runs the adaptive layout after a short debounce, and re-paginates. The card may grow live to avoid clipping; pagination may continue it at a safe boundary, never through a line/image/formula/code line.
- Canceling an edit restores the pre-edit content and selection when possible.
- Pasting text preserves plain text and common rich structure; pasting an image copies it into the package and inserts an image node; pasting a URL creates a link, not a remote image.
- Invalid LaTeX is stored as source and rendered with a visible error state; it is never dropped.
- Code blocks store plain text plus a language hint; code is never executed.
- Raw HTML/scripts are never executed. External links are sanitized and opened outside the document.
- IME composition is respected; structural shortcuts do not fire during composition.
- Autosave status is visible but unobtrusive. A save failure is a persistent, actionable banner, not a toast that disappears.

### 6.7 Required keyboard commands

Exact keybindings are deferred to `docs/ux.md`, but the following commands MUST be keyboard-reachable in the outline and, where meaningful, in the reader/page views:

- create sibling, create child, create anchored child;
- indent/reparent, outdent, move sibling up/down;
- edit focused block, commit, cancel;
- delete block, delete branch;
- collapse/expand, collapse subtree, expand all;
- branch to new block, branch to existing block, link as reference;
- make home, move here, make root;
- previous/next page, go to page, add/remove page-break hint, change page orientation/margins;
- toggle freeze study mode, full reflow;
- toggle outline/reader/page view, fit page, fit width, zoom in/out;
- search/find next, follow branch, back/forward;
- undo/redo.

A core authoring operation MUST NOT be mouse-only. A menu or command palette fallback is acceptable for page-specific gestures. There is no pin, unpin, reset-layout, or free-position command.

### 6.8 Accessibility

- Keyboard focus is always visible and follows a logical order.
- The outline is the accessible representation of the document: VoiceOver can read the hierarchy, page-break markers, labels, branch roles, and collapsed state.
- The reader/page views MUST have an accessible equivalent for every action through the outline, menu, or command palette; spatial-only gestures are not the sole path.
- Primary vs reference, resolved vs broken, and selected vs focused use non-color cues. Pagination continuation uses an icon and text, not color alone.
- Reduced motion is respected; layout animations are optional and disabled during typing.
- PDF export provides a real text layer; tagged PDF/PDF-UA is not a v1 requirement (D10).

### 6.9 Visual design constraints

- The visual direction is clean, minimal, and Obsidian-like: a calm reading surface, restrained chrome, and content-first hierarchy.
- **Dark mode is the default**; a light theme is required and must preserve the same hierarchy, contrast, and state cues.
- No gradients, glass effects, heavy shadows, or decorative illustrations in the document surface. Page guides, margins, and block borders are subtle.
- Typography is readable for long study sessions; code and math have dedicated styles and must not rely on color alone.
- Primary/reference edges, anchors, broken anchors, page breaks, continuations, selection, and focus remain distinguishable in both themes and for color-vision deficiencies.
- There is no in-app agent panel/chat in v1; external agents use the local API. No chat chrome is part of the main window.

### 6.10 View state

- Last mode, current derived page, reader scroll and zoom, outline scroll, focused block, collapsed blocks, and page selection are persisted as view state.
- View state is per document and may be reset without touching content.
- Stale view-state references are dropped on load; an invalid page number falls back to the nearest existing derived page.
- Opening a document SHOULD restore the last view and focus, but a corrupt view state must never prevent loading the document.

---

## 7. Adaptive layout and pagination

### 7.1 Inputs and outputs

**Inputs:** page setup (A4 size, orientation, margins), optional manual break hints, chapter order, top-level block order, the primary forest, branch order, measured block content sizes, resolved anchor rectangles, and the collapsed set.

**Outputs:** a continuous layout (a rectangle for every visible block in chapter coordinates), a paginated set of derived pages with continuation records, an attachment point for every visible anchor, a route for every visible edge, and a list of layout/pagination defects. Layout and pagination are pure derivations. They MUST NOT mutate the document and MUST NOT store computed x/y or pages in the document.

### 7.2 Geometry

- A4 portrait: 210 × 297 mm. A4 landscape: 297 × 210 mm.
- Margins are document-level in v1; default 20 mm on all sides. The page content width is the page width minus left/right margins; the page content height is the page height minus top/bottom margins.
- Continuous layout coordinates: origin at the top-left of the chapter's content area, x grows right, y grows down. Units are logical pixels at 100% zoom.
- The continuous layout may be taller than one page. The paginator slices it into pages; the layout engine does not know about page boundaries.
- The page content width is a hard horizontal constraint. The page content height is a pagination constraint, not a layout constraint.
- Block widths are content-driven, not fixed per depth. Widths are clamped to a minimum readable width and a maximum that fits the page content width. A block with long content wraps; it does not overflow horizontally.
- Gaps are design tokens: sibling gap, subtree gap, wrap indent, callout gap, chapter gap. The 16 logical px minimum clear gap is fixed in §7.13; other values are UX decisions.
- There is no document-space free position. Pan/zoom are navigation over the rendered reader/page, not positioning.

### 7.3 Adaptive tree layout

- Chapters are ordered. Each chapter starts at the top of a new derived page.
- Top-level blocks in a chapter stack vertically in `topLevelBlockIds` order, separated by the chapter gap.
- For each top-level block, lay out its primary subtree as an adaptive tree:
  - The block's card width is derived from its measured content, clamped to the readable min/max. Height is measured.
  - A child is placed to the right of its parent when the remaining page width can fit the child's layout footprint (its card plus the minimum needed for its own subtree). Otherwise, the child wraps below the parent level with a slight indent.
  - Siblings stack vertically in branch order. Siblings may have different widths. The sibling group may fill the available width; there is no fixed column width and no global column alignment.
  - A parent is vertically centered on its children's span where possible; leaves follow sibling packing.
  - A subtree occupies a bounding box. Sibling subtrees MUST NOT overlap.
  - A child MUST be placed after its parent in reading order: to the right, or below with an indent when wrapping.
- Anchored children are placed below their anchor in the same adaptive flow. They may wrap horizontally and may continue at a safe boundary on the next page; they are never cut through a line, image, formula, code line, or table row.
- The page width is a hard boundary. If a layout cannot fit within the page content width after wrapping, it is a layout defect: the user must shorten content, split the block, or change page setup. The app MUST NOT clip or auto-scale.
- Only sibling order and top-level order change. There is no arbitrary x/y, no fixed depth column, and no pin.

### 7.4 Anchored branches

- An anchored child is not part of its parent's sibling packing. It is a callout attached to a span.
- Resolve the anchor to a rectangle in continuous coordinates. The callout is placed below the anchor, left-aligned to the anchor's left edge where the page width allows, with the callout gap.
- Multiple callouts from the same anchor stack vertically in branch order. Callouts from different anchors are placed in anchor order and MUST NOT overlap another card or callout.
- After placing the callout, lay out its primary subtree with the same adaptive rules. The whole subtree may be wider or taller than one page; the paginator handles height, the adaptive layout handles width.
- If the callout cannot fit within the page width, the layout wraps it below the anchor with a slight indent. If it still cannot fit, it is a layout defect; the user shortens/splits content or changes page setup.
- A broken anchor attaches to a visible warning point on the block and shows "anchor lost"; its branch target still appears as a callout or continuation.
- Collapsed ancestors hide their anchored callouts and subtrees with the rest of the hidden content.
- Nested anchored branches are allowed and laid out recursively. They may continue at safe boundaries; they are never cut or moved to an arbitrary position.

### 7.5 Paginator

- The paginator converts the continuous layout into A4 pages using `pageSetup`, chapter boundaries, and optional `manualBreakBeforeBlockIds`.
- It first prefers page breaks **between blocks**. If a block would cross the page bottom, the paginator may continue the block at a **safe internal boundary**:
  - paragraph boundary;
  - list-item boundary;
  - blockquote paragraph boundary;
  - between code lines (never inside a code line);
  - between table rows (never inside a row or cell).
- The paginator MUST NOT cut a text line, an image, a formula, a table row, or a code line.
- **Table rows are atomic.** A table may continue across pages only between rows. If one row is taller than the page content height, the table cannot be split safely: it is a pagination defect, not permission to cut. Header-row repetition on continuation pages is not required in v1.
- A block that continues across pages is a **block continuation**:
  - the previous page shows "continues on page N" at the bottom of the block;
  - the next page shows "continued from page M" at the top and a compact ghost parent (the parent block's label and relevant anchor quote) for context;
  - the block exists once and is not duplicated.
- A lower-level block that continues on the next page also gets a ghost parent at the top, even if the block itself is not continued.
- A top-level block that starts a new page is not a continuation; it is a normal top-level page start.
- Manual break hints are best-effort requests to start a page before a block. The paginator honors them unless doing so would create an empty page or an impossible break. Hints are not page containers.
- A block with an image or formula that is taller than the page content height is a pagination defect; a block whose only safe boundary is a line/image/formula/code line is also a defect. The app MUST warn and MUST NOT cut or auto-scale; the user splits the block, changes page setup, or reduces content.
- The paginator is deterministic: the same layout, page setup, and hints produce the same pages and continuations.
- Derived pages are numbered in reading order across the document. Page count and continuations are computed, never stored.

### 7.6 Collapsed subtrees

- Collapsing a block hides its primary descendants and their anchored callouts. The block itself remains visible with a hidden-count badge.
- Hidden blocks are not laid out or paginated; their order is preserved for expansion.
- Expanding a block reflows its subtree and re-paginates. The layout SHOULD avoid moving unaffected blocks in continuous coordinates; page breaks may shift.
- Collapse state is shared by outline, reader, and page views. Collapsing in one view is reflected in the others.
- Navigating to a hidden block (search, reference follow, explicit reveal) expands the necessary ancestors and goes to its derived page; this is view state, not a document edit.

### 7.7 Shared children and reference edges

- A shared child is placed once, at its primary home in the continuous layout. Reference edges do not move it.
- Reference edges are routed after node placement. The router SHOULD avoid crossing block rectangles where possible and MAY fall back to a curved route.
- Reference cycles are allowed. The renderer must terminate and must not recurse through reference edges when building the outline or PDF.
- Primary edges are visually stronger than reference edges. A reference edge label is shown on hover/selection or when it fits.
- Changing a block's home moves the block and its subtree; pagination is recomputed. Adding or removing a reference edge MUST NOT change any block position or pagination.
- If a reference target is on another derived page, the edge ends at a page-edge indicator with the target page number; it is not silently removed.
- Cross-page primary edges use continuation markers at the page boundary; they are not drawn as long lines through unrelated pages.

### 7.8 Chapters and top-level blocks

- A chapter MAY have multiple top-level blocks. They stack vertically in top-level order.
- A document MAY have multiple chapters. Each chapter starts a new derived page; chapter order is document order.
- Every top-level block is a content block; it may be a standalone sentence or a short phrase with children.
- A top-level block with no children is still a card on the page and can be followed by a page break.
- There is no synthetic super-root and no "page container" in the document.
- Page setup is document-level in v1. Mixed portrait/landscape pages are not required (D15).

### 7.9 Stability and incremental layout

- Layout MUST be deterministic: the same document, page setup, measurements, hints, and collapse state produce the same continuous layout and pagination.
- Reference edge changes MUST NOT move blocks or change pagination.
- Content edits re-measure the edited block and reflow its subtree and affected siblings; they must not reflow unrelated chapters.
- Adding or removing a top-level block may move subsequent top-level blocks in continuous coordinates; it must not move unrelated chapters.
- Sibling reorder and top-level reorder change order only; they do not create free positions.
- Layout has three stability modes:
  - **Incremental (default):** recompute the edited block's subtree and affected siblings; keep unaffected continuous positions stable. Page breaks may shift locally.
  - **Freeze study:** snapshot the current layout and pagination; disable editing; allow reading/navigation only. Nothing moves until the user exits.
  - **Full reflow:** recompute the entire chapter/document layout and pagination. Run on explicit request or after a short idle (default 2 s) in editable mode, not while typing. Page breaks may change; show a brief "layout updated" notice.
- Freeze mode must be deterministic and read-only; it cannot be used to bypass structural validation or to apply edits without reflow.
- Full reflow must preserve the logical tree, sibling order, page setup, and break hints; only geometry/page breaks may change.
- Layout runs after a short debounce during typing (for example, 100–200 ms) and immediately on structural commands. Pagination re-runs with layout. Layout animations are optional, 120–200 ms, and disabled during typing.
- Reopening a document with unchanged content and page setup SHOULD produce the same layout and page count. Font loading and measurement must settle before final layout/pagination; avoid a visible jump after first paint.

### 7.10 Collision and pagination defects

- Blocks in the continuous layout MUST NOT overlap.
- A callout must not overlap its anchor's block, another card, or another callout. Adaptive wrapping must prevent horizontal overflow; if it cannot, it is a layout defect.
- Edge crossings are allowed; the layout does not guarantee crossing minimization.
- Hidden blocks do not participate in collision tests until expanded.
- The UI exposes layout/pagination defects on the affected block and page: content too wide, a block with no safe continuation boundary, or an impossible manual break hint.
- The UI offers resolve actions: shorten/split the block, change page orientation/margins, or remove the break hint. It never clips, auto-scales, or silently reflows across pages.

### 7.11 Performance strategy

- Measure blocks once and cache width/height; invalidate on content, font, or page setup changes.
- Lay out only dirty subtrees; keep top-level order and sibling order stable.
- Paginate incrementally: recompute from the first affected block; avoid re-paginating the whole document on every keystroke.
- Virtualize reader/page rendering: mount the visible region plus a small prefetch window; page thumbnails are lightweight.
- Collapse is a primary scale tool; page navigation and LOD are the others.
- At low zoom, use simplified cards; at high zoom, render full content and enable editing.
- Do not animate edges during text editing.

### 7.12 Layout non-goals

- Infinite canvas, free positioning, manual pins, fixed pixel columns per depth, or arbitrary drag-to-place.
- Global DAG layout, layered Sugiyama-style reordering, or force-directed placement.
- Automatic edge-crossing minimization as a product guarantee.
- RTL or vertical page layouts.
- Automatic conversion of a block into multiple blocks to satisfy pagination; a paginator continuation at a safe boundary is allowed, but the document model is not rewritten.
- 10,000-block documents.

### 7.13 Layout tolerances and stability gates

The Sentinel's proposed tolerances are adopted as v1 targets, with definitions so they are testable:

| Metric | Value | Definition | Status |
|---|---|---|---|
| **Minimum clear gap** | 16 logical px at 100% zoom | Shortest distance between the axis-aligned bounds of two visible blocks in the continuous layout. Edge crossings and leader lines do not count. | Confirmed for v1. |
| **Anchor alignment** | 2 px | At 100% zoom, a callout's left edge is within 2 px of the resolved anchor's left edge, and the callout top is below the anchor bottom. A continuation after a page break is exempt but marked. | Confirmed for v1. |
| **Add-block stability** | ≥95% within 2 px | Across the stability fixture suite, after adding one block, at least 95% of pre-existing blocks keep both continuous x and y within 2 px. Blocks in the added block's parent subtree or sibling group may move; unrelated chapters must not move. Page breaks may change. | Confirmed as a suite-level floor. |
| **Delete stability** | ≤1 px outside the affected group | After deleting one block, every surviving block outside the deleted block's former parent subtree and sibling group moves no more than 1 px in continuous coordinates. Unrelated chapters must not move. Page breaks may change. | Confirmed for v1. |

Notes:

- These values are measured in continuous layout coordinates at 100% zoom; page-local positions may change when pagination shifts. Page-count changes are not stability failures.
- There is no pin exception. A block that must wrap below its parent is a normal adaptive-layout result, not a defect.
- Chapter insertion/deletion/reordering is a chapter-stack operation: existing chapters keep their internal continuous layout; only chapter order/page numbers change. These are tested separately from block stability.
- The 95% figure is a suite-level floor, not a promise that every block is stable in every operation. A single operation may move an entire affected subtree; the suite must still meet the floor.
- If a fixture fails a gate, treat it as a layout defect. Changing a tolerance requires an ADR or an explicit product decision, not a silent test adjustment.

---

## 8. Anchor lifecycle

### 8.1 Creation

1. The user selects content inside one block: a text range, a formula term or whole formula, a code token/line range, or an image point/region.
2. The app validates that the selection is inside one block and non-empty (except an image point, which may be a zero-size region with a visible marker).
3. The app creates an anchor ID and binds it to the content: an inline mark for text, a node attribute for a whole formula/image/code block, or a term/offset selector for a sub-formula or code range.
4. The app stores the fallback quote and context.
5. If the action is "branch," the app creates the target block (or selects an existing one) and a primary branch from the anchor, as one undoable command. The child is placed below the anchor; the paginator may continue it on the next page with a continuation marker.
6. The anchor highlight and branch are shown in both views.

### 8.2 Resolution

Anchors are resolved on load and after edits that can affect them. Resolution is ordered by confidence:

1. **Exact binding.** The inline mark or node attribute with the anchor ID exists in the block content. This is the strongest match.
2. **Exact quote with unique context.** The quote appears exactly once, or once with the stored prefix/suffix. Resolve automatically.
3. **Quote with multiple candidates.** Use the occurrence hint, context score, and last-known position to rank. If one candidate is clearly best, resolve; otherwise mark **ambiguous** and show candidates for confirmation.
4. **No match.** Mark **broken**.

Resolution MUST NOT mutate content automatically. An ambiguous or broken anchor is a visible state, not a reason to delete the branch. `lastKnown` is a repair hint only; it never overrides the content binding.

### 8.3 Anchor states

| State | Meaning | Rendering |
|---|---|---|
| **Resolved** | The binding or a unique fallback resolves to a span/region. | Normal anchor highlight; callout attached to the span. |
| **Ambiguous** | Multiple plausible candidates; automatic resolution is unsafe. | Warning marker; callout attached to `lastKnown` or the block; "Choose location" repair. |
| **Broken** | No candidate resolves. | Warning marker on the block; callout attached to the block's warning point; "Relink" repair. |
| **Idle** | The anchor exists but has no branch. | Optional subtle mark; no callout. |

An anchor mark with no anchor record is inert. It must not create a phantom branch. The app SHOULD clean up such marks on an explicit repair or save, but must not delete content.

### 8.4 Detection triggers

Re-resolve anchors in the affected block after:

- a text, formula, or code edit;
- a block split or merge;
- an image replacement or crop;
- a block delete (delete its anchors and branches, as specified);
- an undo/redo that changes content or structure;
- document load;
- import or paste that creates anchors.

Incremental resolution is scoped to the edited block. A full-document anchor scan is required on load, after migration, and after a recovery repair. Broken-anchor UI updates may be debounced, but the state must be correct before save and export.

### 8.5 Repair UX

The anchor health panel lists every ambiguous or broken anchor with:

- block label, derived page, and path;
- stored quote and context;
- branch target(s);
- reason (text deleted, code changed, image replaced, multiple matches, missing target);
- last-known continuous layout position.

Actions:

- **Relink to selection.** Select a new range/region in the same block; update the selector; keep the anchor and branch IDs.
- **Choose candidate.** For ambiguous anchors, show the candidate spans with context; pick one.
- **Attach branches to block.** Remove the anchor and make the branches block-sourced; target content is untouched.
- **Delete branch.** Remove one or all branches from the anchor; confirm if destructive.
- **Delete anchor.** Remove the anchor; branches must be reattached or deleted.
- **Keep broken.** Dismiss the warning for now; the branch remains visible with a warning marker.

Repair is undoable. Relinking must preserve the anchor's identity, branch labels, and target blocks. The repair UI must never require the user to retype content.

### 8.6 Edit effects

| Edit | Expected anchor behavior |
|---|---|
| Insert text before the anchor | Resolved; the mark moves with the text. |
| Insert text inside a text anchor | Resolved; the range grows. |
| Delete text before/after the anchor | Resolved; the mark moves. |
| Delete part of the anchored text | Resolved if the mark survives; otherwise broken/ambiguous. |
| Delete the entire anchored span | Broken; branch preserved; repair offered. |
| Replace the anchored span | Broken unless the exact binding survives; repair offered. |
| Split the block before the anchor | Anchor moves to the new block; `blockId` updates. |
| Split the block inside the anchor | Anchor clips to the original side and is marked for repair; branch preserved. |
| Merge blocks | Anchor moves to the surviving block; `blockId` updates. |
| Move the block | Resolved; anchor moves with the block and derived pagination. |
| Reformat text (bold, italic, list) | Resolved; marks move with the text. |
| Change code language | Resolved; offsets/quote unchanged. |
| Edit code inside the anchored range | Re-resolve by quote/context; ambiguous or broken if the quote changes. |
| Replace the image | Broken; asset hash mismatch; branch preserved. |
| Resize/crop the image | Resolved if the asset is unchanged; normalized rect maps to the new display. |
| Undo/redo | Re-resolve; the previous state is restored with the transaction. |
| Reload | Resolve from the binding first, then fallback; never silently drop. |

### 8.7 Anchor geometry

- **Text:** union of the marked range's line rectangles in continuous layout coordinates; attach at the right edge of the last line. Multi-line anchors are allowed.
- **Formula:** whole-formula anchors use the formula node rectangle. Term anchors use a best-effort term rectangle; if unavailable, use the formula rectangle and show the quoted term in the callout marker. The branch is still semantically anchored to the term.
- **Code:** token/line range rectangle; if unavailable, the code block rectangle. Highlight the range.
- **Image:** the normalized region scaled to the displayed image; point anchors use a small marker. The region outline is visible on hover/selection.
- **Broken/ambiguous:** the block's warning point (for example, top-right) with a warning icon; the callout target is the block, clearly labeled as detached.

All geometry is continuous and recomputed on layout/pagination; none of it is stored in the document.

### 8.8 Multi-block anchors

A selection spanning multiple blocks is rejected in v1. The message explains that anchors are single-block and offers to create a branch from the first or last block instead. Multi-block anchors are a future extension; they must not be half-supported.

### 8.9 Anchor health and export

- The status area shows the count of broken and ambiguous anchors for the document.
- The anchor health panel is available from the status area and from a warning marker.
- Broken anchors do not block saving or export. In the paginated PDF, a broken anchor produces a marker and an "anchor lost" note, and the branch content still appears exactly once in the continuous layout or its continuation.
- No automatic anchor deletion, no automatic branch deletion, and no silent omission from export.
- An optional anchor appendix MAY list broken or ambiguous anchors, their quotes/terms, their targets, their derived pages, and the reason. It is a diagnostic aid, not a replacement for the branch content.

### 8.10 Anchor policy for formula, code, and image anchors (D5, closed)

This is the highest-risk policy in the spec. The data model preserves anchors and branches, and the v1 behavior below is **ratified (D5 closed)**. It must be implemented and tested before anchor implementation and PDF export are locked.

| Concern | Formula | Code | Image |
|---|---|---|---|
| **Orphan detection** | Formula node missing; recorded LaTeX term no longer present; invalid LaTeX; multiple term occurrences. | Code node missing; exact quote absent; offsets invalid; multiple quote matches. | Asset hash changed or asset missing; image node missing; rect outside 0–1; crop or replacement. |
| **Automatic resolution** | Whole formula by node ID; term only when the exact LaTeX term and context are unique. Multiple occurrences are ambiguous. | Exact quote plus context unique; offsets are a hint, never the sole match. Multiple matches are ambiguous. | Node ID plus unchanged asset hash plus valid normalized rect; display resize is safe; asset change is broken. |
| **Reattach confirmation** | Required for ambiguous anchors; show old and new LaTeX term and occurrence. | Required for ambiguous anchors; show the old and new line/quote and surrounding lines. | Required when the asset or crop changed; show old and new image and the old region. |
| **Export behavior** | Branch content appears exactly once in the paginated layout, with a continuation marker if needed; marker says "formula anchor lost" or "ambiguous"; the term is shown in the marker if available. | Branch content appears exactly once in the paginated layout, with a continuation marker if needed; marker says "code anchor lost" or "ambiguous"; a short code excerpt is shown. | Branch content appears exactly once in the paginated layout, with a continuation marker if needed; missing asset shows a labeled placeholder; marker says "image anchor lost." |
| **No silent data loss** | Preserve anchor ID, selector, branch, and target; invalid LaTeX source is retained. | Preserve anchor ID, selector, branch, and target; offsets and quote are retained. | Preserve anchor ID, asset hash, normalized region, branch, and target; original asset is not deleted. |

Policy:

- Detection runs on the triggers in §8.4. A broken or ambiguous anchor is never deleted automatically, and its branch target is never deleted by anchor repair.
- High-confidence exact bindings may resolve silently. Ambiguous matches, changed image assets, and any reattachment require explicit user confirmation.
- Reattachment shows a before/after preview and is undoable. It keeps the anchor ID and branch IDs.
- Export must include every branch exactly once in the paginated layout, with a continuation marker if it crosses a page. A broken or ambiguous anchor gets a visible marker and, optionally, an entry in the anchor appendix; it is never omitted.
- **Formula:** whole-formula anchors are precise. Term anchors store the exact LaTeX substring and occurrence; rendering geometry is best-effort, with the formula rectangle and a term label as the fallback. Invalid LaTeX is preserved as source.
- **Code:** the quote and context are the durable selector; offsets are a hint. Changing the code language does not break the anchor. Replacing the code content or removing the quote marks it broken or ambiguous.
- **Image:** the normalized region is relative to the intrinsic image. Resizing the display is safe. Replacing the asset, changing the crop, or losing the asset marks the anchor broken or requires confirmation, because the old region may no longer mean the same thing.
- A broken or ambiguous anchor falls back to the whole block for its visual origin, shows a visible marker, and offers a repair dialog. The fallback is not a source change: repairing the anchor restores the span; the branch and target stay intact.
- An anchored child that does not fit below its anchor in the paginated layout gets a continuation marker on the next page. No auto-move or arbitrary placement.
- **D5 is closed.** All four anchor kinds are in v1; exact unique bindings may auto-resolve; ambiguous reattachment requires confirmation; broken anchors never delete branches; export includes every branch exactly once. Formula-term geometry is best-effort; whole-formula anchors are precise.

Acceptance criteria for this policy are AC-54 through AC-57.

---

## 9. Content model

### 9.1 Requirements

The content model MUST support:

- rich text with paragraphs, headings, emphasis, strong text, inline code, links, blockquotes, horizontal rules, and hard breaks;
- bullet and ordered lists, including nesting;
- code blocks with a language hint and plain-text code;
- inline math and display math with LaTeX source;
- images with alt text, optional caption, intrinsic dimensions, and asset references;
- tables (SHOULD; no anchors spanning cells in v1);
- inline anchor marks with stable IDs;
- Unicode text, IME composition, paste, and drag/drop;
- no executable HTML, scripts, or remote content;
- round-trip-safe storage of unknown nodes for forward compatibility.

The authoring experience SHOULD feel Markdown-like: typing `#`, `-`, `**`, backticks, `$...$`, and fenced code blocks should create the corresponding structure. This does not require Markdown to be the storage format.

### 9.2 Node types

| Node / mark | Purpose |
|---|---|
| Paragraph | Body text. |
| Heading | Visual heading inside a block. Not structural; branches define structure. |
| Text | Plain text run. |
| Emphasis / strong / inline code / link | Inline marks. |
| Bullet list / ordered list / list item | Lists and nesting. |
| Blockquote | Quoted material. |
| Code block | Plain text code with a language hint. |
| Inline math | LaTeX rendered inline. |
| Display math | LaTeX rendered as a block. |
| Image | Asset reference, alt text, optional caption. |
| Table | Rows and cells; SHOULD for v1. A row is atomic for pagination. |
| Horizontal rule | Visual separator. |
| Hard break | Explicit line break. |
| Anchor mark | Inline binding carrying `anchorId`. |

### 9.3 Authoring behavior

- Markdown-like input shortcuts create the corresponding nodes; the user does not have to type raw Markdown to get rich content.
- Pasting Markdown SHOULD convert common syntax; unsupported syntax is preserved as plain text.
- Pasting an image copies it into the package and inserts an image node. Pasting a URL creates a link; it does not fetch a remote image.
- Invalid LaTeX is stored as source and rendered with a visible error. The user can edit the source; the app never drops the formula.
- Code blocks do not execute. Language hints affect highlighting only.
- Tables are editable; anchors inside tables are text ranges, but an anchor spanning cells is rejected in v1. A table may break across pages only between rows; a row and its cells are never split.
- Empty blocks are allowed. They are valid authoring state and are not silently deleted.

### 9.4 Option A — Markdown-canonical

**Description.** Each block's content is stored as Markdown source, or the document is a set of Markdown files. Anchors use a custom inline syntax or a sidecar record; branches, page setup, and pagination hints live in a sidecar JSON or in frontmatter.

**Strengths:**

- human-readable and inspectable;
- git-friendly and diffable;
- portable to Obsidian, Logseq, and plain-text tools;
- easy external editing and scripting;
- export is nearly free.

**Weaknesses:**

- WYSIWYG editing over Markdown is lossy for syntax variants, escaping, and formatting; a round-trip can change the user's text.
- Stable inline anchor IDs require custom syntax that is not standard Markdown; external editors may strip or mangle it.
- Branches, page setup, and pagination hints cannot be represented cleanly in Markdown; they need a sidecar, so Markdown is not the sole source of truth.
- Formulas, code fences, images, tables, and nested lists all have edge cases; parsing and serializing correctly is a large project.
- Raw offsets into Markdown are fragile under edits; anchor marks in raw text are awkward to render.
- A user editing the Markdown outside the app can break anchors and structure.

### 9.5 Option B — Structured JSON canonical

**Description.** Block content is a structured rich-text tree with stable node identities and inline marks. Anchors are marks or node attributes; branches, chapters, page setup, and assets are first-class fields in the same document. Markdown is an export/import format.

**Strengths:**

- stable anchor marks move with edits;
- schema validation and migrations are tractable;
- branches, anchors, chapters, and content share one versioned document;
- editor rendering and PDF rendering can share the same content model;
- no dual source of truth;
- forward-compatible with unknown nodes and fields.

**Weaknesses:**

- less human-readable than Markdown;
- not directly editable in external tools;
- requires a documented export path to avoid lock-in;
- JSON diffs are noisy;
- the schema is a long-term commitment and must be versioned carefully.

### 9.6 Comparison

| Criterion | Markdown-canonical | Structured JSON-canonical |
|---|---|---|
| Anchor stability | Weak without custom syntax; raw offsets fragile | Strong; marks/nodes move with edits |
| WYSIWYG fidelity | Lossy round-trip risk | Native |
| Branches/page setup | Sidecar needed; split source of truth | First-class fields |
| Portability | Excellent for text, poor for structure | Requires export; documented schema |
| External editing | Easy, but can break anchors | Not intended |
| Git diffs | Good for text | Noisy, but inspectable |
| Schema/migrations | Markdown variants and sidecar versions | One versioned document |
| Implementation risk | High for editor/anchors | High for editor, lower for model |
| PDF fidelity | Requires parsing/rendering Markdown | Direct render from the content tree |

### 9.7 Decision and adapter

**Decided: Option B, structured JSON/ProseMirror JSON canonical, with Markdown import/export.** The product owner delegated the choice; `AGENTS.md` records it. D1 is closed.

Rationale: the product's differentiator is anchored branches. Anchors need stable inline identity; branches, chapters, and anchors need one canonical home; and the page PDF needs a reliable content tree.

**Adapter requirement.** The content layer MUST keep a narrow adapter between the canonical document and the editor/rendering representation. The adapter exists so the content representation can be revisited after the prototype without rewriting branches, anchors, chapters, or persistence. The adapter must not become a second canonical source.

Markdown remains import/export only. Do not store Markdown as the live document and do not keep a live Markdown mirror. If the team later revisits the content model, it must be a versioned migration, not a silent format change.

### 9.8 Block granularity (D2, closed)

**Decided: a block is a rich body, not a single content node.** A block may contain several paragraphs, a list, a code block, a formula, an image, and a table. It is the unit of branching, identity, and layout.

Why: the product describes blocks that hold Markdown, LaTeX, code, images, and lists together. A single-node block would force a definition and its formula into separate blocks, fragmenting the page and the outline. A rich body keeps a study idea together.

Implications:

- block height can be large and may exceed an A4 page; it may continue at a safe internal boundary, or report a pagination defect if no safe boundary exists;
- the UI should encourage focused blocks, but no hard character limit is imposed in v1;
- anchors can target any node inside the body;
- a code block or formula can be a node inside a block, not necessarily a separate block;
- a table is a node inside a block; its rows are the only safe break points inside it.

D2 is closed. Single-node blocks are not the v1 model; switching later would be a versioned content migration and a layout change, not a silent default.

### 9.9 Export and import expectations

- **Markdown export (post-v1):** outline order; blocks separated by headings or blank lines; page-break markers as comments/separators; anchored branches rendered as footnotes/callouts with their anchor quote; reference edges as links or a "See also" list; frontmatter with title and schema version; assets in a relative folder. Page setup, derived page numbers, and exact anchor geometry are lost. Do not promise round-trip fidelity.
- **Markdown import (post-v1):** headings/paragraphs/lists/code/math/images become blocks or nodes; no anchors or branches are reconstructed from plain Markdown; imported blocks get new IDs. Report lossy conversions.
- **JSON Canvas export (post-v1):** nodes are blocks, edges are branches; anchors are not representable and become block-level edges with a warning. Treat as map interchange, not the document format.
- **JSON Canvas import (post-v1):** nodes become blocks, edges become reference edges by default; no anchors; canvas x/y is ignored, and imported nodes are placed in a deterministic tree, never as free positions or pins.
- **HTML export:** not required. PDF is the print format.

### 9.10 Content limits and safety

- No hard block size limit in v1; the UI SHOULD warn above a large threshold (for example, 50,000 characters) because layout and editing may degrade.
- Images: PNG, JPEG, WebP, and GIF (first frame for PDF) are supported. SVG is not required in v1; if added, it must be sanitized.
- Math: a KaTeX-compatible LaTeX subset is the target. Unsupported commands render an error, not a crash.
- Code: plain text only; no execution, no embedded outputs, no Jupyter-style state.
- Tables: SHOULD; anchors may target text inside a cell but not span cells. Page breaks occur only between rows; a row taller than the page is a pagination defect.
- Raw HTML: never executed. HTML-like input is escaped or treated as text.
- Links: sanitized; external links open outside the document; `javascript:` and similar schemes are rejected.
- Remote content: not loaded into the document; images are local assets.

---

## 10. Persistence

### 10.1 Document package

A note document is a folder the user chooses, containing one canonical JSON file and an assets folder:

```text
<user-chosen-folder>/
  document.json        # canonical document: chapters, top-level blocks, blocks, anchors, branches, pageSetup, break hints, schemaVersion
  assets/
    <content-hash>.<ext>
```

- `document.json` is the canonical source; `assets/` holds content-addressed files. There is no mandatory manifest, database, or sidecar.
- Backups, exports, and audit logs are app-managed and live outside the canonical package. They are not required to open the document.
- All paths inside the document are relative to the package. Absolute paths are forbidden.
- Assets are content-addressed and deduplicated. The original filename is metadata only.
- A zip bundle MAY be offered for sharing; the folder remains the working format.
- User note documents are standard files in a user-chosen folder. They are **not stored in git**; git is for code and project docs only.

### 10.2 Canonical and derived data

**Canonical:** page setup, manual break hints, chapters, top-level block order, blocks, anchors, branches, assets, schema version, title, timestamps, monotonic revision.

**Derived:** search index, thumbnails, continuous layout geometry, derived pages and continuations, PDF and Markdown exports, page/block labels for PDF.

**Non-canonical view state:** last mode, current derived page, zoom, scroll, focus, collapse, page selection.

There MUST NOT be two canonical sources. Derived data may be rebuilt. View state may be discarded.

### 10.3 Save and autosave

- Autosave after a short idle debounce (for example, 1 second), with a maximum interval during continuous editing (for example, 5 seconds).
- Atomic save: write a temporary file in the same directory, flush it, then rename over the old file. Keep the previous file as a backup.
- Save on window close, app quit, and explicit save. If save fails, do not close silently; show a blocking, actionable prompt.
- The save status is visible: saved, saving, unsaved changes, save failed.
- Saving a large document must not block typing; asset writes may be asynchronous, but the document JSON write must be atomic and ordered.
- Autosave does not create undo entries and does not change the user's selection.

### 10.4 Backups and recovery

**Backup rotation (v1 defaults).**

| Backup | Trigger | Retention | Contents |
|---|---|---|---|
| **Autosave snapshot** | Before each successful atomic save, after the previous version is secured. | Last 20. | `document.json` only; assets are shared by content hash. |
| **Daily snapshot** | First save of the day. | Last 7 days. | Same. |
| **Pre-migration snapshot** | Immediately before a migration. | Until a post-migration save succeeds and at least 7 days, whichever is longer. | Same. |
| **Pre-repair snapshot** | Before a destructive repair or bulk delete. | At least 7 days. | Same. |
| **Manual backup** | User command. | Until deleted. | Same. |

- Backups are app-managed and are not part of the canonical document. The UI can reveal them in the file manager.
- Assets are content-addressed and shared, so JSON snapshots do not duplicate image data.
- Never delete the last known-good backup. Retention is configurable, but v1 defaults must keep at least 10 versions.
- Back up before a migration and before a destructive repair.
- Crash recovery order: validate the newest temporary file, then the newest valid backup, then the canonical file. Show timestamp, block count, and a short preview; never auto-open a recovery candidate.
- If a crash leaves a temporary file newer than the canonical file, offer: "Restore autosave," "Open last backup," "Open canonical file."
- Recovery must never overwrite the last good file without confirmation. Restoring should write a new copy or require an explicit overwrite.
- Backups are not a user-facing version history in v1 (D11); they are a safety net.

### 10.5 Load and validation

On open:

1. Read `document.json`. Malformed JSON is a fatal load error with a recovery path.
2. Validate the schema version and run migrations if needed.
3. Validate the schema shape and the invariants in §4.10.
4. Resolve anchors and assets.
5. Rebuild derived indexes and compute the continuous layout and pagination.

**Error classes:**

- **Fatal:** malformed JSON, duplicate IDs, missing block references, primary cycles, multiple primary parents. Open in recovery/read-only mode, show a report, offer backup/raw export. Never overwrite.
- **Repairable with warning:** missing top-level block assignment, block in no chapter, top-level block in two chapters, stale view state, missing asset, broken anchor, duplicate branch order, invalid manual break hint. Apply safe repairs (add missing top-level block to a chapter, drop stale view state, placeholder asset, drop invalid hint) and mark the document dirty; structural repairs require user confirmation.
- **Forward-compatible:** unknown fields, unknown node types, newer optional fields. Preserve them; render a placeholder for unsupported content.

Safe automatic repairs are limited to visibility and non-destructive cleanup. Cycles, duplicate primary parents, and duplicate IDs are never auto-fixed.

### 10.6 Schema versioning and migrations

- `schemaVersion` is an integer, starting at 1.
- Migrations are pure, ordered functions from version N to N+1. Old migration code is never edited.
- Keep unknown fields when reading and writing.
- Back up before migrating. Migrate into memory, validate, then write atomically. If migration fails, restore the backup and open read-only.
- A file written by a newer app version opens read-only with a clear message. Never downgrade silently.
- Test fixtures for every schema version that has existed, plus an "old app opens new file" test.
- If the content model evolves independently, a separate content-schema version MAY be added; it must still migrate within the document version.

**Migration matrix (minimum).**

| From → To | Fixture | Backup | Validation | Failure behavior |
|---|---|---|---|---|
| v1 → v1 (current) | Current golden document. | Normal autosave. | Full schema and invariants. | Open read-only; no overwrite. |
| v1 → v2 | Golden v1 document. | Required. | Full after migration. | Restore backup; open read-only. |
| vN → vN+1 | One golden fixture for every prior version. | Required. | Full after each step; run migrations in order. | Restore backup; report the failing step. |
| vN+1 → vN (newer file) | Newer-version fixture. | None. | Read-only load; no migration. | Clear "newer version" message; no write. |
| Unknown fields → current | Fixture with unknown fields at every level. | Required. | Unknown data preserved. | Restore backup if preservation fails. |
| Unknown nodes/marks → current | Fixture with unknown content nodes and marks. | Required. | Preserve and render placeholders. | Restore backup if data would be dropped. |
| Broken anchor / missing asset → current | Fixture with both. | Required. | Load with warnings; no data loss. | Open with warnings; repair later. |
| Injected migration failure | Fixture plus a forced failure. | Required. | Detect failure; do not write partial output. | Restore backup; open read-only. |
| Content-schema version change (if added) | Separate fixture for each content-schema version. | Required. | Content and document both validate. | Restore backup; open read-only. |

No migration ships without a golden fixture for every prior version and a failure-path test. The matrix is part of the persistence acceptance gate (AC-59).

### 10.7 Unknown fields and content

- Unknown JSON fields at every level (document, pageSetup, chapter, top-level order, block, anchor, branch, asset, annotation) are preserved on save.
- Unknown content node types are preserved and rendered as an "unsupported content" placeholder; they are not dropped.
- Unknown inline marks are preserved; anchors inside unknown content may be broken and require repair.
- Unknown annotation data is preserved even though v1 does not render it.
- A migration must not discard unknown data unless the user explicitly chooses a lossy conversion.
- A load/save round-trip with unknown fields and unknown content must not drop them; persistence tests assert this explicitly.

### 10.8 Assets

- Copy assets into the package on import; deduplicate by content hash.
- Store MIME, byte size, intrinsic dimensions, alt text, and original filename.
- Never store absolute paths or remote URLs as canonical.
- If an asset is missing, show a placeholder with its alt text or filename, keep the reference, and warn. Do not delete the image node or any anchors that depend on it.
- Garbage collection of unreferenced assets is deferred in v1. If added, it must run only after a backup and a grace period, and never delete an asset referenced by a block, anchor, annotation, retained backup, or export in progress.
- Large images may be downsampled for display and PDF, but the original asset is preserved unless the user explicitly replaces it.

### 10.9 Privacy and security

- Local-only by default: no telemetry, no analytics, no outbound network requests, no cloud sync. The external API binds to loopback only and is off unless the user enables it.
- No secrets in the document package. API tokens are stored hashed outside the document.
- Raw HTML, scripts, and remote content are never executed.
- Links are sanitized; external links open outside the document.
- The document package is readable JSON plus standard asset formats; the user can inspect and back it up without the app.
- File permissions follow the OS user's normal document permissions; the app does not add encryption in v1.

### 10.10 Concurrency and external edits

- v1 is single-user. Do not implement CRDTs, merge, or multi-device sync.
- Enforce a single instance per document package; opening it again focuses the existing window or opens read-only.
- The external API uses `baseRevision` plus a single-writer/lock policy; two writers must not corrupt the file (D18 closed: OS advisory lock + lock file, one writer, concurrent readers).
- Detect external modification by comparing the file's modification time and/or content hash before saving. If it changed, prompt: reload, overwrite, or save a copy. Never silently overwrite.
- If two windows somehow open the same package, the second is read-only and says so.
- A future sync or collaboration feature requires a separate ADR and a CRDT or equivalent design; it is not retrofitted into this model by assumption.

### 10.11 Failure behavior

| Failure | Required behavior |
|---|---|
| Disk full | Stop autosave, keep the document editable in memory, show a persistent banner, do not write a partial file. |
| Permission denied | Same as disk full; offer Save As to a writable location. |
| Crash during save | Leave the old file intact; recover from temp or backup on next open. |
| Corrupt JSON | Open recovery/read-only; never overwrite; offer backup and raw export. |
| Newer schema | Open read-only; explain; do not downgrade. |
| Missing asset | Placeholder; keep reference; warn. |
| Duplicate IDs | Fatal recovery; report the duplicate IDs; do not auto-rename. |
| External modification | Prompt before writing; default to the safest option. |

---

## 11. PDF export

### 11.1 Goals and non-goals

**Goals:**

- produce a page-based PDF with real, selectable text;
- use the same paginator as the reader/page views, so the PDF matches what the user sees;
- preserve every block exactly once, including shared children;
- keep anchored branches below their anchors, with continuation/ghost-parent markers when a branch crosses a page;
- break between blocks first; allow a long block to continue only at safe internal boundaries;
- never cut a text line, image, formula, table row, or code line;
- respect A4 portrait/landscape and document margins.

**Non-goals:**

- a separate linear reader PDF in v1; the reader view is an editor view, not an export;
- a spatial map page or poster export;
- a screenshot of the page view;
- interactive forms, embedded audio/video, or encryption;
- a tagged/PDF-UA document in v1;
- the future annotation/study layer.

### 11.2 Export mode

v1 has one export mode: **Page PDF**. It exports every derived page of the document, in reading order, using the same paginator and page setup as the page view.

There is no "reader PDF," "annotation-margin reader," or "map page" mode in v1. Those are future options and must not be implied by the export UI.

### 11.3 Page setup and print theme

| Setting | Value |
|---|---|
| Page size | A4 only: 210 × 297 mm portrait, 297 × 210 mm landscape. |
| Orientation | From `pageSetup.orientation`; document-wide in v1. |
| Margins | From `pageSetup.margins`; default 20 mm on all sides. |
| Header | Document title left, chapter/page label right (8 pt, subdued). |
| Footer | Page number centered: "Page X of Y". |
| Body text | 10.5 pt, 1.45 line height; print theme, not screen theme. |
| Code | 9 pt monospace; preserve indentation. |
| Headings | 16/13/11 pt hierarchy; block labels may act as headings. |
| Background | White; no dark mode, no shadows; block borders only if enabled, at a subtle weight. |

The print theme is separate from the screen theme. The page view and the PDF MUST use the same typography metrics for measurement and pagination; the screen may change colors, borders, and non-metric decoration, but it must not change the font metrics used for page breaks. The reader may use a screen theme, but its page-break markers must use the same pagination metrics as the page view and PDF, or be labeled as advisory.

### 11.4 Pagination and page count

- The PDF uses the paginator described in §7.5. Page count equals the derived page count.
- The PDF prefers breaks between blocks. A long block may continue at a safe internal boundary (paragraph, list item, blockquote paragraph, between code lines, or between table rows), with "continues on page N" on the source page and "continued from page M" plus a ghost parent on the target page.
- The PDF MUST NOT cut a text line, image, formula, table row, or code line. If no safe boundary exists, export is blocked with a clear "no safe page break" error; the user splits the block or changes page setup.
- A table row is atomic. The PDF breaks a table only between rows, never inside a row or cell. A row taller than the page content height blocks export with a "no safe page break" error rather than cutting it. Header-row repetition is not required in v1.
- A lower-level block that continues on the next page gets the same continuation and ghost-parent markers as the page view.
- Manual page-break hints are honored where the paginator honors them in the page view; the PDF must not diverge.
- Each chapter starts on a new derived page.
- Avoid blank pages. A page with no content and only a header/footer is a defect unless it is the intentional title page.
- Page numbers and running headers are generated after pagination. Export is deterministic for the same document, page setup, hints, and font state.
- If the document has no blocks, export is disabled with a message; it never produces a blank PDF.

### 11.5 Content order and layout fidelity

- The PDF renders the same continuous layout as the reader/page views: top-level blocks stacked, adaptive children to the right or wrapped below, anchored branches below their anchors.
- Every block appears exactly once. A shared child appears at its primary home; reference edges are drawn as vector arrows, not repeated content.
- Primary edges are solid arrows; reference edges are dashed or otherwise distinct. Cross-page primary edges use continuation markers at the page boundary.
- Block cards, labels, formulas, code, images, and block borders use the print theme but keep their computed positions and sizes.
- PDF export includes all document content, not the current collapse state. There is no "export visible only" option in v1 (Q13).
- The PDF is not a screenshot. Text, arrows, and borders are vector/text where the PDF pipeline supports it.

### 11.6 Text layer, fonts, formulas, and links

- Body text, labels, code, and table text MUST be real text and selectable/searchable.
- Fonts MUST be embedded or subset; missing glyphs are a defect. Test `λ`, `∑`, arrows, code ligatures, and non-Latin content.
- Formulas MUST be visually correct. Their text layer is best-effort: simple formulas may extract, complex layout may not. Do not claim that all formulas are searchable.
- Images MUST be embedded at sufficient resolution (target 150–200 DPI for print; never upscale beyond the source). Alt text is preserved in metadata where the PDF pipeline supports it.
- Internal "see also" references have a text label with the target page; clickable internal links are SHOULD where the PDF pipeline supports them.
- External links are preserved where possible; the text label is the fallback.
- No missing-glyph boxes (`�`) and no clipped content are acceptable.

### 11.7 Arrows, borders, and the study layer

- All page arrows are vector: primary solid, reference dashed, anchored edges starting at an anchor dot or region. Arrowheads are vector.
- Block borders follow the print theme: subtle if enabled, absent if not; no shadows.
- The future study layer has an "Include study layer" toggle. In v1 the layer is empty and the toggle is hidden or disabled. When implemented, the content-only export must remain possible.

### 11.8 Fidelity expectations

| Aspect | Expectation |
|---|---|
| Content | High: every block's content appears once, correctly rendered. |
| Reading order | Exact: same as the paginator and page view. |
| Spatial layout | High: same continuous layout and page breaks as the page view, within print typography. |
| Text layer | Body/code/labels: required. Formulas: best-effort. Images: alt text where supported. |
| Formulas | Visually correct; no clipping; no missing glyphs; source preserved in the document. |
| Images | Embedded at print resolution; missing assets render a labeled placeholder. |
| Links | Text labels required; clickable links best-effort. |
| Annotations | Not in v1. |
| Page count | Deterministic for the same document, page setup, hints, and font state, excluding timestamps. |

### 11.9 File name and metadata

- Default file name: `<document title> — <YYYY-MM-DD>.pdf`, sanitized for the filesystem.
- Metadata: title, subject (optional), creator/app version, page size, creation date.
- Do not put sensitive local paths in PDF metadata.
- Export writes to a temporary file and renames on success; a failed export does not leave a partial PDF in place.

### 11.10 Verification

Automated checks (where the toolchain allows):

- extract text and assert that every block's plain text is present, allowing line-break normalization;
- count PDF pages and assert they equal the paginator's derived page count;
- assert no text line, image, formula, table row, or code line is cut; a long block may continue at a safe boundary with continuation/ghost-parent markers;
- assert every block appears exactly once (shared children once);
- assert continuation markers exist where the paginator reports continuations;
- assert no unexpected blank page;
- assert no `�` or missing-glyph markers;
- assert image count and that missing assets have placeholders;
- check page size, orientation, and margins against `pageSetup`;
- assert the PDF page-view geometry matches the page view's computed geometry within the print-theme tolerance.

Manual checks:

- open in Preview and Chrome, select and highlight body text, search for a term; app-specific annotation apps are out of scope for the export gate;
- verify formulas and code are readable;
- verify pages match the page view, including breaks and continuations;
- verify a broken anchor produces a marker without losing the branch;
- verify no text line, image, formula, table row, or code line is cut; verify continuation/ghost markers where expected.

### 11.11 PDF out of scope

- Separate reader PDF, annotation-margin reader, or map pages.
- Screenshot/poster export of the page view.
- Freehand ink or annotation authoring in the PDF.
- Tagged PDF/PDF-UA compliance.
- Interactive forms, embedded media, encryption, or digital signatures.
- Pixel-identical screen colors or browser chrome.

### 11.12 PDF pipeline (decided)

The PDF pipeline is **decided (ADR-0002): Electron `webContents.printToPDF`, driven by the shared paginator.**

- `packages/layout` computes the continuous layout and the derived pages. The paginator is the only component that decides page breaks.
- A print-only renderer composes the *already-derived* pages at exact A4 dimensions, in print theme, with one fixed-size page container per derived page. It never lets CSS paged media re-paginate and it never decides breaks.
- `printToPDF` runs with `preferCSSPageSize`, explicit `@page` size/margins, `printBackground`, no scale, embedded fonts, and a settled document (fonts, images, KaTeX, layout measurement) before capture.
- Hard gate before PDF is considered done: a 50+ page A4 spike with real selectable text, page numbers, repeated headers, no cut line/image/formula/code line/table row, page count equal to the paginator, and geometry matching the page view within print-theme tolerance.
- If `printToPDF` fails the gate, the fallback is a new ADR, not a silent switch. Candidates: Chromium CDP `Page.printToPDF` from the same engine; a native PDF compositor (PDFKit) drawing the same page slices. Typst is not a drop-in for WYSIWYG page export because it would be a second layout engine.

---

## 12. External Agent API

### 12.1 Principles

- **External API, no in-app panel.** V1 exposes a local-only API for external agents and tools. It does not ship an in-app chat/agent panel.
- **One command API.** Every mutation—from the UI or an external agent—goes through the same typed command layer. No client writes `document.json` directly.
- **Same validation, same undo.** UI and API commands share preconditions, invariants, undo/redo, and audit logging. An external client cannot bypass a rule by editing JSON.
- **Local-only.** The API binds to loopback and is disabled unless the user enables it and issues a token. No remote access, no cloud relay.
- **No background autonomy, no web access.** The app does not run agent turns, watch the document, or browse the web. The external client decides when to call; the app only serves requests.
- **Destructive actions require explicit confirmation.** Delete, merge, delete-subtree, chapter deletion, and irreversible page-setup changes require a separate confirmation parameter and audit entry.
- **Dry-run where practical.** Mutating commands support validation/diff without applying, so an external agent can propose before it writes.

### 12.2 Command API

Every mutation is a serializable command with this envelope:

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique command ID. |
| `type` | yes | Versioned command type, for example `block.create`, `block.edit`, `branch.create`, `anchor.repair`. |
| `version` | yes | Command schema version. |
| `actor` | yes | `user` or `external`; external commands carry a token/client ID. |
| `documentId` | yes | Target document. |
| `baseRevision` | yes | Document revision the command was prepared against. Apply fails if the document has moved and the command cannot be rebased safely. |
| `context` | yes | Chapter, block, anchor, selection, or range the command targets. |
| `args` | yes | Typed command arguments. |
| `scopes` | yes | Required scopes, for example `read`, `write`, `export`, `destructive`, `audit`. |
| `idempotencyKey` | no | Prevents duplicate apply of the same request. |
| `dryRun` | no | Validate and return a diff without mutating. |

Command behavior:

- A command validates type, arguments, preconditions, scopes, and document revision before mutation.
- It returns a typed result: created/updated IDs, a human-readable diff, a new revision, an undo token, and an audit ID.
- A batch of commands is a transaction. Apply is all-or-nothing; failure leaves the document unchanged.
- Every mutating command has an inverse for undo/redo. Multi-step operations are grouped into one transaction.
- Read operations are separate typed queries (`document.open`, `document.read`, `block.read`, `search`, `layout.snapshot`); they never mutate.
- Stale commands fail with a rebase/refresh error; they never apply against a changed document silently.

### 12.3 Command catalog (v1 minimum)

| Category | Commands |
|---|---|
| **Document** | open, read, search, export PDF; get layout/pagination snapshot |
| **Chapter** | create, rename, reorder, delete (destructive) |
| **Block** | create top-level/child/sibling, edit content/label, split, merge, delete (promote/subtree), duplicate subtree |
| **Branch** | create from block, create from anchor, delete, make home, move here, promote/demote, reorder sibling/top-level |
| **Anchor** | create, create branch from anchor, repair/relink, attach branches to block, delete |
| **Page setup** | change orientation/margins, add/remove page-break hints |
| **Undo/audit** | undo, redo, read audit log |

The catalog is intentionally complete for v1 mutations. A new mutation requires a typed command, an inverse, a scope, and an audit entry; it must not be added as an ad-hoc JSON edit.

### 12.4 Transport

- **Local HTTP JSON API** on loopback, plus an **MCP adapter** that maps MCP tools to the same commands and queries. This is the decided shape (D16 closed): HTTP is the primitive, MCP is an adapter.
- HTTP and MCP share one command implementation; neither has a privileged path.
- The server is off by default. The user enables it, chooses a port (or accepts an ephemeral localhost port), and issues/revokes tokens.
- No remote bind, no TLS termination requirement for loopback, no cloud relay, no webhook egress. Reject non-loopback `Host` headers and browser cross-origin requests; mutating requests require the bearer token and a JSON content type.
- Long-running operations (PDF export, large search) return a job ID with status; the API must not block indefinitely.

### 12.5 Authentication, scopes, and confirmation (decided)

- Bearer-token authentication; tokens are generated by the app, **shown once**, stored **hashed** (with a short display prefix for identification), and **revocable**. Revocation is immediate.
- **Document-scoped tokens (D17 closed).** Each token names exactly one document in v1; there is no library-wide token and no implicit "all documents" access. To work on another document, the user issues another token. The token's document ID is enforced server-side on every request.
- Scopes: `read`, `write`, `export`, `destructive`, `audit`. `read` permits queries; `write` permits non-destructive mutations; `export` permits PDF; `destructive` permits delete/merge/chapter deletion and requires an explicit `confirm` field naming the affected IDs; `audit` permits reading the audit log.
- A write token cannot grant itself `destructive`; escalation requires a new token issued by the user. A token cannot widen its document scope.
- Every destructive request without an explicit confirmation fails with a typed error and no mutation.
- Tokens and API access are local-only; no token is stored in the document package or git.
- Token lifetime: long-lived by default with explicit revocation; optional expiry is a future addition, not required in v1.

### 12.6 Audit logging, undo/redo, and concurrency

- Every API request (read, write, dry-run, export, failure) gets an audit entry: timestamp, token/client ID, command, document, base revision, result, affected IDs, and duration.
- Audit logs are append-only and app-managed; they are not part of the document package. Retention is configurable.
- Undo/redo is available through the API with `write` scope and uses the same session stack as the UI. API undo names a `transactionId`; it succeeds only if that transaction is still the top undoable entry, otherwise it fails with `undo_unavailable`. The API never undoes across a document reload. Undo restores the prior document state and writes an audit entry.
- `baseRevision` prevents lost updates. A stale command fails with `409 revision_conflict`; the client must re-read and retry.
- **Single-writer lock (D18 closed).** Each open document has one writer: the app instance that opened it holds a lock (an OS advisory lock plus a lock file with PID/host/session metadata). Concurrent readers are allowed. A second process that opens the document is read-only and says so; it cannot acquire the write lock. The lock is released on close, crash recovery, or explicit "take over" by the user in the app.
- The external API never acquires the lock independently: it routes writes to the open app instance. If no instance has the document open, write commands fail with `document_not_open`; the app does not spawn a headless writer in v1.
- External file edits are detected as in §10.10; an open API writer must not overwrite silently. On conflict, writes are blocked until the user resolves reload/overwrite/save-copy.

### 12.7 Dry-run, proposal, and apply

- Mutating commands support `dryRun: true` where practical: validate, return the diff, affected IDs, and any pagination/layout impact without writing.
- A dry-run is not a reservation; the document may change before apply.
- Apply uses the same typed command batch and `baseRevision`; stale dry-runs fail safely.
- Destructive dry-runs return the exact delete/merge list; apply requires `confirm` with those IDs.
- There is no autonomous apply loop in the app. The external client decides when to call apply; the app never polls or retries on its own.

### 12.8 Safety and privacy

- The API is loopback-only and off by default. No web access, no outbound requests, no telemetry.
- The app does not execute document text as instructions. API requests are typed commands with scopes and confirmation, not natural-language authority.
- No shell, filesystem, or arbitrary network tool is exposed. PDF export writes only to the configured export location.
- Audit logs and tokens must not leak into the document package, git, or PDF metadata.
- A compromised token is revocable without changing the document; audit entries identify its use.

### 12.9 Decisions (closed)

| ID | Decision | Resolution |
|---|---|---|
| **D16** | API shape. | **Closed:** HTTP JSON is the primitive; the MCP adapter maps to the same commands. Neither is privileged. |
| **D17** | Auth and scope granularity. | **Closed:** bearer token, shown once, stored hashed, revocable; document-scoped in v1; scopes `read`/`write`/`export`/`destructive`/`audit`. |
| **D18** | Concurrency and file locking. | **Closed:** single writer per document (OS advisory lock + lock file), concurrent readers, monotonic `baseRevision`, stale writes fail; API routes through the open app instance. |
| **D19** | Command surface. | **Closed:** v1 exposes the semantic command catalog in §12.3, not raw JSON patches. Low-level primitives stay internal and are composed into semantic commands. |
| **D20** | PDF export API behavior. | **Closed:** `export.pdf` is job-based (job ID + status), output path is explicit, overwrite requires a flag; small exports usually finish before the first poll. |

The full rationale and consequences are in `docs/adr/0003-external-agent-api.md`.

### 12.10 API acceptance

API acceptance criteria are AC-70 through AC-74 in §15.18. They cover the typed command API, local transport, auth/scopes, audit/undo, dry-run/confirmation, and no background/web behavior.

---

## 13. Edge cases

### 13.1 Structure and model

| Case | Required behavior |
|---|---|
| Attempt to create a second primary incoming branch | Reject, or create a reference / explicit reparent. Never two primary parents. |
| Reparent a block into its own descendant | Reject before mutation; explain that it would create a primary cycle. |
| Reference cycle | Allow; render arrows; outline and PDF do not recurse; no infinite loop. |
| Self-branch | Reject for both roles. |
| Duplicate exact source-target branch | Focus the existing branch; do not create a second. |
| Block with no primary parent missing from the chapter top-level list | Append it as a top-level block with a warning; make it visible. |
| Non-root block present in the chapter top-level list | Remove it from the top-level list with a warning; keep its primary parent. |
| Block unreachable because of a cycle or corruption | Recovery mode; list it; do not silently drop it. |
| Delete a block with external reference parents | Confirm and list them; remove the incoming references; no dangling edges. |
| Delete a primary branch | Target becomes a root and a top-level block after the former top-level block; subtree, anchors, and outgoing branches stay. |
| Shared child primary-role change | "Make home" swaps primary/reference; "move here" deletes the old primary; target moves once. |
| Block assigned to two chapters | Fatal recovery; user chooses one chapter; never duplicate. |
| Duplicate IDs | Fatal recovery; report; no automatic rename; no overwrite. |
| Unknown field or content node | Preserve; render a placeholder for unsupported content. |
| Empty block | Allowed; persists; visible; not auto-deleted. |

### 13.2 Anchors

| Case | Required behavior |
|---|---|
| Anchored text deleted | Anchor becomes broken; branch and target remain; repair UI. |
| Block split inside an anchor | Clip to the original side; mark for repair; never discard. |
| Anchor block merged | Move the anchor to the surviving block; update `blockId`; keep the branch. |
| Anchor at a block boundary or multiple anchors overlapping | Allow; order by start position then ID; keep deterministic. |
| Code edit shifts offsets | Re-resolve by quote/context; ambiguous if multiple candidates; broken if none. |
| Formula invalid after edit | Preserve source; show error; anchor the whole formula if the term cannot resolve. |
| Image replaced or missing | Anchor broken; branch remains; placeholder; asset hash mismatch recorded. |
| Broken anchor | Branch remains; visual origin falls back to the whole block; marker + repair dialog; export uses the fallback; no silent loss. |
| Anchor mark duplicated or missing | Validation/broken state; repair; no phantom branch. |
| Branch source anchor deleted with block | Delete the branch with the block; no dangling source. |
| Branch target missing | Quarantine the branch; show a load warning; repair or delete. |
| Multi-block selection | Reject in v1 with a clear message. |

### 13.3 Layout

| Case | Required behavior |
|---|---|
| Blocks overlap in the continuous layout | Layout defect; do not ship; fix the adaptive placement or report the impossible constraint. |
| Anchored callout collides with a sibling subtree | Wrap it below the anchor with the indent; if still impossible, report a layout defect. |
| Collapsed ancestor hides a block | Hide it and its descendants; expand restores; no pins exist. |
| Multiple large top-level blocks | Stack vertically in top-level order; no overlap. |
| Block taller than one derived page | Continue at a safe internal boundary with continuation + ghost parent; if no safe boundary (single line/image/formula/code line), pagination defect; user splits the block or changes page setup. |
| Very wide content | Wrap the block's text within page width; if still too wide, layout defect; never horizontal scroll a block. |
| Deep nesting or very many siblings | Adaptive wrapping; warn if performance degrades; do not silently drop nodes. |
| Broken anchor | Attach the callout to the block's warning point; label "anchor lost"; target remains. |
| Reference edge crosses a card | Route around where possible; fall back to a curve; crossing is allowed. |

### 13.4 Files, assets, and recovery

| Case | Required behavior |
|---|---|
| Malformed JSON | Recovery/read-only; no overwrite; offer backup/raw export. |
| Newer schema version | Read-only; clear message; no downgrade. |
| Missing asset | Placeholder; keep reference; warn; PDF placeholder. |
| Disk full or permission denied | No partial save; keep editing; persistent banner; Save As. |
| External modification | Prompt before writing; never silently overwrite. |
| Crash during save | Old file intact; temp/backup recovery on next open. |
| Duplicate IDs | Fatal recovery; report; no auto-fix. |
| Unknown node type | Preserve; placeholder; no drop on save. |
| Asset referenced by a deleted block | Keep until a safe GC pass; do not break other references. |

### 13.5 PDF

| Case | Required behavior |
|---|---|
| Block taller than a page | Continue at a safe internal boundary (paragraph/list item/between code lines) with continuation + ghost parent; if no safe boundary, export blocked. |
| Formula or image taller than the page | Export blocked; user splits/shortens the block or changes page setup; never clip, cut, or auto-scale. |
| Anchored branch crosses a page | Continuation + ghost parent on both pages; branch content appears once. |
| Nested anchored branches | Paginate as normal; continuation markers as needed. |
| Missing font/glyph | Fallback font or visible error; no `�`; block export if content is unreadable. |
| Broken anchor | Marker plus "anchor lost" note; branch content still appears once. |
| Empty document | Disable export with a message; no blank PDF. |
| Paginator/page-view mismatch | Export defect; block release until the PDF and page view agree. |

### 13.6 Scale

| Case | Required behavior |
|---|---|
| 1,000+ blocks | Warn; use collapse/LOD; remain stable; do not promise 10,000. |
| Very large image | Downsample for display/PDF; keep the original asset; no layout freeze. |
| Very long code block | Continue between code lines at a safe boundary; never cut a code line. If a single line is too tall, pagination defect; split the block or change page setup. |
| Many broken anchors | Anchor health panel filters/sorts; export still completes; no bulk auto-delete. |

---

## 14. Performance and scale

### 14.1 Assumptions

| Dimension | Typical | Supported ceiling | Notes |
|---|---|---|---|
| Blocks per document | 50–300 | ~1,000 | 10,000 is out of scope. |
| Derived pages | 1–50 | ~200 | Computed by the paginator; not stored. |
| Branches | 1.2–2× blocks | ~2,000 | Reference edges add arrows but not layout. |
| Anchors | 0.2–1× blocks | ~1,000 | Most blocks have zero or one anchor. |
| Images per document | 5–50 | ~200 | Large assets are stored separately. |
| Document package size | 1–20 MB JSON + assets | ~500 MB with assets | Not a hard limit; warn on huge assets. |
| Concurrent users | 1 | 1 | No collaboration in v1. |

### 14.2 Targets

Measured on the reference Mac (M1/M2 class, 8 GB or more), release build, no developer tools, warm file cache. Targets are engineering goals, not marketing promises.

**Scale promise.** 300 blocks is the guaranteed target: the frame-rate and layout targets below are gates. 1,000 blocks is a usability target with focus/collapse and level-of-detail; it is not a guaranteed 60 fps. The spec does not claim 60 fps at 1,000 unless a measurement records it. Report measured results rather than extrapolating. The limit is a rendering/layout limit, not a shell limit: do not assume Electron is the hard ceiling. A GPUI-like native/Rust rewrite is considered later only if benchmarks justify it.

| Metric | Target | Fixture / notes |
|---|---|---|
| Open 300-block document | < 2 s to interactive | Includes parse, validate, layout, first paint. |
| Open 1,000-block document | < 5 s to interactive, or open with focus/collapse/LOD | Usability target with focus/collapse; no 60 fps claim. |
| Outline scroll | 60 fps at 1,000 rows | Outline only; not a reader/page frame-rate claim. |
| Reader/page rendering | 60 fps at 300 visible blocks; ≥ 30 fps at 500 | 1,000 usable with collapse/LOD; measured, not promised at 60 fps. |
| Warm layout, 300 blocks | < 50 ms | Excludes initial text measurement. |
| Warm pagination, 300 blocks | < 50 ms | Incremental from the first affected block. |
| Warm layout + pagination, 1,000 blocks | < 500 ms | Dirty-subtree optimization required. |
| Keystroke echo | < 16 ms | Local editor; no full-document reflow per key. |
| Reflow after edit | < 100 ms after debounce | Edited block and affected subtree only. |
| Selection sync between views | < 50 ms | No full re-layout. |
| Anchor resolution, 1,000 anchors | < 100 ms on load | Incremental per edited block after. |
| Save, 300 blocks | < 100 ms | Excludes asset writes. |
| Save, 1,000 blocks | < 500 ms | Excludes large assets. |
| Undo/redo | < 50 ms | Structural command inverse. |
| Search, 1,000 blocks | < 100 ms | In-memory index; rebuild on load. |
| PDF export, 300 blocks / ~100 pages | < 10 s | Page PDF; fonts/images ready. |
| PDF export, 1,000 blocks | < 30 s | May show progress; no blank/clipped pages. |
| Memory, typical document | < 500 MB | Monitor; includes app baseline. |
| Memory, 1,000 blocks | < 1.5 GB | Monitor; degrade rather than crash. |

### 14.3 Degradation strategy

- Collapse is the primary scaling tool; suggest collapsing large subtrees.
- At low zoom, render simplified cards; at high zoom, render full content.
- Virtualize offscreen cards, outline rows, and derived pages; do not mount editors for invisible blocks.
- Cache measurements; invalidate only the dirty subtree.
- Disable layout animation while typing and during bulk operations.
- At 1,000 blocks, show a soft warning and offer focus/collapse; do not silently drop features.
- If a target is missed, profile before changing the data model or the rendering approach. Do not jump to a different architecture without a measured bottleneck.

### 14.4 Measurement protocol

- Use fixed fixtures: 50, 300, and 1,000 blocks; a shared-child case; a deep tree; a wide fan; a document with long code and formulas; a document with many images.
- Use a dedicated stability fixture suite: add and delete one block at a leaf, in a wide fan, and near the top of a chapter; assert the 16 px gap, 2 px anchor alignment, 95%/2 px add-block floor, and 1 px delete stability in continuous coordinates.
- Measure pagination separately: page count, continuation count, no cut line/image/formula/code line, and manual break hints honored.
- Measure cold open and warm open; report median and 95th percentile over at least five runs.
- Measure pan/zoom with 300 and 500 visible cards at 100% zoom, and at the minimum readable zoom.
- Measure a text edit that changes block height, and a structural edit that reflows a subtree.
- Record machine, OS, build, font state, and whether animations are enabled.
- Visual/geometry tests should assert layout invariants, not pixel-perfect screenshots, except for a small style baseline set.

---

## 15. Acceptance criteria for the v1 prototype

Each criterion is behavioral and observable. "Must" criteria gate the prototype; "Should" criteria can be deferred with a recorded decision.

### 15.1 Model and structure

- **AC-01 (Must).** Create a document, add chapters/top-level blocks, rename the title, save, and reopen. Content, structure, anchors, chapter/top-level order, page setup, break hints, and collapse state are preserved.
- **AC-02 (Must).** Create top-level blocks and children. Outline order is deterministic; chapter/top-level order is stable; adding a child does not reorder unrelated top-level blocks.
- **AC-03 (Must).** A block never has two primary incoming branches. A second branch to a block with a home is created as a reference by default, or the user explicitly chooses reparent/move.
- **AC-04 (Must).** A primary cycle is rejected with an actionable message and no mutation. A reference cycle is allowed and does not cause infinite recursion in outline or PDF.
- **AC-05 (Must).** Shared-child scenario: one instance, one primary home, at least one reference parent. The block appears once in outline, reader/page views, and PDF; reference contexts show see-also; deleting a reference leaves the primary structure unchanged.
- **AC-06 (Must).** Delete a block with children: "promote children" and "delete subtree" both work; no dangling branch or anchor remains; external references are listed in the confirmation.
- **AC-07 (Must).** Reparent, outdent, and reorder preserve the subtree, anchors, and outgoing branches; undo restores the prior structure.
- **AC-08 (Must).** Malformed JSON and duplicate IDs fail safely: the app opens recovery/read-only, reports the problem, and does not overwrite the file.

### 15.2 Authoring, outline, and views

- **AC-09 (Must).** Enter creates a sibling, Tab reparents under the previous sibling, Shift-Tab outdents, and Backspace at the start merges with the previous block; undo restores each operation.
- **AC-10 (Must).** An anchored child appears as a marked callout below its anchor, with the anchor quote visible; the adaptive layout may wrap it below the parent with an indent; the order is deterministic.
- **AC-11 (Must).** Collapse/expand hides and restores descendants in outline, reader, and page views; the hidden count is shown; navigating to a hidden block reveals it.
- **AC-12 (Must).** "See also" and "Referenced by" links are visible and navigable; they do not duplicate content or create outline rows.
- **AC-13 (Must).** Search finds text, code, LaTeX source, and labels; selecting a result reveals the block in all views and shows its chapter/page path.
- **AC-14 (Should).** A missing block label is derived from content for the outline/card/PDF; an explicit label overrides it.
- **AC-15 (Must).** A multi-block selection for an anchored branch is rejected with a clear message; no partial anchor is created.

### 15.3 Anchors

- **AC-16 (Must).** A text anchor survives edits before, inside, and after the span; the highlight tracks the text.
- **AC-17 (Must).** Deleting the anchored text leaves the branch and target intact, marks the anchor broken, and offers repair; no silent deletion.
- **AC-18 (Must).** Splitting a block moves anchors after the split and updates their block; an anchor spanning the split is flagged for repair. Merging moves anchors to the surviving block.
- **AC-19 (Must).** A code anchor survives edits outside the range; removing the quoted code marks it broken/ambiguous; repair works.
- **AC-20 (Must).** A formula anchor stores the term/quote; invalid LaTeX shows an error without data loss; the branch is visually associated with the formula.
- **AC-21 (Must).** An image region anchor uses normalized coordinates, survives display resizing, and becomes broken when the image asset is replaced; a missing image shows a placeholder.
- **AC-22 (Must).** The anchor health panel lists broken/ambiguous anchors; relinking keeps the anchor and branch IDs; the branch target is never deleted by repair.

### 15.4 Adaptive layout and pagination

- **AC-23 (Must).** A 300-block document lays out with no overlapping blocks; children are to the right when they fit and wrap below the parent with a slight indent when they do not; widths vary with content; anchored children are below their anchors.
- **AC-24 (Must).** Adding/removing a reference edge moves no block and changes no page break; adding a block meets the stability gate; sibling reorder changes order only.
- **AC-25 (Must).** Chapters and top-level blocks stack in order without overlap; there are no fixed depth columns and no pins.
- **AC-26 (Must).** Reference edges are visually distinct and routed; reference cycles render; they do not affect layout or pagination.
- **AC-27 (Must).** Collapsing a block hides its descendants and callouts, shows a count, and restores them on expand; pagination is recomputed.
- **AC-28 (Must).** The paginator prefers breaks between blocks; a long block may continue only at a safe internal boundary, never through a text line, image, formula, table row, or code line. A table may continue only between rows; a row and its cells are never split. Continuation/ghost markers appear on both pages; page count is deterministic.
- **AC-29 (Must).** The reader shows a continuous layout with page-break markers; the page view renders the same breaks as paginated WYSIWYG; fit page/fit width and zoom are navigation only.
- **AC-30 (Must).** There is no pin or free-position command. Dragging a block only reorders it among legal sibling/top-level slots with a drop indicator.

### 15.5 Synchronization

- **AC-31 (Must).** An edit in the reader is visible in the outline and page view, and vice versa, without a mode switch or manual refresh.
- **AC-32 (Must).** Only one block editor is active. Switching views or blocks commits the edit and does not lose keystrokes.
- **AC-33 (Must).** Mode switching preserves the focused block, collapse state, reader scroll, current page, and selection; a hidden focused block is revealed.

### 15.6 Persistence

- **AC-34 (Must).** Autosave uses atomic writes; a backup exists; a simulated crash mid-save recovers the last good document.
- **AC-35 (Must).** Unknown fields and unknown content node types are preserved across load/save.
- **AC-36 (Must).** A newer schema opens read-only with a clear message; the app does not downgrade or overwrite.
- **AC-37 (Must).** A missing asset shows a placeholder, keeps the reference, and does not delete the image node or dependent anchors; PDF export shows the placeholder.
- **AC-38 (Must).** A save failure shows a persistent banner and prevents silent quit; the user can retry or Save As.

### 15.7 PDF

- **AC-39 (Must).** Page PDF: every derived page appears once in reading order; shared children appear once; there is no reader-PDF or map-page mode in v1.
- **AC-40 (Must).** No text line, image, formula, table row, or code line is cut across PDF pages. A long block may continue only at a safe internal boundary, with "continues" and "continued from" plus a ghost parent; the block appears once.
- **AC-41 (Must).** Extracted text contains all body, label, and code text; there are no missing-glyph markers; formulas render visually correctly.
- **AC-42 (Must).** PDF page count equals the paginator's derived page count; manual break hints are honored consistently with the page view; no blank pages; page numbers present.
- **AC-43 (Must).** Images are embedded; a missing image renders a labeled placeholder; arrows and borders are vector, not a screenshot.
- **AC-44 (Must).** PDF page geometry (page size, orientation, margins, block positions, page breaks) matches the page view within print-theme tolerance.
- **AC-45 (Must).** The PDF opens in a standard PDF viewer; body text can be selected/highlighted/searched; no block is clipped. It is a standard PDF suitable for downstream annotation (for example in Notability), but no app-specific import is part of the gate.

### 15.8 Undo and performance

- **AC-46 (Must).** Undo routes correctly between text history and structural commands; labels are human-readable; redo works.
- **AC-47 (Must).** Undo/redo covers branch creation, anchor creation/repair, reparent, page-break hints, delete, and merge without leaving orphan records.
- **AC-48 (Must).** Undo works after a save within the session; reopening starts a fresh history.
- **AC-49 (Must).** On the reference Mac, 300-block warm layout is under 50 ms; reader/page rendering is 60 fps at 300 visible blocks; edit reflow is under 100 ms after debounce.
- **AC-50 (Must).** A 1,000-block document opens within 5 s or opens with collapse/LOD, remains stable, and a 300-block page PDF exports in under 10 s.

### 15.9 Layout tolerances and stability

- **AC-51 (Must).** At 100% zoom, every pair of visible blocks has at least 16 logical px of clear space between their bounds. There is no pin exception.
- **AC-52 (Must).** At 100% zoom, an anchored callout's left edge is within 2 px of its resolved anchor's left edge and its top is below the anchor; a continuation after a page break is exempt but marked.
- **AC-53 (Must).** Across the stability fixture suite, adding one block leaves at least 95% of pre-existing blocks within 2 px in continuous coordinates; blocks in the affected parent subtree or sibling group may move. Deleting one block moves every surviving block outside the affected group by no more than 1 px. Page breaks may change; unrelated chapters must not move.

### 15.10 Anchor policy for formula, code, and image anchors

- **AC-54 (Must).** Formula, code, and image anchors are detected as resolved, ambiguous, or broken after edits and on load. A broken anchor never deletes its branch or target block.
- **AC-55 (Must).** Ambiguous reattachment requires explicit confirmation with a before/after preview; only an exact unique binding may resolve silently. Relinking keeps the anchor ID and branch IDs and is undoable.
- **AC-56 (Must).** A broken or ambiguous formula/code/image anchor still exports its branch content exactly once in the paginated layout, with a visible marker and no silent omission; an optional anchor appendix can list the reason.
- **AC-57 (Must).** The anchor fixture matrix covers formula-term edits, code edits inside and outside the range, image display resize, image replacement, and missing assets. Every case preserves the branch, target, and anchor identity, or surfaces a repair path.
- **AC-77 (Must).** A broken anchor shows a visible marker, falls back to the whole block for the branch's visual origin, and opens/offers a repair dialog. It never silently drops the branch, target, or anchor identity; export uses the same fallback and marks the anchor.

### 15.11 Shared-child lifecycle

- **AC-58 (Must).** A shared child has exactly one primary home. Deleting its primary parent or primary edge makes it a top-level block with reference parents intact; "make home" and "move here" change the primary parent without duplicating the block; the outline shows it once with see-also links, and reference contexts never create a second row or card.

### 15.12 Persistence and migration gates

- **AC-59 (Must).** Backup rotation, crash recovery, unknown-field preservation, and the migration matrix are exercised: at least 10 retained versions, 7 daily snapshots, a pre-migration backup, a forced migration failure that restores the backup, and a load/save round-trip that preserves unknown fields and nodes at every level.

### 15.13 PDF pipeline gate and export mode

- **AC-60 (Must).** The Electron `printToPDF` pipeline must pass a 50+ page A4 pagination spike with real selectable text, page numbers, repeated headers, and no cut line/image/formula/code line/table row. It must not produce a single long page or fail at compositing. If it fails the gate, PDF commitment pauses for a fallback ADR (see ADR-0002).
- **AC-61 (Must).** v1 exposes exactly one PDF export mode, Page PDF. It uses the same paginator as the page view and has no reader/map mode. Page size, orientation, margins, breaks, and continuation markers match the page view.

### 15.14 Scale promise

- **AC-62 (Must).** 300 blocks meets the guaranteed frame-rate and layout gates. A 1,000-block document is usable with focus/collapse and LOD; no 60 fps claim is made for 1,000 blocks unless a recorded measurement supports it.

### 15.15 Prototype demo script

A reviewer should be able to run this script without developer help:

1. Create a document titled "Linear algebra — eigenvalues."
2. Create a top-level block "Eigenvalues" with a sentence containing `λ` and `Av = λv`.
3. Select `λ`, create an anchored child "Eigenvalue equation."
4. Add a direct child "Eigenvector."
5. Create a second top-level block "Cayley–Hamilton" and link it to "Eigenvalue equation" as a reference; confirm the shared child appears once.
6. Add a few long blocks and observe the adaptive layout: children go right when they fit and wrap below with an indent when they do not.
7. Switch between reader (continuous page-break markers) and page view (paginated WYSIWYG); confirm they share the same breaks and focus.
8. Delete the anchored `λ`; confirm the branch remains, is marked broken, and can be relinked.
9. Undo the deletion and the relink; redo; confirm all views agree.
10. Save, quit, reopen; confirm content, chapter order, page setup, break hints, collapse, and view state.
11. Export a Page PDF; confirm page count/orientation match the page view, no line/image/formula/code line is cut, continuation markers are correct, and text is selectable in Preview/Chrome.
12. Simulate a crash during save; confirm the recovery prompt and the last good document.

### 15.16 Page, stability, and cross-page gates

- **AC-63 (Must).** A long block may continue across pages only at a safe internal boundary: paragraph, list item, blockquote paragraph, between code lines, or between table rows. No text line, image, formula, table row, or code line is cut. A table row and its cells are atomic; a row taller than the page blocks export. The block appears once.
- **AC-64 (Must).** Incremental reflow is the default and keeps unaffected positions stable. Freeze study mode is read-only and freezes layout/pagination. Full reflow runs on request and after the configured idle period; it preserves the logical tree and may change page breaks with a visible notice.
- **AC-65 (Must).** Page orientation is document-wide: portrait or landscape. Changing it reflows all pages and updates the PDF page orientation; mixed orientation is not supported in v1.
- **AC-66 (Must).** When a block or lower-level branch continues across a page, the source page shows "continues on page N" and the target page shows "continued from page M" plus a ghost parent. The ghost is not editable and is not a second block.

### 15.17 Multiple documents, search, and visual theme

- **AC-67 (Must).** Multiple documents can be created/opened from a user-chosen folder, appear in a recent/library list, and are stored as a single `document.json` plus assets. They are not stored in git.
- **AC-68 (Must).** Search finds text, code, LaTeX source, and labels in the current document and in the library; results show the chapter/page path and reveal the block.
- **AC-69 (Must).** The default theme is a clean, minimal, Obsidian-like dark mode; a light theme is available. Page guides, block borders, and selection states remain legible in both.

### 15.18 External Agent API

- **AC-70 (Must).** Every document mutation used by the UI is available as a typed command with validation, an inverse, and undo/redo. An external client cannot mutate the document by writing JSON directly; a direct-write attempt is rejected.
- **AC-71 (Must).** The API is local-only over loopback, exposed as HTTP JSON plus an MCP adapter that maps to the same commands. It is off by default, requires a bearer token shown once, stored hashed, and revocable, with document-scoped `read`/`write`/`export`/`destructive`/`audit` scopes, and has no background autonomy or outbound web access.
- **AC-72 (Must).** Mutating commands support `dryRun` where practical, return a diff/affected IDs, and apply all-or-nothing against `baseRevision`. Destructive commands require explicit confirmation naming the affected IDs; stale commands fail safely.
- **AC-73 (Must).** Every request is audit-logged with token/client, command, result, and revision. Undo/redo is available through the API with `write` scope, names a `transactionId`, and shares the UI undo stack; it only succeeds when that transaction is still the top undoable entry. Tokens are revocable.
- **AC-74 (Must).** The v1 command catalog includes open/read document, search, create/edit/delete block, create branch from block or anchor, reorder/reparent, create chapter, export PDF, and undo/redo. Concurrent writes cannot corrupt the file; the document uses a monotonic `baseRevision` and a single-writer lock with concurrent readers.

### 15.19 Testing tools

- **AC-75 (Must).** T3 Code's internal browser is used for manual and visual checks of the reader, page view, dark mode, page-break/continuation states, and API-triggered changes.
- **AC-76 (Must).** Playwright covers automated end-to-end flows, visual regression, and PDF text extraction (including block continuation and continuation/ghost markers). The PDF text test asserts that no line/image/formula/code line/table row is cut and that tables break only between rows. API integration tests cover auth/scopes, dry-run/apply, audit, undo/redo, and concurrency.

---

## 16. Decisions and remaining questions

### 16.1 Decisions

The layout tolerances (16 px minimum gap, 2 px anchor alignment, 95% add-block stability within 2 px as a suite-level floor, and 1 px delete stability outside the affected group) are confirmed in §7.13 and are not an open decision. They are gated by AC-51 through AC-53.

| ID | Decision | Recommendation | Owner | Needed before |
|---|---|---|---|---|
| **D1** | Canonical content: Markdown or structured JSON? | **Closed:** structured JSON/ProseMirror JSON canonical, Markdown import/export. Recorded in AGENTS.md. | Orchestrator + product owner | Done |
| **D2** | Block granularity: rich body or single content node? | **Closed:** rich body; a block can contain paragraphs, lists, code, math, images, tables. | Architect + product owner | Done |
| **D3** | Outline order: anchored children before or after direct children? | **Closed:** anchored first, ordered by anchor position, then direct children in branch order. | UX + product owner | Done |
| **D4** | Shared-child default and role changes. | **Closed:** reference by default when the target has a home; add-as-child when it is a top-level block; explicit "make home" and "move here." | Product owner | Done |
| **D5** | Anchor policy for formula, code, and image anchors. | **Closed:** all four anchor kinds; exact unique bindings auto-resolve; ambiguous reattachment requires confirmation; broken anchors never delete branches; export includes the branch exactly once. Formula-term geometry is best-effort; whole-formula is precise. | Product owner + Architect | Done |
| **D6** | PDF export mode. | **Closed:** one Page PDF mode; no separate reader PDF or map page in v1. Pipeline decided in D13/ADR-0002. | Product owner | Done |
| **D7** | Document/window model. | Multiple documents in a user-chosen folder, one package per window, library/recent list. | Orchestrator | Persistence/window implementation |
| **D8** | Width and positioning model. | **Closed:** adaptive content-driven widths; children right or wrapped below; no manual resize, pins, fixed columns, or free positions. | UX + architect | Done |
| **D9** | Markdown export/import timing. | Export post-v1; import later; label both as lossy. | Product owner | Portability work |
| **D10** | Accessibility target. | Keyboard-complete + VoiceOver outline; reader/page views have an accessible equivalent; tagged PDF later. | Product owner | Beta |
| **D11** | Version history UI. | Autosave + rotating backups; no user-facing version history in v1. | Orchestrator | Persistence |
| **D12** | Stack and product name. | **Closed:** Electron + React + TypeScript (ADR-0001); GPUI no-go; SwiftUI only if iPad becomes co-primary; Qt fallback. Name: NoteForest (working title; existing app conflict; clearance/rename required). | Orchestrator | Done |
| **D13** | PDF pipeline gate. | **Closed:** Electron `printToPDF` driven by the shared paginator (ADR-0002); hard gate is a 50+ page A4 spike with real text, no cut line/image/formula/code line/table row, and page count equal to the paginator. Fallback requires a new ADR. | Orchestrator | Done; gate runs in Spike 1 |
| **D14** | Primary authoring surface: reader or page view? | **Closed:** reader is the primary editor in v1; page view is the preview. One layout engine and one paginator. | UX + product owner | Done |
| **D15** | Page orientation. | **Closed:** one document-wide orientation, portrait or landscape; changing it reflows all pages. | Product owner | Done |
| **D16** | External API shape. | **Closed:** HTTP JSON is the primitive; the MCP adapter maps to the same commands. | Architect + Orchestrator | Done |
| **D17** | External API authentication/scopes. | **Closed:** bearer token shown once/stored hashed/revocable; document-scoped; scopes `read`/`write`/`export`/`destructive`/`audit`. | Architect + security review | Done |
| **D18** | External API concurrency/file locking. | **Closed:** one writer per document via OS advisory lock + lock file, concurrent readers, monotonic `baseRevision`, no silent overwrite. | Architect + Orchestrator | Done |
| **D19** | External API command surface. | **Closed:** semantic command catalog in §12.3; low-level primitives stay internal. | Architect | Done |
| **D20** | PDF export API behavior. | **Closed:** `export.pdf` is job-based with explicit output path and overwrite flag. | Architect | Done |
| **D21** | Table pagination. | **Closed:** page breaks only between rows; a row and its cells are atomic; a row taller than the page is a pagination defect. Header repetition is not required in v1. | Product owner | Done |

### 16.2 Questions

| ID | Question | Recommendation / current assumption |
|---|---|---|
| **Q1** | Should reference edges appear in the outline as chips, or only when the block is selected? | Chips after the block content; compact and not structural. |
| **Q2** | Do anchored children count as children for Enter/Tab structural commands? | Yes in the model; Enter on the parent creates a direct child; anchored creation uses its own command. |
| **Q3** | Default delete behavior: promote or delete subtree? | Promote children (safer); subtree is explicit and confirmed. |
| **Q4** | Drag behavior: reorder only, or also reparent? | Reorder among legal sibling/top-level slots; reparent via Tab/command. No free drag or pin. |
| **Q5** | Must formulas be searchable in the PDF, or is visual correctness plus LaTeX source enough? | Visual correctness is required; formula text extraction is best-effort and documented as a limitation. |
| **Q6** | Is 1,000 blocks a hard cap or a soft warning? | Soft warning at ~1,000; no 10,000 promise. |
| **Q7** | Can top-level blocks be reordered manually? | Yes; chapter top-level order is document data. |
| **Q8** | Are empty blocks allowed? | Yes; they are valid authoring state and are not auto-deleted. |
| **Q9** | Should PDF export include collapsed subtrees? | Yes; export all document content, not the current collapse state. No "export visible only" option in v1. |
| **Q10** | What happens when a manual page-break hint cannot be honored? | The paginator ignores impossible hints and shows a warning; it never creates an empty page or cuts a line/image/formula/code line. |
| **Q12** | Which view is primary for authoring: reader or page? | **Resolved (D14):** reader is the primary editor in v1; page view is the preview. |
| **Q13** | Should there be an "export visible only" option? | Not in v1; default export includes all content. |
| **Q14** | Should page setup (margins) be per chapter or per document? | Document-level in v1; per-chapter margins later if needed. Orientation remains document-wide (D15). |

---

## 17. Risks

| Risk | Likelihood | Impact | Mitigation | Early warning |
|---|---|---|---|---|
| Anchored branches do not survive normal edits; the core promise fails. | High | High | Prototype anchors first; edit matrix (before/inside/after/delete/split/merge/undo/reload); repair UX. | A test case produces a broken anchor after a trivial edit. |
| Non-text anchor policy (formula, code, image) is under-specified or under-tested. | High | High | D5 policy; fixture matrix; confirmation before reattach; export tests; no silent data loss. | A formula/code/image edit loses a branch or reattaches to the wrong span without confirmation. |
| Adaptive layout is unstable or collides when widths vary, children wrap, and anchored callouts interact. | High | Medium | Content-driven measure tests; wrap rules; deterministic geometry; stability fixtures; no free positions. | Cards overlap, jump, or wrap inconsistently. |
| 95%/2 px stability gate fails on wide fans or adaptive wrapping. | Medium | Medium | Stability fixture suite; affected-group definition; ADR if the gate proves impossible. | Adding or deleting one block moves unrelated cards beyond the tolerance. |
| Pagination cuts a line/image/formula/code line or a table row, creates bad breaks, or diverges between reader, page view, and PDF. | High | High | One paginator; safe-boundary rule (including row-only table breaks); continuation/ghost markers; page-count tests; page-view/PDF geometry comparison. | A line/image/formula/code line or table row is cut, page counts differ, or breaks move without content changes. |
| Reader and page views diverge or duplicate layout logic. | Medium | High | One layout engine and one paginator; two renderers only; shared geometry tests. | A break or position differs between views. |
| PDF pagination, fonts, or text layer fail, making export unusable in standard PDF viewers. | Medium | High | Print theme with same geometry; text extraction tests; PDF-viewer checks per release; overflow/too-tall errors. | Text is missing, clipped, or unselectable; a line/image/formula/code line is cut. |
| Electron performance or memory degrades at 300–1,000 blocks. | Medium | Medium | Measure in Spike 1 and the 300-block gate; virtualization, collapse, LOD; native canvas is a later option, not a stack switch. | Scroll/render stutter or layout over 50 ms at 300 blocks. |
| The Electron `printToPDF` pipeline cannot reproduce the paginator's pages or real text. | Medium | High | ADR-0002 hard gate: 50+ page A4 spike before PDF commitment; print compositor consumes derived pages; fallback ADR (CDP print or native compositor). | Single long page, scaling bug, missing text, or a cut line/image/formula/code line/table row. |
| Scope creep into a general whiteboard or PKM. | High | Medium | Non-goals; wedge statement; gate features against the anchored-branch promise. | Requests for shapes, freehand, databases, plugins. |
| Content-model decision is delayed or wrong, causing rework. | Medium | High | D1 closed; keep the adapter narrow; schema versioning; fixtures. | Editor work bypasses the adapter or adds a second source of truth. |
| Reader/page performance degrades at 1,000 blocks. | Medium | Medium | Benchmark early; collapse/LOD; page virtualization; soft cap; measure before changing architecture. | Scroll/render stutter at 300 visible blocks. |
| Data loss or corruption erodes trust. | Low | High | Atomic saves; backups; recovery; no silent overwrite; malformed-file tests. | Any test loses the last good document. |
| External API token leak or concurrent writer corrupts a document. | Medium | High | Loopback-only, hashed/revocable tokens, scopes, `baseRevision`, single-writer lock, audit log, integration tests. | Two writers diverge or an unexpected client writes without an audit entry. |
| Shared-child mental model confuses users. | Medium | Medium | Explicit home; see-also; default link vs move; onboarding copy; user testing. | Users expect two equal parents or duplicated content. |
| Markdown users expect perfect portability/round-trip. | Medium | Medium | Label export as lossy; document the canonical format; provide export, not a mirror. | A user edits exported Markdown and expects re-import fidelity. |
| Undo/focus bugs with two editors or view switching. | Medium | Medium | One active editor; command stack; routing tests; commit on switch. | Keystrokes lost or undo affects the wrong view. |
| Platform-specific anchor geometry blocks iPad later. | Low | Medium | Platform-neutral selectors; normalized image rects; quote/context fallbacks; no DOM in canonical data. | A design requires screen coordinates in the document. |
| Name/brand conflict distracts from product work: NoteForest is a working title and an existing app uses the name. | Medium | Low | Clearance or rename before packaging; do not invest in brand assets yet. | Team debates naming instead of the prototype. |

---

## Appendix A. Worked example

This example is the recommended golden fixture for model, layout, pagination, and PDF tests. It exercises a chapter with top-level blocks, a direct child, an anchored child, a shared child, a reference edge, and a derived continuation.

**Document:** "Linear algebra — eigenvalues." One chapter, `topLevelBlockIds: ["b1", "b4"]`. Page setup: A4 portrait, 20 mm margins.

| Block | Role | Content summary | Anchors |
|---|---|---|---|
| **B1** | Top-level block | "An eigenvalue is a scalar λ such that Av = λv for some nonzero vector v." | **A1** on `λ`. |
| **B2** | Direct child of B1 | "An eigenvector is a nonzero v satisfying Av = λv." | None. |
| **B3** | Anchored child of B1 via A1 | "The eigenvalue equation: Av = λv, with v ≠ 0." | **A2** on the formula term `λ` in `Av = λv`. |
| **B4** | Top-level block | "Cayley–Hamilton: every matrix satisfies its characteristic polynomial." | None. |
| **B5** | Anchored child of B3 via A2 | "Computing eigenvalues" with a code block for a numerical example. | **A3** on the code token `eigvals` (fixture extension). |

**Branches:**

| Branch | Source | Target | Role | Order |
|---|---|---|---|---|
| E1 | B1 (block port) | B2 | Primary | `a1` |
| E2 | B1 / A1 (anchor port) | B3 | Primary | `a1` |
| E3 | B3 / A2 (anchor port) | B5 | Primary | `a1` |
| E4 | B4 (block port) | B3 | Reference | `a1` |

**Outline result:**

```text
1  Eigenvalues
   1.1  Eigenvalue equation        (anchored from λ)
        1.1.1  Computing eigenvalues (anchored from the formula)
   1.2  Eigenvector
2  Cayley–Hamilton
   See also 1.1
```

**Adaptive layout result:**

- B1 starts at the top-left of the chapter's content area.
- B2 is placed to the right of B1 if it fits; otherwise it wraps below B1 with a slight indent.
- B3 is a callout below A1 in B1; B5 is a callout below A2 in B3.
- B4 is the next top-level block, stacked below B1's subtree.
- Widths vary with content; there are no fixed depth columns and no pins.
- E4 is a dashed reference edge from B4 to B3; it does not move B3.

**Pagination result:**

- The paginator slices the continuous layout into A4 pages, breaking between blocks only.
- In the fixture, B5 starts on page 2: page 1 shows "continues on page 2" at the branch, and page 2 shows "continued from page 1" at B5.
- No line/image/formula/code line is cut. B3 appears once; B5 appears once.
- If B3 or B5 crosses a page, the break is at a safe internal boundary and both pages show continuation/ghost-parent markers.
- A manual break hint before B4 starts B4 on a new page if the paginator can honor it.

**PDF result:**

- The Page PDF has the same page count, orientation, margins, breaks, and continuation markers as the page view.
- B3 appears once; B4 has "See also" with B3's page.
- B5's code text is selectable.
- There is no separate reader PDF and no map page.

**Fixture assertions:**

- one instance of B3;
- one primary incoming edge to B3 and one reference incoming edge;
- chapter top-level order B1, B4; outline order B1, B3, B5, B2, B4;
- adding/removing E4 changes no block position and no page break;
- deleting E2 makes B3 a top-level block; E4 remains;
- "make home" from B4 moves B3 under B4 and demotes E2 to reference;
- the paginator breaks only at safe boundaries; continuation/ghost markers appear where B3 or B5 crosses a page;
- page count is deterministic across repeated exports.

---

## Appendix B. Change log

| Version | Date | Change |
|---|---|---|
| v0 | 3 November 2026 | Initial product/data-model/behavior spec. |
| v0.1 | 3 November 2026 | Incorporated Sentinel review gates: layout tolerances, scale promise, anchor policy, shared-child lifecycle, persistence/migration matrix, PDF shell gate; added AC-51–AC-62. |
| v0.2 | 3 November 2026 | Applied the product owner's adaptive-layout correction: Document → Chapters → top-level blocks; content-driven widths and wrap-below layout; pages derived by the paginator; continuation markers; reader/page views share one engine; Page PDF only; NoteForest working title; D1/D6/D8/D12 closed. |
| v0.3 | 3 November 2026 | Parked the in-app agent panel; replaced it with the External Agent API (HTTP JSON + MCP, token auth/scopes, audit, dry-run, undo/redo). Marked stack and PDF pipeline TBD (Electron provisional). Added long-block safe continuations, ghost-parent markers, freeze/full-reflow modes, document-wide orientation, multiple documents, dark default, T3/Playwright testing gates. |
| v0.4 | 3 November 2026 | Ratified Electron + React + TypeScript (ADR-0001) and the `printToPDF` pipeline driven by the shared paginator (ADR-0002); closed D2–D6, D12–D14, D16–D20; added D21 table pagination (break only between rows, row atomic); closed the External API defaults (ADR-0003: off by default, loopback, document-scoped bearer tokens shown once/hashed/revocable, single-writer lock + `baseRevision`, dry-run/apply/undo, local audit); fixed the reader as primary editor; replaced the TBD pipeline note with the decided pipeline and its 50+ page gate. |
| v0.4.1 | 3 November 2026 | Clarified PDF acceptance (S3, AC-45, §11.10, demo script, risk): the gate is a correct standard PDF reviewed on the Mac; no app-specific import (Notability) is required. The annotated-iPad workflow remains the downstream use case, not a test dependency. |
