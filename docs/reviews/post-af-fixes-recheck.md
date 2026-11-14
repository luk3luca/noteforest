# Review — post-A–F re-check (identity/settings C, editor surfaces A+D, test-only seams)

- Reviewer: Reviewer / Sentinel (independent)
- Date: 14 November 2026
- Reviewed base: `main` at `9be5f20` (contains C `fd4fed9`, A+D `f081cb0`, test fixes `bd3884c`
  and `c1b522c`); reviewed diff `70a6144..c1b522c`
- Worktree: `/Users/luca/.t3/worktrees/noteforest/t3-01fe79ec-42bcfebbe0a8be39`
- Branch: `t3/post-af-fixes-recheck`
- Head: `9be5f20` plus this review commit (docs only)
- Environment: macOS 26.5.2 (25F84), Apple M5 (10 cores), Node 22.23.1, npm 10.9.8; production
  Electron build; E2E hidden; display 1440×900
- Stack/PDF: Electron + shared paginator + printToPDF (ADR-0001, ADR-0002); no PDF change reviewed
- Theme: dark (default)
- Page settings / views: Page layout exercised at the defaults from the fixtures; this re-check is
  not a Page/PDF parity pass
- Verdict: **Accept with findings** — no S1/S2. R1/R2/R3, ADR-0009, the target-aware context menus,
  the Page formula-panel geometry, mode parity, and indent/outdent are accepted. F1–F3 are S3
  follow-ups in the new anchored-move path and the Page formula panel; F4 is an S4 test-evidence
  nit.

## 1. What this re-check did

- Read `AGENTS.md`, `docs/agents/roles.md`, `docs/definition-of-done.md`,
  `docs/tasks/identity-followups.md`, `docs/tasks/editor-surfaces-structure.md`,
  `docs/reports/identity-followups.md`, `docs/reports/editor-surfaces-structure.md`,
  `docs/adr/0009-copy-mints-new-document-id.md`, `docs/adr/0007-editor-layouts-and-modes.md`,
  `docs/design/indent-and-drag.md`, and `docs/review-checklist.md`.
- Read the full diff `70a6144..c1b522c` (80 files), with emphasis on
  `packages/core/src/commands/block.ts`, `packages/core/src/document.ts`,
  `apps/desktop/src/shared/document-settings.ts`, the Page-settings controller/target,
  `apps/desktop/src/main/library.ts`, `editor-context-menu.ts`, `actions.ts`, `shell.ts`,
  `keymap.ts`, `formula-node-view.ts`, `code-block-view.ts`, `PageBlockEditor.tsx`, and the new
  unit/UI suites.
- Ran targeted unit/UI/e2e evidence (see §9). Did not duplicate the Orchestrator's full
  `npm run verify`.
- Wrote two independent probes (gitignored) instead of reusing the builders' tests:
  `artifacts/recheck/post-af-probe.test.mjs` (real app: gutter focus, anchored Move up, Page formula
  panel keys) and `artifacts/recheck/f2-core-probe.test.ts` (core command + `validateDocument`).
  They are re-runnable; the core probe must be copied into `packages/core/test/` to match vitest's
  include pattern (it was run that way and removed). The probes encode the **observed defect**, so
  they pass on this build and are expected to fail once F1/F2 are fixed; they are evidence, not
  product tests.
- Did not change product code, tests, spec/UX/ADR/plan. Temporary probe files were removed; the
  saved probes live under the git-ignored `artifacts/recheck/`.

## 2. Verdict and summary

The C and A+D batches are integrated correctly on their main paths:

- **R1** closes the main/renderer disagreement: any other durable entry with the same document id
  is now ambiguous in `documentSettingsRemoval` exactly as in `forgetDocumentSettings`; the exact
  path is always removed, the cross-library closed copy keeps its override, and `keptAmbiguous` is
  reported. Unit, renderer-store, and main-integration cases cover it.
- **R2** closes the debounced-materialization drop without reopening the F2 cross-document defect:
  only a captured **draft** key is resolved to the same document id, never a closed package path,
  and never an ambiguous same-id pair. The same-task UI case writes density + A5 and reports Saved.
