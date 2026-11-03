# NoteForest

A Mac-first spatial note-taking app for studying. Notes are built from content blocks connected by explicit arrows. A branch can start from a whole block or from a word, formula term, code token, or image region. The same document can be read as an outline, a continuous reader with page-break markers, or a paginated A4 page view. PDF export preserves the layout with real text; the PDF is meant to be annotated by hand on an iPad.

## Status

Spike 1 in progress: adaptive layout + paginator + real-text PDF. Planning is ratified; application code outside the spike is not yet approved.

## Running Spike 1

This worktree uses **npm workspaces** (`apps/desktop`, `packages/layout`, `packages/pdf`) because pnpm is not installed on the reference machine. Node 22+ is required.

```bash
npm install
npm run typecheck   # strict TypeScript across the workspaces
npm test            # Vitest layout/paginator geometry tests
npm run e2e         # Playwright-driven Electron smoke and PDF tests
npm run gates       # full Spike 1 gate harness; writes artifacts/spike-01
npm run pdf:verify -- fixtures/long-50-pages.json artifacts/spike-01/spike-01-long-50-pages.pdf
```

- `npm run dev` and `npm start` launch the Electron shell. The scripts unset `ELECTRON_RUN_AS_NODE` (the host environment sets it); the e2e and gate launchers remove it explicitly.
- The app loads fixtures from `fixtures/`, renders a continuous reader and a paginated A4 page view, and exports a Page PDF from the same derived pages.
- Spike artifacts (PDFs, screenshots, PDF rasters, `gates.json`) are written to `artifacts/spike-01/` and are not committed. Key evidence is copied to `docs/spikes/artifacts/`.
- The report is `docs/spikes/spike-01-report.md`.
- No editor, persistence, external API, MCP, outline UI, themes, or packaging are included.


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
