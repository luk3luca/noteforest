# NoteForest — Plan

**Version:** v2 (3 November 2026)  
**Owner:** Orchestrator  
**Status:** M2f accepted; M3 design delta merged (spec v0.4.5, UX v1.4, ADR-0005); M3a1/M3a2/M3b1/M3b2a/M3b2b/M3c1/M3b2c/M3c2a/M3c2b/M3c3a/M3d1/M3d2 merged; M3c3b image anchors blocked on the image pipeline; M3e repair/health in progress; M3f queued.

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
| **M0** | Ratification | Close stack, PDF, API defaults, tables, reader-primary; align docs | ADR-0001/0002/0003 accepted; spec v0.4.5; DoD/checklist aligned | **Done** |
| **M1** | Spike 1 — technical foundation | Prove adaptive layout + paginator + real-text PDF in Electron | Spike 1 gates G1–G9 passed and independently re-run; visuals deferred | **Done** |
| **M2** | Editor shell + document core | Touchable Obsidian-like shell with a continuous branch editor: sidebar, document tabs, block editing, basic primary branches with visible arrows, local documents, autosave | Create/open/edit/save/reopen two documents; tabs; create a child branch and see the arrow; keyboard; screenshots; 300-block editor | **M2f complete; M2 acceptance pending** |
| **M2c** | Interaction polish + desync fix | Fix phantom blocks/missing arrows; shared arrow trunk; inline chapter editing; full-height sidebar/tabs in editor column; heading escape; UI sans + denser editor; right/bottom `+`; canvas add top-level/chapter; landscape default; new keymap | No phantom under rapid creation; sidebar/canvas/arrow parity; 3-child trunk; new doc landscape; new keys; screenshots | **Merged; review found layout/UX corrections** |
| **M2d** | Depth columns + M2 polish | Depth-column alignment, horizontal scroll, branch-port collapse, non-destructive Backspace, contextual add, trunk continuity, 1,600 px canvas | Same depth = same x column; 4-level empty chain fits at 1440; collapse adds no height; Backspace does not delete; add top-level in the active chapter; trunk continuous; tests/screenshots | **Merged; depth columns reverted by M2e** |
| **M2e** | Parent-relative layout + arrow routing | Revert global depth columns; swap `+`/collapse; routing lab + fixed arrowheads; fit-width/focus for deep branches | No global x; close arrows legible; first child not skewed; 4-level fit; zoom/focus works; tests/screenshots | **Merged; review found blockers** |
| **M2f** | Stability fixes from Sentinel review | Quit lifecycle, flush/close contract, undo model, corrupt-document recovery, keyboard focus, empty chapters, stale locks, test cleanup/e2e budget | S1 quit fixed; flush failures typed; undo sequence; read-only/recovery; Tab exit; empty-chapter invariant; e2e <60s; tests | **Accepted; collapsed-port fix merged** |
| **M3** | Span anchors and reference edges | Anchors inside content (word/formula/code/image), reference/shared children, anchored callouts, repair | AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58 | **In progress — M3a** |
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

## M2 — Editor shell + document core

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

- Parent-relative placement (D23): a child group starts after its parent + gap; same-depth blocks under different parents may differ in x.
- Editor canvas max ~1,600 px; top-level 160–480 px; child 144–420 px; gap 16 px; empty blocks at minimum.
- No wrap in the editor: horizontal scroll for deep branches; page/PDF applies A4 in M4.
- Edges: one shared trunk for 2+ children; fixed arrowhead; 12 px minimum stem; continuous first child; no U-turn.
- Selected block highlights the root→block path; other edges dim.
- Child cards use a subtle surface, no default border; top-level blocks are transparent.
- Collapse at top-right; `+` child at the right-edge center; `+` sibling at the bottom; drag handle left.
- Reparent is `Move to…`/keyboard; drag reorders siblings. No free drag-to-reparent.
- Zoom/fit and Focus branch are navigation aids; no minimap. Reference edges reserve a dashed token but no UI.
- New documents default A4 landscape; existing documents keep their orientation.

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

## M2c — Interaction polish + desync fix

Approved after the product owner's hands-on review of M2b. Full brief: `docs/tasks/m2c-interaction-polish.md`.

