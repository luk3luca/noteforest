# NoteForest — Plan

**Version:** v2 (3 November 2026)  
**Owner:** Orchestrator  
**Status:** M2f accepted; M3 implementation complete (spec v0.4.5, UX v1.4, ADR-0005); M3f2 and M3g1–M3g6 merged. Sentinel M3 review returned **request changes**. Product-owner decisions are recorded: AC-21 + image rows of AC-57 deferred to M3c3b; token values 88/28; callout `safeGap` is a 16 px minimum; idle-anchor removal is in M3h3; VoiceOver remains the product-owner gate. M3h1/M3h2 are launched via orchestrator v2. M3c3b image anchors remain blocked on the image pipeline; UI paste/duplicate is a follow-up. M4/PDF remain blocked until M3 is accepted.

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
| **M3** | Span anchors and reference edges | Anchors inside content (word/formula/code/image), reference/shared children, anchored callouts, repair | AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58 | **Accepted 6 Nov 2026; AC-21/image AC-57 deferred to M3c3b** |
| **M3i** | Core stabilization | Runtime/session/projection/save/gateway boundaries, repository/migrations/asset contract, command aggregates/invariants, boundary check, test harness cleanup | No visual change, no new runtime dep, all gates green | **Done 6 Nov 2026; see `docs/reports/m3i-closure.md`** |
| **M3c3b** | Image pipeline + image anchors | Deferred AC-21: asset store, image insertion/rendering, region/point anchors, missing-asset behavior | AC-21 + image rows of AC-57 | **Delivered by M3c3b1/b2; crop/region re-pick follow-ups** |
| **M4** | Reader/page + PDF | Reader as primary editor, page view, adaptive layout, freeze/reflow, PDF arrows and print polish from real documents | AC-23–AC-33, AC-39–AC-45, AC-51–AC-53, AC-60–AC-66 | **Unblocked; planned** |
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

## M3 — Span anchors and reference edges (implementation complete; review/acceptance pending)

- Anchors inside content: word/phrase, formula term, code token, image region; anchored callouts.
- Reference/shared children, "see also", make-home/move-here; reference edges never affect layout or pagination.
- Broken/ambiguous anchor repair; no silent data loss.
- Gate: AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58; real branched fixture; screenshots.
  AC-56 M3 evidence is the exactly-once export manifest; PDF marker/page evidence is M4. AC-18 is
  satisfied by the minimal `block.split`/`block.merge` in M3f (cross-chapter merge rejected).
- Design package approved by the product owner on 5 November 2026: `docs/design/m3-anchors-references.md`;
  spec v0.4.5, UX v1.4, ADR-0005 are merged. C1/C8/C9 and OD-1–OD-12 are approved.
- Slices: M3a1 anchor model/binding/resolution (merged) → M3a2 anchor commands + branch extension
  (merged) → M3b1 text anchor authoring (merged) → M3b2a callout lane (merged) → M3b2b outline
  rows/marker navigation (merged) → M3c1 whole-formula anchors (merged) → M3b2c left-entry below-stack
  routing (merged) → M3c2a formula-term creation (merged) → M3c2b term geometry/highlight (merged) →
  M3c3a code range anchors (merged) → **M3c3b image anchors blocked: no image insertion/asset
  rendering yet** → M3d1 reference edges (merged) → M3d2 make-home/move-here/demote (merged) →
  M3e repair/health (merged) → M3f1 split/merge with anchor migration (merged) → M3f2 export
  manifest/fixtures/performance (merged).
- **M3 status:** implementation complete; Sentinel M3 review is **request changes**
  (`docs/reviews/m3-review.md`): four S2 findings (placement undo history, AC-55 preview/confirm,
  AC-06 delete reference disclosure, AC-17 live broken state), S3 active-cross-group/idle removal,
  and the AC-21 image-anchor gate. M3h1/M3h2/M3h3 merged; 505 unit, critical e2e 21/45.3 s,
  recovery 14, UI 33, full `verify` exit 0. Sentinel re-review in progress.
