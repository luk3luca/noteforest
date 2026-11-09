# AGENTS.md — NoteForest

## What this project is

A Mac-first spatial note-taking app for studying. Notes are made of **content blocks** connected by explicit arrows.

- A branch can start from a whole content block or from an **anchor** inside it: a word, a phrase, a formula term, a code token, or an image region.
- The structure is a **DAG**: a content block can have more than one parent.
- Views over the same document: an **outline** for fast authoring, a **reader** view with continuous scroll + page-break markers, and a **page** view that renders the paginated A4 result. The reader is the primary authoring surface in v1; the page view is the preview.
- Content is structured (ProseMirror JSON canonical) with Markdown import/export, LaTeX, code blocks, images, lists, and tables.
- Pages are derived by a paginator constrained by A4 margins; they are not structural containers.
- PDF export with real text is a first-class feature (the user annotates exported PDFs by hand on an iPad).
- iPad + Apple Pencil is a possible later phase; do not block it, but do not build it in v1.

The product owner is **Luca**. The orchestrator is the main thread.

## Current phase

**M2f and M3 are accepted (M3 on 6 November 2026 after the product-owner VoiceOver/visual pass).** M3h4 token single-source and M3h5 leaf reference disclosure are merged; S3-8/S3-3 are closed. **M3i core stabilization is in progress**: gateway/save coordinator, editor projection, DocumentSession, repository/migrations, and UI test harness are merged; command aggregates, boundary check, and e2e trim/coverage are merged; **M3i is complete**. **M3c3b1 image pipeline/rendering and M3c3b2 image region/point anchors are merged and verified**; AC-21 is delivered, with crop editing/region re-pick as follow-ups. The focused M3c3b Sentinel review requested changes; **M3c3b3** (missing file/hash as broken anchors, legacy `src` dropped, picker dimensions, region outline) and **M3c3b4** (per-image actions, cross-document paste, marker numbering, asset remove guard + GC plan) are merged and verified. **M4a (layout lab + group-level left-origin wrap) is merged and verified**: whole child group right only if every direct child's own card fits, otherwise all direct children below at `min(parent.x + wrapIndent, pageContentLeft + maxWrapIndent)`, recursively; `wrapIndent` 18, `maxWrapIndent` 54, `group-left-origin` default. **M3c3b5 (asset store confinement + corrupt dedupe) is merged and verified**; the M3c3b re-review's S2-1 and S3-2 are closed. **M3c3b6 (AVIF nested ispe, stale placeholder cleanup, missing-asset action gating) is merged and verified**; the remaining re-review follow-ups are closed pending a final Sentinel re-check. **M4b1 (page view core) is merged and verified**: core→layout adapter, static segments, DOM measurement, read-only A4 page view, reader/page switch. **M4b2 (markers over the DOM reader) was cancelled by the product owner.** **ADR-0007 (7 November 2026) redefines the surfaces**: layouts **Continuous** and **Page**, each with **Edit** and **Read** modes; PDF exports the Page layout in Read. Continuous + Edit is the default; Page Read is exact; Page Edit is planned. **M4b1a (taxonomy, Continuous Read, view-state persistence) is merged and verified**. Continuous page-break markers and Page Edit follow; M4c/PDF uses the Page layout. **M4b1a2 (Read-mode global gating) is merged and verified**: sidebar, palette, native menu, context menus, keymap, paste/drop and anchor-health repairs cannot mutate in Read; Page remains read-only. **M4b1c (continuous page-break markers) is merged**: one shared page model, page-start markers and continuation chips, no DOM shift. **M4b1c1 (page image preload)** is merged: dimensioned images measure without fetching bytes; image UI suites have no 404 pageErrors. **M4b1b1 (Page Edit content overlay) is merged and verified**: Page Edit is opt-in, one single-block rich-text overlay, same content schema/geometry, commit via `block.editContent`, one structural undo entry, spanning blocks unclipped; Page Read unchanged. **ADR-0008 (8 November 2026) makes page settings personal**: the canonical document is the continuous canvas; page size/orientation/margins, PageTheme, manual breaks and view state live outside `document.json` (global defaults + per-document overrides). Schema v2 removes `pageSetup`, `manualBreakBeforeBlockIds` and `viewState`. **R1a (schema v2 + page-settings foundation) is merged and verified**: canonical document is schema v2 with no pageSetup/manualBreak/viewState; pure PageSettings/PageTheme foundation; layout takes explicit page setup. **R1b (settings store + PageTheme/density) is merged and verified**: global settings.json + per-document overrides; compact theme drives measurement/Page Read/Edit; showcase 27→21 pages, scale-300 39→28, no defects. **R2a (Page arrows + remove Continuous page chrome) is merged and verified**: one shared page-edge mapper, primary/reference arrows, cross-page indicators; Continuous has no page model/markers/chips. **R2b (beside packing) is merged and verified**: direct children at parent y, callouts below; showcase 21→20 pages. **R2c row-fill compaction is superseded by the product-owner tree model (8 November 2026)**: compact Page now defaults to `beside`, so siblings share one level column, the next sibling starts below the previous subtree, callouts stay below the parent, and a group that does not fit wraps below its own parent. `compaction` remains only a density-lab oracle. Page edges use semantic callout/below/beside ports; cross-page chips move to the page margin; image blocks cap at maxCardWidth and scale. **R2d (orthogonal edge router + crossing avoidance)** is merged and verified: shared edge style, orthogonal obstacle-aware routes, crossing regression 17/255→0/0 and 90/1890→0/0. **R2f (Page edge topology)**, **R2g (Page trunk continuity)**, and **R2h (attached trunks)** are merged into the WIP and verified: explicit `LayoutBlock.placement`, one semantic group trunk per `(parent, placement)` with page segments, all primary tree edges enter left, sibling right groups share the right trunk, callouts/wrapped children share the below trunk, cross-page trunks continue vertically with no `p.N` chip, nested trunks stay independent, below trunks start attached to the card bottom (`trunkGap` 0), and wrapped Page children keep at least a 26 px indent for a 12 px trunk inset with a 12 px left stem. **Continuous stress height fix (8 November 2026)** is merged and verified: the right-group reservation is per node (nested renderers reset `--nf-right-group-height`) and `BranchChildrenView` retries host attachment; the stress note no longer has descendants under the next chapter. **Continuous canvas width** is now 3,200 px (3,120 px placement budget) with horizontal scroll, so a deep tree keeps going right instead of wrapping at the window edge. **R2i (Page subtree-aware wrap) is merged and verified**: the right/below decision uses the whole primary subtree; a failing subtree moves the atomic direct-child group below the parent at `childIndent` 26, then each child keeps its children right only if they fit there. **R2j (Page callout modes A + B2) is merged and verified**: per-parent deterministic mode from the placed card and resolved Page width — A puts callouts in the right lane (`calloutRightGap` 24, minimum `calloutModeMinWidth` 240) with children below, B2 uses two below trunks (child 12/26, callout 24/38, callouts first), stacked is the only fallback (B1 dropped); trunks continue with R2g, nested groups stay independent, no tree `p.N` chips, and Page Read/Edit/PDF share the same records. Modes apply to the compact `beside` packing; explicit `stacked` keeps legacy callout geometry. **R2j1 (stacked stem reserve) is merged and verified**: a nearly full-width stacked child group keeps a 24 px stem origin (12 px trunk + 12 px stem) so the incoming arrow stays visible; unbreakable content that cannot fit there keeps the old shift and its explicit `content-too-wide` defect. **STOP: product-owner visual/Page check is next.** Do not start R3, R4, or M4c PDF until that checkpoint is accepted or fixes are requested; then the sequence is a targeted Page/PDF Sentinel, M4c PDF, a full-codebase Sentinel/refactor with the settings-variable inventory, Settings UI, and a targeted Settings Sentinel (`docs/tasks/post-page-roadmap.md`). AC-21 and image rows of AC-57 are deferred to M3c3b; the image pipeline is required before M4/PDF image acceptance. S3-5/S3-6/S3-7 are tracked follow-ups for M3i/M4. Canonical shell tokens: 88/28; `callout.safeGap` 16 minimum. Reviews at `docs/reviews/m3-review.md` and `docs/reviews/m3h-review.md`. Spec v0.5, UX v1.5, ADR-0005; M3a1–M3f2 and M3g1–M3g6 are merged. Unit 881/2.3 s; critical e2e 16/43.9 s; recovery 14; UI 31 suites/101 tests; `verify` exit 0, 0 pageErrors. R2f/R2g/R2h/R2i/R2j/R2j1 are merged to `main`. Reviews include `docs/reviews/m3c3b-review.md`. M4c PDF is stopped until the Page checkpoint. Spec v0.5, UX v1.5.