- **R3** closes the silent inline→block rejection in the Page Edit overlay by using the shared
  `toast.info` helper instead of editor bindings. The formula stays inline and canonical content is
  unchanged.
- **ADR-0009** is implemented as decided: `Save a copy` mints a new id, destination title, copy-time
  timestamps, revision 1, keeps content/anchors/branches/assets, never writes the source package,
  and starts on the global settings layer. Finder duplicates keep the same id and path-first
  cleanup.
- One target-aware context menu now covers prose, card/chrome, table cells, code, the code-language
  input, the formula source, and Read text; the formula source stays open with its selection; the
  native text commands preserve rich text/undo; one menu is visible; Escape returns focus.
- The Page Edit formula panel is viewport-clamped and anchored/flipped; all three controls and the
  preview fit with no horizontal scrollbar.
- Layout and interaction mode are independent: Continuous ⇄ Page preserves Edit/Read, Page Edit does
  not auto-open, the stored mode survives a session round trip, and Page Read stays read-only.
- Indent/outdent use one pure rule and one `block.move` path from the keybinding, menu, and palette;
  the gutter pointerdown focuses the editor and selects the block; a good batch.

What remains is real but non-blocking: the **same-parent reorder of an anchored callout** does not
move it and writes a primary order key in the wrong port (F1); the reparent→reference conversion
can duplicate a reference order key (F2); **⌘↵ inside the Page Edit formula panel** commits only the
source, so the on-screen "Esc or ⌘⏎ commits" hint and the report's claim need two presses for the
block (F3). F4 is the indent test's focus workaround whose comment is wrong. None of these lose
data; the anchor is preserved in every reparent path.

## 3. Identity and settings (C)

### R1 — id-safe cleanup agreement

**Status: pass.** `documentSettingsRemoval` now treats any other durable entry with the same id as
ambiguous (`apps/desktop/src/shared/document-settings.ts:225-234`), keeps it and reports it in
`keptAmbiguous` (`:238-255`). The renderer store has the same rule
(`apps/desktop/src/renderer/src/state/settings.ts:445-459`), the main process reads the same plan
(`apps/desktop/src/main/document-settings.ts:208-238`), and the trash path logs the kept entries
(`apps/desktop/src/main/library.ts:2324-2327`, `:2372-2375`).

Evidence:

- Unit: the intentional contract change is asserted in
  `apps/desktop/test/document-settings.test.ts:235-255` (stale same-id entry kept and reported).
- Renderer memory: `apps/desktop/test/settings-store.test.ts:245-260`.
- Main integration: `apps/desktop/test/document-lifecycle-main.test.ts:598-640` — original in
  library A, closed same-id copy in library B with only a durable entry; trash keeps the copy's
  entry on disk and clears the original's tab.
- The existing same-library two-copy and Finder-duplicate path-first tests are unchanged and green.

Residual note (S4, by design per the brief): a stale moved-path entry is now kept until
`adoptDocumentSettingsEntry` re-keys it on the next open; it is harmless but persists if the
document is never reopened.

### R2 — captured draft target after the pre-execute flush

**Status: pass.** The capture still happens before the flush
(`settings/page-settings-target.ts:110-116`; `usePageSettingsController.ts:771-786`). The new
resolver (`settings/page-settings-target.ts:50-95`) only retargets when:

- the target is document-scoped and the captured key is a `draft:<id>`;
- the draft key no longer maps to a runtime;
- exactly one open runtime has the same canonical id, it is materialized, and its path differs.

A closed package path, a still-open draft, a global target, or an ambiguous same-id lookup returns
null. `executeImmediate` resolves before `targetIsGone` and stores the retargeted identity in
`lastImmediate` (`usePageSettingsController.ts:706-718`, `:746`). `getRuntimeByDocumentId` refuses to
guess between two open packages with one id
(`apps/desktop/src/renderer/src/state/registry.ts:79-91`).

Evidence:

