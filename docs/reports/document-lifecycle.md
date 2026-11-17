# Document lifecycle — review hardening (H), drafts (L3), document management (L4)

**Role:** Implementer / Builder
**Date:** 13 November 2026
**Worktree:** `a builder worktree`
**Branch:** `t3/document-lifecycle-draft-trash`
**Base:** `ea47e99` (`main` head after L1+L2)
**Commits:**
- `2fcefb6` — Commit H, L1+L2 review hardening.
- `e6ea140` — L3+L4. **Product-owner update:** the per-file L3/L4 split was stopped; all
  remaining draft and document-management work is folded into this one commit on top of H.
  No working functionality was reverted.

---

## Summary

### Commit H — L1+L2 review hardening (`2fcefb6`)

- `no-left-accent` now covers `.nf-block-body` (the real Continuous card), `.nf-block-inner`,
  `.nf-page-card`, `.nf-page-sheet` and the `data-callout` card. It also rejects a left accent
  shadow. The UI suite now asserts a selected Continuous block and an anchored outline row both
  have `0` left border and only the full-row/card ring.
- New deterministic failed-flush test: an externally modified open package makes the pre-switch
  flush fail; the active library is unchanged, the refused library is not recorded, and the save
  error is visible. No fixed sleeps, no native dialog.
- `reconcileMovedDocuments` now reports `recentChanged`; a moved recent with **no open tab**
  returns a fresh `LibraryView.recent` in the same launch (main test added).
- The dead, always-disabled **Remove from Recent** switcher item is gone; Data & About keeps the
  real removal (tested).

### L3 — drafts and materialization (in `e6ea140`)

- Main-process draft session: `document.create` + first block, stable document id, stable
  `draftId`, bound library. **No package folder, no lock, no recent, no session tab.**
- Renderer mounts the draft as `draft:<id>` with the normal runtime/projection. The Library tab
  does not list it; the tab bar does. `TabInfo.tabKey` (the document id) keeps the editor identity.
- First real mutation materializes exactly one package in the bound library:
  - the first keystroke (not the 800 ms autosave), a structural command, rename, image import,
    per-document Page setting, or PDF export;
  - unique folder from the current title (`createUniquePackageDir`), lock acquired with
    `breakStale: true` for the just-created path (stale/corrupt only; a live lock still fails),
    atomic `document.json`, recent registered;
  - the tab key/path swaps **without remounting** the editor: selection, scroll, text undo history
    and the runtime instance survive; no extra structural undo entry. Measured first-keystroke
    materialization (typing → tab path swap) is **31.5–39.4 ms** over five runs.
- Close/quit: an untouched draft is discarded and writes nothing; a dirty draft materializes and
  flushes before close/quit under the existing save-failure policy; drafts are never persisted in
  `shell-session.json`; multiple drafts are allowed and each keeps its creation library.
- A missing bound library keeps the draft in memory with a visible error and
  **Choose another library… / Retry** actions; the draft is never retargeted by a library switch.
- New core pieces: `materializeDocumentPackage()` writes an existing in-memory document into a new
  package (validation first, atomic write, stale-lock break, recent) and `DocumentRepository.adopt()`
  registers the resulting store.

### L4 — rename, reveal, Move to Trash (in `e6ea140`)

- **Rename**: existing `document.rename` title command from the Library row menu, inline dialog with
  validation. The package folder name stays stable; no path/tab/recent churn. A read-only runtime
  disables the row-menu rename with the reason; a draft renames after materializing.
- **Reveal**: existing `revealDocumentPath` from the row menu; disabled for a draft.
- **Move to Trash**:
  - row menu + confirmation naming the title and full path; primary **Move to Trash**, **Cancel**
    focused by default; the dialog is a real alert surface (not a native dialog);
  - an open document flushes first (including an open Page Edit); a failed flush blocks the trash
    with the save error and leaves the package untouched;
  - a **live** lock held by another session is refused without a dialog; a stale/corrupt lock may
    be broken only after the explicit confirmation; a newer-schema package shows a stronger warning;
    a missing package (no `document.json`) offers **Remove from recents** instead;
  - the store is closed and the lock released **before** `shell.trashItem` (OS Trash); there is no
    recursive delete anywhere;
  - on success: recent entry, per-document settings entry (document id first, path fallback),
    session tab and library row are cleaned up, the tab closes and the next tab activates;
  - on failure: the folder is untouched, the error is shown and the document can be reopened;
  - the library root itself can never be trashed (LD-12: remove from recents only).

