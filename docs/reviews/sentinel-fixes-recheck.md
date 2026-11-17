# Review — Sentinel fixes targeted re-check

- **Reviewer:** Reviewer / Sentinel (independent; no product code changed)
- **Date:** 14 November 2026
- **Base:** `48baac3` (`main` head; the fix under review is `4257154`, its parent is `0917965`)
- **Reviewed diff:** `0917965..4257154` — 25 files, +1,431 / −69, plus the control docs
- **Worktree / branch:** `a builder worktree` — `t3/sentinel-fixes-recheck` (one review commit, no merge/push)
- **Environment:** macOS (darwin), Node 22.23.1, npm 10.9.8, Electron 45.2.1, 10 logical cores, hidden E2E windows, dark shell theme; `npm ci` from the lockfile in this fresh worktree
- **Source review:** `docs/reviews/post-settings-library-special-text-review.md` (F1–F10); briefs `docs/tasks/sentinel-fixes.md`, `docs/tasks/sentinel-fixes-recheck.md`; builder report `docs/reports/sentinel-fixes.md`
- **Verdict: accept with findings.** No S1/S2. **F1, F5, F6, F10 are closed; F7 is closed in the runner; F3 and F4 are closed for the reported scenarios but each leaves one S3 residual; F9's primary path is closed with one S4 Page Edit residual.** F2 stayed untouched as agreed. The two S3 residuals are pre-existing edge interleavings in touched code, not new common-case regressions, and are small follow-ups.

---

## Scope reviewed

The fix commit `4257154`: the Read-mode node-view guard, the id-safe settings/session cleanup, the
draft materialization for immediate Page writes, the typed GFM caret, the inline-code Read guard, the
UI runner default, the F9 nits and the F10 scrollbar corner. I read the complete diff and the tests;
I ran the affected unit and UI suites plus two temporary repros (F3 and F4) that I deleted before
committing. I did **not** duplicate the Orchestrator's full `verify`; its green run at UI concurrency
4 is the integration evidence.

I made one narrow DoD update because the fix made it stale: `docs/definition-of-done.md` §3.5 still
said the runner default was `min(8, availableParallelism() − 2)`; it now records the encoded 4-worker
default (F7). No product, test, spec, UX, ADR or plan file changed.

---

## Findings

| ID | Severity | Area | Location (file:line) | Summary |
|---|---|---|---|---|
| F1 | **Closed** | Read gating / node views | `editor/editor-ui.ts:95-101`; `editor/DocumentEditor.tsx:552-556`; `editor/views/code-block-view.ts:201-221,232-254`; `editor/views/formula-node-view.ts:142-144,187-203,379-423` | The code fence and formula source close on Edit → Read; forced DOM commits/typing/branch/Inline-Block write nothing; the discarded draft does not return; a Read mount never opens an editor. |
| F3 | **Closed for the recorded scenario; residual S3 (R1)** | Settings / library identity | `shared/document-settings.ts:216-248`; `main/library.ts:2305-2321,2357-2372,2380-2407,2410-2465`; `state/settings.ts:438-464` | Same-library two-copy trash keeps the copy's override, in-memory entry, session tab and open tab; reconciliation never binds a duplicate id. A copy that is neither in the trashed package's library root nor in the session still loses its durable entry (R1). |
| F4 | **Closed for the direct flow; residual S3 (R2)** | Settings / drafts | `settings/usePageSettingsController.ts:526-543,591-600,686-743`; `settings/page-settings-target.ts:65-71` | Immediate chrome/size/orientation/preset/use-global writes on a draft materialize and key the override by the package; no `draft:` entry remains; Retry replays the retargeted identity. A pending debounced write that materializes the draft in the pre-execute flush still drops the immediate write (R2). |
| F5 | **Closed** | Typed GFM tables | `editor/table-commands.ts:172-225` | The blank trigger paragraph stays below the table with the caret inside it; typing lands in the document; one undo reverts. |
| F6 | **Closed** | Inline code / Read | `editor/inline-code.ts:58-71` | Delimiters are Edit-only; the stored `code` mark is untouched; returning to Edit restores them for the same caret. |
| F7 | **Closed (runner); S4 docs** | UI test infra | `tests/ui/run.mjs:23-34,59-63`; `docs/plan.md:495-496`; `docs/definition-of-done.md:391-401` | Default is 4; the env/arg override and the 8 cap are unchanged; the DoD sentence was stale and is corrected in this review. `tests/ui/README.md` still names the old default (S4). |
| F9 | **Closed (primary); S4 residual (R3)** | Nits / docs | `code-block-view.ts:98,176-181`; `formula-node-view.ts:205-219,355-377`; `formula-transactions.test.ts:146-221`; `docs/design/ui-shell-map.md`, `docs/design/ui-shell-contents.md` | Cleanup is stored/called; the cell conversion shows a toast in Continuous Edit and keeps the formula inline; the text-anchor regression test resolves; the two scoped docs read 180/640/264. Page Edit has no bindings for the toast (R3); the frozen inventory and `ux-shell.md` still say 208–360. |
| F10 | **Closed** | Scrollbar corner | `styles.css:6114-6119`; `test/ui-batch-v-css.test.ts:50-55` | `::-webkit-scrollbar-corner { background: transparent; }` with a CSS guard; I inspected the dark/gray corners and saw no white square on the dark canvas/table or the light surfaces. |
| F2 | **Invariant held** | Tables / data integrity | `lib/table-cell.ts`, `lib/adapter.ts:280-287` unchanged | The accepted latent limitation is documented in the builder report; no legacy guard or projection change. |

