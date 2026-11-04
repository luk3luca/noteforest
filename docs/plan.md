# NoteForest — Plan

**Version:** v2 (3 November 2026)  
**Owner:** Orchestrator  
**Status:** Spike 1 complete; editor-first milestone approved by the product owner.

## Rules

- One milestone at a time; a milestone starts only after the previous gate is reviewed.
- Builder works in a worktree, one task at a time, and does not change the spec.
- Every code change has tests. UI work has an app screenshot; screen recordings belong to the product owner.
- A stack, PDF-pipeline, or layout/pagination change requires an ADR.
- The spec (`docs/spec.md`) is the source of truth for behavior; the ADRs are the source of truth for architecture.

## Editor-first correction (3 November 2026)

The product owner reviewed the Spike 1 PDFs and rejected them as a product demo:

- the 53-page fixture has no arrows because it has no branches; it does not represent the real use case;
- some edge routes loop backwards and look wrong;
- without an editor there is no way to touch the product and judge the PDF.

Decision: **build the editable shell first, then fix the page/PDF pass from the real editor.** The spike's layout/paginator/print pipeline is kept as a technical foundation, but no more PDF polish until the editor is usable.

The first touchable slice is an Obsidian-like desktop shell: left sidebar with the document library and the active document's topic tree, top tabs for multiple open documents, and a continuous block editor. PDF/page view is deferred to M4.

## Milestones

| ID | Milestone | Goal | Gate | Status |
|---|---|---|---|---|
| **M0** | Ratification | Close stack, PDF, API defaults, tables, reader-primary; align docs | ADR-0001/0002/0003 accepted; spec v0.4.1; DoD/checklist aligned | **Done** |
| **M1** | Spike 1 — technical foundation | Prove adaptive layout + paginator + real-text PDF in Electron | Spike 1 gates G1–G9 passed and independently re-run; visuals deferred | **Done** |
| **M2** | Editor shell + document core | Touchable Obsidian-like shell with a continuous branch editor: sidebar, document tabs, block editing, basic primary branches with visible arrows, local documents, autosave | Create/open/edit/save/reopen two documents; tabs; create a child branch and see the arrow; keyboard; screenshots; 300-block editor | **M2b merged; review found fixes** |
| **M2c** | Interaction polish + desync fix | Fix phantom blocks/missing arrows; shared arrow trunk; inline chapter editing; full-height sidebar/tabs in editor column; heading escape; UI sans + denser editor; right/bottom `+`; canvas add top-level/chapter; landscape default; new keymap | No phantom under rapid creation; sidebar/canvas/arrow parity; 3-child trunk; new doc landscape; new keys; screenshots | **Merged; review found layout/UX corrections** |
| **M2d** | Depth columns + M2 polish | Depth-column alignment, horizontal scroll, branch-port collapse, non-destructive Backspace, contextual add, trunk continuity, 1,600 px canvas | Same depth = same x column; 4-level empty chain fits at 1440; collapse adds no height; Backspace does not delete; add top-level in the active chapter; trunk continuous; tests/screenshots | **In progress** |
| **M3** | Span anchors and reference edges | Anchors inside content (word/formula/code/image), reference/shared children, anchored callouts, repair | AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58 | Planned |
| **M4** | Reader/page + PDF | Reader as primary editor, page view, adaptive layout, freeze/reflow, PDF arrows and print polish from real documents | AC-23–AC-33, AC-39–AC-45, AC-51–AC-53, AC-60–AC-66 | Planned |
| **M5** | External API + MCP | HTTP JSON API, MCP adapter, tokens/scopes, dry-run/apply/undo, audit, lock integration | AC-70–AC-74; ADR-0003 test matrix | Planned |
| **M6** | Library, search, polish | Search, light theme, accessibility, onboarding, packaging, release checks | AC-67–AC-69, AC-75–AC-76; DoD release checklist | Planned |

## M1 — Spike 1 (done)

The full report is `docs/spikes/spike-01-report.md`; the brief is `docs/spike-01-layout-paginator-pdf.md`.

What passed:

- pure TypeScript adaptive layout, safe break candidates, paginator;
- F2: 225 blocks → 53 derived pages → 53 PDF pages, 225/225 block texts, 0 missing glyphs, geometry Δ ≤ 0.48 mm;
- F7: 300 blocks → 39 pages, cold layout 17.9 ms, warm 0.6 ms, PDF 262 ms;
- table rows atomic, too-tall row blocked, atomic export, deterministic reopen.

