# UI shell fixes — implementation report

**Builder:** implementation sub-agent
**Date:** 13 November 2026
**Worktree:** `a builder worktree`
**Branch:** `t3/ui-shell-fixes`
**Base:** `040f55f` (`main` head when the brief landed)
**Head after this batch:** the five fix commits end at `bff0db9`; this report is the final docs commit on the same branch.
**Scope:** the thirteen fixes in `docs/tasks/ui-shell-fixes.md`; no schema/settings-version change,
no Page/PDF visual change, no draft-document feature.

## Commits

| # | Commit | Area |
|---|---|---|
| 1 | `8543aa9` feat(continuous): make accent-strong the resting primary edge | Continuous edges |
| 2 | `33e8abb` fix(settings): one 320 px control geometry and a true card inset | Settings + card inset |
| 3 | `aedfe81` fix(sidebar): one column grid, full-row selection, 28 px rows | Sidebar visual system |
| 4 | `52c24f8` fix(shell): sidebar resize contract, stable rail icons, one selection | Sidebar interactions + selection |
| 5 | `bff0db9` fix(lock): recover stale creation locks and add status recovery actions | Lock recovery |

## What changed

### 1. Continuous edges

- `--edge: var(--accent-strong)` is now a derived alias in the `:root` alias block; the dark/light
  literal `--edge` values were removed.
- `--edge-reference` keeps the old neutral values (`#7b858f` dark, `#6c7882` light) and is used by
  `.nf-edge-reference` / `.nf-edge-reference-arrow`; reference edges stay dashed and neutral.
- Selection semantics are unchanged for deeper selections: active path 1.75 px accent, every other
  branch `--edge-muted` at 1 px / 0.35 opacity; the selected card ring remains the block cue.
- A top-level selection now mutes the branches outside its path (the path contains only itself). A
  mount-time editor selection is explicitly not treated as a user selection, so opening a document
  shows the resting accent edges instead of an already-muted tree.
- Page/PDF were untouched: Page reads `PAGE_EDGE_STYLE` / `.nf-page-*`; the edge-style isolation test
  and the appearance Page-arrow assertion pass.

### 2. Settings controls and card inset

- Every `.nf-segmented` group is a fixed 320 px inline grid with `grid-auto-columns: 1fr`, 28 px high,
  1 px padding/gap, equal centered buttons with `min-width: 0`, `padding: 0 6px`, `nowrap`.
- Both font selects are 320 × 28 with `appearance: none`, `padding-right: 30px`, a real lucide
  `ChevronDown` at right 9 px / 14 px inside `.nf-select-wrap`, `pointer-events: none`, `text-3`.
- 320 px fits the widest label set (`None / Document title / Chapter title`) at a forced UI scale of
  1.15; the automated measurement found no clipped segment at 100 or 115.
- `.nf-block-prose > :first-child > :first-child` / `:last-child > :last-child` reset the React
  node-view wrapper margins only. Top-level and child cards both measure the 10 px content inset at
  the top and bottom; `--nf-card-padding` stays 10.

### 3. Sidebar visual system

- The scroll container is the one horizontal inset (17..253 at the default width): section, library
  list and tree horizontal paddings were removed, so search, filter, headers, rows and footer share
  the same box.
- Search, filter, library rows and tree rows are 28 px; the library row content inset is 6 px; the
  section header is 28 px with `2px 6px 4px`; footer Settings stays a 30 px button.
- Library and Topics `+` are both 22 × 22 with a 13 px `Plus` and the same right edge.
- The Library selected surface moved to `.nf-library-row[data-active="true"]`; the open button is
  transparent/text-1, so the selected surface is the full 224 px row and the hidden `…` menu no
  longer steals 20 px. Both selections use `accent-soft`, a 1 px inset accent ring and 3 px radius.
- Topics and the footer have a 1 px `border-top`; Library has 12 px bottom spacing. Settings remains
  narrower than the footer (Batch A intact); the Library `+` remains.

### 4. Sidebar interactions and one selection

- The expanded header is `[collapse][search][new note]`. The rail head is flex-start with an 8 px
  inset and a 28 × 28 expand button; the rail Settings box is 30 × 30 with the same 8 px inset, and
  the rail foot uses `6px 8px 8px`. Expanded/rail icon centers are measured within 1 px.