The spec is at v0.5 and the UX is at v1.5; the review checklist and DoD still cite the previous versions and need a docs sweep.

## Language

- **English**: code, comments, documentation, commit messages, PR/issue titles and bodies, test names, UI copy.
- **Italian**: chat with the product owner only.

## Team and roles

Full contracts, outputs, and forbidden actions: `docs/agents/roles.md`. Every delegation uses
`docs/agents/brief-template.md`.

- **Orchestrator / Conductor**: plan, decisions, specific task briefs, integration, one full verify, final report. The main thread. Does not implement product code or self-review as Sentinel.
- **Research / Scout**: answers one specific research question with evidence and a recommendation. Writes `research/`. No application code.
- **Planner / Architect**: scoped specialist for one milestone design package: spec sections, ADRs, acceptance criteria, edge-case matrix, task-breakdown proposal. The Orchestrator owns `docs/plan.md` and priorities. No application code and no unilateral product decisions.
- **UX / Product**: flows, keyboard model, states, empty/error states in `docs/ux*.md`. No application code.
- **Implementer / Builder**: implements exactly one brief in a worktree, with tests and a report. Does not change spec/UX/ADR/plan and does not merge.
- **Reviewer / Sentinel**: independently judges one task; writes `docs/reviews/<task>.md` with a verdict, evidence, and new findings; may update the review checklist/DoD. Does not rewrite code, tests, spec, UX, ADR, or plan outside the checklist/DoD.
- **Docs / Release** (later): README, user guide, changelog, packaging.

