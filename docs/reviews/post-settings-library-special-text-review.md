# Review — post-settings / library / special-text delta Sentinel

- **Reviewer:** Reviewer / Sentinel (independent; no product code changed)
- **Date:** 14 November 2026
- **Base:** `58a9b6a` (last accepted UI re-check) → code head `2988d2b`; worktree head `b747d5d` (adds the brief only)
- **Branch / worktree:** `t3/post-settings-special-text-sentinel-review` — `a builder worktree` (deliverable: this report + `docs/reviews/settings-inventory-delta.md`)
- **Environment:** macOS (darwin), Node 22.23.1, Electron 45.2.1, 10 logical cores, hidden E2E windows, dark shell theme; unit + UI run from the worktree after `npm ci` from the lockfile.
- **Stack / PDF:** Electron + shared paginator + `printToPDF` (ADR-0001, ADR-0002); the PDF gate was not re-run (no print/layout change in this delta).
- **Theme / page settings:** dark default; A4 portrait, default margins, compact density (unchanged defaults); Page/PDF isolation checked by code + unit test, not by a new render.
- **Verdict: request changes.** One **S1** data-integrity finding (legacy/imported rich table cells lose non-inline content on the first edit) and three **S2** findings block approval: Read mode can mutate the document through the new in-place node views; trashing one copy of a document removes the other copy's overrides/session by document id; and a per-document Page setting on a draft is written under `draft:<id>` without materializing the document.

---

## Scope reviewed

Diff `58a9b6a..2988d2b` (276 files; ~20.2k source/test lines excluding docs): the settings pipeline at
`settingsVersion: 5` (migration/normalization/store/write identity), R2 Page chrome, R3 Appearance,
R4 Export defaults, R6 Continuous settings and the Page/PDF isolation, the settings/shell layout,
Library/Outline + `libraries.json` recents, drafts/materialization, rename/reveal/Move to Trash,
Backspace/arrow block boundaries, the special-text editor (code fences, inline code, formulas,
tables), the export sheet, and the UI runner/test support.

**Intentionally out of scope:** the NoteForest Showcase (user data), the product-owner visual/VoiceOver
pass, PDF visual fidelity (the M4c3 gate is accepted; no print code changed here), the future Anchor
health panel / shell activity bar (design proposals), the table-toolbar redesign, and the remaining
empty settings pages. No product source, test, spec, UX, ADR, or plan file was edited. The two
deliverables are this review and `docs/reviews/settings-inventory-delta.md`; as the role allows I also
made two narrow checklist/DoD updates: `docs/review-checklist.md` v11 (the Read-mode node-view check
and the lossy load-projection check, both derived from F1/F2) and the DoD runner paragraph (the
verified UI concurrency is now named). Evidence scripts are under
`artifacts/sentinel-delta-2026-11-14/` (git-ignored).

---

## Findings

