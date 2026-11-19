# NoteForest — Product, Data Model, and Behavior Specification

**Version:** v1.0, 18 November 2026 — describes the shipped 0.1.0 behavior.
**Owner:** Planner.
**Status:** Current. Where this document and `AGENTS.md` disagree, `AGENTS.md` wins.

**Normative language.** **MUST** is required. **SHOULD** is expected unless a recorded decision
defers it. **MAY** is optional.

---

## Contents

1. [Product](#1-product)
2. [Glossary](#2-glossary)
3. [Core use cases](#3-core-use-cases)
4. [Data model](#4-data-model)
5. [Operations](#5-operations)
6. [Views and interaction](#6-views-and-interaction)
7. [Adaptive layout and pagination](#7-adaptive-layout-and-pagination)
8. [Anchor lifecycle](#8-anchor-lifecycle)
9. [Content model](#9-content-model)
10. [Persistence](#10-persistence)
11. [PDF export](#11-pdf-export)
12. [Markdown guest file](#12-markdown-guest-file)
13. [Edge cases](#13-edge-cases)
14. [Performance and scale](#14-performance-and-scale)

---

## 1. Product

### 1.1 Vision

NoteForest is a Mac-first study tool for people who think in structures. A learner writes a topic,
expands it right and down, and attaches a branch to the exact word, formula term, code token, or
image region that caused the thought. The same document is an outline for fast authoring, a
Continuous layout for spatial writing, a Page layout for the exact printed result, and a real-text
PDF for studying on paper or a tablet.

It is not a whiteboard and not a knowledge base. It is personal-first: one learner's documents,
local files, no accounts, no telemetry.

### 1.2 Target user

A university-level STEM student who rewrites lecture notes as a structure, uses formulas, code,
lists and images as normal content, studies from the structure, annotates exported PDFs by hand,
works keyboard-first on a Mac, and wants local files with no lock-in.

**Not the target user:** a team wanting a collaborative whiteboard, a PKM user wanting databases
and queries, or a user wanting freehand drawing as the primary medium.

### 1.3 Principles

1. **One document, several lenses.** Outline, Continuous and Page are views over one model. None
   owns a private copy of the structure or a second paginator.
2. **One home, many references.** Every non-root block has exactly one primary parent that
   determines its outline position and layout home. Extra parents are reference edges.
3. **Anchors are first-class.** A branch can point at a span, not only at a whole block. An anchor
   either survives editing or fails visibly with a repair path.
4. **Keyboard-first authoring, adaptive reading.** The outline must be fast enough to replace a
   hand-written outline. The spatial layouts must not become a drawing tool.
5. **Fixed logical order, adaptive geometry.** Only sibling order changes. Widths are
   content-driven; there are no fixed depth columns, pins, nudges or arbitrary coordinates.
6. **Pages are derived.** A paginator computes A4 pages from the continuous layout; pages are not
   stored containers. Break between blocks first, and continue a long block only at a safe
   internal boundary.
7. **Never silently lose work.** A broken anchor, a pagination defect, a missing asset or a failed
   save is surfaced, not swallowed.
8. **Real text, page PDF.** The PDF reproduces the Page layout with a selectable text layer.
9. **Local-first and portable.** The canonical document is a documented, versioned package.
   Export is not the only way to recover content.

### 1.4 Goals (delivered in v1)

- G1. Rich content blocks: text, lists, code, inline and display math, images, tables.
- G2. Branches from a whole block or from an anchor inside it.
- G3. Text, formula, code and image anchors, with a visible broken state and a repair path.
- G4. Outline, Continuous and Page over one document, with synchronized content, selection,
  marked page starts, collapse and undo.
- G5. One primary incoming edge per block, an acyclic primary forest, reference edges that may
  cycle.
- G6. Adaptive layout: top-level blocks stack; children go right or wrap below with a slight
  indent; anchored callouts follow the parent; no overlap.
- G7. Versioned document package, atomic save, backups and crash recovery.
- G8. A4 portrait or landscape PDF with real text, safe continuations, and continuation/ghost
  markers.
- G9. Responsive at 300 blocks, usable at 1,000 with virtualization and collapse.
- G10. Multiple documents in a user-chosen library, tabs, search, dark mode default.
- G11. `.md` files open as flat guest files; external agents write Markdown, and there is no
  importer, server or token.

### 1.5 Non-goals for v1

- N1. A general whiteboard with freehand drawing, shapes and connectors.
- N2. A PKM system with typed objects, queries, databases or a global graph.
- N3. Real-time collaboration, sync, CRDTs or accounts.
- N4. An iPad app, Pencil handwriting or ink annotations.
- N5. A study/annotation layer. A highlighter mark exists; ink and page annotations do not.
- N6. Block references that render a second editable copy (transclusion).
- N7. Markdown as a live vault with full round-trip fidelity.
- N8. Web, Windows or Linux clients.
- N9. Background AI, autonomous editing or proactive suggestions.
- N10. A plugin system, scripting or embedded HTML/JavaScript in notes.
- N11. An infinite canvas, free positioning, pins, fixed pixel columns.
- N12. A separate linear reader PDF, a map export, or a page-container document format.
- N13. An in-app agent panel and a local HTTP/MCP API.
- N14. Note documents in git. Git is for code and project docs.
- N15. Agent autonomy, web access, shell access or auto-applied destructive changes.

### 1.6 Success criteria

- S1. A 100-block study document can be built in one session without a structural bug, a lost
  branch, or an ambiguous undo.
- S2. Text anchors survive ordinary edits; destructive edits produce a visible broken state.
- S3. A 300-block PDF opens in a standard viewer with selectable text, the paginator's page order
  and orientation, and no cut line, image, formula, code line or table row.
- S4. 300 blocks are smooth; 1,000 are usable with virtualization, collapse and focus.
- S5. Crash, malformed-file, missing-asset, page-break and continuation cases never destroy the
  last good document and never clip content.

### 1.7 At a glance

- A **document** has one or more **chapters**. A chapter has an ordered list of **top-level
  content blocks**; every top-level block is itself a content block.
- Chapters group top-level blocks only. **Pages are not a structural level**; the paginator derives
  them from the continuous layout, the page setup and the manual break hints.
- The logical order is fixed. Only sibling, top-level and chapter order change. Widths are
  content-driven.
- Children go right when there is room; otherwise the child group wraps below the parent with a
  slight indent. Anchored callouts follow their parent: below it, or in its right lane when it
  fits.
- **Layouts and modes:** Continuous | Page × Edit | Read. Continuous + Edit is the default; Page
  Read is the exact print proof; Page Edit is opt-in. Switching layout preserves the mode.
- **PDF export** prints the Page layout in Read mode from the same paginator.

### 1.8 Assumptions

| ID | Assumption |
|---|---|
| A1 | Single user, local documents, no collaboration. |
| A2 | Mac first; iPad is a later phase, and the model stays platform-neutral. |
| A3 | Documents live in a user-chosen library; tabs and a library tree navigate them. |
| A4 | Reading direction is left-to-right; the continuous layout grows right and down. |
| A5 | Typical documents have 50–300 blocks and 1–50 pages; the supported ceiling is about 1,000 blocks. |
| A6 | PDF pages are A4, portrait or landscape, produced by the paginator. |
| A7 | Annotations are a separate study layer, out of scope. |
| A8 | Canonical content is ProseMirror-shaped JSON; Markdown files are guest files, not forest imports. |
| A9 | The stack is Electron + React + TypeScript (ADR-0001); PDF is `printToPDF` (ADR-0002). |
| A10 | UI copy is English; content is Unicode. |
| A11 | Widths are derived; there is no manual resize in v1. |
| A12 | The local document is the source of truth; exports are derived. |
| A13 | Pages are derived; manual page-break hints are personal settings, not document data. |
| A14 | One page orientation per document. |
| A15 | The Page layout and PDF share one engine, one measurement and one paginator; Continuous shares the same breaks as markers. |

---

## 2. Glossary

| Term | Definition |
|---|---|
| **Block** | The unit of identity, content, branching and layout. Stable ID, rich body. |
| **Content block** | Same as block, when the content aspect matters. |
| **Anchor** | A stable selector for a span, term, token, line, point or region inside one block. |
| **Anchor mark** | The inline binding of an anchor in content; it carries the anchor ID so the anchor moves with the text. |
| **Branch** | A directed edge from a source block or anchor to a target block. |
| **Primary branch** | The single structural incoming edge of a non-root block; it determines home and outline position. |
| **Reference branch** | A non-structural edge for cross-links and shared children; it may form cycles. |
| **Source / target** | The from-side (block or anchor) and the to-side (block) of a branch. |
| **Root** | A block with no incoming primary branch. A root is a top-level block in a chapter. |
| **Top-level block** | A root content block listed directly in a chapter. |
| **Primary forest** | The primary trees rooted at the chapters' top-level blocks. |
| **Home** | A block's position in the primary forest, determined by its primary parent. |
| **Chapter** | An ordered group of top-level blocks. |
| **Page** | An A4 frame produced by the paginator. Derived, never stored. |
| **Page break** | A boundary between two derived pages, computed by the paginator or requested by a manual hint. |
| **Manual break hint** | A personal request to start a page before a block; honoured only when the block can start a row. |
| **Continuation** | A block that continues on the next page. Marked on both pages; never a second copy. |
| **Ghost parent** | A compact repeat of the parent context at the top of the next page. |
| **Placement** | A layout record: a block is `right` of its parent or `below` it. |
| **Trunk** | The vertical segment a child group shares; it starts at the parent's port and continues across pages. |
| **Callout** | The rendering of an anchored branch: below the anchor, or in the parent's right lane (Page mode A). |
| **Adaptive layout** | A tree layout with content-driven widths; children right when there is room, otherwise below with an indent. |
| **Pagination** | Slicing the continuous layout into A4 pages without cutting a line, image, formula, code line or table row. |
| **Incremental reflow** | Only the dirty subtree and affected siblings are recomputed; the rest of the layout is stable. |
| **Continuous layout** | A continuous vertical rendering with page-start markers derived from the paginator. Edit and Read. |
| **Page layout** | The A4 rendering of derived pages. Page Read is exact and read-only; Page Edit is opt-in with the same geometry. |
| **Edit / Read mode** | Edit accepts authoring with one active block editor; Read is read-only for content but keeps selection, navigation, links, copy, scroll and zoom. |
| **Shared child** | A block with one primary parent and zero or more reference parents. Appears once. |
| **Outline order** | The depth-first order over chapters and primary children; the canonical reading order. |
| **Collapse** | View state that hides descendants. A navigation aid in Outline and Continuous; Page and PDF always show everything. |
| **Document package** | The folder holding `document.json` and `assets/`. |
| **Asset** | An image stored by content hash inside the package. |
| **Page settings** | Personal page size, orientation, margins, theme, density, chrome and manual break hints: one global default plus a per-document override. |
| **View state** | Non-canonical UI state: layout, mode, page, zoom, scroll, selection, collapse. |
| **Guest file** | A `.md` file opened flat: Continuous Edit/Read, no forest, no Page, no PDF. |
| **Broken anchor** | An anchor whose binding no longer resolves. The branch is preserved and surfaced for repair. |
| **Fractional order** | A lexicographically sortable string used to order siblings without renumbering. |
| **Pagination defect** | A block or subtree that cannot satisfy the page or a manual hint. Warned and exported as blocked; never clipped or scaled. |

---

## 3. Core use cases

| ID | Story | Done when |
|---|---|---|
| US-01 | Capture a topic and expand it | A top-level block, children and rich content appear in Outline, Continuous and Page. |
| US-02 | Branch from a word or phrase | The new block is the anchor's primary child; editing around the span does not detach it. |
| US-03 | Branch from a formula term | The term is the quote, the formula is the context, and an invalid formula does not destroy the note. |
| US-04 | Branch from code | The range is marked, edits outside it preserve the anchor, edits removing it break it visibly. |
| US-05 | Branch from an image region | The region is normalized to intrinsic size, survives display resizing, and invalidates visibly on replacement. |
| US-06 | Share a child between topics | One primary home, one or more reference parents, one rendering, a see-also link. |
| US-07 | Review in the outline | Same primary structure, page starts visible, anchored branches marked, references not duplicated. |
| US-08 | Study in Continuous and Page | Children right or wrapped, callouts attached, reference edges distinct, page navigation changes only the view. |
| US-09 | Reorganize without losing children | The subtree, anchors and outgoing branches move; the old primary edge is removed; undo restores. |
| US-10 | Recover a broken anchor | Branch and content remain, the broken state is visible in the block and in Health, repair keeps IDs. |
| US-11 | Export a page PDF | One PDF page per derived page, every block once, no cut content, markers, real selectable text. |
| US-12 | Recover from a crash | A recovery path is offered; the last good document is intact. |
| US-13 | Find a block | Search covers text, code, LaTeX and labels; a result reveals the block in every layout. |
| US-14 | Review page breaks | Page starts are visible in Continuous; a manual hint is available; Page and PDF use the same breaks. |
| US-15 | Work across documents | Independent tabs and packages in a chosen library; search shows document, chapter and page. |
| US-16 | Bring a note from an agent | A `.md` file opens as a flat guest file for reading and editing; the app never builds a forest or runs an agent. |

---

## 4. Data model

### 4.1 Overview

A document is chapters, blocks, anchors, branches and assets. Branches are first-class records. The
primary branches form a forest; reference branches form a general directed graph on top of it.
Pages are derived and are not entities.

| Entity | Purpose |
|---|---|
| **Document** | Owns chapters, blocks, anchors, branches, assets and reserved annotations. |
| **Chapter** | An ordered group of top-level blocks. |
| **ContentBlock** | Zero or more anchors; zero or one primary parent; zero or more reference parents; zero or more outgoing branches. |
| **Anchor** | Belongs to exactly one block; source of zero or more branches. |
| **Branch** | One source (block or anchor), one target block, role primary or reference. |
| **Asset** | Referenced by image content, stored once per content hash. |
| **Derived page** | Paginator output; never stored. |

Two layers exist. **Document semantics** are canonical and survive save/load: chapters, blocks,
anchors, branches, assets, schema version. **View state and page settings** are personal and live
outside `document.json`.

### 4.2 Document

```ts
interface Document {
  schemaVersion: number;   // 2
  id: string;
  title: string;
  createdAt: string;       // ISO 8601 UTC
  updatedAt: string;
  revision: number;        // increments once per committed transaction
  chapters: Chapter[];
  blocks: Record<string, ContentBlock>;
  anchors: Record<string, Anchor>;
  branches: Record<string, Branch>;
  assets: Record<string, Asset>;
  annotations?: unknown[]; // reserved, empty
  extensions?: JsonObject;
}
```

`revision` supports optimistic concurrency (`baseRevision`); it is not content. Unknown fields at
every level are preserved.

**What is not here.** Since schema v2 the document has no `pageSetup`, no
`manualBreakBeforeBlockIds` and no `viewState`. Page setup, page theme, density, chrome and manual
break hints are **personal settings** with a global default and a per-document override
(§4.7). View state belongs to the shell and may be discarded.

**Chapters.** A chapter has `id`, optional `title` and an ordered `topLevelBlockIds` list. Each
listed block is a root content block. A chapter may have several top-level blocks. Every block
belongs to the chapter of its top-level ancestor; a block cannot appear in two chapters.

**Pages are not stored.** There is no `pages` array. A continuation marker is derived; it is not a
second block or a page assignment. The document must not contain a second canonical copy of block
content, branch structure, chapter order or page layout.

### 4.3 ContentBlock

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Stable, opaque, never reused. |
| `label` | string | no | Short label for the outline, page card and PDF; derived when absent. |
| `content` | structured body | yes | ProseMirror-shaped JSON; may be empty. |
| `border` | `none \| subtle \| strong` | no | Optional visual border. |
| `createdAt`, `updatedAt` | timestamp | no | Diagnostics. |
| `extensions` | object | no | Unknown fields preserved. |

A block is the unit of identity, branching and layout. Its body may contain paragraphs, headings,
lists, code, display math, images and tables; there is no exclusive block "type" enum. This is the
closed granularity decision: a rich body, not a single content node.

Content must be able to carry inline anchor marks (or the equivalent binding). An anchor mark is
part of the block's content, not a UI decoration.

### 4.4 Anchor

```ts
interface Anchor {
  id: string;
  blockId: string;
  kind: 'text' | 'formula' | 'code' | 'image';
  selector: JsonObject;
  quote?: string;
  prefix?: string;
  suffix?: string;
  occurrenceHint?: number;
  lastKnown?: JsonObject;
  repairFlags?: string[];
  createdAt?: string;
  extensions?: JsonObject;
}
```

| Kind | Binding | Fallback selector | Geometry |
|---|---|---|---|
| **Text** | Inline mark carrying `anchorIds` on every text node of one contiguous run. | `quote` + `prefix` + `suffix` + `occurrenceHint`. | Union rectangle of the range; attach at the right edge of the last line. |
| **Formula** | `attrs.anchorIds` on the formula node; a term adds a LaTeX substring selector. | `latex` + `occurrenceHint` + LaTeX context. | Formula rectangle for a whole formula; best-effort term rectangle, otherwise the formula with the term in the marker. |
| **Code** | `attrs.anchorIds` on the code block plus quote/offset selector. | `quote` + context + `occurrenceHint`; offsets are a hint. | Token or line range; otherwise the code block. |
| **Image** | `attrs.anchorIds` on the image node plus asset ID and normalized rectangle. | `assetId` + `rect` normalized 0–1 to intrinsic size. | Region scaled to the displayed image; a point is a zero-size region with a marker. |

**Binding shape.** The content binding is canonical; the selector is the durable repair
descriptor. A text anchor is one contiguous binding; a second disjoint run is a violation. Atomic
nodes use an additive `attrs.anchorIds` array, sorted by ID so serialization, diffs and undo are
deterministic. Empty arrays and marks with no IDs are removed. Creating an overlapping anchor
merges its ID into the existing mark's array; it never adds a second mark.

**Selector and mirrors.** `selector` is canonical. The top-level `quote`, `prefix`, `suffix` and
`occurrenceHint` are compatibility mirrors: both are written from the same values, and on read
`selector` wins. A disagreement loads with a warning and a `selector-mismatch` repair flag; it is
not silently rewritten. The anchor ID is never inside `selector`.

**Derived state.** `resolved`, `ambiguous`, `broken`, `idle` and `block-missing` are derived from
content, selector and assets; never stored. `lastKnown` is an advisory repair hint and is never read
by resolution, layout or export. A record without a binding resolves by selector; a mark without a
record is inert.

**Text projection.** A text anchor may span inline math or images. The selector `quote` uses plain
text: text contributes its text, inline math its LaTeX source, an image its alt text or `U+FFFC`,
and paragraph or hard-break boundaries `\n`. The mark remains truth. A text anchor may span
paragraphs or list items but must not cross a display-math node, an image, a code block or a
table-cell boundary; a cross-cell selection is rejected.

**Units.** Code offsets are Unicode code points, never platform string indices; offsets are a hint.
Image rectangles are 0–1 relative to intrinsic dimensions, never display pixels. Anchor IDs are
immutable: repair changes the selector and binding, not the ID. One anchor never spans two blocks.

**Compatibility.** Anchor marks and `anchorIds` are additive; older readers preserve them and new
readers accept both `anchorId` and `anchorIds`. No migration is needed for anchors.

### 4.5 Branch

```ts
interface Branch {
  id: string;
  source: { blockId: string; anchorId?: string };
  targetBlockId: string;
  role: 'primary' | 'reference';
  order: string;          // fractional, unique per (port, role)
  label?: string;
  createdAt?: string;
  extensions?: JsonObject;
}
```

- A branch is an assertion, not an embed. Transclusion is out of scope.
- A non-root block **must** have exactly one incoming primary branch; the primary subgraph must be
  acyclic.
- A block may have zero or more incoming reference branches; those may form cycles.
- A branch must not target its own source block.
- A branch must not duplicate another branch with the same source and target, **regardless of
  role**: one edge per source-target pair, with `role` as a property. On load, a legacy pair keeps
  the primary edge and drops the reference duplicate with a warning.
- An anchored source must reference an anchor that belongs to the source block.
- A **port** is the block itself or a specific anchor. `order` is unique within `(port, role)`;
  primary order drives layout and outline, reference order drives see-also lists.
- A target must exist. Deleting a primary branch makes the target a root; it deletes neither the
  target nor its subtree.
- Reference branches must not affect outline order, layout or pagination.

### 4.6 Primary forest and outline order

Every block is a root or has exactly one primary parent; the forest is acyclic. Reference branches
are ignored by traversal.

Chapter assignment: every root appears exactly once in exactly one chapter's `topLevelBlockIds`;
every non-root belongs to the chapter of its top-level ancestor; a block never appears in two
chapters.

Outline order is a depth-first traversal:

1. Chapters in order.
2. Top-level blocks in `topLevelBlockIds` order.
3. For each block, its **anchored primary children** first, ordered by anchor position (start,
   then anchor ID), and within one anchor by branch order.
4. Then its **direct primary children** in branch order.
5. Never recurse through reference branches.
6. Page-start markers are inserted where the paginator places them; they are not structural nodes.

Anchored-first is closed and shared by Outline, Continuous, Page and PDF. Derived pages are
numbered in reading order. Block labels (`1`, `1.1`) are generated, not stored.

**Shared children.** A shared child appears once in every view. Reference contexts show a see-also
link to the derived page; they never repeat content or add an outline entry.

**Default branch role.** Branching to a block that already has a primary home creates a reference
edge. Branching to a top-level block adds it as a primary child unless the user chooses
"reference only". **Make home** promotes a reference edge to primary and demotes the old primary to
reference; it is disabled when the target is already a root, where the UI offers **Move here** or
**Add as child**.

### 4.7 Page settings and view state (outside the document)

Page settings are personal: a global default plus a per-document override, keyed by document ID.

| What | Global | Per-document override |
|---|---|---|
| Page size, orientation, margins | yes | yes |
| Theme: presets, density 0.6–1.2, typography, vertical gaps, packing | yes | yes |
| Chrome: header, footer, page number | yes | yes |
| Manual break hints | — | yes |
| Layout, mode, page, zoom, scroll, selection, collapse | — | view state only |

**Page setup.** A4: 210 × 297 mm portrait, 297 × 210 mm landscape; one orientation per document;
margins from the setup (20 mm default). The content area is the page minus margins.

**Manual break hints.** A hint asks the paginator to start a page before a block. It is honoured
only when the block can start a row; otherwise it is reported and the paginator's actual break is
used. Hints are pruned when the block disappears.

**View state** is non-canonical. Reopening a document may restore it, but losing it never loses
content.

### 4.8 Assets

- An asset has `id`, `path` (relative to the package), `mime`, optional `bytes`, `width`, `height`,
  `alt` and `originalName`.
- Bytes are stored under `assets/` and addressed by content hash; identical bytes are stored once.
- Image nodes reference the asset ID and may carry a normalized region.
- Removing an asset that is still referenced is refused; unused assets are reported in Health and
  can be moved to the OS Trash after a preview.
- A missing asset renders the app placeholder and is reported; it never breaks the document.

### 4.9 Annotations (future)

`annotations` is reserved and empty. Highlights are a content mark, not this layer. Ink, page
notes and frames are out of scope and must not be assumed by layout or export.

### 4.10 Invariants

1. IDs are unique across blocks, branches, anchors and assets; an ID is never reused.
2. Every non-root block has exactly one primary parent; the primary subgraph is acyclic.
3. Reference edges may cycle and never change position, outline order or pagination.
4. Every root is listed exactly once in one chapter; every non-root inherits its chapter.
5. Sibling order is unique per parent and supports insertion between neighbours.
6. Sibling, top-level and chapter order are the only spatial degrees of freedom.
7. Pages are derived; no page container, synthetic super-root or page assignment is stored.
8. Page size, orientation, margins, theme, density, chrome and manual breaks are personal settings,
   not document data.
9. Normal blocks are atomic. A long block continues only at a paragraph, list item, blockquote
   paragraph, between code lines, or between table rows; never inside a line, image, formula, code
   line or table row.
10. A continuation is one block with markers, never a second copy.
11. A table row is atomic; a row taller than the page content box is a defect, not a cut.
12. Layout and pagination are deterministic and idempotent for the same document, settings and
    viewport.
13. Selection, focus, zoom, page, scroll and collapse are view state, never document state.
14. A broken anchor never deletes a branch; a destructive action is undoable or confirmed.
15. A load-time projection that cannot represent legacy content refuses the conversion or preserves
    the original; it is never written back silently.
16. Unknown fields and unknown content nodes are preserved.
17. A `.md` guest file is never converted into a forest automatically.

### 4.11 Illustrative schema

```json
{
  "schemaVersion": 2,
  "id": "doc_7f3a",
  "title": "Linear algebra — eigenvalues",
  "createdAt": "2026-11-18T09:00:00.000Z",
  "updatedAt": "2026-11-18T10:12:00.000Z",
  "revision": 42,
  "chapters": [
    { "id": "ch_1", "title": "Eigenvalues", "topLevelBlockIds": ["b_1"] }
  ],
  "blocks": {
    "b_1": {
      "id": "b_1",
      "content": {
        "type": "doc",
        "children": [
          { "type": "paragraph", "children": [{ "type": "text", "text": "Definition" }] }
        ]
      }
    }
  },
  "anchors": {},
  "branches": {
    "br_1": {
      "id": "br_1",
      "source": { "blockId": "b_1" },
      "targetBlockId": "b_2",
      "role": "primary",
      "order": "a0"
    }
  },
  "assets": {}
}
```

### 4.12 Shared-child validation

On load and at the command layer: at most one primary edge per target; no primary cycle; every edge
endpoint resolves; every anchor belongs to its declared block; sibling order is unique per parent;
no branch duplicates the same source-target pair. Failures are specific (which ID, which edge) and
do not partially mutate.

### 4.13 Platform neutrality

The model is plain JSON: no DOM nodes, no CSS geometry, no absolute file paths, no machine-specific
values. Geometry that must survive a platform change (image regions, code offsets) is normalized as
described in §4.4.

---

## 5. Operations

### 5.1 Command model and undo

Every mutation goes through a typed command; the UI never mutates the model directly. A command is
a transaction: it validates, applies atomically, and returns either a new document or a specific
error. `revision` increments once per committed command. Undo restores the previous document and
selection; a multi-step action (create an anchored child) is one entry. Undo is session-only;
reopening starts a fresh stack. Collapse, view switches and navigation are not undoable.

### 5.2 Block operations

| Command | Effect |
|---|---|
| `block.create` | Create a block and its primary branch under a parent or chapter. |
| `block.editContent` | Replace a block body; the canonical content edit. |
| `block.rename` | Set the label. |
| `block.delete` | Delete a block with defined child semantics (promote, reparent or cascade), undoable. |
| `block.move` | Change the primary parent and order. |
| `block.split` | Split at a caret into two blocks; anchor marks are preserved or flagged. |
| `block.merge` | Merge with the previous sibling; marks and anchors are preserved or flagged. |

Split scope is deliberately minimal: a caret inside a text block. Structural deletion is explicit;
Backspace at the start of a block never crosses the boundary.

### 5.3 Branch operations

| Command | Effect |
|---|---|
| `branch.create` | Create a primary or reference edge from a block or anchor. |
| `branch.createFromSelection` | Create an anchor from the selection and the branch in one transaction. |
| `branch.delete` | Remove an edge; a primary target becomes a root. |
| `branch.reorder` | Change order within a port and role. |
| `branch.relabel` | Set the see-also label. |
| `branch.makeHome` | Promote a reference edge to primary and demote the old primary. |
| `branch.moveHere` | Make a block primary here, deleting the old primary if any. |
| `branch.demote` | Turn a primary edge into a reference edge. |

### 5.4 Anchor operations

| Command | Effect |
|---|---|
| `anchor.create` | Create an anchor record and its content binding. |
| `anchor.repair` | Replace the selector and binding; the ID survives. |
| `anchor.attachToBlock` | Fall back to the whole block while keeping the branch. |
| `anchor.delete` | Remove an idle anchor explicitly; never implicit. |

### 5.5 Structure and ordering operations

Chapters: `chapter.create`, `chapter.rename`, `chapter.reorder`, `chapter.delete` (content is
preserved or confirmed). Documents: `document.create`, `document.rename`. Restore:
`structure.restore` for a failed mutation. Ordering uses fractional strings; insertion between two
neighbours updates one order value.

### 5.6 View operations

Layout (`continuous` | `page`), mode (`edit` | `read`), page, zoom, scroll, selection, focus and
collapse are view state. Switching layout preserves the mode and the selected block. Page Edit
opens one single-block overlay over the page geometry.

### 5.7 Persistence, export and future operations

Save, export and recovery are described in §10 and §11. Future operations (agent commands,
annotations) need an ADR and are not part of v1.

---

## 6. Views and interaction

### 6.1 Shared principles

Outline, Continuous and Page read the same document and share IDs, order, selection and collapse
state. No view keeps a private copy. Navigation never mutates the document. `docs/ux.md` owns the
interaction detail; this section states the normative behavior.

### 6.2 Outline

A depth-first tree of chapters and primary children. Row anatomy: collapse control, label or first
line, anchor marker, reference indicator, page start. Anchored children appear under their block in
anchor order. Reference edges appear as see-also links, never as a second row. The outline is the
fastest structural editor: create, split, merge, indent, outdent, reorder and move live here.

### 6.3 Continuous and Page

**Continuous** is a vertical, continuous rendering with content-driven widths and page-start markers
derived from the paginator. It has Edit and Read. The canvas is 3,200 px wide with horizontal scroll
for deep chains; the placement budget is 3,120 px. It has no page geometry and no page model: page
starts are markers only.

**Page** renders the derived A4 pages in one column, pages touching with a 1 px seam, free scroll.
Read is exact and read-only. Edit is opt-in: one single-block overlay over the same geometry and the
same paginator; committing calls `block.editContent` and produces one structural undo entry. The
canvas header carries find, a pager (`N / M`, typable), a zoom stepper (50–200 %, 100 % = fit
width) and the layout/mode segments. Only the visible pages ±2 are mounted over exact-size
placeholders.

**Modes.** A mode is not a layout. Switching layout preserves the mode and the selected block.
Entering Read closes any open in-place editor and blocks every document transaction, including
in-place node-view controls. Every pointer action has a keyboard path.

### 6.4 Synchronization

Content, selection, focus, collapse and reading position stay consistent across views. Switching
views restores the nearest equivalent position by block ID, not coordinates. A mode switch creates
no undo entry. Page Edit commits are structural edits like any other and appear once in history.

### 6.5 Navigation and context

Breadcrumbs show chapter and ancestors. Page navigation changes only the viewed page. Selecting a
search result, a see-also link or a health row reveals the block: ancestors expand, the layout
switches if needed, and the derived page is brought into view without a document edit. Find covers
text, code, LaTeX and labels, with per-occurrence highlights painted over the mounted pages.

### 6.6 Editing

One active block editor at a time. Text edits are ProseMirror transactions; structural actions are
commands. Inline code, formulas, code fences, tables and images use in-place node views. Read mode
disables them. Paste and drop are normalized through the same schema; rich content from a guest
file keeps its marks, tables, formulas, code and images.

### 6.7 Keyboard

The shipped catalogue is `docs/design/shortcuts.md`; the rules are:

- Application chords are matched through one catalogue (`lib/shortcuts.ts`), never a second
  `event.key` comparison.
- One chord has one meaning on one surface; an overlay owns the command surface while it is open.
- Shortcuts never fire while typing in text, code or math, except editor-local keys.
- Every pointer action has a menu item and a keyboard path.

### 6.8 Accessibility

Keyboard-only completion of every flow; visible focus; labels and roles on interactive elements;
screen readers announce block role, selection, branch, anchor, page number and page change;
contrast meets WCAG AA for text and 3:1 for meaningful non-text states; reduced motion respected;
no meaning by color alone. The Page layout is light paper in both themes; the chrome follows the
app theme.

### 6.9 Visual constraints

Clean, Obsidian-like, minimal. Dark mode default, light theme available, page paper light in both.
One accent, one type scale, restrained chrome. No gradients, glows, glass, emoji icons, decorative
shadows, KPI tiles or marketing layouts. The PDF keeps the paper look.

### 6.10 View state

Layout, mode, current page, zoom, scroll, selection, focused block and collapsed blocks are
non-canonical. They are stored per document outside `document.json` and may be dropped without
losing content.

---

## 7. Adaptive layout and pagination

### 7.1 Inputs and outputs

Inputs: the primary forest, block content, measured node sizes, the page settings, the manual break
hints and the viewport width. Outputs: a continuous layout (rectangles, placements, edges, trunks),
a page plan (page count and breaks), and a defect list. The same output feeds Continuous, Page
Read/Edit and the print model.

### 7.2 Geometry

- Continuous: content-driven widths; a right group occupies the space it needs; the canvas does not
  force a wrap at the window edge.
- Page: a fixed content box per page, derived from page size and margins.
- Page vertical gaps are three personal Page settings, each 0–96 px with a per-document override,
  consumed by Page Read/Edit, measurement and PDF; density never scales them:
  - **Child gap** (`PageTheme.siblingGap`, default 18) sets the parent → below-child gap, the child
    → child stack, the next sibling after a previous subtree and the callout-stack → child
    transition.
  - **Top-level gap** (`PageTheme.chapterGap`, default 32) sets the vertical gap between top-level
    blocks in a chapter.
  - **Callout gap** (`PageTheme.calloutGap`, default 16) sets the parent → anchored-callout gap for
    below placements and the callout → callout stack. In callout mode A the first callout stays in
    the right lane at the parent's y, so only the callout → callout gap applies there.
- The Page edge corridor is an invariant and is horizontal only: 18 px from the parent card's right
  edge to the child card's left edge (4 lead + 14 stem), child indent 26, callout card indent 38,
  callout right gap 24, below-trunk insets 12 (children) and 24 (callouts). None of the three
  vertical settings moves it, and density never scales it.
- A block's width is content-driven and capped by `maxCardWidth`.

### 7.3 Tree packing (Page, `beside`)

1. Place chapters in order; each chapter starts at the top of a new page.
2. Top-level blocks stack vertically in chapter order.
3. For a parent, compute the direct-child group and the callout group.
4. If the whole direct-child group fits to the right of the parent, place the group at the parent's
   y (beside). Otherwise place the whole group below the parent at
   `min(parent.x + wrapIndent, pageContentLeft + maxWrapIndent)`, so a wrapped group keeps a visible
   stem.
5. Recurse: every child keeps its own children to the right only if they fit there; otherwise that
   subgroup wraps below it.
6. A group that cannot fit is atomic: the group moves below; it is never split across siblings.
7. Only the direct-child group is beside; callouts follow §7.4.

Comfortable and compact presets change density only, never this topology. `stacked` is the legacy
geometry for explicit compatibility; `compaction` is a density-lab oracle and is not a preset.

### 7.4 Anchored callouts

An anchored branch renders as a callout attached to its anchor. The mode is chosen per parent from
the placed card and the resolved page width:

- **Mode A** (right lane): used when at least `calloutModeMinWidth` (240 px) of free space exists to
  the right. Callouts sit in the right lane at `calloutRightGap` 24; direct children go below. The
  group leader leaves the parent's right port and the anchor mark identifies the branch.
- **B2** (two below trunks): direct children below at trunk inset 12 and indent 26; callouts below
  at inset 24 and indent 38; callouts come first.
- **Stacked**: the only fallback when neither fits; legacy callout geometry.

A callout may paginate like any other branch. It is never clipped or auto-scaled; an impossible one
is a defect.

### 7.5 Paginator

- A page is a slice of the continuous layout, numbered in reading order.
- Breaks fall between blocks first. Chapter starts always begin a page.
- A long block continues only at a paragraph, list item, blockquote paragraph, between code lines,
  or between table rows. A text line, image, formula, code line and table row are never cut.
- A continuation shows a ghost parent at the top of the next page and a "continues on page N" marker
  at the bottom of the previous one. The block exists once.
- A manual hint starts a page before its block only when the block can start a row; otherwise it is
  reported and the actual break is used.
- Pagination is deterministic and idempotent. No empty trailing page.
- A block too wide, or too tall with no safe boundary, is a defect: warned, export blocked, never
  clipped or scaled.

### 7.6 Collapse

Collapse hides primary descendants and anchored callouts in Outline and Continuous, reclaims space,
shows a hidden count and keeps an edge stub. It is view state, shared by both views, and never
removes content from Page or PDF.

### 7.7 Shared children and reference edges

A shared child renders once, at its primary home. Its position and page breaks depend only on the
primary parent. Reference edges are visually distinct, never move a node and never change
pagination. A reference to another page ends at a page-edge indicator with the target page; no line
leaves the page. Anchor-first order is shared by every view.

### 7.8 Chapters and top-level blocks

Each chapter starts at the top of a new page. Top-level blocks stack vertically; a top-level block is
itself a content block, never a placeholder. Inserting, deleting or reordering chapters preserves the
internal layout of the other chapters; only page numbers change.

### 7.9 Stability and incremental layout

Authoring uses incremental reflow: only the dirty subtree and the affected sibling group move. A
page setup, chapter or orientation change recomputes the whole layout. There is no freeze mode in
v1.

Stability gates: adding one block keeps at least 95 % of pre-existing blocks within 2 px in
continuous coordinates; deleting one moves survivors outside the affected subtree and sibling group
by at most 1 px; unrelated chapters do not move. Page breaks may change.

### 7.10 Defects and collisions

- Nodes never overlap after applying the minimum clear gap, including callouts, labels and trunks.
- A block too wide for the page is `content-too-wide`.
- A block too tall with no safe boundary is `content-unbreakable`.
- An unhonoured manual hint is reported.
- A defect names the block and offers resolution; export is blocked until it is resolved, except
  where the UX allows exporting with the paginator's actual breaks.

### 7.11 Performance strategy

Measure only what is visible. Continuous renders the mounted subtree with virtualization and
collapse; Page mounts visible pages ±2; both cache measurement and invalidate on content, width or
font change. Layout touches the dirty subtree, not the document. Pagination is cached and
invalidated by dirty content only.

### 7.12 Non-goals

No free positioning, pins, nudges, fixed depth columns, manual resize (v1), stored page containers,
second paginator, CSS paged-media breaks, or a separate reader layout.

### 7.13 Tolerances

Anchor alignment to its block within 2 px at 100 %; callout alignment to the anchor's left within
2 px; node gap at least the minimum clear gap; print geometry parity within a small tolerance
asserted by the PDF gate.

---

## 8. Anchor lifecycle

### 8.1 Creation

An anchor is created with a branch, never standalone. The command creates the record and the content
binding in one transaction. Text: one contiguous mark over the selection. Formula: node binding plus
the LaTeX substring. Code: node binding plus the quoted range. Image: node binding plus the
normalized region. A selection that crosses blocks, display math, an image, a code block or a table
cell is rejected with a message.

### 8.2 Resolution

Resolution order: the content binding, then the selector (`quote` + context + occurrence hint). An
exact unique match resolves silently. Multiple candidates produce `ambiguous`; repair requires an
explicit choice. No candidate produces `broken`. Ambiguity never auto-resolves to a different
occurrence.

### 8.3 States

| State | Meaning |
|---|---|
| `resolved` | The binding or selector resolves to a span. |
| `ambiguous` | Several candidates; repair needs confirmation. |
| `broken` | No candidate; the branch is preserved and surfaced. |
| `idle` | A record with no branch; the marker is hidden; removable explicitly. |
| `block-missing` | The declared block no longer exists; surfaced in Health. |

State is derived and never stored.

### 8.4 Detection

Resolve on load, after an edit that touches the block, after a split/merge, after an image
replacement, and when the anchor health surface opens. A mark without a record is inert; a record
without a mark resolves by selector.

### 8.5 Repair

The broken state shows a marker in the block and a row in Health. Actions: relink to a new selection,
attach to the whole block, or delete the anchor. Repair keeps the anchor and branch IDs; it rewrites
the selector and binding. An idle anchor is removed only by an explicit action.

### 8.6 Edit effects

| Edit | Effect |
|---|---|
| Text before/after the span | Anchor moves with the text. |
| Text inside the span | Anchor survives if the mark survives; otherwise broken. |
| Split inside the anchor | Both parts keep the ID; the anchor keeps a `split-inside-anchor` repair flag. |
| Delete the anchored text | Broken; the branch and quote remain. |
| Duplicate the block | The duplicate keeps its own marks; anchors do not retarget. |
| Replace an image | The image anchor is broken unless the new asset matches; never a silent wrong region. |

### 8.7 Geometry

Text: the union rectangle of the marked range, attached at the right edge of the last line. Formula:
the node rectangle, with a best-effort term rectangle. Code: the token or line range, otherwise the
block. Image: the normalized region scaled to the displayed image; a point is a zero-size region
with a visible marker. Geometry never enters the document; it is recomputed after measurement.

### 8.8 Multi-block anchors

Rejected in v1. A selection spanning blocks produces a clear message and creates nothing.

### 8.9 Health and export

Health lists broken and ambiguous anchors with quote, source block and actions, and audits structure
(orphan edges, duplicate orders, invalid chapters). Locate reveals the block. Export warns about
broken anchors and renders the branch from the whole block; it never drops it.

### 8.10 Policy: formula, code, image

Formula terms are best-effort; whole formulas are precise. Code offsets are hints, and quote plus
context is the fallback. Image regions are normalized to intrinsic size, so display resizing is
safe; replacement or crop invalidates unless the asset hash still matches. In every case a broken
anchor keeps the branch.

---

## 9. Content model

### 9.1 Requirements

Rich text with inline marks; paragraphs, headings, lists, quotes; fenced code with a language;
inline and display math; images with optional regions; tables with inline-only cells; Unicode
including CJK, emoji and RTL; anchors carried by the content itself; unknown nodes preserved.

### 9.2 Nodes and marks

Block nodes: `doc`, `paragraph`, `heading` (levels 1–3 in a note), `bulletList`, `orderedList`,
`listItem`, `blockquote`, `codeBlock` (with language), `mathBlock`, `image`, `table`, `tableRow`,
`tableCell`, `horizontalRule`. Inline: `text`, `hardBreak`, `inlineMath`.

Marks: `anchor` (semantic binding, carries anchor IDs), `highlight` (one `tone`: blue, green, amber,
rose), plus bold, italic, strike, code and link. Unknown marks and nodes survive validation and
save.

### 9.3 Authoring behavior

Enter creates a block; Shift+Enter inserts a line break. Tab and Shift+Tab change block structure;
`⌘]` and `⌘[` indent list items. Code fences auto-close and offer a language. Formulas use `$…$` and
`$$…$$` with in-place editing. The table picker inserts N×M; Tab appends a row; cells are inline
only. Images are inserted from disk and copied into the package.

### 9.4 Decision: structured JSON canonical

Structured ProseMirror-shaped JSON is canonical. Markdown is an import/export and guest-file format.
This is closed: it keeps anchors, tables and math lossless inside the app, while Markdown remains
portable outside it. A Markdown-native canonical format would need anchored spans and regions that
Markdown cannot express.

### 9.5 Adapter

A narrow adapter converts Markdown to content and back for guest files and export. The adapter never
invents structure: headings stay headings, and the result is a flat content body. The canonical
document is never rebuilt from Markdown.

### 9.6 Block granularity

A block is a rich body, not a single node. A block with only code, only a formula or only an image
is a normal block whose body contains that node. This is closed (D2) and drives identity, branching
and layout.

### 9.7 Import and export expectations

Markdown import produces a flat guest file, not a forest. Export is best-effort for formatting;
it never claims byte-identical round-trip. Anchors and branches are not representable in Markdown
and are reported as lost if exported.

### 9.8 Limits and safety

Sanitize Markdown/HTML at every boundary: no script, iframe or event handlers. Links open externally
with confirmation. LaTeX is limited to KaTeX-safe commands. SVG is treated as untrusted or
rasterized. Remote images are not fetched. Table cells are inline only; a legacy cell with block
content opens in the recovery state and is never flattened.

---

## 10. Persistence

### 10.1 Document package

A note is a folder package:

```
My note/
  document.json
  assets/
    <hash>.<ext>
```

`document.json` is UTF-8 canonical JSON. Assets are content-addressed and shared within the package.
Backups are **not** stored in the package; they live in app support.

### 10.2 Canonical and derived

Canonical: `document.json`. Derived: layout, pages, markers, labels, statistics. Personal: page
settings, view state, shell state. The document never contains derived or personal data.

### 10.3 Save and autosave

- Save is atomic: write a temporary file, fsync, rename. A crash leaves the old or the new complete
  file, never a partial one.
- Autosave is debounced and off the typing path; it does not run during migration or export.
- Save on quit is reliable and flushes pending writes.
- A package lock prevents two writers; a stale lock is detected and taken over only when safe.
- A failed save is visible in the shell; the app never claims a save that did not happen.

### 10.4 Backups and recovery

- Backups: `<appSupport>/backups/<documentId>/<kind>-<timestamp>-r<revision>.json`.
- Retention: 20 autosave snapshots, 7 daily snapshots, pre-migration snapshots for at least 7 days.
  The autosave floor is 10.
- Recovery offers the newest valid backup plus the canonical file when it is readable.
- Restore writes atomically and keeps the original until the new file is complete.
- Backup retention is by **content reference**: an image becomes reclaimable only when the backups
  that show it rotate out. That rotation is the grace period.

### 10.5 Load and validation

Load checks: JSON shape, `schemaVersion`, unique IDs, one primary parent per non-root, acyclic
primary forest, resolving endpoints, anchors belonging to their block, unique sibling order, no
duplicate source-target branch, assets present. Failures are specific and do not partially apply.
A newer schema is read with a warning when safe, or refused read-only; it is never downgraded by a
write.

### 10.6 Schema versioning and migrations

`schemaVersion` is 2. Version 1 → 2 removed `pageSetup`, `manualBreakBeforeBlockIds` and `viewState`
from the document; page settings moved to personal settings. Migrations are pure, forward, and
backed up before writing. A migration failure leaves the original intact. Unknown fields are
preserved.

### 10.7 Unknown fields and content

Unknown object fields and unknown content nodes or marks are preserved on save. An unknown field is
never silently dropped; a load projection that cannot represent legacy content refuses or keeps the
original with a warning.

### 10.8 Assets

Assets are validated on load: the record exists, the file exists, the hash matches when known. A
missing asset renders the placeholder and is reported, and the document still opens. Removing an
asset that is still referenced is refused. Unused assets can be cleaned through Health, with a
preview, and bytes go to the OS Trash.

### 10.9 Privacy and security

No telemetry, analytics or background network calls. File access is confined to the library and the
package; asset paths cannot traverse. No secrets in code or logs; note content is not logged by
default. PDF export fetches no remote resources.

### 10.10 Concurrency and external edits

A package lock prevents two app instances from writing. External modification is detected by content
hash or mtime before writing; the app refuses to overwrite silently. A conflict offers reload,
overwrite, or cancel. A `.md` guest file has no lock: it detects external change the same way and
offers the same choices.

### 10.11 Failure behavior

A failed save, migration, export or recovery leaves the document unchanged or recoverable. A corrupt
file is backed up before any recovery write. A destructive action is undoable or confirmed.

---

## 11. PDF export

### 11.1 Goals and non-goals

Goal: reproduce the Page layout as a real-text PDF that opens anywhere and is comfortable to study.
Non-goals: a separate reader PDF, a map export, annotations, or a second pagination engine.

### 11.2 Mode

One Page PDF: the Page layout in Read mode, all pages, from the shared paginator. There is no range
export in v1. Export is available from Continuous, Page, the palette, the menu and the Page toolbar.

### 11.3 Page setup and theme

The resolved personal settings apply: page size (A4), orientation, margins, compact/comfortable
theme, density, chrome (header, footer, page number), manual breaks. The paper is light in both app
themes; the chrome follows the print theme, not the app theme.

### 11.4 Pagination and page count

The print model consumes the paginator's pages; it never re-paginates and never lets CSS decide
breaks. Page count, size, orientation and margins are validated against the paginator before the
file is written. A mismatch, a blank page, or a wrong count is an export failure.

### 11.5 Order and fidelity

Reading order matches the outline. Anchored callouts appear at their laid-out position; continuation
markers and ghost parents match Page. No block is clipped. Tables break only between rows. Content
stays inside the margins.

### 11.6 Text, fonts, formulas

Body text is real text with an embedded font subset; no outlines or bitmaps. Math and code fonts are
embedded. Code keeps monospace and indentation. Missing glyphs and `�` are failures. Links are
emitted only if valid; otherwise none.

### 11.7 Arrows and borders

Arrows are vector, with a single arrowhead size and no shaft through the head. Trunks and page-edge
indicators match Page. Borders print with the resolved theme. Anchor markers do not print.

### 11.8 Fidelity expectations

Geometry parity within a small tolerance; a raster comparison is part of the gate. The PDF is not a
screenshot: the print DOM is the same structure with print CSS.

### 11.9 File name and metadata

The file name is `<title>.pdf`, with a safe fallback for an empty title. No date, author or metadata
in v1.

### 11.10 Verification

- Page count, page size, orientation and margins equal the paginator.
- Real text via `pdftotext`; no `�`, no blank page, no text as image.
- No cut line, image, formula, code line or table row; markers match.
- Fonts embedded; code and math readable.
- Raster parity within tolerance; print CSS metrics asserted.
- The 50+ page A4 gate and the 300-block timing gate pass.

### 11.11 Out of scope

Reader PDF, map export, page ranges, annotations, tagged PDF, PDF/A, and any app-specific annotation
workflow. Annotation happens outside the app with any standard tool.

### 11.12 Pipeline

1. Resolve settings and the measured run; compute a fingerprint (theme, page setup, manual breaks,
   document ID).
2. Build the print model from the real `layoutDocument` + `paginate` output.
3. Render it in a hidden window; wait for layout, fonts, images and KaTeX.
4. `printToPDF` with the resolved page size and numeric zero margins.
5. Inspect the produced PDF (page count, size, text, blank pages).
6. Write atomically (temp → inspect → rename) and report success or a specific failure.

The model rejects a missing or different fingerprint, page setup, manual-break set or document ID
before rendering. A dimensioned asset that disappears after measurement prints the app placeholder
and reports a warning.

---

## 12. Markdown guest file

A `.md` file anywhere in the library opens as a **guest file**:

- its own tab, titled by the file name; Continuous only, Edit and Read;
- parsed into the flat content schema and rendered with the same prose, code, math, table and image
  views;
- no chapters, blocks, branches, anchors, shared children or DAG; no document ID, revision, package
  lock or per-document page settings;
- no Page, no PDF, no Markdown export;
- edits save back to the same file: autosave plus `⌘S`, atomic write, UTF-8, one `.md.bak`;
- external change is detected before writing and offers Reload, Overwrite or Cancel; never a silent
  merge;
- local images resolve relative to the file, confined to its folder tree; remote images are not
  fetched;
- frontmatter is shown verbatim and read-only; raw HTML and unknown syntax are preserved as text;
- a large file above the documented cap opens read-only instead of freezing the window;
- copy from the guest file into a note preserves rich nodes; the reverse is not a goal;
- a file badge marks the tab, and forest chrome is hidden.

---

## 13. Edge cases

### 13.1 Structure and model

| Case | Behavior |
|---|---|
| Duplicate IDs, two primary parents, primary cycle | Rejected on load and at the command layer with a specific error; no partial mutation. |
| Reference cycle | Allowed; traversal never loops. |
| Reparent under own descendant | Rejected atomically. |
| Delete a block with children | Defined policy (promote, reparent or cascade), confirmed or undoable. |
| Empty document | Valid; shows guidance, never a dead end. |
| Chapter with no top-level blocks | Valid; no synthetic node is created. |
| Legacy primary+reference duplicate | Keep primary, drop reference, warn. |

### 13.2 Anchors

| Case | Behavior |
|---|---|
| Duplicate quote | Occurrence hint; ambiguous repair needs confirmation. |
| Split inside an anchor | Both parts keep the ID; repair flag. |
| Delete anchored text | Broken; branch and quote remain. |
| Replace an image | Broken unless the hash matches; never a wrong region. |
| Multi-block selection | Rejected with a message. |
| Mark without record | Inert; no phantom branch. |

### 13.3 Layout

| Case | Behavior |
|---|---|
| Block wider than the page | `content-too-wide`; export blocked; resolution offered. |
| Unbreakably tall block | `content-unbreakable`; export blocked. |
| Unhonoured manual break | Reported; the paginator's break is used. |
| Callout cannot fit | Defect; never clipped or scaled. |
| 1,000 blocks | Usable with virtualization, collapse and focus. |
| Deep chain in Continuous | Horizontal scroll; the canvas does not force a wrap. |

### 13.4 Files, assets and recovery

| Case | Behavior |
|---|---|
| Corrupt `document.json` | Recovery surface; backup offered; original kept. |
| Newer schema | Read-only or refused; never downgraded. |
| Missing asset | Placeholder + warning; document opens. |
| Failed save | Visible; no claim of success; document unchanged. |
| Crash mid-save | Old or new complete file; never truncated. |
| External modification | Refuse silent overwrite; offer reload/overwrite/cancel. |
| `.md` moved or deleted | Missing state; no silent recreate. |

### 13.5 PDF

| Case | Behavior |
|---|---|
| Blank produced page | Export failure, classified from the model or raster ink. |
| Dimensioned missing asset at print time | Placeholder + asset warning. |
| Count or size mismatch | Export failure. |
| Broken anchor | Exports with the whole-block fallback and a warning. |
| Landscape document | Preserves orientation and dimensions. |

### 13.6 Scale

| Case | Behavior |
|---|---|
| 300 blocks | Smooth authoring and export under the budgets. |
| 1,000 blocks | Usable with virtualization and collapse; measured, not promised. |
| Very large library | Library tree stays responsive; search is bounded. |

---

## 14. Performance and scale

### 14.1 Assumptions

Target machine: base Apple silicon Mac (M1, 16 GB), release build, fit-page and 100 % zoom, dark
theme, no DevTools, cold cache for open. Fixtures: 300 and 1,000 blocks.

### 14.2 Targets

| Metric | 300 blocks | 1,000 blocks |
|---|---|---|
| App cold start to usable window | < 3 s | < 3 s |
| Open to interactive | < 2 s | < 5 s |
| First content paint | < 1 s | < 2 s |
| Full layout p95 | < 50 ms | < 250 ms |
| Pagination p95 | < 30 ms | < 150 ms |
| Incremental layout (≤ 20 nodes) p95 | < 8 ms | < 8 ms |
| Keystroke to paint p95 | < 50 ms | < 50 ms |
| Pan/zoom frame p95 | ≤ 18 ms | ≤ 18 ms |
| Page switch p95 | < 100 ms | < 150 ms |
| Jump to page p95 | < 150 ms | < 250 ms |
| Autosave | < 150 ms | < 500 ms |
| PDF export | < 10 s | < 30 s |
| App RSS | < 600 MB | < 1.2 GB |

### 14.3 Degradation

300 blocks is guaranteed. 1,000 blocks is usable with virtualization, collapse and focus; only the
visible pages are rendered. Do not promise 5,000. A missing budget is fixed, scoped down, or
recorded in an ADR with a user-visible mitigation; never silently raised.

### 14.4 Measurement

Five runs, median and p95, machine and fixture hash recorded. Measure layout, pagination, page
switch and navigation separately. Numbers come from instrumentation, not from watching the screen.
Performance work ships separately from features.
