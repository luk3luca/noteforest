# Editor surfaces and structure — context menus, Page formula, mode parity, indent

- **Builder:** Implementer / Builder
- **Date:** 14 November 2026
- **Base:** `70a6144` (`main` head with this brief)
- **Worktree:** `a builder worktree`
- **Branch:** `t3/editor-surfaces-context-menu`
- **Commit:** one commit in this worktree (SHA in the handoff; not merged or pushed)
- **Brief:** `docs/tasks/editor-surfaces-structure.md`
- **Status:** implemented; targeted unit/UI/e2e green; `verify:fast` exit 0. Full `npm run verify` is the Orchestrator's integration run.

---

## Summary

One target-aware contextual menu now serves every editor surface, the Page Edit formula source is a viewport-clamped panel with every control visible, layout switches preserve Edit/Read, and Indent/Outdent are deterministic `block.move` commands with the anchored-edge citation rule.

### 1. One contextual menu, target-aware

`apps/desktop/src/renderer/src/lib/editor-context-menu.ts` owns target
classification, the text group, and the table group. `openBlockMenu` composes
them with the existing block menu; the shell keeps exactly one menu component.

| Right-click target | Entries |
|---|---|
| Prose (paragraph/list/quote) | Cut, Copy, Paste, Select All + the complete block menu |
| Card/chrome (padding, header, gutter, trunk, image, formula render, table chrome) | the block menu only |
| Table cell | text group + row/column insert/delete, alignment, Copy as Markdown; no block structure; no Insert image/table |
| Code content, code-language input, formula source textarea | text group only |
| Read mode on text | Copy, Select All only |
| Read mode on card | the block menu, gated exactly as today (no mutations) |

Rules implemented:

- The formula source **stays open** on right-click; the menu never commits or
  closes it. The old blur-commit is suppressed while the menu owns focus for the
  formula source, code language, and chapter-title input.
- Cut/Copy are disabled without a selection; Paste is absent on non-editable
  targets. Right-click on a native text control remembers the pre-click
  selection (a right-click would otherwise move its caret) and the menu puts
  that selection back before executing, so actions apply to the control and
  selection the user right-clicked.
- Cut/Copy/Paste run the platform edit command on the focused `webContents`
  through a new narrow preload/main IPC (`shell:edit-text-command`), preserving
  rich text and the native undo stack without a clipboard-read prompt. Read-mode
  Copy writes plain text through the existing clipboard helper.
- The renderer prevents the DOM default on every editor contextmenu, so the
  native menu (`attachTextContextMenu`, still used by Settings/dialogs) never
  competes; the UI suite asserts `defaultPrevented` and exactly one `.nf-menu`.
- Escape closes the menu and returns focus to the text control (rAF-deferred
  when React Aria still owns focus); the existing focus trap is unchanged.
- **Indent** is in Position next to **Outdent**, with the disabled reason visible
  on a second line. The menu is now viewport-capped and scrolls internally
  (`max-height`, `overflow-y`), because the prose menu is the complete menu.
- Menu classification treats the formula render and image node as card/chrome,
  as the brief lists them.

### 2. Page Edit formula source

In Page Edit the inline formula source is no longer constrained by the
fragment-sized block. `FormulaNodeView` appends the source to the body as a
fixed, viewport-clamped panel anchored to the formula (`nf-formula-panel-page`,
z-index 45, below the menu at 60), flipping above/below when needed. It is
marked as Page Edit chrome (`data-page-edit-extension`) so the overlay's
outside-click commit does not fire when the panel or menu is clicked.

Measured in the UI suite at 1440×900 with a formula in the first Page block:

- panel width 420 px (the narrow block is 160 px wide);
- the three actions (Branch from term, Copy formula, Inline) share one row and
  are fully inside the panel and the viewport;
- the preview is fully inside the panel;
- `panel.scrollWidth <= panel.clientWidth`, `overflow-x` is not `auto/scroll`,
  and the page scroll surface has no horizontal overflow.

The block's own vertical scroll remains; the panel never scrolls horizontally.
Esc closes the source first, then the overlay; ⌘↵/Done commit the block once and
one structural undo restores it.

### 3. Mode parity

`setDocumentLayout` no longer forces Page→Read / Continuous→Edit. Layout and
interaction mode are independent (ADR-0007): Continuous Edit → Page stays Edit,
Continuous Read → Page stays Read, Page Edit → Continuous stays Edit. Page Edit
is still opt-in per block: a switch never auto-opens an overlay, the selected
block stays selected, and Enter/click/double-click opens it as today. The
existing commit-before-switch rule (`commitPageEdit`) is unchanged, including a
rejected commit keeping the overlay and the view.

