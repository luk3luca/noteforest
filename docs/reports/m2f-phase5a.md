# M2f phase 5a — Keyboard/focus and accessibility

**Date:** 4 November 2026  
**Builder:** implementation sub-agent  
**Worktree:** `a builder worktree`  
**Branch:** `t3/m2f-phase5a-keyboard-a11y`  
**Base:** `034441b` (`main`: docs: start M2f phase 5a keyboard and accessibility)  
**Scope:** F5 and F16 only. No cleanup/dead code (5b), undo, M3, page view, or PDF.

## Commits

- `5257fd9` fix(desktop): let Tab leave the editor and activate card controls
- `a9f4bf1` fix(desktop): make save state, menus, tabs and focus order accessible
- `00e254c` test: cover the phase 5a keyboard path and axe best practices
- docs report (this change set)

## Verdict

`Tab` no longer traps keyboard users in the contenteditable body: when no structural action
applies it returns `false`, so focus moves to the chapter title and then the card controls.
`Shift+Tab` returns. List, code, table, and blockquote keep their native indent; a selected
block still uses `Tab` for make-child and `Shift+Tab` for outdent.

Every card control is a tab stop with the standard 2 px focus ring: drag/block-actions,
add child, add sibling, and branch port. Enter/Space activates the native buttons; the drag
handle opens the existing block-actions menu on keyboard activation, which gives keyboard
users Move up/down (and Move to…/Delete) without a pointer drag.

Save state is a polite `role="status"` live region (`Saved`, `Saving…`, `Unsaved changes`,
`Save failed` with the error detail). The context menu focuses its first item, traps Tab,
supports arrow navigation, closes on Escape, and restores the previous focus. The tab strip
has an announced **Close &lt;title&gt;** action, and the tabs/panels now use valid tablist
relationships (`aria-controls` → `role="tabpanel"`).

`Ctrl+Tab` is no longer dead code; it cycles tabs and `Ctrl+Shift+Tab` cycles backwards.
Axe now runs best-practice rules as a recorded, non-blocking report; serious/critical stays
at zero.

`npm run verify` passes: typecheck, 241/241 unit tests, 26/26 critical e2e tests, 10/10
recovery tests, and 1/1 view-UI test. No native dialog was added or weakened, and no test
uses a fixed sleep.

## Focus order

The DOM order is the keyboard focus order:

1. Title bar (document title, command palette, settings).
2. Tab strip (active tab, close-active-tab, new document, all tabs).
3. Sidebar (search, library, outline).
4. Editor: chapter title → per-card focus ring (block actions/drag handle → add child →
   add sibling → branch port) → chapter add → canvas add chapter.
5. Status bar (zoom, Fit, Focus, document path).

The tab strip is rendered before the sidebar in the DOM. CSS keeps it visually over the
editor column (the sidebar remains full content height), so the requested order is met
without changing the M2 shell layout. The first Tab stop after the tab strip is the active
tab; inactive tabs are removed from the tab sequence until selected.

Evidence: `artifacts/m2f-phase5a/card-control-focus-1440x900.png` (focused drag/block-actions
control) and `artifacts/m2f-phase5a/context-menu-focus-1440x900.png` (first menu item
focused). These files are gitignored build evidence.

## What changed

### Tab/Shift+Tab

- `apps/desktop/src/renderer/src/editor/keymap.ts`: both handlers return `false` when the
  selection is not a selected block, when no bindings exist, or when the block ID is
  missing. Selected-block make-child/outdent still returns `true`. `inAtomicContext`
  (list/code/table/blockquote) is unchanged.
- The browser's native traversal moves focus to the chapter title and then the NodeView
  controls; no manual focus jump was needed.
- `apps/desktop/src/renderer/src/editor/views/BlockViews.tsx`: the gutter button is now
  `Block actions and reorder`; its native Enter/Space click (event detail 0) opens the
  block-actions menu at the control, while pointer activation stays on the drag path.

### Shell and ARIA

- `apps/desktop/src/renderer/src/shell/StatusBar.tsx`: save state is a `role="status"`,
  `aria-live="polite"`, `aria-atomic="true"` region; failed saves append the error text in a
  visually hidden span.
- `apps/desktop/src/renderer/src/shell/ContextMenu.tsx`: captures the opener before the menu
  autofocuses, focuses the first item once the full React Aria collection exists, traps
  Tab/Shift+Tab (wrapping), keeps Escape close, and restores focus unless an action or dialog
  deliberately moved it.
- `apps/desktop/src/renderer/src/shell/TabBar.tsx`: each tab has `aria-controls`; the tab
  strip has a focusable `Close <title>` action. The per-tab hover `×` stays a pointer
  shortcut and remains `aria-hidden`/`tabIndex=-1` so the tablist contains only tabs.
- `apps/desktop/src/renderer/src/lib/tab-ids.ts` (new): encoded tab/panel IDs shared by the
  tab strip, editor, and recovery surface.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx`,
  `apps/desktop/src/renderer/src/shell/RecoverySurface.tsx`: editor and recovery roots are
  `role="tabpanel"` with `aria-labelledby` pointing at their tab.
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` + `styles.css`: tab strip moved before
  the sidebar in DOM, absolutely positioned over the editor column; editor column gets the
  matching 36 px top inset. The wrapper is width-constrained so deep branches still scroll
  inside the editor instead of widening the shell.
