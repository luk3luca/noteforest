# M2f phase 5b — Dead code, dependencies, fixtures, and docs cleanup

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F12–F15/F19; `docs/tasks/m2f-stability-fixes.md` phase 5  
**Out of scope:** behavior changes, M3/page/PDF, new features

## Goal

Finish M2f with a no-behavior-change cleanup: remove dead code and unused dependencies, fix the Spike fixture schema, remove stale tooling from the default workflow, and make the docs reflect the current M2e/M2f product.

## 1. Dead code / duplication

Verify with `rg` before deleting; remove only truly unused code/tests:

- renderer `lib/tree.ts` duplication of core `structure.ts`: import the core helpers or keep one documented selector layer;
- write-only `selectedBlockByDoc`/`setSelectedBlock` if no reader exists; use `runtime.selectedBlockId`;
- unused exports/functions: `useContentReady`, `EDGE_CONSTANTS`, `recordActiveScroll`, `applyDocumentCommand`, `openBlockActions`, `removeTab`, `ConfirmChoice`, dead `onRequestFocusBlock` bridge/plumbing, `useContentReady`;
- `packages/pdf/src/atomicFile.ts` duplicate atomic writer if unused; core atomic writer remains the only one;
- `packages/core/src/history.ts`: decide adopt (if used) or remove; document the decision;
- remove any other dead exports the TypeScript/knip/rg scan finds. Do not remove M4 router/fixtures/Spike evidence, validation/security/accessibility, or data-safety code.

## 2. Dependencies

- Remove unused direct dependencies (verify each with `rg`): `@tiptap/extension-bubble-menu` if TipTap v3 uses `@tiptap/react/menus`, `class-variance-authority`, `clsx`, `highlight.js`, `tailwind-merge`, `tw-animate-css`, `@types/katex` if unused.
- Deduplicate KaTeX (currently direct 0.18.10 + transitive 0.18.11). Pin one version; evaluate 0.19.0 with the math extension; if it breaks, pin 0.18.10 and dedupe. Test inline/display math.
- Deduplicate `pdfjs-dist` between root scripts and `packages/pdf`; keep one version.
- Prune lowlight languages to those actually offered, or accept the bundle and record it. Record the built JS size.
- Add `engines.node` if missing; do not add lint/CI unless trivial and documented.

## 3. Fixtures / Spike tooling

- Fix the fixture anchor shape: restore the `selector` object or regenerate with the current schema; update `scripts/generate-fixtures.mjs`.
- Add a fixture-validity test that every `fixtures/*.json` passes `parseDocumentJson`/core validation.
- Mark `gates`/`gates:summary`/`pdf:verify`/`pdf:raster` as Spike-only (rename `spike:*` or remove from default docs/scripts); do not present them as M2/M3 gates.
- Keep `docs/spikes/artifacts` and M4 paginator/router tests.

## 4. Docs consistency

- README: root `npm run dev` is not a script; link the M2f reports; correct the stack paragraph (CodeMirror/React Flow are later, not current deps); state the Spike harness status.
- AGENTS repo layout: `apps/desktop` is the editor shell; `packages/core` exists; `packages/api` not scaffolded.
- plan: remove stale “(current)” labels; state M2f/M2 status and gate.
- `ux-shell.md`: any leftover depth-column language → parent-relative (D23).
- ADR-0004 body: add a “body superseded by addenda” banner for Source Serif, Cmd+Enter/Tab-create, flex-wrap.
- DoD/review checklist phase note: spec v0.4.4; current gate.
- `docs/reports/m2d-depth-columns.md`: “Superseded by M2e/D23” banner.
- Do not rewrite product decisions; this is consistency only.

## Tests / gates

- `npm run typecheck`, `npm test`, `npm run e2e`, `npm run test:ui`, `npm run test:recovery`, `npm run verify` pass.
- No behavior changes; no new native dialogs; no fixed sleeps.
- Critical e2e is ~58.7–59.1 s; cleanup must not add time. Fixture validity is a unit test.
- Report: dead-code list, dependency diff, fixture validity, docs changes, before/after bundle size, known gaps.

## Acceptance

No dead code/unused deps in the reviewed list; fixtures validate; Spike tooling is clearly separated; docs consistent with M2e/M2f; all tests pass. No M3/behavior work.
