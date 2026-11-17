# VH1 — v1 hardening report (page controls in the canvas header, table-cell guard)

**Role:** Builder
**Branch:** `t3/v1-hardening` (worktree `/Users/luca/.local/share/opencode/worktree/7b776c/v1-hardening`)
**Base:** `main` at `941046a` (the docs commit that adds the brief)
**Brief:** `docs/tasks/v1-hardening.md` (+ `docs/tasks/table-cell-guard.md` for part B)
**Status:** implemented, targeted and fast checks green, **one product decision was needed and is
applied** (see "Stop-and-ask"): the sidebar rails at ≤1120 px.

## Summary

**Part A — the canvas tools moved into the canvas header.**

- `Toolbar.tsx` is now only the tab strip and the palette button (plus `+`/overflow inside the strip).
  `PagePosition` and `ZoomControls` are imported by `CanvasHeader.tsx` and render on the right side in
  the order find cluster → pager → zoom → layout/mode segments. No style value, height, or gap changed;
  the header is still a sibling of the scroll container.
- Both controls disappear on a Markdown guest file because that file has no canvas header at all (its
  34 px strip is `data-markdown-header`, not `data-canvas-header`), and the tests now assert the
  absence app-wide instead of scoping it to `.nf-toolbar`.
- New regression assertions: the 44 px top bar contains **no** `[data-page-position]`, no
  `[data-zoom-value]`, no `[data-zoom-action]` (Continuous seed and Page), and the header order is
  measured left-to-right (`undo < pager < zoom < view`). Both bar heights are asserted (44 / 34).

**Part B — the legacy rich-cell projection is gone; the loader refuses instead.**

- `lib/table-cell.ts` is deleted and its only call site (`contentToPM`'s table-cell branch in
  `lib/adapter.ts`) is removed. Nothing reshapes a table cell any more: `contentToPM` maps every child
  one for one.
- New pure guard `apps/desktop/src/main/table-cell-guard.ts`: it walks a parsed document and reports
  every `tableCell`/`tableHeader` whose children are not exactly one `paragraph` (several paragraphs, a
  list, a code block, a nested table, an image, a rule, a heading, a blockquote, a block formula, an
  empty cell, a cell with no `children`). The message names the block, the dotted path, and the shape.
- `openStore` (`apps/desktop/src/main/library.ts`) runs the guard **before** `repository.open`, so no
  lock, migration, or save can touch the package. A refused package returns the existing
  `RecoveryDocumentView` (`status: 'unreadable'`, short line from `recoveryReasonText`, raw sentence in
  `reasonDetails`/`details`). A document that does not parse is left to the normal open path, which owns
  the corrupt/newer-schema reasons. The check is gated on the raw text mentioning `tableCell`/
  `tableHeader`, so ordinary notes pay one `includes` and no extra parse.
- The inline-only table path is untouched: create, edit, save, reload, and the canonical single-paragraph
  cell shape are covered by a new UI test.

**The rail decision (ratified during this task).** At the 960 px window minimum in Page the canvas header
is 706 px wide; its fixed content (undo/redo 54 + divider 1 + Export 99 + pager 110 + zoom 90 +
layout/mode 120 + padding 12 + gaps 64 = 550 px) left the find cluster 156 px and the input 18 px.
The sidebar now rails at ≤1120 px (`Workspace.tsx`, `NARROW_WINDOW_MAX`), so at 960 the header is 886 px
and the input ~198 px. No control, label, or the 160 px input floor changed.

## Files changed

**Part A**

- `apps/desktop/src/renderer/src/shell/Toolbar.tsx` — tabs + palette only.
- `apps/desktop/src/renderer/src/shell/CanvasHeader.tsx` — pager + zoom, order and doc comment.
- `apps/desktop/src/renderer/src/shell/PagePosition.tsx`, `ViewControls.tsx` — doc comments
  (canvas header, not toolbar).
- `apps/desktop/src/renderer/src/shell/Workspace.tsx` — `NARROW_WINDOW_MAX = 1120` (rail breakpoint).
- `apps/desktop/src/renderer/src/styles.css` — scoped comments only (pager, find, zoom); no value change.
- `apps/desktop/src/renderer/src/App.tsx` — comment (canvas-header pager).
- Find-cluster comments aligned to "canvas header" in `shell/FindBar.tsx`, `shell/FindController.tsx`,
  `shell/SearchSection.tsx`, `state/shell.ts`, `editor/DocumentEditor.tsx` (comments only).

**Part B**

