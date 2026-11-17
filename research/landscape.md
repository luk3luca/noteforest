# Spatial notes with anchored branches — landscape, stack, and risks

**Prepared:** 3 November 2026  
**Scope:** Mac-first study/notes app with content blocks, explicit directed branches from blocks **or anchored spans inside blocks**, a DAG, outline + canvas views over one document, Markdown/LaTeX/code, and real-text PDF export for Notability.  
**Method:** public documentation, specs, source repositories, issue trackers, and vendor pages. No hands-on benchmarking was performed. App-store and domain checks are point-in-time (3 Nov 2026) and are not legal advice. Claims are labelled **Fact** where a source directly supports them; **Opinion** where they are my judgement.

---

## Executive summary

### Top 5 recommendations

1. **Make the canonical document structured JSON, not Markdown.** Store block content as ProseMirror JSON, edges as first-class records, and anchors as stable IDs. Treat Markdown as an import/export format. ProseMirror position mapping to raw Markdown is genuinely hard; Logseq's move from Markdown-canonical to SQLite-canonical shows the same pressure at scale. (See §2, §4.)
2. **Build the v1 in Electron + React + TypeScript, with ProseMirror/TipTap, CodeMirror 6, KaTeX, React Flow, and Electron `printToPDF`.** This is the shortest credible path to rich blocks, real-text PDF, and a custom canvas. Tauri is smaller and elegant, but WKWebView PDF export is a known pagination trap. (See §5, §6.)
3. **Use a custom two-pass layout, not a global DAG layout.** Lay out a *primary* tree with a tidy-tree algorithm (d3-hierarchy / Buchheim), then place anchored callouts below their anchor with collision avoidance. Treat extra parents as reference edges that do not affect placement. Use ELK/d3-dag only for an optional "global reflow" or export. (See §3.)
4. **Print a linear "reader" PDF, not a screenshot of the canvas.** Render a dedicated print DOM in outline order, with anchored branches as margin callouts and a separate map page. Use CSS paged media and Electron `printToPDF`; verify the text layer with `pdftotext`/PDFKit, not by looking at the PDF. (See §6, §9.)
5. **Defer CRDTs and iPad handwriting.** Start with a command/undo stack, atomic autosave, and a versioned JSON bundle. Add Yjs/Loro only when collaboration or multi-device sync is committed. Ship Mac first; add iPad as a native PencilKit companion or a Tauri/Capacitor hybrid with a native ink layer, not as a web-canvas handwriting feature. (See §2, §8.)

### Top 5 risks

1. **Anchored edges are the differentiator and the hardest part.** Text anchors survive edits only if they are part of the document model (inline mark/ID), not raw offsets. Code tokens, formulas, and image regions each need a different anchor strategy. If this is not prototyped first, the product's core promise fails. (See §2.3, §4.5.)
2. **Scope creep into a full PKM/whiteboard.** Heptabase, AFFiNE, Notion, Obsidian, and Miro are large, well-funded products. The defensible wedge is narrow: *study documents where a specific claim, term, or formula visibly sprouts a branch*. Everything else is table stakes. (See §1.)
3. **PDF fidelity and pagination.** WKWebView `createPDF` is reported to produce a single long page; very long single-page PDFs can hit a WebKit compositing cap around 16,384 px. Notability can import PDFs, but some PDFs are not searchable depending on how they were created. Real-text export must be engineered and tested. (See §6.)
4. **Canvas performance at scale.** React Flow is DOM-based; maintainer guidance and field reports put the comfortable range around hundreds to roughly 1,000 nodes, depending on node complexity. `onlyRenderVisibleElements` helps at scale but adds re-initialization overhead. A study doc with 50–300 blocks is fine; a 5,000-block graph is not. (See §5.)
5. **Name and market crowding.** The new English `NoteX` list is almost entirely taken by existing notes/mind-map apps. `NoteMap`, `NoteTree`, `NoteGrove`, `NoteBranch`, `NoteWeave`, `NoteAtlas`, `NoteTrail`, `NoteField`, `NoteSpace`, `NoteCanvas`, `NoteScape`, and `NoteGraph` all have exact or near-exact products. Only `NoteCanopy` looks relatively clean on domains and app search, and even that is a weak, descriptive mark. (See §10.)

---

## 1. Existing apps: data models and UX

### 1.1 The product in data-model terms

The proposed model has four things that are rarely combined:

- **Content blocks** with Markdown/rich text, LaTeX, code, images, lists.
- **Explicit directed branches** between blocks.
- **Anchored branches** from a span inside a block (word, phrase, formula term, code token, image region).
- **Two views over one document:** outline for authoring, spatial canvas for studying.

Most tools have two of these. Almost none have all four. That is the opportunity and the warning.

### 1.2 Comparison table

