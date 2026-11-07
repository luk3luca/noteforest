# M3c3b5 — asset store confinement and corrupt-dedupe fix

**Role:** Implementer / Builder
**Milestone:** M3c3b — image integrity follow-up
**Base:** current `main` after M3c3b re-review integration
**Worktree:** isolated builder worktree prepared by orchestrator v2
**Scope:** fix the new S2-1 symlink escape and S3-2 corrupt dedupe from
`docs/reviews/m3c3b-re-review.md`. No UI, PDF, AVIF, anchor, or resize work.

## Why this is urgent

The re-review found that `NodeAssetStore` only `lstat`s the final asset file. It does not confine the
`assets/` directory itself. A crafted package whose `assets` entry is a symlink to an outside
directory can make NoteForest:

- read asset bytes from outside the source package (`read`/`readVerified`/`availability`);
- write a user's imported or pasted image outside the destination package
  (`insert`, used by `importImageFile`, `importImageBytes`, and `copyImageAsset`).

This is an S2 privacy/data-confinement issue. Fix it before M4c/PDF or M4d image acceptance.

Read:

- `docs/reviews/m3c3b-re-review.md` (S2-1, S3-2)
- `packages/core/src/node/assets.ts`
- `apps/desktop/src/main/library.ts` (`copyImageAsset`, `importImageFile`, `importImageBytes`,
  `resolveStoreAsset`, `resolveOpenAsset`)
- `packages/core/test/asset-store.test.ts`, `apps/desktop/test/asset-integrity.test.ts`,
  `apps/desktop/test/asset-protocol.test.ts`
- `docs/reports/m3c3b3-image-integrity.md` (earlier policy)

## Required behavior

1. **Package confinement for every store operation.**
   - Add one async resolver used by `has`, `read`, `readVerified`, `availability`, and `insert`:
     resolve `realpath(packagePath)` and `realpath(packagePath/assets)`, require the assets real path
     to be inside the package real path, and reject a symlinked `assets/` directory (`lstat` +
     `isSymbolicLink`) even when its target happens to be inside the package.
   - Use the resolved real assets directory for the actual file path (`path.join(realAssets, id)`),
     not the lexical `path.join(packagePath, 'assets', id)`.
   - Reject a final asset file that is not a regular file (existing `lstat` rule) and, if the
     platform exposes it, reject a final symlink. A read failure due to confinement is a typed
     `asset-missing` / `unreadable`; a write failure is `io-error`. Do not throw.
   - `insert` must create/validate the directory before opening a temp file, write the temp file in
     the real assets directory, and rename atomically. Re-check confinement after `mkdir`; do not
     write through a symlink.
   - Keep the per-session verified/availability caches, but never let a cache bypass the directory
     confinement check on a read. A symlink swapped in after verification must not serve bytes.
2. **`copyImageAsset` and imports.**
   - Ensure the source and destination stores both use the confined resolver. The source store is
     constructed in `copyImageAsset`; destination insert goes through the target store.
   - If the source or destination `assets/` is a symlink or escapes, the operation returns a typed
     failure and writes nothing.
   - Apply the same guarantee to `importImageFile`/`importImageBytes` (they share the store).
3. **S3-2 corrupt dedupe.**
   - In `insert`, when the target file exists, read it and hash it before returning
     `created: false`.
   - If the hash matches the id, return the deduplicated record.
   - If it does not match, replace the file atomically with the supplied bytes (temp + rename) and
     return a successful result with `created: true` for the repaired file. The record must describe
     the bytes that are now on disk. If the replacement fails, return `io-error`.
   - A corrupt existing file must never be reported as a successful dedupe.
4. **No behavior change outside these cases.** Missing/unreadable/changed semantics, availability
   mapping, verified cache, MIME handling, and protocol responses stay as they are.
5. **Tests.**
   - Unit tests in `packages/core/test/asset-store.test.ts` (or a focused new file) with real temp
     packages:
     - normal read/write still works;
     - symlinked `assets/` to an outside directory: `has` false, `read`/`readVerified` typed failure,
       `availability` `asset-missing`, `insert` typed `io-error`, and no file created outside;
     - symlinked final asset file: not served;
     - corrupt existing file under `assets/<id>`: `insert` repairs it, `created: true`, bytes hash to
       the id, and a second insert dedupes with `created: false`.
   - Main-process test for `copyImageAsset` with a symlinked source `assets/` and a symlinked
     destination `assets/`: both fail, no bytes written outside, no record recorded. Use temp
     packages and the existing test harness; no native dialogs.
   - If a test needs a symlink, skip only on platforms without symlink support and say so; macOS is
     the target.
6. **Docs.** Add a short note to `docs/reports/m3c3b5-asset-confinement.md` describing the resolver,
   the reject-symlink policy, dedupe repair, tests and residual TOCTOU risk. Do not change
   spec/UX/ADR/plan.

## Gates

- `npm run check:boundaries`
- `npm run typecheck`
- targeted vitest while working
- `npm test`
- `npm run test:ui` (should be unchanged; report if any UI assertion depends on store behavior)
- `npm run test:recovery:run`
- `npm run e2e:critical`
- one `npm run verify:fast` at the end

## Guardrails

- No new runtime dependency.
- Do not touch AVIF dimensions, `unavailable` cleanup, missing-asset action gating, page view, PDF,
  reader, anchors, or resize; those are M3c3b6/M4.
- Do not weaken the existing protocol realpath checks; reuse the same containment rule.
- Do not merge or push.

## Deliverable

Report worktree/branch/base/commit, resolver design, read/write/dedupe behavior, symlink and corrupt
tests, timings, residual risks (including TOCTOU), and not verified. Stop and ask if confinement
would break a legitimate package layout or if `created` semantics need a product/API decision.