- Deleted `apps/desktop/src/renderer/src/lib/table-cell.ts`.
- `apps/desktop/src/renderer/src/lib/adapter.ts` — projection import + branch removed.
- `apps/desktop/src/renderer/src/editor/tables.ts` — comment (guard, not projection).
- New `apps/desktop/src/main/table-cell-guard.ts`.
- `apps/desktop/src/main/library.ts` — guard call in `openStore`, refusal view, imports.
- `apps/desktop/test/table-cell-guard.test.ts` (new, 13 tests), `apps/desktop/test/special-text.test.ts`
  (the five normalisation tests and the module import removed).

**Tests and docs**

- `tests/ui/v0-shell-frame.test.mjs`, `ui-batch-a.test.mjs`, `find-bar.test.mjs`, `page-scroll.test.mjs`,
  `markdown-file-view.test.mjs`, `vault-library.test.mjs`, `data-recovery.test.mjs`,
  `tests/support/ui-session.mjs`, `tests/visual/{m4b1-page-view,m4b1b1-page-edit-overlay,r2a-page-arrows,r1b-page-density}.test.mjs`.
- `AGENTS.md` (F2 sentence removed, VH1 status with the rail), `docs/architecture/test-coverage-matrix.md`
  (one new row), `docs/design/page-scroll.md` (§3/§9 wording: canvas header), `docs/reports/v1-hardening.md`.

## Checks (with timings)

| Check | Result |
|---|---|
| `npx vitest run` | **163 files / 1669 tests passed**, 8.8 s |
| `node tests/ui/run.mjs --group page --concurrency 2` | **19/19 passed**, 158.4 s |
| `node tests/ui/run.mjs --group shell --concurrency 2` | **23/23 passed**, 225.8 s |
| `node tests/ui/run.mjs --group anchors,images --concurrency 2` (regression for the rail) | **19/19 passed**, 148.6 s |
| `npm run verify:fast` | **exit 0** — boundaries, typecheck (4 workspaces), 163 unit files / 1669 tests, e2e 16/16 in 46.0 s |
| `node --test tests/ui/data-recovery.test.mjs` (part B suite) | 4/4 passed, 16.5 s |

Evidence under `artifacts/v1-hardening/`: `canvas-header-page-controls.png` (header with pager + zoom),
`top-bar-no-page-controls.png` (44 px bar with tabs and palette only), `canvas-header-min-width.png`
(the 960 × 640 window, railed sidebar, find + pager + zoom + layout/mode all mounted),
`refused-rich-table-cell-details.png` (the refused note with `Details` open).

## Pass/fail per criterion

| Criterion | Result |
|---|---|
| Top bar shows the tab strip and the palette only; pager + zoom in the canvas header, right of the find cluster and left of the layout/mode segments | **Pass** — `v0-shell-frame` measures the order; `CanvasHeader.tsx` order; screenshots |
| A Markdown guest file shows neither the pager nor the zoom, in either bar | **Pass** — `markdown-file-view` and `vault-library` assert app-wide absence |
| At the minimum window width nothing clips and neither bar changes height | **Pass** — `find-bar` at 960 × 640: 17/17 controls inside, header 34 px, toolbar 44 px, overflow 0, order preserved; the sidebar rails (ratified) so the input stays ≥160 px |
| A note with a rich table cell opens refused, with the short line and `Details`, and the file is byte-identical | **Pass** — `data-recovery` "refuses a rich cell …": unreadable status, no editor, reason `The file isn’t valid NoteForest data.`, raw sentence in `Details`, `Buffer.compare(before, after) === 0` after 1.2 s |
| An inline-only table opens, edits, saves and reloads as before | **Pass** — `data-recovery` "opens, edits, saves and reloads …": canonical cell stays one paragraph, edit persists, relaunch shows it, second edit saves again |
| No code path projects a rich cell; AGENTS/matrix no longer describe F2 as accepted | **Pass** — `table-cell.ts` gone, no projection call site, AGENTS sentence removed, matrix row replaced (the matrix never carried the F2 sentence; verified with a repo-wide search) |
| No regression: seam, zoom states, mount window, Page Edit, find ring, manual breaks, print parity, the PDF gate | **Pass** — page group 19/19 (page-scroll, Page Edit, print compositor, PDF gate), anchors/images 19/19, unit suite green |

## Stop-and-ask (triggered and resolved)

The first bullet of **Stop and ask** fired: the canvas header cannot absorb the pager and the zoom at the
960 px window minimum while keeping the pre-existing 160 px find-input floor. Numbers, measured in Page at
960 × 640 with the sidebar expanded (228 px): header 706 px; fixed undo/redo 54, divider 1, Export 99,
pager 110, zoom 90, layout/mode 120, padding 12, gaps 64 = 550; find cluster 156 → input 18 px.
Continuous was fine (input 222 px). The shortfall to the floor was 142 px, and no single label
compaction covered it.