---

## Files changed

**Core**
- `packages/core/src/node/store.ts` — `materializeDocumentPackage`, shared package writer.
- `packages/core/src/node/repository.ts` — `adopt(store)`.
- `packages/core/test/materialize.test.ts` — identity/content, unique folders, stale vs live lock,
  invalid document.

**Main process / shared / preload**
- `apps/desktop/src/shared/api.ts` — draft and document-management contract; `ApplyResult.packagePath`,
  `SaveSuccess.packagePath`.
- `apps/desktop/src/shared/drafts.ts` (new) — `draft:<id>` key helpers.
- `apps/desktop/src/main/library.ts` — draft registry, create/materialize/rebind/discard, draft
  routing for apply/save/import, trash preflight/trash/remove-missing, session/recent/settings cleanup,
  fresh recent scan on moved recents.
- `apps/desktop/src/main/index.ts` — `draft:*`, `document:trash*`, `document:remove-missing` IPC;
  `shell.trashItem`; discard drafts after close.
- `apps/desktop/src/main/document-settings.ts` — remove one document's entry by id/path.
- `apps/desktop/src/preload/index.ts` — the new IPC surface.

**Renderer**
- `state/document-gateway.ts`, `electron-document-gateway.ts`, `memory-document-gateway.ts` —
  `materializeDraft` port.
- `state/document-session.ts` — dynamic document key + path adoption.
- `state/runtime.ts` — mutable package path, draft detection, `ensureMaterialized`, draft error,
  first-keystroke trigger, dirty-only save materialization.
- `state/registry.ts` — rekey the runtime on a path swap.
- `state/shell.ts` — `tabKey`, `rekeyDocument`, trash dialog state.
- `state/session.ts`, `state/scroll-store.ts` (new) — drafts excluded from the session; scroll carried
  across the swap.
- `state/settings.ts` — adopt a draft override to the package path; drop the entry after trash.
- `actions.ts` — `+` creates a draft, retry/choose-library, tab/path swap coordination, rename
  materialization, draft close, trash confirmation flows, row menus.
- `editor/DocumentEditor.tsx` — editor identity independent of the path; `docChanged`-only updates.
- `shell/TabBar.tsx`, `shell/Workspace.tsx`, `shell/DraftMaterializeBanner.tsx` (new),
  `shell/Dialogs.tsx`, `styles.css` — stable tab identity, draft error surface, trash dialog.
- `export/export-flow.ts`, `lib/image-insert.ts`, `settings/usePageSettingsController.ts` —
  materialize before export/asset/settings writes.
- `App.tsx` — tab keys, draft/trash state exposure for tests.
- `test/document-session.test.ts`, `test/draft-runtime.test.ts` (new),
  `test/document-lifecycle-main.test.ts` (new) — runtime/main coverage.

**UI / e2e**
- `tests/ui/document-lifecycle.test.mjs` (new), `tests/ui/suites.mjs` — draft lifecycle, path swap,
  settings/export materialization, rename/reveal/trash, missing package, live lock, flushes.
- `tests/ui/library-surface.test.mjs`, `ui-document-status.test.mjs`, `ui-batch-a.test.mjs`,
  `tests/e2e/m2-editor.test.mjs` — updated to draft semantics and draft-aware tab identity.

---

## Checks (real timings)

### Final gate — `npm run verify:fast` (exit 0, **53.39 s**)

- boundaries: **194 files, 933 imports, 16 rules** — pass.
- typecheck: desktop (node + web), core, layout, pdf — pass.
- unit: **122 files / 1244 tests** in **4.31 s** — pass.
- e2e critical: **16/16** in **42.79 s** — pass, 0 pageErrors.

### Targeted UI suites (each with a fresh build)

