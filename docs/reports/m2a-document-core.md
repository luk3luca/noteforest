# M2a — Document core + local persistence (report)

**Date:** 3 November 2026  
**Builder worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-a7829c9f`  
**Branch:** `t3/a7829c9f`  
**Status:** Complete; all gates pass. Integration and merge belong to the Orchestrator.

## What was built

`packages/core` is a dependency-free TypeScript package with two entrypoints:

| Entrypoint | Modules | Environment |
|---|---|---|
| `@noteforest/core` | `types`, `ids`, `document`, `validation`, `serialize`, `commands`, `history`, `structure`, `fractional-order`, `errors` | pure TypeScript; no Node, DOM, React, TipTap, layout, or PDF |
| `@noteforest/core/node` | `store`, `atomic`, `backups`, `lock`, `recent`, `recovery`, `paths` | Node built-ins only |

### Model

- Canonical document/chapter/block/page-setup/asset/view-state types from spec §4.
- The block tree is stored as canonical **primary branch** records (`role: "primary"`), not a
  second `parentId` field. Chapters own roots; every non-root block has exactly one incoming
  primary branch.
- Branch records have `id`, source block, target block, role, fractional `order`, optional label.
- IDs are UUID v4 (`crypto.randomUUID`), opaque and never reused. Tests inject deterministic
  factories.
- Unknown fields at every level and unknown content nodes/marks are preserved on load and save.
- A ProseMirror-shaped content subset (`type`, `attrs`, `text`, `marks`, `children`) is canonical,
  matching the spec’s illustrative schema.

### Commands

One mutation path: `executeCommand` (pure) or `DocumentStore.apply` (Node store). Each command
validates preconditions, applies to a deep clone, re-validates the result, and returns either a
typed failure or `{ document, revision, affected, inverse, warnings }`.

Implemented: `document.create/rename`, `chapter.create/rename/reorder/delete`,
`block.create/editContent/rename/delete/move`, `branch.create/delete/reorder/relabel`.

- `block.create` placements: top-level, child, sibling (before/after).
- `block.delete`: promote children (default-safe) or delete subtree.
- `block.move`: reparent, reorder, or move to top level; cycle/descendant moves rejected.
- `branch.create`: attach an existing root as a primary child.
- `branch.delete`: target becomes top-level, or its subtree is deleted (explicit choice).
- `branch.reorder`: sibling arrow order; IDs/content unchanged.
- `DocumentHistory`: session-only snapshot undo/redo; exact for destructive deletes including
  branch identities. Undo/redo advance revision monotonically.

### Persistence (Node)

- Package layout: `<library>/<slug>/document.json` + `assets/`.
- Atomic save: temp file in the package directory → write → `fsync` → rename → best-effort
  directory fsync. On in-process failure the temp file is removed and the previous
  `document.json` stays byte-identical.
- Backups live outside the package in `<appSupport>/backups/<package-path-hash>/`:
  autosave before each successful save (default 20, minimum 10), one daily snapshot (7),
  manual/pre-migration snapshots (7 days for pre-migration).
- Single-writer lock in `<appSupport>/locks/<package-path-hash>.lock` (PID, host, session, token,
  heartbeat). Readers never lock. Stale recovery is explicit via `breakStaleLock: true`.
- Corrupt, invalid, newer-schema, or locked documents open read-only with typed errors; the
  canonical file is never overwritten. A newer schema is never downgraded.
- External modification detected by SHA-256 before save; overwrite requires
  `{ overwriteExternal: true }`.
- Recent-documents manifest in app support, atomic and deduplicated.
- Recovery inspection lists orphan temp files, backups, and the canonical file with validity,
  revision, block count, title, and timestamp. Restore writes a new copy unless overwrite is
  explicitly requested, and can copy content-addressed assets from the original package.

### Harness

`packages/core/harness/run.ts` creates a package, adds top-level blocks plus a primary child
arrow with a label, edits content, saves twice, reopens read-only, prints the persisted arrow,
corrupts `document.json`, shows the typed read-only failure, finds the newest valid backup, and
restores it into a new package copy.

## Gate matrix

Commands: `npm test` (root), `npx vitest run packages/core`, `npm run typecheck`,
`npm run build -w @noteforest/core`, `node packages/core/dist/harness/run.js`.

| # | Gate | Evidence | Result |
|---|---|---|---|
| 1 | Create → edit → save → reopen round-trip; content/structure preserved | `storage.test.ts` “creates the package layout and reopens the same document”; full document equality | Pass |
| 2 | Unknown fields/content nodes survive round-trip and mutation | `model.test.ts` unknown-data tests; `storage.test.ts` save/reopen unknown test | Pass |
| 3 | Duplicate IDs rejected with typed errors | `model.test.ts` duplicate-ID test; `commands.test.ts` duplicate block ID | Pass |
| 4 | Dangling source/target rejected | `model.test.ts` dangling parent/target tests | Pass |
| 5 | Primary cycles rejected | `model.test.ts` cycle test; `commands.test.ts` move/branch cycle rejection | Pass |
| 6 | Block in two chapters rejected | `model.test.ts` two-chapter test | Pass |
| 7 | Promote vs subtree delete; no dangling refs | `commands.test.ts` three deletion tests; post-state validated | Pass |
| 8 | Reorder/reparent changes order only, not IDs/content | `commands.test.ts` reparent/reorder/sibling tests | Pass |
| 9 | Primary child → arrow data; reparent; reorder; delete edge; one-parent invariant | `commands.test.ts` primary branch suite; round-trip of branches | Pass |
| 10 | Atomic save failure keeps previous bytes; no temp files | `storage.test.ts` injected `beforeRename` failure | Pass |
| 11 | Backup rotation keeps ≥10 versions | `storage.test.ts` 15 saves with `autosaveMax: 10` → 10 | Pass |
| 12 | Corrupt newest file recovery | `storage.test.ts` corrupt → read-only → restore newest backup → reopen; canonical bytes untouched | Pass |
| 13 | Newer schema read-only, never overwritten | `storage.test.ts` schemaVersion 2 test | Pass |
| 14 | Lock conflicts, concurrent reads, release, stale recovery | `storage.test.ts` lock suite | Pass |
| 15 | 300-block save/load performance reported | `storage.test.ts` 320 blocks (300 top-level + 20 children) | Pass |
| 16 | Harness demonstrates save/reopen + corrupt recovery | harness output below | Pass |
| 17 | No UI/React/TipTap/layout/PDF in core | import boundary + package contents | Pass |

## Test results

```
$ npx vitest run packages/core
Test Files  4 passed (4)
Tests       78 passed (78)
Duration    1.27 s

