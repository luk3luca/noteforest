# M3c3b6 — image follow-ups: AVIF dimensions, stale placeholder attr, action gating

**Role:** Implementer / Builder
**Milestone:** M3c3b — image integrity follow-up
**Base:** current `main` after M3c3b5 + M4b1
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** close the remaining S3-1 / S4-1 / S4-2 findings from
`docs/reviews/m3c3b-re-review.md`. No asset-store, page view, PDF, anchor, crop, or resize work.
**Important:** do not edit `package.json` or `verify`/`test:ui` scripts. Extend existing test files
that are already in the suites (or add a unit test file under `apps/desktop/test/`, which Vitest
auto-includes). This avoids a conflict with the parallel M4b2 slice.

## Required work

1. **S3-1 — real AVIF intrinsic dimensions.**
   - `apps/desktop/src/main/image-dimensions.ts` currently scans only top-level ISO BMFF boxes, so a
     real AVIF `ispe` inside `meta`/`iprp`/`ipco` returns `null`.
   - Implement a bounded recursive box walker for AVIF: handle `meta` (full box: 4-byte
     version/flags before children), `iprp` and `ipco` containers, and `ispe` (full box: version/flags
     then width/height). Tolerate `iref`/other boxes; stop at a depth limit; never throw.
   - Add a real 640×360 AVIF fixture (for example `fixtures/assets/forest.avif`, generated with
     `sips -s format avif fixtures/assets/forest.png`) and a test in
     `apps/desktop/test/image-dimensions.test.ts` asserting `{ width: 640, height: 360 }`. Also add a
     synthetic nested-box unit case so the parser is covered without the binary fixture.
   - If a real AVIF cannot be produced in the worktree, do not remove AVIF silently: report the
     blocker and keep the synthetic parser test. Do not add a dependency.
2. **S4-1 — clear stale `unavailable` after replacing a cross-document placeholder.**
   - `apps/desktop/src/renderer/src/lib/image.ts` `contentWithImageAsset` currently spreads all
     attrs, so `unavailable: "cross-document-copy"` survives after an asset id is assigned.
   - When assigning an `assetId` or replacing the image, delete `unavailable` and
     `clipboardAssetId` from the canonical attrs. In `apps/desktop/src/renderer/src/lib/adapter.ts`
     `canonicalImageAttrs`, also drop `unavailable`/`clipboardAssetId` whenever `assetId` is present
     (defense in depth), and keep dropping `src`/`title`/view flags.
   - Add a round-trip test: a placeholder with `unavailable` + alt + dimensions, replace/assign an
     asset, then assert the canonical node has `assetId` and **no** `unavailable` or
     `clipboardAssetId`; reload keeps the image.
3. **S4-2 — disable Add region/Add point when the asset is missing/changed.**
   - `apps/desktop/src/renderer/src/actions.ts` `canAuthorImage` checks only record presence. Gate
     authoring on availability: an asset is authorable only when the record exists, the runtime is
     editable, and `runtime.assetAvailability[assetId]` is undefined (available) or `'available'`.
     Use the existing `AssetAvailabilityIndex` semantics; do not invent a second availability store.
   - The disabled label must name the reason, e.g. `Add image region… — image file missing` /
     `— image asset changed`, and the per-image inline menu must use the same gate. Replacement and
     alt editing stay enabled where they are safe.
   - Test with a missing file and with a hash-mismatched file: both menu surfaces show the action
     disabled with the reason, and no authoring starts. Keep the existing multi-image routing tests.
4. **Docs.** Add `docs/reports/m3c3b6-image-followups.md` with the AVIF approach, the cleanup rule,
   the availability gate, tests/timings, and residual risks. Do not change spec/UX/ADR/plan.

## Gates

- `npm run check:boundaries`
- `npm run typecheck`
- targeted vitest
- `npm test`
- `npm run test:ui` (existing suites must stay green; no `package.json` edit)
- `npm run test:recovery:run`
- `npm run e2e:critical`
- one `npm run verify:fast` at the end

## Guardrails

- No new runtime dependency.
- Do not touch `NodeAssetStore`/confinement (M3c3b5), page view, PDF, reader markers, anchors, crop,
  resize, or the External API.
- Do not weaken the cross-document placeholder path; a failed copy still leaves a labeled
  placeholder with no dangling `assetId`.
- Do not merge or push.

## Deliverable

Report worktree/branch/base/commit, files, AVIF parser behavior/fixture, canonical attr cleanup,
availability gate, tests/timings, risks, not verified. Stop and ask if AVIF cannot be validated
without a platform-specific encoder or if the availability index cannot distinguish
missing/changed/unchecked.