| ID | Severity | Area | Location (file:line) | Summary |
|---|---|---|---|---|
| F1 | **S2** | Read-mode gating / node views | `apps/desktop/src/renderer/src/editor/views/code-block-view.ts:138-221`; `.../editor/views/formula-node-view.ts:145-183`, `333-384`; `.../editor/code-block-actions.ts:36-53` | After Edit → Read with a formula source or a code fence inside the caret, the node-view editors stay open and writable; they write LaTeX, code language, or create a block/anchor from Read. |
| F2 | **S1** | Tables / data integrity | `apps/desktop/src/renderer/src/lib/table-cell.ts:20-73`; `.../lib/adapter.ts:280-287`; `.../state/runtime.ts:602-614` | A legacy rich cell with an image (or a nested table/rule) is silently flattened on load; the first save after opening (any edit elsewhere; a draft materialization does the same) writes the flattened cell, deleting the image reference and orphaning its anchor. |
| F3 | **S2** | Library / trash / settings identity | `apps/desktop/src/main/document-settings.ts:199-235`; `apps/desktop/src/main/library.ts:2343-2369`, `2295-2300`, `621-702`; `apps/desktop/src/renderer/src/state/settings.ts:434-445` | Cleanup and move reconciliation assume document ids are unique. A copy (Save a copy / Finder duplicate) keeps the same id; trashing one copy removes the other copy's per-document override and its future session tab, and reconciliation can bind a missing tab to the wrong copy. |
| F4 | **S2** | Settings / drafts | `apps/desktop/src/renderer/src/settings/usePageSettingsController.ts:683-717` vs `526-539`; `752-794`, `964-1009`, `1119-1173` | Immediate document-scoped Page writes (size/orientation/chrome/preset/use-global) do not materialize a draft; they write an override keyed by `draft:<id>` while the tab stays a draft and reports saved. |
| F5 | S3 | Tables / typed conversion | `apps/desktop/src/renderer/src/editor/table-commands.ts:172-194`, `201-223`; `docs/reports/special-text-polish.md:40-49` | Enter on the blank paragraph converts the typed GFM table but consumes the blank paragraph and loses the caret; typing does nothing until the user clicks. The report says the blank paragraph stays. |
| F6 | S3 | Inline code / Read mode | `apps/desktop/src/renderer/src/editor/inline-code.ts:36-54`; `apps/desktop/src/renderer/src/styles.css:2813-2822` | The delimiter widgets are caret-driven, not editability-driven: Edit → Read with the caret inside an inline-code span shows backticks that are not document content. |
| F7 | S3 (test infra) | UI runner | `tests/ui/run.mjs:28`; `tests/ui/suites.mjs:72`; `docs/plan.md:496` | The default pool is `min(8, availableParallelism() − 2)` = 8 on this 10-core machine; the documented `npm run verify` is only green at 4. Not a product bug; the stable concurrency must be encoded. |
| F8 | S3 (known, deferred) | Table toolbar silhouette | `apps/desktop/src/renderer/src/editor/TableToolbar.tsx:106-113`; `docs/tasks/special-text-polish.md:47` | A two-row BubbleMenu can cover a header cell. The redesign is explicitly out of scope; tests click a body cell. Re-listed, not a new defect. |
| F9 | S4 | Nits | see below | `installLocalTextKeys` cleanup is unused; formula conversion in a cell silently no-ops; no regression test for a text anchor around a converted formula; shell docs still say 208–360. |

### F1 · Read mode can mutate the document through the new in-place editors (S2)

**Reproduction.** Continuous Edit, caret inside a fenced code block (the node view shows
`data-code-state="editing"`), `⌘E` to Read: the fence stays visible, `data-code-state` stays
`editing`, the language input is visible and focusable; typing `python` + Enter changes
`data-code-language` and, after `⌘S`, the canonical `codeBlock.attrs.language` is `"python"`.
The same with a formula: double-click the formula, `⌘E` to Read, edit the source to `y^3`, Enter —
the canonical `inlineMath.attrs.latex` becomes `"y^3"`. With a LaTeX selection open in Read,
**Branch from term** is enabled and creates a new block plus a formula-term anchor (block count
8 → 9, one formula anchor). The closing-fence button also routes to `exitCodeBlock`, which inserts a
paragraph when the next node is not a paragraph.

**Why.** `DocumentEditor` only calls `editor.setEditable(false)` on the Read switch
(`editor/DocumentEditor.tsx:553-556`) and suppresses the runtime's update in Read (`:373-378`). The
node views build their own DOM controls and only listen to `selectionUpdate`/`transaction`; the mode
switch is neither, so `syncState` keeps the last editing state (`code-block-view.ts:192-216`). Their
commit paths never check `editor.isEditable`: `commitLanguage`/`commitSource`/`toggleKind`/`branch`
dispatch transactions or commands directly (`code-block-view.ts:218-221`;
`formula-node-view.ts:333-384`). The formula's double-click open is gated, but the *open editor*
survives the mode switch, and Branch from term is a structural command. These controls are outside
the overlay/menu/palette gate, so Read-mode gating does not cover them. The inline-code widgets (F6)
are the cosmetic variant of the same "mode not observed" issue.