| App | Core model | What it does well | Gap for this product |
|---|---|---|---|
| **Obsidian Canvas** | `.canvas` JSON with `nodes` and `edges`; edge endpoints are node IDs plus optional `fromSide`/`toSide`. Open JSON Canvas spec. | Open, local, MIT-licensed format; real notes can be cards; easy import/export; edges are simple and portable. | Edges are **node-to-node**, not span-anchored. Groups are inferred from bounds, not explicit children. Canvas is a separate file from the Markdown note, so it is not the same document. ([spec](https://jsoncanvas.org), [format](https://obsidian.md/blog/json-canvas), [HN discussion](https://news.ycombinator.com/item?id=39670922)) |
| **Heptabase** | Card library + whiteboards; a card can appear on multiple whiteboards; connections between cards. | Excellent visual study workflow, PDF cards/highlights, cards are first-class notes, multiple boards per card. | Connections are card-to-card. No evidence of block-level/span anchors; not primarily outline-first; not Markdown/LaTeX/code-first. ([wiki](https://wiki.heptabase.com/fundamental-elements)) |
| **Logseq** | Outliner of blocks; block references; Markdown or Org files in OG; DB version uses SQLite as canonical with a one-way Markdown mirror. | Block references/embeds are excellent; local-first; plain-text tradition; block IDs survive moves. | No native spatial canvas. The DB transition shows the cost of keeping Markdown as the source of truth. ([DB update](https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020), [block model](https://fictty.com/data-model/logseq)) |
| **Tana** | Everything is a node with an ID; supertags, fields, references, views. | Structured knowledge graph, typed objects, references, strong querying. | I found no spatial canvas in its public feature set; the model is powerful but heavy for quick study notes. ([nodes](https://outliner.tana.inc/learn/features/nodes-and-references), [supertags](https://outliner.tana.inc/learn/features/supertags)) |
| **RemNote** | Block/rem references; PDF reader with annotation; flashcards. | Study-specific: PDF annotation, spaced repetition, references. | No spatial canvas; visual structure is linear/outline-first. ([PDF reader](https://help.remnote.com/en/articles/6690975-learning-from-pdfs-and-files-with-the-remnote-reader)) |
| **Roam Research** | Outliner blocks with UIDs, block refs/embeds, daily notes, graph. | The canonical block-reference UX; transclusion is natural. | No spatial canvas; data is not open; visual thinking is secondary. ([block refs](https://roamdocs.fyi/help/block-references)) |
| **Muse / Allume** | Nested boards, cards, ink, PDF excerpts; Apple-only. | Beautiful spatial thinking, ink + cards, PDF context, Mac/iPad. | Not Markdown/LaTeX/code-first; no anchored span edges; deliberately limited formatting. ([Allume](https://allume.com)) |
| **Apple Freeform** | Infinite canvas with items, connectors, shapes, text, ink. | Native Apple feel, Apple Pencil, PDF export, free. | No structured outline, no Markdown/LaTeX/code, connectors are item-level, no portable open format. ([diagram connectors](https://support.apple.com/guide/freeform/add-a-diagram-frfm1e6c3d3e/mac), [PDF export](https://support.apple.com/guide/freeform/export-a-board-as-a-pdf-frfm201900c07/mac)) |
| **Miro** | Infinite collaborative whiteboard with frames, shapes, connectors. | Collaboration at scale, templates, ecosystem. | Not a document/outline tool; no block-level anchors; heavy for solo study. ([miro.com](https://miro.com)) |
| **Scrintal** | Cards on a canvas with connections; visual knowledge network. | Card-based visual note-taking, connections, research workflow. | Cloud-first, less code/math authoring, no evidence of span anchors or a true outline+canvas same-document model. ([scrintal.com](https://scrintal.com)) |
| **Kinopio** | Spatial cards, connections, boxes/lists; public API; JSON Canvas export. | Fast spatial thinking, delightful interaction, open export, API. | No outline/Markdown/LaTeX core; connections are card-level. ([kinopio.club](https://kinopio.club)) |
| **Napkin** | AI text-to-visual generator. | Fast diagrams/visuals from text; useful for explanation output. | Not a notes workspace; no persistent block graph or outline. ([napkin.ai](https://www.napkin.ai)) |
| **Whimsical** | Mind maps, diagrams, flowcharts, docs, boards; automatic layouts. | Polished auto-layout, collaboration, docs + boards. | Mind-map nodes are topics, not rich blocks; no block refs or anchored edges. ([mind maps](https://whimsical.com/mind-maps)) |
| **XMind** | `.xmind` zip with `content.json`: tree of topics + separate `relationships` array referencing topic IDs. | Stable topic IDs, tree + cross-links, outline view, polished mind mapping. | Topics are not Markdown blocks; relationships are topic-to-topic; no span anchors. ([format](https://file-extensions.com/docs/xmind), [relationships](https://xmind-help.github.io/en_US/relationship.html)) |
| **MindNode** | Tree of nodes + connections; outline and mind map share the same document. | Best-in-class outline/map duality; LaTeX; Apple-native; connections beyond hierarchy. | Nodes are short thoughts, not rich blocks; no span anchors; Apple-only. ([outlining](https://www.mindnode.com/support/guides/outlining), [features](https://www.mindnode.com/features)) |
| **TheBrain** | Thoughts linked in a plex; a thought can have multiple parents; typed/jump links. | Closest UX to a multi-parent DAG; navigation by context; link semantics. | Notes live inside thoughts; no block refs/outline-first authoring; no Markdown/LaTeX/code focus. ([multiple parents discussion](https://talk.macpowerusers.com/t/the-brain-has-gone-free-for-personal-use/45965), [review](https://www.seriousinsights.net/thebrain-14-review)) |
| **InfraNodus** | Text network: words/concepts as nodes, co-occurrence as edges. | Graph analytics, topic clusters, "structural gaps" — useful inspiration for study analytics. | Analysis tool, not an authoring canvas; no block/document model. ([method](https://infranodus.com/docs/text-network-analysis)) |
| **Notion** | Block tree; pages are blocks; synced blocks, backlinks, databases. | Block editor, databases, collaboration, export. | No spatial canvas; PDF export is page-oriented, not a study map; no span anchors. ([block API](https://developers.notion.com/reference/block)) |
| **Capacities** | Typed objects + properties + backlinks; boards are a view of existing notes. | Object model and daily notes; board is another lens, not a separate document. | Board connections are card-level; no anchored edges; not a code/math canvas. ([comparison](https://capacities.io/compare/heptabase)) |
| **Anytype** | Objects + properties/relations; local-first, encrypted, P2P sync; graph view. | Strong local-first object model; relations and graph. | Graph is global, not a curated study canvas; no outline+canvas same document; no span anchors. ([graph](https://doc.anytype.io/anytype/features/graph), [objects](https://doc.anytype.io/anytype-docs/getting-started/object-editor)) |
| **AFFiNE** | Blocks in Page Mode and Edgeless Mode; same doc can switch views; BlockSuite + Yjs + Electron. | Closest architecture: one block model, two views; local-first; open source. | Connectors are canvas elements; no span anchors; large/opinionated codebase; heavy to fork. ([page/edgeless](https://affine.pro/pagedoc), [blocks](https://docs.affine.pro/core-concepts/elements-of-affine/blocks)) |
| **AppFlowy** | Open-source Notion alternative: blocks, databases, boards, local-first. | Block editor and data views; open source. | No spatial canvas/anchored graph. ([GitHub](https://github.com/AppFlowy-IO/AppFlowy)) |
| **Zibaldone** (new, adjacent) | iPad handwriting + typed Markdown on pages + links/tags + knowledge graph. | Handwriting search, Markdown export, Apple Pencil, graph. | iPad-only; page/ink-centric, not block+anchored-branch; no outline+canvas DAG. Launched Oct 2026. ([App Store](https://apps.apple.com/app/id6760507329)) |

### 1.3 What the landscape actually says

**Fact:** The closest implementations split into three families:

- **Visual study tools** (Heptabase, Scrintal, Kinopio, Muse/Allume, Freeform) get the canvas and cards right, but their edges are card-level and their text model is not block/LaTeX/code-first.
- **Structured outliners** (Logseq, Tana, Roam, RemNote, Notion) get blocks/references right, but they do not have a spatial canvas or span-anchored edges.
- **Diagram/mind-map tools** (XMind, MindNode, Whimsical, TheBrain) get tree + cross-links right, but their nodes are topics, not rich content blocks, and their links are node-level.

**Opinion:** The gap is real, but it is narrower than "a better Heptabase." The defensible product is **a study document where a span of text/formula/code can visibly grow a branch**, with an outline that stays fast and a canvas that makes the structure memorable. If the app becomes a general whiteboard or a general PKM, it will lose to incumbents.

**Cautionary example:** Zibaldone launched on iPad in October 2026 with handwriting, Markdown export, and a knowledge graph. It is not the same product, but it shows the adjacent space is already moving toward "handwriting + Markdown + graph." ([App Store](https://apps.apple.com/app/id6760507329))

---

## 2. Data structures

### 2.1 Tree vs DAG: do not make every edge structural

A pure tree gives you simple outline order, simple layout, and a single parent per block. A DAG gives you multiple parents and cross-links, but it makes "where does this block live in the outline?" and "where does it go on the canvas?" ambiguous.

**Fact:** Products that support multi-parent structure usually separate hierarchy from association:

- TheBrain: a thought can have multiple parents, plus jump links.
- XMind: topic tree plus a separate `relationships` array.
- MindNode: tree plus "connections" that go beyond hierarchy.
- Obsidian Canvas: arbitrary edges between nodes, no single parent.

**Recommendation (opinion):** Model **two edge roles** in one edge table:

- `role: "primary"` — the structural parent edge. **Exactly one incoming primary edge per block** (except roots). The primary subgraph must be acyclic.
- `role: "reference"` — extra parents, cross-links, "see also". Zero or more per block. Reference edges **may form cycles**; a knowledge graph often does.

This gives you DAG semantics for navigation without making layout and outline ambiguous. It also lets a block have multiple parents while still having one canonical place in the outline. The branch from an anchored span is usually a `primary` edge if it should appear as a callout/child; extra references are `reference`.

**Do not** enforce global acyclicity on every edge. A strict global DAG sounds elegant but prevents legitimate "A cites B, B critiques A" relationships. Enforce acyclicity only on the primary forest.

### 2.2 Stable IDs and ordering

**Fact:** Array indices are not identities. Editing, reordering, and concurrent changes break index-based references. Figma uses fractional indexing for ordered sequences; each item gets a string key that sorts lexicographically, and inserting between two items only changes the new item's key. ([Figma](https://www.figma.com/blog/realtime-editing-of-ordered-sequences), [fractional-indexing](https://github.com/rocicorp/fractional-indexing))

**Recommendation:**

- **Block/edge/anchor IDs:** UUIDv7 (time-sortable, globally unique, no central coordination) or a 128-bit random ID. Do not use sequential integers. UUIDv7 is standardized in RFC 9562. ([RFC 9562](https://www.rfc-editor.org/rfc/rfc9562))
- **Sibling order:** fractional index string (`a1`, `a1V`, `a2`). Store it on the edge (for the child's position among siblings), not on the block. Moving one item updates one row.
- **Layout position:** separate from order. `x`, `y`, `pinned`, optional `width`. Manual pins are user data; computed positions are derived and can be recomputed.

### 2.3 Anchored spans: the core technical problem

There are four anchor types, and they should not share one naive representation:

| Anchor | What it points at | Recommended representation | Failure mode |
|---|---|---|---|
| **Text** | A word/phrase inside a rich-text block | Inline `anchor` mark in the ProseMirror document carrying `anchorId`; branch references `anchorId` | Text deleted → mark disappears; branch becomes dangling and must be surfaced, not silently deleted |
| **Formula** | A term or sub-expression in a math node | Anchor mark/node around the inline math node, or `{blockId, latex, occurrence}` if the formula is atomic | Formula edited → exact-text fallback may fail; use a stable formula ID if possible |
| **Code** | A token/range in a code block | `{blockId, from, to, quote, prefix, suffix}` plus a CodeMirror decoration for display | Code edits shift offsets; re-anchor by exact quote + context; if ambiguous, mark orphan |
| **Image** | A rectangular region | `{blockId, rect: {x,y,w,h}}` normalized 0–1 to the image's intrinsic size | Image replaced/cropped → region may be invalid; keep original asset hash |

**Why inline marks for text:** ProseMirror's document is a tree with integer positions; marks and nodes move with edits because they are part of the document, and decorations are mapped through transactions. If you store only `from`/`to` offsets, every edit before the anchor invalidates them. ProseMirror's own guidance is to map positions through transactions, and decorations are explicitly designed to be mapped forward. ([ProseMirror positions](https://prosemirror.net/docs/guide/#doc.indexing), [decorations](https://prosemirror.net/docs/guide/#view.decorations), [mapping discussion](https://discuss.prosemirror.net/t/thoughts-on-offsets-and-positions/706))

**Fallback for code and imported content:** Store a W3C-style text quote selector — `exact`, `prefix`, `suffix` — and re-anchor on load. This is the same idea as the Web Annotation Data Model's `TextQuoteSelector`. It survives reordering/renaming and partial edits better than offsets, but it can fuzzy-match the wrong occurrence; add a position hint and require user confirmation when confidence is low. ([W3C TextQuoteSelector](https://www.w3.org/TR/annotation-model/#text-quote-selector), [anchor-quote](https://github.com/robertknight/anchor-quote))

**Do not** use a hidden zero-width DOM element as the anchor source of truth. It will not serialize into Markdown/JSON cleanly, it may be stripped by editors, and it will not survive a round-trip. Use an editor-level mark/node with an ID, and derive DOM rectangles at render time.

**Dangling anchors:** Keep the branch. Show "anchor lost — reattach" with the stored quote and a search. This is better than deleting a user's work because a paragraph was edited. Add an "orphaned anchors" panel.

**Multi-block selection:** For v1, restrict an anchored branch to a single block. A selection spanning blocks can be represented as multiple anchors or a block range later; supporting it now complicates both the editor and the layout.

### 2.4 Block references vs branches

**Fact:** Roam, Logseq, Tana, and RemNote all distinguish a **reference/transclusion** (embed the content of another block) from a **link/relation** (navigate to it). Roam's block reference is a live window onto another block; Logseq embeds blocks; Tana references the same node; RemNote has rem references and portals. ([Roam](https://roamdocs.fyi/help/block-references), [Tana](https://outliner.tana.inc/learn/features/nodes-and-references))

**Recommendation:** Keep them separate:

- A **branch** is an assertion/relationship: "this block (or span) leads to that block."
- A **block reference** is a content embed: "show that block's content here."

Do not implement transclusion in v1. It creates editing ambiguity (which instance owns the text?), anchor ambiguity (which rendering does the branch attach to?), and export problems. Add a read-only reference node later if needed.

### 2.5 CRDTs: Yjs, Automerge, Loro

| | Yjs | Automerge | Loro |
|---|---|---|---|
| **Model** | Shared text, map, array; relative positions; UndoManager | JSON-like CRDT with history; document-level changes | Rich text, movable list, movable tree, LWW map; stable cursors |
| **Strengths** | Largest ecosystem, many editor bindings, small core (~25 KB gzipped in one benchmark), production-proven | Familiar JSON model, Git-like history, multi-language | Very fast, movable tree/list, Peritext/Fugue rich text, stable positions |
| **Weaknesses** | Not a JSON document; tree/DAG structure must be built manually; binary updates need storage | Heavier historically; v3 improved memory but still more overhead | Younger ecosystem; WASM bundle is large (~0.9 MB gzipped in one published benchmark); fewer integrations |
| **License** | MIT | MIT | MIT |

Sources: [Yjs](https://yjs.dev), [Yjs UndoManager](https://docs.yjs.dev/api/undo-manager), [Automerge](https://automerge.org), [Automerge 3 memory note](https://velt.dev/blog/top-crdt-libraries-for-real-time-data-sync), [Loro](https://loro.dev), [Loro performance](https://loro.dev/docs/performance), [Loro cursors](https://loro.dev/docs/concepts/cursor_stable_positions), [Loro license](https://lib.rs/crates/loro).

**Opinion:** Do **not** start with a CRDT. A single-user Mac app with a local file does not need merge semantics. CRDTs add:

- binary storage and compaction,
- schema/migration complexity,
- per-user undo semantics (Yjs `UndoManager` is scoped and origin-based),
- anchor mapping questions (relative positions vs your own mark IDs),
- debugging difficulty.

Start with a command/undo stack and atomic JSON saves. Add Yjs when **real-time collaboration or iPad/Mac concurrent editing** is a committed feature. If you add it, use `y-prosemirror` for text and a `Y.Map` for layout/edges; keep JSON export as the user-facing format. If movable tree semantics become central, evaluate Loro rather than hand-building a tree CRDT on Yjs.

**If you do use a CRDT:** use its stable positions for anchors (Yjs `RelativePosition`, Loro cursors), and still keep an `anchorId` so branches can be addressed and exported. Do not rely on CRDT positions as the only identifier.

### 2.6 Undo/command model

**Fact:** ProseMirror has a transaction/history model for text; Yjs has a selective `UndoManager` scoped to shared types and transaction origins. ([ProseMirror history](https://prosemirror.net/docs/ref/#history), [Yjs UndoManager](https://docs.yjs.dev/api/undo-manager))

**Recommendation:**

- Text editing: ProseMirror history inside the active block editor.
- Structural/canvas operations: an app-level command stack with `do`/`undo` inverses and human-readable labels ("Create branch", "Move block", "Pin block").
- One visible undo stack. When the user presses Cmd-Z, route to the active editor if it has local history and the last action was typing; otherwise to the app stack. This is fiddly; document the rule and test it.
- If CRDT later: use `UndoManager` scoped to the local origin, with `captureTimeout`; do not let it undo remote edits. Restore selection/anchor focus on undo.

### 2.7 Schema versioning and migrations

**Fact:** Local-first apps must handle devices on different versions editing the same data. Safe migrations add rather than rename, tolerate unknown fields, and record the schema version that wrote each document. ([Offline Protocol](https://www.offlineprotocol.com/learning/local-first/how-do-schema-migrations-work-in-local-first-apps))

**Recommendation:**

- Top-level `schemaVersion` integer.
- Migrations are pure functions `vN -> vN+1`, run in order; never edit old migration code.
- Keep unknown fields when reading/writing (forward compatibility).
- Back up before migration; write to a temp file and atomically rename.
- Test every version still in the wild, plus "old app opens new file" behavior: show a clear "this file was written by a newer version" message instead of corrupting it.
- Do not silently downgrade.

### 2.8 Recommended schema (opinion, but concrete)

```json
{
  "schemaVersion": 1,
  "id": "0192f0c4-7a1e-7c3b-9d2a-1f6b8c9d0e11",
  "title": "Linear algebra — eigenvalues",
  "createdAt": "2026-11-03T10:00:00Z",
  "updatedAt": "2026-11-03T10:04:12Z",
  "blocks": {
    "b1": {
      "id": "b1",
      "type": "text",
      "content": { "type": "doc", "content": [] },
      "collapsed": false
    },
    "b2": { "id": "b2", "type": "text", "content": { "type": "doc", "content": [] } },
    "b3": { "id": "b3", "type": "math", "latex": "\\det(A-\\lambda I)=0" }
  },
  "anchors": {
    "an1": {
      "id": "an1",
      "blockId": "b1",
      "kind": "text",
      "quote": "eigenvalue",
      "prefix": "the ",
      "suffix": " is"
    }
  },
  "edges": [
    {
      "id": "e1",
      "from": { "kind": "block", "blockId": "b1" },
      "toBlockId": "b2",
      "role": "primary",
      "order": "a1",
      "label": null
    },
    {
      "id": "e2",
      "from": { "kind": "anchor", "blockId": "b1", "anchorId": "an1" },
      "toBlockId": "b3",
      "role": "primary",
      "order": "a2",
      "label": "definition"
    },
    {
      "id": "e3",
      "from": { "kind": "block", "blockId": "b3" },
      "toBlockId": "b2",
      "role": "reference",
      "order": null,
      "label": "used by"
    }
  ],
  "layout": {
    "b1": { "x": 0, "y": 0, "pinned": true },
    "b2": { "x": 420, "y": 0, "pinned": false },
    "b3": { "x": 40, "y": 180, "pinned": false }
  },
  "assets": {
    "sha256:...": { "path": "assets/sha256-....png", "mime": "image/png", "width": 1200, "height": 800 }
  }
}
```

Notes:

- `edges` is the only graph structure. The primary parent of a block is derived from the incoming `role: "primary"` edge. Validate: at most one primary parent per block; primary subgraph acyclic.
- `layout` stores only manual pins and last-known positions. Computed positions are derived on load; if a block has no `pinned: true`, layout can reflow it.
- `anchors` stores quote/context as a fallback; the live anchor is the inline mark in `content`.
- Assets are content-addressed; no absolute paths.

### 2.9 What not to do

- **Do not store raw Markdown as the live document while editing WYSIWYG.** ProseMirror↔Markdown offset mapping is "very difficult" and lossy for syntax variants; a ProseMirror maintainer says doing this per-character requires complex custom logic. ([ProseMirror forum](https://discuss.prosemirror.net/t/how-to-map-prosemirror-transactions-to-offset-based-changes-in-a-plain-text/8107))
- **Do not use array indices as anchors or identities.**
- **Do not make every edge structural.** Use primary vs reference.
- **Do not add a CRDT before you need collaboration.**
- **Do not make layout positions canonical.** Pins are canonical; computed positions are not.

---

## 3. Layout algorithms

### 3.1 The candidates

| Algorithm / library | What it is good at | Limits for this product |
|---|---|---|
| **Reingold–Tilford / Buchheim tidy tree** | Classic tidy tree aesthetics: same depth on a line, parent centered, subtrees packed without overlap, O(n) with Buchheim's linear-time variant. | Trees only. Multiple parents and callouts need custom handling. |
| **d3-hierarchy `tree()`** | Mature, small, ISC-licensed implementation of tidy tree; easy horizontal orientation. | No DAG, no ports, no edge routing. |
| **Sugiyama / ELK Layered** | Layered DAG layout with cycle breaking, layer assignment, crossing minimization, node placement, edge routing; supports ports, compound graphs, orthogonal routing, 140 options. | Global layout, async, heavy (~500 KB transpiled Java in elkjs), less stable for incremental edits; overkill for a study doc. |
| **dagre** | Familiar layered layout, MIT, small API. | Last npm release 0.8.5 is years old; React Flow maintainers call it unmaintained. Avoid for a new product. |
| **d3-dag** | TypeScript-first Sugiyama, smaller than elkjs, multiple decrossing/coordinate strategies, good docs. | No ports; less mature than ELK; still a global DAG layout. |
| **Graphviz** | Best-in-class static graph layout, many engines. | External binary, EPL, global layout, not interactive; use for export/debug only. |
| **Force-directed** | Organic clusters for exploratory graphs. | Wrong for stable study maps; nodes drift, layout is not reproducible, anchors move. |

Sources: [Reingold–Tilford paper](https://reingold.co/tidier-drawings.pdf), [d3-hierarchy](https://d3js.org/d3-hierarchy), [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html), [ELK paper](https://arxiv.org/abs/2311.00533), [elkjs](https://github.com/kieler/elkjs), [dagre](https://github.com/dagrejs/dagre), [React Flow on dagre](https://github.com/xyflow/xyflow/discussions/2788), [d3-dag](https://erikbrinkman.github.io/d3-dag), [Graphviz](https://graphviz.org).

### 3.2 What actually fits "fan + anchored callout"

**Opinion:** The layout should be a **tree layout plus a callout placement pass**, not a general DAG layout.

- Direct children fan to the right (or down) using a tidy tree. The primary edge determines placement.
- Anchored branches are placed **below the anchor rectangle**, in a callout lane, with collision avoidance. They are not part of the tidy tree's sibling packing; they are annotations that happen to contain a subtree.
- Extra parents/reference edges are routed as cross-links; they do **not** move the target. If a second parent moved the child, adding a reference would scramble the user's mental map.
- Manual pins are fixed obstacles. Reflow only unpinned nodes.
- This keeps the outline order and the canvas order consistent: both derive from the same primary edges + fractional order.

**Why not ELK for the primary view:** ELK's layered algorithm is designed for a global DAG. It will happily reorder layers and move nodes when an edge is added. That is the opposite of what a study canvas needs. It is also async and heavy for a per-keystroke layout. Use ELK only for an explicit "reflow entire map" command or a static export, if at all.

**Why not a force layout:** Force layouts are unstable and non-deterministic; anchors and manual pins fight the simulation. They are suitable for exploratory network views, not for a document you return to.

### 3.3 Recommended algorithm

```text
1. Build the primary forest from edges with role=primary.
   - Validate: one primary parent per block; no cycles.
2. Measure every block (ResizeObserver / offscreen measurement).
   - Cache width/height; invalidate on content or width change.
3. Layout each primary tree with a horizontal tidy tree.
   - x = depth * (column width + gap)
   - y = packed subtree height, with sibling spacing
   - node size = measured content box
4. Pack disconnected roots/components vertically.
5. Place anchored callouts:
   - Resolve anchorId -> DOM Range -> rect in canvas coordinates.
   - Desired position = below anchor, aligned to anchor left.
   - Find a free slot in the callout lane using an interval tree / sweep.
   - Place the callout block, then lay out its primary subtree.
6. Apply pins:
   - pinned nodes keep absolute x/y; treat as obstacles.
   - unpinned nodes reflow around them.
7. Route reference edges:
   - orthogonal or rounded polyline, avoid node rectangles.
   - fallback to bezier if routing fails.
8. Persist only pins and last positions; keep layout deterministic.
```

**Key implementation details:**

- **Anchor rect resolution:** `anchorId` → inline mark DOM element → `Range.getBoundingClientRect()` → convert screen to canvas coordinates using the current viewport transform. Do this after layout, on zoom/scroll only if the callout is pinned relative to the anchor; otherwise store the callout's absolute position and draw the edge to the live anchor rect.
- **Callout lane:** Reserve a vertical band under the anchor's block, not just under the word. If the anchor is near the bottom of a tall block, the callout may overlap the next sibling; shift the whole sibling subtree or place the callout in a side lane with a leader line. The latter is more stable but less "below the anchor."
- **Collision:** Rectangle overlap + interval tree is enough. Do not build a constraint solver for v1. If pins and callouts create hard conflicts, show a "layout conflict" affordance rather than silently overlapping.
- **Stability:** Layout only the dirty subtree. On text edit, re-measure the edited block and reflow its descendants; do not re-layout the whole document. Debounce 100–200 ms. Animate positions 120–200 ms, but disable animation for keyboard-driven edits.
- **Pins:** A drag sets `pinned: true` and writes x/y. Siblings do not move. "Auto layout" clears pins for the selection or the document. This is predictable and easy to explain.
- **Reference edges:** Use a simple obstacle-aware router: try a 3-segment orthogonal route; if it crosses a node, try 5-segment; else draw a bezier. Do not pull in a C++ autorouter for v1.

**Facts supporting stability:** Incremental layout research and commercial graph tools explicitly aim to preserve the "mental map" by minimizing changes to existing node positions; Tom Sawyer's Perspectives supports incremental layout, and yWorks describes an incremental layered mode that places a subset without moving everything. ([Tom Sawyer](https://www.tomsawyer.com/graph-layout), [yWorks](https://www.yworks.com/pages/layered-graph-layout), [stable layout paper](https://robinmennens.github.io/Portfolio/files/Mennens%20et%20al.%20-%202019%20-%20A%20stable%20graph%20layout%20algorithm%20for%20processes.pdf))

### 3.4 What must be custom

- Anchor rectangle resolution and callout placement.
- Pin-aware tidy tree (fixed obstacles, reflow only unpinned).
- Incremental dirty-subtree layout.
- Reference-edge routing around blocks.
- Synchronizing outline order with primary-edge order.
- A "layout conflict" UI for impossible pin/callout combinations.

What should **not** be custom: tidy-tree math (use d3-hierarchy), pan/zoom/selection (React Flow), fractional order (library), text editing (ProseMirror/CodeMirror).

### 3.5 Performance budget

- Layout for 300 blocks: < 50 ms.
- Pan/zoom: 60 fps at 300–500 visible blocks; measure on an M1/M2 Mac.
- Text edit: re-measure one block + its subtree, not the document.
- 1,000+ blocks: collapse/focus mode; consider canvas LOD or virtualization. Do not promise 10k nodes.

---

## 4. Editor and render stack

### 4.1 Rich-text editor

| Option | Strengths | Weaknesses for this product |
|---|---|---|
| **ProseMirror** | Schema-based structured documents, integer positions, transactions, decorations, node views, mapping; best fit for anchors and custom blocks. MIT. | Lower-level; you build UI and schema. Steep learning curve. |
| **TipTap** | Ergonomic ProseMirror wrapper; good docs, React/Vue, node views, math extension; MIT core. | Some Pro/collaboration extensions are commercial; abstraction can hide ProseMirror details you need for anchors. Check each extension's license. |
| **Lexical** | React-first, fast, immutable tree, used at scale; good for chat/comment editors. | Its decorator nodes mutate content; pure decorations are a known gap (Liveblocks). Less schema-centric than ProseMirror. |
| **Slate** | Flexible JSON document model, React, complete control. | Fewer maintained plugins, slower release cycle; more edge cases to own. |
| **Milkdown** | ProseMirror + remark; WYSIWYG Markdown; plugin-driven; MIT. | Markdown-centric round-trip can fight a structured block/edge model; more layers to debug. |

Sources: [ProseMirror guide](https://prosemirror.net/docs/guide/), [TipTap math](https://tiptap.dev/docs/editor/extensions/nodes/mathematics), [Lexical vs ProseMirror](https://lexical.dev/docs/concepts/compared-with-prosemirror), [Liveblocks 2025 comparison](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025), [Milkdown](https://milkdown.dev), [Slate](https://www.slatejs.org).

**Recommendation:** **TipTap on ProseMirror** for block content. Use ProseMirror directly for the anchor mark and any custom node views where TipTap's abstraction gets in the way. Do not use a Markdown WYSIWYG editor as the canonical editor.

**Architecture opinion:** One ProseMirror document per *block*, not one giant document for the whole canvas. The outline renders a virtualized list of block editors; the canvas renders read-only block content and mounts a single floating editor for the focused block. This avoids hundreds of live editor instances and makes absolute positioning trivial. The cost is cross-block selection/find; solve with a search index and block-level commands. Do not run two live editors on the same block at once.

### 4.2 Code editor

| Option | Strengths | Weaknesses |
|---|---|---|
| **CodeMirror 6** | Modular, ~300 KB core, mobile/touch, incremental parsing, decorations/widgets, Lezer syntax trees. MIT. | You assemble extensions; less "batteries included" than Monaco. |
| **Monaco** | VS Code engine, IntelliSense, TypeScript services, familiar. | 2–5 MB gzipped, heavy startup, not modular, poor mobile; overkill for code blocks. |

Sources: [CodeMirror](https://codemirror.net), [CodeMirror decorations](https://codemirror.net/examples/decoration/), [Replit: betting on CodeMirror](https://replit.com/blog/codemirror), [Sourcegraph migration](https://sourcegraph.com/blog/migrating-monaco-codemirror).

**Recommendation:** **CodeMirror 6** for editable code blocks. Use **Shiki** for read-only highlighted code in the PDF/export path; use CodeMirror's Lezer highlighting in the editor. Do not ship Monaco.

### 4.3 Math

- **KaTeX:** fast, synchronous, broad LaTeX coverage, good for editor and print. MIT. ([katex.org](https://katex.org))
- **MathJax:** broader TeX coverage, slower, heavier; useful as a fallback for documents that use packages KaTeX does not support. Apache-2.0. ([mathjax.org](https://www.mathjax.org))

**Recommendation:** KaTeX for the default editor and PDF. Store the LaTeX source, render with `throwOnError: false` and a visible error state. If a formula fails, show the source and a "render with MathJax" fallback rather than silently dropping it.

### 4.4 Markdown pipeline

- **remark/rehype/unified:** best JS ecosystem for Markdown/GFM parsing and HTML transformation. Use for import/export.
- **`prosemirror-markdown`:** ProseMirror's Markdown parser/serializer; good for a Markdown schema, less complete for arbitrary GFM.
- **MDX:** not appropriate for user notes; it introduces a compile step, imports, and a security surface. Use only if you deliberately support embedded components. ([mdxjs.com](https://mdxjs.com))
- **Pandoc:** excellent converter, but GPL-2.0 and an external binary; optional "advanced import/export" only. ([pandoc.org](https://pandoc.org))
- **Typst:** excellent paged PDF and accessible output, but a separate layout engine; not a drop-in for a DOM canvas. ([typst.app/docs/reference/pdf](https://typst.app/docs/reference/pdf))

**Recommendation:** Canonical structured document; Markdown import/export via remark + a custom ProseMirror serializer. Accept that exotic Markdown is lossy. Test round-trips semantically (same blocks/marks/links), not byte-for-byte.

### 4.5 Mapping anchors from source to rendered DOM

This is the part most likely to be underestimated.

**Text:** Insert an inline mark with `anchorId` at the selected range. ProseMirror keeps the mark attached to the text through edits and maps decorations. Render a subtle highlight via `Decoration.inline`; do not store the highlight in the document. On click, resolve `anchorId` to the mark's current position.

**Code:** CodeMirror decorations can mark a range and map through changes; store the range plus the quote. For a code token anchor, create a `Decoration.mark` for display and a `{from,to,quote}` record for persistence. On load, re-anchor by exact quote; if multiple matches, use prefix/suffix and ask the user. ([CodeMirror decorations](https://codemirror.net/examples/decoration/))

**Math:** If the formula is an inline node, give the node an `anchorId` attribute. If the anchor is a term inside the formula, store the LaTeX substring and occurrence; KaTeX rendering does not expose stable sub-node IDs, so DOM mapping is fragile. For v1, anchor to the whole formula or a named term with a custom `\label`-like convention.

**Images:** Store a normalized rectangle relative to the image's intrinsic dimensions. Render an overlay in the image node view; the rectangle survives scaling. If the image is replaced, invalidate anchors by asset hash.

**Tables/lists:** Treat them as text ranges within the block; ProseMirror positions cover them. Avoid anchors that span multiple table cells in v1.

**Testing:** For every anchor, test edits before, inside, and after the span; deleting the span; splitting the paragraph; undoing; reloading; exporting to Markdown and re-importing. If the anchor cannot be resolved, show an orphan state, never drop the branch.

### 4.6 Editor UX implications

- The outline should support Enter to create a sibling, Tab/Shift-Tab to indent/outdent (change primary parent), Backspace at start to merge with previous block, and drag to reorder. These are app-level commands, not raw editor behavior.
- The canvas should be read-only by default; click a block to edit in place or in a side panel. This keeps the canvas performant and avoids focus/selection bugs.
- Search should index block text, code, LaTeX source, and labels. Use a separate index (MiniSearch or SQLite FTS5) rebuilt from the canonical document.

---

## 5. Canvas and rendering

### 5.1 Options

| Option | Rendering | Strengths | Weaknesses / traps |
|---|---|---|---|
| **DOM + SVG (React Flow)** | HTML nodes, SVG edges | Real text, selection, find-in-page, accessibility, easy print CSS; React Flow gives pan/zoom, handles, custom nodes/edges, selection, minimap. MIT. | DOM performance; maintainer guidance ~1,000 nodes depending on complexity; layout/routing are your job. |
| **tldraw** | Hybrid DOM/SVG/Canvas | Excellent infinite-canvas engine, custom shapes, rich text, collaboration, LOD. | **Source-available, not OSI open source**; production use requires a license key. Data model is shape-based, not document blocks. Overkill and a licensing trap for a small team. |
| **Excalidraw** | Canvas + rough.js | MIT, hand-drawn aesthetic, embeddable, collaborative. | An app more than an SDK; freeform drawing, not structured text blocks; no document model/anchors. |
| **Konva / PixiJS / CanvasKit / Fabric.js / Paper.js** | Canvas/WebGL | Fast for thousands of shapes, custom drawing, games-like interaction. | You rebuild text layout, editing, selection, accessibility, and PDF text. Text-heavy notes are the wrong fit. |
| **Native GPUI / egui / Iced / Slint / SwiftUI / Flutter** | Native/GPU | Performance, native ink/PDF in some cases. | GPUI pre-1.0 and tied to Zed; egui API churn/immediate mode; Iced docs sparse; Slint license; SwiftUI rich text still limited; Flutter custom text/PDF. Too much for v1. |

Sources: [React Flow](https://reactflow.dev), [React Flow performance](https://reactflow.dev/learn/advanced-use/performance), [React Flow ~1000 nodes](https://github.com/xyflow/xyflow/issues/967), [tldraw license](https://tldraw.substack.com/p/license-updates-for-the-tldraw-sdk), [tldraw rich text](https://tldraw.dev/sdk-features/rich-text), [Excalidraw](https://github.com/excalidraw/excalidraw), [Konva](https://konvajs.org), [PixiJS](https://pixijs.com), [CanvasKit](https://skia.org/docs/user/modules/canvaskit/), [Fabric.js](https://fabricjs.com), [Paper.js](https://paperjs.org), [GPUI](https://www.gpui.rs), [egui](https://github.com/emilk/egui), [Iced](https://github.com/iced-rs/iced), [Slint](https://slint.dev), [SwiftUI TextEditor](https://developer.apple.com/documentation/swiftui/texteditor).

### 5.2 Recommendation

**React Flow + DOM/SVG** for v1:

- Nodes are real HTML; text, KaTeX, code, and images render with the same CSS as the outline/print path.
- Custom edges can take arbitrary `sourceX/sourceY`; this is how you draw from an anchor span without abusing handles.
- Pan/zoom/selection/minimap are solved.
- MIT license; large ecosystem; TypeScript.
- PDF/print path can reuse the same block renderers.

**Do not** use tldraw unless you are prepared to buy a commercial license and adopt its shape data model. It is a great engine, but it is not a document-block engine, and the license is a strategic dependency.

**Do not** use Canvas/WebGL for text-heavy notes. You will spend months rebuilding text layout, selection, IME, accessibility, and PDF text, and still have worse fidelity.

### 5.3 React Flow constraints and mitigations

- **Node count:** maintainers have said React Flow is not made for 1,000+ nodes; field reports show slowdowns with ~370 custom nodes and 500 edges. For study docs, 50–300 blocks is the realistic target. ([issue #967](https://github.com/xyflow/xyflow/issues/967), [issue #3110](https://github.com/xyflow/xyflow/issues/3110))
- **Memoization:** node/edge components must be memoized; avoid reading the whole nodes array inside node components; use `useStore` selectors. ([performance docs](https://reactflow.dev/learn/advanced-use/performance))
- **Culling:** `onlyRenderVisibleElements` helps large graphs but adds re-initialization overhead; benchmark both on your node complexity. ([docs](https://reactflow.dev/api-reference/react-flow#onlyRenderVisibleElements), [SingleStore experience](https://www.singlestore.com/blog/refactoring-singlestores-visual-explain-to-use-react-flow))
- **LOD:** at low zoom, render simplified block cards (title/first line) instead of full editors; at high zoom, render full content.
- **Virtualization:** only mount full content for visible blocks; keep a lightweight placeholder for offscreen blocks.
- **Collapse:** allow collapsing subtrees; a study map should not show 500 blocks at once.
- **Do not** animate edges during text editing.

**Performance target:** 60 fps pan/zoom at 300 visible blocks on an M1 Mac; 30 fps at 500. If you need 1,000+, plan a canvas LOD mode or a different renderer.

### 5.4 Native frameworks: fair evaluation

- **SwiftUI/AppKit:** best PDF (PDFKit/NSPrintOperation) and best PencilKit. But rich text with Markdown/LaTeX/code, a custom canvas, and a cross-platform document model are all from scratch. `TextEditor` supports attributed text on recent OS versions, but it is not a block/structured editor. ([TextEditor](https://developer.apple.com/documentation/swiftui/texteditor))
- **GPUI:** fast, GPU-accelerated, but pre-1.0 and "tied to Zed"; breaking changes; not a general app framework with docs/ecosystem. ([GPUI](https://www.gpui.rs))
- **egui:** great for tools/debug UIs; immediate mode and API churn make a polished document app risky.
- **Iced:** clean Elm architecture, MIT, but docs are still thin; not enough for a small team on a deadline.
- **Slint:** good embedded/desktop UI, but licensing (GPL/commercial/attribution) is a strategic constraint and text editing is limited.
- **Flutter:** strong custom rendering and mobile; PDF generation exists (`pdf`, `flutter_to_pdf`, `dart_pdf_editor`), but text editing/Markdown/LaTeX fidelity and macOS-native feel are weaker. ([Flutter PDF](https://pub.dev/packages/pdf), [flutter_to_pdf](https://pub.dev/packages/flutter_to_pdf))

**Opinion:** Native is the right choice only if the team is already Swift-native and the product is iPad-first. For a Mac-first, web-tech team, native is a trap: you will rebuild editors and PDF layout before you validate the core idea.

---

## 6. Desktop shells and PDF export

### 6.1 Shell comparison

| Shell | Rendering | Strengths | Weaknesses / risks |
|---|---|---|---|
| **Electron** | Bundled Chromium + Node | Consistent rendering, mature APIs, `printToPDF`, file system, SQLite/native modules, devtools, huge ecosystem. MIT. | 100–200 MB bundle, 150–400 MB RAM; security hardening needed. |
| **Tauri 2** | OS WebView (WKWebView on macOS) + Rust | 3–10 MB bundle, low memory, security capabilities, mobile targets, Swift plugin support. MIT/Apache-2.0. | WebView variance; PDF export is weak on macOS (see below); Rust/native seam; fewer mature desktop libraries. |
| **Wails** | OS WebView + Go | Small, Go backend, simple. | Similar WebView/PDF issues; smaller ecosystem. |
| **Neutralino** | OS WebView | Tiny, simple. | Limited APIs, less mature; not for a serious document app. |
| **PWA** | Browser | No install, cross-platform, easy updates. | On iOS: no File System Access, no share target, 7-day storage eviction, manual install, no native print control. Bad for a Mac/iPad document app. |
| **Native (SwiftUI/AppKit)** | Native | Best PDF/PencilKit/performance. | Slowest to build the editor/canvas; Mac-only. |

Sources: [Electron](https://www.electronjs.org), [Electron printToPDF](https://www.electronjs.org/docs/latest/api/structures/print-to-pdf-options), [Tauri](https://tauri.app), [Tauri mobile plugins](https://v2.tauri.app/develop/plugins/develop-mobile/), [Wails](https://wails.io), [Neutralino](https://neutralino.js.org), [iOS PWA limitations](https://tappwa.com/blog/ios-pwa-limitations-2026), [PWA file system](https://web.dev/learn/pwa/os-integration).

**Recommendation:** **Electron** for v1. The 100–200 MB download is a real cost, but the product's core risk is not bundle size; it is editor/canvas/PDF fidelity. Electron gives the most predictable Chromium rendering and the best `printToPDF` path. Tauri's size advantage is not worth a PDF science project.

### 6.2 PDF paths

| Path | Text quality | Pagination | Complexity | Verdict |
|---|---|---|---|---|
| **Electron `webContents.printToPDF`** | Vector/selectable text; fonts embedded by Chromium | CSS paged media; page size/margins/header/footer; `preferCSSPageSize` | Low | **Recommended** |
| **WKWebView `createPDF`** | Vector text | Reported to produce a **single long page**, no pagination; you must paginate yourself | Medium | Trap for Tauri/native webview |
| **WKWebView `NSPrintOperation`** | Vector text | Can paginate, but CSS/scaling issues and orphan pages reported | Medium-high | Fallback only |
| **PDFKit (native)** | Vector | Native; good for post-processing/bookmarks/annotations | Medium | Useful companion, not layout engine |
| **pdf-lib** | Vector (you draw) | You implement layout | Medium | Good for merge/metadata/forms; not for rich text layout |
| **Typst** | Vector, accessible PDF, fast | Excellent paged media | High (separate layout) | Good for a "document PDF" emitter; not for canvas |
| **Headless Chromium (Puppeteer)** | Same as Chromium | Same as print CSS | Medium (extra binary) | Only if not using Electron |
| **Pandoc/LaTeX** | Excellent | Excellent | High; GPL/external | Overkill for v1 |

Sources: [Electron printToPDF options](https://www.electronjs.org/docs/latest/api/structures/print-to-pdf-options), [printToPDF selectable text](https://pdf4.dev/blog/pdf-generation-electron), [WKWebView createPDF no pagination](https://stackoverflow.com/questions/70337689/create-pdf-with-wkwebview-pdfconfiguration), [WKWebView printing scale issues](https://stackoverflow.com/questions/72467349/wrong-wkwebview-content-scale-when-printing), [WebKit 16,384 px cap report](https://github.com/kashioka/Rendu/issues/57), [PDFKit](https://developer.apple.com/documentation/pdfkit), [pdf-lib](https://pdf-lib.js.org), [PDFKit JS](https://pdfkit.org), [Typst PDF](https://typst.app/docs/reference/pdf), [Pandoc](https://pandoc.org).

**Fact:** Electron `printToPDF` supports page size, orientation, margins, backgrounds, scale, page ranges, headers/footers, `preferCSSPageSize`, and experimental `generateTaggedPDF`/`generateDocumentOutline`. Tagged PDF is explicitly experimental and may not fully meet PDF/UA. ([Electron docs](https://www.electronjs.org/docs/latest/api/structures/print-to-pdf-options))

**Fact:** Notability imports PDFs and can search typed text; its own troubleshooting says "some PDFs may not be searchable depending on how they were created." ([import](https://support.gingerlabs.com/en-us/articles/16300142-importing-files), [search](https://support.gingerlabs.com/hc/en-us/articles/360016653851-Troubleshooting-Search-Issues))

### 6.3 What the PDF should be

**Opinion:** Do not print the canvas as a giant poster. Notability is a fixed-page annotation app; a 12,000 px-wide canvas PDF is miserable to annotate.

Build a **reader PDF**:

- **Page size:** A4 or Letter, portrait. Offer a "wide annotation margin" variant (e.g., 30% extra right margin) for handwriting.
- **Order:** outline order (primary edges + fractional order). This is the document's readable argument.
- **Blocks:** full text, code, math, images. Use the same renderers as the editor, but a print-specific CSS.
- **Anchored branches:** render as margin callouts next to the anchor, or as a numbered note ("↳ 3") after the paragraph with the branch content in the margin. Number them so the reader can follow.
- **Reference edges:** render as footnotes/see-also links, not as lines through the text.
- **Map page:** one or more pages with a simplified spatial overview, scaled to fit; optional.
- **Page numbers/headers:** block title/section; useful in Notability.
- **Links:** keep internal links where possible; PDF viewers/Notability may or may not honor them.
- **Fonts:** embed all fonts; test KaTeX glyphs and code ligatures; avoid missing glyphs.
- **Page breaks:** `break-inside: avoid` on blocks/callouts; `break-before: page` on major sections; never split a formula or code block across pages.

**Implementation:** a dedicated print route/window, not the live canvas. Render to a hidden `BrowserWindow` at a fixed CSS width (e.g., 794 px at 96 dpi for A4), wait for `document.fonts.ready`, image decode, and KaTeX rendering, then call `printToPDF`. Use `preferCSSPageSize: true` and a CSS `@page` rule. Save with a clear filename and a "Export for Notability" preset.

**Testing:** extract text with `pdftotext` or PDFKit and compare to the source; count pages; check for missing glyphs (`�`), clipped formulas, orphaned headings, and images. Then import into Notability on an iPad and try highlighting text. If the text layer is missing, the export failed even if it looks fine.

### 6.4 Tauri's PDF trap in detail

- Tauri uses WKWebView on macOS. `WKWebView.createPDF` is reported to produce a **single long page**, not paginated output; developers must paginate manually. ([StackOverflow](https://stackoverflow.com/questions/70337689/create-pdf-with-wkwebview-pdfconfiguration))
- `NSPrintOperation` can paginate, but there are reports of content scaling (~5%) on some Macs, causing orphan pages and margin drift. ([StackOverflow](https://stackoverflow.com/questions/72467349/wrong-wkwebview-content-scale-when-printing))
- Very long single-page PDFs can hit a WebKit compositing cap around 16,384 px; a third-party app reports truncation past ~21 A4 pages. ([GitHub issue](https://github.com/kashioka/Rendu/issues/57))
- Workarounds: use a headless Chromium sidecar (defeats the size advantage), or emit Typst/LaTeX (separate layout engine), or paginate manually with `NSPrintOperation` (fragile).

**Verdict:** Tauri is a good shell for many apps, but for a PDF-critical notes app with math/code/images, it is a high-risk choice for v1. If you choose Tauri anyway, budget a PDF spike before committing.

---

## 7. File formats and persistence

### 7.1 Options

| Format | Strengths | Weaknesses | Fit |
|---|---|---|---|
| **JSON document** | Human-readable, easy to diff/debug, schema-friendly, portable | Whole-file writes; need atomic saves/backups; large assets separate | **Best v1** |
| **Markdown files** | Portable, Obsidian/Logseq-friendly, git-friendly | Cannot represent anchors, DAG edges, layout, block IDs cleanly; round-trip loss | Export/interop only |
| **SQLite** | Transactions, partial updates, FTS5, robust; good for 10k+ blocks | Schema/migrations; native module packaging; less transparent to users | Phase 2 / index |
| **Zip bundle** | Single file, assets included, easy sharing/backup | Diffing and recovery are harder; corruption loses everything | Good export/backup |
| **CRDT binary** | Mergeable, collaboration | Opaque, compaction, migrations, lock-in | Only with CRDT |
| **Jupyter-like** | Great for code+output | Not a spatial document; wrong model | Not for v1 |
| **Obsidian vault** | Huge ecosystem, Markdown, local | Canvas separate; anchors/edges not standard | Export target |
| **Logseq graph** | Block refs, outliner | Logseq-specific syntax; DB version not file-canonical | Import/export only |

Sources: [JSON Canvas](https://jsoncanvas.org), [Logseq DB/Markdown mirror](https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020), [SQLite WASM/OPFS](https://sqlite.org/wasm/doc/trunk/persistence.md), [Notion WASM SQLite](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite).

### 7.2 Recommendation

**V1: a folder/zip bundle** (the app can use a macOS document package or a folder):

```text
MyStudyDoc/
  document.json        # canonical blocks, anchors, edges, pins, schemaVersion
  assets/
    sha256-....png
    sha256-....jpg
  manifest.json        # app version, created/updated, maybe thumbnail
  exports/             # optional generated PDF/Markdown, not canonical
```

Why:

- JSON is inspectable and easy to migrate.
- Assets are content-addressed and deduplicated.
- A folder works with Finder, backups, and git; a zip is a convenient share format.
- No native SQLite module to rebuild for Electron.
- Atomic save: write `document.json.tmp`, fsync, rename over the old file; keep rotating backups (e.g., last 20 + daily).

**Phase 2:** add SQLite as a **search/index cache**, or as canonical if the document grows beyond ~10k blocks. If canonical SQLite: use `better-sqlite3` in the Electron main process, FTS5 for search, and a JSON/Markdown export. Do not use WASM SQLite + OPFS in Electron unless you need a web build; it adds worker/cross-origin complexity. ([SQLite OPFS](https://sqlite.org/wasm/doc/trunk/persistence.md), [Notion's experience](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite))

**Do not** keep two canonical sources (Markdown + JSON). Logseq's DB version makes the database canonical and the Markdown a one-way mirror; its own docs say edits to the mirror do not update the graph. That is the honest version of "Markdown export," and it is the right model for this app. ([Logseq](https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020))

### 7.3 Interop

- **JSON Canvas:** export the spatial map as `nodes`/`edges` with x/y/w/h; import nodes as blocks and edges as references. It cannot represent anchors or block content beyond text/file/link nodes. Treat it as a map interchange format, not the document format. ([JSON Canvas spec](https://jsoncanvas.org))
- **Markdown:** export in outline order; anchored branches become blockquotes/callouts with links; include frontmatter (`title`, `id`, `schemaVersion`) and stable block IDs in comments if you want re-import. Accept loss of exact layout.
- **Obsidian vault:** write `.md` files plus assets; use standard wiki links; do not invent syntax that breaks Obsidian. A `.canvas` sidecar is optional.
- **Logseq graph:** export blocks with `id::` and indentation; do not claim round-trip fidelity for queries/properties.
- **Jupyter:** optional later: export code blocks to a `.ipynb` with markdown cells; not core.

### 7.4 Asset handling

- Content-addressed filenames (`sha256-...`), dedupe identical images.
- Store MIME, intrinsic width/height, alt text, original filename.
- Use relative paths inside the bundle; never absolute.
- For PDF/print, resolve to local file URLs or data URLs; test both.
- On delete, garbage-collect unreferenced assets only after a delay/backup.

---

## 8. iPad and handwriting

### 8.1 What is realistic

| Approach | Handwriting quality | Palm rejection | Text/Markdown integration | Verdict |
|---|---|---|---|---|
| **Native PencilKit (SwiftUI/UIKit)** | Best: low latency, pressure/tilt, tool picker, Scribble | Native | Native views; you build the document bridge | Best long-term |
| **Tauri 2 iOS + Swift PencilKit plugin** | Good if you write the bridge | Native | WKWebView + native overlay | Viable, more work |
| **Capacitor + custom PencilKit plugin** | Good if you write the plugin | Native | WebView + native overlay | Viable, but no official plugin; proposal closed as not planned |
| **Flutter + PencilKit platform channel** | Good | Native | Custom text/PDF stack | Possible, not first |
| **Web Pointer Events + canvas** | Pressure/tilt/azimuth; no true palm rejection | No | Web-native | Fine for sketching, not Notability-grade handwriting |
| **PWA** | Same as web, plus iOS storage/share limits | No | Web | Not for a handwriting-first iPad app |

Sources: [PencilKit](https://developer.apple.com/documentation/pencilkit), [PKCanvasView](https://developer.apple.com/documentation/pencilkit/pkcanvasview), [Capacitor PencilKit proposal closed](https://github.com/capacitor-community/proposals/issues/151), [Tauri mobile plugins](https://v2.tauri.app/develop/plugins/develop-mobile/), [Apple Pencil web pressure/tilt demo](https://www.youtube.com/watch?v=cMKVM7rpoBo), [Scribble bug](https://mikepk.com/2020/10/iOS-safari-scribble-bug), [iOS PWA limitations](https://tappwa.com/blog/ios-pwa-limitations-2026).

**Facts:**

- PencilKit provides a native drawing environment with low-latency Apple Pencil input, pressure/tilt, tool picker, and `PKDrawing` storage. It is the only way to get the "Notability feel."
- Web Pointer Events expose pressure, tilt, azimuth, and altitude on iPadOS Safari, but palm rejection is not something a web canvas can fully replicate; Scribble can interfere with rapid taps.
- Capacitor has no official PencilKit plugin; the community proposal was closed as not planned in 2026. You would write a custom native plugin and still need a native canvas overlay.
- Tauri 2 supports iOS via WKWebView and Swift plugins; it is a viable bridge, but the PDF weaknesses remain.

### 8.2 Recommendation

**Mac v1. iPad v2.**

For iPad, choose one of:

1. **Native SwiftUI companion** (recommended if iPad is a first-class goal): PencilKit canvas, native text views, shared document format (JSON bundle), sync via iCloud/CloudKit or a simple file sync. This is the highest-quality path and the least likely to disappoint.
2. **Tauri 2 iOS + Swift PencilKit overlay**: reuse the web UI for reading/outline, native ink layer for handwriting. More work than it sounds; test PDF and text editing carefully.
3. **Capacitor + custom PencilKit plugin**: similar, with a more mature web-to-native bridge but no official PencilKit plugin.

**Do not** build a web-canvas handwriting engine and promise Notability-grade palm rejection. You can ship a "sketch layer" on the canvas, but it will feel like a web drawing app, not PencilKit.

**Data model for ink:** store ink as a separate layer anchored to a block/page, with `PKDrawing` data (or strokes) and a rendered PNG/PDF fallback. Do not mix ink strokes into ProseMirror. Export ink as vector where possible; otherwise a high-resolution image. Handwriting search requires OCR/recognition; treat it as a later feature.

---

## 9. Testing and visual regression

### 9.1 What to test

| Layer | Tests |
|---|---|
| **Model** | Schema validation; primary-edge uniqueness/acyclicity; reference cycles allowed; anchor uniqueness; fractional order; migrations from every schema version |
| **Anchors** | Edits before/inside/after; delete span; split paragraph; undo/redo; save/load; Markdown export/import; code/math/image cases; orphan detection |
| **Layout** | No overlaps; parent before child; anchors inside block bounds; pins respected; idempotence; deterministic output; stable positions on no-op |
| **Canvas** | Pan/zoom; drag/pin; create/delete edge; multi-parent; collapse; focus; 300/500/1000-node performance |
| **Editor** | Enter/Tab/Backspace block commands; code block editing; KaTeX errors; image paste; table/list behavior |
| **PDF** | Page count; text extraction; fonts/glyphs; formulas; images; links; page breaks; Notability import |
| **Persistence** | Atomic save; crash recovery; backup rotation; concurrent read (if sync); unknown fields |
| **Import/export** | Markdown round-trip (semantic); JSON Canvas import/export; Obsidian/Loops compatibility |

### 9.2 Playwright and screenshots

**Fact:** Playwright's `toHaveScreenshot()` compares against baselines, supports masking, thresholds, and `stylePath`; the docs warn that rendering varies by OS, browser version, hardware, power source, and headless mode. Baselines should be generated in the same environment as the test run. ([Playwright](https://playwright.dev/docs/test-snapshots))

**Recommendation:**

- Run visual tests on a **fixed macOS runner** (or a Linux container with pinned fonts) to match the app's target. Do not generate baselines on a developer Mac and compare on Linux CI.
- Disable animations (`animations: 'disabled'`), move the mouse away, hide the caret, mask timestamps/avatars.
- Prefer **element screenshots** of a canvas region over full-page screenshots; use `maxDiffPixelRatio` for anti-aliasing.
- For structural layout, snapshot **SVG/DOM geometry** (node positions, edge paths) rather than pixels. This catches layout regressions deterministically and is much less noisy.
- Keep a small set of pixel baselines for visual style; use geometry/property tests for logic.

### 9.3 Property-based tests

**Fact:** fast-check generates randomized inputs, shrinks failures to minimal counterexamples, and works with Vitest/Jest. ([fast-check](https://fast-check.dev))

Use it for layout/graph invariants:

- For any valid document, `layout()` produces no overlapping node rectangles.
- For any primary edge, the child's x is greater than the parent's x (for rightward layout).
- Every anchor's resolved rectangle is inside its block's rectangle (or flagged orphan).
- `layout(layout(doc))` is idempotent (same positions).
- Removing a reference edge does not change any position.
- Adding a reference edge does not change the primary tree layout.
- Pins never move; unpinned nodes do not overlap pinned nodes.
- Fractional order insertion always sorts between neighbors.

### 9.4 PDF tests

- Extract text with `pdftotext` (poppler) or PDFKit and assert that every block's text is present (allow line-break normalization).
- Assert page count and that no page is blank unexpectedly.
- Check for `�` / missing glyphs; check KaTeX formulas by extracting their text or by visual diff.
- Check links/outlines if you emit them.
- Manually import into Notability on an iPad once per release; try text selection/highlight and search.

### 9.5 Migration and crash tests

- Golden fixtures for every `schemaVersion`; migrate to latest and snapshot.
- Simulate a crash mid-save: temp file exists, old file intact, recovery prompt works.
- Simulate a newer file opened by an older app: clear error, no write.
- Fuzz import: malformed JSON/Markdown/JSON Canvas should fail gracefully, not crash.

---

## 10. Name availability (revised English list)

The earlier Italian/Latin shortlist was rejected. This section evaluates the new English, descriptive direction only. Checks were run on 3 November 2026 against the US App Store search API, public websites, and domain RDAP. This is a **conflict scan**, not a trademark clearance.

### 10.1 Summary table

| Candidate | Domain status (.com unless noted) | Exact/near app conflict | Assessment |
|---|---|---|---|
| **NoteCanvas** | `notecanvas.com` registered; `notecanvas.app` registered | **NoteCanvas** is a Windows infinite whiteboard/classroom canvas app on the Microsoft Store | **High conflict**; also generic. ([Store](https://www.microsoft.com/en-us/p/notecanvas/9mvq2vcrmpxj)) |
| **NoteTree** | `notetree.com` registered; `notetree.app` registered | **NoteTree** is a Mac notes app with a folder tree (beta); also `notetree.app` "visual knowledge maps"; also a PyQt NoteTree | **High conflict**, same category. ([Mac app](https://noteifyapp.com/notetree), [notetree.app](https://www.notetree.app/)) |
| **NoteGrove** | `notegrove.com` registered | **NoteGrove** is an iOS "calm thought garden for notes" app | **High conflict**, same category. ([portfolio](https://www.jeromymobley.com/apps)) |
| **NoteCanopy** | `notecanopy.com` **unregistered** (RDAP 404); `notecanopy.app` **unregistered** (RDAP 404) | No exact app hit in US App Store top 50; no exact product found in web search | **Least conflicted**; but "Canopy" is crowded in software (Canopy accounting, Canopy safety) and "Note" is descriptive. Legal review needed. |
| **NoteWeave** | `noteweave.com` registered | **Noteweave** is an App Store app; `noteweave.com` is a parked "Próximamente" page | **High conflict**. ([App Store](https://apps.apple.com/us/app/noteweave/id6798396443)) |
| **NoteLattice** | `notelattice.com` registered | **Lattice** is a local-first notes workspace (lattice-notes.com) and **Lattice Notes** is an AI notes assistant for Obsidian/Notion | **High conflict**, adjacent category. ([Lattice](https://lattice-notes.com/), [Lattice Notes](https://latticenotes.app/)) |
| **NoteScape** | `notescape.com` registered; `notescape.app` registered | **NoteScape** is a note-taking app (Vercel/GitHub) | **High conflict**, same category. ([site](https://notescape.vercel.app/), [GitHub](https://github.com/maheshpaulj/NoteScape)) |
| **NoteAtlas** | `noteatlas.com` registered; `noteatlas.app` registered | **NoteAtlas – chat style notes** is on the App Store | **High conflict**, notes category. ([App Store](https://apps.apple.com/us/app/noteatlas-chat-style-notes/id6751585745)) |
| **NoteTrail** | `notetrail.com` registered | **NoteTrail: Sight Reading** is on the App Store; `notetrail.com` is a "note trail" site | **Medium-high**; different category (music education), but exact name. ([App Store](https://apps.apple.com/us/app/notetrail-sight-reading/id6801622450)) |
| **NoteMap** | `notemap.com` registered | **Notemap** is a Mac/web mind-mapping app with Markdown, outline view, cross-links, PDF/MD export; several App Store NoteMap apps | **Very high conflict**; almost the same positioning. ([Notemap](https://notemap.com), [App Store](https://apps.apple.com/us/app/notemap-2/id1338231745)) |
| **NoteGraph** | `notegraph.com` registered | **NotesGraph** is a local-first notes/graph app; **NoteGraph** is a Joplin plugin; a NoteGraph iOS project exists | **High conflict**, graph-notes category. ([NotesGraph](https://notesgraph.com/), [plugin](https://discourse.joplinapp.org/t/plugin-notegraph-turn-any-note-into-an-ai-powered-knowledge-graph/49378)) |
| **NoteBranch** | `notebranch.com` registered; `notebranch.app` registered | **NoteBranch** is an open-source Electron Markdown workspace with Git/S3/local storage | **High conflict**, same desktop notes category. ([site](https://notebranch.app/), [GitHub](https://github.com/scabir/notebranch)) |
| **NoteMesh** | `notemesh.com` registered | **Notemesh** is an AI meeting-notes product; **NoteMesh** is an Obsidian MCP server; **notesmesh** is an Apple Notes planner | **High conflict/crowded**. ([Notemesh](https://notemesh.ai/), [NoteMesh](https://changenode.com/notemesh/), [notesmesh](https://notesmesh.com/)) |
| **NoteField** | `notefield.com` registered | **Notefield: AI Voice Notes** is on the App Store; `notefield.com` is online form management | **Medium-high**; exact name in notes. ([App Store](https://apps.apple.com/us/app/notefield-ai-voice-notes/id6760124329)) |
| **NoteSpace** | `notespace.com` registered; `notespace.app` registered | **NoteSpace – lists and notes** is on the App Store | **High conflict**, notes category. ([App Store](https://apps.apple.com/us/app/notespace-lists-and-notes/id6444676119)) |

### 10.2 One-word variants

All of these are heavily occupied; they are not realistic as product names without a modifier and legal clearance:

| Word | Obvious conflict | Domain |
|---|---|---|
| **Forest** | Forest: Focus for Productivity (Seekrtech), a well-known focus timer | `forest.com` and `forest.app` registered |
| **Grove** | Grove (Org-mode notes app on F-Droid), GroveNotes (knowledge graph), Grove Collaborative, Grove HR | `grove.com` and `grove.app` registered |
| **Canopy** | Canopy accounting practice software (Canopy Tax), Canopy AI online safety, Canopy EAP | `canopy.com` and `canopy.app` registered |
| **Trellis** | Trellis Tech, Trellis Pilates, Trellis habit tracker, Trellis legal/ag tools | `trellis.com` and `trellis.app` registered |
| **Lattice** | Lattice HR ("The People Platform"), Lattice climbing training, Lattice notes projects | `lattice.com` and `lattice.app` registered |
| **Weave** | Weave Communications (text/call/schedule), Weave Chat AAC | `weave.com` and `weave.app` registered |
| **Atlas** | Atlas Rewards Credit Card, Atlas Earth, OpenAI Atlas browser, many others | `atlas.com` and `atlas.app` registered |
| **Trail** | AllTrails, TrailLink, onX Offroad, many outdoor apps | `trail.com` and `trail.app` registered |

### 10.3 Assessment

**Facts:**

- Among the 16 `NoteX` names, `notecanopy.com` was the only unregistered `.com` in RDAP checks; `notecanopy.app` was also unregistered. (A few other `.app` names are unregistered, but their `.com` names are taken.)
- Most of the candidates have an exact or near-exact existing app/product in notes, mind mapping, or study tools: NoteCanvas, NoteTree, NoteGrove, NoteWeave, NoteAtlas, NoteTrail, NoteMap, NoteGraph, NoteBranch, NoteField, NoteSpace, and NoteScape. NoteLattice and NoteMesh are adjacent/crowded; only NoteCanopy has no exact app hit found.
- All eight one-word variants have registered `.com` names and resolved `.app` names, plus obvious software conflicts.

**Opinion:**

- `NoteCanopy` is the only name on this list I would even shortlist, and only as a working title. It has no exact app hit, both obvious domains are unregistered, and the metaphor ("a canopy over your notes") fits an outline/canvas product. But "Canopy" is used by Canopy Tax and Canopy Safety, and "Note" + common noun is a weak trademark. A real USPTO/EUIPO search and a lawyer are still required.
- `NoteTrail` is second-tier: it has an exact app but in an adjacent category (music education); still risky and not distinctive.
- The rest are not credible: they are either exact competitors or generic descriptions. `NoteMap` is especially bad because there is a Mac mind-map app with Markdown, outline view, and cross-links at `notemap.com` — almost the same product.
- The broader naming lesson: **"Note + common noun" is a crowded, weak namespace.** If the product needs a defensible brand, a coined or less literal name will outperform this list. If the team insists on descriptive English, `NoteCanopy` is the least conflicted, but expect a difficult trademark and App Store search fight.

**Trademark signals (preliminary, not clearance):** A class 9 `CANOPY` registration owned by Enthought was cancelled in 2024, and Canopy Tax has active software/apps in accounting; I found no exact `NoteCanopy` product or exact mark in a preliminary search. That is a weak signal, not clearance. ([CANOPY record](https://markinton.com/trademark/canopy-85481285), [Canopy Tax](https://apps.apple.com/us/app/canopy/id1444764477))

**Caveat:** App Store search results, domain registrations, and web search are point-in-time and not a legal trademark search. "No exact hit" does not mean "available" or "registrable."

---

## 11. Recommendation matrix

### 11.1 Stack

Scores are 1–5. **Risk: 5 = low risk, 1 = high risk.**

| Option | Dev speed | Ecosystem fit | PDF/text export | iPad/Pencil | Performance | Risk | Overall |
|---|---:|---:|---:|---:|---:|---:|---|
| **Electron + React + TS + ProseMirror/TipTap + React Flow** | 5 | 5 | 5 | 2 | 3 | 4 | **Best v1** |
| **Tauri 2 + same web stack** | 4 | 4 | 2 | 4 | 4 | 3 | Good size, PDF risk |
| **Native SwiftUI/AppKit + PDFKit/PencilKit** | 2 | 2 | 5 | 5 | 5 | 2 | Best iPad, slowest v1 |
| **Flutter** | 3 | 3 | 3 | 4 | 4 | 3 | Viable, weaker text/PDF |
| **PWA** | 4 | 4 | 2 | 2 | 3 | 2 | Not for this product |
| **Fork AFFiNE/BlockSuite** | 2 | 3 | 3 | 2 | 3 | 2 | Tempting, heavy/opinionated |

**Why Electron wins for v1:** It maximizes the two things that are hardest to fake — rich text/editor ecosystem and real-text PDF. It is also the easiest for a small TypeScript agent team. The cost is bundle size and memory, which are acceptable for a Mac study app.

**Why not Tauri:** The size/memory win is real, but PDF is a core requirement. WKWebView's PDF path is the weakest part of the stack. If Tauri is chosen, do a two-week PDF spike before committing.

**Why not native:** Best PDF/PencilKit, but you would rebuild Markdown/LaTeX/code editing and the canvas. The team would spend its budget on undifferentiated infrastructure.

### 11.2 Libraries

| Concern | Recommended | Alternative | Avoid |
|---|---|---|---|
| **Rich text** | TipTap/ProseMirror | Lexical | Markdown-only WYSIWYG as canonical |
| **Code** | CodeMirror 6 | Monaco (only if IDE features are needed) | Monaco for small code blocks |
| **Math** | KaTeX | MathJax fallback | Screenshotting formulas |
| **Canvas** | React Flow + DOM/SVG | tldraw (if licensed) | Canvas/WebGL for text |
| **Layout** | d3-hierarchy tidy tree + custom callouts | ELK/d3-dag for global reflow | dagre, force layout |
| **Ordering** | fractional-indexing | LexoRank | integer positions |
| **IDs** | UUIDv7 | nanoid | sequential IDs |
| **PDF** | Electron printToPDF | Typst for document-only export | WKWebView createPDF |
| **Persistence** | JSON bundle + assets | SQLite later | Markdown as sole source |
| **Undo** | ProseMirror history + app command stack | Yjs UndoManager if CRDT | One global naive stack |
| **Testing** | Vitest + Playwright + fast-check | Jest | Pixel-only canvas tests |

### 11.3 Feature priority (opinion)

| Priority | Feature | Why |
|---|---|---|
| P0 | Blocks + ProseMirror editing + outline | The authoring core |
| P0 | Anchored text branches + branch rendering | The differentiator |
| P0 | Primary/reference edge model + DAG validation | The data model |
| P0 | Tidy tree layout + pins | The canvas must be stable |
| P0 | Real-text PDF export | The Notability requirement |
| P1 | Code/math/image anchors | Depth of the differentiator |
| P1 | Markdown/JSON Canvas export | Portability/trust |
| P1 | Search | Study usability |
| P2 | CRDT/collaboration | Only if committed |
| P2 | iPad handwriting | Only with native bridge |
| P3 | AI features | Not the wedge |

---

## 12. What I would choose and why

**This section is opinion, clearly labelled.**

### 12.1 The stack

- **Shell:** Electron + electron-vite + electron-builder for macOS (arm64 + x64), hardened `contextIsolation`, no `nodeIntegration` in renderer.
- **UI:** React + TypeScript + Vite; Tailwind or CSS modules; no heavy component framework.
- **Editor:** TipTap on ProseMirror; per-block documents; a custom `anchor` mark; custom node views for math, code, image, table.
- **Code:** CodeMirror 6 with language packages loaded on demand.
- **Math:** KaTeX; store LaTeX source; fallback error UI.
- **Canvas:** React Flow (`@xyflow/react`) with custom block nodes and a custom anchor edge; DOM/SVG, not canvas.
- **Layout:** d3-hierarchy for the primary tree; custom callout placement, pin handling, and reference-edge routing.
- **Model:** JSON bundle + assets; UUIDv7; fractional-indexing; Zod/Valibot schema validation; pure migration functions.
- **PDF:** dedicated print route + Electron `printToPDF`; `pdf-lib` for merging/metadata/map pages if needed.
- **Testing:** Vitest, Playwright, fast-check; PDF text extraction in CI.
- **Search:** MiniSearch in-memory for v1; SQLite FTS5 later if needed.

### 12.2 The architecture

```text
apps/desktop
  main/            Electron main: windows, file I/O, printToPDF, backups
  preload/         typed IPC bridge
  renderer/        React app: outline, canvas, print route

packages/model
  schema.ts        Block, Edge, Anchor, Document, Zod
  commands.ts      create/move/delete/pin, inverse commands
  migrations/      v1 -> v2 -> ...
  validation.ts    primary acyclic, anchor integrity, asset refs

packages/editor
  proseMirror/     schema, anchor mark, node views
  code/            CodeMirror 6 integration
  math/            KaTeX node view
  markdown/        import/export (remark + custom serializer)

packages/layout
  tree.ts          d3-hierarchy primary layout
  callouts.ts      anchor rect -> callout lane -> collision
  pins.ts          fixed obstacles, dirty-subtree reflow
  routing.ts       reference-edge router

packages/canvas
  Flow.tsx         React Flow setup
  BlockNode.tsx    read-only block renderer + edit overlay
  AnchorEdge.tsx   custom edge from a live DOM rect
  MiniMap.tsx

packages/print
  ReaderDocument.tsx  outline-order print DOM
  callouts.tsx        margin callouts
  MapPage.tsx         simplified spatial overview
  pdf.ts              printToPDF orchestration

packages/ipad (later)
  SwiftUI + PencilKit companion, shared JSON bundle
```

### 12.3 Build order

1. **Model + editor + outline.** No canvas. Prove block editing, Enter/Tab/Backspace, code/math, anchors, undo, save/load.
2. **Canvas + layout.** Primary tree, pins, anchored callouts, reference edges, 100–300 blocks. Measure.
3. **PDF.** Reader layout, callouts, map page, Notability import test. Do not defer this; it constrains the model.
4. **Portability.** Markdown export, JSON Canvas export, migrations, backups.
5. **iPad spike.** Native PencilKit companion or Tauri/Capacitor bridge; do not commit until the Mac core is stable.

### 12.4 What I would not build

- A general whiteboard with freehand drawing, shapes, and templates. That is a different product and a different fight.
- A full PKM database with typed objects/supertags. Tana/Notion/Capacities own that.
- A Markdown-only vault. Anchors/edges/layout do not fit; export Markdown instead.
- A CRDT/collaboration layer before there is a second user.
- A web handwriting engine. Use PencilKit if handwriting matters.
- A canvas that prints as a screenshot. Print a reader document.

### 12.5 Decision triggers

- **If PDF export takes more than 3 weeks:** stop and reassess; maybe a Typst-based document emitter, but keep the canvas separate.
- **If 300 blocks stutter:** profile React Flow; collapse/LOD; do not jump to Canvas/WebGL until measured.
- **If iPad becomes the primary market:** pivot to a native SwiftUI/PencilKit app with the same model; do not force the web canvas.
- **If collaboration becomes a requirement:** add Yjs (text + maps) or Loro (movable tree), not a homegrown CRDT.
- **If the name must be defensible:** run a real trademark search; `NoteCanopy` is a working title, not a brand.

### 12.6 Name recommendation

**Opinion:** Use **NoteCanopy** as the working title only if the team accepts a descriptive, weak mark and commissions a trademark search. It is the only candidate in the new list without an exact app conflict and with both obvious domains unregistered. Do not print merchandise or file a trademark before clearance. If the brand matters, generate a new, less literal name rather than picking a conflicted `NoteX`.

---

## 13. Sources

### Market / apps

- Obsidian JSON Canvas: https://jsoncanvas.org
- Obsidian Canvas announcement: https://obsidian.md/blog/json-canvas
- JSON Canvas HN discussion (group/children limitations): https://news.ycombinator.com/item?id=39670922
- Obsidian Canvas edge/backlink feature request: https://github.com/Developer-Mike/obsidian-advanced-canvas/issues/16
- Heptabase fundamental elements: https://wiki.heptabase.com/fundamental-elements
- Heptabase getting started: https://wiki.heptabase.com/getting-started-with-heptabase
- Logseq DB update / Markdown mirror: https://discuss.logseq.com/t/whats-new-with-logseq-db-may-16th-2026/35020
- Logseq data model overview: https://fictty.com/data-model/logseq
- Logseq block references discussion: https://discuss.logseq.com/t/option-to-treat-specific-blocks-as-pages/13203
- Tana nodes/references: https://outliner.tana.inc/learn/features/nodes-and-references
- Tana supertags: https://outliner.tana.inc/learn/features/supertags
- RemNote PDF reader: https://help.remnote.com/en/articles/6690975-learning-from-pdfs-and-files-with-the-remnote-reader
- Roam block references: https://roamdocs.fyi/help/block-references
- Roam blocks: https://roamdocs.fyi/help/blocks
- Muse/Allume: https://allume.com
- Apple Freeform diagram connectors: https://support.apple.com/guide/freeform/add-a-diagram-frfm1e6c3d3e/mac
- Apple Freeform PDF export: https://support.apple.com/guide/freeform/export-a-board-as-a-pdf-frfm201900c07/mac
- Miro: https://miro.com
- Scrintal: https://scrintal.com
- Kinopio: https://kinopio.club
- Kinopio API: https://kinopio.club/api
- Napkin: https://www.napkin.ai
- Whimsical mind maps: https://whimsical.com/mind-maps
- XMind format: https://file-extensions.com/docs/xmind
- XMind relationships: https://xmind-help.github.io/en_US/relationship.html
- MindNode outlining: https://www.mindnode.com/support/guides/outlining
- MindNode features: https://www.mindnode.com/features
- TheBrain multiple parents discussion: https://talk.macpowerusers.com/t/the-brain-has-gone-free-for-personal-use/45965
- TheBrain review: https://www.seriousinsights.net/thebrain-14-review
- InfraNodus text network analysis: https://infranodus.com/docs/text-network-analysis
- Notion block API: https://developers.notion.com/reference/block
- Capacities vs Heptabase: https://capacities.io/compare/heptabase
- Anytype graph: https://doc.anytype.io/anytype/features/graph
- Anytype objects: https://doc.anytype.io/anytype-docs/getting-started/object-editor
- AFFiNE page/edgeless: https://affine.pro/pagedoc
- AFFiNE blocks: https://docs.affine.pro/core-concepts/elements-of-affine/blocks
- AppFlowy: https://github.com/AppFlowy-IO/AppFlowy
- Zibaldone iPad app: https://apps.apple.com/app/id6760507329

### Data structures / CRDT / persistence

- Figma fractional indexing: https://www.figma.com/blog/realtime-editing-of-ordered-sequences
- fractional-indexing: https://github.com/rocicorp/fractional-indexing
- RFC 9562 (UUIDv7): https://www.rfc-editor.org/rfc/rfc9562
- ProseMirror positions: https://prosemirror.net/docs/guide/#doc.indexing
- ProseMirror decorations: https://prosemirror.net/docs/guide/#view.decorations
- ProseMirror offset mapping discussion: https://discuss.prosemirror.net/t/thoughts-on-offsets-and-positions/706
- ProseMirror Markdown offset mapping: https://discuss.prosemirror.net/t/how-to-map-prosemirror-transactions-to-offset-based-changes-in-a-plain-text/8107
- W3C TextQuoteSelector: https://www.w3.org/TR/annotation-model/#text-quote-selector
- anchor-quote: https://github.com/robertknight/anchor-quote
- Yjs: https://yjs.dev
- Yjs UndoManager: https://docs.yjs.dev/api/undo-manager
- Automerge: https://automerge.org
- Automerge v3 memory: https://velt.dev/blog/top-crdt-libraries-for-real-time-data-sync
- Loro: https://loro.dev
- Loro performance: https://loro.dev/docs/performance
- Loro stable cursors: https://loro.dev/docs/concepts/cursor_stable_positions
- Loro license: https://lib.rs/crates/loro
- Local-first schema migrations: https://www.offlineprotocol.com/learning/local-first/how-do-schema-migrations-work-in-local-first-apps
- SQLite WASM/OPFS: https://sqlite.org/wasm/doc/trunk/persistence.md
- Notion WASM SQLite: https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite

### Layout

- Reingold–Tilford paper: https://reingold.co/tidier-drawings.pdf
- d3-hierarchy: https://d3js.org/d3-hierarchy
- ELK Layered: https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html
- ELK paper: https://arxiv.org/abs/2311.00533
- elkjs: https://github.com/kieler/elkjs
- dagre: https://github.com/dagrejs/dagre
- React Flow on dagre: https://github.com/xyflow/xyflow/discussions/2788
- d3-dag: https://erikbrinkman.github.io/d3-dag
- Graphviz: https://graphviz.org
- Tom Sawyer incremental layout: https://www.tomsawyer.com/graph-layout
- yWorks incremental layered: https://www.yworks.com/pages/layered-graph-layout
- Stable layout paper: https://robinmennens.github.io/Portfolio/files/Mennens%20et%20al.%20-%202019%20-%20A%20stable%20graph%20layout%20algorithm%20for%20processes.pdf
- Incremental grid-like layout: https://users.monash.edu/~mwybrow/papers/kieffer-gd-2013.pdf
- React Flow custom edges: https://reactflow.dev/learn/customization/custom-edges
- React Flow handles: https://reactflow.dev/learn/customization/handles

### Editors / Markdown / math / code

- ProseMirror: https://prosemirror.net
- TipTap: https://tiptap.dev
- TipTap pricing/licensing: https://tiptap.dev/pricing
- TipTap math: https://tiptap.dev/docs/editor/extensions/nodes/mathematics
- Lexical: https://lexical.dev
- Lexical vs ProseMirror: https://lexical.dev/docs/concepts/compared-with-prosemirror
- Liveblocks editor comparison: https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025
- Slate: https://www.slatejs.org
- Milkdown: https://milkdown.dev
- CodeMirror: https://codemirror.net
- CodeMirror decorations: https://codemirror.net/examples/decoration/
- Replit CodeMirror: https://replit.com/blog/codemirror
- Sourcegraph Monaco→CodeMirror: https://sourcegraph.com/blog/migrating-monaco-codemirror
- KaTeX: https://katex.org
- MathJax: https://www.mathjax.org
- Shiki: https://shiki.style
- Prism: https://prismjs.com
- remark: https://remark.js.org
- MDX: https://mdxjs.com
- Pandoc: https://pandoc.org
- Typst PDF: https://typst.app/docs/reference/pdf

### Canvas / native

- React Flow: https://reactflow.dev
- React Flow performance: https://reactflow.dev/learn/advanced-use/performance
- React Flow ~1000 nodes: https://github.com/xyflow/xyflow/issues/967
- React Flow large custom nodes: https://github.com/xyflow/xyflow/issues/3110
- React Flow culling tradeoff: https://reactflow.dev/api-reference/react-flow#onlyRenderVisibleElements
- SingleStore React Flow experience: https://www.singlestore.com/blog/refactoring-singlestores-visual-explain-to-use-react-flow
- tldraw: https://tldraw.dev
- tldraw license: https://tldraw.substack.com/p/license-updates-for-the-tldraw-sdk
- tldraw rich text: https://tldraw.dev/sdk-features/rich-text
- Excalidraw: https://github.com/excalidraw/excalidraw
- Konva: https://konvajs.org
- PixiJS: https://pixijs.com
- CanvasKit: https://skia.org/docs/user/modules/canvaskit/
- Fabric.js: https://fabricjs.com
- Paper.js: https://paperjs.org
- GPUI: https://www.gpui.rs
- egui: https://github.com/emilk/egui
- Iced: https://github.com/iced-rs/iced
- Slint: https://slint.dev
- SwiftUI TextEditor: https://developer.apple.com/documentation/swiftui/texteditor
- Flutter: https://flutter.dev
- Flutter PDF: https://pub.dev/packages/pdf
- flutter_to_pdf: https://pub.dev/packages/flutter_to_pdf

### Shells / PDF / iPad

- Electron: https://www.electronjs.org
- Electron printToPDF: https://www.electronjs.org/docs/latest/api/structures/print-to-pdf-options
- printToPDF selectable text: https://pdf4.dev/blog/pdf-generation-electron
- Tauri: https://tauri.app
- Tauri mobile plugins: https://v2.tauri.app/develop/plugins/develop-mobile/
- WKWebView createPDF no pagination: https://stackoverflow.com/questions/70337689/create-pdf-with-wkwebview-pdfconfiguration
- WKWebView printing scale: https://stackoverflow.com/questions/72467349/wrong-wkwebview-content-scale-when-printing
- WebKit 16,384 px cap: https://github.com/kashioka/Rendu/issues/57
- PDFKit (Apple): https://developer.apple.com/documentation/pdfkit
- pdf-lib: https://pdf-lib.js.org
- PDFKit JS: https://pdfkit.org
- Wails: https://wails.io
- Neutralino: https://neutralino.js.org
- iOS PWA limitations: https://tappwa.com/blog/ios-pwa-limitations-2026
- PWA file system: https://web.dev/learn/pwa/os-integration
- PencilKit: https://developer.apple.com/documentation/pencilkit
- PKCanvasView: https://developer.apple.com/documentation/pencilkit/pkcanvasview
- Capacitor PencilKit proposal: https://github.com/capacitor-community/proposals/issues/151
- Apple Pencil web pressure/tilt: https://www.youtube.com/watch?v=cMKVM7rpoBo
- Safari Scribble bug: https://mikepk.com/2020/10/iOS-safari-scribble-bug
- Notability import: https://support.gingerlabs.com/en-us/articles/16300142-importing-files
- Notability search troubleshooting: https://support.gingerlabs.com/hc/en-us/articles/360016653851-Troubleshooting-Search-Issues

### Testing

- Playwright visual comparisons: https://playwright.dev/docs/test-snapshots
- fast-check: https://fast-check.dev
- fast-check examples: https://github.com/dubzzz/fast-check-examples

### Names

- NoteCanvas Windows app: https://www.microsoft.com/en-us/p/notecanvas/9mvq2vcrmpxj
- NoteTree Mac app: https://noteifyapp.com/notetree
- NoteTree visual maps: https://www.notetree.app/
- NoteGrove portfolio: https://www.jeromymobley.com/apps
- NoteCanopy RDAP (.com): https://rdap.verisign.com/com/v1/domain/notecanopy.com
- NoteCanopy RDAP (.app): https://rdap.org/domain/notecanopy.app
- NoteWeave App Store: https://apps.apple.com/us/app/noteweave/id6798396443
- Lattice notes: https://lattice-notes.com/
- Lattice Notes AI: https://latticenotes.app/
- NoteScape: https://notescape.vercel.app/
- NoteScape GitHub: https://github.com/maheshpaulj/NoteScape
- NoteAtlas App Store: https://apps.apple.com/us/app/noteatlas-chat-style-notes/id6751585745
- NoteTrail App Store: https://apps.apple.com/us/app/notetrail-sight-reading/id6801622450
- Notemap: https://notemap.com
- NoteMap 2 App Store: https://apps.apple.com/us/app/notemap-2/id1338231745
- NotesGraph: https://notesgraph.com/
- NoteGraph Joplin plugin: https://discourse.joplinapp.org/t/plugin-notegraph-turn-any-note-into-an-ai-powered-knowledge-graph/49378
- NoteBranch: https://notebranch.app/
- NoteBranch GitHub: https://github.com/scabir/notebranch
- Notemesh: https://notemesh.ai/
- NoteMesh (Obsidian MCP): https://changenode.com/notemesh/
- notesmesh: https://notesmesh.com/
- NoteField App Store: https://apps.apple.com/us/app/notefield-ai-voice-notes/id6760124329
- NoteSpace App Store: https://apps.apple.com/us/app/notespace-lists-and-notes/id6444676119
- Forest App Store: https://apps.apple.com/us/app/forest-focus-for-productivity/id866450515
- Grove (Org-mode): https://f-droid.org/packages/com.rrajath.grove
- Canopy (accounting): https://apps.apple.com/us/app/canopy/id1444764477
- CANOPY class 9 record: https://markinton.com/trademark/canopy-85481285
- Lattice (HR): https://apps.apple.com/us/app/lattice-the-people-platform/id1409785530
- Weave (communications): https://apps.apple.com/us/app/weave-text-call-schedule/id1030476630
