# M3i4b — architecture boundary check

**Role:** Implementer / Builder  
**Milestone:** M3i — Core stabilization  
**Base:** current `main` after M3i2c (`c6b3f6e`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** build/test tooling only. No product behavior, UI, schema, or command change.

## Context

Read `AGENTS.md`, `docs/architecture/core-stabilization.md`, and the package manifests. The
dependency direction is currently convention, not enforced: core must stay DOM/Electron/React-free,
layout must stay pure, pdf must not import the renderer, and desktop may depend on core/layout/pdf.

## Required work

1. Add `scripts/check-boundaries.mjs` (Node, no new dependency) that scans TypeScript/TSX imports in
   `apps/desktop`, `packages/core`, `packages/layout`, `packages/pdf`, and `packages/api` if present,
   and fails on forbidden edges:
   - `packages/core` → `apps/desktop`, `electron`, React, renderer, Node fs except the explicit
     `core/node` subpath;
   - `packages/layout` → React/Electron/desktop;
   - `packages/pdf` → React/Electron/desktop renderer;
   - `packages/*` → `apps/desktop` (no reverse dependency);
   - renderer code → Node main-process modules/`fs`/`electron` (preload/shared contracts excepted).
   Make the allow-list explicit and easy to extend; report file and import on failure.
2. Add `npm run check:boundaries` at the root and run it in `verify:fast` (and therefore `verify`).
   Keep the script fast and deterministic.
3. Add a Vitest or Node test that proves the checker fails on a synthetic forbidden import and passes
   on an allowed one, so the rule cannot silently rot.
4. Fix only genuine boundary violations found by the checker. Do not move product code beyond
   trivial import-path corrections; if a real violation needs a refactor, stop and report it.
5. No new runtime dependency.

## Guardrails

- No UI, schema, command, save, layout, or API change.
- Do not weaken the checker to make the current tree pass; document any temporary allow-list entry
  with a reason.
- Keep existing scripts and gates intact.

## Tests and gates

- `npm run check:boundaries`
- `npm run typecheck`
- `npm test`
- `npm run verify:fast`

The Orchestrator runs one full `npm run verify` after integration.

## Deliverable

Report: worktree path, branch, base, commit, files, rule matrix, allow-list, violations found/fixed,
tests/timings, risks, not verified. Do not merge or push. Stop and ask if a violation requires a
product-code refactor.
