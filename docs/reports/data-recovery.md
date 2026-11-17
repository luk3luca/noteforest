# DR1 — Unused images on Health, and `core` reasons at the boundary

**Role:** Builder
**Brief:** `docs/tasks/data-recovery.md`
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-1be17cac-877c9b0f17bfdea6`
**Base:** `main` at `895f149` (the docs commit that adds the brief)
**Status:** **part 2 delivered; part 1 stopped at the brief's stop-and-ask** (asset-byte deletion
is not implemented anywhere, and adding it is a new destructive capability).

## Summary

The batch has two independent halves. The second one — `packages/core` reasons at the boundary —
is implemented, tested, guard-covered and verified. The first one — the `Unused images` Health
section with an explicit cleanup — is **not implemented**, because the guarded path removes an
asset *record* and nothing removes an asset *file*: the brief's stop-and-ask condition
("if removing an asset's bytes is not already implemented on the guarded path") is true.

### Stop and ask: asset bytes are never deleted today

Evidence (searched the whole tree and the full git history for a delete path):

- `packages/core/src/assets.ts` — the `AssetStore` port has `has`, `read`, `insert`, `pathFor`,
  `urlFor`. No `remove`/`delete`.
- `packages/core/src/node/assets.ts` — `NodeAssetStore` only removes its own temp file after a
  failed atomic write (`fs.rm(tempPath)`). It never touches `assets/<id>`.
- `packages/core/src/commands/asset.ts` — `asset.remove` is a pure document command: it deletes
  `document.assets[id]` and returns the `asset.add` inverse. Pure commands cannot do IO.
- `apps/desktop/src/main/library.ts` — no handler unlinks an asset; the only `fs.rm(…, recursive)`
  calls are the temp/draft package cleanup.
- `git log --all -S"removeAssetBytes"`, `-S"async remove(id"` — no such commit in any branch.

So a "Clean up N unused images…" action would either delete records and leave the bytes orphaned
(worse than today: the bytes become invisible and unreclaimable) or introduce the first
destructive filesystem path in the app. The second is a product/architecture decision, not an
implementation detail, and the brief's **Out of scope** also forbids changing the asset store.

Options for the orchestrator (no code written for either):

1. **Main-side cleanup, no store change.** New IPC `deleteUnusedAssets(packagePath, ids)`:
   re-open the store, re-plan with `planAssetGc(document, { retainedAssetIds: (await
   backupAssetReferences(packagePath)).assetIds })`, intersect the caller's ids with
   `reclaimable`, apply `asset.remove` per id through the existing guarded command (the guard is
   the second line of defence), **then** unlink `assets/<id>` with the same realpath +
   containment checks `openAsset` already performs (`resolvePackageAssetPath`, realpath inside the
   package, no symlink, regular file). Return removed/failed ids, refresh the report. Records
   first, bytes second: a partial failure leaves an unused record (harmless, re-listable) rather
   than a record whose bytes are gone.
2. **Store-level `remove(id)`** in `core/node` plus the same orchestration. Cleaner layering, but
   it changes the asset store, which the brief puts out of scope.
3. **Defer the section.** Keep the follow-up open.

One more design input for whoever takes option 1: `backupAssetReferences` is Node-only, and the
Health report is a pure renderer audit (`lib/document-health.ts`). The plan therefore needs one
main-process call (e.g. `unusedAssetPlan(packagePath)`) that the section consumes; the audit stays
pure. I did not measure the scan cost (it reads and parses up to 50 backups); it is off the save
path and belongs on the report refresh, not on a keystroke. Per the brief I did not build the
section without its action, and the four audit sections are untouched (still always visible with
`0`).

## Part 2 — `core` reasons at the boundary

`packages/core` reports precisely and technically: `block "b1" does not exist`,
`document.json is not valid JSON`, `a document must keep at least one chapter`,
`asset "…" is still referenced by 1 image node (first: block "…")`. Those sentences reached three
surfaces verbatim. They are now mapped where the origin is known, with the raw sentence kept for
`Details` (the `runtime.ts` / `dialogs.md` §3 shape).

### The mapping module

`apps/desktop/src/main/core-reasons.ts` (new, pure):

- `commandRejectionText(code)` — one short line per `CommandErrorCode`; an unknown or absent code
  falls back to one generic sentence (`That change isn’t available right now.`). No code ever
  returns the raw text.
- `commandRejection(code, raw)` — `{ message, details? }`; `details` is absent when the raw is
  empty or already the short line.
- `recoveryReasonText(status)` — the recovery surface's `Reason` row, one line per status.
- `libraryRowReasonText(status, kind)` — the library row's second line, kind-aware (`note` vs
  `.md` guest file), list-line width.

The module is imported by the main process only, so the renderer never composes a technical
sentence and the distinction between a core message and a main-process message is unambiguous at
the source.

### The three boundaries

| Surface | Boundary | Result |
|---|---|---|
| Recovery `Reason` row | `library.ts` `recoveryViewFromOpen` / `recoveryViewForError` | `reason` is the short line, new `RecoveryDocumentView.reasonDetails` carries the raw core sentence |
| Library row reason | `library.ts` `documentSummaryFromRow` | `DocumentSummary.reason` is the short line, new `reasonDetails` feeds the row tooltip |
| Command rejections | `library.ts` `applyCommand` | a core rejection becomes `{ message: short, details: raw, code }`; the recovery branch does the same with its short reason |

Renderer follow-through:

- `RecoverySurface` renders the short line and one `Details` disclosure under it with the raw
  sentence (`Copy`, `role="group" aria-label="Technical details"` — the shared `Details`
  component). Retry-failure `Details` now uses the raw value.
- `Sidebar` keeps the short line in the row and the raw sentence in the row tooltip next to the
  path.
- `runtime.ts` gains `failedOutcome()`, which forwards `ApplyResult.details`, so the raw sentence
  survives every place that turns a rejected command into an outcome (19 call sites: create,
  split, merge, link, reparent, indent, outdent, reorder, delete, detach, undo, redo, …). Before
  this, those paths silently dropped the technical line.
- `runtime.mergeBlock` also stops showing the core plan sentence (`planBlockMerge`): one short
  line, the plan reason in `Details`.

No command behaviour changed: the same commands are accepted/rejected the same way, `code` is
unchanged, and only the human-facing `message`/`details` of a rejection differ. The mapping never
rewrites a main-process message it does not own (`applyCommand`'s draft/open failures keep their
own copy).

## Files changed

- `apps/desktop/src/main/core-reasons.ts` — **new**: the mapping module.
- `apps/desktop/src/main/library.ts` — the three boundaries (`recoveryViewFromOpen`,
  `recoveryViewForError`, `documentSummaryFromRow`, `applyCommand`).
- `apps/desktop/src/shared/api.ts` — additive `reasonDetails` on `DocumentSummary` and
  `RecoveryDocumentView` (IPC types, no schema/migration impact).
- `apps/desktop/src/renderer/src/state/shell.ts` — additive `RecoveryTabInfo.reasonDetails`.
- `apps/desktop/src/renderer/src/actions.ts`, `apps/desktop/src/renderer/src/App.tsx` — carry the
  new field into the tab on open and on session restore.
- `apps/desktop/src/renderer/src/shell/RecoverySurface.tsx` — Reason row + `Details`; retry error
  details use the raw value.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — tooltip carries the raw reason.
- `apps/desktop/src/renderer/src/state/runtime.ts` — `failedOutcome()` and its 19 call sites; the
  merge plan reason.
- `apps/desktop/src/renderer/src/styles.css` — one rule: `Details` under the Reason row sits at
  4 px (the shared 10 px is a dialog/banner rhythm).
- `apps/desktop/test/core-reasons.test.ts` — **new**: every code maps, no raw text in a message,
  no banned word, generic fallback, kind-aware rows.
- `apps/desktop/test/recovery-library.test.ts` — the library/recovery assertions now pin the short
  line **and** the raw `reasonDetails` (stronger than the old raw-text match), plus two new
  boundary tests: a core `chapter.delete` rejection and a command on a damaged package.
- `apps/desktop/test/copy-cd.test.ts` — `src/main/core-reasons.ts` joins `SENTENCE_MODULES`
  (empty allowlist) and `APPLIED_COPY` pins every short line.
- `tests/recovery/m2f-recovery.test.mjs` — the damaged/newer rows and the recovery `Reason` row now
  assert the short line, the absence of the parse sentence in the row, and the raw value in the row
  tooltip / `Details`; the empty-chapter gate asserts the short line with the core guidance in
  `details`.
- `tests/ui/data-recovery.test.mjs` — **new** UI suite (registered in `tests/ui/suites.mjs`,
  `shell` group): library rows are short lines, the tooltip holds the raw sentence, and the
  recovery `Reason` row is a short line with `Details` → raw.
- `docs/reports/data-recovery.md` — this report.

Not touched: `planAssetGc`, the `asset.remove` guard, the backup scan, the asset store, the four
Health sections, the repair modal, find, Page/PDF, the library actions, the spec/UX/ADR/plan.

## Checks

| Check | Result |
|---|---|
| `npm run check:boundaries` | pass — 274 files, 1336 imports, 16 rules |
| `npm run typecheck` (all workspaces) | pass |
| `npx vitest run` | pass — 159 files / 1618 tests (6.4 s) |
| `node --test tests/ui/data-recovery.test.mjs` | pass — 2/2 (11.6 s), re-run after the last copy change |
| `npm run test:recovery:run` | pass — 14/14 (20.9 s), re-run after the last copy change |
| `node tests/ui/run.mjs --group shell,anchors --concurrency 2` | pass — 36/36, 0 failed, 310.1 s, exit 0 |
| `npm run verify:fast` | pass — exit 0, 59.5 s (boundaries + typecheck + 159 unit files / 1618 tests + e2e 16/16) |

The targeted UI run happened before the final `chapter-would-be-empty` line changed from
`This chapter can’t be empty.` to `A chapter needs at least one block.` (the latter is the copy the
recovery gate needs: it reads better next to `A note needs at least one chapter.`). That line is
not used by any other UI suite; the two suites that do read it (`data-recovery`, the recovery gate)
were both re-run green after the change. `verify:fast` ran last.

Screenshots (`artifacts/data-recovery/`, git-ignored evidence):

- `library-row-reason.png` — Library rows: `This note couldn’t be read.`, `A newer NoteForest
  wrote this note.`, `This note’s file is missing.` (no parse sentence in any row).
- `recovery-reason-details.png` — the recovery tab: `Reason` reads `The file isn’t valid
  NoteForest data.` with `Details` open on `document.json is not valid JSON` and `Copy`.
- The part-1 screenshots (section with rows, confirm, section after cleanup) do not exist because
  that half is blocked (see above).

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | `Unused images` only when the plan is non-empty | **blocked** (part 1 stop-and-ask) |
| 2 | Confirm lists count/size; Cancel no-op; Remove deletes records **and** bytes | **blocked** (no byte-deletion path exists) |
| 3 | A backup/node/anchor-referenced asset is never listed or deleted | **blocked** (planner already guarantees it; nothing lists or deletes) |
| 4 | Read mode lists, action disabled | **blocked** (part 1) |
| 5 | No user-facing string contains a raw `core` reason; raw text in `Details`; the guard covers the mapping | **pass** |
| 6 | No regression: the other four Health sections, the repair modal, find, Page/PDF, the library | **pass** (unit + `shell,anchors` UI + `verify:fast`) |

Criterion 5 is enforced three ways: `core-reasons.test.ts` (every message is a short sentence and
differs from the raw), the boundary tests in `recovery-library.test.ts`, and the UI suite (row and
`Reason` row text `doesNotMatch(/document\.json|JSON|schema/i)` while `Details` contains it).

## Risks

- **The stop leaves the batch half done.** The remaining work is one decision (option 1 above) plus
  the section, the confirm dialog and the cleanup orchestration; the planner, the guard and the
  backup scan are already there and tested, so no new policy is needed beyond the byte deletion.
- **Raw text in `Details` can contain engine words** (`document.json`, an asset id). `dialogs.md`
  §3.2 asks for engine words to be rewritten before `Details`; the brief asks for the raw reason in
  `details`, and the copy guard only scans literals, not runtime values. I followed the brief and
  the existing precedent (`SaveFailureBanner` already puts the raw store message in `Details`).
  If the product owner wants the raw value sanitized, that is a small change in `core-reasons.ts`.
- **A repository `merge` on a block now shows a generic line.** `planBlockMerge`'s sentence was
  informative but internal; the exact sentence is in `Details`, and the menu item already carries
  the guidance. No behaviour changed.
- **The empty-chapter guard now shows `A chapter needs at least one block.`** The core sentence
  (`Cannot move the last top-level block out of chapter "Second". Add another top-level block or
  delete the chapter instead.`) names the chapter and the action; it moves to `Details` (one click
  from the toast) and the short line states the rule for all three actions. This is the one core
  message that was already guidance copy rather than a log sentence; if the product owner prefers
  the specific sentence in the toast, the cleanest fix is a per-action short line in
  `core-reasons.ts` fed by the command type, not a core change.
- **`DocumentSummary.reasonDetails` is a new IPC field.** Additive and optional; an older renderer
  would simply show the short `reason`. No schema or settings change, no migration.
- **`SaveResult.error` now carries the short recovery line** for a package that cannot open (it is
  the same `recovery.reason`). That is deliberate: the value also reaches the `Overwrite` failure
  toast, so the raw sentence must not be there; the save-failure banner's `Details` shows the short
  line plus the path instead of the parse sentence. A future pass could add a `details` field to
  `SaveResult` if the banner needs the raw value back.
- **Manual checks remain** for the product owner: the visual pass on the recovery surface and the
  Library rows (screenshots are in `artifacts/data-recovery/`), and the decision on option 1.

## Next step

1. Decide the byte-deletion option (1, 2, or defer) and, for 1 or 2, authorize it explicitly so the
   brief's stop condition is lifted.
2. Re-dispatch the `Unused images` half with the same brief plus that decision: main-side plan IPC
   → `Unused images` section (rows + footer action + confirm on the shared `Frame`) → cleanup →
   report refresh, with the four Read-mode and reference cases as tests.
3. Nothing else is needed for part 2; it can merge independently.

## DR1b — Unused images in Health, bytes to the OS Trash (part 1, delivered)

**Status:** delivered; part 2 above is unchanged.
**Brief:** `docs/tasks/data-recovery.md`, §1 as replaced by “Decision (17 November 2026) — the bytes
go to the OS Trash”.

### Summary

The second half of the batch is implemented on top of the merged part 2 (`646f343`): Health lists the
images that no image node, no image anchor, and no retained backup names, and an explicit confirm moves
each file to the **OS Trash** before its record is removed. Nothing is ever unlinked, nothing is
scheduled, and `planAssetGc`, the `asset.remove` guard, the backup scan, and the asset store are
untouched.

### The section

`Unused images` is the fifth Health group and the only one that disappears at zero: the four audit
sections keep their always-visible `0` (design §4). It renders the shared result card (§5) — line one is
the asset `originalName`, or the recorded path's last segment; line two is `size · mime` in
`--sb-meta` — under the same 28 px label/count row as the other groups (the group count keeps the
shared `.nf-health-section-count` metric, `--sb-meta`; the top-level Health header keeps its
`--sb-count` summary), with a footer action `Clean up N unused images…`. The section is hidden while a
Health search filters the audit (asset files are not issues) and the all-clear line is suppressed while
it is visible, so “No issues found” never sits above a list of files to remove. In Read mode the section
lists and the action is disabled (`editingEnabledFor`, the one shell-wide rule).

The plan is the core planner and nothing else:

- `planAssetGc(runtime.document, { retainedAssetIds })` — the renderer's canonical document;
- `retainedAssetIds` comes from `backupAssetReferences` (core/node) through a read-only main IPC,
  `document:backup-asset-ids`, run once per note and once more at the start of a cleanup pass;
- until that scan answers for the current note, the plan is empty. A pending or failed scan is never
  treated as “no backups”, because a backup-named id would then be offered for cleanup.

### The cleanup

Order per asset, exactly as the decision lists it:

1. **Re-plan and re-check** immediately before acting: `planAssetGc` with the fresh retained set and
   `imageAssetReferences` on the live canonical document. A record that became referenced is skipped,
   never an error.
2. **Move the file to the OS Trash** in the main process (`document:trash-unused-image` →
   `trashUnusedImage` → `trashUnusedAsset`): the record must exist, no image node and no image anchor
   may name it, the store must be writable, and the target is the content address `assets/<id>` after
   both the package root and the `assets/` root are resolved with `realpath`. A crafted record path, a
   symlinked file, and a symlinked `assets/` all refuse with `outside-assets`; a missing file is
   `{ ok: true, trashed: false }` (there are no bytes to preserve, so the dead record may still go).
   The bytes go through Electron's `shell.trashItem` — the same helper as Move to Trash for a note.
3. **Remove the record** with the ordinary guarded `asset.remove` command on the session queue. The
   guard is the second line of defence behind the fresh plan. There is no undo entry
   (`acceptStructural(…, null)`): the bytes are in the Trash and an inverse `asset.add` would restore a
   record pointing at a missing file. The Trash is the recovery path.

The pass aborts on the first failure and reports what it handled: the toast carries
`Moved N of M unused images to the Trash. The rest stay in the note.` (or `Nothing was removed. These
images are in use again.` when every candidate went stale), and the technical line (an OS error or a
path) goes to `Details`. A record write that fails after the move leaves the accepted missing-asset
state (placeholder + broken anchor); there is never a record-only delete. The dialog also flushes at
the end, so the record removal is on disk before the section is read again.

The confirm is the shared `Frame` at 560: title `Clean up unused images?`, description `The files move
to the Trash. You can restore them from there.`, body `N images · size` then up to 20 rows and
`and N more`, footer `Cancel` (focused) then the outlined danger `Remove`. It re-reads the scan and
re-plans on open, so the count and the total are current; when nothing is left it says `These images
are in use again. Nothing was removed.` and offers only `Close`.

### `SaveResult.details` for the damaged-package path

The decision also asked for the core sentence back under `Details` while the message keeps the short
line. `SaveFailure` gains an optional `details` (IPC type, additive), `saveDocument`'s recovery branch
fills it from `opened.recovery.reasonDetails`, the save coordinator carries it through
(`nextSaveFailure(…, details)`), and `SaveFailureBanner` renders `details ?? message` plus the package
path in its one `Details` value. A plain write error has no `details`, so its Details value is unchanged.

### Files changed

- `apps/desktop/src/main/unused-images.ts` — **new**: the byte boundary (`trashUnusedAsset`) with the
  record, reference, realpath, and content-address checks.
- `apps/desktop/src/main/library.ts` — `assetIdsInBackups` and `trashUnusedImage` wrappers;
  `saveDocument`'s damaged-package `details`.
- `apps/desktop/src/main/index.ts` — `document:backup-asset-ids` and `document:trash-unused-image`,
  with `shell.trashItem` injected at the composition layer.
- `apps/desktop/src/shared/api.ts` — additive `BackupAssetIdsResult`, `TrashUnusedImageResult`, the two
  API methods, and `SaveFailure.details`.
- `apps/desktop/src/preload/index.ts` — the two methods.
- `apps/desktop/src/renderer/src/lib/unused-images.ts` — **new**: plan → rows, the size format, and the
  section/dialog/toast copy.
- `apps/desktop/src/renderer/src/lib/unused-images-cleanup.ts` — **new**: the pass, with injected ports.
- `apps/desktop/src/renderer/src/shell/useUnusedImages.ts` — **new**: one backup scan per note and
  refresh token; empty until it answers.
- `apps/desktop/src/renderer/src/shell/HealthSection.tsx` — the fifth group, its rows and action.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — `UnusedImagesDialog` and the `unused-images`
  dialog state; `shell.ts` gains that state kind.
- `apps/desktop/src/renderer/src/state/runtime.ts` — `removeUnusedAsset`.
- `apps/desktop/src/renderer/src/lib/save-failure.ts`, `state/save-coordinator.ts`,
  `state/document-session.ts`, `shell/SaveFailureBanner.tsx` — the optional `details` path.
- `apps/desktop/src/renderer/src/styles.css` — the section rows/action and the confirm list.
- `apps/desktop/test/unused-images.test.ts` — **new**: rows, copy, and the cleanup order (backup skip,
  stale-list skip, abort, record failure after the move, scan failure).
- `apps/desktop/test/unused-images-main.test.ts` — **new**: OS-Trash move, node/anchor/path/symlink
  refusals, missing file, Trash failure, read-only, and the backup id scan.
- `apps/desktop/test/unused-images-runtime.test.ts` — **new**: the guarded record removal, no undo
  entry, read-only refusal.
- `apps/desktop/test/recovery-library.test.ts` — a save on a damaged package keeps the parse sentence
  in `SaveResult.details`.
- `apps/desktop/test/copy-cd.test.ts` — the new main module joins the banned-word guard.
- `apps/desktop/test/list-markers.test.ts` — the two shell list resets join the documented allowlist
  (sidebar file list and confirm list; neither is note content).
- `tests/ui/unused-images.test.mjs` — **new** suite (registered in `shell` and `images`): section,
  confirm, cleanup, reopen, image-anchor and backup exclusions, Read mode.
- `docs/reports/data-recovery.md` — this section (part 2's section is not rewritten).

### Checks

| Check | Result |
|---|---|
| `npm run check:boundaries` | pass — 278 files, 1352 imports, 16 rules |
| `npm run typecheck` (all workspaces) | pass |
| `npx vitest run` | pass — 162 files / 1646 tests (7.1 s) |
| `npm run test:recovery:run` | pass — 14/14 (21.0 s); run because `SaveResult.details` is an IPC change |
| `node tests/ui/run.mjs --group shell,anchors,images --concurrency 2` | pass — 41/41, 360.1 s, exit 0 (includes the new `unused-images` suite in `shell` and `images`) |
| `npm run verify:fast` | pass — exit 0 (boundaries + typecheck + 162 unit files / 1646 tests + e2e 16/16, 45.6 s) |

`npm run verify` was not run, per the brief.

Screenshots (`artifacts/data-recovery/`, git-ignored evidence):

- `unused-images-section.png` — Health at 1440×900: the four audit groups at `0` and the
  `Unused images` group with `1`, one result card (`spare-chart.png`, `12 kB · image/png`) and
  `Clean up 1 unused image…`.
- `unused-images-confirm.png` — the 560 confirm: `Clean up unused images?`, `1 image · 12 kB`, the row,
  `Cancel` focused and the outlined danger `Remove`.
- `unused-images-cleanup.png` — after `Remove`: the section is gone, the all-clear line is back, and the
  used image is untouched.
- `unused-images-read.png` — Read mode: the row is listed and the action is dimmed/disabled.
- Part 2's `library-row-reason.png` and `recovery-reason-details.png` are regenerated by the existing
  `data-recovery` suite; the save-failure banner's new `details` is unit-tested (the banner already had
  its `Details` surface).

### Acceptance criteria (DR1b)

| # | Criterion | Result |
|---|---|---|
| 1 | `Unused images` with the count only when the plan is non-empty; absent at zero | pass — unit rows + UI section/disappear/reopen; the four audit sections keep `0` |
| 2 | Confirm lists count/size; Cancel changes nothing; Remove moves the bytes and removes the records; the section disappears | pass — unit ordering + UI (file gone from `assets/`, record gone, section gone, persists after reopen) |
| 3 | A backup-, node-, or anchor-referenced asset is never listed or deleted | pass — unit (plan + skip at action time) and UI (backup-only and anchored ids absent; files untouched); main refuses `asset-in-use` |
| 4 | Read lists, action disabled | pass — UI |
| 5 | No raw `core` reason in a message; raw text in `Details`; the guard covers the mapping | pass — unchanged from part 2, plus the damaged-package `SaveResult.details` restore (unit) |
| 6 | No regression: four Health sections, repair modal, find, Page/PDF, library | pass — full unit suite and the `shell,anchors,images` UI run |

### Risks

- **Backup retention is record-presence, not content-reference.** `backupAssetReferences` retains every
  id in a backup's `documents.assets`, not only the ids that backup's content references. Every save
  writes an autosave backup of the previous revision, so the save that follows “remove this image from
  the block” writes a backup that still contains the now-unused **record**. From then on the plan
  retains the asset, and every later save writes another backup that contains the record again, so the
  id never rotates out. The section therefore appears only when the record became unused *after* the
  last backup (a failed save, a kept unsaved record, a document written by another tool) — which the
  UI suite exercises — and it would disappear again after the next autosave.
  This is not changed here: the brief freezes `planAssetGc`, the guard, and the backup scan, and the
  scanned function has a core test for its current contract. If the product owner wants the section
  after an ordinary delete + autosave, the minimal change is one rule in
  `packages/core/src/node/recovery.ts`: retain only `referencedAssetIds(parsed.document)`, not
  `Object.keys(parsed.document.assets)`. That gives the backup written by the delete-save a natural
  ~20-autosave life before it rotates out, and needs one core test updated.
- **The list can be one save stale.** The section re-scans on open, on the manual re-check, and at the
  start of a cleanup pass, not on every keystroke (up to 50 backup JSON reads). A stale row is safe: the
  action re-plans and the main process re-checks the guard, so a newly referenced asset is skipped.
- **Restoring a backup that named a cleaned-up asset shows the placeholder.** The record is gone by
  design; the guard contract is unchanged and the bytes are recoverable only from the OS Trash.
- **Scan cost.** One `backupAssetReferences` call per section mount/re-check and one per cleanup pass;
  it reads and parses up to 50 `document.json` snapshots. It is off the save path and was not measured
  as a bottleneck on this machine.
- **The action label is a sentence with the count**, so the section footer changes width with the
  number; it is a full-width 28 px button and never wraps in the 236 px content column.

### Next step

1. Product-owner decision on the backup-retention finding above (leave as specified, or the one-rule
   content-reference change).
2. The product-owner visual/VoiceOver pass over the section, the confirm, Read mode, and the
   save-failure banner's `Details` (screenshots in `artifacts/data-recovery/`).

## DR1c — backup retention by content reference (17 November 2026)

`backupAssetReferences` now retains an asset id only when a retained backup's **document references** it —
an image node's `assetId` or an image anchor's selector — and never because the backup's asset record
table (`documents.assets`) still lists it. The scan already parses every backup, so the change is one rule
inside that loop in `packages/core/src/node/recovery.ts`: the record-table union is gone, and the existing
`referencedAssetIds` walk (the same walk `planAssetGc` uses) is the only source. **That content reference
is the grace period**, and it is the honest one: an image deleted today becomes reclaimable when the
autosaves that still show it in their content have rotated out under the unchanged policy (floor 10,
default 20 autosaves), with no mtime and no invented window. Nothing else moved: the rotation policy,
cadence and floor, the 50-backup scan cap, the Health section and its copy (it never stated a window, so
no line was needed), the trash path, `planAssetGc`, and `asset.remove` are untouched. The old flaw is
closed by construction — the save after “remove the image from the block” still retains the id, but
through the image node that snapshot shows, so it releases the id when that snapshot rotates out instead
of keeping it forever.

**Tests.** `packages/core/test/asset-gc.test.ts` adds three: a backup whose record table holds an id its
content never names retains nothing (`does not retain an id that a backup only records but never
references`); a backup that names the id only through an image anchor does retain it; and the ordinary
delete → autosave → rotate sequence, driven through a real `DocumentStore` with `autosaveMax: 10`, retains
the id at first and makes it reclaimable after ten further saves rotate the referencing snapshot out
(asserted with the ten-autosave floor and the `retained-backup` plan reason on both sides).
`apps/desktop/test/unused-images-main.test.ts` now pins the boundary rule — a backup that references two
ids and only records a third returns the two — and `tests/ui/unused-images.test.mjs` writes a backup whose
content still shows the image it retains, so the UI case is the real previous revision instead of a
record-only snapshot. No assertion was relaxed.

**Checks.** Targeted `npx vitest run` over `asset-gc`, `asset-store`, `asset-contract`, `unused-images`
and `unused-images-main`: 5 files / 54 tests pass. UI `node tests/ui/run.mjs --group shell,images
--concurrency 2`: 27/27 (259.8 s). The first invocation of that command reported two `m2-shell` subtest
failures; a serial `--group shell` run (23/23) and an immediate repeat of the same concurrent command
(27/27) were both green and neither touches backups or assets, so it is recorded as a runner flake.
`npm run verify:fast`: exit 0 (162 unit files / 1649 tests, e2e 16/16).

**Risks.** Restoring a backup older than the retained ones can still show a placeholder if its asset was
cleaned up earlier — recorded for DR1b and unchanged. The list can be one save stale, because the scan
runs on section mount/re-check and at the start of a cleanup pass; a `retained-backup` reason therefore
lags until the next refresh, and the action re-plans and the main process re-checks the guard, so a stale
row is safe. The earlier DR1b risk entry and `docs/reports/m3c3b4-image-ux-lifecycle.md` describe the
record-presence rule as history and are not rewritten.

**Next step.** The product-owner visual/VoiceOver pass over the section, unchanged screenshots because no
copy changed.