- **M3h fix pass (orchestrator v2):**
  - **M3h1** — merged: S2-1 placement reflow preserves text undo history; S3-1 active trunk
    filtered by placement. Report: `docs/reports/m3h1-placement-undo-active-trunks.md`.
  - **M3h2** — merged: S2-2 AC-55 repair preview + Confirm; S2-3 AC-06 delete disclosure for
    external reference parents. Report: `docs/reports/m3h2-anchor-safety-flows.md`.
  - **M3h3** — merged: S2-4 live broken anchor state + S3-2 idle anchor removal.
    Report: `docs/reports/m3h3-live-health-idle-removal.md`.
  - **Re-review** — **accept with minor**; review: `docs/reviews/m3h-review.md`. Open S3-8
    leaf-keyboard-delete disclosure; S3-5/S3-6/S3-7 carried to M3h4/M3i or resolved by decision.
  - **M3h4** — merged: token single-source, canonical 88/28, CSS guard; S3-3 closed.
    Report: `docs/reports/m3h4-token-single-source.md`.
  - **M3h5** — merged: leaf delete disclosure when external references exist; S3-8 closed.
    Report: `docs/reports/m3h5-leaf-delete.md`.
  - **Tracked follow-ups (not M3 gate):** S3-5 relink selection UX, S3-6 replay fallback,
    S3-7 formula-term edit fixture; they go to M3i slice 5 / M4 fixture follow-up.
- **M3c3b Sentinel review (6 November 2026):** request changes; review `docs/reviews/m3c3b-review.md`. Decisions needed: legacy `src` policy, hash-verification policy, missing-file semantics, asset GC/backup interaction. M4 image/PDF remains blocked; scroll/page/PDF work must wait for the image guards.
- **M3c3b3 (7 November 2026):** merged; policies: missing file/hash mismatch are broken, legacy src is dropped to placeholder, picker dimensions persist, region selection is outline-only, callout alignment stays left-edge/160-cap. Briefs: `docs/tasks/m3c3b3-image-integrity.md`, `docs/tasks/m3c3b4-image-ux-lifecycle.md`.
- **M3c3b re-review (7 November 2026):** request changes; review `docs/reviews/m3c3b-re-review.md`. All seven original findings closed. New **S2-1** symlink escape fixed in **M3c3b5** (realpath confinement, symlinked `assets/` rejected, final symlinks rejected); **S3-2** corrupt dedupe fixed in the same slice. **M3c3b6** handles **S3-1** AVIF dimensions, **S4-1** stale `unavailable`, **S4-2** missing-asset action gating.
- **M3c3b6 (7 November 2026):** merged and verified: AVIF `ispe` is decoded through nested `meta`/`iprp`/`ipco` boxes with a real 640×360 fixture; assigning/replacing an image clears stale `unavailable`/`clipboardAssetId`; Add region/point is gated on availability with explicit missing/changed reasons, and a broken placeholder keeps Replace/alt reachable. Full verify **747 unit**, **54 UI**, **16/16 e2e** in 36.2 s, **14 recovery**, exit 0. Report: `docs/reports/m3c3b6-image-followups.md`.
- **M3c3b5 (7 November 2026):** merged and verified: `NodeAssetStore` confines every read/write to the real package `assets/` directory, rejects symlinked assets dirs/final files, `copyImageAsset`/imports inherit the guard, and corrupt content-addressed files are hashed/repaired instead of deduped. Full verify **738 unit**, **54 UI**, **16/16 e2e** in 36.3 s, **14 recovery**, exit 0 (includes M4b1). Report: `docs/reports/m3c3b5-asset-confinement.md`.
- **M3c3b4 (7 November 2026):** merged and verified: per-image block/inline actions target the clicked image; cross-document paste copies verified bytes or keeps a labeled placeholder with no dangling `assetId`; visible markers 1..N; `asset.remove` refuses live node/anchor references; deterministic `planAssetGc` + backup scan, automatic GC deferred. Full verify **704 unit**, **48 UI**, **16/16 e2e** in 36.4 s, **14 recovery**, exit 0. Report: `docs/reports/m3c3b4-image-ux-lifecycle.md`.
- **M3c3b2 (6 November 2026):** delivered: image region/point anchors, normalized geometry, markers/callouts, asset replacement/missing broken state; full verify 669 unit/UI 41/e2e 16/36.3 s/recovery 14. Follow-ups: crop editor and region re-pick repair; asset GC; native-picker image dimensions for M4.
- **M3c3b1 (6 November 2026):** content-addressed image asset store, `noteforest-asset://` protocol, canonical `assetId`/alt/width/height, block-menu/palette/paste/drop insertion, missing placeholder. Full verify 658 unit/38 UI/16 e2e/14 recovery. Risks: custom scheme, native-picker dimensions for M4, asset GC deferred, missing screenshot framing. M3c3b2 image anchors are next only after product-owner approval.
- **M3h re-review (6 November 2026):** all S2-1–S2-4 and S3-1/S3-2 closed; no new S1/S2.
  S3-8 closed: leaf keyboard delete with external references opens the disclosure; leaf without
  references keeps the fast path. S3-3 closed by M3h4. S3-5/S3-6/S3-7 are tracked follow-ups, not
  M3 gates. The product-owner VoiceOver/visual gate is next.