**Smallest credible fix.** Make the node views observe the editing mode: close/hide the fence and
source chrome on a non-editable update (a small editor storage flag set by `DocumentEditor`, or an
`editor.isEditable` re-check on the next `transaction`/`update`), and guard every node-view mutation
(`commitLanguage`, `exitCodeBlock` from the close row, `commitSource`, `toggleKind`, `branch`) with
`editor.isEditable`. Add UI coverage: open the fence/source in Edit, switch to Read, assert the chrome
is gone, no language/LaTeX can change, and Branch from term cannot create a block.

### F2 · Legacy rich table cells lose images/nested content on the first edit (S1)

**Reproduction.** Any document whose table cell contains an `image` node (a construct the stock
pre-special-text table accepted; reachable from imported/extruded documents, a Finder-level content
edit, or an older build). Open the document; the cell renders the normalized empty paragraph. The
first content commit extracts **every** block body (`extractBodies()`), so editing an unrelated
block and saving (or a draft materialization) writes the flattened table into `document.json`. The image reference is gone from the cell (the asset record may
remain), and any anchor on that image is orphaned.

**Evidence.** `repro1` (type in the table) and `repro1b` (type in an unrelated block) both lose the
image: before `[..., {"type":"image","attrs":{"assetId":"repro-asset-2",...}}]`, after
`[..., {"type":"paragraph"}]`, `AFTER_HAS_IMAGE false`
(`artifacts/sentinel-delta-2026-11-14/repro1.log`, `repro1b.log`). The pure projection drops it:
`blockLines()` maps `image`/`table`/`rule` through their (empty) children
(`lib/table-cell.ts:31-53`), and the adapter applies that at load (`lib/adapter.ts:280-287`); the
next `extractBodies()`/`block.editContent` commits the flattened body (`state/runtime.ts:602-614`).
The unit suite covers paragraphs, lists, code, and math but not images/nested tables
(`apps/desktop/test/special-text.test.ts:212-263`), so the loss is untested.

**Why it matters.** The special-text brief says rich cells are "normalised"; normalization that
deletes an image reference is silent data loss. The anchor-health design already lists anchors inside
cells as a future check (`docs/design/anchor-health.md:23,44`); this is the data-integrity half of
that item. The current UI cannot author an image-in-cell table, so the exposure is legacy/imported
documents — but the checklist is explicit: any data loss is S1, even if rare.

**Smallest credible fix.** Detect non-inline-safe cell content (image, table, rule, or anything
without an inline projection) in the load projection and refuse to flatten it silently: keep the
canonical cell content, mark the table as needing an explicit conversion, and surface the warning /
action. At minimum, never let the editor write back a cell that the projection could not represent.
Add a unit case for image/nested-table cells and a UI case for the blocked conversion. This is not a
product-decision change; inline-only cells stay the authoring model, the loss stops being silent.

### F3 · Document id is not unique after a copy; id-scoped cleanup and reconciliation hit the other copy (S2)

**Reproduction.** `Save a copy` (or a Finder duplicate of a package folder) creates a second package
with the **same** `document.id` (`packages/core/src/node/copy.ts:54-140` writes the same document
object). Open both copies and give the copy a per-document Page override. Move the original to the
Trash: the copy's override disappears immediately in memory and from `document-settings.json`; its
session tab is removed from `shell-session.json` for the next launch. `removeDocumentSettingsEntries`
filters by `documentId` as well as path (`apps/desktop/src/main/document-settings.ts:219-220`),
`forgetDocumentSettings` filters by id (`state/settings.ts:434-445`), and `removeSessionDocument`
drops every tab with that id (`library.ts:2350-2358`). `reconcileMovedDocuments` builds `byId` with
the last scanned path winning (`library.ts:631`), so a missing tab can reconcile to the wrong
copy when both exist.

**Evidence.** A temporary unit repro (deleted after the run) wrote two entries with the same
`documentId` and trashed one path; the result removed both entries:
`TRASH_COPY_RESULT {"ok":true} ENTRIES_AFTER []`
(`artifacts/sentinel-delta-2026-11-14/repro-duplicate-id.log`). The expected array was
`['/library/original']`.

**Smallest credible fix.** Stop assuming id uniqueness in the new cleanup/reconciliation: remove by
exact path first, and use the id only when no other known package (or session tab) shares it; on an
ambiguous id, leave both entries and report it. Separately, decide (product/ADR) whether Save a copy
should mint a new document id; that would also remove the reconciliation ambiguity. Add a unit test
with two packages sharing an id and a UI test for trashing one copy while the other is open.