- `apps/desktop/src/renderer/src/App.tsx`: `Ctrl+Tab`/`Ctrl+Shift+Tab` branch runs before the
  `mod` check that previously made it unreachable; `⌘⇧[`/`⌘⇧]` share the same cycle helper.

### Tests and gates

- `tests/e2e/m2-editor.test.mjs`: the M2c test now clicks into the paragraph before Tab and
  asserts focus leaves the contenteditable body. New keyboard test covers editor exit/return,
  card control order, focus ring, collapse/add-child activation, block-actions menu, context
  menu focus trap/arrow/Escape/restore, save-state announcements, `Ctrl+Tab`, and the
  announced close action.
- The axe runner includes `best-practice`; it fails only on serious/critical and writes
  `artifacts/m2f-phase5a/axe-best-practice.json`.
- `tests/ui/m2-view.test.mjs` (new): the zoom/fit/focus flow moved out of the critical suite.
  `npm run test:ui` is part of `verify`, not `verify:fast`. No data-safety, desync, arrow,
  layout, or keyboard coverage was deleted.
- `docs/definition-of-done.md`: suite split updated for `test:ui`.

## Gate table

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass — desktop node/web, core, layout, pdf |
| Unit | `npm test` | Pass — 241/241 tests, 26 files, 1.80 s |
| Critical e2e | `npm run e2e` | Pass — 26/26; 58.67–59.14 s suite across two `verify` runs (< 60 s) |
| View UI | `npm run test:ui` | Pass — 1/1, 1.28 s; moved out of the critical suite |
| Recovery integration | recovery suite in `verify` | Pass — 10/10, 19.01 s (phase 4a 5.10 s + phase 4b 5.94 s plus harness) |
| Full verification | `npm run verify` | Pass — exit 0, 1:42.30 wall on the final run |
| Axe serious/critical | axe in critical e2e | 0 across shell, command palette, topic tree, delete dialog |
| Axe best-practice | same run | Recorded, non-blocking: shell/tree have `landmark-one-main`, `page-has-heading-one`, `region` (moderate); palette and dialog clean |
| Native dialogs | — | No native dialog added; E2E dialog guard untouched |
| Manual/screen recording | — | No screen recording or Notability; screenshots only |

Critical-suite timing note: the brief quoted ~56.8 s on its reference run. This machine's
pre-change baseline was 63.6 s, and repeated post-change verify runs measured 58.7 s and
59.1 s, with one standalone run at 66.6 s, so there is roughly ±8 s of run-to-run variance.
The keyboard test adds ~2.7 s; moving the view test removes ~1.3 s plus one app quit. Both
final verify runs are under the 60 s target.

## Before / after

| Behavior | Before | After |
| --- | --- | --- |
| Tab in a paragraph | Swallowed (`return true`); no focus traversal | `false`; focus moves to chapter title, then card controls |
| Shift+Tab | Swallowed outside a selected block | Returns to the contenteditable body / previous control |
| Card controls | Pointer or shortcuts only | Visible tab stops with 2 px focus ring; Enter/Space activates |
| Drag handle | Pointer drag only | Keyboard activation opens the block-actions menu (Move up/down, Move to…, Delete) |
| `Ctrl+Tab` | Dead branch because `ctrlKey` made `mod` true | Cycles tabs, `Ctrl+Shift+Tab` backwards |
| Save state | Visual text only | Polite live region with failure detail |
| Context menu | Focused first item, no trap or restore | Focus trap, arrow navigation, Escape close, focus restore |
| Tab close | `aria-hidden` + Delete/⌘W only | Announced **Close &lt;title&gt;** action; valid tablist ARIA |
| Tab panel relationship | Tabs had no `aria-controls` | Tabs control `role="tabpanel"` roots |
| Axe scope | WCAG 2a/2aa/21a/21aa only | Adds best-practice report; serious/critical gate unchanged |
| Critical suite | Zoom/fit/focus in `tests/e2e` | View flow in `tests/ui`; `verify` runs both |

## Axe report

Full JSON: `artifacts/m2f-phase5a/axe-best-practice.json`.

- Serious/critical: **0** at shell, command palette, topic tree, and delete dialog.
- Best-practice (moderate, non-blocking): `landmark-one-main`, `page-has-heading-one`, and
  `region` on the shell and topic-tree runs. `region` targets the tablist, the sidebar
  separator, and the editor panel. The command palette and delete dialog report none.
- These are semantic/landmark improvements, not keyboard traps; they are recorded for 5b or
  a later shell-polish pass.

## Known gaps

- The manual VoiceOver/keyboard pass remains a human/product-owner check; this task provides
  automated keyboard and axe evidence only.
- The per-tab hover `×` is still a pointer shortcut because a focusable button inside a
  `role="tablist"` fails `aria-required-children`. The accessible close is the tab-strip
  **Close &lt;title&gt;** action (plus `Delete` on the tab and `⌘W`).
- Every card contributes up to four tab stops. That is intentional for reachability in 5a;
  at 1,000 blocks a future roving-tabindex/card focus mode may be preferable.
- An inactive recovery tab has no rendered panel while hidden, so its `aria-controls` target
  appears when the tab is activated rather than at all times.
- Best-practice axe findings above are deliberately non-blocking and remain open.
- No M3/page/PDF, undo, or 5b cleanup work was started.

## Next suggested step

Product-owner manual VoiceOver/keyboard pass on the evidence build, then M2f phase 5b
(cleanup, dead code, unused dependencies, docs consistency). M3 stays blocked until M2f is
accepted.
