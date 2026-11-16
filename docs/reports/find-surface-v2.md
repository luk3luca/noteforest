# Find surface v2 — toolbar cluster + sidebar Search

**Task:** `docs/tasks/find-surface-v2.md`
**Role:** Builder
**Base:** `10f342f` (docs: find surface v2 brief)
**Status:** implemented in the worktree, not merged
**Date:** 16 November 2026

## Summary

One find surface, two presentations, one state.

- **Toolbar cluster.** `FindBar` is no longer a floating card: it is one 28 px cluster inside the
  34 px canvas toolbar, after undo/redo (and the Page controls) and before the Continuous/Page +
  Edit/Read segments, with a spacer on each side. No card, no shadow, no extra row, nothing over the
  note or the page. The input is the only shrinking part; the count, arrows and close stay.
- **Sidebar Search.** `SearchSection` is the fourth activity-bar section (after Health): header
  `Search` + occurrence count + close, a 28 px field, results grouped by chapter, then block title,
  then one row per **occurrence** with a two-line snippet around the match (match emphasised, code
  and LaTeX snippets in mono), current row filled, click jumps. It replaces the Outline while
  active and returns to the section it came from on close.
- **Shared state.** `state/shell.ts` keeps `findQuery`, `findResults`, `findTotal`, `findTruncated`
  and `findIndex` as one state; one new `FindController` (mounted once by the shell) owns the
  debounce (140 ms), the single linear scan (`findInDocument`), the clear when the last surface
  closes, and navigation. Typing in either input updates both; the count, the sidebar row and the
  Continuous/Page highlight follow. `⌘F` opens the toolbar, never the sidebar.
- **Engine untouched.** No new matching logic: the sidebar reuses the engine's
  `snippet`/`start`/`end`/`kind`, split at the match by a pure presentation helper
  (`lib/find-snippet.ts`). The Page exact-word highlight and `.md` search stay out of scope.
- **Session.** `sidebarTab` gains `'search'`; the session reader accepts it and still falls back to
  Library for unknown values (no migration, additive like Health). A restored `search` section has
  no previous section, so closing it falls back to the Outline.

## Files changed

New:

- `apps/desktop/src/renderer/src/shell/FindController.tsx` — one scan/navigation host for both views.
- `apps/desktop/src/renderer/src/shell/SearchSection.tsx` — the sidebar Search view.
- `apps/desktop/src/renderer/src/lib/find-snippet.ts` — snippet split for the match emphasis.
- `apps/desktop/test/find-surface.test.ts` — shared state, session value, snippet split.
- `docs/reports/find-surface-v2.md` — this report.

Changed:

