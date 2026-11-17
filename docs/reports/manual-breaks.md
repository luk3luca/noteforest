# Manual breaks — implementation report

**Builder:** implementation sub-agent
**Date:** 16 November 2026
**Worktree:** `a builder worktree`
**Branch:** `t3/manual-breaks-control-list-cleanup`
**Base:** `f015d08` (`main`, the docs commit that adds the brief)
**Scope:** MB1 — the `Start on a new page` control, the `Breaks` sidebar section, the cleanup, and
the three paginator cases. No paginator change, no schema/`settingsVersion` change, no Settings page,
no Continuous marker, no `Remove all`, no reordering.

## Summary

The paginator already honoured `pageSettings.manualBreakBeforeBlockIds` and warned when it could not;
nothing created a hint, nothing listed one, and deleting a block left a dead id. This batch adds the
three missing pieces:

1. **The control.** `Start on a new page` in the block context menu (Continuous, the outline, edges)
   and on a Page card, with the four approved states in precedence order: note start, chapter start,
   not a row leader, enabled/checked. The check is the stored hint.
2. **The list.** A fifth activity-bar entry, `Breaks`, in the sidebar rhythm: 28 px header with the
   count, plain 28 px navigation rows (no card), `Page N · <title>` from the **live pagination**,
   `Can’t be honoured here.` plus the message in the row title for a broken hint, a hover/focus `×`,
   and the one-line empty state. Click navigates (Page turns to the page, Continuous reveals the
   block).
3. **The cleanup.** After every structural commit (and undo/redo) the per-document override is
   **recomputed from the current document**: ids that no longer exist are dropped, a hint whose block
   exists but is no longer a row leader is kept and warned, and the global default stays `[]`.

The row-leader rule is the F11 decision: a break is a horizontal cut at a row's y, so a child placed
beside its parent and a mode A callout cannot carry one. The item is offered **disabled with the
reason**, never silently ignored.

## Files changed

### New

- `apps/desktop/src/renderer/src/lib/manual-breaks.ts` — the pure rules: `pageRowLeaderIds` (leftmost
  at y in the page layout), `continuousRowLeaderIds` (measured right/below placement, callouts never
  offered), `manualBreakMenuState` (four states + reasons), `pruneManualBreakIds`,
  `manualBreakPageNumber`, `manualBreakWarningsById`, `manualBreakRows` (document order, broken
  state, title).
- `apps/desktop/src/renderer/src/shell/BreaksSection.tsx` — the `Breaks` section. It mounts the
  existing `usePageModel` while open so the page numbers are live in **both** layouts, and renders
  the rows, the broken line, remove, the count and the empty state.
- `apps/desktop/test/manual-breaks.test.ts` — 23 tests: menu precedence, page/Continuous row leaders
  (including a real mode A callout), prune rules, list rows, and the runtime cleanup over a real
  `DocumentRuntime` (delete-subtree, split, merge, non-leader kept, stale id).
- `tests/ui/manual-breaks.test.mjs` — 3 suites (menu + reload, list + broken row + remove + empty,
  Page card + live page + navigation + Page Read).

### Modified

- `apps/desktop/src/renderer/src/actions.ts` — the one `manual-break` entry, `setManualBreak`
  (commit the Page Edit overlay first, never retarget a closed document), `navigateToManualBreak`,
  `openPageCardMenu`; the item sits before the destructive group; the Read gate leaves the page
  setting to its own predicate.
- `apps/desktop/src/renderer/src/lib/editability.ts` — new `pageSettingsAuthoringEnabled`: page
  settings are personal (ADR-0008), so they are authored in **either layout in Edit** and never in
  Read or on a read-only document. Shell block authoring stays Continuous-only.
- `apps/desktop/src/renderer/src/state/runtime.ts` — the measured Continuous below stack is kept for
  the menu (`childPlacementBelowIds`), and `pruneManualBreaks()` runs after `acceptStructural`,
  structural undo and structural redo (recomputed, never replayed).