The product owner chose **rail the sidebar at ≤1120 px** and keep every control, label, and the 160 px
floor. Implemented as `NARROW_WINDOW_MAX` in `Workspace.tsx`; at 960 the header is 886 px and the input
~198 px. `find-bar` now also asserts the 48 px rail at the app minimum. Effects: the tab strip and the
canvas are 180 px wider at any window ≤1120 (all suites at 960 re-run green); the tab-floor test reaches
its pressure with eight tabs instead of five, since the bar has more room.

## Migrated assertions (pager/zoom moved out of `[data-toolbar]`)

1. `tests/support/ui-session.mjs` — `gotoPage`: `.nf-toolbar [data-page-position][ready]` →
   `.nf-canvas-header …` (the shared page-jump helper used by many suites).
2. `tests/ui/page-scroll.test.mjs` — `surface()` pager root, `pagerState()` root, `waitPagerValue()`
   input, the focused-input locator: four `.nf-toolbar [data-page-position*]` → `.nf-canvas-header …`;
   three comments.
3. `tests/ui/v0-shell-frame.test.mjs` — Page pager locator replaced by `header.locator('[data-page-position]')`;
   the top-bar block gains "no pager / no zoom" and "canvas header owns the zoom"; the Page block gains
   the pager→zoom→view order measurement and the top-bar negatives; `[data-page-fit]` absence retargeted
   to the fit **control** (the attribute is now the zoom group's state — keeping the old selector would
   forbid the zoom in the header) and "the Page surface has no zoom buttons" scoped to `.nf-page-scroll`
   (the header is inside `.nf-page-view`); two new screenshots.
4. `tests/ui/ui-batch-a.test.mjs` — `.nf-toolbar [data-zoom-value|out|in]` → `.nf-canvas-header …` plus
   three top-bar negatives; the pager locator → `.nf-canvas-header`; the tab-floor fixture widened from
   five to eight tabs at 960 (the rail gives the strip more room; every floor assertion unchanged).
5. `tests/ui/find-bar.test.mjs` — the minimum-width control set extended from 10 to 17 elements (pager
   arrows/field/total, zoom out/value/in), toolbar 44 px and header 34 px asserted, find→pager→zoom→view
   order asserted, top bar asserted empty of canvas tools, 48 px rail + input ≥160 at 960, new
   `artifacts/v1-hardening/canvas-header-min-width.png`.
6. `tests/ui/markdown-file-view.test.mjs` — `.nf-toolbar [data-page-position]` = 0 replaced by an app-wide
   `[data-page-position]` = 0 **and** `[data-zoom-value]` = 0 and `[data-markdown-header] [data-zoom-value]`
   = 0 (stronger: no bar may carry them).
7. `tests/ui/vault-library.test.mjs` — same upgrade (pager + zoom absent on a `.md` guest view).
8. `tests/visual/m4b1-page-view.test.mjs`, `tests/visual/m4b1b1-page-edit-overlay.test.mjs`,
   `tests/visual/r2a-page-arrows.test.mjs`, `tests/visual/r1b-page-density.test.mjs` — pager input
   selectors → `.nf-canvas-header …`; two comments.
9. `tests/ui/m2-view.test.mjs` and `tests/e2e/m2-editor.test.mjs` needed no selector change (they use
   unscoped `[data-zoom-value]`); both re-ran green, including Fit width at 960 with the rail.

No assertion was weakened: every migrated selector moved to the new owner, the top-bar negatives were
added next to the old positive assertions, and the Pages that only counted controls inside
`.nf-toolbar` now assert the same count inside `.nf-canvas-header`.

## Risks / follow-ups

- **Library row state.** A rich-cell note still lists as an ordinary row (the tree's status comes from
  `packages/core`'s parse, which is unchanged); clicking it opens the recovery surface. Making the row
  say "unreadable" needs the guard inside core's vault scan — a core-boundary decision, deliberately not
  taken here (`table-cell-guard.md`'s stop-and-ask: the guard is app-boundary because the file is
  spec-valid data).
- **Rail at ≤1120** is a visible shell change at laptop widths; it is the ratified resolution of the
  stop-and-ask, recorded in `AGENTS.md` and this report. `docs/design/ui-shell-contents.md` still says
  `<760 px` (stale before this task, design-doc territory) — a one-line UX-doc follow-up.
- **Part B** refuses any cell that is not exactly one paragraph, including an empty cell or a cell with
  no `children`: the editor cannot represent those without a projection, and an old-style empty cell is
  not produced by any current path.
- The refused note is not added to recents (same as other unreadable packages: `registerRecent` only runs
  after a successful parse-and-open).

## Next step

One commit on `t3/v1-hardening`; do not merge. The Sentinel should review the `Workspace.tsx` rail
constant together with the `find-bar` minimum-width numbers (they are the only behavioural change beyond
the two parts of the brief).
