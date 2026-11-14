# Identity and settings follow-ups — implementation report

**Role:** Implementer / Builder
**Date:** 14 November 2026
**Base:** `70a6144` (`main` head, contains `docs/tasks/identity-followups.md` and ADR-0009)
**Worktree:** `/Users/luca/.t3/worktrees/noteforest/t3-1f831b1c-1d647cc600416dfe`
**Branch:** `t3/document-identity-followups`
**Deliverable:** one worktree, one commit, no merge/push
**Source:** `docs/reviews/sentinel-fixes-recheck.md` (R1, R2, R3, S4 nits), `docs/adr/0009-copy-mints-new-document-id.md`

---

## Summary per item

### R1 — id-safe cleanup agreement between main and renderer

`shared/document-settings.ts` `documentSettingsRemoval` now treats **any other durable entry with
the same `documentId`** as ambiguous, in addition to `sharedIdPaths`. This is the rule the renderer
`forgetDocumentSettings` already used, so main and renderer agree:

- the exact package path is always removed;
- every other same-id durable entry is kept and reported in `keptAmbiguous` (a closed copy in
  another library is in neither the trashed package's root scan nor the session, so its durable
  entry is the only evidence of the shared id);
- the leftover "stale moved path" entry is harmless: `adoptDocumentSettingsEntry` re-keys it on the
  next open (the module already documents orphan tolerance).

Tests:

- unit `documentSettingsRemoval`: the former "unambiguous id removes one stale moved-path entry" case
  is updated to the intentional contract change — the stale entry is now **kept** and reported as
  `keptAmbiguous`. The same-library copy case (with `sharedIdPaths`) is unchanged.
- main integration (`document-lifecycle-main.test.ts`): original in library A, closed same-id copy in
  library B, durable entry only for the copy, one session tab for the original → `trashDocument`
  keeps the copy's entry on disk and its package, and clears the original's session tab.
- renderer memory (`settings-store.test.ts`): `forgetDocumentSettings` keeps a same-id durable entry
  at another path with no `sharedIdPaths`.

The Finder-duplicate path-first rule and the existing same-library two-copy tests are unchanged.

### R2 — debounced materialization must not drop the following immediate write

`settings/page-settings-target.ts` adds the pure `resolveMaterializedPageSettingsTarget`: a captured
`draft:<id>` target whose runtime key no longer exists is resolved to the **open materialized
runtime of the same canonical document id** before the target-gone check. Only a draft key is
retargeted — a captured package path that closed is still reported (the F2 cross-document rule), and
an ambiguous same-id lookup (two open Finder copies) is not guessed.

`usePageSettingsController.executeImmediate` calls it immediately after the pre-execute flush and
before `targetIsGone`; `lastImmediate` stores the retargeted package identity so Retry replays a
successful write. The target is still captured **before** `flushPending` (capture-after-flush stays
forbidden).

Tests:

- unit `page-settings-target.test.ts`: retarget by id; no retarget while the draft key still maps to
  a runtime; no retarget for a closed package path; no retarget when the id lookup is absent or
  still a draft; no retarget for a global target.
- UI `document-lifecycle.test.mjs` (new case): new draft → Settings → Page → Document scope → move
  the density slider (240 ms debounce) and click **A5** in the **same task**, so the debounce cannot
  fire first. The draft materializes, the map holds one package-keyed entry with `density` 1.2 and
  `setup.size === 'A5'`, the footer reports `saved`, there is no `[data-settings-save-error]`, no
  Retry button, the Page preview shows A5 at 120 %, and no `draft:` key remains in memory.
  Screenshot: `artifacts/identity-followups/density-debounce-a5.png`.
- Regression proof: with the `executeImmediate` retarget removed (temporary revert, rebuilt), the new
  UI case fails at the density+size entry wait; restored after the run.

### R3 — Page Edit overlay shows the inline→block reason

`editor/views/formula-node-view.ts` now reports the rejected Inline → Block conversion through the
shared `sonner` toast helper (the pattern already used by `image-insert.ts` and
`formula-term-branch.ts`) instead of `getEditorBindings(...).notify`. The Page Edit overlay mounts
the same node view without editor bindings, so the reason now appears there too; the editor bindings
are still used for the formula-term branch action. No data is at risk: the conversion is rejected
and the formula stays inline.

