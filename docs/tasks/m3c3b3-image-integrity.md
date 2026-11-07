# M3c3b3 — image integrity, legacy src policy, protocol hardening

**Role:** Implementer / Builder  
**Milestone:** M3c3b — image pipeline/anchor fixes  
**Base:** current `main` after M3c3b2 (`7c8cdd7`, docs `d965289`)  
**Worktree:** isolated builder worktree prepared by orchestrator v2  
**Scope:** Sentinel S2-1/S2-2/S2-3, S3-1/S3-2, native-picker dimensions, region outline. No M4,
crop editor, cross-document paste, multi-image action routing, or asset GC.

## Product decisions (ratified)

- **Missing asset file** with a present record is a broken image anchor (`asset-missing`), not
  resolved. The placeholder, health warning, branch/target/alt, and export lost-marker path must all
  agree.
- **Hash verification**: verify once per open session (cache the verified result); re-verify on
  reload/external modification. A SHA-256 mismatch under `assets/<id>` is `asset-changed` and must
  not be served as the new image; show the placeholder and a broken anchor. Stale width/height must
  not be used.
- **Legacy `src` policy**: M2 had no image insertion, so a canonical image with `src` but no
  `assetId` is unsupported. Drop it to the labeled missing placeholder; never pass `file:`, `data:`,
  or remote `src` to `<img>`. Preserve alt/content; no arbitrary local file access.
- **Native-picker dimensions**: decode/store intrinsic width/height at import time so M4 layout/PDF
  does not fall back to estimator defaults.
- **Region selected state**: outline only — no gray fill over the image.
- **Callout alignment**: keep the current rule (align to anchor left edge, cap offset at 160, width
  is remaining lane width). Document why region/point callouts differ in x/width; do not change it in
  this slice.

## Required work

1. **Asset integrity/availability**
   - Add a Node-side verified asset read (hash check) and an availability result used by the
     protocol, runtime/health, and export marker path. Missing record/file and hash mismatch are
     typed, distinct reasons.
   - Cache successful verification per open session; invalidate/re-check on reload and external
     modification. Do not hash every `<img>` request.
   - The asset protocol returns no bytes for missing/mismatched assets (404/typed error) and the
     renderer shows the placeholder; protocol MIME is allow-listed to image types, symlinks and
     package escape rejected, `nosniff`/no-store preserved.
   - Image anchor resolution/health must become `asset-missing`/`asset-changed` when the record/file/
     hash is bad, without deleting branch/target/alt. Add app health/placeholder/undo tests.
2. **Legacy src**
   - Projection/validation drops `src`-only images to placeholder, preserving alt. Add a load fixture
     and UI test proving `file:///...` never reaches `<img>` and no file is read.
3. **Native picker dimensions**
   - Decode intrinsic width/height on picker import (Electron nativeImage or a safe image-header
     reader), store them on the asset/image node. Test PNG/JPEG and malformed file handling.
4. **Region outline**
   - Remove `background: var(--accent-soft)` from selected/hover `.nf-image-region-outline`; keep the
     accent border and marker selected state. Update transition; screenshot.
5. **Fixtures/tests**
   - Add the AC-57 image fixture matrix (two regions, shared asset, resize, replacement, missing) and
     protocol handler tests (missing record/file, hash mismatch, MIME, symlink/directory escape).
   - Update docs: callout alignment rule, legacy-src policy, hash/missing semantics.
   - Full gates: check:boundaries, typecheck, targeted vitest, npm test, test:ui, e2e:critical,
     recovery, verify:fast.

## Explicit non-goals

- Full region re-pick repair, crop editor, asset GC, cross-document copy/paste, multiple-image action
  routing, M4 page/PDF. Those are M3c3b4/M4 follow-ups.
- No new runtime dependency unless strictly required; no schema bump beyond existing fields.

## Deliverable

Report: worktree path, branch, base, commit, files, integrity/availability API, legacy-src behavior,
dimension decode, region style, fixture/protocol tests, screenshots, risks, not verified. Do not
merge or push. Stop and ask if a policy cannot be implemented without changing the canonical format
or asset protocol contract.
