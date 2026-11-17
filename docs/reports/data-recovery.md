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
