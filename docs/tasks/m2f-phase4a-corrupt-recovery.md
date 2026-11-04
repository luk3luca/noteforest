# M2f phase 4a — Corrupt/missing/newer package recovery surface

**Status:** Approved (4 November 2026)  
**Owner:** Builder (worktree)  
**Source:** `docs/reviews/m2-review.md` F3; `docs/tasks/m2f-stability-fixes.md` phase 4  
**Out of scope:** empty-chapter invariant (F6), stale-lock consent (F7), keyboard/focus (F5), undo, M3/page/PDF

## Problem

The library hides any folder whose `document.json` does not parse; opening a missing/newer package returns a toast and no tab. The read-only/recovery API exists in `packages/core` but is not wired to the app. A damaged note is effectively invisible and cannot be inspected or recovered.

## Scope

- Library listing:
  - include unreadable packages with `status` (`ok`, `unreadable`, `missing`, `newer-schema`), a human reason, path, and title fallback;
  - do not silently drop them;
  - existing valid rows unchanged.
- Opening a damaged/newer/missing package:
  - open a read-only recovery tab/surface with the package path, status, parse/validation reason, and actions:
    - **Restore newest valid backup** (reuse the 2b2b backup list/restore; restore as a new copy, original untouched);
    - **Reveal in Finder**;
    - **Remove from library / Retry** for missing session tabs;
    - close.
  - newer schema: read-only explanation, no downgrade, no overwrite.
  - corrupt/invalid: never overwrite; show recovery candidates/backups; restore as copy.
- Use `openDocumentPackage`, `inspectRecoveryCandidates`, `restoreCandidateToPackage` from `@noteforest/core/node`; no second recovery implementation.
- Main/renderer IPC: minimum typed endpoints; validate library paths.
- Session restore: a missing package opens the recovery tab with Remove/Retry, not a toast-only failure.
- Preserve 2a/2b save-failure behavior and E2E dialog guard.

## Tests

- Add a separate `tests/recovery/` suite and `npm run test:recovery`; include it in `verify` (integration), not in `verify:fast`, so the critical e2e stays <60 s.
- Cases:
  - truncated `document.json` appears in the library with a reason and opens read-only recovery;
  - newer schema opens read-only, no overwrite;
  - missing session tab shows recovery Remove/Retry;
  - restore newest valid backup writes a new copy and opens it; original untouched;
  - invalid/no backup empty state;
  - valid docs unaffected;
  - close/quit/recovery dialogs never open native UI in E2E.
- Condition waits, no fixed sleeps.

## Acceptance

Damaged/missing/newer documents are visible, inspectable, and recoverable without overwriting; valid docs unaffected; `npm run typecheck`, `npm test`, `npm run e2e`, `npm run test:recovery`, `npm run verify` pass. No F6/F7/F5/undo/M3 work.