- `apps/desktop/src/renderer/src/page/PageView.tsx` — a Page card's `contextmenu` opens the card menu.
- `apps/desktop/src/renderer/src/shell/ContextMenu.tsx` — `data-menu-checked` so the toggle state is
  observable (the check glyph is `aria-hidden`).
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — the fifth entry, the `SeparatorHorizontal` icon,
  the section switch and the collapse refs.
- `apps/desktop/src/renderer/src/state/shell.ts`, `apps/desktop/src/main/library.ts`,
  `apps/desktop/src/shared/api.ts` — `'breaks'` is a valid `SidebarTab` and persists in the session.
- `apps/desktop/src/renderer/src/styles.css` — the `Breaks` section (28 px rows, 40 px two-line broken
  row, hover `×`, token-only type), the `.nf-breaks` sidebar guard prefix, and a two-line wrap for the
  manual-break reason only (the sentence must be readable, not ellipsized).
- `packages/layout/test/pagination.test.ts` — the three cases the brief names; **no engine change**.

### Tests realigned to the ratified fifth entry (not weakened)

- `apps/desktop/test/session-sidebar.test.ts` (Breaks persists), `read-mode-gating.test.ts` (the new
  predicate), `sidebar-system-css.test.ts` (`.nf-breaks` in the token guard), `dialog-copy.test.ts`
  (`BreaksSection.tsx` joins the copy scan).
- `tests/ui/document-health.test.mjs`, `find-bar.test.mjs`, `library-surface.test.mjs`,
  `v0-shell-frame.test.mjs` — 4 tabs → 5, and the End/wrap expectations use Breaks as the last entry.
- `tests/ui/special-text.test.mjs` — the exact block-menu id order gains `manual-break` before
  `delete`.
- `tests/ui/suites.mjs` — `manual-breaks.test.mjs` in `FILES` and the `shell` group.

## Checks (real timings)

| Check | Result |
|---|---|
| `npm run verify:fast` (boundaries + typecheck + unit + e2e) | **exit 0**, 67.13 s wall: boundaries 273 files/1334 imports/16 rules, unit 158 files / 1604 tests (7.89 s), build, e2e 16/16 (~46 s) |
| `npx vitest run apps/desktop/test/manual-breaks.test.ts` | 23/23, ~0.19 s |
| `npx vitest run packages/layout/test/pagination.test.ts` | 10/10, 0.11 s |
| `node tests/ui/run.mjs --group shell --concurrency 2` | **21/21 passed, 0 failed, 207.4 s** (`manual-breaks.test.mjs` 13.1 s) |
| `node tests/ui/run.mjs --group page --concurrency 2` (extra, PageView changed) | **18/18 passed, 0 failed, 156.4 s** |

The full `npm run verify` was not run: the Orchestrator owns the integration gate.

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Enabled and toggles on a top-level block; the check reflects the stored hint after a reload | **Pass** — UI suite toggles, asserts the per-document entry, then quits and relaunches and sees the check |
| 2 | Disabled with the matching reason on a beside child, a mode A callout, a chapter's first block and the note's first block | **Pass** — UI suite (beside child, callout created through the anchor path, chapter first, note first) and unit tests (including a real mode A layout) |
| 3 | Toggling changes the Page count when the break moves content; the list page number follows | **Pass** — Page suite: 3 → 4 pages, `b4` row reads `Page 2 · Block 4` |
| 4 | Every stored hint in document order, navigates, removes, count, one-line empty state | **Pass** — list suite (array order `side, method` renders `method, side`; click selects; `×` removes; count 2 → 1 → 0; empty copy verbatim) |
| 5 | A hint that cannot be honoured keeps its row with the message in the title | **Pass** — unit rows test (paginator `impossible-hint` message) and UI (non-leader row shows the reason in `title`); `manualBreakWarningsById` filters non-hint defects |
| 6 | Delete (and subtree), split and merge leave no dangling id | **Pass** — runtime tests: delete-subtree prunes `b` + `bb` and keeps `a`; split keeps the original hint and never gives one to the new block; merge keeps the survivor and drops the absorbed id |
| 7 | In Read the item and `×` are disabled; navigation still works | **Pass** — Continuous Read (outline menu + list) and Page Read (card menu) both show the disabled item with the one Read reason; the list row still navigates |
| 8 | No regression: page count, PDF, warnings, find, health, library | **Pass** — 1604 unit tests, shell 21/21, page 18/18 (PDF gate, print compositor, export, find, health, library, lifecycle, vault) |