- **Blocker:** phantom block/desync between ProseMirror and the canonical document; missing arrows after child/sibling creation. Fix with a serialized structural command queue, created ID from the command result, structural transactions out of text history, and reconciliation.
- **Arrows:** one shared vertical trunk for 2+ children; single elbow for one; bottom trunk-and-bus for wrapped children.
- **Shell:** full-height sidebar; tab strip only in the editor column; title bar full width.
- **Editor:** inline chapter title; heading escape; UI sans 15.5 px/1.55; 10 px block padding, 16 px gap, 1,400 px canvas; right `+` child, bottom `+` sibling.
- **Authoring:** add top-level block and chapter from the canvas.
- **Default:** new documents A4 landscape; existing documents keep orientation.
- **Keyboard:** `Enter`/`Shift+Enter` line breaks; `Option+Enter` sibling; `Control+Enter` child; Tab list indent / selected-block child.
- **Deferred:** font family/size Settings UI (M6).

## M2d — Depth columns + M2 polish

Approved after the second product-owner pass. Full brief: `docs/tasks/m2d-depth-columns.md`.

- **Depth columns (D22):** all visible blocks at the same depth share one x origin within a chapter; column widths are content-driven, not fixed pixels; top-level blocks stack vertically; columns reset per chapter. The editor scrolls horizontally when columns exceed the viewport.
- **Width:** canvas max ~1,600 px; top-level max 480 px; child min 144 px; gap 16 px. The 4-level chain (`top → f → ff → fff`) fits at 1440 without wrapping.
- **Collapse on the branch port:** clicking the port/trunk collapses the child column; a compact dot with the child count re-expands it. No footer, no extra block height.
- **Backspace:** plain Backspace on an empty block does not delete; it moves the caret. `⌘Backspace`/`Delete` on a selected block deletes (confirm with children). Table cells are never deleted by Backspace.
- **Contextual add:** each chapter ends with “+ Add top-level block”; “+ Add chapter” inserts after the active chapter.
- **Trunk continuity:** the first child's branch is continuous with the parent port; the trunk starts at a T-junction with no gap.
- **Wrapped arrows:** if the page renderer later wraps a child below, its arrow enters the left side from the indent gutter, not the top.
- **Deferred:** M3 anchors/reference edges; page/PDF; font/size settings.

## M2e — Parent-relative layout + arrow routing

Approved after the M2d review. Full brief: `docs/tasks/m2e-routing-and-layout.md`.

- **Revert depth columns (D23):** child groups are parent-relative; same-depth blocks under different parents may differ in x. Content-driven widths; top-level vertical; horizontal scroll for deep branches.
- **Swap controls:** `+` add-child at the right-edge center; collapse at the top-right; no footer height.
- **Routing lab:** design and compare arrow variants before the fix; fixed-size arrowhead, minimum horizontal stem, fan/stagger for close children, continuous first-child path. Choose with screenshots.
- **Navigation:** zoom out/in/reset (`⌘-`, `⌘0`, `⌘+`) and Focus branch for deep indentation. Page-width wrap preview is M4.
- **Keep:** 1,600 px canvas / 480 px top-level / 144 px child min, non-destructive Backspace, contextual add, M2c/M2d fixes.

## M2f — Stability fixes from Sentinel review

Sentinel's verdict is **Request changes**. Full review: `docs/reviews/m2-review.md`; phased brief: `docs/tasks/m2f-stability-fixes.md`.

**Phase 1 (done): F1 quit lifecycle + F8 test infrastructure.**
- S1 quit fixed; close-window-then-quit e2e passes (~0.6 s).
- Unit 147/1.3 s; critical e2e 10/18.2 s (was 13/96–103 s); zero fixed waits in critical.
- Perf/visual split into `test:perf` / `test:visual`; `verify:fast` 31 s, `verify` 32 s.
- No critical coverage removed.

**Phase 2a (done): F4 flush/close contract.**
- Typed flush result; timeout/error never close/quit silently; preload forwards real errors; Retry/Cancel dialog.
- Critical e2e 14/22.2 s; unit 155/1.35 s.

