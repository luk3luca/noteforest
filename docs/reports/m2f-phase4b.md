# M2f phase 4b — Empty-chapter invariant and explicit stale-lock consent

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m2f-phase4b-empty-chapters-locks`  
**Base:** `a337a99` (`main`: docs: start M2f phase 4b empty chapters and stale locks)  
**Scope:** F6 and F7 only. No F5 keyboard/focus, cleanup, undo, M3, page view, or PDF.

## Commits

- `e5a7ee8` feat(core): reject operations that would empty a chapter
- `d88a656` feat(core): expose stale lock metadata on read-only stores
- `b8ed6cf` feat(desktop): render empty chapters and require explicit stale-lock takeover
- `69bb47c` fix(desktop): show read-only consent above the empty-document state
- docs report (this change set)

## Verdict

No structural operation can strand a new empty chapter. `block.move`, `branch.create`, and
`block.delete` reject the last top-level root of a chapter with a typed
`chapter-would-be-empty` error that names the chapter; deleting the chapter explicitly still
works. Legacy empty chapters are valid ProseMirror content (`chapter: branch*`) and render
their title, an empty row, and **Add top-level block** after reload instead of being dropped.
`ensureChaptersHaveBlocks` now repairs every empty chapter, not only the first.

Stale locks are never broken by opening a document. A stale-lock package opens read-only with
its reason, lock PID/host/session/heartbeat, and an explicit **Take over lock** action.
Cancel keeps the document read-only and leaves the lock file untouched. Only the explicit
action calls the core stale-lock recovery and reopens the document writable.

`npm run verify` passes: typecheck, 241/241 unit tests in 1.77 s, 26/26 critical e2e tests in
56.79 s suite time (under the 60 s budget), 10/10 recovery integration tests in 18.87 s, and a
production build. No native OS dialog is opened by any new flow.

## What changed

### F6 — core invariant

- `packages/core/src/commands.ts`:
  - New typed failure code `chapter-would-be-empty`.
  - `block.move` rejects moving a chapter's only top-level block to another chapter or under
    a parent. Reordering inside the same chapter remains allowed.
  - `branch.create` rejects reparenting a chapter's only top-level block.
  - `block.delete` rejects deleting a chapter's only top-level block, except when
    `children: "promote"` also promotes at least one child into the chapter. The explicit
    removal path is `chapter.delete` with `blockHandling: { kind: "delete-blocks" }` or
    `move-to-chapter`; there is no silent chapter delete or auto-created placeholder.
  - The error names the chapter by title, or by ID for an untitled/legacy chapter.
  - `chapter.delete`, moves of non-last roots, moves within a chapter, and legacy documents
    with empty chapters keep working unchanged.

### F6 — render and repair legacy empty chapters

- `apps/desktop/src/renderer/src/editor/extensions.ts`: `chapter` content is now `branch*`
  instead of `branch+`.
- `apps/desktop/src/renderer/src/lib/adapter.ts`: every chapter is emitted, including an
  empty one; the synthetic `__empty__` block and `if (blocks.length === 0) continue` are
  gone. An invalid chapter-less in-memory document gets an empty chapter node, never a fake
  block.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`: an empty chapter renders
  `No top-level blocks yet.` plus the existing **Add top-level block** footer row.
- `apps/desktop/src/renderer/src/state/runtime.ts`: `ensureChaptersHaveBlocks` loops over
  every empty chapter and saves once after the repairs.
- `apps/desktop/src/renderer/src/lib/chapters.ts` / `DocumentEditor.tsx`: the pristine
  empty-document call to action remains for a single untitled empty chapter; named or
  multiple legacy chapters now render as chapter cards.
- `apps/desktop/src/renderer/src/state/runtime.ts`: the old `__empty__` reconciliation
  exception is removed now that placeholder blocks no longer exist.

### F7 — stale-lock consent

- `apps/desktop/src/main/library.ts`: removed the automatic
  `openDocumentPackage(..., { breakStaleLock: true })` retry. `openStore` now keeps the
  read-only `stale-lock` snapshot.
- `packages/core/src/node/store.ts`: a read-only store keeps the existing `LockInfo`
  (record + corrupt flag), so the app can show PID/host/session/heartbeat.