**Delegation rule.** One agent, one specific job, one deliverable. A brief names the exact user path,
files, non-goals, acceptance criteria, tests, stop conditions, and report format. If a task needs
two roles, split it; do not send a broad "fix/review the app" brief.

**Testing rule.** Builder runs targeted tests while working and one `npm run verify:fast` at the
end; the Orchestrator runs one full `npm run verify` at integration. Perf and visual suites are
on demand, not part of the critical gate. Do not duplicate full runs.

All agents use **DeepSeek V4.1 Flash Max** (`opencode-go/deepseek-v4.1-flash#max`). No model switching unless the product owner ratifies it.

## Working agreement

1. Read this file and the relevant docs before starting.
2. Work one task at a time. Keep changes small and scoped.
3. Do not change product decisions or the spec without an ADR and the orchestrator's approval.
4. Ask before adding a dependency. Prefer maintained, permissively licensed libraries.
5. Every code change needs tests. UI changes need an app screenshot; screen recordings belong to the product owner.
6. Run the checks in `docs/definition-of-done.md` before reporting done.
7. Report: what changed, files touched, tests run, open questions, risks.
8. No secrets, no telemetry, no destructive git commands.
9. Keep context small: use the task brief and the linked docs, not the whole repo.
10. If something is ambiguous, stop and ask; do not invent requirements.
11. Builder works in a worktree and reports the worktree path. Orchestrator integrates; Builder does not merge.
12. The Orchestrator never edits product code directly. Before starting any change, it asks the product owner for explicit confirmation, then delegates one brief to an Implementer in a worktree. Direct edits are allowed only when the product owner explicitly asks for them.
12. Manual checks that need a human (subjective visual judgement, screen recording) belong to the product owner. Agents do not record the screen; they provide PDF/screenshot evidence.

## Product owner clarifications

These override any conflicting research input.

