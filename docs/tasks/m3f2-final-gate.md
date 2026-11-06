# M3f2 — Export manifest, fixture matrix, performance, final M3 gate

**Role:** Builder  
**Milestone:** M3f2 (last M3 slice)  
**Base:** current `main` (M3f1 merged)  
**Worktree:** fresh worktree from `main`  
**Timebox:** 1.5 days

## Context

M3 has anchors, callouts, references, repair, and split/merge. The remaining M3 gate evidence is a
pure exactly-once export manifest, a valid fixture matrix, 1,000-anchor resolution performance, and a
clean final gate. Image anchors remain blocked on the missing image pipeline; UI paste/duplicate
anchor remap is a follow-up, but the pure remap helper belongs here.

Read:
- `docs/spec.md` v0.4.5 §8.9/§9.2/§15.10 (AC-56), §15.3 (AC-18); ADR-0005 §8; design §9 (export),
  §11 (fixtures), §12 M3f, §15 (risks).
- `packages/core` anchors/resolution/structure/commands; `fixtures/`, `scripts/generate-fixtures.mjs`,
  `packages/core/test/fixtures.test.ts`, existing perf tests.

## Goal

M3 is evidence-complete without PDF: a pure export plan proves exactly-once content, all fixtures
validate, 1,000 anchors resolve within budget, duplicate/paste remap is safe at the model level, and
the full gate is green.

## In scope

1. **`buildExportPlan` exactly-once manifest**
   - Pure function over the canonical document: chapters/top-level blocks/blocks in outline order;
     every primary branch/block exactly once; anchored callouts included; a shared child appears once
     at its primary home; reference edges add no entries; broken/ambiguous anchors add marker records
     but no duplicate target; deterministic order; no PDF/page geometry.
   - Tests for shared child, references, broken/ambiguous, split/merge, empty chapter, deterministic
     repeat.
2. **Fixture matrix and validity**
   - Add/refresh fixtures covering text, whole formula, formula term, code range, references,
     broken/ambiguous, split/merge; generate with `scripts/generate-fixtures.mjs`.
   - Every `fixtures/*.json` passes `parseDocumentJson`/validation; no invalid fixture is committed.
   - Do not delete M4 layout/paginator fixtures or Spike evidence.
3. **1,000-anchor performance**
   - Generate 1,000 anchors across blocks (text/formula/code mix), resolve document; record time.
   - Target: document resolution <100 ms on the current machine; if it misses, report the profile and
     optimize only the obvious hot path. Keep it a unit/perf test, not critical e2e.
4. **Pure duplicate/paste remap helper**
   - Core helper/tests that remap anchor IDs, branch IDs, and binding marks for a duplicated subtree;
     external references are not copied; no duplicate IDs; no UI integration yet.
   - Record UI paste/duplicate as a follow-up if it is not already covered.
5. **Final M3 gate**
   - `npm run typecheck`, `npm test`, fixture validity, performance test; report real timings.
   - Update `docs/reports/m3f2-final-gate.md` and plan status. The Orchestrator runs the full
     `npm run verify` after merge.
   - No new critical e2e; critical stays 21 tests.

## Out of scope

- Image anchors (M3c3b blocked on the image pipeline).
- UI paste/duplicate integration, page view, PDF visuals (M4), M5 API.
- Schema change, new dependencies, changing ratified decisions.

## Files

Expected to touch:
- `packages/core/src/` (new export-plan/duplicate-remap module + exports)
- `packages/core/test/` (export plan, duplicate remap, anchor performance)
- `fixtures/`, `scripts/generate-fixtures.mjs`, `packages/core/test/fixtures.test.ts`
- `docs/reports/m3f2-final-gate.md`
- Possibly `docs/plan.md` status (Orchestrator will finalize)

## Acceptance criteria

- [ ] `buildExportPlan` proves every primary block/branch exactly once, shared child once, references
      excluded, broken/ambiguous markers included, deterministic.
- [ ] All fixtures validate; the fixture matrix covers text/formula whole/formula term/code/reference/
      broken/ambiguous/split-merge.
- [ ] 1,000-anchor resolution meets the <100 ms target or reports a measured, actionable profile.
- [ ] Duplicate/paste remap keeps IDs unique and does not copy external references; unit tests.
- [ ] Final M3 gate commands pass; real timings recorded; no new critical e2e.
- [ ] No image/page/PDF/UI paste work.

## Tests and evidence

- `npm run typecheck`
- `npm test` (target <3 s)
- Fixture validity test
- 1,000-anchor performance test
- No full `verify`; the Orchestrator runs it after merge.
- Report test counts/timings and the manifest/fixture matrix.

## Stop and ask

Stop if `buildExportPlan` needs a new document structure, if a fixture cannot validate without a spec
change, or if 1,000 anchors require an architectural resolver change.

## Report format

Summary, files, manifest contract, fixture matrix, performance numbers, duplicate remap, tests/timings,
risks, M3 residual gaps.
