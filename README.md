# NoteForest

A Mac-first spatial note-taking app for studying. Notes are built from content blocks connected by explicit arrows. A branch can start from a whole block or from a word, formula term, code token, or image region. The same document can be read as an outline, a continuous reader with page-break markers, or a paginated A4 page view. PDF export preserves the layout with real text; the PDF is meant to be annotated by hand on an iPad.

## Status

Spike 1 in progress: adaptive layout + paginator + real-text PDF. Planning is ratified; application code outside the spike is not yet approved.

- `AGENTS.md` — team, rules, and current decisions.
- `docs/spec.md` — product and data-model spec.
- `docs/ux.md` — interaction flows and keyboard model.
- `docs/review-checklist.md` — review checklist.
- `docs/definition-of-done.md` — quality gates and test strategy.
- `docs/plan.md` — milestones and tasks.
- `docs/spike-01-layout-paginator-pdf.md` — the current spike brief.
- `docs/adr/` — stack, PDF, and External API decisions.
- `research/landscape.md` — technical landscape and prior art.
- `research/native-stacks.md` — stack review and go/no-go.

## Stack (v1)

Electron + React + TypeScript, TipTap/ProseMirror, CodeMirror 6, KaTeX, React Flow, and Electron `printToPDF`. See `docs/adr/0001-stack-electron.md` and `docs/adr/0002-pdf-pipeline.md`.

## Name

`NoteForest` is a working title. An existing app with the same name exists; public release requires clearance or a rename.