What is deferred:

- edge routing quality and the “backwards” arrow appearance;
- the 53-page fixture has no branches, so no arrows; the next PDF pass must use a real branched document;
- visual/product judgement of PDFs (needs the editor first);
- fonts, metadata, CJK, 1,000-block/virtualization, incremental layout.

## M2 — Editor shell + document core (current)

**Goal:** the product owner can open the app, create/open documents, edit blocks, switch documents in tabs, save, and reopen — and judge the feel.

**In scope:**

- Electron shell with a calm Obsidian-like layout:
  - left sidebar: library/documents + active document topic tree (chapters → blocks);
  - top tab bar: multiple open documents, dirty state, close, overflow;
  - central **continuous branch editor**: top-level blocks stack, children go right or wrap below, SVG arrows parent → child; editable block cards;
  - status bar: save state, word count, document path.
- Local document persistence: one JSON document + assets folder in a user-chosen location; autosave; backup; reopen.
- Multiple documents: create, open, recent, tabs; per-tab scroll/focus state.
- Block model: chapters, top-level blocks, primary children, stable IDs, labels, collapse, reorder.
- **Basic primary branches (the distinguishing feature)**: create a child from a block, reparent/reorder, delete the primary edge (target becomes top-level); one primary parent per block; acyclic; visible arrows. No span anchors, reference edges, or shared children yet.
- TipTap block editor: paragraphs, headings, lists, blockquotes, code, inline/display math, images, tables; Enter/Tab/Backspace structural commands; one active editor.
- Keyboard: `⌘\` sidebar (`⌘B` is bold), `⌘N` new document, `⌘W` close tab, `⌘1…9` tab switch, `⌘S` save, `⌘K` command palette (basic).
- Dark mode default; light mode may be deferred.
- UI stack: shadcn/ui with the React Aria base + Tailwind v4; React Aria Tree; custom tabs; `react-resizable-panels`; dnd-kit tabs; Sonner; Zustand; lucide; TipTap 3; custom SVG edge overlay. See ADR-0004 and `research/ui-components.md`.
- Documentation: `docs/ux-shell.md` and `docs/tasks/m2-editor-shell.md`.

**M2 design decisions (approved):**

- Top-level block measure 34 rem (544 px), child 160–420 px; editor canvas max ~1,100 px.
- Wrap indent 18 px; sibling gap 24 px; block padding 12 px; radius 4 px.
- Edges are orthogonal elbows; wrapped children use a bottom trunk-and-bus; arrowhead only at the child.
- Selected block highlights the root→block path; other edges dim.
- Child cards use a subtle surface, no default border; top-level blocks are transparent.
- Reparent is `Move to…` menu/keyboard only; drag reorders siblings. No free drag-to-reparent in M2.
- Scroll only; no zoom/pan/minimap. Reference edges reserve a dashed token but no UI.

**Out of scope for M2:**

- span anchors on words/formulas/code/image regions (M3);
- reference edges, shared children, "see also" (M3);
- page view, adaptive page layout, PDF (M4);
- external API/MCP (M5);
- collaboration, plugins, annotations, iPad;
- pixel-perfect final visual design.

**Gate:**

- app launches and the shell renders with no console errors;
- create a document, add chapters/blocks, edit rich content, autosave, reopen; content preserved;
- two documents open in tabs; switching preserves scroll/focus; dirty state visible;
- **create a child branch from a block; the arrow is visible, starts at the source and ends at the target, and never loops backwards across the source; reparent/reorder updates the arrow; delete the edge and the target becomes top-level; a primary cycle is rejected;**
- keyboard structural commands work and undo is predictable;
- 300 blocks remain usable (collapse/virtualization may be minimal in M2, but no freeze);
- product-owner visual check: calm, Obsidian-like, no AI-slop patterns;
- tests: model/persistence unit tests, editor keyboard tests, branch/arrow geometry tests, one e2e create/edit/branch/reopen flow; screenshots.

## M2c — Interaction polish + desync fix (current)

Approved after the product owner's hands-on review of M2b. Full brief: `docs/tasks/m2c-interaction-polish.md`.

- **Blocker:** phantom block/desync between ProseMirror and the canonical document; missing arrows after child/sibling creation. Fix with a serialized structural command queue, created ID from the command result, structural transactions out of text history, and reconciliation.
- **Arrows:** one shared vertical trunk for 2+ children; single elbow for one; bottom trunk-and-bus for wrapped children.
- **Shell:** full-height sidebar; tab strip only in the editor column; title bar full width.
- **Editor:** inline chapter title; heading escape; UI sans 15.5 px/1.55; 10 px block padding, 16 px gap, 1,400 px canvas; right `+` child, bottom `+` sibling.
- **Authoring:** add top-level block and chapter from the canvas.
- **Default:** new documents A4 landscape; existing documents keep orientation.
- **Keyboard:** `Enter`/`Shift+Enter` line breaks; `Option+Enter` sibling; `Control+Enter` child; Tab list indent / selected-block child.
- **Deferred:** font family/size Settings UI (M6).

## M2d — Depth columns + M2 polish (current)

Approved after the second product-owner pass. Full brief: `docs/tasks/m2d-depth-columns.md`.

- **Depth columns (D22):** all visible blocks at the same depth share one x origin within a chapter; column widths are content-driven, not fixed pixels; top-level blocks stack vertically; columns reset per chapter. The editor scrolls horizontally when columns exceed the viewport.
- **Width:** canvas max ~1,600 px; top-level max 480 px; child min 144 px; gap 16 px. The 4-level chain (`top → f → ff → fff`) fits at 1440 without wrapping.
- **Collapse on the branch port:** clicking the port/trunk collapses the child column; a compact dot with the child count re-expands it. No footer, no extra block height.
- **Backspace:** plain Backspace on an empty block does not delete; it moves the caret. `⌘Backspace`/`Delete` on a selected block deletes (confirm with children). Table cells are never deleted by Backspace.
- **Contextual add:** each chapter ends with “+ Add top-level block”; “+ Add chapter” inserts after the active chapter.
- **Trunk continuity:** the first child's branch is continuous with the parent port; the trunk starts at a T-junction with no gap.
- **Wrapped arrows:** if the page renderer later wraps a child below, its arrow enters the left side from the indent gutter, not the top.
- **Deferred:** M3 anchors/reference edges; page/PDF; font/size settings.

## M3 — Span anchors and reference edges (planned)

- Anchors inside content: word/phrase, formula term, code token, image region; anchored callouts.
- Reference/shared children, "see also", make-home/move-here; reference edges never affect layout or pagination.
- Broken/ambiguous anchor repair; no silent data loss.
- Gate: AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58; real branched fixture; screenshots.

## M4 — Reader/page + PDF (planned)

- Wire the spike's layout/paginator into the real editor; reader remains the primary authoring surface.
- Page view preview; freeze/full reflow; page-break markers; zoom/fit.
- Fix edge routing: no backwards loops; branch edges start at the parent/source and end at the target, with a clear route; cross-page edges use page-edge indicators.
- PDF from real documents with branches; verify arrows, continuation/ghost markers, table rows, text layer, page count, geometry.
- Gate: AC-23–AC-33, AC-39–AC-45, AC-51–AC-53, AC-60–AC-66; ADR-0002 gate on packaged build.

## M5–M6 — API and polish (planned)

- M5: local HTTP JSON API + MCP adapter on the same command layer; tokens/scopes, dry-run/apply/undo, audit, single-writer lock.
- M6: search, light theme, accessibility, onboarding, packaging, release checks.

## Risks and decision points

| Risk | Where it bites | Mitigation |
|---|---|---|
| Editor shell becomes a generic AI-looking dashboard | M2 | `research/ui-components.md`, `docs/ux-shell.md`, anti-slop checklist; product-owner screenshot review. |
| Shell scope creep (too many panels/features) | M2 | Only sidebar + tabs + editor + status bar; no inspector/backlinks panel in M2. |
| Document core and editor drift | M2 | One command layer; TipTap behind an adapter; typed document model. |
| PDF visuals still wrong when reconnected | M4 | Use real branched documents; edge-routing fixtures; page-view geometry tests; product-owner review. |
| 1,000-block performance regresses | M3–M4 | Measure at 300 in M2; virtualization/collapse/LOD in M4. |
| Library/tabs state gets complex | M2 | One store for open tabs/view state; persistence of recent docs only in M2. |
