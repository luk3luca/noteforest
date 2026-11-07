# M3c3b5 — asset store confinement and corrupt-dedupe repair

**Status:** Builder complete in worktree; not merged or pushed.
**Branch:** `t3/builder/m3c3b5-asset-confinement`
**Base:** `dc3ba4e` (`docs: launch M3c3b5 asset confinement`)
**Implementation commit:** `8696e32` (`fix: confine asset store reads and writes (M3c3b5)`)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-da2ed6f5`

## Summary

- Every `NodeAssetStore` operation (`has`, `read`, `readVerified`, `availability`, `insert`) now
  resolves the real package root and the real `assets/` entry first. The assets root must stay
  strictly inside the package root.
- A symlinked `assets/` entry is rejected even when its target is inside the package. The store uses
  the resolved real assets directory for file operations, never the lexical
  `<package>/assets/<id>` path.
- Final asset files must be regular, non-symlink files. Symlinked, directory, and unreadable final
  entries are never served; reads return typed `missing`/`unreadable` and writes return `io-error`.
- `insert` validates/creates the directory, re-checks it after `mkdir`, writes its temp file in the
  resolved real directory, and renames atomically. It never opens the target path directly, so it
  never writes through a symlink.
- `copyImageAsset`, `importImageFile`, and `importImageBytes` inherit the guarantee through the source
  store and target store. A symlinked source or destination `assets/` returns `ok: false`; no asset
  bytes or records are written outside the destination package.
- S3-2 is fixed: an existing `assets/<id>` is read and hashed before deduplication. Matching bytes
  return `created: false`; mismatching bytes are repaired atomically and return `created: true`;
  repair failure is a typed `io-error`. A corrupt file can no longer be reported as a dedupe.
- Missing/unreadable/changed semantics, availability mapping, MIME handling, protocol responses, and
  the per-session verified/availability caches are preserved. Directory confinement is checked on
  every read, so a cache cannot serve bytes after the package layout changes.

## Resolver design

`packages/core/src/node/assets.ts` adds one private resolver, used by all store operations:

```text
resolveAssetsDirectory(create):
  packageRoot = realpath(packagePath)                  // must exist
  lexical     = packageRoot/assets
  lstat(lexical):
    missing  -> create? mkdir(recursive) : missing
    symlink  -> reject (even when the target is inside)
    non-dir  -> reject
  re-lstat(lexical) after mkdir                        // catches a raced-in symlink
  assetsRoot = realpath(lexical)
  require assetsRoot strictly inside packageRoot
  return { packageRoot, assetsRoot }