- `apps/desktop/src/renderer/src/shell/FindBar.tsx` — toolbar cluster; store-driven input; no scan.
- `apps/desktop/src/renderer/src/shell/CanvasHeader.tsx` — mount the cluster between two spacers.
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` — mount `FindController`; the cluster leaves
  the canvas panel.
- `apps/desktop/src/renderer/src/shell/Sidebar.tsx` — fourth section, icon, panel branch.
- `apps/desktop/src/renderer/src/state/shell.ts` — `sidebarTabBeforeSearch`, `closeSearchSection`,
  `search` normalization, `closeFind` keeps a displayed result set, `findSurfaceActive`,
  `currentFindResult` no longer gates on the toolbar.
- `apps/desktop/src/renderer/src/editor/DocumentEditor.tsx` — the decoration follows either surface.
- `apps/desktop/src/renderer/src/App.tsx` — `⌘G` uses `findSurfaceActive`; a restored `search`
  session clears the previous-section memory.
- `apps/desktop/src/shared/api.ts` — `SidebarTab` adds `'search'`.
- `apps/desktop/src/main/library.ts` — session reader accepts `'search'`.
- `apps/desktop/src/renderer/src/styles.css` — cluster (28 px, no card/shadow), sidebar Search list.
- `tests/ui/find-bar.test.mjs` — toolbar geometry/mount, sidebar Search, Page/Read, narrow width,
  no-document/`.md`, screenshots under `artifacts/find-surface-v2/`.
- `tests/ui/library-surface.test.mjs`, `tests/ui/document-health.test.mjs`,
  `tests/ui/v0-shell-frame.test.mjs` — the activity bar now has four sections (count, wrap order,
  Search below Health), not weakened.

## Checks with timings

| Check | Result | Time |
| --- | --- | --- |
| `npm run check:boundaries` | pass | included in `verify:fast` |
| `npm run typecheck` (all workspaces) | pass | included in `verify:fast` |
| `npm test` (vitest) | **154 files / 1532 tests pass** | 6.3 s |
| `npm run e2e` (critical, 16 tests) | 16/16 pass | 45.6 s |
| `npm run verify:fast` (whole gate) | **exit 0** | **59.0 s** wall |
| `NOTEFOREST_UI_CONCURRENCY=4 node tests/ui/run.mjs --group shell` | **18/18 suites pass**, 0 pageErrors | 113.5 s |
| `node --test tests/ui/find-bar.test.mjs` | 12/12 pass | 19.7 s |

The full `npm run verify` is the Orchestrator's integration run; this worktree ran `verify:fast`
plus the whole shell UI group.

New unit coverage: shared query → results → current (next/previous/first/last/clamp), the
no-open-state current hit, the clear on the last close, the Search section open/close memory
(including the Outline fallback and the toolbar-stays-open case), unknown-tab rejection, the
`⌘F` focus request, the session `search` value (persist, legacy, unknown) and the snippet split
(ellipses, repeated word nearest the engine offset, unlocatable match, whole-field snippet).

New UI coverage: the cluster is inside the 34 px toolbar, 28 px, static, no shadow, after
undo/redo and before the layout controls, never over the note; at 960 × 640 with Page active the
input shrinks and all 12 header controls stay inside the header with no overflow; the Search
section lists Search fourth, shows the count `0`, the idle copy, chapter/block/occurrence rows,
the emphasised match, the two-line clamp (short and long snippet), mono code, the filled current
row, click-to-jump in Continuous Edit, Continuous Read and Page, the shared query/count in both
directions, close → Outline with the toolbar kept, Esc → cleared marks, no document and `.md`
copy with no results and a no-op `⌘F`.

Screenshots: `artifacts/find-surface-v2/` — `bar-with-results.png`, `no-results.png`,
`sidebar-search.png`, `shared-state.png`, `page.png`, `read.png`, `narrow-toolbar.png`,
`no-document.png`, `markdown.png` (plus the v1 `collapsed-hit.png`). `artifacts/` is gitignored,
as for every suite.

## Acceptance criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Cluster in the toolbar, 28 px, no card/shadow/overlay, no row-height change; Continuous and Page, Edit and Read | **pass** | geometry UI case (inside header, `position: static`, `box-shadow: none`, header 34 px, no note overlap); Page + Continuous Read cases |
| `Esc` restores selection and focus; all keys/highlights as v1 | **pass** | the seven v1 cases still pass unchanged in behaviour; `⌘F`, `Esc`, `↵`/`⇧↵`, `⌘G`/`⌘⇧G`, `↑`/`↓`, `Home`/`End`, Tab |
| Search is in the activity bar, persists as `search`, parser accepts it, replaces the Outline, close returns | **pass** | tablist 4 tabs + UI case + unit store/session cases |
| Chapter groups, block title, one two-line snippet per occurrence, emphasised match, filled current row, click jumps | **pass** | sidebar UI case (rows = occurrences, clamp, mono, filled row, jump) |
| Query/results/current shared both directions | **pass** | sidebar → toolbar and toolbar → sidebar assertions; one controller, one scan |
| No document and `.md` states; Read mode; no pageerror | **pass** | states case + suite `pageErrors` assertion |
| `verify:fast` green; `test:ui:shell` green; screenshots | **pass** | table above |
| No schema/settings/Page/PDF/library change | **pass** | only shell/session UI, no document, settings, Page geometry or PDF files touched |

## Risks and open items

- **Copy.** `Chapter title` (block title for a chapter hit), `Type to search this note.`,
  `Search this note` (placeholder) and `Refine the search` are provisional; the copy sweep owns
  them. The sidebar palette button still reads “Search ⌘K” next to the Search section icon, which
  is confusing; renaming the palette entry is copy-sweep work, not this brief.
- **Count copy.** The sidebar header shows the occurrence count (`1 of 4`) and `0` when there is
  no result, with a `No results` empty line when a query matches nothing (design §3 and §7 read
  differently; the brief says “count”).
- **Focus on section open.** Selecting Search with the keyboard keeps focus on the activity-bar
  tab (the ARIA tablist contract, which the existing suite asserts); the field is one Tab away and
  available by click. Autofocusing the field would break the roving tablist order, so it was not
  done. `⌘F` remains the keyboard fast path.
- **Toolbar width.** At the minimum window (960 × 640) with Page controls, the input shrinks to
  ~60–90 px and every control stays visible (measured). At the *panel* minimum (480 px, reachable
  only by dragging the split) the fixed cluster parts (count + three buttons ≈ 124 px) plus the
  Page controls cannot all fit; the cluster's input would reach zero. This is outside the brief's
  “minimum window” stop condition and is the same class of limit the Page header already had.
- **ARIA announcements.** With both surfaces open, both the toolbar count and the sidebar count
  are `aria-live="polite"` and announce the same change; a follow-up could gate one on focus.
- **Design doc.** `docs/design/find-bar.md` still describes the bar as floating and the search
  section as a follow-up; updating it belongs to the Orchestrator/docs role, not the Builder.
- **Truncation.** The 100-occurrence cap shows `100+` in the toolbar and `Refine the search` at the
  end of the sidebar list; no UI case asserts it (not in the brief's list).

## Next step

Targeted Sentinel review of this diff (toolbar geometry, the shared controller, section restore),
then the copy sweep for the sidebar palette label and the new strings. The Page exact-word
highlight remains the separate follow-up.
