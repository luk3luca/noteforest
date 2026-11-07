# M3c3b4 — image UX and asset lifecycle follow-ups

**Role:** Implementer / Builder  
**Milestone:** M3c3b — image pipeline/anchor fixes  
**Base:** current `main` after M3c3b3 integration (expected next)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** Sentinel S3-3/S3-4 and S4-1/S4-2 image follow-ups. No M4/PDF, crop editor, or full
region re-pick.

## Required work

1. **Multi-image blocks**
   - Block-menu/palette image actions (Add region, Add point, Replace image, Edit alt) must target
     the image the user is acting on, not always the first image in the block.
   - Add a clear per-image action surface (selected image node or a small image action menu) and tests
     with two images in one block; the correct `nodePath`/asset must be used.
2. **Cross-document copy/paste**
   - Copying/pasting an image between documents must copy the asset bytes/record into the destination
     package (or show a placeholder and not keep a dangling `assetId`); never keep an `assetId` that
     resolves only in another package.
   - Define the clipboard payload (canonical image + asset bytes or a safe placeholder) and test
     same-document and cross-document paste. No remote/data/file references.
3. **Marker numbering**
   - Number visible image markers deterministically by spatial/creation order and do not skip numbers
     because an idle anchor is excluded; if idle anchors are hidden, visible markers remain 1..N
     without gaps.
4. **Asset lifecycle**
   - Define and implement the `asset.remove` reference guard and asset GC policy: removing an asset
     must not silently break live anchors; unreferenced assets are reclaimable; backup/restore must
     not resurrect dangling records. Keep it local and deterministic.
   - Document the policy and add tests. If GC needs a product decision, stop and report options.
5. **Docs/tests**
   - Update image docs/coverage matrix; screenshots for multi-image action target and cross-document
     paste.
   - Gates: check:boundaries, typecheck, targeted vitest, npm test, test:ui, e2e:critical, recovery,
     verify:fast.

## Guardrails

- No new runtime dependency.
- No M4/PDF/crop/region re-pick work.
- Keep canonical images asset-backed and package-local.
- Do not weaken asset hash/missing behavior from M3c3b3.

## Deliverable

Report: worktree path, branch, base, commit, files, clipboard/asset GC design, tests/timings,
screenshots, risks, not verified. Do not merge or push. Stop and ask if asset GC or cross-document
clipboard needs a product decision.
