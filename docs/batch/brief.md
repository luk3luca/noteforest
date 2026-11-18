# Batch — test surface extraction

**Role:** Builder. **Branch:** `t3/test-surface`. **Worktree:** yes.
**Base:** the commit that contains this brief. **Plan:** none — this batch is intentionally
brief-only (control group for the Planner cost).
**Timebox:** one session; stop and report if a step stays red after one fix attempt.

## Goal

Extract the inline `window.__noteforestTest` bridge from `App.tsx` into a module with an identical
interface, registered once. No behavior change.

## Scope

- The bridge is the single `useEffect` that assigns `window.__noteforestTest` (search for
  `__noteforestTest` in `apps/desktop/src/renderer/src/App.tsx`; the object starts at the effect body
  and the cleanup deletes the global). Move that object and its owning effect body into
  `apps/desktop/src/renderer/src/test-surface.ts`.
- Keep `window.__noteforestTest` exactly as `apps/desktop/src/renderer/src/global.d.ts` declares it,
  including `commandState(id)` added by the command surface.
- `App.tsx` keeps one call that installs the surface and one cleanup, with the same lifecycle (empty
  deps, delete on unmount).
- Do not change the bridge shape, the suites, the command logic, the print test surface, the export
  flow, or any UI copy.
- No new dependency, no schema, no product change.

## Acceptance

1. `App.tsx` no longer contains the inline bridge object; the extraction lives in one module.
2. The bridge interface is unchanged: `global.d.ts` is untouched, and no suite changes.
3. `npm run test:ui` is **70/70** — every UI suite uses the bridge.
4. `npm run verify:fast` is green (typecheck, unit, e2e).
5. No behavior change: the bridge's state, actions, print helpers, export helpers and
   `commandState(id)` behave exactly as before.
6. One commit; no merge, no push.

## Tests and evidence

- `npm run verify:fast`.
- `npm run test:ui` (all suites; the bridge is their only entry point).
- A screenshot is not needed: test infrastructure only.
- The Orchestrator runs one full `npm run verify` at integration.

## Stop and report

- A suite fails for a bridge reason you cannot fix without changing the interface.
- The extraction would need to change the bridge shape, the `global.d.ts` type, or a suite.
- An unrelated failure blocks the gates.

## Report

Summary, files changed, checks with timings, acceptance criteria pass/fail, risks, next step.
