# M4b1c1 — page measurement image preload regression

**Role:** Implementer / Builder
**Milestone:** M4b — editor layouts
**Base:** current `main` after M4b1c
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** fix the asset-protocol 404 regression introduced by running the page model in Continuous.
No Page Edit, markers, PDF, or new dependency.

## Problem

M4b1c shares one page model between Continuous and Page. The page model preloads every asset URL
before measuring. In the image UI suites this now requests `noteforest-asset://asset/<id>` for a
valid image while the app/document is closing (or for an image whose dimensions are already known),
and the protocol correctly returns 404 because the store is closed. The suites' `after` hook records
`Failed to load resource: 404` and fails, even though the image itself is valid. The regression is
M4b1c-only (full verify before M4b1c had no such errors).

## Required fix

1. **Do not preload images that already have intrinsic dimensions.**
   - In `page/measurement.ts`, determine which image nodes need a preload:
     only images whose `assetId` is present and whose node/asset `width`/`height` are **not both
     positive**. Images with both dimensions can be measured from the HTML `width`/`height` attrs
     without fetching bytes.
   - Keep preloading images without dimensions (for correct measurement), but skip every asset that
     is not referenced by such a node.
   - Preserve the existing `failedAssetIds`/placeholder behavior when a preload fails.
2. **Respect abort before starting requests.**
   - `preloadImages` must check the abort signal before creating/setting `img.src`, and must not start
     a new request after abort. On abort, remove the host and return without waiting for the image
     timeout.
   - `dispose()` must remain safe while a preload is in flight.
3. **No behavior change for Page Read.**
   - Page Read still renders/measure images correctly. Images with known dimensions render at those
     dimensions; images without dimensions are decoded as before.
   - Missing/changed assets stay placeholders and must not be requested.
4. **Tests.**
   - Add a focused test/assertion that a document image with intrinsic dimensions does not issue an
     asset request during page measurement (or that the image UI suites produce no page errors after
     a valid image insert/quit/reload).
   - Re-run at least:
     - `node --test tests/ui/m3c3b1-image.test.mjs`
     - `node --test tests/ui/m3c3b2-image-anchors.test.mjs`
     - `node --test tests/ui/m3c3b3-image-integrity.test.mjs`
     - `node --test tests/ui/m3c3b4-image-lifecycle.test.mjs`
     - `node --test tests/ui/m4b1c-continuous-markers.test.mjs`
   - The suite `after` pageErrors assertions must be green; report if the Node test runner still
     exits 0 on a hook failure (known harness issue, do not change the harness in this slice unless a
     one-line `process.exitCode` fix is clearly safe).
5. **No scope creep.** No Page Edit, markers changes, PDF, image pipeline, or spec/UX/ADR/plan edits.

## Gates

- `npm run check:boundaries`
- `npm run typecheck`
- targeted vitest
- `npm test`
- the image UI suites above
- `npm run test:ui`
- `npm run test:recovery:run`
- `npm run e2e:critical`
- one `npm run verify:fast` at the end

## Deliverable

Report `docs/reports/m4b1c1-page-image-preload.md`: worktree/branch/base/commit, which images are
preloaded, abort behavior, before/after pageErrors, tests/timings, risks, not verified. Do not merge
or push. Stop and ask if skipping image preload changes measured width/height for an image without
intrinsic dimensions.
