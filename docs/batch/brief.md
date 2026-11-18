# Batch — anchor resolution index

**Role:** Builder. **Branch:** `t3/anchor-resolution`. **Worktree:** yes.
**Base:** the commit that contains this brief. **Plan:** `docs/architecture/anchor-resolution-plan.md`
(the full design; read it before touching code).
**Planner:** none — the plan is already written. **Sentinel:** after the branch is ready.
**Timebox:** one session; stop and report if a step stays red after one fix attempt.

## Goal

One anchor-resolution index over the core resolver, owned by `DocumentSession`, read by the
renderer and the layout, so every surface reports the same state. Completes ADR-0005. No schema
change, no new anchor kind.

## Decisions (closed)

- One branch, one commit, one merge. The plan's seven steps are internal checkpoints, not batches.
- The visible Page/PDF behaviour is the plan's §6; the product owner reviews it after the branch,
  before merge. Do not invent a different display.
- The anchored `test:perf` seed is in scope. Add it first, run the **before** measurement on the
  pre-index code (seed-only change), then implement, then the after run.
- The print IPC snapshot carries the `AnchorResolutionView` (plan §3.3), with the identity/revision
  guard.
- If the eager cold build misses the 100 ms / 1,000-anchor guard, or open-to-interactive misses the
  DoD budget, stop and report; do not silently switch to lazy.
- The layout seam is the optional `AnchorResolutionView` parameter; an anchor-bearing document
  without a view throws. The `ExportSnapshot` contract change is in scope.

## Scope

Plan steps 0–5 and 7:

0. Baseline evidence: `npm test`; `npm run test:perf` on the untouched baseline with the anchored
   seed added; Page/PDF screenshots for the review fixture. Record machine, date, fixtures.
1. `packages/core/src/anchor-index.ts`: `AnchorIndex`, `buildAnchorIndex`,
   `resolveDocumentAnchorsWithIndexes` extracted with no behaviour change. Tests: parity, cache,
   invalidation, view.
2. `DocumentSession` owns one index: `anchorIndex`, `blockContentKeys`, the optional
   `assetAvailability` port, refresh on load/commit/structural/undo/redo/reset, update before
   `bumpVersion`/`notify`. Session tests.
3. `estimate.ts` reads `anchorIds` (marks and atomic attrs, legacy fallback); an M3 fixture
   produces rects.
4. Layout consumes the view: 4a optional parameter + identity guard + picker; 4b thread through
   `computePageModel`, Page hook, print snapshot, `ExportSnapshot` + validator, layout tests and a
   view helper; 4c delete the old derivation, the `occurrenceHint` reads and the dead
   `anchorStates` map.
5. Renderer reads the index: `tree.anchorState`, `BlockViews`, `ImageNodeView`, `adapter.toCallout`,
   `find`, `document-health`, `anchor-health`; remove the now-unused resolution imports.
7. Perf and integration evidence: the warm-update guard, the anchored `test:perf` scenario, the
   before/after protocol, `verify:fast`, the touched UI suites.

Step 6 is the review package (fixtures + screenshots + the three-way Continuous/Page/PDF
comparison); produce it, do not merge.

## Acceptance

The plan's 14 criteria, in particular:

- one index in core, no second derivation in layout or the renderer;
- `entry(id)` deep-equals `resolveAnchor` for every fixture and a generated 1,000-anchor document;
- one-block update indexes exactly one block; branch/asset changes index zero blocks;
- session ordering (index before `bumpVersion`/`notify`);
- every placed anchor's state equals the view entry; defects only on non-resolved placed anchors;
- idle and `block-missing` produce no attachment/defect;
- Page dot ⇔ broken/ambiguous on the review fixture; Continuous unchanged;
- split/merge and image replacement match core; `document.json` byte-identical;
- cold build < 100 ms / 1,000 anchors; warm update < 16 ms p95; no DoD budget regresses;
- `npm run typecheck`, `npm test`, `npm run e2e`, the touched UI suites and `npm run test:perf`
  green at the end; one full `npm run verify` is the Orchestrator's at integration.

## Tests and evidence

Follow plan §8. Add the review fixture and the screenshots for the five visible cases. No copy
change. No new dependency. No schema change. Record the before/after numbers in the report, not in
the plan.

## Stop and report

- A step stays red after one fix attempt.
- The eager index misses the cold/open budget and lazy is needed.
- A visible change beyond plan §6 appears.
- The layout would need asset availability, crop or node kind inside `packages/layout` (boundary
  change).
- An anchor resolution rule, the schema or the ADR would need to change.

## Report

Summary, files changed, checks with timings, acceptance criteria pass/fail, the before/after perf
numbers, the review package paths, risks, next step. One commit; no merge, no push.
