# AGENTS.md — NoteForest

## What this project is

A Mac-first spatial note-taking app for studying. Notes are made of **content blocks** connected by explicit arrows.

- A branch can start from a whole content block or from an **anchor** inside it: a word, a phrase, a formula term, a code token, or an image region.
- The structure is a **DAG**: a content block can have more than one parent.
- Views over the same document: an **outline** for fast authoring, a **reader** view with continuous scroll + page-break markers, and a **page** view that renders the paginated A4 result.
- Content is structured (ProseMirror JSON canonical) with Markdown import/export, LaTeX, code blocks, images, and lists.
- Pages are derived by a paginator constrained by A4 margins; they are not structural containers.
- PDF export with real text is a first-class feature (the user imports it into Notability to annotate).
- iPad + Apple Pencil is a possible later phase; do not block it, but do not build it in v1.

The product owner is **Luca**. The orchestrator is the main thread.

## Current phase

Discovery and planning. Research is done (`research/landscape.md`). Architect, UX, and Sentinel are writing `docs/spec.md`, `docs/ux.md`, `docs/review-checklist.md`, and `docs/definition-of-done.md`. **No application code** until the spec and the first spike plan are approved. The working name is **NoteForest**. The v1 stack is decided (Electron + React + TypeScript + TipTap/ProseMirror + CodeMirror 6 + KaTeX + React Flow + `printToPDF`); details are in Current decisions.

## Language

- **English**: code, comments, documentation, commit messages, PR/issue titles and bodies, test names, UI copy.
- **Italian**: chat with the product owner only.

## Team and roles

- **Orchestrator / Conductor**: owns the plan, decisions, task briefs, and integration. The main thread.
- **Research / Scout**: explores apps, frameworks, data structures, algorithms, and names. Writes `research/landscape.md`.
- **Planner / Architect**: writes `docs/spec.md`, ADRs, task breakdown, and acceptance criteria. Does not write application code.
- **UX / Product**: writes `docs/ux.md` (flows, keyboard model, states). Does not write application code.
- **Implementer / Builder**: writes code and tests in a worktree, one task at a time. Does not change the spec.
- **Reviewer / Sentinel**: independent review, runs tests and the app, checks acceptance criteria. Writes `docs/review-checklist.md` and `docs/definition-of-done.md`. Does not rewrite code.
- **Docs / Release** (later): README, user guide, changelog, packaging.

All agents use **DeepSeek V4.1 Flash Max** (`opencode-go/deepseek-v4.1-flash#max`). No model switching.

## Working agreement

1. Read this file and the relevant docs before starting.
2. Work one task at a time. Keep changes small and scoped.
3. Do not change product decisions or the spec without an ADR and the orchestrator's approval.
4. Ask before adding a dependency. Prefer maintained, permissively licensed libraries.
5. Every code change needs tests. UI changes need a screenshot or recording.
6. Run the checks in `docs/definition-of-done.md` before reporting done.
7. Report: what changed, files touched, tests run, open questions, risks.
8. No secrets, no telemetry, no destructive git commands.
9. Keep context small: use the task brief and the linked docs, not the whole repo.
10. If something is ambiguous, stop and ask; do not invent requirements.

## Product owner clarifications (latest)

These override any conflicting research input below.

- **Structure**: Document → Chapters → top-level content blocks → descendants. Chapters only group the top-level blocks of a chapter. Pages are **not** a structural level: they are a layout/pagination result constrained by A4 margins.
- Every top-level block is itself a content block: sometimes a standalone sentence, sometimes a 1–2 word phrase with children.
- **Fixed logical order, adaptive geometry**: the tree/DAG order is fixed; only sibling order can change. No freeform positioning, no manual pins, no arbitrary drag.
- **No fixed pixel columns**: widths are content-driven and adaptive. A node with a large subtree may take more horizontal space; a leaf sibling may be narrow. Siblings can have different widths and together fill the page. If there is not enough horizontal room, a child can be placed below the parent level with a slight indent instead of further right.
- **Page constraint**: A4 portrait/landscape with margins. The layout fits content into the page width/height; lower levels can continue on the next page. Pages are continuous in reading order, but are still pages. Never split a content block across pages: break between blocks and show a continuation marker when a lower-level block continues on the next page.
- **Pages are derived**: a paginator computes page breaks from the continuous layout; pages are not stored as containers. The PDF export uses the same paginator.
- **Views**: a continuous "reader" view with page-break markers may be the primary authoring surface; a paginated page view is a WYSIWYG renderer of the same layout. Evaluate the tradeoff; one layout engine, two renderers.
- **Anchored branches**: the child is placed below the anchor; it may wrap/paginate like any other branch.
- **"Canvas"** means the page/paginated view; it is not a freeform canvas. Pan/zoom is navigation only.

