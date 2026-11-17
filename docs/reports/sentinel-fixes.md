# Sentinel fixes — implementation report

**Role:** Implementer / Builder
**Date:** 14 November 2026
**Base:** `0917965` (`main` head, adds `docs/tasks/sentinel-fixes.md`)
**Worktree:** `a builder worktree`
**Branch:** `t3/sentinel-fixes-settings-readonly`
**Deliverable:** one worktree, one commit, no merge/push
**Source review:** `docs/reviews/post-settings-library-special-text-review.md` (F1–F9) plus the
product-owner F10 request

---

## Summary per finding

### F1 — Read mode cannot mutate through the code/formula node views

The node views now observe the shell mode, not only selection/transactions:

- `editor-ui.ts` exposes `subscribeEditorUi(editor, listener)`; `DocumentEditor` already mirrors
  the interaction mode through `setEditorInteractionMode`, so a mode switch notifies both plain-DOM
  node views. The code fence and the formula source listen to it and close on Read.
- `CodeBlockNodeView.syncState` requires `editor.isEditable` before entering `editing`; entering
  Read closes the fence, discards the uncommitted language token (the document value is restored),
  and `commitLanguage`, the close-row action and `copy` are guarded by `editor.isEditable`.
- `FormulaNodeView` closes the source editor on a non-editable update without committing its draft;
  `openSource`, `toggleKind`, `commitSource` and `branch` are guarded by `editor.isEditable`; the
  Inline/Block auto-edit rAF does not reopen the source in Read. A Read double-click is still only a
  `NodeSelection`.
- UI coverage added to `m4b1a2-read-mode-gating.test.mjs`: Edit → Read with the fence open, forced
  DOM language commit/blur/close/typing, then Edit → Read with an unsaved formula draft. It asserts
  the chrome is closed/read-only, then compares the complete canonical `blocks`/`anchors`/`branches`
  and the runtime revision, and asserts `codeBlock.attrs.language === "ts"` and
  `inlineMath.attrs.latex === "x^2"`. Back in Edit the source reopens with `x^2`, proving the Read
  draft was never written.
- Screenshot: `artifacts/sentinel-fixes/read-mode-node-view-closed-1440x900.png`.

### F3 — id-safe settings/session cleanup and reconciliation

- `shared/document-settings.ts` adds `documentSettingsRemoval`: the exact package path is always
  removed; the document id is a second cleanup key only when `sharedIdPaths` names no other known
  package/session tab. When the id is shared, other id-keyed entries are kept and reported as
  `keptAmbiguous`.
- `main/document-settings.ts removeDocumentSettingsEntries` returns
  `{ ok, removed, keptAmbiguous }`, passes the caller's `sharedIdPaths`, and never overwrites a
  corrupt/unreadable map.
- `main/library.ts` computes `sharedDocumentIdPaths` from the scanned library root plus session tabs
  after the OS move; `trashDocument` and `removeMissingDocument` pass it. `removeSessionDocument`
  drops the exact path's tab, drops id-scoped tabs only when the id is not shared, and logs the kept
  same-id tab. `reconcileMovedDocuments` excludes every duplicated id from `byId`, so a missing tab
  or recent is never rebound to the wrong copy, and logs the unresolved ids.
- `renderer/state/settings.ts forgetDocumentSettings` takes `sharedIdPaths` and applies the same
  rule to the in-memory map; `actions.ts` derives those paths from the library list and open runtimes.
- Supporting fix: a normal tab's `tabKey` is now `${documentId}:${packagePath}` (bootstrap, open,
  seed; drafts keep the document id so materialization still never remounts). Two open copies
  previously shared one React tab/editor key because they share `document.id`.
