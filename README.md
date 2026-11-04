# NoteForest

A Mac-first spatial note-taking app for studying. Notes are built from content blocks connected by explicit arrows. A branch can start from a whole block or from a word, formula term, code token, or image region. The same document can be read as an outline, a continuous reader with page-break markers, or a paginated A4 page view. PDF export preserves the layout with real text; the PDF is meant to be annotated by hand on an iPad.

## Status

Spike 1 is complete (technical foundation merged); **M2f phase 5a — keyboard/focus and accessibility** is in progress. Phase 4b is merged; M3 and PDF/page work remain deferred until M2f is accepted.

## Running the current code

This worktree uses **npm workspaces** (`apps/desktop`, `packages/core`, `packages/layout`, `packages/pdf`). Node 22+ is required.

```bash
npm install
npm run typecheck   # strict TypeScript across the workspaces
npm test            # unit/geometry tests (target < 3 s)
npm run e2e         # build + critical Playwright-driven Electron suite (target < 60 s)
npm run test:recovery # corrupt/missing/newer package recovery integration
npm run verify:fast # typecheck + unit + critical e2e
npm run verify      # verify:fast + recovery integration
npm run test:perf   # 300/1,000-block performance report (on demand, not the gate)
npm run test:visual # screenshots for product-owner review (on demand, not the gate)
```

- Test artifacts default to `artifacts/`; set `NOTEFOREST_ARTIFACTS` to redirect them.
- Run policy: while fixing, the Builder runs only the targeted unit/e2e tests, then `verify:fast`
  once at handoff. The Orchestrator runs `verify` once on integration. Do not re-run the full
  suite after every small fix; `test:perf` and `test:visual` are on-demand, not part of either gate.
- `npm run dev` and `npm start` launch the Electron shell. The scripts unset `ELECTRON_RUN_AS_NODE` (the host environment sets it).
- The current renderer is the M2 editor shell, not the Spike 1 fixture demo.
- M2e report: `docs/reports/m2e-routing-and-layout.md`; M2f phase-1 report: `docs/reports/m2f-phase1.md`.
- Spike 1 evidence remains in `docs/spikes/spike-01-report.md` and `docs/spikes/artifacts/`; the old Spike 1 gate harness targets the removed demo renderer and is not part of the M2 gate.

## Undo and redo

Undo/redo is one user command with two internal stacks. The last operation chooses the
preferred stack: text after typing or a text undo/redo, structural after a structural
command. If the preferred stack has nothing to undo/redo, the command falls back once to
the other stack; it never loops and never performs two steps for one keypress. `⌘Z`,
`⇧⌘Z`, the Edit menu, the command palette, and the settings action all call the same
router (`lib/history-routing.ts`). A structural undo/redo rebuild clears the stale
ProseMirror text stacks. Destructive delete/detach inverses remain phase 3b gaps and are
not presented as undoable.

## M2 status

- Shell spec: `docs/ux-shell.md`.
- Core brief: `docs/tasks/m2a-document-core.md`.
- Shell/editor brief: `docs/tasks/m2-editor-shell.md`.
- M2c polish brief: `docs/tasks/m2c-interaction-polish.md`.
- M2d depth-columns brief: `docs/tasks/m2d-depth-columns.md`.
- M2e layout/routing brief: `docs/tasks/m2e-routing-and-layout.md`.
- M2 review + test inventory: `docs/reviews/m2-review.md`.
- M2f stability brief: `docs/tasks/m2f-stability-fixes.md`.
- M2f phase 2a brief: `docs/tasks/m2f-phase2a-flush-close.md`.
- M2f phase 2b1 brief: `docs/tasks/m2f-phase2b1-save-recovery.md`.
- M2f phase 2b2a brief: `docs/tasks/m2f-phase2b2a-external-modification.md`.
- M2f phase 2b2b brief: `docs/tasks/m2f-phase2b2b-backup-restore.md`.
- M2f phase 3a brief: `docs/tasks/m2f-phase3a-undo-routing.md`.
- M2f phase 3b1 brief: `docs/tasks/m2f-phase3b1-destructive-undo.md`.
- M2f phase 3b2 brief: `docs/tasks/m2f-phase3b2-move-identity.md`.
- M2f phase 4a brief: `docs/tasks/m2f-phase4a-corrupt-recovery.md`.
- M2f phase 4b brief: `docs/tasks/m2f-phase4b-empty-chapters-locks.md`.
- M2f phase 5a brief: `docs/tasks/m2f-phase5a-keyboard-a11y.md`.
- UI decisions: `docs/adr/0004-ui-shell-and-branch-editor.md`.
- UI research: `research/ui-components.md`.


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
