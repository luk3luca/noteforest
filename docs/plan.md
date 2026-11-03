# NoteForest — Plan

**Version:** v1 (3 November 2026)  
**Owner:** Orchestrator  
**Status:** Ratified through Spike 1. Later milestones are planned, not approved.

## Rules

- One milestone at a time; a milestone starts only after the previous gate is reviewed.
- Builder works in a worktree, one task at a time, and does not change the spec.
- Every code change has tests. UI work has a screenshot or recording.
- A stack, PDF-pipeline, or layout/pagination change requires an ADR.
- The spec (`docs/spec.md`) is the source of truth for behavior; the ADRs are the source of truth for architecture.

## Milestones

| ID | Milestone | Goal | Gate | Status |
|---|---|---|---|---|
| **M0** | Ratification | Close stack, PDF, API defaults, tables, reader-primary; align docs | ADR-0001/0002/0003 accepted; spec v0.4; DoD/checklist aligned | **Done** |
| **M1** | Spike 1 — adaptive layout + paginator + PDF | Prove the riskiest core in Electron before building the product around it | `docs/spike-01-layout-paginator-pdf.md` gates G1–G9 | **In progress** |
| **M2** | Document core | Canonical document model, schema validation, commands, atomic persistence, backups, revisions, single-writer lock | Model round-trip and command/inverse tests; crash-recovery fixture; no UI required | Planned |
| **M3** | Outline authoring | Outline view, block editor (TipTap), Enter/Tab/Backspace, collapse, reorder, page-break markers | AC-01–AC-11; keyboard-complete; 300-block outline performance | Planned |
| **M4** | Branches and anchors | Primary/reference edges, block and span anchors, anchored callouts, repair, shared-child lifecycle | AC-03–AC-07, AC-10, AC-12, AC-15–AC-22, AC-54–AC-58 | Planned |
| **M5** | Reader + page view | Reader as primary editor, page view preview, freeze/full reflow, view sync, zoom/fit | AC-23–AC-33, AC-51–AC-53, AC-63–AC-66 | Planned |
| **M6** | PDF + Notability | Page PDF from the shared paginator, print theme, continuation/ghost markers, text layer, Notability import | AC-39–AC-45, AC-60–AC-61; ADR-0002 gate in the real app | Planned |
| **M7** | External API + MCP | HTTP JSON API, MCP adapter, tokens/scopes, dry-run/apply/undo, audit, lock integration | AC-70–AC-74; ADR-0003 test matrix | Planned |
| **M8** | Library, search, polish | Multiple documents, search, dark/light theme, accessibility, onboarding, packaging | AC-67–AC-69, AC-75–AC-76; DoD release checklist | Planned |

## M1 — Spike 1 brief

The full brief is `docs/spike-01-layout-paginator-pdf.md`. Summary:

- **Timebox:** 5 working days. If the PDF gate fails structurally, stop and report; do not start a second pipeline silently.
- **In scope:** minimal Electron + React + TypeScript demo, `packages/layout` (measurement adapter, adaptive layout, break candidates, paginator), a static fixture renderer, a page view, a print compositor, `printToPDF`, Playwright/Vitest tests, a report.
- **Out of scope:** the real editor, persistence beyond fixtures, the external API, MCP, outline UI, anchors editing, themes, packaging, Windows/Linux.
- **Exit:** all gates G1–G9 pass, or a written report explains exactly which gate failed and what the fallback decision should be.

## M2 — Document core (planned)

- `packages/core`: schema types, validation, canonical document, commands + inverses, revision, atomic save, backup rotation, migration harness.
- Minimal fixture-based CLI or test harness; no Electron UI required.
- Gate: round-trip, unknown-field preservation, duplicate-ID rejection, crash-recovery, `baseRevision` conflict, lock behavior.

## M3–M5 — Authoring and views (planned)

- M3 is the first vertical slice the product owner can type in: create a document, chapters, top-level blocks, children, edit rich content, outline order, collapse, reorder.
- M4 adds the differentiator: branches and anchors, including the broken-anchor repair path.
- M5 wires the real reader/page views to the spike's layout package and closes the stability gates.

## M6–M8 — Export, API, polish (planned)

- M6 is the PDF commitment: the real app exports the real document, and the gate is re-run on a packaged build.
- M7 is the external surface; the API is built on the same command layer as the UI.
- M8 is breadth and release polish; no new architecture unless an ADR says so.

## Risks and decision points

| Risk | Where it bites | Mitigation |
|---|---|---|
| Spike layout does not generalize to anchors/continuations | M4–M5 | Fixtures include anchored callouts and continuations from day one; the paginator API exposes break candidates, not ad-hoc slicing. |
| `printToPDF` cannot fix A4 pages deterministically | M1/M6 | ADR-0002 gate; print compositor consumes derived pages; fallback ADR if it fails. |
| Command layer and API drift | M2/M7 | One typed command layer; the API is a transport adapter, not a second mutation path. |
| Electron performance at 300–1,000 blocks | M3/M5 | Measure in the spike; virtualization/collapse/LOD; native canvas is a later option, not a stack switch. |
| Scope creep before a usable vertical slice | All | Milestone gates; v1 scope list in `AGENTS.md`; no plugins/collaboration/annotations. |
