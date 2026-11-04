# M2f phase 2b2b — Backup listing and safe restore

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F4; `docs/tasks/m2f-stability-fixes.md` phase 2  
**Out of scope:** corrupt/missing/newer package recovery (phase 4), undo, keyboard, empty chapters, stale locks, M3/page/PDF

## Problem

The save-failure banner can retry, save a copy, reload, reveal, and (for external modification) overwrite, but it cannot show or restore the rotating backups that already exist in app support. A user whose current file is unwritable or conflicted has no in-app path to the last good snapshot.

## Scope

- Add **Restore backup…** to the save-failure banner (available for any save failure when valid backups exist; disabled/empty state otherwise).
- A modal lists valid backups, newest first:
  - kind (autosave/daily/manual/pre-migration),
  - created timestamp,
  - revision,
  - block count,
  - title.
  Invalid backups are hidden or shown disabled with a reason; do not restore them.
- Select a backup and restore **as a new copy**, never over the current package:
  - native destination dialog (default `<library>/<folder> restored <timestamp>`),
  - write the backup document + assets atomically via `restoreCandidateToPackage`/the core recovery API,
  - open or reveal the restored copy; original file is untouched.
- If there are no valid backups, the action shows an empty state with “No usable backups” and no restore button.
- Cancel closes the modal; no mutation.
- Reuse the 2b1/2b2a banner, queue, typed errors, and 2a flush/close contract.
- Do not implement phase 4 package-listing/read-only recovery for corrupt/missing/newer documents; this is backup restore for an open document.

## Core/main/renderer

- Expose `document:list-backups` (or equivalent) returning valid recovery candidates with metadata; read-only, scoped to the document package.
- Expose `document:restore-backup` (source candidate + destination chosen by the native dialog); validate source is one of the listed candidates and destination is writable; no arbitrary path read.
- Use `inspectRecoveryCandidates` / `restoreCandidateToPackage` from `@noteforest/core/node`; do not write a second recovery implementation.
- Restore target must refuse to overwrite an existing `document.json` unless the user explicitly chooses an empty/non-conflicting path; the default copy name is unique.
- The restored document is a copy with its own package path; the current tab is not silently replaced.

## Tests

- Unit: candidate filtering (valid only), metadata mapping, default copy name uniqueness, no-overwrite rule.
- E2E:
  - create several backups, force a save failure, open Restore backup, list correct newest-first metadata;
  - restore to a new path, verify content/revision/assets, original untouched;
  - cancel/no mutation;
  - no valid backups → empty state/disabled;
  - invalid destination/overwrite refusal;
  - normal save/recovery paths unchanged;
  - close/quit still respects 2a.
- Condition waits, no fixed sleeps; critical e2e <60 s; no data-safety test removal.

## Acceptance

A user can inspect and restore a valid backup as a new copy from the save-failure surface; the original is never overwritten; invalid/no backups are handled; `npm run typecheck`, `npm test`, `npm run e2e`, `npm run verify:fast` pass. No phase 4/undo/other work.