- **Ratified M3 decisions (6 November 2026):** AC-21 and image rows of AC-57 deferred to M3c3b;
  image pipeline is a prerequisite for M4/PDF image acceptance. `editorPaddingBottom` 88 and
  `chapterGap` 28 are canonical. `callout.safeGap` 16 is a minimum (effective gap ≥24). Idle-anchor
  removal is in M3h3. VoiceOver/visual pass remains the product-owner gate after M3h.
- **M3b2c approved layout rule (5 November 2026):** direct children stay right while they fit and
  join the below stack when they wrap; callouts always below, before wrapped direct children; one
  shared left trunk with horizontal arms; every arrow enters from the left, never the top. This
  supersedes the M3b2a "direct children after the lane / top-entry" route. Brief:
  `docs/tasks/m3b2c-left-entry-below-stack.md`.

## M3i — Core stabilization (proposed, after M3 acceptance, before M4)

Full proposal: `docs/architecture/core-stabilization.md`. Test audit:
`docs/architecture/test-suite-audit.md`.

This is a scoped architecture milestone, not a big-bang rewrite. Gate: no visual change, no new
runtime dependency, all existing tests green, no behavior change.

- **Slice 1 — token single-source:** delivered as M3h4; CSS variables from TS, canonical 88/28, guard test.
- **Slice 2a — merged:** DocumentGateway + SaveCoordinator. Report: `docs/reports/m3i2a-gateway-save-coordinator.md`.
- **Slice 2b — merged:** EditorProjection extraction. Report: `docs/reports/m3i2b-editor-projection.md`.
- **Slice 2c — merged:** DocumentSession extraction. Report: `docs/reports/m3i2c-document-session.md`.
- **Slice 3 — merged:** repository + schema migrations + AssetStore contract. Report: `docs/reports/m3i3-repository-migrations.md`.
- **Slice 4 — runtime boundaries:** `DocumentSession`, `DocumentGateway`, `SaveCoordinator`,
  `EditorProjection`; dependency inversion instead of `window.noteforest` inside the runtime.
- **Slice 3 — repository + migrations:** document/backup/asset contracts, ordered schema migrations
  with fixtures, newer-document read-only.
- **Slice 4 — commands + invariants:** split `commands.ts` by aggregate, command registry,
  apply→inverse→deep-equal harness, branded IDs where mechanical.
- **Slice 5a — merged:** shared UI session/fixtures and callout split; no test deletion.
  Report: `docs/reports/m3i5a-ui-test-harness.md`.
- **Slice 5b — merged:** e2e duplicate trim 21→16, coverage matrix, formula-term edit fixture.
  Report: `docs/reports/m3i5b-e2e-trim-coverage.md`. M3i closed at `docs/reports/m3i-closure.md`.