Test: `m4b1b1-page-edit-overlay.test.mjs` (new case) — a table block with an inline formula in a
cell, opened in the Page Edit overlay; double-click the formula, click Inline/Block, assert the
`stays inline` toast, one inline formula and no block formula in the overlay, then close with Done
and assert the canonical content still has `inlineMath` and no `mathBlock`.
Regression proof: with the fix temporarily reverted (rebuilt), the toast assertion fails; restored.

### S4 nits

- `tests/ui/m4b1a2-read-mode-gating.test.mjs` — test opener and first statement split onto separate
  lines.
- `apps/desktop/test/document-lifecycle-main.test.ts` — same formatting fix (refuses-a-live-lock
  case).
- No historical review doc was rewritten.

### ADR-0009 — Save a copy mints a new document id

- `packages/core/src/document.ts` adds the pure `createDocumentCopy(document, { title, context? })`:
  fresh id from the core id factory (retries a colliding id instead of reusing the source's),
  title from the destination package name (`Untitled` fallback), `createdAt`/`updatedAt` at copy
  time, revision 1; content, anchors, branches, shared children, assets, annotations, and unknown
  fields are cloned verbatim. The source document is never mutated.
- `apps/desktop/src/main/library.ts` `saveDocumentCopy` writes
  `createDocumentCopy(document, { title: path.basename(target) })` through the existing atomic
  package-copy writer. Assets still copy as today, the existing validation inside
  `writeDocumentPackageCopy` runs before the write, the original package is never written, and the
  copy opens with its own identity/revision 1 (tab title from the new document title). Per-document
  Page settings are keyed by document id, so the copy starts on the global layer.

Tests:

- core unit `model.test.ts`: distinct ids for two copies, destination title (trimmed), revision 1,
  copy-time timestamps, content/anchors/branches preserved, source untouched, colliding-id retry,
  blank-title fallback, unknown root fields preserved, valid canonical document.
- main integration `document-lifecycle-main.test.ts`: two `saveDocumentCopy` calls from one document
  get distinct ids and titles; the copy opens with revision 1 and its own title; content and assets
  are preserved; the original bytes are unchanged; the source's per-document override is not
  inherited and no copy-id entry appears; trashing the original after a copy keeps the copy's
  override and session tab.
- The Finder-style same-id duplicate path-first test is unchanged and green.
- Intentional assertion update in the critical e2e `tests/e2e/m2-editor.test.mjs` (save-copy rescue
  case): it previously asserted `copy.id === original.id`; per ADR-0009 it now asserts a **new**
  document id, title `rescued copy`, and revision 1, plus the unchanged every-block assertion.

F2 and the table projection are untouched (`lib/table-cell.ts`, `lib/adapter.ts` unchanged). No
schema, `settingsVersion`, Page/PDF, export, or showcase change.

---

## Files changed

Source:

- `apps/desktop/src/shared/document-settings.ts`
- `apps/desktop/src/renderer/src/settings/page-settings-target.ts`
- `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts`
- `apps/desktop/src/renderer/src/state/registry.ts`
- `apps/desktop/src/renderer/src/editor/views/formula-node-view.ts`
- `apps/desktop/src/main/library.ts`
- `packages/core/src/document.ts`

Tests:

- `apps/desktop/test/document-settings.test.ts`
- `apps/desktop/test/settings-store.test.ts`
- `apps/desktop/test/page-settings-target.test.ts`
- `apps/desktop/test/document-lifecycle-main.test.ts`
- `packages/core/test/model.test.ts`
- `tests/ui/document-lifecycle.test.mjs`
- `tests/ui/m4b1b1-page-edit-overlay.test.mjs`
- `tests/ui/m4b1a2-read-mode-gating.test.mjs` (formatting nit only)
- `tests/e2e/m2-editor.test.mjs` (intentional ADR-0009 contract assertion)

Docs:

- `docs/reports/identity-followups.md` (this report)

Evidence (git-ignored): `artifacts/identity-followups/density-debounce-a5.png`.

---

## Checks run (real timings)

- `npm ci --no-audit --no-fund` — 199 packages, **2 s** (fresh worktree).
- `npx vitest run apps/desktop/test/document-settings.test.ts apps/desktop/test/settings-store.test.ts`
  — **51/51**, 426 ms.
- `npx vitest run apps/desktop/test/page-settings-target.test.ts` — **14/14**, 65 ms.
- `npx vitest run packages/core/test/model.test.ts apps/desktop/test/document-lifecycle-main.test.ts`
  — **43/43**, 2.03 s.
- `npm test` — **132 files / 1,333 tests passed, 7.85 s**.
- `npm run typecheck` — clean (desktop node + web, core, layout, pdf).
- `npm run build` — success.
- `npm run check:boundaries` — **228 files / 1,061 imports / 16 rules**.
- Targeted UI (built app, hidden windows, one file per process):
  - `node --test tests/ui/document-lifecycle.test.mjs` — **9/9**, 9.15 s suite, 17.3 s command
    (new R2 case 600 ms).
  - `node --test tests/ui/m4b1b1-page-edit-overlay.test.mjs` — **9/9**, 7.78 s suite, 15.9 s command
    (new R3 case 637 ms).
  - `node --test tests/ui/special-text.test.mjs` — **9/9**, 11.4 s suite, 19.5 s command (the shared
    formula toast path is unchanged for Continuous Edit).
  - `node --test --test-name-pattern "saves a copy of the unsaved content" tests/e2e/m2-editor.test.mjs`
    — **1/1**, 2.42 s test, 10.5 s command.
- `npm run verify:fast` (final tree) — **exit 0**: typecheck clean, unit **132 / 1,333**, critical
  e2e **16/16**, 35.5 s suite, 43.6 s command.
- Regression proofs (temporary reverts, each rebuilt then restored; not committed): R2 UI case fails
  without the target resolution; R3 UI case fails without the toast fix.

No full `npm run verify` was run, per the brief; the Orchestrator owns it at UI concurrency 4. No
UI suite was run above concurrency 1.

---

## Acceptance row status

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | R1 any same-id durable entry is ambiguous; main and renderer agree; cross-library closed-copy case keeps the copy's entry; tests | **PASS** | `documentSettingsRemoval` + unit case; main integration (library B closed copy survives the trash); renderer store case |
| 2 | R2 density-debounce + A5 materializes and writes; no false "closed"; Retry works; UI test | **PASS** | Pure resolver + controller retarget before the gone check; same-task UI case; footer `saved`, no error/Retry, preview A5 120 %; regression proof |
| 3 | R3 Page Edit overlay shows the inline→block reason; test | **PASS** | Shared toast helper in the node view; Page Edit table-cell formula case; regression proof |
| 4 | Nits fixed | **PASS** | Two test-opener formatting fixes; historical review docs untouched |
| 5 | ADR-0009 Save a copy gets a new id/title/revision/timestamps; tests | **PASS** | Core helper + main copy; two copies distinct; revision 1; title from destination; source untouched; assets kept; no inherited override; trash-original keeps copy override/tab; intentional e2e update |
| 6 | No F2, schema, settingsVersion, Page/PDF, export, or showcase change | **PASS** | `lib/table-cell.ts`/`lib/adapter.ts` untouched; no schema/version/Page/PDF/export/showcase files in the diff |
| 7 | No fixed sleeps/native dialogs; existing assertions updated, none weakened | **PASS** | No `waitForTimeout`/sleep; the R2 test is same-task deterministic; two intentional assertion updates listed; no assertion removed |

---

## Open questions / risks

- **Intentional assertion changes.** 1) The critical e2e save-copy case now expects a distinct id,
  the destination title, and revision 1 (ADR-0009). 2) The unit "unambiguous id removes a stale
  moved-path entry" now expects the entry to be kept (R1). Both are contract changes, not weakened
  assertions; the same-library copy case and Finder-duplicate path-first rule still have their
  original assertions.
- **`keptAmbiguous` is still a main-process warning only.** The user-visible activity surface stays
  future work; the correct entry survives.
- **Duplicate-id settings representation.** The durable map still stores one override per document
  id; after ADR-0009 app-created copies no longer collide, so the residual ambiguity is limited to
  Finder duplicates.
- **Copy title edge case.** The destination basename is used verbatim (trimmed); a user-typed
  `Untitled` name becomes `Untitled`. The dialog default remains `<name> copy`.
- **Escape inside a Page Edit formula source** also closes the overlay (the source does not stop
  propagation). Pre-existing behavior, outside this brief; the R3 test uses Done to avoid ordering
  dependence.
- **Merge seam.** No overlap with the parallel builder's `actions.ts` / core-commands edits:
  `packages/core/src/document.ts` is the factory module and `packages/core/src/index.ts` already
  re-exports it, so no index edit is needed.

---

## Next step

Targeted Sentinel re-check of this diff against R1–R3, the nits, and ADR-0009, then one full
`npm run verify` at UI concurrency 4 by the Orchestrator and integration of the single commit.