### R1 · The main cleanup removes a same-id durable entry that the renderer keeps (S3, F3 residual)

**Location.** `apps/desktop/src/shared/document-settings.ts:216-248` (`documentSettingsRemoval`
derives `idShared` only from `identity.sharedIdPaths`); `apps/desktop/src/main/library.ts:2380-2407`
(`sharedDocumentIdPaths` scans only the trashed package's library root and the session);
`apps/desktop/src/main/library.ts:2305-2321,2357-2372` (trash/remove-missing pass that list). The
renderer counterpart is stricter: `apps/desktop/src/renderer/src/state/settings.ts:438-464` also
treats any other durable entry with the same id as shared and keeps it.

**Reproduction.** Put a copy of a package (same `document.id`) in a second known library, open it
once, give it a per-document Page override, then close it. In the first library, Move to Trash the
original package. The trashed package's root scan does not contain the copy and the closed copy has
no session tab, so `sharedIdPaths` is empty. `documentSettingsRemoval` sees the only durable entry
(the copy's, same id, another path) and removes it. The renderer's `forgetDocumentSettings` keeps the
same entry in memory (it sees the durable entry), so memory and disk diverge; if the app is closed
before the copy is opened again, the next launch resolves the copy against the global settings.

**Evidence.** Temporary unit repro (deleted; log in
`artifacts/sentinel-fixes-recheck/f3-durable-entry-repro.log`):

```text
PURE_PLAN {"entries":[],"removed":[{"documentId":"shared","packagePath":"/library/copy",...}],"keptAmbiguous":[]}
FILE_REMOVED {"ok":true,"removed":["/library/copy"],"keptAmbiguous":[]}
FILE_ENTRIES []
RENDERER_ENTRIES [{"documentId":"shared","packagePath":"/library/copy",...}]
```

The recorded same-library UI case (`tests/ui/document-lifecycle.test.mjs` "trashing one copy keeps the
other copy override and session tab") passes, so the F3 brief's scenario is fixed. This is the
cross-library/closed-copy variant; it also exposes that main and renderer use different ambiguity
rules.

**Why S3, not S2.** Only a settings override is lost, not document content or anchors; the trigger
needs a copy outside the trashed package's library root, closed, and a restart before it is opened
again. The common same-library and open-copy scenarios are fixed.

**Smallest credible fix.** In `documentSettingsRemoval`, treat any other entry with the same
`documentId` as shared/ambiguous (keep and report), matching the renderer rule; the orphan "stale
moved path" entry this replaces is harmless (the module already documents orphan tolerance, and
`adoptDocumentSettingsEntry` re-keys it on the next open). Update the "uses an unambiguous id to
remove one stale moved-path entry" unit case accordingly and add one case with a single copy entry
and no `sharedIdPaths`.

### R2 · A debounced write that materializes the draft drops the following immediate write (S3, F4 residual)

**Location.** `apps/desktop/src/renderer/src/settings/page-settings-target.ts:65-71` captures the
write target **before** `flushPending` by design (the F2 cross-document guard);
`apps/desktop/src/renderer/src/settings/usePageSettingsController.ts:591-600` applies a pending
debounced write during that flush; `:526-543` materializes the draft; `:692-698` then rejects the
captured `draft:<id>` target as "gone" before the new materialization block at `:703-719` can
retarget it. `lastImmediate` is cleared and `targetLost` is set, so Retry replays the same false
error.

**Reproduction.** New note (untouched draft) → `⌘,` → Page → Document scope → move the density
slider (a 240 ms debounced write) → click **A5** inside that window. The draft materializes (the
density is written), then the A5 write fails with *"The document closed before this change was
saved. Nothing was written."*; the saved override contains `theme.density` only and the preview still
shows A4. Retry shows the same message.

**Evidence.** Temporary UI repro (deleted; log in
`artifacts/sentinel-fixes-recheck/f4-race-repro.log`, screenshot
`artifacts/sentinel-fixes-recheck/f4-race-after.png`):

```text
F4_ERROR "The document closed before this change was saved. Nothing was written."
F4_RETRY_ERROR "The document closed before this change was saved. Nothing was written."
F4_MEMORY {"packagePath":".../untitled","page":{"theme":{"density":0.8}}}
F4_DISK   {"packagePath":".../untitled","page":{"theme":{"density":0.8}}}
```

The same interleaving already existed before this commit (the old immediate path also captured the
draft and bailed after the flush materialized it); the new materialization block does not cover it.
The direct F4 flow (no pending debounce) is covered by the new UI case and passes.

**Smallest credible fix.** Resolve a captured draft target to its open materialized runtime by
document id before the target-gone check (or retarget the capture when the draft key was replaced by
its package), and add one UI case: density (debounced) + A5 inside the debounce. Do not move the
capture after the flush; that would reopen the F2 cross-document defect.

### R3 · The cell-conversion toast is missing in Page Edit (S4, F9 residual)

**Location.** `apps/desktop/src/renderer/src/editor/views/formula-node-view.ts:355-377` reports the
rejected Inline → Block conversion through `getEditorBindings(this.editor)?.notify(...)`; the
bindings are registered only by `DocumentEditor` (`editor/DocumentEditor.tsx:494`).
`page/PageBlockEditor.tsx:89-93` creates the overlay editor with
`createEditorExtensions({ placeholder })` and never calls `setEditorBindings`, so
`getEditorBindings` is null there. A formula in a table cell opened in the Page Edit overlay still
has a dead Inline/Block click with no reason.

**Evidence.** Code inspection; the Continuous Edit path is covered by
`tests/ui/special-text.test.mjs` ("stays inline" toast) and passes. No Page Edit UI repro was added
(temporary or otherwise).

**Smallest credible fix.** Give the Page Edit overlay a notify binding (or a module-level toast
helper) and add the same toast assertion to the Page Edit overlay suite. This is the same F9 nit in
the secondary editing surface; no data is at risk because the conversion is rejected.

### S4 docs and formatting nits

- `tests/ui/README.md:105-108` still says the default pool is
  `min(8, availableParallelism() - 2)` = 8 and records "8 (default here)"; the runner default is now
  4. Update the concurrency-policy paragraph and the timing table.
- `docs/reviews/settings-inventory.md:385` (AP-4) still says the sidebar range is 208–360; the frozen
  inventory was used as the source of truth for the F9 docs fix but itself has the old range. The
  delta inventory's note that the frozen inventory already has 180/264/640 is inaccurate.
- `docs/ux-shell.md:50,63` and the older briefs/reports still say 208–360. The fix brief scoped the
  docs change to `ui-shell-map.md`/`ui-shell-contents.md`, so these are out of scope here; they
  remain part of the known docs sweep.
- `docs/review-checklist.md:3` and `docs/definition-of-done.md:3` still cite spec v0.4.5 (the spec is
  v0.5); this is the pre-existing sweep AGENTS.md already records, not a regression of this fix.
- Formatting: `tests/ui/m4b1a2-read-mode-gating.test.mjs:450` and
  `apps/desktop/test/document-lifecycle-main.test.ts:489` each contain a test opener and its first
  statement on one line (`async () => {    await launch(...)`). No formatter/linter gate exists, so
  this is cosmetic; restore the line break when touching the files.

---

## Finding-by-finding evidence

### F1 — closed

- `editor/editor-ui.ts:95-101` adds `subscribeEditorUi`; `DocumentEditor.tsx:552-556` calls
  `setEditable(false, false)` **before** `setEditorInteractionMode(...)`, so the node views observe
  the mode after editability is removed.
- `code-block-view.ts:201-221` computes `editing` only when `editor.isEditable`; leaving Edit resets
  the language token to the canonical value and `applyVisibility` hides the open fence/close row.
  `commitLanguage`, the close-row action and `copy` are guarded (`:142-146,232-254`).
- `formula-node-view.ts:142-144,379-401` closes the source on the non-editable notification and
  guards `openSource`, `toggleKind`, `commitSource` and `branch`; the Inline/Block auto-edit rAF
  checks `editor.isEditable` (`:90-96`).
- UI test `m4b1a2-read-mode-gating.test.mjs` (new case): Edit → Read with the fence open asserts
  `data-code-state="idle"`, hidden language/close/copy, forced DOM language commit/blur/close/typing
  writes nothing; formula source open with `y^3` then Read asserts the source and action row are
  gone, a Read double-click does not reopen, and the complete canonical `blocks`/`anchors`/`branches`
  plus the runtime revision are unchanged; language `ts`, LaTeX `x^2`; back in Edit the source opens
  with `x^2`. Run **3/3, 20.9 s command** (12.8 s suite).
- The mode mirror only notifies when the interaction mode value changes; a pure credentials/status
  change (read-only) does not notify. Normal status changes rebuild the editor
  (`runtime.applyReopenedSnapshot`/`reloadFromDisk`), and every node-view mutation path re-checks
  `editor.isEditable`, so this does not write; I mention it only as residual risk, not a finding.

### F3 — closed for the brief's scenario; R1 remains

- `documentSettingsRemoval` removes the exact path first, keeps other same-id entries when the id is
  shared, and reports `keptAmbiguous`; `removeDocumentSettingsEntries` never overwrites a
  corrupt/unreadable map.
- `main/library.ts:2380-2407` builds `sharedIdPaths` from the trashed package's library root and the
  session; `removeSessionDocument` drops the exact path and id-scoped tabs only when the id is not
  shared; `reconcileMovedDocuments:628-644` removes every duplicated id from `byId` so a missing tab
  or recent is never rebound to a copy.
- The renderer `forgetDocumentSettings` keeps a same-id durable entry at another path even without
  `sharedIdPaths` (correct); see R1 for the main-side divergence.
- `tabKey` audit: normal opens use `${documentId}:${packagePath}` (`App.tsx:214-218,883-886`;
  `actions.ts:158-166`); drafts keep the document id (`actions.ts:197-201`) so materialization never
  remounts; recovery/missing tabs keep the package path; session restore derives the same key. Two
  tabs of the same path are impossible (`openTab` dedupes by `packagePath`). The UI test opens two
  copies with one id and gives the copy an override; the trash keeps the copy tab, session tab,
  in-memory and on-disk override, and the library row. Run **8/8, 16.6 s command** (8.4 s suite).
- The durable map still stores one override per document id (`upsertDocumentSettingsEntry` matches by
  id). That is the out-of-scope Save-a-copy id ADR: the tested copy-only case is safe, but two
  independent overrides for two same-id copies cannot be represented. Record it as the ADR input, not
  a regression of this fix.
- Ambiguous-id cleanup is a main-process `console.warn` only. Acceptable for this fix: the
  user-visible outcome (the copy keeps its settings/tab) is correct and there is no action the user
  could take until the copy-id ADR; a status surface is future work.

### F4 — closed for the direct flow; R2 remains

- `executeImmediate` now runs the same `isDraft → ensureMaterialized() → retarget` block as
  `applyPending`, stores the retargeted `immediate` in `lastImmediate`, and syncs `packagePathRef`
  for the synchronous draft helpers. The UI test (new note → Page → Document → page-number off, A5,
  Comfortable) asserts the tab becomes a package, the map has exactly one package-keyed entry, no
  `draft:` key in memory or on disk, the document exists, and closing leaves the package entry and no
  orphan. The existing density/margins/theme debounced suites remain green in the Orchestrator's
  full UI run (54/54).
- `lastImmediate`/Retry works after the immediate's own materialization: the stored target is the
  package path, and a failed settings write can be retried. A failed materialization clears
  `lastImmediate`, shows the materialization message, writes nothing, and leaves an untouched draft
  that closes without an entry.
- R2 is the one interleaving where a pending debounced write (not the immediate) materializes first.

### F5 — closed

`convertTableOnBlankParagraph` now reads the run backwards (excluding the blank trigger paragraph)
and sets the caret inside the kept blank paragraph (`table-commands.ts:172-225`). The typed test
asserts the table appears, the last child is a paragraph, the caret is in it, `ZZ` reaches the DOM and
the canonical block, and one undo removes the conversion. It also covers the first-content / last
child case (a new block typed from scratch). Run **9/9, 19.3 s command** (11.2 s suite).

### F6 — closed

`inline-code.ts:68` returns no delimiter decorations when `editor.isEditable` is false. The new
Read/Edit assertions in `special-text.test.mjs` see 0 widgets and no backtick in Read while the `code`
element remains, and 2 widgets again in Edit with the same caret. The stored mark is untouched (the
Read path is decoration-only). Page Read is static; Page Edit remains editable and keeps the
delimiters, as intended.

### F7 — closed in the runner; docs S4

`tests/ui/run.mjs` defaults to 4, `NOTEFOREST_UI_CONCURRENCY` and `--concurrency` still override it,
and the `Math.min(…, 8)` cap is unchanged. `docs/plan.md:495-496` records the 4-way gate and the
8-way timeout. The DoD §3.5 default-pool sentence was stale (it still named the machine formula); I
corrected it in this review. `tests/ui/README.md` remains stale (S4).

### F9 — closed on the primary path; R3 and docs remain

- Cleanup: `CodeBlockNodeView` stores the `installLocalTextKeys` cleanup and calls it in `destroy`;
  `FormulaNodeView` stores it per source and calls it in `closeSource` and `destroy`.
- The cell reason now goes through the existing `notify` toast; the special-text test asserts the
  toast, the inline formula, and no block formula. R3 covers the Page Edit overlay, where the
  bindings are absent.
- `formula-transactions.test.ts` adds the same-paragraph text anchor: after `formulaKindTransaction`
  converts an inline formula to block, the paragraph is projected through `pmToContent` and the
  anchor resolves as `exact-binding` with one range.
- The sidebar docs `ui-shell-map.md`/`ui-shell-contents.md` now say 180–640 with the 264 reset (5
  occurrences). The remaining 208–360 files are outside the fix brief and are listed under S4.

### F10 — closed

`styles.css:6114-6121` adds the transparent corner next to the scrollbar rules; the CSS guard test
reads the declaration. I inspected the builder's four captures: the dark canvas/table corners are the
app surface (no white square), the light surfaces are light by theme, and the wide table wrapper
shows no default-white corner. No layout change.

### F2 — invariant held

`lib/table-cell.ts`, `lib/adapter.ts` and the table projection are untouched; no legacy guard was
added; the builder report records the accepted limitation and its revisit trigger (Markdown
import/legacy document). This matches the product owner's decision.

---

## Invariants and specific risks

| Invariant / risk | Result | Evidence |
|---|---|---|
| F2 untouched; limitation documented | **Pass** | No diff in `lib/table-cell.ts`/`lib/adapter.ts`/the projection; `docs/reports/sentinel-fixes.md` F2 section |
| No schema, `settingsVersion`, Page, PDF, export or showcase change | **Pass** | Diff file list; `settingsVersion` still 5; no `packages/layout`/`packages/pdf`/showcase files |
| No fixed sleeps / native dialogs in the new tests | **Pass** | Diff grep: no `waitForTimeout`/`sleep`/dialog calls; the F4/F3 tests use `waitForFunction`/`waitUntil`; the trash test uses the OS Trash, not a dialog |
| Existing assertions not weakened | **Pass** | No removed assertion in the diff; all changes are additions. Two test-openers were joined with their first statement (formatting, S4); the formula-term test still asserts the disabled state (unchanged from the prior review) |
| Read-mode gating elsewhere (menu/palette/sidebar/keymap/paste/drop/Page) | **Pass** | The full `m4b1a2` suite still passes 3/3; the new node-view case is additive |
| F1 canonical document/revision unchanged under the forced repro | **Pass** | Deep-equal `blocks`/`anchors`/`branches`, revision, `language`, `latex`, plus the UI run |
| Form/table/anchor contracts | **Pass** | `formula-transactions` text-anchor test; `special-text` E/table cases green; no anchor code changed |
| Page/PDF parity | **Not re-run** | No Page/PDF/print change; the M4c3 gate is unchanged |
| `tabKey` uniqueness and draft materialization | **Pass** | UI F3/F4 cases; `DocumentEditor`/`TabBar` keys unique for two same-id copies; drafts keep the id |
| One override per document id | **Accepted limitation (ADR)** | The tested two-copy case is safe; independent per-copy overrides need the Save-a-copy id decision |

---

## Checks run (real timings)

- `npm ci --no-audit --no-fund` — 199 packages, **2 s** (fresh worktree).
- `npm run build` — success (Electron app built for the UI suites).
- `node --test tests/ui/m4b1a2-read-mode-gating.test.mjs` — **3/3**, 20.9 s command, 12.8 s suite.
- `node --test tests/ui/special-text.test.mjs` — **9/9**, 19.3 s command, 11.2 s suite.
- `node --test tests/ui/document-lifecycle.test.mjs` — **8/8**, 16.6 s command, 8.4 s suite.
- `npm test` — **132 files / 1,323 tests passed, 4.59 s**.
- `npm run typecheck` — clean (desktop node + web, core, layout, pdf).
- `npm run check:boundaries` — **228 files / 1,059 imports / 16 rules**.
- Temporary repros (deleted before the review commit; logs under `artifacts/sentinel-fixes-recheck/`):
  - F3 unit repro — main removes the copy's durable entry, renderer keeps it (3/3, `f3-durable-entry-repro.log`);
  - F4 UI repro — density debounce + immediate A5 drops A5 with the target-closed message and Retry repeats it (1/1, `f4-race-repro.log`, `f4-race-after.png`).
- Orchestrator evidence used, not duplicated: full `npm run verify` at UI concurrency 4 — unit 132/1323 (4.64 s), critical e2e 16/16, recovery 14/14, UI 54/54 (207.9 s), 0 failed.

---

## What I could not verify

- The **product-owner visual/VoiceOver pass** over the settings/library/special-text surfaces; I
  inspected the builder screenshots (Read-mode closed fence/source, two-copy survivor, draft
  materialization, GFM caret, Read delimiters, scrollbar corners), but this remains a human gate.
- The **8-way UI pool** (not rerun per the brief); F7's encoded 4 default is the contract.
- The **cross-library two-copy** flow end-to-end; R1 is unit-level evidence (the app path is
  code-inspected).
- **F2's legacy/imported rich-cell loss** (accepted latent limitation, not re-tested).
- **Windows/Linux**, the **showcase document**, **IME composition** in the node-view inputs, and the
  **PDF visual gate** (no print/layout change).

---

## Open questions

1. **R1/R2 are settings-only residuals.** Are they acceptable as follow-ups, or should the batch stay
   open until the small target-resolution and identity-rule fixes are added? Both are visible,
   reproducible, and small; neither loses document content.
2. **Ambiguous-id reporting.** The `keptAmbiguous` warning is main-process only. Acceptable for now
   (the correct entry survives); a user-facing activity surface is future work.
3. **One override per id.** The durable map cannot represent two independent overrides for two
   same-id copies. Confirm the Save-a-copy id ADR is the owner; if it mints ids, the R1 edge disappears
   as well.
4. **Docs sweep.** The DoD runner sentence is fixed here; `tests/ui/README.md`, the frozen inventory
   AP-4 row, `ux-shell.md` and the spec-version headers still need the scheduled sweep (AGENTS.md).

---

## Next step

Integrate `4257154`: no S1/S2 and the reported F3/F4 scenarios are fixed. Schedule the two S3
residuals as a tiny follow-up (R1: treat any same-id durable entry as shared in
`documentSettingsRemoval` and update the stale-move unit case; R2: resolve a captured draft target to
its materialized runtime before the target-gone check, with the density+A5 UI case). Fold R3, the
runner README and the 208–360 docs into the docs/nits pass. The product-owner visual/VoiceOver pass
over the settings, library and special-text surfaces remains open.
