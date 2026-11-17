# TC1 — Remove the legacy rich-cell projection, guard the load instead

**Role:** Builder
**Milestone:** v1 hardening
**Base:** `main` at launch (after the unused-images half of the data batch).
**Worktree:** created by the Orchestrator, branch `t3/table-cell-guard`.
**Timebox:** 60 minutes.

## Context

`apps/desktop/src/renderer/src/lib/table-cell.ts` projects a **rich** table cell (several paragraphs, a
list, a code block, an image) into the editor's inline-only cell on load; the first edit of that table
then persists the flattened version. It exists for documents that predate the inline-only tables
(special-text batch `f6fcb65`).

Those documents **do not exist**: the app has never been distributed, and the product owner's files were
all created after the change. So the projection protects a population of zero, and its only reachable
effect is to silently destroy content if such a cell ever appears anyway (a hand-copied file, an old
backup, a future build).

Decision (17 November 2026): **delete the projection; refuse loudly instead.** Silent flattening is the
worst of the three options — worse than refusing, and worse than the code not existing.

## Goal

No code path rewrites a table cell into a different shape, and a document containing a cell the editor
cannot represent opens in the existing unreadable-package state instead of being silently flattened.

## In scope

1. **Delete** the projection in `lib/table-cell.ts` and every call site (the adapter/runtime paths that
   normalize on load). If any of them also serves a legitimate purpose for inline-only cells, keep that
   part and say so in the report.
2. **Guard at load**: when a document's table cell contains block-level content (more than one
   paragraph, a list, a code block, a nested table, an image, a rule), the note opens in the existing
   **unreadable/recovery** state with one short line and the raw explanation in `Details`, through the
   same boundary mapping the core reasons now use.
3. **Never write**: opening a refused note must leave the file byte-identical. The test must compare the
   bytes before and after, the way the recovery suites already do.
4. **Tests**: a unit test for the detection (one case per block-level kind), a UI test that a package
   with one such cell opens refused, shows the short line with `Details`, and leaves `document.json`
   unchanged; and a test that an ordinary inline-only table still opens and edits exactly as today.
5. **Docs**: remove the F2 paragraph from `AGENTS.md`'s status and from the test-coverage matrix
   ("accepted latent table-cell limitation" no longer exists); note the guard where the loader is
   documented. `docs/reports/table-cell-guard.md`.

## Out of scope

- Supporting rich cells, migrating them, rendering them, or changing the schema.
- The table editing UI, the picker, the toolbar, paste.
- Any change to the recovery surface's design; reuse it.
- Anything on the Page, the find, Health, the library.

## Files

Read: `apps/desktop/src/renderer/src/lib/table-cell.ts`, its call sites (`lib/adapter.ts`,
`state/runtime.ts`), the recovery state plumbing (`RecoverySurface`, `main/core-reasons.ts`),
`docs/reviews/post-settings-library-special-text-review.md` F2.

Expected to touch: `lib/table-cell.ts` (or its deletion), the adapter/runtime load path, the load-time
validation, the tests, `AGENTS.md`, `docs/architecture/test-coverage-matrix.md`,
`docs/reports/table-cell-guard.md`.

## Acceptance criteria

- [ ] No code path projects a rich cell into an inline-only one; the function and its tests are gone or
      reduced to what is genuinely still used.
- [ ] A package with a rich cell opens in the unreadable state, with a short line and the raw reason in
      `Details`; `document.json` is byte-identical afterwards.
- [ ] An inline-only table (the only kind the app produces) opens, edits, saves and reloads exactly as
      before.
- [ ] `AGENTS.md` and the coverage matrix no longer describe F2 as an accepted limitation.
- [ ] No regression: tables, recovery, the library, the find, Page/PDF.

## Tests and evidence

- Targeted: `npx vitest run`, `node tests/ui/run.mjs --group shell,anchors --concurrency 2`.
- End of task: `npm run verify:fast`.
- Do not run `npm run verify`.
- Evidence: the byte comparison in the UI test is the evidence; screenshots only if the refusal shows a
  new surface.

## Stop and ask

- if the inline-only editor depends on the projection for its **own** cells, so deleting it breaks
  normal tables;
- if the unreadable state cannot be reached for a document that passes the schema;
- if the guard belongs in `packages/core` rather than at the app boundary (say which and why).

## Report format

Summary, files changed, checks with timings, pass/fail per criterion, risks, next step. One commit; do
not merge.