- **Structure**: Document → Chapters → top-level content blocks → descendants. Chapters only group the top-level blocks of a chapter. Pages are **not** a structural level: they are a layout/pagination result constrained by A4 margins.
- Every top-level block is itself a content block: sometimes a standalone sentence, sometimes a 1–2 word phrase with children.
- **Fixed logical order, adaptive geometry**: the tree/DAG order is fixed; only sibling order can change. No freeform positioning, no manual pins, no arbitrary drag.
- **No fixed pixel columns**: widths are content-driven and adaptive. A node with a large subtree may take more horizontal space; a leaf sibling may be narrow. Siblings can have different widths and together fill the page. If there is not enough horizontal room, a child is placed below the parent level with a slight indent instead of further right.
- **Page constraint**: A4 portrait/landscape with margins. The layout fits content into the page width/height; lower levels can continue on the next page. Pages are continuous in reading order, but are still pages. Never split a content block across pages if a safe break exists: break between blocks and show a continuation marker when a lower-level block continues on the next page.
- **Pages are derived**: a paginator computes page breaks from the continuous layout; pages are not stored as containers. The PDF export uses the same paginator.
- **Views**: the continuous **reader** view with page-break markers is the primary authoring surface; the paginated **page** view is a WYSIWYG renderer and preview of the same layout. One layout engine, two renderers.
- **Anchored branches**: the child is placed below the anchor; it may wrap/paginate like any other branch.
- **"Canvas"** means the page/paginated view; it is not a freeform canvas. Pan/zoom is navigation only.
- **Tables**: a table may break across pages only between rows. A row is atomic: never split a row, and never break inside a cell. A row taller than the page content height is a pagination defect, not a reason to cut.

## Ratified decisions (product owner)

### Product and structure

- **Product model**: Document → Chapters → content blocks; DAG (shared children); outline + reader/page views; Markdown/LaTeX/code/images/tables; optional block border; annotations are a separate study layer (out of scope for v1); PDF export with real text.
- **Edge roles (closed)**: one **primary** incoming edge per block (acyclic, drives outline and layout) plus zero or more **reference** edges (multi-parent/cross-links, may cycle). Reference edges never affect layout or pagination.
- **Outline order (closed, D3)**: anchored primary children first, ordered by anchor position in the block, then direct primary children in branch order. Deterministic and shared by outline, reader, page view, and PDF.
- **Shared child (closed, D4)**: reference by default when the target already has a primary home; add-as-child when it is a top-level block. "Make home" and "move here" are explicit commands that never duplicate the block.
- **Block granularity (closed, D2)**: a block is a **rich body** (paragraphs, lists, code, math, images, tables), not a single content node. It is the unit of identity, branching, and layout.
- **Anchor policy (closed, D5)**: all four anchor kinds (text, formula, code, image) in v1; exact unique bindings may auto-resolve; ambiguous reattachment requires explicit confirmation; broken anchors never delete branches; export includes every branch exactly once. Formula-term geometry is best-effort; whole-formula anchors are precise.

### Layout and pagination

- **Layout**: adaptive tree layout with content-driven widths; children go right or wrap below the parent with a slight indent; only sibling order changes; pages are derived by the paginator; blocks are atomic by default, long blocks may continue at safe internal boundaries with continuation markers; hybrid stable reflow with freeze; no free positioning/pins.
- **Long blocks**: a content block that exceeds the page may continue at safe internal boundaries (paragraph, list item, blockquote paragraph, between code lines, between table rows) with a continuation marker. Never cut a line, image, formula, code line, or table row.
- **Tables**: page breaks only between rows, never inside a row. Header repetition on continuation pages is a UX detail, not required in v1.
- **Layout stability**: hybrid — incremental stable reflow, freeze mode for study, full reflow on request or after idle.
- **Page orientation**: one document-wide orientation (portrait or landscape) at a time. Changing it reflows all pages.
- **Cross-page**: ghost parent + "continued from …" at the top of the next page; "continues on page N" at the bottom of the previous page.

### Content, files, and names

- **Content model**: structured JSON/ProseMirror JSON as canonical, with Markdown import/export; keep a narrow adapter so the decision can be revisited after the prototype.
- **File format**: single JSON document + assets folder; schema versioned; model and storage separated. Notes are standard files in a user-chosen folder, not in git. Orientation is document-wide; page size/margins and optional manual break hints are document settings; pages themselves are derived.
- **Git**: code and project docs only. User note documents are not in git.
- **Visual**: clean, Obsidian-like, minimal. Dark mode is the default.
- **Name**: **NoteForest** (working title). Scout found an existing NoteForest study/spaced-repetition app; public-release clearance or rename is required before packaging.