- Unit: five resolver cases in `apps/desktop/test/page-settings-target.test.ts:128-190`.
- UI: `tests/ui/document-lifecycle.test.mjs:394-492` moves the density slider (240 ms debounce) and
  clicks A5 in the same task, so the debounce cannot fire first. It asserts the materialized
  package, density 1.2 + A5 120 %, Saved status, no `[data-settings-save-error]`, no Retry, and no
  `draft:` entry in memory. I ran the suite: 9/9 (suite 9.2 s). The screenshot
  `artifacts/identity-followups/density-debounce-a5.png` shows A5 landscape, 12 mm margins, 120 %
  density, Saved.
- The builder's temporary revert proof (R2 case fails without the resolve) is consistent with the
  code path; I did not repeat the revert. Without the retarget, the flush materializes the draft and
  the captured draft key is gone, so the write would report the target-closed error.

Residual note (S4): Retry after a **failed** retargeted write is not directly covered; the stored
`lastImmediate` target is the package path, so the path is straightforward, but a unit replay would
make it explicit.

### R3 — inline→block reason in the Page Edit overlay

**Status: pass.** The rejection now uses `toast.info(...)` in the shared node view
(`apps/desktop/src/renderer/src/editor/views/formula-node-view.ts:471-483`), which works without
editor bindings. The formula-term branch action still uses the bindings. Continuous Edit behavior
is unchanged because its `notify` binding also maps to a sonner toast.

Evidence: the new table-cell case in
`tests/ui/m4b1b1-page-edit-overlay.test.mjs:456-550` opens the formula in Page Edit, asserts the
"stays inline" toast, one inline formula and no block formula, then Done and canonical content
(no `mathBlock`). I ran the suite: 9/9 (suite 7.8 s).

## 4. ADR-0009 — Save a copy mints a new id

**Status: pass.** `createDocumentCopy` (`packages/core/src/document.ts:103-128`) clones the document,
replaces the id with a fresh factory value (retrying a collision with the source id), trims the
destination title (`Untitled` fallback), sets `createdAt`/`updatedAt` at copy time and revision 1.
The source is never mutated and unknown root fields survive. `saveDocumentCopy`
(`apps/desktop/src/main/library.ts:1798-1847`) writes that document through the existing validated
atomic package-copy writer, so assets are copied and the source package is not written. The copy
opens with its own identity when it is inside a known library; otherwise it is revealed in Finder.
Per-document settings are id-keyed, so the copy starts on the global layer.

Evidence:

- Core: `packages/core/test/model.test.ts:92-134` (distinct ids, title, revision, timestamps,
  content/anchors/branches, source untouched, collision retry, blank title, unknown fields).