### F4 · A per-document Page setting on a draft does not materialize; the override is keyed by the draft (S2)

**Reproduction.** New note (draft) → `⌘,` → Page → Document scope → uncheck Page number (an
immediate chrome write). The tab key remains `draft:<id>`; `document-settings.json` gains an entry
with `"packagePath": "draft:<id>"` and the chrome override. Closing the untouched draft discards the
document while the entry remains (the repro log shows three such orphan entries accumulated from
three runs).

**Why.** `applyPending` explicitly materializes a draft and retargets the write
(`usePageSettingsController.ts:526-539`), but the immediate path used by size, orientation, chrome,
preset, reset, and the "use global" actions calls `commitThenWritePageSettings` directly with the
captured draft target (`:683-717`; callers `:752-794`, `:964-1009`, `:1119-1173`, `:872-1107`). The
L3 acceptance criterion says a per-document Page setting materializes the document; only the
debounced density/margins/theme paths do.

**Smallest credible fix.** In `executeImmediate`, before the commit/write, apply the same `isDraft`
→ `ensureMaterialized()` → retarget block as `applyPending` (or reuse one shared helper), then adopt
the draft override to the package path. Add a UI case for a chrome or size change on a draft, not
only the density slider.

### F5 · Typed GFM Enter conversion loses the caret and the blank paragraph (S3)

**Reproduction.** A blank block, type `| A | B |`, Enter, `| --- | --- |`, Enter, `| 1 | 2 |`,
Enter, Enter. The table appears; the block body now contains only the table, the DOM selection is not
in a cell or paragraph, and typing `ZZ` changes nothing (`AB12` unchanged). The report claims the
blank paragraph "stays and keeps the caret" (`docs/reports/special-text-polish.md:40-49`).

**Why.** `convertTableOnBlankParagraph` calls `paragraphsAround` with `backwardsOnly: false`, so the
blank trigger paragraph is included in the replaced run; `insertTableFromRun(..., false)` replaces
it and sets no selection (`editor/table-commands.ts:201-223`). The Mod-Enter path adds a paragraph
below and sets a text selection (`:183-190`), which is why the two paths differ.

**Smallest credible fix.** Exclude the blank trigger paragraph from the run (or insert a trailing
paragraph and set a text selection, matching the Mod-Enter path), and add a caret assertion to the
typed-conversion test. Correct the report/comment either way.

### F6 · Inline-code delimiter widgets appear in Continuous Read (S3)

**Reproduction.** A paragraph `see code here` where `code` carries the stored `code` mark. In
Continuous Edit put the caret inside `code` (two widgets show); `⌘E` to Read. Read still shows two
`.nf-inline-code-delim` widgets and `innerText` reads ``see `code` here`` — the backticks are not
content. Evidence: `repro2.log` (`EDIT_DELIMS 2`, `READ_MODE read`, `READ_DELIMS 2`) and
`artifacts/sentinel-delta-2026-11-14/read-inline-code.png`.

**Why.** `delimiterDecorations` is driven only by the collapsed selection and the code-mark range
(`editor/inline-code.ts:36-54`); it never checks `view.editable` or the interaction mode, and the
styling is scoped to `.nf-block-prose` (the same prose surface used by Read).

**Smallest credible fix.** Return `null` when `view.editable` is false (or gate on the same mode
flag as F1), and add one Read-mode assertion to the inline-code UI case.

### F7 · The default UI pool is not the gate that was verified (S3, test infra)

The default is `min(8, availableParallelism() − 2)` (`tests/ui/run.mjs:28`), i.e. **8** here; the
integration full verify is green at **4** and `docs/plan.md:496` records "the 8-way pool times out on
this machine". I did not rerun 8 per the brief. This is not an accepted local limitation: the
documented `npm run verify` must be green as invoked. Encode the stable value (default 4, or make
`verify` pass `NOTEFOREST_UI_CONCURRENCY=4`) and/or serialize the heaviest suites (`special-text`,
`settings-shell-layout`) next to `document-lifecycle`, then record the current 54-suite timing. This
is an S3 infra follow-up, not a product defect and not a reason to change code.