### Stack and PDF (closed)

- **Stack (D12 closed)**: **Electron + React + TypeScript** for v1, with TipTap/ProseMirror, React Aria Components, Tailwind CSS v4, KaTeX, lowlight, Playwright, and Vitest. CodeMirror 6 is a later addition; React Flow is replaced by the custom SVG edge overlay (ADR-0004). See `docs/adr/0001-stack-electron.md`.
  - **GPUI**: no-go for v1. Pre-1.0, no PDF/pagination engine, young editor ecosystem, no credible iPad path.
  - **SwiftUI/AppKit**: conditional; reconsider only if iPad + Pencil becomes co-primary.
  - **Qt 6**: mature fallback; rejected for v1 because of C++/QML, licensing, and agent-team fit.
  - **Tauri**: not chosen; the WKWebView PDF path is the known trap, and a Chromium sidecar reproduces Electron with extra steps.
- **PDF (D6 and D13 closed)**: one **Page PDF** mode; no reader/map PDF in v1. The paginator in `packages/layout` computes pages; a print-only renderer composes those exact pages; Electron `webContents.printToPDF` prints them. The print renderer never re-paginates. Gate: 50+ page A4 spike with real text, no cut line/image/formula/code line/table row, and page count equal to the paginator. See `docs/adr/0002-pdf-pipeline.md`.

### Views and scope

- **Views (D14 closed)**: one continuous layout engine; reader view (continuous scroll + page-break markers) and page view (paginated WYSIWYG) as two renderers; **reader is the primary editor in v1**, page view is a preview. The other remains available.
- **Editor shell (M2 direction, 3 November 2026)**: an Obsidian-like desktop shell — left sidebar with the document library and the active document's topic tree, top tabs for multiple open documents, and a continuous **branch editor** with basic primary block-to-block branches and visible arrows. Dark mode default; calm, minimal, keyboard-first; no dashboard/AI-slop patterns. Span anchors and reference edges are M3; page view/PDF are M4. Full spec: `docs/ux-shell.md`.
- **PDF priority (3 November 2026)**: editor first. The Spike 1 layout/paginator/print pipeline is a technical foundation; page view and PDF polish are deferred to M4, after real documents and branches exist. Do not spend M2 time on PDF visuals or Notability.
- **Broken anchors**: visible marker + fallback to the whole block + repair dialog; never silent data loss.
- **V1 scope**: all core features discussed — reader, page preview, PDF, chapters, blocks, branches, text/formula/code/image anchors, images, code, tables, shared children, outline, multiple documents, search, dark mode, external agent API (no in-app agent panel) — delivered in vertical slices; polish later. Non-goals: iPad/Pencil, annotations, collaboration, plugins, spaced repetition, in-app agent chat/autonomy.
- **Testing**: T3 Code internal browser for manual/visual checks; Playwright for automated e2e, visual regression, and PDF text extraction. E2E must never open native OS dialogs: the main process installs a test dialog guard under `NOTEFOREST_E2E=1` that records calls and returns safe non-blocking defaults; a test that needs a dialog overrides the recorder explicitly. An unmocked dialog must fail fast, never wait for a human click.
- **Performance**: 300 blocks guaranteed, 1,000 usable with virtualization/collapse/focus. This is a rendering/layout limit, not a hard Electron limit; GPUI is a later option only if benchmarks justify a rewrite.

## External agent API (v1, D16–D20 closed)

No in-app agent panel in v1. The app exposes a typed local API so external agents (Hermes, OpenCode, etc.) can read and mutate documents through the same command layer as the UI. Full decisions: `docs/adr/0003-external-agent-api.md`.