## Current decisions

- Product model: Document → Chapters → content blocks; DAG (shared children); outline + reader/page views; Markdown/LaTeX/code/images; optional block border; annotations are a separate study layer (out of scope for v1); PDF export with real text.
- Edge roles: primary edge per block (drives outline/layout) + reference edges (multi-parent/cross-links); pending final spec.
- Layout: adaptive tree layout with content-driven widths; children go right or wrap below the parent with a slight indent; only sibling order changes; pages are derived by the paginator; no content block split across pages; continuation markers; no free positioning/pins.
- Content model: structured JSON/ProseMirror JSON as canonical, with Markdown import/export; keep an adapter so the decision can be revisited after the prototype. The product owner delegated the choice.
- File format: flat JSON document + assets folder; schema versioned; model and storage separated. Page size/orientation/margins and optional manual break hints are document settings; pages themselves are derived.
- Stack: Electron + React + TypeScript + TipTap/ProseMirror + CodeMirror 6 + KaTeX + React Flow + `printToPDF` for v1. Revisit GPUI/other frameworks later only if justified by a real bottleneck.
- Name: **NoteForest** (working title). Scout found an existing NoteForest study/spaced-repetition app; public-release clearance or rename is required before packaging.
- PDF: page-based, real text, A4 portrait/landscape, produced by the paginator via `printToPDF`; no separate reader PDF in v1. Reader view is an editor view, not a separate export.
- Views: one continuous layout engine; reader view (continuous scroll + page-break markers) and page view (paginated WYSIWYG) as two renderers; evaluate the tradeoff in the prototype.

## Research input (Scout, `research/landscape.md`)

Treat these as inputs to evaluate, not final decisions:

- No mainstream app combines rich blocks + explicit arrows + span-anchored arrows + outline/canvas over one document. The closest are Heptabase, AFFiNE, MindNode, TheBrain, Obsidian Canvas.
- Canonical storage: Scout recommends structured JSON (ProseMirror JSON for block content) with Markdown export, not Markdown as the live source of truth. The content model is still open.
- Edges: one **primary** incoming edge per block (acyclic, drives outline/layout) plus zero or more **reference** edges (multi-parent/cross-links, may cycle). This gives DAG semantics without ambiguous layout.
- Layout: custom two-pass tidy tree + anchored callout placement; d3-hierarchy for the primary tree; no dagre. React Flow is viable for 50–300 nodes; benchmark before committing.
- PDF: do not screenshot the canvas. Build a dedicated reader PDF with real text; consider two modes: spatial map and outline/reader with margin callouts. Verify the text layer with `pdftotext`/PDFKit.
- Stack: Scout recommends Electron + React + TypeScript + TipTap/ProseMirror + CodeMirror 6 + KaTeX + React Flow + `printToPDF`. Tauri's WKWebView PDF path needs a serious spike; GPUI is not recommended.
- Anchors: inline marks/IDs in content, with quote/context fallback for code, formulas, and image regions; avoid raw offsets as the primary anchor.
- iPad: native PencilKit is required for real handwriting; Mac first.
- Names: most `NoteX` names are already taken by close products. `NoteCanopy` is the only unregistered `.com`/`.app` in the checked list and has no exact app hit; the namespace is weak, so real trademark clearance is needed.

## Docs map

- `research/landscape.md` — Scout's research report.
- `docs/spec.md` — product/data-model/behavior spec (Architect).
- `docs/ux.md` — interaction flows and keyboard model (UX).
- `docs/review-checklist.md` — review checklist (Sentinel).
- `docs/definition-of-done.md` — DoD and test strategy (Sentinel).
- `docs/plan.md` — milestones and tasks (Orchestrator; pending).
- `docs/adr/` — architecture decision records (pending).

## Repo layout (proposed)

```
apps/desktop/       # Electron main + renderer (React)
packages/core/      # document model, schema, commands, serialization
packages/layout/    # pure layout engine + paginator + fixtures
docs/
research/
AGENTS.md
```

Do not create application scaffolding until the spec and spike plan are approved.

## Reporting format

When you finish a task, reply with:

- Summary: what you did.
- Files changed.
- Checks run.
- Open questions / risks.
- Next suggested step.