- `SIDEBAR_MIN_WIDTH = 180`, `SIDEBAR_MAX_WIDTH = 640`, `SIDEBAR_SNAP_WIDTH = 264` live in
  `apps/desktop/src/shared/shell.ts` and are re-exported from `state/shell.ts`. The store clamp, the
  `Panel` min/max, the drag guard and the main-process session loader all consume them.
- The width persists on drag release (not mid-gesture, to avoid re-rendering the panel under the
  pointer), pins to 264 when released within 10 px after the 140 ms settle, and resets on separator
  double-click. The separator keeps `aria-label="Resize sidebar"` and gains the drag/reset title.
- Explicit `selectBlock` always clears the anchor. The sidebar anchor row still calls
  `selectBlock` then `selectAnchor`; a focus-driven editor sync keeps that just-installed anchor, and
  a real prose pointer/key clears it first, so selecting an anchor row then its source/target block
  leaves exactly one row and no `data-anchor-selected`.

### 5. Stale lock recovery

- `createDocumentPackage` acquires with `breakStale: true`; the folder was created by the same call,
  so only stale/corrupt locks can be removed and a live lock still fails. The core test proves a
  deleted-package lock does not block the reused folder name and the new store is editable; a live
  lock still fails.
- `library.createDocument` maps a remaining `document-locked` / `stale-lock` failure to: “The note
  folder is locked by another NoteForest session. Close the other NoteForest window and try again.”
  The raw lock path/message never reaches the toast (UI test asserts it).
- `DocumentStatusPanel`: the stale slim bar now has **Take over lock** (primary) and **Review**;
  takeover works in one click from the compressed bar. Generic read-only shows lock metadata in
  Details and a **Recheck** only for `readOnlyReason === 'locked'`; Recheck reopens from disk,
  stays read-only while a live lock exists (with a toast), and becomes editable after the lock file
  is removed. No force-break path was added.

## Files changed

- Continuous edges: `apps/desktop/src/renderer/src/styles.css`,
  `apps/desktop/src/renderer/src/editor/edges/EdgeLayer.tsx`, `docs/design-tokens-continuous.md`.
- Settings/card: `styles.css`, `settings/AppearanceSettings.tsx`.
- Sidebar grid/interactions: `styles.css`, `shell/Sidebar.tsx`, `shell/Workspace.tsx`,
  `state/shell.ts`, `apps/desktop/src/shared/shell.ts`, `apps/desktop/src/main/library.ts`.
- Selection: `state/runtime.ts`, `editor/DocumentEditor.tsx`.
- Lock/status: `packages/core/src/node/store.ts`, `apps/desktop/src/main/library.ts`,
  `shell/DocumentStatusPanel.tsx`, `state/runtime.ts`, `styles.css`,
  `docs/design/color-system.md`.
- Tests: `apps/desktop/test/appearance-css-guard.test.ts`, `apps/desktop/test/ui-batch-v-css.test.ts`,
  `packages/core/test/storage.test.ts`, `tests/ui/v0-shell-frame.test.mjs`,
  `tests/ui/ui-appearance-v3.test.mjs`, `tests/ui/ui-batch-a.test.mjs`,
  `tests/ui/ui-batch-v.test.mjs`, `tests/ui/ui-document-status.test.mjs`,
  `tests/ui/m3-anchor-outline.test.mjs`.

## Checks run (real timings)

| Check | Result |
|---|---|
| `npm run typecheck` | pass (desktop node/web, core, layout, pdf) |
| `npm test` | **115 files / 1202 tests passed**, 2.79 s |
| `node tests/ui/run.mjs --group shell,settings,anchors` | **28/28 suites passed**, 57.0 s, 0 pageErrors |
| `npm run e2e` (after the reload guard) | 16/16, 43.8 s |
| `node --test tests/ui/v0-shell-frame.test.mjs` | 8/8, 17.2 s |
| `node --test tests/ui/ui-batch-a.test.mjs` | 6/6, 20.5 s |
| `node --test tests/ui/ui-batch-v.test.mjs` | 5/5, 26.1 s |
| `node --test tests/ui/ui-document-status.test.mjs` | 3/3, 11.6 s |
| `node --test tests/ui/m3-anchor-outline.test.mjs` | pass (targeted repro test) |
| `npm run verify:fast` | **exit 0**, 53.2 s total; e2e 16/16 in 43.8 s |

