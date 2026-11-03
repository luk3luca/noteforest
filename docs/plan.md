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
| **M2** | Editor shell + document core | Touchable Obsidian-like shell: sidebar, document tabs, block editor, local documents, autosave | Create/open/edit/save/reopen two documents; tabs; keyboard; screenshots; 300-block editor | **In progress** |
| **M3** | Branches and anchors | Primary/reference edges, span anchors, anchored callouts, shared-child lifecycle, outline order | AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58 | Planned |
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
  - central continuous block editor (reader-like, not the page view);
  - status bar: save state, word count, document path.
- Local document persistence: one JSON document + assets folder in a user-chosen location; autosave; backup; reopen.
- Multiple documents: create, open, recent, tabs; per-tab scroll/focus state.
- Block model: chapters, top-level blocks, direct children, stable IDs, labels, collapse, reorder.
- TipTap block editor: paragraphs, headings, lists, blockquotes, code, inline/display math, images, tables; Enter/Tab/Backspace structural commands; one active editor.
- Keyboard: `⌘B` sidebar, `⌘T` new document, `⌘W` close tab, `⌘1…9` tab switch, `⌘S` save, `⌘K` command palette (basic).
- Dark mode default; light mode may be deferred.
- Documentation: `docs/ux-shell.md` and `docs/tasks/m2-editor-shell.md`.

**Out of scope for M2:**

- branches and anchors (M3);
- adaptive spatial layout, page view, PDF (M4);
- external API/MCP (M5);
- collaboration, plugins, annotations, iPad;
- pixel-perfect final visual design.

**Gate:**

- app launches and the shell renders with no console errors;
- create a document, add chapters/blocks, edit rich content, autosave, reopen; content preserved;
- two documents open in tabs; switching preserves scroll/focus; dirty state visible;
- keyboard structural commands work and undo is predictable;
- 300 blocks remain usable (collapse/virtualization may be minimal in M2, but no freeze);
- product-owner visual check: calm, Obsidian-like, no AI-slop patterns;
- tests: model/persistence unit tests, editor keyboard tests, one e2e create/edit/reopen flow; screenshots.

## M3 — Branches and anchors (planned)

- Primary/reference edges, branch creation from a block and from a span, anchored callouts, shared-child lifecycle, make-home/move-here.
- Outline order anchored-first, direct children after; reference edges as chips.
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