$ npm test                     # root, includes layout + core
Test Files  6 passed (6)
Tests       92 passed (92)
Duration    1.26 s

$ npm run typecheck            # all workspaces
@noteforest/desktop, core, layout, pdf: pass

$ npm run build -w @noteforest/core
pass
```

### Performance (320 blocks: 300 top-level + 20 children)

Measured with `performance.now()` in `storage.test.ts` on the local Mac (APFS temp dir):

| Operation | Time |
|---|---|
| `save()` (JSON serialize + backup + atomic write + rotate) | **≈25–26 ms** |
| Cold `openDocumentPackage(read)` (read + parse + validate) | **≈0.8–0.9 ms** |
| Warm open | **≈0.7 ms** |

The harness (small 4-block document) reported about 31–32 ms for the first save (includes creating the
first autosave + daily snapshot), about 8.6–8.8 ms for reopen. These are single-run numbers, not a benchmark;
no budget was set for M2.

### Harness output (abridged)

```
[harness] created …/library/eigenvalues (revision 0)
[harness] saved revision 5 in 31.1 ms (2736 bytes, backup …)
[harness] saved revision 6 (backup …)
[harness] reopened read-only: 4 blocks, 1 primary branch(es), revision 6 in 8.6 ms
[harness] arrow …: Eigenvalues → Eigenvector (primary, "has eigenvector")
[harness] opening corrupt file: read-only (corrupt), error malformed-json
[harness] recovery candidates: autosave:valid, daily:valid, autosave:valid, canonical:invalid
[harness] newest valid backup: autosave revision 5, 3 blocks
[harness] restored a new copy at …/library/recovered-copy
[harness] recovered copy: 3 blocks, revision 5
[harness] OK: create → edit → save → reopen → corrupt recovery
```

## Findings and interpretation

1. **Primary branches had to become the M2 tree representation.** The original brief said
   `branches` is an empty map while also requiring parent/child validation and promote/reparent
   tests; those requirements can only be met by canonical primary branch records. The product
   owner’s 3 November scope update confirmed primary branches in M2a. Reference and anchor
   branches remain schema-compatible but have no commands.
2. **Revision semantics.** Commands increment `revision` once per committed **transaction**
   (spec §4.2); save persists it and clamps it so it never decreases. The brief’s line “revision
   increments once per committed save” is read as “one or more commands are persisted per save,
   and revision never moves backwards.” A save with no changes is a no-op. If the Orchestrator
   wants one revision step per save regardless of command count, that is a small change but
   conflicts with `baseRevision` optimistic concurrency in ADR-0003.
3. **Content shape.** The canonical subtree uses `children` (spec §4.11 and the layout package),
   while real ProseMirror uses `content`. The editor adapter will need to translate at the TipTap
   boundary; core deliberately does not depend on ProseMirror. This should be frozen before M3.
4. **Backups are pre-save snapshots.** The newest backup is the version **before** the last save.
   Recovering a corrupt canonical file therefore loses the last save; crash recovery should also
   offer an orphan temp file (implemented) and the canonical file. The harness shows a 4-block
   document recovering to the 3-block previous version. This matches spec §10.4 but is worth
   surfacing in the recovery UI with timestamps and a preview.
5. **Backups are keyed by package path hash, not document ID.** A corrupt `document.json` cannot
   reveal its document ID, so a path-keyed directory is the only way recovery can find backups.
   Moving the package folder orphans its backup history; acceptable for M2, worth documenting in
   the shell UI.
6. **Strict validation, no auto-repair.** The spec allows warning-level repair for missing
   top-level assignment or stale view state. The brief requires rejection, so load is strict
   (fatal → read-only), with one safe normalization: a missing optional
   `manualBreakBeforeBlockIds` list becomes `[]`. View state is preserved but not validated or
   repaired in M2.
7. **Anchors are forward-compatible but not fully M3-safe.** Anchors and anchored primary
   branches validate and round-trip. Deleting a block with anchored children retargets those
   branches to the parent and drops the anchor binding (a sensible fallback, but M3 must own the
   real anchor lifecycle). `block.move` rejects anchored children.
8. **Chapter deletion semantics were unspecified.** Implemented three explicit modes:
   `reject-if-not-empty`, `move-to-chapter`, `delete-blocks`. The last chapter cannot be deleted.
9. **`annotations` is optional on load.** The spec marks it required and empty in v1; the brief
   omitted it. Created documents include `[]`, unknown annotation data is preserved, but loading a
   v1 file without the field is tolerated.
10. **No migration runner yet.** `schemaVersion` is 1; newer files open read-only. The
    pre-migration snapshot hook exists (`store.createBackup('pre-migration')`), but there are no
    migrations to trigger it. The migration matrix in spec §10.6 belongs to the first schema
    change.
11. **No autosave loop in core.** The store exposes atomic `save()`; debounce/interval, save
    status, and close prompts belong to the editor shell. This keeps core deterministic.
12. **Move index convention.** `block.move` / `block.create` `atIndex` is the destination index
    **excluding the moved block** (after its detach). The editor adapter must follow this to avoid
    off-by-one errors; it is exercised by the reorder tests.
13. **External edits are detected by content hash**, not mtime. This is stricter and avoids
    filesystem timestamp granularity issues.
14. **The lock is an exclusive-create lock file, not a kernel advisory lock.** This matches the
    M2 brief (“simple lock file”) and prevents two app instances from writing, but ADR-0003’s
    OS advisory lock should be added when the external API lands in M5.

## Open questions for the Orchestrator / product owner

1. Freeze the content wire shape (`children` vs ProseMirror `content`) before the TipTap adapter.
2. Confirm the revision interpretation above (command transaction vs save count).
3. Should a corrupt-file recovery ever auto-open the newest backup, or always require the user?
   Spec says never auto-open; the harness restores explicitly to a new copy.
4. Should `chapter.delete` keep all three modes, or does the shell expose only “move blocks” and
   “delete blocks”?
5. Backup retention for pre-migration snapshots: “until post-migration save + 7 days” is
   currently simplified to 7 days; confirm when migrations land.
6. Should M2a lint/prettier be added at the repo level? No formatter is configured in this
   worktree.

## Files changed

- `packages/core/package.json`, `tsconfig.json`, `tsconfig.build.json`, `README.md`
- `packages/core/src/{types,ids,errors,document,validation,serialize,structure,fractional-order,commands,history,index}.ts`
- `packages/core/src/node/{atomic,paths,lock,backups,recent,store,recovery,index}.ts`
- `packages/core/test/{helpers,model,commands,serialize,storage}.test.ts`
- `packages/core/harness/run.ts`
- `docs/tasks/m2a-document-core.md` (scope update for primary branches)
- `docs/reports/m2a-document-core.md` (this report)
- Root `package.json` (add `packages/core` workspace), `tsconfig.base.json` (paths),
  `package-lock.json`

## Exact commands run

```bash
npm install --no-audit --no-fund
npm run typecheck -w @noteforest/core
npx vitest run packages/core --reporter=verbose
npm run build -w @noteforest/core
node packages/core/dist/harness/run.js --keep
npm run typecheck
npm test
npm install --package-lock-only --no-audit --no-fund
```

## Next suggested step

Wire `@noteforest/core/node` into the M2 shell: a TipTap content adapter, autosave
(800 ms idle) around `store.apply` + `store.save`, save-state UI, lock/read-only banner, and
recent-document tabs. Then M3 can add span anchors and reference edges on the same command layer.