- Tests: pure `documentSettingsRemoval` cases; file-level cleanup cases; a `trashDocument`
  integration test with two packages sharing one id (the copy's override and session tab survive);
  a reconciliation test with two same-id copies (the missing tab stays unresolved). The UI test opens
  two packages with one id, gives the copy a per-document chrome override, trashes the original, and
  asserts the copy tab, session tab, in-memory override and on-disk override survive while the
  original's references are removed.
- Screenshot: `artifacts/sentinel-fixes/two-copy-trash-survivor.png`.

### F4 — immediate per-document Page settings materialize a draft

- `usePageSettingsController.executeImmediate` now runs the same `isDraft → ensureMaterialized()` →
  retarget block as `applyPending` before `commitThenWritePageSettings`; `lastImmediate` stores the
  retargeted identity for Retry, and the draft sync helpers see the package path immediately.
  Materialization re-keys any draft-keyed override through the existing
  `adoptDocumentSettings`/`adoptDocumentSettingsEntry` path.
- UI test: new draft → Settings → Page → Document scope → uncheck Page number (immediate chrome),
  then A5 and Comfortable. The tab becomes a package, the override is keyed by the package, the
  document exists on disk, the map contains exactly that one entry (no `draft:` key in memory or on
  disk), and closing the tab leaves the package entry and no orphan. The existing density test is
  unchanged.
- Screenshot: `artifacts/sentinel-fixes/draft-immediate-materialized.png`.

### F5 — typed GFM Enter keeps the blank paragraph and the caret

- `convertTableOnBlankParagraph` now reads the run backwards only (excluding the blank trigger
  paragraph) and puts the caret at the start of that trailing paragraph. The stale code comment is
  corrected. The Mod-Enter path is unchanged.
- UI coverage: the typed conversion test asserts the caret is in the paragraph below the table and
  that one undo removes the conversion; a second typed conversion in a new block types `ZZ`
  immediately and asserts it reaches both the DOM and the canonical block body.
- Screenshot: `artifacts/sentinel-fixes/gfm-typed-caret-1440x900.png`.
- The review cited `docs/reports/special-text-polish.md:40-49` for a stale "blank paragraph stays"
  claim; those lines are the table-toolbar section and contain no such claim. The only stale text was
  the `convertTableOnBlankParagraph` comment, which now matches the behavior.

### F6 — inline-code delimiter widgets only in Edit

- The decoration plugin returns no widgets when `editor.isEditable` is false; the stored `code` mark
  is untouched. A Continuous Read check was added to the inline-code UI case: Read shows zero
  `.nf-inline-code-delim` widgets and no backtick in the prose text while the `code` element stays;
  back in Edit the widgets return for the unchanged caret.
- Screenshot: `artifacts/sentinel-fixes/read-delimiters-hidden-1440x900.png`.

### F7 — encode the verified UI concurrency

- `tests/ui/run.mjs` defaults to **4** (comment names the 14 November 2026 gate and
  `NOTEFOREST_UI_CONCURRENCY`); the `availableParallelism` import is removed. The 8 cap on explicit
  values is unchanged.

### F9 — nits

- `installLocalTextKeys` cleanup is stored and called in `CodeBlockNodeView.destroy`, and per-source
  in `FormulaNodeView.closeSource`/`destroy`.
- Inline → block inside a table cell now shows an informational toast through the existing editor
  binding (`getEditorBindings(...).notify`), keeps the formula inline and the source open; the table
  UI case asserts the toast and the inline formula.
- Regression test in `formula-transactions.test.ts`: a **text anchor in the same paragraph** as the
  inline formula still resolves (`exact-binding`, one range) after `formulaKindTransaction` converts
  it to a block formula and the result is projected back through `pmToContent`.
- `docs/design/ui-shell-map.md` and `docs/design/ui-shell-contents.md`: sidebar range 208–360 is now
  180–640 with the 264 reset (5 occurrences).

### F10 — scrollbar corner

- `styles.css` adds `::-webkit-scrollbar-corner { background: transparent; }` next to the existing
  scrollbar rules, with a comment. A CSS guard test in `ui-batch-v-css.test.ts` keeps the contract.
- Dark/light evidence from a real 300-block document (canvas scrolls both axes) and a wide table
  wrapper: `artifacts/sentinel-fixes/dark-canvas-corner.png`,
  `artifacts/sentinel-fixes/light-canvas-corner.png`,
  `artifacts/sentinel-fixes/dark-table-wrapper-corner.png`,
  `artifacts/sentinel-fixes/light-table-wrapper.png`; the capture script is
  `artifacts/sentinel-fixes/scrollbar-corner.mjs`.

### F2 — accepted latent limitation (untouched)

Per the brief, F2 is an accepted latent limitation. `lib/table-cell.ts` and the table projection are
untouched, and no legacy-table guard was added. The limitation remains: a legacy/imported table cell
with an image (or nested table/rule) is flattened by the editor projection, and the first content
commit anywhere in that document writes the flattened cell. The exposure is legacy/imported documents
only (the app cannot author one; the library has none today) and is revisited when Markdown import or
a real legacy document lands.

---

## Files changed

Source:

- `apps/desktop/src/renderer/src/editor/editor-ui.ts`
- `apps/desktop/src/renderer/src/editor/views/code-block-view.ts`
- `apps/desktop/src/renderer/src/editor/views/formula-node-view.ts`
- `apps/desktop/src/renderer/src/editor/inline-code.ts`
- `apps/desktop/src/renderer/src/editor/table-commands.ts`
- `apps/desktop/src/main/document-settings.ts`
- `apps/desktop/src/main/library.ts`
- `apps/desktop/src/shared/document-settings.ts`
- `apps/desktop/src/renderer/src/state/settings.ts`
- `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts`
- `apps/desktop/src/renderer/src/actions.ts`
- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/state/shell.ts` (TabInfo comment)
- `apps/desktop/src/renderer/src/styles.css`

Tests:

- `apps/desktop/test/document-settings.test.ts`
- `apps/desktop/test/document-lifecycle-main.test.ts`
- `apps/desktop/test/formula-transactions.test.ts`
- `apps/desktop/test/ui-batch-v-css.test.ts`
- `tests/ui/m4b1a2-read-mode-gating.test.mjs`
- `tests/ui/special-text.test.mjs`
- `tests/ui/document-lifecycle.test.mjs`
- `tests/ui/run.mjs`

Docs:

- `docs/design/ui-shell-map.md`
- `docs/design/ui-shell-contents.md`
- `docs/reports/sentinel-fixes.md` (this report)

Evidence (git-ignored): `artifacts/sentinel-fixes/` — read-mode node view closed, two-copy trash
survivor, draft materialization, GFM caret, Read delimiters hidden, dark/light canvas and table
corners, and the corner capture script.

No schema, `settingsVersion`, Page layout/pagination/theme, PDF/print, export, showcase, copy-id
command behavior, table projection, or anchor-health code changed. No dependency added. No fixed
sleeps or native dialogs were introduced; the trash UI test uses the existing isolated environment and
the runner's real OS Trash as the other lifecycle tests do.

---

## Checks run (real timings)

- `npm ci --no-audit --no-fund` — 199 packages, **2 s** (cached store).
- `npm run typecheck` — clean (desktop node + web, core, layout, pdf).
- `npm run check:boundaries` — **228 files / 1059 imports / 16 rules**.
- `npm test` — **132 files / 1323 tests passed, 4.58 s** (earlier runs during the work: 6.20 s).
- `npm run build` — success.
- `npm run verify:fast` (final tree) — **exit 0**: boundaries **228 files / 1059 imports / 16
  rules**, typecheck clean, unit **132 / 1323**, critical e2e **16/16, 35.09 s suite, 43.23 s
  command**.
- Targeted UI (built app, hidden windows, concurrency ≤ 2):
  - `m4b1a2-read-mode-gating.test.mjs` — **3/3, 7.4 s suite** (first run); re-run after the final
    changes 3/3, **14.3 s** command.
  - `special-text.test.mjs` — **9/9, 11.2 s suite, 19.3 s** command (table D alone 2.5 s).
  - `document-lifecycle.test.mjs` — **8/8, 8.3 s suite, 16.5 s** command.
  - `library-surface`, `ui-batch-b`, `r1b-page-settings`, `m4e1-settings-platform` together —
    **25/25 tests, 4 suites, 40.6 s** wall at concurrency 2.
- `node tests/ui/run.mjs --list` — 140 lines, groups render; the runner default is now 4.
- F10 capture script — `PAGE_ERRORS []`.

No full `npm run verify` was run, per the brief; the Orchestrator owns it at UI concurrency 4.

---

## Acceptance row status

| # | Criterion | Result | Evidence |
|---|---|---|---|
| 1 | Read mode cannot write through code/formula node views; delimiters hidden; canonical document unchanged; test added | **PASS** | Read-mode UI case: closed chrome, forced DOM attempts, deep-equal `blocks`/`anchors`/`branches`, revision, language `ts`, LaTeX `x^2`; F6 test; screenshot |
| 2 | Duplicate-id cleanup is id-safe; two-copy unit/UI tests; no wrong reconciliation | **PASS** | `documentSettingsRemoval` unit cases; file cleanup; `trashDocument` integration; duplicate-id reconciliation test; two-copy UI test with surviving override + session tab |
| 3 | Immediate Page settings on a draft materialize; no `draft:` orphan; UI test | **PASS** | Chrome + A5 + Comfortable on a draft; package-keyed map only; document persisted; close leaves no orphan |
| 4 | Typed GFM Enter keeps a writable paragraph/caret; test | **PASS** | `convertTableOnBlankParagraph` backwards run + trailing caret; UI caret and `ZZ` assertions in DOM and canonical content |
| 5 | Delimiter widgets only in Edit; test | **PASS** | `editor.isEditable` decoration guard; Read 0 widgets / Edit 2 widgets UI assertions |
| 6 | UI default concurrency 4 encoded | **PASS** | `tests/ui/run.mjs`; `--list` works |
| 7 | F9 nits + text-anchor test + docs 180/640/264 | **PASS** | Cleanup stored/called; cell toast test; `formula-transactions` text-anchor test; both docs updated |
| 8 | F10 scrollbar corner transparent; no white square; screenshot | **PASS** | CSS rule, CSS guard test, dark/light canvas + table screenshots |
| 9 | F2 untouched; no schema/settings/Page/PDF/showcase change; no fixed sleeps/native dialogs; existing assertions updated, none weakened | **PASS** | F2 files untouched; no schema/version change; no product Page/PDF change; grep/no-sleep review; no existing assertion changed |

---

## Open questions / risks

- **Durable map still assumes one override per document id.** `upsertDocumentSettingsEntry` and
  `normalizeDocumentSettingsFile` match by id first, so if the user changes settings on **both**
  copies, the second write replaces the first entry. The cleanup is now id-safe, and the tested
  two-copy case gives the copy one override (the reported scenario). Representing two overrides for
  one id belongs to the Save-a-copy id ADR (explicitly out of scope).
- **The F3 "report" is a main-process warning**, not user-facing UI: a kept ambiguous entry or an
  unresolved move is logged with the document id and paths. A status/activity surface is future work.
- The normal-tab key is now `documentId:packagePath` to avoid duplicate React keys for two open
  copies; drafts still key by the document id, so the materialization contract is unchanged.
- `ux-shell.md`, the M2 brief, the v0 brief and `ui-references.md` still mention the old 208–360
  range; the brief scoped the docs fix to the two design files and the frozen inventory. The UX spec
  update remains a docs decision.
- Read mode can still set a `NodeSelection` on a formula (view state only); that is the existing
  single-click behavior and writes nothing.
- No IME manual pass over the formula source/code language in Read; hidden E2E windows were used.
- F8 (table toolbar silhouette) is unchanged and remains the agreed redesign follow-up.
- Media: no real user documents or assets were touched; the showcase is untouched.

---

## Next step

Targeted Sentinel re-check of this diff and report against F1, F3–F7, F9, F10 (F2 accepted as the
documented limitation), then the Orchestrator runs one full `npm run verify` at the encoded UI
concurrency 4 and integrates the single commit.