**Phase 2b1 (done): save-failure recovery UI.**
- Typed save errors; persistent Retry/Save copy/Reload/Reveal; autosave backoff; no false Saved.
- Unit 171/1.4 s; critical e2e 18/31.4 s.

**Phase 2b2a (done): external modification reload/overwrite.**
- Dedicated state; Overwrite only for external modification, non-default confirm; Reload/Save copy preserved.
- Unit 177/1.44 s; critical e2e 21/38.1 s.

**Phase 2b2b (done): backup listing/restore.**
- Restore backup… for every failure code; valid backups newest first; restore as a new copy; original untouched; empty state.
- Unit 186/1.5 s; critical e2e 25/48.2 s.

**Phase 3a (done): unified undo routing.**
- One routed undo/redo with text/structural fallback; no time-based choice/dedupe; menu/palette/keyboard parity.
- Unit 194/1.5 s; critical e2e 26/51.3 s.

**Phase 3b1 (done): destructive delete/detach undo.**
- `structure.restore` exact inverse; preserves IDs/order/chapter/anchors; redo re-applies.
- Unit 204/1.5 s; critical e2e 26/53.3 s.

**Phase 3b2 (done): move/branch-create identity.**
- Branch IDs and original chapter/top-level placement preserved; redo exact.
- Unit 213/1.62 s; critical e2e 26/55.8 s.

**Phase 4a (done): corrupt/missing/newer recovery.**
- Library status/reason; read-only recovery surface; backup restore as copy; missing session tab Retry/Remove.
- Unit 221/1.7 s; critical e2e 26/55.7 s; recovery 6/12.7 s wall.

**Phase 4b (done): empty-chapter invariant + stale-lock consent.**
- Reject moves/deletes that would strand an empty chapter; render legacy empties; repair all empty chapters.
- Stale locks read-only; explicit Take over; no auto-break.
- Unit 241/1.8 s; critical e2e 26/56.8 s; recovery 10/18.9 s.

**Phase 5a (done): keyboard/focus/a11y.**
- Tab exits editor; card/shell controls reachable; Ctrl+Tab cycles; save-state live region; context-menu focus trap; accessible tab close.
- Unit 241/1.8 s; critical e2e 26/58.7–59.1 s; UI 1/1; recovery 10/10.

**Phase 5b (done; awaiting re-review): cleanup.**
- Dead code/exports removed; duplicate PDF atomic writer removed; core snapshot `history.ts` removed
  because the adopted undo model is the renderer's routed text/structural stacks.
- Renderer tree selectors now delegate to `@noteforest/core` structural helpers.
- Unused deps removed; KaTeX pinned to one in-range version; pdfjs pinned to one version; lowlight
  bundle accepted and recorded; `engines.node` added.
- Fixtures validate (`selector` + asset `mime` restored); `spike:*` scripts separated from the
  default workflow; docs aligned with M2e/M2f.
- No behavior change; backup-restore e2e moved to the recovery suite, critical e2e 23/23 in 48.7 s.

**Phase 5c (done; Sentinel accept with minor): Sentinel N1/N2.**
- N1: `block.create` inverse may empty a chapter; failed undo/redo entries are dropped and reported;
  New chapter is one queue task and one `⌘Z` entry that removes chapter + first block.
- N2: clean read-only documents and session-state write failures no longer block close/quit; real
  document save failures keep Retry/Cancel.
- N3/N5/N6: README/DoD drift, `library.ts` no-op, KaTeX deprecation note.
- Test split: session/a11y/layout flows moved to `tests/ui/m2-shell.test.mjs`; critical e2e is
  20 tests at 52.2–53.4 s warm suite time. E2E windows run hidden so tests never steal focus;
  visual opts into a visible window.
- Re-review: no open S1/S2; S3-1 DoD/checklist headers fixed; S3-2 cold-cache e2e 62.8 s vs 60 s
  (warm and `verify` pass); S4 nits recorded. Perf stays hidden: hidden vs visible initial render
  measured 1,017 vs 1,019 ms, so the baseline is comparable.
- Unit 252/1.9 s; recovery 14; UI 5; `verify` exit 0.

