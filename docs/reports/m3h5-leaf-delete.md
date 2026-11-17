# M3h5 — leaf delete disclosure for external references

**Role:** Builder
**Milestone:** M3h — Sentinel re-review fixes
**Worktree:** `a builder worktree`
**Branch:** `t3/m3h5-leaf-delete-disclosure`
**Base:** `e63644c`
**Scope:** S3-8 only. No token, placement/undo, repair-preview, idle-anchor, image, or API changes.

## Summary

- **S3-8 fixed on the keyboard path.** `requestBlockDelete` now asks the pure
  `deleteNeedsConfirmation(document, blockId)` predicate instead of checking only for direct
  children. A leaf block with one or more incoming reference edges from outside the deletion opens
  the existing `Delete block` dialog; a leaf with zero external references keeps the fast path and
  deletes with one undo step and no confirmation.
- **Existing dialog reused, no second component.** The disclosure remains `DeleteBlockDialog` and
  `externalReferenceParents`; the keyboard and block-menu paths render the same
  `[data-delete-references]` section with source, chapter, role, and target rows.
- **Leaf dialog cleaned up.** A block with no descendants no longer shows the “What about its
  descendants?” choice, because promote and delete-subtree are identical for a leaf. The dialog
  description already says “This block has no descendants.” and the reference section states that
  the listed links will be removed while the source blocks stay.
- **Cancel/focus.** Cancel mutates nothing, keeps the leaf selected, and restores focus so the same
  `⌘Backspace` reopens the disclosure (asserted by the app test).
- **Confirm/undo.** Confirm uses the existing `runtime.deleteBlock(blockId, 'promote')` core command;
  one `⌘Z` restores the exact graph including the reference branch, verified by deep-equal against
  the pre-delete structure.
- **Menu path.** The block menu already opened the dialog unconditionally; the app test now also
  covers a leaf opened from the menu and confirms it renders the same disclosure and rows.

## Files changed

- `apps/desktop/src/renderer/src/lib/tree.ts` — new pure `deleteNeedsConfirmation` selector over
  direct children and external reference parents.
- `apps/desktop/src/renderer/src/actions.ts` — `requestBlockDelete` routes through the selector;
  keyboard `⌘Backspace`/`Delete` now discloses reference-bearing leaves.
- `apps/desktop/src/renderer/src/shell/Dialogs.tsx` — `DeleteBlockDialog` hides the descendant
  choice for a block with no descendants; disclosure section unchanged.
- `apps/desktop/test/delete-references.test.ts` — predicate units: bare leaf, leaf with an external
  reference, block with descendants, outgoing reference only.
- `tests/ui/m3h5-leaf-delete.test.mjs` (new) — keyboard leaf delete with a reference (dialog shown,
  row fields, cancel/no mutation/focus, confirm, one undo) and the leaf-without-reference fast path
  (no dialog mount recorded, delete, one undo). Also covers the leaf block-menu path.
- `package.json` — add the new UI file to `test:ui` and `verify`.

## Evidence

- `artifacts/m3h5/leaf-delete-disclosure-1440x900.png` — `⌘Backspace` on a leaf with an external
  reference: dialog with no descendant choice and one external reference row (source, chapter,
  role, target).
- `artifacts/m3h5/leaf-delete-fast-path-1440x900.png` — bare leaf deleted with no dialog; canonical
  count 7 and the rest of the tree unchanged.

Artifacts are disposable test output under the gitignored `artifacts/` root.

## Checks

| Check | Result |
|---|---|
| `npm ci` from the lockfile | 199 packages, 0 vulnerabilities |
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| targeted vitest: `apps/desktop/test/delete-references.test.ts` | 7/7 pass, 0.15 s |
| `npm test` | 509/509 pass, 47 files, 1.94 s tests |
| targeted UI: `node --test tests/ui/m3h5-leaf-delete.test.mjs` | 2/2 pass, 6.5 s suite / 14.7 s process cold; 1.5 s suite / 9.7 s process warm |
| `npm run test:ui` | 13/13 files pass (35 tests), 2 min 30 s wall including build |
| `npm run e2e:critical` | 21/21 pass, 45.8 s suite / 53.9 s process |
| `npm run verify:fast` | pass on rerun (typecheck + 509 unit + 21 critical e2e), ~65 s |
| Full `npm run verify` | not run (Orchestrator owns the single integration run) |
| Recovery / perf / visual suites | not run (not in this brief; on demand) |

One first `verify:fast` attempt failed one critical e2e subtest and was not captured because the
output was tailed; the suite duration was 50.1 s versus the usual ~45.8 s. Immediate reruns of
`e2e:critical` (21/21) and `verify:fast` (pass) were clean. Treat as a pre-existing/flaky e2e
observation, not a deterministic failure of this change; the new UI test is not part of
`verify:fast`.

## Risks / not verified

- **No visible undo toast today.** The fast path still has no confirmation and one `⌘Z` undo, but
  the current code does not show a toast for block deletion even though `docs/ux.md` §11.5 says
  “No; undo toast”. The brief said to keep the current fast path, so no toast was added. If the
  product owner wants the toast, it is a separate small change and should apply consistently to all
  block deletes.
- **Pre-existing chapter-empty rule.** A reference-bearing leaf that is the only top-level block in
  its chapter now opens the dialog, but confirming is still rejected by the core empty-chapter guard
  with the existing error toast. The block-menu path had the same behavior before this change; no
  new rule was introduced.
- **Fast-path test scope.** The app test records dialog mounts with a `MutationObserver` and asserts
  none appeared; it does not assert a toast (see above).
- **Focus after cancel** is proven by reopening with `⌘Backspace`; the test does not assert the
  exact `document.activeElement` node.
- **Only the keyboard/menu leaf cases are exercised.** No new coverage for a leaf with multiple
  external references; the row list is the same `externalReferenceParents` projection already
  covered by the S2-3 unit/app tests.
- The overlapping “See also”/“Referenced by” chips visible in the disclosure screenshot are the
  known chip-overlay polish follow-up, not part of M3h5.