Only interfaces now: `AssetStore`, `ApplicationService`/queries, token registry. Implementations
for images, API/MCP, auth/audit, settings, page/PDF belong to M3c3b/M4/M5/M6.

## M4 — Reader/page + PDF (M4a merged; M4b next)

Full plan: `docs/tasks/m4-reader-page-pdf.md`. Decision: ADR-0006 group-level left-origin wrap. **M4a is merged** (`docs/reports/m4a-layout-lab.md`); **M4b1 page view core is merged** (`docs/reports/m4b1-page-view-core.md`). **ADR-0007 (7 November 2026) redefines the surfaces**: layout **Continuous | Page** × mode **Edit | Read**. Continuous + Edit is the default; Page Read is exact; Page Edit is planned; PDF exports Page Read. **M4b1a taxonomy + Continuous Read + view-state persistence is launched**; Page Edit and continuous markers follow. M4c/PDF uses the Page layout.

- **M4a** layout lab + group-wrap engine — **merged and verified**: whole child group right only if
  every direct child's own card fits; otherwise all direct children below at
  `min(parent.x + wrapIndent, pageContentLeft + maxWrapIndent)`, recursively; callouts first.
  `wrapIndent = 18`, `maxWrapIndent = 54`, default `wrapPolicy = group-left-origin`; the lab keeps
  `right-first-per-child` and `subtree-aware` as oracles. Lab: no page delta on scale-300,
  deep-chain, wide-fan, showcase; wide-fan +99.1 px height, no page increase. Full verify **717
  unit**, **48 UI**, **16/16 e2e** in 36.3 s, **14 recovery**, exit 0.
- **M4b1** page view core — **merged and verified**: core→layout adapter, static segments, DOM
  measurement at page typography, read-only A4 page view with fragments/continuation/ghost markers,
  fit page/width/zoom, images/missing placeholders, reader/page switch. Report:
  `docs/reports/m4b1-page-view-core.md`.
- **M4b1a** taxonomy split (`layout` + `interactionMode`), Continuous Read, Page Edit seam, session
  persistence, rename of reader/page labels and attributes — **merged and verified**: 753 unit, 57
  UI, 16/16 e2e in 36.0 s, 14 recovery. Report: `docs/reports/m4b1a-editor-layouts-modes.md`.
- **M4b1a2** Read-mode global gating — **merged and verified**: one editability helper, sidebar/
  palette/native menu/context menu/keymap/paste-drop/anchor-health gated; Page remains read-only.
  Full verify 762 unit, 59 UI, 16/16 e2e in 36.0 s, 14 recovery. Report:
  `docs/reports/m4b1a2-read-mode-gating.md`.
- **M4b1b** Page Edit: optional A4-bounded editing with one active block editor overlay; Page Read
  remains the exact PDF proof.
- **M4b1c** continuous page-break markers — **merged and verified**: one shared page model, page-start
  markers + continuation chips, no DOM shift. **M4b1c1** page image preload fix merged: dimensioned
  images measure without fetching bytes; image suites 0 pageErrors. Full verify **773 unit**, **22 UI
  suites**, 16/16 e2e, 14 recovery, exit 0. Reports: `docs/reports/m4b1c-continuous-markers.md`,
  `docs/reports/m4b1c1-page-image-preload.md`.
- **M4b1b1** Page Edit content overlay — **merged and verified**: opt-in Page Edit, one single-block
  rich-text overlay, same content schema and A4 geometry, commit via `block.editContent`, one
  structural undo entry, spanning blocks unclipped, Page Read unchanged. Full verify **779 unit**,
  **23 UI suites**, 16/16 e2e in 36.1 s, 14 recovery, 0 pageErrors. Report:
  `docs/reports/m4b1b1-page-edit-overlay.md`.
- **M4b1b2** Page Edit actions/anchors/images: deferred. Page Edit currently edits content only;
  image actions, anchor authoring/repair, formulas and block menus stay in Continuous/Outline.