| Suite | Result |
|---|---|
| `document-lifecycle.test.mjs` | 6/6 pass |
| `library-surface.test.mjs` | 7/7 pass |
| `ui-document-status.test.mjs` | 3/3 pass |
| `ui-batch-a.test.mjs` | 6/6 pass |
| `v0-shell-frame.test.mjs` | 8/8 pass |
| `ui-batch-v.test.mjs` | 5/5 pass |
| `ui-batch-b.test.mjs` (settings) | 10/10 pass |
| `m4e1-settings-platform.test.mjs` | 4/4 pass |
| `ui-overlay-command-gate.test.mjs` | 7/7 pass |
| recovery (`test:recovery:run`) | 14/14 pass |

First-keystroke materialization measurement (Electron UI, five runs): **39.4, 34.5, 31.6, 31.5,
31.5 ms** from typing to the tab path swap.

### Screenshots

`artifacts/document-lifecycle/`: `draft-untouched.png`, `draft-blocked.png`, `draft-materialized.png`,
`trash-confirmation.png`, `trash-next-tab.png`; `artifacts/ui-document-status/draft-live-lock.png`.

---

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| No-left-accent guard covers body/inner/page/callout; selected block + anchor row 0 left border, full-row ring | **pass** | `no-left-accent.test.ts`; library-surface computed-style assertions |
| Failed flush blocks a library switch; active library unchanged | **pass** | library-surface “blocks a library switch…” |
| Moved recent with no open tab returns a fresh `LibraryView.recent`; main/UI test | **pass** | `library-roots-main` “returns a fresh recent list…” |
| Dead switcher Remove from Recent gone; Data & About keeps removal | **pass** | library-surface switcher/Data assertions |
| `+` shows a draft; nothing in folder/recents/locks until first modification | **pass** | document-lifecycle test 1; main draft tests |
| First edit/command/rename/asset/export/settings materializes one package; path swap without remount; undo/selection/scroll survive | **pass** | document-lifecycle test 2 and settings/export test; draft-runtime tests; core materialize tests |
| Untouched close/quit writes nothing; dirty close/quit saves; missing library blocks with a choice; stale locks break, live locks fail | **pass** | document-lifecycle test 1; main draft tests; UI live-lock banner |
| Drafts not persisted; materialized documents are | **pass** | document-lifecycle test 1; `buildSession` filter |
| Rename title only; Reveal; Move to Trash OS Trash, flush first, live-lock refusal, cleanup, next tab, never the library folder | **pass** | document-lifecycle tests 3–6; main trash tests |
| No backup UI, external documents, multi-root, search, R4/R6, schema change | **pass** | scope untouched |
| Existing assertions updated, none weakened; no fixed sleeps/native dialogs | **pass** | retries are condition-based; UI tests use the E2E dialog guard |

---

## Decisions, deviations and risks

- **Draft first block content**: the draft is created with an explicit empty paragraph so the mount
  normalization cannot count as a “first edit”. Without it, an untouched draft materialized on quit.
- **Editor updates**: `onUpdate` now ignores transactions without `docChanged`, so `setEditable` and
  other programmatic transactions cannot dirty or materialize a draft.
- **Trash preflight vs an open store**: a package whose `document.json` is gone is reported as
  `missing` even if an open store still holds the in-memory document; the row offers Remove from
  recents.
- **OS Trash in UI tests**: the document-management UI suite performs the real `shell.trashItem` on
  temp packages (source path disappears); main tests inject a deterministic move. No Finder/Trash UI
  is read.
- **Active library after materialization**: when the bound library is not active, materializing the
  active tab makes that tab's library active again (LD-03 tab-follows-library). The draft itself was
  never retargeted; the package is always written to the creation library.
- **Risk (S3)**: Remove from recents for an open, already-missing package discards in-memory unsaved
  edits (the file they would be saved to is gone). The confirmation copy explains that no file is
  deleted; a future save-failure/recovery pass could offer “Save a copy” first.
- **Risk (S4)**: the draft path swap migrates shell view state, collapsed topics, scroll and settings
  entries, but a Page Edit overlay open at the exact swap moment is only committed by the flow that
  materializes it (settings/export close/commit it first). Not observed in tests.
- **Risk (S4)**: the Library tab refreshes after materialization via the active-tab library sync; a
  package materialized while its tab is inactive and whose library is not active is visible after the
  next refresh/activation.

## Next step

R4 Export defaults (`settingsVersion: 4` for the `export` namespace), per the plan. The draft and
document-management surfaces are ready for the Orchestrator’s full `npm run verify` and the
product-owner visual/VoiceOver pass.
