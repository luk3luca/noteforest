# M3i5a — UI test harness and fixture cleanup

**Role:** Implementer / Builder  
**Milestone:** M3i — Core stabilization  
**Base:** current `main` after M3 acceptance (`60923a0`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** test-only cleanup; no product code, no behavior change, no test weakening.

## Context

Read `docs/architecture/test-suite-audit.md`, `AGENTS.md`, and the current UI test files. The suite is
green; the problem is duplicated setup and very long files. Do not delete tests in this slice unless a
test is an exact duplicate with identical coverage; prefer extraction and splitting.

## Required work

1. Create `tests/support/ui-session.mjs` with the shared UI-session helpers currently duplicated in
   every UI file:
   - `isolated`, `launch`, `applyCommand`, `structure`;
   - `textMatch`, `createAnchoredChild`, `createDirectChild`, `openBlockMenu`;
   - path/point parsing and `assertNoOverlap`;
   - any other genuinely identical helper, with explicit names and no hidden global state.
2. Create `tests/support/fixtures.mjs` for repeated document/anchor/branch factories such as
   `textDoc`, `formulaDoc`, `codeDoc`, `addTopLevelBlock`, `addAnchor`, `addBranch`.
3. Migrate every `tests/ui/*.mjs` file to the shared helpers. Keep each test's assertions, waits, and
   intent explicit. Do not replace whole scenarios with opaque mega-helpers.
4. Split `tests/ui/m3-anchor-callout.test.mjs` by concern if it can be done without changing
   coverage: callout layout/geometry, stacking/active state, and placement-undo. Share fixtures.
5. Keep `m3h3-live-health` and `m3-repair` fixtures shared where they are genuinely the same.
6. Do not trim critical e2e tests in this slice. Instead, produce a short coverage-matrix note in
   `docs/architecture/test-suite-audit.md` or the report listing the e2e recovery duplicates that
   are safe to remove in a later slice, with exact test names and their recovery counterpart.

## Guardrails

- No product code, no spec/UX/ADR/plan changes.
- No `.skip`, `.only`, retries, weakening assertions, fixed sleeps, or native-dialog waits.
- The test count should stay the same or increase only if an extracted helper reveals a real gap.
- Keep helper functions typed/validated enough that a wrong fixture fails loudly.
- Run one full `npm run verify` after integration is the Orchestrator's job; the Builder runs
  typecheck, `npm test`, `npm run test:ui`, `npm run e2e:critical`, and `verify:fast`.

## Deliverable

Report: worktree path, branch, base, commit, files, line reduction, test count, exact extracted
helpers, e2e duplicate candidates (not removed), tests/timings, risks, not verified. Do not merge or
push. Stop and ask if an extraction would change a test's meaning.