- Main: `apps/desktop/test/document-lifecycle-main.test.ts:365-493` (two copies distinct; revision
  1; title from destination; assets; source bytes unchanged; no inherited override; trashing the
  original keeps the copy's override/tab).
- The critical e2e save-copy case is an intentional contract update and passes (1/1, 2.5 s test):
  a new id, title `rescued copy`, revision 1, every block.
- The Finder-duplicate path-first test is unchanged and green.

Residual note (S4): the copy title is the destination basename verbatim (report edge case); a real
native Save dialog was not exercised (main tests call `saveDocumentCopy`; the e2e uses the dialog
guard).

## 5. Editor surfaces (A+D)

### 5.1 Context menus

**Status: pass for the tested target model.** One menu component is composed from
`editor-context-menu.ts` and `actions.ts`:

- `classifyEditorContextTarget` (`editor-context-menu.ts:38-54`) orders formula source,
  code-language, formula/image, cell, code, prose, card. Prose gets the text group plus the complete
  block menu; card/chrome gets the block menu only; a cell gets text + table commands and no block
  structure or image/table insertion; code content, the code-language input, and the formula source
  get the text group only; Read text gets Copy/Select All (`actions.ts:1411-1450`;
  `readOnlySafeMenuEntry` at `:911-923`).
- The formula source's native `contextmenu` suppresses blur and the menu owns focus, so the source
  stays open with its value and selection (`formula-node-view.ts:345-366`). The code content and
  language input do the same (`code-block-view.ts:105-158`). The chapter-title input gets a
  text-only menu with suppressed blur (`BlockViews.tsx:126-145` for the handler, `:169-190` for the input).
- The right-clicked native control's pre-click selection is remembered on right mousedown and
  restored before a command (`editor-context-menu.ts:72-91`, `:172-199`). Cut/Copy are disabled
  without a selection; Paste is only offered on editable targets.
- Cut/Copy/Paste run the platform command on the focused webContents through the narrow
  `shell:edit-text-command` IPC (`main/index.ts:356-368`, `preload/index.ts:49-51`,
  `shared/api.ts:611-646`), preserving rich text and the native undo stack. Read-mode Copy writes
  plain text through the existing clipboard helper.
- The renderer prevents the DOM default on every editor contextmenu; the UI suite asserts exactly
  one `.nf-menu` and `defaultPrevented`. Escape closes and returns focus to the control.

Evidence: `tests/ui/editor-surfaces.test.mjs` cases 1–3 (6/6 total, I ran the suite: suite 4.6 s):
prose/card/cell/code/formula/Read menus, one menu, preserved prose selection, Cut + `⌘Z` restore,
Select All scope, formula source stays open with its selection, Page Edit source Cut/Paste, and the
Page formula geometry. Screenshots `menu-prose.png`, `menu-card.png`, `menu-cell.png`,
`menu-formula-source.png` are current.

The formula-source right-click and the Page Edit panel source both pass; the panel is body-level
chrome, so the old blur-commit cannot fire.

Not verified / documented deviation: in the Page Edit overlay the prose menu is deliberately
text-only (report risk 1), so a table cell there gets text actions but not the table command group;
Page Read has no custom menu (the native text menu can still appear). The chapter-title menu is not
covered by a UI case. The code/formula text actions are entry-tested; the actual Cut/undo path is
tested on prose and the formula source.

### 5.2 Page Edit formula panel

**Status: pass on geometry, scroll, anchoring; F3 on the keyboard contract.** The formula source in
Page Edit is a body-mounted, viewport-clamped, anchored/flipped panel
(`formula-node-view.ts:203-300`) marked `data-page-edit-extension` so the overlay's outside-click
commit ignores it (`PageBlockEditor.tsx:193-210`). The panel sits below the menu's z-index and above
the page. It is fixed and repositions on scroll/resize with rAF coalescing.

Evidence: `tests/ui/editor-surfaces.test.mjs:496-692` measures the panel at 1440×900: width ≥ 400
(420), all three action buttons on one row and inside the panel/viewport, the preview inside the
panel, `scrollWidth <= clientWidth`, `overflow-x` not auto/scroll, and the page scroll surface with no
horizontal overflow. Screenshot `page-formula-panel.png` shows the complete panel.

The panel is outside the overlay's DOM, so the overlay's `onKeyDownCapture` no longer sees its keys;
that is the cause of F3. The overlay's `aria-modal="false"` and the panel's body-level placement
also mean the panel is outside the dialog's accessibility subtree; a VoiceOver pass should confirm
the reading order (product-owner pass is open).

### 5.3 Mode parity

**Status: pass.** `setDocumentLayout` now keeps the stored mode
(`apps/desktop/src/renderer/src/state/shell.ts:345-366`); the switch still commits an open Page Edit
overlay first and a rejected commit keeps the overlay/view (`actions.ts:618-630`). Page Edit is
still opt-in per block: a layout switch does not auto-open an overlay, and a Page view with no
stored mode still normalizes to Read (legacy/corrupt safety). Session serialization already carries
the mode, so an explicit Page Edit survives a reload.

Evidence:

- Unit: `apps/desktop/test/editor-layouts-modes.test.ts` (Continuous Edit → Page Edit, Page Read →
  Continuous Read, Page Edit → Continuous Edit, no reset on re-select).
- New UI: `tests/ui/editor-surfaces.test.mjs:694-752` (Edit and Read parity, no overlay, session
  round trip).
- Regression suites: `tests/ui/m4b1-page-view.test.mjs` 10/10 and
  `tests/ui/m4b1a2-read-mode-gating.test.mjs` 3/3 (I ran both), with the 18 suites now setting
  Read explicitly where their scenario requires Page Read.
- The `v0-shell-frame`, `ui-batch-a`, `m4d1`, `m4d2`, `ui-batch-b`, and `ui-settings-advanced`
  updates are the intentional parity contract; no assertion was weakened (the old "Page opens in
  Read" assertions were replaced, not removed).

Page Read remains exact and read-only; Read gating still blocks the shell, sidebar, palette,
context menus, keymap, paste/drop, and anchor repair. `m4b1a2` passes.

### 5.4 Indent / outdent

**Status: pass on the rule, keybinding, menu/palette, chapter/cycle checks, and the
reparent→reference citation; F1/F2 are order-key follow-ups.**

- `indentTarget` returns the previous primary sibling (or a reason); `outdentTarget` returns the
  parent (or "Already a top-level block"). `lib/indent.ts:24-45`.
- The runtime calls `block.move` for both (`runtime.ts:1926-1971`), and the keymap calls the same
  rule after requiring a real branchBlock node selection and `canEdit()` (`keymap.ts:245-279`).
  Tab in text/lists/code/tables stays native; the menu and palette use the same helper
  (`actions.ts:1332-1359`, `:1707-1725`).
- The gutter pointerdown now calls `focusBlock(select: true)`, so the block is selected and the
  editor owns focus; the probe confirms Tab then indents. Drag/reorder behavior is unchanged.
- Anchored reparent: `detachBlock` turns the old anchored primary edge into a reference with the
  same source/anchor and creates a fresh primary at the destination; the runtime reports "Kept as
  reference from “source”" for every path (`runtime.ts:1884-1971`); the command snapshot restores
  both records in one undo. Core tests and the UI outdent case assert the reference, the chip, and
  one undo. Reparenting a top-level anchored child leaves no primary incoming edge, as expected.
- Non-empty-chapter and cycle checks stay in core; the first-child disabled reason is visible in the
  Position menu and the keybinding toast.

F1: a **same-parent** Move up/down on an anchored callout is enabled and reports success, but writes
the order key into the parent's **direct-children** port, so the callout does not move and the
anchor port can get two equal primary order keys. F2: the reparent conversion keeps the old primary
order key, so it can duplicate an existing reference key at the same anchor port. Details in §7.

## 6. The two test-only integration fixes

- **`bd3884c` — follow the Page Edit formula panel into the body.** Correct: the panel is
  intentionally body-mounted; the test now locates `[data-page-edit-extension="true"]` instead of
  the overlay subtree. It does not hide a product defect. It does expose the keyboard consequence
  in F3, because the overlay's key handling no longer covers the panel.
- **`c1b522c` — focus the editor before the gutter Tab shortcut.** The product handler already
  focuses the editor: the probe's gutter pointerdown produces an active `.ProseMirror` and Tab
  indents. The added `.focus()` is defensible as a hidden-window stabilizer (9/10 hidden runs and
  the visible run focused; one hidden run had `activeElement` outside the editor), but the comment "Pointer events on the gutter do not focus it" is inaccurate and the
  test no longer proves the product contract. It does not hide a product defect; see F4.

## 7. Findings

| ID | Severity | Area | Location | Reproduction | Expected | Actual | Smallest credible fix |
|---|---|---|---|---|---|---|---|
| **F1** | **S3** | Indent/structure | `packages/core/src/commands/block.ts:532-559`; `actions.ts:1332-1343`; `runtime.ts:2087-2096`, `:2115-2136`; `DocumentEditor.tsx:449-461` | Real app: two anchored primaries from one anchor (orders `m`, `t`); select the second and Position → Move up (enabled). The command reports success (`canUndoStructural` true); orders become `m`, `m`; the second callout does not move first. Run `node --test artifacts/recheck/post-af-probe.test.mjs` (F1 case). | A same-parent reorder updates the order in the callout's **anchor** port (D3 within one anchor), so Move up puts the second branch before the first; or the action is disabled with a reason if the move cannot be expressed. | The order is computed against the parent's direct children (`primaryDirectChildren`, `structure.ts:41-47`), not the anchor port. Cross-port values are meaningless; the two primaries share one key, so the visible order falls back to branch ID (deterministic but arbitrary); a spurious undo entry is created. `validateDocument` reports `duplicate-branch-order`. | In the shortcut (or before `resolvePlacement` for a sibling target) compute the order among `portBranches(portOf(incoming.source), 'primary')` excluding the moving branch, renormalizing on exhausted keys. If the target sibling is in a different port (anchored vs direct), disable the entry/return a clear reason instead of a no-op. Add a core test with two same-anchor primaries that asserts the actual order and no `duplicate-branch-order`. |
| **F2** | **S3** | Structure / references | `packages/core/src/commands/block.ts:222-239` | Core probe (`artifacts/recheck/f2-core-probe.test.ts`, copied into `packages/core/test/`): anchor with primary `m` and an existing reference `m`; reparent the primary to another parent. The converted edge is a reference with `m`; `validateDocument` warns `duplicate-branch-order`. | Converting the primary role re-keys the order into the **reference** port so the document keeps unique order keys per port and role. | The old primary order key is kept; the reference port has two `m` keys. The tie-break is branch ID. | Use `orderKeyForPortIndex(document, port, 'reference', …)` (or append with `orderBetween(last, null)`) when converting, and add a `validateDocument(...).warnings` assertion to the anchored reparent test. |
| **F3** | **S3** | Page Edit formula | `apps/desktop/src/renderer/src/editor/views/formula-node-view.ts:373-381`; `apps/desktop/src/renderer/src/page/PageBlockEditor.tsx:228-240`, `:284` | Real app: Page Edit, double-click the formula, press `⌘↵`. The source detaches and the overlay stays; a second `⌘↵` closes the overlay. Run `node --test artifacts/recheck/post-af-probe.test.mjs` (F3 case). | The UI hint says "Esc or ⌘⏎ commits" and the brief/report say `⌘↵` commits the block once; one `⌘↵` should commit and close (one structural undo). | The textarea's Enter handler ignores meta/ctrl and commits only the source; the overlay's keydown capture is not an ancestor of the body-mounted panel. Esc wins for the source first (documented), so the block needs a second key. | Forward `⌘↵` from the panel to the overlay commit (and stop Escape propagation from the source so a body-level listener cannot also commit), or change the hint/report and accept the two-step as the product decision. Add a UI case for `⌘↵` (only Done/Enter is tested today). |
| **F4** | **S4** | Test evidence | `tests/ui/editor-surfaces.test.mjs:87-102` | Inspect the helper and the comment; run the gutter probe. The product focuses the editor and Tab indents. | The test asserts the product focuses the editor after the gutter pointerdown (and documents any hidden-window fallback). | The test forces `element.focus()` and the comment says pointer events do not focus it, which is false for an active window. A future regression that removed the product focus would not fail this test. | Assert `document.activeElement.closest('.ProseMirror')` after the gutter handler (with a condition wait); keep `.focus()` only as a documented hidden-window fallback if the flake persists, and correct the comment. |

### Severity rationale

- F1/F2 are S3, not S2: the anchor is preserved (the design's main goal), no content or anchor data
  is lost, the document stays valid (`duplicate-branch-order` is a warning, tie-broken by branch
  ID), and the affected commands are auxiliary reorder/citation paths. F1 is the highest-priority
  follow-up because the command reports success with no effect; if the Orchestrator ranks a silent
  command failure as S2, the fix is one focused core change and does not require a redesign.
- F3 is S3: Done, Esc, and navigating away still commit the block; the two-press behavior is a UX
  contract inconsistency, not data loss.
- F4 is S4: test/comment quality only.

### Non-blocking notes (not findings)

- **Page Edit prose menu is text-only** (report risk 1). The brief's "prose → full block menu" and
  "cell → text + table commands" are not met inside the overlay; the builder's reason (a one-block
  overlay buffer must not mutate the block behind it) is sound. Confirm with the product owner if the
  full menu is wanted; it needs a commit/close design.
- **Stale comments**: `apps/desktop/src/shared/view-state.ts:3-5` and `:71-77` still say Page opens
  in Read on a layout switch; the new contract is parity. `tests/ui/m4b1b1-page-edit-overlay.test.mjs:544`
  says Escape in the source also closes the overlay; after the body panel it closes the source
  first. The identity report's open question about Escape has the same stale assumption. These are
  docs/comment only; the builder reports were not edited.
- **Evidence gaps**: R2 Retry after a failed retargeted write is not directly tested (the identity
  is stored); code/formula Cut actions are entry-tested but the Cut/undo path is tested on prose and
  the formula source; the chapter-title menu has no UI case; the formula panel geometry is tested
  at 1440×900 only; the panel is outside the overlay dialog's accessibility subtree (VoiceOver pass
  open); Page Read has no custom context menu (the native text menu can appear).
- **Copy flow**: no real native Save dialog was exercised (main tests call the function; e2e uses
  the dialog guard). This matches the repo's no-native-dialog test rule.

## 8. Acceptance criteria

| # | Criterion | Evidence | Result |
|---|---|---|---|
| 1 | R1: any same-id durable entry is ambiguous; main and renderer agree; cross-library closed copy keeps its override; `keptAmbiguous` reported | Unit + renderer store + main integration; §3 R1 | **Pass** |
| 2 | R2: density debounce + immediate A5 materializes and writes; no false closed; Retry not needed; capture-before-flush intact | Five resolver units; same-task UI case 9/9; screenshot; §3 R2 | **Pass** (Retry-after-failure coverage note) |
| 3 | R3: Page Edit overlay shows the inline→block reason; formula stays inline | New m4b1b1 case 9/9; §3 R3 | **Pass** |
| 4 | ADR-0009: new id/title/revision/timestamps; content/anchors/branches/assets; source untouched; Finder path-first | Core + main + e2e; §4 | **Pass** |
| 5 | Context menus: prose = text + full block menu; card = block menu; cell = text + table; code/formula = text only; Read = Copy/Select All; one menu; formula source stays open; selection/undo; Escape focus | UI suite cases 1–3 6/6; screenshots; §5.1 | **Pass** (Page Edit prose is text-only by design) |
| 6 | Page formula panel expands, all controls visible, no horizontal scroll, anchored/flipped, Esc/⌘↵/Done one commit | Geometry case + screenshot; Esc chain verified; F3 for ⌘↵ | **Pass with F3** |
| 7 | Mode parity: layout preserves Edit/Read; Page Edit no auto-open; session restore; Page Read unchanged | Unit + new UI case + m4b1-page-view 10/10 + m4b1a2 3/3 | **Pass** |
| 8 | Indent/outdent: previous sibling, disabled reason, Tab/⇧Tab only on a selected block, menu/palette, same-parent anchor, reparent→reference + toast + one undo, cycle/chapter | indent/keymap/runtime/core tests; UI case; probe; F1/F2 for anchored order keys | **Pass with F1/F2** |
| 9 | Test fixes: Page Edit locator follows the body panel; indent test focuses the editor; no hidden product defect | bd3884c correct; c1b522c probe (product focuses; hidden flake); F4 | **Pass with F4** |
| 10 | Invariants: no schema/settingsVersion/Page/PDF layout/export/showcase; Read gating; no fixed sleeps/native dialogs; F2 untouched | `git diff --name-only` has no such paths; m4b1a2 3/3; new tests use condition waits; `table-cell.ts`/`adapter.ts` untouched | **Pass** |

## 9. Checks run

Environment: macOS 26.5.2, Apple M5, Node 22.23.1, npm 10.9.8; production build; E2E hidden;
1440×900.

| Check | Result | Timing |
|---|---|---|
| `npm ci --no-audit --no-fund` (fresh worktree) | 199 packages | 2 s |
| `npm run build` (needed for the UI probes) | success | not timed |
| `npm run typecheck` | clean | 6.1 s |
| `npm run check:boundaries` | 230 files / 1,077 imports / 16 rules | 0.42 s |
| `npx vitest run` (indent, page-settings-target, document-settings, settings-store, move-anchor-role, anchor-commands, model) | 7 files / 136 tests | 412 ms |
| `npx vitest run apps/desktop/test/document-lifecycle-main.test.ts` | 20/20 (includes R1 and ADR-0009 main cases) | tests 2.13 s, command 2.5 s |
| `node --test tests/ui/editor-surfaces.test.mjs` | 6/6 | suite 4.58 s, command 12.7 s |
| `node --test tests/ui/document-lifecycle.test.mjs` | 9/9 | suite 9.22 s, command 17.4 s |
| `node --test tests/ui/m4b1b1-page-edit-overlay.test.mjs` | 9/9 | suite 7.81 s, command 15.9 s |
| `node --test tests/ui/m4b1-page-view.test.mjs` | 10/10 | suite 7.60 s, command 15.8 s |
| `node --test tests/ui/m4b1a2-read-mode-gating.test.mjs` | 3/3 | suite 6.14 s, command 14.3 s |
| `node --test --test-name-pattern "saves a copy of the unsaved content" tests/e2e/m2-editor.test.mjs` | 1/1 | 2.54 s test, 10.7 s command |
| Review probe `artifacts/recheck/post-af-probe.test.mjs` (F1/F3/F4) | F1/F3 reproduced; F4 focused 9/10 hidden and 1/1 visible (one hidden-window focus flake) | ~4 s per full run |
| Review probe `artifacts/recheck/f2-core-probe.test.ts` (copied into `packages/core/test/`, run, removed) | 1/1; asserts the observed `duplicate-branch-order` | 92 ms |
| Full `npm run verify` | **not run** (the Orchestrator's green run at UI concurrency 4 is the integration evidence) | — |

No fixed sleeps were added to the new tests: the new `editor-surfaces` and R2/R3 cases use condition
waits only. The pre-existing `waitForTimeout` calls in `tests/ui/m4b1-page-view.test.mjs` (lines
147, 252, 700–818) and `tests/ui/m4b1b1-page-edit-overlay.test.mjs:236` are untouched. No native
dialogs were opened by this review.

## 10. What I could not verify

- The Orchestrator's full `npm run verify` (UI concurrency 4) — not duplicated; its green log
  (55/55, 0 pageErrors) is the integration evidence.
- Product-owner visual/VoiceOver judgement of the menu, the body-level formula panel, the indent
  toast, the dark/light panel placement, and the Page Edit prose-menu limitation.
- A real native Save dialog for `Save a copy` (main tests call the function; e2e uses the dialog
  guard).
- Page Read native context-menu behavior (no custom menu there).
- Formula panel geometry below 1440×900 or at high UI scale.
- The 18 updated suites as a group at concurrency 4; only the five affected suites were re-run here.
- Cross-library Finder duplicates with both copies open in one session (the resolver's ambiguity is
  unit-abstracted; the UI cannot easily create two same-id runtimes).

## 11. Next step

1. **Follow-up batch (non-blocking):** fix F1 and F2 together in the core anchored-move path
   (port-aware order key, and a disabled reason/rejection for cross-port moves that cannot be
   expressed), then F3 in the Page formula panel (forward `⌘↵`, source-first Escape, add the
   missing UI assertion). Correct F4's test comment/assertion.
2. Update the stale `view-state.ts`/m4b1b1 comments and the two builder-report statements about
   `⌘↵` and Escape when the follow-up lands (the Orchestrator owns the report wording; the
   historical reports stay as history).
3. The Orchestrator's full `npm run verify` at UI concurrency 4 and the product-owner
   visual/VoiceOver pass remain the integration gates. F1–F4 do not block the merge on this
   review: no S1/S2, no data loss, and the anchor is preserved in every path.
