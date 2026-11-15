# Vault library usability follow-up — implementation report

**Task:** `docs/tasks/vault-usability-followup.md` (A: library organization is app-level; B: New note
inside a folder)
**Design:** `docs/design/vault-library.md` §6 (updated)
**Role:** Implementer / Builder
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-bfbdb245-876232adb1e04d03`
**Branch:** `t3/vault-usability-followup`
**Base:** `8cfd49f` (`main` head at delegation; the brief and design update are in this base)
**Head:** the single commit on this branch; its SHA is reported in the handoff message (a report
cannot contain the hash of the commit that introduces it)
**Verdict:** **PASS** for A and B acceptance, with the risks and follow-ups below.

---

## 1. Summary

### A — library organization is app-level

- `libraryMutationsEnabled()` no longer looks at the active document, its runtime, or its
  `interactionMode`. Its only renderer gate is the real one: an open, present library
  (`library !== null`, `libraryPath` non-empty, `missing === false`). No library and a missing
  library still refuse with a short toast (`Open a library before creating or changing files.`).
- The refusal path (`vaultMutationBlocked`) now guards only folder create/rename/move dialog entry
  points and the vault operations themselves; it never mentions Read mode.
- Every Read-mode suffix and disabled state is gone from the library surfaces:
  - folder context menu (`New note here`, `New folder…`, `Rename folder…`, `Move to folder…`,
    `Move to Trash…`);
  - note and `.md` row menus (`Move to folder…`);
  - Library header `New folder` (`aria-label`/`title` are always the plain label; only missing/no
    library disables it) and the library switcher’s `New folder…`.
- Kept real gates unchanged: missing/no library, live lock (main-process preflight), unsaved or
  failed flush (`closeTabsForVaultChange` closes and flushes tabs, and reopens them on refusal),
  and the note-rename `read-only` gate (`runtime.editable`, i.e. a read-only/locked package).
- Document **content** stays Read-gated: `editingEnabledFor` is untouched for blocks, branches,
  anchors, table/formula edits, palette content commands, undo, and the Outline add/menus. The UI
  test asserts the Outline `Add chapter` button is still disabled with the shared Read-mode reason
  while every library action is enabled.

### B — New note inside a folder

- The folder context menu starts with **New note here** (`vault-new-note`), followed by a separator
  and the existing folder actions.
- `createDraftSession(input?: CreateDraftInput)` accepts an optional `targetFolderPath`:
  - the draft stays in memory (no package, no lock, no recent entry) until the first real edit;
  - the target is validated at creation **and again at materialization**: an existing normal folder
    at or under the active library root. It refuses a note package, a `document.json` folder, a
    `.md` file, `assets/`, `*.assets/`, `backups/`-style and hidden folders, symlinks, and any path
    outside the library. Path validation uses canonical paths, so a symlinked parent cannot escape
    the library;
  - materialization passes the folder as the package parent to the existing
    `materializeDocumentPackage`, so the package, its `assets/`, and its lock land inside that
    folder. Nothing duplicates the move/trash/scan logic;
  - a folder removed or replaced after creation fails with `not-found` and a clear message (“That
    folder no longer exists: … Choose another folder for this note.”) and writes nothing; the draft
    stays in memory so the user can create the folder again and Retry;
  - re-binding a draft to another library (`chooseDraftLibrary`) clears the folder target: the old
    path belonged to the missing library, and the note restarts at the chosen library’s root.
- The global New note (header `+`, `⌘N`, palette, tab menu, empty-canvas button) stays root-bound;
  the UI test materializes one and asserts it lands at the library root.
- The materialization IPC result already carries the post-write library scan; the renderer now
  applies it in `handlePackagePathChange`, so the sidebar tree shows the new note inside its folder
  immediately (no manual Refresh). This is a behavior fix for drafts in general, not only folder
  targets.
- The draft’s failure code for a vanished destination is now `not-found` on both failure paths
  (direct materialization and the content-commit path) instead of a generic `unknown`, so the draft
  banner reports the real reason (`draftError.code`). The user-facing message was already correct.

### Design doc

`docs/design/vault-library.md` §6 now states: New note here creates one in-memory draft with that
folder as target, validates it at creation and materialization, refuses note packages/asset
folders/hidden folders/outside paths, and keeps the global New note root-bound; library
organization is app-level with no Read-mode disabled state or suffix, and the real gates are no
library, missing library, live lock, and unsaved/failed flush. §8 lists the new main/UI tests.

---

## 2. The UI hang (root cause and fix)

**Symptom.** `tests/ui/vault-library.test.mjs` timed out after 4/5 tests, and an Electron test app
with `userData = artifacts/vault-library-temp/folder-gone-support` survived and blocked later runs.

**Which test.** The fifth test, *“refuses a folder that disappeared before the first edit and
creates no package”*. Step logging showed the body reached the draft banner and then stopped; the
test never reported its own assertion.

**Log (before the fix).**

```text
[folder-gone] … wait banner
[folder-gone] banner code=unknown text="That folder no longer exists: …/folder-gone-library/Personale. Choose another folder for this note."
[folder-gone] tab=draft:… draft=unknown
✖ keeps library organization… / file cancelled at timeout
```

**Root cause — two layers, neither is a native dialog or OS Trash:**

1. **Product mismatch (real, now fixed).** The banner code was `unknown` although the main process
   returned `not-found` with the right message. The first keystroke commits content through
   `apply(block.editContent)`; when that command triggers main-process materialization and the
   target folder is gone, `document-session.commitContent` collapsed every non-read-only code to
   `unknown`. The message was correct, the code was lossy. `commitContent` now preserves
   `not-found` (and `read-only`), and the save path maps a missing library **and** a missing target
   folder to `not-found`, so both paths agree. The test’s assertion on the code is therefore
   meaningful rather than relaxed.
2. **Test/cleanup defect (the actual hang).** With that assertion failing, the draft was left dirty
   and could not materialize. On `afterEach` → `h.quit()` the main process correctly refused to
   quit: the flush returned `block`, the E2E save-all attempt failed, the E2E dialog guard answered
   the error prompt with its non-blocking default (no native dialog opened, nothing waited for a
   human), and the quit was cancelled with the window open. Playwright’s
   `ElectronApplication.close()` then waited for an exit that never came — it has no timeout — so
   the suite hung and the app stayed alive.

**Cleanup added (no orphan can survive a run):**

- `tests/support/harness.mjs` `quit()`: every unbounded wait is now bounded — the quit `evaluate` is
  raced with 10 s, the `close()` handshake with 5 s, and the main process is `SIGKILL`ed when it is
  still alive afterwards (the existing stale-userData fallback, now guaranteed to be reached).
- `tests/ui/vault-library.test.mjs`: `before`/`after`/`afterEach` call `killTestAppsUnder(tempRoot)`;
  the `afterEach` kill runs in a `finally` after `h.quit()`, and each test carries an explicit
  timeout so a hang fails by name instead of cancelling the file.
- The fifth test discards the unmaterializable draft through the real discard path
  (`closePath`, save: false) before the test ends — a dirty draft that cannot be saved must never be
  left for the quit path.
- Verified: with the discard deliberately removed (dirty draft left open), the file still completed
  in 13.7 s (8 s quit grace + 5 s close grace + kill) with **no surviving Electron process**; with
  the discard it finishes in 0.8 s. No native dialog and no OS Trash is involved in this test; the
  real OS Trash flow is the folder-trash step of the Read-mode test and passed.

---

## 3. Files changed

### Main / shared / preload

- `apps/desktop/src/main/library.ts` — `DraftSession.targetFolderPath`, `resolveDraftTargetFolder`
  (canonical containment, reserved segments, note/asset/hidden/symlink/outside refusal),
  `createDraftSession(input)`, materialization into the target folder with re-validation,
  `chooseDraftLibrary` clears the target, `draftSessionPaths` exposes it (diagnostics/tests).
- `apps/desktop/src/main/index.ts` — `draft:create` accepts a validated `{ targetFolderPath }`.
- `apps/desktop/src/shared/api.ts` — `CreateDraftInput`, `DraftView.targetFolderPath`,
  `createDraft(input?)`.
- `apps/desktop/src/preload/index.ts` — passes the optional input through.

### Renderer

- `apps/desktop/src/renderer/src/actions.ts` — Read-mode-free `libraryMutationsEnabled` and block
  message, no Read-mode suffixes anywhere in the library menus, `New note here` entry,
  `createNewDocument(targetFolderPath?)`.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — header `New folder` label/title no longer
  depends on Read mode; the memo depends on the library.
- `apps/desktop/src/renderer/src/state/runtime.ts` — materialization passes the fresh library scan
  to `onPackagePathChange`; the draft save path preserves `not-found`.
- `apps/desktop/src/renderer/src/state/registry.ts` — applies the post-materialization library scan
  (tree refresh) before re-keying the tab.
- `apps/desktop/src/renderer/src/state/document-session.ts` — preserves `not-found` from a failed
  content commit instead of collapsing it to `unknown`.

### Docs

- `docs/design/vault-library.md` — §6 app-level library organization, New note here semantics and
  validation, real gates; §8 test list.

### Tests / harness

- `apps/desktop/test/document-lifecycle-main.test.ts` — new `New note in a folder (vault
  usability)` suite (4 tests: nested-folder materialization and tree, root New note unchanged,
  invalid targets refused with no draft/package, removed target refused at materialization with the
  draft preserved).
- `tests/ui/vault-library.test.mjs` — rewritten Read-mode test (library actions enabled and working,
  content still gated), new folder New note test (nested target, no write before the first edit,
  package inside the folder, tree refresh without Refresh, root New note unchanged), new
  removed-folder test (banner, `not-found`, no package, discard), per-test timeouts, stale-app
  cleanup.
- `tests/support/harness.mjs` — bounded quit/close with a `SIGKILL` fallback.

---

## 4. Checks run

| Check | Command | Result |
|---|---|---|
| Install (fresh worktree) | `npm ci` | OK — 210 packages, 0 vulnerabilities |
| Boundaries | `npm run check:boundaries` (inside `verify:fast`) | PASS |
| Typecheck | `npm run typecheck` | PASS — desktop (node + web), core, layout, pdf |
| Unit (all) | `npm test` | PASS — **145 files / 1,445 tests**, 6.02 s |
| Draft/vault main unit | `npx vitest run apps/desktop/test/document-lifecycle-main.test.ts` | PASS — 24 tests, 2.22 s |
| **Fast gate** | `npm run verify:fast` | **PASS** — critical e2e 16/16, e2e suite 35.2 s, command 45.3 s |
| Vault UI suite | `node --test tests/ui/vault-library.test.mjs` | PASS — 5/5, 5.2 s suite (15.2 s incl. launch) |
| Lifecycle UI (serial) | `node --test tests/ui/document-lifecycle.test.mjs` | PASS — 9/9, 9.2 s |
| Read gate + library + shell UI | `node --test --test-concurrency=3` on `m4b1a2-read-mode-gating` + `library-surface` + `ui-batch-a` | PASS — 16/16, 22.8 s |
| Hang hardening | same suite with the discard removed (dirty unmaterializable draft) | PASS — 13.7 s, no surviving Electron process |

No full `npm run verify` was run (the Orchestrator owns the integration run at UI concurrency 4).
Targeted UI ran at concurrency ≤ 3. No fixed sleeps, no native dialogs, no OS Trash outside the
existing folder-trash step (temp vault only).

### Evidence (screenshots)

Visible-window runs at 1440 × 900; repo-relative and gitignored:

- `artifacts/vault-library/library-read-actions.png` — a note open in **Read** (read segment active)
  with the Library header `New folder`/`New note` enabled and no Read-mode label.
- `artifacts/vault-library/folder-new-note-before.png` — after **New note here** on
  `Università/Analisi`: the draft tab is open and `Analisi` still contains only `Serie uno` on disk
  (nothing written yet).
- `artifacts/vault-library/folder-new-note-after.png` — first edit materialized: `Untitled` appears
  under `Università → Analisi` in the tree, the tab kept its editor and content, and the root note
  is untouched.
- `artifacts/vault-library/folder-new-note-missing-target.png` — target folder removed: the draft
  banner states the folder no longer exists; no package was created.
- `artifacts/vault-library/folder-trash-dialog.png` and `library-after-folder-trash.png` — the
  folder-trash confirmation and result, still exercised from Read mode.

---

## 5. Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Library mutations work with the active note in Read; document content stays gated | **PASS** | UI test: New folder, Move to folder and folder trash succeed while `interactionMode === 'read'`; Outline `Add chapter` still disabled with the Read-mode reason; `library-read-actions.png` |
| No library action shows a Read-mode suffix/disabled state; missing library/lock/flush still gate | **PASS** | Folder menu entries carry no suffix and are not `aria-disabled` in Read; header label is plain `New folder`; `libraryMutationsEnabled` only checks library presence; lock/flush refusals unchanged (`closeTabsForVaultChange`, main preflight); existing lock/flush tests green |
| Folder “New note here” creates a draft and materializes the package inside that folder | **PASS** | Main test (nested folder, package path under the folder, tree contains it); UI test (draft writes nothing, package inside `Università/Analisi`, tree refresh, typed text on disk); `folder-new-note-before/after.png` |
| Global New note still materializes at the library root | **PASS** | Main test (root package) and UI test (root `untitled` while the folder package stays in `Analisi`) |
| Tests/evidence updated; no fixed sleeps/native dialogs; no schema/settings/Page/PDF/showcase change; only intentional assertion updates | **PASS** | 4 new main tests, 3 rewritten/new UI tests; no schema/settings/layout/PDF file touched; the only replaced assertion is the old “navigation-only in Read” expectation from the superseded design text |

---

## 6. Risks and known limitations

1. **New note here has no row-level shortcut.** The folder row is a single `<button>`, so a `…`
   action on the row would nest a button; the context menu (right-click) is the entry point, the
   same as rename/move/trash today. A row action needs a row-structure/CSS change and is a UI
   follow-up, not part of this brief.
2. **The new draft opens as the active tab in Continuous Edit**, independent of the previous note’s
   Read mode. This is the existing New note behavior; the previous tab keeps its mode.
3. **A failed materialization keeps the draft in memory** (by design) and the banner offers Retry /
   Choose another library. There is no “choose another folder” action yet; the user can recreate
   the folder and Retry, or close the tab to discard.
4. **Rebinding the draft’s library drops the folder target** and restarts at the new root. There is
   no same-named-folder remap; re-targeting is the follow-up if the product wants it.
5. **Empty or whitespace-only `targetFolderPath`** is refused by the main-process handler with the
   same clear message; the renderer never sends it.
6. **`draftError.code` for the commit path** now distinguishes `read-only` and `not-found`; every
   other command failure remains `unknown`, which matches the previous behavior.
7. **The harness quit bound adds up to ~13 s** to a suite that leaves the app refusing to quit.
   Normal suites quit immediately; the bound only replaces an infinite wait.
8. **The tree refresh on materialization** applies the library scan returned by the same IPC call.
   A second materialization path (`save` returning a new `packagePath`) still relies on the next
   refresh, as before.

## 7. Open questions

- Should folder “New note here” also be a visible folder-row action (needs a row-structure change and
  a product decision on the icon), or is the context menu enough?
- Should a failed folder target offer “Choose another folder…” from the draft banner instead of
  Retry only?

## 8. Next step

Targeted phase-3 Sentinel review of this branch (Read-mode library rule, folder draft target, the
hang fix, and the harness hardening), then integration. Document health (phase 4) remains
unstarted.