**M2f follow-up (done): collapsed branch-port alignment.**
- The collapsed count bubble was centered 2 px left of the add-child control: the port was
  20 px wide (`padding: 0 2px`) while the add-child control is 16 px.
- Fix removes the horizontal port padding so its 16 px box aligns with the control below
  (centers 792/792); a two-digit count grows left from the fixed right edge.
- UI assertion added to the existing layout test; full `verify` passes (e2e 20/54.1 s, recovery 14,
  UI 5).

**Status:** M2f accepted; M3 design merged (spec v0.4.5, UX v1.3, ADR-0005); M3a1 merged; M3a2 anchor commands in progress.

## Backlog — editor UX (not scheduled)

Product-owner priority recorded on 5 November 2026.

1. **Code block chrome** — P1 after M3. Give a code block Obsidian-like affordances without making
   the fence canonical: header with language picker, Copy, **Turn into text**, Delete; fence rails
   ` ``` ` visible when the block is focused/selected; the same actions in the block menu and command
   palette. Keep the JSON `codeBlock` node as the source; fences remain import/export only. Brief:
   `docs/tasks/code-block-chrome.md`. Markdown fence import/export is a separate task.

## Backlog — math & media (not scheduled)

Product-owner priority recorded on 5 November 2026. None of these is in M3; revisit after M4/PDF.

1. **`$...$` inline / `$$...$$` display input rules** — P1, quick win. Inline/block math nodes and
   KaTeX already exist; the block input rule currently uses `$$$...$$$`, and inline `$...$` exists
   only as a paste/import migration helper. Add live input rules with escape/currency guards and
   Markdown round-trip tests.
2. **Math symbol/template palette** — P2, high value. A popover with Greek/arrows/operators and
   structures (fraction, root, matrix, system, cases, aligned), inserting LaTeX at the caret with
   placeholders. Keep LaTeX as the source; no WYSIWYG equation editor.
3. **Drawing canvas for images** — P3, lower priority. Modal pen/highlighter/shapes/text, export
   SVG/PNG into the asset pipeline, insert as an image block. After images/assets are stable.
4. **Draw-to-formula** — P4, curiosity only, not planned. Handwriting math OCR is a separate
   product: on-device model packaging, accuracy, privacy, or an opt-in service. Only reconsider as
   a separate opt-in module.

## M3 — Span anchors and reference edges (implementation starting)

- Anchors inside content: word/phrase, formula term, code token, image region; anchored callouts.
- Reference/shared children, "see also", make-home/move-here; reference edges never affect layout or pagination.
- Broken/ambiguous anchor repair; no silent data loss.
- Gate: AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58; real branched fixture; screenshots.
  AC-56 M3 evidence is the exactly-once export manifest; PDF marker/page evidence is M4. AC-18 is
  satisfied by the minimal `block.split`/`block.merge` in M3f (cross-chapter merge rejected).
- Design package approved by the product owner on 5 November 2026: `docs/design/m3-anchors-references.md`;
  spec v0.4.5, UX v1.3, ADR-0005 are merged. C1/C8/C9 and OD-1–OD-12 are approved.
- Slices: M3a1 anchor model/binding/resolution (merged) → M3a2 anchor commands + branch extension
  (merged) → M3b1 text anchor authoring (merged) → M3b2a callout lane (merged) → M3b2b outline
  rows/marker navigation (merged) → M3c1 whole-formula anchors (merged) → M3b2c left-entry below-stack
  routing (merged) → M3c2a formula-term creation (merged) → M3c2b term geometry/highlight (merged) →
  M3c3a code range anchors (merged) → **M3c3b image anchors blocked: no image insertion/asset
  rendering yet** → M3d1 reference edges (merged) → M3d2 make-home/move-here/demote (merged) →
  **M3e repair/health (in progress)** → M3f identity/undo/split-merge/fixtures.
- **M3b2c approved layout rule (5 November 2026):** direct children stay right while they fit and
  join the below stack when they wrap; callouts always below, before wrapped direct children; one
  shared left trunk with horizontal arms; every arrow enters from the left, never the top. This
  supersedes the M3b2a "direct children after the lane / top-entry" route. Brief:
  `docs/tasks/m3b2c-left-entry-below-stack.md`.

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
