# M3i5b — e2e duplicate trim, coverage matrix, formula-term fixture

**Role:** Implementer / Builder  
**Milestone:** M3i — Core stabilization  
**Base:** current `main` after M3i4a/M3i4b (`1d1ed65`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** test-only cleanup and evidence. No product code, UI, schema, command, save, layout, or API
change.

## Context

Read `docs/architecture/test-suite-audit.md`, the M3i5a report, the M3h Sentinel re-review S3-7
finding, and the current e2e/recovery tests. M3i5a extracted the UI harness and split callout tests;
this slice handles the remaining test duplicates and the missing formula-term edit fixture.

## Required work

1. **Coverage matrix**
   - Add `docs/architecture/test-coverage-matrix.md` mapping each M2/M3 behavior to its
     authoritative test level (unit / UI / e2e / recovery) and the exact test name.
   - Use it to justify every removal; do not delete a behavior's only app-level path.

2. **E2E duplicate trim (conservative)**
   - Review the candidates in the M3i5a report:
     - one of the two flush-failure e2e paths;
     - the E2E dialog-guard test if unit `dialog-guard.test.ts` fully covers the guard;
     - one of the two save-copy e2e paths;
     - one of the two reload e2e paths;
     - trim/drop the external-overwrite e2e if the unit path plus one post-overwrite assertion
       covers it;
     - keep close and quit as distinct lifecycle paths unless the matrix proves redundancy.
   - Keep at least one e2e for: create/edit/branch/reopen, close/quit flush, save failure/retry,
     external modification, reload, save copy, last-window quit, and the text-anchor flow.
   - Do not remove a test merely because a unit test shares a helper; require the same user-visible
     behavior and a unique app-boundary path.

3. **S3-7 formula-term edit fixture**
   - Add the missing fixture/table case that edits the formula around a formula term and re-resolves
     it (unique, ambiguous, broken as appropriate).
   - Keep it test-only; no product behavior change.

4. Update `docs/architecture/test-suite-audit.md` with the final counts and removed/kept scenarios.

## Guardrails

- No product code or UI change.
- No `.skip`, `.only`, retries, fixed sleeps, or native-dialog waits.
- Every removal must be listed in the report with its replacement evidence.
- Keep critical e2e under the 60 s suite budget and all recovery/UI suites green.

## Tests and gates

- `npm run check:boundaries`
- `npm run typecheck`
- `npm test`
- `npm run test:ui`
- `npm run e2e:critical`
- `npm run test:recovery:run`
- `npm run verify:fast`

The Orchestrator runs one full `npm run verify` after integration.

## Deliverable

Report: worktree path, branch, base, commit, coverage matrix, removed tests with replacements, e2e
count/suite time, formula-term fixture, tests/timings, risks, not verified. Do not merge or push. Stop
and ask if a candidate is the only app-level evidence for a behavior.