### F8 · Table toolbar silhouette (S3, known and deferred)

The contextual toolbar is one tall BubbleMenu above the caret cell (`TableToolbar.tsx:106-113`);
with a header cell it can cover the header row. The brief explicitly keeps the redesign out of scope
(`docs/tasks/special-text-polish.md:47`), and the tests click a body cell. No change requested in
this review; keep it as the agreed follow-up.

### F9 · Nits and test gaps (S4)

- `installLocalTextKeys` returns a cleanup function but both call sites ignore it
  (`code-block-view.ts:95`, `formula-node-view.ts:230`; helper `lib/local-text-keys.ts:13-16`). The
  control is detached with the editor, so this is hygiene, not a leak today.
- Inline → block conversion inside a table cell returns null and the button silently does nothing
  (`formula-convert.ts:60-65`, `formula-node-view.ts:333-344`). A short reason/toast would avoid a
  dead click.
- There is no regression test for a **text anchor in the same paragraph** as a converted formula
  (the formula's own `anchorIds` are covered at `apps/desktop/test/formula-transactions.test.ts:85-90`).
  The risk is low (see below), but the anchor contract deserves the assertion.
- `docs/design/ui-shell-map.md:133,284` and `docs/design/ui-shell-contents.md:138,217` still say
  sidebar range 208–360 while the code and the frozen inventory use 180/640/264. A docs fix.
- The Settings pane 536, the 3/4/6/7/8/9 radius spread, and the Continuous card padding 10 are the
  value-audit's visual post-Sentinel pass (`docs/design/value-audit.md` §4–§5). Correctly deferred,
  not a finding; the audit's recommendation to document 536 as a readable choice stands.

---

## Invariants and specific risks

| Invariant / risk | Result | Evidence |
|---|---|---|
| Schema v2 canonical document, settingsVersion 5 | **Pass** | `packages/core/src/types.ts:12`; `apps/desktop/src/shared/settings-file.ts:40`; no document schema file changed; v4→v5 migration/round-trip/unknown-nested-keys tests. |
| Page/PDF isolation from Continuous settings | **Pass** | `apps/desktop/test/continuous-settings-isolation.test.ts` changes every Continuous field and compares serialized Page layout/pages/edges/print model/CSS/fingerprint; `pageCssVariables` emits `--nf-page-*`/`--nf-page-edge-width`; Page edges use `--nf-page-edge-width`; no Page/PDF read of the `--nf-*` Continuous variables. |
| Read-mode gating | **Fail — F1** | Menu/palette/sidebar/anchor-health/table/paste/keyboard gates pass; the new node-view DOM editors do not. |
| Anchor contracts (code/formula/image/text selectors) | **Pass** | Stored anchors are selector + `anchorIds`, not node paths (`packages/core/src/anchors.ts:105-175`); the formula node view keeps `data-anchor-kind`, `.tiptap-mathematics-render`, `data-type`, `ProseMirror-selectednode`; the anchor suites are green. |
| No document data in settings/view state | **Pass** | Settings hold page/theme/chrome/appearance/export/continuous values only; the document map holds page overrides + id/path; the session holds tabs/titles/ids, no content. |
| No fixed sleeps / native dialogs in new tests | **Pass** | No `waitForTimeout`/`sleep` in the delta; the harness's `delay` is a polling primitive; dialogs are the E2E guard or deterministic mocks; `shell.trashItem` is the OS Trash, not a dialog. |
| Existing assertions not weakened | **Pass (sampled)** | 27 removed `assert` lines in `tests/ui` are contract updates (Backspace e2e flips to the ratified stay-in-block behavior; `Focus block` → `Edit block`; schema 2 → 5; global Continuous replaces the dead zoom; the save-failure locator moves to `.nf-main-column`). The formula-anchor toolbar path is replaced by `⌘⇧Enter` with the same reuse/undo/reload assertions; the formula-term test asserts the disabled state instead of absence. |
| Formula inline→block conversion vs text anchors | **Not reproducible; low risk** | Conversion copies `node.attrs` (so `anchorIds` survive) and cuts the paragraph fragment (marks ride on the text); anchors store selectors, not paths (`formula-convert.ts:57-83`; `anchors.ts:105-175`). Missing: a text-anchor regression case (F9). |
| Formula clipboard focus fallback | **Pass** | The fallback textarea's focus loss is suppressed by the `copying` flag and the caret is restored in `.finally` (`formula-node-view.ts:305-331`); the UI test asserts the payload. Code copy has no blur-commit path. |
| Delimiter widgets in Continuous Read | **Fail — F6** | Reproduced. |
| Table toolbar silhouette | **Known S3 (F8)** | Unchanged; deferred. |
| Arrow isolation with multi-block selections | **Pass** | The handler returns native for a non-collapsed DOM selection and any `NodeSelection`, and refuses when the DOM caret is in another block (`keymap.ts:98-143`); `arrowBoundaryAction` is pure and unit-tested. No dedicated multi-block UI case was added. |
| Settings override lifetime | **Pass, except F4** | Partial overrides, equality removal, global propagation, write-target capture, and the corrupt/reset recovery are covered by `settings.test.ts` / `settings-store.test.ts` / `ui-settings-recovery`; the immediate draft path is F4. |
| Draft / trash / recents consistency | **Pass, except F3** | Flush-before-switch, live-lock refusal, missing-package cleanup, never trashing a library root, recents reset, and the missing-package flow are green; duplicate ids are F3. |
| Export identity / default folder / sheet | **Pass** | The sheet pins package path, title, layout, setup, density, and code font; the main job re-checks the document identity; the folder setting is read per sheet; `<title>.pdf` has no date; atomic no-clobber/overwrite tests are green. |
| Page chrome (R2) / Appearance (R3) / Export (R4) / Continuous (R6) | **Pass** | See the acceptance table; print/Page parity and the code-font print identity are covered by `page-chrome.test.ts`, `print-model.test.ts`, `ui-batch-b`, `ui-appearance-v3`, `m4d2-export-ui`, `r6-continuous-settings`. |
| Backspace / history | **Pass** | Pure `native \| stay`, no structural delete; the initial no-op text history entry is cleared (mount fix); e2e/UI green. |

---

## Acceptance table (delta brief)

| # | Criterion / area | Result | Evidence |
|---|---|---|---|
| 1 | `settingsVersion: 5`; pure v4→v5; defaults/ranges/clamp; unknown keys; never lowered; corrupt/unreadable recovery | Pass | `settings.test.ts` migration/round-trip/unknown keys; `continuous-settings.test.ts`; `ui-settings-recovery`; `settingsDocumentForWrite` preserves higher versions. |
| 2 | Settings write identity, no-document Settings, override lifetime, instant save, pending flush, error/backup states | Pass except F4 | `page-settings-target.ts`, `page-settings-write.ts`; `settings-store.test.ts`; `ui-settings-recovery`; `settings-shell-layout`; `ui-batch-b`. |
| 3 | R2 Page chrome (global + per-document), Page Read/Edit/preview/PDF parity | Pass | `page-settings.ts` chrome model/defaults; `page-chrome.ts`; `PageChromeView`; `page-chrome.test.ts`; `ui-batch-b`; fingerprint includes chrome. |
| 4 | R3 Appearance (theme/accent/UI scale/UI font/code font) and paper isolation | Pass | `appearance.ts` registry/defaults; `appearanceCssVariables`; `apply-appearance`; `ui-appearance-v3`; code font in `pageSettingsFingerprint`/print model. |
| 5 | R4 Export (folder default, sheet, `<title>.pdf`, no date, identity, atomic output) | Pass | `ExportSettings`, `getExportDefaults`, `export-flow`, `export-job`; `m4d2-export-ui`; `export-defaults.test.ts`. |
| 6 | R6 Continuous settings, live 1+2+1 preview, canvas application, Page/PDF isolation | Pass | `continuous-settings.ts`, `ContinuousSettings*`, `continuous-settings-isolation.test.ts`, `r6-continuous-settings`. |
| 7 | Settings/shell 1180 × 820, shared rail, stacked Page preview, icon centres | Pass | `styles.css`; `settings-shell-layout` 3/3; `v0-shell-frame`; `ui-batch-v`. |
| 8 | Library/Outline tabs, recents, drafts, materialize, rename/reveal/trash, flush-before-switch, locks, reconciliation | Pass except F3/F4 | `library-surface` 7/7; `document-lifecycle` 6/6 (serial); `library-roots*`; main draft/trash tests. |
| 9 | Export from a draft materializes; export identity | Pass | `document-lifecycle` "materializes … for an export"; `export-flow` pins the path. |
| 10 | Backspace stays in the block; arrows stay in the block; code/table/formula exceptions; one history entry | Pass | `backspace-boundary` UI + e2e; `arrow-boundary` unit + `special-text` B2; history fix. |
| 11 | Code block: auto-close, idle label, Copy only editing, language, three exits, editor-only colours, neutral Page/PDF | Pass except F1 | `special-text` A; `code-block*.ts`; CSS scoped to `.nf-continuous-surface`; Page Edit CSS hides chrome; the Read leak is F1. |
| 12 | Tables: inline-only + normalization, N×M, toolbar, paragraph above/below, Tab/append, hard break, typed/pasted GFM, copy, inner scroll | Fail | Typed/paste/copy/scroll and paragraph actions pass; F2 (silent loss) and F5 (caret) fail; F8 known. |
| 13 | Formulas: anchor-only outline, inline-block box, single-click NodeSelection, in-place source, action row, delimiters copy, paste, inline↔block, anchor safety | Fail (Read) | `special-text` E passes in Edit; F1 (Read); the anchor risk is not reproducible. |
| 14 | Inline code: toggle/literal/delimiters/mini-menu/Read | Fail | Toggle/delimiters pass in Edit; F6 in Read. |
| 15 | Test infra: serial lifecycle, stale app cleanup, clipboard helpers, pool stability | Pass at 4, F7 | Full verify green 54/54 at 4; the default 8 is the unencoded gap. |
| 16 | No document schema/page/view-state change; no fixed sleeps/dialogs; assertions not weakened | Pass | See invariants. |

---

## Checks run (real timings)

- `npm ci --no-audit --no-fund` — 199 packages, **2 s** (cached store).
- `node node_modules/electron/install.js` — Electron 45.2.1 binary fetched once (the worktree had no
  `dist/` after `npm ci`; the harness deletes `ELECTRON_RUN_AS_NODE` itself).
- `npm test` — **132 files / 1314 tests passed, 6.58 s**.
- `NOTEFOREST_UI_CONCURRENCY=4 npm run verify` — **exit 0, 282 s wall** (12:28:34 → 12:33:16), full
  log at `artifacts/sentinel-delta-2026-11-14/verify-concurrency-4.log`:
  - boundaries 228 files / 1057 imports / 16 rules;
  - typecheck desktop (node + web), core, layout, pdf — clean;
  - unit 132 / 1314, 4.62 s;
  - critical e2e 16/16, **44.56 s** suite (build included);
  - recovery 14/14, **18.52 s**;
  - UI **54/54, 0 failed, 207.5 s** at concurrency 4, 0 pageErrors.
- Targeted repros (scripts in `artifacts/sentinel-delta-2026-11-14/`, each launches one hidden
  Electron app; no product/test file was left changed):
  - `repro.mjs` (F2, type in the table) — image-in-cell loss, `IMAGE_KEPT false` (repro1.log);
  - `repro1b.mjs` (F2, type in an unrelated block) — `BEFORE_HAS_IMAGE true` →
    `AFTER_HAS_IMAGE false` (repro1b.log), proving the loss is not limited to editing that table;
  - `repro2.mjs` (F6) — `EDIT_DELIMS 2` → Read → `READ_DELIMS 2`, `READ_TEXT "see `code` here"`
    (repro2.log, screenshot);
  - `repro3.mjs` (F5) — `AFTER_CONVERT {"children":["table"],"caretInCell":false,...}`,
    `AFTER_TYPE "AB12"` (repro3.log);
  - `repro4.mjs` (F1 code) — `READ_STATE editing`, `INPUT_VISIBLE true`,
    `CANONICAL_LANGUAGE "python"` (repro-output-4-6.log);
  - `repro5.mjs` (F1 formula) — source open in Read, `CANONICAL_LATEX "y^3"`;
  - `repro6.mjs` (F1 branch) — `BLOCKS_BEFORE 8 / BLOCKS_AFTER 9`, one formula anchor;
  - `repro7.mjs` (F4) — path remains `draft:<id>`, `document-settings.json` gets a `draft:` entry;
  - temporary Vitest unit repro (F3, deleted after the run) — `TRASH_COPY_RESULT {"ok":true}
    ENTRIES_AFTER []` (`repro-duplicate-id.log`).
- The 8-way pool was **not** rerun, per the brief; the integration evidence and `docs/plan.md` are
  cited for F7.

---

## What I could not verify

- The **product-owner visual/VoiceOver pass** over R3, R4, R6, the settings shell, the palette, the
  sidebar, the edges, the status bars, and the special-text screenshots. This remains a human gate;
  the agent evidence is the builders' screenshots plus my Read-mode screenshot.
- The **8-way pool failure** itself (not rerun). The default value and the green 4-way run are
  reproduced; the exact suite that times out is not identified.
- **Windows/Linux** behavior; the app is Mac-first and this review ran only on macOS.
- The **showcase document** (user data, out of scope) and **300-block performance** (no layout change;
  the M4c3 524 ms gate is unchanged).
- **IME composition** in the formula source/code language inputs (the builders note the hidden E2E
  window was not exercised for composition).
- The **PDF visual gate** (not re-run; no print/layout code in this delta beyond Page chrome and the
  code-font identity, which are covered by unit/print-model tests).
- A full **macOS VoiceOver** pass over the new special-text surfaces.

---

## Open questions answered

1. **8-way pool instability.** Not an accepted local limitation: it is a **test-infra S3** (F7).
   Encode the verified concurrency (default 4 or an explicit verify env) and/or serialize the heaviest
   suites; keep the green 4-way timing as the gate evidence.
2. **Inline→block formula conversion and anchored formulas.** **Safe enough** for stored anchors:
   anchors are selector + `anchorIds`, conversion clones attrs and the paragraph fragment, and the
   unit test asserts the formula binding survives. Blocking/remapping is not needed. Add the missing
   text-anchor regression test (F9) and the Read-mode guard (F1).
3. **Idle/hidden anchor states vs Anchor health.** No new S2 in the idle/hidden states themselves;
   they are informational and belong to the proposed panel (`docs/design/anchor-health.md`). The
   data-integrity risk today is the **cell normalization** (F2), which the panel's future "cell"
   check should not be the only defense for.
4. **Settings pane 536 / radius spread.** Correctly deferred to the visual token pass
   (`docs/design/value-audit.md` §4–§5); not a Sentinel fix. Documenting 536 as a readable choice is
   enough.

---

## Risks / follow-ups

- **S1 fix first:** the table-cell projection must never silently drop non-inline content. The
  current UI cannot author an image-in-cell table, so the exposure is legacy/imported documents — but
  the loss happens on the first commit anywhere in such a document (not only when that table is
  edited), so it is a release blocker per the checklist.
- **Read-mode node-view guard** is the most likely to be hit by a normal user (Edit → Read with the
  caret in a formula/code block, then typing); fix before the next product block.
- **Copy identity** needs a product/ADR decision on whether `Save a copy` mints a new document id;
  the cleanup/reconciliation fix can be id-safe without that decision.
- **Draft immediate settings** should be fixed by reusing the existing materialization path; it also
  removes the orphan `draft:` map entries.
- Keep the table toolbar redesign, the anchor-health panel, the activity bar, the radii/536 pass, and
  the manual-break/search/backup settings pages as the already-planned follow-ups; none is a new
  blocker from this delta.

---

## Next step

A separate Builder should apply F1, F2, F3, F4 (and F5/F6 as small fixes) in one scoped brief, with
the regression tests listed above; then the Orchestrator runs one full `npm run verify` at the
**encoded** UI concurrency (4) and re-delegates a targeted Sentinel re-check. The product-owner
visual/VoiceOver pass over the settings, library, and special-text surfaces remains open.