- **M4c** PDF: next after the product-owner visual/VoiceOver pass.
- **M4b2/M4e are not separate parts**: all of the above is M4b; M4c is the PDF print compositor.
- **M4c** print compositor + PDF: fixed derived pages, real text/vector arrows, fonts/KaTeX/images
  wait, atomic export, page-count parity and text extraction.
- **M4d** images/anchors/performance/visual: asset protocol in print, placeholders/lost markers,
  image anchors, 300/1,000-block gates, product-owner visual/PDF acceptance.
- Gate: AC-23–AC-33, AC-39–AC-45, AC-51–AC-53, AC-60–AC-66; ADR-0002 gate on packaged build.
- M3c3b4 image UX/lifecycle is merged; it no longer blocks M4d image acceptance. M4a owns the
  layout engine only; M4b owns the page view/reader wiring.

## Refactor — personal page settings (ADR-0008)

Canonical schema v2 removes `pageSetup`, `manualBreakBeforeBlockIds`, and `viewState`. Page settings (size/orientation/margins, PageTheme, manual breaks) are personal: global defaults + per-document overrides outside the document. Continuous has no pages. Page/PDF consume the resolved settings. Sequence: R1a schema/settings foundation, R1b settings store + page theme/density, R2 Page arrows + continuous marker removal, R3 settings UI/manual breaks, R4 docs/visual sweep. Master checklist/linea guida: `docs/tasks/refactor-personal-page-settings.md`; briefs under `docs/tasks/r1a-*` etc.

## M5–M6 — API and polish (planned)

- M5: local HTTP JSON API + MCP adapter on the same command layer; tokens/scopes, dry-run/apply/undo, audit, single-writer lock.
- M6: search, light theme, accessibility, onboarding, packaging, release checks.

## Future — manual resize (post-M4, not scheduled)

Full plan: `docs/tasks/future-manual-resize.md`.

- **Image `displayWidth`** inside the block: 25/50/75/100% snap, height auto, normalized anchors
  unchanged, no layout/page-count impact. Command + undo; small slice after M4.
- **Block `widthHint`**: preferred width token (narrow/normal/wide/full), clamped by content min
  and page width; no manual height, no free position. Changes group wrap/page count, so it comes
  after image resize and needs layout golden fixtures.
- M4 reserves the seams only (optional width inputs in measurement/renderer); no UI in M4.

## Risks and decision points

| Risk | Where it bites | Mitigation |
|---|---|---|
| Editor shell becomes a generic AI-looking dashboard | M2 | `research/ui-components.md`, `docs/ux-shell.md`, anti-slop checklist; product-owner screenshot review. |
| Shell scope creep (too many panels/features) | M2 | Only sidebar + tabs + editor + status bar; no inspector/backlinks panel in M2. |
| Document core and editor drift | M2 | One command layer; TipTap behind an adapter; typed document model. |
| PDF visuals still wrong when reconnected | M4 | Use real branched documents; edge-routing fixtures; page-view geometry tests; product-owner review. |
| 1,000-block performance regresses | M3–M4 | Measure at 300 in M2; virtualization/collapse/LOD in M4. |
| Library/tabs state gets complex | M2 | One store for open tabs/view state; persistence of recent docs only in M2. |

## UI rework (10 November 2026)

The UI design pass is on `design/ui-map`; the browser lab is `docs/design/ui-lab/`. The master plan
and complete reference index is **`docs/tasks/ui-rework.md`**. It covers the shell, tabs, canvas
header (C preferred, D alternative), sidebar, status, Page frame, Settings (instant save), Export,
palette, overlays/keyboard, responsive/accessibility, and the future settings pages.

Implementation is consolidated into **two delivery batches**: **A** (shell, Settings shell, Export,
Palette; non-Page/PDF) and **B** (Page settings, future functions, Page/PDF-affecting work), with
P1–P6 as acceptance checkpoints inside them. Batch A is merged into `design/ui-map` at `af815eb`
(full verify green; report `docs/reports/ui-batch-a.md`). Batch B is next. Future pages stay empty
in the lab and out of the product until a real control exists.