```

File paths are then built as `path.join(assetsRoot, id)`. The resolver never throws; failures are
`missing` or `unreadable`, which `read`/`readVerified` return as typed results and `insert` maps to
`io-error`. Confinement failures are not written into the availability cache, so a repaired package
can recover without a reload; ordinary availability results remain cached.

The final file rule is unchanged and explicit: `lstat` must report a regular file and not a symlink.
The protocol resolver in `apps/desktop/src/main/library.ts` keeps its own realpath checks and now
delegates to the confined store, so it cannot read a file the store would reject.

## Read, write, and dedupe behavior

- `has`: false for a missing/symlinked `assets/` directory, a missing file, a symlink, or a directory.
- `read` / `readVerified`: resolve the directory, `lstat` the final file, reject symlink/non-regular,
  then read. `readVerified` still hashes once per store session; `invalidate` forces a re-check.
- `availability`: runs the directory resolver even when a cached result exists. A broken package is
  `asset-missing` (`file-missing` or `unreadable`); a record-less id is still `record-missing`.
- `insert`:
  1. resolve/create the directory and use its real path;
  2. `lstat` an existing target; a symlink/non-regular entry is `io-error`;
  3. read and hash a regular existing file: match -> `created: false`; mismatch -> repair;
  4. write `.<id>.<random>.tmp` with `wx` in the real directory, sync, close, rename;
  5. clean the temp file on failure; if a concurrent writer produced matching bytes, dedupe
     (`created: false`); otherwise `io-error`.
- The returned record for a repair describes the supplied bytes that are now on disk. `created`
  semantics are unchanged: true for a new or repaired file, false only for verified identical bytes.

## Tests

Core, real temporary packages (`packages/core/test/asset-store.test.ts`):

- normal insert/read/readVerified and identical-byte dedupe;
- symlinked `assets/` to an outside directory: `has` false, `read`/`readVerified` typed
  `unreadable`, `availability` `asset-missing`/`unreadable`, `insert` `io-error`, outside directory
  unchanged, no temp file created;
- symlinked `assets/` whose target is inside the package: same rejection;
- symlinked final asset file: `has` false, reads `unreadable`, `availability`
  `asset-missing`/`unreadable`, `insert` `io-error`, symlink and outside bytes untouched;
- corrupt file under the content address: `insert` repairs it with `created: true`, bytes hash to
  the id, `readVerified`/`availability` succeed, and a second insert dedupes with `created: false`.

Main process, real packages and the existing library harness
(`apps/desktop/test/asset-confinement.test.ts`):

- normal `copyImageAsset` writes verified bytes into the destination;
- symlinked source `assets/`: copy fails, destination has no asset file or record, outside source
  directory is unchanged;
- symlinked destination `assets/`: copy fails, nothing is created outside, target document gains no
  record;
- corrupt destination file: copy repairs the bytes, and a second copy dedupes;
- `importImageBytes` with a symlinked destination `assets/`: fails with no outside write and no
  record.

Symlink tests skip only when the platform denies symlink creation (some Windows configurations);
macOS is the target platform.

## Checks run

| Check | Result |
|---|---|
| `npm run check:boundaries` | pass — 130 files, 606 imports, 16 rules, 0 violations |
| `npm run typecheck` | pass — desktop node/web, core, layout, pdf |
| Targeted vitest (asset-store, asset-gc, asset-integrity, asset-protocol, asset-confinement) | 5 files / 41 tests pass, 1.27 s |
| `npm test` | 69 files / 726 tests pass, 2.59 s |
| `npm run test:ui` | pass — full suite exit 0; image integrity 4/4 (18.5 s), image lifecycle 3/3 (22.9 s) |
| `npm run test:recovery:run` | 14/14 pass, 17.7 s |
| `npm run e2e:critical` | 16/16 pass, 44.1 s |
| `npm run verify:fast` | pass, 51.81 s real (boundaries, typecheck, 726 unit tests, build + 16/16 e2e) |

## Residual risks

1. **TOCTOU.** Node has no `openat`-style directory handle. An attacker with write access to the
   package can still rename `assets/` or the final file between the resolver/lstat check and the
   `readFile`, temp open, or rename. Reads have a narrow `lstat` -> `readFile` window. Writes never
   open the target path directly: the temp file is created with `wx` in the resolved real directory
   and `rename` replaces the directory entry, so a final symlink is not followed. The directory-swap
   window is the remaining risk and is the same class already documented for the protocol resolver.
2. **Package root symlinks are allowed.** The real package path is the trust root. A package path
   that is itself a symlink is accepted as long as `assets/` resolves strictly inside its real
   target; this matches the requirement to resolve `realpath(packagePath)`.
3. **Symlinked `assets/` is a hard rejection.** The resolver does not try to repair or follow a
   symlinked layout. A legitimate package must use a real `assets/` directory, which is what
   `createDocumentPackage` writes.
4. **Session caches.** Verified bytes are still trusted for the store lifetime by design;
   `invalidate` and reload are the re-check points. Directory confinement itself is never cached.
5. **Missing package root.** `insert` requires the package directory to exist because confinement
   starts from `realpath(packagePath)`. Existing callers create the package first; a missing package
   is now `io-error` instead of recursively creating a new package folder.
6. **Concurrent writers.** Two identical inserts can both report `created: true` (same bytes, same
   content address). This matches the existing content-addressed race policy and is harmless.

## Not verified

- Real OS image picker, Finder drag/drop, and real clipboard image paste (no UI changes here; the UI
  suites use the required dialog guard).
- Windows symlink behavior (tests skip only when symlink creation is denied).
- A live racing attacker between `realpath`/`lstat` and the final read/rename; the deterministic
  symlink cases are covered.
- AVIF, `unavailable` cleanup, missing-asset action gating, page view, PDF, reader, anchors, and
  resize (explicitly out of scope; M3c3b6/M4).
- The combined `npm run verify` (Orchestrator integration gate) and any human visual/VoiceOver pass.

## Files changed

- `packages/core/src/node/assets.ts`
- `packages/core/test/asset-store.test.ts`
- `apps/desktop/test/asset-confinement.test.ts`
- `docs/reports/m3c3b5-asset-confinement.md`

## Open questions / next step

No product or API decision is needed: `created` semantics and the `ImportImageResult`/`AssetResult`
shapes are unchanged. The next step is Sentinel review of this confinement change, then M3c3b6 for
AVIF dimensions, stale `unavailable`, and missing-asset action gating.