## Design decisions and deviations

1. **Row leader in Continuous.** Continuous has no page model by design (R2a), so the menu uses the
   placement data the renderer already owns: top-level blocks plus the measured **below** stack, with
   **callouts never offered** (Page can place a callout in the parent's right lane, mode A — the F11
   hazard). Page is exact from the mounted page model. A hint created in Continuous can still become
   impossible after a later density/width change; the design accepts this and the `Breaks` list warns.
2. **Page card menu.** The card's right-click opens a **one-item** menu (the same entry), not the full
   block menu. Page Edit deliberately does not enable shell-level block authoring (`editingEnabledFor`
   is Continuous-only), so the full menu in Page Edit would be ~25 rows disabled with ` — Read mode`
   copy while the user is not in Read. Flagged for the Sentinel in open questions.
3. **Page-settings gate.** The item is disabled in Read and on a read-only document in both layouts,
   as the brief states, through one new pure predicate (`pageSettingsAuthoringEnabled`). The
   `readOnlySafeMenuEntry` whitelist keeps the item out of the generic ` — Read mode` rewrite because
   it already states its own reason.
4. **Live page numbers in both layouts.** The `Breaks` section mounts the existing `usePageModel`
   while it is open (the same hidden measurement host as Page Read and the Settings preview). No
   always-on measurement and no architecture change; the cost is one model run while the list is
   visible (two when Page is also open).
5. **Cleanup trigger.** Structural commits, undo and redo prune; the section also cleans a stale id
   from an older build/external edit when it opens. Undo does not restore a pruned hint, because the
   override is not in the document history (the brief's rule).
6. **Copy.** The manual-break reason wraps to a second line in the menu (otherwise the approved
   sentence is ellipsized at 224 px); every other menu keeps the single ellipsized description.

## Open questions / risks

- **Page card menu shape.** A one-item menu versus the full block menu in Page Edit: the latter
  conflicts with the existing "Page Edit does not enable shell authoring" gate. A product decision is
  needed if the Sentinel wants the full menu there.
- **Continuous callouts.** B2 callouts are row leaders in Page, but Continuous cannot know the future
  mode, so the item is conservatively not offered there. If the product wants B2 callouts offered
  from Continuous, the menu needs a page-model source in Continuous (an architecture change).
- **Duplicate measurement.** Opening `Breaks` in Page runs a second page model alongside PageView.
  Correct and bounded (only while the tab is open); a shared model registry would remove the duplicate
  work if it ever matters.
- **`impossible-hint` for a non-leader hint.** The paginator often honours a hint on a right-placed
  child by cutting before the parent, so the engine emits no warning; the row says
  `Can’t be honoured here.` with the row-leader reason instead. That matches design §7 ("warned, not
  deleted") but the sentence is the product's, not the paginator's.

## Next step

- Sentinel review of this worktree; the two decisions above (Page card menu shape, Continuous
  callouts) are the only product-facing questions.
- Optional follow-up: a shared page-model registry so `Breaks` and PageView share one run.

## Evidence

Screenshots (gitignored, on disk) under `artifacts/manual-breaks/`:
`menu-enabled.png`, `menu-checked.png`, `menu-disabled-row.png`, `breaks-list.png`,
`breaks-empty.png`, `page-after-break.png`.
