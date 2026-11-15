# Vault library usability follow-up

**Role:** Implementer / Builder
**Phase:** 3 follow-up (after the vault library integration)
**Base:** `main` at delegation
**Source:** phase-3 builder report open question 1 and product-owner feedback (15 November 2026)
**Worktree:** created by the delegate; one commit; no merge or push
**Timebox:** 1 day

## Problems

1. **Library is read-only when the active note is in Read mode.** `libraryMutationsEnabled()`
   returns false for a non-Markdown note in Read, so New folder, Move to folder and folder trash
   are disabled. Read mode is about document **content**, not library organization. It also
   conflicts with app-level actions (New note, New library, note rename/trash) that stay enabled.
2. **There is no “New note here” in a folder.** The global `New note` creates a draft at the
   library root; a folder’s context menu has no way to create a note inside it.

## In scope

### A — library mutations are app-level

- Remove the active-document Read-mode check from `libraryMutationsEnabled` and every caller:
  New folder, folder rename/move/trash, note/`.md` move, entry menus, Sidebar buttons.
- Keep the real gates: no library, missing library, live lock, unsaved/flush failure. Moving the
  active open note still flushes/closes first; a lock still refuses.
- Read mode keeps gating **document content** (blocks, branches, anchors, table/formula edits).
- Update menu labels/suffixes so no “Read mode” suffix appears on library actions; update the
  vault design §6 to say library organization is app-level and available in Read.
- Tests: open a note in Read, assert New folder, Move to folder and folder trash are enabled and
  work; assert document content commands remain gated. Update the old navigation-only expectation.

### B — New note inside a folder

- Add **New note here** to the folder context menu (and, if cheap, a folder-row action) with the
  same draft semantics as the global New note.
- `createDraftSession` accepts an optional target folder inside the active library:
  - validate it is a directory inside the library root, not a note package, not an asset folder;
  - the draft stays in memory until the first real edit;
  - materialization creates the package **inside that folder**, not the library root;
  - the tab, session, recents, title rules and lock behavior follow the normal draft path.
- Global New note remains root-bound (or the active library root); folder New note targets that
  folder. A missing/invalid folder fails with a clear message, no package is created.
- Tests: folder New note materializes in the folder; root New note unchanged; a folder nested under
  another folder works; invalid/removed folder is rejected; library tree refreshes after
  materialization.

## Out of scope

- Drag/drop move (dialog is fine for v1).
- Changing app-level New note/New library/note trash/rename beyond the gate removal.
- Markdown-native forest, Document health, activity bar, find bar, manual breaks, search, tags.
- Schema/settingsVersion/Page/PDF/layout/showcase changes.
- Legacy migration; the test vault may be rewritten.

## Files

`renderer/src/actions.ts`, `lib/editability.ts` if the helper name changes, `shell/Sidebar.tsx`,
`shell/Dialogs.tsx`, `main/library.ts` (draft target folder), API/preload types, design
`docs/design/vault-library.md`, tests and evidence. Reuse the existing draft/materialize path and
vault scan; no duplicate move/trash logic.

## Acceptance

- [ ] Library mutations work with the active note in Read; document content stays gated.
- [ ] No library action shows a Read-mode suffix/disabled state; missing library/lock/flush still
      gate correctly.
- [ ] Folder “New note here” creates a draft and materializes the package inside that folder.
- [ ] Global New note still materializes at the library root.
- [ ] Tests/evidence updated; no fixed sleeps/native dialogs; no schema/settings/Page/PDF/showcase
      change; existing assertions updated only for the intentional behavior change.

## Evidence and report

- Targeted unit/UI; one `npm run verify:fast`; no full verify (Orchestrator at 4). UI at concurrency
  ≤ 3.
- Screenshots: Read-mode library actions, folder New note before/after materialization.
- `docs/reports/vault-usability-followup.md` with summary, files, checks/timings, PASS/FAIL, risks,
  next step. One commit; worktree/branch/head.