The full `npm run verify` was intentionally not run; integration owns the single full run.

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Resting Continuous edges use accent-strong; selection still stands out; references neutral; Page/PDF unchanged | **pass** | `appearance-css-guard` alias/reference/contrast tests; `v0-shell-frame` idle/selected screenshots `edges-dark-idle`, `edges-dark-selected`, `edges-light-idle`, `edges-light-selected`; `ui-appearance-v3` reference/active/muted assertions; edge-style isolation + Page-arrow test |
| One Settings control geometry; equal segments; 28 px select with real chevron; no clipping | **pass** | `ui-batch-v` measured groups (Page worst-case labels) at 320 × 28 and forced 1.15, no clipped labels; `ui-batch-v-css` contract; screenshots `settings-page-controls-100/115`, `settings-typography-100/115` |
| Same 10 px content inset in top-level and child cards | **pass** | `ui-batch-v` measured 10 px top/bottom in both; screenshot `card-inset-top-level-child.png` |
| Sidebar one grid, 28 px rows, equal selected widths, dividers, Settings narrower | **pass** | `v0-shell-frame` grid test (width, height, insets, dividers, 22 px adds, Settings < footer); `ui-batch-a` active-ring test updated to the row; screenshots `sidebar-expanded-180/264/560-selected.png` |
| Resize 180..640, 560 persists, 264 snap/reset, icon centers within 1 px | **pass** | `v0-shell-frame` resize test (range, relaunch persistence, snap, double-click) and rail test (collapse/expand + Settings icon centers) |
| Anchor row then source/target leaves one selection, anchor cleared | **pass** | `m3-anchor-outline` repro for both source and target; sidebar anchor selection still highlights its own quote |
| New note over a stale lock; live lock user-facing | **pass** | `packages/core/test/storage.test.ts` stale/live; `ui-document-status` new-note test asserts editable reuse, live-lock toast, no path/Lock leak |
| Compressed stale bar one-click takeover; generic Recheck + metadata; no force-break | **pass** | `ui-document-status` stale slim takeover and generic Recheck (live then removed lock); metadata PID/host/session/heartbeat |
| Existing assertions updated, none weakened; no fixed sleeps/dialogs/schema bump | **pass** | UI group 28/28; no schema/settingsVersion edits; waits are condition-based except the documented resize settle timer (product behavior, not a test sleep) |

## Open questions / risks

- **Drag below the 180 px minimum** still falls into react-resizable-panels' collapse threshold
  (the framework's default is half the distance to the 48 px rail). The 180 px floor is the
  non-collapse minimum; dragging far enough below it collapses the panel, as before this batch. The
  brief's range is satisfied for a drag to 180; no layout hack was added.
- **Top-level edge treatment:** a top-level selection has no descendant path edge, so it mutes all
  branches rather than lighting any edge. A mount-time editor selection is explicitly excluded so
  the opening view keeps the resting accent edges.
- **Anchor focus hold:** the sidebar/chip actions select the source/target and then install the
  anchor; the editor's follow-up selection sync is allowed to keep that anchor. Any pointer or key
  in a block's prose clears it first, so the reported canvas repro is fixed. Keyboard block
  navigation outside the prose (e.g. a palette focus) still goes through the ordinary explicit
  selection path.
- **Sidebar width persistence** updates the store on drag release (not per pointer event) so the
  panel is not re-rendered mid-drag. The final width is clamped by the shared constants and survives
  a relaunch.
- No live-lock force-break or TTL change; a live lock on another machine still requires that
  session to close or the app to be quit/reopened.

## Next suggested step

R4 Export defaults (schema v4), then R6 Continuous global. The product-owner visual/VoiceOver pass
over the new sidebar grid, rail alignment, edge color, and status bars remains the human gate; the
screenshots above are the evidence to review.
