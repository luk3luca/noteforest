# M3c3b Sentinel review — image pipeline and image anchors

**Role:** Reviewer / Sentinel (independent)  
**Milestone:** M3c3b — deferred AC-21 image pipeline and anchors  
**Base:** current `main` after M3c3b1/M3c3b2 (`7c8cdd7`, docs `3fa2218`)  
**Worktree:** fresh review worktree from `main`  
**Scope:** image pipeline/rendering and image anchors only. No product code changes.

## Context

M3 was accepted with AC-21/image AC-57 deferred to M3c3b. M3c3b1 (asset store, protocol, insertion,
rendering, missing placeholder) and M3c3b2 (region/point anchors, normalized geometry, markers,
asset-change broken state) are now merged. Review them before M4 relies on the asset protocol and
image dimensions.

Read first:
- `AGENTS.md`, `docs/plan.md`, `docs/spec.md` §8.10/§15 (AC-21/AC-54/AC-57), `docs/ux.md` image flow,
  `docs/design/m3-anchors-references.md` image sections.
- `docs/reports/m3c3b1-image-pipeline.md`, `docs/reports/m3c3b2-image-anchors.md`, M3i closure.
- `docs/review-checklist.md`, `docs/definition-of-done.md`.

## Mandatory checks

1. **Asset/protocol security**
   - `noteforest-asset://` resolves only a live document’s recorded asset id; no arbitrary path,
     traversal, symlink, or package escape.
   - CSP/`img-src` covers the scheme; MIME/nosniff/no-store behavior is correct.
   - `NodeAssetStore` hash/dedupe/atomic insert, missing/unreadable results, package confinement,
     symlink rejection; no network/remote URL path.
2. **Image insertion/rendering**
   - Block menu/palette/paste/drop path copies bytes into package assets before insert; canonical
     image shape has `assetId`/alt, no display paths/pixels.
   - Missing asset record/file shows the placeholder and never deletes branches/targets/alt.
   - Save/reload and undo/redo behavior; asset records left after undo (GC follow-up) is correct.
   - Native-picker images lack intrinsic width/height: assess the M4 layout/PDF risk.
3. **Image anchors**
   - Region/point authoring, normalized 0–1 intrinsic rect, crop full, point zero-size invariant,
     sorted deterministic `anchorIds`, multiple regions, cancel/no mutation, one undo.
   - Markers numbered/keyboard reachable, callouts/branches through the existing lane, resize 1440/960,
     zoom, save/reload.
   - Asset replacement/missing → `asset-changed`/`asset-missing` broken state, branch/target/alt
     preserved; health attach/delete/keep-broken works; no silent auto-reattach.
4. **AC-21/AC-57 acceptance**
   - State explicitly whether AC-21 and the image rows of AC-57 are delivered, partially delivered, or
     still blocked. Distinguish required behavior from follow-ups (crop editor, full region re-pick
     repair, asset GC).
5. **Tests/regressions**
   - Check the new unit/UI/e2e coverage and full gate timings; no skipped/weakened tests, fixed sleeps,
     or native-dialog waits.
   - Confirm M2/M3 critical flows, save/recovery, and M4 prerequisites are not regressed.
6. **Process/evidence**
   - Builder reports and screenshots; note any evidence gaps, e.g. missing-asset screenshot framing.
   - Check whether the custom protocol or image schema needs an ADR/product decision before M4.

## Deliverable

`docs/reviews/m3c3b-review.md` in English:

- verdict (accept / accept with minor / request changes);
- per-area table (security, insertion/rendering, anchors, broken state, AC-21/AC-57);
- new findings ranked S1–S4 with file:line and repro;
- test inventory/timings and what was not verified;
- residual gaps and product decisions;
- explicit statement whether M4 may start, and any prerequisite/guard for images in M4/PDF.

No product code, tests, spec, UX, ADR, or plan changes. You may update
`docs/review-checklist.md`/`docs/definition-of-done.md` phase notes if the gate changes.

## Stop and ask

Stop if the custom protocol, schema shape, asset replacement semantics, or crop/repair scope needs a
product/architecture decision. Do not invent a crop editor or asset GC in this review.