`normalizeDocumentViewState` still maps a Page view with no stored mode to Read
(legacy/corrupt value); explicit Edit survives. Session restore keeps the stored
mode (covered by the existing Page Read and Page Edit reload suites and the new
parity suite).

### 4. Indent / outdent

`apps/desktop/src/renderer/src/lib/indent.ts` is the single pure rule:
Indent = become the last child of the **previous primary sibling**; Outdent =
after the parent. The runtime calls `block.move` (no second move path), and
core keeps the cycle and non-empty-chapter checks.

- Tab/Shift+Tab on a selected block, the Position menu, and the palette use the
  same helper and outcome. A missing previous sibling reports
  “No previous sibling to indent under.” and the menu shows it as the disabled
  reason. Tab in text stays native (lists/code/tables keep their native indent);
  the keymap still requires a real branchBlock node selection.
- Clicking the gutter now sets that branchBlock node selection (UX §4.5 “Block
  selected”), which is the keyboard entry for ⇥/⇧⇥. This is the only selection
  behavior change; it does not alter drag/reorder.
- **Anchored edge rule** (core `applyBlockMove`/`detachBlock`):
  - same-parent reorder keeps the anchored primary edge, its ID, and its anchor,
    updating only the order key;
  - a reparent turns the old anchored primary edge into a **reference** with the
    same source/anchor (dashed cite) and creates a fresh primary edge at the
    destination; reference edges are untouched;
  - Indent/Outdent/Move to… return the success notice “Kept as reference from
    ‘source’”, which `report` shows as one info toast;
  - one undo restores both records (the command snapshot), verified in core and
    in UI.

---

## Files changed

**Core**

- `packages/core/src/commands/block.ts` — same-parent anchored reorder; anchored
  reparent → reference citation.
- `packages/core/test/move-anchor-role.test.ts` — new: same-parent edge/anchor,
  reparent citation + undo, sibling placement leaving the parent, unrelated
  references untouched, cycle/invalid placement rejections.
- `packages/core/test/anchor-commands.test.ts` — the two anchored-move
  expectations updated for the citation contract (branch is a reference, not
  deleted).

**Renderer — context menus and indent**

- `apps/desktop/src/renderer/src/lib/editor-context-menu.ts` — new: classifier,
  text snapshot/restore, Cut/Copy/Paste/Select All groups, table group, cell
  selection helper, text-only menu entry point.
- `apps/desktop/src/renderer/src/lib/indent.ts` — new: pure Indent/Outdent
  targets/reasons.
- `apps/desktop/src/renderer/src/actions.ts` — target-aware `openBlockMenu`,
  notice-aware `report`, Position Indent/Outdent, palette Indent/Outdent,
  Read-mode whitelist for Copy/Select All.
- `apps/desktop/src/renderer/src/state/runtime.ts` — `ApplyOutcome.notice`,
  `indent`, anchored citation notice in `moveBlock`/`outdent`, `outdentTarget`.