- `apps/desktop/src/shared/api.ts`: `OpenDocumentSnapshot.lock`, `LockInfoView`, and
  `TakeOverLockResult`.
- `apps/desktop/src/main/library.ts`: new `takeOverStaleLock(packagePath)`. It closes the
  read-only store, calls core `breakStaleLock` (which refuses a live lock), reopens the
  package, and only returns success when the reopened status is `editable`.
- `apps/desktop/src/main/index.ts` / `preload/index.ts`: `document:take-over-lock` IPC and
  `window.noteforest.takeOverLock`.
- `apps/desktop/src/renderer/src/shell/StaleLockBanner.tsx`: read-only banner with lock
  metadata, **Take over lock**, and **Cancel**. Cancel switches to a persistent
  `Stayed read-only` note and a **Review lock** button; it never removes or rewrites the lock.
- `apps/desktop/src/renderer/src/state/runtime.ts`: `takeOverLock()` swaps the runtime to
  the reopened writable snapshot, re-enables the mounted editor, clears history/retry timers,
  and keeps the package path/selection.
- `apps/desktop/src/renderer/src/styles.css`: banner/meta/empty-chapter styles.

Other read-only reasons (corrupt, missing, newer schema, live lock) keep their existing
surfaces; only `stale-lock` gets the takeover action.

## Exact copy

### Empty-chapter rejections

```text
Cannot move the last top-level block out of chapter "Second". Add another top-level block or delete the chapter instead.
Cannot branch the last top-level block out of chapter "Second". Add another top-level block or delete the chapter instead.
Cannot delete the last top-level block of chapter "Second". Add another top-level block or delete the chapter instead.
```

An untitled chapter uses its ID instead of a title: `chapter "c2"`.

### Stale-lock banner

```text
Read-only · stale lock
Another NoteForest session left a lock on this document, but its heartbeat is stale. Your file
has not been modified. Take over only if you are sure no other session is still writing it.

PID 2147483647   Host stale-lock-test   Session dead-session   Heartbeat 1/1/2020, 12:00:00 AM
[Take over lock] [Cancel]
```

Corrupt lock file: `The lock file is corrupt and its owner cannot be read.`

After Cancel: `Stayed read-only. The stale lock was not changed.` and `[Review lock]`.

Success toast: `Lock taken over. This document is now editable.`

Live-lock refusal: `The lock is live: another NoteForest session is writing this document.
Taking over is not allowed while its heartbeat is current.`

Race after break: `The document is still read-only. Another session may have acquired the lock
before the takeover completed; reopen the document to inspect it.`

## Before / after

| Behavior | Before | After |
| --- | --- | --- |
| Move last top-level block out | Allowed; source chapter becomes empty and the adapter skips it | Rejected with `chapter-would-be-empty`, chapter named, document unchanged |
| `branch.create` last top-level block | Allowed; target chapter stranded | Rejected with `chapter-would-be-empty` |
| Delete last top-level block | Allowed; empty chapter left behind | Rejected unless children are promoted; explicit `chapter.delete` required |
| Empty chapter in editor | Adapter skipped it; only a synthetic `__empty__` block kept the schema valid | Real chapter node with title, `No top-level blocks yet.`, and Add top-level block |
| Legacy repair | First empty chapter only | Every empty chapter receives one top-level block on an editable legacy load |
| Stale lock open | Automatically removed the lock and reopened writable | Opens read-only with metadata and explicit takeover |
| Takeover | Implicit | Only after **Take over lock**; core `breakStaleLock` refuses live locks |
| Cancel | n/a | Read-only, lock file byte-for-byte unchanged |

## Tests added

- `packages/core/test/empty-chapters.test.ts` (new): move, branch, delete, promote-child,
  same-chapter reorder, allowed-after-another-root, explicit chapter delete, untitled chapter
  naming.
- `apps/desktop/test/adapter.test.ts`: legacy empty chapter preserved, no `__empty__`, no
  synthetic block for a chapter-less document.
- `apps/desktop/test/empty-chapters.test.ts` (new): `ensureChaptersHaveBlocks` repairs every
  empty chapter; a read-only runtime defers repair.