- **Off by default, loopback-only.** The server binds to `127.0.0.1`; no remote bind, no TLS requirement for loopback, no cloud relay, no web access, no telemetry.
- **Transport**: local HTTP JSON API first, with an MCP adapter that maps to the same commands and queries. Neither path is privileged. A CLI can wrap the same client.
- **Auth**: bearer token, **shown once**, stored **hashed** (plus a short display prefix), **revocable** immediately. Tokens are **document-scoped**: each token names exactly one document in v1. A token can be read-only or read/write; `destructive` requires an explicit separate grant.
- **Scopes**: `read`, `write`, `export`, `destructive`, `audit`. A write token cannot grant itself `destructive`; escalation requires a new token issued by the user in the app.
- **Commands**: open/read document, search, create/edit/delete block, create branch from block or anchor, reorder/reparent, create chapter, export PDF, undo/redo, read audit. Every mutation is a typed command with validation, an inverse, and undo/redo. Direct JSON writes are rejected.
- **Concurrency**: single-writer lock per document plus a monotonic `baseRevision`. Stale commands fail with a rebase/refresh error; no silent overwrite. Concurrent readers are allowed. External file edits are detected and blocked as in the spec.
- **Dry-run / apply / undo**: mutating commands support `dryRun` with a diff and affected IDs; apply is all-or-nothing against `baseRevision`; destructive commands require `confirm` naming the affected IDs; undo shares the UI session stack.
- **Audit**: every request (read, write, dry-run, export, failure) is audit-logged locally with timestamp, token/client ID, command, document, base revision, result, affected IDs, and duration. Audit logs are append-only, outside the document package, not in git.
- **No background autonomy**: the app never polls, retries, or runs agent turns. The external client decides when to call.
- **PDF export**: `export.pdf` returns a job ID; status is queryable. Small exports usually finish before the first poll. Output path and overwrite policy are explicit.

## Stack decision (closed)

The stack review is complete: `research/native-stacks.md` evaluated GPUI, egui, Iced, Slint, Dioxus/Leptos, Makepad, Xilem, Floem, Freya/Blitz, Tauri, Wails, Flutter, SwiftUI/AppKit, and Qt 6. The decision and its revisit triggers are in `docs/adr/0001-stack-electron.md`; the PDF pipeline is in `docs/adr/0002-pdf-pipeline.md`. Do not reopen the stack without a benchmark-backed ADR.

Research remains useful as input for components, not as an open stack decision. The older `research/landscape.md` reader-PDF and infinite-canvas recommendations are superseded by the page-based model.

## Docs map

- `research/landscape.md` — Scout's first research report (prior art, components, names).
- `research/native-stacks.md` — Scout's stack review and go/no-go verdict.
- `docs/spec.md` — product/data-model/behavior spec (Architect).
- `docs/ux.md` — interaction flows and keyboard model (UX).
- `docs/review-checklist.md` — review checklist (Sentinel).
- `docs/definition-of-done.md` — DoD and test strategy (Sentinel).
- `docs/plan.md` — milestones and tasks (Orchestrator).
- `docs/design-tokens.md` — single reference for layout, spacing, lane, edge, and surface tokens.
- `docs/architecture/` — proposed core stabilization and test-suite audit.
- `docs/agents/roles.md` — role contracts, boundaries, handoff.
- `docs/agents/brief-template.md` — the specific task-brief template used for every delegation.
- `docs/ux-shell.md` — desktop shell + branch editor spec for M2.
- `docs/tasks/` — milestone and phase task briefs.
- `docs/reviews/` — Sentinel review reports.
- `docs/reports/` — Builder implementation reports.
- `docs/adr/` — architecture decision records: stack, PDF, External API, UI shell/editor.
- `docs/spike-01-layout-paginator-pdf.md` — Spike 1 brief and gates (historical).
- `docs/spikes/` — Spike 1 report, gate evidence, and artifacts.
- `research/ui-components.md` — M2 shell/editor component and visual research.

## Repo layout

```text
apps/desktop/       # Electron main + preload + React editor shell (M2)
packages/core/      # document model, schema, commands, serialization, persistence
packages/layout/    # pure adaptive layout + paginator + fixtures + geometry tests (Spike 1 foundation)
packages/pdf/       # print compositor + printToPDF/verify orchestration (Spike 1 foundation)
packages/api/       # local HTTP JSON API + MCP adapter (not scaffolded yet)
docs/
  adr/
  agents/
  reports/
  reviews/
  spikes/
  tasks/
research/
AGENTS.md
```

`apps/desktop`, `packages/core`, `packages/layout`, and `packages/pdf` exist.
`packages/api` is scaffolded in M5, not in M2.

## Reporting format

When you finish a task, reply with:

- Summary: what you did.
- Files changed.
- Checks run.
- Open questions / risks.
- Next suggested step.
