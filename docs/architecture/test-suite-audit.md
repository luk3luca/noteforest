# Test-suite audit — duplication and cleanup

**Status:** M3i5a merged on 6 November 2026 (shared UI harness, callout split, −857 UI lines;
net tests footprint −347). M3i5b (e2e duplicate trim) remains.  
**Date:** 6 November 2026.

## Snapshot

| Suite | Files | Tests | Lines |
|---|---:|---:|---:|
| Unit / package / desktop | 47 | 505 | ~15,940 |
| UI | 12 | 33 | 7,046 |
| Critical e2e | 1 | 21 | 2,733 |
| Recovery | 2 | 14 | 1,226 |
| **Total** | **62** | **573** | **~27,257** |

The suite is green and the critical e2e budget is under 60 s. The problem is **maintenance surface**,
not test runtime.

## Verdict

Most tests are necessary. The main duplication is in **harness/setup code**, not in assertions.
There is also one real test-level overlap: the critical e2e file repeats a large part of the
recovery/save-failure matrix that already has dedicated suites.

Approximate judgment:

- **~70% necessary coverage** — keep.
- **~25–30% setup/fixture duplication** — extract, not delete.
- **A small number of genuinely duplicated scenarios** — merge or move to the authoritative level.

Do not mass-delete tests to shorten files. Remove duplication, keep behavior coverage.

## Findings

### 1. UI session boilerplate is duplicated in every file

All 12 UI files define their own `isolated`, `launch`, `applyCommand`, and `structure`; 10 also
duplicate the same wrappers. Estimated 600–900 lines of identical setup.

Also duplicated:

- `textMatch` / `createAnchoredChild` in callout + outline;
- `openBlockMenu` in reference + split/merge;
- `textDoc` / `formulaDoc` / `codeDoc` in repair + live-health;
- point/path parsers and overlap assertions in callout.

**Action:** one `tests/support/ui-session.mjs` with launch/env/apply/structure helpers and one
`tests/support/fixtures.mjs` with document/anchor/branch builders. Keep files explicit about what
they assert; hide only mechanics.

### 2. Flow files are long because of inline setup, not redundant tests

| File | Lines | Tests |
|---|---:|---:|
| `tests/ui/m3-anchor-callout.test.mjs` | 1,957 | 13 |
| `tests/ui/m3-reference.test.mjs` | 974 | 4 |
| `tests/ui/m3-repair.test.mjs` | 699 | 4 |
| `tests/ui/m3h3-live-health.test.mjs` | 412 | 2 |

These cover distinct geometry/repair/reference/health behaviors. The length comes from fixtures,
DOM probes, and long setup. Splitting `m3-anchor-callout` by concern (layout, stacking, placement
undo) is reasonable; deleting tests is not.

### 3. Critical e2e duplicates the recovery matrix

`tests/e2e/m2-editor.test.mjs` is 2,733 lines / 21 tests. Twelve tests are persistence, save-failure,
external-modification, quit, or close/relaunch paths. The dedicated recovery suite has 14 tests and
the desktop unit suite already covers save-failure/backup state.

**Action:** keep one critical user path per behavior in e2e (close/quit flush, one save failure,
one external modification, one relaunch), and keep the exhaustive matrix in recovery/unit. A
coverage matrix should decide which 3–5 e2e tests can be removed; do not cut below distinct user
paths.

### 4. Layered duplication is sometimes intentional

Undo identity, anchor repair, save failure, and empty chapters appear at unit, UI, and e2e levels.
That is not automatically wrong:

- unit = invariant/command semantics;
- UI = operator flow and rendering;
- e2e = lifecycle, IPC, real app boundary.

Keep one authoritative level per behavior and use the other levels only for integration. Avoid
re-asserting the same pure invariant at three levels.

### 5. Core tests are large but high-value

`anchor-commands`, `anchors`, `selection-command`, `split-merge`, `role-transitions`, `move-undo`,
and `destructive-undo` are long because the command matrix is large. They are the cheapest place to
catch identity/undo regressions.

**Action:** keep them. Extract repeated document factories and add the apply→inverse→deep-equal
invariant harness; do not replace them with UI tests.

## What to keep

- command/undo/identity/repair invariants;
- geometry, edge routing, placement, pagination, export manifest;
- recovery/backup/corrupt/stale-lock matrix;
- critical e2e user paths and quit lifecycle;
- accessibility checks;
- screenshots for visual rules that cannot be asserted semantically.

## What to remove or move

- 12 copies of UI launch/env/apply/structure boilerplate;
- duplicate document/anchor/branch fixture builders;
- duplicate path/geometry probes;
- e2e recovery scenarios already covered by the recovery suite;
- tests that only re-assert a pure invariant already covered at the authoritative level;
- giant mixed-concern test files when a clean split is possible without changing assertions.

## Proposed cleanup slices

1. **Harness extraction** — `ui-session.mjs`, `fixtures.mjs`; migrate all UI files. No assertion
   changes.
2. **Callout split** — layout / stacking / placement-undo files; shared fixtures, same tests.
3. **Repair + live-health fixtures** — one anchor-health fixture module; keep separate tests.
4. **E2E coverage matrix** — map each of the 21 tests to a unique user path; remove only clear
   recovery duplicates; keep the critical budget honest.
5. **Core fixture + invariant harness** — shared factories, apply→inverse→deep-equal; no test
   deletion.

Expected result: **roughly 1,500–2,500 fewer test lines**, mostly setup, with the same or better
coverage. Test count may drop only where a scenario is genuinely duplicated.

## Guardrails

- No test may be weakened to hit a line target.
- Extract helpers with explicit names; avoid a god helper that hides the scenario.
- No shared mutable document between tests; factories only.
- One full `npm run verify` after each cleanup slice.
- Keep critical e2e under the 60 s suite budget and keep the recovery matrix in its own suite.