- `apps/desktop/test/chapters.test.ts`: empty-document vs legacy chapter-canvas decision.
- `packages/core/test/storage.test.ts`: read-only store exposes stale lock metadata.
- `apps/desktop/test/recovery-library.test.ts`: normal open still editable, stale lock stays
  read-only with metadata, explicit takeover writes, live lock takeover refused.
- `tests/recovery/m2f-recovery.test.mjs`: four app-level phase 4b flows — stale lock / Cancel / takeover, legacy empty
  chapter after reload / Add top-level block, stale-lock consent on a zero-block document, and
  move / branch / delete last-root rejections.
- `tests/e2e/m2-editor.test.mjs`: the cross-chapter undo flow now gives chapter two a second
  root before moving the first out, so it tests undo identity without violating the new
  invariant. No data-safety test was removed; the suite is still 26 tests.

## Gate table

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass — desktop node/web, core, layout, pdf |
| Unit | `npm test` | Pass — 241 tests / 26 files, 1.77 s |
| Critical e2e | `npm run e2e` | Pass — 26/26, 56.79 s suite (< 60 s), ~64.8 s wall incl. build |
| Recovery integration | `npm run test:recovery` | Pass — 10/10 (6 phase 4a + 4 phase 4b), 18.87 s; phase 4b suite 5.97 s |
| Full verification | `npm run verify` | Pass — exit 0 |
| Native dialogs | — | No native dialog added; recovery suite asserts zero dialog calls |
| Manual/screen recording | — | None; no screen recording or Notability |

## Files changed

- `packages/core/src/commands.ts` — invariant, typed error, chapter naming.
- `packages/core/src/node/store.ts` — read-only `LockInfo`.
- `packages/core/test/empty-chapters.test.ts` (new), `storage.test.ts`.
- `packages/core/test/commands.test.ts` unchanged.
- `apps/desktop/src/shared/api.ts` — lock view and takeover result.
- `apps/desktop/src/main/library.ts` — no auto-break, snapshot lock metadata, explicit takeover.
- `apps/desktop/src/main/index.ts`, `preload/index.ts` — takeover IPC.
- `apps/desktop/src/renderer/src/state/runtime.ts` — all-empty repair, takeover swap.
- `apps/desktop/src/renderer/src/lib/adapter.ts` — all chapters rendered.
- `apps/desktop/src/renderer/src/editor/extensions.ts` — `branch*`.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — empty chapter row.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — specific stale-lock banner and
  legacy chapter canvas decision.
- `apps/desktop/src/renderer/src/lib/chapters.ts` — canvas visibility helper.
- `apps/desktop/src/renderer/src/shell/StaleLockBanner.tsx` (new).
- `apps/desktop/src/renderer/src/App.tsx` — test-state status/reason/lock.
- `apps/desktop/src/renderer/src/styles.css` — banner and empty-chapter styles.
- `apps/desktop/test/adapter.test.ts`, `empty-chapters.test.ts` (new), `chapters.test.ts`,
  `recovery-library.test.ts`.
- `tests/recovery/m2f-recovery.test.mjs`, `tests/e2e/m2-editor.test.mjs`.
- `docs/reports/m2f-phase4b.md` (this report).

## Known gaps

- A document with a single untitled empty chapter still shows the existing “This document has
  no blocks yet” call to action rather than a chapter card; named or multiple legacy chapters
  render as cards, and read-only banners (including stale-lock consent) render above the empty
  state. The Add first block action is the recovery path.
- `ensureChaptersHaveBlocks` intentionally auto-seeds every empty chapter on an editable
  legacy load, per the phase brief. Read-only legacy packages keep their empty chapters and
  render them.
- A live (non-stale) `locked` package still has no takeover action, by design. Takeover is
  stale-lock only.
- If another session acquires the lock between the explicit break and the reopen, takeover
  fails read-only with a clear message and the user must reopen/retry.
- The builder did not run a manual macOS visual/VoiceOver pass; no screen recording was made.
- F5 keyboard/focus, F16 a11y polish, cleanup, M3 anchors/reference edges, page view, and PDF
  remain out of scope.

## Next suggested step

Phase 5: F5/F16 keyboard and focus, then the F12–F15/F19 cleanup gate. Do not start M3 until
M2f is accepted.
