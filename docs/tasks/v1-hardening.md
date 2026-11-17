# VH1 — v1 hardening: the page controls in the canvas header, and the table-cell guard

**Role:** Builder
**Milestone:** v1 hardening
**Base:** `main` at launch (the docs commit that adds this brief).
**Worktree:** created by the Orchestrator, branch `t3/v1-hardening`.
**Timebox:** 3 hours.

## Context

Two items, both recorded.

1. **The pager and the zoom are in the wrong bar.** `PagePosition` and `ZoomControls` render inside
   `Toolbar.tsx`, which is the **44 px top bar** (tab strip + palette). They are canvas tools and belong in
   `CanvasHeader.tsx`, the 34 px strip inside the canvas, next to undo/redo, Export, the find cluster and
   the layout/mode segments. The design said "in the toolbar next to the zoom", and in this codebase
   "Toolbar" is the top bar: the wrong word on my side, not a builder error.
2. **The legacy rich-cell projection must go** (`docs/tasks/table-cell-guard.md` has the full analysis).
   `lib/table-cell.ts` flattens a cell with block content into an inline-only one on load, and the first
   edit persists the flattened version. No such file exists — the app never shipped — so the projection
   protects nobody and its only reachable effect is silent data loss.

## Part A — page controls move to the canvas header

- `Toolbar.tsx` keeps **only** the tab strip and the palette button (plus `+`, overflow).
- `CanvasHeader.tsx` gains `PagePosition` and `ZoomControls`, in this order on the right side:
  `… [find cluster] … [pager] [zoom] [layout/mode segments]`.
- Both disappear on a Markdown guest file, exactly as today.
- Bar heights do not change (44 px toolbar, 34 px canvas header) and the canvas header stays a sibling of
  the scroll container.
- Width: at the minimum window width the find input shrinks first (existing rule); the pager and the zoom
  must not clip the layout/mode segments or push the header to a second line. Prove it with the existing
  narrow-window assertions plus one that asserts both bars keep their height.
- Migrate every selector and screenshot that locates the pager or the zoom inside `[data-toolbar]` to
  `[data-canvas-header]`. Suites touched so far: `page-scroll`, `v0-shell-frame`, `ui-batch-a`,
  `ui-batch-v`, the four visual suites; check `settings-shell-layout` and the find bar's minimum-width
  case too. List every migrated assertion in the report.
- Add one assertion that the **top bar contains no pager and no zoom**, so this cannot drift back.

## Part B — the table-cell guard

As written in `docs/tasks/table-cell-guard.md`; that brief stands, with these reminders:

- Delete the projection in `lib/table-cell.ts` and every call site. If part of it genuinely serves the
  inline-only case, keep only that part and say so.
- A table cell with **block-level content** (more than one paragraph, a list, a code block, a nested
  table, an image, a rule) makes the note open in the existing **unreadable/recovery** state: one short
  line, the raw explanation in `Details`.
- Opening a refused note leaves `document.json` **byte-identical**; the test compares bytes before and
  after.
- An ordinary inline-only table opens, edits, saves and reloads exactly as today.
- Remove the "accepted latent table-cell limitation" sentence from `AGENTS.md` and the coverage matrix.

## Out of scope

- The scroll behaviour, the seam, the zoom semantics, the mount window, the Page Edit overlay, the page
  model, the paginator, the print compositor, the PDF.
- The find, the health, the library, the manual breaks, the settings schema.
- Any new setting or persisted value.

## Files

Read: `docs/design/page-scroll.md` §4, `shell/Toolbar.tsx`, `shell/CanvasHeader.tsx`,
`shell/PagePosition.tsx`, `shell/ViewControls.tsx`, `docs/tasks/table-cell-guard.md`,
`lib/table-cell.ts`, `lib/adapter.ts`, `state/runtime.ts`.

Expected to touch: `shell/Toolbar.tsx`, `shell/CanvasHeader.tsx`, `styles.css` (both bar scopes),
`lib/table-cell.ts` (or its deletion), the adapter/runtime load path, the tests listed above,
`AGENTS.md`, `docs/architecture/test-coverage-matrix.md`, `docs/reports/v1-hardening.md`.

## Acceptance criteria

- [ ] The top bar shows the tab strip and the palette only; the pager and the zoom are in the canvas
      header, right of the find cluster and left of the layout/mode segments.
- [ ] A Markdown guest file shows neither the pager nor the zoom, in either bar.
- [ ] At the minimum window width nothing clips and neither bar changes height.
- [ ] A note with a rich table cell opens refused, with the short line and `Details`, and the file is
      byte-identical afterwards.
- [ ] An inline-only table opens, edits, saves and reloads as before.
- [ ] No code path projects a rich cell into an inline-only one; `AGENTS.md` and the coverage matrix no
      longer describe F2 as an accepted limitation.
- [ ] No regression: seam, zoom states, mount window, Page Edit, find ring, manual breaks, print parity,
      the PDF gate.

## Tests and evidence

- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group page --concurrency 2`,
  `node tests/ui/run.mjs --group shell --concurrency 2`.
- End of task: `npm run verify:fast`.
- Screenshots under `artifacts/v1-hardening/`: the canvas header with pager and zoom, the top bar without
  them, the header at the minimum width, and the refused note with its `Details`.

## Stop and ask

- if the canvas header cannot absorb the pager and the zoom at the minimum width without clipping, say
  what the numbers are and propose what moves instead;
- if the inline-only editor depends on the projection for its own cells;
- if the unreadable state cannot be reached for a document that passes the schema;
- if a suite asserts the top bar's contents in a way that only a redesign could satisfy.

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, migrated assertions, risks, next
step. One commit; do not merge.