- `apps/desktop/src/renderer/src/editor/bindings.ts` — `openBlockMenu` options.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — notice toast.
- `apps/desktop/src/renderer/src/editor/keymap.ts` — Tab = indent, Shift+Tab =
  outdent, both with the shared reason.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx` — pass the
  right-click target; Read card menu; gutter node selection; chapter-title input
  text menu with suppressed blur.
- `apps/desktop/src/renderer/src/editor/views/code-block-view.ts` — text-only
  menu on code content and language input; language blur suppressed while the
  menu is open.
- `apps/desktop/src/renderer/src/editor/views/formula-node-view.ts` — text-only
  source menu, selection preservation, suppressed blur, Page Edit fixed panel
  with viewport clamp/flip and scroll/resize tracking.
- `apps/desktop/src/renderer/src/page/PageBlockEditor.tsx` — overlay prose text
  menu; outside-click exclusions for the menu/panel.
- `apps/desktop/src/renderer/src/shell/ContextMenu.tsx` — viewport-capped menu,
  data attributes for the suite.
- `apps/desktop/src/renderer/src/state/shell.ts` — layout switch preserves mode;
  context-menu `onClose`.
- `apps/desktop/src/renderer/src/styles.css` — Page formula panel, scrollable
  menu cap.
- `apps/desktop/src/shared/api.ts`, `apps/desktop/src/preload/index.ts`,
  `apps/desktop/src/main/index.ts` — narrow native text-command bridge.

**Unit tests**

- `apps/desktop/test/indent.test.ts` — new: previous-sibling rule, first child
  disabled, child order, outdent precondition, unknown block.
- `apps/desktop/test/editor-layouts-modes.test.ts` — layout-switch parity.

**UI/e2e tests**

- `tests/support/ui-session.mjs` — `ensureInteractionMode`.
- `tests/ui/editor-surfaces.test.mjs` — new suite (6 cases): target-aware menus,
  Read gating, selection Cut/undo/Select All, Page formula panel geometry and
  text menu, mode parity + session restore, Tab/menu/palette indent/outdent +
  undo, anchored outdent citation + one undo.
- `tests/ui/suites.mjs` — register the new suite.
- `tests/e2e/m2-editor.test.mjs` — block-menu helpers use the target-independent
  gutter; menu focus assertion is the first enabled item.
- `tests/ui/m4b1-page-view.test.mjs`, `m4b1a2-read-mode-gating.test.mjs`,
  `ui-batch-a.test.mjs`, `v0-shell-frame.test.mjs`, `special-text.test.mjs` —
  intentional parity/target-contract updates.
- The 18 suites with a `showPageRead`/`waitForPageRead` setup helper now ensure
  Read explicitly (one line each) because layout switching preserves the mode.

---

## Existing assertions updated (intentional contract changes)

1. **Anchored move** (`packages/core/test/anchor-commands.test.ts`): the old
   branch is now a `reference` with the same source/anchor instead of
   `undefined`; the destination still gets a fresh primary edge and undo is
   exact. Required by the brief's anchor rule.
2. **Layout switch mode** (`apps/desktop/test/editor-layouts-modes.test.ts`,
   `m4b1-page-view`, `m4b1a2`, `ui-batch-a`, `v0-shell-frame`): Page no longer
   forces Read and Continuous no longer forces Edit; tests now assert the stored
   mode and state Read/Edit explicitly where their scenario needs it.
3. **Block menu for code** (`m2-editor` helpers): the card/chrome menu is opened
   from the gutter, because code content intentionally gets a text-only menu.
4. **Menu first item** (`m2-editor`): the first **enabled** item is focused (the
   text group starts with disabled Cut/Copy without a selection).
5. **Block menu in `special-text` D3**: opened from the gutter (card menu, no
   text group) and now includes Indent/Outdent.

No assertion was weakened; removed assertions are none.

---

## Checks run (real timings)

| Check | Result | Timing |
|---|---|---|
| `npm ci --no-audit --no-fund` (fresh worktree) | 199 packages | 2 s |
| `npm run typecheck` (node/web + core/layout/pdf) | pass | clean |
| `npm run check:boundaries` | 230 files, 1,075 imports, 16 rules | pass |
| `npm test` | 134 files / 1,333 tests | 4.84 s (verify run; 4.34 s standalone) |
| `npm run e2e:critical` | 16/16, 35.2 s suite (43.4 s command) | pass |
| **`npm run verify:fast`** | **exit 0** | **55.0 s real** |
| New `tests/ui/editor-surfaces.test.mjs` | 6/6, 4.6 s suite | 12.8 s command |
| `m4b1-page-view` | 10/10 | 15.3 s command |
| `m4b1b1-page-edit-overlay` | 8/8 | 7.8 s suite |
| `m4b1a2` + `m4b1-page-view` + `m4b1b1` (combined) | 19/21 first run; the 2 failures were the updated `m4b1-page-view` parity expectations (fixed); after the fix: `m4b1-page-view` 10/10, `m4b1b1` 8/8, `m4b1a2` green | 25.6 s command |
| `m4d2` + `ui-batch-a` | 17/17 | 21.9 s command |
| `v0-shell-frame` + `m4d1` | 8/8 + 3/3 after fixes | 17.4 s + 18.3 s |
| `r1b` + `r2a` + `special-text` | 16/16 after fix (special-text 9/9) | 19.7 s |
| `m4c1` + `m4c3` + `m4e1` | 13/13 | 20.4 s |
| `m4d1` + `r2b` + `r2d` | 10/10 | 18.4 s |
| `r2e` + `r2f` + `r2g` | 8/8 | 11.6 s |
| `r2i` + `r2j` + `ui-appearance-v3` | 17/17 | 16.6 s |
| `ui-batch-b` + `ui-settings-advanced` + `m4d2` | 29/29 | 24.9 s |
| `m3-anchor-outline` + `m3-reference` + `m2-shell` | 9/9 | 17.5 s |
| `m3h5` + `m3h3` + `ui-overlay-command-gate` | 11/11 | 14.9 s |

UI suites were run at concurrency ≤ 3 (individual processes or three at a time).
`verify:fast` was run once at the end, without a full `verify`.

**Screenshots** in `artifacts/editor-surfaces/`:

- `menu-prose.png` — prose text group + complete block menu, Indent/Outdent
  reasons;
- `menu-card.png` — formula-render card/chrome menu, no text group;
- `menu-cell.png` — cell text + table commands, no structure;
- `menu-formula-source.png` — formula source text-only menu, source open;
- `page-formula-panel.png` — expanded Page Edit formula panel;
- `mode-parity-page-edit.png` — Continuous Edit → Page Edit, no overlay;
- `indent-result.png` — indent result with the disabled-reason toast.

---

## Acceptance

| Criterion | Status |
|---|---|
| Prose right-click shows text group + full block menu; card shows block menu; cell shows text + table commands; code/formula inputs text only; Read shows Copy/Select All | **PASS** (`editor-surfaces` case 1) |
| Formula source stays open on right-click; text actions work with selection preserved; one menu only; Escape restores focus | **PASS** (cases 1–3; textarea selection restored at contextmenu and after actions) |
| Page Edit formula panel expands with all controls visible and no horizontal scroll | **PASS** (case 3 measures panel/buttons/preview and scroll widths) |
| Layout switch preserves Edit/Read; Page Edit does not auto-open; session restore works | **PASS** (cases 3–4 + existing reload suites) |
| Indent/outdent deterministic, menu + keybinding + palette; anchored reparent becomes a reference edge; same-parent reorder preserves the anchor; undo works | **PASS** (core tests + cases 5–6) |
| No schema/settingsVersion/Page/PDF/export/showcase change; no fixed sleeps/native dialogs; existing assertions updated, none weakened | **PASS** (diff scope; new tests wait on conditions/focus states; no sleep) |

---

## Risks / open questions

1. **Page Edit prose menu is text-only.** The full block menu would mutate the
   block behind a live overlay buffer (insert image/table, delete, split). The
   overlay is a one-block editor, so its prose menu keeps the text group only.
   Continuous prose has the complete menu. If the product owner wants the full
   menu in Page Edit later, it needs a commit/gate design first.
2. **Chapter-title input** now gets a text-only menu with suppressed blur; the
   chapter structure menu remains on the chapter chrome. This follows the
   “editable text input” rule without committing a title draft on menu open.
3. **Native text bridge.** Cut/Copy/Paste depend on the new
   `shell:edit-text-command` IPC (focused `webContents`). It is limited to the
   three fixed commands and preserves platform rich text/undo. Read Copy is
   plain text. A future rich clipboard export could use the same bridge.
4. **Page formula panel is body-level chrome.** It is intentionally excluded
   from the overlay's outside-click commit and sits below the context menu. A
   product-owner visual pass over the dark/light panel placement is still
   worthwhile; the automated geometry assertions cover both fit and flip logic
   at 1440×900 only.
5. **Full verify / visual pass.** Not run here per the brief. The Orchestrator's
   full `verify` at UI concurrency 4 and the product-owner visual/VoiceOver pass
   remain the integration gates. The first `verify:fast` run after the final
   code changes hit one e2e failure under load; the two subsequent
   `e2e:critical` runs and the final `verify:fast` were green (35.2 s suite), so
   treat it as a timing flake until the Orchestrator's run says otherwise.
6. **Merge seam.** The parallel identity builder was expected to touch
   `actions.ts`/core commands. This task changes `openBlockMenu`/`report`/palette
   in `actions.ts` and `applyBlockMove`/`detachBlock` in
   `packages/core/src/commands/block.ts`. Rebase those hunks carefully; no other
   shared file is expected to conflict.
7. **No drag.** The design's phase 2 drag is untouched; the gutter still only
   selects/opens/reorders via the existing pointer path.

---

## Next step

Integrate the single commit and run the full `npm run verify` at UI concurrency
4. Then the product owner's visual/VoiceOver pass over the Page formula panel,
the contextual menu (prose/card/cell/source), and the indent toast; the
Orchestrator can update `docs/reviews/settings-inventory` AP-8 and the ADR/UX
wording for mode parity.
